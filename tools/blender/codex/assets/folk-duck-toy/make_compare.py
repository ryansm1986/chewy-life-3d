"""Same-scale comparisons of the folk-duck-<x>-toy renders against refs/sheet.png (the toybox compare.py).

    python make_compare.py a|b

Sheet anchors (sheet px, measure-<x>.md):
  main row (front, 3/4): ground y 476, 323 px / m; front centre x A 145.5, B 651; 3/4 centre x A 384, B 893.
  small row (side, back): ground y 757, 217 px / m; side body centre x A 84, B 590; back centre x A 231.5, B 735.
  head close-ups: A chin y 729.5, W = 179 px, centre x 405; B chin y 731, W = 196 px, centre x 912.
Model renders (render_views.py): body_* ortho 1.25 m over 1000 px (800 px / m), centre z 0.56 m;
head_* ortho 0.90 m over 1000 px (1111 px / m), centre z 0.80 m.
"""
import os, subprocess, sys
D = sys.argv[1]
ROOT = os.path.dirname(os.path.abspath(__file__))
CMP = 'D:/projects/chewy-life-3d/.claude/skills/toybox-character/scripts/compare.py'
SHEET = os.path.join(ROOT, 'refs', 'sheet.png')
PV = os.path.join(ROOT, 'preview', D)
A = dict(a=dict(FX=145.5, QX=384., SX=84., BX=231.5, HCH=729.5, HW=179., HX=405., W=.557, CHIN=.540, EZ=.402),
         b=dict(FX=651., QX=893., SX=590., BX=735., HCH=731., HW=196., HX=912., W=.600, CHIN=.540, EZ=.396))[D]
SP1, GY1, SP2, GY2 = 323., 476., 217., 757.
BP = 800.; BGY = 500 + .56 * BP
def sbox(cx, sp, gy, x0=-.45, x1=.45, z0=-.03, z1=1.16):
    return '%d,%d,%d,%d' % (cx + x0 * sp, gy - z1 * sp, cx + x1 * sp, gy - z0 * sp)
def mbox(cx=500, x0=-.45, x1=.45, z0=-.03, z1=1.16):
    return '%d,%d,%d,%d' % (cx + x0 * BP, BGY - z1 * BP, cx + x1 * BP, BGY - z0 * BP)
W = A['W']; CHIN = A['CHIN']; HPX = 1000 / .90; HCHIN = 500 + (.80 - CHIN) * HPX; WP = A['HW']
def shbox(cx, chin, top=1.10, bot=.08, half=.66):
    return '%d,%d,%d,%d' % (cx - half * WP, chin - top * WP, cx + half * WP, chin + bot * WP)
def mhbox(cx=500, top=1.10, bot=.08, half=.66):
    Wp = W * HPX; return '%d,%d,%d,%d' % (cx - half * Wp, HCHIN - top * Wp, cx + half * Wp, HCHIN + bot * Wp)
def run(out, *items):
    subprocess.run([sys.executable, CMP, os.path.join(PV, out), '--h', '460'] + list(items), check=True)
pv = lambda n: os.path.join(PV, n)
run('cmp-body.png', 'SHEET front::%s::%s' % (SHEET, sbox(A['FX'], SP1, GY1)), 'MODEL front::%s::%s' % (pv('body_front.png'), mbox()),
    'SHEET side::%s::%s' % (SHEET, sbox(A['SX'], SP2, GY2)), 'MODEL side (her left)::%s::%s' % (pv('body_side.png'), mbox()),
    'SHEET back::%s::%s' % (SHEET, sbox(A['BX'], SP2, GY2)), 'MODEL back::%s::%s' % (pv('body_back.png'), mbox()))
run('cmp-34.png', 'SHEET 3/4::%s::%s' % (SHEET, sbox(A['QX'], SP1, GY1)), 'MODEL 3/4 (her right near, as the sheet)::%s::%s' % (pv('body_34R.png'), mbox()))
run('cmp-head.png', 'SHEET head front::%s::%s' % (SHEET, shbox(A['HX'], A['HCH'])), 'MODEL head front::%s::%s' % (pv('head_front.png'), mhbox()))
ez_s = A['HCH'] - A['EZ'] * WP; ez_m = HCHIN - A['EZ'] * W * HPX
run('cmp-eyes.png', 'SHEET eyes::%s::%d,%d,%d,%d' % (SHEET, A['HX'] - .45 * WP, ez_s - .24 * WP, A['HX'] + .45 * WP, ez_s + .20 * WP),
    'MODEL eyes::%s::%d,%d,%d,%d' % (pv('head_front.png'), 500 - .45 * W * HPX, ez_m - .24 * W * HPX, 500 + .45 * W * HPX, ez_m + .20 * W * HPX))
print('compare done')
