# PLAN-002 通用筛选与预处理工作台结果

## 完成内容

1. 新增通用数据管线设计：
   - `docs/design/analysis3d-20260628-data-pipeline.md`
   - 明确 Analysis3D 保持通用工作台定位，金融因子分析通过 domain preset 扩展。
2. 新增实施计划：
   - `docs/dev/PLAN-002-filter-transform-workbench.md`
3. 扩展 `@analysis3d/core`：
   - 新增字段 profile：字段类型、缺失率、数值统计、类别 Top 值、时间范围。
   - 新增通用 filter：数值范围、类别、时间范围、空值、filter group。
   - 新增 transform pipeline：`clip`、`zscore`、`rank`、`log`，支持可选 `groupBy`。
   - 新增 `AnalysisConfig` 结构和 JSON parse/stringify。
   - 示例数据新增 `trade_date`、`symbol`、`sector`、`regime`，便于验证时间和类别筛选。
4. 改造 `examples/web-demo` 为真实可用的数据分析工作台：
   - Data 区域支持示例数据、浏览器加载和后端加载。
   - Filter 区域支持添加、禁用、删除筛选条件。
   - Prepare 区域支持添加、禁用、删除预处理步骤。
   - View 区域支持点云/曲面和 X/Y/Z/Color 映射。
   - Config 区域支持导出和导入完整分析配置。
   - 右侧显示字段 profile 和 pipeline diagnostics。
   - 筛选和预处理结果真实影响 3D 点云与曲面渲染。

## 验证结果

- `npm run build` 通过。
- `npm run typecheck` 通过。
- Vite dev server 启动地址：`http://127.0.0.1:5173/`。
- Playwright 默认加载验证：
  - 示例数据 80,000 行。
  - 字段数 11。
  - 默认点云渲染 80,000 点。
  - canvas 像素非空。
- Playwright 数值筛选验证：
  - `imbalance_5s` 范围 `0 .. 10`。
  - 过滤后 39,999 行。
  - 点云同步渲染 39,999 点。
- Playwright 类别筛选验证：
  - `sector in Bank`。
  - 与数值筛选叠加后 6,660 行。
  - 点云同步渲染 6,660 点。
- Playwright 时间筛选验证：
  - `trade_date` 范围 `2022-01-01 .. 2022-02-15`。
  - 与前两个筛选叠加后 1,238 行。
  - 点云同步渲染 1,238 点。
- Playwright 预处理验证：
  - `zscore(future_return_30s) by trade_date` 生成新字段 `future_return_30s_z_by_date`。
  - 新字段进入 X/Y/Z/Color 选择器并可用于点云。
  - `clip(model_score)` 生成 `model_score_clip`。
  - `rank(model_score_clip)` 生成 `model_score_rank`。
  - `log(volume)` 生成 `log_volume`。
- Playwright 配置验证：
  - 导出当前 filters、transforms 和 plot mapping。
  - 清空 filters / transforms 后重新导入。
  - 配置恢复后筛选、预处理字段和图表状态恢复。
- Playwright 曲面验证：
  - 曲面模式渲染 5,184 个网格值。
  - canvas 像素非空。
- Playwright 移动视口验证：
  - 390x844 视口下 canvas 尺寸 390x520。
  - canvas 像素非空。
- Playwright 控制台检查：
  - 0 errors。
  - 0 warnings。

## 已知限制

- 当前 filter 和 transform 执行路径为 in-memory，DuckDB SQL pushdown 留给 PLAN-003。
- `derive` 表达式暂未实现，避免过早自研表达式系统。
- 金融 IC、Rank IC、分层收益和报告留给 PLAN-004。
- transform 的 `residualize` 设计已预留，但本计划未实现。
