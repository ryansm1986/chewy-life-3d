# PAWHAVEN village pieces (ROADMAP Z-D6): the zone villages' signature set pieces, built in Blender by script.
#   blender --background --factory-startup --python build_village-pieces.py -- --piece waystone|all
# Deterministic: no randomness except seeded PRNGs; a re-run reproduces every GLB exactly.
# Frame (every piece): 1 unit = 1 m, Blender Z up, the front faces -Y (the glTF exporter makes it the game's +z).
# A kit function's local (x, y, z) maps to Blender (x, -z, y).
# Shared kit: a mesh accumulator with per-vertex painted colours (attribute `Col`), rounded boxes with analytic
# normals, lathes with superellipse sections, tubes, sweeps, and "icing" drapes (moss / snow caps) over surfaces.
import bpy, bmesh, math, os, sys, random
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..', '..'))
MODELS = os.path.join(REPO, 'public', 'models')
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
PIECE = argv[argv.index('--piece') + 1] if '--piece' in argv else 'all'
print('VP build pid', os.getpid())

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

# ================================================================== shared palette
STONE = '#a49ca4'; STONE_HI = '#c8c0c6'; STONE_LO = '#746c7a'
PLINTH = '#a29688'; PLINTH_HI = '#c0b4a6'
WOOD = '#b45a3c'; WOOD_DK = '#7c3a2a'; DOOR = '#6a4232'; GOLD = '#f0bc4a'; BRASS = '#c8963e'
VERM = '#e2573a'; VERM_HI = '#f4805a'; VERM_LO = '#b23e2c'; INK = '#3c3040'; INK_HI = '#5c4c60'
STRAW = '#ecd6a0'; STRAW_DK = '#c4a868'; PAPER = '#fff3e2'
LAMP = '#fbe2a6'

# ================================================================== 1. the Waypoint Shrine
def build_waystone():
    A = Asset(); rng = random.Random(77)
    BODY, ROOF, CAP = 'body', 'tintRoof', 'tintCap'
    OB = 'waystone'
    PT = 0.14                                   # the plinth's top (the kit puts everything at y = 0.14)

    # ---------------- the plinth: a base slab, fitted paving slabs with 3 cm round-overs, edge pebbles round its foot
    A.add(OB, BODY, rbox((1.84, 1.56, 0.10), r=0.045, M=M_at((0, 0.10, 0.05))),
          paint(mul(PLINTH, 0.86), top=0.08, bot=0.25, ao_z=0.0, ao_k=0.25, ao_h=0.06), 'plinth')
    slabs = [  # (x0, x1, y0, y1) in Blender x / y (front = -y); gaps 3 cm
        (-0.90, -0.33, -0.66, -0.13), (-0.30, 0.30, -0.66, -0.13), (0.33, 0.90, -0.66, -0.13), (-0.90, 0.90, -0.10, 0.86)]
    for i, (x0, x1, y0, y1) in enumerate(slabs):
        hz = 0.07 + rng.uniform(-0.004, 0.006); tone = 1 + rng.uniform(-0.05, 0.05)
        c = mul(PLINTH, tone); chi = mul(PLINTH_HI, tone)
        A.add(OB, BODY, rbox((x1 - x0, y1 - y0, hz), r=0.03, M=M_at(((x0 + x1) / 2, (y0 + y1) / 2, PT - hz / 2 + 0.002), rz=rng.uniform(-0.01, 0.01))),
              paint(c, hi=chi, top=0.2, bot=0.2, ao_z=PT - 0.05, ao_k=0.15, ao_h=0.03, nz_amp=0.05, nz_f=4, seed=i), 'plinth')
    for i, (px, py, pr) in enumerate([(-0.945, -0.28, 0.055), (-0.94, 0.48, 0.06), (0.945, 0.02, 0.055), (0.94, 0.66, 0.05),
                                      (0.42, -0.70, 0.05)]):
        pb = ellipsoid(Vector((0, 0, 0)), (pr * 1.25, pr, pr * 0.75), K=8, J=3)
        pb.xform(M_at((px, py, pr * 0.7), rz=rng.uniform(0, 3)))
        A.add(OB, BODY, pb, paint(mul(STONE, 0.95 + 0.1 * rng.random()), hi=STONE_HI, top=0.3, bot=0.3, ao_z=0.0, ao_k=0.3, ao_h=0.04), 'pebbles')
    def tuft_col(p, n):
        return grey(clamp((0.74 + 0.24 * clamp(n.z)) * (0.92 + 0.14 * vnoise(p, 14, 6)) if n.z > -0.2 else 0.6, 0.3, 1.0))
    for i, (tx, ty, tz, tr) in enumerate([(-0.885, -0.645, PT - 0.03, 0.08), (0.885, -0.645, PT - 0.03, 0.075),
                                          (0.34, 0.20, PT - 0.005, 0.075), (0.86, 0.46, PT - 0.005, 0.065), (-0.9, 0.3, PT - 0.03, 0.06)]):
        A.add(OB, CAP, blob(Vector((tx, ty, tz)), tr, 0.075, lobes=4 + i % 2, K=8, seed=i), tuft_col, 'tufts')

    # ---------------- the hokora on its pedestal (kit B.at([-0.45, 0.14, -0.45]) -> Blender (-0.45, 0.45, 0.14))
    hx, hy = -0.45, 0.45
    PED = '#b2a89c'
    A.add(OB, BODY, rbox((0.74, 0.62, 0.40), r=0.05, M=M_at((hx, hy, PT + 0.19), rz=0.01)), paint(PED, hi='#d0c6b8', top=0.16, ao_z=PT, ao_k=0.22, ao_h=0.1, nz_amp=0.04, seed=3), 'pedestal')
    A.add(OB, BODY, rbox((0.78, 0.66, 0.07), r=0.032, M=M_at((hx, hy, PT + 0.425))), paint(mul(PED, 1.02), hi='#ddd4c6', top=0.2), 'pedestal')
    B0 = PT + 0.46                              # the house sits on the pedestal
    # the house: walls, corner posts, sill and lintel, a lattice door
    A.add(OB, BODY, rbox((0.52, 0.42, 0.46), r=0.03, M=M_at((hx, hy, B0 + 0.23))), paint(WOOD, top=0.1, bot=0.2, ao_z=B0, ao_k=0.25, ao_h=0.12), 'house')
    for sx in (-1, 1):
        for sy in (-1,):        # (front posts only: the back ones hide behind the house at the game camera)
            A.add(OB, BODY, rbox((0.075, 0.075, 0.50), r=0.03, M=M_at((hx + sx * 0.265, hy + sy * 0.21, B0 + 0.25))),
                  paint(WOOD_DK, top=0.15, ao_z=B0, ao_k=0.2, ao_h=0.1), 'house')
    A.add(OB, BODY, rbox((0.64, 0.52, 0.06), r=0.025, M=M_at((hx, hy, B0 + 0.47))), paint(WOOD_DK, top=0.1), 'house')
    fy = hy - 0.21                               # the house's front face
    A.add(OB, BODY, rbox((0.36, 0.04, 0.33), r=0.015, M=M_at((hx, fy - 0.005, B0 + 0.235))), paint(DOOR, top=0.15, ao_z=B0 + 0.06, ao_k=0.3, ao_h=0.1), 'house')
    for i in (-1, 0, 1):
        A.add(OB, BODY, rbox((0.04, 0.03, 0.31), r=0.0, M=M_at((hx + i * 0.095, fy - 0.03, B0 + 0.235))), paint(BRASS, top=0.15, bot=0.25), 'house')

    # ---------------- the gable roof (tintRoof, greyscale): a curved slab, ridge along x, tile rolls down the slopes
    RZ0, RZ1 = B0 + 0.46, B0 + 0.84             # eave tip and ridge heights (1.06 .. 1.44)
    LX, DY, TH = 0.44, 0.43, 0.065               # half-length (gable overhang), half-depth (eave overhang), thickness
    def roof_top(x, v):
        """the roof's top surface height at x (local), v in [-1, 1] across (front -1 .. back 1)"""
        tt = abs(v); u = abs(x) / LX
        f = tt * (1 + 0.55 * (1 - tt))
        z = RZ1 - (RZ1 - RZ0) * f / 1.0
        z += 0.05 * tt ** 5 * (0.35 + 0.65 * u ** 3)    # the eaves turn up, most at the corners
        return z
    NRoll = 4
    def roll(x):                                  # rounded tile rolls across x
        ph = (x / (2 * LX) + 0.5) * NRoll
        return 0.5 - 0.5 * math.cos(TAU * ph)
    vs = [-1.0, -0.7, -0.34, 0.0, 0.34, 0.7, 1.0]
    NX = 12
    xs = [-LX + 2 * LX * i / NX for i in range(NX + 1)]
    def profile(x):
        top = [(v * DY, roof_top(x, v) + 0.014 * roll(x) * smooth(0.0, 0.25, abs(v))) for v in vs]
        und = [(v * (DY - 0.012), roof_top(x, v) - TH + 0.012 * abs(v)) for v in reversed(vs)]
        tipb = (DY + 0.022, roof_top(x, 1) - TH * 0.45)
        tipf = (-DY - 0.022, roof_top(x, -1) - TH * 0.45)
        return top + [tipb] + und + [tipf]           # loop: front-top -> back-top -> back tip -> underside -> front tip
    rf = Tmp(); rings = []; cs = []
    for x in xs:
        pr = profile(x); rings.append([Vector((hx + x, hy + w, z)) for w, z in pr]); cs.append(Vector((hx + x, hy, RZ1 - 0.15)))
    # gable ends: an inset ring, then a strip cap pairing top and underside points (own verts, flat)
    def inset(ring, x_in):
        n = len(vs); outr = []
        for k, p in enumerate(ring):
            # partner across the slab thickness
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
    n = len(vs)
    for a, sgn in ((ids[0], -1), (ids[-1], 1)):
        nrm = X * sgn
        for k in range(n - 1):
            p0, p1 = a[k], a[k + 1]
            q0, q1 = a[n + 1 + (n - 1 - k)], a[n + 1 + (n - 1 - (k + 1))]
            rf.face([p0, p1, q1, q0], nrm)
        rf.face([a[n - 1], a[n], a[n + 1]], nrm)
        rf.face([a[0], a[2 * n + 1], a[2 * n]], nrm)
    def roof_col(p, nn):
        x = p.x - hx; v = clamp((p.y - hy) / DY, -1, 1)
        if nn.z < -0.35:                       # underside: deep shade
            return grey(0.30)
        base = 1.0 - 0.34 * abs(v) ** 1.4          # light near the ridge, darker toward the eaves
        if abs(nn.z) < 0.5 and abs(nn.x) < 0.6: base = 0.46   # eave rims
        if abs(nn.x) > 0.8: base = 0.48                       # gable ends
        base *= 0.66 + 0.34 * roll(x) ** 0.7                   # the rolls: grooves and roll flanks dark
        return grey(clamp(base, 0.25, 1.0))
    A.add(OB, ROOF, rf, roof_col, 'roof')
    # the gable infill: wood under the roof between the lintel and the roof's underside
    gpro = [(-0.245, B0 + 0.47)]
    for k in range(7):
        yy = -0.245 + 0.49 * k / 6
        gpro.append((yy, roof_top(0.0, yy / DY) - TH + 0.012 * abs(yy / DY) - 0.004))
    gpro.append((0.245, B0 + 0.47))
    gpro = [(-w, z) for w, z in gpro]            # (sweep: profile w runs along -y for a path along +x)
    gz = sum(q[1] for q in gpro) / len(gpro)
    A.add(OB, BODY, sweep([Vector((hx - 0.28, hy, 0)), Vector((hx + 0.28, hy, 0))], gpro, inset=0.08, cap_d=0.006),
          lambda p, n: mul(WOOD_DK, 0.92 + 0.12 * smooth(B0 + 0.5, B0 + 0.75, p.z)), 'house')
    # the ridge beam with rounded onigawara ends (tintRoof)
    for sx in (-1, 1):
        A.add(OB, ROOF, ellipsoid(Vector((hx + sx * (LX - 0.02), hy, RZ1 + 0.03)), (0.045, 0.085, 0.085), K=7, J=3),
              lambda p, n: grey(0.62 + 0.36 * clamp(n.z)), 'roof')

    # ---------------- the ridge icing (tintCap): a thick round roll along the ridge, rounded drips down both slopes,
    # and dollops on the two front eave tips
    def cap_col(p, n):
        g = 0.80 + 0.20 * clamp(n.z)
        if n.z < 0.15: g = 0.62 + 0.16 * clamp(n.z + 0.6)
        g *= 0.95 + 0.1 * vnoise(p, 9, 2)
        return grey(clamp(g, 0.3, 1.0))
    RW, RT = 0.095, 0.075                         # the roll's half-width and crown thickness
    cx0, cx1 = -LX + 0.03, LX - 0.03
    cxs = [cx0 + (cx1 - cx0) * i / 6 for i in range(7)]
    ssr = [-1, -0.8, -0.45, 0, 0.45, 0.8, 1]
    def roll_prof(x):
        wob = 1 + 0.06 * math.sin(x * 13 + 1.0)
        top = [(sv * RW * wob, roof_top(x, sv * RW * wob / DY) + RT * wob * (1 - abs(sv) ** 2.4) ** 0.55 + 0.012) for sv in ssr]
        lp = [(RW * wob + 0.014, roof_top(x, (RW * wob + 0.014) / DY) + 0.006)]
        lm = [(-RW * wob - 0.014, roof_top(x, -(RW * wob + 0.014) / DY) + 0.006)]
        bot = [(sv * RW * 0.9, roof_top(x, sv * RW * 0.9 / DY) - 0.02) for sv in (0.8, 0.0, -0.8)]   # (hidden in the roof)
        return top + lp + bot + lm
    ct = Tmp(); rings = []; cs = []
    for x in cxs:
        rings.append([Vector((hx + x, hy + w, z)) for w, z in roll_prof(x)]); cs.append(Vector((hx + x, hy, RZ1 - 0.03)))
    def shrink(ring, c, k, dx):
        return [Vector((p.x + dx, c.y + (p.y - c.y) * k, RZ1 + (p.z - RZ1) * k)) for p in ring]
    r0, r1 = rings[0], rings[-1]
    rings = [shrink(r0, cs[0], 0.4, -0.035), shrink(r0, cs[0], 0.8, -0.02)] + rings + [shrink(r1, cs[-1], 0.8, 0.02), shrink(r1, cs[-1], 0.4, 0.035)]
    cs = [cs[0] - X * 0.035, cs[0] - X * 0.02] + cs + [cs[-1] + X * 0.02, cs[-1] + X * 0.035]
    ring_surface(ct, rings, cs, pole0=cs[0] - X * 0.006 + Z * 0.05, pole1=cs[-1] + X * 0.006 + Z * 0.05)
    A.add(OB, CAP, ct, cap_col, 'roofcap')
    def slope_ang(x, y):
        """the angle about X of the roof's down-slope tangent at (x, y) (local)"""
        e = 0.01; sg = 1 if y > 0 else -1
        dz = roof_top(x, (y + sg * e) / DY) - roof_top(x, y / DY)
        return math.atan2(dz, e)
    for i, (dx, side, L, wd) in enumerate([(-0.26, -1, 0.12, 0.052), (0.02, -1, 0.17, 0.058), (0.27, -1, 0.08, 0.046),
                                          (-0.15, 1, 0.15, 0.054), (0.13, 1, 0.09, 0.048), (0.31, 1, 0.07, 0.044)]):
        yc = side * (RW - 0.005)
        ang = slope_ang(dx, yc + side * L * 0.5)  # (negative: the roof falls away from the ridge)
        zc = roof_top(dx, yc / DY) + 0.02
        dr = ellipsoid(Vector((0, 0, 0)), (wd, L + 0.005, 0.036), K=7, J=4)
        dr.xform(M_at((hx + dx, hy + yc, zc), rx=ang * side))
        A.add(OB, CAP, dr, cap_col, 'roofcap')
    for sx in (-1, 1):
        ex, ey = sx * (LX - 0.045), -(DY - 0.02)
        A.add(OB, CAP, blob(Vector((hx + ex, hy + ey, roof_top(ex, ey / DY) - 0.012)), 0.052, 0.05, lobes=3, K=9, seed=sx + 3),
              cap_col, 'roofcap')

    # ---------------- the shimenawa across the house front under the eave, with three shide
    sy_ = fy - 0.07; sz = B0 + 0.40
    spts = [Vector((hx - 0.33 + 0.66 * k / 10, sy_ - 0.01 * math.sin(math.pi * k / 10), sz - 0.075 * math.sin(math.pi * k / 10))) for k in range(11)]
    def rope_col(p, n):
        # twisted straw: diagonal bands
        a = math.atan2(n.z, -n.y) * 2 + p.x * 70
        return mix(STRAW, STRAW_DK, 0.5 + 0.5 * math.sin(a)) if True else STRAW
    A.add(OB, BODY, tube(spts, lambda s: 0.026 + 0.016 * math.sin(math.pi * s), K=5), rope_col, 'shimenawa')
    for k, xx in enumerate((-0.17, 0.0, 0.17)):
        t_ = 0.5 + xx / 0.66
        top = Vector((hx + xx, sy_ - 0.01 * math.sin(math.pi * t_) - 0.01, sz - 0.075 * math.sin(math.pi * t_) - 0.035))
        # a zigzag paper streamer: three offset tabs
        for j in range(3):
            off = 0.012 if j % 2 else -0.012
            A.add(OB, BODY, rbox((0.05, 0.014, 0.075), r=0.0, M=M_at(top + Vector((off, -0.003 * j, -0.035 - j * 0.058)), rz=0.05 * (k - 1))),
                  paint(PAPER, top=0.05, bot=0.12), 'shide')
    # the offering box in front of the pedestal (kit local z 0.52 -> Blender y 0.45 - 0.52)
    A.add(OB, BODY, rbox((0.40, 0.20, 0.19), r=0.025, M=M_at((hx, hy - 0.52, PT + 0.095))), paint('#86603e', top=0.12, ao_z=PT, ao_k=0.25, ao_h=0.06), 'offering')
    for i in range(2):
        A.add(OB, BODY, rbox((0.36, 0.04, 0.03), r=0.0, M=M_at((hx, hy - 0.52 - 0.04 + i * 0.08, PT + 0.19 + 0.012))), paint('#5a3c28', top=0.3), 'offering')

    # ---------------- the guardian standing stone (kit B.at([0.55, 0.14, -0.35]) -> Blender (0.55, 0.35, 0.14)):
    # a chunky sacred pebble, widest (0.72 x 0.5 m) at 40 % of its height, a soft rounded crown, a gentle lean
    gx, gy = 0.55, 0.36
    Z0, ZT = PT - 0.04, 1.70
    ZM, GR = Z0 + 0.4 * (ZT - Z0), 0.36
    def g_r(z):
        if z < ZM:
            u = (ZM - z) / (ZM - Z0 + 0.32)
            return GR * max(0.0, 1 - u * u) ** 0.5
        u = clamp((z - ZM) / (ZT - ZM))
        return GR * max(0.0, 1 - u ** 2.3) ** (1 / 2.3)
    def g_off(z):
        k = clamp((z - Z0) / (ZT - Z0)) ** 2
        return (gx + 0.03 * k, gy + 0.045 * k)       # leans back (+y) and a touch to +x
    GSY, GE = 0.69, 2.2
    def g_wob(r, z, th):
        return r * (1 + 0.03 * math.sin(2 * th + 0.8) * smooth(0.0, 0.6, z - Z0) + 0.018 * math.sin(3 * th + z * 3))
    zs = [Z0, 0.17, 0.28, 0.42, 0.57, 0.74, 0.90, 1.04, 1.16, 1.27, 1.37, 1.46, 1.53, 1.59, 1.64, 1.675]
    prof = [(0.0, Z0)] + [(g_r(z), z) for z in zs] + [(0.0, ZT)]
    def S(th, z):
        """the stone surface (for the drape and the plaque)"""
        o = g_off(z); r = g_wob(g_r(z), z, th); c, s = se_dir(th, GE)
        return Vector((o[0] + c * r, o[1] + s * r * GSY, z))
    def stone_col(p, n):
        c = mix(STONE, STONE_HI, clamp(n.z) * 0.45 + smooth(0.6, 1.6, p.z) * 0.15)
        if n.z < 0: c = mix(c, STONE_LO, -n.z * 0.6)
        c = mul(c, 1 - 0.22 * (1 - smooth(0.0, 0.22, p.z - PT)))          # contact AO on the plinth
        c = mul(c, 0.94 + 0.12 * vnoise(p, 3.5, 11))                      # soft mottling
        return c
    A.add(OB, BODY, lathe(prof, 14, sx=1.0, sy=GSY, e=GE, th0=math.pi / 14, off=g_off,
                          rfn=g_wob), stone_col, 'stone')
    # the crown icing (tintCap): the top ~22 % of the stone, a wavy edge with six rounded drips (5-14 cm), a rolled lip
    # bulging proud, softly domed
    FR = -math.pi / 2
    sdrips = [(FR - 0.38, 0.12, 0.22), (FR + 0.55, 0.07, 0.19), (FR + 1.55, 0.10, 0.22), (math.pi / 2 - 0.25, 0.14, 0.24),
              (math.pi / 2 + 1.1, 0.06, 0.19), (FR - 1.45, 0.09, 0.21)]
    cap_he = drip_he(lambda th: 0.33 + 0.025 * math.sin(3 * th + 1.0) + 0.015 * math.sin(5 * th + 0.3), sdrips)
    def F(th, h): return S(th, ZT - h)
    A.add(OB, CAP, drape(F, cap_he, lambda th, s: 0.03 + 0.016 * smooth(0.55, 1.0, s), drip_angles(10, sdrips), J=3,
                         inner=Vector((gx + 0.03, gy + 0.05, ZT - 0.32))), cap_col, 'stonecap')

    # ---------------- the paw plaque: a frame and a raised tablet with the paw carved into it
    PZ = 0.83                                     # the plaque's centre height (below the kit's 0.92: the rope runs above it)
    th_f = -math.pi / 2
    sp = S(th_f, PZ); e = 1e-3
    tz = (S(th_f, PZ + e) - S(th_f, PZ - e)).normalized()          # up along the stone's front
    tilt = math.atan2(-tz.y, tz.z) * -1                            # rotation about x (leaning back)
    MP = M_at(Vector((g_off(PZ)[0], sp.y, PZ)), rx=-math.atan2(tz.y, tz.z))
    A.add(OB, BODY, rbox((0.37, 0.09, 0.45), r=0.035, seg=1, M=MP @ Matrix.Translation((0, 0.02, 0))),
          paint(mix(STONE, STONE_LO, 0.35), top=0.12, bot=0.25, nz_amp=0.03, seed=8), 'plaque')
    FW, FH, FD = 0.27, 0.34, 0.025                # the tablet: 2.5 cm proud of the frame's face (frame front y = -0.025)
    TF = -0.05                                    # the tablet's front plane (plaque-local y)
    pads = [((0.0, -0.068), (0.064, 0.052))]
    for i in range(4):
        a = math.pi / 2 + (i - 1.5) * 0.62
        pads.append(((math.cos(a) * 0.118, 0.0 + math.sin(a) * 0.118), (0.027, 0.031)))
    CD = 0.021
    def pocket(u, v):
        d = 0.0
        for (cu, cv), (ru, rv) in pads:
            q = ((u - cu) / ru) ** 2 + ((v - cv) / rv) ** 2
            d = max(d, CD * (1 - smooth(0.3, 1.0, q)))
        return d
    def carve(u, v):
        edge = min(FW / 2 - abs(u), FH / 2 - abs(v))     # + a soft bevel round the tablet's rim
        return pocket(u, v) + 0.012 * (1 - smooth(0.0, 0.03, edge))
    tab = grid_slab(FW, FH, 12, 14, FD, FD + 0.035, carve)
    MPi = MP.inverted()
    def tab_col(p, n):
        lp = MPi @ p
        c = mix('#cdc2ce', '#e6dce4', clamp(n.z + 0.3) * 0.6)
        if lp.y < TF + CD + 0.004:
            d = pocket(lp.x, lp.z)
            c = mix(c, '#8a7e90', smooth(0.002, CD * 0.9, d))          # the carved pockets' walls: shaded
        return c
    A.add(OB, BODY, tab.xform(MP @ Matrix.Translation((0, TF, 0))), tab_col, 'plaque')

    # ---------------- the rune (separate object, rune_glow): pads filling the carved pockets, a touch recessed
    MR = MP.to_3x3().to_4x4()
    for (cu, cv), (ru, rv) in pads:              # the pockets' floors: clean dark ovals (the rune covers them when lit)
        t_ = ellipsoid(Vector((0, 0, 0)), (ru * 0.74, 0.006, rv * 0.74), K=12 if ru > 0.05 else 9, J=2)
        t_.xform(Matrix.Translation(MP @ Vector((cu, TF + CD - 0.004, cv))) @ MR)
        A.add(OB, BODY, t_, lambda p, n: '#5a4c66', 'plaque')
    for (cu, cv), (ru, rv) in pads:
        rr = (ru * 0.78, 0.0085, rv * 0.78)
        c = MP @ Vector((cu, TF + CD - 0.0095, cv))
        t_ = ellipsoid(Vector((0, 0, 0)), rr, K=14 if ru > 0.05 else 10, J=3 if ru > 0.05 else 2)
        t_.xform(Matrix.Translation(c) @ MR)
        A.add('rune', 'rune_glow', t_, '#8fd0ff', 'rune')
    print('VP waystone rune centre (blender) %s  game %s' % (tuple(round(q, 3) for q in MP @ Vector((0, TF, 0.0))),
          tuple(round(q, 3) for q in (MP @ Vector((0, TF, 0)))[0:1]) + (round((MP @ Vector((0, TF, 0))).z, 3), round(-(MP @ Vector((0, TF, 0))).y, 3))))

    # ---------------- the stone's shimenawa: a thick twisted straw rope round it above the plaque, three shide in front
    def SN(th, z):
        """the stone's outward normal at (th, z)"""
        e = 1e-3
        a = S(th + e, z) - S(th - e, z); b = S(th, z + e) - S(th, z - e)
        n = a.cross(b).normalized()
        o = S(th, z) - Vector((g_off(z)[0], g_off(z)[1], z))
        return n if n.dot(o) > 0 else -n
    zr = lambda th: 1.125 + 0.03 * (1 + math.sin(th)) / 2          # a touch higher at the back
    RR = 0.032
    rpts = [S(th, zr(th)) + SN(th, zr(th)) * (RR * 0.7) for th in (TAU * k / 20 for k in range(20))]
    def srope_col(p, n):
        ang = math.atan2(p.y - gy, p.x - gx)
        rad = Vector((p.x - gx, p.y - gy, 0)).normalized()
        a = math.atan2(n.z, n.dot(rad))
        return mix(STRAW, STRAW_DK, 0.5 + 0.5 * math.sin(2 * a + ang * 11))
    A.add(OB, BODY, tube_loop(rpts, lambda s: RR, K=6), srope_col, 'stonerope')
    for k, ths in enumerate((FR - 0.62, FR + 0.62, FR - 1.3)):
        for j in range(3):
            zj = zr(ths) - RR - 0.035 - j * 0.058
            nn = SN(ths, zj); tang = Vector((-nn.y, nn.x, 0)).normalized()
            off = (0.012 if j % 2 else -0.012)
            loc = S(ths, zj) + nn * 0.03 + tang * off
            A.add(OB, BODY, rbox((0.05, 0.014, 0.075), r=0.0, M=M_at(loc, rz=math.atan2(-nn.x, nn.y))), paint(PAPER, top=0.05, bot=0.12), 'stoneshide')

    # ---------------- the torii (kit B.at([0, 0, 0.95]) -> Blender (0, -0.95, 0)), w 1.15, ~1.75 m
    TY = -0.95; TW = 0.575; PH = 1.40
    for sx in (-1, 1):
        post = lathe([(0.0, 0.0), (0.088, 0.0), (0.086, 0.6), (0.080, PH + 0.05), (0.0, PH + 0.05)], 9, th0=math.pi / 9)
        post.xform(M_at((sx * TW, TY, 0), ry=-sx * 0.025))
        A.add(OB, BODY, post, lambda p, n: mul(mix(VERM, VERM_HI, smooth(0.3, 1.5, p.z) * 0.35), 1 + 0.12 * clamp(n.x * 0.5 - n.y * 0.5)), 'torii')
        base = lathe([(0.0, 0.0), (0.125, 0.0), (0.135, 0.03), (0.13, 0.165), (0.105, 0.2), (0.0, 0.2)], 9, th0=math.pi / 9)
        base.xform(M_at((sx * TW, TY, 0)))
        A.add(OB, BODY, base, paint(INK, hi=INK_HI, top=0.25, ao_z=0.0, ao_k=0.25, ao_h=0.05), 'torii')
    # nuki (tie beam), a little through the posts
    A.add(OB, BODY, rbox((1.42, 0.085, 0.10), r=0.035, M=M_at((0, TY, 1.16))), paint(VERM, hi=VERM_HI, top=0.25, bot=0.3), 'torii')
    # kasagi (black) over shimaki (vermilion): swept, the ends turned up
    def lintel_path(L, z0, up, n=7):
        return [Vector((-L + 2 * L * i / (n - 1), TY, z0 + up * abs(-1 + 2 * i / (n - 1)) ** 2.4)) for i in range(n)]
    def rrect(hw, hh, r=0.03, k=3):
        pts = []
        for cx, cz, a0 in ((hw - r, hh - r, 0), (-hw + r, hh - r, 90), (-hw + r, -hh + r, 180), (hw - r, -hh + r, 270)):
            for j in range(k):
                a = math.radians(a0 + 90 * j / (k - 1))
                pts.append((cx + r * math.cos(a), cz + r * math.sin(a)))
        return pts
    # (the kit reads as a vermilion top beam over a dark band, as players see it: kept)
    shim = sweep(lintel_path(0.88, PH + 0.065, 0.11), rrect(0.07, 0.045, 0.025, 2))
    A.add(OB, BODY, shim, lambda p, n: mix(INK, INK_HI, clamp(n.z) * 0.8) if n.z > -0.3 else mul(INK, 0.85), 'torii')
    kas = sweep(lintel_path(0.98, PH + 0.16, 0.14), rrect(0.095, 0.05, 0.035, 2))
    A.add(OB, BODY, kas, lambda p, n: mul(mix(VERM, VERM_HI, clamp(n.z) * 0.5), 1 - 0.25 * clamp(-n.z)), 'torii')
    # gakuzuka strut and the gaku plaque (dark, a gold face)
    A.add(OB, BODY, rbox((0.08, 0.07, 0.14), r=0.0, M=M_at((0, TY, PH - 0.04))), paint(VERM, top=0.2), 'torii')
    A.add(OB, BODY, rbox((0.24, 0.06, 0.26), r=0.03, M=M_at((0, TY - 0.045, PH - 0.10))), paint(INK, hi=INK_HI, top=0.3), 'torii')
    A.add(OB, BODY, rbox((0.17, 0.03, 0.19), r=0.012, seg=1, M=M_at((0, TY - 0.08, PH - 0.10))), paint(GOLD, hi='#ffe08a', top=0.4, bot=0.2), 'torii')

    # ---------------- two small stone lanterns on the plinth (kit (+-0.85, 0.14, 0.45), s 0.55)
    LST = '#aaa3a4'
    for sx in (-1, 1):
        lx, ly = sx * 0.76, -0.47
        yaw = sx * 0.06 + rng.uniform(-0.03, 0.03)
        M = M_at((lx, ly, PT), rz=yaw)
        lc = lambda base, top=0.15: paint(base, hi=mix(base, '#e4dcd8', 0.5), top=top, bot=0.25, ao_z=PT, ao_k=0.2, ao_h=0.08, nz_amp=0.05, nz_f=6, seed=21)
        A.add(OB, BODY, lathe([(0.0, 0.0), (0.15, 0.0), (0.16, 0.03), (0.13, 0.07), (0.0, 0.075)], 8, th0=math.pi / 8).xform(M), lc(LST), 'lanterns')
        A.add(OB, BODY, lathe([(0.0, 0.07), (0.066, 0.07), (0.072, 0.16), (0.058, 0.30), (0.0, 0.30)], 8, th0=math.pi / 8).xform(M), lc(LST), 'lanterns')
        A.add(OB, BODY, lathe([(0.0, 0.29), (0.08, 0.29), (0.14, 0.33), (0.115, 0.36), (0.0, 0.36)], 8, th0=math.pi / 8).xform(M), lc(LST), 'lanterns')
        A.add(OB, BODY, rbox((0.19, 0.19, 0.15), r=0.03, M=M @ Matrix.Translation((0, 0, 0.435))), lc(mul(LST, 0.96)), 'lanterns')
        for fyy in (-1,):     # the paper window at the front, with a dark cross lattice
            A.add(OB, BODY, rbox((0.115, 0.02, 0.10), r=0.0, M=M @ Matrix.Translation((0, fyy * 0.091, 0.435))), lambda p, n: LAMP, 'lanterns')
            A.add(OB, BODY, rbox((0.115, 0.012, 0.022), r=0.0, M=M @ Matrix.Translation((0, fyy * 0.1, 0.44))), lambda p, n: '#5a4636', 'lanterns')
            A.add(OB, BODY, rbox((0.022, 0.012, 0.10), r=0.0, M=M @ Matrix.Translation((0, fyy * 0.1, 0.435))), lambda p, n: '#5a4636', 'lanterns')
        # the kasa: a round hat with an upturned rim, and the hoju jewel
        kz = 0.51
        kasa = [(0.0, kz), (0.20, kz - 0.005), (0.235, kz + 0.025), (0.22, kz + 0.05), (0.16, kz + 0.075),
                (0.09, kz + 0.115), (0.0, kz + 0.145)]
        A.add(OB, BODY, lathe(kasa, 9, th0=math.pi / 9).xform(M), lambda p, n: mul(mix(LST, '#ddd4d0', clamp(n.z) * 0.5), 1 - 0.3 * clamp(-n.z)), 'lanterns')
        A.add(OB, BODY, lathe([(0.0, kz + 0.13), (0.045, kz + 0.14), (0.055, kz + 0.18), (0.035, kz + 0.22), (0.0, kz + 0.25)], 6, th0=math.pi / 6).xform(M),
              paint(LST, hi='#e8e0dc', top=0.3), 'lanterns')
        # a little icing cap on the hat (tintCap)
        KT = [(0.0, kz + 0.145), (0.05, kz + 0.14), (0.09, kz + 0.115), (0.16, kz + 0.075), (0.22, kz + 0.05), (0.30, kz + 0.02)]
        def kF(th, h, M=M, KT=KT):
            # the hat's top surface (the kasa profile's upper edge), h = the radius from the axis
            for (r0, z0), (r1, z1) in zip(KT, KT[1:]):
                if h <= r1: zz = z0 + (z1 - z0) * (h - r0) / (r1 - r0); break
            return M @ Vector((math.cos(th) * h, math.sin(th) * h, zz))
        ldrips = [(sx * 0.4 + k * TAU / 5, 0.03 + 0.012 * ((k * 3) % 4), 0.42) for k in range(5)]
        A.add(OB, CAP, drape(kF, drip_he(lambda th: 0.085, ldrips), lambda th, s: 0.03 + 0.008 * s, 13, J=2,
                             inner=M @ Vector((0, 0, kz + 0.06)), bead=False), cap_col, 'lanterncap')

    export(A, 'waystone', {
        'body': {},
        'tintRoof': dict(factor='#5a9a88'),     # Takemori's tint in the preview; the game sets each zone's colour
        'tintCap': dict(factor='#86a856'),      # moss in the preview
        'rune_glow': dict(emission='#8fd0ff'),
    })

# ================================================================== shared: bamboo, persimmons
BAMBOO = '#92c25c'; BAMBOO_HI = '#bcdc80'; BAMBOO_NODE = '#5e8c40'; BAMBOO_CUT = '#d8dca0'
def bamboo_col(nodes_fn, base=BAMBOO, hi=BAMBOO_HI, node=BAMBOO_NODE):
    """bamboo: a soft top-light gradient, darker node bands where nodes_fn(p) -> 0..1"""
    def f(p, n):
        c = mix(base, hi, clamp(n.z * 0.6 + 0.2) * 0.6)
        c = mul(c, 1 - 0.18 * clamp(-n.z))
        k = nodes_fn(p)
        if k > 0: c = mix(c, node, k)
        return c
    return f

def bamboo_pole(a, b, r, nodes=(), K=8):
    """a bamboo pole from a to b with swollen node rings at the fractions in nodes; returns (tmp, node test)"""
    a, b = Vector(a), Vector(b); L = (b - a).length; d = (b - a).normalized()
    ts = sorted(set([0.0, 1.0] + [t + o for t in nodes for o in (-0.025 / L, 0.0, 0.025 / L)]))
    path = [a + d * (L * t) for t in ts]
    def rad(s):
        t = ts[min(len(ts) - 1, round(s * (len(ts) - 1)))]
        return r * (1.14 if any(abs(t - q) < 1e-6 for q in nodes) else 1.0)
    tt = tube(path, rad, K=K)
    def node_k(p):
        t = (p - a).dot(d) / L
        return max([0.0] + [clamp(1 - abs(t - q) * L / 0.02) * 0.85 for q in nodes])
    return tt, node_k

FRESH = ['#ec7a2c', '#f48c38', '#e2702a', '#f69c46']
DRIED = ['#c8641e', '#b8561a', '#d0702a', '#ac4e1a']
LIGHT = Vector((-0.35, -0.55, 0.76)).normalized()      # the painted highlight's direction (toward the game camera)

def persimmon(c, r, color, rng, dried=False, K=8):
    """a plump persimmon (fresh: squat, a dimpled top under its calyx; dried: flatter, deeper amber, wrinkled), its
    four soft lobes giving the squarish kaki section; painted glossy highlight"""
    h = r * (0.78 if dried else 0.86)
    if dried:
        prof = [(0.0, -h), (r * 0.86, -h * 0.5), (r * 0.94, h * 0.4), (0.0, h)]
    else:
        prof = [(0.0, -h), (r * 0.74, -h * 0.84), (r, -h * 0.12), (r * 0.9, h * 0.52), (0.0, h * 0.86)]
    ph = rng.uniform(0, 1)
    t = lathe(prof, K, sy=0.8 if dried else 1.0, th0=ph,
              rfn=lambda rr, z, th: rr * (1 + 0.07 * math.cos(4 * (th - ph)) + (0.04 * math.sin(7 * th + z * 40) if dried else 0)))
    t.xform(M_at(c, rz=rng.uniform(0, TAU)))
    base, top = (srgb(color), mix(color, '#ffb860', 0.35))
    def col(p, n, c=c):
        k = clamp((p.z - c.z) / (2 * h) + 0.5)
        cc = mix(mul(base, 0.8), top, k)
        cc = mul(cc, 1 - 0.18 * clamp(-n.z))
        gl = smooth(0.80, 0.97, n.dot(LIGHT))
        cc = mix(cc, '#ffe4b8' if not dried else '#f0b070', gl * (0.85 if not dried else 0.5))
        if dried:
            cc = mul(cc, 0.92 + 0.12 * vnoise(p, 60, 3))
            if p.z - c.z > h * 0.75: cc = mix(cc, '#5a4026', 0.7)          # the dark calyx stub at the top
        return cc
    return t, col, h

def calyx(c, r, rng, M=None):
    """a four-sepal calyx: a thin closed star (top and bottom fans), green-brown"""
    t = Tmp(); ph = rng.uniform(0, TAU); pts = []
    for k in range(8):
        a = ph + TAU * k / 8; rr = r if k % 2 == 0 else r * 0.42
        pts.append(Vector((math.cos(a) * rr, math.sin(a) * rr, -0.004 if k % 2 == 0 else 0.002)))
    top = t.vert((0, 0, 0.012)); bot = t.vert((0, 0, -0.006)); ids = [t.vert(p) for p in pts]
    for k in range(8):
        t.face([top, ids[k], ids[(k + 1) % 8]], Z); t.face([bot, ids[(k + 1) % 8], ids[k]], -Z)
    t.xform(Matrix.Translation(c) if M is None else M)
    return t

def calyx_col(p, n):
    return mix('#6e7a36', '#a0a050', clamp(n.z) * 0.5) if n.z > 0 else srgb('#4a4a24')

# ================================================================== 2. the shishi-odoshi (round 3 rework: a chunky bowl, bold bamboo)
BAMBOO = '#7fa83e'; BAMBOO_HI = '#a4c45c'; BAMBOO_NODE = '#a8b850'; BAMBOO_CUT = '#f0e6c0'

def ear_clip(pts2):
    """triangulate a simple 2-D polygon (list of (a, b)) by ear clipping -> index triples"""
    n = len(pts2); idx = list(range(n))
    area = sum(pts2[i][0] * pts2[(i + 1) % n][1] - pts2[(i + 1) % n][0] * pts2[i][1] for i in range(n))
    sgn = 1 if area > 0 else -1
    def cross(o, a, b): return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    def inside(p, a, b, c):
        d1, d2, d3 = cross(a, b, p) * sgn, cross(b, c, p) * sgn, cross(c, a, p) * sgn
        return d1 >= -1e-12 and d2 >= -1e-12 and d3 >= -1e-12
    tris = []; guard = 0
    while len(idx) > 3 and guard < 10000:
        guard += 1; m = len(idx); found = False
        for k in range(m):
            i0, i1, i2 = idx[k - 1], idx[k], idx[(k + 1) % m]
            a, b, c = pts2[i0], pts2[i1], pts2[i2]
            if cross(a, b, c) * sgn <= 1e-12: continue
            if any(inside(pts2[j], a, b, c) for j in idx if j not in (i0, i1, i2)): continue
            tris.append((i0, i1, i2)); idx.pop(k); found = True; break
        if not found:   # degenerate leftovers: fan them
            for k in range(1, len(idx) - 1): tris.append((idx[0], idx[k], idx[k + 1]))
            return tris
    tris.append(tuple(idx))
    return tris

def build_shishi():
    A = Asset(); rng = random.Random(3)
    BODY = 'body'
    PIV = Vector((-0.47, 0.0, 0.62))      # the rocker's pivot (moved, round 3): game (-0.47, 0.62, 0.0)
    RL0, RL1, RR = 0.27, 0.33, 0.045      # the rocker: closed end at -0.27, mouth at +0.33, 9 cm across
    STN = '#a49ca8'; STN_HI = '#cfc6cc'; STN_LO = '#746c7c'; MOSS = '#5e8a3e'; MOSS_HI = '#92b452'
    def stone_paint(base=STN, seed=0, inner_dark=False):
        def f(p, n):
            c = mix(base, STN_HI, clamp(n.z) * 0.45)
            c = mix(c, STN_LO, clamp(-n.z) * 0.5)
            c = mul(c, (0.93 + 0.12 * vnoise(p, 5, seed)) * (1 - 0.22 * (1 - smooth(0.0, 0.1, p.z))))
            if inner_dark and math.hypot(p.x, p.y) < 0.262 and p.z < 0.385: c = mul(c, 0.78)
            return c
        return f
    moss_col = lambda p, n: mul(mix(MOSS, MOSS_HI, clamp(n.z) ** 1.5 * 0.85 + (vnoise(p, 22, 4) - 0.5) * 0.4), 0.9 + 0.14 * vnoise(p, 9, 7))

    # ---- the tsukubai: a chunky hand-hewn bowl, 0.80 m across, rim 0.40 m, thick rounded walls
    RIMZ, WZ = 0.40, 0.345
    bowl = [(0.0, 0.0), (0.30, 0.0), (0.365, 0.035), (0.395, 0.13), (0.402, 0.25), (0.39, 0.33), (0.36, 0.38), (0.32, RIMZ),
            (0.285, 0.397), (0.258, 0.378), (0.246, WZ - 0.01), (0.2, 0.31), (0.0, 0.30)]
    def bwob(r, z, th): return r * (1 + 0.03 * math.sin(3 * th + 0.5) * smooth(0.0, 0.2, z) + 0.015 * math.sin(5 * th + 1.3))
    A.add('base', BODY, lathe(bowl, 20, th0=0.1, rfn=bwob), stone_paint(seed=5, inner_dark=True), 'basin')
    # the water: a deeper teal disc with a lighter streak
    wat = [(0.0, WZ - 0.03), (0.255, WZ - 0.03), (0.255, WZ), (0.17, WZ + 0.001), (0.0, WZ + 0.001)]
    def water_col(p, n):
        c = mix('#3a9aa8', '#4aaab4', 1 - math.hypot(p.x, p.y) / 0.25)
        hl = math.exp(-(((p.x + 0.05) / 0.08) ** 2 + ((p.y + 0.07) / 0.035) ** 2))
        return mix(c, '#a4dcdc', clamp(hl * 1.3) * 0.8)
    A.add('base', BODY, lathe(wat, 20, th0=0.1), water_col, 'water')
    # moss icing over part of the rim (the back left), two drips down the outer wall
    def rim_z(r):
        for (r0, z0), (r1, z1) in zip(bowl[::-1][:-1], bowl[::-1][1:]):
            pass
        pts = [(0.246, WZ - 0.01), (0.258, 0.378), (0.285, 0.397), (0.32, RIMZ), (0.36, 0.38), (0.39, 0.33)]
        for (r0, z0), (r1, z1) in zip(pts, pts[1:]):
            if r <= r1: return z0 + (z1 - z0) * (r - r0) / (r1 - r0)
        return pts[-1][1]
    a0, a1, NA = math.radians(-10), math.radians(125), 16
    mpath = [Vector((math.cos(a0 + (a1 - a0) * i / NA) * 0.318, math.sin(a0 + (a1 - a0) * i / NA) * 0.318, 0.0)) for i in range(NA + 1)]
    ws = [-0.088, -0.07, -0.04, 0.0, 0.04, 0.07, 0.088]
    def mprof(i):
        k = math.sin(math.pi * (0.08 + 0.84 * i / NA)) ** 0.6           # tapers at both ends
        lump = 0.65 + 0.35 * abs(math.sin(i * 1.15 + 0.4))              # lumpy cushions along the arc
        wob = (0.8 + 0.3 * lump) * (0.7 + 0.3 * k)
        top = [(w * wob, rim_z(0.318 + w * wob) + 0.006 + 0.042 * k * lump * (1 - (abs(w) / 0.09) ** 2.2) ** 0.7) for w in ws]
        bot = [(0.06 * wob, rim_z(0.318 + 0.06 * wob) - 0.012), (-0.06 * wob, rim_z(0.318 - 0.06 * wob) - 0.012)]
        return top + bot
    # the moss blanket: it follows the bowl's section from the inner lip over the rim and spills down the outer wall in
    # irregular lobes; thickest on the rim, tapering out at both ends of its arc
    sec = [(0.262, 0.374), (0.285, 0.397), (0.32, RIMZ), (0.36, 0.38), (0.388, 0.335), (0.399, 0.29), (0.402, 0.24)]
    def sec_n(k):
        a_, b_ = sec[max(0, k - 1)], sec[min(len(sec) - 1, k + 1)]
        tr, tz = b_[0] - a_[0], b_[1] - a_[1]; ln = math.hypot(tr, tz)
        return (tz / ln, -tr / ln)                               # outward normal in (r, z)
    mrings, mcs = [], []
    for i_ in range(NA + 1):
        f = i_ / NA; a = a0 + (a1 - a0) * f
        k_ = math.sin(math.pi * f) ** 0.5
        lobe = 0.5 + 0.5 * math.sin(i_ * 0.85 + 0.6) * (0.75 + 0.25 * math.cos(i_ * 0.5))
        reach = 2 + (len(sec) - 3) * clamp(k_ * (0.35 + 0.75 * lobe))      # how far down the outer wall it spills
        full = []
        for kk in range(len(sec)):
            nr, nz = sec_n(kk); tk = (0.006 + 0.03 * k_ * (1.0 if kk in (1, 2, 3) else 0.7)) * (0.85 + 0.3 * lobe)
            full.append(Vector((sec[kk][0] + nr * tk, sec[kk][1] + nz * tk, 0)))
        # the polyline down to `reach` (fractional), resampled to a fixed count so every ring matches
        kr = int(reach); fr = reach - kr
        poly = full[:kr + 1] + ([full[kr].lerp(full[kr + 1], fr)] if kr + 1 < len(full) and fr > 1e-3 else [])
        pts = [(q.x, q.y) for q in resample(poly, len(sec))]
        # the rolled lower edge, then back under the surface (inside the stone)
        lr, lz = pts[-1]; pts.append((lr - 0.004, lz - 0.012))
        back = [(sec[kk][0] - 0.012 * sec_n(kk)[0], sec[kk][1] - 0.012 * sec_n(kk)[1]) for kk in (5, 3, 1)]
        loop = pts + back
        mrings.append([Vector((math.cos(a) * r_, math.sin(a) * r_, z_)) for r_, z_ in loop])
        mcs.append(Vector((math.cos(a) * 0.33, math.sin(a) * 0.33, 0.36)))
    mt = Tmp(); ring_surface(mt, mrings, mcs, pole0=mcs[0] + Vector((0, 0, 0.02)), pole1=mcs[-1] + Vector((0, 0, 0.02)))
    A.add('base', BODY, mt, moss_col, 'moss')

    # ---- a clustered bed of river stones tight round the bowl's foot (clear of the rocker's frame at -x)
    beds = [(10, 0.47, 0.15, True), (48, 0.49, 0.12, False), (118, 0.48, 0.14, True), (232, 0.47, 0.12, False),
            (266, 0.47, 0.17, False), (302, 0.50, 0.14, True), (336, 0.48, 0.12, False), (76, 0.55, 0.09, False)]
    for k, (ad, d, s, mossy) in enumerate(beds):
        a = math.radians(ad)
        c = Vector((math.cos(a) * d, math.sin(a) * d, s * 0.36))
        st = ellipsoid(Vector((0, 0, 0)), (s * 1.25, s, s * 0.62), K=11, J=5)
        st.xform(M_at(c, rz=a + rng.uniform(-0.4, 0.4)))
        A.add('base', BODY, st, stone_paint(mul(STN, 0.92 + 0.12 * rng.random()), seed=k), 'stones')
        if mossy:
            ex, ey, ez = s * 1.25, s, s * 0.62
            rot = Matrix.Rotation(a, 3, 'Z')
            def F(th, h, c=c, ex=ex, ey=ey, ez=ez, rot=rot):
                return c + rot @ Vector((ex * math.sin(h) * math.cos(th), ey * math.sin(h) * math.sin(th), ez * math.cos(h)))
            mdr = [(rng.uniform(0, TAU), 0.18, 0.5) for _ in range(3)]
            A.add('base', BODY, drape(F, drip_he(lambda th: 0.55 + 0.08 * math.sin(3 * th + k), mdr), lambda th, s_: 0.045 - 0.02 * s_,
                                      13, J=2, inner=c, bead=False), moss_col, 'stonemoss')
    # the striking stone under the closed end: its top meets the closed end at the rest angle (+0.35 rad)
    ss = ellipsoid(Vector((0, 0, 0)), (0.22, 0.19, 0.16), K=12, J=6)          # a little cairn: a wide base stone...
    ss.xform(M_at((-0.725, 0.0, 0.13), rz=0.3))
    A.add('base', BODY, ss, stone_paint(mul(STN, 0.92), seed=21), 'stones')
    ss = ellipsoid(Vector((0, 0, 0)), (0.15, 0.13, 0.115), K=12, J=6)         # ...and the striking stone on it
    ss.xform(M_at((-0.715, 0.0, 0.377), rz=-0.4))
    A.add('base', BODY, ss, stone_paint(mul(STN, 1.0), seed=22), 'stones')

    # ---- the rocker's frame: two bold bamboo stakes either side of it, the axle through it
    def bcol(nk, cut_z=None):
        def f(p, n):
            c = mix(BAMBOO, BAMBOO_HI, clamp(n.z * 0.6 + 0.25) * 0.6)
            c = mul(c, 1 - 0.2 * clamp(-n.z))
            k = nk(p)
            if k > 0: c = mix(c, BAMBOO_NODE, k)
            if cut_z is not None and p.z > cut_z and n.z > 0.5: c = srgb(BAMBOO_CUT)
            return c
        return f
    for sy in (-0.085, 0.085):
        top = PIV.z + 0.07
        tt, nk = bamboo_pole((PIV.x, PIV.y + sy, 0.038), (PIV.x, PIV.y + sy, top), 0.0375, nodes=(0.45,), K=8)
        A.add('base', BODY, tt, bcol(nk, cut_z=top + 0.02), 'frame')
    A.add('base', BODY, tube([PIV + Vector((0, -0.13, 0)), PIV + Vector((0, 0.13, 0))], lambda s: 0.018, K=6), paint('#6b4a3a', top=0.2), 'frame')
    # ---- the kakei: the post behind, the pipe to the spout over the rocker's mouth, the trickle
    post = Vector((0.0, 0.62, 0.0)); PT_ = 1.08
    tt, nk = bamboo_pole((post.x, post.y, 0.04), (post.x, post.y, PT_), 0.04, nodes=(0.35, 0.7), K=10)
    A.add('base', BODY, tt, bcol(nk), 'kakei')
    A.add('base', BODY, lathe([(0.0, PT_ - 0.02), (0.042, PT_ - 0.02), (0.043, PT_ + 0.03), (0.035, PT_ + 0.04), (0.0, PT_ + 0.041)], 10).xform(Matrix.Translation((post.x, post.y, 0))),
          lambda p, n: srgb(BAMBOO_CUT) if n.z > 0.5 else srgb(BAMBOO), 'kakei')
    sp_end = Vector((-0.15, 0.03, 0.93))
    kpath = [Vector((post.x - 0.005, post.y - 0.02, 1.0)), Vector((-0.05, 0.42, 0.985)), Vector((-0.11, 0.2, 0.96)), sp_end]
    def kakei_col(p, n):
        if (p - sp_end).length < 0.035 and (p - sp_end).normalized().dot((sp_end - kpath[-2]).normalized()) > 0.3:
            return srgb('#3a4626')                                       # the open spout
        return bcol(lambda q: 0.0)(p, n)
    A.add('base', BODY, tube(kpath, lambda s: 0.03, K=8), kakei_col, 'kakei')
    trick = [sp_end + Vector((-0.004, -0.012, -0.03)), Vector((-0.158, 0.01, 0.865)), Vector((-0.163, 0.004, 0.80))]
    A.add('base', BODY, tube(trick, lambda s: 0.014 - 0.003 * s, K=6), lambda p, n: srgb('#bfe6ee'), 'water')

    # ---- the rocker (its own object; origin = the pivot): bamboo along x, closed end at -x, the slant-cut mouth at +x
    K = 14
    def ring(x, r, slant=0.0, dx=0.0):
        out = []
        for k in range(K):
            ph = TAU * k / K; cy, cz = math.cos(ph), math.sin(ph)
            out.append(PIV + Vector((x - slant * cz + dx, cy * r, cz * r)))
        return out
    rings = [ring(x, r) for x, r in ((-RL0 - 0.004, RR * 0.62), (-RL0 + 0.006, RR * 0.9), (-RL0 + 0.02, RR), (-0.10, RR), (-0.085, RR * 1.11),
                                     (-0.07, RR), (0.13, RR), (0.145, RR * 1.11), (0.16, RR), (RL1 - 0.06, RR))]
    rings.append(ring(RL1, RR, slant=0.03)); rings.append(ring(RL1, RR * 0.74, slant=0.03, dx=-0.004)); rings.append(ring(RL1 - 0.09, RR * 0.72))
    cs = [PIV + Vector((r_[0].x - PIV.x, 0, 0)) for r_ in rings]
    rk = Tmp(); ring_surface(rk, rings, cs, pole0=PIV + Vector((-RL0 - 0.008, 0, 0)), pole1=PIV + Vector((RL1 - 0.11, 0, 0)))
    def rocker_col(p, n):
        lx = p.x - PIV.x; rr = math.hypot(p.y - PIV.y, p.z - PIV.z)
        if lx > RL1 - 0.12 and rr < RR * 0.84: return srgb('#3a4626')       # the hollow
        if lx > RL1 - 0.035: return srgb(BAMBOO_CUT)                       # the cut rim
        if lx < -RL0 + 0.012: return srgb(BAMBOO_CUT)                      # the closed end's cut face
        node = max(clamp(1 - abs(lx + 0.085) / 0.022), clamp(1 - abs(lx - 0.145) / 0.022)) * 0.9
        return bcol(lambda q: node)(p, n)
    A.add('rocker', BODY, rk, rocker_col, 'rocker')

    # ---- clearance through the game's swing (rotation about game z = Blender -Y)
    rv = A.objs['rocker']['v']
    def basin_top(r):
        prof = [(0.0, WZ), (0.246, WZ), (0.258, 0.378), (0.285, 0.397), (0.32, RIMZ), (0.36, 0.38), (0.39, 0.33), (0.402, 0.25), (0.42, 0.0)]
        for (r0, z0), (r1, z1) in zip(prof, prof[1:]):
            if r <= r1: return z0 + (z1 - z0) * (r - r0) / max(1e-9, r1 - r0)
        return -1.0
    def seg_dist(p, a, b):
        ab = b - a; t = clamp((p - a).dot(ab) / ab.dot(ab)); return (a + ab * t - p).length
    worst = {}
    for i in range(40):
        a = -0.62 + 0.97 * i / 39
        ca, sa = math.cos(a), math.sin(a)
        for v in rv:
            lx, lz = v.x - PIV.x, v.z - PIV.z
            q = Vector((PIV.x + lx * ca - lz * sa, v.y, PIV.z + lx * sa + lz * ca))
            r = math.hypot(q.x, q.y)
            ang = math.atan2(q.y, q.x)
            in_moss = 0.25 < r < 0.4 and (a0 - 0.1) <= ang <= (a1 + 0.1)
            if r < 0.43: worst['basin rim + water (+moss)'] = min(worst.get('basin rim + water (+moss)', 9), q.z - basin_top(r) - (0.04 if in_moss else 0.0))
            e = ((q.x + 0.715) / 0.15) ** 2 + ((q.y) / 0.13) ** 2 + ((q.z - 0.377) / 0.115) ** 2
            worst['striking stone (norm.)'] = min(worst.get('striking stone (norm.)', 9), math.sqrt(e) - 1)
            for sy in (-0.085, 0.085):
                if q.z < PIV.z + 0.09: worst['stakes'] = min(worst.get('stakes', 9), math.hypot(q.x - PIV.x, q.y - (PIV.y + sy)) - 0.0375)
            worst['kakei'] = min(worst.get('kakei', 9), min(seg_dist(q, kpath[j], kpath[j + 1]) for j in range(3)) - 0.03)
            worst['trickle'] = min(worst.get('trickle', 9), min(seg_dist(q, trick[j], trick[j + 1]) for j in range(2)) - 0.014)
    print('VP shishi clearance over -0.62..+0.35 rad (m; stone ~0 = it clacks):', {k: round(v, 3) for k, v in worst.items()})
    print('VP shishi pivot blender %s  game (%.3f, %.3f, %.3f)' % (tuple(PIV), PIV.x, PIV.z, -PIV.y))
    export(A, 'shishi-odoshi', {'body': {}}, origins={'rocker': PIV})

# ================================================================== 4. the ashiyu foot bath
def build_ashiyu():
    """the unroofed foot bath (the game places footbath() without its roof): the bath is the star"""
    A = Asset(); rng = random.Random(61)
    BODY = 'body'; OB = 'ashiyu'
    STN = '#8e94a6'; STN_HI = '#b8becf'; STN_LO = '#666c7e'
    SNOW = '#f6f9ff'; SNOW_SH = '#bccbe8'; TIMBER = '#5a4032'; DECK = '#a8805c'
    L, W = 2.3, 0.7                                          # the water: 2.3 x 0.7 (kit)
    LS = Vector((-0.3, -0.5, 0.8)).normalized()
    def stone(base=STN, seed=0, wet=False):
        def f(p, n):
            c = mix(base, STN_HI, clamp(n.z) * 0.55); c = mix(c, STN_LO, clamp(-n.z) * 0.5)
            c = mul(c, (0.93 + 0.12 * vnoise(p, 4, seed)) * (1 - 0.2 * (1 - smooth(0.0, 0.1, p.z))))
            if wet:
                c = mix(mul(c, 0.86), '#e8f4f8', smooth(0.86, 0.98, n.dot(LS)) * 0.7)   # a wet sheen
            return c
        return f
    def wood(base=DECK, seed=0):
        def f(p, n):
            g = vnoise(Vector((p.x * 0.1, p.y * 2, p.z * 2)), 25, seed)
            c = mix(base, mul(base, 1.25), clamp(n.z * 0.5 + 0.2) * 0.5 + (g - 0.5) * 0.5)
            return mul(c, 1 - 0.22 * clamp(-n.z))
        return f
    def snow(p, n):
        c = mix(SNOW_SH, SNOW, clamp(n.dot(LS) * 1.1 + 0.1))
        return mul(c, 0.96 + 0.06 * vnoise(p, 10, 2))

    # ---- the trough: a hewn base, a chunky kerb of rounded hewn stones round the water
    A.add(OB, BODY, rbox((2.64, 1.04, 0.28), r=0.07, M=M_at((0, 0, 0.14))), stone(mul(STN, 0.9), seed=1), 'trough')
    KZ0, KZH = 0.235, 0.145
    kerb = []                                               # (cx, cy, sx, sy): corners, the long sides, the ends
    for sx in (-1, 1):
        for sy in (-1, 1): kerb.append((sx * 1.2, sy * 0.44, 0.26, 0.25))
    for sy in (-1, 1):
        for x0, x1 in ((-1.065, -0.37), (-0.355, 0.36), (0.375, 1.065)): kerb.append(((x0 + x1) / 2, sy * 0.44, x1 - x0 - 0.012, 0.19))
    for sx in (-1, 1): kerb.append((sx * 1.215, 0.0, 0.2, 0.62))
    for i, (cx, cy, kx, ky) in enumerate(kerb):
        hz = KZH + rng.uniform(-0.01, 0.012) + (0.02 if kx > 0.24 and ky > 0.24 else 0.0)     # the corner stones stand proud
        A.add(OB, BODY, rbox((kx, ky, hz), r=0.065, M=M_at((cx + rng.uniform(-0.006, 0.006), cy, KZ0 + hz / 2), rz=rng.uniform(-0.02, 0.02))),
              stone(mul(STN, 0.94 + 0.12 * rng.random()), seed=i + 3), 'kerb')
    # the milky turquoise water, painted highlight streaks and a ripple ring under the spout
    SPX = -1.02                                              # where the spout's pour meets the water
    def water(p, n):
        c = mix('#7ad0c8', '#a8e4dc', 0.5 + 0.5 * math.sin(p.x * 2.2 + 0.4) * math.cos(p.y * 4))
        hl = max(math.exp(-(((p.x + 0.45) / 0.22) ** 2 + ((p.y + 0.12) / 0.05) ** 2)), math.exp(-(((p.x - 0.5) / 0.16) ** 2 + ((p.y - 0.1) / 0.04) ** 2)))
        rp = math.exp(-((math.hypot(p.x - SPX, p.y + 0.12) - 0.09) / 0.03) ** 2)
        return mix(c, '#e8fbf6', clamp(max(hl, rp)) * 0.8)
    A.add(OB, BODY, rbox((L + 0.02, W + 0.02, 0.04), r=0.01, extra=(9, 3, 0), M=M_at((0, 0, 0.31))), water, 'water')
    # steam-smoothed rocks sitting in the water's corners (clear of the steam at x +-0.6)
    for i, (rx, ry, s_) in enumerate(((-0.96, 0.22, 0.12), (0.98, -0.2, 0.11), (1.0, 0.22, 0.085))):
        rk = ellipsoid(Vector((0, 0, 0)), (s_ * 1.2, s_, s_ * 0.62), K=12, J=6)
        A.add(OB, BODY, rk.xform(M_at((rx, ry, 0.325), rz=rng.uniform(0, 3))), stone('#9ea4b4', seed=40 + i, wet=True), 'rocks')

    # ---- the bamboo spout at the -x end, pouring into the water
    BAM = '#7fa83e'; BAM_HI = '#a4c45c'; BAM_NODE = '#a8b850'; BAM_CUT = '#f0e6c0'
    def bam(nk):
        def f(p, n):
            c = mul(mix(BAM, BAM_HI, clamp(n.z * 0.6 + 0.25) * 0.6), 1 - 0.2 * clamp(-n.z))
            k = nk(p)
            return mix(c, BAM_NODE, k) if k > 0 else c
        return f
    sp = Vector((-1.43, -0.12, 0.0)); SPT = 0.66
    tt, nk = bamboo_pole((sp.x, sp.y, 0.04), (sp.x, sp.y, SPT), 0.042, nodes=(0.5,), K=8)
    A.add(OB, BODY, tt, bam(nk), 'spout')
    A.add(OB, BODY, lathe([(0.0, SPT - 0.02), (0.044, SPT - 0.02), (0.045, SPT + 0.03), (0.036, SPT + 0.04), (0.0, SPT + 0.041)], 8).xform(Matrix.Translation((sp.x, sp.y, 0))),
          lambda p, n: srgb(BAM_CUT) if n.z > 0.5 else srgb(BAM), 'spout')
    pend = Vector((SPX - 0.03, -0.12, 0.47))
    ppath = [Vector((sp.x + 0.01, sp.y, SPT - 0.06)), Vector((-1.28, -0.12, 0.55)), pend]
    def pipe_col(p, n):
        if (p - pend).length < 0.034 and (p - pend).normalized().dot((pend - ppath[-2]).normalized()) > 0.3: return srgb('#3a4626')
        return bam(lambda q: 0.0)(p, n)
    A.add(OB, BODY, tube(ppath, lambda s: 0.03, K=8), pipe_col, 'spout')
    pour = [pend + Vector((0.012, 0, -0.03)), Vector((SPX - 0.008, -0.12, 0.40)), Vector((SPX, -0.12, 0.335))]
    A.add(OB, BODY, tube(pour, lambda s: 0.017 - 0.004 * s, K=6), lambda p, n: srgb('#d4f2f4'), 'spout')

    # ---- benches both sides (seat 0.40 at game z +-0.62), a towel and a bucket
    for s in (-1, 1):
        by = -s * (W / 2 + 0.38)
        A.add(OB, BODY, rbox((2.5, 0.36, 0.055), r=0.02, M=M_at((0, by, 0.40 - 0.0275))), wood(seed=s + 4), 'benches')
        for x in (-1.12, 0.0, 1.12):
            A.add(OB, BODY, rbox((0.09, 0.28, 0.345), r=0.02, M=M_at((x, by, 0.1725))), wood(TIMBER, seed=int(x * 9) + s), 'benches')
    A.add(OB, BODY, rbox((0.22, 0.17, 0.05), r=0.015, M=M_at((0.84, -(W / 2 + 0.38), 0.425), rz=0.12)), lambda p, n: srgb('#fff6ea'), 'towel')
    A.add(OB, BODY, rbox((0.224, 0.04, 0.052), r=0.0, M=M_at((0.844, -(W / 2 + 0.38) + 0.03, 0.426), rz=0.12)), lambda p, n: srgb('#4a6ab8'), 'towel')
    oc = Vector((-1.5, 0.32, 0))
    def oke_col(p, n, c=oc):
        if p.z > 0.04 and math.hypot(p.x - c.x, p.y - c.y) < 0.118 and n.z > 0.5: return srgb('#7ad0c8')
        hoop = abs(p.z - 0.04) < 0.012 or abs(p.z - 0.13) < 0.012
        return srgb('#5a4a3a') if hoop else mul(mix('#c8a070', '#e0bc88', clamp(n.z + 0.3) * 0.5), 0.9 + 0.1 * math.cos(math.atan2(p.y - c.y, p.x - c.x) * 16))
    A.add(OB, BODY, lathe([(0.0, 0.0), (0.12, 0.0), (0.124, 0.035), (0.126, 0.045), (0.13, 0.125), (0.132, 0.135), (0.14, 0.17),
                           (0.12, 0.17), (0.11, 0.06), (0.0, 0.055)], 12).xform(Matrix.Translation(oc)), oke_col, 'bucket')

    # ---- snow icing: dollops on the kerb's four outer corners and the benches' ends (clear of the seats and the water),
    # each with a drip over the edge; low soft drifts hugging the benches' outer sides
    for sx in (-1, 1):
        for sy in (-1, 1):
            c = Vector((sx * 1.255, sy * 0.495, KZ0 + KZH + 0.012))
            A.add(OB, BODY, blob(c, 0.085, 0.055, lobes=3, K=10, seed=sx * 2 + sy + 5), snow, 'snow')
            d_ = ellipsoid(Vector((0, 0, 0)), (0.035, 0.022, 0.055), K=8, J=4)
            A.add(OB, BODY, d_.xform(M_at((sx * 1.29, sy * 0.555, KZ0 + KZH - 0.025), rz=0.0)), snow, 'snow')
    for s in (-1, 1):
        by = -s * (W / 2 + 0.38)
        for x in (-1.14, 1.14):
            A.add(OB, BODY, blob(Vector((x, by, 0.395)), 0.13, 0.075, lobes=4, K=10, seed=int(x * 7) + s), snow, 'snow')
            d_ = ellipsoid(Vector((0, 0, 0)), (0.022, 0.045, 0.06), K=8, J=4)
            A.add(OB, BODY, d_.xform(M_at((math.copysign(1.255, x), by + 0.06, 0.36))), snow, 'snow')
    for (dx, dy, lx, ly, h) in ((-0.5, -0.97, 0.5, 0.22, 0.2), (0.62, -0.96, 0.34, 0.19, 0.16), (0.12, 0.98, 0.6, 0.23, 0.23)):
        dr = lathe([(0.0, 0.0), (1.0, 0.0), (0.97, 0.14), (0.84, 0.46), (0.55, 0.82), (0.0, 1.0)], 20, sx=lx, sy=ly, th0=dx,
                   rfn=lambda r, z, th, dx=dx: r * (1 + 0.07 * math.sin(3 * th + dx * 5) + 0.04 * math.sin(5 * th)))
        dr.v = [Vector((v.x, v.y, v.z * h)) for v in dr.v]
        A.add(OB, BODY, dr.xform(Matrix.Translation((dx, dy, -0.01))), snow, 'drifts')

    # ---- the sign at the +x end on a short post (~0.9 m): a dark board with the cream steam-bowl icon, a snow cap
    SXp = L / 2 + 0.38
    A.add(OB, BODY, lathe([(0.0, 0.0), (0.04, 0.0), (0.038, 0.66), (0.0, 0.66)], 8, e=4.0, th0=math.pi / 8).xform(Matrix.Translation((SXp, 0, 0))), wood(TIMBER, seed=31), 'sign')
    MB = M_at((SXp, -0.04, 0.76), rz=0.0)
    A.add(OB, BODY, rbox((0.36, 0.05, 0.28), r=0.02, M=MB), paint('#2e2420', top=0.2), 'sign')
    A.add(OB, BODY, tube([MB @ Vector((x, -0.03, -0.075)) for x in (-0.09, -0.06, 0.0, 0.06, 0.09)], lambda s: 0.016, K=5), lambda p, n: srgb('#f6f0e4'), 'sign')
    for j, x in enumerate((-0.055, 0.0, 0.055)):
        A.add(OB, BODY, tube([MB @ Vector((x + 0.012 * math.sin(i * 2.1 + j), -0.03, -0.035 + i * 0.03)) for i in range(5)], lambda s: 0.013, K=4),
              lambda p, n: srgb('#f6f0e4'), 'sign')
    A.add(OB, BODY, blob(Vector((SXp, -0.04, 0.895)), 0.12, 0.06, lobes=3, K=9, seed=4), snow, 'sign')
    export(A, 'ashiyu', {'body': {}})

# ================================================================== 5. Funaki's fishing boat
def build_boat():
    A = Asset(); rng = random.Random(898)
    BODY, GLOW = 'body', 'bulb_glow'; OB = 'boat'
    L, BEAM, DEPTH, RISE, WL = 3.5, 1.2, 0.52, 0.38, 0.2
    CREAM, TRIM, RED, INNER, RAILW, KEELW = '#f4eee2', '#2c6ab8', '#b8423a', '#b07e50', '#8a6a4a', '#6a4e3a'
    def bAt(t): return BEAM / 2 * (0.66 + 0.34 * math.sin(t / 0.42 * math.pi / 2) if t < 0.42 else max(0.0, math.cos((t - 0.42) / 0.58 * math.pi / 2)) ** 0.75)
    def kAt(t): return (((t - 0.72) / 0.28) ** 2 * DEPTH * 0.7) if t > 0.72 else 0.0
    def sAt(t): return DEPTH + RISE * t ** 2.6 + 0.07 * (1 - t) ** 2
    def X(t): return (t - 0.5) * L
    def sheer(t): return Vector((X(t), bAt(t), sAt(t)))
    TH, TB = 0.04, 0.04                                      # hull wall and bottom thickness
    def kin(t, b): return max(0.25, 1 - TH / max(b, 0.05))
    def outer_hw(t, z):
        b, ky, sy = bAt(t), kAt(t), sAt(t)
        if z <= ky or sy <= ky: return 0.0
        u = clamp((z - ky) / (sy - ky)); return b * math.sin(math.acos(1 - u))
    def inner_hw(t, z):
        b, ky, sy = bAt(t), kAt(t) + TB, sAt(t)
        if z <= ky: return 0.0
        u = clamp((z - ky) / (sy - ky)); return kin(t, b) * b * math.sin(math.acos(1 - u))
    ts = [0.0, 0.04, 0.09, 0.15, 0.21, 0.27, 0.33, 0.39, 0.45, 0.51, 0.57, 0.63, 0.68, 0.73, 0.77, 0.81, 0.85, 0.88, 0.91, 0.935, 0.955, 0.97, 0.98]
    def mono(us, gap=0.006):
        out = []
        for u in us:
            u = clamp(u, 0.0, 1.0)
            if out and u < out[-1] + gap: u = out[-1] + gap
            out.append(u)
        if out[-1] > 1.0:
            out = [u - (out[-1] - 1.0) * (i + 1) / len(out) for i, u in enumerate(out)]
        return out
    def station(t):
        b, ky, sy = bAt(t), kAt(t), sAt(t); hh = sy - ky
        uw = (WL - ky) / hh; ut = (sy - 0.10 - ky) / hh
        if uw > 0.09: below = [uw * 0.35, uw * 0.7, uw - 0.018 / hh, uw - 0.011 / hh, uw + 0.011 / hh, uw + 0.018 / hh]
        else: below = [0.03, 0.06, 0.09, 0.12, 0.15, 0.18]
        lo = below[-1]; mid = [lo + (ut - 0.006 / hh - lo) * f for f in (0.25, 0.5, 0.75)]
        us = mono(below + mid + [ut - 0.005 / hh, ut + 0.005 / hh, (ut + 1) / 2, 1.0])
        x = X(t)
        def O(u, s): ph = math.acos(1 - u); return Vector((x, s * b * math.sin(ph), ky + hh * u))
        k = kin(t, b); kyi = ky + TB; hi = sy - kyi
        def I(u, s): ph = math.acos(1 - u); return Vector((x, s * k * b * math.sin(ph), kyi + hi * u))
        loop = [O(u, -1) for u in reversed(us)] + [O(0.0, 1)] + [O(u, 1) for u in us]
        loop += [Vector((x, b - 0.006, sy + 0.012)), Vector((x, k * b + 0.006, sy + 0.012))]
        iu = [1.0, 0.7, 0.4, 0.15]
        loop += [I(u, 1) for u in iu] + [I(0.0, 1)] + [I(u, -1) for u in reversed(iu)]
        loop += [Vector((x, -(k * b + 0.006), sy + 0.012)), Vector((x, -(b - 0.006), sy + 0.012))]
        return loop
    rings = [station(t) for t in ts]
    # rounded ends: an inset ring (pulled in-plane toward the wall's middle, out along x) carrying a flat normal
    def inset(ring, dx):
        n = len(ring); out = []
        area = sum(ring[i].y * ring[(i + 1) % n].z - ring[(i + 1) % n].y * ring[i].z for i in range(n))
        sg = 1 if area > 0 else -1
        for i in range(n):
            a, c = ring[i - 1], ring[(i + 1) % n]
            ty, tz = c.y - a.y, c.z - a.z; ln = math.hypot(ty, tz) or 1
            ny, nz_ = -tz / ln * sg, ty / ln * sg                 # inward
            out.append(Vector((ring[i].x + dx, ring[i].y + ny * 0.01, ring[i].z + nz_ * 0.01)))
        return out
    rings = [inset(rings[0], -0.012)] + rings + [inset(rings[-1], 0.012)]
    hullT = Tmp(); ids = ring_surface(hullT, rings, [Vector((r[0].x, 0, 0.3)) for r in rings])
    for ring_ids, nx in ((ids[0], -1), (ids[-1], 1)):
        for i in ring_ids: hullT.n[i] = Vector((nx, 0, 0))
        tri = ear_clip([(hullT.v[i].y, hullT.v[i].z) for i in ring_ids])
        for a, b_, c in tri: hullT.face([ring_ids[a], ring_ids[b_], ring_ids[c]], Vector((nx, 0, 0)))
    def hull_col(p, n):
        t = clamp(p.x / L + 0.5); sy = sAt(t)
        if p.z > sy + 0.004: return mul(RAILW, 1.05)                         # the gunwale's top
        if abs(p.y) < outer_hw(t, p.z) - 0.012 and abs(n.x) < 0.9:          # the inside: planked wood
            c = mix(mul(INNER, 0.82), '#d4a874', clamp((p.z - 0.05) / 0.6) * 0.7)
            return mul(c, 0.94 + 0.06 * math.sin(p.z * 60))
        if p.z < WL - 0.015: c = srgb(RED)
        elif p.z < WL + 0.015: c = srgb('#fff6ea')
        elif p.z > sy - 0.10: c = mix(TRIM, '#3c7ccc', clamp(n.z + 0.3) * 0.4)
        else: c = mix(CREAM, '#fffaf0', clamp(n.z + 0.4) * 0.3)
        strake = int(math.floor((p.z + 0.02) / 0.1))
        c = mul(c, (0.95 if strake % 2 else 1.0) * (1 - 0.15 * clamp(-n.z)))
        if WL + 0.015 < p.z < sy - 0.1 and vnoise(p, 7, 3) > 0.7: c = mix(c, '#d8d4cc', 0.3)   # weathering
        return c
    A.add(OB, BODY, hullT, hull_col, 'hull')
    b0, ky0, sy0_ = bAt(0.0), kAt(0.0), sAt(0.0); k0 = kin(0.0, b0); kyi0 = ky0 + TB
    sec2 = []
    for u in [1.0, 0.75, 0.5, 0.3, 0.15, 0.05]: ph = math.acos(1 - u); sec2.append((-k0 * b0 * math.sin(ph) * 1.02, kyi0 + (sy0_ - kyi0) * u))
    sec2 += [(0.0, kyi0 - 0.005)]
    sec2 += [(-y, z) for y, z in reversed(sec2[:-1])]
    xa, xb = X(0.0) - 0.004, X(0.0) + 0.032
    XN, XP = Vector((-1, 0, 0)), Vector((1, 0, 0))
    tr = Tmp(); fa = [tr.vert((xa, y, z), XN) for y, z in sec2]; fb = [tr.vert((xb, y, z), XP) for y, z in sec2]
    for a_, b_, c_ in ear_clip(sec2):
        tr.face([fa[a_], fa[b_], fa[c_]], XN); tr.face([fb[a_], fb[b_], fb[c_]], XP)
    for q in range(len(sec2)):
        q2 = (q + 1) % len(sec2); mid = Vector((0, (sec2[q][0] + sec2[q2][0]) / 2, (sec2[q][1] + sec2[q2][1]) / 2 - 0.3))
        tr.face([fa[q], fa[q2], fb[q2], fb[q]], mid)
    A.add(OB, BODY, tr, lambda p, n: mul(mix(INNER, '#e0bc88', 0.3), 0.8 if n.x < -0.5 else 0.95), 'hull')
    # gunwale rails, the swept stem post, the keel
    for s in (-1, 1):
        rp = [Vector((X(t), s * bAt(t) * 0.985, sAt(t) + 0.02)) for t in [i / 11 * 0.97 for i in range(12)]]
        A.add(OB, BODY, tube(rp, lambda q: 0.032, K=6), paint(RAILW, top=0.25, bot=0.25), 'rails')
    stem = [Vector((X(t) + 0.02, 0, kAt(t))) for t in (0.72, 0.8, 0.88, 0.94, 0.98)] + [Vector((L / 2 + 0.03, 0, sAt(1.0) - 0.05)), Vector((L / 2 + 0.07, 0, sAt(1.0) + 0.14)), Vector((L / 2 + 0.14, 0, sAt(1.0) + 0.3))]
    A.add(OB, BODY, tube(stem, lambda q: 0.042, K=8), paint(RAILW, top=0.25, bot=0.2), 'stem')
    A.add(OB, BODY, tube([Vector((X(t), 0, kAt(t))) for t in (0.0, 0.2, 0.4, 0.6, 0.74)], lambda q: 0.034, K=6), paint(KEELW, top=0.2), 'keel')
    # rib frames inside the hull, following the inner surface sheer to sheer
    for t in (0.12, 0.24, 0.42, 0.62, 0.74, 0.84, 0.92):
        b, ky, sy = bAt(t), kAt(t) + TB, sAt(t); k = kin(t, b)
        pts = [Vector((X(t), s_ * (k * b - 0.012) * math.sin(math.acos(1 - u)), ky + 0.012 + (sy - ky - 0.01) * u)) for s_, u in
               [(-1, 1.0), (-1, 0.6), (-1, 0.3), (-1, 0.1), (1, 0.0), (1, 0.1), (1, 0.3), (1, 0.6), (1, 1.0)]]
        A.add(OB, BODY, tube(pts, lambda q: 0.02, K=4), paint('#7e5434', top=0.25), 'ribs')
    # thwarts and floorboards
    for t in (0.3, 0.55):
        z = sAt(t) - 0.12; hw = inner_hw(t, z)
        A.add(OB, BODY, rbox((0.16, 2 * hw + 0.02, 0.05), r=0.015, M=M_at((X(t), 0, z))), paint('#c8a070', hi='#e2c08e', top=0.3), 'thwarts')
    FZ = 0.1
    for j, yo in enumerate((-0.24, -0.12, 0.0, 0.12, 0.24)):
        need = abs(yo) + 0.06; xs_ = [X(i / 200 * 0.98) for i in range(201) if inner_hw(i / 200 * 0.98, FZ) > need]
        if not xs_: continue
        x0, x1 = min(xs_) + 0.02, max(xs_) - 0.02
        A.add(OB, BODY, rbox((x1 - x0, 0.11, 0.03), r=0.008, M=M_at(((x0 + x1) / 2, yo, FZ))),
              paint(mul('#b8946a', 0.92 + 0.12 * ((j * 3) % 4) / 3), top=0.2), 'floor')
    # the mast and its furled sail, the yard, the stays
    mt = 0.62; mx, my = X(mt), sAt(mt)
    A.add(OB, BODY, lathe([(0.0, FZ), (0.05, FZ), (0.046, my + 1.0), (0.04, my + 1.9), (0.0, my + 1.92)], 8).xform(Matrix.Translation((mx, 0, 0))),
          paint('#b89a72', hi='#d4b48a', top=0.3), 'mast')
    sprof = [(0.0, my + 0.38), (0.06, my + 0.4)]
    for i in range(4):
        z0 = my + 0.45 + i * 0.285
        sprof += [(0.088 - 0.008 * (i % 2), z0 + 0.04), (0.084, z0 + 0.105), (0.074, z0 + 0.12), (0.084, z0 + 0.135), (0.09 - 0.008 * ((i + 1) % 2), z0 + 0.2)]
    sprof += [(0.05, my + 1.6), (0.0, my + 1.62)]
    def sail_col(p, n):
        tie = any(abs(p.z - (my + 0.45 + i * 0.285 + 0.12)) < 0.014 for i in range(4))
        if tie: return srgb('#c8a868')
        return mul(mix('#f0e6d0', '#fff6ea', clamp(n.z + 0.3) * 0.4), 0.9 + 0.1 * math.cos(math.atan2(p.y + 0.07, p.x - mx + 0.05) * 3))
    A.add(OB, BODY, lathe(sprof, 10).xform(Matrix.Translation((mx - 0.05, -0.07, 0))), sail_col, 'sail')
    yd = Vector((-0.989, 0, 0.149))
    A.add(OB, BODY, tube([Vector((mx - 0.1, -0.075, my + 1.62)) + yd * 0.75, Vector((mx - 0.1, -0.075, my + 1.62)) - yd * 0.75], lambda q: 0.028, K=6), paint('#a8845e', top=0.25), 'mast')
    for tq in (0.98, 0.05):
        a_ = sheer(tq); a_ = Vector((a_.x, 0.0, a_.z + 0.05))
        A.add(OB, BODY, tube([Vector((mx, 0, my + 1.85)), a_], lambda q: 0.013, K=4), lambda p, n: srgb('#3a3436'), 'stays')
    # the squid-lamp pole across the bow with three big bulbs (bulb_glow)
    lt = 0.86; lx, ly = X(lt), sAt(lt)
    A.add(OB, BODY, lathe([(0.0, FZ + kAt(lt)), (0.032, FZ + kAt(lt)), (0.03, ly + 1.2), (0.0, ly + 1.21)], 8).xform(Matrix.Translation((lx, 0, 0))), paint('#d8d0c8', top=0.25), 'lamps')
    A.add(OB, BODY, tube([Vector((lx, -0.56, ly + 1.15)), Vector((lx, 0.56, ly + 1.15))], lambda q: 0.025, K=6), paint('#5a5458', top=0.3), 'lamps')
    for yb in (-0.4, 0.0, 0.4):
        A.add(OB, GLOW, ellipsoid(Vector((lx, yb, ly + 0.97)), (0.09, 0.09, 0.115), K=10, J=6), '#fff4d8', 'bulbs')
        A.add(OB, BODY, lathe([(0.0, ly + 1.06), (0.06, ly + 1.06), (0.05, ly + 1.14), (0.0, ly + 1.15)], 8).xform(Matrix.Translation((lx, yb, 0))),
              paint('#3a3640', hi='#5a5660', top=0.4), 'lamps')
    # the sculling oar over the stern, the nets heaped amidships with their floats, the name boards on the bow
    sx0, sy0 = X(0.04), sAt(0.04)
    A.add(OB, BODY, tube([Vector((sx0 + 0.2, -0.1, sy0 + 0.35)), Vector((sx0 - 1.0, -0.3, sy0 - 0.25))], lambda q: 0.028, K=6), paint('#c8a070', top=0.25), 'oar')
    A.add(OB, BODY, rbox((0.5, 0.14, 0.035), r=0.012, M=M_at((sx0 - 1.15, -0.31, sy0 - 0.32), ry=-0.45) @ Matrix.Rotation(math.pi / 2, 4, 'X')), paint('#c8a070', top=0.25), 'oar')
    NET = '#4f7f72'
    def net_col(p, n):
        k = 0.5 + 0.5 * math.sin(p.x * 55) * math.sin(p.y * 55 + p.z * 30)
        c = mix(NET, '#7aa898', clamp(n.z) * 0.4 + k * 0.25)
        return mul(c, 0.85 + 0.2 * vnoise(p, 9, 6))
    for (cx, cy, rx_, ry_, h_, sd) in ((-0.25, 0.0, 0.42, 0.3, 0.16, 1), (-0.5, 0.12, 0.22, 0.2, 0.12, 2), (0.0, -0.1, 0.24, 0.2, 0.11, 3)):
        nb = lathe([(0.0, 0.0), (1.0, 0.0), (0.88, 0.45), (0.5, 0.85), (0.0, 1.0)], 12, sx=rx_, sy=ry_, th0=sd,
                   rfn=lambda r, z, th, sd=sd: r * (1 + 0.1 * math.sin(4 * th + sd) + 0.06 * math.sin(7 * th + z * 9)))
        nb.v = [Vector((v.x, v.y, v.z * h_)) for v in nb.v]
        A.add(OB, BODY, nb.xform(Matrix.Translation((cx, cy, FZ + 0.01))), net_col, 'nets')
    for i in range(4):
        A.add(OB, BODY, ellipsoid(Vector((-0.55 + i * 0.22, (i % 2 - 0.5) * 0.3, FZ + 0.2 + (i % 2) * 0.04)), (0.08, 0.08, 0.08), K=9, J=5),
              paint('#fff6ea' if i % 2 else '#ff7a5a', top=0.25, bot=0.3), 'floats')
    nt = 0.78
    for s in (-1, 1):
        z = sAt(nt) - 0.12; hw = outer_hw(nt, z) + 0.012
        d = Vector((X(nt + 0.01) - X(nt - 0.01), s * (outer_hw(nt + 0.01, z) - outer_hw(nt - 0.01, z)), 0))
        yaw = math.atan2(d.y, d.x)
        MB = M_at((X(nt), s * hw, z), rz=yaw)
        A.add(OB, BODY, rbox((0.42, 0.02, 0.13), r=0.006, M=MB), paint('#fff6ea', top=0.2), 'names')
        A.add(OB, BODY, rbox((0.09, 0.02, 0.09), r=0.0, M=MB @ Matrix.Translation((-0.1, s * 0.008, 0))), lambda p, n: srgb('#e8403a'), 'names')
        A.add(OB, BODY, rbox((0.18, 0.02, 0.03), r=0.0, M=MB @ Matrix.Translation((0.07, s * 0.008, 0.0))), lambda p, n: srgb('#2c6ab8'), 'names')
    export(A, 'fishing-boat', {'body': {}, 'bulb_glow': dict(emission='#fff4d8')})

# ================================================================== 3. the hoshigaki drying frame
def build_hoshigaki():
    A = Asset(); rng = random.Random(9)
    BODY = 'body'; OB = 'frame'
    WOODC = '#86604a'; WOOD_HI = '#b08462'; RAIL = '#c8b070'; ROPE = '#c8a868'; ROPE_DK = '#9a7a48'
    PY = 0.2                                       # the frame's line (kit z -0.2)
    def wood_col(base=WOODC, hi=WOOD_HI, seed=0):
        def f(p, n):
            g = vnoise(Vector((p.x * 0.6, p.y * 0.6, p.z * 0.08)), 30, seed)          # long grain streaks
            c = mix(base, hi, clamp(n.z * 0.5 + 0.25) * 0.5 + (g - 0.5) * 0.6)
            return mul(c, (1 - 0.2 * clamp(-n.z)) * (1 - 0.2 * (1 - smooth(0.0, 0.15, p.z))))
        return f
    # ---- posts: rounded-square timbers
    for sx in (-1, 1):
        post = lathe([(0.0, 0.0), (0.062, 0.0), (0.061, 0.5), (0.06, 1.0), (0.059, 1.4), (0.058, 1.58), (0.0, 1.585)], 8, e=4.0, th0=math.pi / 8)
        A.add(OB, BODY, post.xform(M_at((sx * 0.95, PY, 0), rz=sx * 0.03)), wood_col(seed=sx + 2), 'posts')
    # ---- rails: bamboo through the posts, node bands
    for z in (1.48, 1.0):
        tt, nk = bamboo_pole((-1.06, PY, z), (1.06, PY, z), 0.033, nodes=(0.2, 0.5, 0.8), K=8)
        A.add(OB, BODY, tt, bamboo_col(nk, base=RAIL, hi='#e4d098', node='#9a8448'), 'rails')
    # ---- rope lashings where the rails cross the posts (a tilted wrap of straw rope)
    def lash_col(p, n):
        return mix(ROPE, ROPE_DK, 0.5 + 0.5 * math.sin(p.z * 160 + p.x * 90))
    for sx in (-1, 1):
        for z in (1.48, 1.0):
            pts = [Vector((sx * 0.95 + math.cos(a) * 0.08, PY + math.sin(a) * 0.08, z + 0.035 * math.cos(a + 0.8)))
                   for a in (TAU * k / 8 for k in range(8))]
            A.add(OB, BODY, tube_loop(pts, lambda s: 0.017, K=4), lash_col, 'lashing')
    # ---- the little tiled cap: a mono-pitch roof falling to the front, chunky tile rolls
    NRC = 12; CX = 1.16; CD = 0.22; ZC = 1.62; TILT = 0.18
    def cap_prof(i, n=25):
        x = -CX + 2 * CX * i / (n - 1)
        rl = 0.5 - 0.5 * math.cos(TAU * ((x / (2 * CX) + 0.5) * NRC))
        zf = lambda yy: ZC + yy * math.tan(TILT)
        # (sweep frame for a path along +x: w runs along -y, u along +z) -> list (w, u) relative to the path point
        pts = [(CD + 0.015, zf(-CD) - 0.012 - ZC), (CD, zf(-CD) + 0.018 + 0.012 * rl - ZC), (0.0, zf(0) + 0.03 + 0.016 * rl - ZC),
               (-CD, zf(CD) + 0.03 + 0.014 * rl - ZC), (-CD - 0.012, zf(CD) - ZC), (0.0, zf(0) - 0.022 - ZC)]
        return pts
    cpath = [Vector((-CX + 2 * CX * i / 24, PY, ZC)) for i in range(25)]
    def tile_col(p, n):
        x = p.x
        rl = 0.5 - 0.5 * math.cos(TAU * ((x / (2 * CX) + 0.5) * NRC))
        if n.z < -0.3: return srgb('#4a2c24')
        c = mix('#7e3226', '#d8663e', clamp(n.z) * 0.75) if n.z > 0.3 else srgb('#d8946e')
        return mul(c, 0.56 + 0.44 * rl ** 0.6) if n.z > 0.3 else c
    A.add(OB, BODY, sweep(cpath, cap_prof, inset=0.25, cap_d=0.012), tile_col, 'cap')

    # ---- the strings of dried persimmons (hoshigaki): 9 on the top rail, 7 on the lower one, deeper amber
    def kaki_string(x, ztop, n):
        L = 0.04 + n * 0.10
        A.add(OB, BODY, rbox((0.02, 0.02, L), r=0.0, M=M_at((x, PY - 0.01, ztop - L / 2))), lambda p, nn: ROPE, 'cords')
        for j in range(n):
            c = Vector((x + rng.uniform(-0.008, 0.008), PY - 0.012, ztop - 0.075 - j * 0.10))
            t, col, h = persimmon(c, 0.056 * rng.uniform(0.94, 1.06), rng.choice(DRIED), rng, dried=True)
            A.add(OB, BODY, t, col, 'hoshigaki')
    for i in range(10): kaki_string(-0.81 + i * 0.18, 1.48 - 0.02, 4)
    for i in range(9): kaki_string(-0.72 + i * 0.18, 1.0 - 0.02, 3)

    # ---- the straw mat with a heap of fresh persimmons
    MX, MY = -0.2, -0.65
    A.add(OB, BODY, rbox((1.3, 0.7, 0.03), r=0.012, M=M_at((MX, MY, 0.015))), paint('#d8bc80', hi='#e8d098', top=0.25), 'mat')
    for k in range(5):
        A.add(OB, BODY, rbox((0.06, 0.66, 0.006), r=0.0, M=M_at((MX - 0.5 + k * 0.25, MY, 0.031))), lambda p, n: srgb('#ccb27a'), 'mat')
    for sy in (-1, 1):
        A.add(OB, BODY, rbox((1.3, 0.05, 0.034), r=0.0, M=M_at((MX, MY + sy * 0.33, 0.017))), paint('#4a5a3a', top=0.3), 'mat')
    def fresh(c, r):
        t, col, h = persimmon(c, r, rng.choice(FRESH), rng, dried=False)
        A.add(OB, BODY, t, col, 'kaki')
        A.add(OB, BODY, calyx(c + Vector((0, 0, h * 0.86 - 0.004)), r * 0.62, rng), calyx_col, 'calyx')
        return h
    G_ = 1.13
    heap = [(0.0, 0.0), (0.105, 0.0), (-0.105, 0.0), (0.052, 0.092), (-0.052, 0.092), (0.052, -0.092), (-0.052, -0.092), (0.21, -0.05), (-0.2, 0.06)]
    for dx, dy in heap:
        r = 0.059 * rng.uniform(0.95, 1.06)
        fresh(Vector((MX + dx * G_, MY + dy * G_, 0.03 + r * 0.86)), r)
    for dx, dy in ((0.052, 0.031), (-0.052, 0.031), (0.0, -0.06)):
        r = 0.057 * rng.uniform(0.95, 1.05)
        fresh(Vector((MX + dx * G_, MY + dy * G_, 0.03 + 0.059 * 0.86 * 2 + r * 0.5)), r)

    # ---- two woven baskets of fresh fruit
    for bx, by, yaw in ((0.85, -0.6, 0.85), (1.2, -0.2, 1.2)):
        br, bh = 0.18, 0.16
        prof = [(0.0, 0.0), (br * 0.78, 0.0), (br * 0.8, 0.02), (br * 0.92, bh * 0.5), (br, bh), (br + 0.014, bh + 0.012),
                (br - 0.006, bh + 0.022), (br - 0.03, bh - 0.02), (0.0, bh - 0.05)]
        bk = lathe(prof, 14, th0=yaw).xform(M_at((bx, by, 0)))
        def basket_col(p, n, bx=bx, by=by, bh=bh):
            if p.z > bh + 0.004: return srgb('#8a6a3a')                                  # the rolled rim
            th = math.atan2(p.y - by, p.x - bx)
            w = (math.sin(p.z * 70) > 0) != (math.cos(th * 7) > 0)
            c = srgb('#c8a060') if w else srgb('#a88448')
            return mul(c, 0.86 + 0.18 * clamp(n.z + 0.5) - 0.12 * (1 - smooth(0.0, 0.05, p.z)))
        A.add(OB, BODY, bk, basket_col, 'baskets')
        for k in range(4):
            a = yaw + TAU * k / 4
            fresh(Vector((bx + math.cos(a) * 0.08, by + math.sin(a) * 0.08, bh - 0.008)), 0.06)
        for k in range(2):
            a = yaw + 0.8 + math.pi * k
            fresh(Vector((bx + math.cos(a) * 0.032, by + math.sin(a) * 0.032, bh + 0.05)), 0.058)

    # ---- the little ladder leaning back beside the frame
    ML = M_at((-1.35, -0.35, 0), rz=0.4) @ Matrix.Rotation(-0.3, 4, 'X')
    for s_ in (-1, 1):
        A.add(OB, BODY, rbox((0.06, 0.06, 1.44), r=0.022, M=ML @ Matrix.Translation((s_ * 0.16, 0, 0.7))), wood_col(seed=7 + s_), 'ladder')
    for k in range(4):
        A.add(OB, BODY, rbox((0.36, 0.05, 0.045), r=0.016, M=ML @ Matrix.Translation((0, 0, 0.27 + k * 0.33))), wood_col(seed=11 + k), 'ladder')

    export(A, 'hoshigaki-frame', {'body': {}})

if PIECE in ('waystone', 'all'): build_waystone()
if PIECE in ('shishi-odoshi', 'shishi', 'all'): build_shishi()
if PIECE in ('hoshigaki-frame', 'hoshigaki', 'all'): build_hoshigaki()
if PIECE in ('ashiyu', 'all'): build_ashiyu()
if PIECE in ('fishing-boat', 'boat', 'all'): build_boat()
