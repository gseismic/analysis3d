# PLAN-003 Review 修复

## 背景

对 PLAN-002 代码进行 review 后发现若干会影响真实使用的问题：

1. 构建后的 `@analysis3d/core` 包入口无法被 Node ESM 真实导入。
2. 配置导入缺少运行时校验，未知 transform 可能被静默当作 `log` 执行。
3. 日期筛选的结束日期会排除结束日当天带时间的记录。
4. 类别筛选每行重复构建 `Set`，大数据下会造成额外卡顿。
5. 添加 transform 后会丢失用户当前的 Y/Z/Color 映射。

## 实施步骤

1. 修复 core 源码的相对 ESM import/export，确保构建产物可通过 package exports 导入。
2. 增加 `AnalysisConfig` 运行时校验：
   - 校验 plot 类型和字段映射。
   - 校验 filter 类型和必要字段。
   - 校验 transform 类型和必要字段。
3. 修复未知 transform 执行路径，改为抛出明确错误。
4. 调整日期 filter 的结束日期语义：
   - date-only `end` 按次日 00:00 exclusive 处理。
   - 带具体时间的 `end` 保持 inclusive 处理。
5. 编译 filter evaluator，预先构造类别 `Set` 和时间边界。
6. 修复添加 transform 后 plot mapping 丢失的问题。
7. 运行验证：
   - `npm run build`
   - `npm run typecheck`
   - 包入口 smoke test
   - Playwright 筛选/预处理 smoke test

## 验收标准

- `import("@analysis3d/core")`、`import("@analysis3d/engine-duckdb")`、`import("@analysis3d/renderer-three")` 可成功。
- 非法配置导入会给出明确错误，不会静默执行错误 transform。
- 日期筛选 `end=YYYY-MM-DD` 包含该日内所有时间。
- 筛选执行不再对每一行重复构造类别 `Set`。
- 添加 transform 后保留原有 Y/Z/Color 映射。
- 构建、类型检查和浏览器 smoke test 通过。
