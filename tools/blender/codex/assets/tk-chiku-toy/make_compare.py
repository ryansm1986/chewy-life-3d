"""Same-scale comparisons of the Chiku renders against refs/sheet.png, via .claude/skills/toybox-character/scripts/compare.py.
    python make_compare.py
Sheet anchors (sheet px, measure.md): full-body panels ground y 521, 355 px / m (front crown y 148 = 1.05 m); body centres
x 218.5 (front), 575 (3/4, turned to her right), 901 (side, her right side, head centre), 1252 (back). Head close-up: chin y 842,
W 317 px, centre x 204 (3/4: chin ~848, centre ~562).
Model renders (render_views.py): body_* ortho 1.45 m over 1000 px, centre z 0.66 -> ground y 955, 689.7 px / m, centre x 450;
head_* ortho 0.90 m over 1000 px, centre z 0.92 -> chin (0.585 m) at y 872, W = 0.620 m = 689 px, centre x 500.
The sheet's side and 3/4 views show her RIGHT side, so they pair with body_sideR / body_34R / head_sideR / head_34R.
"""
import os, subprocess, sys
ROOT = os.path.dirname(os.path.abspath(__file__))
CMP = 'D:/projects/chewy-life-3d/.claude/skills/toybox-character/scripts/compare.py'
SHEET = os.path.join(ROOT, 'refs', 'sheet.png'); PV = os.path.join(ROOT, 'preview')
SG, SPX = 521, 355.; MG, MPX = 955, 1000 / 1.45
CH_S, W_S = 842, 317.; CH_M, W_M = 872, 1000 / .90 * .62
def body_box(ground, cx, pxm, half=.50, top=1.37, bot=.03):
    return '%d,%d,%d,%d' % (cx - half * pxm, ground - top * pxm, cx + half * pxm, ground + bot * pxm)
def head_box(chin, cx, Wp, half=.74, top=1.22, bot=.10):
    return '%d,%d,%d,%d' % (cx - half * Wp, chin - top * Wp, cx + half * Wp, chin + bot * Wp)
def run(out, *items):
    subprocess.run([sys.executable, CMP, os.path.join(PV, out), '--h', '460'] + list(items), check=True)
def P(n): return os.path.join(PV, n)
run('cmp-body.png', 'SHEET front::%s::%s' % (SHEET, body_box(SG, 218.5, SPX)), 'MODEL front::%s::%s' % (P('body_front.png'), body_box(MG, 450, MPX)),
    'SHEET side::%s::%s' % (SHEET, body_box(SG, 901, SPX, half=.42)), 'MODEL side::%s::%s' % (P('body_sideR.png'), body_box(MG, 450 - .012 * MPX, MPX, half=.42)),
    'SHEET back::%s::%s' % (SHEET, body_box(SG, 1252, SPX)), 'MODEL back::%s::%s' % (P('body_back.png'), body_box(MG, 450, MPX)))
run('cmp-34.png', 'SHEET 3/4::%s::%s' % (SHEET, body_box(SG, 575, SPX)), 'MODEL 3/4 (her right)::%s::%s' % (P('body_34R.png'), body_box(MG, 450, MPX)))
run('cmp-side.png', 'SHEET side::%s::%s' % (SHEET, body_box(SG, 901, SPX, half=.42)), 'MODEL side (her right)::%s::%s' % (P('body_sideR.png'), body_box(MG, 450 - .012 * MPX, MPX, half=.42)))
run('cmp-back.png', 'SHEET back::%s::%s' % (SHEET, body_box(SG, 1252, SPX)), 'MODEL back::%s::%s' % (P('body_back.png'), body_box(MG, 450, MPX)))
run('cmp-head.png', 'SHEET head front::%s::%s' % (SHEET, head_box(CH_S, 204, W_S)), 'MODEL head front::%s::%s' % (P('head_front.png'), head_box(CH_M, 500, W_M)),
    '--row', 'SHEET head 3/4::%s::%s' % (SHEET, head_box(848, 562, W_S)), 'MODEL head 3/4 (her right)::%s::%s' % (P('head_34R.png'), head_box(CH_M, 530, W_M)))
EY_S = CH_S - .338 * W_S; EY_M = CH_M - .338 * W_M
run('cmp-eyes.png', 'SHEET eyes::%s::%d,%d,%d,%d' % (SHEET, 204 - .45 * W_S, EY_S - .20 * W_S, 204 + .45 * W_S, EY_S + .20 * W_S),
    'MODEL eyes::%s::%d,%d,%d,%d' % (P('head_front.png'), 500 - .45 * W_M, EY_M - .20 * W_M, 500 + .45 * W_M, EY_M + .20 * W_M))
print('compare done')
