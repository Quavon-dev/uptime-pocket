#!/usr/bin/env python3
"""
Validate the Android adaptive icon assets.

Android adaptive icons have specific requirements:
  - Foreground MUST be 1024x1024 RGBA, with a transparent margin
    so the launcher mask (circle, squircle, teardrop, etc.) doesn't
    clip the icon's content. The safe zone is the center 66%.
  - Background MUST be 1024x1024, either a solid color (we use the
    brand color) or a full-bleed image.
  - Monochrome (Android 13+ themed icons) MUST be 1024x1024 with
    the foreground shape encoded ONLY in the alpha channel.

This script is a pre-prebuild check. It exits non-zero on any
violation, with a human-readable message.

Usage:
  python3 scripts/validate-android-icon.py
"""

import os
import struct
import sys
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets" / "images"

FOREGROUND = ASSETS / "android-icon-foreground.png"
BACKGROUND = ASSETS / "android-icon-background.png"
MONOCHROME = ASSETS / "android-icon-monochrome.png"

REQUIRED_SIZE = 1024
# The safe zone for adaptive icons: 66% of 1024 = ~676, centered.
# Padding from each edge so the icon's content never enters the
# masked region (which can be as much as 17% in from the edge for
# a teardrop mask).
SAFE_PADDING_PX = 102


def fail(msg: str) -> None:
    print(f"  ✗ {msg}")
    sys.exit(1)


def ok(msg: str) -> None:
    print(f"  ✓ {msg}")


def read_png_chunks(path: Path):
    """Read PNG chunks. Returns a dict of chunk type -> list of chunk data."""
    data = path.read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        fail(f"{path.name} is not a valid PNG file")
    i = 8
    chunks: dict[str, list[bytes]] = {}
    while i < len(data):
        length = struct.unpack(">I", data[i : i + 4])[0]
        ctype = data[i + 4 : i + 8].decode("ascii")
        cdata = data[i + 8 : i + 8 + length]
        chunks.setdefault(ctype, []).append(cdata)
        i += 8 + length + 4
    return chunks


def get_ihdr(chunks):
    ihdr = chunks["IHDR"][0]
    width, height = struct.unpack(">II", ihdr[:8])
    bit_depth, color_type = ihdr[8], ihdr[9]
    return width, height, bit_depth, color_type


def decode_rgba_pixels(path: Path):
    """Decode a PNG and return its raw RGBA pixel bytes."""
    chunks = read_png_chunks(path)
    width, height, bit_depth, color_type = get_ihdr(chunks)
    if bit_depth != 8:
        fail(f"{path.name}: bit depth must be 8, got {bit_depth}")
    if color_type not in (2, 6):  # RGB or RGBA
        fail(f"{path.name}: color type must be RGB(2) or RGBA(6), got {color_type}")

    idat = b"".join(chunks.get("IDAT", []))
    raw = zlib.decompress(idat)

    # Bytes per pixel
    bpp = 3 if color_type == 2 else 4
    stride = width * bpp

    # PNG filtering: each row is prefixed with a filter byte.
    out = bytearray()
    prev_row = bytearray(stride)
    pos = 0
    for y in range(height):
        filt = raw[pos]
        pos += 1
        row = bytearray(raw[pos : pos + stride])
        pos += stride
        if filt == 0:
            pass  # None
        elif filt == 1:  # Sub
            for x in range(bpp, stride):
                row[x] = (row[x] + row[x - bpp]) & 0xFF
        elif filt == 2:  # Up
            for x in range(stride):
                row[x] = (row[x] + prev_row[x]) & 0xFF
        elif filt == 3:  # Average
            for x in range(stride):
                left = row[x - bpp] if x >= bpp else 0
                up = prev_row[x]
                row[x] = (row[x] + ((left + up) // 2)) & 0xFF
        elif filt == 4:  # Paeth
            for x in range(stride):
                a = row[x - bpp] if x >= bpp else 0
                b = prev_row[x]
                c = prev_row[x - bpp] if x >= bpp else 0
                p = a + b - c
                pa = abs(p - a)
                pb = abs(p - b)
                pc = abs(p - c)
                if pa <= pb and pa <= pc:
                    pr = a
                elif pb <= pc:
                    pr = b
                else:
                    pr = c
                row[x] = (row[x] + pr) & 0xFF
        else:
            fail(f"{path.name}: unknown PNG filter {filt}")
        out.extend(row)
        prev_row = row
    return width, height, bytes(out), bpp


def check_dimensions(path: Path) -> tuple[int, int]:
    chunks = read_png_chunks(path)
    w, h, bd, ct = get_ihdr(chunks)
    if (w, h) != (REQUIRED_SIZE, REQUIRED_SIZE):
        fail(f"{path.name}: must be {REQUIRED_SIZE}x{REQUIRED_SIZE}, got {w}x{h}")
    if bd != 8:
        fail(f"{path.name}: bit depth must be 8, got {bd}")
    if ct not in (2, 6):
        fail(f"{path.name}: must be RGB(2) or RGBA(6), got color type {ct}")
    return w, h


def check_foreground_has_safe_zone() -> None:
    """Foreground should have transparent pixels in the corners (safe zone).

    We check the 4 corners of a 1024x1024 canvas. If they're all
    opaque, the icon will be clipped on circle / squircle / teardrop
    launchers.
    """
    w, h, pixels, bpp = decode_rgba_pixels(FOREGROUND)
    if bpp != 4:
        fail(f"{FOREGROUND.name}: must be RGBA for transparency")

    # Sample 4 corner regions (16x16 each) and 4 edge-center regions
    samples = [
        ("top-left corner", 0, 0, 16, 16),
        ("top-right corner", w - 16, 0, w, 16),
        ("bottom-left corner", 0, h - 16, 16, h),
        ("bottom-right corner", w - 16, h - 16, w, h),
        ("top edge center", w // 2 - 8, 0, w // 2 + 8, 16),
        ("bottom edge center", w // 2 - 8, h - 16, w // 2 + 8, h),
        ("left edge center", 0, h // 2 - 8, 16, h // 2 + 8),
        ("right edge center", w - 16, h // 2 - 8, w, h // 2 + 8),
    ]
    for name, x0, y0, x1, y1 in samples:
        opaque = 0
        total = 0
        for y in range(y0, y1):
            for x in range(x0, x1):
                idx = (y * w + x) * 4
                a = pixels[idx + 3]
                total += 1
                if a > 200:
                    opaque += 1
        if opaque / total > 0.5:
            fail(
                f"{FOREGROUND.name}: {name} has too many opaque pixels "
                f"({opaque}/{total}). Adaptive icons need transparent "
                f"margins so the launcher mask doesn't clip the icon."
            )
    ok(f"{FOREGROUND.name}: safe-zone respected in corners and edges")


def check_monochrome_is_alpha_only() -> None:
    """Monochrome icon: the RGB channels should be ~0 (or all the same),
    because Android's themed-icon system uses only the alpha channel.

    We sample 50 random pixels and assert they're all the same RGB
    color (white #FFFFFF is the canonical choice; the actual color
    doesn't matter as long as the alpha carries the shape).
    """
    import random
    random.seed(0)
    w, h, pixels, bpp = decode_rgba_pixels(MONOCHROME)
    if bpp != 4:
        fail(f"{MONOCHROME.name}: must be RGBA for themed icons")

    samples = [random.randint(0, w * h - 1) for _ in range(50)]
    rgb_colors = set()
    for s in samples:
        idx = s * 4
        r, g, b = pixels[idx], pixels[idx + 1], pixels[idx + 2]
        # Allow tiny diffs from PNG quantization
        if max(r, g, b) - min(r, g, b) > 2:
            fail(
                f"{MONOCHROME.name}: pixel {s} has different RGB values "
                f"({r},{g},{b}). Themed icons encode the shape in the "
                f"alpha channel only — RGB must be a single color."
            )
        rgb_colors.add((r, g, b))
    if len(rgb_colors) > 1:
        fail(
            f"{MONOCHROME.name}: found {len(rgb_colors)} different RGB "
            f"colors across samples. Expected a single color."
        )
    ok(f"{MONOCHROME.name}: shape is in alpha channel only (RGB={rgb_colors.pop()})")


def main() -> int:
    print("Validating Android adaptive icon assets…")

    for path in (FOREGROUND, BACKGROUND, MONOCHROME):
        if not path.exists():
            fail(f"missing: {path.relative_to(ROOT)}")
        check_dimensions(path)
        ok(f"{path.name}: 1024x1024, correct color type")

    check_foreground_has_safe_zone()
    check_monochrome_is_alpha_only()
    print("\nAll checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
