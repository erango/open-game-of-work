#!/usr/bin/env python3
"""Turn raw generator output into finished game assets.

Adapted from the pipeline in dungeon-vengeance. The differences that matter here:

  * Every slot has its OWN size. The game's targets run from 16px portraits to 150px rank
    illustrations, so the size comes from the job rather than from one env var.
  * Transparency is per job. Board tiles are drawn edge to edge and keep their background;
    anything drawn OVER something else (tokens, party sprites, the icon) is cut out.
  * A job may emit extra sizes. The 16px stats-panel portrait is a downscale of the 32px
    avatar rather than a separate generation, so the two always match.
  * Landscape jobs keep their aspect ratio instead of being squared.
  * At the end it rewrites manifest.txt for the generated set, which is what the game reads
    to discover it. Output is graphics-gen/, kept apart from any extracted originals.

Install once:
    python3 -m venv .cache/venv
    .cache/venv/bin/python -m pip install rembg pillow onnxruntime

Run:
    npm run art:cutout              # everything pending
    npm run art:cutout -- board     # only this kind, or an id substring
    FORCE=1 npm run art:cutout      # redo outputs that already exist

REMBG_MODEL defaults to birefnet-general, which keeps thin detail far better than u2net and
downloads ~1GB on first use. Lighter: birefnet-general-lite, isnet-general-use, u2net.
ALPHA_MATTING=1 softens edges.
"""
import io
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GRAPHICS = os.path.join(ROOT, "public", "assets", "graphics-gen")
FORCE = os.environ.get("FORCE") == "1"
MODEL = os.environ.get("REMBG_MODEL", "birefnet-general")
# Write above the CSS size. Every slot is sized by layout (`width: 100%`), so the intrinsic
# resolution is free detail: the board is transform-scaled and routinely lands at 1.4-2.6x, and
# writing a 140px tile from a 768px generation threw away everything above 1x and then upscaled
# it. Clamped per image so nothing is enlarged past what was generated.
SCALE = max(1, int(os.environ.get("ART_SCALE", "3")))
ALPHA_MATTING = os.environ.get("ALPHA_MATTING") == "1"
FILTER = sys.argv[1:]

try:
    from PIL import Image
except ImportError:
    sys.exit("Missing Pillow. Run: pip install rembg pillow onnxruntime")

_session = None


def rembg_remove(data: bytes) -> bytes:
    global _session
    if _session is None:
        try:
            from rembg import new_session, remove
        except ImportError:
            sys.exit("Missing rembg. Run: pip install rembg pillow onnxruntime")
        print(f"(rembg model: {MODEL}{' +alpha-matting' if ALPHA_MATTING else ''}; first run downloads it)")
        _session = (remove, new_session(MODEL))
    remove, sess = _session
    kw = dict(session=sess, post_process_mask=True)
    if ALPHA_MATTING:
        kw.update(
            alpha_matting=True,
            alpha_matting_foreground_threshold=240,
            alpha_matting_background_threshold=15,
            alpha_matting_erode_size=3,
        )
    return remove(data, **kw)


def square_pad(img: "Image.Image", transparent: bool) -> "Image.Image":
    """Trim to content, then pad to a centred square so nothing is cropped off."""
    if transparent:
        bbox = img.getbbox()
        if bbox:
            img = img.crop(bbox)
    w, h = img.size
    side = max(w, h)
    canvas = Image.new("RGBA" if transparent else "RGB", (side, side), (0, 0, 0, 0) if transparent else (255, 255, 255))
    canvas.paste(img, ((side - w) // 2, (side - h) // 2), img if transparent else None)
    return canvas


def center_crop_square(img: "Image.Image") -> "Image.Image":
    w, h = img.size
    side = min(w, h)
    left, top = (w - side) // 2, (h - side) // 2
    return img.crop((left, top, left + side, top + side))


def write_variant(img: "Image.Image", out: str, size: int, shape: str) -> None:
    """Write one output. `size` is the slot's long edge; SCALE is headroom, never upscaling."""
    os.makedirs(os.path.dirname(out), exist_ok=True)
    w, h = img.size
    if shape == "landscape":
        target = max(size, min(size * SCALE, w))
        img = img.resize((target, max(1, round(h * target / w))), Image.LANCZOS)
    elif shape == "portrait":
        target = max(size, min(size * SCALE, h))
        img = img.resize((max(1, round(w * target / h)), target), Image.LANCZOS)
    else:
        target = max(size, min(size * SCALE, min(w, h)))
        img = img.resize((target, target), Image.LANCZOS)
    img.save(out)


manifest = json.load(open(os.path.join(ROOT, "scripts", "art-manifest.json")))
done = skip = fail = missing = drawn = 0

for job in manifest:
    if FILTER and not any(f in job["id"] or f == job["kind"] for f in FILTER):
        continue
    if job.get("drawn"):
        # The die faces are drawn by scripts/die-faces.py. Never overwrite them from a raw,
        # not even under FORCE: a generated die has the wrong number of pips.
        drawn += 1
        continue
    raw = os.path.join(ROOT, job["raw"])
    out = os.path.join(ROOT, job["out"])
    if not os.path.exists(raw):
        missing += 1
        continue
    if os.path.exists(out) and not FORCE:
        skip += 1
        continue
    shape = job.get("shape", "square")
    keeps_aspect = shape in ("landscape", "portrait")
    try:
        if job.get("cutout"):
            cut = rembg_remove(open(raw, "rb").read())
            img = Image.open(io.BytesIO(cut)).convert("RGBA")
            if keeps_aspect:
                # Trim to the subject but keep its proportions: padding a tower to a square
                # would strand it in empty space.
                bbox = img.getbbox()
                if bbox:
                    img = img.crop(bbox)
            else:
                img = square_pad(img, transparent=True)
        else:
            img = Image.open(raw).convert("RGB")
            if not keeps_aspect:
                img = center_crop_square(img)

        write_variant(img, out, job["size"], shape)
        # Extra sizes derived from the same image, so variants can never drift apart.
        for extra in job.get("also", []):
            write_variant(img, os.path.join(ROOT, extra["out"]), extra["size"], shape)

        print(f"ok   {job['id']} -> {job['out']} ({job['size']}px slot, {SCALE}x source)")
        done += 1
    except Exception as exc:  # noqa: BLE001 - report and continue
        print(f"FAIL {job['id']}: {exc}")
        fail += 1

# The loader discovers the set from this file, so rewrite it from whatever is actually on
# disk. Anything extracted from the original that is already present stays listed.
if os.path.isdir(GRAPHICS):
    found = []
    for base, _dirs, files in os.walk(GRAPHICS):
        for f in files:
            if f.lower().endswith(".png"):
                found.append(os.path.relpath(os.path.join(base, f), GRAPHICS))
    found.sort()
    with open(os.path.join(GRAPHICS, "manifest.txt"), "w") as fh:
        fh.write("\n".join(found) + "\n")
    print(f"\nmanifest.txt rewritten: {len(found)} images")

print(
    f"done: {done} written, {skip} already done, {missing} awaiting generation, "
    f"{fail} failed, {drawn} drawn by hand (npm run art:dice)."
)
