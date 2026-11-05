BODY_PIVOTS = {}; BODY_MEAS = {}; POST_JOIN = None; TAIL = {}
# ============================================================== THE BODY (metres; body axis x = 0, y = 0; per design)
# Sheet front turnarounds (measure-a.md / measure-c.md): A 2.975 mm / px, C 2.823 mm / px; side views for the depths.

class Garment:
    """a lofted garment surface: half-width X(z), front depth F(z), back depth B(z) (natural splines), a superellipse section;
    a = angle round the body (0 = front, pi / 2 = her left), the loft runs from top(a) down to bot(a)"""
    def __init__(self, Z, AX, AF, AB, top, bot, sp=2.3, yc=0.):
        self.Z = np.asarray(Z, float); self.ax = natspline(Z, AX); self.af = natspline(Z, AF); self.ab = natspline(Z, AB)
        self.top = top; self.bot = bot; self.sp = sp; self.yc = yc
    def at(self, a, z):
        a = np.asarray(a, float); z = np.asarray(z, float); c = np.cos(a); w = (1 + c) / 2
        dep = self.af(z) * w + self.ab(z) * (1 - w)
        return np.stack([self.ax(z) * spow(np.sin(a), 2 / self.sp), self.yc - dep * spow(c, 2 / self.sp), z], -1)
    def raw(self, a, t):
        a = np.asarray(a, float); t = np.asarray(t, float); z = self.top(a) + (self.bot(a) - self.top(a)) * t
        return self.at(a, z)
    def nrm_az(self, a, z, e=1e-4):
        Pa = self.at(np.asarray(a) + e, z) - self.at(np.asarray(a) - e, z); Pz = self.at(a, np.asarray(z) + e) - self.at(a, np.asarray(z) - e)
        n = unit(np.cross(Pa, Pz)); P0 = self.at(a, z); ctr = np.stack([0 * P0[..., 0], self.yc + 0 * P0[..., 0], P0[..., 2]], -1)
        return np.where(((n * (P0 - ctr)).sum(-1) < 0)[..., None], -n, n)
    def a_of(self, p):
        """the angle and height of the surface point radially outward of p (from the axis at p's height)"""
        p = np.asarray(p, float); return np.arctan2(p[..., 0], -(p[..., 1] - self.yc)), p[..., 2]
    def project(self, p, off):
        a, z = self.a_of(p); return self.at(a, z) + self.nrm_az(a, z) * off, self.nrm_az(a, z)

def garment_shell(name, G, group, chart, lining, NA, NT, thick, top_plain=True, bot_plain=False, occ_fn=None, tone_fn=None, tpow=.9):
    a_k = np.linspace(-PI, PI, NA, endpoint=False); t_k = np.linspace(0, 1, NT) ** tpow
    AK, TK = np.meshgrid(a_k, t_k); Gs = G.raw(AK, TK); zk = Gs[..., 2]
    Ns = G.nrm_az(AK, zk)
    Vs = Gs.reshape(-1, 3); NNs = Ns.reshape(-1, 3); Fs = grid_faces(NT, NA, wrap=True)
    occ = occ_fn(AK, TK, Gs) if occ_fn else 0. * TK
    tone = tone_fn(AK, TK, Gs) if tone_fn else .05 + .06 * smooth(.3, 1., TK)
    UVo = mix_uv(chart, sval(NNs, hi=.26, lo=.20, occ=np.asarray(occ).reshape(-1)), np.asarray(tone).reshape(-1))
    UVi = ramp_uv(lining, sval(-NNs, hi=.10, lo=.10) - .08)
    plain = np.zeros(len(Vs), bool)
    if top_plain: plain[:NA] = True
    if bot_plain: plain[-NA:] = True
    Vt, Ft, UVt, Nt = thicken(Vs, Fs, NNs, thick, UVo, UVi, UVo, rim=3, plain=plain, split_front=True)
    return make_obj(name, Vt, Ft, UVt, group, N=Nt)

def loft_rings(name, rings, group, uvfn, cap0=False, cap1=False):
    """a closed-section loft through given rings (R, S, 3); outward normals from the ring centres"""
    Gq = np.asarray(rings, float); R_, S_ = Gq.shape[:2]
    dS = np.roll(Gq, -1, 1) - np.roll(Gq, 1, 1); dK = np.gradient(Gq, axis=0)
    NG = unit(np.cross(dK, dS)); ctr = Gq.mean(1, keepdims=True)
    NG = np.where(((NG * (Gq - ctr)).sum(-1) < 0)[..., None], -NG, NG)
    V = list(Gq.reshape(-1, 3)); NN = list(NG.reshape(-1, 3)); F = grid_faces(R_, S_, wrap=True)
    for use, ring, rev in ((cap0, 0, True), (cap1, R_ - 1, False)):
        if not use: continue
        k = len(V); c = Gq[ring].mean(0); ax_ = unit(Gq[ring].mean(0) - Gq[1 if ring == 0 else R_ - 2].mean(0))
        V.append(c + ax_ * .004); NN.append(ax_)
        for i in range(S_):
            a, b = ring * S_ + i, ring * S_ + (i + 1) % S_; F.append((b, a, k) if rev else (a, b, k))
    V = np.array(V); NN = np.array(NN)
    return make_obj(name, V, F, uvfn(NN, V), group, N=NN)

SC_B = 1.0 if DESIGN == 'a' else .86          # limb / paw / foot size relative to design A
if not HEAD_ONLY:
    GAR = {}
    if DESIGN == 'a':
        print('BODY_STEP shirt', flush=True)
        # ---------------------------------------------------------------- the cream shirt (its torso shows above the bib and at the back;
        # tucked into the overalls). Sheet front: shoulders +-0.20 at z 0.46, the neck under the chin (0.497); side: the front -0.12 at z 0.40.
        SHIRT = Garment([.30, .34, .38, .42, .45, .48, .505], [.205, .208, .212, .214, .205, .178, .140], [.140, .138, .134, .128, .120, .104, .084],
                        [.150, .150, .148, .142, .132, .112, .086], lambda a: .505 + 0 * np.asarray(a), lambda a: .300 + 0 * np.asarray(a), yc=.010)
        GAR['shirt'] = SHIRT
        garment_shell('shirt', SHIRT, 'shirt', 'c2mix', 'lining2', 28, 6, .012,
                      occ_fn=lambda A, T, G: .20 * smooth(.47, .50, G[..., 2]), tone_fn=lambda A, T, G: .04 + 0 * T)
        print('BODY_STEP overalls', flush=True)
        # ---------------------------------------------------------------- the sage overalls: one loft from the bib's top edge (front z 0.425,
        # its rounded corners at x +-0.15, dropping to 0.33 under the arms; the back panel's top at 0.375) down to the crotch (z 0.165);
        # sheet: the body +-0.22, the side front -0.17 (with the pocket), the back 0.17.
        def ov_top(a):
            a = np.asarray(a, float); xa = np.abs(np.sin(a)); c = np.cos(a)
            fr = .330 + .095 * (1 - smooth(.50, .74, xa)); bk = .330 + .045 * (1 - smooth(.46, .70, xa))
            return np.where(c > 0, fr, bk)
        OVER = Garment([.165, .20, .24, .28, .32, .36, .40, .43], [.198, .214, .222, .222, .220, .218, .216, .212],
                       [.150, .163, .170, .170, .166, .159, .151, .146], [.160, .172, .178, .176, .170, .163, .157, .152],
                       ov_top, lambda a: .165 + 0 * np.asarray(a), yc=.010)
        GAR['over'] = OVER
        garment_shell('overalls', OVER, 'overalls', 'c1mix', 'lining1', 36, 6, .014, top_plain=False, bot_plain=True,
                      occ_fn=lambda A, T, G: .10 * (1 - smooth(.0, .15, T)), tone_fn=lambda A, T, G: .05 + .05 * T)
        # the two short legs with rolled cuffs (sheet: the cuffs at z 0.125-0.15, each leg x 0.01 .. 0.21; side -0.15 .. 0.16)
        def tr_dims(z):
            z = np.asarray(z, float); bul = smooth(.255, .205, z) * smooth(.140, .185, z)
            xo = .205 + .012 * bul - .010 * smooth(.170, .140, z); xi = .004 + .010 * smooth(.180, .145, z)
            hy = .150 + .012 * bul - .018 * smooth(.175, .140, z)
            return xo, xi, hy
        TR_Z0, TR_Z1, TRY = .255, .150, .010
        CUFF = {}
        for s, tag in ((-1, 'R'), (1, 'L')):
            NZH, NAH = 6, 18
            zh = TR_Z0 + (TR_Z1 - TR_Z0) * np.linspace(0, 1, NZH); ah = np.linspace(0, 2 * PI, NAH, endpoint=False)
            rings = []
            for z_ in zh:
                xo, xi, hy = tr_dims(z_); xc = (xo + xi) / 2; hx = (xo - xi) / 2
                rings.append(np.stack([s * (xc + hx * spow(np.sin(ah), 2 / 2.5)), TRY - hy * spow(np.cos(ah), 2 / 2.5), np.full(NAH, z_)], -1))
            Gh = np.array(rings)
            dS = np.roll(Gh, -1, 1) - np.roll(Gh, 1, 1); dK = np.gradient(Gh, axis=0)
            NGh = unit(np.cross(dK, dS)); NGh = np.where(((NGh * (Gh - Gh.mean(1, keepdims=True))).sum(-1) < 0)[..., None], -NGh, NGh)
            Vh = Gh.reshape(-1, 3); NNh = NGh.reshape(-1, 3); tz = np.repeat(np.linspace(0, 1, NZH), NAH)
            crs_ = np.tile(np.exp(-((np.sin(ah) + 1) / .30) ** 2), NZH)
            UVo = mix_uv('c1mix', sval(NNh, hi=.22, lo=.20, occ=.20 * crs_ + .10 * (1 - smooth(.0, .30, tz))), .08 + .04 * tz)
            UVi = ramp_uv('lining1', sval(-NNh, hi=.10, lo=.10) - .10)
            plain = np.zeros(len(Vh), bool); plain[:NAH] = True
            Vt, Ft, UVt, Nt = thicken(Vh, grid_faces(NZH, NAH, wrap=True), NNh, .014, UVo, UVi, UVo, rim=3, plain=plain, split_front=True)
            make_obj('overall_leg.' + tag, Vt, Ft, UVt, 'overalls', N=Nt)
            # the rolled cuff: a plump ring round the leg's opening
            xo, xi, hy = tr_dims(TR_Z1 + .004); xc = (xo + xi) / 2; hx = (xo - xi) / 2
            pc = np.linspace(0, 2 * PI, 24, endpoint=False)
            cpath_ = np.stack([s * (xc + (hx + .003) * spow(np.sin(pc), 2 / 2.5)), TRY - (hy + .003) * spow(np.cos(pc), 2 / 2.5), np.full(24, TR_Z1 + .010)], -1)
            cn = unit(np.stack([s * spow(np.sin(pc), 2 - 2 / 2.5) / hx, -spow(np.cos(pc), 2 - 2 / 2.5) / hy, 0 * pc], -1))
            sak = np.linspace(0, 2 * PI, 6, endpoint=False)
            ring_tube('overall_cuff.' + tag, cpath_, lambda k: np.stack([.0105 * np.cos(sak), .0135 * np.sin(sak)], -1), 'overalls',
                      lambda NN, tt, uu, V: mix_uv('c1mix', sval(NN, hi=.24, lo=.20), .12 + 0 * tt), cn, sides=6)
            CUFF[tag] = [round(float(s * xc), 3), TR_Z1]
        print('BODY_STEP straps pocket', flush=True)
        # the broad shoulder straps: from the bib's top corners (x +-0.105) up over the shoulders and straight down the back to the back
        # panel (sheet front: x 0.085 .. 0.125; back: two straight bands)
        STRAP = {}
        for s, tag in ((-1, 'R'), (1, 'L')):
            ctrl = [(s * .103, -.30, .392), (s * .106, -.30, .430), (s * .112, -.30, .470), (s * .118, -.10, .512), (s * .118, .10, .512),
                    (s * .110, .30, .470), (s * .104, .30, .410), (s * .102, .30, .352)]
            raw = cpath(ctrl, 22); P_, N_ = SHIRT.project(raw, .0125)
            P_[:, 2] = np.minimum(P_[:, 2], .506)
            # over the shoulder the shirt loft ends at its top ring: keep the band on a smooth arc there
            sweep('strap.' + tag, P_, lambda k: (.0066, .0235), 'overalls', lambda NN, tt, uu, V: mix_uv('c1mix', sval(NN, hi=.24, lo=.20), .10 + 0 * tt),
                  sides=8, normals=N_, p=.70)
            STRAP[tag] = [[round(float(c), 3) for c in P_[0]], [round(float(c), 3) for c in P_[-1]]]
        # the big rounded bib pocket (sheet: x +-0.105, z 0.24 .. 0.38), conforming to the overalls' front
        NRp, NTp = 4, 22; hx_, hz_, pz = .104, .068, .310
        rr = np.linspace(0, 1, NRp) ** .8; th_ = np.linspace(0, 2 * PI, NTp, endpoint=False)
        PX = hx_ * rr[:, None] * spow(np.cos(th_), 2 / 4.2)[None]; PZ = pz + hz_ * rr[:, None] * spow(np.sin(th_), 2 / 4.2)[None]
        ap = np.arcsin(np.clip(spow(PX / OVER.ax(PZ), OVER.sp / 2), -.999, .999))
        Pp = OVER.at(ap, PZ) + OVER.nrm_az(ap, PZ) * .012; Np = OVER.nrm_az(ap, PZ)
        Vp = list(Pp.reshape(-1, 3)); Fp = []
        # rings 1.. as a grid; the centre ring (r = 0) is one point repeated: build a fan
        V0 = Pp[0, 0]; Vp = [V0] + list(Pp[1:].reshape(-1, 3)); Np_ = [Np[0, 0]] + list(Np[1:].reshape(-1, 3))
        for i in range(NTp): Fp.append((0, 1 + i, 1 + (i + 1) % NTp))
        for j in range(NRp - 2):
            for i in range(NTp):
                a0 = 1 + j * NTp + i; b0 = 1 + j * NTp + (i + 1) % NTp; Fp.append((a0, a0 + NTp, b0 + NTp, b0))
        Vp = np.array(Vp); Np_ = np.array(Np_)
        edge = np.r_[0, np.repeat(rr[1:], NTp)]
        UVpo = mix_uv('c1mix', sval(Np_, hi=.24, lo=.20, occ=.10 * smooth(.80, 1., edge)), .14 + 0 * edge)
        Vt, Ft, UVt, Nt = thicken(Vp, Fp, Np_, .010, UVpo, UVpo, UVpo, rim=3)
        make_obj('pocket', Vt, Ft, UVt, 'overalls', N=Nt)
        SLV = dict(root=(.135, .474), open=(.232, .405), rhu=.068, rhy=.088, ohu=.056, ohy=.066, chart='c2mix', lining='lining2', deg=22.)
    else:
        print('BODY_STEP dress', flush=True)
        # ---------------------------------------------------------------- the lilac A-line tunic dress (sheet front: +-0.14 at the shoulders
        # (z 0.43) to +-0.205 at the hem (z 0.125); side: the front -0.118 at z 0.40 sloping to -0.19 at the hem, the back 0.13 .. 0.17)
        DRESS = Garment([.125, .16, .20, .25, .30, .35, .40, .43, .458], [.212, .204, .193, .180, .168, .158, .150, .140, .114],
                        [.190, .180, .166, .151, .138, .127, .118, .107, .080], [.172, .166, .158, .148, .138, .130, .123, .112, .082],
                        lambda a: .458 + 0 * np.asarray(a), lambda a: .125 + .004 * (1 - np.cos(np.asarray(a))) / 2, yc=.000)
        GAR['dress'] = DRESS
        garment_shell('dress', DRESS, 'dress', 'c1mix', 'lining1', 48, 12, .014, top_plain=True, bot_plain=False,
                      occ_fn=lambda A, T, G: .14 * smooth(.43, .458, G[..., 2]), tone_fn=lambda A, T, G: .05 + .05 * smooth(.2, 1., T))
        # the broad clean hem: a plump rolled band round the bottom edge
        ph = np.linspace(-PI, PI, 48, endpoint=False); zh_ = DRESS.bot(ph) + .012
        hp = DRESS.at(ph, zh_) + DRESS.nrm_az(ph, zh_) * .004; hn = DRESS.nrm_az(ph, zh_)
        sak = np.linspace(0, 2 * PI, 8, endpoint=False)
        ring_tube('dress_hem', hp, lambda k: np.stack([.0100 * np.cos(sak), .0150 * np.sin(sak)], -1), 'dress',
                  lambda NN, tt, uu, V: mix_uv('c1mix', sval(NN, hi=.24, lo=.20), .14 + 0 * tt), hn, sides=8)
        print('BODY_STEP satchel', flush=True)
        # ---------------------------------------------------------------- the mustard satchel at her left hip (sheet front: x 0.04 .. 0.22,
        # z 0.16 .. 0.29; side: its front at -0.19) with a thick curved flap, on one very wide band from her right shoulder
        # round 2 (the director): a soft pillowy bag hugging the front-left hip: its back rests on the dress (bent round her body), at most
        # ~6.5 cm proud in the side view; a domed flap over the top ~55 % of the front, ~1.4 cm proud, its lower edge a rolled lip; the band
        # runs into the bag's top corners (its ends inside the bag)
        _a0, _z0 = math.radians(32), .226
        _bp = DRESS.at(_a0, _z0); _bn = DRESS.nrm_az(_a0, _z0); _bn = unit(np.array([_bn[0], _bn[1], 0.]))
        BAG_H = (.088, .025, .072)
        BAG_C = _bp + _bn * (BAG_H[1] + .003); BAG_F = unit(_bn); BAG_U = np.array([0, 0, 1.]); BAG_S = np.cross(BAG_U, BAG_F)
        BAG_AX = np.array([BAG_S, BAG_F, BAG_U])
        BAG_BEND = .5 / float(DRESS.ax(_z0))                       # the bag curves round her (the dress's own curvature there)
        FLAP_C = np.array([0, BAG_H[1] - .006, BAG_H[2] - .036]); FLAP_H = (.093, .015, .044)
        def bag_parts(p):
            q = (p - BAG_C) @ BAG_AX.T
            q[:, 1] = q[:, 1] + BAG_BEND * q[:, 0] ** 2                # (the sides bend back toward the body)
            pil = np.clip(1 - (q[:, 0] / BAG_H[0]) ** 2, 0, 1) * np.clip(1 - (q[:, 2] / BAG_H[2]) ** 2, 0, 1)
            d0 = sd_box(q, np.zeros(3), np.eye(3), BAG_H, .024) - .007 * pil          # pillowy: the faces dome ~7 mm
            pf = np.clip(1 - (q[:, 0] / FLAP_H[0]) ** 2, 0, 1)
            d1 = sd_box(q, FLAP_C, np.eye(3), FLAP_H, .013) - .006 * pf * smooth(-.04, .03, q[:, 2] - FLAP_C[2])     # a domed flap
            return d0, d1, q
        def bag_sdf(p):
            d0, d1, q = bag_parts(p); return smin(d0, d1, .003)
        def bag_uv(NN, V):
            d0, d1, q = bag_parts(V)
            flap = smooth(.0012, -.0012, d1 - d0)
            under = smooth(.012, .0, (FLAP_C[2] - FLAP_H[2]) - q[:, 2]) * smooth(-.002, .006, (FLAP_C[2] - FLAP_H[2]) - q[:, 2] + .012) * (q[:, 1] > 0) * (1 - flap)
            return mix_uv('c2mix', sval(NN, hi=.24, lo=.22, occ=.10 * smooth(-.02, -.07, q[:, 2]) + .26 * under), .03 + .13 * flap)
        star_mesh('satchel', bag_sdf, BAG_C + BAG_F * .004, 'satchel', bag_uv, nth=20, nph=36, tmax=.17, axis=BAG_F, ref=BAG_U)
        # the band: a broad solid ribbon from the bag's top up across her chest to her right shoulder, over it, and down her back to
        # the bag's outer top corner (sheet back view: the band from her right shoulder down to her left hip); both ends inside the bag
        btop = BAG_C + BAG_U * (BAG_H[2] - .020) - BAG_S * .040
        bside = BAG_C + BAG_S * (BAG_H[0] - .030) + BAG_U * (BAG_H[2] - .022) - BAG_F * .006
        ctrl = [tuple(btop + BAG_U * .030 - BAG_S * .010), (.040, -.30, .335), (-.030, -.30, .395), (-.090, -.30, .438), (-.118, -.05, .470),
                (-.112, .12, .452), (-.040, .30, .392), (.060, .30, .330)]
        # (round 2b: round her left side on the dress at the hip into the bag's outer corner, no free tab)
        for a_, z_ in ((math.radians(128), .316), (math.radians(98), .304), (math.radians(74), .297)):
            ctrl.append(tuple(DRESS.at(a_, z_)))
        raw = cpath(ctrl, 30); P_, N_ = DRESS.project(raw, .012)
        P_ = np.concatenate([[btop], P_, [bside]]); N_ = np.concatenate([[BAG_F], N_, [N_[-1]]])
        ss = np.linspace(0, 1, len(P_))
        sweep('satchel_band', P_, lambda k: (.0062, .0245), 'satchel', lambda NN, tt, uu, V: mix_uv('c2mix', sval(NN, hi=.24, lo=.20), .10 + 0 * tt),
              sides=8, normals=N_, p=.70)
        SATCHEL = {'centre_m': [round(float(c), 3) for c in BAG_C], 'half_size_m': BAG_H, 'facing': [round(float(c), 3) for c in BAG_F]}
        SLV = dict(root=(.108, .422), open=(.186, .368), rhu=.058, rhy=.074, ohu=.049, ohy=.057, chart='c1mix', lining='lining1', deg=22.)

    print('BODY_STEP sleeves and arms', flush=True)
    # ---------------------------------------------------------------- short puffed sleeves and the arms (A: the sleeve's opening at
    # (+-0.236, 0.405), the paws widest +-0.32 at z 0.29, their bottoms 0.24; C: the opening at (+-0.19, 0.368), the paws +-0.265 at 0.27,
    # bottoms 0.235). The arms hang ~22 deg out (the sheet ~20; the A-pose rule 25-30).
    ARM = {}; ARM_DEG = SLV['deg']; ARMY = .030
    for s, tag in ((1, 'L'), (-1, 'R')):
        th = math.radians(ARM_DEG); ad = unit(np.array([s * math.sin(th), .02, -math.cos(th)]))
        u_open = unit(np.array([s * math.cos(th), 0, math.sin(th)]))
        OC = np.array([s * SLV['open'][0], ARMY, SLV['open'][1]]); OHU, OHY = SLV['ohu'], SLV['ohy']
        RC = np.array([s * SLV['root'][0], ARMY, SLV['root'][1]]); RHU, RHY = SLV['rhu'], SLV['rhy']
        NR = 8; ts = np.linspace(0, 1, NR); NS = 14; sa = np.linspace(0, 2 * PI, NS, endpoint=False)
        rings = []
        for t in ts:
            n0 = np.array([s * 1., 0, 0]); n = unit(n0 * (1 - smooth(.15, 1., t)) + ad * smooth(.15, 1., t))
            uu = unit(np.cross(n, [0, 1., 0]) * s); uu = uu if uu[2] > 0 else -uu
            vv = np.array([0, 1., 0])
            c = RC + (OC - RC) * t + np.array([0, 0, .016 * SC_B]) * math.sin(PI * t) * (1 - t) + u_open * .006 * math.sin(PI * t)
            hu = RHU + (OHU - RHU) * t + .008 * SC_B * math.sin(PI * t) ** 1.2; hy = RHY + (OHY - RHY) * t + .006 * SC_B * math.sin(PI * t) ** 1.2
            g = .18 * smooth(.82, 1., t)
            rings.append(c + np.outer(hu * (1 - g) * spow(np.sin(sa), 2 / 2.3), uu) + np.outer(hy * (1 - g * .6) * spow(np.cos(sa), 2 / 2.3), vv))
        Gq = np.array(rings)
        dS = np.roll(Gq, -1, 1) - np.roll(Gq, 1, 1); dK = np.gradient(Gq, axis=0)
        NGq = unit(np.cross(dK, dS)); NGq = np.where(((NGq * (Gq - Gq.mean(1, keepdims=True))).sum(-1) < 0)[..., None], -NGq, NGq)
        V = Gq.reshape(-1, 3); NN = NGq.reshape(-1, 3); nr_, ns_ = Gq.shape[:2]
        tone = np.repeat(np.linspace(.04, .10, nr_), ns_)
        UVo = mix_uv(SLV['chart'], sval(NN, hi=.26, lo=.20, occ=.10 * np.repeat(smooth(.85, 1., ts), ns_)), tone)
        UVi = ramp_uv(SLV['lining'], sval(-NN, hi=.10, lo=.10) - .06)
        plain = np.zeros(len(V), bool); plain[:ns_] = True
        Vt, Ft, UVt, Nt = thicken(V, grid_faces(nr_, ns_, wrap=True), NN, .012, UVo, UVi, UVo, rim=3, plain=plain, split_front=True)
        make_obj('sleeve.' + tag, Vt, Ft, UVt, 'sleeve.' + tag, N=Nt)
        SH = np.array([s * (SLV['root'][0] + .02), ARMY, SLV['root'][1] + .01])
        def along(t0, OC=OC, ad=ad): return OC + ad * t0
        EL = along(.010 * SC_B); WR = along(.090 * SC_B); PC = along(.142 * SC_B)
        fwd = unit(np.array([0, -1., 0]) - ad * (ad @ np.array([0, -1., 0])))
        def arm_sdf(p, OC=OC, WR=WR, ad=ad): return sd_capsule(p, OC - ad * .070 * SC_B, WR, (.052 * SC_B, .048 * SC_B))
        tsa = np.linspace(-.060, .060, 6) * SC_B
        ring_stack('fur_arm.' + tag, arm_sdf, OC[None] + ad[None] * tsa[:, None], np.tile(ad, (len(tsa), 1)), 'arm.' + tag,
                   lambda NN, V: fur_uv(sval(NN, hi=.20, lo=.20), .0), sides=14, tmax=.12, ref=fwd, pole_start=False, pole_end=False)
        lat = unit(np.cross(ad, fwd)) * s
        paw_axes = np.array([ad, fwd, lat])
        thumb = PC + (fwd * .044 - lat * .008 - ad * .014) * SC_B
        def paw_parts(p, WR=WR, PC=PC, paw_axes=paw_axes, thumb=thumb, ad=ad):
            d_w = sd_capsule(p, WR - ad * .026 * SC_B, PC - ad * .010 * SC_B, (.048 * SC_B, .053 * SC_B))
            d_paw = sd_ell(p, PC, paw_axes, np.array([.066, .062, .057]) * SC_B)
            d_t = sd_ell(p, thumb, paw_axes, np.array([.027, .023, .023]) * SC_B)
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
        tsp = np.concatenate([np.linspace(0, .45, 4)[:-1], np.linspace(.45, 1.0, 10)])
        cen = (WR - ad * .025 * SC_B)[None] + (tips - (WR - ad * .025 * SC_B))[None] * tsp[:, None]
        ring_stack('mitten_paw.' + tag, paw_sdf, cen, np.tile(ad, (len(tsp), 1)), 'arm.' + tag, paw_uv, sides=16, tmax=.10, ref=fwd)
        ARM[tag] = {'shoulder': SH.tolist(), 'elbow': EL.tolist(), 'wrist': WR.tolist(), 'palm': (PC - lat * .006).tolist(),
                    'grip_axis': fwd.tolist(), 'arm_dir': ad.tolist(), 'paw_centre': PC.tolist()}

    print('BODY_STEP legs feet', flush=True)
    # ---------------------------------------------------------------- short legs and big round feet (A: the legs x 0.03 .. 0.18 at z 0.07-0.13,
    # the feet x 0.01 .. 0.20 each, 0.25 m long, ~0.075 m tall; C: the legs x 0.02 .. 0.135 at z 0.06-0.125, the feet x 0.01 .. 0.15, 0.21 m long)
    LEG = {}
    LG = dict(a=dict(hip=(.102, .250), ank=(.106, .070), r=(.074, .068), fc=(.106, -.024, .043), fr=(.094, .122, .051), toe=.050),
              c=dict(hip=(.076, .200), ank=(.080, .058), r=(.058, .054), fc=(.080, -.018, .040), fr=(.072, .102, .046), toe=.040))[DESIGN]
    for s, tag in ((1, 'L'), (-1, 'R')):
        HP = np.array([s * LG['hip'][0], .010, LG['hip'][1]]); AN = np.array([s * LG['ank'][0], .000, LG['ank'][1]])
        def leg_sdf(p, HP=HP, AN=AN): return sd_capsule(p, HP, AN, LG['r'])
        zs = np.linspace(LG['hip'][1] - .045, LG['ank'][1] + .010, 5)
        cen = np.array([HP + (AN - HP) * ((z_ - HP[2]) / (AN[2] - HP[2])) for z_ in zs])
        ring_stack('fur_leg.' + tag, leg_sdf, cen, np.tile(unit(AN - HP), (len(zs), 1)), 'body',
                   lambda NN, V: fur_uv(sval(NN, hi=.20, lo=.20, occ=.10 * smooth(LG['ank'][1] + .05, LG['ank'][1] + .12, V[:, 2])), .0),
                   sides=14, tmax=.14, ref=[0, -1., 0], pole_start=False)
        FC = np.array([s * LG['fc'][0], LG['fc'][1], LG['fc'][2]]); FAX = rot([0, 0, 1], s * math.radians(4)).T
        toes = [FC + (np.array([o * LG['toe'], -LG['fr'][1] * .80, .002]) @ FAX) for o in (-1, 0, 1)]
        def foot_parts(p, FC=FC, FAX=FAX, toes=toes, AN=AN):
            d_main = sd_ell(p, FC + np.array([0, .014, 0]), FAX, LG['fr'])
            d_ank = sd_capsule(p, AN + np.array([0, 0, .016]), AN + np.array([0, -.008, -.020]), LG['r'][1] * .78)
            d_t = [sd_ell(p, t, FAX, np.array([.038, .037, .038]) * SC_B) for t in toes]
            return d_main, d_ank, d_t
        def foot_sdf(p, foot_parts=foot_parts):
            d_main, d_ank, d_t = foot_parts(p)
            d = smin(d_main, d_ank, .018); tt = smin(smin(d_t[0], d_t[1], .005), d_t[2], .005)
            d = smin(d, tt, .013)
            return smax(d, -(p[:, 2] - .002), .007)
        def foot_uv(NN, V, foot_parts=foot_parts):
            d_main, d_ank, d_t = foot_parts(V)
            cr = crease(d_t[0], d_t[1], .005) * .40 + crease(d_t[1], d_t[2], .005) * .40
            return fur_uv(sval(NN, occ=1.0 * cr + .10 * smooth(.012, .0, V[:, 2]), hi=.20, lo=.18), .0)
        star_mesh('fur_foot.' + tag, foot_sdf, FC + np.array([0, -.006, .014]), 'body', foot_uv, nth=11, nph=20, tmax=.20)
        LEG[tag] = {'hip': HP.tolist(), 'knee': (HP + (AN - HP) * .55).tolist(), 'ankle': AN.tolist(), 'toe': (FC + np.array([0, -.110, -.010]) @ FAX).tolist()}

    print('BODY_STEP tail', flush=True)
    # ---------------------------------------------------------------- the tail: one broad curved teardrop from the rear pelvis, sweeping
    # back and up, a little to her left, the cream distal third up (A side: 0.40 m behind the axis at most, z 0.15 .. 0.48; C side:
    # 0.34 m, z 0.13 .. 0.375; the back views: the plume a little to her left)
    if DESIGN == 'a':
        TAIL_CP = np.array([[.000, .125, .290], [.018, .168, .258], [.040, .212, .250], [.060, .250, .272], [.068, .266, .322],
                            [.060, .264, .374], [.045, .252, .414], [.030, .236, .438]])
        TAIL_RT = np.array([0, .06, .16, .28, .42, .56, .70, .82, .92, 1.0]); TAIL_RR = 1.10 * np.array([.040, .062, .088, .104, .112, .116, .113, .102, .080, .040])
    else:
        TAIL_CP = np.array([[.000, .105, .245], [.016, .140, .218], [.034, .178, .210], [.050, .212, .230], [.058, .226, .270],
                            [.052, .224, .310], [.040, .214, .340], [.026, .200, .358]])
        TAIL_RT = np.array([0, .06, .16, .28, .42, .56, .70, .82, .92, 1.0]); TAIL_RR = 1.10 * np.array([.032, .050, .070, .083, .090, .093, .090, .081, .064, .032])
    TAIL_WHITE = .62 if DESIGN == 'a' else .64
    def build_tail():
        path = cpath(TAIL_CP, 200); seg = np.linalg.norm(np.diff(path, axis=0), axis=1); s_ = np.concatenate([[0], np.cumsum(seg)]); s_ /= s_[-1]
        NRT, NST = 22, 18
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
        make_obj('tail', V, F, au('tail', UVl[:, 0], UVl[:, 1]), 'tail', N=NN)
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
        'shirt': ['shirt'], 'overalls': ['overalls'], 'overall_legs': ['overall_leg'], 'pocket': ['pocket'], 'straps': ['strap'],
        'dress': ['dress'], 'satchel': ['satchel'], 'sleeve_L': ['sleeve.L'], 'paw_L': ['mitten_paw.L'], 'paw_R': ['mitten_paw.R'],
        'legs': ['fur_leg'], 'foot_L': ['fur_foot.L'], 'tail': ['tail'], 'flower': ['petal', 'flower'], 'lash_L': ['lash.L']}.items() if len(_vs(v))}}
    BODY_MEAS['arm_angle_from_vertical_deg'] = ARM_DEG
    BODY_PIVOTS = {'arm.L': tuple(ARM['L']['shoulder']), 'arm.R': tuple(ARM['R']['shoulder']), 'sleeve.L': tuple(ARM['L']['shoulder']),
                   'sleeve.R': tuple(ARM['R']['shoulder']), 'body': (0, 0, 0), 'shirt': (0, .01, .40), 'overalls': (0, .01, .30),
                   'dress': (0, 0, .30), 'satchel': (0, 0, .30), 'tail': tuple(TAIL_ROOT)}
    def POST_JOIN():
        HIPZ = .26 if DESIGN == 'a' else .22
        joints = {'units': 'metres', 'coordinate_system': 'Blender Z-up, front -Y; character left is +X', 'design': DESIGN}
        joints.update({'hips': [0, .015, HIPZ], 'spine': [0, .018, HIPZ + .08 * SC_B], 'chest': [0, .018, HIPZ + .16 * SC_B],
                       'neck': [0, .015, CHIN - .02]})
        joints['head'] = [float(v) for v in O]
        joints['head_base'] = [0, float(HY + .02 * W), float(CHIN + .02 * W)]
        joints['jaw_pivot'] = [0, float(HY + NOSE_TIP_L * W + .20 * W), float(CHIN + .10 * W)]
        joints['eyes'] = {'R': eye_centers['R'], 'L': eye_centers['L']}
        joints['lashes'] = LASH_INFO
        joints['ears'] = {t: {k: [float(v) for v in ear_info[t][k]] for k in ('base', 'mid', 'tip')} for t in ('R', 'L')}
        if DESIGN == 'a': joints['flower'] = FLOWER_INFO; joints['straps'] = STRAP; joints['cuffs'] = CUFF
        else: joints['satchel'] = SATCHEL
        joints['arms'] = {t: {k: ARM[t][k] for k in ('shoulder', 'elbow', 'wrist')} for t in ARM}
        joints['legs'] = LEG
        joints['palm_R'] = ARM['R']['palm']; joints['palm_L'] = ARM['L']['palm']
        P = TAIL['P']; n_ = len(P); idx = [0, n_ // 4, n_ // 2, (3 * n_) // 4, n_ - 3, n_ - 1]
        joints['tail'] = [[round(float(c), 4) for c in P[i]] for i in idx]
        joints['tailRoot'] = [float(v) for v in TAIL_ROOT]
        joints['mouth'] = MOUTH_INFO
        joints['notes'] = ['Phase 1: no rig, weights or animations. Same keys as the Toybox heroes / Kitsune / Kazemaru / Mikan joints.json.',
                           'head = the head-ball centre (the radial origin), not the nod pivot; head_base = a suggested nod pivot at the base of the skull.',
                           'Head skin = zero surface of one smooth implicit field (skull + cheek ruff + tufts + muzzle + chin + nose), analytic normals; no eye sockets.',
                           'Mouth: a sculpted U smile groove (closed) with 5 loops round it; the skin is cut along the parting (see mouth).',
                           'Eyelid holes ringed by 6 loops each, the rim rolled in behind separate lens eyeballs; 5 loops round the nose.',
                           'Lashes: %slash_L / _R, thick rolls on the skin over each opening with three flicks (origin = the eye centre): weight 100%% to lidU.' % PFX,
                           'Ears: separate pieces (%sear_L / _R), bend rows from the root (in the skull) to the tip; pivot = ears.base.' % PFX,
                           ('Flower: %sflower (five petals + centre) at her right ear, rigid on the head bone.' % PFX) if DESIGN == 'a' else
                           ('Satchel: %ssatchel (bag, flap, band): weight the bag to hips / the left thigh lightly, the band to chest.' % PFX),
                           'Tail: a separate piece (%stail), 22 bend rings from the root to the tip; pivot = tailRoot; chain = tail.' % PFX,
                           'Sleeves: separate shells with 9 rings each.' + (' Overalls: one shell + two legs (7 rings) + rolled cuffs + straps + pocket.' if DESIGN == 'a' else ' Dress: one shell (12 rings) + the rolled hem.')]
        with open(os.path.join(ROOT, 'joints-%s.json' % DESIGN), 'w', encoding='utf-8') as f: json.dump(joints, f, indent=2)
