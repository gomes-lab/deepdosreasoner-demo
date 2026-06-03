#!/usr/bin/env python3
"""Build the DeepDOSReasoner demo data bundles.

Reads the local example folders shipped with the project and emits compact JSON
that the static site (../index.html) fetches and plots client-side:

    plots_best100/  -> data/edos.json    (electronic DOS, 100 materials)
    phdos/          -> data/phdos.json    (phonon DOS, 50 materials)

For each example we keep the four curves (DFT ground truth + DeepDOSReasoner +
the two strongest baselines), a per-model MSE computed against the DFT label, and
a human-readable chemical formula parsed from the matching .cif. CIFs are copied
into data/structures/ so the page can offer a structure download.

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

# (source folder, csv x-column, csv curve columns in our canonical order, output file)
DATASETS = {
    "edos": {
        "src": ROOT / "plots_best100",
        "xcol": "energy_eV",
        # canonical key -> csv column name
        "cols": {
            "label": "label",
            "dos_reasoner": "dos_reasoner",
            "mat2spec": "mat2spec",
            "dostransformer": "dostransformer",
        },
        "out": DATA_DIR / "edos.json",
        "xlabel": "Energy E − E_F (eV)",
    },
    "phdos": {
        "src": ROOT / "phdos",
        "xcol": "frequency_cm-1",
        "cols": {
            "label": "DFT_label",
            "dos_reasoner": "DOS-Reasoner",
            "mat2spec": "Mat2Spec",
            "dostransformer": "DOSTransformer",
        },
        "out": DATA_DIR / "phdos.json",
        "xlabel": "Frequency (cm⁻¹)",
    },
}

RANK_RE = re.compile(r"rank(\d+)_(mp-\d+)\.csv$")
ELEM_RE = re.compile(r"([A-Z][a-z]?)(\d*)")


def parse_formula(cif_path: Path) -> str | None:
    """Return a compact pretty formula (e.g. 'Cu2BaHfS4') from a .cif, or None."""
    if not cif_path.is_file():
        return None
    raw = None
    for line in cif_path.read_text().splitlines():
        s = line.strip()
        if s.startswith("_chemical_formula_sum"):
            raw = s[len("_chemical_formula_sum"):].strip().strip("'\"")
            break
    if not raw:
        return None
    parts = []
    for tok in raw.split():
        m = ELEM_RE.fullmatch(tok)
        if not m:
            return raw  # unexpected shape; show as-is
        el, count = m.group(1), m.group(2)
        parts.append(el + ("" if count in ("", "1") else count))
    return "".join(parts) if parts else raw


def mse(pred: list[float], label: list[float]) -> float:
    n = min(len(pred), len(label))
    if n == 0:
        return 0.0
    return sum((pred[i] - label[i]) ** 2 for i in range(n)) / n


def round_list(vals: list[float], ndigits: int = 6) -> list[float]:
    return [round(v, ndigits) for v in vals]


def load_example(csv_path: Path, cfg: dict) -> dict:
    rank, mpid = RANK_RE.search(csv_path.name).groups()
    x: list[float] = []
    curves: dict[str, list[float]] = {k: [] for k in cfg["cols"]}
    with csv_path.open(newline="") as fh:
        reader = csv.DictReader(fh)
        for row in reader:
            x.append(float(row[cfg["xcol"]]))
            for key, src_col in cfg["cols"].items():
                curves[key].append(float(row[src_col]))

    label = curves["label"]
    metrics = {
        "dos_reasoner": mse(curves["dos_reasoner"], label),
        "mat2spec": mse(curves["mat2spec"], label),
        "dostransformer": mse(curves["dostransformer"], label),
    }
    best_baseline = min(metrics["mat2spec"], metrics["dostransformer"])
    dsr = metrics["dos_reasoner"]
    improvement = (best_baseline / dsr) if dsr > 0 else None

    formula = parse_formula(cfg["src"] / "structures" / f"{mpid}.cif")

    return {
        "rank": int(rank),
        "mpid": mpid,
        "formula": formula,
        "x": round_list(x),
        "curves": {k: round_list(v) for k, v in curves.items()},
        "mse": {k: round(v, 6) for k, v in metrics.items()},
        "improvement": round(improvement, 3) if improvement is not None else None,
        "hasCif": (cfg["src"] / "structures" / f"{mpid}.cif").is_file(),
    }


def build(name: str, cfg: dict) -> dict:
    csv_dir = cfg["src"] / "csv"
    files = sorted(csv_dir.glob("rank*_mp-*.csv"),
                   key=lambda p: int(RANK_RE.search(p.name).group(1)))
    materials = [load_example(p, cfg) for p in files]

    # Shared x-grid if every example uses the same axis (true for both datasets).
    xs = {tuple(m["x"]) for m in materials}
    shared_x = None
    if len(xs) == 1:
        shared_x = materials[0]["x"]
        for m in materials:
            m.pop("x", None)

    missing_cif = [m["mpid"] for m in materials if not m["hasCif"]]
    print(f"[{name}] {len(materials)} materials, "
          f"shared_x={'yes' if shared_x else 'no'}, "
          f"missing cifs: {missing_cif or 'none'}")

    return {
        "kind": name,
        "xlabel": cfg["xlabel"],
        "x": shared_x,  # null if per-material x kept on each entry
        "materials": materials,
    }


def copy_cifs() -> int:
    STRUCT_OUT.mkdir(parents=True, exist_ok=True)
    copied = 0
    for cfg in DATASETS.values():
        for cif in (cfg["src"] / "structures").glob("mp-*.cif"):
            shutil.copy2(cif, STRUCT_OUT / cif.name)
            copied += 1
    return copied


def main() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    for name, cfg in DATASETS.items():
        if not (cfg["src"] / "csv").is_dir():
            raise SystemExit(f"missing source folder: {cfg['src']/'csv'}")
        bundle = build(name, cfg)
        cfg["out"].write_text(json.dumps(bundle, separators=(",", ":")))
        kb = cfg["out"].stat().st_size / 1024
        print(f"[{name}] wrote {cfg['out'].relative_to(ROOT)} ({kb:.0f} KB)")
    n = copy_cifs()
    print(f"[cif] copied {n} structures -> {STRUCT_OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
