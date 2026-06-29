import {
  type ColumnKind,
  type ColumnValues,
  type ColumnarTable,
  type DataColumn,
  type NumericStats,
  getLength,
  getValue
} from "./types.js";

export function isTypedNumericArray(values: ColumnValues): boolean {
  return ArrayBuffer.isView(values) && !(values instanceof DataView);
}

export function toNumber(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : Number.NaN;
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  }
  return Number.NaN;
}

export function inferColumnKind(values: ColumnValues, scanLimit = 1000): ColumnKind {
  const length = getLength(values);
  const limit = Math.min(length, scanLimit);
  let numberCount = 0;
  let stringCount = 0;
  let booleanCount = 0;
  let dateCount = 0;
  let knownCount = 0;

  if (isTypedNumericArray(values)) {
    return "number";
  }

  for (let index = 0; index < limit; index += 1) {
    const value = getValue(values, index);
    if (value == null || value === "") {
      continue;
    }
    knownCount += 1;
    if (typeof value === "number" || typeof value === "bigint") {
      numberCount += 1;
    } else if (typeof value === "boolean") {
      booleanCount += 1;
    } else if (value instanceof Date) {
      dateCount += 1;
    } else if (typeof value === "string") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        numberCount += 1;
      } else {
        stringCount += 1;
      }
    }
  }

  if (knownCount === 0) {
    return "unknown";
  }
  if (numberCount / knownCount >= 0.9) {
    return "number";
  }
  if (booleanCount / knownCount >= 0.9) {
    return "boolean";
  }
  if (dateCount / knownCount >= 0.9) {
    return "date";
  }
  if (stringCount > 0) {
    return "string";
  }
  return "unknown";
}

export function computeNumericStats(values: ColumnValues): NumericStats {
  const length = getLength(values);
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let sum = 0;
  let finiteCount = 0;
  let nullCount = 0;

  for (let index = 0; index < length; index += 1) {
    const numeric = toNumber(getValue(values, index));
    if (Number.isFinite(numeric)) {
      min = Math.min(min, numeric);
      max = Math.max(max, numeric);
      sum += numeric;
      finiteCount += 1;
    } else {
      nullCount += 1;
    }
  }

  if (finiteCount === 0) {
    return {
      min: 0,
      max: 0,
      mean: 0,
      finiteCount: 0,
      nullCount
    };
  }

  return {
    min,
    max,
    mean: sum / finiteCount,
    finiteCount,
    nullCount
  };
}

export function makeColumn(options: {
  name: string;
  values: ColumnValues;
  kind?: ColumnKind;
  typeLabel?: string;
}): DataColumn {
  const kind = options.kind ?? inferColumnKind(options.values);
  const stats = kind === "number" || kind === "boolean" || kind === "date" || kind === "datetime"
    ? computeNumericStats(options.values)
    : undefined;

  return {
    name: options.name,
    kind,
    values: options.values,
    stats,
    typeLabel: options.typeLabel
  };
}

export function columnToFloat64(column: DataColumn): Float64Array {
  const length = getLength(column.values);
  const result = new Float64Array(length);

  for (let index = 0; index < length; index += 1) {
    result[index] = toNumber(getValue(column.values, index));
  }

  return result;
}

export function getNumericColumns(table: ColumnarTable): DataColumn[] {
  return table.columns.filter((column) => column.stats && column.stats.finiteCount > 0);
}

export function getNumericColumnNames(table: ColumnarTable): string[] {
  return getNumericColumns(table).map((column) => column.name);
}

export function statsFromFloat64(values: Float64Array): NumericStats {
  return computeNumericStats(values);
}

export function scaleToUnit(value: number, stats: NumericStats, halfRange = 1): number {
  const range = stats.max - stats.min;
  if (!Number.isFinite(value) || range === 0) {
    return 0;
  }
  return ((value - stats.min) / range - 0.5) * 2 * halfRange;
}
