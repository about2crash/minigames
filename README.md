# Minigames

Party games: pass one phone or laptop around, or play on everyone's own phone.
Multiplayer games connect the phones directly (WebRTC), with no game server.
A static site, deployed to GitHub Pages and installable as an app (PWA, works offline).
Python + uv are only used to build and preview it.

## Run locally

```sh
uv run minigames                  # opens http://127.0.0.1:8765/
uv run minigames --host 0.0.0.0   # play from phones on your network
uv run minigames build            # only regenerate site/games.json
uv run minigames test             # Python checks + JavaScript tests (needs Node 20+)
```

## Games

| Game | What it is |
| --- | --- |
| [Second Shot](site/games/second-shot/) | Click twice exactly N seconds apart. Furthest off is out each round; an exact hit wins instantly. Keeps a GOAT record per target time. |
| [Gallery Guess](site/games/gallery-guess/) | Everyone picks photos from their camera roll; guess whose photo it is, fast. One phone each: join by scanning a QR code, phones connect peer to peer, no server. |

## Deploy to GitHub Pages

1. Push this repo to GitHub (branch `main`).
2. In the repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Every push to `main` runs `.github/workflows/pages.yml` and publishes `site/`.

See [AGENTS.md](AGENTS.md) for the layout, conventions and how to add a game.
