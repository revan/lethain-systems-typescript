import {
  CategoryScale,
  Chart,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
  type ChartDataset,
} from "chart.js";
import { parse, type Model, type Snapshot } from "systems";
import "./style.css";

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Legend, Tooltip);

// Bundle the repository's example models into the page.
const EXAMPLES = import.meta.glob<string>("../../examples/*.txt", {
  query: "?raw",
  import: "default",
  eager: true,
});
const exampleNames = Object.keys(EXAMPLES)
  .map((path) => path.split("/").pop()!.replace(/\.txt$/, ""))
  .sort();
const exampleText = (name: string): string => EXAMPLES[`../../examples/${name}.txt`] ?? "";

const DEFAULT_MODEL = exampleText("hiring");
const STORAGE_KEY = "systems-playground:model";
const MAX_ROUNDS = 10000;

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const modelInput = $<HTMLTextAreaElement>("model");
const roundsInput = $<HTMLInputElement>("rounds");
const statusEl = $<HTMLDivElement>("status");
const checkboxesEl = $<HTMLDivElement>("checkboxes");
const exampleSelect = $<HTMLSelectElement>("example");
const tableEl = $<HTMLTableElement>("table");
const canvas = $<HTMLCanvasElement>("chart");

// --- State ---------------------------------------------------------------

/** Stocks the user has unchecked. Tracking the deselected set means newly added stocks start checked. */
const hidden = new Set<string>();
/** Stable color slot per stock name, so a color follows its stock across edits. */
const colorSlots = new Map<string, number>();

interface RunResult {
  columns: string[];
  rows: Snapshot[];
}
let lastGood: RunResult | null = null;

// --- Colors --------------------------------------------------------------

const PALETTE = {
  light: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"],
  dark: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#0ca30c", "#9085e9", "#e66767"],
};
// Past eight series the hues repeat, so repeats get a dash pattern as a second cue.
const DASHES: number[][] = [[], [6, 4], [2, 3], [10, 3, 2, 3]];

const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
const cssVar = (name: string): string => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/**
 * Give each stock a color slot. Surviving stocks keep theirs; stocks that left
 * the model free their slot; new stocks take the lowest free slot.
 */
function assignSlots(names: string[]): void {
  const present = new Set(names);
  for (const name of colorSlots.keys()) if (!present.has(name)) colorSlots.delete(name);
  const used = new Set(colorSlots.values());
  let next = 0;
  for (const name of names) {
    if (colorSlots.has(name)) continue;
    while (used.has(next)) next++;
    colorSlots.set(name, next);
    used.add(next);
  }
}

function slotFor(name: string): number {
  return colorSlots.get(name) ?? 0;
}

function seriesStyle(name: string): { color: string; dash: number[] } {
  const colors = darkQuery.matches ? PALETTE.dark : PALETTE.light;
  const slot = slotFor(name);
  return {
    color: colors[slot % colors.length]!,
    dash: DASHES[Math.floor(slot / colors.length) % DASHES.length]!,
  };
}

// --- Model evaluation ----------------------------------------------------

function errorText(err: unknown): string {
  if (err instanceof Error) {
    const msg = err.message || String(err);
    return err.name && err.name !== "Error" ? `${err.name}: ${msg}` : msg;
  }
  return String(err);
}

function readRounds(): number {
  const n = Math.floor(Number(roundsInput.value));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, MAX_ROUNDS);
}

function evaluate(): void {
  const txt = modelInput.value;
  let model: Model;
  let rows: Snapshot[];
  try {
    model = parse(txt);
    rows = model.run(readRounds());
  } catch (err) {
    showStatus(errorText(err), "error");
    // Keep rendering the last good run so the chart doesn't flash while typing.
    return;
  }
  const columns = model.stocks.filter((s) => s.show).map((s) => s.name);
  // A repeated `[X]` creates duplicate stocks upstream; chart each name once.
  lastGood = { columns: [...new Set(columns)], rows };
  assignSlots(lastGood.columns);
  showStatus(
    columns.length === 0
      ? "Model has no visible stocks."
      : `${lastGood.columns.length} stock${lastGood.columns.length === 1 ? "" : "s"}, ${rows.length - 1} rounds`,
    "ok",
  );
  renderCheckboxes();
  renderOutput();
}

function showStatus(text: string, kind: "ok" | "error"): void {
  statusEl.textContent = text;
  statusEl.dataset.kind = kind;
  modelInput.setAttribute("aria-invalid", String(kind === "error"));
}

// --- Rendering -----------------------------------------------------------

function renderCheckboxes(): void {
  if (!lastGood) return;
  checkboxesEl.replaceChildren(
    ...lastGood.columns.map((name) => {
      const label = document.createElement("label");
      label.className = "check";
      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = !hidden.has(name);
      box.addEventListener("change", () => {
        if (box.checked) hidden.delete(name);
        else hidden.add(name);
        renderOutput();
      });
      const swatch = document.createElement("span");
      swatch.className = "swatch";
      const { color, dash } = seriesStyle(name);
      swatch.style.background = dash.length ? `repeating-linear-gradient(90deg, ${color} 0 4px, transparent 4px 7px)` : color;
      label.append(box, swatch, document.createTextNode(name));
      return label;
    }),
  );
}

function selectedColumns(): string[] {
  return lastGood ? lastGood.columns.filter((c) => !hidden.has(c)) : [];
}

/** Chart.js can't plot ±Infinity or NaN, so those become gaps. */
function plotValue(snapshot: Snapshot, name: string): number | null {
  const v = snapshot.get(name)?.value;
  return v === undefined || !Number.isFinite(v) ? null : v;
}

let chart: Chart<"line", (number | null)[], number> | null = null;

function renderChart(): void {
  if (!lastGood) return;
  const { rows } = lastGood;
  const datasets: ChartDataset<"line", (number | null)[]>[] = selectedColumns().map((name) => {
    const { color, dash } = seriesStyle(name);
    return {
      label: name,
      data: rows.map((r) => plotValue(r, name)),
      borderColor: color,
      backgroundColor: color,
      borderDash: dash,
      borderWidth: 2,
      pointRadius: rows.length > 40 ? 0 : 3,
      pointHoverRadius: 5,
      pointHoverBorderColor: cssVar("--surface"),
      pointHoverBorderWidth: 2,
      tension: 0,
    };
  });
  const labels = rows.map((_, i) => i);

  if (chart) {
    chart.data.labels = labels;
    chart.data.datasets = datasets;
    chart.update("none");
    return;
  }
  // Theme colors are baked in here; a color-scheme change destroys and rebuilds the chart.
  const text = cssVar("--text-secondary");
  const grid = cssVar("--grid");
  const axis = (title: string) => ({
    title: { display: true, text: title, color: text },
    ticks: { color: text, maxTicksLimit: 11, maxRotation: 0 },
    grid: { color: grid },
    border: { color: grid },
  });
  chart = new Chart<"line", (number | null)[], number>(canvas, {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: "index", intersect: false },
      scales: { x: axis("Round"), y: { ...axis("Value"), beginAtZero: true } },
      plugins: {
        legend: {
          position: "bottom",
          labels: { usePointStyle: true, pointStyle: "line", boxWidth: 24, color: cssVar("--text-primary") },
        },
        tooltip: {
          backgroundColor: cssVar("--tooltip-bg"),
          titleColor: cssVar("--tooltip-text"),
          bodyColor: cssVar("--tooltip-text"),
          itemSort: (a, b) => (b.parsed.y ?? 0) - (a.parsed.y ?? 0),
        },
      },
    },
  });
}

function renderTable(): void {
  if (!lastGood) return;
  const cols = selectedColumns();
  const thead = document.createElement("thead");
  const headRow = thead.insertRow();
  for (const h of ["Round", ...cols]) {
    const th = document.createElement("th");
    th.textContent = h;
    th.scope = "col";
    headRow.append(th);
  }
  const tbody = document.createElement("tbody");
  lastGood.rows.forEach((snapshot, i) => {
    const tr = tbody.insertRow();
    tr.insertCell().textContent = String(i);
    // Use the library's own number formatting so values match `systems-run`.
    for (const c of cols) tr.insertCell().textContent = snapshot.get(c)?.toString() ?? "";
  });
  tableEl.replaceChildren(thead, tbody);
}

let activeTab: "chart" | "table" = "chart";

function renderOutput(): void {
  if (activeTab === "chart") renderChart();
  else renderTable();
}

// --- Wiring --------------------------------------------------------------

function debounce(fn: () => void, ms: number): () => void {
  let t: ReturnType<typeof setTimeout> | undefined;
  return () => {
    clearTimeout(t);
    t = setTimeout(fn, ms);
  };
}

function saveModel(): void {
  try {
    localStorage.setItem(STORAGE_KEY, modelInput.value);
  } catch {
    // Storage may be unavailable (private mode); the page works without it.
  }
}

function loadModel(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? DEFAULT_MODEL;
  } catch {
    return DEFAULT_MODEL;
  }
}

const update = debounce(() => {
  evaluate();
  saveModel();
}, 150);

modelInput.addEventListener("input", update);
roundsInput.addEventListener("input", update);

// Let Tab insert two spaces in the editor instead of moving focus (Esc then Tab still moves focus).
let escaped = false;
modelInput.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    escaped = true;
    return;
  }
  if (e.key === "Tab" && !e.shiftKey && !escaped) {
    e.preventDefault();
    document.execCommand("insertText", false, "  ");
  }
  escaped = false;
});

for (const name of exampleNames) exampleSelect.add(new Option(name, name));
exampleSelect.addEventListener("change", () => {
  if (!exampleSelect.value) return;
  modelInput.value = exampleText(exampleSelect.value);
  exampleSelect.value = "";
  hidden.clear();
  evaluate();
  saveModel();
});

$("select-all").addEventListener("click", () => {
  hidden.clear();
  renderCheckboxes();
  renderOutput();
});
$("select-none").addEventListener("click", () => {
  for (const c of lastGood?.columns ?? []) hidden.add(c);
  renderCheckboxes();
  renderOutput();
});

for (const tab of ["chart", "table"] as const) {
  $(`tab-${tab}`).addEventListener("click", () => {
    activeTab = tab;
    for (const t of ["chart", "table"] as const) {
      $(`tab-${t}`).setAttribute("aria-selected", String(t === tab));
      $(`view-${t}`).hidden = t !== tab;
    }
    renderOutput();
  });
}

darkQuery.addEventListener("change", () => {
  renderCheckboxes();
  chart?.destroy();
  chart = null;
  renderOutput();
});

modelInput.value = loadModel();
evaluate();
