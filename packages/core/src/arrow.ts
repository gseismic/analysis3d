import { createColumnarTable, type ColumnarTable, type ColumnValues } from "./types";
import { makeColumn } from "./stats";

export function arrowTableToColumnar(arrowTable: unknown, name = "result"): ColumnarTable {
  const table = arrowTable as {
    schema?: { fields?: Array<{ name: string; type?: unknown; typeId?: unknown }> };
    numRows?: number;
    length?: number;
    getChild?: (name: string) => unknown;
    getChildAt?: (index: number) => unknown;
  };

  const fields = table.schema?.fields ?? [];
  const rowCount = Number(table.numRows ?? table.length ?? 0);

  const columns = fields.map((field, index) => {
    const vector = table.getChild?.(field.name) ?? table.getChildAt?.(index);
    const values = vectorToValues(vector, rowCount);
    return makeColumn({
      name: field.name,
      values,
      typeLabel: field.type ? String(field.type) : String(field.typeId ?? "unknown")
    });
  });

  return createColumnarTable({
    name,
    rowCount,
    columns
  });
}

function vectorToValues(vector: unknown, rowCount: number): ColumnValues {
  const typedVector = vector as {
    length?: number;
    toArray?: () => ColumnValues;
    get?: (index: number) => unknown;
  } | null | undefined;

  if (!typedVector) {
    return [];
  }

  if (typeof typedVector.toArray === "function") {
    const values = typedVector.toArray();
    if (values) {
      return values;
    }
  }

  const length = Number(typedVector.length ?? rowCount);
  const values: unknown[] = new Array(length);
  for (let index = 0; index < length; index += 1) {
    values[index] = typedVector.get?.(index);
  }
  return values;
}
