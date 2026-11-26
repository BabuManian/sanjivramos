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
[ -x /usr/bin/chromium ] && export SANJIVRAM_CHROMIUM=/usr/bin/chromium   # optional, for other devices: sudo apt install chromium
# Linux apps open as real windows on this computer's screen (Openbox), not through noVNC.
export SANJIVRAM_NATIVE=1 DISPLAY=:0 XAUTHORITY="$HOME/.Xauthority"
export XDG_RUNTIME_DIR="/run/user/$(id -u)" DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$(id -u)/bus"
cd "$APP"
exec node server/index.js
