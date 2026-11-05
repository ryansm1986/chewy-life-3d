"""Same-scale comparisons of the sk-funaki-toy renders against refs/sheet.png (the toybox compare.py).

    python make_compare.py [preview_dir]

Sheet anchors (sheet px, measure.md): turnaround ground y 533; front ear tops y 84 -> 1.11 m = 404.5 px / m (the side and
back views are drawn 2-3% bigger: side 412.6, back 404.5 px / m (its top y 70 is the "2.4 heads" note)); body centre x: front 229.5,
3/4 600, side (the leg axis, model y = 0) 930, back 1285. Head close-up (front): chin y 838, W = 311 px (0.6156 m),
features' midline x 208; head 3/4 close-up: chin y 838, centre x 525 (same scale).
Model renders (render_views.py): body_* ortho 1.30 m over 1000 px, centre z 0.57 m, x centre y 0.02 (side);
head_* ortho 0.90 m over 1000 px, centre z 0.83 m.
"""
import os, subprocess, sys
ROOT = os.path.dirname(os.path.abspath(__file__))
CMP = 'D:/projects/chewy-life-3d/.claude/skills/toybox-character/scripts/compare.py'
SHEET = os.path.join(ROOT, 'refs', 'sheet.png')
PV = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'preview')
GY = 533.; BP = 1000 / 1.30; BGY = 500 + .57 * BP
def sbox(cx, x0=-.60, x1=.60, z0=-.03, z1=1.15, SP=404.5):
    return '%d,%d,%d,%d' % (cx + x0 * SP, GY - z1 * SP, cx + x1 * SP, GY - z0 * SP)
def mbox(cx=500, x0=-.60, x1=.60, z0=-.03, z1=1.15, yoff=0.):
    return '%d,%d,%d,%d' % (cx + (x0 - yoff) * BP, BGY - z1 * BP, cx + (x1 - yoff) * BP, BGY - z0 * BP)
W = .6156; HPX = 1000 / .90; HCHIN = 500 + (.83 - .582) * HPX
def shbox(cx, chin, top=.90, bot=.08, half=.58, Wp=311.):
    return '%d,%d,%d,%d' % (cx - half * Wp, chin - top * Wp, cx + half * Wp, chin + bot * Wp)
def mhbox(cx=500, top=.90, bot=.08, half=.58):
    Wp = W * HPX; return '%d,%d,%d,%d' % (cx - half * Wp, HCHIN - top * Wp, cx + half * Wp, HCHIN + bot * Wp)
def run(out, *items):
    subprocess.run([sys.executable, CMP, os.path.join(PV, out), '--h', '460'] + list(items), check=True)
pv = lambda n: os.path.join(PV, n)
SS = 412.6; SB = 404.5
run('cmp-body.png', 'SHEET front::%s::%s' % (SHEET, sbox(229.5)), 'MODEL front::%s::%s' % (pv('body_front.png'), mbox()),
    'SHEET side::%s::%s' % (SHEET, sbox(930, -.42, .42, SP=SS)), 'MODEL side::%s::%s' % (pv('body_side.png'), mbox(500, -.42, .42, yoff=.02)),
    'SHEET back::%s::%s' % (SHEET, sbox(1285, SP=SB)), 'MODEL back::%s::%s' % (pv('body_back.png'), mbox()))
run('cmp-side.png', 'SHEET side::%s::%s' % (SHEET, sbox(930, -.42, .42, SP=SS)), 'MODEL side::%s::%s' % (pv('body_side.png'), mbox(500, -.42, .42, yoff=.02)))
run('cmp-back.png', 'SHEET back::%s::%s' % (SHEET, sbox(1285, SP=SB)), 'MODEL back::%s::%s' % (pv('body_back.png'), mbox()))
run('cmp-34.png', 'SHEET 3/4::%s::%s' % (SHEET, sbox(600)), 'MODEL 3/4 (his right, as the sheet)::%s::%s' % (pv('body_34R.png'), mbox()))
run('cmp-head.png', 'SHEET head front::%s::%s' % (SHEET, shbox(208, 838)), 'MODEL head front::%s::%s' % (pv('head_front.png'), mhbox()),
    '--row', 'SHEET head 3/4::%s::%s' % (SHEET, shbox(525, 838)), 'MODEL head 3/4 (his right, as the sheet)::%s::%s' % (pv('head_34R.png'), mhbox()))
ez_s = 838 - .412 * 311; ez_m = HCHIN - .412 * W * HPX
run('cmp-eyes.png', 'SHEET eyes::%s::%d,%d,%d,%d' % (SHEET, 208 - .45 * 311, ez_s - .16 * 311, 208 + .45 * 311, ez_s + .24 * 311),
    'MODEL eyes::%s::%d,%d,%d,%d' % (pv('head_front.png'), 500 - .45 * W * HPX, ez_m - .16 * W * HPX, 500 + .45 * W * HPX, ez_m + .24 * W * HPX))
print('compare done')
