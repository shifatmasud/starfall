"""Reference panel left, render right, one row per scene.

python3 scripts/side-by-side.py <grid.png> <prefix> <out.png> [scenes]
The grid is 2 columns x 4 rows; panel N is row (N-1)//2, column (N-1)%2.
Renders are read from artifacts/<prefix>-s<N>.png.
Also writes artifacts/ref-panel-<N>.png and prints a mean colour distance per scene.
"""
import sys
from PIL import Image, ImageDraw
import numpy as np

grid = Image.open(sys.argv[1]).convert('RGB')
prefix, out = sys.argv[2], sys.argv[3]
scenes = [int(s) for s in sys.argv[4].split(',')] if len(sys.argv) > 4 else list(range(1, 9))
W, H = grid.size

# the grid's gutters are thin black lines: columns split at x=542-543, rows at 361-362, 723-724, 1085-1086
sx, sy = W / 1086, H / 1448
cols = [(0, round(541 * sx)), (round(545 * sx), W)]
rows = [(0, round(360 * sy)), (round(364 * sy), round(722 * sy)), (round(726 * sy), round(1084 * sy)), (round(1088 * sy), H)]

panels = {}
for n in range(1, 9):
    r, c = (n - 1) // 2, (n - 1) % 2
    (x0, x1), (y0, y1) = cols[c], rows[r]
    p = grid.crop((x0, y0, x1, y1))
    p.save(f'artifacts/ref-panel-{n}.png')
    panels[n] = p

pw, ph = panels[1].size
sheet = Image.new('RGB', (pw * 2 + 12, (ph + 6) * len(scenes)), 'white')
d = ImageDraw.Draw(sheet)
for i, n in enumerate(scenes):
    ref = panels[n].resize((pw, ph))
    try:
        ren = Image.open(f'artifacts/{prefix}-s{n}.png').convert('RGB')
    except FileNotFoundError:
        ren = Image.new('RGB', (pw, ph), 'black')
    # centre-crop the render to the panel aspect
    rw, rh = ren.size
    ta = pw / ph
    if rw / rh > ta:
        nw = int(rh * ta); ren = ren.crop(((rw - nw) // 2, 0, (rw - nw) // 2 + nw, rh))
    else:
        nh = int(rw / ta); ren = ren.crop((0, (rh - nh) // 2, rw, (rh - nh) // 2 + nh))
    ren = ren.resize((pw, ph), Image.LANCZOS)
    y = i * (ph + 6)
    sheet.paste(ref, (0, y))
    sheet.paste(ren, (pw + 12, y))
    d.text((6, y + 4), f'ref {n}', fill='white')
    d.text((pw + 18, y + 4), f'render {n}', fill='white')
    a = np.asarray(ref.resize((64, 43))).astype(float)
    b = np.asarray(ren.resize((64, 43))).astype(float)
    print(f'scene {n}: mean |diff| {np.abs(a - b).mean():.1f}  ref mean {a.reshape(-1,3).mean(0).round()}  render mean {b.reshape(-1,3).mean(0).round()}')
sheet.save(out)
print('wrote', out, sheet.size)
