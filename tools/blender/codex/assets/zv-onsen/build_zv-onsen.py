# PAWHAVEN: Yukimi Spa Village (the onsen zone village) buildings in Blender (task zv-onsen), built by script.
#   blender --background --factory-startup --python build_zv-onsen.py -- --piece elder|shop|...|all
# Deterministic: seeded PRNGs only; a re-run reproduces every GLB exactly.
# Frame: 1 unit = 1 m, Blender Z up, the front (the door side, the kit's +z) faces -Y (the glTF exporter makes it the game's
# +z), centred on the kit's local origin (src/regions/village/artOnsen.js). The layout code is written in the kit's game
# frame (x, y up, z front) and mapped to Blender (x, -z, y).
# The shared kit (mesh accumulator with painted vertex colours, rounded boxes, lathes, tubes, the roof maths ported from
# roofs.js with crisp tile courses, walls, shoji, doors) comes from the Blossom Hollow landmarks
# (tools/blender/codex/assets/landmarks-hollow); the snow kit (blankets, sheets, pillows, icicles) ports artOnsen.js.
# Each GLB: the building (body), `window_glow`, `saved` (shown only once the village is saved) and `siege` (only while
# besieged); `hot_glow` is the saved brazier's coals.
import bpy, bmesh, math, os, sys, random
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..', '..'))
MODELS = os.path.join(REPO, 'public', 'models')
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
PIECE = argv[argv.index('--piece') + 1] if '--piece' in argv else 'all'
print('ZV build pid', os.getpid())
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

A = None; OB = 'guild'; GLOW = 'window_glow'; LAYER = None
def add(t, col, tag='misc', glow=False):
    """route a shell: the main object (body), its glow objects ('window_glow', 'hot_glow'), or the current overlay layer
    ('saved' / 'siege': one object each, carrying whatever materials it needs)"""
    mat = 'hot_glow' if glow == 'hot' else 'ore_glow' if glow == 'ore' else (GLOW if glow else 'body')
    obj = LAYER if LAYER else (OB if mat == 'body' else mat)
    A.add(obj, mat, t, col, (LAYER + ':' if LAYER else '') + tag)
    return t
class layer:
    def __init__(self, name): self.name = name
    def __enter__(self):
        global LAYER; self.prev = LAYER; LAYER = self.name
    def __exit__(self, *e):
        global LAYER; LAYER = self.prev

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
        while k * step < t1 and k * step < R.get('courseT', 9.0):
            for tt in (k * step - eps, k * step):
                if t0 + 1e-3 < tt < t1 - 1e-3: ts.add(tt)
            k += 1
    else:
        if R.get('mid', True): ts.add(lerp(t0, t1, 0.5))
    if R.get('courseT', 9.0) < t1:                        # (above courseT, under the snow: a few plain rows)
        tc = max([x for x in ts if x < R['courseT'] + 1e-6] + [t0])
        for q in (1, 2, 3): ts.add(lerp(tc, t1, q / 4))
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
            tp = taper(s, t)
            y += rib * R['ribAmp'] * tp
            if step > 0 and t < R.get('courseT', 9.0) + 1e-3:
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
             rich=o.get('rich', 2), seed=o.get('seed', 7), shachi=o.get('shachi', False), courseT=o.get('courseT', 9.0), mid=o.get('mid', True))
    RP = roof_pal(o.get('color', '#558f8e'), o.get('pastel', 0.12), o.get('contrast', 1.0))
    RP.update(o.get('pal', {}))
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
        roof_face(R, dict(E0=(-X, Bz), E1=(X, Bz), R0=(-X, 0), R1=(X, 0), t0=t0, t1=1.0, c0=True, c1=True, d0=(-1, 0.5), d1=(1, 0.5),
                          eave=True, open0=True, open1=True, barge=True, lift=upl, fi=5, discs=False))
        roof_face(R, dict(E0=(X, -Bz), E1=(-X, -Bz), R0=(X, 0), R1=(-X, 0), t0=t0, t1=1.0, c0=True, c1=True, d0=(1, -0.5), d1=(-1, -0.5),
                          eave=True, open0=True, open1=True, barge=True, lift=upl, fi=6, discs=False))
        yTop = R['yb'] + R['H'] * prof(tg, R['curve']) + R['ribAmp'] * 0.5
        for sx in (-1, 1): gable_tri(R, o, sx * xg, sx, tg, Bz, yTop)
        if o.get('ridgeCap', True): ridge(R, -X - 0.05, X + 0.05, R['yb'] + R['H'], oni=o.get('oni', True))
        out.update(xg=xg, X=X)
    elif typ == 'gable':                              # (roofs.js gable: two slopes, the gable ends at x = +-w/2)
        X = o['w'] / 2 + o.get('gOver', 0.35)
        roof_face(R, dict(E0=(-X, Bz), E1=(X, Bz), R0=(-X, 0), R1=(X, 0), t0=0.0, t1=1.0, c0=True, c1=True, d0=(-1, 0.4), d1=(1, 0.4),
                          eave=True, open0=True, open1=True, barge=True, fi=3))
        roof_face(R, dict(E0=(X, -Bz), E1=(-X, -Bz), R0=(X, 0), R1=(-X, 0), t0=0.0, t1=1.0, c0=True, c1=True, d0=(1, -0.4), d1=(-1, -0.4),
                          eave=True, open0=True, open1=True, barge=True, fi=4))
        for sx in (-1, 1):
            if o.get('skipGable') != sx: gable_tri(R, o, sx * o['w'] / 2, sx, 0.0, Bz, o['y0'])
        if o.get('ridgeCap', True): ridge(R, -X - 0.05, X + 0.05, R['yb'] + R['H'], oni=o.get('oni', True))
        yAt = lambda x, z: R['yb'] + R['H'] * prof(clamp((Bz - abs(z)) / Bz), R['curve'])
        out.update(X=X)
    elif typ == 'hip':
        tt = o.get('tTop', 1.0)                       # (a square hip stops short of its apex; the finial caps it)
        for i, f in enumerate(hip4):
            roof_face(R, dict(f, t0=0.0, t1=tt, c0=True, c1=True, eave=True, hip1=True, hipT=tt, fi=i + 10, discs=o.get('discs', True), curl=o.get('curl', True)))
        if o.get('finial', True): finial(R, R['yb'] + R['H'] * prof(tt, R['curve']) - 0.02, R['k'])
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


# ================================================================== Yukimi Spa Village (artOnsen.js): palette
T = dict(timber='#3a2a24', timberMid='#5a4032', wood='#8a6448', woodLight='#b48c66', deck='#9c7a5a', bengara='#6a2e28',
         plaster='#f2eadc', koshi='#4e3a30', stone='#8e94a6', stoneLight='#a8aebe', stoneDark='#6c7284',
         tile='#4c546c', tileEdge='#363a4c', soffit='#4a3830', paper='#fff0d4', paperDim='#d6d0c4',
         thatch='#9a8466', thatchCut='#c8b088', camellia='#c8283a', indigo='#2e3e74', crimson='#b02a3e', mikan='#f08a2a',
         ice='#9fd2ff', iron='#4a4652', ink='#2e2628', brick='#7a4436')
ONSEN_STONES = ['#a0a6b8', '#8e94a6', '#aeb4c4', '#868ca0', '#b6bac8', '#989eb0']
SLATE_PAL = dict(color='#4c546c', hi='#68728e', groove='#363c50', shadow='#2e3446', edge='#3c4258', under='#4a3830',
                 trim='#454c62', disc='#5e6882', cap='#3a4054')
SNOW_HI, SNOW_SH, SNOW_LO = '#f0f5fd', '#c6d2ee', '#a2b4de'

def n2(a, b, s=0):
    """signed 2-D value noise (-1..1)"""
    return (vnoise(Vector((a, b, 0.37)), 1.0, s) - 0.5) * 2

def snow_col(seed=0):
    """soft snow by normal (artOnsen snowCol): white on top, periwinkle on the sides, deep blue underneath, a broad
    hand-painted variation"""
    def f(p, n):
        up = n.z
        c = mix(SNOW_SH, SNOW_HI, clamp(up * 1.3 - 0.02))
        c = mix(c, SNOW_LO, clamp(-up - 0.05) * 0.85)
        return mul(c, 0.965 + 0.06 * vnoise(p, 2.3, seed))
    return f
SNOW = snow_col(3)

def sbox(w, h, d, pos=(0, 0, 0), r=0.03, ry=0.0, rx=0.0, rz=0.0, extra=(0, 0, 0)):
    """a rounded box with no small-size override (snow, cloth)"""
    return rbox((w, d, h), r=r, extra=extra, M=F.m @ lm(pos, ry, rx, rz))

def ice_col(ytop, L):
    def f(p, n):
        u = clamp((ytop - p.z) / L)
        return mul(mix('#eef9ff', T['ice'], u * 0.85), 0.92 + 0.12 * clamp(n.z + 0.6))
    return f

def icicle(x, y, z, L, tag='ice'):
    r0 = 0.024 + L * 0.09
    t = lathe([(0.0, -L), (r0 * 0.5, -L * 0.5), (r0, 0.0), (0.0, 0.018)], 5, th0=(x * 7 + z * 3) % 1.0)
    t.xform(F.m @ lm((x, y + 0.012, z)))
    add(t, ice_col(F.W((x, y, z)).z, L), tag)

def pillow(pos, r, sq=0.42, seed=0, sx=1.0, sz=1.0, K=9, J=4, ry=0.0, tag='snow', col=None, fine=True):
    """artOnsen pillow: a soft lumpy squashed dome centred at pos (half of it buried)"""
    ph = seed * 1.37 + 0.4
    big = fine and r * max(sx, sz) >= 0.17
    if big: K, J = max(K, 14), max(J, 6)
    prof = [(math.sin(math.pi * j / J), -math.cos(math.pi * j / J)) for j in range(J + 1)]
    prof[0] = (0.0, -1.0); prof[-1] = (0.0, 1.0)
    t = lathe(prof, K, th0=ph, rfn=lambda rr, z, th: rr * (1 + 0.11 * math.sin(3 * th + ph) + 0.07 * math.sin(5 * th + ph * 2.1)))
    t.xform(F.m @ lm(pos, ry=ry, s=(r * sx, r * sq, r * sz)))
    add(t, col or SNOW, tag)

def snow_slab(x, y, z, w, d, t=0.08, seed=0, tag='snow', spacing=0.5):
    """artOnsen snowSlab: a rounded slab on a flat top with pillows along it"""
    add(sbox(w, t, d, (x, y + t / 2, z), r=min(t * 0.48, w * 0.3, d * 0.3)), SNOW, tag)
    n = max(1, round(max(w, d) / spacing)); along = w >= d
    for i in range(n):
        u = (i + 0.5) / n - 0.5
        pillow((x + (u * w * 0.9 if along else 0), y + t * 0.75, z + (0 if along else u * d * 0.9)), min(w, d) * 0.42 + 0.03, 0.38,
               seed + i * 7, 1.2 if along else 0.9, 0.9 if along else 1.2, K=10, J=4, tag=tag, fine=False)

def bank(x0, x1, z, r=0.32, seed=0, sq=0.42, tag='bank'):
    """snow banked along a wall foot: a row of drifts along local x"""
    n = max(1, round((x1 - x0) / (r * 1.6))); rng = random.Random(seed * 31 + 5)
    for i in range(n):
        x = x0 + (i + 0.5) * (x1 - x0) / n + rng.uniform(-0.06, 0.06)
        pillow((x, 0.02, z + rng.uniform(-0.05, 0.05)), r * (0.85 + 0.3 * rng.random()), sq, seed + i * 5, 1.25, 0.8, K=9, J=4, tag=tag, fine=False)

def drips_fn(n, seed, Lmin=0.03, Lmax=0.08, wmin=0.012, wmax=0.03):
    """rounded drips along a periodic parameter u in 0..1: (centre, length, half width)"""
    rng = random.Random(seed)
    D = [(rng.random(), rng.uniform(Lmin, Lmax), rng.uniform(wmin, wmax)) for _ in range(n)]
    def f(u):
        e = 0.0
        for c, L, w in D:
            d = (u - c + 0.5) % 1.0 - 0.5
            if abs(d) < w: e += L * (1 - (d / w) ** 2) ** 0.6
        return e
    return f

# ------------------------------------------------------------------ the rounded-rectangle snow blanket (hip roofs)
def rr_point(ax, az, rc, f):
    """a point on a rounded rectangle (half extents ax x az, corner radius rc) at perimeter fraction f from +x toward +z
    -> (x, z, nx, nz)"""
    rc = max(1e-4, min(rc, ax, az))
    sx, sz = ax - rc, az - rc; q = PI / 2 * rc; Lp = 4 * sx + 4 * sz + 4 * q
    s = (f % 1.0) * Lp
    def arc(cx, cz, a0, s):
        a = a0 + s / rc; return (cx + math.cos(a) * rc, cz + math.sin(a) * rc, math.cos(a), math.sin(a))
    if s < sz: return (ax, s, 1.0, 0.0)
    s -= sz
    if s < q: return arc(sx, sz, 0.0, s)
    s -= q
    if s < 2 * sx: return (sx - s, az, 0.0, 1.0)
    s -= 2 * sx
    if s < q: return arc(-sx, sz, PI / 2, s)
    s -= q
    if s < 2 * sz: return (-ax, sz - s, -1.0, 0.0)
    s -= 2 * sz
    if s < q: return arc(-sx, -sz, PI, s)
    s -= q
    if s < 2 * sx: return (-sx + s, -az, 0.0, -1.0)
    s -= 2 * sx
    if s < q: return arc(sx, -sz, PI * 1.5, s)
    s -= q
    return (ax, -sz + s, 1.0, 0.0)

def lip_rolls(Lp, period, seed, ndrip_frac=0.45, Lmin=0.05, Lmax=0.11):
    """the cornice's puffy rolls along a lip of length Lp (period ~0.5 m) and rounded drips hanging from some of the
    hollows between them -> (roll(s) 0..1, drip(s) m), s: arc length along the lip (periodic)"""
    rng = random.Random(seed)
    n = max(3, round(Lp / period)); per = Lp / n; ph = rng.random()
    D = []
    for i in range(n):
        if rng.random() < ndrip_frac: D.append(((i + 0.5 + ph) * per + rng.uniform(-0.04, 0.04), rng.uniform(Lmin, Lmax), per * rng.uniform(0.18, 0.3)))
    def roll(sv): return 0.5 + 0.5 * math.cos(TAU * (sv / per - ph))
    def drip(sv):
        e = 0.0
        for c, L, w in D:
            d = (sv - c + Lp / 2) % Lp - Lp / 2
            if abs(d) < w: e += L * (1 - (d / w) ** 2) ** 0.6
        return e
    return roll, drip

def snow_paint(bumpf, seed=3):
    """snow paint plus the cushions' hollows (bumpf(p) -> 0 hollow .. 1 crown): a cool lavender in the dips"""
    base = snow_col(seed)
    def f(p, n):
        b = bumpf(p)
        return mix(base(p, n), mul(SNOW_SH, 0.97), (1 - b) * 0.5 * clamp(n.z + 0.2))
    return f

SNOW_HOLLOW, SNOW_UNDER, SNOW_RIM = '#acbde8', '#93a8dc', '#fbfdff'
def blanket_paint(bumpf, seed=3):
    """the hip blanket's paint, made to model under a flat toon light: the hollows between cushions a cool lavender-blue,
    the downslope face under each cushion a deeper cool blue, the cushion crowns rimmed nearly white"""
    base = snow_col(seed)
    def f(p, n):
        b, under = bumpf(p)
        c = base(p, n)
        c = mix(c, SNOW_HOLLOW, (1 - b) * 0.62 * clamp(n.z + 0.3))
        c = mix(c, SNOW_UNDER, under * 0.55)
        if b > 0.62: c = mix(c, SNOW_RIM, (b - 0.62) / 0.38 * 0.7 * clamp(n.z + 0.2))
        return c
    return f

def snow_blanket(ax, az, ySurf, yRoof=None, th=0.16, lip=0.09, droop=0.05, NS=128, ridge=0.08, round_=0.55, seed=0,
                 ice=None, back_keep=0.3, cushion=0.055, tperiod=0.5, aperiod=1.1, tTop=1.0, inner=0.06, nmid=10, rollp=0.5, tag='roofsnow'):
    """artOnsen snowBlanket: rings of rounded rectangles (t: 0 eave -> 1 ridge) from a rolled cornice lip that overhangs
    the eave and droops over the tile edge (puffy rolls, rounded drips), soft staggered cushions over the slopes, a
    ridge roll; closed by a fan under the roof (hidden) and a flat seam along the ridge. Icicles under the lip."""
    RD = [(0.0, -0.14, -0.035), (0.0, lip * 0.5, -droop), (0.0, lip, th * 0.38), (0.012, lip * 0.72, th * 0.86), (0.045, lip * 0.22, th)]
    skirt = tTop < 0.999
    tEnd = tTop - 0.05 if skirt else 0.94
    nm = max(3, round(nmid * (tEnd - 0.08) / 0.86))
    for q in range(nm):
        t = 0.08 + (tEnd - 0.08) * q / (nm - 1)
        RD.append((t, 0.0, th * (1 + 0.1 * math.sin(PI * t))))
    if skirt: RD.append((tTop, -inner * 0.4, th * 0.85)); RD.append((tTop, -inner, th * 0.25))
    else: RD.append((0.975, 0.0, th + ridge * 0.55)); RD.append((0.9995, 0.0, th + ridge))
    a0, b0 = ax(0), az(0); rc0 = min(a0, b0) * round_
    per0 = 4 * (a0 - rc0) + 4 * (b0 - rc0) + TAU * rc0
    roll, drip = lip_rolls(per0, rollp, seed + 3)
    ph = (seed % 13) * 0.37
    def cush(sv, t):
        row = math.floor(t / tperiod)
        bz = 0.5 + 0.5 * math.cos(TAU * (sv / aperiod + 0.5 * row) + ph)
        bt = 0.5 - 0.5 * math.cos(TAU * t / tperiod)
        return (bz * bt) * smooth(0.04, 0.12, t) * (1 - smooth(0.66, 0.9, t))
    rings, cs, lipring = [], [], []
    for k, (t, out, dy) in enumerate(RD):
        a, b = ax(t), az(t)
        last = k == len(RD) - 1 and not skirt
        if last: a, b = max(0.01, ax(1.0) - 0.06), 0.004
        rc = min(a, b) * round_
        ring = []
        for i in range(NS):
            u = i / NS; sv = u * per0
            x, z, nx, nz = rr_point(a, b, rc, u)
            lo = ly = 0.0; r_ = roll(sv)
            if k == 1: dd = drip(sv); lo = 0.012 * n2(sv * 2.3, 1.7) + 0.055 * r_ + 0.2 * dd; ly = -dd - 0.025 * (1 - r_)
            elif k == 2: dd = drip(sv); lo = 0.065 * r_ + 0.12 * dd; ly = -0.4 * dd + 0.035 * r_
            elif k == 3: lo = 0.045 * r_; ly = 0.04 * r_
            elif k == 4: ly = 0.012 * r_
            if 4 <= k < len(RD) - 2 and t < 0.96:
                ly += cushion * cush(sv, t) + 0.012 * n2(sv * 1.7, k * 0.9 + seed)
            px, pz = x + nx * (out + lo), z + nz * (out + lo)
            y = ySurf(t) + dy + ly
            if dy > 0 and yRoof: y = max(y, yRoof(px, pz) + dy + ly)
            ring.append(F.W((px, y, pz)))
            if k == 1: lipring.append((px, y, pz, nx, nz, sv))
        rings.append(ring); cs.append(F.W((0, ySurf(t), 0)))
    tm = Tmp()
    ring_surface(tm, rings, cs, pole0=F.W((0, ySurf(0) - 0.12, 0)), pole1=F.W((0, ySurf(tTop) - 0.12, 0)) if skirt else F.W((0, ySurf(1.0) + th + ridge, 0)))
    Mi = F.m.inverted()
    def bumpf(p):
        q = GMi @ (Mi @ p); x, z = q.x, q.z
        t = clamp(min(1 - (abs(x) - max(0.0, a0 - b0)) / b0, 1 - abs(z) / b0))
        ang = (math.atan2(z, x) / TAU) % 1.0; sv = ang * per0
        if not 0.05 < t < 0.97: return 0.7, 0.0
        b = cush(sv, t)
        return b, clamp((cush(sv, min(t + 0.07, 0.99)) - b) * 2.6)
    add(tm, blanket_paint(bumpf, seed), tag)
    if ice:
        rng = random.Random(seed * 977 + 31)
        every = ice.get('every', 0.15); n = round(per0 / every)
        for i in range(n):
            j = int(((i + rng.random() * 0.6) / n) * NS) % NS
            px, py, pz, nx, nz, sv = lipring[j]
            side = ('f' if nz > 0 else 'b') if abs(nz) > abs(nx) else ('r' if nx > 0 else 'l')
            if side == 'b' and rng.random() > back_keep: continue
            if rng.random() < 0.35: continue
            L = ice.get('len', (0.07, 0.32)); Lc = L[0] + (L[1] - L[0]) * rng.random() ** 1.6
            icicle(px + nx * 0.004, py + 0.012, pz + nz * 0.004, Lc)
    return dict(yAt=lambda t: ySurf(t) + th)

def onigawara(X, y, k, seed=0):
    """artOnsen snowRoof's ridge ends: dark onigawara standing proud of the snow roll, each under a snow cap"""
    for s2 in (-1, 1):
        with at((s2 * X, y, 0), s=k):
            add(beam(0.15, 0.32, 0.36, (0, 0.13, 0), c=0.05), paint(T['tileEdge'], hi='#5a6078', top=0.35, bot=0.3), 'oni')
            add(glathe([(0.0, -0.025), (0.09, -0.025), (0.09, 0.02), (0.06, 0.03), (0.0, 0.034)], 10, pos=(s2 * 0.075, 0.13, 0), rz=-s2 * PI / 2),
                paint('#5c6278', hi='#7a809a', top=0.3), 'oni')
            for sz in (-1, 1): add(sph(0.065, (0, 0.3, sz * 0.12), sc=(0.8, 1.2, 0.8), K=6, J=3), paint(T['tileEdge'], hi='#5a6078', top=0.35), 'oni')
            pillow((0, 0.31, 0), 0.14, 0.5, seed + s2 * 5, 0.85, 1.25)

# ------------------------------------------------------------------ the snow sheet (gable / gasshō roofs: ridge along z)
def snow_sheet(Zh, az, ySurf, th=0.15, lip=0.09, droop=0.05, endLip=0.07, ridge=0.06, NZ=36, seed=0, ub=0.1,
               cushion=0.07, tperiod=0.34, zperiod=1.0, nrows=12, rollp=0.5, drips=0.45, tag='roofsnow'):
    """artOnsen snowSheet, ridge along local z: from the +x eave over the ridge to the -x eave, a rolled cornice at both
    eaves (puffy rolls, rounded drips), staggered soft cushions down the slopes, drooping lips over both gable ends.
    A closed solid: each station's profile runs over the top and back underneath (ub below the roof surface); the end
    stations are capped. az(t): the snow edge's distance from the ridge (t: 0 edge -> 1 ridge). -> the lip lines."""
    lipP = lambda e, k: [(-0.12, -0.035), (e * 0.5, -droop), (e, th * 0.38), (e * 0.72, th * 0.86), (e * 0.22, th)][k]
    side = []
    for k in range(5):
        out, h = lipP(lip, k); side.append(((0, 0, 0, 0.012, 0.045)[k], out, h, k))
    for q in range(nrows):
        t = 0.08 + (0.975 - 0.08) * q / (nrows - 1)
        side.append((t, 0.0, th * (1 + 0.1 * math.sin(PI * t)) + (ridge * (t - 0.93) / 0.07 if t > 0.93 else 0.0), 9))
    top = [(t, o, h, k, 1) for (t, o, h, k) in side] + [(1.0, 0.0, th + ridge, 9, 0)] + [(t, o, h, k, -1) for (t, o, h, k) in reversed(side)]
    under = [(t, -1) for t in (0.09, 0.5)] + [(1.0, 0)] + [(t, 1) for t in (0.5, 0.09)]
    cols = []
    for k in range(5):
        out, h = lipP(endLip, k); cols.append((-Zh - out, h, k))
    for i in range(1, NZ): cols.append((-Zh + 0.06 + (2 * Zh - 0.12) * i / NZ, None, 9))
    for k in range(4, -1, -1):
        out, h = lipP(endLip, k); cols.append((Zh + out, h, k))
    RL = {sg: lip_rolls(2 * Zh, rollp, seed + 11 + sg * 7, drips) for sg in (1, -1)}
    ph = (seed % 89) * 1.7
    def cush(z, t, sg):
        row = math.floor(t / tperiod)
        bz = 0.5 + 0.5 * math.cos(TAU * (z / zperiod + 0.5 * row + (0.25 if sg < 0 else 0.0)) + ph)
        bt = 0.5 - 0.5 * math.cos(TAU * t / tperiod)
        return (bz * bt) ** 0.8 * smooth(0.04, 0.12, t) * (1 - smooth(0.8, 0.95, t))
    rings, cs = [], []
    lipline = {1: [], -1: []}
    for ci, (z, ch, ck) in enumerate(cols):
        sv = z + Zh
        ring = []
        for ri, (t, out, h, k, sg) in enumerate(top):
            hh = min(h, ch) if ch is not None else h
            xo = 0.0; dy = 0.0
            if sg != 0 and ch is None:
                roll, drip = RL[sg]; r_ = roll(sv)
                if k == 1: dd = drip(sv); xo = 0.055 * r_ + 0.2 * dd + 0.01 * n2(z * 3 + ph, ri); dy = -dd - 0.025 * (1 - r_)
                elif k == 2: dd = drip(sv); xo = 0.065 * r_ + 0.12 * dd; dy = -0.4 * dd + 0.035 * r_
                elif k == 3: xo = 0.045 * r_; dy = 0.04 * r_
                elif k == 4: dy = 0.012 * r_
                if k >= 4: dy += cushion * cush(z, t, sg) + 0.012 * n2(z * 1.9 + ph, ri * 0.61)
            if ch is not None and ck != 0: dy -= 0.03 * max(0, n2(t * 9 + ph, z))
            y = ySurf(t) + hh + dy
            x = sg * (az(t) + out + xo) if sg != 0 else 0.0
            ring.append(F.W((x, y, z)))
            if k == 1 and ch is None: lipline[sg].append((x, y, z))
        for (t, sg) in under:
            x = sg * az(t) if sg != 0 else 0.0
            ring.append(F.W((x, ySurf(t) - ub, z)))
        rings.append(ring); cs.append(F.W((0, ySurf(0.5), z)))
    tm = Tmp(); ids = ring_surface(tm, rings, cs)
    tm.face(list(ids[0]), F.N((0, 0, -1))); tm.face(list(ids[-1]), F.N((0, 0, 1)))
    Mi = F.m.inverted(); a0 = az(0)
    def bumpf(p):
        q = GMi @ (Mi @ p); t = clamp(1 - abs(q.x) / a0)
        return cush(q.z, t, 1 if q.x > 0 else -1) if 0.05 < t < 0.95 else 0.7
    add(tm, snow_paint(bumpf, seed), tag)
    return lipline

# ------------------------------------------------------------------ small onsen kit parts (face frame: z out)
def lattice_window(w=0.6, h=0.44, frame=None, slat=None, tag='window', sp=0.075):
    """parts.js latticeWindow: a glowing pane behind close vertical slats, a kumiko band, a chunky sill"""
    frame = frame or T['timber']; slat = slat or frame
    add(box(w - 0.08, h - 0.08, 0.04, (0, 0, 0.02), r=0.0), lambda p, n: PAL['paper'], tag, glow=True)
    frame_ring(w - 0.07, h - 0.07, 0.05, 0.036, wood(frame), tag)
    iw = w - 0.13; n = max(4, round(iw / sp))
    for i in range(1, n): add(box(0.032, h - 0.12, 0.03, (-iw / 2 + i * iw / n, -0.01, 0.055), r=0.0), flat(slat if i % 2 else mul(slat, 0.86)), tag)
    yb = h / 2 - 0.072 - 0.07
    add(box(iw + 0.02, 0.034, 0.036, (0, yb, 0.062), r=0.0), flat(mul(frame, 0.94)), tag)
    add(box(iw + 0.02, 0.034, 0.036, (0, -h / 2 + 0.1, 0.062), r=0.0), flat(mul(frame, 0.94)), tag)
    add(beam(w + 0.16, 0.07, 0.14, (0, -h / 2 - 0.025, 0.07), c=0.022), wood(frame), tag)

def thatch_layers(L, th, Zl, ang, ue, seed=0, nseg=4, tag='thatch'):
    """one slope of the gassho roof (frame: the left slope, eave at -x; the caller mirrors it for the right): three
    stacked straw courses, each split into hand-cut bundles along the ridge; the upper courses step out a little at the
    gable, so the cut edge reads as layered thatch. Each block: a rounded box, cut faces pale straw, the weathered top
    brown, the underside dark."""
    rng = random.Random(seed * 13 + 1)
    cut, old, dark = T['thatchCut'], T['thatch'], '#5a4a3a'
    lt = th / 3; ca, sa = math.cos(ang), math.sin(ang); nrm = (-sa, ca)
    for li in range(3):
        zext = Zl - 0.07 + 0.045 * li
        ns_ = nseg if li < 2 else nseg * 2 - 1
        segL = 2 * zext / ns_
        for si in range(ns_):
            z0 = -zext + si * segL; z1 = z0 + segL
            ee = rng.uniform(-0.025, 0.03) + 0.03 * li                     # (the eave cut, a little ragged)
            Ls = L + ee
            off = (li + 0.5) * lt + rng.uniform(-0.008, 0.008)
            cx = ue[0] + ca * (L - ee) / 2 + nrm[0] * off                 # (from just past the eave line up to the ridge)
            cy = ue[1] + sa * (L - ee) / 2 + nrm[1] * off
            M = F.m @ lm((cx, cy, (z0 + z1) / 2), rz=ang)
            t = rbox((Ls, segL - 0.014, lt + 0.01), r=0.022, M=M)
            Mi = M.inverted(); R3 = Mi.to_3x3()
            tone = 0.86 + 0.2 * rng.random(); top = li == 2
            def col(p, n, Mi=Mi, R3=R3, tone=tone, top=top, li=li):
                nq = (R3 @ n).normalized(); q = Mi @ p
                if abs(nq.y) > 0.6: return mul(mix(cut, ('#b89a68', '#d4bc8c', '#c8ac78')[li], 0.6), tone)   # the gable cut
                if nq.x < -0.6: return mul(mix(cut, dark, 0.32 + 0.1 * (2 - li)), tone)          # the eave cut
                if nq.z < -0.6: return mul(mix(dark, old, 0.2), tone)
                if nq.x > 0.6: return mul(dark, tone)
                return mul(mix(old, dark, 0.12) if top else mix(old, dark, 0.35), tone * (0.9 + 0.16 * vnoise(p, 3, seed)))
            add(t, col, tag)
            for zc_, sg in ((z0, -1), (z1, 1)):                     # the dark seam under the course where it shows (gable ends)
                if abs(zc_) < zext - 1e-3: continue
                Ms = F.m @ lm((cx - nrm[0] * (lt / 2 - 0.02), cy - nrm[1] * (lt / 2 - 0.02), zc_ + sg * 0.004), rz=ang)
                add(rbox((Ls - 0.06, 0.012, 0.035), r=0.0, M=Ms), flat(mix(dark, '#3a2e26', 0.4)), tag)

def persimmon_string(n=5, tag='charms'):
    add(box(0.022, 0.08 + n * 0.085, 0.022, (0, -(0.08 + n * 0.085) / 2, 0), r=0.0), flat('#c8a060'), tag)
    for i in range(n):
        y = -0.1 - i * 0.085
        add(sph(0.044, (0, y, 0), sc=(1, 0.8, 1), K=6, J=3), lambda p, nn: mix('#c85a1e', '#f0904a', clamp(nn.z * 0.6 + 0.4)), tag)

def stoop_stone(w=0.6, pos=(0, 0, 0), seed=17):
    with at(pos):
        pillow((0, -0.06, 0), 0.3, 0.32, seed, w / 0.6, 0.8, K=10, col=stone_col('#d6ccc8', seed, ao=False), tag='stoop')

def snowflake_mark(size, pos=(0, 0, 0), depth=0.016, col='#fff4e6', tag='sym'):
    """a six-armed snow crystal of chunky strokes (face frame)"""
    x0, y0, z0 = pos; r = size / 2
    for k in range(3):
        a = PI / 2 + k * PI / 3
        add(box(0.045 * size / 0.3, size * 0.95, depth, (x0, y0, z0), r=0.0, rz=a - PI / 2), flat(col), tag)
        for e in (-1, 1):
            ex, ey = x0 + e * math.cos(a) * r * 0.58, y0 + e * math.sin(a) * r * 0.58
            for b in (-1, 1):
                ba = a + (0 if e > 0 else PI) + b * 0.8
                L = r * 0.36
                add(box(0.035 * size / 0.3, L, depth, (ex + math.cos(ba) * L / 2, ey + math.sin(ba) * L / 2, z0), r=0.0, rz=ba - PI / 2), flat(col), tag)

def mikan_crest(s, pos=(0, 0, 0), depth=0.025, tag='sym'):
    """the mikan emblem: an orange disc, a green leaf and a stem (raised, face frame)"""
    x, y, z = pos
    add(glathe([(0.0, -depth / 2), (0.34 * s, -depth / 2), (0.33 * s, depth / 2), (0.0, depth / 2 + 0.006)], 14, pos=(x, y - 0.04 * s, z), rx=PI / 2),
        lambda p, n: mix('#e87a1e', '#ffa848', clamp(-n.y * 0.6 + n.z * 0.4)), tag)
    lf = [(0.02, 0.3), (0.12, 0.42), (0.26, 0.45), (0.42, 0.36), (0.3, 0.3), (0.16, 0.27)]
    add(puffy([(x + px * s, y + py * s) for px, py in lf], depth * 0.8, bev=0.006, z0=z + depth / 2 - 0.004), soft('#4a8a3a', 0.25), tag)
    add(box(0.035 * s, 0.1 * s, depth, (x, y + 0.32 * s, z + 0.004), r=0.0), flat('#5a4a2a'), tag)

def onsen_mark(s, pos=(0, 0, 0), depth=0.02, col='#f6f0e4', tag='sym', K=5):
    """the hot-spring symbol: a bowl and three wavy steam strokes (face frame)"""
    x, y, z = pos
    add(gtube([(x + q * 0.42 * s, y - 0.18 * s - 0.12 * s * (1 - q * q), z) for q in (-1, -0.6, 0, 0.6, 1)], 0.05 * s, K=K), flat(col), tag)
    for j, dx in enumerate((-0.2, 0.0, 0.2)):
        add(gtube([(x + (dx + 0.05 * math.sin(i * 2.1 + j)) * s, y + (-0.04 + i * 0.1) * s, z) for i in range(5 if K > 4 else 4)], 0.042 * s, K=min(K, 4)), flat(col), tag)

def bucket_simple(r=0.13, h=0.18, color='#a8784e', tag='bucket'):
    add(glathe([(0.0, 0.0), (r * 0.85, 0.0), (r, h), (r * 0.9, h), (r * 0.78, h * 0.85), (0.0, h * 0.85)], 10), soft(color, 0.25), tag)
    for yy in (0.25, 0.8):
        R = r * (0.85 + 0.15 * yy) + 0.006
        add(gloop([(R * math.cos(TAU * k / 10), h * yy, R * math.sin(TAU * k / 10)) for k in range(10)], 0.013, K=3), soft(T['iron'], 0.3), tag)

# ------------------------------------------------------------------ yard pieces (artOnsen niwaki, yukitsuri, daikon rack, ...)
def niwaki(s=1.0, seed=0):
    """a cloud-pruned pine: a leaning trunk, flat needle pads under snow cushions"""
    rng = random.Random(seed * 71 + 3)
    with at((0, 0, 0), s=s):
        bark = lambda p, n: mix('#4e3a30', '#7a6050', vnoise(p, 6, seed) * 0.6)
        add(gtube([(0, -0.05, 0), (0.12, 0.6, 0.05), (-0.05, 1.15, -0.04), (0.08, 1.6, 0.02)], lambda u: 0.13 - 0.07 * u, K=7, caps=True), bark, 'pine')
        pads = [(0.45, 0.75, 0.15, 0.5), (-0.42, 1.0, -0.1, 0.46), (0.25, 1.35, -0.2, 0.42), (0.0, 1.72, 0.02, 0.4), (-0.3, 0.55, 0.25, 0.36)]
        for i, (x, y, z, r) in enumerate(pads):
            add(gtube([(x * 0.15, y - 0.1, z * 0.15), (x, y - 0.05, z)], 0.04, K=5), bark, 'pine')
            pillow((x, y, z), r, 0.5, seed + i * 3, K=10, J=4, tag='pine', fine=False,
                   col=lambda p, n: mul(mix('#1c4636', '#3e6e4e', clamp(n.z + 0.3) * 0.7), 0.92 + 0.12 * vnoise(p, 5, seed)))
            pillow((x + rng.uniform(-0.03, 0.03), y + r * 0.24, z), r * 0.84, 0.36, seed + i * 11, K=12, J=4, tag='pine', fine=False)
            for q in range(2):                                   # little drips of snow over the pad's rim
                a = rng.uniform(0, TAU)
                pillow((x + math.cos(a) * r * 0.78, y + r * 0.12, z + math.sin(a) * r * 0.78), r * 0.2, 0.75, seed + i * 7 + q, K=6, J=3, tag='pine', fine=False)

def yukitsuri(h=2.5, r=0.95, n=14, y1=0.85, seed=0):
    """snow-hanging ropes fanned from a tall pole down to the pine's pads"""
    add(cyl(0.04, 0.05, h, (0, h / 2, 0), K=6), wood('#7a6248', ao_z=0.0), 'yukitsuri')
    add(glathe([(0.0, 0.0), (0.085, 0.0), (0.0, 0.18)], 6, pos=(0, h, 0)), soft('#c8b088', 0.3), 'yukitsuri')
    pillow((0, h + 0.13, 0), 0.075, 0.6, seed, tag='yukitsuri')
    for i in range(n):
        a = i / n * TAU
        e = (math.cos(a) * r, y1 + 0.12 * math.sin(i * 1.7), math.sin(a) * r)
        m = (e[0] * 0.5, (h - 0.04 + e[1]) / 2 - 0.05, e[2] * 0.5)
        add(gtube([(0, h - 0.04, 0), m, e], 0.015, K=3, caps=True), flat('#e8d8a8'), 'yukitsuri')

def daikon_rack(w=1.2, h=1.35, rows=2, seed=0):
    rng = random.Random(seed * 13 + 5)
    for s in (-1, 1): add(cyl(0.035, 0.04, h, (s * w / 2, h / 2, 0), K=6), lambda p, n: mix('#94a050', '#b8c070', clamp(n.z + 0.3) * 0.5), 'daikon')
    for r in range(rows):
        y = h - 0.05 - r * 0.62
        add(cyl(0.028, 0.028, w + 0.1, (0, y, 0), K=6, rz=PI / 2), soft('#9aa858', 0.3), 'daikon')
        for i in range(6):
            x = -w / 2 + 0.14 + i * (w - 0.28) / 5; L = 0.42 + rng.random() * 0.12; zz = 0.02 * (i % 2)
            yt = F.W((x, y - 0.06, zz)).z
            add(glathe([(0.0, -L), (0.035, -L * 0.6), (0.05, 0.0), (0.0, 0.01)], 6, pos=(x, y - 0.06, zz)),
                lambda p, n, yt=yt, L=L: mix('#f6f2e8', '#ddd4c2', clamp((yt - p.z) / L) * 0.6), 'daikon')
            add(glathe([(0.0, 0.0), (0.06, 0.02), (0.0, 0.16)], 5, pos=(x, y - 0.03, zz)), soft('#5e9a46', 0.3), 'daikon')
        snow_slab(0, y + 0.02, 0, w + 0.06, 0.08, 0.04, seed + r)

def firewood(w=0.9, h=0.55, d=0.3, seed=0, r=0.058, gap=0.12):
    """props2.js firewood: a stack of split logs under a little roof on two posts"""
    rng = random.Random(seed * 7 + 1)
    y = 0.05
    while y < h:
        x = -w / 2 + 0.05 + (0.045 if int(y / 0.095) % 2 else 0.0)
        while x < w / 2 - 0.03:
            Lg = d * rng.uniform(0.9, 1.05)
            t = lathe([(0.0, -Lg / 2), (r, -Lg / 2), (r, Lg / 2), (0.0, Lg / 2)], 5, th0=rng.uniform(0, 1))
            t.xform(F.m @ lm((x + rng.uniform(-0.01, 0.01), y, rng.uniform(-0.02, 0.02)), rx=PI / 2))
            bark = rng.choice(['#8a5e44', '#9a6a4a', '#7a5040']); Mr = F.m.to_3x3().inverted()
            add(t, lambda p, n, bark=bark, Mr=Mr: '#efc994' if abs((Mr @ n).y) > 0.85 else mul(bark, 0.88 + 0.15 * clamp(n.z)), 'firewood')
            x += gap
        y += gap * 0.96
    add(beam(w + 0.16, 0.045, d + 0.18, (0, h + 0.07, 0.01), c=0.014, rx=0.22), wood(T['timber']), 'firewood')
    for sx in (-1, 1): add(box(0.05, h + 0.08, 0.05, (sx * (w / 2 + 0.03), (h + 0.08) / 2, d / 2), r=0.0), wood('#4e3a30', ao_z=0.0), 'firewood')

def snow_bush(s=0.7, seed=0, flowers=True, nf=7, lite=False):
    """onsenFlora snowBush('camellia'): a glossy dark bush with red camellias, a snow cushion on top"""
    with at((0, 0, 0), s=s):
        rng = random.Random(seed * 5 + 2)
        for i, (x, z, r) in enumerate(((0, 0, 0.5), (0.35, 0.12, 0.36), (-0.32, 0.08, 0.38), (0.05, -0.25, 0.36))):
            pillow((x, r * 0.55, z), r, 1.15, seed + i, K=8 if lite else 10, J=4 if lite else 5, tag='bush', fine=False,
                   col=lambda p, n: mul(mix('#1c4030', '#3a6a48', clamp(n.z * 0.7 + 0.4) * 0.8), 0.9 + 0.14 * vnoise(p, 6, seed)))
        pillow((0.02, 0.86, -0.02), 0.4, 0.36, seed + 7, 1.1, 1.0, K=12, J=4, tag='bush', fine=False)
        pillow((0.36, 0.62, 0.12), 0.24, 0.38, seed + 9, K=8 if lite else 11, J=4, tag='bush', fine=False)
        for q in range(2 if lite else 3):
            a = rng.uniform(0, TAU)
            pillow((math.cos(a) * 0.4, 0.72, math.sin(a) * 0.36), 0.09, 0.8, seed + q, K=7, J=4, tag='bush', fine=False)
        if flowers:
            for i in range(nf):
                a = rng.uniform(-1.3, 1.3) + PI / 2; rr_ = rng.uniform(0.44, 0.52); y = rng.uniform(0.3, 0.62)
                p = (math.cos(a) * rr_, y, math.sin(a) * rr_ * 0.9)
                kb = 7 if lite else 10
                fb = blob(F.W(p), 0.075, 0.05, lobes=5, K=kb, seed=i, amp=0.25)
                fb.c = [mul(T['camellia'], 0.8)] * kb + [mix(T['camellia'], '#ff6070', 0.3)] * kb + [mul(T['camellia'], 0.75), '#f4c84a']
                add(fb, None, 'bush')

def snow_shovel():
    add(box(0.32, 0.4, 0.03, (0, 0.22, 0.04), r=0.0, rx=-0.12), wood('#c8a070'), 'porch')
    add(cyl(0.022, 0.022, 0.95, (0, 0.86, -0.04), K=5, rx=-0.12), wood('#8a6448'), 'porch')
    add(box(0.15, 0.035, 0.035, (0, 1.32, -0.09), r=0.0), wood('#8a6448'), 'porch')
    pillow((0, 0.43, 0.06), 0.07, 0.5, 3, 2.0, 0.6, tag='porch')

def kanjiki():
    """a kanjiki snowshoe hung on the wall: a bent-wood oval, cross straps"""
    add(gloop([(0.1 * math.cos(TAU * k / 12), 0.15 * math.sin(TAU * k / 12), 0.0) for k in range(12)], 0.02, K=4), wood('#8a6a42'), 'porch')
    for k in (-1, 0, 1): add(box(0.024, 0.26, 0.02, (k * 0.045, 0, 0.0), r=0.0), flat('#c8b088'), 'porch')

def straw_boot():
    add(glathe([(0.0, 0.0), (0.07, 0.0), (0.066, 0.1), (0.056, 0.2), (0.0, 0.2)], 7), lambda p, n: mul('#c8a868', 0.85 + 0.2 * abs(math.sin(p.z * 60))), 'porch')
    add(sph(0.06, (0, 0.03, 0.05), sc=(1, 0.6, 1.4), K=7, J=3), soft('#b89858', 0.25), 'porch')

# ------------------------------------------------------------------ overlays: the siege (art.js boards / soot / debris / warBanner)
BOARD = ['#a8845e', '#9a7656', '#b8946a', '#8e6c4e']
def plank(L, w, t, c, x, y, z, a, tag='boards'):
    add(beam(L, w, t, (x, y, z), c=0.012, rz=a), wood(c), tag)
def nail(x, y, z, tag='boards'):
    add(cyl(0.018, 0.018, 0.02, (x, y, z), K=5, rx=PI / 2), soft('#5a5660', 0.3), tag)
def boards(w, h, seed=0, depth=0.05):
    rr = random.Random(seed * 131 + 7); z = depth
    L = math.hypot(w, h) * 0.98; a = math.atan2(h, w)
    plank(L, 0.12, 0.035, BOARD[seed % 4], 0, 0, z, a + (rr.random() - 0.5) * 0.08)
    plank(L * 0.96, 0.11, 0.035, BOARD[(seed + 1) % 4], 0, 0.02, z + 0.035, -a + (rr.random() - 0.5) * 0.08)
    nh = max(1, round(h / 0.55))
    for i in range(nh):
        y = -h / 2 + (i + 0.5) * h / nh + (rr.random() - 0.5) * 0.06
        plank(w * (1.06 + rr.random() * 0.08), 0.1 + rr.random() * 0.03, 0.035, BOARD[(seed + i + 2) % 4], (rr.random() - 0.5) * 0.06, y, z + 0.07, (rr.random() - 0.5) * 0.12)
        for s in (-1, 1): nail(s * w * 0.46, y, z + 0.09)
    for sx, sy in ((-1, -1), (1, 1), (-1, 1), (1, -1)): nail(sx * w * 0.44, sy * h * 0.44, z + 0.055)

def soot(w, h, wall=None, seed=0):
    """a scorch smudge on a wall (face frame, base at y = 0)"""
    wall = wall or T['plaster']; ph = seed * 1.3
    prof = [(0.0, 0.0), (1.0, 0.0), (0.98, 0.012), (0.0, 0.016)]
    t = lathe(prof, 14, th0=ph, rfn=lambda r, z, th: r * (1 + 0.22 * math.sin(3 * th + ph) + 0.12 * math.sin(5 * th + ph * 2)))
    t.xform(F.m @ lm((0, h * 0.5, 0.008), rx=PI / 2, s=(w * 0.5, 1.0, h * 0.5)))
    c0 = F.W((0, h * 0.5, 0))
    def col(p, n):
        d = Vector((p.x - c0.x, p.y - c0.y, (p.z - c0.z) * w / h)).length / (w * 0.5)
        return mix('#2e2622', wall, clamp(d) ** 2 * 0.85 + clamp((p.z - (c0.z - h * 0.2)) / h) * 0.25)
    add(t, col, 'soot')

def debris(r=1.4, seed=0, n=6):
    rr = random.Random(seed * 101 + 9)
    for i in range(n):
        a = rr.random() * TAU; dd = r * math.sqrt(rr.random()); x, z = math.cos(a) * dd, math.sin(a) * dd; k = rr.random()
        if k < 0.45: add(beam(0.5 + rr.random() * 0.5, 0.045, 0.12, (x, 0.03, z), c=0.012, ry=rr.random() * PI, rz=(rr.random() - 0.5) * 0.25), wood(BOARD[i % 4]), 'debris')
        elif k < 0.65:
            with at((x, 0, z), ry=rr.random() * TAU): crate(0.3, '#b8946a', tag='debris', seed=i)
        elif k < 0.8:
            with at((x, 0.17, z), ry=rr.random() * TAU, rx=PI / 2): barrel(0.15, 0.32, '#9a7656', tag='debris')
        else: pebble((x, 0.0, z), 0.1 + rr.random() * 0.05, 0.6, seed=i + seed, col=ONSEN_STONES[i % 6], tag='debris')

def war_banner(h=2.3, w=0.5, color='#4a2a5a', mark='#f0e2c4', seed=0):
    """the raiders' war banner: a leaning pole, a ragged cloth with a horned-face crest, a horned knob, red tassels"""
    rr = random.Random(seed * 71 + 5); lean = (rr.random() - 0.5) * 0.12
    with at((0, 0, 0), ry=rr.random() * 0.6 - 0.3, rz=lean):
        add(cyl(0.035, 0.05, h, (0, h / 2, 0), K=6), wood('#4a3a30', ao_z=0.0), 'banner')
        add(cyl(0.025, 0.025, w + 0.12, (w / 2 - 0.02, h - 0.12, 0.04), K=5, rz=PI / 2), wood('#4a3a30'), 'banner')
        top, bot = h - 0.14, h - 0.14 - w * 2.1
        poly = [(0.0, top), (w, top), (w, bot + 0.18)]
        for k in range(3, -1, -1):
            x = k / 3 * w; poly.append((x, bot + rr.random() * 0.12 if k % 2 else bot + 0.22 + rr.random() * 0.1))
        poly = [(x + 0.02, y) for x, y in poly]
        def cloth(p, n, yt=F.W((0, top, 0)).z, yb=F.W((0, bot, 0)).z):
            return mix(mul(color, 0.7), color, clamp((p.z - yb) / (yt - yb)))
        add(puffy(poly, 0.03, bev=0.008, z0=0.045), cloth, 'banner')
        cx, cy = w / 2 + 0.02, top - w * 0.72
        add(glathe([(0.0, -0.01), (w * 0.26, -0.01), (w * 0.25, 0.012), (0.0, 0.014)], 12, pos=(cx, cy, 0.083), rx=PI / 2), flat(mark), 'banner')
        for s in (-1, 1):
            add(puffy([(cx + s * w * 0.12, cy + w * 0.12), (cx + s * w * 0.3, cy + w * 0.36), (cx + s * w * 0.22, cy + w * 0.1)], 0.02, bev=0.004, z0=0.07), flat(mark), 'banner')
            add(sph(0.03, (cx + s * w * 0.1, cy + 0.01, 0.1), sc=(1.4, 0.6, 0.5), K=6, J=3), flat(color), 'banner')
        add(sph(0.09, (0, h + 0.06, 0), K=8, J=4), soft('#e8dcc0', 0.3), 'banner')
        for s in (-1, 1):
            add(glathe([(0.0, 0.0), (0.035, 0.0), (0.0, 0.14)], 6, pos=(s * 0.07, h + 0.1, 0), rz=-s * 0.5), soft('#d8c8a0', 0.3), 'banner')
            add(cyl(0.012, 0.025, 0.3, (s * 0.06, h - 0.16, 0.04), K=4), flat('#c83a3a'), 'banner')

# ------------------------------------------------------------------ overlays: the saved village
def noren_sign(w=0.86, h=0.42, y=1.1, z=0.14, color='#5a6aa8', strips=2, mark='snow', mark_scale=0.3, mark_col='#fff4e6', tag='noren'):
    rod = T['timber']
    add(cyl(0.028, 0.028, w + 0.16, (0, y + 0.02, z), K=7, rz=PI / 2), wood(rod), tag)
    for s in (-1, 1): add(beam(0.045, 0.06, z + 0.02, (s * (w / 2 + 0.05), y + 0.02, z / 2), c=0.012), wood(rod), tag)
    gap = 0.035; sw = (w - gap * (strips - 1)) / strips; hem = 0.07
    for i in range(strips):
        x = -w / 2 + sw / 2 + i * (sw + gap); sway = (i - (strips - 1) / 2) * 0.02
        add(beam(sw, h - hem, 0.03, (x, y - (h - hem) / 2, z), c=0.012, rx=0.04, rz=sway),
            lambda p, n: mix(mul(color, 0.8), mix(color, '#9aaee0', 0.2), smooth(y - h, y, p.z) * 0.8), tag)
        add(beam(sw, hem, 0.034, (x - sway * 0.45, y - h + hem / 2 + 0.005, z + 0.018), c=0.014, rx=0.04), soft('#f4efe6', 0.2), tag)
    if mark == 'snow': snowflake_mark(mark_scale, (0, y - h * 0.47, z + 0.03), depth=0.016, col=mark_col, tag=tag)
    elif mark == 'camellia': camellia_crest(mark_scale, (0, y - h * 0.47, z + 0.03), depth=0.016, tag=tag)
    elif mark == 'onsen': onsen_mark(mark_scale, (0, y - h * 0.47, z + 0.03), depth=0.016, col=mark_col, tag=tag)
    elif mark == 'mikan': mikan_crest(mark_scale, (0, y - h * 0.47, z + 0.025), depth=0.016, tag=tag)

def snowman(s=0.5, scarf='#5a6aa8', seed=0):
    with at((0, 0, 0), s=s):
        for r, y, sd in ((0.42, 0.36, 1), (0.3, 0.92, 2), (0.22, 1.36, 3)):
            pillow((0, y, 0), r, 0.95, seed + sd, K=10, J=5, tag='snowman', fine=False)
        for s2 in (-1, 1): add(sph(0.035, (s2 * 0.075, 1.42, 0.2), K=6, J=3), flat('#2a2630'), 'snowman')
        add(glathe([(0.0, 0.0), (0.04, 0.0), (0.0, 0.22)], 6, pos=(0, 1.35, 0.2), rx=PI / 2), soft('#f08a2a', 0.3), 'snowman')
        for i in range(3): add(sph(0.04, (0, 0.98 - i * 0.14, 0.29 - i * 0.012), K=6, J=3), flat('#2a2630'), 'snowman')
        for s2 in (-1, 1):
            add(gtube([(s2 * 0.25, 1.0, 0), (s2 * 0.5, 1.18, 0.05), (s2 * 0.66, 1.34, 0.02)], lambda u: 0.03 - 0.012 * u, K=4), flat('#5a4030'), 'snowman')
        add(gloop([(0.22 * math.cos(TAU * k / 12), 1.16, 0.22 * math.sin(TAU * k / 12)) for k in range(12)], 0.055, K=5), soft(scarf, 0.3), 'snowman')
        add(box(0.1, 0.32, 0.05, (0.14, 1.0, 0.2), r=0.0, rz=0.25), soft(scarf, 0.25), 'snowman')
        with at((0, 1.52, -0.01), rx=-0.22, rz=0.12): bucket_simple(0.13, 0.18, '#a8784e', tag='snowman')

def snow_bunny(s=0.85, seed=0):
    with at((0, 0, 0), s=s):
        pillow((0, 0.07, 0), 0.15, 0.62, seed, 1.0, 1.35, K=9, J=4, tag='bunny', fine=False)
        for e in (-1, 1):
            add(sph(0.045, (e * 0.045, 0.16, -0.06), sc=(0.5, 0.3, 1.6), rx=-0.5, K=7, J=3), soft('#3a7a3a', 0.3), 'bunny')
            add(sph(0.02, (e * 0.05, 0.12, 0.12), K=5, J=3), flat('#d82a3a'), 'bunny')

# ================================================================== Granny Shirayuki's Cottage (artOnsen elder: a gasshō farmhouse)
def new_asset(name):
    global A, OB, LAYER
    A = Asset2(); F.__init__(); OB = name; LAYER = None
    PAL.update(dict(wall=T['plaster'], wallLo='#e0d4c2', frame=T['timber'], frameLo='#2e221e', paper='#fff2d8', ink='#2e2628', iron=T['iron']))

def build_elder():
    new_asset('zv-onsen-elder')
    w, d, h, y0, zc, k = 3.0, 3.2, 1.35, 0.3, -0.15, 1.5
    Fz = zc + d / 2; yw = y0 + h
    F.push((0, 0, zc))
    foundation(w, d, y0, pad=0.12, seed=3, color=T['stone'])
    walls(dict(w=w, d=d, h=h, y0=y0, plaster=T['plaster'], frame=T['timber'], koshi=T['koshi'], koshiSkip='f'))
    blk = dict(w=w, d=d)
    with on_face(blk, 'f', 0, y0): door_wood(0.92, 1.12, '#8a6a4e', T['timber'])
    for s in (-1, 1):
        with on_face(blk, 'f', s * 1.0, y0 + 0.72): shoji(0.56, 0.5, frame=T['timber'])
    for side in 'lr':
        with on_face(blk, side, 0.5, y0 + 0.72): lattice_window(0.6, 0.44, T['timber'])
    with on_face(blk, 'b', 0, y0 + 0.72): shoji(0.7, 0.46, frame=T['timber'])
    # the gable faces (front and back): plaster between dark timbers, two tiers of glowing windows, a little vent
    Mi_ = None
    for zf, dr in ((d / 2, 0.0), (-d / 2, PI)):
        with at((0, 0, zf), ry=dr):
            Mi_ = F.m.inverted()
            apex = (0.0, yw + w / 2 * k - 0.03)
            tri = [(-w / 2 + 0.02, yw), (w / 2 - 0.02, yw)] + [((w / 2 - 0.02) * (1 - q / 5), yw + (apex[1] - yw) * q / 5) for q in range(1, 5)] + [apex] +                   [(-(w / 2 - 0.02) * (q / 5), yw + (apex[1] - yw) * (1 - q / 5)) for q in range(1, 5)]
            add(prism(tri, 0.05, -0.04),
                lambda p, n, Mi_=Mi_: mul(mix(T['plaster'], mul(T['plaster'], 0.86), smooth(yw, yw + 2.2, (GMi @ (Mi_ @ p)).y)), 0.95 + 0.06 * clamp(n.z + 0.5)), 'gable')
            for yb in (yw, yw + 0.78, yw + 1.55):
                hw = (w / 2 - (yb - yw) / k) - 0.02
                if hw > 0.2: add(beam(hw * 2, 0.09, 0.08, (0, yb, 0.045), c=0.02), wood(T['timber']), 'gable')
            for x in (-0.62, 0.62):
                top = yw + (w / 2 - abs(x)) * k - 0.04
                add(beam(0.08, top - yw, 0.07, (x, (top + yw) / 2, 0.04), c=0.018), wood(T['timber']), 'gable')
            for (ya, yb_) in ((yw, yw + 0.98), (yw + 1.38, yw + w / 2 * k - 0.04)):
                add(beam(0.08, yb_ - ya, 0.07, (0, (ya + yb_) / 2, 0.04), c=0.018), wood(T['timber']), 'gable')
            for s in (-1, 1):
                add(beam(math.hypot(w / 2, w / 2 * k) + 0.05, 0.1, 0.09, (s * w / 4, yw + w / 4 * k - 0.03, 0.055), c=0.022, rz=-s * math.atan(k)), wood(T['timber']), 'gable')
            if not dr:
                for s in (-1, 1):
                    with at((s * 0.31, yw + 0.4, 0.03)): shoji(0.42, 0.4, frame=T['timber'])
                with at((0, yw + 1.16, 0.03)): shoji(0.36, 0.34, frame=T['timber'])
            else:
                with at((0, yw + 0.45, 0.03)): shoji(0.5, 0.38, frame=T['timber'])
            add(box(0.22, 0.14, 0.04, (0, yw + 1.86, 0.03), r=0.0), flat('#2a2224'), 'gable')
            add(beam(0.3, 0.05, 0.08, (0, yw + 1.78, 0.05), c=0.012), wood(T['timber']), 'gable')
    # the gasshō roof: two steep thatch slabs meeting at a ridge along z, buried in snow
    over, gOver, th = 0.42, 0.42, 0.36
    Aw, Zl = w / 2 + over, d / 2 + gOver
    cs_, sn_ = 1 / math.sqrt(1 + k * k), k / math.sqrt(1 + k * k)
    yU = lambda x: yw + (w / 2 - abs(x)) * k
    yR = yU(0)
    ue, ur = (-Aw, yU(Aw)), (0.03, yR + 0.045)
    L = math.hypot(ur[0] - ue[0], ur[1] - ue[1]); nrm = (-sn_, cs_)
    cen = ((ue[0] + ur[0]) / 2 + nrm[0] * th / 2, (ue[1] + ur[1]) / 2 + nrm[1] * th / 2, 0.0)
    for s in (-1, 1):
        with at((0, 0, 0), s=(-s, 1, 1)):
            thatch_layers(L, th, Zl, math.atan(k), ue, seed=7 + s)
    # the ridge: a straw roll with a dark cap under the snow ridge
    xr = sn_ * th - 0.03
    add(prism([(0.0, yR + 0.07), (xr, yR + 0.045 + cs_ * th), (0.0, yR + th / cs_ - 0.02), (-xr, yR + 0.045 + cs_ * th)], 2 * Zl, -Zl),
        lambda p, n: mix(T['thatch'], '#4a3c30', 0.55 if abs(n.y) > 0.6 else 0.7), 'thatch')
    azf = lambda t: (Aw + sn_ * th - 0.26) * (1 - t)
    ySurf = lambda t: yU(azf(t)) + th / cs_
    snow_sheet(Zl + 0.03, azf, ySurf, th=0.3, lip=0.15, droop=0.1, endLip=0.11, ridge=0.14, NZ=32, seed=31, cushion=0.15, tperiod=0.36, zperiod=1.25)
    rng = random.Random(77)
    xe, ye = Aw + sn_ * th - 0.03, yU(Aw) + cs_ * th - 0.035          # (the straw eave's outer top edge)
    for s in (-1, 1):
        zq = -Zl + 0.12
        while zq < Zl - 0.12:
            if rng.random() > 0.3: icicle(s * xe, ye, zq + rng.uniform(-0.03, 0.03), 0.1 + rng.random() ** 1.6 * 0.3)
            zq += 0.17
    # the pent roof over the front door (a snowy hisashi on two brackets), hoshigaki strings under it, a stoop stone
    with at((0, yw - 0.04, d / 2)):
        for j in range(3):
            add(beam(w * 0.78 - 0.02 * j, 0.05, 0.26, (0, 0.11 - j * 0.085, 0.13 + j * 0.2), c=0.014, rx=0.36), wood('#5a4a44', seed=j), 'hisashi')
        add(beam(w * 0.78 + 0.04, 0.07, 0.08, (0, -0.05, 0.6), c=0.02), wood(T['timber']), 'hisashi')
        for s in (-1, 1):
            add(beam(0.07, 0.07, 0.6, (s * 0.9, -0.2, 0.22), c=0.015, rx=-0.75), wood(T['timber']), 'hisashi')
        add(sbox(w * 0.8, 0.12, 0.6, (0, 0.18, 0.31), r=0.055, rx=0.36, extra=(6, 1, 0)), SNOW, 'hisashi')
        rng = random.Random(41)
        with at((0, 0.18, 0.31), rx=0.36):                     # soft cushions sitting on the pent roof's snow, tilted with it
            for i in range(5): pillow(((i - 2) * 0.48 + rng.uniform(-0.04, 0.04), 0.05, 0.02 * (i % 2)), 0.23, 0.42, 70 + i * 3, 1.15, 1.15, K=14, J=6, tag='hisashi', fine=False)
        for i in range(12):
            if rng.random() < 0.3: continue
            icicle(-1.1 + i * 0.2 + rng.uniform(-0.03, 0.03), -0.08, 0.64, 0.07 + rng.random() ** 1.5 * 0.22)
        for x in (-0.95, -0.82, 0.82, 0.95):
            with at((x, -0.09, 0.5)): persimmon_string(4)
        for x in (-0.62, 0.62):                                  # the lamp hooks (the game hangs its lanterns here)
            add(box(0.03, 0.08, 0.03, (x, -0.12, 0.62), r=0.0), soft(T['iron'], 0.3), 'hisashi')
    stoop_stone(0.6, (0, 0.1, d / 2 + 0.55))
    # porch life: a wooden snow shovel against the wall, kanjiki snowshoes by the door, straw snow boots on the step
    with at((0.78, 0, d / 2 + 0.12), ry=-0.15, rx=0.1): snow_shovel()
    for x, y in ((-0.78, y0 + 0.92), (-0.62, y0 + 0.74)):
        with at((x, y, d / 2 + 0.04)): kanjiki()
    for s in (-1, 1):
        with at((s * 0.1 - 0.42, y0 * 0.35, d / 2 + 0.5), ry=s * 0.2): straw_boot()
    bank(-w / 2 - 0.1, w / 2 + 0.1, -d / 2 - 0.12, r=0.36, seed=3)
    for s in (-1, 1):
        with at((s * (w / 2 + 0.12), 0, 0), ry=PI / 2): bank(-d / 2, d / 2 - 0.3, 0, r=0.34, seed=9 + s)
    F.pop()
    # the yard: a yukitsuri pine at the left, a daikon drying rack and the woodpile at the right, camellias
    with at((-w / 2 - 0.95, 0, 0.55), ry=0.4):
        niwaki(0.9, 5); yukitsuri(2.25, 0.78, 14, 0.95, 2)
        pillow((0, 0.02, 0), 0.55, 0.3, 11, 1.2, 1.1, K=12, tag='pine')
    with at((w / 2 + 0.75, 0, -0.65), ry=-PI / 2): daikon_rack(1.2, 1.35, seed=4)
    with at((w / 2 + 0.55, 0, 0.75), ry=PI / 2):
        firewood(0.9, 0.55, 0.3, seed=2); snow_slab(0, 0.66, 0.02, 1.06, 0.46, 0.06, 7)
    with at((-w / 2 - 0.3, -0.05, Fz + 0.65), ry=0.6): snow_bush(0.7, 3)
    # ---- the siege overlay (only while besieged)
    with layer('siege'):
        with at((0, y0 + 0.56, Fz)): boards(0.98, 1.1, seed=1)
        for s in (-1, 1):
            with at((s * 1.0, y0 + 0.72, Fz + 0.04)): boards(0.64, 0.56, seed=2 + s)
            with at((s * 0.31, yw + 0.4, Fz + 0.06)): boards(0.5, 0.46, seed=5 + s)
        with at((1.25, y0, Fz + 0.004)): soot(0.7, 1.2, seed=3)
        with at((-0.4, 0, Fz + 1.7)): debris(0.9, seed=11, n=5)
        with at((-w / 2 - 0.4, 0, Fz + 1.2)): war_banner(2.3, 0.5, seed=13)
    # ---- the saved overlay (only once the village is saved)
    with layer('saved'):
        with at((0, y0, Fz)): noren_sign(0.86, 0.42, 1.1, 0.14, '#5a6aa8', 2, 'snow', 0.3)
        for x, sd in ((-0.55, 1), (-0.38, 2), (0.5, 3)):
            with at((x, 0.14, Fz + 0.62), ry=0.3 * sd): snow_bunny(0.85, sd)
        with at((1.35, 0, Fz + 0.9)): snowman(0.5, '#5a6aa8', 4)
    lampY = yw - 0.2
    return A, dict(fp=[-w / 2 - 1.6, zc - d / 2 - 0.15, w / 2 + 1.0, Fz + 0.55], door=[0, Fz + 1.0],
                   lamps=[[-0.62, round(lampY, 3), Fz + 0.62], [0.62, round(lampY, 3), Fz + 0.62]], ridgeY=round(yR, 3))

# ================================================================== Mikan's Warm Goods (artOnsen shop)
def steamer(tiers=3, r=0.17, tag='steamer'):
    for i in range(tiers):
        yb = 0.005 + i * 0.09
        add(cyl(r, r, 0.085, (0, yb + 0.0425, 0), K=12, bev=0.012), lambda p, n: mix('#b8945a', '#dcc28a', clamp(n.z * 0.5 + 0.5)), tag)
    yl = 0.005 + tiers * 0.09
    add(glathe([(0.0, 0.0), (r, 0.0), (r * 0.96, 0.05), (r * 0.5, 0.075), (0.0, 0.08)], 12, pos=(0, yl, 0)), lambda p, n: mix('#c8a868', '#e4cc94', clamp(n.z)), tag)
    add(box(0.12, 0.035, 0.035, (0, yl + 0.095, 0), r=0.0), flat('#8a6a42'), tag)

def mikan_pile(w=0.6, d=0.34, rows=3, tag='mikan'):
    add(beam(w + 0.06, 0.1, d + 0.06, (0, 0.05, 0), c=0.02), wood('#a8845e'), tag)
    rng = random.Random(round(w * 100 + d * 13))
    for kq in range(rows):
        nx_, nz_ = round(w / 0.1) - kq, round(d / 0.1) - kq
        for i in range(nx_):
            for j in range(nz_):
                c = '#f08a2a' if rng.random() < 0.85 else '#f4a040'
                add(sph(0.054, (-((nx_ - 1) * 0.1) / 2 + i * 0.1, 0.14 + kq * 0.075, -((nz_ - 1) * 0.1) / 2 + j * 0.1), sc=(1, 0.88, 1), K=5, J=3),
                    lambda p, n, c=c: mix(mul(c, 0.82), mix(c, '#ffd090', 0.35), clamp(n.z * 0.7 + 0.3)), tag)

def sweet_potatoes(n=4, tag='goods'):
    for kq in range(n):
        add(sph(0.06, ((kq % 2 - 0.5) * 0.1, 0.12, (kq // 2 - 0.5) * 0.08), sc=(1.8, 0.8, 0.9), ry=kq * 0.8, K=7, J=3), soft('#8a3a4a', 0.3), tag)

def build_shop():
    new_asset('zv-onsen-shop')
    w, d, h, y0, zc = 3.0, 2.2, 1.45, 0.25, -0.2
    Fz = zc + d / 2
    F.push((0, 0, zc))
    foundation(w, d, y0, pad=0.12, seed=5, color=T['stone'])
    walls(dict(w=w, d=d, h=h, y0=y0, plaster=T['plaster'], frame=T['timber'], koshi=T['koshi'], koshiSkip='f'))
    blk = dict(w=w, d=d)
    with on_face(blk, 'f', 0, y0):
        add(box(w - 0.3, h - 0.18, 0.03, (0, (h - 0.18) / 2 + 0.02, 0.012), r=0.0), flat('#3e302a'), 'front')
        rng = random.Random(77)
        CS = ['#e8503a', '#f4c040', '#5a9ad8', '#fff2e6', '#8ac06a', '#ff8fb0']
        for y in (0.78, 1.1):
            add(beam(w - 0.5, 0.045, 0.22, (0, y, 0.11), c=0.012), wood('#a8845e'), 'front')
            x = -(w - 0.66) / 2
            while x < (w - 0.66) / 2:
                c = CS[int(rng.random() * 6)]
                if y < 1:
                    for s in (-1, 1):
                        add(box(0.07, 0.12, 0.05, (x + s * 0.042, y + 0.085, 0.11), r=0.0), soft(c, 0.3), 'goods')
                        add(box(0.03, 0.05, 0.04, (x + s * 0.082, y + 0.07, 0.11), r=0.0), soft(c, 0.3), 'goods')
                        add(box(0.074, 0.03, 0.054, (x + s * 0.042, y + 0.038, 0.11), r=0.0), flat('#fff4ea'), 'goods')
                elif rng.random() < 0.5:
                    for kq in range(3): add(box(0.16, 0.042, 0.14, (x, y + 0.045 + kq * 0.044, 0.11), r=0.0), soft(c if kq % 2 == 0 else mul(c, 0.86), 0.3), 'goods')
                else:
                    add(box(0.14, 0.13, 0.11, (x, y + 0.088, 0.11), r=0.0), soft('#f6f0e4', 0.2), 'goods')
                    add(box(0.09, 0.05, 0.01, (x, y + 0.1, 0.168), r=0.0), flat('#d8343a'), 'goods')
                x += 0.2
        for s in (-1, 1): add(beam(0.13, h, 0.13, (s * (w / 2 - 0.12), h / 2, 0.065), c=0.025), wood(T['timber'], ao_z=0.0), 'front')
        add(beam(w + 0.04, 0.16, 0.15, (0, h - 0.06, 0.075), c=0.025), wood(T['timber']), 'front')
        # the counter: steamer stacks of hot buns, a pyramid of mikan, roasted sweet potatoes in a basket
        add(beam(w - 0.5, 0.58, 0.42, (0, 0.29, 0.3), c=0.03), wood('#8a6448', ao_z=0.0), 'counter')
        add(beam(w - 0.4, 0.065, 0.52, (0, 0.61, 0.3), c=0.02), wood('#c49a6c'), 'counter')
        for i in range(6): add(box(0.02, 0.48, 0.012, (-(w - 0.5) / 2 + (i + 0.5) * (w - 0.5) / 6, 0.28, 0.514), r=0.0), flat('#6a4a36'), 'counter')
        with at((-0.95, 0.643, 0.3)): steamer(4, 0.17)
        with at((-0.55, 0.643, 0.33)): steamer(3, 0.15)
        with at((0.42, 0.643, 0.3)): mikan_pile(0.62, 0.32, 3)
        with at((1.0, 0.643, 0.3)):
            add(glathe([(0.0, 0.0), (0.12, 0.0), (0.165, 0.12), (0.15, 0.125), (0.11, 0.02), (0.0, 0.02)], 12), lambda p, n: mul('#c8a060', 0.85 + 0.2 * abs(math.sin(p.z * 70))), 'goods')
            sweet_potatoes(4)
    for side in 'lr':
        with on_face(blk, side, 0, y0 + 0.82): shoji(0.6, 0.48, frame=T['timber'])
    with on_face(blk, 'b', 0, y0 + 0.82): shoji(0.8, 0.48, frame=T['timber'])
    over, H, curve = 0.55, 0.92, 0.3
    info = roof(dict(type='hip', w=w, d=d, y0=y0 + h, over=over, H=H, curve=curve, lift=0.04, liftW=0.5, thick=0.14, ribW=0.38,
                     ribAmp=0.03, course=0.0, courseAmp=0.0, color=T['tile'], pal=SLATE_PAL, rich=1, seed=23, finial=False, curl=False))
    Rr = info['R']; Aw, Bz = info['A'], info['Bz']
    ySurf = lambda t: Rr['yb'] + H * prof(t, curve) + 0.035
    yRoof = lambda x, z: Rr['yb'] + H * prof(clamp(min(Aw - abs(x), Bz - abs(z)) / Bz), curve) + 0.035
    S = snow_blanket(lambda t: Aw - Bz * t, lambda t: Bz * (1 - t), ySurf, yRoof, th=0.17, lip=0.1, droop=0.06, NS=104,
                     ridge=0.08, seed=17, cushion=0.12, tperiod=0.45, aperiod=0.95, ice=dict(every=0.18, len=(0.07, 0.3)))
    ridgeY = Rr['yb'] + H
    for sx in (-1, 1):                                          # a soft snow cap on each upturned tile corner
        for sz in (-1, 1):
            cx_, cz_ = sx * (Aw - 0.13), sz * (Bz - 0.13)
            pillow((cx_, info['yAt'](cx_, cz_) + Rr['ribAmp'] + 0.05, cz_), 0.17, 0.45, 40 + sx * 3 + sz, 1.1, 1.1, K=11, J=4, tag='roofsnow', fine=False)
            icicle(sx * (Aw - 0.02), info['underAt'](sx * (Aw - 0.02), sz * (Bz - 0.02)) + 0.03, sz * (Bz - 0.02), 0.16)
    onigawara(max(0.05, Aw - Bz), S['yAt'](1.0) - 0.04, clamp(Bz / 1.4, 0.55, 1.1), seed=5)
    # the giant mikan on the ridge: an orange ball with a leaf, a snow cap, on a short post
    with at((0, ridgeY + 0.08, 0)):
        add(cyl(0.05, 0.06, 0.5, (0, 0.25, 0), K=6), wood(T['timber']), 'mikan')
        add(sph(0.42, (0, 0.78, 0), sc=(1, 0.86, 1), K=18, J=10), lambda p, n: mul(mix('#e2741a', '#ffae4a', clamp(n.z * 0.55 - n.y * 0.3 + 0.25)), 0.93 + 0.1 * vnoise(p, 14, 3)), 'mikan')
        add(cyl(0.03, 0.04, 0.09, (0, 1.15, 0), K=6), flat('#5a4a2a'), 'mikan')
        add(sph(0.14, (0.2, 1.15, 0.05), sc=(1.6, 0.28, 0.8), rz=-0.3, K=8, J=3), soft('#4a8a3a', 0.35), 'mikan')
        pillow((-0.05, 1.08, 0.0), 0.24, 0.36, 5, K=10, tag='mikan')
    # the hanging sign on the left wall: an iron arm, a cream board with the mikan crest on both faces, a snow cap
    with at((-w / 2 - 0.02, 1.5, d / 2 - 0.3), ry=-PI / 2):
        add(box(0.04, 0.04, 0.46, (0, 0, 0.22), r=0.0), soft(T['iron'], 0.3), 'sign')
        add(box(0.03, 0.12, 0.03, (0, -0.06, 0.25), r=0.0, rx=0.6), soft(T['iron'], 0.3), 'sign')
        with at((0, -0.3, 0.38), ry=PI / 2):
            add(beam(0.46, 0.46, 0.05, (0, 0, 0), c=0.02), wood('#f4e8d0'), 'sign')
            frame_ring(0.48, 0.48, 0.0, 0.03, wood(T['timber']), 'sign')
            for zz, ry_ in ((0.026, 0.0), (-0.026, PI)):
                with at((0, 0, zz), ry=ry_): mikan_crest(0.34, (0, 0, 0.0), depth=0.022)
            for s in (-1, 1): add(box(0.015, 0.1, 0.015, (s * 0.17, 0.27, 0), r=0.0), flat(T['ink']), 'sign')
            snow_slab(0, 0.24, 0, 0.5, 0.09, 0.04, 9)
    bank(-w / 2, w / 2, -d / 2 - 0.12, r=0.34, seed=17)
    F.pop()
    # the brazier out front (hibachi: cold coals until the village is saved) and a crate of mikan
    with at((0.95, 0, Fz + 0.95)):
        add(glathe([(0.0, 0.14), (0.2, 0.14), (0.26, 0.46), (0.28, 0.5), (0.24, 0.5), (0.0, 0.47)], 14),
            lambda p, n: mix('#5e5070', '#8a7aa0', clamp(n.z + 0.3) * 0.45), 'brazier')
        add(gloop([(0.27 * math.cos(TAU * q / 14), 0.49, 0.27 * math.sin(TAU * q / 14)) for q in range(14)], 0.022, K=4), soft('#4a405a', 0.3), 'brazier')
        for i in range(3):
            a = i / 3 * TAU + 0.3; add(beam(0.06, 0.18, 0.06, (math.cos(a) * 0.17, 0.08, math.sin(a) * 0.17), c=0.015), wood(T['timber']), 'brazier')
        add(cyl(0.22, 0.22, 0.03, (0, 0.495, 0), K=12), lambda p, n: mul('#3a3232', 0.9 + 0.2 * vnoise(p, 12, 4)), 'brazier')
        for q in range(-3, 4): add(box(0.42, 0.018, 0.018, (0, 0.53, q * 0.055), r=0.0), soft(T['iron'], 0.3), 'brazier')
        for q in (-1, 1): add(box(0.018, 0.018, 0.42, (q * 0.19, 0.53, 0), r=0.0), soft(T['iron'], 0.3), 'brazier')
    with at((-1.15, 0, Fz + 0.7), ry=0.3):
        crate(0.34, '#c8a070', tag='crate', seed=3)
        with at((0, 0.29, 0)): mikan_pile(0.26, 0.26, 1)
        pillow((-0.25, 0.02, 0.1), 0.2, 0.4, 3, tag='crate')
    # ---- the siege overlay: amado storm shutters across the open front, boarded; mikan spilled on the snow
    with layer('siege'):
        with at((0, y0, Fz + 0.55)):
            n = 7
            for i in range(n):
                pw = (w - 0.3) / n - 0.02
                add(beam(pw, h - 0.12, 0.05, (-(w - 0.3) / 2 + (i + 0.5) * (w - 0.3) / n, (h - 0.12) / 2, 0), c=0.012, rz=(i - 3) * 0.006), wood(['#7a5e48', '#6e5442', '#86684e'][i % 3]), 'shutters')
                add(box(pw * 0.9, 0.025, 0.012, (-(w - 0.3) / 2 + (i + 0.5) * (w - 0.3) / n, h * 0.55, 0.03), r=0.0), flat('#5a4232'), 'shutters')
            with at((0, h * 0.5, 0)): boards(w - 0.4, h - 0.3, seed=13)
        rng = random.Random(5)
        for i in range(9):
            add(sph(0.054, (-1.5 + rng.random() * 1.6, 0.05, Fz + 0.9 + rng.random() * 1.0), K=6, J=3), soft('#f08a2a', 0.3), 'spill')
        with at((-1.2, 0.12, Fz + 1.4), ry=0.4, rz=1.3): steamer(1, 0.17, tag='spill')
        with at((1.7, 0, Fz + 1.2)): debris(0.7, seed=31, n=4)
    # ---- the saved overlay: the brazier lit, sweet potatoes on the grill; mittens pegged along a cord; an orange nobori
    with layer('saved'):
        with at((0.95, 0, Fz + 0.95)):
            add(blob(F.W((0, 0.5, 0)), 0.19, 0.07, lobes=6, K=12, seed=4, amp=0.12), lambda p, n: mix('#ff6a1a', '#ffc060', clamp(n.z)), 'coal', glow='hot')
            with at((0, 0.44, 0)): sweet_potatoes(3)
        P = lambda t: (-1.35 + 2.7 * t, y0 + h - 0.1 - math.sin(t * PI) * 0.08, Fz + 0.62)
        add(gtube([P(q / 10) for q in range(11)], 0.012, K=4), flat('#f4f0e8'), 'mittens')
        cs = ['#e8503a', '#f4c040', '#5a9ad8', '#ff8fb0', '#8ac06a', '#fff4ea']
        for i in range(6):
            x, y, z = P((i + 0.5) / 6)
            with at((x, y, z), rz=0.08 * (1 if i % 2 else -1)):
                add(sbox(0.13, 0.17, 0.045, (0, -0.11, 0), r=0.035), soft(cs[i], 0.3), 'mittens')
                add(box(0.05, 0.075, 0.04, (0.08, -0.08, 0), r=0.0), soft(cs[i], 0.3), 'mittens')
                add(box(0.14, 0.045, 0.05, (0, -0.022, 0), r=0.0), soft('#fff4ea', 0.2), 'mittens')
                add(box(0.03, 0.05, 0.06, (0, 0.0, 0), r=0.0), flat('#c8a070'), 'mittens')
        with at((-1.85, 0, Fz + 0.8)): nobori_star(2.3, 0.4, T['mikan'])
    return A, dict(fp=[-w / 2 - 0.1, zc - d / 2 - 0.1, w / 2 + 0.1, Fz + 0.52], door=[0, Fz + 1.15],
                   lamps=[[-1.2, y0 + h, Fz + 0.5], [1.2, y0 + h, Fz + 0.5]], ridgeY=round(ridgeY, 3))

def star_poly(r0, r1, n=5, a0=PI / 2):
    return [((r0 if i % 2 == 0 else r1) * math.cos(a0 + i * PI / n), (r0 if i % 2 == 0 else r1) * math.sin(a0 + i * PI / n)) for i in range(2 * n)]

def nobori_star(h=2.3, w=0.4, color='#f08a2a', tag='nobori'):
    add(cyl(0.03, 0.036, h, (0, h / 2, 0), K=6), wood('#5a4032', ao_z=0.0), tag)
    add(cyl(0.02, 0.02, w + 0.08, (w / 2, h - 0.08, 0), K=4, rz=PI / 2), wood('#5a4032'), tag)
    add(sph(0.055, (0, h + 0.03, 0), K=6, J=3), lac('#f2c04a'), tag)
    fh = h * 0.72; yTop = h - 0.1
    def cloth(p, n, yb=F.W((0, yTop - fh, 0)).z):
        return mix(mul(color, 0.8), mix(color, '#fff0d8', 0.12), clamp((p.z - yb) / fh) * 0.7 + 0.2 * clamp(-n.y))
    add(beam(w, fh - 0.1, 0.03, (0.02 + w / 2, yTop - (fh - 0.1) / 2, 0), c=0.012, rx=0.02), cloth, tag)
    add(box(w + 0.004, 0.1, 0.034, (0.02 + w / 2, yTop - fh + 0.05, 0), r=0.0), soft('#fff6ea', 0.2), tag)
    add(box(0.05, fh, 0.036, (0.045, yTop - fh / 2, 0.002), r=0.0), soft('#fff6ea', 0.2), tag)
    for zz, ry_ in ((0.018, 0.0), (-0.018, PI)):
        with at((0.02 + w / 2, yTop - fh * 0.3, zz), ry=ry_):
            add(puffy([(x * w * 0.36, y * w * 0.36) for x, y in star_poly(1.0, 0.45)], 0.014, bev=0.004, z0=0.0), flat('#fff6ea'), tag)
    add(cyl(0.1, 0.13, 0.14, (0, 0.07, 0), K=7), stone_col(ONSEN_STONES[1]), tag)
    pillow((0, 0.15, 0), 0.11, 0.5, 6, tag=tag)

# ================================================================== round 2: shared pieces for the inn, bathhouse, smith, gate, lantern post
def hammer_mark(size, pos=(0, 0, 0), tag='sign'):
    x, y, z = pos
    add(beam(0.09 * size, 0.5 * size, 0.04, (x, y - 0.13 * size, z + 0.02), c=0.01), soft('#c98f5e', 0.2), tag)
    add(beam(0.6 * size, 0.22 * size, 0.05, (x, y + 0.2 * size, z + 0.03), c=0.014), soft('#6a6878', 0.3), tag)

def slate_roof(typ, w, d, y0, over, H, curve, **kw):
    """a slate tile roof (roofs.js maths, the zone's slate paint) meant to sit under snow: no courses (hidden), rolls,
    round tile ends at the eave; kw passes roof() options (tTop, tg, gOver, ridge, gable, ...)"""
    o = dict(type=typ, w=w, d=d, y0=y0, over=over, H=H, curve=curve, lift=0.04, liftW=0.5, thick=kw.pop('thick', 0.13),
             ribW=kw.pop('ribW', 0.6), ribAmp=0.03, course=0.0, mid=False, courseAmp=0.0, color=kw.pop('tile', T['tile']), pal=dict(SLATE_PAL, **kw.pop('pal', {})),
             rich=1, seed=kw.pop('seed', 11), finial=False, curl=False, oni=False, ridgeCap=False, k=kw.pop('k', 0.38), gable='wood', gableWood=T['timberMid'], timber=T['timber'], vent=False)
    o.update(kw)
    return roof(o)

def roof_surf(info, curve):
    R = info['R']; return lambda t: R['yb'] + R['H'] * prof(t, curve) + 0.035

def sheet_icicles(lipline, every=0.3, lens=(0.06, 0.24), seed=0, sides=(1, -1)):
    rng = random.Random(seed * 991 + 7)
    for sg in sides:
        L = lipline[sg]
        for j in range(len(L) - 1):
            a, b = L[j], L[j + 1]
            seg = math.dist(a, b); n = seg / every
            if rng.random() > n: continue
            f = rng.random(); x, y, z = (a[q] + (b[q] - a[q]) * f for q in range(3))
            icicle(x + sg * 0.004, y + 0.012, z, lens[0] + (lens[1] - lens[0]) * rng.random() ** 1.6)

def snow_gable_x(info, w, gOver, curve, th=0.12, lip=0.07, ridge=0.05, NZ=16, seed=0, ice=None, cushion=0.04, tperiod=0.5, zperiod=0.8, nrows=6):
    """snow over a slate gable whose ridge runs along local x (roof() default), with icicles under both eaves"""
    Bz = info['Bz']; ySurf = roof_surf(info, curve)
    with at((0, 0, 0), ry=PI / 2):
        ll = snow_sheet(w / 2 + gOver + 0.02, lambda t: Bz * (1 - t), ySurf, th=th, lip=lip, droop=0.05, endLip=0.06, ridge=ridge, NZ=NZ, seed=seed,
                        cushion=cushion, tperiod=tperiod, zperiod=zperiod, nrows=nrows, rollp=0.4)
        if ice: sheet_icicles(ll, ice.get('every', 0.25), ice.get('len', (0.05, 0.2)), seed, ice.get('sides', (1, -1)))
    return ySurf(1.0) + th + ridge

def camellia_crest(s, pos=(0, 0, 0), depth=0.022, tag='sym', K=8):
    """the camellia crest: five round red petals and a gold heart (raised, face frame)"""
    x, y, z = pos
    for i in range(5):
        a = PI / 2 + i * TAU / 5
        add(glathe([(0.0, -depth / 2), (0.2 * s, -depth / 2), (0.19 * s, depth / 2), (0.0, depth / 2 + 0.004)], K, pos=(x + math.cos(a) * 0.2 * s, y + math.sin(a) * 0.2 * s, z), rx=PI / 2),
            lambda p, n: mix(mul(T['camellia'], 0.85), '#e8505a', clamp(-n.y * 0.5 + n.z * 0.5)), tag)
    add(glathe([(0.0, -depth / 2), (0.11 * s, -depth / 2), (0.1 * s, depth / 2), (0.0, depth / 2 + 0.006)], 10, pos=(x, y, z + depth * 0.6), rx=PI / 2), lac('#f4c84a'), tag)

def sign_board(w, h, wood_c='#2e2420', frame_c='#1e1614', tag='sign'):
    """a framed wooden signboard (face frame, centred; the face at z = +0.025)"""
    add(beam(w, h, 0.05, (0, 0, 0), c=0.018), wood(wood_c), tag)
    frame_ring(w + 0.02, h + 0.02, 0.0, 0.032, wood(frame_c), tag)

def bay_lattice(w, h, frame, slat, roofc, tag='window', sp=0.075):
    """parts.js latticeWindow with a bay: the lattice set out on side boards under a little slate hood with snow"""
    bay = 0.11
    for s in (-1, 1): add(beam(0.07, h - 0.02, bay + 0.02, (s * (w / 2 - 0.035), 0, (bay + 0.02) / 2), c=0.015), wood(mul(frame, 0.9)), tag)
    with at((0, 0, bay)): lattice_window(w, h, frame, slat, tag, sp=sp)
    add(beam(w + 0.2, 0.05, bay + 0.26, (0, h / 2 + 0.08, (bay + 0.26) / 2 - 0.02), c=0.015, rx=0.22), paint(roofc, top=0.2), tag)
    snow_slab(0, h / 2 + 0.1, (bay + 0.26) / 2 - 0.02, w + 0.18, bay + 0.2, 0.05, int(w * 37), spacing=0.8)

def yukimi(s=1.0, seed=0, tag='yukimi', lite=False):
    """the snow-viewing lantern: three splayed legs, a hex firebox with paper windows, a wide kasa under a snow cap"""
    stone, dark = T['stoneLight'], '#5e6478'
    with at((0, 0, 0), s=s):
        for i in range(3):
            a = i / 3 * TAU + 0.5; dx, dz = math.cos(a), math.sin(a)
            add(gtube([(dx * 0.46, 0.0, dz * 0.46), (dx * 0.4, 0.34, dz * 0.4), (dx * 0.18, 0.6, dz * 0.18)], lambda u: 0.075 - 0.02 * u, K=5 if lite else 6), stone_col(stone, i), tag)
            pillow((dx * 0.47, 0.02, dz * 0.47), 0.13, 0.45, seed + i, K=8, tag=tag, fine=False)
        add(cyl(0.34, 0.29, 0.1, (0, 0.65, 0), K=6), stone_col(stone, 4), tag)
        add(cyl(0.23, 0.23, 0.34, (0, 0.88, 0), K=6), flat(dark), tag)
        for i in range(0, 6, 2):
            a = i / 6 * TAU + PI / 6
            with at((0, 0.88, 0), ry=-a + PI / 2):
                add(box(0.19, 0.22, 0.03, (0, 0, 0.2), r=0.0), flat(T['paperDim']), tag)
        add(glathe([(0.0, 0.04), (0.2, 0.04), (0.6, -0.02), (0.72, 0.0), (0.7, 0.03), (0.55, 0.1), (0.2, 0.24), (0.0, 0.26)], 6, pos=(0, 1.07, 0)), stone_col(stone, 5), tag)
        pillow((0, 1.2, 0), 0.6, 0.38, seed + 7, K=10 if lite else 12, J=4 if lite else 5, tag=tag, fine=False)
        add(sph(0.09, (0, 1.46, 0), sc=(1, 1.2, 1), K=7, J=4), stone_col(stone, 6), tag)
        pillow((0, 1.55, 0), 0.09, 0.6, seed + 9, K=7, tag=tag, fine=False)

def tea_bench(w=1.0, felt=None, tag='bench'):
    felt = felt or T['camellia']
    add(beam(w, 0.06, 0.4, (0, 0.42, 0), c=0.015), wood('#8a6448'), tag)
    add(sbox(w + 0.06, 0.03, 0.46, (0, 0.465, 0), r=0.012), soft(felt, 0.3), tag)
    add(sbox(0.06, 0.04, 0.47, (0.1, 0.46, 0), r=0.01), soft(mul(felt, 0.8), 0.2), tag)
    for sx in (-1, 1):
        for sz in (-1, 1): add(box(0.06, 0.4, 0.06, (sx * (w / 2 - 0.06), 0.2, sz * 0.14), r=0.0), wood('#6a4a36'), tag)

def wagasa(r=0.72, h=1.7, color=None, tag='parasol'):
    """a red paper parasol (nodate-gasa): a bamboo pole, the ribbed canopy, a dark tip"""
    color = color or T['camellia']
    add(cyl(0.03, 0.035, h, (0, h / 2, 0), K=6), wood('#c8a868'), tag)
    K = 16
    t = glathe([(0.0, 0.32), (r * 0.3, 0.27), (r * 0.75, 0.1), (r, 0.0), (r * 0.96, -0.03), (r * 0.3, 0.22), (0.0, 0.26)], K, pos=(0, h - 0.3, 0))
    add(t, lambda p, n: mix(mul(color, 0.82), mix(color, '#ff8a8a', 0.2), clamp(n.z)), tag)
    add(cyl(0.06, 0.03, 0.08, (0, h + 0.05, 0), K=6), flat('#2a2226'), tag)
    pillow((0, h + 0.04, 0), 0.2, 0.3, 9, tag=tag, fine=False)

def towel_rack(colors=('#fff4ea', '#8fd0ff'), tag='towels'):
    for sx in (-1, 1): add(cyl(0.025, 0.03, 0.95, (sx * 0.42, 0.475, 0), K=5), wood('#8a6448', ao_z=0.0), tag)
    add(cyl(0.022, 0.022, 0.96, (0, 0.92, 0), K=5, rz=PI / 2), wood('#8a6448'), tag)
    for i, x in enumerate((-0.24, 0.0, 0.24)):
        c = colors[i % len(colors)]
        add(sbox(0.2, 0.34, 0.03, (x, 0.75, 0.025), r=0.012), soft(c, 0.25), tag)
        add(sbox(0.2, 0.12, 0.03, (x, 0.86, -0.025), r=0.012), soft(mul(c, 0.92), 0.2), tag)

def bucket_oke(r=0.13, h=0.16, tag='buckets', hoops=(0.25, 0.8), K=10):
    add(glathe([(0.0, 0.0), (r * 0.9, 0.0), (r, h), (r * 0.92, h), (r * 0.82, h * 0.2), (0.0, h * 0.2)], K),
        lambda p, n: mul('#c8a070', 0.88 + 0.14 * clamp(n.z + 0.4)), tag)
    for yy in hoops:
        R = r * (0.9 + 0.1 * yy) + 0.006
        add(gloop([(R * math.cos(TAU * k / 8), h * yy, R * math.sin(TAU * k / 8)) for k in range(8)], 0.014, K=3), soft('#5a4a3a', 0.3), tag)

def anvil_stump(tag='anvil'):
    add(cyl(0.24, 0.27, 0.5, (0, 0.25, 0), K=10, bev=0.03), lambda p, n: '#e0c090' if n.z > 0.8 else mul('#7a5a42', 0.88 + 0.12 * clamp(n.z + 0.5)), tag)
    add(beam(0.42, 0.16, 0.2, (0, 0.6, 0), c=0.03), lac('#4e4a58', hi='#8a8698'), tag)
    add(beam(0.26, 0.1, 0.14, (0, 0.5, 0), c=0.02), soft('#3e3a46', 0.3), tag)
    add(glathe([(0.0, 0.0), (0.075, 0.0), (0.0, 0.22)], 7, pos=(0.21, 0.62, 0), rz=-PI / 2), lac('#4e4a58', hi='#8a8698'), tag)
    pillow((-0.12, 0.69, 0.02), 0.07, 0.5, 4, tag=tag, fine=False)

def tool_rack(w=1.1, tools=('tongs', 'hammer', 'tongs', 'saw', 'hammer'), tag='tools'):
    add(beam(w, 0.08, 0.06, (0, 0, 0.03), c=0.015), wood(T['timber']), tag)
    for i, kind in enumerate(tools):
        x = -w / 2 + 0.12 + i * (w - 0.24) / max(1, len(tools) - 1)
        add(box(0.03, 0.06, 0.03, (x, 0.0, 0.08), r=0.0), soft(T['iron'], 0.3), tag)
        if kind == 'hammer':
            add(box(0.035, 0.36, 0.03, (x, -0.2, 0.09), r=0.0), wood('#b48c66'), tag)
            add(beam(0.16, 0.07, 0.07, (x, -0.38, 0.09), c=0.012), lac('#5a5664'), tag)
        elif kind == 'tongs':
            for s in (-1, 1): add(box(0.024, 0.46, 0.024, (x + s * 0.02, -0.25, 0.09), r=0.0, rz=s * 0.06), soft('#4a4652', 0.3), tag)
        else:
            add(box(0.12, 0.3, 0.012, (x, -0.2, 0.09), r=0.0), soft('#b8bcc8', 0.3), tag)
            add(box(0.05, 0.1, 0.03, (x, -0.02, 0.09), r=0.0), wood('#8a6448'), tag)

def ore_cluster(n=9, r=0.28, seed=0, glow=True, tag='ore'):
    """snow ore: pale ice-blue crystals (they glow from inside: ore_glow)"""
    rng = random.Random(seed * 37 + 1)
    for i in range(n):
        a = rng.random() * TAU; dd = math.sqrt(rng.random()) * r; L = 0.14 + rng.random() * 0.22; rb = 0.04 + rng.random() * 0.035
        t = glathe([(0.0, 0.0), (rb, 0.0), (rb * 0.8, L * 0.7), (0.0, L)], 6, pos=(math.cos(a) * dd, 0.02, math.sin(a) * dd), rz=(rng.random() - 0.5) * 0.9, ry=rng.random() * TAU)
        add(t, (lambda p, nn: mix('#e8f8ff', '#9fd2ff', clamp(-nn.z + 0.5))) if glow else (lambda p, nn: mix('#cfefff', '#7ab8e8', clamp(-nn.z + 0.3) * 0.6)),
            tag, glow='ore' if glow else False)

def water_disc(r, pos, tag='water'):
    """a flat water surface (material `water`)"""
    t = glathe([(0.0, -0.01), (r, -0.01), (r, 0.0), (0.0, 0.004)], 16, pos=pos)
    A.add(LAYER or OB, 'water', t.orient(), lambda p, n: '#4ac8c4', tag)

def sweep_x(xs, prof, tag, col):
    """stations along local x; prof(x) -> a closed loop [(y, z)] (same length everywhere); end caps as n-gons"""
    rings = []; cs = []
    for x in xs:
        P = prof(x); n = len(P)
        rings.append([F.W((x, y, z)) for (y, z) in P]); cs.append(F.W((x, sum(q[0] for q in P) / n, sum(q[1] for q in P) / n)))
    tm = Tmp(); ids = ring_surface(tm, rings, cs)
    tm.face(list(ids[0]), F.N((-1, 0, 0))); tm.face(list(ids[-1]), F.N((1, 0, 0)))
    add(tm, col, tag)

def karahafu(W=2.3, D=1.3, y0=1.99, H=0.46, th=0.11, rise=0.1, seed=0, tag='karahafu'):
    """the bathhouse's cusped-gable porch roof off the wall (local: x across, z = 0 at the wall -> D at the front): an
    ogee bell that humps in the middle and flares at the ends, slate on top, a dark bargeboard with a silver edge, the
    bronze gegyo, all under a rounded snow blanket with a rolled lip and icicles"""
    bell = lambda u: H * ((1 + math.cos(PI * min(1, abs(u)))) / 2) ** 0.85 + 0.07 * smooth(0.8, 1.0, abs(u))
    yT = lambda u, k: y0 + bell(u) + (1 - k) * rise
    NX = 20; xs = [-W / 2 + W * i / NX for i in range(NX + 1)]
    ks = [0.0, 0.25, 0.5, 0.75, 1.0]
    def slab(x):
        u = 2 * x / W
        return [(yT(u, k), k * D) for k in ks] + [(yT(u, k) - th, k * D) for k in reversed(ks)]
    sweep_x(xs, slab, tag, lambda p, n: (mul(T['tile'], 0.82 + 0.28 * abs(math.sin(p.x * 14)) ** 0.6) if n.z > 0.2 else T['soffit']))
    sweep_x(xs, lambda x: [(yT(2 * x / W, 1) + 0.03, D), (yT(2 * x / W, 1) + 0.03, D + 0.07), (yT(2 * x / W, 1) - th - 0.1, D + 0.07), (yT(2 * x / W, 1) - th - 0.1, D)],
            tag, wood(T['timber']))
    sweep_x(xs, lambda x: [(yT(2 * x / W, 1) + 0.005, D + 0.03), (yT(2 * x / W, 1) + 0.05, D + 0.03), (yT(2 * x / W, 1) + 0.05, D + 0.1), (yT(2 * x / W, 1) + 0.005, D + 0.1)],
            tag, soft('#d8d4cc', 0.3))
    with at((0, y0 + H - th - 0.05, D + 0.12)):                  # the gegyo
        add(glathe([(0.0, -0.02), (0.12, -0.02), (0.11, 0.02), (0.0, 0.025)], 12, rx=PI / 2), lac('#b08a4a'), tag)
        add(glathe([(0.0, 0.0), (0.09, 0.06), (0.0, 0.2)], 8, pos=(0, -0.02, 0), rx=PI), lac('#b08a4a'), tag)
        for s in (-1, 1): add(gtube([(s * 0.1, 0.0, 0), (s * 0.19, 0.05, 0), (s * 0.26, 0.0, 0), (s * 0.22, -0.05, 0)], 0.022, K=4), lac('#b08a4a'), tag)
        add(sph(0.045, (0, 0, 0.03), K=7, J=4), lac('#f2c04a'), tag)
    sth = lambda u: 0.012 + 0.13 * (1 - smooth(0.8, 1.0, abs(u)))
    roll, drip = lip_rolls(W * 1.02, 0.42, seed + 5, 0.4, 0.04, 0.08)
    def snowp(x):
        u = 2 * x / (W * 1.02); sv = x + W * 0.51; r_ = roll(sv); dd = drip(sv) * (1 - smooth(0.75, 0.95, abs(u)))
        st = sth(u); top = [(yT(u, k) + st * (1 + 0.1 * math.sin(PI * k)), k * D) for k in ks]
        lipr = [(yT(u, 1) + st * 0.9, D - 0.01 + 0.02 * r_), (yT(u, 1) + st * 0.45, D + 0.03 + 0.03 * r_), (yT(u, 1) + 0.0 - dd, D + 0.02 + 0.02 * r_ + 0.25 * dd)]
        return top + lipr + [(yT(u, 1) - 0.005, D - 0.02), (yT(u, 0) - 0.005, 0.02)]
    sweep_x([-W * 0.51 + W * 1.02 * i / NX for i in range(NX + 1)], snowp, 'roofsnow', SNOW)
    rng = random.Random(seed * 131 + 7)
    for i in range(11):
        u = -0.85 + i / 10 * 1.7 + (rng.random() - 0.5) * 0.05
        if rng.random() < 0.3: continue
        icicle(u * W / 2, yT(u, 1) - 0.135, D + 0.07, 0.08 + rng.random() ** 1.5 * 0.22)
    return yT

def brick_chimney(cx, cz, top=5.6, tag='chimney', rings=12):
    """the boiler's chimney: a tall tapered square brick stack, iron bands, a soot-dark crown, the onsen mark painted on"""
    rs = [(0.42 - 0.12 * (q / rings), top * q / rings) for q in range(rings + 1)]
    def col(p, n, z0=F.W((0, 0, 0)).z):
        y = p.z - z0; band = (int(y / 0.21) % 2)
        c = mul(T['brick'], 0.92 + 0.1 * band + 0.06 * vnoise(p, 5, 3))
        c = mix(c, '#3a2a2a', smooth(top - 0.7, top, y) * 0.6)
        return mul(c, 0.9 + 0.12 * clamp(n.z + 0.3))
    add(glathe([(0.0, 0.0)] + rs + [(0.0, top)], 4, pos=(cx, 0, cz)), col, tag)
    for y in (1.2, 2.3, 3.4, 4.5):
        r = 0.42 - 0.12 * y / top + 0.02
        add(glathe([(0.0, -0.03), (r, -0.03), (r, 0.03), (0.0, 0.03)], 4, pos=(cx, y, cz)), soft('#3a3a44', 0.3), tag)
    add(glathe([(0.0, 0.0), (0.36, 0.0), (0.37, 0.06), (0.33, 0.12), (0.0, 0.12)], 4, pos=(cx, top, cz)), soft('#5a4a48', 0.3), tag)
    pillow((cx + 0.12, top + 0.13, cz), 0.13, 0.5, 31, tag=tag, fine=False)
    rr = 0.42 - 0.12 * 4.1 / top
    onsen_mark(0.42, (cx, 4.1, cz + rr * 0.72 + 0.012), depth=0.02, col='#f6f0e4', tag=tag, K=4)

def bamboo_screen(L, tag='screen', cap_spacing=0.5):
    """the outdoor bath's bamboo screen along local z (0 -> L): close poles, two rails, stout posts, a snow cap"""
    n = round(L / 0.1)
    for i in range(n):
        z = i * L / n + 0.04; hh = 1.45 + 0.05 * math.sin(i * 1.7)
        add(cyl(0.036, 0.038, hh, (0, hh / 2, z), K=4), lambda p, nn, i=i: mul('#b8b070' if i % 3 else '#a8a060', 0.88 + 0.16 * clamp(nn.z + 0.5)), tag)
    for y in (0.45, 1.05): add(cyl(0.03, 0.03, L, (0.05, y, L / 2), K=5, rx=PI / 2), wood(T['timber']), tag)
    for k in range(4): add(cyl(0.06, 0.07, 1.58, (0, 0.79, k * L / 3), K=7), wood('#6a5a3a', ao_z=0.0), tag)
    snow_slab(0, 1.5, L / 2, 0.14, L + 0.05, 0.06, 13, spacing=cap_spacing)

def egg_basin(tag='basin'):
    """the onsen-tamago basin: a steaming stone basin of spring water, two baskets of eggs hung in it, the onsen sign"""
    add(cyl(0.42, 0.46, 0.4, (0, 0.2, 0), K=14, bev=0.04), stone_col(T['stone'], 7), tag)
    pillow((0.24, 0.4, -0.2), 0.14, 0.4, 3, K=8, tag=tag, fine=False)
    water_disc(0.35, (0, 0.375, 0))
    for s in (-1, 1): add(beam(0.05, 0.85, 0.05, (s * 0.36, 0.43, 0), c=0.012), wood(T['wood']), tag)
    add(cyl(0.024, 0.024, 0.8, (0, 0.84, 0), K=5, rz=PI / 2), wood(T['wood']), tag)
    for x in (-0.13, 0.13):
        add(box(0.012, 0.42, 0.012, (x, 0.63, 0), r=0.0), flat('#c8b088'), tag)
        add(glathe([(0.0, 0.0), (0.08, 0.0), (0.11, 0.1), (0.0, 0.05)], 9, pos=(x, 0.36, 0)), lambda p, n: mul('#c8a060', 0.85 + 0.2 * abs(math.sin(p.z * 160))), tag)
        for k in range(3): add(sph(0.036, (x + (k - 1) * 0.045, 0.44, 0.0), sc=(1, 1.25, 1), K=6, J=3), soft('#f4ecd8', 0.25), tag)
    pillow((0, 0.87, 0), 0.07, 0.6, 3, 4, 0.7, tag=tag, fine=False)
    with at((0.46, 0.66, 0.02), ry=-0.2):
        sign_board(0.26, 0.18)
        onsen_mark(0.13, (0, -0.01, 0.03), depth=0.012)

# ================================================================== Ryokan Tsubaki (artOnsen inn: the grand two-storey inn)
def build_inn():
    new_asset('zv-onsen-inn')
    w, d, h, y0, zc = 4.2, 2.8, 1.5, 0.3, -0.3
    Fz = zc + d / 2
    F.push((0, 0, zc))
    foundation(w, d, y0, pad=0.12, seed=7, color=T['stone'])
    walls(dict(w=w, d=d, h=h, y0=y0, plaster=T['plaster'], frame=T['timber'], koshi=T['koshi'], koshiSkip='f'))
    blk = dict(w=w, d=d)
    with on_face(blk, 'f', 0, y0): door_slide(1.1, 1.32, 'lattice', '#9a7656', T['timber'])
    for s in (-1, 1):
        with on_face(blk, 'f', s * 1.42, y0 + 0.78): bay_lattice(0.86, 0.56, T['timber'], T['bengara'], T['tile'], sp=0.1)
    for side in 'lr':
        for u in (-0.6, 0.6):
            with on_face(blk, side, u, y0 + 0.8): shoji(0.58, 0.5, frame=T['timber'], cell=0.3)
    with on_face(blk, 'b', 0, y0 + 0.8): shoji(1.0, 0.5, frame=T['timber'])
    # the skirt roof round the ground floor, under its snow ring
    R1 = slate_roof('skirt', w, d, y0 + h, 0.42, 0.92, 0.3, tTop=0.46, seed=31, ribW=0.75)
    A1, B1 = R1['A'], R1['Bz']
    snow_blanket(lambda t: A1 - B1 * t, lambda t: B1 * (1 - t), roof_surf(R1, 0.3), lambda x, z: R1['yAt'](x, z) + 0.035, th=0.13, lip=0.08,
                 droop=0.05, NS=64, seed=41, cushion=0.07, tperiod=0.4, aperiod=1.2, tTop=0.46, inner=0.1, rollp=0.8, ice=dict(every=0.48, len=(0.06, 0.28)))
    # the upper floor: a run of glowing shoji behind a bengara-red balcony (the Ginzan look)
    uw, ud, uh, uy = min(3.6, R1['openW'] - 0.14), min(2.0, R1['openD'] - 0.12), 1.22, R1['topY']
    walls(dict(w=uw, d=ud, h=uh, y0=uy, plaster=T['plaster'], frame=T['timber'], rail=False))
    ub = dict(w=uw, d=ud)
    for i in range(4):
        with on_face(ub, 'f', -uw / 2 + (i + 0.5) * uw / 4, uy + 0.62): shoji(uw / 4 - 0.12, 0.66, frame=T['timber'], cell=0.3)
    for side in 'lr':
        with on_face(ub, side, 0, uy + 0.62): round_window(0.24, frame=T['timber'])
    with on_face(ub, 'b', 0, uy + 0.62): shoji(0.9, 0.5, frame=T['timber'])
    bz, bd = ud / 2, 0.42
    add(beam(uw + 0.2, 0.06, bd, (0, uy + 0.03, bz + bd / 2), c=0.015), wood(T['deck']), 'balcony')
    for i in range(4):
        x = -uw / 2 - 0.05 + i * (uw + 0.1) / 3
        add(beam(0.07, 0.07, bd + 0.1, (x, uy - 0.12, bz + bd * 0.4), c=0.014, rx=0.5), wood(T['bengara']), 'balcony')
    for i in range(15):
        x = -uw / 2 - 0.08 + i * (uw + 0.16) / 14; big = i % 7 == 0
        add(box(0.06 if big else 0.035, 0.5, 0.06 if big else 0.035, (x, uy + 0.3, bz + bd - 0.03), r=0.0), wood(T['bengara']), 'balcony')
    for y in (uy + 0.12, uy + 0.56): add(beam(uw + 0.24, 0.055, 0.075, (0, y, bz + bd - 0.03), c=0.014), wood(T['bengara']), 'balcony')
    snow_slab(0, uy + 0.585, bz + bd - 0.03, uw + 0.22, 0.12, 0.045, 3, spacing=0.75)
    # the upper irimoya roof: a snow ring round the hipped skirt, a snow sheet over the gable top
    tg, gO, cv2 = 0.55, 0.2, 0.3
    R2 = slate_roof('irimoya', uw, ud, uy + uh, 0.55, 1.25, cv2, tg=tg, gOver=gO, seed=37, ribW=0.8)
    A2, B2 = R2['A'], R2['Bz']; ys2 = roof_surf(R2, cv2)
    snow_blanket(lambda t: A2 - B2 * t, lambda t: B2 * (1 - t), ys2, lambda x, z: R2['yAt'](x, z) + 0.035, th=0.15, lip=0.1, droop=0.05,
                 NS=60, seed=43, cushion=0.07, tperiod=0.3, aperiod=1.2, tTop=tg + 0.08, inner=0.04, nmid=7, rollp=0.8, ice=dict(every=0.44, len=(0.07, 0.3)))
    Xg = A2 - B2 * tg + gO
    t0 = tg - 0.06; TT = lambda t: t0 + t * (1 - t0)
    with at((0, 0, 0), ry=PI / 2):
        snow_sheet(Xg + 0.02, lambda t: B2 * (1 - TT(t)), lambda t: ys2(TT(t)), th=0.17, lip=0.08, droop=0.05, endLip=0.07, ridge=0.07, NZ=10,
                   seed=45, cushion=0.05, tperiod=0.5, zperiod=1.0, nrows=5, rollp=0.7, drips=0.1)
    onigawara(Xg + 0.05, ys2(1.0) + 0.17 + 0.07 - 0.06, clamp(B2 / 1.4, 0.55, 1.1), seed=7)
    # the entrance porch: a little slate gable (its gable to the square) on two posts, the camellia crest in it
    py = y0 + 1.55; pz = Fz + 0.42
    for s in (-1, 1):
        add(beam(0.12, py, 0.12, (s * 0.74, py / 2, Fz + 0.74), c=0.02), wood(T['timber'], ao_z=0.0), 'porch')
        add(cyl(0.12, 0.14, 0.12, (s * 0.74, 0.06, Fz + 0.74), K=8), stone_col(STONES[2]), 'porch')
    add(beam(1.7, 0.12, 0.12, (0, py - 0.05, Fz + 0.74), c=0.02), wood(T['timber']), 'porch')
    with at((0, 0, pz)):
        Rp = slate_roof('gable', 1.58, 0.92, py, 0.16, 0.55, 0.25, ridge='z', gOver=0.2, ribW=0.2, seed=47)
        with at((0, 0, 0)):
            ll = snow_sheet(0.92 / 2 + 0.2 + 0.02, lambda t: Rp['Bz'] * (1 - t), roof_surf(Rp, 0.25), th=0.12, lip=0.07, droop=0.05, endLip=0.06,
                            ridge=0.05, NZ=6, seed=49, cushion=0.03, tperiod=0.5, zperiod=0.7, nrows=4, rollp=0.4)
            sheet_icicles(ll, 0.24, (0.05, 0.18), 49)
        with at((0, py + 0.22, 0.5)):
            sign_board(0.42, 0.32, '#3a2a24', '#2a1e1a')
            camellia_crest(0.36, (0, 0, 0.03), K=7)
    # tall kanban boards on both side walls (the camellia crest reads from any side of the square)
    for side in 'lr':
        with on_face(blk, side, (1 if side == 'l' else -1) * (d / 2 - 0.42), y0 + 0.95):
            with at((0, 0, 0.04)):
                sign_board(0.34, 0.9, '#3a2a24', '#2a1e1a'); camellia_crest(0.28, (0, 0.18, 0.03), K=6)
                snow_slab(0, 0.47, 0.0, 0.42, 0.1, 0.04, 5)
    with at((-w / 2 + 0.05, 0, Fz + 0.85), ry=0.3): yukimi(0.62, 31, lite=True)
    # (a lean bank: the back one hides behind the inn from the game camera)
    for s in (-1, 1):
        with at((s * 1.65, -0.05, Fz + 0.55), ry=s): snow_bush(0.62, 2 + s, nf=4, lite=True)
    bank(-w / 2, w / 2, zc - d / 2 - 0.12, r=0.5, seed=7)
    for s in (-1, 1):
        with at((s * (w / 2 + 0.12), 0, zc), ry=PI / 2): bank(-d / 2, d / 2, 0, r=0.38, seed=11 + s)
    F.pop()
    with at((w / 2 + 0.35, 0, -0.7)):
        barrel(0.17, 0.38, '#8a6448'); pillow((0, 0.4, 0), 0.16, 0.5, 4, tag='barrel', fine=False)
    # ---- siege
    with layer('siege'):
        F.push((0, 0, zc))
        with at((0, y0 + 0.66, Fz)): boards(1.15, 1.32, seed=5)
        for s in (-1, 1):
            with at((s * 1.42, y0 + 0.78, Fz + 0.13)): boards(0.9, 0.6, seed=6 + s)
        for u in (-1.35, 0.45):
            with at((u, uy + 0.62, ud / 2)): boards(0.82, 0.62, seed=9 + round(u * 4))
        with at((-1.95, y0, Fz + 0.004)): soot(0.6, 1.25, seed=7)
        with at((1.7, 0, Fz + 1.5)): debris(0.8, seed=23, n=5)
        with at((1.9, 0, Fz + 1.05)): war_banner(2.5, 0.52, seed=27)
        F.pop()
    # ---- saved
    with layer('saved'):
        F.push((0, 0, zc))
        with at((0, y0, Fz)): noren_sign(1.06, 0.5, 1.3, 0.16, T['crimson'], 3, 'camellia', 0.32)
        for x, c in ((-1.2, '#fff4ea'), (-0.35, '#8fd0ff'), (0.55, '#ffd0d8'), (1.3, '#fff4ea')):
            with at((x, uy + 0.585, bz + bd)):
                add(sbox(0.32, 0.36, 0.025, (0, -0.17, 0.03), r=0.01), soft(c, 0.25), 'towels')
                add(sbox(0.32, 0.12, 0.025, (0, -0.04, -0.03), r=0.01), soft(mul(c, 0.92), 0.2), 'towels')
        with at((1.3, 0, Fz + 1.25), ry=PI): tea_bench(1.0)
        with at((2.0, 0, Fz + 1.5)): wagasa(0.72, 1.7)
        for s in (-1, 1):
            with at((s * 0.22, 0.02, Fz + 0.98)):
                add(sbox(0.1, 0.04, 0.22, (0, 0.04, 0), r=0.012), wood('#c8a070'), 'geta')
                add(box(0.02, 0.025, 0.1, (0, 0.07, 0.03), r=0.0), flat(T['camellia']), 'geta')
        F.pop()
    return A, dict(fp=[-w / 2 - 0.12, zc - d / 2 - 0.12, w / 2 + 0.12, Fz + 0.86], door=[0, Fz + 1.25],
                   lamps=[[-0.55, py - 0.12, Fz + 0.86], [0.55, py - 0.12, Fz + 0.86]], uy=round(uy, 3))

# ================================================================== Yukimi Bathhouse (artOnsen bathhouse: the public bath)
def build_bathhouse():
    new_asset('zv-onsen-bathhouse')
    w, d, h, y0, zc = 4.4, 2.6, 1.9, 0.36, -0.2
    Fz = zc + d / 2
    F.push((0, 0, zc))
    foundation(w, d, y0, pad=0.12, seed=9, color=T['stone'], gap=0.85)
    walls(dict(w=w, d=d, h=h, y0=y0, plaster=T['plaster'], frame=T['timber'], koshi=T['koshi'], koshiSkip='f'))
    blk = dict(w=w, d=d)
    with on_face(blk, 'f', 0, y0): door_wood(1.3, 1.42, '#8a6448', T['timber'])
    for s in (-1, 1):
        with on_face(blk, 'f', s * 1.6, y0 + 0.78): lattice_window(0.72, 0.6, T['timber'], T['timberMid'], sp=0.1)
        with on_face(blk, 'f', s * 1.6, y0 + h - 0.3): shoji(0.62, 0.26, frame=T['timber'], cell=0.2)
    for side in 'lr':
        for u in (-0.75, 0.75):
            with on_face(blk, side, u, y0 + h - 0.42): lattice_window(0.62, 0.36, T['timber'], sp=0.15)
    for u in (-1.2, 0, 1.2):
        with on_face(blk, 'b', u, y0 + h - 0.42): lattice_window(0.62, 0.34, T['timber'], sp=0.14)
    tg, gO, cv = 0.5, 0.22, 0.32
    R = slate_roof('irimoya', w, d, y0 + h, 0.56, 1.5, cv, tg=tg, gOver=gO, seed=53, ribW=0.8)
    Aw, Bz = R['A'], R['Bz']; ys = roof_surf(R, cv)
    snow_blanket(lambda t: Aw - Bz * t, lambda t: Bz * (1 - t), ys, lambda x, z: R['yAt'](x, z) + 0.035, th=0.17, lip=0.1, droop=0.05,
                 NS=56, seed=55, cushion=0.09, tperiod=0.28, aperiod=1.3, tTop=tg + 0.08, inner=0.04, nmid=6, rollp=0.9, ice=dict(every=0.65, len=(0.07, 0.32)))
    Xg = Aw - Bz * tg + gO; t0 = tg - 0.06; TT = lambda t: t0 + t * (1 - t0)
    with at((0, 0, 0), ry=PI / 2):
        snow_sheet(Xg + 0.02, lambda t: Bz * (1 - TT(t)), lambda t: ys(TT(t)), th=0.17, lip=0.09, droop=0.05, endLip=0.07, ridge=0.07, NZ=8,
                   seed=57, cushion=0.07, tperiod=0.45, zperiod=1.0, nrows=4, rollp=0.8, drips=0.1)
    sy1 = ys(1.0) + 0.17 + 0.07
    onigawara(Xg + 0.05, sy1 - 0.06, clamp(Bz / 1.4, 0.55, 1.1), seed=11)
    # the yagura: a raised steam vent on the ridge, slatted sides under its own little snowy roof
    vy = sy1 - 0.12 - 0.07 + 0.0
    with at((0, vy, 0)):
        add(beam(1.3, 0.42, 0.66, (0, 0.21, 0), c=0.02), wood(T['timberMid']), 'yagura')
        for s in (-1, 1):
            for i in range(9): add(box(0.035, 0.32, 0.02, (-0.56 + i * 0.14, 0.24, s * 0.34), r=0.0), flat('#2a2020'), 'yagura')
            for i in range(4): add(box(0.02, 0.32, 0.035, (s * 0.66, 0.24, -0.24 + i * 0.16), r=0.0), flat('#2a2020'), 'yagura')
        Ry = slate_roof('gable', 1.3, 0.66, 0.44, 0.2, 0.34, 0.2, gOver=0.16, ribW=0.18, seed=59)
        snow_gable_x(Ry, 1.3, 0.16, 0.2, th=0.1, lip=0.06, ridge=0.05, NZ=8, seed=61, ice=dict(every=0.2, len=(0.05, 0.16)), cushion=0.02, nrows=4)
    # the karahafu entrance porch on two posts out past the main eave, the onsen plaque under its bell, a stone step
    ky, PD = y0 + 1.6, 1.3; pz = d / 2 + PD - 0.12
    for s in (-1, 1):
        add(beam(0.14, ky, 0.14, (s * 0.98, ky / 2, pz), c=0.022), wood(T['timber'], ao_z=0.0), 'porch')
        add(cyl(0.14, 0.16, 0.14, (s * 0.98, 0.07, pz), K=8), stone_col(STONES[2]), 'porch')
        add(beam(0.1, 0.1, PD, (s * 0.98, ky - 0.1, d / 2 + PD / 2), c=0.016), wood(T['timber']), 'porch')
    add(beam(2.2, 0.14, 0.14, (0, ky - 0.07, pz), c=0.022), wood(T['timber']), 'porch')
    add(beam(1.84, 0.34, 0.05, (0, ky + 0.17, pz), c=0.012), wood(T['timberMid']), 'porch')
    add(beam(2.1, 0.12, PD - 0.1, (0, 0.06, d / 2 + PD / 2 - 0.05), c=0.03), stone_col(T['stoneLight'], 3), 'porch')
    with at((0, 0, d / 2)): karahafu(2.3, PD, ky + 0.03, 0.46, 0.11, 0.1, seed=13)
    with at((0, ky + 0.19, pz + 0.07)):
        sign_board(0.5, 0.4); onsen_mark(0.36, (0, -0.02, 0.03), depth=0.016, K=4)
    with on_face(blk, 'l', d / 2 - 0.5, y0 + 1.0):
        with at((0, 0, 0.03)):
            sign_board(0.46, 0.4); onsen_mark(0.32, (0, -0.02, 0.03), depth=0.016, K=4)
            snow_slab(0, 0.21, 0.0, 0.52, 0.1, 0.04, 7, spacing=0.8)
    # the boiler's chimney behind the back-left corner, the boiler shed, its firewood
    cx, cz = -w / 2 + 0.2, -d / 2 - 0.42
    brick_chimney(cx, cz, 5.6, rings=8)
    with at((cx + 0.6, 0, cz + 0.05)):
        add(beam(1.2, 1.15, 0.7, (0, 0.575, 0), c=0.03), wood(T['timberMid'], ao_z=0.0), 'shed')
        for i in range(1, 6): add(box(0.02, 1.1, 0.72, (-0.6 + i * 0.2, 0.57, 0), r=0.0), flat(T['timber']), 'shed')
        add(beam(1.4, 0.06, 0.95, (0, 1.27, -0.05), c=0.02, rx=-0.3), paint('#4a4a56', top=0.2), 'shed')
        add(sbox(1.42, 0.1, 0.92, (0, 1.35, -0.05), r=0.045, rx=-0.3), SNOW, 'shed')
        add(box(0.2, 0.2, 0.02, (0.35, 0.35, -0.36), r=0.0), lambda p, n: '#ff8a3a', 'shed', glow='hot')
    with at((cx - 0.62, 0, cz + 0.75), ry=PI / 2):
        firewood(0.9, 0.6, 0.32, seed=6, r=0.07, gap=0.15); snow_slab(0, 0.72, 0.02, 1.06, 0.48, 0.06, 5)
    # the outdoor bath's bamboo screen down the right side; stepping stones out to it
    with at((w / 2 + 0.55, 0, -d / 2 + 0.35)):
        bamboo_screen(d + 0.1, cap_spacing=0.8); bank(0, d + 0.1, 0.2, r=0.44, seed=21)
    rng = random.Random(61)
    for i in range(4):
        pillow((w / 2 + 0.25 + i * 0.32, 0.04, -d / 2 + 0.1 - i * 0.28), 0.24, 0.3, 61 + i, 1.3, 1.0, K=9, tag='stones', fine=False,
               col=lambda p, n: mix(T['stoneLight'], '#eef3fc', clamp(n.z * 1.4 - 0.5)))
    bank(-w / 2 + 0.6, w / 2, -d / 2 - 0.12, r=0.58, seed=27)
    with at((-w / 2 - 0.12, 0, 0), ry=PI / 2): bank(-d / 2 + 0.2, d / 2, 0, r=0.52, seed=29)
    F.pop()
    # the forecourt: an oke bucket stack by the door, the egg basin
    with at((-2.15, 0, Fz + 0.65), ry=0.2):
        for i in range(3):
            with at((0, i * 0.12, 0), ry=i * 0.4): bucket_oke(0.13 - i * 0.012, 0.16, hoops=(0.7,), K=9)
        pillow((0, 0.42, 0), 0.11, 0.5, 6, tag='buckets', fine=False)
    with at((2.25, 0, Fz + 0.75), ry=-0.4): egg_basin()
    # ---- siege
    with layer('siege'):
        with at((0, y0 + 0.72, Fz)): boards(1.35, 1.42, seed=3)
        for s in (-1, 1):
            with at((s * 1.6, y0 + 0.78, Fz + 0.04)): boards(0.78, 0.64, seed=4 + s)
        with at((-1.25, y0, Fz + 0.004)): soot(0.7, 1.4, seed=9)
        for i, (y, a) in enumerate(((0.55, 0.12), (0.95, -0.1), (1.3, 0.06))):
            with at((0, y, zc + pz + 0.1)):
                plank(2.15, 0.13, 0.04, BOARD[i], 0, 0, 0, a)
                for s in (-1, 1): nail(s * 0.98, s * a * 0.98, 0.03)
        with at((0.3, 0.06, Fz + 1.6), ry=0.8, rx=PI / 2): bucket_oke(0.13, 0.16)
        with at((-0.7, 0.06, Fz + 1.9), ry=-0.4, rx=PI / 2): bucket_oke(0.12, 0.15)
        with at((1.5, 0, Fz + 1.6)): debris(0.8, seed=41, n=4)
        with at((-1.9, 0, Fz + 1.3)): war_banner(2.6, 0.55, seed=43)
    # ---- saved: the two big noren across the porch (indigo for the men's bath, crimson for the women's), the onsen mark
    with layer('saved'):
        for s in (-1, 1):
            with at((s * 0.47, 0, zc + pz + 0.02)): noren_sign(0.86, 0.78, ky - 0.15, 0.1, T['indigo'] if s < 0 else T['crimson'], 2, 'onsen', 0.5)
        with at((1.45, 0, Fz + 0.85), ry=-0.3): towel_rack()
        with at((-1.3, 0, Fz + 0.8), ry=0.25):
            crate(0.36, '#c8a070', tag='milk', seed=5)
            for i in range(6):
                x, z = -0.1 + (i % 3) * 0.1, (i // 3 - 0.5) * 0.12
                add(cyl(0.035, 0.04, 0.16, (x, 0.39, z), K=6), soft('#fff8ee' if i % 2 else '#f0e0c8', 0.25), 'milk')
                add(cyl(0.037, 0.037, 0.025, (x, 0.48, z), K=6), flat('#e8503a'), 'milk')
        with at((0.95, ky, Fz + 1.0)):
            add(box(0.015, 0.12, 0.015, (0, -0.06, 0), r=0.0), flat(T['iron']), 'sign')
            with at((0, -0.28, 0)):
                sign_board(0.24, 0.3, '#f4ead4', T['timber']); onsen_mark(0.2, (0, -0.02, 0.03), depth=0.012, col=T['crimson'])
    return A, dict(fp=[-w / 2 - 0.15, zc - d / 2 - 0.7, w / 2 + 0.65, Fz + PD], door=[0, Fz + PD + 0.45],
                   lamps=[[-0.68, round(ky - 0.15, 3), round(zc + pz + 0.02, 3)], [0.68, round(ky - 0.15, 3), round(zc + pz + 0.02, 3)]],
                   vent_y=round(vy + 0.3, 3), chimney_top=5.6)

# ================================================================== Tetsu's Snow Forge (artOnsen smith)
def build_smith():
    new_asset('zv-onsen-smith')
    w, d, h, y0, zc = 3.5, 2.5, 1.75, 0.14, -0.15
    Fz = zc + d / 2
    F.push((0, 0, zc))
    # a flagstone floor, a rough stone back wall, half-height plank sides, heavy posts
    add(beam(w + 0.2, y0 + 0.3, d + 0.2, (0, (y0 - 0.3) / 2, 0), c=0.04), stone_col(T['stoneDark'], 2, ao=False), 'floor')
    rng = random.Random(71)
    for j in range(4):
        for i in range(5):
            if rng.random() < 0.25: continue
            x = -w / 2 + 0.35 + i * (w - 0.7) / 4 + rng.uniform(-0.08, 0.08); z = -d / 2 + 0.6 + j * (d - 0.8) / 3 + rng.uniform(-0.08, 0.08)
            add(sbox(rng.uniform(0.42, 0.6), 0.03, rng.uniform(0.32, 0.45), (x, y0 + 0.005, z), r=0.012, ry=rng.uniform(-0.2, 0.2)), stone_col(rng.choice(ONSEN_STONES), i + j), 'floor')
    add(box(w, h, 0.26, (0, y0 + h / 2, -d / 2 + 0.17), r=0.03), flat(mul(T['stoneDark'], 0.8)), 'stonewall')
    rows = 5; rh = h / rows
    for j in range(rows):
        x = -w / 2 + (0.0 if j % 2 else 0.28); k = 0
        while x < w / 2 - 0.05:
            bw = min(rng.uniform(0.5, 0.72), w / 2 - x)
            if bw > 0.12:
                add(sbox(bw - 0.035, rh - 0.035, 0.14, (x + bw / 2, y0 + rh * (j + 0.5), -d / 2 + 0.3), r=0.04), stone_col(ONSEN_STONES[(j * 3 + k) % 6], j * 7 + k), 'stonewall')
            x += bw; k += 1
    for s in (-1, 1):
        add(beam(0.08, 0.9, d - 0.3, (s * (w / 2 - 0.04), y0 + 0.45, 0.1), c=0.015), wood(T['timberMid'], ao_z=y0), 'walls')
        for i in range(1, 6): add(box(0.09, 0.014, d - 0.32, (s * (w / 2 - 0.04), y0 + i * 0.15, 0.1), r=0.0), flat(T['timber']), 'walls')
    for x, z in ((-w / 2, d / 2), (w / 2, d / 2), (-w / 2, -d / 2 + 0.3), (w / 2, -d / 2 + 0.3), (-0.6, d / 2), (0.6, d / 2)):
        add(beam(0.15, h + 0.12, 0.15, (x, y0 + (h + 0.12) / 2, z), c=0.025), wood(T['timber'], ao_z=y0), 'posts')
    add(beam(w + 0.2, 0.18, 0.16, (0, y0 + h + 0.06, d / 2), c=0.025), wood(T['timber']), 'posts')
    add(beam(w + 0.2, 0.16, 0.16, (0, y0 + h + 0.06, -d / 2 + 0.3), c=0.025), wood(T['timber']), 'posts')
    # the slate gable (ridge front to back) under snow
    cv = 0.18; gO = 0.42
    R = slate_roof('gable', w + 0.1, d + 0.05, y0 + h + 0.14, 0.42, 1.25, cv, ridge='z', gOver=gO, tile='#4e4a52', pal=dict(color='#4e4a52', hi='#6a6670', edge='#2e2c34'), seed=73)
    ys = roof_surf(R, cv)
    ll = snow_sheet((d + 0.05) / 2 + gO + 0.02, lambda t: R['Bz'] * (1 - t), ys, th=0.15, lip=0.09, droop=0.05, endLip=0.07, ridge=0.06, NZ=22,
                    seed=75, cushion=0.08, tperiod=0.34, zperiod=1.0)
    sheet_icicles(ll, 0.16, (0.07, 0.3), 75)
    with at((0, ys(1.0) + 0.15 + 0.06 - 0.05, 0), ry=PI / 2): onigawara((d + 0.05) / 2 + gO + 0.05, 0.0, clamp(R['Bz'] / 1.4, 0.55, 1.1), seed=13)
    # the front gable: a slatted smoke vent
    with at((0, y0 + h + 0.14, d / 2 + 0.05)):
        for i in range(7): add(box(0.035, 0.42, 0.03, (-0.3 + i * 0.1, 0.62, 0.02), r=0.0), flat('#2a2020'), 'vent')
        for yy in (0.86, 0.39): add(beam(0.74, 0.06, 0.05, (0, yy, 0.03), c=0.01), wood(T['timber']), 'vent')
    # the hearth (back left): a stone forge with a dark mouth, its hood and the chimney up through the roof
    hx, hz = -0.85, 0.55
    with at((hx, y0, hz)):
        add(beam(1.05, 0.82, 0.85, (0, 0.41, 0), c=0.06), stone_col(T['stoneDark'], 4), 'hearth')
        mouth = [(-0.24, 0.0)] + [(math.cos(PI - PI * q / 8) * 0.24, 0.16 + math.sin(PI - PI * q / 8) * 0.24) for q in range(9)] + [(0.24, 0.0)]
        with at((0, 0.36, 0.43)): add(prism(mouth, 0.012, 0.0), flat('#1a1416'), 'hearth')
        add(beam(1.12, 0.08, 0.92, (0, 0.84, 0), c=0.03), stone_col(T['stone'], 5), 'hearth')
        add(box(0.7, 0.06, 0.5, (0, 0.87, -0.05), r=0.02), flat('#2a2424'), 'hearth')
        add(glathe([(0.0, 0.0), (0.5, 0.0), (0.26, 0.5), (0.0, 0.5)], 4, pos=(0, 0.9, -0.1)), paint('#4a4a52', top=0.2), 'hearth')
        def chcol(p, n, z0=F.W((0, 0, 0)).z):
            y = p.z - z0; c = mul(T['stone'], 0.88 + 0.12 * (int(y / 0.2) % 2) + 0.06 * vnoise(p, 6, 2))
            return mix(c, '#2e2a2e', smooth(3.3, 3.9, y) * 0.6)
        add(rbox((0.46, 0.46, 2.5), r=0.04, extra=(0, 0, 10), M=F.m @ lm((0, 2.65, -0.1))), chcol, 'hearth')
        add(beam(0.58, 0.08, 0.58, (0, 3.92, -0.1), c=0.03), stone_col(T['stoneDark'], 6), 'hearth')
        pillow((0.1, 3.98, -0.05), 0.13, 0.5, 21, tag='hearth', fine=False)
        with at((0.85, 0, 0.1)):                                # the box bellows with its push handle
            add(beam(0.32, 0.36, 0.7, (0, 0.2, 0), c=0.03), wood(T['wood']), 'bellows')
            for zz in (-0.36, 0.36): add(box(0.34, 0.38, 0.03, (0, 0.2, zz), r=0.0), wood(T['timber']), 'bellows')
            add(cyl(0.02, 0.02, 0.4, (0, 0.26, 0.55), K=5, rx=PI / 2), wood(T['woodLight']), 'bellows')
            add(cyl(0.026, 0.026, 0.3, (0, 0.26, 0.75), K=5, rz=PI / 2), wood(T['woodLight']), 'bellows')
    with at((0.9, y0 + 1.35, -d / 2 + 0.38)): tool_rack(1.1)
    with at((1.05, y0, 0.1)):
        barrel(0.24, 0.34, '#7a5a42'); water_disc(0.19, (0, 0.335, 0))
    bank(-w / 2, w / 2, zc - d / 2 - 0.15, r=0.34, seed=33)
    for s in (-1, 1):
        with at((s * (w / 2 + 0.15), 0, zc), ry=PI / 2): bank(-d / 2, d / 2 - 0.4, 0, r=0.3, seed=35 + s)
    F.pop()
    # out front: the anvil on its stump, the snow-ore crate glowing blue-white, a grindstone, the hammer sign
    with at((0.25, 0, Fz + 0.5), ry=-0.2): anvil_stump()
    with at((-1.3, 0, Fz + 0.45), ry=0.25):
        add(beam(0.7, 0.28, 0.5, (0, 0.14, 0), c=0.03), wood(T['wood'], ao_z=0.0), 'orecrate')
        for s in (-1, 1): add(box(0.72, 0.04, 0.02, (0, 0.2, s * 0.25), r=0.0), flat(T['timber']), 'orecrate')
        with at((0, 0.24, 0)): ore_cluster(11, 0.26, 3)
        pillow((0.28, 0.3, -0.18), 0.1, 0.5, 2, tag='orecrate', fine=False)
    with at((w / 2 + 0.4, 0, 0.25), ry=PI / 2):
        for s in (-1, 1): add(box(0.06, 0.62, 0.06, (s * 0.18, 0.31, 0), r=0.0), wood(T['timber'], ao_z=0.0), 'grind')
        add(cyl(0.3, 0.3, 0.12, (0, 0.62, 0), K=16, rz=PI / 2, bev=0.02), lambda p, n: '#a8a4a0' if abs(n.x) > 0.7 else '#8a8680', 'grind')
        add(beam(0.5, 0.12, 0.3, (0, 0.32, 0), c=0.02), wood(T['wood']), 'grind')
        pillow((0, 0.74, 0), 0.12, 0.4, 5, tag='grind', fine=False)
    with at((w / 2 + 0.02, 1.62, Fz - 0.05), ry=PI / 2):            # the hanging sign: an iron arm, a board with the hammer
        add(box(0.04, 0.04, 0.46, (0, 0, 0.22), r=0.0), soft(T['iron'], 0.3), 'sign')
        with at((0, -0.28, 0.38), ry=PI / 2):
            sign_board(0.38, 0.34, '#e8dcc4', T['timber'])
            for zz, r_ in ((0.03, 0.0), (-0.03, PI)):
                with at((0, 0, zz), ry=r_): hammer_mark(0.5, (0, -0.02, 0.0), 'sign')
            for s in (-1, 1): add(box(0.015, 0.1, 0.015, (s * 0.14, 0.22, 0), r=0.0), flat(T['ink']), 'sign')
            snow_slab(0, 0.18, 0, 0.42, 0.09, 0.04, 9)
    # ---- siege
    with layer('siege'):
        with at((0, 0, Fz + 0.6)): debris(1.1, seed=51, n=7)
        with at((-1.5, 0.2, Fz + 1.0), ry=0.6, rz=1.2): add(beam(0.7, 0.28, 0.5, (0, 0, 0), c=0.03), wood(T['wood']), 'crate')
        for i in range(3):
            with at((-0.8 + i * 0.6, 0.03, Fz + 1.3 + (i % 2) * 0.3), ry=i * 1.3):
                add(box(0.05, 0.03, 0.4, (0, 0, 0), r=0.0), soft(T['iron'], 0.3), 'tools')
                add(box(0.1, 0.05, 0.06, (0, 0, 0.2), r=0.0), soft('#5a5664', 0.3), 'tools')
        with at((w / 2 + 0.3, 0, Fz + 0.3)): war_banner(2.4, 0.5, seed=52)
        with at((-0.8, y0 + 1.3, zc - d / 2 + 0.39)): soot(0.9, 0.9, wall=T['stone'], seed=5)
    # ---- saved: the hearth glowing, a rack of finished blades, fresh ore heaped high, a grey nobori
    with layer('saved'):
        with at((hx, y0, zc + hz)):
            mouth = [(-0.2, 0.0)] + [(math.cos(PI - PI * q / 8) * 0.2, 0.15 + math.sin(PI - PI * q / 8) * 0.2) for q in range(9)] + [(0.2, 0.0)]
            with at((0, 0.38, 0.445)): add(prism(mouth, 0.012, 0.0), lambda p, n: '#ff8a3a', 'forge', glow='hot')
            add(blob(F.W((0, 0.88, -0.05)), 0.3, 0.07, lobes=6, K=12, seed=3, amp=0.1), lambda p, n: mix('#ff5a1a', '#ffb050', clamp(n.z)), 'forge', glow='hot')
        with at((-0.15, 0, Fz + 0.2)):
            for s in (-1, 1): add(box(0.05, 0.9, 0.05, (s * 0.35, 0.45, 0), r=0.0), wood(T['timber'], ao_z=0.0), 'blades')
            add(box(0.8, 0.045, 0.055, (0, 0.86, 0), r=0.0), wood(T['timber']), 'blades')
            for i in range(4):
                add(box(0.035, 0.72, 0.014, (-0.24 + i * 0.16, 0.48, 0.03), r=0.0), lac('#d8dce8', hi='#ffffff'), 'blades')
                add(box(0.045, 0.16, 0.032, (-0.24 + i * 0.16, 0.86, 0.03), r=0.0), flat('#2a2630'), 'blades')
        with at((-1.3, 0.24, Fz + 0.45), ry=0.25): ore_cluster(9, 0.2, 9)
        with at((1.7, 0, Fz + 0.95)): nobori_star(2.3, 0.4, '#4a4a5a')
    return A, dict(fp=[-w / 2 - 0.12, zc - d / 2 - 0.12, w / 2 + 0.75, Fz + 0.78], door=[0.15, Fz + 1.3],
                   lamps=[[-1.25, y0 + h - 0.02, Fz + 0.12], [1.25, y0 + h - 0.02, Fz + 0.12]])

# ================================================================== the village gate (artOnsen gate, at the game's w = 3.6) and the lamp post
def build_gate():
    new_asset('zv-onsen-gate')
    w, h = 3.6, 2.45
    for s in (-1, 1):
        add(cyl(0.22, 0.26, 0.24, (s * w / 2, 0.12, 0), K=10, bev=0.03), stone_col(T['stone'], 3 + s), 'gate')
        add(beam(0.2, h, 0.2, (s * w / 2, h / 2, 0), c=0.035), wood(T['timber'], ao_z=0.0), 'gate')
        for kq in (-1, 1): add(beam(0.08, 0.95, 0.08, (s * w / 2, 0.45, kq * 0.2), c=0.014, rx=kq * 0.42), wood(T['timber']), 'gate')
        pillow((s * w / 2, 0.03, 0.15), 0.42, 0.38, 3 + s, 1.0, 1.3, K=11, J=4, tag='gate', fine=False)
        add(sbox(0.08, 0.05, 0.08, (s * w / 2, h - 0.62 + 0.09, 0.0), r=0.02), wood(T['timberMid']), 'gate')   # (the wedge through the nuki)
    add(beam(w + 0.5, 0.13, 0.12, (0, h - 0.62, 0), c=0.022), wood(T['timber']), 'gate')
    snow_slab(0, h - 0.555, 0, w + 0.48, 0.12, 0.04, 5, spacing=0.9)
    add(beam(w + 0.7, 0.2, 0.2, (0, h - 0.1, 0), c=0.035), wood(T['timber']), 'gate')
    # a little slate gable cap on the beam, under snow with icicles both sides
    R = slate_roof('gable', w + 0.2, 0.36, h + 0.04, 0.2, 0.34, 0.2, gOver=0.12, ribW=0.42, seed=3)
    top = snow_gable_x(R, w + 0.2, 0.12, 0.2, th=0.12, lip=0.07, ridge=0.06, NZ=10, seed=7, ice=dict(every=0.26, len=(0.06, 0.26)), cushion=0.03, zperiod=0.9, nrows=4)
    onigawara(w / 2 + 0.1 + 0.12 + 0.05, top - 0.06, 0.55, seed=3)
    # the sign: a dark board, a snow crystal, the onsen mark and the camellia crest (emblems, no words)
    with at((0, h - 0.47, 0.15)):
        sign_board(1.0, 0.32)
        snowflake_mark(0.22, (-0.32, 0, 0.03), depth=0.014, col='#eaf2ff')
        onsen_mark(0.25, (0.02, -0.02, 0.03), depth=0.014, K=4)
        camellia_crest(0.21, (0.33, 0, 0.03), K=6)
    with at((0, h - 0.47, -0.15), ry=PI):
        sign_board(1.0, 0.32)
        camellia_crest(0.21, (0, 0, 0.03), K=6)
    return A, dict(w=w, h=h)

def build_lanternPost():
    new_asset('zv-onsen-lanternPost')
    add(beam(0.1, 2.0, 0.1, (0, 1.0, 0), c=0.02), wood(T['timber'], ao_z=0.0), 'post')
    add(cyl(0.14, 0.17, 0.14, (0, 0.07, 0), K=8, bev=0.02), stone_col(T['stone'], 2), 'post')
    add(beam(0.5, 0.07, 0.07, (0.22, 1.9, 0), c=0.014), wood(T['timber']), 'post')
    add(beam(0.05, 0.4, 0.05, (0.12, 1.75, 0), c=0.012, rz=-0.8), wood(T['timber']), 'post')
    add(beam(0.42, 0.05, 0.38, (0.38, 1.99, 0), c=0.015), paint(T['tile'], top=0.25), 'post')
    snow_slab(0.38, 2.01, 0, 0.42, 0.38, 0.06, 7)
    for q in range(3): icicle(0.2 + q * 0.13, 1.97, 0.2, 0.08 + 0.05 * (q % 2))
    pillow((0, 2.02, 0), 0.08, 0.6, 2, tag='post', fine=False)
    pillow((0, 0.03, 0), 0.26, 0.38, 5, tag='post')
    add(gtube([(0.42, 1.9, 0), (0.42, 1.86, 0.0), (0.44, 1.84, 0.0)], 0.012, K=4), soft(T['iron'], 0.3), 'post')   # the lamp hook
    return A, dict(hook=[0.42, 1.84, 0])

# ================================================================== finishing and export
def finish(A, seed=5, amt=0.03):
    """the kit's hand-made warp (gentle leans and sags, identical for every object), then ground AO on the colours"""
    a = (seed % 97) * 1.37 + 0.7
    for o in A.objs.values():
        V = o['v']
        for i, p in enumerate(V):
            x, y, z = p.x, -p.y, p.z
            hh = max(0.0, z); kk = amt * (0.35 + hh * 0.28)
            dx = (math.sin(z * 0.9 + a) * 0.6 + math.sin(y * 1.3 + a * 2.1) * 0.4) * kk
            dz = (math.sin(z * 1.1 + a * 1.7) * 0.6 + math.sin(x * 1.2 + a * 0.6) * 0.4) * kk
            dy = math.sin(x * 0.9 + a) * math.sin(y * 1.1 + a * 1.3) * amt * 0.9 * clamp(z / 0.4)
            V[i] = Vector((p.x + dx, p.y - dz, p.z + dy))
        for i, (p, c) in enumerate(zip(V, o['c'])):
            kk = (0.8 + 0.2 * smooth(-0.02, 0.45, p.z)) ** 2.2
            o['c'][i] = (c[0] * kk, c[1] * kk, c[2] * kk, 1.0)

def vc_mat(name, emission=None, strength=1.0):
    mt = bpy.data.materials.new(name); mt.use_nodes = True; nt = mt.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Roughness'].default_value = 0.8; bsdf.inputs['Metallic'].default_value = 0.0
    vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'; nt.links.new(vc.outputs['Color'], bsdf.inputs['Base Color'])
    if emission:
        bsdf.inputs['Emission Color'].default_value = lin(emission); bsdf.inputs['Emission Strength'].default_value = strength
    return mt

def export_piece(A, name):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mats = {'body': vc_mat('body'), 'window_glow': vc_mat('window_glow', '#ffd890'), 'hot_glow': vc_mat('hot_glow', '#ff8a3a'),
            'ore_glow': vc_mat('ore_glow', '#bfe8ff'), 'water': vc_mat('water')}
    mw = next(n for n in mats['water'].node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); mw.inputs['Roughness'].default_value = 0.25
    obs = [to_object(k, o, mats) for k, o in A.objs.items()]
    lo = Vector((1e9,) * 3); hi = Vector((-1e9,) * 3)
    for k, o in A.objs.items():
        if k in ('saved', 'siege'): continue
        for v in o['v']: lo = Vector(map(min, lo, v)); hi = Vector(map(max, hi, v))
    print('ZV %s tris %d %s' % (name, A.tris(), {k: A.tris(k) for k in A.objs}))
    print('ZV %s parts %s' % (name, dict(sorted(A.count.items(), key=lambda kv: -kv[1]))))
    print('ZV %s bounds blender x %.3f..%.3f y %.3f..%.3f z %.3f..%.3f | game z %.3f..%.3f' % (name, lo.x, hi.x, lo.y, hi.y, lo.z, hi.z, -hi.y, -lo.y))
    for ob in obs: print('ZV %s check %s %s' % (name, ob.name, check(ob)))
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, name + '.blend'))
    for o in bpy.context.scene.objects: o.select_set(o.type == 'MESH')
    out = os.path.join(MODELS, name + '.glb')
    kw = dict(filepath=out, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
              export_attributes=True, export_lights=False, export_cameras=False, export_animations=False,
              export_normals=True, export_texcoords=False, export_materials='EXPORT')
    try: bpy.ops.export_scene.gltf(export_vertex_color='ACTIVE', **kw)
    except TypeError as e:
        print('ZV export_vertex_color rejected:', e); bpy.ops.export_scene.gltf(export_colors=True, **kw)
    print('ZV wrote', out)

PIECES = {'elder': build_elder, 'shop': build_shop, 'inn': build_inn, 'bathhouse': build_bathhouse, 'smith': build_smith,
          'gate': build_gate, 'lanternPost': build_lanternPost}
for name in (list(PIECES) if PIECE == 'all' else PIECE.split(',')):
    asset, info = PIECES[name]()
    finish(asset)
    print('ZV %s info %s' % (name, info))
    export_piece(asset, 'zv-onsen-' + name)
