import type { ColumnarTable, NumericStats } from "./types.js";
import { columnToFloat64, scaleToUnit, statsFromFloat64 } from "./stats.js";

export interface PlotMapping {
  x: string;
  y: string;
  z: string;
  color?: string;
  size?: string;
}

export interface PlotArrays {
  mapping: PlotMapping;
  positions: Float32Array;
  colorValues: Float32Array;
  sizeValues?: Float32Array;
  rowIndices: Uint32Array;
  count: number;
  stats: {
    x: NumericStats;
    y: NumericStats;
    z: NumericStats;
    color: NumericStats;
    size?: NumericStats;
  };
}

export interface PlotArrayOptions {
  maxPoints?: number;
  positionScale?: number;
}

export function createPlotArrays(
  table: ColumnarTable,
  mapping: PlotMapping,
  options: PlotArrayOptions = {}
): PlotArrays {
  const maxPoints = options.maxPoints ?? 1_000_000;
  const positionScale = options.positionScale ?? 1;
  const xColumn = requiredNumericColumn(table, mapping.x);
  const yColumn = requiredNumericColumn(table, mapping.y);
  const zColumn = requiredNumericColumn(table, mapping.z);
  const colorColumn = mapping.color ? requiredNumericColumn(table, mapping.color) : zColumn;
  const sizeColumn = mapping.size ? requiredNumericColumn(table, mapping.size) : undefined;

  const xValues = columnToFloat64(xColumn);
  const yValues = columnToFloat64(yColumn);
  const zValues = columnToFloat64(zColumn);
  const colorValues = columnToFloat64(colorColumn);
  const sizeValues = sizeColumn ? columnToFloat64(sizeColumn) : undefined;
  const stats = {
    x: statsFromFloat64(xValues),
    y: statsFromFloat64(yValues),
    z: statsFromFloat64(zValues),
    color: statsFromFloat64(colorValues),
    size: sizeValues ? statsFromFloat64(sizeValues) : undefined
  };
  const validIndices = collectValidIndices([xValues, yValues, zValues, colorValues], maxPoints);
  const positions = new Float32Array(validIndices.length * 3);
  const sampledColorValues = new Float32Array(validIndices.length);
  const sampledSizeValues = sizeValues ? new Float32Array(validIndices.length) : undefined;
  const rowIndices = new Uint32Array(validIndices.length);

  for (let outputIndex = 0; outputIndex < validIndices.length; outputIndex += 1) {
    const sourceIndex = validIndices[outputIndex];
    const offset = outputIndex * 3;
    positions[offset] = scaleToUnit(xValues[sourceIndex], stats.x, positionScale);
    positions[offset + 1] = scaleToUnit(zValues[sourceIndex], stats.z, positionScale);
    positions[offset + 2] = scaleToUnit(yValues[sourceIndex], stats.y, positionScale);
    sampledColorValues[outputIndex] = colorValues[sourceIndex];
    rowIndices[outputIndex] = sourceIndex;
    if (sampledSizeValues && sizeValues) {
      sampledSizeValues[outputIndex] = sizeValues[sourceIndex];
    }
  }

  return {
    mapping,
    positions,
    colorValues: sampledColorValues,
    sizeValues: sampledSizeValues,
    rowIndices,
    count: validIndices.length,
    stats
  };
}

function requiredNumericColumn(table: ColumnarTable, name: string) {
  const column = table.getColumn(name);
  if (!column) {
    throw new Error(`字段不存在: ${name}`);
  }
  if (!column.stats || column.stats.finiteCount === 0) {
    throw new Error(`字段不是可绘制的数值字段: ${name}`);
  }
  return column;
}

function collectValidIndices(values: readonly Float64Array[], maxPoints: number): number[] {
  const rowCount = values[0]?.length ?? 0;
  let validCount = 0;

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    if (values.every((value) => Number.isFinite(value[rowIndex]))) {
      validCount += 1;
    }
  }

  if (validCount === 0) {
    return [];
  }

  const stride = Math.max(1, Math.ceil(validCount / maxPoints));
  const indices: number[] = [];
  let validSeen = 0;

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    if (!values.every((value) => Number.isFinite(value[rowIndex]))) {
      continue;
    }
    if (validSeen % stride === 0) {
      indices.push(rowIndex);
    }
    validSeen += 1;
  }

  return indices;
}
