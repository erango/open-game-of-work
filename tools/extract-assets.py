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


def write_image(path_no_ext: str, bmp: bytes) -> str | None:
    """Writes a PNG next to the BMP. Returns the PNG's basename, or None on failure."""
    decoded = decode_bmp(bmp)
    if not decoded:
        return None
    w, h, rows = decoded
    png = encode_png(w, h, rows)
    open(path_no_ext + ".png", "wb").write(png)
    return os.path.basename(path_no_ext) + ".png"


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

    counts = {"bitmap": 0, "cursor": 0, "picture": 0, "png": 0, "skipped": 0}
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

    print(f"resource bitmaps : {counts['bitmap']}")
    print(f"converted to png : {counts['png']}")
    print(f"form pictures    : {counts['picture']}")
    print(f"cursors (raw)    : {counts['cursor']}")
    print(f"skipped          : {counts['skipped']}")
    print(f"wrote            : {outdir}/  ({len(manifest)} images in manifest.txt)")
    print("\nThese images are the original's artwork. Keep them out of version control.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
