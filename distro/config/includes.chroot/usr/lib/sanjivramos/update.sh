#!/bin/bash
# SanjivramOS boot updater (runs as root before the server starts, every boot).
# Downloads the newest SanjivramOS from GitHub into /opt/sanjivramos/app, refreshes npm dependencies when they
# changed, and syncs the distro's own files (this script, services, fastfetch) from the repo.
#   update.sh              normal boot update
#   update.sh --deps-only  only (re)install dependencies (used while building the ISO)
# Turn updates off: touch /etc/sanjivramos/no-update
set -u
APP=/opt/sanjivramos/app
SJ_REPO=https://github.com/BabuManian/sanjivramos.git; SJ_BRANCH=main
[ -f /etc/sanjivramos/sanjivramos.conf ] && . /etc/sanjivramos/sanjivramos.conf
STATUS=/run/sanjivramos/status
mkdir -p /run/sanjivramos; chmod 755 /run/sanjivramos
say() { echo "$*"; echo "$*" > "$STATUS" 2>/dev/null || true; }
export HOME=/root npm_config_update_notifier=false npm_config_fund=false npm_config_audit=false

# Reinstall a folder's node_modules when its package files changed (stamp = hash of package*.json).
deps() {
  local dir="$1" args="$2" stamp="$1/node_modules/.sj-stamp" sum
  [ -f "$dir/package.json" ] || return 0
  sum=$(cat "$dir"/package*.json | sha256sum | cut -d' ' -f1)
  [ -f "$stamp" ] && [ "$(cat "$stamp")" = "$sum" ] && return 0
  say "Installing $(basename "$dir") dependencies…"
  if [ -f "$dir/package-lock.json" ]; then (cd "$dir" && npm ci $args) else (cd "$dir" && npm install $args); fi || return 1
  echo "$sum" > "$stamp"
}
all_deps() {
  deps "$APP/server" "--omit=dev" || return 1
  deps "$APP/distro/shell" "" || return 1
  # Electron's sandbox helper must be setuid root
  local sb="$APP/distro/shell/node_modules/electron/dist/chrome-sandbox"
  [ -f "$sb" ] && chown root:root "$sb" && chmod 4755 "$sb"
  return 0
}

# Copy the distro's own files from the repo, so services and tools update too.
sync_system() {
  local src="$APP/distro/config/includes.chroot"
  [ -d "$src" ] && [ ! -f /etc/sanjivramos/no-system-sync ] || return 0
  local f dest
  # Copy to a temp file then rename: this very script is running and bash reads it as it goes.
  for f in "$src"/usr/lib/sanjivramos/* "$src"/etc/xdg/fastfetch/* "$src"/etc/systemd/system/sanjivramos-*.service; do
    [ -f "$f" ] || continue
    dest="/${f#"$src"/}"; mkdir -p "$(dirname "$dest")"
    cmp -s "$f" "$dest" || { cp "$f" "$dest.sjnew" && mv -f "$dest.sjnew" "$dest"; }
  done
  chmod 755 /usr/lib/sanjivramos/* 2>/dev/null
  systemctl daemon-reload 2>/dev/null || true
}

if [ "${1:-}" = --deps-only ]; then all_deps; exit $?; fi
if [ -f /etc/sanjivramos/no-update ]; then say "Updates are turned off"; exit 0; fi
git config --global --add safe.directory "$APP" 2>/dev/null

say "Waiting for the internet…"
online=0
for i in $(seq 1 25); do
  if timeout 8 git ls-remote --heads "$SJ_REPO" "$SJ_BRANCH" >/dev/null 2>&1; then online=1; break; fi
  sleep 1
done
if [ $online = 0 ]; then say "Offline — starting the version already installed"; all_deps; exit 0; fi

old=$(git -C "$APP" rev-parse HEAD 2>/dev/null || echo none)
say "Downloading the latest SanjivramOS…"
if [ ! -d "$APP/.git" ]; then
  rm -rf "$APP.new" && git clone --depth 1 -b "$SJ_BRANCH" "$SJ_REPO" "$APP.new" && rm -rf "$APP" && mv "$APP.new" "$APP"
else
  git -C "$APP" remote set-url origin "$SJ_REPO"
  timeout 180 git -C "$APP" fetch --depth 1 origin "$SJ_BRANCH" && git -C "$APP" reset -q --hard FETCH_HEAD
fi || { say "Download failed — starting the version already installed"; all_deps; exit 0; }
new=$(git -C "$APP" rev-parse HEAD)

if ! all_deps; then
  if [ "$old" != none ] && [ "$old" != "$new" ]; then
    say "Update broke dependencies — going back"
    git -C "$APP" reset -q --hard "$old" 2>/dev/null && rm -f "$APP"/server/node_modules/.sj-stamp "$APP"/distro/shell/node_modules/.sj-stamp && all_deps
  fi
  exit 0
fi
sync_system
git -C "$APP" reflog expire --expire=now --all 2>/dev/null; git -C "$APP" gc -q --prune=now 2>/dev/null &
if [ "$old" = "$new" ]; then say "Up to date ($(git -C "$APP" log -1 --format='%h %cs'))"
else say "Updated to $(git -C "$APP" log -1 --format='%h %cs')"; fi
exit 0
