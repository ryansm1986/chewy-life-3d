"""Same-scale comparisons of the folk-bunny renders against refs/sheet.png (via the toybox-character compare.py), plus the
family line-up crop.
    python make_compare.py a|b
Sheet anchors (sheet px, measure-<x>.md): upper-row body views, 327.6 px / m; A ground y 547, front centre x 150, 3/4 x 383;
B ground y 545, front centre x 648.5, 3/4 x 900. Lower row (smaller, own scales): A side ground 861 (211.5 px / m) x 82,
back ground 861 (207 px / m) x 230; B side ground 859 (226 px / m) x 580, back ground 857 (224 px / m) x 732.
Head close-ups: A chin y 843, W 182 px, centre x 407; B chin y 817, W 184.6 px, centre x 918.
Model renders (render_views.py): body_* ortho 1.45 m over 1000 px, centre z 0.66 -> ground y 955, 689.7 px / m, centre x 450;
head_* ortho 0.90 m over 1000 px, centre z 0.92.
The sheet's side views show the character's LEFT side (A's flower is on the near side), so they pair with body_side.
"""
import os, subprocess, sys
ROOT = os.path.dirname(os.path.abspath(__file__))
D = sys.argv[1] if len(sys.argv) > 1 else 'a'
CMP = 'D:/projects/chewy-life-3d/.claude/skills/toybox-character/scripts/compare.py'
SHEET = os.path.join(ROOT, 'refs', 'sheet.png'); PV = os.path.join(ROOT, 'preview', D)
MG, MPX = 955, 1000 / 1.45
W_M = {'a': .601, 'b': .615}[D]; CHIN_M = {'a': .586, 'b': .589}[D]
S = {'a': dict(g=547, fx=150, tx=383, sg=861, spx=211.5, sx=82, bg=861, bpx=207, bx=230, ch=843, W=182, hx=407),
     'b': dict(g=545, fx=648.5, tx=900, sg=859, spx=226, sx=580, bg=857, bpx=224, bx=732, ch=817, W=184.6, hx=918)}[D]
SPX = 327.6
def body_box(ground, cx, pxm, half=.52, top=1.42, bot=.03):
    return '%d,%d,%d,%d' % (cx - half * pxm, ground - top * pxm, cx + half * pxm, ground + bot * pxm)
def head_box(chin, cx, Wp, half=.78, top=1.30, bot=.20):
    return '%d,%d,%d,%d' % (cx - half * Wp, chin - top * Wp, cx + half * Wp, chin + bot * Wp)
def run(out, *items):
    subprocess.run([sys.executable, CMP, os.path.join(PV, out), '--h', '460'] + list(items), check=True)
def P(n): return os.path.join(PV, n)
run('cmp-body.png', 'SHEET front::%s::%s' % (SHEET, body_box(S['g'], S['fx'], SPX)), 'MODEL front::%s::%s' % (P('body_front.png'), body_box(MG, 450, MPX)),
    'SHEET side::%s::%s' % (SHEET, body_box(S['sg'], S['sx'], S['spx'])), 'MODEL side::%s::%s' % (P('body_side.png'), body_box(MG, 450, MPX)),
    'SHEET back::%s::%s' % (SHEET, body_box(S['bg'], S['bx'], S['bpx'])), 'MODEL back::%s::%s' % (P('body_back.png'), body_box(MG, 450, MPX)))
run('cmp-34.png', 'SHEET 3/4::%s::%s' % (SHEET, body_box(S['g'], S['tx'], SPX)), 'MODEL 3/4::%s::%s' % (P('body_34.png'), body_box(MG, 450, MPX)))
CH_M = 500 + (.92 - CHIN_M) * 1000 / .90; WP = W_M * 1000 / .90
run('cmp-head.png', 'SHEET head front::%s::%s' % (SHEET, head_box(S['ch'], S['hx'], S['W'])), 'MODEL head front::%s::%s' % (P('head_front.png'), head_box(CH_M, 500, WP)))
EZ = {'a': .376, 'b': .366}[D]
EY_S = S['ch'] - EZ * S['W']; EY_M = CH_M - EZ * WP
run('cmp-eyes.png', 'SHEET eyes::%s::%d,%d,%d,%d' % (SHEET, S['hx'] - .45 * S['W'], EY_S - .20 * S['W'], S['hx'] + .45 * S['W'], EY_S + .20 * S['W']),
    'MODEL eyes::%s::%d,%d,%d,%d' % (P('head_front.png'), 500 - .45 * WP, EY_M - .20 * WP, 500 + .45 * WP, EY_M + .20 * WP))
print('compare done', D)
