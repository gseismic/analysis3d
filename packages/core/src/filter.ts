import { makeColumn, toNumber } from "./stats.js";
import { createColumnarTable, getValue, type ColumnValues, type ColumnarTable } from "./types.js";
import { isNullLike, parseTimeValue, valueToLabel } from "./profile.js";

export type FilterSpec =
  | NumericRangeFilter
  | CategoryFilter
  | TimeRangeFilter
  | NullFilter
  | FilterGroup;

export interface NumericRangeFilter {
  type: "numberRange";
  field: string;
  min?: number;
  max?: number;
  includeMin?: boolean;
  includeMax?: boolean;
  enabled?: boolean;
}

export interface CategoryFilter {
  type: "category";
  field: string;
  op: "in" | "notIn";
  values: string[];
  enabled?: boolean;
}

export interface TimeRangeFilter {
  type: "timeRange";
  field: string;
  start?: string;
  end?: string;
  enabled?: boolean;
}

export interface NullFilter {
  type: "null";
  field: string;
  op: "isNull" | "isNotNull";
  enabled?: boolean;
}

export interface FilterGroup {
  type: "group";
  op: "and" | "or";
  filters: FilterSpec[];
  enabled?: boolean;
}

export interface FilterDiagnostics {
  inputRows: number;
  outputRows: number;
  droppedRows: number;
  activeFilters: number;
  warnings: string[];
}

export interface FilterResult {
  table: ColumnarTable;
  mask: Uint8Array;
  diagnostics: FilterDiagnostics;
}

type RowEvaluator = (rowIndex: number) => boolean;

export function applyFilters(table: ColumnarTable, filters: readonly FilterSpec[]): FilterResult {
  const warnings: string[] = [];
  const mask = evaluateFilterMask(table, filters, warnings);
  const outputRows = countMask(mask);
  return {
    table: materializeRows(table, mask, `${table.name ?? "table"}_filtered`),
    mask,
    diagnostics: {
      inputRows: table.rowCount,
      outputRows,
      droppedRows: table.rowCount - outputRows,
      activeFilters: countActiveFilters(filters),
      warnings
    }
  };
}

export function evaluateFilterMask(
  table: ColumnarTable,
  filters: readonly FilterSpec[],
  warnings: string[] = []
): Uint8Array {
  const evaluator = compileFilterList(table, filters, warnings);
  const mask = new Uint8Array(table.rowCount);
  for (let rowIndex = 0; rowIndex < table.rowCount; rowIndex += 1) {
    mask[rowIndex] = evaluator(rowIndex) ? 1 : 0;
  }
  return mask;
}

export function materializeRows(
  table: ColumnarTable,
  mask: Uint8Array,
  name = table.name
): ColumnarTable {
  const columns = table.columns.map((column) => makeColumn({
    name: column.name,
    values: subsetValues(column.values, mask),
    kind: column.kind,
    typeLabel: column.typeLabel
  }));
  return createColumnarTable({ name, columns });
}

function compileFilterList(
  table: ColumnarTable,
  filters: readonly FilterSpec[],
  warnings: string[]
): RowEvaluator {
  const evaluators = filters.filter(isEnabled).map((filter) => compileFilter(table, filter, warnings));
  return (rowIndex) => evaluators.every((evaluator) => evaluator(rowIndex));
}

function compileFilter(
  table: ColumnarTable,
  filter: FilterSpec,
  warnings: string[]
): RowEvaluator {
  if (filter.type === "group") {
    const evaluators = filter.filters
      .filter(isEnabled)
      .map((entry) => compileFilter(table, entry, warnings));
    if (filter.op === "or") {
      return evaluators.length === 0
        ? () => true
        : (rowIndex) => evaluators.some((evaluator) => evaluator(rowIndex));
    }
    return (rowIndex) => evaluators.every((evaluator) => evaluator(rowIndex));
  }

  const column = table.getColumn(filter.field);
  if (!column) {
    pushUnique(warnings, `筛选字段不存在: ${filter.field}`);
    return () => true;
  }

  if (filter.type === "numberRange") {
    return (rowIndex) => {
      const numeric = toNumber(getValue(column.values, rowIndex));
      if (!Number.isFinite(numeric)) {
        return false;
      }
      if (filter.min != null) {
        const ok = filter.includeMin === false ? numeric > filter.min : numeric >= filter.min;
        if (!ok) {
          return false;
        }
      }
      if (filter.max != null) {
        const ok = filter.includeMax === false ? numeric < filter.max : numeric <= filter.max;
        if (!ok) {
          return false;
        }
      }
      return true;
    };
  }

  if (filter.type === "category") {
    const values = new Set(filter.values);
    return (rowIndex) => {
      const hasValue = values.has(valueToLabel(getValue(column.values, rowIndex)));
      return filter.op === "notIn" ? !hasValue : hasValue;
    };
  }

  if (filter.type === "timeRange") {
    const start = parseStartBound(filter.start, warnings);
    const end = parseEndBound(filter.end, warnings);
    return (rowIndex) => {
      const time = parseTimeValue(getValue(column.values, rowIndex));
      if (!Number.isFinite(time)) {
        return false;
      }
      if (start != null && time < start) {
        return false;
      }
      if (end && (end.exclusive ? time >= end.time : time > end.time)) {
        return false;
      }
      return true;
    };
  }

  if (filter.type === "null") {
    return (rowIndex) => {
      const nullValue = isNullLike(getValue(column.values, rowIndex));
      return filter.op === "isNull" ? nullValue : !nullValue;
    };
  }

  return () => true;
}

function subsetValues(values: ColumnValues, mask: Uint8Array): ColumnValues {
  if (values instanceof Float64Array) {
    return subsetTyped(values, mask, Float64Array);
  }
  if (values instanceof Float32Array) {
    return subsetTyped(values, mask, Float32Array);
  }
  if (values instanceof Int32Array) {
    return subsetTyped(values, mask, Int32Array);
  }
  if (values instanceof Uint32Array) {
    return subsetTyped(values, mask, Uint32Array);
  }
  if (values instanceof Int16Array) {
    return subsetTyped(values, mask, Int16Array);
  }
  if (values instanceof Uint16Array) {
    return subsetTyped(values, mask, Uint16Array);
  }
  if (values instanceof Int8Array) {
    return subsetTyped(values, mask, Int8Array);
  }
  if (values instanceof Uint8Array) {
    return subsetTyped(values, mask, Uint8Array);
  }
  if (values instanceof BigInt64Array) {
    return subsetTyped(values, mask, BigInt64Array);
  }
  if (values instanceof BigUint64Array) {
    return subsetTyped(values, mask, BigUint64Array);
  }

  const selected: unknown[] = [];
  for (let index = 0; index < mask.length; index += 1) {
    if (mask[index]) {
      selected.push(getValue(values, index));
    }
  }
  return selected;
}

function subsetTyped<T extends ArrayBufferView>(
  values: T & { readonly length: number },
  mask: Uint8Array,
  constructor: { new(length: number): T & { [index: number]: unknown; readonly length: number } }
): T {
  const output = new constructor(countMask(mask));
  const source = values as unknown as { [index: number]: unknown };
  let offset = 0;
  for (let index = 0; index < mask.length; index += 1) {
    if (mask[index]) {
      output[offset] = source[index];
      offset += 1;
    }
  }
  return output;
}

function countMask(mask: Uint8Array): number {
  let count = 0;
  for (const value of mask) {
    count += value;
  }
  return count;
}

function countActiveFilters(filters: readonly FilterSpec[]): number {
  let count = 0;
  for (const filter of filters) {
    if (!isEnabled(filter)) {
      continue;
    }
    if (filter.type === "group") {
      count += countActiveFilters(filter.filters);
    } else {
      count += 1;
    }
  }
  return count;
}

function isEnabled(filter: FilterSpec): boolean {
  return filter.enabled !== false;
}

function pushUnique(warnings: string[], warning: string): void {
  if (!warnings.includes(warning)) {
    warnings.push(warning);
  }
}

function parseStartBound(value: string | undefined, warnings: string[]): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    pushUnique(warnings, `时间筛选 start 无法解析: ${value}`);
    return undefined;
  }
  return parsed;
}

function parseEndBound(
  value: string | undefined,
  warnings: string[]
): { time: number; exclusive: boolean } | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    pushUnique(warnings, `时间筛选 end 无法解析: ${value}`);
    return undefined;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return {
      time: parsed + 24 * 60 * 60 * 1000,
      exclusive: true
    };
  }
  return {
    time: parsed,
    exclusive: false
  };
}
