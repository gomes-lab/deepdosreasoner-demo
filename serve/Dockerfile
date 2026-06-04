# Hugging Face Spaces (Docker SDK) serves the app on port 7860.
# CPU image. ALIGNN needs DGL (pinned to torch 2.4); DOS_Reasoner needs
# torch_geometric (no torch_scatter). torch + dgl are installed first, from
# their own CPU wheel indexes, before the rest of requirements.
FROM python:3.10-slim

ENV PIP_NO_CACHE_DIR=1 \
    HF_HOME=/app/.cache \
    MPLCONFIGDIR=/app/.cache/mpl \
    OMP_NUM_THREADS=2

WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential git && rm -rf /var/lib/apt/lists/*

# 1) PyTorch 2.4.0 (CPU) — satisfies both models (ALIGNN pins 2.4; DOS needs >=2.2)
RUN pip install torch==2.4.0 --index-url https://download.pytorch.org/whl/cpu

# 2) DGL 2.4.0 (CPU) built for torch 2.4 — its PyPI wheel index 403s, use dgl's repo
RUN pip install dgl==2.4.0 -f https://data.dgl.ai/wheels/torch-2.4/repo.html

# 3) everything else (torch_geometric, alignn, jarvis-tools, pymatgen, FastAPI, ...)
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .
RUN mkdir -p /app/.cache && chmod -R 777 /app/.cache

EXPOSE 7860
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]
