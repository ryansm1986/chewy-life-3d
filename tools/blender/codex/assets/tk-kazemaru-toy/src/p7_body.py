
CHARTS['torso'] = (1536, 448, 512, 448)
BODY_PIVOTS = {}; BODY_MEAS = {}; POST_JOIN = None; TAIL = {}; BAND = {}
print('STEP headband', flush=True)
# ============================================================== THE RED HEADBAND (metres): a thick soft ring hugging the head, tilted
# (sheet: the centre line 1.00 m at the front, 0.93 m at the back; 0.066 m tall, about 0.022 m thick), a knot at the back and two short,
# thick, rounded tails hanging down and back, splayed into a V (back view: down to z 0.76, x +-0.03 .. +-0.12; side: 0.13 m behind the head)
BAND_ZF, BAND_ZB, BAND_H, BAND_T = 1.003, .928, .066, .021
def band_zc(phi): return BAND_ZF + (BAND_ZB - BAND_ZF) * (1 - np.cos(phi)) / 2
def band_field(p): return np.minimum(head_sdf(p), ears_sdf(p))          # round 3: the band wraps over the ear roots (no notch)
def head_ring_pt(phi, z, f=None):
    """the head surface (and a little more where an ear root sits) along the horizontal ray at angle phi (0 = front) and height z"""
    phi = np.atleast_1d(np.asarray(phi, float)); z = np.broadcast_to(np.asarray(z, float), phi.shape)
    D = np.stack([np.sin(phi), -np.cos(phi), np.zeros_like(phi)], -1)
    C = np.stack([np.zeros_like(phi), np.full_like(phi, HY), z], -1)
    name_hint[0] = 'band'
    return ray_outer(f or head_sdf, C, D, .60, steps=120, it=28)
NBP = 60; NBS = 12
phis = np.linspace(0, 2 * PI, NBP, endpoint=False)
sa_b = np.linspace(0, 2 * PI, NBS, endpoint=False)
# the section: a soft rounded rectangle, dn (outward from the surface) in [-0.004, BAND_T], db (up along the surface) in [-H/2, H/2]
sec_db = BAND_H / 2 * spow(np.sin(sa_b), .38); sec_dn = (BAND_T + .004) / 2 * spow(np.cos(sa_b), .45) + (BAND_T - .004) / 2
G = np.zeros((NBP, NBS, 3))
for j in range(NBS):
    P = head_ring_pt(phis, band_zc(phis) + sec_db[j]); N = grad(head_sdf, P)
    G[:, j] = P + N * sec_dn[j]
dK = np.roll(G, -1, 0) - np.roll(G, 1, 0); dS = np.roll(G, -1, 1) - np.roll(G, 1, 1)
NG = unit(np.cross(dK, dS)); ctr = np.repeat(G.mean(1, keepdims=True), NBS, 1)
NG = np.where(((NG * (G - ctr)).sum(-1) < 0)[..., None], -NG, NG)
Fb = []
for i in range(NBP):
    for j in range(NBS):
        ii = (i + 1) % NBP; jj = (j + 1) % NBS; Fb.append((i * NBS + j, i * NBS + jj, ii * NBS + jj, ii * NBS + j))
VB = G.reshape(-1, 3); NB_ = NG.reshape(-1, 3)
make_obj('headband', VB, Fb, ramp_uv('band', sval(NB_, hi=.26, lo=.22)), 'band', N=NB_)
BACK = G[NBP // 2]; BACK_OUT = float(BACK[:, 1].max()); BACK_Z = float(band_zc(PI))
# the knot: a soft squashed lump on the band's back, a little low
KNOT_C = np.array([0, BACK_OUT - .010, BACK_Z - .010])
lobe('band_knot', KNOT_C, np.array([.036, .044, .038]), [0, 1., 0], 'band', ramp='band', n=4, squash=.05)
for s in (-1, 1):                 # the knot's two short soft loops either side
    lobe('band_loop.%s' % ('L' if s > 0 else 'R'), KNOT_C + np.array([s * .040, -.004, .004]), np.array([.022, .030, .026]), [s * .3, 1., 0], 'band', ramp='band', n=3, squash=.05)
# the two tails: thick flat rounded strips from under the knot, down and back, splayed outward
for s in (-1, 1):
    cp = [KNOT_C + np.array([s * .012, .004, -.012]), KNOT_C + np.array([s * .036, .030, -.058]),
          KNOT_C + np.array([s * .058, .058, -.104]), KNOT_C + np.array([s * .070, .074, -.132])]
    path = cpath(cp, 14)
    nrm = np.tile(np.array([0, 1., .35]), (len(path), 1))
    sweep('band_tail.%s' % ('L' if s > 0 else 'R'), path, lambda k: (.0220 + .0030 * k / 13, .034 + .008 * min(k, 8) / 8), 'band',
          ramp_sw("band", hi=.26), sides=10, normals=nrm, p=.70, cap0=True, cap1=True)
BAND.update({'front_z_m': BAND_ZF, 'back_z_m': BAND_ZB, 'knot_m': KNOT_C.tolist()})
LOG['band'] = {'front_centre_z_m': BAND_ZF, 'back_centre_z_m': BAND_ZB, 'height_m': BAND_H, 'thickness_m': BAND_T,
               'knot_m': [round(float(c), 3) for c in KNOT_C]}

if not HEAD_ONLY:
    # ============================================================== BODY AND GI (metres; body axis x = 0, y = 0; sheet front 2.657 mm / px)
    RCY = -.008
    def gi_uv(N, tone=0., occ=0., hi=.26, lo=.20): return mix_uv('kimmix', sval(N, hi=hi, lo=lo, occ=occ), tone)
    print('BODY_STEP gi top', flush=True)
    # ---------------------------------------------------------------- the gi top: from inside the belt up under the head
    # (sheet front: 0.44 m across under the sleeves; side: 0.36 m deep at the chest; the collar at z 0.59)
    TZ = np.array([.300, .360, .400, .450, .500, .540, .570, .598])
    TAX = np.array([.222, .226, .220, .214, .202, .182, .152, .112])
    TAY = np.array([.180, .188, .186, .180, .164, .144, .122, .094])
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
    # the white chest V between the lapels: from the neck (half-width 0.078 m at z 0.585) down to its point at z 0.457; the navy lapel
    # bands (0.048 m wide) run from behind the neck down to their crossing at z 0.385, just above the belt (his right over his left)
    ZX = .457; ZN = .585; VHW = .078; LAP_W = .048; ZCROSS = .385
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
    for s, tag in ((-1, 'R'), (1, 'L')):       # his right lapel lies over his left one (the sheet)
        zs = np.linspace(ZN + .010, ZCROSS, 12)
        def lap_x(z, s=s):                     # the band's centre: its inner edge on the white V's edge, crossing the centre line lower down
            return s * (white_hw(z) + LAP_W / 2) - s * (LAP_W / 2 + .010) * smooth(ZX + .02, ZCROSS, z)
        front_pts = [torso_pt(np.array([torso_a_of_x(lap_x(z_), z_)]), np.array([z_]), .007 + .004 * (s < 0))[0] for z_ in zs]
        back_pts = [torso_pt(np.array([s * a_]), np.array([.594]), .009)[0] + np.array([0, 0, .010]) for a_ in (PI * .99, PI * .78, PI * .55, PI * .34)]
        path = cpath(back_pts + front_pts, 24)
        nrm = torso_n(np.array([math.atan2(p_[0], -(p_[1] - RCY)) for p_ in path]), np.clip(path[:, 2], TZ[0], TZ[-1]))
        sweep('lapel.' + tag, path, lambda k: (.0085, LAP_W / 2), 'body', ramp_sw("gi", hi=.24, add=.06 + .03 * (s < 0)), sides=8,
              normals=nrm, p=.70, cap0=False, cap1=True)

    print('BODY_STEP belt', flush=True)
    # ---------------------------------------------------------------- the black belt (sheet z 0.315 .. 0.386, 0.46 m wide), its square knot at
    # the front (0.088 x 0.072 m, standing 0.05 m proud) and two hanging ends (down to z 0.24, splayed)
    OBI_Z0, OBI_Z1 = .315, .388; OBI_ZC = (OBI_Z0 + OBI_Z1) / 2; OBI_H = OBI_Z1 - OBI_Z0
    NAS = 32; a_s = np.linspace(0, 2 * PI, NAS, endpoint=False)
    def waist(a, off):
        return np.stack([(tax_f(OBI_ZC) + off) * spow(np.sin(a), 2 / TP), RCY - (tay_f(OBI_ZC) + off) * spow(np.cos(a), 2 / TP), np.full(len(a), OBI_ZC)], -1)
    BELT_OFF = .022
    Pb = waist(a_s, BELT_OFF)
    Nb = unit(np.stack([Pb[:, 0] / (tax_f(OBI_ZC) + BELT_OFF) ** 2, (Pb[:, 1] - RCY) / (tay_f(OBI_ZC) + BELT_OFF) ** 2, np.zeros(NAS)], -1))
    ab8 = np.linspace(0, 2 * PI, 12, endpoint=False)
    ring_tube('belt', Pb, lambda k: np.stack([.0150 * spow(np.cos(ab8), .45), OBI_H / 2 * spow(np.sin(ab8), .30)], -1), 'body',
              lambda NN, tt, uu, V: ramp_uv('belt', sval(NN, hi=.30, lo=.18)), Nb, sides=12)
    BELT_FRONT_Y = float(Pb[0][1] - .0150)
    KN_C = np.array([0, BELT_FRONT_Y - .012, OBI_ZC + .002])
    def knot_sdf(p):
        q = p - KN_C
        d = sd_box(p, KN_C, np.eye(3), (.050, .030, .040), .024)
        return d
    def knot_uv(NN, V): return ramp_uv('belt', sval(NN, hi=.32, lo=.18) + .04)
    star_mesh("belt_knot", knot_sdf, KN_C, "body", knot_uv, nth=12, nph=20, tmax=.12)
    for s, tag in ((-1, 'R'), (1, 'L')):
        cp = [KN_C + np.array([s * .014, .010, -.014]), KN_C + np.array([s * .034, -.006, -.054]),
              KN_C + np.array([s * .052, -.004, -.090]), KN_C + np.array([s * .062, .004, -.112])]
        path = cpath(cp, 12)
        nrm = np.tile(np.array([0, -1., 0]), (len(path), 1))
        sweep('belt_end.' + tag, path, lambda k: (.0150, .0270), 'body', ramp_sw('belt', hi=.30, add=.02), sides=10, normals=nrm, p=.70)
    LOG['belt'] = {'z_m': [OBI_Z0, OBI_Z1], 'knot_centre_m': [round(float(c), 3) for c in KN_C]}

    print('BODY_STEP gi skirt', flush=True)
    # ---------------------------------------------------------------- the gi below the belt: a flared skirt to the hem (sheet: z 0.205 at the sides,
    # 0.18 at the front; 0.50 m wide under the belt, 0.56 m at the hem; side 0.41 m deep). His right panel lies over his left: its edge
    # runs down at x +0.08 (a soft step) and its hem hangs a little lower.
    GZ0, GZ1 = .345, .190; GT = (tax_f(.345) + .010, tay_f(.345) + .010); GH = (.280, .204, .212); GP = 2.4
    EDGE_X = .080
    def gskirt_geom(a, t):
        g = np.clip(np.asarray(t, float), 0, 1) ** .9; ax_ = GT[0] + (GH[0] - GT[0]) * g
        ay_ = np.where(np.cos(a) > 0, GT[1] + (GH[1] - GT[1]) * g, GT[1] + (GH[2] - GT[1]) * g)
        x = ax_ * spow(np.sin(a), 2 / GP); front = np.cos(a) > 0
        over = front * smooth(-.75, -.35, np.sin(a)) * (1 - smooth(EDGE_X - .010, EDGE_X + .004, x))     # the top panel (his right)
        hem = GZ0 + (GZ1 - GZ0) * t - .022 * front * smooth(.35, .9, np.cos(a)) * t ** 3 - .006 * over * t ** 3
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
    xk = Gs[..., 0]; edge_sh = np.exp(-((xk - EDGE_X - .012) / .010) ** 2) * (np.cos(AK) > 0)          # the shade just past the panel edge
    UVo = gi_uv(NNs, (.04 + .06 * smooth(.0, 1., TK)).reshape(-1), occ=.20 * edge_sh.reshape(-1) + .10 * (1 - smooth(.0, .35, TK)).reshape(-1))
    UVi = ramp_uv('lining', sval(-NNs, hi=.10, lo=.10) - .10)
    plain = np.zeros(len(Vs), bool); plain[:NA_G] = True
    Vt, Ft, UVt, Nt = thicken(Vs, Fs, NNs, .014, UVo, UVi, UVo, rim=3, plain=plain, split_front=True)
    make_obj('gi_skirt', Vt, Ft, UVt, 'gi_skirt', N=Nt)

    print('BODY_STEP hakama', flush=True)
    # ---------------------------------------------------------------- the hakama: two wide trouser legs under the gi (sheet front: 0.58 m across,
    # the legs' hems at z 0.077, the gap between them opening from z 0.138 to +-0.02 m at the hem; side 0.39 m deep), soft pleats
    HK_Z0, HK_Z1 = .265, .077
    def hk_dims(z):
        z = np.asarray(z, float)
        xo = .246 + .046 * smooth(.262, .175, z) - .004 * smooth(.12, .077, z)
        xi = .006 + .016 * smooth(.140, .085, z) ** 1.2
        hy = .172 + .024 * smooth(.262, .175, z)
        return xo, xi, hy
    N_HP = 4
    for s, tag in ((-1, 'R'), (1, 'L')):
        NZH, NAH = 7, 28
        zh = HK_Z0 + (HK_Z1 - HK_Z0) * np.linspace(0, 1, NZH) ** 1.0
        ah = np.linspace(0, 2 * PI, NAH, endpoint=False)
        rings = []
        for z_ in zh:
            xo, xi, hy = hk_dims(z_); xc = (xo + xi) / 2; hx = (xo - xi) / 2
            X = xc + hx * spow(np.sin(ah), 2 / 2.7); Y = RCY + .004 - hy * spow(np.cos(ah), 2 / 2.7)
            # soft pleats on the front and back faces
            pl = (.0035 * smooth(.20, .10, z_) + .0015) * np.sin(ah * 2 * N_HP) * smooth(.30, .70, np.abs(np.cos(ah)))
            rings.append(np.stack([s * X, Y + np.sign(np.cos(ah)) * -pl, np.full(NAH, z_)], -1))
        Gh = np.array(rings)
        dS = np.roll(Gh, -1, 1) - np.roll(Gh, 1, 1); dK = np.gradient(Gh, axis=0)
        NGh = unit(np.cross(dK, dS)); ctr = Gh.mean(1, keepdims=True)
        NGh = np.where(((NGh * (Gh - ctr)).sum(-1) < 0)[..., None], -NGh, NGh)
        Vh = Gh.reshape(-1, 3); NNh = NGh.reshape(-1, 3)
        crs_ = np.tile(np.exp(-((np.sin(ah) + 1) / .30) ** 2), NZH)                      # the inner side, toward the other leg
        tz = np.repeat(np.linspace(0, 1, NZH), NAH)
        UVo = mix_uv('skmix', sval(NNh, hi=.22, lo=.20, occ=.22 * crs_ + .12 * (1 - smooth(.0, .35, tz))).reshape(-1), .10 + .10 * smooth(.3, 1., tz))
        UVi = ramp_uv('hklining', sval(-NNh, hi=.10, lo=.10) - .10)
        plain = np.zeros(len(Vh), bool); plain[:NAH] = True
        Vt, Ft, UVt, Nt = thicken(Vh, grid_faces(NZH, NAH, wrap=True), NNh, .016, UVo, UVi, UVo, rim=4, plain=plain, split_front=True)
        make_obj('hakama.' + tag, Vt, Ft, UVt, 'hakama', N=Nt)

    print('BODY_STEP sleeves and arms', flush=True)
    # ---------------------------------------------------------------- short wide gi sleeves (sheet front: the top runs from the shoulder at
    # z 0.585 out to the corner at (0.346, 0.478); the opening is the slanted edge from that corner to the armpit at (0.208, 0.377), square
    # to the arm, which hangs 31 deg out from vertical). The sleeve is a loft of rings from inside the torso to that opening, slightly gathered.
    ARM = {}; ARM_DEG = 31.
    for s, tag in ((1, 'L'), (-1, 'R')):
        th = math.radians(ARM_DEG); ad = unit(np.array([s * math.sin(th), .02, -math.cos(th)]))
        u_open = unit(np.array([s * math.cos(th), 0, math.sin(th)]))         # the opening's long axis (up and out)
        OC = np.array([s * .280, RCY + .030, .424]); OHU, OHY = .090, .108   # the opening ring: centre, half-length, half-depth
        RC = np.array([s * .110, RCY + .010, .505]); RHU, RHY = .090, .132   # the root ring inside the torso (in the plane x = const)
        NR = 11; ts = np.linspace(0, 1, NR); NS = 22; sa = np.linspace(0, 2 * PI, NS, endpoint=False)
        rings = []
        for t in ts:
            n0 = np.array([s * 1., 0, 0]); n = unit(n0 * (1 - smooth(.15, 1., t)) + ad * smooth(.15, 1., t))
            uu = unit(np.cross(n, [0, 1., 0]) * s); uu = uu if uu[2] > 0 else -uu
            vv = np.array([0, 1., 0])
            c = RC + (OC - RC) * t + np.array([0, 0, .040]) * math.sin(PI * t) * (1 - t) + u_open * .010 * math.sin(PI * t)
            hu = RHU + (OHU - RHU) * t + .012 * math.sin(PI * t); hy = RHY + (OHY - RHY) * t + .010 * math.sin(PI * t)
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
        SH = np.array([s * .165, RCY + .020, .500])
        def along(t0, OC=OC, ad=ad): return OC + ad * t0
        EL = along(-.010); WR = along(.080); PC = along(.140)
        fwd = unit(np.array([0, -1., 0]) - ad * (ad @ np.array([0, -1., 0])))
        def arm_sdf(p, OC=OC, WR=WR, ad=ad): return sd_capsule(p, OC - ad * .090, WR, (.056, .052))
        tsa = np.linspace(-.080, .080, 6)
        ring_stack('fur_arm.' + tag, arm_sdf, OC[None] + ad[None] * tsa[:, None], np.tile(ad, (len(tsa), 1)), 'arm.' + tag,
                   lambda NN, V: fur_uv(sval(NN, hi=.20, lo=.20), .0), sides=14, tmax=.14, ref=fwd, pole_start=False, pole_end=False)
        lat = unit(np.cross(ad, fwd)) * s
        paw_axes = np.array([ad, fwd, lat])
        thumb = PC + fwd * .056 - lat * .010 - ad * .018
        def paw_parts(p, WR=WR, PC=PC, paw_axes=paw_axes, thumb=thumb, ad=ad):
            d_w = sd_capsule(p, WR - ad * .030, PC - ad * .012, (.052, .058))
            d_paw = sd_ell(p, PC, paw_axes, (.082, .077, .070))
            d_t = sd_ell(p, thumb, paw_axes, (.034, .028, .028))
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
        HP = np.array([s * .100, RCY, .290]); AN = np.array([s * .165, RCY - .012, .090])
        def leg_sdf(p, HP=HP, AN=AN): return sd_capsule(p, HP, AN, (.066, .058))
        zs = np.linspace(.220, .080, 5)
        cen = np.array([HP + (AN - HP) * ((z_ - HP[2]) / (AN[2] - HP[2])) for z_ in zs])
        ring_stack('fur_leg.' + tag, leg_sdf, cen, np.tile(unit(AN - HP), (len(zs), 1)), 'body',
                   lambda NN, V: fur_uv(sval(NN, hi=.20, lo=.20, occ=.12 * smooth(.14, .24, V[:, 2])), .0), sides=14, tmax=.16, ref=[0, -1., 0],
                   pole_start=False)
        FC = np.array([s * .173, -.035, .046]); FAX = rot([0, 0, 1], s * math.radians(5)).T
        toes = [FC + (np.array([o * .066, -.118, .002]) @ FAX) for o in (-1, 0, 1)]
        def foot_parts(p, FC=FC, FAX=FAX, toes=toes, AN=AN):
            d_main = sd_ell(p, FC + np.array([0, .016, 0]), FAX, (.122, .150, .058))
            d_ank = sd_capsule(p, AN + np.array([0, 0, .020]), AN + np.array([0, -.010, -.026]), .060)
            d_t = [sd_ell(p, t, FAX, (.048, .046, .048)) for t in toes]
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
        star_mesh('fur_foot.' + tag, foot_sdf, FC + np.array([0, -.008, .016]), 'body', foot_uv, nth=11, nph=20, tmax=.24)
        LEG[tag] = {'hip': HP.tolist(), 'knee': (HP + (AN - HP) * .55).tolist(), 'ankle': AN.tolist(), 'toe': (FC + np.array([0, -.140, -.010]) @ FAX).tolist()}

    print('BODY_STEP tail', flush=True)
    # ---------------------------------------------------------------- the big fluffy tail: one smooth teardrop plume sweeping out to his right
    # (sheet back view: from the centre out to x -0.50, z 0.14 .. 0.59, the bulk low at (-0.25, 0.30), the tip up at the top right; side view:
    # 0.20 .. 0.54 m behind the axis). A separate piece with bend rings, painted in its own chart (u = around, v = along).
    TAIL_CP = np.array([[-.030, .150, .330], [-.095, .240, .300], [-.180, .318, .300], [-.255, .362, .335], [-.300, .384, .395],
                        [-.322, .384, .462], [-.330, .370, .515], [-.326, .352, .548]])
    TAIL_RT = np.array([0, .06, .16, .28, .42, .56, .70, .82, .92, 1.0]); TAIL_RR = np.array([.050, .088, .136, .165, .172, .164, .146, .120, .086, .044])
    def build_tail():
        path = cpath(TAIL_CP, 200); seg = np.linalg.norm(np.diff(path, axis=0), axis=1); s_ = np.concatenate([[0], np.cumsum(seg)]); s_ /= s_[-1]
        NRT, NST = 28, 20
        tk = np.linspace(0, 1, NRT) ** .95
        P = np.stack([np.interp(tk, s_, path[:, i]) for i in range(3)], -1); R = np.interp(tk, TAIL_RT, TAIL_RR)
        T = unit(np.gradient(P, axis=0))
        # a rotation-minimising frame: X starts horizontal (across the plume), B = T x X is the outer side of the curve
        X = np.zeros_like(P); x0 = np.cross(T[0], [0, 0, 1.]); X[0] = unit(x0)
        for k in range(1, NRT):
            v = X[k - 1] - T[k] * (X[k - 1] @ T[k]); X[k] = unit(v)
        B = unit(np.cross(T, X))
        if (B[NRT // 2] @ np.array([-.3, .6, -.4])) < 0: X = -X; B = -B
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
        'gi_top': ['gi_top'], 'lapels': ['lapel'], 'belt': ['belt'], 'belt_knot': ['belt_knot', 'belt_end'], 'gi_skirt': ['gi_skirt'],
        'hakama': ['hakama'], 'sleeve_L': ['sleeve.L'], 'paw_L': ['mitten_paw.L'], 'paw_R': ['mitten_paw.R'], 'legs': ['fur_leg'],
        'foot_L': ['fur_foot.L'], 'tail': ['tail'], 'headband': ['headband'], 'band_knot': ['band_knot', 'band_tail']}.items()}}
    BODY_MEAS['arm_angle_from_vertical_deg'] = ARM_DEG
    BODY_PIVOTS = {'arm.L': tuple(ARM['L']['shoulder']), 'arm.R': tuple(ARM['R']['shoulder']), 'sleeve.L': tuple(ARM['L']['shoulder']),
                   'sleeve.R': tuple(ARM['R']['shoulder']), 'body': (0, 0, 0), 'gi_skirt': (0, RCY, OBI_Z0), 'hakama': (0, RCY, HK_Z0),
                   'tail': tuple(TAIL_ROOT), 'band': tuple(O)}
    def POST_JOIN():
        joints = {'units': 'metres', 'coordinate_system': 'Blender Z-up, front -Y; character left is +X'}
        joints.update({'hips': [0, RCY, .300], 'spine': [0, RCY, .400], 'chest': [0, RCY - .004, .490], 'neck': [0, RCY - .004, .575]})
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
        joints['belt'] = LOG['belt']
        joints['notes'] = ['Phase 1: no rig, weights or animations. Same keys as the Toybox heroes / Kitsune joints.json.',
                           'head = the head-ball centre (the radial origin), not the nod pivot; head_base = a suggested nod pivot at the base of the skull.',
                           'Head skin = zero surface of one smooth implicit field (skull + cheek mass + muzzle + chin + nose), analytic normals; no eye sockets.',
                           'Mouth: a sculpted "w" smile groove (closed) with 5 loops round it; the skin is cut along the parting (see mouth).',
                           'Eyelid holes ringed by 6 loops each, the rim rolled 4.5 mm in behind separate lens eyeballs; 5 loops round the nose.',
                           'Ears: separate pieces (Kazemaru_ear_L / _R), 24 bend rows from the root (in the skull) to the tip; pivot = ears.base.',
                           'Headband (Kazemaru_band): the ring, the knot and the two tails (14 rings each: weight the tails to a head child or springs).',
                           'Tail: a separate piece (Kazemaru_tail), 28 bend rings from the root (inside the gi skirt) to the tip; pivot = tailRoot; chain = tail.',
                           'Sleeves (Kazemaru_sleeve_L/_R): separate shells with 12 rings; the gi skirt (Kazemaru_gi_skirt) 9 rings; the hakama legs 12 rings each.']
        with open(os.path.join(ROOT, 'joints.json'), 'w', encoding='utf-8') as f: json.dump(joints, f, indent=2)
