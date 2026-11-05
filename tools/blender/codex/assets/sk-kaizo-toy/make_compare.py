"""Same-scale comparisons of the sk-kaizo-toy renders against refs/sheet.png (the toybox compare.py).

    python make_compare.py [preview_dir]

Sheet anchors (sheet px, measure.md): turnaround ground y 500, ear tops y 70 -> 1.03 m = 417.5 px / m; body centre x:
front 232, 3/4 577, side (the leg axis, model y = 0) 904, back 1271. Head close-up (front): chin y 824, W = 337 px
(0.582 m), outline midline x 214; head 3/4 close-up: chin y 820, centre x 571 (same scale).
Model renders (render_views.py): body_* ortho 1.15 m over 1000 px, centre z 0.53 m, x centre y 0.02 (side);
head_* ortho 0.80 m over 1000 px, centre z 0.755 m.
"""
import os, subprocess, sys
ROOT = os.path.dirname(os.path.abspath(__file__))
CMP = 'D:/projects/chewy-life-3d/.claude/skills/toybox-character/scripts/compare.py'
SHEET = os.path.join(ROOT, 'refs', 'sheet.png')
PV = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'preview')
SP = 417.5; GY = 500.; BP = 1000 / 1.15; BGY = 500 + .53 * BP
def sbox(cx, x0=-.55, x1=.55, z0=-.03, z1=1.07):
    return '%d,%d,%d,%d' % (cx + x0 * SP, GY - z1 * SP, cx + x1 * SP, GY - z0 * SP)
def mbox(cx=500, x0=-.55, x1=.55, z0=-.03, z1=1.07, yoff=0.):
    return '%d,%d,%d,%d' % (cx + (x0 - yoff) * BP, BGY - z1 * BP, cx + (x1 - yoff) * BP, BGY - z0 * BP)
W = .582; HPX = 1000 / .80; HCHIN = 500 + (.755 - .515) * HPX
def shbox(cx, chin, top=.92, bot=.10, half=.58, Wp=337.):
    return '%d,%d,%d,%d' % (cx - half * Wp, chin - top * Wp, cx + half * Wp, chin + bot * Wp)
def mhbox(cx=500, top=.92, bot=.10, half=.58):
    Wp = W * HPX; return '%d,%d,%d,%d' % (cx - half * Wp, HCHIN - top * Wp, cx + half * Wp, HCHIN + bot * Wp)
def run(out, *items):
    subprocess.run([sys.executable, CMP, os.path.join(PV, out), '--h', '460'] + list(items), check=True)
pv = lambda n: os.path.join(PV, n)
run('cmp-body.png', 'SHEET front::%s::%s' % (SHEET, sbox(232)), 'MODEL front::%s::%s' % (pv('body_front.png'), mbox()),
    'SHEET side::%s::%s' % (SHEET, sbox(904, -.40, .40)), 'MODEL side::%s::%s' % (pv('body_side.png'), mbox(500, -.40, .40, yoff=.02)),
    'SHEET back::%s::%s' % (SHEET, sbox(1271)), 'MODEL back::%s::%s' % (pv('body_back.png'), mbox()))
run('cmp-side.png', 'SHEET side::%s::%s' % (SHEET, sbox(904, -.40, .40)), 'MODEL side::%s::%s' % (pv('body_side.png'), mbox(500, -.40, .40, yoff=.02)))
run('cmp-back.png', 'SHEET back::%s::%s' % (SHEET, sbox(1271)), 'MODEL back::%s::%s' % (pv('body_back.png'), mbox()))
run('cmp-34.png', 'SHEET 3/4::%s::%s' % (SHEET, sbox(577)), 'MODEL 3/4 (his right, as the sheet)::%s::%s' % (pv('body_34R.png'), mbox()))
run('cmp-head.png', 'SHEET head front::%s::%s' % (SHEET, shbox(214, 824)), 'MODEL head front::%s::%s' % (pv('head_front.png'), mhbox()),
    '--row', 'SHEET head 3/4::%s::%s' % (SHEET, shbox(571, 820)), 'MODEL head 3/4 (his right, as the sheet)::%s::%s' % (pv('head_34R.png'), mhbox()))
# the eyes: a band 0.40 W tall round the eye line, 0.9 W wide
ez_s = 824 - .377 * 337; ez_m = HCHIN - .377 * W * HPX
run('cmp-eyes.png', 'SHEET eyes::%s::%d,%d,%d,%d' % (SHEET, 218.5 - .45 * 337, ez_s - .18 * 337, 218.5 + .45 * 337, ez_s + .20 * 337),
    'MODEL eyes::%s::%d,%d,%d,%d' % (pv('head_front.png'), 500 - .45 * W * HPX, ez_m - .18 * W * HPX, 500 + .45 * W * HPX, ez_m + .20 * W * HPX))
print('compare done')
