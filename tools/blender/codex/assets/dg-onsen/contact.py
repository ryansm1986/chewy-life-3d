# contact sheet: python contact.py out.png img1 img2 ... (each scaled to width W, 2 columns)
import sys
from PIL import Image
out, ims = sys.argv[1], sys.argv[2:]
W = int(900); cols = 2 if len(ims) > 1 else 1
tiles = []
for p in ims:
    im = Image.open(p).convert('RGB'); h = int(im.height * W / im.width); tiles.append(im.resize((W, h)))
rows = [tiles[i:i + cols] for i in range(0, len(tiles), cols)]
H = sum(max(t.height for t in r) for r in rows)
sheet = Image.new('RGB', (W * cols, H), (255, 255, 255)); y = 0
for r in rows:
    for i, t in enumerate(r): sheet.paste(t, (i * W, y))
    y += max(t.height for t in r)
sheet.save(out)
