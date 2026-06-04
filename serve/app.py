"""Starter inference API for the DeepDOSReasoner demo's "upload a structure" block.

The static site (../index.html) POSTs a structure file to POST /predict and plots
the returned DOS. Deploy this anywhere that runs Python; the simplest is a
Hugging Face **Docker** Space (see README.md), which keeps the model weights and
Python environment with zero infra to manage.

>>> TO MAKE IT REAL: replace the body of `run_inference()` with the model:
      1. parse the uploaded text  -> pymatgen Structure
      2. featurize                -> the crystal graph the model expects
      3. two-stage forward pass   -> normalized DOS (sums to 1) on the 128-bin grid
      4. x Z                      -> multiply by the composition-determined total states
      5. return (ENERGY, dos, formula)
    The energy grid MUST match the site's benchmark grid: -4..4 eV, 128 bins.

The placeholder below returns a dummy curve so the endpoint (and the frontend
wiring) can be tested before the model is plugged in.
"""

import math

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

MAX_BYTES = 2_000_000          # reject uploads larger than ~2 MB
N_BINS = 128
ENERGY = [round(-4.0 + 8.0 * i / (N_BINS - 1), 6) for i in range(N_BINS)]

# Browsers enforce CORS: list every origin the site is served from.
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

# --- load the model once at startup -----------------------------------------
# import torch
# MODEL = load_deepdosreasoner("weights.pt"); MODEL.eval()


def run_inference(text: str, filename: str):
    """Return (energy, dos, formula). REPLACE THIS BODY with the real model.

    `text` is the raw uploaded file contents; `filename` is its lowercased name."""
    # ---- real version (sketch) ----------------------------------------------
    # from pymatgen.core import Structure
    # fmt = "poscar" if ("poscar" in filename or "contcar" in filename) else "cif"
    # structure = Structure.from_str(text, fmt=fmt)
    # graph = featurize(structure)
    # with torch.no_grad():
    #     norm_dos = MODEL(graph)                      # [128], sums to 1
    # z = total_states_from_composition(structure)     # composition-determined
    # dos = (norm_dos * z).cpu().tolist()
    # return ENERGY, dos, structure.composition.reduced_formula
    #
    # ---- placeholder (remove once the model is wired) -----------------------
    dos = [
        max(0.0, 5.0 * math.exp(-((e + 1.0) ** 2) / 0.5)
                 + 3.0 * math.exp(-((e - 1.5) ** 2) / 0.8))
        for e in ENERGY
    ]
    return ENERGY, dos, None


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/predict")
async def predict(file: UploadFile = File(...)):
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="empty file")
    if len(raw) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="file too large")
    try:
        text = raw.decode("utf-8", errors="replace")
        energy, dos, formula = run_inference(text, (file.filename or "").lower())
    except Exception as exc:  # noqa: BLE001 — surface a clean message to the client
        raise HTTPException(status_code=400, detail=f"could not process structure: {exc}")
    return {
        "energy": energy,
        "dos": dos,
        "formula": formula,
        # remove this once run_inference returns real predictions:
        "note": "placeholder output — replace run_inference() with the model",
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=7860)
