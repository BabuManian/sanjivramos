#!/bin/bash
# Starts the SanjivramOS server as the sanjivram user (run by sanjivramos-server.service).
DATA=/var/lib/sanjivramos
APP=/opt/sanjivramos/app
# Other devices on your network need this password; the Electron shell on this computer doesn't.
if [ ! -s "$DATA/site-password" ]; then
  (umask 077; head -c 9 /dev/urandom | base64 | tr -d '/+=' > "$DATA/site-password")
fi
export SITE_PASSWORD="$(cat "$DATA/site-password")"
export SANJIVRAM_DATA="$DATA" GAMES_DIR="$APP/games" PORT="${PORT:-8080}" SANJIVRAM_SHELL=1
export SANJIVRAM_CHROMIUM=/usr/bin/chromium
cd "$APP"
exec node server/index.js
