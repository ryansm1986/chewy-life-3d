# Renders the plan preview written by plan-map.mjs: python plan-map.py data.json out.png
import base64, json, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont

d = json.load(open(sys.argv[1]))
W, PX = d['W'], 4
tiles = np.frombuffer(base64.b64decode(d['tiles']), dtype=np.uint8).reshape(W, W)
h = np.frombuffer(base64.b64decode(d['h']), dtype=np.float32).reshape(W, W)
sl = np.frombuffer(base64.b64decode(d['slope']), dtype=np.float32).reshape(W, W)

img = np.zeros((W, W, 3), np.float32)
grass = np.array([0.56, 0.80, 0.42]); hi = np.array([0.42, 0.62, 0.36])
k = np.clip((h - 1.0) / 8.0, 0, 1)[..., None]
img[:] = grass * (1 - k) + hi * k
img[tiles == 4] = [0.96, 0.88, 0.66]
img[tiles == 5] = [0.72, 0.66, 0.70]
img[tiles == 1] = [0.93, 0.85, 0.72]
img[tiles == 2] = [0.99, 0.94, 0.86]
img[tiles == 3] = [0.62, 0.45, 0.32]
deep = np.clip(-h / 1.2, 0, 1)[..., None]
water = np.array([0.45, 0.80, 0.92]) * (1 - deep) + np.array([0.20, 0.52, 0.78]) * deep
img = np.where((tiles == 6)[..., None], water, img)
if 'keep' in d:  # tree keep-out: a faint warm tint
    keep = np.frombuffer(base64.b64decode(d['keep']), dtype=np.uint8).reshape(W, W)
    img = np.where(((keep == 1) & (tiles == 0))[..., None], img * 0.55 + np.array([0.98, 0.72, 0.35]) * 0.45, img)
# hillshade from the north-west
gx = np.gradient(h, axis=1); gz = np.gradient(h, axis=0)
shade = np.clip(1 + (-gx - gz) * 0.35, 0.7, 1.25)[..., None]
img = np.clip(img * shade, 0, 1)
im = Image.fromarray((img * 255).astype(np.uint8)).resize((W * PX, W * PX), Image.NEAREST).convert('RGBA')
ov = Image.new('RGBA', im.size, (0, 0, 0, 0))
dr = ImageDraw.Draw(ov)
try:
    font = ImageFont.truetype('arial.ttf', 11); big = ImageFont.truetype('arialbd.ttf', 15)
except Exception:
    font = big = ImageFont.load_default()
P = lambda x, z: (x * PX, z * PX)
# contours every metre
for lv in range(1, 12):
    m = (h >= lv)
    edge = (m[1:, 1:] != m[:-1, 1:]) | (m[1:, 1:] != m[1:, :-1])
    zs, xs = np.nonzero(edge)
    for z, x in zip(zs, xs):
        dr.point(P(x + 1, z + 1), fill=(60, 70, 50, 90))
# grid every 16 m
for g in range(0, W + 1, 16):
    dr.line([P(g, 0), P(g, W)], fill=(0, 0, 0, 28)); dr.line([P(0, g), P(W, g)], fill=(0, 0, 0, 28))
    dr.text(P(g + 0.3, 0.3), str(g), fill=(0, 0, 0, 120), font=font); dr.text(P(0.3, g + 0.3), str(g), fill=(0, 0, 0, 120), font=font)
# green belts
for b in d['belts']:
    pts = [P(x, z) for x, z in b['pts']]
    dr.line(pts, fill=(40, 120, 50, 70), width=int(b['r'] * 2 * PX), joint='curve')
# streets: open ones are painted tiles; locked stubs dashed
for s in d['streets']:
    pts = [P(x, z) for x, z in s['pts']]
    if s['rank'] > d['rank']:
        dr.line(pts, fill=(120, 120, 120, 200), width=int(s['w'] * PX))
    dr.line(pts, fill=(140, 90, 60, 160), width=1)
    mid = s['pts'][len(s['pts']) // 2]
    dr.text(P(mid[0] + 1, mid[1] - 2.5), s['name'] + ('' if s['rank'] == 1 else f" (rank {s['rank']})"), fill=(90, 50, 30, 255), font=font)
# plots
dist = d['districts']
def hexc(c, a):
    c = c.lstrip('#'); return (int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16), a)
for p in d['plots']:
    col = dist.get(p['district'], {}).get('color', '#ffffff')
    locked = (p.get('rank') or 1) > d['rank']
    x0, z0, x1, z1 = p['x'], p['z'], p['x'] + p['w'], p['z'] + p['d']
    dr.rectangle([P(x0, z0), P(x1, z1)], fill=hexc(col, 60 if locked else 120), outline=(120, 120, 120, 255) if locked else hexc(col, 255), width=2)
    # door edge
    door = p.get('door', 'S')
    seg = {'S': [(x0, z1), (x1, z1)], 'N': [(x0, z0), (x1, z0)], 'E': [(x1, z0), (x1, z1)], 'W': [(x0, z0), (x0, z1)]}[door]
    dr.line([P(*seg[0]), P(*seg[1])], fill=(200, 40, 40, 255), width=3)
    # the max building footprint centred on the plot, pushed to the door side
    m = p.get('max', 3); mw = p.get('mw', m); md = p.get('md', m)
    if door in 'EW': mw, md = md, mw
    cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
    fx0, fz0 = cx - mw / 2, cz - md / 2
    dr.rectangle([P(fx0, fz0), P(fx0 + mw, fz0 + md)], outline=(60, 40, 40, 170), width=1)
    dr.text(P(x0 + 0.3, z0 + 0.2), p['id'], fill=(40, 30, 30, 255), font=font)
# landmarks
for k, L in d['landmarks'].items():
    x, z = L['x'], L['z']
    if 'w' in L:
        w, dd = (L['d'], L['w']) if (L.get('ri', 0) % 2) else (L['w'], L['d'])
        dr.rectangle([P(x - w / 2, z - dd / 2), P(x + w / 2, z + dd / 2)], outline=(30, 30, 30, 255), width=2)
    dr.ellipse([P(x - 0.8, z - 0.8), P(x + 0.8, z + 0.8)], fill=(255, 60, 120, 255))
    dr.text(P(x + 1, z + 0.6), k, fill=(20, 20, 60, 255), font=font)
for k, a in d['anchors'].items():
    dr.ellipse([P(a['x'] - 0.6, a['z'] - 0.6), P(a['x'] + 0.6, a['z'] + 0.6)], fill=(250, 200, 30, 255))
    dr.text(P(a['x'] + 0.8, a['z'] - 1.2), k, fill=(120, 80, 0, 255), font=font)
for k, D in dist.items():
    if 'label' in D:
        dr.text(P(*D['label']), D['name'], fill=(20, 20, 20, 255), font=big)
im = Image.alpha_composite(im, ov)
im = im.convert('RGB')
if len(sys.argv) > 3:  # crop x0,z0,x1,z1 (metres), shown at 2x
    x0, z0, x1, z1 = [float(v) for v in sys.argv[3].split(',')]
    im = im.crop((int(x0 * PX), int(z0 * PX), int(x1 * PX), int(z1 * PX)))
    im = im.resize((im.width * 2, im.height * 2), Image.LANCZOS)
im.save(sys.argv[2])
