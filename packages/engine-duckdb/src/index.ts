import { arrowTableToColumnar, type ColumnarTable } from "@analysis3d/core";
import * as duckdb from "@duckdb/duckdb-wasm";

export type DataSourceKind = "csv" | "parquet" | "sqlite" | "unknown";

export interface DuckDbSessionOptions {
  bundles?: duckdb.DuckDBBundles;
  tableName?: string;
  viewName?: string;
}

export interface OpenFileResult {
  kind: DataSourceKind;
  fileName: string;
  viewName: string;
  tableName?: string;
}

export class DuckDbSession {
  readonly db: duckdb.AsyncDuckDB;
  readonly connection: duckdb.AsyncDuckDBConnection;
  readonly viewName: string;

  private constructor(options: {
    db: duckdb.AsyncDuckDB;
    connection: duckdb.AsyncDuckDBConnection;
    viewName: string;
  }) {
    this.db = options.db;
    this.connection = options.connection;
    this.viewName = options.viewName;
  }

  static async create(options: DuckDbSessionOptions = {}): Promise<DuckDbSession> {
    const bundles = options.bundles ?? duckdb.getJsDelivrBundles();
    const bundle = await duckdb.selectBundle(bundles);
    const mainWorker = toAbsoluteUrl(bundle.mainWorker);
    const mainModule = toAbsoluteUrl(bundle.mainModule);
    const pthreadWorker = toAbsoluteUrl(bundle.pthreadWorker);
    if (!mainWorker || !mainModule) {
      throw new Error("DuckDB-Wasm bundle 缺少 main worker 或 wasm module");
    }
    const workerUrl = URL.createObjectURL(
      new Blob([`importScripts(${JSON.stringify(mainWorker)});`], { type: "text/javascript" })
    );
    const worker = new Worker(workerUrl);
    const logger = new duckdb.ConsoleLogger();
    const db = new duckdb.AsyncDuckDB(logger, worker);
    await db.instantiate(mainModule, pthreadWorker);
    URL.revokeObjectURL(workerUrl);
    const connection = await db.connect();
    return new DuckDbSession({
      db,
      connection,
      viewName: options.viewName ?? "source"
    });
  }

  async openFile(file: File, options: DuckDbSessionOptions = {}): Promise<OpenFileResult> {
    const kind = detectDataSourceKind(file.name);
    const viewName = options.viewName ?? this.viewName;
    const mountedName = sanitizeFileName(file.name);

    await registerFile(this.db, mountedName, file);

    if (kind === "csv") {
      await this.connection.query(
        `CREATE OR REPLACE VIEW ${quoteIdent(viewName)} AS SELECT * FROM read_csv_auto(${quoteLiteral(mountedName)}, SAMPLE_SIZE=-1)`
      );
      return { kind, fileName: file.name, viewName };
    }

    if (kind === "parquet") {
      await this.connection.query(
        `CREATE OR REPLACE VIEW ${quoteIdent(viewName)} AS SELECT * FROM read_parquet(${quoteLiteral(mountedName)})`
      );
      return { kind, fileName: file.name, viewName };
    }

    if (kind === "sqlite") {
      await this.connection.query("LOAD sqlite");
      await this.connection.query(
        `ATTACH ${quoteLiteral(mountedName)} AS uploaded_sqlite (TYPE sqlite)`
      );
      const tableName = options.tableName ?? await this.firstSqliteTable();
      await this.connection.query(
        `CREATE OR REPLACE VIEW ${quoteIdent(viewName)} AS SELECT * FROM uploaded_sqlite.main.${quoteIdent(tableName)}`
      );
      return { kind, fileName: file.name, viewName, tableName };
    }

    throw new Error(`暂不支持的文件类型: ${file.name}`);
  }

  async query(sql: string, name = "query"): Promise<ColumnarTable> {
    const result = await this.connection.query(sql);
    return arrowTableToColumnar(result, name);
  }

  async sample(limit = 100_000, name = "sample"): Promise<ColumnarTable> {
    return this.query(`SELECT * FROM ${quoteIdent(this.viewName)} LIMIT ${Math.max(1, limit)}`, name);
  }

  async schema(): Promise<ColumnarTable> {
    return this.query(`DESCRIBE SELECT * FROM ${quoteIdent(this.viewName)}`, "schema");
  }

  async close(): Promise<void> {
    await this.connection.close();
    await this.db.terminate();
  }

  private async firstSqliteTable(): Promise<string> {
    const tables = await this.query(
      "SELECT table_name FROM information_schema.tables WHERE table_catalog = 'uploaded_sqlite' AND table_schema = 'main' ORDER BY table_name LIMIT 1",
      "sqlite_tables"
    );
    const first = tables.getColumn("table_name")?.values[0];
    if (!first || typeof first !== "string") {
      throw new Error("SQLite 文件中没有可读取的表");
    }
    return first;
  }
}

function toAbsoluteUrl(url: string | null): string | null {
  if (!url) {
    return null;
  }
  if (typeof globalThis.location === "undefined") {
    return url;
  }
  return new URL(url, globalThis.location.href).href;
}

export function detectDataSourceKind(fileName: string): DataSourceKind {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".csv") || lower.endsWith(".tsv")) {
    return "csv";
  }
  if (lower.endsWith(".parquet") || lower.endsWith(".pq")) {
    return "parquet";
  }
  if (lower.endsWith(".sqlite") || lower.endsWith(".sqlite3") || lower.endsWith(".db")) {
    return "sqlite";
  }
  return "unknown";
}

export function quoteIdent(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

export function quoteLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function sanitizeFileName(name: string): string {
  return name.replaceAll(/[^\w.-]/g, "_");
}

async function registerFile(db: duckdb.AsyncDuckDB, name: string, file: File): Promise<void> {
  const runtimeDb = db as unknown as {
    registerFileHandle?: (
      name: string,
      file: File,
      protocol: duckdb.DuckDBDataProtocol,
      directIO: boolean
    ) => Promise<void>;
    registerFileBuffer?: (name: string, buffer: Uint8Array) => Promise<void>;
  };

  if (typeof runtimeDb.registerFileHandle === "function") {
    await runtimeDb.registerFileHandle(name, file, duckdb.DuckDBDataProtocol.BROWSER_FILEREADER, true);
    return;
  }

  if (typeof runtimeDb.registerFileBuffer !== "function") {
    throw new Error("当前 DuckDB-Wasm 版本不支持文件注册");
  }

  const buffer = new Uint8Array(await file.arrayBuffer());
  await runtimeDb.registerFileBuffer(name, buffer);
}
