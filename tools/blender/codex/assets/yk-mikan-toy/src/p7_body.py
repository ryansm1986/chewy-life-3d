BODY_PIVOTS = {}; BODY_MEAS = {}; POST_JOIN = None; TAIL = {}

# ---- the shirt's shape (metres; body axis x = 0, y = 0; sheet front 2.785 mm / px). Shared with the painter (p8).
# Sheet: an A-line top flaring to a peplum hem. Front half-widths z 0.43: 0.21, 0.384: 0.23, 0.34: 0.25, 0.30: 0.256, the hem at
# z 0.284 (front / sides) rising to ~0.30 at the back; side: the front -0.118 at z 0.45 sloping to -0.188 at the hem, the back
# 0.23 at z 0.45 flaring to 0.283 at z 0.35 over the tail root. The neck (z 0.59) hides under the scarf ring. The two front panels
# meet on a seam down the middle; their rounded lower corners leave a small notch at the hem (up to z 0.318 at the centre).
SZ = np.array([.290, .320, .360, .400, .440, .480, .515, .545, .575, .605])
SAX = np.array([.258, .254, .240, .224, .212, .207, .207, .203, .178, .128])
SAF = np.array([.190, .186, .171, .150, .128, .113, .105, .098, .084, .066])
SAB = np.array([.262, .276, .270, .250, .228, .208, .190, .166, .118, .074])
sax_f = natspline(SZ, SAX); saf_f = natspline(SZ, SAF); sab_f = natspline(SZ, SAB); SP_ = 2.3
S_TOP = .605
def shirt_hem(a):
    a = np.asarray(a, float); c = np.cos(a)
    x_ = SAX[0] * spow(np.sin(a), 2 / SP_)
    notch = .034 * np.exp(-(x_ / .036) ** 2) * smooth(.3, .8, c)          # the panels' rounded corners at the front centre
    return .284 + .016 * (1 - c) / 2 + notch
def shirt_raw(a, t):
    """the shirt's outer surface: a = angle (0 = front, pi / 2 = her left), t = 0 at the neck .. 1 at the hem"""
    a = np.asarray(a, float); t = np.asarray(t, float); z = S_TOP + (shirt_hem(a) - S_TOP) * t
    c = np.cos(a); w = (1 + c) / 2; dep = saf_f(z) * w + sab_f(z) * (1 - w)
    return np.stack([sax_f(z) * spow(np.sin(a), 2 / SP_), -dep * spow(c, 2 / SP_), z], -1)
def shirt_n(a, t, e=1e-4):
    P0 = shirt_raw(a, t); Pa = shirt_raw(np.asarray(a) + e, t) - shirt_raw(np.asarray(a) - e, t)
    Pt = shirt_raw(a, np.minimum(np.asarray(t) + e, 1.)) - shirt_raw(a, np.maximum(np.asarray(t) - e, 0.))
    n = unit(np.cross(Pa, Pt)); ctr = np.stack([0 * P0[..., 0], .04 + 0 * P0[..., 0], P0[..., 2]], -1)
    return np.where(((n * (P0 - ctr)).sum(-1) < 0)[..., None], -n, n)
SEAM_X = -.004
def seam_x(z): return SEAM_X - .006 * smooth(.42, .47, z)            # (it eases toward her right under the bow)
if not HEAD_ONLY:
    print('BODY_STEP shirt', flush=True)
    NA_S, NT_S = 48, 13
    a_k = np.linspace(-PI, PI, NA_S, endpoint=False); t_k = np.linspace(0, 1, NT_S) ** .9
    AK, TK = np.meshgrid(a_k, t_k); Gs = shirt_raw(AK, TK); Ns = shirt_n(AK, TK)
    Vs = Gs.reshape(-1, 3); NNs = Ns.reshape(-1, 3); Fs = grid_faces(NT_S, NA_S, wrap=True)
    xk = Gs[..., 0]; zk = Gs[..., 2]; fr = np.cos(AK) > 0
    seam_sh = np.exp(-((xk - seam_x(zk) + .013) / .010) ** 2) * fr * smooth(.30, .33, zk) * smooth(.47, .45, zk)     # the shade beside the seam
    occ = .18 * seam_sh + .22 * smooth(.565, .600, zk) + .08 * (1 - smooth(.0, .25, TK))
    UVo = mix_uv('shirtmix', sval(NNs, hi=.26, lo=.20, occ=occ.reshape(-1)), (.04 + .06 * smooth(.3, 1., TK)).reshape(-1))
    UVi = ramp_uv('lining', sval(-NNs, hi=.10, lo=.10) - .08)
    plain = np.zeros(len(Vs), bool); plain[:NA_S] = True
    Vt, Ft, UVt, Nt = thicken(Vs, Fs, NNs, .014, UVo, UVi, UVo, rim=3, plain=plain, split_front=True)
    make_obj('shirt', Vt, Ft, UVt, 'shirt', N=Nt)
    # the seam where the two front panels meet: a soft raised lip from under the bow down to the notch
    zs_w = np.linspace(.455, .322, 12)
    def a_of_x(x, z):
        s_ = np.clip(np.asarray(x, float) / sax_f(z), -.999, .999); return np.arcsin(spow(s_, SP_ / 2))
    def t_of_z(a, z): return (S_TOP - z) / (S_TOP - shirt_hem(a))
    aw = np.array([a_of_x(seam_x(z_), z_) for z_ in zs_w]); tw = t_of_z(aw, zs_w)
    path = shirt_raw(aw, tw) + shirt_n(aw, tw) * .0062
    sweep('shirt_seam', path, lambda k: (.0055, .0110), 'shirt', ramp_sw('shirt', hi=.24, add=.07), sides=8, normals=shirt_n(aw, tw), p=.70)

    print('BODY_STEP trousers', flush=True)
    # ---------------------------------------------------------------- the plum bloomers: two baggy barrel legs under the shirt (sheet front:
    # +-0.245 at z 0.22, the legs parting from z 0.14, the gathered cuffs at z 0.106-0.117, each leg x 0.02 .. 0.20; side -0.146 .. 0.191 at
    # z 0.25, -0.08 .. 0.135 at the cuff)
    TR_Z0, TR_Z1, TRY = .305, .112, .022
    def tr_dims(z):
        z = np.asarray(z, float); bul = smooth(.305, .225, z) * smooth(.110, .195, z)
        xo = .220 + .027 * bul - .034 * smooth(.160, .112, z)
        xi = .004 + .020 * smooth(.160, .116, z) ** 1.2
        hy = .148 + .022 * bul - .052 * smooth(.170, .112, z)
        return xo, xi, hy
    N_TP = 3
    for s, tag in ((-1, 'R'), (1, 'L')):
        NZH, NAH = 9, 24
        zh = TR_Z0 + (TR_Z1 - TR_Z0) * np.linspace(0, 1, NZH)
        ah = np.linspace(0, 2 * PI, NAH, endpoint=False)
        rings = []
        for z_ in zh:
            xo, xi, hy = tr_dims(z_); xc = (xo + xi) / 2; hx = (xo - xi) / 2
            X = xc + hx * spow(np.sin(ah), 2 / 2.5); Y = TRY - hy * spow(np.cos(ah), 2 / 2.5)
            pl = .0024 * smooth(.16, .11, z_) * np.sin(ah * 2 * N_TP + .6) * smooth(.2, .6, np.abs(np.cos(ah)))   # soft gathers at the cuff
            rings.append(np.stack([s * X, Y + np.sign(np.cos(ah)) * -pl, np.full(NAH, z_)], -1))
        Gh = np.array(rings)
        dS = np.roll(Gh, -1, 1) - np.roll(Gh, 1, 1); dK = np.gradient(Gh, axis=0)
        NGh = unit(np.cross(dK, dS)); ctr = Gh.mean(1, keepdims=True)
        NGh = np.where(((NGh * (Gh - ctr)).sum(-1) < 0)[..., None], -NGh, NGh)
        Vh = Gh.reshape(-1, 3); NNh = NGh.reshape(-1, 3)
        crs_ = np.tile(np.exp(-((np.sin(ah) + 1) / .30) ** 2), NZH)
        tz = np.repeat(np.linspace(0, 1, NZH), NAH)
        UVo = mix_uv('skmix', sval(NNh, hi=.22, lo=.20, occ=.22 * crs_ + .14 * (1 - smooth(.0, .30, tz))).reshape(-1), .10 + .10 * smooth(.3, 1., tz))
        UVi = ramp_uv('trlining', sval(-NNh, hi=.10, lo=.10) - .10)
        plain = np.zeros(len(Vh), bool); plain[:NAH] = True
        Vt, Ft, UVt, Nt = thicken(Vh, grid_faces(NZH, NAH, wrap=True), NNh, .016, UVo, UVi, UVo, rim=4, plain=plain, split_front=True)
        make_obj('trousers.' + tag, Vt, Ft, UVt, 'trousers', N=Nt)

    print('BODY_STEP sleeves and arms', flush=True)
    # ---------------------------------------------------------------- puffed short sleeves (sheet front: the shoulder from under the scarf at
    # (0.20, 0.585) out to the puff's widest (0.29, 0.52); the opening round the arm at z ~0.45-0.49, square to the arm, which hangs 36 deg
    # out from vertical; side: the cap ~0.20 m deep). A loft of rings from inside the shirt to the opening, puffed, gathered at the cuff.
    ARM = {}; ARM_DEG = 36.; ARMY = .045
    for s, tag in ((1, 'L'), (-1, 'R')):
        th = math.radians(ARM_DEG); ad = unit(np.array([s * math.sin(th), .02, -math.cos(th)]))
        u_open = unit(np.array([s * math.cos(th), 0, math.sin(th)]))
        OC = np.array([s * .258, ARMY, .468]); OHU, OHY = .066, .078
        RC = np.array([s * .120, ARMY, .520]); RHU, RHY = .080, .098
        NR = 12; ts = np.linspace(0, 1, NR); NS = 18; sa = np.linspace(0, 2 * PI, NS, endpoint=False)
        rings = []
        for t in ts:
            n0 = np.array([s * 1., 0, 0]); n = unit(n0 * (1 - smooth(.15, 1., t)) + ad * smooth(.15, 1., t))
            uu = unit(np.cross(n, [0, 1., 0]) * s); uu = uu if uu[2] > 0 else -uu
            vv = np.array([0, 1., 0])
            c = RC + (OC - RC) * t + np.array([0, 0, .040]) * math.sin(PI * t) * (1 - t) + u_open * .012 * math.sin(PI * t)
            hu = RHU + (OHU - RHU) * t + .022 * math.sin(PI * t) ** 1.2; hy = RHY + (OHY - RHY) * t + .016 * math.sin(PI * t) ** 1.2
            g = .22 * smooth(.82, 1., t)
            ring = c + np.outer(hu * (1 - g) * spow(np.sin(sa), 2 / 2.3), uu) + np.outer(hy * (1 - g * .6) * spow(np.cos(sa), 2 / 2.3), vv)
            rings.append(ring)
        Gq = np.array(rings)
        dS = np.roll(Gq, -1, 1) - np.roll(Gq, 1, 1); dK = np.gradient(Gq, axis=0)
        NGq = unit(np.cross(dK, dS)); ctr = Gq.mean(1, keepdims=True)
        NGq = np.where(((NGq * (Gq - ctr)).sum(-1) < 0)[..., None], -NGq, NGq)
        V = Gq.reshape(-1, 3); NN = NGq.reshape(-1, 3); nr_, ns_ = Gq.shape[:2]
        tone = np.repeat(np.linspace(.04, .12, nr_), ns_)
        UVo = mix_uv('shirtmix', sval(NN, hi=.26, lo=.20, occ=.10 * np.repeat(smooth(.85, 1., ts), ns_)), tone)
        UVi = ramp_uv('lining', sval(-NN, hi=.10, lo=.10) - .06)
        plain = np.zeros(len(V), bool); plain[:ns_] = True
        Vt, Ft, UVt, Nt = thicken(V, grid_faces(nr_, ns_, wrap=True), NN, .013, UVo, UVi, UVo, rim=3, plain=plain, split_front=True)
        make_obj('sleeve.' + tag, Vt, Ft, UVt, 'sleeve.' + tag, N=Nt)
        SH = np.array([s * .150, ARMY, .500])
        def along(t0, OC=OC, ad=ad): return OC + ad * t0
        EL = along(.010); WR = along(.095); PC = along(.150)
        fwd = unit(np.array([0, -1., 0]) - ad * (ad @ np.array([0, -1., 0])))
        def arm_sdf(p, OC=OC, WR=WR, ad=ad): return sd_capsule(p, OC - ad * .080, WR, (.054, .050))
        tsa = np.linspace(-.070, .070, 7)
        ring_stack('fur_arm.' + tag, arm_sdf, OC[None] + ad[None] * tsa[:, None], np.tile(ad, (len(tsa), 1)), 'arm.' + tag,
                   lambda NN, V: fur_uv(sval(NN, hi=.20, lo=.20), .0), sides=16, tmax=.12, ref=fwd, pole_start=False, pole_end=False)
        lat = unit(np.cross(ad, fwd)) * s
        paw_axes = np.array([ad, fwd, lat])
        thumb = PC + fwd * .046 - lat * .008 - ad * .014
        def paw_parts(p, WR=WR, PC=PC, paw_axes=paw_axes, thumb=thumb, ad=ad):
            d_w = sd_capsule(p, WR - ad * .026, PC - ad * .010, (.050, .055))
            d_paw = sd_ell(p, PC, paw_axes, (.070, .066, .060))
            d_t = sd_ell(p, thumb, paw_axes, (.029, .024, .024))
            return d_w, d_paw, d_t
        def paw_sdf(p, paw_parts=paw_parts):
            d_w, d_paw, d_t = paw_parts(p)
            return smin(smin(d_w, d_paw, .016), d_t, .008)
        def paw_uv(NN, V, paw_parts=paw_parts):
            d_w, d_paw, d_t = paw_parts(V)
            cr = crease(smin(d_w, d_paw, .016), d_t, .008) * .40
            return fur_uv(sval(NN, occ=1.0 * cr, hi=.22, lo=.18), .0)
        tt_ = np.linspace(0, .12, 241); inside = paw_sdf(PC[None] + ad[None] * tt_[:, None]) < 0
        reach = float(tt_[np.argmin(inside)]) if not inside.all() else .12
        tips = PC + ad * (reach - .005)
        tsp = np.concatenate([np.linspace(0, .45, 5)[:-1], np.linspace(.45, 1.0, 12)])
        cen = (WR - ad * .025)[None] + (tips - (WR - ad * .025))[None] * tsp[:, None]
        ring_stack('mitten_paw.' + tag, paw_sdf, cen, np.tile(ad, (len(tsp), 1)), 'arm.' + tag, paw_uv, sides=18, tmax=.10, ref=fwd)
        ARM[tag] = {'shoulder': SH.tolist(), 'elbow': EL.tolist(), 'wrist': WR.tolist(), 'palm': (PC - lat * .006).tolist(),
                    'grip_axis': fwd.tolist(), 'arm_dir': ad.tolist(), 'paw_centre': PC.tolist()}

    print('BODY_STEP legs feet', flush=True)
    # ---------------------------------------------------------------- short legs (hidden by the bloomers) and big round feet (sheet front:
    # x 0.033 .. 0.228 each (centres +-0.13, 0.195 wide), 0.106 m tall; side: 0.28 m long, centred under the axis), two toe creases each
    LEG = {}
    for s, tag in ((1, 'L'), (-1, 'R')):
        HP = np.array([s * .100, TRY, .270]); AN = np.array([s * .128, .000, .085])
        def leg_sdf(p, HP=HP, AN=AN): return sd_capsule(p, HP, AN, (.058, .050))
        zs = np.linspace(.205, .080, 5)
        cen = np.array([HP + (AN - HP) * ((z_ - HP[2]) / (AN[2] - HP[2])) for z_ in zs])
        ring_stack('fur_leg.' + tag, leg_sdf, cen, np.tile(unit(AN - HP), (len(zs), 1)), 'body',
                   lambda NN, V: fur_uv(sval(NN, hi=.20, lo=.20, occ=.12 * smooth(.12, .20, V[:, 2])), .0), sides=14, tmax=.14, ref=[0, -1., 0],
                   pole_start=False)
        FC = np.array([s * .130, -.006, .048]); FAX = rot([0, 0, 1], s * math.radians(4)).T
        toes = [FC + (np.array([o * .053, -.098, .002]) @ FAX) for o in (-1, 0, 1)]
        def foot_parts(p, FC=FC, FAX=FAX, toes=toes, AN=AN):
            d_main = sd_ell(p, FC + np.array([0, .014, 0]), FAX, (.097, .124, .057))
            d_ank = sd_capsule(p, AN + np.array([0, 0, .016]), AN + np.array([0, -.008, -.022]), .052)
            d_t = [sd_ell(p, t, FAX, (.039, .038, .040)) for t in toes]
            return d_main, d_ank, d_t
        def foot_sdf(p, foot_parts=foot_parts):
            d_main, d_ank, d_t = foot_parts(p)
            d = smin(d_main, d_ank, .018); tt = smin(smin(d_t[0], d_t[1], .005), d_t[2], .005)
            d = smin(d, tt, .013)
            return smax(d, -(p[:, 2] - .002), .007)
        def foot_uv(NN, V, foot_parts=foot_parts):
            d_main, d_ank, d_t = foot_parts(V)
            cr = crease(d_t[0], d_t[1], .005) * .45 + crease(d_t[1], d_t[2], .005) * .45
            return fur_uv(sval(NN, occ=1.1 * cr + .10 * smooth(.012, .0, V[:, 2]), hi=.20, lo=.18), .0)
        star_mesh('fur_foot.' + tag, foot_sdf, FC + np.array([0, -.006, .014]), 'body', foot_uv, nth=12, nph=22, tmax=.20)
        LEG[tag] = {'hip': HP.tolist(), 'knee': (HP + (AN - HP) * .55).tolist(), 'ankle': AN.tolist(), 'toe': (FC + np.array([0, -.120, -.010]) @ FAX).tolist()}

    print('BODY_STEP scarf', flush=True)
    # ---------------------------------------------------------------- the cream scarf: a thick soft ring round the neck on the shoulders
    # (sheet front: +-0.20 at z 0.60, its band z 0.55 .. 0.62; back: a smooth band +-0.195; side: -0.17 .. 0.205), a round knot under the
    # chin (0.09 m wide, z ~0.55) and two fat egg-shaped bow loops drooping down and out from under it (each ~0.085 m wide, their
    # bottoms at z 0.44, centres x +-0.045)
    KC_ZF, KC_ZB = .584, .592
    NKP = 40; phk = np.linspace(0, 2 * PI, NKP, endpoint=False)
    KAX, KAY, KCY = .163, .151, .022
    kpath = np.stack([KAX * np.sin(phk), KCY - KAY * np.cos(phk), KC_ZF + (KC_ZB - KC_ZF) * (1 - np.cos(phk)) / 2], -1)
    knrm = unit(np.stack([np.sin(phk) / KAX, -np.cos(phk) / KAY, np.zeros(NKP)], -1))
    sak = np.linspace(0, 2 * PI, 12, endpoint=False)
    def kprof(k):
        # (ring_tube's B axis points down here: db > 0 is below the ring's centre line); a plump round tube, a touch flatter on top
        sn = np.sin(sak); cs = np.cos(sak)
        dn = .036 * spow(cs, .85); db = np.where(sn < 0, .036 * spow(sn, .85), .041 * spow(sn, .80))
        return np.stack([dn, db], -1)
    ring_tube('scarf_ring', kpath, kprof, 'scarf', lambda NN, tt, uu, V: ramp_uv('scarf', sval(NN, hi=.22, lo=.22)), knrm, sides=12)
    KN_C = np.array([0, KCY - KAY - .034, KC_ZF - .036])
    lobe('scarf_knot', KN_C, np.array([.032, .036, .042]), [0, -1., -.15], 'scarf', ramp='scarf', n=4, squash=.05)
    BOW = {}
    for s, tag in ((-1, 'R'), (1, 'L')):
        # a bow loop (round 2): a flatter rounded teardrop (about 3 cm thick), its narrow end tucked under the knot, angled down and out,
        # lying on the shirt front
        out = unit(np.array([s * .62, -.18, -1.]))
        LC = KN_C + np.array([s * .052, .026, -.050])
        lobe('scarf_loop.' + tag, LC, np.array([.058, .044, .0155]), out, 'scarf', ramp='scarf', n=5, squash=.42, occ_in=.25,
             pole=[0, 1., -.25])
        BOW[tag] = [round(float(c), 3) for c in LC]
    LOG['scarf'] = {'ring_front_z_m': KC_ZF, 'ring_back_z_m': KC_ZB, 'knot_m': [round(float(c), 3) for c in KN_C], 'loops_m': BOW}

    print('BODY_STEP tail', flush=True)
    # ---------------------------------------------------------------- the big fluffy tail: one smooth plume from the low back under the shirt's
    # hem sweeping down, back and out to her left, then rising with its cream tip up (sheet side: y 0.17 .. 0.49 behind the axis, z 0.14 ..
    # 0.48, the cream tip the upper back third; front: peeking out at x 0.24 .. 0.37, z 0.11 .. 0.31; back: a big oval with the cream tip
    # up on her left). A separate piece with bend rings, painted in its own chart.
    TAIL_CP = np.array([[.000, .150, .300], [.040, .215, .235], [.105, .275, .215], [.160, .320, .245], [.172, .348, .305],
                        [.148, .362, .362], [.105, .362, .405], [.066, .352, .432]])
    TAIL_RT = np.array([0, .06, .16, .28, .42, .56, .70, .82, .92, 1.0]); TAIL_RR = np.array([.044, .068, .094, .110, .118, .122, .120, .110, .088, .046])
    def build_tail():
        path = cpath(TAIL_CP, 200); seg = np.linalg.norm(np.diff(path, axis=0), axis=1); s_ = np.concatenate([[0], np.cumsum(seg)]); s_ /= s_[-1]
        NRT, NST = 28, 20
        tk = np.linspace(0, 1, NRT) ** .95
        P = np.stack([np.interp(tk, s_, path[:, i]) for i in range(3)], -1); R = np.interp(tk, TAIL_RT, TAIL_RR)
        T = unit(np.gradient(P, axis=0))
        X = np.zeros_like(P); x0 = np.cross(T[0], [0, 0, 1.]); X[0] = unit(x0)
        for k in range(1, NRT):
            v = X[k - 1] - T[k] * (X[k - 1] @ T[k]); X[k] = unit(v)
        B = unit(np.cross(T, X))
        if (B[NRT // 2] @ np.array([.3, .6, -.4])) < 0: X = -X; B = -B
        ph = np.linspace(0, 2 * PI, NST + 1)
        rings = []; norms = []
        for k in range(NRT):
            rx, rb = R[k] * 1.04, R[k] * .96
            pts = P[k] + X[k] * (rx * np.sin(ph))[:, None] - B[k] * (rb * np.cos(ph))[:, None]
            nn = unit(X[k] * (np.sin(ph) / rx)[:, None] - B[k] * (np.cos(ph) / rb)[:, None])
            rings.append(pts); norms.append(nn)
        G = np.array(rings); NG = np.array(norms)
        dK = np.gradient(G, axis=0); dS = np.gradient(G, axis=1); NT = unit(np.cross(dS, dK))
        NT = np.where(((NT * NG).sum(-1) < 0)[..., None], -NT, NT); NT[0] = NG[0]
        V = list(G.reshape(-1, 3)); NN = list(NT.reshape(-1, 3))
        UU, VV = np.meshgrid(ph / (2 * PI), tk); UVl = list(np.stack([UU.reshape(-1), VV.reshape(-1)], -1))
        F = grid_faces(NRT, NST + 1, wrap=False)
        tip = P[-1] + T[-1] * R[-1] * 1.4; it = len(V); V.append(tip); NN.append(T[-1]); UVl.append(np.array([.5, 1.]))
        last = (NRT - 1) * (NST + 1)
        for i in range(NST): F.append((last + i, last + i + 1, it))
        root = P[0] - T[0] * .01; ir = len(V); V.append(root); NN.append(-T[0]); UVl.append(np.array([.5, 0.]))
        for i in range(NST): F.append((i + 1, i, ir))
        V = np.array(V); NN = np.array(NN); UVl = np.array(UVl)
        UV = au('tail', UVl[:, 0], UVl[:, 1])
        make_obj('tail', V, F, UV, 'tail', N=NN)
        TAIL.update({'P': P, 'R': R, 'T': T, 'B': B, 'X': X, 'tk': tk, 'rings': NRT, 'sides': NST})
        return P
    TP_ = build_tail()
    TAIL_ROOT = TAIL_CP[0]

    def _vs(prefixes):
        out = []
        for g, obs in parts.items():
            for o in obs:
                if any(o.name.startswith(p) for p in prefixes): out += [list(o.matrix_world @ v.co) for v in o.data.vertices]
        return np.array(out)
    def _ext(v): return {'min': [round(float(c), 3) for c in v.min(0)], 'max': [round(float(c), 3) for c in v.max(0)], 'size': [round(float(c), 3) for c in np.ptp(v, 0)]}
    BODY_MEAS = {'body_parts_m': {k: _ext(_vs(v)) for k, v in {
        'shirt': ['shirt'], 'trousers': ['trousers'], 'sleeve_L': ['sleeve.L'], 'paw_L': ['mitten_paw.L'], 'paw_R': ['mitten_paw.R'],
        'legs': ['fur_leg'], 'foot_L': ['fur_foot.L'], 'tail': ['tail'], 'scarf': ['scarf'], 'beret': ['beret'], 'lash_L': ['lash.L']}.items() if len(_vs(v))}}
    BODY_MEAS['arm_angle_from_vertical_deg'] = ARM_DEG
    BODY_PIVOTS = {'arm.L': tuple(ARM['L']['shoulder']), 'arm.R': tuple(ARM['R']['shoulder']), 'sleeve.L': tuple(ARM['L']['shoulder']),
                   'sleeve.R': tuple(ARM['R']['shoulder']), 'body': (0, 0, 0), 'shirt': (0, .04, .45), 'trousers': (0, TRY, TR_Z0),
                   'tail': tuple(TAIL_ROOT), 'scarf': (0, KCY, KC_ZF)}
    def POST_JOIN():
        joints = {'units': 'metres', 'coordinate_system': 'Blender Z-up, front -Y; character left is +X'}
        joints.update({'hips': [0, .030, .285], 'spine': [0, .035, .380], 'chest': [0, .035, .470], 'neck': [0, .025, .575]})
        joints['head'] = [float(v) for v in O]
        joints['head_base'] = [0, float(HY + .02 * W), float(CHIN + .02 * W)]
        joints['jaw_pivot'] = [0, float(HY + NOSE_TIP_L * W + .20 * W), float(CHIN + .10 * W)]
        joints['eyes'] = {'R': eye_centers['R'], 'L': eye_centers['L']}
        joints['lashes'] = LASH_INFO
        joints['ears'] = {t: {k: [float(v) for v in ear_info[t][k]] for k in ('base', 'mid', 'tip')} for t in ('R', 'L')}
        joints['beret'] = BERET_INFO
        joints['arms'] = {t: {k: ARM[t][k] for k in ('shoulder', 'elbow', 'wrist')} for t in ARM}
        joints['legs'] = LEG
        joints['palm_R'] = ARM['R']['palm']; joints['palm_L'] = ARM['L']['palm']
        P = TAIL['P']; n_ = len(P); idx = [0, n_ // 4, n_ // 2, (3 * n_) // 4, n_ - 3, n_ - 1]
        joints['tail'] = [[round(float(c), 4) for c in P[i]] for i in idx]
        joints['tailRoot'] = [float(v) for v in TAIL_ROOT]
        joints['mouth'] = MOUTH_INFO
        joints['scarf'] = LOG['scarf']
        joints['notes'] = ['Phase 1: no rig, weights or animations. Same keys as the Toybox heroes / Kitsune / Kazemaru / Kaede joints.json.',
                           'head = the head-ball centre (the radial origin), not the nod pivot; head_base = a suggested nod pivot at the base of the skull.',
                           'Head skin = zero surface of one smooth implicit field (skull + cheek mass + muzzle + chin + nose), analytic normals; no eye sockets.',
                           'Mouth: a sculpted "w" smile groove and a short philtrum (closed) with 5 loops round it; the skin is cut along the parting (see mouth).',
                           'Eyelid holes ringed by 6 loops each, the rim rolled in behind separate lens eyeballs; 5 loops round the nose.',
                           'Lashes: Mikan_lash_L / _R, thick rolls on the skin over each opening with the wing (origin = the eye centre): weight 100% to lidU.',
                           'Ears: separate pieces (Mikan_ear_L / _R), 26 bend rows from the root (in the skull) to the tip; pivot = ears.base.',
                           'Beret: Mikan_beret (the puffy disc + its stalk), rigid on the head bone; pivot = beret.anchor. Set back on the crown, tilted back.',
                           'Scarf (Mikan_scarf): the ring, the knot and the two bow loops: weight to chest / neck.',
                           'Tail: a separate piece (Mikan_tail), 28 bend rings from the root (under the shirt hem) to the tip; pivot = tailRoot; chain = tail.',
                           'Sleeves (Mikan_sleeve_L/_R): separate shells with 12 rings; the shirt (Mikan_shirt) 16 rings with its peplum; the bloomer legs 9 rings each.']
        with open(os.path.join(ROOT, 'joints.json'), 'w', encoding='utf-8') as f: json.dump(joints, f, indent=2)
