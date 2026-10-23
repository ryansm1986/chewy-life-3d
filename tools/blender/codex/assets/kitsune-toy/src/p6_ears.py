
print('STEP ears', flush=True)
# ============================================================== EARS: tall thick cupped fox ears (the sheet's head close-up, W units)
# Front view: the base runs along the head outline from the inner corner (0.158, 0.709) on the dome to the outer corner (0.490, 0.418) on
# the head's side; the tip at (0.410, 0.905) (rounded by the rim). The front face shows the inner ear (#FFBEAC, x 0.27-0.43, z 0.48-0.79)
# and the dark upper part (#493044), whose border runs from z 0.64 on the outer edge to 0.73 on the inner edge (both faces). In profile
# the tip is 0.045 W behind HY. The opening faces forward, turned 24 deg outward; a 0.05 W cup; 0.092 W thick at the root, 0.052 W
# near the tip, with a rolled rim. The root rows run 0.3 of the length down into the skull (hidden).
# round 2: solid soft triangles: base 0.31 W on the head's top corners (inner corner (0.17, 0.69), outer (0.42, 0.49), inside the outline)
# round 3 (the sheet re-measured): big triangles behind the head's upper corners, the dome crossing their lower inner part; 0.45 W
# from the base's middle to the tip, 0.40 W across the base, the outer edge near-vertical at x 0.45 continuing the outline
EAR_BC = np.array([.290, -.060, .470]); EAR_TIP = np.array([.410, .010, .935])
EAR_HW = .200; EAR_TILT = .086; EAR_OUT_DEG = 20.; EAR_CUP = .030; EAR_T0, EAR_T1 = .088, .032; EAR_VMAX = .93
EAR_DARK_VV = .500; EAR_PINK_TOP_VV = .640; EAR_PINK_INSET = .040
ear_info = {}; EAR_GRID = {}; EAR_PAINT = {}
def ear_frame(side):
    m = np.array([side, 1, 1.]); Bc = EAR_BC * m; Tp = EAR_TIP * m
    A = unit(Tp - Bc); f0 = np.array([0, -1., 0]); f0 = unit(f0 - A * (A @ f0))
    Nf = rot(A, side * math.radians(EAR_OUT_DEG)) @ f0
    if Nf[0] * side < 0: Nf = rot(A, -side * math.radians(EAR_OUT_DEG)) @ f0
    E = unit(np.cross(A, Nf))
    if E[0] * side < 0: E = -E
    return Bc, Tp, A, Nf, E
def ear_corners(side):
    Bc, Tp, A, Nf, E = ear_frame(side)
    return Bc - E * EAR_HW + A * EAR_TILT, Bc + E * EAR_HW - A * EAR_TILT, Tp, Nf      # inner, outer base corners, tip
def ear_mid(side, VV, UU):
    """the ear's mid-surface (W units) at parameters VV (root -0.3 .. tip) and UU (inner -1 .. outer +1). Round 3: a clean triangle between
    its three corners (rows parallel to the base, so the edges can never fold over), the sides bowed out a little, a shallow cup"""
    I, Ob, T, Nf = ear_corners(side)
    VV = np.asarray(VV, float); UU = np.asarray(UU, float); v = np.clip(VV, 0, 1)
    L = I + (T - I) * v[..., None]; R = Ob + (T - Ob) * v[..., None]
    f = (UU + 1) / 2; P = L + (R - L) * f[..., None]
    wd = unit(R - L); P = P + wd * (.020 * np.sin(PI * v) * UU)[..., None]            # gently convex sides
    under = np.minimum(VV, 0); C = (L + R) / 2
    P = C + (P - C) * (1 + 1.5 * under)[..., None] + unit(T - (I + Ob) / 2) * (.45 * under)[..., None]   # the hidden root rows
    cup = EAR_CUP * (1 - UU ** 2) * (1 - v)
    return P - Nf * cup[..., None]
def ear_normal(side, VV, UU, e=1e-3):
    dV = ear_mid(side, VV + e, UU) - ear_mid(side, VV - e, UU); dU = ear_mid(side, VV, UU + e) - ear_mid(side, VV, UU - e)
    n = unit(np.cross(dU, dV)); Nf = ear_frame(side)[3]
    return np.where(((n * Nf).sum(-1) < 0)[..., None], -n, n)
def ear_uv(VV, UU, back):
    """the ear chart: the front (opening) sheet on the left half, the back sheet on the right; u = 0.25 + 0.235 UU (outer edge right)"""
    return au('ear', (.75 if back else .25) + .215 * np.asarray(UU), (np.asarray(VV) + .30) / 1.27)     # a gutter between the halves
# where the dark part starts (VV per UU) and the inner ear's top (VV), from the front-view heights above
def ear_halfwidth(VV):
    I, Ob, T, Nf = ear_corners(1); v = np.clip(VV, 0, 1)
    return np.linalg.norm(Ob - I) / 2 * (1 - v) + .020 * np.sin(PI * v)
for side, tag in ((1, 'L'), (-1, 'R')):
    Bc, Tp, A, Nf, E = ear_frame(side)
    nv, nu = 24, 13
    vv = np.concatenate([np.linspace(-.30, 0, 4)[:-1], np.linspace(0, EAR_VMAX, nv - 3)]); uu = np.linspace(-1, 1, nu)
    VV, UU = np.meshgrid(vv, uu, indexing='ij'); vc = np.clip(VV, 0, 1)
    G = ear_mid(side, VV, UU); NG = ear_normal(side, VV, UU)
    thk = (EAR_T0 + (EAR_T1 - EAR_T0) * vc / EAR_VMAX) * W
    Gm = L2M(G.reshape(-1, 3)); Nm = NG.reshape(-1, 3)
    VVf = VV.reshape(-1); UUf = UU.reshape(-1)
    UVo = ear_uv(VVf, UUf, False); UVi = ear_uv(VVf, UUf, True)
    plain = np.zeros(len(Gm), bool); plain[:nu] = True
    Vt, Ft, UVt, Nt = thicken(Gm, grid_faces(nv, nu), Nm, thk.reshape(-1), UVo, UVi, UVi, rim=6, plain=plain, split_front=True)       # fully rounded rims
    make_obj('ear.' + tag, Vt, Ft, UVt, 'ear.' + tag, N=Nt)
    EAR_GRID[tag] = (Gm.reshape(-1, 3).copy(), VV.reshape(-1).copy())
    ear_info[tag] = {'base': L2M(Bc[None])[0].tolist(), 'mid': L2M((Bc + (Tp - Bc) * .5)[None])[0].tolist(), 'tip': L2M(Tp[None])[0].tolist(),
                     'facing': Nf.tolist()}
    LOG['ear_%s_tip_m' % tag] = [round(float(c), 3) for c in L2M(Tp[None])[0]]
