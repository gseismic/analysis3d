# Analysis3D

Analysis3D 是一个 Web 端通用 3D 数据分析可视化库 MVP。当前版本使用 DuckDB-Wasm 读取 CSV / Parquet / SQLite3，使用 Apache Arrow 做列式数据交换，默认用 Three.js 渲染 3D 点云和分桶曲面，并提供 deck.gl 图层工厂作为高性能扩展出口。

## 快速开始

```bash
npm install
npm run build
npm run dev
```

打开 Vite 输出的本地地址后，可以直接点击示例数据，或上传 CSV / Parquet / SQLite3 文件。

## FastAPI 后端

大文件或服务端分析模式可以启动 FastAPI 后端：

```bash
cd server
python -m venv .venv
source .venv/bin/activate
pip install -e .
uvicorn analysis3d_server.main:app --reload --host 127.0.0.1 --port 8000
```

后端提供上传、schema、sample、query 接口，并以 Arrow IPC 返回查询结果。详见 `server/README.md`。

## 包

- `@analysis3d/core`：列式表、Arrow 转换、统计、点云数组、曲面网格。
- `@analysis3d/engine-duckdb`：DuckDB-Wasm 文件导入和查询。
- `@analysis3d/renderer-three`：Three.js Viewer。
- `@analysis3d/renderer-deck`：deck.gl PointCloudLayer 工厂。
- `@analysis3d/web-demo`：可运行 Web 示例。

## 示例代码

```ts
import { createPlotArrays } from "@analysis3d/core";
import { Analysis3DViewer } from "@analysis3d/renderer-three";

const viewer = new Analysis3DViewer(document.querySelector("#viewer")!);
const plot = createPlotArrays(table, {
  x: "feature_a",
  y: "feature_b",
  z: "future_return",
  color: "volume"
});

viewer.setPointCloud(plot);
```
