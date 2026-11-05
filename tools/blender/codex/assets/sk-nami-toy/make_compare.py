"""Same-scale comparisons of the Nami renders against refs/sheet.png, via .claude/skills/toybox-character/scripts/compare.py.
    python make_compare.py
Sheet anchors (sheet px, measure.md): full-body panels ground y 512, 424 px / m (ear tips y 67 = 1.05 m); body axes x 271 (front),
585 (3/4, turned to her LEFT), 878.7 (side: her LEFT side; the head centre at 893.5 sits 0.035 m behind the body axis), 1195.5 (back).
Head close-up: chin y 785, W 235 px, centre x 201 (3/4: chin ~787, centre ~507).
Model renders (render_views.py): body_* ortho 1.18 m over 1000 px, centre z 0.54 -> ground y 957.6, 847.5 px / m, centre x 450;
head_* ortho 0.72 m over 1000 px, centre z 0.78 -> chin (0.514 m) at y 869.4, W = 0.458 m = 636 px, centre x 500.
The sheet's side and 3/4 views show her LEFT side (the flower), so they pair with body_side / body_34 / head_34.
"""
import os, subprocess, sys
ROOT = os.path.dirname(os.path.abspath(__file__))
CMP = 'D:/projects/chewy-life-3d/.claude/skills/toybox-character/scripts/compare.py'
SHEET = os.path.join(ROOT, 'refs', 'sheet.png'); PV = os.path.join(ROOT, 'preview')
K = 1.18      # the export scale: the renders' framings scale with it, so the model's pixel anchors are unchanged
SG, SPX = 512, 424.; MG, MPX = 500 + .54 * 1000 / 1.18, 1000 / 1.18
CH_S, W_S = 785, 235.; CH_M, W_M = 500 + (.78 - .514) * 1000 / .72, 1000 / .72 * .458
def body_box(ground, cx, pxm, half=.40, top=1.10, bot=.03):
    return '%d,%d,%d,%d' % (cx - half * pxm, ground - top * pxm, cx + half * pxm, ground + bot * pxm)
def head_box(chin, cx, Wp, half=.62, top=1.25, bot=.10):
    return '%d,%d,%d,%d' % (cx - half * Wp, chin - top * Wp, cx + half * Wp, chin + bot * Wp)
def run(out, *items):
    subprocess.run([sys.executable, CMP, os.path.join(PV, out), '--h', '460'] + list(items), check=True)
def P(n): return os.path.join(PV, n)
run('cmp-body.png', 'SHEET front::%s::%s' % (SHEET, body_box(SG, 271, SPX)), 'MODEL front::%s::%s' % (P('body_front.png'), body_box(MG, 450, MPX)),
    'SHEET side::%s::%s' % (SHEET, body_box(SG, 878.7, SPX)), 'MODEL side (her left)::%s::%s' % (P('body_side.png'), body_box(MG, 450, MPX)),
    'SHEET back::%s::%s' % (SHEET, body_box(SG, 1195.5, SPX)), 'MODEL back::%s::%s' % (P('body_back.png'), body_box(MG, 450, MPX)))
run('cmp-34.png', 'SHEET 3/4::%s::%s' % (SHEET, body_box(SG, 585, SPX)), 'MODEL 3/4 (her left)::%s::%s' % (P('body_34.png'), body_box(MG, 450, MPX)))
run('cmp-side.png', 'SHEET side::%s::%s' % (SHEET, body_box(SG, 878.7, SPX)), 'MODEL side (her left)::%s::%s' % (P('body_side.png'), body_box(MG, 450, MPX)))
run('cmp-back.png', 'SHEET back::%s::%s' % (SHEET, body_box(SG, 1195.5, SPX)), 'MODEL back::%s::%s' % (P('body_back.png'), body_box(MG, 450, MPX)))
run('cmp-head.png', 'SHEET head front::%s::%s' % (SHEET, head_box(CH_S, 201, W_S)), 'MODEL head front::%s::%s' % (P('head_front.png'), head_box(CH_M, 500, W_M)),
    '--row', 'SHEET head 3/4::%s::%s' % (SHEET, head_box(787, 507, W_S)), 'MODEL head 3/4 (her left)::%s::%s' % (P('head_34.png'), head_box(CH_M, 470, W_M)))
EY_S = CH_S - .350 * W_S; EY_M = CH_M - .350 * W_M
run('cmp-eyes.png', 'SHEET eyes::%s::%d,%d,%d,%d' % (SHEET, 201 - .45 * W_S, EY_S - .20 * W_S, 201 + .45 * W_S, EY_S + .20 * W_S),
    'MODEL eyes::%s::%d,%d,%d,%d' % (P('head_front.png'), 500 - .45 * W_M, EY_M - .20 * W_M, 500 + .45 * W_M, EY_M + .20 * W_M))
print('compare done')
