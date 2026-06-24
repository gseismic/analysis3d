import type { ColumnarTable, NumericStats } from "./types";
import { colorArrayFromValues } from "./colors";
import { columnToFloat64, scaleToUnit, statsFromFloat64 } from "./stats";

export type SurfaceAggregate = "mean" | "sum" | "min" | "max" | "count";

export interface SurfaceOptions {
  binsX?: number;
  binsY?: number;
  aggregate?: SurfaceAggregate;
  heightScale?: number;
}

export interface SurfaceMesh {
  positions: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
  values: Float32Array;
  binsX: number;
  binsY: number;
  stats: {
    x: NumericStats;
    y: NumericStats;
    z: NumericStats;
  };
}

export function createBinnedSurface(
  table: ColumnarTable,
  mapping: { x: string; y: string; z: string },
  options: SurfaceOptions = {}
): SurfaceMesh {
  const binsX = options.binsX ?? 72;
  const binsY = options.binsY ?? 72;
  const aggregate = options.aggregate ?? "mean";
  const heightScale = options.heightScale ?? 0.8;
  const xColumn = requiredNumericColumn(table, mapping.x);
  const yColumn = requiredNumericColumn(table, mapping.y);
  const zColumn = requiredNumericColumn(table, mapping.z);
  const xValues = columnToFloat64(xColumn);
  const yValues = columnToFloat64(yColumn);
  const zValues = columnToFloat64(zColumn);
  const xStats = statsFromFloat64(xValues);
  const yStats = statsFromFloat64(yValues);
  const binCount = binsX * binsY;
  const sums = new Float64Array(binCount);
  const counts = new Uint32Array(binCount);
  const mins = new Float64Array(binCount).fill(Number.POSITIVE_INFINITY);
  const maxs = new Float64Array(binCount).fill(Number.NEGATIVE_INFINITY);

  for (let index = 0; index < xValues.length; index += 1) {
    const x = xValues[index];
    const y = yValues[index];
    const z = zValues[index];
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      continue;
    }
    const ix = clampBin((x - xStats.min) / (xStats.max - xStats.min), binsX);
    const iy = clampBin((y - yStats.min) / (yStats.max - yStats.min), binsY);
    const bin = iy * binsX + ix;
    sums[bin] += z;
    counts[bin] += 1;
    mins[bin] = Math.min(mins[bin], z);
    maxs[bin] = Math.max(maxs[bin], z);
  }

  const values = new Float32Array(binCount);
  for (let bin = 0; bin < binCount; bin += 1) {
    if (counts[bin] === 0) {
      values[bin] = Number.NaN;
      continue;
    }
    if (aggregate === "count") {
      values[bin] = counts[bin];
    } else if (aggregate === "sum") {
      values[bin] = sums[bin];
    } else if (aggregate === "min") {
      values[bin] = mins[bin];
    } else if (aggregate === "max") {
      values[bin] = maxs[bin];
    } else {
      values[bin] = sums[bin] / counts[bin];
    }
  }

  const zStats = statsFromFloat32(values);
  const positions = new Float32Array(binCount * 3);
  const renderedValues = new Float32Array(binCount);

  for (let y = 0; y < binsY; y += 1) {
    for (let x = 0; x < binsX; x += 1) {
      const bin = y * binsX + x;
      const offset = bin * 3;
      const value = values[bin];
      const xUnit = (x / Math.max(1, binsX - 1) - 0.5) * 2;
      const yUnit = (y / Math.max(1, binsY - 1) - 0.5) * 2;
      const zUnit = Number.isFinite(value) ? scaleToUnit(value, zStats, heightScale) : -heightScale;
      positions[offset] = xUnit;
      positions[offset + 1] = zUnit;
      positions[offset + 2] = yUnit;
      renderedValues[bin] = Number.isFinite(value) ? value : zStats.min;
    }
  }

  const indices = new Uint32Array((binsX - 1) * (binsY - 1) * 6);
  let indexOffset = 0;
  for (let y = 0; y < binsY - 1; y += 1) {
    for (let x = 0; x < binsX - 1; x += 1) {
      const a = y * binsX + x;
      const b = a + 1;
      const c = a + binsX;
      const d = c + 1;
      indices[indexOffset] = a;
      indices[indexOffset + 1] = c;
      indices[indexOffset + 2] = b;
      indices[indexOffset + 3] = b;
      indices[indexOffset + 4] = c;
      indices[indexOffset + 5] = d;
      indexOffset += 6;
    }
  }

  return {
    positions,
    colors: colorArrayFromValues(renderedValues, zStats),
    indices,
    values,
    binsX,
    binsY,
    stats: {
      x: xStats,
      y: yStats,
      z: zStats
    }
  };
}

function requiredNumericColumn(table: ColumnarTable, name: string) {
  const column = table.getColumn(name);
  if (!column || !column.stats || column.stats.finiteCount === 0) {
    throw new Error(`字段不是可绘制的数值字段: ${name}`);
  }
  return column;
}

function clampBin(value: number, bins: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(bins - 1, Math.floor(value * bins)));
}

function statsFromFloat32(values: Float32Array): NumericStats {
  const as64 = new Float64Array(values.length);
  for (let index = 0; index < values.length; index += 1) {
    as64[index] = values[index];
  }
  return statsFromFloat64(as64);
}
