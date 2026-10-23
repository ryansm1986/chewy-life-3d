"""Same-scale comparisons of the kitsune-toy renders against refs/sheet.png, via the toybox compare.py.   python make_compare.py
Sheet anchors (sheet px, measure/measure_all.py + measure/anchors): front turnaround crown 110 / ground 502 / centre x 199; 3/4 crown 106 /
ground 502 / centre x 555; side crown 112 / ground 502 / body axis x 892; back crown 107 / ground 502 / centre x 1269; head close-up front
crown 602 / chin 822 / centre x 212 (W 316 px); head close-up 3/4 (from her front-right) crown 602 / chin 822 / centre x 573.
Model renders (render_views.py): body_* ortho 1.70 m over 1000 px, centre (0, 0.05, 0.60) m; head_* ortho 1.00 m over 1000 px, centre
(0, -0.03, 0.86) m. Each box is framed by its own crown-to-ground (body) or crown-to-chin (head) height, so the tiles share that scale.
"""
import os, subprocess, sys, json
ROOT = os.path.dirname(os.path.abspath(__file__))
CMP = 'D:/projects/chewy-life-3d/.claude/skills/toybox-character/scripts/compare.py'
SHEET = os.path.join(ROOT, 'refs', 'sheet.png'); PV = os.path.join(ROOT, 'preview')
A = {'front': (110, 502, 199), '34': (106, 502, 555), 'side': (112, 502, 892), 'back': (107, 502, 1269), 'hf': (602, 822, 212), 'h34': (602, 822, 573)}
M = json.load(open(os.path.join(ROOT, 'measurements-model.json')))
CROWN = M['skull_top_m']; CHIN = M['chin_z_m']; W = M['W']
def by(z, cz, ppm): return 500 - (z - cz) * ppm
BP = 1000 / 1.70; HP = 1000 / 1.00
def body_box(crown, ground, cx, top=.24, bot=.04, half=.62):
    T = ground - crown; return '%d,%d,%d,%d' % (cx - half * T, crown - top * T, cx + half * T, ground + bot * T)
MB = lambda cx=500: body_box(by(CROWN, .60, BP), by(0, .60, BP), cx)
SIDE_CX = 500 - .05 * BP                     # the body axis (y = 0) in the side render (its centre is at y 0.05 m)
def head_box(crown, chin, cx, top=.40, bot=.12, half=.85):
    H = chin - crown; return '%d,%d,%d,%d' % (cx - half * H, crown - top * H, cx + half * H, chin + bot * H)
MH = lambda cx=500: head_box(by(CROWN, .86, HP), by(CHIN, .86, HP), cx)
def run(out, *items):
    subprocess.run([sys.executable, CMP, os.path.join(PV, out), '--h', '460'] + list(items), check=True)
pv = lambda n: os.path.join(PV, n)
run('cmp-body.png', 'SHEET front::%s::%s' % (SHEET, body_box(*A['front'])), 'SHEET side::%s::%s' % (SHEET, body_box(*A['side'])),
    'SHEET back::%s::%s' % (SHEET, body_box(*A['back'])), '--row',
    'MODEL front::%s::%s' % (pv('body_front.png'), MB()), 'MODEL side (her left)::%s::%s' % (pv('body_side.png'), MB(SIDE_CX)),
    'MODEL back::%s::%s' % (pv('body_back.png'), MB()))
run('cmp-front.png', 'SHEET front::%s::%s' % (SHEET, body_box(*A['front'])), 'MODEL front::%s::%s' % (pv('body_front.png'), MB()),
    'SHEET 3/4::%s::%s' % (SHEET, body_box(*A['34'])), 'MODEL 3/4 (her front-right, as the sheet)::%s::%s' % (pv('body_34R.png'), MB()))
run('cmp-side.png', 'SHEET side::%s::%s' % (SHEET, body_box(*A['side'])), 'MODEL side (her left)::%s::%s' % (pv('body_side.png'), MB(SIDE_CX)),
    '--row', 'SHEET head (side)::%s::%s' % (SHEET, body_box(*A['side'], top=.20, bot=-.55, half=.36)),
    'MODEL head side::%s::%s' % (pv('body_side.png'), body_box(by(CROWN, .60, BP), by(0, .60, BP), SIDE_CX, top=.20, bot=-.55, half=.36)))
run('cmp-back.png', 'SHEET back::%s::%s' % (SHEET, body_box(*A['back'])), 'MODEL back::%s::%s' % (pv('body_back.png'), MB()))
run('cmp-head.png', 'SHEET head front::%s::%s' % (SHEET, head_box(*A['hf'])), 'MODEL head front::%s::%s' % (pv('head_front.png'), MH()),
    '--row', 'SHEET head 3/4::%s::%s' % (SHEET, head_box(*A['h34'])), 'MODEL head 3/4 (her front-right, as the sheet)::%s::%s' % (pv('head_34R.png'), MH(500)))
ez = CHIN + M['eye_centre_W'][1] * W; WP = 316; EZP = 720
run('cmp-eyes.png', 'SHEET eyes::%s::%d,%d,%d,%d' % (SHEET, 212 - .45 * WP, EZP - .17 * WP, 212 + .45 * WP, EZP + .17 * WP),
    'MODEL eyes::%s::%d,%d,%d,%d' % (pv('head_front.png'), 500 - .45 * W * HP, by(ez, .86, HP) - .17 * W * HP, 500 + .45 * W * HP, by(ez, .86, HP) + .17 * W * HP))
print('compare done')
