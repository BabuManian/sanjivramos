#!/bin/bash
# Boots a SanjivramOS disk or ISO in QEMU and checks that the SanjivramOS server comes up, and (installed systems) that
# the lock screen accepts the password chosen in the installer and refuses a wrong one.
#   vm-check.sh <name> <uefi|secureboot|bios> <disk.img|iso> [password]
set -uo pipefail
NAME=$1 MODE=$2 IMG=$3 PW=${4:-}
OUTD=${OUTD:-distro-ubuntu/out/test}; mkdir -p "$OUTD"
PORT=$((18000 + RANDOM % 1000))
FW=(); MACH=q35
if [ "$MODE" = uefi ]; then cp /usr/share/OVMF/OVMF_VARS_4M.fd "$OUTD/vars-$NAME.fd"; FW=(-drive if=pflash,format=raw,readonly=on,file=/usr/share/OVMF/OVMF_CODE_4M.fd -drive if=pflash,format=raw,file="$OUTD/vars-$NAME.fd"); fi
# Secure Boot with Microsoft's keys enrolled, like a normal PC.
if [ "$MODE" = secureboot ]; then cp /usr/share/OVMF/OVMF_VARS_4M.ms.fd "$OUTD/vars-$NAME.fd"; MACH=q35,smm=on; FW=(-global driver=cfi.pflash01,property=secure,value=on -drive if=pflash,format=raw,readonly=on,file=/usr/share/OVMF/OVMF_CODE_4M.secboot.fd -drive if=pflash,format=raw,file="$OUTD/vars-$NAME.fd"); fi
case $IMG in *.iso) DRV=(-cdrom "$IMG");; *) DRV=(-drive file="$IMG",format=raw,if=virtio);; esac
qemu-system-x86_64 -enable-kvm -cpu host -m 4096 -smp 2 -machine $MACH "${FW[@]}" "${DRV[@]}" \
  -netdev user,id=n0,hostfwd=tcp:127.0.0.1:$PORT-:8080 -device virtio-net-pci,netdev=n0 \
  -vga std -display none -serial file:"$OUTD/serial-$NAME.log" -monitor unix:"$OUTD/mon-$NAME.sock",server,nowait &
QPID=$!
shot() { echo "screendump $OUTD/$NAME-$1.ppm" | socat - UNIX-CONNECT:"$OUTD/mon-$NAME.sock" >/dev/null 2>&1; sleep 1; convert "$OUTD/$NAME-$1.ppm" "$OUTD/$NAME-$1.png" 2>/dev/null && rm -f "$OUTD/$NAME-$1.ppm"; }
ok=0; J=""
for i in $(seq 1 120); do   # up to 10 minutes
  sleep 5
  kill -0 $QPID 2>/dev/null || { echo "QEMU exited"; break; }
  [ $((i % 12)) = 0 ] && shot "t$((i * 5))"
  J=$(curl -s -m 4 -H "Host: localhost:8080" "http://127.0.0.1:$PORT/sanjivram-server.json" || true)
  if echo "$J" | jq -e '.app == "SanjivramOS" and .linuxUser != null' >/dev/null 2>&1; then ok=1; break; fi
done
echo "$NAME: server.json = $J"
fail=0
if [ $ok = 1 ]; then
  echo "$NAME: SanjivramOS server is up after $((i * 5)) s"
  sleep 60; shot desktop   # the desktop (and on the live USB the installer) needs a moment to appear
  if [ -n "$PW" ]; then
    sleep 5
    U="http://127.0.0.1:$PORT/sanjivram-linux-unlock"
    bad=$(curl -s -o /dev/null -w '%{http_code}' -m 15 -H "Host: localhost:8080" -H 'content-type: application/json' -d '{"password":"definitely-wrong"}' "$U")
    good=$(curl -s -m 15 -H "Host: localhost:8080" -H 'content-type: application/json' -d "$(jq -cn --arg p "$PW" '{password:$p}')" "$U")
    echo "$NAME: wrong password -> HTTP $bad, right password -> $good"
    [ "$bad" = 401 ] || fail=1
    echo "$good" | jq -e '.ok == true' >/dev/null || fail=1
    echo "$J" | jq -e '.linuxUser.password == true' >/dev/null || { echo "$NAME: linuxUser.password should be true"; fail=1; }
  else
    echo "$J" | jq -e '.linuxUser.password == false' >/dev/null || { echo "$NAME: live user should have no password"; fail=1; }
  fi
else
  shot timeout; fail=1
  echo "$NAME: the SanjivramOS server didn't come up"; tail -n 80 "$OUTD/serial-$NAME.log" || true
fi
echo "system_powerdown" | socat - UNIX-CONNECT:"$OUTD/mon-$NAME.sock" >/dev/null 2>&1
for i in $(seq 30); do kill -0 $QPID 2>/dev/null || break; sleep 2; done
kill $QPID 2>/dev/null; wait $QPID 2>/dev/null
[ $fail = 0 ] && echo "$NAME: PASS" || echo "$NAME: FAIL"
exit $fail
