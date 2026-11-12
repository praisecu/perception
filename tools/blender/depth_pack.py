"""Pack depth_mm.bin (from depth_scene.py) into depth16.png: red = high byte,
green = low byte of the depth in millimetres. Run with regular Python."""
import os
import numpy as np
from PIL import Image

here = os.path.dirname(os.path.abspath(__file__))
out = os.path.join(here, "..", "..", "chapters", "media", "learned-depth")
W, H = 480, 270
mm = np.fromfile(os.path.join(out, "depth_mm.bin"), dtype="<u2").reshape(H, W)
rgb = np.zeros((H, W, 3), np.uint8)
rgb[..., 0] = mm >> 8
rgb[..., 1] = mm & 255
Image.fromarray(rgb).save(os.path.join(out, "depth16.png"), optimize=True)
os.remove(os.path.join(out, "depth_mm.bin"))
print("depth range (m):", mm[mm < 19000].min() / 1000, mm[mm < 19000].max() / 1000)
