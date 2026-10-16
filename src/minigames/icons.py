"""Draw the app icon (a stopwatch face) as PNGs using only the standard library."""

import math
import struct
import zlib
from pathlib import Path

INK = (29, 36, 32)        # --face
PAPER = (244, 246, 242)   # --face-fg
RED = (214, 54, 31)       # --accent


def _png(path: Path, size: int, pixels: list[bytes]) -> None:
    raw = b"".join(b"\x00" + row for row in pixels)

    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    path.write_bytes(
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


def _color(x: float, y: float, safe: float) -> tuple[int, int, int]:
    """Colour at a point in unit space (-1..1). `safe` shrinks the art for maskable icons."""
    x, y = x / safe, y / safe
    r = math.hypot(x, y)
    # crown button on top of the stopwatch
    if abs(x) < 0.12 and -0.98 < y < -0.78:
        return PAPER
    if r < 0.74:
        # hand pointing to "one second past twelve"
        ang = math.radians(-60)
        hx, hy = math.sin(ang), -math.cos(ang)
        t = x * hx + y * hy
        d = abs(x * hy - y * hx)
        if (0 <= t <= 0.58 and d < 0.06) or r < 0.1:
            return RED
        # tick at twelve
        if abs(x) < 0.045 and -0.66 < y < -0.5:
            return PAPER
        return INK
    if r < 0.86:
        return PAPER
    return INK


def draw(path: Path, size: int, maskable: bool = False, ss: int = 4) -> None:
    safe = 0.78 if maskable else 1.0
    rows = []
    for py in range(size):
        row = bytearray()
        for px in range(size):
            acc = [0, 0, 0]
            for sy in range(ss):
                for sx in range(ss):
                    x = ((px + (sx + 0.5) / ss) / size) * 2 - 1
                    y = ((py + (sy + 0.5) / ss) / size) * 2 - 1
                    c = _color(x * 1.08, y * 1.08 + 0.04, safe)
                    for i in range(3):
                        acc[i] += c[i]
            row += bytes(v // (ss * ss) for v in acc)
        rows.append(bytes(row))
    _png(path, size, rows)


def build_icons(out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    draw(out / "icon-192.png", 192)
    draw(out / "icon-512.png", 512, ss=2)
    draw(out / "icon-maskable-512.png", 512, maskable=True, ss=2)
    draw(out / "apple-touch-icon.png", 180)
    print(f"Wrote icons to {out}")
