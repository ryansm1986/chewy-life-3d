"""Same-scale comparisons of the folk-frog-<x>-toy renders against refs/sheet.png (the toybox compare.py).

    python make_compare.py a|b|c

Sheet anchors (sheet px, measure-<x>.md): the upper front / 3/4 views have their own scale (sole y, px / m from the
dome tops at the stated height); the lower side / back views a smaller one. Head close-up: chin y, W px, centre x.
Model renders (render_views.py): body_* ortho 1.25 m over 1000 px (800 px / m), centre z 0.56 m;
head_* ortho 0.90 m over 1000 px (1111 px / m), centre z HZ.
"""
import os, subprocess, sys, json
D = sys.argv[1]
ROOT = os.path.dirname(os.path.abspath(__file__))
CMP = 'D:/projects/chewy-life-3d/.claude/skills/toybox-character/scripts/compare.py'
SHEET = os.path.join(ROOT, 'refs', 'sheet.png')
PV = os.path.join(ROOT, 'preview', D)
A = dict(a=dict(F=(366.7, 530, 151.5), Q=(366.7, 530, 389.), S=(255.3, 831, 92.), B=(254.4, 831, 229.), HCH=767., HW=193., HX=408., H=1.05),
         b=dict(F=(367.6, 530, 653.), Q=(367.6, 530, 902.), S=(260.0, 830, 585.5), B=(253.3, 829, 736.), HCH=769., HW=201., HX=917., H=1.05),
         c=dict(F=(395.0, 528, 1166.5), Q=(395.0, 528, 1401.), S=(296.7, 829, 1108.), B=(291.1, 828, 1248.5), HCH=769., HW=191., HX=1426., H=.90))[D]
M = json.load(open(os.path.join(ROOT, 'measurements-model-%s.json' % D)))
W = M['W_m']; CHIN = M['chin_z_m']; HZ = {'a': .80, 'b': .80, 'c': .68}[D]
BP = 800.; BGY = 500 + .56 * BP
def sbox(view, x0=-.45, x1=.45, z0=-.03, z1=None):
    SP, GY, cx = A[view]; z1 = A['H'] + .06 if z1 is None else z1
    return '%d,%d,%d,%d' % (cx + x0 * SP, GY - z1 * SP, cx + x1 * SP, GY - z0 * SP)
def mbox(cx=500, x0=-.45, x1=.45, z0=-.03, z1=None):
    z1 = A['H'] + .06 if z1 is None else z1
    return '%d,%d,%d,%d' % (cx + x0 * BP, BGY - z1 * BP, cx + x1 * BP, BGY - z0 * BP)
HPX = 1000 / .90; HCHIN = 500 + (HZ - CHIN) * HPX; WP = A['HW']
def shbox(cx, chin, top=.92, bot=.08, half=.62):
    return '%d,%d,%d,%d' % (cx - half * WP, chin - top * WP, cx + half * WP, chin + bot * WP)
def mhbox(cx=500, top=.92, bot=.08, half=.62):
    Wp = W * HPX; return '%d,%d,%d,%d' % (cx - half * Wp, HCHIN - top * Wp, cx + half * Wp, HCHIN + bot * Wp)
def run(out, *items):
    subprocess.run([sys.executable, CMP, os.path.join(PV, out), '--h', '460'] + list(items), check=True)
pv = lambda n: os.path.join(PV, n)
run('cmp-body.png', 'SHEET front::%s::%s' % (SHEET, sbox('F')), 'MODEL front::%s::%s' % (pv('body_front.png'), mbox()),
    'SHEET side::%s::%s' % (SHEET, sbox('S', -.4, .4)), 'MODEL side (his right)::%s::%s' % (pv('body_sideR.png'), mbox(x0=-.4, x1=.4)),
    'SHEET back::%s::%s' % (SHEET, sbox('B')), 'MODEL back::%s::%s' % (pv('body_back.png'), mbox()))
run('cmp-34.png', 'SHEET 3/4::%s::%s' % (SHEET, sbox('Q')), 'MODEL 3/4::%s::%s' % (pv('body_34R.png'), mbox()))
run('cmp-head.png', 'SHEET head front::%s::%s' % (SHEET, shbox(A['HX'], A['HCH'])), 'MODEL head front::%s::%s' % (pv('head_front.png'), mhbox()),
    'MODEL head 3/4::%s::%s' % (pv('head_34R.png'), mhbox()))
EZ = M['eye_centre_W'][1]
ez_s = A['HCH'] - EZ * WP; ez_m = HCHIN - EZ * W * HPX
run('cmp-eyes.png', 'SHEET eyes::%s::%d,%d,%d,%d' % (SHEET, A['HX'] - .45 * WP, ez_s - .24 * WP, A['HX'] + .45 * WP, ez_s + .20 * WP),
    'MODEL eyes::%s::%d,%d,%d,%d' % (pv('head_front.png'), 500 - .45 * W * HPX, ez_m - .24 * W * HPX, 500 + .45 * W * HPX, ez_m + .20 * W * HPX))
print('compare done')
