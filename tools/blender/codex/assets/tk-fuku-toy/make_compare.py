"""Same-scale comparisons of the tk-fuku-toy renders against refs/sheet.png (the toybox compare.py).

    python make_compare.py [preview_dir]

Sheet anchors (sheet px, measure.md): turnaround ground y 495.5, ear tops y 70 -> 394.0 px / m; body centre x: front 228,
3/4 598 (the head), side (the leg axis, model y = 0) 930, back 1306. Head close-up (front): chin y 785, W = 336 px
(0.619 m -> 543 px / m), feature centre x 191; head 3/4 close-up: chin y 785, centre x 525 (same scale).
Model renders (render_views.py): body_* ortho 1.30 m over 1000 px, centre z 0.56 m, centre y 0.02 (side);
head_* ortho 0.90 m over 1000 px, centre z 0.79 m.
"""
import os, subprocess, sys
ROOT = os.path.dirname(os.path.abspath(__file__))
CMP = 'D:/projects/chewy-life-3d/.claude/skills/toybox-character/scripts/compare.py'
SHEET = os.path.join(ROOT, 'refs', 'sheet.png')
PV = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'preview')
SP = 394.0; GY = 495.5; BP = 1000 / 1.30; BGY = 500 + .56 * BP
def sbox(cx, x0=-.55, x1=.55, z0=-.03, z1=1.12):
    return '%d,%d,%d,%d' % (cx + x0 * SP, GY - z1 * SP, cx + x1 * SP, GY - z0 * SP)
def mbox(cx=500, x0=-.55, x1=.55, z0=-.03, z1=1.12, yoff=0.):
    return '%d,%d,%d,%d' % (cx + (x0 - yoff) * BP, BGY - z1 * BP, cx + (x1 - yoff) * BP, BGY - z0 * BP)
W = .619; HPX = 1000 / .90; HCHIN = 500 + (.79 - .605) * HPX
def shbox(cx, chin, top=.86, bot=.10, half=.56, Wp=336.):
    return '%d,%d,%d,%d' % (cx - half * Wp, chin - top * Wp, cx + half * Wp, chin + bot * Wp)
def mhbox(cx=500, top=.86, bot=.10, half=.56):
    Wp = W * HPX; return '%d,%d,%d,%d' % (cx - half * Wp, HCHIN - top * Wp, cx + half * Wp, HCHIN + bot * Wp)
def run(out, *items):
    subprocess.run([sys.executable, CMP, os.path.join(PV, out), '--h', '460'] + list(items), check=True)
pv = lambda n: os.path.join(PV, n)
run('cmp-body.png', 'SHEET front::%s::%s' % (SHEET, sbox(228)), 'MODEL front::%s::%s' % (pv('body_front.png'), mbox()),
    'SHEET side::%s::%s' % (SHEET, sbox(930, -.40, .70)), 'MODEL side::%s::%s' % (pv('body_side.png'), mbox(500, -.40, .70, yoff=.02)),
    'SHEET back::%s::%s' % (SHEET, sbox(1306)), 'MODEL back::%s::%s' % (pv('body_back.png'), mbox()))
run('cmp-side.png', 'SHEET side::%s::%s' % (SHEET, sbox(930, -.40, .70)), 'MODEL side::%s::%s' % (pv('body_side.png'), mbox(500, -.40, .70, yoff=.02)))
run('cmp-back.png', 'SHEET back::%s::%s' % (SHEET, sbox(1306)), 'MODEL back::%s::%s' % (pv('body_back.png'), mbox()))
run('cmp-34.png', 'SHEET 3/4::%s::%s' % (SHEET, sbox(598)), 'MODEL 3/4 (his front-right, as the sheet)::%s::%s' % (pv('body_34R.png'), mbox()))
run('cmp-head.png', 'SHEET head front::%s::%s' % (SHEET, shbox(191, 785)), 'MODEL head front::%s::%s' % (pv('head_front.png'), mhbox()),
    '--row', 'SHEET head 3/4::%s::%s' % (SHEET, shbox(525, 785)), 'MODEL head 3/4 (his front-right, as the sheet)::%s::%s' % (pv('head_34R.png'), mhbox()))
# the eyes: a band 0.40 W tall round the eye line, 0.9 W wide
ez_s = 785 - .317 * 336; ez_m = HCHIN - .317 * W * HPX
run('cmp-eyes.png', 'SHEET eyes::%s::%d,%d,%d,%d' % (SHEET, 191 - .45 * 336, ez_s - .20 * 336, 191 + .45 * 336, ez_s + .20 * 336),
    'MODEL eyes::%s::%d,%d,%d,%d' % (pv('head_front.png'), 500 - .45 * W * HPX, ez_m - .20 * W * HPX, 500 + .45 * W * HPX, ez_m + .20 * W * HPX))
print('compare done')
