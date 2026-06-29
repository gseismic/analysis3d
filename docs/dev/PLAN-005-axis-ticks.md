# PLAN-005 坐标轴刻度

## 背景

PLAN-004 已经补充了坐标轴字段名和 min/max，但用户继续反馈当前 3D 视图没有刻度。仅有端点范围时，用户仍然难以判断点云或曲面在空间中的中间位置和比例。

## 实施范围

1. 在 `@analysis3d/renderer-three` 的 axis guide 中增加刻度：
   - X、Y height、Z depth 每轴显示 5 个刻度。
   - 刻度覆盖 min、25%、50%、75%、max。
   - 每个刻度包含短 tick line 和原始字段值标签。
2. 复用现有 `NumericStats`，不改变 core 数据归一化逻辑。
3. 点云和曲面模式共用同一套刻度渲染逻辑。
4. 保持 Axis Range 顶部卡片不变，避免本次变更扩大 UI 范围。

## 验收标准

- `npm run build` 通过。
- `npm run typecheck` 通过。
- 默认点云中每个坐标轴存在可见刻度线和刻度值。
- 曲面模式中刻度仍按当前 X/Y/Z 映射更新。
- Playwright 检查场景中存在 tick 对象和 tick label sprite。
- Playwright 检查 canvas 非空，控制台无 error/warning。
