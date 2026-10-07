"""Same-scale comparisons of the golden-toy renders against refs/sheet.png, via the toybox compare.py.   python make_compare.py
Sheet anchors (sheet px, measure_sheet.py): front turnaround dome top 77 / ground 422 / centre x 220; 3/4 dome top 77 /
ground 422 / centre x 580; side dome top 67 / ground 424 / body centre x 915 (the render centre y +0.05 m = x 929);
back dome top 77 / ground 422 / centre x 1313; head close-up front dome 493 / chin 645 / centre x 236; head close-up 3/4
dome 493 / chin 642 / centre x 555. Model renders (render_views.py): body_* ortho 1.60 m over 1000 px, centre z 0.70 m;
head_* ortho 0.95 m over 1000 px, centre z 1.03 m. Model anchors from measurements-model.json (dome top, chin).
"""
import os, subprocess, sys, json
ROOT = os.path.dirname(os.path.abspath(__file__))
CMP = 'D:/projects/chewy-life-3d/.claude/skills/toybox-character/scripts/compare.py'
SHEET = os.path.join(ROOT, 'refs', 'sheet.png'); PV = os.path.join(ROOT, 'preview')
M = json.load(open(os.path.join(ROOT, 'measurements-model.json')))
DOME = M['helmet_top_m']; CHIN = M['chin_z_m']
def by(z, cz, ppm): return 500 - (z - cz) * ppm
BP = 1000 / 1.60; HP = 1000 / 1.30
def body_box(crown, ground, cx, top=.175, bot=.075, half=.5625):
    T = ground - crown; return '%d,%d,%d,%d' % (cx - half * T, crown - top * T, cx + half * T, ground + bot * T)
MB = body_box(by(DOME, .70, BP), by(0, .70, BP), 500)
def head_box(crown, chin, cx, top=.12, bot=.30, half=.95):
    H = chin - crown; return '%d,%d,%d,%d' % (cx - half * H, crown - top * H, cx + half * H, chin + bot * H)
MH = lambda cx=500: head_box(by(DOME, 1.00, HP), by(CHIN, 1.00, HP), cx)
def run(out, *items):
    subprocess.run([sys.executable, CMP, os.path.join(PV, out), '--h', '460'] + list(items), check=True)
pv = lambda n: os.path.join(PV, n)
run('cmp-front.png', 'SHEET front::%s::%s' % (SHEET, body_box(77, 422, 220)), 'MODEL front::%s::%s' % (pv('body_front.png'), MB),
    'SHEET 3/4::%s::%s' % (SHEET, body_box(77, 422, 580)), 'MODEL 3/4 (his right, as the sheet)::%s::%s' % (pv('body_34R.png'), MB))
run('cmp-side.png', 'SHEET side::%s::%s' % (SHEET, body_box(67, 424, 929)), 'MODEL side (his left)::%s::%s' % (pv('body_side.png'), MB))
run('cmp-back.png', 'SHEET back::%s::%s' % (SHEET, body_box(77, 422, 1313)), 'MODEL back::%s::%s' % (pv('body_back.png'), MB))
run('cmp-head.png', 'SHEET head front::%s::%s' % (SHEET, head_box(493, 645, 236)), 'MODEL head front::%s::%s' % (pv('head_front.png'), MH()),
    '--row', 'SHEET head 3/4::%s::%s' % (SHEET, head_box(493, 642, 555)), 'MODEL head 3/4 (his right)::%s::%s' % (pv('head_34R.png'), MH(480)))
W = M['chin_z_m'] * 0 + float(M['units'].split('W = ')[1].split(' m')[0]); ez = CHIN + M['eye_centre_W'][1] * W
run('cmp-eyes.png', 'SHEET eyes::%s::%d,%d,%d,%d' % (SHEET, 236 - .45 * 154, 561 - .20 * 154, 236 + .45 * 154, 561 + .20 * 154),
    'MODEL eyes::%s::%d,%d,%d,%d' % (pv('head_front.png'), 500 - .45 * W * HP, by(ez, 1.00, HP) - .20 * W * HP, 500 + .45 * W * HP, by(ez, 1.00, HP) + .20 * W * HP))
run('cmp-cast.png', 'CAST front (chewy-b | golden-toy | poe-toy)::%s' % pv('cast_front.png'), '--row', 'CAST 30 deg game view::%s' % pv('cast_game.png'))
print('compare done')
