import {
  applyFilters,
  applyTransformPipeline,
  arrowIpcToColumnar,
  createAnalysisConfig,
  createBinnedSurface,
  createDemoFinancialTable,
  createPlotArrays,
  getNumericColumnNames,
  parseAnalysisConfig,
  profileTable,
  stringifyAnalysisConfig,
  type AnalysisConfig,
  type ColumnarTable,
  type FieldProfile,
  type FilterDiagnostics,
  type FilterSpec,
  type PlotMapping,
  type TransformPipelineDiagnostics,
  type TransformStep
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
          <p>Interactive data workbench</p>
        </div>
      </header>

      <section class="panel">
        <div class="panel-title">
          <h2>Data</h2>
          <span id="source-name">demo_financial_ticks</span>
        </div>
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
        <div class="panel-title">
          <h2>Filter</h2>
          <span id="filter-count">0 active</span>
        </div>
        <label class="field">
          <span>Field</span>
          <select id="filter-field"></select>
        </label>
        <label class="field">
          <span>Type</span>
          <select id="filter-type">
            <option value="numberRange">Number range</option>
            <option value="category">Category</option>
            <option value="timeRange">Time range</option>
            <option value="null">Null check</option>
          </select>
        </label>
        <div id="number-filter-controls" class="sub-controls">
          <label>
            <span>Min</span>
            <input id="filter-min" type="number" step="any" />
          </label>
          <label>
            <span>Max</span>
            <input id="filter-max" type="number" step="any" />
          </label>
        </div>
        <div id="category-filter-controls" class="stacked-control hidden">
          <label>
            <span>Values</span>
            <select id="filter-category-values" multiple size="5"></select>
          </label>
          <label class="field compact-field">
            <span>Mode</span>
            <select id="filter-category-op">
              <option value="in">Include</option>
              <option value="notIn">Exclude</option>
            </select>
          </label>
        </div>
        <div id="time-filter-controls" class="sub-controls hidden">
          <label>
            <span>Start</span>
            <input id="filter-start" type="date" />
          </label>
          <label>
            <span>End</span>
            <input id="filter-end" type="date" />
          </label>
        </div>
        <div id="null-filter-controls" class="hidden">
          <label class="field compact-field">
            <span>Null</span>
            <select id="filter-null-op">
              <option value="isNotNull">Is not null</option>
              <option value="isNull">Is null</option>
            </select>
          </label>
        </div>
        <button id="add-filter" type="button">添加筛选</button>
        <div id="filter-list" class="item-list"></div>
      </section>

      <section class="panel">
        <div class="panel-title">
          <h2>Prepare</h2>
          <span id="transform-count">0 steps</span>
        </div>
        <label class="field">
          <span>Step</span>
          <select id="transform-type">
            <option value="zscore">Z-score</option>
            <option value="clip">Clip</option>
            <option value="rank">Rank</option>
            <option value="log">Log</option>
          </select>
        </label>
        <label class="field">
          <span>Field</span>
          <select id="transform-field"></select>
        </label>
        <label class="field">
          <span>Group</span>
          <select id="transform-group"></select>
        </label>
        <label class="field">
          <span>Output</span>
          <input id="transform-output" />
        </label>
        <div id="clip-controls" class="sub-controls hidden">
          <label>
            <span>Low Q</span>
            <input id="clip-low-q" type="number" min="0" max="1" step="0.01" value="0.01" />
          </label>
          <label>
            <span>High Q</span>
            <input id="clip-high-q" type="number" min="0" max="1" step="0.01" value="0.99" />
          </label>
        </div>
        <div id="rank-controls" class="sub-controls hidden">
          <label>
            <span>Method</span>
            <select id="rank-method">
              <option value="percentile">Percentile</option>
              <option value="average">Average</option>
              <option value="dense">Dense</option>
              <option value="ordinal">Ordinal</option>
            </select>
          </label>
          <label>
            <span>Order</span>
            <select id="rank-order">
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          </label>
        </div>
        <div id="log-controls" class="sub-controls hidden">
          <label>
            <span>Offset</span>
            <input id="log-offset" type="number" step="any" value="0" />
          </label>
          <label>
            <span>Base</span>
            <select id="log-base">
              <option value="e">e</option>
              <option value="10">10</option>
              <option value="2">2</option>
            </select>
          </label>
        </div>
        <button id="add-transform" type="button">添加预处理</button>
        <div id="transform-list" class="item-list"></div>
      </section>

      <section class="panel">
        <div class="panel-title">
          <h2>View</h2>
          <span id="render-count">0</span>
        </div>
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

      <section class="panel">
        <div class="panel-title">
          <h2>Config</h2>
          <span>JSON</span>
        </div>
        <div class="button-row">
          <button id="export-config" type="button">导出</button>
          <button id="import-config" type="button">导入</button>
        </div>
        <textarea id="config-json" spellcheck="false"></textarea>
      </section>

      <div id="status" class="status">Ready</div>
    </aside>

    <main class="workspace">
      <div class="workspace-top">
        <div class="metric">
          <span>Source</span>
          <strong id="source-rows">0</strong>
        </div>
        <div class="metric">
          <span>Filtered</span>
          <strong id="filtered-rows">0</strong>
        </div>
        <div class="metric">
          <span>Prepared</span>
          <strong id="prepared-rows">0</strong>
        </div>
        <div class="metric">
          <span>Fields</span>
          <strong id="field-count">0</strong>
        </div>
      </div>
      <div id="viewer" class="viewer" aria-label="Analysis3D viewer"></div>
    </main>

    <aside class="inspector">
      <section class="panel">
        <div class="panel-title">
          <h2>Diagnostics</h2>
          <span id="diagnostic-summary">0 warnings</span>
        </div>
        <div id="diagnostics" class="diagnostics"></div>
      </section>
      <section class="panel fill-panel">
        <div class="panel-title">
          <h2>Fields</h2>
          <span id="profile-count">0</span>
        </div>
        <div id="profile-list" class="profile-list"></div>
      </section>
    </aside>
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
const sourceNameElement = requiredElement<HTMLSpanElement>("source-name");
const sourceRows = requiredElement<HTMLElement>("source-rows");
const filteredRows = requiredElement<HTMLElement>("filtered-rows");
const preparedRows = requiredElement<HTMLElement>("prepared-rows");
const fieldCount = requiredElement<HTMLElement>("field-count");
const renderCount = requiredElement<HTMLElement>("render-count");
const diagnosticSummary = requiredElement<HTMLElement>("diagnostic-summary");
const diagnosticsElement = requiredElement<HTMLDivElement>("diagnostics");
const profileCount = requiredElement<HTMLElement>("profile-count");
const profileList = requiredElement<HTMLDivElement>("profile-list");
const filterField = requiredElement<HTMLSelectElement>("filter-field");
const filterType = requiredElement<HTMLSelectElement>("filter-type");
const filterMin = requiredElement<HTMLInputElement>("filter-min");
const filterMax = requiredElement<HTMLInputElement>("filter-max");
const filterStart = requiredElement<HTMLInputElement>("filter-start");
const filterEnd = requiredElement<HTMLInputElement>("filter-end");
const filterCategoryValues = requiredElement<HTMLSelectElement>("filter-category-values");
const filterCategoryOp = requiredElement<HTMLSelectElement>("filter-category-op");
const filterNullOp = requiredElement<HTMLSelectElement>("filter-null-op");
const filterCount = requiredElement<HTMLElement>("filter-count");
const addFilterButton = requiredElement<HTMLButtonElement>("add-filter");
const filterList = requiredElement<HTMLDivElement>("filter-list");
const transformType = requiredElement<HTMLSelectElement>("transform-type");
const transformField = requiredElement<HTMLSelectElement>("transform-field");
const transformGroup = requiredElement<HTMLSelectElement>("transform-group");
const transformOutput = requiredElement<HTMLInputElement>("transform-output");
const clipLowQ = requiredElement<HTMLInputElement>("clip-low-q");
const clipHighQ = requiredElement<HTMLInputElement>("clip-high-q");
const rankMethod = requiredElement<HTMLSelectElement>("rank-method");
const rankOrder = requiredElement<HTMLSelectElement>("rank-order");
const logOffset = requiredElement<HTMLInputElement>("log-offset");
const logBase = requiredElement<HTMLSelectElement>("log-base");
const addTransformButton = requiredElement<HTMLButtonElement>("add-transform");
const transformCount = requiredElement<HTMLElement>("transform-count");
const transformList = requiredElement<HTMLDivElement>("transform-list");
const xField = requiredElement<HTMLSelectElement>("x-field");
const yField = requiredElement<HTMLSelectElement>("y-field");
const zField = requiredElement<HTMLSelectElement>("z-field");
const colorField = requiredElement<HTMLSelectElement>("color-field");
const exportConfigButton = requiredElement<HTMLButtonElement>("export-config");
const importConfigButton = requiredElement<HTMLButtonElement>("import-config");
const configJson = requiredElement<HTMLTextAreaElement>("config-json");
const modeButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-mode]")];
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

let sourceTable: ColumnarTable | undefined;
let preparedTable: ColumnarTable | undefined;
let sourceProfiles: FieldProfile[] = [];
let preparedProfiles: FieldProfile[] = [];
let filters: FilterSpec[] = [];
let transforms: TransformStep[] = [];
let filterDiagnostics: FilterDiagnostics | undefined;
let transformDiagnostics: TransformPipelineDiagnostics | undefined;
let currentMode: RenderMode = "point";
let sourceName = "demo_financial_ticks";
let duckSession: DuckDbSession | undefined;

sampleButton.addEventListener("click", () => {
  setStatus("Loading sample data");
  setSourceTable(createDemoFinancialTable(), "demo_financial_ticks");
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
    setSourceTable(table, file.name);
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
    setSourceTable(table, file.name);
  });
});

filterField.addEventListener("change", () => {
  syncFilterTypeToField();
  renderFilterControls();
});
filterType.addEventListener("change", () => renderFilterControls());
addFilterButton.addEventListener("click", () => addFilter());

transformType.addEventListener("change", () => {
  renderTransformControls();
  suggestOutputName();
});
transformField.addEventListener("change", () => suggestOutputName());
addTransformButton.addEventListener("click", () => addTransform());

for (const select of [xField, yField, zField, colorField]) {
  select.addEventListener("change", () => {
    renderCurrentTable();
    updateConfigPreview();
  });
}

rowLimit.addEventListener("change", () => {
  renderCurrentTable();
  updateConfigPreview();
});

for (const button of modeButtons) {
  button.addEventListener("click", () => {
    currentMode = button.dataset.mode as RenderMode;
    modeButtons.forEach((entry) => entry.classList.toggle("active", entry === button));
    renderCurrentTable();
    updateConfigPreview();
  });
}

exportConfigButton.addEventListener("click", () => {
  configJson.value = stringifyAnalysisConfig(buildCurrentConfig());
  setStatus("Config exported");
});

importConfigButton.addEventListener("click", () => {
  try {
    const config = parseAnalysisConfig(configJson.value);
    applyImportedConfig(config);
    setStatus("Config imported");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error));
  }
});

setSourceTable(createDemoFinancialTable(), "demo_financial_ticks");

function setSourceTable(table: ColumnarTable, name: string): void {
  sourceTable = table;
  sourceName = name;
  filters = [];
  transforms = [];
  sourceProfiles = profileTable(table);
  currentMode = "point";
  modeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === currentMode);
  });
  sourceNameElement.textContent = name;
  applyPipeline();
  setStatus(`Loaded ${name}`);
}

function applyPipeline(mapping?: Partial<PlotMapping>): void {
  if (!sourceTable) {
    return;
  }

  const previousMapping = mapping ?? readPlotMapping();
  const filterResult = applyFilters(sourceTable, filters);
  const transformResult = applyTransformPipeline(filterResult.table, transforms);
  preparedTable = transformResult.table;
  filterDiagnostics = filterResult.diagnostics;
  transformDiagnostics = transformResult.diagnostics;
  preparedProfiles = profileTable(preparedTable);

  sourceRows.textContent = formatNumber(sourceTable.rowCount);
  filteredRows.textContent = formatNumber(filterResult.diagnostics.outputRows);
  preparedRows.textContent = formatNumber(preparedTable.rowCount);
  fieldCount.textContent = String(preparedTable.columns.length);
  renderFilterBuilder();
  renderTransformBuilder();
  renderLists();
  renderProfiles();
  renderDiagnostics();
  populatePlotSelects(previousMapping);
  renderCurrentTable();
  updateConfigPreview();
}

function renderCurrentTable(): void {
  if (!preparedTable) {
    return;
  }

  const numericFields = getNumericColumnNames(preparedTable);
  if (preparedTable.rowCount === 0 || numericFields.length === 0) {
    viewer.clearData();
    renderCount.textContent = "0";
    setStatus("No rows available after filters");
    return;
  }

  try {
    if (currentMode === "surface") {
      const surface = createBinnedSurface(preparedTable, {
        x: xField.value,
        y: yField.value,
        z: zField.value
      }, {
        binsX: 72,
        binsY: 72,
        aggregate: "mean"
      });
      viewer.setSurface(surface);
      renderCount.textContent = formatNumber(surface.values.length);
    } else {
      const plot = createPlotArrays(preparedTable, {
        x: xField.value,
        y: yField.value,
        z: zField.value,
        color: colorField.value
      }, {
        maxPoints: Math.min(getLimit(), preparedTable.rowCount)
      });
      viewer.setPointCloud(plot);
      renderCount.textContent = formatNumber(plot.count);
    }
    setStatus(`${currentMode === "surface" ? "Surface" : "Point cloud"} rendered`);
  } catch (error) {
    viewer.clearData();
    renderCount.textContent = "0";
    setStatus(error instanceof Error ? error.message : String(error));
  }
}

function renderFilterBuilder(): void {
  const fieldNames = sourceProfiles.map((profile) => profile.name);
  const previous = filterField.value;
  const selected = fieldNames.includes(previous) ? previous : pickDefaultFilterField();
  populateSelect(filterField, fieldNames, selected);
  if (filterField.value !== previous || !previous) {
    syncFilterTypeToField();
  }
  renderFilterControls();
}

function renderFilterControls(): void {
  const profile = sourceProfiles.find((entry) => entry.name === filterField.value);
  const type = filterType.value;
  toggleControl("number-filter-controls", type === "numberRange");
  toggleControl("category-filter-controls", type === "category");
  toggleControl("time-filter-controls", type === "timeRange");
  toggleControl("null-filter-controls", type === "null");

  if (!profile) {
    return;
  }
  if (type === "numberRange" && profile.numericStats) {
    filterMin.placeholder = String(roundNumber(profile.numericStats.min));
    filterMax.placeholder = String(roundNumber(profile.numericStats.max));
    if (!filterMin.value) {
      filterMin.value = String(roundNumber(profile.numericStats.min));
    }
    if (!filterMax.value) {
      filterMax.value = String(roundNumber(profile.numericStats.max));
    }
  }
  if (type === "category") {
    const values = profile.categoryTopValues ?? [];
    filterCategoryValues.replaceChildren(...values.map((entry) => {
      const option = document.createElement("option");
      option.value = entry.value;
      option.textContent = `${entry.value} (${formatNumber(entry.count)})`;
      option.selected = values.length <= 8;
      return option;
    }));
  }
  if (type === "timeRange" && profile.timeStats) {
    if (!filterStart.value) {
      filterStart.value = toDateInput(profile.timeStats.min);
    }
    if (!filterEnd.value) {
      filterEnd.value = toDateInput(profile.timeStats.max);
    }
  }
}

function addFilter(): void {
  const field = filterField.value;
  if (!field) {
    setStatus("请选择筛选字段");
    return;
  }

  const type = filterType.value;
  let filter: FilterSpec;
  if (type === "numberRange") {
    filter = {
      type: "numberRange",
      field,
      min: parseOptionalNumber(filterMin.value),
      max: parseOptionalNumber(filterMax.value)
    };
  } else if (type === "category") {
    const values = [...filterCategoryValues.selectedOptions].map((option) => option.value);
    if (values.length === 0) {
      setStatus("请选择至少一个类别值");
      return;
    }
    filter = {
      type: "category",
      field,
      op: filterCategoryOp.value as "in" | "notIn",
      values
    };
  } else if (type === "timeRange") {
    filter = {
      type: "timeRange",
      field,
      start: filterStart.value || undefined,
      end: filterEnd.value || undefined
    };
  } else {
    filter = {
      type: "null",
      field,
      op: filterNullOp.value as "isNull" | "isNotNull"
    };
  }

  filters = [...filters, filter];
  applyPipeline();
}

function renderTransformBuilder(): void {
  const numericFields = preparedTable ? getNumericColumnNames(preparedTable) : [];
  const selectedField = transformField.value;
  populateSelect(transformField, numericFields, selectedField);
  const groupOptions = ["", ...preparedProfiles.map((profile) => profile.name)];
  populateSelect(transformGroup, groupOptions, transformGroup.value);
  transformGroup.options[0].textContent = "None";
  renderTransformControls();
  if (!transformOutput.value) {
    suggestOutputName();
  }
}

function renderTransformControls(): void {
  const type = transformType.value;
  toggleControl("clip-controls", type === "clip");
  toggleControl("rank-controls", type === "rank");
  toggleControl("log-controls", type === "log");
}

function addTransform(): void {
  const field = transformField.value;
  const output = transformOutput.value.trim();
  if (!field || !output) {
    setStatus("请选择预处理字段并填写输出字段名");
    return;
  }

  const groupBy = transformGroup.value ? [transformGroup.value] : undefined;
  const type = transformType.value;
  let step: TransformStep;
  if (type === "clip") {
    step = {
      type: "clip",
      field,
      output,
      groupBy,
      lowerQuantile: parseOptionalNumber(clipLowQ.value),
      upperQuantile: parseOptionalNumber(clipHighQ.value)
    };
  } else if (type === "rank") {
    step = {
      type: "rank",
      field,
      output,
      groupBy,
      method: rankMethod.value as "ordinal" | "average" | "dense" | "percentile",
      ascending: rankOrder.value !== "desc"
    };
  } else if (type === "log") {
    step = {
      type: "log",
      field,
      output,
      offset: parseOptionalNumber(logOffset.value) ?? 0,
      base: parseLogBase(logBase.value)
    };
  } else {
    step = {
      type: "zscore",
      field,
      output,
      groupBy
    };
  }

  transforms = [...transforms, step];
  transformOutput.value = "";
  applyPipeline({ x: output });
}

function renderLists(): void {
  filterCount.textContent = `${filters.filter((filter) => filter.enabled !== false).length} active`;
  transformCount.textContent = `${transforms.filter((step) => step.enabled !== false).length} steps`;
  filterList.replaceChildren(...filters.map((filter, index) => renderListItem({
    title: describeFilter(filter),
    enabled: filter.enabled !== false,
    index,
    kind: "filter"
  })));
  transformList.replaceChildren(...transforms.map((step, index) => renderListItem({
    title: describeTransform(step),
    enabled: step.enabled !== false,
    index,
    kind: "transform"
  })));
  attachListEvents();
}

function renderListItem(options: {
  title: string;
  enabled: boolean;
  index: number;
  kind: "filter" | "transform";
}): HTMLElement {
  const row = document.createElement("div");
  row.className = `list-item ${options.enabled ? "" : "disabled"}`;
  row.innerHTML = `
    <span>${escapeHtml(options.title)}</span>
    <div>
      <button type="button" data-toggle-${options.kind}="${options.index}">${options.enabled ? "Off" : "On"}</button>
      <button type="button" data-remove-${options.kind}="${options.index}">Del</button>
    </div>
  `;
  return row;
}

function attachListEvents(): void {
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-remove-filter]")) {
    button.addEventListener("click", () => {
      filters = filters.filter((_, index) => index !== Number(button.dataset.removeFilter));
      applyPipeline();
    });
  }
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-toggle-filter]")) {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.toggleFilter);
      filters = filters.map((filter, entryIndex) => entryIndex === index
        ? { ...filter, enabled: filter.enabled === false }
        : filter);
      applyPipeline();
    });
  }
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-remove-transform]")) {
    button.addEventListener("click", () => {
      transforms = transforms.filter((_, index) => index !== Number(button.dataset.removeTransform));
      applyPipeline();
    });
  }
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-toggle-transform]")) {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.toggleTransform);
      transforms = transforms.map((step, entryIndex) => entryIndex === index
        ? { ...step, enabled: step.enabled === false }
        : step);
      applyPipeline();
    });
  }
}

function renderProfiles(): void {
  profileCount.textContent = `${preparedProfiles.length} fields`;
  profileList.replaceChildren(...preparedProfiles.map((profile) => {
    const item = document.createElement("div");
    item.className = "profile-row";
    const detail = profile.numericStats
      ? `${roundNumber(profile.numericStats.min)} .. ${roundNumber(profile.numericStats.max)}`
      : profile.timeStats
        ? `${toDateInput(profile.timeStats.min)} .. ${toDateInput(profile.timeStats.max)}`
        : `${profile.distinctCount ?? 0} distinct`;
    item.innerHTML = `
      <div>
        <strong>${escapeHtml(profile.name)}</strong>
        <span>${escapeHtml(profile.kind)} · null ${formatPercent(profile.nullRate)}</span>
      </div>
      <small>${escapeHtml(detail)}</small>
    `;
    return item;
  }));
}

function renderDiagnostics(): void {
  const warnings = [
    ...(filterDiagnostics?.warnings ?? []),
    ...(transformDiagnostics?.warnings ?? [])
  ];
  diagnosticSummary.textContent = `${warnings.length} warnings`;
  const rows = [
    `source ${formatNumber(sourceTable?.rowCount ?? 0)}`,
    `filtered ${formatNumber(filterDiagnostics?.outputRows ?? 0)}`,
    `prepared ${formatNumber(preparedTable?.rowCount ?? 0)}`,
    `filters ${filterDiagnostics?.activeFilters ?? 0}`,
    `steps ${transformDiagnostics?.steps.length ?? 0}`
  ];
  diagnosticsElement.replaceChildren(
    ...rows.map((text) => {
      const item = document.createElement("div");
      item.className = "diagnostic-row";
      item.textContent = text;
      return item;
    }),
    ...warnings.map((warning) => {
      const item = document.createElement("div");
      item.className = "diagnostic-row warning";
      item.textContent = warning;
      return item;
    })
  );
}

function populatePlotSelects(mapping: Partial<PlotMapping>): void {
  if (!preparedTable) {
    return;
  }
  const numericFields = getNumericColumnNames(preparedTable);
  if (numericFields.length === 0) {
    for (const select of [xField, yField, zField, colorField]) {
      select.replaceChildren();
    }
    return;
  }
  populateSelect(xField, numericFields, mapping.x ?? pickField(numericFields, ["imbalance", "feature_a"], 0));
  populateSelect(yField, numericFields, mapping.y ?? pickField(numericFields, ["volatility", "feature_b"], 1));
  populateSelect(zField, numericFields, mapping.z ?? pickField(numericFields, ["future_return", "return", "score"], 2));
  populateSelect(colorField, numericFields, mapping.color ?? pickField(numericFields, ["shap", "volume", "return"], Math.min(3, numericFields.length - 1)));
}

function buildCurrentConfig(): AnalysisConfig {
  return createAnalysisConfig({
    filters,
    transforms,
    plot: {
      type: currentMode,
      mapping: readPlotMapping()
    },
    sampling: {
      type: "limit",
      limit: getLimit()
    }
  });
}

function applyImportedConfig(config: AnalysisConfig): void {
  filters = config.filters ?? [];
  transforms = config.transforms ?? [];
  currentMode = config.plot.type;
  rowLimit.value = String(config.sampling?.limit ?? getLimit());
  modeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === currentMode);
  });
  applyPipeline(config.plot.mapping);
}

function updateConfigPreview(): void {
  configJson.value = stringifyAnalysisConfig(buildCurrentConfig());
}

function readPlotMapping(): PlotMapping {
  return {
    x: xField.value,
    y: yField.value,
    z: zField.value,
    color: colorField.value
  };
}

function syncFilterTypeToField(): void {
  filterMin.value = "";
  filterMax.value = "";
  filterStart.value = "";
  filterEnd.value = "";
  const profile = sourceProfiles.find((entry) => entry.name === filterField.value);
  if (!profile) {
    return;
  }
  if (profile.kind === "number" || profile.kind === "boolean") {
    filterType.value = "numberRange";
  } else if (profile.kind === "date" || profile.kind === "datetime") {
    filterType.value = "timeRange";
  } else {
    filterType.value = "category";
  }
}

function suggestOutputName(): void {
  const field = transformField.value;
  if (!field) {
    transformOutput.value = "";
    return;
  }
  const type = transformType.value;
  transformOutput.value = type === "zscore"
    ? `${field}_z`
    : type === "clip"
      ? `${field}_clip`
      : type === "rank"
        ? `${field}_rank`
        : `log_${field}`;
}

function describeFilter(filter: FilterSpec): string {
  if (filter.type === "numberRange") {
    return `${filter.field}: ${filter.min ?? "-inf"} .. ${filter.max ?? "inf"}`;
  }
  if (filter.type === "category") {
    return `${filter.field}: ${filter.op} ${filter.values.join(", ")}`;
  }
  if (filter.type === "timeRange") {
    return `${filter.field}: ${filter.start ?? "-inf"} .. ${filter.end ?? "inf"}`;
  }
  if (filter.type === "null") {
    return `${filter.field}: ${filter.op}`;
  }
  return `${filter.op} group`;
}

function describeTransform(step: TransformStep): string {
  const group = step.groupBy?.length ? ` by ${step.groupBy.join(",")}` : "";
  return `${step.output} = ${step.type}(${step.field})${group}`;
}

function populateSelect(select: HTMLSelectElement, values: string[], preferred?: string): void {
  select.replaceChildren(...values.map((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value || "None";
    return option;
  }));
  if (preferred && values.includes(preferred)) {
    select.value = preferred;
  } else if (values.length > 0) {
    select.value = values[0];
  }
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

function parseOptionalNumber(value: string): number | undefined {
  if (value.trim() === "") {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseLogBase(value: string): "e" | 10 | 2 {
  if (value === "10") {
    return 10;
  }
  if (value === "2") {
    return 2;
  }
  return "e";
}

function pickField(fields: string[], hints: string[], fallbackIndex: number): string {
  const matched = fields.find((field) => hints.some((hint) => field.toLowerCase().includes(hint)));
  return matched ?? fields[Math.min(fallbackIndex, fields.length - 1)];
}

function pickDefaultFilterField(): string {
  return sourceProfiles.find((profile) => profile.kind === "number")?.name
    ?? sourceProfiles.find((profile) => profile.kind === "datetime" || profile.kind === "date")?.name
    ?? sourceProfiles.find((profile) => profile.kind === "category")?.name
    ?? sourceProfiles[0]?.name
    ?? "";
}

function toggleControl(id: string, visible: boolean): void {
  requiredElement<HTMLElement>(id).classList.toggle("hidden", !visible);
}

function formatNumber(value: number): string {
  return value.toLocaleString();
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function roundNumber(value: number): number {
  if (!Number.isFinite(value)) {
    return value;
  }
  return Number(value.toPrecision(6));
}

function toDateInput(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
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
    getConfig: () => buildCurrentConfig(),
    renderState: () => ({
      mode: currentMode,
      source: sourceTable?.rowCount ?? 0,
      filtered: filterDiagnostics?.outputRows ?? 0,
      prepared: preparedTable?.rowCount ?? 0,
      rendered: renderCount.textContent,
      fields: preparedTable?.columns.length ?? 0,
      filters: filters.length,
      transforms: transforms.length
    })
  }
});
