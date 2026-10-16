"""Build and preview the static minigames site.

  minigames build   write site/games.json from every site/games/<slug>/game.json
  minigames serve   build, then serve site/ locally (default http://127.0.0.1:8765/)
  minigames icons   redraw the PWA icons in site/icons/

The site itself is plain static files, deployed to GitHub Pages by
.github/workflows/pages.yml.
"""

import argparse
import errno
import functools
import http.server
import json
import webbrowser
from pathlib import Path

SITE = Path(__file__).resolve().parents[2] / "site"
GAMES = SITE / "games"


def build(site: Path = SITE) -> list[dict]:
    games = []
    for meta_file in sorted((site / "games").glob("*/game.json")):
        meta = json.loads(meta_file.read_text(encoding="utf-8"))
        slug = meta_file.parent.name
        if not (meta_file.parent / "index.html").is_file():
            raise SystemExit(f"{slug}: game.json found but index.html is missing")
        games.append({"slug": slug, "url": f"games/{slug}/", **meta})
    games.sort(key=lambda g: (g.get("order", 999), g["title"]))
    out = site / "games.json"
    out.write_text(json.dumps(games, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {out.relative_to(site.parent)} with {len(games)} game(s)")
    return games


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def serve(host: str, port: int, open_browser: bool) -> None:
    build()
    handler = functools.partial(NoCacheHandler, directory=str(SITE))
    # If the port is taken (e.g. another preview is still running), try the next few.
    for candidate in range(port, port + 20):
        try:
            httpd = http.server.ThreadingHTTPServer((host, candidate), handler)
            break
        except OSError as e:
            if e.errno != errno.EADDRINUSE:
                raise
            print(f"Port {candidate} is in use, trying {candidate + 1}…")
    else:
        raise SystemExit(f"No free port between {port} and {port + 19}. Pass --port to pick another.")
    port = candidate
    with httpd:
        url = f"http://127.0.0.1:{port}/"
        print(f"Minigames running at {url}  (Ctrl+C to stop)")
        if open_browser:
            webbrowser.open(url)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.")


def main() -> None:
    parser = argparse.ArgumentParser(prog="minigames", description="Build and preview the minigames site.")
    sub = parser.add_subparsers(dest="cmd")
    sub.add_parser("build", help="write site/games.json")
    sub.add_parser("icons", help="redraw the PWA icons in site/icons/")
    s = sub.add_parser("serve", help="build and serve site/ locally (default)")
    for p in (parser, s):
        p.add_argument("--host", default="127.0.0.1", help="0.0.0.0 to reach it from phones on your network")
        p.add_argument("--port", type=int, default=8765)
        p.add_argument("--no-browser", action="store_true", help="don't open a browser tab")
    args = parser.parse_args()
    if args.cmd == "build":
        build()
    elif args.cmd == "icons":
        from minigames.icons import build_icons
        build_icons(SITE / "icons")
    else:
        serve(args.host, args.port, not args.no_browser)


if __name__ == "__main__":
    main()
