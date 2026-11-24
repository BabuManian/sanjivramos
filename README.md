# SanjivramOS

A web desktop OS. This repository runs it in **GitHub Codespaces**.

## Open it

1. On this repository's page: **Code → Codespaces → Create codespace on main**.
2. Wait for setup (about 1–2 minutes the first time). SanjivramOS starts by itself and opens in a new tab.
   If it doesn't, open the **PORTS** tab and click the globe next to port **8080**.

The address looks like `https://<codespace-name>-8080.app.github.dev/`. Only you can open it (you have to be logged
in to GitHub). To share it: **PORTS** tab → right-click port 8080 → **Port Visibility → Public** — set a password first.

## Password and the Terminal app

Add a Codespaces secret named **`SITE_PASSWORD`** (GitHub → Settings → Codespaces → Secrets, give this repository
access), then restart the Codespace. SanjivramOS then asks for that password (any user name), and its **Terminal**
app opens a real shell in the Codespace. Without a password the Terminal app uses the built-in sanjsh only.

## Commands (in the Codespace's terminal)

| Command | What it does |
|---|---|
| `bash start.sh` | Start or restart SanjivramOS |
| `bash start.sh stop` | Stop it |
| `bash start.sh log` | Watch the server log |

Your settings live in your browser (and server data in `~/.sanjivramos` in the Codespace), not in this repository.

## Good to know

- Codespaces stop after 30 minutes without activity; open the Codespace again and SanjivramOS starts by itself.
- Phone-only parts (Android apps, phone shell desktop, Chromium Web Browser) don't work here; the proxy browser does.
- Free GitHub accounts get a monthly allowance of Codespaces hours — stop the Codespace when you're done.
