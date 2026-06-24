import type { NumericStats } from "./types";

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

export function normalizeByStats(value: number, stats?: NumericStats): number {
  if (!stats) {
    return clamp01(value);
  }
  const range = stats.max - stats.min;
  if (range === 0) {
    return 0.5;
  }
  return clamp01((value - stats.min) / range);
}

export function turboColor(value: number, stats?: NumericStats): [number, number, number] {
  const x = normalizeByStats(value, stats);
  const r = 0.13572138 + 4.61539260 * x - 42.66032258 * x ** 2 + 132.13108234 * x ** 3 - 152.94239396 * x ** 4 + 59.28637943 * x ** 5;
  const g = 0.09140261 + 2.19418839 * x + 4.84296658 * x ** 2 - 14.18503333 * x ** 3 + 4.27729857 * x ** 4 + 2.82956604 * x ** 5;
  const b = 0.10667330 + 12.64194608 * x - 60.58204836 * x ** 2 + 110.36276771 * x ** 3 - 89.90310912 * x ** 4 + 27.34824973 * x ** 5;
  return [clamp01(r), clamp01(g), clamp01(b)];
}

export function colorArrayFromValues(values: Float32Array, stats?: NumericStats): Float32Array {
  const colors = new Float32Array(values.length * 3);
  for (let index = 0; index < values.length; index += 1) {
    const [r, g, b] = turboColor(values[index], stats);
    const offset = index * 3;
    colors[offset] = r;
    colors[offset + 1] = g;
    colors[offset + 2] = b;
  }
  return colors;
}
