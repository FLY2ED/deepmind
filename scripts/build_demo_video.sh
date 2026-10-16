#!/usr/bin/env bash
# Build 90-second submission demo video using gemini-omni-1.1-flash and ffmpeg
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ASSETS_DIR="${ROOT_DIR}/assets"
OMNI_SCRIPT="/home/nalda/.gemini/config/plugins/gemini-skills/skills/gemini-omni-flash-api/scripts/video/generate_video.py"

mkdir -p "${ASSETS_DIR}"

echo "[1/3] Synthesizing TTS audio and keyframe images..."
/home/nalda/.local/bin/uv run python "${ROOT_DIR}/scripts/synthesize_assets.py"

echo "[2/3] Generating intro transition clip via gemini-omni-1.1-flash..."
if [[ -n "${GEMINI_API_KEY:-}" && -f "${OMNI_SCRIPT}" ]]; then
  /home/nalda/.local/bin/uv run python "${OMNI_SCRIPT}" \
    -p "Smooth cinematic camera push-in from an incoming scam call alert into the TakeTheCall AI Active Defense Shield dashboard, clean modern enterprise lighting" \
    --first-frame "${ASSETS_DIR}/intro_frame.png" \
    --last-frame "${ASSETS_DIR}/outro_frame.png" \
    --resolution 1080p \
    -o "${ASSETS_DIR}/intro_clip.mp4"
elif command -v ffmpeg >/dev/null 2>&1; then
  echo "[info] GEMINI_API_KEY not set; generating 1080p intro_clip.mp4 from keyframe via ffmpeg..."
  ffmpeg -y -loop 1 -i "${ASSETS_DIR}/intro_frame.png" \
    -c:v libx264 -t 4 -pix_fmt yuv420p -vf "scale=1920:1080" \
    "${ASSETS_DIR}/intro_clip.mp4" >/dev/null 2>&1
else
  echo "[info] Offline environment (no GEMINI_API_KEY or ffmpeg binary); keyframe assets ready in ${ASSETS_DIR}"
fi

echo "[3/3] Stitching final_submission.mp4 with English narration..."
if command -v ffmpeg >/dev/null 2>&1 && [[ -f "${ASSETS_DIR}/intro_clip.mp4" ]]; then
  if [[ -f "${ASSETS_DIR}/live_ui_capture.mp4" ]]; then
    ffmpeg -y \
      -i "${ASSETS_DIR}/intro_clip.mp4" \
      -i "${ASSETS_DIR}/live_ui_capture.mp4" \
      -i "${ASSETS_DIR}/narration_en.wav" \
      -filter_complex "[0:v][1:v]concat=n=2:v=1:a=0[v]" \
      -map "[v]" -map 2:a \
      -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest \
      "${ROOT_DIR}/final_submission.mp4" >/dev/null 2>&1
  else
    ffmpeg -y \
      -i "${ASSETS_DIR}/intro_clip.mp4" \
      -i "${ASSETS_DIR}/narration_en.wav" \
      -map 0:v -map 1:a \
      -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest \
      "${ROOT_DIR}/final_submission.mp4" >/dev/null 2>&1
  fi
  echo "[ok] Video pipeline ready: ${ROOT_DIR}/final_submission.mp4"
else
  echo "[ok] Audio & visual keyframe assets synthesized in ${ASSETS_DIR}"
fi
