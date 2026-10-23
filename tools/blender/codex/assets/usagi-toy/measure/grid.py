import sys
from PIL import Image, ImageDraw
src, out, x0, y0, x1, y1, sc = sys.argv[1], sys.argv[2], *map(int, sys.argv[3:8])
step = int(sys.argv[8]) if len(sys.argv) > 8 else 10
im = Image.open(src).convert('RGB').crop((x0, y0, x1, y1)); im = im.resize((im.width * sc, im.height * sc), Image.LANCZOS)
d = ImageDraw.Draw(im)
for x in range((x0 // step + 1) * step, x1, step):
    X = (x - x0) * sc; d.line([(X, 0), (X, im.height)], fill=(0, 160, 255) if x % (step * 5) else (255, 0, 0), width=1)
    if x % (step * 5) == 0: d.text((X + 2, 2), str(x), fill=(255, 0, 0))
for y in range((y0 // step + 1) * step, y1, step):
    Y = (y - y0) * sc; d.line([(0, Y), (im.width, Y)], fill=(0, 160, 255) if y % (step * 5) else (255, 0, 0), width=1)
    if y % (step * 5) == 0: d.text((2, Y + 2), str(y), fill=(255, 0, 0))
im.save(out)
