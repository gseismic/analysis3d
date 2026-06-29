# PLAN-004 坐标轴与范围可读性结果

## 完成内容

1. 在 `@analysis3d/renderer-three` 中新增 3D 坐标轴标注：
   - X 轴字段名和 min/max。
   - Y height 轴字段名和 min/max。
   - Z depth 轴字段名和 min/max。
   - 使用 Three.js sprite 文本显示，随场景一起渲染。
2. 点云模式自动根据 `PlotArrays` 的 mapping 和 stats 更新坐标轴。
3. 曲面模式支持传入 axis guide，Web demo 会根据当前 X/Y/Z 映射更新坐标轴。
4. Web demo 顶部新增 Axis Range 区域：
   - 显示 X、Y height、Z depth、Color 的当前字段和范围。
   - 筛选后范围同步变化。
   - 曲面模式显示 X、Y height、Z depth 的范围。
5. 修复初始字段映射 fallback：
   - 避免 X/Y/Z/Color 都落到第一个数值字段。
   - 默认恢复为 `imbalance_5s`、`volatility_1m`、`model_score`、`volume` 等更合理映射。

## 验证结果

- `npm run build` 通过。
- `npm run typecheck` 通过。
- Playwright 默认点云验证：
  - Axis Range 显示 X、Y height、Z depth、Color。
  - 默认映射为不同字段。
  - canvas 像素非空。
- Playwright 筛选验证：
  - 添加 `imbalance_5s >= 0` 后过滤行数减少。
  - Axis Range 中 X、Y height、Color 范围同步变化。
- Playwright 曲面验证：
  - 曲面模式渲染 5,184 个网格值。
  - Axis Range 显示 X、Y height、Z depth。
  - canvas 像素非空。
- Playwright 移动视口验证：
  - 390x844 下 Axis Range 面板可见。
  - canvas 尺寸为 390x520。
- Playwright 场景对象验证：
  - 存在 `analysis3d-axis-X`、`analysis3d-axis-Y height`、`analysis3d-axis-Z depth`。
  - 存在 9 个 sprite 文字对象。
- Playwright 控制台检查：
  - 0 errors。
  - 0 warnings。

## 已知限制

- 当前坐标文字为 sprite 标签，不支持精细刻度网格。
- 暂未实现 hover 点位的原始数据坐标提示。
