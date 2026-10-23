"""Same-scale comparisons of the kuma-toy renders against refs/sheet.png (the toybox compare.py).

    python make_compare.py [preview_dir]

Sheet anchors (sheet px, measure.md): turnaround ground y 499, hat top y 54 -> 318 px / m; body centre x: front 231.5,
3/4 578, side (the leg axis, model y = 0) 920, back 1266.5. Head close-up (front): chin y 847, W = 332 px (0.676 m ->
491 px / m), centre x 220; head 3/4 close-up: chin y 850, centre x 580 (same scale).
Model renders (render_views.py): body_* ortho 1.60 m over 1000 px, centre z 0.72 m, x centre y 0.02 (side);
head_* ortho 1.00 m over 1000 px, centre z 1.00 m.
"""
import os, subprocess, sys
ROOT = os.path.dirname(os.path.abspath(__file__))
CMP = 'D:/projects/chewy-life-3d/.claude/skills/toybox-character/scripts/compare.py'
SHEET = os.path.join(ROOT, 'refs', 'sheet.png')
PV = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'preview')
SP = 318.; GY = 499.; BP = 625.; BGY = 500 + .72 * BP
def sbox(cx, x0=-.65, x1=.65, z0=-.05, z1=1.46):
    return '%d,%d,%d,%d' % (cx + x0 * SP, GY - z1 * SP, cx + x1 * SP, GY - z0 * SP)
def mbox(cx=500, x0=-.65, x1=.65, z0=-.05, z1=1.46, yoff=0.):
    return '%d,%d,%d,%d' % (cx + (x0 - yoff) * BP, BGY - z1 * BP, cx + (x1 - yoff) * BP, BGY - z0 * BP)
W = .676; HPX = 1000.; HCHIN = 500 + (1.00 - .654) * HPX
def shbox(cx, chin, top=.92, bot=.12, half=.55, Wp=332.):
    return '%d,%d,%d,%d' % (cx - half * Wp, chin - top * Wp, cx + half * Wp, chin + bot * Wp)
def mhbox(cx=500, top=.92, bot=.12, half=.55):
    Wp = W * HPX; return '%d,%d,%d,%d' % (cx - half * Wp, HCHIN - top * Wp, cx + half * Wp, HCHIN + bot * Wp)
def run(out, *items):
    subprocess.run([sys.executable, CMP, os.path.join(PV, out), '--h', '460'] + list(items), check=True)
pv = lambda n: os.path.join(PV, n)
run('cmp-body.png', 'SHEET front::%s::%s' % (SHEET, sbox(231.5)), 'MODEL front::%s::%s' % (pv('body_front.png'), mbox()),
    'SHEET side::%s::%s' % (SHEET, sbox(920, -.45, .45)), 'MODEL side::%s::%s' % (pv('body_side.png'), mbox(500, -.45, .45, yoff=.02)),
    'SHEET back::%s::%s' % (SHEET, sbox(1266.5)), 'MODEL back::%s::%s' % (pv('body_back.png'), mbox()))
run('cmp-side.png', 'SHEET side::%s::%s' % (SHEET, sbox(920, -.45, .45)), 'MODEL side::%s::%s' % (pv('body_side.png'), mbox(500, -.45, .45, yoff=.02)))
run('cmp-back.png', 'SHEET back::%s::%s' % (SHEET, sbox(1266.5)), 'MODEL back::%s::%s' % (pv('body_back.png'), mbox()))
run('cmp-34.png', 'SHEET 3/4::%s::%s' % (SHEET, sbox(578)), 'MODEL 3/4 (his right, as the sheet)::%s::%s' % (pv('body_34R.png'), mbox()))
run('cmp-head.png', 'SHEET head front::%s::%s' % (SHEET, shbox(220, 847)), 'MODEL head front::%s::%s' % (pv('head_front.png'), mhbox()),
    '--row', 'SHEET head 3/4::%s::%s' % (SHEET, shbox(580, 850)), 'MODEL head 3/4 (his right)::%s::%s' % (pv('head_34R.png'), mhbox()))
# the eyes: a band 0.40 W tall round the eye line, 1.0 W wide
ez_s = 847 - .316 * 332; ez_m = HCHIN - .316 * W * HPX
run('cmp-eyes.png', 'SHEET eyes::%s::%d,%d,%d,%d' % (SHEET, 223 - .45 * 332, ez_s - .16 * 332, 223 + .45 * 332, ez_s + .24 * 332),
    'MODEL eyes::%s::%d,%d,%d,%d' % (pv('head_front.png'), 500 - .45 * W * HPX, ez_m - .16 * W * HPX, 500 + .45 * W * HPX, ez_m + .24 * W * HPX))
print('compare done')
