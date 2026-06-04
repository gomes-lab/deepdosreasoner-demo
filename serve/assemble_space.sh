#!/usr/bin/env bash
# Assemble a push-ready Hugging Face Space directory from this scaffold plus the
# extracted model packages under ../huggingface/.
#
#   bash serve/assemble_space.sh [OUT_DIR] [--one-seed]
#
# Defaults OUT_DIR to ../hf_space_build. --one-seed drops the seed4 checkpoints
# (halves the model to ~624 MB, faster cold start, single-seed instead of 2-seed).
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/.." && pwd)"
SRC="$REPO/huggingface"
OUT="${1:-$REPO/hf_space_build}"
ONE_SEED="${2:-}"

if [ ! -d "$SRC/alignn_infer" ]; then
  echo "!! $SRC/alignn_infer not found — run: (cd $SRC && unzip -o alignn_infer.zip)"; exit 1
fi
if [ ! -d "$SRC/dos_reasoner_infer/ckpts" ]; then
  echo "!! dos checkpoints not found — run: (cd $SRC && unzip -o dos_reasoner_infer.zip)"; exit 1
fi

echo "Assembling Space at: $OUT"
mkdir -p "$OUT"
cp "$HERE/app.py" "$HERE/Dockerfile" "$HERE/requirements.txt" "$HERE/.gitattributes" "$HERE/README.md" "$OUT/"
rm -rf "$OUT/alignn_infer" "$OUT/dos_reasoner_infer"
cp -R "$SRC/alignn_infer" "$OUT/alignn_infer"
cp -R "$SRC/dos_reasoner_infer" "$OUT/dos_reasoner_infer"
# strip caches / non-inference cruft
find "$OUT" -name '__pycache__' -type d -prune -exec rm -rf {} + 2>/dev/null || true

if [ "$ONE_SEED" = "--one-seed" ]; then
  rm -f "$OUT/dos_reasoner_infer/ckpts/stage1_seed4.ckpt" \
        "$OUT/dos_reasoner_infer/ckpts/stage2_seed4.ckpt"
  echo "  dropped seed4 (single-seed ensemble)"
fi

echo "Done. Size:"; du -sh "$OUT"
echo
echo "Next:"
echo "  1) Create a HF Space (SDK: Docker) and clone it."
echo "  2) Copy everything from $OUT into the clone."
echo "  3) git lfs install && git add -A && git commit -m 'deploy' && git push"
echo "  4) Set PREDICT_API in assets/app.js to https://<owner>-<space>.hf.space/predict"
