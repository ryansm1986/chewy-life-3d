
print('STEP ears', flush=True)
# ============================================================== EARS: big thick rounded triangular pyramids (W units, z above the chin)
# The Kazemaru / Kaede construction (a loft of D-shaped rings square to the ear's axis: a soft flat FRONT face turned 14 deg outward,
# carrying the peach dish, and a full superellipse BACK, the widest a third of the way back), re-measured for Mikan (head close-up):
# the tip at (+-0.35, 0.947), the outer edge continuing the head's side line (x 0.48 at z 0.58-0.72, 0.463 at 0.79), the inner edge
# x 0.173 at z 0.84, 0.23 at 0.895; the peach triangle x 0.22-0.40 from z 0.545 up to 0.845; the dark cap's lower edge from (0.463,
# 0.752) on the outer rim up to (0.20, 0.86) on the inner edge. Side view: the tip 0.16 W behind the head centre (the ear leans back).
EAR_FM = np.array([.245, -.118, .585])          # the front face's middle at the base (on the head's top corner)
EAR_T = np.array([.322, -.012, .893])           # the same point at the tip section
EAR_YAW = 14.; EAR_SEC = dict(ax=.282, ay=.250, cy=.135, n=2.4, kr=.080)
EAR_SC_TIP = .315; EAR_Q = 1.55; EAR_REC = .007 / W; EAR_RCAP = .050
EAR_DARK_VV, EAR_DARK_TILT = .705, .170          # the dark cap's lower edge: VV 0.48 at the outer edge .. 0.82 at the inner edge (sheet)
EAR_PINK_TOP_VV = .780
ear_info = {}
def ear_frame(side):
    m = np.array([side, 1, 1.]); FM = EAR_FM * m; T = EAR_T * m; A = unit(T - FM)
    y_ = math.radians(EAR_YAW); Nf = np.array([side * math.sin(y_), -math.cos(y_), 0.]); Nf = unit(Nf - A * (Nf @ A))
    Lt = unit(np.cross(A, Nf))
    if Lt[0] * side < 0: Lt = -Lt
    return FM, T, A, Nf, Lt
def sec_f(xp, yp):
    """the unit section (W units at the base): < 0 inside. A superellipse back, cut by the soft flat front face y' = 0 (y' points back)"""
    S = EAR_SEC
    egg = ((np.abs(xp) / S['ax']) ** S['n'] + (np.abs(yp - S['cy']) / S['ay']) ** S['n']) ** (1 / S['n']) - 1
    return smax(egg * S['ax'], -yp, S['kr'])
def sec_boundary(theta):
    """the unit section's boundary along rays from its centre (0, cy); theta 0 = straight back, pi = the front face's middle"""
    th = np.asarray(theta, float); d = np.stack([np.sin(th), np.cos(th)], -1); c = np.array([0, EAR_SEC['cy']])
    lo = np.zeros(len(th)); hi = np.full(len(th), .40)
    for _ in range(34):
        mid = (lo + hi) / 2; p = c + d * mid[:, None]; ins = sec_f(p[:, 0], p[:, 1]) < 0
        lo = np.where(ins, mid, lo); hi = np.where(ins, hi, mid)
    p = c + d * ((lo + hi) / 2)[:, None]
    e = 1e-4; gx = sec_f(p[:, 0] + e, p[:, 1]) - sec_f(p[:, 0] - e, p[:, 1]); gy = sec_f(p[:, 0], p[:, 1] + e) - sec_f(p[:, 0], p[:, 1] - e)
    n2 = unit(np.stack([gx, gy], -1))
    return p[:, 0], p[:, 1], n2
def ear_dish(xp, n2, VV):
    """the front recess (the inner ear), W units, pushed back into the ear: <= 1.5 cm, a soft rim"""
    wf = smooth(.55, .92, -n2[:, 1]); prof = np.clip(1 - (xp / .135) ** 2, 0, 1) ** 1.4
    win = smooth(.03, .16, VV) * (1 - smooth(EAR_PINK_TOP_VV - .06, EAR_PINK_TOP_VV + .04, VV))
    return EAR_REC * wf * prof * win
def ear_ring_params(VV):
    VV = float(VV)
    if VV < 0: sc = float(np.interp(VV, [-.40, -.27, -.14, 0], [.86, .97, 1.0, 1.0])); return sc, VV, 0.
    if VV <= 1: return 1 - (1 - EAR_SC_TIP) * VV ** EAR_Q, VV, 0.
    a = min((VV - 1) / .072, 1.) * PI / 2
    return EAR_SC_TIP * math.cos(a), 1., EAR_RCAP * math.sin(a)
EAR_VVS = np.concatenate([[-.40, -.27, -.14], np.linspace(0, 1, 27) ** .92, [1.018, 1.036, 1.052, 1.064, 1.072]])
def ears_sdf(p):
    """an approximate signed field of both ears' volumes (metres): the head and the ear roots"""
    q = M2L(np.asarray(p, float)); best = np.full(len(q), 9.)
    for side in (1, -1):
        FM, T, A, Nf, Lt = ear_frame(side); L = np.linalg.norm(T - FM); Bk = -Nf
        VV = ((q - FM) @ A) / L; v = np.clip(VV, 0, 1)
        sc = np.where(VV < 0, np.interp(VV, [-.40, -.27, -.14, 0], [.86, .97, 1.0, 1.0]), 1 - (1 - EAR_SC_TIP) * v ** EAR_Q)
        O = FM + (T - FM) * np.clip(VV, -.40, 1)[:, None]; r = q - O
        val = sec_f((r @ Lt) / sc, (r @ Bk) / sc) * sc
        val = np.where((VV < -.40) | (VV > 1.02), 9., val)
        best = np.minimum(best, val)
    return best * W
NS_E = 40
EAR_TH = np.linspace(0, 2 * PI, NS_E + 1)            # theta 0 = the back (the UV seam), pi = the front face; the seam column duplicated
EAR_BX, EAR_BY, EAR_BN = sec_boundary(EAR_TH)
for side, tag in ((1, 'L'), (-1, 'R')):
    FM, T, A, Nf, Lt = ear_frame(side); Bk = -Nf
    rings = []
    for VV in EAR_VVS:
        sc, vpos, adv = ear_ring_params(VV)
        Oe = FM + (T - FM) * vpos + A * adv
        dish = ear_dish(EAR_BX, EAR_BN, VV) * math.sqrt(max(sc, 0.)) if 0 <= VV <= 1 else 0.
        rings.append(Oe + np.outer(EAR_BX * sc, Lt) + np.outer(EAR_BY * sc + dish, Bk))
    G = np.array(rings); R = len(EAR_VVS); C_ = NS_E + 1
    Gm = L2M(G.reshape(-1, 3)).reshape(R, C_, 3)
    Pf = Gm.reshape(-1, 3)
    Gm = Pf.reshape(R, C_, 3)
    Gw = np.concatenate([Gm[:, :-1], Gm[:, :1]], 1)            # normals as if closed (the seam column equals the first)
    dS = np.roll(Gm[:, :-1], -1, 1) - np.roll(Gm[:, :-1], 1, 1); dK = np.gradient(Gm[:, :-1], axis=0)
    NG = unit(np.cross(dK, dS)); ctr = Gm[:, :-1].mean(1, keepdims=True)
    NG = np.where(((NG * (Gm[:, :-1] - ctr)).sum(-1) < 0)[..., None], -NG, NG)
    NG = np.concatenate([NG, NG[:, :1]], 1)
    V = list(Gm.reshape(-1, 3)); NN = list(NG.reshape(-1, 3))
    F = grid_faces(R, C_, wrap=False)
    UU, VVg = np.meshgrid(EAR_TH / (2 * PI), EAR_VVS)
    UVl = list(au('ear', UU.reshape(-1), (np.clip(VVg.reshape(-1), -.30, 1.12) + .30) / 1.42))
    sc_, vp_, adv_ = ear_ring_params(1.0)
    pole_q = FM + (T - FM) + A * EAR_RCAP
    pole = len(V); V.append(L2M(pole_q[None])[0]); NN.append(A); UVl.append(au('ear', np.array(.5), np.array((1.12 + .30) / 1.42)))
    last = (R - 1) * C_
    for i in range(NS_E): F.append((last + i, last + i + 1, pole))
    root = len(V); V.append(Gm[0, :-1].mean(0)); NN.append(-A); UVl.append(au('ear', np.array(.5), np.array(0.)))
    for i in range(NS_E): F.append((i + 1, i, root))
    make_obj('ear.' + tag, np.array(V), F, np.array(UVl), 'ear.' + tag, N=np.array(NN))
    cen = FM + Bk * EAR_SEC['cy']
    ear_info[tag] = {'base': L2M(cen[None])[0].tolist(), 'mid': L2M((cen + (T - FM) * .5)[None])[0].tolist(), 'tip': L2M(pole_q[None])[0].tolist(),
                     'facing': Nf.tolist()}
    LOG['ear_%s_tip_m' % tag] = [round(float(c), 3) for c in L2M(pole_q[None])[0]]
