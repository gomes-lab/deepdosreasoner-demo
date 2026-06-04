#!/usr/bin/env python3
"""Dump element -> ZVAL for the whole periodic table from the MP (MPRelaxSet)
VASP PBE POTCARs, so ALIGNN's auto-NELECT covers every element and the demo's
manual NELECT field can be removed.

Requires the VASP PBE POTCARs configured in pymatgen, e.g.:
    pmg config --add PMG_VASP_PSP_DIR /path/to/your/POTCARs
(the directory that contains potpaw_PBE/ etc.). Uses the same MPRelaxSet POTCAR
choices ALIGNN was trained with, so the ZVALs match training exactly.

    python dump_zval_potcar.py

Paste the printed ZVAL_BY_EL block back to me.
"""
from pymatgen.io.vasp.inputs import PotcarSingle
from pymatgen.io.vasp.sets import _load_yaml_config

cfg = _load_yaml_config("MPRelaxSet")
pmap = cfg["POTCAR"]                       # element -> POTCAR symbol (e.g. Ti -> Ti_pv)
functional = cfg.get("POTCAR_FUNCTIONAL", "PBE")

out, missing = {}, []
for el, sym in pmap.items():
    try:
        zval = PotcarSingle.from_symbol_and_functional(sym, functional).zval
        out[el] = int(round(zval))
    except Exception as exc:  # POTCAR not found / unreadable
        missing.append((el, sym, f"{type(exc).__name__}: {exc}"))

print(f"# functional={functional} | {len(out)} elements resolved, {len(missing)} missing")
print("ZVAL_BY_EL = {")
line = "   "
for el in sorted(out):
    piece = f' "{el}": {out[el]},'
    if len(line) + len(piece) > 92:
        print(line)
        line = "   "
    line += piece
if line.strip():
    print(line)
print("}")
if missing:
    print("# missing (POTCAR not found — these elements still need manual NELECT):")
    for el, sym, err in missing:
        print(f"#   {el} -> {sym}  ({err})")
