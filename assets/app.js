/* DeepDOSReasoner demo — interactive DOS prediction explorer.
 * Loads data/data.js (window.DDR_DATA = {order, datasets}) and renders each
 * material's curves with Plotly. Datasets declare which trace keys they carry;
 * styling for each key lives in TRACE_STYLE below. No build step, no fetch. */

"use strict";

/* ----- editable links ------------------------------------------------------
 * While empty (""), the matching button shows "… (coming soon)" and is disabled,
 * so the page never links to a missing/404 target before publication.
 *   PAPER_URL: arXiv / DOI / journal link.
 *   CODE_URL : the code repository (e.g. https://github.com/gomes-lab/deep-dos-reasoner
 *              once it is public — it currently 404s, so it's disabled for now). */
const PAPER_URL = ""; // e.g. "https://arxiv.org/abs/XXXX.XXXXX"
const CODE_URL = "";  // e.g. "https://github.com/gomes-lab/deep-dos-reasoner"
// Full URL of the inference endpoint for the "upload a structure" block (see
// serve/). While empty (""), that block shows a "not connected yet" message.
//   e.g. "https://gomes-lab-deepdosreasoner.hf.space/predict"
const PREDICT_API = "https://yingheng-deepdosreasoner-demo.hf.space/predict";
/* -------------------------------------------------------------------------- */

// Per-curve styling, keyed by the trace key a dataset lists in its `traces`.
const TRACE_STYLE = {
  label:          { name: "DFT (ground truth)", color: "#3a3a42", width: 3,   dash: "solid" },
  dos_reasoner:   { name: "DeepDOSReasoner",     color: "#c81d4e", width: 2.6, dash: "solid" },
  mat2spec:       { name: "Mat2Spec",            color: "#1f77b4", width: 1.6, dash: "dot"   },
  dostransformer: { name: "DOSTransformer",      color: "#e07b00", width: 1.6, dash: "dash"  },
};

const state = {
  kind: null,
  data: null,     // window.DDR_DATA
  selected: {},   // kind -> material id
  search: "",
};

const el = {
  tabs: document.getElementById("tabs"),
  list: document.getElementById("material-list"),
  search: document.getElementById("search"),
  title: document.getElementById("mat-title"),
  meta: document.getElementById("mat-meta"),
  metrics: document.getElementById("mat-metrics"),
  plot: document.getElementById("plot"),
};

function dataset(kind = state.kind) { return state.data.datasets[kind]; }

// Wrap digit runs in <sub> for chemical formulas (As2 -> As<sub>2</sub>).
// formula/label/id come from data/data.js (trusted build output of
// tools/prepare_data.py), so innerHTML here is not an injection vector.
function formulaHTML(formula, fallback) {
  if (!formula) return fallback || "";
  return formula.replace(/(\d+)/g, "<sub>$1</sub>");
}

function fmt(n) {
  if (n === null || n === undefined) return "—";
  if (n === 0) return "0";
  const a = Math.abs(n);
  if (a >= 1000 || a < 0.001) return n.toExponential(2);
  return n.toPrecision(3);
}

/* ---------- material list ---------- */

function filteredMaterials() {
  const ds = dataset();
  const q = state.search.trim().toLowerCase();
  const items = ds.materials.filter((m) => {
    if (!q) return true;
    return (m.label && m.label.toLowerCase().includes(q)) ||
           (m.formula && m.formula.toLowerCase().includes(q)) ||
           m.id.toLowerCase().includes(q);
  });
  return items.slice().sort((a, b) => a.rank - b.rank); // best examples first
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
    btn.className = "mat-item" + (m.id === selected ? " is-active" : "");
    btn.setAttribute("aria-current", m.id === selected ? "true" : "false");
    btn.dataset.id = m.id;
    btn.textContent = m.label;
    btn.addEventListener("click", () => select(m.id));
    li.appendChild(btn);
    frag.appendChild(li);
  });
  el.list.appendChild(frag);
}

/* ---------- plot ---------- */

function materialById(id) { return dataset().materials.find((m) => m.id === id); }

function renderPlot(m) {
  const ds = dataset();
  const x = ds.x || m.x;

  const traces = ds.traces.map((key) => {
    const st = TRACE_STYLE[key] || { name: key, color: "#888", width: 2, dash: "solid" };
    return {
      x, y: m.curves[key], name: st.name, type: "scatter", mode: "lines",
      line: { color: st.color, width: st.width, dash: st.dash, shape: "spline", smoothing: 0.5 },
      hovertemplate: `${st.name}<br>%{x:.3g} · %{y:.3g}<extra></extra>`,
    };
  });
  // Spin-resolved DOS stores one channel negative, so allow a signed y-axis.
  const hasNeg = traces.some((t) => t.y.some((v) => v < 0));

  const shapes = [];
  const annotations = [];
  if (ds.fermi) {
    shapes.push({ type: "line", x0: 0, x1: 0, yref: "paper", y0: 0, y1: 1,
      line: { color: "#b3b3ba", width: 1, dash: "dot" } });
    annotations.push({ x: 0, y: 1, yref: "paper", yanchor: "bottom",
      text: "E_F", showarrow: false, font: { size: 10, color: "#9a9aa2" } });
  }
  if (hasNeg) {
    shapes.push({ type: "line", xref: "paper", x0: 0, x1: 1, y0: 0, y1: 0,
      line: { color: "#d0d2d8", width: 1 } });
  }

  const layout = {
    margin: { l: 58, r: 16, t: 10, b: 48 }, height: 440,
    paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)",
    font: { family: "-apple-system, Segoe UI, Roboto, sans-serif", size: 13, color: "#34343b" },
    xaxis: { title: { text: ds.xlabel }, zeroline: false, gridcolor: "#eef0f3", ticks: "outside", ticklen: 4 },
    yaxis: { title: { text: ds.ylabel }, zeroline: false, rangemode: hasNeg ? "normal" : "tozero",
             gridcolor: "#eef0f3", ticks: "outside", ticklen: 4 },
    hovermode: "x unified",
    legend: { orientation: "h", y: 1.12, x: 0, font: { size: 12 } },
    shapes, annotations,
  };
  const config = {
    responsive: true, displaylogo: false,
    modeBarButtonsToRemove: ["select2d", "lasso2d", "autoScale2d", "toggleSpikelines"],
    toImageButtonOptions: { filename: `${state.kind}_${m.id}`, format: "png", scale: 2 },
  };
  Plotly.react(el.plot, traces, layout, config);
}

/* ---------- 3D crystal structure (3Dmol) ----------
 * Structures are embedded in data/structures.js (window.DDR_STRUCTURES, keyed
 * by material id = mp-id) so the viewer works offline (file://), matching the
 * no-fetch design of data.js. Only the eDOS/phDOS benchmark entries carry a
 * CIF; case-study tabs have none, so the structure panel is hidden for them. */
const STRUCTURES = (typeof window !== "undefined" && window.DDR_STRUCTURES) || {};
let demoViewer = null;
let uploadViewer = null;

function has3Dmol() { return typeof window !== "undefined" && !!window.$3Dmol; }

function newViewer(host) {
  const v = window.$3Dmol.createViewer(host, { antialias: true });
  v.setBackgroundColor(0xffffff, 0);                 // transparent → CSS gradient shows through
  v.setViewStyle({ style: "outline", color: "#22242a", width: 0.04 }); // cel-shaded edges
  return v;
}

// Ball-and-stick with a subtle unit cell and a gentle auto-spin for a cleaner,
// more dynamic look than the default sphere/stick rendering.
function styleCrystal(viewer) {
  viewer.setStyle({}, { sphere: { scale: 0.30 }, stick: { radius: 0.16 } });
  try { viewer.addUnitCell(undefined, { box: { color: "#b9bdc6" } }); } catch (_) { /* no cell params */ }
  viewer.zoomTo();
  viewer.zoom(1.18);
  viewer.spin("y", 0.4);
  viewer.render();
  viewer.resize();
}

// Load `text` (CIF/VASP) into a viewer bound to `host`. Returns the viewer, or
// null with an empty-state message painted into host. `reuse` is the viewer to
// clear and reuse (its canvas stays in host); pass null to create a fresh one.
function loadStructure(host, text, format, reuse, emptyMsg) {
  if (!host) return null;
  // Paint an empty-state message; first stop any reused viewer's spin so its
  // animation loop doesn't keep drawing into a canvas we're about to remove.
  const paintEmpty = (msg) => {
    if (reuse) { try { reuse.spin(false); reuse.clear(); reuse.render(); } catch (_) {} }
    host.innerHTML = `<div class="struct-empty">${msg}</div>`;
    return null;
  };
  if (!has3Dmol() || !text) {
    return paintEmpty(!has3Dmol() ? "3D viewer failed to load." : (emptyMsg || "3D structure not available for this entry."));
  }
  let viewer = reuse;
  if (viewer) { try { viewer.spin(false); } catch (_) {} viewer.clear(); }
  else { host.innerHTML = ""; viewer = newViewer(host); }

  const tryFormats = format === "vasp" ? ["vasp", "cif"] : ["cif", "vasp"];
  let ok = false;
  for (const fmt of tryFormats) {
    viewer.clear();
    let model = null;
    try { model = viewer.addModel(text, fmt); } catch (_) { model = null; }
    const atoms = model ? model.selectedAtoms({}) : [];
    if (atoms.length) { ok = true; break; }
  }
  if (!ok) return paintEmpty("Couldn't parse this structure for preview.");
  styleCrystal(viewer);
  return viewer;
}

function showDemoStructure(m) {
  const host = document.getElementById("struct-view");
  const cap = document.getElementById("struct-cap");
  if (!host) return;
  const cif = m && STRUCTURES[m.id];
  demoViewer = loadStructure(host, cif, "cif", demoViewer, "3D structure not bundled for this case study.");
  if (cap) cap.style.visibility = demoViewer ? "visible" : "hidden";
}

function applyStructLayout() {
  const wrap = document.getElementById("demo-struct-wrap");
  if (!wrap) return;
  // Show the structure rail only on tabs that actually carry CIFs (eDOS/phDOS).
  wrap.hidden = !dataset().materials.some((m) => STRUCTURES[m.id]);
}

/* ---------- meta ---------- */

function mpLink(m) {
  const id = (m.meta && m.meta.parent) || m.id;
  return /^mp-\d+$/.test(id) ? `https://next-gen.materialsproject.org/materials/${id}` : null;
}

function renderMeta(m) {
  el.title.innerHTML = formulaHTML(m.formula, m.label);

  const bits = [];
  const link = mpLink(m);
  const idText = (m.meta && m.meta.parent) || m.id;
  bits.push(link ? `<a href="${link}" target="_blank" rel="noopener">${idText}</a>` : idText);
  if (m.cif) bits.push(`<a href="${m.cif}" download>Download .cif</a>`);
  el.meta.innerHTML = bits.join(" · ");

  if (m.mse && m.mse.dos_reasoner !== undefined) {
    let s = `<span class="metric-chip">MSE vs. DFT — DeepDOSReasoner <b>${fmt(m.mse.dos_reasoner)}</b>`;
    if (m.mse.mat2spec !== undefined && m.mse.dostransformer !== undefined) {
      const bbName = m.mse.mat2spec <= m.mse.dostransformer ? "Mat2Spec" : "DOSTransformer";
      s += `, ${bbName} ${fmt(Math.min(m.mse.mat2spec, m.mse.dostransformer))}</span>`;
      if (m.improvement) s += ` → <b>${m.improvement}× lower error</b>`;
    } else {
      s += `</span>`;
    }
    el.metrics.innerHTML = s;
  } else {
    el.metrics.innerHTML = "";
  }
}

function select(id) {
  state.selected[state.kind] = id;
  const m = materialById(id);
  if (!m) return;
  renderMeta(m);
  renderPlot(m);
  showDemoStructure(m);
  el.list.querySelectorAll(".mat-item").forEach((b) => {
    const on = b.dataset.id === id;
    b.classList.toggle("is-active", on);
    b.setAttribute("aria-current", on ? "true" : "false");
  });
}

/* ---------- tabs ---------- */

function buildTabs() {
  el.tabs.innerHTML = "";
  state.data.order.forEach((kind) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "tab";
    b.setAttribute("role", "tab");
    b.dataset.kind = kind;
    b.textContent = state.data.datasets[kind].label;
    b.addEventListener("click", () => switchKind(kind));
    el.tabs.appendChild(b);
  });
}

function setTabUI(kind) {
  el.tabs.querySelectorAll(".tab").forEach((t) => {
    const on = t.dataset.kind === kind;
    t.classList.toggle("is-active", on);
    t.setAttribute("aria-selected", on ? "true" : "false");
  });
}

function defaultSelection() {
  const items = filteredMaterials();
  const prev = state.selected[state.kind];
  if (prev && items.some((m) => m.id === prev)) return prev;
  return items.length ? items[0].id : null;
}

function refresh() {
  applyStructLayout();
  renderList();
  const id = defaultSelection();
  if (id) select(id);
}

function switchKind(kind) {
  if (kind === state.kind || !state.data.datasets[kind]) return;
  state.kind = kind;
  state.search = "";
  el.search.value = "";
  setTabUI(kind);
  if (window.history && history.replaceState) {
    history.replaceState(null, "", `?kind=${kind}#demo`);
  }
  refresh();
}

/* ---------- CTA links ---------- */

function setCtaLink(elm, url, labelText) {
  if (!elm) return;
  if (url) { elm.href = url; return; }
  elm.textContent = `${labelText} (coming soon)`;
  elm.classList.add("is-disabled");
  elm.setAttribute("aria-disabled", "true");
  elm.setAttribute("tabindex", "-1");
  elm.removeAttribute("href");
  elm.removeAttribute("target");
}

/* ---------- upload & predict ---------- */

function readFileText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error || new Error("read failed"));
    r.readAsText(file);
  });
}

// Guess 3Dmol format from filename/content (CIF vs VASP POSCAR/CONTCAR).
function guessFormat(name, text) {
  const n = (name || "").toLowerCase();
  if (n.endsWith(".cif") || /_cell_length|_atom_site/.test(text)) return "cif";
  if (n.endsWith(".vasp") || n.endsWith(".poscar") || /poscar|contcar/.test(n)) return "vasp";
  const lines = (text || "").split(/\r?\n/);
  if (lines.length > 7 && /^\s*[-+]?\d*\.?\d+\s*$/.test(lines[1] || "")) return "vasp"; // scale on line 2
  return "cif";
}

async function showUploadStructure(file) {
  const wrap = document.getElementById("upload-struct-wrap");
  const host = document.getElementById("upload-struct");
  if (!wrap || !host) return;
  if (!file) { wrap.hidden = true; return; }
  wrap.hidden = false;
  let text;
  try { text = await readFileText(file); } catch (_) { wrap.hidden = true; return; }
  uploadViewer = loadStructure(host, text, guessFormat(file.name, text), uploadViewer);
}

function plotUpload(data) {
  const node = document.getElementById("upload-plot");
  const traces = [];
  if (Array.isArray(data.dft)) {
    traces.push({ x: data.energy, y: data.dft, name: "DFT (ground truth)", type: "scatter",
      mode: "lines", line: { color: TRACE_STYLE.label.color, width: 3, shape: "spline", smoothing: 0.5 } });
  }
  traces.push({ x: data.energy, y: data.dos, name: "DeepDOSReasoner (predicted)", type: "scatter",
    mode: "lines", line: { color: TRACE_STYLE.dos_reasoner.color, width: 2.6, shape: "spline", smoothing: 0.5 },
    hovertemplate: "%{x:.3g} · %{y:.3g}<extra></extra>" });
  const layout = {
    margin: { l: 58, r: 16, t: 10, b: 48 }, height: 440,
    paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)",
    font: { family: "-apple-system, Segoe UI, Roboto, sans-serif", size: 13, color: "#34343b" },
    xaxis: { title: { text: "Energy E − E_F (eV)" }, zeroline: false, gridcolor: "#eef0f3", ticks: "outside", ticklen: 4 },
    yaxis: { title: { text: "DOS (states/eV)" }, zeroline: false, rangemode: "tozero", gridcolor: "#eef0f3", ticks: "outside", ticklen: 4 },
    hovermode: "x unified",
    legend: { orientation: "h", y: 1.12, x: 0, font: { size: 12 } },
    shapes: [{ type: "line", x0: 0, x1: 0, yref: "paper", y0: 0, y1: 1, line: { color: "#b3b3ba", width: 1, dash: "dot" } }],
  };
  Plotly.react(node, traces, layout, { responsive: true, displaylogo: false,
    modeBarButtonsToRemove: ["select2d", "lasso2d", "autoScale2d", "toggleSpikelines"] });
}

function initUpload() {
  const dz = document.getElementById("dropzone");
  const input = document.getElementById("file-input");
  const btn = document.getElementById("predict-btn");
  const status = document.getElementById("predict-status");
  const plot = document.getElementById("upload-plot");
  const fileLabel = document.getElementById("dz-file");
  if (!dz || !input || !btn) return;
  let file = null;

  const setStatus = (msg, cls) => { status.textContent = msg; status.className = "predict-status" + (cls ? " " + cls : ""); };
  if (!PREDICT_API) setStatus("Live prediction isn't connected yet — set PREDICT_API in assets/app.js once the model endpoint is deployed.", "muted");

  function setFile(f) {
    file = f || null;
    fileLabel.textContent = file ? file.name : "";
    btn.disabled = !(file && PREDICT_API);
    if (file && !PREDICT_API) setStatus(`Selected ${file.name} — endpoint not connected yet.`, "muted");
    plot.hidden = true;            // clear any previous prediction
    showUploadStructure(file);     // immediate 3D preview of the uploaded crystal
  }

  dz.addEventListener("click", () => input.click());
  dz.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } });
  input.addEventListener("change", () => setFile(input.files[0]));
  ["dragover", "dragenter"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("is-drag"); }));
  ["dragleave", "dragend"].forEach((ev) => dz.addEventListener(ev, () => dz.classList.remove("is-drag")));
  dz.addEventListener("drop", (e) => { e.preventDefault(); dz.classList.remove("is-drag"); if (e.dataTransfer.files.length) setFile(e.dataTransfer.files[0]); });

  btn.addEventListener("click", async () => {
    if (!file || !PREDICT_API) return;
    btn.disabled = true;
    setStatus("Predicting…");
    plot.hidden = true;
    try {
      const fd = new FormData();
      fd.append("file", file, file.name);
      const nelEl = document.getElementById("nelect-input");
      const nel = nelEl && nelEl.value.trim();
      if (nel) fd.append("nelect", nel);
      const res = await fetch(PREDICT_API, { method: "POST", body: fd });
      if (!res.ok) {
        let msg = "HTTP " + res.status;
        try { const e = await res.json(); if (e && e.detail) msg = e.detail; } catch (_) { /* non-JSON */ }
        if (res.status === 422) {
          // Element outside the label-sum model's training set: reveal the NELECT
          // field so the user can proceed (predictions there are extrapolation).
          const f = document.querySelector(".nelect-field");
          if (f) f.hidden = false;
          msg += " — this element is outside the model's training set; enter NELECT above and retry (treat the result as unreliable).";
        }
        throw new Error(msg);
      }
      const data = await res.json();
      if (!Array.isArray(data.energy) || !Array.isArray(data.dos)) throw new Error("response missing energy/dos arrays");
      plotUpload(data);
      plot.hidden = false;
      const base = data.formula ? `Predicted DOS for ${data.formula}` : "Predicted DOS";
      const oot = data.extrapolation_elements || [];
      if (oot.length) {
        setStatus(`${base} — ⚠ contains ${oot.join(", ")}, outside the model's training set; treat this prediction as extrapolation.`, "muted");
      } else {
        setStatus(base);
      }
    } catch (err) {
      setStatus("Prediction failed: " + err.message, "error");
    } finally {
      btn.disabled = !(file && PREDICT_API);
    }
  });
}

/* ---------- init ---------- */

function init() {
  setCtaLink(document.getElementById("paper-link"), PAPER_URL, "Paper");
  setCtaLink(document.getElementById("paper-link-foot"), PAPER_URL, "Paper");
  setCtaLink(document.getElementById("code-link"), CODE_URL, "Code");
  setCtaLink(document.getElementById("code-link-foot"), CODE_URL, "Code");

  initUpload();

  const data = window.DDR_DATA;
  if (!data || !data.datasets || !Array.isArray(data.order) || !data.order.length) {
    el.list.innerHTML = `<li class="list-empty">Could not load demo data — data/data.js is missing. Run <code>python3 tools/prepare_data.py</code>.</li>`;
    el.title.textContent = "Data unavailable";
    return;
  }
  state.data = data;
  buildTabs();
  el.search.addEventListener("input", () => { state.search = el.search.value; renderList(); });

  const wanted = new URLSearchParams(location.search).get("kind");
  state.kind = (wanted && data.datasets[wanted]) ? wanted : data.order[0];
  setTabUI(state.kind);
  refresh();

  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (demoViewer) try { demoViewer.resize(); } catch (_) {}
      if (uploadViewer) try { uploadViewer.resize(); } catch (_) {}
    }, 150);
  });
}

document.addEventListener("DOMContentLoaded", init);
