"""Same-scale comparisons of the folk-bear-<x>-toy renders against refs/sheet.png (the toybox compare.py).

    python make_compare.py a|b

Sheet anchors (sheet px, measure-<x>.md): the front views share one scale, ground y 491, 342.9 px / m (A's ear tops y 131
= 1.05 m); the side and back views are reduced, ground y 751, 216 px / m (A's side: ear tops y 524 = 1.05 m).
Body centre x: A front 143, 3/4 383, side (leg axis, model y = 0) 80, back 215.5; B front 648.5, 3/4 893, side 582,
back 724.5. Head close-ups (front): A chin y 724.5, midline x 395, W 192 px; B chin y 729, midline x 911, W 205 px.
Model renders (render_views.py): body_* ortho 1.30 m over 1000 px, centre z 0.60 m; head_* ortho 0.90 m over 1000 px,
centre z 0.83 m.
"""
import os, subprocess, sys
ROOT = os.path.dirname(os.path.abspath(__file__))
CMP = 'D:/projects/chewy-life-3d/.claude/skills/toybox-character/scripts/compare.py'
SHEET = os.path.join(ROOT, 'refs', 'sheet.png')
D = sys.argv[1] if len(sys.argv) > 1 else 'a'
PV = os.path.join(ROOT, 'preview', D)
A = dict(front=143, q34=383, side=80, back=215.5, chin=724.5, mid=395, Wp=192, W=.569, CHIN=.572)
B = dict(front=648.5, q34=893, side=582, back=724.5, chin=729, mid=911, Wp=205, W=.604, CHIN=.575)
K = A if D == 'a' else B
SP = 342.9; GY = 491.; SS = 216.; GS = 751.; BP = 1000 / 1.30; BGY = 500 + .60 * BP
def sbox(cx, x0=-.50, x1=.50, z0=-.03, z1=1.22, sp=SP, gy=GY):
    return '%d,%d,%d,%d' % (cx + x0 * sp, gy - z1 * sp, cx + x1 * sp, gy - z0 * sp)
def mbox(cx=500, x0=-.50, x1=.50, z0=-.03, z1=1.22, yoff=0.):
    return '%d,%d,%d,%d' % (cx + (x0 - yoff) * BP, BGY - z1 * BP, cx + (x1 - yoff) * BP, BGY - z0 * BP)
W = K['W']; HPX = 1000 / .90; HCHIN = 500 + (.83 - K['CHIN']) * HPX
def shbox(cx, chin, Wp, top=.98, bot=.08, half=.62):
    return '%d,%d,%d,%d' % (cx - half * Wp, chin - top * Wp, cx + half * Wp, chin + bot * Wp)
def mhbox(cx=500, top=.98, bot=.08, half=.62):
    Wp = W * HPX; return '%d,%d,%d,%d' % (cx - half * Wp, HCHIN - top * Wp, cx + half * Wp, HCHIN + bot * Wp)
def run(out, *items):
    subprocess.run([sys.executable, CMP, os.path.join(PV, out), '--h', '460'] + list(items), check=True)
pv = lambda n: os.path.join(PV, n)
side_s = sbox(K['side'], -.36, .36, sp=SS, gy=GS); side_m = mbox(500, -.36, .36, yoff=.0)
back_s = sbox(K['back'], sp=SS, gy=GS)
run('cmp-body.png', 'SHEET front::%s::%s' % (SHEET, sbox(K['front'])), 'MODEL front::%s::%s' % (pv('body_front.png'), mbox()),
    'SHEET side::%s::%s' % (SHEET, side_s), 'MODEL side::%s::%s' % (pv('body_side.png'), side_m),
    'SHEET back::%s::%s' % (SHEET, back_s), 'MODEL back::%s::%s' % (pv('body_back.png'), mbox()))
run('cmp-34.png', 'SHEET 3/4::%s::%s' % (SHEET, sbox(K['q34'])), 'MODEL 3/4 (her left, as the sheet)::%s::%s' % (pv('body_34.png'), mbox()))
run('cmp-head.png', 'SHEET head front::%s::%s' % (SHEET, shbox(K['mid'], K['chin'], K['Wp'])), 'MODEL head front::%s::%s' % (pv('head_front.png'), mhbox()))
ez = {'a': .392, 'b': .378}[D]
ez_s = K['chin'] - ez * K['Wp']; ez_m = HCHIN - ez * W * HPX; Wp = K['Wp']; Wm = W * HPX
run('cmp-eyes.png', 'SHEET eyes::%s::%d,%d,%d,%d' % (SHEET, K['mid'] - .45 * Wp, ez_s - .16 * Wp, K['mid'] + .45 * Wp, ez_s + .24 * Wp),
    'MODEL eyes::%s::%d,%d,%d,%d' % (pv('head_front.png'), 500 - .45 * Wm, ez_m - .16 * Wm, 500 + .45 * Wm, ez_m + .24 * Wm))
print('compare done')
