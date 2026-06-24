# PLAN-001 Web MVP 结果

## 完成内容

1. 创建 TypeScript monorepo。
2. 新增 `@analysis3d/core`：
   - 列式表结构。
   - Arrow IPC / Arrow Table 转换。
   - 数值字段统计。
   - 点云绘图数组。
   - X/Y 分桶曲面。
   - 金融风格示例数据。
3. 新增 `@analysis3d/engine-duckdb`：
   - DuckDB-Wasm 初始化。
   - CSV / Parquet / SQLite3 文件识别和打开。
   - SQL 查询和 sample 查询。
4. 新增 `@analysis3d/renderer-three`：
   - Three.js Viewer。
   - 点云渲染。
   - 曲面渲染。
   - OrbitControls 交互。
5. 新增 `@analysis3d/renderer-deck`：
   - deck.gl PointCloudLayer 工厂。
6. 新增 FastAPI 后端：
   - `GET /health`
   - `POST /datasets`
   - `GET /datasets`
   - `GET /datasets/{dataset_id}/schema`
   - `POST /datasets/{dataset_id}/sample`
   - `POST /datasets/{dataset_id}/query`
7. 新增 `examples/web-demo`：
   - 示例数据。
   - 浏览器 DuckDB-Wasm 上传。
   - FastAPI 后端上传。
   - 字段选择。
   - 点云/曲面切换。

## 验证结果

- `npm install` 通过。
- `npm run build` 通过。
- `npm run typecheck` 通过。
- `python -m compileall server/analysis3d_server` 通过。
- `pip install -e server` 已在 `server/.venv` 中通过。
- FastAPI `/health` 检查通过。
- FastAPI 临时 CSV 上传和 `/sample` Arrow 返回验证通过。
- Vite dev server 启动地址：`http://127.0.0.1:5173/`。
- Web demo 浏览器 DuckDB-Wasm 临时 CSV 上传验证通过，200 行渲染为 200 个点。
- Playwright 桌面视口点云 canvas 像素检查通过。
- Playwright 桌面视口曲面 canvas 像素检查通过。
- Playwright 移动视口 canvas 像素检查通过。
- Playwright OrbitControls 拖拽交互验证通过。
- Playwright 控制台检查：0 errors，0 warnings。

## 2026-06-25 复核

- 补充 `.gitignore`，避免提交 `__pycache__`、`*.egg-info`、`.pytest_cache`、`.ruff_cache` 等 Python 生成物。
- 重新执行 `npm run build`，通过；Vite 仍提示 DuckDB-Wasm chunk 体积较大，这是 MVP 预期限制。
- 重新执行 `npm run typecheck`，通过。
- 重新执行 `npm run build -w @analysis3d/renderer-deck`，通过。
- 使用 `server/.venv/bin/python -m compileall server/analysis3d_server`，通过。
- 使用 Playwright 复核 `http://127.0.0.1:5173/`：
  - 桌面视口点云渲染 80,000 点，canvas 像素非空且有颜色变化。
  - 桌面视口曲面渲染 5,184 个网格值，canvas 像素非空且有颜色变化。
  - 移动视口 390x844 下曲面 canvas 尺寸为 390x574，像素检查通过。
  - 浏览器 DuckDB-Wasm 上传临时 CSV 后，点云渲染 4 个点。
  - 控制台检查为 0 errors、0 warnings；DuckDB-Wasm 仅输出 info 日志。
- 由于本机 8000 端口已有其他服务占用，FastAPI 复核使用 8001：
  - `/health` 返回 `{"status":"ok"}`。
  - 上传临时 CSV 后 schema 字段为 `feature_a`、`feature_b`、`target`、`color`。
  - `/sample` 返回 `application/vnd.apache.arrow.stream`，PyArrow 读取为 4 行 4 列。

## 已知限制

- SQLite3 MVP 默认读取第一个表，后续应增加表选择器。
- 浏览器模式默认对查询结果采样，超大文件应优先走 FastAPI 后端或服务端预聚合。
- WebGPU renderer 尚未实现，当前默认是 Three.js WebGL renderer。
- `preserveDrawingBuffer` 已做成可配置项，库默认关闭，demo 为像素验证开启。
