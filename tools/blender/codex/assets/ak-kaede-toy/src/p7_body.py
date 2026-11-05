CHARTS['torso'] = (1536, 448, 512, 448)
BODY_PIVOTS = {}; BODY_MEAS = {}; POST_JOIN = None; TAIL = {}

if not HEAD_ONLY:
    # ============================================================== BODY AND KIMONO (metres; body axis x = 0, y = 0; sheet front 2.683 mm / px)
    RCY = .022
    def kim_uv(N, tone=0., occ=0., hi=.26, lo=.20): return mix_uv('kimmix', sval(N, hi=hi, lo=lo, occ=occ), tone)
    print('BODY_STEP kimono top', flush=True)
    # ---------------------------------------------------------------- the kimono top: from inside the obi up under the kerchief
    # (sheet front: 0.31 m across between the sleeves at the obi, 0.35 m at the chest; side: 0.26 m deep at the chest; the neck at z 0.58)
    TZ = np.array([.300, .340, .380, .420, .460, .500, .530, .560, .590])
    TAX = np.array([.172, .158, .156, .164, .172, .166, .150, .120, .086])
    TAY = np.array([.150, .138, .134, .132, .130, .126, .116, .098, .074])
    tax_f = natspline(TZ, TAX); tay_f = natspline(TZ, TAY); TP = 2.3
    def torso_raw(a, z):
        a = np.asarray(a, float); z = np.asarray(z, float)
        return np.stack([tax_f(z) * spow(np.sin(a), 2 / TP), RCY - tay_f(z) * spow(np.cos(a), 2 / TP), z + 0 * a], -1)
    def torso_n(a, z, e=1e-4):
        da = torso_raw(np.asarray(a) + e, z) - torso_raw(np.asarray(a) - e, z)
        dz = torso_raw(a, np.asarray(z) + e) - torso_raw(a, np.asarray(z) - e)
        n = unit(np.cross(dz, da)); c = torso_raw(a, z) - np.stack([0 * np.asarray(a), RCY + 0 * np.asarray(a), np.asarray(z) * 0 + .45], -1)
        return np.where(((n * c).sum(-1) < 0)[..., None], -n, n)
    def torso_pt(a, z, off=0.): return torso_raw(a, z) + torso_n(a, z) * np.asarray(off, float)[..., None]
    def torso_a_of_x(x, z):
        s_ = np.clip(np.asarray(x, float) / tax_f(z), -.999, .999); return np.arcsin(spow(s_, TP / 2))
    def torso_uv_of(a, z):
        x0, y0, w, h = CHARTS['torso']; u = (np.asarray(a) + PI) / (2 * PI)
        v = (np.asarray(z) - TZ[0]) / (TZ[-1] - TZ[0])
        return np.stack([(x0 + 6 + u * (w - 12)) / 2048, (y0 + 6 + v * (h - 12)) / 2048], -1)
    NA_T, NZ_T = 40, 10
    zt_ = np.linspace(TZ[0], TZ[-1], NZ_T); at_ = np.linspace(0, 2 * PI, NA_T + 1) + PI
    AA, ZZ = np.meshgrid(at_, zt_); Pt_ = torso_raw(AA, ZZ); Nt_ = torso_n(AA, ZZ)
    make_obj('kimono_top', Pt_.reshape(-1, 3), grid_faces(NZ_T, NA_T + 1, wrap=False), torso_uv_of(AA.reshape(-1) - 2 * PI, ZZ.reshape(-1)), 'body',
             N=Nt_.reshape(-1, 3))
    # the wrap's edge (sheet): her left panel lies over her right one; its edge runs from under the kerchief's right leaf (x +0.06, z 0.50)
    # down to her right hip under the obi (x -0.10, z 0.39): a soft raised lip, a shade under it painted on the torso
    WRAP_TOP = (.064, .515); WRAP_BOT = (-.108, .370)
    def wrap_x(z): return WRAP_BOT[0] + (WRAP_TOP[0] - WRAP_BOT[0]) * np.clip((np.asarray(z) - WRAP_BOT[1]) / (WRAP_TOP[1] - WRAP_BOT[1]), 0, None) ** 1.15
    zs_w = np.linspace(WRAP_TOP[1], WRAP_BOT[1], 14)
    path = np.array([torso_pt(np.array([torso_a_of_x(wrap_x(z_), z_)]), np.array([z_]), .004)[0] for z_ in zs_w])
    nrm = torso_n(np.array([torso_a_of_x(wrap_x(z_), z_) for z_ in zs_w]), zs_w)
    sweep('wrap_edge', path, lambda k: (.0055, .0120), 'body', ramp_sw('kim', hi=.24, add=.06), sides=8, normals=nrm, p=.70, cap0=True, cap1=True)

    print('BODY_STEP obi', flush=True)
    # ---------------------------------------------------------------- the gold obi (sheet front z 0.325 .. 0.394, back 0.357 .. 0.421: tilted,
    # higher at the back; 0.34 m wide), a soft box knot at the back (0.10 x 0.064 m, standing ~0.03 m proud)
    OBI_ZF, OBI_ZB, OBI_H = .360, .390, .070
    def obi_zc(a): return OBI_ZF + (OBI_ZB - OBI_ZF) * (1 - np.cos(a)) / 2
    NAS = 40; a_s = np.linspace(0, 2 * PI, NAS, endpoint=False)
    OBI_OFF = .016
    def waist(a, off):
        z = obi_zc(a)
        return np.stack([(tax_f(z) + off) * spow(np.sin(a), 2 / TP), RCY - (tay_f(z) + off) * spow(np.cos(a), 2 / TP), z], -1)
    Pb = waist(a_s, OBI_OFF)
    Nb = unit(np.stack([Pb[:, 0] / (tax_f(Pb[:, 2]) + OBI_OFF) ** 2, (Pb[:, 1] - RCY) / (tay_f(Pb[:, 2]) + OBI_OFF) ** 2, np.zeros(NAS)], -1))
    ab8 = np.linspace(0, 2 * PI, 14, endpoint=False)
    ring_tube('obi', Pb, lambda k: np.stack([.0150 * spow(np.cos(ab8), .45), OBI_H / 2 * spow(np.sin(ab8), .30)], -1), 'body',
              lambda NN, tt, uu, V: ramp_uv('obi', sval(NN, hi=.26, lo=.20)), Nb, sides=14)
    OBI_BACK_Y = float(Pb[NAS // 2][1] + .0150)
    OK_C = np.array([0, OBI_BACK_Y + .006, OBI_ZB + .004])
    def oknot_sdf(p): return sd_box(p, OK_C, np.eye(3), (.052, .022, .034), .016)
    star_mesh('obi_knot', oknot_sdf, OK_C, 'body', lambda NN, V: ramp_uv('obi', sval(NN, hi=.30, lo=.20) + .03), nth=12, nph=22, tmax=.10)
    LOG['obi'] = {'front_z_m': [OBI_ZF - OBI_H / 2, OBI_ZF + OBI_H / 2], 'back_z_m': [OBI_ZB - OBI_H / 2, OBI_ZB + OBI_H / 2],
                  'knot_centre_m': [round(float(c), 3) for c in OK_C]}

    print('BODY_STEP kimono skirt', flush=True)
    # ---------------------------------------------------------------- the kimono below the obi: a flared skirt to the hem (sheet: z 0.245 at the
    # sides, 0.235 at the front; 0.33 m wide under the obi, 0.43 m at the hem; side 0.34 m deep). Her left panel lies over her right: its
    # edge runs down from x -0.115 under the obi to x -0.150 at the hem (a soft step) and its hem hangs a little lower.
    GZ0, GZ1 = .345, .242; GT = (tax_f(.345) + .010, tay_f(.345) + .012); GH = (.214, .168, .172); GP = 2.4
    EDGE_X0, EDGE_X1 = -.112, -.150
    def gskirt_geom(a, t):
        t = np.asarray(t, float); g = np.clip(t, 0, 1) ** .9; ax_ = GT[0] + (GH[0] - GT[0]) * g
        ay_ = np.where(np.cos(a) > 0, GT[1] + (GH[1] - GT[1]) * g, GT[1] + (GH[2] - GT[1]) * g)
        x = ax_ * spow(np.sin(a), 2 / GP); front = np.cos(a) > 0
        ex = EDGE_X0 + (EDGE_X1 - EDGE_X0) * t
        over = front * smooth(ex - .004, ex + .010, x) * (1 - smooth(.35, .75, np.sin(a)))      # the top panel (her left, crossing over)
        hem = GZ0 + (GZ1 - GZ0) * t - .010 * front * smooth(.35, .9, np.cos(a)) * t ** 3 - .006 * over * t ** 3
        P = np.stack([x, RCY - ay_ * spow(np.cos(a), 2 / GP), hem + 0 * a], -1)
        n2 = unit(np.stack([P[..., 0] / ax_ ** 2, (P[..., 1] - RCY) / ay_ ** 2, 0 * P[..., 0]], -1))
        return P + n2 * (.005 * over * smooth(.0, .25, t))[..., None]
    def gskirt_n(a, t, e=1e-4):
        P0 = gskirt_geom(a, t); Pa = gskirt_geom(a + e, t) - gskirt_geom(a - e, t); Ptt = gskirt_geom(a, np.minimum(t + e, 1.)) - gskirt_geom(a, np.maximum(t - e, 0.))
        n = unit(np.cross(Pa, Ptt)); ctr = np.stack([0 * P0[..., 0], RCY + 0 * P0[..., 0], P0[..., 2]], -1)
        return np.where(((n * (P0 - ctr)).sum(-1) < 0)[..., None], -n, n)
    NA_G, NZ_G = 48, 6
    a_k = np.linspace(0, 2 * PI, NA_G, endpoint=False); t_k = np.linspace(0, 1, NZ_G)
    AK, TK = np.meshgrid(a_k, t_k); Gs = gskirt_geom(AK, TK); Ns = gskirt_n(AK, TK)
    Vs = Gs.reshape(-1, 3); NNs = Ns.reshape(-1, 3); Fs = grid_faces(NZ_G, NA_G, wrap=True)
    xk = Gs[..., 0]; exk = EDGE_X0 + (EDGE_X1 - EDGE_X0) * TK
    edge_sh = np.exp(-((xk - exk + .012) / .010) ** 2) * (np.cos(AK) > 0)            # the shade just past the panel edge
    UVo = kim_uv(NNs, (.04 + .06 * smooth(.0, 1., TK)).reshape(-1), occ=.20 * edge_sh.reshape(-1) + .10 * (1 - smooth(.0, .35, TK)).reshape(-1))
    UVi = ramp_uv('lining', sval(-NNs, hi=.10, lo=.10) - .10)
    plain = np.zeros(len(Vs), bool); plain[:NA_G] = True
    Vt, Ft, UVt, Nt = thicken(Vs, Fs, NNs, .013, UVo, UVi, UVo, rim=3, plain=plain, split_front=True)
    make_obj('kimono_skirt', Vt, Ft, UVt, 'kimono_skirt', N=Nt)

    print('BODY_STEP trousers', flush=True)
    # ---------------------------------------------------------------- the trousers: two baggy barrel legs under the kimono (sheet front: 0.43 m
    # across, the legs parting from z 0.105, their gathered hems at z 0.075 narrowing to +-(0.01 .. 0.18); side 0.325 m deep, 0.24 at the hem)
    TR_Z0, TR_Z1 = .262, .072
    def tr_dims(z):
        z = np.asarray(z, float); bul = smooth(.262, .195, z) * smooth(.060, .150, z)
        xo = .172 + .044 * bul - .016 * smooth(.115, .072, z)
        xi = .004 + .010 * smooth(.118, .080, z) ** 1.2
        hy = .126 + .034 * bul - .036 * smooth(.125, .072, z)
        return xo, xi, hy
    N_TP = 3
    for s, tag in ((-1, 'R'), (1, 'L')):
        NZH, NAH = 8, 24
        zh = TR_Z0 + (TR_Z1 - TR_Z0) * np.linspace(0, 1, NZH)
        ah = np.linspace(0, 2 * PI, NAH, endpoint=False)
        rings = []
        for z_ in zh:
            xo, xi, hy = tr_dims(z_); xc = (xo + xi) / 2; hx = (xo - xi) / 2
            X = xc + hx * spow(np.sin(ah), 2 / 2.5); Y = RCY - .006 - hy * spow(np.cos(ah), 2 / 2.5)
            pl = .0022 * smooth(.16, .09, z_) * np.sin(ah * 2 * N_TP + .6) * smooth(.2, .6, np.abs(np.cos(ah)))   # soft gathers at the cuff
            rings.append(np.stack([s * X, Y + np.sign(np.cos(ah)) * -pl, np.full(NAH, z_)], -1))
        Gh = np.array(rings)
        dS = np.roll(Gh, -1, 1) - np.roll(Gh, 1, 1); dK = np.gradient(Gh, axis=0)
        NGh = unit(np.cross(dK, dS)); ctr = Gh.mean(1, keepdims=True)
        NGh = np.where(((NGh * (Gh - ctr)).sum(-1) < 0)[..., None], -NGh, NGh)
        Vh = Gh.reshape(-1, 3); NNh = NGh.reshape(-1, 3)
        crs_ = np.tile(np.exp(-((np.sin(ah) + 1) / .30) ** 2), NZH)
        tz = np.repeat(np.linspace(0, 1, NZH), NAH)
        UVo = mix_uv('skmix', sval(NNh, hi=.22, lo=.20, occ=.22 * crs_ + .12 * (1 - smooth(.0, .30, tz))).reshape(-1), .10 + .10 * smooth(.3, 1., tz))
        UVi = ramp_uv('trlining', sval(-NNh, hi=.10, lo=.10) - .10)
        plain = np.zeros(len(Vh), bool); plain[:NAH] = True
        Vt, Ft, UVt, Nt = thicken(Vh, grid_faces(NZH, NAH, wrap=True), NNh, .016, UVo, UVi, UVo, rim=4, plain=plain, split_front=True)
        make_obj('trousers.' + tag, Vt, Ft, UVt, 'trousers', N=Nt)

    print('BODY_STEP sleeves and arms', flush=True)
    # ---------------------------------------------------------------- short wide kimono sleeves (sheet front: the top runs from the shoulder at
    # z 0.53 out to the corner at (0.29, 0.43); the opening is the slanted edge from that corner to the armpit at (0.17, 0.335), square to the
    # arm, which hangs 38 deg out from vertical). The sleeve is a loft of rings from inside the torso to that opening, slightly gathered.
    ARM = {}; ARM_DEG = 38.
    for s, tag in ((1, 'L'), (-1, 'R')):
        th = math.radians(ARM_DEG); ad = unit(np.array([s * math.sin(th), .02, -math.cos(th)]))
        u_open = unit(np.array([s * math.cos(th), 0, math.sin(th)]))
        OC = np.array([s * .232, RCY + .018, .382]); OHU, OHY = .076, .086
        RC = np.array([s * .085, RCY + .008, .468]); RHU, RHY = .072, .106
        NR = 11; ts = np.linspace(0, 1, NR); NS = 20; sa = np.linspace(0, 2 * PI, NS, endpoint=False)
        rings = []
        for t in ts:
            n0 = np.array([s * 1., 0, 0]); n = unit(n0 * (1 - smooth(.15, 1., t)) + ad * smooth(.15, 1., t))
            uu = unit(np.cross(n, [0, 1., 0]) * s); uu = uu if uu[2] > 0 else -uu
            vv = np.array([0, 1., 0])
            c = RC + (OC - RC) * t + np.array([0, 0, .034]) * math.sin(PI * t) * (1 - t) + u_open * .008 * math.sin(PI * t)
            hu = RHU + (OHU - RHU) * t + .010 * math.sin(PI * t); hy = RHY + (OHY - RHY) * t + .008 * math.sin(PI * t)
            g = .26 * smooth(.80, 1., t)
            ring = c + np.outer(hu * (1 - g) * spow(np.sin(sa), 2 / 2.4), uu) + np.outer(hy * (1 - g * .6) * spow(np.cos(sa), 2 / 2.4), vv)
            rings.append(ring)
        Gq = np.array(rings)
        dS = np.roll(Gq, -1, 1) - np.roll(Gq, 1, 1); dK = np.gradient(Gq, axis=0)
        NGq = unit(np.cross(dK, dS)); ctr = Gq.mean(1, keepdims=True)
        NGq = np.where(((NGq * (Gq - ctr)).sum(-1) < 0)[..., None], -NGq, NGq)
        V = Gq.reshape(-1, 3); NN = NGq.reshape(-1, 3); nr_, ns_ = Gq.shape[:2]
        tone = np.repeat(np.linspace(.04, .14, nr_), ns_)
        UVo = kim_uv(NN, tone); UVi = ramp_uv('lining', sval(-NN, hi=.10, lo=.10) - .06)
        plain = np.zeros(len(V), bool); plain[:ns_] = True
        Vt, Ft, UVt, Nt = thicken(V, grid_faces(nr_, ns_, wrap=True), NN, .013, UVo, UVi, UVo, rim=3, plain=plain, split_front=True)
        make_obj('sleeve.' + tag, Vt, Ft, UVt, 'sleeve.' + tag, N=Nt)
        SH = np.array([s * .140, RCY + .012, .470])
        def along(t0, OC=OC, ad=ad): return OC + ad * t0
        EL = along(-.010); WR = along(.030); PC = along(.078)
        fwd = unit(np.array([0, -1., 0]) - ad * (ad @ np.array([0, -1., 0])))
        def arm_sdf(p, OC=OC, WR=WR, ad=ad): return sd_capsule(p, OC - ad * .080, WR, (.046, .043))
        tsa = np.linspace(-.070, .040, 6)
        ring_stack('fur_arm.' + tag, arm_sdf, OC[None] + ad[None] * tsa[:, None], np.tile(ad, (len(tsa), 1)), 'arm.' + tag,
                   lambda NN, V: fur_uv(sval(NN, hi=.20, lo=.20), .0), sides=14, tmax=.12, ref=fwd, pole_start=False, pole_end=False)
        lat = unit(np.cross(ad, fwd)) * s
        paw_axes = np.array([ad, fwd, lat])
        thumb = PC + fwd * .044 - lat * .008 - ad * .014
        def paw_parts(p, WR=WR, PC=PC, paw_axes=paw_axes, thumb=thumb, ad=ad):
            d_w = sd_capsule(p, WR - ad * .026, PC - ad * .010, (.043, .048))
            d_paw = sd_ell(p, PC, paw_axes, (.066, .062, .056))
            d_t = sd_ell(p, thumb, paw_axes, (.027, .023, .023))
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
    # ---------------------------------------------------------------- short legs (hidden by the trousers) and big round feet (sheet front: 0.185 m
    # wide, centres x +-0.105, 0.085 m tall; side: 0.27 m long, the toes 0.135 m in front of the axis), two toe creases each
    LEG = {}
    for s, tag in ((1, 'L'), (-1, 'R')):
        HP = np.array([s * .085, RCY, .262]); AN = np.array([s * .105, -.004, .080])
        def leg_sdf(p, HP=HP, AN=AN): return sd_capsule(p, HP, AN, (.056, .048))
        zs = np.linspace(.200, .075, 5)
        cen = np.array([HP + (AN - HP) * ((z_ - HP[2]) / (AN[2] - HP[2])) for z_ in zs])
        ring_stack('fur_leg.' + tag, leg_sdf, cen, np.tile(unit(AN - HP), (len(zs), 1)), 'body',
                   lambda NN, V: fur_uv(sval(NN, hi=.20, lo=.20, occ=.12 * smooth(.12, .20, V[:, 2])), .0), sides=14, tmax=.14, ref=[0, -1., 0],
                   pole_start=False)
        FC = np.array([s * .105, -.008, .040]); FAX = rot([0, 0, 1], s * math.radians(4)).T
        toes = [FC + (np.array([o * .050, -.094, .002]) @ FAX) for o in (-1, 0, 1)]
        def foot_parts(p, FC=FC, FAX=FAX, toes=toes, AN=AN):
            d_main = sd_ell(p, FC + np.array([0, .012, 0]), FAX, (.090, .118, .048))
            d_ank = sd_capsule(p, AN + np.array([0, 0, .016]), AN + np.array([0, -.008, -.022]), .050)
            d_t = [sd_ell(p, t, FAX, (.037, .036, .038)) for t in toes]
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
        star_mesh('fur_foot.' + tag, foot_sdf, FC + np.array([0, -.006, .014]), 'body', foot_uv, nth=11, nph=20, tmax=.20)
        LEG[tag] = {'hip': HP.tolist(), 'knee': (HP + (AN - HP) * .55).tolist(), 'ankle': AN.tolist(), 'toe': (FC + np.array([0, -.110, -.010]) @ FAX).tolist()}

    print('BODY_STEP kerchief', flush=True)
    # ---------------------------------------------------------------- the ivory kerchief: a thick soft ring round the neck on the shoulders
    # (sheet front: +-0.19 m at z 0.588, its lower edge +-0.158 at 0.545; side: 0.36 m deep; back: the folded point dips to z 0.50 at the
    # centre), a round knot under the chin and two leaf-shaped ends hanging down and out to (+-0.075, 0.45)
    KC_ZF, KC_ZB = .566, .575
    NKP = 40; phk = np.linspace(0, 2 * PI, NKP, endpoint=False)
    KAX, KAY, KCY = .158, .142, RCY + .016
    kpath = np.stack([KAX * np.sin(phk), KCY - KAY * np.cos(phk), KC_ZF + (KC_ZB - KC_ZF) * (1 - np.cos(phk)) / 2], -1)
    knrm = unit(np.stack([np.sin(phk) / KAX, -np.cos(phk) / KAY, np.zeros(NKP)], -1))
    sak = np.linspace(0, 2 * PI, 10, endpoint=False)
    back_k = smooth(.30, .95, -np.cos(phk))                 # 0 at the front .. 1 at the back centre: the folded point
    def kprof(k):
        # (ring_tube's B axis points down here: db > 0 is below the ring's centre line)
        bk = back_k[k] ** 1.6; sn = np.sin(sak); cs = np.cos(sak)
        hn = .024 + .004 * bk; up = .025; dnh = .025 + .036 * bk
        lowpart = np.clip(sn, 0, 1)
        dn = hn * spow(cs, .85) + .004 * bk - .020 * bk * lowpart ** 1.5        # the folded point lies down on the upper back
        db = np.where(sn < 0, up * spow(sn, .85), dnh * spow(sn, .75))
        return np.stack([dn, db], -1)
    ring_tube('kerchief_ring', kpath, kprof, 'kerchief', lambda NN, tt, uu, V: ramp_uv('kerch', sval(NN, hi=.22, lo=.20)), knrm, sides=10)
    KN_C = np.array([0, KCY - KAY - .022, KC_ZF - .004])
    lobe('kerchief_knot', KN_C, np.array([.024, .033, .025]), [0, -1., 0], 'kerchief', ramp='kerch', n=4, squash=.05)
    for s, tag in ((-1, 'R'), (1, 'L')):
        # a leaf: a thick flattened sweep from under the knot down and out, swelling then tapering to a soft point
        cp = [KN_C + np.array([s * .010, .006, -.014]), KN_C + np.array([s * .030, .000, -.048]),
              KN_C + np.array([s * .052, .010, -.084]), KN_C + np.array([s * .068, .026, -.112])]
        path = cpath(cp, 14)
        nrm = np.tile(np.array([0, -1., .10]), (len(path), 1))
        prof = lambda k: (.0100 + .0045 * math.sin(PI * min(k / 13, 1.)) ** .8,
                          .0050 + .0270 * math.sin(PI * (min(k / 13, 1.) * .86 + .07)) ** .70)
        sweep('kerchief_leaf.' + tag, path, prof, 'kerchief', ramp_sw('kerch', hi=.24, add=.02), sides=10, normals=nrm, p=.70, cap0=True, cap1=True)
    LOG['kerchief'] = {'ring_front_z_m': KC_ZF, 'ring_back_z_m': KC_ZB, 'knot_m': [round(float(c), 3) for c in KN_C]}

    print('BODY_STEP tail', flush=True)
    # ---------------------------------------------------------------- the big fluffy tail: one smooth plume from the low back sweeping out to her
    # left and back, its cream tip rising (sheet back view: x 0 .. +0.34 m (her left), z 0.09 .. 0.35; side: 0.16 .. 0.365 m behind the axis,
    # z 0.14 .. 0.50; front: peeking out at x 0.22 .. 0.378). A separate piece with bend rings, painted in its own chart.
    TAIL_CP = np.array([[.020, .130, .290], [.075, .190, .220], [.150, .245, .188], [.218, .284, .208], [.258, .304, .268],
                        [.266, .306, .340], [.250, .300, .410], [.226, .290, .458]])
    TAIL_RT = np.array([0, .06, .16, .28, .42, .56, .70, .82, .92, 1.0]); TAIL_RR = np.array([.040, .062, .090, .108, .114, .110, .098, .080, .058, .030])
    def build_tail():
        path = cpath(TAIL_CP, 200); seg = np.linalg.norm(np.diff(path, axis=0), axis=1); s_ = np.concatenate([[0], np.cumsum(seg)]); s_ /= s_[-1]
        NRT, NST = 28, 18
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
            rx, rb = R[k] * 1.06, R[k] * .97
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
        'kimono_top': ['kimono_top'], 'obi': ['obi'], 'obi_knot': ['obi_knot'], 'kimono_skirt': ['kimono_skirt'],
        'trousers': ['trousers'], 'sleeve_L': ['sleeve.L'], 'paw_L': ['mitten_paw.L'], 'paw_R': ['mitten_paw.R'], 'legs': ['fur_leg'],
        'foot_L': ['fur_foot.L'], 'tail': ['tail'], 'kerchief': ['kerchief'], 'lash_L': ['lash.L']}.items() if len(_vs(v))}}
    BODY_MEAS['arm_angle_from_vertical_deg'] = ARM_DEG
    BODY_PIVOTS = {'arm.L': tuple(ARM['L']['shoulder']), 'arm.R': tuple(ARM['R']['shoulder']), 'sleeve.L': tuple(ARM['L']['shoulder']),
                   'sleeve.R': tuple(ARM['R']['shoulder']), 'body': (0, 0, 0), 'kimono_skirt': (0, RCY, GZ0), 'trousers': (0, RCY, TR_Z0),
                   'tail': tuple(TAIL_ROOT), 'kerchief': (0, KCY, KC_ZF)}
    def POST_JOIN():
        joints = {'units': 'metres', 'coordinate_system': 'Blender Z-up, front -Y; character left is +X'}
        joints.update({'hips': [0, RCY, .272], 'spine': [0, RCY, .370], 'chest': [0, RCY - .004, .455], 'neck': [0, RCY - .004, .548]})
        joints['head'] = [float(v) for v in O]
        joints['head_base'] = [0, float(HY + .02 * W), float(CHIN + .02 * W)]
        joints['jaw_pivot'] = [0, float(HY + NOSE_TIP_L * W + .20 * W), float(CHIN + .10 * W)]
        joints['eyes'] = {'R': eye_centers['R'], 'L': eye_centers['L']}
        joints['lashes'] = LASH_INFO
        joints['ears'] = {t: {k: [float(v) for v in ear_info[t][k]] for k in ('base', 'mid', 'tip')} for t in ('R', 'L')}
        joints['arms'] = {t: {k: ARM[t][k] for k in ('shoulder', 'elbow', 'wrist')} for t in ARM}
        joints['legs'] = LEG
        joints['palm_R'] = ARM['R']['palm']; joints['palm_L'] = ARM['L']['palm']
        P = TAIL['P']; n_ = len(P); idx = [0, n_ // 4, n_ // 2, (3 * n_) // 4, n_ - 3, n_ - 1]
        joints['tail'] = [[round(float(c), 4) for c in P[i]] for i in idx]
        joints['tailRoot'] = [float(v) for v in TAIL_ROOT]
        joints['mouth'] = MOUTH_INFO
        joints['kerchief'] = LOG['kerchief']
        joints['obi'] = LOG['obi']
        joints['notes'] = ['Phase 1: no rig, weights or animations. Same keys as the Toybox heroes / Kitsune / Kazemaru joints.json.',
                           'head = the head-ball centre (the radial origin), not the nod pivot; head_base = a suggested nod pivot at the base of the skull.',
                           'Head skin = zero surface of one smooth implicit field (skull + cheek mass + cheek tufts + muzzle + chin + nose), analytic normals; no eye sockets.',
                           'Mouth: a sculpted "w" smile groove (closed) with 5 loops round it; the skin is cut along the parting (see mouth).',
                           'Eyelid holes ringed by 6 loops each, the rim rolled in behind separate lens eyeballs; 5 loops round the nose.',
                           'Lashes: Kaede_lash_L / _R, thick rolls on the skin over each opening with the wing (origin = the eye centre): weight 100% to lidU.',
                           'Ears: separate pieces (Kaede_ear_L / _R), 26 bend rows from the root (in the skull) to the tip; pivot = ears.base.',
                           'Kerchief (Kaede_kerchief): the ring, the knot and the two leaf ends (14 rings each): weight to chest / neck.',
                           'Tail: a separate piece (Kaede_tail), 28 bend rings from the root (under the obi) to the tip; pivot = tailRoot; chain = tail.',
                           'Sleeves (Kaede_sleeve_L/_R): separate shells with 11 rings; the kimono skirt (Kaede_kimono_skirt) 6 rings; the trouser legs 8 rings each.']
        with open(os.path.join(ROOT, 'joints.json'), 'w', encoding='utf-8') as f: json.dump(joints, f, indent=2)
