# DeepDOSReasoner inference API (starter)

Backs the **"Try it on your structure"** block on the demo site: it receives a
structure file and returns the predicted electronic DOS. The site is static
(GitHub Pages can't run PyTorch), so prediction has to happen here.

```
POST /predict   (multipart/form-data, field "file" = a .cif or POSCAR/CONTCAR)
  -> { "energy": [...128], "dos": [...128], "formula": "…"|null }
GET  /health    -> { "status": "ok" }
```

The energy grid is the site's benchmark grid: **−4..4 eV, 128 bins**.

## Make it real

`app.py` ships with a **placeholder** `run_inference()` that returns a dummy curve
so the endpoint and the frontend wiring are testable immediately. Replace its body
with the model (parse → featurize → two-stage forward → ×Z), load the weights once
at startup, and add `torch` + `pymatgen` to `requirements.txt`. The model and
featurization code live in the `deep-dos-reasoner` repo.

## Run locally

```bash
pip install -r requirements.txt
python app.py                      # serves on http://localhost:7860
curl -F file=@some_structure.cif http://localhost:7860/predict
```

## Deploy (Hugging Face Spaces, Docker SDK — simplest)

1. Create a new Space → SDK: **Docker**.
2. Add `app.py`, `requirements.txt`, and `Dockerfile` (this folder) to it.
3. The Space serves at `https://<owner>-<space>.hf.space`.
4. In `../assets/app.js`, set:
   ```js
   const PREDICT_API = "https://<owner>-<space>.hf.space/predict";
   ```
   and push — the upload block lights up automatically.

## Notes

- **CORS**: `ALLOWED_ORIGINS` in `app.py` must include the site's origin
  (`https://gomes-lab.github.io`) or browsers will block the request.
- A 2 MB upload cap and UTF-8 decoding are enforced; tighten validation as needed
  since you're parsing user-uploaded files.
- Free tiers cold-start in a few seconds; inference itself is ~10 ms/crystal.
