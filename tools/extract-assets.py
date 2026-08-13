#!/usr/bin/env python3
"""
Extract image assets from the original Game of Work executable.

The original is a Borland Delphi 5 binary. Its images live in two places:

  1. PE resources of type BITMAP and CURSOR. These are stored without the 14-byte
     BITMAPFILEHEADER that a .bmp file needs, so it has to be reconstructed.
  2. TPicture blobs inside the DFM form resources. This is where the large board faces
     live, which is why TMAINFORM is ~400KB and TOFFICEPARTYFORM ~600KB. Each blob is a
     Pascal short string naming the class ("TBitmap"), a 4-byte length, then the raw BMP.

This tool is original code and is safe to distribute. Its OUTPUT is not: those images are
the original's copyrighted artwork. Write them somewhere gitignored (the default target,
public/assets/graphics/, is ignored by this repo) and do not commit or redistribute them.

Usage:
    python3 tools/extract-assets.py /path/to/gamework.exe [outdir]

Default outdir is public/assets/graphics/
"""

from __future__ import annotations

import os
import re
import struct
import sys

RES_TYPES = {1: "CURSOR", 2: "BITMAP", 3: "ICON", 4: "MENU", 5: "DIALOG",
             6: "STRING", 10: "RCDATA", 12: "GROUP_CURSOR", 14: "GROUP_ICON", 16: "VERSION"}


# --------------------------------------------------------------------------- PE parsing

class PE:
    def __init__(self, path: str) -> None:
        self.d = open(path, "rb").read()
        d = self.d
        pe = struct.unpack_from("<I", d, 0x3C)[0]
        if d[pe:pe + 4] != b"PE\0\0":
            raise SystemExit(f"{path}: not a PE executable")
        nsec = struct.unpack_from("<H", d, pe + 6)[0]
        opt_size = struct.unpack_from("<H", d, pe + 20)[0]
        table = pe + 24 + opt_size
        self.sections = []
        for i in range(nsec):
            name, vsize, vaddr, rawsize, rawptr = struct.unpack_from("<8sIIII", d, table + i * 40)
            self.sections.append((name.rstrip(b"\0").decode(), vaddr, vsize, rawptr, rawsize))

    def offset(self, rva: int) -> int:
        for _name, vaddr, vsize, rawptr, rawsize in self.sections:
            if vaddr <= rva < vaddr + max(vsize, rawsize):
                return rva - vaddr + rawptr
        raise KeyError(hex(rva))

    def resources(self):
        """Yields (path_parts, data_bytes) for every resource leaf."""
        base = next(rawptr for n, _va, _vs, rawptr, _rs in self.sections if n == ".rsrc")
        d = self.d
        out = []

        def name_at(off: int) -> str:
            n = struct.unpack_from("<H", d, off)[0]
            return d[off + 2:off + 2 + n * 2].decode("utf-16-le", "replace")

        def walk(off: int, depth: int, path: list[str]) -> None:
            named, ided = struct.unpack_from("<HH", d, off + 12)
            for i in range(named + ided):
                nid, sub = struct.unpack_from("<II", d, off + 16 + i * 8)
                if nid & 0x80000000:
                    key = name_at(base + (nid & 0x7FFFFFFF))
                elif depth == 0:
                    key = RES_TYPES.get(nid, str(nid))
                else:
                    key = str(nid)
                if sub & 0x80000000:
                    walk(base + (sub & 0x7FFFFFFF), depth + 1, path + [key])
                else:
                    rva, size = struct.unpack_from("<II", d, base + sub)
                    out.append((path + [key], self.d[self.offset(rva):self.offset(rva) + size]))

        walk(base, 0, [])
        return out


# --------------------------------------------------------------------------- BMP rebuild

def dib_to_bmp(dib: bytes) -> bytes | None:
    """Prepends a BITMAPFILEHEADER to a resource DIB so it becomes a valid .bmp."""
    if len(dib) < 40:
        return None
    header_size = struct.unpack_from("<I", dib, 0)[0]
    if header_size != 40:  # only BITMAPINFOHEADER appears in this binary
        return None
    bpp = struct.unpack_from("<H", dib, 14)[0]
    clr_used = struct.unpack_from("<I", dib, 32)[0]
    if bpp <= 8:
        palette = (clr_used or (1 << bpp)) * 4
    else:
        palette = 0
    pixel_offset = 14 + header_size + palette
    return b"BM" + struct.pack("<IHHI", 14 + len(dib), 0, 0, pixel_offset) + dib


# --------------------------------------------------------------------------- BMP -> PNG

def decode_bmp(bmp: bytes):
    """Decodes a .bmp into (width, height, rows) where each row is a bytes of RGB triples."""
    if bmp[:2] != b"BM":
        return None
    pixel_offset = struct.unpack_from("<I", bmp, 10)[0]
    header_size, width, height, _planes, bpp = struct.unpack_from("<IiiHH", bmp, 14)
    compression = struct.unpack_from("<I", bmp, 30)[0]
    if compression != 0 or header_size < 40:
        return None
    top_down = height < 0
    height = abs(height)

    palette = []
    if bpp <= 8:
        clr_used = struct.unpack_from("<I", bmp, 46)[0] or (1 << bpp)
        base = 14 + header_size
        for i in range(clr_used):
            b, g, r, _a = bmp[base + i * 4: base + i * 4 + 4]
            palette.append((r, g, b))

    row_bytes = ((bpp * width + 31) // 32) * 4
    rows = []
    for y in range(height):
        src = y if top_down else height - 1 - y
        start = pixel_offset + src * row_bytes
        raw = bmp[start:start + row_bytes]
        if len(raw) < row_bytes:
            return None
        out = bytearray()
        if bpp == 24 or bpp == 32:
            step = bpp // 8
            for x in range(width):
                b, g, r = raw[x * step], raw[x * step + 1], raw[x * step + 2]
                out += bytes((r, g, b))
        elif bpp == 8:
            for x in range(width):
                out += bytes(palette[raw[x]] if raw[x] < len(palette) else (0, 0, 0))
        elif bpp == 4:
            for x in range(width):
                nib = (raw[x >> 1] >> (0 if x & 1 else 4)) & 0x0F
                out += bytes(palette[nib] if nib < len(palette) else (0, 0, 0))
        elif bpp == 1:
            for x in range(width):
                bit = (raw[x >> 3] >> (7 - (x & 7))) & 1
                out += bytes(palette[bit] if bit < len(palette) else (0, 0, 0))
        else:
            return None
        rows.append(bytes(out))
    return width, height, rows


def encode_png(width: int, height: int, rows: list[bytes]) -> bytes:
    """Minimal PNG writer: 8-bit RGB, no filtering. Avoids needing Pillow."""
    import zlib

    raw = b"".join(b"\x00" + r for r in rows)

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (struct.pack(">I", len(data)) + tag + data
                + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr)
            + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))


def encode_png_rgba(width: int, height: int, rows: list[bytes]) -> bytes:
    """PNG writer for 8-bit RGBA, so icon transparency survives."""
    import zlib

    raw = b"".join(b"\x00" + r for r in rows)

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (struct.pack(">I", len(data)) + tag + data
                + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr)
            + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))


def decode_icon(dib: bytes):
    """
    Decodes a PE ICON resource into (width, height, rgba_rows).

    An icon DIB stores its height doubled: the top half is the colour (XOR) bitmap and the
    bottom half a 1bpp AND mask, where a set bit means transparent. Both are bottom-up with
    rows padded to 4 bytes.
    """
    if dib[:8] == b"\x89PNG\r\n\x1a\n":
        return None  # already a PNG icon; caller writes it verbatim
    header_size, width, doubled, _planes, bpp = struct.unpack_from("<IiiHH", dib, 0)
    if header_size != 40:
        return None
    height = doubled // 2

    palette = []
    if bpp <= 8:
        clr_used = struct.unpack_from("<I", dib, 32)[0] or (1 << bpp)
        base = header_size
        for i in range(clr_used):
            b, g, r, _a = dib[base + i * 4: base + i * 4 + 4]
            palette.append((r, g, b))
        xor_start = header_size + clr_used * 4
    else:
        xor_start = header_size

    xor_stride = ((bpp * width + 31) // 32) * 4
    mask_stride = ((width + 31) // 32) * 4
    mask_start = xor_start + xor_stride * height

    rows = []
    for y in range(height):
        src = height - 1 - y  # bottom-up
        xrow = dib[xor_start + src * xor_stride: xor_start + (src + 1) * xor_stride]
        mrow = dib[mask_start + src * mask_stride: mask_start + (src + 1) * mask_stride]
        if len(xrow) < xor_stride:
            return None
        out = bytearray()
        for x in range(width):
            if bpp == 32:
                b, g, r, a = xrow[x * 4: x * 4 + 4]
            elif bpp == 24:
                b, g, r = xrow[x * 3: x * 3 + 3]
                a = 255
            elif bpp == 8:
                r, g, b = palette[xrow[x]] if xrow[x] < len(palette) else (0, 0, 0)
                a = 255
            elif bpp == 4:
                nib = (xrow[x >> 1] >> (0 if x & 1 else 4)) & 0x0F
                r, g, b = palette[nib] if nib < len(palette) else (0, 0, 0)
                a = 255
            elif bpp == 1:
                bit = (xrow[x >> 3] >> (7 - (x & 7))) & 1
                r, g, b = palette[bit] if bit < len(palette) else (0, 0, 0)
                a = 255
            else:
                return None
            # A set AND-mask bit means this pixel is transparent.
            if mrow and (mrow[x >> 3] >> (7 - (x & 7))) & 1:
                a = 0
            out += bytes((r, g, b, a))
        rows.append(bytes(out))
    return width, height, rows


def ico_from_dib(dib: bytes) -> bytes:
    """Wraps a single icon DIB in an ICONDIR so it becomes a valid .ico file."""
    _hs, width, doubled, _planes, bpp = struct.unpack_from("<IiiHH", dib, 0)
    height = doubled // 2
    entry = struct.pack(
        "<BBBBHHII",
        width if width < 256 else 0,
        height if height < 256 else 0,
        (1 << bpp) if bpp <= 8 else 0,
        0, 1, bpp, len(dib), 6 + 16,
    )
    return struct.pack("<HHH", 0, 1, 1) + entry + dib


def write_image(path_no_ext: str, bmp: bytes) -> str | None:
    """Writes a PNG next to the BMP. Returns the PNG's basename, or None on failure."""
    decoded = decode_bmp(bmp)
    if not decoded:
        return None
    w, h, rows = decoded
    png = encode_png(w, h, rows)
    open(path_no_ext + ".png", "wb").write(png)
    return os.path.basename(path_no_ext) + ".png"


# --------------------------------------------------------------- TImageList / TIcon

def split_imagelist(blob: bytes, cell_w: int, cell_h: int):
    """
    Splits a Delphi TImageList 'Bitmap' blob into per-frame RGBA images.

    Layout, determined empirically from this binary and consistent across all nine lists:

        u32  size of the colour BMP
        u32  number of images actually in use
        ...  colour BMP (24bpp strip)
        ...  1bpp mask BMP, same dimensions

    Windows image lists pack frames into a grid left-to-right then wrapping, and Delphi
    over-allocates, so the strip usually has more cells than are used. The count tells us
    how many are real. In the mask a set bit means transparent, as with icon AND masks.
    """
    if len(blob) < 8:
        return None
    color_size, count = struct.unpack_from("<II", blob, 0)
    color = blob[8:8 + color_size]
    mask = blob[8 + color_size:]
    if color[:2] != b"BM":
        return None

    cdec = decode_bmp(color)
    if not cdec:
        return None
    sw, sh, crows = cdec

    mrows = None
    if mask[:2] == b"BM":
        mdec = decode_bmp(mask)
        if mdec and mdec[0] == sw and mdec[1] == sh:
            mrows = mdec[2]

    cols = max(1, sw // cell_w)
    frames = []
    for i in range(count):
        cx = (i % cols) * cell_w
        cy = (i // cols) * cell_h
        if cx + cell_w > sw or cy + cell_h > sh:
            break
        rows = []
        for y in range(cell_h):
            crow = crows[cy + y]
            mrow = mrows[cy + y] if mrows else None
            out = bytearray()
            for x in range(cell_w):
                px = (cx + x) * 3
                r, g, b = crow[px], crow[px + 1], crow[px + 2]
                # The mask decodes to RGB, so any non-black pixel means transparent.
                a = 0 if (mrow and mrow[(cx + x) * 3] > 127) else 255
                out += bytes((r, g, b, a))
            rows.append(bytes(out))
        frames.append((cell_w, cell_h, rows))
    return frames


def icon_payload(blob: bytes) -> bytes | None:
    """
    Unwraps a TIcon TPicture blob into the .ico file it contains.

    Note the asymmetry with TBitmap: a TBitmap blob is class name + u32 length + payload,
    but a TIcon blob is class name followed immediately by the .ico bytes, with no length.
    Verified by arithmetic — a 772-byte blob is 1 + len("TIcon") + 766, and 766 is exactly
    the size of the ICONDIR-wrapped 32x32 icon.
    """
    if not blob:
        return None
    n = blob[0]
    if blob[1:1 + n].decode("latin-1", "replace").lower() != "ticon":
        return None
    ico = blob[1 + n:]
    if len(ico) < 22:
        return None
    reserved, kind, count = struct.unpack_from("<HHH", ico, 0)
    if reserved != 0 or kind != 1 or count < 1:
        return None
    return ico


def ico_first_dib(ico: bytes) -> bytes | None:
    """Returns the first image's DIB from a .ico file."""
    if len(ico) < 22 or struct.unpack_from("<HHH", ico, 0)[1] != 1:
        return None
    size, offset = struct.unpack_from("<II", ico, 6 + 8)
    return ico[offset:offset + size]


# --------------------------------------------------------------------------- DFM parsing

VT_LIST, VT_INT8, VT_INT16, VT_INT32, VT_EXTENDED = 1, 2, 3, 4, 5
VT_STRING, VT_IDENT, VT_FALSE, VT_TRUE, VT_BINARY = 6, 7, 8, 9, 10
VT_SET, VT_LSTRING, VT_NIL, VT_COLLECTION = 11, 12, 13, 14
VT_SINGLE, VT_CURRENCY, VT_DATE, VT_WSTRING, VT_INT64, VT_UTF8 = 15, 16, 17, 18, 19, 20


class DfmReader:
    def __init__(self, b: bytes) -> None:
        self.b = b
        self.i = 0

    def u8(self) -> int:
        v = self.b[self.i]
        self.i += 1
        return v

    def u32(self) -> int:
        v = struct.unpack_from("<I", self.b, self.i)[0]
        self.i += 4
        return v

    def shortstr(self) -> str:
        n = self.u8()
        s = self.b[self.i:self.i + n].decode("latin-1")
        self.i += n
        return s

    def value(self):
        t = self.u8()
        if t == 0:
            return None
        if t == VT_LIST:
            out = []
            while self.b[self.i] != 0:
                out.append(self.value())
            self.i += 1
            return out
        if t == VT_INT8:
            return self.u8()
        if t == VT_INT16:
            v = struct.unpack_from("<h", self.b, self.i)[0]
            self.i += 2
            return v
        if t == VT_INT32:
            v = struct.unpack_from("<i", self.b, self.i)[0]
            self.i += 4
            return v
        if t == VT_EXTENDED:
            self.i += 10
            return 0.0
        if t in (VT_STRING, VT_IDENT):
            return self.shortstr()
        if t == VT_FALSE:
            return False
        if t == VT_TRUE:
            return True
        if t == VT_BINARY:
            n = self.u32()
            v = self.b[self.i:self.i + n]
            self.i += n
            return ("binary", v)
        if t == VT_SET:
            out = []
            while True:
                s = self.shortstr()
                if not s:
                    break
                out.append(s)
            return out
        if t == VT_LSTRING:
            n = self.u32()
            v = self.b[self.i:self.i + n].decode("latin-1")
            self.i += n
            return v
        if t == VT_NIL:
            return None
        if t == VT_COLLECTION:
            out = []
            while self.b[self.i] != 0:
                pk = self.u8()
                if pk in (VT_INT8, VT_INT16, VT_INT32):
                    self.i -= 1
                    self.value()
                out.append(self.props())
            self.i += 1
            return out
        if t == VT_SINGLE:
            self.i += 4
            return 0.0
        if t in (VT_CURRENCY, VT_DATE, VT_INT64):
            self.i += 8
            return 0
        if t == VT_WSTRING:
            n = self.u32()
            v = self.b[self.i:self.i + n * 2].decode("utf-16-le", "replace")
            self.i += n * 2
            return v
        if t == VT_UTF8:
            n = self.u32()
            v = self.b[self.i:self.i + n].decode("utf-8", "replace")
            self.i += n
            return v
        raise ValueError(f"unknown DFM value type {t} at {self.i}")

    def props(self) -> dict:
        p = {}
        while self.i < len(self.b) and self.b[self.i] != 0:
            key = self.shortstr()
            p[key] = self.value()
        self.i += 1
        return p

    def obj(self) -> dict:
        if self.b[self.i] & 0xF0 == 0xF0:
            flags = self.u8() & 0x0F
        else:
            flags = 0
        cls = self.shortstr()
        if flags & 2:
            self.value()
        name = self.shortstr()
        props = self.props()
        kids = []
        while self.i < len(self.b) and self.b[self.i] != 0:
            kids.append(self.obj())
        if self.i < len(self.b):
            self.i += 1
        return {"class": cls, "name": name, "props": props, "children": kids}


def parse_dfm(b: bytes) -> dict:
    if b[:4] != b"TPF0":
        raise ValueError("not a DFM stream")
    r = DfmReader(b)
    r.i = 4
    return r.obj()


def picture_to_bmp(blob: bytes) -> bytes | None:
    """
    A TPicture blob is a Pascal short string naming the graphic class, a 4-byte length,
    then the payload. For TBitmap the payload is already a complete .bmp file.
    """
    if not blob:
        return None
    n = blob[0]
    cls = blob[1:1 + n].decode("latin-1", "replace")
    rest = blob[1 + n:]
    if cls.lower() not in ("tbitmap", "tjpegimage", "ticon", "tmetafile"):
        # Some blobs store the image with no class prefix at all.
        return blob if blob[:2] == b"BM" else None
    if len(rest) < 4:
        return None
    size = struct.unpack_from("<I", rest, 0)[0]
    payload = rest[4:4 + size] if size else rest[4:]
    if payload[:2] == b"BM":
        return payload
    return None


# --------------------------------------------------------------------------- card text

CARD_PLACEHOLDERS = ("<yourname>", "<opponentname>", "<yourproject>",
                     "<opponentproject>", "<youroldproject>")


def chance_effects(pe: "PE", chance_texts: list[str]) -> list[list[int]]:
    """
    Recovers the real numeric effects of the Chance cards from compiled code.

    Each card is constructed by one call site that pushes six immediates, then loads the
    card's text with `mov edx, <string address>` (opcode BA) before calling the constructor.
    Walking backwards from that opcode over push-immediate opcodes (6A ib, 68 id) recovers
    the six values without needing a full disassembler, and cannot desynchronise the way
    decoding from an arbitrary offset can.

    Values are returned in push order. Correlating them against the cards' own effect
    clauses identifies three of the six:

        index 2  change in work REMAINING  (positive slows the project, negative speeds it;
                 correlates perfectly across all ten cards that mention work)
        index 3  share price delta
        index 4  Boss Rating delta
        index 0  set when the card applies to every project rather than one
                 (agrees with the wording on 26 of 30 cards)
        index 1  a secondary amount, semantics not established -- recorded, not applied
        index 5  always -1 in every card, so a sentinel rather than a value

    Numeric parameters are facts about behaviour rather than creative expression, which is
    why they are recoverable here in the same spirit as the board coordinates and tile
    colours. The card wording itself stays out of the repo.
    """
    text_sec = next(((va, ra, rs) for n, va, vs, ra, rs in pe.sections if n == ".text"), None)
    data_sec = next(((va, ra, rs) for n, va, vs, ra, rs in pe.sections if n == ".data"), None)
    if not text_sec or not data_sec:
        return []
    tva, tra, trs = text_sec
    dva, dra, drs = data_sec
    d = pe.d
    pe_off = struct.unpack_from("<I", d, 0x3C)[0]
    base = struct.unpack_from("<I", d, pe_off + 24 + 28)[0]
    text = d[tra:tra + trs]

    out = []
    for card in chance_texts:
        probe = card[:24].encode("latin-1", "replace")
        off = d.find(probe, dra, dra + drs)
        if off < 0:
            out.append([])
            continue
        addr = base + dva + (off - dra)
        site = text.find(b"\xba" + struct.pack("<I", addr))
        if site < 0:
            out.append([])
            continue
        vals: list[int] = []
        i = site
        while len(vals) < 6:
            if i - 2 >= 0 and text[i - 2] == 0x6A:
                vals.append(struct.unpack_from("<b", text, i - 1)[0])
                i -= 2
            elif i - 5 >= 0 and text[i - 5] == 0x68:
                vals.append(struct.unpack_from("<i", text, i - 4)[0])
                i -= 5
            else:
                break
        vals.reverse()
        out.append(vals if len(vals) == 6 else [])
    return out


def extract_cards(pe: "PE") -> dict:
    """
    Recovers the original Chance and Scruples decks from .data.

    Both are stored as ordinary Pascal string literals in the data section, in deck order,
    which is what lets them line up with the numbered CHANCE0..29 and SCRUPLES0..35 bitmaps.

    Structure, verified against this binary:
      * A Scruples card is a situation string followed immediately by exactly three strings
        beginning "1. ", "2. " and "3. ". There are 36 such blocks, i.e. 108 choice lines.
      * The 30 Chance cards sit in one contiguous run just before the first Scruples
        situation, each with a blank line separating the setup from its effect clause.

    Only the text is emitted. The numeric effects live in compiled code and are not
    recoverable, so the game infers them from the wording (see src/originalCards.ts).
    """
    section = next(((ra, rs) for n, va, vs, ra, rs in pe.sections if n == ".data"), None)
    if not section:
        return {}
    ra, rs = section
    data = pe.d[ra:ra + rs]

    runs = [m.group().decode("latin-1")
            for m in re.finditer(rb"[\x20-\x7e\r\n\t]{12,}", data)]
    strings = [s for s in runs if " " in s and re.search(r"[a-z]{3}", s)]

    def is_choice(s: str) -> bool:
        return bool(re.match(r"^[123]\.\s", s.strip()))

    def has_placeholder(s: str) -> bool:
        return any(k in s for k in CARD_PLACEHOLDERS)

    blocks = [i for i in range(len(strings) - 2)
              if is_choice(strings[i]) and is_choice(strings[i + 1]) and is_choice(strings[i + 2])]

    scruples = []
    for b in blocks:
        situation = strings[b - 1] if b > 0 else ""
        if not has_placeholder(situation):
            continue
        scruples.append({
            "situation": situation,
            "choices": [re.sub(r"^[123]\.\s*", "", strings[b + j].strip()) for j in range(3)],
        })

    chance = []
    if blocks:
        first_situation = blocks[0] - 1
        # Walk back over the contiguous run of placeholder-bearing cards ahead of it.
        i = first_situation - 1
        while i >= 0 and has_placeholder(strings[i]) and not is_choice(strings[i]):
            chance.append(strings[i])
            i -= 1
        chance.reverse()

    return {
        "note": ("Recovered from the original binary. The wording is copyrighted by its "
                 "authors -- do not redistribute. chanceEffects holds the real numeric "
                 "effects read out of compiled code; Scruples answer effects live in a "
                 "separate handler and are not recovered, so the game infers those."),
        "chance": chance,
        "chanceEffects": chance_effects(pe, chance),
        "scruples": scruples,
    }


# --------------------------------------------------------------------------- extraction

def safe(name: str) -> str:
    return "".join(c if (c.isalnum() or c in "-_.") else "_" for c in name)


def walk_objects(node: dict):
    yield node
    for kid in node["children"]:
        yield from walk_objects(kid)


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    exe = sys.argv[1]
    outdir = sys.argv[2] if len(sys.argv) > 2 else "public/assets/graphics"

    pe = PE(exe)
    res_dir = os.path.join(outdir, "res")
    form_dir = os.path.join(outdir, "forms")
    os.makedirs(res_dir, exist_ok=True)
    os.makedirs(form_dir, exist_ok=True)

    counts = {"bitmap": 0, "cursor": 0, "picture": 0, "png": 0, "icon": 0,
              "frames": 0, "skipped": 0}
    manifest: list[str] = []

    for path, data in pe.resources():
        kind = path[0]
        if kind == "BITMAP":
            bmp = dib_to_bmp(data)
            if not bmp:
                counts["skipped"] += 1
                continue
            stem = os.path.join(res_dir, safe(path[1]))
            open(stem + ".bmp", "wb").write(bmp)
            counts["bitmap"] += 1
            if write_image(stem, bmp):
                counts["png"] += 1
                manifest.append(f"res/{safe(path[1])}.png")
        elif kind == "ICON":
            # The application icon (GROUP_ICON is named MAINICON in this binary).
            stem = os.path.join(outdir, "icon")
            if data[:8] == b"\x89PNG\r\n\x1a\n":
                open(stem + ".png", "wb").write(data)
                counts["icon"] += 1
                manifest.append("icon.png")
                continue
            decoded = decode_icon(data)
            if not decoded:
                counts["skipped"] += 1
                continue
            w, h, rows = decoded
            open(stem + ".png", "wb").write(encode_png_rgba(w, h, rows))
            open(stem + ".ico", "wb").write(ico_from_dib(data))
            counts["icon"] += 1
            manifest.append("icon.png")
            manifest.append("icon.ico")
        elif kind == "CURSOR":
            # Raw CURSOR resources lack the .cur file header; keep them for reference only.
            fn = os.path.join(res_dir, "cursor_" + safe(path[1]) + ".bin")
            open(fn, "wb").write(data)
            counts["cursor"] += 1
        elif kind == "RCDATA" and data[:4] == b"TPF0":
            try:
                tree = parse_dfm(data)
            except Exception as exc:  # noqa: BLE001 - report and continue
                print(f"  ! {path[1]}: {exc}")
                continue
            form = safe(path[1])
            for obj in walk_objects(tree):
                for prop, val in obj["props"].items():
                    if not (isinstance(val, tuple) and val and val[0] == "binary"):
                        continue

                    name = safe(obj["name"] or obj["class"])

                    # TImageList frames: one PNG per image, numbered.
                    if prop == "Bitmap":
                        cw = obj["props"].get("Width") or 16
                        ch = obj["props"].get("Height") or 16
                        if not isinstance(cw, int) or not isinstance(ch, int):
                            cw, ch = 16, 16
                        frames = split_imagelist(val[1], cw, ch)
                        if not frames:
                            counts["skipped"] += 1
                            continue
                        d = os.path.join(form_dir, form, name)
                        os.makedirs(d, exist_ok=True)
                        for i, (fw, fh, rows) in enumerate(frames):
                            open(os.path.join(d, f"{i}.png"), "wb").write(
                                encode_png_rgba(fw, fh, rows))
                            manifest.append(f"forms/{form}/{name}/{i}.png")
                        counts["frames"] += len(frames)
                        continue

                    # A TIcon picture: keep the .ico and a transparent PNG.
                    ico = icon_payload(val[1])
                    if ico:
                        dib = ico_first_dib(ico)
                        dec = decode_icon(dib) if dib else None
                        if not dec:
                            counts["skipped"] += 1
                            continue
                        d = os.path.join(form_dir, form)
                        os.makedirs(d, exist_ok=True)
                        stem = os.path.join(d, name)
                        iw, ih, rows = dec
                        open(stem + ".png", "wb").write(encode_png_rgba(iw, ih, rows))
                        open(stem + ".ico", "wb").write(ico)
                        counts["icon"] += 1
                        manifest.append(f"forms/{form}/{name}.png")
                        continue

                    if "picture" not in prop.lower() and "glyph" not in prop.lower():
                        continue
                    bmp = picture_to_bmp(val[1])
                    if not bmp:
                        counts["skipped"] += 1
                        continue
                    d = os.path.join(form_dir, form)
                    os.makedirs(d, exist_ok=True)
                    stem = os.path.join(d, safe(obj["name"] or obj["class"]))
                    open(stem + ".bmp", "wb").write(bmp)
                    counts["picture"] += 1
                    if write_image(stem, bmp):
                        counts["png"] += 1
                        manifest.append(f"forms/{form}/{safe(obj['name'] or obj['class'])}.png")

    manifest.sort()
    open(os.path.join(outdir, "manifest.txt"), "w").write("\n".join(manifest) + "\n")

    cards = extract_cards(pe)
    if cards.get("chance") or cards.get("scruples"):
        import json as _json
        cards_path = os.path.join(os.path.dirname(outdir.rstrip("/")) or ".", "cards.json")
        open(cards_path, "w").write(_json.dumps(cards, indent=1))
        print(f"chance cards     : {len(cards['chance'])}")
        print(f"scruples cards   : {len(cards['scruples'])}")
        print(f"card text        : {cards_path}")

    print(f"resource bitmaps : {counts['bitmap']}")
    print(f"converted to png : {counts['png']}")
    print(f"icons            : {counts['icon']}")
    print(f"imagelist frames : {counts['frames']}")
    print(f"form pictures    : {counts['picture']}")
    print(f"cursors (raw)    : {counts['cursor']}")
    print(f"skipped          : {counts['skipped']}")
    print(f"wrote            : {outdir}/  ({len(manifest)} images in manifest.txt)")
    print("\nThese images are the original's artwork. Keep them out of version control.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
