# PAWHAVEN: the housing catalog's lights and rugs (task furn-light), built in Blender by script.
#   blender --background --factory-startup --python build_furn-light.py -- --piece <id|all>
# writes D:/projects/chewy-life-3d/public/models/furn-<id>.glb (and furn-<id>.blend beside this script).
# Deterministic: seeded maths only; a re-run reproduces every GLB exactly.
# Frame (src/home/furnitureMesh.js): 1 unit = 1 m. The layout code is written in the kit's game frame (x right, y up,
# z = the item's front) and mapped to Blender (x, -z, y). Floor / table / rug items: z = 0 at the base, centred on the
# footprint. Ceiling items: the cord's top at z = h, the lamp's lowest point at z = 0.
# The core kit (mesh accumulator, painted vertex colours, rounded boxes, lathes, tubes, facets) is copied from
# furn-small/build_furn-small.py (itself from the Hollow landmarks).
# Materials by name choose the game's bucket: body, leaf, cloth, glow. Glow parts carry a UV (flicker, tint) for the
# kit glow shader; cloth parts carry v = 0 (glTF uv.y = 1: pinned, no sway).
import bpy, bmesh, math, os, sys
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..', '..'))
MODELS = os.path.join(REPO, 'public', 'models')
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
PIECE = argv[argv.index('--piece') + 1] if '--piece' in argv else 'all'
print('FL build pid', os.getpid())
TAU = math.tau
X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))

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
            if vol < 0 and not getattr(self, 'open', False):
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
    if o.get('uv'):
        uvl = me.uv_layers.new(name='UVMap'); uvs = []
        for poly in me.polygons:
            for li in poly.loop_indices: uvs.extend(o['uv'][me.loops[li].vertex_index])
        uvl.data.foreach_set('uv', uvs)
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


# ================================================================== furn-small additions
class FAsset(Asset):
    """Asset whose shells may be pre-oriented and carry their own base colours (t.c): col is then a shading pass
    col(c, p, n) (or None for the colours as they are)"""
    def add(self, obj, mat, t, col, tag=None, uvf=None):
        if not getattr(t, 'done', False):
            t.orient(); t.normals()
        o = self.objs.setdefault(obj, dict(v=[], n=[], c=[], f=[], m=[], mats=[], uv=[]))
        if mat not in o['mats']: o['mats'].append(mat)
        mi = o['mats'].index(mat); b = len(o['v'])
        tc = getattr(t, 'c', None)
        for i, (p, n) in enumerate(zip(t.v, t.n)):
            if tc is not None: c = col(tc[i], p, n) if callable(col) else tc[i]
            else: c = col(p, n) if callable(col) else col
            o['v'].append(p); o['n'].append(n); o['c'].append(lin(c))
            o['uv'].append(uvf(p) if uvf else (0.0, 0.0))     # (cloth: uv.y = 1 at the hung top, 0 at the bottom)
        for f in t.f: o['f'].append([i + b for i in f]); o['m'].append(mi)
        tr = sum(len(f) - 2 for f in t.f)
        k = tag or mat; self.count[k] = self.count.get(k, 0) + tr
        if not hasattr(self, 'low'): self.low = {}
        self.low[k] = min(self.low.get(k, 9.0), min(p.z for p in t.v))
        return t

def facet(t, colfn, open_=False):
    """split a shell into per-face vertices (smooth normals kept) and give each face a base colour colfn(centroid,
    face normal) in the shell's LOCAL frame (call before .xform). open_: an open shell, oriented by its first face."""
    t.open = bool(open_); t.orient()
    if open_:                       # (an open shell: make its topmost face look up, the rest follows by consistency)
        def fz(f):
            P = [t.v[i] for i in f]; return sum(p.z for p in P) / len(P)
        top = max(t.f, key=fz); P = [t.v[i] for i in top]
        nn = Vector((0, 0, 0))
        for k in range(1, len(P) - 1): nn += (P[k] - P[0]).cross(P[k + 1] - P[0])
        if nn.z < 0: t.f = [f[::-1] for f in t.f]
    t.normals()
    o = Tmp(); o.c = []; o.done = True
    for f in t.f:
        P = [t.v[i] for i in f]; cen = sum(P, Vector()) / len(P)
        fn = Vector((0, 0, 0))
        for k in range(1, len(P) - 1): fn += (P[k] - P[0]).cross(P[k + 1] - P[0])
        col = colfn(cen, fn.normalized() if fn.length > 1e-14 else Z.copy())
        ids = []
        for i in f:
            ids.append(o.vert(t.v[i], t.n[i])); o.c.append(srgb(col))
        o.f.append(ids)
    return o

def lathe_stag(prof, K, stag=0.5):
    """a lathe whose alternate rings are turned half a step: faceted, it reads as overlapping scales"""
    t = Tmp(); rings, cs = [], []
    body = list(prof); p0 = p1 = None
    if body[0][0] < 1e-6: p0 = Vector((0, 0, body[0][1])); body = body[1:]
    if body[-1][0] < 1e-6: p1 = Vector((0, 0, body[-1][1])); body = body[:-1]
    for j, (r, z) in enumerate(body):
        th0 = (j % 2) * stag * TAU / K
        rings.append([Vector((r * math.cos(th0 + TAU * k / K), r * math.sin(th0 + TAU * k / K), z)) for k in range(K)])
        cs.append(Vector((0, 0, z)))
    ring_surface(t, rings, cs, p0, p1)
    return t

def catmull(pts, n):
    """n points along a Catmull-Rom spline through pts (tuples)"""
    P = [Vector(p) for p in pts]; P = [P[0] * 2 - P[1]] + P + [P[-1] * 2 - P[-2]]
    segs = len(P) - 3; out = []
    for i in range(n):
        u = i / (n - 1) * segs; s = min(int(u), segs - 1); t = u - s
        p0, p1, p2, p3 = P[s], P[s + 1], P[s + 2], P[s + 3]
        out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    return [tuple(p) for p in out]

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

def puffy(poly, depth, bev=0.01, z0=0.0, both=False, centre=None):
    """a relief slab: a star-shaped 2-D outline [(x, y)] in the face frame (x right, y up) extruded along +z from z0,
    the front edge (and the back with both=True) rounded by an inset ring. Fans from the centroid (or centre)."""
    n = len(poly)
    cx, cy = centre or (sum(p[0] for p in poly) / n, sum(p[1] for p in poly) / n)
    bev = min(bev, depth * (0.45 if both else 0.9))
    def ins(p, d):
        v = Vector((cx - p[0], cy - p[1], 0)); L = v.length
        return (p[0] + v.x / L * min(d, L * 0.5), p[1] + v.y / L * min(d, L * 0.5)) if L > 1e-9 else p
    zf = z0 + depth
    rings, zs = [], []
    if both: rings.append([F.W((q[0], q[1], z0)) for q in (ins(p, bev) for p in poly)]); zs.append(z0)
    rings.append([F.W((x, y, z0 + (bev if both else 0.0))) for x, y in poly]); zs.append(z0 + (bev if both else 0.0))
    rings.append([F.W((x, y, zf - bev)) for x, y in poly]); zs.append(zf - bev)
    rings.append([F.W((q[0], q[1], zf)) for q in (ins(p, bev) for p in poly)]); zs.append(zf)
    cs = [F.W((cx, cy, z)) for z in zs]
    t = Tmp(); ring_surface(t, rings, cs, pole0=cs[0], pole1=cs[-1])
    return t

def rb(w, h, d, pos=(0, 0, 0), r=0.02, ry=0.0, rx=0.0, rz=0.0):
    """a rounded box (game-local sizes); the radius clamps to the thinnest side instead of vanishing"""
    r = min(r, min(w, h, d) * 0.45)
    return rbox((w, d, h), r=r, seg=1, M=F.m @ lm(pos, ry, rx, rz))

def leafb(L, W, pos, rz=0.0, rx=0.0, ry=0.0, T=0.0055, K=6, heart=True):
    """a chunky leaf (16 tris): a heart-shaped outline from its base (local origin) to the tip (local +y), a raised
    midrib on the front (+z) and a flatter back; rz spins it in the face plane, rx tilts it"""
    if not heart: return sph(1.0, pos, sc=(W, L, T), K=K, J=2, rz=rz, rx=rx, ry=ry)
    ol = [(0.0, 1.0), (0.4, 0.66), (0.5, 0.34), (0.34, 0.06), (0.0, 0.14), (-0.34, 0.06), (-0.5, 0.34), (-0.4, 0.66)]
    M = F.m @ lm(pos, ry, rx, rz)
    t = Tmp()
    ring = [t.vert(M @ gl((x * W, y * L - L * 0.42, 0.0))) for x, y in ol]
    cf = t.vert(M @ gl((0.0, 0.0, T))); cb = t.vert(M @ gl((0.0, 0.0, -T * 0.7)))
    nf = (M.to_3x3() @ gl((0, 0, 1))).normalized()
    for k in range(len(ol)):
        k1 = (k + 1) % len(ol)
        t.face([cf, ring[k], ring[k1]], nf); t.face([cb, ring[k1], ring[k]], -nf)
    return t

# ---------------------------------------------------------------- painting
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
                 nz_amp=nz, nz_f=9, seed=seed)
def soft(c, top=0.15, bot=0.25): return paint(c, top=top, bot=bot)
def flat(c): return lambda p, n: c
def fsh(top=0.14, bot=0.24, sheen=0.0):
    """the shading pass over faceted base colours (world normals): lit tops, darker undersides, optional glaze sheen"""
    def f(c, p, n):
        up = n.z
        c = mul(c, 1 + top * up) if up >= 0 else mul(c, 1 + bot * up)
        if sheen: c = mix(c, '#fff8ee', sheen * clamp(-n.y * 0.55 + n.z * 0.5 - n.x * 0.15) ** 3)
        return c
    return f

INK = '#3a2a30'; GOLD = '#f4c04a'; CREAM = '#fff6e8'; BRASS = '#c8a050'
HONEY = '#d9a066'; WOOD = '#c98f5e'; WOOD_D = '#6b4a3a'; WOOD_R = '#a86e42'
MINT = '#8fe0c0'; SKY = '#8fd0ff'; BUTTER = '#ffe08a'; SAKURA = '#ffbcd6'
LEAVES = ['#5aa84a', '#6ab854', '#4f9a44', '#7cc05a', '#62b04e']

A = None
def new_asset():
    global A
    A = FAsset(); F.m = Matrix.Identity(4); F.st = []
    return A
def add(t, col, tag='misc', mat='body', uvf=None):
    A.add('furn', mat, t, col, tag, uvf); return t
def hang_uv(yb, yt):
    """cloth uv: v = 1 at the hung top (game y = yt), 0 at the free bottom (yb); u = x"""
    return lambda p: (p.x * 2.0, clamp((p.z - yb) / (yt - yb)))

def angle_k(cen, K, th0):
    """the lathe step index of a face centroid (local frame)"""
    th = math.atan2(cen.y, cen.x)
    return int(math.floor(((th - th0) / (TAU / K)) % K + 1e-6)) % K

# ================================================================== round 2 helpers
def dot(r, pos, sc=(1, 1, 0.4), K=8, J=2, ry=0.0, rz=0.0, rx=0.0):
    """a round decal dot / disc facing the game's +z (its ring in the face plane, so the outline is round, not a
    diamond); sc = (x, y, thickness); ry / rz turn it (rz spins it in its plane)"""
    t = ellipsoid(Vector((0, 0, 0)), (r * sc[0], r * sc[1], r * sc[2]), K=K, J=J)
    return t.xform(F.m @ lm(pos, ry, rx, rz) @ Matrix.Rotation(math.pi / 2, 4, 'X'))


def fan_shape(ol, pos, sc=1.0, T=0.005, rz=0.0, rx=0.0, ry=0.0, centre=None, Tb=None):
    """a chunky flat shape (a maple leaf, a starfish, a wing): a star-shaped outline in the face plane, its front
    raised to a centre point (T proud) and its back to another (Tb): 2 tris per outline point"""
    M = F.m @ lm(pos, ry, rx, rz)
    n = len(ol); cx, cy = centre or (sum(p[0] for p in ol) / n, sum(p[1] for p in ol) / n)
    t = Tmp()
    ring = [t.vert(M @ gl((x * sc, y * sc, 0.0))) for x, y in ol]
    cf = t.vert(M @ gl((cx * sc, cy * sc, T))); cb = t.vert(M @ gl((cx * sc, cy * sc, -(Tb if Tb is not None else T * 0.6))))
    nf = (M.to_3x3() @ gl((0, 0, 1))).normalized()
    for k in range(n):
        k1 = (k + 1) % n
        t.face([cf, ring[k], ring[k1]], nf); t.face([cb, ring[k1], ring[k]], -nf)
    return t

def vslab(x0, x1, ys, z0, z1, xs=None):
    """an upright board subdivided along y (so cloth sway can bend it): rectangle rings at each height; xs(y) ->
    (x0, x1) and zs per station optional through callables"""
    t = Tmp(); rings, cs = [], []
    for y in ys:
        a, b = xs(y) if xs else (x0, x1)
        za, zb = (z0(y), z1(y)) if callable(z0) else (z0, z1)
        rings.append([F.W((a, y, za)), F.W((b, y, za)), F.W((b, y, zb)), F.W((a, y, zb))]); cs.append(F.W(((a + b) / 2, y, (za + zb) / 2)))
    ring_surface(t, rings, cs, pole0=cs[0], pole1=cs[-1])
    return t

def sheet(x0, x1, ys, zf, nx=4):
    """a single-sided hanging sheet (the cloth material is double-sided): a grid facing +z, zf(x, y) its depth"""
    t = Tmp(); ids = []
    for y in ys:
        ids.append([t.vert(F.W((x0 + (x1 - x0) * i / nx, y, zf(x0 + (x1 - x0) * i / nx, y)))) for i in range(nx + 1)])
    nf = F.N((0, 0, 1))
    for j in range(len(ys) - 1):
        for i in range(nx):
            t.face([ids[j][i], ids[j][i + 1], ids[j + 1][i + 1], ids[j + 1][i]], nf)
    t.open = True
    return t

def add_open(t, col, tag, mat='body', uvf=None):
    """add a shell that is open (a sheet): oriented by its hints only, no volume flip"""
    t.open = True; t.orient(); t.normals(); t.done = True
    if not hasattr(t, 'c'): pass
    A.add('furn', mat, t, col, tag, uvf); return t

MAPLE = [(0, 1.0), (0.12, 0.62), (0.42, 0.78), (0.3, 0.42), (0.5, 0.3), (0.16, 0.2), (0.06, 0.0), (-0.06, 0.0), (-0.16, 0.2), (-0.5, 0.3), (-0.3, 0.42), (-0.42, 0.78), (-0.12, 0.62)]
def star_ol(n=5, r0=1.0, r1=0.45, a0=PI / 2):
    return [((r0 if k % 2 == 0 else r1) * math.cos(a0 + k * PI / n), (r0 if k % 2 == 0 else r1) * math.sin(a0 + k * PI / n)) for k in range(2 * n)]
def circ_ol(n, rx, ry=None, a0=0.0):
    ry = ry or rx
    return [(rx * math.cos(a0 + TAU * k / n), ry * math.sin(a0 + TAU * k / n)) for k in range(n)]

# ================================================================== tabletop helpers
def rrect(w, d, r, n_corner=3, y=0.0):
    """a rounded-rectangle loop (game x-z plane at height y), counter-clockwise from above"""
    pts = []
    for (cx, cz, a0) in ((w / 2 - r, d / 2 - r, 0.0), (-(w / 2 - r), d / 2 - r, PI / 2), (-(w / 2 - r), -(d / 2 - r), PI), (w / 2 - r, -(d / 2 - r), 1.5 * PI)):
        for i in range(n_corner + 1):
            a = a0 + (PI / 2) * i / n_corner
            pts.append((cx + r * math.cos(a), y, cz + r * math.sin(a)))
    return pts

def gloopc(pts, rad, K=4):
    """a closed tube through game-local points"""
    return tube_loop([F.W(p) for p in pts], (lambda s: rad) if not callable(rad) else rad, K=K, up=Z)

def flower_ol(n=5, r0=1.0, r1=0.55, per=3):
    """a round-petalled flower outline"""
    out = []
    for k in range(n * per):
        a = PI / 2 + TAU * k / (n * per)
        ph = (k % per) / per
        r = r1 + (r0 - r1) * math.sin(PI * (ph + 0.5 / per)) ** 0.8
        out.append((r * math.cos(a), r * math.sin(a)))
    return out

def surf_patch(rfun, th_w, y0, y_h, lift=0.004, seg=16, rings=3, th0=0.0):
    """a decal shell lying on a lathe surface (radius rfun(y) about game y): an ellipse th_w (radians) by y_h (m)
    centred at angle th0 (0 = the front, +z) and height y0, lifted off the surface; its edge tucks into the surface"""
    t = Tmp()
    def P(u, v, lf):
        th = th0 + u * th_w; y = y0 + v * y_h; r = rfun(y) + lf
        return F.W((r * math.sin(th), y, r * math.cos(th)))
    cen = t.vert(P(0, 0, lift))
    R = []
    for j in range(1, rings + 1):
        s = j / rings
        R.append([t.vert(P(s * math.cos(TAU * k / seg), s * math.sin(TAU * k / seg), lift)) for k in range(seg)])
    R.append([t.vert(P(math.cos(TAU * k / seg), math.sin(TAU * k / seg), -0.004)) for k in range(seg)])
    def hint(ids):
        P0 = sum((t.v[i] for i in ids), Vector()) / len(ids); c = F.W((0, P0.z, 0))
        return P0 - Vector((c.x, c.y, P0.z))
    for k in range(seg):
        k1 = (k + 1) % seg
        t.face([cen, R[0][k], R[0][k1]], hint([cen, R[0][k], R[0][k1]]))
        for j in range(len(R) - 1):
            q = [R[j][k], R[j + 1][k], R[j + 1][k1], R[j][k1]]
            t.face(q, hint(q))
    t.open = True
    return t

def on_lathe(rfun, th, y, lift=0.0):
    r = rfun(y) + lift
    return (r * math.sin(th), y, r * math.cos(th))

def prof_r(prof):
    """radius at height y along an outer lathe profile [(r, y)] (monotonic in y over the part used)"""
    P = [(r, y) for r, y in prof]
    def f(y):
        for (r0, y0), (r1, y1) in zip(P, P[1:]):
            if min(y0, y1) <= y <= max(y0, y1) and abs(y1 - y0) > 1e-9:
                return r0 + (r1 - r0) * (y - y0) / (y1 - y0)
        return P[-1][0] if y > P[-1][1] else P[0][0]
    return f

def gl_lathe(prof, K, pos=(0, 0, 0), colfn=None, open_=False, rx=0.0, ry=0.0, rz=0.0, rfn=None, sx=1.0, e=2.0):
    """a lathe in the game frame (axis = local y), optionally faceted with colfn(local centroid, normal)"""
    t = lathe(prof, K, th0=PI / K, rfn=rfn, sx=sx, e=e)
    if colfn: t = facet(t, colfn, open_=open_)
    return t.xform(F.m @ lm(pos, ry, rx, rz))


# ================================================================== furn-light helpers
def GL(t, col, tag, tint=0.6, flick=0.5):
    """a glowing part: the kit glow shader reads uv.x as the candle flicker and uv.y as the vertex-colour tint (the glTF
    exporter flips v, so Blender v = 1 - tint)"""
    return add(t, col, tag, 'glow', uvf=lambda p, f=flick, k=tint: (f, 1.0 - k))
def CL(t, col, tag):
    """pinned cloth: v = 0 -> glTF uv.y = 1, the cloth wind's attached edge, so it never sways"""
    return add(t, col, tag, 'cloth', uvf=lambda p: (0.0, 0.0))

def ang_diff(a, b): return math.atan2(math.sin(a - b), math.cos(a - b))
def ga(c):
    """the game angle (0 = the front, +x = pi / 2) of a point in a lathe's local (Blender) frame"""
    return math.atan2(c.x, -c.y)

def hring(r, y, n, a0=0.0, cx=0.0, cz=0.0):
    """a horizontal ring of points (game frame), angle 0 at the front (+z)"""
    return [(cx + r * math.sin(a0 + TAU * k / n), y, cz + r * math.cos(a0 + TAU * k / n)) for k in range(n)]
def hloop(r, y, rad, n=16, K=4, cx=0.0, cz=0.0):
    return gloop(hring(r, y, n, 0.0, cx, cz), rad, K=K)
def vloop(cx, cy, cz, r, rad, n=16, K=4):
    """a ring standing in the local x-y plane (facing the local front)"""
    return gloop([(cx + r * math.cos(TAU * k / n), cy + r * math.sin(TAU * k / n), cz) for k in range(n)], rad, K=K, up=F.N((0, 0, 1)))

def on_profile(P, t):
    """a point (r, y) and its outward normal (nr, ny) at arc fraction t along a profile polyline"""
    L = [0.0]
    for a, b in zip(P, P[1:]): L.append(L[-1] + math.hypot(b[0] - a[0], b[1] - a[1]))
    d = t * L[-1]
    for i in range(len(P) - 1):
        if L[i + 1] >= d or i == len(P) - 2:
            u = (d - L[i]) / max(1e-9, L[i + 1] - L[i]); a, b = P[i], P[i + 1]
            dr, dy = b[0] - a[0], b[1] - a[1]; l = math.hypot(dr, dy)
            return (a[0] + dr * u, a[1] + dy * u), (dy / l, -dr / l)

def lathe_fns(Rf, a0=0.0, lobe=None):
    """surface point / normal on a lathe of radius Rf(y) (game frame): x = arc length from the angle a0"""
    def S0(x, y):
        r = Rf(y); a = a0 + x / max(r, 1e-4); R = r * (lobe(a) if lobe else 1.0)
        return Vector((R * math.sin(a), y, R * math.cos(a)))
    def N(x, y):
        e = 0.002
        n = (S0(x + e, y) - S0(x - e, y)).cross(S0(x, y + e) - S0(x, y - e))
        if n.length < 1e-12: return Vector((0, 0, 1))
        n.normalize(); p = S0(x, y)
        return n if n.x * p.x + n.z * p.z >= 0 else -n
    def S(x, y, lift=0.0): return S0(x, y) + N(x, y) * lift
    return S, N

def _put(t, q):
    P = [t.v[k] for k in q]; nn = Vector((0, 0, 0))
    for k in range(1, len(P) - 1): nn += (P[k] - P[0]).cross(P[k + 1] - P[0])
    if nn.length < 1e-14: return
    hint = sum((t.n[k] for k in q), Vector())
    if nn.dot(hint) < 0: q = q[::-1]
    t.f.append(list(q))

def strip_decal(S, N, xs, lo, up, ny, lift, colfn):
    """a decal on a surface: columns at xs, rows from lo(x) to up(x); colfn(x, v) -> colour (v 0..1 bottom..top)"""
    t = Tmp(); t.c = []; t.done = True; ids = []
    for x in xs:
        cid = []
        for j in range(ny + 1):
            v = j / ny; y = lo(x) + (up(x) - lo(x)) * v; n = N(x, y)
            cid.append(t.vert(F.W(S(x, y) + n * lift), F.N(n))); t.c.append(srgb(colfn(x, v)))
        ids.append(cid)
    for i in range(len(xs) - 1):
        for j in range(ny): _put(t, [ids[i][j], ids[i + 1][j], ids[i + 1][j + 1], ids[i][j + 1]])
    return t

def poly_decal(S, N, poly, lift, colfn, centre=None, rings=1):
    """a star-shaped outline [(x, y)] (surface coords) as a fan decal; colfn(s) -> colour, s = 0 centre .. 1 edge"""
    t = Tmp(); t.c = []; t.done = True
    cx, cy = centre or (sum(p[0] for p in poly) / len(poly), sum(p[1] for p in poly) / len(poly))
    def V(x, y, s):
        n = N(x, y); i = t.vert(F.W(S(x, y) + n * lift), F.N(n)); t.c.append(srgb(colfn(s))); return i
    c0 = V(cx, cy, 0.0)
    R = [[V(cx + (x - cx) * (j / rings), cy + (y - cy) * (j / rings), j / rings) for x, y in poly] for j in range(1, rings + 1)]
    n = len(poly)
    for k in range(n):
        k1 = (k + 1) % n
        _put(t, [c0, R[0][k], R[0][k1]])
        for j in range(rings - 1): _put(t, [R[j][k], R[j + 1][k], R[j + 1][k1], R[j][k1]])
    return t

def ribbon_decal(S, N, pts, wfn, lift, colfn):
    """a painted stroke on a surface: a strip along pts [(x, y)], width wfn(t); colfn(t) -> colour"""
    t = Tmp(); t.c = []; t.done = True; n = len(pts); L = []
    for i in range(n):
        a = pts[max(0, i - 1)]; b = pts[min(n - 1, i + 1)]
        dx, dy = b[0] - a[0], b[1] - a[1]; l = math.hypot(dx, dy) or 1.0
        px, py = -dy / l, dx / l; w = wfn(i / (n - 1)) / 2; row = []
        for s in (-1, 1):
            x, y = pts[i][0] + px * w * s, pts[i][1] + py * w * s; nn = N(x, y)
            row.append(t.vert(F.W(S(x, y) + nn * lift), F.N(nn))); t.c.append(srgb(colfn(i / (n - 1))))
        L.append(row)
    for i in range(n - 1): _put(t, [L[i][0], L[i + 1][0], L[i + 1][1], L[i][1]])
    return t

def dab(c, n, r, fl=0.3, K=6, J=2):
    """a flattened blob (a spot, a stud) sitting on a surface at c with normal n (game-local)"""
    t = ellipsoid(Vector((0, 0, 0)), (r, r, r * fl), K=K, J=J)
    q = Z.rotation_difference(F.N(n))
    return t.xform(Matrix.Translation(F.W(c)) @ q.to_matrix().to_4x4() @ Matrix.Scale(F.m.to_scale().x, 4))

def dome(c, n, up, rx, ry, h, K=12, J=3, off=0.0):
    """an ellipsoid on a surface frame: rx along the tangent, ry along `up`, h along the normal n"""
    Nw = F.N(n); Uw = F.N(up); Uw = (Uw - Nw * Uw.dot(Nw)).normalized(); Tw = Uw.cross(Nw)
    M = Matrix((Tw, Uw, Nw)).transposed().to_4x4(); M.translation = F.W(c) + Nw * off
    return ellipsoid(Vector((0, 0, 0)), (rx, ry, h), K=K, J=J).xform(M)

def cord(x, z, ytop, ybot, r, c1, c2, tag='cord'):
    """a two-ply twisted cord hanging straight down (helix stripes of c1 / c2)"""
    n = max(2, int(round((ytop - ybot) / 0.015)))
    t = gtube([(x, ytop - (ytop - ybot) * i / n, z) for i in range(n + 1)], r, K=6)
    b = F.W((x, 0, z))
    t = facet(t, lambda c, fn: c1 if (math.floor(c.z / 0.011 + math.atan2(c.y - b.y, c.x - b.x) / PI * 2) % 2) else c2)
    return add(t, fsh(0.12, 0.2), tag)

def ceiling_rose(top, wood='#b8804e', c1='#e8403a', c2='#fff6ea', metal=GOLD):
    """a turned plate under the ceiling (its top at y = top), a screw eye, the cord looped through and knotted;
    returns the height where the cord carries on down"""
    prof = [(0.0, top - 0.05), (0.022, top - 0.047), (0.034, top - 0.036), (0.041, top - 0.03), (0.053, top - 0.026), (0.058, top - 0.013),
            (0.054, top - 0.003), (0.0, top)]
    wl = mix(wood, '#ffe6c0', 0.3); wd = mul(wood, 0.62)
    def wc(p, n):
        c = mix(wood, wl, clamp(math.hypot(n.x, n.y) - 0.5) * 0.6)
        if n.z < -0.5: c = mul(c, 0.84)
        if top - 0.031 < p.z < top - 0.027: c = wd
        return c
    add(gl_lathe(prof, 16), wc, 'rose')
    add(hloop(0.0565, top - 0.017, 0.0045, n=16, K=3), lac(metal), 'rose')
    yE = top - 0.07; yK = top - 0.106
    add(cyl(0.005, 0.005, 0.014, (0, top - 0.057, 0), K=6), lac(metal), 'rose')
    add(vloop(0, yE, 0, 0.012, 0.0048, n=10, K=3), lac(metal), 'rose')
    for s in (-1, 1):
        add(gtube([(s * 0.004, yE - 0.011, 0), (s * 0.009, yE - 0.024, s * 0.002), (s * 0.005, yK + 0.007, 0)], 0.0052, K=5), soft(c1), 'rose')
    add(sph(0.0135, (0, yK, 0), sc=(1.15, 0.85, 1.05), K=8, J=3), soft(c1, 0.2, 0.3), 'rose')
    add(gloop([(0.0112 * math.cos(TAU * k / 10), yK + 0.002 + 0.004 * math.sin(TAU * k / 10), 0.0112 * math.sin(TAU * k / 10)) for k in range(10)], 0.005, K=3), soft(c2), 'rose')
    add(gtube([(0.006, yK - 0.004, 0.006), (0.013, yK - 0.018, 0.01), (0.015, yK - 0.033, 0.012)], lambda s: 0.0052 - s * 0.0012, K=5), soft(c1), 'rose')
    return yK - 0.006

def tassel(yb, c1, c2, collar=GOLD, s=1.0, tag='tassel'):
    """a fringe tassel (alternating strands) with its tip at y = yb, a collar and a bead above; returns its top"""
    prof = [(0.0, 0.0), (0.024 * s, 0.004 * s), (0.026 * s, 0.016 * s), (0.02 * s, 0.042 * s), (0.012 * s, 0.07 * s), (0.0, 0.075 * s)]
    add(gl_lathe(prof, 12, pos=(0, yb, 0), colfn=lambda c, fn: c1 if angle_k(c, 12, PI / 12) % 2 else c2), fsh(0.12, 0.22), tag)
    add(cyl(0.015 * s, 0.015 * s, 0.016 * s, (0, yb + 0.064 * s, 0), K=10), lac(collar), tag)
    add(sph(0.016 * s, (0, yb + 0.084 * s, 0), K=8, J=4), lac(collar), tag)
    return yb + 0.098 * s

def ribbed_lathe(Rf, ylo, yhi, ribs, pole_lo, pole_hi, colfn, K=20, b=0.0045, bump=0.0035, mids=1, pos=(0, 0, 0)):
    """a paper lantern skin: the paper between raised bamboo rib bands, faceted so the ribs read crisp.
    colfn(c, fn, rib) gets the local centroid (lathe frame: c.z = height, ga(c) the game angle)"""
    ys = [ylo]
    for yk in ribs:
        prev = ys[-1]
        for m in range(1, mids + 1): ys.append(prev + (yk - b - prev) * m / (mids + 1))
        ys += [yk - b, yk + b]
    prev = ys[-1]
    for m in range(1, mids + 1): ys.append(prev + (yhi - prev) * m / (mids + 1))
    ys.append(yhi)
    def on_rib(y): return any(abs(y - yk) <= b + 1e-6 for yk in ribs)
    prof = [(0.0, pole_lo)] + [(Rf(y) + (bump if on_rib(y) else 0.0), y) for y in ys] + [(0.0, pole_hi)]
    return gl_lathe(prof, K, pos=pos, colfn=lambda c, fn: colfn(c, fn, any(abs(c.z - yk) < b * 0.9 for yk in ribs)))

def split_shell(t, pred):
    """split one closed shell by a face predicate on the centroid (keeps its orientation and smooth normals);
    returns (faces where pred, the rest)"""
    t.orient(); t.normals(); outs = []
    for want in (True, False):
        o = Tmp(); o.done = True; m = {}
        for f in t.f:
            P = [t.v[i] for i in f]; cen = sum(P, Vector()) / len(P)
            if bool(pred(cen)) != want: continue
            ids = []
            for i in f:
                if i not in m: m[i] = o.vert(t.v[i], t.n[i])
                ids.append(m[i])
            o.f.append(ids)
        outs.append(o)
    return outs

def frame_ring(O, I, y0, y1, bev):
    """a raised border between an outer and an inner loop of matching point counts (game (x, y, z) loops): an inner
    wall, a bevelled flat top, an outer wall, closed underneath"""
    def lerp(f, y): return [F.W((i[0] + (o[0] - i[0]) * f, y, i[2] + (o[2] - i[2]) * f)) for o, i in zip(O, I)]
    wdt = sum(math.hypot(o[0] - i[0], o[2] - i[2]) for o, i in zip(O, I)) / len(O)
    bf = clamp(bev / max(wdt, 1e-6), 0.02, 0.45)
    rings = [lerp(0.0, y0), lerp(0.0, y1 - bev), lerp(bf, y1), lerp(1 - bf, y1), lerp(1.0, y1 - bev), lerp(1.0, y0)]
    cs = [F.W((0, y0, 0)), F.W((0, y1, 0)), F.W((0, y1, 0)), F.W((0, y1, 0)), F.W((0, y1, 0)), F.W((0, y0, 0))]
    t = Tmp(); ring_surface(t, rings, cs, closed=True)
    return t

def pyramid_dash(t, a, b, w, hgt, base_y):
    """one raised running stitch from a to b (game x-z), w wide, its ridge hgt proud: 4 tris into shell t"""
    ax, az = a; bx, bz = b; mx, mz = (ax + bx) / 2, (az + bz) / 2
    dx, dz = bx - ax, bz - az; l = math.hypot(dx, dz) or 1.0; px, pz = -dz / l * w / 2, dx / l * w / 2
    P = [t.vert(F.W((ax, base_y(ax, az), az))), t.vert(F.W((mx + px, base_y(mx + px, mz + pz), mz + pz))),
         t.vert(F.W((bx, base_y(bx, bz), bz))), t.vert(F.W((mx - px, base_y(mx - px, mz - pz), mz - pz)))]
    c = t.vert(F.W((mx, base_y(mx, mz) + hgt, mz)))
    for k in range(4): t.face([c, P[k], P[(k + 1) % 4]], Z)

def stitch_run(t, path, base_y, dash, gap, w, hgt=0.0028, skip=None):
    """dashes walked along a polyline of (x, z) points"""
    L = [0.0]
    for p, q in zip(path, path[1:]): L.append(L[-1] + math.hypot(q[0] - p[0], q[1] - p[1]))
    def at_(d):
        for i in range(len(path) - 1):
            if L[i + 1] >= d:
                u = (d - L[i]) / max(1e-9, L[i + 1] - L[i]); p, q = path[i], path[i + 1]
                return (p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u)
        return path[-1]
    d = gap * 0.5
    while d + dash <= L[-1] + 1e-6:
        a, b = at_(d), at_(d + dash)
        m = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
        if not (skip and skip(*m)): pyramid_dash(t, a, b, w, hgt, base_y)
        d += dash + gap

# ================================================================== Andon Lamp (floor, 0.5 x 0.5, h 0.86)
def build_andonLamp():
    new_asset()
    WD = '#7a4e36'; WL = '#9a6a48'; s = 0.17
    wd = wood(WD, ao_z=0.0); wl = wood(WL, ao_z=0.0)
    for sx in (-1, 1):
        for sz in (-1, 1):
            add(beam(0.056, 0.81, 0.056, (sx * s, 0.425, sz * s), c=0.013), wd, 'posts')
            add(rb(0.07, 0.034, 0.07, (sx * s, 0.017, sz * s), r=0.013), wood(mul(WD, 0.82)), 'feet')
    add(rb(0.4, 0.035, 0.4, (0, 0.1375, 0), r=0.013), wl, 'shelf')
    # the paper: a soft box, a warm heart fading to a creamier rim near the rails
    def paper(p, n):
        dz = abs(p.z - 0.5) / 0.28
        return mix('#fff8e8', '#f6dcae', smooth(0.25, 1.0, dz) * 0.85)
    GL(box(0.3, 0.56, 0.3, (0, 0.5, 0), r=0.02, extra=(2, 2, 3)), paper, 'paper', tint=0.3, flick=0.6)
    for k in range(4):
        with at((0, 0, 0), ry=k * PI / 2):
            for y, hh in ((0.205, 0.036), (0.5, 0.026), (0.783, 0.036)):
                add(rb(0.3, hh, 0.026, (0, y, 0.163), r=0.008), wd, 'rails')
            add(rb(0.026, 0.27, 0.022, (0, 0.355, 0.161), r=0.007), wd, 'rails')
            if k < 2:   # the little moon windows on the front and the right face
                add(vloop(0, 0.645, 0.164, 0.077, 0.0125, n=18, K=5), wd, 'moon')
                GL(sph(0.072, (0, 0.645, 0.151), sc=(1, 1, 0.085), K=16, J=2),
                   lambda p, n: '#ffeaa4', 'moon', tint=0.7, flick=0.5)
            else:
                add(rb(0.026, 0.26, 0.022, (0, 0.645, 0.161), r=0.007), wd, 'rails')
    add(rb(0.42, 0.034, 0.42, (0, 0.837, 0), r=0.013), wl, 'top')
    for sx in (-1, 1):
        for sz in (-1, 1):
            add(sph(0.014, (sx * 0.185, 0.856, sz * 0.185), sc=(1, 0.5, 1), K=6, J=2), lac(GOLD), 'studs')
    hp = [(0.085 * math.cos(PI * i / 10), 0.852 + 0.052 * math.sin(PI * i / 10), 0) for i in range(11)]
    add(gtube(hp, 0.0135, K=6, up=Y), wd, 'handle')
    for sx in (-1, 1): add(sph(0.022, (sx * 0.085, 0.858, 0), sc=(1, 0.8, 1), K=8, J=4), lac(GOLD), 'handle')
    return 'floor'

# ================================================================== Paper Pendant (ceiling, 0.5 x 0.5, h 0.7)
def build_paperPendant():
    new_asset()
    top = 0.7; R = 0.185; y0 = 0.1; H = 0.36
    def Rf(y):
        t = clamp((y - y0) / H); return max(0.046, R * 2 * math.sqrt(max(0.0, t * (1 - t))))
    ribs = [y0 + H * (0.5 - 0.5 * math.cos(k / 9 * PI)) for k in range(1, 9)]
    def pc(c, fn, rib):
        if rib: return '#d8b48a'
        t = (c.z - y0) / H
        if abs(t - 0.5) < 0.07: return '#ffd2dc'
        if t < 0.12 or t > 0.88: return '#ffc8d6'
        return mix('#fff6e4', '#ffeed8', abs(t - 0.5) * 2)
    GL(ribbed_lathe(Rf, y0, y0 + H, ribs, y0 + 0.012, y0 + H - 0.012, pc, K=24, mids=1), fsh(0.06, 0.1), 'paper', tint=0.3, flick=0.3)
    WC = '#b8804e'
    add(gl_lathe([(0.0, y0 - 0.026), (0.05, y0 - 0.026), (0.062, y0 - 0.012), (0.06, y0 + 0.01), (0.044, y0 + 0.02), (0.0, y0 + 0.02)], 14), wood(WC), 'caps')
    add(gl_lathe([(0.0, y0 + H - 0.02), (0.052, y0 + H - 0.02), (0.068, y0 + H - 0.004), (0.072, y0 + H + 0.012), (0.054, y0 + H + 0.032),
                  (0.022, y0 + H + 0.046), (0.0, y0 + H + 0.05)], 14), wood(WC), 'caps')
    add(hloop(0.063, y0 - 0.006, 0.005, 16, 3), lac(GOLD), 'caps')
    add(hloop(0.073, y0 + H + 0.008, 0.005, 16, 3), lac(GOLD), 'caps')
    tt = tassel(0.0, '#ff9eb8', '#ffbccf', GOLD, s=0.78)
    add(cyl(0.0052, 0.0052, y0 - 0.02 - tt, (0, (tt + y0 - 0.02) / 2, 0), K=6), soft('#e8708a'), 'tassel')
    yK = ceiling_rose(top, wood='#c08850', c1='#dcbc80', c2='#b08a54')
    cord(0, 0, yK, y0 + H + 0.044, 0.0052, '#dcbc80', '#b8925c')
    return 'ceiling'

# ================================================================== Mushroom Lamp (table, 0.5 x 0.5, h 0.38)
SPOTS = [(0.45, 0.2), (0.5, 1.4), (0.42, 2.6), (0.55, 3.7), (0.48, 4.9), (0.72, 0.8), (0.7, 2.0), (0.75, 3.2), (0.68, 4.3), (0.74, 5.6), (0.92, 1.5)]
def toadstool(s, cap, nsp, pos, ry=0.0, big=True, spot_k=1.0):
    with at(pos, ry=ry, s=s):
        sp = [(0.0, 0.0), (0.06, 0.0), (0.066, 0.022), (0.058, 0.08), (0.05, 0.14), (0.046, 0.185), (0.0, 0.185)]
        GL(gl_lathe(sp, 10 if big else 8), lambda p, n: mul(mix('#fff3e0', '#ffe4cc', 0.3), 0.94 + 0.08 * clamp(n.z + 0.5)), 'stem', tint=0.35, flick=0.15)
        cp = [(0.0, 0.168), (0.07, 0.174), (0.14, 0.186), (0.165, 0.204), (0.168, 0.222), (0.155, 0.257), (0.12, 0.297), (0.07, 0.324), (0.0, 0.334)]
        cap1 = mix(cap, '#ffd8c0', 0.4); z0 = F.W((0, 0, 0)).z; S = F.m.to_scale().x
        def cc(p, n):
            y = (p.z - z0) / S
            if y < 0.205 and n.z < 0.3: return mix('#ffe6d8', '#f2c4b4', clamp(-n.z))
            return mix(mul(cap, 0.94), cap1, smooth(0.2, 0.33, y))
        GL(gl_lathe(cp, 20 if big else 12), cc, 'cap', tint=0.85, flick=0.15)
        P = cp[4:]
        for (t, a) in SPOTS[:nsp]:
            (r, y), (nr, ny) = on_profile(P, t)
            GL(dab((r * math.sin(a), y, r * math.cos(a)), (nr * math.sin(a), ny, nr * math.cos(a)), (0.019 + 0.006 * math.sin(a * 3)) * spot_k,
                   fl=0.32, K=6 if big else 5), lambda p, n: '#fffaf2', 'spots', tint=0.35, flick=0.15)

def build_mushroomLamp():
    new_asset()
    bp = [(0.0, 0.0), (0.115, 0.0), (0.122, 0.012), (0.116, 0.027), (0.1, 0.031), (0.08, 0.031), (0.06, 0.031), (0.04, 0.031), (0.02, 0.031), (0.0, 0.031)]
    def slice_col(c, fn):
        r = math.hypot(c.x, c.y)
        if fn.z > 0.8:
            if r > 0.095: return '#f6d8a6'
            return '#f0cc98' if int(r / 0.02) % 2 == 0 else '#dcae78'
        return '#8a5e44' if angle_k(c, 18, PI / 18) % 2 else '#74503a'
    add(gl_lathe(bp, 18, colfn=slice_col), fsh(0.12, 0.25), 'base')
    toadstool(1.03, '#ff6a64', 11, (-0.015, 0.03, -0.01))
    toadstool(0.42, '#ff9a6a', 5, (0.082, 0.03, 0.058), ry=0.6, big=False, spot_k=1.35)
    for (x, z, sd) in ((0.07, -0.06, 1), (-0.085, 0.045, 2)):
        add(blob(F.W((x, 0.029, z)), 0.024, 0.014, lobes=5, K=10, seed=sd, amp=0.2), paint('#6aaa4c', top=0.3, bot=0.3, hi='#9ad070'), 'moss')
    for (a, x, z) in ((0.3, -0.09, 0.07), (2.8, 0.1, -0.02), (4.4, -0.06, -0.075)):
        for k in range(3):
            add(cyl(0.0008, 0.0085, 0.05 + 0.012 * (k % 2), (x + 0.008 * math.cos(a + k * 2.1), 0.054 + 0.006 * (k % 2), z + 0.008 * math.sin(a + k * 2.1)),
                    K=4, rz=(k - 1) * 0.4, ry=a + k), paint('#62b04e', top=0.3, bot=0.3, hi='#a8dc78'), 'grass', 'leaf')
    return 'table'

# ================================================================== Bamboo Lantern (floor, 0.5 x 0.5, h 1)
def leaf_ol(L, W, rot, n=12):
    out = []
    for i in range(n):
        th = TAU * i / n; sn = math.sin(th)
        x = 0.5 * W * sn * abs(sn) ** 0.35; y = 0.5 * L * math.cos(th)
        out.append((x * math.cos(rot) - y * math.sin(rot), x * math.sin(rot) + y * math.cos(rot)))
    return out

def build_bambooLantern():
    new_asset()
    def plinth(p, n):
        c = mix('#8a5a3a', '#c39064', clamp(n.z) ** 2)
        return mul(c, 0.86 + 0.14 * smooth(0.0, 0.04, p.z))
    add(gl_lathe([(0.0, 0.0), (0.18, 0.0), (0.19, 0.02), (0.182, 0.048), (0.15, 0.06), (0.12, 0.064), (0.0, 0.064)], 20), plinth, 'plinth')
    for (x, z, c) in ((0.15, 0.06, '#d8d0c8'), (-0.13, 0.09, '#c8c0cc'), (0.11, -0.12, '#e0d8cc'), (-0.06, 0.15, '#cfc6c0')):
        add(sph(0.022, (x, 0.066, z), sc=(1.2, 0.55, 1.0), K=6, J=3), soft(c, 0.25, 0.3), 'pebbles')
    R = 0.105
    prof = [(0.0, 0.045), (R, 0.06), (R, 0.2), (R, 0.33), (R * 1.1, 0.35), (R, 0.37), (R, 0.52), (R, 0.66), (R * 1.1, 0.68), (R, 0.70), (R, 0.85),
            (R, 0.96), (R - 0.006, 0.968), (R - 0.012, 0.96), (R - 0.012, 0.5), (R - 0.012, 0.12), (0.0, 0.12)]
    t = lathe(prof, 20, th0=-PI / 2)
    t.v = [Vector((v.x, v.y, v.z - 0.06 + 0.06 * v.y / R)) if v.z > 0.94 else v for v in t.v]     # the slanted cut, low at the front
    inner, outer = split_shell(t, lambda c: math.hypot(c.x, c.y) < R - 0.0105)
    def bam(p, n):
        r = math.hypot(p.x, p.y); a = math.atan2(p.x, -p.y)
        c = mul('#80c060', 0.9 + 0.14 * clamp(n.x * 0.5 + 0.5))
        c = mix(c, '#a2d474', 0.45 * vnoise(Vector((a * 2.5, 0.0, p.z * 1.2)), 2.0, 4))
        if r > R * 1.04: c = '#5f9e4a'
        if n.z > 0.5 and p.z > 0.8: c = '#e8f0b0'
        return mul(c, 0.86 + 0.14 * smooth(0.06, 0.2, p.z))
    add(outer, bam, 'tube')
    GL(inner, lambda p, n: mix('#ffe6a0', '#fff4cc', smooth(0.2, 0.8, p.z)), 'inside', tint=0.5, flick=0.6)
    lip = []
    for k in range(24):
        a = TAU * k / 24; rr = R - 0.006
        lip.append((rr * math.sin(a), 0.908 - 0.06 * math.cos(a) * rr / R, rr * math.cos(a)))
    add(gloop(lip, 0.0095, K=5), paint('#d8eca0', top=0.2, bot=0.3), 'lip')
    for y in (0.35, 0.68): add(hloop(R * 1.08, y, 0.011, n=22, K=4), paint('#4f8a3c', top=0.2, bot=0.3), 'nodes')
    # little leaf-shaped windows, carved: a dark rim round a glowing heart
    wins = [(-0.5, 0.22, 0.4), (0.2, 0.27, -0.5), (0.9, 0.21, 0.9), (1.6, 0.26, -0.3), (2.3, 0.23, 0.6), (-0.2, 0.47, -0.7), (0.5, 0.52, 0.3),
            (1.2, 0.45, -0.9), (1.9, 0.5, 0.2), (-0.9, 0.5, 0.8), (0.12, 0.785, 0.5), (0.8, 0.8, -0.4), (1.5, 0.79, 0.7), (-0.6, 0.79, -0.2), (2.4, 0.8, -0.6),
            (-1.6, 0.25, 0.2), (-2.4, 0.5, -0.4), (-1.5, 0.81, 0.4)]
    for (a, y, rot) in wins:
        S, N = lathe_fns(lambda yy: R, a)
        add(poly_decal(S, N, [(x, y + v) for x, v in leaf_ol(0.076, 0.038, rot)], 0.0016, lambda s: mix('#3e6e2c', '#4f8038', s)), None, 'windows')
        GL(poly_decal(S, N, [(x, y + v) for x, v in leaf_ol(0.06, 0.026, rot)], 0.003, lambda s: mix('#fff6c8', '#ffd878', s ** 1.5), rings=2), None, 'windows', tint=0.5, flick=0.6)
    for (a, y) in ((0.55, 0.3), (-0.15, 0.6), (1.25, 0.6), (0.45, 0.735 + 0.04), (1.8, 0.3), (-1.1, 0.29), (2.0, 0.76)):
        S, N = lathe_fns(lambda yy: R, a)
        GL(poly_decal(S, N, [(0.012 * math.cos(TAU * k / 8), y + 0.012 * math.sin(TAU * k / 8)) for k in range(8)], 0.003, lambda s: '#fff0b8'), None, 'windows', tint=0.5, flick=0.6)
    # a red cord tied round the upper section, a tassel and a bamboo sprig at the knot
    yc = 0.725
    add(hloop(R + 0.007, yc, 0.0075, n=18, K=4), lac('#e8403a'), 'cord')
    add(sph(0.016, (0, yc, R + 0.014), K=7, J=4), lac('#e8403a'), 'cord')
    add(gtube([(0, yc - 0.006, R + 0.02), (0, yc - 0.02, R + 0.04), (0, yc - 0.03, 0.148)], 0.005, K=5), lac('#e8403a'), 'cord')
    with at((0, 0, 0.148)): tassel(yc - 0.112, '#e8403a', '#ff6a5a', GOLD, s=1.0)
    for (sx, rz, ry) in ((-1, 0.75, -0.25), (1, -0.95, 0.3), (-1, 1.25, 0.6)):
        add(sph(1.0, (sx * 0.035, yc + 0.03, R + 0.022), sc=(0.017, 0.062, 0.006), K=6, J=3, rz=rz, ry=ry), paint('#6ab854', top=0.25, bot=0.3, hi='#a8dc78'), 'sprig', 'leaf')
    return 'floor'

# ================================================================== Pumpkin Lamp (floor, 0.5 x 0.5, h 0.5)
NL = 9
def lobe(a): return 1 - 0.075 * (1 - abs(math.cos(NL * a / 2))) ** 2.2
def build_pumpkinLamp():
    new_asset()
    raw = [(0.001, 0.024), (0.06, 0.004), (0.12, 0.012), (0.165, 0.045), (0.192, 0.095), (0.202, 0.15), (0.196, 0.205), (0.172, 0.255), (0.128, 0.292), (0.07, 0.31), (0.03, 0.312), (0.001, 0.298)]
    sp = catmull(raw, 14)
    prof = [(0.0, 0.024)] + [(max(0.004, p[0]), p[1]) for p in sp[1:-1]] + [(0.0, 0.298)]
    t = lathe(prof, 54, th0=-PI / 2, rfn=lambda r, z, th: r * lobe(math.atan2(math.cos(th), -math.sin(th))))
    def pk(p, n):
        a = math.atan2(p.x, -p.y); u = abs(math.cos(NL * a / 2))
        c = mix('#f0862a', '#ffb454', clamp(n.z * 0.7 + 0.1) * 0.55)
        c = mix(c, '#c4561a', clamp(0.35 - u) * 1.6)
        c = mix(c, '#b8541c', clamp(-n.z - 0.3) * 0.5)
        return mul(c, 0.96 + 0.05 * math.sin(a * NL * 3 + p.z * 30))
    add(t, pk, 'pumpkin')
    r0 = prof_r(sp)
    S, N = lathe_fns(r0, 0.0, lobe)
    def heart(x0, x1):
        def f(x, v):
            e = min(min(v, 1 - v) * 2, clamp(min(x - x0, x1 - x) / (0.3 * (x1 - x0))))
            return mix('#d8480e', '#ffe070', smooth(0.05, 0.9, e))
        return f
    def carve(xs, lo, up, ny=3, rim=0.0045):
        x0, x1 = xs[0], xs[-1]
        cl = lambda x: min(x1, max(x0, x))
        xr = [x0 - rim] + xs + [x1 + rim]
        add(strip_decal(S, N, xr, lambda x: lo(cl(x)) - rim, lambda x: up(cl(x)) + rim * 1.8, ny, 0.0018, lambda x, v: '#ffc678'), fsh(0.1, 0.2), 'face')
        GL(strip_decal(S, N, xs, lo, up, ny + 1, 0.0034, heart(x0, x1)), None, 'face', tint=1.0, flick=1.0)
    lin_ = lambda a, b, n: [a + (b - a) * i / (n - 1) for i in range(n)]
    for sx in (-1, 1):                                   # eyes: rounded triangles, a touch tilted so the face smiles
        cx = sx * 0.066
        q = lambda x, cx=cx: abs(x - cx) / 0.037
        carve(lin_(cx - 0.037, cx + 0.037, 7), lambda x, q=q, cx=cx: 0.205 + 0.008 * q(x) ** 2,
              lambda x, q=q: 0.272 - 0.058 * q(x) ** 1.15)
    qn = lambda x: abs(x) / 0.019
    carve(lin_(-0.019, 0.019, 5), lambda x: 0.163 + 0.004 * qn(x) ** 2, lambda x: 0.188 - 0.021 * qn(x) ** 1.1, ny=2)
    w = 0.122; tw = 0.0145
    base_xs = lin_(-w, w, 17)
    for tx in (-0.042, 0.042):
        base_xs += [tx - tw - 0.0007, tx - tw + 0.0007, tx + tw - 0.0007, tx + tw + 0.0007]
    xs = sorted(base_xs)
    lo = lambda x: 0.15 - 0.072 * (1 - (x / w) ** 2)
    def up(x):
        y = 0.15 - 0.017 * (1 - (x / w) ** 2)
        if any(abs(x - tx) < tw for tx in (-0.042, 0.042)): y -= 0.021
        return y
    carve(xs, lo, up, ny=3)
    # the lid seam: a zigzag cut ring round the stem
    zz = []
    for k in range(36):
        a = TAU * k / 36; y = 0.284 + (0.007 if k % 2 else -0.007); r = r0(y) * lobe(a) + 0.0015
        zz.append((r * math.sin(a), y, r * math.cos(a)))
    add(gloop(zz, 0.0036, K=3), flat('#a8441a'), 'seam')
    # a chunky ridged stem bending over, a curly vine and a broad leaf
    st = lathe([(0.0, 0.0), (0.036, 0.0), (0.032, 0.02), (0.025, 0.05), (0.022, 0.08), (0.027, 0.094), (0.0, 0.096)], 10,
               rfn=lambda r, z, th: r * (1 + 0.14 * math.cos(5 * th)), off=lambda z: (0.32 * z * z, 0.0))
    st.xform(F.m @ lm((0, 0.286, 0)))
    def stc(p, n):
        y = p.z - 0.286
        c = mix('#6a8a3a', '#a8844a', clamp((y - 0.02) / 0.06))
        if n.z > 0.75 and y > 0.085: c = '#d8c890'
        return mul(c, 0.9 + 0.12 * clamp(n.x * 0.5 + 0.5))
    add(st, stc, 'stem')
    vine = [(0.015, 0.3, 0.005)]
    for i in range(17):
        tt = i / 16; a = tt * 3.4 * PI; r = 0.05 * (1 - 0.68 * tt)
        vine.append((0.035 + math.cos(a) * r, 0.312 + tt * 0.07 + math.sin(tt * PI) * 0.01, 0.03 + math.sin(a) * r))
    add(gtube(vine, lambda s: 0.0068 - s * 0.0024, K=4), paint('#5a9a38', top=0.3, bot=0.3, hi='#9ad064'), 'vine', 'leaf')
    topP = sorted([(p[0], p[1]) for p in sp if p[1] > 0.2], key=lambda q: q[0])
    def top_y(x, z):                                     # the pumpkin's top surface height at a point (outer profile)
        r = math.hypot(x, z)
        for (ra, ya), (rb_, yb_) in zip(topP, topP[1:]):
            if ra <= r <= rb_: return ya + (yb_ - ya) * (r - ra) / max(1e-9, rb_ - ra)
        return topP[0][1] if r < topP[0][0] else topP[-1][1]
    LOBES = [(0, 1.0, 0.75), (1.25, 0.82, 0.65), (-1.25, 0.82, 0.65), (2.4, 0.55, 0.55), (-2.4, 0.55, 0.55)]
    lrot = -1.85; lcx, lcz = -0.022, 0.004
    place = lambda u, v: (lcx + u * math.cos(lrot) + v * math.sin(lrot), lcz + u * math.sin(lrot) - v * math.cos(lrot))
    def lcol(s, x, z):
        u, v = x - lcx, z - lcz; a = math.atan2(u * math.cos(lrot) + v * math.sin(lrot), -(u * math.sin(lrot) - v * math.cos(lrot)))
        vein = min(abs(ang_diff(a, la)) for la, _, _ in LOBES)
        c = mix('#5aa040', '#8cc864', clamp(1 - s) * 0.5)
        if vein < 0.09 and s < 0.95: c = mix(c, '#b8e090', 0.55)
        return mul(c, 1.0 - 0.25 * clamp(s - 1))
    leaf = felt_slab(lambda th: 0.125 * mapleR(th, LOBES, 0.42, 1.6, 0.7), place, 34, 2, 2, 0.006, lambda x, z: top_y(x, z) - 0.001, lcol)
    add(leaf, None, 'leaf', 'leaf')
    # a little cream pumpkin and two fallen maple leaves at its feet
    with at((0.175, 0, 0.17), ry=0.4):
        mp = catmull([(0.001, 0.008), (0.04, 0.0), (0.058, 0.022), (0.06, 0.042), (0.045, 0.064), (0.02, 0.07), (0.001, 0.064)], 9)
        mprof = [(0.0, 0.008)] + [(max(0.004, p[0]), p[1]) for p in mp[1:-1]] + [(0.0, 0.064)]
        m = lathe(mprof, 18, th0=0.0, rfn=lambda r, z, th: r * (1 - 0.09 * (1 - abs(math.cos(3 * th))) ** 2)).xform(F.m @ lm((0, 0, 0)))
        add(m, lambda p, n: mul(mix('#f6e8c8', '#d8c49a', clamp(0.4 - abs(math.cos(3 * math.atan2(p.y - F.W((0, 0, 0)).y, p.x - F.W((0, 0, 0)).x)))) * 1.2), 0.92 + 0.1 * clamp(n.z)), 'mini')
        add(gtube([(0, 0.06, 0), (0.004, 0.08, 0.002), (0.013, 0.09, 0.0)], 0.0065, K=5), soft('#7a8a48'), 'mini')
    for (x, z, c, ry) in ((-0.17, 0.165, '#e2502a', 0.7), (0.2, -0.15, '#f0a030', 2.4)):
        add(fan_shape(MAPLE, (x, 0.004, z), sc=0.068, T=0.004, rx=-PI / 2, rz=ry, Tb=0.002), lambda p, n, c=c: mul(c, 1.0 + 0.08 * n.z), 'fallen')
    return 'floor'

# ================================================================== Festival Chochin (ceiling, 0.5 x 0.5, h 0.7)
def tomoe(S, N, Rt, lift, col, cy=0.0):
    """three tomoe commas (a head disc and a tapering tail each) as decals round (0, 0) of a surface frame"""
    outs = []
    for k in range(3):
        a0 = k * TAU / 3 + 0.4; rh = 0.25 * Rt; rc = 0.36 * Rt
        hx, hy = math.cos(a0) * rc, cy + math.sin(a0) * rc
        outs.append(poly_decal(S, N, [(hx + rh * math.cos(TAU * i / 10), hy + rh * math.sin(TAU * i / 10)) for i in range(10)], lift, lambda s: col))
        pts = []
        for i in range(11):
            t = i / 10; a = a0 - t * 2.25; r = rc + (0.8 * Rt - rc) * math.sqrt(t)
            pts.append((math.cos(a) * r, cy + math.sin(a) * r))
        outs.append(ribbon_decal(S, N, pts, lambda t: 2 * rh * (1 - t) ** 1.15 + 0.003, lift, lambda t: col))
    return outs

def build_festivalLantern():
    new_asset()
    top = 0.7; R = 0.16; H = 0.32; yb = 0.135; mid = yb + H / 2; R0 = R * 0.6
    Rf = lambda y: R * (0.6 + 0.4 * math.sin(clamp((y - yb) / H) * PI))
    ribs = [yb + k / 11 * H for k in range(1, 11)]
    def crest(c): return min(abs(ang_diff(ga(c), 0.0)), abs(ang_diff(ga(c), PI / 2))) * Rf(c.z) < 0.078 and abs(c.z - mid) < 0.078
    def pc(c, fn, rib):
        t = (c.z - yb) / H
        if rib and not crest(c): return '#9a2a22'
        return mix('#ec5a40', '#b8302a', clamp(abs(t - 0.5) * 2.4 - 0.5))
    GL(ribbed_lathe(Rf, yb, yb + H, ribs, yb + 0.02, yb + H - 0.02, pc, K=20, mids=0), fsh(0.06, 0.12), 'paper', tint=0.8, flick=1.0)
    for a0 in (0.0, PI / 2):
        S, N = lathe_fns(Rf, a0)
        GL(poly_decal(S, N, [(0.072 * math.cos(TAU * i / 20), mid + 0.072 * math.sin(TAU * i / 20)) for i in range(20)], 0.0058,
                      lambda s: mix('#fff6e0', '#ffe8c8', s), centre=(0, mid), rings=2), None, 'crest', tint=0.5, flick=1.0)
        for d in tomoe(S, N, 0.062, 0.0072, '#2a1a1e', cy=mid): add(d, None, 'crest')
    # lacquered rims hugging the paper's ends (the bottom one the top one mirrored), gold pin-lines
    yT = yb + H
    rimP = [(Rf(yT - 0.036) - 0.006, yT - 0.036), (Rf(yT - 0.03) + 0.008, yT - 0.03), (Rf(yT - 0.022) + 0.01, yT - 0.021), (R0 + 0.012, yT - 0.008),
            (R0 + 0.011, yT + 0.006), (R0 + 0.004, yT + 0.015), (0.05, yT + 0.02), (0.0, yT + 0.021)]
    def blk(p, n):
        c = mix('#2c1b17', '#7c5a4c', clamp(abs(n.z) - 0.5) * 0.9)
        if abs(n.z) < 0.3: c = mix(c, '#5a3c32', 0.35 * clamp(-n.y * 0.7 + n.x * 0.5))
        return c
    add(gl_lathe(rimP, 16), blk, 'rims')
    add(gl_lathe([(r, 2 * mid - y) for r, y in rimP][::-1], 16), blk, 'rims')
    for y in (yT - 0.026, 2 * mid - (yT - 0.026)): add(hloop(Rf(yT - 0.026) + 0.012, y, 0.004, 20, 3), lac(GOLD), 'rims')
    # a lacquered bail over the lid, gold studs, an iron S-hook, the cord up to a lacquered ceiling rose
    yL = yT + 0.02
    add(gtube([(0.046 * math.cos(PI * i / 8), yL - 0.004 + 0.046 * math.sin(PI * i / 8), 0) for i in range(9)], 0.0055, K=5, up=Y), blk, 'bail')
    for s in (-1, 1): add(sph(0.0095, (s * 0.046, yL, 0), K=6, J=3), lac(GOLD), 'bail')
    yH = yL - 0.004 + 0.046
    add(gtube(catmull([(0, yH - 0.004, 0), (0.009, yH + 0.004, 0.004), (0.005, yH + 0.016, 0.004), (-0.006, yH + 0.022, 0), (0, yH + 0.03, 0)], 7), 0.0045, K=4),
        soft('#4a4450', 0.2, 0.3), 'hook')
    tt = tassel(0.0, '#ff6a5a', '#ff8e76', GOLD)
    cord(0, 0, yb - 0.018, tt - 0.004, 0.0048, '#e8403a', '#ff8a72')
    yK = ceiling_rose(top, wood='#4a2c24', c1='#e8403a', c2='#fff4e8')
    cord(0, 0, yK, yH + 0.026, 0.0052, '#e8403a', '#fff4e8')
    return 'ceiling'

# ================================================================== Yokai Lantern (floor, 0.5 x 0.5, h 1.2)
def build_yokaiLantern():
    new_asset()
    WD = '#6b4a3a'; WDL = '#8a6248'; pz = -0.17
    add(rb(0.4, 0.06, 0.4, (0, 0.03, -0.04), r=0.022), wood(WD, ao_z=0.0), 'stand')
    add(rb(0.17, 0.036, 0.17, (0, 0.077, pz), r=0.013), wood(WDL), 'stand')
    add(beam(0.072, 1.1, 0.072, (0, 0.61, pz), c=0.016), wood(WDL), 'stand')
    add(gl_lathe([(0.0, 0.0), (0.05, 0.0), (0.052, 0.012), (0.036, 0.022), (0.032, 0.03), (0.038, 0.05), (0.026, 0.07), (0.0, 0.076)], 10, pos=(0, 1.152, pz)), lac(WD, hi=mix(WD, '#ffe0c0', 0.35)), 'stand')
    add(beam(0.058, 0.058, 0.31, (0, 1.115, pz + 0.135), c=0.012), wood(WDL), 'stand')
    add(rb(0.034, 0.17, 0.04, (0, 1.04, pz + 0.07), r=0.01, rx=-PI / 4), wood(WD), 'stand')
    zc = 0.05; H = 0.44; yb = 0.6; R = 0.176
    with at((0, 1.075, zc), ry=PI / 2): add(vloop(0, 0, 0, 0.017, 0.005, n=10, K=4), soft('#3e3a44', 0.25, 0.3), 'hook')
    Rf = lambda y: R * (0.62 + 0.38 * math.sin(clamp((y - yb) / H) * PI))
    ribs = [yb + k / 12 * H for k in range(1, 12)]
    def face(c): return abs(ang_diff(ga(c), 0.0)) < 0.9 and yb + 0.06 < c.z < yb + 0.4
    def pc(c, fn, rib):
        t = (c.z - yb) / H; v = vnoise(Vector((c.x * 9 + 2, c.y * 7, c.z * 9)), 1.0, 2)
        if rib and not face(c): return '#c8a070'
        return mix('#fff2d6', '#ecd2a6', clamp(v * 1.4 - 0.2) * 0.5 + clamp(abs(t - 0.5) * 2 - 0.6) * 0.5)
    BLK = lac('#2a2024', hi='#6a5a62')
    with at((0, 0, zc)):
        GL(ribbed_lathe(Rf, yb, yb + H, ribs, yb + 0.02, yb + H - 0.02, pc, K=20, mids=0), fsh(0.06, 0.12), 'paper', tint=0.35, flick=0.8)
        capR = R * 0.62 + 0.009
        add(gl_lathe([(0.0, yb - 0.035), (capR - 0.007, yb - 0.035), (capR, yb - 0.026), (capR, yb + 0.008), (0.0, yb + 0.008)], 16), BLK, 'caps')
        add(gl_lathe([(0.0, yb + H - 0.008), (capR, yb + H - 0.008), (capR, yb + H + 0.026), (capR - 0.007, yb + H + 0.035), (0.0, yb + H + 0.035)], 16), BLK, 'caps')
        for y in (yb + 0.01, yb + H - 0.01): add(hloop(capR - 0.002, y, 0.0048, 18, 3), lac(GOLD), 'caps')
        # the one big eye: an eyeball dome, an amber iris, a round pupil with glints, a heavy lid and lashes
        ey = yb + 0.268; ea = 0.06
        S, N = lathe_fns(Rf, ea)
        c = S(0, ey); n = N(0, ey); up = Vector((0, 1, 0))
        add(dome(c, n, up, 0.064, 0.056, 0.026, K=14, J=4), lambda p, nn: mix('#fffdf6', '#e4dce8', clamp(-nn.z * 0.7 + 0.1)), 'eye')
        add(dome(c, n, up, 0.034, 0.036, 0.0075, K=12, J=2, off=0.02), lac('#ffb83a', hi='#ffe08a'), 'eye')
        add(dome(c, n, up, 0.019, 0.021, 0.005, K=10, J=2, off=0.0235), flat('#2a1a20'), 'eye')
        uu = (up - n * up.dot(n)).normalized(); tg = uu.cross(n)
        for (dx, dy, r) in ((-0.011, 0.012, 0.0075), (0.009, -0.011, 0.0042)):
            add(dome(c + tg * dx + uu * dy, n, up, r, r, 0.004, K=8, J=2, off=0.0275), flat('#fffaf2'), 'eye')
        def eyeh(x, y): return 0.026 * math.sqrt(max(0.0, 1 - (x / 0.064) ** 2 - ((y - ey) / 0.056) ** 2))
        lid = []
        for i in range(13):
            tt = i / 12; a = PI * (0.92 - 0.84 * tt)
            x, y = math.cos(a) * 0.072 + 0.004, ey + math.sin(a) * 0.052 - 0.004
            lid.append(S(x, y, eyeh(x, y) + 0.006))
        add(gtube(lid, lambda s: 0.0085 + 0.006 * math.sin(PI * s), K=5), lac('#2a1a20', hi='#5a4250'), 'eye')
        for (x, y, ax) in ((-0.058, ey + 0.03, -0.7), (-0.03, ey + 0.048, -0.3), (0.004, ey + 0.053, 0.05), (0.04, ey + 0.046, 0.4)):
            p0 = S(x, y, eyeh(x, y) + 0.008); x1, y1 = x + math.sin(ax) * 0.024, y + math.cos(ax) * 0.024
            add(gtube([p0, S((x + x1) / 2, (y + y1) / 2, 0.012), S(x1, y1, 0.014)], lambda s: 0.0068 - s * 0.0028, K=4), lac('#2a1a20', hi='#5a4250'), 'eye')
        # a wide torn mouth with a dark throat, paper fangs and a long tongue lolling out
        my = yb + 0.13
        S0, N0 = lathe_fns(Rf, 0.0)
        def mlo(x):
            u = (x + 0.11) / 0.22
            return (my + 0.024) * (1 - u) ** 2 + 2 * u * (1 - u) * (my - 0.075) + u * u * (my + 0.024)
        def mup(x):
            f = ((x + 0.11) / 0.0275) % 1.0
            return my + 0.008 + 0.01 * abs(f * 2 - 1) + 0.006 * (1 - ((x / 0.11) ** 2))
        mxs = [-0.11 + 0.22 * i / 16 for i in range(17)]
        add(strip_decal(S0, N0, mxs, mlo, lambda x: max(mlo(x) + 0.0005, mup(x)), 3, 0.0032, lambda x, v: mix('#7a2a36', '#3a1a22', smooth(0.0, 0.7, v))), None, 'mouth')
        for sx in (-1, 1):
            GL(poly_decal(S0, N0, [(sx * 0.074, my + 0.014), (sx * 0.044, my + 0.012), (sx * 0.06, my - 0.024)][::sx], 0.0046, lambda s: '#fff6e4'), None, 'mouth', tint=0.3, flick=0.8)
        rz = Rf(my)
        tp = catmull([(0, my - 0.005, rz - 0.03), (0.004, my - 0.025, rz + 0.025), (0.012, my - 0.08, rz + 0.05), (0.006, my - 0.15, rz + 0.04),
                      (-0.006, my - 0.2, rz + 0.018), (-0.004, my - 0.218, rz - 0.004), (0.004, my - 0.206, rz - 0.02)], 12)
        P = [F.W(p) for p in tp]
        def tprof(i):
            s = i / 11; w = (0.062 - 0.024 * s * s) / 2; th = (0.022 - 0.008 * s) / 2
            return [(th * math.sin(TAU * k / 8), w * math.cos(TAU * k / 8)) for k in range(8)]
        def tcol(p, nn):
            c = mix('#ff6a7c', '#ffa4b0', clamp(nn.z * 0.5 - nn.y * 0.3))
            c = mix(c, '#d84458', clamp(-nn.z * 0.6))
            if abs(p.x - 0.004) < 0.005 and -nn.y > 0.3: c = mul(c, 0.82)
            return c
        add(sweep(P, tprof, up=X, cap=True, inset=0.4, cap_d=0.006), tcol, 'tongue')
        # two paper patches (an old lantern) and a brush mark on its side
        for (a, y, w, h, r) in ((1.2, yb + 0.3, 0.052, 0.042, 0.2), (-1.4, yb + 0.13, 0.042, 0.052, -0.3)):
            Sa, Na = lathe_fns(Rf, a)
            pts = [(w / 2 * math.copysign(abs(math.cos(TAU * k / 12)) ** 0.4, math.cos(TAU * k / 12)), h / 2 * math.copysign(abs(math.sin(TAU * k / 12)) ** 0.4, math.sin(TAU * k / 12))) for k in range(12)]
            pts = [(x * math.cos(r) - v * math.sin(r), y + x * math.sin(r) + v * math.cos(r)) for x, v in pts]
            GL(poly_decal(Sa, Na, pts, 0.0048, lambda s: mix('#fff6e4', '#e2c896', smooth(0.55, 1.0, s)), rings=2), None, 'patch', tint=0.35, flick=0.8)
        Sb, Nb = lathe_fns(Rf, -1.15)
        add(ribbon_decal(Sb, Nb, catmull([(0, yb + 0.33), (0.006, yb + 0.26), (-0.004, yb + 0.18), (0.004, yb + 0.12)], 10), lambda t: 0.016 - t * 0.008, 0.0048, lambda t: '#3a2a30'), None, 'brush')
        add(ribbon_decal(Sb, Nb, [(-0.026, yb + 0.25), (0.0, yb + 0.243), (0.022, yb + 0.235)], lambda t: 0.01, 0.0049, lambda t: '#3a2a30'), None, 'brush')
    return 'floor'

# ================================================================== Shell Lamp (table, 0.5 x 0.5, h 0.34)
def scallop(Rs, A, na, ns, bulge, thick, nribs, cfront, cback, rib_r=0.04, rib_z=0.011):
    """a closed scallop valve in its local x-y plane: the hinge at the origin, the fan toward +y, bulging toward +z;
    ribs on the outer face. cfront / cback (a, s, rib) -> colour"""
    t = Tmp(); t.c = []
    fq = PI * nribs / (2 * A)
    F_ = [[None] * (ns + 1) for _ in range(na + 1)]; B_ = [[None] * (ns + 1) for _ in range(na + 1)]
    for i in range(na + 1):
        a = -A + 2 * A * i / na; rib = math.cos(a * fq) ** 2
        for j in range(ns + 1):
            s = max(0.07, j / ns)
            rr = s * Rs * (1 + rib_r * rib * s)
            zf = bulge * math.sin(PI * s ** 0.85 * 0.85) ** 0.8 * (1 - 0.4 * (a / A) ** 2) + rib_z * s * rib
            zb = zf * 0.5 - thick * (0.4 + 0.6 * s)
            F_[i][j] = t.vert(F.W((rr * math.sin(a), rr * math.cos(a), zf))); t.c.append(srgb(cfront(a, s, rib)))
            B_[i][j] = t.vert(F.W((rr * math.sin(a) * 0.985, rr * math.cos(a) * 0.985, zb))); t.c.append(srgb(cback(a, s, rib)))
    nf = F.N((0, 0, 1))
    for i in range(na):
        for j in range(ns):
            t.face([F_[i][j], F_[i + 1][j], F_[i + 1][j + 1], F_[i][j + 1]], nf)
            t.face([B_[i][j], B_[i][j + 1], B_[i + 1][j + 1], B_[i + 1][j]], -nf)
    loop = [(i, ns) for i in range(na + 1)] + [(na, j) for j in range(ns - 1, -1, -1)] + [(i, 0) for i in range(na - 1, -1, -1)] + [(0, j) for j in range(1, ns)]
    for k in range(len(loop)):
        (i0, j0), (i1, j1) = loop[k], loop[(k + 1) % len(loop)]
        t.face([F_[i0][j0], B_[i0][j0], B_[i1][j1], F_[i1][j1]], Vector((0, 0, 0)) + (t.v[F_[i0][j0]] - F.W((0, 0, 0))))
    return t

def build_shellLamp():
    new_asset()
    def sand(p, n):
        c = mix('#f0d4a4', '#fbe8c4', clamp(n.z) * 0.6)
        v = vnoise(p, 70.0, 5)
        if v > 0.7: c = mix(c, '#d8b080', 0.5)
        return c
    add(gl_lathe([(0.0, 0.0), (0.13, 0.0), (0.136, 0.012), (0.122, 0.026), (0.1, 0.038), (0.05, 0.046), (0.0, 0.047)], 16), sand, 'sand')
    def front(a, s, rib): return mix(mix('#ff94b8', '#ffe2ee', 0.6 * rib * s), '#ffd2ac', (1 - s) * 0.45)
    def back(a, s, rib): return mix('#ffd6e4', '#fff0f4', s * 0.6)
    with at((0, 0.036, -0.045), rx=-0.24):
        GL(scallop(0.25, 1.0, 28, 5, 0.06, 0.012, 7, front, back), fsh(0.08, 0.14, sheen=0.25), 'valve', tint=0.9, flick=0.2)
    with at((0, 0.048, -0.05), rx=PI / 2 - 0.14):
        GL(scallop(0.17, 0.95, 24, 4, 0.04, 0.009, 6, lambda a, s, rib: mix('#ff8cb0', '#ffb0c8', 0.5 * rib), lambda a, s, rib: mix('#ffd8e4', '#ff9cbc', smooth(0.45, 1.0, s)), rib_r=0.035, rib_z=0.0),
           fsh(0.08, 0.14, sheen=0.2), 'valve', tint=0.9, flick=0.2)
    add(rb(0.07, 0.036, 0.03, (0, 0.046, -0.05), r=0.012), lac('#ff9ec0'), 'hinge')
    add(sph(0.03, (0.0, 0.077, 0.03), K=9, J=4), lambda p, n: mix(mix('#fff4f8', '#e2d4f6', clamp(-n.x * 0.5 + 0.2)), '#fffaff', clamp(n.z) ** 3 * 0.6), 'pearl')
    add(fan_shape(star_ol(5, 1.0, 0.42), (0.1, 0.037, 0.052), sc=0.038, T=0.009, rx=-PI / 2 + 0.25, rz=0.5, Tb=0.003, centre=(0, 0)),
        lambda p, n: mix('#ff9a6a', '#ffc49a', clamp(n.z)), 'starfish')
    add(sph(0.007, (0.1, 0.046, 0.054), sc=(1, 0.6, 1), K=5, J=2), flat('#fff0e0'), 'starfish')
    return 'table'

# ================================================================== Rag Rug (rug, 2 x 2, h 0.03)
def ring_band(t, r0, y0, n0, r1, y1, n1, nseg, ph, skew, colf, k0, k1):
    """one braided half-coil: a ring strip from radius r0 (height y0, normal n0 = (radial, up)) to r1 (y1, n1),
    nseg parallelogram faces, the r1 edge turned by skew (a fraction of a segment); per-face colours colf(i)
    darkened by k0 / k1 at the two edges"""
    for i in range(nseg):
        a0 = ph + TAU * i / nseg; a1 = ph + TAU * (i + 1) / nseg; d = skew * TAU / nseg
        c = colf(i); ids = []
        for (r, y, nm, a, k) in ((r0, y0, n0, a0, k0), (r1, y1, n1, a0 + d, k1), (r1, y1, n1, a1 + d, k1), (r0, y0, n0, a1, k0)):
            ids.append(t.vert(F.W((r * math.sin(a), y, r * math.cos(a))), F.N((nm[0] * math.sin(a), nm[1], nm[0] * math.cos(a)))))
            t.c.append(mul(c, k))
        _put(t, ids)

def build_ragRug():
    new_asset()
    R = 0.975; h = 0.03; N = 13; rim = 0.068; inner = R - rim; cw = inner / N
    band = ['#e89a84', '#e89a84', '#f2b48e', '#f4cf94', '#f4cf94', '#f6e6c4', '#e8a4a8', '#e8a4a8', '#f2b48e', '#f4cf94', '#f6e6c4', '#f2b48e', '#f2b48e']
    t = Tmp(); t.c = []; t.done = True
    yv, yc = h - 0.009, h - 0.0005
    up_ = (0.0, 1.0); out_ = (0.55, 0.83); in_ = (-0.55, 0.83)
    for c in range(N):
        ro = inner - c * cw; rc = ro - cw / 2; ri = max(0.0, ro - cw)
        nseg = max(9, int(round(TAU * rc / 0.08)))
        ph = c * 0.37; col = band[c]
        hi = lambda i, k, col=col: mix(mul(col, 1.05), '#fff8ec', 0.12) if (i + k) % 2 == 0 else mul(col, 0.9)
        ring_band(t, ro, yv, out_, rc, yc, up_, nseg, ph, 0.5, lambda i, hi=hi: hi(i, 0), 0.86, 1.04)
        ring_band(t, rc, yc, up_, ri, yv if ri > 0.001 else yc - 0.002, in_, nseg, ph + 0.5 * TAU / nseg, 0.5 if ri > 0.001 else 0.0, lambda i, hi=hi: hi(i, 1), 1.04, 0.86)
    # the fat rolled rim coil
    nr = int(round(TAU * R / 0.08)); rcol = lambda i: mul('#d07a66', 1.04 if i % 2 == 0 else 0.9)
    prof = [(inner, yv, (-0.55, 0.83), 0.86), (R - 0.032, h, (0.0, 1.0), 1.05), (R - 0.006, h - 0.009, (0.75, 0.66), 0.98), (R, 0.014, (1.0, 0.0), 0.9), (R - 0.008, 0.001, (0.45, -0.89), 0.8)]
    for k in range(len(prof) - 1):
        (r0, y0, n0, k0), (r1, y1, n1, k1) = prof[k], prof[k + 1]
        ring_band(t, r0, y0, n0, r1, y1, n1, nr, 0.5 * (k % 2) * TAU / nr, 0.5, rcol, k0, k1)
    CL(t, None, 'braid')
    under = Tmp(); under.c = []; under.done = True
    ids = [under.vert(F.W(p), F.N((0, 1, 0))) for p in hring(inner + 0.004, yv - 0.0015, 48)]
    ci = under.vert(F.W((0, yv - 0.0015, 0)), F.N((0, 1, 0)))
    under.c = [srgb('#a8604e')] * len(under.v)
    for k in range(48): _put(under, [ci, ids[k], ids[(k + 1) % 48]])
    CL(under, None, 'under')
    return 'rug'

# ================================================================== Kitchen Tiles (rug, 2 x 1.5, h 0.02)
def build_tileMat():
    new_asset()
    W = 1.96; D = 1.46; fr = 0.065; nx = 8; nz = 6
    add(rb(W - 0.04, 0.007, D - 0.04, (0, 0.0075, 0), r=0.0028), lambda p, n: mul('#ddd2bf', 0.92 + 0.08 * clamp(n.z)), 'grout')
    iw = W - 2 * fr; idd = D - 2 * fr; px = iw / nx; pz = idd / nz
    flowers = {3, 12, 21, 30, 41}
    for j in range(nz):
        for i in range(nx):
            x = -iw / 2 + (i + 0.5) * px; z = -idd / 2 + (j + 0.5) * pz; mint = (i + j) % 2 == 0
            jit = (_h(i, j, 0, 7) - 0.5) * 0.06
            base = mul('#9fdcc4' if mint else '#fff4e2', 1.0 + jit); hi = mix(base, '#fffaf2', 0.4)
            tw = px - 0.016; td = pz - 0.016
            def tc(p, n, x=x, z=z, base=base, hi=hi, tw=tw, td=td):
                gx, gz = p.x, -p.y
                if n.z > 0.9: return mix(base, hi, clamp(0.5 - (gx - x) / tw - (gz - z) / td) * 0.7)
                if n.z > 0.2: return mix(base, hi, 0.25)
                return mul(base, 0.84)
            add(rbox((tw, td, 0.011), r=0.0045, seg=1, M=F.m @ lm((x, 0.0125, z))), tc, 'tiles')
            if not mint and (j * nx + i) in flowers:
                rot = _h(i, j, 1, 3) * 2.0
                add(fan_shape(flower_ol(5, 1.0, 0.5, 3), (x, 0.018, z), sc=0.062, T=0.003, rx=-PI / 2, rz=rot, Tb=0.001, centre=(0, 0)),
                    lambda p, n: mix('#ff9eb8', '#ffc4d4', 0.3), 'flowers')
                add(sph(0.014, (x, 0.0205, z), sc=(1, 0.4, 1), K=6, J=2), flat('#ffd24a'), 'flowers')
    O = rrect(W, D, 0.05, 4); I = rrect(iw + 0.006, idd + 0.006, 0.02, 4)
    add(frame_ring(O, I, 0.004, 0.019, 0.005), lambda p, n: mix('#5cb898', '#a2e4cc', clamp(n.z) * 0.5), 'border')
    return 'rug'

# ================================================================== Tatami Mat (rug, 2 x 1, h 0.04)
def build_tatamiMat():
    new_asset()
    W = 1.96; D = 0.96; h = 0.04
    add(rb(W, h - 0.006, D - 0.06, (0, 0.004 + (h - 0.006) / 2, 0), r=0.016), lambda p, n: mul('#c8c27c', 0.84 + 0.16 * clamp(n.z)), 'rush')
    nxc = 72; nzr = 4; tw = W - 0.03; td = D - 0.12; y = h - 0.0015
    t = Tmp(); t.c = []; t.done = True
    for i in range(nxc):
        for j in range(nzr):
            x0 = -tw / 2 + tw * i / nxc; x1 = x0 + tw / nxc; z0 = -td / 2 + td * j / nzr; z1 = z0 + td / nzr
            cz = (z0 + z1) / 2
            c = mix('#d8d28c' if i % 2 else '#c8c27a', '#e8e4a8', 0.22 * (0.5 + 0.5 * math.sin(cz * 7 + i * 0.13)))
            c = mul(c, (0.97 + 0.04 * math.sin(i * 1.7)) * (1.0 - 0.025 * (j % 2)))
            ids = []
            for (xx, zz) in ((x0, z0), (x1, z0), (x1, z1), (x0, z1)):
                ids.append(t.vert(F.W((xx, y, zz)), F.N((0, 1, 0)))); t.c.append(c)
            _put(t, ids)
    add(t, None, 'weave')
    for sz in (-1, 1):
        z = sz * (D / 2 - 0.0375)
        CL(rb(W + 0.002, h - 0.004, 0.075, (0, 0.004 + (h - 0.004) / 2, z), r=0.017), lambda p, n: mul('#3a5a44', 0.86 + 0.18 * clamp(n.z)), 'heri')
        CL(box(W - 0.04, 0.003, 0.011, (0, h + 0.0012, z - sz * 0.013)), flat('#e8d8a0'), 'heri')
        for i in range(18):
            CL(box(0.017, 0.003, 0.017, (-W / 2 + 0.06 + i * (W - 0.12) / 17, h + 0.0014, z + sz * 0.011), ry=PI / 4), flat('#d8c890'), 'heri')
    return 'rug'

# ================================================================== Maple Leaf Rug (rug, 1.5 x 1.5, h 0.03)
MAPLE_FAT = [(0, 1.0, 0.54), (0.98, 0.9, 0.52), (-0.98, 0.9, 0.52), (1.9, 0.68, 0.48), (-1.9, 0.68, 0.48), (2.56, 0.44, 0.38), (-2.56, 0.44, 0.38)]
def mapleR(th, lobes=MAPLE_FAT, r0=0.4, k1=1.6, k2=0.75):
    r = r0
    for a, L, w in lobes:
        u = abs(th - a); u = min(u, TAU - u) / w
        if u < 1: r = max(r, L * (1 - u ** k1) ** k2)
    return r

def felt_slab(Rf, place, N, K, M, h, lift, color):
    """a soft felt slab cut to a star-shaped outline Rf(th) (th = 0 toward the leaf tip, polar origin at the base),
    laid out by place(u, v) -> (x, z): a flat top at h with a rolled edge, raised by lift(x, z)"""
    P = [place(math.sin(i / N * TAU - PI) * Rf(i / N * TAU - PI), math.cos(i / N * TAU - PI) * Rf(i / N * TAU - PI)) for i in range(N)]
    O = place(0, 0); rho = h / 2
    t = Tmp(); t.c = []; t.open = True
    def V(x, z, y, s):
        t.c.append(srgb(color(s, x, z))); return t.vert(F.W((x, y + lift(x, z), z)))
    c0 = V(O[0], O[1], h, 0.0); cols = []
    for i in range(N):
        a, b = P[(i - 1) % N], P[(i + 1) % N]; tx, tz = b[0] - a[0], b[1] - a[1]; l = math.hypot(tx, tz) or 1.0
        nx, nz = tz / l, -tx / l
        if nx * (P[i][0] - O[0]) + nz * (P[i][1] - O[1]) < 0: nx, nz = -nx, -nz
        q = (P[i][0] - nx * rho, P[i][1] - nz * rho); col = []
        for k in range(1, K + 1):
            s = k / K; col.append(V(O[0] + (q[0] - O[0]) * s, O[1] + (q[1] - O[1]) * s, h, s))
        for m in range(1, M + 1):
            f = m / M * PI * 0.94; col.append(V(q[0] + nx * rho * math.sin(f), q[1] + nz * rho * math.sin(f), rho + rho * math.cos(f), 1 + m / M))
        cols.append((col, nx, nz))
    for i in range(N):
        A_, nxa, nza = cols[i]; B_, _, _ = cols[(i + 1) % N]
        t.face([c0, A_[0], B_[0]], Z)
        for k in range(len(A_) - 1):
            f = max(0.0, (k + 0.5 - K + 1) / M) * PI * 0.94
            hint = F.N((nxa * math.sin(f), math.cos(f), nza * math.sin(f)))
            t.face([A_[k], A_[k + 1], B_[k + 1], B_[k]], hint)
    return t

def build_mapleRug():
    new_asset()
    hM, hY = 0.024, 0.013
    LM = dict(sc=0.6, cx=-0.1, cz=0.08, rot=0.0); LY = dict(sc=0.37, cx=0.27, cz=0.27, rot=1.1)
    def placer(L): return lambda u, v: (L['cx'] + u * math.cos(L['rot']) + v * math.sin(L['rot']), L['cz'] + u * math.sin(L['rot']) - v * math.cos(L['rot']))
    def local(L):
        def f(x, z):
            dx, dz = x - L['cx'], z - L['cz']; return (dx * math.cos(L['rot']) + dz * math.sin(L['rot']), dx * math.sin(L['rot']) - dz * math.cos(L['rot']))
        return f
    RfM = lambda t: LM['sc'] * mapleR(t); RfY = lambda t: LY['sc'] * mapleR(t)
    def depth(L, Rf):
        lo = local(L)
        def f(x, z):
            u, v = lo(x, z); return Rf(math.atan2(u, v)) - math.hypot(u, v)
        return f
    dM, dY = depth(LM, RfM), depth(LY, RfY)
    lift = lambda x, z: hM * smooth(-0.006, 0.026, dM(x, z))
    felt = lambda x, z: 0.955 + 0.045 * (vnoise(Vector((x * 34, z * 34, 0)), 1.0, 1) * 2 - 1) + 0.02 * (vnoise(Vector((x * 90, z * 90, 0)), 1.0, 2) * 2 - 1)
    def cmain(s, x, z):
        if s > 1: c = mul(mix('#dc3e2e', '#b42c26', clamp((s - 1) * 1.4)), 1.04 - 0.3 * clamp(s - 1.3))
        else:
            tt = s ** 1.15; c = mix(mix('#ffa646', '#f46a3c', clamp(tt * 1.7)), '#dc3e2e', clamp(tt * 1.7 - 0.75))
        return mul(c, felt(x, z))
    def cgold(s, x, z):
        c = mix(mix('#ffe48a', '#ffc23a', clamp(s * 1.6)), '#ee9a2e', clamp(s * 1.6 - 0.9) + clamp(s - 1) * 0.6)
        return mul(c, felt(x + 3, z) * (1.03 - 0.28 * clamp(s - 1.3)))
    CL(felt_slab(RfM, placer(LM), 84, 2, 3, hM, lambda x, z: 0.0, cmain), None, 'felt')
    CL(felt_slab(RfY, placer(LY), 64, 2, 3, hY, lift, cgold), None, 'felt')
    # felt stems
    for (L, h, pts, r, c) in ((LM, hM, [(0, -0.12), (0.012, -0.36), (0.05, -0.52)], 0.017, '#b8402c'), (LY, hY, [(0, -0.12), (-0.01, -0.36), (-0.05, -0.5)], 0.015, '#e09030')):
        pl = placer(L); P3 = []
        for (u, v) in catmull(pts, 9):
            x, z = pl(u * L['sc'], v * L['sc']); yy = (lift(x, z) if L is LY else 0.0) + max(h * 0.55, r * 0.62 + 0.001)
            P3.append((x, yy, z))
        st = gtube(P3, lambda s, r=r: r * (1 - s * 0.35), K=7)
        ys = [F.W(p).z for p in P3]; ws = [F.W(p) for p in P3]
        for i, v in enumerate(st.v):
            j = min(range(len(ws)), key=lambda k: (ws[k] - v).length)
            st.v[i] = Vector((v.x, v.y, ys[j] + (v.z - ys[j]) * 0.6))
        st.n = [None] * len(st.v)
        CL(st, lambda p, n, c=c: mul(c, 0.9 + 0.12 * clamp(n.z)), 'stems')
    # stitched veins (midribs to the lobe tips, side veins) and a running border: cream on the red leaf, rust on the gold
    def veins(L):
        pl = placer(L); out = []
        for (a, ln, w) in MAPLE_FAT:
            tip = (math.sin(a) * ln * 0.8, math.cos(a) * ln * 0.8); b0 = (0.0, -0.03)
            bend = (-math.cos(a) * 0.02, math.sin(a) * 0.02); midp = (tip[0] * 0.5 + bend[0], tip[1] * 0.5 + bend[1] - 0.015)
            out.append([pl(u * L['sc'], v * L['sc']) for u, v in catmull([b0, midp, tip], 8)])
            if ln > 0.5:
                for f in (0.42, 0.66):
                    for s in (-1, 1):
                        m = (b0[0] + (tip[0] - b0[0]) * f, b0[1] + (tip[1] - b0[1]) * f); da = a + s * 0.78; vl = ln * 0.17
                        out.append([pl(m[0] * L['sc'], m[1] * L['sc']), pl((m[0] + math.sin(da) * vl) * L['sc'], (m[1] + math.cos(da) * vl) * L['sc'])])
        out.append([pl(u * L['sc'], v * L['sc']) for u, v in ((0, -0.04), (0.008, -0.3), (0.03, -0.46))])
        return out
    def border(L, Rf, inset):
        pl = placer(L); n = 160; P = []
        for i in range(n):
            tt = i / n * TAU - PI; r = max(0.02, Rf(tt) - inset * 1.25); P.append(pl(math.sin(tt) * r, math.cos(tt) * r))
        for _ in range(3):
            P = [((P[i - 1][0] + 2 * P[i][0] + P[(i + 1) % n][0]) / 4, (P[i - 1][1] + 2 * P[i][1] + P[(i + 1) % n][1]) / 4) for i in range(n)]
        return P + [P[0]]
    sm = Tmp(); sm.open = True; sy = Tmp(); sy.open = True
    under_gold = lambda x, z: dY(x, z) > -0.016
    for path in veins(LM) + [border(LM, RfM, 0.034)]:
        stitch_run(sm, path, lambda x, z: hM + 0.0004, 0.028, 0.019, 0.0105, 0.0028, skip=under_gold)
    for path in veins(LY) + [border(LY, RfY, 0.022)]:
        stitch_run(sy, path, lambda x, z: lift(x, z) + hY + 0.0004, 0.022, 0.016, 0.009, 0.0024)
    CL(sm, soft('#fff2d8', 0.1, 0.2), 'stitches')
    CL(sy, soft('#c0542c', 0.1, 0.2), 'stitches')
    return 'rug'

# ================================================================== Wave Rug (rug, 2 x 1.5, h 0.03)
def build_waveRug():
    new_asset()
    W = 1.96; D = 1.46; fx = 0.82; fz = 0.58; R = 0.25
    CL(rb(W - 0.04, 0.016, D - 0.04, (0, 0.012, 0), r=0.006), lambda p, n: mul('#2a4270', 0.88 + 0.12 * clamp(n.z)), 'base')
    O = rrect(W - 0.014, D - 0.014, 0.1, 4); I = rrect(2 * fx + 0.02, 2 * fz + 0.02, 0.04, 4)
    CL(frame_ring(O, I, 0.004, 0.028, 0.008), lambda p, n: mix('#1e3052', '#3a5488', clamp(n.z) * 0.6), 'frame')
    CL(gloopc(rrect(W - 0.108, D - 0.108, 0.066, 4, y=0.028), 0.0055, K=3), soft('#f4f8ff', 0.1, 0.25), 'piping')
    # seigaiha: rows of half-disc wave scales, each row overlapping the one behind it
    rings = [0.0, 0.4, 0.5, 0.7, 0.8, 1.0]; cols = ['#3f6aa8', '#f4f8ff', '#6a9ad8', '#f4f8ff', '#a8d0f4']
    SEG = 8
    t = Tmp(); t.c = []; t.done = True
    def P(cx, cz, r, th): return (clamp(cx + r * math.cos(th), -fx, fx), clamp(cz - r * math.sin(th), -fz, fz))
    j = 0; cz = -fz + R * 0.2
    while cz < fz + R * 0.55:
        y = 0.02 + j * 0.0008
        cx = -fx - (0 if j % 2 else R)
        while cx < fx + R:
            for k in range(5):
                r0, r1 = rings[k] * R, rings[k + 1] * R; c = cols[k]
                k0, k1 = (0.94, 1.03) if c != '#f4f8ff' else (0.98, 1.0)
                for s in range(SEG):
                    t0, t1 = s / SEG * PI, (s + 1) / SEG * PI
                    quad = [(P(cx, cz, r0, t0), k0), (P(cx, cz, r1, t0), k1), (P(cx, cz, r1, t1), k1), (P(cx, cz, r0, t1), k0)]
                    if k == 0: quad = quad[:3]
                    ids = []
                    for (q, kk) in quad:
                        ids.append(t.vert(F.W((q[0], y, q[1])), F.N((0, 1, 0)))); t.c.append(mul(c, kk))
                    _put(t, ids)
            cx += 2 * R
        cz += R / 2; j += 1
    CL(t, None, 'waves')
    return 'rug'

# ================================================================== finishing and export
def finish(A, mount, seed=5, amt=0.003):
    """a whisper of hand-made wobble (millimetres), then a soft painted contact shade toward the floor / table top
    (the game skips its own base shade for Blender models)"""
    ph = (seed % 97) * 1.37 + 0.7
    for o in A.objs.values():
        V = o['v']
        for i, p in enumerate(V):
            if mount == 'rug':
                dx = math.sin(p.y * 5.0 + ph) * amt * 0.6; dy = math.sin(p.x * 4.0 + ph * 1.3) * amt * 0.6
            else:
                k = amt * min(1.0, 0.3 + p.z)
                dx = math.sin(p.z * 7.0 + ph) * k; dy = math.sin(p.z * 8.0 + ph * 1.7) * k * 0.8
            V[i] = Vector((p.x + dx, p.y + dy, p.z))
        if mount in ('floor', 'table'):
            for i, (p, c) in enumerate(zip(V, o['c'])):
                k = 0.86 + 0.14 * smooth(0.0, 0.1, p.z)
                o['c'][i] = (c[0] * k, c[1] * k, c[2] * k, 1.0)

def export_piece(A, name):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mats = {}
    for mname in ('body', 'leaf', 'cloth', 'glow', 'water'):
        mt = bpy.data.materials.new(mname); mt.use_nodes = True; nt = mt.node_tree
        bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
        bsdf.inputs['Roughness'].default_value = 0.8; bsdf.inputs['Metallic'].default_value = 0.0
        vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'; nt.links.new(vc.outputs['Color'], bsdf.inputs['Base Color'])
        if mname == 'glow':
            nt.links.new(vc.outputs['Color'], bsdf.inputs['Emission Color']); bsdf.inputs['Emission Strength'].default_value = 1.0
        mats[mname] = mt
    obs = [to_object(name, o, mats) for k, o in A.objs.items()]
    lo = Vector((1e9,) * 3); hi = Vector((-1e9,) * 3)
    for o in A.objs.values():
        for v in o['v']: lo = Vector(map(min, lo, v)); hi = Vector(map(max, hi, v))
    tri_m = {}
    for o in A.objs.values():
        for f, mi in zip(o['f'], o['m']): tri_m[o['mats'][mi]] = tri_m.get(o['mats'][mi], 0) + len(f) - 2
    print('FL %s tris %d %s' % (name, A.tris(), tri_m))
    print('FL %s parts %s' % (name, dict(sorted(A.count.items(), key=lambda kv: -kv[1]))))
    print('FL %s size x %.3f (%.3f..%.3f)  depth %.3f (%.3f..%.3f)  h %.3f (min z %.4f)' % (name, hi.x - lo.x, lo.x, hi.x, hi.y - lo.y, lo.y, hi.y, hi.z, lo.z))
    for ob in obs: print('FL %s check %s mats %s' % (name, check(ob), [m.name for m in ob.data.materials]))
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, name + '.blend'))
    for o in bpy.context.scene.objects: o.select_set(o.type == 'MESH')
    out = os.path.join(MODELS, name + '.glb')
    kw = dict(filepath=out, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
              export_attributes=True, export_lights=False, export_cameras=False, export_animations=False,
              export_normals=True, export_texcoords=True, export_materials='EXPORT')
    try: bpy.ops.export_scene.gltf(export_vertex_color='ACTIVE', **kw)
    except TypeError as e:
        print('FL export_vertex_color rejected:', e); bpy.ops.export_scene.gltf(export_colors=True, **kw)
    print('FL wrote', out)

PIECES = {'andonLamp': build_andonLamp, 'paperPendant': build_paperPendant, 'mushroomLamp': build_mushroomLamp,
          'bambooLantern': build_bambooLantern, 'pumpkinLamp': build_pumpkinLamp, 'festivalLantern': build_festivalLantern,
          'yokaiLantern': build_yokaiLantern, 'shellLamp': build_shellLamp, 'ragRug': build_ragRug, 'tileMat': build_tileMat,
          'tatamiMat': build_tatamiMat, 'mapleRug': build_mapleRug, 'waveRug': build_waveRug}
for pid in (list(PIECES) if PIECE == 'all' else PIECE.split(',')):
    mount = PIECES[pid]()
    finish(A, mount, seed=sum(map(ord, pid)))
    export_piece(A, 'furn-' + pid)
