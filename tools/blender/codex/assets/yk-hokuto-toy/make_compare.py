"""Same-scale comparisons of the yk-hokuto-toy renders against refs/sheet.png (the toybox compare.py).

    python make_compare.py [preview_dir]

Sheet anchors (sheet px, measure.md): turnaround ground y 519; front ear tops y 83 -> 0.92 m = 473.9 px / m (the side and
back views at the same scale); body centre x: front 252, 3/4 600, side (the leg axis, model y = 0) 918, back 1271.
Head close-up (front): chin y 821, W = 303 px (0.5402 m), features' midline x 203; head 3/4 close-up: chin y 821,
centre x 535 (same scale).
Model renders (render_views.py): body_* ortho 1.10 m over 1000 px, centre z 0.46 m, y centre 0.02 (side);
head_* ortho 0.75 m over 1000 px, centre z 0.68 m.
"""
import os, subprocess, sys
ROOT = os.path.dirname(os.path.abspath(__file__))
CMP = 'D:/projects/chewy-life-3d/.claude/skills/toybox-character/scripts/compare.py'
SHEET = os.path.join(ROOT, 'refs', 'sheet.png')
PV = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'preview')
GY = 519.; SP = 473.9; BP = 1000 / 1.10; BGY = 500 + .46 * BP
def sbox(cx, x0=-.48, x1=.48, z0=-.03, z1=.96):
    return '%d,%d,%d,%d' % (cx + x0 * SP, GY - z1 * SP, cx + x1 * SP, GY - z0 * SP)
def mbox(cx=500, x0=-.48, x1=.48, z0=-.03, z1=.96, yoff=0.):
    return '%d,%d,%d,%d' % (cx + (x0 - yoff) * BP, BGY - z1 * BP, cx + (x1 - yoff) * BP, BGY - z0 * BP)
W = .5402; HPX = 1000 / .75; HCHIN = 500 + (.68 - .4484) * HPX
def shbox(cx, chin, top=.92, bot=.08, half=.58, Wp=303.):
    return '%d,%d,%d,%d' % (cx - half * Wp, chin - top * Wp, cx + half * Wp, chin + bot * Wp)
def mhbox(cx=500, top=.92, bot=.08, half=.58):
    Wp = W * HPX; return '%d,%d,%d,%d' % (cx - half * Wp, HCHIN - top * Wp, cx + half * Wp, HCHIN + bot * Wp)
def run(out, *items):
    subprocess.run([sys.executable, CMP, os.path.join(PV, out), '--h', '460'] + list(items), check=True)
pv = lambda n: os.path.join(PV, n)
run('cmp-body.png', 'SHEET front::%s::%s' % (SHEET, sbox(252)), 'MODEL front::%s::%s' % (pv('body_front.png'), mbox()),
    'SHEET side::%s::%s' % (SHEET, sbox(918, -.36, .36)), 'MODEL side::%s::%s' % (pv('body_side.png'), mbox(500, -.36, .36, yoff=.02)),
    'SHEET back::%s::%s' % (SHEET, sbox(1271)), 'MODEL back::%s::%s' % (pv('body_back.png'), mbox()))
run('cmp-side.png', 'SHEET side::%s::%s' % (SHEET, sbox(918, -.36, .36)), 'MODEL side::%s::%s' % (pv('body_side.png'), mbox(500, -.36, .36, yoff=.02)))
run('cmp-back.png', 'SHEET back::%s::%s' % (SHEET, sbox(1271)), 'MODEL back::%s::%s' % (pv('body_back.png'), mbox()))
run('cmp-34.png', 'SHEET 3/4::%s::%s' % (SHEET, sbox(600)), 'MODEL 3/4 (his right, as the sheet)::%s::%s' % (pv('body_34R.png'), mbox()))
run('cmp-head.png', 'SHEET head front::%s::%s' % (SHEET, shbox(203, 821)), 'MODEL head front::%s::%s' % (pv('head_front.png'), mhbox()),
    '--row', 'SHEET head 3/4::%s::%s' % (SHEET, shbox(535, 821)), 'MODEL head 3/4 (his right, as the sheet)::%s::%s' % (pv('head_34R.png'), mhbox()))
ez_s = 821 - .320 * 303; ez_m = HCHIN - .320 * W * HPX
run('cmp-eyes.png', 'SHEET eyes::%s::%d,%d,%d,%d' % (SHEET, 203 - .45 * 303, ez_s - .22 * 303, 203 + .45 * 303, ez_s + .20 * 303),
    'MODEL eyes::%s::%d,%d,%d,%d' % (pv('head_front.png'), 500 - .45 * W * HPX, ez_m - .22 * W * HPX, 500 + .45 * W * HPX, ez_m + .20 * W * HPX))
print('compare done')
