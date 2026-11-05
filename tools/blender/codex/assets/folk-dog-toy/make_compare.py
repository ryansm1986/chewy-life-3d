"""Same-scale comparisons of the folk-dog renders against refs/sheet.png (via the toybox-character compare.py).
    python make_compare.py a|c
Sheet anchors (sheet px, measure-<x>.md): A upper row, ground y 307, 221 px / m: front centre x 177, 3/4 x 398, side (body
axis) x 588, back x 792; C lower row, ground y 955, 234 px / m: front centre x 170, 3/4 x 380, side x 570, back x 792.
Head close-ups: A chin y 283.3, W 205 px, centre x 1075.8; C chin y 940, W 258 px, centre x 1069.2.
Model renders (render_views.py): body_* ortho 1.45 m over 1000 px, centre z 0.66 -> ground y 955, 689.7 px / m, centre x 450;
head_* ortho 0.90 m over 1000 px, centre z HZ (A 0.80, C 0.75).
The sheet's side views show the character's LEFT side (A's leaf, C's satchel on the near side), so they pair with body_side.
"""
import os, subprocess, sys
ROOT = os.path.dirname(os.path.abspath(__file__))
D = sys.argv[1] if len(sys.argv) > 1 else 'a'
CMP = 'D:/projects/chewy-life-3d/.claude/skills/toybox-character/scripts/compare.py'
SHEET = os.path.join(ROOT, 'refs', 'sheet.png'); PV = os.path.join(ROOT, 'preview', D)
MG, MPX = 955, 1000 / 1.45
W_M = {'a': .566, 'c': .641}[D]; CHIN_M = {'a': .550, 'c': .523}[D]; HZ = {'a': .80, 'c': .75}[D]
S = {'a': dict(g=307, px=221, fx=177, tx=398, sx=588, bx=792, ch=283.3, W=205, hx=1075.8, EZ=.415, H=.89 / .966),
     'c': dict(g=955, px=234, fx=170, tx=380, sx=570, bx=792, ch=940, W=258, hx=1069.2, EZ=.325, H=.68 / .717)}[D]
def body_box(ground, cx, pxm, half=.50, top=1.12, bot=.03):
    return '%d,%d,%d,%d' % (cx - half * pxm, ground - top * pxm, cx + half * pxm, ground + bot * pxm)
def head_box(chin, cx, Wp, half=.85, top=None, bot=.16, vs=1.):
    top = top or (1.12 if D == 'a' else 1.0)
    return '%d,%d,%d,%d' % (cx - half * Wp, chin - top * Wp * vs, cx + half * Wp, chin + bot * Wp * vs)
def run(out, *items):
    subprocess.run([sys.executable, CMP, os.path.join(PV, out), '--h', '460'] + list(items), check=True)
def P(n): return os.path.join(PV, n)
SP = S['px']
run('cmp-body.png', 'SHEET front::%s::%s' % (SHEET, body_box(S['g'], S['fx'], SP)), 'MODEL front::%s::%s' % (P('body_front.png'), body_box(MG, 450, MPX)),
    'SHEET side::%s::%s' % (SHEET, body_box(S['g'], S['sx'], SP)), 'MODEL side::%s::%s' % (P('body_side.png'), body_box(MG, 450, MPX)),
    'SHEET back::%s::%s' % (SHEET, body_box(S['g'], S['bx'], SP)), 'MODEL back::%s::%s' % (P('body_back.png'), body_box(MG, 450, MPX)))
run('cmp-34.png', 'SHEET 3/4::%s::%s' % (SHEET, body_box(S['g'], S['tx'], SP)), 'MODEL 3/4::%s::%s' % (P('body_34.png'), body_box(MG, 450, MPX)))
CH_M = 500 + (HZ - CHIN_M) * 1000 / .90; WP = W_M * 1000 / .90
# the close-up is drawn taller than the body view (A 0.966 vs 0.89 head heights, C 0.717 vs 0.68): its crop is squashed by H so
# both show the head at the body view's proportions
run('cmp-head.png', 'SHEET head front::%s::%s' % (SHEET, head_box(S['ch'], S['hx'], S['W'], vs=1 / S['H'])), 'MODEL head front::%s::%s' % (P('head_front.png'), head_box(CH_M, 500, WP)))
EY_S = S['ch'] - S['EZ'] / S['H'] * S['W']; EY_M = CH_M - S['EZ'] * WP
run('cmp-eyes.png', 'SHEET eyes::%s::%d,%d,%d,%d' % (SHEET, S['hx'] - .45 * S['W'], EY_S - .20 * S['W'], S['hx'] + .45 * S['W'], EY_S + .20 * S['W']),
    'MODEL eyes::%s::%d,%d,%d,%d' % (P('head_front.png'), 500 - .45 * WP, EY_M - .20 * WP, 500 + .45 * WP, EY_M + .20 * WP))
print('compare done', D)
