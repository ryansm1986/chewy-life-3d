"""Same-scale comparisons of the Shih Tzu Knight renders against refs/sheet.png (crown-to-ground or crown-to-chin
normalised crops), via .claude/skills/toybox-character/scripts/compare.py.   python make_compare.py
Sheet anchors (sheet px, measured with measure/ruled.py + measure/probe.py): front crown 100 / ground 466 / centre x 212;
3/4 crown 99 / ground 466 / centre x 575; side crown 100 / ground 468 / centre x 880; back crown 100 / ground 466 /
centre x 1265; head close-up front crown 554 / chin 711 / centre x 137 (W 154 px); head close-up 3/4 crown 552 / chin 707 /
centre x 372.
Model renders (render_views.py): body_* ortho 1.65 m over 1000 px, centre z 0.70 -> crown (1.20 m) at y 197, ground 924,
centre x 450; head_* ortho 1.20 m over 1000 px, centre z 0.96 -> crown at 300, chin (0.662 m) at 748, centre x 500.
"""
import os, subprocess, sys
ROOT = os.path.dirname(os.path.abspath(__file__))
CMP = 'D:/projects/chewy-life-3d/.claude/skills/toybox-character/scripts/compare.py'
SHEET = os.path.join(ROOT, 'refs', 'sheet.png'); PV = os.path.join(ROOT, 'preview')
def body_box(crown, ground, cx, top=.20, bot=.06, half=.62):
    T = ground - crown; return '%d,%d,%d,%d' % (cx - half * T, crown - top * T, cx + half * T, ground + bot * T)
MB = body_box(197, 924, 450)
def head_box(crown, chin, cx, top=.32, bot=.22, half=1.02):
    H = chin - crown; return '%d,%d,%d,%d' % (cx - half * H, crown - top * H, cx + half * H, chin + bot * H)
MH = head_box(300, 748, 500)
def run(out, *items):
    subprocess.run([sys.executable, CMP, os.path.join(PV, out), '--h', '460'] + list(items), check=True)
run('cmp-front.png', 'SHEET front::%s::%s' % (SHEET, body_box(100, 466, 212)), 'MODEL front::%s::%s' % (os.path.join(PV, 'body_front.png'), MB),
    'SHEET 3/4::%s::%s' % (SHEET, body_box(99, 466, 575)), 'MODEL 3/4::%s::%s' % (os.path.join(PV, 'body_34.png'), MB))
run('cmp-side.png', 'SHEET side::%s::%s' % (SHEET, body_box(100, 468, 880)), 'MODEL side (his left)::%s::%s' % (os.path.join(PV, 'body_side.png'), MB))
run('cmp-back.png', 'SHEET back::%s::%s' % (SHEET, body_box(100, 466, 1265)), 'MODEL back::%s::%s' % (os.path.join(PV, 'body_back.png'), MB))
run('cmp-head.png', 'SHEET head front::%s::%s' % (SHEET, head_box(554, 711, 137)), 'MODEL head front::%s::%s' % (os.path.join(PV, 'head_front.png'), MH),
    '--row', 'SHEET head 3/4::%s::%s' % (SHEET, head_box(552, 707, 372)), 'MODEL head 3/4::%s::%s' % (os.path.join(PV, 'head_34.png'), head_box(300, 748, 520)))
# eyes only: centred between the eyes at the sheet's eye height, +-0.45 W x +-0.20 W (sheet close-up W 154 px; model W 440 px)
# (the model's eyes sit 0.034 W higher above the chin than the sheet's: FACE_RULE 'brief'; the crop follows each one's own eyes)
run('cmp-eyes.png', 'SHEET eyes::%s::%d,%d,%d,%d' % (SHEET, 137 - .45 * 154, 640 - .20 * 154, 137 + .45 * 154, 640 + .20 * 154),
    'MODEL eyes::%s::%d,%d,%d,%d' % (os.path.join(PV, 'head_front.png'), 500 - .45 * 440, 531 - .20 * 440, 500 + .45 * 440, 531 + .20 * 440))
run('cmp-cast.png', 'MODEL with chewy-b.glb, same scale (front)::%s' % os.path.join(PV, 'cast_front.png'), '--row',
    'MODEL with chewy-b.glb (game-ish 30 deg)::%s' % os.path.join(PV, 'cast_game.png'))
print('compare done')
