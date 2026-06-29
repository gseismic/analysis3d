# PLAN-003 Review 修复结果

## 完成内容

1. 修复 ESM 包入口：
   - 将 `@analysis3d/core` 内部相对 import/export 改为 `.js` 扩展。
   - 构建后的 package exports 可被 Node ESM 正常导入。
2. 增强 `AnalysisConfig` 导入校验：
   - 校验配置必须是 JSON object。
   - 校验 `plot.type`、`plot.mapping`。
   - 校验 filter 类型、字段、操作符和值结构。
   - 校验 transform 类型、字段、输出字段和参数。
   - 非法类型会抛出明确错误。
3. 修复未知 transform 静默执行问题：
   - `applyTransformPipeline` 不再把未知类型当作 `log`。
   - 未知类型会抛出 `不支持的预处理类型`。
4. 修复日期范围结束日语义：
   - `end=YYYY-MM-DD` 按次日 00:00 exclusive 处理。
   - 能包含结束日当天带时间的记录。
5. 优化 filter 执行：
   - 执行前编译 row evaluator。
   - 类别 `Set` 和时间边界只构建一次，不再每行重复构建。
6. 修复 Web demo 添加 transform 后映射丢失问题：
   - 添加 transform 只把 X 切到新字段。
   - 保留已有 Y/Z/Color 映射。

## 验证结果

- `npm run build` 通过。
- `npm run typecheck` 通过。
- 包入口 smoke test 通过：
  - `import("@analysis3d/core")`
  - `import("@analysis3d/engine-duckdb")`
  - `import("@analysis3d/renderer-three")`
  - `import("@analysis3d/renderer-deck")`
- 非法配置 smoke test 通过：
  - `type: "derive"` 的 transform 导入时报错 `不支持的 transform 类型: derive`。
- 日期范围 smoke test 通过：
  - `start=2026-06-29`、`end=2026-06-29` 保留 `2026-06-29T00:00:00Z` 和 `2026-06-29T15:30:00Z`。
  - 排除 `2026-06-30T00:00:00Z`。
- Playwright Web demo smoke test 通过：
  - 默认示例数据可渲染。
  - 添加 z-score transform 后 X 切换到新字段。
  - Y/Z/Color 保留用户原有选择。
  - 非法配置导入在状态栏显示明确错误。
  - 控制台 0 errors、0 warnings。

## 已知限制

- DuckDB SQL pushdown 仍未实现，留给后续计划。
- 当前配置校验仍是轻量级手写校验；如配置结构继续扩展，可以考虑引入 schema 校验库。
