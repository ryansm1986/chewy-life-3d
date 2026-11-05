"""Same-scale comparisons of the ak-yae-toy renders against refs/sheet.png (the toybox compare.py).

    python make_compare.py [preview_dir]

Sheet anchors (sheet px, measure.md): turnaround ground y 526, ear tops y 87.5 -> 1.07 m = 410 px / m; body centre x:
front 233.5, 3/4 599, side (the trouser legs' axis, model y = 0) 921.5, back 1284.5. Head close-up (front): chin y 791,
W = 295 px (0.554 m), features' midline x 198; head 3/4 close-up: chin y 788, outline centre x 528 (same scale).
Model renders (render_views.py): body_* ortho 1.30 m over 1000 px, centre z 0.60 m; head_* ortho 0.90 m over 1000 px,
centre z 0.82 m. The sheet's 3/4 views look from her right front (body_34R / head_34R).
"""
import os, subprocess, sys
ROOT = os.path.dirname(os.path.abspath(__file__))
CMP = 'D:/projects/chewy-life-3d/.claude/skills/toybox-character/scripts/compare.py'
SHEET = os.path.join(ROOT, 'refs', 'sheet.png')
PV = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'preview')
SP = 410.; GY = 526.; BP = 1000 / 1.30; BGY = 500 + .60 * BP
def sbox(cx, x0=-.56, x1=.56, z0=-.03, z1=1.12):
    return '%d,%d,%d,%d' % (cx + x0 * SP, GY - z1 * SP, cx + x1 * SP, GY - z0 * SP)
def mbox(cx=500, x0=-.56, x1=.56, z0=-.03, z1=1.12, yoff=0.):
    return '%d,%d,%d,%d' % (cx + (x0 - yoff) * BP, BGY - z1 * BP, cx + (x1 - yoff) * BP, BGY - z0 * BP)
W = .554; HPX = 1000 / .90; HCHIN = 500 + (.82 - .605) * HPX
def shbox(cx, chin, top=.92, bot=.10, half=.60, Wp=295.):
    return '%d,%d,%d,%d' % (cx - half * Wp, chin - top * Wp, cx + half * Wp, chin + bot * Wp)
def mhbox(cx=500, top=.92, bot=.10, half=.60):
    Wp = W * HPX; return '%d,%d,%d,%d' % (cx - half * Wp, HCHIN - top * Wp, cx + half * Wp, HCHIN + bot * Wp)
def run(out, *items):
    subprocess.run([sys.executable, CMP, os.path.join(PV, out), '--h', '460'] + list(items), check=True)
pv = lambda n: os.path.join(PV, n)
run('cmp-body.png', 'SHEET front::%s::%s' % (SHEET, sbox(233.5)), 'MODEL front::%s::%s' % (pv('body_front.png'), mbox()),
    'SHEET side::%s::%s' % (SHEET, sbox(921.5, -.40, .40)), 'MODEL side::%s::%s' % (pv('body_side.png'), mbox(500, -.40, .40, yoff=.02)),
    'SHEET back::%s::%s' % (SHEET, sbox(1284.5)), 'MODEL back::%s::%s' % (pv('body_back.png'), mbox()))
run('cmp-side.png', 'SHEET side::%s::%s' % (SHEET, sbox(921.5, -.40, .40)), 'MODEL side::%s::%s' % (pv('body_side.png'), mbox(500, -.40, .40, yoff=.02)))
run('cmp-back.png', 'SHEET back::%s::%s' % (SHEET, sbox(1284.5)), 'MODEL back::%s::%s' % (pv('body_back.png'), mbox()))
run('cmp-34.png', 'SHEET 3/4::%s::%s' % (SHEET, sbox(599)), 'MODEL 3/4 (her right, as the sheet)::%s::%s' % (pv('body_34R.png'), mbox()))
# the head 3/4: the model's outline centre sits 0.022 m left of the render centre (the head centre is 0.035 m behind the axis)
run('cmp-head.png', 'SHEET head front::%s::%s' % (SHEET, shbox(198, 791)), 'MODEL head front::%s::%s' % (pv('head_front.png'), mhbox()),
    '--row', 'SHEET head 3/4::%s::%s' % (SHEET, shbox(528, 788)), 'MODEL head 3/4 (her right, as the sheet)::%s::%s' % (pv('head_34R.png'), mhbox(475)))
# the eyes: a band 0.42 W tall round the eye line, 0.9 W wide
ez_s = 791 - .382 * 295; ez_m = HCHIN - .382 * W * HPX
run('cmp-eyes.png', 'SHEET eyes::%s::%d,%d,%d,%d' % (SHEET, 198 - .45 * 295, ez_s - .20 * 295, 198 + .45 * 295, ez_s + .22 * 295),
    'MODEL eyes::%s::%d,%d,%d,%d' % (pv('head_front.png'), 500 - .45 * W * HPX, ez_m - .20 * W * HPX, 500 + .45 * W * HPX, ez_m + .22 * W * HPX))
print('compare done')
