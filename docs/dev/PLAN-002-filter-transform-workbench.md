# PLAN-002 通用筛选与预处理工作台

## 背景

PLAN-001 已完成 Analysis3D Web MVP，但数据读取和 3D 渲染之间缺少真实可用的数据分析中间层。用户当前只能选择 X/Y/Z/Color 字段，无法对数据做筛选、清洗、标准化或保存分析配置。

用户希望项目保持通用性，同时支持金融因子分析。下一步应优先补齐通用筛选与预处理能力，让金融场景能够通过 preset 复用这些基础设施。

## 设计依据

- `docs/design/analysis3d-20260628-data-pipeline.md`

## 实施范围

1. 在 `@analysis3d/core` 中新增字段 profile：
   - 识别数值、类别、时间、文本等字段。
   - 输出缺失率、数值统计、类别 Top 值、时间范围。
2. 在 `@analysis3d/core` 中新增通用 filter：
   - 数值范围过滤。
   - 类别 in / notIn 过滤。
   - 时间范围过滤。
   - 空值过滤。
   - filter group 的 and / or 执行。
3. 在 `@analysis3d/core` 中新增 transform pipeline：
   - `clip`
   - `zscore`
   - `rank`
   - `log`
   - 支持可选 `groupBy`。
4. 在 `@analysis3d/core` 中新增分析配置结构：
   - filters。
   - transforms。
   - sampling。
   - plot mapping。
5. 改造 `examples/web-demo` 为分析工作台：
   - Data 面板显示字段 profile。
   - Filter 面板可添加、启用、删除筛选条件。
   - Prepare 面板可添加、启用、删除预处理步骤。
   - View 面板保留点云/曲面映射，并支持导出/导入配置 JSON。
   - 筛选和预处理结果真实影响 3D 点云与曲面。
6. 增加运行诊断：
   - 原始行数。
   - 过滤后行数。
   - 准备后行数。
   - 渲染点数或曲面网格数。
   - 每个步骤的 warning。
7. 使用 Playwright 验证：
   - 数值 filter 后行数减少。
   - z-score 生成的新字段可映射并渲染。
   - 配置导出/导入后图表状态可恢复。
   - 移动视口下界面和 canvas 正常。

## 非目标

- 不实现 DuckDB SQL pushdown。
- 不实现金融 IC、Rank IC、分层收益。
- 不实现 WebGPU。
- 不实现完整报表导出。

这些能力留给 PLAN-003 和 PLAN-004。

## 验收标准

1. `npm run build` 通过。
2. `npm run typecheck` 通过。
3. Web demo 启动后默认示例数据可渲染。
4. 添加数值范围筛选后，过滤后行数减少，3D 图同步更新。
5. 添加类别筛选后，过滤后行数减少，3D 图同步更新。
6. 添加 `zscore` 预处理后，新字段出现在 X/Y/Z/Color 选择器中，并可用于点云或曲面。
7. 添加 `clip`、`rank`、`log` 后，新字段能生成并显示在字段列表。
8. 导出配置 JSON 后清空再导入，filters、transforms、plot mapping 能恢复。
9. Playwright 检查桌面和移动视口 canvas 非空。
10. 生成结果文档。
