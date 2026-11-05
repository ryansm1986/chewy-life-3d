CHARTS['torso'] = (1536, 448, 512, 448)
BODY_PIVOTS = {}; BODY_MEAS = {}; POST_JOIN = None; TAIL = {}

if not HEAD_ONLY:
    # ============================================================== BODY AND SAILOR SUIT (metres; body axis x = 0, y = 0; sheet front 2.647 mm / px)
    RCY = .015
    def shirt_uv(N, tone=0., occ=0., hi=.22, lo=.20): return mix_uv('shirtmix', sval(N, hi=hi, lo=lo, occ=occ), tone)
    print('BODY_STEP shirt', flush=True)
    # ---------------------------------------------------------------- the white sailor shirt: one lofted shell from its hem (sheet front: z 0.31,
    # +-0.175, a little flared and loose over the shorts) up under the collar to the neck; side: front -0.12, back +0.15 at the chest
    TZ = np.array([.305, .330, .360, .400, .440, .480, .510, .540, .565])
    TAX = np.array([.178, .170, .160, .158, .161, .157, .146, .120, .090])
    TAY = np.array([.140, .137, .135, .134, .128, .118, .106, .090, .072])
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
    SHIRT_T = .012
    NA_T, NZ_T = 40, 10
    zt_ = TZ[0] + (TZ[-1] - TZ[0]) * np.linspace(0, 1, NZ_T) ** 1.1
    # (the torso chart's u wraps at the back centre, so the shell is built open at the back seam with a duplicated column)
    at2 = np.linspace(0, 2 * PI, NA_T + 1) + PI; AA2, ZZ2 = np.meshgrid(at2, zt_)
    Pt2 = torso_raw(AA2, ZZ2); Nt2 = torso_n(AA2, ZZ2); Vt2 = Pt2.reshape(-1, 3); Nv2 = Nt2.reshape(-1, 3)
    Ft2 = grid_faces(NZ_T, NA_T + 1, wrap=False)
    UVo = torso_uv_of(AA2.reshape(-1) - 2 * PI, ZZ2.reshape(-1))
    UVi = ramp_uv('lining', sval(-Nv2, hi=.10, lo=.10) - .05)
    plain = np.zeros(len(Vt2), bool); plain[-(NA_T + 1):] = True
    seam = np.zeros(len(Vt2), bool); seam[::NA_T + 1] = True; seam[NA_T::NA_T + 1] = True
    plain |= seam                                          # (the back seam's two coincident columns get no rim)
    Vt, Ft, UVt, Nt = thicken(Vt2, Ft2, Nv2, SHIRT_T, UVo, UVi, UVo, rim=4, plain=plain, split_front=True)
    make_obj('shirt', Vt, Ft, UVt, 'body', N=Nt)

    print('BODY_STEP shorts', flush=True)
    # ---------------------------------------------------------------- the navy shorts: two baggy legs whose inner sides are flat (a D section)
    # high up, so they meet flush in one seat under the shirt, and part into two round barrels from z 0.23 down (sheet front: +-0.157 at
    # z 0.30, +-0.188 at 0.22, +-0.20 at the cuffs; side -0.106 .. +0.135); each ends in a thick rolled cuff (z 0.08 .. 0.136, +-0.204)
    SZ = np.array([.350, .320, .290, .262, .240, .220, .195, .170, .150, .130, .118])
    SXO = np.array([.144, .150, .157, .166, .178, .188, .194, .197, .197, .192, .186])
    SXI = np.array([.000, .000, .000, .000, .001, .004, .006, .007, .008, .010, .012])
    SHY = np.array([.104, .110, .113, .116, .118, .119, .119, .118, .117, .113, .110])
    SNIN = np.array([9., 9., 9., 8., 6., 4.2, 3.2, 2.8, 2.6, 2.6, 2.6])
    SYC = RCY - .001
    def shorts_ring(s, k, ah):
        xo, xi, hy, nin = SXO[k], SXI[k], SHY[k], SNIN[k]; xc = (xo + xi) / 2; hx = (xo - xi) / 2
        sn = np.sin(ah); cs = np.cos(ah); nn_ = np.where(sn > 0, 2.5, nin)          # sin > 0: the outer side; < 0: the inner side
        X = xc + hx * spow(sn, 2 / nn_); Y = SYC - hy * spow(cs, 2 / nn_)
        pl = .0020 * smooth(.20, .14, SZ[k]) * np.sin(ah * 6 + .6) * smooth(.2, .6, np.abs(cs))         # soft gathers over the cuff
        return np.stack([s * X, Y - np.sign(cs) * pl, np.full(len(ah), SZ[k])], -1)
    SHORTS = {}
    for s, tag in ((-1, 'R'), (1, 'L')):
        NAH = 22; ah = np.linspace(0, 2 * PI, NAH, endpoint=False)
        Gh = np.array([shorts_ring(s, k, ah) for k in range(len(SZ))]); NZH = len(SZ)
        dS = np.roll(Gh, -1, 1) - np.roll(Gh, 1, 1); dK = np.gradient(Gh, axis=0)
        NGh = unit(np.cross(dK, dS)); ctr = Gh.mean(1, keepdims=True)
        NGh = np.where(((NGh * (Gh - ctr)).sum(-1) < 0)[..., None], -NGh, NGh)
        Vh = Gh.reshape(-1, 3); NNh = NGh.reshape(-1, 3)
        tz = np.repeat(np.linspace(0, 1, NZH), NAH)
        inner = np.tile(np.exp(-((np.sin(ah) + 1) / .35) ** 2), NZH) * smooth(.30, .80, tz)
        UVo = mix_uv('navymix', sval(NNh, hi=.20, lo=.18, occ=.20 * inner + .14 * (1 - smooth(.0, .25, tz))).reshape(-1), .10 + .10 * smooth(.3, 1., tz))
        UVi = ramp_uv('navylining', sval(-NNh, hi=.10, lo=.10) - .10)
        plain = np.zeros(len(Vh), bool); plain[:NAH] = True
        # (single-sided: the top sits inside the shirt and the hem under the rolled cuff, so no inner shell is ever seen)
        make_obj('shorts_leg.' + tag, Vh + NNh * .007, grid_faces(NZH, NAH, wrap=True), UVo, 'shorts', N=NNh)
        # the rolled cuff: a thick soft band round the hem
        NCF = 26; ac = np.linspace(0, 2 * PI, NCF, endpoint=False)
        kz = .108; xo, xi, hy = .192, .010, .114; xc = (xo + xi) / 2; hx = (xo - xi) / 2
        path = np.stack([s * (xc + hx * spow(np.sin(ac), 2 / 2.6)), SYC - hy * spow(np.cos(ac), 2 / 2.6), np.full(NCF, kz)], -1)
        nrm = unit(np.stack([s * spow(np.sin(ac), 2 / 2.6) / hx, -spow(np.cos(ac), 2 / 2.6) / hy, np.zeros(NCF)], -1))
        sak = np.linspace(0, 2 * PI, 10, endpoint=False)
        def cprof(k, sak=sak):
            return np.stack([.004 + .013 * spow(np.cos(sak), .55), .028 * spow(np.sin(sak), .65)], -1)
        ring_tube('shorts_cuff.' + tag, path, cprof, 'shorts',
                  lambda NN, tt, uu, V: mix_uv('navymix', sval(NN, hi=.24, lo=.20), .22 + 0 * NN[:, 0]), nrm, sides=10)
        SHORTS[tag] = {'cuff_z_m': [kz - .028, kz + .028], 'outer_x_m': float(xo + .017)}

    print('BODY_STEP sleeves and arms', flush=True)
    # ---------------------------------------------------------------- puffy short sleeves (sheet front: from the shoulder under the collar out to
    # +-0.246 at z 0.435; the opening runs from (0.25, 0.415) to the armpit (0.175, 0.375), square to the arm, which hangs 30 deg out),
    # each ending in a rolled white cuff. The sleeve is a loft of rings from inside the torso to that opening.
    ARM = {}; ARM_DEG = 30.
    for s, tag in ((1, 'L'), (-1, 'R')):
        th = math.radians(ARM_DEG); ad = unit(np.array([s * math.sin(th), .02, -math.cos(th)]))
        u_open = unit(np.array([s * math.cos(th), 0, math.sin(th)]))
        OC = np.array([s * .213, RCY + .006, .396]); OHU, OHY = .052, .058
        RC = np.array([s * .080, RCY + .004, .468]); RHU, RHY = .070, .098
        NR = 10; ts = np.linspace(0, 1, NR); NS = 18; sa = np.linspace(0, 2 * PI, NS, endpoint=False)
        rings = []
        for t in ts:
            n0 = np.array([s * 1., 0, 0]); n = unit(n0 * (1 - smooth(.10, 1., t)) + ad * smooth(.10, 1., t))
            uu = unit(np.cross(n, [0, 1., 0]) * s); uu = uu if uu[2] > 0 else -uu
            vv = np.array([0, 1., 0])
            c = RC + (OC - RC) * t + np.array([0, 0, .030]) * math.sin(PI * t) * (1 - t) + u_open * .012 * math.sin(PI * t)
            hu = RHU + (OHU - RHU) * t + .022 * math.sin(PI * t ** .8); hy = RHY + (OHY - RHY) * t + .014 * math.sin(PI * t ** .8)
            g = .10 * smooth(.85, 1., t)
            ring = c + np.outer(hu * (1 - g) * spow(np.sin(sa), 2 / 2.3), uu) + np.outer(hy * (1 - g * .6) * spow(np.cos(sa), 2 / 2.3), vv)
            rings.append(ring)
        Gq = np.array(rings)
        dS = np.roll(Gq, -1, 1) - np.roll(Gq, 1, 1); dK = np.gradient(Gq, axis=0)
        NGq = unit(np.cross(dK, dS)); ctr = Gq.mean(1, keepdims=True)
        NGq = np.where(((NGq * (Gq - ctr)).sum(-1) < 0)[..., None], -NGq, NGq)
        V = Gq.reshape(-1, 3); NN = NGq.reshape(-1, 3); nr_, ns_ = Gq.shape[:2]
        tone = np.repeat(np.linspace(.04, .10, nr_), ns_)
        UVo = shirt_uv(NN, tone); UVi = ramp_uv('lining', sval(-NN, hi=.10, lo=.10) - .06)
        plain = np.zeros(len(V), bool); plain[:ns_] = True
        # (single-sided: the root sits inside the shirt and the opening under the rolled cuff)
        make_obj('sleeve.' + tag, V + NN * .006, grid_faces(nr_, ns_, wrap=True), UVo, 'sleeve.' + tag, N=NN)
        # the rolled cuff on the opening (a thick soft band, ~0.03 m tall, standing ~0.014 m proud)
        last = Gq[-1]; cen_ = last.mean(0); nrm = unit(last - cen_)
        path = last - ad[None] * .004 + nrm * .006
        sak = np.linspace(0, 2 * PI, 10, endpoint=False)
        def cprof(k, sak=sak):
            return np.stack([.002 + .011 * spow(np.cos(sak), .55), .0150 * spow(np.sin(sak), .65)], -1)
        ring_tube('sleeve_cuff.' + tag, path, cprof, 'sleeve.' + tag, lambda NN_, tt, uu, V_: shirt_uv(NN_, .14 + 0 * NN_[:, 0]), nrm, sides=10)
        SH = np.array([s * .135, RCY + .010, .468])
        def along(t0, OC=OC, ad=ad): return OC + ad * t0
        EL = along(-.010); WR = along(.030); PC = along(.082)
        fwd = unit(np.array([0, -1., 0]) - ad * (ad @ np.array([0, -1., 0])))
        def arm_sdf(p, OC=OC, WR=WR, ad=ad): return sd_capsule(p, OC - ad * .080, WR, (.045, .042))
        tsa = np.linspace(-.070, .040, 6)
        ring_stack('fur_arm.' + tag, arm_sdf, OC[None] + ad[None] * tsa[:, None], np.tile(ad, (len(tsa), 1)), 'arm.' + tag,
                   lambda NN, V: fur_uv(sval(NN, hi=.18, lo=.20), .0), sides=14, tmax=.12, ref=fwd, pole_start=False, pole_end=False)
        lat = unit(np.cross(ad, fwd)) * s
        paw_axes = np.array([ad, fwd, lat])
        thumb = PC + fwd * .046 - lat * .008 - ad * .014
        def paw_parts(p, WR=WR, PC=PC, paw_axes=paw_axes, thumb=thumb, ad=ad):
            d_w = sd_capsule(p, WR - ad * .026, PC - ad * .010, (.042, .048))
            d_paw = sd_ell(p, PC, paw_axes, (.070, .064, .058))
            d_t = sd_ell(p, thumb, paw_axes, (.028, .024, .024))
            return d_w, d_paw, d_t
        def paw_sdf(p, paw_parts=paw_parts):
            d_w, d_paw, d_t = paw_parts(p)
            return smin(smin(d_w, d_paw, .016), d_t, .008)
        def paw_uv(NN, V, paw_parts=paw_parts):
            d_w, d_paw, d_t = paw_parts(V)
            cr = crease(smin(d_w, d_paw, .016), d_t, .008) * .40
            return fur_uv(sval(NN, occ=1.0 * cr, hi=.20, lo=.18), .0)
        tt_ = np.linspace(0, .12, 241); inside = paw_sdf(PC[None] + ad[None] * tt_[:, None]) < 0
        reach = float(tt_[np.argmin(inside)]) if not inside.all() else .12
        tips = PC + ad * (reach - .005)
        tsp = np.concatenate([np.linspace(0, .45, 5)[:-1], np.linspace(.45, 1.0, 12)])
        cen = (WR - ad * .025)[None] + (tips - (WR - ad * .025))[None] * tsp[:, None]
        ring_stack('mitten_paw.' + tag, paw_sdf, cen, np.tile(ad, (len(tsp), 1)), 'arm.' + tag, paw_uv, sides=18, tmax=.10, ref=fwd)
        ARM[tag] = {'shoulder': SH.tolist(), 'elbow': EL.tolist(), 'wrist': WR.tolist(), 'palm': (PC - lat * .006).tolist(),
                    'grip_axis': fwd.tolist(), 'arm_dir': ad.tolist(), 'paw_centre': PC.tolist()}

    print('BODY_STEP legs feet', flush=True)
    # ---------------------------------------------------------------- short legs (hidden by the shorts) and big round feet (sheet front: 0.172 m
    # wide, centres x +-0.123, 0.085 m tall; side: 0.225 m long, the toes 0.11 m in front of the axis), two toe creases each
    LEG = {}
    for s, tag in ((1, 'L'), (-1, 'R')):
        HP = np.array([s * .090, RCY - .010, .262]); AN = np.array([s * .118, -.004, .080])
        def leg_sdf(p, HP=HP, AN=AN): return sd_capsule(p, HP, AN, (.056, .046))
        zs = np.linspace(.200, .075, 5)
        cen = np.array([HP + (AN - HP) * ((z_ - HP[2]) / (AN[2] - HP[2])) for z_ in zs])
        ring_stack('fur_leg.' + tag, leg_sdf, cen, np.tile(unit(AN - HP), (len(zs), 1)), 'body',
                   lambda NN, V: fur_uv(sval(NN, hi=.20, lo=.20, occ=.18 * smooth(.09, .14, V[:, 2])), .0), sides=14, tmax=.14, ref=[0, -1., 0],
                   pole_start=False)
        FC = np.array([s * .123, -.002, .040]); FAX = rot([0, 0, 1], s * math.radians(4)).T
        toes = [FC + (np.array([o * .048, -.080, .002]) @ FAX) for o in (-1, 0, 1)]
        def foot_parts(p, FC=FC, FAX=FAX, toes=toes, AN=AN):
            d_main = sd_ell(p, FC + np.array([0, .010, 0]), FAX, (.084, .104, .046))
            d_ank = sd_capsule(p, AN + np.array([0, 0, .016]), AN + np.array([0, -.008, -.022]), .048)
            d_t = [sd_ell(p, t, FAX, (.035, .034, .036)) for t in toes]
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
        star_mesh('fur_foot.' + tag, foot_sdf, FC + np.array([0, -.004, .014]), 'body', foot_uv, nth=11, nph=20, tmax=.20)
        LEG[tag] = {'hip': HP.tolist(), 'knee': (HP + (AN - HP) * .55).tolist(), 'ankle': AN.tolist(), 'toe': (FC + np.array([0, -.100, -.010]) @ FAX).tolist()}

    print('BODY_STEP collar', flush=True)
    # ---------------------------------------------------------------- the navy sailor collar: a thick shell draped on the shirt. Two lapels run
    # from the shoulders (+-0.15, 0.512) down to a V at the chest (0, 0.452) under the scarf knot; over the shoulders its edge sits at
    # z ~0.50; on the back a square flap hangs to z 0.43 (+-0.135, soft corners). Parameterised round the torso (a = 0 at the front centre)
    # and from the neckline (t = 0) to the outer edge (t = 1).
    COL_OFF, COL_T = .0145, .010
    LAP_IN = ((.012, .461), (.078, .536))            # the lapel's inner edge (x, z): from the V up to the neck
    LAP_OUT = ((.018, .450), (.150, .513))           # its outer edge: from the V out to the shoulder
    def lin(x, P0, P1): return P0[1] + (P1[1] - P0[1]) * np.clip((x - P0[0]) / (P1[0] - P0[0]), 0, 1)
    def col_edges(a):
        a = np.asarray(a, float); xx = np.abs(.158 * spow(np.sin(a), 2 / TP)); front = np.cos(a) > 0
        zin_f = np.where(xx < LAP_IN[1][0], lin(xx, *LAP_IN), .536 + .002 * smooth(LAP_IN[1][0], .15, xx))
        zout_f = np.where(xx < LAP_OUT[1][0], lin(xx, *LAP_OUT), .513 - .010 * smooth(LAP_OUT[1][0], .158, xx))
        # the back: the neckline under the head; the flap's lower edge at 0.43 for |x| < 0.12, rounding up its corners to the shoulder line
        zin_b = np.full_like(a, .538) - .004 * smooth(.16, .0, xx)
        corner = smooth(.112, .150, xx)
        zout_b = .430 + (.503 - .430) * corner
        return np.where(front, zin_f, zin_b), np.where(front, zout_f, zout_b)
    A0 = .055
    a_c = np.concatenate([np.linspace(A0, PI / 2, 16), np.linspace(PI / 2, PI - 1.25, 4)[1:], np.linspace(PI - 1.25, PI - .68, 11)[1:],
                          np.linspace(PI - .68, PI, 8)[1:]])
    a_c = np.concatenate([a_c, (2 * PI - a_c[::-1])[1:]])
    NTC = 5; t_c = np.linspace(0, 1, NTC)
    zin_, zout_ = col_edges(a_c)
    AC, TC = np.meshgrid(a_c, t_c)
    ZC = zin_[None, :] + (zout_ - zin_)[None, :] * TC
    PC_ = torso_raw(AC, ZC); NC_ = torso_n(AC, ZC)
    lift = COL_OFF + .003 * np.sin(PI * TC)                 # a soft roll across the collar's width
    PC_ = PC_ + NC_ * lift[..., None]
    Vc = PC_.reshape(-1, 3); Nc = NC_.reshape(-1, 3)
    Fc = grid_faces(NTC, len(a_c), wrap=False)
    UVo = ramp_uv('navy', sval(Nc, hi=.24, lo=.18) + .02); UVi = ramp_uv('navylining', sval(-Nc, hi=.10, lo=.10))
    Vt, Ft, UVt, Nt = thicken(Vc, Fc, Nc, COL_T, UVo, UVi, UVo, rim=3, split_front=True)
    make_obj('collar', Vt, Ft, UVt, 'collar', N=Nt)
    LOG['collar'] = {'v_point_z_m': LAP_OUT[0][1], 'flap_bottom_z_m': .430, 'shoulder_edge_z_m': .503}

    print('BODY_STEP scarf', flush=True)
    # ---------------------------------------------------------------- the red scarf: a round knot on the collar's V (sheet: 0.055 m wide,
    # z 0.445 .. 0.484) and two broad leaf ends hanging down and out to (+-0.075, 0.35), ~0.07 m wide under the knot
    KN_Z = .466
    KN_C = np.array([0, RCY - float(tay_f(KN_Z)) - SHIRT_T / 2 - .022, KN_Z])
    lobe('scarf_knot', KN_C, np.array([.022, .029, .022]), [0, -1., 0], 'scarf', ramp='scarf', n=4, squash=.05)
    def front_y(z, clear): return RCY - float(tay_f(z)) - SHIRT_T / 2 - clear
    for s, tag in ((-1, 'R'), (1, 'L')):
        zs_ = [KN_Z - .012, KN_Z - .044, KN_Z - .082, KN_Z - .110]
        xs_ = [s * .012, s * .034, s * .058, s * .072]
        cp = [np.array([x_, front_y(z_, c_), z_]) for x_, z_, c_ in zip(xs_, zs_, (.026, .016, .012, .012))]
        path = cpath(cp, 14)
        nrm = np.tile(np.array([0, -1., .08]), (len(path), 1))
        prof = lambda k: (.0085 + .0035 * math.sin(PI * min(k / 13, 1.)) ** .8,
                          .0060 + .0300 * math.sin(PI * (.10 + .80 * min(k / 13, 1.))) ** .65)
        sweep('scarf_end.' + tag, path, prof, 'scarf', ramp_sw('scarf', hi=.24, add=.02), sides=10, normals=nrm, p=.70, cap0=True, cap1=True)
    LOG['scarf'] = {'knot_m': [round(float(c), 3) for c in KN_C]}

    print('BODY_STEP tail', flush=True)
    # ---------------------------------------------------------------- the big fluffy tail: an egg-shaped plume rising behind him from the low back
    # (sheet side: 0.155 .. 0.405 m behind the axis, z 0.145 .. 0.515, the cream tip on top; back: +-0.13 m, z 0.095 .. 0.453: the model
    # takes z 0.13 .. 0.48 so the back view's collar flap stays clear). A separate piece with bend
    # rings, painted in its own chart.
    TAIL_CP = np.array([[0, .095, .262], [0, .165, .238], [0, .228, .240], [0, .266, .288], [0, .280, .350], [0, .277, .392], [0, .272, .412]])
    TAIL_RT = np.array([0, .06, .16, .30, .45, .60, .74, .86, .94, 1.0]); TAIL_RR = np.array([.075, .100, .118, .128, .131, .131, .128, .122, .112, .100])
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
        if (B[NRT // 2] @ np.array([0, .6, -.4])) < 0: X = -X; B = -B
        ph = np.linspace(0, 2 * PI, NST + 1)
        rings = []; norms = []
        for k in range(NRT):
            rx, rb = R[k] * 1.04, R[k] * 1.0
            pts = P[k] + X[k] * (rx * np.sin(ph))[:, None] - B[k] * (rb * np.cos(ph))[:, None]
            nn = unit(X[k] * (np.sin(ph) / rx)[:, None] - B[k] * (np.cos(ph) / rb)[:, None])
            rings.append(pts); norms.append(nn)
        CAP = [.40, .78, 1.12, 1.38]                   # the egg's top: rings of a hemisphere on the last ring (round, not pointed)
        for th in CAP:
            rx, rb = R[-1] * 1.04 * math.cos(th), R[-1] * math.cos(th); c_ = P[-1] + T[-1] * R[-1] * math.sin(th)
            pts = c_ + X[-1] * (rx * np.sin(ph))[:, None] - B[-1] * (rb * np.cos(ph))[:, None]
            nn = unit((X[-1] * (np.sin(ph) / 1.04)[:, None] - B[-1] * np.cos(ph)[:, None]) * math.cos(th) + T[-1] * math.sin(th))
            rings.append(pts); norms.append(nn)
        NRC = NRT + len(CAP)
        G = np.array(rings); NG = np.array(norms)
        dK = np.gradient(G, axis=0); dS = np.gradient(G, axis=1); NT = unit(np.cross(dS, dK))
        NT = np.where(((NT * NG).sum(-1) < 0)[..., None], -NT, NT); NT[0] = NG[0]; NT[NRT - 1:] = NG[NRT - 1:]
        V = list(G.reshape(-1, 3)); NN = list(NT.reshape(-1, 3))
        UU, VV = np.meshgrid(ph / (2 * PI), np.concatenate([tk, np.ones(len(CAP))])); UVl = list(np.stack([UU.reshape(-1), VV.reshape(-1)], -1))
        F = grid_faces(NRC, NST + 1, wrap=False)
        tip = P[-1] + T[-1] * R[-1]; it = len(V); V.append(tip); NN.append(T[-1]); UVl.append(np.array([.5, 1.]))
        last = (NRC - 1) * (NST + 1)
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
        'shirt': ['shirt'], 'collar': ['collar'], 'scarf': ['scarf'], 'shorts': ['shorts'], 'sleeve_L': ['sleeve.L', 'sleeve_cuff.L'],
        'paw_L': ['mitten_paw.L'], 'paw_R': ['mitten_paw.R'], 'legs': ['fur_leg'],
        'foot_L': ['fur_foot.L'], 'tail': ['tail'], 'lash_L': ['lash.L']}.items() if len(_vs(v))}}
    BODY_MEAS['arm_angle_from_vertical_deg'] = ARM_DEG
    BODY_PIVOTS = {'arm.L': tuple(ARM['L']['shoulder']), 'arm.R': tuple(ARM['R']['shoulder']), 'sleeve.L': tuple(ARM['L']['shoulder']),
                   'sleeve.R': tuple(ARM['R']['shoulder']), 'body': (0, 0, 0), 'shorts': (0, RCY, SZ[0]), 'collar': (0, RCY, .50),
                   'tail': tuple(TAIL_ROOT), 'scarf': tuple(KN_C)}
    def POST_JOIN():
        joints = {'units': 'metres', 'coordinate_system': 'Blender Z-up, front -Y; character left is +X'}
        joints.update({'hips': [0, RCY, .272], 'spine': [0, RCY, .370], 'chest': [0, RCY - .004, .450], 'neck': [0, RCY - .004, .528]})
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
        joints['scarf'] = LOG['scarf']
        joints['collar'] = LOG['collar']
        joints['shorts'] = SHORTS
        joints['notes'] = ['Phase 1: no rig, weights or animations. Same keys as the Toybox heroes / Kitsune / Kazemaru / Kaede joints.json.',
                           'head = the head-ball centre (the radial origin), not the nod pivot; head_base = a suggested nod pivot at the base of the skull.',
                           'Head skin = zero surface of one smooth implicit field (skull + cheek mass + cheek tufts + muzzle + chin + nose), analytic normals; no eye sockets.',
                           'Mouth: a sculpted "U" smile groove (closed) with 5 loops round it; the skin is cut along the parting (see mouth).',
                           'Eyelid holes ringed by 6 loops each, the rim rolled in behind separate lens eyeballs; 5 loops round the nose.',
                           'Lashes: Kaito_lash_L / _R, thick rolls on the skin over each opening with the wing (origin = the eye centre): weight 100% to lidU.',
                           'Ears: separate pieces (Kaito_ear_L / _R), 35 bend rows from the root (in the skull) to the tip; pivot = ears.base.',
                           'Collar (Kaito_collar) and scarf (Kaito_scarf: the knot and two ends, 14 rings each): weight to chest / neck.',
                           'Tail: a separate piece (Kaito_tail), 28 bend rings from the root (in the shorts) to the tip; pivot = tailRoot; chain = tail.',
                           'Sleeves (Kaito_sleeve_L/_R, with their cuffs): separate shells with 11 rings; the shorts (Kaito_shorts) 11 rings a leg.']
        with open(os.path.join(ROOT, 'joints.json'), 'w', encoding='utf-8') as f: json.dump(joints, f, indent=2)
