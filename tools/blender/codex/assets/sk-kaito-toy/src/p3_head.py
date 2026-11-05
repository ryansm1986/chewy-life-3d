# ============================================================== the head field (W units, z above the chin, y from HY)
# Targets (measure.md; W units; z above the chin with the head 0.738 W tall; y local = from HY, which sits 0.127 W behind the body axis):
#   front half-widths z 0.023: 0.33, 0.045: 0.385, 0.068: 0.43, 0.091: 0.465, 0.114: 0.49, 0.136: 0.51, 0.159: 0.53, 0.182: 0.54,
#   0.205: 0.54, the tufts 0.575 at z 0.25-0.27, 0.318: 0.525, 0.341: 0.515, 0.386: 0.504, 0.43: 0.487 (the ear flanks keep 0.50 above);
#   profile (front, local y) z 0.689: -0.242, 0.603: -0.361, 0.517: -0.414, 0.431: -0.443, 0.344: -0.447, 0.287: -0.457, the nose tip
#   -0.553 at z ~0.245, 0.201: -0.534, 0.144: -0.519, 0.086: -0.481, 0.029: -0.419; (back) 0.603: 0.347, 0.517: 0.399, 0.431: 0.428,
#   0.344: 0.447, 0.258: 0.438, 0.172: 0.38, 0.115: 0.323, 0.086: 0.275. A deep round mochi: 0.89 W deep, 1.0 W wide.
SK = dict(a=.488, zc=.360, cu=.392, cd=.360, n=2.50, n_top=2.45, bf=.428, bb=.436, taper=.0, ta0=.39, ta1=.68, t0=.46, t1=.70, m=2.10, m_top=2.45)
def skull(q):
    x, y, z = q[..., 0], q[..., 1], q[..., 2]
    zr = z - SK['zc']; c = np.where(zr > 0, SK['cu'], SK['cd'])
    a = SK['a'] * (1 - SK['taper'] * smooth(SK['ta0'], SK['ta1'], z)); n = SK['n'] + (SK['n_top'] - SK['n']) * smooth(SK['t0'], SK['t1'], z)
    ax_ = np.abs(x) / a + 1e-9; az_ = np.abs(zr) / c + 1e-9
    s = (ax_ ** n + az_ ** n) ** (1 / n)
    b = np.where(y < 0, SK['bf'], SK['bb']); ay_ = np.abs(y) / b + 1e-9
    mm = SK['m'] + (SK['m_top'] - SK['m']) * smooth(SK['t0'], SK['t1'], z)     # a squarer top-back in profile (the sheet's full crown)
    r = (s ** mm + ay_ ** mm) ** (1 / mm) + 1e-12
    kk = s ** (1 - n); gx = kk * ax_ ** (n - 1) / a; gz = kk * az_ ** (n - 1) / c
    gs = (s / r) ** (mm - 1); gy = (ay_ / r) ** (mm - 1) / b
    g = np.sqrt(gs * gs * (gx * gx + gz * gz) + gy * gy) + 1e-9
    return (r - 1) / g

def front_local(x, z, f):
    """first surface hit marching from the front (-y) at (x, z), W units, vectorised"""
    x = np.atleast_1d(np.asarray(x, float)); z = np.atleast_1d(np.asarray(z, float)); n = len(x)
    ys = np.linspace(-.85, .30, 320)
    P = np.stack([np.repeat(x[:, None], len(ys), 1), np.broadcast_to(ys, (n, len(ys))), np.repeat(z[:, None], len(ys), 1)], -1).reshape(-1, 3)
    ins = (f(P) < 0).reshape(n, len(ys)); i = np.argmax(ins, 1); ok = ins[np.arange(n), i]
    lo = ys[np.maximum(i - 1, 0)]; hi = ys[i]
    for _ in range(26):
        m = (lo + hi) / 2; inn = f(np.stack([x, m, z], -1)) < 0
        hi = np.where(inn, m, hi); lo = np.where(inn, lo, m)
    return np.where(ok, (lo + hi) / 2, np.nan)

def mirror(q):
    qa = np.array(q, float, copy=True); qa[..., 0] = np.abs(qa[..., 0]); return qa
# the low wide cheek mass (the face is widest at the cheeks, 0.19 W above the chin), soft pointed cheek tufts at its sides sweeping out
# and back, the short rounded fox muzzle (in profile it projects ~0.09 W past the face), a soft chin under it and the neck under the collar
CHEEK = [[0, -.030, .190], [.528, .360, .210]]; K_CHEEK = .140
TUFT_A, TUFT_B, TUFT_R = [.320, -.110, .285], [.522, .130, .262], (.140, .058); K_TUFT = .050
MUZ = [[0, -.395, .200], [.200, .130, .105]]; K_MUZ = .090
CHINB = [[0, -.330, .080], [.200, .110, .070]]; K_CHINB = .065
NECK = [[0, -.120, -.060], [.160, .130, .100]]; K_NECK = .060
def muz_sdf(q): return ell(q, *MUZ)
def tuft_sdf(q):
    qm = mirror(q); a = np.asarray(TUFT_A); b = np.asarray(TUFT_B); pa = qm - a; ba = b - a
    h = np.clip((pa @ ba) / (ba @ ba), 0, 1); r = TUFT_R[0] + (TUFT_R[1] - TUFT_R[0]) * h ** .85
    return np.linalg.norm(pa - h[..., None] * ba, axis=-1) - r
def base_local(q):
    d = skull(q)
    d = smin(d, ell(q, *CHEEK), K_CHEEK)
    d = smin(d, tuft_sdf(q), K_TUFT)
    d = smin(d, muz_sdf(q), K_MUZ); d = smin(d, ell(q, *CHINB), K_CHINB)
    return d + jaw_trim(q)
# a softer chin (the Kitsune lesson): a smooth trim that is exactly zero at and above z 0.07: it pulls the jaw's lower sides in and lifts
# the under-chin where it turns back toward the neck, so the jaw never hangs below the cheek line like a bowl.
JAW = dict(side=.012, under=.025, z1=.110)
def jaw_trim(q):
    x, y, z = q[..., 0], q[..., 1], q[..., 2]
    low = 1 - smoother(.005, JAW['z1'], z)
    side = JAW['side'] * low * smooth(.10, .36, np.abs(x))
    under = JAW['under'] * (1 - smoother(-.08, .03, z)) * smooth(-.46, -.26, y)
    return side + under

# eye layout (W units; the head close-up, measure/sheet.json): centres +-0.232 W at 0.320 W above the chin; the opening (inside the lash
# outline) 0.218 x 0.212 W, round (a superellipse a little flatter on top). No socket: the eyes sit on the ball's own curve.
EXW, EZW, EHWW, EHHW, EN = .200, .346, .1075, .1050, 2.30
EYE_SH = 0.; EN_T, EN_B, EYE_TOPK = 2.20, 2.40, 1.0
def eye_norm(X, Z):
    """the opening's normalised radius (1 on the rim) and angle, for points (X outward, Z up) in the un-sheared frame"""
    top = Z > 0; Zs = Z / np.where(top, EYE_TOPK, 1.); en = np.where(top, EN_T, EN_B)
    return (np.abs(X) ** en + np.abs(Zs) ** en) ** (1 / en) + 1e-9, np.arctan2(Zs, X), Zs
RECESS = dict(delta=0., tilt=0., F_out=.13, F_nas=.075, F_up=.080, F_dn=.065)
def eye_recess(q):
    x, y, z = q[..., 0], q[..., 1], q[..., 2]; tot = 0
    for s in (-1, 1):
        X = s * (x - s * EXW) / EHWW; Z = (z - EZW) / EHHW - EYE_SH * X
        sr, _ps, Zs = eye_norm(X, Z)
        c = X / sr; sn = Zs / sr
        dout = (sr - 1) * np.sqrt((EHWW * c) ** 2 + (EHHW * sn) ** 2)
        F = np.maximum(np.sqrt((np.where(c > 0, RECESS['F_out'], RECESS['F_nas']) * c) ** 2 + (np.where(sn > 0, RECESS['F_up'], RECESS['F_dn']) * sn) ** 2), 1e-4)
        tot = tot + (1 - smoother(.010, .010 + F, dout))
    return tot * smooth(-.10, -.24, y)
def warped(q):
    if RECESS['delta'] == 0: return np.asarray(q, float)
    qw = np.array(q, float, copy=True); qw[..., 1] = q[..., 1] - RECESS['delta'] * eye_recess(q); return qw
# nose: a dark rounded triangle (wider on top) on the muzzle's front-top, 0.120 W wide, 0.070 W tall, centre 0.210 W above the chin
NZW = .249; NOSE_PW = .0490; NHW, NHH, NHD = .0500, .0310, .030; NOSE_SHEAR = .040; NOSE_WIDEN = .40; NOSE_FLAT = .40
_yf = float(front_local(0, NZW, base_local)[0])
NOSE_C = np.array([0, _yf + NHD - .040, NZW])
def nose_recede(qz): return NOSE_SHEAR * smooth(-.30, 1.20, qz / NHH)
def nose_widen(qz): return 1 + NOSE_WIDEN * (2 * smooth(-1.4, 1.4, qz / NHH) - 1)
def nose_flat(qz): return 1 + NOSE_FLAT * smooth(0., 1., qz / NHH)
def nose_sdf(q):
    qq = np.array(q, float, copy=True) - NOSE_C
    qq[..., 1] = qq[..., 1] - nose_recede(qq[..., 2])
    widen = nose_widen(qq[..., 2])
    qq[..., 0] = qq[..., 0] / widen
    qq[..., 2] = qq[..., 2] * nose_flat(qq[..., 2])
    return ell(qq, [0, 0, 0], [NHW, NHD, NHH])
K_N = .016
def head_local_pre(q, neck=True):
    d = base_local(warped(q))
    if neck: d = smin(d, ell(q, *NECK), K_NECK)
    return smin(d, nose_sdf(q), K_N)

# ---- the sculpted closed mouth: the sheet's wide gentle "w" smile (head close-up px: corners x 176 / 252 at y 766, the arcs' low points
# at x ~190 / 234, y 782, the cusp under the philtrum at y 776). W units: corners +-0.120 W at 0.177 W, the low points +-0.066 W at
# 0.127 W, the cusp 0.146 W.
MA_X, MA_C, MA_K, MA_P, MA_T0, MA_CUSP, MA_CURL = .085, .139, .029, 1.80, .001, .0, .009
def mouth_arch(t, crisp=False):
    t = np.asarray(t, float); a = np.abs(t)
    rise = np.clip((a - MA_T0) / (1 - MA_T0), 0, 1) ** MA_P
    cusp = MA_CUSP * (np.clip(1 - a / MA_T0, 0, 1) ** 1.5 if crisp else 1 - smooth(0., MA_T0, a))
    return np.stack([MA_X * t, MA_C + MA_K * rise + cusp + MA_CURL * smooth(.80, 1., a) ** 1.4], -1)
MG_N = 41; _mt = np.linspace(-1, 1, MG_N); _mc = mouth_arch(_mt)
MG_TAPER = 1 - .70 * smooth(.55, .98, np.abs(_mt))
MG_RG = .0056 * MG_TAPER; MG_DL = .0010 * MG_TAPER; MG_SUP, MG_SDN, MG_SMID = 2.6, 1.65, 2.0
MG_YS = front_local(_mc[:, 0], _mc[:, 1], head_local_pre)
MG_C = np.stack([_mc[:, 0], MG_YS - MG_DL, _mc[:, 1]], -1)
_ru = front_local(_mc[:, 0], _mc[:, 1] + .0048, head_local_pre)
MG_R = np.stack([_mc[:, 0], _ru + .0018, _mc[:, 1] + .0040], -1); MG_RR = .0034 * MG_TAPER
PH_Z = np.array([NZW - NHH + .006, MA_C + MA_CUSP + .003]); _py = front_local(np.zeros(2), PH_Z, head_local_pre)
PH_C = np.stack([np.zeros(2), _py - .0004, PH_Z], -1); PH_R = np.array([.0032, .0036])
_dc = mouth_arch(np.array([-1., 1.]), True); _dy = front_local(_dc[:, 0], _dc[:, 1], head_local_pre)
DIMPLE_C = np.stack([_dc[:, 0] * 1.02, _dy - .0036, _dc[:, 1] + .001], -1); DIMPLE_R = .0044
MG_BOX = (.130, .080, NZW - .6 * NHH, -.25)
def _chain(p, Cs, Rs, scale=None):
    best = np.full(len(p), 9.)
    for i in range(len(Cs) - 1):
        A = Cs[i]; B_ = Cs[i + 1]; pa = p - A; ba = B_ - A
        if scale is None:
            h = np.clip((pa @ ba) / (ba @ ba), 0, 1); r = pa - h[:, None] * ba; dist = np.linalg.norm(r, axis=1)
        else:
            sm = np.array([1, 1, MG_SMID]); h = np.clip(((pa * sm) @ (ba * sm)) / ((ba * sm) @ (ba * sm)), 0, 1)
            r = pa - h[:, None] * ba; s_ = np.where(r[:, 2] > 0, MG_SUP, MG_SDN)
            dist = np.sqrt(r[:, 0] ** 2 + r[:, 1] ** 2 + (s_ * r[:, 2]) ** 2)
        best = np.minimum(best, dist - (Rs[i] + (Rs[i + 1] - Rs[i]) * h))
    return best
def mouth_mask(p):
    return (np.abs(p[:, 0]) < MG_BOX[0]) & (p[:, 2] > MG_BOX[1]) & (p[:, 2] < MG_BOX[2]) & (p[:, 1] < MG_BOX[3])
def groove_sdf(p):
    d = _chain(p, MG_C, MG_RG, scale=True)          # (no philtrum on this sheet)
    for c_ in DIMPLE_C: d = smin(d, np.linalg.norm(p - c_, axis=1) - DIMPLE_R, .003)
    return d
def head_local(q, neck=True):
    d = np.array(head_local_pre(q, neck), float, copy=True); p = np.asarray(q, float).reshape(-1, 3); dv = d.reshape(-1)
    m = mouth_mask(p)
    if m.any():
        pm = p[m]; dd = smin(dv[m], _chain(pm, MG_R, MG_RR), .003)
        dv[m] = smax(dd, -groove_sdf(pm), .0015)
    return dv.reshape(np.shape(d))
NOSE_TIP_L = float(np.nanmin(front_local(np.zeros(40), np.linspace(NZW - NHH, NZW + NHH, 40), head_local)))
def L2M(q): return np.stack([q[..., 0] * W, HY + q[..., 1] * W, CHIN + q[..., 2] * W], -1)
def M2L(p): return np.stack([p[..., 0] / W, (p[..., 1] - HY) / W, (p[..., 2] - CHIN) / W], -1)
def head_sdf(p): return head_local(M2L(p)) * W
def skull_sdf(p): return base_local(M2L(p)) * W
def front_hit(x, z, f=head_sdf):
    return HY + W * front_local(np.asarray(x) / W, (np.asarray(z) - CHIN) / W, lambda q: f(L2M(q)) / W)
O = np.array([0, HY - .03 * W, CHIN + .31 * W])
_g = np.stack(np.meshgrid(np.zeros(1), np.linspace(-.5, .5, 101), np.linspace(.50, .85, 351), indexing='ij'), -1).reshape(-1, 3)
SKULL_TOP_M = float(CHIN + W * _g[head_local(_g) < 0][:, 2].max())
LOG['skull_top_m'] = round(SKULL_TOP_M, 4)

def head_report():
    tip = NOSE_TIP_L
    rows = []
    for z in (.68, .63, .55, .46, .38, .34, .30, .26, .22, .18, .14, .10, .06, .02):
        y = float(front_local(0, z, head_local)[0]); rows.append((z, round(y, 3)))
    back = []
    for z in (.67, .58, .50, .42, .34, .26, .18, .10, .06):
        ys = np.linspace(.8, -.2, 501); P = np.stack([np.zeros_like(ys), ys, np.full_like(ys, z)], -1); inn = head_local(P) < 0
        back.append((z, round(float(ys[inn].max()), 3) if inn.any() else None))
    widths = {}
    for zw in (.0, .02, .03, .04, .055, .07, .10, .133, .165, .196, .23, .259, .29, .323, .355, .386, .42, .45, .50, .55, .60, .65, .68, .70):
        xs_ = np.linspace(0, .7, 351); ys_ = front_local(xs_, np.full(len(xs_), zw), head_local); ok = np.isfinite(ys_)
        widths['%.3f' % zw] = round(float(xs_[ok].max()), 3) if ok.any() else None
    under = {}
    for yv in (-.40, -.34, -.28, -.22, -.16, -.10, -.04):
        zs = np.linspace(-.25, .2, 451); P = np.stack([np.zeros_like(zs), np.full_like(zs, yv), zs], -1); inn = head_local(P, neck=False) < 0
        under['%.2f' % yv] = round(float(zs[inn].min()), 3) if inn.any() else None
    sil = {}
    for zw in (.02, .06, .10, .14, .18, .22, .26, .30, .34, .42, .50, .58, .63):
        xs_ = np.linspace(-.6, .6, 241); ys_ = front_local(xs_, np.full(len(xs_), zw), head_local); sil['%.2f' % zw] = round(float(np.nanmin(ys_)), 3)
    q = np.array([[EXW, float(front_local(EXW, EZW, head_local)[0]), EZW]])
    g = np.zeros(3)
    for k in range(3):
        dp = np.zeros(3); dp[k] = 1e-4; g[k] = (head_local(q + dp) - head_local(q - dp))[0]
    g = g / np.linalg.norm(g)
    ys = np.linspace(-.7, .7, 701); P = np.stack([np.zeros_like(ys), ys, np.full_like(ys, .34)], -1); inn = head_local(P) < 0
    return {'skull_top_W': round((SKULL_TOP_M - CHIN) / W, 3), 'nose_tip_y_W': round(tip, 3), 'nose_c_y_W': round(float(NOSE_C[1]), 3),
            'depth_at_z.34_W': round(float(ys[inn].max() - ys[inn].min()), 3),
            'profile_front(z, y)': rows, 'underside_z(y: z, no neck)': under, 'profile_back(z, y)': back, 'silhouette_front(z: y)': sil, 'half_widths(z: x)': widths,
            'eye_surface_normal_out_deg': round(math.degrees(math.atan2(g[0], -g[1])), 1), 'eye_surface_normal_down_deg': round(math.degrees(math.asin(-g[2])), 1),
            'eye_front_y_W': round(float(q[0, 1]), 3), 'mouth_groove_y_W': [round(float(v), 3) for v in MG_YS[::8]]}
if TUNE:
    print(json.dumps(head_report(), indent=1)); sys.exit(0)

def radial_hit(d, f=head_sdf, o=O, t0=.02, t1=.52, it=32):
    lo = np.full(len(d), t0); hi = np.full(len(d), t1)
    for _ in range(it):
        m = (lo + hi) / 2; inn = f(o + d * m[:, None]) < 0
        lo = np.where(inn, m, lo); hi = np.where(inn, hi, m)
    return o + d * ((lo + hi) / 2)[:, None]
def radial_hit_outer(d, f=head_sdf, o=O, t0=.02, t1=.52, steps=128, fine=0):
    ts = np.linspace(t1, t0, steps); n = len(d)
    P = o + d[:, None, :] * ts[None, :, None]
    ins = (f(P.reshape(-1, 3)) < 0).reshape(n, steps); i = np.argmax(ins, 1)
    lo = ts[i]; hi = ts[np.maximum(i - 1, 0)]
    for _ in range(26):
        m = (lo + hi) / 2; inn = f(o + d * m[:, None]) < 0
        lo = np.where(inn, m, lo); hi = np.where(inn, hi, m)
    return o + d * ((lo + hi) / 2)[:, None]
def grad_n(p, f=head_sdf, e=1.5e-4): return grad(f, p, e)
def to_dom(d):
    den = 1 - d[:, 1]; return np.stack([2 * d[:, 0] / den, 2 * d[:, 2] / den], -1)
def from_dom(uv):
    r2 = (uv * uv).sum(1); den = 4 + r2
    return np.stack([4 * uv[:, 0] / den, -(4 - r2) / den, 4 * uv[:, 1] / den], -1)
AMAX = math.radians(118); UVR0 = .46
def head_uv(d):
    a = np.arccos(np.clip(-d[:, 1], -1, 1)); psi = np.arctan2(d[:, 2], d[:, 0])
    r = np.where(a <= AMAX, UVR0 * a / AMAX, UVR0 + (.5 - UVR0) * (a - AMAX) / (PI - AMAX))
    return np.stack([.5 + r * np.cos(psi), .5 + r * np.sin(psi)], -1)
def head_uv_dir(U, V):
    du = U - .5; dv = V - .5; r = np.sqrt(du * du + dv * dv); psi = np.arctan2(dv, du)
    a = np.where(r <= UVR0, AMAX * r / UVR0, np.minimum(AMAX + (PI - AMAX) * (r - UVR0) / (.5 - UVR0), PI - 1e-3))
    return np.stack([np.sin(a) * np.cos(psi), -np.cos(a), np.sin(a) * np.sin(psi)], -1)

# ============================================================== face layout (front projection, metres)
EX = EXW * W; EZ = CHIN + EZW * W; EHW = EHWW * W; EHH = EHHW * W
def eye_unit(psi):
    c = np.cos(psi); s = np.sin(psi); en = np.where(s > 0, EN_T, EN_B)
    return spow(c, 2 / en), spow(s, 2 / en) * np.where(s > 0, EYE_TOPK, 1.)
EYEF = {}; EYE_LAMBDA = .5; EYE_AXIS_LOCK = (30.0, -6.0)
for _s in (-1, 1):
    _Sc = np.array([_s * EX, float(front_hit(_s * EX, EZ)[0]), EZ]); _ax0 = grad_n(_Sc[None])[0]
    if EYE_AXIS_LOCK:
        _o, _d = map(math.radians, EYE_AXIS_LOCK); _ax0 = np.array([_s * math.sin(_o) * math.cos(_d), -math.cos(_o) * math.cos(_d), -math.sin(_d)])
    _ax = unit(_ax0 * (1 - EYE_LAMBDA) + np.array([0, -1., 0]) * EYE_LAMBDA)
    _ex = unit(np.array([-_ax[1], _ax[0], 0.])); _eo = _s * _ex; _ev = unit(np.cross(_ax, _eo) * _s)
    if _ev[2] < 0: _ev = -_ev
    _ch = math.cos(math.atan2(abs(_ax[0]), -_ax[1])); _cv = math.cos(math.asin(np.clip(_ax[2], -1, 1)))
    EYEF[_s] = dict(Sc=_Sc, ax=_ax, eo=_eo, ev=_ev, hw=EHW / (_ch ** .85) * 1.086, hh=EHH / _cv * 1.028, ax0=_ax0)
def eye_pts(side, psi, k=1.0):
    """skin points of the opening's superellipse (scale k) laid out in the eye plane, hit along the eye axis"""
    F_ = EYEF[side]; ux, uz = eye_unit(np.atleast_1d(psi))
    Q = F_['Sc'] + np.outer(F_['hw'] * k * ux, F_['eo']) + np.outer(F_['hh'] * k * (uz + EYE_SH * ux), F_['ev'])
    ts = np.linspace(.25 * W, -.30 * W, 160); n = len(Q)
    P = Q[:, None, :] + F_['ax'][None, None, :] * ts[None, :, None]
    ins = (head_sdf(P.reshape(-1, 3)) < 0).reshape(n, len(ts)); i = np.argmax(ins, 1)
    lo = ts[np.maximum(i - 1, 0)]; hi = ts[i]
    for _ in range(26):
        m = (lo + hi) / 2; inn = head_sdf(Q + F_['ax'][None] * m[:, None]) < 0
        hi = np.where(inn, m, hi); lo = np.where(inn, lo, m)
    return Q + F_['ax'][None] * ((lo + hi) / 2)[:, None]
def eye_s3(side, P):
    """(superellipse radius, angle, X outward, Z up) of points in the eye plane"""
    F_ = EYEF[side]; d = np.asarray(P) - F_['Sc']
    X = (d @ F_['eo']) / F_['hw']; Z = (d @ F_['ev']) / F_['hh'] - EYE_SH * X
    sr, psi, Zs = eye_norm(X, Z)
    return sr, psi, X, Z
NZ = CHIN + NZW * W
BLUSH = (.300 * W, CHIN + .183 * W, .073 * W, .047 * W)
