"""The one sky every scene shares: public/scans/hdri/clear-sky.webp(.b64).

Source: Poly Haven `syferfontein_18d_clear_puresky` (CC0), its tonemapped JPG: a photographed
cloudless sky, sun 18 degrees up, land already removed by Poly Haven. Here the thin brown haze line
at the horizon is graded out to a pale clear band, and the lower hemisphere is the sky mirrored and
dimmed toward the nadir, so the map holds no land and no cloud.

    python3 scripts/build-sky.py
"""

import base64
import urllib.request

import numpy as np
from PIL import Image

SRC = 'https://dl.polyhaven.org/file/ph-assets/HDRIs/extra/Tonemapped%20JPG/syferfontein_18d_clear_puresky.jpg'
OUT = 'public/scans/hdri/clear-sky.webp'

urllib.request.urlretrieve(SRC, '/tmp/clear-sky-src.jpg')
im = Image.open('/tmp/clear-sky-src.jpg').convert('RGB').resize((2048, 1024), Image.LANCZOS)
a = np.asarray(im).astype(float)
H = a.shape[0]
h = H // 2
up = a[:h].copy()
r0 = int(H * 0.425)
base = up[r0].copy()
# smooth the row along the horizon (circular box blur, 64 px) so nothing of the band survives
k = 64
ext = np.concatenate([base[-k:], base, base[:k]], 0)
cs = np.cumsum(ext, 0)
base = ((cs[2 * k:] - cs[:-2 * k]) / (2 * k))[:a.shape[1]]
if base.shape[0] < a.shape[1]:
    base = np.concatenate([base, base[-1:]], 0)
pale = base * 0.75 + np.array([235, 242, 250]) * 0.25
for y in range(r0, h):
    t = (y - r0) / (h - r0)
    t = t * t * (3 - 2 * t)
    w = min(1, (y - r0) / 6)
    up[y] = up[y] * (1 - w) + (base * (1 - t) + pale * t) * w
low = up[::-1].copy() * np.linspace(1.0, 0.82, h)[:, None, None]
out = np.concatenate([up, low], 0).clip(0, 255).astype(np.uint8)
Image.fromarray(out).resize((1024, 512), Image.LANCZOS).save(OUT, quality=72, method=6)
open(OUT + '.b64', 'w').write(base64.b64encode(open(OUT, 'rb').read()).decode())
print('wrote', OUT)
