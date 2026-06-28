import type { FilterSpec } from "./filter";
import type { PlotMapping } from "./plot";
import type { TransformStep } from "./transform";

export type AnalysisPlotType = "point" | "surface";

export interface AnalysisConfig {
  version: 1;
  filters: FilterSpec[];
  transforms: TransformStep[];
  plot: {
    type: AnalysisPlotType;
    mapping: PlotMapping;
    options?: Record<string, unknown>;
  };
  sampling?: {
    type: "limit";
    limit: number;
  };
  domain?: {
    name: string;
    preset?: string;
    options?: Record<string, unknown>;
  };
}

export function createAnalysisConfig(options: {
  filters?: FilterSpec[];
  transforms?: TransformStep[];
  plot: AnalysisConfig["plot"];
  sampling?: AnalysisConfig["sampling"];
  domain?: AnalysisConfig["domain"];
}): AnalysisConfig {
  return {
    version: 1,
    filters: options.filters ?? [],
    transforms: options.transforms ?? [],
    plot: options.plot,
    sampling: options.sampling,
    domain: options.domain
  };
}

export function parseAnalysisConfig(json: string): AnalysisConfig {
  const parsed = JSON.parse(json) as Partial<AnalysisConfig>;
  if (parsed.version !== 1) {
    throw new Error("不支持的配置版本");
  }
  if (!parsed.plot?.mapping?.x || !parsed.plot.mapping.y || !parsed.plot.mapping.z) {
    throw new Error("配置缺少图表字段映射");
  }
  return {
    version: 1,
    filters: parsed.filters ?? [],
    transforms: parsed.transforms ?? [],
    plot: parsed.plot as AnalysisConfig["plot"],
    sampling: parsed.sampling,
    domain: parsed.domain
  };
}

export function stringifyAnalysisConfig(config: AnalysisConfig): string {
  return JSON.stringify(config, null, 2);
}
