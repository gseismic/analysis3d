# PLAN-005 坐标轴刻度结果

## 完成内容

1. 在 `@analysis3d/renderer-three` 中为 axis guide 增加刻度生成逻辑：
   - X、Y height、Z depth 每轴 5 个刻度。
   - 刻度值覆盖 min、25%、50%、75%、max。
   - 每个刻度包含短 tick line 和原始值 sprite 标签。
2. 将原先单独的 min/max 端点标签整合为完整刻度标签，避免端点信息重复。
3. 为轴标题、刻度线、刻度标签增加稳定对象名称：
   - `analysis3d-axis-*-label`
   - `analysis3d-axis-*-tick-*`
   - `analysis3d-axis-*-tick-label-*`
4. 点云和曲面模式复用同一套刻度渲染逻辑，字段映射或模式切换时会刷新刻度。

## 验证结果

- `git diff --check` 通过。
- `npm run build` 通过。
- `npm run typecheck` 通过。
- Playwright 默认点云验证：
  - 存在 3 条主轴。
  - 存在 15 条 tick line。
  - 存在 15 个 tick label sprite。
  - Axis Range 仍显示 X、Y height、Z depth、Color。
- Playwright 曲面验证：
  - 存在 15 条 tick line。
  - 存在 15 个 tick label sprite。
  - 曲面渲染数量为 5,184。
  - canvas 像素非空。
- Playwright 控制台检查：
  - 0 errors。
  - 0 warnings。

## 已知限制

- 当前刻度为等距原始值刻度，不是自动 nice tick。
- 当前仍未实现鼠标 hover 点位的原始数据坐标提示。
