# PAWHAVEN magic props: the Town Portal moon gate frame and the Spirit Lantern, built in Blender by script.
#   blender --background --factory-startup --python build_magic-props.py -- --piece moon-gate|spirit-lantern|kit|all
# Deterministic: no randomness except seeded PRNGs; a re-run reproduces every GLB exactly.
# Frame: 1 unit = 1 m (kit-local units), Blender Z up, front -Y (the glTF exporter makes it the game's +z).
# A kit function's local (x, y, z) maps to Blender (x, -z, y).
# The generic kit below (mesh accumulator, rounded boxes, lathes, tubes, sweeps, icing drapes, export) is copied from
# tools/blender/codex/assets/village-pieces/build_village-pieces.py.
import bpy, bmesh, math, os, sys, random
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..', '..'))
MODELS = os.path.join(REPO, 'public', 'models')
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
PIECE = argv[argv.index('--piece') + 1] if '--piece' in argv else 'all'
print('MP build pid', os.getpid())

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

def export(asset, name, matdefs, origins=None, out_dir=None):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    matmap = {k: make_mat(k, **v) for k, v in matdefs.items()}
    obs = [to_object(k, o, matmap, (origins or {}).get(k)) for k, o in asset.objs.items()]
    lo = Vector((1e9,) * 3); hi = Vector((-1e9,) * 3)
    for o in asset.objs.values():
        for v in o['v']:
            lo = Vector(map(min, lo, v)); hi = Vector(map(max, hi, v))
    print('MP %s tris %d %s' % (name, asset.tris(), {k: asset.tris(k) for k in asset.objs}))
    print('MP %s parts %s' % (name, dict(sorted(asset.count.items(), key=lambda kv: -kv[1]))))
    print('MP %s bounds blender x %.3f..%.3f y %.3f..%.3f z %.3f..%.3f | game z %.3f..%.3f' % (
        name, lo.x, hi.x, lo.y, hi.y, lo.z, hi.z, -hi.y, -lo.y))
    for ob in obs: print('MP %s check %s %s' % (name, ob.name, check(ob)))
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, name + '.blend'))
    for o in bpy.context.scene.objects: o.select_set(o.type == 'MESH')
    out = os.path.join(out_dir or MODELS, name + '.glb')
    kw = dict(filepath=out, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
              export_attributes=True, export_lights=False, export_cameras=False, export_animations=False,
              export_normals=True, export_texcoords=False, export_materials='EXPORT')
    try:
        bpy.ops.export_scene.gltf(export_vertex_color='ACTIVE', **kw)
    except TypeError as e:
        print('MP export_vertex_color rejected:', e)
        bpy.ops.export_scene.gltf(export_colors=True, **kw)
    print('MP wrote', out)


# ================================================================== magic props: palette
TASK_DIR = HERE
STONE = '#aaa0a4'; STONE_HI = '#dad0c6'; STONE_LO = '#6a6076'      # warm grey, lilac shade (style C)
LICHEN = '#dcd8b0'
MOSS = '#79a446'; MOSS_HI = '#a3c866'; MOSS_LO = '#557f36'
MOSS_WARM = '#8ea848'; MOSS_COOL = '#6a9a52'
STRAW = '#ecd6a0'; STRAW_DK = '#bc9c5c'; PAPER = '#fff3e2'
GOLD = '#f0bc4a'; GOLD_HI = '#ffe39a'; GOLD_LO = '#b8803a'
CORD = '#d8463a'
SLATE = '#555070'; SLATE_HI = '#7e78a0'; SLATE_LO = '#3a3450'
LATTICE = '#5a4a70'
TASSEL = '#8a62e0'; TASSEL_HI = '#c4a8ff'
PINK = '#f4a6c0'; PINK_HI = '#ffd2e0'; FLOWER_C = '#ffd760'

# ================================================================== magic props: shared helpers
def ngon_pts(n, R, rho, rot=0.0, arc=3):
    """a regular n-gon (circumradius R of the sharp polygon, a corner at angle rot) with corners rounded by rho"""
    if rho <= 1e-6:
        return [(R * math.cos(rot + TAU * i / n), R * math.sin(rot + TAU * i / n)) for i in range(n)]
    A = R * math.cos(math.pi / n)                 # apothem
    Ri = (A - rho) / math.cos(math.pi / n)        # the inner polygon's circumradius
    out = []
    for i in range(n):
        ca = rot + TAU * i / n
        cx, cy = Ri * math.cos(ca), Ri * math.sin(ca)
        for j in range(arc):
            a = ca - math.pi / n + (TAU / n) * j / (arc - 1)
            out.append((cx + rho * math.cos(a), cy + rho * math.sin(a)))
    return out

def ngon_solid(n, rows, rot=0.0, arc=3, cap0=True, cap1=True, wob=None):
    """a stacked rounded n-gon solid: rows [(R, rho, z)] bottom -> top; flat fan caps; wob(p) -> p deforms"""
    t = Tmp(); rings = []; cs = []
    for R, rho, z in rows:
        pts = ngon_pts(n, R, rho, rot, arc if rho > 1e-6 else 1)
        rings.append([Vector((x, y, z)) for x, y in pts]); cs.append(Vector((0, 0, z)))
    ring_surface(t, rings, cs, Vector((0, 0, rows[0][2])) if cap0 else None, Vector((0, 0, rows[-1][2])) if cap1 else None)
    if wob: t.v = [wob(p) for p in t.v]
    return t

def rope_tube(path, rad, K=9, pitch=0.17, amp=0.13, caps=True, closed=False, phase=None, up=Z):
    """a twisted three-strand rope along path; phase (a dict) collects each vertex's strand phase for painting"""
    n = len(path)
    if closed:
        F = []
        for i in range(n):
            T = (path[(i + 1) % n] - path[i - 1]).normalized()
            U = (up - T * up.dot(T)).normalized(); F.append((T, T.cross(U), U))
    else:
        F = frames(path, up)
    L = [0.0]
    for i in range(1, n): L.append(L[-1] + (path[i] - path[i - 1]).length)
    t = Tmp(); rings, cs = [], []
    def ring(p, W, U, r, v, shrink=1.0):
        pts = []
        for k in range(K):
            a = TAU * k / K
            tw = math.cos(3 * a + TAU * v / pitch)
            rr = r * shrink * (1 + amp * tw)
            q = p + W * (rr * math.cos(a)) + U * (rr * math.sin(a))
            if phase is not None: phase[(round(q.x, 5), round(q.y, 5), round(q.z, 5))] = tw
            pts.append(q)
        return pts
    if caps and not closed:
        T, W, U = F[0]; r0 = rad(0.0)
        rings.append(ring(path[0] - T * r0 * 0.55, W, U, r0, 0.0, 0.62)); cs.append(path[0])
    for i, (p, (T, W, U)) in enumerate(zip(path, F)):
        rings.append(ring(p, W, U, rad(i / (n - 1) if not closed else i / n), L[i])); cs.append(p)
    if caps and not closed:
        T, W, U = F[-1]; r1 = rad(1.0)
        rings.append(ring(path[-1] + T * r1 * 0.55, W, U, r1, L[-1], 0.62)); cs.append(path[-1])
    p0 = (path[0] - F[0][0] * rad(0.0) * 0.8) if caps and not closed else None
    p1 = (path[-1] + F[-1][0] * rad(1.0) * 0.8) if caps and not closed else None
    ring_surface(t, rings, cs, p0, p1, closed=closed)
    return t

def rope_col(phase):
    def f(p, n):
        tw = phase.get((round(p.x, 5), round(p.y, 5), round(p.z, 5)), 0.0)
        c = mix(STRAW_DK, STRAW, 0.2 + 0.8 * (0.5 + 0.5 * tw))
        return mul(c, 0.84 + 0.18 * clamp(n.z * 0.5 + 0.5))
    return f

def drape2(F, outv, thick, ths, J, sink=0.02, bead=True):
    """'icing' over a surface: F(th, s) -> a point on the base surface, s = 0 the cap's centre (a pole), s = 1 its
    edge (F must accept s a little over 1). A rolled lip that bulges proud and curls under, its edge tucked into the
    surface; the shell closes under the surface (sunk by `sink`), so it is a closed solid. outv(th, s) points out."""
    K = len(ths)
    def N(th, s):
        s = max(s, 2e-3); e = 1e-4
        a = F(th + e, s) - F(th - e, s); b = F(th, s + e) - F(th, s - e)
        n = b.cross(a); o = outv(th, s)
        if n.length < 1e-12: return o.normalized()
        n.normalize()
        return n if n.dot(o) >= 0 else -n
    t = Tmp(); rings, cs = [], []
    ctr = F(0.0, 0.0)
    for j in range(1, J + 1):
        s = j / J * 0.94
        rings.append([F(th, s) + N(th, s) * thick(th, s) for th in ths]); cs.append(ctr)
    lipr, curl, tuck = [], [], []
    for th in ths:
        n = N(th, 1.0); dn = (F(th, 1.02) - F(th, 1.0)).normalized(); tk = thick(th, 1.0)
        lipr.append(F(th, 1.0) + dn * tk * 0.45 + n * tk * 0.85)
        curl.append(F(th, 1.0) + dn * tk * 0.7 + n * tk * 0.3)
        tuck.append(F(th, 0.985) - n * 0.008)
    rings += ([lipr, curl, tuck] if bead else [lipr, tuck]); cs += [ctr] * (3 if bead else 2)
    for s in (0.7, 0.3):
        rings.append([F(th, s) - N(th, s) * sink for th in ths]); cs.append(ctr)
    top = F(0.0, 0.0) + N(0.0, 1e-3) * thick(0.0, 0.0)
    bot = F(0.0, 0.0) - N(0.0, 1e-3) * sink
    ring_surface(t, rings, cs, pole0=top, pole1=bot)
    return t

def icing_grid(P, Nf, thick, N, M, Pin):
    """'icing' over a long patch (no pole, so no fan creases on top): P(u, v) -> a base-surface point, u along the
    patch and v across it, both in [-1, 1]; Nf(u, v) -> the outward unit normal; thick(u, v). A top grid, a rolled lip
    round the whole boundary that bulges proud and curls under, its edge tucked into the surface, closed by a fan to Pin
    (a point inside the base solid)."""
    us = [-1 + 2 * i / N for i in range(N + 1)]; vs = [-1 + 2 * j / M for j in range(M + 1)]
    t = Tmp()
    top = [[t.vert(P(u, v) + Nf(u, v) * thick(u, v)) for v in vs] for u in us]
    for i in range(N):
        for j in range(M):
            t.face([top[i][j], top[i + 1][j], top[i + 1][j + 1], top[i][j + 1]], Nf((us[i] + us[i + 1]) / 2, (vs[j] + vs[j + 1]) / 2))
    bl = [(i, 0) for i in range(N + 1)] + [(N, j) for j in range(1, M + 1)] + [(i, M) for i in range(N - 1, -1, -1)] + \
         [(0, j) for j in range(M - 1, 0, -1)]
    loops = [[top[i][j] for i, j in bl]]
    lip, curl, tuck = [], [], []
    for i, j in bl:
        u, v = us[i], vs[j]; b = P(u, v); n = Nf(u, v); tk = thick(u, v)
        dn = b - P(u * 0.96, v * 0.96); dn = (dn - n * dn.dot(n)).normalized()
        lip.append(t.vert(b + dn * tk * 0.45 + n * tk * 0.85))
        curl.append(t.vert(b + dn * tk * 0.7 + n * tk * 0.3))
        tuck.append(t.vert(P(u * 0.985, v * 0.985) - n * 0.008))
    loops += [lip, curl, tuck]
    L = len(bl)
    for a, b in zip(loops, loops[1:]):
        for k in range(L):
            q = [a[k], a[(k + 1) % L], b[(k + 1) % L], b[k]]
            t.face(q, t.v[a[k]] - Pin)
    ci = t.vert(Pin)
    for k in range(L):
        t.face([ci, tuck[(k + 1) % L], tuck[k]], t.v[tuck[k]] - Pin)
    return t

SHIDE = '#f4f0e6'; SHIDE_TOP = '#faf7ef'; SHIDE_SIDE = '#e2ddd2'; SHIDE_UNDER = '#c9c4bb'
def zigzag_shide(A, ob, mat, top, L=0.2, yaw=0.0, tag='shide', w=0.05, th=0.018):
    """paper shide: one thin paper ribbon folded down in a lightning-bolt Z (three straight tabs joined by two
    diagonal steps, each step offset sideways), its top tucked into the rope at `top`; L its length below the rope;
    it faces -Y turned by yaw. Warm white, soft grey on the undersides of the steps."""
    k = L / 0.21; d = 0.042 * k
    pts = [(0.0, 0.025), (0.0, -0.05), (d, -0.082), (d, -0.128), (0.0, -0.16), (0.0, -0.21)]
    path = [Vector((x - d / 2, 0.0, z * k)) for x, z in pts]
    path[0] = Vector((path[0].x, 0.0, 0.025))
    hw, ht = w / 2, th / 2
    t = sweep(path, [(-hw, -ht), (hw, -ht), (hw, ht), (-hw, ht)], up=-Y, inset=0.25, cap_d=0.004)
    t.xform(M_at(top, rz=yaw))
    A.add(ob, mat, t, lambda p, n: mix(SHIDE, SHIDE_UNDER, clamp(-n.z * 1.6)) if n.z < 0.4 else mix(SHIDE, SHIDE_TOP, 0.6), tag)

def flower(A, ob, mat, c, r=0.045, seed=0, tilt=(0.0, 0.0)):
    """a little five-petal flower: a lobed disc and a round heart"""
    M = M_at(c, rz=seed * 1.3, rx=tilt[0], ry=tilt[1])
    d = lathe([(0.0, -0.012), (r * 0.8, -0.01), (r, 0.004), (r * 0.6, 0.016), (0.0, 0.018)], 10, th0=seed,
              rfn=lambda rr, z, th: rr * (0.72 + 0.28 * abs(math.cos(2.5 * (th - seed)))))
    A.add(ob, mat, d.xform(M), lambda p, n: mix(PINK, PINK_HI, clamp(n.z) * 0.6), 'flowers')
    A.add(ob, mat, ellipsoid(Vector((0, 0, 0.018)), (r * 0.32, r * 0.32, r * 0.22), K=6, J=3).xform(M),
          lambda p, n: mix(FLOWER_C, '#fff0a0', clamp(n.z) * 0.6), 'flowers')

def moss_col(seed=0):
    """moss: light tops, the base colour on the slopes, darker drip undersides and lips; soft warm/cool drift"""
    def f(p, n):
        up = n.z
        c = mix(MOSS_LO, MOSS, smooth(-0.35, 0.35, up))
        c = mix(c, MOSS_HI, smooth(0.55, 0.97, up) * 0.85)
        h = vnoise(p, 4.0, seed + 40)
        c = mix(c, MOSS_WARM if h > 0.5 else MOSS_COOL, abs(h - 0.5) * 0.5)
        return mul(c, 0.94 + 0.12 * vnoise(p, 11, seed))
    return f

# ================================================================== 1. the Town Portal moon gate (kit-local units)
# The kit (src/dungeon/portalModel.js frameGeometry): a torus ring r 1.08 (tube 0.19) centred 1.22 m up, the swirl disc
# r 0.93 in its plane; the opening's inner radius 0.89 is kept exactly, so the disc's edge stays buried in the stone.
# portalModel scales the whole root by `size` (0.78 in the game), so the GLB is built in the kit's own units.
CZ = 1.22; RIN = 0.89
def build_moon_gate():
    A = Asset(); rng = random.Random(41)
    OB, MAT = 'frame', 'stone'
    HW, HD, E = 0.22, 0.21, 3.0                # the voussoirs' half-width (radial) and half-depth; superellipse
    NB = 14; DPH = TAU / NB
    KHW, KHD = 0.035, 0.04                     # the keystone: proud outward and in depth
    def Rv(phi): return Vector((math.sin(phi), 0.0, math.cos(phi)))
    D = Vector((0, -1, 0))
    def sec(phi, a, hw, hd, e=E):
        """a point of the ring's section at angle phi (0 = top, + toward +x), section angle a (0 out, +90 front)"""
        c, s = se_dir(a, e)
        R = Rv(phi); C = Vector((0, 0, CZ)) + R * (RIN + hw)
        return C + R * (hw * c) + D * (hd * s)
    # ---------------- the voussoirs: 13 carved blocks (the bottom one is buried in the step), V-grooved joints
    blocks = []
    for i in range(NB):
        if i == NB // 2: continue
        phc = i * DPH if i <= NB // 2 else (i - NB) * DPH
        hw = HW * (1 + rng.uniform(-0.015, 0.015)); hd = HD * (1 + rng.uniform(-0.015, 0.015))
        key = (i == 0)
        if key: hw += KHW; hd += KHD
        tone = 1 + rng.uniform(-0.045, 0.045)
        blocks.append((phc, hw, hd, key, tone, i))
    for phc, hw, hd, key, tone, bi in blocks:
        ph0, ph1 = phc - DPH / 2, phc + DPH / 2
        rc = RIN + hw; db = 0.055 / rc
        st = [(ph0, 0.8), (ph0 + db, 1.0), (ph0 + DPH / 3, 1.0), (ph1 - DPH / 3, 1.0), (ph1 - db, 1.0), (ph1, 0.8)]
        K = 12
        rings, cs = [], []
        for ph, k in st:
            hwk, hdk = hw * k, hd * k
            R = Rv(ph); C = Vector((0, 0, CZ)) + R * (RIN + hwk)
            ring = []
            for j in range(K):
                a = TAU * j / K
                c, s = se_dir(a, E)
                q = C + R * (hwk * c) + D * (hdk * s)
                w = 1 + 0.03 * (vnoise(q, 4.0, 3 + bi) - 0.5) * (1 if c > -0.6 else 0.0)   # (the inner face stays true)
                ring.append(C + (q - C) * w)
            rings.append(ring); cs.append(C)
        t = Tmp(); ring_surface(t, rings, cs, cs[0], cs[-1])
        t.v = [Vector((q.x, q.y, max(q.z, 0.004))) for q in t.v]    # (the foot of the ring, buried in the pad, kept above ground)
        def bcol(p, n, ph0=ph0, ph1=ph1, tone=tone, key=key, bi=bi):
            up = n.z
            c = mix(STONE, STONE_HI, clamp(up) * 0.55 + clamp(-n.y) * 0.12)
            if up < 0: c = mix(c, STONE_LO, -up * 0.55)
            c = mul(c, tone * (0.94 + 0.12 * vnoise(p, 3.5, 11 + bi)))
            phi = math.atan2(p.x, p.z - CZ)
            dj = min(abs(phi - ph0), abs(ph1 - phi)) * 1.1
            c = mul(c, 1 - 0.26 * (1 - smooth(0.0, 0.07, dj)))          # the joints: soft shade into the grooves
            if up > 0.15 and vnoise(p, 7.0, 31 + bi) > 0.7: c = mix(c, LICHEN, 0.45)   # pale lichen spots
            c = mul(c, 1 - 0.24 * (1 - smooth(0.25, 0.75, p.z)))        # contact shade toward the plinth
            if key and n.y < -0.6:                                       # the keystone's medallion
                d = math.hypot(p.x, p.z - (CZ + RIN + HW + KHW))
                if d < 0.125: c = mix(c, '#8a8096', 0.55 * smooth(0.125, 0.10, d))
                if d < 0.10: c = mix(mix(STONE_HI, '#efe6dc', 0.4), c, 0.15)
            return c
        A.add(OB, MAT, t, bcol, 'keystone' if key else 'voussoirs')
    # ---------------- the crescent moon on the keystone, gold
    KZ = CZ + RIN + HW + KHW; KY = -(HD + KHD) - 0.012
    cp = [Vector((0.075 * math.cos(a), KY, KZ + 0.075 * math.sin(a))) for a in
          (math.radians(55 + (310 - 55) * k / 10) for k in range(11))]
    A.add(OB, MAT, tube(cp, lambda s: 0.011 + 0.024 * math.sin(math.pi * s), K=7),
          lambda p, n: mix(GOLD, GOLD_HI, clamp(n.z * 0.6 - n.y * 0.4)) if n.z > -0.3 else mix(GOLD, GOLD_LO, 0.5), 'crescent')
    # ---------------- the moss icing over the crown: a continuous cap across the top five stones
    def kb(phi):
        e = abs(phi) - DPH / 2
        return 1 - smooth(-0.005, 0.06, e)
    def env(phi, a):
        hw = HW + KHW * kb(phi) + 0.004; hd = HD + KHD * kb(phi) + 0.004
        return sec(phi, a, hw, hd)
    def env_c(phi):
        hw = HW + KHW * kb(phi) + 0.004
        return Vector((0, 0, CZ)) + Rv(phi) * (RIN + hw)
    RM, PQ = 1.24, 0.36                        # metres per radian along the ring (outer face); a quarter section
    UE = 0.8                                   # the cap's half-length along the ring (m)
    fdr = [(-0.62, 0.11, 0.11), (-0.24, 0.08, 0.09), (0.3, 0.13, 0.11), (0.7, 0.07, 0.1)]     # front drips (u, length, half-width)
    bdr = [(-0.5, 0.1, 0.11), (0.05, 0.07, 0.1), (0.55, 0.11, 0.11)]                          # back drips
    def wext(u, drips, ph):
        w = 0.155 * (1 + 0.14 * math.sin(7 * u + ph) + 0.06 * math.sin(13 * u + 2 * ph))
        for ud, L, hw in drips:
            d = (u - ud) / hw
            if abs(d) < 1: w += L * (1 - d * d) ** 0.45
        return w
    def MPt(un, v):
        u = un * UE * (1 - 0.16 * v * v) * (1 + 0.05 * math.sin(3 * v + 1.0) * un)
        endk = 0.3 + 0.7 * math.sqrt(max(0.0, 1 - un * un))
        w = v * endk * (wext(u, fdr, 2.0) if v > 0 else wext(u, bdr, 0.5))
        return u / RM, w / PQ * (math.pi / 2)
    def MPp(un, v):
        return env(*MPt(un, v))
    def MPn(un, v):
        phi, a = MPt(un, v); e = 1e-4
        n = (env(phi + e, a) - env(phi - e, a)).cross(env(phi, a + e) - env(phi, a - e))
        o = env(phi, a) - env_c(phi)
        if n.length < 1e-12: return o.normalized()
        n.normalize()
        return n if n.dot(o) >= 0 else -n
    A.add(OB, MAT, icing_grid(MPp, MPn, lambda u, v: 0.03 + 0.012 * smooth(0.6, 1.0, max(abs(u), abs(v))) + 0.018 * vnoise(Vector((u * 5.0, v * 2.2, 0.0)), 1.0, 3), 32, 6,
                              Vector((0, 0, CZ + RIN + HW))), moss_col(4), 'moss')
    # moss tufts and little flowers on the crown
    for k, (ph, a, r) in enumerate([(-0.24, -8, 0.075), (0.33, 12, 0.065), (0.08, -22, 0.06)]):
        p = env(ph, math.radians(a)); n = (p - env_c(ph)).normalized()
        A.add(OB, MAT, blob(Vector((0, 0, 0)), r, 0.06, lobes=4 + k % 2, K=8, seed=k).xform(
            Matrix.Translation(p + n * 0.02) @ n.to_track_quat('Z', 'Y').to_matrix().to_4x4()), moss_col(9), 'moss')
    for k, (ph, a) in enumerate([(-0.15, 16), (0.47, -5), (0.27, 18)]):
        p = env(ph, math.radians(a)); n = (p - env_c(ph)).normalized()
        flower(A, OB, MAT, p + n * 0.045, r=0.042, seed=k * 2 + 1)

    # ---------------- the shimenawa across the top of the opening: thick, twisted, tied at both ends
    XE = 0.80
    def rz_(x): return 2.10 - 0.13 * (1 - (x / XE) ** 2)
    def ry_(x): return -0.262 - 0.07 * max(0.0, 1 - (x / XE) ** 2) ** 0.6
    rpath = [Vector((x, ry_(x), rz_(x))) for x in (-XE + 2 * XE * k / 16 for k in range(17))]
    ph = {}
    A.add(OB, MAT, rope_tube(rpath, lambda s: 0.058 + 0.02 * math.sin(math.pi * s), K=9, pitch=0.2, phase=ph), rope_col(ph), 'rope')
    for sx in (-1, 1):
        kc = Vector((sx * XE, ry_(XE) + 0.005, rz_(XE)))
        A.add(OB, MAT, ellipsoid(kc, (0.085, 0.07, 0.09), K=9, J=4), lambda p, n: mul(mix(STRAW_DK, STRAW, 0.5 + 0.4 * clamp(n.z)), 0.95), 'rope')
        # the straw tassel (fusa) under each knot, flaring at the cut
        fz = rz_(XE) - 0.06
        fs = lathe([(0.0, 0.0), (0.042, 0.0), (0.06, -0.06), (0.074, -0.17), (0.066, -0.205), (0.0, -0.21)], 9,
                   rfn=lambda rr, z, th: rr * (1 + 0.08 * math.cos(5 * th)))
        fs.xform(Matrix.Translation((sx * (XE + 0.01), ry_(XE) - 0.015, fz)))
        A.add(OB, MAT, fs, lambda p, n: mul(mix(STRAW, STRAW_DK, 0.35 + 0.35 * math.sin(math.atan2(p.y + 0.27, p.x) * 9)),
                                            1 - 0.2 * clamp(-n.z)), 'rope')
    for x in (-0.58, -0.27, 0.27, 0.58):
        top = Vector((x, ry_(x) - 0.04, rz_(x) - 0.05))
        zigzag_shide(A, OB, MAT, top, L=0.25, w=0.07, yaw=0.0)
    # the brass bell (suzu) on a short red cord at the middle
    bz = rz_(0) - 0.205
    A.add(OB, MAT, tube([Vector((0, ry_(0) - 0.01, rz_(0) - 0.03)), Vector((0, ry_(0) - 0.02, bz + 0.075))], lambda s: 0.016, K=5),
          lambda p, n: mul(CORD, 0.9 + 0.15 * clamp(n.z)), 'bell')
    bp = [(0.0, -0.085), (0.045, -0.077), (0.075, -0.045), (0.085, -0.012), (0.074, -0.004), (0.074, 0.006),
          (0.083, 0.02), (0.07, 0.05), (0.04, 0.074), (0.0, 0.082)]
    bell = lathe(bp, 10).xform(Matrix.Translation((0, ry_(0) - 0.025, bz)))
    A.add(OB, MAT, bell, lambda p, n: (mix(GOLD, GOLD_HI, clamp(n.z) * 0.7) if n.z > -0.2 else mix(GOLD, GOLD_LO, 0.6))
          if abs(p.z - bz) > 0.006 else mul(GOLD_LO, 0.7), 'bell')

    # ---------------- the plinth: a rounded paving pad, the threshold step, two chunky feet clasping the ring
    def scol(base, hi, lo, seed, ao=True):
        def f(p, n):
            c = mix(base, hi, clamp(n.z) * 0.55)
            if n.z < 0.3: c = mix(c, lo, clamp(0.3 - n.z) * 0.45)
            c = mul(c, 0.94 + 0.12 * vnoise(p, 3.0, seed))
            if ao: c = mul(c, 1 - 0.2 * (1 - smooth(0.0, 0.07, p.z)))
            m = vnoise(p, 4.5, seed + 5)
            if n.z > 0.6 and m > 0.62: c = mix(c, MOSS, 0.5 * smooth(0.62, 0.75, m))
            return c
        return f
    PAD = '#a89c98'; PAD_HI = '#cfc4bc'
    pad = lathe([(0.0, 0.0), (0.95, 0.0), (1.0, 0.045), (1.0, 0.165), (0.975, 0.212), (0.935, 0.228), (0.0, 0.232)], 32,
                sx=1.36, sy=0.70, e=3.2, th0=math.pi / 32, rfn=lambda rr, z, th: rr * (1 + 0.012 * math.sin(3 * th + 0.5)))
    A.add(OB, MAT, pad, scol(PAD, PAD_HI, STONE_LO, 2), 'plinth')
    stp = lathe([(0.0, 0.2), (0.96, 0.2), (1.0, 0.24), (1.0, 0.315), (0.955, 0.35), (0.86, 0.36), (0.0, 0.362)], 24,
                sx=0.76, sy=0.46, e=2.6, th0=math.pi / 24)
    A.add(OB, MAT, stp, scol(mul(PAD, 1.04), PAD_HI, STONE_LO, 5, ao=False), 'plinth')
    for sx in (-1, 1):
        cx = sx * 1.07
        def fw(p, sx=sx):
            u = p.x / 0.32; v = p.y / 0.36
            return Vector((p.x, p.y, p.z + 0.04 * max(0.0, 1 - u * u) * max(0.0, 1 - v * v) * smooth(0.05, 0.2, p.z)))
        ft = rbox((0.64, 0.72, 0.46), r=0.1, seg=1, extra=(1, 1, 0), warp=fw)
        ft.xform(M_at((cx, 0.0, 0.215 + 0.22), rz=sx * 0.05 + rng.uniform(-0.02, 0.02)))
        def fcol(p, n, sx=sx):
            c = mix(STONE, STONE_HI, clamp(n.z) * 0.55 + clamp(-n.y) * 0.1)
            if n.z < 0.2: c = mix(c, STONE_LO, clamp(0.2 - n.z) * 0.5)
            c = mul(c, 0.94 + 0.12 * vnoise(p, 3.2, 17 + sx))
            c = mul(c, 1 - 0.22 * (1 - smooth(0.22, 0.34, p.z)))
            m = vnoise(p, 3.5, 23 + sx)
            if n.z > 0.5 and m > 0.45: c = mix(c, mix(MOSS, MOSS_HI, clamp(n.z - 0.6)), 0.75 * smooth(0.45, 0.55, m))
            return c
        A.add(OB, MAT, ft, fcol, 'feet')
        A.add(OB, MAT, blob(Vector((cx + sx * 0.12, 0.16, 0.67)), 0.08, 0.06, lobes=4, K=8, seed=7 + sx), moss_col(3), 'tufts')
    # pebbles and tufts round the pad, flowers by the feet
    for i, (px, py, pr) in enumerate([(-1.32, -0.34, 0.06), (1.36, -0.22, 0.055), (-0.62, -0.69, 0.05), (0.95, -0.6, 0.045),
                                      (1.2, 0.5, 0.05)]):
        pb = ellipsoid(Vector((0, 0, 0)), (pr * 1.25, pr, pr * 0.75), K=8, J=3)
        pb.xform(M_at((px, py, pr * 0.76), rz=rng.uniform(0, 3)))
        A.add(OB, MAT, pb, paint(mul(STONE, 0.95 + 0.1 * rng.random()), hi=STONE_HI, top=0.3, bot=0.3, ao_z=0.0, ao_k=0.3, ao_h=0.04), 'pebbles')
    for i, (tx, ty, tz, tr) in enumerate([(-1.2, -0.48, 0.15, 0.09), (1.28, -0.4, 0.13, 0.08), (-0.38, -0.66, 0.12, 0.07),
                                          (0.6, -0.66, 0.12, 0.065)]):
        A.add(OB, MAT, blob(Vector((tx, ty, tz)), tr, 0.08, lobes=4 + i % 2, K=8, seed=i + 3), moss_col(5 + i), 'tufts')
    for k, (fx, fy, fz) in enumerate([(-1.22, -0.5, 0.235), (1.3, -0.42, 0.21), (-0.36, -0.68, 0.19)]):
        flower(A, OB, MAT, Vector((fx, fy, fz)), r=0.045, seed=k * 3 + 2)

    tr = A.tris()
    export(A, 'moon-gate', {'stone': {}})
    print('MP moon-gate inner radius %.3f (kit 0.89), disc r 0.93 at z %.2f' % (RIN, CZ))
    return tr

# ================================================================== 2. the Spirit Lantern
# The kit (src/regions/spiritLantern.js geometry): a hexagonal stone toro, a corner to the front; plinth (2 steps),
# an octagonal pillar with two bands and a shimenawa, the chudai with lotus petals, a firebox of six posts round a paper
# box (r 0.305, 1.36..1.80), a concave hipped slate roof with curled corners, a hoju on top (2.66). The light: 1.58 up.
LIGHT = (0.0, 0.0, 1.58)                       # Blender; the game's (0, 1.58, 0)
def build_spirit_lantern():
    A = Asset(); rng = random.Random(23)
    OB, MAT = 'lantern', 'stone'
    HROT = math.radians(30)                    # hexagon corners at 30 + 60k deg (the front corner at -90)
    ST, ST_HI, ST_LO = '#aca2a4', '#d6ccc4', '#746c7c'
    def lst(lift=0.0, mossy=1.0, seed=0, under=()):
        """lantern stone: light tops, shaded undersides, mottling, moss on the ledges; under: [(z, h)] overhangs
        that shade the stone just below them"""
        def f(p, n):
            k = clamp(0.5 + n.z * 0.38 + (vnoise(p, 3.2, seed) - 0.5) * 0.3 + lift)
            c = mix(ST_LO, ST, clamp(k * 1.7)); c = mix(c, ST_HI, clamp(k * 1.5 - 0.75))
            if mossy and n.z > 0.6:
                m = vnoise(p, 6.0, seed + 3)
                if m > 0.6: c = mix(c, mix(MOSS, MOSS_HI, clamp((m - 0.66) * 4)), mossy * smooth(0.6, 0.64, m))
            if n.z < -0.3: c = mul(c, 0.82)
            c = mul(c, 1 - 0.22 * (1 - smooth(0.0, 0.08, p.z)))
            for zo, h in under: c = mul(c, 1 - 0.22 * smooth(zo - h, zo, p.z) * (1 - smooth(zo, zo + 0.01, p.z)))
            return c
        return f
    def wob(seed, amp=0.006, f=5.0):
        def w(p):
            d = Vector((p.x, p.y, 0.0))
            if d.length < 1e-6: return p
            return p + d.normalized() * (amp * (vnoise(p, f, seed) - 0.5) * 2)
        return w
    # ---------------- the plinth: two chamfered hexagonal steps
    A.add(OB, MAT, ngon_solid(6, [(0.72, 0.06, 0.0), (0.75, 0.06, 0.035), (0.74, 0.06, 0.15), (0.705, 0.06, 0.19), (0.66, 0.05, 0.2)],
                              rot=HROT, arc=2, wob=wob(1)), lst(0.02, 0.8, 1, under=((0.2, 0.0),)), 'plinth')
    A.add(OB, MAT, ngon_solid(6, [(0.55, 0.05, 0.19), (0.575, 0.05, 0.225), (0.56, 0.05, 0.32), (0.53, 0.05, 0.352), (0.49, 0.05, 0.362)],
                              rot=HROT, arc=2, wob=wob(2)), lst(0.06, 0.9, 2), 'plinth')
    # ---------------- the pillar: stout, octagonal, two carved bands; the shimenawa round it with two shide
    def pr(z): return 0.198 - (z - 0.36) / 0.81 * 0.036
    A.add(OB, MAT, ngon_solid(8, [(pr(0.35), 0.03, 0.35), (pr(1.18), 0.03, 1.18)],
                              rot=0.0, arc=2, wob=wob(3, 0.004)), lst(0.0, 0.3, 3, under=((1.165, 0.12),)), 'pillar')
    for zb in (0.5, 1.03):
        R = pr(zb) + 0.042
        A.add(OB, MAT, ngon_solid(8, [(R - 0.02, 0.0, zb - 0.04), (R, 0.0, zb - 0.022), (R, 0.0, zb + 0.022), (R - 0.02, 0.0, zb + 0.04)],
                                  rot=0.0), lst(0.12, 0.0, 4), 'pillar')
    ZR = 0.82; RRING = pr(ZR) + 0.03
    ph = {}
    rpts = [Vector((RRING * math.cos(a), RRING * math.sin(a), ZR + 0.012 * math.sin(2 * a))) for a in (TAU * k / 22 for k in range(22))]
    A.add(OB, MAT, rope_tube(rpts, lambda s: 0.046, K=5, pitch=0.16, amp=0.15, closed=True, phase=ph), rope_col(ph), 'rope')
    for da in (-0.55, 0.55):
        a = -math.pi / 2 + da
        top = Vector((math.cos(a) * (RRING + 0.04), math.sin(a) * (RRING + 0.04), ZR - 0.035))
        zigzag_shide(A, OB, MAT, top, L=0.2, w=0.058, yaw=a + math.pi / 2)
    # ---------------- the chudai (platform) flaring out over a crown of lotus petals
    A.add(OB, MAT, ngon_solid(6, [(0.36, 0.04, 1.15), (0.385, 0.04, 1.175), (0.465, 0.05, 1.25), (0.495, 0.05, 1.285),
                                  (0.48, 0.05, 1.315), (0.445, 0.05, 1.324)], rot=HROT, arc=2, wob=wob(5)), lst(0.1, 0.0, 5), 'chudai')
    for i in range(9):
        a = TAU * i / 9 + HROT + 0.35
        pt = ellipsoid(Vector((0, 0, 0)), (0.11, 0.075, 0.036), K=5, J=3)
        pt.xform(M_at((math.cos(a) * 0.36, math.sin(a) * 0.36, 1.12), rz=a, ry=-0.5))
        A.add(OB, MAT, pt, lambda p, n: mul(mix(mix(ST, '#d8c4cc', 0.35), ST_HI, clamp(n.z + 0.2) * 0.5), 1 - 0.2 * clamp(-n.z)), 'lotus')
    # ---------------- the firebox: sill, six corner posts, lintel; the sleeping paper box; the kumiko lattice
    A.add(OB, MAT, ngon_solid(6, [(0.40, 0.03, 1.312), (0.432, 0.03, 1.33), (0.432, 0.03, 1.368), (0.405, 0.03, 1.384)],
                              rot=HROT, arc=2), lst(0.1, 0.0, 6), 'firebox')
    for i in range(6):
        a = HROT + TAU * i / 6
        A.add(OB, MAT, rbox((0.1, 0.1, 0.43), r=0.025 if math.sin(a) < 0.1 else 0.0, M=M_at((math.cos(a) * 0.335, math.sin(a) * 0.335, 1.59), rz=a)),
              lst(0.04, 0.0, 7 + i, under=((1.79, 0.08),)), 'firebox')
    A.add(OB, MAT, ngon_solid(6, [(0.41, 0.03, 1.786), (0.447, 0.03, 1.806), (0.447, 0.03, 1.856), (0.42, 0.03, 1.876)],
                              rot=HROT, arc=2), lst(0.08, 0.0, 8), 'firebox')
    PZ0, PZ1 = 1.384, 1.786
    A.add(OB, MAT, ngon_solid(6, [(0.296, 0.0, PZ0 - 0.002), (0.296, 0.0, PZ1 + 0.002)], rot=HROT),
          lambda p, n: mix('#d6cce0', '#ebe4ee', smooth(PZ0, PZ1, p.z) * 0.6), 'paper')
    for i in range(6):
        ap = TAU * i / 6                        # the panel's outward normal (between two corners)
        ca, sa = math.cos(ap), math.sin(ap)
        ro = 0.264 + 0.022                      # (the flame's face sits at 0.266; the bars stand proud of it)
        lc = lambda p, n: mul(mix(LATTICE, '#7a6a92', clamp(n.z) * 0.6), 0.9 + 0.12 * clamp(-n.z * 0 + 0.5))
        A.add(OB, MAT, rbox((0.034, 0.03, PZ1 - PZ0), r=0.0, M=M_at((ca * ro, sa * ro, (PZ0 + PZ1) / 2), rz=ap + math.pi / 2)), lc, 'lattice')
        for v in (0.24, 0.76):
            A.add(OB, MAT, rbox((0.27, 0.03, 0.032), r=0.0, M=M_at((ca * ro, sa * ro, PZ0 + (PZ1 - PZ0) * v), rz=ap + math.pi / 2)), lc, 'lattice')
    # the flame: the glowing paper box (its own object, shown lit only when the lantern is lit)
    FB0, FB1 = PZ0 + (PZ1 - PZ0) * 0.24, PZ0 + (PZ1 - PZ0) * 0.76
    A.add('flame', 'flame_glow', ngon_solid(6, [(0.307, 0.0, PZ0), (0.307, 0.0, FB0)], rot=HROT), '#dccdfc', 'flame')
    A.add('flame', 'flame_core_glow', ngon_solid(6, [(0.307, 0.0, FB0), (0.307, 0.0, FB1)], rot=HROT), '#f6efff', 'flame')
    A.add('flame', 'flame_glow', ngon_solid(6, [(0.307, 0.0, FB1), (0.307, 0.0, PZ1)], rot=HROT), '#dccdfc', 'flame')

    # ---------------- the roof (kasa): dark slate, concave hipped slopes, hip ridges, corners curling up, thick eaves
    T0, RE = 0.065, 0.82
    def hexf(th):
        d = (th % (math.pi / 3)) - math.pi / 6           # the angle from the nearest edge normal... (edge normals at 60k)
        d = ((th + math.pi / 6) % (math.pi / 3)) - math.pi / 6
        return math.cos(math.pi / 6) / math.cos(d)
    def cdist(th):                                       # angular distance to the nearest corner (30 + 60k)
        return abs(((th - HROT + math.pi / 6) % (math.pi / 3)) - math.pi / 6)
    def ztop(t, th):
        r = RE * t * hexf(th); rn = r / RE
        z = 1.84 + 0.52 * (1 - (t - T0) / (1 - T0))
        z -= rn * (1 - rn) * 0.28
        z += abs(math.sin(3 * (th - HROT) + math.pi / 2)) ** 8 * rn ** 3 * 0.12
        z += 0.042 * math.exp(-((r * cdist(th)) / 0.045) ** 2) * smooth(0.0, 0.2, t)
        return z
    def RP(t, th):
        r = RE * t * hexf(th)
        return Vector((r * math.cos(th), r * math.sin(th), ztop(t, th)))
    rth = []
    for k in range(6):
        c = HROT + k * math.pi / 3
        rth += [c - math.radians(18), c - math.radians(6), c, c + math.radians(6), c + math.radians(18)]
    rth = sorted(x % TAU for x in rth)
    ts = [T0, 0.2, 0.4, 0.6, 0.8, 1.0]
    rings, cs = [], []
    for t in ts:
        rings.append([RP(t, th) for th in rth]); cs.append(Vector((0, 0, 1.95)))
    # the eave rim: bulge out a touch, then down 6.5 cm, then the underside back in
    rings.append([RP(1.0, th) + Vector((math.cos(th), math.sin(th), 0)) * 0.012 + Vector((0, 0, -0.03)) for th in rth]); cs.append(Vector((0, 0, 1.95)))
    rings.append([RP(1.0, th) + Vector((0, 0, -0.085)) for th in rth]); cs.append(Vector((0, 0, 1.95)))
    rings.append([RP(0.9, th) + Vector((0, 0, -0.092)) for th in rth]); cs.append(Vector((0, 0, 1.95)))
    rings.append([Vector((0.5 * RE * hexf(th) * math.cos(th), 0.5 * RE * hexf(th) * math.sin(th), 1.86)) for th in rth]); cs.append(Vector((0, 0, 1.95)))
    rf = Tmp(); ring_surface(rf, rings, cs, pole0=Vector((0, 0, ztop(0.0, 0.0) + 0.012)), pole1=Vector((0, 0, 1.865)))
    def roof_col(p, n):
        if n.z < -0.4: return mul(SLATE_LO, 0.95)
        r = math.hypot(p.x, p.y); th = math.atan2(p.y, p.x)
        face = 0.86 + 0.2 * (n.x * -0.45 + n.y * -0.6 + n.z * 0.3)          # each slope its own shade
        c = mix(SLATE, SLATE_HI, clamp(0.3 + (vnoise(p, 4.0, 13) - 0.5) * 0.5))
        c = mul(c, face)
        rr = r * cdist(th)
        c = mix(c, '#a49ec2', 0.8 * math.exp(-(rr / 0.04) ** 2) * smooth(0.1, 0.25, r))   # the hip ridges, paler
        if n.z < 0.35 and r > 0.7: c = mul(SLATE_LO, 1.1)                                    # the eave rim
        return c
    A.add(OB, MAT, rf, roof_col, 'roof')
    # warabite: a fern-curl rolled up at each corner
    for k in range(6):
        c = HROT + k * math.pi / 3; cx, cy = math.cos(c), math.sin(c)
        zc = ztop(1.0, c)
        pts = []
        for j in range(5):
            t = j / 4; ang = t * 4.4; rr = 0.07 * (1 - t * 0.45)
            pts.append(Vector((cx * (RE - 0.03 + math.sin(ang) * rr), cy * (RE - 0.03 + math.sin(ang) * rr), zc - 0.035 + rr - math.cos(ang) * rr)))
        A.add(OB, MAT, tube(pts, lambda s: 0.044 * (1 - s * 0.4), K=5), lambda p, n: mix(SLATE_HI, '#a49ec0', clamp(n.z)), 'warabite')
    # the moss icing on the roof's crown, drips running down the slopes
    rdr = [(math.radians(a), L, w) for a, L, w in
           [(-62, 0.2, 0.27), (-118, 0.15, 0.25), (-5, 0.11, 0.24), (55, 0.16, 0.26), (125, 0.13, 0.25), (178, 0.17, 0.26)]]
    def rb(th):
        e = 0.46 + 0.04 * math.sin(3 * th + 0.7) + 0.025 * math.sin(5 * th + 1.9)
        for th_d, L, wd in rdr:
            d = math.atan2(math.sin(th - th_d), math.cos(th - th_d)) / wd
            if abs(d) < 1: e += L * (1 - d * d) ** 0.4
        return e
    def RF(th, s):
        return RP(T0 * 0.5 + s * (rb(th) - T0 * 0.5), th)
    mths = sorted(set([round(x, 6) for x in rth] + [round(x % TAU, 6) for x in drip_angles(8, rdr, offs=(-0.6, 0.0, 0.6))]))
    out = []
    for x in mths:
        if not out or x - out[-1] > 0.03: out.append(x)
    def rthk(th, s):
        q = Vector((math.cos(th) * s * 3.2, math.sin(th) * s * 3.2, 0.0))
        return 0.03 + 0.012 * smooth(0.5, 1.0, s) + 0.022 * vnoise(q, 1.0, 5) * smooth(0.1, 0.4, s)
    A.add(OB, MAT, drape2(RF, lambda th, s: RF(th, s) - Vector((0, 0, 1.6)), rthk, out, J=3, sink=0.02, bead=True), moss_col(7), 'moss')
    for k, (a, t) in enumerate([(-75, 0.32), (40, 0.36)]):
        p = RP(t, math.radians(a))
        A.add(OB, MAT, blob(p + Vector((0, 0, 0.02)), 0.07, 0.055, lobes=4 + k % 2, K=8, seed=k + 11), moss_col(12), 'moss')
    # the hoju: a collar and an onion jewel with its point
    hj = [(0.0, 2.255), (0.13, 2.255), (0.138, 2.29), (0.098, 2.365), (0.122, 2.43),
          (0.1, 2.51), (0.052, 2.59), (0.0, 2.66)]
    A.add(OB, MAT, lathe(hj, 8, th0=HROT), lambda p, n: mul(mix(ST, ST_HI, clamp(n.z * 0.6 + 0.35)), 1 - 0.25 * clamp(-n.z))
          if p.z > 2.37 or p.z < 2.33 else mul(ST_LO, 1.05), 'hoju')
    # two violet silk tassels hanging from the front corners of the roof
    for c in (HROT - math.pi / 3, HROT - math.pi):        # (-30 and -150 deg: either side of the front corner)
        x, y = math.cos(c) * 0.75, math.sin(c) * 0.75
        zu = ztop(0.75 / RE / hexf(c), c) - 0.07
        A.add(OB, MAT, tube([Vector((x, y, zu)), Vector((x * 1.02, y * 1.02, 1.79))], lambda s: 0.016, K=4),
              lambda p, n: TASSEL, 'tassels')
        ts_ = lathe([(0.0, 1.80), (0.034, 1.785), (0.026, 1.745), (0.046, 1.6), (0.0, 1.578)], 6)
        ts_.xform(Matrix.Translation((x * 1.02, y * 1.02, 0)))
        A.add(OB, MAT, ts_, lambda p, n, x=x, y=y: mul(mix(TASSEL, TASSEL_HI, clamp((p.z - 1.6) * 5) * 0.55 + clamp(n.z) * 0.3),
                                                       0.86 if math.sin(math.atan2(p.y - y * 1.02, p.x - x * 1.02) * 10) > 0.6 and p.z < 1.73 else 1.0), 'tassels')

    tr = A.tris()
    export(A, 'spirit-lantern', {'stone': {}, 'flame_glow': dict(emission='#dccdfc'), 'flame_core_glow': dict(emission='#f6efff')})
    print('MP spirit-lantern light point blender %s game (%.2f, %.2f, %.2f)' % (LIGHT, LIGHT[0], LIGHT[2], -LIGHT[1]))
    return tr

# ================================================================== the kit stand-ins (for the kit comparison renders)
# Quick rebuilds of the code kit's shapes (portalModel.js frameGeometry, spiritLantern.js geometry) with their flat
# colours, written to the task folder only (kit-moon-gate.glb, kit-spirit-lantern.glb).
def build_kit_standins():
    A = Asset(); OB, MAT = 'kit', 'stone'
    sc = lambda hi, lo: (lambda p, n: mix(lo, hi, clamp(0.5 + n.z * 0.3)))
    ring = [Vector((1.08 * math.sin(a), 0.0, 1.22 + 1.08 * math.cos(a))) for a in (TAU * k / 48 for k in range(48))]
    A.add(OB, MAT, tube_loop(ring, lambda s: 0.19, K=12, up=Y), lambda p, n: mix('#c2b6a6', '#7f9a55', 0.55) if n.z > 0.5 else mix('#7a6f64', '#c2b6a6', clamp(0.5 + n.z * 0.3)), 'ring')
    A.add(OB, MAT, lathe([(0.0, 0.0), (1.12, 0.0), (1.0, 0.22), (0.0, 0.22)], 28, sy=0.55), sc('#c2b6a6', '#7a6f64'), 'slab')
    A.add(OB, MAT, lathe([(0.0, 0.21), (0.7, 0.21), (0.62, 0.33), (0.0, 0.33)], 24, sy=0.6), sc('#c2b6a6', '#7a6f64'), 'slab')
    rp = [Vector((u * 1.5, -0.12, 2.16 - 0.16 * (1 - (2 * u) ** 2))) for u in (k / 10 - 0.5 for k in range(11))]
    A.add(OB, MAT, tube(rp, lambda s: 0.055 + 0.02 * (1 - abs(2 * s - 1)), K=7), lambda p, n: '#c0a472', 'rope')
    for x in (-0.45, 0.0, 0.45):
        y0 = 2.05 - 0.16 * (1 - (2 * x / 1.5) ** 2) - 0.02
        A.add(OB, MAT, rbox((0.1, 0.01, 0.28), r=0.0, M=M_at((x, -0.14, y0 - 0.14))), lambda p, n: '#fffaf0', 'shide')
    A.add(OB, MAT, ellipsoid(Vector((0, -0.16, 1.84)), (0.075, 0.075, 0.075), K=12, J=8), lambda p, n: mix('#e8b84a', '#fff0b0', clamp(n.z)), 'bell')
    export(A, 'kit-moon-gate', {'stone': {}}, out_dir=TASK_DIR)

    A = Asset(); HR = math.radians(30)
    S = lambda p, n: mix('#6c6862', '#c4beb0', clamp(0.5 + n.z * 0.4))
    hexs = lambda rt, rb, h, y, n=6: ngon_solid(n, [(rb, 0.0, y - h / 2), (rt, 0.0, y + h / 2)], rot=HR if n == 6 else 0.0)
    for g in (hexs(0.66, 0.74, 0.2, 0.1), hexs(0.5, 0.57, 0.16, 0.28), hexs(0.16, 0.19, 0.8, 0.76, 8), hexs(0.2, 0.2, 0.05, 0.5, 8),
              hexs(0.2, 0.2, 0.05, 1.02, 8), hexs(0.48, 0.38, 0.15, 1.24), hexs(0.41, 0.43, 0.07, 1.345), hexs(0.44, 0.41, 0.08, 1.83)):
        A.add(OB, MAT, g, S, 'stone')
    for i in range(6):
        a = HR + TAU * i / 6
        A.add(OB, MAT, rbox((0.1, 0.1, 0.48), r=0.0, M=M_at((math.cos(a) * 0.34, math.sin(a) * 0.34, 1.565), rz=a)), S, 'posts')
    A.add(OB, MAT, ngon_solid(6, [(0.305, 0.0, 1.36), (0.305, 0.0, 1.8)], rot=HR), lambda p, n: '#fff6fc', 'paper')
    def rz(r, th):
        rn = r / 0.82
        return 1.84 + 0.52 * (0.82 - r) / 0.77 - rn * (1 - rn) * 0.28 + abs(math.sin(3 * th)) ** 8 * rn ** 3 * 0.16
    t = Tmp(); rings = []; cs = []
    for r in (0.05, 0.2, 0.4, 0.6, 0.82):
        rings.append([Vector((r * math.cos(th), r * math.sin(th), rz(r, th))) for th in (TAU * k / 36 for k in range(36))]); cs.append(Vector((0, 0, 2.0)))
    rings.append([Vector((0.8 * math.cos(th), 0.8 * math.sin(th), 1.83)) for th in (TAU * k / 36 for k in range(36))]); cs.append(Vector((0, 0, 2.0)))
    ring_surface(t, rings, cs, Vector((0, 0, 2.37)), Vector((0, 0, 1.83)))
    A.add(OB, MAT, t, lambda p, n: '#4c4860' if n.z > 0 else '#2e2c3a', 'roof')
    A.add(OB, MAT, lathe([(0.0, 2.28), (0.12, 2.28), (0.08, 2.36), (0.115, 2.45), (0.06, 2.58), (0.0, 2.66)], 10), S, 'hoju')
    rr = [Vector((0.22 * math.cos(a), 0.22 * math.sin(a), 0.86)) for a in (TAU * k / 24 for k in range(24))]
    A.add(OB, MAT, tube_loop(rr, lambda s: 0.042, K=6), lambda p, n: '#d8bc6c', 'rope')
    export(A, 'kit-spirit-lantern', {'stone': {}}, out_dir=TASK_DIR)
    return 0

# ================================================================== main
if __name__ == '__main__':
    done = {}
    if PIECE in ('moon-gate', 'all'): done['moon-gate'] = build_moon_gate()
    if PIECE in ('spirit-lantern', 'all'): done['spirit-lantern'] = build_spirit_lantern()
    if PIECE in ('kit', 'all'): done['kit'] = build_kit_standins()
    print('MP done', done)
