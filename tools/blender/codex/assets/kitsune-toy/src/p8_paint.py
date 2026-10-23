
# ============================================================== PAINTED ATLAS
def stroke(x, z, P, half, aa):
    best = np.full(len(x), 9.)
    for i in range(len(P) - 1):
        a = P[i]; b = P[i + 1]; ab = b - a; L2 = ab @ ab
        t = np.clip(((x - a[0]) * ab[0] + (z - a[1]) * ab[1]) / L2, 0, 1)
        dx = x - (a[0] + t * ab[0]); dz = z - (a[1] + t * ab[1])
        best = np.minimum(best, np.sqrt(dx * dx + dz * dz) - (half[i] * (1 - t) + half[i + 1] * t))
    return 1 - smooth(-aa, aa, best)
def lash_th(psi):
    """the upper lash outline (sheet): thickest over the top (0.019 W), thinning down the outer side to below the outer corner and into
    the inner corner; no line under the eye. psi: 0 = outer corner, pi/2 = top, pi = inner corner (radius units of the opening)"""
    p = np.where(psi < -PI / 2, psi + 2 * PI, psi)              # -pi/2 .. 3 pi/2, continuous over the top
    top = 1.25 * (.105 * np.sin(np.clip(p, 0, PI)) ** .70 + .040 * np.exp(-((p - .75) / .55) ** 2))
    base = .045 * smooth(-.70, -.10, p) * smooth(PI + .40, PI - .10, p)
    outer = .060 * smooth(-1.10, -.35, p) * (1 - smooth(.30, .80, p))
    return top + base + outer
def paint_hit(d):
    P = radial_hit(d); t = np.linalg.norm(P - O, axis=1)
    bad = np.zeros(len(d), bool)
    for k in range(1, 9):
        tk = np.minimum(t + .012 * k, .52); bad |= head_sdf(O + d * tk[:, None]) < 0
    if bad.any(): P[bad] = radial_hit_outer(d[bad])
    return P
def ell_r(q, c, r): return np.sqrt((((q - np.array(c)) / np.array(r)) ** 2).sum(1))
def white_face(q, n):
    """the white lower face (front projection, W units): the muzzle and lower cheeks under a soft arc (0.27 W at the centre, 0.20 under
    the eyes), its sides at |x| 0.30 .. 0.33 with a soft white cheek tuft pointing out at z ~0.10; the chin's underside and the neck"""
    qx, qy, qz = q[:, 0], q[:, 1], q[:, 2]; ax_ = np.abs(qx)
    top = np.interp(ax_, [0, .05, .10, .15, .20, .25, .30, .36, .60], [.272, .264, .248, .226, .208, .200, .194, .186, .17])
    # round 3: the orange cheeks come down to z ~0.12 at the outline; the white's side runs under the blush (x 0.30) and widens to the
    # outline only below z 0.11, with two gentle tuft points on the way
    side = (np.interp(qz, [-.10, .04, .08, .11, .14, .17, .20, .40], [.40, .45, .45, .41, .36, .325, .300, .300])
            + .022 * np.exp(-((qz - .140) / .014) ** 2) + .018 * np.exp(-((qz - .098) / .012) ** 2))
    aa = .006
    m = (1 - smooth(-aa, aa, qz - top)) * (1 - smooth(-aa, aa, ax_ - side))
    m = m * smooth(.12, -.02, qy)                                   # front and under (not round the back of the jaw)
    under = smooth(-.20, -.55, n[:, 2]) * (ax_ < .33) * smooth(.20, .05, qy) * (qz < .10)
    neck = smooth(.0, -.04, qz) * smooth(.02, -.08, qy)
    return clamp(np.maximum.reduce([m, under, neck]))
def paint_head(U, V, P=None):
    sh = U.shape; d = head_uv_dir(U.ravel(), V.ravel()); P = paint_hit(d) if P is None else P; n = grad_n(P)
    x, y, z = P[:, 0], P[:, 1], P[:, 2]; q = M2L(P); qx, qz = q[:, 0], q[:, 2]; ax_ = np.abs(qx)
    fr = smooth(HY + .04, HY - .08, y)
    C = ramp_colour('fur', sval(n, hi=.12, lo=.20))
    # soft clay creases where the muzzle, the chin and the tufts meet the skull (fillet shading, never lines)
    dsk = skull(q); dch = smin(dsk, ell(q, *CHEEK), K_CHEEK)
    cr = .22 * crease(dch, muz_sdf(q), K_MUZ) + .18 * crease(smin(dch, muz_sdf(q), K_MUZ), ell(q, *CHINB), K_CHINB) \
        + .40 * crease(dch, ell(mirror(q), *TUFT), K_TUFT)
    C = mix(C, rgb('furdark'), clamp(cr) * .35)
    # the ears' contact shade on the head round each ear root
    for s in (-1, 1):
        Bc, Tp, A, Nf, E = ear_frame(s); Pm = L2M(Bc[None] + A[None] * .06)[0]
        dd = np.linalg.norm(P - Pm, axis=1) / W
        C = mix(C, rgb('furdark'), .28 * np.exp(-(dd / .16) ** 2))
    # the white lower face
    wm = white_face(q, n)
    C = mix(C, ramp_colour('white', sval(n, hi=.10, lo=.16) - .06 * smooth(.10, -.05, qz)), wm)
    # blush, over the white / fur border on the cheeks
    bx, bz, bw, bh = BLUSH
    for s in (-1, 1):
        r = np.sqrt(((x - s * bx) / bw) ** 2 + ((z - bz) / bh) ** 2)
        C = mix(C, rgb('blush'), .82 * (1 - smooth(.55, 1.08, r)) * fr * PAINT_OPTS['blush'])
    # brows: soft dark arcs (sheet: centres +-0.205 W at 0.519 W, 0.111 W long, 0.044 W tall with the arc), rounded ends
    t_ = np.linspace(-1, 1, 13)
    for s in (-1, 1):
        Pb = np.stack([s * (.205 + .056 * t_), .512 + .016 * (1 - t_ ** 2) - .004 * s * t_ * 0 + .003 * t_], -1)
        hb = .0030 + .0105 * (1 - t_ ** 2) ** .65
        near = (np.abs(qx - s * .205) < .10) & (qz > .46) & (qz < .58)
        a = np.zeros(len(x)); a[near] = stroke(qx[near], qz[near], Pb, hb, .0045)
        C = mix(C, rgb('brow'), .95 * a * fr)
    # nose: dark, a soft top highlight
    qq = q - NOSE_C; qq[:, 1] = qq[:, 1] - nose_recede(qq[:, 2]); widen = nose_widen(qq[:, 2]); qq[:, 2] = qq[:, 2] * nose_flat(qq[:, 2])
    rn = np.sqrt((qq[:, 0] / (NHW * widen)) ** 2 + (qq[:, 1] / NHD) ** 2 + (qq[:, 2] / NHH) ** 2)
    zr_ = (qz - NZW) / NHH; hw_ = NOSE_PW * (.55 + .45 * smooth(-1.0, .55, zr_)) * np.sqrt(np.clip(1 - np.clip(zr_ - .55, 0, 1) ** 2 / .45 ** 2 * .35, 0, 1))
    r2d = np.sqrt((qx / np.maximum(hw_, 1e-4)) ** 2 + ((zr_ - .03) / 1.03) ** 2)
    deep = (q[:, 1] - NOSE_TIP_L)
    nose_m = (1 - smooth(.94, 1.02, r2d)) * smooth(.07, .05, deep) * (n[:, 1] < .2)
    nose_c = ramp_colour('nose', sval(n, hi=.10, lo=.22) - .02)
    C = mix(C, nose_c, .98 * np.maximum(nose_m, 1 - smooth(1.05, 1.12, rn)))
    rh_ = np.sqrt(((qq[:, 0] + .010) / .024) ** 2 + ((qq[:, 2] - .016) / .010) ** 2) + 9 * (qq[:, 1] > .018)
    C = mix(C, rgb('nosehi'), .65 * (1 - smooth(.40, 1.0, rh_)) * np.maximum(rn < 1.10, nose_m > .5))
    # the sculpted mouth: no painted line; a darker shade on the groove walls only, by depth behind the un-grooved surface
    mb = (fr > 0) & mouth_mask(q) & (q[:, 2] < NZW - .80 * NHH)
    if mb.any():
        dep = -head_local_pre(q[mb])
        C[mb] = mix(C[mb], rgb('#C89A8C'), .35 * smooth(.0004, .0020, dep))      # only a whisper of the sculpted groove
    # round 2: the painted smile line (#493044, 0.012 W): one clean curve each side from the philtrum out to gently curled corners
    t_m = np.linspace(-1.03, 1.03, 61); Pm = mouth_arch(t_m)
    hm = .0060 * (1 - .45 * smooth(.80, 1.03, np.abs(t_m))) + .0012
    Pp = np.array([[0, NZW - NHH + .004], [0, MA_C + MA_CUSP]]); hp = np.array([.0050, .0058])
    nm = (fr > 0) & (np.abs(qx) < .16) & (qz > .09) & (qz < NZW)
    if nm.any():
        a = np.maximum(stroke(qx[nm], qz[nm], Pm, hm, .0026), stroke(qx[nm], qz[nm], Pp, hp, .0026))
        C[nm] = mix(C[nm], rgb('brow'), .96 * a)
    # the eyes: the thick dark upper lash with a small outer wing; a soft warm line under the outer half only
    for s in (-1, 1):
        sr, psi, X, Z = eye_s3(s, P)
        near_eye = fr * (sr < 2.2)
        th = lash_th(psi)
        lash = (1 - smooth(1 + th - .016, 1 + th + .016, sr)) * smooth(.004, .02, th)
        wing = np.zeros(len(x)); nw = near_eye > 0
        tt_ = np.linspace(0, 1, 7)
        Pw = np.stack([1.00 + .34 * tt_, .16 + .21 * tt_ ** 1.2], -1)
        hw_w = .105 * (1 - .85 * tt_) + .008
        wv = np.zeros(len(x)); wv[nw] = stroke(X[nw], Z[nw], Pw, hw_w, .014); wing = np.maximum(wing, wv)
        C = mix(C, rgb('lash'), np.maximum(lash, wing) * PAINT_OPTS['lash'] * near_eye)
    return C.reshape(sh + (3,))

AA_COUNT = [0]
def paint_head_aa(U, V):
    """the head chart, with 3x3 supersampling where the thin painted lines live (the mouth groove shade, the nose edge)"""
    sh = U.shape; d = head_uv_dir(U.ravel(), V.ravel()); P0 = paint_hit(d); q = M2L(P0); C = paint_head(U, V, P0)
    front = (np.abs(q[:, 0]) < .18) & (q[:, 2] > .08) & (q[:, 2] < .27) & (q[:, 1] < -.30)
    near = np.zeros(len(q), bool)
    if front.any():
        qf = q[front]; _ma2 = mouth_arch(np.linspace(-1.05, 1.05, 90), True)
        dm = np.min(np.hypot(qf[:, 0:1] - _ma2[None, :, 0], qf[:, 2:3] - _ma2[None, :, 1]), axis=1)
        dph = np.where((qf[:, 2] < NZW) & (qf[:, 2] > MA_C - .005), np.abs(qf[:, 0]), 9.)
        zr_ = (qf[:, 2] - NZW) / NHH
        hw_ = NOSE_PW * (.55 + .45 * smooth(-1.0, .55, zr_)) * np.sqrt(np.clip(1 - np.clip(zr_ - .55, 0, 1) ** 2 / .45 ** 2 * .35, 0, 1))
        r2d = np.sqrt((qf[:, 0] / np.maximum(hw_, 1e-4)) ** 2 + ((zr_ - .03) / 1.03) ** 2)
        near[np.where(front)[0]] = (dm < .014) | (dph < .008) | ((r2d > .80) & (r2d < 1.20))
    if near.any():
        x0, y0, w, h = CHARTS['head']; du = 1. / (w - 12); dv = 1. / (h - 12)
        Uf = U.ravel()[near]; Vf = V.ravel()[near]; acc = np.zeros((len(Uf), 3))
        for a in (-1 / 3, 0., 1 / 3):
            for b in (-1 / 3, 0., 1 / 3):
                acc += paint_head(Uf + a * du, Vf + b * dv)
        Cf = C.reshape(-1, 3); Cf[near] = acc / 9; C = Cf.reshape(sh + (3,))
    AA_COUNT[0] += int(near.sum())
    return C

IRIS_RX_W, IRIS_RZ_W = .071, .098                    # the iris (sheet close-up): 0.142 x 0.196 W, a tall oval nearly filling the height
def paint_eye(U, V, s):
    Xs = (U - .5) * 2.4; Z = (V - .5) * 2.4         # Xs: screen right (the chart's u runs to screen right for both eyes)
    Xo = s * Xs                                      # outward
    sr = eye_norm(Xo, Z)[0]
    hw = EYEF[s]['hw'] / W; hh = EYEF[s]['hh'] / W
    Xm = Xo * hw; Zm = Z * hh                        # metric eye-plane coordinates (W units), outward / up
    ixm = -.040; izm = -.004                         # the iris tucked toward the nose; white crescents on the outer side
    C = mix(rgb('sclera'), rgb('#EADFDA'), .55 * smooth(.25, .95, Z))
    ex = (Xm - ixm) / IRIS_RX_W; ez = (Zm - izm) / IRIS_RZ_W; r = np.sqrt(ex * ex + ez * ez)
    g = smooth(.65, -.80, ez)                        # 0 at the top .. 1 at the bottom
    I = mix(rgb('#3A2010'), rgb('#B8742A'), smooth(.10, .50, g))
    I = mix(I, rgb('iris'), smooth(.40, .78, g))
    I = mix(I, rgb('irisglow'), .65 * smooth(.70, 1.0, g) * (1 - smooth(.62, .92, r)))
    I = mix(I, rgb('#4A2810'), .75 * smooth(.84, .99, r))
    I = I * (1 - .040 * (.5 + .5 * np.sin(np.arctan2(ez, ex) * 22 + r * 8)) * smooth(.45, .80, r))[..., None]
    C = mix(C, I, 1 - smooth(.985, 1.015, r))
    pxm = ixm - .006; pzm = izm + .006
    Rp = np.sqrt(((Xm - pxm) / .046) ** 2 + ((Zm - pzm) / .068) ** 2)
    C = mix(C, rgb('#1E1418'), 1 - smooth(.96, 1.04, Rp))
    # catchlights, the same light for both eyes (upper left on screen): a big round one and a small one lower right
    sl = -s                                          # screen-left in outward units
    big = np.sqrt(((Xm - (pxm + sl * .036)) / .019) ** 2 + ((Zm - (pzm + .040)) / .022) ** 2)
    small = np.sqrt(((Xm - (pxm - sl * .026)) / .0085) ** 2 + ((Zm - (pzm - .030)) / .0085) ** 2)
    C = mix(C, rgb('#FFFBF6'), np.maximum(1 - smooth(.90, 1.08, big), .85 * (1 - smooth(.86, 1.12, small))))
    C = mix(C, rgb('lash'), smooth(.90, 1.0, sr) * smooth(-.30, .30, Z))
    skin = ramp_colour('fur', .45)
    return mix(C, skin, smooth(1.03, 1.07, sr))

LIGHT_SYM = unit(np.array([0., -.35, 1.]))
def sval_sym(n, hi=.26, lo=.22, occ=0.):
    d = np.asarray(n) @ LIGHT_SYM
    return clamp(.50 + hi * smooth(.0, .95, d) - lo * smooth(.05, .95, -d) - occ)
def paint_ear(U, V):
    sh = U.shape; U = U.ravel(); V = V.ravel()
    back = U > .5; UU = np.clip((U - np.where(back, .75, .25)) / .215, -1, 1); VV = np.clip(V * 1.27 - .30, -.30, .985)
    n = ear_normal(1, VV, UU); n = np.where(back[:, None], -n, n)
    sv = np.where(back, sval_sym(n, hi=.10, lo=.14), .50 + .02 * n[:, 2])       # round 3: a flat front (no light band in the cup)
    # round 2: one clean dark band over the top third (both faces and the rims), its lower edge a soft, nearly straight line
    vd = EAR_DARK_VV + .010 * UU
    dark = smooth(-.008, .008, VV - vd)
    C = ramp_colour('fur', sv + .02)
    C = mix(C, ramp_colour('tip', sv), dark)
    # the broad inner-ear triangle: inset EAR_PINK_INSET (W) from the ear's own edge (metric), up to just inside the dark band
    vc = np.clip(VV, 0, None); hwv = ear_halfwidth(VV)
    edge = (1 - np.abs(UU)) * hwv                         # distance to the side edge (W)
    top = (EAR_PINK_TOP_VV - vc) * .45                   # distance below the inner ear's top (W, along the axis)
    inset = np.minimum(edge - EAR_PINK_INSET, top)
    pink = smooth(-.004, .004, inset) * (~back)
    cup = (1 - UU ** 2) * (1 - smooth(.0, .7, vc / EAR_PINK_TOP_VV))
    C = mix(C, ramp_colour('inner', .52 - .14 * cup), pink)
    return C.reshape(sh + (3,))
def paint_tail(U, V):
    sh = U.shape; U = U.ravel(); V = V.ravel()
    ph = U * 2 * PI; k = V * (TAIL['rings'] - 1)
    tk = TAIL['tk']; idx = np.clip(np.searchsorted(tk, V) - 1, 0, len(tk) - 2); f = clamp((V - tk[idx]) / (tk[idx + 1] - tk[idx]))
    Bv = unit(TAIL['B'][idx] * (1 - f[:, None]) + TAIL['B'][idx + 1] * f[:, None]); Xv = TAIL['X'][idx]
    n = unit(Xv * np.sin(ph)[:, None] - Bv * np.cos(ph)[:, None])
    sv = sval(n, hi=.24, lo=.24, occ=.12 * smooth(.20, .0, V))
    # the white tip (sheet): lower on the outer / back side of the curve (phi = pi) than on the inner side, with a soft flame edge
    tw = .615 + .085 * np.cos(ph) + .030 * np.sin(3 * ph + .6) + .018 * np.sin(7 * ph + 1.9) + .010 * np.sin(11 * ph + .3)
    wht = smooth(-.012, .012, V - tw)
    C = ramp_colour('fur', sv)
    C = mix(C, ramp_colour('white', sv + .04), wht)
    C = mix(C, rgb('furdark'), .20 * smooth(.08, .0, V))
    return C.reshape(sh + (3,))
def paint_torso(U, V):
    sh = U.shape; U = U.ravel(); V = V.ravel()
    a = U * 2 * PI - PI; z = TZ[0] + V * (TZ[-1] - TZ[0])
    P = torso_raw(a, z); n = torso_n(a, z); x = P[:, 0]
    sv = sval(n, hi=.24, lo=.20)
    hw = np.where(z > ZN, VHW, VHW * np.clip((z - ZX) / (ZN - ZX), 0, 1))
    white = (1 - smooth(-.002, .002, np.abs(x) - hw)) * (np.cos(a) > 0) * smooth(ZX - .004, ZX + .004, z)
    C = mix(ramp_colour('kimono', sv), mix(ramp_colour('kimono', sv + .18), rgb('#7A6AE0'), .2), .10)
    C = mix(C, ramp_colour('white', sv - .04), white)
    C = mix(C, rgb('kimonodark'), .30 * smooth(.45, .38, z))           # a soft shade under the sleeves / into the sash
    return C.reshape(sh + (3,))
def paint_bell(U, V):
    sh = U.shape; U = U.ravel(); V = V.ravel()
    qx = (U - .5) * 2 * 1.12; qz = (V - .5) * 2 * 1.12; r2 = qx * qx + qz * qz
    n = unit(np.stack([qx, -np.sqrt(np.clip(1 - r2, 0, 1)) - .05, qz], -1))
    C = ramp_colour('bell', sval(n, hi=.34, lo=.24) + .02)
    zr = BELL_RIDGE_Z / BELL_R
    C = mix(C, ramp_colour('bell', .92), .55 * np.exp(-((qz - zr - .06) / .045) ** 2))           # the ridge's lit top
    C = mix(C, rgb('belldark'), .45 * np.exp(-((qz - zr + .075) / .040) ** 2))                 # its shade underneath
    hole = np.sqrt((qx / .185) ** 2 + ((qz + .36) / .185) ** 2)
    slit = np.where(qz < -.36, np.abs(qx) / .060, 9.)
    keyhole = np.maximum(1 - smooth(.90, 1.10, hole), (1 - smooth(.85, 1.15, slit)) * (r2 < .97))
    C = mix(C, rgb('#3A2418'), .95 * keyhole)
    hl = np.sqrt(((qx + .36) / .16) ** 2 + ((qz - .42) / .12) ** 2)
    C = mix(C, rgb('#FFF2C0'), .70 * (1 - smooth(.6, 1.0, hl)))
    return C.reshape(sh + (3,))
def paint_ramp(U, V):
    rows = np.clip((V * CHARTS['ramp'][3] / 32).astype(int), 0, 15); C = np.zeros(U.shape + (3,))
    for name, k in RAMP_ROWS.items():
        m = rows == k
        if not m.any(): continue
        C[m] = ramp_colour(name, U[m])
    return C
def paint_furmix(U, V): return mix(ramp_colour('fur', U), ramp_colour('white', U), V)          # v: 0 orange fur .. 1 white fur
def paint_kimmix(U, V): return mix(ramp_colour('kimono', U), mix(ramp_colour('kimono', U + .20), rgb('#8A7CE8'), .35), V)
def paint_skmix(U, V): return mix(ramp_colour('skirt', U), mix(ramp_colour('skirt', U + .16), rgb('#54487E'), .30), V)
PAINTERS = {'head': paint_head_aa, 'eye.L': lambda U, V: paint_eye(U, V, 1), 'eye.R': lambda U, V: paint_eye(U, V, -1),
            'ramp': paint_ramp, 'furmix': paint_furmix, 'kimmix': paint_kimmix, 'skmix': paint_skmix, 'ear': paint_ear}
if not HEAD_ONLY: PAINTERS.update({'tail': paint_tail, 'torso': paint_torso, 'bellc': paint_bell})
if RIG:
    PAINTERS['cavity'] = lambda U, V: mix(rgb('#4a1c2c'), rgb('#341220'), .55 * smooth(.25, 1., V))
    PAINTERS['tongue'] = lambda U, V: mix(rgb('#e07a8e'), rgb('#ee9aac'), .45 * smooth(.15, .9, V))
atlas = np.empty((2048, 2048, 4), np.uint8); atlas[:] = [255, 154, 74, 255]
MIX_CHARTS = ('furmix', 'kimmix', 'skmix')
FAST_PAINT = os.environ.get('FASTPAINT') == '1'
for name, (x0, y0, w, h) in CHARTS.items():
    if name not in PAINTERS: continue
    print('PAINT', name, flush=True)
    if name == 'ramp':
        U, V = np.meshgrid(clamp((np.arange(w) - 8) / (w - 16)), (np.arange(h) + .5) / h)
    elif name in MIX_CHARTS:
        U, V = np.meshgrid(clamp((np.arange(w) - 8) / (w - 16)), clamp((np.arange(h) - 8) / (h - 16)))
    else:
        U, V = np.meshgrid(clamp((np.arange(w) - 6) / (w - 12)), clamp((np.arange(h) - 6) / (h - 12)))
    block = np.empty((h, w, 3))
    if FAST_PAINT and name in ('head',):      # FASTPAINT=1: geometry iterations only (a quarter-resolution head chart)
        Us, Vs = U[::4, ::4], V[::4, ::4]; bs_ = np.empty(Us.shape + (3,))
        for r0 in range(0, Us.shape[0], 64): bs_[r0:r0 + 64] = PAINTERS[name](Us[r0:r0 + 64], Vs[r0:r0 + 64])
        block[:] = np.repeat(np.repeat(bs_, 4, 0), 4, 1)[:h, :w]
    else:
        for r0 in range(0, h, 64):
            block[r0:r0 + 64] = PAINTERS[name](U[r0:r0 + 64], V[r0:r0 + 64])
    atlas[y0:y0 + h, x0:x0 + w, :3] = np.round(clamp(block) * 255).astype(np.uint8)
def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
def write_png(path, arr):
    h_, w_ = arr.shape[:2]; raw = b''.join(b'\x00' + r.tobytes() for r in arr[::-1])
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w_, h_, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))
atlas_path = os.path.join(ROOT, 'scratch', 'head_atlas.png') if HEAD_ONLY else (os.path.join(ROOT, 'scratch', 'rig_base_atlas.png') if RIG else os.path.join(ROOT, 'kitsune-toy_atlas.png'))
write_png(atlas_path, atlas)
del atlas
img = bpy.data.images.load(atlas_path); img.name = 'Kitsune_toy_painted_atlas_2048'; img.pack()
MAT = bpy.data.materials.new('Kitsune_toy_atlas'); MAT.use_nodes = True
bs = next(n_ for n_ in MAT.node_tree.nodes if n_.type == 'BSDF_PRINCIPLED'); bs.inputs['Roughness'].default_value = .8
bs.inputs['Metallic'].default_value = 0; bs.inputs['Specular IOR Level'].default_value = .25
tx = MAT.node_tree.nodes.new('ShaderNodeTexImage'); tx.image = img; tx.interpolation = 'Linear'
MAT.node_tree.links.new(tx.outputs['Color'], bs.inputs['Base Color'])
