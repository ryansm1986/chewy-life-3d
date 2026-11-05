"""Same-scale comparisons of a folk-panda design's renders against refs/sheet.png (the toybox compare.py).

    python make_compare.py a|b [preview_dir]

Sheet anchors (sheet px, measure-a.md / measure-b.md):
- turnaround front (top row): ground y 487, 332.4 px / m (A's ear tops y 138 = 1.05 m); centre x A 142.6, B 653.5;
  3/4 centre x A 381, B 890;
- the bottom row's side and back views are drawn smaller (the notes: don't take scale from them): 219 px / m to match the
  same total height, ground y 752.5; side leg axis x A 80, B 587; back centre x A 225, B 735;
- head close-up: A W 188.2 px, midline x 402.1, chin y 738; B W 191.1 px, x 913.5, chin y 741. It draws the head 1/0.93
  taller than the turnaround (measure-a.md note 1): its crop is stretched to the model's vertical scale (z x 0.93).
Model renders (render_views.py): body_* ortho 1.25 m over 1000 px, centre z 0.54 m (ground y 932); head_* ortho 0.85 m
over 1000 px, centre z 0.78 m.
"""
import os, subprocess, sys, json
from PIL import Image
ROOT = os.path.dirname(os.path.abspath(__file__))
D = sys.argv[1]
CMP = 'D:/projects/chewy-life-3d/.claude/skills/toybox-character/scripts/compare.py'
SHEET = os.path.join(ROOT, 'refs', 'sheet.png')
PV = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, 'preview', D)
M = json.load(open(os.path.join(ROOT, 'measurements-model-%s.json' % D))) if os.path.exists(os.path.join(ROOT, 'measurements-model-%s.json' % D)) else None
W = {'a': .600, 'b': .606}[D]; CHIN = {'a': .534, 'b': .532}[D]
GY = 487.; SP = 332.4; BP = 1000 / 1.25; BGY = 500 + .54 * BP
GY2 = 752.5; SP2 = 219.
FX = {'a': 142.6, 'b': 653.5}[D]; QX = {'a': 381, 'b': 890}[D]; SX = {'a': 80, 'b': 587}[D]; KX = {'a': 225, 'b': 735}[D]
def sbox(cx, x0=-.48, x1=.48, z0=-.03, z1=1.16, sp=SP, gy=GY):
    return '%d,%d,%d,%d' % (cx + x0 * sp, gy - z1 * sp, cx + x1 * sp, gy - z0 * sp)
def mbox(cx=500, x0=-.48, x1=.48, z0=-.03, z1=1.16, yoff=0.):
    return '%d,%d,%d,%d' % (cx + (x0 - yoff) * BP, BGY - z1 * BP, cx + (x1 - yoff) * BP, BGY - z0 * BP)
HPX = 1000 / .85; HCHIN = 500 + (.78 - CHIN) * HPX
HC = {'a': (402.1, 738, 188.2), 'b': (913.5, 741, 191.1)}[D]
# the close-up crop, stretched vertically by 0.93 so its features land at the model's scale
cx, chin, Wp = HC; top, bot, half = 1.00, .08, .62
crop = Image.open(SHEET).convert('RGB').crop((int(cx - half * Wp), int(chin - top / .93 * Wp), int(cx + half * Wp), int(chin + bot / .93 * Wp)))
crop = crop.resize((crop.width * 3, int(crop.height * 3 * .93)), Image.LANCZOS)
HEADC = os.path.join(PV, '_sheet_head.png'); crop.save(HEADC)
def mhbox(cxm=500):
    Wq = W * HPX; return '%d,%d,%d,%d' % (cxm - half * Wq, HCHIN - top * Wq, cxm + half * Wq, HCHIN + bot * Wq)
def run(out, *items):
    subprocess.run([sys.executable, CMP, os.path.join(PV, out), '--h', '460'] + list(items), check=True)
pv = lambda n: os.path.join(PV, n)
run('cmp-body.png', 'SHEET front::%s::%s' % (SHEET, sbox(FX)), 'MODEL front::%s::%s' % (pv('body_front.png'), mbox()),
    'SHEET side (bottom row, 219 px/m)::%s::%s' % (SHEET, sbox(SX, -.36, .36, sp=SP2, gy=GY2)), 'MODEL side::%s::%s' % (pv('body_side.png'), mbox(500, -.36, .36, yoff=.0)),
    'SHEET back (bottom row)::%s::%s' % (SHEET, sbox(KX, sp=SP2, gy=GY2)), 'MODEL back::%s::%s' % (pv('body_back.png'), mbox()))
run('cmp-34.png', 'SHEET 3/4::%s::%s' % (SHEET, sbox(QX)), 'MODEL 3/4 (her right, as the sheet)::%s::%s' % (pv('body_34R.png'), mbox()))
run('cmp-head.png', 'SHEET head front (z x0.93)::%s' % HEADC, 'MODEL head front::%s::%s' % (pv('head_front.png'), mhbox()),
    'SHEET turnaround head::%s::%s' % (SHEET, '%d,%d,%d,%d' % (FX - half * W * SP, GY - (CHIN + top * W) * SP, FX + half * W * SP, GY - (CHIN - bot * W) * SP)))
EZ = {'a': .361, 'b': .354}[D]
ez_s = chin - EZ / .93 * Wp; ez_m = HCHIN - EZ * W * HPX
run('cmp-eyes.png', 'SHEET eyes (close-up)::%s::%d,%d,%d,%d' % (SHEET, cx - .45 * Wp, ez_s - .22 / .93 * Wp, cx + .45 * Wp, ez_s + .20 / .93 * Wp),
    'MODEL eyes::%s::%d,%d,%d,%d' % (pv('head_front.png'), 500 - .45 * W * HPX, ez_m - .22 * W * HPX, 500 + .45 * W * HPX, ez_m + .20 * W * HPX))
print('compare done')
