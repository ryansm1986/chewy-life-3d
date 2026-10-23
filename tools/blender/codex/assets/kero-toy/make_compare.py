"""Same-scale comparisons of the kero-toy renders against refs/sheet.png (the toybox compare.py).

    python make_compare.py [preview_dir]

Sheet anchors (sheet px, measure.md): turnaround ground y 513, dome tops y 105 -> 1.10 m = 370.9 px / m; body centre x:
front 225.5, 3/4 588, side (the leg axis, model y = 0) 948, back 1302. Head close-up (front): chin y 809, W = 353 px
(0.800 m -> 441 px / m), outline centre x 215; head 3/4 close-up: chin y 809, centre x 567 (same scale).
Model renders (render_views.py): body_* ortho 1.25 m over 1000 px (800 px / m), centre z 0.56 m;
head_* ortho 1.15 m over 1000 px (869.6 px / m), centre z 0.84 m.
"""
import os, subprocess, sys
ROOT = os.path.dirname(os.path.abspath(__file__))
CMP = 'D:/projects/chewy-life-3d/.claude/skills/toybox-character/scripts/compare.py'
SHEET = os.path.join(ROOT, 'refs', 'sheet.png')
PV = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'preview')
SP = 370.9; GY = 513.; BP = 800.; BGY = 500 + .56 * BP
def sbox(cx, x0=-.52, x1=.52, z0=-.03, z1=1.14):
    return '%d,%d,%d,%d' % (cx + x0 * SP, GY - z1 * SP, cx + x1 * SP, GY - z0 * SP)
def mbox(cx=500, x0=-.52, x1=.52, z0=-.03, z1=1.14):
    return '%d,%d,%d,%d' % (cx + x0 * BP, BGY - z1 * BP, cx + x1 * BP, BGY - z0 * BP)
W = .800; HPX = 1000 / 1.15; HCHIN = 500 + (.84 - .571) * HPX
def shbox(cx, chin, top=.74, bot=.08, half=.62, Wp=353.):
    return '%d,%d,%d,%d' % (cx - half * Wp, chin - top * Wp, cx + half * Wp, chin + bot * Wp)
def mhbox(cx=500, top=.74, bot=.08, half=.62):
    Wp = W * HPX; return '%d,%d,%d,%d' % (cx - half * Wp, HCHIN - top * Wp, cx + half * Wp, HCHIN + bot * Wp)
def run(out, *items):
    subprocess.run([sys.executable, CMP, os.path.join(PV, out), '--h', '460'] + list(items), check=True)
pv = lambda n: os.path.join(PV, n)
run('cmp-body.png', 'SHEET front::%s::%s' % (SHEET, sbox(225.5)), 'MODEL front::%s::%s' % (pv('body_front.png'), mbox()),
    'SHEET side::%s::%s' % (SHEET, sbox(948, -.45, .45)), 'MODEL side::%s::%s' % (pv('body_side.png'), mbox(500, -.45, .45)),
    'SHEET back::%s::%s' % (SHEET, sbox(1302)), 'MODEL back::%s::%s' % (pv('body_back.png'), mbox()))
run('cmp-side.png', 'SHEET side::%s::%s' % (SHEET, sbox(948, -.45, .45)), 'MODEL side::%s::%s' % (pv('body_side.png'), mbox(500, -.45, .45)))
run('cmp-back.png', 'SHEET back::%s::%s' % (SHEET, sbox(1302)), 'MODEL back::%s::%s' % (pv('body_back.png'), mbox()))
run('cmp-34.png', 'SHEET 3/4::%s::%s' % (SHEET, sbox(588)), 'MODEL 3/4 (his left side, as the sheet)::%s::%s' % (pv('body_34.png'), mbox()))
run('cmp-head.png', 'SHEET head front::%s::%s' % (SHEET, shbox(215, 809)), 'MODEL head front::%s::%s' % (pv('head_front.png'), mhbox()),
    '--row', 'SHEET head 3/4::%s::%s' % (SHEET, shbox(567, 809)), 'MODEL head 3/4::%s::%s' % (pv('head_34.png'), mhbox()))
# the eyes: a band round the eye line, 1.0 W wide
ez_s = 809 - .419 * 353; ez_m = HCHIN - .419 * W * HPX
run('cmp-eyes.png', 'SHEET eyes::%s::%d,%d,%d,%d' % (SHEET, 215 - .48 * 353, ez_s - .22 * 353, 215 + .48 * 353, ez_s + .16 * 353),
    'MODEL eyes::%s::%d,%d,%d,%d' % (pv('head_front.png'), 500 - .48 * W * HPX, ez_m - .22 * W * HPX, 500 + .48 * W * HPX, ez_m + .16 * W * HPX))
print('compare done')
