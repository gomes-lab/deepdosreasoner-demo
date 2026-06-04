#!/usr/bin/env python3
"""Recover the exact per-element valence count (ZVAL) used when training ALIGNN,
so auto-NELECT covers every element and the demo's manual NELECT field can go.

NELECT for a cell = sum over atoms of the POTCAR ZVAL. We solve that linear
system over the training labels:  A x = b,  A[material, element] = atom count,
b = NELECT,  x = ZVAL per element. With tens of thousands of materials it's
heavily overdetermined, so a near-zero residual confirms the recovered integers
are exactly the training convention (no POTCAR files or guessing needed).

Run it in the env that has the labels:

    python recover_zval.py /path/to/artifacts/labels/labels.jsonl.gz

then paste the printed ZVAL_BY_EL block back to me.

Expects one JSON object per line with `nelect` and either `structure_json`
(a pymatgen Structure dict, as in validate_alignn_infer.py) or `composition`.

--- Alternative (if you have VASP PBE POTCARs configured in pymatgen) -------------
This dumps ZVAL straight from the MP POTCARs for the WHOLE periodic table:

    from pymatgen.io.vasp.sets import _load_yaml_config
    from pymatgen.io.vasp.inputs import PotcarSingle
    pmap = _load_yaml_config("MPRelaxSet")["POTCAR"]
    for el, sym in sorted(pmap.items()):
        try:
            z = PotcarSingle.from_symbol_and_functional(sym, "PBE").zval
            print(f'    "{el}": {int(round(z))},')
        except Exception as e:
            print(f"    # {el} ({sym}): {e}")
----------------------------------------------------------------------------------
"""
from __future__ import annotations

import argparse
import gzip
import json

import numpy as np


def load_rows(path):
    op = gzip.open if path.endswith(".gz") else open
    rows = []
    with op(path, "rt") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            d = json.loads(line)
            if "nelect" not in d:
                continue
            if "structure_json" in d:
                from pymatgen.core import Structure
                comp = Structure.from_dict(json.loads(d["structure_json"])).composition
                amt = comp.get_el_amt_dict()
            elif "composition" in d:
                from pymatgen.core import Composition
                amt = Composition(d["composition"]).get_el_amt_dict()
            else:
                continue
            rows.append((amt, float(d["nelect"])))
    return rows


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("labels", help="labels.jsonl[.gz] with nelect + structure_json/composition")
    args = ap.parse_args()

    rows = load_rows(args.labels)
    if not rows:
        raise SystemExit("no usable rows (need 'nelect' + 'structure_json'/'composition')")

    elements = sorted({e for amt, _ in rows for e in amt})
    idx = {e: i for i, e in enumerate(elements)}
    A = np.zeros((len(rows), len(elements)))
    b = np.zeros(len(rows))
    for r, (amt, ne) in enumerate(rows):
        for e, n in amt.items():
            A[r, idx[e]] = n
        b[r] = ne

    x, _res, rank, _sv = np.linalg.lstsq(A, b, rcond=None)
    zval = {e: int(round(float(x[idx[e]]))) for e in elements}
    pred = A @ np.array([zval[e] for e in elements], dtype=float)
    err = np.abs(pred - b)

    print(f"# {len(rows)} materials, {len(elements)} elements, matrix rank {rank}/{len(elements)}")
    print(f"# max NELECT residual = {err.max():.3f}, mean = {err.mean():.4f}  (should be ~0)")
    shaky = [e for e in elements if abs(float(x[idx[e]]) - zval[e]) > 0.05]
    if rank < len(elements):
        print(f"# WARNING: rank-deficient — some elements underdetermined: check {shaky}")
    elif shaky:
        print(f"# WARNING: non-integer fit for {shaky} (inspect before trusting those)")
    print("ZVAL_BY_EL = {")
    line = "   "
    for e in elements:
        piece = f' "{e}": {zval[e]},'
        if len(line) + len(piece) > 92:
            print(line)
            line = "   "
        line += piece
    if line.strip():
        print(line)
    print("}")


if __name__ == "__main__":
    main()
