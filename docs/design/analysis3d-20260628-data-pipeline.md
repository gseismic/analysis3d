# Analysis3D 通用数据过滤与预处理管线设计

## 背景

PLAN-001 已经完成 Web MVP：数据可以从 CSV / Parquet / SQLite3 进入 DuckDB-Wasm 或 FastAPI 后端，再转换为 `ColumnarTable`，最后渲染为 3D 点云或分桶曲面。

当前缺口在数据读取和可视化之间：

- 缺少通用字段语义管理。
- 缺少可组合的 filter。
- 缺少预处理和派生字段能力。
- 缺少可复现的分析配置。
- 金融因子分析需要 winsorize、标准化、中性化、分组收益等能力，但这些能力不应把项目变成金融专用工具。

因此下一阶段应补齐通用数据分析中间层，同时为金融因子分析保留一等扩展路径。

## 大目标

Analysis3D 的定位是通用的交互式 3D 数据分析工作台，金融量化因子分析是第一类重点场景。

系统应保持三层结构：

```text
通用数据处理内核
  -> 通用 3D 可视化能力
  -> 场景 preset / recipe

金融因子分析 = 基于通用能力实现的 domain preset
```

核心原则：

1. `core` 不出现金融专用概念，例如 IC、股票池、行业中性、市值中性。
2. 过滤、转换、采样、聚合、配置保存都必须是通用能力。
3. 金融包只定义字段角色、默认 recipe、金融指标和金融报告。
4. 同一份分析配置应能复现从原始数据到图表的完整处理链路。
5. 大数据路径应支持 DuckDB SQL pushdown，不能只依赖浏览器内存逐行处理。

## 设计范围

本设计覆盖：

- 字段语义模型。
- 通用 filter model。
- 通用 transform pipeline。
- 派生字段和分组变换。
- 采样与聚合策略。
- 分析配置 JSON。
- Web demo 交互形态。
- 金融因子分析 preset 的扩展边界。

本设计不覆盖：

- WebGPU renderer。
- 完整回测系统。
- 多因子组合优化。
- 生产级权限、任务调度和数据版本管理。
- ClickHouse 等远程数据库接入。

## 包结构

建议新增和调整如下：

```text
packages/core
  ColumnarTable
  字段 schema 和语义角色
  filter model 和 in-memory evaluator
  transform pipeline 和 in-memory executor
  sampling / binning / aggregation
  analysis config schema

packages/engine-duckdb
  DuckDB-Wasm 文件读取
  filter / transform / aggregation 的 SQL 编译
  查询计划执行

packages/renderer-three
  3D 点云和曲面渲染

packages/renderer-deck
  高密度点云图层

packages/domain-finance
  金融字段角色 preset
  因子预处理 recipe
  IC / Rank IC
  分层收益
  long-short 曲线
  因子交互曲面 recipe

examples/web-demo
  通用数据分析 demo

examples/factor-demo
  金融因子分析 demo
```

`packages/domain-finance` 是建议新增包。它依赖 `@analysis3d/core`，但 `core` 不反向依赖金融包。

## 数据流

### 当前 MVP 数据流

```text
Source File
  -> DuckDB-Wasm / FastAPI
  -> Arrow Table
  -> ColumnarTable
  -> PlotArrays / SurfaceMesh
  -> Renderer
```

### 新数据流

```text
Source File / Query
  -> SourceTable
  -> FieldProfile
  -> AnalysisConfig
       - field roles
       - filters
       - transforms
       - sampling
       - plot mapping
  -> ExecutionPlan
       - in-memory
       - DuckDB SQL pushdown
  -> PreparedTable
  -> PlotArrays / SurfaceMesh / AggregationResult
  -> Renderer / Report
```

关键变化是 `AnalysisConfig` 和 `ExecutionPlan` 成为稳定中间层。

## 字段语义模型

### ColumnKind

现有 `ColumnKind` 可扩展为：

```ts
type ColumnKind =
  | "number"
  | "string"
  | "category"
  | "boolean"
  | "date"
  | "datetime"
  | "unknown";
```

`string` 和 `category` 应区分：

- `string`：自由文本，例如名称、备注。
- `category`：低基数字段，例如行业、国家、分组、状态。

### FieldRole

字段角色保持通用：

```ts
type FieldRole =
  | "id"
  | "time"
  | "dimension"
  | "measure"
  | "group"
  | "weight"
  | "target"
  | "metadata";
```

金融场景中的含义通过 preset 映射：

```text
symbol        -> id
trade_date    -> time
industry      -> group
market_cap    -> measure / weight
factor_value  -> measure
future_return -> target
```

### FieldProfile

每个字段需要形成 profile：

```ts
interface FieldProfile {
  name: string;
  kind: ColumnKind;
  role?: FieldRole;
  nullable: boolean;
  nullCount: number;
  distinctCount?: number;
  numericStats?: NumericStats;
  categoryTopValues?: Array<{ value: string; count: number }>;
  timeStats?: {
    min: number;
    max: number;
  };
}
```

用途：

- 自动生成 filter 控件。
- 自动选择默认图表字段。
- 自动发现金融字段候选。
- 为 SQL pushdown 和 in-memory 执行提供类型信息。

## Filter Model

filter 是通用分析的第一优先级能力。它应该是纯 JSON，可保存、可复现、可编译为 SQL，也可在内存中执行。

### FilterSpec

```ts
type FilterSpec =
  | NumericRangeFilter
  | CategoryFilter
  | TimeRangeFilter
  | NullFilter
  | TextFilter
  | ExpressionFilter
  | FilterGroup;
```

### 数值范围过滤

```ts
interface NumericRangeFilter {
  type: "numberRange";
  field: string;
  min?: number;
  max?: number;
  includeMin?: boolean;
  includeMax?: boolean;
}
```

示例：

```json
{
  "type": "numberRange",
  "field": "market_cap",
  "min": 1000000000,
  "max": 50000000000
}
```

### 类别过滤

```ts
interface CategoryFilter {
  type: "category";
  field: string;
  op: "in" | "notIn";
  values: string[];
}
```

示例：

```json
{
  "type": "category",
  "field": "industry",
  "op": "in",
  "values": ["Bank", "Broker", "Insurance"]
}
```

### 时间范围过滤

```ts
interface TimeRangeFilter {
  type: "timeRange";
  field: string;
  start?: string;
  end?: string;
}
```

### 空值过滤

```ts
interface NullFilter {
  type: "null";
  field: string;
  op: "isNull" | "isNotNull";
}
```

### 表达式过滤

表达式过滤用于高级用户，但必须限制能力边界：

```ts
interface ExpressionFilter {
  type: "expression";
  expression: string;
  dialect: "analysis3d" | "duckdb";
}
```

第一阶段建议只支持 DuckDB SQL where 片段，并只在 DuckDB 执行路径启用；in-memory 表达式可以后置。

### FilterGroup

```ts
interface FilterGroup {
  type: "group";
  op: "and" | "or";
  filters: FilterSpec[];
}
```

默认 UI 中所有 filter 使用 `and`；高级模式再暴露 `or`。

## Transform Pipeline

transform pipeline 是从源表生成分析表的可复现步骤列表。

```ts
interface TransformPipeline {
  steps: TransformStep[];
}
```

### TransformStep 类型

第一阶段应支持：

```ts
type TransformStep =
  | CastStep
  | MissingValueStep
  | ClipStep
  | ZScoreStep
  | RankStep
  | LogStep
  | DeriveStep
  | GroupNormalizeStep
  | ResidualizeStep;
```

### 类型转换

```ts
interface CastStep {
  type: "cast";
  field: string;
  to: "number" | "string" | "category" | "date" | "datetime";
  output?: string;
}
```

### 缺失值处理

```ts
interface MissingValueStep {
  type: "missing";
  field: string;
  method: "drop" | "fill";
  value?: number | string | boolean;
  output?: string;
}
```

第一阶段建议：

- `drop` 只生成 row mask，不修改原表。
- `fill` 生成新列，默认不覆盖原字段。

### Clip / Winsorize

通用能力叫 `clip`，金融 UI 可以显示为 winsorize。

```ts
interface ClipStep {
  type: "clip";
  field: string;
  lower?: number;
  upper?: number;
  lowerQuantile?: number;
  upperQuantile?: number;
  groupBy?: string[];
  output: string;
}
```

金融示例：

```json
{
  "type": "clip",
  "field": "factor_value",
  "lowerQuantile": 0.01,
  "upperQuantile": 0.99,
  "groupBy": ["trade_date"],
  "output": "factor_winsorized"
}
```

这里仍然是通用分组分位裁剪，不是金融专用。

### Z-Score

```ts
interface ZScoreStep {
  type: "zscore";
  field: string;
  groupBy?: string[];
  output: string;
}
```

金融中常用：

- 按日期 z-score。
- 按日期 + 行业 z-score。

### Rank

```ts
interface RankStep {
  type: "rank";
  field: string;
  groupBy?: string[];
  method: "ordinal" | "average" | "dense" | "percentile";
  ascending?: boolean;
  output: string;
}
```

### Log

```ts
interface LogStep {
  type: "log";
  field: string;
  base?: "e" | 10 | 2;
  offset?: number;
  output: string;
}
```

金融中的 `log(market_cap)` 可以使用这个通用步骤。

### 派生字段

```ts
interface DeriveStep {
  type: "derive";
  output: string;
  expression: string;
  dialect: "analysis3d" | "duckdb";
}
```

示例：

```json
{
  "type": "derive",
  "output": "return_spread",
  "expression": "return_20d - return_5d",
  "dialect": "duckdb"
}
```

### 分组内标准化

`GroupNormalizeStep` 是 `zscore` 和 `rank` 的 UI 聚合形态，可选是否作为单独 API。第一阶段可以先通过 `zscore.groupBy` 和 `rank.groupBy` 实现。

### 残差化

残差化保持通用，金融中性化只是它的一个 preset。

```ts
interface ResidualizeStep {
  type: "residualize";
  field: string;
  exposures: string[];
  groupBy?: string[];
  output: string;
}
```

金融示例：

```json
{
  "type": "residualize",
  "field": "factor_z",
  "exposures": ["industry", "log_market_cap"],
  "groupBy": ["trade_date"],
  "output": "factor_neutralized"
}
```

设计注意：

- 类别 exposure 需要 one-hot 或 DuckDB categorical expansion。
- 第一阶段可先支持数值 exposure，行业中性可后置。
- 对缺失或奇异矩阵要返回诊断信息，不能静默给出错误结果。

## PreparedTable

执行 filter 和 transform 后不应破坏源表。建议引入：

```ts
interface PreparedTable {
  source: ColumnarTable;
  rowMask?: Uint8Array;
  derivedColumns: readonly DataColumn[];
  rowCount: number;
  getColumn(name: string): DataColumn | undefined;
  materialize(): ColumnarTable;
}
```

好处：

- 保持源数据不可变。
- filter 可以用 row mask 表达，避免复制大表。
- transform 只新增派生列。
- 渲染层只关心 `ColumnarTable` 或支持 row mask 的绘图输入。

第一阶段为了降低复杂度，可以先 materialize 一个新 `ColumnarTable`；但设计上应保留 row mask 优化入口。

## ExecutionPlan

同一份 `AnalysisConfig` 应能选择执行后端：

```ts
type ExecutionBackend = "memory" | "duckdb";

interface ExecutionPlan {
  backend: ExecutionBackend;
  filters: FilterSpec[];
  transforms: TransformStep[];
  sampling?: SamplingSpec;
  requiredFields: string[];
}
```

### In-memory 执行

适用：

- 示例数据。
- 小数据。
- 已经从后端 sample 回来的数据。

优势：

- 无需重新查询。
- UI 响应直接。
- 容易测试。

限制：

- 大数据会阻塞主线程。
- 复杂 transform 成本高。

### DuckDB SQL pushdown

适用：

- 大 CSV / Parquet / SQLite。
- filter 可以显著减少数据量。
- group by、binning、分位数、标准化可在 SQL 层完成。

目标：

- filter 编译为 `WHERE`。
- derive 编译为 `SELECT expression AS output`。
- z-score 编译为窗口函数。
- rank 编译为窗口函数。
- group aggregation 编译为 `GROUP BY`。

示例：

```sql
SELECT
  *,
  (factor_value - avg(factor_value) OVER (PARTITION BY trade_date))
    / nullif(stddev_samp(factor_value) OVER (PARTITION BY trade_date), 0)
    AS factor_z
FROM source
WHERE trade_date BETWEEN '2022-01-01' AND '2025-12-31'
```

第一阶段不要求所有 transform 都支持 SQL pushdown，但每个 step 应标记执行能力：

```ts
interface TransformCapability {
  memory: boolean;
  duckdb: boolean;
}
```

## SamplingSpec

采样也应配置化：

```ts
type SamplingSpec =
  | { type: "limit"; limit: number }
  | { type: "random"; limit: number; seed?: number }
  | { type: "stratified"; by: string[]; limit: number; seed?: number }
  | { type: "top"; field: string; limit: number; ascending?: boolean };
```

金融因子分析中常见需求：

- 每个交易日抽样。
- 每个行业抽样。
- 按市值分层抽样。

这些都可以由 `stratified` 支持。

## AggregationSpec

曲面、报表和因子分析都需要聚合：

```ts
interface AggregationSpec {
  groupBy: string[];
  metrics: Array<{
    field: string;
    op: "count" | "sum" | "mean" | "median" | "min" | "max" | "std" | "quantile";
    output: string;
    quantile?: number;
  }>;
}
```

`createBinnedSurface` 可以逐步改造成：

```text
binning spec + aggregation spec -> SurfaceMesh
```

这样金融场景中的因子交互曲面可以直接使用：

```text
x = factor_a 分桶
y = factor_b 分桶
z = mean(future_return)
color = count / volatility / hit_rate
```

## AnalysisConfig

分析配置是可复现的核心对象。

```ts
interface AnalysisConfig {
  version: 1;
  dataSource?: {
    name?: string;
    kind?: "csv" | "parquet" | "sqlite" | "query" | "demo";
  };
  fieldRoles: Record<string, FieldRole | string>;
  filters: FilterSpec[];
  transforms: TransformStep[];
  sampling?: SamplingSpec;
  plot: {
    type: "point" | "surface";
    mapping: {
      x: string;
      y: string;
      z: string;
      color?: string;
      size?: string;
    };
    options?: Record<string, unknown>;
  };
  domain?: {
    name: string;
    preset?: string;
    options?: Record<string, unknown>;
  };
}
```

金融配置示例：

```json
{
  "version": 1,
  "fieldRoles": {
    "trade_date": "time",
    "symbol": "id",
    "industry": "group",
    "market_cap": "measure",
    "factor_a": "measure",
    "factor_b": "measure",
    "future_return_5d": "target"
  },
  "filters": [
    {
      "type": "timeRange",
      "field": "trade_date",
      "start": "2022-01-01",
      "end": "2025-12-31"
    },
    {
      "type": "numberRange",
      "field": "market_cap",
      "min": 1000000000
    }
  ],
  "transforms": [
    {
      "type": "clip",
      "field": "factor_a",
      "lowerQuantile": 0.01,
      "upperQuantile": 0.99,
      "groupBy": ["trade_date"],
      "output": "factor_a_clip"
    },
    {
      "type": "zscore",
      "field": "factor_a_clip",
      "groupBy": ["trade_date"],
      "output": "factor_a_z"
    }
  ],
  "sampling": {
    "type": "stratified",
    "by": ["trade_date"],
    "limit": 200000,
    "seed": 42
  },
  "plot": {
    "type": "surface",
    "mapping": {
      "x": "factor_a_z",
      "y": "factor_b",
      "z": "future_return_5d",
      "color": "market_cap"
    }
  },
  "domain": {
    "name": "finance",
    "preset": "factor-interaction"
  }
}
```

## Web UI 设计

### 通用 demo

Web demo 应从单一字段选择面板扩展为四个区域：

1. Data
   - 文件上传。
   - 表结构。
   - 字段 profile。
   - 行数、列数、缺失率。

2. Filter
   - 数值字段显示 range slider / min-max 输入。
   - 类别字段显示多选。
   - 时间字段显示日期范围。
   - 支持启用 / 禁用单条 filter。

3. Prepare
   - 添加 transform step。
   - 每个 step 有输入字段、参数、输出字段名。
   - 显示 step 是否支持 memory / DuckDB。
   - 支持上下移动、禁用、删除。

4. View
   - 点云 / 曲面。
   - X / Y / Z / Color / Size 映射。
   - 采样策略。
   - 保存 / 加载分析配置。

### 金融 factor demo

金融 demo 不重新实现基础 UI，而是提供 preset：

- 自动识别 `date`、`symbol`、`industry`、`market_cap`、`factor`、`future_return`。
- 一键添加因子预处理 recipe：
  - 按日期 winsorize。
  - 按日期 z-score。
  - 可选按行业分组 z-score。
  - 可选市值残差化。
- 一键生成图：
  - 因子 vs 未来收益点云。
  - 双因子交互收益曲面。
  - 行业着色点云。

## 金融因子分析扩展边界

金融包应提供：

```ts
interface FinanceFieldRoles {
  date: string;
  symbol: string;
  factor?: string;
  factors?: string[];
  futureReturn: string;
  industry?: string;
  marketCap?: string;
  weight?: string;
}
```

以及 recipe：

```ts
function createFactorPreprocessPipeline(options: {
  factor: string;
  date: string;
  industry?: string;
  marketCap?: string;
  winsorize?: { lowerQuantile: number; upperQuantile: number };
  standardize?: "date" | "dateIndustry";
  neutralize?: Array<"industry" | "marketCap">;
}): TransformPipeline;
```

金融指标：

```ts
function computeInformationCoefficient(...): IcResult;
function computeQuantileReturns(...): QuantileReturnResult;
function createFactorInteractionSurface(...): SurfaceMesh;
```

这些 API 不进入 `core`，避免通用层被金融概念绑定。

## 错误和诊断

每次执行 pipeline 都应返回诊断信息：

```ts
interface PipelineDiagnostics {
  inputRows: number;
  outputRows: number;
  droppedRows: number;
  steps: Array<{
    stepIndex: number;
    type: string;
    inputRows: number;
    outputRows: number;
    warnings: string[];
  }>;
}
```

典型 warning：

- filter 后剩余行数过少。
- 某字段缺失率过高。
- z-score 标准差为 0。
- rank 分组只有单个样本。
- residualize 存在奇异矩阵。
- SQL pushdown 不支持某 step，已回退到 memory。

## 测试策略

### core 单元测试

- 数值 range filter。
- 类别 filter。
- 日期 filter。
- filter group 的 and / or。
- clip 的固定边界和分位边界。
- z-score 全局和 groupBy。
- rank 全局和 groupBy。
- log offset。
- derive 简单表达式。
- transform pipeline 顺序执行。
- AnalysisConfig 序列化和反序列化。

### DuckDB 编译测试

- filter to SQL。
- z-score window SQL。
- rank window SQL。
- derive SQL。
- sampling SQL。

### 浏览器验收

- 上传 CSV 后添加 filter，渲染点数减少。
- 添加 z-score 输出字段后可用于 X/Y/Z 映射。
- 保存配置 JSON，再加载后图表一致。
- 移动视口下 filter 和 transform UI 不遮挡 canvas。

### 金融 preset 测试

- 自动识别字段。
- 生成 winsorize + z-score pipeline。
- 单因子 IC 结果方向正确。
- 双因子曲面能使用预处理后的字段。

## 实施顺序建议

### PLAN-002：通用 filter 和 transform foundation

1. 新增 `FieldProfile` 和字段 profiling。
2. 新增 `FilterSpec` 和 in-memory evaluator。
3. 新增 `TransformStep` 和 in-memory executor。
4. 支持 `clip`、`zscore`、`rank`、`log`。
5. 新增 `AnalysisConfig`。
6. Web demo 增加 filter 面板、transform 面板和配置导入导出。
7. 生成结果文档并用 Playwright 验证。

### PLAN-003：DuckDB pushdown 和大数据路径

1. FilterSpec 编译为 SQL。
2. 部分 TransformStep 编译为 SQL。
3. DuckDB 执行计划返回 Arrow。
4. 大文件 filter 后再采样。
5. 增加执行诊断和错误回退。

### PLAN-004：金融因子分析 preset

1. 新增 `packages/domain-finance`。
2. 金融字段角色识别。
3. 因子预处理 recipe。
4. IC / Rank IC。
5. 分层收益。
6. 因子交互曲面。
7. 新增 `examples/factor-demo`。

## 风险和取舍

1. 表达式系统不要过早自研。
   第一阶段优先使用 DuckDB 表达式；in-memory 只支持明确的内置 transform。

2. 不要先做复杂 UI。
   先让配置 JSON 和执行结果稳定，再优化交互体验。

3. 不要把所有数据都 materialize。
   MVP 可以先 materialize，但接口设计必须保留 row mask 和 SQL pushdown。

4. 金融中性化要谨慎。
   行业 one-hot、缺失处理、奇异矩阵都会影响结果可信度，第一版可以先实现按日期 winsorize、z-score 和 Rank IC。

5. 通用性来自抽象边界，不来自功能少。
   `clip`、`zscore`、`rank`、`residualize` 都是通用能力；金融只是提供默认组合。

## 验收标准

设计落地后，系统应满足：

1. 用户能上传任意结构化数据，查看字段 profile。
2. 用户能用通用 UI 添加数值、类别、时间 filter。
3. 用户能添加预处理步骤并生成新字段。
4. 用户能把新字段映射到 3D 点云或曲面。
5. 用户能保存和恢复完整分析配置。
6. 金融用户能通过 preset 快速完成因子清洗、标准化和交互曲面探索。
7. 通用 demo 和金融 demo 共享同一套 core pipeline。
