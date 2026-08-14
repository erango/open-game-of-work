#!/usr/bin/env python3
"""Draw the six die faces instead of generating them.

An image model will not give you an exact pip count. Asked for three pips it returns a
plausible die — in perspective, with pips on every visible face — and at 81px the count is the
only thing about a die face that carries information. So these are drawn.

The frames are an image list indexed by the roll: file `0` is one pip, file `5` is six, the
same order the original used (verified there by pip-pixel ratio, 279:558:837:1116:1395:1674).

    npm run art:dice                 # neon, matching ART_STYLE's default
    ART_STYLE=flat npm run art:dice  # red face, white pips
    DIE_SIZE=162 npm run art:dice    # larger, if the board is scaled up a long way

Written straight into the generated set, so `art:cutout` leaves them alone once they exist.
"""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "assets", "graphics-gen", "forms", "TMAINFORM", "dieImageList")
SIZE = int(os.environ.get("DIE_SIZE", "81"))
STYLE = "flat" if os.environ.get("ART_STYLE") == "flat" else "neon"
SS = 8  # supersample factor; the whole thing is drawn large and reduced once

try:
    from PIL import Image, ImageDraw, ImageFilter
except ImportError:
    sys.exit("Missing Pillow. Run: .cache/venv/bin/python -m pip install pillow")

# (face, edge, pip, glow) — glow None means no bloom pass.
PALETTES = {
    # Matches the reskin: near-black face, magenta pips with a soft bloom.
    "neon": ((14, 12, 20), (86, 40, 96), (255, 43, 214), (255, 43, 214)),
    "flat": ((214, 58, 47), (150, 34, 26), (250, 248, 244), None),
}

# 3x3 grid slots, same arrangement the vector die in src/ui.ts uses.
PIPS = {
    1: [4],
    2: [0, 8],
    3: [0, 4, 8],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8],
}


def face(n: int) -> "Image.Image":
    face_col, edge_col, pip_col, glow_col = PALETTES[STYLE]
    s = SIZE * SS
    img = Image.new("RGB", (s, s), face_col)
    d = ImageDraw.Draw(img)

    radius = int(s * 0.16)
    inset = int(s * 0.02)
    d.rounded_rectangle([inset, inset, s - inset, s - inset], radius=radius, fill=face_col,
                        outline=edge_col, width=max(1, int(s * 0.02)))

    # Pip centres on a 3x3 grid inset far enough that six pips still have air between them.
    margin = s * 0.26
    step = (s - 2 * margin) / 2
    r = s * 0.075
    centres = [(margin + (i % 3) * step, margin + (i // 3) * step) for i in range(9)]
    boxes = [[cx - r, cy - r, cx + r, cy + r] for i, (cx, cy) in enumerate(centres) if i in PIPS[n]]

    if glow_col:
        # Bloom underneath, so the pips read as emissive rather than as flat dots.
        glow = Image.new("RGB", (s, s), face_col)
        gd = ImageDraw.Draw(glow)
        for b in boxes:
            pad = r * 1.1
            gd.ellipse([b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad], fill=glow_col)
        glow = glow.filter(ImageFilter.GaussianBlur(r * 0.9))
        img = Image.blend(img, glow, 0.55)
        d = ImageDraw.Draw(img)
        # The rounded corners have to be restored: the blur bled over them.
        mask = Image.new("L", (s, s), 0)
        ImageDraw.Draw(mask).rounded_rectangle([inset, inset, s - inset, s - inset], radius=radius, fill=255)
        flat = Image.new("RGB", (s, s), face_col)
        flat.paste(img, mask=mask)
        img = flat
        d = ImageDraw.Draw(img)
        d.rounded_rectangle([inset, inset, s - inset, s - inset], radius=radius, outline=edge_col,
                            width=max(1, int(s * 0.02)))

    for b in boxes:
        d.ellipse(b, fill=pip_col)

    return img.resize((SIZE, SIZE), Image.LANCZOS)


os.makedirs(OUT, exist_ok=True)
for n in range(1, 7):
    path = os.path.join(OUT, f"{n - 1}.png")
    face(n).save(path)
    print(f"ok   {n} pip{'' if n == 1 else 's'} -> {os.path.relpath(path, ROOT)} ({SIZE}px)")

print(f"\nsix faces drawn ({STYLE}, {SIZE}px). Run `npm run art:cutout` to refresh manifest.txt.")
