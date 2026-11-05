# PAWHAVEN: the crews' trophies (task furn-trophy): the keepsakes a crew brings home from each dungeon boss
# (docs/COZY.md 4.6; the kit builders in src/home/trophyModels.js), rebuilt in Blender by script.
#   blender --background --factory-startup --python build_furn-trophy.py -- --piece <id|all>
# writes D:/projects/chewy-life-3d/public/models/furn-<id>.glb (and furn-<id>.blend beside this script).
# Deterministic: seeded maths only; a re-run reproduces every GLB exactly.
# Frame (src/home/furnitureMesh.js): 1 unit = 1 m. The layout code is written in the kit's game frame (x right, y up,
# z = the item's front) and mapped to Blender (x, -z, y). Floor items: centred on the footprint, z = 0 at the base.
# Wall items: the back flat on the wall plane (Blender y = 0), the front toward Blender -Y, the bottom centre at the origin.
# The core kit (mesh accumulator, painted vertex colours `Col`, rounded boxes, lathes, tubes, relief slabs, faceted
# shells) is the furn-small builder's (tools/blender/work/codex/furn-small), itself from the Hollow landmarks.
# Each trophy is matched to its boss's Blender model in public/models (mochi-king, kasa-lord, oni-chef, tamamo-toy /
# tamamo-tail, tengu-master, danzaburo, umibozu): its colours, crown, fan, tails, hat and pearls.
import bpy, bmesh, math, os, sys
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..', '..'))
MODELS = os.path.join(REPO, 'public', 'models')
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
PIECE = argv[argv.index('--piece') + 1] if '--piece' in argv else 'all'
print('FT build pid', os.getpid())
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

def bronze_col(p, n):
    c = mix('#7a5230', '#d4a462', clamp(n.z * 0.5 - n.y * 0.15 + 0.05) * 0.5)
    if n.z < 0: c = mix(c, '#3a2414', -n.z * 0.55)
    v = vnoise(p, 60.0, 3)
    if v > 0.62: c = mix(c, '#5f9a84', clamp((v - 0.62) * 4) * 0.5 * clamp(0.8 - n.z))
    return c

# ================================================================== furn-trophy helpers
BLACK_LAC = '#2e2632'; RED_LAC = '#c8383c'
def gold(k=1.0):
    """polished toy gold: a warm sheen on the tops and the camera side, amber undersides"""
    return lac(mul(GOLD, k), hi='#fff2b8', lo='#a8741e')

def loc_fn():
    """a function mapping a Blender-world point to the CURRENT frame's game-local coordinates (for painting)"""
    Mi = F.m.inverted()
    def f(p):
        q = Mi @ p
        return Vector((q.x, q.z, -q.y))
    return f

def rr2(w, h, r, n=3, cx=0.0, cy=0.0):
    """a rounded-rectangle outline in the face plane (x right, y up), counter-clockwise"""
    pts = []
    for (qx, qy, a0) in ((w / 2 - r, h / 2 - r, 0.0), (-(w / 2 - r), h / 2 - r, PI / 2), (-(w / 2 - r), -(h / 2 - r), PI), (w / 2 - r, -(h / 2 - r), 1.5 * PI)):
        for i in range(n + 1):
            a = a0 + PI / 2 * i / n
            pts.append((cx + qx + r * math.cos(a), cy + qy + r * math.sin(a)))
    return pts

def bend_sphere(t, c, R):
    """wrap a flat decal built facing game +z in the plane tangent to a sphere (centre c in game coords, radius R) at
    its front onto the sphere: each vertex moves back by the sphere's sagitta at its lateral distance"""
    cb = gl(c)
    for i, v in enumerate(t.v):
        dx, dz = v.x - cb.x, v.z - cb.z
        sag = R - math.sqrt(max(0.0, R * R - dx * dx - dz * dz))
        t.v[i] = Vector((v.x, v.y + sag, v.z)); t.n[i] = None
    return t

def tassel(pos, c, L=0.07, r=0.02, K=7):
    """a silk tassel hanging from pos: a knot bead, a gold collar, the fringe (streaked by angle)"""
    x, y, z = pos
    add(sph(r * 0.66, (x, y, z), K=6, J=3), lac(mul(c, 0.92)), 'tassels')
    def tc(p, n, c=c, x=x, z=z):
        a = math.atan2(p.y + z, p.x - x)
        return paint(mul(c, 0.84 + 0.2 * (0.5 + 0.5 * math.cos(a * 7))), top=0.1, bot=0.3)(p, n)
    add(glathe([(0.0, -L), (r * 1.08, -L + 0.008), (r * 0.98, -L * 0.45), (r * 0.6, -0.004), (0.0, 0.002)], K=K, pos=(x, y - r * 0.5, z)), tc, 'tassels')
    add(cyl(r * 0.7, r * 0.7, 0.012, (x, y - r * 0.62, z), K=K), gold(), 'tassels')

def arc_param(prof):
    """an (r, y) polyline from a top pole down -> (total length, at(s) -> (r, y))"""
    S = [0.0]
    for (r0, y0), (r1, y1) in zip(prof, prof[1:]): S.append(S[-1] + math.hypot(r1 - r0, y1 - y0))
    def at_s(s):
        s = max(0.0, min(S[-1], s))
        for i in range(len(S) - 1):
            if s <= S[i + 1] or i == len(S) - 2:
                t = (s - S[i]) / max(1e-9, S[i + 1] - S[i])
                return (prof[i][0] + (prof[i + 1][0] - prof[i][0]) * t, prof[i][1] + (prof[i + 1][1] - prof[i][1]) * t)
    return S, at_s

def woven(a_col, b_col, K, th0, rings_per=1):
    """a straw weave for a faceted lathe: alternate steps round and up"""
    def f(c, fn):
        k = angle_k(c, K, th0); j = int(math.floor(c.z * 90.0))
        return a_col if (k + j) % 2 else b_col
    return f

# ================================================================== King Mochi's Crown Cushion (floor, 1 x 1, h 0.62)
# The mochi king (public/models/mochi-king.glb): a pink-white mochi with a gold crown of ball-tipped points (a ruby in
# front, green and blue jewels), an ermine collar and a brown handlebar moustache. Here: a red lacquer stand with black
# apron, gold corner caps and tassels; the plump mochi cushion asleep and proud, moustache and all, its ermine collar
# round its base; the little crown askew on top.
def build_trophyMochiCrown():
    new_asset()
    red = lac('#b43438', hi='#e8765e', lo='#7a1a26')
    # -- the stand: four toy feet with gold toes, a black lacquer apron, the red top board
    foot = [(0.0, 0.0), (0.046, 0.0), (0.054, 0.014), (0.04, 0.036), (0.036, 0.05), (0.044, 0.07), (0.05, 0.09), (0.0, 0.09)]
    for sx in (-1, 1):
        for sz in (-1, 1):
            add(gl_lathe(foot, 8, pos=(sx * 0.31, 0.0, sz * 0.31), colfn=lambda c, fn: GOLD if c.z < 0.024 else RED_LAC), fsh(0.2, 0.3, sheen=0.45), 'stand')
    add(box(0.7, 0.045, 0.7, (0, 0.1, 0), r=0.016), lac(BLACK_LAC, hi='#6a5a78'), 'stand')
    add(box(0.8, 0.05, 0.8, (0, 0.14, 0), r=0.022), red, 'stand')
    y0 = 0.165
    for k in range(4):     # a gold rim round the tray's top edge
        with at((0, y0 + 0.002, 0), ry=k * PI / 2):
            add(box(0.74, 0.008, 0.024, (0, 0, 0.375), r=0.0), gold(), 'stand')
    for sx in (-1, 1):
        for sz in (-1, 1):
            with at((sx * 0.4, y0, sz * 0.4), rx=-PI / 2):
                add(puffy([(0.0, 0.0), (-sx * 0.13, 0.0), (0.0, sz * 0.13)], 0.006, bev=0.003, z0=-0.002), gold(), 'stand')
            tassel((sx * 0.392, 0.122, sz * 0.392), '#ffc83a', L=0.07, r=0.019)
    # -- the mochi: a plump round cushion, sagging a touch, pink-white with a soft blush underneath
    mp = [(0.0, y0), (0.25, y0), (0.292, y0 + 0.026), (0.312, y0 + 0.075), (0.308, y0 + 0.13), (0.284, y0 + 0.188),
          (0.232, y0 + 0.244), (0.152, y0 + 0.288), (0.066, y0 + 0.31), (0.0, y0 + 0.314)]
    def mochi_col(p, n):
        c = mix('#ffc8d6', '#fff0f0', smooth(y0 + 0.02, y0 + 0.22, p.z))
        c = mix(c, '#fffaf6', clamp(n.z - 0.5) * 0.9)
        c = mix(c, '#ffe2ea', clamp(-n.y * 0.6 - 0.2) * 0.4)
        return mul(c, 0.97 + 0.04 * vnoise(p, 9.0, 4))
    add(gl_lathe(mp, 28, rfn=lambda r, z, th: r * (1 + 0.012 * math.sin(3 * th + 0.4) * smooth(y0, y0 + 0.1, z))), mochi_col, 'mochi')
    rf = prof_r(mp[3:])
    L = lambda th, y, lf=0.0: on_lathe(rf, th, y, lf)
    # sleepy happy eyes (closed arches), the king's handlebar moustache, pink cheeks, his chin jewel
    for s in (-1, 1):
        ye = y0 + 0.212
        add(gtube([L(s * 0.29 + d * 1.0, ye + dy, 0.007) for d, dy in ((-0.088, -0.014), (-0.046, 0.011), (0.0, 0.019), (0.046, 0.011), (0.088, -0.014))], 0.0095, K=5), flat('#3a2a30'), 'face')
        mo = [(0.012, y0 + 0.158), (0.08, y0 + 0.146), (0.16, y0 + 0.143), (0.235, y0 + 0.154), (0.28, y0 + 0.176), (0.262, y0 + 0.198), (0.228, y0 + 0.19)]
        add(gtube(catmull([L(s * a, y, 0.008) for a, y in mo], 9), lambda q: 0.018 * (1 - q) ** 0.8 + 0.0055, K=6),
            paint('#7a4a2c', hi='#b07a4a', top=0.3, bot=0.3), 'moustache')
        add_open(surf_patch(rf, 0.14, y0 + 0.17, 0.024, lift=0.003, seg=10, rings=1, th0=s * 0.47), flat('#ff9fb2'), 'face')
    with at(L(0.0, y0 + 0.112, 0.004), rx=0.3):
        add(dot(0.02, (0, 0, 0), sc=(1, 1, 0.4), K=10, J=2), gold(), 'face')
        add(dot(0.011, (0, 0, 0.007), sc=(1, 1.15, 0.6), K=8, J=2), lac('#e0283a', hi='#ff8a90'), 'face')
    # a dusting of starch on its top
    for x, z in ((-0.13, 0.08), (0.12, -0.1), (0.06, 0.14), (-0.08, -0.15)):
        yy = prof_r([(y, r) for r, y in mp[3:]])(math.hypot(x, z))
        add(sph(0.026, (x, yy - 0.003, z), sc=(1, 0.16, 0.8), K=6, J=2), flat('#fffcf8'), 'mochi')
    # the ermine collar round its base: a fluffy white roll with black tufts
    ring = [(0.302 * math.sin(TAU * k / 26), y0 + 0.024, 0.302 * math.cos(TAU * k / 26)) for k in range(26)]
    add(gloop(ring, lambda s: 0.031 + 0.003 * math.sin(s * TAU * 9), K=6), lambda p, n: mul(paint('#fff8f2', top=0.08, bot=0.3)(p, n), 0.95 + 0.06 * vnoise(p, 30.0, 2)), 'ermine')
    for k in range(9):
        a = (k + 0.5) / 9 * TAU + 0.2
        with at((0.329 * math.sin(a), y0 + 0.03 + 0.008 * (k % 2), 0.329 * math.cos(a)), ry=a):
            add(dot(0.0105, (0, 0, 0), sc=(1, 1.4, 0.5), K=8, J=2), flat('#2e2630'), 'ermine')
    # -- the crown, slipped askew on top
    R = 0.108
    with at((-0.035, y0 + 0.29, -0.01), rz=0.15, rx=-0.1, ry=0.25):
        band = [(0.0, 0.0), (R, 0.0), (R + 0.008, 0.012), (R + 0.012, 0.05), (R + 0.004, 0.058), (R - 0.008, 0.052), (R * 0.62, 0.074), (0.0, 0.084)]
        add(gl_lathe(band, 18, colfn=lambda c, fn: '#c8304a' if (math.hypot(c.x, c.y) < R - 0.004 and c.z > 0.05) else GOLD), fsh(0.2, 0.3, sheen=0.5), 'crown')
        for k in range(5):
            a = k / 5 * TAU
            with at(((R + 0.006) * math.sin(a), 0.03, (R + 0.006) * math.cos(a)), ry=a):
                with at((0, 0, 0), rx=0.16):
                    add(fan_shape([(-0.036, 0.0), (0.036, 0.0), (0.026, 0.03), (0.013, 0.064), (0.0, 0.08), (-0.013, 0.064), (-0.026, 0.03)], (0, 0, 0), T=0.009, Tb=0.007, centre=(0.0, 0.028)), gold(), 'crown')
                    add(sph(0.017, (0, 0.092, 0), K=6, J=3), gold(1.04), 'crown')
            g = k / 5 * TAU + TAU / 10
            with at(((R + 0.012) * math.sin(g), 0.026, (R + 0.012) * math.cos(g)), ry=g):
                add(dot(0.013, (0, 0, 0), sc=(1, 1.2, 0.55), K=8, J=2), lac(('#3ab070', '#3a7ad8')[k % 2], hi='#e8fff0'), 'crown')
        with at(((R + 0.013) * math.sin(0.0), 0.026, (R + 0.013)), ry=0.0):
            add(dot(0.018, (0, 0, 0), sc=(1, 1.2, 0.55), K=10, J=2), lac('#e0283a', hi='#ff9aa0'), 'crown')

# ================================================================== Karakasa's Umbrella Stand (floor, 0.5 x 0.5, h 1.22)
# Lord Karakasa (public/models/kasa-lord.glb): a red paper umbrella with scalloped folds, gold-orange tassels on its hem,
# a little gold crown on its tip, a paper ofuda with a red seal, one big eye, pink blush and a long pink tongue. Here
# he is folded up and stood in a blue-and-white glazed stand the way he stands in the fight (tip up, his one leg in the
# pot), tied with a gold cord; his eye half-lidded in a sly wink, the tongue lolling over the pot lip.
def build_trophyKasaStand():
    new_asset()
    COB = '#2f5cb4'; PORC = '#f2f5fb'
    # -- the glazed pot: rolled lip, a dark mouth, cobalt bands and a row of seigaiha wave crests
    pot = [(0.0, 0.0), (0.13, 0.0), (0.146, 0.014), (0.158, 0.05), (0.166, 0.13), (0.167, 0.22), (0.16, 0.305), (0.148, 0.352),
           (0.15, 0.37), (0.16, 0.388), (0.152, 0.402), (0.134, 0.398), (0.128, 0.372), (0.0, 0.335)]
    def pot_col(c, fn):
        r = math.hypot(c.x, c.y)
        if c.z > 0.33 and r < 0.14 and fn.z > -0.2: return '#1e2a4a'
        if 0.018 < c.z < 0.062 or 0.318 < c.z < 0.36: return COB
        if c.z > 0.375: return '#e8eef8'
        return PORC
    add(gl_lathe(pot, 20, colfn=pot_col), fsh(0.12, 0.3, sheen=0.55), 'pot')
    rfp = prof_r(pot[2:8])
    for k in range(8):
        th = (k + 0.5) / 8 * TAU; y = 0.15; rp = rfp(y)
        for rr, c in ((0.04, COB), (0.024, '#3f6cc4')):
            pts = [on_lathe(rfp, th + rr / rp * math.cos(PI * i / 4), y + rr * math.sin(PI * i / 4), 0.003) for i in range(5)]
            add(gtube(pts, 0.0062, K=3, caps=False), flat(c), 'waves')
    # -- his leg (the bamboo shaft) going down into the pot
    add(cyl(0.017, 0.017, 0.14, (0, 0.39, 0), K=6), paint('#c8a070', top=0.2, bot=0.3), 'umbrella')
    # -- the folded canopy: eight paper folds gathered over his leg, bulging, tapering up to the tip
    NF = 8
    cp = [(0.0, 0.45), (0.09, 0.452), (0.138, 0.472), (0.158, 0.52), (0.165, 0.585), (0.158, 0.66), (0.142, 0.745), (0.116, 0.842),
          (0.086, 0.938), (0.054, 1.024), (0.026, 1.084), (0.0, 1.104)]
    fold = lambda r, z, th: r * (1 - 0.15 * (0.5 - 0.5 * math.cos(NF * th)))
    def canopy_col(p, n):
        a = math.atan2(p.y, p.x) + PI / 2       # (0 at the front: game +z = Blender -y)
        f = 0.5 + 0.5 * math.cos(NF * a)
        c = mix('#b82a32', '#ea4a42', f)
        c = mix(c, '#ff8a72', clamp(f * (n.z * 0.6 - n.y * 0.4)) * 0.45)
        return mul(c, 0.92 + 0.1 * clamp(n.z * 0.5 + 0.5))
    t = lathe(cp, NF * 4, th0=-PI / 2, rfn=lambda r, z, th: fold(r, z, th + PI / 2)); t.xform(F.m)
    add(t, canopy_col, 'umbrella')
    rfc = prof_r(cp[1:])
    # gold-orange tassels on the hem, one at each fold rib
    for k in range(NF):
        th = k / NF * TAU
        x, z = 0.146 * math.sin(th), 0.146 * math.cos(th); Lt = 0.05; rt = 0.016
        def tc(p, n, x=x, z=z):
            a = math.atan2(p.y + z, p.x - x)
            return paint(mix('#f8b838', '#e0802a', 0.5 + 0.5 * math.cos(a * 5)), top=0.15, bot=0.3)(p, n)
        add(glathe([(0.0, -Lt), (rt, -Lt + 0.008), (rt * 0.85, -Lt * 0.4), (rt * 0.5, -0.008), (rt * 0.8, 0.002), (0.0, 0.012)], K=5, pos=(x, 0.466, z)), tc, 'tassels')
    # the gold tie cord round the folds
    yc = 0.8
    add(gloop([(0.12 * math.sin(TAU * k / 18), yc + 0.006 * math.sin(TAU * k / 9), 0.12 * math.cos(TAU * k / 18)) for k in range(18)], 0.0075, K=3),
        lambda p, n: mix('#f4c040', '#c88a20', 0.5 + 0.5 * math.sin((p.x * 3 + p.y * 2) * 60)), 'cord')
    # -- the face: the big eye with a dark rim, a heavy lid in a sly wink, lashes; blush; the mouth and the long tongue
    ye = 0.62
    E = Vector(on_lathe(rfc, 0.0, ye, 0.0))
    add(dot(0.083, (0, ye + 0.002, E.z - 0.02), sc=(1, 1.02, 0.36), K=12, J=3), flat('#2a1a22'), 'eye')
    add(dot(0.073, (0, ye, E.z - 0.014), sc=(1, 1.05, 0.44), K=16, J=3), lambda p, n: mix('#fffaf2', '#ece2ea', clamp(-n.z * 0.8)), 'eye')
    add(dot(0.042, (0.004, ye - 0.014, E.z + 0.012), sc=(1, 1.06, 0.42), K=14, J=2), lambda p, n: mix('#5a3020', '#a8683a', clamp(-n.z * 0.7 + 0.2)), 'eye')
    add(dot(0.025, (0.005, ye - 0.016, E.z + 0.022), sc=(1, 1.06, 0.4), K=12, J=2), flat('#22161c'), 'eye')
    add(dot(0.011, (-0.012, ye - 0.003, E.z + 0.03), sc=(1, 1, 0.5), K=8, J=2), flat('#fffaf2'), 'eye')
    add(sph(0.078, (0, ye + 0.034, E.z - 0.016), sc=(1.02, 0.6, 0.4), K=10, J=3), canopy_col, 'eye')
    def sclera_z(x, y): return E.z - 0.014 + 0.073 * 0.44 * math.sqrt(max(0.0, 1 - (x / 0.073) ** 2 - ((y - ye) / 0.077) ** 2))
    def lid_z(x, y): return E.z - 0.016 + 0.078 * 0.4 * math.sqrt(max(0.0, 1 - (x / 0.0796) ** 2 - ((y - ye - 0.034) / 0.0468) ** 2))
    def lid_edge(x):           # where the lid surface comes out in front of the eyeball (bisection up from below)
        lo_, hi_ = ye - 0.03, ye + 0.07
        for _ in range(30):
            m = (lo_ + hi_) / 2
            if lid_z(x, m) > sclera_z(x, m): hi_ = m
            else: lo_ = m
        return (lo_ + hi_) / 2
    xs = [-0.066, -0.044, -0.022, 0.0, 0.022, 0.044, 0.066]
    lash = [(x, lid_edge(x), max(lid_z(x, lid_edge(x)), sclera_z(x, lid_edge(x))) + 0.002) for x in xs]
    add(gtube(lash, lambda s: 0.0055 + 0.0025 * math.sin(PI * s), K=4), flat('#2a1a22'), 'eye')
    for x0, ax in ((0.058, 1.0), (0.068, 0.55)):
        y0_ = lid_edge(x0); z0_ = sclera_z(x0, y0_) + 0.002
        add(gtube([(x0, y0_, z0_), (x0 + 0.026 * math.sin(ax), y0_ + 0.012 * math.cos(ax), z0_ + 0.004)], lambda s: 0.006 - 0.003 * s, K=4), flat('#2a1a22'), 'eye')
    for s in (-1, 1):
        add_open(surf_patch(rfc, 0.15, ye - 0.05, 0.022, lift=0.004, seg=10, rings=1, th0=s * 0.7), flat('#ff98b0'), 'eye')
    add_open(surf_patch(rfc, 0.3, 0.525, 0.014, lift=0.003, seg=12, rings=1, th0=0.0), flat('#5a1a28'), 'mouth')
    tp = catmull([(0.004, 0.528, rfc(0.528) - 0.012), (0.01, 0.51, rfc(0.51) + 0.012), (0.014, 0.47, 0.178), (0.008, 0.42, 0.19), (-0.008, 0.37, 0.19), (-0.016, 0.336, 0.178)], 9)
    P = [F.W(p) for p in tp]
    def tprof(i):
        s_ = i / 8; w = 0.02 + 0.006 * math.sin(PI * s_ * 0.9) - 0.002 * s_; u = 0.0075
        return [(w * math.cos(TAU * k / 8), u * math.sin(TAU * k / 8)) for k in range(8)]
    add(sweep(P, tprof, up=Vector((0, -1, 0)), cap=True, inset=0.45, cap_d=0.008),
        lambda p, n: mix('#e85a74', '#ff8ea2', clamp(-n.y * 0.6 + n.z * 0.3 + 0.2)), 'tongue')
    # -- the ofuda on his front: a cream paper slip with a red seal ring and a red stripe
    th = 0.48; yo = 0.88
    with at(on_lathe(rfc, th, yo, 0.008), ry=th):
        with at((0, 0, 0), rx=-0.3, rz=0.08):
            add(rb(0.072, 0.13, 0.012, (0, 0, 0), r=0.005), paint('#fff2d8', top=0.1, bot=0.25), 'ofuda')
            add(gloopc([(0.019 * math.cos(TAU * k / 10), 0.008 + 0.019 * math.sin(TAU * k / 10), 0.008) for k in range(10)], 0.005, K=3), flat('#d8303a'), 'ofuda')
            add(dot(0.008, (0, 0.008, 0.008), sc=(1, 1, 0.5), K=8, J=2), flat('#d8303a'), 'ofuda')
            add(box(0.009, 0.026, 0.006, (0, 0.05, 0.006), r=0.0), flat('#d8303a'), 'ofuda')
            add(box(0.009, 0.03, 0.006, (0, -0.036, 0.006), r=0.0), flat('#d8303a'), 'ofuda')
    # -- his little gold crown on the tip
    R = 0.046
    with at((0, 1.07, 0), rz=-0.08):
        add(gl_lathe([(0.0, 0.0), (R, 0.0), (R + 0.006, 0.01), (R + 0.008, 0.032), (R + 0.002, 0.036), (R * 0.6, 0.042), (0.0, 0.046)], 10), gold(), 'crown')
        for k in range(5):
            a = k / 5 * TAU
            with at(((R + 0.004) * math.sin(a), 0.022, (R + 0.004) * math.cos(a)), ry=a):
                with at((0, 0, 0), rx=0.14):
                    add(fan_shape([(-0.022, 0.0), (0.022, 0.0), (0.014, 0.024), (0.0, 0.054), (-0.014, 0.024)], (0, 0, 0), T=0.007, Tb=0.006, centre=(0.0, 0.02)), gold(), 'crown')
                    add(sph(0.013, (0, 0.064, 0), K=5, J=3), gold(1.04), 'crown')
        add(dot(0.012, (0, 0.018, R + 0.01), sc=(1, 1.2, 0.55), K=8, J=2), lac('#e0283a', hi='#ff9aa0'), 'crown')

# ================================================================== Gorobei's Cleaver Plaque (wall, 1 x 0.5, h 0.46)
# Oni Chef Gorobei (public/models/oni-chef.glb): a red oni in a white toque and apron with little cream horns, a big
# pale steel cleaver (a hanging hole at the top corner, a brown handle) and a steel ladle. Here: a walnut board with a
# raised panel and a twisted rope border, his cleaver and ladle crossed on it, a red lacquer medallion of three
# dumplings where they cross, his two little horns carved on the top corners.
def resample_2d(poly, n):
    """n points evenly spaced by arc length round a closed 2-D outline"""
    P = [Vector((x, y, 0)) for x, y in poly] + [Vector((poly[0][0], poly[0][1], 0))]
    Q = resample(P, n + 1)[:-1]
    return [(q.x, q.y) for q in Q]

def build_trophyOniCleaver():
    new_asset()
    WAL = '#7a4e34'; WAL_L = '#9a6a48'
    def walnut(base, seed=0):
        def f(p, n):
            c = mul(base, 1 + 0.07 * math.sin(p.z * 70 + math.sin(p.x * 9) * 1.6 + vnoise(p, 6.0, seed) * 2.0))
            return paint(c, top=0.2, bot=0.3)(p, n)
        return f
    yc = 0.205
    # -- the board, the raised panel, the twisted rope border
    add(puffy(rr2(0.9, 0.37, 0.06, n=3, cy=yc), 0.03, bev=0.01, z0=0.0), walnut(WAL), 'board')
    add(puffy(rr2(0.8, 0.28, 0.04, n=2, cy=yc), 0.01, bev=0.005, z0=0.028), walnut(WAL_L, 3), 'board')
    rope = [(x, y, 0.034) for x, y in resample_2d(rr2(0.845, 0.322, 0.05, n=3, cy=yc), 28)]
    add(gloop(rope, 0.0095, K=3), lambda p, n: mix('#ead2a0', '#b88a58', 0.5 + 0.5 * math.sin((p.x + p.z) * 150)), 'rope')
    # -- his two little horns on the top corners (cream, a buttery tip)
    for s in (-1, 1):
        hp = [(s * 0.35, 0.36, 0.03), (s * 0.358, 0.39, 0.03), (s * 0.372, 0.42, 0.03), (s * 0.392, 0.445, 0.03)]
        add(gtube(catmull(hp, 6), lambda q: 0.024 * (1 - q) ** 0.9 + 0.006, K=5),
            lambda p, n: paint(mix('#f2d690', '#fff4d8', smooth(0.37, 0.44, p.z)), top=0.25, bot=0.3)(p, n), 'horns')
    # -- the cleaver: a broad pale steel blade (its hanging hole at the top corner), a wood handle with a brass ferrule
    with at((0.01, yc, 0.0), rz=0.42, s=1.3):
        Lf = loc_fn()
        def steel(p, n):
            q = Lf(p)
            c = mix('#a8b4c4', '#e8eef6', smooth(-0.07, 0.05, q.y))
            if q.y < -0.058: c = mix(c, '#f4f8fc', 0.6)                        # (the bright blunt toy edge)
            return mix(c, '#ffffff', clamp(n.z * 0.4 - n.y * 0.5) ** 2 * 0.5)
        add(puffy(rr2(0.21, 0.15, 0.022, n=2, cx=0.1, cy=0.0), 0.014, bev=0.006, z0=0.04), steel, 'cleaver')
        add(gloopc([(0.172 + 0.016 * math.cos(TAU * k / 10), 0.046 + 0.016 * math.sin(TAU * k / 10), 0.055) for k in range(10)], 0.005, K=3), flat('#8a96a8'), 'cleaver')
        add(dot(0.0145, (0.172, 0.046, 0.05), sc=(1, 1, 0.2), K=10, J=2), flat('#4a3226'), 'cleaver')
        add(cyl(0.02, 0.022, 0.016, (-0.004, 0.0, 0.05), K=8, rz=PI / 2), gold(0.9), 'cleaver')
        add(cyl(0.019, 0.021, 0.17, (-0.095, 0.0, 0.05), K=8, rz=PI / 2), lambda p, n: paint(mix('#a8683a', '#c88a52', 0.5 + 0.5 * math.sin(p.x * 120)), top=0.25, bot=0.3)(p, n), 'cleaver')
        for x in (-0.06, -0.09):
            add(cyl(0.023, 0.023, 0.012, (x, 0.0, 0.05), K=8, rz=PI / 2), lac('#d8383a'), 'cleaver')
        add(sph(0.024, (-0.182, 0.0, 0.05), sc=(0.8, 1, 1), K=7, J=3), lac(BLACK_LAC, hi='#6a5a70'), 'cleaver')
    # -- the ladle: a long steel handle with a hook end and a round bowl facing out, crossed the other way
    with at((-0.01, yc, 0.0), rz=PI - 0.42, s=1.3):
        Lf2 = loc_fn()
        def steel2(p, n):
            return mix(mix('#98a4b6', '#dfe6f0', clamp(n.z * 0.5 - n.y * 0.4 + 0.3)), '#ffffff', clamp(-n.y * 0.6 + n.z * 0.3 - 0.3) * 0.5)
        add(gtube([(-0.25, 0.012, 0.046), (-0.235, 0.0, 0.05), (-0.1, 0.0, 0.05), (0.06, 0.0, 0.05), (0.14, 0.0, 0.05)], lambda q: 0.0105, K=6), steel2, 'ladle')
        cup = [(0.0, -0.002), (0.034, 0.002), (0.054, 0.014), (0.062, 0.03), (0.064, 0.038), (0.056, 0.04), (0.048, 0.03), (0.032, 0.022), (0.0, 0.018)]
        def cup_col(p, n):
            q = Lf2(p); inner = math.hypot(q.x - 0.198, q.y) < 0.056 and -n.y > 0.25 and q.z > 0.046
            return mix('#6e7a8e', '#dce4ee', clamp((q.y + 0.03) * 12) * clamp((q.x - 0.17) * 12)) if inner else steel2(p, n)
        add(gl_lathe(cup, 14, pos=(0.198, 0.0, 0.032), rx=PI / 2), cup_col, 'ladle')
    # -- the medallion where they cross: red lacquer, a gold rim, three dumplings with pleated tops
    with at((0.0, yc, 0.03), s=1.2):
        add(puffy(circ_ol(14, 0.064), 0.014, bev=0.006, z0=0.058), lac(RED_LAC, hi='#f0806a', lo='#8a1e2a'), 'medallion')
        add(gloopc([(0.064 * math.cos(TAU * k / 14), 0.064 * math.sin(TAU * k / 14), 0.07) for k in range(14)], 0.0065, K=3), gold(), 'medallion')
        for dx, dy, c in ((-0.024, -0.014, '#fff4e4'), (0.024, -0.014, '#ffdce4'), (0.0, 0.02, '#ddf0c8')):
            add(sph(0.023, (dx, dy, 0.078), sc=(1, 0.86, 0.66), K=7, J=3), lambda p, n, c=c: paint(c, top=0.08, bot=0.3)(p, n), 'medallion')
            add(sph(0.009, (dx, dy + 0.016, 0.086), sc=(1.3, 1, 0.8), K=5, J=2), lambda p, n, c=c: paint(mul(c, 0.9), top=0.2, bot=0.3)(p, n), 'medallion')
    # -- two brass nail heads that hang it
    for s in (-1, 1):
        add(dot(0.013, (s * 0.3, 0.335, 0.034), sc=(1, 1, 0.5), K=8, J=2), gold(0.9), 'board')

# ================================================================== Tamamo's Moon Lantern (light, 0.5 x 0.5, h 1.16)
# Tamamo (public/models/tamamo-toy.glb, tamamo-tail.glb): a white fox in a violet kimono with gold trim, a gold crescent
# moon in her hair and a white kitsune mask with red markings; her tails are fat teardrops, white at the root, lilac in
# the middle and sky blue at the tip. Here: a violet lacquer base with a gold rim, her nine tails fanned up behind the
# post like a peacock's train, a violet post with gold rings and a gold crescent finial, a crook holding the paper moon
# (glow) with her fox mask on its face and a lilac tassel beneath.
def build_trophyMoonLantern():
    new_asset()
    VIO = '#4c3e9e'; VIO_D = '#352a6e'
    # -- the base: violet lacquer, a gold band round its foot
    base = [(0.0, 0.0), (0.2, 0.0), (0.208, 0.012), (0.202, 0.03), (0.17, 0.05), (0.11, 0.064), (0.0, 0.068)]
    add(gl_lathe(base, 22, colfn=lambda c, fn: GOLD if 0.004 < c.z < 0.026 and math.hypot(c.x, c.y) > 0.19 else VIO), fsh(0.2, 0.3, sheen=0.5), 'base')
    # -- the nine tails: fat teardrops sweeping up and out behind the post, the tips flicking outward
    root = (0.0, 0.05, -0.015)
    prof = [(0.0, 0.0), (0.05, 0.03), (0.1, 0.08), (0.138, 0.15), (0.158, 0.23), (0.162, 0.31), (0.158, 0.38), (0.17, 0.445)]
    paths = []
    for k in range(9):
        a = (k - 4) / 4 * 1.45
        up = 1.0 - 0.32 * (abs(k - 4) / 4) ** 1.3 + 0.04 * (k % 2)
        d = (math.sin(a), -math.cos(a))
        pts = [(root[0] + d[0] * u, root[1] + y * up, root[2] + d[1] * u) for u, y in prof]
        paths.append(catmull(pts, 9))
    for k, P in enumerate(paths):
        W = [F.W(p) for p in P]
        def tail_col(p, n, W=W, k=k):
            best, bi = 1e9, 0
            for i, q in enumerate(W):
                dd = (p - q).length_squared
                if dd < best: best, bi = dd, i
            s_ = bi / (len(W) - 1)
            c = mix('#fbf8ff', '#d6c4f6', smooth(0.38, 0.72, s_))
            c = mix(c, '#a6d2fa', smooth(0.78, 0.98, s_))
            c = mul(c, 0.94 + 0.08 * clamp(n.z * 0.5 + 0.5) + 0.04 * (vnoise(p, 40.0, k) - 0.5))
            return c
        add(gtube(P, lambda s_: 0.01 + 0.058 * math.sin(PI * min(1.0, s_) ** 0.8) * (1 - 0.1 * s_), K=7), tail_col, 'tails')
    # -- the post: violet lacquer with gold rings, the crook arm, a gold crescent finial
    pz = -0.05
    add(cyl(0.018, 0.02, 0.98, (0, 0.55, pz), K=8), lac(VIO_D, hi='#7a6ab8'), 'post')
    for y in (0.36, 0.7, 1.0):
        add(cyl(0.024, 0.024, 0.018, (0, y, pz), K=8, bev=0.004), gold(), 'post')
    crook = catmull([(0, 1.02, pz), (0, 1.055, pz + 0.03), (0, 1.06, pz + 0.09), (0, 1.04, pz + 0.125), (0, 1.012, pz + 0.128)], 7)
    add(gtube(crook, 0.014, K=6), lac(VIO_D, hi='#7a6ab8'), 'post')
    with at((0, 1.11, pz), rz=0.35):     # (her hair ornament: a plump gold crescent, horns up)
        arc = [(0.034 * math.cos(a), 0.034 * math.sin(a), 0.0) for a in [PI * (0.12 + 1.36 * i / 8) for i in range(9)]]
        add(gtube(arc, lambda s_: 0.004 + 0.012 * math.sin(PI * s_), K=6), gold(), 'post')
    add(sph(0.016, (0, 1.065, pz), K=6, J=3), gold(), 'post')
    # -- the moon: a round paper lantern (glow), soft maria, lacquer caps, its cord and the lilac tassel
    R = 0.16; cy = 0.82; hz = pz + 0.125
    add(cyl(0.006, 0.006, 0.05, (0, cy + R + 0.016, hz), K=5), flat('#3a2f66'), 'moon')
    def moon_col(p, n):
        m = vnoise(p, 11.0, 7); m2 = vnoise(p, 26.0, 9)
        c = mix('#fff6de', '#f2deb2', clamp(m * 1.6 - 0.62) * 0.8 + clamp(m2 - 0.6) * 0.5)
        return mix(c, '#fffcf2', clamp(n.z) * 0.3)
    add(sph(R, (0, cy, hz), K=18, J=10), moon_col, 'moon', 'glow')
    for s in (1, -1):
        cap = [(0.0, 0.0), (0.052, 0.0), (0.056, 0.012 * s), (0.04, 0.022 * s), (0.0, 0.024 * s)]
        add(glathe(sorted(cap, key=lambda q: q[1]), K=10, pos=(0, cy + s * (R - 0.012), hz)), lac(VIO_D, hi='#7a6ab8'), 'moon')
    tassel((0, cy - R - 0.026, hz), '#b8a0ec', L=0.085, r=0.02, K=7)
    # -- the fox mask on the moon face: white, pointed ears, red markings, closed smiling eyes, a little nose
    mc = (0, cy, hz)
    mk = [(0.0, -0.062), (0.03, -0.054), (0.052, -0.022), (0.058, 0.012), (0.07, 0.07), (0.036, 0.04), (0.0, 0.046),
          (-0.036, 0.04), (-0.07, 0.07), (-0.058, 0.012), (-0.052, -0.022), (-0.03, -0.054)]
    zf = hz + R - 0.002
    with at((0, cy, zf)):
        t = puffy(mk[::-1], 0.008, bev=0.004, z0=0.0, centre=(0.0, 0.0))
    add(bend_sphere(t, mc, R + 0.004), lambda p, n: mix('#fbf6f0', '#ffffff', clamp(-n.y)), 'mask')
    zd = zf + 0.009
    def onmask(t): return bend_sphere(t, mc, R + 0.004)
    with at((0, cy, zd)):
        for s in (-1, 1):
            add(onmask(fan_shape([(s * 0.04, 0.036), (s * 0.06, 0.058), (s * 0.05, 0.03)], (0, 0, 0), T=0.003)), flat('#e04a3a'), 'mask')
            add(onmask(gtube([(s * 0.036, 0.004, 0.0), (s * 0.023, 0.013, 0.0), (s * 0.01, 0.005, 0.0)], 0.005, K=4)), flat('#3a2a30'), 'mask')
            add(onmask(gtube([(s * 0.012, 0.026, 0.0), (s * 0.03, 0.03, 0.0)], 0.0055, K=4)), flat('#e04a3a'), 'mask')
            add(onmask(gtube([(s * 0.03, -0.016, 0.0), (s * 0.05, -0.008, 0.0)], 0.005, K=4)), flat('#e04a3a'), 'mask')
        add(onmask(dot(0.009, (0, -0.032, 0.0), sc=(1.2, 0.9, 0.5), K=8, J=2)), flat('#3a2a30'), 'mask')
        add(onmask(gtube([(-0.012, -0.046, 0.0), (0.0, -0.042, 0.0), (0.012, -0.046, 0.0)], 0.0045, K=4)), flat('#e04a3a'), 'mask')

# ================================================================== Tengu's Fan Stand (decor, 1 x 0.5, h 1.24)
# Master Tengu (public/models/tengu-master.glb): a crow tengu in indigo with white pom-poms on his sash; his great fan is
# a round fan of long indigo feathers round a white chrysanthemum with a gold heart, on a brown wooden grip. Here: a
# black lacquer display stand (a red plinth, two curved uprights with gold balls, a gold ring holding the grip) and the
# fan standing upright in it, tilted back a touch; two white pom-poms hang from the ring on a red cord.
def feather_ol(L, W):
    return [(0.0, 0.0), (0.22 * W, 0.06 * L), (0.45 * W, 0.22 * L), (0.5 * W, 0.45 * L), (0.46 * W, 0.68 * L), (0.34 * W, 0.86 * L),
            (0.16 * W, 0.97 * L), (0.0, L), (-0.16 * W, 0.97 * L), (-0.34 * W, 0.86 * L), (-0.46 * W, 0.68 * L), (-0.5 * W, 0.45 * L),
            (-0.45 * W, 0.22 * L), (-0.22 * W, 0.06 * L)]

def build_trophyTenguFan():
    new_asset()
    blk = lac(BLACK_LAC, hi='#6a5e7a')
    # -- the stand
    add(box(0.68, 0.05, 0.28, (0, 0.025, 0), r=0.02), blk, 'stand')
    add(box(0.58, 0.026, 0.2, (0, 0.063, 0), r=0.012), lac('#8a2c26', hi='#d8705a'), 'stand')
    for s in (-1, 1):
        up = catmull([(s * 0.21, 0.07, -0.01), (s * 0.232, 0.2, -0.02), (s * 0.19, 0.33, -0.014), (s * 0.075, 0.428, 0.0)], 8)
        add(gtube(up, lambda q: 0.021 - 0.004 * q, K=6), blk, 'stand')
        add(sph(0.027, (s * 0.21, 0.09, -0.01), K=7, J=4), gold(), 'stand')
        add(sph(0.018, (s * 0.06, 0.43, 0.0), K=6, J=3), gold(), 'stand')
    add(gloopc([(0.036 * math.cos(TAU * k / 14), 0.43, 0.036 * math.sin(TAU * k / 14)) for k in range(14)], 0.009, K=4), gold(), 'stand')
    # -- the fan, tilted back a touch
    with at((0, 0.0, 0.0), rx=-0.1):
        wood_c = lambda p, n: paint(mix('#7a4a2a', '#a8683c', 0.5 + 0.5 * math.sin(p.z * 160)), top=0.25, bot=0.3)(p, n)
        add(cyl(0.026, 0.021, 0.42, (0, 0.59, 0), K=8), wood_c, 'grip')
        add(sph(0.026, (0, 0.38, 0), sc=(1, 0.8, 1), K=7, J=3), gold(), 'grip')
        for y in (0.44, 0.76):
            add(cyl(0.029, 0.029, 0.02, (0, y, 0), K=8, bev=0.004), gold(), 'grip')
        C = (0, 0.86, 0)
        # the feathers: a back ring of long dark indigo ones, a front ring of shorter, lighter ones between them
        layers = ((11, 2.15, 0.37, 0.125, -0.014, '#22306a', '#40589e'), (10, 1.95, 0.28, 0.105, 0.0, '#30428a', '#5a7cc4'), (8, 1.75, 0.18, 0.085, 0.012, '#3e56a4', '#7a98d8'))
        for li, (N, span, L0, W, dz, dark, light) in enumerate(layers):
            for k in range(N):
                u = (k / (N - 1)) * 2 - 1; a = u * span
                L = L0 * (1 - 0.14 * abs(u) ** 1.5)
                with at((C[0], C[1], C[2] + dz - 0.004 * abs(u)), rz=-a):
                    with at((0, 0, 0), rx=0.1 + 0.04 * li):
                        Lf = loc_fn()
                        def fc(p, n, Lf=Lf, L=L, W=W, dark=dark, light=light):
                            q = Lf(p); e = clamp(abs(q.x) / (0.5 * W)); al = clamp(q.y / L)
                            c = mix(dark, light, e * 0.75 + smooth(0.78, 1.0, al) * 0.45)
                            return mul(c, 0.95 + 0.08 * clamp(-n.y * 0.6 + n.z * 0.4))
                        add(fan_shape(feather_ol(L, W), (0, 0, 0), T=0.008, Tb=0.006, centre=(0.0, 0.5 * L)), fc, 'feathers')
                        add(gtube([(0.0, 0.03, 0.007), (0.0, 0.5 * L, 0.009), (0.0, 0.84 * L, 0.006)], 0.005, K=3, caps=False), flat(mix(light, '#e8e0d0', 0.35)), 'feathers')
        # the heart of the fan: an indigo boss, a white chrysanthemum, a gold centre
        with at((C[0], C[1], C[2] + 0.024), s=1.35):
            add(puffy(circ_ol(16, 0.072), 0.012, bev=0.005, z0=0.0), lac('#1e2a5e', hi='#4a5aa0'), 'flower')
            for k in range(12):
                a = k / 12 * TAU
                with at((0, 0, 0.012), rz=-a):
                    pet = [(0.0, 0.018), (0.012, 0.03), (0.014, 0.05), (0.008, 0.066), (0.0, 0.07), (-0.008, 0.066), (-0.014, 0.05), (-0.012, 0.03)]
                    add(fan_shape(pet, (0, 0, 0), T=0.007, Tb=0.004, centre=(0.0, 0.045)), lambda p, n: mix('#e8e4ee', '#fffcf6', clamp(-n.y * 0.7 + n.z * 0.3 + 0.3)), 'flower')
            add(dot(0.026, (0, 0, 0.022), sc=(1, 1, 0.6), K=12, J=3), lac('#f4b830', hi='#fff0a0', lo='#c87a1a'), 'flower')
    # -- the red cord with two white pom-poms, hanging from the ring
    for x1, y1, z1 in ((0.05, 0.27, 0.07), (-0.035, 0.31, 0.065)):
        add(gtube(catmull([(0.0, 0.425, 0.04), (x1 * 0.6, 0.38, z1 * 0.9), (x1, y1 + 0.03, z1)], 5), 0.0055, K=3), flat('#d8383a'), 'poms')
        add(sph(0.04, (x1, y1, z1), K=8, J=5), lambda p, n: mul(paint('#fbf8f2', top=0.06, bot=0.25)(p, n), 0.95 + 0.07 * vnoise(p, 70.0, 3)), 'poms')

# ================================================================== Danzaburo's Leaf Sake Jar (decor, 0.5 x 0.5, h 0.7)
# Danzaburo (public/models/danzaburo.glb): a tanuki in stone armour, a wide amber straw hat with a round green leaf on
# top, a striped tail and a cream sake flask on a cord. Here: a round tokkuri in amber glaze with a thick cream glaze
# poured over its shoulder (real drips), the tanuki's cream belly patch with a green leaf on it, a twisted straw rope
# and bow round the neck with a red-sealed paper tag, a cork stopper wearing a big red maple leaf, and his little straw
# hat (green leaf and all) hung on the cord against the jar's side; all on a round woven straw mat.
def build_trophyLeafJar():
    new_asset()
    MAPLE_L = [(0, 1.0), (0.12, 0.62), (0.42, 0.78), (0.3, 0.42), (0.5, 0.3), (0.16, 0.2), (0.06, 0.0), (-0.06, 0.0), (-0.16, 0.2), (-0.5, 0.3), (-0.3, 0.42), (-0.42, 0.78), (-0.12, 0.62)]
    # -- the woven mat
    mat = [(0.0, 0.0), (0.2, 0.0), (0.214, 0.01), (0.21, 0.024), (0.19, 0.03), (0.0, 0.031)]
    add(gl_lathe(mat, 24, colfn=lambda c, fn: ('#d8b670' if (angle_k(c, 24, PI / 24) + int(math.hypot(c.x, c.y) * 60)) % 2 else '#e8cc8a')), fsh(0.15, 0.3), 'mat')
    # -- the jar: amber glaze, an unglazed foot ring
    jp = [(0.0, 0.03), (0.1, 0.03), (0.128, 0.045), (0.17, 0.1), (0.198, 0.17), (0.205, 0.23), (0.195, 0.3), (0.165, 0.37),
          (0.12, 0.43), (0.08, 0.475), (0.058, 0.515), (0.054, 0.552), (0.064, 0.574), (0.06, 0.592), (0.044, 0.596), (0.0, 0.596)]
    def amber(c, fn):
        if c.z < 0.05: return '#c8a482'
        return mix('#a2542a', '#c87238', clamp(fn.z * 0.4 + 0.3))
    add(gl_lathe(jp, 26, colfn=amber), fsh(0.18, 0.32, sheen=0.6), 'jar')
    rfj = prof_r(jp[2:8])
    # the cream glaze poured over the shoulder: a proud shell with rounded drips (light tops, darker drip undersides)
    top = [(0.0, 0.596), (0.044, 0.596), (0.06, 0.592), (0.064, 0.574), (0.054, 0.552), (0.058, 0.515), (0.08, 0.475), (0.12, 0.43),
           (0.165, 0.37), (0.195, 0.3), (0.205, 0.23), (0.198, 0.17)]
    S, at_s = arc_param(top)
    def Fd(th, h):
        r, y = at_s(h)
        return F.W((r * math.sin(th), y, r * math.cos(th)))
    s42 = next(S[i] for i in range(len(top)) if top[i][1] <= 0.43)
    drips = [(0.35, 0.07, 0.2), (1.25, 0.05, 0.17), (2.2, 0.09, 0.22), (3.2, 0.06, 0.2), (4.15, 0.085, 0.22), (5.2, 0.05, 0.17), (5.85, 0.045, 0.14)]
    he = drip_he(lambda th: s42 + 0.012 * math.sin(3 * th + 0.5) + 0.006 * math.sin(7 * th), drips)
    ths = drip_angles(30, drips, offs=(-0.8, -0.35, 0.0, 0.35, 0.8))
    glz = drape(Fd, he, lambda th, s_: 0.0065, ths, 4, F.W((0, 0.45, 0)))
    add(glz, lambda p, n: mix(mix('#e6d2ae', '#fbf2de', clamp(n.z * 0.8 + 0.2)), '#fffaf0', clamp(-n.y * 0.4 + n.z * 0.4 - 0.3) ** 2 * 0.5), 'glaze')
    # the tanuki's belly patch and its green leaf
    add_open(surf_patch(rfj, 0.5, 0.215, 0.08, lift=0.003, seg=16, rings=2, th0=0.0), lambda p, n: paint('#f6e4c2', top=0.06, bot=0.2)(p, n), 'belly')
    lf = [(0.0, -0.05), (0.026, -0.034), (0.038, -0.006), (0.032, 0.022), (0.016, 0.042), (0.0, 0.054), (-0.016, 0.042), (-0.032, 0.022), (-0.038, -0.006), (-0.026, -0.034)]
    with at(on_lathe(rfj, 0.0, 0.215, 0.006), ry=0.0, rz=-0.4):
        add(fan_shape(lf, (0, 0, 0), T=0.006, Tb=0.003, centre=(0.0, 0.0)), lambda p, n: mix('#4a9a40', '#7cc05a', clamp(-n.y * 0.5 + n.z * 0.4)), 'belly')
        add(gtube([(0.0, -0.06, 0.006), (0.0, -0.02, 0.008), (0.0, 0.036, 0.007)], 0.0045, K=3, caps=False), flat('#2e6a2a'), 'belly')
    # -- the straw rope round the neck, a bow and its tails, the paper tag with a red seal
    ny = 0.488; nr = 0.072
    add(gloop([(nr * math.sin(TAU * k / 20), ny + 0.004 * math.sin(TAU * k / 20 * 3), nr * math.cos(TAU * k / 20)) for k in range(20)], 0.0095, K=4),
        lambda p, n: mix('#e8c878', '#b88a40', 0.5 + 0.5 * math.sin((p.x * 2 + p.z * 3 - p.y * 2) * 90)), 'rope')
    bz = nr + 0.008
    for s in (-1, 1):
        add(gtube(catmull([(0.006 * s, ny, bz), (0.03 * s, ny + 0.022, bz + 0.012), (0.055 * s, ny + 0.012, bz + 0.012), (0.04 * s, ny - 0.008, bz + 0.008), (0.008 * s, ny - 0.002, bz)], 7), 0.0075, K=4), soft('#dab86a'), 'rope')
    add(sph(0.013, (0.0, ny, bz + 0.004), K=6, J=3), soft('#d0a858'), 'rope')
    cordp = catmull([(0.008, ny - 0.006, bz + 0.004), (0.05, ny - 0.07, bz + 0.03), (0.1, ny - 0.15, 0.13), (0.125, 0.29, 0.15)], 8)
    add(gtube(cordp, 0.0058, K=3), soft('#d0a858'), 'rope')
    add(gtube(catmull([(-0.008, ny - 0.006, bz + 0.004), (-0.024, ny - 0.05, bz + 0.026), (-0.03, ny - 0.085, rfj(ny - 0.085) + 0.012)], 5), 0.0058, K=3), soft('#d0a858'), 'rope')
    with at((-0.032, ny - 0.13, rfj(ny - 0.13) + 0.012), ry=-0.12, rx=-0.55):
        add(rb(0.05, 0.072, 0.008, (0, 0, 0), r=0.004), paint('#fff6e4', top=0.1, bot=0.2), 'tag')
        add(fan_shape(MAPLE_L, (0, -0.024, 0.005), sc=0.036, T=0.003, Tb=0.001, centre=(0.0, 0.36)), flat('#d8303a'), 'tag')
    # -- the stopper and its big red maple leaf
    add(gl_lathe([(0.0, 0.556), (0.046, 0.556), (0.05, 0.6), (0.043, 0.628), (0.0, 0.632)], 12), wood('#c89060'), 'stopper')
    with at((0.0, 0.632, 0.0), ry=0.3, rx=-1.12):
        add(fan_shape(MAPLE_L, (0, -0.012, 0), sc=0.16, T=0.009, Tb=0.006, centre=(0.0, 0.36)),
            lambda p, n: mix(mix('#c8301e', '#ec4a2c', clamp(-n.y * 0.5 + n.z * 0.5 + 0.2)), '#ff9a3a', 0.0), 'leaf')
        for th in (0.0, 0.95, -0.95, 1.75, -1.75):
            add(gtube([(0.0, 0.05, 0.008), (math.sin(th) * 0.075, 0.05 + math.cos(th) * 0.075, 0.006)], lambda s_: 0.0045 - 0.0015 * s_, K=3, caps=False), flat('#a82418'), 'leaf')
        add(gtube([(0.0, 0.05, 0.004), (0.0, -0.02, 0.0), (0.008, -0.035, -0.006)], 0.005, K=4), flat('#7a3a1a'), 'leaf')
    # -- his little straw hat, hung on the cord against the jar's side (the green leaf on its crown)
    th = 0.78; yh = 0.235
    with at(on_lathe(rfj, th, yh, 0.012), ry=th):
        with at((0, -0.01, 0), rx=PI / 2 - 0.9, rz=0.35):
            hat = [(0.0, -0.006), (0.08, -0.006), (0.09, 0.0), (0.086, 0.01), (0.062, 0.03), (0.036, 0.054), (0.014, 0.072), (0.0, 0.076)]
            add(gl_lathe(hat, 20, colfn=lambda c, fn: ('#a8742c' if math.hypot(c.x, c.y) > 0.082 else mix('#c88c3a' if (angle_k(c, 20, PI / 20) + int(c.z * 70)) % 2 else '#dca452', '#e8bc66', clamp(c.z * 8)))), fsh(0.22, 0.34), 'hat')
            with at((0, 0.076, 0), rx=-0.5):
                add(fan_shape(lf, (0, 0.0, 0.0), sc=0.75, T=0.005, Tb=0.003, centre=(0.0, 0.0)), lambda p, n: mix('#4a9a40', '#86cc62', clamp(-n.y * 0.5 + n.z * 0.4)), 'hat')

# ================================================================== Umibozu's Sea Lantern (light, 0.5 x 0.5, h 1.2)
# Umibozu (public/models/umibozu.glb): a round teal sea monk with sleepy eyes, pink cheeks, a sprout on his head and a
# necklace of big pearls with one gold bead. Here: a sea-smoothed stone, a bleached driftwood post with a crooked arm,
# a rope down to an aqua glass float (glow) caught in a knotted net with a cork plug; his pearl necklace looped on the
# post, his little sprout growing from its top; a starfish, two shells and a tuft of seaweed on the stone.
def build_trophySeaLantern():
    new_asset()
    # -- the stone
    st = [(0.0, 0.0), (0.205, 0.0), (0.228, 0.03), (0.212, 0.074), (0.152, 0.102), (0.064, 0.114), (0.0, 0.115)]
    add(gl_lathe(st, 16, sx=1.0, rfn=lambda r, z, th: r * (1 + 0.07 * math.sin(3 * th + 0.6) + 0.04 * math.sin(5 * th + 1.1)), e=2.0),
        lambda p, n: mul(mix(mix('#8a96a0', '#c8d0d0', clamp(n.z * 0.8 + 0.1)), '#6a7884', clamp(0.03 - p.z) * 20), 0.94 + 0.1 * vnoise(p, 14.0, 5)), 'stone')
    # -- the driftwood post, its crooked arm and a stub of a branch
    px, pz = -0.11, -0.05
    dw = lambda p, n: mul(paint(mix('#dcd2c4', '#b4a898', 0.5 + 0.5 * math.sin(math.atan2(p.y + pz, p.x - px) * 5 + p.z * 9)), hi='#f2ece2', top=0.2, bot=0.3)(p, n), 0.95 + 0.08 * vnoise(p, 18.0, 2))
    post = catmull([(px, 0.06, pz), (px + 0.018, 0.3, pz - 0.008), (px - 0.014, 0.6, pz + 0.01), (px + 0.008, 0.9, pz - 0.006), (px + 0.004, 1.1, pz)], 12)
    add(gtube(post, lambda s_: 0.05 - 0.016 * s_ + 0.006 * math.sin(s_ * 19), K=7), dw, 'wood')
    arm = catmull([(px + 0.004, 1.03, pz), (px + 0.08, 1.1, pz + 0.03), (px + 0.17, 1.108, pz + 0.07), (px + 0.225, 1.07, pz + 0.085)], 7)
    add(gtube(arm, lambda s_: 0.03 - 0.01 * s_, K=6), dw, 'wood')
    add(gtube([(px - 0.01, 0.48, pz), (px - 0.06, 0.56, pz + 0.006), (px - 0.085, 0.585, pz + 0.01)], lambda s_: 0.016 - 0.008 * s_, K=5), dw, 'wood')
    # his sprout from the top of the post
    add(gtube(catmull([(px + 0.004, 1.09, pz), (px + 0.01, 1.14, pz + 0.004), (px + 0.03, 1.168, pz + 0.01)], 5), 0.0055, K=4), flat('#4a8a3a'), 'sprout', 'leaf')
    add(leafb(0.07, 0.05, (px + 0.03, 1.168, pz + 0.01), rz=-1.1, rx=0.3), lambda p, n: mix('#5aa84a', '#8ccc62', clamp(n.z * 0.6 - n.y * 0.3)), 'sprout', 'leaf')
    add(leafb(0.045, 0.034, (px + 0.008, 1.13, pz + 0.004), rz=0.9, rx=0.3), lambda p, n: mix('#5aa84a', '#8ccc62', clamp(n.z * 0.6 - n.y * 0.3)), 'sprout', 'leaf')
    # -- the rope from the arm, the float (glow) in its knotted net, the cork plug
    hx, hz = px + 0.222, pz + 0.085
    R = 0.135; cy = 0.82
    add(gtube([(hx, 1.07, hz), (hx + 0.002, 1.0, hz + 0.002), (hx, cy + R + 0.02, hz)], 0.0065, K=4), lambda p, n: mix('#d8bc8a', '#a88a60', 0.5 + 0.5 * math.sin(p.z * 300)), 'rope')
    add(sph(R, (hx, cy, hz), K=16, J=10), lambda p, n: mix(mix('#3a9cb0', '#7ad8e4', clamp(n.z * 0.6 + 0.5)), '#dcfcff', clamp(n.z * 0.5 - n.y * 0.4 - n.x * 0.3 - 0.2) ** 1.5 * 0.8), 'float', 'glow')
    add(dot(0.026, (hx - 0.05, cy + 0.06, hz + 0.105), sc=(1, 0.7, 0.3), K=8, J=2, ry=-0.4, rx=-0.45), flat('#f4fdff'), 'float')
    netc = lambda p, n: paint('#d4b47e', top=0.15, bot=0.3)(p, n)
    for k in range(4):
        a = k / 4 * PI + 0.2
        loop = [(hx + (R + 0.004) * math.sin(b) * math.cos(a), cy + (R + 0.004) * math.cos(b), hz + (R + 0.004) * math.sin(b) * math.sin(a)) for b in [TAU * i / 16 for i in range(16)]]
        add(gloop(loop, 0.0055, K=3), netc, 'net')
    for yy in (-0.45, 0.4):
        rr = (R + 0.006) * math.sqrt(1 - yy * yy)
        add(gloop([(hx + rr * math.sin(TAU * i / 14), cy + yy * R, hz + rr * math.cos(TAU * i / 14)) for i in range(14)], 0.0055, K=3), netc, 'net')
    for k in range(4):
        a = k / 4 * PI + 0.2
        for yy in (-0.45, 0.4):
            rr = (R + 0.008) * math.sqrt(1 - yy * yy)
            for sgn in (1, -1):
                x, z = hx + sgn * rr * math.cos(a), hz + sgn * rr * math.sin(a)
                if z - hz < -0.02: continue           # (only the knots the camera sees)
                add(sph(0.0085, (x, cy + yy * R, z), K=5, J=2), soft('#c8a470'), 'net')
    add(cyl(0.022, 0.026, 0.03, (hx, cy + R + 0.004, hz), K=8, bev=0.006), wood('#c89060'), 'float')
    # -- his pearl necklace looped round the post, one gold bead at the front
    ny = 0.6
    pts = []
    for i in range(11):
        t_ = i / 10; a = -1.2 + 2.4 * t_
        x = px + 0.07 * math.sin(a) + 0.006; z = pz + 0.07 * math.cos(a) + 0.03 * math.sin(PI * t_)
        y = ny - 0.1 * math.sin(PI * t_) + 0.02 * (t_ - 0.5)
        pts.append((x, y, z))
    for i, (x, y, z) in enumerate(pts):
        if i == 5: add(sph(0.026, (x, y, z), K=8, J=4), gold(), 'pearls')
        else: add(sph(0.02, (x, y, z), K=6, J=3), lambda p, n: mix(mix('#e8dcd2', '#fffaf4', clamp(n.z * 0.6 - n.y * 0.3 + 0.3)), '#ffe8f0', 0.15), 'pearls')
    # -- a starfish, two shells and a tuft of seaweed on the stone
    with at((0.07, 0.104, 0.07), rx=-PI / 2 + 0.3, rz=0.4):
        add(fan_shape(star_ol(5, 1.0, 0.44), (0, 0, 0), sc=0.068, T=0.01, Tb=0.004, centre=(0.0, 0.0)), lambda p, n: mix('#f06a3a', '#ffb07a', clamp(n.z * 0.6 + 0.1)), 'shells')
    sc_ol = [(0.0, -0.4)] + [(0.5 * math.cos(a), 0.05 + 0.45 * math.sin(a)) for a in [PI * (0.1 + 0.8 * i / 6) for i in range(7)]][::-1]
    for (x, z, r_, c) in ((0.14, -0.04, 0.5, '#ffa0b4'), (-0.02, 0.145, -0.6, '#fff0dc')):
        with at((x, 0.09, z), rx=-PI / 2 + 0.5, rz=r_):
            add(fan_shape(sc_ol[::-1], (0, 0, 0), sc=0.075, T=0.012, Tb=0.004, centre=(0.0, 0.05)), lambda p, n, c=c: mix(mul(c, 0.86), mix(c, '#ffffff', 0.4), clamp(n.z * 0.6 + 0.2)), 'shells')
    for k in range(5):
        a = k * 1.3 + 0.4; hgt = 0.1 + 0.025 * (k % 3)
        add(gtube(catmull([(-0.12, 0.07, 0.07), (-0.12 + math.sin(a) * 0.022, 0.07 + hgt * 0.5, 0.07 + math.cos(a) * 0.022), (-0.12 + math.sin(a) * 0.04, 0.07 + hgt, 0.07 + math.cos(a) * 0.04)], 5), lambda s_: 0.009 * (1 - s_) + 0.004, K=4),
            lambda p, n: mix('#3a8a4a', '#7ac46a', clamp((p.z - 0.07) * 8)), 'weed', 'leaf')

# ================================================================== the captains' torn banners (wall, 0.5 x 1, h 0.98)
# The war banner each siege captain flew (src/regions/village/captains.js gear colours; models kamaitachi_storm,
# kakashi_oni, heikegani_brineclaw, yukidaruma_grand). A black lacquer pole on two pegs, sleeve loops, the banner (cloth:
# its uv.y = 1 at the hung top in glTF, so only the torn hem sways), the captain's crest embroidered on a lighter disc,
# a stitched patch, loose threads at the ragged hem, the red victory rosette with a paw pinned on its corner; and each
# captain's touch: Galeclaw's red scarf knotted on the pole, Strawgrin's straw in the hem and a crow on the pole,
# Brineclaw's gold crescent helm-crests on the pole ends, Frostbelly's snow and icicles on the pole.
BANNERS = {
    'bannerGaleclaw': dict(cloth='#2a7a6a', mark='#f4f0e0', edge='#1a4a40', crest='claws', fin='ball'),
    'bannerStrawgrin': dict(cloth='#7a2a1e', mark='#ffd07a', edge='#4a160e', crest='straw', fin='ball'),
    'bannerBrineclaw': dict(cloth='#1e3a5a', mark='#e8f4ff', edge='#0e2236', crest='claw', fin='crescent'),
    'bannerFrostbelly': dict(cloth='#3a3a6a', mark='#e8f0ff', edge='#1e1e44', crest='snow', fin='frost'),
}
BW, BTOP, BBOT, BZ0 = 0.42, 0.87, 0.19, 0.042

def b_rag(x):
    """the torn hem's height at x (torn lower on the right)"""
    return BBOT + 0.06 * (0.5 + 0.5 * math.sin(x * 61 + 1.3)) + 0.04 * (0.5 + 0.5 * math.sin(x * 23 + 0.4)) - 0.05 * max(0.0, x / BW * 2 - 0.2)

def b_cz(x, y):
    """the cloth's depth off the wall at (x, y): a soft ripple growing toward the hem"""
    t = clamp((BTOP - y) / (BTOP - BBOT))
    return BZ0 + 0.014 + 0.012 * math.sin(x * 14 + t * 3) * t + 0.01 * t * t

def b_uv(p):
    """cloth uv (Blender v = 0 at the hung top -> glTF uv.y = 1 there, the wind shader's attached edge)"""
    return (p.x * 2.0, 1.0 - clamp((p.z - BBOT) / (BTOP - BBOT)))

def on_cloth(t, zp):
    """move a decal built flat at game z = zp onto the rippled cloth (keeping each vertex's own offset from zp)"""
    for i, v in enumerate(t.v):
        off = -v.y - zp
        t.v[i] = Vector((v.x, -(b_cz(v.x, v.z) + off), v.z)); t.n[i] = None
    return t

def cloth_disc(R, cx, cy, lift, rings=3, seg=16):
    """a round patch lying on the rippled cloth (a polar grid, so it follows the ripple instead of fanning flat)"""
    t = Tmp()
    c = t.vert(F.W((cx, cy, b_cz(cx, cy) + lift))); ids = []
    for j in range(1, rings + 1):
        rr = R * j / rings; row = []
        for k in range(seg):
            x, y = cx + rr * math.cos(TAU * k / seg), cy + rr * math.sin(TAU * k / seg)
            row.append(t.vert(F.W((x, y, b_cz(x, y) + lift))))
        ids.append(row)
    nf = F.N((0, 0, 1))
    for k in range(seg):
        k1 = (k + 1) % seg
        t.face([c, ids[0][k], ids[0][k1]], nf)
        for j in range(rings - 1):
            t.face([ids[j][k], ids[j + 1][k], ids[j + 1][k1], ids[j][k1]], nf)
    t.open = True; t.orient(); t.normals(); t.done = True
    return t

def cl_add(t, col, tag):
    return add(t, col, tag, 'cloth', b_uv)

def crest_shapes(kind, m, C):
    """the captain's crest round (0, cy) on the cloth plane z = zp (decal shells, before on_cloth)"""
    out = []
    if kind == 'claws':          # Galeclaw: three gold sickle slashes under a wind swirl
        for k in (-1, 0, 1):
            pts = [(k * 0.048 + 0.045 - s * 0.09 + 0.018 * math.sin(s * PI), 0.08 - s * 0.17, 0.0) for s in [i / 7 for i in range(8)]]
            out.append((gtube(pts, lambda s: 0.003 + 0.011 * math.sin(min(1.0, s * 1.15 + 0.05) * PI), K=3), '#f4c84a'))
        sw = [(math.cos(s * 4.6) * (0.012 + s * 0.048), 0.11 + math.sin(s * 4.6) * (0.012 + s * 0.048) * 0.6, 0.0) for s in [i / 11 for i in range(12)]]
        out.append((gtube(sw, lambda s: 0.004 + 0.004 * s, K=3), m))
    elif kind == 'straw':        # Strawgrin: a scarecrow's straw hat over two crossed sheaves
        hat = [(-0.11, 0.04), (-0.05, 0.05), (-0.04, 0.1), (0.0, 0.13), (0.04, 0.1), (0.05, 0.05), (0.11, 0.04), (0.0, 0.065)]
        out.append((fan_shape(hat, (0, 0, 0), T=0.006, Tb=0.002, centre=(0.0, 0.07)), m))
        out.append((gtube([(-0.06, 0.062, 0.004), (0.0, 0.07, 0.006), (0.06, 0.062, 0.004)], 0.005, K=3), mul(m, 0.75)))
        for s in (-1, 1):
            out.append((gtube([(s * -0.07, -0.12, 0.0), (s * 0.05, 0.0, 0.0)], 0.011, K=3), m))
            for j in range(3):
                out.append((gtube([(s * 0.045, -0.004, 0.0), (s * (0.07 + j * 0.006), 0.03 + j * 0.008 - abs(j - 1) * 0.01, 0.0)], 0.0045, K=3), m))
        out.append((gtube([(-0.035, -0.04, 0.004), (0.035, -0.04, 0.004)], 0.007, K=3), mul(m, 0.78)))
    elif kind == 'claw':         # Brineclaw: one great crab pincer
        out.append((fan_shape(circ_ol(10, 0.058, 0.066), (-0.02, -0.03, 0.0), T=0.006, Tb=0.002, centre=(0.0, 0.0)), m))
        out.append((gtube(catmull([(0.0, 0.0, 0.0), (0.03, 0.055, 0.0), (0.07, 0.09, 0.0), (0.1, 0.098, 0.0)], 6), lambda s: 0.026 * (1 - s) ** 0.7 + 0.004, K=3), m))
        out.append((gtube(catmull([(0.02, -0.04, 0.0), (0.06, -0.026, 0.0), (0.088, 0.004, 0.0), (0.098, 0.03, 0.0)], 6), lambda s: 0.018 * (1 - s) ** 0.7 + 0.004, K=3), m))
        out.append((gtube([(-0.04, -0.085, 0.0), (-0.062, -0.135, 0.0)], lambda s: 0.016 - 0.005 * s, K=3), m))
        for x, y in ((0.035, 0.05), (0.06, 0.075), (0.055, -0.012), (0.074, 0.002), (-0.03, -0.02)):
            out.append((dot(0.0065, (x, y, 0.006), sc=(1, 1, 0.4), K=6, J=2), mul(m, 0.7)))
    else:                        # Frostbelly: a snowflake in a ring
        for k in range(3):
            a = k / 6 * TAU
            out.append((gtube([(-math.sin(a) * 0.1, -math.cos(a) * 0.1, 0.0), (0.0, 0.0, 0.0), (math.sin(a) * 0.1, math.cos(a) * 0.1, 0.0)], 0.0075, K=3), m))
        for k in range(6):
            a = k / 6 * TAU
            for s in (-1, 1):
                out.append((gtube([(math.sin(a) * 0.056, math.cos(a) * 0.056, 0.0), (math.sin(a) * 0.056 + math.sin(a + s * 0.8) * 0.03, math.cos(a) * 0.056 + math.cos(a + s * 0.8) * 0.03, 0.0)], 0.0055, K=3, caps=False), m))
        out.append((gloopc([(0.124 * math.cos(TAU * k / 18), 0.124 * math.sin(TAU * k / 18), 0.0) for k in range(18)], 0.0065, K=3), m))
    return out

def build_banner(P):
    new_asset()
    cloth, mark, edge = P['cloth'], P['mark'], P['edge']
    blk = lac(BLACK_LAC, hi='#6a5e7a')
    py, pz = BTOP + 0.03, BZ0
    # -- the pole, its pegs and finials
    add(cyl(0.017, 0.017, 0.45, (0, py, pz), K=8, rz=PI / 2), blk, 'pole')
    for s in (-1, 1):
        add(cyl(0.01, 0.01, pz + 0.01, (s * 0.17, py, pz / 2), K=6, rx=PI / 2), wood('#5a4030'), 'pole')
        x = s * 0.236
        if P['fin'] == 'crescent':           # Brineclaw's gold crescent helm-crest, horns up, a red sun in the middle
            arc = [(x + 0.03 * math.cos(a), py + 0.04 + 0.032 * math.sin(a), pz) for a in [PI * (0.9 + 1.2 * i / 6) for i in range(7)]]
            add(gtube(arc, lambda q: 0.004 + 0.009 * math.sin(PI * q) ** 0.6, K=4), gold(), 'pole')
            add(sph(0.016, (x, py, pz), K=6, J=3), gold(), 'pole')
            add(dot(0.011, (x, py, pz + 0.014), sc=(1, 1, 0.4), K=8, J=2), lac('#e8403a', hi='#ff9a80'), 'pole')
        elif P['fin'] == 'frost':
            add(sph(0.024, (x, py, pz), K=7, J=4), lac('#c8d8f0', hi='#ffffff', lo='#7a8ab0'), 'pole')
        else:
            add(sph(0.024, (x, py, pz), K=7, J=4), gold(), 'pole')
    # -- the banner sheet: hung from the pole, the hem torn in a ragged zig-zag
    NX, NY = 12, 10
    t = Tmp(); ids = []
    for j in range(NY + 1):
        row = []
        for i in range(NX + 1):
            x = -BW / 2 + BW * i / NX; yb = b_rag(x); y = BTOP - (BTOP - yb) * j / NY
            row.append(t.vert(F.W((x, y, b_cz(x, y)))))
        ids.append(row)
    nf = F.N((0, 0, 1))
    for j in range(NY):
        for i in range(NX):
            t.face([ids[j][i], ids[j][i + 1], ids[j + 1][i + 1], ids[j + 1][i]], nf)
    def cloth_col(p, n):
        x, y = p.x, p.z
        c = mix(cloth, edge, clamp(1 - (y - b_rag(x)) / 0.05) * 0.6 + clamp(abs(x) / (BW / 2) - 0.9) * 4 * 0.4)
        c = mix(c, mix(cloth, '#ffffff', 0.12), clamp(1 - (BTOP - y) / 0.05) * 0.5)
        return mul(c, 0.94 + 0.08 * vnoise(p, 30.0, 4) + 0.04 * clamp(n.z))
    t.open = True; t.orient(); t.normals(); t.done = True
    A.add('furn', 'cloth', t, cloth_col, 'banner', b_uv)
    # sleeve loops over the pole
    for k in range(3):
        x = -BW / 2 + 0.06 + k * (BW - 0.12) / 2
        add(gloopc([(x, py + 0.026 * math.sin(TAU * i / 8), pz + 0.026 * math.cos(TAU * i / 8)) for i in range(8)], 0.009, K=3), soft(edge), 'loops', 'cloth', b_uv)
    # loose threads from the torn hem
    for x, L in ((-0.12, 0.05), (0.06, 0.07)):
        yb = b_rag(x)
        cl_add(gtube([(x, yb + 0.006, b_cz(x, yb) + 0.002), (x + 0.008, yb - L * 0.5, b_cz(x, yb) + 0.006), (x - 0.004, yb - L, b_cz(x, yb) + 0.004)], 0.005, K=3), flat(edge), 'threads')
    # -- the crest on its lighter disc
    cy, zp = 0.6, 0.0
    A.add('furn', 'cloth', cloth_disc(0.155, 0.0, cy, 0.003), lambda p, n: mul(mix(cloth, '#ffffff', 0.16), 0.97 + 0.05 * vnoise(p, 30.0, 6)), 'crest', b_uv)
    with at((0, cy, zp)):
        for sh, c in crest_shapes(P['crest'], mark, cloth):
            cl_add(on_cloth(sh, zp - 0.006), lambda p, n, c=c: paint(c, top=0.15, bot=0.25)(p, n), 'crest')
    # -- a stitched patch
    with at((-0.1, 0.36, zp), rz=0.2):
        cl_add(on_cloth(fan_shape(rr2(0.085, 0.064, 0.012, n=2), (0, 0, 0.003), T=0.0012, Tb=0.0006, centre=(0.0, 0.0)), zp), soft(mix(cloth, '#d8c4a0', 0.4)), 'patch')
        for k in range(6):
            a = k / 6 * TAU + 0.3
            cl_add(on_cloth(box(0.016, 0.005, 0.004, (math.cos(a) * 0.05, math.sin(a) * 0.04, 0.006), r=0.0, rz=a + PI / 2), zp), flat('#f0e0c0'), 'patch')
    # -- the victory rosette with a paw, pinned on the top right corner
    rx_, ry_ = 0.12, 0.8
    with at((rx_, ry_, 0.0)):
        z1 = 0.0
        for s in (-1, 1):
            tl = [(s * 0.012, 0.0), (s * 0.036, -0.115), (s * 0.02, -0.098), (s * 0.006, -0.116), (s * -0.008, 0.0)]
            cl_add(on_cloth(fan_shape(tl, (0, -0.02, 0.004), T=0.003, Tb=0.002), z1), flat(mul('#e8403a', 0.9 if s > 0 else 0.78)), 'rosette')
        for k in range(8):
            a = k / 8 * TAU
            pet = [(0.0, 0.0), (0.016, 0.02), (0.012, 0.042), (-0.012, 0.042), (-0.016, 0.02)]
            with at((0, 0, 0.008 + 0.002 * (k % 2)), rz=-a):
                cl_add(on_cloth(fan_shape(pet, (0, 0.008, 0), T=0.004, Tb=0.002, centre=(0.0, 0.025)), z1), lambda p, n, k=k: paint('#e8403a' if k % 2 else '#c83030', top=0.2, bot=0.3)(p, n), 'rosette')
        cl_add(on_cloth(dot(0.032, (0, 0, 0.014), sc=(1, 1, 0.3), K=12, J=2), z1), soft('#fff4e4'), 'rosette')
        cl_add(on_cloth(dot(0.011, (0, -0.007, 0.02), sc=(1.15, 1, 0.4), K=8, J=2), z1), flat('#8a4a2c'), 'rosette')
        for dx, dy in ((-0.016, 0.01), (-0.006, 0.018), (0.006, 0.018), (0.016, 0.01)):
            cl_add(on_cloth(dot(0.0052, (dx, dy, 0.02), sc=(1, 1, 0.5), K=6, J=2), z1), flat('#8a4a2c'), 'rosette')
    return py, pz

def build_bannerGaleclaw():
    py, pz = build_banner(BANNERS['bannerGaleclaw'])
    # Galeclaw's red scarf knotted round the pole's left end, its two tails hanging
    kx = -0.215
    add(sph(0.026, (kx, py, pz + 0.006), sc=(1.1, 1, 0.9), K=7, J=4), lambda p, n: paint('#e04838', top=0.2, bot=0.3)(p, n), 'scarf', 'cloth', b_uv)
    add(gloopc([(kx + 0.004 * math.sin(TAU * i / 8), py + 0.03 * math.sin(TAU * i / 8), pz + 0.03 * math.cos(TAU * i / 8)) for i in range(8)], 0.011, K=4), soft('#d83c30'), 'scarf', 'cloth', b_uv)
    for (dx, L, a) in ((-0.012, 0.17, 0.12), (0.014, 0.13, -0.18)):
        with at((kx + dx, py - 0.012, pz + 0.03), rz=a):
            yt_, yb_ = py - 0.012, py - 0.012 - L
            sh = sheet(-0.022, 0.022, [-L * j / 5 for j in range(6)], lambda x, y: 0.006 * math.sin(y * 40 + x * 30), nx=2)
            def uv_t(p, yt_=yt_, yb_=yb_): return (p.x * 2.0, 1.0 - clamp((p.z - yb_) / (yt_ - yb_)))
            add_open(sh, lambda p, n: mul(mix('#e04838', '#a82820', clamp((py - p.z) / 0.2)), 0.95 + 0.05 * clamp(n.z)), 'scarf', 'cloth', uv_t)

def build_bannerStrawgrin():
    py, pz = build_banner(BANNERS['bannerStrawgrin'])
    # straw still poking out of the torn hem
    for k, x in enumerate((-0.17, -0.09, 0.0, 0.08, 0.16)):
        yb = b_rag(x)
        for j in range(2):
            a = (j - 0.5) * 0.5 + 0.2 * math.sin(k * 2.1)
            cl_add(gtube([(x + j * 0.008, yb + 0.02, b_cz(x, yb) + 0.002), (x + j * 0.008 + math.sin(a) * 0.05, yb - math.cos(a) * 0.05, b_cz(x, yb) + 0.006)], lambda s: 0.0055 - 0.002 * s, K=3, caps=False), lambda p, n: mix('#e8c060', '#c89838', clamp(n.z + 0.3)), 'straw')
    # one of his crows perched on the pole
    with at((-0.13, py + 0.042, pz + 0.004), ry=0.5, s=0.9):
        crow = lambda p, n: mix('#2a2438', '#5a5070', clamp(n.z * 0.6 - n.y * 0.3))
        add(sph(0.03, (0, 0, 0), sc=(0.85, 0.85, 1.2), K=8, J=4), crow, 'crow')
        add(sph(0.022, (0, 0.032, 0.028), K=7, J=4), crow, 'crow')
        add(cyl(0.0, 0.009, 0.026, (0, 0.03, 0.058), K=5, rx=PI / 2), flat('#f4b030'), 'crow')
        for s in (-1, 1):
            add(dot(0.0065, (s * 0.015, 0.038, 0.04), sc=(1, 1, 0.4), K=6, J=2, ry=s * 0.7), flat('#fff6e8'), 'crow')
            add(dot(0.0035, (s * 0.0168, 0.0385, 0.043), sc=(1, 1, 0.5), K=5, J=2, ry=s * 0.7), flat('#1a1420'), 'crow')
            add(cyl(0.004, 0.004, 0.03, (s * 0.01, -0.03, 0.004), K=4), flat('#f4b030'), 'crow')
        add(fan_shape([(0.0, 0.0), (0.024, -0.05), (0.0, -0.04), (-0.024, -0.05)], (0, -0.006, -0.028), T=0.006, Tb=0.006, rx=-PI / 2 + 0.5), crow, 'crow')

def build_bannerBrineclaw():
    build_banner(BANNERS['bannerBrineclaw'])

def build_bannerFrostbelly():
    py, pz = build_banner(BANNERS['bannerFrostbelly'])
    # snow along the top of the pole and three little icicles under it
    snow = lambda p, n: mix('#c8d4ec', '#ffffff', clamp(n.z * 0.8 + 0.3))
    for x, L, h in ((-0.15, 0.09, 0.016), (-0.02, 0.12, 0.02), (0.13, 0.08, 0.015), (0.22, 0.04, 0.012)):
        add(sph(1.0, (x, py + 0.014, pz), sc=(L / 2, h, 0.024), K=8, J=4), snow, 'snow')
    for x, L in ((-0.21, 0.05), (0.21, 0.04), (0.0, 0.035)):
        add(cyl(0.0, 0.009, L, (x, py - 0.012 - L / 2, pz + 0.02), K=5), lambda p, n: mix('#a8c8f0', '#f0f8ff', clamp(n.z * 0.5 + 0.5 - n.y * 0.3)), 'snow')

# ================================================================== Yuki-onna's Frost Mirror (decor, 0.5 x 0.5, h 1.14)
# Yuki-onna (public/models/yuki-onna.glb): a white and ice-blue kimono sown with snowflakes, a tiara of pale ice
# crystals, a snowflake hair ornament and a long light-blue sash. Here: a pale birch stand (bark flecks, frosted silver
# ball tops capped with snow, a snowdrift on the foot), the round mirror between the uprights, tilted back a touch, in a
# frosted silver ring edged with frost points and five snowflakes; her ice-crystal tiara crowns the frame, and her
# light-blue sash is tied in a bow round one upright.
def build_trophyFrostMirror():
    new_asset()
    birch = lambda p, n: mul(paint(mix('#f4eee6', '#ddd2c6', 0.5 + 0.5 * math.sin(p.z * 60 + p.x * 20)), top=0.15, bot=0.3)(p, n), 0.97 + 0.04 * vnoise(p, 20.0, 3))
    silver = lac('#ccd8ec', hi='#ffffff', lo='#7a88aa')
    ice = lambda p, n: mix(mix('#9ccbea', '#e4f6ff', clamp(n.z * 0.6 - n.y * 0.3 + 0.3)), '#ffffff', clamp(-n.y * 0.5 + n.z * 0.5 - 0.3) ** 2 * 0.6)
    # -- the stand: the foot, two uprights with bark flecks, frosted ball tops with snow caps
    add(box(0.44, 0.05, 0.26, (0, 0.025, 0), r=0.02), birch, 'stand')
    UX = 0.212
    for s in (-1, 1):
        add(gl_lathe([(0.0, 0.05), (0.028, 0.05), (0.024, 0.08), (0.02, 0.4), (0.019, 0.87), (0.0, 0.87)], 8, pos=(s * UX, 0, 0)), birch, 'stand')
        for k in range(7):
            y = 0.13 + k * 0.1 + 0.02 * math.sin(k * 2.3 + s)
            a = 0.6 * math.sin(k * 1.7 + s) - s * 0.5
            add(box(0.022 + 0.008 * (k % 2), 0.006, 0.006, (s * UX + math.sin(a) * 0.0195, y, math.cos(a) * 0.0195), r=0.0, ry=a), flat('#5a5458'), 'stand')
        add(sph(0.03, (s * UX, 0.895, 0), K=8, J=4), silver, 'stand')
        add(sph(0.026, (s * UX, 0.916, 0), sc=(1.05, 0.45, 1.05), K=8, J=3), lambda p, n: mix('#d8e4f4', '#ffffff', clamp(n.z)), 'snow')
    for x, z, r in ((-0.12, 0.05, 0.065), (0.03, 0.075, 0.05), (0.14, 0.03, 0.055)):
        add(sph(r, (x, 0.048, z), sc=(1, 0.55, 0.75), K=10, J=4), lambda p, n: mix('#c8d8f0', '#ffffff', clamp(n.z * 0.9 + 0.2)), 'snow')
    # -- the mirror, between the uprights, tilted back a touch
    R = 0.162; MY = 0.79
    with at((0, MY, 0.0), rx=-0.1):
        # the glass: pale ice blue with a diagonal sheen (not a lamp: plain body)
        Lf = loc_fn()
        def glass(p, n):
            q = Lf(p); t_ = (q.x * 0.6 + q.y) / R
            c = mix('#9cbce0', '#d8eaf8', clamp(0.5 + t_ * 0.5))
            c = mix(c, '#f4faff', clamp(1 - abs(t_ - 0.3) * 2.4) * 0.75)
            return c if q.z > 0.0 else mul('#8a98b4', 1.0)
        prof = [(0.0, -0.006), (R, -0.006), (R, 0.007), (0.14, 0.008), (0.1, 0.0085), (0.05, 0.009), (0.0, 0.009)]
        add(gl_lathe(prof, 28, rx=PI / 2), glass, 'glass')
        # the frosted silver ring, the frost points round it
        add(gloopc([((R + 0.012) * math.cos(TAU * k / 28), (R + 0.012) * math.sin(TAU * k / 28), 0.0) for k in range(28)], 0.018, K=6), silver, 'frame')
        for k in range(22):
            a = (k + 0.5) / 22 * TAU
            if abs(math.atan2(math.sin(a), math.cos(a)) - 0.0) < 0.0: continue
            L = 0.034 if k % 2 else 0.022
            with at(((R + 0.026) * math.sin(a), (R + 0.026) * math.cos(a), 0.0), rz=-a):
                add(glathe([(0.0, -0.004), (0.009, 0.0), (0.0, L)], K=4), ice, 'frost')
        # five snowflakes on the frame
        for a in (PI / 6, -PI / 6, PI * 0.62, -PI * 0.62, PI):
            cx, cy = (R + 0.062) * math.sin(a), (R + 0.062) * math.cos(a)
            with at((cx, cy, 0.006), rz=-a):
                for j in range(3):
                    b = j / 3 * PI
                    add(gtube([(-math.sin(b) * 0.026, -math.cos(b) * 0.026, 0.0), (math.sin(b) * 0.026, math.cos(b) * 0.026, 0.0)], 0.0052, K=3), ice, 'flakes')
                add(dot(0.009, (0, 0, 0.004), sc=(1, 1, 0.5), K=6, J=2), flat('#ffffff'), 'flakes')
        # the pivots
        for s in (-1, 1):
            add(cyl(0.013, 0.013, UX - R - 0.012, (s * (R + 0.012 + (UX - R - 0.012) / 2), 0, 0), K=6, rz=PI / 2), silver, 'frame')
        # her ice-crystal tiara on the crown of the frame
        for k, (dx, h, rr, tilt) in enumerate(((0.0, 0.13, 0.017, 0.0), (-0.036, 0.095, 0.014, 0.22), (0.036, 0.095, 0.014, -0.22), (-0.066, 0.062, 0.012, 0.45), (0.066, 0.062, 0.012, -0.45))):
            with at((dx, R + 0.018, 0.0), rz=tilt):
                add(gl_lathe([(0.0, -0.01), (rr, 0.0), (rr, h * 0.68), (0.0, h)], 6), lambda p, n: mix(mix('#8ed4ee', '#d8f6ff', clamp(n.z * 0.5 - n.y * 0.4 + 0.3)), '#ffffff', clamp(-n.y * 0.6 + n.x * 0.3) ** 2 * 0.7), 'tiara')
    # -- her light-blue sash tied in a bow round the left upright, two tails hanging
    bx, by = -UX, 0.6
    sash = lambda p, n: paint('#8ec8ec', hi='#d4eefc', top=0.2, bot=0.3)(p, n)
    add(gloopc([(bx + 0.026 * math.sin(TAU * k / 8), by + 0.004 * math.cos(TAU * k / 8), 0.026 * math.cos(TAU * k / 8)) for k in range(8)], 0.009, K=4), sash, 'sash')
    add(sph(0.016, (bx, by, 0.03), K=6, J=3), sash, 'sash')
    for s in (-1, 1):
        add(gtube(catmull([(bx, by, 0.032), (bx + s * 0.022, by + 0.034, 0.04), (bx + s * 0.036, by + 0.02, 0.038), (bx + s * 0.026, by - 0.01, 0.036), (bx, by - 0.002, 0.032)], 8), 0.008, K=4), sash, 'sash')
    for (dx, L, a) in ((-0.008, 0.2, 0.1), (0.012, 0.15, -0.16)):
        with at((bx + dx, by - 0.01, 0.034), rz=a):
            yt_, yb_ = by - 0.01, by - 0.01 - L
            sh = sheet(-0.016, 0.016, [-L * j / 5 for j in range(6)], lambda x, y: 0.005 * math.sin(y * 40), nx=2)
            def uv_t(p, yt_=yt_, yb_=yb_): return (p.x * 2.0, 1.0 - clamp((p.z - yb_) / (yt_ - yb_)))
            add_open(sh, lambda p, n: mix('#7ab8e4', '#b8e0f8', clamp(n.z * 0.4 + 0.5)), 'sash', 'cloth', uv_t)

# ================================================================== finishing and export
def finish(A, seed=5, amt=0.0035, wall=True):
    """a gentle hand-made wobble, then painted contact shade toward the wall (wall items) or the base (table items)"""
    ph = (seed % 97) * 1.37 + 0.7
    for o in A.objs.values():
        V = o['v']
        for i, p in enumerate(V):
            x, gz, y = p.x, -p.y, p.z
            dx = math.sin(y * 9.0 + ph) * amt
            dy = math.sin(x * 7.0 + ph * 1.3) * amt * 0.7 * (1.0 if wall else smooth(0.0, 0.04, y))
            V[i] = Vector((p.x + dx, p.y if wall else p.y, p.z + dy))
        for i, (p, c) in enumerate(zip(V, o['c'])):
            if wall: k = 1 - 0.16 * (1 - smooth(0.0, 0.05, -p.y))
            else: k = (0.84 + 0.16 * smooth(-0.01, 0.12, p.z))
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
            bsdf.inputs['Emission Color'].default_value = lin('#ffd890'); bsdf.inputs['Emission Strength'].default_value = 1.0
        mats[mname] = mt
    obs = [to_object(name, o, mats) for k, o in A.objs.items()]
    lo = Vector((1e9,) * 3); hi = Vector((-1e9,) * 3)
    for o in A.objs.values():
        for v in o['v']: lo = Vector(map(min, lo, v)); hi = Vector(map(max, hi, v))
    print('FT %s tris %d' % (name, A.tris()))
    print('FT %s parts %s' % (name, dict(sorted(A.count.items(), key=lambda kv: -kv[1]))))
    print('FT %s lowest %s' % (name, sorted(((round(v, 3), k) for k, v in A.low.items()))[:3]))
    print('FT %s size x %.3f (%.3f..%.3f)  game y %.3f (%.3f..%.3f)  game z %.3f (%.3f..%.3f)' % (
        name, hi.x - lo.x, lo.x, hi.x, hi.z - lo.z, lo.z, hi.z, hi.y - lo.y, -hi.y, -lo.y))
    for ob in obs: print('FT %s check %s %s mats %s' % (name, ob.name, check(ob), [m.name for m in ob.data.materials]))
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, name + '.blend'))
    for o in bpy.context.scene.objects: o.select_set(o.type == 'MESH')
    out = os.path.join(MODELS, name + '.glb')
    kw = dict(filepath=out, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
              export_attributes=True, export_lights=False, export_cameras=False, export_animations=False,
              export_normals=True, export_texcoords=True, export_materials='EXPORT')
    try: bpy.ops.export_scene.gltf(export_vertex_color='ACTIVE', **kw)
    except TypeError as e:
        print('FT export_vertex_color rejected:', e); bpy.ops.export_scene.gltf(export_colors=True, **kw)
    print('FT wrote', out)


WALL = {'trophyOniCleaver', 'bannerGaleclaw', 'bannerStrawgrin', 'bannerBrineclaw', 'bannerFrostbelly'}
PIECES = {k[6:]: v for k, v in globals().items() if k.startswith('build_trophy') or k.startswith('build_banner') and k != 'build_banner'}
for pid in (list(PIECES) if PIECE == 'all' else PIECE.split(',')):
    PIECES[pid]()
    finish(A, seed=len(pid), wall=pid in WALL)
    export_piece(A, 'furn-' + pid)
