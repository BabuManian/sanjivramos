#!/bin/sh
# Writes ~/.config/labwc/rc.xml for the Wayland session: the SanjivramOS window stays at the bottom with no
# decorations, and maximized apps leave room for its panel and dock. labwc fills in its default keybinds.
#   labwc-setup.sh [top bottom left right]   (then labwc reloads if it's running)
T=${1:-0}; B=${2:-0}; L=${3:-0}; R=${4:-0}
for v in "$T" "$B" "$L" "$R"; do case $v in ''|*[!0-9]*) echo "bad margin: $v" >&2; exit 1;; esac; done
DIR="$HOME/.config/labwc"; mkdir -p "$DIR"
cat > "$DIR/rc.xml.tmp" <<XML
<?xml version="1.0"?>
<labwc_config>
  <core><decoration>server</decoration><gap>0</gap></core>
  <theme><name>Onyx</name><cornerRadius>8</cornerRadius><font place="ActiveWindow"><name>sans</name><size>10</size><weight>bold</weight></font></theme>
  <placement><policy>cascade</policy></placement>
  <margin top="$T" bottom="$B" left="$L" right="$R" />
  <focus><followMouse>no</followMouse><raiseOnFocus>yes</raiseOnFocus></focus>
  <windowRules>
    <windowRule title="SanjivramOS Desktop" serverDecoration="no" skipTaskbar="yes" skipWindowSwitcher="yes" ignoreFocusRequest="no">
      <action name="MoveTo" x="0" y="0" />
      <action name="ToggleAlwaysOnBottom" />
    </windowRule>
  </windowRules>
</labwc_config>
XML
mv "$DIR/rc.xml.tmp" "$DIR/rc.xml"
[ -z "$LABWC_PID" ] && [ -f "${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/sanjivramos-session.env" ] && LABWC_PID=$(sed -n 's/^LABWC_PID=//p' "${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/sanjivramos-session.env")
[ -n "$LABWC_PID" ] && kill -HUP "$LABWC_PID" 2>/dev/null
exit 0
