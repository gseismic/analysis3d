# PLAN-001 Web MVP

## 背景

当前目录只有 `AGENTS.md`，需要从零搭建一个可运行的 Web 端 3D 数据分析库 MVP。

## 实施步骤

1. 创建 TypeScript monorepo。
2. 实现 `@analysis3d/core`：
   - 列式表结构。
   - Arrow Table 转换。
   - 数值字段识别和统计。
   - 点云绘图数组。
   - 分桶曲面网格。
   - 示例数据。
3. 实现 `@analysis3d/engine-duckdb`：
   - DuckDB-Wasm 初始化。
   - CSV / Parquet / SQLite3 文件打开。
   - SQL 查询到 ColumnarTable。
4. 实现 `@analysis3d/renderer-three`：
   - Three.js Viewer。
   - 点云渲染。
   - 曲面渲染。
   - 自适应尺寸和 OrbitControls。
5. 实现 `@analysis3d/renderer-deck`：
   - deck.gl PointCloudLayer 工厂。
6. 实现 `server`：
   - FastAPI 应用。
   - 上传 CSV / Parquet / SQLite3。
   - schema / query / sample 接口。
   - Arrow IPC 返回。
7. 实现 `examples/web-demo`：
   - 示例数据按钮。
   - 文件上传。
   - 字段选择。
   - 点云/曲面切换。
8. 安装依赖并运行：
   - `npm install`
   - `npm run build`
   - `npm run dev`
9. 用 Playwright 验证桌面和移动视口下 canvas 非空。
10. 生成结果文档。

## 验收标准

- `npm run build` 通过。
- 示例应用可启动。
- 打开页面后示例数据能显示 3D 点云。
- 切换曲面模式能显示 3D 曲面。
- FastAPI 后端提供健康检查和数据接口代码。
- 浏览器 canvas 像素检查非空。
