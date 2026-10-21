"""Same-scale comparisons of the stella-toy renders against refs/sheet-sun.png (SHEET=sheet.png for Option C), via the toybox compare.py.   python make_compare.py
Sheet anchors (sheet px, measure_sheet.py / measurements.json): front turnaround crown 88 / ground 460.5 / centre x 179.5;
3/4 crown 88 / ground 461.5 / centre x 530; side crown 84 / ground 460.5 / legs x 810 (box centre 825 = the render centre y +0.05 m);
back crown 84 / ground 460.5 / centre x 1155; head close-up front crown 559 / chin 737 / centre x 157.75 (W 172 px);
head close-up 3/4 crown 552 / chin 735 / centre x 425.
Model renders (render_views.py): body_* ortho 1.50 m over 1000 px, centre z 0.66 m; head_* ortho 1.10 m over 1000 px, centre z 0.94 m.
Model anchors from measurements-model.json (crown, chin, W). Each box is framed by its own crown-to-ground (body) or crown-to-chin
(head) height, so the tiles are the same scale in those units.
"""
import os, subprocess, sys, json
ROOT = os.path.dirname(os.path.abspath(__file__))
CMP = 'D:/projects/chewy-life-3d/.claude/skills/toybox-character/scripts/compare.py'
SHEET = os.path.join(ROOT, 'refs', os.environ.get('SHEET', 'sheet-sun.png')); PV = os.path.join(ROOT, 'preview')
# the sheet anchors (sheet px): Option C (sheet.png) and the Sun Oracle, Option B (sheet-sun.png, the same layout, measured the same way)
A = {'front': (88, 460.5, 179.5), '34': (88, 461.5, 530), 'side': (84, 460.5, 825), 'back': (84, 460.5, 1155), 'hf': (559, 737, 157.75), 'h34': (552, 735, 425)}
if 'sun' in os.path.basename(SHEET):
    A.update({'front': (86.5, 460.5, 179.5), '34': (86, 461.5, 530), 'side': (82, 460.5, 825), 'back': (83, 460.5, 1155), 'hf': (557, 737, 157.75), 'h34': (552, 735, 425)})
M = json.load(open(os.path.join(ROOT, 'measurements-model.json')))
CROWN = M['crown_m']; CHIN = M['chin_z_m']; W = M['W']
def by(z, cz, ppm): return 500 - (z - cz) * ppm
BP = 1000 / 1.50; HP = 1000 / 1.10
def body_box(crown, ground, cx, top=.06, bot=.05, half=.62):
    T = ground - crown; return '%d,%d,%d,%d' % (cx - half * T, crown - top * T, cx + half * T, ground + bot * T)
MB = body_box(by(CROWN, .66, BP), by(0, .66, BP), 500)
def head_box(crown, chin, cx, top=.10, bot=.45, half=1.0):
    H = chin - crown; return '%d,%d,%d,%d' % (cx - half * H, crown - top * H, cx + half * H, chin + bot * H)
MH = lambda cx=500: head_box(by(CROWN, .94, HP), by(CHIN, .94, HP), cx)
def run(out, *items):
    subprocess.run([sys.executable, CMP, os.path.join(PV, out), '--h', '460'] + list(items), check=True)
pv = lambda n: os.path.join(PV, n)
run('cmp-front.png', 'SHEET front::%s::%s' % (SHEET, body_box(*A['front'])), 'MODEL front::%s::%s' % (pv('body_front.png'), MB),
    'SHEET 3/4::%s::%s' % (SHEET, body_box(*A['34'])), 'MODEL 3/4 (her right, as the sheet)::%s::%s' % (pv('body_34R.png'), MB))
run('cmp-side.png', 'SHEET side::%s::%s' % (SHEET, body_box(*A['side'])), 'MODEL side (her left)::%s::%s' % (pv('body_side.png'), MB))
run('cmp-back.png', 'SHEET back::%s::%s' % (SHEET, body_box(*A['back'])), 'MODEL back::%s::%s' % (pv('body_back.png'), MB))
run('cmp-head.png', 'SHEET head front::%s::%s' % (SHEET, head_box(*A['hf'])), 'MODEL head front::%s::%s' % (pv('head_front.png'), MH()),
    '--row', 'SHEET head 3/4::%s::%s' % (SHEET, head_box(*A['h34'])), 'MODEL head 3/4 (her right)::%s::%s' % (pv('head_34R.png'), MH(470)))
ez = CHIN + M['eye_centre_W'][1] * W; WP = 172
run('cmp-eyes.png', 'SHEET eyes::%s::%d,%d,%d,%d' % (SHEET, 157.75 - .45 * WP, 657 - .20 * WP, 157.75 + .45 * WP, 657 + .20 * WP),
    'MODEL eyes::%s::%d,%d,%d,%d' % (pv('head_front.png'), 500 - .45 * W * HP, by(ez, .94, HP) - .20 * W * HP, 500 + .45 * W * HP, by(ez, .94, HP) + .20 * W * HP))
run('cmp-cast.png', 'CAST front (chewy-b | stella-toy | moka-toy)::%s' % pv('cast_front.png'), '--row', 'CAST 30 deg game view::%s' % pv('cast_game.png'))
print('compare done')
