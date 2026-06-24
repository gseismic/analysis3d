import { colorArrayFromValues, type PlotArrays } from "@analysis3d/core";
import { COORDINATE_SYSTEM } from "@deck.gl/core";
import { PointCloudLayer } from "@deck.gl/layers";

export interface DeckPointCloudLayerOptions {
  id?: string;
  pointSize?: number;
  opacity?: number;
}

export function createDeckPointCloudLayer(
  plot: PlotArrays,
  options: DeckPointCloudLayerOptions = {}
): PointCloudLayer {
  const colors = colorArrayFromValues(plot.colorValues, plot.stats.color);
  const colorBytes = new Uint8Array(plot.count * 4);

  for (let index = 0; index < plot.count; index += 1) {
    const source = index * 3;
    const target = index * 4;
    colorBytes[target] = Math.round(colors[source] * 255);
    colorBytes[target + 1] = Math.round(colors[source + 1] * 255);
    colorBytes[target + 2] = Math.round(colors[source + 2] * 255);
    colorBytes[target + 3] = Math.round((options.opacity ?? 0.95) * 255);
  }

  return new PointCloudLayer({
    id: options.id ?? "analysis3d-deck-point-cloud",
    data: {
      length: plot.count,
      attributes: {
        getPosition: { value: plot.positions, size: 3 },
        getColor: { value: colorBytes, size: 4 }
      }
    },
    coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
    getPosition: [0, 0, 0],
    getColor: [255, 255, 255, 255],
    pointSize: options.pointSize ?? 2
  } as never);
}
