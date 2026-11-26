#!/usr/bin/env python3
"""Score the trail-white QA frames: dark-in-clean pixels that went light and grey in the wake frame."""
import sys
import numpy as np
from PIL import Image

for s in sys.argv[1:]:
    a = np.asarray(Image.open(f'artifacts/trailwhite-s{s}-clean.png').convert('RGB')).astype(float)
    b = np.asarray(Image.open(f'artifacts/trailwhite-s{s}-wake.png').convert('RGB')).astype(float)
    la, lb = a.mean(2), b.mean(2)
    sat = b.max(2) - b.min(2)
    changed = np.abs(b - a).max(2) > 24
    milky = (la < 60) & (lb - la > 35) & (sat < 40)
    print(f'scene {s}: changed px {int(changed.sum())}, milky-white px {int(milky.sum())}')
