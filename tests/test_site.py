"""Site-wide rules from AGENTS.md, checked on every page, plus the games.json build."""

import json
import re
import shutil
import tempfile
import unittest
from pathlib import Path

from minigames.cli import SITE, build

PAGES = [SITE / "index.html", *sorted(SITE.glob("games/*/index.html"))]


def style_blocks(html: str) -> str:
    return "\n".join(re.findall(r"<style>(.*?)</style>", html, re.S))


class PageRules(unittest.TestCase):
    def test_every_page_has_the_shared_head(self):
        for page in PAGES:
            html = page.read_text(encoding="utf-8")
            root = "" if page.parent == SITE else "../../"
            with self.subTest(page=page.relative_to(SITE)):
                self.assertIn(f'<link rel="stylesheet" href="{root}shared/theme.css">', html)
                self.assertIn(f'<link rel="manifest" href="{root}manifest.webmanifest">', html)
                self.assertIn(f'<script src="{root}shared/pwa.js" data-root="{root or "./"}"></script>', html)
                self.assertIn('name="viewport"', html)

    def test_only_relative_paths(self):
        for page in PAGES:
            html = page.read_text(encoding="utf-8")
            with self.subTest(page=page.relative_to(SITE)):
                self.assertEqual(re.findall(r'(?:href|src)="/(?!/)[^"]*"', html), [])
                self.assertEqual(re.findall(r"""(?:fetch\(|from )["']/(?!/)""", html), [])

    def test_no_hard_coded_colors_in_page_styles(self):
        # colors come from shared/brand.css tokens so a rebrand is one file
        for page in PAGES:
            css = style_blocks(page.read_text(encoding="utf-8"))
            with self.subTest(page=page.relative_to(SITE)):
                self.assertEqual(re.findall(r"#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(", css), [])

    def test_games_link_back_to_the_hub(self):
        for page in PAGES[1:]:
            with self.subTest(page=page.relative_to(SITE)):
                self.assertIn('<a class="back" href="../../">', page.read_text(encoding="utf-8"))

    def test_module_imports_resolve(self):
        scripts = [*PAGES, *SITE.glob("games/*/*.js"), *SITE.glob("shared/*.js")]
        for f in scripts:
            for spec in re.findall(r"""^import .* from ["'](\.[^"']+)["'];""", f.read_text(encoding="utf-8"), re.M):
                with self.subTest(file=f.relative_to(SITE), spec=spec):
                    self.assertTrue((f.parent / spec).resolve().is_file())
        for page in PAGES:
            for src in re.findall(r'<script[^>]* src="([^"]+)"', page.read_text(encoding="utf-8")):
                with self.subTest(page=page.relative_to(SITE), src=src):
                    self.assertTrue((page.parent / src).resolve().is_file())

    def test_pages_with_a_csp_have_no_inline_scripts_or_handlers(self):
        # multiplayer pages show data from other players: a strict CSP blocks injected scripts
        for page in PAGES:
            html = page.read_text(encoding="utf-8")
            if "Content-Security-Policy" not in html:
                continue
            with self.subTest(page=page.relative_to(SITE)):
                self.assertIn("script-src 'self'", html)
                self.assertNotIn("'unsafe-inline' https://fonts.googleapis.com; script", html)
                self.assertEqual(re.findall(r"<script(?![^>]*\bsrc=)[^>]*>", html), [])
                self.assertEqual(re.findall(r"\son[a-z]+=", html), [])

    def test_multiplayer_pages_have_a_csp(self):
        for page in PAGES[1:]:
            html = page.read_text(encoding="utf-8")
            if "shared/mesh.js" in html or any("shared/mesh.js" in f.read_text(encoding="utf-8") for f in page.parent.glob("*.js")):
                with self.subTest(page=page.relative_to(SITE)):
                    self.assertIn("Content-Security-Policy", html)

    def test_brand_tokens_only_in_brand_css(self):
        theme = (SITE / "shared" / "theme.css").read_text(encoding="utf-8")
        self.assertEqual(re.findall(r"#[0-9a-fA-F]{3,8}\b|\brgba?\(", theme), [])


class ServiceWorker(unittest.TestCase):
    def test_core_files_exist(self):
        sw = (SITE / "sw.js").read_text(encoding="utf-8")
        core = re.search(r"const CORE = \[(.*?)\];", sw, re.S).group(1)
        for path in re.findall(r'"([^"]+)"', core):
            with self.subTest(path=path):
                self.assertTrue((SITE / path).exists() or path == "./")

    def test_shared_scripts_are_precached(self):
        sw = (SITE / "sw.js").read_text(encoding="utf-8")
        for f in sorted((SITE / "shared").iterdir()):
            with self.subTest(file=f.name):
                self.assertIn(f'"shared/{f.name}"', sw)


class Build(unittest.TestCase):
    def test_games_json(self):
        with tempfile.TemporaryDirectory() as tmp:
            site = Path(tmp) / "site"
            shutil.copytree(SITE, site)
            games = build(site)
            on_disk = json.loads((site / "games.json").read_text(encoding="utf-8"))
        self.assertEqual(games, on_disk)
        slugs = {g["slug"] for g in games}
        self.assertEqual(slugs, {p.name for p in (SITE / "games").iterdir() if (p / "game.json").is_file()})
        for g in games:
            with self.subTest(game=g["slug"]):
                for key in ("title", "tagline", "players"):
                    self.assertTrue(g.get(key))
                self.assertEqual(g["url"], f"games/{g['slug']}/")
                for f in g.get("files", []):
                    self.assertTrue((SITE / g["url"] / f).is_file())

    def test_committed_games_json_is_current(self):
        with tempfile.TemporaryDirectory() as tmp:
            site = Path(tmp) / "site"
            shutil.copytree(SITE, site)
            build(site)
            fresh = (site / "games.json").read_text(encoding="utf-8")
        self.assertEqual(fresh, (SITE / "games.json").read_text(encoding="utf-8"), "run `uv run minigames build`")


if __name__ == "__main__":
    unittest.main()
