"""Turn the HDR render from ci_scene.py into four 8-bit exposures for Chapter 8.

Run inside Blender so the EXR can be read without extra libraries:
    blender -b --python ci_hdr_exposures.py
"""
import os
import bpy
import numpy as np

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'chapters', 'media', 'computational-imaging')
exr = os.path.join(OUT, '_hdr_scene.exr')
im = bpy.data.images.load(exr)
w, h = im.size
rgb = np.array(im.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1, :, :3]
# Downsample 960x540 to 640x360 by area averaging (factor 1.5 via 3x3 -> 2x2 blocks)
small = rgb[: h - h % 3, : w - w % 3].reshape(h // 3, 3, w // 3, 3, 3).mean(axis=(1, 3))
small = np.repeat(np.repeat(small, 2, axis=0), 2, axis=1)
L = 0.2126 * small[..., 0] + 0.7152 * small[..., 1] + 0.0722 * small[..., 2]
scale = 0.18 / np.median(L)

def srgb(v):
    v = np.clip(v, 0, 1)
    return np.where(v <= 0.0031308, v * 12.92, 1.055 * np.power(v, 1 / 2.4) - 0.055)

for ev in (-4, -2, 0, 2):
    img = (srgb(small * scale * 2.0 ** ev) * 255 + 0.5).astype(np.uint8)
    out = bpy.data.images.new('ev%d' % ev, img.shape[1], img.shape[0])
    rgba = np.concatenate([img[::-1] / 255.0, np.ones(img.shape[:2] + (1,))], axis=2)
    out.pixels = rgba.astype(np.float32).ravel()
    out.filepath_raw = os.path.join(OUT, 'hdr_ev%d.jpg' % ev)
    out.file_format = 'JPEG'
    out.save()
os.remove(exr)
