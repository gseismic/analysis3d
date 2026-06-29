# PLAN-006 专业坐标轴系统

## 背景

用户指出当前刻度仍不专业。PLAN-005 解决了“有刻度”，但刻度是等分原始值，轴线也没有严格贴合数据包围盒。专业绘图软件通常使用 nice scale、主/次刻度和参考网格来降低认知负担。

## 实施范围

1. 新增 `AxisScale` 生成逻辑：
   - 基于 `NumericStats` 生成 nice 主刻度。
   - 生成主刻度之间的次刻度。
   - 提供原始值到 3D unit 坐标的映射。
2. 重构 `@analysis3d/renderer-three` 的 axis guide：
   - 坐标轴贴合数据包围盒。
   - 主刻度显示数值标签。
   - 次刻度只显示短线。
   - 增加底面 X/Z 网格和 Y 高度参考线。
3. 更新 Web demo 曲面模式：
   - 为 Y height 轴传入 `unitHalfRange = 0.8`，和 `createBinnedSurface` 默认高度缩放一致。
4. 保持 Axis Range 顶部范围卡片不变。

## 验收标准

- `npm run build` 通过。
- `npm run typecheck` 通过。
- 点云模式中主刻度为 nice number，不再是固定 25% 等分值。
- 点云模式存在主刻度、次刻度和参考网格对象。
- 曲面模式中高度刻度和曲面高度范围对齐。
- Playwright 检查 canvas 非空，控制台无 error/warning。
- 计划文件和结果文件随代码提交。
