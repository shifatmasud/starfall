#!/usr/bin/env python3
"""Bake a real-world elevation / bathymetry field into a compact, smoothed local data module.

Sources (open data, no key):
  terrarium  AWS Open Data elevation tiles (NASA/USGS SRTM + GMTED, terrarium-encoded PNG)
             https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png
  gebco      GEBCO 2020 bathymetry through opentopodata.org (100 points per request, 1 req/s)

The grid is smoothed with several passes of a separable Gaussian before it is quantised, because the
scenes want gentle, rounded landforms: a real DEM at 30 m carries the ground's own noise and every
spike becomes a facet on a mesh whose whole visible height is a few metres.

    python3 scripts/bake-dem.py dunes terrarium 31.1500 -3.9800 3200 128
    python3 scripts/bake-dem.py meadow terrarium 51.4170 -116.2170 1800 128
    python3 scripts/bake-dem.py seabed gebco 25.0100 -80.3700 240 96

Writes src/scenes/dem/<name>.ts (quantised field + metadata) and artifacts/dem-<name>.png (preview).
"""

import base64
import io
import math
import os
import sys
import time
import urllib.request

import numpy as np
from PIL import Image

OUT_TS = 'src/scenes/dem'
PREVIEW = 'artifacts'
CACHE = '/workspace/tmp/dem'


def tile_xy(lat, lon, z):
    n = 2 ** z
    x = (lon + 180.0) / 360.0 * n
    y = (1.0 - math.log(math.tan(math.radians(lat)) + 1.0 / math.cos(math.radians(lat))) / math.pi) / 2.0 * n
    return x, y


def terrarium(lat, lon, span_m, z=12):
    """Elevation grid covering span_m metres either side of (lat, lon), from terrarium tiles."""
    x, y = tile_xy(lat, lon, z)
    m_per_px = 156543.03392 * math.cos(math.radians(lat)) / (2 ** z)
    r = int(round(span_m / m_per_px))
    px, py = x * 256.0, y * 256.0
    x0, x1 = int((px - r) // 256), int((px + r) // 256)
    y0, y1 = int((py - r) // 256), int((py + r) // 256)
    print(f'  z{z}: {m_per_px:.1f} m/px, {(x1 - x0 + 1) * (y1 - y0 + 1)} tiles')
    w, h = (x1 - x0 + 1) * 256, (y1 - y0 + 1) * 256
    big = Image.new('RGB', (w, h))
    for tx in range(x0, x1 + 1):
        for ty in range(y0, y1 + 1):
            path = f'{CACHE}/{z}_{tx}_{ty}.png'
            if not os.path.exists(path):
                os.makedirs(CACHE, exist_ok=True)
                url = f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{tx}/{ty}.png'
                for attempt in range(5):
                    try:
                        req = urllib.request.Request(url, headers={'User-Agent': 'starfall-dem-bake/1.0'})
                        with urllib.request.urlopen(req, timeout=60) as rr, open(path, 'wb') as f:
                            f.write(rr.read())
                        break
                    except Exception as e:
                        print('   tile retry', tx, ty, e)
                        time.sleep(2 + attempt * 2)
            big.paste(Image.open(path).convert('RGB'), ((tx - x0) * 256, (ty - y0) * 256))
    a = np.asarray(big).astype(np.float32)
    elev = (a[:, :, 0] * 256.0 + a[:, :, 1] + a[:, :, 2] / 256.0) - 32768.0
    cx, cy = int(px - x0 * 256), int(py - y0 * 256)
    elev = elev[max(0, cy - r):cy + r, max(0, cx - r):cx + r]
    return elev


def gebco(lat, lon, span_m, n=96):
    """Bathymetry grid from GEBCO 2020 through opentopodata (100 points per request)."""
    half = span_m / 2.0
    dlat = half / 111320.0
    dlon = half / (111320.0 * math.cos(math.radians(lat)))
    lats = np.linspace(lat + dlat, lat - dlat, n)
    lons = np.linspace(lon - dlon, lon + dlon, n)
    pts = [(la, lo) for la in lats for lo in lons]
    out = []
    for i in range(0, len(pts), 100):
        chunk = pts[i:i + 100]
        locs = '|'.join(f'{la:.6f},{lo:.6f}' for la, lo in chunk)
        url = f'https://api.opentopodata.org/v1/gebco2020?locations={locs}'
        for attempt in range(4):
            try:
                req = urllib.request.Request(url, headers={'User-Agent': 'starfall-dem-bake/1.0'})
                with urllib.request.urlopen(req, timeout=60) as r:
                    data = __import__('json').loads(r.read().decode())
                out.extend(x['elevation'] for x in data['results'])
                break
            except Exception as e:
                print('  retry', i, e)
                time.sleep(3 * (attempt + 1))
        time.sleep(1.1)
    return np.array(out, dtype=np.float32).reshape(n, n)


def gauss_smooth(a, sigma=2.4, passes=3):
    """Multi-pass separable Gaussian: gentle, rounded landforms on the mesh."""
    r = max(1, int(round(sigma * 2.2)))
    x = np.arange(-r, r + 1, dtype=np.float32)
    k = np.exp(-(x ** 2) / (2 * sigma * sigma))
    k /= k.sum()
    out = a.astype(np.float32)
    for _ in range(passes):
        # rows
        pad = np.pad(out, ((0, 0), (r, r)), mode='edge')
        out = np.stack([np.convolve(pad[i], k, mode='valid') for i in range(out.shape[0])])
        # columns
        pad = np.pad(out, ((r, r), (0, 0)), mode='edge')
        out = np.stack([np.convolve(pad[:, j], k, mode='valid') for j in range(out.shape[1])], axis=1)
    return out


def main():
    name, source, lat, lon, span, n = sys.argv[1], sys.argv[2], float(sys.argv[3]), float(sys.argv[4]), float(sys.argv[5]), int(sys.argv[6])
    sigma = float(sys.argv[7]) if len(sys.argv) > 7 else 2.4

    print(f'{name}: {source} at {lat},{lon} span {span} m → {n}×{n}')
    elev = terrarium(lat, lon, span, 13) if source == 'terrarium' else gebco(lat, lon, span, n)
    lo, hi = float(elev.min()), float(elev.max())
    print(f'  raw grid {elev.shape} range {lo:.1f} … {hi:.1f} m')

    if source == 'terrarium':
        img = Image.fromarray(((elev - lo) / max(hi - lo, 1e-6) * 255).astype(np.uint8))
        img = img.resize((n * 2, n * 2), Image.BICUBIC)
        elev = np.asarray(img).astype(np.float32)

    elev = gauss_smooth(elev, sigma=sigma, passes=3)
    # normalise 0..1 on the smoothed field, then quantise to 8 bits
    lo, hi = float(elev.min()), float(elev.max())
    norm = (elev - lo) / max(hi - lo, 1e-6)
    q = np.clip(np.round(norm * 255), 0, 255).astype(np.uint8)

    os.makedirs(OUT_TS, exist_ok=True)
    os.makedirs(PREVIEW, exist_ok=True)
    b64 = base64.b64encode(q.tobytes()).decode()
    ts = f'''/**
 * {name}: a real elevation field, baked and smoothed.
 *
 * Source: {'AWS Open Data terrain tiles (NASA/USGS SRTM + GMTED), terrarium PNG' if source == 'terrarium' else 'GEBCO 2020 bathymetry via opentopodata.org'}
 * at {lat:.4f}, {lon:.4f}, {span:.0f} m across, {n}×{n} samples, smoothed with three passes of a
 * Gaussian (σ = {sigma}) so the mesh carries rounded landforms instead of DEM spikes.
 * Raw range {lo:.1f} … {hi:.1f} m — the field is normalised to 0..1; the scene's `relief` sets the metres.
 * Rebuild: python3 scripts/bake-dem.py {name} {source} {lat} {lon} {span:.0f} {n}
 */
export const DEM = {{
  name: '{name}',
  size: {n},
  spanMeters: {span:.0f},
  source: '{source}',
  origin: [{lat:.4f}, {lon:.4f}] as [number, number],
  data: '{b64}',
}}
'''
    with open(f'{OUT_TS}/{name}.ts', 'w') as f:
        f.write(ts)

    Image.fromarray(q).resize((512, 512), Image.NEAREST).save(f'{PREVIEW}/dem-{name}.png')
    print(f'  wrote {OUT_TS}/{name}.ts ({len(b64) // 1024} KB b64) and {PREVIEW}/dem-{name}.png')
    print(f'  smoothed range {lo:.1f} … {hi:.1f} m')


if __name__ == '__main__':
    main()
