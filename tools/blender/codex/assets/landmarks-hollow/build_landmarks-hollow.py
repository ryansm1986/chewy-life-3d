# PAWHAVEN: Blossom Hollow's landmark buildings (task landmarks-hollow), built in Blender by script.
#   blender --background --factory-startup --python build_landmarks-hollow.py -- --piece rosieShop|chewyHouse-1|...|all
# Deterministic: seeded PRNGs only; a re-run reproduces every GLB exactly.
# Frame: 1 unit = 1 m, Blender Z up, the front (the door side) faces -Y (the glTF exporter makes it the game's +z),
# centred on the kit's footprint origin (src/world/buildings/special.js). The layout code is written in the kit's game
# frame (x, y up, z front) and mapped to Blender (x, -z, y).
# Technique and the shared kit come from the Adventurers' Guild (tools/blender/codex/assets/guild-model): a mesh
# accumulator with per-vertex painted colours (attribute `Col`), rounded boxes with analytic normals, lathes, tubes,
# sweeps, blobs, the roof maths ported from roofs.js with crisp tile courses.
import bpy, bmesh, math, os, sys, random
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..', '..'))
MODELS = os.path.join(REPO, 'public', 'models')
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
PIECE = argv[argv.index('--piece') + 1] if '--piece' in argv else 'all'
print('LH build pid', os.getpid())
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
    eps = min(0.022, R['course'] * 0.07) / slopeLen         # (each course step: a short riser on the slope)
    hip0 = not f.get('open0') and math.hypot(E0[0] - R0[0], E0[1] - R0[1]) > 1e-6 and abs((E0[0] - R0[0]) * dr[1] - (E0[1] - R0[1]) * dr[0]) < 0.999 * math.hypot(E0[0] - R0[0], E0[1] - R0[1])
    hip1 = not f.get('open1') and math.hypot(E1[0] - R1[0], E1[1] - R1[1]) > 1e-6 and abs((E1[0] - R1[0]) * dr[1] - (E1[1] - R1[1]) * dr[0]) < 0.999 * math.hypot(E1[0] - R1[0], E1[1] - R1[1])
    TW = f.get('hipTaper', 0.16)
    def taper(s, t):
        """rolls and courses ease flat toward a hip edge, so neighbouring faces meet cleanly under the hip cap"""
        if not (hip0 or hip1): return 1.0
        wx = lerp(E1[0], R1[0], t) - lerp(E0[0], R0[0], t); wz = lerp(E1[1], R1[1], t) - lerp(E0[1], R0[1], t); W_ = math.hypot(wx, wz)
        k = 1.0
        if hip0: k = min(k, smooth(0.0, TW, s * W_))
        if hip1: k = min(k, smooth(0.0, TW, (1 - s) * W_))
        return k
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
        if f.get('rise'): y += f['rise'] * (1 - smooth(t0 + 0.06, t0 + 0.32, t))   # (bendUnder irimoya: the gable part rides over the hips)
        rib = fr = 0.0
        if mode == 0:
            rib = RIB[i % 3] if i is not None else 0.6
            tp = taper(s, t)
            y += rib * R['ribAmp'] * tp
            if step > 0:
                u = t / step + 1e-4; fr = u - math.floor(u); y += (1 - fr) * R['courseAmp'] * tp
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
        if R['bend'] and R['thick'] < R['curve'] * R['H']:   # (opt-in bendUnder: a strongly curved face's underside follows the
            for q in (1.0, 0.75, 0.5, 0.25):      #  curve too, else its straight chord ridge->eave pokes up through the tiles; hollow-craft)
                loop.append(F.W(P(s, lerp(t0, t1, q), 1)[0])); lc.append(mul(R['under'], 0.85))
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
            g = newell(face)                                    # a course riser: crisp, but eased toward the slope
            return [(g * 0.55 + n0s[where[v][0]][where[v][1]] * 0.45).normalized() for v in face]
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
            dk = lathe([(0.0, -dep / 2), (r, -dep / 2), (r * 0.9, dep / 2), (0.0, dep / 2 + 0.01)], 5, th0=PI / 5 + 0.3)
            q = Z.rotation_difference(F.N(tuple(D)))
            dk.xform(Matrix.Translation(F.W(tuple(c))) @ q.to_matrix().to_4x4())
            body, mon = R['disc'], R['mon']
            nv = len(dk.v)                                              # (rings: back rim, front rim, mon ring; poles last)
            dk.c = [mul(body, 0.8)] * 5 + [mix(body, '#fff6ee', 0.3)] * 5 + [mul(body, 0.7), mon]
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
    hiC = mix(capc, '#fff4f4', 0.4)
    add(box(L + 0.1, 0.18 * k, 0.3 * k, ((x0 + x1) / 2, y + 0.06 * k, 0), r=0.07 * k), paint(capc, hi=hiC, top=0.3, bot=0.3), 'ridge')
    add(box(L + 0.12, 0.07 * k, 0.22 * k, ((x0 + x1) / 2, y + 0.17 * k, 0), r=0.03 * k), paint(mul(capc, 1.18), hi=mix(capc, '#fff8f4', 0.55), top=0.4), 'ridge')
    for yy in (0.02, 0.085):                            # the stacked noshi courses: a dark line along both sides
        add(box(L + 0.05, 0.03 * k, 0.3 * k + 0.02, ((x0 + x1) / 2, y + yy * k, 0), r=0.0), flat(mul(capc, 0.72)), 'ridge')
    if not oni: return
    if R.get('shachi'):
        for x, s in ((x0, -1), (x1, 1)): shachi(x - s * 0.02, y + 0.12 * k, s, k)
        return
    for x, s in ((x0, -1), (x1, 1)):
        with at((x + s * 0.02, y, 0), s=k):
            add(beam(0.14, 0.32, 0.38, (0, 0.16, 0), c=0.065), paint(capc, hi=hiC, top=0.3), 'oni')
            for sz in (-1, 1):
                add(sph(0.075, (0, 0.31, sz * 0.13), sc=(0.85, 1.25, 0.85), K=5, J=3), paint(capc, hi=mix(capc, '#fff4f4', 0.5), top=0.4), 'oni')
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
        kind = o.get('gable', 'ornate')
        fill = o.get('gableColor', PAL['wall']) if kind == 'plaster' else o.get('gableWood', '#9c7458') if kind == 'wood' else o.get('gableFill', '#8a4a3a')
        yb_, yt_ = yBase, yUnder(1)
        if kind in ('plaster', 'wood'):                 # plaster (or boards): a warm shade high under the ridge
            Mi_ = F.m.inverted()
            add(prism(poly, 0.06, -0.01), lambda p, n: mul(mix(fill, mul(fill, 0.86), smooth(yb_ + 0.2, yt_, (GMi @ (Mi_ @ p)).y)), 0.94 + 0.08 * clamp(n.z + 0.5)), 'gable')
        else:
            add(prism(poly, 0.06, -0.01), lambda p, n: mul(fill, 0.85 + 0.2 * clamp(n.z + 0.5)), 'gable')
    hTri = yUnder(1) - yBase
    if hTri < 0.25: return hTri
    wx = X + sx * 0.02
    tim = o.get('timber', PAL['frameLo'])
    add(beam(0.08, 0.1, zMax * 1.9, (wx, yBase + 0.05, 0), c=0.03), wood(tim), 'gable')
    if kind in ('plaster', 'wood'):
        with at((wx, yBase, 0), ry=sx * PI / 2):
            if kind == 'wood':                          # board seams across the gable
                for j in range(1, int(hTri / 0.18)):
                    yy = j * 0.18; half = zMax * max(0.0, 1 - yy / hTri) - 0.06
                    if half > 0.08: add(box(2 * half, 0.022, 0.012, (0, yy, -0.004), r=0.0), flat(mul(fill, 0.7)), 'gable')
            if o.get('vent', True) and hTri > 0.5:    # the round vent window: a glowing pane, a timber ring, a cross
                vr = min(0.2, hTri * 0.28); vy = hTri * 0.42
                add(glathe([(0.0, 0.0), (vr * 0.97, 0.0), (vr * 0.97, 0.03), (0.0, 0.03)], 10, rx=PI / 2, pos=(0, vy, -0.01)), lambda p, n: PAL['paper'], 'gable', glow=True)
                add(gloop(circle(vr, 10, 0.035, 0.0, vy, a0=PI / 10), 0.045, K=4, up=F.N((0, 0, 1))), wood(tim), 'gable')
                add(box(0.035, vr * 1.8, 0.03, (0, vy, 0.03), r=0.0), flat(tim), 'gable')
                add(box(vr * 1.8, 0.035, 0.03, (0, vy, 0.03), r=0.0), flat(tim), 'gable')
            else:
                add(beam(0.08, hTri * 0.9, 0.06, (0, hTri * 0.45, 0.0), c=0.02), wood(tim), 'gable')
        return hTri
    # gold gegyo: a disc, a drop and two curled wings
    with at((wx + sx * 0.03, yBase + hTri * 0.62, 0), ry=sx * PI / 2):
        add(glathe([(0.0, -0.03), (0.16, -0.03), (0.15, 0.03), (0.0, 0.035)], 9, rx=PI / 2), lac(PAL['gold']), 'gegyo')
        add(glathe([(0.0, 0.0), (0.09, 0.07), (0.0, 0.2)], 5, rx=PI, pos=(0, -0.12, 0.0)), lac(PAL['gold']), 'gegyo')
        for s in (-1, 1):
            add(sph(0.075, (s * 0.2, 0.03, 0.0), sc=(1.3, 0.8, 0.5), K=6, J=3, rz=s * 0.5), lac(PAL['gold']), 'gegyo')
    return hTri

def roof_pal(base, pastel=0.12, contrast=1.0):
    """a roof's paint from its kit colour (roofs.js: colour lerped toward #f6eef4 by `pastel`, edge = 42% cream)"""
    c = mix(base, '#f6eef4', pastel)
    trim = mul(mix(base, '#f6eef4', pastel * 0.5), 0.86)
    return dict(color=c, hi=mix(c, '#fff4ec', 0.3 * contrast), groove=mix(c, mix(mul(c, 0.7), base, 0.15), contrast), shadow=mix(c, mul(c, 0.6), contrast),
                edge=mix(base, '#fff6ea', 0.42), under='#9a6a52', trim=trim,
                disc=mix(trim, mix(base, '#fff6ea', 0.42), 0.55), cap=mix(mul(trim, 0.9), '#f6eef4', 0.1))

def roof(o):
    """o: type (skirt | irimoya | shed | hip | gable), ridge ('z': a gable ridge along z), w, d, y0, over, H, curve,
    lift, liftW, thick, ribW, ribAmp, course, courseAmp, tTop, tg, gOver, rich, color, pastel, gable, gableColor, vent,
    oni; returns the roof's frame info (yb, ridgeY, topY, openW, openD, yAt, underAt) in the caller's frame"""
    if o['type'] in ('gable', 'shed') and o.get('ridge') == 'z':
        F.push((0, 0, 0), ry=PI / 2)
        info = roof(dict(o, w=o['d'], d=o['w'], ridge=None))
        F.pop()
        yA, uA = info['yAt'], info['underAt']
        info['yAt'] = lambda x, z: yA(-z, x); info['underAt'] = lambda x, z: uA(-z, x)
        return info
    typ = o['type']
    if typ == 'shed':
        pass
    over = o.get('over', 0.5)
    A_, Bz = o['w'] / 2 + over, o['d'] / 2 + over
    R = dict(H=o['H'], curve=o['curve'], lift=o['lift'], liftW=o['liftW'], thick=o['thick'], ribW=o['ribW'],
             ribAmp=o.get('ribAmp', 0.05), course=o.get('course', 0.34), courseAmp=o.get('courseAmp', 0.035),
             rich=o.get('rich', 2), seed=o.get('seed', 7), shachi=o.get('shachi', False),
             bend=o.get('bendUnder', False))   # (opt-in: roof_face's curve-following underside)
    RP = roof_pal(o.get('color', '#558f8e'), o.get('pastel', 0.12), o.get('contrast', 1.0))
    R.update(color=RP['color'], hi=RP['hi'], groove=RP['groove'], shadow=RP['shadow'], edge=RP['edge'], under=RP['under'])
    R['k'] = o.get('k', clamp(Bz / 1.35, 0.22, 1.25))
    R['ends'] = R['ribW'] >= 0.19 and R['k'] >= 0.3
    R['discR'] = clamp(min(R['ribW'] * 0.34, R['thick'] * 0.56), 0.04, 0.1)
    R['trim'] = RP['trim']; R['disc'] = RP['disc']; R['cap'] = o.get('cap', RP['cap'])
    R['mon'] = mix(R['disc'], '#d0962e', 0.85) if R['rich'] >= 2 else mul(R['disc'], 0.72)
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
        rise = (R['ribAmp'] + R['courseAmp']) * 1.2 if R['bend'] else 0.0   # (opt-in: lifts the gable part off the hip faces' tiles)
        roof_face(R, dict(E0=(-X, Bz), E1=(X, Bz), R0=(-X, 0), R1=(X, 0), t0=t0, t1=1.0, c0=True, c1=True, d0=(-1, 0.5), d1=(1, 0.5),
                          eave=True, open0=True, open1=True, barge=True, lift=upl, fi=5, discs=False, rise=rise))
        roof_face(R, dict(E0=(X, -Bz), E1=(-X, -Bz), R0=(X, 0), R1=(-X, 0), t0=t0, t1=1.0, c0=True, c1=True, d0=(1, -0.5), d1=(-1, -0.5),
                          eave=True, open0=True, open1=True, barge=True, lift=upl, fi=6, discs=False, rise=rise))
        yTop = R['yb'] + R['H'] * prof(tg, R['curve']) + R['ribAmp'] * 0.5
        for sx in (-1, 1): gable_tri(R, o, sx * xg, sx, tg, Bz, yTop)
        ridge(R, -X - 0.05, X + 0.05, R['yb'] + R['H'], oni=o.get('oni', True))
        out.update(xg=xg, X=X)
    elif typ == 'gable':                              # (roofs.js gable: two slopes, the gable ends at x = +-w/2)
        X = o['w'] / 2 + o.get('gOver', 0.35)
        roof_face(R, dict(E0=(-X, Bz), E1=(X, Bz), R0=(-X, 0), R1=(X, 0), t0=0.0, t1=1.0, c0=True, c1=True, d0=(-1, 0.4), d1=(1, 0.4),
                          eave=True, open0=True, open1=True, barge=True, fi=3))
        roof_face(R, dict(E0=(X, -Bz), E1=(-X, -Bz), R0=(X, 0), R1=(-X, 0), t0=0.0, t1=1.0, c0=True, c1=True, d0=(1, -0.4), d1=(-1, -0.4),
                          eave=True, open0=True, open1=True, barge=True, fi=4))
        for sx in (-1, 1):
            if o.get('skipGable') != sx: gable_tri(R, o, sx * o['w'] / 2, sx, 0.0, Bz, o['y0'])
        ridge(R, -X - 0.05, X + 0.05, R['yb'] + R['H'], oni=o.get('oni', True))
        yAt = lambda x, z: R['yb'] + R['H'] * prof(clamp((Bz - abs(z)) / Bz), R['curve'])
        out.update(X=X)
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
        if typ in ('gable', 'shed'):
            Xg = o['w'] / 2 + o.get('gOver', 0.35)
            t = clamp((Bz - abs(z)) / Bz) if typ == 'gable' else clamp((Bz - z) / (2 * Bz))
            dc, eL = Xg - abs(x), 2 * Xg
            Wl = min(R['liftW'], eL * 0.28)
            return yAt(x, z) + R['lift'] * math.exp(-(max(0, dc) ** 2) / (Wl * Wl)) * (1 - t) ** 2 - R['thick']
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
    add(box(w, h, d, (0, y0 + h / 2, 0), r=0.04, extra=(0, 0, 2)), wall_col, 'walls')
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
    if o.get('rail') and not o.get('koshi'):
        for (W_, D_, sd) in ((w + 0.04, d + 0.04, 0), (d + 0.04 - 0.12, w + 0.04, 1)):
            for sg in (-1, 1):
                with at((0, 0, 0), ry=sd * PI / 2): add(box(W_, 0.06, 0.06, (0, y0 + h * o.get('railAt', 0.36), sg * (D_ / 2 - 0.03)), r=0.0), wood(frame), 'timber')
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
            fb = blob(F.W((x, 0.11 + rng.uniform(0, 0.03), rng.uniform(-0.02, 0.04))), 0.06, 0.045, lobes=3, K=6, seed=i * 3 + seed, amp=0.3)
            fb.c = [mul(c, 0.85)] * 6 + [mix(c, '#fff6ea', 0.15)] * 6 + [mul(c, 0.8), '#ffd24a' if c != '#ffd24a' else '#ff9a3a']
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

def noren(w=0.94, h=0.48, y=1.33, z=0.17, color=None, strips=3, sym_scale=0.24, tag='noren', sym='paw'):
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
    if sym == 'sakura': sakura_mark(sym_scale, (0, y - h * 0.45, z + 0.03), depth=0.016, col='#fff4e6', eye='#ffb0c8', tag=tag)
    else: paw(sym_scale, (0, y - h * 0.45, z + 0.032), depth=0.016, col='#fff4e6', tag=tag)

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
def crate(s=0.36, wd='#e2b988', tag='crates', seed=0):
    hh = s * 0.85
    add(beam(s, hh, s, (0, hh / 2, 0), c=0.03), lambda p, n: mul(wd, (0.92 + 0.1 * clamp(n.z)) * (1 - 0.18 * (1 - smooth(0, 0.1, p.z)))), tag)
    for side in (0, 1):
        with at((0, 0, 0), ry=side * PI / 2):
            add(box(s * 0.82, 0.045, s + 0.02, (0, hh * 0.5, 0), r=0.0, rz=0.6 if side else -0.6), flat(mul(wd, 0.78)), tag)
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
def foundation(w, d, h, pad=0.12, seed=1, color='#a89ca8', gap=0.68):
    W_, D_ = w + pad, d + pad
    # the plinth, with a buried skirt to z = -0.3
    add(beam(W_ - 0.06, h + 0.3, D_ - 0.06, (0, (h - 0.3) / 2, 0), c=0.06),
        lambda p, n: mul(mix(color, mix(color, '#f4eef4', 0.3), clamp(n.z)), 0.8 + 0.2 * smooth(-0.05, h, p.z)), 'foundation')
    rng = random.Random(seed)
    per = 2 * (W_ + D_); n = max(8, round(per / gap))
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

# ================================================================== more kit parts (parts.js / props*.js / trim.js, chunky)
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

def heart(size, pos=(0, 0, 0), depth=0.03, col='#ff6f8f', tag='sym'):
    with at(pos):
        add(puffy(heart_poly(size), depth, bev=min(0.02, depth * 0.5)), lambda p, n: mix(mul(col, 0.86), mix(col, '#fff0f4', 0.25), clamp(-n.y * 0.6 + n.z * 0.4 + 0.3)), tag)

def arch_wall(outer, inner, z0, z1, col, tag, glow=False):
    """a closed wall slab with an arched opening: outer and inner are matching open polylines (x, y) in the face frame
    (a U round the opening), extruded z0..z1. Split normals: flat front and back, the reveal and the outer edge shade
    round."""
    t = Tmp(); N = len(outer)
    fo = [t.vert(F.W((x, y, z1))) for x, y in outer]; fi = [t.vert(F.W((x, y, z1))) for x, y in inner]
    bo = [t.vert(F.W((x, y, z0))) for x, y in outer]; bi = [t.vert(F.W((x, y, z0))) for x, y in inner]
    nf, nb = F.N((0, 0, 1)), F.N((0, 0, -1))
    grp = {}
    def quad(q, hint, g):
        t.face(q, hint); grp[frozenset(q)] = g
    for i in range(N - 1):
        quad([fi[i], fi[i + 1], fo[i + 1], fo[i]], nf, 'f')
        quad([bi[i], bo[i], bo[i + 1], bi[i + 1]], nb, 'b')
        quad([fi[i], bi[i], bi[i + 1], fi[i + 1]], Vector((0, 0, 0)) - (t.v[fi[i]] - t.v[fo[i]]), 'ri')
        quad([fo[i], fo[i + 1], bo[i + 1], bo[i]], t.v[fo[i]] - t.v[fi[i]], 'ro')
    for k in (0, N - 1):
        quad([fi[k], fo[k], bo[k], bi[k]], F.N((0, -1, 0)), 'e')
    def cn(face):
        g = grp.get(frozenset(face))
        if g == 'f': return [nf] * len(face)
        if g == 'b': return [nb] * len(face)
        P_ = [t.v[v] for v in face]; nn = Vector((0, 0, 0))
        for q in range(len(P_)):
            a_, b_ = P_[q], P_[(q + 1) % len(P_)]
            nn += Vector(((a_.y - b_.y) * (a_.z + b_.z), (a_.z - b_.z) * (a_.x + b_.x), (a_.x - b_.x) * (a_.y + b_.y)))
        return [nn.normalized()] * len(face)
    t.cn = cn
    A.add(GLOW if glow else OB, GLOW if glow else 'body', t, col, tag)
    return t

def door_round(w, h, wd, frame, tag='door'):
    """the kit's arched cottage door (parts.js door 'round'): a dark arched recess, the planked slab, a porthole, a
    brass knob, and the timber arch on posts framing it (face frame, bottom at y = 0)"""
    yc = h - w / 2; R = w / 2 - 0.06
    def arch(r, n=10): return [(r, 0.0)] + arc_pts(0, yc, r, 0.0, PI, n) + [(-r, 0.0)]
    add(prism(arch(w / 2 - 0.03), 0.03, 0.0), flat(mul(frame, 0.55)), tag)
    add(puffy(arch(R), 0.09, bev=0.022, z0=0.02), lambda p, n: mix(mul(wd, 0.86), mix(wd, '#fff0f0', 0.2), clamp(n.z * 0.5 + 0.5 - 0.3 * n.y)), tag)
    for x in [s * min(0.14, R * 0.56) for s in (-1, 1)]:
        top = yc + math.sqrt(max(0.0, R * R - x * x)) - 0.06
        add(box(0.026, top - 0.06, 0.012, (x, 0.06 + (top - 0.06) / 2, 0.112), r=0.0), flat(mul(wd, 0.72)), tag)
    pr = min(0.13, R * 0.5)
    add(glathe([(0.0, 0.0), (pr, 0.0), (pr, 0.02), (0.0, 0.02)], 10, rx=PI / 2, pos=(0, yc, 0.105)), lambda p, n: PAL['paper'], tag, glow=True)
    add(gloop(circle(pr, 10, 0.125, 0.0, yc), 0.032, K=4, up=F.N((0, 0, 1))), wood(frame), tag)
    add(sph(0.048, (w / 2 - 0.2, h * 0.45, 0.13), K=6, J=4), lac(PAL['gold']), tag)
    add(gtube([(x, y, 0.09) for x, y in arc_pts(0, yc, w / 2 - 0.02, 0.0, PI, 10)], 0.062, K=6, up=F.N((0, 0, 1)), caps=True), wood(frame), tag)
    for s in (-1, 1): add(beam(0.12, yc, 0.13, (s * (w / 2 - 0.02), yc / 2, 0.09), c=0.03), wood(frame, ao_z=0.0), tag)
    add(beam(w + 0.2, 0.05, 0.16, (0, 0.025, 0.08), c=0.02), wood(mul(frame, 0.9)), tag)

def chimney(x, z, yBase, yTop, s=1.0, hat=True, seed=3, tag='chimney'):
    """parts.js chimney: stacked stone courses (soot on the top one), a cap slab, a terracotta pot, an iron rain hat"""
    rng = random.Random(seed)
    n = max(2, round((yTop - yBase) / 0.26)); Wd = 0.36 * s; hh = (yTop - yBase) / n
    for i in range(n):
        c = STONES[rng.randrange(len(STONES))]
        if i == n - 1: c = mix(c, '#6a6070', 0.38)
        add(beam(Wd + rng.uniform(-0.03, 0.03), hh + 0.02, Wd + rng.uniform(-0.03, 0.03), (x + rng.uniform(-0.015, 0.015), yBase + hh * (i + 0.5), z + rng.uniform(-0.015, 0.015)),
                 c=0.045, ry=rng.uniform(-0.08, 0.08)), stone_col(c, i, ao=False), tag)
    add(box(Wd + 0.12, 0.08, Wd + 0.12, (x, yTop + 0.04, z), r=0.03), stone_col('#a89ca8', 9, ao=False), tag)
    add(glathe([(0.0, 0.0), (0.1 * s, 0.0), (0.08 * s, 0.16 * s), (0.092 * s, 0.165 * s), (0.092 * s, 0.19 * s), (0.0, 0.17 * s)], 8, pos=(x, yTop + 0.08, z)),
        lambda p, n: mix(mul('#d4774e', 0.82), '#ec9a6e', clamp(n.z * 0.5 + 0.4)) if p.z < F.W((x, yTop + 0.08 + 0.15 * s, z)).z else mix('#d4774e', '#4a3a3a', 0.45), tag)
    if hat:
        y1 = yTop + 0.08 + 0.16 * s + 0.07
        for sx in (-1, 1): add(box(0.03, y1 - yTop - 0.08, 0.03, (x + sx * 0.1 * s, (y1 + yTop + 0.08) / 2, z), r=0.0), flat(PAL['iron']), tag)
        for sx in (-1, 1): add(box(0.17 * s, 0.035, 0.3 * s, (x + sx * 0.07 * s, y1 + 0.045 * s, z), r=0.0, rz=-sx * 0.55), soft('#5a5864', 0.3), tag)
        add(box(0.04, 0.04, 0.31 * s, (x, y1 + 0.085 * s, z), r=0.0), soft('#4a4854'), tag)
    return (x, yTop + 0.2 + 0.16 * s, z)

def cake(r=0.16, layers=2, colors=('#fff0d8', '#ffb0cc'), cherry=True, tag='sweets', K=10):
    """props2.js cake: stacked rounded layers, each with a cream icing lip, a cherry on top"""
    y = 0.0
    for i in range(layers):
        lr, lh = r * (1 - i * 0.28), r * 0.55
        c = colors[i % len(colors)]
        y_top = y + lh
        def lc(p, n, c=c, yt=y_top, M=F.m):
            gy = (GMi @ (M.inverted() @ p)).y
            if gy > yt - 0.012 or n.z > 0.6: return mix('#fff8fa', '#ffffff', 0.3) if n.z > 0.3 else '#fff2f4'
            return mix(mul(c, 0.86), mix(c, '#fffaf4', 0.2), clamp(n.z * 0.5 + 0.5 - 0.3 * n.y))
        add(glathe([(0.0, y), (lr * 0.96, y), (lr, y + lh * 0.2), (lr, y + lh * 0.8), (lr * 1.04, y + lh * 0.95), (lr * 0.86, y + lh), (0.0, y + lh)], K), lc, tag)
        y += lh
    if cherry: add(sph(r * 0.2, (0, y + r * 0.16, 0), K=6, J=4), lac('#e8323a'), tag)
    return y

def cupcake(r=0.07, color='#ff9ec0', tag='sweets'):
    add(glathe([(0.0, 0.0), (r * 0.75, 0.0), (r, r * 1.1), (0.0, r * 1.1)], 7), lambda p, n: mix('#d8a870', '#f4d0a0', clamp(n.z * 0.5 + 0.5)), tag)
    add(glathe([(0.0, r * 0.95), (r * 1.08, r * 1.05), (r * 0.95, r * 1.5), (r * 0.55, r * 1.95), (0.0, r * 2.1)], 7), lambda p, n: mix(mul(color, 0.86), mix(color, '#ffffff', 0.3), clamp(n.z * 0.7 + 0.2)), tag)
    add(sph(max(0.02, r * 0.28), (0, r * 2.15, 0), K=5, J=3), lac('#e8323a'), tag)

def donut(r=0.07, color='#ff9ec0', tag='sweets'):
    t = gloop(circle(r, 9, 0.0), r * 0.55, K=5, up=F.N((0, 0, 1)))
    t.xform(F.m @ lm((0, r * 0.55, 0), rx=-PI / 2) @ F.m.inverted())
    add(t, lambda p, n: mix(mul(color, 0.92), mix(color, '#ffffff', 0.25), clamp(n.z)) if n.z > 0.15 else mix('#c8884a', '#e8b070', clamp(n.z + 0.6)), tag)

def bow(s=0.3, color='#e8323a', tag='bow'):
    with at((0, 0, 0), s=s):
        for sx in (-1, 1): add(sph(0.5, (sx * 0.3, 0.04, 0), sc=(0.55, 0.42, 0.24), K=8, J=4, rz=sx * 0.35), lac(color), tag)
        for sx in (-1, 1): add(beam(0.14, 0.5, 0.06, (sx * 0.14, -0.3, 0), c=0.025, rz=sx * 0.35), lac(mul(color, 0.9)), tag)
        add(sph(0.14, (0, 0, 0.04), sc=(1, 1, 0.7), K=6, J=4), lac(mul(color, 0.85)), tag)

def parasol(r=0.62, h=1.5, color='#ff8fb0', ribs=8, tag='parasol'):
    add(cyl(0.028, 0.032, h + 0.3, (0, (h + 0.3) / 2, 0), K=6), wood('#9c7458'), tag)
    K = ribs * 2
    prof_ = [(0.0, h + 0.2), (r * 0.94, h - 0.03), (r * 1.0, h + 0.0), (r * 0.98, h + 0.04), (r * 0.64, h + 0.16), (r * 0.56, h + 0.19), (r * 0.48, h + 0.22),
             (r * 0.12, h + 0.3), (0.0, h + 0.31)]
    base = F.W((0, 0, 0))
    def cc(p, n):
        rr = math.hypot(p.x - base.x, p.y - base.y)
        if n.z < -0.2: return mul(color, 0.72)
        a = math.atan2(p.y - base.y, p.x - base.x)
        c = mix(mul(color, 0.9), mix(color, '#fff0f4', 0.25), 0.5 + 0.5 * math.cos(a * ribs))
        if abs(rr - r * 0.56) < r * 0.03: c = mix('#fff6ea', c, 0.15)
        return c
    add(glathe(prof_, K, rfn=lambda rr, z, th: rr * (1 - 0.05 * abs(math.sin(th * ribs / 2))) if rr > r * 0.9 else rr), cc, tag)
    add(sph(0.05, (0, h + 0.33, 0), K=6, J=3), wood('#6b4a3a'), tag)

def stool(color='#e8c898', tag='cafe'):
    add(cyl(0.14, 0.14, 0.06, (0, 0.4, 0), K=9, bev=0.02), wood(color), tag)
    for i in range(3):
        a = i / 3 * TAU
        add(cyl(0.02, 0.026, 0.4, (math.cos(a) * 0.08, 0.2, math.sin(a) * 0.08), K=4, rz=math.cos(a) * 0.1, rx=-math.sin(a) * 0.1), wood('#6b4a3a'), tag)

def cafe_table(cloth='#fff0f4', umbrella='#ff8fb0', tag='cafe'):
    add(cyl(0.3, 0.3, 0.05, (0, 0.6, 0), K=12, bev=0.02), lambda p, n: mix(mul(cloth, 0.9), cloth, clamp(n.z * 0.6 + 0.4)), tag)
    add(cyl(0.29, 0.31, 0.08, (0, 0.55, 0), K=12), lambda p, n: mix(mul('#ff9ec0', 0.9), '#ffb8d0', clamp(n.z + 0.5)), tag)
    add(cyl(0.03, 0.03, 0.52, (0, 0.27, 0), K=6), soft(PAL['iron']), tag)
    add(cyl(0.15, 0.17, 0.04, (0, 0.02, 0), K=9, bev=0.012), soft(PAL['iron']), tag)
    add(glathe([(0.0, 0.0), (0.03, 0.0), (0.042, 0.06), (0.0, 0.055)], 7, pos=(0.1, 0.625, 0.05)), soft('#fffaf2', 0.2), tag)
    with at((-0.08, 0.625, -0.04)): cake(0.06, 1, ('#ffb0cc',), cherry=True, tag=tag, K=7)
    parasol(0.62, 1.5, umbrella, 8, tag='parasol')
    for a in (0.5, 0.5 + PI):
        with at((math.cos(a) * 0.5, 0, math.sin(a) * 0.5)): stool('#e8c898', tag)

def signboard_board(w, h, color, frame, tag='sign'):
    add(beam(w + 0.06, h + 0.06, 0.05, (0, 0, -0.02), c=0.022), wood(frame), tag)
    add(box(w, h, 0.07, (0, 0, 0.0), r=0.03), lambda p, n: mix(mul(color, 0.92), color, clamp(n.z * 0.5 + 0.5 - 0.4 * n.y)), tag)

def cake_emblem(size, tag='sign'):
    """the cake emblem (symbols.js cake, built in relief): a cream sponge, a pink filling band, a frosting crown of
    dollops, a cherry"""
    s = size
    add(beam(0.72 * s, 0.34 * s, 0.05, (0, -0.16 * s, 0.03), c=0.016), soft('#fff0d8', 0.2), tag)
    add(beam(0.75 * s, 0.08 * s, 0.06, (0, -0.16 * s, 0.045), c=0.014), soft('#ff8fb0', 0.2), tag)
    for i in range(7):
        x = (-0.36 + 0.12 * i) * s
        add(sph(0.075 * s, (x, 0.03 * s, 0.06), sc=(1, 0.85, 0.5), K=6, J=3), soft('#ffb0cc', 0.3), tag)
    add(sph(0.1 * s, (0, 0.2 * s, 0.07), sc=(1, 1, 0.7), K=7, J=4), lac('#e8323a'), tag)

def cake_sign(info_ridge, roofAt, z, tag='sign'):
    """the cake signboard standing on the front slope (special.js rosieShop), its post planted in the tiles"""
    y = info_ridge - 0.55
    with at((0, y, z)):
        zp = z - 0.12; yr = roofAt(0.0, zp)
        L = y - 0.25 - yr + 0.06
        add(beam(0.07, L, 0.07, (0, -0.25 - L / 2 + 0.03, -0.12), c=0.02), wood('#b86a7a'), tag)
        signboard_board(0.7, 0.5, '#fff8f0', '#e07a98', tag)
        cake_emblem(0.46, tag)
        with at((0.32, 0.24, 0.07)): bow(0.26, tag=tag)

def aframe_board(w, h, color, frame, sym_col='#ff6f8f', sym_size=0.3, tag='aframe'):
    for s in (-1, 1):
        with at((0, 0, s * 0.12)):
            with at((0, 0.34, 0), ry=0 if s > 0 else PI, rx=-0.28):
                signboard_board(w, h, color, frame, tag)
                heart(sym_size, (0, 0.0, 0.035), depth=0.03, col=sym_col, tag=tag)
                add(box(w * 0.7, 0.02, 0.01, (0, -h * 0.32, 0.04), r=0.0), flat('#e8e0d0'), tag)    # a chalk line

def display_window(tag='display'):
    """Rosie's display window (special.js): a glowing pane in white frames, a ledge of cakes, the pink sill"""
    ww, wh, wy = 1.5, 0.72, 0.78
    add(box(ww, wh, 0.04, (0, wy, 0.02), r=0.0), lambda p, n: '#fff4e8', tag, glow=True)
    WH = '#fffaf2'
    for y in (wy + wh / 2, wy - wh / 2): add(beam(ww + 0.14, 0.08, 0.1, (0, y, 0.05), c=0.025), soft(WH, 0.15, 0.3), tag)
    for x in (-ww / 2, 0.0, ww / 2): add(beam(0.07, wh, 0.1, (x, wy, 0.05), c=0.022), soft(WH, 0.15, 0.3), tag)
    add(beam(ww + 0.1, 0.05, 0.3, (0, wy - wh / 2 + 0.06, 0.18), c=0.018), wood('#c98f5e'), tag)
    add(beam(ww + 0.2, 0.3, 0.12, (0, wy - wh / 2 - 0.15, 0.06), c=0.03), soft('#f4c8d4', 0.2, 0.3), tag)
    yb = wy - wh / 2 + 0.085
    with at((-0.48, yb, 0.2)): cake(0.13, 2, ('#fff0d8', '#ff9ec0'), tag=tag)
    with at((0.05, yb, 0.2)): cake(0.11, 3, ('#8a5a44', '#fff0d8', '#ffd0a0'), tag=tag)
    for x, c in ((0.36, '#ff9ec0'), (0.55, '#c8a8ff')):
        with at((x, yb, 0.22)): cupcake(0.055, c, tag)

def awning(w, d, drop, colors, n, tag='awning'):
    """props2.js awning (face frame, its top at y = 0): candy stripes sloping out, a white bar, a scalloped valance"""
    sw = w / n; L = math.hypot(d, drop); ang = math.atan2(drop, d)
    for i in range(n):
        x = -w / 2 + (i + 0.5) * sw; c = colors[i % 2]
        sag = 0.012 * math.sin(PI * (i + 0.5) / n)
        add(box(sw + 0.004, 0.035, L, (x, -drop / 2 - sag, d / 2), r=0.0, rx=ang), lambda p, nn, c=c: mix(mul(c, 0.84), c, clamp(nn.z * 0.6 + 0.4)), tag)
    add(cyl(0.03, 0.03, w + 0.08, (0, -drop - 0.012, d), K=6, rz=PI / 2), soft('#fffaf2'), tag)
    for i in range(n):
        x = -w / 2 + (i + 0.5) * sw; c = colors[i % 2]
        poly = [(-sw / 2, 0.0)] + [(sw / 2 * math.cos(a), -0.1 + sw / 2 * math.sin(a)) for a in [PI + PI * k / 6 for k in range(7)]] + [(sw / 2, 0.0)]
        poly = [(px + x, py - drop) for px, py in poly][::-1]
        add(prism(poly, 0.022, d + 0.004), lambda p, nn, c=c: mix(mul(c, 0.86), c, clamp(nn.z * 0.4 + 0.6)), tag)
    for s in (-1, 1): add(box(0.03, 0.03, L * 1.05, (s * (w / 2 - 0.04), -drop * 0.9, d / 2), r=0.0, rx=-ang * 0.8), soft(PAL['iron']), tag)

def pastry_table(tag='table'):
    add(beam(1.1, 0.06, 0.42, (0, 0.62, 0), c=0.02), wood('#c98f5e'), tag)
    def clc(p, n, M=F.m):
        gy = (GMi @ (M.inverted() @ p)).y
        return mix('#ff9ec0', '#fff0f4', smooth(0.33, 0.6, gy))
    add(box(1.14, 0.3, 0.46, (0, 0.46, 0), r=0.025, extra=(0, 0, 2)), clc, tag)
    for x in (-0.5, 0.5):
        for z in (-0.16, 0.16): add(box(0.05, 0.32, 0.05, (x, 0.16, z), r=0.0), wood('#9c7458', ao_z=0.0), tag)
    with at((-0.32, 0.65, 0)): cake(0.13, 2, ('#fff0d8', '#ff9ec0'), tag=tag)
    add(cyl(0.02, 0.02, 0.26, (0.12, 0.78, 0), K=5), lac(PAL['gold']), tag)
    for y, r in ((0.68, 0.16), (0.86, 0.11)): add(cyl(r, r, 0.022, (0.12, y, 0), K=10), soft('#fff6ea', 0.2), tag)
    for i in range(4):
        with at((0.12 + math.cos(i * 1.57) * 0.1, 0.69, math.sin(i * 1.57) * 0.1)): cupcake(0.035, ['#ff9ec0', '#c8a8ff', '#fff0a0', '#a8e0c8'][i], tag)
    with at((0.12, 0.87, 0)): donut(0.045, '#ff8fb0', tag)
    rng = random.Random(21)
    for i, c in enumerate(('#ffffff', '#8a5a44', '#ff8fb0')):
        with at((0.42 + rng.uniform(-0.05, 0.05), 0.65 + i * 0.012, rng.uniform(-0.06, 0.06))): donut(0.04, c, tag)

def bush(r=0.3, flowers=('#ff9ec0',), color='#5a9a48', seed=0, tag='bush', nf=5):
    rng = random.Random(seed)
    lo, hi = mix(color, '#2f5a3a', 0.35), mix(color, '#d8f08a', 0.45)
    for i in range(3):
        a = i / 3 * TAU + rng.uniform(0, 1); dd = r * 0.35
        R = r * rng.uniform(0.7, 0.9)
        add(sph(R, (math.cos(a) * dd, r * (0.7 + rng.uniform(0, 0.25)), math.sin(a) * dd), sc=(1, 0.86, 1), K=7, J=4),
            lambda p, n: mix(mix(lo, color, clamp(n.z * 0.8 + 0.6)), hi, clamp(n.z * 0.6 + 0.1) * 0.7), tag)
    for i in range(nf if flowers else 0):
        a = rng.uniform(0, TAU); u = rng.uniform(0.25, 0.85)
        x = math.cos(a) * r * 0.85 * math.sqrt(1 - u * u); y = r * (0.85 + u * 0.75); z = math.sin(a) * r * 0.85 * math.sqrt(1 - u * u)
        c = flowers[i % len(flowers)]
        fb = blob(F.W((x, y, z)), 0.06, 0.042, lobes=5, K=8, seed=i + seed, amp=0.3)
        fb.c = [mul(c, 0.85)] * 8 + [mix(c, '#fff6ea', 0.2)] * 8 + [mul(c, 0.8), '#ffd84a']
        add(fb, None, tag)

def barrel(r=0.16, h=0.34, wd='#c98f5e', tag='barrel'):
    K = 10
    pr = [(0.0, 0.0)] + [(r * (0.86 + 0.14 * math.sin(t * PI)), t * h) for t in (0.0, 0.2, 0.5, 0.8, 1.0)] + [(r * 0.8, h), (0.0, h - 0.02)]
    def bc(p, n, base=F.W((0, 0, 0))):
        a = math.atan2(p.y - base.y, p.x - base.x); k = int(((a / TAU) % 1) * 11)
        c = mul(wd, [1.0, 0.92, 1.05, 0.96, 1.02, 0.9, 1.04, 0.95, 1.0, 0.93, 1.06][k])
        if n.z > 0.8: return mul(wd, 0.82)
        return mul(c, 0.9 + 0.12 * clamp(n.z + 0.4))
    add(glathe(pr, K), bc, tag)
    for t in (0.16, 0.84):
        R = r * (0.86 + 0.14 * math.sin(t * PI)) + 0.008
        add(gloop([(R * math.cos(TAU * k / 12), t * h, R * math.sin(TAU * k / 12)) for k in range(10)], 0.016, K=3), soft(PAL['iron'], 0.3), tag)

def wood_stack(w=0.7, h=0.42, d=0.2, roofed=True, seed=5, tag='woodpile'):
    """props2.js firewood against a wall (along local x), under a little shingle roof on two posts"""
    rng = random.Random(seed)
    y = 0.055
    while y < h:
        x = -w / 2 + 0.06 + (0.05 if int(y / 0.1) % 2 else 0.0)
        while x < w / 2 - 0.04:
            L = d * rng.uniform(0.9, 1.05)
            t = lathe([(0.0, -L / 2), (0.05, -L / 2), (0.05, L / 2), (0.0, L / 2)], 5, th0=rng.uniform(0, 1))
            t.xform(F.m @ lm((x + rng.uniform(-0.01, 0.01), y, rng.uniform(-0.02, 0.02)), rx=PI / 2))
            bark = rng.choice(['#8a5e44', '#9a6a4a', '#7a5040'])
            add(t, lambda p, n, bark=bark, M=F.m: '#f0cc98' if abs((M.to_3x3().inverted() @ n).y) > 0.85 else mul(bark, 0.9 + 0.15 * clamp(n.z)), tag)
            x += 0.12
        y += 0.105
    if roofed:
        add(beam(w + 0.16, 0.04, d + 0.16, (0, h + 0.07, 0.01), c=0.012, rx=0.22), wood('#8f6a52'), tag)
        for sx in (-1, 1): add(box(0.045, h + 0.08, 0.045, (sx * (w / 2 + 0.03), (h + 0.08) / 2, d / 2), r=0.0), wood('#6b4a3a', ao_z=0.0), tag)

def laundry(L=1.2, h=1.15, colors=('#2c3a6a', '#e8403a', '#ffffff', '#2c3a6a'), tag='laundry'):
    for sx in (-1, 1):
        add(cyl(0.03, 0.036, h, (sx * L / 2, h / 2, 0), K=5), wood('#9c7458', ao_z=0.0), tag)
        add(beam(0.04, 0.04, 0.28, (sx * L / 2, h - 0.03, 0), c=0.012), wood('#9c7458'), tag)
    sag, y0 = 0.07, h - 0.05
    P = lambda t: (-L / 2 + L * t, y0 - math.sin(t * PI) * sag, 0.0)
    add(gtube([P(k / 6) for k in range(7)], 0.01, K=3), flat('#f4f0e8'), tag)
    items = [(0.18, 0.2, 0.3), (0.4, 0.16, 0.2), (0.62, 0.24, 0.34), (0.84, 0.12, 0.16)]
    for i, (t, w, hh) in enumerate(items):
        x, y, z = P(t); c = colors[i % len(colors)]
        add(box(w, hh, 0.025, (x, y - hh / 2, z), r=0.0, rx=0.05 * (1 if i % 2 else -1)),
            lambda p, n, c=c: mix(mul(c, 0.84), mix(c, '#ffffff', 0.12), clamp(n.z * 0.5 + 0.5)), tag)
        for sx in (-1, 1): add(box(0.02, 0.05, 0.03, (x + sx * w * 0.35, y - 0.005, z), r=0.0), flat('#c98f5e'), tag)

def watering_can(color='#e8807a', tag='can'):
    add(cyl(0.07, 0.08, 0.14, (0, 0.07, 0), K=8, bev=0.015), lac(color), tag)
    add(gtube([(0.06, 0.04, 0), (0.12, 0.09, 0), (0.17, 0.13, 0)], lambda s: 0.016 - 0.005 * s, K=5), lac(color), tag)
    add(cyl(0.024, 0.014, 0.035, (0.18, 0.14, 0), K=6, rz=-0.9), soft(mul(color, 0.8)), tag)
    add(gtube([(-0.07, 0.12, 0), (-0.04, 0.2, 0), (0.02, 0.2, 0), (0.05, 0.14, 0)], 0.012, K=4), lac(mul(color, 0.85)), tag)

def mailbox(color='#e8403a', tag='mailbox'):
    add(cyl(0.04, 0.05, 0.62, (0, 0.31, 0), K=6), wood('#6b4a3a', ao_z=0.0), tag)
    add(box(0.3, 0.34, 0.42, (0, 0.78, 0), r=0.11), lac(color), tag)
    add(box(0.17, 0.035, 0.02, (0, 0.8, 0.205), r=0.0), flat(PAL['ink']), tag)
    add(beam(0.03, 0.2, 0.08, (0.17, 0.9, 0.06), c=0.01), lac(PAL['gold']), tag)
    add(beam(0.1, 0.06, 0.03, (0.21, 0.97, 0.06), c=0.01), lac(PAL['gold']), tag)
    heart(0.1, (0, 0.68, 0.205), depth=0.02, col='#fff6ea', tag=tag)

def picket_fence(a, b, h=0.45, wd='#c98f5e', seed=0, tag='fence'):
    dx, dz = b[0] - a[0], b[1] - a[1]; L = math.hypot(dx, dz); ang = math.atan2(dx, dz)
    rng = random.Random(seed)
    with at((a[0], 0, a[1]), ry=ang):
        posts = max(1, round(L / 0.9))
        for i in range(posts + 1):
            z = i * L / posts
            add(beam(0.1, h + 0.12, 0.1, (0, (h + 0.12) / 2, z), c=0.025, ry=rng.uniform(-0.1, 0.1)), wood(mul(wd, 0.8), ao_z=0.0), tag)
            add(glathe([(0.0, 0.0), (0.08, 0.0), (0.0, 0.1)], 4, pos=(0, h + 0.12, z), ry=PI / 4), wood(mul(wd, 0.8)), tag)
        for y in (h * 0.3, h * 0.72): add(box(0.05, 0.07, L, (0.04, y, L / 2), r=0.0), wood(wd), tag)
        n = max(2, round(L / 0.16))
        for i in range(n):
            hh = h * rng.uniform(0.85, 1.0); z = (i + 0.5) * L / n
            c = rng.choice(['#fffaf2', '#fff0e0', '#fff8f0'])
            add(box(0.035, hh, 0.1, (0.08, hh / 2, z), r=0.0), soft(c, 0.15, 0.25), tag)
            add(prism([(-0.05, 0.0), (0.05, 0.0), (0.0, 0.075)][::-1], 0.035, -0.0175).xform(F.m @ lm((0.08, hh, z), ry=PI / 2) @ F.m.inverted()), soft('#fffaf2'), tag)

def teru_dog(tag='charms'):
    """Chewy's own rain charm (trim.js teruDog): a teru teru bozu with floppy brown ears and a red neckerchief"""
    add(box(0.02, 0.08, 0.02, (0, -0.04, 0), r=0.0), flat(PAL['ink']), tag)
    add(sph(0.075, (0, -0.14, 0), K=8, J=5), soft('#fffaf2', 0.2), tag)
    for s in (-1, 1): add(sph(0.045, (s * 0.075, -0.145, 0), sc=(0.6, 1.3, 0.8), K=6, J=3, rz=s * 0.5), soft('#8a4a2c', 0.3), tag)
    add(glathe([(0.0, -0.36), (0.1, -0.36), (0.07, -0.26), (0.03, -0.2), (0.0, -0.195)], 7), soft('#fff6ea', 0.15), tag)
    add(gloop([(0.05 * math.cos(TAU * k / 7), -0.205, 0.05 * math.sin(TAU * k / 7)) for k in range(7)], 0.016, K=3), soft('#e8403a'), tag)
    for s in (-1, 1): add(sph(0.014, (s * 0.026, -0.13, 0.068), K=4, J=3), flat(PAL['ink']), tag)
    add(sph(0.016, (0, -0.152, 0.074), sc=(1.3, 0.9, 0.8), K=4, J=3), flat(PAL['ink']), tag)

def dog_bowl(tag='bowl'):
    add(glathe([(0.0, 0.0), (0.14, 0.0), (0.17, 0.08), (0.15, 0.09), (0.13, 0.08), (0.0, 0.035)], 10), lac('#e8503a'), tag)
    with at((0, 0.075, 0), ry=0.4, rx=-PI / 2): bone(0.18, (0, 0, 0.0), r=0.024, col='#fff4e4', tag=tag)

def ball(r=0.08, pos=(0, 0, 0), tag='ball'):
    M = F.m
    def bc(p, n):
        q = GMi @ (M.inverted() @ p)
        return '#fff6ea' if abs(q.y - pos[1] + math.sin(q.x * 30) * 0.02) < 0.014 else mix('#c8282a', '#ff5a4a', clamp(n.z * 0.6 + 0.3))
    add(sph(r, pos, K=8, J=5), bc, tag)

def step_stones(x0, z0, x1, z1, n=3, seed=40, tag='stones'):
    rng = random.Random(seed)
    for i in range(n):
        t = (i + 0.5) / n
        pebble((x0 + (x1 - x0) * t + rng.uniform(-0.08, 0.08), -0.01, z0 + (z1 - z0) * t + rng.uniform(-0.05, 0.05)), 0.24, sq=0.4, seed=seed + i, col='#e8e0d6', tag=tag, K=10)

# ================================================================== Rosie's Treats (special.js rosieShop, 4 x 3)
def new_asset(name, pal):
    global A, OB
    A = Asset2(); F.__init__(); OB = name
    PAL.update(pal)

def build_rosie():
    new_asset('rosieShop', dict(wall='#fff0f2', wallLo='#f6dde4', frame='#b86a7a', frameLo='#8e4a5c', paper='#fffaf0'))
    roofCol, wall, frame = '#e07a98', '#fff0f2', '#b86a7a'
    w, d, h, y0, zc = 3.3, 1.85, 1.6, 0.26, -0.4
    F.push((0, 0, zc))
    foundation(w, d, y0, pad=0.14, color='#c8b8c4')
    walls(dict(w=w, d=d, h=h, y0=y0, plaster=wall, frame=frame, koshi='#f4c8d4', koshiSkip='f'))
    blk = dict(w=w, d=d)
    with on_face(blk, 'f', -0.62, y0): display_window()
    with on_face(blk, 'f', 0.95, y0): door_round(0.82, 1.35, '#f4a8b8', frame)
    with on_face(blk, 'r', 0, y0 + 0.85): round_window(0.28, frame=frame, box_=True, flowers=['#ff8fb0', '#fffaf2'], fine=True)
    with on_face(blk, 'l', 0, y0 + 0.85): round_window(0.28, frame=frame)
    for u in (-0.8, 0.8):
        with on_face(blk, 'b', u, y0 + 0.85): shoji(0.6, 0.46, frame=frame)
    info = roof(dict(type='irimoya', w=w, d=d, y0=y0 + h, over=0.42, H=1.0, curve=0.42, lift=0.3, liftW=0.8, thick=0.15,
                     ribW=0.33, ribAmp=0.04, course=0.32, courseAmp=0.025, tg=0.5, gOver=0.22, color=roofCol, pastel=0.22, contrast=0.72,
                     gable='plaster', gableColor=wall, timber=frame, rich=2, seed=17, bendUnder=True))
    with on_face(blk, 'f', 0, y0 + h - 0.02): awning(w + 0.1, 0.42, 0.24, ['#ff8fb0', '#fff8f4'], 14)
    with at((-0.42, 0, d / 2 + 0.62)): pastry_table()
    cake_sign(info['ridgeY'], info['yAt'], d / 2 + 0.36)
    with at((0, info['ridgeY'] + 0.07, 0)): cupcake(0.12, '#ff9ec0', 'ridge')
    smoke = chimney(1.0, -0.4, info['yAt'](1.0, -0.4) - 0.2, info['ridgeY'] - 0.1, 0.8, hat=True, seed=5)
    with at((1.42, y0 + h - 0.28, d / 2 + 0.34)): bell_charm()
    with at((-1.5, y0 + h - 0.28, d / 2 + 0.34)): furin('#ffc0d8')
    cx, cz = w / 2 + 0.12, d / 2 - 0.1
    rain_chain(cx, info['underAt'](cx, cz), cz, 0.0, color='#e8a0b0')
    F.pop()
    with at((-1.55, 0, 1.05)): cafe_table('#fff0f4', '#ff8fb0')
    with at((0.42, 0, 1.22), ry=-0.3): aframe_board(0.42, 0.5, '#3a4a44', '#c98f5e')
    with at((1.62, 0, 0.9)): pot_flowers(flowers=('#ff8fb0', '#fffaf2'))
    with at((1.62, 0, -1.25)): crate(0.3, '#f4d8b8', seed=2)
    for i, x in enumerate((0.55, 1.35)):
        with at((x, 0, 0.72), ry=i * 1.3): flower_patch(0.4, 0.22, 4, ('#ff8fb0', '#fffaf2', '#ffd24a'))
    return A, dict(door=(0.95, 0, 1.2), smoke=(round(smoke[0], 3), round(smoke[1], 3), round(smoke[2] + zc, 3)), ridgeY=round(info['ridgeY'], 3))

# ================================================================== Chewy's Cottage (special.js chewyHouse, 3 x 3)
def doghouse(y0, roofCol, dogCol, archCol):
    """the doghouse-shaped entry porch: a stone base, an arched front, a little gable roof, the bone sign, a lantern
    and Chewy's rain charm (the frame is the porch centre)"""
    pw, pd, ph = 1.0, 0.62, 1.3
    hw, ar = pw / 2, 0.3; yc = y0 + ph * 0.55; yt = y0 + ph
    add(box(pw + 0.12, y0 + 0.3, pd + 0.1, (0, (y0 - 0.3) / 2, 0), r=0.05), stone_col(STONES[2], 7, ao=False), 'porch')
    # the arched front: an outer U (the panel's edge) matched point for point to the inner U (the opening)
    ca = math.atan2(yt - yc, hw)
    angs = sorted(set([PI * k / 8 for k in range(9)] + [ca, PI - ca]), reverse=True)
    inner = [(-ar, y0), (-ar, (y0 + yc) / 2)] + [(ar * math.cos(a), yc + ar * math.sin(a)) for a in angs] + [(ar, (y0 + yc) / 2), (ar, y0)]
    def hit(a):
        c, s = math.cos(a), math.sin(a)
        tx = hw / abs(c) if abs(c) > 1e-9 else 1e9; ty = (yt - yc) / s if s > 1e-9 else 1e9
        tt = min(tx, ty); return (c * tt, yc + s * tt)
    outer = [(-hw, y0), (-hw, (y0 + yc) / 2)] + [hit(a) for a in angs] + [(hw, (y0 + yc) / 2), (hw, y0)]
    def dc(p, n, M=F.m):
        gy = (GMi @ (M.inverted() @ p)).y
        c = mix(mul(dogCol, 0.9), dogCol, smooth(y0, y0 + 0.6, gy))
        return mul(c, 1 - 0.08 * smooth(yt - 0.35, yt, gy))
    arch_wall(outer, inner, pd / 2 - 0.12, pd / 2 + 0.02, dc, 'porch')
    for sx in (-1, 1): add(box(0.1, ph, pd - 0.1, (sx * (hw - 0.05), y0 + ph / 2, -0.05), r=0.03), dc, 'porch')
    add(gtube([(x, y, pd / 2 + 0.035) for x, y in arc_pts(0, yc, ar + 0.035, 0.0, PI, 8)], 0.045, K=5, up=F.N((0, 0, 1)), caps=True), wood(archCol), 'porch')
    for sx in (-1, 1): add(beam(0.08, ph * 0.55, 0.08, (sx * (ar + 0.035), y0 + ph * 0.275, pd / 2 + 0.035), c=0.022), wood(archCol, ao_z=y0), 'porch')
    add(box(pw - 0.1, 0.04, pd, (0, y0 + 0.02, 0), r=0.0), wood('#c98f5e'), 'porch')
    add(beam(0.62, 1.0, 0.05, (0, y0 + 0.5, -pd / 2 + 0.05), c=0.016), wood('#7a5240'), 'porch')
    for x in (-0.1, 0.1): add(box(0.02, 0.92, 0.012, (x, y0 + 0.5, -pd / 2 + 0.078), r=0.0), flat(mul('#7a5240', 0.75)), 'porch')
    add(sph(0.035, (0.18, y0 + 0.5, -pd / 2 + 0.09), K=6, J=3), lac(PAL['gold']), 'porch')
    pr = roof(dict(type='gable', ridge='z', w=pw, d=pd, y0=yt, over=0.16, gOver=0.14, H=0.55, curve=0.2, lift=0.1, liftW=0.3,
                   thick=0.1, ribW=0.22, ribAmp=0.028, course=0.0, color=roofCol, gable='plaster', gableColor=dogCol,
                   vent=False, oni=False, timber='#6b4a3a', rich=1, seed=37))
    with at((0, yt + 0.2, pd / 2 + 0.2)): bone(0.46, (0, 0, 0), r=0.05, col='#fff6e6', tag='sign')
    paw(0.16, (0, pr['ridgeY'] + 0.1, pd / 2 - 0.02), depth=0.03, col='#8a4a2c', tag='sign')
    chochin(0.1, 0.2, '#e8503a', cord=0.05, pos=(0.22, yt - 0.04, pd / 2 + 0.08), tag='porch')
    with at((-0.26, yt - 0.02, pd / 2 + 0.08)): teru_dog('porch')
    return pr

def ridge_bone(y, z, size=0.4, tag='sign'):
    """Chewy's emblem standing on the ridge, face to the front and tipped back a little toward the high camera: a
    short stand clamped on the ridge cap and the bone on top"""
    add(beam(0.08, 0.2, 0.08, (0, y + 0.07, z), c=0.02), wood('#6b4a3a'), tag)
    add(box(0.16, 0.05, 0.2, (0, y - 0.02, z), r=0.02), soft('#6b4a3a', 0.2), tag)
    with at((0, y + 0.2 + size * 0.2, z), rx=-0.22): bone(size, (0, 0, 0), r=size * 0.11, col='#fff6e6', tag=tag)

def door_shoji(w=0.6, h=0.86, frame=None, tag='door'):
    """a sliding shoji door (parts.js door 'shoji'): two panels of glowing paper over kick boards, in a timber frame"""
    frame = frame or PAL['frame']
    add(box(w, h, 0.03, (0, h / 2, 0.01), r=0.0), flat(mul(frame, 0.6)), tag)
    pw = w / 2 + 0.02
    for s in (-1, 1):
        with at((s * (w / 4 - 0.005), 0, 0.03 + (0.022 if s > 0 else 0))):
            add(beam(pw - 0.04, 0.26, 0.035, (0, 0.17, 0), c=0.012), wood('#c98f5e'), tag)
            add(box(pw - 0.07, h - 0.36, 0.02, (0, 0.3 + (h - 0.36) / 2, 0), r=0.0), lambda p, n: PAL['paper'], tag, glow=True)
            for i in (1, 2): add(box(0.024, h - 0.36, 0.02, (-pw / 2 + i * pw / 3, 0.3 + (h - 0.36) / 2, 0.016), r=0.0), flat(frame), tag)
            for j in (1, 2, 3): add(box(pw - 0.07, 0.024, 0.02, (0, 0.3 + j * (h - 0.36) / 4, 0.016), r=0.0), flat(frame), tag)
            frame_ring(pw - 0.03, h - 0.04, 0.02, 0.026, wood(frame), tag)
    add(beam(w + 0.2, 0.1, 0.1, (0, h + 0.04, 0.04), c=0.025), wood(frame), tag)
    for s in (-1, 1): add(beam(0.09, h, 0.08, (s * (w / 2 + 0.03), h / 2, 0.04), c=0.02), wood(frame), tag)

def dormer(info, fx, fz, yaw, w, hw, rise, yBase, roofCol, wall, frame, tag='dormer'):
    """special.js dormer: a little gabled box on the slope (front facing yaw), a porthole, its roof running back into
    the main roof"""
    sx, sz = math.sin(yaw), math.cos(yaw)
    Y = lambda s: info['yAt'](fx + sx * s, fz + sz * s)
    yF = Y(0); yT = yF + hw
    sb = -0.05
    lim = -(abs(fx * sx + fz * sz) - 0.02)                 # (never past the main ridge: the kit's ran out the far slope)
    while sb > max(-1.6, lim) and Y(sb) < yT + rise + 0.1: sb -= 0.02
    depth = -sb
    with at((fx, 0, fz), ry=yaw):
        Mi = F.m.inverted()
        def wc(p, n):
            gy = (GMi @ (Mi @ p)).y
            return mul(mix(mul(wall, 0.9), wall, smooth(yF - 0.1, yT, gy)), 0.95 + 0.06 * clamp(n.z + 0.4))
        add(box(w, yT - yBase, depth, (0, (yT + yBase) / 2, -depth / 2), r=0.03, extra=(0, 0, 2)), wc, tag)
        for s in (-1, 1): add(beam(0.075, hw + 0.04, 0.075, (s * (w / 2 - 0.025), yF + hw / 2, 0.006), c=0.016), wood(frame), tag)
        add(beam(w + 0.04, 0.07, 0.08, (0, yT - 0.04, 0.012), c=0.016), wood(frame), tag)
        add(beam(w + 0.08, 0.06, 0.1, (0, yF + 0.035, 0.02), c=0.016), wood(mul(frame, 0.88)), tag)
        with at((0, yF + hw * 0.5 + 0.015, 0)):
            add(glathe([(0.0, 0.0), (0.13, 0.0), (0.13, 0.02), (0.0, 0.02)], 10, rx=PI / 2, pos=(0, 0, 0.012)), lambda p, n: PAL['paper'], tag, glow=True)
            add(gloop(circle(0.135, 10, 0.036), 0.028, K=4, up=F.N((0, 0, 1))), wood(frame), tag)
            add(box(0.022, 0.25, 0.02, (0, 0, 0.036), r=0.0), flat(frame), tag)
            add(box(0.25, 0.022, 0.02, (0, 0, 0.036), r=0.0), flat(frame), tag)
        with at((0, 0, -depth / 2)):
            roof(dict(type='gable', ridge='z', w=w, d=depth, y0=yT, over=0.1, gOver=0.13, H=rise, curve=0.25, lift=0.08, liftW=0.18,
                      thick=0.08, ribW=0.2, ribAmp=0.026, course=0.0, color=roofCol, gable='plaster', gableColor=wall, vent=False,
                      oni=False, timber='#6b4a3a', rich=1, seed=43))

def zabuton(x, z, c, s=1.0, tag='porch'):
    add(sph(0.15 * s, (x, 0.04 * s, z), sc=(1, 0.28, 1), K=7, J=3), lambda p, n: mul(c, 0.86 + 0.16 * clamp(n.z)), tag)
    add(box(0.03 * s, 0.02 * s, 0.03 * s, (x, 0.08 * s, z), r=0.0), flat(mul(c, 0.75)), tag)

def dog_bed(r=0.17, tag='porch'):
    add(gloop([(r * math.cos(TAU * k / 14), 0.1, r * math.sin(TAU * k / 14)) for k in range(10)], 0.055, K=5),
        lambda p, n: mix('#b88848', '#e8b878', clamp(n.z * 0.6 + 0.5)), tag)
    add(cyl(r + 0.02, r + 0.03, 0.08, (0, 0.04, 0), K=12), wood('#c89858'), tag)
    add(sph(r * 0.92, (0, 0.1, 0), sc=(1, 0.34, 1), K=9, J=4), lambda p, n: mul('#e8503a', 0.84 + 0.18 * clamp(n.z)), tag)
    with at((0.03, 0.17, 0.02), ry=0.6, rx=-PI / 2): bone(0.2, (0, 0, 0), r=0.022, col='#fff4e4', tag=tag)

def tea_tray(tag='porch'):
    add(beam(0.26, 0.03, 0.18, (0, 0.015, 0), c=0.01), lac('#7a3a30'), tag)
    add(sph(0.055, (-0.05, 0.075, 0), sc=(1, 0.85, 1), K=6, J=4), lac('#8aa88a'), tag)
    add(sph(0.02, (-0.05, 0.125, 0), K=5, J=3), lac('#6a886a'), tag)
    add(cyl(0.01, 0.014, 0.06, (0.012, 0.085, 0), K=5, rz=-1.0), lac('#8aa88a'), tag)
    for x, z in ((0.07, -0.04), (0.08, 0.05)): add(cyl(0.024, 0.018, 0.04, (x, 0.05, z), K=7), soft('#fff6ea', 0.2), tag)

def posts_row(xs, z, y, color, r=0.055, tag='porch'):
    for x in xs:
        add(cyl(r, r * 1.1, y, (x, y / 2, z), K=6), wood(color, ao_z=0.0), tag)
        add(cyl(r * 1.8, r * 2.1, 0.12, (x, 0.06, z), K=6), stone_col(STONES[2], 3, ao=False), tag)

def engawa(x0, x1, z, depth, y, wd='#c98f5e', beamC='#6b4a3a', seed=8, tag='engawa'):
    """parts.js engawa: plank deck along the front (x0..x1, from z out by depth, top at y), a front beam and legs"""
    rng = random.Random(seed); w = x1 - x0; cx = (x0 + x1) / 2
    n = max(3, round(depth / 0.14))
    for i in range(n):
        c = rng.choice([wd, mul(wd, 0.94), mul(wd, 1.05)])
        add(box(w, 0.07, depth / n - 0.012, (cx, y - 0.035, z + (i + 0.5) * depth / n), r=0.0), wood(c, seed=i), tag)
    add(beam(w, 0.1, 0.08, (cx, y - 0.1, z + depth - 0.04), c=0.022), wood(beamC), tag)
    legs = max(2, round(w / 1.2) + 1)
    for i in range(legs):
        add(beam(0.1, y - 0.06, 0.1, (x0 + 0.08 + i * (w - 0.16) / (legs - 1), (y - 0.06) / 2, z + depth - 0.08), c=0.022), wood(beamC, ao_z=0.0), tag)

def chewy_porch(zf, y0, roofCol, frame, tag='veranda'):
    """special.js chewyPorch: the L2/L3 veranda on the front-right corner (block frame, front wall at z = zf)"""
    deckY, depth, x0, x1 = y0 + 0.02, 0.64, 0.67, 1.42
    zp = zf + depth - 0.07; postTop = 1.1
    engawa(x0, x1, zf, depth, deckY, tag=tag)
    posts_row([0.81, 1.37], zp, postTop, frame, tag=tag)
    posts_row([1.37], zf + 0.02, postTop, frame, tag=tag)
    add(beam(x1 - 0.72 + 0.12, 0.1, 0.1, ((0.75 + x1) / 2, postTop - 0.03, zp), c=0.022), wood(frame), tag)
    add(beam(0.1, 0.1, zp - zf + 0.1, (1.37, postTop - 0.03, (zp + zf) / 2), c=0.022), wood(frame), tag)
    for x, s in ((0.81, 1), (1.37, -1)):
        add(gtube([(x, postTop - 0.3, zp), (x + s * 0.2, postTop - 0.06, zp)], 0.026, K=4), wood(frame), tag)
    over, dS = 0.14, zp - zf - 0.11; zcS = zf + 0.11 + dS / 2; xs0, xs1, gO = 0.8, 1.45, 0.06
    with at(((xs0 + xs1) / 2, 0, zcS)):
        pr = roof(dict(type='shed', w=xs1 - xs0 - 2 * gO, d=dS, y0=postTop + 0.04, over=over, gOver=gO, H=0.3, curve=0.32, lift=0.12,
                       liftW=0.22, thick=0.08, ribW=0.2, ribAmp=0.026, course=0.17, courseAmp=0.018, color=roofCol, rich=1, seed=47))
        yBack = pr['underAt'](0, -(dS / 2 + over) + 0.06) - 0.05
    add(beam(xs1 - 1.08, 0.08, 0.08, ((1.08 + xs1) / 2, yBack, zf - 0.01), c=0.018), wood(frame), tag)
    with at((0, deckY, 0)):
        zabuton(0.92, zf + 0.28, '#6a8ac8', tag=tag); zabuton(0.98, zf + 0.5, '#e8a04a', 0.9, tag=tag)
        with at((1.16, 0, zf + 0.42), ry=0.2): tea_tray(tag)
        with at((1.18, 0, zf + 0.17)): dog_bed(0.17, tag)
    chochin(0.09, 0.18, '#e8503a', cord=0.03, pos=(0.86, postTop - 0.1, zp + 0.02), tag=tag)
    with at((1.2, postTop - 0.08, zp + 0.02)): furin('#bfe6ff', tag)
    pebble((1.06, -0.02, zf + depth + 0.2), 0.3, sq=0.4, seed=61, col=STONES[0], tag=tag)

def soft_futon(w=0.56, color='#ff9ec0', tag='balcony'):
    """special.js softFuton over a rail along x (local): a rolled fold, a long drop outside (+z), polka dots"""
    add(cyl(0.055, 0.055, w, (0, 0.035, 0), K=8, rz=PI / 2), lambda p, n: mix(mul(color, 0.8), color, clamp(n.z * 0.6 + 0.6)), tag)
    for s, L in ((1, 0.4), (-1, 0.26)):
        with at((0, 0.035 - L / 2, s * 0.055), rx=-s * 0.1):
            add(box(w, L, 0.055, (0, 0, 0), r=0.024), lambda p, n: mix(mul(color, 0.8), color, clamp(0.5 + n.z * 0.3 + 0.2 * (n.y * -s))), tag)
            if s > 0:
                add(box(w + 0.012, 0.05, 0.064, (0, -L / 2 + 0.03, 0), r=0.02), soft('#fff6ea', 0.2), tag)
                for i in range(5):
                    add(cyl(0.024, 0.024, 0.01, (-w * 0.36 + i * w * 0.18, L / 2 - 0.1 - (i % 2) * 0.11, 0.03), K=6, rx=PI / 2), flat('#fffaf2'), tag)

def weathervane(tag='vane'):
    """special.js bone weathervane (the vane stands still here: the game drops the kit's swinging part)"""
    add(box(0.16, 0.08, 0.16, (0, 0.04, 0), r=0.03), soft('#6a5a64'), tag)
    add(cyl(0.026, 0.032, 0.62, (0, 0.38, 0), K=6), soft(PAL['iron']), tag)
    add(sph(0.05, (0, 0.32, 0), K=6, J=3), lac(PAL['gold']), tag)
    for a in (0, PI / 2):
        add(cyl(0.016, 0.016, 0.34, (0, 0.42, 0), K=4, rz=PI / 2, ry=a), soft(PAL['iron']), tag)
    for k in range(4): add(sph(0.03, (math.cos(k * PI / 2) * 0.17, 0.42, math.sin(k * PI / 2) * 0.17), K=5, J=3), lac(PAL['gold']), tag)
    add(sph(0.04, (0, 0.7, 0), K=6, J=3), lac(PAL['gold']), tag)
    with at((0, 0.6, 0), ry=0.5):
        bone(0.36, (0.02, 0, -0.03), r=0.035, col='#fff6e6', tag=tag)
        add(glathe([(0.0, 0.0), (0.07, 0.0), (0.0, 0.15)], 6, pos=(0.2, 0, -0.03), rz=-PI / 2), lac('#e8503a'), tag)
        add(beam(0.13, 0.16, 0.03, (-0.24, 0.02, -0.03), c=0.01, rz=0.2), lac(PAL['gold']), tag)

def persimmons(n=5, tag='charms'):
    add(box(0.018, 0.06 + n * 0.085, 0.018, (0, -(0.06 + n * 0.085) / 2, 0), r=0.0), flat('#c8a060'), tag)
    for i in range(n):
        y = -0.08 - i * 0.085
        add(sph(0.045, (0, y, 0), sc=(1, 0.85, 1), K=5, J=3, ry=i * 1.3), lac(['#f08a3a', '#e8782e', '#f49a48'][i % 3]), tag)
        add(box(0.04, 0.014, 0.04, (0, y + 0.036, 0), r=0.0), flat('#5a7a3a'), tag)

def chewy_upper(low, wall, frame, roofCol, w, d):
    """special.js chewyUpper (L3): the upper storey on the pent roof, a big round window over the doghouse, the balcony
    door, the drying balcony on the right (deck on stilts, railing, a futon airing), its own roof with the chimney and the
    bone weathervane, persimmons under the eave. Returns (top roof info, smoke point)."""
    y2, w2, d2, h2 = low['topY'], 1.7, 1.16, 1.1
    walls(dict(w=w2, d=d2, h=h2, y0=y2, plaster=wall, frame=frame, sill=False, rail=True))
    blk2 = dict(w=w2, d=d2)
    with on_face(blk2, 'f', 0.1, y2 + 0.64): round_window(0.28, frame=frame, fine=True)
    with on_face(blk2, 'l', 0, y2 + 0.6): shoji(0.5, 0.42, frame=frame)
    with on_face(blk2, 'b', 0, y2 + 0.6): shoji(0.6, 0.42, frame=frame)
    with on_face(blk2, 'r', 0, y2 + 0.02): door_shoji(0.6, 0.86, frame)
    bx0, bx1, bz, by = w2 / 2, w / 2 + 0.3, 0.46, y2 + 0.04
    tg = 'balcony'
    add(beam(bx1 - bx0 + 0.04, 0.07, 2 * bz, ((bx0 + bx1) / 2, by - 0.035, 0), c=0.018), wood('#c98f5e'), tg)
    for i in range(5): add(box(bx1 - bx0, 0.012, 0.014, ((bx0 + bx1) / 2, by + 0.001, -bz + (i + 0.5) * 2 * bz / 5), r=0.0), flat(mul('#c98f5e', 0.8)), tg)
    add(beam(0.08, 0.1, 2 * bz + 0.06, (bx1, by - 0.06, 0), c=0.018), wood(frame), tg)
    for sz in (-1, 1):
        add(beam(bx1 - bx0, 0.1, 0.08, ((bx0 + bx1) / 2, by - 0.06, sz * bz), c=0.018), wood(frame), tg)
        x, z = bx1 - 0.05, sz * (bz - 0.05); yr = low['yAt'](x, z)
        add(beam(0.07, by - yr, 0.07, (x, (by + yr) / 2 - 0.03, z), c=0.016), wood(frame), tg)
        add(box(0.13, 0.04, 0.13, (x, yr + 0.01, z), r=0.015), wood(mul(frame, 0.8)), tg)
    rh = 0.4
    add(beam(0.07, 0.06, 2 * bz + 0.04, (bx1, by + rh, 0), c=0.016), wood(frame), tg)
    for sz in (-1, 1): add(beam(bx1 - bx0, 0.06, 0.07, ((bx0 + bx1) / 2, by + rh, sz * bz), c=0.016), wood(frame), tg)
    for i in range(7): add(box(0.035, rh, 0.035, (bx1, by + rh / 2, -bz + i * 2 * bz / 6), r=0.0), wood(frame), tg)
    for sz in (-1, 1):
        for i in (1, 2): add(box(0.035, rh, 0.035, (bx0 + i * (bx1 - bx0) / 3, by + rh / 2, sz * bz), r=0.0), wood(frame), tg)
    with at((bx1, by + rh + 0.03, -0.08), ry=PI / 2): soft_futon(0.56, '#ff9ec0', tg)
    with at((bx1 - 0.12, by, bz - 0.14)): pot_flowers(0.08, 0.12, ('#ff9ec0', '#ffd24a'), tag=tg)
    top = roof(dict(type='gable', ridge='z', w=w2, d=d2, y0=y2 + h2, over=0.3, gOver=0.28, H=0.88, curve=0.3, lift=0.16, liftW=0.45,
                    thick=0.14, ribW=0.3, ribAmp=0.034, course=0.32, courseAmp=0.022, color=roofCol, gable='plaster', contrast=0.9,
                    gableColor=wall, timber='#6b4a3a', rich=1, seed=53, bendUnder=True))
    smoke = chimney(-0.45, -0.22, top['yAt'](-0.45, -0.22) - 0.25, top['ridgeY'] + 0.04, 0.8, hat=False, seed=13)
    with at((0, top['ridgeY'] + 0.06, -d2 / 2 + 0.05)): weathervane()
    x_, z_ = -0.42, d2 / 2 + 0.2
    with at((x_, top['underAt'](x_, z_) - 0.01, z_)): persimmons(4)
    return top, smoke

def build_chewy(L=1):
    new_asset('chewyHouse', dict(wall='#fff4e2', wallLo='#efdcc4', frame='#8f6a52', frameLo='#6b4a3a', paper='#fffaf0'))
    roofCol, wall, koshi, dogCol, archCol, frame = '#d8604a', '#fff4e2', '#c9a27a', '#ffe6c8', '#9c7458', '#8f6a52'
    w, d, h, y0, zc = 2.2, 1.65, 1.45, 0.28, -0.55
    F.push((0, 0, zc))
    foundation(w, d, y0, pad=0.14, color='#a89ca8')
    walls(dict(w=w, d=d, h=h, y0=y0, plaster=wall, koshi=koshi, koshiSkip='f'))
    blk = dict(w=w, d=d)
    fy, fh = (0.74, 0.4) if L >= 2 else (0.82, 0.44)
    with on_face(blk, 'f', -0.62, y0 + 0.82): round_window(0.26, box_=True, flowers=['#ffd24a', '#ff8fb0'], fine=True)
    with on_face(blk, 'f', 0.7, y0 + fy): shoji(0.46, fh)
    with on_face(blk, 'r', 0, y0 + 0.84): shoji(0.62, 0.48, box_=True)
    with on_face(blk, 'l', 0, y0 + 0.84): round_window(0.24)
    with on_face(blk, 'b', 0, y0 + 0.84): shoji(0.6, 0.46)
    RT = dict(ribW=0.27, ribAmp=0.034, course=0.27, courseAmp=0.022, contrast=0.9) if L < 3 else dict(ribW=0.3, ribAmp=0.034, course=0.33, courseAmp=0.022, contrast=0.9)
    if L < 3:
        info = roof(dict(type='gable', ridge='z', w=w, d=d, y0=y0 + h, over=0.36, gOver=0.3, H=1.05, curve=0.3, lift=0.16, liftW=0.5,
                         thick=0.15, color=roofCol, gable='plaster', gableColor=wall, timber='#6b4a3a', rich=1, seed=29, bendUnder=True, **RT))
        smoke = chimney(-0.6, -0.3, info['yAt'](-0.6, -0.3) - 0.3, info['ridgeY'] + 0.05, 0.95, hat=False, seed=11)
        top = info
        # the bone on the top roof: stood on the ridge just behind the front oni, where it can be seen
        ridge_bone(info['ridgeY'] + 0.1, d / 2 + 0.36 - 0.42, 0.4)
        if L == 2:
            dormer(info, 0.9, 0.0, PI / 2, 0.62, 0.46, 0.24, y0 + h - 0.02, roofCol, wall, frame)
    else:
        low = info = roof(dict(type='skirt', w=w, d=d, y0=y0 + h, over=0.32, H=0.66, curve=0.35, lift=0.2, liftW=0.6, thick=0.12,
                               color=roofCol, tTop=0.46, rich=1, seed=31, bendUnder=True, **RT))
        top, smoke = chewy_upper(low, wall, frame, roofCol, w, d)
        ridge_bone(top['ridgeY'] + 0.1, 1.16 / 2 + 0.28 - 0.4, 0.34)
    pd = 0.62; pz = d / 2 + pd / 2 - 0.02
    with at((0.1, 0, pz)): doghouse(y0, roofCol, dogCol, archCol)
    cx, cz = -(w / 2 + 0.2), d / 2 - 0.12
    rain_chain(cx, info['underAt'](cx, cz), cz, 0.0, color='#c8a060')
    ex, ez = w / 2 + 0.2, d / 2 - 0.3
    with at((ex, info['underAt'](ex, ez) - 0.01, ez)): furin('#ffd0e0')
    if L >= 2: chewy_porch(d / 2, y0, roofCol, frame)
    F.pop()
    # the yard: mailbox, dog bowl, tennis ball, picket fence, flowers, laundry, firewood
    with at((1.05, 0, 1.2), ry=-0.3): mailbox('#e8403a')
    with at((-0.7, 0, 0.62)): dog_bowl()
    ball(0.08, (-1.1, 0.08, 1.2))
    picket_fence((-1.45, 1.42), (-0.5, 1.42), 0.45, seed=1)
    picket_fence((0.7, 1.42), (1.45, 1.42), 0.45, seed=2)
    with at((-1.15, 0, 0.9)): flower_patch(0.5, 0.45, 6, ('#ffd24a', '#ff8fb0', '#fffaf2'))
    with at((1.24, 0, -1.26) if L >= 2 else (1.2, 0, -1.2)): bush(0.3, ('#ff9ec0',), seed=3)
    with at((-1.2, 0, -1.2)): barrel(0.16, 0.34)
    if L >= 2:
        with at((1.33, 0, -0.46), ry=PI / 2): laundry(1.0, 1.15)
    else:
        with at((1.33, 0, -0.2), ry=PI / 2): laundry(1.2, 1.15)
    with at((-1.26, 0, -0.35), ry=-PI / 2): wood_stack(0.7, 0.42, 0.2)
    with at((-0.72, 0, 1.12), ry=2.2): watering_can('#e8807a')
    step_stones(0.1, 0.95, 0.1, 1.45, 2)
    return A, dict(door=(0.1, 0, 1.45), smoke=(round(smoke[0], 3), round(smoke[1], 3), round(smoke[2] + zc, 3)), ridgeY=round(top['ridgeY'], 3))


# ================================================================== emblems and parts for the Hall and the forge
def sakura_mark(size, pos=(0, 0, 0), depth=0.03, col='#ffbcd6', eye='#ff7aa8', tag='sym'):
    """the sakura crest in relief (symbols.js sakura): five round petals, a darker eye"""
    x, y, z = pos
    for i in range(5):
        a = PI / 2 + i * TAU / 5
        add(sph(1.0, (x + math.cos(a) * 0.21 * size, y + math.sin(a) * 0.21 * size, z), sc=(0.17 * size, 0.15 * size, depth), K=6, J=3, rz=a - PI / 2),
            lambda p, n: mix(mul(col, 0.88), mix(col, '#fff6fa', 0.3), clamp(n.z * 0.5 + 0.5 - 0.3 * n.y)), tag)
    add(sph(1.0, (x, y, z + depth * 0.4), sc=(0.09 * size, 0.09 * size, depth * 0.8), K=6, J=3), soft(eye, 0.2), tag)

def bell_mark(size, pos=(0, 0, 0), depth=0.03, col='#f4c04a', tag='sym'):
    pts = [(-0.32, -0.24)] + [(-0.22 - 0.1 * (1 - t) ** 2, -0.24 + 0.32 * t) for t in (0.3, 0.7, 1.0)] + \
          [(0.22 * math.cos(a), 0.08 + 0.24 * math.sin(a)) for a in (PI * 0.85, PI * 0.65, PI / 2, PI * 0.35, PI * 0.15)] + \
          [(0.22 + 0.1 * (1 - t) ** 2, -0.24 + 0.32 * t) for t in (1.0, 0.7, 0.3)] + [(0.32, -0.24)]
    with at(pos):
        add(puffy([(px * size, py * size) for px, py in pts][::-1], depth, bev=0.01), lac(col), tag)
        add(sph(0.07 * size, (0, -0.3 * size, depth * 0.5), K=5, J=3), lac(mul(col, 0.8)), tag)

def nobori(h=2.5, w=0.44, color='#2f4a7a', sym='sakura', tag='banners'):
    add(cyl(0.03, 0.036, h, (0, h / 2, 0), K=6), wood('#6b4a3a', ao_z=0.0), tag)
    add(cyl(0.02, 0.02, w + 0.08, (w / 2, h - 0.08, 0), K=4, rz=PI / 2), wood('#6b4a3a'), tag)
    add(sph(0.055, (0, h + 0.03, 0), K=6, J=3), lac(PAL['gold']), tag)
    fh = h * 0.72; yTop = h - 0.1
    def cloth(p, n):
        u = clamp((p.z - (yTop - fh)) / fh)
        return mix(mul(color, 0.82), mix(color, '#ffffff', 0.1), u * 0.7 + 0.2 * clamp(-n.y))
    add(beam(w, fh - 0.1, 0.03, (0.02 + w / 2, yTop - (fh - 0.1) / 2, 0), c=0.012, rx=0.02), cloth, tag)
    add(box(w + 0.004, 0.1, 0.034, (0.02 + w / 2, yTop - fh + 0.05, 0), r=0.0), soft('#fff6ea', 0.2), tag)
    add(box(0.05, fh, 0.036, (0.045, yTop - fh / 2, 0.002), r=0.0), soft('#fff6ea', 0.2), tag)
    for zz in (0.02,):
        with at((0.02 + w / 2, yTop - fh * 0.3, zz)):
            if sym == 'sakura': sakura_mark(w * 0.62, (0, 0, 0.0), depth=0.016, col='#fff6ea', eye='#ffb0c8', tag=tag)
            else: bell_mark(w * 0.62, (0, 0, 0.0), depth=0.016, col='#fff6ea', tag=tag)
    add(cyl(0.1, 0.13, 0.14, (0, 0.07, 0), K=7), stone_col(STONES[1]), tag)

def steps(w, n, rise, run, col, tag='steps'):
    """parts.js steps: n slabs rising toward -z, the front edge at z = 0"""
    rng = random.Random(9)
    for i in range(n):
        add(box(w - i * 0.06 + rng.uniform(-0.015, 0.015), rise * (i + 1) + 0.3, run + 0.02, (rng.uniform(-0.01, 0.01), (rise * (i + 1) - 0.3) / 2, -run * (i + 0.5)), r=0.04),
            stone_col(col, i, ao=False), tag)

def toro(s=0.8, tag='toro'):
    """props.js toro: a stone lantern (hex base, lotus, post, platform, the glowing fire box, the sweeping kasa, a jewel)"""
    c = '#d9d0c8'
    def st(k=1.0): return lambda p, n: mix(mul(c, 0.82 * k), mix(c, '#fbf6f2', 0.3), clamp(n.z * 0.6 + 0.35))
    with at((0, 0, 0), s=s):
        add(cyl(0.27, 0.3, 0.12, (0, 0.03, 0), K=6), st(), tag)
        add(glathe([(0.0, 0.09), (0.22, 0.09), (0.23, 0.12), (0.19, 0.17), (0.0, 0.17)], 6), st(), tag)
        add(cyl(0.092, 0.11, 0.46, (0, 0.42, 0), K=8), st(), tag)
        add(cyl(0.24, 0.14, 0.09, (0, 0.705, 0), K=6), st(), tag)
        add(cyl(0.13, 0.13, 0.2, (0, 0.86, 0), K=6), lambda p, n: '#fff0c8', tag, glow=True)
        for kk in range(0, 6, 2):
            a = (kk + 0.5) / 6 * TAU
            add(box(0.05, 0.22, 0.05, (math.cos(a) * 0.15, 0.86, math.sin(a) * 0.15), r=0.0, ry=-a), st(0.95), tag)
        add(cyl(0.2, 0.2, 0.03, (0, 0.765, 0), K=6), st(), tag)
        add(glathe([(0.0, 0.96), (0.33, 0.99), (0.38, 1.05), (0.34, 1.08), (0.2, 1.15), (0.08, 1.2), (0.0, 1.21)], 6,
                   rfn=lambda rr, z, th: rr * (1 + 0.06 * max(0.0, math.cos(6 * th))) if rr > 0.3 else rr),
            lambda p, n: mix(mul(c, 0.7), mix(c, '#fbf6f2', 0.35), clamp(n.z)), tag)
        add(glathe([(0.0, 1.2), (0.06, 1.21), (0.075, 1.27), (0.04, 1.33), (0.0, 1.37)], 5), st(), tag)

def kadomatsu(s=0.8, tag='kadomatsu'):
    with at((0, 0, 0), s=s):
        add(cyl(0.17, 0.19, 0.3, (0, 0.15, 0), K=7), lambda p, n: mix('#b89848', '#e6c87a', clamp(n.z * 0.5 + 0.5)), tag)
        for y in (0.07, 0.24): add(gloop([(0.185 * math.cos(TAU * k / 7), y, 0.185 * math.sin(TAU * k / 7)) for k in range(7)], 0.02, K=3), soft('#8a5a3a'), tag)
        for x, z, hh in ((0, -0.04, 0.95), (-0.07, 0.05, 0.75), (0.07, 0.05, 0.62)):
            add(cyl(0.045, 0.045, hh, (x, hh / 2 + 0.1, z), K=6), lambda p, n: '#f0f0c8' if n.z > 0.6 else mix('#5aa048', '#8ccf6a', clamp(n.x * 0.5 + 0.5)), tag)
        for i in range(4):
            a = i / 4 * TAU + 0.4
            add(glathe([(0.0, 0.0), (0.08, 0.0), (0.0, 0.17)], 4, pos=(math.cos(a) * 0.13, 0.34, math.sin(a) * 0.13), rz=-math.cos(a) * 1.0, rx=math.sin(a) * 1.0),
                lambda p, n: mix('#2f6a3a', '#4f8f4a', clamp(n.z)), tag)
        add(gloop([(0.19 * math.cos(TAU * k / 7), 0.31, 0.19 * math.sin(TAU * k / 7)) for k in range(7)], 0.022, K=3), soft('#e8d8a0'), tag)

def bell(r=0.13, color='#f4c04a', tag='bell'):
    k = r / 0.18
    add(glathe([(0.0, -0.4 * k), (r * 0.9, -0.44 * k), (r, -0.42 * k), (r * 0.72, -0.3 * k), (r * 0.62, -0.1), (r * 0.5, 0.02), (0.0, 0.02)], 10),
        lambda p, n: mix(mul(color, 0.8), mix(color, '#ffe8b0', 0.4), clamp(n.z * 0.4 + 0.4)), tag)
    add(gloop([(r * 0.75 * math.cos(TAU * i / 10), -0.3 * k, r * 0.75 * math.sin(TAU * i / 10)) for i in range(10)], 0.016, K=3), soft(mul(color, 0.75)), tag)
    add(gloop(circle(0.04, 6, 0.0, 0.0, 0.05), 0.016, K=3, up=F.N((0, 0, 1))), soft(mul(color, 0.7)), tag)

def shachi(x, y, s, k=1.0, tag='shachi'):
    """the golden shachihoko on a ridge end: a fish standing on its head, the tail curled up and in"""
    with at((x, y, 0), s=max(0.6, k)):
        pts = []; rad = []
        for q in range(8):
            t = q / 7
            pts.append((-s * (0.16 - t * 0.2) - s * math.sin(t * PI) * 0.05, t * 0.52, 0))
        add(gtube(pts, lambda u: 0.035 + math.sin(min(1, u * 1.25) * PI) * 0.11, K=6, up=F.N((0, 0, 1))), lac('#f4c04a', '#fff0b0', '#c8902a'), tag)
        add(prism([(-0.16, 0.0), (0.0, 0.08), (0.16, 0.0), (0.0, 0.2)], 0.06, -0.03).xform(F.m @ lm((-s * 0.06, 0.56, 0), rz=s * 0.5) @ F.m.inverted()), lac('#ffd870'), tag)
        for sz in (-1, 1):
            add(sph(0.03, (-s * 0.17, 0.1, sz * 0.085), K=5, J=3), flat(PAL['ink']), tag)
            add(sph(0.07, (-s * 0.02, 0.3, sz * 0.09), sc=(1.0, 0.5, 0.25), K=5, J=3, rz=s * 0.6), lac('#ffd870'), tag)

def door_slide(w=1.3, h=1.45, style='lattice', wd='#c98f5e', frame=None, tag='door'):
    """parts.js door (shoji / lattice): two sliding panels of glowing paper over kick boards, the lattice bars, a lintel"""
    frame = frame or PAL['frame']
    add(box(w, h, 0.03, (0, h / 2, 0.01), r=0.0), flat(mul(frame, 0.6)), tag)
    pw = w / 2 + 0.02; cells = 5 if style == 'lattice' else 3
    for s in (-1, 1):
        with at((s * (w / 4 - 0.005), 0, 0.03 + (0.025 if s > 0 else 0))):
            add(beam(pw - 0.04, 0.42, 0.04, (0, 0.25, 0), c=0.014), wood(wd), tag)
            add(box(pw - 0.06, h - 0.56, 0.02, (0, 0.46 + (h - 0.56) / 2, 0), r=0.0), lambda p, n: PAL['paper'], tag, glow=True)
            for i in range(1, cells): add(box(0.026, h - 0.56, 0.022, (-pw / 2 + i * pw / cells, 0.46 + (h - 0.56) / 2, 0.018), r=0.0), flat(frame), tag)
            for j in range(1, 4): add(box(pw - 0.06, 0.026, 0.022, (0, 0.46 + j * (h - 0.56) / 4, 0.018), r=0.0), flat(frame), tag)
            frame_ring(pw - 0.03, h - 0.04, 0.02, 0.03, wood(frame), tag)
    add(beam(w + 0.24, 0.13, 0.12, (0, h + 0.06, 0.05), c=0.03), wood(frame), tag)
    for s in (-1, 1): add(beam(0.11, h, 0.1, (s * (w / 2 + 0.03), h / 2, 0.05), c=0.025), wood(frame), tag)
    add(beam(w + 0.2, 0.05, 0.14, (0, 0.02, 0.06), c=0.018), wood(mul(frame, 0.9)), tag)

def hammer_mark(size, pos=(0, 0, 0), tag='sign'):
    x, y, z = pos
    add(beam(0.09 * size, 0.5 * size, 0.04, (x, y - 0.13 * size, z + 0.02), c=0.01), soft('#c98f5e', 0.2), tag)
    add(beam(0.6 * size, 0.22 * size, 0.05, (x, y + 0.2 * size, z + 0.03), c=0.014), soft('#6a6878', 0.3), tag)

def plank_walls(w, d, h, y0, planks, frame, seed=5, tag='walls'):
    """parts.js walls({planks}): a dark core, horizontal boards each its own tone (the gaps read as seams), corner posts,
    a sill and a head beam"""
    rng = random.Random(seed)
    add(box(w - 0.02, h, d - 0.02, (0, y0 + h / 2, 0), r=0.03), flat(mul(planks, 0.5)), tag)
    n = max(2, round(h / 0.22)); bh = h / n
    for side in 'frbl':
        L = (w if side in 'fb' else d) - 0.1
        with on_face(dict(w=w - 0.03, d=d - 0.03), side, 0, y0):
            for i in range(n):
                c = mul(planks, rng.uniform(0.9, 1.08))
                add(box(L, bh - 0.018, 0.035, (rng.uniform(-0.01, 0.01), bh * (i + 0.5), 0.0), r=0.0),
                    lambda p, nn, c=c: mul(c, 0.86 + 0.14 * clamp(nn.z + 0.5) - 0.05 * clamp(-nn.y)), tag)
    pt = 0.13
    for sx in (-1, 1):
        for sz in (-1, 1):
            add(beam(pt, h + 0.04, pt, (sx * (w / 2 - pt * 0.25), y0 + h / 2, sz * (d / 2 - pt * 0.25)), c=0.03), wood(frame, ao_z=y0, seed=3), 'timber')
    for (W_, D_, sd) in ((w + 0.06, d + 0.06, 0), (d + 0.06 - 0.18, w + 0.06, 1)):
        for sg in (-1, 1):
            with at((0, 0, 0), ry=sd * PI / 2):
                add(beam(W_, 0.1, 0.09, (0, y0 + 0.05, sg * (D_ / 2 - 0.045)), c=0.022), wood(mul(frame, 0.92)), 'timber')

def tool_rack(w, tools, tag='tools'):
    """trim.js toolRack (face frame, the batten at y = 0): tools hanging from pegs"""
    add(beam(w, 0.05, 0.04, (0, 0, 0.02), c=0.012), wood('#6b4a3a'), tag)
    for i, t in enumerate(tools):
        x = -w / 2 + (i + 0.5) * w / len(tools)
        add(box(0.025, 0.025, 0.06, (x, 0, 0.05), r=0.0), flat(PAL['iron']), tag)
        if t == 'hammer':
            add(box(0.035, 0.26, 0.025, (x, -0.14, 0.05), r=0.0), wood('#c98f5e'), tag)
            add(beam(0.11, 0.05, 0.045, (x, -0.27, 0.05), c=0.01), soft('#5a5664', 0.3), tag)
        elif t == 'tongs':
            for s in (-1, 1): add(box(0.02, 0.34, 0.02, (x + s * 0.014, -0.17, 0.05), r=0.0, rz=s * 0.08), soft('#4a4650', 0.3), tag)
        elif t == 'saw':
            add(box(0.11, 0.26, 0.012, (x, -0.19, 0.05), r=0.0), soft('#c8c8d0', 0.3), tag)
            add(beam(0.045, 0.1, 0.035, (x, -0.03, 0.05), c=0.01), wood('#c98f5e'), tag)
        elif t == 'hat':
            add(glathe([(0.0, 0.0), (0.16, 0.0), (0.0, 0.08)], 8, pos=(x, -0.1, 0.06), rx=PI / 2), soft('#e2c46a', 0.3), tag)

def anvil(tag='anvil'):
    add(cyl(0.2, 0.24, 0.38, (0, 0.19, 0), K=9, bev=0.02), lambda p, n: '#e8c08a' if n.z > 0.8 else mul('#8a5e44', 0.9 + 0.12 * clamp(n.z + 0.5)), tag)
    add(beam(0.22, 0.1, 0.17, (0, 0.43, 0), c=0.02), soft('#4a4650', 0.3), tag)
    add(box(0.12, 0.12, 0.1, (0, 0.53, 0), r=0.0), soft('#4a4650', 0.3), tag)
    add(beam(0.36, 0.1, 0.16, (0.02, 0.63, 0), c=0.025), lambda p, n: mix('#4a4858', '#8a88a0', clamp(n.z)), tag)
    add(glathe([(0.0, 0.0), (0.07, 0.0), (0.0, 0.2)], 7, pos=(0.2, 0.635, 0), rz=-PI / 2), lambda p, n: mix('#4a4858', '#8a88a0', clamp(n.z)), tag)
    add(beam(0.07, 0.07, 0.17, (-0.05, 0.72, 0.02), c=0.012), soft('#6a6878', 0.3), tag)
    add(cyl(0.017, 0.017, 0.26, (-0.18, 0.72, 0.02), K=4, rz=PI / 2), wood('#c98f5e'), tag)

def bucket(r=0.2, h=0.3, tag='bucket'):
    add(glathe([(0.0, 0.0), (r * 0.85, 0.0), (r, h), (r * 0.93, h), (r * 0.8, h * 0.82), (0.0, h * 0.82)], 10),
        lambda p, n: '#5ab8d8' if n.z > 0.9 and p.z > F.W((0, h * 0.7, 0)).z else mul('#c98f5e', 0.88 + 0.12 * clamp(n.z + 0.4)), tag)
    for y in (0.25, 0.8):
        R = r * (0.85 + 0.15 * y) + 0.006
        add(gloop([(R * math.cos(TAU * k / 10), h * y, R * math.sin(TAU * k / 10)) for k in range(10)], 0.014, K=3), soft(PAL['iron'], 0.3), tag)
    add(gtube([((t * 2 - 1) * (r + 0.004), h + 0.03 + math.sin(t * PI) * r * 0.7, 0) for t in (0, 0.2, 0.5, 0.8, 1)], 0.01, K=3), flat('#e8d4a0'), tag)

def forge(tag='forge'):
    """special.js boneSmith forge (its own frame): the stone hearth with its glowing mouth and coal bed, the hood, the tall
    chimney, the bellows. Returns the smoke point."""
    add(box(0.95, 0.62 + 0.3, 0.8, (0, (0.62 - 0.3) / 2, 0), r=0.06), stone_col(STONES[2], 2, ao=False), tag)
    rng = random.Random(14)
    for i in range(8):
        add(sph(0.11, (-0.4 + (i % 4) * 0.27, 0.13 + (i // 4) * 0.34, 0.405), sc=(1.1, 0.8, 0.45), K=6, J=3), stone_col(STONES[rng.randrange(6)], i, ao=False), tag)
    add(beam(1.0, 0.08, 0.85, (0, 0.64, 0), c=0.03), stone_col(STONES[4], 5, ao=False), tag)
    add(box(0.6, 0.04, 0.46, (0, 0.67, 0.06), r=0.0), flat('#3a3036'), tag)
    for i in range(12):
        c = rng.choice(['#ff7a2a', '#ffb040', '#ff5a20', '#ffd060'])
        add(sph(0.06, (rng.uniform(-0.24, 0.24), 0.69, rng.uniform(-0.14, 0.24)), sc=(1, 0.7, 1), K=5, J=3), lambda p, n, c=c: c, tag, glow=True)
    mouth = [(0.2, 0.0)] + [(0.2 * math.cos(a), 0.14 + 0.2 * math.sin(a)) for a in [PI * k / 8 for k in range(9)]] + [(-0.2, 0.0)]
    with at((0, 0.1, 0.4)):
        add(prism(mouth[::-1], 0.02, 0.0), lambda p, n: '#ffa040', tag, glow=True)
    add(gtube([(x, y, 0.42) for x, y in arc_pts(0, 0.24, 0.22, 0.0, PI, 8)], 0.05, K=5, up=F.N((0, 0, 1))), stone_col(STONES[1], 4, ao=False), tag)
    add(cyl(0.14, 0.4, 0.42, (0, 1.2, -0.12), K=4), lambda p, n: mix('#6a6270', '#a8a0b0', clamp(n.z * 0.6 + 0.4)), tag)
    for sx in (-1, 1): add(box(0.06, 0.5, 0.06, (sx * 0.3, 0.9, -0.3), r=0.0), soft(PAL['iron'], 0.3), tag)
    smoke = chimney(0, -0.14, 1.38, 2.9, 0.95, hat=True, seed=19)
    with at((0.62, 0.36, 0.1)):
        add(sph(0.2, (0, 0, 0), sc=(0.8, 0.5, 1.1), K=8, J=4), lambda p, n: mix('#6a4028', '#a86a42', clamp(n.z * 0.6 + 0.4)), tag)
        add(cyl(0.03, 0.05, 0.3, (-0.24, 0.02, 0), K=6, rz=PI / 2), soft(PAL['iron'], 0.3), tag)
        add(box(0.05, 0.05, 0.3, (0.12, 0.1, 0), r=0.0), wood('#c98f5e'), tag)
    return smoke

# ================================================================== Blossom Hall (special.js townHall, 6 x 4)
def build_townhall():
    new_asset('townHall', dict(wall='#fff6ea', wallLo='#f2e2ce', frame='#8f6a52', frameLo='#6b4a3a', paper='#fffaf0'))
    roofCol, VER = '#5d6f9e', '#e2573a'
    zc, w, d, h, y0 = -0.5, 4.2, 2.2, 1.7, 0.44
    RT = dict(ribW=0.42, ribAmp=0.044, course=0.42, courseAmp=0.028, pastel=0.2, color=roofCol, rich=2)
    with at((0, 0, -0.25)): foundation(5.3, 3.2, y0, pad=0.1, seed=4, color='#a89ca8', gap=0.85)
    with at((0, 0, 2.0)): steps(1.9, 3, y0 / 3, 0.2, STONES[3])
    engawa(-2.55, 2.55, zc + d / 2, 1.28 - (zc + d / 2) + 0.05, y0 + 0.02, seed=12)
    F.push((0, 0, zc))
    walls(dict(w=w, d=d, h=h, y0=y0, plaster='#fff6ea', koshi='#c9a27a', koshiSkip='f', posts={'f': [-1.25, 1.25]}))
    blk = dict(w=w, d=d)
    with on_face(blk, 'f', 0, y0):
        door_slide(1.3, 1.45, 'lattice')
        noren(1.3, 0.55, 1.5, 0.18, '#2f4a7a', 3, 0.3, sym='sakura')
    for u in (-1.75, -0.95, 0.95, 1.75):
        with on_face(blk, 'f', u, y0 + 0.95): shoji(0.58, 0.62, box_=abs(u) > 1.5, flowers=['#ff9ec0', '#fffaf2'])
    for u in (-0.5, 0.5):
        with on_face(blk, 'r', u, y0 + 0.95): shoji(0.7, 0.6)
        with on_face(blk, 'l', u, y0 + 0.95): shoji(0.7, 0.6)
    for u in (-1.2, 0.0, 1.2):
        with on_face(blk, 'b', u, y0 + 0.95): shoji(0.7, 0.6)
    low = roof(dict(type='skirt', w=w, d=d, y0=y0 + h, over=0.62, H=0.95, curve=0.38, lift=0.34, liftW=0.9, thick=0.16, tTop=0.5, seed=61, bendUnder=True, **RT))
    with at((0, 0, d / 2 + 0.2)):
        roof(dict(type='gable', ridge='z', w=1.5, d=1.3, y0=y0 + h + 0.18, over=0.3, gOver=0.24, H=0.62, curve=0.45, lift=0.22, liftW=0.45,
                  thick=0.13, gable='ornate', skipGable=1, seed=67, bendUnder=True, **dict(RT, ribW=0.33, course=0.34)))
    posts_row([-2.4, -1.25, 1.25, 2.4], d / 2 + 0.5, y0 + h - 0.1, VER, r=0.075, tag='veranda')
    add(beam(4.9, 0.12, 0.1, (0, y0 + h - 0.12, d / 2 + 0.5), c=0.03), lac(VER), 'veranda')
    for x in (-1.85, -0.62, 0.62, 1.85): chochin(0.13, 0.26, '#e8503a', cord=0.02, pos=(x, y0 + h - 0.2, d / 2 + 0.5), tag='veranda')
    # the upper storey
    y2 = low['topY']; w2 = max(3.0, low['openW'] + 0.12); d2 = max(1.3, low['openD'] + 0.1); h2 = 1.25
    walls(dict(w=w2, d=d2, h=h2, y0=y2, plaster='#fff6ea', sill=False))
    blk2 = dict(w=w2, d=d2)
    for u in (-1.0, 1.0):
        with on_face(blk2, 'f', u, y2 + 0.66): shoji(0.56, 0.5)
    with on_face(blk2, 'f', 0, y2 + 0.68):
        signboard_board(1.0, 0.46, '#3a2a30', '#f4c04a', 'sign')
        sakura_mark(0.38, (0, 0, 0.04), depth=0.03, tag='sign')
    with on_face(blk2, 'r', 0, y2 + 0.66): round_window(0.26)
    with on_face(blk2, 'l', 0, y2 + 0.66): round_window(0.26)
    with on_face(blk2, 'b', 0, y2 + 0.66): shoji(1.0, 0.5)
    top = roof(dict(type='irimoya', w=w2, d=d2, y0=y2 + h2, over=0.55, H=1.05, curve=0.46, lift=0.4, liftW=0.9, thick=0.17, gable='ornate',
                    tg=0.46, gOver=0.22, shachi=True, seed=71, bendUnder=True, **RT))
    # the bell cupola on the ridge (its bell hangs still: the game drops the kit's swinging part)
    with at((0, top['ridgeY'] + 0.12, 0)):
        add(beam(0.8, 0.1, 0.7, (0, 0.02, 0), c=0.03), lac(VER), 'cupola')
        for sx in (-1, 1):
            for sz in (-1, 1): add(beam(0.07, 0.62, 0.07, (sx * 0.3, 0.35, sz * 0.26), c=0.016), lac(VER), 'cupola')
        for sz in (-1, 1): add(beam(0.66, 0.06, 0.06, (0, 0.62, sz * 0.26), c=0.014), lac(VER), 'cupola')
        roof(dict(type='hip', w=0.62, d=0.56, y0=0.68, over=0.2, H=0.42, curve=0.5, lift=0.14, liftW=0.25, thick=0.08, ribW=0.2, ribAmp=0.025,
                  course=0.0, tTop=0.9, color=roofCol, pastel=0.2, rich=2, seed=73, discs=False, curl=False, bendUnder=True))
        with at((0, 0.6, 0)): bell(0.13, '#f4c04a', 'cupola')
    F.pop()
    for sx in (-1, 1):
        cx, cz = sx * 2.5, zc + d / 2 + 0.45
        rain_chain(cx, low['underAt'](cx, cz - zc), cz, y0 + 0.02, color='#b58a4a')
        with at((sx * 2.12, y0 + h - 0.2, zc + d / 2 + 0.5)): furin('#bfe6ff' if sx > 0 else '#ffd0e0')
        with at((sx * 0.98, y0 + 0.02, zc + d / 2 + 0.55)): kadomatsu(0.8)
    with at((-2.7, 0, 1.55)): nobori(2.5, 0.44, '#ff8fb0', 'sakura')
    with at((2.7, 0, 1.55), ry=PI): nobori(2.5, 0.44, '#2f4a7a', 'bell')
    for x in (-1.35, 1.35):
        with at((x, 0, 1.72), ry=0.1 * x): toro(0.8)
    for i, x in enumerate((-2.2, 2.2)):
        with at((x, 0, 1.75)): bush(0.28, ('#ff9ec0', '#fffaf2'), seed=7 + i, nf=3)
    return A, dict(door=(0, 0, 2.15), ridgeY=round(top['ridgeY'], 3))

# ================================================================== Bonesmith Forge (special.js boneSmith, 3 x 3)
def build_bonesmith():
    new_asset('boneSmith', dict(wall='#fff4e2', wallLo='#efdcc4', frame='#6a4a3a', frameLo='#4a3226', paper='#fffaf0'))
    roofCol = '#5d6f9e'
    w, d, h, y0, cx, cz = 1.9, 1.3, 1.45, 0.22, 0.45, -0.75
    F.push((cx, 0, cz))
    foundation(w, d, y0, pad=0.14, seed=6, color='#a89ca8')
    plank_walls(w, d, h, y0, '#9a7a62', '#6a4a3a')
    blk = dict(w=w, d=d)
    with on_face(blk, 'f', 0.35, y0):
        door_wood(0.72, 1.2, '#b08a64', '#6a4a3a')
        with at((0, 1.34, 0.1)):
            signboard_board(0.62, 0.3, '#f4e0c0', '#6a4a3a', 'sign')
            hammer_mark(0.26, (0, 0, 0.035), 'sign')
            bone(0.2, (0.2, -0.02, 0.06), rz=0.5, r=0.02, col='#fff6e6', tag='sign')
    with on_face(blk, 'f', -0.5, y0 + 0.8): shoji(0.42, 0.4, frame='#6a4a3a')
    with on_face(blk, 'r', 0, y0 + 0.8): shoji(0.55, 0.42, frame='#6a4a3a')
    info = roof(dict(type='gable', w=w, d=d, y0=y0 + h, over=0.36, gOver=0.28, H=0.78, curve=0.35, lift=0.2, liftW=0.5, thick=0.14,
                     ribW=0.27, ribAmp=0.034, course=0.27, courseAmp=0.022, color=roofCol, pastel=0.12, gable='wood', timber='#4a3226',
                     rich=1, seed=79, bendUnder=True))
    with on_face(blk, 'f', -0.5, y0 + 0.52): tool_rack(0.52, ['tongs', 'hammer', 'tongs'])
    with on_face(blk, 'r', 0.05, y0 + 0.5): tool_rack(0.55, ['hat', 'saw', 'hammer'])
    F.pop()
    with at((-0.85, 0, -0.55)): smoke = forge()
    with at((-0.25, 0, 0.45), ry=0.35): anvil()
    with at((-1.05, 0, 0.5)): bucket(0.2, 0.3)
    with at((0.95, 0, 0.55), ry=-0.2):
        for sx in (-1, 1): add(beam(0.06, 0.95, 0.06, (sx * 0.36, 0.47, 0), c=0.015), wood('#9c7458', ao_z=0.0), 'rack')
        for y in (0.25, 0.85): add(beam(0.82, 0.05, 0.08, (0, y, 0), c=0.014), wood('#9c7458'), 'rack')
        for i in range(3): bone(0.52, (-0.22 + i * 0.22, 0.56, 0.06), rz=PI / 2, r=0.05, col='#fff6e6', tag='rack')
    with at((1.25, 0, -0.05)): wood_stack(0.45, 0.36, 0.3, roofed=False, seed=9)
    with at((-1.3, 0, -1.25)): barrel(0.16, 0.34)
    with at((-0.55, 0, 1.2)): crate(0.3, '#e2b988', seed=4)
    return A, dict(door=(0.8, 0, 0.3), smoke=(round(smoke[0] - 0.85, 3), round(smoke[1], 3), round(smoke[2] - 0.55, 3)), ridgeY=round(info['ridgeY'], 3))


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
    print('LH %s tris %d %s' % (name, A.tris(), {k: A.tris(k) for k in A.objs}))
    print('LH %s parts %s' % (name, dict(sorted(A.count.items(), key=lambda kv: -kv[1]))))
    print('LH %s bounds blender x %.3f..%.3f y %.3f..%.3f z %.3f..%.3f | game z %.3f..%.3f' % (name, lo.x, hi.x, lo.y, hi.y, lo.z, hi.z, -hi.y, -lo.y))
    for ob in obs: print('LH %s check %s %s' % (name, ob.name, check(ob)))
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, name + '.blend'))
    for o in bpy.context.scene.objects: o.select_set(o.type == 'MESH')
    out = os.path.join(MODELS, name + '.glb')
    kw = dict(filepath=out, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
              export_attributes=True, export_lights=False, export_cameras=False, export_animations=False,
              export_normals=True, export_texcoords=False, export_materials='EXPORT')
    try: bpy.ops.export_scene.gltf(export_vertex_color='ACTIVE', **kw)
    except TypeError as e:
        print('LH export_vertex_color rejected:', e); bpy.ops.export_scene.gltf(export_colors=True, **kw)
    print('LH wrote', out)

PIECES = {'rosieShop': build_rosie, 'chewyHouse-1': lambda: build_chewy(1), 'chewyHouse-2': lambda: build_chewy(2),
          'chewyHouse-3': lambda: build_chewy(3), 'townHall': build_townhall, 'boneSmith': build_bonesmith}
for name in (list(PIECES) if PIECE == 'all' else [PIECE]):
    asset, info = PIECES[name]()
    finish(asset)
    print('LH %s info %s' % (name, info))
    export_level(asset, name)
