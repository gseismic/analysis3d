import { createColumnarTable, type ColumnarTable } from "./types";
import { makeColumn } from "./stats";

export function createDemoFinancialTable(rowCount = 80_000): ColumnarTable {
  const imbalance = new Float64Array(rowCount);
  const volatility = new Float64Array(rowCount);
  const momentum = new Float64Array(rowCount);
  const volume = new Float64Array(rowCount);
  const modelScore = new Float64Array(rowCount);
  const futureReturn = new Float64Array(rowCount);
  const shapImbalance = new Float64Array(rowCount);

  let seed = 42;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };

  for (let index = 0; index < rowCount; index += 1) {
    const t = index / rowCount;
    const marketRegime = Math.sin(t * Math.PI * 10);
    const noise = (random() - 0.5) * 0.9;
    const im = Math.sin(t * Math.PI * 32) * 0.65 + noise * 0.55;
    const vol = Math.abs(Math.cos(t * Math.PI * 18) + random() * 0.7) + 0.05;
    const mom = Math.sin(t * Math.PI * 7 + im) + (random() - 0.5) * 0.75;
    const volu = Math.exp(8 + vol * 0.75 + random() * 1.25);
    const score = 0.55 * im - 0.32 * vol + 0.25 * mom + 0.2 * marketRegime;
    const ret = score * 0.004 + Math.sin(im * vol * 3) * 0.006 + (random() - 0.5) * 0.01;

    imbalance[index] = im;
    volatility[index] = vol;
    momentum[index] = mom;
    volume[index] = volu;
    modelScore[index] = score;
    futureReturn[index] = ret;
    shapImbalance[index] = 0.55 * im + Math.sin(vol * 2.4) * 0.08;
  }

  return createColumnarTable({
    name: "demo_financial_ticks",
    rowCount,
    columns: [
      makeColumn({ name: "imbalance_5s", values: imbalance }),
      makeColumn({ name: "volatility_1m", values: volatility }),
      makeColumn({ name: "momentum_30s", values: momentum }),
      makeColumn({ name: "volume", values: volume }),
      makeColumn({ name: "model_score", values: modelScore }),
      makeColumn({ name: "future_return_30s", values: futureReturn }),
      makeColumn({ name: "shap_imbalance", values: shapImbalance })
    ]
  });
}
