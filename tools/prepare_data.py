#!/usr/bin/env python3
"""Build the DeepDOSReasoner demo data bundle.

Reads the local example folders shipped with the project and emits a single JS
file (data/data.js) that the static site (../index.html) loads via a <script>
tag and plots client-side. A <script>-loaded global is used (rather than fetch
of a .json) so the page also works when opened directly from disk (file://).

Datasets produced (window.DDR_DATA.datasets):
    edos          plots_best100/           electronic DOS, 100 materials, 4 curves
    phdos         phdos/                   phonon DOS, 50 materials, 4 curves
    semiconductor allloy_semiconductor/    7 Cu2BaMX4 chalcogenides (paper), pred vs DFT
    alloy         allloy_semiconductor/    CuPtFeCoNi high-entropy alloy, pred vs DFT
    doped         doped/                   substituted variants, pred vs DFT

Each dataset: {kind, label, xlabel, ylabel, fermi, x|null, traces:[keys],
materials:[{id, label, formula?, rank, curves:{key:[...]}, x?, mse?, improvement?,
meta?, cif?}]}. Trace styling lives in assets/app.js, keyed by the trace key.

Run from anywhere:  python3 tools/prepare_data.py
"""

from __future__ import annotations

import csv
import json
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
STRUCT_OUT = DATA_DIR / "structures"

ELEM_RE = re.compile(r"([A-Z][a-z]?)(\d*)")
RANK_RE = re.compile(r"rank(\d+)_(mp-\d+)\.csv$")
IDX_RE = re.compile(r"^(\d+)_(.+)\.csv$")

# ---------------------------------------------------------------- helpers ----

def mse(pred, label):
    n = min(len(pred), len(label))
    if n == 0:
        return 0.0
    return sum((pred[i] - label[i]) ** 2 for i in range(n)) / n


def rnd(vals, ndigits=6):
    return [round(v, ndigits) for v in vals]


def pretty_formula(raw):
    """Compact a space-separated formula sum ('Cu Ba Hf S4') -> 'CuBaHfS4'."""
    parts = []
    for tok in raw.split():
        m = ELEM_RE.fullmatch(tok)
        if not m:
            return raw
        el, count = m.group(1), m.group(2)
        parts.append(el + ("" if count in ("", "1") else count))
    return "".join(parts) if parts else raw


def formula_from_sum(cif_path):
    """Formula from a pymatgen CIF (_chemical_formula_sum). None if absent."""
    if not cif_path.is_file():
        return None
    for line in cif_path.read_text().splitlines():
        s = line.strip()
        if s.startswith("_chemical_formula_sum"):
            return pretty_formula(s[len("_chemical_formula_sum"):].strip().strip("'\""))
    return None


def two_curve_metrics(curves):
    """MSE of dos_reasoner vs label, when both present."""
    if "label" in curves and "dos_reasoner" in curves:
        return {"dos_reasoner": round(mse(curves["dos_reasoner"], curves["label"]), 6)}
    return None


# --------------------------------------------------------------- builders ----

def build_edos_phdos(name, src, xcol, colmap, xlabel, ylabel, fermi, label, has_baselines):
    csv_dir = src / "csv"
    files = sorted(csv_dir.glob("rank*_mp-*.csv"),
                   key=lambda p: int(RANK_RE.search(p.name).group(1)))
    materials = []
    shared_x = None
    for p in files:
        rank, mpid = RANK_RE.search(p.name).groups()
        x, curves = [], {k: [] for k in colmap}
        with p.open(newline="") as fh:
            for row in csv.DictReader(fh):
                x.append(float(row[xcol]))
                for key, col in colmap.items():
                    curves[key].append(float(row[col]))
        label_curve = curves["label"]
        metrics = {k: round(mse(curves[k], label_curve), 6)
                   for k in ("dos_reasoner", "mat2spec", "dostransformer") if k in curves}
        improvement = None
        if has_baselines:
            best = min(metrics["mat2spec"], metrics["dostransformer"])
            dsr = metrics["dos_reasoner"]
            improvement = round(best / dsr, 3) if dsr > 0 else None
        cif = src / "structures" / f"{mpid}.cif"
        materials.append({
            "id": mpid, "label": mpid, "formula": formula_from_sum(cif),
            "rank": int(rank), "curves": {k: rnd(v) for k, v in curves.items()},
            "x": rnd(x), "mse": metrics, "improvement": improvement,
            "cif": f"data/structures/{mpid}.cif" if cif.is_file() else None,
        })
    # collapse shared x grid
    xs = {tuple(m["x"]) for m in materials}
    if len(xs) == 1:
        shared_x = materials[0]["x"]
        for m in materials:
            m.pop("x", None)
    return {
        "kind": name, "label": label, "xlabel": xlabel, "ylabel": ylabel,
        "fermi": fermi, "x": shared_x,
        "traces": ["label", "dos_reasoner"] + (["mat2spec", "dostransformer"] if has_baselines else []),
        "materials": materials,
    }


def build_simple_csv(kind, label, csv_paths, ylabel):
    """alloy / semiconductor: CSV with Energy, DOS-Reasoner, Ground Truth."""
    colmap = {"label": "Ground Truth (states/eV)", "dos_reasoner": "DOS-Reasoner (states/eV)"}
    materials, shared_x = [], None
    for i, p in enumerate(sorted(csv_paths)):
        m = IDX_RE.match(p.name)
        formula = m.group(2) if m else p.stem
        x, curves = [], {k: [] for k in colmap}
        with p.open(newline="") as fh:
            for row in csv.DictReader(fh):
                x.append(float(row["Energy (eV)"]))
                for key, col in colmap.items():
                    curves[key].append(float(row[col]))
        materials.append({
            "id": formula, "label": formula, "formula": formula,
            "rank": i + 1, "curves": {k: rnd(v) for k, v in curves.items()},
            "x": rnd(x), "mse": two_curve_metrics(curves),
        })
    xs = {tuple(m["x"]) for m in materials}
    if len(xs) == 1:
        shared_x = materials[0]["x"]
        for m in materials:
            m.pop("x", None)
    return {
        "kind": kind, "label": label, "xlabel": "Energy E − E_F (eV)",
        "ylabel": ylabel, "fermi": True, "x": shared_x,
        "traces": ["label", "dos_reasoner"], "materials": materials,
    }


def build_doped(src):
    """Substituted variants: DeepDOSReasoner prediction vs DFT (per-CONTCAR CSV)."""
    colmap = {"label": "Ground Truth (states/eV)", "dos_reasoner": "DOS-Reasoner (states/eV)"}
    materials, shared_x = [], None
    files = sorted(src.glob("*-CONTCAR.csv"))
    for i, p in enumerate(files):
        stem = p.name.replace("-CONTCAR.csv", "")          # mp-1225405-dope-1
        m = re.match(r"(mp-\d+)-dope-(\d+)", stem)
        mpid, variant = (m.group(1), m.group(2)) if m else (stem, "?")
        x, curves = [], {k: [] for k in colmap}
        with p.open(newline="") as fh:
            for row in csv.DictReader(fh):
                x.append(float(row["Energy (eV)"]))
                for key, col in colmap.items():
                    curves[key].append(float(row[col]))
        materials.append({
            "id": stem, "label": f"{mpid} · variant {variant}", "formula": None,
            "rank": i + 1, "x": rnd(x),
            "curves": {k: rnd(v) for k, v in curves.items()},
            "mse": two_curve_metrics(curves),
            "meta": {"parent": mpid, "variant": variant},
        })
    xs = {tuple(m["x"]) for m in materials}
    if len(xs) == 1:
        shared_x = materials[0]["x"]
        for m in materials:
            m.pop("x", None)
    return {
        "kind": "doped", "label": "Doped materials",
        "xlabel": "Energy E − E_F (eV)", "ylabel": "DOS (states/eV)",
        "fermi": True, "x": shared_x, "traces": ["label", "dos_reasoner"],
        "materials": materials,
    }


# -------------------------------------------------------------------- main ----

def main():
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    datasets = {}
    datasets["edos"] = build_edos_phdos(
        "edos", ROOT / "plots_best100", "energy_eV",
        {"label": "label", "dos_reasoner": "dos_reasoner",
         "mat2spec": "mat2spec", "dostransformer": "dostransformer"},
        "Energy E − E_F (eV)", "Density of states (a.u.)", True, "Electronic DOS", True)
    datasets["phdos"] = build_edos_phdos(
        "phdos", ROOT / "phdos", "frequency_cm-1",
        {"label": "DFT_label", "dos_reasoner": "DOS-Reasoner",
         "mat2spec": "Mat2Spec", "dostransformer": "DOSTransformer"},
        "Frequency (cm⁻¹)", "Phonon DOS (a.u.)", False, "Phonon DOS", True)
    sc_dir = ROOT / "allloy_semiconductor"
    # Paper case study (Fig. 4b): the seven Cu2BaMX4 chalcogenides, M in
    # {Hf,Si,Ti,Zr}, X in {S,Se}. Exclude the other (Ag-based / Co/Cr/Mn) samples.
    sc_files = [p for p in (sc_dir / "semiconductor").glob("*.csv")
                if re.search(r"_CuBa(Hf|Si|Ti|Zr)(S|Se)\.csv$", p.name)]
    datasets["semiconductor"] = build_simple_csv(
        "semiconductor", "Semiconductors", sc_files, "DOS (states/eV)")
    datasets["alloy"] = build_simple_csv(
        "alloy", "High-entropy alloy",
        list((sc_dir / "alloy").glob("*.csv")), "DOS (states/eV)")
    datasets["doped"] = build_doped(ROOT / "doped")

    order = ["edos", "phdos", "semiconductor", "alloy", "doped"]
    bundle = {"order": order, "datasets": datasets}

    js_path = DATA_DIR / "data.js"
    js_path.write_text("window.DDR_DATA = " + json.dumps(bundle, separators=(",", ":")) + ";\n")
    for k in order:
        d = datasets[k]
        print(f"  {k:14} {len(d['materials']):>3} materials  traces={d['traces']}")
    print(f"[bundle] wrote {js_path.relative_to(ROOT)} ({js_path.stat().st_size/1024:.0f} KB)")

    # copy pymatgen CIFs for edos/phdos downloads
    n = 0
    for sub in (ROOT / "plots_best100" / "structures", ROOT / "phdos" / "structures"):
        for cif in sub.glob("mp-*.cif"):
            shutil.copy2(cif, STRUCT_OUT / cif.name); n += 1
    print(f"[cif] copied {n} structures -> {STRUCT_OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
