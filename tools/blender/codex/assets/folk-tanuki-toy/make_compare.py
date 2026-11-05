"""Same-scale comparisons of a folk-tanuki design's renders against refs/sheet.png (the toybox compare.py).

    python make_compare.py a|b [preview_dir]

Sheet anchors (sheet px, measure-a.md / measure-b.md):
- turnaround front: A ground y 317.5, crown y 83 (223.3 px / m), midline x 180; B ground y 654.5, crown y 418 (225.2 px / m),
  midline x 180; 3/4 centre x A 395, B 395; side (same scale) leg axis x A 585, B 592; back centre x A 803, B 806;
- head close-up: A W 289.0 px, midline x 1071.5, chin y 304; B W 291.2 px, midline x 1071.6, scarf top y 617 (her chin
  ~0.03 W under it). The close-up draws the head taller than the turnaround: its crop is squashed x 0.90 (A) / 0.937 (B).
Model renders (render_views.py): body_* ortho 1.25 m over 1000 px, centre z 0.54 m (ground y 932); head_* ortho 1.0 m
over 1000 px, centre z 0.85 m.
"""
import os, subprocess, sys, json
from PIL import Image
ROOT = os.path.dirname(os.path.abspath(__file__))
D = sys.argv[1]
CMP = 'D:/projects/chewy-life-3d/.claude/skills/toybox-character/scripts/compare.py'
SHEET = os.path.join(ROOT, 'refs', 'sheet.png')
PV = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, 'preview', D)
M = json.load(open(os.path.join(ROOT, 'measurements-model-%s.json' % D))) if os.path.exists(os.path.join(ROOT, 'measurements-model-%s.json' % D)) else None
W = {'a': .703, 'b': .733}[D]; CHIN = {'a': .593, 'b': .597}[D]
GY = {'a': 317.5, 'b': 654.5}[D]; SP = {'a': 223.3, 'b': 225.2}[D]; BP = 1000 / 1.25; BGY = 500 + .54 * BP
GY2 = GY; SP2 = SP
FX = 180.; QX = 395.; SX = {'a': 585, 'b': 592}[D]; KX = {'a': 803, 'b': 806}[D]
def sbox(cx, x0=-.48, x1=.48, z0=-.03, z1=1.16, sp=SP, gy=GY):
    return '%d,%d,%d,%d' % (cx + x0 * sp, gy - z1 * sp, cx + x1 * sp, gy - z0 * sp)
def mbox(cx=500, x0=-.48, x1=.48, z0=-.03, z1=1.16, yoff=0.):
    return '%d,%d,%d,%d' % (cx + (x0 - yoff) * BP, BGY - z1 * BP, cx + (x1 - yoff) * BP, BGY - z0 * BP)
HPX = 1000 / 1.0; HCHIN = 500 + (.85 - CHIN) * HPX
HC = {'a': (1071.5, 304, 289.0), 'b': (1071.6, 617 + .03 * 291.2, 291.2)}[D]; VF = {'a': .90, 'b': .937}[D]
# the close-up crop, squashed vertically by VF so its features land at the model's scale
cx, chin, Wp = HC; top, bot, half = 1.00, .08, .62
crop = Image.open(SHEET).convert('RGB').crop((int(cx - half * Wp), int(chin - top / VF * Wp), int(cx + half * Wp), int(chin + bot / VF * Wp)))
crop = crop.resize((crop.width * 3, int(crop.height * 3 * VF)), Image.LANCZOS)
HEADC = os.path.join(PV, '_sheet_head.png'); crop.save(HEADC)
def mhbox(cxm=500):
    Wq = W * HPX; return '%d,%d,%d,%d' % (cxm - half * Wq, HCHIN - top * Wq, cxm + half * Wq, HCHIN + bot * Wq)
def run(out, *items):
    subprocess.run([sys.executable, CMP, os.path.join(PV, out), '--h', '460'] + list(items), check=True)
pv = lambda n: os.path.join(PV, n)
run('cmp-body.png', 'SHEET front::%s::%s' % (SHEET, sbox(FX)), 'MODEL front::%s::%s' % (pv('body_front.png'), mbox()),
    'SHEET side::%s::%s' % (SHEET, sbox(SX, -.40, .52, sp=SP2, gy=GY2)), 'MODEL side::%s::%s' % (pv('body_side.png'), mbox(500, -.40, .52, yoff=.0)),
    'SHEET back::%s::%s' % (SHEET, sbox(KX, sp=SP2, gy=GY2)), 'MODEL back::%s::%s' % (pv('body_back.png'), mbox()))
run('cmp-34.png', 'SHEET 3/4::%s::%s' % (SHEET, sbox(QX)), 'MODEL 3/4 (her right, as the sheet)::%s::%s' % (pv('body_34R.png'), mbox()))
run('cmp-head.png', 'SHEET head front (close-up, z x VF)::%s' % HEADC, 'MODEL head front::%s::%s' % (pv('head_front.png'), mhbox()),
    'SHEET turnaround head::%s::%s' % (SHEET, '%d,%d,%d,%d' % (FX - half * W * SP, GY - (CHIN + top * W) * SP, FX + half * W * SP, GY - (CHIN - bot * W) * SP)))
EZ = {'a': .310, 'b': .305}[D]
ez_s = chin - EZ / VF * Wp; ez_m = HCHIN - EZ * W * HPX
run('cmp-eyes.png', 'SHEET eyes (close-up)::%s::%d,%d,%d,%d' % (SHEET, cx - .45 * Wp, ez_s - .22 / VF * Wp, cx + .45 * Wp, ez_s + .20 / VF * Wp),
    'MODEL eyes::%s::%d,%d,%d,%d' % (pv('head_front.png'), 500 - .45 * W * HPX, ez_m - .22 * W * HPX, 500 + .45 * W * HPX, ez_m + .20 * W * HPX))
print('compare done')
