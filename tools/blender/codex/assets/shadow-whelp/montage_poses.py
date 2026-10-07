"""Labelled pose sheets from poses/*.png and pose-check.json.
    python montage_poses.py -> preview/poses.png (every pose: game camera | side) and preview/poses-flying.png"""
import json, os
from PIL import Image, ImageDraw
T = os.path.dirname(os.path.abspath(__file__)); P = os.path.join(T, 'poses'); O = os.path.join(T, 'preview')
chk = json.load(open(os.path.join(T, 'pose-check.json')))['poses']
def sheet(names, out, cols=4):
    tiles = []
    for n in names:
        r = chk[n]; tag = 'fur through costume: %d%s' % (r['fur_through_costume'], ' (must be 0)' if r['must_be_zero'] else '')
        if r['ear_piping_triangle_overlaps']: tag += ' | ear-piping overlaps: %d' % r['ear_piping_triangle_overlaps']
        for s in ('game', 'side'):
            tiles.append(('%s, %s, wings %+d' % (r['label'], 'game 45' if s == 'game' else 'side', r['flap_deg']), tag, Image.open(os.path.join(P, '%s_%s.png' % (n, s))).convert('RGB')))
    w, h = tiles[0][2].size; rows = (len(tiles) + cols - 1) // cols
    canvas = Image.new('RGB', (cols * w, rows * (h + 34)), (250, 248, 244)); d = ImageDraw.Draw(canvas)
    for k, (lab, tag, im) in enumerate(tiles):
        x, y = (k % cols) * w, (k // cols) * (h + 34)
        canvas.paste(im, (x, y + 34)); d.text((x + 6, y + 4), lab, fill=(40, 30, 30)); d.text((x + 6, y + 18), tag, fill=(150, 40, 40) if 'through costume: 0' not in tag else (40, 110, 60))
    canvas.save(out); print('saved', out, canvas.size)
sheet([n for n in chk if not n.startswith('fly')], os.path.join(O, 'poses.png'))
sheet([n for n in chk if n.startswith('fly')], os.path.join(O, 'poses-flying.png'), cols=2)
