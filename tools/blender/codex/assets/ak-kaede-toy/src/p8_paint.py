
# ============================================================== PAINTED ATLAS
def stroke(x, z, P, half, aa):
    best = np.full(len(x), 9.)
    for i in range(len(P) - 1):
        a = P[i]; b = P[i + 1]; ab = b - a; L2 = ab @ ab
        t = np.clip(((x - a[0]) * ab[0] + (z - a[1]) * ab[1]) / L2, 0, 1)
        dx = x - (a[0] + t * ab[0]); dz = z - (a[1] + t * ab[1])
        best = np.minimum(best, np.sqrt(dx * dx + dz * dz) - (half[i] * (1 - t) + half[i + 1] * t))
    return 1 - smooth(-aa, aa, best)
def paint_hit(d):
    P = radial_hit(d); t = np.linalg.norm(P - O, axis=1)
    bad = np.zeros(len(d), bool)
    for k in range(1, 9):
        tk = np.minimum(t + .012 * k, .52); bad |= head_sdf(O + d * tk[:, None]) < 0
    if bad.any(): P[bad] = radial_hit_outer(d[bad])
    return P
def ell_r(q, c, r): return np.sqrt((((q - np.array(c)) / np.array(r)) ** 2).sum(1))
def white_face(q, n):
    """the cream lower face (front projection, W units; the head close-up): the muzzle, the lower cheeks and the jaw under a soft,
    nearly level edge (0.31 W at the centre, 0.25 under the eyes, 0.29 at |x| 0.40), down through the middle of the cheek tufts
    (their lower halves are cream, also seen from the side and the back); the chin's underside and the neck are cream. Round the
    back of the jaw the fur is orange."""
    qx, qy, qz = q[:, 0], q[:, 1], q[:, 2]; ax_ = np.abs(qx)
    top = np.interp(ax_, [0, .04, .08, .12, .16, .22, .28, .34, .40, .46, .50, .54, .60], [.312, .310, .300, .266, .250, .250, .258, .274, .288, .278, .258, .236, .222])
    aa = .010
    top = top - .085 * smooth(-.30, .12, qy) * smooth(.20, .40, ax_) * (1 - smooth(.44, .53, ax_))          # the edge slopes down toward the tufts (side view)
    m = 1 - smooth(-aa, aa, qz - top)
    yb = np.interp(ax_, [0, .30, .40, .48, .60], [.00, .00, .06, .14, .16])          # how far back the cream reaches (the tufts sweep back)
    m = m * smooth(yb + .07, yb - .05, qy)
    under = smooth(-.25, -.60, n[:, 2]) * (ax_ < .34) * smooth(.14, .00, qy) * (qz < .08)
    neck = smooth(.0, -.04, qz) * smooth(.00, -.10, qy) * (ax_ < .26)
    return clamp(np.maximum.reduce([m, under, neck]))
def paint_head(U, V, P=None):
    sh = U.shape; d = head_uv_dir(U.ravel(), V.ravel()); P = paint_hit(d) if P is None else P; n = grad_n(P)
    x, y, z = P[:, 0], P[:, 1], P[:, 2]; q = M2L(P); qx, qz = q[:, 0], q[:, 2]; ax_ = np.abs(qx)
    fr = smooth(HY + .04, HY - .08, y)
    C = ramp_colour('fur', sval(n, hi=.12, lo=.20))
    # soft clay creases where the muzzle, the chin and the tufts meet the skull (fillet shading, never lines)
    dsk = skull(q); dch = smin(dsk, ell(q, *CHEEK), K_CHEEK)
    cr = .22 * crease(dch, muz_sdf(q), K_MUZ) + .18 * crease(smin(dch, muz_sdf(q), K_MUZ), ell(q, *CHINB), K_CHINB) \

    C = mix(C, rgb('furdark'), clamp(cr) * .12)
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
    # brows: soft dark arcs (sheet: centres +-0.205 W at 0.557 W, 0.136 W long, 0.03 W thick at the middle), tapering ends, the outer end lower
    t_ = np.linspace(-1, 1, 15)
    for s in (-1, 1):
        Pb = np.stack([s * (.208 + .066 * t_), .548 + .018 * (1 - t_ ** 2) - .006 * t_], -1)
        hb = .0030 + .0150 * (1 - t_ ** 2) ** .65 * (1 + .12 * t_)
        near = (np.abs(qx - s * .208) < .10) & (qz > .49) & (qz < .62)
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
    rh_ = np.sqrt(((qq[:, 0] + .007) / .017) ** 2 + ((qq[:, 2] - .012) / .007) ** 2) + 9 * (qq[:, 1] > .014)
    C = mix(C, rgb('nosehi'), .65 * (1 - smooth(.40, 1.0, rh_)) * np.maximum(rn < 1.10, nose_m > .5))
    # the sculpted mouth: no painted line; a darker shade on the groove walls only, by depth behind the un-grooved surface
    mb = (fr > 0) & mouth_mask(q) & (q[:, 2] < NZW - .80 * NHH)
    if mb.any():
        dep = -head_local_pre(q[mb])
        C[mb] = mix(C[mb], rgb('#C89A8C'), .35 * smooth(.0004, .0020, dep))      # only a whisper of the sculpted groove
    # the painted smile line (0.011 W): the sheet's small "w", one clean curve each side of the cusp out to gently curled corners
    t_m = np.linspace(-1.03, 1.03, 61); Pm = mouth_arch(t_m)
    hm = .0050 * (1 - .40 * smooth(.80, 1.03, np.abs(t_m))) + .0012
    Pp = np.array([[0, NZW - NHH + .004], [0, MA_C + MA_CUSP]]); hp = np.array([.0044, .0050])
    nm = (fr > 0) & (np.abs(qx) < .13) & (qz > .10) & (qz < NZW)
    if nm.any():
        a = stroke(qx[nm], qz[nm], Pm, hm, .0026)
        C[nm] = mix(C[nm], rgb('brow'), .96 * a)
    # the eyes: no painted lash (it is the 3-D roll Kaede_lash_L/R); a faint warm contact shade under the roll only
    for s in (-1, 1):
        sr, psi, X, Z = eye_s3(s, P)
        near_eye = fr * (sr < 2.2)
        th = lash_th(psi)
        band = (1 - smooth(1 + th + .02, 1 + th + .10, sr)) * smooth(.004, .02, th) * (sr > .95)
        C = mix(C, rgb('furdark'), .30 * band * near_eye * PAINT_OPTS.get('eyeband', True))
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

IRIS_RX_W, IRIS_RZ_W = .071, .092                    # the iris (sheet close-up): 0.136 x 0.178 W, a tall oval filling the height
def paint_eye(U, V, s):
    Xs = (U - .5) * 2.4; Z = (V - .5) * 2.4         # Xs: screen right (the chart's u runs to screen right for both eyes)
    Xo = s * Xs                                      # outward
    sr = eye_norm(Xo, Z)[0]
    hw = EYEF[s]['hw'] / W; hh = EYEF[s]['hh'] / W
    Xm = Xo * hw; Zm = Z * hh                        # metric eye-plane coordinates (W units), outward / up
    ixm = -.034; izm = -.004                         # the iris tucked toward the nose (sheet 0.038 W); white crescents on the outer side
    C = mix(rgb('sclera'), rgb('#EADFDA'), .55 * smooth(.25, .95, Z))
    ex = (Xm - ixm) / IRIS_RX_W; ez = (Zm - izm) / IRIS_RZ_W; r = np.sqrt(ex * ex + ez * ez)
    g = smooth(.65, -.80, ez)                        # 0 at the top .. 1 at the bottom
    I = mix(rgb('#4A2C16'), rgb('#A46A2A'), smooth(.10, .50, g))
    I = mix(I, rgb('iris'), smooth(.40, .78, g))
    I = mix(I, rgb('irisglow'), .65 * smooth(.70, 1.0, g) * (1 - smooth(.62, .92, r)))
    I = mix(I, rgb('#5A3418'), .75 * smooth(.84, .99, r))
    I = I * (1 - .040 * (.5 + .5 * np.sin(np.arctan2(ez, ex) * 22 + r * 8)) * smooth(.45, .80, r))[..., None]
    C = mix(C, I, 1 - smooth(.985, 1.015, r))
    pxm = ixm - .012; pzm = izm + .014                # (sheet: the pupil 0.08 x 0.133 W, toward the nose and up in the iris)
    Rp = np.sqrt(((Xm - pxm) / .0410) ** 2 + ((Zm - pzm) / .0665) ** 2)
    C = mix(C, rgb('#2A1A16'), 1 - smooth(.96, 1.04, Rp))
    # catchlights, the same light for both eyes (upper left on screen): a big round one and a small one lower right
    sl = -s                                          # screen-left in outward units
    big = np.sqrt(((Xm - (pxm + sl * .010)) / .0205) ** 2 + ((Zm - (pzm + .030)) / .0215) ** 2)
    small = np.sqrt(((Xm - (pxm - sl * .030)) / .0070) ** 2 + ((Zm - (pzm - .040)) / .0085) ** 2)
    C = mix(C, rgb('#FFFBF6'), np.maximum(1 - smooth(.90, 1.08, big), .85 * (1 - smooth(.86, 1.12, small))))
    C = mix(C, rgb('lash'), smooth(.90, 1.0, sr) * smooth(.15, .55, Z))
    skin = ramp_colour('fur', .45)
    return mix(C, skin, smooth(1.03, 1.07, sr))

LIGHT_SYM = unit(np.array([0., -.35, 1.]))
def sval_sym(n, hi=.26, lo=.22, occ=0.):
    d = np.asarray(n) @ LIGHT_SYM
    return clamp(.50 + hi * smooth(.0, .95, d) - lo * smooth(.05, .95, -d) - occ)
def paint_ear(U, V):
    """the pyramid ears (round 3): u = around the section (0 = back, 0.5 = the front face), v = VV along the ear (root < 0 .. tip 1)"""
    sh = U.shape; U = U.ravel(); V = V.ravel()
    th = U * 2 * PI; VV = np.clip(V * 1.42 - .30, -.30, 1.12)
    bx, by, n2 = sec_boundary(th)
    FM, T, A, Nf, Lt = ear_frame(1); Bk = -Nf
    n = unit(Lt[None] * n2[:, 0:1] + Bk[None] * n2[:, 1:2] + A[None] * .28)
    sv = sval(n, hi=.18, lo=.18)
    C = ramp_colour('ear', sv + .02)
    # the dark cap all round (front and back), its lower edge tilted: low down the outer rim, higher on the inner edge (sheet)
    vd = EAR_DARK_VV - EAR_DARK_TILT * np.clip(bx / EAR_SEC['ax'], -1, 1)
    C = mix(C, ramp_colour('tip', sv), smooth(-.020, .020, VV - vd))
    # the pink inner ear on the front face: a broad triangle inside a soft rim (dark on the outer top, fur on the inner side)
    hwp = .192 * np.clip(1 - .94 * VV / EAR_PINK_TOP_VV, .03, 1) ** .80 / np.maximum(1 - (1 - EAR_SC_TIP) * np.clip(VV, 0, 1) ** EAR_Q, .2)
    front = smooth(.55, .85, -n2[:, 1]); lat = 1 - smooth(hwp - .022, hwp + .004, np.abs(bx + .012))
    pinkm = front * lat * smooth(-.02, .04, VV) * (1 - smooth(EAR_PINK_TOP_VV - .04, EAR_PINK_TOP_VV + .01, VV))
    deep = np.clip(1 - (bx / .145) ** 2, 0, 1) * smooth(.10, .30, VV)
    C = mix(C, ramp_colour('inner', .46 - .12 * deep), pinkm)
    return C.reshape(sh + (3,))
def paint_tail(U, V):
    sh = U.shape; U = U.ravel(); V = V.ravel()
    ph = U * 2 * PI; k = V * (TAIL['rings'] - 1)
    tk = TAIL['tk']; idx = np.clip(np.searchsorted(tk, V) - 1, 0, len(tk) - 2); f = clamp((V - tk[idx]) / (tk[idx + 1] - tk[idx]))
    Bv = unit(TAIL['B'][idx] * (1 - f[:, None]) + TAIL['B'][idx + 1] * f[:, None]); Xv = TAIL['X'][idx]
    n = unit(Xv * np.sin(ph)[:, None] - Bv * np.cos(ph)[:, None])
    sv = sval(n, hi=.24, lo=.24, occ=.12 * smooth(.20, .0, V))
    # the cream tip (sheet: the distal third, a clean curved border with a soft cloud edge), lower on the outer / back side of the curve
    tw = .660 + .045 * np.cos(ph) + .024 * np.sin(3 * ph + .6) + .026 * np.abs(np.sin(5 * ph + 1.9)) + .008 * np.sin(11 * ph + .3)
    wht = smooth(-.012, .012, V - tw)
    C = ramp_colour('fur', sv)
    C = mix(C, ramp_colour('white', sv + .02), wht)
    C = mix(C, rgb('furdark'), .25 * smooth(.10, .0, V))
    return C.reshape(sh + (3,))
def paint_torso(U, V):
    sh = U.shape; U = U.ravel(); V = V.ravel()
    a = U * 2 * PI - PI; z = TZ[0] + V * (TZ[-1] - TZ[0])
    P = torso_raw(a, z); n = torso_n(a, z); x = P[:, 0]
    sv = sval(n, hi=.24, lo=.20)
    C = ramp_colour('kim', sv + .04)
    # the soft shade on the under panel just past the wrap's edge (her right of it), from under the kerchief down into the obi
    inz = smooth(WRAP_BOT[1] - .02, WRAP_BOT[1] + .01, z) * smooth(WRAP_TOP[1] + .02, WRAP_TOP[1] - .01, z) * (np.cos(a) > 0)
    C = mix(C, rgb('kimdark'), .45 * inz * np.exp(-((wrap_x(z) - x - .012) / .011) ** 2))
    C = mix(C, rgb('kimdark'), .30 * smooth(.40, .33, z))               # a soft shade into the obi
    C = mix(C, rgb('kimdark'), .30 * smooth(.535, .575, z))             # and under the kerchief
    return C.reshape(sh + (3,))
def paint_ramp(U, V):
    rows = np.clip((V * CHARTS['ramp'][3] / 32).astype(int), 0, 15); C = np.zeros(U.shape + (3,))
    for name, k in RAMP_ROWS.items():
        m = rows == k
        if not m.any(): continue
        C[m] = ramp_colour(name, U[m])
    return C
def paint_furmix(U, V): return mix(ramp_colour('fur', U), ramp_colour('white', U), V)          # v: 0 orange fur .. 1 white fur
def paint_kimmix(U, V): return mix(ramp_colour('kim', U), mix(ramp_colour('kim', U + .20), rgb('#B85444'), .30), V)          # v: tone (lighter)
def paint_skmix(U, V): return mix(ramp_colour('trous', U), mix(ramp_colour('trous', U + .16), rgb('#704A40'), .30), V)
PAINTERS = {'head': paint_head_aa, 'eye.L': lambda U, V: paint_eye(U, V, 1), 'eye.R': lambda U, V: paint_eye(U, V, -1),
            'ramp': paint_ramp, 'furmix': paint_furmix, 'kimmix': paint_kimmix, 'skmix': paint_skmix, 'ear': paint_ear}
if not HEAD_ONLY: PAINTERS.update({'tail': paint_tail, 'torso': paint_torso})
if RIG:
    PAINTERS['cavity'] = lambda U, V: mix(rgb('#4a1c2c'), rgb('#341220'), .55 * smooth(.25, 1., V))
    PAINTERS['tongue'] = lambda U, V: mix(rgb('#e07a8e'), rgb('#ee9aac'), .45 * smooth(.15, .9, V))
atlas = np.empty((2048, 2048, 4), np.uint8); atlas[:] = [216, 154, 122, 255]
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
atlas_path = os.path.join(ROOT, 'scratch', 'head_atlas.png') if HEAD_ONLY else (os.path.join(ROOT, 'scratch', 'rig_base_atlas.png') if RIG else os.path.join(ROOT, 'ak-kaede-toy_atlas.png'))
write_png(atlas_path, atlas)
del atlas
img = bpy.data.images.load(atlas_path); img.name = 'Kaede_toy_painted_atlas_2048'; img.pack()
MAT = bpy.data.materials.new('Kaede_toy_atlas'); MAT.use_nodes = True
bs = next(n_ for n_ in MAT.node_tree.nodes if n_.type == 'BSDF_PRINCIPLED'); bs.inputs['Roughness'].default_value = .8
bs.inputs['Metallic'].default_value = 0; bs.inputs['Specular IOR Level'].default_value = .25
tx = MAT.node_tree.nodes.new('ShaderNodeTexImage'); tx.image = img; tx.interpolation = 'Linear'
MAT.node_tree.links.new(tx.outputs['Color'], bs.inputs['Base Color'])
