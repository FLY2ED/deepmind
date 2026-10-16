#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

UV_BIN="${UV_BIN:-/home/nalda/.local/bin/uv}"
if ! command -v "$UV_BIN" >/dev/null 2>&1; then
  UV_BIN="uv"
fi

PORT="${PORT:-8080}"

echo "============================================================"
echo " TakeTheCall (대신받아) — One-Click Environment & Demo Runner"
echo "============================================================"

echo "[1/4] Checking Python environment & dependencies..."
"$UV_BIN" run python -c "import google.genai, fastapi, pydantic; print('  -> google-genai:', google.genai.__version__)"

echo "[2/4] Ensuring high-resolution demo assets exist..."
"$UV_BIN" run python scripts/synthesize_assets.py

if command -v ffmpeg >/dev/null 2>&1; then
  echo "[2.5/4] Building 1080p demo video via ffmpeg..."
  bash scripts/build_demo_video.sh
fi

echo "[3/4] Running automated pytest verification suite..."
"$UV_BIN" run pytest -q

echo "[4/4] Starting TakeTheCall FastAPI server on http://0.0.0.0:${PORT} ..."
exec "$UV_BIN" run uvicorn app.main:app --host 0.0.0.0 --port "${PORT}"
