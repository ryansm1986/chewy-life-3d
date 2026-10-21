"""ruled crop: python measure/ruled.py x0 y0 x1 y1 scale out.png [step]  (grid lines every `step` sheet px, labelled)"""
import sys
from PIL import Image, ImageDraw
x0, y0, x1, y1 = [int(v) for v in sys.argv[1:5]]; s = float(sys.argv[5]); out = sys.argv[6]
step = int(sys.argv[7]) if len(sys.argv) > 7 else 10
src = sys.argv[8] if len(sys.argv) > 8 else 'refs/sheet.png'
im = Image.open(src).convert('RGB').crop((x0, y0, x1, y1))
im = im.resize((int((x1 - x0) * s), int((y1 - y0) * s)), Image.LANCZOS)
d = ImageDraw.Draw(im)
for x in range((x0 // step + 1) * step, x1, step):
    X = (x - x0) * s; major = x % (step * 5) == 0
    d.line([(X, 0), (X, im.height)], fill=(255, 0, 0) if major else (255, 160, 160), width=1)
    if major: d.text((X + 2, 2), str(x), fill=(200, 0, 0))
for y in range((y0 // step + 1) * step, y1, step):
    Y = (y - y0) * s; major = y % (step * 5) == 0
    d.line([(0, Y), (im.width, Y)], fill=(0, 0, 255) if major else (160, 160, 255), width=1)
    if major: d.text((2, Y + 2), str(y), fill=(0, 0, 200))
im.save(out); print(out, im.size)
