"""Combined DeepDOSReasoner inference API for the demo's "upload a structure" block.

Pipeline:
    structure  --ALIGNN-->          label_sum  (N_win = states in [E_F-4, E_F+4 eV])
               --DOS_Reasoner-->     normalized 128-bin shape (sums to 1)
    DOS = shape * label_sum,  on the -4..4 eV / 128-bin grid.

Runs as a Hugging Face **Docker** Space. It expects the two model packages as
siblings of this file:

    serve/ (or the Space root)
      app.py
      alignn_infer/         <- from huggingface/alignn_infer.zip   (best_model.pt, config.json, ...)
      dos_reasoner_infer/   <- from huggingface/dos_reasoner_infer.zip (ckpts/, DOS_Reasoner/, ...)

Use serve/assemble_space.sh to build a push-ready directory. See README.md.
"""
import os
import sys
import shutil
import tempfile

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

BASE = os.path.dirname(os.path.abspath(__file__))
ALIGNN_DIR = os.path.join(BASE, "alignn_infer")
DOS_DIR = os.path.join(BASE, "dos_reasoner_infer")
for _d in (ALIGNN_DIR, DOS_DIR):
    if os.path.isdir(_d) and _d not in sys.path:
        sys.path.insert(0, _d)

N_BINS = 128
ENERGY = [round(-4.0 + 8.0 * i / (N_BINS - 1), 6) for i in range(N_BINS)]  # -4..4 eV
MAX_BYTES = 2_000_000  # reject uploads larger than ~2 MB

# Browsers enforce CORS — list every origin the demo site is served from.
ALLOWED_ORIGINS = [
    "https://gomes-lab.github.io",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
]

app = FastAPI(title="DeepDOSReasoner inference", docs_url="/docs")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

_DEVICE = None


def device() -> str:
    global _DEVICE
    if _DEVICE is None:
        import torch
        _DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
    return _DEVICE


def parse_structure(raw: bytes, filename: str):
    """Parse an uploaded CIF/POSCAR/CONTCAR into a pymatgen Structure.

    Written to a temp file under its original name so pymatgen auto-detects the
    format (POSCAR/CONTCAR have no extension)."""
    from pymatgen.core import Structure
    workdir = tempfile.mkdtemp()
    try:
        path = os.path.join(workdir, os.path.basename(filename) or "structure.cif")
        with open(path, "wb") as fh:
            fh.write(raw)
        return Structure.from_file(path)
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


@app.get("/health")
def health():
    return {"status": "ok", "device": device()}


@app.post("/predict")
async def predict(file: UploadFile = File(...), nelect: float | None = Form(default=None)):
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="empty file")
    if len(raw) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="file too large")
    try:
        structure = parse_structure(raw, file.filename or "structure.cif")
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"could not parse structure: {exc}")

    import predict_alignn
    import predict_dos
    dev = device()

    # Stage A: total states in +/-4 eV (label_sum). NELECT auto-computed from
    # composition unless the caller supplied it (needed for f-element POTCARs).
    try:
        label_sum = predict_alignn.predict_Nwin(structure, total_states=nelect, device=dev)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=f"{exc}")
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"label-sum prediction failed: {exc}")

    # Stage B: normalized 128-bin shape, rescaled by label_sum.
    try:
        dos = predict_dos.predict_dos(structure, label_sum=label_sum, device=dev)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"DOS prediction failed: {exc}")

    return {
        "energy": ENERGY,
        "dos": [round(float(v), 6) for v in dos],
        "label_sum": round(float(label_sum), 4),
        "formula": structure.composition.reduced_formula,
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=7860)
