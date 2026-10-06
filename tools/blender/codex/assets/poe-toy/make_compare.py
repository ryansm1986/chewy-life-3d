"""Same-scale comparisons of the Poe renders against refs/sheet.png (crown-to-ground or crown-to-chin normalised crops),
via .claude/skills/toybox-character/scripts/compare.py.   python make_compare.py
Sheet anchors (sheet px, measured on refs/sheet.png): front crown 100 / ground 384 / centre x 248; 3/4 crown 84 / ground 385;
side crown 82 / ground 391; back crown 82 / ground 385; head close-up front crown 434 / chin 607 / centre x 189 (W 274 px);
head close-up 3/4 crown 429 / chin 612; option-B head front crown 423 / chin 637 / centre 209.
Model renders (render_views.py): body_* ortho 1.5 m over 1000 px, centre z 0.66 -> crown (1.20 m) at y 140, ground at 940;
head_* ortho 1.0 m over 1000 px, centre z 0.95 -> crown at 250, chin (0.689 m) at 761.
"""
import os, subprocess, sys
ROOT = os.path.dirname(os.path.abspath(__file__))
CMP = 'D:/projects/chewy-life-3d/.claude/skills/toybox-character/scripts/compare.py'
SHEET = os.path.join(ROOT, 'refs', 'sheet.png'); PV = os.path.join(ROOT, 'preview')
def body_box(crown, ground, cx, top=.175, bot=.075, half=.5625):
    T = ground - crown; return '%d,%d,%d,%d' % (cx - half * T, crown - top * T, cx + half * T, ground + bot * T)
MB = '0,0,900,1000'          # model body crops: the whole render (crown 140, ground 940 = 800 px)
def head_box(crown, chin, cx, top=.12, bot=.30, half=.95):
    H = chin - crown; return '%d,%d,%d,%d' % (cx - half * H, crown - top * H, cx + half * H, chin + bot * H)
MH = head_box(250, 761, 500)
def run(out, *items):
    subprocess.run([sys.executable, CMP, os.path.join(PV, out), '--h', '460'] + list(items), check=True)
run('cmp-front.png', 'SHEET front::%s::%s' % (SHEET, body_box(100, 384, 248)), 'MODEL front::%s::%s' % (os.path.join(PV, 'body_front.png'), MB),
    'SHEET 3/4::%s::%s' % (SHEET, body_box(84, 385, 590)), 'MODEL 3/4::%s::%s' % (os.path.join(PV, 'body_34.png'), MB))
run('cmp-side.png', 'SHEET side::%s::%s' % (SHEET, body_box(82, 391, 935)), 'MODEL side (her left)::%s::%s' % (os.path.join(PV, 'body_side.png'), MB))
run('cmp-back.png', 'SHEET back::%s::%s' % (SHEET, body_box(82, 385, 1298)), 'MODEL back::%s::%s' % (os.path.join(PV, 'body_back.png'), MB))
run('cmp-head.png', 'SHEET head front::%s::%s' % (SHEET, head_box(434, 607, 189, half=1.0)), 'MODEL head front::%s::%s' % (os.path.join(PV, 'head_front.png'), head_box(250, 761, 500, half=1.0)),
    'OPTION-B face::%s::%s' % (os.path.join(ROOT, 'refs', 'option-B-face.png'), head_box(423, 637, 209, half=1.0)),
    '--row', 'SHEET head 3/4::%s::%s' % (SHEET, head_box(429, 612, 556, half=1.0)), 'MODEL head 3/4::%s::%s' % (os.path.join(PV, 'head_34.png'), head_box(250, 761, 520, half=1.0)))
# eyes only: centre between the eyes, +-0.45 W, +-0.20 W (sheet close-up W 274 px; model W 727 px)
run('cmp-eyes.png', 'SHEET eyes::%s::%d,%d,%d,%d' % (SHEET, 198 - .45 * 274, 531 - .20 * 274, 198 + .45 * 274, 531 + .20 * 274),
    'MODEL eyes::%s::%d,%d,%d,%d' % (os.path.join(PV, 'head_front.png'), 500 - .45 * 727, 536 - .20 * 727, 500 + .45 * 727, 536 + .20 * 727))
print('compare done')
