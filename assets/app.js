/* DeepDOSReasoner demo — interactive DOS prediction explorer.
 * Loads data/edos.json + data/phdos.json (built by tools/prepare_data.py) and
 * renders each material's four curves with Plotly. No build step. */

"use strict";

/* ----- editable links ------------------------------------------------------
 * Replace PAPER_URL with the arXiv / DOI / journal link when available. */
const PAPER_URL = ""; // e.g. "https://arxiv.org/abs/XXXX.XXXXX"
const CODE_URL = "https://github.com/gomes-lab/deep-dos-reasoner";
/* -------------------------------------------------------------------------- */

const TRACES = [
  { key: "label", name: "DFT (ground truth)", color: "#3a3a42", width: 3, dash: "solid" },
  { key: "dos_reasoner", name: "DeepDOSReasoner", color: "#c81d4e", width: 2.6, dash: "solid" },
  { key: "mat2spec", name: "Mat2Spec", color: "#1f77b4", width: 1.6, dash: "dot" },
  { key: "dostransformer", name: "DOSTransformer", color: "#e07b00", width: 1.6, dash: "dash" },
];

const AXES = {
  edos: { x: "Energy E − E_F (eV)", y: "Density of states (a.u.)", fermi: true },
  phdos: { x: "Frequency (cm⁻¹)", y: "Phonon DOS (a.u.)", fermi: false },
};

const state = {
  kind: "edos",
  data: { edos: null, phdos: null },
  selected: { edos: null, phdos: null }, // mpid
  search: "",
  sort: "rank",
};

const el = {
  list: document.getElementById("material-list"),
  search: document.getElementById("search"),
  sort: document.getElementById("sort"),
  title: document.getElementById("mat-title"),
  meta: document.getElementById("mat-meta"),
  metrics: document.getElementById("mat-metrics"),
  plot: document.getElementById("plot"),
  tabs: Array.from(document.querySelectorAll(".tab")),
};

/* ---------- helpers ---------- */

// Wrap trailing digit runs in <sub> for chemical formulas (As2 -> As<sub>2</sub>).
function formulaHTML(formula, mpid) {
  if (!formula) return mpid;
  return formula.replace(/(\d+)/g, "<sub>$1</sub>");
}

function fmt(n) {
  if (n === null || n === undefined) return "—";
  if (n === 0) return "0";
  const a = Math.abs(n);
  if (a >= 1000 || a < 0.001) return n.toExponential(2);
  return n.toPrecision(3);
}

function bestBaseline(m) {
  return m.mse.mat2spec <= m.mse.dostransformer
    ? { name: "Mat2Spec", mse: m.mse.mat2spec }
    : { name: "DOSTransformer", mse: m.mse.dostransformer };
}

function currentData() { return state.data[state.kind]; }
function xAxisFor(bundle, m) { return bundle.x || m.x; }

/* ---------- list rendering ---------- */

function filteredMaterials() {
  const bundle = currentData();
  const q = state.search.trim().toLowerCase();
  let items = bundle.materials.filter((m) => {
    if (!q) return true;
    return (
      (m.formula && m.formula.toLowerCase().includes(q)) ||
      m.mpid.toLowerCase().includes(q)
    );
  });
  const sort = state.sort;
  items = items.slice().sort((a, b) => {
    if (sort === "improvement") return (b.improvement || 0) - (a.improvement || 0);
    if (sort === "formula") return (a.formula || a.mpid).localeCompare(b.formula || b.mpid);
    return a.rank - b.rank;
  });
  return items;
}

function renderList() {
  const items = filteredMaterials();
  el.list.innerHTML = "";
  if (!items.length) {
    const li = document.createElement("li");
    li.className = "list-empty";
    li.textContent = "No materials match your search.";
    el.list.appendChild(li);
    return;
  }
  const selected = state.selected[state.kind];
  const frag = document.createDocumentFragment();
  items.forEach((m) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "mat-item" + (m.mpid === selected ? " is-active" : "");
    btn.setAttribute("role", "option");
    btn.setAttribute("aria-selected", m.mpid === selected ? "true" : "false");
    btn.dataset.mpid = m.mpid;
    const imp = m.improvement ? `${m.improvement}× lower` : "";
    btn.innerHTML =
      `<span class="mat-rank">#${m.rank}</span>` +
      `<span class="mat-formula">${formulaHTML(m.formula, m.mpid)}</span>` +
      (imp ? `<span class="mat-badge">${imp}</span>` : "");
    btn.addEventListener("click", () => select(m.mpid));
    li.appendChild(btn);
    frag.appendChild(li);
  });
  el.list.appendChild(frag);
}

/* ---------- plot rendering ---------- */

function materialByMpid(mpid) {
  return currentData().materials.find((m) => m.mpid === mpid);
}

function renderPlot(m) {
  const bundle = currentData();
  const ax = AXES[state.kind];
  const x = xAxisFor(bundle, m);

  const traces = TRACES.map((t) => ({
    x,
    y: m.curves[t.key],
    name: t.name,
    type: "scatter",
    mode: "lines",
    line: { color: t.color, width: t.width, dash: t.dash, shape: "spline", smoothing: 0.6 },
    hovertemplate: `${t.name}<br>%{x:.3g} · %{y:.3g}<extra></extra>`,
  }));

  const shapes = [];
  if (ax.fermi) {
    shapes.push({
      type: "line", x0: 0, x1: 0, yref: "paper", y0: 0, y1: 1,
      line: { color: "#b3b3ba", width: 1, dash: "dot" },
    });
  }

  const layout = {
    margin: { l: 56, r: 16, t: 10, b: 48 },
    height: 440,
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: { family: "-apple-system, Segoe UI, Roboto, sans-serif", size: 13, color: "#34343b" },
    xaxis: { title: { text: ax.x }, zeroline: false, gridcolor: "#eef0f3", ticks: "outside", ticklen: 4 },
    yaxis: { title: { text: ax.y }, zeroline: false, rangemode: "tozero", gridcolor: "#eef0f3", ticks: "outside", ticklen: 4 },
    hovermode: "x unified",
    legend: { orientation: "h", y: 1.12, x: 0, font: { size: 12 } },
    shapes,
    annotations: ax.fermi
      ? [{ x: 0, y: 1, yref: "paper", yanchor: "bottom", text: "E_F", showarrow: false, font: { size: 10, color: "#9a9aa2" } }]
      : [],
  };

  const config = {
    responsive: true,
    displaylogo: false,
    modeBarButtonsToRemove: ["select2d", "lasso2d", "autoScale2d", "toggleSpikelines"],
    toImageButtonOptions: { filename: `${state.kind}_${m.mpid}`, format: "png", scale: 2 },
  };

  Plotly.react(el.plot, traces, layout, config);
}

function renderMeta(m) {
  el.title.innerHTML = `${formulaHTML(m.formula, m.mpid)}`;
  const cifLink = m.hasCif
    ? ` · <a href="data/structures/${m.mpid}.cif" download>Download .cif</a>`
    : "";
  const mpUrl = `https://materialsproject.org/materials/${m.mpid}`;
  el.meta.innerHTML =
    `<a href="${mpUrl}" target="_blank" rel="noopener">${m.mpid}</a>` +
    ` · ${state.kind === "edos" ? "electronic" : "phonon"} DOS` +
    cifLink;

  const bb = bestBaseline(m);
  const dsr = m.mse.dos_reasoner;
  const imp = m.improvement ? ` → <b>${m.improvement}× lower error</b>` : "";
  el.metrics.innerHTML =
    `<span class="metric-chip">MSE vs. DFT — ` +
    `DeepDOSReasoner <b>${fmt(dsr)}</b>, ` +
    `${bb.name} ${fmt(bb.mse)}</span>${imp}`;
}

function select(mpid) {
  state.selected[state.kind] = mpid;
  const m = materialByMpid(mpid);
  if (!m) return;
  renderMeta(m);
  renderPlot(m);
  // update active styling without rebuilding the whole list
  el.list.querySelectorAll(".mat-item").forEach((b) => {
    const on = b.dataset.mpid === mpid;
    b.classList.toggle("is-active", on);
    b.setAttribute("aria-selected", on ? "true" : "false");
  });
}

/* ---------- tab / control wiring ---------- */

function defaultSelection() {
  const items = filteredMaterials();
  const prev = state.selected[state.kind];
  if (prev && items.some((m) => m.mpid === prev)) return prev;
  return items.length ? items[0].mpid : null;
}

function refresh() {
  renderList();
  const mpid = defaultSelection();
  if (mpid) select(mpid);
}

function setTabUI(kind) {
  el.tabs.forEach((t) => {
    const on = t.dataset.kind === kind;
    t.classList.toggle("is-active", on);
    t.setAttribute("aria-selected", on ? "true" : "false");
  });
}

function switchKind(kind, { push = true } = {}) {
  if (kind === state.kind) return;
  state.kind = kind;
  setTabUI(kind);
  if (push && window.history && history.replaceState) {
    history.replaceState(null, "", `?kind=${kind}#demo`);
  }
  refresh();
}

function wire() {
  el.tabs.forEach((t) => t.addEventListener("click", () => switchKind(t.dataset.kind)));
  el.search.addEventListener("input", () => { state.search = el.search.value; renderList(); });
  el.sort.addEventListener("change", () => { state.sort = el.sort.value; refresh(); });

  // paper link: enable only if configured
  const paper = document.getElementById("paper-link");
  if (PAPER_URL) {
    paper.href = PAPER_URL;
  } else {
    paper.textContent = "Paper (coming soon)";
    paper.classList.add("is-disabled");
    paper.setAttribute("aria-disabled", "true");
    paper.removeAttribute("target");
  }
  document.getElementById("code-link").href = CODE_URL;
  const cf = document.getElementById("code-link-foot");
  if (cf) cf.href = CODE_URL;
}

async function loadJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

async function init() {
  wire();
  try {
    const [edos, phdos] = await Promise.all([
      loadJSON("data/edos.json"),
      loadJSON("data/phdos.json"),
    ]);
    state.data.edos = edos;
    state.data.phdos = phdos;
    // Honor a shareable ?kind=phdos / ?kind=edos deep link.
    const wanted = new URLSearchParams(location.search).get("kind");
    if (wanted === "phdos" || wanted === "edos") {
      state.kind = wanted;
      setTabUI(wanted);
    }
    refresh();
  } catch (err) {
    el.list.innerHTML = `<li class="list-empty">Could not load demo data (${err.message}).</li>`;
    el.title.textContent = "Data unavailable";
    console.error(err);
  }
}

document.addEventListener("DOMContentLoaded", init);
