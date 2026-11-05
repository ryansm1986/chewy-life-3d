# PAWHAVEN: the housing furniture's tables and seating (task furn-seat), built in Blender by script.
#   blender --background --factory-startup --python build_furn-seat.py -- --piece <id|all>
#   ids: chabudai zabutonPink zabutonBlue woodTable sideTable woodChair armchair workbench melonStool napPillow
#        bambooBench acornStool
# Deterministic: no random state at all (hash noise only); a re-run reproduces every GLB exactly.
# Frame (src/home/furnitureMesh.js): 1 unit = 1 m, Blender Z up, the item's front faces -Y (the game's +z), centred on
# its footprint with z = 0 at its base. The layout code is written in the kit's game frame (x right, y up, z front) and
# mapped to Blender (x, -z, y), so the kit builders (src/home/furnitureModels.js, furnitureModels2.js) port across.
# The shared mesh kit (rounded boxes with analytic normals, lathes, tubes, sweeps, painters, emblems) is copied from
# tools/blender/work/codex/furn-big/build_furn-big.py (itself from landmarks-hollow); this file's own generators
# (lathe2, squish, holed_slab, ridge, decals, bamboo) and the twelve builders follow it.
# Materials: `body` (wood, bamboo, melon, acorn), `cloth` (cushions, upholstery, the blanket) and `leaf` (the melon
# leaf). The cloth object carries a UV map with v = 0 everywhere (glTF uv.y = 1: the cloth wind shader's "attached"
# edge), so nothing soft sways.
import bpy, bmesh, math, os, sys
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..', '..'))
MODELS = os.path.join(REPO, 'public', 'models')
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
PIECE = argv[argv.index('--piece') + 1] if '--piece' in argv else 'all'
print('FS build pid', os.getpid())

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


# ================================================================== furn-seat: own generators
HONEY, WOOD_R, WOOD_D = '#d9a066', '#a86e42', '#6b4a3a'

def lathe2(prof, K, th0=0.0, rfn=None, cfn=None, M=None, closed=False, zfn=None):
    """a lathe about Blender Z (= the game's y) whose wobble rfn(j, k, r, z, th) and colour cfn(j, k, r, z, th) know the
    profile row j and the angle step k; prof [(r, z)], r = 0 ends become poles. Colours ride on t.c (ring order, then
    the poles), so a crisp painted band is just a profile row."""
    t = Tmp(); rings, cs, cols = [], [], []
    body = list(enumerate(prof)); p0 = p1 = None
    if not closed and prof[0][0] < 1e-6: p0 = Vector((0, 0, prof[0][1])); body = body[1:]
    if not closed and prof[-1][0] < 1e-6: p1 = Vector((0, 0, prof[-1][1])); body = body[:-1]
    for j, (r, z) in body:
        ring = []
        for k in range(K):
            th = th0 + TAU * k / K
            rr = rfn(j, k, r, z, th) if rfn else r
            ring.append(Vector((math.cos(th) * rr, math.sin(th) * rr, zfn(j, k, rr, z, th) if zfn else z)))
            if cfn: cols.append(cfn(j, k, rr, z, th))
        rings.append(ring); cs.append(Vector((0, 0, z)))
    ring_surface(t, rings, cs, p0, p1, closed=closed)
    if cfn:
        if p0 is not None: cols.append(cfn(0, -1, 0.0, prof[0][1], 0.0))
        if p1 is not None: cols.append(cfn(len(prof) - 1, -1, 0.0, prof[-1][1], 0.0))
        t.c = cols
    if M is not None: t.xform(M)
    return t

def glathe2(prof, K, pos=(0, 0, 0), ry=0.0, rx=0.0, rz=0.0, s=1.0, **kw):
    return lathe2(prof, K, M=F.m @ lm(pos, ry, rx, rz, s), **kw)

class atm:
    """push a game-local frame at pos whose +y is the direction N (then a spin about N)"""
    def __init__(self, pos, N, spin=0.0):
        q = Vector((0, 1, 0)).rotation_difference(Vector(N).normalized())
        self.M = Matrix.Translation(Vector(pos)) @ q.to_matrix().to_4x4() @ Matrix.Rotation(spin, 4, 'Y')
    def __enter__(self):
        F.st.append(F.m.copy()); F.m = F.m @ (GM @ self.M @ GMi); return F
    def __exit__(self, *e): F.pop()

def catmull(pts, n):
    """n points on a Catmull-Rom curve through pts (game tuples)"""
    P = [Vector(p) for p in pts]; P = [P[0] * 2 - P[1]] + P + [P[-1] * 2 - P[-2]]
    out = []
    for i in range(n):
        u = i / (n - 1) * (len(P) - 3); s = min(int(u), len(P) - 4); t = u - s
        p0, p1, p2, p3 = P[s], P[s + 1], P[s + 2], P[s + 3]
        out.append(tuple(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3)))
    return out

def shade_lac(k=1.0, top=0.12, bot=0.32):
    """a painted lacquer / satin sheen for a precoloured shell: light toward the sky and the camera side, darker under"""
    def f(c, p, n):
        c = mix(c, mix(c, '#fff4e4', 0.35), (clamp(n.z * 0.7 + (-n.y + n.x) * 0.22) ** 1.5) * k)
        return mul(c, 1 + top * max(0.0, n.z) + bot * min(0.0, n.z))
    return f

# ---------------------------------------------------------------- the kit's pillowGeo: a squircle cushion
def pillow_y(h, bot, edge, e):
    ht = h / (1 + bot); hb = h - ht
    return hb + ht * math.sqrt(max(0.0, 1 - e ** 4)) * (1 - edge * e * e)
def sqxy(w, d, sq, th, e):
    c, s = math.cos(th), math.sin(th)
    return (math.copysign(abs(c) ** sq, c) * e * w / 2, math.copysign(abs(s) ** sq, s) * e * d / 2)
def e_of(w, d, sq, x, z):
    return ((abs(x) / (w / 2)) ** (2 / sq) + (abs(z) / (d / 2)) ** (2 / sq)) ** (sq / 2)

def squish(w, h, d, sq=0.32, edge=0.45, bot=0.3, ws=24, hs=12, dimple=0.0, dw=0.03, deform=None, extra=(), pos=(0, 0, 0), ry=0.0, rx=0.0, rz=0.0):
    """the kit's pillowGeo in the game-local frame (y 0..h, centred in x/z, a squircle in plan, a domed top thinning to
    a rolled rim at y = hb, a flatter underside), smooth-shaded; deform(x, z, f) adds to the top's y (f = 0 at the seam,
    1 at the crown); extra: more latitudes (radians from the top pole) for a crisper rim"""
    M = F.m @ lm(pos, ry, rx, rz)
    ht = h / (1 + bot); hb = h - ht
    phis = sorted(set([round(PI * j / hs, 6) for j in range(1, hs)] + [round(a, 6) for a in extra]))
    def Y(x, z, e, top):
        if top:
            y = hb + ht * math.sqrt(max(0.0, 1 - e ** 4)) * (1 - edge * e * e) - dimple * math.exp(-e * e / dw)
            if deform: y += deform(x, z, (y - hb) / ht)
            return y
        return hb - hb * math.sqrt(max(0.0, 1 - e ** 6))
    rings, cs = [], []
    for phi in phis:
        e = min(1.0, math.sin(phi)); top = phi <= PI / 2 + 1e-9
        ring = []
        for k in range(ws):
            x, z = sqxy(w, d, sq, TAU * k / ws, e)
            ring.append(M @ gl((x, Y(x, z, e, top), z)))
        rings.append(ring); cs.append(M @ gl((0, hb, 0)))
    t = Tmp()
    ring_surface(t, rings, cs, M @ gl((0, Y(0, 0, 0, True), 0)), M @ gl((0, 0, 0)))
    return t

def sq_top(w, d, h, sq, edge, bot, x, z, dimple=0.0, dw=0.03, deform=None):
    """the squish top's height at (x, z)"""
    ht = h / (1 + bot); hb = h - ht; e = min(1.0, e_of(w, d, sq, x, z))
    y = hb + ht * math.sqrt(max(0.0, 1 - e ** 4)) * (1 - edge * e * e) - dimple * math.exp(-e * e / dw)
    if deform: y += deform(x, z, (y - hb) / ht)
    return y

def ridge(a, b, up, w=0.008, hgt=0.0035, sink=0.0015):
    """a little raised stitch / welt between two game-local surface points: a closed triangular prism"""
    a, b, up = Vector(a), Vector(b), Vector(up).normalized()
    s = (b - a).cross(up).normalized() * (w / 2)
    P = [a - s - up * sink, a + up * hgt, a + s - up * sink, b - s - up * sink, b + up * hgt, b + s - up * sink]
    t = Tmp(); ids = [t.vert(F.W(p)) for p in P]; c = sum((t.v[i] for i in ids), Vector()) / 6
    for f in ([0, 1, 4, 3], [1, 2, 5, 4], [0, 3, 5, 2], [0, 2, 1], [3, 4, 5]):
        t.face([ids[i] for i in f], sum((t.v[ids[i]] for i in f), Vector()) / len(f) - c)
    return t

def decals(rects, z=0.0):
    """flat painted quads facing the frame's +z (pegboard holes, ruler ticks): rects [(x, y, w, h)]; fixed winding"""
    t = Tmp(); nn = F.N((0, 0, 1))
    for x, y, w, h in rects:
        q = [t.vert(F.W(p), nn) for p in ((x - w / 2, y - h / 2, z), (x + w / 2, y - h / 2, z), (x + w / 2, y + h / 2, z), (x - w / 2, y + h / 2, z))]
        if (t.v[q[1]] - t.v[q[0]]).cross(t.v[q[2]] - t.v[q[0]]).dot(nn) < 0: q = q[::-1]
        t.f.append(q)
    t.fixed = True
    return t

def resample2(poly, n, closed=True):
    """n points evenly spaced by arc length round a closed 2-D outline, starting at its first point"""
    P = [Vector((p[0], p[1], 0)) for p in poly] + ([Vector((poly[0][0], poly[0][1], 0))] if closed else [])
    return [(q.x, q.y) for q in resample(P, n + 1)[:-1]]

def holed_slab(outer, inner, depth, bev=0.008, ibev=0.005, z0=0.0, n=48):
    """a board with a hole (the chair back's heart, the saw handle, the set square): both outlines CCW (face frame),
    resampled to n points from their first point and bridged index to index; a rounded outer edge (inset rings on both
    faces) and a small chamfer round the hole. Closed torus shell, extruded along +z from z0."""
    O = resample2(outer, n); I = resample2(inner, n)
    def cen(L): return (sum(p[0] for p in L) / len(L), sum(p[1] for p in L) / len(L))
    co, ci = cen(O), cen(I)
    def off(p, c, d):
        v = Vector((p[0] - c[0], p[1] - c[1], 0)); L = v.length
        return (p[0] + v.x / L * d, p[1] + v.y / L * d) if L > 1e-9 else p
    zf = z0 + depth
    rings = [[F.W((*off(p, co, -bev), z0)) for p in O], [F.W((*p, z0 + bev)) for p in O], [F.W((*p, zf - bev)) for p in O],
             [F.W((*off(p, co, -bev), zf)) for p in O], [F.W((*off(p, ci, ibev), zf)) for p in I], [F.W((*p, zf - ibev)) for p in I],
             [F.W((*p, z0 + ibev)) for p in I], [F.W((*off(p, ci, ibev), z0)) for p in I]]
    cs = [F.W((co[0], co[1], (z0 + zf) / 2))] * len(rings)
    t = Tmp(); ring_surface(t, rings, cs, closed=True)
    return t

def bamboo(L, r, nodes, K=6, pos=(0, 0, 0), axis='y', c='#cfc878', nodeC='#9a9a50', cut='#f2e8b8', hollow='#a89458', ry=0.0):
    """a bamboo pole along a game axis, centred at pos: pale cut ends with a dark hollow, swollen node rings at the
    given fractions, a soft light band between nodes"""
    pr, cols = [], []
    def P(rr, y, cc): pr.append((rr, y - L / 2)); cols.append(cc)
    P(0.0, 0.008, hollow); P(r * 0.6, 0.008, mix(hollow, cut, 0.4)); P(r * 0.68, 0.0, cut); P(r, 0.004, mix(cut, c, 0.5))
    for f in nodes:
        y = f * L
        P(r, y - 0.016, c); P(r * 1.13, y - 0.004, nodeC); P(r * 1.13, y + 0.004, nodeC); P(r, y + 0.016, mix(c, '#e8e4a0', 0.3))
    P(r, L - 0.004, mix(cut, c, 0.5)); P(r * 0.68, L, cut); P(r * 0.6, L - 0.008, mix(hollow, cut, 0.4)); P(0.0, L - 0.008, hollow)
    rot = dict(y=(0.0, 0.0), x=(0.0, -PI / 2), z=(PI / 2, 0.0))[axis]
    def cf(j, k, rr, z, th):
        cc = cols[j]
        if 3 < j < len(cols) - 4 and cc == c:                  # a lighter band mid-internode (painted on the near side)
            cc = mix(c, '#f0ecb0', 0.18 * (0.5 + 0.5 * math.cos(th - 0.6)))
        return cc
    t = glathe2(pr, K, pos=pos, rx=rot[0], rz=rot[1], ry=ry, th0=0.4, cfn=cf)
    t.shade = shade_soft(0.12, 0.3)
    return t

def lash(r, y, w=0.02, K=7, pos=(0, 0, 0), axis='y', light='#e86a50', dark='#9a3828', turns=4):
    """a rope lashing round a pole (radius r) at height y: a fat band painted in wraps"""
    pr = [(0.0, y - w * 0.9), (r + 0.004, y - w), (r + 0.013, y - w * 0.4), (r + 0.013, y + w * 0.4), (r + 0.004, y + w), (0.0, y + w * 0.9)]
    rot = dict(y=(0.0, 0.0), x=(0.0, -PI / 2), z=(PI / 2, 0.0))[axis]
    def cf(j, k, rr, z, th):
        return mix(dark, light, 0.5 + 0.5 * math.cos((j - 1) * PI / 1.5 + th * 0.0)) if 0 < j < len(pr) - 1 else dark
    t = glathe2(pr, K, pos=pos, rx=rot[0], rz=rot[1], cfn=cf)
    t.shade = shade_soft(0.12, 0.3)
    return t

def cloth_col(base, hi=0.32, lo=0.26, hic='#fff6ee'):
    """soft fabric: a pale bloom toward the sky, a deeper tone underneath"""
    def f(p, n):
        c = mix(base, mix(base, hic, 0.5), clamp(n.z) ** 1.3 * hi * 2)
        return mul(c, 1 + lo * min(0.0, n.z))
    return f

# ================================================================== Round Chabudai (chabudai: 2 x 2 cells, h 0.36)
def build_chabudai():
    R, top = 0.465, 0.36
    U, L, INL = '#6e3420', '#a24c30', '#6a2e1c'
    # the top: one lathe from the underside round the rolled lacquer rim and in across the top; the inlaid line and the
    # concentric grain rings are profile rows (crisp painted bands), the rings wobbling off-round like real end grain
    P = [(0.0, top - 0.066, U), (R - 0.075, top - 0.066, U), (R - 0.03, top - 0.066, U), (R - 0.008, top - 0.056, L),
         (R, top - 0.037, L), (R - 0.002, top - 0.018, L), (R - 0.013, top - 0.005, L), (R - 0.03, top, L), (R - 0.062, top, L),
         (R - 0.065, top, INL), (R - 0.075, top, INL), (R - 0.078, top, '#e4a96e')]
    field = ['#e4a96e', '#d99c60', '#e6ad72', '#d89a5e', '#e2a66a', '#d4934f']
    bnd = [0.31, 0.24, 0.17, 0.105, 0.045]
    for i, b in enumerate(bnd):
        P += [(b + 0.0035, top, field[i]), (b - 0.0035, top, field[i + 1])]
    P += [(0.0, top, '#c98848')]
    prof = [(r, z) for r, z, _ in P]
    def rf(j, k, r, z, th):
        if z >= top - 1e-6 and r < R - 0.079:
            return r * (1 + 0.045 * math.sin(3 * th + j * 0.7) + 0.022 * math.sin(5 * th + j * 1.9))
        return r
    t = glathe2(prof, 40, rfn=rf, cfn=lambda j, k, r, z, th: P[j][2])
    def sh(c, p, n):
        if n.z > 0.95 and p.z > top - 0.002 and math.hypot(p.x, p.y) < R - 0.08:      # the honey field: a soft sheen
            return mix(c, '#f6c890', 0.22 * clamp(0.6 - p.x * 1.2 + p.y * 1.2))
        return shade_lac(1.0, 0.1, 0.4)(c, p, n)
    t.shade = sh
    addm(t, None, 'top')
    # the apron ring under the top, with a carved bead round its foot
    ap = [(0.318, top - 0.14), (0.346, top - 0.14), (0.358, top - 0.128), (0.356, top - 0.118), (0.36, top - 0.11), (0.36, top - 0.075), (0.35, top - 0.066), (0.318, top - 0.066)]
    a = glathe2(ap, 30, closed=True, cfn=lambda j, k, r, z, th: '#7a3a24' if j in (2, 3) else '#8e4428')
    a.shade = shade_lac(0.6, 0.1, 0.35); addm(a, None, 'apron')
    # four stout turned legs with flared feet and a collar
    leg = [(0.0, 0.0), (0.054, 0.0), (0.062, 0.012), (0.058, 0.026), (0.046, 0.04), (0.04, 0.075), (0.043, 0.15), (0.05, top - 0.17), (0.058, top - 0.155), (0.058, top - 0.14), (0.05, top - 0.13), (0.0, top - 0.07)]
    for k in range(4):
        ang = PI / 4 + k * PI / 2
        lg = glathe2(leg, 10, pos=(math.sin(ang) * 0.315, 0, math.cos(ang) * 0.315),
                     cfn=lambda j, kk, r, z, th: '#6e3420' if j in (1, 2) else ('#a85a38' if j in (8, 9) else '#8e4428'))
        lg.shade = shade_lac(0.9, 0.12, 0.3); addm(lg, None, 'legs')
    return dict(h=0.36)

# ================================================================== the zabuton cushions (1 x 1 cells, h 0.13)
def cushion(color, button, tassel, stitch=None, piping=None, deep=None, bloom=0.75):
    w, h, sq, edge, bot, dim, dw = 0.44, 0.13, 0.28, 0.4, 0.32, 0.02, 0.012
    deep = deep or mul(color, 0.78)
    # creases: the button pulls the cover in, so soft valleys run from the tuft out toward the four corners
    def crease(x, z, f):
        a = math.atan2(z, x); e = min(1.0, e_of(w, w, sq, x, z))
        dd = min(abs(math.sin(2 * (a - PI / 4))), 1.0)
        return -0.009 * math.exp(-(dd / 0.28) ** 2) * math.sin(PI * min(1.0, e * 1.1)) * f
    t = squish(w, h, w, sq, edge, bot, ws=32, hs=14, dimple=dim, dw=dw, deform=crease, extra=(PI / 2 - 0.1, PI / 2 + 0.1, 0.12))
    def cc(p, n):
        x, z = p.x, -p.y; e = min(1.0, e_of(w, w, sq, x, z))
        a = math.atan2(z, x); dd = abs(math.sin(2 * (a - PI / 4)))
        c = mix(color, mix(color, '#fff8f2', 0.42), clamp(n.z) ** 1.6 * bloom)
        c = mix(c, deep, 0.32 * math.exp(-(dd / 0.22) ** 2) * math.sin(PI * min(1.0, e * 1.1)) * clamp(n.z))   # crease shade
        c = mix(c, deep, 0.45 * math.exp(-e * e / 0.01))                                                    # the tuft
        return mul(c, 1 + 0.3 * min(0.0, n.z))
    cl(t, cc, 'cushion')
    ht = h / (1 + bot); hb = h - ht
    # the tufted button: a plump disc with a rim
    yb = h - dim
    cl(sph(0.026, (0, yb + 0.004, 0), sc=(1, 0.45, 1), K=10, J=4), lac(button), 'button')
    # welt piping round the seam
    if piping:
        path = [F.W((*(lambda q: (q[0], hb, q[1]))(sqxy(w * 1.012, w * 1.012, sq, TAU * k / 48, 1.0)),)) for k in range(48)]
        cl(tube_loop(path, lambda s: 0.0085, K=5), lambda p, n: mul(mix(piping, '#ffffff', 0.18 * clamp(n.z)), 1 + 0.25 * min(0.0, n.z)), 'piping')
    # stitching: a dashed ring of raised stitches on the top
    if stitch:
        e, N = 0.74, 44
        ring = resample2([sqxy(w, w, sq, TAU * i / 400 + PI / 4, e) for i in range(400)], N)
        for k in range(0, N, 2):
            p0, p1 = ring[k], ring[k + 1]
            p0, p1 = (p0[0] + (p1[0] - p0[0]) * 0.08, p0[1] + (p1[1] - p0[1]) * 0.08), (p1[0] + (p0[0] - p1[0]) * 0.08, p1[1] + (p0[1] - p1[1]) * 0.08)
            y0 = sq_top(w, w, h, sq, edge, bot, *p0, dim, dw, crease); y1 = sq_top(w, w, h, sq, edge, bot, *p1, dim, dw, crease)
            m = ((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2); ym = sq_top(w, w, h, sq, edge, bot, *m, dim, dw, crease)
            dx = (sq_top(w, w, h, sq, edge, bot, m[0] + 0.005, m[1], dim, dw, crease) - ym) / 0.005
            dz = (sq_top(w, w, h, sq, edge, bot, m[0], m[1] + 0.005, dim, dw, crease) - ym) / 0.005
            cl(ridge((p0[0], y0, p0[1]), (p1[0], y1, p1[1]), (-dx, 1, -dz), w=0.01, hgt=0.0035), lambda p, n: mul(stitch, 1 + 0.12 * min(0.0, n.z)), 'stitch')
    # corner tassels: a knot at the seam, a flared brush hanging out and down, a band round its neck
    ty = hb
    for k in range(4):
        th = PI / 4 + k * PI / 2; x, z = sqxy(w, w, sq, th, 1.0); dx, dz = math.cos(th), math.sin(th)
        knot = (x + dx * 0.006, ty, z + dz * 0.006)
        cl(sph(0.017, knot, K=6, J=4), lac(tassel), 'tassel')
        d = Vector((dx * 0.8, -0.4, dz * 0.8)).normalized()
        a0 = Vector(knot) + d * 0.012; a1 = Vector(knot) + d * 0.05
        cl(gtube([tuple(a0), tuple(a0.lerp(a1, 0.5)), tuple(a1)], lambda s: 0.008 + 0.0085 * s ** 1.3, K=6), lambda p, n: mul(mix(tassel, '#fff8e8', 0.25 * clamp(n.z + 0.3)), 1 + 0.25 * min(0.0, n.z)), 'tassel')
        cl(sph(0.0105, tuple(Vector(knot) + d * 0.018), K=6, J=3), lac(mul(tassel, 0.82)), 'tassel')
    return dict(h=0.13)

def build_zabutonPink():
    return cushion('#ffaac4', '#ff7aa0', GOLD, piping='#ff8fb2', deep='#e07c9c')

def build_zabutonBlue():
    return cushion('#34528a', '#fff6ea', '#fffaf2', stitch='#fff6ea', piping='#283f6e', deep='#1f3462', bloom=0.22)

# ================================================================== Farmhouse Table (woodTable: 3 x 2 cells, h 0.72)
def build_woodTable():
    top, th, W, D = 0.72, 0.075, 1.46, 0.96; L = W - 0.12
    tones = ['#dba468', '#d09658', '#e2ad72', '#d39b5e']
    for i in range(4):
        z = -D / 2 + 0.12 + i * 0.24
        addm(rb(L, th, 0.233, (0, top - th / 2, z), r=0.02), wood2(tones[i], ao_z=None, nz=0.0), 'planks')
        # grain lines and a couple of knots per plank (painted inlays, a hair proud of the top)
        for x0, ln, dz in ((-0.5 + 0.1 * (i % 2), 0.55, -0.05), (0.1 - 0.12 * (i % 3), 0.45, 0.06), (-0.2 + 0.08 * i, 0.3, 0.0)):
            addm(fbox(ln, 0.003, 0.007, (x0 + ln / 2, top + 0.0005, z + dz)), lambda p, n, c=tones[i]: mul(c, 0.8), 'grain')
    for sx in (-1, 1):
        addm(rb(0.058, th + 0.004, D, (sx * (W / 2 - 0.029), top - th / 2, 0), r=0.02), wood2('#c88a50', ao_z=None, nz=0.0), 'ends')
        for i in range(4):
            for dz in (-0.06, 0.06):
                addm(sph(0.0095, (sx * (W / 2 - 0.029), top + 0.002, -D / 2 + 0.12 + i * 0.24 + dz), sc=(1, 0.5, 1), K=6, J=2), lambda p, n: mix('#5a4038', '#9a8070', clamp(n.z)), 'nails')
    for x, z, r in ((-0.32, -0.23, 0.02), (0.41, 0.13, 0.016), (0.08, 0.37, 0.014)):
        addm(sph(1.0, (x, top + 0.0006, z), sc=(r * 1.6, 0.0025, r), K=10, J=2), lambda p, n: '#b07a46', 'knots')
        addm(sph(1.0, (x, top + 0.0012, z), sc=(r * 0.7, 0.0025, r * 0.45), K=8, J=2), lambda p, n: '#8a5a36', 'knots')
    # the apron with a pink heart on the front, chunky leg blocks and turned legs
    addm(box(W - 0.3, 0.1, D - 0.3, (0, top - th - 0.05, 0), r=0.02), wood2('#b87a46', ao_z=None), 'apron')
    heart(0.085, (0, top - th - 0.052, (D - 0.3) / 2 - 0.004), depth=0.02, col='#ff8fb0', tag='heart')
    yl = top - th - 0.12
    leg = [(0.0, 0.0), (0.042, 0.0), (0.05, 0.02), (0.044, 0.06), (0.062, 0.15), (0.066, 0.22), (0.05, 0.3), (0.04, 0.36), (0.056, 0.41), (0.056, 0.45), (0.044, 0.49), (0.044, yl), (0.0, yl)]
    for sx in (-1, 1):
        for sz in (-1, 1):
            lg = glathe2(leg, 10, pos=(sx * 0.58, 0, sz * 0.33), cfn=lambda j, k, r, z, th_: '#8e5a30' if j in (1, 2) else ('#b8804a' if j in (5, 8, 9) else '#a8703e'))
            lg.shade = shade_lac(0.5, 0.15, 0.3); addm(lg, None, 'legs')
            addm(box(0.1, 0.13, 0.1, (sx * 0.58, yl + 0.04, sz * 0.33), r=0.02), wood2('#a8703e', ao_z=None), 'legs')
    return dict(h=0.72)

# ================================================================== Round Side Table (sideTable: 1 x 1 cells, h 0.55)
def build_sideTable():
    top, R, T = 0.55, 0.215, 0.058
    W0, WL, WD = '#c98a52', '#e6ae72', '#94592f'
    P = [(0.0, top - T, WD), (R - 0.04, top - T, WD), (R - 0.016, top - T + 0.004, W0), (R + 0.002, top - T + 0.014, W0), (R + 0.01, top - T + 0.028, WL),
         (R + 0.01, top - 0.02, WL), (R + 0.004, top - 0.008, WL), (R - 0.008, top - 0.001, WL), (R - 0.024, top, WL),
         (0.18, top, WL), (0.1735, top, '#b07040'), (0.167, top, WL)]
    for b in (0.122, 0.07):
        P += [(b + 0.0045, top, WL), (b, top, '#c08648'), (b - 0.0045, top, WL)]
    P += [(0.024, top, WL), (0.018, top, '#d69e62'), (0.0, top, '#d69e62')]
    prof = [(r, z) for r, z, _ in P]
    def rf(j, k, r, z, th):
        if r > 0.17: return r * (1 + 0.032 * math.cos(10 * th) * clamp((r - 0.17) / 0.03))
        if z >= top - 1e-6 and r < 0.16: return r * (1 + 0.07 * math.sin(3 * th + 0.3) + 0.04 * math.sin(5 * th + 1.1))
        return r
    t = glathe2(prof, 40, rfn=rf, cfn=lambda j, k, r, z, th: P[j][2])
    t.shade = lambda c, p, n: mix(c, '#f6cc94', 0.3 * clamp(0.4 - p.x * 2.4 + p.y * 2.4)) if (n.z > 0.95 and p.z > top - 0.002) else mul(c, 1 + 0.1 * max(0.0, n.z) + 0.3 * min(0.0, n.z))
    addm(t, None, 'top')
    # the turned pedestal: hub, beads and coves, a vase bulb, a collar under the top; dark incised beads
    ped = [(0.0, 0.06), (0.074, 0.06), (0.083, 0.076), (0.077, 0.094), (0.0815, 0.1), (0.072, 0.108), (0.074, 0.13), (0.082, 0.146),
           (0.07, 0.162), (0.05, 0.185), (0.056, 0.24), (0.066, 0.28), (0.06, 0.322), (0.044, 0.365), (0.04, 0.395),
           (0.056, 0.412), (0.06, 0.42), (0.05, 0.43), (0.042, 0.45), (0.074, 0.48), (0.08, top - T - 0.016), (0.0, top - T + 0.002)]
    beads = (4, 16)
    def pc(j, k, r, z, th):
        if j in beads: return '#7a4626'
        if j == 0 or j >= len(ped) - 2: return W0
        a, b = ped[j], ped[min(j + 1, len(ped) - 1)]
        return WL if r > 0.062 else W0
    def seg_tone(j):
        if j in beads or j + 1 in beads: return '#7a4626'
        a_, b_ = ped[j], ped[min(j + 1, len(ped) - 1)]
        if abs(b_[1] - a_[1]) < abs(b_[0] - a_[0]) * 0.9: return WD
        return WL if (a_[0] + b_[0]) / 2 > 0.06 else W0
    K_ = 12; nb = (len(ped) - 3) * K_
    pt = unshare_i(glathe2(ped, K_), lambda fi: seg_tone(fi // K_ + 1) if fi < nb else (WD if fi < nb + K_ else W0))
    pt.shade = shade_lac(0.7, 0.12, 0.35); addm(pt, None, 'pedestal')
    # three carved cabriole legs: a knee with a carved leaf, a slim ankle, a curled scroll toe on a bun pad
    for k in range(3):
        a = k / 3 * TAU + PI / 6; dx, dz = math.sin(a), math.cos(a)
        Pp = lambda r, y: (dx * r, y, dz * r)
        pts = [Pp(0.05, 0.12), Pp(0.095, 0.124), Pp(0.14, 0.104), Pp(0.17, 0.07), Pp(0.186, 0.04), Pp(0.198, 0.024), Pp(0.215, 0.022), Pp(0.232, 0.032), Pp(0.236, 0.05), Pp(0.224, 0.06), Pp(0.212, 0.052), Pp(0.214, 0.042)]
        path = catmull(pts, 15)
        addm(gtube(path, lambda s: (0.036 - s * 0.032) if s < 0.5 else (0.02 - (s - 0.5) * 0.02), K=6), lambda p, n: mul(mix(W0, WL, clamp(n.z) * 0.6), 0.9 + 0.1 * clamp(n.z + 0.6)), 'legs')
        addm(sph(0.03, (dx * 0.205, 0.0165, dz * 0.205), sc=(1.1, 0.55, 1.1), K=8, J=3), wood2(mix(WD, W0, 0.4), ao_z=None), 'legs')
        with at((dx * 0.118, 0.141, dz * 0.118), ry=a):
            addm(sph(1.0, (0, 0, 0), sc=(0.017, 0.008, 0.036), K=8, J=3, rx=0.42), lambda p, n: mix(WL, '#f2c690', clamp(n.z)), 'leaf')
    return dict(h=0.55)

# ================================================================== Wooden Chair (woodChair: 1 x 1 cells, h 0.86)
def heart_hole(size, oy):
    P = heart_poly(size, oy=oy, n=6)                 # CCW, ends at the bottom tip
    i = min(range(len(P)), key=lambda k: P[k][1])
    return P[i:] + P[:i]

def build_woodChair():
    wood, woodL, seatY = '#d49a62', '#e8b47c', 0.44
    wd = wood2(wood, ao_z=None, nz=0.04)
    addm(rb(0.42, 0.05, 0.4, (0, seatY - 0.025, 0.01), r=0.02), wd, 'seat')
    for sx in (-1, 1):
        for sz in (-1, 1):
            addm(gtube([(sx * 0.175, 0.024, sz * 0.16 + 0.01), (sx * 0.168, seatY * 0.5, sz * 0.155 + 0.01), (sx * 0.16, seatY - 0.05, sz * 0.15 + 0.01)], lambda s: 0.024 + 0.007 * s, K=8), wood2(wood, ao_z=0.0, ao_k=0.3), 'legs')
    for sx in (-1, 1):
        addm(gtube([(sx * 0.17, 0.15, -0.15), (sx * 0.17, 0.15, 0.17)], 0.013, K=6), wood2(WOOD_R, ao_z=None), 'rungs')
    addm(gtube([(-0.17, 0.12, 0.165), (0.17, 0.12, 0.165)], 0.013, K=6), wood2(WOOD_R, ao_z=None), 'rungs')
    # back posts with ball finials
    for sx in (-1, 1):
        addm(gtube([(sx * 0.165, seatY - 0.05, -0.145), (sx * 0.168, 0.62, -0.163), (sx * 0.17, 0.8, -0.18)], 0.026, K=8), wd, 'posts')
        addm(sph(0.032, (sx * 0.17, 0.828, -0.18), K=9, J=5), wood2(woodL, ao_z=None), 'posts')
        addm(cyl(0.031, 0.031, 0.016, (sx * 0.17, 0.8, -0.18), K=9), wood2(mul(wood, 0.82), ao_z=None), 'posts')
    # the back board with a heart cut through it
    half = [(0.0, 0.0), (0.17, 0.0), (0.19, 0.02), (0.19, 0.17)] + [(0.19 * math.cos(u * PI / 2), 0.17 + 0.09 * math.sin(u * PI / 2)) for u in (0.25, 0.5, 0.75)]
    outer = half + [(0.0, 0.26)] + [(-x, y) for x, y in reversed(half[1:])]
    hole = heart_hole(0.15, 0.135)
    with at((0, 0.56, -0.172), rx=-0.09):
        addm(holed_slab(outer, hole, 0.026, bev=0.009, ibev=0.005, z0=-0.02, n=44), wood2(wood, ao_z=None, nz=0.03, grain=0.05, seed=3), 'back')
    # the pink seat cushion with a button, tied to the back posts with little bows
    cl(squish(0.36, 0.065, 0.34, 0.3, 0.3, 0.25, ws=24, hs=10, dimple=0.009, dw=0.015, pos=(0, seatY - 0.004, 0.02)), cloth_col('#ffb6c8'), 'cushion')
    cl(sph(0.017, (0, seatY + 0.054, 0.02), sc=(1, 0.5, 1), K=8, J=3), lac('#ff7aa0'), 'cushion')
    for sx in (-1, 1):
        with at((sx * 0.166, seatY + 0.05, -0.148 + 0.032), ry=sx * 0.35):
            bow(0.7, (0, 0, 0), col='#ff7aa0', tag='bows')
    return dict(h=0.86)

# ================================================================== Puffy Armchair (armchair: 2 x 2 cells, h 0.86)
def build_armchair():
    up, upD, legs = '#f2a690', '#d98a76', '#7a4e36'
    uc = cloth_col(up, 0.3, 0.3); ud = cloth_col(upD, 0.25, 0.3)
    for sx in (-1, 1):
        for sz in (-1, 1):
            lg = glathe2([(0.0, 0.0), (0.034, 0.0), (0.04, 0.012), (0.046, 0.06), (0.05, 0.075), (0.0, 0.085)], 10, pos=(sx * 0.36, 0, sz * 0.34),
                         cfn=lambda j, k, r, z, th: '#5e3a28' if j < 2 else legs)
            lg.shade = shade_lac(0.6); addm(lg, None, 'legs')
    cl(rb(0.88, 0.26, 0.82, (0, 0.2, 0), r=0.08, seg=2), ud, 'base')
    cl(rb(0.9, 0.6, 0.2, (0, 0.56, -0.33), r=0.09, seg=2), uc, 'back')
    for sx in (-1, 1):
        cl(rb(0.2, 0.3, 0.78, (sx * 0.355, 0.35, 0.0), r=0.07), uc, 'arms')
        cl(gtube([(sx * 0.355, 0.5, -0.28), (sx * 0.355, 0.505, 0.0), (sx * 0.355, 0.5, 0.28)], 0.115, K=12), uc, 'arms')
        # the rolled arm's front: a round scroll panel and a covered button
        cl(sph(0.096, (sx * 0.355, 0.5, 0.357), sc=(1, 1, 0.4), K=18, J=4), cloth_col(upD, 0.3, 0.25), 'arms')
        cl(sph(0.026, (sx * 0.355, 0.5, 0.398), sc=(1, 1, 0.5), K=8, J=3), cloth_col(mul(upD, 0.92), 0.4), 'arms')
    # the seat cushion with piping, and a few crumbs
    cl(squish(0.5, 0.17, 0.62, 0.25, 0.3, 0.35, ws=24, hs=10, pos=(0, 0.3, 0.07)), uc, 'seat')
    sy = lambda x, z: 0.3 + sq_top(0.5, 0.62, 0.17, 0.25, 0.3, 0.35, x, z - 0.07)
    for x, z, s in ((0.1, 0.22, 1.0), (0.14, 0.18, 0.8), (-0.06, 0.28, 0.9), (0.04, 0.3, 0.7)):
        addm(sph(0.014 * s, (x, sy(x, z) + 0.004, z), sc=(1.2, 0.7, 1), K=5, J=2, ry=x * 20), lambda p, n: mix('#9a5e2a', '#d89a58', clamp(n.z)), 'crumbs')
    # the tufted back cushion, leaning back
    with at((0, 0.6, -0.225), rx=-0.16):
        cl(squish(0.52, 0.2, 0.44, 0.3, 0.4, 0.22, ws=24, hs=10, rx=PI / 2), cloth_col(up, 0.3, 0.3), 'backcushion')
        for x, y in ((-0.12, 0.07), (0.12, 0.07), (0.0, -0.05)):
            zz = sq_top(0.52, 0.44, 0.2, 0.3, 0.4, 0.22, x, -y)
            cl(sph(0.021, (x, y, zz - 0.004), sc=(1, 1, 0.5), K=8, J=3), cloth_col(upD, 0.3), 'backcushion')
    # a cream throw pillow with a heart in the corner
    with at((-0.15, 0.55, -0.05), ry=0.38, rx=-0.22):
        cl(squish(0.27, 0.095, 0.27, 0.3, 0.4, 0.3, ws=20, hs=8, rx=PI / 2, pos=(0, 0, -0.045)), cloth_col('#fff3e0', 0.2, 0.3), 'throw')
        heart(0.1, (0, 0.0, 0.048), depth=0.016, col='#ff8fb0', tag='throw')
    return dict(h=0.86)

# ================================================================== Workbench (workbench: 3 x 1 cells, h 1.3, surface 0.88)
def build_workbench():
    top, T, W, D, zc = 0.88, 0.075, 1.46, 0.42, -0.01
    yU = top - T; legC, legL, board = '#a8703e', '#c08752', '#f4ddb4'
    steel = lambda p, n: mix('#a4aec2', '#e2e8f2', clamp(n.z * 0.6 - n.y * 0.4) * 0.7)
    F.push((0, 0, zc))
    for sx in (-1, 1):
        for sz in (-1, 1):
            addm(beam(0.085, yU, 0.085, (sx * 0.63, yU / 2, sz * 0.155), c=0.016), wood2(legC, ao_z=0.0, ao_k=0.25, grain=0.05, seed=sx + 3 * sz), 'legs')
            addm(beam(0.105, 0.026, 0.104, (sx * 0.63, 0.013, sz * 0.155)), wood2(WOOD_D, ao_z=None), 'legs')
        addm(beam(0.05, 0.06, 0.32, (sx * 0.63, 0.13, 0), c=0.012), wood2(legC, ao_z=None), 'frame')
    for sz in (-1, 1):
        addm(beam(1.18, 0.06, 0.05, (0, 0.13, sz * 0.155), c=0.012), wood2(legC, ao_z=None, grain=0.05), 'frame')
    for i in range(4):
        addm(beam(1.2, 0.024, 0.07, (0, 0.172, -0.118 + i * 0.079)), wood2('#d8a46c' if i % 2 else '#e4b27c', ao_z=None), 'shelf')
    # aprons and a little drawer with a knob
    for sz in (-1, 1):
        addm(beam(1.18, 0.11, 0.03, (0, yU - 0.055, sz * 0.178)), wood2(legL, ao_z=None, grain=0.05), 'apron')
    addm(rb(0.34, 0.082, 0.024, (0.16, yU - 0.057, 0.197), r=0.01), wood2('#e8b884', ao_z=None), 'drawer')
    addm(sph(0.019, (0.16, yU - 0.057, 0.214), sc=(1, 1, 0.8), K=7, J=4), wood2(WOOD_D, ao_z=None), 'drawer')
    # the laminated top: seven strips of slightly different honey woods, darker end grain, two knots
    tones = ['#e6b47c', '#d8a26a', '#ecbc86', '#dca86e', '#e4b078', '#d49e66', '#e8b880']; dd = D / 7
    for i, c in enumerate(tones):
        addm(rb(W, T, dd - 0.002, (0, yU + T / 2, -D / 2 + dd * (i + 0.5)), r=0.009),
             lambda p, n, c=c: mul(c, 0.8 if abs(n.x) > 0.7 else (1.04 if n.z > 0.7 else 0.9)), 'top')
    for x, z, r in ((-0.18, 0.05, 0.016), (0.42, 0.11, 0.012)):
        addm(sph(1.0, (x, top + 0.0006, z), sc=(r * 1.7, 0.0025, r), K=10, J=2), lambda p, n: '#b88050', 'top')
        addm(sph(1.0, (x, top + 0.0012, z), sc=(r * 0.8, 0.0025, r * 0.45), K=8, J=2), lambda p, n: '#8a5a36', 'top')
    # the front vice: a wooden jaw, two steel guide bars, the screw hub and a tommy bar with knob ends
    vx, vz = -0.44, D / 2
    addm(rb(0.27, 0.135, 0.05, (vx, top - 0.075, vz + 0.026), r=0.014), wood2('#c89058', ao_z=None, grain=0.05), 'vice')
    for s in (-1, 1):
        addm(gtube([(vx + s * 0.1, top - 0.1, vz + 0.058), (vx + s * 0.1, top - 0.1, vz - 0.02)], 0.01, K=6), steel, 'vice')
    addm(cyl(0.028, 0.032, 0.036, (vx, top - 0.088, vz + 0.068), K=10, rx=PI / 2), iron, 'vice')
    addm(gtube([(vx, top - 0.032, vz + 0.08), (vx, top - 0.212, vz + 0.08)], 0.011, K=7), wood2(HONEY, ao_z=None), 'vice')
    for y in (top - 0.032, top - 0.212):
        addm(sph(0.019, (vx, y, vz + 0.08), K=7, J=4), wood2('#c87a46', ao_z=None), 'vice')
    # the low shelf: a stack of planks and a mallet
    for c, x, dy, ry in (('#ecc490', -0.24, 0.0, 0.03), ('#d49a62', -0.21, 0.026, -0.05), ('#c48a52', -0.25, 0.052, 0.07)):
        with at((x, 0.184 + dy, 0.0), ry=ry):
            addm(beam(0.62, 0.026, 0.13, (0, 0.013, 0), c=0.006), lambda p, n, c=c: mul(c, 0.8 if abs(n.x) > 0.7 else (1.05 if n.z > 0.5 else 0.9)), 'planks')
    with at((0.34, 0.184, 0.0), ry=0.45):
        addm(cyl(0.046, 0.046, 0.13, (0, 0.046, 0), K=10, rz=PI / 2, bev=0.008), lambda p, n: mix('#c88c56', '#f0cc94', clamp(abs(n.x) * 1.2)), 'mallet')
        addm(gtube([(0, 0.046, 0.04), (0, 0.032, 0.22)], 0.013, K=6), wood2(HONEY, ao_z=None), 'mallet')
    # wood shavings: little curls on the top's back edge, the shelf and the floor
    def shaving(x, y, z, ry, s=1.0):
        with at((x, y, z), ry=ry, s=s):
            pts = [(0.024 * math.cos(u) * (1 - 0.25 * u / TAU), 0.012 + 0.011 * math.sin(u) * (1 - 0.25 * u / TAU), 0.006 * u) for u in (TAU * 1.4 * i / 7 for i in range(8))]
            addm(gtube(pts, lambda s_: 0.0055, K=4), lambda p, n: mix('#e2b47a', '#f8e0b0', clamp(n.z + 0.4)), 'shavings')
    shaving(0.2, top, -0.15, 0.5); shaving(-0.5, 0.0, 0.14, 2.2, 1.2)
    # a hand plane resting at the back edge of the top
    with at((0.42, top, -0.13), ry=0.22):
        addm(rb(0.2, 0.05, 0.066, (0, 0.025, 0), r=0.016), wood2('#d8a066', ao_z=None), 'plane')
        addm(box(0.03, 0.05, 0.05, (0.012, 0.06, 0), r=0.0, rz=-0.55), steel, 'plane')
        addm(gtube([(0.032, 0.05, 0), (0.05, 0.085, 0), (0.08, 0.085, 0), (0.095, 0.05, 0)], 0.01, K=6), lac('#c8584a'), 'plane')
        addm(sph(0.02, (-0.068, 0.066, 0), K=7, J=4), lac('#c8584a'), 'plane')
    # the pegboard back on two posts with a capped rail and ball finials
    pz = -0.195; fz = pz + 0.011
    for sx in (-1, 1):
        addm(beam(0.055, 1.25 - top + 0.02, 0.05, (sx * 0.69, (top - 0.02 + 1.25) / 2, pz), c=0.012), wood2(legC, ao_z=None, grain=0.05), 'pegboard')
        addm(sph(0.028, (sx * 0.69, 1.274, pz), K=8, J=5), wood2(legL, ao_z=None), 'pegboard')
    addm(rb(1.44, 0.036, 0.066, (0, 1.24, pz), r=0.014), wood2(legC, ao_z=None, grain=0.04), 'pegboard')
    addm(rb(1.33, 0.33, 0.022, (0, top + 0.215, pz), r=0.006), lambda p, n: mul(board, 0.95 + 0.05 * math.sin(p.x * 70)), 'pegboard')
    addm(rb(1.42, 0.05, 0.034, (0, top + 0.025, pz + 0.004), r=0.01), wood2(legL, ao_z=None), 'pegboard')
    holes = []
    for r_ in range(5):
        for c_ in range(22):
            x, y = -0.6 + c_ * 0.057, top + 0.085 + r_ * 0.05
            if y < 1.225: holes.append((x, y, 0.011, 0.011))
    with at((0, 0, fz + 0.0008)):
        addm(decals(holes), lambda p, n: '#9a7656', 'holes')
    def peg(x, y, L=0.042):
        addm(cyl(0.0062, 0.0062, L, (x, y, fz + L / 2), K=5, rx=PI / 2), lambda p, n: '#e8d0a0', 'pegs')
    # hammer: the head rests on two pegs, the handle hangs
    peg(-0.5, 1.142); peg(-0.44, 1.142)
    with at((-0.47, 1.17, fz + 0.03)):
        addm(rb(0.085, 0.036, 0.036, (-0.004, -0.018, 0), r=0.008), steel, 'hammer')
        addm(cyl(0.02, 0.021, 0.026, (-0.056, -0.018, 0), K=8, rz=PI / 2), steel, 'hammer')
        for s in (-1, 1):
            addm(gtube([(0.035, -0.014, s * 0.007), (0.062, -0.019, s * 0.009), (0.08, -0.042, s * 0.011)], lambda t_: 0.011 - t_ * 0.005, K=5), steel, 'hammer')
        addm(gtube([(0, -0.03, 0), (0, -0.23, 0)], lambda t_: 0.012 + 0.003 * t_, K=7), wood2(HONEY, ao_z=None), 'hammer')
        addm(cyl(0.018, 0.018, 0.06, (0, -0.215, 0), K=8), lac('#e8604a'), 'hammer')
        addm(sph(0.018, (0, -0.245, 0), K=8, J=4), lac('#e8604a'), 'hammer')
    # hand saw: hung on a peg through its handle, teeth down, the blade to the right
    peg(-0.15, 1.068)
    with at((-0.15, 1.05, fz + 0.022)):
        Ls, nT = 0.34, 18
        bl = [(0.0, 0.045), (0.0, -0.04)] + [(i / nT * Ls, -0.04 - (0.01 if i % 2 else 0.0)) for i in range(1, nT + 1)] + [(Ls, -0.004), (Ls * 0.5, 0.02)]
        with at((0.045, 0, -0.004)):
            addm(prism(bl, 0.007), lambda p, n: mix('#c4ccd8', '#f4f8fc', clamp(-n.y * 0.5 + n.z * 0.5)), 'saw')
        hs_o = rrect(0.11, 0.105, 0.038, n=3); hs_i = rrect(0.05, 0.042, 0.016, n=3, oy=0.012)
        with at((-0.004, 0, 0)):
            addm(holed_slab(hs_o, hs_i, 0.02, bev=0.006, ibev=0.004, z0=-0.012, n=16), lambda p, n: mul('#e06a58', 0.9 + 0.12 * clamp(-n.y)), 'saw')
        for x, y in ((0.038, 0.022), (0.038, -0.024)):
            addm(sph(0.0075, (x, y, 0.009), sc=(1, 1, 0.5), K=6, J=2), gold, 'saw')
    # a yellow ruler and a mint set square
    peg(0.24, 1.198, 0.03)
    addm(rb(0.038, 0.3, 0.01, (0.24, 1.065, fz + 0.008), r=0.003), lambda p, n: mix('#ffd24a', '#fff0a0', clamp(-n.y) * 0.3), 'ruler')
    with at((0, 0, fz + 0.0135)):
        addm(decals([(0.24 - 0.018 + (0.005 if i % 5 else 0.009), 0.94 + i * 0.018, 0.01 if i % 5 else 0.018, 0.003) for i in range(14)]), lambda p, n: INK, 'ruler')
    with at((0.3, 1.04, fz + 0.002)):
        addm(holed_slab([(0.0, 0.0), (0.15, 0.0), (0.0, 0.15)], [(0.03, 0.026), (0.09, 0.026), (0.03, 0.086)], 0.007, bev=0.002, ibev=0.0015, n=12),
             lambda p, n: mix('#8fe0c0', '#d8fff0', clamp(-n.y) * 0.3), 'square')
    peg(0.33, 1.15, 0.03)
    # a little ledge on the right with the jar of nails and a ball of twine
    addm(rb(0.3, 0.024, 0.1, (0.52, 1.022, fz + 0.05), r=0.008), wood2(legL, ao_z=None), 'ledge')
    for s in (-1, 1):
        addm(box(0.024, 0.05, 0.08, (0.52 + s * 0.12, 0.985, fz + 0.04), r=0.0), wood2(legC, ao_z=None), 'ledge')
    with at((0.46, 1.034, fz + 0.05)):
        jp = [(0.0, 0.0), (0.03, 0.0), (0.034, 0.006), (0.035, 0.05), (0.035, 0.062), (0.03, 0.072), (0.026, 0.076), (0.028, 0.084), (0.0, 0.07)]
        addm(glathe2(jp, 10, cfn=lambda j, k, r, z, th: ('#9aa6b8' if (j < 4 and k % 3 == 0) else ('#b4c0d0' if j < 4 else '#e0f2f4'))), None, 'jar')
        for k in range(4):
            a = k * 1.55; tt = 0.25 + (k % 3) * 0.1
            dv = Vector((math.sin(a) * tt, 1, math.cos(a) * tt)).normalized(); b0 = Vector((math.sin(a) * 0.01, 0.06, math.cos(a) * 0.01)); e0 = b0 + dv * 0.045
            addm(gtube([tuple(b0), tuple(e0)], 0.003, K=4, caps=False), lambda p, n: '#9aa2b0', 'nails')
            addm(sph(0.0065, tuple(e0), sc=(1, 0.35, 1), K=6, J=2), lambda p, n: '#c0c8d4', 'nails')
        addm(cyl(0.037, 0.037, 0.012, (-0.05, 0.03, 0.004), K=12, rz=1.2), lac('#e8403a'), 'jar')
    with at((0.585, 1.066, fz + 0.05)):
        addm(sph(0.032, (0, 0, 0), K=9, J=5), lambda p, n: '#e2c68e' if math.sin(p.z * 260 + p.x * 140) > 0 else '#c8a464', 'twine')
        addm(gtube([(0.02, -0.02, 0.02), (0.04, -0.04, 0.03), (0.045, -0.08, 0.035)], 0.0045, K=4), lambda p, n: '#d8b878', 'twine')
    F.pop()
    return dict(h=1.3)

# ================================================================== Melon Stool (melonStool: 1 x 1 cells, h 0.42)
def build_melonStool():
    ribs = 10
    prof = [(0.0, 0.0), (0.07, 0.0), (0.12, 0.01), (0.162, 0.04), (0.19, 0.085), (0.204, 0.14), (0.207, 0.2), (0.2, 0.255), (0.188, 0.296), (0.174, 0.326)]
    def Rp(y):
        for (r0, y0), (r1, y1) in zip(prof, prof[1:]):
            if y0 <= y <= y1: return r0 + (r1 - r0) * (y - y0) / max(1e-9, y1 - y0)
        return prof[-1][0]
    def rib(a): return 1 + 0.036 * math.cos(ribs * a + PI)              # a: the game angle from +z toward +x
    def rf(j, k, r, z, th):
        a = th + PI / 2; return r * (1 + (rib(a) - 1) * clamp(z / 0.06))
    LT, DK, SUT, NET = '#a6d466', '#5e9c44', '#457c36', '#eef4c8'
    def cf(j, k, r, z, th):
        a = th + PI / 2; c = math.cos(ribs * a + PI); t = clamp(z / 0.3)
        col = mix(DK, LT, 0.3 + 0.7 * t)
        if c < -0.7: col = mix(col, SUT, 0.85)
        elif c > 0.7: col = mix(col, NET, 0.45 * clamp(z / 0.08))
        if j > 0 and (j + k) % 2 == 0 and z > 0.05: col = mix(col, NET, 0.12)    # a faint netting freckle
        return col
    body = glathe2(prof, 60, th0=-PI / 2, rfn=rf, cfn=cf); body.shade = shade_soft(0.12, 0.35); addm(body, None, 'melon')
    # the cut face: a dark rind lip, a pale rind band, then a plump seat of flesh with a peachy seed hollow
    sy = 0.326; r0 = 0.174
    sp = [(r0 - 0.002, sy - 0.004), (r0 + 0.004, sy + 0.004), (r0 - 0.002, sy + 0.013), (r0 - 0.012, sy + 0.016), (r0 - 0.02, sy + 0.022),
          (0.14, sy + 0.05), (0.115, sy + 0.068), (0.08, sy + 0.08), (0.056, sy + 0.083), (0.05, sy + 0.083), (0.03, sy + 0.074), (0.0, sy + 0.068)]
    seat_c = ['#4a8a3c', '#4a8a3c', '#e8f4c4', '#e8f4c4', '#d4f0a8', '#c6ec92', '#bfe886', '#c4ea8c', '#f6dc96', '#ffbe7a', '#ffb070', '#ffc888']
    def srf(j, k, r, z, th): return r * (1 + (rib(th + PI / 2) - 1) * 0.9) if j < 3 else r
    st = glathe2(sp, 40, th0=-PI / 2, rfn=srf, cfn=lambda j, k, r, z, th: seat_c[j]); st.shade = shade_soft(0.1, 0.3); addm(st, None, 'seat')
    def topY(e):
        r = e
        for (ra, za), (rb_, zb) in zip(sp[5:], sp[6:]):
            if rb_ <= r <= ra: return za + (zb - za) * (ra - r) / max(1e-9, ra - rb_)
        return sy + 0.07
    for k in range(13):
        inner = k < 5; a = (k / 5 if inner else (k - 5) / 8) * TAU + (0.5 if inner else 0.1); r = 0.022 if inner else 0.04
        addm(sph(1.0, (math.sin(a) * r, topY(r) + 0.002, math.cos(a) * r), sc=(0.0068, 0.0045, 0.012), K=6, J=2, ry=a), lambda p, n: mix('#e8cc90', '#fff2c8', clamp(n.z)), 'seeds')
    # a sleepy face on the front: closed eyes on the two crests either side of the front valley, blush, a little smile
    def surf(a, y, out=0.0):
        rr = Rp(y) * rib(a) + out; return (math.sin(a) * rr, y, math.cos(a) * rr)
    for s in (-1, 1):
        a0 = s * PI / ribs
        pts = [surf(a0 + s * u * 0.004 + (u - 0.5) * 0.14, 0.2 - 0.012 * math.sin(PI * u), 0.003) for u in (0.0, 0.25, 0.5, 0.75, 1.0)]
        addm(gtube(pts, 0.0042, K=4), lambda p, n: INK, 'face')
        bx, by, bz = surf(s * 0.52, 0.168, 0.0)
        with atm((bx, by, bz), (math.sin(s * 0.52), 0.15, math.cos(s * 0.52))):
            addm(sph(1.0, (0, 0, 0), sc=(0.026, 0.006, 0.015), K=8, J=2), lambda p, n: '#ff9eb0', 'face')
    mp = [surf((u - 0.5) * 0.12, 0.172 - 0.01 * math.sin(PI * u), 0.0) for u in (0.0, 0.25, 0.5, 0.75, 1.0)]
    addm(gtube(mp, 0.0038, K=4), lambda p, n: INK, 'face')
    # a lobed leaf lying against the rind at the back right, a curly tendril springing up beside it
    la = 2.0; vb = surf(la, 0.275, 0.0)
    on = Vector((math.sin(la), 0.9, math.cos(la))).normalized()
    lobes = []
    for i in range(30):
        u = TAU * i / 30; rr = 0.075 * (0.62 + 0.38 * abs(math.cos(2.5 * u)) ** 0.6) * (1 - 0.25 * max(0.0, -math.cos(u)))
        lobes.append((rr * math.sin(u), rr * math.cos(u) * 0.9))
    with atm((vb[0] + on.x * 0.01, vb[1] + 0.014, vb[2] + on.z * 0.01), on, spin=la):
        with at((0, 0, 0), rx=-PI / 2):
            lf = puffy(lobes, 0.012, bev=0.005, z0=-0.006)
            addm(lf, lambda p, n: mix('#4e9c3e', '#a8d878', clamp(n.z) * 0.6), 'leaf', 'leaf')
            for u in (0.0, 1.2, -1.2):
                addm(ridge((0, 0, 0.006), (0.05 * math.sin(u), 0.05 * math.cos(u) * 0.9, 0.006), (0, 0, 1), w=0.006, hgt=0.002), lambda p, n: '#8cc860', 'leaf', 'leaf')
    tb = surf(la + 0.35, 0.31, 0.0)
    coil = []
    for i in range(16):
        t = i / 15; ang = t * TAU * 1.6; rr = 0.022 * (1 - 0.6 * t)
        coil.append((tb[0] + math.sin(la) * 0.01 + math.cos(ang) * rr * math.cos(la), tb[1] + 0.012 + t * 0.075, tb[2] + math.cos(la) * 0.01 - math.cos(ang) * rr * math.sin(la) + math.sin(ang) * rr * 0.5))
    addm(gtube(catmull([vb, (tb[0], tb[1] + 0.004, tb[2]), coil[0]], 5), 0.0065, K=5), lambda p, n: '#5a9a3c', 'vine')
    addm(gtube(coil, lambda s: 0.0055 - s * 0.0025, K=4), lambda p, n: mix('#4e8c34', '#7ab850', clamp(n.z)), 'vine')
    return dict(h=0.42)

# ================================================================== Nap Pillow (napPillow: 2 x 2 cells, h 0.42)
def build_napPillow():
    w, h, sq, edge, bot = 0.94, 0.36, 0.36, 0.4, 0.36
    ht = h / (1 + bot); hb = h - ht
    dx, dz = 0.06, -0.05
    q2 = lambda x, z: (x - dx) ** 2 / 0.06 + (z - dz) ** 2 / 0.04
    deform = lambda x, z, f: (-0.135 * math.exp(-q2(x, z)) + 0.02 * math.exp(-((q2(x, z) - 2.3) ** 2))) * f
    t = squish(w, h, w, sq, edge, bot, ws=40, hs=14, deform=deform, extra=(PI / 2 - 0.08, PI / 2 + 0.08))
    cream, shadow = '#fbf3e4', '#d8cab8'
    def pc(p, n):
        x, z = p.x, -p.y
        c = mix(cream, shadow, clamp(math.exp(-q2(x, z) * 0.8) * 0.85 + clamp(-n.z) * 0.4))
        return mul(c, 0.93 + 0.08 * clamp(n.z) + 0.03 * (vnoise(p, 20, 3) - 0.5))
    cl(t, pc, 'pillow')
    surfY = lambda x, z: sq_top(w, w, h, sq, edge, bot, x, z, deform=deform)
    # the green piping round the seam
    path = [F.W((lambda q: (q[0], hb, q[1]))(sqxy(w * 1.008, w * 1.008, sq, TAU * k / 48, 1.0))) for k in range(48)]
    cl(tube_loop(path, lambda s: 0.0125, K=5), lambda p, n: mul('#7cc07a', 0.9 + 0.14 * clamp(n.z)), 'piping')
    # ears on the back edge
    for s in (-1, 1):
        x, z = s * 0.27, -0.33; y = surfY(x, z)
        cl(sph(1.0, (x, y + 0.035, z), sc=(0.085, 0.075, 0.042), K=12, J=6, rx=0.25), lambda p, n: mix('#3a3438', '#5a5258', clamp(n.z) * 0.5), 'ears')
        cl(sph(1.0, (x, y + 0.038, z + 0.036), sc=(0.045, 0.04, 0.012), K=10, J=3, rx=0.25), lambda p, n: '#ffb6c8', 'ears')
    # the sleepy face on the front: droopy eye patches with closed eyes, a nose, blush
    def front(x, y):
        lo, hi = 0.0, 1.0
        for _ in range(26):
            m = (lo + hi) / 2
            if pillow_y(h, bot, edge, m) > y: lo = m
            else: hi = m
        e = (lo + hi) / 2
        zz = (w / 2) * max(0.0, e ** (2 / sq) - (abs(x) / (w / 2)) ** (2 / sq)) ** (sq / 2)
        return Vector((x, y, zz))
    def onfront(x, y):
        P = front(x, y); N = (front(x + 0.01, y) - front(x - 0.01, y)).cross(front(x, y + 0.01) - front(x, y - 0.01)).normalized()
        if N.z < 0: N = -N
        return P, N
    fx = 0.07
    for s in (-1, 1):
        P, N = onfront(fx + s * 0.095, 0.17)
        with atm(P + N * 0.002, N, spin=0.0):
            cl(sph(1.0, (0, 0, 0), sc=(0.054, 0.009, 0.04), K=12, J=3, ry=-s * 0.55), lambda p, n: '#3a3438', 'face')
        P, N = onfront(fx + s * 0.098, 0.172)
        with atm(P + N * 0.009, N):
            pts = [(0.018 * math.cos(u), 0.0, 0.01 * math.sin(u)) for u in (PI * i / 5 for i in range(6))]   # (local +z = down: a sleepy curve)
            cl(gtube(pts, 0.0042, K=4), lambda p, n: '#fffaf2', 'face')
        P, N = onfront(fx + s * 0.172, 0.135)
        with atm(P + N * 0.002, N):
            cl(sph(1.0, (0, 0, 0), sc=(0.03, 0.006, 0.017), K=8, J=2), lambda p, n: '#ffb0c0', 'face')
    P, N = onfront(fx, 0.142)
    with atm(P + N * 0.004, N):
        cl(sph(1.0, (0, 0, 0), sc=(0.024, 0.012, 0.015), K=8, J=3), lambda p, n: mix('#3a3438', '#6a6268', clamp(n.z)), 'face')
    # the gingham blanket over the front-left corner: on top it follows the pillow, over the edge it falls and pools
    n_, S, C = 10, 0.52, (-0.33, 0.24); ca = sa = math.sin(PI / 4)
    def place(u, v, lift):
        x = C[0] + u * ca - v * sa; z = C[1] + u * sa + v * ca; e = e_of(w, w, sq, x, z); rl = math.hypot(x, z) or 1.0
        if e <= 0.96: return Vector((x, surfY(x, z) + lift, z))
        k = 0.96 / e; ox, oz = x * k, z * k; drop = (e - 0.96) * rl / e; y0 = surfY(ox, oz) + lift
        out = 0.02 + 0.016 * clamp(drop / 0.04) + (lift - 0.014)
        y = y0 - drop; extra = 0.0
        if y < 0.004 + lift - 0.014: extra = (0.004 + lift - 0.014) - y; y = 0.004 + lift - 0.014
        return Vector((ox + x / rl * (out + extra), y, oz + z / rl * (out + extra)))
    G2 = [[place((i / n_ - 0.5) * S, (j / n_ - 0.5) * S, 0.017) for i in range(n_ + 1)] for j in range(n_ + 1)]
    G1 = [[place((i / n_ - 0.5) * S, (j / n_ - 0.5) * S, 0.009) for i in range(n_ + 1)] for j in range(n_ + 1)]
    bt = Tmp(); ti = {}; bi = {}
    for j in range(n_ + 1):
        for i in range(n_ + 1):
            ti[i, j] = bt.vert(F.W(tuple(G2[j][i]))); bi[i, j] = bt.vert(F.W(tuple(G1[j][i])))
    tone = lambda i, j: '#5aa86a' if (i in (0, n_ - 1) or j in (0, n_ - 1)) else ('#6ab87a' if (i % 2 + j % 2) == 2 else ('#b4e0b0' if (i + j) % 2 else '#fff8ec'))
    fc = []
    for j in range(n_):
        for i in range(n_):
            bt.face([ti[i, j], ti[i + 1, j], ti[i + 1, j + 1], ti[i, j + 1]], Z); fc.append(tone(i, j))
    for j in range(n_):
        for i in range(n_):
            bt.face([bi[i, j], bi[i, j + 1], bi[i + 1, j + 1], bi[i + 1, j]], -Z); fc.append(mul(tone(i, j), 0.82))
    loop = [(i, 0) for i in range(n_)] + [(n_, j) for j in range(n_)] + [(i, n_) for i in range(n_, 0, -1)] + [(0, j) for j in range(n_, 0, -1)]
    cen = sum(bt.v, Vector()) / len(bt.v)
    for k in range(len(loop)):
        a, b = loop[k], loop[(k + 1) % len(loop)]
        q = [ti[a], ti[b], bi[b], bi[a]]
        bt.face(q, sum((bt.v[i] for i in q), Vector()) / 4 - cen); fc.append('#5aa86a')
    ub = unshare_i(bt, lambda fi: fc[fi]); ub.shade = shade_soft(0.08, 0.25)
    cl(ub, None, 'blanket')
    return dict(h=0.42)

# ================================================================== Bamboo Bench (bambooBench: 3 x 1 cells, h 0.46)
def build_bambooBench():
    bam = '#cfc878'
    for i in range(5):
        addm(bamboo(1.44, 0.03, (0.07, 0.93), K=6, pos=(0, 0.33, -0.16 + i * 0.08), axis='x', c=mul(bam, 0.95 + 0.06 * (i % 2))), None, 'seat')
    for sx in (-1, 1):
        for sz in (-1, 1):
            addm(bamboo(0.34, 0.034, (0.52,), K=6, pos=(sx * 0.6, 0.17, sz * 0.17), axis='y'), None, 'legs')
            for y in (0.29, 0.1):
                addm(lash(0.034, y - 0.17, pos=(sx * 0.6, 0.17, sz * 0.17), axis='y'), None, 'lashing')
        addm(bamboo(0.44, 0.026, (0.5,), K=5, pos=(sx * 0.6, 0.29, 0), axis='z'), None, 'rails')
        addm(bamboo(0.42, 0.022, (0.5,), K=5, pos=(sx * 0.6, 0.1, 0), axis='z'), None, 'rails')
    for sz in (-1, 1):
        addm(bamboo(1.2, 0.022, (0.3, 0.7), K=5, pos=(0, 0.1, sz * 0.17), axis='x'), None, 'rails')
    # the striped cushion: a plump pad swept along x, a stripe per station pair, tufted with three buttons
    x0, x1, nS = -0.62, 0.62, 18
    xs = sorted(set([x0 + (x1 - x0) * i / nS for i in range(nS + 1)] + [-0.4, 0.0, 0.4]))
    yb = 0.36
    def prof(i):
        x = xs[i]; e = abs(x) / 0.62
        pinch = sum(math.exp(-((x - bx) / 0.05) ** 2) for bx in (-0.4, 0.0, 0.4))
        hh = (0.088 - 0.024 * e ** 6) - 0.016 * pinch; hw = 0.185 - 0.01 * e ** 6
        out = []
        for k in range(12):
            a = TAU * k / 12; c, s = math.cos(a), math.sin(a)
            u = hh / 2 + math.copysign(abs(s) ** 0.6, s) * hh / 2 * (1.0 if s > 0 else 0.9)
            out.append((math.copysign(abs(c) ** 0.45, c) * hw, u))
        return out
    path = [F.W((x, yb, 0)) for x in xs]
    sw = sweep(path, prof, up=Z, cap=True, inset=0.45, cap_d=0.012)
    cols = ['#9fdcc4', '#fff6e6', '#7cc06a', '#fff6e6']
    def stripe(cen, nn):
        x = cen.x
        if x <= x0 + 1e-4: k = 0
        elif x >= x1 - 1e-4: k = nS - 1
        else: k = min(nS - 1, int((x - x0) / ((x1 - x0) / nS)))
        return cols[k % 4]
    us = unshare(sw, stripe)
    us.shade = lambda c, p, n: mul(mix(c, '#ffffff', 0.18 * clamp(n.z) ** 2), 1 + 0.28 * min(0.0, n.z))
    cl(us, None, 'cushion')
    for bx in (-0.4, 0.0, 0.4):
        addm(sph(0.017, (bx, yb + 0.088 - 0.016 + 0.004, 0), sc=(1, 0.5, 1), K=7, J=3), lac('#5aa84a'), 'buttons')
    return dict(h=0.46)

# ================================================================== Acorn Stool (acornStool: 1 x 1 cells, h 0.44)
def build_acornStool():
    F.push((0, 0, 0), s=(0.94, 1, 0.94))
    nutP = [(0.0, 0.0), (0.07, 0.0), (0.12, 0.025), (0.17, 0.08), (0.2, 0.15), (0.21, 0.21), (0.205, 0.26), (0.19, 0.29), (0.0, 0.29)]
    def ncol(j, k, r, z, th):
        c = mix('#b8703a', '#e4a464', clamp(z / 0.26) * 0.65)
        return mul(c, 0.95 + 0.06 * math.sin(th * 14))
    nt = glathe2(nutP, 32, cfn=ncol); nt.shade = shade_lac(0.6, 0.1, 0.3); addm(nt, None, 'nut')
    # the cap: rows of overlapping scales (brick-offset bumps), light crowns and dark crevices, a rolled rim
    D_ = [(0.243, 0.29), (0.241, 0.316), (0.229, 0.34), (0.206, 0.363), (0.172, 0.383), (0.124, 0.399), (0.064, 0.409), (0.0, 0.412)]
    Ls = [0.0]
    for i in range(1, len(D_)): Ls.append(Ls[-1] + math.hypot(D_[i][0] - D_[i - 1][0], D_[i][1] - D_[i - 1][1]))
    def dome(t):
        d = t * Ls[-1]; i = 0
        while i < len(Ls) - 2 and Ls[i + 1] < d: i += 1
        u = (d - Ls[i]) / (Ls[i + 1] - Ls[i]); (r0, z0), (r1, z1) = D_[i], D_[i + 1]
        tx, tz = r1 - r0, z1 - z0; L = math.hypot(tx, tz)
        return r0 + (r1 - r0) * u, z0 + (z1 - z0) * u, tz / L, -tx / L          # point, outward normal
    capP = [(0.0, 0.252), (0.2, 0.252), (0.228, 0.264), (0.247, 0.283)]; kind = ['u', 'u', 'rim', 'rim']
    for i in range(5):
        t0 = 0.03 + i * 0.165
        r_, z_, nr, nz_ = dome(t0); capP.append((r_ + nr * 0.014, z_ + nz_ * 0.014)); kind.append(('lip', i))
        r_, z_, nr, nz_ = dome(t0 + 0.105); capP.append((r_ - nr * 0.001, z_ - nz_ * 0.001)); kind.append(('tuck', i))
    capP.append((0.0, 0.414)); kind.append('crown')
    nsc = 12
    def bump(i, th): return 0.5 + 0.5 * math.cos(nsc * th + (PI if i % 2 else 0.0))
    def crf(j, k, r, z, th):
        kd = kind[j]
        return r * (1 + 0.035 * bump(kd[1], th)) if isinstance(kd, tuple) and kd[0] == 'lip' else r
    def czf(j, k, r, z, th):
        kd = kind[j]
        return z - 0.009 * bump(kd[1], th) if isinstance(kd, tuple) and kd[0] == 'lip' else z
    def ccol(j, k, r, z, th):
        kd = kind[j]
        if kd == 'u': return '#5e3a22'
        if kd == 'rim': return '#86552e'
        if kd == 'crown': return '#7a4c2a'
        if kd[0] == 'lip': return mix('#7e5030', '#c08850', bump(kd[1], th) ** 0.8)
        return '#5c381e'
    ct = glathe2(capP, 48, th0=0.0, rfn=crf, zfn=czf, cfn=ccol); ct.shade = shade_soft(0.16, 0.3); addm(ct, None, 'cap')
    addm(gtube(catmull([(0, 0.4, 0), (0.004, 0.418, 0), (0.024, 0.432, 0.004)], 6), lambda s: 0.02 - s * 0.009, K=7), lambda p, n: mix('#6a4026', '#9a6a40', clamp(n.z)), 'stem')
    # a tiny happy face on the front of the nut
    def Rf(y):
        for (r0, y0), (r1, y1) in zip(nutP[1:-1], nutP[2:-1]):
            if y0 <= y <= y1: return r0 + (r1 - r0) * (y - y0) / (y1 - y0)
        return 0.2
    def zAt(x, y): return math.sqrt(max(0.0, Rf(y) ** 2 - x * x))
    for s in (-1, 1):
        x = s * 0.055
        addm(sph(0.016, (x, 0.172, zAt(x, 0.172) - 0.002), sc=(1, 1.3, 0.45), K=8, J=3), lambda p, n: mix(INK, '#5a4650', clamp(n.z) * 0.5), 'face')
        addm(sph(0.0055, (x + s * 0.0 + 0.004, 0.18, zAt(x, 0.18) + 0.005), K=6, J=2), lambda p, n: '#fff6ea', 'face')
        bx = s * 0.1
        addm(sph(0.022, (bx, 0.142, zAt(bx, 0.142) - 0.004), sc=(1, 0.6, 0.3), K=8, J=2, ry=s * 0.45), lambda p, n: '#ff9eb0', 'face')
    mp = [(0.018 * math.cos(PI + PI * u), 0.152 - 0.012 * math.sin(PI * u), 0.0) for u in (0.0, 0.25, 0.5, 0.75, 1.0)]
    addm(gtube([(x, y, zAt(x, y) + 0.002) for x, y, _ in mp], 0.0045, K=4), lambda p, n: INK, 'face')
    F.pop()
    return dict(h=0.44)

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

PIECES = {'chabudai': build_chabudai, 'zabutonPink': build_zabutonPink, 'zabutonBlue': build_zabutonBlue, 'woodTable': build_woodTable,
          'sideTable': build_sideTable, 'woodChair': build_woodChair, 'armchair': build_armchair, 'workbench': build_workbench,
          'melonStool': build_melonStool, 'napPillow': build_napPillow, 'bambooBench': build_bambooBench, 'acornStool': build_acornStool}
for pid in (list(PIECES) if PIECE == 'all' else PIECE.split(',')):
    A = Asset3(); F.m = Matrix.Identity(4); F.st = []
    info = PIECES[pid]()
    finish(A, info['h'], seed=sum(map(ord, pid)))
    export_piece(A, 'furn-' + pid)
