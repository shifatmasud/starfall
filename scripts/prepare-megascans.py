#!/usr/bin/env python3
"""Megascans zip -> web-ready assets.

Megascans ships each asset as a zip with a fixed shape, and the shapes differ by kind:

  plants   <id>_ue_mid.zip        -> standard/<id>_tier_2_nonUE.gltf + .bin + Textures/
  surfaces <id>_2k.zip            -> <Name>_2K_BaseColor.jpg, _Normal.jpg, _Roughness.jpg, ...

This takes those zips straight out of Downloads and lays them out how the site loads them:

  public/models/ms2/<id>/<id>.gltf|.bin|*.jpg     a glTF the browser can load as-is
  public/art/ms/<id>/<base>.jpg, <normal>.jpg     a surface set at 1K
  public/models/ms2/index.json                    what was prepared, and how tall each plant is

Every texture is downsampled to 1024 and re-encoded, because a 2K plant set is tens of MB and the
site only ever shows these at a few hundred pixels.

    python3 scripts/prepare-megascans.py                # every zip in ~/Downloads
    python3 scripts/prepare-megascans.py file.zip ...   # just these
"""
from __future__ import annotations

import json
import os
import re
import shutil
import sys
import tempfile
import zipfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
MODELS = ROOT / 'public/models/ms2'
ART = ROOT / 'public/art/ms'
DOWNLOADS = Path(os.path.expanduser('~/Downloads'))
MAX_TEX = 1024
QUALITY = 86


def slug(text: str) -> str:
    return re.sub(r'[^a-z0-9]+', '_', text.lower()).strip('_')


def shrink(src: Path, dst: Path, max_side: int = MAX_TEX) -> None:
    """Downsample to a web texture, keeping alpha when the source has it."""
    image = Image.open(src)
    has_alpha = image.mode in ('RGBA', 'LA') or (image.mode == 'P' and 'transparency' in image.info)
    image = image.convert('RGBA' if has_alpha else 'RGB')
    if max(image.size) > max_side:
        scale = max_side / max(image.size)
        image = image.resize((max(1, int(image.width * scale)), max(1, int(image.height * scale))), Image.LANCZOS)
    dst.parent.mkdir(parents=True, exist_ok=True)
    if has_alpha:
        image.save(dst.with_suffix('.png'), optimize=True)
    else:
        image.save(dst.with_suffix('.jpg'), quality=QUALITY, optimize=True)


def prepare_plant(zf: zipfile.ZipFile, tmp: Path, ident: str, note: dict) -> dict | None:
    names = zf.namelist()
    # the "nonUE" gltf is the one three can load: no Unreal-only extensions, plain PBR maps
    gltfs = [n for n in names if n.lower().endswith('.gltf')]
    if not gltfs:
        note['skipped'] = 'no glTF in the archive (FBX-only plant)'
        return None
    pick = next((n for n in gltfs if 'nonue' in n.lower()), None) or next(
        (n for n in gltfs if 'standard/' in n.lower()), gltfs[0]
    )
    out = MODELS / ident
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)

    data = json.loads(zf.read(pick))
    data['images'] = data.get('images', [])

    # the nonUE gltf sits in standard/ while its bin and textures sit beside it at the archive root,
    # so everything is flattened into one folder and the uris are rewritten to match
    for name in names:
        if name.endswith('/'):
            continue
        leaf = Path(name).name
        if leaf.lower().endswith(('.bin', '.png', '.jpg', '.jpeg')):
            target = out / leaf
            with zf.open(name) as src, open(target, 'wb') as dst:
                shutil.copyfileobj(src, dst)

    # rewrite every image uri to a texture we actually shrank, and drop Unreal-only extras
    for image in data['images']:
        uri = image.get('uri')
        if not uri:
            continue
        local = out / Path(uri).name
        if not local.exists():
            continue
        shrink(local, local.with_suffix(''))
        shrunk = next(p for p in (local.with_suffix('.jpg'), local.with_suffix('.png')) if p.exists())
        image['uri'] = shrunk.name
        if local.exists() and local.suffix.lower() in ('.png', '.jpg', '.jpeg') and local != shrunk:
            local.unlink()

    for buf in data.get('buffers', []):
        if buf.get('uri'):
            buf['uri'] = Path(buf['uri']).name

    gltf_name = f'{ident}.gltf'
    (out / gltf_name).write_text(json.dumps(data, separators=(',', ':')))

    sizes = sorted(p.stat().st_size for p in out.iterdir())
    return {'kind': 'plant', 'id': ident, 'gltf': f'/models/ms2/{ident}/{gltf_name}', 'bytes': sum(sizes), 'files': len(sizes)}


def prepare_surface(zf: zipfile.ZipFile, tmp: Path, ident: str) -> dict | None:
    names = [n for n in zf.namelist() if n.lower().endswith(('.jpg', '.png'))]
    wanted = {'basecolor': 'base', 'normal': 'normal', 'roughness': 'rough', 'ao': 'ao'}
    found = {}
    for name in names:
        leaf = Path(name).name.lower()
        for key, label in wanted.items():
            if key in leaf:
                found[label] = name
    if 'base' not in found:
        return None
    out = ART / ident
    out.mkdir(parents=True, exist_ok=True)
    made = {}
    for label, name in found.items():
        target = out / f'{ident}_{label}'
        with zf.open(name) as src, tempfile.NamedTemporaryFile(suffix=Path(name).suffix, delete=False) as tmp_file:
            shutil.copyfileobj(src, tmp_file)
            tmp_path = Path(tmp_file.name)
        shrink(tmp_path, target)
        tmp_path.unlink()
        made[label] = next(str(p.relative_to(ROOT / 'public')) for p in (target.with_suffix('.jpg'), target.with_suffix('.png')) if p.exists())
    return {'kind': 'surface', 'id': ident, 'maps': {k: f'/{v}' for k, v in made.items()}}


def main(argv: list[str]) -> None:
    zips = [Path(a) for a in argv] or sorted(DOWNLOADS.glob('*.zip'))
    index: dict = {}
    index_path = MODELS / 'index.json'
    if index_path.exists():
        index = json.loads(index_path.read_text())
    MODELS.mkdir(parents=True, exist_ok=True)
    ART.mkdir(parents=True, exist_ok=True)

    for path in zips:
        if not zipfile.is_zipfile(path):
            continue
        stem = path.stem
        ident = slug(re.sub(r'_(ue_)?(mid|low|high|raw|2k|4k|8k)$', '', stem))
        note: dict = {'from': path.name}
        with zipfile.ZipFile(path) as zf:
            is_plant = any(n.lower().endswith('.gltf') for n in zf.namelist())
            with tempfile.TemporaryDirectory() as tmp:
                entry = (
                    prepare_plant(zf, Path(tmp), ident, note)
                    if is_plant
                    else prepare_surface(zf, Path(tmp), ident)
                )
        if entry:
            entry.update(note)
            index[ident] = entry
            print(f'{ident}: {entry["kind"]}' + (f' {entry["bytes"] / 1e6:.1f} MB' if 'bytes' in entry else ''))
        else:
            print(f'{ident}: skipped ({note.get("skipped", "nothing usable")})')

    index_path.write_text(json.dumps(index, indent=2, sort_keys=True))
    print(f'index: {index_path} ({len(index)} assets)')


if __name__ == '__main__':
    main(sys.argv[1:])
