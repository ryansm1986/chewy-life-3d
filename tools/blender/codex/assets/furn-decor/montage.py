# montage.py out.png in1.png in2.png ... : a labelled contact sheet (3 per row)
import sys
from PIL import Image, ImageDraw
out, ins = sys.argv[1], sys.argv[2:]
S = 460; cols = min(3, len(ins)); rows = (len(ins) + cols - 1) // cols
sheet = Image.new('RGB', (cols * S, rows * S), (250, 246, 240)); d = ImageDraw.Draw(sheet)
for i, p in enumerate(ins):
    im = Image.open(p).convert('RGB'); im.thumbnail((S, S))
    x, y = (i % cols) * S, (i // cols) * S
    sheet.paste(im, (x, y)); d.text((x + 6, y + 6), p.split('/')[-1], fill=(40, 30, 40))
sheet.save(out)
