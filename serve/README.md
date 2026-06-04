---
title: DeepDOSReasoner inference
emoji: 🔬
colorFrom: pink
colorTo: gray
sdk: docker
app_port: 7860
pinned: false
---

# DeepDOSReasoner inference API

Backs the **"Try it on your structure"** block on the demo site. Upload a crystal
structure → predicted electronic DOS. Two models run in sequence:

```
structure --ALIGNN-->        label_sum (N_win = states in [E_F-4, E_F+4 eV], NELECT auto-computed)
          --DOS_Reasoner-->  normalized 128-bin shape (sums to 1)
DOS = shape * label_sum,  on the -4..4 eV / 128-bin grid
```

```
POST /predict   (multipart: "file" = .cif/POSCAR/CONTCAR; optional "nelect" = total valence e-)
  -> { "energy":[128], "dos":[128], "label_sum": float, "formula": str }
GET  /health    -> { "status":"ok", "device":"cpu"|"cuda" }
```

The static demo site (GitHub Pages) can't run PyTorch, so prediction happens here.

## Files

- `app.py` — FastAPI wrapper that calls both models.
- `alignn_infer/` — ALIGNN label-sum predictor (`predict_alignn.py`, `best_model.pt`, …).
- `dos_reasoner_infer/` — DOS_Reasoner model (`predict_dos.py`, `DOS_Reasoner/`, `ckpts/`).
- `Dockerfile`, `requirements.txt`, `.gitattributes` (LFS for `*.ckpt`/`*.pt`).

`alignn_infer/` and `dos_reasoner_infer/` are **not** committed to the demo repo (too
large); they come from `huggingface/*.zip`. Build the push-ready folder with:

```bash
bash serve/assemble_space.sh ../hf_space_build            # full 2-seed ensemble (~1.25 GB)
bash serve/assemble_space.sh ../hf_space_build --one-seed # single seed (~624 MB, faster)
```

## Deploy (Hugging Face Spaces, Docker SDK)

1. Create a Space → SDK **Docker** (CPU Basic is fine; pick a GPU for speed).
2. Clone it, copy in everything from `hf_space_build/`, then:
   ```bash
   git lfs install
   git add -A && git commit -m "deploy DeepDOSReasoner inference" && git push
   ```
   (LFS matters — the checkpoints are hundreds of MB.)
3. The Space builds the Docker image (slow the first time — torch + dgl + alignn)
   and serves at `https://<owner>-<space>.hf.space`.
4. In `../assets/app.js` set and push:
   ```js
   const PREDICT_API = "https://<owner>-<space>.hf.space/predict";
   ```
   The upload block lights up automatically.

## Test

```bash
curl -F file=@dos_reasoner_infer/ref_struct.json https://<owner>-<space>.hf.space/predict
# locally (needs the env): python app.py  then  curl -F file=@some.cif localhost:7860/predict
```
Each model also ships a `validate_*.py` you can run in its native conda env.

## Heads-up on the environment

This is the fragile part: ALIGNN needs **DGL** (pinned to torch 2.4) and DOS_Reasoner
needs **torch_geometric** in the *same* image. The Dockerfile installs `torch==2.4.0`
(CPU) and `dgl==2.4.0` from dgl's wheel index, then the rest. If the first build fails,
the usual culprits are:
- the DGL wheel URL — try `-f https://data.dgl.ai/wheels/repo.html`, or match the Space's
  CUDA for a GPU Space;
- `alignn==2026.5.20` trying to pull a different torch — pin/relax as needed;
- `numpy` 2.x — kept `<2` here to match the validated env.

## Notes

- CORS is locked to the demo origin in `app.py` (`ALLOWED_ORIGINS`) — add yours if it differs.
- NELECT is auto-computed from composition (MP POTCAR ZVALs); f-element structures need
  `nelect` passed explicitly (the API returns 422 with a clear message in that case).
- 2 MB upload cap; CPU inference is a few seconds (model load dominates the first call).
