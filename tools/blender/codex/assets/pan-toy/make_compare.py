"""Same-scale comparisons of the pan-toy renders against refs/sheet.png (the toybox compare.py).

    python make_compare.py [preview_dir]

Sheet anchors (sheet px, measure.md): turnaround ground y 535, ear tops y 83 -> 1.08 m = 418.5 px / m; body centre x:
front 201, 3/4 599, side (the leg axis, model y = 0) 940.5, back 1335. Head close-up (front): chin y 838, W = 305 px
(0.600 m -> 508 px / m), outline centre x 184.5; head 3/4 close-up: chin y 838, centre x 520 (same scale).
Model renders (render_views.py): body_* ortho 1.25 m over 1000 px (800 px / m), centre z 0.56 m;
head_* ortho 0.90 m over 1000 px (1111 px / m), centre z 0.79 m.
"""
import os, subprocess, sys
ROOT = os.path.dirname(os.path.abspath(__file__))
CMP = 'D:/projects/chewy-life-3d/.claude/skills/toybox-character/scripts/compare.py'
SHEET = os.path.join(ROOT, 'refs', 'sheet.png')
PV = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'preview')
SP = 418.5; GY = 535.; BP = 800.; BGY = 500 + .56 * BP
def sbox(cx, x0=-.45, x1=.45, z0=-.03, z1=1.12):
    return '%d,%d,%d,%d' % (cx + x0 * SP, GY - z1 * SP, cx + x1 * SP, GY - z0 * SP)
def mbox(cx=500, x0=-.45, x1=.45, z0=-.03, z1=1.12):
    return '%d,%d,%d,%d' % (cx + x0 * BP, BGY - z1 * BP, cx + x1 * BP, BGY - z0 * BP)
W = .600; HPX = 1000 / .90; HCHIN = 500 + (.79 - .586) * HPX
def shbox(cx, chin, top=.92, bot=.10, half=.62, Wp=305.):
    return '%d,%d,%d,%d' % (cx - half * Wp, chin - top * Wp, cx + half * Wp, chin + bot * Wp)
def mhbox(cx=500, top=.92, bot=.10, half=.62):
    Wp = W * HPX; return '%d,%d,%d,%d' % (cx - half * Wp, HCHIN - top * Wp, cx + half * Wp, HCHIN + bot * Wp)
def run(out, *items):
    subprocess.run([sys.executable, CMP, os.path.join(PV, out), '--h', '460'] + list(items), check=True)
pv = lambda n: os.path.join(PV, n)
run('cmp-body.png', 'SHEET front::%s::%s' % (SHEET, sbox(201)), 'MODEL front::%s::%s' % (pv('body_front.png'), mbox()),
    'SHEET side::%s::%s' % (SHEET, sbox(940.5, -.40, .40)), 'MODEL side::%s::%s' % (pv('body_sideR.png'), mbox(500, -.40, .40)),
    'SHEET back::%s::%s' % (SHEET, sbox(1335)), 'MODEL back::%s::%s' % (pv('body_back.png'), mbox()))
run('cmp-side.png', 'SHEET side::%s::%s' % (SHEET, sbox(940.5, -.40, .40)), 'MODEL side::%s::%s' % (pv('body_sideR.png'), mbox(500, -.40, .40)))
run('cmp-back.png', 'SHEET back::%s::%s' % (SHEET, sbox(1335)), 'MODEL back::%s::%s' % (pv('body_back.png'), mbox()))
run('cmp-34.png', 'SHEET 3/4::%s::%s' % (SHEET, sbox(599)), 'MODEL 3/4 (his right, as the sheet)::%s::%s' % (pv('body_34R.png'), mbox()))
run('cmp-head.png', 'SHEET head front::%s::%s' % (SHEET, shbox(184.5, 838)), 'MODEL head front::%s::%s' % (pv('head_front.png'), mhbox()),
    '--row', 'SHEET head 3/4::%s::%s' % (SHEET, shbox(520, 838)), 'MODEL head 3/4 (his right)::%s::%s' % (pv('head_34R.png'), mhbox()))
# the eyes: a band round the eye line, 1.0 W wide
ez_s = 838 - .315 * 305; ez_m = HCHIN - .315 * W * HPX
run('cmp-eyes.png', 'SHEET eyes::%s::%d,%d,%d,%d' % (SHEET, 185 - .45 * 305, ez_s - .22 * 305, 185 + .45 * 305, ez_s + .16 * 305),
    'MODEL eyes::%s::%d,%d,%d,%d' % (pv('head_front.png'), 500 - .45 * W * HPX, ez_m - .22 * W * HPX, 500 + .45 * W * HPX, ez_m + .16 * W * HPX))
print('compare done')
