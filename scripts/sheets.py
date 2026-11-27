#!/usr/bin/env python3
"""1200x750 side-by-side sheets (reference panel left | render right) as small JPEGs.

usage: python3 scripts/sheets.py <outdir> <prefix> <scene>:<render.png> ...
"""
from PIL import Image, ImageDraw
import sys, os

GRID = '/workspace/downloads/starfall-reference-grid.png'
W, H, GUT = 1200, 750, 12
half = (W - GUT) // 2

grid = Image.open(GRID).convert('RGB')
GW, GH = grid.size
sx, sy = GW / 1086, GH / 1448
cols = [(0, round(541 * sx)), (round(545 * sx), GW)]
rows = [(0, round(360 * sy)), (round(364 * sy), round(722 * sy)),
        (round(726 * sy), round(1084 * sy)), (round(1088 * sy), GH)]


def panel(n):
    r, c = (n - 1) // 2, (n - 1) % 2
    (x0, x1), (y0, y1) = cols[c], rows[r]
    return grid.crop((x0, y0, x1, y1))


def crop_to(im, tw, th):
    rw, rh = im.size
    ta = tw / th
    if rw / rh > ta:
        nw = int(rh * ta)
        im = im.crop(((rw - nw) // 2, 0, (rw - nw) // 2 + nw, rh))
    else:
        nh = int(rw / ta)
        im = im.crop((0, (rh - nh) // 2, rw, (rh - nh) // 2 + nh))
    return im.resize((tw, th), Image.LANCZOS)


out, prefix = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
for arg in sys.argv[3:]:
    n_s, path = arg.split(':')
    n = int(n_s)
    l = crop_to(panel(n), half, H)
    r = crop_to(Image.open(path).convert('RGB'), half, H)
    sheet = Image.new('RGB', (W, H), 'white')
    sheet.paste(l, (0, 0))
    sheet.paste(r, (half + GUT, 0))
    d = ImageDraw.Draw(sheet)
    d.text((8, 8), f'REFERENCE  panel {n}', fill='white')
    d.text((half + GUT + 8, 8), f'STARFALL  scene {n}', fill='white')
    p = f'{out}/{prefix}-s{n}.jpg'
    q = 88
    sheet.save(p, 'JPEG', quality=q, optimize=True)
    while os.path.getsize(p) > 350_000 and q > 55:
        q -= 6
        sheet.save(p, 'JPEG', quality=q, optimize=True)
    print(p, f'{os.path.getsize(p)/1024:.0f} KB q{q}')
