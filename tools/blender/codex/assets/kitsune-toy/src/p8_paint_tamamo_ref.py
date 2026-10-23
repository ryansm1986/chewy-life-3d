# ============================================================== PAINTED ATLAS
def stroke(x, z, P, half, aa):
    best = np.full(len(x), 9.)
    for i in range(len(P) - 1):
        a = P[i]; b = P[i + 1]; ab = b - a; L2 = ab @ ab
        t = np.clip(((x - a[0]) * ab[0] + (z - a[1]) * ab[1]) / L2, 0, 1)
        dx = x - (a[0] + t * ab[0]); dz = z - (a[1] + t * ab[1])
        best = np.minimum(best, np.sqrt(dx * dx + dz * dz) - (half[i] * (1 - t) + half[i + 1] * t))
    return 1 - smooth(-aa, aa, best)
def lash_th(psi):      # the thick upper lash: thickest over the top-outer part, tapering into the inner corner; a thinner outer-lower line
    top = (.22 * np.sin(np.clip(psi, 0, PI)) ** .55 + .15 * np.exp(-((psi - .50) / .45) ** 2)) * smooth(-.10, .20, psi) * smooth(PI + .02, PI - .70, psi)
    outer = .10 * smooth(-1.05, -.45, psi) * smooth(.22, -.06, psi)
    return (.040 + 1.25 * top) * smooth(-.35, .05, psi) * smooth(PI + .35, PI - .05, psi) + outer
def paint_hit(d):
    P = radial_hit(d); t = np.linalg.norm(P - O, axis=1)
    bad = np.zeros(len(d), bool)
    for k in range(1, 9):
        tk = np.minimum(t + .012 * k, .52); bad |= head_sdf(O + d * tk[:, None]) < 0
    if bad.any(): P[bad] = radial_hit_outer(d[bad])
    return P
def ell_r(q, c, r): return np.sqrt((((q - np.array(c)) / np.array(r)) ** 2).sum(1))
def paint_head(U, V, P=None):
    sh = U.shape; d = head_uv_dir(U.ravel(), V.ravel()); P = paint_hit(d) if P is None else P; n = grad_n(P)
    x, y, z = P[:, 0], P[:, 1], P[:, 2]; q = M2L(P); qx, qz = q[:, 0], q[:, 2]; ax_ = np.abs(qx)
    fr = smooth(HY + .04, HY - .08, y)
    C = ramp_colour('fur', sval(n, hi=.12, lo=.20))
    # the white muzzle pad, the whisker pads and the chin
    qm_ = mirror(q)
    rm = np.minimum.reduce([ell_r(q, MUZ[0], np.array(MUZ[1]) * 1.18), ell_r(q, CHINB[0], np.array(CHINB[1]) * 1.12), ell_r(qm_, PAD[0], np.array(PAD[1]) * 1.6)])
    Lm = (1 - smooth(.78, 1.06, rm)) * fr
    C = mix(C, ramp_colour('white', sval(n, hi=.12, lo=.16)), Lm)
    # soft clay creases: the muzzle into the cheeks, the chin, the ruff tufts (fillet shading, never lines)
    qw = warped(q); dsk = skull(qw)
    druff = smin(ell(mirror(qw), *RUFF1), ell(mirror(qw), *RUFF2), K_RUFF)
    cr = .30 * crease(smin(dsk, druff, K_RUFF), muz_sdf(qw), K_MUZ) + .22 * crease(smin(dsk, muz_sdf(qw), K_MUZ), ell(qw, *CHINB), K_CHINB) + .45 * crease(dsk, druff, K_RUFF)
    C = mix(C, rgb('furdark'), clamp(cr) * .30)
    C = mix(C, rgb('furdark'), .35 * smooth(.06, -.02, qz) * smooth(-.15, -.75, n[:, 2]))      # the flat underside
    # blush
    bx, bz, bw, bh = BLUSH
    for s in (-1, 1):
        r = np.sqrt(((x - s * bx) / bw) ** 2 + ((z - bz) / bh) ** 2)
        C = mix(C, rgb('blush'), .90 * (1 - smooth(.78, 1.02, r)) * fr * PAINT_OPTS['blush'])
    # brows: soft lavender arcs above the eyes
    t_ = np.linspace(0, 1, 9)
    for s in (-1, 1):
        Pb = np.stack([s * (.128 + .090 * t_), .305 + .022 * np.sin(PI * t_ ** .9) + .010 * t_], -1)
        hb = .0060 + .0090 * np.sin(PI * (.15 + .85 * t_)) ** .7
        near = (np.abs(qx - s * .17) < .12) & (qz > .27) & (qz < .40)
        a = np.zeros(len(x)); a[near] = stroke(qx[near], qz[near], Pb, hb, .006)
        C = mix(C, rgb('brow'), .85 * a * fr)
    # nose: dark indigo, a soft top highlight
    qq = q - NOSE_C; qq[:, 1] = qq[:, 1] - nose_recede(qq[:, 2]); widen = nose_widen(qq[:, 2]); qq[:, 2] = qq[:, 2] * nose_flat(qq[:, 2])
    rn = np.sqrt((qq[:, 0] / (NHW * widen)) ** 2 + (qq[:, 1] / NHD) ** 2 + (qq[:, 2] / NHH) ** 2)
    zr_ = (qz - NZW) / NHH; hw_ = NOSE_PW * (.55 + .45 * smooth(-1.0, .55, zr_)) * np.sqrt(np.clip(1 - np.clip(zr_ - .55, 0, 1) ** 2 / .45 ** 2 * .35, 0, 1))
    r2d = np.sqrt((qx / np.maximum(hw_, 1e-4)) ** 2 + ((zr_ - .03) / 1.03) ** 2)
    deep = (q[:, 1] - NOSE_TIP_L)
    nose_m = (1 - smooth(.94, 1.02, r2d)) * smooth(.06, .04, deep) * (n[:, 1] < .2)
    nose_c = ramp_colour('nose', sval(n, hi=.10, lo=.22) - .02)
    C = mix(C, nose_c, .98 * np.maximum(nose_m, 1 - smooth(1.05, 1.12, rn)))
    rh_ = np.sqrt(((qq[:, 0] + .006) / .016) ** 2 + ((qq[:, 2] - .009) / .0075) ** 2) + 9 * (qq[:, 1] > .012)
    C = mix(C, rgb('nosehi'), .70 * (1 - smooth(.40, 1.0, rh_)) * np.maximum(rn < 1.10, nose_m > .5))
    # the sculpted mouth: no painted line; only a darker shade on the groove walls, by depth behind the un-grooved surface
    mb = (fr > 0) & mouth_mask(q) & (q[:, 2] < NZW - .80 * NHH)
    if mb.any():
        dep = -head_local_pre(q[mb])
        C[mb] = mix(C[mb], mix(rgb('#9A5A6C'), rgb('mouth'), smooth(.0012, .0032, dep)), .97 * smooth(.0004, .0016, dep))
    # the eyes: the thick dark-indigo upper lash with its wing (two flicks), the outer-lower line, a soft lower rim
    for s in (-1, 1):
        sr, psi, X, Z = eye_s3(s, P)
        near_eye = fr * (sr < 2.4)
        th = lash_th(psi)
        lash = (1 - smooth(1 + th - .018, 1 + th + .018, sr)) * smooth(.005, .03, th)
        low = (1 - smooth(1.020, 1.060, sr)) * smooth(.10, -.40, np.sin(psi)) * smooth(.0, .6, X)
        Zp = Z + EYE_SH * X
        wing = np.zeros(len(x)); nw = near_eye > 0
        for (p0, p1, w0) in (((.86, .44), (1.42, .90), .150), ((.66, .70), (1.02, 1.10), .085)):
            tt_ = np.linspace(0, 1, 7)
            Pw = np.stack([p0[0] + (p1[0] - p0[0]) * tt_, p0[1] + (p1[1] - p0[1]) * tt_ ** 1.25], -1)
            hw_w = w0 * (1 - .88 * tt_)
            wv = np.zeros(len(x)); wv[nw] = stroke(X[nw], Zp[nw], Pw, hw_w, .014)
            wing = np.maximum(wing, wv)
        C = mix(C, rgb('lash'), np.maximum(np.maximum(lash, wing) * PAINT_OPTS['lash'], .40 * low) * near_eye)
    return C.reshape(sh + (3,))
IRIS_R_W = .073                     # the iris radius in the eye plane (W units): it nearly fills the opening's height, as on the sheet
def paint_eye(U, V, s):
    X = (U - .5) * 2.4; Z = (V - .5) * 2.4
    sr = eye_norm(X, Z)[0]
    hw = EYEF[s]['hw'] / W; hh = EYEF[s]['hh'] / W
    Xm = X * hw; Zm = (Z + EYE_SH * X) * hh                       # metric eye-plane coordinates (W units), outward / up
    R = IRIS_R_W; ixm = -.18 * hw; izm = .00 * hh                 # the iris tucked toward the nose (sheet close-up)
    C = mix(rgb('sclera'), rgb('#E9D7DC'), .65 * smooth(.20, .95, Z))
    ex = (Xm - ixm) / R; ez = (Zm - izm) / R; r = np.sqrt(ex * ex + ez * ez)
    g = smooth(.75, -.85, ez)
    I = mix(rgb('irisdark'), rgb('iris'), smooth(.10, .62, g))
    I = mix(I, rgb('irisglow'), .70 * smooth(.58, 1.0, g) * (1 - smooth(.70, .94, r)))
    I = mix(I, rgb('#8E1236'), .90 * smooth(.80, .98, r))
    I = I * (1 - .045 * (.5 + .5 * np.sin(np.arctan2(ez, ex) * 24 + r * 9)) * smooth(.40, .78, r))[..., None]
    C = mix(C, I, 1 - smooth(.985, 1.015, r))
    pxm = ixm - .10 * R; pzm = izm + .14 * R
    Rp = np.sqrt(((Xm - pxm) / (.50 * R)) ** 2 + ((Zm - pzm) / (.60 * R)) ** 2)
    C = mix(C, mix(rgb('pupil'), rgb('#6A1430'), .45 * smooth(.2, -1., (Zm - pzm) / (.60 * R))), 1 - smooth(.94, 1.06, Rp))
    # two catchlights, the same light for both eyes (upper left on screen): a big round one and a small one
    ox = -s                                                       # +1 = toward screen right in outward units
    big = np.sqrt(((Xm - (ixm - ox * .42 * R)) / (.21 * R)) ** 2 + ((Zm - (izm + .42 * R)) / (.19 * R)) ** 2)
    small = np.sqrt(((Xm - (ixm + ox * .30 * R)) / (.10 * R)) ** 2 + ((Zm - (izm + .28 * R)) / (.095 * R)) ** 2)
    C = mix(C, rgb('#FFFBF6'), np.maximum(1 - smooth(.90, 1.08, big), .90 * (1 - smooth(.86, 1.10, small))))
    C = mix(C, rgb('lash'), smooth(.90, 1.0, sr) * smooth(-.20, .35, Z))
    C = mix(C, rgb('#C9AEB8'), .25 * smooth(.94, 1.02, sr) * smooth(.0, -.40, Z))
    skin = ramp_colour('fur', .45)
    return mix(C, skin, smooth(1.03, 1.07, sr))
