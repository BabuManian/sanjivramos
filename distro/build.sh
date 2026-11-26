#!/usr/bin/env bash
# Builds the SanjivramOS live/installer ISO (Debian trixie, amd64) with live-build.
# Run as root on Debian trixie — easiest is a throwaway container (this is what GitHub Actions does):
#   docker run --rm --privileged -v "$PWD:/src" debian:trixie bash /src/distro/build.sh
# The ISO lands in distro/out/.  Env: SJ_REPO / SJ_BRANCH = where the OS pulls its updates from on every boot.
set -euxo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SJ_REPO="${SJ_REPO:-https://github.com/BabuManian/sanjivramos.git}"
SJ_BRANCH="${SJ_BRANCH:-main}"
WORK="${WORK:-/var/tmp/sanjivramos-build}"

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends live-build ca-certificates curl git xorriso cpio

rm -rf "$WORK"; mkdir -p "$WORK"; cd "$WORK"
lb config \
  --distribution trixie \
  --architectures amd64 \
  --archive-areas "main contrib non-free non-free-firmware" \
  --binary-images iso-hybrid \
  --debian-installer "${SJ_INSTALLER:-live}" \
  --debian-installer-gui true \
  --apt-recommends true \
  --firmware-binary true --firmware-chroot true \
  --iso-application "SanjivramOS" \
  --iso-volume "SANJIVRAMOS" \
  --iso-publisher "SanjivramOS; https://github.com/BabuManian/sanjivramos" \
  --image-name sanjivramos \
  --bootappend-live "boot=live components quiet splash hostname=sanjivramos locales=en_US.UTF-8 keyboard-layouts=us"

cp -a "$HERE/config/." config/
# Bake in where updates come from (the hook and the boot-time updater read this).
cat > config/includes.chroot/etc/sanjivramos/sanjivramos.conf <<CONF
# SanjivramOS — where the OS downloads its updates from on every boot.
SJ_REPO=$SJ_REPO
SJ_BRANCH=$SJ_BRANCH
CONF
chmod +x config/hooks/normal/*.hook.chroot config/includes.chroot/usr/lib/sanjivramos/*

lb build 2>&1 | tee build.log
mkdir -p "$HERE/out"
ISO="$HERE/out/sanjivramos-amd64.iso"
mv -f "$WORK"/*.iso "$ISO"
(cd "$HERE/out" && sha256sum "$(basename "$ISO")" > "$(basename "$ISO").sha256")
ls -lh "$HERE/out"
