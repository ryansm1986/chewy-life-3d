# PAWHAVEN: the Adventurers' Guild (task guild-model), built in Blender by script at three levels.
#   blender --background --factory-startup --python build_guild-model.py -- --level 1|2|3|all
# Deterministic: seeded PRNGs only; a re-run reproduces every GLB exactly.
# Frame: 1 unit = 1 m, Blender Z up, the front (the door side) faces -Y (the glTF exporter makes it the game's +z),
# centred on the kit's footprint origin (src/world/buildings/guild.js, footprint 4 x 3). The layout code is written in
# the kit's game frame (x, y up, z front) and mapped to Blender (x, -z, y).
# Shared kit (copied from tools/blender/codex/assets/village-pieces): a mesh accumulator with per-vertex painted colours
# (attribute `Col`), rounded boxes with analytic normals, lathes, tubes, sweeps, blobs.
import bpy, bmesh, math, os, sys, random
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..', '..'))
MODELS = os.path.join(REPO, 'public', 'models')
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
LEVEL = argv[argv.index('--level') + 1] if '--level' in argv else 'all'
print('GM build pid', os.getpid())
TAU = math.tau

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

A = None; OB = 'guild'; GLOW = 'window_glow'
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

# ================================================================== palette (sRGB)
PAL = dict(roof='#558f8e', roofHi='#6fa8a6', roofLo='#2b5858', roofGroove='#3e6a6c', roofShadow='#2f5456',
           edge='#a9c2bc', under='#9a6a52',
           wall='#fff4e2', wallLo='#efdcc4', frame='#9a7452', frameHi='#b8906a', frameLo='#6e4e36', koshi='#c89868',
           door='#c48c5a', red='#cc4a3c', redHi='#ef7a62', redLo='#93302a', indigo='#33507e', gold='#f2c04a',
           brass='#c8a050', leather='#8a5a3a', canvas='#efe2c4', ink='#3a2a30', paper='#fff6e2', iron='#4f4a58')
STONES = ['#d9d0c8', '#c9bfc6', '#b8adb8', '#e4dcd2', '#cfc4b8', '#bdb4c4']

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

def crest(r=0.28, pos=(0, 0, 0), gold=False, tag='crest'):
    """the Guild's round crest: a cream plaque, a red (gold) rolled rim and a raised paw"""
    rim = PAL['gold'] if gold else PAL['red']
    with at(pos):
        seg = 12 if r > 0.18 else 8
        add(glathe([(0.0, -0.035), (r, -0.035), (r * 0.96, 0.03), (0.0, 0.04)], seg, rx=PI / 2),
            lambda p, n: mix('#fff3dc', '#f2dcc0', 0.3 * clamp(-n.z)), tag)
        add(gloop(circle(r, seg, 0.03), 0.048 if r > 0.18 else 0.04, K=4, up=F.N((0, 0, 1))), lac(rim), tag)
        paw(r * 1.5, (0, -r * 0.03, 0.045), depth=0.035, col='#8a4a1a' if gold else '#a8382c', tag=tag)

# ================================================================== roofs (mirrors roofs.js roofCore, as closed slabs)
def prof(t, c): return (1 - c) * t + c * t * t
def lerp(a, b, t): return a + (b - a) * t
def _hash(a, b, s):
    n = (int(a) * 374761393) ^ (int(b) * 668265263) ^ (int(s) * 2147483647)
    n = ((n ^ (n >> 13)) * 1274126177) & 0xffffffff
    return ((n ^ (n >> 16)) & 0xffffff) / 0xffffff

def roof_face(R, f):
    E0, E1, R0, R1 = f['E0'], f['E1'], f['R0'], f['R1']
    ex, ez = E1[0] - E0[0], E1[1] - E0[1]; eL = math.hypot(ex, ez); dr = (ex / eL, ez / eL)
    lift = f.get('lift', R['lift']); Wl = min(R['liftW'], eL * 0.28)
    t0, t1 = f['t0'], f['t1']
    mx = (E0[0] + E1[0]) / 2 - (R0[0] + R1[0]) / 2; mz = (E0[1] + E1[1]) / 2 - (R0[1] + R1[1]) / 2
    slopeLen = math.hypot(math.hypot(mx, mz), R['H'])
    step = R['course'] / slopeLen if R['course'] > 0 else 0.0
    ts = {t0, t1}
    eps = 0.022 / slopeLen                                  # (each course step: a 2.2 cm riser on the slope)
    if step > 0:
        k = 1
        while k * step < t1:
            for tt in (k * step - eps, k * step):
                if t0 + 1e-3 < tt < t1 - 1e-3: ts.add(tt)
            k += 1
    else:
        ts.add(lerp(t0, t1, 0.5))
    rows = sorted(ts)
    nrib = max(2, round(eL / R['ribW'])); ns = nrib * 3
    PH = (0.0, 0.2, 0.8); RIB = (0.0, 1.0, 1.0)              # a narrow groove, then a wide crown (rounded by normals)
    def scol(i): return 1.0 if i >= ns else (i // 3 + PH[i % 3]) / nrib
    def P(s, t, mode, i=None):
        x = lerp(lerp(E0[0], E1[0], s), lerp(R0[0], R1[0], s), t)
        z = lerp(lerp(E0[1], E1[1], s), lerp(R0[1], R1[1], s), t)
        near0 = s < 0.5; dc = s * eL if near0 else (1 - s) * eL; on = f['c0'] if near0 else f['c1']
        up = 0.0
        if on and lift > 0:
            up = lift * math.exp(-(dc * dc) / (Wl * Wl)) * (1 - t) * (1 - t)
            d = f['d0'] if near0 else f['d1']; dl = math.hypot(d[0], d[1])
            x += d[0] / dl * up * 0.45; z += d[1] / dl * up * 0.45
        y = R['yb'] + R['H'] * prof(t, R['curve']) + up
        rib = fr = 0.0
        if mode == 0:
            rib = RIB[i % 3] if i is not None else 0.6
            y += rib * R['ribAmp']
            if step > 0:
                u = t / step + 1e-4; fr = u - math.floor(u); y += (1 - fr) * R['courseAmp']
        elif mode == 1:
            y -= R['thick']
        else:
            y += R['ribAmp'] * 0.75 + R['courseAmp'] * 0.5
        return (x, y, z), rib, fr, up
    def N0(s, t):
        """the smooth roof surface's normal (no rolls, no courses), Blender world"""
        e = 1e-3
        a = Vector(P(min(1, s + e), t, 1)[0]) - Vector(P(max(0, s - e), t, 1)[0])
        b = Vector(P(s, min(1, t + e), 1)[0]) - Vector(P(s, max(0, t - e), 1)[0])
        n = b.cross(a)
        if n.y < 0: n = -n
        return F.N(tuple(n.normalized()))
    outE = (-dr[1], dr[0])
    GROOVE, BASE, TOP, SHADOW = R['groove'], R['color'], R['hi'], R['shadow']
    hs = R['seed'] + f.get('fi', 0) * 101
    side_w = F.N((dr[0], 0, dr[1]))
    t = Tmp(); rings, cs, cols, n0s = [], [], [], []
    for i in range(ns + 1):
        s = scol(i)
        loop, lc, ln = [], [], []
        for j, tt in enumerate(rows):
            p, rib, fr, up = P(s, tt, 0, i)
            ci = min(nrib - 1, int(s * nrib + 1e-6)); ri = int(tt / step + 1e-4) if step > 0 else 0
            shadow_row = step > 0 and fr > 0.8                  # the row tucked under the next course's butt
            if i % 3 == 0:                                      # the groove between rolls
                c = mul(SHADOW, 0.92) if shadow_row else mix(GROOVE, BASE, 0.18 * (1 - fr))
            elif step > 0:
                c = mix(BASE, SHADOW, 0.72) if shadow_row else mix(TOP, BASE, clamp(fr / 0.8) ** 0.9)
            else:
                c = mix(BASE, TOP, 0.25 + 0.5 * tt)
            c = mul(c, 0.97 + 0.06 * _hash(ci, ri, hs))         # hand-laid tile variety
            c = mul(c, 1 + up * 0.4)
            if j == 0: c = mix(c, R['edge'], 0.15)
            loop.append(F.W(p)); lc.append(c); ln.append(N0(s, tt))
        pu0 = P(s, t0, 1)[0]; pt0 = P(s, t0, 0, i)[0]
        lip = ((pt0[0] + pu0[0]) / 2 + outE[0] * R['thick'] * 0.32, (pt0[1] + pu0[1]) / 2 - R['thick'] * 0.08,
               (pt0[2] + pu0[2]) / 2 + outE[1] * R['thick'] * 0.32)
        loop += [F.W(pu0), F.W(lip)]
        lc += [mul(R['under'], 0.85), R['edge']]
        rings.append(loop); cols += lc; n0s.append(ln)
        cs.append(sum(loop, Vector()) / len(loop))
    ids = ring_surface(t, rings, cs, pole0=cs[0], pole1=cs[-1])
    nrows = len(rows); where = {}
    for i_, ring_ in enumerate(ids):
        for k_ in range(nrows): where[ring_[k_]] = (i_, k_)
    CA, SA = math.cos(math.radians(64)), math.sin(math.radians(64))
    def newell(face):
        P_ = [t.v[v] for v in face]; nn = Vector((0, 0, 0))
        for q in range(len(P_)):
            a_, b_ = P_[q], P_[(q + 1) % len(P_)]
            nn += Vector(((a_.y - b_.y) * (a_.z + b_.z), (a_.z - b_.z) * (a_.x + b_.x), (a_.x - b_.x) * (a_.y + b_.y)))
        return nn.normalized() if nn.length > 1e-12 else Z.copy()
    def cn(face):
        """split normals: the crown face shades as a half cylinder, grooves and course risers stay crisp facets"""
        if not all(v in where for v in face): return None
        ks = sorted({where[v][1] for v in face}); is_ = sorted({where[v][0] for v in face})
        if len(ks) == 2 and rows[ks[1]] - rows[ks[0]] < eps * 1.6:
            g = newell(face); return [g] * len(face)            # a course riser
        if len(is_) == 2 and is_[0] % 3 == 1:                   # the crown
            out = []
            for v in face:
                i_, k_ = where[v]; n0 = n0s[i_][k_]
                sd = side_w - n0 * side_w.dot(n0); sd = sd.normalized() if sd.length > 1e-9 else sd
                out.append((n0 * CA + sd * (SA if i_ % 3 == 2 else -SA)).normalized())
            return out
        g = newell(face)                                        # a groove wall
        return [(g * 0.75 + n0s[where[v][0]][where[v][1]] * 0.25).normalized() for v in face]
    t.cn = cn
    endc = R['edge'] if (f.get('open0') or f.get('open1')) else R['under']
    t.c = cols + [endc, endc]
    add(t, None, 'roof')
    # round tile-end discs (nokigawara) under every roll along the eave, tipped up to read from the high camera
    if R['ends'] and f.get('discs', True):
        r = R['discR']; dep = 0.045; margin = R['ribW'] * 0.7
        for k in range(nrib):
            s = (k + 0.5) / nrib
            if s * eL < margin or (1 - s) * eL < margin: continue
            top = Vector(P(s, t0, 0, 1)[0]); inn = Vector(P(s, min(t0 + 0.05, t1), 0, 1)[0])  # (s: mid-crown)
            D = top - inn; D.y = 0
            if D.length < 1e-6: continue
            D.normalize(); D.y = 0.42; D.normalize()
            c = top + D * 0.012 - Vector((0, r * 1.02, 0))
            dk = lathe([(0.0, -dep / 2), (r, -dep / 2), (r * 0.9, dep / 2), (0.0, dep / 2 + 0.008)], 5, th0=PI / 5 + k * 0.7)
            q = Z.rotation_difference(F.N(tuple(D)))
            dk.xform(Matrix.Translation(F.W(tuple(c))) @ q.to_matrix().to_4x4())
            body, mon = R['disc'], R['mon']
            nv = len(dk.v)                                              # (rings: back rim, front rim, mon ring; poles last)
            dk.c = [mul(body, 0.8)] * 5 + [mix(body, '#eef6f0', 0.25)] * 5 + [mul(body, 0.7), mon]
            add(dk, None, 'roofdisc')
    # hip ridges and barge ridges: round cap tubes that end in a candy curl at the eave
    if f.get('hip1') and R['k'] >= 0.4:
        tTop = f.get('hipT', t1)
        nq = 4 if R['k'] > 0.6 else 3
        pts = [Vector(P(1.0, lerp(tTop, t0, q / (nq - 1)), 2)[0]) + Vector((0, 0.02, 0)) for q in range(nq)]
        cap_tube(R, pts, 0.075 * R['k'], curl=f.get('curl', True))
    for s, on, sg in ((0.0, f.get('open0'), -1), (1.0, f.get('open1'), 1)):
        if not (on and f.get('barge') and R['k'] >= 0.4): continue
        pts = []
        for q in range(5):
            p = Vector(P(s, lerp(t1, t0, q / 4), 2)[0])
            p.x -= dr[0] * sg * 0.05 * R['k']; p.z -= dr[1] * sg * 0.05 * R['k']; p.y += 0.02
            pts.append(p)
        cap_tube(R, pts, 0.068 * R['k'], curl=False)

def cap_tube(R, pts, rr, curl=True):
    """a ridge-cap tube down pts (game, roof frame), finished with a curl that rolls outward and up"""
    d = pts[-1] - pts[-3]; D = Vector((d.x, 0, d.z))
    D = D.normalized() if D.length > 1e-6 else Vector((0, 0, 1))
    rc = rr * 1.25; c = pts[-1] + Vector((0, rc, 0)) + D * 0.0
    curl = []
    for k in (range(1, 3) if curl else ()):
        a = -PI / 2 + k / 2 * PI * 1.3
        curl.append(c + D * (rc * math.cos(a)) + Vector((0, rc * math.sin(a), 0)))
    path = [F.W(tuple(p)) for p in pts + curl]
    n = len(pts); N = len(path)
    rad = lambda s: rr * (1.0 if s * (N - 1) < n - 1 else 1.0 - 0.35 * (s * (N - 1) - (n - 1)) / max(1, N - n))
    hi, lo = R['edge'], mul(R['trim'], 0.78)
    def cc(p, nn):
        return mix(lo, hi, 0.25 + 0.55 * clamp(nn.z))
    add(tube(path, rad, K=4, up=Z), cc, 'roofcap')

def ridge(R, x0, x1, y, oni=True):
    k = R['k']; L = x1 - x0; capc = R['cap']
    add(box(L + 0.1, 0.18 * k, 0.3 * k, ((x0 + x1) / 2, y + 0.06 * k, 0), r=0.07 * k), paint(capc, hi=mix(capc, '#e8f4ee', 0.4), top=0.3, bot=0.3), 'ridge')
    add(box(L + 0.12, 0.07 * k, 0.22 * k, ((x0 + x1) / 2, y + 0.17 * k, 0), r=0.03 * k), paint(mul(capc, 1.18), hi=mix(capc, '#f0faf4', 0.55), top=0.4), 'ridge')
    if not oni: return
    for x, s in ((x0, -1), (x1, 1)):
        with at((x + s * 0.02, y, 0), s=k):
            add(beam(0.14, 0.32, 0.38, (0, 0.16, 0), c=0.065), paint(capc, hi=mix(capc, '#e8f4ee', 0.4), top=0.3), 'oni')
            for sz in (-1, 1):
                add(sph(0.075, (0, 0.31, sz * 0.13), sc=(0.85, 1.25, 0.85), K=5, J=3), paint(capc, hi=mix(capc, '#e8f4ee', 0.5), top=0.4), 'oni')
            # the face: a disc with a gold (rich) rim ring, a pale field and a dark boss (colours by ring)
            fd = lathe([(0.0, -0.025), (0.105, -0.025), (0.105, 0.025), (0.075, 0.03), (0.0, 0.034)], 9, th0=PI / 9)
            fd.xform(F.m @ lm((s * 0.075, 0.16, 0), rz=-s * PI / 2))
            rimc = PAL['gold'] if R['rich'] >= 2 else mul(capc, 1.3)
            fd.c = [mul(rimc, 0.8)] * 9 + [rimc] * 9 + [mul(capc, 1.35)] * 9 + [mul(capc, 0.8), mul(capc, 0.8)]
            add(fd, None, 'oni')
            tb = lathe([(0.0, -0.1), (0.06, -0.1), (0.056, 0.1), (0.0, 0.1)], 6, th0=PI / 6)
            tb.xform(F.m @ lm((s * 0.08, 0.34, 0), rz=-s * PI / 2))
            tb.c = [mul(capc, 1.1)] * 6 + [PAL['gold'] if R['rich'] >= 2 else mul(capc, 1.3)] * 6 + [mul(capc, 1.1), PAL['gold'] if R['rich'] >= 2 else mul(capc, 1.3)]
            add(tb, None, 'oni')

def finial(R, y, k):
    """the hoju finial (roofs.js finial, gold): a cap, a ring and the jewel"""
    with at((0, y, 0), s=max(k, 0.45)):
        add(cyl(0.14, 0.2, 0.14, (0, 0.05, 0), K=7), paint(R['cap'], top=0.3), 'finial')
        add(glathe([(0.0, 0.0), (0.13, 0.03), (0.12, 0.13), (0.07, 0.22), (0.0, 0.32)], 7, pos=(0, 0.13, 0)), lac(PAL['gold']), 'finial')

def gable_tri(R, o, X, sx, t0, Bz, yBase):
    """the gable's infill (a closed slab under the roof) at plane x = X, its tie beam, the gold gegyo"""
    yUnder = lambda t: R['yb'] + R['H'] * prof(t, R['curve']) - R['thick'] - 0.01
    tS = t0
    while tS < 0.999 and yUnder(tS) < yBase + 0.02: tS += 0.005
    zMax = Bz * (1 - tS)
    N = 8
    top = []
    for i in range(N + 1):
        z = lerp(-zMax, zMax, i / N); t = 1 - abs(z) / Bz
        top.append((z, max(yBase, yUnder(t))))
    # prism in a frame facing +x (local z -> world x*sx)
    with at((X - sx * 0.05, 0, 0), ry=sx * PI / 2):
        poly = [(-zl * sx, yl) for zl, yl in top]      # (local x = -z * sx under the yaw)
        poly = poly[::-1] if sx < 0 else poly
        poly = [(poly[0][0], yBase)] + poly + [(poly[-1][0], yBase)]
        poly = [p for k, p in enumerate(poly) if k == 0 or (abs(p[0] - poly[k - 1][0]) + abs(p[1] - poly[k - 1][1])) > 1e-4]
        fill = o.get('gableFill', '#8a4a3a')
        add(prism(poly, 0.06, -0.01), lambda p, n: mul(fill, 0.85 + 0.2 * clamp(n.z + 0.5)), 'gable')
    hTri = yUnder(1) - yBase
    if hTri < 0.25: return hTri
    wx = X + sx * 0.02
    add(beam(0.08, 0.1, zMax * 1.9, (wx, yBase + 0.05, 0), c=0.03), wood(PAL['frameLo']), 'gable')
    # gold gegyo: a disc, a drop and two curled wings
    with at((wx + sx * 0.03, yBase + hTri * 0.62, 0), ry=sx * PI / 2):
        add(glathe([(0.0, -0.03), (0.16, -0.03), (0.15, 0.03), (0.0, 0.035)], 9, rx=PI / 2), lac(PAL['gold']), 'gegyo')
        add(glathe([(0.0, 0.0), (0.09, 0.07), (0.0, 0.2)], 5, rx=PI, pos=(0, -0.12, 0.0)), lac(PAL['gold']), 'gegyo')
        for s in (-1, 1):
            add(sph(0.075, (s * 0.2, 0.03, 0.0), sc=(1.3, 0.8, 0.5), K=6, J=3, rz=s * 0.5), lac(PAL['gold']), 'gegyo')
    return hTri

def roof(o):
    """o: type (skirt | irimoya | shed), w, d, y0, over, H, curve, lift, liftW, thick, ribW, ribAmp, course,
    courseAmp, tTop, tg, gOver, rich; returns the roof's frame info (yb, ridgeY, topY, openW, openD, yAt, underAt)"""
    typ = o['type']
    if typ == 'shed':
        pass
    over = o.get('over', 0.5)
    A_, Bz = o['w'] / 2 + over, o['d'] / 2 + over
    R = dict(H=o['H'], curve=o['curve'], lift=o['lift'], liftW=o['liftW'], thick=o['thick'], ribW=o['ribW'],
             ribAmp=o.get('ribAmp', 0.05), course=o.get('course', 0.34), courseAmp=o.get('courseAmp', 0.035),
             color=PAL['roof'], hi=PAL['roofHi'], lo=PAL['roofLo'], groove=PAL['roofGroove'], shadow=PAL['roofShadow'],
             edge=PAL['edge'], under=PAL['under'],
             rich=o.get('rich', 2), seed=o.get('seed', 7))
    R['k'] = o.get('k', clamp(Bz / 1.35, 0.22, 1.25))
    R['ends'] = R['ribW'] >= 0.19 and R['k'] >= 0.3
    R['discR'] = clamp(min(R['ribW'] * 0.3, R['thick'] * 0.5), 0.035, 0.1)
    TRIM = '#4a827e'                                   # (the eave discs, hip caps and ridge keep the round-1 teal)
    R['trim'] = TRIM
    R['disc'] = mix(TRIM, PAL['edge'], 0.55)
    R['mon'] = mix(R['disc'], '#d0962e', 0.85) if R['rich'] >= 2 else mul(R['disc'], 0.72)
    R['cap'] = mix(mul(TRIM, 0.85), '#f6eef4', 0.12)
    tw = over / (2 * Bz if typ == 'shed' else Bz)
    R['yb'] = o['y0'] - R['H'] * prof(tw, R['curve']) + R['thick']
    out = dict(yb=R['yb'], ridgeY=R['yb'] + R['H'], A=A_, Bz=Bz, R=R)
    hip4 = [dict(E0=(-A_, Bz), E1=(A_, Bz), R0=(-(A_ - Bz), 0), R1=(A_ - Bz, 0), d0=(-1, 1), d1=(1, 1)),
            dict(E0=(A_, Bz), E1=(A_, -Bz), R0=(A_ - Bz, 0), R1=(A_ - Bz, 0), d0=(1, 1), d1=(1, -1)),
            dict(E0=(A_, -Bz), E1=(-A_, -Bz), R0=(A_ - Bz, 0), R1=(-(A_ - Bz), 0), d0=(1, -1), d1=(-1, -1)),
            dict(E0=(-A_, -Bz), E1=(-A_, Bz), R0=(-(A_ - Bz), 0), R1=(-(A_ - Bz), 0), d0=(-1, -1), d1=(-1, 1))]
    yAt = lambda x, z: R['yb'] + R['H'] * prof(clamp(min(A_ - abs(x), Bz - abs(z)) / Bz), R['curve'])
    if typ == 'skirt':
        tt = o.get('tTop', 0.45)
        for i, f in enumerate(hip4):
            roof_face(R, dict(f, t0=0.0, t1=tt, c0=True, c1=True, eave=True, hip1=True, hipT=tt, fi=i))
        Y1 = R['yb'] + R['H'] * prof(tt, R['curve'])
        pw, pd = 2 * (A_ - Bz * tt), 2 * Bz * (1 - tt)
        add(beam(pw + 0.08, 0.1, pd + 0.08, (0, Y1 + 0.01, 0), c=0.03), wood(R['under']), 'roofplate')
        out.update(topY=Y1 + 0.06, openW=pw, openD=pd)
    elif typ == 'irimoya':
        tg = o.get('tg', 0.5); xg = A_ - Bz * tg
        for i, f in enumerate(hip4):
            roof_face(R, dict(f, t0=0.0, t1=tg, c0=True, c1=True, eave=True, hip1=True, hipT=tg, fi=i))
        X = xg + o.get('gOver', 0.22); t0 = tg - 0.06
        upl = R['lift'] * 0.9
        roof_face(R, dict(E0=(-X, Bz), E1=(X, Bz), R0=(-X, 0), R1=(X, 0), t0=t0, t1=1.0, c0=True, c1=True, d0=(-1, 0.5), d1=(1, 0.5),
                          eave=True, open0=True, open1=True, barge=True, lift=upl, fi=5, discs=False))
        roof_face(R, dict(E0=(X, -Bz), E1=(-X, -Bz), R0=(X, 0), R1=(-X, 0), t0=t0, t1=1.0, c0=True, c1=True, d0=(1, -0.5), d1=(-1, -0.5),
                          eave=True, open0=True, open1=True, barge=True, lift=upl, fi=6, discs=False))
        yTop = R['yb'] + R['H'] * prof(tg, R['curve']) + R['ribAmp'] * 0.5
        for sx in (-1, 1): gable_tri(R, o, sx * xg, sx, tg, Bz, yTop)
        ridge(R, -X - 0.05, X + 0.05, R['yb'] + R['H'])
        out.update(xg=xg, X=X)
    elif typ == 'hip':
        tt = o.get('tTop', 1.0)                       # (a square hip stops short of its apex; the finial caps it)
        for i, f in enumerate(hip4):
            roof_face(R, dict(f, t0=0.0, t1=tt, c0=True, c1=True, eave=True, hip1=True, hipT=tt, fi=i + 10, discs=o.get('discs', True), curl=o.get('curl', True)))
        finial(R, R['yb'] + R['H'] * prof(tt, R['curve']) - 0.02, R['k'])
    elif typ == 'shed':
        X = o['w'] / 2 + o.get('gOver', 0.35)
        roof_face(R, dict(E0=(-X, Bz), E1=(X, Bz), R0=(-X, -Bz), R1=(X, -Bz), t0=0.0, t1=1.0, c0=True, c1=True, d0=(-1, 0.6), d1=(1, 0.6),
                          eave=True, open0=True, open1=True, topBand=True, barge=True, fi=8))
        yAt = lambda x, z: R['yb'] + R['H'] * prof(clamp((Bz - z) / (2 * Bz)), R['curve'])
    out['yAt'] = yAt
    def underAt(x, z):
        t = clamp(min(A_ - abs(x), Bz - abs(z)) / Bz)
        if A_ - abs(x) < Bz - abs(z): dc, eL = Bz - abs(z), 2 * Bz
        else: dc, eL = A_ - abs(x), 2 * A_
        Wl = min(R['liftW'], eL * 0.28)
        return yAt(x, z) + R['lift'] * math.exp(-(max(0, dc) ** 2) / (Wl * Wl)) * (1 - t) ** 2 - R['thick']
    out['underAt'] = underAt
    return out

# ================================================================== walls, windows, doors (face frame: z out)
def on_face(blk, side, u, y):
    w, d = blk['w'], blk['d']; cx, cz = blk.get('cx', 0), blk.get('cz', 0)
    T = {'f': ((cx + u, y, cz + d / 2), 0.0), 'r': ((cx + w / 2, y, cz - u), PI / 2),
         'b': ((cx - u, y, cz - d / 2), PI), 'l': ((cx - w / 2, y, cz + u), -PI / 2)}[side]
    return at(T[0], ry=T[1])

def plank_panel(L, h, pos, base, n=None, depth=0.05, tag='koshi', seed=0):
    """a board wainscot (face frame): n boards with 1.6 cm gaps, a tone per board, darker at the foot"""
    n = n or max(2, round(L / 0.3)); rng = random.Random(seed)
    bw = L / n
    with at(pos):
        add(box(L, h, 0.02, (0, 0, 0.01), r=0.0), flat(mul(base, 0.55)), tag)          # the shadowed backing
        for i in range(n):
            c = mul(base, 1 + rng.uniform(-0.08, 0.08))
            add(box(bw - 0.016, h, depth, (-L / 2 + bw * (i + 0.5), 0, depth / 2), r=0.0),
                lambda p, nn, c=c: mul(c, 0.84 + 0.16 * clamp(nn.z + 0.5) + 0.06 * clamp(-nn.y)), tag)

def walls(o):
    w, d, h, y0 = o['w'], o['d'], o['h'], o['y0']
    plaster, frame = o.get('plaster', PAL['wall']), o.get('frame', PAL['frame'])
    def wall_col(p, n):
        lp = GMi @ (Mi @ p); u = clamp((lp.y - y0) / h)
        c = mix(PAL['wallLo'], plaster, smooth(0.0, 0.55, u))
        return mul(c, 1 - 0.1 * smooth(0.82, 1.0, u))      # a warm shade under the eave
    Mi = F.m.inverted()
    add(box(w, h, d, (0, y0 + h / 2, 0), r=0.04), wall_col, 'walls')
    pt = 0.14
    for sx in (-1, 1):
        for sz in (-1, 1):
            add(beam(pt, h + 0.04, pt, (sx * (w / 2 - pt * 0.25), y0 + h / 2, sz * (d / 2 - pt * 0.25)), c=0.035),
                wood(frame, ao_z=y0, seed=3), 'timber')
    def ring(W_, D_, y, hh, th, c, sides=True):
        add(beam(W_, hh, th, (0, y, D_ / 2 - th / 2), c=0.025), wood(c), 'timber')
        add(beam(W_, hh, th, (0, y, -D_ / 2 + th / 2), c=0.025), wood(c), 'timber')
        if sides: add(beam(th, hh, D_ - th * 2 + 0.002, (W_ / 2 - th / 2, y, 0), c=0.025), wood(c), 'timber')
        if sides: add(beam(th, hh, D_ - th * 2 + 0.002, (-W_ / 2 + th / 2, y, 0), c=0.025), wood(c), 'timber')
    # (no head ring: it sits right under the deep eaves, out of sight of the game camera)
    if o.get('sill', True): ring(w + 0.07, d + 0.07, y0 + 0.05, 0.11, 0.1, mul(frame, 0.9))
    if o.get('koshi'):
        kh = 0.44
        for side in 'frbl':
            if side in o.get('koshiSkip', ''): continue
            L = w if side in 'fb' else d
            with on_face(dict(w=w, d=d), side, 0, y0 + 0.12 + kh / 2):
                plank_panel(L - 0.16, kh, (0, 0, 0.0), o['koshi'], depth=0.045, seed='frbl'.index(side))
                add(beam(L - 0.1, 0.06, 0.09, (0, kh / 2 + 0.01, 0.035), c=0.022), wood(mul(o['koshi'], 0.82)), 'koshi')
    for side, us in o.get('posts', {}).items():
        for u in us:
            with on_face(dict(w=w, d=d), side, u, y0 + h / 2):
                add(beam(0.14, h, 0.07, (0, 0, 0.015), c=0.025), wood(frame), 'timber')

def frame_ring(w, h, z, rr, col, tag, ch=0.05):
    """a chunky window frame (face frame): a square-section tube round a chamfered rectangle (reads bevelled)"""
    pts = [(w / 2, h / 2, z), (-w / 2, h / 2, z), (-w / 2, -h / 2, z), (w / 2, -h / 2, z)]
    add(gloop(pts, rr, K=4, up=F.N((0, 0, 1))), col, tag)

def flower_box(w, pos, flowers, tag='flowerbox', seed=0):
    rng = random.Random(seed + 11)
    with at(pos):
        add(beam(w, 0.15, 0.18, (0, 0, 0), c=0.035), wood('#a8784e'), tag)
        # the leaves: one lumpy mound along the box
        add(sph(1.0, (0, 0.08, 0), sc=(w * 0.48, 0.07, 0.085), K=8, J=3), lambda p, nn: mix('#4f9a48', '#8cc868', clamp(nn.z)), tag)
        n = max(3, int(w / 0.17))
        for i in range(n):
            x = -w / 2 + 0.08 + (w - 0.16) * (i + 0.5) / n + rng.uniform(-0.02, 0.02)
            c = flowers[i % len(flowers)]
            fb = blob(F.W((x, 0.11 + rng.uniform(0, 0.03), rng.uniform(-0.02, 0.04))), 0.06, 0.045, lobes=4, K=8, seed=i * 3 + seed, amp=0.3)
            fb.c = [mul(c, 0.85)] * 8 + [mix(c, '#fff6ea', 0.15)] * 8 + [mul(c, 0.8), '#ffd24a' if c != '#ffd24a' else '#ff9a3a']
            add(fb, None, tag)

def shoji(w, h, frame=None, box_=False, flowers=None, cell=0.24, tag='window'):
    frame = frame or PAL['frame']
    add(box(w - 0.08, h - 0.08, 0.04, (0, 0, 0.02), r=0.0), lambda p, n: PAL['paper'], tag, glow=True)
    frame_ring(w - 0.06, h - 0.06, 0.055, 0.04, wood(frame), tag)
    nx = max(1, round(w / cell) - 1); ny = max(1, round(h / cell) - 1)
    for i in range(1, nx + 1): add(box(0.03, h - 0.1, 0.025, (-w / 2 + i * w / (nx + 1), 0, 0.05), r=0.0), flat(mul(frame, 0.95)), tag)
    for j in range(1, ny + 1): add(box(w - 0.1, 0.03, 0.025, (0, -h / 2 + j * h / (ny + 1), 0.05), r=0.0), flat(mul(frame, 0.95)), tag)
    add(box(w + 0.16, 0.065, 0.13, (0, -h / 2 - 0.03, 0.07), r=0.0), wood(frame), tag)
    if box_: flower_box(w + 0.08, (0, -h / 2 - 0.15, 0.14), flowers or ['#ff8fb0', '#ffd24a'], seed=int(w * 100))

def round_window(r, frame=None, box_=False, flowers=None, fine=False, tag='window'):
    frame = frame or PAL['frame']
    add(glathe([(0.0, 0.0), (r * 0.97, 0.0), (r * 0.97, 0.04), (0.0, 0.04)], 8, rx=PI / 2), lambda p, n: PAL['paper'], tag, glow=True)
    add(gloop(circle(r, 8, 0.055, a0=PI / 8), 0.06, K=4, up=F.N((0, 0, 1))), wood(frame), tag)
    add(box(0.03, r * 1.9, 0.025, (0, 0, 0.05), r=0.0), flat(frame), tag)
    add(box(r * 1.9, 0.03, 0.025, (0, 0, 0.05), r=0.0), flat(frame), tag)
    if fine:
        for s in (-1, 1):
            add(box(0.03, r * 1.6, 0.025, (s * r * 0.48, 0, 0.055), r=0.0), flat(frame), tag)
            add(box(r * 1.6, 0.03, 0.025, (0, s * r * 0.48, 0.055), r=0.0), flat(frame), tag)
    if box_: flower_box(r * 2 + 0.1, (0, -r - 0.13, 0.14), flowers or ['#ff8fb0', '#ffd24a'], seed=7)

def door_wood(w=0.92, h=1.24, wd=None, frame=None, tag='door'):
    wd = wd or PAL['door']; frame = frame or PAL['frame']
    add(box(w, h, 0.04, (0, h / 2, 0.01), r=0.0), flat(mul(frame, 0.6)), tag)
    pw = w / 2 + 0.02
    for s in (-1, 1):
        zz = 0.03 + (0.025 if s > 0 else 0)
        with at((s * (w / 4 - 0.005), 0, zz)):
            add(beam(pw - 0.04, 0.42, 0.045, (0, 0.25, 0), c=0.016), wood(wd, seed=5), tag)
            add(beam(pw - 0.04, h - 0.5, 0.045, (0, 0.46 + (h - 0.5) / 2, 0), c=0.016), wood(mul(wd, 0.95), seed=6), tag)
            for i in (1, 2):
                add(box(0.03, h - 0.62, 0.02, (-pw / 2 + i * pw / 3, 0.48 + (h - 0.62) / 2 - 0.14, 0.028), r=0.0), flat(mul(wd, 0.74)), tag)
            add(box(pw * 0.55, 0.24, 0.03, (0, h - 0.32, 0.018), r=0.0), lambda p, n: PAL['paper'], tag, glow=True)
            frame_ring(pw - 0.04, h - 0.08, 0.035, 0.032, wood(frame), tag, ch=0.04)
            frame_ring(pw * 0.55 + 0.04, 0.28, 0.035, 0.022, wood(frame), tag, ch=0.03)
    add(beam(w + 0.26, 0.14, 0.13, (0, h + 0.06, 0.05), c=0.035), wood(frame), tag)
    for s in (-1, 1): add(beam(0.12, h, 0.11, (s * (w / 2 + 0.03), h / 2, 0.05), c=0.03), wood(frame), tag)
    add(beam(w + 0.2, 0.06, 0.15, (0, 0.03, 0.06), c=0.02), wood(mul(frame, 0.9)), tag)

def noren(w=0.94, h=0.48, y=1.33, z=0.17, color=None, strips=3, sym_scale=0.24, tag='noren'):
    color = color or PAL['indigo']
    rod = PAL['frameLo']
    add(cyl(0.028, 0.028, w + 0.16, (0, y + 0.02, z), K=7, rz=PI / 2), wood(rod), tag)
    for s in (-1, 1): add(beam(0.045, 0.06, z + 0.02, (s * (w / 2 + 0.05), y + 0.02, z / 2), c=0.012), wood(rod), tag)
    gap = 0.035; sw = (w - gap * (strips - 1)) / strips; hem = 0.075
    for i in range(strips):
        x = -w / 2 + sw / 2 + i * (sw + gap)
        sway = (i - 1) * 0.015
        add(beam(sw, h - hem, 0.03, (x, y - (h - hem) / 2, z), c=0.012, rx=0.04, rz=sway),
            lambda p, n: mix(mul(color, 0.82), mix(color, '#6a88c0', 0.25), smooth(y - h, y, p.z) * 0.8 + clamp(-n.y) * 0.1), tag)
        add(beam(sw, hem, 0.034, (x + sway * -0.45, y - h + hem / 2 + 0.005, z + 0.018), c=0.014, rx=0.04), soft('#f4efe6', 0.2), tag)
    paw(sym_scale, (0, y - h * 0.45, z + 0.032), depth=0.016, col='#fff4e6', tag=tag)

def chochin(r=0.17, h=0.36, color=None, cord=0.0, pos=(0, 0, 0), glow=True, tag='lantern'):
    """paper lantern hung from pos: dark caps, ribbed paper (painted bands), a gold tassel"""
    color = color or PAL['red']
    K = 6; Kc = 6
    with at(pos):
        if cord > 0: add(box(0.025, cord + 0.02, 0.025, (0, -cord / 2, 0), r=0.0), flat(PAL['ink']), tag)
        y0 = -cord
        add(cyl(r * 0.5, r * 0.56, 0.05, (0, y0 - 0.025, 0), K=Kc), soft('#2e2628', 0.3), tag)
        N = 4; pts = []
        for k in range(N + 1):
            tt = k / N
            rr = r * (0.45 + 0.55 * math.sin(tt * PI))
            pts.append((max(0.0, rr) if 0 < k < N else 0.0, y0 - 0.05 - tt * h))
        pts = pts[::-1]
        cc = color; dark = mul(cc, 0.75); light = mix(cc, '#fff0d0', 0.3)
        def pc(p, n, top=F.W((0, y0 - 0.05, 0)).z):
            tt = clamp((top - p.z) / h)
            c = mix(dark, cc, math.sin(tt * PI))
            if 0.35 < tt < 0.65: c = mix(c, light, 0.6)
            return mix(c, '#fff4d8', 0.15 * clamp(-n.y + 0.2)) if not glow else c
        add(glathe(pts, K), pc, tag, glow=glow)
        add(cyl(r * 0.56, r * 0.5, 0.05, (0, y0 - 0.05 - h - 0.02, 0), K=Kc), soft('#2e2628', 0.3), tag)
        add(cyl(0.016, 0.032, 0.1, (0, y0 - 0.05 - h - 0.09, 0), K=5), lac(PAL['gold']), tag)

# ================================================================== props (kit guild.js / props*.js, rebuilt chunky)
def stone_col(c, seed=0, ao=True):
    def f(p, n):
        k = mix(mul(c, 0.86), mix(c, '#fbf6f2', 0.35), clamp(n.z * 0.8 + 0.2))
        if n.z < 0: k = mix(k, mul(c, 0.7), -n.z * 0.5)
        k = mul(k, 0.95 + 0.1 * vnoise(p, 4.0, seed))
        if ao: k = mul(k, 1 - 0.2 * (1 - smooth(0.0, 0.12, p.z)))
        return k
    return f

def pebble(pos, r, sq=0.5, seed=0, col=None, tag='stones', K=7):
    rng = random.Random(seed)
    c = col or STONES[seed % len(STONES)]
    t = lathe([(0.0, 0.0), (r, r * sq * 0.4), (r * 0.72, r * sq * 0.88), (0.0, r * sq)], K, th0=rng.uniform(0, 1),
              rfn=lambda rr, z, th: rr * (1 + 0.1 * math.sin(2 * th + seed) + 0.05 * math.sin(3 * th + seed * 1.7)))
    t.xform(F.m @ lm(pos, ry=rng.uniform(0, PI)))
    add(t, stone_col(c, seed), tag)

def weapon_rack(tag='rack'):
    for y in (0.32, 0.96):
        add(beam(0.88, 0.07, 0.07, (0, y, 0.04), c=0.02), wood('#7a5238'), tag)
    with at((-0.3, 0.62, 0.11)):                         # the toy sword
        add(beam(0.075, 0.62, 0.04, (0, 0.08, 0), c=0.018), soft('#ecd6a8', 0.3), tag)
        add(glathe([(0.0, 0.0), (0.038, 0.0), (0.0, 0.08)], 5, pos=(0, 0.39, 0)), soft('#ecd6a8'), tag)
        add(cyl(0.065, 0.065, 0.035, (0, -0.24, 0), K=8), soft('#4a3a3a', 0.3), tag)
        add(cyl(0.032, 0.032, 0.16, (0, -0.33, 0), K=5), lac('#e86a7a'), tag)
    with at((0.02, 0.62, 0.1)):                          # the toy bow and its string
        arc = [(-0.26 + 0.18 - 0.3 * math.cos(a), 0.3 * math.sin(a) * 1.05, 0) for a in [-PI * 0.42 + PI * 0.84 * q / 5 for q in range(6)]]
        add(gtube(arc, 0.026, K=4, up=F.N((0, 0, 1))), lac('#b07a4a'), tag)
        add(box(0.02, 0.6, 0.02, (arc[0][0], 0, 0), r=0.0), flat('#fff6ea'), tag)
        for p in (arc[0], arc[-1]): add(sph(0.034, p, K=5, J=3), lac(PAL['gold']), tag)
    with at((0.3, 0.6, 0.11)):                           # the toy spear with its pennant
        add(cyl(0.024, 0.024, 0.9, (0, 0, 0), K=5), wood('#a8784e'), tag)
        add(glathe([(0.0, 0.0), (0.055, 0.02), (0.0, 0.15)], 5, pos=(0, 0.45, 0)), soft('#c0c4d4', 0.3), tag)
        add(box(0.16, 0.1, 0.02, (0.09, 0.34, 0), r=0.0), soft(PAL['red']), tag)
        add(sph(0.036, (0, -0.47, 0), K=5, J=3), lac(PAL['gold']), tag)
    add(gloop(circle(0.07, 7, 0.1, 0.0, 0.2), 0.028, K=3, up=F.N((0, 0, 1))), soft('#d8b880'), tag)

def crossed_arms(shield='#9a9aa8', tag='arms'):
    for s in (-1, 1):
        with at((0, 0, 0.05), rz=s * 0.72):
            add(beam(0.08, 0.86, 0.045, (0, 0.1, 0), c=0.02), soft('#ecd6a8', 0.3), tag)
            add(glathe([(0.0, 0.0), (0.04, 0.0), (0.0, 0.09)], 5, pos=(0, 0.53, 0)), soft('#ecd6a8'), tag)
            add(cyl(0.08, 0.08, 0.035, (0, -0.34, 0), K=8), soft('#4a3a3a', 0.3), tag)
            gc = '#e86a7a' if s > 0 else '#5a8ad8'
            g = glathe([(0.0, -0.11), (0.038, -0.11), (0.038, 0.11), (0.0, 0.11)], 5, pos=(0, -0.46, 0))
            add(g, lambda p, n, gc=gc: gc if abs(n.z) < 0.9 else mul(gc, 0.85), tag)
            add(sph(0.04, (0, -0.59, 0), K=5, J=3), lac(PAL['gold']), tag)
    with at((0, 0.04, 0.1)):
        add(glathe([(0.0, 0.0), (0.25, 0.0), (0.2, 0.06), (0.0, 0.085)], 12, rx=PI / 2), lac(shield, hi='#dcdce8'), tag)
        add(gloop(circle(0.245, 12, 0.0), 0.032, K=4, up=F.N((0, 0, 1))), soft(mul(shield, 0.78)), tag)
        paw(0.2, (0, -0.03, 0.075), depth=0.014, col=PAL['red'], tag=tag)

def wall_map(w=0.86, h=0.5, tag='map'):
    add(beam(w + 0.09, h + 0.09, 0.04, (0, 0, 0.01), c=0.02), wood('#5a3a28'), tag)
    nx, ny = 8, 5
    river = lambda x: -0.1 + math.sin((x + w / 2) / (w / 8) * 0.9) * 0.06
    def mapc(u, v):
        c = '#f6e6c0'
        if abs(v - river(u)) < 0.03: c = '#8fc8e8'
        for (x, y, r, hc) in ((-0.24, 0.1, 0.09, '#9ac07a'), (-0.1, 0.13, 0.07, '#8ab06a'), (0.22, -0.02, 0.08, '#9ac07a')):
            if (u - x) ** 2 + (v - y) ** 2 < r * r: c = hc
        tr = 0.16 - (u + 0.32) * 0.5
        if -0.34 < u < 0.26 and abs(v - tr) < 0.03 and int((u + 1) / 0.08) % 2 == 0: c = '#d8503a'
        return c
    t = Tmp(); ids = []
    for j in range(ny + 1):
        ids.append([t.vert(F.W((-w / 2 + w * i / nx, -h / 2 + h * j / ny, 0.055))) for i in range(nx + 1)])
    nf = F.N((0, 0, 1))
    for j in range(ny):
        for i in range(nx): t.face([ids[j][i], ids[j][i + 1], ids[j + 1][i + 1], ids[j + 1][i]], nf)
    loop = [ids[0][i] for i in range(nx + 1)] + [ids[j][nx] for j in range(1, ny + 1)] + [ids[ny][i] for i in range(nx - 1, -1, -1)] + [ids[j][0] for j in range(ny - 1, 0, -1)]
    cb = t.vert(F.W((0, 0, 0.03)))
    for k in range(len(loop)): t.face([cb, loop[(k + 1) % len(loop)], loop[k]], -nf)
    t.c = [mapc(-w / 2 + w * i / nx, -h / 2 + h * j / ny) for j in range(ny + 1) for i in range(nx + 1)] + ['#e8d6ae']
    add(t, None, tag)
    add(box(0.07, 0.07, 0.02, (0.32, -0.12, 0.06), r=0.0, rz=0.78), flat('#d8503a'), tag)
    add(box(0.07, 0.07, 0.02, (0.32, -0.12, 0.06), r=0.0, rz=-0.78), flat('#d8503a'), tag)

def big_sign(w=1.36, h=0.5, gold=False, tag='kanban'):
    add(beam(w + 0.12, h + 0.12, 0.06, (0, 0, -0.025), c=0.03), wood('#3a2618'), tag)
    bh = h / 3
    for i, c in enumerate(('#7e5032', '#9a6640', '#8a5a38')):
        add(beam(w, bh - 0.012, 0.07, (0, -h / 2 + bh * (i + 0.5), 0), c=0.022), wood(c, seed=i), tag)
    for s in (-1, 1): add(cyl(0.034, 0.034, 0.035, (s * (w / 2 - 0.08), h / 2 - 0.08, 0.045), K=6, rx=PI / 2), lac(PAL['brass']), tag)
    bone(0.62, (0, 0, 0.06), rz=0.62, r=0.045, col='#fff1dc', tag=tag)
    bone(0.62, (0, 0, 0.065), rz=-0.62, r=0.045, col='#fff4e4', tag=tag)
    crest(0.22, (0, 0, 0.1), gold=gold, tag=tag)
    chochin(0.08, 0.16, PAL['red'], cord=0.05, pos=(w / 2 + 0.02, -h / 2 - 0.02, 0.08), tag=tag)

def staff(x, z, lean, h=1.25, gourd=False, tie=None, tag='staffs'):
    tie = tie or PAL['red']
    with at((x, 0, z), rx=-lean, rz=lean * 0.25):
        add(cyl(0.026, 0.03, h, (0, h / 2, 0), K=4), wood('#a8784e'), tag)
        add(sph(0.044, (0, h + 0.01, 0), K=4, J=3), wood('#8a5e3e'), tag)
        add(cyl(0.038, 0.038, 0.05, (0, h - 0.18, 0), K=4), soft(tie), tag)
        if gourd:
            add(sph(0.065, (0.065, h - 0.34, 0.02), sc=(1, 1.2, 1), K=6, J=4), lac('#e89a4a'), tag)
            add(sph(0.045, (0.065, h - 0.22, 0.02), K=5, J=3), lac('#e89a4a'), tag)

def pack(color, roll='#efd8a8', s=1.0, tag='packs'):
    with at((0, 0, 0), s=s):
        add(sph(0.5, (0, 0.23, 0), sc=(0.4, 0.46, 0.28), K=8, J=4), paint(color, top=0.2, bot=0.3, ao_z=0.0, ao_k=0.25, ao_h=0.1), tag)
        add(sph(0.5, (0, 0.4, 0.03), sc=(0.38, 0.17, 0.27), K=8, J=3), paint(mul(color, 0.86), top=0.25), tag)
        rl = lathe([(0.0, -0.21), (0.078, -0.21), (0.08, -0.14), (0.08, -0.09), (0.078, 0.21), (0.0, 0.21)], 6, th0=PI / 6)
        rl.xform(F.m @ lm((0, 0.52, 0), rz=PI / 2))
        rl.c = [roll] * 6 + [PAL['red']] * 12 + [roll] * 6 + [mul(roll, 0.9), mul(roll, 0.9)]
        add(rl, None, tag)

def wheel(r=0.27, color='#a8784e', tag='cart'):
    wh = lathe([(0.0, -0.05), (r, -0.035), (r, 0.035), (r * 0.36, 0.05), (0.0, 0.085)], 9, th0=PI / 9)
    wh.xform(F.m @ lm((0, 0, 0), rx=PI / 2))
    dk, md, lt = mul(color, 0.7), color, mix(color, '#ffe8c8', 0.25)
    wh.c = [md] * 9 + [lt] * 9 + ['#6b4a3a'] * 9 + [dk, '#4a3428']
    add(wh, None, tag)
    for a in (0.4, 0.4 + PI / 2):
        add(box(0.05, 1.5 * r, 0.02, (0, 0, 0.055), r=0.0, rz=a), flat(mul(color, 0.8)), tag)
    return
    add(gloop([(r * math.cos(TAU * k / 9), r * math.sin(TAU * k / 9), 0) for k in range(9)], 0.045, K=4, up=F.N((0, 0, 1))),
        lambda p, n: mix(mul(color, 0.85), mix(color, '#ffe8c8', 0.2), clamp(n.z + 0.2)), tag)
    for a in (0.4, 0.4 + PI / 2):
        add(box(0.04, 2 * r - 0.04, 0.03, (0, 0, 0), r=0.0, rz=a), flat(mul(color, 1.06)), tag)
    add(cyl(0.07, 0.07, 0.12, (0, 0, 0), K=6, rx=PI / 2), wood('#6b4a3a'), tag)

def crate(s=0.36, wd='#e2b988', tag='crates', seed=0):
    hh = s * 0.85
    add(beam(s, hh, s, (0, hh / 2, 0), c=0.03), lambda p, n: mul(wd, (0.92 + 0.1 * clamp(n.z)) * (1 - 0.18 * (1 - smooth(0, 0.1, p.z)))), tag)
    for side in (0, 1):
        with at((0, 0, 0), ry=side * PI / 2):
            add(box(s * 0.82, 0.045, s + 0.02, (0, hh * 0.5, 0), r=0.0, rz=0.6 if side else -0.6), flat(mul(wd, 0.78)), tag)

def sack(r=0.12, tag='cart'):
    add(blob(F.W((0, 0, 0)), r, r * 2.0, lobes=3, K=7, seed=3, amp=0.12), paint('#e6d2a8', top=0.2, bot=0.25), tag)

def supply_cart(tag='cart'):
    add(beam(0.95, 0.08, 0.6, (0, 0.42, 0), c=0.025), wood('#b08058'), tag)
    for s in (-1, 1): add(beam(0.95, 0.16, 0.05, (0, 0.53, s * 0.28), c=0.018), wood('#9a6a48'), tag)
    add(beam(0.05, 0.16, 0.6, (-0.46, 0.53, 0), c=0.018), wood('#9a6a48'), tag)
    for s in (-1, 1): add(beam(0.9, 0.055, 0.055, (0.86, 0.36, s * 0.22), c=0.018, rz=-0.16), wood('#8a5e3e'), tag)
    add(beam(0.055, 0.055, 0.5, (1.27, 0.29, 0), c=0.018), wood('#8a5e3e'), tag)
    for s in (-1, 1):
        with at((-0.05, 0.3, s * 0.33)): wheel()
    with at((-0.22, 0.46, -0.06), ry=0.3): crate(0.3, '#e2b988', tag, 1)
    with at((0.2, 0.46, -0.15)): sack(0.12)
    add(cyl(0.02, 0.02, 0.75, (-0.42, 0.8, -0.24), K=4), wood('#6e4a34'), tag)
    add(box(0.035, 0.035, 0.18, (-0.42, 1.15, -0.16), r=0.0), wood('#6e4a34'), tag)
    chochin(0.07, 0.14, '#f4c04a', cord=0.03, pos=(-0.42, 1.13, -0.08), glow=True, tag=tag)

def yard_board(tag='board'):
    for s in (-1, 1): add(beam(0.085, 1.45, 0.085, (s * 0.42, 0.72, 0), c=0.022), wood('#8a5e3e', ao_z=0.0), tag)
    for i, c in enumerate(('#d2a676', '#c99a68', '#d8ac78')):
        add(beam(0.88, 0.19, 0.05, (0, 0.72 + i * 0.2, 0.01), c=0.018), wood(c, seed=i), tag)
    for s in (-1, 1): add(beam(0.6, 0.05, 0.36, (s * 0.25, 1.48, 0.02), c=0.02, rz=-s * 0.48), lac(PAL['red']), tag)
    add(beam(0.09, 0.08, 0.38, (0, 1.6, 0.02), c=0.025), lac('#7a2a24'), tag)
    notes = [(-0.24, 1.02, 0.22, 0.24, '#fffaf0', 0.08, '#e8503a'), (0.04, 1.0, 0.2, 0.22, '#e2f2ff', -0.07, '#ffd24a'),
             (0.28, 1.04, 0.2, 0.2, '#ffe2ec', 0.05, '#5a8ad8'), (-0.12, 0.78, 0.24, 0.16, '#fff2c4', -0.04, '#8fd0a0'),
             (0.2, 0.78, 0.18, 0.16, '#e4f6ea', 0.09, '#e8503a')]
    for x, y, w, h, c, tt, pin in notes:
        add(box(w, h, 0.016, (x, y, 0.042), r=0.0, rz=tt), lambda p, n, c=c: mix(c, mul(c, 0.9), clamp(-n.z)), tag)
        add(box(0.04, 0.04, 0.03, (x - math.sin(tt) * h * 0.4, y + h * 0.4, 0.055), r=0.0), soft(pin), tag)
    chochin(0.07, 0.14, PAL['gold'], cord=0.02, pos=(-0.42, 1.36, 0.08), glow=True, tag=tag)

def lantern_post(h=1.45, color=None, tag='lanternpost'):
    color = color or PAL['red']
    add(beam(0.1, h, 0.1, (0, h / 2, 0), c=0.03), wood('#6b4a3a', ao_z=0.0), tag)
    add(cyl(0.13, 0.16, 0.14, (0, 0.07, 0), K=7), stone_col(STONES[1]), tag)
    for y in (0.3, h - 0.3): add(box(0.12, 0.04, 0.12, (0, y, 0), r=0.0), soft(PAL['iron']), tag)
    add(cyl(0.02, 0.09, 0.07, (0, h + 0.035, 0), K=6), wood('#6b4a3a'), tag)
    add(sph(0.034, (0, h + 0.08, 0), K=5, J=3), lac(PAL['gold']), tag)
    add(beam(0.05, 0.05, 0.42, (0, h - 0.05, 0.19), c=0.015), wood('#6b4a3a'), tag)
    add(gtube([(0, h - 0.3, 0.04), (0, h - 0.07, 0.22)], 0.02, K=4), wood('#6b4a3a'), tag)
    chochin(0.17, 0.36, color, cord=0.03, pos=(0, h - 0.1, 0.34), tag=tag)

def training_dummy(tag='dummy'):
    add(cyl(0.045, 0.05, 1.2, (0, 0.6, 0), K=5), wood('#8a5e3e'), tag)
    add(cyl(0.16, 0.2, 0.08, (0, 0.04, 0), K=7), wood('#9a6a48', ao_z=0.0), tag)
    dm = lathe([(0.0, 0.0), (0.17, 0.0), (0.172, 0.05), (0.172, 0.09), (0.16, 0.38), (0.165, 0.41), (0.165, 0.45), (0.15, 0.5), (0.0, 0.5)], 7, th0=PI / 7)
    dm.xform(F.m @ lm((0, 0.53, 0)))
    straw = ['#c89a5a'] + ['#a8784e'] * 2 + ['#e6c46a'] + ['#a8784e'] * 2 + ['#efd078']
    dm.c = [c for c in straw for _ in range(7)] + ['#c89a5a', '#efd078']
    add(dm, None, tag)
    add(cyl(0.035, 0.035, 0.8, (0, 0.9, 0), K=5, rz=PI / 2), wood('#8a5e3e'), tag)
    add(sph(0.13, (0, 1.15, 0), K=7, J=4), paint('#efd488', top=0.2), tag)
    add(gloop([(0.128 * math.cos(TAU * k / 9), 1.19 + 0.02 * math.cos(TAU * k / 9), 0.128 * math.sin(TAU * k / 9)) for k in range(9)], 0.024, K=3), lac(PAL['red']), tag)
    tg = lathe([(0.0, 0.0), (0.13, 0.0), (0.13, 0.02), (0.09, 0.025), (0.0, 0.032)], 8, th0=PI / 8)
    tg.xform(F.m @ lm((0, 0.8, 0.16), rx=PI / 2))
    tg.c = ['#e8dcc8'] * 8 + ['#fffaf0'] * 8 + [PAL['red']] * 8 + ['#e8dcc8', PAL['red']]
    add(tg, None, tag)

def wood_stack(w=0.56, h=0.42, d=0.3, tag='woodpile'):
    rng = random.Random(5)
    y = 0.085
    while y < h:
        x = -w / 2 + 0.1 + (0.085 if y > 0.1 else 0.0)
        while x < w / 2:
            L = d * rng.uniform(0.9, 1.05)
            t = lathe([(0.0, -L / 2), (0.085, -L / 2), (0.085, L / 2), (0.0, L / 2)], 5, th0=rng.uniform(0, 1))
            t.xform(F.m @ lm((x + rng.uniform(-0.01, 0.01), y, rng.uniform(-0.02, 0.02)), rx=PI / 2))
            bark = rng.choice(['#8a5e44', '#9a6a4a', '#7a5040'])
            add(t, lambda p, n, bark=bark, M=F.m: '#f0cc98' if abs((M.to_3x3().inverted() @ n).y) > 0.85 else mul(bark, 0.9 + 0.15 * clamp(n.z)), tag)
            x += 0.175
        y += 0.15

def pot_flowers(r=0.17, h=0.24, flowers=('#ff8fb0', '#ffffff'), tag='pot'):
    add(glathe([(0.0, 0.0), (r * 0.7, 0.0), (r, h * 0.84), (r * 1.12, h * 1.0), (0.0, h * 0.95)], 9),
        lambda p, n: mix(mul('#d4774e', 0.86), '#ec9a6e', clamp(n.z * 0.6 + 0.3)), tag)
    with at((0, h * 0.8, 0)):
        add(blob(F.W((0, 0, 0)), r * 1.2, r * 1.3, lobes=4, K=8, seed=4, amp=0.18), lambda p, n: mix('#4f9a48', '#8ccf6a', clamp(n.z)), tag)
        rng = random.Random(9)
        for i in range(3):
            a = i / 3 * TAU + 0.3; rr = r * 0.75; c = flowers[i % len(flowers)]
            fb = blob(F.W((math.cos(a) * rr, r * 0.95 + rng.uniform(0, 0.06), math.sin(a) * rr)), 0.06, 0.045, lobes=4, K=8, seed=i, amp=0.3)
            fb.c = [mul(c, 0.85)] * 8 + [mix(c, '#fff6ea', 0.15)] * 8 + [mul(c, 0.8), '#ffd24a']
            add(fb, None, tag)

def flower_patch(w=0.36, d=0.2, n=3, colors=('#ff8fb0', '#ffd24a', '#ffffff'), tag='flowers'):
    add(blob(F.W((0, 0, 0)), w * 0.6, 0.07, lobes=3, K=7, seed=2, amp=0.15), lambda p, nn: mix('#7a5040', '#9a6a4a', clamp(nn.z)), tag)
    add(blob(F.W((0, 0.03, 0)), w * 0.5, 0.1, lobes=5, K=10, seed=6, amp=0.25), lambda p, nn: mix('#4f9a48', '#8ccf6a', clamp(nn.z)), tag)
    rng = random.Random(3)
    for i in range(n):
        x = -w * 0.35 + w * 0.7 * i / max(1, n - 1); z = rng.uniform(-d * 0.3, d * 0.3)
        hh = 0.12 + rng.uniform(0, 0.1)
        add(box(0.022, hh, 0.022, (x, 0.05 + hh / 2, z), r=0.0), flat('#4a8a3a'), tag)
        c = colors[i % len(colors)]
        fb = blob(F.W((x, 0.05 + hh, z)), 0.06, 0.045, lobes=4, K=8, seed=i + 5, amp=0.3)
        fb.c = [mul(c, 0.85)] * 8 + [mix(c, '#fff6ea', 0.15)] * 8 + [mul(c, 0.8), '#ffd24a' if c != '#ffd24a' else '#ff9a3a']
        add(fb, None, tag)

def nobori(h=2.2, w=0.38, color=None, sym='paw', tag='banners'):
    color = color or PAL['indigo']
    add(cyl(0.034, 0.04, h, (0, h / 2, 0), K=5), wood('#6b4a3a', ao_z=0.0), tag)
    add(cyl(0.022, 0.022, w + 0.08, (w / 2, h - 0.08, 0), K=4, rz=PI / 2), wood('#6b4a3a'), tag)
    add(sph(0.055, (0, h + 0.03, 0), K=6, J=3), lac(PAL['gold']), tag)
    fh = h * 0.72; yTop = h - 0.1
    def cloth(p, n):
        u = clamp((p.z - (yTop - fh)) / fh)
        return mix(mul(color, 0.8), mix(color, '#ffffff', 0.1), u * 0.7 + 0.2 * clamp(-n.y))
    add(beam(w, fh - 0.1, 0.03, (0.02 + w / 2, yTop - (fh - 0.1) / 2, 0), c=0.012, rx=0.02), cloth, tag)
    add(box(w + 0.004, 0.1, 0.034, (0.02 + w / 2, yTop - fh + 0.05, 0), r=0.0), soft('#fff6ea', 0.2), tag)
    add(box(0.05, fh, 0.036, (0.045, yTop - fh / 2, 0.002), r=0.0), soft('#fff6ea', 0.2), tag)
    if sym == 'paw':
        paw(w * 0.62, (0.02 + w / 2, yTop - fh * 0.3, 0.0), depth=0.024, col='#fff6ea', tag=tag)
    elif sym == 'bone':
        bone(w * 0.62, (0.02 + w / 2, yTop - fh * 0.3, 0.0), rz=0.5, r=0.03, col='#fff6ea', tag=tag)
    add(cyl(0.1, 0.13, 0.14, (0, 0.07, 0), K=7), stone_col(STONES[1]), tag)

def bunting(pts, sag=0.06, size=0.09, gap=0.14, colors=('#c8473a', '#f2c04a', '#fff6ea', '#2f4a7a'), tag='bunting'):
    k = 0
    for i in range(len(pts) - 1):
        a, b = Vector(pts[i]), Vector(pts[i + 1]); L = (b - a).length; sg = sag * min(1, L / 1.2)
        P = lambda t: Vector((a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t - sg * 4 * t * (1 - t), a.z + (b.z - a.z) * t))
        add(gtube([tuple(P(j / 5)) for j in range(6)], 0.014, K=3), flat('#5a4038'), tag)
        n = max(2, round(L / gap))
        for j in range(n):
            t = (j + 0.5) / n; p = P(t); tan = (P(min(1, t + 0.03)) - P(max(0, t - 0.03))).normalized()
            l = p - tan * size * 0.5; r = p + tan * size * 0.5; tip = p - Vector((0, size * 1.15, 0))
            c = colors[k % len(colors)]; k += 1
            tt = Tmp(); fz = Vector((0, 0, 0.012)); ctr = (l + r + tip) / 3
            ids = [tt.vert(F.W(tuple(q + fz))) for q in (l, r, tip)] + [tt.vert(F.W(tuple(q - fz))) for q in (l, r, tip)]
            nf = F.N((0, 0, 1)); tri = (l, r, tip)
            tt.face([ids[0], ids[2], ids[1]], nf); tt.face([ids[3], ids[4], ids[5]], -nf)
            for e0, e1 in ((0, 1), (1, 2), (2, 0)):
                tt.face([ids[e0], ids[e1], ids[e1 + 3], ids[e0 + 3]], F.W(tuple((tri[e0] + tri[e1]) / 2)) - F.W(tuple(ctr)))
            add(tt, lambda pp, nn, c=c: mix(mul(c, 0.86), c, clamp(nn.z + 0.6)), tag)

def hang_sign(w=0.3, h=0.26, color='#fff3dc', tag='hangsign'):
    add(box(0.04, 0.04, 0.5, (0, 0, 0.25), r=0.0), soft(PAL['iron']), tag)
    add(box(0.03, 0.03, 0.34, (0, -0.11, 0.12), r=0.0, rx=0.75), soft(PAL['iron']), tag)
    bz = 0.3
    for s in (-1, 1): add(box(0.02, 0.1, 0.02, (0, -0.06, bz + s * w * 0.32), r=0.0), soft(PAL['iron']), tag)
    with at((0, -0.11 - h / 2, bz), ry=PI / 2):
        add(beam(w + 0.06, h + 0.06, 0.04, (0, 0, 0), c=0.018), wood('#6b4a3a'), tag)
        add(beam(w, h, 0.056, (0, 0, 0), c=0.02), soft(color, 0.2), tag)
        paw(min(w, h) * 0.8, (0, 0, 0.0), depth=0.04, col='#a8382c', tag=tag)

def rain_chain(x, yTop, z, groundY=0.0, color='#b58a4a', tag='rainchain'):
    L = yTop - groundY - 0.12
    if L < 0.4: return
    add(box(0.04, 0.06, 0.06, (x, yTop + 0.02, z), r=0.0), soft(mul(color, 0.8)), tag)
    n = max(4, round(L / 0.28))
    add(box(0.02, L, 0.02, (x, yTop - L / 2, z), r=0.0), flat(mul(color, 0.7)), tag)
    for i in range(n):
        y = yTop - 0.02 - (i + 0.5) * L / n
        add(glathe([(0.0, -0.025), (0.026, -0.025), (0.042, 0.025), (0.0, 0.02)], 4, pos=(x, y, z)), lac(color if i % 2 else mul(color, 1.12)), tag)
    add(cyl(0.14, 0.16, 0.06, (x, groundY + 0.03, z), K=7), stone_col('#b8adb8'), tag)
    add(cyl(0.105, 0.105, 0.02, (x, groundY + 0.055, z), K=7), soft('#6ab8d8', 0.3), tag)

def furin(color='#bfe6ff', tag='charms'):
    add(box(0.02, 0.08, 0.02, (0, -0.04, 0), r=0.0), flat(PAL['ink']), tag)
    add(glathe([(0.0, -0.17), (0.062, -0.17), (0.04, -0.09), (0.0, -0.075)], 6), lambda p, n: mix(color, '#ffffff', clamp(n.z * 0.4 + 0.2)), tag)
    add(box(0.06, 0.15, 0.012, (0, -0.28, 0), r=0.0), soft('#e8f6ff', 0.2), tag)

def bell_charm(tag='charms'):
    add(box(0.02, 0.06, 0.02, (0, -0.03, 0), r=0.0), flat(PAL['red']), tag)
    add(sph(0.05, (0, -0.1, 0), K=6, J=3), lac(PAL['gold']), tag)
    add(box(0.05, 0.12, 0.012, (0, -0.2, 0), r=0.0), soft('#ffb0c0', 0.2), tag)

# ================================================================== the Guild (guild.js guild(B, level))
def foundation(w, d, h, pad=0.12, seed=1):
    W_, D_ = w + pad, d + pad
    # the plinth, with a buried skirt to z = -0.3
    add(beam(W_ - 0.06, h + 0.3, D_ - 0.06, (0, (h - 0.3) / 2, 0), c=0.06),
        lambda p, n: mul(mix('#a89ca8', '#c8bcc6', clamp(n.z)), 0.8 + 0.2 * smooth(-0.05, h, p.z)), 'foundation')
    rng = random.Random(seed)
    per = 2 * (W_ + D_); n = max(8, round(per / 0.6))
    for i in range(n):
        u = (i + rng.uniform(0.25, 0.4)) / n * per
        if u < W_: x, z, nx, nz = -W_ / 2 + u, D_ / 2, 0, 1
        elif u - W_ < D_: x, z, nx, nz = W_ / 2, D_ / 2 - (u - W_), 1, 0
        elif u - W_ - D_ < W_: x, z, nx, nz = W_ / 2 - (u - W_ - D_), -D_ / 2, 0, -1
        else: x, z, nx, nz = -W_ / 2, -D_ / 2 + (u - 2 * W_ - D_), -1, 0
        r = rng.uniform(0.18, 0.22)
        c = STONES[rng.randrange(len(STONES))]
        sx = 0.6 if nx else 1.15; sz = 0.6 if nz else 1.15
        t = lathe([(0.0, -0.3), (r, h * 0.4), (r * 0.8, h * 0.86), (0.0, h * rng.uniform(0.92, 1.02))], 6,
                  th0=rng.uniform(0, 1), sx=sx, sy=sz, e=2.3,
                  rfn=lambda rr, zz, th, s=i: rr * (1 + 0.07 * math.sin(2 * th + s) + 0.04 * math.sin(3 * th + s * 1.3)))
        t.xform(F.m @ lm((x - nx * 0.01, 0.0, z - nz * 0.01)))
        add(t, stone_col(c, i), 'foundation')

def porch(y0, h, d, pz, L):
    # the engawa deck in front of the door, its beam and legs, a step stone
    x0, x1, z, depth, y = -0.8, 0.8, d / 2, 0.48, y0 + 0.02
    w = x1 - x0; n = 3; rng = random.Random(4)
    for i in range(n):
        c = rng.choice(['#d8a878', mul('#d8a878', 0.94), mul('#d8a878', 1.05)])
        add(beam(w, 0.075, depth / n - 0.014, (0, y - 0.035, z + (i + 0.5) * depth / n), c=0.022), wood(c, seed=i), 'porch')
    add(beam(w, 0.1, 0.09, (0, y - 0.11, z + depth - 0.045), c=0.028), wood(PAL['frameLo']), 'porch')
    for s in (-1, 1): add(beam(0.1, y - 0.06, 0.1, (s * (w / 2 - 0.08), (y - 0.06) / 2, z + depth - 0.08), c=0.028), wood(PAL['frameLo'], ao_z=0.0), 'porch')
    pebble((rng.uniform(-0.1, 0.1), -0.02, z + depth + 0.24), 0.32, sq=0.45, seed=2, col=STONES[0], tag='porch')
    # the two red lacquered posts and their beam, paper lanterns, the bell
    for x in (-0.72, 0.72):
        add(cyl(0.065, 0.072, y0 + h - 0.1, (x, (y0 + h - 0.1) / 2, pz), K=8), lac(PAL['red'], PAL['redHi'], PAL['redLo']), 'porch')
        add(cyl(0.11, 0.13, 0.13, (x, 0.065, pz), K=8), stone_col(STONES[2]), 'porch')
    add(beam(1.66, 0.12, 0.11, (0, y0 + h - 0.14, pz), c=0.035), lac(PAL['red'], PAL['redHi'], PAL['redLo']), 'porch')
    for x in (-0.5, 0.5): chochin(0.12, 0.24, PAL['red'], cord=0.02, pos=(x, y0 + h - 0.21, pz), tag='porch')
    with at((0, y0 + h - 0.2, pz)): bell_charm('porch')
    if L >= 2:
        bunting([(-0.72, y0 + h - 0.08, pz + 0.07), (0, y0 + h - 0.04, pz + 0.09), (0.72, y0 + h - 0.08, pz + 0.07)])

def lookout(rich):
    """the level-3 lookout (guild.js): a stone footing, four posts with girts and braces, a ladder on the front, a railed
    platform under its own hip roof with a gold finial, a lantern, and the Guild's flag"""
    tx, tz, tH, s = 1.5, -1.0, 3.75, 0.3
    with at((tx, 0, tz)):
        add(beam(0.86, 0.22 + 0.3, 0.86, (0, (0.22 - 0.3) / 2, 0), c=0.05), stone_col(STONES[2]), 'lookout')
        for sx in (-1, 1):
            for sz in (-1, 1):
                add(beam(0.11, tH, 0.11, (sx * s, 0.22 + tH / 2, sz * s), c=0.025), wood(PAL['frame'], ao_z=0.2), 'lookout')
        for y in (0.85, 1.75, 2.6):
            for (ax, az), (bx, bz) in (((-s, -s), (s, -s)), ((s, -s), (s, s)), ((s, s), (-s, s)), ((-s, s), (-s, -s))):
                add(box(abs(bx - ax) + 0.07, 0.06, abs(bz - az) + 0.07, ((ax + bx) / 2, 0.22 + y, (az + bz) / 2), r=0.0), wood(PAL['frame']), 'lookout')
        L_ = math.hypot(2 * s, 1.2); a_ = math.atan2(1.2, 2 * s)
        add(box(L_, 0.045, 0.045, (0, 1.0, s + 0.015), r=0.0, rz=a_), wood(PAL['frame']), 'lookout')
        add(box(L_, 0.045, 0.045, (0, 1.0, -s - 0.015), r=0.0, rz=-a_), wood(PAL['frame']), 'lookout')
        for sx in (-1, 1): add(box(0.04, tH - 0.4, 0.04, (sx * 0.12, 0.22 + (tH - 0.4) / 2, s + 0.08), r=0.0), wood('#a8784e'), 'lookout')
        for i in range(8): add(box(0.26, 0.04, 0.04, (0, 0.45 + i * 0.4, s + 0.08), r=0.0), wood('#a8784e'), 'lookout')
        py = 0.22 + tH - 0.62
        add(beam(0.88, 0.08, 0.88, (0, py, 0), c=0.025), wood('#c89a6a'), 'lookout')
        for sd in (0.0, PI / 2, PI, -PI / 2):
            with at((0, py + 0.28, 0), ry=sd):
                add(box(0.86, 0.05, 0.045, (0, 0, 0.42), r=0.0), lac(PAL['red'], PAL['redHi'], PAL['redLo']), 'lookout')
                add(box(0.86, 0.035, 0.035, (0, -0.14, 0.42), r=0.0), lac(PAL['red'], PAL['redHi'], PAL['redLo']), 'lookout')
        roof(dict(type='hip', w=0.78, d=0.78, y0=0.22 + tH + 0.02, over=0.26, H=0.55, curve=0.5, lift=0.2, liftW=0.3, thick=0.09,
                  ribW=0.6, ribAmp=0.045, course=0.0, tTop=0.88, seed=41, rich=rich, discs=False, curl=False))
        chochin(0.08, 0.16, PAL['gold'], cord=0.03, pos=(0, py + 0.5, 0.1), tag='lookout')
    with at((tx + s + 0.04, 0, tz - s - 0.04)):        # the Guild's flag (indigo, the paw)
        fy = 0.22 + tH
        add(cyl(0.026, 0.03, 0.9, (0, fy + 0.5, 0), K=5), wood(PAL['frame']), 'lookout')
        add(sph(0.04, (0, fy + 0.96, 0), K=5, J=3), lac(PAL['gold']), 'lookout')
        add(box(0.5, 0.32, 0.03, (0.27, fy + 0.78, 0), r=0.0, rx=0.03),
            lambda p, n: mix(mul(PAL['indigo'], 0.85), mix(PAL['indigo'], '#7a98d0', 0.3), clamp(n.z * 0.5 + 0.4)), 'lookout')
        paw(0.2, (0.27, fy + 0.78, 0.0), depth=0.024, col='#fff6ea', tag='lookout')

def build(L):
    global A
    A = Asset2()
    F.__init__()
    gold = L >= 3
    rich = 1 if L == 1 else 2                          # (models.js DETAIL.guild = [1, 2, 2]: a humbler trim at level 1)
    w, d, h, y0, cx, cz = 3.1, 1.8, 1.6, 0.32, -0.38, -0.44
    front = cz + d / 2
    # ---------------------------------------------------------------- the hall
    F.push((cx, 0, cz))
    foundation(w, d, y0)
    walls(dict(w=w, d=d, h=h, y0=y0, koshi=PAL['koshi'], koshiSkip='f', posts={'f': [-0.56, 0.56]}))
    blk = dict(w=w, d=d)
    with on_face(blk, 'f', 0, y0):
        door_wood(0.92, 1.24)
        noren(0.94, 0.48, 1.33, 0.17)
    with on_face(blk, 'f', -1.06, y0 + 0.24): weapon_rack()
    with on_face(blk, 'f', 1.06, y0 + 0.92): shoji(0.6, 0.56, box_=True, flowers=['#ff8fb0', '#ffd24a'])
    for u in (-0.42, 0.42):
        with on_face(blk, 'r', u, y0 + 0.92): shoji(0.5, 0.5)
    with on_face(blk, 'l', 0, y0 + 0.92): round_window(0.27, box_=True, flowers=['#ff8fb0', '#ffd24a'])
    with on_face(blk, 'b', -0.5, y0 + 1.08):            # a straw hat on a peg
        add(cyl(0.02, 0.02, 0.1, (0, 0.08, 0.05), K=5, rx=PI / 2), flat('#5a3a28'), 'backwall')
        with at((0, 0, 0.1), rx=PI / 2 - 0.2):
            hat = lathe([(0.0, -0.02), (0.25, -0.01), (0.1, 0.06), (0.08, 0.085), (0.0, 0.11)], 9, th0=PI / 9)
            hat.xform(F.m)
            hat.c = ['#d8b45a'] * 9 + [PAL['red']] * 9 + [PAL['red']] * 9 + ['#c8a450', '#f2d47a']
            add(hat, None, 'backwall')
    with on_face(blk, 'b', 0.5, y0 + 1.0):             # a gourd and a coil of rope
        add(cyl(0.02, 0.02, 0.1, (0, 0.1, 0.05), K=5, rx=PI / 2), flat('#5a3a28'), 'backwall')
        add(sph(0.085, (0, -0.06, 0.1), sc=(1, 1.25, 0.8), K=7, J=4), lac('#e89a4a'), 'backwall')
        add(sph(0.058, (0, 0.07, 0.1), K=6, J=3), lac('#e89a4a'), 'backwall')
        add(gloop(circle(0.09, 7, 0.08, 0.0, -0.36), 0.028, K=3, up=F.N((0, 0, 1))), soft('#d8b880'), 'backwall')
    for u in (-1.0, 0.0, 1.0):
        with on_face(blk, 'b', u, y0 + 0.92): shoji(0.56, 0.5)
    # the pent roof round the ground floor
    low = roof(dict(type='skirt', w=w, d=d, y0=y0 + h, over=0.42, H=0.5, curve=0.36, lift=0.26, liftW=0.8, thick=0.14,
                    ribW=0.55, ribAmp=0.065, course=0.5, courseAmp=0.035, tTop=0.5, seed=11, rich=rich))
    pz = d / 2 + 0.36
    porch(y0, h, d, pz, L)
    # ---------------------------------------------------------------- the upper storey
    y2 = low['topY']; w2 = max(2.3, low['openW'] + 0.1); d2 = max(1.16, low['openD'] + 0.08); h2 = 1.06
    walls(dict(w=w2, d=d2, h=h2, y0=y2, sill=False))
    blk2 = dict(w=w2, d=d2)
    for u in (-0.72, 0.72):
        with on_face(blk2, 'f', u, y2 + 0.6): shoji(0.46, 0.42)
    with at((0, y2 + 0.2, d2 / 2 + 0.14)):
        for s2 in (-1, 1): add(beam(0.07, 0.42, 0.07, (s2 * 0.42, -0.1, -0.03), c=0.02), wood('#4a3226'), 'kanban')
        with at((0, 0.32, 0)): big_sign(1.36, 0.5, gold)
    with on_face(blk2, 'r', 0, y2 + 0.52): crossed_arms()
    with on_face(blk2, 'l', 0, y2 + 0.58): round_window(0.24, fine=True)
    with on_face(blk2, 'b', 0, y2 + 0.56): wall_map(min(0.92, w2 - 0.6), 0.52)
    tOver, tg = 0.36, 0.46
    top = roof(dict(type='irimoya', w=w2, d=d2, y0=y2 + h2, over=tOver, H=0.82, curve=0.46, lift=0.4, liftW=0.85, thick=0.16,
                    ribW=0.55, ribAmp=0.07, course=0.5, courseAmp=0.035, tg=tg, gOver=0.22, seed=23, rich=rich))
    if L < 3:                                           # the pennant with the paw on the ridge
        with at((-(w2 / 2 - 0.15), top['ridgeY'] + 0.08, 0)):
            add(cyl(0.022, 0.028, 0.95, (0, 0.47, 0), K=6), wood(PAL['frame']), 'pennant')
            add(sph(0.045, (0, 0.97, 0), K=7, J=4), lac(PAL['gold']), 'pennant')
            add(beam(0.42, 0.3, 0.03, (0.23, 0.77, 0), c=0.012),
                lambda p, n: mix(mul(PAL['red'], 0.82), PAL['redHi'], clamp(n.z * 0.5 + 0.35)), 'pennant')
            paw(0.17, (0.23, 0.77, 0.0), depth=0.024, col='#fff6ea', tag='pennant')
    xg = top['xg']; Rt = top['R']
    yb = top['yAt'](xg, 0); gy = yb + (top['ridgeY'] - yb) * 0.36
    for s in (-1, 1):
        with at((s * (xg + 0.05), gy, 0), ry=s * PI / 2): crest(0.15, gold=gold, tag='crest')
    ex, ez = w / 2 + 0.16, d / 2 + 0.12
    rain_chain(-ex, low['underAt'](-ex, ez), ez, y0 * 0.5)
    with at((w / 2 + 0.1, y0 + h - 0.22, d / 2 + 0.3)): furin()
    F.pop()
    # ---------------------------------------------------------------- the lean-to on the right: staffs and packs
    lx0, lx1, lzF, lzB = cx + w / 2, 1.94, 0.4, (-0.42 if L >= 3 else -1.18)
    lzc = (lzF + lzB) / 2; ly = 1.48
    F.push(((lx0 + lx1) / 2, 0, lzc), ry=PI / 2)
    roof(dict(type='shed', w=lzF - lzB, d=lx1 - lx0, y0=ly - 0.05, over=0.12, gOver=0.14, H=0.28, curve=0.2, lift=0.08, liftW=0.3,
              thick=0.1, ribW=0.38, ribAmp=0.045, course=0.0, k=0.374, seed=31, rich=rich))
    F.pop()
    for z in (lzF - 0.04, lzB + 0.06):
        add(cyl(0.055, 0.06, ly - 0.32, (lx1 - 0.1, (ly - 0.32) / 2, z), K=6), wood(PAL['frame'], ao_z=0.0), 'leanto')
        add(cyl(0.09, 0.11, 0.1, (lx1 - 0.1, 0.05, z), K=7), stone_col(STONES[2]), 'leanto')
    add(beam(0.09, 0.09, lzF - lzB + 0.06, (lx1 - 0.1, ly - 0.36, lzc), c=0.025), wood(PAL['frame']), 'leanto')
    rz_ = lzc + 0.02
    add(beam(0.065, 0.065, 0.8, (lx0 + 0.14, 0.86, rz_), c=0.02), wood('#8a5e3e'), 'leanto')
    for s in (-1, 1): add(beam(0.055, 0.86, 0.055, (lx0 + 0.14, 0.43, rz_ + s * 0.36), c=0.018), wood('#8a5e3e', ao_z=0.0), 'leanto')
    ties = [PAL['red'], '#5a8ad8', PAL['gold'], '#6ac08a', '#e86a7a']
    for i in range(5): staff(lx0 + 0.34, rz_ - 0.3 + i * 0.15, -0.25, 1.15 + (i % 2) * 0.1, gourd=i == 1, tie=ties[i])
    with at((lx0 + 0.52, 0, lzF - 0.2), ry=-0.4): pack('#4f78c0', s=0.82)
    with at((lx0 + 0.54, 0, lzc - 0.12), ry=0.5): pack('#6a9a5a', roll='#f0e0c0', s=0.78)
    if L >= 2:
        with at((lx1 - 0.1, ly - 0.42, lzF - 0.04), ry=PI / 2): hang_sign(0.3, 0.26)
    if L < 3:
        with at((lx0 + 0.36, 0, -1.12), ry=PI / 2): wood_stack(0.56, 0.42, 0.3)
        with at((1.6, 0, -0.66), ry=-0.5): training_dummy()
    else:
        lookout(rich)
    # ---------------------------------------------------------------- the yard
    with at((1.28, 0, 1.0), ry=PI * 0.86): supply_cart()
    with at((-1.86, 0, 1.3), ry=0.4): lantern_post(1.45, PAL['red'])
    with at((-1.22, 0, 1.13), ry=0.12): yard_board()
    with at((0.62, 0, 1.28)): pot_flowers()
    with at((-0.55, 0, 1.36)): flower_patch()
    for i in range(2):
        t = (i + 0.5) / 2
        pebble((cx + (i - 0.5) * 0.05, -0.02, front + 0.85 + (1.42 - front - 0.85) * t), 0.24, sq=0.4, seed=10 + i, tag='yard')
    if L >= 2:
        for x, c in ((-1.92, PAL['indigo']), (0.5, PAL['red'])):
            with at((x, 0, 1.36), ry=0.0 if x < 0 else PI): nobori(2.2, 0.38, c, 'paw')
    if L >= 3:                                         # a third banner (the bone) and a crate by the board
        with at((1.9, 0, 0.62), ry=PI): nobori(2.4, 0.4, PAL['indigo'], 'bone')
        with at((-1.95, 0, 0.3)): crate(0.26, '#e2b988', 'yard', 3)
    return A, dict(door=(cx, 0, front + 0.95), ridgeY=top['ridgeY'], low_topY=y2, w2=w2, d2=d2)

# ================================================================== finishing and export
def finish(A, seed=5, amt=0.03):
    """the kit's hand-made warp (gentle leans and sags, identical for every object), then ground AO on the colours"""
    a = (seed % 97) * 1.37 + 0.7
    for o in A.objs.values():
        V = o['v']
        for i, p in enumerate(V):
            x, y, z = p.x, -p.y, p.z                    # game x, game z, game y
            hh = max(0.0, z); k = amt * (0.35 + hh * 0.28)
            dx = (math.sin(z * 0.9 + a) * 0.6 + math.sin(y * 1.3 + a * 2.1) * 0.4) * k
            dz = (math.sin(z * 1.1 + a * 1.7) * 0.6 + math.sin(x * 1.2 + a * 0.6) * 0.4) * k
            dy = math.sin(x * 0.9 + a) * math.sin(y * 1.1 + a * 1.3) * amt * 0.9 * clamp(z / 0.4)
            V[i] = Vector((p.x + dx, p.y - dz, p.z + dy))
        for i, (p, c) in enumerate(zip(V, o['c'])):
            k = (0.8 + 0.2 * smooth(-0.02, 0.45, p.z)) ** 2.2
            o['c'][i] = (c[0] * k, c[1] * k, c[2] * k, 1.0)

def export_level(A, name):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mats = {}
    mt = bpy.data.materials.new('body'); mt.use_nodes = True; nt = mt.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Roughness'].default_value = 0.8; bsdf.inputs['Metallic'].default_value = 0.0
    vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'; nt.links.new(vc.outputs['Color'], bsdf.inputs['Base Color'])
    mats['body'] = mt
    mg = bpy.data.materials.new('window_glow'); mg.use_nodes = True; nt = mg.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Roughness'].default_value = 0.8
    vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'; nt.links.new(vc.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Emission Color'].default_value = lin('#ffd890'); bsdf.inputs['Emission Strength'].default_value = 1.0
    mats['window_glow'] = mg
    obs = [to_object(k, o, mats) for k, o in A.objs.items()]
    lo = Vector((1e9,) * 3); hi = Vector((-1e9,) * 3)
    for o in A.objs.values():
        for v in o['v']: lo = Vector(map(min, lo, v)); hi = Vector(map(max, hi, v))
    print('GM %s tris %d %s' % (name, A.tris(), {k: A.tris(k) for k in A.objs}))
    print('GM %s parts %s' % (name, dict(sorted(A.count.items(), key=lambda kv: -kv[1]))))
    print('GM %s bounds blender x %.3f..%.3f y %.3f..%.3f z %.3f..%.3f | game z %.3f..%.3f' % (name, lo.x, hi.x, lo.y, hi.y, lo.z, hi.z, -hi.y, -lo.y))
    for ob in obs: print('GM %s check %s %s' % (name, ob.name, check(ob)))
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, name + '.blend'))
    for o in bpy.context.scene.objects: o.select_set(o.type == 'MESH')
    out = os.path.join(MODELS, name + '.glb')
    kw = dict(filepath=out, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
              export_attributes=True, export_lights=False, export_cameras=False, export_animations=False,
              export_normals=True, export_texcoords=False, export_materials='EXPORT')
    try: bpy.ops.export_scene.gltf(export_vertex_color='ACTIVE', **kw)
    except TypeError as e:
        print('GM export_vertex_color rejected:', e); bpy.ops.export_scene.gltf(export_colors=True, **kw)
    print('GM wrote', out)

levels = [1, 2, 3] if LEVEL == 'all' else [int(LEVEL)]
for L in levels:
    asset, info = build(L)
    finish(asset)
    print('GM L%d info %s' % (L, info))
    export_level(asset, 'guild-%d' % L)
