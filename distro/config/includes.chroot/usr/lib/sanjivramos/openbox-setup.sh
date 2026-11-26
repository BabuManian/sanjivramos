#!/bin/sh
# Writes ~/.config/openbox/rc.xml from Openbox's default config, with SanjivramOS's rules:
# the SanjivramOS window stays below app windows, and maximized apps leave room for its panel and dock.
#   openbox-setup.sh [top bottom left right]   (pixels; then Openbox reloads if it's running)
T=${1:-0}; B=${2:-0}; L=${3:-0}; R=${4:-0}
for v in "$T" "$B" "$L" "$R"; do case $v in ''|*[!0-9]*) echo "bad margin: $v" >&2; exit 1;; esac; done
SRC=/etc/xdg/openbox/rc.xml; DIR="$HOME/.config/openbox"; OUT="$DIR/rc.xml"
[ -f "$SRC" ] || exit 0
mkdir -p "$DIR"
T="$T" B="$B" L="$L" R="$R" perl -0pe '
  s{<margins>.*?</margins>}{<margins><top>$ENV{T}</top><bottom>$ENV{B}</bottom><left>$ENV{L}</left><right>$ENV{R}</right></margins>}s;
  s{(<theme>\s*<name>)[^<]*(</name>)}{$1Onyx$2}s;
  s{<applications>}{<applications>
    <application title="SanjivramOS Desktop" type="normal">
      <decor>no</decor><layer>below</layer><skip_taskbar>yes</skip_taskbar><skip_pager>yes</skip_pager>
      <position force="yes"><x>0</x><y>0</y></position><focus>yes</focus>
    </application>
' "$SRC" > "$OUT.tmp" && mv "$OUT.tmp" "$OUT"
[ -n "$DISPLAY" ] && pgrep -u "$(id -u)" -x openbox >/dev/null && openbox --reconfigure
exit 0
