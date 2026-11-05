"""Same-scale comparisons of the yk-yuzu-toy renders against refs/sheet.png (the toybox compare.py).

    python make_compare.py [preview_dir]

Sheet anchors (sheet px, measure.md): turnaround ground y 513.5, ear tops y 93 -> 375.4 px / m; body centre x: front 226.5,
3/4 576, side (the leg axis, model y = 0) 889, back 1272.5. Head close-up (front): chin y 794, W = 284 px, feature centre
x 201; head 3/4 close-up: chin y 795, centre x 514. The close-up face is drawn 7 % taller than the turnaround's, and the
model follows the turnaround's head height, so the close-up crops are squashed vertically by 0.936 about the chin first
(scratch/sheet_head_sq.png), which is how the build maps them.
Model renders (render_views.py): body_* ortho 1.30 m over 1000 px, centre z 0.57 m, centre y 0.02 (side);
head_* ortho 0.90 m over 1000 px, centre (0, 0.03, 0.85) m.
"""
import os, subprocess, sys
from PIL import Image
ROOT = os.path.dirname(os.path.abspath(__file__))
CMP = 'D:/projects/chewy-life-3d/.claude/skills/toybox-character/scripts/compare.py'
SHEET = os.path.join(ROOT, 'refs', 'sheet.png')
PV = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'preview')
SP = 375.4; GY = 513.5; BP = 1000 / 1.30; BGY = 500 + .57 * BP
def sbox(cx, x0=-.55, x1=.55, z0=-.03, z1=1.15):
    return '%d,%d,%d,%d' % (cx + x0 * SP, GY - z1 * SP, cx + x1 * SP, GY - z0 * SP)
def mbox(cx=500, x0=-.55, x1=.55, z0=-.03, z1=1.15, yoff=0.):
    return '%d,%d,%d,%d' % (cx + (x0 - yoff) * BP, BGY - z1 * BP, cx + (x1 - yoff) * BP, BGY - z0 * BP)
W = .610; CHIN = .641; HPX = 1000 / .90; HCHIN = 500 + (.85 - CHIN) * HPX; HXC = 500
# the squashed close-up strip (rows 540..850 of the sheet, squashed by 0.936 about the chin y 794)
SQ = .936
sh = Image.open(SHEET).convert('RGB'); strip = sh.crop((0, 540, sh.width, 850))
hs = int(round(strip.height * SQ)); strip = strip.resize((strip.width, hs), Image.LANCZOS)
SQ_PATH = os.path.join(ROOT, 'scratch', 'sheet_head_sq.png'); strip.save(SQ_PATH)
CH_SQ = (794 - 540) * SQ                       # the chin's y in the squashed strip
def shbox(cx, chin, top=.86, bot=.10, half=.56, Wp=284.):
    return '%d,%d,%d,%d' % (cx - half * Wp, chin - top * Wp, cx + half * Wp, chin + bot * Wp)
def mhbox(cx=HXC, top=.86, bot=.10, half=.56):
    Wp = W * HPX; return '%d,%d,%d,%d' % (cx - half * Wp, HCHIN - top * Wp, cx + half * Wp, HCHIN + bot * Wp)
def run(out, *items):
    subprocess.run([sys.executable, CMP, os.path.join(PV, out), '--h', '460'] + list(items), check=True)
pv = lambda n: os.path.join(PV, n)
run('cmp-body.png', 'SHEET front::%s::%s' % (SHEET, sbox(226.5)), 'MODEL front::%s::%s' % (pv('body_front.png'), mbox()),
    'SHEET side::%s::%s' % (SHEET, sbox(889, -.40, .70)), 'MODEL side::%s::%s' % (pv('body_side.png'), mbox(500, -.40, .70, yoff=.02)),
    'SHEET back::%s::%s' % (SHEET, sbox(1272.5)), 'MODEL back::%s::%s' % (pv('body_back.png'), mbox()))
run('cmp-side.png', 'SHEET side::%s::%s' % (SHEET, sbox(889, -.40, .70)), 'MODEL side::%s::%s' % (pv('body_side.png'), mbox(500, -.40, .70, yoff=.02)))
run('cmp-back.png', 'SHEET back::%s::%s' % (SHEET, sbox(1272.5)), 'MODEL back::%s::%s' % (pv('body_back.png'), mbox()))
run('cmp-34.png', 'SHEET 3/4::%s::%s' % (SHEET, sbox(576)), 'MODEL 3/4 (her front-right, as the sheet)::%s::%s' % (pv('body_34R.png'), mbox()))
run('cmp-head.png', 'SHEET head front (x0.936 tall)::%s::%s' % (SQ_PATH, shbox(201, CH_SQ)), 'MODEL head front::%s::%s' % (pv('head_front.png'), mhbox()),
    '--row', 'SHEET head 3/4 (x0.936 tall)::%s::%s' % (SQ_PATH, shbox(514, (795 - 540) * SQ)), 'MODEL head 3/4 (her front-right)::%s::%s' % (pv('head_34R.png'), mhbox()))
# the turnaround's own head (no squash) against the model at the same scale
run('cmp-head-turn.png', 'SHEET turnaround head::%s::%s' % (SHEET, sbox(226.5, -.36, .36, .55, 1.15)),
    'MODEL head::%s::%s' % (pv('body_front.png'), mbox(500, -.36, .36, .55, 1.15)))
# the eyes: a band 0.40 W tall round the eye line, 0.9 W wide
ez_s = CH_SQ - .3015 * 284; ez_m = HCHIN - .3015 * W * HPX
run('cmp-eyes.png', 'SHEET eyes::%s::%d,%d,%d,%d' % (SQ_PATH, 201 - .45 * 284, ez_s - .20 * 284, 201 + .45 * 284, ez_s + .20 * 284),
    'MODEL eyes::%s::%d,%d,%d,%d' % (pv('head_front.png'), HXC - .45 * W * HPX, ez_m - .20 * W * HPX, HXC + .45 * W * HPX, ez_m + .20 * W * HPX))
print('compare done')
