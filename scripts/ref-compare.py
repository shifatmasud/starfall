#!/usr/bin/env python3
"""Side-by-side: the reference panel (left) and the SwiftShader shot (right), for scenes given."""
import sys
from PIL import Image

for s in sys.argv[1:]:
    ref = Image.open(f'/home/sprite/ref/ref{s}.png').convert('RGB').resize((525, 350))
    shot = Image.open(f'artifacts/shot-s{s}-1050x700.png').convert('RGB').resize((525, 350))
    c = Image.new('RGB', (1060, 350), (0, 0, 0))
    c.paste(ref, (0, 0))
    c.paste(shot, (535, 0))
    c.save(f'artifacts/compare-s{s}.png')
