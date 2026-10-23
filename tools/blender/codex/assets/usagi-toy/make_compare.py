"""Same-scale comparisons of the Usagi renders against refs/sheet.png, via .claude/skills/toybox-character/scripts/compare.py.
    python make_compare.py
Sheet anchors (sheet px, measure.md): full-body panels ground y 515, 417 px / m (front ear tips y 56 = 1.10 m); body centres
x 234 (front), 590 (3/4), 913 (side), 1305 (back). Head close-up: chin y 846, W 253 px, centre x 198.5 (3/4: centre ~545).
Model renders (render_views.py): body_* ortho 1.25 m over 1000 px, centre z 0.55 -> ground y 940, 800 px / m, centre x 450;
head_* ortho 0.84 m over 1000 px, centre z 0.74 -> chin (0.424 m) at y 876, W = 0.532 m = 633 px, centre x 500.
"""
import os, subprocess, sys
ROOT = os.path.dirname(os.path.abspath(__file__))
CMP = 'D:/projects/chewy-life-3d/.claude/skills/toybox-character/scripts/compare.py'
SHEET = os.path.join(ROOT, 'refs', 'sheet.png'); PV = os.path.join(ROOT, 'preview')
def body_box(ground, cx, pxm, half=.36, top=1.16, bot=.03):
    return '%d,%d,%d,%d' % (cx - half * pxm, ground - top * pxm, cx + half * pxm, ground + bot * pxm)
def head_box(chin, cx, Wp, half=.74, top=1.32, bot=.14):
    return '%d,%d,%d,%d' % (cx - half * Wp, chin - top * Wp, cx + half * Wp, chin + bot * Wp)
def run(out, *items):
    subprocess.run([sys.executable, CMP, os.path.join(PV, out), '--h', '460'] + list(items), check=True)
def P(n): return os.path.join(PV, n)
run('cmp-body.png', 'SHEET front::%s::%s' % (SHEET, body_box(515, 234, 417)), 'MODEL front::%s::%s' % (P('body_front.png'), body_box(940, 450, 800)),
    'SHEET side::%s::%s' % (SHEET, body_box(515, 925, 417, half=.33)), 'MODEL side::%s::%s' % (P('body_side.png'), body_box(940, 460, 800, half=.33)),
    'SHEET back::%s::%s' % (SHEET, body_box(515, 1305, 417)), 'MODEL back::%s::%s' % (P('body_back.png'), body_box(940, 450, 800)))
run('cmp-34.png', 'SHEET 3/4::%s::%s' % (SHEET, body_box(515, 590, 417)), 'MODEL 3/4::%s::%s' % (P('body_34.png'), body_box(940, 450, 800)))
run('cmp-side.png', 'SHEET side::%s::%s' % (SHEET, body_box(515, 925, 417, half=.33)), 'MODEL side::%s::%s' % (P('body_side.png'), body_box(940, 460, 800, half=.33)))
run('cmp-back.png', 'SHEET back::%s::%s' % (SHEET, body_box(515, 1305, 417)), 'MODEL back::%s::%s' % (P('body_back.png'), body_box(940, 450, 800)))
run('cmp-head.png', 'SHEET head front::%s::%s' % (SHEET, head_box(846, 198.5, 253)), 'MODEL head front::%s::%s' % (P('head_front.png'), head_box(876, 500, 633)),
    '--row', 'SHEET head 3/4::%s::%s' % (SHEET, head_box(850, 548, 253)), 'MODEL head 3/4::%s::%s' % (P('head_34.png'), head_box(876, 470, 633)))
EY_S = 846 - .336 * 253; EY_M = 876 - .336 * 633
run('cmp-eyes.png', 'SHEET eyes::%s::%d,%d,%d,%d' % (SHEET, 198.5 - .45 * 253, EY_S - .20 * 253, 198.5 + .45 * 253, EY_S + .20 * 253),
    'MODEL eyes::%s::%d,%d,%d,%d' % (P('head_front.png'), 500 - .45 * 633, EY_M - .20 * 633, 500 + .45 * 633, EY_M + .20 * 633))
print('compare done')
