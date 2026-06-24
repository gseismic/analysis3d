from __future__ import annotations

import os
import re
import tempfile
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import duckdb
import pyarrow as pa
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, Field

DataSourceKind = Literal["csv", "parquet", "sqlite"]

DATA_DIR = Path(os.environ.get("ANALYSIS3D_DATA_DIR", Path(tempfile.gettempdir()) / "analysis3d-data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)


@dataclass
class DatasetMeta:
    dataset_id: str
    file_name: str
    path: Path
    kind: DataSourceKind
    table_name: str | None = None


class QueryRequest(BaseModel):
    sql: str = Field(..., min_length=1)


class SampleRequest(BaseModel):
    limit: int = Field(100_000, ge=1, le=2_000_000)


DATASETS: dict[str, DatasetMeta] = {}

app = FastAPI(title="Analysis3D Server", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/datasets")
async def upload_dataset(file: UploadFile = File(...)) -> dict[str, object]:
    kind = detect_kind(file.filename or "")
    if kind is None:
        raise HTTPException(status_code=400, detail="仅支持 csv、parquet、sqlite、sqlite3、db 文件")

    dataset_id = uuid.uuid4().hex
    target = DATA_DIR / f"{dataset_id}-{safe_file_name(file.filename or 'dataset')}"
    with target.open("wb") as output:
        while chunk := await file.read(1024 * 1024):
            output.write(chunk)

    meta = DatasetMeta(
        dataset_id=dataset_id,
        file_name=file.filename or target.name,
        path=target,
        kind=kind,
    )

    if kind == "sqlite":
        meta.table_name = inspect_first_sqlite_table(meta)

    DATASETS[dataset_id] = meta
    schema = schema_for_dataset(meta)
    return {
        "dataset_id": dataset_id,
        "file_name": meta.file_name,
        "kind": meta.kind,
        "table_name": meta.table_name,
        "schema": schema,
    }


@app.get("/datasets")
def list_datasets() -> list[dict[str, object]]:
    return [
        {
            "dataset_id": item.dataset_id,
            "file_name": item.file_name,
            "kind": item.kind,
            "table_name": item.table_name,
        }
        for item in DATASETS.values()
    ]


@app.get("/datasets/{dataset_id}/schema")
def dataset_schema(dataset_id: str) -> dict[str, object]:
    meta = require_dataset(dataset_id)
    return {"dataset_id": dataset_id, "schema": schema_for_dataset(meta)}


@app.post("/datasets/{dataset_id}/sample")
def sample_dataset(dataset_id: str, request: SampleRequest) -> Response:
    meta = require_dataset(dataset_id)
    table = query_arrow(meta, f"SELECT * FROM source LIMIT {request.limit}")
    return arrow_response(table)


@app.post("/datasets/{dataset_id}/query")
def query_dataset(dataset_id: str, request: QueryRequest) -> Response:
    meta = require_dataset(dataset_id)
    table = query_arrow(meta, request.sql)
    return arrow_response(table)


def query_arrow(meta: DatasetMeta, sql: str) -> pa.Table:
    with duckdb.connect(database=":memory:") as connection:
        prepare_source_view(connection, meta)
        try:
            return connection.execute(sql).fetch_arrow_table()
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=400, detail=str(exc)) from exc


def schema_for_dataset(meta: DatasetMeta) -> list[dict[str, object]]:
    with duckdb.connect(database=":memory:") as connection:
        prepare_source_view(connection, meta)
        rows = connection.execute("DESCRIBE SELECT * FROM source").fetchall()
    return [
        {
            "name": row[0],
            "type": row[1],
            "nullable": row[2],
            "key": row[3],
            "default": row[4],
            "extra": row[5],
        }
        for row in rows
    ]


def prepare_source_view(connection: duckdb.DuckDBPyConnection, meta: DatasetMeta) -> None:
    path = quote_literal(str(meta.path))
    if meta.kind == "csv":
        connection.execute(f"CREATE VIEW source AS SELECT * FROM read_csv_auto({path}, SAMPLE_SIZE=-1)")
        return
    if meta.kind == "parquet":
        connection.execute(f"CREATE VIEW source AS SELECT * FROM read_parquet({path})")
        return

    load_sqlite(connection)
    connection.execute(f"ATTACH {path} AS uploaded_sqlite (TYPE sqlite)")
    table_name = meta.table_name or inspect_first_sqlite_table(meta)
    connection.execute(
        f"CREATE VIEW source AS SELECT * FROM uploaded_sqlite.main.{quote_ident(table_name)}"
    )


def inspect_first_sqlite_table(meta: DatasetMeta) -> str:
    with duckdb.connect(database=":memory:") as connection:
        load_sqlite(connection)
        connection.execute(f"ATTACH {quote_literal(str(meta.path))} AS uploaded_sqlite (TYPE sqlite)")
        rows = connection.execute(
            """
            SELECT table_name
            FROM information_schema.tables
            WHERE table_catalog = 'uploaded_sqlite' AND table_schema = 'main'
            ORDER BY table_name
            LIMIT 1
            """
        ).fetchall()
    if not rows:
        raise HTTPException(status_code=400, detail="SQLite 文件中没有可读取的表")
    return str(rows[0][0])


def load_sqlite(connection: duckdb.DuckDBPyConnection) -> None:
    try:
        connection.execute("INSTALL sqlite")
    except Exception:
        pass
    connection.execute("LOAD sqlite")


def arrow_response(table: pa.Table) -> Response:
    sink = pa.BufferOutputStream()
    with pa.ipc.new_stream(sink, table.schema) as writer:
        writer.write_table(table)
    return Response(
        content=sink.getvalue().to_pybytes(),
        media_type="application/vnd.apache.arrow.stream",
    )


def detect_kind(file_name: str) -> DataSourceKind | None:
    lower = file_name.lower()
    if lower.endswith(".csv") or lower.endswith(".tsv"):
        return "csv"
    if lower.endswith(".parquet") or lower.endswith(".pq"):
        return "parquet"
    if lower.endswith(".sqlite") or lower.endswith(".sqlite3") or lower.endswith(".db"):
        return "sqlite"
    return None


def require_dataset(dataset_id: str) -> DatasetMeta:
    meta = DATASETS.get(dataset_id)
    if meta is None:
        raise HTTPException(status_code=404, detail="dataset 不存在")
    return meta


def quote_ident(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


def quote_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def safe_file_name(file_name: str) -> str:
    return re.sub(r"[^\w.\-]", "_", file_name)


def run() -> None:
    import uvicorn

    uvicorn.run("analysis3d_server.main:app", host="127.0.0.1", port=8000, reload=True)
