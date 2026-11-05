print('STEP eyes', flush=True)
# ============================================================== EYES: flush lens globes following the ball
ES = [0, .16, .32, .48, .62, .74, .84, .92, .97, 1.10]
NSEG = 32
eye_centers = {}
def eye_h(k): return .0024 - .0060 * k * k
for s, tag in ((-1, 'R'), (1, 'L')):
    psi = np.linspace(0, 2 * PI, NSEG, endpoint=False); rows = []
    Sc = EYEF[s]['Sc']; axis = EYEF[s]['ax0']
    for k in ES:
        S = Sc[None] if k == 0 else eye_pts(s, psi, k)
        n = grad_n(S); rows.append(S + n * eye_h(k))
    rim = rows[-1]
    for depth, sc in [(.012, .86), (.024, .58)]: rows.append(Sc + (rim - Sc) * sc - axis * depth)
    tip = Sc - axis * .032
    ux_, uz_ = eye_unit(psi)
    def euv(kx, kz): return (.5 + s * kx / 2.4, .5 + kz / 2.4)       # the un-sheared opening frame (X right on screen)
    V = [rows[0][0]]; UVs = [euv(0., 0.)]
    for j, r in enumerate(rows[1:]):
        kk = ES[min(j + 1, len(ES) - 1)]
        for i in range(NSEG): V.append(r[i]); UVs.append(euv(kk * ux_[i], kk * uz_[i]))
    V.append(tip); UVs.append(UVs[-1])
    nr = len(rows) - 1; ix = lambda j, i: 1 + j * NSEG + i % NSEG
    fs = [(0, ix(0, i), ix(0, i + 1)) for i in range(NSEG)]
    for j in range(nr - 1):
        for i in range(NSEG): fs.append((ix(j, i), ix(j + 1, i), ix(j + 1, i + 1), ix(j, i + 1)))
    last = len(V) - 1
    for i in range(NSEG): fs.append((ix(nr - 1, i), last, ix(nr - 1, i + 1)))
    UVa = np.array(UVs); make_obj('eyeball.' + tag, np.array(V), fs, au('eye.' + tag, UVa[:, 0], UVa[:, 1]), 'eye.' + tag)
    eye_centers[tag] = [float(v) for v in (Sc - axis * .016)]
    LOG['eye_axis_' + tag] = {'out_deg': round(math.degrees(math.atan2(s * axis[0], -axis[1])), 1),
                              'down_deg': round(math.degrees(math.asin(-axis[2])), 1)}
print('EYE_AXIS', LOG['eye_axis_L'], LOG['eye_axis_R'], flush=True)

# ============================================================== the upper lash line as its own object (the Takemori lesson)
# A thick tapered roll lying on the skin where the sheet's lash goes (the opening's superellipse from just inside the rim, k 0.965, out to
# 1 + lash_th(psi)), its face ~4 mm proud of the skin and its back ~8 mm inside it (hidden at rest; the rig weights it 100% to lidU),
# plus the wing flick at the outer corner. Nothing of the lash is painted on the head skin.
def lash_th(psi):
    """the upper lash thickness (sheet, radius units of the opening): thickest over the top (~0.022 W), thinning down the outer side to
    just under mid-height and into the inner corner; no line under the eye. psi: 0 = outer corner, pi/2 = top, pi = inner corner"""
    p = np.where(psi < -PI / 2, psi + 2 * PI, psi)
    top = 1.45 * (.105 * np.sin(np.clip(p, 0, PI)) ** .70 + .040 * np.exp(-((p - .75) / .55) ** 2))
    base = .040 * smooth(.30, .70, p) * smooth(PI + .40, PI - .10, p)
    outer = 0. * p
    return top + base + outer
LASH_OFF, LASH_IN = .0042, .0080
LASH_K_IN = .965                 # the roll's inner edge (opening radius units); the rig lowers it to cover the lid's rest edge
LASH_INFO = {}
def lash_geom(s):
    """the lash roll and its wing (metres): V, F, the wing tip, the top point (shared by the model and the rig)"""
    ps = np.linspace(.10, PI - .10, 28); th = np.maximum(np.asarray(lash_th(ps), float), .035) * (.40 + .60 * smooth(.10, .80, ps))
    FR = np.linspace(0, 1, 5)
    rows = []
    for fr in FR:
        k = LASH_K_IN + (1 + th - LASH_K_IN) * fr
        rows.append(np.array([eye_pts(s, np.array([p_]), float(k_))[0] for p_, k_ in zip(ps, k)]))
    G = np.array(rows).transpose(1, 0, 2)
    tt = np.linspace(0, 1, 8); pw = .30 + .10 * tt; kw = 1.03 + .24 * tt; dw = .11 * (1 - .82 * tt) + .010
    Gw = np.array([[eye_pts(s, np.array([p_ - d_]), float(k_))[0], eye_pts(s, np.array([p_]), float(k_ + .02))[0],
                    eye_pts(s, np.array([p_ + d_]), float(k_))[0]] for p_, k_, d_ in zip(pw, kw, dw)])
    V = []; F = []
    for Gg in (G, Gw):
        nc, nr = Gg.shape[:2]; N_ = grad(head_sdf, Gg.reshape(-1, 3)).reshape(Gg.shape)
        bul = (.55 + .45 * np.sin(PI * np.linspace(0, 1, nr)))[None, :, None]
        Out = Gg + N_ * LASH_OFF * bul; In = Gg - N_ * LASH_IN
        loop = np.concatenate([Out, In[:, ::-1]], 1); m = loop.shape[1]; b0 = len(V)
        V += list(loop.reshape(-1, 3))
        for i in range(nc - 1):
            for j in range(m):
                jj = (j + 1) % m; F.append((b0 + i * m + j, b0 + (i + 1) * m + j, b0 + (i + 1) * m + jj, b0 + i * m + jj))
        for i_end, rev in ((0, True), (nc - 1, False)):
            c = len(V); V.append(loop[i_end].mean(0) + (loop[i_end].mean(0) - loop[min(i_end + 1, nc - 1) if i_end == 0 else i_end - 1].mean(0)) * .35)
            for j in range(m):
                jj = (j + 1) % m; f = (b0 + i_end * m + j, b0 + i_end * m + jj, c); F.append(f[::-1] if rev else f)
    return np.array(V), F, Gw[-1, 1], G[len(ps) // 2, -1]
def lash_roll(s, tag):
    V, F, wt, tp = lash_geom(s)
    uvc = ramp_uv('eyedark', np.array([.40]))[0]
    make_obj('lash.' + tag, V, F, np.tile(uvc, (len(V), 1)), 'lash.' + tag)
    LASH_INFO[tag] = {'wing_tip_m': [round(float(c), 4) for c in wt], 'top_m': [round(float(c), 4) for c in tp]}
for _s, _t in ((1, 'L'), (-1, 'R')):
    if RIG: V_, F_, wt_, tp_ = lash_geom(_s); LASH_INFO[_t] = {'wing_tip_m': [round(float(c), 4) for c in wt_], 'top_m': [round(float(c), 4) for c in tp_]}
    else: lash_roll(_s, _t)          # (the rig builds the same rolls itself, weighted to lidU and pushed to sit on the shut lid)
LOG['lash'] = LASH_INFO

def ramp_sw(name, hi=.28, occ=0., add=0.):          # for sweep(): uvfn(NV, tt, uu, V)
    return lambda NV, tt, uu, V: ramp_uv(name, sval(NV, occ=occ, hi=hi) + add)
def ramp_fn(name, hi=.28, occ=0., add=0.):          # for star_mesh() / ring_stack(): uvfn(NN, V)
    return lambda NN, V, *a: ramp_uv(name, sval(NN, occ=occ, hi=hi) + add)
def mix_uv(chart, shade, tone):
    x, y, w, h = CHARTS[chart]; s_ = clamp(np.asarray(shade, float)); l_ = clamp(np.asarray(tone, float)) * np.ones_like(s_)
    return np.stack([(x + 8 + s_ * (w - 16)) / 2048, (y + 8 + l_ * (h - 16)) / 2048], -1)
def gradL(f, p, e=1e-4):
    g = np.zeros_like(p)
    for k in range(3):
        dp = np.zeros(3); dp[k] = e; g[:, k] = f(p + dp) - f(p - dp)
    return unit(g)
def push_out(P, clear, f, it=8):
    P = np.array(P, float, copy=True); clear = np.broadcast_to(np.asarray(clear, float), (len(P),))
    for _ in range(it):
        d = f(P); need = np.maximum(clear - d, 0)
        if need.max() < 1e-6: break
        P = P + gradL(f, P) * need[:, None]
    return P
def head_point(x, z, yref=-.30, f=head_sdf):
    """the head surface (metres) seen from O toward the W-unit point (x, yref, z), and its normal"""
    d = unit(L2M(np.array([[x, yref, z]], float)) - O); P = radial_hit_outer(d, f=f); return P[0], grad_n(P, f=f)[0]

