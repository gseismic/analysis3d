export type ColumnKind =
  | "number"
  | "string"
  | "category"
  | "boolean"
  | "date"
  | "datetime"
  | "unknown";

export type ColumnValues =
  | Float64Array
  | Float32Array
  | Int32Array
  | Uint32Array
  | Int16Array
  | Uint16Array
  | Int8Array
  | Uint8Array
  | BigInt64Array
  | BigUint64Array
  | readonly unknown[];

export interface NumericStats {
  min: number;
  max: number;
  mean: number;
  finiteCount: number;
  nullCount: number;
}

export interface DataColumn {
  name: string;
  kind: ColumnKind;
  values: ColumnValues;
  stats?: NumericStats;
  typeLabel?: string;
}

export interface ColumnarTable {
  name?: string;
  rowCount: number;
  columns: readonly DataColumn[];
  getColumn(name: string): DataColumn | undefined;
}

export class InMemoryColumnarTable implements ColumnarTable {
  readonly name?: string;
  readonly rowCount: number;
  readonly columns: readonly DataColumn[];
  readonly #columnsByName: Map<string, DataColumn>;

  constructor(options: {
    name?: string;
    rowCount: number;
    columns: readonly DataColumn[];
  }) {
    this.name = options.name;
    this.rowCount = options.rowCount;
    this.columns = options.columns;
    this.#columnsByName = new Map(options.columns.map((column) => [column.name, column]));
  }

  getColumn(name: string): DataColumn | undefined {
    return this.#columnsByName.get(name);
  }
}

export function getValue(values: ColumnValues, index: number): unknown {
  return values[index as keyof ColumnValues];
}

export function getLength(values: ColumnValues): number {
  return values.length;
}

export function createColumnarTable(options: {
  name?: string;
  columns: readonly DataColumn[];
  rowCount?: number;
}): ColumnarTable {
  const rowCount = options.rowCount ?? options.columns[0]?.values.length ?? 0;
  return new InMemoryColumnarTable({
    name: options.name,
    rowCount,
    columns: options.columns
  });
}
