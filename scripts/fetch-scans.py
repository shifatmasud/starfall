#!/usr/bin/env python3
"""
Fetch the scanned assets the painted-world scenes (3–8) are built from, and pack them for the web.

Sources (all CC0, all real captures):
  - Poly Haven HDRIs (photographed skies/backplates) → ACES-tonemapped 2048×1024 WebP backplates
  - Poly Haven photogrammetry models (rocks, moss, stumps, ferns, grass, trees, boulders, shells)
  - Smithsonian Open Access 3D (CC0 photogrammetry of museum coral specimens)

Models are packed with gltf-transform: textures to WebP at ≤512px, geometry welded and simplified,
meshopt-compressed, so each lands at a few hundred kB. Output: public/scans/{hdri,models}/, committed
as real binaries. Each model then gets a React component from gltfjsx (src/scans/models/*.tsx):

  npx gltfjsx public/scans/models/<name>.glb -t -k -r public -o src/scans/models/<Name>.tsx

  python3 scripts/fetch-scans.py            # everything
  python3 scripts/fetch-scans.py models     # models only
"""
import base64
import json
import os
import subprocess
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'scans')
TMP = '/tmp/starfall-scans'
GT = os.environ.get('GLTF_TRANSFORM', 'gltf-transform')
UA = {'User-Agent': 'Mozilla/5.0 starfall-asset-fetch'}

HDRIS = ['forest_slope', 'alps_field', 'goegap', 'white_cliff_top']

# Poly Haven model id -> simplify ratio (fraction of triangles kept)
PH_MODELS = {
    'rock_moss_set_02': 0.25,
    'moss_01': 0.35,
    'tree_stump_01': 0.25,
    'fern_02': 0.5,
    'root_cluster_01': 0.3,
    'grass_medium_01': 0.5,
    'namaqualand_boulder_02': 0.25,
    'quiver_tree_01': 0.35,
    'coast_rocks_05': 0.25,
    'sand_rocks_small_01': 0.3,
    'lambis_shell': 0.4,
    'dandelion_01': 0.5,
}

# Smithsonian CC0 coral photogrammetry (draco 100k/2048 builds)
SI_MODELS = {
    'coral_pocillopora': 'https://3d-api.si.edu/content/document/3d_package:16d816f9-4b38-45f5-8add-151182f9a5c4/resources/usnm_89696-100k-2048_std_draco.glb',
    'coral_acropora': 'https://3d-api.si.edu/content/document/3d_package:0d426cfe-ae64-493e-9f75-3b1d52017e93/resources/Acropora_palifera_forma_beta-100k-2048_std_draco.glb',
    'coral_porites': 'https://3d-api.si.edu/content/document/3d_package:6441c4a9-5558-4192-8192-0a0568c00426/resources/Porites_divaricata-100k-2048_std_draco.glb',
    'coral_favia': 'https://3d-api.si.edu/content/document/3d_package:3def62b5-8f86-43e9-8fb3-10e1405f006d/resources/Favia_danai-100k-2048_std_draco.glb',
}


def get(url, path):
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return path
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r, open(path, 'wb') as f:
        f.write(r.read())
    return path


def api(path):
    with urllib.request.urlopen(urllib.request.Request('https://api.polyhaven.com/' + path, headers=UA), timeout=60) as r:
        return json.load(r)


def b64(path):
    with open(path, 'rb') as f, open(path + '.b64', 'w') as o:
        o.write(base64.b64encode(f.read()).decode())


def hdris():
    import cv2
    import numpy as np
    os.makedirs(os.path.join(OUT, 'hdri'), exist_ok=True)
    for name in HDRIS:
        url = api('files/' + name)['hdri']['2k']['hdr']['url']
        src = get(url, f'{TMP}/hdri/{name}.hdr')
        im = cv2.imread(src, cv2.IMREAD_ANYDEPTH | cv2.IMREAD_COLOR).astype(np.float32)
        x = im * (0.18 / float(np.median(im.mean(2))))
        y = np.clip((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0, 1)  # ACES fit
        y = np.where(y <= 0.0031308, 12.92 * y, 1.055 * np.power(y, 1 / 2.4) - 0.055)
        out = cv2.resize((y * 255 + 0.5).astype(np.uint8), (2048, 1024), interpolation=cv2.INTER_AREA)
        dst = os.path.join(OUT, 'hdri', name + '.webp')
        cv2.imwrite(dst, out, [cv2.IMWRITE_WEBP_QUALITY, 80])
        print('hdri', name, os.path.getsize(dst))


def pack(src, dst, ratio):
    steps = [
        [GT, 'dedup', src, dst],
        [GT, 'weld', dst, dst],
        [GT, 'simplify', dst, dst, '--ratio', str(ratio), '--error', '0.002'],
        [GT, 'resize', dst, dst, '--width', '512', '--height', '512'],
        [GT, 'webp', dst, dst, '--quality', '80'],
        [GT, 'meshopt', dst, dst],
    ]
    for s in steps:
        subprocess.run(s, check=True, stdout=subprocess.DEVNULL)


def models():
    os.makedirs(os.path.join(OUT, 'models'), exist_ok=True)
    for name, ratio in PH_MODELS.items():
        g = api('files/' + name)['gltf']['1k']['gltf']
        base = f'{TMP}/ph/{name}'
        src = get(g['url'], f'{base}/{name}.gltf')
        for rel, inc in g['include'].items():
            get(inc['url'], os.path.join(base, rel))
        dst = os.path.join(OUT, 'models', name + '.glb')
        pack(src, dst, ratio)
        print('model', name, os.path.getsize(dst))
    for name, url in SI_MODELS.items():
        src = get(url, f'{TMP}/si/{name}.glb')
        dst = os.path.join(OUT, 'models', name + '.glb')
        pack(src, dst, 0.12)
        print('model', name, os.path.getsize(dst))


if __name__ == '__main__':
    which = sys.argv[1:] or ['hdri', 'models']
    if 'hdri' in which:
        hdris()
    if 'models' in which:
        models()
