"""Same-scale comparisons of the Shirayuki renders against refs/sheet.png, via .claude/skills/toybox-character/scripts/compare.py.
    python make_compare.py
Sheet anchors (sheet px, measure.md): full-body panels ground y 516, 475 px / m (ear tips y 64.5 = 0.95 m); body centres
x 239.5 (front), 572 (3/4, turned to her right), 857 (side, her LEFT side, body axis), 1161.5 (back). Head close-up: chin y 826.5,
W 246 px, centre x 217.5 (3/4: chin ~828, centre ~520).
Model renders (render_views.py): body_* ortho 1.05 m over 1000 px, centre z 0.48 -> ground y 957, 952.4 px / m, centre x 450;
head_* ortho 0.62 m over 1000 px, centre z 0.66 -> chin (0.461 m) at y 821, W = 0.404 m = 651.6 px, centre x 500.
The sheet's side view shows her LEFT side (body_side); the 3/4 view her right side (body_34R / head_34R).
"""
import os, subprocess, sys
ROOT = os.path.dirname(os.path.abspath(__file__))
CMP = 'D:/projects/chewy-life-3d/.claude/skills/toybox-character/scripts/compare.py'
SHEET = os.path.join(ROOT, 'refs', 'sheet.png'); PV = os.path.join(ROOT, 'preview')
SG, SPX = 516, 475.; MG, MPX = 957, 1000 / 1.05
CH_S, W_S = 826.5, 246.; CH_M, W_M = 821, 1000 / .62 * .404
def body_box(ground, cx, pxm, half=.36, top=1.00, bot=.03):
    return '%d,%d,%d,%d' % (cx - half * pxm, ground - top * pxm, cx + half * pxm, ground + bot * pxm)
def head_box(chin, cx, Wp, half=.70, top=1.28, bot=.10):
    return '%d,%d,%d,%d' % (cx - half * Wp, chin - top * Wp, cx + half * Wp, chin + bot * Wp)
def run(out, *items):
    subprocess.run([sys.executable, CMP, os.path.join(PV, out), '--h', '460'] + list(items), check=True)
def P(n): return os.path.join(PV, n)
run('cmp-body.png', 'SHEET front::%s::%s' % (SHEET, body_box(SG, 239.5, SPX)), 'MODEL front::%s::%s' % (P('body_front.png'), body_box(MG, 450, MPX)),
    'SHEET side (her left)::%s::%s' % (SHEET, body_box(SG, 857, SPX, half=.30)), 'MODEL side::%s::%s' % (P('body_side.png'), body_box(MG, 450, MPX, half=.30)),
    'SHEET back::%s::%s' % (SHEET, body_box(SG, 1161.5, SPX)), 'MODEL back::%s::%s' % (P('body_back.png'), body_box(MG, 450, MPX)))
run('cmp-34.png', 'SHEET 3/4::%s::%s' % (SHEET, body_box(SG, 572, SPX)), 'MODEL 3/4 (her right)::%s::%s' % (P('body_34R.png'), body_box(MG, 450, MPX)))
run('cmp-side.png', 'SHEET side (her left)::%s::%s' % (SHEET, body_box(SG, 857, SPX, half=.30)), 'MODEL side (her left)::%s::%s' % (P('body_side.png'), body_box(MG, 450, MPX, half=.30)))
run('cmp-back.png', 'SHEET back::%s::%s' % (SHEET, body_box(SG, 1161.5, SPX)), 'MODEL back::%s::%s' % (P('body_back.png'), body_box(MG, 450, MPX)))
run('cmp-head.png', 'SHEET head front::%s::%s' % (SHEET, head_box(CH_S, 217.5, W_S)), 'MODEL head front::%s::%s' % (P('head_front.png'), head_box(CH_M, 500, W_M)),
    '--row', 'SHEET head 3/4::%s::%s' % (SHEET, head_box(828, 520, W_S)), 'MODEL head 3/4 (her right)::%s::%s' % (P('head_34R.png'), head_box(CH_M, 520, W_M)))
EY_S = CH_S - .397 * W_S; EY_M = CH_M - .397 * W_M
run('cmp-eyes.png', 'SHEET eyes::%s::%d,%d,%d,%d' % (SHEET, 217.5 - .45 * W_S, EY_S - .20 * W_S, 217.5 + .45 * W_S, EY_S + .20 * W_S),
    'MODEL eyes::%s::%d,%d,%d,%d' % (P('head_front.png'), 500 - .45 * W_M, EY_M - .20 * W_M, 500 + .45 * W_M, EY_M + .20 * W_M))
print('compare done')
