# PAWHAVEN: the housing furniture's beds, storage and kitchen (task furn-big), built in Blender by script.
#   blender --background --factory-startup --python build_furn-big.py -- --piece futonBed|pupBasket|treasureChest|all
# Deterministic: no random state at all (hash noise only); a re-run reproduces every GLB exactly.
# Frame (src/home/furnitureMesh.js): 1 unit = 1 m, Blender Z up, the item's front faces -Y (the game's +z), centred on
# its footprint with z = 0 at its base. The layout code is written in the kit's game frame (x right, y up, z front) and
# mapped to Blender (x, -z, y), so the kit builders (src/home/furnitureModels.js) port across directly.
# The shared mesh kit (rounded boxes with analytic normals, lathes, tubes, sweeps, painters, emblems) is the one from
# tools/blender/codex/assets/landmarks-hollow (itself from the Guild): copied in below, unchanged except add().
# Materials: `body` (wood, wicker, gold) and `cloth` (futon, quilt, pillows, cushion). The cloth object carries a UV map
# with v = 0 everywhere (glTF uv.y = 1: the cloth wind shader's "attached" edge), so beds never sway.
import bpy, bmesh, math, os, sys
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..', '..'))
MODELS = os.path.join(REPO, 'public', 'models')
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
PIECE = argv[argv.index('--piece') + 1] if '--piece' in argv else 'all'
print('FB build pid', os.getpid())

X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))
TAU = math.tau

# ================================================================== colour
def s2l(c): return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
def srgb(h):
    """'#rrggbb' -> sRGB tuple (0..1). Colours are designed and mixed in sRGB, converted to linear on write."""
    if isinstance(h, tuple): return h[:3]
    h = h.lstrip('#'); return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
def mix(a, b, t):
    a, b = srgb(a), srgb(b); t = max(0.0, min(1.0, t))
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))
def mul(a, k): a = srgb(a); return tuple(max(0.0, min(1.0, c * k)) for c in a)
def grey(v): return (v, v, v)
def lin(c): c = srgb(c); return (s2l(c[0]), s2l(c[1]), s2l(c[2]), 1.0)

def clamp(x, a=0.0, b=1.0): return max(a, min(b, x))
def smooth(a, b, x):
    t = clamp((x - a) / (b - a)) if b != a else (1.0 if x >= b else 0.0)
    return t * t * (3 - 2 * t)

# deterministic value noise (lattice hash), for low-frequency painted variation
def _h(i, j, k, s):
    n = (i * 73856093) ^ (j * 19349663) ^ (k * 83492791) ^ (s * 2654435761)
    n = (n ^ (n >> 13)) * 1274126177
    return ((n ^ (n >> 16)) & 0xffffff) / 0xffffff
def vnoise(p, f=1.0, s=0):
    x, y, z = p.x * f, p.y * f, p.z * f
    i, j, k = math.floor(x), math.floor(y), math.floor(z)
    u, v, w = x - i, y - j, z - k
    u, v, w = u * u * (3 - 2 * u), v * v * (3 - 2 * v), w * w * (3 - 2 * w)
    acc = 0.0
    for di in (0, 1):
        for dj in (0, 1):
            for dk in (0, 1):
                acc += _h(i + di, j + dj, k + dk, s) * (u if di else 1 - u) * (v if dj else 1 - v) * (w if dk else 1 - w)
    return acc  # 0..1

# ================================================================== mesh accumulation
class Tmp:
    """one generated shell: verts, faces (oriented by hints), optional analytic normals"""
    def __init__(self):
        self.v = []; self.n = []; self.f = []
    def vert(self, p, n=None):
        self.v.append(Vector(p)); self.n.append(None if n is None else Vector(n).normalized()); return len(self.v) - 1
    def face(self, idx, hint):
        P = [self.v[i] for i in idx]
        nn = Vector((0, 0, 0))
        for i in range(len(P)):
            a, b = P[i], P[(i + 1) % len(P)]
            nn += Vector(((a.y - b.y) * (a.z + b.z), (a.z - b.z) * (a.x + b.x), (a.x - b.x) * (a.y + b.y)))
        if nn.length < 1e-14: return            # degenerate: dropped
        if nn.dot(hint) < 0: idx = list(reversed(idx))
        self.f.append(list(idx))
    def orient(self):
        """consistent winding per connected shell (BFS over shared edges), then outward by signed volume"""
        F = self.f; edge = {}
        for fi, f in enumerate(F):
            for k in range(len(f)):
                a, b = f[k], f[(k + 1) % len(f)]
                edge.setdefault((min(a, b), max(a, b)), []).append(fi)
        seen = [False] * len(F)
        for s0 in range(len(F)):
            if seen[s0]: continue
            comp = [s0]; seen[s0] = True; stack = [s0]
            while stack:
                fi = stack.pop(); f = F[fi]
                for k in range(len(f)):
                    a, b = f[k], f[(k + 1) % len(f)]
                    for g in edge[(min(a, b), max(a, b))]:
                        if seen[g]: continue
                        gf = F[g]
                        if any(gf[m] == a and gf[(m + 1) % len(gf)] == b for m in range(len(gf))): F[g] = gf[::-1]
                        seen[g] = True; stack.append(g); comp.append(g)
            vol = 0.0
            for fi in comp:
                P = [self.v[i] for i in F[fi]]
                for k in range(1, len(P) - 1): vol += P[0].dot(P[k].cross(P[k + 1]))
            if vol < 0:
                for fi in comp: F[fi] = F[fi][::-1]
        return self
    def normals(self):
        acc = [Vector((0, 0, 0)) for _ in self.v]
        for f in self.f:
            P = [self.v[i] for i in f]
            nn = Vector((0, 0, 0))
            for k in range(1, len(P) - 1): nn += (P[k] - P[0]).cross(P[k + 1] - P[0])
            for i in f: acc[i] += nn
        for i, n in enumerate(self.n):
            if n is None: self.n[i] = acc[i].normalized() if acc[i].length > 1e-14 else Vector((0, 0, 1))
    def xform(self, M):
        R = M.to_3x3()
        self.v = [M @ v for v in self.v]
        self.n = [None if n is None else (R @ n).normalized() for n in self.n]
        return self

class Asset:
    """the piece: per-object, per-material vertex/face lists, painted vertex colours"""
    def __init__(self):
        self.objs = {}   # obj name -> dict(v, n, c, f, m, mats[list])
        self.count = {}
    def add(self, obj, mat, t, col, tag=None):
        t.orient(); t.normals()
        o = self.objs.setdefault(obj, dict(v=[], n=[], c=[], f=[], m=[], mats=[]))
        if mat not in o['mats']: o['mats'].append(mat)
        mi = o['mats'].index(mat); b = len(o['v'])
        for p, n in zip(t.v, t.n):
            c = col(p, n) if callable(col) else col
            o['v'].append(p); o['n'].append(n); o['c'].append(lin(c))
        for f in t.f: o['f'].append([i + b for i in f]); o['m'].append(mi)
        tr = sum(len(f) - 2 for f in t.f)
        k = tag or mat; self.count[k] = self.count.get(k, 0) + tr
        return t
    def tris(self, obj=None):
        return sum(sum(len(f) - 2 for f in o['f']) for k, o in self.objs.items() if obj in (None, k))

# ================================================================== generators
def _axis_samples(h, r, seg, extra):
    """sample coordinates along one axis of a rounded box: the bevel band (seg rows per edge) + extra interior rows"""
    if r <= 1e-6:
        band = [-h]
    elif seg == 1:
        band = [-h, -h + r]
    else:
        band = [-h, -h + r * (1 - math.tan(math.pi / 8)), -h + r]
    inner = [(-h + r) + (2 * (h - r)) * (i + 1) / (extra + 1) for i in range(extra)]
    neg = band + inner
    return neg + [-q for q in reversed(band)]

def rbox(size, r=0.03, seg=1, extra=(0, 0, 0), M=None, warp=None):
    """rounded box (full size), centred at the origin, with analytic normals; M places it; warp(p) -> p deforms"""
    hx, hy, hz = size[0] / 2, size[1] / 2, size[2] / 2
    r = min(r, hx * 0.98, hy * 0.98, hz * 0.98)
    if seg == 1 and r > 1e-6 and tuple(extra) == (0, 0, 0):
        # minimal bevel box (44 tris): 6 inset faces, 12 bevel strips, 8 corner triangles; each vertex carries its
        # face's normal, so the strips shade as a smooth round-over
        H = (hx, hy, hz); t = Tmp(); vid = {}
        def FV(a, sa, sb, sc):
            k = (a, sa, sb, sc)
            if k not in vid:
                b, c = [i for i in range(3) if i != a]
                q = [0.0, 0.0, 0.0]; q[a] = sa * H[a]; q[b] = sb * (H[b] - r); q[c] = sc * (H[c] - r)
                n = Vector((0, 0, 0)); n[a] = sa
                vid[k] = t.vert(q, n)
            return vid[k]
        for a in range(3):
            for sa in (-1, 1):
                hint = Vector((0, 0, 0)); hint[a] = sa
                t.face([FV(a, sa, -1, -1), FV(a, sa, 1, -1), FV(a, sa, 1, 1), FV(a, sa, -1, 1)], hint)
        def corner(a, sv):      # face a's vertex nearest the octant sv
            b, c = [i for i in range(3) if i != a]
            return FV(a, sv[a], sv[b], sv[c])
        for a in range(3):
            for b in range(a + 1, 3):
                c = 3 - a - b
                for sa in (-1, 1):
                    for sb in (-1, 1):
                        quad = []
                        for sc in (-1, 1):
                            sv = [0, 0, 0]; sv[a] = sa; sv[b] = sb; sv[c] = sc
                            quad.append((corner(a, sv), corner(b, sv)))
                        hint = Vector((0, 0, 0)); hint[a] = sa; hint[b] = sb
                        t.face([quad[0][0], quad[1][0], quad[1][1], quad[0][1]], hint)
        for sx in (-1, 1):
            for sy in (-1, 1):
                for sz in (-1, 1):
                    sv = [sx, sy, sz]
                    t.face([corner(0, sv), corner(1, sv), corner(2, sv)], Vector(sv))
        if M is not None: t.xform(M)
        return t
    ax = [_axis_samples(hx, r, seg, extra[0]), _axis_samples(hy, r, seg, extra[1]), _axis_samples(hz, r, seg, extra[2])]
    inner = (hx - r, hy - r, hz - r)
    t = Tmp(); key = {}
    def V(q):
        k = (round(q[0], 6), round(q[1], 6), round(q[2], 6))
        if k in key: return key[k]
        cl = Vector([max(-inner[i], min(inner[i], q[i])) for i in range(3)])
        d = Vector(q) - cl
        if d.length < 1e-9: n = Vector(q).normalized()
        else: n = d.normalized()
        p = cl + n * r if r > 1e-6 else Vector(q)
        if r <= 1e-6:
            n = Vector([math.copysign(1.0, q[i]) for i in range(3)]).normalized()
        key[k] = t.vert(p, n); return key[k]
    for axis in range(3):
        a1, a2 = [i for i in range(3) if i != axis]
        for sgn in (-1, 1):
            hv = (hx, hy, hz)[axis] * sgn
            A, Bs = ax[a1], ax[a2]
            for i in range(len(A) - 1):
                for j in range(len(Bs) - 1):
                    quad = []
                    for (ii, jj) in ((i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1)):
                        q = [0, 0, 0]; q[axis] = hv; q[a1] = A[ii]; q[a2] = Bs[jj]; quad.append(V(q))
                    hint = Vector((0, 0, 0)); hint[axis] = sgn
                    t.face(quad, hint)
    if warp:
        t.v = [warp(p) for p in t.v]; t.n = [None] * len(t.v)
    if M is not None: t.xform(M)
    return t

def ring_surface(t, rings, centres, pole0=None, pole1=None, closed=False, hints=None):
    ids = [[t.vert(p) for p in ring] for ring in rings]
    K = len(rings[0]); R = len(rings)
    for j in range(R - 1 + (1 if closed else 0)):
        j1 = (j + 1) % R
        c = (centres[j] + centres[j1]) / 2
        for k in range(K):
            q = [ids[j][k], ids[j][(k + 1) % K], ids[j1][(k + 1) % K], ids[j1][k]]
            fc = sum((t.v[i] for i in q), Vector()) / 4
            t.face(q, (fc - c) if hints is None else hints(fc, c))
    for pole, ring, c in ((pole0, 0, centres[0]), (pole1, -1, centres[-1])):
        if pole is None: continue
        pi = t.vert(pole)
        for k in range(K):
            q = [pi, ids[ring][(k + 1) % K], ids[ring][k]] if ring == 0 else [pi, ids[ring][k], ids[ring][(k + 1) % K]]
            fc = sum((t.v[i] for i in q), Vector()) / 3
            t.face(q, (fc - c) if hints is None else hints(fc, c))
    return ids

def se_dir(th, e=2.0):
    """superellipse unit section direction (cos, sin) with exponent e (2 = ellipse)"""
    c, s = math.cos(th), math.sin(th)
    return (math.copysign(abs(c) ** (2 / e), c), math.copysign(abs(s) ** (2 / e), s))

def lathe(prof, K, sx=1.0, sy=1.0, e=2.0, th0=0.0, rfn=None, off=None):
    """surface of revolution about Z: prof [(r, z)] bottom -> top, r = 0 ends become poles.
    sx, sy scale the section; e its superellipse exponent; rfn(r, z, th) wobbles; off(z) -> (dx, dy) leans."""
    t = Tmp(); rings, cs = [], []
    body = list(prof); p0 = p1 = None
    o0 = off(body[0][1]) if off else (0, 0); o1 = off(body[-1][1]) if off else (0, 0)
    if body[0][0] < 1e-6: p0 = Vector((o0[0], o0[1], body[0][1])); body = body[1:]
    if body[-1][0] < 1e-6: p1 = Vector((o1[0], o1[1], body[-1][1])); body = body[:-1]
    for r, z in body:
        ring = []; o = off(z) if off else (0, 0)
        for k in range(K):
            th = th0 + TAU * k / K
            rr = rfn(r, z, th) if rfn else r
            c, s = se_dir(th, e)
            ring.append(Vector((o[0] + c * rr * sx, o[1] + s * rr * sy, z)))
        rings.append(ring); cs.append(Vector((o[0], o[1], z)))
    ring_surface(t, rings, cs, p0, p1)
    return t

def frames(path, up=Z):
    n = len(path); out = []
    for i in range(n):
        T = (path[min(i + 1, n - 1)] - path[max(i - 1, 0)]).normalized()
        u0 = up if abs(T.dot(up)) < 0.95 else Vector((1, 0, 0))     # (vertical paths: another reference axis)
        U = (u0 - T * u0.dot(T)).normalized()
        W = T.cross(U)
        out.append((T, W, U))
    return out

def tube(path, rad, K=8, caps=True, up=Z):
    """a round tube along path; rad(s) radius (s 0..1); rounded caps (two rings + pole)"""
    n = len(path); F = frames(path, up)
    rings, cs = [], []
    def ring(p, W, U, r):
        return [p + W * (r * math.cos(TAU * k / K)) + U * (r * math.sin(TAU * k / K)) for k in range(K)]
    if caps:
        T, W, U = F[0]; r0 = rad(0.0)
        for a in (0.62,):                 # (one inset ring + a pole: a rounded end at a third of the cost)
            ang = a * math.pi / 2
            q = path[0] - T * (r0 * math.sin(ang)); rings.append(ring(q, W, U, r0 * math.cos(ang))); cs.append(q)
    for i, (p, (T, W, U)) in enumerate(zip(path, F)):
        rings.append(ring(p, W, U, rad(i / (n - 1)))); cs.append(p)
    if caps:
        T, W, U = F[-1]; r1 = rad(1.0)
        for a in (0.62,):
            ang = a * math.pi / 2
            q = path[-1] + T * (r1 * math.sin(ang)); rings.append(ring(q, W, U, r1 * math.cos(ang))); cs.append(q)
    t = Tmp()
    ring_surface(t, rings, cs, (path[0] - F[0][0] * rad(0.0)) if caps else None, (path[-1] + F[-1][0] * rad(1.0)) if caps else None)
    return t

def sweep(path, prof, up=Z, cap=True, inset=0.3, cap_d=0.012):
    """a closed 2-D profile (list of (w, u) pts, CCW, convex about its centroid; or prof(i) per station) swept along
    path; ends: an inset ring (rounded edge) then a flat fan cap with its own verts."""
    F = frames(path, up); n = len(path)
    P = (lambda i: prof(i)) if callable(prof) else (lambda i: prof)
    def ring(i, shrink=0.0, dx=0.0):
        pr = P(i); cw = sum(q[0] for q in pr) / len(pr); cu = sum(q[1] for q in pr) / len(pr)
        T, W, U = F[i]; p = path[i] + T * dx
        return [p + W * (cw + (q[0] - cw) * (1 - shrink)) + U * (cu + (q[1] - cu) * (1 - shrink)) for q in pr], p + W * cw + U * cu
    rings, cs = [], []
    if cap:
        r, c = ring(0, inset, -cap_d); rings.append(r); cs.append(c)
    for i in range(n):
        r, c = ring(i); rings.append(r); cs.append(c)
    if cap:
        r, c = ring(n - 1, inset, cap_d); rings.append(r); cs.append(c)
    t = Tmp(); R = ring_surface(t, rings, cs)
    if cap:
        for ids, c, T in ((R[0], cs[0], -F[0][0]), (R[-1], cs[-1], F[-1][0])):
            ci = t.vert(c, T)
            for k in range(len(ids)):
                t.face([ci, ids[k], ids[(k + 1) % len(ids)]], T)
    return t

def resample(poly, n):
    """n points evenly spaced by arc length along a polyline of Vectors"""
    Ls = [0.0]
    for i in range(1, len(poly)): Ls.append(Ls[-1] + (poly[i] - poly[i - 1]).length)
    tot = Ls[-1]; out = []; j = 0
    for k in range(n):
        d = tot * k / (n - 1)
        while j < len(Ls) - 2 and Ls[j + 1] < d: j += 1
        t = (d - Ls[j]) / max(1e-12, Ls[j + 1] - Ls[j]); out.append(poly[j].lerp(poly[j + 1], t))
    return out

def ellipsoid(c, r, K=10, J=6):
    """an ellipsoid (radii r = (rx, ry, rz)) as a lathe"""
    prof = [(math.sin(math.pi * j / J), -math.cos(math.pi * j / J)) for j in range(J + 1)]
    prof[0] = (0.0, prof[0][1]); prof[-1] = (0.0, prof[-1][1])
    t = lathe([(a, b * r[2]) for a, b in prof], K, sx=r[0], sy=r[1], th0=math.pi / K)
    return t.xform(Matrix.Translation(c))

def drape(F, he, thick, ths, J, inner, bead=True):
    """'icing' over a surface: F(th, h) -> point on the base surface, h = 0 at its top pole and growing downward;
    the cap covers h < he(th) with thickness thick(th, s) (s = h / he), then a rolled lip that bulges proud and curls
    back under, its edge tucked into the surface. ths: the angles sampled round the cap (an int = that many, evenly;
    a list lets drips get extra samples). Closed: the tuck ring fans to `inner`, a point inside the base solid."""
    if isinstance(ths, int): ths = [TAU * k / ths for k in range(ths)]
    K = len(ths)
    def N(th, h):
        e = 1e-4
        a = F(th + e, h) - F(th - e, h); b = F(th, h + e) - F(th, max(0.0, h - e))
        n = b.cross(a)
        if n.length < 1e-12: return Z.copy()
        n.normalize()
        out = F(th, h) - inner
        return n if n.dot(out) >= 0 else -n
    t = Tmp(); rings, cs = [], []
    ss = [(j / J) ** 1.6 for j in range(1, J + 1)]
    for s in ss:
        rings.append([F(th, he(th) * s) + N(th, max(he(th) * s, 1e-3)) * thick(th, s) for th in ths]); cs.append(inner)
    lipr, curl, tuck = [], [], []
    for th in ths:
        h = he(th); n = N(th, h); dn = (F(th, h + 0.01) - F(th, h)).normalized(); tk = thick(th, 1.0)
        lipr.append(F(th, h) + dn * tk * 0.5 + n * tk * 0.82)
        curl.append(F(th, h) + dn * tk * 0.72 + n * tk * 0.28)
        tuck.append(F(th, h - 0.004) - n * 0.008)
    rings += ([lipr, curl, tuck] if bead else [lipr, tuck]); cs += [inner] * (3 if bead else 2)
    top = F(0.0, 0.0) + N(0.0, 1e-3) * thick(0.0, 0.0)
    ids = ring_surface(t, rings, cs, pole0=top)
    ci = t.vert(inner)
    last = ids[-1]
    for k in range(K):
        q = [ci, last[(k + 1) % K], last[k]]
        fc = (t.v[last[k]] + t.v[last[(k + 1) % K]]) / 2
        t.face(q, -(fc - inner) * 0.2 + (inner - top).normalized())
    return t

def drip_angles(base_n, drips, offs=(-0.85, -0.45, 0.0, 0.45, 0.85), min_gap=0.035):
    """sample angles: base_n even ones plus extra samples across each drip (th, length, half-width)"""
    a = [TAU * k / base_n for k in range(base_n)]
    for th, L, w in drips:
        a += [(th + o * w) % TAU for o in offs]
    a = sorted(x % TAU for x in a); out = []
    for x in a:
        if not out or x - out[-1] > min_gap: out.append(x)
    if TAU - out[-1] + out[0] < min_gap: out.pop()
    return out

def drip_he(base, drips):
    """an edge-length function: base(th) plus rounded drips (th, length, half-width)"""
    def f(th):
        e = base(th)
        for th_d, L, w in drips:
            d = math.atan2(math.sin(th - th_d), math.cos(th - th_d)) / w
            if abs(d) < 1: e += L * (1 - d * d) ** 0.55
        return e
    return f

def tube_loop(path, rad, K=6, up=Z):
    """a closed tube along a closed path (no repeated end point)"""
    n = len(path); rings, cs = [], []
    for i, p in enumerate(path):
        T = (path[(i + 1) % n] - path[i - 1]).normalized()
        U = (up - T * up.dot(T)).normalized(); W = T.cross(U); r = rad(i / n)
        rings.append([p + W * (r * math.cos(TAU * k / K)) + U * (r * math.sin(TAU * k / K)) for k in range(K)]); cs.append(p)
    t = Tmp(); ring_surface(t, rings, cs, closed=True)
    return t

def blob(c, r, h, lobes=4, K=10, seed=0, amp=0.22):
    """a lobed cushion (a tuft, a dollop): a squat lathe with a lobed outline, resting at c"""
    ph = seed * 1.7
    t = lathe([(0.0, 0.0), (r, 0.0), (r * 0.78, h * 0.6), (0.0, h)], K, th0=ph,
              rfn=lambda rr, z, th: rr * (1 + amp * math.cos(lobes * th + ph) + 0.06 * math.sin(3 * th + seed)))
    return t.xform(Matrix.Translation(c))

def grid_slab(w, h, nx, nz, depth, back, carve=None):
    """a slab facing -Y: the front a displaced grid (carve(u, v) -> depth into +Y), the rim and a flat back
    (y = back) closed by fans. Centred at the origin in x/z; the front plane at y = 0."""
    t = Tmp(); ids = []
    for j in range(nz + 1):
        row = []
        for i in range(nx + 1):
            u = -w / 2 + w * i / nx; v = -h / 2 + h * j / nz
            d = carve(u, v) if carve else 0.0
            row.append(t.vert((u, d, v)))
        ids.append(row)
    for j in range(nz):
        for i in range(nx):
            t.face([ids[j][i], ids[j][i + 1], ids[j + 1][i + 1], ids[j + 1][i]], -Y)
    # rim loop (CCW seen from the front), side quads to the back loop, back fan
    loop = [ids[0][i] for i in range(nx + 1)] + [ids[j][nx] for j in range(1, nz + 1)] + \
           [ids[nz][i] for i in range(nx - 1, -1, -1)] + [ids[j][0] for j in range(nz - 1, 0, -1)]
    bl = [t.vert((t.v[i].x, back, t.v[i].z)) for i in loop]
    for k in range(len(loop)):
        a, b = loop[k], loop[(k + 1) % len(loop)]
        mid = (t.v[a] + t.v[b]) / 2
        t.face([a, b, bl[(k + 1) % len(loop)], bl[k]], Vector((mid.x, 0, mid.z)))
    cb = t.vert((0, back, 0))
    for k in range(len(bl)):
        t.face([cb, bl[k], bl[(k + 1) % len(bl)]], Y)
    return t

def M_at(loc, rz=0.0, rx=0.0, ry=0.0, s=1.0):
    return Matrix.Translation(loc) @ Matrix.Rotation(rz, 4, 'Z') @ Matrix.Rotation(ry, 4, 'Y') @ Matrix.Rotation(rx, 4, 'X') @ Matrix.Scale(s, 4)

# ================================================================== painting helpers
def paint(base, top=0.10, bot=0.20, lo=None, ao_z=None, ao_k=0.22, ao_h=0.14, hi=None, nz_amp=0.0, nz_f=3.0, seed=0):
    """soft painted shading: lighter on up-facing, darker on down-facing; optional AO toward a contact height
    ao_z (darkening within ao_h above it); hi: the colour toward the top (else base lightened)."""
    def f(p, n):
        up = n.z
        if up >= 0: c = mix(base, hi, up * top * 5) if hi else mul(base, 1 + top * up)
        else: c = mul(base, 1 + bot * up)
        if ao_z is not None:
            k = 1 - ao_k * (1 - smooth(0.0, ao_h, p.z - ao_z))
            c = mul(c, k)
        if nz_amp: c = mul(c, 1 + nz_amp * (vnoise(p, nz_f, seed) - 0.5) * 2)
        return c
    return f

# ================================================================== materials and objects
def make_mat(name, factor=None, emission=None):
    mt = bpy.data.materials.new(name); mt.use_nodes = True; nt = mt.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Roughness'].default_value = 0.8; bsdf.inputs['Metallic'].default_value = 0.0
    if emission is not None:
        bsdf.inputs['Base Color'].default_value = lin(emission)
        bsdf.inputs['Emission Color'].default_value = lin(emission)
        bsdf.inputs['Emission Strength'].default_value = 3.0
        return mt
    vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'
    if factor is None:
        nt.links.new(vc.outputs['Color'], bsdf.inputs['Base Color'])
    else:  # Col x factor (the glTF exporter writes the factor as baseColorFactor next to COLOR_0)
        mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'MULTIPLY'
        mx.inputs['Factor'].default_value = 1.0
        nt.links.new(vc.outputs['Color'], mx.inputs[6]); mx.inputs[7].default_value = lin(factor)
        nt.links.new(mx.outputs[2], bsdf.inputs['Base Color'])
    return mt

def to_object(name, o, matmap, origin=None):
    me = bpy.data.meshes.new(name)
    org = Vector(origin) if origin is not None else Vector((0, 0, 0))
    me.from_pydata([tuple(v - org) for v in o['v']], [], o['f'])
    me.update()
    attr = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    cols = []
    for poly in me.polygons:
        for li in poly.loop_indices: cols.extend(o['c'][me.loops[li].vertex_index])
    attr.data.foreach_set('color', cols)
    me.color_attributes.active_color = attr
    try: me.color_attributes.render_color_index = me.color_attributes.find('Col')
    except Exception: pass
    for m in o['mats']: me.materials.append(matmap[m])
    me.polygons.foreach_set('material_index', o['m'])
    me.shade_smooth()
    if any(o.get('ln', [])):
        lns = []
        for pi, poly in enumerate(me.polygons):
            fl = o['ln'][pi]
            for k, li in enumerate(poly.loop_indices):
                lns.append(tuple(fl[k]) if fl else tuple(o['n'][me.loops[li].vertex_index]))
        me.normals_split_custom_set(lns)
    else:
        me.normals_split_custom_set_from_vertices([tuple(n) for n in o['n']])
    me.update()
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
    ob.location = org
    return ob

def check(ob):
    """closed shells, no NaN / zero-area faces"""
    bm = bmesh.new(); bm.from_mesh(ob.data)
    bnd = sum(1 for e in bm.edges if e.is_boundary)
    nonman = sum(1 for e in bm.edges if not e.is_manifold and not e.is_boundary)
    zero = sum(1 for f in bm.faces if f.calc_area() < 1e-9)
    nan = sum(1 for v in bm.verts if any(math.isnan(c) for c in v.co))
    bm.free()
    nn = 0
    for l in ob.data.loops:
        if any(math.isnan(c) for c in l.normal): nn += 1
    return dict(boundary_edges=bnd, nonmanifold=nonman, zero_area=zero, nan_verts=nan, nan_normals=nn)


# ================================================================== per-vertex colours on generated shells
class Asset2(Asset):
    """Asset whose add() also takes per-vertex colours carried on the Tmp (t.c) when col is None"""
    def add(self, obj, mat, t, col, tag=None):
        t.orient(); t.normals()
        o = self.objs.setdefault(obj, dict(v=[], n=[], c=[], f=[], m=[], mats=[]))
        if mat not in o['mats']: o['mats'].append(mat)
        mi = o['mats'].index(mat); b = len(o['v'])
        for i, (p, n) in enumerate(zip(t.v, t.n)):
            c = t.c[i] if col is None else (col(p, n) if callable(col) else col)
            o['v'].append(p); o['n'].append(n); o['c'].append(lin(c))
        o.setdefault('ln', [None] * len(o['f']))
        cn = getattr(t, 'cn', None)
        for f in t.f:
            o['f'].append([i + b for i in f]); o['m'].append(mi)
            o['ln'].append(cn(f) if cn else None)                 # optional per-corner (split) normals
        tr = sum(len(f) - 2 for f in t.f)
        k = tag or mat; self.count[k] = self.count.get(k, 0) + tr
        return t

# ================================================================== the game frame
# Everything below is written in the kit's game frame (x right, y up, z toward the front / camera side), then mapped
# into Blender (x, -z, y) by GM. F is a transform stack like the kit Builder's push / pop (three.js Euler XYZ).
GM = Matrix.Rotation(math.pi / 2, 4, 'X'); GMi = GM.inverted()
PI = math.pi
def gl(p): return Vector((p[0], -p[2], p[1]))
def lm(pos=(0, 0, 0), ry=0.0, rx=0.0, rz=0.0, s=1.0):
    S = Matrix.Diagonal((s[0], s[1], s[2], 1.0)) if isinstance(s, (tuple, list)) else Matrix.Scale(s, 4)
    Mg = Matrix.Translation(Vector(pos)) @ Matrix.Rotation(rx, 4, 'X') @ Matrix.Rotation(ry, 4, 'Y') @ Matrix.Rotation(rz, 4, 'Z') @ S
    return GM @ Mg @ GMi
class Frame:
    def __init__(self): self.m = Matrix.Identity(4); self.st = []
    def push(self, pos=(0, 0, 0), ry=0.0, s=1.0, rx=0.0, rz=0.0):
        self.st.append(self.m.copy()); self.m = self.m @ lm(pos, ry, rx, rz, s)
    def pop(self): self.m = self.st.pop()
    def W(self, p): return self.m @ gl(p)
    def N(self, d):  # a game-local direction -> Blender world (unit)
        return (self.m.to_3x3() @ gl(d)).normalized()
F = Frame()
class at:
    def __init__(self, pos=(0, 0, 0), ry=0.0, s=1.0, rx=0.0, rz=0.0): self.a = (pos, ry, s, rx, rz)
    def __enter__(self): F.push(*self.a); return F
    def __exit__(self, *e): F.pop()

A = None; OB = 'body'; GLOW = 'window_glow'
def add(t, col, tag='misc', glow=False):
    A.add(GLOW if glow else OB, GLOW if glow else 'body', t, col, tag)
    return t

# ---------------------------------------------------------------- primitives (game-local sizes / positions)
def box(w, h, d, pos=(0, 0, 0), r=0.03, ry=0.0, rx=0.0, rz=0.0, seg=1, extra=(0, 0, 0)):
    if min(w, h, d) < 0.055 and extra == (0, 0, 0): r = 0.0      # (tiny parts: a plain box, the rounding would not show)
    return rbox((w, d, h), r=r, seg=seg, extra=extra, M=F.m @ lm(pos, ry, rx, rz))
def beam(w, h, d, pos=(0, 0, 0), c=0.022, ry=0.0, rx=0.0, rz=0.0):
    """planed timber: a box whose four long edges are chamfered (28 tris, smooth-shaded so the chamfers read round)"""
    if min(w, h, d) < 0.055: return box(w, h, d, pos, r=0.0, ry=ry, rx=rx, rz=rz)   # (thin: a plain box)
    S = (w, h, d); ax = S.index(max(S)); a, b = [S[i] for i in range(3) if i != ax]
    c = min(c, a * 0.3, b * 0.3); ha, hb, hl = a / 2, b / 2, S[ax] / 2
    ring = [(ha, hb - c), (ha - c, hb), (-ha + c, hb), (-ha, hb - c), (-ha, -hb + c), (-ha + c, -hb), (ha - c, -hb), (ha, -hb + c)]
    def P(u, v, s_):
        q = [0, 0, 0]; o = [i for i in range(3) if i != ax]; q[o[0]] = u; q[o[1]] = v; q[ax] = s_
        return (q[0], q[1], q[2])
    M = F.m @ lm(pos, ry, rx, rz)
    t = Tmp()
    R3 = M.to_3x3()
    def nrm(u, v, s_):
        L_ = math.hypot(u / ha, v / hb) or 1.0
        return (R3 @ gl(P(u / ha / L_, v / hb / L_, s_ * 0.3))).normalized()
    e0 = [t.vert(M @ gl(P(u, v, -hl)), nrm(u, v, -1)) for u, v in ring]; e1 = [t.vert(M @ gl(P(u, v, hl)), nrm(u, v, 1)) for u, v in ring]
    cen = M @ gl((0, 0, 0))
    for k in range(8):
        k1 = (k + 1) % 8
        t.face([e0[k], e0[k1], e1[k1], e1[k]], (t.v[e0[k]] + t.v[e1[k1]]) / 2 - cen)
    ax_d = (M.to_3x3() @ gl(P(0, 0, 1))).normalized()
    for k in range(1, 7):
        t.face([e0[0], e0[k], e0[k + 1]], -ax_d); t.face([e1[0], e1[k + 1], e1[k]], ax_d)
    return t
def cyl(rt, rb, h, pos=(0, 0, 0), K=6, ry=0.0, rx=0.0, rz=0.0, bev=0.0):
    e = min(bev, rt * 0.4, rb * 0.4, h * 0.3) if max(rt, rb) >= 0.05 else 0.0
    prof = [(0.0, -h / 2), (rb - e, -h / 2), (rb, -h / 2 + e), (rt, h / 2 - e), (rt - e, h / 2), (0.0, h / 2)] if e > 0.004 else            [(0.0, -h / 2), (rb, -h / 2), (rt, h / 2), (0.0, h / 2)]
    return lathe(prof, K, th0=PI / K).xform(F.m @ lm(pos, ry, rx, rz))
def sph(r, pos=(0, 0, 0), sc=(1, 1, 1), K=None, J=None, ry=0.0, rx=0.0, rz=0.0):
    big = r * max(sc) >= 0.06
    K = K or (7 if big else 6); J = J or (4 if big else 3)
    t = ellipsoid(Vector((0, 0, 0)), (r * sc[0], r * sc[2], r * sc[1]), K=K, J=J)
    return t.xform(F.m @ lm(pos, ry, rx, rz))
def glathe(prof, K=10, pos=(0, 0, 0), ry=0.0, rx=0.0, rz=0.0, rfn=None):
    return lathe(prof, K, th0=PI / K, rfn=rfn).xform(F.m @ lm(pos, ry, rx, rz))
def gtube(pts, rad, K=6, up=None, caps=True):
    P = [F.W(p) for p in pts]
    return tube(P, rad if callable(rad) else (lambda s, r=rad: r), K=K, caps=caps, up=up or Z)
def gloop(pts, rad, K=5, up=None):
    P = [F.W(p) for p in pts]
    return tube_loop(P, rad if callable(rad) else (lambda s, r=rad: r), K=K, up=up or Z)
def circle(r, n, z=0.0, cx=0.0, cy=0.0, a0=0.0):
    return [(cx + r * math.cos(a0 + TAU * k / n), cy + r * math.sin(a0 + TAU * k / n), z) for k in range(n)]
def prism(poly, depth, z0=0.0):
    """a closed slab: a star-shaped 2-D polygon [(x, y)] in the game-local x-y plane, extruded along +z from z0;
    fans from the polygon's centroid"""
    t = Tmp(); n = len(poly)
    cx = sum(p[0] for p in poly) / n; cy = sum(p[1] for p in poly) / n
    fr = [t.vert(F.W((x, y, z0 + depth))) for x, y in poly]; bk = [t.vert(F.W((x, y, z0))) for x, y in poly]
    cf = t.vert(F.W((cx, cy, z0 + depth))); cb = t.vert(F.W((cx, cy, z0)))
    nf = F.N((0, 0, 1))
    for k in range(n):
        k1 = (k + 1) % n
        t.face([cf, fr[k], fr[k1]], nf); t.face([cb, bk[k1], bk[k]], -nf)
        mid = F.W(((poly[k][0] + poly[k1][0]) / 2, (poly[k][1] + poly[k1][1]) / 2, z0)) - F.W((cx, cy, z0))
        t.face([fr[k], bk[k], bk[k1], fr[k1]], mid)
    return t
def lac(base, hi=None, lo=None):
    """glossy lacquer: a light painted sheen on up-facing and camera-facing sides, darker undersides"""
    hi = hi or mix(base, '#fff0e0', 0.3); lo = lo or mul(base, 0.72)
    def f(p, n):
        c = mix(base, hi, clamp(n.z * 0.7 + (-n.y + n.x) * 0.22) ** 1.5)
        if n.z < 0: c = mix(c, lo, -n.z * 0.7)
        return c
    return f
def wood(base, hi=None, ao_z=None, ao_k=0.2, nz=0.05, seed=0):
    return paint(base, hi=hi or mix(base, '#ffe8c8', 0.22), top=0.25, bot=0.25, ao_z=ao_z, ao_k=ao_k, ao_h=0.12,
                 nz_amp=nz, nz_f=5, seed=seed)
def flat(c): return lambda p, n: c
def soft(c, top=0.15, bot=0.25): return paint(c, top=top, bot=bot)

# ================================================================== symbols (face frame: x right, y up, z out)
def paw(size, pos=(0, 0, 0), depth=0.03, col='#a8382c', tag='sym'):
    x, y, z = pos; s = size
    add(sph(1.0, (x, y - 0.12 * s, z), sc=(0.3 * s, 0.24 * s, depth), K=6, J=3), soft(col, 0.25), tag)
    for k in range(4):
        a = PI / 2 + (k - 1.5) * 0.52
        add(sph(1.0, (x + math.cos(a) * 0.33 * s, y - 0.06 * s + math.sin(a) * 0.3 * s, z), sc=(0.1 * s, 0.12 * s, depth * 0.9), K=4, J=3,
                rz=(k - 1.5) * -0.35), soft(col, 0.25), tag)
def bone(L, pos=(0, 0, 0), rz=0.0, r=0.05, col='#fff1dc', tag='sym'):
    with at(pos, rz=rz):
        add(beam(L * 0.72, r * 1.6, r * 1.4, (0, 0, 0), c=r * 0.45), soft(col, 0.2), tag)
        for sx in (-1, 1):
            for sy in (-1, 1):
                add(sph(r * 1.35, (sx * L * 0.4, sy * r * 1.05, 0), K=4, J=3), soft(col, 0.2), tag)
def puffy(poly, depth, bev=0.016, z0=0.0, back=True):
    """a closed relief slab: a star-shaped 2-D outline [(x, y)] (face frame) extruded along +z from z0, its front edge
    rounded by an inset ring (reads as a soft bevel). Fans from the centroid."""
    n = len(poly); cx = sum(p[0] for p in poly) / n; cy = sum(p[1] for p in poly) / n
    def ins(p, d):
        v = Vector((cx - p[0], cy - p[1], 0)); L = v.length
        return (p[0] + v.x / L * min(d, L * 0.5), p[1] + v.y / L * min(d, L * 0.5)) if L > 1e-9 else p
    zf = z0 + depth
    rings = [[F.W((x, y, z0)) for x, y in poly], [F.W((x, y, zf - bev)) for x, y in poly],
             [F.W((q[0], q[1], zf)) for q in (ins(p, bev) for p in poly)]]
    cs = [F.W((cx, cy, z0)), F.W((cx, cy, zf - bev)), F.W((cx, cy, zf))]
    t = Tmp(); ring_surface(t, rings, cs, pole0=cs[0], pole1=cs[2])
    return t

def arc_pts(cx, cy, r, a0, a1, n):
    return [(cx + r * math.cos(a0 + (a1 - a0) * i / n), cy + r * math.sin(a0 + (a1 - a0) * i / n)) for i in range(n + 1)]

def heart_poly(sc=1.0, oy=0.0, n=7):
    """the kit heart (symbols.js), sampled from its four bezier arcs"""
    def bez(p0, p1, p2, p3, k):
        out = []
        for i in range(1, k + 1):
            t = i / k; a = (1 - t) ** 3; b = 3 * (1 - t) ** 2 * t; c = 3 * (1 - t) * t * t; d = t ** 3
            out.append((a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]))
        return out
    P = [(0, -0.36)]
    P += bez((0, -0.36), (-0.12, -0.24), (-0.46, -0.04), (-0.46, 0.13), n)
    P += bez((-0.46, 0.13), (-0.46, 0.36), (-0.2, 0.44), (0, 0.22), n)
    P += bez((0, 0.22), (0.2, 0.44), (0.46, 0.36), (0.46, 0.13), n)
    P += bez((0.46, 0.13), (0.46, -0.04), (0.12, -0.24), (0, -0.36), n)[:-1]
    return [(x * sc, y * sc + oy) for x, y in P][::-1]

def heart(size, pos=(0, 0, 0), depth=0.03, col='#ff6f8f', tag='sym', n=7):
    with at(pos):
        add(puffy(heart_poly(size, n=n), depth, bev=min(0.02, depth * 0.5)), lambda p, n: mix(mul(col, 0.86), mix(col, '#fff0f4', 0.25), clamp(-n.y * 0.6 + n.z * 0.4 + 0.3)), tag)


# ================================================================== furniture: assets, painters and soft-goods generators
class Asset3(Asset2):
    """Asset2 whose per-vertex colours (t.c) may be re-shaded by t.shade(c, p, n) once the normals exist; a Tmp marked
    `fixed` (per-face vertices, normals given, faces already wound) skips the orient / normal passes"""
    def add(self, obj, mat, t, col, tag=None):
        if not getattr(t, 'fixed', False):
            t.orient(); t.normals()
        sh = getattr(t, 'shade', None)
        if col is None and sh is not None:
            base = list(t.c); t.c = [sh(c, p, n) for c, p, n in zip(base, t.v, t.n)]
        t.orient = lambda: t; t.normals = lambda: None
        return Asset2.add(self, obj, mat, t, col, tag)

def addm(t, col, tag='misc', mat='body'):
    A.add(mat, mat, t, col, tag)
    return t
def cl(t, col, tag='cloth'): return addm(t, col, tag, 'cloth')

def shade_soft(top=0.10, bot=0.30, side=0.0):
    """soft painted shading for a precoloured shell: lighter up-facing, darker underneath"""
    def f(c, p, n):
        up = n.z
        k = 1 + top * up if up >= 0 else 1 + bot * up
        return mul(c, k)
    return f

GOLD = '#f4c04a'
def gold(p, n):
    """polished toy gold: a warm sheen on top and camera-facing sides, amber undersides"""
    hi, lo = '#fff1b8', '#b8781e'
    c = mix(GOLD, hi, clamp(n.z * 0.75 + (-n.y + n.x) * 0.25) ** 1.6)
    if n.z < 0: c = mix(c, lo, -n.z * 0.75)
    return c

def wood2(base, ao_z=0.0, ao_k=0.22, nz=0.06, seed=0, grain=0.0, gf=18.0):
    """painted wood: lighter tops, darker undersides, a contact AO band, low-frequency tone noise and optional streaky
    grain (stretched noise)"""
    hi = mix(base, '#ffe6c2', 0.24)
    def f(p, n):
        up = n.z
        c = mix(base, hi, up * 1.0) if up >= 0 else mul(base, 1 + 0.3 * up)
        if ao_z is not None: c = mul(c, 1 - ao_k * (1 - smooth(0.0, 0.12, p.z - ao_z)))
        if nz: c = mul(c, 1 + nz * (vnoise(p, 5, seed) - 0.5) * 2)
        if grain: c = mul(c, 1 + grain * (vnoise(Vector((p.x * 0.6, p.y * gf, p.z * gf)), 1.0, seed + 3) - 0.5) * 2)
        return c
    return f

# ---------------------------------------------------------------- a stuffed pillow (game-local, flat in x-z, puffed in y)
def pillow(w, h, d, nx=12, nz=8, bot=0.55, pw=0.42, pinch=0.07, pos=(0, 0, 0), ry=0.0, rx=0.0, rz=0.0, ear=0.0):
    """a pillow: top and bottom heightfields over a pinched rounded rectangle, sharing a seam rim at y = 0. Top up to
    h * 0.5 / (1 + bot) above, bottom bot times that below; cosine-spaced rows crowd the seam. Returns (Tmp, topY(u, v))"""
    M = F.m @ lm(pos, ry, rx, rz)
    ht = h / (1 + bot)
    us = [math.sin(math.pi / 2 * (2 * i / nx - 1)) for i in range(nx + 1)]
    vs = [math.sin(math.pi / 2 * (2 * j / nz - 1)) for j in range(nz + 1)]
    def P(u, v, s):
        x = u * w / 2 * (1 - pinch * (1 - v * v)); z = v * d / 2 * (1 - pinch * (1 - u * u))
        f = max(0.0, (1 - u * u) * (1 - v * v)) ** pw
        y = ht * f * (1.0 if s > 0 else -bot)
        if ear: y += ear * (u * u * v * v) ** 3 * (1 if s > 0 else -1)
        return M @ gl((x, y, z))
    t = Tmp(); top = {}; bt = {}
    for i, u in enumerate(us):
        for j, v in enumerate(vs):
            top[i, j] = t.vert(P(u, v, 1))
            rim = i in (0, nx) or j in (0, nz)
            bt[i, j] = top[i, j] if rim else t.vert(P(u, v, -1))
    upn = (M.to_3x3() @ gl((0, 1, 0))).normalized()
    for i in range(nx):
        for j in range(nz):
            t.face([top[i, j], top[i + 1, j], top[i + 1, j + 1], top[i, j + 1]], upn)
            t.face([bt[i, j], bt[i, j + 1], bt[i + 1, j + 1], bt[i + 1, j]], -upn)
    return t, (lambda u, v: ht * max(0.0, (1 - u * u) * (1 - v * v)) ** pw)

# ---------------------------------------------------------------- the patchwork quilt (a draped open sheet + its binding)
def bend(e, R):
    """a sheet edge rolling over a rounded edge of radius R: excess length e -> (outward, down, angle)"""
    if e <= 0: return 0.0, 0.0, 0.0
    arc = R * PI / 2
    if e < arc: a = e / R; return R * math.sin(a), -R * (1 - math.cos(a)), a
    return R, -R - (e - arc), PI / 2

def quilt(hw, z0, z1, y0, R, dropS, dropF, patch, pal, seam='#e0909f', puff=0.03, tuft=0.008, border='#ff9eb8', bw=0.035):
    """the quilt over a mattress: flat top (|x| <= hw, z0 <= z <= z1) at y0, rolling over the sides and the foot with
    radius R then hanging dropS / dropF; a mitred box corner (the deeper of the two drops). Patches of size `patch`
    (unrolled), each quilted: a puffed centre, a crisp seam row of its own (stitched dip) and a tuft at the corners.
    Returns (Tmp with t.c, boundary loop of Blender points for the binding)"""
    arc = R * PI / 2; Us = hw + arc + dropS; Tf = z1 + arc + dropF
    def samples(a, b, step, phase):
        """sample coords on [a, b]: per patch the seam (0), 0.1, 0.5, 0.9"""
        out = {a, b}
        k0 = math.floor((a - phase) / step) - 1; k1 = math.ceil((b - phase) / step) + 1
        for k in range(k0, k1 + 1):
            for f in (0.0, 0.1, 0.5, 0.9):
                s = phase + (k + f) * step
                if a < s < b: out.add(round(s, 6))
        return sorted(out)
    S = sorted(set(samples(-Us, Us, patch, 0.0)) | {-(hw - bw), -(hw - bw + 0.012), hw - bw, hw - bw + 0.012})
    T = sorted(set(samples(z0, Tf, patch, z0)) | {z1 - bw, z1 - bw + 0.012})
    def frac(s, phase): q = (s - phase) / patch; return q - math.floor(q), math.floor(q)
    def P(s, t_):
        es = abs(s) - hw; sg = 1.0 if s >= 0 else -1.0
        ox, dyx, ax = bend(es, R); oz, dyz, az = bend(t_ - z1, R)
        x = sg * (min(abs(s), hw) + ox); z = min(t_, z1) + oz
        y = y0 + min(dyx, dyz)
        n = Vector((sg * math.sin(ax) * (1 if dyx <= dyz else 0.3), math.cos(ax) * math.cos(az), math.sin(az) * (1 if dyz <= dyx else 0.3))).normalized()
        fs, ks = frac(s, 0.0); ft, kt = frac(t_, z0)
        b = (math.sin(PI * fs) * math.sin(PI * ft)) ** 0.5
        on_seam = min(fs, 1 - fs) < 0.02 or min(ft, 1 - ft) < 0.02
        corner = min(fs, 1 - fs) < 0.02 and min(ft, 1 - ft) < 0.02
        off = puff * b - (tuft if corner else 0.0)
        edge = abs(s) >= Us - 1e-6 or t_ >= Tf - 1e-6
        if edge: off = 0.0
        q = Vector((x, y, z)) + n * off
        idx = (int(ks) * 2 + int(kt) * 5) % len(pal)
        c = mix(pal[idx], seam, 0.45) if on_seam else mix(pal[idx], '#fff8f0', 0.1 * b)
        if abs(s) > hw - bw + 0.006 or t_ > z1 - bw + 0.006:          # the border fabric (no patch puff)
            c = mix(border, '#ffd0de', 0.25 * clamp(1 - max(abs(s) - hw, t_ - z1, 0.0) / 0.05)); q = Vector((x, y, z)) + n * 0.004
        return q, c
    t = Tmp(); t.c = []; ids = {}
    for i, s in enumerate(S):
        for j, tt in enumerate(T):
            q, c = P(s, tt); ids[i, j] = t.vert(F.W(q)); t.c.append(c)
    for i in range(len(S) - 1):
        for j in range(len(T) - 1):
            t.face([ids[i, j], ids[i + 1, j], ids[i + 1, j + 1], ids[i, j + 1]], F.N((0, 1, 0)))
    nI, nJ = len(S) - 1, len(T) - 1
    loop = [(i, 0) for i in range(nI + 1)] + [(nI, j) for j in range(1, nJ + 1)] + [(i, nJ) for i in range(nI - 1, -1, -1)] + [(0, j) for j in range(nJ - 1, 0, -1)]
    return t, [t.v[ids[k]] for k in loop]

def rope_loop(path, r, K=6, twists=20, amp=0.16, light='#f2d698', dark='#c8955e'):
    """a closed two-strand rope along a closed path of Blender points: the section bulges in a helix (2 ridges round,
    `twists` turns along the loop), painted light on the ridges, dark in the grooves"""
    n = len(path); rings, cs, cols = [], [], []
    for i, p in enumerate(path):
        T = (path[(i + 1) % n] - path[i - 1]).normalized()
        U = (Z - T * Z.dot(T)).normalized(); W = T.cross(U); ph = twists * TAU * i / n
        ring = []
        for k in range(K):
            th = TAU * k / K; w = math.cos(2 * th + ph)
            rr = r * (1 + amp * w)
            ring.append(p + W * (rr * math.cos(th)) + U * (rr * math.sin(th)))
            cols.append(mix(dark, light, 0.5 + 0.5 * w))
        rings.append(ring); cs.append(p)
    t = Tmp(); ring_surface(t, rings, cs, closed=True); t.c = cols
    return t

def slab(poly, depth, bev=0.016, z0=0.0):
    """a closed board: a star-shaped outline [(x, y)] (face frame) from z0 to z0 + depth, both faces' edges rounded
    by an inset ring"""
    n = len(poly); cx = sum(p[0] for p in poly) / n; cy = sum(p[1] for p in poly) / n
    def ins(p, d):
        v = Vector((cx - p[0], cy - p[1], 0)); L = v.length
        return (p[0] + v.x / L * min(d, L * 0.5), p[1] + v.y / L * min(d, L * 0.5)) if L > 1e-9 else p
    zf = z0 + depth
    rings = [[F.W((q[0], q[1], z0)) for q in (ins(p, bev) for p in poly)], [F.W((x, y, z0 + bev)) for x, y in poly],
             [F.W((x, y, zf - bev)) for x, y in poly], [F.W((q[0], q[1], zf)) for q in (ins(p, bev) for p in poly)]]
    cs = [F.W((cx, cy, z0)), F.W((cx, cy, z0 + bev)), F.W((cx, cy, zf - bev)), F.W((cx, cy, zf))]
    t = Tmp(); ring_surface(t, rings, cs, pole0=cs[0], pole1=cs[3])
    return t

def rrect(w, h, r, n=3, oy=0.0):
    """a rounded rectangle outline (face frame), CCW"""
    out = []
    for cx, cy, a0 in ((w / 2 - r, h / 2 - r, 0.0), (-w / 2 + r, h / 2 - r, PI / 2), (-w / 2 + r, -h / 2 + r, PI), (w / 2 - r, -h / 2 + r, 1.5 * PI)):
        for i in range(n + 1):
            a = a0 + PI / 2 * i / n; out.append((cx + r * math.cos(a), cy + r * math.sin(a) + oy))
    return out

def bow(s=1.0, pos=(0, 0, 0), col='#e8463e', tag='bow'):
    """a little ribbon bow (face frame: z out): two puffed loops, a knot and two tails"""
    with at(pos):
        for sx in (-1, 1):
            addm(sph(1.0, (sx * 0.036 * s, 0.006 * s, 0), sc=(0.04 * s, 0.026 * s, 0.017 * s), K=8, J=4, rz=sx * 0.32), lac(col), tag)
            addm(beam(0.02 * s, 0.05 * s, 0.012 * s, (sx * 0.016 * s, -0.03 * s, -0.004 * s), c=0.003, rz=sx * 0.42), lac(mul(col, 0.88)), tag)
        addm(sph(0.017 * s, (0, 0.002 * s, 0.01 * s), sc=(1, 1.1, 0.9), K=6, J=4), lac(mix(col, '#ff8a7a', 0.25)), tag)

# ================================================================== Cozy Futon Bed (BASICS.futonBed: 4 x 3 cells, h 0.62)
HONEY, WOOD_R = '#d9a066', '#a86e42'
def build_futonBed():
    W, D = 1.96, 1.46; hz = D / 2
    wd = wood2(HONEY, grain=0.05); wdD = wood2(WOOD_R, grain=0.05, seed=4)
    pT = 0.26                                               # the platform top
    # turned bun feet under the corners
    for sx in (-1, 1):
        for sz in (-1, 1):
            addm(glathe([(0.0, 0.0), (0.052, 0.0), (0.07, 0.03), (0.066, 0.06), (0.05, 0.08), (0.0, 0.08)], 8, pos=(sx * (W / 2 - 0.16), 0, sz * (hz - 0.16))),
                 wood2(WOOD_R, ao_z=0.0, ao_k=0.3), 'feet')
    # the platform: a core box wrapped in two stacked planks per side (V grooves where they meet) and at the foot
    addm(box(W - 0.14, 0.18, D - 0.16, (0, 0.17, 0), r=0.03), wood2(mul(HONEY, 0.8)), 'platform')
    for sx in (-1, 1):
        for k, (yc, cc) in enumerate(((0.125, WOOD_R), (0.215, HONEY))):
            addm(beam(0.07, 0.092, D - 0.26, (sx * (W / 2 - 0.075), yc, 0.0), c=0.022), wood2(cc, ao_z=0.06, grain=0.06, seed=k + 2 * sx), 'platform')
    for k, (yc, cc) in enumerate(((0.125, WOOD_R), (0.215, HONEY))):
        addm(beam(W - 0.26, 0.092, 0.07, (0, yc, hz - 0.1), c=0.022), wood2(cc, ao_z=0.06, grain=0.06, seed=k + 7), 'platform')
    # headboard: an arched board between chunky posts, a lighter inset panel and a pink heart on the crest
    hbz = -hz + 0.075; hw = W / 2 - 0.13
    def arch(hw_, y0_, y1_, yc_, n=8):
        pts = [(-hw_, y0_), (hw_, y0_)]
        for i in range(n + 1):
            u = i / n; x = hw_ * (1 - u)
            pts.append((x, y1_ + (yc_ - y1_) * (1 - (x / hw_) ** 2) ** 0.8))
        for i in range(1, n + 1):
            u = i / n; x = -hw_ * u
            pts.append((x, y1_ + (yc_ - y1_) * (1 - (x / hw_) ** 2) ** 0.8))
        return pts
    with at((0, 0.2, hbz - 0.03)):
        addm(slab(arch(hw, 0.0, 0.27, 0.42), 0.06, bev=0.018), wood2(HONEY, ao_z=0.38, ao_k=0.18, grain=0.05, seed=11), 'headboard')
        addm(puffy(arch(hw - 0.08, 0.2, 0.31, 0.36, 8), 0.016, bev=0.008, z0=0.06), wood2(mix(HONEY, '#ffe2b8', 0.32), ao_z=None, grain=0.03, seed=12), 'headboard')
        heart(0.17, (0, 0.335, 0.072), depth=0.04, col='#ff8fb0', tag='headboard')
    for sx in (-1, 1):
        addm(beam(0.13, 0.54, 0.13, (sx * (W / 2 - 0.065), 0.31, hbz), c=0.03), wood2(WOOD_R, ao_z=0.0, grain=0.07, seed=13), 'posts')
        addm(cyl(0.075, 0.075, 0.035, (sx * (W / 2 - 0.065), 0.585, hbz), K=10, bev=0.01), wdD, 'posts')
        addm(sph(0.062, (sx * (W / 2 - 0.065), 0.635, hbz), K=8, J=5), wood2(HONEY, ao_z=None), 'posts')
        addm(beam(0.12, 0.36, 0.12, (sx * (W / 2 - 0.06), 0.22, hz - 0.06), c=0.028), wood2(WOOD_R, ao_z=0.0, grain=0.07, seed=14), 'posts')
        addm(cyl(0.07, 0.07, 0.032, (sx * (W / 2 - 0.06), 0.415, hz - 0.06), K=10, bev=0.01), wdD, 'posts')
        addm(sph(0.055, (sx * (W / 2 - 0.06), 0.46, hz - 0.06), K=8, J=5), wood2(HONEY, ao_z=None), 'posts')
    # footboard: a rounded board between the foot posts, a little paw on its face
    addm(beam(W - 0.2, 0.15, 0.065, (0, 0.3, hz - 0.06), c=0.026), wood2(HONEY, ao_z=0.2, grain=0.05, seed=15), 'footboard')
    heart(0.11, (0, 0.3, hz - 0.03), depth=0.02, col='#ff8fb0', tag='footboard')
    # the futon mattress: a cream pad with a quilted top (it shows at the head, under the pillows)
    yM0, yM1 = pT - 0.005, 0.405; zM0, zM1 = -0.585, 0.585; hwM = 0.905
    def mwarp(p):
        k = (1 - (p.x / hwM) ** 2) * (1 - (((-p.y) - (zM0 + zM1) / 2) / ((zM1 - zM0) / 2)) ** 2)
        return Vector((p.x, p.y, p.z + (0.012 * max(0.0, k) if p.z > (yM0 + yM1) / 2 else 0.0)))
    with at((0, (yM0 + yM1) / 2, (zM0 + zM1) / 2)):
        m = rbox((hwM * 2, zM1 - zM0, yM1 - yM0), r=0.055, seg=2, extra=(1, 1, 0), M=F.m)
    m.v = [mwarp(p) for p in m.v]; m.n = [None] * len(m.v)
    cl(m, lambda p, n: mul(mix('#fff3e6', '#f4dccb', clamp(-n.z * 0.6 + 0.15)), 1 + 0.06 * n.z), 'mattress')
    # the patchwork quilt: puffed patches with stitched seams, rolling over the sides and foot, a pink binding
    pal = ['#ffb0cc', '#9fe2c2', '#ffd877', '#9ccdfc', '#fff0dc', '#ffbd94']
    y0 = yM1 + 0.012; R = 0.065
    qt, edge = quilt(hwM - R + 0.012, -0.2, zM1 - R + 0.012, y0, R, 0.05, 0.05, 0.27, pal)
    qt.shade = shade_soft(0.06, 0.32)
    A.add('cloth', 'cloth', qt, None, 'quilt')
    edge = resample(edge + [edge[0]], 73)[:-1]                # (even stations: the binding needs no seam rows)
    cl(tube_loop(edge, lambda s: 0.02, K=4), lambda p, n: mul(mix('#f2789c', '#ffaac4', clamp(n.z * 0.7 + 0.3)), 1 + 0.08 * min(0, n.z)), 'binding')
    # the turned-down band at the pillow end (the cream reverse with a pink stripe) and the crease roll behind it
    fb, fy = pillow(1.74, 0.05, 0.16, nx=14, nz=4, bot=0.25, pw=0.3, pinch=0.0, pos=(0, y0 + 0.012, -0.2 + 0.075))
    zs = -0.2 + 0.105                                       # (the pink stripe across the band, game z)
    cl(fb, lambda p, n: mul('#ffc4d4', 1 + 0.06 * n.z) if abs(-p.y - zs) < 0.022 else mul('#fff8f0', 1 + 0.2 * min(0.0, n.z)), 'fold')
    cl(gtube([(-0.885, y0 + 0.012, -0.205), (0.885, y0 + 0.012, -0.205)], 0.04, K=7), lambda p, n: mix('#ffd8e2', '#fff8f0', clamp(n.z * 0.8 + 0.3)), 'fold')
    # two pillows leaning on the headboard: Chewy's pink one with a heart, Shadow's blue one with a bone
    for sx, c, sym in ((-1, '#ffd6e2', 'heart'), (1, '#dcecff', 'bone')):
        with at((sx * 0.42, y0 + 0.07, -0.43), rx=0.5, ry=sx * -0.05):
            pt, py = pillow(0.62, 0.17, 0.34, nx=10, nz=7, bot=0.5, pw=0.4, pinch=0.08, ear=0.006)
            cl(pt, lambda p, n, c=c: mul(mix(c, '#fffaf6', clamp(n.z) * 0.35), 1 + 0.18 * min(0.0, n.z)), 'pillows')
            ty = py(0, 0)
            with at((0, ty - 0.004, 0.0), rx=-PI / 2):
                if sym == 'heart': heart(0.13, (0, 0, 0), depth=0.022, col='#ff7aa0', tag='pillows')
                else: bone(0.17, (0, 0, 0.012), r=0.022, col='#fffaf2', tag='pillows')
    return dict(h=0.62, foot=(W, D))

# ================================================================== Pup Basket (BASICS.pupBasket: 2 x 2 cells, h 0.42)
def build_pupBasket():
    H, Hf = 0.34, 0.2
    def rimY(a): return H - (H - Hf) * max(0.0, math.cos(a)) ** 2
    cells, rows = 20, 5; K = cells * 3
    FR = (0.0, 0.2, 0.8); FV = (0.0, 0.26, 0.74)            # (a block's edges crowd its borders: crisp crevices)
    def ang(k): return TAU * (k // 3 + FR[k % 3]) / cells
    yb = 0.075
    def rOut(y): return 0.405 + 0.018 * smooth(yb, H, y)
    light, mid, deep, crev = '#f4d79c', '#c8975a', '#b98a52', '#86592f'
    rings, cols = [], []
    def ring(fn):
        R_, C_ = [], []
        for k in range(K):
            a = ang(k)
            (x, y, z), c = fn(k, a)
            R_.append(F.W((x, y, z))); C_.append(c)
        rings.append(R_); cols.extend(C_)
    # the foot: a rolled base coil
    for r, y, c in ((0.34, 0.0, crev), (0.396, 0.03, deep), (0.405, yb, crev)):
        ring(lambda k, a, r=r, y=y, c=c: ((r * math.sin(a), y, r * math.cos(a)), c))
    # the woven wall: rows of weavers, each passing over and under the stakes (raised light / sunk darker cells),
    # crevices between the rows
    for j in range(1, rows * 3 + 1):
        def fn(k, a, j=j):
            cj, sj = j // 3, j % 3
            v = (cj + FV[sj]) / rows; y = yb + v * (rimY(a) - yb); r = rOut(y)
            if sj and k % 3:                                    # a block: a raised weaver (over) or a sunk stake (under)
                over = (k // 3 + cj) % 2 == 0
                r += 0.024 if over else 0.007
                c = mix(light, '#fff0c8', 0.25 * (sj == 2)) if over else mix(mid, deep, 0.35 * (sj == 1))
            else:                                               # the crevices between blocks and rows
                r += 0.002; c = crev
            return (r * math.sin(a), y, r * math.cos(a)), c
        ring(fn)
    # the lip and the inside wall (darker, faint rows), down to the floor under the cushion
    for r, dy, c in ((0.392, 0.004, deep), (0.384, -0.02, mul(deep, 0.85))):
        ring(lambda k, a, r=r, dy=dy, c=c: ((r * math.sin(a), rimY(a) + dy, r * math.cos(a)), c))
    for v, r in ((0.6, 0.378), (0.25, 0.364), (0.0, 0.34)):
        ring(lambda k, a, v=v, r=r: ((r * math.sin(a), yb + 0.01 + v * (rimY(a) - 0.03 - yb - 0.01), r * math.cos(a)),
                                     mix(mul(mid, 0.78), mul(crev, 0.9), 1 - v) if int(v * 10) % 2 == 0 else mul(mid, 0.7)))
    t = Tmp()
    cs = [F.W((0, 0, 0))] * len(rings)
    def hint(fc, c): return Vector((fc.x, fc.y, 0.0))      # (rough; Tmp.orient makes the shell consistent and outward)
    ring_surface(t, rings, cs, pole0=F.W((0, 0.0, 0)), pole1=F.W((0, yb + 0.01, 0)), hints=hint)
    t.c = cols + [crev, mul(mid, 0.6)]
    t.shade = shade_soft(0.08, 0.3)
    A.add('body', 'body', t, None, 'basket')
    # the braided rim: a fat two-strand rope following the lip, dipping at the front
    path = [F.W((0.41 * math.sin(TAU * k / 60), rimY(TAU * k / 60) + 0.01, 0.41 * math.cos(TAU * k / 60))) for k in range(60)]
    rp = rope_loop(path, 0.04, K=6, twists=21, light='#f4d9a0', dark='#c08a54'); rp.shade = shade_soft(0.1, 0.3)
    A.add('body', 'body', rp, None, 'rim')
    # the cushion: a round tufted pad, six soft lobes and a button dimple, with white polka dots
    prof = [(0.0, 0.0), (0.26, 0.0), (0.33, 0.012), (0.36, 0.05), (0.35, 0.09), (0.3, 0.12), (0.18, 0.135), (0.07, 0.125), (0.0, 0.112)]
    def lobe(r, z, th): return r * (1 + 0.035 * math.cos(6 * th + 0.3) * clamp(r / 0.3))
    cu = glathe(prof, 20, pos=(0, yb + 0.005, 0), rfn=lobe)
    cl(cu, lambda p, n: mul(mix('#ffc4d6', '#ffe0ea', clamp(n.z) * 0.45), 1 + 0.22 * min(0.0, n.z)), 'cushion')
    def topY(r):
        for (r0, z0), (r1, z1) in zip(prof[4:], prof[5:]):
            if r1 <= r <= r0: return z0 + (z1 - z0) * (r0 - r) / (r0 - r1)
        return prof[-1][1]
    for k in range(9):
        e = 0.11 if k < 3 else 0.235; a = k / 3 * TAU + 0.5 if k < 3 else (k - 3) / 6 * TAU + 0.1
        x, z = math.cos(a) * e, math.sin(a) * e
        cl(sph(0.026, (x, yb + 0.005 + topY(e) - 0.002, z), sc=(1, 0.28, 1), K=7, J=3), soft('#fffaf4', 0.1, 0.2), 'cushion')
    addm(sph(0.022, (0, yb + 0.005 + 0.11, 0), sc=(1, 0.5, 1), K=7, J=3), soft('#ff9ab8', 0.25), 'cushion')
    # the bone-shaped pillow resting against the back wall
    with at((0.02, yb + 0.16, -0.2), ry=0.12, rx=-0.5):
        cl(gtube([(-0.15, 0, 0), (0.15, 0, 0)], lambda s: 0.056 * (1 - 0.1 * math.sin(PI * s)), K=10, caps=False), lambda p, n: mul(mix('#fff4e2', '#fffbf4', clamp(n.z) * 0.5), 1 + 0.2 * min(0.0, n.z)), 'bone')
        for sx in (-1, 1):
            for sz in (-1, 1):
                cl(sph(0.064, (sx * 0.175, sz * 0.042, 0), sc=(1, 0.95, 0.92), K=11, J=6), lambda p, n: mul(mix('#fff4e2', '#fffbf4', clamp(n.z) * 0.5), 1 + 0.2 * min(0.0, n.z)), 'bone')
        paw(0.07, (0, 0.0, 0.054), depth=0.012, col='#9ac8f0', tag='bone')
    # a gold bone name tag on the front, a little red bow above it
    a0 = 0.0; rt = rOut(0.13) + 0.02
    with at((0, 0.125, rt), rx=-0.12):
        bone(0.15, (0, 0, 0.012), r=0.024, col=GOLD, tag='tag')
    bow(1.25, (0, Hf - 0.03, rOut(0.17) + 0.03), tag='tag')
    return dict(h=0.42, foot=(1.0, 1.0))

# ================================================================== Treasure Chest (BASICS.treasureChest: 2 x 1 cells, h 0.62)
def build_treasureChest():
    W, D = 0.9, 0.4; yF = 0.055; yB0 = yF + 0.035; yT = 0.37; R = D / 2 + 0.014; T_ = 0.034
    planks = ['#b8743e', '#a8673a', '#c27c44']
    # gold ball feet and a dark plinth
    for sx in (-1, 1):
        for sz in (-1, 1):
            addm(sph(0.05, (sx * 0.375, 0.046, sz * 0.13), sc=(1, 0.9, 1), K=9, J=5), gold, 'feet')
    addm(box(W + 0.02, 0.05, D + 0.02, (0, yF + 0.02, 0), r=0.018), wood2('#94603a', ao_z=yF - 0.01, ao_k=0.2), 'body')
    addm(box(W - 0.05, yT - yB0, D - 0.05, (0, (yB0 + yT) / 2, 0), r=0.02), wood2('#6e4228'), 'body')
    # planked walls: three planks a face, chamfered so they part in V grooves, each its own tone
    hp = (yT - yB0) / 3
    for k in range(3):
        yc = yB0 + hp * (k + 0.5)
        for sz in (-1, 1):
            addm(beam(W - 0.04, hp - 0.004, T_, (0, yc, sz * (D / 2 - T_ / 2)), c=0.014), wood2(planks[(k + (sz > 0)) % 3], ao_z=yB0, grain=0.08, seed=k * 2 + (sz > 0)), 'planks')
        for sx in (-1, 1):
            addm(beam(T_, hp - 0.004, D - 0.04, (sx * (W / 2 - T_ / 2), yc, 0), c=0.014), wood2(planks[(k + 1 + (sx > 0)) % 3], ao_z=yB0, grain=0.08, seed=k * 2 + 7 + (sx > 0)), 'planks')
    # the domed lid: five barrel staves (V gaps between), dark end panels
    N = 5; g = 0.014
    for k in range(N):
        a0 = k * PI / N + g; a1 = (k + 1) * PI / N - g
        arcs = [a0 + (a1 - a0) * i / 3 for i in range(4)]
        prof = [(R * math.cos(a), R * math.sin(a)) for a in arcs] + [((R - 0.045) * math.cos(a), (R - 0.045) * math.sin(a)) for a in reversed(arcs)]
        st = sweep([F.W((-W / 2 - 0.006, yT, 0)), F.W((W / 2 + 0.006, yT, 0))], prof, up=Z, inset=0.25, cap_d=0.008)
        addm(st, wood2(planks[k % 3], ao_z=None, grain=0.09, seed=20 + k), 'lid')
    semi = [((R - 0.04) * math.cos(PI * i / 12), (R - 0.04) * math.sin(PI * i / 12)) for i in range(13)]
    for sx in (-1, 1):
        with at((sx * (W / 2 - 0.035), yT, 0), ry=sx * PI / 2):
            addm(prism(semi, 0.03), wood2('#7a4a2c', ao_z=None), 'lid')
    # gold: the seam band, two straps over the lid and down the body, corner brackets, trim on the lid ends
    for sz in (-1, 1):
        addm(box(W + 0.024, 0.034, 0.018, (0, yT - 0.012, sz * (D / 2 + 0.006)), r=0.008), gold, 'gold')
    for sx in (-1, 1):
        addm(box(0.018, 0.034, D + 0.024, (sx * (W / 2 + 0.006), yT - 0.012, 0), r=0.008), gold, 'gold')
    semiP = lambda r, x: [F.W((x, yT + r * math.sin(PI * i / 16), r * math.cos(PI * i / 16))) for i in range(17)]
    rect = lambda a, b: [(a, b), (-a, b), (-a, -b), (a, -b)]
    for xs in (-0.27, 0.27):
        addm(sweep(semiP(R + 0.007, xs), rect(0.011, 0.033), up=X, inset=0.2, cap_d=0.004), gold, 'gold')
        for sz in (-1, 1):
            addm(box(0.066, yT - yB0 - 0.01, 0.016, (xs, (yB0 + yT) / 2 - 0.005, sz * (D / 2 + 0.007)), r=0.006), gold, 'gold')
            for y in (yB0 + 0.06, yT - 0.08):
                addm(sph(0.013, (xs, y, sz * (D / 2 + 0.016)), sc=(1, 1, 0.6), K=5, J=3), gold, 'rivets')
        for a in (0.55, 1.57, 2.6):
            addm(sph(0.013, (xs, yT + (R + 0.018) * math.sin(a), (R + 0.018) * math.cos(a)), K=5, J=3), gold, 'rivets')
    for sx in (-1, 1):
        addm(sweep(semiP(R - 0.006, sx * (W / 2 + 0.008)), rect(0.016, 0.014), up=X, inset=0.2, cap_d=0.004), gold, 'gold')
        for sz in (-1, 1):
            # corner brackets: an L of two plates hugging each vertical edge, a rivet on each
            addm(box(0.07, yT - yB0 - 0.02, 0.014, (sx * (W / 2 - 0.03), (yB0 + yT) / 2 - 0.01, sz * (D / 2 + 0.006)), r=0.006), gold, 'gold')
            addm(box(0.014, yT - yB0 - 0.02, 0.07, (sx * (W / 2 + 0.006), (yB0 + yT) / 2 - 0.01, sz * (D / 2 - 0.03)), r=0.006), gold, 'gold')
            addm(sph(0.012, (sx * (W / 2 - 0.03), yB0 + 0.05, sz * (D / 2 + 0.014)), sc=(1, 1, 0.6), K=5, J=3), gold, 'rivets')
    # the paw lock: a rounded gold plate across the seam, a hasp tab from the lid, a raised paw
    lock = [(0.085 * math.sin(a) * (1 - 0.18 * max(0.0, -math.cos(a))), 0.1 * math.cos(a) * (1 if math.cos(a) > 0 else 1.15)) for a in (TAU * i / 20 for i in range(20))]
    with at((0, yT - 0.035, R + 0.002)):
        addm(slab([(x, y) for x, y in reversed(lock)], 0.026, bev=0.01), gold, 'lock')
        paw(0.12, (0, -0.012, 0.026), depth=0.02, col='#8a4a2c', tag='lock')
        for y in (0.072, -0.098):
            addm(sph(0.011, (0, y, 0.024), sc=(1, 1, 0.6), K=5, J=3), gold, 'rivets')
    # ring handles on the ends
    for sx in (-1, 1):
        with at((sx * (W / 2 + 0.014), yT - 0.1, 0), ry=sx * PI / 2):
            addm(slab(rrect(0.085, 0.07, 0.025, n=2), 0.014, bev=0.006), gold, 'handles')
            addm(gloop(circle(0.05, 12, 0.026, 0, -0.045), 0.012, K=5), gold, 'handles')
            addm(sph(0.018, (0, 0.004, 0.022), sc=(1, 1, 0.7), K=6, J=3), gold, 'handles')
    return dict(h=0.62, foot=(1.0, 0.5))

# ================================================================== round 2: more generators
class Rng:
    """a tiny deterministic LCG (no global random state)"""
    def __init__(self, seed): self.s = (seed * 2654435761 + 12345) & 0x7fffffff
    def r(self):
        self.s = (self.s * 1103515245 + 12345) & 0x7fffffff; return self.s / 0x7fffffff
    def u(self, a, b): return a + (b - a) * self.r()
    def pick(self, L): return L[int(self.r() * len(L)) % len(L)]

def rb(w, h, d, pos=(0, 0, 0), r=0.02, ry=0.0, rx=0.0, rz=0.0, seg=1):
    """a rounded box (game-local), the rounding allowed down to thin slabs (the kit box() goes square below 5.5 cm)"""
    return rbox((w, d, h), r=min(r, 0.45 * min(w, h, d)), seg=seg, M=F.m @ lm(pos, ry, rx, rz))

def fbox(w, h, d, pos=(0, 0, 0), ry=0.0, rx=0.0, rz=0.0):
    """a crisp box (game-local), per-face vertices with face normals: 12 triangles (books, little tiles)"""
    M = F.m @ lm(pos, ry, rx, rz); R3 = M.to_3x3(); H = (w / 2, h / 2, d / 2)
    t = Tmp()
    for ax in range(3):
        for sg in (-1, 1):
            nv = [0, 0, 0]; nv[ax] = sg; nw = (R3 @ gl(nv)).normalized()
            o = [i for i in range(3) if i != ax]; q = []
            for a, b in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                pp = [0, 0, 0]; pp[ax] = sg * H[ax]; pp[o[0]] = a * H[o[0]]; pp[o[1]] = b * H[o[1]]
                q.append(t.vert(M @ gl(pp), nw))
            t.face(q, nw)
    t.fixed = True
    return t

def unshare(t, fcol):
    """per-face vertices (crisp per-face colours) keeping the shell's smooth normals; fcol(centre, normal) -> colour,
    both in Blender space"""
    t.orient(); t.normals()
    u = Tmp(); u.c = []
    for f in t.f:
        cen = sum((t.v[i] for i in f), Vector()) / len(f)
        nn = sum((t.n[i] for i in f), Vector()).normalized()
        c = fcol(cen, nn)
        u.f.append([u.vert(t.v[i], t.n[i]) for i in f]); u.c += [c] * len(f)
    u.fixed = True
    return u

def unshare_i(t, fcol):
    """unshare by face index: fcol(face index) -> colour (ring_surface order: band by band, then the pole fans)"""
    t.orient(); t.normals()
    u = Tmp(); u.c = []
    for fi, f in enumerate(t.f):
        c = fcol(fi); u.f.append([u.vert(t.v[i], t.n[i]) for i in f]); u.c += [c] * len(f)
    u.fixed = True
    return u

def sheet(w, h, nx, ny, fcol, wave=0.006, bulge=0.0, pos=(0, 0, 0), ry=0.0, rx=0.0, rz=0.0, drape=None):
    """a hanging cloth (face frame: x across, hanging down -y from y = 0, z out), per-cell colours fcol(u, v) (cell
    centres, 0..1), a gentle wave growing toward the hem; drape(x, y) -> extra z"""
    M = F.m @ lm(pos, ry, rx, rz)
    t = Tmp(); ids = {}
    for i in range(nx + 1):
        for j in range(ny + 1):
            uu, vv = i / nx, j / ny
            x = (uu - 0.5) * w; y = -vv * h
            z = wave * math.sin(uu * TAU * 1.3 + vv * 2.1) * vv + bulge * math.sin(PI * uu)
            if drape: z += drape(x, y)
            ids[i, j] = t.vert(M @ gl((x, y, z)))
    hint = (M.to_3x3() @ gl((0, 0, 1))).normalized()
    for i in range(nx):
        for j in range(ny):
            t.face([ids[i, j], ids[i + 1, j], ids[i + 1, j + 1], ids[i, j + 1]], hint)
    cells = {}
    for i in range(nx):
        for j in range(ny):
            cells[tuple(sorted((ids[i, j], ids[i + 1, j], ids[i + 1, j + 1], ids[i, j + 1])))] = fcol((i + 0.5) / nx, (j + 0.5) / ny)
    t.normals()
    u = Tmp(); u.c = []
    for f in t.f:
        c = cells[tuple(sorted(f))]
        u.f.append([u.vert(t.v[i], t.n[i]) for i in f]); u.c += [c] * 4
    u.fixed = True
    return u

def leafc(L, W, pos=(0, 0, 0), ry=0.0, rx=0.0, rz=0.0, depth=0.008):
    """a little leaf: a pointed oval slab (face frame, stem at the origin, tip up +y)"""
    poly = [(0.0, 0.0), (W * 0.48, L * 0.3), (W * 0.36, L * 0.72), (0.0, L), (-W * 0.36, L * 0.72), (-W * 0.48, L * 0.3)]
    with at(pos, ry=ry, rx=rx, rz=rz):
        return prism(poly[::-1], depth, -depth / 2)

def arch_poly(w, h, n=8):
    """an arched opening outline (face frame): straight sides, a semicircular top; base at y = 0"""
    r = w / 2; yc = h - r
    pts = [(-r, 0.0), (r, 0.0)]
    for i in range(n + 1):
        a = PI * i / n; pts.append((r * math.cos(a), yc + r * math.sin(a)))
    return pts

def wlathe(prof, K, pos=(0, 0, 0), sx=1.0, sy=1.0, ry=0.0, rx=0.0, rz=0.0, rfn=None):
    """a lathe about the game-local y axis with an oval section (sx across x, sy across z)"""
    return lathe(prof, K, sx=sx, sy=sy, th0=PI / K, rfn=rfn).xform(F.m @ lm(pos, ry, rx, rz))

def lac2(base, k=0.3):
    return lac(base, mix(base, '#fff6ea', k), mul(base, 0.72))

def paint2(base, top=0.1, bot=0.28, ao_z=0.0, ao_k=0.2, nz=0.04, seed=0):
    return paint(base, top=top, bot=bot, ao_z=ao_z, ao_k=ao_k, ao_h=0.12, nz_amp=nz, nz_f=4, seed=seed)

IRON, INK = '#4a4450', '#3a2a30'
def iron(p, n):
    c = mix('#3e3a46', '#6e687a', clamp(n.z * 0.6 + (-n.y + n.x) * 0.25) ** 1.4)
    return mul(c, 1 + 0.25 * min(0.0, n.z))

def book(t, h, d, c, pos, lean=0.0, ry=0.0, band=None, tag='books'):
    """a standing book: a crisp box, the spine coloured, the page block cream, the boards darker; an optional band"""
    def col(p, n):
        if abs(n.z) > 0.5: return '#fff4e0' if n.z > 0 else mul('#fff4e0', 0.8)
        if n.y < -0.5: return mix(c, '#fff6ea', 0.08)
        return mul(c, 0.82)
    with at(pos, ry=ry, rz=lean):
        addm(fbox(t, h, d, (0, h / 2, 0)), col, tag)
        if band:
            for yb in (h * 0.76, h * 0.2):
                addm(fbox(t + 0.004, 0.012, 0.006, (0, yb, d / 2)), lambda p, n: band if n.y < -0.5 else mul(band, 0.85), tag)

def book_flat(w, h, d, c, pos, ry=0.0, tag='books'):
    def col(p, n):
        if n.y < -0.5 or n.y > 0.5 or abs(n.x) > 0.5:
            return '#fff4e0' if (abs(n.x) > 0.5 and n.x > 0) or n.y > 0.5 else mul(c, 0.88)
        return mix(c, '#fff6ea', 0.1) if n.z > 0 else mul(c, 0.8)
    with at(pos, ry=ry):
        addm(fbox(w, h, d, (0, h / 2, 0)), lambda p, n: mix(c, '#fff6ea', 0.1) if n.z > 0.5 else ('#fff4e0' if abs(n.x) > 0.5 or n.y > 0.5 else mul(c, 0.8)), tag)

def jam_jar(s=1.0, jam='#f4a830', ging='#e8504a', pos=(0, 0, 0), tag='jar'):
    with at(pos, s=s):
        addm(glathe([(0.0, 0.0), (0.044, 0.0), (0.05, 0.012), (0.05, 0.085), (0.04, 0.1), (0.0, 0.104)], 10),
             lambda p, n: mix(jam, '#fff0c0', 0.25 * clamp(n.z) + 0.2 * clamp(-n.y)) if p.z < F.W((0, 0.082, 0)).z else mix('#e6f2f2', '#ffffff', clamp(n.z) * 0.4), tag)
        cap = glathe([(0.066, 0.078), (0.06, 0.098), (0.044, 0.116), (0.0, 0.126)], 10)
        cx = F.W((0, 0, 0))
        addm(unshare(cap, lambda c, n: ging if (int((math.atan2(c.y - cx.y, c.x - cx.x) + PI) / (TAU / 10)) + int((c.z - cx.z) / s * 50)) % 2 else '#fffaf2'), None, tag, 'cloth')
        addm(glathe([(0.0, 0.094), (0.05, 0.094), (0.053, 0.1), (0.05, 0.106), (0.0, 0.106)], 10), lambda p, n: '#f0e0c0', tag)     # (the string tie)

def flame(r, h, pos, c0, c1):
    t = lathe([(0.0, 0.0), (r, 0.0), (r * 0.95, h * 0.28), (r * 0.5, h * 0.7), (0.0, h)], 6, sx=1.0, sy=0.6, th0=0.3).xform(F.m @ lm(pos))
    z0 = F.W(pos).z
    addm(t, lambda p, n: mix(c0, c1, clamp((p.z - z0) / h)), 'fire', 'hot')

# ================================================================== Kitchen Stove (BASICS.kitchenStove: 2 x 2 cells, h 1.15)
def build_kitchenStove():
    plaster, brick, brickL, grout = '#fff0dc', '#d0704e', '#e48a62', '#a8543a'
    addm(rb(0.94, 0.1, 0.9, (0, 0.05, 0), r=0.035), wood2(brick, ao_z=0.0, ao_k=0.25, nz=0.07), 'plinth')
    addm(rb(0.88, 0.56, 0.82, (0, 0.36, -0.01), r=0.09, seg=2), paint2(plaster, ao_z=0.1, ao_k=0.15, nz=0.03), 'body')   # y 0.08..0.64, front z 0.40
    # the tiled top: a grout slab and nine chunky terracotta tiles, each its own tone
    addm(rb(0.94, 0.05, 0.88, (0, 0.645, -0.01), r=0.02), wood2(grout, ao_z=None), 'top')
    rg = Rng(3)
    for ix in (-1, 0, 1):
        for iz in (-1, 0, 1):
            c = mix('#d06a4c', '#e8845c', rg.r())
            addm(rb(0.292, 0.03, 0.272, (ix * 0.305, 0.68, -0.01 + iz * 0.285), r=0.012), lac2(c, 0.22), 'top')
    yT = 0.695
    # a band of little blue-and-white tiles across the front and down the right side, bricks peeking through the plaster
    for i in range(7):
        addm(fbox(0.074, 0.046, 0.012, (-0.27 + i * 0.09, 0.53, 0.405)), soft('#8fc0e8' if i % 2 else '#fffaf2', 0.1, 0.2), 'tiles')
    for i in range(6):
        addm(fbox(0.012, 0.046, 0.074, (0.445, 0.53, -0.3 + i * 0.09)), soft('#fffaf2' if i % 2 else '#8fc0e8', 0.1, 0.2), 'tiles')
    for x, y in ((-0.33, 0.22), (-0.27, 0.272), (0.33, 0.2)):
        addm(rb(0.1, 0.045, 0.02, (x, y, 0.402), r=0.008), wood2(brick, ao_z=None), 'bricks')
    for y, z in ((0.26, 0.12), (0.4, -0.22), (0.452, -0.12)):
        addm(rb(0.02, 0.045, 0.1, (0.442, y, z), r=0.008), wood2(brick, ao_z=None), 'bricks')
    # the fire mouth: a dark arch, the glowing back, crossed logs, flames and embers, a brick arch with a keystone
    with at((0, 0.1, 0.4)):
        addm(prism(arch_poly(0.34, 0.3), 0.014), lambda p, n: '#2a1e22', 'fire')
        zg = F.W((0, 0, 0)).z
        addm(prism(arch_poly(0.27, 0.235), 0.004, 0.014), lambda p, n: mix('#ffc860', '#ff5a22', clamp((p.z - zg) / 0.2)), 'fire', 'hot')
    for s in (-1, 1):
        addm(gtube([(s * 0.11, 0.13, 0.42), (-s * 0.07, 0.15, 0.445)], 0.024, K=6), lambda p, n: mix('#6a4030', '#8a5a40', clamp(n.z)), 'fire')
    for x, hh, r, c0, c1 in ((-0.05, 0.13, 0.042, '#ff7a2a', '#ffd070'), (0.048, 0.11, 0.038, '#ff8a3a', '#ffe08a'), (0.0, 0.17, 0.05, '#ff6a2a', '#ffcc60'), (0.0, 0.1, 0.028, '#ffd860', '#fff4c0')):
        flame(r, hh, (x, 0.16, 0.436 + (0.012 if r < 0.03 else 0.0)), c0, c1)
    for i in range(5):
        addm(sph(0.015, (-0.08 + i * 0.04, 0.14, 0.43 + (i % 2) * 0.012), K=5, J=3), lambda p, n, i=i: '#ff8a3a' if i % 2 else '#ffb050', 'fire', 'hot')
    ring = [(0.185 * math.cos(PI * i / 12), 0.23 + 0.185 * math.sin(PI * i / 12), 0.418) for i in range(13)]
    addm(gtube(ring, 0.034, K=6), lambda p, n: mix(brick, brickL, 0.5 + 0.5 * math.sin(math.atan2(p.z - 0.33, p.x) * 18)), 'arch')
    for s in (-1, 1):
        addm(rb(0.068, 0.14, 0.07, (s * 0.185, 0.17, 0.418), r=0.015), wood2(brick, ao_z=0.1), 'arch')
    addm(rb(0.06, 0.07, 0.05, (0, 0.418, 0.44), r=0.012), wood2(brickL, ao_z=None), 'arch')
    addm(rb(0.42, 0.024, 0.07, (0, 0.105, 0.44), r=0.008), iron, 'arch')
    # the stew pot (red enamel), bubbling, a wooden ladle in it, iron handles
    with at((-0.2, yT, -0.08)):
        c0 = F.W((0, 0, 0))
        addm(glathe([(0.0, 0.0), (0.13, 0.0), (0.155, 0.02), (0.16, 0.13), (0.172, 0.142), (0.168, 0.158), (0.148, 0.152), (0.148, 0.05), (0.0, 0.05)], 16),
             lambda p, n: (mul('#a83a2e', 0.9) if math.hypot(p.x - c0.x, p.y - c0.y) < 0.152 and p.z > c0.z + 0.03 else lac2('#e8503a', 0.28)(p, n)), 'pot')
        addm(cyl(0.149, 0.149, 0.012, (0, 0.118, 0), K=16), lambda p, n: '#ec9a40', 'pot')
        for x, z, r, c in ((0.05, 0.03, 0.024, '#ffd09a'), (-0.06, -0.04, 0.02, '#ffd09a'), (-0.02, 0.07, 0.016, '#ffd09a'), (0.07, -0.06, 0.018, '#ffe0b0'), (0.02, -0.07, 0.016, '#8fcf6a'), (-0.07, 0.01, 0.018, '#ff9a4a')):
            addm(sph(r, (x, 0.125, z), sc=(1, 0.6, 1), K=6, J=3), soft(c, 0.2), 'pot')
        addm(gtube([(0.03, 0.11, 0.02), (0.2, 0.3, 0.1)], 0.012, K=5), wood2('#d8a868', ao_z=None), 'pot')
        for sx in (-1, 1):
            arcp = [(sx * (0.168 + 0.03 * math.sin(PI * i / 6)), 0.12 + 0.03 * math.cos(PI * i / 6), 0.0) for i in range(7)]
            addm(gtube(arcp, 0.009, K=4, caps=False), iron, 'pot')
    # the mint kettle, its spout toward the camera side
    with at((0.2, yT, 0.14)):
        addm(glathe([(0.0, 0.0), (0.1, 0.0), (0.12, 0.03), (0.125, 0.065), (0.11, 0.105), (0.07, 0.13), (0.04, 0.135), (0.0, 0.135)], 14), lac2('#8fd8c0', 0.35), 'kettle')
        addm(glathe([(0.044, 0.13), (0.042, 0.145), (0.026, 0.152), (0.0, 0.154)], 10), lac2('#7cc8b0'), 'kettle')
        addm(sph(0.02, (0, 0.166, 0), K=6, J=4), soft('#fff6ea', 0.2), 'kettle')
        addm(gtube([(0.09, 0.05, 0.0), (0.15, 0.08, 0.01), (0.185, 0.135, 0.02)], lambda s: 0.024 - 0.01 * s, K=6), lac2('#8fd8c0'), 'kettle')
        hp = [(0.0, 0.11 + 0.085 * math.sin(PI * i / 8), 0.085 * math.cos(PI * i / 8)) for i in range(9)]
        addm(gtube(hp, 0.012, K=5), lac2('#40291f', 0.2), 'kettle')
        addm(gtube([(0, 0.195, -0.03), (0, 0.195, 0.03)], 0.018, K=6), wood2('#c98f5e', ao_z=None), 'kettle')
    # the flue pipe with copper rings and a little hat
    addm(cyl(0.065, 0.065, 0.38, (0.3, yT + 0.19, -0.32), K=12), lambda p, n: mix('#8a7e88', '#b4aab4', clamp((-n.y + n.x) * 0.6 + 0.3)), 'flue')
    for y in (0.8, 0.98):
        addm(cyl(0.073, 0.073, 0.026, (0.3, y, -0.32), K=12, bev=0.006), lac2('#d08a52'), 'flue')
    addm(glathe([(0.0, 0.0), (0.11, 0.0), (0.112, 0.018), (0.065, 0.065), (0.0, 0.075)], 12, pos=(0.3, 1.065, -0.32)), lac2('#d08a52'), 'flue')
    # the utensil rail: a brass bar on brackets, a ladle, a spatula and a gingham towel
    addm(gtube([(-0.4, 0.59, 0.452), (0.4, 0.59, 0.452)], 0.011, K=6), gold, 'rail')
    for s in (-1, 1):
        addm(rb(0.03, 0.03, 0.05, (s * 0.4, 0.59, 0.43), r=0.008), gold, 'rail')
    addm(rb(0.018, 0.17, 0.012, (-0.34, 0.5, 0.46), r=0.005), wood2('#c98f5e', ao_z=None), 'rail')
    addm(sph(0.036, (-0.34, 0.405, 0.468), sc=(1, 0.7, 0.55), K=7, J=4), lambda p, n: mix('#b4b0bc', '#e4e0ec', clamp(n.z + 0.3)), 'rail')
    addm(rb(0.016, 0.12, 0.01, (-0.27, 0.53, 0.46), r=0.004), wood2('#c98f5e', ao_z=None), 'rail')
    addm(rb(0.052, 0.062, 0.01, (-0.27, 0.44, 0.46), r=0.004), lambda p, n: mix('#b4b0bc', '#e4e0ec', clamp(n.z + 0.3)), 'rail')
    addm(sheet(0.13, 0.21, 4, 6, lambda u, v: '#e8504a' if (int(u * 4) + int(v * 6)) % 2 else '#fffaf2', wave=0.008, pos=(0.305, 0.6, 0.462)), None, 'towel', 'cloth')
    addm(gtube([(0.24, 0.59, 0.458), (0.37, 0.59, 0.458)], 0.016, K=6), lambda p, n: '#f4e4d8', 'towel', 'cloth')
    return dict(h=1.15)

# ================================================================== Kitchen Counter (BASICS.kitchenCounter: 2 x 1 cells, surface 0.86)
def build_kitchenCounter():
    top, body, door, doorL = 0.86, '#fff1de', '#a8dcc8', '#c4ecdc'
    addm(rb(0.86, 0.07, 0.34, (0, 0.035, -0.04), r=0.015), wood2('#8a5e44', ao_z=0.0), 'base')
    addm(rb(0.92, 0.72, 0.4, (0, 0.42, -0.02), r=0.04), paint2(body, ao_z=0.06, ao_k=0.15), 'body')   # y 0.06..0.78, front z 0.18
    # the worktop: a thick honey board, flat at `surface`, its front edge bull-nosed; a darker seam band under it
    addm(rb(0.96, 0.08, 0.46, (0, top - 0.04, 0), r=0.028), wood2('#d9a066', ao_z=None, grain=0.06, seed=31), 'top')
    addm(rb(0.93, 0.02, 0.42, (0, top - 0.088, -0.01), r=0.006), wood2('#b07a4a', ao_z=None), 'top')
    for sx in (-1, 1):
        cx = sx * 0.222
        # cupboard doors: a mint frame-and-panel with a little carved heart, round wooden knobs
        with at((cx, 0.34, 0.18)):
            addm(slab(rrect(0.42, 0.44, 0.03, n=2), 0.024, bev=0.008), paint2(door, ao_z=None), 'doors')
            addm(puffy(rrect(0.31, 0.33, 0.03, n=2), 0.012, bev=0.006, z0=0.024), paint2(doorL, ao_z=None), 'doors')
            heart(0.1, (0, 0.06, 0.036), depth=0.012, col='#6b4a3a', tag='doors')
        addm(sph(0.03, (sx * 0.04, 0.38, 0.22), sc=(1, 1, 0.8), K=8, J=5), wood2('#c98f5e', ao_z=None), 'knobs')
        with at((cx, 0.665, 0.18)):
            addm(slab(rrect(0.42, 0.13, 0.03, n=2), 0.024, bev=0.008), paint2(door, ao_z=None), 'doors')
        addm(sph(0.026, (cx, 0.665, 0.212), sc=(1, 1, 0.8), K=8, J=5), wood2('#c98f5e', ao_z=None), 'knobs')
    # the chopping board with a carrot at the right end (the rest of the top stays clear)
    addm(rb(0.28, 0.026, 0.2, (0.27, top + 0.013, 0.0), r=0.01), wood2('#f0d0a0', ao_z=None, grain=0.05), 'board')
    addm(cyl(0.022, 0.022, 0.026, (0.42, top + 0.013, 0.0), K=8), wood2('#f0d0a0', ao_z=None), 'board')
    with at((0.26, top + 0.026 + 0.024, 0.02), ry=0.3):
        addm(glathe([(0.0, -0.075), (0.012, -0.05), (0.022, 0.03), (0.024, 0.06), (0.0, 0.075)], 7, rz=PI / 2), lambda p, n: mix('#ff8a3a', '#ffb070', clamp(n.z)), 'carrot')
        for a in (-0.45, 0.0, 0.45):
            addm(leafc(0.075, 0.03, (-0.07, 0.0, 0.0), rz=PI / 2 + a, rx=-0.25), soft('#5aae4a', 0.2), 'carrot', 'leaf')
    # a blue gingham dish towel on a brass rail on the right side
    addm(gtube([(0.47, 0.67, -0.12), (0.47, 0.67, 0.12)], 0.009, K=5), gold, 'rail')
    for z in (-0.12, 0.12):
        addm(rb(0.03, 0.026, 0.026, (0.466, 0.67, z), r=0.006), gold, 'rail')
    addm(sheet(0.2, 0.3, 6, 8, lambda u, v: '#6a9ad8' if (int(u * 6) + int(v * 8)) % 2 else '#fffaf2', wave=0.007, pos=(0.478, 0.68, 0.0), ry=PI / 2), None, 'towel', 'cloth')
    addm(gtube([(0.476, 0.672, -0.1), (0.476, 0.672, 0.1)], 0.014, K=6), lambda p, n: '#eef2fa', 'towel', 'cloth')
    return dict(h=0.86)

# ================================================================== Bookshelf (BASICS.bookshelf: 2 x 1 cells, h 1.6)
BOOKC = ['#e8706a', '#6a9ad8', '#8fcf8a', '#f4c04a', '#c890d8', '#ff9eb0', '#5a7ac8', '#e89a5a', '#a8d8e8', '#7cc0a0']
def book_row(rg, x0, x1, y, hmax, D, zf):
    x = x0
    while True:
        t = rg.u(0.032, 0.058); h = hmax * rg.u(0.74, 0.97); dd = rg.u(0.22, 0.27)
        if x + t > x1: break
        band = rg.pick(['#f4c04a', '#fff6e8']) if rg.r() < 0.36 else None
        book(t, h, dd, rg.pick(BOOKC), (x + t / 2, y, zf - dd / 2 - rg.u(0.0, 0.014)), band=band)
        x += t + 0.003
    return x

def build_bookshelf():
    W, D, H = 0.96, 0.44, 1.55
    wood, woodD, back = '#c98f5e', '#a86e42', '#bfe6d4'
    zb = -D / 2 + 0.025
    addm(rb(W, 0.08, D, (0, 0.04, 0), r=0.03), wood2(woodD, ao_z=0.0, ao_k=0.25), 'frame')
    for sx in (-1, 1):
        addm(rb(0.065, H - 0.06, D, (sx * (W / 2 - 0.0325), 0.06 + (H - 0.06) / 2, 0), r=0.025), wood2(wood, grain=0.06, seed=40 + sx), 'frame')
    addm(rb(W + 0.03, 0.06, D + 0.02, (0, H - 0.01, 0.005), r=0.025), wood2(woodD, ao_z=None), 'frame')
    addm(rb(W - 0.1, H - 0.1, 0.025, (0, 0.07 + (H - 0.1) / 2, zb - 0.0125), r=0.008), paint2(back, ao_z=0.08, ao_k=0.1), 'frame')
    shelves = (0.08, 0.44, 0.8, 1.15)
    for y in shelves:
        addm(rb(W - 0.12, 0.035, D - 0.03, (0, y + 0.0175, 0.0), r=0.012), wood2(wood, ao_z=None, grain=0.05, seed=int(y * 100)), 'frame')
    # the crown: an arch board with a pink heart on it
    with at((0, H + 0.015, 0.12)):
        pts = [(-0.38, 0.0), (0.38, 0.0)] + [(0.38 * math.cos(PI * i / 10), 0.095 * math.sin(PI * i / 10) ** 0.8) for i in range(11)]
        addm(slab(pts, 0.03, bev=0.01), wood2(woodD, ao_z=None), 'crown')
        heart(0.075, (0, 0.044, 0.03), depth=0.014, col='#ff8fb0', tag='crown', n=4)
    rg = Rng(7); X0 = -W / 2 + 0.072; zf = D / 2 - 0.03
    # bottom: big books and a lying stack
    book_row(rg, X0, 0.12, 0.115, 0.3, D, zf)
    for i, (w, h, dd, c, ry) in enumerate(((0.24, 0.05, 0.2, '#6a9ad8', 0.05), (0.22, 0.045, 0.19, '#e8706a', -0.07), (0.2, 0.04, 0.17, '#8fcf8a', 0.12))):
        book_flat(w, h, dd, c, (0.28 + i * 0.006, 0.115 + [0, 0.05, 0.095][i], 0.02), ry=ry)
    # second: books and the globe
    book_row(rg, X0, 0.03, 0.475, 0.3, D, zf)
    with at((0.24, 0.475, 0.0)):
        addm(glathe([(0.0, 0.0), (0.06, 0.0), (0.062, 0.014), (0.03, 0.026), (0.014, 0.05), (0.014, 0.065), (0.0, 0.065)], 8), wood2('#6b4a3a', ao_z=None), 'globe')
        gc = F.W((0, 0.165, 0))
        def globe(p, n):
            d = (p - gc).normalized()
            k = vnoise(d * 2.2 + Vector((3.1, 1.7, 0.4)), 1.0, 5) + 0.35 * vnoise(d * 5.0, 1.0, 9)
            c = ('#fffaf2' if abs(d.z) > 0.82 else '#8fcf6a') if k > 0.78 else ('#f4d890' if k > 0.7 else '#5ab0e0')
            return mul(c, 0.86 + 0.18 * clamp(n.z * 0.5 + 0.5))
        addm(unshare(sph(0.1, (0, 0.165, 0), K=11, J=7, rz=0.4), lambda c, n: globe(c, n)), None, 'globe')
        with at((0, 0.165, 0), rz=0.4):                           # the meridian: a gold half ring round the tilted axis
            addm(gtube([(0.114 * math.sin(a), 0.114 * math.cos(a), 0.0) for a in (PI * 1.1 * i / 9 - 0.05 for i in range(10))], 0.007, K=4), gold, 'globe')
        addm(sph(0.013, (0, 0.165 + 0.116, 0), K=6, J=3), gold, 'globe')
    # third: the sleepy plant and books
    book_row(rg, -0.05, W / 2 - 0.075, 0.835, 0.28, D, zf)
    with at((-0.25, 0.835, 0.03)):
        addm(glathe([(0.0, 0.0), (0.055, 0.0), (0.065, 0.02), (0.07, 0.09), (0.076, 0.1), (0.066, 0.104), (0.0, 0.098)], 10),
             lambda p, n: '#ffb0c8' if F.W((0, 0.062, 0)).z < p.z < F.W((0, 0.08, 0)).z else mix('#fff3e6', '#ffffff', clamp(n.z) * 0.3), 'plant')
        for sx in (-1, 1):        # closed sleepy eyes and blush
            eye = [(sx * 0.022 + 0.011 * math.cos(PI + PI * i / 4), 0.048 - 0.007 * math.sin(PI * i / 4), 0.068) for i in range(5)]
            addm(gtube(eye, 0.0035, K=3), lambda p, n: INK, 'plant')
            addm(sph(0.011, (sx * 0.044, 0.034, 0.064), sc=(1, 0.6, 0.3), K=5, J=3), lambda p, n: '#ff9eb8', 'plant')
        addm(cyl(0.062, 0.062, 0.006, (0, 0.096, 0), K=10), lambda p, n: '#6a4a3a', 'plant')
        rl = Rng(11); greens = ('#5aa84a', '#6ab854', '#4f9a44')
        for a, ln in ((0.25, 0.42), (-0.3, 0.36), (0.05, 0.3)):
            vine = [(0.0, 0.1, 0.0), (math.sin(a) * 0.05, 0.13, 0.06), (math.sin(a) * 0.1, 0.1, 0.14), (math.sin(a) * 0.13, 0.0, 0.17), (math.sin(a) * 0.15, 0.1 - ln, 0.175)]
            pts = resample([Vector(q) for q in vine], 6)
            addm(gtube([tuple(q) for q in pts], 0.0045, K=3), lambda p, n: '#4f8a3a', 'plant', 'leaf')
            for i in range(1, 5):
                q = pts[i]; s = 1 if i % 2 else -1
                addm(leafc(0.05, 0.04, (q.x + s * 0.012, q.y, q.z + 0.008), ry=a + s * 0.5, rz=s * 2.2 + PI, rx=-0.3), soft(greens[i % 3], 0.2), 'plant', 'leaf')
        for i in range(4):
            addm(leafc(0.06, 0.045, (0, 0.1, 0), ry=i * 1.6, rx=-1.0, rz=0.15 * (i % 2)), soft(greens[i % 3], 0.2), 'plant', 'leaf')
    # top: books, a honey jar and Shadow's red ball
    book_row(rg, X0, 0.08, 1.185, 0.27, D, zf)
    jam_jar(1.1, '#f4a830', '#e8504a', (0.2, 1.185, 0.04))
    addm(sph(0.05, (0.34, 1.235, 0.08), K=10, J=6), lambda p, n: '#fffaf2' if abs((p.z - 1.235) / 0.05 - 0.15) < 0.22 else lac2('#e8403a')(p, n), 'ball')
    return dict(h=1.6)

# ================================================================== Tansu Chest (BASICS.tansu: 2 x 1 cells, surface 0.95)
def pull(px, yc, z, tag='pulls'):
    """an iron drawer pull: a hexagon plate, a drooping bail and its two knuckles"""
    addm(cyl(0.046, 0.046, 0.01, (px, yc, z), K=6, rx=PI / 2, ry=0.0), iron, tag)
    bail = [(px + 0.034 * math.cos(PI + PI * i / 6), yc + 0.006 - 0.034 * math.sin(PI * i / 6), z + 0.016) for i in range(7)]
    addm(gtube(bail, 0.01, K=5), iron, tag)
    for s in (-1, 1):
        addm(sph(0.011, (px + s * 0.034, yc + 0.006, z + 0.012), K=5, J=3), iron, tag)

def build_tansu():
    top, wood, front = 0.95, '#c47c48', '#d8955c'
    addm(rb(0.86, 0.06, 0.38, (0, 0.03, -0.01), r=0.018), wood2('#74503a', ao_z=0.0), 'base')
    addm(rb(0.92, top - 0.11, 0.42, (0, 0.05 + (top - 0.11) / 2, -0.022), r=0.03), wood2(wood, grain=0.06, seed=50), 'body')   # front z 0.188
    addm(rb(0.96, 0.06, 0.45, (0, top - 0.03, -0.005), r=0.02), wood2('#a8643a', ao_z=None, grain=0.05, seed=51), 'top')   # flat top at `surface`
    fronts = ((-0.225, 0.69, 0.42, 0.17, 1), (0.225, 0.69, 0.42, 0.17, 1), (0.0, 0.46, 0.87, 0.2, 2), (0.0, 0.11, 0.87, 0.32, 2))
    for k, (x, y, w, h, n) in enumerate(fronts):
        addm(beam(w, h, 0.026, (x, y + h / 2, 0.2), c=0.01), wood2(mix(front, '#e4a46c', 0.3 * (k % 2)), ao_z=None, grain=0.07, seed=52 + k), 'drawers')
        yc = y + h / 2 + (0.05 if h > 0.25 else 0.01)
        for i in range(n):
            pull(x if n == 1 else x + (0.24 if i else -0.24), yc, 0.214)
    # the round lock plate on the middle drawer, iron corner brackets, a carrying bail on the right side
    addm(cyl(0.05, 0.05, 0.008, (0, 0.56, 0.214), K=12, rx=PI / 2), iron, 'lock')
    addm(rb(0.014, 0.03, 0.006, (0, 0.552, 0.219), r=0.003), gold, 'lock')
    for sx in (-1, 1):
        for y in (0.08, 0.8):
            addm(rb(0.07, 0.07, 0.008, (sx * 0.428, y, 0.19), r=0.004), iron, 'brackets')
            addm(rb(0.008, 0.07, 0.07, (sx * 0.462, y, 0.155), r=0.004), iron, 'brackets')
            for dx, dz in ((-0.02, 0.0), (0.0, 0.0)):
                addm(sph(0.008, (sx * (0.428 - sx * 0.018), y + 0.018, 0.195), K=5, J=3), iron, 'brackets')
    addm(rb(0.008, 0.05, 0.13, (0.462, 0.6, -0.01), r=0.004), iron, 'side')
    hb = [(0.474, 0.6 - 0.045 * math.sin(PI * i / 6), -0.01 + 0.045 * math.cos(PI * i / 6)) for i in range(7)]
    addm(gtube(hb, 0.01, K=5), iron, 'side')
    return dict(h=0.95)

# ================================================================== Wardrobe (BASICS.wardrobe: 2 x 1 cells, h 1.75)
def flower5(s, pos, petal='#ff9eb0', eye='#ffd24a', tag='flower'):
    with at(pos):
        for k in range(5):
            a = PI / 2 + k * TAU / 5
            addm(sph(1.0, (math.cos(a) * 0.32 * s, math.sin(a) * 0.32 * s, 0), sc=(0.22 * s, 0.22 * s, 0.05 * s), K=6, J=3), soft(petal, 0.2), tag)
        addm(sph(0.13 * s, (0, 0, 0.02 * s), sc=(1, 1, 0.5), K=6, J=3), soft(eye, 0.25), tag)

def build_wardrobe():
    W, D = 0.92, 0.34; wood, woodL, panel = '#d9a066', '#e6b07a', '#fff1de'; fz = D / 2
    for sx in (-1, 1):
        for sz in (-1, 1):
            addm(glathe([(0.0, 0.0), (0.04, 0.0), (0.052, 0.02), (0.046, 0.042), (0.032, 0.062), (0.0, 0.062)], 8, pos=(sx * 0.38, 0, sz * 0.11)), wood2('#a86e42', ao_z=0.0), 'feet')
    addm(rb(W, 1.45, D, (0, 0.06 + 0.725, 0), r=0.07, seg=2), wood2(wood, grain=0.05, seed=60), 'body')       # 0.06..1.51
    addm(rb(W + 0.03, 0.045, D + 0.03, (0, 1.5125, 0), r=0.018), wood2('#c8884e', ao_z=None), 'cornice')
    addm(gtube([(-W / 2 + 0.03, 1.512, fz + 0.022), (W / 2 - 0.03, 1.512, fz + 0.022)], 0.019, K=6), wood2('#e0a466', ao_z=None), 'cornice')
    # the arched crown with a pink heart
    with at((0, 1.535, -D / 2 + 0.05)):
        pts = [(-(W - 0.06) / 2, 0.0), ((W - 0.06) / 2, 0.0)] + [((W - 0.06) / 2 * math.cos(PI * i / 12), 0.18 * math.sin(PI * i / 12) ** 0.7) for i in range(13)]
        addm(slab(pts, D - 0.11, bev=0.016), wood2(wood, ao_z=None, grain=0.05), 'crown')
        heart(0.14, (0, 0.082, D - 0.11), depth=0.018, col='#ff9eb0', tag='crown')
    # two frame-and-panel doors and a drawer row: honey frames, raised cream panels, gold knobs
    for sx in (-1, 1):
        cx = sx * 0.212
        with at((cx, 0.915, fz)):
            addm(slab(rrect(0.41, 0.95, 0.03, n=2), 0.022, bev=0.008), wood2(woodL, ao_z=None, grain=0.04), 'doors')
            addm(puffy(rrect(0.31, 0.8, 0.035, n=2), 0.016, bev=0.008, z0=0.022), paint2(panel, ao_z=None), 'doors')
        addm(sph(0.025, (sx * 0.045, 0.88, fz + 0.034), sc=(1, 1, 0.75), K=8, J=5), gold, 'knobs')
        with at((cx, 0.265, fz)):
            addm(slab(rrect(0.41, 0.25, 0.03, n=2), 0.022, bev=0.008), wood2(woodL, ao_z=None, grain=0.04), 'drawers')
            addm(puffy(rrect(0.31, 0.15, 0.03, n=2), 0.014, bev=0.006, z0=0.022), paint2(panel, ao_z=None), 'drawers')
        addm(sph(0.022, (cx, 0.265, fz + 0.04), sc=(1, 1, 0.75), K=8, J=5), gold, 'knobs')
    # the heart mirror on the left door (a pink frame, sky glass, a glint) and a painted flower on the right one
    with at((-0.212, 1.06, fz + 0.038)):
        addm(puffy(heart_poly(0.3), 0.014, bev=0.007), lac2('#ff9eb0'), 'mirror')
        addm(puffy(heart_poly(0.235, oy=-0.004), 0.006, bev=0.003, z0=0.014), lambda p, n: mix('#cfeaff', '#f6fcff', clamp((p.z - 1.02) / 0.12)), 'mirror')
        addm(rb(0.016, 0.07, 0.004, (-0.03, 0.045, 0.021), r=0.002, rz=-0.6), lambda p, n: '#ffffff', 'mirror')
        addm(rb(0.01, 0.03, 0.004, (0.0, 0.075, 0.021), r=0.002, rz=-0.6), lambda p, n: '#ffffff', 'mirror')
    flower5(0.17, (0.212, 1.06, fz + 0.04))
    addm(gtube([(0.212, 0.99, fz + 0.042), (0.212, 0.9, fz + 0.042)], 0.006, K=3), lambda p, n: '#7cc07a', 'flower')
    addm(leafc(0.05, 0.03, (0.214, 0.93, fz + 0.042), rz=-0.9), soft('#7cc07a', 0.2), 'flower')
    # a red striped scarf peeking out of the door seam
    addm(sheet(0.05, 0.17, 1, 6, lambda u, v: '#fffaf2' if int(v * 6) % 3 == 1 else '#e8403a', wave=0.006, pos=(0.0, 0.72, fz + 0.03)), None, 'scarf', 'cloth')
    return dict(h=1.75)

# ================================================================== Bread Shelf (PHASE2.breadShelf: 2 x 1 cells, h 1.4)
def basket_oval(rx, rz, h, pos, seg=14, tag='baskets'):
    """an oval wicker basket: a woven checker wall (per-face), a rolled rim"""
    prof = [(0.0, 0.0), (0.88, 0.0), (0.97, h * 0.3), (1.02, h * 0.92), (0.95, h * 1.0), (0.92, h * 0.4), (0.0, h * 0.16)]
    t = wlathe(prof, seg, pos, sx=rx, sy=rz)
    c0 = F.W(pos)
    def col(c, n):
        a = math.atan2(c.y - c0.y, c.x - c0.x); hz = (c.z - c0.z) / h
        if hz > 0.9: return '#d8b070'
        if n.dot(Vector((c.x - c0.x, c.y - c0.y, 0))) < 0: return '#b88c58'
        return '#ecca8c' if (int((a + PI) / TAU * seg) + int(hz * 3)) % 2 else '#cfa262'
    addm(unshare(t, col), None, tag)
    rim = [(rx * 1.0 * math.cos(TAU * k / 14), h * 0.98, rz * 1.0 * math.sin(TAU * k / 14)) for k in range(14)]
    with at(pos):
        addm(gloop(rim, 0.014, K=4), lambda p, n: mix('#d8a868', '#f2d698', clamp(n.z)), tag)

def melon_pan(s, pos, ry=0.0, rx=0.0, tag='bread'):
    with at(pos, ry=ry, rx=rx, s=s):
        t = glathe([(0.0, 0.0), (0.05, 0.0), (0.056, 0.018), (0.042, 0.042), (0.0, 0.053)], 6)
        c0 = F.W((0, 0, 0))
        def col(c, n):
            hz = (c.z - c0.z) / s
            if hz < 0.014: return '#d8944a'
            a = math.atan2(c.y - c0.y, c.x - c0.x)
            return mix('#fadc8c', '#fff2bc', 0.3) if (int((a + PI) / TAU * 6) + int(hz / 0.018)) % 2 else '#e2a850'
        addm(unshare(t, col), None, tag)

def croissant(s, pos, ry=0.0, tag='bread'):
    R = 0.055 * s; n = 8; P = []
    for i in range(n + 1):
        u = i / n; a = -1.3 + u * 2.6
        P.append((math.sin(a) * R, 0.0, -math.cos(a) * R + R * 0.6))
    with at(pos, ry=ry):
        rad = lambda u: 0.027 * s * (0.32 + 0.68 * math.sin(PI * u) ** 0.65) * (0.88 + 0.12 * math.cos(u * 5 * TAU))
        t = gtube([(x, rad(i / n) * 0.75, z) for i, (x, _, z) in enumerate(P)], rad, K=5)
        addm(t, lambda p, nn: mix(mix('#e6a04e', '#f6c878', clamp(nn.z) * 0.55), '#b0662a', 0.0), tag)

def loaf_long(L, r, pos, slashes=4, c='#d8904a', ry=0.0, rz=0.0, tag='bread'):
    with at(pos, ry=ry, rz=rz):
        addm(gtube([(-L / 2 + r, r * 0.8, 0), (L / 2 - r, r * 0.8, 0)], lambda u: r, K=8), lambda p, n: mul(mix(c, '#f2be70', clamp(n.z) * 0.45), 0.84 if n.z < -0.3 else 1.0), tag)
        for k in range(slashes):
            x = (k - (slashes - 1) / 2) * (L - 2 * r) / slashes
            addm(sph(1.0, (x, r * 1.58, 0), sc=(L / slashes * 0.32, 0.006, r * 0.36), K=5, J=2, ry=0.55), lambda p, n: '#f8dc9c', tag)

def build_breadShelf():
    W, D = 0.98, 0.42; woodD, woodL = '#a86e42', '#e4b078'; shelves = (0.1, 0.47, 0.84, 1.2)
    for sx in (-1, 1):
        for sz in (-1, 1):
            x, z = sx * (W / 2 - 0.03), sz * (D / 2 - 0.03)
            addm(beam(0.055, 1.24, 0.055, (x, 0.62, z), c=0.014), wood2(woodD, grain=0.06, seed=70 + sx + 2 * sz), 'posts')
            addm(sph(0.036, (x, 1.262, z), K=6, J=3), wood2(woodL, ao_z=None), 'posts')
            addm(fbox(0.07, 0.02, 0.07, (x, 0.01, z)), wood2('#8a5a3a', ao_z=None), 'posts')
    for y in shelves:
        for k in range(2):
            addm(beam(W - 0.05, 0.026, 0.18, (0, y + 0.013, -0.093 + k * 0.186), c=0.008), wood2('#dca46a' if k else '#e6b27a', ao_z=None, grain=0.06, seed=int(y * 50) + k), 'shelves')
        for sx in (-1, 1):
            addm(fbox(0.04, 0.04, D - 0.06, (sx * (W / 2 - 0.03), y - 0.008, 0)), wood2(woodD, ao_z=None), 'shelves')
        if y < 1:
            addm(gtube([(-W / 2 + 0.03, y + 0.06, D / 2 - 0.03), (W / 2 - 0.03, y + 0.06, D / 2 - 0.03)], 0.011, K=5), wood2(woodL, ao_z=None), 'shelves')
    # bottom: a long basket with a baguette and a batard
    basket_oval(0.37, 0.13, 0.08, (0, 0.126, 0))
    loaf_long(0.68, 0.034, (0.02, 0.176, 0.04), 4, ry=0.1, rz=0.12)
    loaf_long(0.36, 0.05, (-0.06, 0.156, -0.05), 3, '#c88040', ry=-0.06)
    # middle: two round baskets of melon-pan on gingham napkins
    for sx in (-1, 1):
        with at((sx * 0.235, 0.496, 0.01), ry=sx * 0.25):
            basket_oval(0.17, 0.15, 0.07, (0, 0, 0), seg=12)
            with at((0, 0, 0), ry=PI / 4):
                nap = sheet(0.27, 0.27, 5, 5, lambda u, v: '#e8504a' if (int(u * 5) % 2 and int(v * 5) % 2) else ('#f6a8a0' if (int(u * 5) + int(v * 5)) % 2 else '#fff6ee'),
                            wave=0.0, pos=(0, 0.074, -0.135), rx=-PI / 2, drape=lambda x, y: -0.055 * clamp((math.hypot(x, y + 0.135) - 0.13) / 0.06) ** 1.3)
            addm(nap, None, 'napkins', 'cloth')
            for x, y, z, rx in ((-0.062, 0.075, 0.03, 0.1), (0.06, 0.075, 0.028, -0.12), (0.0, 0.09, -0.045, 0.22)):
                melon_pan(1.08, (x, y, z), ry=x * 9, rx=rx)
    # upper: croissants on a board, the honey jar and its dipper
    with at((-0.2, 0.866, 0.0), ry=0.08):
        addm(rb(0.4, 0.022, 0.24, (0, 0.011, 0), r=0.008), wood2('#f0cc94', ao_z=None, grain=0.05), 'board')
        for x, z, a in ((-0.09, 0.045, 0.3), (0.08, 0.05, -0.4), (0.0, -0.06, 2.8)):
            croissant(1.05, (x, 0.022, z), ry=a)
    jam_jar(1.3, '#f2a024', '#ffd24a', (0.2, 0.866, -0.02))
    with at((0.34, 0.866, 0.07), ry=0.7):
        addm(gtube([(-0.08, 0.012, 0), (0.06, 0.012, 0)], 0.0055, K=4), wood2('#d9a066', ao_z=None), 'dipper')
        addm(glathe([(0.0, 0.0), (0.012, 0.002), (0.018, 0.008), (0.013, 0.014), (0.018, 0.02), (0.013, 0.026), (0.018, 0.032), (0.012, 0.038), (0.0, 0.04)], 5, pos=(0.08, 0.018, 0), rz=-PI / 2),
             lambda p, n: mix('#e8b070', '#f4a020', clamp(-n.z) * 0.5), 'dipper')
    # top: a chalk sign on an A-frame (a drawn loaf and a heart: no text) and a round boule
    with at((0.19, 1.226, 0.03), ry=-0.22):
        for s in (-1, 1):
            for sz in (-1, 1):
                addm(fbox(0.014, 0.17, 0.014, (s * 0.083, 0.083, sz * 0.027), rx=sz * 0.27), wood2(woodD, ao_z=None), 'sign')
        with at((0, 0.09, 0.026), rx=-0.32):
            addm(slab(rrect(0.2, 0.14, 0.018, n=2), 0.012, bev=0.004, z0=-0.009), wood2(woodL, ao_z=None), 'sign')
            addm(rb(0.17, 0.11, 0.004, (0, 0, 0.004), r=0.002), lambda p, n: mix('#3c4c46', '#4c5e56', 0.3), 'sign')
            ch = lambda p, n: '#f4f2e6'
            loafp = [(0.045 * math.cos(PI + TAU * i / 12), 0.012 + 0.026 * math.sin(PI + TAU * i / 12)) for i in range(13)]
            addm(gtube([(x - 0.01, y, 0.0072) for x, y in loafp], 0.003, K=3, caps=False), ch, 'sign')
            for k in range(3):
                addm(gtube([(-0.072 + k * 0.022, 0.0, 0.0072), (-0.06 + k * 0.022, 0.024, 0.0072)], 0.0025, K=3), ch, 'sign')
            with at((0.045, 0.005, 0.0062)):
                addm(puffy(heart_poly(0.05, n=3), 0.003, bev=0.0015), lambda p, n: '#ff9eb8', 'sign')
            addm(gtube([(-0.075, -0.038, 0.0072), (0.075, -0.04, 0.0072)], 0.0028, K=3), lambda p, n: '#ffd24a', 'sign')
    with at((-0.21, 1.226, 0.0)):
        addm(sph(0.075, (0, 0.044, 0), sc=(1, 0.6, 1), K=9, J=5), lambda p, n: mul(mix('#d48a44', '#f2be72', clamp(n.z) * 0.5), 0.85 if n.z < -0.2 else 1.0), 'bread')
        for ry in (0.4, 0.4 + PI / 2):
            addm(sph(1.0, (0, 0.088, 0), sc=(0.05, 0.006, 0.009), K=5, J=2, ry=ry), lambda p, n: '#f8dc9c', 'bread')
    return dict(h=1.4)

# ================================================================== Curio Cabinet (PHASE2.curioCabinet: 2 x 1 cells, h 1.55)
def build_curioCabinet():
    W, D = 0.96, 0.4; body, bodyL, bodyD, trim, shelfC = '#3f6e6a', '#56887f', '#2f5652', '#e8b84a', '#f2e2cc'
    teal = lambda c: lac(c, mix(c, '#cfeee6', 0.25), mul(c, 0.72))
    for sx in (-1, 1):
        for sz in (-1, 1):
            addm(glathe([(0.0, 0.0), (0.032, 0.0), (0.044, 0.03), (0.032, 0.07), (0.04, 0.098), (0.0, 0.1)], 6, pos=(sx * 0.42, 0, sz * 0.15)), teal(bodyD), 'legs')
    addm(rb(W, 0.2, D, (0, 0.19, 0), r=0.03), teal(body), 'case')
    for sx in (-1, 1):
        addm(beam(0.43, 0.13, 0.02, (sx * 0.235, 0.19, D / 2 + 0.006), c=0.006), teal(bodyL), 'drawers')
        pl = [(sx * 0.235 + 0.03 * math.cos(PI + PI * i / 6), 0.205 - 0.03 * math.sin(PI * i / 6), D / 2 + 0.024) for i in range(7)]
        addm(gtube(pl, 0.006, K=4), gold, 'drawers')
        for s in (-1, 1):
            addm(sph(0.009, (sx * 0.235 + s * 0.03, 0.205, D / 2 + 0.02), K=4, J=2), gold, 'drawers')
    y0, y1 = 0.29, 1.37
    for sx in (-1, 1):
        addm(rb(0.04, y1 - y0, D - 0.02, (sx * (W / 2 - 0.02), (y0 + y1) / 2, -0.01), r=0.012), teal(body), 'case')
        addm(beam(0.012, 0.86, 0.28, (sx * (W / 2 + 0.002), 0.83, -0.01), c=0.004), teal(bodyL), 'case')
        for zz in (0.125, -0.145):
            addm(fbox(0.006, 0.84, 0.008, (sx * (W / 2 + 0.009), 0.83, zz)), gold, 'case')
    # the rose velvet back (stripes), the shelves with gold lips, the cornice, moulding and the gold-leaf crest
    addm(sheet(W - 0.06, y1 - y0, 22, 2, lambda u, v: '#d8a0a6' if int(u * 22) % 2 else '#e4b4b6', wave=0.0, pos=(0, y1, -D / 2 + 0.022)),
         None, 'case')
    addm(rb(W - 0.04, y1 - y0, 0.016, (0, (y0 + y1) / 2, -D / 2 + 0.008), r=0.006), teal(bodyD), 'case')       # (behind the velvet)
    addm(rb(W - 0.06, 0.02, D - 0.04, (0, y0 + 0.01, -0.01), r=0.006), wood2(shelfC, ao_z=None), 'shelves')
    for y in (0.62, 0.95):
        addm(beam(W - 0.07, 0.022, D - 0.06, (0, y + 0.011, -0.015), c=0.006), wood2(shelfC, ao_z=None), 'shelves')
        addm(fbox(W - 0.07, 0.01, 0.008, (0, y + 0.016, D / 2 - 0.044)), gold, 'shelves')
    addm(rb(W + 0.03, 0.045, D + 0.03, (0, y1 + 0.0225, 0), r=0.016), teal(body), 'cornice')
    addm(gtube([(-W / 2 + 0.01, y1 + 0.045, D / 2 - 0.004), (W / 2 - 0.01, y1 + 0.045, D / 2 - 0.004)], 0.016, K=5), teal(bodyL), 'cornice')
    with at((0, y1 + 0.045, D / 2 - 0.08)):
        pts = [(-0.26, 0.0), (0.26, 0.0)] + [(0.26 * math.cos(PI * i / 10), 0.11 * math.sin(PI * i / 10) ** 1.4) for i in range(11)]
        addm(slab(pts, 0.03, bev=0.008), teal(body), 'crest')
        lf = [(0.0, -0.045), (0.03, -0.02), (0.034, 0.012), (0.006, 0.05), (-0.006, 0.05), (-0.034, 0.012), (-0.03, -0.02)]
        with at((0, 0.06, 0.03)):
            addm(puffy(lf[::-1], 0.008, bev=0.004), gold, 'crest')
    s0, s1, s2 = y0 + 0.02, 0.642, 0.972
    # a geode on a little stand: a rough grey shell, a purple crystal heart
    with at((-0.265, s0, -0.03), ry=0.35):
        addm(rb(0.12, 0.022, 0.08, (0, 0.011, 0), r=0.006), wood2('#8a5a3a', ao_z=None), 'geode')
        with at((0, 0.1, 0), rx=-0.25, s=1.25):
            rr = lambda r, z, th: r * (1 + 0.1 * (vnoise(Vector((math.cos(th) * 3, math.sin(th) * 3, z * 30)), 1.0, 3) - 0.5))
            sh = lathe([(0.0, -0.066), (0.03, -0.06), (0.052, -0.04), (0.064, -0.015), (0.066, 0.0)], 10, rfn=rr).xform(F.m @ lm((0, 0, 0), rx=PI / 2))
            addm(sh, lambda p, n: mix('#8a7a72', '#b4a69c', clamp(n.z * 0.5 + 0.5)), 'geode')
            addm(glathe([(0.0, 0.0), (0.066, 0.0), (0.05, 0.004), (0.0, 0.0)], 10, rx=PI / 2), lambda p, n: '#f2eaf6', 'geode')
            addm(cyl(0.05, 0.05, 0.004, (0, 0, 0.003), K=8, rx=PI / 2), lambda p, n: '#4a2a6a', 'geode')      # the violet hollow
            for k in range(9):                                  # amethyst points crowding the hollow, light tips on dark
                a = TAU * k / 9 + 0.3; r_ = 0.022 + 0.014 * (k % 2)
                addm(sph(0.012, (math.cos(a) * r_, math.sin(a) * r_, 0.008), sc=(1, 1, 1.5), K=4, J=2), lambda p, n, k=k: mix('#8a58c8' if k % 2 else '#a878e0', '#f0e2ff', clamp(n.z * 0.4 - n.y * 0.6)), 'geode')
            addm(sph(0.014, (0, 0, 0.01), sc=(1, 1, 1.6), K=4, J=2), lambda p, n: mix('#b88ae0', '#f4eaff', clamp(-n.y)), 'geode')
    # a stack of coins and one standing on its edge
    rg = Rng(19)
    for i in range(4):
        addm(cyl(0.032, 0.032, 0.0086, (rg.u(-0.004, 0.004), s0 + 0.0045 + i * 0.0088, rg.u(-0.004, 0.004)), K=8), lambda p, n: '#f4c84a' if n.z > 0.5 else '#c89a30', 'coins')
    addm(cyl(0.032, 0.032, 0.0086, (0.06, s0 + 0.033, 0.03), K=8, rx=PI / 2 - 0.15, ry=-0.5), lambda p, n: '#f4c84a' if n.z > -0.2 else '#c89a30', 'coins')
    # a pink scallop shell on a stand
    with at((0.27, s0, -0.03), ry=-0.3):
        addm(rb(0.1, 0.02, 0.06, (0, 0.01, 0), r=0.006), wood2('#8a5a3a', ao_z=None), 'shell')
        fan = [(0.0, 0.0)] + [(0.055 * math.cos(a) * (1 + 0.06 * math.cos(14 * a) ** 2), 0.055 * math.sin(a) * (1 + 0.06 * math.cos(14 * a) ** 2) + 0.01) for a in (0.15 + (PI - 0.3) * i / 14 for i in range(15))]
        with at((0, 0.02, 0.0), rx=-0.2):
            addm(slab([(x * 1.05, y * 1.05) for x, y in fan[::-1]], 0.026, bev=0.011, z0=-0.013), lambda p, n: mix('#ff9eb8', '#ffe2ec', 0.5 * math.cos(math.atan2(p.z - (s0 + 0.03), p.x - 0.27) * 14) ** 2), 'shell')
            addm(fbox(0.03, 0.014, 0.02, (0, 0.006, 0)), lambda p, n: '#ff9eb8', 'shell')
    # a ship in a bottle on a cradle
    with at((-0.16, s1, -0.02), ry=0.12):
        for x in (-0.09, 0.09):
            addm(rb(0.04, 0.034, 0.08, (x, 0.017, 0), r=0.008), wood2('#8a5a3a', ao_z=None), 'bottle')
        with at((-0.155, 0.078, 0), rz=-PI / 2, s=1.12):
            bp = [(0.0, 0.0), (0.042, 0.0), (0.048, 0.008), (0.05, 0.03), (0.05, 0.2), (0.045, 0.225), (0.026, 0.25), (0.018, 0.27), (0.018, 0.296), (0.021, 0.3), (0.0, 0.304)]
            addm(glathe(bp, 8), lambda p, n: mix('#cceeea', '#ffffff', 0.6 if n.z > 0.75 else clamp(n.z) * 0.25), 'bottle')
            addm(cyl(0.0165, 0.015, 0.03, (0, 0.31, 0), K=8), wood2('#c8a070', ao_z=None), 'bottle')
            # the little ship, sitting proud of the glass so it reads: a hull, two sails, a pennant, painted waves
            with at((0, 0.12, 0.052), rz=PI / 2):
                addm(fbox(0.1, 0.022, 0.012, (0.0, -0.02, 0)), wood2('#8a4a2a', ao_z=None), 'bottle')
                addm(fbox(0.14, 0.016, 0.006, (0.0, -0.036, -0.002)), lambda p, n: '#5a9ad8', 'bottle')
                for x, h in ((-0.02, 0.05), (0.022, 0.042)):
                    addm(fbox(0.004, h + 0.01, 0.004, (x, h / 2 - 0.005, 0)), lambda p, n: '#5a3a2a', 'bottle')
                    addm(fbox(0.03, h * 0.8, 0.004, (x + 0.003, h * 0.45, 0.003)), lambda p, n: '#fffaf2', 'bottle')
                addm(fbox(0.016, 0.008, 0.003, (-0.012, 0.05, 0.003)), lambda p, n: '#e8403a', 'bottle')
    # a teacup on its saucer
    with at((0.25, s1, 0.0), ry=-0.5, s=1.3):
        addm(glathe([(0.0, 0.0), (0.03, 0.0), (0.034, 0.004), (0.06, 0.012), (0.064, 0.016), (0.058, 0.016), (0.03, 0.01), (0.0, 0.01)], 8), lambda p, n: '#6a9ad8' if n.z < 0.9 and p.z > s1 + 0.012 else '#fffaf4', 'teacup')
        addm(glathe([(0.0, 0.01), (0.022, 0.01), (0.026, 0.014), (0.038, 0.04), (0.044, 0.062), (0.046, 0.066), (0.041, 0.066), (0.038, 0.044), (0.024, 0.02), (0.0, 0.018)], 8),
             lambda p, n: trim if p.z > s1 + 0.062 * 1.3 else ('#c8905a' if n.z > 0.6 and p.z < s1 + 0.04 else ('#6a9ad8' if s1 + 0.044 * 1.3 < p.z < s1 + 0.054 * 1.3 else '#fffaf4')), 'teacup')
        hp = [(0.046 + 0.016 * math.sin(PI * i / 6), 0.042 + 0.016 * math.cos(PI * i / 6), 0.0) for i in range(7)]
        addm(gtube(hp, 0.005, K=3), lambda p, n: '#fffaf4', 'teacup')
    # a tiny janome umbrella leaning in the top compartment
    with at((-0.2, s2, -0.03), ry=0.25, rx=0.12, rz=0.38, s=1.12):
        addm(gtube([(0, 0.0, 0), (0, 0.25, 0)], 0.0055, K=4), wood2('#d8b878', ao_z=None), 'umbrella')
        up = [(0.0, 0.258), (0.03, 0.252), (0.055, 0.241), (0.072, 0.232), (0.095, 0.214), (0.118, 0.192), (0.112, 0.186), (0.0, 0.2)]
        rib = lambda r, z, th: r * (1 - 0.06 * (1 - abs(math.cos(4 * th))) * clamp(r / 0.1))
        K_ = 12; band = ['#e04a3a', '#fff4ea', '#e04a3a', '#e04a3a', '#c83a2e']     # (ring bands top-down: red, the white ring, red, red, the rim)
        addm(unshare_i(glathe(up, K_, rfn=rib), lambda fi: band[fi // K_] if fi < K_ * len(band) else ('#e04a3a' if fi < K_ * (len(band) + 1) else '#f6d8b0')), None, 'umbrella')
        addm(sph(0.012, (0, 0.262, 0), K=6, J=3), lambda p, n: INK, 'umbrella')
        addm(sph(0.009, (0, 0.004, 0), K=5, J=3), wood2('#8a5a3a', ao_z=None), 'umbrella')
    # an hourglass
    with at((0.22, s2, -0.02), ry=0.3, s=1.15):
        for y in (0.0, 0.168):
            addm(glathe([(0.0, 0.0), (0.048, 0.0), (0.052, 0.007), (0.048, 0.014), (0.0, 0.014)], 7, pos=(0, y, 0)), wood2('#8a5a3a', ao_z=None), 'hourglass')
        for k in range(3):
            a = k / 3 * TAU + 0.5
            addm(cyl(0.0055, 0.0055, 0.156, (math.sin(a) * 0.04, 0.09, math.cos(a) * 0.04), K=4), wood2('#a8703e', ao_z=None), 'hourglass')
        gp = [(0.0, 0.014), (0.028, 0.016), (0.034, 0.038), (0.028, 0.066), (0.007, 0.091), (0.028, 0.116), (0.034, 0.144), (0.028, 0.166), (0.0, 0.168)]
        zb_ = F.W((0, 0, 0)).z; sc_ = 1.15
        addm(glathe(gp, 7), lambda p, n: '#f2c878' if (p.z - zb_) / sc_ < 0.046 or 0.094 < (p.z - zb_) / sc_ < 0.106 else mix('#d4f0f0', '#ffffff', clamp(n.z) * 0.4), 'hourglass')
    # the glass doors: chunky frames with brass knobs, a keyhole plate, glints across the glass
    dz = D / 2 + 0.008; dh = y1 - y0 - 0.02
    for sx in (-1, 1):
        cx = sx * 0.232; dw = 0.446
        for yy in (y0 + 0.01, y0 + 0.01 + dh - 0.04):
            addm(beam(dw, 0.04, 0.024, (cx, yy + 0.02, dz), c=0.008), teal(bodyL), 'doors')
        for xx in (-1, 1):
            addm(beam(0.04, dh - 0.08, 0.024, (cx + xx * (dw / 2 - 0.02), y0 + 0.01 + dh / 2, dz), c=0.008), teal(bodyL), 'doors')
        for x0, yA, L, wd in ((-0.15, 1.12, 0.13, 0.012), (-0.12, 1.19, 0.06, 0.008)):
            addm(fbox(wd, L, 0.003, (cx + x0 + 0.03, yA, dz - 0.004), rz=-0.6), lambda p, n: '#eef8fa', 'doors')
        addm(sph(0.015, (sx * 0.03, 0.81, dz + 0.018), K=6, J=4), gold, 'doors')
    addm(rb(0.024, 0.036, 0.006, (0.03, 0.75, dz + 0.013), r=0.003), gold, 'doors')
    addm(rb(0.006, 0.012, 0.003, (0.03, 0.756, dz + 0.017), r=0.0), lambda p, n: INK, 'doors')
    return dict(h=1.55)

# ================================================================== finishing and export
def finish(A, h, seed=5, amt=0.004):
    """a whisper of hand-made wobble (furniture scale: millimetres), then a soft contact shade toward the floor, like the
    kit's baseShade (furnitureMesh.js) but painted here, since the game skips it for Blender models"""
    a = (seed % 97) * 1.37 + 0.7; H = max(0.12, min(0.45, h * 0.5))
    for o in A.objs.values():
        V = o['v']
        for i, p in enumerate(V):
            k = amt * (0.4 + p.z)
            dx = (math.sin(p.z * 7.0 + a) * 0.6 + math.sin(p.y * 9.0 + a * 2.1) * 0.4) * k
            dy = (math.sin(p.z * 8.0 + a * 1.7) * 0.6 + math.sin(p.x * 8.5 + a * 0.6) * 0.4) * k
            V[i] = Vector((p.x + dx, p.y + dy, p.z))
        for i, (p, c) in enumerate(zip(V, o['c'])):
            k = 0.84 + 0.16 * smooth(0.0, H, p.z)
            o['c'][i] = (c[0] * k, c[1] * k, c[2] * k, 1.0)

def make_vc_mat(name):
    mt = bpy.data.materials.new(name); mt.use_nodes = True; nt = mt.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Roughness'].default_value = 0.8; bsdf.inputs['Metallic'].default_value = 0.0
    vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'; nt.links.new(vc.outputs['Color'], bsdf.inputs['Base Color'])
    if name in ('hot', 'glow'):                                     # (the game draws these with its own glow material)
        nt.links.new(vc.outputs['Color'], bsdf.inputs['Emission Color']); bsdf.inputs['Emission Strength'].default_value = 1.5
    return mt

def export_piece(A, name):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mats = {k: make_vc_mat(k) for k in A.objs}
    obs = [to_object(k, o, mats) for k, o in A.objs.items()]
    for ob in obs:
        if ob.name in ('cloth', 'hot', 'glow'):
            # cloth: v = 0 -> glTF uv.y = 1, pinned for the cloth wind. hot / glow: the kit glow shader reads uv.x as the
            # flicker and uv.y as the vertex-colour tint, so (1, 0) -> glTF (1, 1): flickering, tinted by the colours
            uv = ob.data.uv_layers.new(name='UVMap'); u = 0.0 if ob.name == 'cloth' else 1.0
            uv.data.foreach_set('uv', [u, 0.0] * len(ob.data.loops))
    lo = Vector((1e9,) * 3); hi = Vector((-1e9,) * 3)
    for o in A.objs.values():
        for v in o['v']: lo = Vector(map(min, lo, v)); hi = Vector(map(max, hi, v))
    print('FB %s tris %d %s' % (name, A.tris(), {k: A.tris(k) for k in A.objs}))
    print('FB %s parts %s' % (name, dict(sorted(A.count.items(), key=lambda kv: -kv[1]))))
    print('FB %s size x %.3f (%.3f..%.3f) depth %.3f (%.3f..%.3f) h %.3f (min z %.4f)' % (name, hi.x - lo.x, lo.x, hi.x, hi.y - lo.y, lo.y, hi.y, hi.z, lo.z))
    for ob in obs: print('FB %s check %s %s' % (name, ob.name, check(ob)))
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, name + '.blend'))
    for o in bpy.context.scene.objects: o.select_set(o.type == 'MESH')
    out = os.path.join(MODELS, name + '.glb')
    kw = dict(filepath=out, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
              export_attributes=True, export_lights=False, export_cameras=False, export_animations=False,
              export_normals=True, export_texcoords=True, export_materials='EXPORT')
    try: bpy.ops.export_scene.gltf(export_vertex_color='ACTIVE', **kw)
    except TypeError as e:
        print('FB export_vertex_color rejected:', e); bpy.ops.export_scene.gltf(export_colors=True, **kw)
    print('FB wrote', out)

PIECES = {'futonBed': build_futonBed, 'pupBasket': build_pupBasket, 'treasureChest': build_treasureChest,
          'kitchenStove': build_kitchenStove, 'kitchenCounter': build_kitchenCounter, 'bookshelf': build_bookshelf, 'tansu': build_tansu,
          'wardrobe': build_wardrobe, 'breadShelf': build_breadShelf, 'curioCabinet': build_curioCabinet}
for pid in (list(PIECES) if PIECE == 'all' else PIECE.split(',')):
    A = Asset3(); F.m = Matrix.Identity(4); F.st = []
    info = PIECES[pid]()
    finish(A, info['h'], seed=sum(map(ord, pid)))
    export_piece(A, 'furn-' + pid)
