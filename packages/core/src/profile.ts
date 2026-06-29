import type { ColumnKind, ColumnarTable, DataColumn, NumericStats } from "./types.js";
import { getLength, getValue } from "./types.js";

export type FieldRole =
  | "id"
  | "time"
  | "dimension"
  | "measure"
  | "group"
  | "weight"
  | "target"
  | "metadata";

export interface CategoryValueCount {
  value: string;
  count: number;
}

export interface TimeStats {
  min: number;
  max: number;
}

export interface FieldProfile {
  name: string;
  kind: ColumnKind;
  role?: FieldRole;
  nullable: boolean;
  nullCount: number;
  nullRate: number;
  distinctCount?: number;
  numericStats?: NumericStats;
  categoryTopValues?: CategoryValueCount[];
  timeStats?: TimeStats;
  typeLabel?: string;
}

export interface ProfileTableOptions {
  categoryMaxDistinct?: number;
  topValuesLimit?: number;
  fieldRoles?: Record<string, FieldRole>;
}

export function profileTable(
  table: ColumnarTable,
  options: ProfileTableOptions = {}
): FieldProfile[] {
  return table.columns.map((column) => profileColumn(table.rowCount, column, options));
}

export function getFieldProfile(
  profiles: readonly FieldProfile[],
  name: string
): FieldProfile | undefined {
  return profiles.find((profile) => profile.name === name);
}

export function getFieldsByKind(
  profiles: readonly FieldProfile[],
  kinds: readonly ColumnKind[]
): string[] {
  const allowed = new Set<ColumnKind>(kinds);
  return profiles.filter((profile) => allowed.has(profile.kind)).map((profile) => profile.name);
}

function profileColumn(
  rowCount: number,
  column: DataColumn,
  options: ProfileTableOptions
): FieldProfile {
  const topValuesLimit = options.topValuesLimit ?? 12;
  const categoryMaxDistinct = options.categoryMaxDistinct ?? 80;
  const length = getLength(column.values);
  const valueCounts = new Map<string, number>();
  let nullCount = 0;
  let knownCount = 0;
  let parsedTimeCount = 0;
  let minTime = Number.POSITIVE_INFINITY;
  let maxTime = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < length; index += 1) {
    const value = getValue(column.values, index);
    if (isNullLike(value)) {
      nullCount += 1;
      continue;
    }

    knownCount += 1;
    const label = valueToLabel(value);
    valueCounts.set(label, (valueCounts.get(label) ?? 0) + 1);

    const parsedTime = parseTimeValue(value);
    if (Number.isFinite(parsedTime)) {
      parsedTimeCount += 1;
      minTime = Math.min(minTime, parsedTime);
      maxTime = Math.max(maxTime, parsedTime);
    }
  }

  const distinctCount = valueCounts.size;
  const timeLike = knownCount > 0 && parsedTimeCount / knownCount >= 0.85;
  const kind = inferProfileKind(column, distinctCount, categoryMaxDistinct, timeLike);
  const sortedValues = [...valueCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, topValuesLimit)
    .map(([value, count]) => ({ value, count }));

  return {
    name: column.name,
    kind,
    role: options.fieldRoles?.[column.name],
    nullable: nullCount > 0,
    nullCount,
    nullRate: rowCount > 0 ? nullCount / rowCount : 0,
    distinctCount,
    numericStats: column.stats,
    categoryTopValues: kind === "category" || kind === "string" ? sortedValues : undefined,
    timeStats: timeLike ? { min: minTime, max: maxTime } : undefined,
    typeLabel: column.typeLabel
  };
}

function inferProfileKind(
  column: DataColumn,
  distinctCount: number,
  categoryMaxDistinct: number,
  timeLike: boolean
): ColumnKind {
  if (column.kind === "number" || column.kind === "boolean") {
    return column.kind;
  }
  if (column.kind === "date" || column.kind === "datetime") {
    return column.kind;
  }
  if (timeLike) {
    return "datetime";
  }
  if (distinctCount > 0 && distinctCount <= categoryMaxDistinct) {
    return "category";
  }
  return column.kind === "unknown" ? "unknown" : "string";
}

export function isNullLike(value: unknown): boolean {
  return value == null || value === "" || (typeof value === "number" && Number.isNaN(value));
}

export function valueToLabel(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  return String(value);
}

export function parseTimeValue(value: unknown): number {
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== "string" || value.trim() === "") {
    return Number.NaN;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}
