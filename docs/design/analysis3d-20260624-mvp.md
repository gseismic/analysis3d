# Analysis3D Web MVP 设计

## 目标

最快交付一个基于 Web 的通用 3D 数据分析可视化库，支持用户上传 CSV、Parquet、SQLite3 文件，完成字段识别、查询采样、3D 点云和分桶曲面显示。

## 技术路线

- 数据导入和查询：DuckDB-Wasm。
- 列式数据交换：Apache Arrow。
- 默认 3D 渲染：Three.js。
- 高性能图层扩展：deck.gl/luma.gl。
- 后端服务：FastAPI + DuckDB + PyArrow。
- 示例应用：Vite + TypeScript。

## 包结构

```text
packages/core
  数据表结构、Arrow 转换、字段统计、绘图数组、分桶曲面。

packages/engine-duckdb
  浏览器内 DuckDB-Wasm 初始化、文件注册、CSV/Parquet/SQLite3 打开、SQL 查询。

packages/renderer-three
  Three.js 3D Viewer，支持点云和曲面。

packages/renderer-deck
  deck.gl PointCloudLayer 工厂，供后续高密度场景接入。

server
  FastAPI 后端，支持上传文件、查看 schema、SQL 查询、采样查询，返回 Arrow IPC。

examples/web-demo
  可运行示例，支持示例数据、文件上传、字段选择、点云/曲面切换。
```

## 数据流

```text
File(csv/parquet/sqlite)
  -> DuckDB-Wasm
  -> Arrow Table
  -> ColumnarTable
  -> PlotArrays / SurfaceMesh
  -> Three.js 或 deck.gl

大文件模式：

File(csv/parquet/sqlite)
  -> FastAPI upload
  -> server DuckDB
  -> Arrow IPC stream
  -> ColumnarTable
  -> PlotArrays / SurfaceMesh
  -> Three.js 或 deck.gl
```

## MVP 范围

1. CSV / Parquet / SQLite3 文件类型识别。
2. CSV / Parquet 通过 DuckDB-Wasm 直接读取。
3. SQLite3 通过 DuckDB sqlite extension 读取首个表。
4. Arrow 查询结果转换为库内部列式表。
5. 支持字段 X/Y/Z/Color 映射。
6. 支持 3D 点云。
7. 支持 X/Y 分桶并聚合 Z 的 3D 曲面。
8. 支持示例数据，便于无外部文件时验证。
9. 提供 FastAPI 后端，支持服务端上传、schema、query、sample。

## 性能约束

- 原始数据不进入 React/Vue 状态。
- 核心绘图数据使用 TypedArray。
- 点云使用 BufferGeometry。
- 查询默认限制行数，后续通过 LOD、tile 和服务端预聚合扩展。
- CSV 大文件建议导入后转 Parquet/Arrow 缓存。
- 大文件、SQLite 多表、长 SQL 查询优先走 FastAPI 后端。

## 后续方向

- Web Worker 中运行转换和采样。
- WebGPU Renderer。
- GPU picking。
- 多表 SQLite 选择器。
- OPFS 缓存。
- 归因分析插件：SHAP、IC、分组收益、特征交互。
