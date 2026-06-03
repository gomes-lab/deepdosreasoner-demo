# DeepDOSReasoner — demo site

Project / demo page for the paper **"DeepDOSReasoner: Physics-Grounded Reasoning
for Density of States Prediction"** (Wang et al., Cornell / Gomes Lab).

Live: **https://gomes-lab.github.io/deepdosreasoner-demo/**

The page presents the abstract and method, and an **interactive explorer** of the
model's predictions for the electronic DOS (eDOS) and phonon DOS (phDOS) of real
materials, plotted against DFT ground truth and the two strongest crystal-to-spectrum
baselines (Mat2Spec, DOSTransformer).

## Structure

```
index.html                 # the whole page
assets/styles.css           # styling
assets/app.js               # reads window.DDR_DATA and draws the Plotly charts
data/data.js                # generated: window.DDR_DATA = { edos: {…100}, phdos: {…50} }
data/structures/*.cif       # crystal structures (per-material download)
tools/prepare_data.py       # regenerates data/data.js from the raw example folders
.github/workflows/pages.yml # auto-deploys to GitHub Pages on push to main
```

It is a **fully static site** — no build step, no dependencies beyond Plotly
(loaded from a CDN). The example data is loaded via a `<script>` tag
(`data/data.js`) rather than `fetch()`, so the page also works when `index.html`
is opened straight from disk.

## Regenerating the data

The data bundle is derived from the raw example folders `plots_best100/`
(eDOS) and `phdos/` (phDOS), which are kept locally but git-ignored. To rebuild:

```bash
python3 tools/prepare_data.py
```

This recomputes per-material MSE against the DFT label, parses chemical formulas
from each `.cif`, and writes `data/data.js` plus the CIF copies.

## Local preview

Just open `index.html` in a browser (double-click), or serve it:

```bash
python3 -m http.server 8000
# open http://localhost:8000/
```

## To do before/at publication

Both link buttons are gated behind URL constants at the top of `assets/app.js`.
While a constant is empty (`""`), its button shows "… (coming soon)" and is fully
disabled (so the site never links to a 404). Set them when the targets are public:

- `PAPER_URL` — the arXiv / DOI / journal link.
- `CODE_URL` — the code repository (e.g. `https://github.com/gomes-lab/deep-dos-reasoner`
  once it exists publicly; it currently 404s, so the **Code** button is disabled).

Verify each URL resolves to HTTP 200 for an unauthenticated visitor before setting it.

## Deployment

Pushing to `main` triggers `.github/workflows/pages.yml`, which deploys the repo
root to GitHub Pages.

**One-time setup (required):** in the repository **Settings → Pages**, set
**Source = GitHub Actions**. A workflow's `GITHUB_TOKEN` cannot enable Pages by
itself (that needs admin rights), so until this toggle is set the
**Configure Pages** step fails. After enabling it, re-run the latest run from the
**Actions** tab (or push any commit) and the site deploys to
`https://gomes-lab.github.io/deepdosreasoner-demo/`.
