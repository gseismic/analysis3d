import type { FilterSpec } from "./filter.js";
import type { PlotMapping } from "./plot.js";
import type { TransformStep } from "./transform.js";

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
  const parsed = JSON.parse(json) as unknown;
  if (!isRecord(parsed)) {
    throw new Error("配置必须是 JSON object");
  }
  if (parsed.version !== 1) {
    throw new Error("不支持的配置版本");
  }
  const plot = validatePlot(parsed.plot);
  return {
    version: 1,
    filters: validateFilters(parsed.filters),
    transforms: validateTransforms(parsed.transforms),
    plot,
    sampling: validateSampling(parsed.sampling),
    domain: isRecord(parsed.domain) ? parsed.domain as AnalysisConfig["domain"] : undefined
  };
}

export function stringifyAnalysisConfig(config: AnalysisConfig): string {
  return JSON.stringify(config, null, 2);
}

function validatePlot(value: unknown): AnalysisConfig["plot"] {
  if (!isRecord(value)) {
    throw new Error("配置缺少图表设置");
  }
  if (value.type !== "point" && value.type !== "surface") {
    throw new Error("配置包含不支持的图表类型");
  }
  const mapping = value.mapping;
  if (!isRecord(mapping) || !isNonEmptyString(mapping.x) || !isNonEmptyString(mapping.y) || !isNonEmptyString(mapping.z)) {
    throw new Error("配置缺少图表字段映射");
  }
  return {
    type: value.type,
    mapping: {
      x: mapping.x,
      y: mapping.y,
      z: mapping.z,
      color: isNonEmptyString(mapping.color) ? mapping.color : undefined,
      size: isNonEmptyString(mapping.size) ? mapping.size : undefined
    },
    options: isRecord(value.options) ? value.options : undefined
  };
}

function validateFilters(value: unknown): FilterSpec[] {
  if (value == null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error("filters 必须是数组");
  }
  return value.map(validateFilter);
}

function validateFilter(value: unknown): FilterSpec {
  if (!isRecord(value) || typeof value.type !== "string") {
    throw new Error("filter 必须包含 type");
  }
  if (value.type === "group") {
    if (value.op !== "and" && value.op !== "or") {
      throw new Error("filter group op 必须是 and 或 or");
    }
    return {
      type: "group",
      op: value.op,
      filters: validateFilters(value.filters),
      enabled: optionalBoolean(value.enabled)
    };
  }
  if (!isNonEmptyString(value.field)) {
    throw new Error("filter 缺少 field");
  }
  if (value.type === "numberRange") {
    return {
      type: "numberRange",
      field: value.field,
      min: optionalNumber(value.min),
      max: optionalNumber(value.max),
      includeMin: optionalBoolean(value.includeMin),
      includeMax: optionalBoolean(value.includeMax),
      enabled: optionalBoolean(value.enabled)
    };
  }
  if (value.type === "category") {
    if (value.op !== "in" && value.op !== "notIn") {
      throw new Error("category filter op 必须是 in 或 notIn");
    }
    if (!Array.isArray(value.values) || !value.values.every((entry) => typeof entry === "string")) {
      throw new Error("category filter values 必须是字符串数组");
    }
    return {
      type: "category",
      field: value.field,
      op: value.op,
      values: value.values,
      enabled: optionalBoolean(value.enabled)
    };
  }
  if (value.type === "timeRange") {
    return {
      type: "timeRange",
      field: value.field,
      start: optionalString(value.start),
      end: optionalString(value.end),
      enabled: optionalBoolean(value.enabled)
    };
  }
  if (value.type === "null") {
    if (value.op !== "isNull" && value.op !== "isNotNull") {
      throw new Error("null filter op 必须是 isNull 或 isNotNull");
    }
    return {
      type: "null",
      field: value.field,
      op: value.op,
      enabled: optionalBoolean(value.enabled)
    };
  }
  throw new Error(`不支持的 filter 类型: ${value.type}`);
}

function validateTransforms(value: unknown): TransformStep[] {
  if (value == null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error("transforms 必须是数组");
  }
  return value.map(validateTransform);
}

function validateTransform(value: unknown): TransformStep {
  if (!isRecord(value) || typeof value.type !== "string") {
    throw new Error("transform 必须包含 type");
  }
  if (!isNonEmptyString(value.field) || !isNonEmptyString(value.output)) {
    throw new Error("transform 必须包含 field 和 output");
  }
  const base = {
    field: value.field,
    output: value.output,
    groupBy: optionalStringArray(value.groupBy),
    enabled: optionalBoolean(value.enabled)
  };
  if (value.type === "clip") {
    return {
      type: "clip",
      ...base,
      lower: optionalNumber(value.lower),
      upper: optionalNumber(value.upper),
      lowerQuantile: optionalNumber(value.lowerQuantile),
      upperQuantile: optionalNumber(value.upperQuantile)
    };
  }
  if (value.type === "zscore") {
    return { type: "zscore", ...base };
  }
  if (value.type === "rank") {
    if (value.method != null && value.method !== "ordinal" && value.method !== "average" && value.method !== "dense" && value.method !== "percentile") {
      throw new Error("rank method 不支持");
    }
    const method = value.method == null ? undefined : value.method;
    return {
      type: "rank",
      ...base,
      method,
      ascending: optionalBoolean(value.ascending)
    };
  }
  if (value.type === "log") {
    if (value.base != null && value.base !== "e" && value.base !== 10 && value.base !== 2) {
      throw new Error("log base 不支持");
    }
    const baseValue = value.base == null ? undefined : value.base;
    return {
      type: "log",
      ...base,
      offset: optionalNumber(value.offset),
      base: baseValue
    };
  }
  throw new Error(`不支持的 transform 类型: ${value.type}`);
}

function validateSampling(value: unknown): AnalysisConfig["sampling"] {
  if (value == null) {
    return undefined;
  }
  if (!isRecord(value) || value.type !== "limit") {
    throw new Error("sampling 仅支持 limit");
  }
  const limit = optionalNumber(value.limit);
  if (limit == null || limit <= 0) {
    throw new Error("sampling.limit 必须是正数");
  }
  return { type: "limit", limit };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function optionalStringArray(value: unknown): string[] | undefined {
  if (value == null) {
    return undefined;
  }
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
    throw new Error("groupBy 必须是字符串数组");
  }
  return value;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}
