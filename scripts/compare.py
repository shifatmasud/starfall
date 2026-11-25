from PIL import Image
import sys

# python3 scripts/compare.py render.png [plate.png]
render = Image.open(sys.argv[1]).convert('RGB')
plate = Image.open(sys.argv[2] if len(sys.argv) > 2 else 'downloads/ref-panel-2.png').convert('RGB')

REGIONS = {
    'sky_top': (0.42, 0.02, 0.58, 0.10),
    'sky_left': (0.04, 0.10, 0.16, 0.20),
    'sun_halo': (0.40, 0.12, 0.54, 0.22),
    'horizon_left': (0.02, 0.38, 0.14, 0.46),
    'cloud_lit': (0.30, 0.52, 0.42, 0.60),
    'cloud_mid': (0.12, 0.62, 0.26, 0.72),
    'cloud_shadow': (0.55, 0.70, 0.68, 0.82),
    'fg_cloud': (0.04, 0.86, 0.20, 0.96),
    'range': (0.76, 0.34, 0.92, 0.44),
}


def stats(im, box):
    w, h = im.size
    x0, y0, x1, y1 = [int(v * (w if i % 2 == 0 else h)) for i, v in enumerate(box)]
    px = list(im.crop((x0, y0, x1, y1)).getdata())
    n = len(px)
    mean = tuple(round(sum(p[i] for p in px) / n) for i in range(3))
    lum = sorted(0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2] for p in px)
    return mean, round(lum[int(n * 0.1)]), round(lum[int(n * 0.9)])


print(f'{"region":14s} {"render mean":18s} {"p10/p90":11s} | {"plate mean":18s} {"p10/p90"}')
for name, box in REGIONS.items():
    rm, r10, r90 = stats(render, box)
    pm, p10, p90 = stats(plate, box)
    print(f'{name:14s} {str(rm):18s} {r10:3d}/{r90:3d}    | {str(pm):18s} {p10:3d}/{p90:3d}')

overall = stats(render, (0, 0, 1, 1))
print('\noverall render', overall, 'plate', stats(plate, (0, 0, 1, 1)))
