import {
  arrowIpcToColumnar,
  createBinnedSurface,
  createDemoFinancialTable,
  createPlotArrays,
  getNumericColumnNames,
  type ColumnarTable
} from "@analysis3d/core";
import { DuckDbSession } from "@analysis3d/engine-duckdb";
import { Analysis3DViewer } from "@analysis3d/renderer-three";
import duckdbEhWasm from "@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url";
import duckdbEhWorker from "@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url";
import duckdbMvpWasm from "@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url";
import duckdbMvpWorker from "@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url";
import "./styles.css";

type RenderMode = "point" | "surface";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) {
  throw new Error("缺少 #app");
}

app.innerHTML = `
  <div class="shell">
    <aside class="sidebar">
      <header class="brand">
        <div>
          <h1>Analysis3D</h1>
          <p>3D Data Analysis</p>
        </div>
      </header>

      <section class="panel">
        <div class="button-row">
          <button id="sample-button" type="button">示例数据</button>
        </div>
        <label class="file-drop">
          <input id="file-input" type="file" accept=".csv,.tsv,.parquet,.pq,.sqlite,.sqlite3,.db" />
          <span id="file-name">选择 CSV / Parquet / SQLite3</span>
        </label>
        <div class="button-row">
          <button id="browser-load" type="button">浏览器加载</button>
          <button id="backend-load" type="button">后端加载</button>
        </div>
        <label class="field">
          <span>FastAPI</span>
          <input id="backend-url" value="http://127.0.0.1:8000" />
        </label>
      </section>

      <section class="panel">
        <div class="mode-tabs" role="tablist">
          <button class="active" data-mode="point" type="button">点云</button>
          <button data-mode="surface" type="button">曲面</button>
        </div>
        <label class="field">
          <span>X</span>
          <select id="x-field"></select>
        </label>
        <label class="field">
          <span>Y</span>
          <select id="y-field"></select>
        </label>
        <label class="field">
          <span>Z</span>
          <select id="z-field"></select>
        </label>
        <label class="field">
          <span>Color</span>
          <select id="color-field"></select>
        </label>
        <label class="field">
          <span>Rows</span>
          <input id="row-limit" type="number" min="1000" max="2000000" step="1000" value="100000" />
        </label>
      </section>

      <section class="panel metrics">
        <div>
          <span>Rows</span>
          <strong id="row-count">0</strong>
        </div>
        <div>
          <span>Rendered</span>
          <strong id="render-count">0</strong>
        </div>
        <div>
          <span>Fields</span>
          <strong id="field-count">0</strong>
        </div>
      </section>

      <div id="status" class="status">Ready</div>
    </aside>

    <main class="workspace">
      <div id="viewer" class="viewer" aria-label="Analysis3D viewer"></div>
    </main>
  </div>
`;

const viewerElement = requiredElement<HTMLDivElement>("viewer");
const viewer = new Analysis3DViewer(viewerElement, { preserveDrawingBuffer: true });
const sampleButton = requiredElement<HTMLButtonElement>("sample-button");
const browserLoadButton = requiredElement<HTMLButtonElement>("browser-load");
const backendLoadButton = requiredElement<HTMLButtonElement>("backend-load");
const fileInput = requiredElement<HTMLInputElement>("file-input");
const fileName = requiredElement<HTMLSpanElement>("file-name");
const backendUrl = requiredElement<HTMLInputElement>("backend-url");
const rowLimit = requiredElement<HTMLInputElement>("row-limit");
const statusElement = requiredElement<HTMLDivElement>("status");
const xField = requiredElement<HTMLSelectElement>("x-field");
const yField = requiredElement<HTMLSelectElement>("y-field");
const zField = requiredElement<HTMLSelectElement>("z-field");
const colorField = requiredElement<HTMLSelectElement>("color-field");
const rowCount = requiredElement<HTMLElement>("row-count");
const renderCount = requiredElement<HTMLElement>("render-count");
const fieldCount = requiredElement<HTMLElement>("field-count");
const modeButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-mode]")];

let currentTable: ColumnarTable | undefined;
let currentMode: RenderMode = "point";
let duckSession: DuckDbSession | undefined;
const duckDbBundles = {
  mvp: {
    mainModule: duckdbMvpWasm,
    mainWorker: duckdbMvpWorker
  },
  eh: {
    mainModule: duckdbEhWasm,
    mainWorker: duckdbEhWorker
  }
};

sampleButton.addEventListener("click", () => {
  setStatus("Loading sample data");
  setTable(createDemoFinancialTable(), "demo_financial_ticks");
});

fileInput.addEventListener("change", () => {
  fileName.textContent = selectedFile()?.name ?? "选择 CSV / Parquet / SQLite3";
});

browserLoadButton.addEventListener("click", async () => {
  const file = selectedFile();
  if (!file) {
    setStatus("请选择文件");
    return;
  }
  await runTask("Browser DuckDB loading", async () => {
    await duckSession?.close();
    duckSession = await DuckDbSession.create({ bundles: duckDbBundles });
    await duckSession.openFile(file);
    const table = await duckSession.sample(getLimit());
    setTable(table, file.name);
  });
});

backendLoadButton.addEventListener("click", async () => {
  const file = selectedFile();
  if (!file) {
    setStatus("请选择文件");
    return;
  }
  await runTask("FastAPI backend loading", async () => {
    const form = new FormData();
    form.append("file", file);
    const baseUrl = trimTrailingSlash(backendUrl.value);
    const uploadResponse = await fetch(`${baseUrl}/datasets`, {
      method: "POST",
      body: form
    });
    if (!uploadResponse.ok) {
      throw new Error(await uploadResponse.text());
    }
    const upload = await uploadResponse.json() as { dataset_id: string };
    const sampleResponse = await fetch(`${baseUrl}/datasets/${upload.dataset_id}/sample`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ limit: getLimit() })
    });
    if (!sampleResponse.ok) {
      throw new Error(await sampleResponse.text());
    }
    const table = arrowIpcToColumnar(await sampleResponse.arrayBuffer(), file.name);
    setTable(table, file.name);
  });
});

for (const select of [xField, yField, zField, colorField]) {
  select.addEventListener("change", () => renderCurrentTable());
}

rowLimit.addEventListener("change", () => {
  if (currentTable) {
    renderCurrentTable();
  }
});

for (const button of modeButtons) {
  button.addEventListener("click", () => {
    currentMode = button.dataset.mode as RenderMode;
    modeButtons.forEach((entry) => entry.classList.toggle("active", entry === button));
    renderCurrentTable();
  });
}

setTable(createDemoFinancialTable(), "demo_financial_ticks");

function setTable(table: ColumnarTable, sourceName: string): void {
  currentTable = table;
  const numericFields = getNumericColumnNames(table);
  populateSelect(xField, numericFields);
  populateSelect(yField, numericFields);
  populateSelect(zField, numericFields);
  populateSelect(colorField, numericFields);
  selectDefaults(numericFields);
  rowCount.textContent = table.rowCount.toLocaleString();
  fieldCount.textContent = String(table.columns.length);
  setStatus(`Loaded ${sourceName}`);
  renderCurrentTable();
}

function renderCurrentTable(): void {
  if (!currentTable) {
    return;
  }

  try {
    if (currentMode === "surface") {
      const surface = createBinnedSurface(currentTable, {
        x: xField.value,
        y: yField.value,
        z: zField.value
      }, {
        binsX: 72,
        binsY: 72,
        aggregate: "mean"
      });
      viewer.setSurface(surface);
      renderCount.textContent = surface.values.length.toLocaleString();
    } else {
      const plot = createPlotArrays(currentTable, {
        x: xField.value,
        y: yField.value,
        z: zField.value,
        color: colorField.value
      }, {
        maxPoints: Math.min(getLimit(), currentTable.rowCount)
      });
      viewer.setPointCloud(plot);
      renderCount.textContent = plot.count.toLocaleString();
    }
    setStatus(`${currentMode === "surface" ? "Surface" : "Point cloud"} rendered`);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error));
  }
}

function selectDefaults(fields: string[]): void {
  if (fields.length === 0) {
    return;
  }
  xField.value = pickField(fields, ["imbalance", "feature_a"], 0);
  yField.value = pickField(fields, ["volatility", "feature_b"], 1);
  zField.value = pickField(fields, ["future_return", "return", "score"], 2);
  colorField.value = pickField(fields, ["shap", "volume", "return"], Math.min(3, fields.length - 1));
}

function pickField(fields: string[], hints: string[], fallbackIndex: number): string {
  const matched = fields.find((field) => hints.some((hint) => field.toLowerCase().includes(hint)));
  return matched ?? fields[Math.min(fallbackIndex, fields.length - 1)];
}

function populateSelect(select: HTMLSelectElement, fields: string[]): void {
  select.replaceChildren(...fields.map((field) => {
    const option = document.createElement("option");
    option.value = field;
    option.textContent = field;
    return option;
  }));
}

async function runTask(label: string, task: () => Promise<void>): Promise<void> {
  setStatus(label);
  try {
    await task();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error));
  }
}

function selectedFile(): File | undefined {
  return fileInput.files?.[0];
}

function getLimit(): number {
  return Math.max(1_000, Math.min(2_000_000, Number(rowLimit.value) || 100_000));
}

function setStatus(message: string): void {
  statusElement.textContent = message;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`缺少元素: ${id}`);
  }
  return element as T;
}

Object.assign(window, {
  __analysis3d: {
    viewer,
    renderState: () => ({
      mode: currentMode,
      rows: currentTable?.rowCount ?? 0,
      rendered: renderCount.textContent
    })
  }
});
