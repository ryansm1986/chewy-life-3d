if not HEAD_ONLY:
    # ============================================================== BODY AND GI (metres; body axis x = 0, y = 0; sheet front 2.369 mm / px)
    RCY = .000
    def gi_uv(N, tone=0., occ=0., hi=.26, lo=.20): return mix_uv('kimmix', sval(N, hi=hi, lo=lo, occ=occ), tone)
    print('BODY_STEP gi top', flush=True)
    # ---------------------------------------------------------------- the gi top: from inside the belt up under the head
    # (sheet front: 0.35 m across at the obi; side: chest -0.18 .. back +0.175 at the obi, -0.147 / +0.154 at z 0.456; the collar at z 0.53)
    TZ = np.array([.300, .340, .380, .420, .460, .490, .515, .535, .552, .570])
    TAX = np.array([.163, .165, .167, .168, .163, .150, .134, .120, .100, .082])
    TAY = np.array([.160, .162, .163, .160, .148, .132, .118, .106, .090, .074])
    TCY = np.array([0, 0, 0, 0, .002, .008, .016, .024, .034, .046])          # the collar sits back under the head (it hides the neck from behind)
    tax_f = natspline(TZ, TAX); tay_f = natspline(TZ, TAY); tcy_f = natspline(TZ, TCY); TP = 2.3
    def torso_raw(a, z):
        a = np.asarray(a, float); z = np.asarray(z, float)
        return np.stack([tax_f(z) * spow(np.sin(a), 2 / TP), RCY + tcy_f(z) - tay_f(z) * spow(np.cos(a), 2 / TP), z + 0 * a], -1)
    def torso_n(a, z, e=1e-4):
        da = torso_raw(np.asarray(a) + e, z) - torso_raw(np.asarray(a) - e, z)
        dz = torso_raw(a, np.asarray(z) + e) - torso_raw(a, np.asarray(z) - e)
        n = unit(np.cross(dz, da)); c = torso_raw(a, z) - np.stack([0 * np.asarray(a), RCY + tcy_f(z) + 0 * np.asarray(a), np.asarray(z) * 0 + .45], -1)
        return np.where(((n * c).sum(-1) < 0)[..., None], -n, n)
    def torso_pt(a, z, off=0.): return torso_raw(a, z) + torso_n(a, z) * np.asarray(off, float)[..., None]
    def torso_a_of_x(x, z):
        s_ = np.clip(np.asarray(x, float) / tax_f(z), -.999, .999); return np.arcsin(spow(s_, TP / 2))
    # the cream chest V between the lapels: from the neck (half-width 0.052 m at z 0.53) down to its point at z 0.482; the blue lapel
    # bands (0.036 m wide) run from behind the neck down to their crossing at z 0.395, just above the obi (his left over his right)
    ZX = .482; ZN = .530; VHW = .052; LAP_W = .036; ZCROSS = .395
    def white_hw(z): return VHW * np.clip((z - ZX) / (ZN - ZX), 0, 1)
    def torso_uv_of(a, z):
        x0, y0, w, h = CHARTS['torso']; u = (np.asarray(a) + PI) / (2 * PI)
        v = (np.asarray(z) - TZ[0]) / (TZ[-1] - TZ[0])
        return np.stack([(x0 + 6 + u * (w - 12)) / 2048, (y0 + 6 + v * (h - 12)) / 2048], -1)
    NA_T, NZ_T = 40, 10
    zt_ = np.linspace(TZ[0], TZ[-1], NZ_T); at_ = np.linspace(0, 2 * PI, NA_T + 1) + PI
    AA, ZZ = np.meshgrid(at_, zt_); Pt_ = torso_raw(AA, ZZ); Nt_ = torso_n(AA, ZZ)
    make_obj('gi_top', Pt_.reshape(-1, 3), grid_faces(NZ_T, NA_T + 1, wrap=False), torso_uv_of(AA.reshape(-1) - 2 * PI, ZZ.reshape(-1)), 'body',
             N=Nt_.reshape(-1, 3))
    for s, tag in ((-1, 'R'), (1, 'L')):       # his left lapel lies over his right one (the sheet)
        zs = np.linspace(ZN + .010, ZCROSS if s > 0 else ZX - .012, 12)          # (the under lapel ends under the top one)
        def lap_x(z, s=s):                     # the band's centre: its inner edge on the V's edge; the top lapel (his left) runs on across
            zz = np.asarray(z, float)            # the chest to x -0.075 at the obi, the under one to +0.02
            top = s * (white_hw(zz) + LAP_W / 2)
            low = np.interp(zz, [ZCROSS, ZX], [-.075, .018]) if s > 0 else np.interp(zz, [ZCROSS, ZX], [.020, -.018])
            return np.where(zz >= ZX, top, low)
        front_pts = [torso_pt(np.array([torso_a_of_x(lap_x(z_), z_)]), np.array([z_]), .007 + .004 * (s > 0))[0] for z_ in zs]
        back_pts = [torso_pt(np.array([s * a_]), np.array([.548]), .009)[0] + np.array([0, 0, .006]) for a_ in (PI * .99, PI * .78, PI * .55, PI * .34)]
        path = cpath(back_pts + front_pts, 24)
        nrm = torso_n(np.array([math.atan2(p_[0], -(p_[1] - RCY)) for p_ in path]), np.clip(path[:, 2], TZ[0], TZ[-1]))
        sweep('lapel.' + tag, path, lambda k: (.0085, LAP_W / 2), 'body', ramp_sw("gi", hi=.24, add=.06 + .03 * (s > 0)), sides=8,
              normals=nrm, p=.70, cap0=False, cap1=True)

    print('BODY_STEP obi', flush=True)
    # ---------------------------------------------------------------- the red obi (sheet z 0.31 .. 0.387, 0.35 m wide + its thickness), a plain
    # soft band at the front and a rounded square knot pad at the back (back view: 0.11 x 0.097 m, z 0.313 .. 0.411)
    OBI_Z0, OBI_Z1 = .310, .388; OBI_ZC = (OBI_Z0 + OBI_Z1) / 2; OBI_H = OBI_Z1 - OBI_Z0
    NAS = 34; a_s = np.linspace(0, 2 * PI, NAS, endpoint=False)
    def waist(a, off):
        return np.stack([(tax_f(OBI_ZC) + off) * spow(np.sin(a), 2 / TP), RCY - (tay_f(OBI_ZC) + off) * spow(np.cos(a), 2 / TP), np.full(len(a), OBI_ZC)], -1)
    BELT_OFF = .006
    Pb = waist(a_s, BELT_OFF)
    Nb = unit(np.stack([Pb[:, 0] / (tax_f(OBI_ZC) + BELT_OFF) ** 2, (Pb[:, 1] - RCY) / (tay_f(OBI_ZC) + BELT_OFF) ** 2, np.zeros(NAS)], -1))
    ab8 = np.linspace(0, 2 * PI, 14, endpoint=False)
    ring_tube('belt', Pb, lambda k: np.stack([.0210 * spow(np.cos(ab8), .45), OBI_H / 2 * spow(np.sin(ab8), .32)], -1), 'body',
              lambda NN, tt, uu, V: ramp_uv('belt', sval(NN, hi=.26, lo=.20)), Nb, sides=14)
    BELT_BACK_Y = float(Pb[NAS // 2][1] + .0210)
    KN_C = np.array([0, BELT_BACK_Y + .004, OBI_ZC + .012])
    def knot_sdf(p): return sd_box(p, KN_C, np.eye(3), (.055, .019, .049), .018)
    def knot_uv(NN, V): return ramp_uv('belt', sval(NN, hi=.26, lo=.20) + .04)
    star_mesh("belt_knot", knot_sdf, KN_C, "body", knot_uv, nth=14, nph=24, tmax=.12)
    LOG['obi'] = {'z_m': [OBI_Z0, OBI_Z1], 'knot_centre_m': [round(float(c), 3) for c in KN_C]}

    print('BODY_STEP gi skirt', flush=True)
    # ---------------------------------------------------------------- the gi below the belt: a flared skirt to the hem (sheet: z 0.205 at the sides,
    # 0.18 at the front; 0.50 m wide under the belt, 0.56 m at the hem; side 0.41 m deep). His right panel lies over his left: its edge
    # runs down at x +0.08 (a soft step) and its hem hangs a little lower.
    # (Tobi: the hem at z 0.235 at the sides, 0.225 at the front; 0.41 m wide at the hem; side -0.177 .. +0.192. His left panel lies over
    # his right: its edge runs down at x -0.057 (a soft step).)
    GZ0, GZ1 = .336, .238; GT = (tax_f(.336) + .002, tay_f(.336) + .002); GH = (.206, .178, .192); GP = 2.4
    EDGE_X = -.057
    def gskirt_geom(a, t):
        g = np.clip(np.asarray(t, float), 0, 1) ** .9; ax_ = GT[0] + (GH[0] - GT[0]) * g
        ay_ = np.where(np.cos(a) > 0, GT[1] + (GH[1] - GT[1]) * g, GT[1] + (GH[2] - GT[1]) * g)
        x = ax_ * spow(np.sin(a), 2 / GP); front = np.cos(a) > 0
        over = front * smooth(EDGE_X - .004, EDGE_X + .010, x) * (1 - smooth(.55, .90, np.sin(a)))     # the top panel (his left)
        hem = GZ0 + (GZ1 - GZ0) * t - .012 * front * smooth(.35, .9, np.cos(a)) * t ** 3 - .005 * over * t ** 3
        P = np.stack([x, RCY - ay_ * spow(np.cos(a), 2 / GP), hem + 0 * a], -1)
        n2 = unit(np.stack([P[..., 0] / ax_ ** 2, (P[..., 1] - RCY) / ay_ ** 2, 0 * P[..., 0]], -1))
        return P + n2 * (.006 * over * smooth(.0, .25, t))[..., None]
    def gskirt_n(a, t, e=1e-4):
        P0 = gskirt_geom(a, t); Pa = gskirt_geom(a + e, t) - gskirt_geom(a - e, t); Ptt = gskirt_geom(a, np.minimum(t + e, 1.)) - gskirt_geom(a, np.maximum(t - e, 0.))
        n = unit(np.cross(Pa, Ptt)); ctr = np.stack([0 * P0[..., 0], RCY + 0 * P0[..., 0], P0[..., 2]], -1)
        return np.where(((n * (P0 - ctr)).sum(-1) < 0)[..., None], -n, n)
    NA_G, NZ_G = 48, 6
    a_k = np.linspace(0, 2 * PI, NA_G, endpoint=False); t_k = np.linspace(0, 1, NZ_G)
    AK, TK = np.meshgrid(a_k, t_k); Gs = gskirt_geom(AK, TK); Ns = gskirt_n(AK, TK)
    Vs = Gs.reshape(-1, 3); NNs = Ns.reshape(-1, 3); Fs = grid_faces(NZ_G, NA_G, wrap=True)
    xk = Gs[..., 0]; edge_sh = np.exp(-((xk - EDGE_X + .012) / .010) ** 2) * (np.cos(AK) > 0)          # the shade just past the panel edge
    UVo = gi_uv(NNs, (.04 + .06 * smooth(.0, 1., TK)).reshape(-1), occ=.20 * edge_sh.reshape(-1) + .10 * (1 - smooth(.0, .35, TK)).reshape(-1))
    UVi = ramp_uv('lining', sval(-NNs, hi=.10, lo=.10) - .10)
    plain = np.zeros(len(Vs), bool); plain[:NA_G] = True
    Vt, Ft, UVt, Nt = thicken(Vs, Fs, NNs, .014, UVo, UVi, UVo, rim=3, plain=plain, split_front=True)
    make_obj('gi_skirt', Vt, Ft, UVt, 'gi_skirt', N=Nt)

    print('BODY_STEP trousers', flush=True)
    # ---------------------------------------------------------------- the puffy trousers: two balloon legs under the gi (sheet front: 0.436 m
    # across at z 0.18, the gap between the legs from z 0.157, gathered to cuffs over the feet at z 0.105: each cuff 0.152 m wide at
    # x +-0.10; side -0.154 .. +0.178 at z 0.23, -0.097 .. +0.128 at the cuff), a few soft pleats
    HK_Z0, HK_Z1 = .268, .098
    def hk_dims(z):
        z = np.asarray(z, float)
        xo = .190 + .028 * smooth(.268, .190, z) - .042 * smooth(.165, .098, z) ** 1.3
        xi = .004 + .022 * smooth(.165, .110, z) ** 1.2
        hy = .150 + .016 * smooth(.268, .19, z) - .046 * smooth(.165, .098, z) ** 1.3
        yc = .012 - .002 * smooth(.20, .10, z)
        return xo, xi, hy, yc
    N_HP = 3
    for s, tag in ((-1, 'R'), (1, 'L')):
        NZH, NAH = 9, 30
        zh = HK_Z0 + (HK_Z1 - HK_Z0) * np.linspace(0, 1, NZH)
        ah = np.linspace(0, 2 * PI, NAH, endpoint=False)
        rings = []
        for z_ in zh:
            xo, xi, hy, yc = hk_dims(z_); xc = (xo + xi) / 2; hx = (xo - xi) / 2
            X = xc + hx * spow(np.sin(ah), 2 / 2.5); Y = RCY + yc - hy * spow(np.cos(ah), 2 / 2.5)
            pl = (.0030 * smooth(.20, .12, z_) + .0010) * np.sin(ah * 2 * N_HP) * smooth(.30, .70, np.abs(np.cos(ah)))
            rings.append(np.stack([s * X, Y + np.sign(np.cos(ah)) * -pl, np.full(NAH, z_)], -1))
        Gh = np.array(rings)
        # the cuff: the last ring tucks in and under (the gathered hem over the foot)
        cen = Gh[-1].mean(0); Gh = np.concatenate([Gh, (cen + (Gh[-1] - cen) * .86 + np.array([0, 0, .006]))[None]], 0); NZH += 1
        dS = np.roll(Gh, -1, 1) - np.roll(Gh, 1, 1); dK = np.gradient(Gh, axis=0)
        NGh = unit(np.cross(dK, dS)); ctr = Gh.mean(1, keepdims=True)
        NGh = np.where(((NGh * (Gh - ctr)).sum(-1) < 0)[..., None], -NGh, NGh)
        Vh = Gh.reshape(-1, 3); NNh = NGh.reshape(-1, 3)
        crs_ = np.tile(np.exp(-((np.sin(ah) + 1) / .30) ** 2), NZH)
        tz = np.repeat(np.linspace(0, 1, NZH), NAH)
        UVo = mix_uv('skmix', sval(NNh, hi=.22, lo=.20, occ=.20 * crs_ + .12 * (1 - smooth(.0, .30, tz)) + .10 * smooth(.85, 1., tz)).reshape(-1), .12 + .10 * smooth(.3, 1., tz))
        UVi = ramp_uv('hklining', sval(-NNh, hi=.10, lo=.10) - .10)
        plain = np.zeros(len(Vh), bool); plain[:NAH] = True
        Vt, Ft, UVt, Nt = thicken(Vh, grid_faces(NZH, NAH, wrap=True), NNh, .016, UVo, UVi, UVo, rim=4, plain=plain, split_front=True)
        make_obj('hakama.' + tag, Vt, Ft, UVt, 'hakama', N=Nt)

    print('BODY_STEP sleeves and arms', flush=True)
    # ---------------------------------------------------------------- short wide gi sleeves (sheet front: the top runs from the shoulder at
    # z 0.585 out to the corner at (0.346, 0.478); the opening is the slanted edge from that corner to the armpit at (0.208, 0.377), square
    # to the arm, which hangs 31 deg out from vertical). The sleeve is a loft of rings from inside the torso to that opening, slightly gathered.
    ARM = {}; ARM_DEG = 38.          # (the sheet draws ~45 deg stubby arms; 38 keeps an A-pose for the rig)
    for s, tag in ((1, 'L'), (-1, 'R')):
        th = math.radians(ARM_DEG); ad = unit(np.array([s * math.sin(th), .02, -math.cos(th)]))
        u_open = unit(np.array([s * math.cos(th), 0, math.sin(th)]))         # the opening's long axis (up and out)
        OC = np.array([s * .218, RCY + .010, .424]); OHU, OHY = .066, .080   # the opening ring: centre, half-length, half-depth
        RC = np.array([s * .090, RCY + .004, .470]); RHU, RHY = .066, .110   # the root ring inside the torso (in the plane x = const)
        NR = 11; ts = np.linspace(0, 1, NR); NS = 22; sa = np.linspace(0, 2 * PI, NS, endpoint=False)
        rings = []
        for t in ts:
            n0 = np.array([s * 1., 0, 0]); n = unit(n0 * (1 - smooth(.15, 1., t)) + ad * smooth(.15, 1., t))
            uu = unit(np.cross(n, [0, 1., 0]) * s); uu = uu if uu[2] > 0 else -uu
            vv = np.array([0, 1., 0])
            c = RC + (OC - RC) * t + np.array([0, 0, .030]) * math.sin(PI * t) * (1 - t) + u_open * .008 * math.sin(PI * t)
            hu = RHU + (OHU - RHU) * t + .010 * math.sin(PI * t); hy = RHY + (OHY - RHY) * t + .008 * math.sin(PI * t)
            g = .28 * smooth(.80, 1., t)                                     # a light gather at the end (it still reads as an open sleeve)
            ring = c + np.outer(hu * (1 - g) * spow(np.sin(sa), 2 / 2.4), uu) + np.outer(hy * (1 - g * .6) * spow(np.cos(sa), 2 / 2.4), vv)
            rings.append(ring)
        Gq = np.array(rings)
        dS = np.roll(Gq, -1, 1) - np.roll(Gq, 1, 1); dK = np.gradient(Gq, axis=0)
        NGq = unit(np.cross(dK, dS)); ctr = Gq.mean(1, keepdims=True)
        NGq = np.where(((NGq * (Gq - ctr)).sum(-1) < 0)[..., None], -NGq, NGq)
        V = Gq.reshape(-1, 3); NN = NGq.reshape(-1, 3); nr_, ns_ = Gq.shape[:2]
        tone = np.repeat(np.linspace(.04, .14, nr_), ns_)
        UVo = gi_uv(NN, tone); UVi = ramp_uv('lining', sval(-NN, hi=.10, lo=.10) - .06)
        plain = np.zeros(len(V), bool); plain[:ns_] = True
        Vt, Ft, UVt, Nt = thicken(V, grid_faces(nr_, ns_, wrap=True), NN, .015, UVo, UVi, UVo, rim=3, plain=plain, split_front=True)
        make_obj('sleeve.' + tag, Vt, Ft, UVt, 'sleeve.' + tag, N=Nt)
        SH = np.array([s * .125, RCY + .006, .460])
        def along(t0, OC=OC, ad=ad): return OC + ad * t0
        EL = along(-.020); WR = along(.030); PC = along(.082)
        fwd = unit(np.array([0, -1., 0]) - ad * (ad @ np.array([0, -1., 0])))
        def arm_sdf(p, OC=OC, WR=WR, ad=ad): return sd_capsule(p, OC - ad * .080, WR, (.054, .052))
        tsa = np.linspace(-.070, .040, 6)
        ring_stack('fur_arm.' + tag, arm_sdf, OC[None] + ad[None] * tsa[:, None], np.tile(ad, (len(tsa), 1)), 'arm.' + tag,
                   lambda NN, V: fur_uv(sval(NN, hi=.20, lo=.20), .0), sides=14, tmax=.14, ref=fwd, pole_start=False, pole_end=False)
        lat = unit(np.cross(ad, fwd)) * s
        paw_axes = np.array([ad, fwd, lat])
        thumb = PC + fwd * .044 - lat * .022 - ad * .010
        def paw_parts(p, WR=WR, PC=PC, paw_axes=paw_axes, thumb=thumb, ad=ad):
            d_w = sd_capsule(p, WR - ad * .030, PC - ad * .012, (.052, .056))
            d_paw = sd_ell(p, PC, paw_axes, (.068, .064, .060))
            d_t = sd_ell(p, thumb, paw_axes, (.030, .026, .026))
            return d_w, d_paw, d_t
        def paw_sdf(p, paw_parts=paw_parts):
            d_w, d_paw, d_t = paw_parts(p)
            return smin(smin(d_w, d_paw, .020), d_t, .010)
        def paw_uv(NN, V, paw_parts=paw_parts):
            d_w, d_paw, d_t = paw_parts(V)
            cr = crease(smin(d_w, d_paw, .020), d_t, .010) * .40
            return fur_uv(sval(NN, occ=1.0 * cr, hi=.22, lo=.18), .0)
        tt_ = np.linspace(0, .14, 281); inside = paw_sdf(PC[None] + ad[None] * tt_[:, None]) < 0
        reach = float(tt_[np.argmin(inside)]) if not inside.all() else .14
        tips = PC + ad * (reach - .006)
        tsp = np.concatenate([np.linspace(0, .45, 5)[:-1], np.linspace(.45, 1.0, 12)])
        cen = (WR - ad * .03)[None] + (tips - (WR - ad * .03))[None] * tsp[:, None]
        ring_stack('mitten_paw.' + tag, paw_sdf, cen, np.tile(ad, (len(tsp), 1)), 'arm.' + tag, paw_uv, sides=18, tmax=.12, ref=fwd)
        ARM[tag] = {'shoulder': SH.tolist(), 'elbow': EL.tolist(), 'wrist': WR.tolist(), 'palm': (PC - lat * .008).tolist(),
                    'grip_axis': fwd.tolist(), 'arm_dir': ad.tolist(), 'paw_centre': PC.tolist()}

    print('BODY_STEP legs feet', flush=True)
    # ---------------------------------------------------------------- short legs (hidden by the hakama) and big round feet (sheet front: 0.25 m
    # wide, centres x +-0.173, 0.085 m tall; side: 0.33 m long, the toes 0.20 m in front of the axis), two toe creases each
    LEG = {}
    for s, tag in ((1, 'L'), (-1, 'R')):
        HP = np.array([s * .085, RCY + .010, .260]); AN = np.array([s * .120, RCY - .004, .085])
        def leg_sdf(p, HP=HP, AN=AN): return sd_capsule(p, HP, AN, (.060, .054))
        zs = np.linspace(.200, .085, 5)
        cen = np.array([HP + (AN - HP) * ((z_ - HP[2]) / (AN[2] - HP[2])) for z_ in zs])
        ring_stack('fur_leg.' + tag, leg_sdf, cen, np.tile(unit(AN - HP), (len(zs), 1)), 'body',
                   lambda NN, V: fur_uv(sval(NN, hi=.20, lo=.20, occ=.12 * smooth(.14, .24, V[:, 2])), .0), sides=14, tmax=.16, ref=[0, -1., 0],
                   pole_start=False)
        FC = np.array([s * .128, -.012, .048]); FAX = rot([0, 0, 1], s * math.radians(4)).T
        toes = [FC + (np.array([o * .050, -.088, .002]) @ FAX) for o in (-1, 0, 1)]
        def foot_parts(p, FC=FC, FAX=FAX, toes=toes, AN=AN):
            d_main = sd_ell(p, FC + np.array([0, .014, 0]), FAX, (.094, .124, .052))
            d_ank = sd_capsule(p, AN + np.array([0, 0, .020]), AN + np.array([0, -.008, -.024]), .054)
            d_t = [sd_ell(p, t, FAX, (.037, .036, .040)) for t in toes]
            return d_main, d_ank, d_t
        def foot_sdf(p, foot_parts=foot_parts):
            d_main, d_ank, d_t = foot_parts(p)
            d = smin(d_main, d_ank, .022); tt = smin(smin(d_t[0], d_t[1], .006), d_t[2], .006)
            d = smin(d, tt, .016)
            return smax(d, -(p[:, 2] - .002), .008)
        def foot_uv(NN, V, foot_parts=foot_parts):
            d_main, d_ank, d_t = foot_parts(V)
            cr = crease(d_t[0], d_t[1], .006) * .45 + crease(d_t[1], d_t[2], .006) * .45
            return fur_uv(sval(NN, occ=1.1 * cr + .10 * smooth(.015, .0, V[:, 2]), hi=.20, lo=.18), .0)
        star_mesh('fur_foot.' + tag, foot_sdf, FC + np.array([0, -.006, .014]), 'body', foot_uv, nth=12, nph=22, tmax=.20)
        LEG[tag] = {'hip': HP.tolist(), 'knee': (HP + (AN - HP) * .55).tolist(), 'ankle': AN.tolist(), 'toe': (FC + np.array([0, -.110, -.010]) @ FAX).tolist()}

    print('BODY_STEP tail', flush=True)
    # ---------------------------------------------------------------- the short curled tail (sheet back view: from under the obi knot, a thick
    # comma curling out to his right and down, x 0 .. -0.085, z ~0.22 .. 0.33; side view: up to ~0.12 m behind the gi). A separate piece:
    # a round tube with bend rings, a fat rounded tip.
    TAIL_CP = np.array([[0, .150, .292], [-.002, .205, .284], [-.012, .248, .296], [-.032, .270, .322], [-.058, .262, .342],
                        [-.080, .240, .332], [-.090, .222, .304]])
    TAIL_RT = np.array([0, .15, .35, .55, .75, .90, 1.]); TAIL_RR = np.array([.040, .045, .048, .048, .045, .040, .034])
    path = cpath(TAIL_CP, 26); seg = np.linalg.norm(np.diff(path, axis=0), axis=1); s_ = np.concatenate([[0], np.cumsum(seg)]); s_ /= s_[-1]
    tr = np.interp(s_, TAIL_RT, TAIL_RR)
    sweep('tail', path, lambda k: (tr[k], tr[k] * .96), 'tail', lambda NN, tt, uu, V: fur_uv(sval(NN, hi=.24, lo=.22), .0),
          sides=14, cap0=True, cap1=True, up_hint=[0, 0, 1.])
    TAIL.update({'P': path}); TAIL_ROOT = TAIL_CP[0]

    def _vs(prefixes):
        out = []
        for g, obs in parts.items():
            for o in obs:
                if any(o.name.startswith(p) for p in prefixes): out += [list(o.matrix_world @ v.co) for v in o.data.vertices]
        return np.array(out)
    def _ext(v): return {'min': [round(float(c), 3) for c in v.min(0)], 'max': [round(float(c), 3) for c in v.max(0)], 'size': [round(float(c), 3) for c in np.ptp(v, 0)]}
    BODY_MEAS = {'body_parts_m': {k: _ext(_vs(v)) for k, v in {
        'gi_top': ['gi_top'], 'lapels': ['lapel'], 'obi': ['belt'], 'obi_knot': ['belt_knot'], 'gi_skirt': ['gi_skirt'],
        'hakama': ['hakama'], 'sleeve_L': ['sleeve.L'], 'paw_L': ['mitten_paw.L'], 'paw_R': ['mitten_paw.R'], 'legs': ['fur_leg'],
        'foot_L': ['fur_foot.L'], 'tail': ['tail'], 'headband': ['headband'], 'band_knot': ['band_knot'], 'ear_L': ['ear.L']}.items()}}
    BODY_MEAS['arm_angle_from_vertical_deg'] = ARM_DEG
    BODY_PIVOTS = {'arm.L': tuple(ARM['L']['shoulder']), 'arm.R': tuple(ARM['R']['shoulder']), 'sleeve.L': tuple(ARM['L']['shoulder']),
                   'sleeve.R': tuple(ARM['R']['shoulder']), 'body': (0, 0, 0), 'gi_skirt': (0, RCY, OBI_Z0), 'hakama': (0, RCY, HK_Z0),
                   'tail': tuple(TAIL_ROOT), 'band': tuple(O)}
    def POST_JOIN():
        joints = {'units': 'metres', 'coordinate_system': 'Blender Z-up, front -Y; character left is +X'}
        joints.update({'hips': [0, RCY, .280], 'spine': [0, RCY, .360], 'chest': [0, RCY - .004, .440], 'neck': [0, RCY + .010, .520]})
        joints['head'] = [float(v) for v in O]
        joints['head_base'] = [0, float(HY + .02 * W), float(CHIN + .02 * W)]
        joints['jaw_pivot'] = [0, float(HY + NOSE_TIP_L * W + .20 * W), float(CHIN + .10 * W)]
        joints['eyes'] = {'R': eye_centers['R'], 'L': eye_centers['L']}
        joints['ears'] = {t: {k: [float(v) for v in ear_info[t][k]] for k in ('base', 'mid', 'tip')} for t in ('R', 'L')}
        joints['arms'] = {t: {k: ARM[t][k] for k in ('shoulder', 'elbow', 'wrist')} for t in ARM}
        joints['legs'] = LEG
        joints['palm_R'] = ARM['R']['palm']; joints['palm_L'] = ARM['L']['palm']
        P = TAIL['P']; n_ = len(P); idx = [0, n_ // 4, n_ // 2, (3 * n_) // 4, n_ - 3, n_ - 1]
        joints['tail'] = [[round(float(c), 4) for c in P[i]] for i in idx]
        joints['tailRoot'] = [float(v) for v in TAIL_ROOT]
        joints['mouth'] = MOUTH_INFO
        joints['headband'] = LOG['band']
        joints['obi'] = LOG['obi']
        joints['ears'] = {t: {k: [float(v) for v in ear_info[t][k]] for k in ('base', 'top', 'mid', 'tip')} for t in ('R', 'L')}
        joints['notes'] = ['Phase 1: no rig, weights or animations. Same keys as the Toybox heroes / Kazemaru joints.json.',
                           'head = the head-ball centre (the radial origin), not the nod pivot; head_base = a suggested nod pivot at the base of the skull.',
                           'Head skin = zero surface of one smooth implicit field (skull + cheek mass + snout + chin + nose), analytic normals; no eye sockets.',
                           'Mouth: a sculpted "w" smile groove (closed) with 5 loops round it; the skin is cut along the parting (see mouth).',
                           'Eyelid holes ringed by 6 loops each, the rim rolled 4.5 mm in behind separate lens eyeballs; 5 loops round the nose.',
                           'Upper lashes: separate rolls Tobi_lash_L / _R (no lash paint on the skin): weight them 100% to lidU_L / _R.',
                           'Ears: separate floppy pieces (Tobi_ear_L / _R), 34 bend rings along the spine from the root (sunk in the dome) over the fold to the lobe; ears.base = root (pivot), top = the fold, mid, tip = the lobe.',
                           'Headband (Tobi_band): the ring and the square knot pad at the back (rigid with the head).',
                           'Tail: a separate piece (Tobi_tail), 26 bend rings from the root (inside the gi skirt) to the tip; pivot = tailRoot; chain = tail.',
                           'Sleeves (Tobi_sleeve_L/_R): separate shells with 11 rings; the gi skirt (Tobi_gi_skirt) 6 rings; the trouser legs (Tobi_hakama) 10 rings each.']
        with open(os.path.join(ROOT, 'joints.json'), 'w', encoding='utf-8') as f: json.dump(joints, f, indent=2)
