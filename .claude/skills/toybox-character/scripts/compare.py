"""Same-scale side-by-side comparisons for character reviews (the toybox-character skill).

    python .claude/skills/toybox-character/scripts/compare.py OUT.png [--h 420] ITEM [ITEM ...] [--row ITEM ...]

ITEM  = "LABEL::path/to/image.png" or "LABEL::path/to/image.png::x0,y0,x1,y1" (a crop box in that image's pixels).
      "--row" starts a new row (not "/": Git Bash on Windows rewrites a bare "/" into a path). Every tile is scaled to the same height (--h), so crop boxes that frame the same
      thing (e.g. crown to chin) give a true same-scale comparison. Put the sheet on the left, the render on the right.

Example (the sheet's head front vs the model's head render):
    python compare.py cmp-head.png --h 420 "SHEET front::refs/sheet.png::20,575,360,905" "MODEL front::preview/head.png::0,0,640,640"
"""
import sys
from PIL import Image, ImageDraw

def main(argv):
    if len(argv) < 2: print(__doc__); return 2
    out, rest = argv[0], argv[1:]
    h = 420
    if '--h' in rest: i = rest.index('--h'); h = int(rest[i + 1]); del rest[i:i + 2]
    rows, cur = [], []
    for it in rest:
        if it == '--row': rows.append(cur); cur = []; continue
        parts = it.split('::')
        label, path = parts[0], parts[1]
        im = Image.open(path).convert('RGB')
        if len(parts) > 2: im = im.crop(tuple(int(float(v)) for v in parts[2].split(',')))
        im = im.resize((max(1, int(im.width * h / im.height)), h), Image.LANCZOS)
        cur.append((label, im))
    if cur: rows.append(cur)
    pad, top = 10, 30
    W = max(sum(im.width for _, im in r) + pad * (len(r) - 1) for r in rows)
    H = len(rows) * (h + top) + pad * (len(rows) - 1)
    canvas = Image.new('RGB', (W, H), (248, 245, 240)); d = ImageDraw.Draw(canvas)
    y = 0
    for r in rows:
        x = 0
        for label, im in r:
            canvas.paste(im, (x, y + top)); d.text((x + 6, y + 8), label, fill=(40, 30, 30)); x += im.width + pad
        y += h + top + pad
    canvas.save(out); print('saved', out, canvas.size)
    return 0

if __name__ == '__main__': sys.exit(main(sys.argv[1:]))
