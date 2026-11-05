"""Same-scale comparisons of the tk-takumi-toy renders against refs/sheet.png (the toybox compare.py).

    python make_compare.py [preview_dir]

Sheet anchors (sheet px, measure.md): turnaround ground y 563, ear tops y 83 -> 1.15 m = 417.4 px / m; body centre x:
front 218, 3/4 585, side (the leg axis, model y = 0) 934, back 1311.5. Head close-up (front): chin y 818, W = 290 px
(0.654 m), features' midline x 173.7; head 3/4 close-up: chin y 815, centre x 496 (same scale).
Model renders (render_views.py): body_* ortho 1.30 m over 1000 px, centre z 0.60 m, x centre y 0.02 (side);
head_* ortho 0.90 m over 1000 px, centre z 0.875 m.
"""
import os, subprocess, sys
ROOT = os.path.dirname(os.path.abspath(__file__))
CMP = 'D:/projects/chewy-life-3d/.claude/skills/toybox-character/scripts/compare.py'
SHEET = os.path.join(ROOT, 'refs', 'sheet.png')
PV = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'preview')
SP = 417.4; GY = 563.; BP = 1000 / 1.30; BGY = 500 + .60 * BP
def sbox(cx, x0=-.60, x1=.60, z0=-.03, z1=1.19):
    return '%d,%d,%d,%d' % (cx + x0 * SP, GY - z1 * SP, cx + x1 * SP, GY - z0 * SP)
def mbox(cx=500, x0=-.60, x1=.60, z0=-.03, z1=1.19, yoff=0.):
    return '%d,%d,%d,%d' % (cx + (x0 - yoff) * BP, BGY - z1 * BP, cx + (x1 - yoff) * BP, BGY - z0 * BP)
W = .654; HPX = 1000 / .90; HCHIN = 500 + (.875 - .630) * HPX
def shbox(cx, chin, top=.86, bot=.10, half=.58, Wp=290.):
    return '%d,%d,%d,%d' % (cx - half * Wp, chin - top * Wp, cx + half * Wp, chin + bot * Wp)
def mhbox(cx=500, top=.86, bot=.10, half=.58):
    Wp = W * HPX; return '%d,%d,%d,%d' % (cx - half * Wp, HCHIN - top * Wp, cx + half * Wp, HCHIN + bot * Wp)
def run(out, *items):
    subprocess.run([sys.executable, CMP, os.path.join(PV, out), '--h', '460'] + list(items), check=True)
pv = lambda n: os.path.join(PV, n)
run('cmp-body.png', 'SHEET front::%s::%s' % (SHEET, sbox(218)), 'MODEL front::%s::%s' % (pv('body_front.png'), mbox()),
    'SHEET side::%s::%s' % (SHEET, sbox(934, -.42, .42)), 'MODEL side::%s::%s' % (pv('body_side.png'), mbox(500, -.42, .42, yoff=.02)),
    'SHEET back::%s::%s' % (SHEET, sbox(1311.5)), 'MODEL back::%s::%s' % (pv('body_back.png'), mbox()))
run('cmp-side.png', 'SHEET side::%s::%s' % (SHEET, sbox(934, -.42, .42)), 'MODEL side::%s::%s' % (pv('body_side.png'), mbox(500, -.42, .42, yoff=.02)))
run('cmp-back.png', 'SHEET back::%s::%s' % (SHEET, sbox(1311.5)), 'MODEL back::%s::%s' % (pv('body_back.png'), mbox()))
run('cmp-34.png', 'SHEET 3/4::%s::%s' % (SHEET, sbox(585)), 'MODEL 3/4 (his left, as the sheet)::%s::%s' % (pv('body_34.png'), mbox()))
run('cmp-head.png', 'SHEET head front::%s::%s' % (SHEET, shbox(173.7, 818)), 'MODEL head front::%s::%s' % (pv('head_front.png'), mhbox()),
    '--row', 'SHEET head 3/4::%s::%s' % (SHEET, shbox(496, 815)), 'MODEL head 3/4 (his left, as the sheet)::%s::%s' % (pv('head_34.png'), mhbox()))
# the eyes: a band 0.40 W tall round the eye line, 0.9 W wide
ez_s = 818 - .319 * 290; ez_m = HCHIN - .319 * W * HPX
run('cmp-eyes.png', 'SHEET eyes::%s::%d,%d,%d,%d' % (SHEET, 173.7 - .45 * 290, ez_s - .16 * 290, 173.7 + .45 * 290, ez_s + .24 * 290),
    'MODEL eyes::%s::%d,%d,%d,%d' % (pv('head_front.png'), 500 - .45 * W * HPX, ez_m - .16 * W * HPX, 500 + .45 * W * HPX, ez_m + .24 * W * HPX))
print('compare done')
