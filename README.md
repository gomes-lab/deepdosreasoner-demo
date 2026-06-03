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
assets/app.js               # loads data/*.json and draws the Plotly charts
data/edos.json              # generated: 100 electronic-DOS examples
data/phdos.json             # generated: 50 phonon-DOS examples
data/structures/*.cif       # crystal structures (per-material download)
tools/prepare_data.py       # regenerates data/ from the raw example folders
.github/workflows/pages.yml # auto-deploys to GitHub Pages on push to main
```

It is a **fully static site** — no build step, no dependencies beyond Plotly
(loaded from a CDN).

## Regenerating the data

The JSON bundles are derived from the raw example folders `plots_best100/`
(eDOS) and `phdos/` (phDOS), which are kept locally but git-ignored. To rebuild:

```bash
python3 tools/prepare_data.py
```

This recomputes per-material MSE against the DFT label, parses chemical formulas
from each `.cif`, and writes `data/edos.json`, `data/phdos.json`, and the CIF copies.

## Local preview

```bash
python3 -m http.server 8000
# open http://localhost:8000/
```

(Open via a server, not `file://` — the page `fetch()`es the JSON.)

## To do before/at publication

- Set `PAPER_URL` at the top of `assets/app.js` to the arXiv / DOI / journal link.
  Until then the **Paper** button shows "coming soon" and is disabled.
- Confirm the code-repository link (`CODE_URL` in `assets/app.js`).

## Deployment

Pushing to `main` triggers `.github/workflows/pages.yml`, which deploys the repo
root to GitHub Pages.

**One-time setup (required):** in the repository **Settings → Pages**, set
**Source = GitHub Actions**. A workflow's `GITHUB_TOKEN` cannot enable Pages by
itself (that needs admin rights), so until this toggle is set the
**Configure Pages** step fails. After enabling it, re-run the latest run from the
**Actions** tab (or push any commit) and the site deploys to
`https://gomes-lab.github.io/deepdosreasoner-demo/`.
