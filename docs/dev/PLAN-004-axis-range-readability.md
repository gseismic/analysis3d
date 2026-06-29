# PLAN-004 坐标轴与范围可读性

## 背景

用户在使用筛选工作台时反馈：3D 视图里没有明确坐标，不知道当前 X/Y/Z/Color 的范围。当前渲染器只有 `AxesHelper` 和网格，缺少字段名、min/max 和当前映射范围说明，导致分析图难以解释。

## 实施范围

1. 在 Three renderer 中增加轴向标注：
   - X 轴字段名和 min/max。
   - Y 高度轴字段名和 min/max。
   - Z 深度轴字段名和 min/max。
   - 使用 sprite 文本显示，随相机可见。
2. 在 Web demo 顶部增加 Axis Range 区域：
   - 显示 X/Y/Z/Color 当前字段。
   - 显示每个字段的 min/max。
   - 明确 `Y(height)` 和 `Z(depth)` 的映射关系。
3. 点云和曲面模式都更新坐标范围。
4. 筛选、预处理、字段映射变化后范围同步刷新。

## 验收标准

- `npm run build` 通过。
- `npm run typecheck` 通过。
- 默认点云中可见 X/Y/Z 轴标签。
- 添加筛选后 Axis Range 区域数值范围变化。
- 切换曲面模式后 Axis Range 仍显示当前字段范围。
- Playwright 检查桌面和移动视口下范围面板可见，canvas 非空，控制台无 error/warning。
