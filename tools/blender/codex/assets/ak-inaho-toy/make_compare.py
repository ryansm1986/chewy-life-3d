"""Same-scale comparisons of the Inaho renders against refs/sheet.png, via .claude/skills/toybox-character/scripts/compare.py.
    python make_compare.py [preview_dir]
Sheet anchors (sheet px, measure.md): full-body panels ground y 471, 299 px / m (ear tips y 67 = 1.35 m); body centres
x 267.5 (front), 590 (3/4, turned to the viewer's left: her left side), 888 (side, facing left: her left side), 1205.5 (back).
Head close-up: chin y 815, W 257 px, centre x 202 (3/4: chin ~812, centre ~545).
Model renders (render_views.py): body_* ortho 1.50 m over 1000 px, centre z 0.70 -> ground y 966.7, 666.7 px / m, centre x 450;
head_* ortho 1.00 m over 1000 px, centre z 0.94 -> chin (0.56 m) at y 880, W = 0.625 m = 625 px, centre x 500.
The sheet's side and 3/4 views face the viewer's left, so they pair with body_side / body_34 / head_side / head_34 (camera on +x).
"""
import os, subprocess, sys
ROOT = os.path.dirname(os.path.abspath(__file__))
CMP = 'D:/projects/chewy-life-3d/.claude/skills/toybox-character/scripts/compare.py'
SHEET = os.path.join(ROOT, 'refs', 'sheet.png'); PV = os.path.join(ROOT, sys.argv[1] if len(sys.argv) > 1 else 'preview')
SG, SPX = 471, 299.; MG, MPX = 966.7, 1000 / 1.50
CH_S, W_S = 815, 257.; CH_M, W_M = 880, 625.
def body_box(ground, cx, pxm, half=.50, top=1.42, bot=.03):
    return '%d,%d,%d,%d' % (cx - half * pxm, ground - top * pxm, cx + half * pxm, ground + bot * pxm)
def head_box(chin, cx, Wp, half=.74, top=1.32, bot=.10):
    return '%d,%d,%d,%d' % (cx - half * Wp, chin - top * Wp, cx + half * Wp, chin + bot * Wp)
def run(out, *items):
    subprocess.run([sys.executable, CMP, os.path.join(PV, out), '--h', '460'] + list(items), check=True)
def P(n): return os.path.join(PV, n)
if os.path.exists(P('body_front.png')):
    run('cmp-body.png', 'SHEET front::%s::%s' % (SHEET, body_box(SG, 267.5, SPX)), 'MODEL front::%s::%s' % (P('body_front.png'), body_box(MG, 450, MPX)),
        'SHEET side::%s::%s' % (SHEET, body_box(SG, 888, SPX, half=.45)), 'MODEL side::%s::%s' % (P('body_side.png'), body_box(MG, 450, MPX, half=.45)),
        'SHEET back::%s::%s' % (SHEET, body_box(SG, 1205.5, SPX)), 'MODEL back::%s::%s' % (P('body_back.png'), body_box(MG, 450, MPX)))
    run('cmp-34.png', 'SHEET 3/4::%s::%s' % (SHEET, body_box(SG, 590, SPX)), 'MODEL 3/4::%s::%s' % (P('body_34.png'), body_box(MG, 450, MPX)))
    run('cmp-side.png', 'SHEET side::%s::%s' % (SHEET, body_box(SG, 888, SPX, half=.45)), 'MODEL side::%s::%s' % (P('body_side.png'), body_box(MG, 450, MPX, half=.45)))
    run('cmp-back.png', 'SHEET back::%s::%s' % (SHEET, body_box(SG, 1205.5, SPX)), 'MODEL back::%s::%s' % (P('body_back.png'), body_box(MG, 450, MPX)))
run('cmp-head.png', 'SHEET head front::%s::%s' % (SHEET, head_box(CH_S, 202, W_S)), 'MODEL head front::%s::%s' % (P('head_front.png'), head_box(CH_M, 500, W_M)),
    '--row', 'SHEET head 3/4::%s::%s' % (SHEET, head_box(812, 545, W_S)), 'MODEL head 3/4::%s::%s' % (P('head_34.png'), head_box(CH_M, 530, W_M)))
EY_S = CH_S - .371 * W_S; EY_M = CH_M - .371 * W_M
run('cmp-eyes.png', 'SHEET eyes::%s::%d,%d,%d,%d' % (SHEET, 202 - .45 * W_S, EY_S - .20 * W_S, 202 + .45 * W_S, EY_S + .20 * W_S),
    'MODEL eyes::%s::%d,%d,%d,%d' % (P('head_front.png'), 500 - .45 * W_M, EY_M - .20 * W_M, 500 + .45 * W_M, EY_M + .20 * W_M))
print('compare done')
