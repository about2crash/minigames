"""Build and preview the static minigames site.

  minigames build   write site/games.json from every site/games/<slug>/game.json
  minigames serve   build, then serve site/ locally (default http://127.0.0.1:8765/)
  minigames icons   redraw the PWA icons in site/icons/
  minigames test    run the Python checks (tests/) and the JavaScript tests (tests/js/, needs Node 20+)

The site itself is plain static files, deployed to GitHub Pages by
.github/workflows/pages.yml.
"""

import argparse
import errno
import functools
import http.server
import json
import shutil
import subprocess
import sys
import unittest
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SITE = ROOT / "site"
GAMES = SITE / "games"


def build(site: Path = SITE) -> list[dict]:
    games = []
    for meta_file in sorted((site / "games").glob("*/game.json")):
        meta = json.loads(meta_file.read_text(encoding="utf-8"))
        slug = meta_file.parent.name
        if not (meta_file.parent / "index.html").is_file():
            raise SystemExit(f"{slug}: game.json found but index.html is missing")
        game = {"slug": slug, "url": f"games/{slug}/", **meta}
        # extra files (e.g. logic.js) so the service worker can precache them for offline play
        extra = sorted(p.name for p in meta_file.parent.iterdir() if p.is_file() and p.name not in ("index.html", "game.json"))
        if extra:
            game["files"] = extra
        games.append(game)
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


def test() -> int:
    tests = ROOT / "tests"
    print("Python checks", flush=True)
    result = unittest.TextTestRunner(verbosity=1).run(unittest.defaultTestLoader.discover(str(tests)))
    ok = result.wasSuccessful()
    node = shutil.which("node")
    js = sorted(str(p) for p in (tests / "js").glob("*.test.mjs"))
    if not node:
        print("node not found: skipping the JavaScript tests (install Node 20+)")
        return 0 if ok else 1
    print("\nJavaScript tests", flush=True)
    ok = subprocess.run([node, "--test", *js], cwd=ROOT).returncode == 0 and ok
    return 0 if ok else 1


def main() -> None:
    parser = argparse.ArgumentParser(prog="minigames", description="Build and preview the minigames site.")
    sub = parser.add_subparsers(dest="cmd")
    sub.add_parser("build", help="write site/games.json")
    sub.add_parser("icons", help="redraw the PWA icons in site/icons/")
    sub.add_parser("test", help="run the Python and JavaScript tests")
    s = sub.add_parser("serve", help="build and serve site/ locally (default)")
    for p in (parser, s):
        p.add_argument("--host", default="127.0.0.1", help="0.0.0.0 to reach it from phones on your network")
        p.add_argument("--port", type=int, default=8765)
        p.add_argument("--no-browser", action="store_true", help="don't open a browser tab")
    args = parser.parse_args()
    if args.cmd == "build":
        build()
    elif args.cmd == "test":
        sys.exit(test())
    elif args.cmd == "icons":
        from minigames.icons import build_icons
        build_icons(SITE / "icons")
    else:
        serve(args.host, args.port, not args.no_browser)


if __name__ == "__main__":
    main()
