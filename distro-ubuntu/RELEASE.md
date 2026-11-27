SanjivramOS Linux: boots straight into the SanjivramOS desktop, with its own installer and settings (Wi‑Fi, display, sound, keyboard, date & time, password, power), boot splash and fastfetch. Based on Ubuntu 26.04.

### Download
Download **`sanjivramos-amd64.iso`** (one file, about 1.6 GB) and flash it to a USB stick (4 GB+) with balenaEtcher, Rufus, or `dd`. Boot from the USB.

Check the download (optional): `sha256sum -c sanjivramos-amd64.iso.sha256`

### Installing
- **Live USB:** starts by itself, no password. **Install SanjivramOS** opens on its own and is also on the desktop. Choose **Try SanjivramOS** to look around first.
- **Installer:** connect to Wi‑Fi (or skip), pick your keyboard and time zone, the disk to install on (everything on it is erased), then your name, username and password. Choose whether SanjivramOS asks for your password when it starts. It works on UEFI (Secure Boot too) and older BIOS PCs.
- **After installing:** the lock screen asks for the password you chose in the installer (unless you turned that off). It's also your `sudo` password. Wi‑Fi you joined in the installer stays connected.

### Settings
Settings → **This Computer**: Display (resolution, refresh rate, scaling, rotation, brightness), Sound (volume, speakers, microphone), Wi‑Fi, Keyboard, Date & time, Password & sign-in, Power and About.

### More
- **Terminal:** works on the computer itself without signing in. Other devices on your network still need the owner account.
- **Text console:** Ctrl+Alt+F2 (back to the desktop: Ctrl+Alt+F1).
- SanjivramOS updates itself (and its installer and settings) from this repo on every boot with internet, and works offline too.

### Wi‑Fi drivers
Firmware for Intel, Realtek, Atheros/Qualcomm, MediaTek, Broadcom, Marvell and TI chips, plus the Broadcom STA (`wl`) driver for older Broadcom chips (BCM43xx). With Secure Boot on, the Broadcom STA driver only loads after Secure Boot is turned off in the PC's firmware settings (or its signing key is enrolled). In a virtual machine there is no Wi‑Fi adapter: the VM's wired connection is used instead.
