"""crop a sheet region, upscale, draw a pixel grid labelled in SHEET pixels.  python ruler.py x0 y0 x1 y1 scale step out.png"""
import sys
from PIL import Image, ImageDraw
x0, y0, x1, y1, sc, step = [int(v) for v in sys.argv[1:7]]; out = sys.argv[7]
src = sys.argv[8] if len(sys.argv) > 8 else 'refs/sheet.png'
im = Image.open(src).convert('RGB').crop((x0, y0, x1, y1)); im = im.resize((im.width * sc, im.height * sc), Image.LANCZOS)
d = ImageDraw.Draw(im)
for x in range((x0 // step + 1) * step, x1, step):
    X = (x - x0) * sc; d.line([(X, 0), (X, im.height)], fill=(0, 160, 255) if x % (step * 5) else (255, 0, 0), width=1); d.text((X + 2, 2), str(x), fill=(200, 0, 0))
for y in range((y0 // step + 1) * step, y1, step):
    Y = (y - y0) * sc; d.line([(0, Y), (im.width, Y)], fill=(0, 160, 255) if y % (step * 5) else (255, 0, 0), width=1); d.text((2, Y + 2), str(y), fill=(200, 0, 0))
im.save(out)
