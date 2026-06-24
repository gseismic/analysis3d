# Analysis3D FastAPI 后端

这个后端用于大文件或服务端分析模式。它用 FastAPI 接收上传文件，用 DuckDB 查询 CSV / Parquet / SQLite3，并以 Arrow IPC stream 返回查询结果。

## 启动

```bash
cd server
python -m venv .venv
source .venv/bin/activate
pip install -e .
uvicorn analysis3d_server.main:app --reload --host 127.0.0.1 --port 8000
```

## 接口

- `GET /health`
- `POST /datasets`：上传 `file`。
- `GET /datasets`：列出当前服务内存中的数据集。
- `GET /datasets/{dataset_id}/schema`
- `POST /datasets/{dataset_id}/sample`
- `POST /datasets/{dataset_id}/query`

查询接口中的 SQL 可以直接访问临时视图 `source`：

```sql
SELECT * FROM source LIMIT 100000
```
