"""
NASA-punk material pass.

Substrate  : painted cream / off-white hardware (#ECE5D6 family)
Structure  : panel seams, rivets, cut plates
Functional : black/white hazard diagonals, checkerboard, grilles, vents
Labels     : small uppercase stencil text (real, legible at texture scale)
Identity   : ONE vivid accent per specimen
Wear       : scratches + faint grime from the downloaded scans

Emits per level:  <lv>_a.jpg albedo   <lv>_e.jpg near-black emissive
(no neon in this language — the emissive map is deliberately inert)
"""
import os, math, random
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

SRC = "assets/tex"
DST = "assets/tex/final"
os.makedirs(DST, exist_ok=True)
TW, TH = 1024, 512

CREAM = "#ECE5D6"

SPECS = [
    dict(id="lv01", base="#E6DFCE", accent="#4C5A68", pat="hexplate", code="P/L 01",  label="BOLT"),
    dict(id="lv02", base="#EFE9DC", accent="#2F6E75", pat="grille",   code="STOW 84S", label="SENSOR"),
    dict(id="lv03", base="#E8E1D0", accent="#D2A85E", pat="cells",    code="REF 12-4", label="BATTERY"),
    dict(id="lv04", base="#F0EADD", accent="#8A8578", pat="rings",    code="GYR-A",    label="GYRO"),
    dict(id="lv05", base="#E2DBC8", accent="#7A7F4E", pat="bands",    code="TANK 5",   label="CANISTER"),
    dict(id="lv06", base="#DCD5C2", accent="#A8432F", pat="nozzle",   code="NO STEP",  label="THRUSTER"),
    dict(id="lv07", base="#EDE7D9", accent="#2B4A7A", pat="radial",   code="ANT 7",    label="ANTENNA"),
    dict(id="lv08", base="#E6DFCE", accent="#C8792B", pat="panelgrid",code="F/T 08",   label="FUEL TANK"),
    dict(id="lv09", base="#E9E3D4", accent="#2F6E75", pat="seams",    code="SM-09",    label="SERVICE MOD"),
    dict(id="lv10", base="#F1EBDE", accent="#D63A2C", pat="tiles",    code="CM-10",    label="COMMAND MOD"),
    dict(id="lv11", base="#F2ECE0", accent="#D63A2C", pat="livery",   code="LV-11",    label="LAUNCH VEH"),
]

def hex2rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))

def mix(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))

INK = (42, 42, 42)
INK_L = (110, 105, 96)

try:
    FONT = ImageFont.load_default()
except Exception:
    FONT = None

def label(d, x, y, text, fill=INK, anchor="la"):
    """small uppercase stencil mark"""
    if FONT:
        d.text((x, y), text.upper(), font=FONT, fill=fill, anchor=anchor)

def rivet(d, x, y, r=3, tone=(197, 191, 175)):
    d.ellipse([x - r, y - r, x + r, y + r], fill=tone, outline=(150, 145, 132))
    d.ellipse([x - r + 1, y - r + 1, x + r - 2, y + r - 2], fill=mix(tone, (255, 255, 255), .45))

def hazard_band(d, x0, y0, w, h, c1=(28, 28, 28), c2=(240, 238, 230), step=14):
    """black/white diagonal warning stripes"""
    d.rectangle([x0, y0, x0 + w, y0 + h], fill=c2)
    d.save if False else None
    # clip manually by drawing diagonals inside the band
    n = int((w + h) / step) + 2
    for i in range(-1, n):
        xs = x0 + i * step
        poly = [(xs, y0 + h), (xs + step / 2, y0 + h), (xs + step / 2 + h, y0), (xs + h, y0)]
        poly = [(min(max(px, x0), x0 + w), min(max(py, y0), y0 + h)) for px, py in poly]
        d.polygon(poly, fill=c1)
    d.rectangle([x0, y0, x0 + w, y0 + h], outline=(90, 86, 78))

def checker(d, x0, y0, w, h, cell=16, c1=(28, 28, 28), c2=(242, 240, 232)):
    d.rectangle([x0, y0, x0 + w, y0 + h], fill=c2)
    for j, yy in enumerate(range(int(y0), int(y0 + h), cell)):
        for i, xx in enumerate(range(int(x0), int(x0 + w), cell)):
            if (i + j) % 2 == 0:
                d.rectangle([xx, yy, min(xx + cell, x0 + w), min(yy + cell, y0 + h)], fill=c1)

def scratches(d, rnd, n, w, h, tone):
    for _ in range(n):
        x, y = rnd.uniform(0, w), rnd.uniform(0, h)
        a = rnd.uniform(0, math.tau)
        L = rnd.uniform(20, 150)
        d.line([(x, y), (x + math.cos(a) * L, y + math.sin(a) * L)],
               fill=tone, width=1)

# ── pattern layer: returns (art RGB, accent-mask RGB) ────────────────
def make_pattern(kind, seed, base, accent, code):
    rnd = random.Random(seed)
    art = Image.new("RGB", (TW, TH), base)
    acc = Image.new("RGB", (TW, TH), (0, 0, 0))
    d = ImageDraw.Draw(art)
    da = ImageDraw.Draw(acc)
    A = hex2rgb(accent)
    B = hex2rgb(base)
    shade = lambda f: mix(B, (255, 255, 255) if f > 0 else (0, 0, 0), abs(f) * .5)

    if kind == "hexplate":
        s = 96
        h = s * math.sqrt(3) / 2
        for row in range(-1, int(TH / h) + 2):
            for col in range(-1, int(TW / (s * 1.5)) + 2):
                cx = col * s * 1.5
                cy = row * h + (h / 2 if col % 2 else 0)
                pts = [(cx + s * .52 * math.cos(a), cy + s * .52 * math.sin(a))
                       for a in [math.radians(60 * i) for i in range(6)]]
                d.polygon(pts, fill=shade(rnd.uniform(-.10, .10)), outline=INK_L)
                rivet(d, cx, cy, 4)
        d.rectangle([24, TH - 84, 24 + 190, TH - 40], fill=A)
        label(d, 34, TH - 62, code, (255, 255, 255), "lm")
        label(d, 34, TH - 30, "TORQUE 42 N·m", INK_L, "lm")

    elif kind == "grille":
        for y in range(20, TH - 20, 22):
            d.rectangle([18, y, TW - 18, y + 12], fill=shade(-.28))
            d.rectangle([18, y, TW - 18, y + 12], outline=(120, 116, 106))
        d.rectangle([18, 20, TW - 18, TH - 20], outline=INK_L, width=2)
        for x in range(40, TW - 40, 128):
            rivet(d, x, 32, 3); rivet(d, x, TH - 32, 3)
        d.rectangle([TW - 300, 34, TW - 40, 86], fill=(242, 240, 232), outline=INK_L)
        label(d, TW - 288, 60, code, INK, "lm")
        d.rectangle([40, TH - 96, 40 + 250, TH - 40], fill=A)
        label(d, 52, TH - 68, "THIS SIDE UP", (255, 255, 255), "lm")

    elif kind == "cells":
        for i in range(6):
            x = 30 + i * 165
            d.rectangle([x, 60, x + 130, TH - 60], fill=shade(rnd.uniform(-.06, .10)), outline=INK_L)
            d.rectangle([x + 14, 74, x + 116, TH - 74], outline=(140, 136, 126))
            for k in range(3):
                rivet(d, x + 20 + k * 45, TH - 46, 3)
        hazard_band(d, 30, 22, 300, 26)
        d.rectangle([TW - 260, TH - 92, TW - 40, TH - 40], fill=A)
        label(d, TW - 248, TH - 66, code, (255, 255, 255), "lm")
        label(d, TW - 248, 60, "24V DC", INK_L, "lm")

    elif kind == "rings":
        cx, cy = TW / 2, TH / 2
        for r in range(30, 330, 34):
            d.ellipse([cx - r, cy - r * .58, cx + r, cy + r * .58],
                      outline=INK_L, width=2)
            for a in range(0, 360, 30):
                px = cx + math.cos(math.radians(a)) * r
                py = cy + math.sin(math.radians(a)) * r * .58
                if 0 < px < TW and 0 < py < TH: rivet(d, px, py, 2)
        d.ellipse([cx - 26, cy - 15, cx + 26, cy + 15], fill=A)
        label(d, 36, TH - 40, code, INK, "lm")
        label(d, 36, 30, "SPIN AXIS", INK_L, "lm")

    elif kind == "bands":
        for i, y in enumerate(range(0, TH, 86)):
            d.rectangle([0, y, TW, y + 4], fill=INK_L)
        for i in range(4):
            d.rectangle([60 + i * 250, 120, 60 + i * 250 + 150, 300],
                        fill=shade(-.05), outline=INK_L)
            rivet(d, 60 + i * 250 + 12, 132, 3)
            rivet(d, 60 + i * 250 + 138, 288, 3)
        d.rectangle([0, TH - 70, TW, TH - 30], fill=A)
        label(d, 24, TH - 50, code + "   ·   CAPACITY 12 400 L   ·   " + code, (255, 255, 255), "lm")

    elif kind == "nozzle":
        cx, cy = TW / 2, TH / 2
        for r in range(24, 300, 20):
            d.ellipse([cx - r, cy - r * .62, cx + r, cy + r * .62], outline=INK_L, width=3)
        for a in range(0, 360, 10):
            x1 = cx + math.cos(math.radians(a)) * 60
            y1 = cy + math.sin(math.radians(a)) * 37
            x2 = cx + math.cos(math.radians(a)) * 290
            y2 = cy + math.sin(math.radians(a)) * 180
            if 0 < y2 < TH: d.line([(x1, y1), (x2, y2)], fill=(140, 136, 126), width=1)
        d.ellipse([cx - 60, cy - 37, cx + 60, cy + 37], fill=A)
        hazard_band(d, 20, TH - 60, 420, 28)
        label(d, TW - 40, 34, code, INK, "ra")

    elif kind == "radial":
        cx, cy = TW / 2, TH / 2
        for i in range(48):
            a = i * math.tau / 48
            d.line([(cx + math.cos(a) * 40, cy + math.sin(a) * 40),
                    (cx + math.cos(a) * TW * .8, cy + math.sin(a) * TH * .95)],
                   fill=(150, 146, 136), width=4)
        for r in (70, 150, 230):
            d.ellipse([cx - r, cy - r * .6, cx + r, cy + r * .6], outline=INK_L, width=2)
        d.ellipse([cx - 34, cy - 20, cx + 34, cy + 20], fill=A)
        label(d, 30, 30, code, INK, "la")
        label(d, 30, TH - 34, "GAIN 42 dB", INK_L, "la")

    elif kind == "panelgrid":
        for x in range(0, TW, 128):
            d.line([(x, 0), (x, TH)], fill=INK_L, width=3)
            for y in range(24, TH, 64): rivet(d, x + 12, y, 3)
        for y in range(0, TH, 128):
            d.line([(0, y), (TW, y)], fill=INK_L, width=3)
        checker(d, 128, 128, 128, 64, 16)
        checker(d, TW - 256, TH - 192, 128, 64, 16)
        d.rectangle([0, TH - 56, TW, TH - 20], fill=A)
        label(d, 20, TH - 38, code + "  ·  PRESSURIZED  ·  NO STEP", (255, 255, 255), "lm")

    elif kind == "seams":
        for x in range(0, TW, 170):
            d.rectangle([x, 0, x + 6, TH], fill=INK_L)
            for y in range(30, TH - 20, 56): rivet(d, x + 20, y, 3)
        for y in range(70, TH, 110):
            for x in range(40, TW, 170):
                for k in range(6):
                    d.ellipse([x + k * 12, y, x + k * 12 + 7, y + 7], fill=(140, 136, 126))
        d.rectangle([40, 26, 40 + 200, 76], fill=A)
        label(d, 52, 51, code, (255, 255, 255), "lm")
        label(d, 40, TH - 34, "ACCESS PANEL", INK_L, "la")

    elif kind == "tiles":
        for j, y in enumerate(range(0, TH, 32)):
            for i, x in enumerate(range(0, TW, 32)):
                v = rnd.uniform(-.16, .16)
                d.rectangle([x + 1, y + 1, x + 30, y + 30], fill=shade(v), outline=(160, 156, 146))
        hazard_band(d, 0, TH - 54, TW, 30, step=18)
        d.rectangle([TW // 2 - 150, 26, TW // 2 + 150, 96], fill=A)
        label(d, TW // 2, 61, code, (255, 255, 255), "mm")

    elif kind == "livery":
        d.rectangle([0, 96, TW, 108], fill=INK)
        d.rectangle([0, 116, TW, 124], fill=A)
        checker(d, 0, 150, 320, 44, 22)
        checker(d, TW - 320, TH - 210, 320, 44, 22)
        d.rectangle([60, 200, 60 + 380, 300], fill=A)
        label(d, 250, 250, code, (255, 255, 255), "mm")
        label(d, 40, 60, "LAUNCH VEHICLE  ·  STAGE 1", INK, "la")
        label(d, TW - 40, TH - 40, "THIS SIDE UP  ·  NO STEP", INK, "ra")
        hazard_band(d, TW - 240, 24, 216, 26, step=13)

    # universal wear + panel borders
    scratches(d, rnd, 90, TW, TH, (150, 146, 136))
    scratches(d, rnd, 40, TW, TH, (250, 248, 242))
    d.rectangle([0, 0, TW - 1, TH - 1], outline=INK_L, width=3)
    return art, acc

# ── build ───────────────────────────────────────────────────────────
def build(spec):
    lid = spec["id"]
    rnd = random.Random(abs(hash(lid)) % 99991)

    art, acc = make_pattern(spec["pat"], abs(hash(lid)) % 99991, spec["base"], spec["accent"], spec["code"])

    a = np.asarray(art, dtype=np.float32) / 255.0

    # faint grime / surface noise from the downloaded scans (keeps the
    # photographic substrate that real hardware photos provide)
    src = os.path.join(SRC, lid + ".jpg")
    if os.path.exists(src):
        lum = np.asarray(Image.open(src).convert("L").resize((TW, TH), Image.LANCZOS),
                         dtype=np.float32) / 255.0
        lum = (lum - lum.mean()) * 0.55 + 0.5
        a = np.clip(a * (1.0 + (lum[..., None] - 0.5) * 0.22), 0, 1)

    # soft studio shading + paper-thin vignette (light language, not neon)
    xx = (np.arange(TW)[None, :, None] / TW - .5) * 2
    yv = (np.arange(TH)[:, None, None] / TH - .5) * 2
    a *= (1.0 - 0.10 * np.clip(xx ** 2 * .6 + yv ** 2 * .8, 0, 1))

    albedo = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8), "RGB")
    albedo = albedo.filter(ImageFilter.GaussianBlur(0.4))
    albedo.save(os.path.join(DST, lid + "_a.jpg"), "JPEG", quality=92, optimize=True)

    # inert emissive: barely-there marks so the material path stays uniform
    e = (np.asarray(acc, dtype=np.float32) / 255.0) * 0.10
    Image.fromarray((np.clip(e, 0, 1) * 255).astype(np.uint8), "RGB").save(
        os.path.join(DST, lid + "_e.jpg"), "JPEG", quality=88, optimize=True)
    return lid

if __name__ == "__main__":
    for s in SPECS:
        build(s)
        print("built", s["id"], s["pat"], s["label"], flush=True)
    print("DONE ->", DST)
