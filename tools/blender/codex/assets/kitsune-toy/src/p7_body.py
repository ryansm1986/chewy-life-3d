
CHARTS['torso'] = (1536, 448, 512, 448); CHARTS['bellc'] = (1792, 320, 128, 128)
BODY_PIVOTS = {}; BODY_MEAS = {}; POST_JOIN = None; TAIL = {}
if not HEAD_ONLY:
    # ============================================================== BODY AND KIMONO (metres; body axis x = 0, y = 0; sheet front 2.806 mm / px)
    RCY = 0.0
    def kim_uv(N, tone=0., occ=0., hi=.26, lo=.20): return mix_uv('kimmix', sval(N, hi=hi, lo=lo, occ=occ), tone)
    def fur_tone_uv(N, tone=0., occ=0., hi=.22, lo=.20): return fur_uv(sval(N, hi=hi, lo=lo, occ=occ), tone)
    print('BODY_STEP kimono top', flush=True)
    # ---------------------------------------------------------------- the kimono top: from inside the sash up under the head
    # (sheet front: the waist inside the sash 0.37 m wide; the shoulders slope under the head; the chin at z 0.612)
    TZ = np.array([.355, .400, .450, .500, .540, .575, .612])
    TAX = np.array([.176, .178, .182, .184, .176, .154, .116])
    TAY = np.array([.148, .150, .154, .154, .148, .130, .098])
    tax_f = natspline(TZ, TAX); tay_f = natspline(TZ, TAY); TP = 2.3
    def torso_raw(a, z):
        a = np.asarray(a, float); z = np.asarray(z, float)
        return np.stack([tax_f(z) * spow(np.sin(a), 2 / TP), RCY - tay_f(z) * spow(np.cos(a), 2 / TP), z + 0 * a], -1)
    def torso_n(a, z, e=1e-4):
        da = torso_raw(np.asarray(a) + e, z) - torso_raw(np.asarray(a) - e, z)
        dz = torso_raw(a, np.asarray(z) + e) - torso_raw(a, np.asarray(z) - e)
        n = unit(np.cross(dz, da)); c = torso_raw(a, z) - np.stack([0 * np.asarray(a), RCY + 0 * np.asarray(a), np.asarray(z) * 0 + .48], -1)
        return np.where(((n * c).sum(-1) < 0)[..., None], -n, n)
    def torso_pt(a, z, off=0.): return torso_raw(a, z) + torso_n(a, z) * np.asarray(off, float)[..., None]
    def torso_a_of_x(x, z):
        s_ = np.clip(np.asarray(x, float) / tax_f(z), -.999, .999); return np.arcsin(spow(s_, TP / 2))
    # the crossed collar: the V from the neck (half-width 0.084 m at z 0.600) down to the crossing at z 0.478 (just above the sash)
    ZX = .478; ZN = .600; VHW = .084
    def band_x(z, s): return s * VHW * np.clip((z - ZX) / (ZN - ZX), 0, 1)
    def torso_uv_of(a, z):                  # the torso chart: u = angle a in [-pi, pi] (the front, a = 0, at u 0.5; the seam at the back)
        x0, y0, w, h = CHARTS['torso']; u = (np.asarray(a) + PI) / (2 * PI)
        v = (np.asarray(z) - TZ[0]) / (TZ[-1] - TZ[0])
        return np.stack([(x0 + 6 + u * (w - 12)) / 2048, (y0 + 6 + v * (h - 12)) / 2048], -1)
    NA_T, NZ_T = 48, 12
    zt_ = np.linspace(TZ[0], TZ[-1], NZ_T); at_ = np.linspace(0, 2 * PI, NA_T + 1)          # a seam column at the back (a = pi)
    at_ = at_ + PI
    AA, ZZ = np.meshgrid(at_, zt_); Pt_ = torso_raw(AA, ZZ); Nt_ = torso_n(AA, ZZ)
    make_obj('kimono_top', Pt_.reshape(-1, 3), grid_faces(NZ_T, NA_T + 1, wrap=False), torso_uv_of(AA.reshape(-1) - 2 * PI, ZZ.reshape(-1)), 'body',
             N=Nt_.reshape(-1, 3))
    for s, tag in ((1, 'L'), (-1, 'R')):       # her left band lies over her right one
        zs = np.linspace(ZN, ZX + .002, 10)
        front_pts = [torso_pt(np.array([torso_a_of_x(band_x(z_, s), z_)]), np.array([z_]), .008 + .004 * (s > 0))[0] for z_ in zs]
        back_pts = [torso_pt(np.array([s * a_]), np.array([.606]), .007)[0] for a_ in (PI * .92, PI * .70, PI * .50, PI * .30)]
        path = cpath(back_pts + front_pts, 26)
        nrm = torso_n(np.array([math.atan2(p_[0], -(p_[1] - RCY)) for p_ in path]), np.clip(path[:, 2], TZ[0], TZ[-1]))
        sweep('collar.' + tag, path, lambda k: (.0085, .0150), 'body', ramp_sw('white', hi=.22, add=.02 + .03 * (s > 0)), sides=8,
              normals=nrm, p=.75, cap0=False, cap1=True)

    print('BODY_STEP sash and bell', flush=True)
    # ---------------------------------------------------------------- the sash (sheet z 0.376 .. 0.471, 0.387 m wide) and the gold bell
    OBI_Z0, OBI_Z1 = .376, .471; OBI_ZC = (OBI_Z0 + OBI_Z1) / 2; OBI_H = OBI_Z1 - OBI_Z0
    NAS = 40; a_s = np.linspace(0, 2 * PI, NAS, endpoint=False)
    def waist(a, off):
        return np.stack([(tax_f(OBI_ZC) + off) * spow(np.sin(a), 2 / TP), RCY - (tay_f(OBI_ZC) + off) * spow(np.cos(a), 2 / TP), np.full(len(a), OBI_ZC)], -1)
    Pb = waist(a_s, .013)
    Nb = unit(np.stack([Pb[:, 0] / (tax_f(OBI_ZC) + .013) ** 2, (Pb[:, 1] - RCY) / (tay_f(OBI_ZC) + .013) ** 2, np.zeros(NAS)], -1))
    ab8 = np.linspace(0, 2 * PI, 12, endpoint=False)
    ring_tube('sash', Pb, lambda k: np.stack([.0145 * spow(np.cos(ab8), .45), OBI_H / 2 * spow(np.sin(ab8), .32)], -1), 'body',
              lambda NN, tt, uu, V: ramp_uv('sash', sval(NN, hi=.26, lo=.20)), Nb, sides=12)
    SASH_FRONT_Y = float(Pb[np.argmin(np.abs(a_s - 0))][1] - .0145)       # the sash's front face at x = 0 (a = 0 points to -y)
    BELL_R = .055; BELL_C = np.array([0, SASH_FRONT_Y - BELL_R + .028, .380])
    BELL_RIDGE_Z = .010
    def bell_sdf(p):
        q = p - BELL_C
        d = np.linalg.norm(q * np.array([1, 1, 1.04]), axis=1) - BELL_R
        ridge = np.sqrt((np.sqrt(q[:, 0] ** 2 + q[:, 1] ** 2) - BELL_R * .975) ** 2 + ((q[:, 2] - BELL_RIDGE_Z) / 1.5) ** 2) - .0050
        return smin(d, ridge, .004)
    def bell_uv(NN, V):            # the bell chart: a front projection (the keyhole slot and the ridge are painted there)
        q = (V - BELL_C) / (BELL_R * 1.12); return au('bellc', .5 + .5 * q[:, 0], .5 + .5 * q[:, 2])
    star_mesh('bell', bell_sdf, BELL_C, 'body', bell_uv, nth=18, nph=30, tmax=.10, axis=(0, -1., 0), ref=(0, 0, 1.))
    # the cord loop on top, tied into the sash
    lobe('bell_knot', BELL_C + np.array([0, .010, BELL_R + .010]), np.array([.018, .016, .020]), [0, -1., 0], 'body', ramp='cord', n=3, squash=.05)
    LOG['bell'] = {'centre_m': [round(float(c), 4) for c in BELL_C], 'front_y_m': round(float(BELL_C[1] - BELL_R), 4), 'radius_m': BELL_R}

    print('BODY_STEP hakama', flush=True)
    # ---------------------------------------------------------------- the pleated hakama: under the sash to the hem (z 0.118), flaring to 0.60 m
    # wide (sheet front: 0.46 m at z 0.34, 0.54 at 0.26, 0.60 at 0.17) and 0.47 m deep (sheet side); 14 big soft knife pleats
    SKZ0, SKZ1 = .392, .118; SKT = (tax_f(.392) + .004, tay_f(.392) + .004); SKH = (.300, .234, .228); SKF = .85; SKP = 2.25
    N_PLEAT = 14
    def skirt_g(t): return np.clip(np.asarray(t, float), 0, 1) ** SKF
    def pleat(a, t):
        s_ = (np.asarray(a) * N_PLEAT / (2 * PI) + .5) % 1.
        prof = smooth(0., .80, s_) - smooth(.80, 1., s_)              # a slow rise then a quick soft fold back
        return (.0035 + .0125 * smooth(.05, 1., t)) * (prof - .5)
    def skirt_geom(a, t, pl=True):
        g = skirt_g(t); ax_ = SKT[0] + (SKH[0] - SKT[0]) * g
        ay_ = np.where(np.cos(a) > 0, SKT[1] + (SKH[1] - SKT[1]) * g, SKT[1] + (SKH[2] - SKT[1]) * g)
        P = np.stack([ax_ * spow(np.sin(a), 2 / SKP), RCY - ay_ * spow(np.cos(a), 2 / SKP), SKZ0 + (SKZ1 - SKZ0) * t + 0 * a], -1)
        if pl:
            n2 = unit(np.stack([P[..., 0] / ax_ ** 2, (P[..., 1] - RCY) / ay_ ** 2, 0 * P[..., 0]], -1))
            P = P + n2 * pleat(a, t)[..., None]
        return P
    def skirt_n(a, t, e=1e-4):
        P0 = skirt_geom(a, t); Pa = skirt_geom(a + e, t) - skirt_geom(a - e, t); Ptt = skirt_geom(a, np.minimum(t + e, 1.)) - skirt_geom(a, np.maximum(t - e, 0.))
        n = unit(np.cross(Pa, Ptt)); ctr = np.stack([0 * P0[..., 0], RCY + 0 * P0[..., 0], P0[..., 2]], -1)
        return np.where(((n * (P0 - ctr)).sum(-1) < 0)[..., None], -n, n)
    NA_S, NZ_S = 14 * 7, 10
    a_k = np.linspace(0, 2 * PI, NA_S, endpoint=False); t_k = np.linspace(0, 1, NZ_S) ** 1.1
    AK, TK = np.meshgrid(a_k, t_k); Gs = skirt_geom(AK, TK); Ns = skirt_n(AK, TK)
    Vs = Gs.reshape(-1, 3); NNs = Ns.reshape(-1, 3); Fs = grid_faces(NZ_S, NA_S, wrap=True)
    s_k = (AK * N_PLEAT / (2 * PI) + .5) % 1.
    fold = .55 * np.exp(-((s_k - .82) / .07) ** 2) * smooth(.10, .80, TK)           # a soft shade in each fold
    UVo = mix_uv('skmix', sval(NNs, hi=.24, lo=.20, occ=.0).reshape(-1) - .18 * fold.reshape(-1), .0 + .25 * smooth(.0, .30, s_k).reshape(-1) * (1 - fold.reshape(-1)))
    UVi = ramp_uv('lining', sval(-NNs, hi=.10, lo=.10) - .10)
    plain = np.zeros(len(Vs), bool); plain[:NA_S] = True
    Vt, Ft, UVt, Nt = thicken(Vs, Fs, NNs, .016, UVo, UVi, UVo, rim=3, plain=plain, split_front=True)
    make_obj('hakama', Vt, Ft, UVt, 'skirt', N=Nt)

    print('BODY_STEP sleeves and arms', flush=True)
    # ---------------------------------------------------------------- short wide kimono sleeves (sheet front: the top from the shoulder at z 0.58
    # out to the opening at x 0.37, z 0.48; the bottom hangs to z 0.335 at x 0.29; the opening slants, facing out and down)
    ARM = {}; ARM_DEG = 38.
    SL_X0, SL_X1, SL_P, SL_SHEAR = .120, .292, 2.6, .30; GATHER = .92; GATHER_R = .060
    def sleeve_dims(t):
        t = np.asarray(t, float)
        zt = .590 - .108 * t ** 1.05
        zb = .455 - .118 * t ** .75
        hd = .086 + .030 * t ** .8
        return zt, zb, hd
    for s, tag in ((1, 'L'), (-1, 'R')):
        th = math.radians(ARM_DEG); ad = unit(np.array([s * math.sin(th), -.04, -math.cos(th)]))
        SH = np.array([s * .160, RCY, .535])
        NR = 12; ts = np.linspace(0, 1, NR) ** .9; NS = 28; sa = np.linspace(0, 2 * PI, NS, endpoint=False)
        rings = []
        for t in ts:
            zt, zb, hd = sleeve_dims(t); zc = (zt + zb) / 2; hh = (zt - zb) / 2
            x_ = SL_X0 + (SL_X1 - SL_X0) * t; yc = RCY - .010 - .008 * t
            Y = yc + hd * spow(np.cos(sa), 2 / SL_P); Zr = zc + hh * spow(np.sin(sa), 2 / SL_P)
            X = s * (x_ + SL_SHEAR * (Zr - zc) * smooth(.45, 1., t) * 1.0)
            # round 2: a closed puff: the end gathers round the forearm (an ellipse round the arm axis in the ring's plane)
            g_ = smooth(.55, 1., t) * GATHER
            ta = (abs(x_) - abs(SH[0])) / max(abs(ad[0]), 1e-6); AC = SH + ad * ta
            Yg = AC[1] + GATHER_R * np.cos(sa); Zg = AC[2] + GATHER_R / abs(ad[0]) * .80 * np.sin(sa)
            X = X * (1 - g_) + s * x_ * g_; Y = Y * (1 - g_) + Yg * g_; Zr = Zr * (1 - g_) + Zg * g_
            rings.append(np.stack([X, Y, Zr], -1))
        G = np.array(rings)
        dS = np.roll(G, -1, 1) - np.roll(G, 1, 1); dK = np.gradient(G, axis=0)
        NG = unit(np.cross(dK, dS)); ctr = G.mean(1, keepdims=True)
        NG = np.where(((NG * (G - ctr)).sum(-1) < 0)[..., None], -NG, NG)
        V = G.reshape(-1, 3); NN = NG.reshape(-1, 3); nr_, ns_ = G.shape[:2]
        low = np.tile(np.clip(-np.sin(sa), 0, 1), nr_)
        tone = np.repeat(np.linspace(.02, .16, nr_), ns_) * (1 - .6 * low) + .14 * np.exp(-((np.tile(np.cos(sa), nr_) - .2) / .35) ** 2) * np.repeat(smooth(.2, .9, ts), ns_)
        UVo = kim_uv(NN, tone); UVi = ramp_uv('lining', sval(-NN, hi=.10, lo=.10) - .04)
        plain = np.zeros(len(V), bool); plain[:ns_] = True
        Vt, Ft, UVt, Nt = thicken(V, grid_faces(nr_, ns_, wrap=True), NN, .015, UVo, UVi, UVo, rim=3, plain=plain, split_front=True)
        make_obj('sleeve.' + tag, Vt, Ft, UVt, 'sleeve.' + tag, N=Nt)
        def along(t0, SH=SH, ad=ad): return SH + ad * t0
        EL = along(.120); WR = along(.200); PC = along(.270)
        fwd = unit(np.array([0, -1., 0]) - ad * (ad @ np.array([0, -1., 0])))
        def arm_sdf(p, SH=SH, WR=WR, ad=ad): return sd_capsule(p, SH + ad * .04, WR, (.050, .046))
        tsa = np.linspace(.05, .200, 6)
        ring_stack('fur_arm.' + tag, arm_sdf, SH[None] + ad[None] * tsa[:, None], np.tile(ad, (len(tsa), 1)), 'arm.' + tag,
                   lambda NN, V: fur_uv(sval(NN, hi=.20, lo=.20), .0), sides=14, tmax=.14, ref=fwd, pole_start=False, pole_end=False)
        lat = unit(np.cross(ad, fwd)) * s
        paw_axes = np.array([ad, fwd, lat])
        thumb = PC + fwd * .052 - lat * .012 - ad * .020
        def paw_parts(p, WR=WR, PC=PC, paw_axes=paw_axes, thumb=thumb, ad=ad):
            d_w = sd_capsule(p, WR - ad * .025, PC - ad * .012, (.046, .052))
            d_paw = sd_ell(p, PC, paw_axes, (.078, .071, .066))
            d_t = sd_ell(p, thumb, paw_axes, (.032, .026, .026))
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
    # ---------------------------------------------------------------- short legs and big round orange feet (sheet front: x +-0.19, 0.20 m wide,
    # 0.135 m tall; side: about 0.27 m long), two toe creases each
    LEG = {}
    for s, tag in ((1, 'L'), (-1, 'R')):
        HP = np.array([s * .095, RCY, .300]); AN = np.array([s * .165, RCY - .012, .092])
        def leg_sdf(p, HP=HP, AN=AN): return sd_capsule(p, HP, AN, (.060, .052))
        zs = np.linspace(.250, .090, 5)
        cen = np.array([HP + (AN - HP) * ((z_ - HP[2]) / (AN[2] - HP[2])) for z_ in zs])
        ring_stack('fur_leg.' + tag, leg_sdf, cen, np.tile(unit(AN - HP), (len(zs), 1)), 'body',
                   lambda NN, V: fur_uv(sval(NN, hi=.20, lo=.20, occ=.12 * smooth(.14, .24, V[:, 2])), .0), sides=14, tmax=.16, ref=[0, -1., 0],
                   pole_start=False)
        FC = np.array([s * .190, -.036, .064]); FAX = rot([0, 0, 1], s * math.radians(6)).T
        toes = [FC + (np.array([o * .052, -.098, .004]) @ FAX) for o in (-1, 0, 1)]
        def foot_parts(p, FC=FC, FAX=FAX, toes=toes, AN=AN):
            d_main = sd_ell(p, FC + np.array([0, .010, 0]), FAX, (.100, .128, .066))
            d_ank = sd_capsule(p, AN + np.array([0, 0, .020]), AN + np.array([0, -.010, -.026]), .055)
            d_t = [sd_ell(p, t, FAX, (.040, .040, .048)) for t in toes]
            return d_main, d_ank, d_t
        def foot_sdf(p, foot_parts=foot_parts):
            d_main, d_ank, d_t = foot_parts(p)
            d = smin(d_main, d_ank, .022); tt = smin(smin(d_t[0], d_t[1], .006), d_t[2], .006)
            d = smin(d, tt, .014)
            return smax(d, -(p[:, 2] - .002), .008)
        def foot_uv(NN, V, foot_parts=foot_parts):
            d_main, d_ank, d_t = foot_parts(V)
            cr = crease(d_t[0], d_t[1], .006) * .45 + crease(d_t[1], d_t[2], .006) * .45
            return fur_uv(sval(NN, occ=1.1 * cr + .10 * smooth(.015, .0, V[:, 2]), hi=.20, lo=.18), .0)
        star_mesh('fur_foot.' + tag, foot_sdf, FC + np.array([0, -.008, .018]), 'body', foot_uv, nth=13, nph=24, tmax=.22)
        LEG[tag] = {'hip': HP.tolist(), 'knee': (HP + (AN - HP) * .55).tolist(), 'ankle': AN.tolist(), 'toe': (FC + np.array([0, -.120, -.010]) @ FAX).tolist()}

    print('BODY_STEP tail', flush=True)
    # ---------------------------------------------------------------- the big fluffy tail: a smooth teardrop plume, a separate piece with bend rings
    # (sheet side: 0.18 .. 0.53 m behind the body axis, z 0.13 .. 0.63, the tip up and back; back view: 0.32 m wide, upright, centred;
    # the white tip covers its upper part with a soft flame edge). Painted in its own chart (u = around, v = along).
    TAIL_CP = np.array([[0, .140, .300], [0, .215, .270], [0, .300, .274], [0, .385, .320], [0, .455, .405], [0, .505, .505], [0, .530, .585], [0, .535, .632]])
    TAIL_CP = np.array([0, .140, .300]) + (TAIL_CP - np.array([0, .140, .300])) * .85        # round 2: 15% smaller (the sheet's reach)
    TAIL_RT = np.array([0, .06, .16, .28, .42, .56, .70, .82, .92, 1.0]); TAIL_RR = np.array([.050, .085, .140, .170, .172, .162, .140, .114, .084, .048]) * .85
    def build_tail():
        path = cpath(TAIL_CP, 200); seg = np.linalg.norm(np.diff(path, axis=0), axis=1); s_ = np.concatenate([[0], np.cumsum(seg)]); s_ /= s_[-1]
        NRT, NST = 34, 26
        tk = np.linspace(0, 1, NRT) ** .95
        P = np.stack([np.interp(tk, s_, path[:, i]) for i in range(3)], -1); R = np.interp(tk, TAIL_RT, TAIL_RR)
        T = unit(np.gradient(P, axis=0)); X = np.tile([1., 0, 0], (NRT, 1)); B = unit(np.cross(T, X))     # +B: the outer (back / lower) side of the curve
        ph = np.linspace(0, 2 * PI, NST + 1)                 # phi 0 = -B (the inner side, toward the body), so the UV seam hides there
        rings = []; norms = []
        for k in range(NRT):
            rx, rb = R[k] * 1.07, R[k] * .96
            pts = P[k] + X[k] * (rx * np.sin(ph))[:, None] - B[k] * (rb * np.cos(ph))[:, None]
            nn = unit(X[k] * (np.sin(ph) / rx)[:, None] - B[k] * (np.cos(ph) / rb)[:, None])
            rings.append(pts); norms.append(nn)
        G = np.array(rings); NG = np.array(norms)
        # true surface normals from the grid (the radius changes along the path)
        dK = np.gradient(G, axis=0); dS = np.gradient(G, axis=1); NT = unit(np.cross(dS, dK))
        NT = np.where(((NT * NG).sum(-1) < 0)[..., None], -NT, NT); NT[0] = NG[0]
        V = list(G.reshape(-1, 3)); NN = list(NT.reshape(-1, 3))
        UU, VV = np.meshgrid(ph / (2 * PI), tk); UVl = list(np.stack([UU.reshape(-1), VV.reshape(-1)], -1))
        F = grid_faces(NRT, NST + 1, wrap=False)
        # close the tip with a soft pole a little past the last ring, and the root (inside the hakama) with a flat pole
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
        'kimono_top': ['kimono_top'], 'collar': ['collar'], 'sash': ['sash'], 'bell': ['bell'], 'hakama': ['hakama'],
        'sleeve_L': ['sleeve.L'], 'paw_L': ['mitten_paw.L'], 'paw_R': ['mitten_paw.R'], 'legs': ['fur_leg'], 'foot_L': ['fur_foot.L'], 'tail': ['tail']}.items()}}
    BODY_MEAS['arm_angle_from_vertical_deg'] = ARM_DEG
    BODY_PIVOTS = {'arm.L': tuple(ARM['L']['shoulder']), 'arm.R': tuple(ARM['R']['shoulder']), 'sleeve.L': tuple(ARM['L']['shoulder']),
                   'sleeve.R': tuple(ARM['R']['shoulder']), 'body': (0, 0, 0), 'skirt': (0, RCY, OBI_Z0), 'tail': tuple(TAIL_ROOT)}
    def POST_JOIN():
        joints = {'units': 'metres', 'coordinate_system': 'Blender Z-up, front -Y; character left is +X'}
        joints.update({'hips': [0, RCY, .330], 'spine': [0, RCY, .420], 'chest': [0, RCY - .004, .500], 'neck': [0, RCY - .004, .585]})
        joints['head'] = [float(v) for v in O]
        joints['head_base'] = [0, float(HY + .02 * W), float(CHIN + .02 * W)]
        joints['jaw_pivot'] = [0, float(HY + NOSE_TIP_L * W + .20 * W), float(CHIN + .10 * W)]
        joints['eyes'] = {'R': eye_centers['R'], 'L': eye_centers['L']}
        joints['ears'] = {t: {k: [float(v) for v in ear_info[t][k]] for k in ('base', 'mid', 'tip')} for t in ('R', 'L')}
        joints['arms'] = {t: {k: ARM[t][k] for k in ('shoulder', 'elbow', 'wrist')} for t in ARM}
        joints['legs'] = LEG
        joints['palm_R'] = ARM['R']['palm']; joints['palm_L'] = ARM['L']['palm']
        P = TAIL['P']; idx = [0, 8, 15, 22, 28, len(P) - 1]
        joints['tail'] = [[round(float(c), 4) for c in P[i]] for i in idx]
        joints['tailRoot'] = [float(v) for v in TAIL_ROOT]
        joints['mouth'] = MOUTH_INFO
        joints['bell'] = LOG['bell']
        joints['notes'] = ['Phase 1: no rig, weights or animations. Same keys as the Toybox heroes / Tamamo joints.json.',
                           'head = the head-ball centre (the radial origin), not the nod pivot; head_base = a suggested nod pivot at the base of the skull.',
                           'Head skin = zero surface of one smooth implicit field (skull + cheek mass + tufts + muzzle + chin + nose), analytic normals; no eye sockets.',
                           'Mouth: a sculpted "w" smile groove (closed) with 5 loops round it; the skin is cut along the parting (see mouth).',
                           'Eyelid holes ringed by 6 loops each, the rim rolled 4.5 mm in behind separate lens eyeballs; 5 loops round the nose.',
                           'Ears: separate pieces (Kitsune_ear_L / _R), 26 bend rows from the root (in the skull) to the tip; pivot = ears.base.',
                           'Tail: a separate piece (Kitsune_tail), 34 bend rings from the root (inside the hakama) to the tip; pivot = tailRoot; chain = tail.',
                           'Sleeves (Kitsune_sleeve_L/_R): separate shells with 12 bend rings; the hakama (Kitsune_skirt) has 11 rings.']
        with open(os.path.join(ROOT, 'joints.json'), 'w', encoding='utf-8') as f: json.dump(joints, f, indent=2)
