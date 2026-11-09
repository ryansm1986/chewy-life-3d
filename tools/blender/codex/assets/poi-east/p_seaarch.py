# The Sea Arch Lookout: kit 0 the arch in the sea (frame origin at the arch, y 0 = the sea), kit 1 the lookout on the bank.
# The layout numbers are src/world/outskirts/pois/seaarch.js's.

def remesh(V, Fa, vox=0.055, smooth=5):
    me = bpy.data.meshes.new('_rm'); me.from_pydata([tuple(v) for v in V], [], Fa); me.update()
    ob = bpy.data.objects.new('_rm', me); bpy.context.scene.collection.objects.link(ob)
    m = ob.modifiers.new('r', 'REMESH'); m.mode = 'VOXEL'; m.voxel_size = vox; m.adaptivity = 0.0; m.use_smooth_shade = False
    s = ob.modifiers.new('s', 'SMOOTH'); s.factor = 0.5; s.iterations = smooth
    dg = bpy.context.evaluated_depsgraph_get(); dg.update()
    ev = ob.evaluated_get(dg); em = ev.to_mesh()
    bm = bmesh.new(); bm.from_mesh(em); ev.to_mesh_clear()
    bpy.data.objects.remove(ob, do_unlink=True); bpy.data.meshes.remove(me)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.verts.index_update()
    # keep the largest shell (the union's outside; any little shells left inside go)
    seen = set(); best = []
    for v in bm.verts:
        if v.index in seen: continue
        stack = [v]; seen.add(v.index); comp = []
        while stack:
            x = stack.pop(); comp.append(x.index)
            for e in x.link_edges:
                y = e.other_vert(x)
                if y.index not in seen: seen.add(y.index); stack.append(y)
        if len(comp) > len(best): best = comp
    keep = set(best); idx = {i: k for k, i in enumerate(sorted(keep))}
    Vo = [bm.verts[i].co.copy() for i in sorted(keep)] if False else None
    bm.verts.ensure_lookup_table()
    Vo = [bm.verts[i].co.copy() for i in sorted(keep)]
    Fo = [[idx[v.index] for v in f.verts] for f in bm.faces if f.verts[0].index in keep]
    bm.free()
    return Vo, Fo

# the arch's stones, one continuous rock: (x, y, z, r, squash, moss cap th0)
LOBES = [
    # the left leg: feet, middle, shoulder
    (-3.25, 0.15, 0.55, 0.92, 1.0, 0), (-2.1, 0.0, 1.02, 0.8, 1.05, 0), (-2.85, -0.1, -0.85, 0.95, 1.0, 0),
    (-2.75, 1.25, 0.98, 0.9, 0.85, 0.62), (-3.38, 1.32, -0.25, 0.74, 0.9, 0.58), (-2.3, 1.2, -0.95, 0.8, 0.9, 0.42),
    (-2.72, 2.45, 0.55, 0.92, 0.85, 0.72), (-2.75, 2.5, -0.6, 0.85, 0.85, 0.7),
    # the span
    (-1.58, 3.3, 0.62, 0.88, 0.78, 0.76), (-1.6, 3.35, -0.55, 0.8, 0.8, 0.75),
    (-0.38, 3.74, 0.42, 0.85, 0.74, 0.8), (-0.42, 3.7, -0.58, 0.8, 0.74, 0.8),
    (0.85, 3.62, 0.52, 0.85, 0.76, 0.76), (0.9, 3.66, -0.5, 0.82, 0.76, 0.85),
    # the right leg
    (2.15, 3.05, 0.62, 0.9, 0.85, 0.72), (2.2, 3.1, -0.6, 0.85, 0.85, 0.78), (2.86, 2.2, 0.5, 0.92, 0.9, 0.66), (2.7, 2.05, -0.72, 0.85, 0.9, 0.6),
    (3.42, 1.2, 0.1, 0.76, 0.9, 0.56), (2.6, 1.0, 1.02, 0.9, 0.9, 0.6), (2.35, 0.95, -1.0, 0.82, 0.9, 0.42),
    (3.3, 0.05, -0.2, 0.88, 1.0, 0), (2.2, -0.05, 0.98, 0.83, 1.0, 0), (2.95, -0.15, -1.0, 0.9, 1.0, 0),
]

def arch_core(a=2.5, h0=1.0, b=2.25, foot=-1.6):
    """the kit's sweep: up one leg, a half oval over the span, down the other (a closed tube of an oval section, deep front to back)"""
    legR = lambda y: 1.08 + 0.32 * clamp((0.9 - y) / 1.8)
    path = []; NL, NS, M = 5, 18, 14
    for i in range(NL): path.append((-a, foot + (h0 - foot) * i / NL, 'L', 0))
    for i in range(NS + 1):
        f_ = PI - PI * i / NS; path.append((a * math.cos(f_), h0 + b * math.sin(f_), 'S', f_))
    for i in range(1, NL + 1): path.append((a, h0 + (foot - h0) * i / NL, 'L', 0))
    V, Fa = [], []; n = len(path)
    for i, (x, y, kind, f_) in enumerate(path):
        x0, y0 = path[max(0, i - 1)][:2]; x1, y1 = path[min(n - 1, i + 1)][:2]
        tx, ty = x1 - x0, y1 - y0; L = math.hypot(tx, ty) or 1; tx, ty = tx / L, ty / L
        nx, ny = ty, -tx
        if nx * x + ny * (y - h0) < 0: nx, ny = -nx, -ny
        rn = legR(y) * 0.84 if kind == 'L' else 0.78 + 0.16 * (1 - math.sin(f_)); rz = rn * 1.05
        for j in range(M):
            t = j / M * TAU; c, s_ = math.cos(t), math.sin(t)
            V.append(F.W((x + nx * c * rn, y + ny * c * rn, s_ * rz)))
    for i in range(n - 1):
        for j in range(M):
            j1 = (j + 1) % M; Fa.append([i * M + j, (i + 1) * M + j, (i + 1) * M + j1]); Fa.append([i * M + j, (i + 1) * M + j1, i * M + j1])
    for ring, flip in ((0, True), (n - 1, False)):
        c = sum((V[ring * M + j] for j in range(M)), Vector()) / M; ci = len(V); V.append(c)
        for j in range(M):
            j1 = (j + 1) % M
            Fa.append([ci, ring * M + j1, ring * M + j] if flip else [ci, ring * M + j, ring * M + j1])
    return V, Fa

def piece_seaarch_0():
    new_asset('seaarch', 0)
    rnd = random.Random(808)
    bed = min(P.h(-2.5, 0), P.h(2.5, 0))
    clipz = max(bed - 0.25, -1.5)
    print('POI arch beds', P.h(-2.5, 0), P.h(2.5, 0), 'clip', clipz)
    # ---- the one continuous rock: the core sweep and the stones fused by a voxel remesh, so they read as big pillowy lobes of a
    # single rock with soft creases between them
    Vc, Fc = arch_core()
    shapes = []
    for i, (x, y, z, r, sq, th0) in enumerate(LOBES):
        S = RockShape(F.W((x, y, z)), r * rnd.uniform(0.98, 1.12), r * rnd.uniform(0.92, 1.05), r * sq, r * 0.78, yaw=rnd.uniform(0, TAU), seed=30 + i, cuts=5, lump=0.06, p=2.3)
        Vs, Fs = shape_mesh(S, 3)
        b = len(Vc); Vc += Vs; Fc += [[a + b for a in f] for f in Fs]
        shapes.append((S, th0))
    V, Fa = remesh(Vc, Fc, vox=0.06, smooth=3)
    # (clip below the sea bed)
    V = [Vector((v.x, v.y, max(v.z, clipz))) for v in V]
    N = vert_normals(V, Fa)
    print('POI arch hi', len(V), len(Fa), 'in the hole', sum(1 for v in V if abs(v.x) < 1.1 and -v.y < 9 and 0.0 < v.z < 2.2 and abs(v.y) < 1.2))
    caps = [(S, polar_cap(S, th0 * 0.9, 60 + i, zmin=0.7, nd=4, dl=0.95), S.rm * 1.55) for i, (S, th0) in enumerate(shapes) if th0 > 0]
    def field(p):
        best = -1.0
        for S, cap, reach in caps:
            if (p - S.C).length < reach:
                s = cap(p)
                if s > best: best = s
        return best
    arch = type('O', (), {})()
    tot = rock_shells(V, Fa, N, field, 1560, 660, t=0.062, wb=0.11, seed=11, tag='arch', sea=P.sea, curv_k=0.7, drop_z=clipz)
    print('POI arch tris', tot)
    arch.mesh = HiSurf(V, Fa, N)
    on = lambda x, z, sink=0.02: (lambda y: None if y is None else y + 0.06 - sink)(top_on([arch], x, z))
    # ---- buttress rocks at its feet (the kit's places: their foam collars wait for them)
    rocks = []
    for s in (-1, 1):
        b0 = P.h(s * 2.5, 0)
        for dx, dz, r in ((1.05, -0.55, 0.75), (0.35, 1.25, 0.62)):
            x, z = s * (2.5 + dx), dz * s; y = max(b0 + r * 0.3, -0.45)
            rocks.append(rock(x, y, z, r * 1.08, sq=0.85, stretch=1.15, moss=0.45, seed=70 + len(rocks), yaw=rnd.uniform(0, TAU), sea=P.sea, tris=(int(58 + 60 * r), int(14 + 34 * r)), tag='rocks', nd=3))
    # ---- the little pine on the far shoulder, leafy shrubs and sea pinks in the moss
    py = on(1.75, -0.15, 0.1)
    if py is not None: pine((1.75, py, -0.15), s=1.0, lean=0.3, dir=-2.4, seed=3, ros=10, tag='pine', K=6, rs=0.14)
    FL = ('#f4a6c0', '#ffffff', '#ee8fb0')
    for x, z, r, sd, fl in ((-0.6, 0.35, 0.34, 1, 4), (0.7, -0.45, 0.28, 3, 3), (-1.85, 0.72, 0.3, 4, 4), (2.6, 0.82, 0.3, 5, 3)):
        y = on(x, z, 0.1)
        if y is not None: leaf_bush((x, y, z), r, n=9, seed=sd, flowers=FL, nfl=fl, tag='shrubs', L=0.26)
    for x, z in ((0.35, 0.82), (-1.15, 0.8), (1.25, 0.72), (-2.5, 0.42)):
        y = on(x, z)
        if y is not None: sea_pink(x, y, z, rnd, n=3, blade=2)
    for x, z in ((-0.9, -0.1), (0.6, 0.2), (-2.0, 0.2), (1.2, 0.0)):
        y = on(x, z)
        if y is not None: blades((x, y, z), rnd, n=4, h=0.3, tag='tufts')
    ray_ao(DMAX=0.8, K=0.62, weights={'leaf': 0.5})
    export_piece('poi-seaarch-0')

# ---- the bench, facing +z (its seat height stays the kit's: the player sits on it)
def bench():
    T = tw(TIMBER_HI, 1); D = tw(TIMBER_D, 2); M_ = tw(TIMBER, 3)
    for i, off in enumerate((0.0, 0.05, -0.03)):
        put(beam(1.72, 0.085, 0.178, (0, 0.45, -0.19 + i * 0.19), c=0.024), tw(mix(TIMBER_HI, TIMBER, 0.3 * (i == 1)), 1 + i), 'bench')
    for sx in (-1, 1):
        for z in (-0.2, 0.2): put(beam(0.13, 0.43, 0.13, (sx * 0.7, 0.215, z), c=0.03), D, 'bench')
        put(beam(0.1, 0.09, 0.56, (sx * 0.7, 0.36, 0), c=0.02), D, 'bench')
        put(beam(0.11, 0.66, 0.095, (sx * 0.7, 0.73, -0.31), c=0.024, rx=-0.14), D, 'bench')
        put(beam(0.13, 0.075, 0.5, (sx * 0.79, 0.665, -0.02), c=0.024), T, 'bench')
        put(beam(0.09, 0.2, 0.09, (sx * 0.79, 0.55, 0.17), c=0.02), D, 'bench')
    for i in range(2):
        put(beam(1.76, 0.15, 0.07, (0, 0.67 + i * 0.21, -0.335 - i * 0.03), c=0.022, rx=-0.14), tw(TIMBER_HI if i else TIMBER, 4 + i), 'bench')

# ---- the coin telescope, looking along +z: a mossy stone foot, a bronze pedestal, the coin box, a yoke, the fat tube
def telescope():
    BR = lac('#b48c44', '#ecc878', '#7a5a2a'); BD = lac('#7e5e2c', '#a8843e', '#584020')
    def st(p, n):
        c = mix('#7c7690', '#c4bcc8', clamp(n.z * 0.8 + 0.3))
        if n.z > 0.6 and nzv(p, 6, (3, 0, 0)) > -0.02: c = mix(c, MS['hi'], 0.75)
        return c
    put(glathe([(0.3, -0.05), (0.3, 0.1), (0.25, 0.145), (0.18, 0.16), (0.16, 0.25), (0.0, 0.26)], 8), st, 'scope')
    put(glathe([(0.082, 0.22), (0.06, 0.34), (0.056, 0.62), (0.0, 0.64)], 8), BR, 'scope')
    put(cyl(0.09, 0.095, 0.05, (0, 0.27, 0), K=8), BD, 'scope')
    put(cyl(0.09, 0.09, 0.05, (0, 0.61, 0), K=8), BD, 'scope')
    put(box(0.2, 0.22, 0.17, (0, 0.78, -0.02), r=0.035), BR, 'scope')
    put(box(0.09, 0.016, 0.02, (0, 0.85, -0.108), r=0.0), flat('#3a2a1a'), 'scope')
    put(box(0.12, 0.035, 0.06, (0, 0.71, -0.125), r=0.0), BD, 'scope')
    for sx in (-1, 1): put(box(0.035, 0.15, 0.07, (sx * 0.105, 0.94, 0), r=0.0), BD, 'scope')
    with at((0, 0.98, 0), rx=-0.14):
        prof = [(0.0, -0.43), (0.056, -0.43), (0.05, -0.34), (0.08, -0.26), (0.088, 0.13), (0.112, 0.2), (0.112, 0.33), (0.098, 0.37), (0.09, 0.355)]
        put(glathe(prof, 8, rx=PI / 2), BR, 'scope')
        put(glathe([(0.092, 0.352), (0.0, 0.345)], 10, rx=PI / 2), lambda p, n: mix('#68b4cc', '#e8fbff', clamp(0.5 + n.z * 0.2 + nzv(p, 22, (1, 1, 1)) * 2)), 'scope')
        put(cyl(0.03, 0.03, 0.27, (0, 0, 0), K=5, rz=PI / 2), BD, 'scope')

# ---- the stone lantern: tiers of stone, a boxy glowing chamber, a broad roof with an icing of moss, a ball finial
def lantern(x, y, z, s=1.05):
    def st(p, n):
        c = mix('#7e788c', '#d2cad0', clamp(n.z * 0.72 + 0.42))
        return mul(c, 0.95 + 0.14 * nzv(p, 7, (2, 2, 2)))
    with at((x, y, z), ry=0.3, s=s):
        put(glathe([(0.36, -0.06), (0.36, 0.1), (0.31, 0.14), (0.2, 0.17), (0.17, 0.2), (0.17, 0.28), (0.26, 0.31), (0.28, 0.35), (0.2, 0.385), (0.0, 0.39)], 9), st, 'lantern')
        put(box(0.4, 0.3, 0.4, (0, 0.52, 0), r=0.04), st, 'lantern')
        t = Bag()
        for dx, dz, ry in ((0, 0.204, 0), (0.204, 0, PI / 2), (0, -0.204, PI), (-0.204, 0, -PI / 2)):
            with at((dx, 0.53, dz), ry=ry):
                nn = F.N((0, 0, 1)); ids = [t.vc(F.W((a, b, 0)), nn, (1.0, 0.86, 0.56)) for a, b in ((-0.115, -0.095), (0.115, -0.095), (0.115, 0.095), (-0.115, 0.095))]
                t.face(ids, nn)
        put(t, None, 'lantern', GLOWM, uv=lambda p: (0.5, 0.0))
        put(glathe([(0.0, 0.665), (0.3, 0.665), (0.4, 0.69), (0.39, 0.74), (0.29, 0.8), (0.17, 0.89), (0.09, 0.93), (0.0, 0.94)], 10), st, 'lantern')
        drip = lambda rr, y_, th: rr * (1 + (0.1 * math.sin(3 * th + 1) + 0.09 * math.sin(5 * th + 2.2)) * sstep(0.84, 0.76, y_))
        put(glathe([(0.0, 0.96), (0.1, 0.945), (0.19, 0.893), (0.29, 0.825), (0.345, 0.775), (0.33, 0.75)], 12, rfn=drip),
            lambda p, n: mix(mix(MS['lo'], MS['mid'], clamp(n.z * 1.4 + 0.2)), MS['hi'], clamp(n.z * 1.5 - 0.6)), 'lantern')
        put(glathe([(0.0, 0.93), (0.07, 0.96), (0.095, 1.02), (0.07, 1.085), (0.0, 1.11)], 7), st, 'lantern')

def fence_run(pts, h=0.8, rh=0.62, every=1.5, r=0.1, railr=0.07, tag='fence'):
    pp = poly_points(pts, every); tops = []
    for i, (x, z) in enumerate(pp):
        y = P.h(x, z); post(x, y, z, h, r=r, wraps=(rh,), K=6, tag=tag, seed=i, turns=3); tops.append((x, y, z))
    for a, b in zip(tops, tops[1:]):
        rail((a[0], a[1] + rh, a[2]), (b[0], b[1] + rh, b[2]), r=railr, tag=tag, K=6, nseg=2)
    return tops

def piece_seaarch_1():
    new_asset('seaarch', 1)
    rnd = random.Random(809)
    gy = P.h
    fence_run([(-5.6, 0.9), (-3.3, -0.5), (-1.0, -1.9), (0.6, -3.2)])
    with at((-3.1, gy(-3.1, -1.85), -1.85), ry=1.0): bench()
    a_ = math.atan2(4.5 + 0.4, 1.1 + 3.0)   # F.look(SCOPE, ARCH)
    with at((-0.4, gy(-0.4, -3.0), -3.0), ry=a_): telescope()
    lantern(-5.0, gy(-5.0, -0.9) - 0.02, -0.9, 1.05)
    # ---- the bank: big mossy boulders seaward of the fence, their feet in the water, smaller ones between
    bank = [(-4.9, 2.1, 1.15), (-4.0, 2.6, 0.6), (-5.9, 2.8, 0.5), (-1.7, 0.6, 1.25), (-0.6, 0.35, 0.7), (-2.8, 1.15, 0.5), (1.0, -2.0, 1.0), (1.8, -3.6, 0.85),
            (-3.3, 1.95, 0.72), (0.25, -0.9, 0.7), (-6.4, 3.25, 0.55), (-0.2, 1.25, 0.5)]
    shapes = []
    for i, (x, z, r) in enumerate(bank):
        y = gy(x, z) - r * 0.32; wet = gy(x, z) < P.sea + 0.5
        shapes.append(rock(x, y, z, r * (1.1 if wet else 1.0), sq=0.85 / (1.1 if wet else 1.0), moss=0.55, seed=40 + i, yaw=rnd.uniform(0, TAU), sea=P.sea if wet else None, tris=(int(34 + 78 * r), int(16 + 42 * r)), tag='boulders'))
    # ---- rocks standing in the shallows, one under the water
    for i, (x, z, r, under) in enumerate(((-1.3, 2.9, 0.75, 0), (0.5, 3.2, 0.6, 0), (1.6, 4.9, 0.65, 1))):
        bed = gy(x, z); y = bed + r * 0.1 if under else bed + r * 0.3
        rock(x, y, z, r * 1.1, sq=0.5 if under else 0.9, stretch=1.2, moss=0.2 if under else 0.5, seed=70 + i, yaw=rnd.uniform(0, TAU), sea=P.sea, tris=(46, 16) if under else (int(46 + 86 * r), int(14 + 34 * r)), tag='boulders', nd=3)
    # ---- sea pinks on the boulders and along the fence's foot, grass, a shrub, the pine
    for S, (x, z) in zip(shapes, ((-4.7, 1.9), (-5.85, 2.75), (-1.5, 0.3), (-2.8, 1.1), (1.1, -2.2))):
        y = top_on([S], x, z)
        if y is not None: sea_pink(x, y + 0.03, z, rnd, n=3, blade=2)
    for x, z in ((-4.4, 0.3), (-2.0, -0.9), (-0.2, -2.3), (-1.6, -2.6), (-4.0, -1.9), (-2.6, -2.8)):
        sea_pink(x, gy(x, z), z, rnd, n=3, blade=3, col='#ffffff' if rnd.random() < 0.25 else '#eba6ba')
    for x, z in ((-4.0, -0.4), (-2.7, -0.4), (-1.1, -1.3), (-5.9, -0.2), (-3.3, -2.7), (0.1, -2.7), (-4.6, -1.4)):
        blades((x, gy(x, z), z), rnd, n=5, h=0.34, tag='tufts')
    pine((1.4, gy(1.4, -4.4) - 0.05, -4.4), s=1.35, lean=0.4, dir=-0.6, seed=5, ros=11, K=7, rs=0.17)
    leaf_bush((-6.3, gy(-6.3, 1.3), 1.3), 0.36, n=14, seed=9, flowers=('#f4a6c0', '#ffffff'), nfl=4, tag='shrubs', L=0.28)
    ray_ao(DMAX=0.7, K=0.58, weights={'leaf': 0.5})
    export_piece('poi-seaarch-1')
