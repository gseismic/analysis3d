# PLAN-006 专业坐标轴系统结果

## 完成内容

1. 新增专业 AxisScale 逻辑：
   - 基于 `NumericStats` 生成 nice 主刻度。
   - 主刻度使用 `1/2/5/10` 风格步长。
   - 主刻度之间生成次刻度，次刻度只显示短线。
   - 原始字段值映射到当前 3D unit 坐标，刻度和数据包围盒对齐。
2. 重构 `@analysis3d/renderer-three` 的 axis guide：
   - X、Y height、Z depth 轴贴合当前数据包围盒。
   - 移除 Three 默认 `GridHelper` 和 `AxesHelper`，避免和专业轴网格重复。
   - 新增底面 X/Z 主刻度参考网格。
   - 新增 Y height 高度参考线。
   - 主刻度标签写入 sprite 的 `userData.text`，便于调试和自动化验证。
3. 更新 Web demo 曲面模式：
   - 显式使用 `SURFACE_HEIGHT_SCALE = 0.8`。
   - 为 Y height 轴传入 `unitHalfRange = 0.8`，保证高度刻度和曲面几何一致。
4. 新增设计文档：
   - `docs/design/axis-scale-20260629-professional.md`。

## 验证结果

- `git diff --check` 通过。
- `npm run build` 通过。
- `npm run typecheck` 通过。
- Playwright 点云验证：
  - X 主刻度为 `-0.8, -0.6, -0.4, -0.2, 0, 0.2, 0.4, 0.6, 0.8`。
  - Y height 主刻度为 `-1.5, -1, -0.5, 0, 0.5`。
  - Z depth 主刻度为 `0.2, 0.4, 0.6, 0.8, 1, 1.2, 1.4, 1.6`。
  - 存在 22 个主刻度、89 个次刻度、22 条参考网格线。
  - canvas 像素非空。
- Playwright 曲面验证：
  - Y height 轴几何范围为 `[-0.8, 0.8]`。
  - 存在 21 个主刻度、88 个次刻度、21 条参考网格线。
  - 曲面渲染数量为 5,184。
  - canvas 像素非空。
- Playwright 移动视口验证：
  - 390x844 下 Axis Range 面板可见。
  - canvas 尺寸为 390x520。
- Playwright 控制台检查：
  - 0 errors。
  - 0 warnings。

## 已知限制

- 本次采用稳定前下左包围盒布局，尚未根据相机方向动态选择前景轴边。
- 本次未实现 hover 点位坐标拾取。
