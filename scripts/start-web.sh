#!/usr/bin/env sh
set -eu

export HOST="${HOST:-0.0.0.0}"
export PORT="${PORT:-8787}"
export VERITE_MEDIA_AI="${VERITE_MEDIA_AI:-1}"
export VERITE_MEDIA_AI_URL="${VERITE_MEDIA_AI_URL:-http://127.0.0.1:8790/analyze}"
export VERITE_MEDIA_AI_PORT="${VERITE_MEDIA_AI_PORT:-8790}"

python3 tools/media_ai_service.py &
MEDIA_AI_PID="$!"

cleanup() {
  kill "$MEDIA_AI_PID" 2>/dev/null || true
}

trap cleanup INT TERM EXIT

node server.js
