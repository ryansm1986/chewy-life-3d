"""Same-scale comparisons of the folk-fox-<x>-toy renders against refs/sheet.png, via the toybox compare.py.   python make_compare.py a|c
Each tile is framed by its own ear-tip-to-ground (body) or ear-tip-to-chin (head) height, so the tiles share that scale.
Sheet anchors (sheet px; measure-a.md / measure-c.md): (ear tip y, ground or chin y, centre x).
Model renders (render_views.py): body_* ortho 1.30 m over 1000 px, centre (0, 0.05, 0.55) m; head_* ortho HO over 1000 px, centre HC.
"""
import os, subprocess, sys, json
ROOT = os.path.dirname(os.path.abspath(__file__))
CMP = 'D:/projects/chewy-life-3d/.claude/skills/toybox-character/scripts/compare.py'
D = sys.argv[1] if len(sys.argv) > 1 else 'a'
SHEET = os.path.join(ROOT, 'refs', 'sheet.png'); PV = os.path.join(ROOT, 'preview', D)
A = {'a': {'front': (109, 462, 148.5), '34': (109, 462, 385), 'side': (483, 694, 74.5), 'back': (487, 695, 230), 'hf': (509, 687, 406)},
     'c': {'front': (128, 461, 1156.5), '34': (126, 461, 1395), 'side': (487, 695, 1101), 'back': (487, 694, 1246), 'hf': (509, 690, 1421.5)}}[D]
M = json.load(open(os.path.join(ROOT, 'measurements-model-%s.json' % D)))
TIP = M['bounds_m']['max'][2]; CHIN = M['chin_z_m']; W = M['W']
HCZ, HO = {'a': (.76, .95), 'c': (.67, .85)}[D]
def by(z, cz, ppm): return 500 - (z - cz) * ppm
BP = 1000 / 1.30; HP = 1000 / HO
def body_box(tip, ground, cx, top=.08, bot=.04, half=.55):
    T = ground - tip; return '%d,%d,%d,%d' % (cx - half * T, tip - top * T, cx + half * T, ground + bot * T)
MB = lambda cx=500: body_box(by(TIP, .55, BP), by(0, .55, BP), cx)
SIDE_CX = 500 - .05 * BP                     # the body axis (y = 0) in the side render (its centre is at y 0.05 m)
def head_box(tip, chin, cx, top=.08, bot=.10, half=.75):
    H = chin - tip; return '%d,%d,%d,%d' % (cx - half * H, tip - top * H, cx + half * H, chin + bot * H)
MH = lambda cx=500: head_box(by(TIP, HCZ, HP), by(CHIN, HCZ, HP), cx)
def run(out, *items):
    subprocess.run([sys.executable, CMP, os.path.join(PV, out), '--h', '460'] + list(items), check=True)
pv = lambda n: os.path.join(PV, n)
run('cmp-body.png', 'SHEET front::%s::%s' % (SHEET, body_box(*A['front'])), 'SHEET side::%s::%s' % (SHEET, body_box(*A['side'])),
    'SHEET back::%s::%s' % (SHEET, body_box(*A['back'])), '--row',
    'MODEL front::%s::%s' % (pv('body_front.png'), MB()), 'MODEL side (her left)::%s::%s' % (pv('body_side.png'), MB(SIDE_CX)),
    'MODEL back::%s::%s' % (pv('body_back.png'), MB()))
run('cmp-front.png', 'SHEET front::%s::%s' % (SHEET, body_box(*A['front'])), 'MODEL front::%s::%s' % (pv('body_front.png'), MB()),
    'SHEET 3/4::%s::%s' % (SHEET, body_box(*A['34'])), 'MODEL 3/4 (her front-left, as the sheet)::%s::%s' % (pv('body_34.png'), MB()))
run('cmp-head.png', 'SHEET head front::%s::%s' % (SHEET, head_box(*A['hf'])), 'MODEL head front::%s::%s' % (pv('head_front.png'), MH()),
    'MODEL head 3/4::%s::%s' % (pv('head_34.png'), MH(500)))
print('compare done')
