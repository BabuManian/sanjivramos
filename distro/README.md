# SanjivramOS Linux

A real Linux distro for 64-bit PCs. It's built on **Debian 13 (trixie)** and boots straight into SanjivramOS, which runs full screen in an **Electron** shell.

- **Updates on every boot:** before the desktop starts, `sanjivramos-update.service` downloads the newest SanjivramOS from this GitHub repo (`git fetch` into `/opt/sanjivramos/app`). It reinstalls npm dependencies when they change and also updates its own services and scripts from `distro/config/includes.chroot`. If you're offline it starts the copy that's already installed.
- **Real app windows, no noVNC.** Openbox runs under the Electron shell, so Linux apps (`sudo apt install gimp`, then open it from Linux Apps) get fast native windows on top of SanjivramOS. Each window gets a button in the SanjivramOS dock (click to show or minimise; right-click to maximise or close), and maximised apps leave room for the panel and dock.
- **Web Browser = real Chromium tabs.** In the distro the Web Browser app uses Electron webviews instead of streaming a headless Chromium. That means full speed, video, sound and GPU, plus a built-in ad and tracker blocker, downloads to `~/Downloads`, find in page, zoom, a right-click menu and the usual shortcuts (Ctrl+T/W/L/F/D, Ctrl+Tab, F5, F11, F12). Sites ask before using your camera, microphone or location.
- **fastfetch says Arch.** Run `fastfetch` (or `neofetch`) and you'll see the Arch logo, "Arch Linux x86_64", an `-arch1-1` kernel and a `(pacman)` package count. Underneath it's Debian, so `apt` is still the package manager.

## Get it
GitHub Actions builds the ISO every time `distro/` changes: **Releases → iso-latest → `sanjivramos-amd64.iso`**. You can also start a build by hand under Actions → *Build SanjivramOS ISO* → Run workflow.

Flash the ISO to a USB stick with balenaEtcher, Rufus or `dd`, then boot from it. The boot menu has **Live** (try it) and **Install** (Debian installer that copies the system to disk). It also runs in VirtualBox, QEMU or GNOME Boxes.

## Using it
| | |
|---|---|
| User / sudo password | `sanjivram` / `sanjivram` (change it with `passwd`) |
| Text console | Ctrl+Alt+F2 (back to the desktop: Ctrl+Alt+F1) |
| Wi-Fi | Terminal app → `nmtui` |
| Update now | `sudo systemctl restart sanjivramos-update sanjivramos-server` |
| Update log | `journalctl -u sanjivramos-update -b` |
| Turn off updates | `sudo touch /etc/sanjivramos/no-update` |
| Use a different repo/branch | edit `/etc/sanjivramos/sanjivramos.conf` |
| Other devices on your network | `http://<this-pc-ip>:8080/`, password in `/var/lib/sanjivramos/site-password` |

## Build it yourself
On any Linux machine with Docker (takes about 30–60 min and needs ~15 GB free):
```
docker run --rm --privileged -v "$PWD:/src" debian:trixie bash /src/distro/build.sh
```
The ISO ends up in `distro/out/`.

## How it fits together
- `build.sh`: live-build configuration (trixie, amd64, ISO hybrid image, Debian installer)
- `config/package-lists/`: packages (kernel, firmware, Xorg, Electron libraries, PipeWire, fastfetch)
- `config/hooks/normal/0500-sanjivramos.hook.chroot`: installs Node 22, creates the `sanjivram` user, clones this repo, installs dependencies and turns on the services
- `config/includes.chroot/`: systemd units, the updater (`update.sh`), server launcher, X session and fastfetch config
- `shell/`: the Electron app (`main.js` window + webview browser, `preload.js` = `window.sjNative` for SanjivramOS). It shows a splash with the update progress, then opens `http://localhost:8080/` full screen
- `includes.chroot/usr/lib/sanjivramos/openbox-setup.sh`: Openbox config (SanjivramOS window kept below apps, margins for the panel/dock)
