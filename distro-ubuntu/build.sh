#!/usr/bin/env bash
# Builds the SanjivramOS live/installer ISO (Ubuntu 26.04 "resolute", amd64): debootstrap + casper + GRUB (UEFI with
# Secure Boot, and BIOS). Run as root on Ubuntu — easiest in a throwaway container (this is what GitHub Actions does):
#   docker run --rm --privileged -v "$PWD:/src" ubuntu:26.04 bash /src/distro-ubuntu/build.sh
# The ISO lands in distro-ubuntu/out/.  Env: SJ_REPO / SJ_BRANCH = where the OS downloads its updates from on every boot,
# WORK = build folder, MIRROR = Ubuntu mirror.
set -euxo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$HERE/.." && pwd)"
SUITE="${SUITE:-resolute}"
MIRROR="${MIRROR:-http://archive.ubuntu.com/ubuntu}"
SJ_REPO="${SJ_REPO:-https://github.com/BabuManian/sanjivramos.git}"
SJ_BRANCH="${SJ_BRANCH:-main}"
WORK="${WORK:-/var/tmp/sanjivramos-ubuntu}"
VERSION="${SJ_VERSION:-$(date -u +%Y.%m)}"
NODE_MAJOR="${NODE_MAJOR:-22}"
CH="$WORK/chroot"; ISO="$WORK/iso"; OUT="$HERE/out"
export DEBIAN_FRONTEND=noninteractive LC_ALL=C.UTF-8

apt-get update
apt-get install -y --no-install-recommends debootstrap squashfs-tools xorriso mtools dosfstools ca-certificates curl xz-utils git

cleanup() { for m in dev/pts dev proc sys run; do mountpoint -q "$CH/$m" 2>/dev/null && umount -l "$CH/$m" || true; done; }
trap cleanup EXIT
cleanup; rm -rf "$WORK"; mkdir -p "$CH" "$ISO/casper" "$ISO/boot/grub" "$ISO/EFI/boot" "$ISO/.disk" "$OUT"

# ---- 1. base system ----
debootstrap --arch=amd64 --variant=minbase --components=main,restricted,universe,multiverse "$SUITE" "$CH" "$MIRROR"
mount --bind /dev "$CH/dev"; mount --bind /dev/pts "$CH/dev/pts"; mount -t proc proc "$CH/proc"; mount -t sysfs sysfs "$CH/sys"; mount -t tmpfs tmpfs "$CH/run"
cp /etc/resolv.conf "$CH/etc/resolv.conf.build"
in_ch() { chroot "$CH" env DEBIAN_FRONTEND=noninteractive LC_ALL=C.UTF-8 HOME=/root PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin "$@"; }
# Name resolution while building (resolv.conf is a symlink into /run once systemd-resolved is installed).
in_ch sh -c 'rm -f /etc/resolv.conf; cp /etc/resolv.conf.build /etc/resolv.conf'
# Don't start services inside the build.
printf '#!/bin/sh\nexit 101\n' > "$CH/usr/sbin/policy-rc.d"; chmod +x "$CH/usr/sbin/policy-rc.d"

rm -f "$CH/etc/apt/sources.list"
cat > "$CH/etc/apt/sources.list.d/ubuntu.sources" <<EOF
Types: deb
URIs: $MIRROR
Suites: $SUITE $SUITE-updates $SUITE-backports
Components: main restricted universe multiverse

Types: deb
URIs: http://security.ubuntu.com/ubuntu
Suites: $SUITE-security
Components: main restricted universe multiverse
EOF
echo sanjivramos > "$CH/etc/hostname"
printf '127.0.0.1\tlocalhost\n127.0.1.1\tsanjivramos\n::1\tlocalhost ip6-localhost ip6-loopback\n' > "$CH/etc/hosts"
# Answers for packages that would ask questions.
in_ch debconf-set-selections <<'EOF'
keyboard-configuration keyboard-configuration/layoutcode string us
keyboard-configuration keyboard-configuration/modelcode string pc105
console-setup console-setup/charmap47 select UTF-8
tzdata tzdata/Areas select Etc
tzdata tzdata/Zones/Etc select UTC
EOF

# ---- 2. packages ----
PKGS=$(sed 's/#.*//' "$HERE/packages.list" | tr -s ' \n' ' ')
in_ch apt-get update
in_ch apt-get -y upgrade
# shellcheck disable=SC2086
in_ch apt-get install -y --no-install-recommends $PKGS
in_ch locale-gen en_US.UTF-8
echo 'LANG=en_US.UTF-8' > "$CH/etc/locale.conf"; ln -sf ../locale.conf "$CH/etc/default/locale"
[ -n "$(ls "$CH"/boot/vmlinuz-* 2>/dev/null)" ] || { echo "No kernel was installed"; exit 1; }

# Node.js (the SanjivramOS server needs node:sqlite: Node 22+), from nodejs.org.
NODE_TGZ=$(curl -fsSL "https://nodejs.org/dist/latest-v${NODE_MAJOR}.x/SHASUMS256.txt" | awk '/linux-x64\.tar\.xz$/{print $2; exit}')
curl -fsSL -o "$WORK/node.tar.xz" "https://nodejs.org/dist/latest-v${NODE_MAJOR}.x/$NODE_TGZ"
curl -fsSL "https://nodejs.org/dist/latest-v${NODE_MAJOR}.x/SHASUMS256.txt" | grep " $NODE_TGZ\$" | sed "s# $NODE_TGZ# $WORK/node.tar.xz#" | sha256sum -c -
mkdir -p "$CH/opt/sanjivramos/node"; tar -xJf "$WORK/node.tar.xz" -C "$CH/opt/sanjivramos/node" --strip-components=1
for b in node npm npx; do ln -sf "/opt/sanjivramos/node/bin/$b" "$CH/usr/local/bin/$b"; done

# ---- 3. SanjivramOS files ----
cp -a "$HERE/rootfs/." "$CH/"
chmod 440 "$CH/etc/sudoers.d/sanjivramos"; in_ch visudo -cf /etc/sudoers.d/sanjivramos
chmod +x "$CH"/usr/lib/sanjivramos/*.sh "$CH"/usr/lib/sanjivramos/{display-restore,live-installer,prime-run,sanjivramos-session,server.sh,session,session-wayland,start-session,update.sh} "$CH"/usr/lib/sanjivramos/system/{run,sjos-install,sjos-admin}
ln -sf /usr/lib/sanjivramos/prime-run "$CH/usr/local/bin/prime-run"
ln -sf /usr/lib/sanjivramos/sanjivramos-session "$CH/usr/local/bin/sanjivramos-session"
mkdir -p "$CH/etc/sanjivramos"
cat > "$CH/etc/sanjivramos/sanjivramos.conf" <<CONF
# SanjivramOS — where the OS downloads its updates from on every boot.
SJ_REPO=$SJ_REPO
SJ_BRANCH=$SJ_BRANCH
CONF
cat > "$CH/usr/lib/os-release" <<EOF
PRETTY_NAME="SanjivramOS"
NAME="SanjivramOS"
VERSION_ID="$VERSION"
VERSION="$VERSION"
VERSION_CODENAME=$SUITE
ID=sanjivramos
ID_LIKE="ubuntu debian"
HOME_URL="https://github.com/BabuManian/sanjivramos"
SUPPORT_URL="https://github.com/BabuManian/sanjivramos/issues"
BUG_REPORT_URL="https://github.com/BabuManian/sanjivramos/issues"
LOGO=sanjivramos
UBUNTU_CODENAME=$SUITE
EOF
printf 'DISTRIB_ID=SanjivramOS\nDISTRIB_RELEASE=%s\nDISTRIB_CODENAME=%s\nDISTRIB_DESCRIPTION="SanjivramOS"\n' "$VERSION" "$SUITE" > "$CH/etc/lsb-release"
# Boot splash: SanjivramOS watermark with Ubuntu's spinner animation.
cp -n "$CH"/usr/share/plymouth/themes/spinner/*.png "$CH/usr/share/plymouth/themes/sanjivramos/" 2>/dev/null || true
cp "$CH/usr/share/sanjivramos/plymouth-watermark.png" "$CH/usr/share/plymouth/themes/sanjivramos/watermark.png"
in_ch update-alternatives --install /usr/share/plymouth/themes/default.plymouth default.plymouth /usr/share/plymouth/themes/sanjivramos/sanjivramos.plymouth 200
in_ch update-alternatives --set default.plymouth /usr/share/plymouth/themes/sanjivramos/sanjivramos.plymouth
# NetworkManager manages every network (also wired) — Ubuntu's default only does that on desktops.
: > "$CH/etc/NetworkManager/conf.d/10-globally-managed-devices.conf"
# The SanjivramOS app itself (it updates itself from GitHub on every boot).
git clone --depth 1 -b "$SJ_BRANCH" "$SJ_REPO" "$CH/opt/sanjivramos/app"
git -C "$CH/opt/sanjivramos/app" rev-parse HEAD > "$CH/opt/sanjivramos/app/.sj-commit"
rm -rf "$CH/opt/sanjivramos/app/.git"
# Use this checkout's distro files (the clone may be older than the files being built, e.g. on a branch).
mkdir -p "$CH/opt/sanjivramos/app/distro-ubuntu"; cp -a "$HERE/rootfs" "$CH/opt/sanjivramos/app/distro-ubuntu/"
in_ch /usr/lib/sanjivramos/update.sh --deps-only
[ -x "$CH/opt/sanjivramos/app/distro/shell/node_modules/electron/dist/electron" ] || { echo "Electron is missing"; exit 1; }
# The live user is made by casper at boot (etc/casper.conf); the installer makes the real one.
in_ch systemctl enable sanjivramos-update.service sanjivramos-server.service sanjivramos-session.service NetworkManager.service systemd-timesyncd.service
in_ch systemctl set-default graphical.target
in_ch systemctl mask apt-daily.timer apt-daily-upgrade.timer motd-news.timer 2>/dev/null || true

# ---- 4. initramfs + clean up ----
in_ch update-initramfs -u -k all
in_ch apt-get clean
rm -rf "$CH"/var/lib/apt/lists/* "$CH"/var/cache/apt/*.bin "$CH"/tmp/* "$CH"/root/.npm "$CH"/root/.cache "$CH/etc/resolv.conf.build" "$CH/usr/sbin/policy-rc.d"
: > "$CH/etc/machine-id"; rm -f "$CH/var/lib/dbus/machine-id"
ln -sf ../run/systemd/resolve/stub-resolv.conf "$CH/etc/resolv.conf"
in_ch dpkg-query -W --showformat='${Package} ${Version}\n' > "$ISO/casper/filesystem.manifest"
KVER=$(basename "$(ls -1 "$CH"/boot/vmlinuz-* | sort -V | tail -1)" | sed 's/^vmlinuz-//')
cp "$CH/boot/vmlinuz-$KVER" "$ISO/casper/vmlinuz"
cp "$CH/boot/initrd.img-$KVER" "$ISO/casper/initrd"

# ---- 5. boot loader files for the ISO (taken from the image, so they match) ----
cp -a "$CH/usr/lib/grub/i386-pc" "$ISO/boot/grub/"
mkdir -p "$ISO/boot/grub/fonts"; cp "$CH/usr/share/grub/unicode.pf2" "$ISO/boot/grub/fonts/"
cat > "$ISO/boot/grub/grub.cfg" <<'EOF'
set timeout=5
loadfont unicode
set menu_color_normal=white/black
set menu_color_highlight=black/light-gray

menuentry "Start SanjivramOS" {
    set gfxpayload=keep
    linux  /casper/vmlinuz boot=casper quiet splash ---
    initrd /casper/initrd
}
menuentry "Start SanjivramOS (safe graphics)" {
    set gfxpayload=keep
    linux  /casper/vmlinuz boot=casper nomodeset quiet splash ---
    initrd /casper/initrd
}
menuentry "Start SanjivramOS (X11 desktop)" {
    set gfxpayload=keep
    linux  /casper/vmlinuz boot=casper sj.session=x11 quiet splash ---
    initrd /casper/initrd
}
grub_platform
if [ "$grub_platform" = "efi" ]; then
menuentry 'Boot from next volume' {
    exit 1
}
menuentry 'UEFI Firmware Settings' {
    fwsetup
}
fi
EOF
cat > "$ISO/boot/grub/loopback.cfg" <<'EOF'
menuentry "Start SanjivramOS" {
    linux  /casper/vmlinuz boot=casper iso-scan/filename=${iso_path} quiet splash ---
    initrd /casper/initrd
}
EOF
echo "SanjivramOS $VERSION amd64 ($(date -u +%Y%m%d))" > "$ISO/.disk/info"
echo "full_cd/single" > "$ISO/.disk/cd_type"
: > "$ISO/.disk/base_installable"
# BIOS: a GRUB core image that finds the ISO and reads /boot/grub/grub.cfg.
cat > "$WORK/grub-bios.cfg" <<'EOF'
search --no-floppy --set=root --file /.disk/info
set prefix=($root)/boot/grub
configfile ($root)/boot/grub/grub.cfg
EOF
cp "$WORK/grub-bios.cfg" "$CH/tmp/grub-bios.cfg"
in_ch grub-mkstandalone --format=i386-pc --output=/tmp/core.img \
  --install-modules="linux linux16 normal iso9660 biosdisk memdisk search search_fs_file tar ls configfile all_video gfxterm font echo test" \
  --modules="linux normal iso9660 biosdisk search search_fs_file configfile" --locales="" --fonts="" \
  "boot/grub/grub.cfg=/tmp/grub-bios.cfg"
cat "$CH/usr/lib/grub/i386-pc/cdboot.img" "$CH/tmp/core.img" > "$ISO/boot/grub/bios.img"
rm -f "$CH/tmp/core.img" "$CH/tmp/grub-bios.cfg"
# UEFI: Microsoft-signed shim -> Canonical-signed GRUB (Secure Boot works), which looks for /.disk/info and /boot/grub/grub.cfg.
SHIM=$(ls "$CH"/usr/lib/shim/shimx64.efi.signed.latest "$CH"/usr/lib/shim/shimx64.efi.signed 2>/dev/null | head -1)
GRUBEFI=$(ls "$CH"/usr/lib/grub/x86_64-efi-signed/gcdx64.efi.signed "$CH"/usr/lib/grub/x86_64-efi-signed/grubx64.efi.signed 2>/dev/null | head -1)
MM=$(ls "$CH"/usr/lib/shim/mmx64.efi.signed "$CH"/usr/lib/shim/mmx64.efi 2>/dev/null | head -1)
[ -n "$SHIM" ] && [ -n "$GRUBEFI" ] || { echo "Signed shim/GRUB not found"; exit 1; }
cp "$SHIM" "$ISO/EFI/boot/bootx64.efi"; cp "$GRUBEFI" "$ISO/EFI/boot/grubx64.efi"; [ -n "$MM" ] && cp "$MM" "$ISO/EFI/boot/mmx64.efi"
mkdir -p "$ISO/EFI/ubuntu"; printf 'search --no-floppy --set=root --file /.disk/info\nset prefix=($root)/boot/grub\nconfigfile ($root)/boot/grub/grub.cfg\n' > "$ISO/EFI/ubuntu/grub.cfg"
cp "$ISO/EFI/ubuntu/grub.cfg" "$ISO/EFI/boot/grub.cfg"
EFIIMG="$WORK/efiboot.img"
rm -f "$EFIIMG"; mkfs.vfat -C -n SJOS_EFI "$EFIIMG" 10240 >/dev/null
mmd -i "$EFIIMG" ::/EFI ::/EFI/BOOT ::/EFI/ubuntu
mcopy -i "$EFIIMG" "$ISO/EFI/boot/bootx64.efi" ::/EFI/BOOT/BOOTX64.EFI
mcopy -i "$EFIIMG" "$ISO/EFI/boot/grubx64.efi" ::/EFI/BOOT/grubx64.efi
[ -f "$ISO/EFI/boot/mmx64.efi" ] && mcopy -i "$EFIIMG" "$ISO/EFI/boot/mmx64.efi" ::/EFI/BOOT/mmx64.efi
mcopy -i "$EFIIMG" "$ISO/EFI/ubuntu/grub.cfg" ::/EFI/BOOT/grub.cfg
mcopy -i "$EFIIMG" "$ISO/EFI/ubuntu/grub.cfg" ::/EFI/ubuntu/grub.cfg

# ---- 6. squashfs + ISO ----
cleanup
mksquashfs "$CH" "$ISO/casper/filesystem.squashfs" -comp xz -b 1M -Xdict-size 100% -noappend -wildcards -e 'proc/*' 'sys/*' 'dev/*' 'run/*' 'tmp/*'
printf '%s' "$(du -sx --block-size=1 "$CH" | cut -f1)" > "$ISO/casper/filesystem.size"
(cd "$ISO" && find . -type f ! -name md5sum.txt ! -path './boot/grub/i386-pc/*' -print0 | xargs -0 md5sum > md5sum.txt)
OUTISO="$OUT/sanjivramos-amd64.iso"
xorriso -as mkisofs -r -iso-level 3 -full-iso9660-filenames -J -joliet-long -V SANJIVRAMOS \
  -o "$OUTISO" \
  --grub2-mbr "$CH/usr/lib/grub/i386-pc/boot_hybrid.img" \
  -partition_offset 16 --mbr-force-bootable \
  -append_partition 2 28732ac11ff8d211ba4b00a0c93ec93b "$EFIIMG" -appended_part_as_gpt \
  -iso_mbr_part_type a2a0d0ebe5b9334487c068b6b72699c7 \
  -c boot.catalog \
  -b boot/grub/bios.img -no-emul-boot -boot-load-size 4 -boot-info-table --grub2-boot-info \
  -eltorito-alt-boot -e '--interval:appended_partition_2:all::' -no-emul-boot \
  "$ISO"
(cd "$OUT" && sha256sum "$(basename "$OUTISO")" > "$(basename "$OUTISO").sha256")
# Keep the system image next to the ISO for the install test (CI).
[ -n "${KEEP_SQUASHFS:-}" ] && cp "$ISO/casper/filesystem.squashfs" "$OUT/filesystem.squashfs"
ls -lh "$OUT"
size=$(stat -c %s "$OUTISO"); echo "ISO size: $((size / 1048576)) MiB"
[ "$size" -lt 2147000000 ] || { echo "ISO is too big for a GitHub release (2 GiB max)"; exit 1; }
