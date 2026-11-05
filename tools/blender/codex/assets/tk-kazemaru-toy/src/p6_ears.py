
print('STEP ears', flush=True)
# ============================================================== EARS: thick rounded triangular pyramids (round 3; W units, z above the chin)
# The director's round-2 answer: the sheet's fox ear is a soft chunky cone squashed to a lens section, broad from the front (the face with
# the mauve dish) and broad from the side (the back slope). Each ring of the loft is a "D" section in the plane square to the ear's axis:
# a soft flat FRONT face (turned 20 deg outward, carrying the dish) and a full superellipse BACK, the widest a third of the way back;
# about 0.23 W across and 0.31 W front to back at the base. The section shrinks uniformly to a round tip 0.04 W across; a few root rings
# sink into the skull (their outer flank runs down to the band, which hugs it). The ear stands upright: the front edge leans back ~12 deg
# in the side view, the tip at 1.245 m, the outer edge at x ~0.46 W.
EAR_FM = np.array([.322, -.100, .643])          # the front face's middle at the base (on the crown, just behind the band's top edge)
EAR_T = np.array([.383, -.045, .903])           # the same point at the tip section
EAR_YAW = 20.; EAR_SEC = dict(ax=.160, ay=.205, cy=.115, n=2.6, kr=.036)
EAR_SC_TIP = .135; EAR_Q = .90; EAR_REC = .015 / W; EAR_RCAP = .022
EAR_DARK_VV = .780; EAR_PINK_TOP_VV = .660
BAND_ZF, BAND_ZB, BAND_H, BAND_T = 1.003, .928, .066, .021      # (the headband, built in the body step)
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
    if VV < 0: sc = float(np.interp(VV, [-.28, -.18, -.08, 0], [.80, 1.04, 1.03, 1.0])); return sc, VV, 0.
    if VV <= 1: return 1 - (1 - EAR_SC_TIP) * VV ** EAR_Q, VV, 0.
    a = min((VV - 1) / .08, 1.) * PI / 2
    return EAR_SC_TIP * math.cos(a), 1., EAR_RCAP * math.sin(a)
EAR_VVS = np.concatenate([[-.28, -.18, -.08], np.linspace(0, 1, 26), [1.028, 1.052, 1.070]])
def ears_sdf(p):
    """an approximate signed field of both ears' volumes (metres): the band hugs the union of the head and the ear roots"""
    q = M2L(np.asarray(p, float)); best = np.full(len(q), 9.)
    for side in (1, -1):
        FM, T, A, Nf, Lt = ear_frame(side); L = np.linalg.norm(T - FM); Bk = -Nf
        VV = ((q - FM) @ A) / L; v = np.clip(VV, 0, 1)
        sc = np.where(VV < 0, np.interp(VV, [-.28, -.18, -.08, 0], [.80, 1.04, 1.03, 1.0]), 1 - (1 - EAR_SC_TIP) * v ** EAR_Q)
        O = FM + (T - FM) * np.clip(VV, -.28, 1)[:, None]; r = q - O
        val = sec_f((r @ Lt) / sc, (r @ Bk) / sc) * sc
        val = np.where((VV < -.28) | (VV > 1.02), 9., val)
        best = np.minimum(best, val)
    return best * W
NS_E = 44
EAR_TH = np.linspace(0, 2 * PI, NS_E + 1)            # theta 0 = the back (the UV seam), pi = the front face; the seam column duplicated
EAR_BX, EAR_BY, EAR_BN = sec_boundary(EAR_TH)
for side, tag in ((1, 'L'), (-1, 'R')):
    FM, T, A, Nf, Lt = ear_frame(side); Bk = -Nf
    rings = []
    for VV in EAR_VVS:
        sc, vpos, adv = ear_ring_params(VV)
        O = FM + (T - FM) * vpos + A * adv
        dish = ear_dish(EAR_BX, EAR_BN, VV) * math.sqrt(max(sc, 0.)) if 0 <= VV <= 1 else 0.
        rings.append(O + np.outer(EAR_BX * sc, Lt) + np.outer(EAR_BY * sc + dish, Bk))
    G = np.array(rings); R = len(EAR_VVS); C_ = NS_E + 1
    Gm = L2M(G.reshape(-1, 3)).reshape(R, C_, 3)
    # tuck the ear's lower surface under the headband: below the band's top edge, no point stands further out (horizontally, from the
    # head's axis) than the head surface + 12 mm, so the band (which hugs the head) covers the root cleanly and the ear rises behind it
    Pf = Gm.reshape(-1, 3); phi_ = np.arctan2(Pf[:, 0], -(Pf[:, 1] - HY))
    ztop = BAND_ZF + (BAND_ZB - BAND_ZF) * (1 - np.cos(phi_)) / 2 + BAND_H / 2 + .012
    wv = smooth(ztop + .032, ztop - .020, Pf[:, 2]); sel = wv > 0
    if sel.any():
        Dh = np.stack([np.sin(phi_[sel]), -np.cos(phi_[sel]), np.zeros(sel.sum())], -1)
        Ch = np.stack([np.zeros(sel.sum()), np.full(sel.sum(), HY), Pf[sel, 2]], -1)
        name_hint[0] = 'ear tuck'; Hh = ray_outer(head_sdf, Ch, Dh, .60, steps=100, it=24)
        rh = np.linalg.norm(Hh[:, :2] - Ch[:, :2], axis=1); rv = (Pf[sel, :2] - Ch[:, :2]) @ np.array([1., 0]) * 0 + np.linalg.norm(Pf[sel, :2] - Ch[:, :2], axis=1)
        new_r = rv - wv[sel] * np.maximum(rv - (rh + .006), 0)
        dirh = (Pf[sel, :2] - Ch[:, :2]) / np.maximum(rv, 1e-9)[:, None]
        Pf[sel, :2] = Ch[:, :2] + dirh * new_r[:, None]
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
