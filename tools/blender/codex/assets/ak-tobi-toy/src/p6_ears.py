
CHARTS['torso'] = (1536, 448, 512, 448)
BODY_PIVOTS = {}; BODY_MEAS = {}; POST_JOIN = None; TAIL = {}; BAND = {}
print('STEP headband', flush=True)
# ============================================================== THE WHITE HEADBAND (metres): a thick soft ring hugging the head, tilted
# (sheet: the centre line 0.727 W above the chin at the front, ~0.565 W at the back; 0.078 m tall, about 0.024 m thick), with a soft
# square knot pad at the back (0.118 m square). Under the ears (hidden) it thins to 1 cm, so the ears can lie close over it.
BAND_ZF, BAND_ZB, BAND_H, BAND_T, BAND_T_SIDE = CHIN + .727 * W, CHIN + .565 * W, .078, .024, .010
def band_zc(phi): return BAND_ZF + (BAND_ZB - BAND_ZF) * (1 - np.cos(phi)) / 2
def band_t(phi):
    """the band's thickness: full at the front and the back, 1 cm under the ears (|phi| ~ 50..140 deg)"""
    a = np.abs(np.arctan2(np.sin(phi), np.cos(phi)))
    return BAND_T - (BAND_T - BAND_T_SIDE) * smooth(1.25, 1.48, a) * smooth(2.12, 1.95, a)
def head_ring_pt(phi, z, f=None):
    phi = np.atleast_1d(np.asarray(phi, float)); z = np.broadcast_to(np.asarray(z, float), phi.shape)
    D = np.stack([np.sin(phi), -np.cos(phi), np.zeros_like(phi)], -1)
    C = np.stack([np.zeros_like(phi), np.full_like(phi, HY), z], -1)
    name_hint[0] = 'band'
    return ray_outer(f or head_sdf, C, D, .60, steps=120, it=28)
NBP = 60; NBS = 12
phis = np.linspace(0, 2 * PI, NBP, endpoint=False)
sa_b = np.linspace(0, 2 * PI, NBS, endpoint=False)
G = np.zeros((NBP, NBS, 3))
tb_ = band_t(phis)
for j in range(NBS):
    db = BAND_H / 2 * spow(np.sin(sa_b[j]), .38)
    dn = (tb_ + .004) / 2 * spow(np.cos(sa_b[j]), .45) + (tb_ - .004) / 2
    P = head_ring_pt(phis, band_zc(phis) + db); N = grad(head_sdf, P)
    G[:, j] = P + N * dn[:, None]
dK = np.roll(G, -1, 0) - np.roll(G, 1, 0); dS = np.roll(G, -1, 1) - np.roll(G, 1, 1)
NG = unit(np.cross(dK, dS)); ctr = np.repeat(G.mean(1, keepdims=True), NBS, 1)
NG = np.where(((NG * (G - ctr)).sum(-1) < 0)[..., None], -NG, NG)
Fb = []
for i in range(NBP):
    for j in range(NBS):
        ii = (i + 1) % NBP; jj = (j + 1) % NBS; Fb.append((i * NBS + j, i * NBS + jj, ii * NBS + jj, ii * NBS + j))
VB = G.reshape(-1, 3); NB_ = NG.reshape(-1, 3)
make_obj('headband', VB, Fb, ramp_uv('band', sval(NB_, hi=.22, lo=.26) - .02), 'band', N=NB_)
BACK = G[NBP // 2]; BACK_OUT = float(BACK[:, 1].max()); BACK_Z = float(band_zc(PI))
# the knot pad: a soft rounded square block on the band's back (sheet back view: 0.118 x 0.116 m), standing about 2.5 cm proud
KNOT_C = np.array([0, BACK_OUT - .006, BACK_Z + .002])
_ca, _sa = math.cos(.25), math.sin(.25)
_kax = np.array([[1., 0, 0], [0, _ca, _sa], [0, -_sa, _ca]])        # tilted back with the head's curve
def bandknot_sdf(p): return sd_box(p, KNOT_C, _kax, (.056, .017, .052), .016)
star_mesh('band_knot', bandknot_sdf, KNOT_C, 'band', lambda NN, V: ramp_uv('band', sval(NN, hi=.22, lo=.26) + .02), nth=14, nph=24, tmax=.12)
BAND.update({'front_z_m': BAND_ZF, 'back_z_m': BAND_ZB, 'knot_m': KNOT_C.tolist()})
LOG['band'] = {'front_centre_z_m': round(BAND_ZF, 3), 'back_centre_z_m': round(BAND_ZB, 3), 'height_m': BAND_H, 'thickness_m': BAND_T,
               'thickness_under_ears_m': BAND_T_SIDE, 'knot_m': [round(float(c), 3) for c in KNOT_C]}
def band_outer_sdf(p):
    """the head grown by the band where the band is (an approximate field of the band's outer face, metres)"""
    p = np.asarray(p, float); phi = np.arctan2(p[:, 0], -(p[:, 1] - HY))
    w = smooth(BAND_H / 2 + .004, BAND_H / 2 - .004, np.abs(p[:, 2] - band_zc(phi)))
    return head_sdf(p) - (band_t(phi) + .002) * w

print('STEP ears', flush=True)
# ============================================================== EARS: big floppy dog ears (W units, z above the chin, y from HY)
# The sheet: each ear is a thick soft paddle, an egg in the side view (z 0.085 .. 0.88, y -0.14 .. +0.40 at its widest, narrower at the
# top), folding over from a root on the dome above the headband, lying over the band and down the head's side, and flaring out a little
# at the fat round bottom lobe (front view: the outer edge at x 0.685 W at z 0.23, the bottom at z ~0.09; the tops level with the crown).
# Construction: a loft along a SPINE (root inside the dome -> over the fold -> down the side -> the lobe) with lens sections square to it.
# Each section point's inner face lies on the HULL (the head, the band's outer face, and below the widest level a straight curtain, so
# the ear hangs instead of following the head inward), a few mm off it (sunk into the dome at the root, flared out at the lobe); the outer
# face is a thickness T further out along the spine's outward normal. Thickness 0.11 W at the fold .. 0.17 W at the lobe; rounded edges.
# Rings square to the spine = the ear's bend rings.
EAR_SP = np.array([[.100, .065, .790], [.190, .068, .878], [.300, .075, .905], [.410, .090, .862], [.490, .105, .762],
                   [.545, .118, .622], [.580, .126, .470], [.598, .130, .320], [.606, .132, .200], [.610, .132, .100]])
EAR_S = [0., .06, .14, .28, .45, .62, .80, .90, 1.]
EAR_WH = [.070, .120, .150, .185, .240, .268, .272, .236, .0]           # half-width along y (the side-view egg)
EAR_TT = [.070, .100, .115, .135, .160, .185, .200, .205, .0]          # thickness
EAR_GP = [-.095, -.045, -.014, .008, .012, .018, .028, .040, .050]       # the inner face's offset from the hull (- = sunk; + flares the lobe)
EAR_NS = 2.3; EAR_RELAX = 6; EAR_FWD = .035; EAR_FTHIN = .32
def _cum(P): d = np.linalg.norm(np.diff(P, axis=0), axis=1); s = np.concatenate([[0], np.cumsum(d)]); return s / s[-1]
_sp = cpath(EAR_SP, 300); _ss = _cum(_sp)
def ear_spine(s):
    s = np.atleast_1d(np.asarray(s, float)); return np.stack([np.interp(s, _ss, _sp[:, i]) for i in range(3)], -1)
def ear_dims(s):
    s = np.asarray(s, float)
    end = np.sqrt(np.clip(1 - ((s - .86) / .14) ** 2, 0, 1)) * (s > .86) + (s <= .86)      # the round lobe closes the bottom
    wh = np.interp(s, EAR_S[:-1], EAR_WH[:-1]) * end; tt = np.interp(s, EAR_S[:-1], EAR_TT[:-1]) * end ** .6
    return wh, tt, np.interp(s, EAR_S, EAR_GP)
# the hull: the head, the band's outer face, and the curtain below the widest level (W units in, metres out)
DT_Y = np.linspace(-.40, .60, 61); DT_Z = np.linspace(1.00, -.05, 161)
_YY, _ZZ = np.meshgrid(DT_Y, DT_Z)
def _hb(p): return np.minimum(head_sdf(p), band_outer_sdf(p))
_C = L2M(np.stack([np.zeros(_YY.size), _YY.ravel(), _ZZ.ravel()], -1)); _ins = _hb(_C) < 0
_hx = np.zeros(_YY.size)
if _ins.any():
    name_hint[0] = 'ear drape'
    _Ph = ray_outer(_hb, _C[_ins], np.tile([1., 0, 0], (int(_ins.sum()), 1)), .45, steps=110, it=26)
    _hx[_ins] = _Ph[:, 0] / W
DRAPE = np.maximum.accumulate(_hx.reshape(_YY.shape), axis=0)       # z runs downward along axis 0: a curtain from the widest point
def drape(y, z):
    """bilinear lookup of the curtain's half-width (W units)"""
    y = np.asarray(y, float); z = np.asarray(z, float) * np.ones_like(y)
    fz = np.clip((DT_Z[0] - z) / (DT_Z[0] - DT_Z[-1]) * (len(DT_Z) - 1), 0, len(DT_Z) - 1.001); iz = fz.astype(int); tz = fz - iz
    fy = np.clip((y - DT_Y[0]) / (DT_Y[-1] - DT_Y[0]) * (len(DT_Y) - 1), 0, len(DT_Y) - 1.001); iy = fy.astype(int); ty = fy - iy
    a = DRAPE[iz, iy] * (1 - ty) + DRAPE[iz, iy + 1] * ty; b = DRAPE[iz + 1, iy] * (1 - ty) + DRAPE[iz + 1, iy + 1] * ty
    return a * (1 - tz) + b * tz
def hull_sdf(p):
    q = M2L(np.asarray(p, float)); cur = (np.abs(q[:, 0]) - drape(q[:, 1], q[:, 2])) * W
    return np.minimum(_hb(p), cur)
def hull_out(P0, N, tmax=.40):
    """the outermost hull crossing along +N through the base points P0 (metres); misses keep P0"""
    n = len(P0); ts = np.linspace(tmax, -.25, 140); found = np.zeros(n, bool); lo = np.zeros(n); hi = np.zeros(n)
    for k in range(1, len(ts)):
        v = hull_sdf(P0 + N * ts[k]); new = (~found) & (v < 0); lo[new] = ts[k]; hi[new] = ts[k - 1]; found |= new
        if found.all(): break
    for _ in range(26):
        m = .5 * (lo + hi); ins = hull_sdf(P0 + N * m[:, None]) < 0; lo = np.where(ins, m, lo); hi = np.where(ins, hi, m)
    t = np.where(found, .5 * (lo + hi), 0.)
    return P0 + N * t[:, None], found
NS_E = 40; NK_E = 32
EAR_TH = np.linspace(0, 2 * PI, NS_E + 1)          # theta 0 = the back edge, pi/2 = the outer face, pi = the front edge
EAR_SK = (1 - np.cos(PI * np.linspace(0, 1, NK_E + 2)[1:-1])) / 2 * .995          # root .. lobe, dense at both ends
ear_info = {}; EAR_GRID = {}
def ear_frames(s):
    """the LEFT ear's spine points, tangents and outward normals (x-z plane, square to the tangent)"""
    P = ear_spine(s); Tg = unit(np.gradient(P, axis=0))
    Nn = unit(np.cross(Tg, np.array([0, 1., 0])[None]))
    return P, Tg, Nn
def build_ear(side, tag):
    s = EAR_SK; P, Tg, Nn = ear_frames(np.concatenate([[0.], s, [1.]])); P, Tg, Nn = P[1:-1], Tg[1:-1], Nn[1:-1]
    mir = np.array([side, 1, 1]); Pm = L2M(P * mir); Nm = Nn * mir
    wh, tt, gp = ear_dims(s)
    a = spow(np.cos(EAR_TH), 2 / EAR_NS); b = spow(np.sin(EAR_TH), 2 / EAR_NS)
    R = len(s); C_ = len(EAR_TH)
    # (phase-2 tweak, the director: the ears' inner edges 0.04 W toward the face) the hanging part's front edge reaches a little further
    # forward, where the head is narrower, and thins toward that edge, so it wraps the cheek like the sheet's ears
    fwd = smooth(.25, .45, s)[:, None] * np.maximum(-a, 0)[None, :]
    base = Pm[:, None, :] + np.array([0, 1., 0])[None, None, :] * ((wh[:, None] * a[None, :] - EAR_FWD * fwd * wh[:, None] / .27) * W)[..., None]
    Nb = np.repeat(Nm[:, None, :], C_, 1)
    H, ok = hull_out(base.reshape(-1, 3), Nb.reshape(-1, 3))
    H = H.reshape(R, C_, 3); ok = ok.reshape(R, C_)
    # a miss (an edge point past the head's outline) takes the row's mean offset along N
    off = ((H - base) * Nb).sum(-1)
    for k in range(R):
        if (~ok[k]).any(): off[k, ~ok[k]] = off[k, ok[k]].min() if ok[k].any() else 0.
    inner = base + Nb * (off + gp[:, None] * W)[..., None]
    G = inner + Nb * ((tt[:, None] * W * (1 - EAR_FTHIN * fwd ** 1.5)) * (1 + b[None, :]) / 2)[..., None]
    # relax the loft along the spine (rounds the fold and the elbow above the lobe), then keep it off the head and the band
    for _ in range(EAR_RELAX):
        G[1:-1] = .25 * G[:-2] + .5 * G[1:-1] + .25 * G[2:]
        G[:, :-1] = .5 * G[:, :-1] + .25 * np.roll(G[:, :-1], 1, 1) + .25 * np.roll(G[:, :-1], -1, 1); G[:, -1] = G[:, 0]
    keep = s > .10                                                      # (the sunk root may stay inside the dome)
    Gk = G[keep].reshape(-1, 3); Gk = push_out(Gk, .004, _hb, it=10); G[keep] = Gk.reshape(G[keep].shape)
    dS = np.roll(G[:, :-1], -1, 1) - np.roll(G[:, :-1], 1, 1); dK = np.gradient(G[:, :-1], axis=0)
    NG = unit(np.cross(dK, dS)); ctr = G[:, :-1].mean(1, keepdims=True)
    NG = np.where(((NG * (G[:, :-1] - ctr)).sum(-1) < 0)[..., None], -NG, NG)
    NG = np.concatenate([NG, NG[:, :1]], 1)
    V = list(G.reshape(-1, 3)); NN = list(NG.reshape(-1, 3)); F = grid_faces(R, C_, wrap=False)
    UU, VVg = np.meshgrid(EAR_TH / (2 * PI), s)
    UVl = list(au('ear', UU.reshape(-1), VVg.reshape(-1)))
    for end, sgn in ((0, -1.), (R - 1, 1.)):
        q = G[end, :-1].mean(0).copy(); tg = Tg[end] * mir
        q = q + unit(tg) * sgn * float(np.linalg.norm(G[end, 0] - G[end, NS_E // 2])) * .12
        pole = len(V); V.append(q); NN.append(unit(tg) * sgn); UVl.append(au('ear', np.array(.5), np.array(0. if sgn < 0 else 1.)))
        b0 = end * C_
        for i in range(NS_E):
            F.append((b0 + i + 1, b0 + i, pole) if sgn < 0 else (b0 + i, b0 + i + 1, pole))
    make_obj('ear.' + tag, np.array(V), F, np.array(UVl), 'ear.' + tag, N=np.array(NN))
    EAR_GRID[tag] = (s, NG)
    root = L2M((ear_spine(np.array([.10]))[0] * np.array([side, 1, 1]))[None])[0]
    ear_info[tag] = {'base': root.tolist(), 'top': G[np.searchsorted(s, .14)].mean(0).tolist(), 'mid': G[R // 2].mean(0).tolist(),
                     'tip': G[-2].mean(0).tolist()}
    LOG['ear_%s_bottom_m' % tag] = [round(float(c), 3) for c in G[-1].mean(0)]
for side, tag in ((1, 'L'), (-1, 'R')): build_ear(side, tag)
