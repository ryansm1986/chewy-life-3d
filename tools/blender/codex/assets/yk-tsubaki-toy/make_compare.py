"""Same-scale comparisons of the yk-tsubaki-toy renders against refs/sheet.png (the toybox compare.py).

    python make_compare.py [preview_dir]

Sheet anchors (sheet px, measure.md): turnaround ground y 514, ear tips (front) y 76 -> 1.05 m = 417.1 px / m; body
centre x: front 241.5, 3/4 590, side 902 (model y = 0), back 1269.5. Head close-up (front): chin y 819.5, W = 289 px
(0.583 m), features centred on x 190; head 3/4 close-up: chin y 820, centre x 528 (same zoom).
Model renders (render_views.py): body_* ortho 1.25 m over 1000 px (800 px / m), centre z 0.56 m;
head_* ortho 0.90 m over 1000 px (1111 px / m), centre z 0.78 m.
"""
import os, subprocess, sys
ROOT = os.path.dirname(os.path.abspath(__file__))
CMP = 'D:/projects/chewy-life-3d/.claude/skills/toybox-character/scripts/compare.py'
SHEET = os.path.join(ROOT, 'refs', 'sheet.png')
PV = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'preview')
SP = 417.1; GY = 514.; BP = 800.; BGY = 500 + .56 * BP
def sbox(cx, x0=-.45, x1=.45, z0=-.03, z1=1.08):
    return '%d,%d,%d,%d' % (cx + x0 * SP, GY - z1 * SP, cx + x1 * SP, GY - z0 * SP)
def mbox(cx=500, x0=-.45, x1=.45, z0=-.03, z1=1.08):
    return '%d,%d,%d,%d' % (cx + x0 * BP, BGY - z1 * BP, cx + x1 * BP, BGY - z0 * BP)
W = .583; CHIN = .525; HPX = 1000 / .90; HCHIN = 500 + (.78 - CHIN) * HPX; WP = 289.
def shbox(cx, chin, top=.92, bot=.08, half=.62):
    return '%d,%d,%d,%d' % (cx - half * WP, chin - top * WP, cx + half * WP, chin + bot * WP)
def mhbox(cx=500, top=.92, bot=.08, half=.62):
    Wp = W * HPX; return '%d,%d,%d,%d' % (cx - half * Wp, HCHIN - top * Wp, cx + half * Wp, HCHIN + bot * Wp)
HQX = 528.
def run(out, *items):
    subprocess.run([sys.executable, CMP, os.path.join(PV, out), '--h', '460'] + list(items), check=True)
pv = lambda n: os.path.join(PV, n)
run('cmp-body.png', 'SHEET front::%s::%s' % (SHEET, sbox(241.5)), 'MODEL front::%s::%s' % (pv('body_front.png'), mbox()),
    'SHEET side::%s::%s' % (SHEET, sbox(902, -.45, .45)), 'MODEL side (her left)::%s::%s' % (pv('body_side.png'), mbox(500, -.45, .45)),
    'SHEET back::%s::%s' % (SHEET, sbox(1269.5)), 'MODEL back::%s::%s' % (pv('body_back.png'), mbox()))
run('cmp-side.png', 'SHEET side::%s::%s' % (SHEET, sbox(902, -.45, .45)), 'MODEL side (her left)::%s::%s' % (pv('body_side.png'), mbox(500, -.45, .45)))
run('cmp-back.png', 'SHEET back::%s::%s' % (SHEET, sbox(1269.5)), 'MODEL back::%s::%s' % (pv('body_back.png'), mbox()))
run('cmp-34.png', 'SHEET 3/4::%s::%s' % (SHEET, sbox(590)), 'MODEL 3/4 (her left near, as the sheet)::%s::%s' % (pv('body_34.png'), mbox()))
run('cmp-head.png', 'SHEET head front::%s::%s' % (SHEET, shbox(190, 819.5)), 'MODEL head front::%s::%s' % (pv('head_front.png'), mhbox()),
    '--row', 'SHEET head 3/4::%s::%s' % (SHEET, shbox(HQX, 820)), 'MODEL head 3/4::%s::%s' % (pv('head_34.png'), mhbox()))
# the eyes: a band round the eye line, 1.0 W wide
ez_s = 819.5 - .341 * WP; ez_m = HCHIN - .335 * W * HPX
run('cmp-eyes.png', 'SHEET eyes::%s::%d,%d,%d,%d' % (SHEET, 190 - .45 * WP, ez_s - .24 * WP, 190 + .45 * WP, ez_s + .20 * WP),
    'MODEL eyes::%s::%d,%d,%d,%d' % (pv('head_front.png'), 500 - .45 * W * HPX, ez_m - .24 * W * HPX, 500 + .45 * W * HPX, ez_m + .20 * W * HPX))
print('compare done')
