"""Resize a Flux panorama to 2048x1024 and blend the left/right edges so it wraps without a seam.
Usage: python pano.py in.png out.webp"""
import sys
import numpy as np
from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
im = Image.open(src).convert("RGB").resize((2048, 1024), Image.LANCZOS)
a = np.asarray(im, dtype=np.float32)
h, w, _ = a.shape
shifted = np.roll(a, w // 2, axis=1)  # seam now at the centre, edges continuous
x = np.linspace(0, 1, w)
d = np.abs(x - 0.5) * 2  # 0 at centre, 1 at edges
band = 0.30
wt = np.clip((1 - d) / band, 0, 1)  # weight of the original: 1 in the middle, 0 at the edges
wt = wt * wt * (3 - 2 * wt)
out = a * wt[None, :, None] + shifted * (1 - wt)[None, :, None]
Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save(dst, "WEBP", quality=85)
