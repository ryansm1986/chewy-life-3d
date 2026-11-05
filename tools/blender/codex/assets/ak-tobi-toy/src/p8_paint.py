
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
    top = 1.50 * (.105 * np.sin(np.clip(p, 0, PI)) ** .70 + .040 * np.exp(-((p - .75) / .55) ** 2))
    base = .045 * smooth(-.70, -.10, p) * smooth(PI + .40, PI - .10, p)
    outer = .090 * smooth(-.70, -.10, p) * (1 - smooth(.30, .80, p))
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
    """the cream muzzle patch (front projection, W units): a soft egg round the snout (centre z 0.19, 0.212 W half-wide, its top at
    z 0.335, its bottom 0.065), plus the chin's underside and the neck (cream, like the chest V)."""
    qx, qy, qz = q[:, 0], q[:, 1], q[:, 2]; ax_ = np.abs(qx)
    hz = np.where(qz > .19, .145, .158)
    r = (np.abs(qx / .212) ** 2.2 + np.abs((qz - .19) / hz) ** 2.2) ** (1 / 2.2)
    aa = .045
    m = (1 - smooth(1 - aa, 1 + aa, r)) * smooth(-.20, -.32, qy)                  # front only (the snout)
    under = smooth(-.55, -.85, n[:, 2]) * smooth(.20, .12, ax_) * smooth(-.10, -.25, qy) * (qz < .05)
    neck = smooth(.0, -.04, qz) * smooth(.02, -.08, qy) * smooth(.26, .18, ax_)
    return clamp(np.maximum.reduce([m, under, neck]))
def paint_head(U, V, P=None):
    sh = U.shape; d = head_uv_dir(U.ravel(), V.ravel()); P = paint_hit(d) if P is None else P; n = grad_n(P)
    x, y, z = P[:, 0], P[:, 1], P[:, 2]; q = M2L(P); qx, qz = q[:, 0], q[:, 2]; ax_ = np.abs(qx)
    fr = smooth(HY + .04, HY - .08, y)
    C = ramp_colour('fur', sval(n, hi=.12, lo=.20))
    # soft clay creases where the muzzle, the chin and the tufts meet the skull (fillet shading, never lines)
    dsk = skull(q); dch = smin(dsk, ell(q, *CHEEK), K_CHEEK)
    cr = .22 * crease(dch, muz_sdf(q), K_MUZ) + .18 * crease(smin(dch, muz_sdf(q), K_MUZ), ell(q, *CHINB), K_CHINB)
    C = mix(C, rgb('furdark'), clamp(cr) * .35)
    # the ears' contact shade on the head where the ears lie over it (a soft value-only shade, no hue shift)
    dear = np.abs(qx) - (drape(q[:, 1], qz) - .03)
    C = mix(C, rgb('furdark'), .30 * smooth(-.10, .0, dear) * smooth(-.18, .0, q[:, 1]) * smooth(.84, .76, qz) * smooth(.06, .14, qz))
    # the white lower face
    wm = white_face(q, n)
    C = mix(C, ramp_colour('white', sval(n, hi=.10, lo=.16) - .06 * smooth(.10, -.05, qz)), wm)
    # blush, over the white / fur border on the cheeks
    bx, bz, bw, bh = BLUSH
    for s in (-1, 1):
        r = np.sqrt(((x - s * bx) / bw) ** 2 + ((z - bz) / bh) ** 2)
        C = mix(C, rgb('blush'), .92 * (1 - smooth(.55, 1.08, r)) * fr * PAINT_OPTS['blush'])
    # brows: soft dark arcs (sheet: centres +-0.205 W at 0.519 W, 0.111 W long, 0.044 W tall with the arc), rounded ends
    t_ = np.linspace(-1, 1, 13)
    for s in (-1, 1):
        Pb = np.stack([s * (.239 + .058 * t_), .546 + .016 * (1 - t_ ** 2) - .008 * t_], -1)
        hb = .0030 + .0118 * (1 - t_ ** 2) ** .65
        near = (np.abs(qx - s * .239) < .10) & (qz > .49) & (qz < .62)
        a = np.zeros(len(x)); a[near] = stroke(qx[near], qz[near], Pb, hb, .0045)
        C = mix(C, rgb('brow'), .95 * a * fr)
    # nose: dark, a soft top highlight
    qq = q - NOSE_C; qq[:, 1] = qq[:, 1] - nose_recede(qq[:, 2]); widen = nose_widen(qq[:, 2]); qq[:, 2] = qq[:, 2] * nose_flat(qq[:, 2])
    rn = np.sqrt((qq[:, 0] / (NHW * widen)) ** 2 + (qq[:, 1] / NHD) ** 2 + (qq[:, 2] / NHH) ** 2)
    zr_ = (qz - NZW) / NHH; hw_ = NOSE_PW * (.28 + .72 * smooth(-1.0, .65, zr_)) * np.sqrt(np.clip(1 - np.clip(zr_ - .55, 0, 1) ** 2 / .45 ** 2 * .35, 0, 1))
    r2d = np.sqrt((qx / np.maximum(hw_, 1e-4)) ** 2 + ((zr_ - .03) / 1.03) ** 2)
    deep = (q[:, 1] - NOSE_TIP_L)
    nose_m = (1 - smooth(.94, 1.02, r2d)) * smooth(.07, .05, deep) * (n[:, 1] < .2)
    nose_c = ramp_colour('nose', sval(n, hi=.10, lo=.22) - .02)
    C = mix(C, nose_c, .98 * np.maximum(nose_m, 1 - smooth(1.05, 1.12, rn)))
    rh_ = np.sqrt(((qq[:, 0] + .007) / .017) ** 2 + ((qq[:, 2] - .012) / .007) ** 2) + 9 * (qq[:, 1] > .014)
    C = mix(C, rgb('nosehi'), .65 * (1 - smooth(.40, 1.0, rh_)) * np.maximum(rn < 1.10, nose_m > .5))
    # the sculpted mouth: no painted line; a darker shade on the groove walls only, by depth behind the un-grooved surface
    mb = (fr > 0) & mouth_mask(q) & (q[:, 2] < NZW - .80 * NHH)
    if mb.any():
        dep = -head_local_pre(q[mb])
        C[mb] = mix(C[mb], rgb('#D8B49A'), .35 * smooth(.0004, .0020, dep))      # only a whisper of the sculpted groove
    # round 2: the painted smile line (#493044, 0.012 W): one clean curve each side from the philtrum out to gently curled corners
    t_m = np.linspace(-1.03, 1.03, 61); Pm = mouth_arch(t_m)
    hm = .0056 * (1 - .40 * smooth(.80, 1.03, np.abs(t_m))) + .0012
    Pp = np.array([[0, NZW - NHH + .004], [0, MA_C + MA_CUSP]]); hp = np.array([.0050, .0056])
    nm = (fr > 0) & (np.abs(qx) < .15) & (qz > .10) & (qz < NZW)
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
        Pw = np.stack([1.00 + .24 * tt_, .36 + .20 * tt_ ** 1.2], -1)
        hw_w = .120 * (1 - .80 * tt_) + .010
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
        hw_ = NOSE_PW * (.28 + .72 * smooth(-1.0, .65, zr_)) * np.sqrt(np.clip(1 - np.clip(zr_ - .55, 0, 1) ** 2 / .45 ** 2 * .35, 0, 1))
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

IRIS_RX_W, IRIS_RZ_W = .0715, .0915                  # the iris (sheet close-up): 0.143 x 0.183 W, a tall oval
def paint_eye(U, V, s):
    Xs = (U - .5) * 2.4; Z = (V - .5) * 2.4         # Xs: screen right (the chart's u runs to screen right for both eyes)
    Xo = s * Xs                                      # outward
    sr = eye_norm(Xo, Z)[0]
    hw = EYEF[s]['hw'] / W; hh = EYEF[s]['hh'] / W
    Xm = Xo * hw; Zm = Z * hh                        # metric eye-plane coordinates (W units), outward / up
    ixm = -.033; izm = -.010                         # the iris tucked toward the nose; white crescents on the outer side
    C = mix(rgb('sclera'), rgb('#EADCD4'), .55 * smooth(.25, .95, Z))
    ex = (Xm - ixm) / IRIS_RX_W; ez = (Zm - izm) / IRIS_RZ_W; r = np.sqrt(ex * ex + ez * ez)
    g = smooth(.70, -.85, ez)                        # 0 at the top .. 1 at the bottom
    I = mix(rgb('#24140E'), rgb('#4A2C1E'), smooth(.15, .55, g))
    I = mix(I, rgb('iris'), smooth(.45, .80, g))
    I = mix(I, rgb('irisglow'), .55 * smooth(.72, 1.0, g) * (1 - smooth(.60, .92, r)))
    I = mix(I, rgb('#2A1810'), .70 * smooth(.86, .99, r))
    C = mix(C, I, 1 - smooth(.985, 1.015, r))
    pxm = ixm; pzm = izm + .012
    Rp = np.sqrt(((Xm - pxm) / .046) ** 2 + ((Zm - pzm) / .062) ** 2)
    C = mix(C, rgb('#1E120E'), .55 * (1 - smooth(.90, 1.10, Rp)))
    # catchlights (sheet): a big round one high on the iris's centre line, a small one low on the outer side
    big = np.sqrt(((Xm - (ixm + .002)) / .0175) ** 2 + ((Zm - (izm + .052)) / .0185) ** 2)
    small = np.sqrt(((Xm - (ixm + .036)) / .0075) ** 2 + ((Zm - (izm - .060)) / .0060) ** 2)
    C = mix(C, rgb('#FFFBF6'), np.maximum(1 - smooth(.90, 1.08, big), .85 * (1 - smooth(.86, 1.12, small))))
    C = mix(C, rgb('lash'), smooth(.90, 1.0, sr) * smooth(-.30, .30, Z))
    skin = ramp_colour('fur', .45)
    return mix(C, skin, smooth(1.03, 1.07, sr))

LIGHT_SYM = unit(np.array([0., -.35, 1.]))
def sval_sym(n, hi=.26, lo=.22, occ=0.):
    d = np.asarray(n) @ LIGHT_SYM
    return clamp(.50 + hi * smooth(.0, .95, d) - lo * smooth(.05, .95, -d) - occ)
def paint_ear(U, V):
    """the floppy ears: u = around the section (theta), v = root .. lobe; tan fur shaded by the ear's own normals (value only, a
    symmetric light, so both ears share the chart), a soft shade on the face toward the head and toward the lobe's underside"""
    sh = U.shape; u = U.ravel(); v = V.ravel()
    s_, NG = EAR_GRID['L']; R, C_ = NG.shape[:2]
    fk = np.interp(v, s_, np.arange(R)); k0 = np.clip(fk.astype(int), 0, R - 2); tk = fk - k0
    fj = np.clip(u * (C_ - 1), 0, C_ - 1.001); j0 = fj.astype(int); tj = fj - j0
    n = (NG[k0, j0] * ((1 - tk) * (1 - tj))[:, None] + NG[k0 + 1, j0] * (tk * (1 - tj))[:, None] + NG[k0, j0 + 1] * ((1 - tk) * tj)[:, None]
         + NG[k0 + 1, j0 + 1] * (tk * tj)[:, None])
    n = unit(n); n[:, 0] = np.abs(n[:, 0])
    th = u * 2 * PI; inner = smooth(-.2, -.8, np.sin(th))
    sv = sval_sym(n, hi=.22, lo=.22) - .12 * inner
    return ramp_colour('ear', sv).reshape(sh + (3,))
def paint_tail(U, V):
    sh = U.shape; U = U.ravel(); V = V.ravel()
    ph = U * 2 * PI; k = V * (TAIL['rings'] - 1)
    tk = TAIL['tk']; idx = np.clip(np.searchsorted(tk, V) - 1, 0, len(tk) - 2); f = clamp((V - tk[idx]) / (tk[idx + 1] - tk[idx]))
    Bv = unit(TAIL['B'][idx] * (1 - f[:, None]) + TAIL['B'][idx + 1] * f[:, None]); Xv = TAIL['X'][idx]
    n = unit(Xv * np.sin(ph)[:, None] - Bv * np.cos(ph)[:, None])
    sv = sval(n, hi=.24, lo=.24, occ=.12 * smooth(.20, .0, V))
    # the white tip (sheet): lower on the outer / back side of the curve (phi = pi) than on the inner side, with a soft flame edge
    tw = .700 + .060 * np.cos(ph) + .028 * np.sin(3 * ph + .6) + .030 * np.abs(np.sin(5 * ph + 1.9)) + .010 * np.sin(11 * ph + .3)
    wht = smooth(-.012, .012, V - tw)
    C = ramp_colour('fur', sv)
    C = mix(C, mix(ramp_colour('white', sv + .04), rgb('#F8F6FA'), .65), wht)          # a cool white tip (the face white is warmer)
    C = mix(C, rgb('furdark'), .25 * smooth(.10, .0, V))
    return C.reshape(sh + (3,))
def paint_torso(U, V):
    sh = U.shape; U = U.ravel(); V = V.ravel()
    a = U * 2 * PI - PI; z = TZ[0] + V * (TZ[-1] - TZ[0])
    P = torso_raw(a, z); n = torso_n(a, z); x = P[:, 0]
    sv = sval(n, hi=.24, lo=.20)
    hw = np.where(z > ZN, VHW, white_hw(z))
    white = (1 - smooth(-.002, .002, np.abs(x) - hw)) * (np.cos(a) > 0) * smooth(ZX - .004, ZX + .004, z)
    C = ramp_colour('gi', sv + .04)
    C = mix(C, ramp_colour('white', sv - .02), white)
    C = mix(C, rgb('gidark'), .35 * smooth(.42, .34, z))               # a soft shade into the belt
    C = mix(C, rgb('#D8CCD0'), .45 * white * smooth(ZX + .06, ZX, z))  # the V's point in the lapels' shade
    return C.reshape(sh + (3,))
def paint_ramp(U, V):
    rows = np.clip((V * CHARTS['ramp'][3] / 32).astype(int), 0, 15); C = np.zeros(U.shape + (3,))
    for name, k in RAMP_ROWS.items():
        m = rows == k
        if not m.any(): continue
        C[m] = ramp_colour(name, U[m])
    return C
def paint_furmix(U, V): return mix(ramp_colour('fur', U), ramp_colour('white', U), V)          # v: 0 orange fur .. 1 white fur
def paint_kimmix(U, V): return mix(ramp_colour('gi', U), mix(ramp_colour('gi', U + .20), rgb('#6C88A8'), .30), V)          # v: tone (lighter)
def paint_skmix(U, V): return mix(ramp_colour('hakama', U), mix(ramp_colour('hakama', U + .16), rgb('#4E6278'), .30), V)
PAINTERS = {'head': paint_head_aa, 'eye.L': lambda U, V: paint_eye(U, V, 1), 'eye.R': lambda U, V: paint_eye(U, V, -1),
            'ramp': paint_ramp, 'furmix': paint_furmix, 'kimmix': paint_kimmix, 'skmix': paint_skmix, 'ear': paint_ear}
if not HEAD_ONLY: PAINTERS.update({'torso': paint_torso})
if RIG:
    PAINTERS['cavity'] = lambda U, V: mix(rgb('#4a1c2c'), rgb('#341220'), .55 * smooth(.25, 1., V))
    PAINTERS['tongue'] = lambda U, V: mix(rgb('#e07a8e'), rgb('#ee9aac'), .45 * smooth(.15, .9, V))
atlas = np.empty((2048, 2048, 4), np.uint8); atlas[:] = [232, 194, 146, 255]
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
atlas_path = os.path.join(ROOT, 'scratch', 'head_atlas.png') if HEAD_ONLY else (os.path.join(ROOT, 'scratch', 'rig_base_atlas.png') if RIG else os.path.join(ROOT, 'ak-tobi-toy_atlas.png'))
write_png(atlas_path, atlas)
del atlas
img = bpy.data.images.load(atlas_path); img.name = 'Tobi_toy_painted_atlas_2048'; img.pack()
MAT = bpy.data.materials.new('Tobi_toy_atlas'); MAT.use_nodes = True
bs = next(n_ for n_ in MAT.node_tree.nodes if n_.type == 'BSDF_PRINCIPLED'); bs.inputs['Roughness'].default_value = .8
bs.inputs['Metallic'].default_value = 0; bs.inputs['Specular IOR Level'].default_value = .25
tx = MAT.node_tree.nodes.new('ShaderNodeTexImage'); tx.image = img; tx.interpolation = 'Linear'
MAT.node_tree.links.new(tx.outputs['Color'], bs.inputs['Base Color'])

# ============================================================== THE UPPER LASH: its own object per eye (the Takemori lesson)
# A thick tapered roll lying on the skin where the lash goes (the opening's superellipse from just inside the rim, k 0.965, out to
# 1 + lash_th(psi)), its face 6 mm proud of the skin and its back 1 cm inside it (hidden at rest; the rig weights it 100% to lidU), with
# the small wing flick at the outer corner (sheet: out to 1.2 x the half-width at +0.28 of the half-height). No lash paint on the skin.
LASH_OFF, LASH_IN = .0060, .0100
def lash_roll(tag):
    s = 1 if tag == 'L' else -1
    ps = np.linspace(.12, PI + .14, 26); th = np.maximum(np.asarray(lash_th(ps), float), .035)
    rows = []
    for fr in (0., .50, 1.):
        k = .965 + (1 + th - .965) * fr
        rows.append(np.array([eye_pts(s, np.array([p_]), float(k_))[0] for p_, k_ in zip(ps, k)]))
    G = np.array(rows).transpose(1, 0, 2)
    tt = np.linspace(0, 1, 7); pw = .30 + .06 * tt; kw = 1.00 + .24 * tt; dw = .11 * (1 - .80 * tt) + .012
    Gw = np.array([[eye_pts(s, np.array([p_ - d_]), float(k_))[0], eye_pts(s, np.array([p_ + d_]), float(k_))[0]] for p_, k_, d_ in zip(pw, kw, dw)])
    V = []; F = []
    for Gg in (G, Gw):
        nc, nr = Gg.shape[:2]; N_ = grad(head_sdf, Gg.reshape(-1, 3)).reshape(Gg.shape)
        Out = Gg + N_ * LASH_OFF; In = Gg - N_ * LASH_IN
        loop = np.concatenate([Out, In[:, ::-1]], 1); m = loop.shape[1]; b0 = len(V)
        V += list(loop.reshape(-1, 3))
        for i in range(nc - 1):
            for j in range(m):
                jj = (j + 1) % m; F.append((b0 + i * m + j, b0 + (i + 1) * m + j, b0 + (i + 1) * m + jj, b0 + i * m + jj))
        for i_end, rev in ((0, True), (nc - 1, False)):
            c = len(V); V.append(loop[i_end].mean(0))
            for j in range(m):
                jj = (j + 1) % m; f = (b0 + i_end * m + j, b0 + i_end * m + jj, c); F.append(f[::-1] if rev else f)
    V = np.array(V); uvc = ramp_uv('eyedark', np.array([.40]))[0]
    return make_obj('lash.' + tag, V, F, np.tile(uvc, (len(V), 1)), 'lash.' + tag)
for _t in 'LR': lash_roll(_t)
