"""Same-scale comparisons of the folk-cat-<x>-toy renders against refs/sheet.png (the toybox compare.py).

    python make_compare.py a|b

Sheet anchors (sheet px, measure-<x>.md):
  A: turnaround ground y 323, 243.8 px / m (1.05 m = ear tips y 67); body centre x: front 216.5, 3/4 456, side 689.5
     (model y = 0), back 947.5. Head close-up: chin y 337, W = 333 px, centre x 1299.5.
  B: ground y 651, 245.7 px / m (ear tips y 393); front 214.5, 3/4 456, side 682, back 947. Head close-up: chin y 660,
     W = 337 px, centre x 1298.
Model renders (render_views.py): body_* ortho 1.25 m over 1000 px (800 px / m), centre z 0.56 m;
head_* ortho 0.90 m over 1000 px (1111 px / m), centre z 0.80 m.
"""
import os, subprocess, sys
D = sys.argv[1]
ROOT = os.path.dirname(os.path.abspath(__file__))
CMP = 'D:/projects/chewy-life-3d/.claude/skills/toybox-character/scripts/compare.py'
SHEET = os.path.join(ROOT, 'refs', 'sheet.png')
PV = os.path.join(ROOT, 'preview', D)
A = dict(a=dict(SP=243.8, GY=323., FX=216.5, QX=456., SX=689.5, BX=947.5, HCH=337., HW=333., HX=1299.5, W=.623, CHIN=.527, EZ=.302),
         b=dict(SP=245.7, GY=651., FX=214.5, QX=456., SX=682., BX=947., HCH=660., HW=337., HX=1298., W=.663, CHIN=.529, EZ=.282))[D]
SP = A['SP']; GY = A['GY']; BP = 800.; BGY = 500 + .56 * BP
def sbox(cx, x0=-.45, x1=.45, z0=-.03, z1=1.08):
    return '%d,%d,%d,%d' % (cx + x0 * SP, GY - z1 * SP, cx + x1 * SP, GY - z0 * SP)
def mbox(cx=500, x0=-.45, x1=.45, z0=-.03, z1=1.08):
    return '%d,%d,%d,%d' % (cx + x0 * BP, BGY - z1 * BP, cx + x1 * BP, BGY - z0 * BP)
W = A['W']; CHIN = A['CHIN']; HPX = 1000 / .90; HCHIN = 500 + (.80 - CHIN) * HPX; WP = A['HW']
def shbox(cx, chin, top=.92, bot=.08, half=.62):
    return '%d,%d,%d,%d' % (cx - half * WP, chin - top * WP, cx + half * WP, chin + bot * WP)
def mhbox(cx=500, top=.92, bot=.08, half=.62):
    Wp = W * HPX; return '%d,%d,%d,%d' % (cx - half * Wp, HCHIN - top * Wp, cx + half * Wp, HCHIN + bot * Wp)
def run(out, *items):
    subprocess.run([sys.executable, CMP, os.path.join(PV, out), '--h', '460'] + list(items), check=True)
pv = lambda n: os.path.join(PV, n)
run('cmp-body.png', 'SHEET front::%s::%s' % (SHEET, sbox(A['FX'])), 'MODEL front::%s::%s' % (pv('body_front.png'), mbox()),
    'SHEET side::%s::%s' % (SHEET, sbox(A['SX'])), 'MODEL side (her left)::%s::%s' % (pv('body_side.png'), mbox()),
    'SHEET back::%s::%s' % (SHEET, sbox(A['BX'])), 'MODEL back::%s::%s' % (pv('body_back.png'), mbox()))
run('cmp-side.png', 'SHEET side::%s::%s' % (SHEET, sbox(A['SX'])), 'MODEL side (her left)::%s::%s' % (pv('body_side.png'), mbox()))
run('cmp-back.png', 'SHEET back::%s::%s' % (SHEET, sbox(A['BX'])), 'MODEL back::%s::%s' % (pv('body_back.png'), mbox()))
run('cmp-34.png', 'SHEET 3/4::%s::%s' % (SHEET, sbox(A['QX'])), 'MODEL 3/4 (her left near, as the sheet)::%s::%s' % (pv('body_34.png'), mbox()))
run('cmp-head.png', 'SHEET head front::%s::%s' % (SHEET, shbox(A['HX'], A['HCH'])), 'MODEL head front::%s::%s' % (pv('head_front.png'), mhbox()))
ez_s = A['HCH'] - A['EZ'] * WP; ez_m = HCHIN - A['EZ'] * W * HPX
run('cmp-eyes.png', 'SHEET eyes::%s::%d,%d,%d,%d' % (SHEET, A['HX'] - .45 * WP, ez_s - .24 * WP, A['HX'] + .45 * WP, ez_s + .20 * WP),
    'MODEL eyes::%s::%d,%d,%d,%d' % (pv('head_front.png'), 500 - .45 * W * HPX, ez_m - .24 * W * HPX, 500 + .45 * W * HPX, ez_m + .20 * W * HPX))
print('compare done')
