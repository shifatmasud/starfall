"""Build the range's heightmap from real scanned elevation data.

Source: AWS Open Data — Terrain Tiles (`elevation-tiles-prod`), terrarium-encoded PNG, derived from
NASA/USGS SRTM + GMTED. Tiles for the Matterhorn / Monte Rosa massif at zoom 12 (≈26 m per pixel).

    python3 scripts/build-dem.py

Writes `public/tex/dem/alps-h.webp` (heightmap, 0 = lowest point in the crop, 255 = highest) and
`public/tex/dem/alps-small.webp` for phones, plus prints the crop's real elevation range, which the
scene needs in order to put the snow line where the real one is.
"""

import io
import math
import os
import urllib.request

from PIL import Image
import numpy as np

Z = 12
CENTER = (45.9763, 7.6586)  # the Matterhorn
SPAN = 2  # tiles either side of the centre tile
OUT = 'public/tex/dem'


def tile_xy(lat, lon, z):
    n = 2 ** z
    x = (lon + 180.0) / 360.0 * n
    y = (1.0 - math.log(math.tan(math.radians(lat)) + 1.0 / math.cos(math.radians(lat))) / math.pi) / 2.0 * n
    return x, y


def fetch(tx, ty):
    cache = f'/workspace/tmp/dem/{Z}_{tx}_{ty}.png'
    if not os.path.exists(cache):
        url = f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{Z}/{tx}/{ty}.png'
        os.makedirs('/workspace/tmp/dem', exist_ok=True)
        urllib.request.urlretrieve(url, cache)
    return Image.open(cache).convert('RGB')


def main():
    x, y = tile_xy(*CENTER, Z)
    tx, ty = int(x), int(y)
    tiles = {}
    for dx in range(-SPAN, SPAN + 1):
        for dy in range(-SPAN, SPAN + 1):
            tiles[(dx, dy)] = fetch(tx + dx, ty + dy)

    w = 256 * (2 * SPAN + 1)
    big = Image.new('RGB', (w, w))
    for (dx, dy), im in tiles.items():
        big.paste(im, ((dx + SPAN) * 256, (dy + SPAN) * 256))

    a = np.asarray(big).astype(np.float32)
    elev = (a[:, :, 0] * 256 + a[:, :, 1] + a[:, :, 2] / 256.0) - 32768.0

    # the range as the picture needs it: a wide band around the massif, the ridge across the top
    cur_x, cur_y = int((x - (tx - SPAN)) * 256), int((y - (ty - SPAN)) * 256)
    half_w, top, height = 640, cur_y - 210, 300
    crop = elev[top:top + height, cur_x - half_w // 2:cur_x + half_w // 2]
    lo, hi = float(crop.min()), float(crop.max())
    print(f'crop {crop.shape} elevation {lo:.0f} m .. {hi:.0f} m')

    norm = np.clip((crop - lo) / (hi - lo), 0, 1)
    # a hair of smoothing: SRTM at this zoom carries some pixel noise, and a distant range should not
    norm = (norm[:-2, :-2] * 0.25 + norm[1:-1, :-2] * 0.25 + norm[:-2, 1:-1] * 0.25 + norm[1:-1, 1:-1] * 0.25)
    # two more smoothing passes: at this distance the SRTM's own pixel steps read as creases in the
    # light, and a range fifteen kilometres away has no such texture
    for _ in range(2):
        norm = (np.roll(norm, 1, 0) + norm + np.roll(norm, -1, 0)) / 3.0
        norm = (np.roll(norm, 1, 1) + norm + np.roll(norm, -1, 1)) / 3.0

    os.makedirs(OUT, exist_ok=True)
    for name, size in (('alps-h.webp', (768, 360)), ('alps-h-small.webp', (384, 180))):
        im = Image.fromarray((norm * 255).astype(np.uint8), 'L').resize(size, Image.LANCZOS)
        buf = io.BytesIO()
        im.save(buf, 'WEBP', quality=92, method=6)
        open(os.path.join(OUT, name), 'wb').write(buf.getvalue())
        print(name, f'{len(buf.getvalue()) // 1024} KB', im.size)

    print(f'norm lo={lo:.1f} hi={hi:.1f}')


def peak():
    """Scene 2's lone summit: the Matterhorn alone, a tight square crop around its real summit at zoom
    13 (~13 m per pixel), so its pyramid and its ridges are the mountain's own. Writes
    public/tex/dem/matterhorn-h.webp (square, 0 = lowest in the crop, 255 = the summit)."""
    global Z
    Z = 13
    x, y = tile_xy(45.9763, 7.6586, Z)
    tx, ty = int(x), int(y)
    big = Image.new('RGB', (768, 768))
    for dx in range(-1, 2):
        for dy in range(-1, 2):
            big.paste(fetch(tx + dx, ty + dy), ((dx + 1) * 256, (dy + 1) * 256))
    a = np.asarray(big).astype(np.float32)
    elev = (a[:, :, 0] * 256 + a[:, :, 1] + a[:, :, 2] / 256.0) - 32768.0
    cx, cy = int((x - (tx - 1)) * 256), int((y - (ty - 1)) * 256)
    # snap to the true summit (the highest pixel near the coordinate)
    win = elev[cy - 20:cy + 20, cx - 20:cx + 20]
    sy, sx = np.unravel_index(win.argmax(), win.shape)
    cy, cx = cy - 20 + sy, cx - 20 + sx
    half = 160
    crop = elev[cy - half:cy + half, cx - half:cx + half]
    lo, hi = float(crop.min()), float(crop.max())
    print(f'peak crop {crop.shape} elevation {lo:.0f} m .. {hi:.0f} m')
    norm = np.clip((crop - lo) / (hi - lo), 0, 1)
    im = Image.fromarray((norm * 255).astype(np.uint8), 'L').resize((256, 256), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, 'WEBP', quality=94, method=6)
    os.makedirs(OUT, exist_ok=True)
    open(os.path.join(OUT, 'matterhorn-h.webp'), 'wb').write(buf.getvalue())
    print('matterhorn-h.webp', len(buf.getvalue()), 'bytes')


if __name__ == '__main__':
    import sys
    if 'peak' in sys.argv:
        peak()
    else:
        main()
