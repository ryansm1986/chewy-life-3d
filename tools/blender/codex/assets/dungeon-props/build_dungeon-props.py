# PAWHAVEN dungeon props: treasure chests, breakable pots and buff shrines, built in Blender by script.
#   blender --background --factory-startup --python build_dungeon-props.py -- --piece <name|all>
#   names: chest-wood chest-gold pot-burrow pot-shrine pot-moon pot-kitchen pot-crystal
#          shrine-zoomies shrine-goodboy shrine-lucky shrine-sparkle shrine-snack
# Deterministic: no randomness except seeded PRNGs; a re-run reproduces every GLB exactly.
# Frame: 1 unit = 1 m, Blender Z up, the front faces -Y (the glTF exporter makes it the game's +z).
# A kit function's local (x, y, z) maps to Blender (x, -z, y).
# Shared kit (from tools/blender/codex/assets/village-pieces): a mesh accumulator with per-vertex painted colours
# (attribute `Col`), rounded boxes with analytic normals, lathes, tubes, sweeps.
import bpy, bmesh, math, os, sys, random
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..', '..'))
MODELS = os.path.join(REPO, 'public', 'models')
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
PIECE = argv[argv.index('--piece') + 1] if '--piece' in argv else 'all'
print('DP build pid', os.getpid())

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
        for a in (0.8, 0.5):
            ang = a * math.pi / 2
            q = path[0] - T * (r0 * math.sin(ang)); rings.append(ring(q, W, U, r0 * math.cos(ang))); cs.append(q)
    for i, (p, (T, W, U)) in enumerate(zip(path, F)):
        rings.append(ring(p, W, U, rad(i / (n - 1)))); cs.append(p)
    if caps:
        T, W, U = F[-1]; r1 = rad(1.0)
        for a in (0.5, 0.8):
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
def make_mat(name, factor=None, emission=None, strength=3.0):
    mt = bpy.data.materials.new(name); mt.use_nodes = True; nt = mt.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Roughness'].default_value = 0.8; bsdf.inputs['Metallic'].default_value = 0.0
    if emission is not None:
        bsdf.inputs['Base Color'].default_value = lin(emission)
        bsdf.inputs['Emission Color'].default_value = lin(emission)
        bsdf.inputs['Emission Strength'].default_value = strength
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

def export(asset, name, matdefs, origins=None):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    matmap = {k: make_mat(k, **v) for k, v in matdefs.items()}
    obs = [to_object(k, o, matmap, (origins or {}).get(k)) for k, o in asset.objs.items()]
    lo = Vector((1e9,) * 3); hi = Vector((-1e9,) * 3)
    for o in asset.objs.values():
        for v in o['v']:
            lo = Vector(map(min, lo, v)); hi = Vector(map(max, hi, v))
    print('VP %s tris %d %s' % (name, asset.tris(), {k: asset.tris(k) for k in asset.objs}))
    print('VP %s parts %s' % (name, dict(sorted(asset.count.items(), key=lambda kv: -kv[1]))))
    print('VP %s bounds blender x %.3f..%.3f y %.3f..%.3f z %.3f..%.3f | game z %.3f..%.3f' % (
        name, lo.x, hi.x, lo.y, hi.y, lo.z, hi.z, -hi.y, -lo.y))
    for ob in obs: print('VP %s check %s %s' % (name, ob.name, check(ob)))
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, name + '.blend'))
    for o in bpy.context.scene.objects: o.select_set(o.type == 'MESH')
    out = os.path.join(MODELS, name + '.glb')
    kw = dict(filepath=out, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
              export_attributes=True, export_lights=False, export_cameras=False, export_animations=False,
              export_normals=True, export_texcoords=False, export_materials='EXPORT')
    try:
        bpy.ops.export_scene.gltf(export_vertex_color='ACTIVE', **kw)
    except TypeError as e:
        print('VP export_vertex_color rejected:', e)
        bpy.ops.export_scene.gltf(export_colors=True, **kw)
    print('VP wrote', out)


# ================================================================== dungeon-props: shared helpers
def lighten(c, k): return mix(c, '#fff6ea', k)
def darken(c, k): return mix(c, '#2a2230', k)

def orient_to(d):
    """a rotation matrix (4x4) taking +Z to the direction d"""
    return Z.rotation_difference(Vector(d).normalized()).to_matrix().to_4x4()

def basis(o, ex, ey, ez):
    """a 4x4 matrix with origin o and the given (unit) axes as columns"""
    M = Matrix.Identity(4)
    for i, e in enumerate((ex, ey, ez)):
        for r in range(3): M[r][i] = e[r]
    for r in range(3): M[r][3] = o[r]
    return M

def wood_col(base, seed, outward=None, ao_z=0.0, ao_k=0.22, inner_k=0.55, top=0.14, bot=0.32, grain=0.12):
    """painted timber: per-plank tone noise, light tops, dark undersides, AO toward the ground; faces pointing
    against `outward` (the inside of a box) much darker"""
    def f(p, n):
        c = mul(base, 1 + grain * (vnoise(p, 6.5, seed) - 0.5) * 2)
        if n.z > 0: c = mix(c, lighten(base, 0.3), n.z * top * 4)
        else: c = mul(c, 1 + bot * n.z)
        if outward is not None and n.dot(outward) < -0.4: c = mul(c, inner_k)
        c = mul(c, 1 - ao_k * (1 - smooth(0.0, 0.14, p.z - ao_z)))
        return c
    return f

def metal_col(base, hi, gloss=0.0, ao_z=0.0, ao_k=0.18, spec='#fffaf0'):
    """painted metal / lacquer: a strong top-light gradient toward hi, a glossy cap on up-facing faces"""
    def f(p, n):
        c = mix(base, hi, clamp(n.z * 0.6 + 0.22))
        if n.z < 0: c = mul(c, 1 + 0.32 * n.z)
        if gloss and n.z > 0.7: c = mix(c, spec, gloss * (n.z - 0.7) / 0.3)
        c = mul(c, 1 - ao_k * (1 - smooth(0.0, 0.1, p.z - ao_z)))
        return c
    return f

def gem(A, obj, mat, c, r, h, M, col, K=6, tag='gems'):
    """a cut gem along +Z of M: a pavilion point below, a girdle, a crown and a flat table"""
    t = lathe([(0.0, -h * 0.5), (r, 0.0), (r * 0.62, h * 0.34), (0.0, h * 0.36)], K, th0=math.pi / K)
    t.xform(Matrix.Translation(c) @ M)
    hi_ = lighten(col, 0.55); lo_ = darken(col, 0.35)
    def f(p, n):
        k = n.dot((M.to_3x3() @ Z).normalized())
        if k > 0.8: return lighten(col, 0.75)               # the table: a sparkle
        return mix(lo_, hi_, clamp(k * 0.6 + 0.45))
    A.add(obj, mat, t, f, tag)

def coin(A, obj, mat, c, r, h, M, K=8, base='#ffd24a', tag='coins'):
    t = lathe([(0.0, 0.0), (r, 0.0), (r, h), (0.0, h)], K, th0=0.3)
    t.xform(Matrix.Translation(c) @ M)
    ax = (M.to_3x3() @ Z).normalized()
    A.add(obj, mat, t, lambda p, n: mix(darken(base, 0.18), '#fff2b0', clamp(n.dot(ax) * 0.8 + 0.1)) if n.dot(ax) > -0.2 else mul(base, 0.7), tag)

def dome_rivet(A, obj, mat, c, d, r, col):
    t = lathe([(0.0, 0.0), (r, 0.0), (0.0, r * 0.8)], 6, th0=0.5)        # (a 12-triangle stud: smooth normals round it)
    t.xform(Matrix.Translation(c) @ orient_to(d))
    A.add(obj, mat, t, col, 'rivets')

# ================================================================== 1. treasure chests
# The kit frame (lootModels.js buildChest): body x -0.45..0.45, y 0..0.5, z -0.3..0.3 (+z the front); the lid's
# origin is the hinge at game (0, 0.5, -0.31) -> Blender (0, 0.31, 0.5); makeChest turns it about x to -1.9 rad.
CHEST_P = {
    'wood': dict(plank=['#c07e48', '#ad6e3e', '#cc8c54'], core='#3a261c', inner='#5a3a26',
                 iron='#575272', iron_hi='#a09cbc', brass='#e8b448', brass_hi='#fff0b0', rivet='#47425c',
                 gloss=0.15, lacq=False),
    'gold': dict(plank=['#b0343e', '#9e2c38', '#bc4048'], core='#40161c', inner='#5c1e26',
                 iron='#d8962a', iron_hi='#ffe58a', brass='#f0b838', brass_hi='#fff6c8', rivet='#ffe070',
                 gloss=0.55, lacq=True),
}
HINGE = Vector((0.0, 0.31, 0.5))
LRY, LRZ, LZ0, LCW = 0.31, 0.2, 0.025, 0.31        # the barrel lid: half-depth, rise, base lift, centre (w from the hinge)

def lid_pt(t, grow=0.0):
    """a point of the lid's barrel section, t 0 (front) .. pi (back); (w, u): w from the hinge toward the front, u up"""
    return (LCW + (LRY + grow) * math.cos(t), LZ0 + (LRZ + grow) * math.sin(t))
def lid_world(w, u, x=0.0): return Vector((x, HINGE.y - w, HINGE.z + u))
def lid_nrm(t):
    n = Vector((LRZ * math.cos(t), LRY * math.sin(t))).normalized()
    return Vector((0.0, -n.x, n.y))

def build_chest(kind):
    P = CHEST_P[kind]; gold = kind == 'gold'
    A = Asset(); rng = random.Random(31 if gold else 17)
    BO, LO, MT = 'body', 'lid', 'body'
    iron = metal_col(P['iron'], P['iron_hi'], gloss=P['gloss'] + 0.25)
    brass = metal_col(P['brass'], P['brass_hi'], gloss=0.6)
    rivc = metal_col(P['rivet'], P['iron_hi'], gloss=0.4)
    def plank(base, seed, outward):
        if P['lacq']:          # red lacquer: smooth, a glossy top cap, no grain
            f0 = metal_col(base, lighten(base, 0.32), gloss=0.35, spec='#ffd8d0')
            def f(p, n):
                c = f0(p, n)
                c = mul(c, 1 + 0.06 * (vnoise(p, 5, seed) - 0.5))
                if n.dot(outward) < -0.4: c = mul(c, 0.5)
                return c
            return f
        return wood_col(base, seed, outward)

    # ---------------- body: a dark core, planked walls between iron rims, corner posts, straps, a lock, ring handles
    rows = [(0.055, 0.183), (0.189, 0.317), (0.323, 0.451)]
    for i, (z0, z1) in enumerate(rows):
        h = z1 - z0; zc = (z0 + z1) / 2
        # the front: three planks (camera side), each a touch off true
        A.add(BO, MT, rbox((0.80, 0.05, h), r=0.02, M=M_at((rng.uniform(-0.004, 0.004), -0.26 + rng.uniform(-0.003, 0.002), zc),
                                                       rx=rng.uniform(-0.02, 0.02), ry=rng.uniform(-0.008, 0.008))),
              plank(P['plank'][i % 3], 3 + i, -Y), 'planks')
        for sx in (-1, 1):
            A.add(BO, MT, rbox((0.05, 0.50, h), r=0.02, M=M_at((sx * 0.405 + rng.uniform(-0.002, 0.003) * sx, rng.uniform(-0.004, 0.004), zc),
                                                           ry=rng.uniform(-0.02, 0.02))),
                  plank(P['plank'][(i + 1 + (sx > 0)) % 3], 7 + i * 2 + sx, X * sx), 'planks')
    A.add(BO, MT, rbox((0.80, 0.05, 0.40), r=0.02, M=M_at((0, 0.26, 0.253))), plank(P['plank'][1], 21, Y), 'planks')
    # rims: a bottom band (proud of the planks), a top frame (the treasure shows through it)
    A.add(BO, MT, rbox((0.88, 0.59, 0.062), r=0.024, M=M_at((0, 0, 0.031))), iron, 'rims')
    for sy in (-1, 1):
        A.add(BO, MT, rbox((0.88, 0.064, 0.056), r=0.022, M=M_at((0, sy * 0.263, 0.472))), iron, 'rims')
    for sx in (-1, 1):
        A.add(BO, MT, rbox((0.064, 0.47, 0.056), r=0.022, M=M_at((sx * 0.408, 0, 0.472))), iron, 'rims')
    # corner posts: chunky rounded iron caps over the four corners
    for sx in (-1, 1):
        for sy in (-1, 1):
            A.add(BO, MT, rbox((0.1, 0.1, 0.505), r=0.034, M=M_at((sx * 0.405, sy * 0.255, 0.2525))), iron, 'corners')
    # two front straps, riveted
    for sx in (-1, 1):
        A.add(BO, MT, rbox((0.08, 0.026, 0.40), r=0.011, M=M_at((sx * 0.23, -0.294, 0.252))), iron, 'straps')
        for z in (0.12, 0.25, 0.38):
            dome_rivet(A, BO, MT, Vector((sx * 0.23, -0.305, z)), -Y, 0.019, rivc)
    # the lock: a round brass plate with a tab, a keyhole
    lk = lathe([(0.0, 0.0), (0.078, 0.0), (0.083, 0.012), (0.072, 0.026), (0.0, 0.03)], 10, th0=math.pi / 10)
    A.add(BO, MT, lk.xform(M_at((0, -0.284, 0.30), rx=math.pi / 2)), brass, 'lock')
    A.add(BO, MT, rbox((0.115, 0.024, 0.075), r=0.012, M=M_at((0, -0.296, 0.372))), brass, 'lock')
    A.add(BO, MT, ellipsoid(Vector((0, -0.312, 0.318)), (0.02, 0.006, 0.02), K=8, J=2), lambda p, n: '#2a1a22', 'lock')
    A.add(BO, MT, ellipsoid(Vector((0, -0.31, 0.293)), (0.009, 0.006, 0.026), K=6, J=2), lambda p, n: '#2a1a22', 'lock')
    # ring handles on the ends
    for sx in (-1, 1):
        A.add(BO, MT, rbox((0.024, 0.15, 0.1), r=0.01, M=M_at((sx * 0.442, 0, 0.30))), iron, 'handles')
        loop = [Vector((sx * 0.462, math.sin(a) * 0.062, 0.25 + math.cos(a) * 0.062)) for a in (TAU * k / 8 for k in range(8))]
        A.add(BO, MT, tube_loop(loop, lambda s: 0.017, K=4, up=X), iron, 'handles')
    # the treasure heap, filling the box to the brim
    # the treasure heap: a lumpy mound of coins heaped over the brim (above the rim it sits inside the shut lid's barrel)
    HX, HYh, HE, HT = 0.383, 0.238, 0.462, 0.585
    def heap_z(x, y):
        q = (x / HX) ** 2 + (y / HYh) ** 2
        return HE + (HT - HE) * max(0.0, 1 - q) ** 0.8
    heap = lathe([(0.0, 0.40), (1.0, 0.40)] + [(f, heap_z(f * HX, 0)) for f in (1.0, 0.8, 0.58, 0.34)] + [(0.0, HT)], 12,
                 sx=HX, sy=HYh, th0=0.2)
    heap.v = [Vector((v.x, v.y, (heap_z(v.x, v.y) + 0.026 * (vnoise(v, 15, 3) - 0.5) * 2 * smooth(0.47, 0.5, heap_z(v.x, v.y)))
                      if v.z > 0.41 else v.z)) for v in heap.v]
    def heap_col(p, n):
        c = mix('#b8701c', '#ffd64e', clamp(n.z * 1.1 - 0.1) * (0.45 + 0.8 * vnoise(p, 22, 5)))
        if vnoise(p, 30, 9) > 0.62: c = mix(c, '#fff4c0', 0.5)                    # glints of coin faces
        return mul(c, 1 - 0.35 * (1 - smooth(HE - 0.01, HE + 0.04, p.z)))       # dark where it meets the walls
    A.add(BO, MT, heap, heap_col, 'heap')
    coins = [(-0.24, -0.07, 0.35, 0.6), (-0.1, 0.07, -0.9, 2.0), (0.05, -0.1, 0.25, 4.1), (0.19, 0.06, -0.4, 1.1),
             (0.29, -0.07, 1.1, 5.0), (-0.02, 0.13, 0.2, 3.2), (-0.31, 0.08, -0.7, 2.6)]
    for i, (x, y, tilt, yaw) in enumerate(coins):
        if gold and i >= 4: break
        coin(A, BO, MT, Vector((x, y, heap_z(x, y) - 0.006 + 0.02 * abs(math.sin(tilt)))), 0.05, 0.016,
             M_at((0, 0, 0), rz=yaw) @ Matrix.Rotation(tilt, 4, 'X'), K=8)
    gems = [(-0.15, -0.02, '#ff6aa8', 0.034), (0.11, -0.01, '#6ae0ff', 0.03)]
    if gold: gems += [(0.24, 0.08, '#8ae870', 0.028), (-0.02, -0.12, '#ff5a9a', 0.036)]
    for i, (x, y, c, r) in enumerate(gems):
        gem(A, BO, MT, Vector((x, y, heap_z(x, y) + r * 0.3)), r * 1.15, r * 1.7, orient_to((0.3 * math.cos(i * 2.1), 0.3 * math.sin(i * 2.1), 1)), c)

    # ---------------- the lid (its own object, origin = the hinge): a barrel of five planks, end plates, two straps,
    # a front and back trim, the hasp over the lock
    prof = [(0.616, 0.0)]
    NP = 5
    for i in range(NP):
        t0, t1 = i * math.pi / NP, (i + 1) * math.pi / NP
        for f in (0.1, 0.5, 0.9):
            prof.append(lid_pt(t0 + (t1 - t0) * f, 0.007 * math.sin(math.pi * f)))
        if i < NP - 1: prof.append(lid_pt(t1, -0.014))
    prof.append((0.004, 0.0))
    prof = [(w, u) for w, u in prof]
    shell = sweep([HINGE + X * x for x in (-0.418, 0.0, 0.418)], prof, up=Z, inset=0.06, cap_d=0.006)
    def shell_col(p, n):
        w, u = HINGE.y - p.y, p.z - HINGE.z
        if u < 0.003 and n.z < -0.6:                  # the underside (seen when it opens)
            return mul(P['inner'], 0.9 + 0.2 * vnoise(p, 6, 3))
        t = math.atan2((u - LZ0) / LRZ, (w - LCW) / LRY)
        rr = math.hypot((u - LZ0) / LRZ, (w - LCW) / LRY)
        i = max(0, min(NP - 1, int(t / (math.pi / NP))))
        c = plank(P['plank'][(i + 2) % 3], 40 + i, n)(p, n) if not P['lacq'] else \
            metal_col(P['plank'][(i + 2) % 3], lighten(P['plank'][(i + 2) % 3], 0.35), gloss=0.45, spec='#ffd8d0')(p, n)
        if rr < 0.975: c = mul(c, 0.55)                # the seams between planks
        c = mul(c, 1 - 0.22 * smooth(0.33, 0.418, abs(p.x)))
        return c
    A.add(LO, MT, shell, shell_col, 'lid')
    for sx in (-1, 1):
        ends = [(0.0, 0.0)] + [lid_pt(math.pi - math.pi * k / 8, 0.022) for k in range(1, 8)] + [(0.62, 0.0)]
        ends = [(min(0.642, max(-0.02, w)), u) for w, u in ends]
        A.add(LO, MT, sweep(sorted([HINGE + X * (sx * 0.415), HINGE + X * (sx * 0.452)], key=lambda v: v.x), ends, up=Z, inset=0.08, cap_d=0.006),
              iron, 'lid_plates')
        path = [lid_world(*lid_pt(-0.07 + (math.pi + 0.14) * k / 4, 0.017), x=sx * 0.23) for k in range(5)]
        def rr_(hw, hh, r):
            pts = []
            for cx, cz, a0 in ((hw - r, hh - r, 0), (-hw + r, hh - r, 90), (-hw + r, -hh + r, 180), (hw - r, -hh + r, 270)):
                for j in range(2):
                    a = math.radians(a0 + 90 * j)
                    pts.append((cx + r * math.cos(a), cz + r * math.sin(a)))
            return pts
        A.add(LO, MT, sweep(path, [(0.016, 0.03), (0.0, 0.043), (-0.016, 0.03), (-0.016, -0.03), (0.0, -0.043), (0.016, -0.03)], up=X, inset=0.2, cap_d=0.004),
              iron, 'lid_straps')
        for t in (0.5, math.pi - 0.5):
            A_ = lid_world(*lid_pt(t, 0.034), x=sx * 0.23)
            dome_rivet(A, LO, MT, A_, lid_nrm(t), 0.019, rivc)
    A.add(LO, MT, rbox((0.87, 0.032, 0.052), r=0.016, M=M_at((0, HINGE.y - 0.624, HINGE.z + 0.024))), iron, 'lid_trim')
    A.add(LO, MT, rbox((0.1, 0.024, 0.15), r=0.022, M=M_at((0, -0.336, 0.47))), brass, 'hasp')
    dome_rivet(A, LO, MT, Vector((0, -0.347, 0.43)), -Y, 0.02, brass)
    if gold:   # a gold crest with a big pink gem on the lid's front slope, little gems on the straps and the hasp
        t = math.pi / 2 - 0.3; nn = lid_nrm(t); cc = lid_world(*lid_pt(t, 0.006))
        cr = lathe([(0.0, 0.0), (0.088, 0.0), (0.094, 0.012), (0.082, 0.024), (0.0, 0.026)], 10, th0=math.pi / 10)
        A.add(LO, MT, cr.xform(Matrix.Translation(cc) @ orient_to(nn)), brass, 'crest')
        gem(A, LO, MT, cc + nn * 0.045, 0.058, 0.08, orient_to(nn), '#ff5a9a', K=8, tag='crest')
        gem(A, LO, MT, Vector((0, -0.352, 0.49)), 0.024, 0.032, orient_to(-Y), '#ff5a9a', tag='crest')

    export(A, 'chest-' + kind, {'body': {}}, origins={'lid': HINGE})

# ================================================================== 2. pots
# The kit pot (lootModels.js buildPot): a lathe with a foot, belly, shoulder, neck and rolled rim, ~0.7 m to the
# knob, r ~0.28; the camera sees its game +x +z side (Blender +x -y), so the front motifs sit at -45 deg.
POT_FRONT = -math.pi / 4
POT_PROF = [(0.0, 0.0), (0.168, 0.0), (0.198, 0.016), (0.19, 0.042),
            (0.235, 0.085), (0.274, 0.148),
            (0.284, 0.176), (0.288, 0.19), (0.29, 0.24), (0.286, 0.29), (0.279, 0.305),
            (0.258, 0.345), (0.212, 0.408), (0.152, 0.462),
            (0.13, 0.49), (0.15, 0.524), (0.165, 0.538), (0.15, 0.555), (0.0, 0.552)]
def pot_r(z):
    pr = [q for q in POT_PROF if q[0] > 0]
    for (r0, z0), (r1, z1) in zip(pr, pr[1:]):
        if z0 <= z <= z1: return r0 + (r1 - r0) * (z - z0) / (z1 - z0)
    return pr[-1][0]
def on_pot(th, z, lift=0.0):
    """a point on the pot's surface at angle th / height z, its outward normal, tangent (round) and up-along vectors"""
    r = pot_r(z) + lift; dr = (pot_r(z + 0.006) - pot_r(z - 0.006)) / 0.012
    rad = Vector((math.cos(th), math.sin(th), 0.0))
    n = (rad - Z * dr).normalized(); tg = Vector((-math.sin(th), math.cos(th), 0.0))
    up = n.cross(tg).normalized()
    if up.z < 0: up = -up
    return rad * r + Z * z, n, tg, up


def pot_prof(add=(), drop=(), base=None):
    """the pot lathe profile with extra rows (crisp painted band edges) at the heights in add, rows at drop removed"""
    pr = [q for q in (base or POT_PROF) if not any(abs(q[1] - d) < 1e-6 for d in drop)]
    body = pr[1:-1]
    body += [(pot_r(z), z) for z in add]
    body.sort(key=lambda q: q[1])
    return [pr[0]] + body + [pr[-1]]

def drip_band(z_top, base, drips, body_k=14, thick=0.009, lip=0.012, mids=(0.6,)):
    """a glaze / frost shell hugging the pot from z_top down to a wavy edge with rounded drips (th offsets from the
    front, length, half-width): a light top, a rolled lip bulging proud, a tuck into the surface, back up the inside
    (a closed torus: top -> mid -> lip -> tuck -> inside -> top)"""
    dr = [((POT_FRONT + a) % TAU, L, w) for a, L, w in drips]
    # the base samples sit on the body lathe's vertex angles, so the body's facets never poke through the shell
    ths = sorted({round((POT_FRONT + math.pi / body_k + TAU * k / body_k) % TAU, 6) for k in range(body_k)} |
                 {round((a + o * w) % TAU, 6) for a, L, w in dr for o in (-0.6, 0.0, 0.6)})
    out = []
    for x in ths:
        if not out or x - out[-1] > 0.04: out.append(x)
    if TAU - out[-1] + out[0] < 0.04: out.pop()
    ths = out
    he = drip_he(lambda th: 0.0, dr)
    edge = lambda th: base(th) - he(th)
    def S(th, z, off):
        q, n, tg, up = on_pot(th, z); return q + n * off
    rows = [lambda th: (z_top, thick * 0.7)] + [lambda th, m=m: (z_top - m * (z_top - edge(th)), thick) for m in mids] + [
            lambda th: (edge(th) - 0.002, thick + lip * 0.7), lambda th: (edge(th) - 0.013, 0.001),
            lambda th: (z_top - 0.4 * (z_top - edge(th)), -0.006)]
    rings, cs = [], []
    for f in rows:
        ring = []
        for th in ths:
            z, off = f(th); ring.append(S(th, z, off))
        rings.append(ring); cs.append(Vector((0, 0, sum(v.z for v in ring) / len(ths))))
    t = Tmp(); ring_surface(t, rings, cs, closed=True)
    return t

def flat_star(c, n, up, r, ri, h, points=5, rot=0.0):
    """a chunky star (a bevelled prism) lying on a surface: centre c, outward n, 'up' in-plane"""
    K = points * 2
    t = lathe([(0.0, -0.004), (1.0, 0.0), (0.72, h * 0.6), (0.0, h)], K, th0=math.pi / 2 + rot,
              rfn=lambda rr, z, th: rr * (r if round((th - math.pi / 2 - rot) / (math.pi / points)) % 2 == 0 else ri))
    return t.xform(basis(c, n.cross(up).normalized() * -1, up, n))

def build_pot(theme):
    A = Asset(); OB, MT = 'pot', 'body'
    if theme == 'burrow':
        TC, TC_HI, TC_LO = '#c87a4c', '#e09a68', '#8a4a2e'
        CREAM, BAND = '#f6e0b6', '#7e4229'
        def body_col(p, n):
            z = p.z
            c = mix(TC, TC_HI, smooth(0.32, 0.5, z) * 0.6)
            if 0.175 <= z <= 0.306: c = CREAM if 0.189 <= z <= 0.291 else BAND
            if z < 0.05: c = mix(TC_LO, TC, smooth(0.0, 0.05, z) * 0.5)
            if n.z > 0: c = mix(c, lighten(c, 0.3), n.z * 0.7)
            else: c = mul(c, 1 + 0.36 * n.z)
            c = mul(c, 1 + 0.1 * (vnoise(p, 9, 4) - 0.5))
            c = mul(c, 1 - 0.25 * (1 - smooth(0.0, 0.06, z)))
            return c
        A.add(OB, MT, lathe(POT_PROF, 18, th0=POT_FRONT + math.pi / 18), body_col, 'body')
        # leaf sprigs with a berry round the cream band
        for k in range(4):
            th = POT_FRONT + TAU * k / 4
            S, n, tg, up = on_pot(th, 0.242)
            for e in (-1, 1):
                d = (tg * e * 0.86 + up * 0.5).normalized()
                c = S + d * 0.03 + n * 0.006
                M = basis(c, d, n.cross(d).normalized(), n)
                lf = ellipsoid(Vector((0, 0, 0)), (0.036, 0.019, 0.009), K=6, J=2).xform(M)
                A.add(OB, MT, lf, lambda p, n_, e=e: mix('#4e8a3a' if e > 0 else '#62a044', '#a8d870', clamp(n_.z * 0.6 + 0.2)), 'sprigs')
            b = ellipsoid(S - up * 0.014 + n * 0.012, (0.02, 0.02, 0.02), K=6, J=2)
            bc = '#e0463a' if k % 2 else '#f0a030'
            A.add(OB, MT, b, lambda p, n_, bc=bc: mix(darken(bc, 0.2), lighten(bc, 0.5), clamp(n_.z * 0.7 + 0.35)), 'sprigs')
        # twine round the neck, a bow at the front
        NZ, NR = 0.497, 0.142
        loop = [Vector((math.cos(a) * NR, math.sin(a) * NR, NZ + 0.004 * math.sin(3 * a))) for a in (TAU * k / 10 for k in range(10))]
        def twine(p, n):
            a = math.atan2(p.y, p.x); tw = math.atan2(p.z - NZ, math.hypot(p.x, p.y) - NR)
            return mul(mix('#e6c886', '#b8955a', 0.5 + 0.5 * math.sin(2 * tw + a * 9)), 0.85 + 0.2 * clamp(n.z + 0.4))
        A.add(OB, MT, tube_loop(loop, lambda s: 0.015, K=4), twine, 'twine')
        S, n, tg, up = on_pot(POT_FRONT, NZ, 0.03)
        for e in (-1, 1):
            d = (tg * e + up * 0.35).normalized()
            M = basis(S + d * 0.034, d, n.cross(d).normalized(), n)
            A.add(OB, MT, ellipsoid(Vector((0, 0, 0)), (0.036, 0.024, 0.013), K=6, J=2).xform(M), twine, 'bow')
        A.add(OB, MT, ellipsoid(S + n * 0.004, (0.02, 0.02, 0.02), K=6, J=2), twine, 'bow')
        # the acorn cap: three shingled tiers of scales (scalloped lower edges, dark tucks between), a curled stem
        # the acorn cap: a dome of staggered scalloped scale rows (light knobs) over dark grooves, a rolled lip, a stem
        CK = 14
        CROWS = {0.532: ('under', 0), 0.552: ('lip', 0), 0.566: ('groove', 0), 0.58: ('scale', 0), 0.594: ('groove', 0),
                 0.607: ('scale', 1), 0.619: ('groove', 0), 0.63: ('scale', 0), 0.643: ('top', 0)}
        def cap_row(z): return CROWS[min(CROWS, key=lambda q: abs(q - z))]
        def lobe(th, ph): return math.cos(CK / 2 * (th - POT_FRONT) + ph * math.pi)
        def cap_r(rr, z, th):
            kind, ph = cap_row(z)
            return rr * (1 + 0.06 * lobe(th, ph)) if kind == 'scale' else rr
        cap = lathe([(0.0, 0.528)] + [(r, z) for r, z in zip((0.176, 0.192, 0.18, 0.176, 0.158, 0.146, 0.118, 0.098, 0.05), sorted(CROWS))] + [(0.0, 0.65)],
                    CK, th0=POT_FRONT, rfn=cap_r)
        def cap_col(p, n):
            kind, ph = cap_row(p.z)
            if kind == 'under': c = '#4a2e1a'
            elif kind == 'groove': c = '#5e3c22'
            elif kind == 'lip': c = '#9a6840'
            elif kind == 'top': c = '#a87446'
            else: c = '#cc965c' if lobe(math.atan2(p.y, p.x), ph) > 0 else '#8a5c36'
            if n.z > 0: c = mix(c, lighten(c, 0.22), n.z * 0.45)
            else: c = mul(c, 1 + 0.35 * n.z)
            return c
        A.add(OB, MT, cap, cap_col, 'cap')
        A.add(OB, MT, tube([Vector((0.0, 0.0, 0.645)), Vector((0.006, -0.004, 0.69)), Vector((0.03, -0.014, 0.722))],
                           lambda s: 0.022 - 0.006 * s, K=4), lambda p, n: mix('#5a3a24', '#8a6040', clamp(n.z)), 'cap')
    elif theme in ('shrine', 'moon'):     # the porcelain ginger jar: indigo bands and flowers, a red cord, a domed cap
        moon = theme == 'moon'
        IND = '#4a56a8' if moon else '#2e4a8a'; WHT = '#eef0fa' if moon else '#f6f2ec'
        FC = '#c8d0ff' if moon else '#f0c040'; KNOB = ('#c8c8e4', '#f4f4ff') if moon else ('#d89a2c', '#fff0a0')
        prof = pot_prof(add=(0.052, 0.112, 0.12, 0.138, 0.398), drop=(0.148, 0.176, 0.19, 0.29, 0.305))
        def ind_at(z):
            return z <= 0.045 or 0.116 <= z <= 0.142 or 0.405 <= z <= 0.465 or z >= 0.52
        def body_col(p, n):
            c = IND if ind_at(p.z) else WHT
            if c == WHT: c = mix(WHT, mix(WHT, IND, 0.12), smooth(0.2, 0.0, p.z) * 0.6)     # a cool bloom low down
            if n.z > 0: c = mix(c, lighten(c, 0.35), n.z * 0.6)
            else: c = mul(c, 1 + 0.34 * n.z)
            if not ind_at(p.z): c = mul(c, 0.94)
            return mul(c, 1 - 0.22 * (1 - smooth(0.0, 0.05, p.z)))
        A.add(OB, MT, lathe(prof, 16, th0=POT_FRONT + math.pi / 16), body_col, 'body')
        # five-petal flowers round the belly (a lobed rosette each, its heart in a warm or moonlit dot)
        for k in range(5):
            th = POT_FRONT + TAU * k / 5
            S, n, tg, up = on_pot(th, 0.235, 0.002)
            ros = lathe([(0.0, -0.004), (0.046, 0.0), (0.0, 0.01)], 20, th0=0.0,
                        rfn=lambda rr, z, th_: rr * (0.5 + 0.5 * abs(math.cos(2.5 * th_)) ** 0.7))
            Mf = basis(S, -tg, up, n)
            def fcol(q, nn, S=S):
                d = (q - S).length
                return mix(FC, IND, smooth(0.01, 0.022, d))
            A.add(OB, MT, ros.xform(Mf), fcol, 'flowers')
        # the red cord round the shoulder, a knot and a tassel at the front
        CZ_ = 0.398; CR_ = pot_r(CZ_) + 0.012
        loop = [Vector((math.cos(a) * CR_, math.sin(a) * CR_, CZ_)) for a in (POT_FRONT + TAU * k / 16 for k in range(16))]
        cord = lambda q, nn: mix('#a82a30', '#ff6a5a', clamp(nn.z * 0.6 + 0.35))
        A.add(OB, MT, tube_loop(loop, lambda s_: 0.013, K=4), cord, 'cord')
        S, n, tg, up = on_pot(POT_FRONT, CZ_, 0.026)
        A.add(OB, MT, ellipsoid(S, (0.026, 0.026, 0.026), K=6, J=2), cord, 'cord')
        tz = CZ_ - 0.09
        Q, n2, _, _ = on_pot(POT_FRONT, tz, 0.03)
        A.add(OB, MT, lathe([(0.0, -0.065), (0.03, -0.05), (0.024, 0.0), (0.012, 0.04), (0.0, 0.06)], 6).xform(Matrix.Translation(Q)),
              lambda q, nn, Q=Q: mix('#c8303a', '#ff7a6a', clamp((q.z - Q.z + 0.065) / 0.12)) if q.z < Q.z + 0.03 else '#e8b040', 'cord')
        # a white collar, the domed indigo cap, a knob
        cap = lathe([(0.0, 0.528), (0.178, 0.53), (0.184, 0.548), (0.17, 0.557), (0.162, 0.565), (0.14, 0.604), (0.09, 0.632), (0.0, 0.643)],
                    16, th0=POT_FRONT)
        def cap_col(q, nn):
            c = WHT if q.z < 0.559 else IND
            if nn.z > 0: c = mix(c, lighten(c, 0.4), nn.z * 0.6)
            else: c = mul(c, 1 + 0.35 * nn.z)
            return c
        A.add(OB, MT, cap, cap_col, 'cap')
        A.add(OB, MT, ellipsoid(Vector((0, 0, 0.665)), (0.036, 0.036, 0.032), K=8, J=3), metal_col(KNOB[0], KNOB[1], gloss=0.5), 'cap')
    elif theme == 'kitchen':           # a drip-glazed crock under a tied cloth cover, a paper label with a red seal
        prof = pot_prof(drop=(0.176, 0.19, 0.29, 0.305))
        def body_col(p, n):
            c = '#f0dcb8'
            if p.z < 0.03: c = '#c8a888'
            if n.z > 0: c = mix(c, lighten(c, 0.4), n.z * 0.6)
            else: c = mul(c, 1 + 0.3 * n.z)
            c = mul(c, 1 + 0.08 * (vnoise(p, 8, 2) - 0.5))
            return mul(c, 1 - 0.22 * (1 - smooth(0.0, 0.05, p.z)))
        A.add(OB, MT, lathe(prof, 14, th0=POT_FRONT + math.pi / 14), body_col, 'body')
        gbase = lambda th: 0.335 + 0.012 * math.sin(3 * th + 0.7)
        gdrips = [(-0.35, 0.1, 0.2), (0.45, 0.07, 0.17), (1.6, 0.11, 0.21), (2.7, 0.06, 0.17), (3.9, 0.09, 0.2), (5.1, 0.075, 0.18)]
        def glaze(q, nn):
            c = mix('#6a3620', '#a8643c', clamp(nn.z * 0.8 + 0.1))
            if nn.z > 0.55: c = mix(c, '#d8946a', 0.35)                                   # a glint on the glaze
            if nn.z < -0.2: c = mul(c, 0.8)
            return c
        A.add(OB, MT, drip_band(0.465, gbase, gdrips, mids=(0.3, 0.65)), glaze, 'glaze')
        # the paper label at the front, a red seal stamp, brushed strokes
        S, n, tg, up = on_pot(POT_FRONT + 0.5, 0.165, -0.002)
        ML = basis(S, -tg, up, n)
        A.add(OB, MT, rbox((0.1, 0.13, 0.012), r=0.005, M=ML), lambda q, nn: mix('#e8dcc4', '#fff4e0', clamp(nn.dot(n))), 'label')
        A.add(OB, MT, ellipsoid(Vector((0, 0, 0)), (0.022, 0.022, 0.006), K=8, J=2).xform(ML @ Matrix.Translation((0.02, 0.038, 0.006))), lambda q, nn: '#d83a32', 'label')
        for i, (u, v, L) in enumerate(((-0.018, 0.008, 0.045), (0.01, -0.024, 0.05))):
            A.add(OB, MT, ellipsoid(Vector((0, 0, 0)), (0.008, L / 2, 0.004), K=6, J=2).xform(ML @ Matrix.Translation((u, v, 0.006))), lambda q, nn: '#3a2a2a', 'label')
        # the cloth cover: a dome over the mouth, gathered at the tie, a flared wavy hem
        def cloth_r(rr, z, th):
            a = th - POT_FRONT
            return rr * (1 + 0.07 * math.cos(8 * a)) if z < 0.5 else rr * (1 + 0.025 * math.cos(8 * a))
        cl = lathe([(0.0, 0.47), (0.2, 0.432), (0.214, 0.444), (0.168, 0.53), (0.2, 0.564), (0.198, 0.598), (0.13, 0.628), (0.0, 0.636)],
                   16, th0=POT_FRONT, rfn=cloth_r)
        def cloth_col(q, nn):
            c = '#e0503e'
            if q.z < 0.525:
                a = math.atan2(q.y, q.x) - POT_FRONT
                c = '#e0503e' if math.cos(8 * a) > 0 else '#c23e30'                         # folds
            if nn.z > 0: c = mix(c, lighten(c, 0.3), nn.z * 0.55)
            else: c = mul(c, 1 + 0.4 * nn.z)
            return c
        A.add(OB, MT, cl, cloth_col, 'cloth')
        for i in range(6):                   # polka dots on the dome
            a = POT_FRONT + i / 6 * TAU + 0.3
            d = Vector((math.cos(a) * 0.7, math.sin(a) * 0.7, 1)).normalized()
            c = Vector((math.cos(a) * 0.13, math.sin(a) * 0.13, 0.624))
            A.add(OB, MT, ellipsoid(Vector((0, 0, 0)), (0.02, 0.02, 0.007), K=6, J=2).xform(Matrix.Translation(c) @ orient_to(d)), lambda q, nn: '#fff0e4', 'cloth')
        # the tie cord and its bow
        TZ, TR = 0.53, 0.172
        loop = [Vector((math.cos(a) * TR, math.sin(a) * TR, TZ)) for a in (TAU * k / 10 for k in range(10))]
        tie = lambda q, nn: mix('#4a2e20', '#7a5038', clamp(nn.z * 0.6 + 0.4))
        A.add(OB, MT, tube_loop(loop, lambda s_: 0.013, K=4), tie, 'tie')
        S, n, tg, up = on_pot(POT_FRONT, 0.505, 0.06)
        S = Vector((math.cos(POT_FRONT) * (TR + 0.01), math.sin(POT_FRONT) * (TR + 0.01), TZ))
        for e in (-1, 1):
            d = (tg * e + up * 0.3).normalized()
            A.add(OB, MT, ellipsoid(Vector((0, 0, 0)), (0.038, 0.022, 0.012), K=6, J=2).xform(basis(S + d * 0.034, d, n.cross(d).normalized(), n)), tie, 'tie')
        A.add(OB, MT, ellipsoid(S, (0.018, 0.018, 0.018), K=6, J=2), tie, 'tie')
    elif theme == 'crystal':           # the crystal grotto: a lavender jar iced with frost drips, stars, a frosted cap, a crystal knob
        prof = pot_prof(drop=(0.176, 0.19, 0.29, 0.305))
        def body_col(p, n):
            c = mix('#6a5ea8', '#a294da', smooth(0.0, 0.42, p.z))
            if p.z < 0.03: c = '#dfe6ff'
            if n.z > 0: c = mix(c, lighten(c, 0.35), n.z * 0.6)
            else: c = mul(c, 1 + 0.32 * n.z)
            return mul(c, 1 - 0.2 * (1 - smooth(0.0, 0.05, p.z)))
        A.add(OB, MT, lathe(prof, 14, th0=POT_FRONT + math.pi / 14), body_col, 'body')
        fbase = lambda th: 0.405 + 0.012 * math.sin(2 * th + 0.3)
        fdrips = [(-0.1, 0.085, 0.2), (0.95, 0.06, 0.17), (2.0, 0.1, 0.21), (3.2, 0.055, 0.16), (4.3, 0.08, 0.19), (5.35, 0.065, 0.17)]
        def frost(q, nn):
            c = mix('#b4c0ec', '#f4f8ff', clamp(nn.z * 0.9 + 0.35))
            if nn.z < -0.15: c = mix(c, '#9aa6dc', 0.5)                                     # darker drip undersides
            return c
        A.add(OB, MT, drip_band(0.5, fbase, fdrips, thick=0.01, lip=0.014), frost, 'frost')
        for k in range(5):
            th = POT_FRONT + TAU * k / 5 + 0.2
            S, n, tg, up = on_pot(th, 0.2 if k % 2 else 0.25, 0.002)
            sc = '#bff4ff' if k % 2 else '#ffd0f0'
            A.add(OB, MT, flat_star(S, n, up, 0.038, 0.017, 0.012, rot=0.15 * (k - 2)), lambda q, nn, sc=sc: mix(darken(sc, 0.15), lighten(sc, 0.5), clamp(nn.z * 0.5 + 0.4)), 'stars')
        NZ, NR = 0.497, 0.142
        loop = [Vector((math.cos(a) * NR, math.sin(a) * NR, NZ)) for a in (TAU * k / 10 for k in range(10))]
        A.add(OB, MT, tube_loop(loop, lambda s_: 0.017, K=4), lambda q, nn: mix('#c8d4f4', '#f4f8ff', clamp(nn.z * 0.7 + 0.4)), 'cap')
        cap = lathe([(0.0, 0.528), (0.172, 0.53), (0.18, 0.548), (0.16, 0.58), (0.11, 0.608), (0.0, 0.618)], 16, th0=POT_FRONT,
                    rfn=lambda rr, z, th: rr * (1 + (0.05 * math.cos(6 * (th - POT_FRONT)) if 0.54 < z < 0.56 else 0.0)))
        A.add(OB, MT, cap, lambda q, nn: mix('#c4cef0', '#f4f8ff', clamp(nn.z * 0.8 + 0.3)), 'cap')
        def crys(c, d, r, h, col, K=6):
            t = lathe([(0.0, -0.02), (r, 0.0), (r * 0.92, h * 0.68), (0.0, h)], K, th0=0.3)
            A.add(OB, MT, t.xform(Matrix.Translation(c) @ orient_to(d)),
                  lambda q, nn: mix(darken(col, 0.2), lighten(col, 0.6), clamp(nn.z * 0.5 + 0.45 + 0.3 * ((q - c).length / h))), 'crystal')
        crys(Vector((0, 0, 0.605)), (0.1, -0.05, 1), 0.045, 0.15, '#7ae8ff')
        crys(Vector((0.04, 0.025, 0.6)), (0.6, 0.3, 1), 0.026, 0.085, '#ff9ae8')
        crys(Vector((-0.035, -0.02, 0.598)), (-0.5, -0.4, 1), 0.022, 0.07, '#b8a8ff')
    export(A, 'pot-' + theme, {'body': {}})

# ================================================================== 3. buff shrines
# The kit (dungeonMode.js makeShrine): a 0.8 x 1.1 x 0.8 stone body, a cone roof to ~1.55 m, the orb (r 0.18) at
# game (0, 0.8, 0.42) -> Blender (0, -0.42, 0.8), bobbing +-0.06. One shared hokora; each type its emblem and colour.
SHRINES = {
    'zoomies': dict(col='#8fe0c0', emblem='paw_run'),
    'goodboy': dict(col='#ffb0d0', emblem='heart'),
    'lucky': dict(col='#ffd84a', emblem='coin'),
    'sparkle': dict(col='#b8a8ff', emblem='star'),
    'snack': dict(col='#ff9a6a', emblem='bone'),
}
ORB_C = Vector((0.0, -0.42, 0.8))
STONE_S, STONE_S_HI, STONE_S_LO = '#b8b0b8', '#e6dee0', '#7c7284'
ROOF_S, ROOF_S_HI, ROOF_S_LO = '#6e5e92', '#a696cc', '#3c3252'

def tile_roof(LX, DY, RZ0, RZ1, TH, NRoll=5, NX=14):
    """the waystone's curved gable roof, ridge along local x: returns (tmp, roof_top(x, v), roll(x)); v -1..1 across"""
    def roof_top(x, v):
        tt = abs(v); u = abs(x) / LX
        f = tt * (1 + 0.55 * (1 - tt))
        z = RZ1 - (RZ1 - RZ0) * f
        z += 0.05 * tt ** 5 * (0.35 + 0.65 * u ** 3)
        return z
    def roll(x):
        ph = (x / (2 * LX) + 0.5) * NRoll
        return 0.5 - 0.5 * math.cos(TAU * ph)
    vs = [-1.0, -0.72, -0.4, -0.12, 0.0, 0.12, 0.4, 0.72, 1.0]
    xs = [-LX + 2 * LX * i / NX for i in range(NX + 1)]
    def profile(x):
        top = [(v * DY, roof_top(x, v) + 0.016 * roll(x) * smooth(0.0, 0.2, abs(v))) for v in vs]
        und = [(v * (DY - 0.012), roof_top(x, v) - TH + 0.012 * abs(v)) for v in reversed(vs)]
        tipb = (DY + 0.022, roof_top(x, 1) - TH * 0.45)
        tipf = (-DY - 0.022, roof_top(x, -1) - TH * 0.45)
        return top + [tipb] + und + [tipf]
    rf = Tmp(); rings = []; cs = []
    for x in xs:
        pr = profile(x); rings.append([Vector((x, w, z)) for w, z in pr]); cs.append(Vector((x, 0, RZ1 - 0.15)))
    n = len(vs)
    def inset(ring, x_in):
        outr = []
        for k, p in enumerate(ring):
            if k < n: q = ring[n + 1 + (n - 1 - k)]
            elif k == n: q = ring[k]
            elif k < 2 * n + 1: q = ring[n - 1 - (k - n - 1)]
            else: q = ring[k]
            m = (p + q) / 2
            outr.append(Vector((p.x + x_in, m.y + (p.y - m.y) * 0.55, m.z + (p.z - m.z) * 0.55)))
        return outr
    rings = [inset(rings[0], -0.012)] + rings + [inset(rings[-1], 0.012)]
    cs = [cs[0] - X * 0.012] + cs + [cs[-1] + X * 0.012]
    ids = ring_surface(rf, rings, cs)
    for a, sgn in ((ids[0], -1), (ids[-1], 1)):
        nrm = X * sgn
        for k in range(n - 1):
            p0, p1 = a[k], a[k + 1]
            q0, q1 = a[n + 1 + (n - 1 - k)], a[n + 1 + (n - 1 - (k + 1))]
            rf.face([p0, p1, q1, q0], nrm)
        rf.face([a[n - 1], a[n], a[n + 1]], nrm)
        rf.face([a[0], a[2 * n + 1], a[2 * n]], nrm)
    return rf, roof_top, roll

def emblem(A, obj, mat, kind, Mp, s, col_hi, col_lo):
    """a raised emblem on a plate: Mp maps plate-local (u right, v up, w out) to the world; s its scale (~0.05 m)"""
    R = Mp.to_3x3(); W_ = (R @ Z).normalized()
    def ecol(p, n): return mix(col_lo, col_hi, clamp(n.dot(W_) * 0.7 + 0.1 + 0.3 * clamp(n.z)))
    def ell(u, v, ru, rv, rw, rot=0.0, K=8, J=2):
        t = ellipsoid(Vector((0, 0, 0)), (ru, rv, rw), K=K, J=J)
        A.add(obj, mat, t.xform(Mp @ Matrix.Translation((u, v, 0.0)) @ Matrix.Rotation(rot, 4, 'Z')), ecol, 'emblem')
    def bar(u, v, L, th, rot=0.0):
        A.add(obj, mat, rbox((L, th, th * 0.7), r=th * 0.34, M=Mp @ Matrix.Translation((u, v, 0.0)) @ Matrix.Rotation(rot, 4, 'Z')), ecol, 'emblem')
    s = s * {'heart': 1.3, 'star': 1.12, 'bone': 1.15, 'coin': 1.05}.get(kind, 1.0)
    if kind == 'paw_run':        # a running paw: a pad, four beans leaning forward, three speed lines behind
        lean = -0.38
        def rot2(u, v): c, s_ = math.cos(lean), math.sin(lean); return (u * c - v * s_, u * s_ + v * c)
        pu, pv = 0.16 * s, -0.25 * s
        ell(pu, pv, 0.52 * s, 0.44 * s, 0.2 * s, rot=lean, K=10)
        for k, (a, d, rr) in enumerate(((150, 0.72, 0.21), (112, 0.86, 0.23), (68, 0.86, 0.23), (30, 0.72, 0.21))):
            du, dv = rot2(math.cos(math.radians(a)) * d * s, math.sin(math.radians(a)) * d * s)
            ell(pu + du, pv + dv + 0.08 * s, rr * s, rr * 1.2 * s, 0.17 * s, rot=lean + math.radians(a - 90), K=7)
        for k, (v, L) in enumerate(((0.35, 0.55), (-0.05, 0.75), (-0.45, 0.5))):
            bar(-0.72 * s - L * s * 0.5 + 0.1 * s, v * s, L * s, 0.15 * s)

    elif kind == 'heart':         # a plump heart: two lobes meeting in a point, a little highlight bean
        for e in (-1, 1):
            ell(e * 0.3 * s, 0.12 * s, 0.42 * s, 0.78 * s, 0.24 * s, rot=-e * 0.72, K=10, J=3)
        ell(-0.34 * s, 0.42 * s, 0.13 * s, 0.09 * s, 0.27 * s, rot=0.5, K=6)
    elif kind == 'coin':          # the lucky cat's koban: an oval gold coin with cat ears, a band and a paw dot
        ell(0.0, -0.08 * s, 0.62 * s, 0.86 * s, 0.2 * s, K=12, J=3)
        for e in (-1, 1):
            ell(e * 0.36 * s, 0.82 * s, 0.2 * s, 0.26 * s, 0.17 * s, rot=-e * 0.45, K=6)
        bar(0.0, 0.18 * s, 0.9 * s, 0.13 * s)
        bar(0.0, -0.34 * s, 0.9 * s, 0.13 * s)
        ell(0.0, -0.08 * s, 0.14 * s, 0.14 * s, 0.27 * s, K=6)
    elif kind == 'star':          # a big five-point star and a twinkle
        A.add(obj, mat, flat_star(Mp @ Vector((-0.08 * s, -0.06 * s, 0)), W_, (R @ Y).normalized(), 0.9 * s, 0.4 * s, 0.24 * s), ecol, 'emblem')
        A.add(obj, mat, flat_star(Mp @ Vector((0.7 * s, 0.62 * s, 0)), W_, (R @ Y).normalized(), 0.3 * s, 0.09 * s, 0.2 * s, points=4), ecol, 'emblem')
    elif kind == 'bone':          # a bone treat, tilted: a shaft and two knobbly ends
        rot = 0.5
        bar(0.0, 0.0, 1.2 * s, 0.36 * s, rot=rot)
        for e in (-1, 1):
            cu, cv = e * 0.64 * s * math.cos(rot), e * 0.64 * s * math.sin(rot)
            for f in (-1, 1):
                ell(cu + f * 0.17 * s * -math.sin(rot), cv + f * 0.17 * s * math.cos(rot), 0.24 * s, 0.24 * s, 0.2 * s, K=8)

def build_shrine(stype):
    SP = SHRINES[stype]; TC = SP['col']
    A = Asset(); rng = random.Random(53)
    BO, MT = 'base', 'body'
    TC_HI, TC_LO = lighten(TC, 0.45), darken(TC, 0.55)
    def stone(base=STONE_S, seed=0, ao_z=0.0, ao_k=0.25, ao_h=0.12, tint=None, tint_dir=None, eave=False):
        def f(p, n):
            c = mix(base, STONE_S_HI, clamp(n.z) * 0.55)
            if n.z < 0: c = mix(c, STONE_S_LO, -n.z * 0.7)
            c = mul(c, 0.94 + 0.12 * vnoise(p, 5.5, seed))
            c = mul(c, 1 - ao_k * (1 - smooth(0.0, ao_h, p.z - ao_z)))
            if eave and n.z < 0.5: c = mix(c, STONE_S_LO, 0.55 * smooth(0.75, 1.15, p.z))   # the roof's shade on the walls
            if tint and tint_dir is not None and n.dot(tint_dir) > 0.5:
                c = mix(c, tint, 0.3 * (1 - smooth(0.1, 0.4, (p - ORB_C).length)))
            return c
        return f
    VERM, VERM_HI, VERM_LO = '#e2573a', '#ff8a5e', '#a8382a'
    verm = metal_col(VERM, VERM_HI, gloss=0.35, spec='#ffe0c8')
    GOLDC = metal_col('#e0a030', '#fff0a0', gloss=0.6)

    # ---------------- the stepped stone base and the pedestal
    A.add(BO, MT, rbox((0.92, 0.92, 0.1), r=0.04, M=M_at((0, 0, 0.05), rz=0.01)), stone(mul(STONE_S, 0.86), 1, ao_k=0.3, ao_h=0.06), 'base')
    A.add(BO, MT, rbox((0.82, 0.84, 0.09), r=0.035, M=M_at((0, -0.015, 0.14), rz=-0.012)), stone(mul(STONE_S, 0.94), 2, ao_z=0.095, ao_k=0.2, ao_h=0.05), 'base')
    A.add(BO, MT, rbox((0.66, 0.70, 0.31), r=0.04, M=M_at((0, -0.03, 0.335))), stone(STONE_S, 3, ao_z=0.18, ao_k=0.25, ao_h=0.1), 'pedestal')
    A.add(BO, MT, rbox((0.46, 0.03, 0.19), r=0.012, M=M_at((0, -0.384, 0.335))), stone(mul(STONE_S, 0.82), 4), 'pedestal')
    A.add(BO, MT, rbox((0.74, 0.78, 0.065), r=0.028, M=M_at((0, -0.03, 0.5125))), stone(mix(STONE_S, STONE_S_HI, 0.15), 5, ao_k=0.0), 'pedestal')
    Z0 = 0.545                                   # the niche floor / house base
    ZT = 1.15                                    # the walls' top
    # ---------------- the house: a back block, two side pillars and a lintel round an open niche
    A.add(BO, MT, rbox((0.62, 0.40, ZT - Z0), r=0.035, M=M_at((0, 0.10, (Z0 + ZT) / 2))), stone(STONE_S, 6, ao_z=Z0, ao_k=0.2, ao_h=0.1, eave=True), 'house')
    for sx in (-1, 1):
        A.add(BO, MT, rbox((0.11, 0.27, ZT - Z0), r=0.035, M=M_at((sx * 0.255, -0.235, (Z0 + ZT) / 2))),
              stone(STONE_S, 7 + sx, ao_z=Z0, ao_k=0.2, ao_h=0.1, tint=TC, tint_dir=-X * sx, eave=True), 'house')
    A.add(BO, MT, rbox((0.62, 0.27, 0.09), r=0.03, M=M_at((0, -0.235, 1.105))), stone(STONE_S, 9), 'house')
    # the niche's back wall: a dense panel washed with the orb's light
    def glow_wall(p, n):
        d = math.hypot(p.x, (p.z - 0.8) * 0.9)
        c = mix(mix(TC_HI, TC, 0.3), darken(mix(STONE_S, TC, 0.35), 0.35), smooth(0.04, 0.3, d))
        return c
    A.add(BO, MT, grid_slab(0.40, 0.52, 6, 7, 0.0, 0.03).xform(Matrix.Translation((0, -0.104, 0.805))), glow_wall, 'niche')
    # the vermilion frame: two engaged posts and a head beam with turned-up ends
    for sx in (-1, 1):
        post = lathe([(0.0, Z0 - 0.01), (0.042, Z0 - 0.01), (0.04, 1.0), (0.038, 1.145), (0.0, 1.145)], 8, th0=math.pi / 8)
        A.add(BO, MT, post.xform(Matrix.Translation((sx * 0.245, -0.372, 0))), verm, 'frame')
        A.add(BO, MT, lathe([(0.0, Z0 - 0.01), (0.058, Z0 - 0.01), (0.06, Z0 + 0.02), (0.05, Z0 + 0.05), (0.0, Z0 + 0.05)], 8, th0=math.pi / 8)
              .xform(Matrix.Translation((sx * 0.245, -0.372, 0))), GOLDC, 'frame')
    bpath = [Vector((-0.36 + 0.72 * i / 6, -0.378, 1.112 + 0.03 * abs(-1 + 2 * i / 6) ** 3)) for i in range(7)]
    def rrect(hw, hh, r, k=2):
        pts = []
        for cx, cz, a0 in ((hw - r, hh - r, 0), (-hw + r, hh - r, 90), (-hw + r, -hh + r, 180), (hw - r, -hh + r, 270)):
            for j in range(k):
                a = math.radians(a0 + 90 * j / max(1, k - 1))
                pts.append((cx + r * math.cos(a), cz + r * math.sin(a)))
        return pts
    A.add(BO, MT, sweep(bpath, rrect(0.034, 0.036, 0.016), up=Z, inset=0.25, cap_d=0.008), verm, 'frame')
    # the valance: a cloth in the shrine's colour with three scallops, hung from the beam
    VW, VH = 0.44, 0.06
    def scal(x):
        ph = (x / VW + 0.5) * 3
        return 0.03 * math.sin(math.pi * (ph % 1.0)) ** 0.8
    val = grid_slab(VW, VH, 12, 1, 0.0, 0.016)
    val.v = [Vector((p.x, p.y, p.z - (scal(p.x) if p.z < -VH / 2 + 1e-6 else 0.0))) for p in val.v]
    val.n = [None] * len(val.v)
    val.xform(Matrix.Translation((0, -0.418, 1.112)))
    A.add(BO, MT, val, lambda p, n: mul(mix(TC, TC_HI, clamp((p.z - 1.06) / 0.07) * 0.6), 0.82 + 0.18 * clamp(-n.y)), 'valance')
    # the lotus stand under the orb
    lot = lathe([(0.0, 0.0), (0.06, 0.0), (0.1, 0.018), (0.122, 0.042), (0.102, 0.05), (0.0, 0.032)], 16, th0=0.0,
                rfn=lambda rr, z, th: rr * (1 + (0.14 * math.cos(8 * th) if z > 0.01 else 0.0)))
    def lot_col(p, n):
        r = math.hypot(p.x, p.y + 0.29)
        if r < 0.075 and n.z > 0.5: return mix('#e0a030', '#fff0a0', 0.6)
        return mix(mix(TC, '#fff6ea', 0.35), TC_LO, clamp(-n.z * 0.6 + 0.1 * (1 - smooth(0.05, 0.12, r))))
    A.add(BO, MT, lot.xform(Matrix.Translation((0, -0.29, Z0))), lot_col, 'lotus')

    # ---------------- the tiled roof, ridge front-to-back (the gable faces the camera)
    LX, DY = 0.44, 0.49
    RZ0, RZ1, TH = 1.16, 1.48, 0.07
    RC = Vector((0.0, -0.015, 0.0))
    MR = Matrix.Translation(RC) @ Matrix.Rotation(math.pi / 2, 4, 'Z')
    MRi = MR.inverted(); RRi = MRi.to_3x3()
    rf, roof_top, roll = tile_roof(LX, DY, RZ0, RZ1, TH, NRoll=5, NX=14)
    def roof_col(p, nn):
        q = MRi @ p; nl = (RRi @ nn).normalized()
        v = clamp(q.y / DY, -1, 1)
        if nl.z < -0.35: return mul(ROOF_S_LO, 0.9)
        c = mix(ROOF_S_HI, ROOF_S, smooth(0.0, 1.0, abs(v)) * 0.9)
        if abs(nl.z) < 0.5 and abs(nl.x) < 0.6: c = mix(ROOF_S, ROOF_S_LO, 0.4)
        if abs(nl.x) > 0.8: c = mix(ROOF_S, ROOF_S_LO, 0.45)
        c = mul(c, 0.68 + 0.32 * roll(q.x) ** 0.7)
        return c
    A.add(BO, MT, rf.xform(MR), roof_col, 'roof')
    # the gable infill under the roof (timber), from the house front to the back
    gz0 = ZT - 0.012
    gpro = [(-0.3, gz0)]
    for k in range(9):
        yy = -0.3 + 0.6 * k / 8
        gpro.append((yy, roof_top(0.0, yy / DY) - TH + 0.012 * abs(yy / DY) - 0.004))
    gpro.append((0.3, gz0))
    gpro = [(-w, z) for w, z in gpro]
    gzc = sum(q[1] for q in gpro) / len(gpro)
    gpro = [(w, z - gzc) for w, z in gpro]
    gab = sweep([Vector((0, -0.372, gzc)), Vector((0, 0.29, gzc))], gpro, up=Z, inset=0.04, cap_d=0.004)
    A.add(BO, MT, gab, lambda p, n: mul(mix('#7a4a3c', '#9a6450', clamp(n.z + 0.2) * 0.5), 0.92 + 0.12 * smooth(1.18, 1.38, p.z)), 'gable')
    # the ridge: a rounded cap beam with onigawara ends
    ridge = sweep([MR @ Vector((x, 0, RZ1 + 0.026)) for x in (-LX + 0.02, 0.0, LX - 0.02)], rrect(0.05, 0.034, 0.024), up=Z, inset=0.2, cap_d=0.01)
    A.add(BO, MT, ridge, lambda p, n: mix(ROOF_S_LO, ROOF_S_HI, clamp(n.z * 0.7 + 0.25)), 'ridge')
    for sx in (-1, 1):
        A.add(BO, MT, rbox((0.13, 0.07, 0.12), r=0.035, M=MR @ Matrix.Translation((sx * (LX - 0.01), 0, RZ1 + 0.035)) @ Matrix.Rotation(-math.pi / 2, 4, 'Z')),
              lambda p, n: mix(ROOF_S_LO, ROOF_S_HI, clamp(n.z * 0.6 + 0.3)), 'ridge')
    # round windows in the side walls, glowing with the orb's colour, in vermilion rings
    for sx in (-1, 1):
        wc = Vector((sx * 0.311, 0.07, 0.84))
        ring = [wc + Vector((0, math.cos(a) * 0.095, math.sin(a) * 0.095)) for a in (TAU * k / 12 for k in range(12))]
        A.add(BO, MT, tube_loop(ring, lambda s: 0.022, K=4, up=X), verm, 'windows')
        pane = lathe([(0.0, -0.01), (0.09, -0.01), (0.09, 0.0), (0.0, 0.0)], 12, th0=0.0)
        A.add(BO, MT, pane.xform(Matrix.Translation(wc) @ orient_to(X * sx)),
              lambda p, n, wc=wc: mix(TC_HI, mix(TC, STONE_S_LO, 0.35), smooth(0.0, 0.09, (p - wc).length)), 'windows')
    # the emblem again, large, on the pedestal's front panel
    emblem(A, BO, MT, SP['emblem'], M_at((0.012, -0.399, 0.33), rx=math.pi / 2), 0.088, TC_HI, TC)
    # the crest: a gold medallion on the gable with the emblem in relief
    MC = M_at((0, -0.374, 1.235), rx=math.pi / 2)
    med = lathe([(0.0, 0.0), (0.088, 0.0), (0.092, 0.014), (0.084, 0.027), (0.072, 0.025), (0.068, 0.017), (0.0, 0.017)], 16, th0=0.0)
    def med_col(p, n):
        r = math.hypot(p.x, p.z - 1.235)
        if r > 0.066: return metal_col('#d89a2c', '#fff0a0', gloss=0.6)(p, n)
        return mix(darken(TC, 0.6), darken(TC, 0.35), clamp(1 - r / 0.066))
    A.add(BO, MT, med.xform(MC), med_col, 'crest')
    emblem(A, BO, MT, SP['emblem'], MC @ Matrix.Translation((0, 0, 0.018)), 0.052, TC_HI, TC)
    # tassels in the shrine's colour from the front eave corners
    for sx in (-1, 1):
        cx, cy = sx * 0.43, -0.4
        ztop = roof_top(-LX + 0.04, 0.88) - TH * 0.6
        A.add(BO, MT, tube([Vector((cx, cy, ztop)), Vector((cx, cy, ztop - 0.09))], lambda s: 0.011, K=4), lambda p, n: '#e0a030', 'tassels')
        A.add(BO, MT, ellipsoid(Vector((cx, cy, ztop - 0.1)), (0.02, 0.02, 0.018), K=6, J=2), GOLDC, 'tassels')
        tz = ztop - 0.165
        A.add(BO, MT, lathe([(0.0, tz - 0.05), (0.036, tz - 0.04), (0.03, tz + 0.02), (0.012, tz + 0.05), (0.0, tz + 0.055)], 7),
              lambda p, n, tz=tz: mix(TC_LO, TC_HI, clamp((p.z - tz + 0.05) / 0.1 * 0.8 + 0.15 * n.z)), 'tassels')

    # ---------------- the orb (its own object, origin at its centre): a glowing sphere
    A.add('orb', 'glow', ellipsoid(ORB_C, (0.18, 0.18, 0.18), K=16, J=10), lambda p, n: TC, 'orb')
    export(A, 'shrine-' + stype, {'body': {}, 'glow': dict(emission=TC, strength=1.0)}, origins={'orb': ORB_C})

# ================================================================== main
ALL = ['chest-wood', 'chest-gold'] + ['pot-' + k for k in ('burrow', 'shrine', 'moon', 'kitchen', 'crystal')] + \
      ['shrine-' + k for k in ('zoomies', 'goodboy', 'lucky', 'sparkle', 'snack')]
want = ALL if PIECE == 'all' else PIECE.split(',')
for name in want:
    if name.startswith('chest-'): build_chest(name[6:])
    elif name.startswith('pot-'): build_pot(name[4:])
    elif name.startswith('shrine-'): build_shrine(name[7:])
    else: print('DP unknown piece', name)
