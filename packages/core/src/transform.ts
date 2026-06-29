import { makeColumn, columnToFloat64 } from "./stats.js";
import { createColumnarTable, getValue, type ColumnarTable } from "./types.js";
import { valueToLabel } from "./profile.js";

export type TransformStep =
  | ClipStep
  | ZScoreStep
  | RankStep
  | LogStep;

export interface BaseTransformStep {
  field: string;
  output: string;
  groupBy?: string[];
  enabled?: boolean;
}

export interface ClipStep extends BaseTransformStep {
  type: "clip";
  lower?: number;
  upper?: number;
  lowerQuantile?: number;
  upperQuantile?: number;
}

export interface ZScoreStep extends BaseTransformStep {
  type: "zscore";
}

export interface RankStep extends BaseTransformStep {
  type: "rank";
  method?: "ordinal" | "average" | "dense" | "percentile";
  ascending?: boolean;
}

export interface LogStep extends BaseTransformStep {
  type: "log";
  base?: "e" | 10 | 2;
  offset?: number;
}

export interface TransformStepDiagnostics {
  stepIndex: number;
  type: TransformStep["type"];
  field: string;
  output: string;
  inputRows: number;
  outputRows: number;
  warnings: string[];
}

export interface TransformPipelineDiagnostics {
  inputRows: number;
  outputRows: number;
  steps: TransformStepDiagnostics[];
  warnings: string[];
}

export interface TransformPipelineResult {
  table: ColumnarTable;
  diagnostics: TransformPipelineDiagnostics;
}

export function applyTransformPipeline(
  table: ColumnarTable,
  steps: readonly TransformStep[]
): TransformPipelineResult {
  let workingTable = table;
  const diagnostics: TransformStepDiagnostics[] = [];
  const warnings: string[] = [];

  steps.forEach((step, stepIndex) => {
    if (step.enabled === false) {
      return;
    }
    const result = executeStep(workingTable, step, stepIndex);
    diagnostics.push(result.diagnostics);
    warnings.push(...result.diagnostics.warnings);
    workingTable = appendColumn(workingTable, result.output, step.output);
  });

  return {
    table: workingTable,
    diagnostics: {
      inputRows: table.rowCount,
      outputRows: workingTable.rowCount,
      steps: diagnostics,
      warnings
    }
  };
}

export function suggestTransformOutputName(step: Omit<TransformStep, "output">): string {
  if (step.type === "zscore") {
    return `${step.field}_z`;
  }
  if (step.type === "clip") {
    return `${step.field}_clip`;
  }
  if (step.type === "rank") {
    return `${step.field}_rank`;
  }
  return `log_${step.field}`;
}

function executeStep(
  table: ColumnarTable,
  step: TransformStep,
  stepIndex: number
): { output: Float64Array; diagnostics: TransformStepDiagnostics } {
  const warnings: string[] = [];
  const column = table.getColumn(step.field);
  if (!column) {
    warnings.push(`预处理字段不存在: ${step.field}`);
    return {
      output: new Float64Array(table.rowCount).fill(Number.NaN),
      diagnostics: createStepDiagnostics(table, step, stepIndex, warnings)
    };
  }

  const values = columnToFloat64(column);
  const groups = groupRows(table, step.groupBy ?? [], warnings);
  let output: Float64Array;

  if (step.type === "clip") {
    output = runClip(values, groups, step, warnings);
  } else if (step.type === "zscore") {
    output = runZScore(values, groups, warnings);
  } else if (step.type === "rank") {
    output = runRank(values, groups, step, warnings);
  } else if (step.type === "log") {
    output = runLog(values, step, warnings);
  } else {
    throw new Error(`不支持的预处理类型: ${(step as { type: string }).type}`);
  }

  return {
    output,
    diagnostics: createStepDiagnostics(table, step, stepIndex, warnings)
  };
}

function runClip(
  values: Float64Array,
  groups: Map<string, number[]>,
  step: ClipStep,
  warnings: string[]
): Float64Array {
  const output = new Float64Array(values.length).fill(Number.NaN);
  for (const indices of groups.values()) {
    const finite = indices.map((index) => values[index]).filter(Number.isFinite).sort((a, b) => a - b);
    if (finite.length === 0) {
      warnings.push(`clip 分组没有有效数值: ${step.field}`);
      continue;
    }
    const lower = step.lower ?? (
      step.lowerQuantile != null ? quantileSorted(finite, step.lowerQuantile) : Number.NEGATIVE_INFINITY
    );
    const upper = step.upper ?? (
      step.upperQuantile != null ? quantileSorted(finite, step.upperQuantile) : Number.POSITIVE_INFINITY
    );
    for (const index of indices) {
      const value = values[index];
      output[index] = Number.isFinite(value)
        ? Math.min(upper, Math.max(lower, value))
        : Number.NaN;
    }
  }
  return output;
}

function runZScore(
  values: Float64Array,
  groups: Map<string, number[]>,
  warnings: string[]
): Float64Array {
  const output = new Float64Array(values.length).fill(Number.NaN);
  for (const indices of groups.values()) {
    const finite = indices.map((index) => values[index]).filter(Number.isFinite);
    if (finite.length === 0) {
      warnings.push("z-score 分组没有有效数值");
      continue;
    }
    const mean = finite.reduce((sum, value) => sum + value, 0) / finite.length;
    const variance = finite.reduce((sum, value) => sum + (value - mean) ** 2, 0) / finite.length;
    const std = Math.sqrt(variance);
    if (std === 0) {
      warnings.push("z-score 分组标准差为 0，输出 0");
    }
    for (const index of indices) {
      const value = values[index];
      output[index] = Number.isFinite(value)
        ? (std === 0 ? 0 : (value - mean) / std)
        : Number.NaN;
    }
  }
  return output;
}

function runRank(
  values: Float64Array,
  groups: Map<string, number[]>,
  step: RankStep,
  warnings: string[]
): Float64Array {
  const output = new Float64Array(values.length).fill(Number.NaN);
  const method = step.method ?? "percentile";
  const direction = step.ascending === false ? -1 : 1;

  for (const indices of groups.values()) {
    const pairs = indices
      .filter((index) => Number.isFinite(values[index]))
      .map((index) => ({ index, value: values[index] }))
      .sort((a, b) => direction * (a.value - b.value));
    if (pairs.length === 0) {
      warnings.push("rank 分组没有有效数值");
      continue;
    }
    if (pairs.length === 1) {
      output[pairs[0].index] = method === "percentile" ? 0.5 : 1;
      continue;
    }

    let denseRank = 1;
    for (let start = 0; start < pairs.length;) {
      let end = start + 1;
      while (end < pairs.length && pairs[end].value === pairs[start].value) {
        end += 1;
      }
      const ordinalRank = start + 1;
      const averageRank = (start + 1 + end) / 2;
      const value = method === "dense"
        ? denseRank
        : method === "ordinal"
          ? ordinalRank
          : method === "average"
            ? averageRank
            : (averageRank - 1) / (pairs.length - 1);
      for (let offset = start; offset < end; offset += 1) {
        output[pairs[offset].index] = value;
      }
      denseRank += 1;
      start = end;
    }
  }
  return output;
}

function runLog(values: Float64Array, step: LogStep, warnings: string[]): Float64Array {
  const output = new Float64Array(values.length).fill(Number.NaN);
  const offset = step.offset ?? 0;
  const denominator = step.base === 10 ? Math.LN10 : step.base === 2 ? Math.LN2 : 1;
  let invalidCount = 0;

  for (let index = 0; index < values.length; index += 1) {
    const shifted = values[index] + offset;
    if (!Number.isFinite(shifted) || shifted <= 0) {
      invalidCount += 1;
      output[index] = Number.NaN;
      continue;
    }
    output[index] = Math.log(shifted) / denominator;
  }

  if (invalidCount > 0) {
    warnings.push(`log 有 ${invalidCount} 行不是正数，输出 NaN`);
  }
  return output;
}

function groupRows(
  table: ColumnarTable,
  groupBy: readonly string[],
  warnings: string[]
): Map<string, number[]> {
  const groups = new Map<string, number[]>();
  const groupColumns = groupBy.map((field) => {
    const column = table.getColumn(field);
    if (!column) {
      warnings.push(`分组字段不存在: ${field}`);
    }
    return column;
  });

  for (let rowIndex = 0; rowIndex < table.rowCount; rowIndex += 1) {
    const key = groupColumns.length === 0
      ? "__all__"
      : groupColumns.map((column) => column ? valueToLabel(getValue(column.values, rowIndex)) : "").join("\u001f");
    const indices = groups.get(key);
    if (indices) {
      indices.push(rowIndex);
    } else {
      groups.set(key, [rowIndex]);
    }
  }
  return groups;
}

function appendColumn(table: ColumnarTable, values: Float64Array, name: string): ColumnarTable {
  const existing = table.columns.filter((column) => column.name !== name);
  return createColumnarTable({
    name: table.name,
    rowCount: table.rowCount,
    columns: [
      ...existing,
      makeColumn({ name, values, kind: "number" })
    ]
  });
}

function createStepDiagnostics(
  table: ColumnarTable,
  step: TransformStep,
  stepIndex: number,
  warnings: string[]
): TransformStepDiagnostics {
  return {
    stepIndex,
    type: step.type,
    field: step.field,
    output: step.output,
    inputRows: table.rowCount,
    outputRows: table.rowCount,
    warnings: [...new Set(warnings)]
  };
}

function quantileSorted(values: number[], quantile: number): number {
  if (values.length === 0) {
    return Number.NaN;
  }
  const clamped = Math.min(1, Math.max(0, quantile));
  const position = (values.length - 1) * clamped;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) {
    return values[lower];
  }
  const weight = position - lower;
  return values[lower] * (1 - weight) + values[upper] * weight;
}
