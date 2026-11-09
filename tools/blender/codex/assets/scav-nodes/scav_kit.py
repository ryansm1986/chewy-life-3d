# scav-nodes kit: everything is authored in the GAME frame (x, y up, z); export() turns it into Blender's frame (x, -z, y), a
# proper rotation, so the glTF exporter hands the game back exactly these coordinates. One mesh, one material 'body',
# vertex colours 'Col', explicit per-vertex normals (hard edges = separate shells). Shapes are shells of (v, f, meta), painted per
# vertex in sRGB, then ray AO (the node itself + the ground plane) is multiplied in.
# Techniques borrowed from rocks-village (the hi-res cut stone with a moss cushion, decimated, normals from the hi surface).
import bpy, bmesh, math, os, random
from mathutils import Vector, Matrix, noise
from mathutils.bvhtree import BVHTree

TAU = math.tau; PI = math.pi
UP = Vector((0, 1, 0))
def V(x, y, z): return Vector((x, y, z))

# ------------------------------------------------------------------ colour (sRGB tuples)
def s2l(c): return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
def srgb(h):
    if isinstance(h, str):
        h = h.lstrip('#'); return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    return tuple(h[:3])
def clamp(x, a=0.0, b=1.0): return max(a, min(b, x))
def mix(a, b, t):
    a, b = srgb(a), srgb(b); t = clamp(t)
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))
def mul(a, k): a = srgb(a); return tuple(clamp(c * k) for c in a)
def sstep(a, b, x):
    t = clamp((x - a) / (b - a)) if b != a else (1.0 if x >= b else 0.0)
    return t * t * (3 - 2 * t)
def smin(a, b, k):
    h = max(k - abs(a - b), 0.0) / k
    return min(a, b) - h * h * k * 0.25
def nz(p, f=1.0, off=(0, 0, 0)):
    return noise.noise(Vector((p[0] * f + off[0], p[1] * f + off[1], p[2] * f + off[2])), noise_basis='PERLIN_ORIGINAL')

# ------------------------------------------------------------------ shells
class Shell:
    def __init__(s, ao=1.0):
        s.v, s.f, s.m, s.n = [], [], [], None; s.ao = ao; s.fixed = False
    def vert(s, p, m=None):
        s.v.append(Vector(p)); s.m.append(m); return len(s.v) - 1
    def xf(s, M):
        s.v = [M @ v for v in s.v]; return s
    def tris(s):
        for f in s.f:
            for k in range(1, len(f) - 1): yield (f[0], f[k], f[k + 1])
    def orient(s, hint=None):
        """make the faces face out: hint = a direction (open sheets), or None (the divergence sum about the centroid: closed-ish shells)"""
        cen = sum(s.v, Vector()) / max(1, len(s.v)); tot = 0.0
        for a, b, c in s.tris():
            A, B, C = s.v[a], s.v[b], s.v[c]; nn = (B - A).cross(C - A)
            tot += nn.dot(hint if hint is not None else (A + B + C) / 3 - cen)
        if tot < 0: s.f = [tuple(reversed(f)) for f in s.f]
        s.fixed = True
        return s
    def flip(s): s.f = [tuple(reversed(f)) for f in s.f]; s.fixed = True; return s
    def normals(s):
        N = [Vector() for _ in s.v]
        for a, b, c in s.tris():
            nn = (s.v[b] - s.v[a]).cross(s.v[c] - s.v[a])
            N[a] += nn; N[b] += nn; N[c] += nn
        s.n = [n.normalized() if n.length > 1e-12 else UP.copy() for n in N]
        return s

def grid(S, rows, closed=True, pole0=None, pole1=None, meta=None):
    """rows of points -> quads (closed: each row a loop); poles fan the first / last row"""
    ids = [[S.vert(p, meta(i, j) if meta else (i, j)) for j, p in enumerate(r)] for i, r in enumerate(rows)]
    K = len(rows[0])
    for i in range(len(rows) - 1):
        for j in range(K if closed else K - 1):
            j2 = (j + 1) % K
            S.f.append((ids[i][j], ids[i][j2], ids[i + 1][j2], ids[i + 1][j]))
    if pole0 is not None:
        c = S.vert(pole0, meta(-1, 0) if meta else (-1, 0))
        for j in range(K if closed else K - 1): S.f.append((c, ids[0][(j + 1) % K], ids[0][j]))
    if pole1 is not None:
        c = S.vert(pole1, meta(len(rows), 0) if meta else (len(rows), 0))
        for j in range(K if closed else K - 1): S.f.append((c, ids[-1][j], ids[-1][(j + 1) % K]))
    return ids

def perp(T):
    N = T.cross(UP) if abs(T.dot(UP)) < 0.95 else T.cross(V(1, 0, 0))
    return N.normalized()

def tube(pts, rad, K=8, th0=0.0, closed=False, ao=1.0, flip_out=False):
    """a tube along pts; rad(i, s, a) -> radius; meta (s, a, i). Returns (Shell, rows of ids)"""
    S = Shell(ao); n = len(pts); N = perp((pts[1] - pts[0]).normalized())
    rows = []
    for i, p in enumerate(pts):
        if closed: T = (pts[(i + 1) % n] - pts[(i - 1) % n]).normalized()
        else: T = (pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized()
        N = (N - T * N.dot(T)).normalized(); B = T.cross(N)
        s = i / (n if closed else n - 1); row = []
        for k in range(K):
            a = th0 + TAU * k / K; r = rad(i, s, a)
            row.append(S.vert(p + (N * math.cos(a) + B * math.sin(a)) * r, (s, a, i)))
        rows.append(row)
    for i in range(n if closed else n - 1):
        i2 = (i + 1) % n
        for k in range(K):
            k2 = (k + 1) % K
            S.f.append((rows[i][k], rows[i][k2], rows[i2][k2], rows[i2][k]))
    S.fixed = True
    if flip_out: S.flip()
    S.rows = rows
    return S

def lathe(prof, K=8, M=None, rfn=None, th0=0.0, ao=1.0):
    """profile [(r, y)...] about +y (an r of 0 is a pole); rfn(r, y, th) wobbles the radius; meta (profile index, th, y)"""
    S = Shell(ao); rows, ids = [], []
    for i, (r, y) in enumerate(prof):
        if r <= 1e-5: ids.append([S.vert(V(0, y, 0), (i, 0.0, y))]); continue
        row = []
        for k in range(K):
            a = th0 + TAU * k / K; rr = rfn(r, y, a) if rfn else r
            row.append(S.vert(V(math.cos(a) * rr, y, math.sin(a) * rr), (i, a, y)))
        ids.append(row)
    for i in range(len(ids) - 1):
        A_, B_ = ids[i], ids[i + 1]
        if len(A_) == 1 and len(B_) == 1: continue
        if len(A_) == 1:
            for k in range(K): S.f.append((A_[0], B_[(k + 1) % K], B_[k]))
        elif len(B_) == 1:
            for k in range(K): S.f.append((B_[0], A_[k], A_[(k + 1) % K]))
        else:
            for k in range(K):
                k2 = (k + 1) % K; S.f.append((A_[k], A_[k2], B_[k2], B_[k]))
    if M is not None: S.xf(M)
    return S

_ICO = {}
def ico_data(sub):
    if sub not in _ICO:
        bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=1.0)
        bm.verts.index_update(); _ICO[sub] = ([v.co.copy() for v in bm.verts], [tuple(x.index for x in f.verts) for f in bm.faces]); bm.free()
    return _ICO[sub]

def blob(c, r, sc=(1, 1, 1), sub=2, jit=0.0, seed=0, up_only=False, ao=1.0, M=None):
    """a low icosphere (sub 1 = 20 tris, 2 = 80), scaled, lumped; meta (unit direction)"""
    vs, fs = ico_data(sub); S = Shell(ao)
    for u in vs:
        k = r * (1 + jit * nz(u, 1.9, (seed * 1.3, seed * 0.7, 2.1)) * 2)
        q = V(u.x * sc[0] * k, u.y * sc[1] * k, u.z * sc[2] * k)
        if M is not None: q = M @ q
        S.vert(q + c, u.copy())
    S.f = list(fs); S.fixed = True
    return S

def rot(yaw=0.0, rx=0.0, rz=0.0):
    return Matrix.Rotation(yaw, 3, 'Y') @ Matrix.Rotation(rx, 3, 'X') @ Matrix.Rotation(rz, 3, 'Z')
def tm(p, yaw=0.0, rx=0.0, rz=0.0, s=1.0):
    return Matrix.Translation(p) @ Matrix.Rotation(yaw, 4, 'Y') @ Matrix.Rotation(rx, 4, 'X') @ Matrix.Rotation(rz, 4, 'Z') @ Matrix.Scale(s, 4)

# ------------------------------------------------------------------ the asset
class Asset:
    def __init__(s):
        s.S = []; s.C = []
    def add(s, sh, paint, hint=None):
        if not sh.fixed: sh.orient(hint)
        sh.normals()
        s.C.append([srgb(paint(p, n, m) if callable(paint) else paint) for p, n, m in zip(sh.v, sh.n, sh.m)])
        s.S.append(sh)
        return sh
    def tris(s): return sum(sum(len(f) - 2 for f in sh.f) for sh in s.S)
    def bounds(s):
        vs = [v for sh in s.S for v in sh.v]
        return [min(v[i] for v in vs) for i in range(3)], [max(v[i] for v in vs) for i in range(3)]

def ray_ao(A, n_rays=16, dist=0.4, ground=True):
    allv, allf = [], []
    for sh in A.S:
        b = len(allv); allv += sh.v
        allf += [(x + b, y + b, z + b) for x, y, z in sh.tris()]
    if ground:
        b = len(allv); allv += [V(-9, 0, -9), V(9, 0, -9), V(9, 0, 9), V(-9, 0, 9)]
        allf += [(b, b + 2, b + 1), (b, b + 3, b + 2)]
    bvh = BVHTree.FromPolygons(allv, allf, all_triangles=True)
    dirs = []; ga = PI * (3 - math.sqrt(5))
    for k in range(n_rays):
        r = math.sqrt((k + 0.5) / n_rays); a = k * ga
        dirs.append(Vector((r * math.cos(a), r * math.sin(a), math.sqrt(max(0.0, 1 - r * r)))))
    for sh, cols in zip(A.S, A.C):
        if sh.ao <= 0: continue
        for i, (v, n) in enumerate(zip(sh.v, sh.n)):
            q = n.to_track_quat('Z', 'Y'); org = v + n * 0.008; occ = 0.0
            for d in dirs:
                hit = bvh.ray_cast(org, q @ d, dist)
                if hit[0] is not None: occ += 1 - (hit[3] / dist) * 0.55
            occ /= n_rays
            k = 1 - sh.ao * clamp(occ * 1.2) * 0.5
            c = cols[i]; cols[i] = (c[0] * k, c[1] * k, c[2] * (k + (1 - k) * 0.05))   # (a touch cool in the crevices)

def make_mat():
    mt = bpy.data.materials.new('body'); mt.use_nodes = True; nt = mt.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Roughness'].default_value = 0.85; bsdf.inputs['Metallic'].default_value = 0.0
    vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'
    nt.links.new(vc.outputs['Color'], bsdf.inputs['Base Color'])
    return mt

def export(A, name, models_dir, blend_dir=None, budget=None):
    ray_ao(A)
    VV, NN, CC, FF = [], [], [], []
    drop = 0
    for sh, cols in zip(A.S, A.C):
        b = len(VV)
        VV += [Vector((v.x, -v.z, v.y)) for v in sh.v]; NN += [Vector((n.x, -n.z, n.y)) for n in sh.n]; CC += cols
        for x, y, z in sh.tris():
            ar = (sh.v[y] - sh.v[x]).cross(sh.v[z] - sh.v[x]).length
            if ar < 2e-7: drop += 1; continue
            if max(sh.v[x].y, sh.v[y].y, sh.v[z].y) < -0.012: drop += 1; continue    # (wholly under the ground)
            FF.append((x + b, y + b, z + b))
    # unused verts (from dropped faces) are harmless: they don't export
    for ob in list(bpy.data.objects): bpy.data.objects.remove(ob, do_unlink=True)
    for me in list(bpy.data.meshes): bpy.data.meshes.remove(me)
    for mt in list(bpy.data.materials): bpy.data.materials.remove(mt)
    me = bpy.data.meshes.new(name); me.from_pydata([tuple(v) for v in VV], [], FF); me.update()
    ob = bpy.data.objects.new('body', me); bpy.context.scene.collection.objects.link(ob)
    me.materials.append(make_mat())
    attr = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    vi = [0] * len(me.loops); me.loops.foreach_get('vertex_index', vi)
    flat = []
    for i in vi:
        c = CC[i]; flat.extend((s2l(c[0]), s2l(c[1]), s2l(c[2]), 1.0))
    attr.data.foreach_set('color', flat); me.color_attributes.active_color = attr
    try: me.color_attributes.render_color_index = me.color_attributes.find('Col')
    except Exception: pass
    me.shade_smooth()
    me.normals_split_custom_set_from_vertices([tuple(n) for n in NN])
    lo, hi = A.bounds()
    tris = len(FF)
    nanv = sum(1 for v in VV if any(math.isnan(c) for c in v))
    nann = sum(1 for n in NN if any(math.isnan(c) for c in n))
    over = '  OVER BUDGET' if budget and tris > budget else ''
    print('SCV %s tris %d/%s dropped %d size %.2f x %.2f x %.2f  x %.2f..%.2f y %.2f..%.2f z %.2f..%.2f nan %d/%d%s' % (
        name, tris, budget, drop, hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2], lo[0], hi[0], lo[1], hi[1], lo[2], hi[2], nanv, nann, over))
    if blend_dir:
        os.makedirs(blend_dir, exist_ok=True); bpy.ops.wm.save_as_mainfile(filepath=os.path.join(blend_dir, name + '.blend'))
    for o in bpy.context.scene.objects: o.select_set(True)
    out = os.path.join(models_dir, name + '.glb')
    kw = dict(filepath=out, export_format='GLB', use_selection=True, export_apply=True, export_yup=True, export_attributes=True,
              export_lights=False, export_cameras=False, export_animations=False, export_normals=True, export_texcoords=False, export_materials='EXPORT')
    try: bpy.ops.export_scene.gltf(export_vertex_color='ACTIVE', **kw)
    except TypeError: bpy.ops.export_scene.gltf(export_colors=True, **kw)
    return tris

# ------------------------------------------------------------------ the cut stone (rocks-village's method, y up)
STONE_GREY = dict(lo='#6a6280', mid='#9e96ac', hi='#cbc3d0', warm='#c0b0a8', foot='#6c6a5c')
MOSS = dict(lo='#4c6c3a', mid='#688c4c', hi='#92b066', tip='#aec482')

def plane_cut(R, u, planes):
    for n, d, k in planes:
        un = u.dot(n)
        if un > 0.03: R = smin(R, d / un, k)
    return R

def cuts(seed, n=3, d=0.82, k=0.1, top=0.8):
    """a few cut planes in unit-stone space (the top one tilted, n round the flanks), scaled by the axes in stone()"""
    rnd = random.Random(seed * 31 + 7); out = []
    if top: out.append((V(rnd.uniform(-0.25, 0.25), 1, rnd.uniform(-0.25, 0.25)).normalized(), top, k))
    a0 = rnd.uniform(0, TAU)
    for i in range(n):
        a = a0 + TAU * (i + rnd.uniform(-0.2, 0.2)) / n
        out.append((V(math.cos(a), rnd.uniform(0.0, 0.45), math.sin(a)).normalized(), d + rnd.uniform(-0.07, 0.07), k))
    return out

def moss_s(p, mc, M, seed):
    d = p - mc; L = d.length
    if L < 1e-6: return 1.0
    dn = d / L
    th = math.acos(clamp(dn.y, -1, 1)); ph = math.atan2(dn.z, dn.x)
    a1, a2 = M.get('wob', (0.12, 0.08))
    e = (M['th0'] + a1 * 0.5 * math.sin(2 * ph + seed * 0.9) + a2 * math.sin(3 * ph + seed * 1.7) + a1 * 0.25 * math.sin(5 * ph + seed * 2.3)
         + 0.05 * nz((math.cos(ph), math.sin(ph), 0), 2.0, (seed, 1.1, 0)))
    ext = 0.0
    for c, ln, w in M.get('drips', ()):
        dd = math.atan2(math.sin(ph - c), math.cos(ph - c))
        if abs(dd) < w: ext = max(ext, ln * (1 - (dd / w) ** 2) ** 0.75)
    s = (e + ext - th) * L
    return min(s, (p.y - M.get('foot', 0.04)) * 1.2)

def stone(A, C, axes, seed=1, p=2.3, lumps=((1.7, 0.07), (3.2, 0.015)), planes=(), moss=None, tris=200, pal=STONE_GREY, mosspal=MOSS,
          ground=-0.03, sub=5, yaw=0.0, foot_h=0.09, ao=1.0, spots=None, paint_extra=None):
    """a chunky stone: superellipsoid (ax, ay_up, ay_down, az) + low lumps, cut by soft planes (flat facets with rounded edges), the
    base clamped flat, an optional moss cushion grown out of its crown; decimated to `tris`, normals from the hi surface."""
    C = Vector(C); ax, ayu, ayd, az = axes
    offs = [(seed * 1.37 + i * 5.1, seed * 0.71 - i * 3.3, seed * 2.03 + i * 1.9) for i in range(3)]
    Ry = Matrix.Rotation(yaw, 3, 'Y')
    pls = []
    for n, d, k in planes:      # (unit-stone planes -> scaled to this stone)
        nn = V(n.x / ax, n.y / (ayu if n.y > 0 else ayd), n.z / az); L = nn.length
        pls.append(((Ry @ (nn / L)), d / L, k * min(ax, ayu, az)))
    def Rf(u):
        ul = Ry.inverted() @ u
        ay = ayu if ul.y >= 0 else ayd
        R = (abs(ul.x / ax) ** p + abs(ul.y / ay) ** p + abs(ul.z / az) ** p) ** (-1.0 / p)
        m = 1.0
        for i, (f, a) in enumerate(lumps): m += a * nz(ul, f, offs[i])
        r0 = R * m
        return plane_cut(r0, u, pls), r0
    bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=1.0)
    mc = C + Vector(moss['c']) if moss else None
    for v in bm.verts:
        u = v.co.normalized(); r, _ = Rf(u); q = C + u * r
        if q.y < ground: q.y = ground
        v.co = q
    bm.normal_update()
    if moss:
        t = moss.get('t', 0.05); wb = moss.get('wb', 0.035)
        for v in bm.verts:
            s = moss_s(v.co, mc, moss, seed)
            if s <= 0: continue
            x = clamp(s / wb); prof = 1 - (1 - x) ** 2.5; steep = clamp(v.normal.y * 1.4 + 0.2)
            lump = t * 0.35 * nz(v.co, 5.0 / max(ax, az) * 0.5, (seed * 0.3, 7.7, 1.3)) + t * 0.14 * nz(v.co, 11.0 / max(ax, az) * 0.5, (2.2, seed * 0.5, 4.1))
            v.co = v.co + v.normal * (t * (0.62 + 0.38 * steep) * prof + lump * prof + t * 0.5 * sstep(0.02, 0.25, s))
        bm.normal_update()
    bm.faces.ensure_lookup_table(); bm.verts.index_update()
    hbvh = BVHTree.FromBMesh(bm)
    hn = [v.normal.copy() for v in bm.verts]
    hf = [[x.index for x in f.verts] for f in bm.faces]; hv = [v.co.copy() for v in bm.verts]
    me = bpy.data.meshes.new('hi'); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new('hi', me); bpy.context.scene.collection.objects.link(ob)
    mod = ob.modifiers.new('d', 'DECIMATE'); mod.decimate_type = 'COLLAPSE'; mod.ratio = min(1.0, tris / max(1, len(me.polygons))); mod.use_collapse_triangulate = True
    dg = bpy.context.evaluated_depsgraph_get(); dg.update()
    lo = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    b2 = bmesh.new(); b2.from_mesh(lo); bmesh.ops.triangulate(b2, faces=b2.faces[:])
    bmesh.ops.beautify_fill(b2, faces=b2.faces[:], edges=b2.edges[:], method='ANGLE')
    b2.verts.index_update()
    S = Shell(ao); S.v = [v.co.copy() for v in b2.verts]; S.f = [tuple(x.index for x in f.verts) for f in b2.faces]
    b2.free(); bpy.data.objects.remove(ob, do_unlink=True); bpy.data.meshes.remove(me); bpy.data.meshes.remove(lo)
    S.m = [None] * len(S.v); S.fixed = True
    # normals from the hi surface
    N = []
    for q in S.v:
        loc, fn, fi, _ = hbvh.find_nearest(q)
        if fi is None: N.append(UP.copy()); continue
        a, b, c = hf[fi][:3]
        w = bary(loc, hv[a], hv[b], hv[c]); n = hn[a] * w[0] + hn[b] * w[1] + hn[c] * w[2]
        N.append(n.normalized() if n.length > 1e-8 else fn)
    sd = seed
    def paint(q, n, m):
        vy = n.y
        c = mix(pal['lo'], pal['mid'], clamp(vy * 0.9 + 0.75))
        c = mix(c, pal['hi'], clamp(vy * 1.1 - 0.15) * 0.85)
        u = (q - C)
        if u.length > 1e-6:
            rr, r0 = Rf(u.normalized()); facet = sstep(0.004, 0.03, r0 - rr)
        else: facet = 0
        mott = 0.09 * nz(q, 5.0 / max(ax, az) * 0.4, (sd, 0.5, 2.0)) + 0.05 * nz(q, 15.0 / max(ax, az) * 0.4, (3.0, sd, 1.0))
        c = mul(c, 1.0 + mott * (1 - 0.6 * facet) + 0.04 * facet)
        c = mix(c, pal['warm'], 0.25 * clamp(nz(q, 3.0 / max(ax, az) * 0.5, (sd * 2.0, 4.0, 0.0)) * 2.0))
        c = mix(c, pal['foot'], 0.45 * sstep(foot_h, 0.0, q.y))
        if paint_extra: c = paint_extra(q, n, c)
        if moss:
            s = moss_s(q, mc, moss, sd)
            c = mix(c, mix(pal['mid'], mosspal['lo'], 0.5), 0.3 * sstep(-0.05, 0.0, s))    # (a stain, and a soft shadow, under the cushion's edge)
            c = mul(c, 1 - 0.16 * sstep(-0.035, 0.0, s))
            if s > -0.004:
                g = mix(mosspal['lo'], mosspal['mid'], clamp(vy * 1.3 + 0.15))
                g = mix(g, mosspal['hi'], clamp(vy * 1.5 - 0.55) * 0.9)
                g = mix(g, mosspal['tip'], clamp(vy * 2.0 - 1.55) * 0.5 * clamp(nz(q, 9.0, (sd, 9, 3)) * 2 + 0.5))
                g = mul(g, (0.94 + 0.1 * nz(q, 16.0, (2.0, sd, 5.0)) + 0.1 * nz(q, 7.0, (sd, 2.0, 8.0))))
                g = mul(g, 0.8 + 0.2 * sstep(0.0, 0.03, s))
                c = mix(c, g, sstep(-0.004, 0.01, s))
        return c
    S.n = N
    A.S.append(S); A.C.append([srgb(paint(q, n, None)) for q, n in zip(S.v, S.n)])
    return S

def bary(p, a, b, c):
    v0, v1, v2 = b - a, c - a, p - a
    d00, d01, d11, d20, d21 = v0.dot(v0), v0.dot(v1), v1.dot(v1), v2.dot(v0), v2.dot(v1)
    den = d00 * d11 - d01 * d01
    if abs(den) < 1e-14: return (1 / 3, 1 / 3, 1 / 3)
    v = (d11 * d20 - d01 * d21) / den; w = (d00 * d21 - d01 * d20) / den
    v, w = clamp(v), clamp(w)
    if v + w > 1: s = v + w; v, w = v / s, w / s
    return (1 - v - w, v, w)

def shell_top(S): return max(v.y for v in S.v)

def pebble(A, p, r, sq=0.6, seed=1, pal=STONE_GREY, tris=30, cutn=2):
    """a small nestled stone (its base just under the ground / p.y)"""
    return stone(A, V(p[0], p[1] + r * sq * 0.45, p[2]), (r * 1.1, r * sq, r * sq * 0.7, r * 0.95), seed=seed, planes=cuts(seed, cutn, 0.8, 0.14, 0.82), tris=tris, pal=pal, sub=3, ground=p[1] - 0.02, lumps=((1.7, 0.08),))

# ------------------------------------------------------------------ wood
def bend_pts(a, b, n, bend=0.05, lift=0.3, side=None):
    d = b - a; L = d.length
    s = side if side is not None else (d.cross(UP).normalized() if abs(d.normalized().dot(UP)) < 0.98 else V(1, 0, 0))
    return [a.lerp(b, i / n) + s * bend * L * math.sin(i / n * PI) + UP * bend * lift * L * math.sin(i / n * PI) for i in range(n + 1)]

def cap_shell(A, S, row_ids, center, axis, pal, rings=(0.8, 0.45), dome=0.012, lip=True, ao=0.6):
    """the end-grain cap of a tube (a separate shell: a hard edge): concentric rings of light and dark wood"""
    C = Shell(ao); K = len(row_ids); rows = []
    fr = [1.0] + list(rings)
    for t in fr:
        rows.append([center.lerp(S.v[i], t) + axis * dome * (1 - t) for i in row_ids])
    grid(C, rows, True, pole1=center + axis * dome * 1.2, meta=lambda i, j: (i, j))
    C.orient(axis)
    end, ring, lipc = pal['end'], pal['ring'], pal.get('lip', pal['end'])
    tones = [lipc, ring, end, ring, end, ring]
    A.add(C, lambda p, n, m: mul(tones[min(max(m[0], 0) if m[0] >= 0 else 0, len(tones) - 1)], 0.97 + 0.08 * nz(p, 22.0)))
    return C

def bark_paint(pal, K, seed=0, grooves=True):
    bark, hi = pal['bark'], pal['hi']; f = max(1, K // 2)
    def paint(p, n, m):
        s, a, i = m
        c = mix(bark, hi, n.y * 0.6 + 0.35)
        if grooves: c = mul(c, 0.8 + 0.2 * (0.5 + 0.5 * math.cos(a * f + s * 2 + seed)) ** 0.7)
        c = mul(c, 0.94 + 0.14 * nz(p, 7.0, (seed, 1, 2)))
        return c
    return paint

def log(A, a, b, r, pal, K=10, n=6, taper=0.88, bend=0.05, seed=0, ridge=0.07, caps=(True, True), th0=0.0, side=None, wob=0.06, point=(0, 0)):
    """a log / branch from a to b, ridged bark, end-grain caps. point: (p0, p1) instead of a cap the end rounds in to a worn nub"""
    pts = bend_pts(a, b, n, bend, 0.3, side); f = max(1, K // 2); off = (seed * 1.3, seed * 0.77, 0.4)
    def rad(i, s, ang):
        rr = r * (1 - (1 - taper) * s)
        rr *= 1 + ridge * math.cos(ang * f + s * 2 + seed) + wob * nz(pts[i], 3.0, off)
        if point[0] and i == 0: rr *= 0.45
        if point[0] and i == 1: rr *= 0.86
        if point[1] and i == n: rr *= 0.4
        if point[1] and i == n - 1: rr *= 0.84
        return rr
    S = tube(pts, rad, K, th0)
    if point[0]:
        for k in range(K): pass
    if point[0]:
        c = S.vert(pts[0] - (pts[1] - pts[0]).normalized() * r * 0.3, (0, 0, 0))
        for k in range(K): S.f.append((c, S.rows[0][k], S.rows[0][(k + 1) % K]))
    if point[1]:
        c = S.vert(pts[-1] + (pts[-1] - pts[-2]).normalized() * r * 0.3, (1, 0, n))
        for k in range(K): S.f.append((c, S.rows[-1][(k + 1) % K], S.rows[-1][k]))
    A.add(S, bark_paint(pal, K, seed))
    if caps[0] and not point[0]: cap_shell(A, S, S.rows[0], pts[0], (pts[0] - pts[1]).normalized(), pal)
    if caps[1] and not point[1]: cap_shell(A, S, S.rows[-1], pts[-1], (pts[-1] - pts[-2]).normalized(), pal)
    S.pts = pts
    return S

def knot(A, p, nrm, r, col='#7a6448', dark='#4e3c2c'):
    """a knot on the bark: a raised ring with a dark eye"""
    nrm = nrm.normalized(); s1 = perp(nrm); s2 = nrm.cross(s1)
    S = Shell(0.5); K = 6
    def ring(rr, h): return [p + (s1 * math.cos(TAU * k / K) + s2 * math.sin(TAU * k / K)) * rr + nrm * h for k in range(K)]
    grid(S, [ring(r, -0.005), ring(r * 0.72, r * 0.34), ring(r * 0.36, r * 0.14)], True, pole1=p + nrm * r * 0.04)
    S.orient(nrm)
    A.add(S, lambda q, n, m: dark if m[0] >= 2 else mix(col, '#d8c4a0', 0.3 * m[0]))

def stub(A, p, d, L, r, pal, K=6, seed=0):
    return log(A, p, p + d.normalized() * L, r, pal, K=K, n=2, taper=0.8, bend=0.0, seed=seed, ridge=0.05, caps=(False, True))

def strap(A, pts, w, col, th=0.018, up=UP, ao=0.5):
    """a flat thick ribbon along pts: a rectangular section w wide, th thick; col(q, n, m) paints it"""
    S = Shell(ao); rows = []; n = len(pts)
    for i, q in enumerate(pts):
        d = (pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized(); sd = d.cross(up)
        if sd.length < 1e-5: sd = perp(d)
        sd.normalize(); nn = sd.cross(d).normalized()
        if nn.dot(up) < 0: nn = -nn
        ww = w(i / (n - 1)) if callable(w) else w
        rows.append([q - sd * ww + nn * th, q + sd * ww + nn * th, q + sd * ww - nn * th, q - sd * ww - nn * th])
    grid(S, rows, True, pole0=None, meta=lambda i, j: i / (n - 1)); S.f += [(0, 1, 2, 3)]; b = (n - 1) * 4; S.f += [(b + 3, b + 2, b + 1, b)]
    S.orient(); A.add(S, col)
    return S

def chip(A, p, s, yaw, col, seed=0, tilt=0.3):
    """a bark chip / splinter on the ground: a chunky little wedge (8 tris)"""
    s = s * 1.45
    S = Shell(0.5); M = tm(p, yaw, tilt * 0.3, tilt * 0.4)
    a = [M @ V(x * s, y * s, z * s) for x, y, z in ((-1, 0, -0.45), (1, 0, -0.35), (1.15, 0, 0.3), (-0.9, 0, 0.42), (-0.25, 0.5, 0), (0.45, 0.42, 0))]
    for q in a: S.vert(q, q)
    S.f = [(0, 4, 1), (1, 4, 5), (1, 5, 2), (2, 5, 3), (3, 5, 4), (3, 4, 0)]; S.fixed = False
    A.add(S, lambda q, n, m: mul(col, 0.76 + 0.32 * clamp(n.y)))

def moss_dab(A, c, nrm, r, h=0.035, seed=0, K=12, sc=1.0):
    """a pillowy moss cushion stuck on a log or a slab: a lobed low dome, darker at the rim, light on top"""
    nrm = nrm.normalized()
    prof = [(r * 1.02, -h * 0.6), (r, h * 0.2), (r * 0.72, h * 0.8), (r * 0.3, h * 1.05), (0.0, h * 1.1)]
    ph = seed * 1.7
    S = lathe(prof, K, rfn=lambda rr, y, a: rr * (1 + 0.12 * math.cos(3 * a + ph) + 0.13 * math.sin(6 * a + seed)), ao=0.5)
    q = UP.rotation_difference(nrm).to_matrix().to_4x4()
    S.xf(Matrix.Translation(c) @ q @ Matrix.Scale(sc, 4, (1, 0, 0)))
    S.orient()
    def p(q_, n, m):
        g = mix(MOSS['lo'], MOSS['mid'], clamp(n.y * 1.3 + 0.2)); g = mix(g, MOSS['hi'], clamp(n.y * 1.5 - 0.55))
        return mul(g, 0.94 + 0.12 * nz(q_, 16.0, (seed, 2, 1)))
    A.add(S, p)

# ------------------------------------------------------------------ leaves, petals, cards
def blade(A, base, d, L, W, up=UP, droop=0.2, segs=3, tent=0.25, lo='#5a9444', hi='#a8d470', both=False, ao=0.55, rib=None, wshape=0.75, smid=None):
    """a pointed leaf card with a raised midrib: rows (left, rib, right), collapsed to a point at both ends"""
    d = d.normalized(); side = d.cross(up)
    if side.length < 1e-5: side = perp(d)
    side.normalize(); nrm = side.cross(d).normalized()
    if nrm.dot(up) < 0: nrm = -nrm
    S = Shell(ao); rib_c = rib or hi
    def C(s): return base + d * L * s - up * droop * L * s * s
    b = S.vert(C(0), (0, 0)); tip = S.vert(C(1), (1, 0))
    rows = []
    for i in range(1, segs):
        s = i / segs; w = W * math.sin(PI * s ** wshape); c = C(s)
        if segs == 2 and smid: s = smid; w = W; c = C(s)
        rows.append((S.vert(c - side * w - nrm * w * tent, (s, -1)), S.vert(c, (s, 0)), S.vert(c + side * w - nrm * w * tent, (s, 1))))
    S.f.append((b, rows[0][1], rows[0][0])); S.f.append((b, rows[0][2], rows[0][1]))
    for i in range(len(rows) - 1):
        for k in (0, 1):
            S.f.append((rows[i][k], rows[i][k + 1], rows[i + 1][k + 1], rows[i + 1][k]))
    S.f.append((tip, rows[-1][0], rows[-1][1])); S.f.append((tip, rows[-1][1], rows[-1][2]))
    S.orient(nrm)
    def p(q, n, m):
        s, k = m
        c = mix(lo, hi, 0.25 + 0.75 * s)
        if k == 0: c = mix(c, rib_c, 0.35)
        return mul(c, 0.9 + 0.14 * clamp(n.y))
    A.add(S, p)
    if both:
        T = Shell(ao); T.v = [v - nrm * 0.008 for v in S.v]; T.m = list(S.m); T.f = [tuple(reversed(f)) for f in S.f]; T.fixed = True
        A.add(T, lambda q, n, m: mul(lo, 0.86))
    return S

def petal(A, p, yaw, s, col, tilt=0.25, rnd=random, deep=None):
    """a cupped petal with a little notch at its tip (8 tris); paler at the rim, deeper at the base"""
    S = Shell(0.45); pts = [(0.0, -0.72), (0.55, -0.42), (0.74, 0.12), (0.5, 0.62), (0.13, 0.82), (0.0, 0.62), (-0.13, 0.82), (-0.5, 0.62), (-0.74, 0.12), (-0.55, -0.42)]
    c = S.vert(V(0, -0.02 * s, -0.06 * s), 0.0)
    rim = []
    for x, z in pts:
        rr = math.hypot(x, z); rim.append(S.vert(V(x * s, rr * rr * s * 0.3, z * s), rr))
    for i in range(len(rim)): S.f.append((c, rim[i], rim[(i + 1) % len(rim)]))
    S.xf(tm(p, yaw, (rnd.random() - 0.5) * tilt, (rnd.random() - 0.5) * tilt))
    S.orient(UP)
    d = deep or mul(col, 0.8)
    A.add(S, lambda q, n, m: mul(mix(d, col, sstep(0.0, 0.7, m)), 0.92 + 0.12 * clamp(n.y)))

def blossom(A, p, s, nrm=UP, col='#ffb0cc', centre='#ffd84a', yaw=0.0, rnd=random):
    """a five-petal flower with a gold bead (5 x 4 tris + 8)"""
    q = UP.rotation_difference(nrm.normalized()).to_matrix()
    for k in range(5):
        a = yaw + TAU * k / 5; S = Shell(0.3); c = V(math.cos(a), 0, math.sin(a)); sd = V(-c.z, 0, c.x)
        P = [V(0, 0, 0), c * 0.5 * s + sd * 0.42 * s + UP * 0.1 * s, c * 1.0 * s + sd * 0.28 * s + UP * 0.24 * s, c * 0.9 * s + UP * 0.18 * s, c * 1.0 * s - sd * 0.28 * s + UP * 0.24 * s, c * 0.5 * s - sd * 0.42 * s + UP * 0.1 * s]
        for i, v in enumerate(P): S.vert(p + q @ v, 0.0 if i == 0 else (0.5 if i in (1, 5) else 1.0))
        S.f = [(0, 1, 2), (0, 2, 3), (0, 3, 4), (0, 4, 5)]
        S.orient(q @ UP)
        A.add(S, lambda q_, n, m: mix('#ff7fa8', col, sstep(0.0, 0.65, m)) if m < 0.95 else mix(col, '#fff0f4', 0.55))
    A.add(blob(p + q @ V(0, 0.06 * s, 0), 0.2 * s, (1, 0.7, 1), 1, ao=0.0), centre)

def maple(A, p, yaw, s, col, rnd=random, tilt=0.4, cup=0.3, both=False, lift=0.0, rx=None, rz=None):
    """a five-lobed maple leaf: a rim star of 11 verts fanned from a raised heart (11 tris), yellow at the heart, deep at the tips"""
    tips = [(-1.95, 0.72), (-1.0, 0.92), (0.0, 1.12), (1.0, 0.92), (1.95, 0.72)]    # (angle off the leaf's axis, length)
    rim = []
    for i, (a, l) in enumerate(tips):
        if i: rim.append(((a + tips[i - 1][0]) / 2, 0.44))
        rim.append((a, l))
    rim.append((2.7, 0.3)); rim.append((PI, 0.24)); rim.append((-2.7, 0.3))
    S = Shell(0.4)
    c = S.vert(V(0, 0.06 * s + lift, 0), 0.0); ids = []
    for a, l in rim:
        ids.append(S.vert(V(math.sin(a) * l * s, l * l * s * cup + lift, math.cos(a) * l * s), l))
    for i in range(len(ids)): S.f.append((c, ids[i], ids[(i + 1) % len(ids)]))
    tx = (rnd.random() - 0.5) * tilt if rx is None else rx; tz = (rnd.random() - 0.5) * tilt if rz is None else rz
    S.xf(tm(p, yaw, tx, tz)); S.orient(rot(yaw, tx, tz) @ UP)
    dk = mul(col, 0.74)
    A.add(S, lambda q, n, m: mul(mix(mix(col, '#ffd898', 0.5), col if m < 0.8 else dk, sstep(0.0, 0.62, m)), 0.92 + 0.14 * clamp(n.y)))
    if both:
        T = Shell(0.4); nn = rot(yaw, tx, tz) @ UP; T.v = [v - nn * 0.01 for v in S.v]; T.m = list(S.m); T.f = [tuple(reversed(f)) for f in S.f]; T.fixed = True
        A.add(T, lambda q, n, m: mul(col, 0.7))
    return S

# ------------------------------------------------------------------ small treasures
def mound(A, r, h, pal, seed=0, x=0.0, z=0.0, sx=1.0, sz=1.0, rings=4, seg=18, noise_=0.12, bumps=0.12, paint=None, y=0.0, ao=0.9):
    """a soft ground dome whose rim wobbles, its foot tucked into the ground"""
    S = Shell(ao); ph = seed * 1.7
    def rim(a): return 1 + noise_ * (math.sin(a * 3 + ph) * 0.6 + math.sin(a * 5 + seed * 3.1) * 0.4)
    rows = []
    for i in range(1, rings + 1):
        u = i / rings; row = []
        for k in range(seg):
            a = TAU * k / seg; rr = r * u * rim(a)
            hh = h * max(0.0, 1 - u * u) ** 0.75 * (1 + bumps * nz((math.cos(a) * u * 3, math.sin(a) * u * 3, seed), 1.0) * 2 * u) - (0.03 if i == rings else 0)
            row.append(V(x + math.cos(a) * rr * sx, y + hh, z + math.sin(a) * rr * sz))
        rows.append(row)
    grid(S, rows, True, pole0=V(x, y + h, z))
    S.orient(UP)
    A.add(S, paint or (lambda q, n, m: mul(mix(pal[0], pal[1], n.y * 0.85 + 0.05 * nz(q, 8.0, (seed, 0, 0))), 1.0)))
    return S

def scallop(A, p, s, yaw, col='#fff0e0', rib='#e8a088', rnd=random):
    """a scallop shell: a fluted fan, domed, with a hinge (27 tris)"""
    S = Shell(0.6); K = 9; ang0 = 0.35; rows = [[], []]
    for k in range(K):
        a = ang0 + (PI - 2 * ang0) * k / (K - 1); fl = 1.0 if k % 2 == 0 else 0.92
        rows[0].append(V(math.cos(a) * s * fl, 0.0, math.sin(a) * s * fl))
        rows[1].append(V(math.cos(a) * s * 0.58, s * 0.3, math.sin(a) * s * 0.58))
    S2 = grid(S, rows, False, pole1=V(0, s * 0.16, -0.02 * s), meta=lambda i, j: (i, j))
    S.xf(tm(V(p[0], p[1] + 0.012, p[2]), yaw)); S.orient(UP)
    A.add(S, lambda q, n, m: mix(col, rib, 0.5 if m[1] % 2 == 1 else (0.12 if m[0] == 0 else 0.3)) if m[0] >= 0 else mix(col, rib, 0.6))

def conch(A, p, s, yaw=0.0, tilt=1.45):
    """a little spiral shell on its side: stacked whorls, banded"""
    prof = [(0.001, -0.1), (0.62, 0.0), (0.72, 0.42), (0.48, 0.62), (0.5, 0.9), (0.3, 1.12), (0.28, 1.32), (0.0, 1.6)]
    S = lathe([(max(r, 0) * s if r > 0.01 else 0.0, y * s) for r, y in prof], 7, ao=0.6)
    S.xf(tm(V(p[0], p[1] + s * 0.5, p[2]), yaw, 0.0, tilt)); S.orient()
    A.add(S, lambda q, n, m: mul(mix('#c88868', '#f8e2c4', 1.0 if m[0] in (2, 4, 6) else 0.45), 0.86 + 0.2 * clamp(n.y)))

def starfish(A, p, s, col='#ff8a5a', yaw=0.0, lt='#ffd8a8'):
    """a chubby starfish: a raised spine on five arms, skirted to the ground (40 tris)"""
    S = Shell(0.5); arms = 5; c = S.vert(V(0, 0.34 * s, 0), 0.0)
    tip, notch, spine, low = [], [], [], []
    for k in range(arms):
        a = TAU * k / arms; b = a + PI / arms
        spine.append(S.vert(V(math.cos(a) * s * 0.55, 0.26 * s, math.sin(a) * s * 0.55), 0.5))
        tip.append(S.vert(V(math.cos(a) * s, 0.09 * s, math.sin(a) * s), 1.0))
        notch.append(S.vert(V(math.cos(b) * s * 0.4, 0.12 * s, math.sin(b) * s * 0.4), 0.9))
        low.append((S.vert(V(math.cos(a) * s * 1.03, -0.02, math.sin(a) * s * 1.03), 1.2), S.vert(V(math.cos(b) * s * 0.44, -0.02, math.sin(b) * s * 0.44), 1.2)))
    for k in range(arms):
        k2 = (k + 1) % arms; pv = (k - 1) % arms
        S.f += [(c, spine[k], notch[k]), (spine[k], tip[k], notch[k]), (c, notch[pv], spine[k]), (spine[k], notch[pv], tip[k])]
        S.f += [(tip[k], low[k][0], low[k][1], notch[k]), (notch[k], low[k][1], low[k2][0], tip[k2])]
    S.xf(tm(V(p[0], p[1] + 0.012, p[2]), yaw)); S.orient(UP)
    A.add(S, lambda q, n, m: (mix(lt, col, sstep(0.0, 0.5, m)) if m < 1.1 else mul(col, 0.62)))

def barnacle(A, p, nrm, r=0.03):
    S = lathe([(r * 1.05, -0.004), (r * 0.82, r * 0.5), (r * 0.42, r * 0.7), (r * 0.3, r * 0.3), (0.0, r * 0.18)], 6, ao=0.3)
    S.xf(Matrix.Translation(p) @ UP.rotation_difference(nrm.normalized()).to_matrix().to_4x4()); S.orient()
    A.add(S, lambda q, n, m: '#4a4650' if m[0] >= 3 else mix('#b8b4a8', '#f0ece0', clamp(n.y)))

def mushroom(A, p, s, cap='#a0623e', cap_hi='#d29a68', stem='#f2e6d0', spot='#f4e4cc', tilt=0.0, yaw=0.0, spots=3, K=8):
    """a chunky round-capped mushroom: stem, gills, cap (about 70 tris)"""
    M = tm(p, yaw, tilt * 0.5, tilt)
    st = lathe([(s * 0.36, -0.01), (s * 0.27, s * 0.68)], 6, ao=0.7).xf(M); st.orient()
    A.add(st, lambda q, n, m: mul(stem, 0.84 + 0.14 * clamp((q.y - p[1]) / (s * 0.7) + 0.2)))
    prof = [(s * 0.3, s * 0.62), (s * 0.7, s * 0.56), (s * 0.72, s * 0.72), (s * 0.44, s * 1.04), (0.0, s * 1.15)]
    c = lathe(prof, K, ao=0.6, rfn=lambda r, y, a: r * (1 + 0.03 * math.sin(a * 3 + yaw))).xf(M); c.orient()
    def pc(q, n, m):
        if m[0] == 0: return mix('#c8a888', '#e8d4b8', 0.3)     # gills
        if m[0] == 1: return '#e8d4b8'
        return mul(mix(cap, cap_hi, clamp(n.y * 0.7 + 0.1)), 0.96 + 0.08 * nz(q, 30.0))
    A.add(c, pc)
    for k in range(spots):
        a = yaw + k * 2.4; el = 0.55 + 0.25 * (k % 2); u = V(math.cos(a) * math.cos(el), math.sin(el), math.sin(a) * math.cos(el))
        q0 = M @ V(u.x * s * 0.62, s * 0.7 + u.y * s * 0.42, u.z * s * 0.62)
        d = lathe([(s * 0.2, -0.006), (s * 0.13, s * 0.035), (0.0, s * 0.05)], 5, ao=0.1)
        d.xf(Matrix.Translation(q0) @ UP.rotation_difference((M.to_3x3() @ u).normalized()).to_matrix().to_4x4()); d.orient()
        A.add(d, spot)

def cocoon(A, p, s, tilt=0.0, yaw=0.0, thread=0.0, lo='#f2e8d6', hi='#fffaf0'):
    """a plump silk cocoon: waisted a little, wound with soft bands, with a thread up to its perch (~50 tris)"""
    pr = [(0.0, -1.0), (0.42, -0.86), (0.62, -0.42), (0.58, 0.0), (0.62, 0.42), (0.42, 0.86), (0.0, 1.0)]
    S = lathe([(r * s, y * s) for r, y in pr], 8, ao=0.3).xf(tm(p, yaw, 0, tilt)); S.orient()
    A.add(S, lambda q, n, m: mul(mix(lo, hi, n.y * 0.55 + 0.5), 0.94 if m[0] in (2, 4) else 1.0))
    if thread > 0:
        top = (tm(p, yaw, 0, tilt) @ V(0, s, 0))
        T = tube([top, top + V(0, thread, 0)], lambda i, u, a: 0.016, 3, ao=0.2); A.add(T, '#f4eee0')

def crystal(A, p, h, r, tx=0.0, tz=0.0, yaw=0.0, lo='#5f9fdc', mid='#90caf2', hi='#f0faff', broken=False, seed=0):
    """a hexagonal ice crystal, its facets flat-shaded: a darker foot, a lit shoulder, a slanted faceted tip.
    broken: snapped off short, the jagged fracture pale."""
    K = 6; M = tm(p, yaw, tx * 0.6, tz * 0.6)
    rnd = random.Random(seed * 13 + 3)
    sh = [0.0] * K
    ring = lambda rr, y: [V(math.cos(TAU * k / K) * rr, y, math.sin(TAU * k / K) * rr) for k in range(K)]
    y1 = h * (0.72 if not broken else 1.0)
    R0, R1, R2 = ring(r * 1.08, -0.03), ring(r * 0.98, y1 * 0.55), ring(r * 0.92, y1)
    for k in range(K):       # the facets, each flat
        k2 = (k + 1) % K; S = Shell(0.65)
        tone = (0.82, 1.1, 0.94, 1.18, 0.86, 1.04)[(k + seed) % 6]
        for i, q in enumerate((R0[k], R0[k2], R1[k2], R1[k], R2[k2], R2[k])): S.vert(M @ q, (0 if i < 2 else (1 if i < 4 else 2), tone))
        S.f = [(0, 1, 2, 3), (3, 2, 4, 5)]; S.orient(M.to_3x3() @ (R0[k] + R0[k2]))
        A.add(S, lambda q, n, m: mul(mix(lo, mid, m[0] * 0.5) if m[0] < 2 else mix(mid, hi, 0.45), m[1]))
    top = M @ V(r * 0.2 * (1 if not broken else 0), h, -r * 0.1 * (1 if not broken else 0))
    if not broken:
        for k in range(K):
            k2 = (k + 1) % K; S = Shell(0.3); tone = (1.0, 0.86, 1.1, 1.0, 0.92, 1.12)[(k + seed) % 6]
            S.vert(M @ R2[k], tone); S.vert(M @ R2[k2], tone); S.vert(top, tone); S.f = [(0, 1, 2)]; S.orient(M.to_3x3() @ (R2[k] + R2[k2]))
            A.add(S, lambda q, n, m: mul(hi, m) if m > 0.95 else mix(mid, hi, 0.55))
    else:
        c0 = M @ V(0, y1 + h * 0.2, 0); jag = [M @ (q + V(0, h * rnd.uniform(-0.12, 0.28), 0)) for q in R2]
        for k in range(K):
            k2 = (k + 1) % K; S = Shell(0.3)
            for q in (M @ R2[k], M @ R2[k2], jag[k2], jag[k]): S.vert(q, 0)
            S.f = [(0, 1, 2, 3)]; S.orient(M.to_3x3() @ (R2[k] + R2[k2])); A.add(S, mix(mid, hi, 0.4))
            T = Shell(0.25); T.vert(jag[k], 0); T.vert(jag[k2], 0); T.vert(c0, 0); T.f = [(0, 1, 2)]; T.orient(UP); A.add(T, mix(hi, mid, 0.15 * (k % 2)))

def rope_paint(lo='#a88a50', hi='#ecd6a0', turns=9):
    def p(q, n, m):
        s, a, i = m
        tw = 0.5 + 0.5 * math.cos(a + s * turns * TAU * 0.5)
        return mul(mix(lo, hi, 0.25 + 0.75 * tw), 0.86 + 0.18 * clamp(n.y * 0.5 + 0.5))
    return p

def coil(A, c, r0, r1, turns=2.2, seg=24, rr=0.024, K=4, pal=('#a88a50', '#ecd6a0'), rise=0.05):
    pts = []
    for i in range(seg + 1):
        t = i / seg; a = t * turns * TAU; r = r0 + (r1 - r0) * t
        pts.append(V(c[0] + math.cos(a) * r, c[1] + rr * 0.8 + t * rise, c[2] + math.sin(a) * r))
    S = tube(pts, lambda i, s, a: rr, K, ao=0.8)
    A.add(S, rope_paint(pal[0], pal[1], seg * 0.5))
    return S

def frond(A, base, d, L, W, up=UP, droop=0.3, lobes=3, lo='#2c6646', hi='#5c9e62', snow=None, both=False, ao=0.6, tip_col=None):
    """a flat serrated frond (fern, fir needles): a zig-zag outline either side of a rib, folded a little"""
    d = d.normalized(); side = d.cross(up)
    if side.length < 1e-5: side = perp(d)
    side.normalize(); nrm = side.cross(d).normalized()
    if nrm.dot(up) < 0: nrm = -nrm
    S = Shell(ao); n = 2 * lobes + 1; rows = []
    for i in range(n + 1):
        s = i / n; c = base + d * L * s - up * droop * L * s * s
        w = W * (math.sin(PI * min(1.0, s * 1.02) ** 0.8)) * (1.0 if i % 2 == 1 else 0.58)
        if i == n: w = 0.0
        rows.append([c - side * w - nrm * w * 0.3, c, c + side * w - nrm * w * 0.3])
    ids = grid(S, rows, False, meta=lambda i, j: (i / n, j - 1, i % 2))
    S.orient(nrm)
    tipc = tip_col or hi
    def p(q, nn, m):
        s, k, od = m
        c = mix(lo, hi, 0.2 + 0.6 * s)
        if k != 0 and od: c = mix(c, tipc, 0.5)
        if k == 0: c = mul(c, 0.86)
        if snow: c = snow(q, nn, c, m)
        return c
    A.add(S, p)
    if both:
        T = Shell(ao); T.v = [v - nrm * 0.008 for v in S.v]; T.m = list(S.m); T.f = [tuple(reversed(f)) for f in S.f]; T.fixed = True
        A.add(T, lambda q, nn, m: mul(lo, 0.85))
    return S

def fern(A, p, L=0.36, W=0.07, n=6, seed=0, lo='#3f7a3a', hi='#8cc45c', el=0.8):
    rnd = random.Random(seed * 3 + 1)
    for k in range(n):
        a = TAU * k / n + rnd.uniform(-0.25, 0.25); e = el + rnd.uniform(-0.15, 0.15)
        d = V(math.cos(a) * math.cos(e), math.sin(e), math.sin(a) * math.cos(e))
        frond(A, Vector(p) + V(0, 0.01, 0), d, L * rnd.uniform(0.8, 1.1), W, droop=0.55, lobes=2, lo=lo, hi=hi, both=True, ao=0.5)

def culm(A, a, b, r, pal, K=8, nodes=3, seed=0, cut0=None, cut1=None, taper=0.97, side=None, bend=0.0, ao=1.0, band='#a88a48'):
    """a bamboo culm: straight internodes with a soft swell either side of each node ring (a dark band and a pale ring),
    hollow ends cut square or slanted. cut: the slant (metres along the axis across the diameter) or 0 for square; None: no hollow."""
    d = b - a; L = d.length; T = d.normalized()
    # the stations along the culm: (t, radius scale, kind)
    st = []; n = nodes
    for i in range(n):
        t0, t1 = i / n, (i + 1) / n; ln = (t1 - t0)
        if i == 0: st.append((0.0, 1.0, 0))
        else: st.append((t0 + 0.05 / L, 1.0, 0))
        st.append((t0 + ln * 0.5, 0.965, 0))
        if i < n - 1:
            st.append((t1 - 0.05 / L, 1.0, 0)); st.append((t1 - 0.012 / L, 1.09, 1)); st.append((t1 + 0.012 / L, 1.09, 1))
    st.append((1.0, 1.0, 0))
    N0 = perp(T); B0 = T.cross(N0)
    S = Shell(ao); rows = []
    for j, (t, rs, kind) in enumerate(st):
        c = a.lerp(b, t) + (side or V(0, 0, 0)) * bend * L * math.sin(t * PI)
        rr = r * (1 - (1 - taper) * t) * rs; row = []
        for k in range(K):
            ang = TAU * k / K; u = N0 * math.cos(ang) + B0 * math.sin(ang)
            q = c + u * rr
            if j == 0 and cut0: q += T * cut0 * (0.5 + 0.5 * math.cos(ang))
            if j == len(st) - 1 and cut1: q -= T * cut1 * (0.5 + 0.5 * math.cos(ang))
            row.append(q)
        rows.append(row)
    ids = grid(S, rows, True, meta=lambda i, j: (st[i][0], st[i][2], TAU * j / K))
    S.orient()
    bark, hi = pal['bark'], pal['hi']
    def p(q, n_, m):
        t, kind, ang = m
        c = mix(bark, hi, n_.y * 0.6 + 0.35)
        if kind == 1: c = mix(c, band, 0.72)
        else: c = mul(c, 0.96 + 0.08 * math.cos(ang * 0.8 + seed))
        return mul(c, 0.97 + 0.06 * nz(q, 9.0, (seed, 0, 0)))
    A.add(S, p)
    for row_ids, sgn in ((ids[0], -1), (ids[-1], 1)):
        rim = Shell(0.3); ctr = sum((S.v[i] for i in row_ids), Vector()) / K; ax = T * sgn
        R0 = [S.v[i] for i in row_ids]; R1 = [ctr.lerp(q, 0.72) for q in R0]; R2 = [q - ax * r * 1.1 for q in R1]
        ii = grid(rim, [R0, R1], True, meta=lambda i, j: (0, i)); rim.orient(ax)
        A.add(rim, pal['end'])
        ins = Shell(0.0); grid(ins, [R1, R2], True, pole1=ctr - ax * r * 1.1, meta=lambda i, j: (0, i))
        ins.orient(); ins.flip(); A.add(ins, lambda q, n_, m: '#4a3a24' if m[1] > 0 else '#8a7444')
    return S

def lashing(A, c, axis, r, K=4, seg=10, wraps=1, col=('#b08c4c', '#ecd08a'), sc=(1, 1), rr=0.026):
    """a band of straw rope around a bundle: a loop in the plane normal to `axis`"""
    ax = axis.normalized(); s1 = perp(ax); s2 = ax.cross(s1)
    pts = [c + s1 * math.cos(TAU * i / seg) * r * sc[0] + s2 * math.sin(TAU * i / seg) * r * sc[1] for i in range(seg)]
    S = tube(pts, lambda i, s, a: rr, K, closed=True, ao=0.6); A.add(S, rope_paint(col[0], col[1], seg * 0.55)); return S

def twig_leaves(A, a, b, leaves, lo, hi, r=0.018, pal=None, W=0.05, L=0.22, droop=0.35, seed=0, both=True):
    pal = pal or dict(bark='#7a9a40', hi='#a8c060', end='#d8e0a0', ring='#a0b060')
    log(A, a, b, r, pal, K=4, n=2, bend=0.04, seed=seed, ridge=0.0, caps=(False, False), wob=0.0)
    rnd = random.Random(seed * 5 + 2); d = b - a
    for k in range(leaves):
        t = 0.45 + 0.55 * k / max(1, leaves - 1); q = a + d * t
        ang = rnd.uniform(-1.2, 1.2) + (0.9 if k % 2 else -0.9)
        dd = (Matrix.Rotation(ang, 3, 'Y') @ d).normalized() + V(0, rnd.uniform(-0.3, 0.1), 0)
        blade(A, q, dd, L * rnd.uniform(0.85, 1.1), W, droop=droop, segs=3, lo=lo, hi=hi, both=both)
