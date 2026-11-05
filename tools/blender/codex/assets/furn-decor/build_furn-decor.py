# PAWHAVEN: the housing catalog's decor pieces (task furn-decor), built in Blender by script.
#   blender --background --factory-startup --python build_furn-decor.py -- --piece <id|all|id,id,...>
# writes D:/projects/chewy-life-3d/public/models/furn-<id>.glb (and furn-<id>.blend beside this script).
# Deterministic: seeded maths only (hash noise, fixed tables); a re-run reproduces every GLB exactly.
# Frame (src/home/furnitureMesh.js): 1 unit = 1 m. The layout code is written in the kit's game frame (x right, y up,
# z = the item's front) and mapped to Blender (x, -z, y). Floor items: z = 0 at the base, centred on the footprint.
# Ceiling items (the Hanging Planter): the cord's top at z = h, the basket down to z = 0.
# The core mesh kit (mesh accumulator with painted per-vertex colours `Col`, rounded boxes, lathes, tubes, puffy relief
# slabs, faceted shells) is the furn-small one (itself from the Hollow landmarks / Guild), copied in unchanged; the
# decor additions (two-sided leaf strips and fronds, flat ribbons, bars, lumpy balls) follow it.
# Materials by name choose the game's bucket: body, leaf, cloth, glow, water, hot. Every vertex carries a UV of
# (0, 0) (glTF uv.y = 1): for cloth that is the cloth wind's "attached" edge, so nothing sways; glow reads it as
# "tinted, no flicker". Hot parts (the irori's fire) carry (1, 0): flickering, tinted by their colours.
import bpy, bmesh, math, os, sys
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..', '..'))
MODELS = os.path.join(REPO, 'public', 'models')
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
PIECE = argv[argv.index('--piece') + 1] if '--piece' in argv else 'all'
print('FD build pid', os.getpid())
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


# ================================================================== furn-decor helpers
class atM:
    """push an arbitrary game-frame matrix onto the frame stack"""
    def __init__(self, M): self.M = M
    def __enter__(self): F.st.append(F.m.copy()); F.m = F.m @ (GM @ self.M @ GMi); return F
    def __exit__(self, *e): F.m = F.st.pop()

def local_of():
    """a function mapping a Blender world point to the current frame's game-local coordinates"""
    Mi = F.m.inverted()
    def f(p):
        q = Mi @ p; return Vector((q.x, q.z, -q.y))
    return f

def bar(a, b, w, d, c=0.012, roll=0.0):
    """a planed timber (chamfered beam) from game point a to b, cross-section w (local x) by d (local z)"""
    a = Vector(a); b = Vector(b); v = b - a; L = v.length
    q = Vector((0, 1, 0)).rotation_difference(v.normalized())
    M = Matrix.Translation((a + b) / 2) @ q.to_matrix().to_4x4() @ Matrix.Rotation(roll, 4, 'Y')
    with atM(M): return beam(w, L, d, c=c)

def rbar(a, b, w, d, r=0.012, roll=0.0):
    """a rounded box from a to b"""
    a = Vector(a); b = Vector(b); v = b - a; L = v.length
    q = Vector((0, 1, 0)).rotation_difference(v.normalized())
    M = Matrix.Translation((a + b) / 2) @ q.to_matrix().to_4x4() @ Matrix.Rotation(roll, 4, 'Y')
    with atM(M): return rb(w, L, d, r=r)

def gpipe(a, b, r0, r1=None, K=6, caps=True):
    """a straight round rod from a to b (game), radius r0 -> r1"""
    r1 = r0 if r1 is None else r1
    return gtube([a, tuple((Vector(a) + Vector(b)) / 2), b], lambda s: r0 + (r1 - r0) * s, K=K, caps=caps)

def leaf_strip(P, wfn, th=0.005, serr=0.0, side=None, curl=0.0, cfn=None, fwd=0.35, up=None):
    """a chunky two-sided leaf / frond along P (Blender world Vectors, base -> tip): the outline wfn(s) either side, a
    raised midrib on the front and a flatter back, the tip a point. serr > 0: alternate stations notch in to serr * w
    (leaflets), the leaflet tips pushed forward by fwd * w. side: the leaf's left (world vector; per station callable);
    curl lifts the edges toward the front (a folded leaf). cfn(s, edge) -> each vertex's base colour (t.c)."""
    n = len(P); Fr = frames(P, up or Z)
    t = Tmp(); t.c = []
    def V(p, s, edge):
        t.c.append(srgb(cfn(s, edge)) if cfn else (0.4, 0.7, 0.3)); return t.vert(p)
    L, R, Mf, Mb, Us = [], [], [], [], []
    for i in range(n - 1):
        s = i / (n - 1); T = Fr[i][0]; p = P[i]
        if side is not None:
            sd = side(i) if callable(side) else side
            W = (sd - T * sd.dot(T)).normalized(); U = T.cross(W)
        else:
            W, U = Fr[i][1], Fr[i][2]
        w = wfn(s)
        if serr and i > 0:
            tipq = (i % 2 == 1)
            w2 = w if tipq else w * serr
            q = p + T * (fwd * w if tipq else 0.0)
        else:
            w2 = w; q = p
        L.append(V(q + W * w2 + U * (curl * w2), s, 1)); R.append(V(q - W * w2 + U * (curl * w2), s, 1))
        Mf.append(V(p + U * th, s, 0)); Mb.append(V(p - U * (th * 0.6), s, 0)); Us.append(U)
    tip = V(P[-1], 1.0, 1)
    for i in range(n - 2):
        U = Us[i]
        t.face([Mf[i], Mf[i + 1], L[i + 1], L[i]], U); t.face([Mf[i], R[i], R[i + 1], Mf[i + 1]], U)
        t.face([Mb[i], L[i], L[i + 1], Mb[i + 1]], -U); t.face([Mb[i], Mb[i + 1], R[i + 1], R[i]], -U)
    k = n - 2; U = Us[k]
    t.face([Mf[k], tip, L[k]], U); t.face([Mf[k], R[k], tip], U); t.face([Mb[k], L[k], tip], -U); t.face([Mb[k], tip, R[k]], -U)
    T0 = Fr[0][0]
    t.face([Mf[0], L[0], Mb[0]], -T0); t.face([Mf[0], Mb[0], R[0]], -T0)
    return t

def arc_path(base, az, el0, el1, L, n=8, bend=None):
    """a game-frame path from base: heading az (0 = the front, +z), elevation el0 -> el1 (radians above level)"""
    pts = []; p = Vector(base); ds = L / (n - 1)
    for i in range(n):
        pts.append(F.W(tuple(p)))
        u = i / (n - 1); el = el0 + (el1 - el0) * (u if bend is None else bend(u))
        d = Vector((math.sin(az) * math.cos(el), math.sin(el), math.cos(az) * math.cos(el)))
        p = p + d * ds
    return pts

def left_of(az):
    """the leaf's left for a heading az (game), as a Blender world vector"""
    return F.N((math.cos(az), 0.0, -math.sin(az)))

def ribbon2d(pts, wfn, depth=0.004, z0=0.0, n=None):
    """a flat relief stroke in the face frame (x right, y up, z out): a path of (x, y), half-width wfn(s) (or a
    number), raised depth above z0 with rounded shoulders; pointed / rounded ends"""
    P = [Vector((p[0], p[1], 0.0)) for p in (catmull(pts, n) if n else pts)]
    m = len(P); t = Tmp(); rings, cs = [], []
    for i in range(m):
        a = P[max(i - 1, 0)]; b = P[min(i + 1, m - 1)]; T = (b - a).normalized(); N = Vector((-T.y, T.x, 0.0))
        w = wfn(i / (m - 1)) if callable(wfn) else wfn
        c = P[i]; zz = Vector((0, 0, 1))
        ring = [c + N * w + zz * z0, c + N * (w * 0.8) + zz * (z0 + depth * 0.8), c + zz * (z0 + depth), c - N * (w * 0.8) + zz * (z0 + depth * 0.8), c - N * w + zz * z0]
        rings.append([F.W(tuple(q)) for q in ring]); cs.append(F.W((c.x, c.y, z0 + depth * 0.35)))
    T0 = (P[1] - P[0]).normalized(); T1 = (P[-1] - P[-2]).normalized()
    w0 = wfn(0.0) if callable(wfn) else wfn; w1 = wfn(1.0) if callable(wfn) else wfn
    p0 = P[0] - T0 * (w0 * 0.7); p1 = P[-1] + T1 * (w1 * 0.7)
    ring_surface(t, rings, cs, pole0=F.W((p0.x, p0.y, z0 + depth * 0.4)), pole1=F.W((p1.x, p1.y, z0 + depth * 0.4)))
    return t

def lumpy(r, pos, amp=0.14, seed=0, K=9, J=6, sc=(1, 1, 1), f=7.0):
    """a soft lumpy ball (a pom-pom, a pebble, a moss tuft): an ellipsoid with hash-noise radius"""
    t = ellipsoid(Vector((0, 0, 0)), (r * sc[0], r * sc[2], r * sc[1]), K=K, J=J)
    t.v = [v * (1 + amp * (vnoise(v / max(r, 1e-6), f * 0.25, seed) - 0.5) * 2) for v in t.v]
    t.n = [None] * len(t.v)
    return t.xform(F.m @ lm(pos))

def clay_pot(pos, r, h, c, band='#fff1de', dot_c=None, K=8, soil='#6a4a3a', s=1.0):
    """a little terracotta flowerpot (faceted: a painted band under the rolled rim, dots), soil at the top; returns the
    soil height (game-local to pos)"""
    with at(pos, s=s):
        rb_ = r * 0.72
        prof = [(0.0, 0.0), (rb_, 0.0), (rb_ * 1.04, 0.01), (r * 0.94, h * 0.72), (r * 1.06, h * 0.76), (r * 1.08, h * 0.97), (r * 1.0, h), (r * 0.9, h * 0.94), (0.0, h * 0.94)]
        th0 = PI / K
        def pc(cen, fn):
            rr = math.hypot(cen.x, cen.y)
            if cen.z > h * 0.93 and rr < r * 0.9 and fn.z > 0.5: return soil
            if cen.z > h * 0.74: return band
            if dot_c and h * 0.3 < cen.z < h * 0.55 and angle_k(cen, K, th0) % 3 == 0: return dot_c
            return c
        t = facet(lathe(prof, K, th0=th0), pc); t.xform(F.m @ lm((0, 0, 0)))
        add(t, fsh(0.16, 0.3, sheen=0.22), 'pots')
    return h * 0.94 * s

def stone(base, hi=None, nz=0.06, seed=0, f=14.0):
    """painted stone: lighter tops, darker undersides, a speckle of low-frequency variation"""
    hi = hi or mix(base, '#fff8f0', 0.35)
    def col(p, n):
        c = mix(base, hi, clamp(n.z * 0.6 + 0.15) * 0.7)
        if n.z < 0: c = mix(c, mul(base, 0.7), -n.z * 0.6)
        return mul(c, 1 + nz * (vnoise(p, f, seed) - 0.5) * 2)
    return col

def fuzz(base, k=0.08, f=60.0, seed=3, top=0.12, bot=0.28):
    """carpet / plush: a fine hash speckle over soft shading"""
    def col(p, n):
        c = mul(base, 1 + top * n.z) if n.z >= 0 else mul(base, 1 + bot * n.z)
        return mul(c, 1 + k * (vnoise(p, f, seed) - 0.5) * 2)
    return col

def GW(x, y, z): return F.W((x, y, z))

def onto_lathe(t, rfun, th0=0.0, rref=None, lift=0.002, pos=(0, 0, 0), ry=0.0):
    """wrap a shell built flat in the face frame (x across, y up, z out, with F = identity) onto a lathe surface of
    radius rfun(y) about the game y axis: x becomes arc length round it from angle th0 (0 = the front, +z), z the
    height off the surface (plus lift); then placed by the current frame at pos"""
    M = F.m @ lm(pos, ry)
    out = []
    for v in t.v:
        x, y, z = v.x, v.z, -v.y
        R0 = rref or rfun(y)
        th = th0 + x / max(R0, 1e-6); R = rfun(y) + lift + z
        out.append(M @ gl((R * math.sin(th), y, R * math.cos(th))))
    t.v = out; t.n = [None] * len(out)
    return t

class flat_frame:
    """build in the bare face frame (F = identity), e.g. before onto_lathe"""
    def __enter__(self): F.st.append(F.m.copy()); F.m = Matrix.Identity(4); return F
    def __exit__(self, *e): F.m = F.st.pop()

def drips(rfun, y0, n, Lmin, Lmax, w, col, tag='glaze', seed=0, lift=0.0015, depth=0.003, th_off=0.0, pos=(0, 0, 0)):
    """glaze drips running down a lathe from height y0: n rounded tongues of varying length"""
    for k in range(n):
        th = th_off + TAU * k / n + 0.25 * math.sin(k * 3.1 + seed)
        L = Lmin + (Lmax - Lmin) * (0.5 + 0.5 * math.sin(k * 2.3 + seed)) ** 1.5
        ww = w * (0.8 + 0.4 * (0.5 + 0.5 * math.sin(k * 1.7 + seed)))
        with flat_frame():
            t = ribbon2d([(0.0, y0 + 0.004), (0.0, y0 - L * 0.5), (0.0, y0 - L)], lambda s: ww * (1 - 0.35 * s) if s < 0.85 else ww * 0.75, depth, -depth * 0.4, n=6)
        add(onto_lathe(t, rfun, th0=th, lift=lift, pos=pos), col, tag)

def glaze_skirt(rfun, y_top, nd, Lmin, Lmax, wd, col, base_drop=0.008, n_base=24, depth=0.003, lift=0.001, seed=0, tag='glaze', pos=(0, 0, 0), shape=0.35):
    """a glaze run round a lathe: a thin skin from y_top down to a wavy edge with nd rounded drips (lengths Lmin..Lmax,
    half-widths wd radians), its top and bottom edges tucked into the surface so it reads as one poured coat"""
    drl = []
    for k in range(nd):
        th = TAU * k / nd + 0.3 * math.sin(k * 3.1 + seed)
        drl.append((th, Lmin + (Lmax - Lmin) * (0.5 + 0.5 * math.sin(k * 2.3 + seed)) ** 1.5, wd * (0.8 + 0.4 * (0.5 + 0.5 * math.sin(k * 1.7 + seed)))))
    ths = drip_angles(n_base, drl, offs=(-0.95, -0.7, -0.35, 0.0, 0.35, 0.7, 0.95))
    def edge(th):
        e = base_drop + 0.003 * math.sin(th * 5 + seed)
        for th_d, L, w in drl:
            d = math.atan2(math.sin(th - th_d), math.cos(th - th_d)) / w
            if abs(d) < 1: e += L * (1 - d * d) ** shape
        return y_top - e
    M = F.m @ lm(pos)
    def P(th, y, off): R = rfun(y) + off; return M @ gl((R * math.sin(th), y, R * math.cos(th)))
    t = Tmp(); cols = []
    for th in ths:
        ye = edge(th)
        rows = [(y_top + 0.004, -0.002), (y_top, lift + depth), (ye + 0.005, lift + depth), (ye + 0.0015, lift + depth * 0.55), (ye - 0.001, -0.002)]
        cols.append([t.vert(P(th, y, o)) for y, o in rows])
    K = len(ths)
    for i in range(K):
        a, b = cols[i], cols[(i + 1) % K]
        for j in range(4):
            q = [a[j], b[j], b[j + 1], a[j + 1]]
            fc = sum((t.v[x] for x in q), Vector()) / 4; c = M @ gl((0, (M.inverted() @ fc).z, 0))
            t.face(q, fc - Vector((c.x, c.y, fc.z)))
    add_open(t, col, tag)

def leaf_card(P, wfn, serr=0.0, side=None, cfn=None, fwd=0.3, gap=0.0015, tag='fronds', shade=None, pattern=None):
    """a light two-sided leaf card along P (Blender world, base -> tip): a front and a back sheet with their own
    vertices and normals (4 tris per station), the outline notched into leaflets when serr > 0; added directly"""
    n = len(P); Fr = frames(P, Z)
    rows = []
    for i in range(n - 1):
        s = i / (n - 1); T = Fr[i][0]; p = P[i]
        sd = side(i) if callable(side) else side
        W = (sd - T * sd.dot(T)).normalized(); U = T.cross(W)
        w = wfn(s)
        e = 1
        if pattern and i > 0:
            wm, fm = pattern[(i - 1) % len(pattern)]; w2 = w * wm; q = p + T * (fm * w); e = 1 if wm > 0.5 else 0
        elif serr and i > 0:
            tipq = (i % 2 == 1); w2 = w if tipq else w * serr; q = p + T * (fwd * w if tipq else 0.0); e = 1 if tipq else 0
        else:
            w2 = w; q = p
        rows.append((q + W * w2, q - W * w2, U, s, W, e))
    for sgn in (1, -1):
        t = Tmp(); t.c = []
        ids = []
        for (l, r, U, s, W, e) in rows:
            o = U * (gap * 0.5 * sgn)
            a = t.vert(l + o, (U * sgn + W * 0.55).normalized()); b = t.vert(r + o, (U * sgn - W * 0.55).normalized())
            c = srgb(cfn(s, e) if cfn else '#5aa84a'); t.c += [c, c]; ids.append((a, b))
        tp = t.vert(P[-1], rows[-1][2] * sgn); t.c.append(srgb(cfn(1.0, 1) if cfn else '#8cd060'))
        for i in range(len(ids) - 1):
            t.face([ids[i][0], ids[i][1], ids[i + 1][1], ids[i + 1][0]], rows[i][2] * sgn)
        t.face([ids[-1][0], ids[-1][1], tp], rows[-1][2] * sgn)
        t.normals = lambda: None          # (the explicit per-vertex normals stand)
        add_open(t, shade or fsh(0.2, 0.32), tag, 'leaf')
# ================================================================== Potted Fern (floor, 0.5 x 0.5, h 0.78)
def build_pottedFern():
    new_asset()
    K = 18; th0 = PI / K
    prof = [(0.0, 0.0), (0.1, 0.0), (0.112, 0.014), (0.146, 0.07), (0.158, 0.115), (0.164, 0.16), (0.164, 0.2), (0.168, 0.214),
            (0.178, 0.234), (0.186, 0.256), (0.176, 0.274), (0.158, 0.266), (0.152, 0.252), (0.0, 0.252)]
    GY = 0.207
    def pc(cen, fn):
        rr = math.hypot(cen.x, cen.y); z = cen.z
        if z < 0.016: return '#d49a6a'
        if z > 0.249 and rr < 0.153 and fn.z > 0.5: return '#5e4232'
        if z > GY: return '#b8ecec' if z < 0.26 else '#dcf8f4'
        return mix('#2a6a96', '#3f9cc0', clamp((z - 0.02) / 0.17))
    t = facet(lathe(prof, K, th0=th0), pc); t.xform(F.m)
    add(t, fsh(0.16, 0.3, sheen=0.4), 'pot')
    rf = prof_r(prof[2:8])
    glaze_skirt(rf, GY + 0.008, 8, 0.012, 0.05, 0.12, n_base=12, col= lambda p, n: mix('#b0e8ea', '#e8fffa', clamp(n.z * 0.5 - n.y * 0.4)), seed=1)
    for k in range(6):
        a = k * 2.4 + 0.3; rr = 0.05 + 0.07 * ((k * 3) % 4) / 3
        add(lumpy(0.022, (math.sin(a) * rr, 0.252, math.cos(a) * rr), sc=(1, 0.45, 1), K=6, J=3, seed=k), soft('#6a4a36', 0.2), 'soil')
    greens = ['#2f7a36', '#3a8a40', '#448f42', '#2c6e34']
    N = 17
    for i in range(N):
        az = i / N * TAU + 0.3 * math.sin(i * 2.7)
        inner = (i % 3 == 0 or i == 7)
        L = (0.55 + 0.03 * math.sin(i * 1.9)) if inner else (0.3 + 0.025 * math.sin(i * 2.3))
        el0, el1 = (1.47, 0.8) if inner else (1.22 + 0.06 * math.sin(i), -0.15 + 0.1 * math.sin(i * 3.1))
        W = 0.052 if inner else 0.058
        base = (math.sin(az) * 0.02, 0.25, math.cos(az) * 0.02)
        P = arc_path(base, az, el0, el1, L, n=29, bend=lambda u: u ** 0.9)
        g0 = greens[i % 4]
        def wf(s, W=W): return 0.0075 if s < 0.08 else W * max(0.16, math.sin(PI * min(1.0, (s - 0.08) / 0.96)) ** 0.5)
        def cf(s, e, g0=g0):
            c = mix(g0, '#8cc860', clamp(s * 0.8) * 0.5)
            return mix(c, '#c4ea96', 0.22) if e else mix(c, '#2a6030', 0.35)
        leaf_card(P, wf, side=left_of(az), cfn=cf, pattern=((0.12, 0.0), (0.8, 0.1), (1.0, 0.3)))
    # two fiddleheads unrolling in the middle
    for (x, z, h, ph) in ((0.025, -0.015, 0.22, 0.4), (-0.035, 0.03, 0.17, 2.6)):
        with at((x, 0.25, z), ry=ph):
            pts = [(0.0, 0.0, 0.0), (0.004, h * 0.55, 0.0)]
            cx, cy = 0.026, h
            for k in range(8):
                a = PI - k * 0.85; rr = 0.026 * (1 - k / 10)
                pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a), 0.0))
            add(gtube(catmull(pts, 10), lambda s: 0.009 - 0.003 * s, K=4), soft('#9ad870', 0.25), 'fiddle', 'leaf')

# ================================================================== Art Easel (floor, 0.5 x 0.5, h 1.45)
def rr_ol(w, h, r, cx=0.0, cy=0.0, n=3):
    pts = []
    for (qx, qy, a0) in ((w / 2 - r, h / 2 - r, 0.0), (-(w / 2 - r), h / 2 - r, PI / 2), (-(w / 2 - r), -(h / 2 - r), PI), (w / 2 - r, -(h / 2 - r), 1.5 * PI)):
        for i in range(n + 1):
            a = a0 + (PI / 2) * i / n; pts.append((cx + qx + r * math.cos(a), cy + qy + r * math.sin(a)))
    return pts

def paw_relief(pos, s, col, z0, depth=0.003):
    """a paw-print emblem in relief (face frame): a pad and four toes"""
    x, y = pos
    add(puffy([(x + px, y + py) for px, py in circ_ol(8, 0.5 * s, 0.42 * s)], depth, bev=depth * 0.5, z0=z0), soft(col, 0.1), 'emblem')
    for k in range(4):
        a = PI / 2 + (k - 1.5) * 0.55
        add(puffy([(x + math.cos(a) * 0.62 * s + px, y + 0.1 * s + math.sin(a) * 0.62 * s + py) for px, py in circ_ol(6, 0.2 * s, 0.24 * s)], depth, bev=depth * 0.5, z0=z0), soft(col, 0.1), 'emblem')

def build_artEasel():
    new_asset()
    wd, wdD, wdL = '#c8915c', '#a06a40', '#e2b07c'; lean = 0.112
    for sx in (-1, 1): add(rbar((sx * 0.19, 0.012, 0.12), (sx * 0.05, 1.38, -0.035), 0.06, 0.048, r=0.014), wood(wd, seed=1), 'legs')
    add(rbar((0, 1.33, -0.075), (0, 0.012, -0.23), 0.052, 0.044, r=0.013), wood(wdD, seed=2), 'legs')
    for (x, z) in ((-0.19, 0.12), (0.19, 0.12), (0, -0.23)): add(rb(0.074, 0.026, 0.074, (x, 0.013, z), r=0.009), wood(wdD), 'feet')
    add(rb(0.16, 0.08, 0.064, (0, 1.37, -0.04), r=0.02), wood(wdD, seed=3), 'head')
    add(gpipe((-0.1, 1.36, -0.08), (0.1, 1.36, -0.08), 0.016, K=8, caps=False), wood(wdL), 'head')
    for sx in (-1, 1): add(sph(0.022, (sx * 0.1, 1.36, -0.08), K=7, J=4), wood(wdL), 'head')
    add(sph(0.03, (0, 1.43, -0.04), K=8, J=5), wood(wdL), 'head')
    add(rbar((-0.17, 0.28, 0.089), (0.17, 0.28, 0.089), 0.046, 0.036, r=0.011), wood(wdD, seed=4), 'rails')
    add(rbar((0, 0.28, 0.074), (0, 1.31, -0.042), 0.046, 0.032, r=0.011), wood(wdD, seed=5), 'rails')
    add(rb(0.52, 0.026, 0.086, (0, 0.503, 0.095), r=0.01), wood(wd, seed=6), 'tray')
    add(rb(0.52, 0.04, 0.02, (0, 0.52, 0.137), r=0.008), wood(wdL, seed=7), 'tray')
    for sx in (-1, 1): add(rb(0.04, 0.06, 0.06, (sx * 0.137, 0.47, 0.072), r=0.01), wood(wdD), 'tray')
    # the canvas, tilted back with the legs, and Mochi's half-finished purple sunrise
    with at((0, 0.516, 0.1), rx=-lean, s=1.08):
        lo = local_of()
        cw, ch = 0.48, 0.4
        add(rb(cw, ch, 0.03, (0, ch / 2, 0), r=0.008), lambda p, n: mix('#f4ead8', '#ddd0ba', clamp(n.y * 0.6 + 0.4)), 'canvas')
        def sky(p, n):
            y = lo(p).y; t = (y - 0.15) / 0.24
            c = mix('#ffc0b0', '#f2a0c8', clamp(t * 2.2)); c = mix(c, '#a46ad4', clamp(t * 1.7 - 0.55)); return mix(c, '#6a44b4', clamp(t * 2 - 1.3))
        add(box(cw - 0.02, ch - 0.02, 0.003, (0, ch / 2, 0.0155), r=0.0, extra=(1, 0, 10)), sky, 'paint')
        Zk = lambda k: 0.017 + k * 0.0011
        def L(t, c, tag='paint'): add(t, paint(c, top=0.06, bot=0.12), tag)
        sx0, hy = 0.07, 0.16
        L(ribbon2d([(sx0 + 0.093 * math.cos(a), hy + 0.093 * math.sin(a)) for a in [0.05 + PI * 0.9 * i / 12 + PI * 0.05 for i in range(13)]], 0.014, 0.002, Zk(0)), '#ffc8cc')
        L(puffy([(sx0 + 0.078 * math.cos(a), hy + 0.078 * math.sin(a)) for a in [PI * i / 14 for i in range(15)]], 0.0024, bev=0.0012, z0=Zk(1)), '#ffe2a8')
        L(puffy([(sx0 + 0.05 * math.cos(a), hy + 0.05 * math.sin(a)) for a in [PI * i / 10 for i in range(11)]], 0.0024, bev=0.0012, z0=Zk(2)), '#fff4d8')
        for k in range(7):
            a = 0.25 + k / 6 * (PI - 0.5)
            L(ribbon2d([(sx0 + math.cos(a) * 0.118, hy + math.sin(a) * 0.118), (sx0 + math.cos(a) * 0.152, hy + math.sin(a) * 0.152)], 0.006, 0.002, Zk(1)), '#ffdcc4')
        L(ribbon2d([(-0.2, 0.31), (-0.14, 0.322), (-0.08, 0.316), (-0.03, 0.326)], lambda s: 0.011 * (0.4 + 0.6 * math.sin(PI * s) ** 0.5), 0.0024, Zk(2), n=9), '#f8b0dc')
        L(ribbon2d([(0.1, 0.345), (0.15, 0.354), (0.21, 0.348)], lambda s: 0.009 * (0.4 + 0.6 * math.sin(PI * s) ** 0.5), 0.0024, Zk(2), n=7), '#ffcaea')
        f1 = lambda x: 0.165 + 0.03 * math.sin(x * 14 + 0.6) + 0.012 * math.sin(x * 37)
        L(puffy([(-0.23, 0.1)] + [(-0.23 + 0.46 * i / 18, f1(-0.23 + 0.46 * i / 18)) for i in range(19)] + [(0.23, 0.1)], 0.0026, bev=0.0012, z0=Zk(3)), '#9a74cc')
        L(puffy(rr_ol(0.46, 0.05, 0.006, 0.0, 0.085), 0.0026, bev=0.0012, z0=Zk(4)), '#c4a2ea')
        for (y, w) in ((0.1, 0.03), (0.09, 0.022), (0.078, 0.015)):
            L(ribbon2d([(sx0 - w, y), (sx0 + w, y)], 0.004, 0.002, Zk(5)), '#ffe8cc')
        f2 = lambda x: 0.06 + 0.035 * math.cos((x + 0.1) * 9) * (1 if x < 0.06 else 0.2)
        L(puffy([(-0.23, 0.012)] + [(-0.23 + 0.46 * i / 14, f2(-0.23 + 0.46 * i / 14)) for i in range(15)] + [(0.23, 0.012)], 0.0026, bev=0.0012, z0=Zk(6)), '#5a4096')
        # the unfinished corner: bare canvas, pencil lines, two fresh strokes running into it
        L(puffy([(0.06, 0.011), (0.231, 0.011), (0.231, 0.13), (0.2, 0.112), (0.172, 0.09), (0.155, 0.062), (0.135, 0.04), (0.1, 0.024)], 0.0026, bev=0.0012, z0=Zk(7)), '#f6eedc')
        L(ribbon2d([(0.12, 0.03), (0.16, 0.05), (0.2, 0.07), (0.225, 0.09)], 0.0035, 0.0015, Zk(8), n=6), '#9a96a8')
        L(ribbon2d([(0.17, 0.02), (0.175, 0.045), (0.19, 0.06)], 0.0035, 0.0015, Zk(8), n=5), '#9a96a8')
        L(ribbon2d([(0.04, 0.075), (0.1, 0.07), (0.145, 0.058)], lambda s: 0.009 * (1 - 0.5 * s), 0.0026, Zk(8), n=6), '#7a58b8')
        paw_relief((-0.19, 0.035), 0.034, '#ff8fb0', Zk(8))
        add(rb(0.08, 0.04, 0.05, (0, ch - 0.004, -0.012), r=0.012), wood(wdL), 'clamp')
    # the palette hanging by its thumb hole from a hook under the tray's left end
    hx, hy, hz = -0.2, 0.49, 0.12
    add(gtube([(hx, hy, hz), (hx, hy - 0.022, hz + 0.004), (hx + 0.006, hy - 0.034, hz + 0.012), (hx + 0.01, hy - 0.026, hz + 0.018)], 0.0052, K=4), lac(GOLD), 'hook')
    with at((hx + 0.008, hy - 0.03, hz + 0.024), ry=-0.3, rx=-0.1):
        ol = []
        for i in range(18):
            a = PI / 2 + TAU * i / 18
            r = 1.0 - 0.18 * math.exp(-((math.atan2(math.sin(a - 0.2), math.cos(a - 0.2))) ** 2) / 0.08)
            ol.append((0.068 * r * math.cos(a), -0.095 + 0.105 * r * math.sin(a)))
        add(puffy(ol, 0.009, bev=0.004, z0=0.0), wood('#e8bc88', hi='#f4d4a8'), 'palette')
        add(dot(0.014, (0.0, -0.022, 0.009), sc=(1, 1, 0.3), K=8), flat('#6a4a3a'), 'palette')
        for (x, y, c) in ((-0.03, -0.06, '#9a62d0'), (0.028, -0.07, '#ff8fb0'), (0.04, -0.11, '#ffd24a'), (0.03, -0.155, '#fffaf2'), (-0.01, -0.172, '#6ab8f0'), (-0.04, -0.128, '#8fe0a0')):
            add(dot(0.015, (x, y, 0.01), sc=(1.1, 1, 0.45), K=7), lac(c), 'paint')
    # the paint rag draped over the tray's right end (cloth)
    path = catmull([(0.06, 0.519), (0.112, 0.522), (0.126, 0.546), (0.14, 0.553), (0.154, 0.541), (0.158, 0.47), (0.162, 0.4), (0.166, 0.335)], 12)
    t = Tmp(); ids = []; NW = 4
    for j, (z, y) in enumerate(path):
        s = j / (len(path) - 1); row = []
        for i in range(NW + 1):
            u = i / NW; x = 0.12 + u * 0.12 + (0.012 * math.sin(u * 7 + s * 5) if s > 0.5 else 0.0)
            zz = z + (0.008 * math.sin(u * 5 + s * 9) if s > 0.5 else 0.0) + 0.004
            row.append(t.vert(F.W((x, y + 0.004, zz))))
        ids.append(row)
    for j in range(len(path) - 1):
        for i in range(NW):
            t.face([ids[j][i], ids[j][i + 1], ids[j + 1][i + 1], ids[j + 1][i]], Vector((0, -1, 1)))
    def ragc(cen, fn):
        k = vnoise(cen, 45.0, 7)
        if k > 0.68: return '#a87ad8'
        if k < 0.3: return '#ff9ec4'
        if 0.48 < k < 0.52: return '#ffd24a'
        return '#f6efe4'
    add_open(facet(t, ragc, open_=True), fsh(0.1, 0.3), 'rag', 'cloth')
    # brushes and a squeezed paint tube on the tray
    for (z, c, tip, rot) in ((0.078, '#e85a6a', '#9a62d0', 0.08), (0.104, '#5a8ad8', '#ff8fb0', -0.05)):
        with at((-0.02, 0.527, z), ry=rot):
            add(gpipe((-0.12, 0, 0), (0.05, 0, 0), 0.0055, 0.0065, K=5), lac(c), 'brushes')
            add(gpipe((0.05, 0, 0), (0.068, 0, 0), 0.0068, K=5, caps=False), lac('#c8ccd4'), 'brushes')
            add(glathe([(0.0, 0.0), (0.0075, 0.0), (0.006, 0.016), (0.0, 0.03)], K=6, pos=(0.067, 0, 0), rz=-PI / 2), soft(mix('#f2e2c4', tip, 0.85), 0.2), 'brushes')
    with at((-0.15, 0.53, 0.108), ry=0.3):
        add(sph(1.0, (0, 0, 0), sc=(0.036, 0.009, 0.013), K=8, J=4), lac('#c8a8f0'), 'tube')
        add(gpipe((0.034, 0, 0), (0.048, 0, 0), 0.0065, K=6), lac('#fffaf2'), 'tube')

# ================================================================== Cat Tower (floor, 0.5 x 0.5, h 1.5)
def build_catTower():
    new_asset()
    carpet, carpetD, carpetB, trim, sisal, sisalD = '#dccaf6', '#c2a6ea', '#a68ad4', '#fff1de', '#e2c48e', '#c6a066'
    add(rb(0.48, 0.07, 0.48, (0, 0.035, 0), r=0.03), fuzz(carpetB), 'base', 'cloth')
    for (x, z, a) in ((0.07, 0.19, 0.3), (0.19, 0.0, -0.4)):
        with at((x, 0.07, z), ry=a):
            add(sph(0.022, (0, 0.002, 0), sc=(1.1, 0.3, 0.9), K=7, J=2), flat('#ffb6d0'), 'paws')
            for k in range(4):
                b = (k - 1.5) * 0.52
                add(sph(0.0095, (math.sin(b) * 0.032, 0.002, -math.cos(b) * 0.032), sc=(1, 0.35, 1.15), K=6, J=2), flat('#ffb6d0'), 'paws')
    # the cubby: a carpeted box with a round door, a cream trim ring and a cushion on top
    cx, cz, cy, cs = -0.085, -0.085, 0.07, 0.3
    add(rb(cs, cs, cs, (cx, cy + cs / 2, cz), r=0.05), fuzz(carpetD), 'cubby', 'cloth')
    fz = cz + cs / 2
    add(dot(0.085, (cx, cy + 0.14, fz - 0.004), sc=(1, 1, 0.12), K=16), flat('#3e3050'), 'door')
    add(dot(0.066, (cx + 0.008, cy + 0.132, fz - 0.0015), sc=(1, 1, 0.08), K=14), flat('#2a2236'), 'door')
    add(gloopc([(cx + 0.089 * math.cos(TAU * k / 18), cy + 0.14 + 0.089 * math.sin(TAU * k / 18), fz + 0.004) for k in range(18)], 0.016, K=5), soft(trim, 0.2), 'door')
    add(gl_lathe([(0.0, 0.0), (0.15, 0.0), (0.168, 0.016), (0.166, 0.036), (0.14, 0.05), (0.0, 0.055)], 16, pos=(cx, cy + cs - 0.01, cz), e=3.0), fuzz(carpet), 'cubby', 'cloth')
    # the sisal post (front right) to the mid platform: ribbed coils with helical stripes, carpet collars
    px, pz, y0, y1 = 0.11, 0.11, 0.07, 0.8
    def sisal_post(px, pz, y0, y1, r=0.05, Kp=8, pitch=0.044):
        prof = [(0.0, y0)]
        y = y0
        while y < y1 - pitch * 0.8:
            prof += [(r, y + 0.004), (r * 1.16, y + pitch * 0.5)]; y += pitch
        prof += [(r, y1), (0.0, y1)]
        def sc_(cen, fn):
            j = int((cen.z - y0) / (pitch * 0.5)); k = angle_k(cen, Kp, PI / Kp)
            c = sisal if ((j + k) % 4) < 2 else sisalD
            return mul(c, 1.05 if j % 2 else 0.93)
        t = facet(lathe(prof, Kp, th0=PI / Kp), sc_); t.xform(F.m @ lm((px, 0, pz)))
        add(t, fsh(0.14, 0.28), 'sisal')
    sisal_post(px, pz, y0, y1)
    for yy in (y0 + 0.015, y1 - 0.03):
        add(cyl(0.07, 0.07, 0.034, (px, yy, pz), K=14, bev=0.012), fuzz(carpetD), 'collars', 'cloth')
    # the mid platform and the dangling pom-pom
    mx, mz, my = 0.08, 0.08, 0.8
    add(gl_lathe([(0.0, 0.0), (0.168, 0.0), (0.188, 0.016), (0.192, 0.04), (0.18, 0.064), (0.15, 0.074), (0.0, 0.076)], 18, pos=(mx, my, mz)), fuzz(carpet), 'platform', 'cloth')
    add(gloopc([(mx + 0.192 * math.cos(TAU * k / 24), my + 0.03, mz + 0.192 * math.sin(TAU * k / 24)) for k in range(24)], 0.013, K=5), soft(trim, 0.2), 'platform')
    ax, az, sb = mx - 0.13, mz + 0.12, 0.6
    add(gpipe((ax, my + 0.01, az), (ax + 0.006, sb + 0.04, az + 0.004), 0.0055, K=4), soft('#ff7aa8', 0.2), 'pompom', 'cloth')
    add(lumpy(0.056, (ax + 0.006, sb, az + 0.004), amp=0.16, seed=4, K=10, J=7, f=9.0), lambda p, n: mix('#ff7aa8', '#ffd0e0', clamp(n.z) * 0.45), 'pompom', 'cloth')
    # the carpeted post to the top bed
    qx, qz = -0.1, -0.1; q0 = cy + cs + 0.02
    sisal_post(qx, qz, q0, 1.29, r=0.048, Kp=7, pitch=0.056)
    add(cyl(0.068, 0.068, 0.032, (qx, q0 + 0.01, qz), K=14, bev=0.012), fuzz(carpetB), 'post2', 'cloth')
    # the top bed: a puffy bowl with cat ears on its back rim and a pink cushion
    bx, bz, by = -0.06, -0.06, 1.27
    bed = [(0.0, 0.0), (0.18, 0.0), (0.198, 0.016), (0.208, 0.05), (0.204, 0.09), (0.19, 0.115), (0.168, 0.12), (0.152, 0.1), (0.148, 0.06), (0.13, 0.045), (0.0, 0.042)]
    add(gl_lathe(bed, 16, pos=(bx, by, bz)), fuzz(carpetD), 'bed', 'cloth')
    add(gl_lathe([(0.0, 0.0), (0.13, 0.0), (0.145, 0.014), (0.138, 0.034), (0.11, 0.048), (0.04, 0.054), (0.0, 0.044)], 14, pos=(bx, by + 0.036, bz)), lambda p, n: mul('#ffc2d6', 0.92 + 0.1 * clamp(n.z)), 'bed', 'cloth')
    for s in (-1, 1):
        a = PI + s * 0.62; ex, ez = bx + math.sin(a) * 0.17, bz + math.cos(a) * 0.17
        with at((ex, by + 0.105, ez), ry=a, s=(1, 1, 0.5)):
            add(glathe([(0.0, 0.0), (0.06, 0.0), (0.03, 0.06), (0.0, 0.095)], K=8), fuzz(carpetD), 'ears', 'cloth')
        with at((ex - math.sin(a) * 0.022, by + 0.11, ez - math.cos(a) * 0.022), ry=a, s=(1, 1, 0.3)):
            add(glathe([(0.0, 0.0), (0.036, 0.0), (0.018, 0.04), (0.0, 0.064)], K=6), flat('#ffb0c8'), 'ears')

# ================================================================== shared plant bits
def oleaf(base, az, el, L, W, droop=0.35, cfn=None, n=4, curl=0.22, th=0.005, shape=0.6, tag='leaves'):
    """a single chunky leaf from base (game) heading az, rising el, drooping toward the tip; returns the tip"""
    P = arc_path(base, az, el, el - droop, L, n)
    wf = lambda s: W * max(0.12, math.sin(PI * (0.12 + 0.88 * s)) ** shape)
    add(leaf_strip(P, wf, th=th, side=left_of(az), curl=curl, cfn=cfn or (lambda s, e: mix('#4f9a44', '#9ad46e', s * 0.6))), fsh(0.2, 0.32), tag, 'leaf')
    return P[-1]

def gcol(c0, c1='#b8e888', k=0.55, edge='#d8f4b0'):
    return lambda s, e: mix(mix(c0, c1, clamp(s) * k), edge, 0.18) if e else mix(c0, c1, clamp(s) * k * 0.8)

def flower_fan(pos, r, petal, eye, n=5, per=2, rx=-PI / 2, ry=0.0, rz=0.0, T=0.004, tag='flowers', mat='leaf'):
    """a flat round-petalled flower (2 tris per outline point), its raised centre painted as the eye"""
    t = fan_shape(flower_ol(n, 1.0, 0.5, per), pos, sc=r, T=T, rx=rx, ry=ry, rz=rz, centre=(0.0, 0.0))
    t.c = [srgb(petal)] * (len(t.v) - 2) + [srgb(eye), srgb(mul(petal, 0.85))]
    add(t, fsh(0.12, 0.26), tag, mat)

# ================================================================== Flour Sacks (floor, 0.5 x 0.5, h 0.6)
SACK = [(0.0, 0.0), (0.118, 0.0), (0.148, 0.01), (0.166, 0.035), (0.174, 0.05), (0.177, 0.074), (0.178, 0.13), (0.174, 0.18), (0.168, 0.21),
        (0.163, 0.232), (0.157, 0.256), (0.152, 0.276), (0.144, 0.29), (0.118, 0.325), (0.09, 0.36), (0.066, 0.388), (0.055, 0.404), (0.052, 0.418),
        (0.058, 0.432), (0.075, 0.446), (0.09, 0.46), (0.082, 0.474), (0.05, 0.47), (0.0, 0.464)]
def sack(seed, mark=True):
    def k(th, z):
        a = th + PI / 2                     # (Blender lathe angle -> the game's angle from the front)
        if z > 0.33: return 1 + math.cos(a * 9 + seed) * 0.13 * clamp((z - 0.33) / 0.09)
        return 1 + (0.035 * math.sin(a * 2 + seed) + 0.02 * math.sin(a * 3 + seed * 2)) * math.sin(PI * clamp(z / 0.33))
    def rfn(r, z, th): return r * k(th, z)
    BAND = lambda z: (0.05 < z < 0.074) or (0.256 < z < 0.276)
    K = 14; th0 = PI / K
    def scol(cen, fn):
        z = cen.z
        if BAND(z): return '#6c8ad0'
        if z > 0.44: return '#fffaf0'
        a = math.atan2(cen.y, cen.x) + PI / 2
        c = mix('#ecd6ac', '#f8eedc', clamp(z / 0.4) * 0.7)
        if z > 0.33: c = mul(c, 1 - 0.12 * clamp(-math.cos(a * 9 + seed)) * clamp((z - 0.33) / 0.06))
        return c
    t = facet(lathe(SACK, K, th0=th0, rfn=rfn), scol); t.xform(F.m)
    add(t, fsh(0.12, 0.3), 'sacks', 'cloth')
    if mark:
        base = prof_r(SACK[1:13])
        rfront = lambda y: base(y) * k(-PI / 2, y)
        cy = 0.165
        with flat_frame():
            ring = ribbon2d([(0.06 * math.cos(TAU * i / 13), cy + 0.06 * math.sin(TAU * i / 13)) for i in range(14)], 0.0062, 0.002, 0.0)
        add(onto_lathe(ring, rfront, lift=0.002), soft('#c8603a', 0.1), 'stamp', 'cloth')
        with flat_frame():
            st = ribbon2d([(0.0, cy - 0.044), (0.003, cy), (0.0, cy + 0.04)], 0.0042, 0.002, 0.0, n=5)
        add(onto_lathe(st, rfront, lift=0.002), soft('#c8903a', 0.1), 'stamp', 'cloth')
        for i in range(4):
            for s in (-1, 1):
                with flat_frame():
                    g = fan_shape([(0.0065 * math.cos(TAU * j / 7), 0.013 * math.sin(TAU * j / 7)) for j in range(7)], (s * 0.01, cy - 0.006 + i * 0.013, 0.0), sc=1.0, T=0.003, rz=-s * 0.5, centre=(0.0, 0.0), Tb=0.0005)
                add(onto_lathe(g, rfront, lift=0.002), soft('#d8a040', 0.15), 'stamp', 'cloth')
        with flat_frame():
            g = fan_shape([(0.0065 * math.cos(TAU * j / 7), 0.012 * math.sin(TAU * j / 7)) for j in range(7)], (0.0, cy + 0.047, 0.0), sc=1.0, T=0.003, centre=(0.0, 0.0), Tb=0.0005)
        add(onto_lathe(g, rfront, lift=0.002), soft('#d8a040', 0.15), 'stamp', 'cloth')
        for s in (-1, 1):
            with flat_frame():
                g = ribbon2d([(0.0, cy - 0.03), (s * 0.016, cy - 0.022), (s * 0.027, cy - 0.006)], lambda q: 0.0045 * (1 - 0.5 * q), 0.002, 0.0, n=5)
            add(onto_lathe(g, rfront, lift=0.002), soft('#8aa860', 0.1), 'stamp', 'cloth')
    # the twine tie and its bow
    add(gloopc([(0.058 * math.cos(TAU * i / 12), 0.414, 0.058 * math.sin(TAU * i / 12)) for i in range(12)], 0.0088, K=4), soft('#c89a5a', 0.2), 'twine')
    for s in (-1, 1):
        lp = [(s * 0.006, 0.418, 0.062), (s * 0.02, 0.432, 0.07), (s * 0.036, 0.426, 0.068), (s * 0.034, 0.41, 0.066), (s * 0.016, 0.412, 0.064)]
        add(gtube(catmull(lp + [lp[0]], 7), 0.0055, K=3, caps=False), soft('#d4a868', 0.2), 'twine')
        add(gtube(catmull([(s * 0.006, 0.41, 0.064), (s * 0.014, 0.385, 0.07), (s * 0.02, 0.362, 0.068)], 4), lambda q: 0.0052 - 0.001 * q, K=3), soft('#d4a868', 0.2), 'twine')
    add(sph(0.0105, (0.0, 0.414, 0.066), K=6, J=3), soft('#c89a5a', 0.2), 'twine')

def build_flourSacks():
    new_asset()
    with at((-0.065, 0.0, -0.06), ry=0.25): sack(0.7)
    with at((0.135, 0.022, 0.095), ry=-0.5, s=0.72, rx=-0.06, rz=0.14): sack(2.3, mark=False)
    # the scoop of flour and a little drift of spill
    with at((-0.15, 0.0, 0.165), ry=0.7):
        with at((0.0, 0.036, 0.0), rz=-0.35):
            sp = [(0.0, -0.026), (0.03, -0.024), (0.046, -0.012), (0.052, 0.006), (0.054, 0.022), (0.049, 0.024), (0.046, 0.008), (0.04, -0.008), (0.026, -0.016), (0.0, -0.018)]
            add(gl_lathe(sp, 10), wood('#d8a06a', hi='#f0c890'), 'scoop')
            add(sph(0.046, (0.0, 0.012, 0.0), sc=(1, 0.42, 1), K=10, J=4), soft('#fffbf2', 0.06), 'flour')
            add(gpipe((0.048, 0.012, 0.0), (0.13, 0.03, 0.0), 0.012, 0.014, K=7), wood('#c8905a'), 'scoop')
            add(sph(0.017, (0.132, 0.03, 0.0), K=7, J=4), wood('#b8804a'), 'scoop')
    add(lumpy(0.07, (-0.1, 0.0155, 0.215), amp=0.08, seed=9, K=12, J=4, sc=(1, 0.2, 0.7), f=6.0), soft('#fffaf0', 0.05), 'spill')
    for (x, z, r) in ((-0.03, 0.235, 0.012), (-0.01, 0.2, 0.009), (0.0, 0.25, 0.008)):
        add(sph(r, (x, r * 0.45, z), sc=(1, 0.45, 1), K=6, J=2), soft('#fffaf0', 0.05), 'spill')

# ================================================================== Plant Stand (floor, 0.5 x 0.5, h 1.1)
def build_plantStand():
    new_asset()
    wd, wdD = '#e4b07a', '#b47a48'
    zb, zf0, zf1, Ht = -0.19, 0.21, -0.07, 1.0
    zf = lambda y: zf0 + (zf1 - zf0) * y / Ht
    for sx in (-1, 1):
        x = sx * 0.215
        add(cbar((x, 0.0, zb), (x, Ht, zb), 0.046, 0.046, c=0.012), wood(wdD, seed=1), 'legs')
        add(cbar((x, 0.008, zf0 - 0.002), (x, Ht - 0.02, zf1), 0.046, 0.042, c=0.012), wood(wdD, seed=2), 'legs')
        add(cbar((x, Ht - 0.025, zf1 + 0.01), (x, Ht - 0.025, zb), 0.04, 0.04, c=0.01), wood(wdD, seed=3), 'legs')
        add(sph(0.032, (x, Ht + 0.022, zb), K=7, J=4), wood(wd), 'legs')
        for z in (zb, zf0): add(box(0.064, 0.02, 0.062, (x, 0.01, z), r=0.0), wood('#8a5a3a'), 'legs')
    tiers = []
    for y in (0.28, 0.58, 0.88):
        f = zf(y) + 0.008; d = f - zb + 0.03; c = (f + zb) / 2
        add(rb(0.47, 0.026, d, (0, y + 0.013, c), r=0.009), wood(wd, seed=int(y * 10)), 'boards')
        for sx in (-1, 1): add(box(0.03, 0.03, d - 0.02, (sx * 0.2, y - 0.015, c), r=0.0), wood(wdD), 'boards')
        tiers.append((y + 0.026, c, f))
    greens = ['#4f9a44', '#5aae4a', '#68b850']
    # tier 1: a bushy basil and a pot of flowering chives
    y, c, _ = tiers[0]
    sy = clay_pot((-0.095, y, c + 0.035), 0.08, 0.11, '#d8845a', band='#fff1de', dot_c='#8fd0a0')
    for k in range(4):
        a = k / 4 * TAU + 0.3 * math.sin(k * 2.1); r0 = 0.03
        tp = (math.sin(a) * (r0 + 0.035), sy + 0.12 + 0.02 * math.sin(k * 1.3), math.cos(a) * (r0 + 0.035))
        st = [(math.sin(a) * r0 * 0.4, sy, math.cos(a) * r0 * 0.4), (tp[0] * 0.6, sy + (tp[1] - sy) * 0.55, tp[2] * 0.6), tp]
        with at((-0.095, y, c + 0.035)):
            add(gtube(catmull(st, 4), 0.0055, K=3), soft('#5a9a3a', 0.2), 'basil', 'leaf')
            pts = catmull(st, 11)
            for (f_, L, m, el) in ((0.55, 0.072, 2, 0.2), (1.0, 0.058, 2, 0.8)):
                q = pts[int(f_ * 10)]
                for j in range(m):
                    oleaf(q, a + f_ * 2.2 + j * TAU / m, el, L, L * 0.4, droop=0.5, n=3, cfn=gcol(greens[(k + j) % 3]), tag='basil')
    with at((0.115, y, c + 0.02), s=1.08):
        sy2 = clay_pot((0, 0, 0), 0.058, 0.09, '#e8a070', band='#ffe8f0', dot_c='#c8a0e8')
        for k in range(6):
            a = k / 6 * TAU + 0.2
            oleaf((math.sin(a) * 0.012, sy2, math.cos(a) * 0.012), a, 1.38 - 0.05 * (k % 3), 0.15 + 0.03 * math.sin(k * 2.7), 0.0075, droop=0.5, shape=0.3, curl=0.4, n=3, cfn=gcol('#4f9a44', '#8cd060'), tag='chives')
        for (x, z, hh) in ((0.01, 0.0, 0.2), (-0.015, 0.01, 0.17)):
            add(gpipe((x, sy2, z), (x * 2, sy2 + hh, z * 2), 0.0045, K=4), soft('#5a9a3a', 0.2), 'chives', 'leaf')
            add(lumpy(0.021, (x * 2, sy2 + hh + 0.014, z * 2), amp=0.22, seed=int(hh * 100), K=6, J=4, f=14.0), lambda p, n: mix('#c890e8', '#f0d8ff', clamp(n.z) * 0.45), 'chives', 'leaf')
    # tier 2: the strawberry plant, berries hanging over the pot's rim
    y, c, _ = tiers[1]
    with at((0.0, y, c + 0.02), s=1.12):
        pr, ph = 0.074, 0.1
        sy = clay_pot((0, 0, 0), pr, ph, '#e88a72', band='#fff1de', dot_c='#ff6f7f')
        for k in range(4):
            a = k / 4 * TAU + 0.8; ln = 0.085 + 0.012 * math.sin(k * 2.3)
            tp = (math.sin(a) * ln, sy + 0.085 + 0.012 * math.sin(k * 1.7), math.cos(a) * ln)
            add(gtube(catmull([(0, sy, 0), (tp[0] * 0.4, tp[1] + 0.012, tp[2] * 0.4), tp], 4), 0.0045, K=3), soft('#6aa84a', 0.2), 'straw', 'leaf')
            for j in (-1, 0, 1):
                oleaf(tp, a + j * 0.75, 0.25 - abs(j) * 0.15, 0.056, 0.024, droop=0.35, n=3, cfn=gcol('#4a9a40', '#8cc860'), tag='straw')
        def berry(x, yb, z, ripe):
            K = 6
            prof = [(0.0, -0.034), (0.009, -0.03), (0.017, -0.018), (0.02, -0.005), (0.017, 0.004), (0.008, 0.009), (0.0, 0.01)]
            base_c = '#e8343a' if ripe else '#e8f0b0'
            def bc(cen, fn):
                k_ = angle_k(cen, K, PI / K); j = int((cen.z + 0.034) / 0.009)
                return '#ffe08a' if (k_ + j) % 3 == 0 and -0.028 < cen.z < 0.004 else base_c
            add(gl_lathe(prof, K, pos=(x, yb, z), colfn=bc), fsh(0.18, 0.3, sheen=0.4), 'berries')
            t = fan_shape(star_ol(5, 1.0, 0.45), (x, yb + 0.011, z), sc=0.017, T=0.004, rx=-PI / 2, centre=(0.0, 0.0))
            add(t, soft('#4f9a44', 0.2), 'berries', 'leaf')
        for (a, ripe, drop) in ((0.35, True, 0.045), (0.95, False, 0.055), (-0.6, True, 0.04)):
            S, C = math.sin(a), math.cos(a); e = (S * pr * 1.3, ph - drop, C * pr * 1.3)
            add(gtube(catmull([(S * 0.02, sy + 0.015, C * 0.02), (S * pr * 0.8, ph + 0.03, C * pr * 0.8), (S * pr * 1.16, ph + 0.012, C * pr * 1.16), (e[0], e[1] + 0.036, e[2])], 5), 0.0042, K=3), soft('#6aa84a', 0.2), 'straw', 'leaf')
            berry(e[0], e[1], e[2], ripe)
        for (x, z) in ((0.05, -0.035), (-0.045, -0.04)):
            flower_fan((x, sy + 0.085, z), 0.022, '#fffaf2', '#ffd24a', n=5, per=2)
    # tier 3: the tiny flowering cactus and a seedling with a carrot marker
    y, c, _ = tiers[2]
    with at((-0.08, y, c), s=1.1):
        sy = clay_pot((0, 0, 0), 0.052, 0.075, '#ffb0c8', band='#fff6ea', dot_c='#ff7aa0')
        cp = [(0.0, 0.0), (0.038, 0.004), (0.048, 0.026), (0.049, 0.052), (0.042, 0.075), (0.025, 0.09), (0.0, 0.094)]
        def crf(r, z, th): return r * (1 + 0.1 * math.cos(8 * th) * math.sin(PI * clamp(z / 0.094)))
        add(glathe(cp, K=12, pos=(0, sy - 0.004, 0), rfn=crf), lambda p, n: mix('#4a9a50', '#94d880', clamp(n.z * 0.5 + 0.35)), 'cactus')
        rcp = prof_r(cp[1:])
        for k in range(8):
            a = k / 8 * TAU; yy = 0.032 if k % 2 else 0.058; rr = rcp(yy) * 1.1
            add(sph(0.0055, (math.sin(a) * rr, sy - 0.004 + yy, math.cos(a) * rr), K=4, J=2), flat('#fffaf2'), 'cactus')
        flower_fan((0, sy + 0.092, 0), 0.03, '#ff7aa8', '#ffd24a', n=6, per=2, T=0.008, mat='body')
    with at((0.1, y, c + 0.01), s=1.1):
        sy = clay_pot((0, 0, 0), 0.042, 0.065, '#a8d8f0', band='#fffaf2', dot_c='#6ab8f0')
        add(gpipe((0, sy, 0), (0.002, sy + 0.04, 0), 0.0045, K=4), soft('#8ac860', 0.2), 'seedling', 'leaf')
        for s in (-1, 1): oleaf((0.002, sy + 0.04, 0), s * PI / 2, 0.5, 0.034, 0.014, droop=0.4, cfn=gcol('#7cc05a', '#b8e888'), tag='seedling')
        add(gpipe((-0.022, sy - 0.01, 0.012), (-0.03, sy + 0.07, 0.016), 0.0055, K=4), wood('#e8c890'), 'marker')
        add(glathe([(0.0, 0.0), (0.006, 0.012), (0.013, 0.036), (0.0, 0.042)], K=7, pos=(-0.031, sy + 0.05, 0.017)), soft('#ff8a3a', 0.25), 'marker')
        for s in (-1, 0, 1): add(glathe([(0.0, 0.0), (0.005, 0.004), (0.0, 0.02)], K=4, pos=(-0.031 + s * 0.004, sy + 0.09, 0.017), rz=-s * 0.4), soft('#5aa84a'), 'marker', 'leaf')
    # a mint watering can tucked under the bottom step
    with at((0.06, 0.0, 0.0), ry=-0.5):
        add(gl_lathe([(0.0, 0.0), (0.055, 0.0), (0.06, 0.008), (0.06, 0.09), (0.052, 0.105), (0.03, 0.112), (0.0, 0.113)], 8), lac('#8fd8c0'), 'can')
        add(gtube([(0.05, 0.03, 0), (0.09, 0.07, 0), (0.12, 0.11, 0)], lambda s: 0.012 - s * 0.004, K=6, caps=False), lac('#8fd8c0'), 'can')
        add(glathe([(0.0, 0.0), (0.008, 0.0), (0.018, 0.022), (0.0, 0.024)], K=8, pos=(0.118, 0.106, 0), rz=-PI / 4), lac('#7cc8b0'), 'can')
        add(gtube(catmull([(-0.06, 0.08, 0), (-0.075, 0.115, 0), (-0.03, 0.14, 0), (0.01, 0.11, 0)], 6), 0.008, K=4), lac('#7cc8b0'), 'can')
        add(sph(0.012, (0, 0.115, 0), K=6, J=3), soft('#fffaf2', 0.1), 'can')

# ================================================================== Folding Screen (floor, 1.5 x 0.5, h 1.4)
def clip_poly(poly, u0, u1):
    def clip(P, keep, inter):
        out = []
        for i in range(len(P)):
            a, b = P[i - 1], P[i]; ka, kb = keep(a), keep(b)
            if kb:
                if not ka: out.append(inter(a, b))
                out.append(b)
            elif ka: out.append(inter(a, b))
        return out
    def ix(u): return lambda a, b: (u, a[1] + (b[1] - a[1]) * (u - a[0]) / (b[0] - a[0]))
    P = clip(poly, lambda p: p[0] >= u0, ix(u0))
    if len(P) >= 3: P = clip(P, lambda p: p[0] <= u1, ix(u1))
    return P if len(P) >= 3 else None

def cloud_ol(uc, vc, L, h, n=26):
    """a stylised gold cloud: a long rounded band with puffs on top (a single star-shaped outline)"""
    out = []
    for i in range(n):
        a = TAU * i / n; cx, sy = math.cos(a), math.sin(a)
        x = uc + L / 2 * math.copysign(abs(cx) ** 0.5, cx); y = vc + h / 2 * math.copysign(abs(sy) ** 0.6, sy)
        if sy > 0:
            bump = 0.0
            for (dx, r) in ((-0.25, 0.75), (-0.04, 1.0), (0.17, 0.8)):
                u = (x - (uc + dx * L)) / (h * r * 1.2)
                if abs(u) < 1: bump = max(bump, h * r * 0.95 * math.sqrt(1 - u * u))
            y += bump * sy ** 0.5
        out.append((x, y))
    return out

def build_byobu():
    new_asset()
    n, span, zig = 4, 1.44, 0.11
    px = span / n; pw = math.hypot(px, 2 * zig); ang = math.atan2(2 * zig, px)
    H, y0 = 1.3, 0.07; iw = pw - 0.06; ih = H - 0.1; UW = n * iw
    LACR, GOLDL = '#b8342e', '#f2c64e'
    # the painting in unfolded screen coordinates (U along the four panels, V up from the painted area's foot)
    hill1 = lambda u: 0.3 + 0.07 * math.sin(u * 3.3 + 0.5) + 0.03 * math.sin(u * 8.1)
    hill2 = lambda u: 0.16 + 0.05 * math.sin(u * 4.7 + 2.0) + 0.025 * math.sin(u * 11)
    clouds = [cloud_ol(0.42, 0.68, 0.7, 0.075, 20), cloud_ol(1.12, 0.5, 0.62, 0.07, 20), cloud_ol(1.08, 0.98, 0.72, 0.075, 20), cloud_ol(0.2, 0.4, 0.36, 0.06, 16)]
    bough = catmull([(-0.02, 1.07), (0.2, 1.0), (0.42, 0.95), (0.62, 0.86), (0.78, 0.78), (0.9, 0.69)], 16)
    twigs = [catmull([(0.3, 0.975), (0.33, 1.06), (0.37, 1.12)], 4), catmull([(0.56, 0.89), (0.6, 0.96), (0.66, 1.0)], 4), catmull([(0.72, 0.81), (0.75, 0.74), (0.74, 0.66)], 4)]
    bough2 = catmull([(UW + 0.02, 1.12), (1.4, 1.06), (1.28, 1.07), (1.2, 1.12)], 8)
    blossoms = []
    for i in range(14):
        q = bough[min(15, int(1 + i / 13 * 14))]
        blossoms.append((q[0] + 0.035 * math.sin(i * 2.7), q[1] + 0.035 * math.cos(i * 1.9), 0.04 + 0.01 * math.sin(i * 1.3)))
    for i in range(5):
        q = bough2[min(7, 1 + int(i * 1.5))]
        blossoms.append((q[0] + 0.03 * math.sin(i * 2.1), q[1] + 0.03 * math.cos(i * 2.9), 0.036))
    for (u, v) in ((0.95, 0.52), (1.05, 0.38), (0.86, 0.3), (1.22, 0.64), (1.33, 0.86), (0.6, 0.6)):
        blossoms.append((u, v, 0.022))
    pinks = ['#ff9ec4', '#ffc4dc', '#fff0f4', '#ff86b4']
    for i in range(n):
        x = -span / 2 + (i + 0.5) * px; ry = ang if i % 2 else -ang
        u0 = i * iw
        with at((x, 0.0, 0.0), ry=ry):
            # the panel: a gold-leaf front, a cream paper back, lacquer-red frame, gold corner caps, two feet
            def board(p, n_, lo=local_of()):
                q = lo(p)
                if n_.y < -0.5:
                    t = clamp((q.y - y0) / H)
                    return mul(mix('#e2b858', '#f4d88c', t), 1 + 0.05 * (vnoise(Vector((q.x * 9, q.y * 9, 0)), 1.0, i) - 0.5))
                return '#f4ead0' if n_.y > 0.5 else LACR
            add(rb(pw - 0.02, H - 0.02, 0.024, (0, y0 + H / 2, 0), r=0.006), board, 'board')
            for sx in (-1, 1): add(cbeam(0.036, H, 0.04, (sx * (pw / 2 - 0.018), y0 + H / 2, 0), c=0.01), lac(LACR), 'frame')
            for yy in (y0 + 0.018, y0 + H - 0.018): add(cbeam(pw - 0.07, 0.036, 0.04, (0, yy, 0), c=0.01), lac(LACR), 'frame')
            for sx in (-1, 1):
                for yy in (y0 + 0.018, y0 + H - 0.018): add(box(0.046, 0.046, 0.048, (sx * (pw / 2 - 0.018), yy, 0), r=0.0), lac(GOLDL), 'caps')
                add(box(0.05, y0 + 0.012, 0.054, (sx * (pw / 2 - 0.05), (y0 + 0.012) / 2, 0), r=0.0), lac(LACR), 'feet')
            # the painting, clipped to this panel
            Z0 = 0.0125
            def P2(u, v): return (u - u0 - iw / 2, v + y0 + 0.05)
            def layer(poly, c, k, depth=0.0022):
                cp = clip_poly(poly, u0, u0 + iw)
                if cp: add(puffy([P2(u, v) for u, v in cp], depth, bev=0.001, z0=Z0 + k * 0.0009), paint(c, top=0.05, bot=0.1), 'paint')
            U = [u0 + iw * j / 7 for j in range(8)]
            layer([(u0, 0.0)] + [(u, hill1(u)) for u in U] + [(u0 + iw, 0.0)], '#a8cc80', 0)
            layer([(u0, 0.0)] + [(u, hill2(u)) for u in U] + [(u0 + iw, 0.0)], '#6aa45e', 1)
            for cl in clouds: layer(cl, '#fff4d4', 2, depth=0.004)
            def branch(pts, w0, w1):
                seg = [p for p in pts if u0 - 0.02 <= p[0] <= u0 + iw + 0.02]
                seg = [(min(max(p[0], u0 + 0.004), u0 + iw - 0.004), p[1]) for p in seg]
                if len(seg) >= 2:
                    add(ribbon2d([P2(u, v) for u, v in seg], lambda s: w0 + (w1 - w0) * s, 0.004, Z0 + 3 * 0.0009), paint('#5a3a2a', top=0.12, bot=0.2), 'bough')
            branch(bough, 0.026, 0.014)
            for tw in twigs: branch(tw, 0.01, 0.005)
            branch(bough2, 0.015, 0.009)
            for k, (u, v, r) in enumerate(blossoms):
                if u0 + r < u < u0 + iw - r:
                    q = P2(u, v)
                    t = fan_shape(flower_ol(5, 1.0, 0.55, 2), (q[0], q[1], Z0 + 0.0075), sc=r * 1.15, T=0.005, rz=k * 0.7, centre=(0.0, 0.0), Tb=0.002)
                    t.c = [srgb(pinks[k % 4])] * (len(t.v) - 2) + [srgb('#ffd860'), srgb(pinks[k % 4])]
                    add(t, fsh(0.1, 0.2), 'blossoms')
    for j in range(1, n):
        for yy in (0.32, 1.08):
            add(cyl(0.013, 0.013, 0.07, (-span / 2 + j * px, yy, zig if j % 2 else -zig), K=6), lac(GOLDL), 'hinges')

# ================================================================== Ikebana Stand (floor, 0.5 x 0.5, h 0.86)
def iris_flower(pos, c, s=1.0, ry=0.0):
    with at(pos, ry=ry, s=s):
        light = mix(c, '#ffffff', 0.35)
        for k in range(3):
            a = k * TAU / 3
            oleaf((0, 0, 0), a, 0.35, 0.05, 0.02, droop=1.3, cfn=lambda s_, e: mix(c, light, 0.3 if e else 0.0) if s_ > 0.25 else '#ffd24a', curl=0.3, tag='iris')
            oleaf((0, 0.006, 0), a + PI / 3, 1.25, 0.044, 0.016, droop=-0.25, cfn=lambda s_, e: mix(c, light, 0.45 if e else 0.15), curl=0.45, tag='iris')
        add(sph(0.008, (0, 0.012, 0), K=5, J=3), soft('#ffd24a', 0.2), 'iris', 'leaf')

def build_ikebana():
    new_asset()
    BL = '#2e2428'
    add(rb(0.42, 0.04, 0.34, (0, 0.28, 0), r=0.014), lac(BL, hi='#6a5a64'), 'stand')
    add(rb(0.43, 0.012, 0.35, (0, 0.262, 0), r=0.005), lac('#d8b050'), 'stand')
    add(rb(0.36, 0.022, 0.28, (0, 0.071, 0), r=0.008), lac(BL, hi='#6a5a64'), 'stand')
    for sx in (-1, 1):
        for sz in (-1, 1):
            add(gpipe((sx * 0.17, 0.27, sz * 0.13), (sx * 0.185, 0.03, sz * 0.145), 0.02, 0.016, K=6), lac(BL, hi='#6a5a64'), 'stand')
            add(sph(0.024, (sx * 0.19, 0.018, sz * 0.15), sc=(1, 0.75, 1), K=6, J=3), lac(BL, hi='#6a5a64'), 'stand')
    sp = [(0.0, 0.0), (0.11, 0.0), (0.135, 0.02), (0.15, 0.055), (0.156, 0.066), (0.146, 0.066), (0.132, 0.032), (0.0, 0.026)]
    def sc(cen, fn):
        return '#a8c8e0' if cen.z > 0.06 else ('#2a4a6a' if fn.z > 0.5 and cen.z < 0.04 else '#4a6a8a')
    add(gl_lathe(sp, 20, pos=(0, 0.3, 0), colfn=sc), fsh(0.16, 0.3, sheen=0.4), 'suiban')
    add(gl_lathe([(0.0, 0.0), (0.139, 0.0), (0.139, 0.024), (0.0, 0.024)], 20, pos=(0, 0.328, 0)), lambda p, n: mix('#5ab0d0', '#9ad8ec', clamp(n.z)), 'water', 'water')
    for (x, z) in ((0.06, 0.07), (0.08, 0.04), (-0.07, 0.08), (0.1, -0.05), (0.04, 0.1)):
        add(lumpy(0.014, (x, 0.352, z), sc=(1, 0.6, 1), K=6, J=3, seed=int(x * 100)), soft('#f4f0e8', 0.15), 'pebbles')
    bx, by, bz = -0.03, 0.352, -0.02
    add(cyl(0.03, 0.032, 0.012, (bx, by + 0.004, bz), K=8), soft('#4a4450'), 'kenzan')
    for (h, a, tilt) in ((0.44, 0.3, 0.05), (0.38, 2.0, 0.12), (0.32, 3.6, 0.1), (0.28, 5.0, 0.16), (0.36, 1.2, 0.08), (0.3, 2.8, 0.18), (0.4, 4.3, 0.1), (0.24, 0.9, 0.22)):
        P = arc_path((bx, by, bz), a, PI / 2 - tilt, PI / 2 - tilt - 0.18, h, 5)
        add(leaf_strip(P, lambda s: 0.014 * max(0.15, (1 - s) ** 0.4 if s > 0.05 else 0.8), th=0.004, side=left_of(a), curl=0.3, cfn=gcol('#3f8a3a', '#7cc05a', 0.6)), fsh(0.2, 0.32), 'irisleaves', 'leaf')
    for (x, z, h, c) in ((0.0, 0.01, 0.43, '#7a5ad8'), (-0.06, -0.04, 0.33, '#5a4ac8'), (0.06, 0.04, 0.27, '#f4f0ff'), (-0.02, 0.06, 0.2, '#8a6ae0')):
        add(gpipe((bx, by, bz), (bx + x, by + h, bz + z), 0.0058, K=4), soft('#4a8a3a', 0.2), 'stems', 'leaf')
        iris_flower((bx + x, by + h, bz + z), c, s=1.15, ry=x * 20)
    for (x, z, h) in ((-0.02, 0.03, 0.22), (0.04, -0.03, 0.36)):
        add(gpipe((bx, by, bz), (bx + x, by + h, bz + z), 0.005, K=4), soft('#4a8a3a', 0.2), 'stems', 'leaf')
        add(sph(0.014, (bx + x, by + h + 0.02, bz + z), sc=(1, 2.2, 1), K=6, J=3), lambda p, n: mix('#6a5ab0', '#4a8a3a', clamp(-n.z)), 'buds', 'leaf')
    for (x, z, a) in ((0.06, 0.08, 0.6), (0.1, 0.03, 1.4)):
        tip = (bx + x * 1.6, by + 0.13, bz + z * 1.6)
        add(gpipe((bx, by, bz), tip, 0.005, K=4), soft('#6a8a3a', 0.2), 'kerria', 'leaf')
        for i in range(3):
            q = Vector((bx, by, bz)).lerp(Vector(tip), 0.55 + i * 0.22)
            flower_fan((q.x, q.y + 0.006, q.z), 0.02, '#ffd24a', '#ff9a30', n=5, per=2, rx=-PI / 2 + 0.5, ry=a + i)
    # willow: long branches arching over and weeping, hung with narrow leaves
    willows = [[(bx, by, bz), (bx + 0.03, 0.55, bz), (bx + 0.08, 0.76, bz + 0.01), (0.13, 0.85, 0.02), (0.19, 0.8, 0.04), (0.21, 0.64, 0.05), (0.2, 0.5, 0.06)],
               [(bx, by, bz), (bx - 0.03, 0.5, bz - 0.02), (-0.1, 0.66, -0.06), (-0.16, 0.7, -0.09), (-0.2, 0.6, -0.1), (-0.2, 0.46, -0.1)],
               [(bx, by, bz), (bx - 0.01, 0.52, bz - 0.06), (-0.04, 0.62, -0.14), (-0.08, 0.6, -0.18), (-0.1, 0.5, -0.19)]]
    for wi, pts in enumerate(willows):
        C = catmull(pts, 10)
        add(gtube(C, lambda s: 0.0075 - 0.0025 * s, K=4), wood('#7a5a3a'), 'willow', 'leaf')
        C2 = catmull(pts, 25)
        for i in range(5, 24, 2):
            q = C2[i]; az = i * 2.3 + wi
            oleaf(q, az, -0.9 - 0.3 * math.sin(i), 0.05, 0.0095, droop=0.2, n=3, curl=0.3, cfn=gcol(('#8ccf6a', '#a8dc78', '#7cc05a')[i % 3], '#c8ec98', 0.4), tag='willowleaf')

# ================================================================== cheap timber, bamboo, needle pads
def cbeam(w, h, d, pos=(0, 0, 0), c=0.01, ry=0.0, rx=0.0, rz=0.0):
    """a chamfered timber at any size (28 tris): beam() without its thin-part fallback"""
    S = (w, h, d); ax = S.index(max(S)); a, b = [S[i] for i in range(3) if i != ax]
    c = min(c, a * 0.3, b * 0.3); ha, hb, hl = a / 2, b / 2, S[ax] / 2
    ring = [(ha, hb - c), (ha - c, hb), (-ha + c, hb), (-ha, hb - c), (-ha, -hb + c), (-ha + c, -hb), (ha - c, -hb), (ha, -hb + c)]
    def P(u, v, s_):
        q = [0, 0, 0]; o = [i for i in range(3) if i != ax]; q[o[0]] = u; q[o[1]] = v; q[ax] = s_
        return (q[0], q[1], q[2])
    M = F.m @ lm(pos, ry, rx, rz); R3 = M.to_3x3(); t = Tmp()
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

def cbar(a, b, w, d, c=0.01):
    a = Vector(a); b = Vector(b); v = b - a; L = v.length
    q = Vector((0, 1, 0)).rotation_difference(v.normalized())
    with atM(Matrix.Translation((a + b) / 2) @ q.to_matrix().to_4x4()): return cbeam(w, L, d, c=c)

def bamboo_prof(L, r, nodes):
    pts = [(0.0, 0.0), (r * 0.92, 0.0), (r, 0.01)]
    for i in range(1, nodes):
        y = i * L / nodes; pts += [(r, y - 0.014), (r * 1.13, y), (r, y + 0.014)]
    return pts + [(r, L - 0.01), (r * 0.9, L), (r * 0.55, L - 0.004), (0.0, L - 0.006)]

def bamboo_col(L, r, nodes, c='#c8b070', nodeC='#8a7440', cut='#f0e2b0'):
    ys = [i * L / nodes for i in range(1, nodes)]
    def f(cen, fn):
        if cen.z > L - 0.005 and math.hypot(cen.x, cen.y) < r * 0.95: return cut
        for y in ys:
            if abs(cen.z - y) < 0.013: return nodeC if abs(cen.z - y) < 0.007 else mix(c, nodeC, 0.35)
        return c
    return f

def bamboo_pole(a, b, r, nodes, c='#c8b070', nodeC='#8a7440', cut='#f0e2b0', K=7, tag='bamboo'):
    """a bamboo pole from game point a to b: node rings, a cut top, faceted painted colours"""
    a = Vector(a); b = Vector(b); v = b - a; L = v.length
    t = facet(lathe(bamboo_prof(L, r, nodes), K, th0=PI / K), bamboo_col(L, r, nodes, c, nodeC, cut))
    q = Vector((0, 1, 0)).rotation_difference(v.normalized())
    with atM(Matrix.Translation(a) @ q.to_matrix().to_4x4()):
        t.xform(F.m)                    # (the lathe's Blender z axis is the game's local y)
    add(t, fsh(0.16, 0.3, sheen=0.2), tag)

def needle_pad(c, R, seed=0, tilt=0.0):
    """a pine needle pad: a cluster of spiky star tufts, a broad one underneath and smaller ones heaped on it"""
    layers = [(0.0, 0.0, 0.0, 1.0)] + [(math.cos(seed + k * 2.1) * 0.42, 0.28, math.sin(seed + k * 2.1) * 0.42, 0.62) for k in range(3)] + [(0.05, 0.55, -0.03, 0.46)]
    for li, (dx, dy, dz, s) in enumerate(layers):
        ol = [((1.0 if k % 2 == 0 else 0.58 + 0.06 * math.sin(k * 1.7 + seed)) * math.cos(seed + li + k * PI / 9),
               (1.0 if k % 2 == 0 else 0.58 + 0.06 * math.sin(k * 1.7 + seed)) * math.sin(seed + li + k * PI / 9) * 0.86) for k in range(18)]
        t = fan_shape(ol, (c[0] + dx * R, c[1] + dy * R * 0.55, c[2] + dz * R), sc=R * s, T=R * s * 0.42, rx=-PI / 2 + tilt * (0.6 if li else 1.0), Tb=R * s * 0.14, centre=(0.0, 0.0))
        tipc = mix('#3f7a3a', '#5a9a48', li / 4); topc = mix('#7cba5c', '#a8d878', li / 4)
        t.c = [srgb(tipc)] * 18 + [srgb(topc), srgb('#2a5030')]
        add(t, fsh(0.16, 0.3), 'needles', 'leaf')

# ================================================================== Bonsai Stand (floor, 0.5 x 0.5, h 0.92)
def build_bonsaiStand():
    new_asset()
    wd = '#74503a'
    add(rb(0.44, 0.045, 0.34, (0, 0.3525, 0), r=0.015), wood(wd, seed=1), 'stand')
    for sx in (-1, 1):
        for sz in (-1, 1):
            add(cbeam(0.05, 0.33, 0.05, (sx * 0.18, 0.165, sz * 0.13), c=0.012), wood(wd, seed=2), 'stand')
            add(sph(0.03, (sx * 0.186, 0.0215, sz * 0.136), sc=(1, 0.7, 1), K=7, J=4), wood(wd), 'stand')
    for sz in (-1, 1): add(cbeam(0.32, 0.05, 0.022, (0, 0.305, sz * 0.13), c=0.006), wood('#6e4a3a'), 'stand')
    for sx in (-1, 1): add(cbeam(0.022, 0.05, 0.22, (sx * 0.18, 0.305, 0), c=0.006), wood('#6e4a3a'), 'stand')
    add(rb(0.32, 0.075, 0.22, (0, 0.4125, 0), r=0.02), lac('#3f6a9a'), 'pot')
    add(rb(0.33, 0.014, 0.23, (0, 0.448, 0), r=0.006), lac('#5a86b8'), 'pot')
    for sx in (-1, 1):
        for sz in (-1, 1): add(rb(0.034, 0.016, 0.034, (sx * 0.13, 0.381, sz * 0.08), r=0.005), lac('#2f5a88'), 'pot')
    add(rb(0.296, 0.016, 0.196, (0, 0.452, 0), r=0.006), fuzz('#7cae5a', k=0.12, f=40), 'moss')
    for (x, z, s) in ((0.08, 0.05, 1.0), (-0.1, -0.04, 0.9), (0.11, -0.06, 0.8), (-0.04, 0.06, 0.7)):
        add(lumpy(0.024 * s, (x, 0.459, z), sc=(1, 0.38, 1), K=7, J=3, seed=int(x * 100)), fuzz('#8cc06a', k=0.12, f=40), 'moss')
    add(lumpy(0.034, (0.09, 0.466, 0.02), amp=0.2, sc=(1.25, 0.7, 1), K=7, J=4, seed=5, f=5.0), stone('#a8a0a8'), 'rock')
    # a twisty old pine: a thick trunk with a bend, surface roots, branches ending in needle pads
    def bark(p, n):
        return mix('#5e3e30', '#a07a5e', clamp(0.3 + 0.45 * math.sin(p.z * 70 + math.atan2(n.y, n.x) * 2) * vnoise(p, 30.0, 2)))
    trunk = [(-0.05, 0.455, 0.0), (-0.02, 0.52, 0.02), (-0.065, 0.6, 0.0), (-0.005, 0.67, -0.02), (0.05, 0.72, 0.0), (0.02, 0.79, 0.01)]
    add(gtube(catmull(trunk, 12), lambda s: 0.044 - s * 0.03, K=7), bark, 'trunk')
    for a in (0.4, 2.4, 4.3):
        add(gtube([(-0.05, 0.48, 0.0), (-0.05 + math.cos(a) * 0.05, 0.464, math.sin(a) * 0.05), (-0.05 + math.cos(a) * 0.085, 0.456, math.sin(a) * 0.085)], lambda s: 0.022 - s * 0.012, K=5), bark, 'trunk')
    branches = [((-0.055, 0.6, 0.0), (-0.1, 0.62, 0.02), (-0.135, 0.635, 0.045), (-0.15, 0.655, 0.05), 0.085),
                ((0.04, 0.71, -0.005), (0.085, 0.71, 0.01), (0.125, 0.725, 0.03), (0.135, 0.745, 0.035), 0.08),
                ((-0.01, 0.67, -0.02), (-0.03, 0.71, -0.07), (-0.06, 0.745, -0.1), (-0.065, 0.765, -0.105), 0.075)]
    for k, (a, b, c, pad, R) in enumerate(branches):
        add(gtube(catmull([a, b, c], 6), lambda s: 0.017 - s * 0.007, K=5), bark, 'trunk')
        needle_pad(pad, R, seed=k * 1.3, tilt=0.1 * (k - 1))
    needle_pad((0.02, 0.81, 0.01), 0.092, seed=4.0)

# ================================================================== Irori Hearth (floor, 1 x 1, h 1.2)
def flame(pos, h, r, c0, c1, K=8):
    x, y, z = pos
    pts = []
    for i in range(8):
        t = i / 7
        pts.append((max(0.0, r * math.sin(PI * min(1.0, t * 1.25)) ** 0.7 * (1 - t) ** 0.55) if 0 < i < 7 else 0.0, t * h))
    lo = y
    add(glathe(pts, K=K, pos=pos), lambda p, n: mix(c0, c1, clamp((p.z - lo) / h * 1.15)), 'fire', 'hot', uvf=lambda p: (1.0, 0.0))

def build_irori():
    new_asset()
    woodT, IRON = '#a06a44', '#4a4450'
    for sz in (-1, 1): add(rb(0.96, 0.14, 0.12, (0, 0.07, sz * 0.42), r=0.03), wood(woodT, seed=1), 'frame')
    for sx in (-1, 1): add(rb(0.12, 0.14, 0.72, (sx * 0.42, 0.07, 0), r=0.03), wood(woodT, seed=2), 'frame')
    def ash(p, n):
        r = math.hypot(p.x, p.y)
        c = mul('#d8cec2', 0.92 + 0.08 * vnoise(p, 18.0, 4))
        if n.z > 0.5: c = mul(c, 1 - 0.07 * (0.5 + 0.5 * math.sin(r * 70)))
        return c
    add(box(0.74, 0.12, 0.74, (0, 0.065, 0), r=0.03, extra=(6, 6, 0)), ash, 'ash')
    for i in range(9):
        a = i / 9 * TAU
        add(box(0.06, 0.04, 0.035, (math.cos(a) * 0.075, 0.13, math.sin(a) * 0.075), r=0.0, ry=a + 0.4, rz=0.2 * math.sin(i * 2.1)), soft('#3a3036' if i % 3 else '#4a3a38', 0.2), 'coals')
    for i in range(11):
        a = i / 11 * TAU + 0.3; rr = 0.025 + 0.075 * (0.5 + 0.5 * math.sin(i * 2.7))
        add(sph(0.014 + 0.006 * (i % 3) / 2, (math.cos(a) * rr, 0.148 + 0.008 * (i % 2), math.sin(a) * rr), K=5, J=3), flat(('#ff7a2a', '#ffb040', '#ff5a1a')[i % 3]), 'embers', 'hot', uvf=lambda p: (1.0, 0.0))
    for (a, c) in ((0.5, '#5a3e30'), (-0.6, '#6a4836')):
        add(cyl(0.032, 0.034, 0.27, (0, 0.165, 0), K=7, rz=PI / 2, ry=a, bev=0.01), lambda p, n, c=c: mix(c, '#ff7a3a', clamp(-n.z) * 0.6), 'logs')
    flame((0.0, 0.17, 0.0), 0.25, 0.075, '#e8401a', '#ffa030')
    flame((0.06, 0.17, 0.03), 0.16, 0.05, '#ee4a1a', '#ffb040')
    flame((-0.055, 0.17, -0.035), 0.18, 0.05, '#ee4a1a', '#ffb040')
    flame((0.0, 0.18, 0.035), 0.12, 0.036, '#ffb030', '#ffe890')
    for s in (-1, 1): add(gpipe((0.2 + s * 0.012, 0.11, 0.2), (0.27 + s * 0.016, 0.33, 0.27), 0.0065, K=5), lac(IRON), 'tongs')
    for (x, y, ry) in ((0.39, 0.17, 0.05), (0.45, 0.17, -0.06), (0.42, 0.222, 0.02)):
        add(cyl(0.03, 0.03, 0.3, (x, y, -0.05), K=7, rx=PI / 2, ry=ry, bev=0.008), lambda p, n: '#f0d8b0' if abs(n.y) > 0.8 else mix('#8a6a4a', '#a8805a', clamp(n.z + 0.5)), 'logs')
    # three little fish grilling on skewers stuck in the ash
    for k in range(3):
        a = k / 3 * TAU + 0.9
        A_ = Vector((math.cos(a) * 0.27, 0.11, math.sin(a) * 0.27)); B_ = Vector((math.cos(a) * 0.15, 0.36, math.sin(a) * 0.15))
        add(gpipe(tuple(A_), tuple(B_), 0.0055, K=4), wood('#e8c890'), 'skewers')
        d = (B_ - A_).normalized(); c = A_.lerp(B_, 0.72)
        q = Vector((0, 1, 0)).rotation_difference(d)
        with atM(Matrix.Translation(c) @ q.to_matrix().to_4x4()):
            add(sph(1.0, (0, 0, 0), sc=(0.022, 0.058, 0.013), K=8, J=5), lambda p, n: mix('#c8a888', '#7a6a5a', clamp(n.z * 0.6 + 0.2)), 'fish')
            add(fan_shape([(0.0, 0.0), (0.024, -0.03), (0.0, -0.022), (-0.024, -0.03)], (0, -0.054, 0), sc=1.0, T=0.005, centre=(0.0, -0.016)), soft('#a88a6a'), 'fish')
            for s in (-1, 1): add(sph(0.0055, (s * 0.012, 0.035, 0.008), K=4, J=2), flat('#3a2a30'), 'fish')
    # a lashed bamboo tripod over the hearth carries the jizai-kagi: bamboo pole, carp lever, iron hook, kettle
    apex = Vector((0, 1.12, 0))
    for (x, z) in ((-0.42, -0.42), (0.42, -0.42), (-0.42, 0.42)):
        foot = Vector((x, 0.14, z)); d = (apex - foot).normalized()
        bamboo_pole(tuple(foot), tuple(apex + d * 0.09), 0.034, 4)
        add(sph(0.042, (x, 0.146, z), sc=(1, 0.5, 1), K=8, J=3), wood('#8a7440'), 'bamboo')
    for (y, r) in ((1.07, 0.058), (1.1, 0.062), (1.13, 0.056)):
        add(gloopc([(r * math.cos(TAU * i / 12), y, r * math.sin(TAU * i / 12)) for i in range(12)], 0.014, K=5), soft('#d8b878', 0.2), 'rope')
    add(gtube([(0.05, 1.08, 0.03), (0.09, 1.0, 0.05), (0.1, 0.93, 0.05)], lambda s: 0.011 - s * 0.004, K=5), soft('#d8b878', 0.2), 'rope')
    bamboo_pole((0, 0.47, 0), (0, 1.07, 0), 0.024, 3, c='#c8c070', nodeC='#9a9a48')
    # the carp lever (wooden fish) on the pole
    with at((0, 0.86, 0), ry=0.5):
        def scale_c(cen, fn): return '#a8784e' if (int((cen.x + 1) * 60) + int((cen.z + 1) * 60)) % 2 else '#946640'
        t = facet(ellipsoid(Vector((0, 0, 0)), (0.12, 0.028, 0.045), K=12, J=6), scale_c); t.xform(F.m)
        add(t, fsh(0.16, 0.3), 'carp')
        add(fan_shape([(0.0, 0.0), (-0.07, 0.05), (-0.055, 0.0), (-0.07, -0.05)], (-0.1, 0, 0), sc=1.0, T=0.008, centre=(-0.04, 0.0)), wood('#946640'), 'carp')
        add(fan_shape([(-0.03, 0.0), (0.0, 0.035), (0.025, 0.0)], (-0.01, 0.042, 0), sc=1.0, T=0.006, centre=(0.0, 0.012)), wood('#946640'), 'carp')
        for s in (-1, 1): add(sph(0.009, (0.085, 0.012, s * 0.024), K=5, J=3), flat('#2a2230'), 'carp')
    add(gtube(catmull([(0, 0.48, 0), (0, 0.46, 0.0), (0.018, 0.448, 0), (0.0, 0.434, 0)], 7), 0.0085, K=5), lac(IRON), 'hook')
    # the kettle, sitting high enough over the fire
    with at((0, 0.31, 0), s=1.25):
        prof = [(0.0, 0.0), (0.07, 0.0), (0.105, 0.03), (0.115, 0.07), (0.1, 0.11), (0.06, 0.13), (0.0, 0.13)]
        def arare(cen, fn):
            k = angle_k(cen, 16, PI / 16); j = int(cen.z / 0.022)
            return '#5e524c' if (k + j) % 2 else '#4a3e3a'
        t = facet(lathe(prof, 16, th0=PI / 16), arare); t.xform(F.m)
        add(t, fsh(0.2, 0.3, sheen=0.25), 'kettle')
        add(glathe([(0.0, 0.125), (0.052, 0.125), (0.046, 0.138), (0.0, 0.143)], K=12), lac('#54484a'), 'kettle')
        add(sph(0.015, (0, 0.15, 0), K=6, J=3), lac(GOLD), 'kettle')
        add(gtube([(0.09, 0.06, 0), (0.13, 0.08, 0.0), (0.15, 0.112, 0.0)], lambda s: 0.016 - s * 0.007, K=6, caps=False), lac('#4a3e3a'), 'kettle')
        add(gtube([(0.0, 0.11 + 0.09 * math.sin(PI * i / 10), 0.09 * math.cos(PI * i / 10)) for i in range(11)], 0.0075, K=4), lac('#2e2c34'), 'kettle')

# ================================================================== Fox Statue (floor, 0.5 x 0.5, h 0.8)
def build_foxStatue():
    new_asset()
    add(rb(0.46, 0.085, 0.42, (0, 0.0425, 0), r=0.03), stone('#bcb4ae', seed=1), 'plinth')
    moss = lambda p, n: mix('#5a8a44', '#a8d070', clamp(n.z * 0.7 + 0.2))
    for k, (x, z, s) in enumerate(((-0.2, 0.18, 1.0), (0.205, 0.17, 0.8), (0.19, -0.18, 0.9), (-0.2, -0.17, 0.7), (-0.06, 0.2, 0.55))):
        for j in range(2):
            a = j * 2.1 + k
            add(lumpy(0.024 * s * (1.0 - 0.25 * j), (x + math.cos(a) * 0.022 * s * (j > 0), 0.083 - 0.004 * j, z + math.sin(a) * 0.018 * s * (j > 0)), amp=0.3, sc=(1.2, 0.6, 1), K=6, J=3, seed=k * 3 + j, f=8.0), moss, 'moss')
    add(rb(0.37, 0.125, 0.33, (0, 0.1475, 0), r=0.035), stone('#cdc6be', seed=2), 'plinth')
    # the carved cartouche on the front: a raised frame round a sunk panel, a gilded flaming jewel (hoju)
    fz = 0.165
    for (w, h, x, y) in ((0.27, 0.014, 0, 0.18), (0.27, 0.014, 0, 0.1155), (0.014, 0.078, -0.128, 0.148), (0.014, 0.078, 0.128, 0.148)):
        add(rb(w, h, 0.012, (x, y, fz), r=0.005), stone('#d8d2ca', seed=3), 'cartouche')
    add(rb(0.24, 0.054, 0.004, (0, 0.148, fz - 0.001), r=0.0015), stone('#aea69e', seed=4), 'cartouche')
    gild = lambda p, n: mix('#d8a848', '#fff0b0', clamp(n.z * 0.5 - n.y * 0.4))
    with at((0, 0.148, fz + 0.002)):
        jw = [(0.0, -0.022), (0.02, -0.018), (0.027, -0.004), (0.022, 0.01), (0.011, 0.018), (0.0, 0.032), (-0.011, 0.018), (-0.022, 0.01), (-0.027, -0.004), (-0.02, -0.018)]
        add(puffy(jw, 0.006, bev=0.003), gild, 'jewel')
        for s in (-1, 1): add(ribbon2d([(s * 0.03, -0.018), (s * 0.04, -0.004), (s * 0.05, 0.012)], lambda q: 0.006 * (1 - 0.6 * q), 0.004, 0.0, n=5), gild, 'jewel')
    add(rb(0.34, 0.03, 0.3, (0, 0.225, 0), r=0.012), stone('#d8d2ca', seed=5), 'plinth')
    PT = 0.24
    with at((0, PT, -0.012)):
        lo = local_of()
        tipP = Vector((0.04, 0.41, -0.12)); chestP = Vector((0, 0.22, 0.09))
        def fs(p, n):
            q = lo(p)
            c = stone('#cbc3b9', seed=6, f=20.0)(p, n)
            c = mix(c, '#f6f2ec', clamp(1 - (q - tipP).length / 0.085) * 0.9)
            return mix(c, '#f6f2ec', clamp(1 - (q - chestP).length / 0.08) * 0.45)
        add(sph(1.0, (0, 0.15, -0.02), sc=(0.1, 0.152, 0.095), K=12, J=7), fs, 'fox')
        add(sph(1.0, (0, 0.208, 0.046), sc=(0.078, 0.094, 0.068), K=10, J=6), fs, 'fox')
        for s in (-1, 1):
            add(sph(1.0, (s * 0.07, 0.075, -0.03), sc=(0.066, 0.076, 0.096), K=10, J=6), fs, 'fox')
            add(gtube([(s * 0.042, 0.215, 0.06), (s * 0.045, 0.12, 0.074), (s * 0.047, 0.035, 0.086)], lambda q: 0.03 - 0.004 * q, K=8), fs, 'fox')
            add(sph(1.0, (s * 0.047, 0.02, 0.1), sc=(0.032, 0.022, 0.04), K=7, J=3), fs, 'fox')
            add(sph(1.0, (s * 0.092, 0.018, 0.054), sc=(0.034, 0.02, 0.05), K=7, J=3), fs, 'fox')
            add(sph(1.0, (s * 0.05, 0.346, 0.046), sc=(0.046, 0.036, 0.046), K=7, J=4), fs, 'fox')
            with at((s * 0.046, 0.408, 0.012), rz=-s * 0.24, rx=-0.1, s=(1, 1, 0.5)):
                add(glathe([(0.0, 0.0), (0.037, 0.0), (0.03, 0.05), (0.014, 0.1), (0.0, 0.124)], K=8), fs, 'ears')
            with at((s * 0.05, 0.418, 0.024), rz=-s * 0.24, rx=-0.1, s=(1, 1, 0.3)):
                add(glathe([(0.0, 0.0), (0.024, 0.0), (0.018, 0.04), (0.0, 0.085)], K=6), flat('#e8806e'), 'ears')
        add(gtube([(0, 0.25, 0.005), (0, 0.3, 0.016), (0, 0.335, 0.025)], 0.06, K=10), fs, 'fox')
        add(sph(1.0, (0, 0.372, 0.026), sc=(0.082, 0.072, 0.078), K=12, J=7), fs, 'head')
        add(gtube([(0, 0.366, 0.06), (0, 0.36, 0.11), (0, 0.352, 0.152)], lambda q: 0.044 - 0.022 * q, K=8), fs, 'head')
        add(gtube(catmull([(0, 0.06, -0.1), (0.05, 0.1, -0.168), (0.074, 0.2, -0.19), (0.064, 0.32, -0.162), (0.034, 0.42, -0.112)], 10),
                  lambda q: 0.04 + 0.03 * math.sin(PI * min(1.0, q * 1.5)) - 0.03 * q if q < 0.92 else 0.012, K=9), fs, 'tail')
        # slit eyes with red kitsune liner, red maro brows, the nose
        for s in (-1, 1):
            add(sph(1.0, (s * 0.033, 0.388, 0.094), sc=(0.016, 0.0055, 0.006), K=6, J=3, rz=s * 0.38), flat(INK), 'face')
            add(gtube([(s * 0.014, 0.396, 0.098), (s * 0.034, 0.403, 0.093), (s * 0.056, 0.416, 0.08)], lambda q: 0.0052 - 0.003 * q, K=4), flat('#d8382e'), 'face')
            add(sph(1.0, (s * 0.028, 0.426, 0.092), sc=(0.009, 0.006, 0.005), K=6, J=2, rz=s * 0.2), flat('#d8382e'), 'face')
        add(sph(1.0, (0, 0.358, 0.168), sc=(0.0155, 0.0115, 0.013), K=7, J=4), lac(INK, hi='#6a5a64'), 'face')
        # the red bib on the chest (cloth), its pale hem and the red cord round the neck
        C = Vector((0, 0.208, 0.046)); Rr = Vector((0.078, 0.094, 0.068))
        def onchest(u, v, k=1.08):
            d = Vector((math.sin(u) * math.cos(v), math.sin(v), math.cos(u) * math.cos(v)))
            return F.W(tuple(C + Vector((d.x * Rr.x, d.y * Rr.y, d.z * Rr.z)) * k))
        vmin, vmax, NU, NV = -0.55, 0.85, 6, 6
        t = Tmp(); ids = []
        for j in range(NV + 1):
            v = vmax - (vmax - vmin) * j / NV; half = 1.05 * (1 - j / NV) ** 0.75 + 0.06
            ids.append([t.vert(onchest(-half + 2 * half * i / NU, v)) for i in range(NU + 1)])
        nf = F.N((0, 0, 1))
        for j in range(NV):
            for i in range(NU):
                t.face([ids[j][i], ids[j + 1][i], ids[j + 1][i + 1], ids[j][i + 1]], nf)
        lo2 = local_of()
        def bibc(p, n):
            q = lo2(p); edge = (q.y - (C.y + Rr.y * math.sin(vmin))) / (Rr.y * (math.sin(vmax) - math.sin(vmin)))
            c = mix('#e2483c', '#ff7a62', clamp(n.z * 0.4 + 0.1) * 0.4)
            return c
        add_open(t, bibc, 'bib', 'cloth')
        hem = [onchest(-(1.05 * (1 - j / NV) ** 0.75 + 0.06) * 0.98, vmax - (vmax - vmin) * j / NV, 1.1) for j in range(NV + 1)]
        hem += [onchest((1.05 * (1 - j / NV) ** 0.75 + 0.06) * 0.98, vmax - (vmax - vmin) * j / NV, 1.1) for j in range(NV, -1, -1)]
        add(tube(hem, lambda q: 0.0045, K=4, caps=False), soft('#fff0d8', 0.15), 'bib', 'cloth')
        add(gloopc([(0.064 * math.cos(TAU * i / 16), 0.3 + 0.012 * math.sin(TAU * i / 16), 0.016 + 0.064 * math.sin(TAU * i / 16)) for i in range(16)], 0.0085, K=5), soft('#c8323a', 0.2), 'bib')
        # the granary key held crossways in its mouth
        with at((0, 0.343, 0.132)):
            add(gpipe((-0.075, 0, 0), (0.075, 0, 0), 0.0065, K=5), lac(GOLD), 'key')
            add(gloopc([(-0.097 + 0.02 * math.cos(TAU * i / 10), 0.02 * math.sin(TAU * i / 10), 0.0) for i in range(10)], 0.0068, K=4), lac(GOLD), 'key')
            for (x, h) in ((0.058, 0.024), (0.071, 0.016)): add(rb(0.011, h, 0.012, (x, -h / 2, 0), r=0.002), lac(GOLD), 'key')
            add(sph(0.01, (-0.071, 0, 0), sc=(1.3, 1, 1), K=6, J=3), lac('#ffd870'), 'key')

# ================================================================== Bamboo Planter (floor, 0.5 x 0.5, h 1.7)
def bamboo_leaf(base, az, el, L, W, droop, tone, tag='bambooleaves'):
    P = arc_path(base, az, el, el - droop, L, 4)
    wf = lambda s: W * max(0.1, math.sin(PI * (0.1 + 0.9 * s ** 0.8)) ** 0.6)
    add(leaf_strip(P, wf, th=0.0055, side=left_of(az), curl=0.25, cfn=gcol(tone, '#b8e078', 0.6)), fsh(0.2, 0.32), tag, 'leaf')

def build_bambooPlanter():
    new_asset()
    K = 16; th0 = PI / K
    pot = [(0.0, 0.0), (0.122, 0.0), (0.136, 0.006), (0.142, 0.02), (0.148, 0.034), (0.156, 0.046), (0.164, 0.058), (0.174, 0.072), (0.186, 0.1), (0.195, 0.14),
           (0.193, 0.18), (0.182, 0.212), (0.17, 0.232), (0.178, 0.242), (0.186, 0.252), (0.18, 0.262), (0.164, 0.258), (0.158, 0.246), (0.0, 0.246)]
    glazeY = lambda a: 0.052 + 0.011 * math.sin(a * 5) + 0.006 * math.sin(a * 11 + 1)
    def pc(cen, fn):
        a = math.atan2(cen.y, cen.x) + PI / 2; rr = math.hypot(cen.x, cen.y); z = cen.z
        if z > 0.244 and rr < 0.16 and fn.z > 0.5: return '#6a4e3e'
        if z < glazeY(a): return '#d8a27a'
        c = mix('#3f9a8a', '#9adcc8', clamp((z - 0.05) / 0.2) * 0.8)
        return mul(c, 0.82) if z < glazeY(a) + 0.014 else c
    t = facet(lathe(pot, K, th0=th0), pc); t.xform(F.m)
    add(t, fsh(0.16, 0.3, sheen=0.4), 'pot')
    add(gloopc([(0.173 * math.cos(TAU * i / 22), 0.232, 0.173 * math.sin(TAU * i / 22)) for i in range(22)], 0.0075, K=4), lac(GOLD), 'cord')
    # the red lucky bow on the cord
    with at((0.07, 0.226, 0.16), ry=0.42):
        for s in (-1, 1):
            add(sph(1.0, (s * 0.03, 0.006, 0.006), sc=(0.032, 0.02, 0.012), K=7, J=3, rz=s * 0.35), lac('#e8403a'), 'bow')
            add(gtube([(s * 0.006, -0.004, 0.01), (s * 0.016, -0.03, 0.012), (s * 0.022, -0.055, 0.008)], lambda q: 0.009 - 0.003 * q, K=4), lac('#e8403a'), 'bow')
        add(sph(0.011, (0, 0.002, 0.012), K=6, J=3), lac('#c8302a'), 'bow')
    peb = ['#f4f0e8', '#e2dcd4', '#d0c8c2', '#fffaf2', '#c8c0c8']
    for i in range(11):
        a = i * 2.39996; rr = 0.035 + math.sqrt((i + 0.5) / 11) * 0.105; s = 0.019 + 0.008 * (0.5 + 0.5 * math.sin(i * 1.7))
        add(lumpy(s, (math.sin(a) * rr, 0.248, math.cos(a) * rr), amp=0.1, sc=(1.25, 0.55, 1), K=5, J=3, seed=i), stone(peb[i % 5], nz=0.03), 'pebbles')
    # three fat stalks of different heights leaning apart (a little grove), crowned with arching leaf sprays
    stalks = [(-0.058, -0.045, 1.54, 0.056, (-0.05, -0.03), 5), (0.07, -0.035, 1.22, 0.052, (0.06, -0.035), 4), (-0.008, 0.072, 0.9, 0.048, (0.0, 0.07), 3)]
    tones = ['#4f9a44', '#5aae4a', '#68b850', '#3f8a3a']
    for si, (x, z, H, r, (lx, lz), nodes) in enumerate(stalks):
        L = H - 0.27
        prof = bamboo_prof(L, r, nodes)
        t = facet(lathe(prof, 7, th0=PI / 7, off=lambda zz, lx=lx, lz=lz: (lx * zz, -lz * zz)), bamboo_col(L, r, nodes, c='#78b44c', nodeC='#4f8a34', cut='#d8eca0'))
        t.xform(F.m @ lm((x, 0.24, z)))
        add(t, fsh(0.18, 0.3, sheen=0.25), 'stalks')
        at_ = lambda y: (x + lx * y, 0.24 + y, z + lz * y)
        az0 = math.atan2(lx, lz); tp = at_(L + 0.01)
        for k in range(8):
            a = az0 + k * TAU / 8 + 0.3 + 0.15 * math.sin(k * 2.3 + si)
            bamboo_leaf(tp, a, 0.55 + 0.15 * math.sin(k * 1.7), 0.25 + 0.03 * math.sin(k * 2.9 + si), 0.038, 1.2, tones[(k + si) % 4])
        for k in range(4):
            a = az0 + (k + 0.5) * TAU / 4 + 0.6
            bamboo_leaf((tp[0], tp[1] + 0.02, tp[2]), a, 1.15, 0.19, 0.034, 0.7, tones[(k + si + 1) % 4])
        for kk in range(1, min(3, nodes)):
            y = L - kk * L / nodes; s = 1 if kk % 2 else -1
            for j in range(2):
                bamboo_leaf(at_(y), az0 + s * 1.4 + (j - 0.5) * 0.6, 0.45 - 0.1 * j, 0.21, 0.034, 1.0, tones[(j + kk) % 4])
            add(gpipe(at_(y), (at_(y)[0] + math.sin(az0 + s * 1.4) * 0.03, at_(y)[1] + 0.012, at_(y)[2] + math.cos(az0 + s * 1.4) * 0.03), 0.006, K=4), soft('#5a9a3a'), 'stalks')

# ================================================================== Hanging Planter (ceiling, 0.5 x 0.5, h 0.8)
def build_hangingPlanter():
    new_asset()
    top = 0.8; rope = '#efe0bc'
    ropeP = lambda p, n: mul(rope, 0.86 + 0.14 * (0.5 + 0.5 * math.sin(p.z * 260 + math.atan2(n.y, n.x) * 2)))
    add(gl_lathe([(0.0, top - 0.026), (0.05, top - 0.026), (0.062, top - 0.021), (0.068, top - 0.01), (0.07, top), (0.0, top)], 16), wood('#c8915c', hi='#e8b888'), 'mount')
    for s in (-1, 1): add(sph(0.0075, (s * 0.042, top - 0.027, 0), sc=(1, 0.45, 1), K=6, J=2), lac(GOLD), 'mount')
    add(cyl(0.006, 0.006, 0.02, (0, top - 0.036, 0), K=6), lac('#d8a840'), 'mount')
    add(gloopc([(0.014 * math.cos(TAU * i / 10), top - 0.06 + 0.014 * math.sin(TAU * i / 10), 0.0) for i in range(10)], 0.005, K=4), lac('#d8a840'), 'mount')
    add(gloopc([(0.0, top - 0.08 + 0.013 * math.sin(TAU * i / 10), 0.013 * math.cos(TAU * i / 10)) for i in range(10)], 0.0058, K=4), ropeP, 'rope')
    kY = top - 0.13
    add(gl_lathe([(0.0, kY - 0.026), (0.012, kY - 0.026), (0.02, kY - 0.016), (0.021, kY + 0.016), (0.014, kY + 0.03), (0.007, kY + 0.04), (0.0, kY + 0.042)], 10,
                 colfn=lambda c, fn: '#e2cfa4' if int((c.z - kY + 0.03) / 0.009) % 2 else rope), fsh(0.14, 0.26), 'rope')
    yR, Rr, yB = 0.34, 0.152, 0.2
    for a in (PI / 3, PI, 5 * PI / 3):
        dx, dz = math.sin(a), math.cos(a)
        A_ = Vector((dx * 0.012, kY - 0.026, dz * 0.012)); B_ = Vector((dx * (Rr + 0.006), yR + 0.004, dz * (Rr + 0.006)))
        pts = [tuple(A_.lerp(B_, i / 4)) for i in range(5)] + [(dx * 0.164, 0.3, dz * 0.164), (dx * 0.15, 0.25, dz * 0.15), (dx * 0.115, 0.214, dz * 0.115), (dx * 0.05, 0.19, dz * 0.05), (dx * 0.012, 0.176, dz * 0.012)]
        add(gtube(catmull(pts, 12), 0.0062, K=4), ropeP, 'rope')
        for t_ in (0.42, 0.68):
            q = A_.lerp(B_, t_); add(sph(0.012, tuple(q), sc=(1, 1.25, 1), K=5, J=3), ropeP, 'rope')
    add(cyl(0.017, 0.015, 0.03, (0, 0.165, 0), K=10), lambda p, n: '#e6d4ac' if math.sin(p.z * 600) > 0 else rope, 'tassel')
    add(gl_lathe([(0.012, 0.153), (0.024, 0.13), (0.03, 0.08), (0.032, 0.035), (0.026, 0.016), (0.012, 0.004), (0.0, 0.0)], 12,
                 colfn=lambda c, fn: '#f4e8cc' if angle_k(c, 12, PI / 12) % 2 else '#e2cfa4'), fsh(0.12, 0.28), 'tassel')
    # the woven basket: a checker weave, darker inside, a fat braided rim, soil
    bp = [(0.0, yB), (0.07, yB), (0.096, yB + 0.005), (0.12, yB + 0.02), (0.138, yB + 0.048), (0.148, yB + 0.075), (0.152, yB + 0.105), (0.152, yR), (0.14, yR), (0.14, yB + 0.11), (0.0, yB + 0.11)]
    def weave(c, fn):
        rr = math.hypot(c.x, c.y)
        if rr < 0.145 and c.z > yB + 0.1 and (fn.x * c.x + fn.y * c.y) < 0: return '#9a7448'
        k = angle_k(c, 22, PI / 22); j = int((c.z - yB) / 0.024)
        return mul('#e8c890' if (k + j) % 2 else '#c9a066', 0.92 + 0.08 * min(1, (c.z - yB) / 0.14))
    add(gl_lathe(bp, 22, colfn=weave), fsh(0.14, 0.3), 'basket')
    add(gloopc([(0.15 * math.cos(TAU * i / 22), yR + 0.004, 0.15 * math.sin(TAU * i / 22)) for i in range(22)], 0.0125, K=5),
        lambda p, n: mul('#f0d8a0' if int((math.atan2(p.y, p.x) / TAU + 1) * 44 + (0.5 if n.z > 0 else 0)) % 2 else '#d4b070', 1.0), 'basket')
    add(gl_lathe([(0.0, yR - 0.012), (0.142, yR - 0.012), (0.142, yR - 0.004), (0.0, yR - 0.004)], 16), soft('#5a3e30', 0.15), 'soil')
    # the ivy: a leafy mound in the basket and seven vines spilling over the rim
    greens = ['#3f8a44', '#4f9a4c', '#5aa856', '#3a7a40', '#68b45e']
    def ivy(base, az, el, L, ci, droop=0.3, tag='ivy'):
        P = arc_path(base, az, el, el - droop, L, 3)
        wf = lambda s: L * 0.55 * (0.55 + 0.45 * math.sin(PI * min(1.0, s * 1.6))) * (1 - s * 0.55) if s < 0.95 else 0.004
        add(leaf_strip(P, wf, th=0.005, side=left_of(az), curl=0.18, cfn=gcol(greens[ci % 5], '#a8d888', 0.4)), fsh(0.2, 0.32), tag, 'leaf')
    for i in range(20):
        a = i * 2.39996; rr = 0.015 + (i % 3) * 0.045
        ivy((math.sin(a) * rr, yR - 0.004 + 0.02 - rr * 0.1, math.cos(a) * rr), a, 0.9 - rr * 5, 0.075 + (i % 4) * 0.008, i, droop=0.5)
    for v in range(7):
        a = v / 7 * TAU + 0.35; dx, dz = math.sin(a), math.cos(a)
        yEnd = (0.02, 0.15, 0.06, 0.2, 0.09, 0.12, 0.04)[v]; sw = (1 if v % 2 else -1) * 0.02
        P0 = [(dx * 0.09, yR, dz * 0.09), (dx * 0.15, yR + 0.025, dz * 0.15), (dx * 0.178, yR - 0.01, dz * 0.178), (dx * 0.186 + dz * sw, (yR + yEnd) / 2, dz * 0.186 - dx * sw), (dx * 0.19 - dz * sw * 0.5, yEnd, dz * 0.19 + dx * sw * 0.5)]
        C = catmull(P0, 7)
        add(gtube(C, 0.0052, K=3), soft('#4a7a34', 0.2), 'vines', 'leaf')
        C2 = catmull(P0, 21); nL = int(round(3 + (yR - yEnd) * 12))
        for i in range(1, nL + 1):
            u = 0.18 + 0.82 * i / nL; q = C2[min(20, int(u * 20))]; side = 1 if i % 2 else -1
            ivy((q[0] + dx * 0.006, q[1], q[2] + dz * 0.006), a + side * 0.9, -0.35, 0.062 - u * 0.016, i + v, droop=0.25, tag='vineleaf')

# ================================================================== Fish Tank (floor, 1 x 0.5, h 1)
def goldfish(pos, s=1.0, ry=0.0, c0='#f05a2a', c1='#ffb060'):
    with at(pos, ry=ry, s=s):
        add(sph(1.0, (0, 0, 0), sc=(0.042, 0.032, 0.021), K=10, J=5), lambda p, n: mix(c0, c1, clamp(n.z * 0.5 + 0.3)), 'fish')
        add(fan_shape([(0.0, 0.0), (0.032, 0.034), (0.022, 0.0), (0.032, -0.03)], (0.036, 0.0, 0.0), sc=1.0, T=0.006, centre=(0.016, 0.0)), lac('#ff7a3a', hi='#ffc890'), 'fish')
        add(fan_shape([(-0.016, 0.0), (0.0, 0.026), (0.018, 0.004)], (0.0, 0.026, 0.0), sc=1.0, T=0.005, centre=(0.0, 0.01)), lac('#ff8a4a'), 'fish')
        for sz in (-1, 1):
            add(fan_shape([(0.0, 0.0), (0.012, -0.016), (-0.006, -0.012)], (-0.008, -0.012, sz * 0.016), sc=1.0, T=0.004, centre=(0.002, -0.009)), lac('#ff8a4a'), 'fish')
            add(sph(0.0075, (-0.026, 0.008, sz * 0.014), K=5, J=3), flat('#fffaf2'), 'fish')
            add(sph(0.0045, (-0.03, 0.008, sz * 0.0175), K=4, J=2), flat('#2a2230'), 'fish')

def build_fishTank():
    new_asset()
    stand, trim, blue = '#8fc8d8', '#fff3e0', '#5a86b0'
    add(rb(0.94, 0.46, 0.41, (0, 0.23, -0.005), r=0.04), soft(stand, 0.12, 0.3), 'stand')
    for sx in (-1, 1):
        add(rb(0.41, 0.34, 0.022, (sx * 0.22, 0.23, 0.2), r=0.014), soft(trim, 0.1, 0.25), 'stand')
        add(rb(0.33, 0.26, 0.01, (sx * 0.22, 0.23, 0.212), r=0.006), soft(mix(trim, stand, 0.25), 0.1, 0.25), 'stand')
        add(sph(0.024, (sx * 0.05, 0.26, 0.222), sc=(1, 0.9, 0.55), K=8, J=4), lac('#ff9eb0'), 'stand')
    add(rb(0.95, 0.04, 0.44, (0, 0.48, 0), r=0.015), soft(trim, 0.1, 0.25), 'stand')
    tw, td, y0, y1 = 0.92, 0.4, 0.5, 0.94
    add(rb(tw, 0.035, td, (0, y0 + 0.0175, 0), r=0.01), lac(blue), 'frame')
    for sx in (-1, 1):
        for sz in (-1, 1): add(cbeam(0.026, y1 - y0, 0.026, (sx * (tw / 2 - 0.013), (y0 + y1) / 2, sz * (td / 2 - 0.013)), c=0.006), lac('#cfefff', hi='#ffffff'), 'glass')
    for sz in (-1, 1): add(cbeam(tw, 0.026, 0.026, (0, y1 - 0.013, sz * (td / 2 - 0.013)), c=0.006), lac(blue), 'frame')
    for sx in (-1, 1): add(cbeam(0.026, 0.026, td - 0.052, (sx * (tw / 2 - 0.013), y1 - 0.013, 0), c=0.006), lac(blue), 'frame')
    lo = local_of()
    add(box(tw - 0.04, y1 - y0 - 0.04, 0.012, (0, (y0 + y1) / 2, -td / 2 + 0.014), r=0.0, extra=(0, 0, 4)), lambda p, n: mix('#3a8ac0', '#a8e4f4', clamp((lo(p).y - y0) / (y1 - y0))), 'back', 'glow')
    add(rb(tw - 0.03, 0.036, td - 0.03, (0, y0 + 0.052, 0), r=0.012), soft('#f0dca8', 0.15), 'sand')
    gy = y0 + 0.07; peb = ['#ffb0c8', '#fffaf2', '#a8d8ff', '#ffe08a', '#c8e8c0']
    for i in range(16):
        x = -0.4 + 0.8 * ((i * 0.618) % 1.0); z = -0.15 + 0.3 * ((i * 0.382 + 0.2) % 1.0)
        if x < -0.17 and z < 0.02: continue
        add(lumpy(0.016 + 0.005 * (i % 3) / 2, (x, gy - 0.002, z), amp=0.1, sc=(1.2, 0.6, 1), K=6, J=3, seed=i), soft(peb[i % 5], 0.2), 'pebbles')
    # a little pink-roofed castle
    with at((-0.26, gy, -0.08), ry=0.3):
        add(cyl(0.05, 0.055, 0.15, (0, 0.075, 0), K=12), stone('#e8dcf4', nz=0.03), 'castle')
        add(glathe([(0.0, 0.0), (0.068, 0.0), (0.0, 0.085)], K=12, pos=(0, 0.15, 0)), lac('#ff9eb0'), 'castle')
        for sx in (-1, 1):
            add(cyl(0.032, 0.035, 0.1, (sx * 0.075, 0.05, 0.01), K=10), stone('#e0d4ee', nz=0.03), 'castle')
            add(glathe([(0.0, 0.0), (0.046, 0.0), (0.0, 0.065)], K=10, pos=(sx * 0.075, 0.1, 0.01)), lac('#ff8fb0'), 'castle')
        add(rb(0.14, 0.07, 0.05, (0, 0.035, 0.03), r=0.01), stone('#e8dcf4', nz=0.03), 'castle')
        with at((0, 0.0, 0.0555)): add(puffy([(-0.02, 0.0), (0.02, 0.0), (0.02, 0.03), (0.014, 0.044), (0.0, 0.05), (-0.014, 0.044), (-0.02, 0.03)], 0.004, bev=0.002), flat('#5a4a6a'), 'castle')
        for y in (0.09, 0.115): add(dot(0.009, (0, y, 0.05), sc=(1, 1.3, 0.4), K=6), flat('#5a4a6a'), 'castle')
        add(gpipe((0, 0.23, 0), (0, 0.29, 0), 0.0045, K=4), flat(INK), 'castle')
        add(fan_shape([(0.0, 0.0), (0.04, -0.012), (0.0, -0.024)], (0.003, 0.29, 0), sc=1.0, T=0.004, centre=(0.012, -0.012)), lac('#ffd24a'), 'castle')
    # waving vallisneria at the back right
    for i in range(8):
        a = i * 2.4; x = 0.27 + 0.05 * math.sin(i * 1.7); z = -0.09 + 0.04 * math.cos(i * 2.3)
        h = 0.22 + 0.09 * (0.5 + 0.5 * math.sin(i * 3.1))
        P = arc_path((x, gy - 0.01, z), a, 1.5, 0.95 + 0.3 * math.sin(i), h, 6)
        add(leaf_strip(P, lambda s: 0.012 * (1 - 0.6 * s), th=0.004, side=left_of(a), curl=0.2, cfn=lambda s, e: mix('#4fa050', '#9ad870', s)), fsh(0.2, 0.3), 'weed', 'leaf')
    goldfish((-0.06, 0.76, 0.07), 1.25, 0.25)
    goldfish((0.18, 0.67, 0.0), 1.0, 2.9, c0='#ff7a2a', c1='#fff0d8')
    for i in range(7): add(sph(0.0075 + i * 0.0014, (-0.16 + 0.006 * math.sin(i * 2.1), gy + 0.05 + i * 0.042, -0.04), K=6, J=3), lac('#e8fbff', hi='#ffffff'), 'bubbles')
    add(rb(tw - 0.034, 0.014, td - 0.034, (0, 0.878, 0), r=0.005), lambda p, n: mix('#7ac8e4', '#b8ecf8', clamp(n.z)), 'water', 'water')
    with at((0, 0, td / 2 - 0.004)):
        add(ribbon2d([(-0.42, 0.88), (-0.34, 0.78)], 0.009, 0.002, 0.0), flat('#ffffff'), 'glints')
        add(ribbon2d([(-0.37, 0.89), (-0.33, 0.84)], 0.006, 0.002, 0.0), flat('#ffffff'), 'glints')
    add(rb(0.4, 0.035, 0.1, (0, y1 + 0.0175, -td / 2 + 0.04), r=0.012), lac(blue), 'hood')
    add(box(0.36, 0.008, 0.07, (0, y1 - 0.002, -td / 2 + 0.04), r=0.0), flat('#e8fbff'), 'hood', 'glow')

# ================================================================== Lily Tub (floor, 1 x 1, h 0.55)
def koi(pos, s, ry, pal):
    with at(pos, ry=ry, s=s):
        lo = local_of()
        def kc(p, n):
            q = lo(p); v = vnoise(Vector((q.x * 40, q.z * 40, pal)), 1.0, pal)
            return mix('#ff6a3a', '#fff6ea', clamp((v - 0.45) * 6)) if pal else mix('#fff6ea', '#e83a2a', clamp((v - 0.5) * 6))
        add(sph(1.0, (0, 0, 0), sc=(0.05, 0.02, 0.028), K=10, J=5), kc, 'koi')
        add(fan_shape([(0.0, 0.0), (0.028, 0.026), (0.02, 0.0), (0.028, -0.026)], (-0.05, 0.0, 0.0), sc=1.0, T=0.004, rx=-PI / 2, ry=PI, centre=(0.012, 0.0)), soft('#ff8a5a' if pal else '#fff0e4', 0.2), 'koi')
        for sz in (-1, 1): add(fan_shape([(0.0, 0.0), (0.016, 0.012 * sz), (-0.004, 0.016 * sz)], (0.012, 0.0, sz * 0.016), sc=1.0, T=0.003, rx=-PI / 2, centre=(0.004, 0.009 * sz)), soft('#fff0e4', 0.15), 'koi')

def build_lilyTub():
    new_asset()
    wy = 0.455; K = 24; th0 = PI / K
    raw = [(0.0, 0.0), (0.27, 0.0), (0.296, 0.012), (0.3, 0.038), (0.292, 0.052), (0.325, 0.078), (0.388, 0.15), (0.43, 0.24), (0.452, 0.33),
           (0.461, 0.42), (0.474, 0.478), (0.481, 0.498), (0.476, 0.514), (0.462, 0.516), (0.452, 0.502), (0.444, 0.47), (0.442, 0.44), (0.0, 0.44)]
    def tc(cen, fn):
        z = cen.z; rr = math.hypot(cen.x, cen.y); out = (fn.x * cen.x + fn.y * cen.y) > 0 and z < 0.5
        if z < 0.056 and out: return '#c48a62'
        if not out and z < 0.505: return '#2c6a7c'
        if z > 0.458: return '#f4eedc'
        t = clamp((z - 0.056) / 0.42)
        c = mix('#2f5f86', '#3f8fa8', clamp(t * 1.5)); c = mix(c, '#8ccdc8', clamp(t * 1.7 - 0.8))
        if abs(z - 0.2) < 0.012 or abs(z - 0.31) < 0.01: c = mix(c, '#9ad8d4', 0.45)
        return c
    t = facet(lathe(raw, K, th0=th0), tc); t.xform(F.m)
    add(t, fsh(0.14, 0.3, sheen=0.35), 'tub')
    rf = prof_r(raw[5:11])
    glaze_skirt(rf, 0.46, 9, 0.018, 0.06, 0.06, lambda p, n: mix('#efe8d6', '#fffaf0', clamp(n.z * 0.4 - n.y * 0.3)), base_drop=0.012, n_base=14, depth=0.004, seed=2)
    add(gl_lathe([(0.0, 0.0), (0.445, 0.0), (0.445, 0.016), (0.0, 0.016)], K, pos=(0, wy - 0.016, 0)), lambda p, n: mix('#3f8ca8', '#62b0c8', clamp(n.z)), 'water', 'water')
    koi((-0.1, wy - 0.004, 0.17), 1.45, 0.5, 0)
    koi((0.11, wy - 0.004, -0.04), 1.3, 2.6, 1)
    for (x, z, r) in ((-0.02, 0.24, 0.05), (0.25, -0.1, 0.04)):
        add(gloopc([(x + r * math.cos(TAU * i / 14), wy + 0.001, z + r * math.sin(TAU * i / 14)) for i in range(14)], 0.004, K=3), flat('#cfeef2'), 'ripples')
    pads = [(-0.2, -0.13, 0.115, 0.4), (0.17, 0.18, 0.1, 2.2), (0.26, -0.2, 0.085, 4.0), (-0.06, -0.3, 0.075, 5.1), (-0.3, 0.12, 0.08, 1.2)]
    for (x, z, r, rot) in pads:
        ol = [(0.0, 0.0)] + [(r * math.cos(a), r * math.sin(a)) for a in [0.22 + (TAU - 0.44) * i / 11 for i in range(12)]]
        with at((x, wy + 0.001, z), ry=rot, rx=-PI / 2):
            lo = local_of()
            add(puffy(ol, 0.008, bev=0.004, centre=(-0.25 * r, 0.0)), lambda p, n, r=r, lo=lo: '#b86a5a' if n.z < 0.3 else mix('#4f9a44', '#86c868', clamp(1 - math.hypot(lo(p).x, lo(p).y) / r) * 0.6), 'pads')
    # a pink water lily on the big pad, and a bud
    with at((-0.2, wy + 0.01, -0.13), ry=0.3):
        for (nn, L, w, el, c0, c1, y0, r0) in ((9, 0.074, 0.024, 0.32, '#ff86ac', '#fff0f4', 0.0, 0.006), (8, 0.062, 0.021, 0.72, '#ff9cc0', '#fff4f8', 0.006, 0.004), (6, 0.046, 0.017, 1.1, '#ffb4cc', '#ffffff', 0.012, 0.002)):
            for i in range(nn):
                az = i / nn * TAU + y0 * 60
                P = arc_path((math.sin(az) * r0, y0, math.cos(az) * r0), az, el, el + 0.35, L, 3)
                add(leaf_strip(P, lambda s, w=w: w * max(0.2, math.sin(PI * (0.2 + 0.8 * s)) ** 0.5), th=0.004, side=left_of(az), curl=0.35, cfn=lambda s, e, c0=c0, c1=c1: mix(c0, c1, s ** 1.2 * 0.85)), fsh(0.12, 0.26), 'lily')
        add(sph(0.014, (0, 0.016, 0), sc=(1, 0.6, 1), K=8, J=4), soft('#f4c43a', 0.25), 'lily')
        for k in range(5):
            a = k / 5 * TAU; add(sph(0.0055, (math.sin(a) * 0.013, 0.026, math.cos(a) * 0.013), K=4, J=2), flat('#ffd24a'), 'lily')
    with at((0.2, wy, 0.04)):
        add(gtube([(0, 0, 0), (0.008, 0.025, 0.004), (0.006, 0.048, 0.0)], 0.0065, K=5), soft('#5a9a44'), 'bud')
        add(glathe([(0.0, 0.044), (0.016, 0.054), (0.018, 0.07), (0.01, 0.088), (0.0, 0.098)], K=8, pos=(0.006, 0, 0)), lambda p, n: mix('#5aa04a', '#ff8fb4', clamp((p.z - (wy + 0.058)) / 0.028)), 'bud')
    # a tiny frog on a pad
    with at((0.17, wy + 0.009, 0.18), ry=-0.5):
        add(sph(0.026, (0, 0.018, 0), sc=(1.2, 0.8, 1), K=10, J=5), lambda p, n: mix('#6cc04a', '#d4f0a0', clamp(-n.z * 0.6 + 0.1)), 'frog')
        for s in (-1, 1):
            add(sph(0.011, (s * 0.016, 0.036, 0.012), K=7, J=4), soft('#7ccc58'), 'frog')
            add(sph(0.0058, (s * 0.017, 0.039, 0.021), K=5, J=3), flat(INK), 'frog')
            add(sph(0.008, (s * 0.026, 0.004, 0.018), sc=(1, 0.5, 1.3), K=6, J=2), soft('#6cc04a'), 'frog')
            add(sph(0.006, (s * 0.024, 0.02, 0.026), sc=(1, 0.6, 0.4), K=5, J=2), flat('#ff9eb4'), 'frog')
    peb = ['#d8d0c8', '#bcb4b8', '#e8e0d4', '#a8a4b0']
    for k in range(6):
        a = k / 6 * TAU + 0.5 + 0.2 * math.sin(k * 5); r = 0.032 + 0.012 * math.sin(k * 2.1)
        add(lumpy(r, (math.sin(a) * 0.37, r * 0.68, math.cos(a) * 0.37), amp=0.1, sc=(1.25, 0.6, 1), K=8, J=4, seed=k), stone(peb[k % 4]), 'pebbles')

# ================================================================== Cypress Bucket (floor, 0.5 x 0.5, h 0.5)
def build_cypressBucket():
    new_asset()
    hin, hinD = '#f0d4a0', '#ddb880'
    for k in range(3): add(rb(0.36, 0.05, 0.084, (0, 0.235, -0.086 + k * 0.086), r=0.014), wood(mix(hin, '#fff0d0', 0.2 * (k % 2)), hi='#fff4dc', seed=k), 'stool')
    for sx in (-1, 1): add(rb(0.045, 0.215, 0.24, (sx * 0.14, 0.1075, 0), r=0.015), wood(hinD, seed=4), 'stool')
    # the wooden bucket: staves, two dark hoops, a bail handle, water and a rubber duck afloat
    with at((-0.045, 0.26, 0.0)):
        K = 14; th0 = PI / K
        prof = [(0.0, 0.0), (0.098, 0.0), (0.104, 0.01), (0.115, 0.15), (0.105, 0.152), (0.094, 0.02), (0.0, 0.02)]
        def stave(cen, fn):
            k = angle_k(cen, K, th0); c = '#f2d6a2' if k % 2 else '#e8c890'
            if (fn.x * cen.x + fn.y * cen.y) < 0 and cen.z > 0.02: c = mul(c, 0.82)
            if cen.z > 0.148: c = mix(c, '#fff0d0', 0.4)
            return c
        t = facet(lathe(prof, K, th0=th0), stave); t.xform(F.m)
        add(t, fsh(0.16, 0.3), 'bucket')
        for y in (0.035, 0.118):
            r = 0.1 + (0.115 - 0.1) * (y / 0.15) + 0.004
            add(gloopc([(r * math.cos(TAU * i / 16), y, r * math.sin(TAU * i / 16)) for i in range(16)], 0.0075, K=4), lac('#4a3a38', hi='#8a7a78'), 'hoops')
        for sx in (-1, 1): add(rb(0.03, 0.05, 0.03, (sx * 0.113, 0.15, 0), r=0.008), wood('#e8c890'), 'bucket')
        add(gtube([(-0.113, 0.17, 0.0)] + [(-0.113 * math.cos(PI * i / 8), 0.17 + 0.1 * math.sin(PI * i / 8), 0.0) for i in range(1, 8)] + [(0.113, 0.17, 0.0)], 0.009, K=5), wood('#f0cc94'), 'bucket')
        add(gl_lathe([(0.0, 0.0), (0.104, 0.0), (0.104, 0.01), (0.0, 0.01)], K, pos=(0, 0.118, 0)), lambda p, n: mix('#5ab8e0', '#a8e4f4', clamp(n.z)), 'water', 'water')
        with at((0.015, 0.128, 0.01), ry=0.5):
            add(sph(0.03, (0, 0.006, 0), sc=(1.3, 0.85, 1), K=10, J=5), lac('#ffd84a'), 'duck')
            add(sph(0.021, (0.026, 0.036, 0), K=9, J=5), lac('#ffd84a'), 'duck')
            add(glathe([(0.0, 0.0), (0.011, 0.0), (0.0, 0.022)], K=6, pos=(0.044, 0.032, 0), rz=-PI / 2), lac('#ff8a3a'), 'duck')
            for s in (-1, 1): add(sph(0.005, (0.04, 0.044, s * 0.012), K=4, J=2), flat(INK), 'duck')
            add(sph(0.012, (-0.038, 0.018, 0), sc=(1, 1.4, 0.8), K=6, J=3), lac('#ffd84a'), 'duck')
    # a folded towel over the right end, hanging down the front (cloth)
    path = [Vector((0.11, 0.1, 0.28)), Vector((0.11, -0.1, 0.285)), Vector((0.11, -0.13, 0.276)), Vector((0.11, -0.145, 0.252)), Vector((0.11, -0.148, 0.2)), Vector((0.11, -0.146, 0.15))]
    path = [Vector(p) for p in catmull([tuple(p) for p in path], 10)]
    prof = [(0.016, 0.06), (0.012, 0.066), (-0.012, 0.066), (-0.016, 0.06), (-0.016, -0.06), (-0.012, -0.066), (0.012, -0.066), (0.016, -0.06)]
    t = sweep(path, prof, up=X, cap=True, inset=0.3, cap_d=0.006)
    def towel(p, n):
        z, y = p.z, p.y
        c = '#fffaf2'
        if (y < -0.13 and (0.185 < z < 0.2 or 0.215 < z < 0.23)) or (z > 0.27 and (abs(y - 0.05) < 0.008 or abs(y + 0.05) < 0.008)): c = '#8fd0ff'
        return mul(c, 0.9 + 0.1 * clamp(n.z + 0.5))
    add(t, towel, 'towel', 'cloth')
    for y in (0.192, 0.222): add(rb(0.134, 0.012, 0.004, (0.11, y, 0.164), r=0.0015), soft('#8fd0ff', 0.1), 'towel', 'cloth')
    for dx in (-0.045, 0.045): add(rb(0.012, 0.004, 0.2, (0.11 + dx, 0.2975, -0.005), r=0.0015), soft('#8fd0ff', 0.1), 'towel', 'cloth')

# ================================================================== Taiko Drum (floor, 1 x 1, h 1)
def tomoe(r, z0, depth=0.004, col='#c8323a'):
    for k in range(3):
        a0 = PI / 2 + k * TAU / 3
        hx, hy = 0.32 * r * math.cos(a0), 0.32 * r * math.sin(a0); hr = 0.22 * r
        add(puffy([(hx + hr * math.cos(TAU * i / 11), hy + hr * math.sin(TAU * i / 11)) for i in range(11)], depth, bev=depth * 0.5, z0=z0), lac(col), 'tomoe')
        tail = []
        for i in range(7):
            s = i / 6; a = a0 - s * 2.0; rr = 0.32 * r + s * 0.5 * r
            tail.append((rr * math.cos(a) + hr * 0.55 * math.cos(a0 + PI / 2) * (1 - s), rr * math.sin(a) + hr * 0.55 * math.sin(a0 + PI / 2) * (1 - s)))
        add(ribbon2d(tail, lambda s: hr * 0.62 * (1 - s) ** 0.9 + 0.003, depth, z0), lac(col), 'tomoe')

def build_taikoDrum():
    new_asset()
    cy, LAC = 0.6, '#4a2e24'
    prof = [(0.29, -0.25), (0.315, -0.2), (0.335, -0.12), (0.342, 0.0), (0.335, 0.12), (0.315, 0.2), (0.29, 0.25)]
    K = 26; th0 = PI / K
    with at((0, cy, 0), rx=PI / 2):
        t = facet(lathe(prof, K, th0=th0), lambda c, fn: '#a0503a' if angle_k(c, K, th0) % 2 else '#904634', open_=True); t.xform(F.m)
        add_open(t, fsh(0.16, 0.3, sheen=0.25), 'body')
    for sz in (-1, 1):
        with at((0, cy, sz * 0.25), rx=sz * PI / 2):
            add(glathe([(0.3, 0.0), (0.2, 0.008), (0.0, 0.011), (0.0, -0.004), (0.3, -0.004)], K=K), lambda p, n: mix('#f4e4c4', '#d8c4a0', 0.3 * clamp(1 - abs(n.z))), 'heads')
        add(gloopc([(0.293 * math.cos(TAU * i / 24), cy + 0.293 * math.sin(TAU * i / 24), sz * 0.25) for i in range(24)], 0.018, K=4), lac('#3a2a2a'), 'rims')
        nt = 16 if sz > 0 else 12
        for k in range(nt):
            a = k / nt * TAU
            add(sph(0.015, (math.cos(a) * 0.307, cy + math.sin(a) * 0.307, sz * 0.222), sc=(1, 1, 0.7), K=4, J=2), lac('#2e2a30', hi='#7a7480'), 'tacks')
    with at((0, cy, 0.258)):
        tomoe(0.21, 0.0, 0.004)
        add(dot(0.035, (0, 0, 0.004), sc=(1, 1, 0.2), K=12), lac(GOLD), 'tomoe')
    for sx in (-1, 1):
        add(rb(0.02, 0.05, 0.05, (sx * 0.343, cy - 0.025, 0), r=0.006), lac('#4a4450'), 'rings')
        add(gloopc([(sx * 0.354, cy - 0.05 + 0.045 * math.cos(TAU * i / 12), 0.045 * math.sin(TAU * i / 12)) for i in range(12)], 0.01, K=4), lac('#4a4450', hi='#9a94a0'), 'rings')
    # the stand: two cradles with splayed legs, floor rails, gold caps, a front rail
    for sz in (-0.16, 0.16):
        arc = [(math.cos(a) * 0.37, cy + math.sin(a) * 0.37, sz) for a in [PI * 1.2 + i / 10 * PI * 0.6 for i in range(11)]]
        add(gtube(arc, 0.032, K=5), lac(LAC), 'stand')
        for sx in (-1, 1):
            add(gpipe((sx * 0.3, cy - 0.22, sz), (sx * 0.42, 0.034, sz * 1.15), 0.03, K=5), lac(LAC), 'stand')
            add(sph(0.035, (sx * 0.42, 0.028, sz * 1.15), sc=(1, 0.8, 1), K=7, J=4), lac(GOLD), 'stand')
    for sx in (-1, 1): add(gpipe((sx * 0.42, 0.03, -0.19), (sx * 0.42, 0.03, 0.19), 0.026, K=5), lac(LAC), 'stand')
    add(gpipe((-0.36, 0.18, 0.17), (0.36, 0.18, 0.17), 0.02, K=5), lac(LAC), 'stand')
    # two bachi resting crossed on the front rail
    add(gpipe((-0.28, 0.195, 0.2), (0.16, 0.235, 0.36), 0.016, 0.012, K=7), wood('#e8c890'), 'bachi')
    add(gpipe((0.26, 0.195, 0.2), (-0.12, 0.215, 0.38), 0.016, 0.012, K=7), wood('#e8c890'), 'bachi')
    for (x, z) in ((-0.28, 0.2), (0.26, 0.2)): add(sph(0.019, (x, 0.195, z), K=6, J=3), lac('#e8403a'), 'bachi')

# ================================================================== Tanuki Statue (floor, 0.5 x 0.5, h 0.85)
def on_ell(C, R, x, y, front=1.0):
    """the point and normal on the front of an ellipsoid (centre C, radii R; game-local) at x, y"""
    u = (x - C[0]) / R[0]; v = (y - C[1]) / R[1]; w = math.sqrt(max(0.0, 1 - u * u - v * v))
    p = Vector((x, y, C[2] + front * R[2] * w))
    n = Vector((u / R[0], v / R[1], front * w / R[2])).normalized()
    return p, n

def decal(C, R, x, y, rx, ry, th, col, tag='face', rot=0.0, lift=0.0, K=8, mat='body'):
    """a flat dot laid on an ellipsoid's front (rx, ry radii in its plane, th thick)"""
    p, n = on_ell(C, R, x, y)
    q = Vector((0, 0, 1)).rotation_difference(n)
    with atM(Matrix.Translation(p + n * lift) @ q.to_matrix().to_4x4() @ Matrix.Rotation(rot, 4, 'Z')):
        add(dot(1.0, (0, 0, 0), sc=(rx, ry, th), K=K, J=2), col if callable(col) else soft(col, 0.12), tag, mat)

def build_tanukiStatue():
    new_asset()
    BT = 0.034
    add(gl_lathe([(0.0, 0.0), (0.222, 0.0), (0.234, 0.01), (0.232, 0.025), (0.222, BT), (0.0, BT)], 20), lambda p, n: mul('#8a5a3e' if n.z > 0.8 else '#6e4632', 0.94 + 0.08 * vnoise(p, 30.0, 1)), 'base')
    with at((0, BT, 0), s=1.08):
        lo = local_of()
        def fur(p, n):
            q = lo(p)
            c = mix('#8e5636', '#c48656', clamp(n.z * 0.5 + 0.25) * 0.5)
            c = mix(c, '#583420', clamp(-n.z * 0.5 + n.y * 0.6 - 0.05) * 0.6)
            return mul(c, 0.95 + 0.07 * vnoise(p, 18.0, 3))
        def belly(p, n):
            q = lo(p); bx, by = q.x / 0.15, (q.y - 0.225) / 0.15
            return mix(fur(p, n), '#f4dcae', clamp((1 - bx * bx - by * by) * 3) * clamp(-n.y * 3))
        def headc(p, n):
            q = lo(p); c = mix(fur(p, n), '#c08a58', 0.55)
            return mix(c, '#4a2c20', clamp((-0.06 - q.z) * 10) * 0.4)
        for s in (-1, 1):
            add(sph(1.0, (s * 0.088, 0.075, 0.0), sc=(0.074, 0.08, 0.084), K=9, J=5), fur, 'body')
            add(sph(1.0, (s * 0.09, 0.026, 0.07), sc=(0.058, 0.026, 0.072), K=8, J=3), fur, 'body')
        add(sph(1.0, (0, 0.235, 0.048), sc=(0.18, 0.178, 0.17), K=14, J=9), belly, 'body')
        add(sph(1.0, (0, 0.355, -0.018), sc=(0.158, 0.155, 0.14), K=12, J=7), fur, 'body')
        HC, HR = (0.0, 0.542, 0.008), (0.142, 0.12, 0.126)
        add(sph(1.0, HC, sc=HR, K=14, J=9), headc, 'head')
        for s in (-1, 1):
            add(sph(1.0, (s * 0.084, 0.502, 0.05), sc=(0.07, 0.054, 0.06), K=9, J=5), headc, 'head')
            add(sph(1.0, (s * 0.1, 0.632, -0.01), sc=(0.04, 0.036, 0.03), K=7, J=4), headc, 'head')
        add(gtube([(0.146, 0.42, -0.01), (0.212, 0.33, 0.03), (0.2, 0.245, 0.112)], lambda q: 0.05 - 0.008 * q, K=8), fur, 'arms')
        add(sph(0.046, (0.196, 0.228, 0.124), K=9, J=5), fur, 'arms')
        add(gtube([(-0.146, 0.42, -0.01), (-0.205, 0.32, 0.02), (-0.19, 0.232, 0.085)], lambda q: 0.05 - 0.008 * q, K=8), fur, 'arms')
        add(sph(0.047, (-0.186, 0.218, 0.096), K=9, J=5), fur, 'arms')
        add(gtube(catmull([(0, 0.14, -0.13), (0.0, 0.07, -0.23), (0.05, 0.035, -0.282)], 6), lambda q: 0.07 - 0.036 * q, K=9), lambda p, n: mix(fur(p, n), '#4a2c20', 0.35), 'tail')
        # the face: cream muzzle, bandit mask, big round eyes glancing up and aside, cheeky brows, fat nose, a grin, blush
        MC, MR = (0.0, 0.494, 0.108), (0.061, 0.046, 0.049)
        add(sph(1.0, MC, sc=MR, K=10, J=6), lambda p, n: mul('#f4dcae', 0.93 + 0.08 * clamp(n.z + 0.4)), 'face')
        for s in (-1, 1):
            decal(HC, HR, s * 0.054, 0.533, 0.05, 0.04, 0.012, '#3e2418', rot=-s * 0.3)
            decal(HC, HR, s * 0.05, 0.536, 0.028, 0.029, 0.01, '#fffaf2', lift=0.007)
            decal(HC, HR, s * 0.05 + 0.007, 0.541, 0.0145, 0.0158, 0.008, lac(INK, hi='#5a4a54'), lift=0.012)
            decal(HC, HR, s * 0.05 + 0.002, 0.548, 0.005, 0.005, 0.004, flat('#ffffff'), lift=0.018, K=6)
            pts = [(s * 0.022, 0.578 + (0.006 if s > 0 else 0)), (s * 0.05, 0.59 + (0.012 if s > 0 else 0)), (s * 0.078, 0.582 + (0.01 if s > 0 else 0))]
            add(gtube([tuple(on_ell(HC, HR, x, y)[0] + on_ell(HC, HR, x, y)[1] * 0.006) for x, y in pts], lambda q: 0.0085 - 0.003 * q, K=4), flat('#3a2218'), 'face')
            decal(HC, HR, s * 0.098, 0.488, 0.022, 0.013, 0.006, '#f4a088', lift=0.004)
        decal(MC, MR, 0.0, 0.515, 0.021, 0.015, 0.014, lac('#3a2620', hi='#8a6a5a'), lift=0.002)
        grin = [tuple(on_ell(MC, MR, x, y)[0] + on_ell(MC, MR, x, y)[1] * 0.004) for x, y in ((-0.04, 0.488), (-0.022, 0.475), (0.0, 0.473), (0.022, 0.475), (0.04, 0.488))]
        add(gtube(grin, 0.0055, K=4), flat('#3a2218'), 'face')
        decal(MC, MR, 0.008, 0.47, 0.012, 0.009, 0.005, '#ff8a96', lift=0.004)
        # the straw hat (a woven sugegasa) worn at a jaunty tilt, with a red chin cord
        with at((0.004, 0.592, -0.04), s=0.86, rx=-0.42, rz=0.1):
            hp = [(0.0, 0.112), (0.07, 0.08), (0.15, 0.03), (0.214, -0.006), (0.232, -0.004), (0.237, 0.006), (0.226, 0.017)]
            for k in range(1, 7):
                r = 0.226 * (1 - k / 7); hp.append((r, 0.017 + (0.153 - 0.017) * (1 - (r / 0.226) ** 1.15)))
            hp.append((0.0, 0.153))
            def weave(c, fn):
                if fn.z < -0.2: return '#b08a52'
                k = angle_k(c, 16, PI / 16); j = int((0.153 - c.z) / 0.02)
                return mul('#f0cc7c' if (j + k // 2) % 2 else '#dcb466', 1.0)
            add(gl_lathe(hp, 16, colfn=weave), fsh(0.14, 0.3), 'hat')
            add(glathe([(0.0, 0.148), (0.017, 0.15), (0.015, 0.165), (0.0, 0.17)], K=8), wood('#b88a4a'), 'hat')
        for s in (-1, 1): add(gtube(catmull([(s * 0.128, 0.6, -0.03), (s * 0.13, 0.52, 0.03), (s * 0.08, 0.448, 0.085), (0, 0.432, 0.106)], 7), 0.0055, K=3), soft('#d8403a'), 'cord')
        add(sph(0.012, (0, 0.432, 0.104), K=6, J=3), soft('#d8403a'), 'cord')
        # the sake flask (tokkuri) by its right paw; an account book in its left
        fp = [(0.0, 0.0), (0.032, 0.0), (0.045, 0.02), (0.049, 0.045), (0.044, 0.07), (0.03, 0.088), (0.018, 0.1), (0.014, 0.118), (0.016, 0.128), (0.02, 0.134), (0.012, 0.137), (0.0, 0.133)]
        with at((0.212, 0.0, 0.16), ry=-0.3):
            def fc(c, fn):
                a = math.atan2(c.y, c.x); drip = 0.075 - 0.02 * abs(math.sin(a * 3)) ** 3
                return '#7a4a30' if c.z > drip else '#efdcb8'
            add(gl_lathe(fp, 9, colfn=fc), fsh(0.16, 0.3, sheen=0.35), 'flask')
            add(gloopc([(0.017 * math.cos(TAU * i / 10), 0.112, 0.017 * math.sin(TAU * i / 10)) for i in range(10)], 0.0045, K=4), soft('#d8403a'), 'flask')
            add(gtube([(0.012, 0.114, 0.01), (0.004, 0.15, 0.0), (-0.012, 0.16, -0.01)], 0.0045, K=4), soft('#d8403a'), 'flask')
        with at((-0.196, 0.15, 0.115), ry=0.5, rx=0.1, rz=-0.15):
            add(rb(0.078, 0.104, 0.024, (0, 0, 0), r=0.006), lambda p, n: '#e8d4a6' if abs(n.y) > 0.7 else '#5a3a2e' if n.x < -0.7 else '#fff4dc', 'book')
            add(rb(0.012, 0.106, 0.026, (-0.034, 0, 0), r=0.003), flat('#3a5a7a'), 'book')
            add(dot(0.014, (0.012, 0.01, 0.0125), sc=(1, 1, 0.25), K=8), flat('#d8403a'), 'book')

# ================================================================== finishing and export
def finish(A, h, seed=5, amt=0.003, mount='floor'):
    """a whisper of hand-made wobble (millimetres), then a soft painted contact shade toward the floor, like the kit's
    baseShade (furnitureMesh.js), painted here since the game skips it for Blender models (none for ceiling items)"""
    a = (seed % 97) * 1.37 + 0.7; H = max(0.12, min(0.45, h * 0.5))
    for o in A.objs.values():
        V = o['v']
        for i, p in enumerate(V):
            k = amt * (0.4 + min(p.z, 1.5))
            dx = (math.sin(p.z * 7.0 + a) * 0.6 + math.sin(p.y * 9.0 + a * 2.1) * 0.4) * k
            dy = (math.sin(p.z * 8.0 + a * 1.7) * 0.6 + math.sin(p.x * 8.5 + a * 0.6) * 0.4) * k
            V[i] = Vector((p.x + dx, p.y + dy, p.z))
        if mount == 'floor':
            for i, (p, c) in enumerate(zip(V, o['c'])):
                k = 0.86 + 0.14 * smooth(0.0, H, p.z)
                o['c'][i] = (c[0] * k, c[1] * k, c[2] * k, 1.0)

def export_piece(A, name):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mats = {}
    for mname in ('body', 'leaf', 'cloth', 'glow', 'water', 'hot'):
        mt = bpy.data.materials.new(mname); mt.use_nodes = True; nt = mt.node_tree
        bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
        bsdf.inputs['Roughness'].default_value = 0.8; bsdf.inputs['Metallic'].default_value = 0.0
        vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'; nt.links.new(vc.outputs['Color'], bsdf.inputs['Base Color'])
        if mname in ('glow', 'hot'):
            nt.links.new(vc.outputs['Color'], bsdf.inputs['Emission Color']); bsdf.inputs['Emission Strength'].default_value = 1.0 if mname == 'glow' else 1.5
        mats[mname] = mt
    obs = [to_object(k, o, mats) for k, o in A.objs.items()]
    lo = Vector((1e9,) * 3); hi = Vector((-1e9,) * 3)
    for o in A.objs.values():
        for v in o['v']: lo = Vector(map(min, lo, v)); hi = Vector(map(max, hi, v))
    print('FD %s tris %d' % (name, A.tris()))
    print('FD %s parts %s' % (name, dict(sorted(A.count.items(), key=lambda kv: -kv[1]))))
    print('FD %s size x %.3f (%.3f..%.3f)  depth %.3f (%.3f..%.3f)  h %.3f (min z %.4f)' % (name, hi.x - lo.x, lo.x, hi.x, hi.y - lo.y, lo.y, hi.y, hi.z, lo.z))
    for ob in obs: print('FD %s check %s %s mats %s' % (name, ob.name, check(ob), [m.name for m in ob.data.materials]))
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, name + '.blend'))
    for o in bpy.context.scene.objects: o.select_set(o.type == 'MESH')
    out = os.path.join(MODELS, name + '.glb')
    kw = dict(filepath=out, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
              export_attributes=True, export_lights=False, export_cameras=False, export_animations=False,
              export_normals=True, export_texcoords=True, export_materials='EXPORT')
    try: bpy.ops.export_scene.gltf(export_vertex_color='ACTIVE', **kw)
    except TypeError as e:
        print('FD export_vertex_color rejected:', e); bpy.ops.export_scene.gltf(export_colors=True, **kw)
    print('FD wrote', out)

# id: (builder, catalog h, mount)
PIECES = {
    'pottedFern': ('build_pottedFern', 0.78, 'floor'), 'artEasel': ('build_artEasel', 1.45, 'floor'),
    'catTower': ('build_catTower', 1.5, 'floor'), 'flourSacks': ('build_flourSacks', 0.6, 'floor'),
    'plantStand': ('build_plantStand', 1.1, 'floor'), 'byobu': ('build_byobu', 1.4, 'floor'),
    'ikebana': ('build_ikebana', 0.86, 'floor'), 'bonsaiStand': ('build_bonsaiStand', 0.92, 'floor'),
    'irori': ('build_irori', 1.2, 'floor'), 'foxStatue': ('build_foxStatue', 0.8, 'floor'),
    'bambooPlanter': ('build_bambooPlanter', 1.7, 'floor'), 'hangingPlanter': ('build_hangingPlanter', 0.8, 'ceiling'),
    'fishTank': ('build_fishTank', 1.0, 'floor'), 'lilyTub': ('build_lilyTub', 0.55, 'floor'),
    'cypressBucket': ('build_cypressBucket', 0.5, 'floor'), 'taikoDrum': ('build_taikoDrum', 1.0, 'floor'),
    'tanukiStatue': ('build_tanukiStatue', 0.85, 'floor'),
}
for pid in ([k for k in PIECES if k.replace('', '') and ('build_' + k) in globals()] if PIECE == 'all' else PIECE.split(',')):
    fn, h, mount = PIECES[pid]
    globals()[fn]()
    finish(A, h, seed=sum(map(ord, pid)), mount=mount)
    export_piece(A, 'furn-' + pid)
