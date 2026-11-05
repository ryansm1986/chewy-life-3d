
print('STEP beret', flush=True)
# ============================================================== THE BERET: a soft puffy disc set back on the crown (W units, head-local)
# Sheet (head close-up): 0.51 W across (x -0.228 .. 0.279: a jaunty shift to her left), its lower edge at z 0.62 in the middle and 0.70
# at the sides, the dome's top at z 0.84 and a little round stalk on top to z 0.915 (0.11 W across, a touch right of centre).
# Round 2 (the director: follow the sheet): the beret sits FORWARD on the crown, tipped a little forward, its lower edge at ~0.62 W in
# the middle of the front view, ~0.55 W across, in front of the ears' inner edges; from the side it reads as one beret in front of
# the ears, which rise behind its sides.
BERET = dict(c=(.024, -.105, .716), tilt=-6., roll=5., R=.272, Ht=.128, Hb=.100, n=2.25, nub_r=(.050, .050, .042), nub_up=.052, nub_x=.006)
_tb = math.radians(BERET['tilt']); _rb = math.radians(BERET['roll'])
BERET_R = rot([1, 0, 0], -_tb) @ rot([0, 1, 0], -_rb)          # beret frame -> head-local (tilt < 0: the axis tips forward; the roll tips it to her left)
BERET_AX = BERET_R @ np.array([0, 0, 1.])
BERET_C = np.array(BERET['c'], float)
def beret_local(q):
    """head-local W point -> the beret frame (u across, v front-back, h along the axis)"""
    return (np.asarray(q, float) - BERET_C) @ BERET_R
def beret_sdf_l(q):
    b = beret_local(q); r = np.sqrt(b[..., 0] ** 2 + b[..., 1] ** 2); h = b[..., 2]
    H = np.where(h > 0, BERET['Ht'], BERET['Hb']); n = BERET['n']
    # a puffy disc: widest a little below its middle (the soft overhang of a beret), its top domed
    hr = h - .012
    s_ = ((r / BERET['R']) ** n + (np.abs(hr) / H) ** n) ** (1 / n)
    d = (s_ - 1) * min(BERET['R'], BERET['Ht'])
    nub_c = np.array([BERET['nub_x'], .0, BERET['Ht'] + .012 - .010])
    bn = (b - nub_c) / np.array(BERET['nub_r'])
    dn = (np.sqrt((bn ** 2).sum(-1)) - 1) * min(BERET['nub_r'])
    # the stalk: the ball lifted on a short neck
    bs = b - nub_c - np.array([0, 0, BERET['nub_up'] * .55])
    ds = np.sqrt(bs[..., 0] ** 2 + bs[..., 1] ** 2 + (bs[..., 2] / 1.25) ** 2) - BERET['nub_r'][0] * .92
    return smin(d, smin(dn, ds, .020), .022)
def beret_sdf(p): return beret_sdf_l(M2L(p)) * W
BC_M = L2M(BERET_C[None])[0]
def beret_uv(NN, V):
    q = M2L(V); b = beret_local(q); r = np.sqrt(b[:, 0] ** 2 + b[:, 1] ** 2)
    occ = .22 * smooth(-.01, -.07, b[:, 2]) + .10 * smooth(.6, 1.0, r / BERET['R']) * smooth(.02, -.04, b[:, 2])
    return ramp_uv('shirt', sval(NN, hi=.26, lo=.22, occ=occ) + .02)
star_mesh('beret', beret_sdf, BC_M + BERET_AX * .02 * W, 'beret', beret_uv, nth=22, nph=42, tmax=.30, axis=BERET_AX, ref=(1., 0, 0))
_bt = L2M((BERET_C + BERET_AX * (BERET['Ht'] + BERET['nub_up'] + .04))[None])[0]
BERET_INFO = {'anchor': [round(float(c), 4) for c in BC_M], 'axis': [round(float(c), 4) for c in BERET_AX],
              'tilt_back_deg': BERET['tilt'], 'roll_deg': BERET['roll'], 'radius_m': round(BERET['R'] * W, 4)}
LOG['beret'] = BERET_INFO
