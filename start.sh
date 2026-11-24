#!/usr/bin/env bash
# Starts (or restarts) SanjivramOS in the background.  bash start.sh        → start
#                                                     bash start.sh stop   → stop
#                                                     bash start.sh log    → watch the log
cd "$(dirname "$0")"
export PORT="${PORT:-8080}"
export SANJIVRAM_DATA="${SANJIVRAM_DATA:-$HOME/.sanjivramos}"   # settings, accounts, logs — outside the repo
export GAMES_DIR="$PWD/games"
export SJ_HTTPS=0                                                # Codespaces already gives you https
mkdir -p "$SANJIVRAM_DATA"
PIDF="$SANJIVRAM_DATA/server.pid"; LOG="$SANJIVRAM_DATA/server.log"
stop() { [ -f "$PIDF" ] && kill "$(cat "$PIDF")" 2>/dev/null; rm -f "$PIDF"; }
case "${1:-start}" in
  stop) stop; echo "Stopped."; exit 0 ;;
  log)  exec tail -f "$LOG" ;;
esac
stop
# A password (Codespaces secret SITE_PASSWORD) also turns on the Terminal app: a real shell in this Codespace.
if [ -n "${SITE_PASSWORD:-}" ]; then export SANJIVRAM_SHELL=1 SANJIVRAM_TRUST_FORWARD=1; fi
[ -d server/node_modules ] || (cd server && npm ci --omit=dev --no-audit --no-fund)
nohup node server/index.js >>"$LOG" 2>&1 &
echo $! > "$PIDF"
sleep 1
if [ -n "${CODESPACE_NAME:-}" ]; then
  echo "SanjivramOS: https://${CODESPACE_NAME}-${PORT}.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}/"
else
  echo "SanjivramOS: http://localhost:${PORT}/"
fi
