#!/bin/bash
# SanjivramOS boot updater, Ubuntu edition (runs as root in the background on every boot).
# Downloads the newest SanjivramOS from GitHub into /opt/sanjivramos/app and refreshes npm dependencies when
# they changed. If anything fails (offline, broken update) the copy that's already installed keeps working.
#   update.sh              normal boot update
#   update.sh --deps-only  only (re)install dependencies (used while building the ISO)
# Turn updates off: sudo touch /etc/sanjivramos/no-update
set -u
APP=/opt/sanjivramos/app
export PATH="/opt/sanjivramos/node/bin:$PATH" HOME=/root LC_ALL=C   # LC_ALL=C: same file order (and hash) at build and at boot
export npm_config_update_notifier=false npm_config_fund=false npm_config_audit=false
SJ_REPO=https://github.com/BabuManian/sanjivramos.git; SJ_BRANCH=main
[ -f /etc/sanjivramos/sanjivramos.conf ] && . /etc/sanjivramos/sanjivramos.conf
RUN=/run/sanjivramos; STATUS=$RUN/status
mkdir -p "$RUN"; chmod 755 "$RUN"; rm -f "$RUN/done"
trap 'touch "$RUN/done"' EXIT          # the launcher waits for this before starting the server
say() { echo "$*"; echo "$*" > "$STATUS" 2>/dev/null || true; }

# Download a URL to a file with the bundled Node (Ubuntu doesn't ship git or curl by default).
get() {  # get URL OUTFILE [ACCEPT]
  node -e '
    const [url, out, accept] = process.argv.slice(1);
    fetch(url, { headers: { "User-Agent": "sanjivramos-updater", Accept: accept || "*/*" }, signal: AbortSignal.timeout(240000) })
      .then(async r => { if (!r.ok) process.exit(1); require("fs").writeFileSync(out, Buffer.from(await r.arrayBuffer())); })
      .catch(() => process.exit(1));' "$1" "$2" "${3:-}"
}

# Reinstall a folder's node_modules when its package files changed (stamp = hash of package*.json).
deps() {
  local dir="$1" args="$2" stamp="$1/node_modules/.sj-stamp" sum
  [ -f "$dir/package.json" ] || return 0
  sum=$(cat "$dir"/package.json | sha256sum | cut -d' ' -f1)
  [ -f "$dir/package-lock.json" ] && sum=$(cat "$dir/package.json" "$dir/package-lock.json" | sha256sum | cut -d' ' -f1)
  [ -f "$stamp" ] && [ "$(cat "$stamp")" = "$sum" ] && return 0
  say "Installing $(basename "$dir") dependencies…"
  if [ -f "$dir/package-lock.json" ]; then (cd "$dir" && npm ci $args) else (cd "$dir" && npm install $args); fi || return 1
  # Hash again after installing: npm install may have just written package-lock.json.
  sum=$(cat "$dir"/package.json | sha256sum | cut -d' ' -f1)
  [ -f "$dir/package-lock.json" ] && sum=$(cat "$dir/package.json" "$dir/package-lock.json" | sha256sum | cut -d' ' -f1)
  echo "$sum" > "$stamp"
}
all_deps() {  # all_deps [APPDIR]
  local a="${1:-$APP}"
  deps "$a/server" "--omit=dev" || return 1
  deps "$a/distro/shell" "" || return 1
  # Electron 44+ only downloads its binary on first use: fetch it now (no-op when it's already there).
  local ei="$a/distro/shell/node_modules/electron/install.js"
  if [ -f "$ei" ] && [ ! -x "$a/distro/shell/node_modules/electron/dist/electron" ]; then
    say "Downloading the SanjivramOS window (Electron)…"
    (cd "$(dirname "$ei")" && node install.js) || return 1
  fi
  # Electron's sandbox helper must be setuid root (Ubuntu blocks Electron's other sandbox).
  local sb="$a/distro/shell/node_modules/electron/dist/chrome-sandbox"
  [ -f "$sb" ] && chown root:root "$sb" && chmod 4755 "$sb"
  return 0
}

# The installer, settings app and session scripts also come from the repo (distro-ubuntu/rootfs), so fixes to them
# arrive with the normal update instead of needing a new ISO. Scripts that don't parse are never installed.
sync_system() {
  local src="$APP/distro-ubuntu/rootfs" f
  [ -d "$src/usr/lib/sanjivramos/system" ] || return 0
  [ -f /etc/sanjivramos/no-system-sync ] && return 0
  for f in "$src"/usr/lib/sanjivramos/*.sh "$src"/usr/lib/sanjivramos/update.sh "$src"/usr/lib/sanjivramos/system/sjos-install "$src"/usr/lib/sanjivramos/system/sjos-admin; do
    [ -f "$f" ] || continue
    bash -n "$f" 2>/dev/null || { echo "Not syncing system files: $f has errors"; return 0; }
  done
  rsync -a --checksum "$src/usr/lib/sanjivramos/" /usr/lib/sanjivramos/ || return 0
  [ -f "$src/etc/polkit-1/rules.d/50-sanjivramos.rules" ] && install -m 644 "$src/etc/polkit-1/rules.d/50-sanjivramos.rules" /etc/polkit-1/rules.d/
  if [ -f "$src/etc/sudoers.d/sanjivramos" ] && visudo -cqf "$src/etc/sudoers.d/sanjivramos" 2>/dev/null; then install -m 440 "$src/etc/sudoers.d/sanjivramos" /etc/sudoers.d/sanjivramos; fi
  for f in "$src"/usr/share/applications/sanjivramos-*.desktop; do
    [ -f "$f" ] || continue
    [ "$(basename "$f")" = sanjivramos-install.desktop ] && ! grep -qw 'boot=casper' /proc/cmdline && continue   # live USB only
    install -m 644 "$f" /usr/share/applications/
  done
  return 0
}

if [ "${1:-}" = --deps-only ]; then all_deps; exit $?; fi
if [ -f /etc/sanjivramos/no-update ]; then say "Updates are turned off"; exit 0; fi

slug=$(echo "$SJ_REPO" | sed -E 's#^(https?://|git@)github\.com[:/]##; s#\.git$##; s#/$##')
say "Waiting for the internet…"
sha=""
for i in $(seq 1 20); do
  if get "https://api.github.com/repos/$slug/commits/$SJ_BRANCH" "$RUN/sha" application/vnd.github.sha; then
    sha=$(tr -dc '0-9a-f' < "$RUN/sha"); [ ${#sha} -eq 40 ] && break
  fi
  sha=""; sleep 3
done
if [ -z "$sha" ]; then say "Offline — starting the version already installed"; all_deps; sync_system; exit 0; fi

old=$(cat "$APP/.sj-commit" 2>/dev/null || echo none)
if [ "$sha" = "$old" ]; then say "Up to date (${sha:0:7})"; all_deps; sync_system; exit 0; fi

say "Downloading the latest SanjivramOS…"
rm -rf "$APP.new" "$RUN/app.tar.gz"; mkdir -p "$APP.new"
if ! get "https://codeload.github.com/$slug/tar.gz/$sha" "$RUN/app.tar.gz" || ! tar -xzf "$RUN/app.tar.gz" -C "$APP.new" --strip-components=1; then
  rm -rf "$APP.new" "$RUN/app.tar.gz"; say "Download failed — starting the version already installed"; all_deps; sync_system; exit 0
fi
rm -f "$RUN/app.tar.gz"
echo "$sha" > "$APP.new/.sj-commit"
# Reuse the installed dependencies as hard links (instant, no extra space). The running copy keeps its own, so the
# desktop never sees a half-updated app; deps() only reinstalls when package files changed (npm ci starts from scratch).
for d in server distro/shell; do
  [ -d "$APP/$d/node_modules" ] && [ -d "$APP.new/$d" ] && cp -al "$APP/$d/node_modules" "$APP.new/$d/"
done
if all_deps "$APP.new"; then
  rm -rf "$APP.old"; mv "$APP" "$APP.old" && mv "$APP.new" "$APP"; rm -rf "$APP.old"
  say "Updated to ${sha:0:7}"
  sync_system
else
  say "Update broke dependencies — keeping the installed version"
  rm -rf "$APP.new"
  all_deps
fi
exit 0
