"""Heightmaps for the scenes' terrain, from real elevation data only.

Source: AWS Open Data Terrain Tiles (`elevation-tiles-prod`, terrarium PNG; SRTM, GMTED, ETOPO and
national DEMs). Each site is a real place, cropped and normalised to 0..255, written as a small
greyscale webp under public/tex/dem/. The real elevation range of the crop is printed so a scene can
keep the true relief.

    python3 scripts/build-terrain.py [site ...]
"""

import io
import math
import os
import sys
import urllib.request

import numpy as np
from PIL import Image

CACHE = '/tmp/dem-tiles'
OUT = 'public/tex/dem'

# name: (lat, lon, zoom, crop width px, crop height px, out width, out height, smoothing passes)
SITES = {
    # Scene 6: the ice-clad Saint Elias front behind Disenchantment Bay, Alaska (USGS NED)
    'icefront': (60.10, -139.55, 10, 900, 300, 512, 170, 1),
    # Scene 4: the Bernese Alps (Eiger, Moench, Jungfrau) as the far range across the lake
    'alps': (46.56, 7.98, 10, 1000, 260, 320, 84, 2),
    # Scene 4: the wooded Harder ridge above Lake Brienz, the near hillside on the right
    'ridge': (46.71, 7.90, 12, 500, 300, 256, 154, 1),
    # Scene 4: the meadow bank, the gentle pasture of the Bödeli plain at Interlaken
    'meadow': (46.68, 7.86, 14, 300, 160, 192, 102, 2),
}


def tile_xy(lat, lon, z):
    n = 2 ** z
    x = (lon + 180.0) / 360.0 * n
    y = (1.0 - math.log(math.tan(math.radians(lat)) + 1.0 / math.cos(math.radians(lat))) / math.pi) / 2.0 * n
    return x, y


def fetch(z, tx, ty):
    path = f'{CACHE}/{z}_{tx}_{ty}.png'
    if not os.path.exists(path):
        os.makedirs(CACHE, exist_ok=True)
        urllib.request.urlretrieve(f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{tx}/{ty}.png', path)
    a = np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
    return a[:, :, 0] * 256 + a[:, :, 1] + a[:, :, 2] / 256.0 - 32768.0


def build(name):
    lat, lon, z, cw, ch, ow, oh, smooth = SITES[name]
    x, y = tile_xy(lat, lon, z)
    px, py = int(x * 256), int(y * 256)
    x0, y0 = px - cw // 2, py - ch // 2
    tx0, ty0, tx1, ty1 = x0 // 256, y0 // 256, (x0 + cw) // 256, (y0 + ch) // 256
    rows = [np.concatenate([fetch(z, tx, ty) for tx in range(tx0, tx1 + 1)], 1) for ty in range(ty0, ty1 + 1)]
    big = np.concatenate(rows, 0)
    crop = big[y0 - ty0 * 256:y0 - ty0 * 256 + ch, x0 - tx0 * 256:x0 - tx0 * 256 + cw]
    crop = np.maximum(crop, 0.0)  # the sea is sea level
    lo, hi = float(crop.min()), float(crop.max())
    norm = (crop - lo) / max(1.0, hi - lo)
    for _ in range(smooth):
        norm = (np.roll(norm, 1, 0) + norm + np.roll(norm, -1, 0)) / 3.0
        norm = (np.roll(norm, 1, 1) + norm + np.roll(norm, -1, 1)) / 3.0
    m_per_px = 156543.03 * math.cos(math.radians(lat)) / 2 ** z
    im = Image.fromarray((norm.clip(0, 1) * 255).astype(np.uint8), 'L').resize((ow, oh), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, 'WEBP', quality=90, method=6)
    os.makedirs(OUT, exist_ok=True)
    open(f'{OUT}/{name}-h.webp', 'wb').write(buf.getvalue())
    print(f'{name}: {cw * m_per_px / 1000:.1f} x {ch * m_per_px / 1000:.1f} km, {lo:.0f}..{hi:.0f} m, {len(buf.getvalue())} bytes')


if __name__ == '__main__':
    for n in sys.argv[1:] or SITES:
        build(n)
