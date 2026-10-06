# Contact sheet: python tools/qa/sheet.py <list.txt (path<TAB>label per line)> <out.png> [cols] [cell px]
import sys
from PIL import Image, ImageDraw, ImageFont

lst, out = sys.argv[1], sys.argv[2]
cols = int(sys.argv[3]) if len(sys.argv) > 3 else 4
cell = int(sys.argv[4]) if len(sys.argv) > 4 else 400
rows = [l.rstrip('\n').split('\t') for l in open(lst, encoding='utf-8') if l.strip()]
try:
    font = ImageFont.truetype('C:/Windows/Fonts/segoeuib.ttf', 17)
except Exception:
    font = ImageFont.load_default()
n = len(rows)
R = (n + cols - 1) // cols
S = Image.new('RGB', (cols * cell, R * (cell + 24)), '#241a24')
d = ImageDraw.Draw(S)
for i, (f, *lab) in enumerate(rows):
    x, y = (i % cols) * cell, (i // cols) * (cell + 24)
    try:
        im = Image.open(f).convert('RGB')
        im.thumbnail((cell, cell))
        S.paste(im, (x + (cell - im.width) // 2, y + 24))
    except Exception as e:
        d.text((x + 6, y + 40), str(e), fill='#ff8080', font=font)
    d.text((x + 6, y + 3), lab[0] if lab else '', fill='#fff6e8', font=font)
S.save(out)
print(out)
