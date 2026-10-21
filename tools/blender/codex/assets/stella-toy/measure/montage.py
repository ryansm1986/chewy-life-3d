"""python measure/montage.py OUT.png H img1 img2 ...  (side by side, each scaled to height H)"""
import sys
from PIL import Image
out, h = sys.argv[1], int(sys.argv[2]); ims = [Image.open(p).convert('RGB') for p in sys.argv[3:]]
ims = [im.resize((int(im.width * h / im.height), h), Image.LANCZOS) for im in ims]
c = Image.new('RGB', (sum(i.width for i in ims) + 6 * (len(ims) - 1), h), (255, 255, 255)); x = 0
for im in ims: c.paste(im, (x, 0)); x += im.width + 6
c.save(out); print(out, c.size)
