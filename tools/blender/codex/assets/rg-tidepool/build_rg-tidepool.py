# PAWHAVEN: the Shiokaze Tidepools' landmark props (task rg-tidepool), built in Blender by script.
#   blender --background --factory-startup --python build_rg-tidepool.py -- --piece wreck|seaTorii|all
# Deterministic: seeded PRNGs only; a re-run reproduces every GLB exactly.
# Frame: 1 unit = 1 m, Blender Z up. Each prop is built in its kit piece's own local frame (src/regions/assets/
# tidepoolAssets.js): the same origin, facing and ground level. The layout code is written in the kit's game frame
# (x, y up, z front) and mapped to Blender (x, -z, y), so the glTF exporter hands the game back the kit's own frame.
# Materials by name, as the game sorts them (glbPieces.js keyOf): body, glow (uv = flicker, tint, like Builder.glow),
# cloth (uv.y = 1 at the attached edge, like Builder.cloth: the wind sway weight).
# The shared kit (mesh accumulator, painted vertex colours, rounded boxes, lathes, tubes, icing drapes, the Frame stack)
# is copied from tools/blender/work/codex/zv-tidepool (itself from landmarks-hollow).
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
        ec = {}                                             # (zv: report any open shell by its tag)
        for f_ in t.f:
            for k_ in range(len(f_)):
                e_ = (min(f_[k_], f_[(k_ + 1) % len(f_)]), max(f_[k_], f_[(k_ + 1) % len(f_)])); ec[e_] = ec.get(e_, 0) + 1
        nb_ = sum(1 for v_ in ec.values() if v_ == 1)
        dup_ = sum(1 for f_ in t.f if len(set(f_)) < len(f_)) + sum(1 for v_ in ec.values() if v_ > 2)
        if nb_ or dup_: print('ZV open shell: tag %s obj %s boundary %d bad %d' % (tag, obj, nb_, dup_))
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
        ec = {}                                             # (zv: report any open shell by its tag)
        for f_ in t.f:
            for k_ in range(len(f_)):
                e_ = (min(f_[k_], f_[(k_ + 1) % len(f_)]), max(f_[k_], f_[(k_ + 1) % len(f_)])); ec[e_] = ec.get(e_, 0) + 1
        nb_ = sum(1 for v_ in ec.values() if v_ == 1)
        dup_ = sum(1 for f_ in t.f if len(set(f_)) < len(f_)) + sum(1 for v_ in ec.values() if v_ > 2)
        if nb_ or dup_: print('ZV open shell: tag %s obj %s boundary %d bad %d' % (tag, obj, nb_, dup_))
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
LAYER = None    # (zv-tidepool: 'saved' / 'siege' routes every part into that overlay object, glow parts included)
def add(t, col, tag='misc', glow=False, water=False):
    A.add(LAYER or (GLOW if glow else OB), 'water' if water else (GLOW if glow else 'body'), t, col, tag)
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


# ------------------------------------------------------------------ props (zv-tidepool)
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

# ################################################################## Shiokaze Port (artTidepool.js), zv-tidepool
# the kit palette (artTidepool.js T): salt-silvered grey-blue boards, tarred timber, sun-bleached driftwood, blue-teal
# tiles, rope and nets, coral-red buoys and sea glass
T = dict(board='#a2b2bc', boardLt='#d2dcde', boardDk='#7f909e', boardTeal='#74b4c4', boardWarm='#a8988a',
         tar='#54494a', frame='#625858', drift='#d6cec0', driftDk='#b0a798', pile='#7a6c60',
         tile='#5a7090', tileTeal='#3f8cb4', roofBoard='#a4acb0', stone='#a09ea6', stoneLt='#c4c2c6',
         plaster='#f4f0e6', innFrame='#4e6074', innKoshi='#6a98a8',
         rope='#e0c890', net='#d4c29c', teal='#3aa6b8', coral='#ee6a40', red='#de4a3e', navy='#2c4868', gold='#e8b84a',
         ice='#e4f4fa', iceDk='#a8d4e4', brass='#c89a50', cream='#fff6ea', ink='#2e2a30', iron='#4f4a58')
WET = '#5e6a66'
def new_asset(name, pal):
    global A, OB
    A = Asset2(); F.__init__(); OB = name
    PAL.update(pal)
BOARD =['#a8845e', '#9a7656', '#b8946a', '#8e6c4e']           # (art.js: the siege's rough planks)
GLASS = ['#7ad8c8', '#8fc8f0', '#a8e8b8', '#5ab0d8', '#c8f0ff', '#78c8a8']

def hz(k):
    v = math.sin(k * 127.1 + 311.7) * 43758.5453
    return v - math.floor(v)
def pbox(w, h, d, pos=(0, 0, 0), r=0.012, ry=0.0, rx=0.0, rz=0.0):
    """a rounded box with no thin-part guard (boards and planks keep their soft edge)"""
    return rbox((w, d, h), r=r, M=F.m @ lm(pos, ry, rx, rz))
def strut(a, b, w, h=None, c=0.014):
    """a chamfered timber from a to b (game-local points); w its horizontal thickness, h its depth"""
    h = h or w
    dx, dy, dz = b[0] - a[0], b[1] - a[1], b[2] - a[2]
    L = math.sqrt(dx * dx + dy * dy + dz * dz)
    mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2)
    ry, rz = math.atan2(-dz, dx), math.atan2(dy, math.hypot(dx, dz))
    if min(w, h) < 0.055: return pbox(L, h, w, mid, r=0.0, ry=ry, rz=rz)
    return beam(L, h, w, mid, c=c, ry=ry, rz=rz)
def local_fn():
    """-> f(p): a Blender-world point to the current frame's game-local coordinates (for painting by position)"""
    Mi = F.m.inverted()
    return lambda p: GMi @ (Mi @ p)

def rock(pos, r, sq=0.6, seed=0, rx=0.0, col=None, tag='stones', K=6, soft_top=False):
    """a round beach stone (a squat lathe with a wobbly outline)"""
    rng = random.Random(seed)
    c = col or STONES[rng.randrange(len(STONES))]
    t = lathe([(0.0, -r * sq * 0.4), (r, -r * sq * 0.05), (r * 0.74, r * sq * 0.45), (0.0, r * sq * 0.66)], K,
              th0=rng.uniform(0, 1), rfn=lambda rr, z, th: rr * (1 + 0.12 * math.sin(2 * th + seed) + 0.06 * math.sin(3 * th + seed * 1.7)))
    t.xform(F.m @ lm(pos, ry=rng.uniform(0, PI), rx=rx))
    if soft_top:                                       # (beach stones on a roof: their own colour, gently lit, no bleach)
        add(t, lambda p, n: mul(mix(mul(c, 0.8), mix(c, '#f4eef0', 0.18), clamp(n.z * 0.7 + 0.3)), 0.95 + 0.1 * vnoise(p, 6.0, seed)), tag)
    else: add(t, stone_col(c, seed, ao=False), tag)

def crab_pot(r=0.22, tag='pots'):
    """a domed bamboo crab pot: slatted cage, woven dome, a dark mouth ring"""
    base = F.W((0, 0, 0))
    def cage(p, n):
        a = math.atan2(p.y - base.y, p.x - base.x)
        slat = abs(math.sin(a * 6)) < 0.3 or abs(math.sin((p.z - base.z) * 38)) < 0.22
        return mul(mix('#b89a5a', '#dcc48a', clamp(n.z * 0.5 + 0.3)), 0.66 if slat else 1.0)
    add(glathe([(0.0, 0.0), (r * 0.92, 0.0), (r, r * 0.12), (r * 0.94, r * 1.05), (r * 0.82, r * 1.32), (r * 0.5, r * 1.58), (r * 0.3, r * 1.64), (0.0, r * 1.6)], 8), cage, tag)
    add(gloop([(r * 0.3 * math.cos(TAU * k / 7), r * 1.62, r * 0.3 * math.sin(TAU * k / 7)) for k in range(7)], 0.028, K=3), soft('#7a5e34'), tag)

def glass_float(r=0.1, col=None, pos=(0, 0, 0), glow=True, tag='floats'):
    col = col or GLASS[0]
    with at(pos):
        add(sph(r, (0, r, 0), K=8, J=4), lambda p, n, c=col: mix(mul(c, 0.82), mix(c, '#ffffff', 0.4), clamp(n.z * 0.6 + 0.3)), tag, glow=glow)
        add(gloop([(r * 1.03 * math.cos(TAU * i / 8), r * 1.0, r * 1.03 * math.sin(TAU * i / 8)) for i in range(8)], 0.016, K=3), soft(T['rope']), tag)

def shimenawa(w, y, sag, z, r, tag='rope'):
    """a sacred straw rope sagging between the posts, its twist painted in, paper zigzags (shide) hanging from it"""
    pts = [(-w / 2 + w * i / 12, y - sag * 4 * (i / 12) * (1 - i / 12), z) for i in range(13)]
    add(gtube(pts, lambda u: r * (0.75 + 0.25 * math.sin(u * PI)), K=6), lambda p, n: mul(mix('#c8a868', '#ecd8a0', clamp(n.z * 0.6 + 0.4)), 0.82 if math.sin((p.x + p.z) * 28) > 0.3 else 1.0), tag)
    for u in (0.25, 0.5, 0.75):
        i = u * 12; x = -w / 2 + w * u; yy = y - sag * 4 * u * (1 - u) - r * 0.6
        zz = [(0.0, 0.0), (0.09, 0.0), (0.09, -0.09), (0.0, -0.09), (0.0, -0.18), (0.09, -0.18), (0.09, -0.27), (-0.0, -0.27)]
        with at((x - 0.045, yy, z + r * 0.4)):
            for k in range(4):
                sx = 0.0 if k % 2 == 0 else 0.02
                add(pbox(0.1, 0.085, 0.016, (0.05 + sx, -0.045 - k * 0.09, 0), r=0.0, rz=0.06 * (1 if k % 2 else -1)), soft('#fffaf2', 0.15), tag)

# ################################################################## rg-tidepool
print('RG build pid', os.getpid())
SAND, SAND_DK, SAND_HI = '#eed8a4', '#e2c890', '#f6e4b6'

class Asset3(Asset2):
    """Asset2 plus an optional per-vertex uv (glow: flicker / tint; cloth: the sway weight in v): a fn(p) or a list"""
    def add(self, obj, mat, t, col, tag=None, uv=None):
        o = self.objs.setdefault(obj, dict(v=[], n=[], c=[], f=[], m=[], mats=[]))
        n0 = len(o['v'])
        Asset2.add(self, obj, mat, t, col, tag)
        if uv is not None or 'uv' in o:
            o.setdefault('uv', [])
            while len(o['uv']) < n0: o['uv'].append((0.0, 0.0))
            if isinstance(uv, list): o['uv'] += list(uv) + [(0.0, 1.0)] * (len(t.v) - len(uv))
            else: o['uv'] += [uv(p) if uv else (0.0, 0.0) for p in t.v]
        return t

A = None; OB = 'prop'
def new_asset(name, mat=None):
    global A, OB, MAT
    A = Asset3(); F.__init__(); OB = name; MAT = mat
MAT = None      # (a piece-wide default material for plain parts: 'rock' for the rock pieces, else 'body')
def add(t, col, tag='misc', glow=False, cloth=None, flick=0.0, tint=0.0, obj=None, mat=None):
    """route a shell into its material object: glow / hot (uv = flicker, tint), cloth (uv = its sway weight), or a
    plain material (body, rock, reed) by name"""
    mat = mat or (None if glow or cloth is not None else MAT)
    if mat == 'hot': A.add(OB + '_hot', 'hot', t, col, tag, uv=lambda p: (flick, tint)); return t
    if mat and mat != 'body': A.add(OB + '_' + mat, mat, t, col, tag); return t
    if glow: A.add(OB + '_glow', 'glow', t, col, tag, uv=lambda p: (flick, tint))
    elif cloth is not None: A.add(OB + '_cloth', 'cloth', t, col, tag, uv=cloth)
    else: A.add(OB + (obj or ''), 'body', t, col, tag)
    return t

def B2G(b): return (b.x, b.z, -b.y)
def xf_g(M, p):
    """a game-local point through a Blender-space matrix (lm / F.m) -> game coordinates"""
    return B2G(M @ gl(p))
def vlerp(a, b, t): return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))
def vadd(a, b, k=1.0): return tuple(a[i] + b[i] * k for i in range(3))

def finish_rg(A, seed, amt):
    """the kit Builder's warp (kit.js warp, identical for every object, so parts stay glued) + a soft groundShade AO
    (not on the glow, nor on the sand drifts, which must match the beach)"""
    a = (seed % 97) * 1.37 + 0.7
    for name, o in A.objs.items():
        V = o['v']
        for i, p in enumerate(V):
            x, y, z = p.x, p.z, -p.y                     # game coords
            hh = max(0.0, y); k = amt * (0.35 + hh * 0.28)
            dx = (math.sin(y * 0.9 + a) * 0.6 + math.sin(z * 1.3 + a * 2.1) * 0.4) * k
            dz = (math.sin(y * 1.1 + a * 1.7) * 0.6 + math.sin(x * 1.2 + a * 0.6) * 0.4) * k
            dy = math.sin(x * 0.9 + a) * math.sin(z * 1.1 + a * 1.3) * amt * 0.9 * clamp(y / 0.4)
            V[i] = Vector((p.x + dx, p.y - dz, p.z + dy))
        if name.endswith(('_glow', '_hot', '_sand', '_cloth')): continue
        for i, (p, c) in enumerate(zip(V, o['c'])):
            k = 0.8 + 0.2 * smooth(-0.25, 0.45, p.z)
            o['c'][i] = (c[0] * k, c[1] * k, c[2] * k, 1.0)

def export_rg(A, name):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    def mk(nm, rough=0.8, emis=None):
        mt = bpy.data.materials.new(nm); mt.use_nodes = True; nt = mt.node_tree
        bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
        bsdf.inputs['Roughness'].default_value = rough; bsdf.inputs['Metallic'].default_value = 0.0
        vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'; nt.links.new(vc.outputs['Color'], bsdf.inputs['Base Color'])
        if emis:
            nt.links.new(vc.outputs['Color'], bsdf.inputs['Emission Color']); bsdf.inputs['Emission Strength'].default_value = emis
        return mt
    mats = {k: mk(k) for k in ('body', 'glow', 'cloth', 'rock', 'reed', 'hot')}   # (the game picks its materials by name; plain here)
    obs = []
    for k, o in A.objs.items():
        ob = to_object(k, o, mats)
        if 'uv' in o:
            me = ob.data; uvl = me.uv_layers.new(name='UVMap'); U = o['uv']; data = []
            for poly in me.polygons:
                for li in poly.loop_indices:
                    u, v = U[me.loops[li].vertex_index]; data += [u, 1.0 - v]     # (glTF flips v on export)
            uvl.data.foreach_set('uv', data)
        obs.append(ob)
    lo = Vector((1e9,) * 3); hi = Vector((-1e9,) * 3)
    for o in A.objs.values():
        for v in o['v']: lo = Vector(map(min, lo, v)); hi = Vector(map(max, hi, v))
    print('RG %s tris %d %s' % (name, A.tris(), {k: A.tris(k) for k in A.objs}))
    print('RG %s parts %s' % (name, dict(sorted(A.count.items(), key=lambda kv: -kv[1]))))
    print('RG %s bounds game x %.3f..%.3f y %.3f..%.3f z %.3f..%.3f' % (name, lo.x, hi.x, lo.z, hi.z, -hi.y, -lo.y))
    for ob in obs: print('RG %s check %s %s' % (name, ob.name, check(ob)))
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, name + '.blend'))
    for o in bpy.context.scene.objects: o.select_set(o.type == 'MESH')
    out = os.path.join(MODELS, name + '.glb')
    kw = dict(filepath=out, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
              export_attributes=True, export_lights=False, export_cameras=False, export_animations=False,
              export_normals=True, export_texcoords=True, export_materials='EXPORT')
    try: bpy.ops.export_scene.gltf(export_vertex_color='ACTIVE', **kw)
    except TypeError as e:
        print('RG export_vertex_color rejected:', e); bpy.ops.export_scene.gltf(export_colors=True, **kw)
    print('RG wrote', out)

# ------------------------------------------------------------------ small shared bits (Blender-space helpers)
def _basis(n):
    n = Vector(n).normalized()
    side = n.cross(Vector((0, 0, 1)) if abs(n.z) < 0.9 else Vector((1, 0, 0))).normalized()
    return n, side, n.cross(side)

def splinters(base, axis, r, n, h, seed, col, tag):
    """a snapped timber end: n jagged teeth round a ring of radius r at base (Blender coords), pointing along axis"""
    rng = random.Random(seed); ax, side, up = _basis(axis)
    for k in range(n):
        a = TAU * k / n + rng.uniform(-0.3, 0.3)
        d = side * math.cos(a) + up * math.sin(a)
        c = Vector(base) + d * r * 0.5
        tip = c + ax * h * rng.uniform(0.45, 1.0) + d * r * 0.12
        t = Tmp(); w = r * 0.62
        q = [t.vert(c + (side * math.cos(a + e) + up * math.sin(a + e)) * w) for e in (-0.95, 0.0, 0.95)]
        q.append(t.vert(c - d * w * 0.35))
        tp = t.vert(tip)
        cen = sum((t.v[i] for i in q), Vector()) / 4
        for i in range(4): t.face([q[i], q[(i + 1) % 4], tp], (t.v[q[i]] + t.v[q[(i + 1) % 4]]) / 2 - cen)
        t.face([q[3], q[2], q[1], q[0]], -ax)
        add(t, col, tag)

def barnacle_cluster(pos, nrm, s, seed, tag='barnacles'):
    """a few chunky white volcano cones on a surface point (Blender coords) facing nrm"""
    rng = random.Random(seed); n, side, up = _basis(nrm)
    Rm = Vector((0, 0, 1)).rotation_difference(n).to_matrix().to_4x4()
    for k in range(rng.randint(3, 5)):
        a = rng.uniform(0, TAU); d = rng.uniform(0.0, 0.08) * s
        c = Vector(pos) + (side * math.cos(a) + up * math.sin(a)) * d
        r = rng.uniform(0.03, 0.045) * s
        t = lathe([(0.0, -0.012), (r, -0.012), (r * 0.5, r * 0.95), (0.0, r * 0.62)], 5, th0=rng.uniform(0, 1))
        t.xform(Matrix.Translation(c) @ Rm)
        add(t, lambda p, nn: mix('#cfc6b6', '#fbf6ec', clamp(nn.z * 0.5 + 0.55)), tag)

def starfish(pos, r, rot, col, tag='starfish'):
    """a chunky five-armed star lying on the ground (game-local pos), a dotted top"""
    pts = []
    for k in range(10):
        a = rot + PI / 2 + TAU * k / 10; rr = r if k % 2 == 0 else r * 0.45
        pts.append((math.cos(a) * rr, math.sin(a) * rr))
    with at(pos, rx=-PI / 2):
        add(prism(pts, 0.05, 0.0), lambda p, n: mix(mul(col, 0.78), mix(col, '#fff0dc', 0.22), clamp(n.z * 0.7 + 0.3)), tag)
    for k in range(5):
        a = rot + PI / 2 + TAU * k / 5
        for d in (0.3, 0.6):
            add(sph(0.018, (pos[0] + math.cos(a) * r * d, pos[1] + 0.05, pos[2] - math.sin(a) * r * d), K=4, J=2), flat('#fff0d8'), tag)

def kelp_strand(pts, w, seed, tag='kelp'):
    """draped seaweed: a chunky tube along game-local pts, olive to yellow-green"""
    c0, c1 = ('#4e7a3a', '#8aac4c') if seed % 2 else ('#5e7030', '#a2aa4a')
    add(gtube(pts, lambda s: w * (0.6 + 0.4 * math.sin(min(1.0, s * 1.1 + 0.2) * PI)), K=5),
        lambda p, n: mix(c0, c1, clamp(n.z * 0.5 + 0.35 + 0.2 * vnoise(p, 6.0, seed))), tag)

def sheet(S, nu, nv, th, col, uvfn=None, tag='sheet', cloth=False, nrm=None):
    """a thick sheet: S(u, v) -> Blender point (front), the back th behind along nrm(u, v) (default: the grid normal);
    closed (front, back, rim). col(u, v, front) -> colour; uvfn(u, v) -> uv for cloth."""
    t = Tmp(); F_, B_ = [], []; cols, uvs = [], []
    def N(u, v):
        if nrm: return nrm(u, v)
        e = 1e-3
        a = S(min(1, u + e), v) - S(max(0, u - e), v); b = S(u, min(1, v + e)) - S(u, max(0, v - e))
        return a.cross(b).normalized()
    for j in range(nv + 1):
        rf, rb = [], []
        for i in range(nu + 1):
            u, v = i / nu, j / nv; p = S(u, v); n = N(u, v)
            rf.append(t.vert(p)); cols.append(col(u, v, True)); uvs.append(uvfn(u, v) if uvfn else (0, 0))
        F_.append(rf)
    for j in range(nv + 1):
        rb = []
        for i in range(nu + 1):
            u, v = i / nu, j / nv; p = S(u, v) - N(u, v) * th
            rb.append(t.vert(p)); cols.append(col(u, v, False)); uvs.append(uvfn(u, v) if uvfn else (0, 0))
        B_.append(rb)
    for j in range(nv):
        for i in range(nu):
            u, v = (i + 0.5) / nu, (j + 0.5) / nv; n = N(u, v)
            t.face([F_[j][i], F_[j][i + 1], F_[j + 1][i + 1], F_[j + 1][i]], n)
            t.face([B_[j][i], B_[j + 1][i], B_[j + 1][i + 1], B_[j][i + 1]], -n)
    loop = [(0, i) for i in range(nu + 1)] + [(j, nu) for j in range(1, nv + 1)] + [(nv, i) for i in range(nu - 1, -1, -1)] + [(j, 0) for j in range(nv - 1, 0, -1)]
    cen = sum(t.v[:len(t.v) // 2], Vector()) / (len(t.v) // 2)
    for k in range(len(loop)):
        (j0, i0), (j1, i1) = loop[k], loop[(k + 1) % len(loop)]
        mid = (t.v[F_[j0][i0]] + t.v[F_[j1][i1]]) / 2
        t.face([F_[j0][i0], F_[j1][i1], B_[j1][i1], B_[j0][i0]], mid - cen)
    t.c = cols
    if cloth: A.add(OB + '_cloth', 'cloth', t, None, tag, uv=uvs)
    else: A.add(OB, 'body', t, None, tag)
    return t

def rope_bag(c, r, tag='floats'):
    """the rope cradle round a glass float (Blender centre c, radius r): two crossed loops + a top knot"""
    for ax in (Vector((1, 0, 0)), Vector((0, 1, 0))):
        n, s1, s2 = _basis(ax)
        pts = [c + (s1 * math.cos(TAU * k / 10) + s2 * math.sin(TAU * k / 10)) * r * 1.04 for k in range(10)]
        add(tube_loop(pts, lambda s: 0.017, K=3, up=n), soft('#e0c890', 0.3), tag)
    add(tube_loop([c + Vector((math.cos(TAU * k / 10), math.sin(TAU * k / 10), 0)) * r * 1.04 for k in range(10)], lambda s: 0.017, K=3), soft('#e0c890', 0.3), tag)

# ################################################################## the wreck (tidepoolAssets.js wreck, seeds 3 and 7)
# Kit: a ~3.8 m fishing boat heeled over in the sand, a hole in its upper (+z, the camera side) planking showing the ribs,
# a snapped mast with a torn sail, a net, glass floats, an oar, a crab trap and an old lantern (its light at
# (-1.2, 0.35, -0.2)). Ours: the same boat, chunkier: separate rounded strakes (teal, coral stripe, cream sheer) with
# flaked paint and barnacles, sprung and snapped planks round the hole, ribs inside, the bow up and the stern sunk in
# sand drifts, a toy net slung over the bow into the sand, the floats in rope cradles, a crab and a starfish.
def build_wreck():
    new_asset('rg-tidepool-wreck')
    L, BEAM, DEP, RISE, TH = 3.8, 1.5, 0.95, 0.3, 0.055
    def bAt(t): return BEAM / 2 * (0.66 + 0.34 * math.sin(t / 0.42 * PI / 2) if t < 0.42 else max(0.0, math.cos((t - 0.42) / 0.58 * PI / 2)) ** 0.75)
    def kAt(t): return ((t - 0.72) / 0.28) ** 2 * DEP * 0.62 if t > 0.72 else 0.0
    def sAt(t): return DEP + RISE * t ** 2.6 + 0.07 * (1 - t) ** 2
    def P(t, phi):
        b = bAt(t); ky = kAt(t); sy = sAt(t)
        return ((t - 0.5) * L, ky + (sy - ky) * (1 - math.cos(phi)), b * math.sin(phi))
    def Nn(t, phi):
        b = max(bAt(t), 0.04); ky = kAt(t); sy = sAt(t)
        v = Vector((0, -b * math.cos(phi), (sy - ky) * math.sin(phi)))
        return tuple(v.normalized()) if v.length > 1e-9 else (0, -1, 0)
    def Pk(t, phi, d): return vadd(P(t, phi), Nn(t, phi), d)          # off the outer skin along its normal (d < 0: in)
    ROLL, PITCH = -0.27, 0.15
    HM0 = lm((0, 0, 0), rx=ROLL, rz=PITCH)
    ymin = min(xf_g(HM0, P(i / 30 * 0.97, -PI / 2 + PI * j / 16))[1] for i in range(31) for j in range(17))
    HPOS = (0.0, -0.34 - ymin, 0.04)
    HM = lm(HPOS, rx=ROLL, rz=PITCH)
    W = lambda p: xf_g(HM, p)                                            # hull-local -> piece (game) coords
    WB = lambda p: HM @ gl(p)                                            # hull-local -> Blender

    # ---- strakes: 5 a side, each a rounded plank (outer face bulged, inner face set in by TH), snapped round the hole
    EDGES = [0.05, 0.36, 0.68, 0.99, 1.29, 1.571]
    TONES = ['#3d7f9e', '#4791b0', '#55a2bf', '#e0573f', '#f1e6cc']
    BREAK = {(1, 1): [(0.0, 0.36, 0.0, 0.05), (0.49, 0.97, 0.06, 0.0)],
             (1, 2): [(0.0, 0.28, 0.0, 0.07), (0.56, 0.97, -0.06, 0.0)],
             (1, 3): [(0.0, 0.24, 0.0, -0.06), (0.6, 0.97, 0.07, 0.0)],
             (1, 4): [(0.0, 0.33, 0.0, 0.05), (0.43, 0.97, -0.04, 0.0)]}
    SPRUNG = {(1, 3): 0.6}                                               # the forward piece of strake 3 bent outward
    def plank(s, j, t0, t1, jag0, jag1):
        a0, a1 = EDGES[j] + 0.014, EDGES[j + 1] - 0.014; am = (a0 + a1) / 2
        n = max(3, int(round((t1 - t0) / 0.055)) + 1)
        rings, cs, cols = [], [], []
        tone = TONES[j]
        for i in range(n):
            u = i / (n - 1); tt = t0 + (t1 - t0) * u
            ring = []
            for (a, side, bul) in ((a0, 0, 0.0), (am, 0, 0.014), (a1, 0, 0.0), (a1, 1, 0.0), (am, 1, 0.0), (a0, 1, 0.0)):
                t_ = tt
                if i == 0 and jag0: t_ = tt - jag0 * (a - a0) / (a1 - a0)
                if i == n - 1 and jag1: t_ = tt + jag1 * (a - a0) / (a1 - a0)
                phi = s * a
                d = bul if side == 0 else -TH * (0.9 if a == am else 1.0)
                p = Pk(t_, phi, d)
                key = (s, j)
                if key in SPRUNG and tt < SPRUNG[key] + 0.1 and t0 >= SPRUNG[key] - 1e-6:
                    k = (SPRUNG[key] + 0.1 - tt) / 0.1
                    p = vadd(p, Nn(t_, phi), 0.16 * k * k)
                bp = WB(p); ring.append(bp)
                wy = bp.z
                if side == 0:
                    c = mul(tone, 0.94 + 0.12 * (a - a0) / (a1 - a0) * (1 if a != am else 0.8))
                    if a == am: c = mix(c, '#ffffff', 0.06)
                    st = int(round(tt / 0.055))                  # flaked paint: bare-wood patches by station
                    if hz(st * 7.3 + j * 13.1 + s * 3.7) > 0.72 and a != (a0 if hz(st + j) > 0.5 else a1):
                        c = mix(c, '#d8c6a2', 0.8)
                    if wy < 0.25:
                        k = clamp((0.25 - wy) / 0.3)
                        c = mix(c, mix(tone, '#55625a', 0.55), 0.5 * k)
                else:
                    c = mul(mix('#b4875e', '#c99c6c', vnoise(bp, 4.0, 3 + j)), 0.86 if a != am else 1.0)
                cols.append(c)
            rings.append(ring); cs.append(sum(ring, Vector()) / 6)
        t = Tmp()
        T0 = (cs[1] - cs[0]).normalized(); T1 = (cs[-1] - cs[-2]).normalized()
        ring_surface(t, rings, cs, pole0=cs[0] - T0 * 0.004, pole1=cs[-1] + T1 * 0.004)
        t.c = cols + [cols[0], cols[-6]]
        add(t, None, 'planks')
    for s in (-1, 1):
        for j in range(5):
            for (t0, t1, jag0, jag1) in BREAK.get((s, j), [(0.0, 0.97, 0.0, 0.0)]):
                plank(s, j, t0, t1, jag0, jag1)

    # ---- the frame: ribs inside, the gunwale rails, the keel and a tall stem, the transom, two thwarts
    for k in range(9):
        tt = 0.1 + 0.095 * k
        pts = [Pk(tt, -1.5 + 3.0 * i / 10, -TH - 0.026) for i in range(11)]
        pts = [vadd(pts[0], (0, 0.05, 0))] + pts + [vadd(pts[-1], (0, 0.05, 0))]
        with at(HPOS, rx=ROLL, rz=PITCH):
            add(gtube(pts, 0.032, K=4), wood('#8a6446', seed=k), 'ribs')
    with at(HPOS, rx=ROLL, rz=PITCH):
        for s in (-1, 1):
            rail = [vadd(Pk(0.97 * i / 15, s * PI / 2, -TH * 0.5), (0, 0.03, 0)) for i in range(16)]
            add(gtube(rail, 0.05, K=6), wood('#8c6446'), 'rails')
        keel = [Pk(0.97 * i / 12, 0.0, 0.02) for i in range(13)]
        x9, y9 = P(0.97, 0.0)[0], P(0.97, 0.0)[1]
        keel += [(x9 + 0.08, y9 + 0.35, 0.0), (x9 + 0.13, sAt(1.0) * 0.82, 0.0), (x9 + 0.12, sAt(1.0) + 0.2, 0.0)]
        add(gtube(keel, lambda u: 0.058 if u < 0.8 else 0.058 - (u - 0.8) * 0.1, K=6), wood('#6e4e38'), 'keel')
        add(sph(0.06, (x9 + 0.12, sAt(1.0) + 0.22, 0.0), K=6, J=3), wood('#6e4e38'), 'keel')
        # transom: a D-shaped board at the stern, cream with a coral band, its top capped
        outline = [P(0.0, -PI / 2 + PI * i / 12) for i in range(13)]
        tm = Tmp(); rings, cs = [], []
        for dx in (-0.035, 0.05):
            ring = [WB((-L / 2 + dx, q[1], q[2])) for q in outline]; rings.append(ring); cs.append(sum(ring, Vector()) / len(ring))
        ring_surface(tm, rings, cs, pole0=cs[0], pole1=cs[1])
        loc = local_fn()
        add(tm, lambda p, n: (lambda q: mix(mul('#e05a40' if 0.62 < q[1] < 0.74 else '#efe4c8', 0.9), '#fff6ea', 0.1 * clamp(n.z)))(loc(p)), 'transom')
        rim = [(-L / 2 - 0.04, q[1], q[2]) for q in outline[1:-1]] + [(-L / 2 - 0.04, outline[-1][1] + 0.02, outline[-1][2] * 0.5), (-L / 2 - 0.04, outline[0][1] + 0.02, outline[0][2] * 0.5)]
        add(gloop(rim, 0.04, K=5, up=X), wood('#8c6446'), 'transom')
        yb = 0.62; zb = max(abs(q[2]) for q in outline if q[1] < yb) - 0.04
        add(pbox(0.03, 0.11, 2 * zb, (-L / 2 - 0.05, yb, 0), r=0.01), lac('#e05a40'), 'transom')
        for tt, dd in ((0.17, 0.47), (0.6, 0.26)):
            yh = sAt(tt) - dd; sy = sAt(tt); ky = kAt(tt)
            phi = math.acos(clamp(1 - (yh - ky) / (sy - ky), -1, 1)); zt = bAt(tt) * math.sin(phi) - TH - 0.01
            add(beam(0.24, 0.06, 2 * zt, ((tt - 0.5) * L, yh, 0), c=0.018), wood('#c89a6a', seed=int(tt * 10)), 'thwarts')
        # the snapped mast, stepped through the forward thwart, lashed
        mx = (0.6 - 0.5) * L
        F.push((mx, 0.0, 0.0), rx=0.17)                                  # (re-stood against the roll a little)
        mx = 0.0
        add(cyl(0.07, 0.085, 2.1, (mx, 1.05, 0), K=8, bev=0.015), wood('#a87c54'), 'mast')
        for y in (0.72, 1.32):
            add(gloop([(mx + 0.085 * math.cos(TAU * k / 8), y, 0.085 * math.sin(TAU * k / 8)) for k in range(8)], 0.02, K=3), soft('#e0c890', 0.3), 'mast')
        mtop_b = F.m @ gl((mx, 2.08, 0)); mup = (F.m.to_3x3() @ gl((0, 1, 0))).normalized()
        F.pop()
    splinters(mtop_b, mup, 0.07, 5, 0.2, 7, wood('#e8c890'), 'mast')
    mtop = B2G(mtop_b)

    # ---- the plank ends round the hole: pale splintered wood (the broken strakes already have jagged ends)
    for (key, segs) in BREAK.items():
        s, j = key
        am = (EDGES[j] + EDGES[j + 1]) / 2
        for (t0, t1, jag0, jag1) in segs:
            for (tt, jg, sgn) in ((t1, jag1, 1), (t0, jag0, -1)):
                if tt <= 0.0 or tt >= 0.97: continue
                tq = tt + jg * 0.5
                p = Pk(tq, s * am, -TH * 0.5)
                if key in SPRUNG and t0 >= SPRUNG[key] - 1e-6 and sgn < 0: p = vadd(p, Nn(tq, s * am), 0.16)
                pb = WB(p); ax = (HM.to_3x3() @ gl((sgn, 0, 0))).normalized()
                splinters(pb, ax, 0.05, 3, 0.09, int(tt * 100) + j, wood('#e6cf9e'), 'splinters')

    # ---- barnacles on the camera-side hull, low down; seaweed draped over the rails; a crab on the rail
    rng = random.Random(33)
    for k in range(9):
        tt = 0.12 + 0.8 * k / 8 + rng.uniform(-0.03, 0.03)
        if 0.24 < tt < 0.62: tt = 0.66 + (tt - 0.24) * 0.4
        phi = rng.uniform(0.35, 0.8)
        p = Pk(tt, phi, 0.01); pb = WB(p)
        if pb.z < 0.03: continue
        barnacle_cluster(pb, (HM.to_3x3() @ gl(Nn(tt, phi))).normalized(), 1.0, 70 + k)
    def over_rail(tt, s, drop_out, drop_in, seed, w=0.04):
        r = W(vadd(Pk(tt, s * PI / 2, -TH * 0.5), (0, 0.09, 0)))
        o = W(Pk(tt, s * 1.25, 0.06)); o2 = W(Pk(tt, s * (1.25 - drop_out), 0.07))
        i_ = W(Pk(tt, s * 1.35, -TH - 0.07))
        kelp_strand([i_, r, o, o2], w, seed)
    over_rail(0.18, 1, 0.35, 0.2, 3)
    over_rail(0.83, 1, 0.5, 0.2, 4)
    over_rail(0.42, -1, 0.3, 0.2, 5)
    # a little red crab sitting on the camera-side rail near the stern
    cp = W(vadd(Pk(0.12, PI / 2, -TH * 0.5), (0, 0.1, 0)))
    with at(cp, ry=0.5):
        add(sph(0.075, (0, 0.03, 0), sc=(1.3, 0.62, 1.0), K=8, J=4), lac('#e8603a'), 'crab')
        for sx in (-1, 1):
            add(sph(0.022, (sx * 0.035, 0.085, 0.05), K=5, J=3), flat('#fff6ea'), 'crab')
            add(sph(0.012, (sx * 0.035, 0.09, 0.068), K=4, J=2), flat('#2e2a30'), 'crab')
            add(gtube([(sx * 0.07, 0.03, 0.04), (sx * 0.12, 0.05, 0.1), (sx * 0.1, 0.05, 0.15)], 0.017, K=4), lac('#e8603a'), 'crab')
            add(sph(0.038, (sx * 0.1, 0.055, 0.17), sc=(1.0, 0.7, 1.3), K=6, J=3), lac('#ee6a40'), 'crab')
            for k in range(3):
                add(gtube([(sx * 0.07, 0.02, -0.04 + k * 0.035), (sx * 0.13, 0.03, -0.05 + k * 0.04), (sx * 0.16, -0.06, -0.06 + k * 0.045)], 0.013, K=3), lac('#d8503a'), 'crab')

    # ---- the torn sail hanging from a broken yard lashed at the mast top (hangs plumb, in the piece frame)
    Y0 = vadd(mtop, (-0.16, -0.1, 0.06)); Y1 = vadd(mtop, (0.95, -0.5, 0.14))
    add(gtube([vadd(Y0, (-0.12, 0.05, 0)), Y0, vlerp(Y0, Y1, 0.5), Y1, vadd(Y1, (0.1, -0.05, 0.0))], 0.038, K=6), wood('#b88c5e'), 'yard')
    add(gloop([vadd(mtop, (0.075 * math.cos(TAU * k / 8), -0.08, 0.075 * math.sin(TAU * k / 8))) for k in range(8)], 0.022, K=3), soft('#e0c890', 0.3), 'yard')
    def hgt(u): # the sail's ragged drop under the yard
        rag = 0.16 * abs(((u * 4.5) % 1.0) - 0.5) * 2 + (0.18 if 0.55 < u < 0.68 else 0.0)
        return 0.95 - 0.35 * u - rag
    def Ssail(u, v):
        top = vlerp(Y0, Y1, 0.06 + 0.86 * u); top = vadd(top, (0, -0.05, 0.05))
        p = vadd(top, (0.04 * math.sin(v * 3), -v * hgt(u), 0.1 * math.sin(PI * u) * v + 0.04 * math.sin(v * 5 + u * 4)))
        return gl(p)
    def scol(u, v, front):
        c = '#efe2c2'
        if 0.34 < v < 0.46: c = '#de6a4c'
        if 0.15 < u < 0.38 and 0.55 < v < 0.8: c = mix(c, '#cdb890', 0.8)                   # an old patch
        c = mul(c, 0.86 + 0.14 * (1 - v) if front else 0.78)
        return c
    sheet(Ssail, 8, 6, 0.03, scol, uvfn=lambda u, v: (u, 1.0 - v), tag='sail', cloth=True, nrm=lambda u, v: gl((0, 0, 1)))

    # ---- the old lantern standing in the sunk stern, its glass at the kit light (-1.2, 0.35, -0.2)
    LX, LY, LZ = -1.2, 0.35, -0.2
    tt = 0.17; yh = sAt(tt) - 0.47 + 0.03                                # on the aft thwart's top, as near the light as it goes
    cand = [W(((tt - 0.5) * L, yh, -0.5 + k / 50)) for k in range(51)]
    q = min(cand, key=lambda c: (c[2] - LZ) ** 2)
    lx, base_y, lz = q[0], q[1], q[2]
    print('RG wreck lantern glass centre (%.3f, %.3f, %.3f) vs kit light (%.2f, %.2f, %.2f)' % (lx, base_y + 0.17, lz, LX, LY, LZ))
    LX, LZ = lx, lz
    with at((LX, base_y, LZ), ry=0.4):
        add(cyl(0.13, 0.14, 0.05, (0, 0.025, 0), K=8, bev=0.012), soft('#4f4a58', 0.3), 'lantern')
        for k in range(4):
            a = PI / 4 + k * PI / 2
            add(box(0.03, 0.26, 0.03, (math.cos(a) * 0.1, 0.18, math.sin(a) * 0.1), r=0.0), soft('#4f4a58', 0.3), 'lantern')
        add(cyl(0.1, 0.1, 0.24, (0, 0.17, 0), K=8), lambda p, n: mix('#ffc070', '#fff0c0', clamp(n.z * 0.4 + 0.5)), 'lantern', glow=True, flick=0.6, tint=0.0)
        add(glathe([(0.0, 0.0), (0.14, 0.0), (0.12, 0.035), (0.05, 0.12), (0.0, 0.13)], 8, pos=(0, 0.3, 0)), soft('#4f4a58', 0.3), 'lantern')
        add(gloop([(0.0, 0.47 + 0.06 * math.cos(TAU * k / 8), 0.06 * math.sin(TAU * k / 8)) for k in range(8)], 0.016, K=3, up=X), soft('#4f4a58', 0.3), 'lantern')

    # ---- glass floats in rope cradles hanging over the camera-side rail toward the stern (kit glassFloats)
    for k, (tt, drop, r, c) in enumerate(((0.22, 0.2, 0.12, '#3fc0b0'), (0.29, 0.32, 0.105, '#5aa8e0'), (0.66, 0.16, 0.11, '#7ad890'))):
        rp = W(vadd(Pk(tt, PI / 2, 0.0), (0, 0.06, 0)))
        out = W(Pk(tt, 1.3, 0.13))
        cpos = (out[0], rp[1] - drop - r, out[2] + 0.05)
        add(gtube([rp, vlerp(rp, (cpos[0], cpos[1] + r, cpos[2]), 0.5), (cpos[0], cpos[1] + r * 1.05, cpos[2])], 0.016, K=3), soft('#e0c890', 0.3), 'floats')
        add(sph(r, cpos, K=8, J=5), lambda p, n, c=c: mix(mul(c, 0.8), mix(c, '#f4fff8', 0.25), clamp(n.z * 0.6 + 0.35)), 'floats', glow=True, tint=0.6)
        rope_bag(gl(cpos), r)

    # ---- the net: slung over the bow rail, down the camera-side planking and out across the sand, corks on its hem
    NU, NV = 7, 9
    cols_ = []
    for i in range(NU):
        tt = 0.64 + 0.26 * i / (NU - 1)
        pl = [W(Pk(tt, 1.0, -TH - 0.08)), W(Pk(tt, 1.3, -TH - 0.06)), W(vadd(Pk(tt, PI / 2, -TH * 0.5), (0, 0.085, 0)))]
        phis = [1.32, 1.1, 0.88, 0.66]
        for ph in phis:
            q = W(Pk(tt, ph, 0.065))
            if q[1] < 0.12: break
            pl.append(q)
        last = pl[-1]
        pl += [(last[0] + 0.03, 0.05, last[2] + 0.2), (last[0] + 0.06 + 0.04 * math.sin(i), 0.04, last[2] + 0.45 + 0.08 * math.sin(i * 1.7))]
        pts = resample([Vector(q) for q in pl], NV)
        cols_.append([tuple(q) for q in pts])
    ncol = lambda p, n: mix('#b8a274', '#e6d4a6', clamp(n.z * 0.5 + 0.5))
    for i in range(NU): add(gtube(cols_[i], 0.017, K=3, caps=True), ncol, 'net')
    for j in range(1, NV):
        add(gtube([cols_[i][j] for i in range(NU)], 0.017, K=3, caps=True), ncol, 'net')
    for i in range(NU):
        p = cols_[i][-1]
        add(sph(0.05, (p[0], p[1] + 0.02, p[2]), sc=(1.0, 0.75, 1.35), K=6, J=3), soft('#ee6a40' if i % 2 else '#f0b070', 0.3), 'net')

    # ---- on the sand: drifts against the hull, the oar, the crab trap, a starfish, shells
    # one continuous drift round the hull's foot: a closed ring (buried skirt, a crest leaning on the planks, a long
    # soft fall onto the beach), its radius per bearing from where the hull meets the sand
    hc = W((0, 0.3, 0)); NB = 40
    rad = [0.0] * NB
    for i in range(61):
        for j in range(33):
            q = W(P(0.97 * i / 60, -PI / 2 + PI * j / 32))
            if q[1] < 0.12:
                a = math.atan2(q[2] - hc[2], q[0] - hc[0]); k = int((a / TAU) % 1.0 * NB) % NB
                rad[k] = max(rad[k], math.hypot(q[0] - hc[0], q[2] - hc[2]))
    for k in range(NB):                                                  # fill gaps, then smooth
        if rad[k] == 0.0: rad[k] = max(rad[(k - 1) % NB], rad[(k + 1) % NB])
    for _ in range(3): rad = [(rad[(k - 1) % NB] + 2 * rad[k] + rad[(k + 1) % NB]) / 4 for k in range(NB)]
    rings, cs, cols = [], [], []
    PROF = [(-0.12, -0.36, SAND_DK), (-0.04, 0.0, SAND), (0.0, 1.0, SAND_HI), (0.16, 0.8, SAND_HI), (0.34, 0.35, SAND), (0.56, -0.02, SAND), (0.52, -0.14, SAND_DK)]
    for (dr, hy, c) in PROF:
        ring = []
        for k in range(NB):
            a = TAU * (k + 0.5) / NB; ca, sa = math.cos(a), math.sin(a)
            back = clamp(-sa * 1.2 + 0.4)                                # the far (-z) side is drifted deeper
            h = (0.12 + 0.16 * back) * (0.8 + 0.4 * vnoise(Vector((ca * 2, sa * 2, 0)), 1.5, 4))
            r = rad[k] + dr * (1.0 + 0.5 * back) * (0.85 + 0.3 * vnoise(Vector((ca * 3, sa * 3, 1)), 1.0, 9))
            y = hy * h if hy > -0.1 else hy
            ring.append(gl((hc[0] + ca * r, y, hc[2] + sa * r))); cols.append(c)
        rings.append(ring); cs.append(gl((hc[0], 0.0, hc[2])))
    dt = Tmp(); ring_surface(dt, rings, cs, closed=True, hints=lambda fc, c: Vector((0, 0, 0)))
    dt.f = []; ids = [[i * NB + k for k in range(NB)] for i in range(len(PROF))]
    for i in range(len(PROF)):
        i1 = (i + 1) % len(PROF)
        for k in range(NB):
            q = [ids[i][k], ids[i][(k + 1) % NB], ids[i1][(k + 1) % NB], ids[i1][k]]
            fc = sum((dt.v[m] for m in q), Vector()) / 4
            cen = gl((hc[0], -0.1, hc[2])); rr = Vector((fc.x - cen.x, fc.y - cen.y, 0)).normalized()
            dt.f.append(q)
    dt.c = cols
    A.add(OB + '_sand', 'body', dt, None, 'sand')
    oa, ob_ = (-1.5, 0.05, 1.08), (-0.3, 0.08, 1.4)
    add(gtube([oa, ob_, vadd(ob_, (0.05, 0.0, 0.015))], 0.035, K=6), wood('#d8ae78'), 'oar')
    with at(vadd(oa, (-0.18, -0.015, -0.05)), ry=-math.atan2(ob_[2] - oa[2], ob_[0] - oa[0])):
        add(rbox((0.42, 0.15, 0.045), r=0.02, M=F.m @ lm((0, 0, 0))), wood('#d8ae78'), 'oar')
    with at((1.62, 0.0, 0.92), ry=0.4):
        crab_pot(0.24)
        add(gtube([(0.0, 0.38, 0.0), (0.25, 0.3, 0.1), (0.4, 0.05, 0.3), (0.7, 0.03, 0.25)], 0.02, K=3), soft('#e0c890', 0.3), 'pot')
    starfish((0.5, 0.0, 1.25), 0.16, 0.3, '#ff7a3a')
    for k, (x, z) in enumerate(((-0.75, 1.3), (1.15, 1.35), (0.15, 1.5))):
        add(glathe([(0.0, 0.0), (0.07, 0.005), (0.05, 0.035), (0.0, 0.045)], 7, pos=(x, 0.0, z), ry=k,
                   rfn=lambda rr, z_, th: rr * (1 + 0.12 * abs(math.sin(th * 4)))), soft(['#ffd8c8', '#fff0e0', '#ffc4c8'][k], 0.3), 'shells')
    return dict(light=(LX, LY, LZ), mast_top=mtop)

# ################################################################## the sea torii (tidepoolAssets.js seaTorii, seed 2)
# Kit: a rock plinth (r 1.35-1.6, y -0.25..0.25) standing in the shallows (the piece sits at sea level - 0.05, so the
# water is at local y = +0.05), a vermilion torii (w 2.1, h 2.5) with a black kasagi, a shimenawa at y 1.95, and two
# little stone lanterns at (+-1.05, 0.25, 0.75) whose lamps glow at y 0.58. Ours: a chunky rock islet (a terraced slab
# ringed by wet, barnacled boulders with sea-moss icing), a foam collar at the waterline, a myojin torii (stone drums,
# black bands, nuki, a gold shell plaque, red shimaki under an upswept black kasagi), a twisted two-strand shimenawa with
# shide, two toro lanterns, sea-pink tufts and a gull on the kasagi.
def boulder_surf(c, r, seed, flat=0.8):
    """a rounded boulder: S(th, ph) -> Blender point (ph = 0 at the top pole), game-local centre c, radii r"""
    M = F.m.copy()                                                       # (in the current frame)
    def S(th, ph):
        w = 1 + 0.11 * math.sin(2 * th + seed) + 0.06 * math.sin(3 * th + ph * 2 + seed * 0.7) + 0.04 * math.sin(5 * th - seed)
        cy = math.cos(ph); y = r[1] * cy * (flat if cy > 0 else 1.0)
        return M @ gl((c[0] + r[0] * math.sin(ph) * math.cos(th) * w, c[1] + y * (0.92 + 0.08 * w), c[2] + r[2] * math.sin(ph) * math.sin(th) * w))
    return S

def coast_rock_col(seed, wet=0.2, top_lichen=True):
    def f(p, n):
        y = p.z
        band = int(math.floor((y + 0.4) * 5.0 + vnoise(p, 1.2, seed) * 0.8))
        c = ['#bcae9e', '#c8baa8', '#b0a49a', '#d0c2ae'][band % 4]
        c = mix(mul(c, 0.82), mix(c, '#f2e8d8', 0.35), clamp(n.z * 0.7 + 0.35))
        if top_lichen and n.z > 0.55 and vnoise(p, 2.6, seed + 3) > 0.7: c = mix(c, '#e8b04a', 0.3)
        if y < wet:
            k = clamp((wet - y) / 0.22)
            c = mix(c, '#5e5a64', 0.75 * k)
            if 0.0 < y < wet and vnoise(p, 8.0, seed + 5) > 0.6: c = mix(c, '#efe8da', 0.6 * k)
        return c
    return f

def moss_col(p, n):
    return mix('#4a6c34', '#86a852', clamp(n.z * 0.75 + 0.25 + 0.12 * (vnoise(p, 5.0, 2) - 0.5)))

def boulder(c, r, seed, moss=True, cover=0.95, K=12, J=7, tag='boulders'):
    S = boulder_surf(c, r, seed)
    t = Tmp(); rings, cs = [], []
    for j in range(1, J):
        ph = PI * j / J; ring = [S(TAU * k / K, ph) for k in range(K)]; rings.append(ring); cs.append(sum(ring, Vector()) / K)
    ring_surface(t, rings, cs, pole0=S(0, 0.0), pole1=S(0, PI))
    add(t, coast_rock_col(seed), tag)
    if moss:
        rng = random.Random(seed)
        drips = [(TAU * k / 4 + rng.uniform(-0.4, 0.4), rng.uniform(0.18, 0.34), rng.uniform(0.24, 0.34)) for k in range(4)]
        base = lambda th: cover + 0.14 * math.sin(3 * th + seed) + 0.07 * math.sin(5 * th + seed * 2)
        he = drip_he(base, drips)
        Rm = max(r[0], r[2]); th_ = max(0.032, 0.022 * Rm)                  # (sampled finer and thicker on big boulders, so
        m = drape(S, he, lambda th, s: th_ * (1 - 0.25 * s), drip_angles(max(8, int(10 * Rm)), drips, offs=(-0.7, 0.0, 0.7)), 3, F.W(c))   #  no facet pokes through)
        add(m, moss_col, 'moss')

def gull(pos, ry=0.0, s=1.0, tag='gull'):
    with at(pos, ry=ry, s=s):
        add(sph(0.1, (0, 0.11, 0), sc=(1.55, 0.85, 0.9), K=8, J=5), soft('#fbf7f0', 0.2), tag)
        add(sph(0.065, (0.13, 0.19, 0), K=7, J=4), soft('#fbf7f0', 0.2), tag)
        add(glathe([(0.0, 0.0), (0.022, 0.0), (0.0, 0.07)], 5, pos=(0.185, 0.185, 0), rz=-PI / 2 - 0.15), soft('#f4c040', 0.3), tag)
        for sz in (-1, 1):
            add(sph(0.012, (0.16, 0.21, sz * 0.045), K=4, J=2), flat('#2e2a30'), tag)
            add(sph(0.09, (-0.04, 0.14, sz * 0.07), sc=(1.6, 0.35, 0.7), K=7, J=3, ry=sz * 0.12), soft('#9aa4b4', 0.25), tag)
            add(cyl(0.012, 0.012, 0.09, (0.0, 0.035, sz * 0.03), K=4), flat('#f08a40'), tag)
        add(sph(0.05, (-0.17, 0.13, 0), sc=(1.4, 0.4, 0.9), K=6, J=3), soft('#3a3a44', 0.2), tag)

def toro(pos, tag='toro'):
    """a chunky little stone lantern: plinth, post, a firebox with a glowing core, a curved hipped cap, a finial.
    Its lamp centre at pos + (0, 0.33, 0) (the kit's lamp: 0.58 from a 0.25 base)."""
    stone = '#b8b0b4'
    with at(pos):
        add(rbox((0.3, 0.3, 0.08), r=0.025, M=F.m @ lm((0, 0.04, 0))), stone_col(stone, 3, ao=False), tag)
        add(cyl(0.065, 0.08, 0.17, (0, 0.165, 0), K=6, bev=0.01), stone_col(stone, 4, ao=False), tag)
        add(rbox((0.26, 0.26, 0.04), r=0.015, M=F.m @ lm((0, 0.27, 0))), stone_col(stone, 5, ao=False), tag)
        for k in range(4):
            a = PI / 4 + k * PI / 2
            add(box(0.05, 0.13, 0.05, (math.cos(a) * 0.1, 0.355, math.sin(a) * 0.1), r=0.0), stone_col(stone, 6 + k, ao=False), tag)
        add(box(0.15, 0.12, 0.15, (0, 0.35, 0), r=0.0), lambda p, n: mix('#ffd890', '#fff4d0', clamp(n.z * 0.3 + 0.5)), tag, glow=True, flick=0.6)
        add(rbox((0.26, 0.26, 0.035), r=0.012, M=F.m @ lm((0, 0.432, 0))), stone_col(stone, 9, ao=False), tag)
        # the cap: a 4-sided lathe with curled-up eaves
        add(lathe([(0.0, 0.0), (0.25, 0.0), (0.24, 0.035), (0.13, 0.1), (0.05, 0.15), (0.0, 0.16)], 4, th0=PI / 4).xform(F.m @ lm((0, 0.45, 0))),
            lambda p, n: mix(mul('#a8a0a8', 0.82), '#d8d0d4', clamp(n.z * 0.8 + 0.1)), tag)
        add(sph(0.045, (0, 0.64, 0), K=5, J=3), stone_col(stone, 12, ao=False), tag)

def tuft(pos, seed, flowers=True, n=9, h=0.32, tag='tufts'):
    """dune grass blades (chunky cones) with a few sea-pink pompom flowers"""
    rng = random.Random(seed)
    for k in range(n):
        a = TAU * k / n + rng.uniform(-0.3, 0.3); lean = rng.uniform(0.25, 0.6); hh = h * rng.uniform(0.7, 1.15)
        b = vadd(pos, (math.cos(a) * 0.05, 0.0, math.sin(a) * 0.05))
        tip = vadd(b, (math.cos(a) * hh * lean, hh, math.sin(a) * hh * lean))
        add(gtube([b, vlerp(b, tip, 0.55), tip], lambda u: 0.024 * (1 - u * 0.85), K=3, caps=True),
            lambda p, nn: mix('#6e8a48', '#e2d68a', clamp((p.z - pos[1]) / h)), tag)
    if flowers:
        for k in range(3):
            a = rng.uniform(0, TAU); d = rng.uniform(0.06, 0.16); hh = rng.uniform(0.12, 0.2)
            b = vadd(pos, (math.cos(a) * d, 0.0, math.sin(a) * d)); tp = vadd(b, (0.02, hh, 0.01))
            add(gtube([b, tp], 0.012, K=3), flat('#6e8a48'), tag)
            add(sph(0.045, tp, K=5, J=3), lambda p, nn: mix('#e86a9a', '#ffb8d0', clamp(nn.z * 0.6 + 0.4)), tag)

def build_seaTorii():
    new_asset('rg-tidepool-seaTorii')
    TOP = 0.25; WL = 0.05
    rng = random.Random(21)
    # ---- the islet: a slab with a rounded lip, its top at y 0.25, a skirt to y -0.6
    ph = [rng.uniform(0, TAU) for _ in range(3)]
    def rim(a): return 1.38 * (1 + 0.1 * math.sin(2 * a + ph[0]) + 0.06 * math.sin(3 * a + ph[1]) + 0.04 * math.sin(5 * a + ph[2]))
    RINGS = [(0.3, TOP + 0.02), (0.55, TOP + 0.015), (0.76, TOP), (0.9, TOP - 0.03), (0.98, TOP - 0.1), (1.02, TOP - 0.2), (1.05, 0.0), (1.08, -0.3), (1.1, -0.6)]
    KS = 25; t = Tmp(); rings, cs = [], []
    for f, y in RINGS:
        ring = []
        for k in range(KS):
            a = TAU * k / KS; rr = rim(a) * f
            yy = y + (0.025 * math.sin(a * 3 + f * 5) if f < 0.95 else 0.0)
            ring.append(gl((math.cos(a) * rr, yy, math.sin(a) * rr)))
        rings.append(ring); cs.append(gl((0, y - 0.3, 0)))
    ring_surface(t, rings, cs, pole0=gl((0, TOP + 0.025, 0)), pole1=gl((0, -0.6, 0)))
    add(t, coast_rock_col(5, wet=0.2, top_lichen=False), 'islet')
    # ---- boulders round the islet (the camera side kept low so the torii stays clear), sea-moss icing on top
    BOULD = [(-1.45, 0.62, 0.15, 0.5, 0.42), (-1.2, -0.85, 0.12, 0.55, 0.5), (0.1, -1.38, 0.1, 0.62, 0.48), (1.25, -0.9, 0.14, 0.52, 0.5),
             (1.5, 0.45, 0.08, 0.42, 0.36), (0.75, 1.32, 0.0, 0.34, 0.26), (-0.55, 1.4, -0.02, 0.3, 0.24)]
    for i, (x, z, y, r, ry) in enumerate(BOULD):
        boulder((x, y, z), (r, ry, r * 0.9), 11 + i * 7, moss=i in (0, 1, 3, 4), cover=0.62 + 0.08 * (i % 3), K=9, J=5)
    for i, (x, z, r) in enumerate(((0.35, 1.62, 0.13), (-1.95, 0.45, 0.15), (1.9, -0.2, 0.12))):
        rock((x, 0.0, z), r, sq=0.8, seed=40 + i, col='#a89c98', tag='pebbles', K=7)
    # barnacles in the splash band on the camera side
    for k in range(3):
        a = 0.55 + 2.0 * k / 2 + rng.uniform(-0.1, 0.1); rr = rim(a) * 1.035
        barnacle_cluster(gl((math.cos(a) * rr, 0.1 + rng.uniform(-0.02, 0.05), math.sin(a) * rr)), gl((math.cos(a), 0.25, math.sin(a))), 1.0, 90 + k)
    # ---- the foam collar at the waterline (white, lumpy) with a few bubbles
    foam = []
    for k in range(32):
        a = TAU * k / 32
        foam.append(gl((math.cos(a) * rim(a) * 1.07, WL + 0.02 + 0.02 * math.sin(a * 7), math.sin(a) * rim(a) * 1.07)))
    add(tube_loop(foam, lambda s: 0.065 + 0.03 * math.sin(s * TAU * 9), K=4), lambda p, n: mix('#cfe8ee', '#fbffff', clamp(n.z * 0.7 + 0.4)), 'foam')
    for k in range(4):
        a = rng.uniform(0, TAU); rr = rim(a) * rng.uniform(1.12, 1.22)
        add(sph(rng.uniform(0.04, 0.07), (math.cos(a) * rr, WL + 0.02, math.sin(a) * rr), sc=(1, 0.6, 1), K=6, J=3), lambda p, n: mix('#d6eef2', '#fbffff', clamp(n.z)), 'foam')

    # ---- the torii: w 2.1 (post centres), h 2.5 above the islet top, kit placement at y 0.25
    Wd, Hh, R = 2.1, 2.5, 0.115
    RED, RED_HI, RED_LO, BLK = '#e8543a', '#ff8a66', '#a8342a', '#3a3036'
    redc = lac(RED, RED_HI, RED_LO); blkc = lac(BLK, '#6a5a64', '#221c22')
    with at((0, TOP, 0)):
        for sx in (-1, 1):
            with at((sx * Wd / 2, 0, 0), rz=sx * 0.025):
                add(glathe([(0.0, 0.0), (R * 1.75, 0.0), (R * 1.8, 0.05), (R * 1.6, 0.17), (R * 1.25, 0.22), (0.0, 0.22)], 10), stone_col('#b8b0b4', 2 + sx, ao=False), 'drums')
                add(cyl(R * 1.14, R * 1.18, 0.2, (0, 0.31, 0), K=10, bev=0.02), blkc, 'posts')
                add(cyl(R * 0.94, R * 1.04, Hh - 0.2, (0, 0.2 + (Hh - 0.2) / 2, 0), K=10, bev=0.0), redc, 'posts')
                add(cyl(R * 1.12, R * 1.12, 0.07, (0, Hh - 0.42, 0), K=10, bev=0.015), blkc, 'posts')
        # nuki (the tie beam) through the posts, its ends proud
        add(beam(Wd + 0.62, 0.15, 0.13, (0, Hh * 0.78, 0), c=0.03), redc, 'nuki')
        # gakuzuka + the plaque: black frame, gold field, a raised cream scallop shell
        add(beam(0.11, Hh - Hh * 0.78, 0.1, (0, (Hh * 0.78 + Hh) / 2, 0), c=0.02), redc, 'gaku')
        with at((0, Hh * 0.89, 0.06)):
            add(rbox((0.34, 0.06, 0.42), r=0.03, M=F.m @ lm((0, 0, 0))), blkc, 'gaku')
            add(rbox((0.26, 0.04, 0.33), r=0.02, M=F.m @ lm((0, 0, 0.025))), lac('#f2c04a', '#ffe8a0', '#b88a2a'), 'gaku')
            fan = [(0.0, -0.1)] + [(math.cos(PI * (0.08 + 0.84 * k / 10)) * 0.1 * (1.0 if k % 2 == 0 else 0.9), -0.07 + math.sin(PI * (0.08 + 0.84 * k / 10)) * 0.13 * (1.0 if k % 2 == 0 else 0.92)) for k in range(11)]
            add(prism(fan[::-1], 0.03, 0.045), lambda p, n: mix('#f4d6c4', '#fff6ea', clamp(n.z * 0.5 + 0.5)), 'gaku')
        # shimaki (red) under the kasagi (black): swept rounded beams rising to upturned ends
        Lk = Wd + 0.95
        def curve(L_, y0, lift, n=12): return [Vector(gl((L_ * (k / n - 0.5), y0 + lift * abs(2 * k / n - 1) ** 2.6, 0))) for k in range(n + 1)]
        def rprof(w, h, c):
            return [(w, h - c), (w - c, h), (-w + c, h), (-w, h - c), (-w, -h + c), (-w + c, -h), (w - c, -h), (w, -h + c)]
        sh = curve(Lk - 0.25, Hh - 0.03, 0.16)
        add(sweep([F.m @ p for p in sh], rprof(0.095, 0.06, 0.025), up=Z), redc, 'shimaki')
        kg = curve(Lk, Hh + 0.12, 0.26)
        add(sweep([F.m @ p for p in kg], rprof(0.13, 0.085, 0.04), up=Z), blkc, 'kasagi')
        # the gull, standing on the kasagi toward its right end
        k9 = 9; gp = B2G(F.m @ kg[k9])
        gp = (gp[0], gp[1] + 0.085, gp[2])
    gull(gp, ry=-2.4, s=1.1)

    # ---- the shimenawa: two twisted straw strands sagging between the posts, lashed round them, three shide
    yR, sag, zR = 1.95, 0.17, 0.1
    def rope_pt(u): return (-0.95 + 1.9 * u, yR - sag * 4 * u * (1 - u), zR)
    N_ = 20
    for k in range(2):
        pts = []
        for i in range(N_ + 1):
            u = i / N_; c = rope_pt(u); th = u * 9.0 + k * PI
            pts.append((c[0], c[1] + 0.034 * math.cos(th), c[2] + 0.034 * math.sin(th)))
        add(gtube(pts, lambda s: 0.045 * (0.85 + 0.15 * math.sin(s * PI)), K=4), lambda p, n: mix('#c8a868', '#f0dca4', clamp(n.z * 0.6 + 0.4)), 'rope')
    for sx in (-1, 1):
        x = sx * (Wd / 2 + 0.01 * sx)
        add(gloop([(x + 0.135 * math.cos(TAU * k / 10), yR + 0.02, 0.135 * math.sin(TAU * k / 10)) for k in range(10)], 0.035, K=4), lambda p, n: mix('#c8a868', '#f0dca4', clamp(n.z * 0.6 + 0.4)), 'rope')
    for u in (0.27, 0.5, 0.73):
        c = rope_pt(u)
        with at((c[0], c[1] - 0.05, zR + 0.04)):
            for k in range(4):
                sx = 0.0 if k % 2 == 0 else 0.035
                add(pbox(0.11, 0.1, 0.035, (sx, -0.06 - k * 0.1, 0), r=0.0, rz=0.08 * (1 if k % 2 else -1)), soft('#fffaf2', 0.15), 'shide')

    # ---- the two toro lanterns (kit: (+-1.05, 0.25, 0.75), lamps at y 0.58)
    for sx in (-1, 1): toro((sx * 1.05, TOP, 0.75))
    # ---- sea-pink tufts at the back, a starfish on the lip
    tuft((-0.85, TOP + 0.02, -0.75), 3, n=6); tuft((0.95, TOP + 0.02, -0.55), 4, n=5)
    for k, (x, z, r) in enumerate(((0.05, 1.12, 0.2), (-0.12, 0.62, 0.22), (0.08, 0.12, 0.21))):   # pavers up to the gate
        add(lathe([(0.0, 0.0), (r, 0.0), (r * 0.95, 0.035), (0.0, 0.045)], 6, th0=k,
                  rfn=lambda rr, z_, th, k=k: rr * (1 + 0.1 * math.sin(2 * th + k))).xform(Matrix.Translation(gl((x, TOP - 0.005, z)))),
            stone_col('#b4a89e', 20 + k, ao=False), 'pavers')
    starfish((0.5, TOP + 0.012, 1.0), 0.13, 0.8, '#ff7a3a')
    return dict(water=WL, lamps=[(-1.05, 0.58, 0.81), (1.05, 0.58, 0.81)])

# ################################################################## round 2: shared bits
def ship_lantern(pos, r=0.1, h=0.22, ry=0.0, hang=True, tag='lantern', flick=0.6):
    """an iron ship lantern (game-local pos = its glass centre): bottom pan, four corner posts, a warm glass, a domed
    cap and a hanging ring"""
    iron = soft('#4f4a58', 0.3)
    with at(pos, ry=ry):
        add(cyl(r * 1.25, r * 1.35, 0.045, (0, -h / 2 - 0.02, 0), K=8, bev=0.01), iron, tag)
        for k in range(4):
            a = PI / 4 + k * PI / 2
            add(box(0.026, h + 0.02, 0.026, (math.cos(a) * r * 1.02, 0, math.sin(a) * r * 1.02), r=0.0), iron, tag)
        add(cyl(r, r, h, (0, 0, 0), K=8), lambda p, n: mix('#ffc070', '#fff0c0', clamp(n.z * 0.4 + 0.5)), tag, glow=True, flick=flick)
        add(glathe([(0.0, 0.0), (r * 1.35, 0.0), (r * 1.2, 0.035), (r * 0.5, h * 0.5), (0.0, h * 0.55)], 8, pos=(0, h / 2 + 0.01, 0)), iron, tag)
        if hang: add(gloop([(0.0, h / 2 + h * 0.55 + 0.045 + 0.04 * math.cos(TAU * k / 8), 0.04 * math.sin(TAU * k / 8)) for k in range(8)], 0.014, K=3, up=X), iron, tag)

def drift_col(seed=0, base='#d2c0a6'):
    """sun-bleached driftwood: silver-cream with grain streaks and darker knots, green-wet at the foot"""
    def f(p, n):
        g = 0.82 + 0.2 * math.sin(p.z * 11 + math.atan2(p.y, p.x) * 3 + seed) ** 2
        c = mul(mix(base, '#f2ece0', clamp(n.z * 0.5 + 0.2)), g)
        if vnoise(p, 6.0, seed) > 0.72: c = mul(c, 0.78)
        if p.z < 0.45: c = mix(c, '#6a7262', 0.45 * (1 - max(0.0, p.z) / 0.45))
        return c
    return f

def crate2(pos, s=0.36, wd='#e2b988', ry=0.0, tag='crates'):
    with at(pos, ry=ry):
        hh = s * 0.85
        add(beam(s, hh, s, (0, hh / 2, 0), c=0.03), lambda p, n: mul(wd, (0.9 + 0.12 * clamp(n.z))), tag)
        for side in (0, 1):
            with at((0, 0, 0), ry=side * PI / 2):
                add(box(s * 0.82, 0.05, s + 0.02, (0, hh * 0.5, 0), r=0.0, rz=0.6 if side else -0.6), flat(mul(wd, 0.76)), tag)
        add(box(s + 0.02, 0.05, s + 0.02, (0, hh - 0.03, 0), r=0.0), flat(mul(wd, 0.8)), tag)

def bucket2(pos, r=0.14, h=0.2, color='#8aa0b8', tag='bucket'):
    with at(pos):
        add(glathe([(0.0, 0.0), (r * 0.85, 0.0), (r, h), (r * 0.9, h), (r * 0.72, 0.03), (0.0, 0.03)], 10), lambda p, n: mix(mul(color, 0.8), mix(color, '#ffffff', 0.25), clamp(n.z * 0.5 + 0.5)), tag)
        for y in (0.04, h - 0.03): add(gloop([(r * (0.86 + 0.14 * y / h) * math.cos(TAU * k / 10), y, r * (0.86 + 0.14 * y / h) * math.sin(TAU * k / 10)) for k in range(10)], 0.014, K=3), soft('#4f4a58', 0.3), tag)
        add(gtube([(-r, h, 0), (-r * 0.6, h + r * 0.8, 0), (0, h + r * 1.0, 0), (r * 0.6, h + r * 0.8, 0), (r, h, 0)], 0.012, K=3), soft('#4f4a58', 0.3), tag)

def buoy(pos, r=0.17, base='#e8503a', band='#fff6ea', tag='buoys', glow=False):
    with at(pos):
        loc = local_fn()
        def f(p, n):
            c = band if abs(loc(p)[1]) < r * 0.32 else base
            return mix(mul(c, 0.8), mix(c, '#fff8f0', 0.3), clamp(n.z * 0.5 + 0.5))
        add(sph(r, (0, 0, 0), sc=(1, 1.15, 1), K=10, J=6), f, tag)
        add(cyl(0.03, 0.035, 0.07, (0, r * 1.15 + 0.03, 0), K=6), soft('#4f4a58', 0.3), tag)

def twisted_rope(path_fn, n, r, tw=9.0, off=0.035, K=4, col=None, tag='rope'):
    """two straw strands twisting round a path (path_fn(u) -> game-local point)"""
    col = col or (lambda p, nn: mix('#c8a868', '#f0dca4', clamp(nn.z * 0.6 + 0.4)))
    for k in range(2):
        pts = []
        for i in range(n + 1):
            u = i / n; c = path_fn(u); c2 = path_fn(min(1.0, u + 1e-3)); c1 = path_fn(max(0.0, u - 1e-3))
            T = Vector((c2[0] - c1[0], c2[1] - c1[1], c2[2] - c1[2])).normalized()
            N = T.cross(Vector((0, 1, 0))); N = N.normalized() if N.length > 1e-6 else Vector((0, 0, 1))
            Bv = N.cross(T).normalized(); th = u * tw + k * PI
            pts.append((c[0] + (N.x * math.cos(th) + Bv.x * math.sin(th)) * off, c[1] + (N.y * math.cos(th) + Bv.y * math.sin(th)) * off, c[2] + (N.z * math.cos(th) + Bv.z * math.sin(th)) * off))
        add(gtube(pts, lambda s: r * (0.85 + 0.15 * math.sin(s * PI)), K=K), col, tag)

def shide(top, s=1.0, n=4, tag='shide', cloth=True):
    """a paper zigzag hanging from top (game-local); cloth: uv.y 1 at its top"""
    yTop = top[1]
    with at(top):
        for k in range(n):
            sx = 0.0 if k % 2 == 0 else 0.035 * s
            t = pbox(0.11 * s, 0.1 * s, 0.03, (sx, -0.06 * s - k * 0.1 * s, 0), r=0.0, rz=0.08 * (1 if k % 2 else -1))
            if cloth: add(t, soft('#fffaf2', 0.15), tag, cloth=lambda p, yTop=yTop, s=s: (0.5, clamp(1 - (yTop - p.z) / (0.45 * s))))
            else: add(t, soft('#fffaf2', 0.15), tag)

def lumpy_tube(pts, rad, K, seed, amp=0.22, f=0.7, caps=True):
    """a rock tube (game-local pts, rad(u)): each ring's radius pushed in and out by 3-D value noise"""
    P = [F.W(p) for p in pts]; n = len(P); Fr = frames(P, Z); rings, cs = [], []
    for i, (p, (T, W, U)) in enumerate(zip(P, Fr)):
        r0 = rad(i / (n - 1)); ring = []
        for k in range(K):
            d = W * math.cos(TAU * k / K) + U * math.sin(TAU * k / K)
            q = p + d * r0
            ring.append(p + d * r0 * (1 + amp * (vnoise(q, f, seed) - 0.5) * 2 + 0.5 * amp * (vnoise(q, f * 2.3, seed + 3) - 0.5)))
        rings.append(ring); cs.append(p)
    t = Tmp()
    ring_surface(t, rings, cs, pole0=(P[0] - Fr[0][0] * rad(0) * 0.6) if caps else None, pole1=(P[-1] + Fr[-1][0] * rad(1) * 0.6) if caps else None)
    return t

# ################################################################## shoreLamp (tidepoolAssets.js shoreLamp, seed 1)
# Kit: a 1.7 m lantern post (lanternPost) with an arm toward +z and a chochin; its light at (0, 1.45, 0.34). Ours: a
# chunky driftwood post on a pile of beach stones, rope lashings, a tarred arm and brace, an iron ship lantern hung
# with its glass at the light, a little red buoy and a sea-glass float hanging from the brace.
def build_shoreLamp():
    new_asset('rg-tidepool-shoreLamp')
    H = 1.72
    add(cyl(0.075, 0.09, H + 0.25, (0, (H + 0.25) / 2 - 0.25, 0), K=8, bev=0.02), drift_col(3), 'post')
    add(glathe([(0.0, 0.0), (0.11, 0.0), (0.1, 0.04), (0.0, 0.12)], 8, pos=(0, H, 0)), wood('#54494a'), 'post')
    add(sph(0.035, (0, H + 0.14, 0), K=6, J=3), lac('#e8b84a'), 'post')
    for y in (0.5, 1.2):
        add(gloop([(0.088 * math.cos(TAU * k / 10), y, 0.088 * math.sin(TAU * k / 10)) for k in range(10)], 0.022, K=4), soft('#e0c890', 0.3), 'post')
    rock((0, 0.05, 0), 0.24, sq=1.0, seed=3, col='#c9bfc6', tag='base', K=9)
    rock((0.2, 0.02, 0.12), 0.12, sq=0.8, seed=8, col='#e4dcd2', tag='base', K=7)
    rock((-0.16, 0.02, 0.14), 0.1, sq=0.8, seed=9, col='#bdb4c4', tag='base', K=7)
    add(beam(0.07, 0.07, 0.5, (0, H - 0.06, 0.2), c=0.016), wood('#54494a'), 'arm')
    add(strut((0, H - 0.36, 0.05), (0, H - 0.08, 0.27), 0.05), wood('#54494a'), 'arm')
    add(gloop([(0.0, H - 0.115 + 0.03 * math.cos(TAU * k / 6), 0.34 + 0.03 * math.sin(TAU * k / 6)) for k in range(6)], 0.012, K=3, up=X), soft('#4f4a58', 0.3), 'arm')
    ship_lantern((0, 1.45, 0.34), r=0.085, h=0.19, ry=0.3)
    with at((0.0, H - 0.3, 0.14)):                                       # a red buoy on a cord from the brace
        add(box(0.016, 0.12, 0.016, (0.06, -0.06, 0), r=0.0), flat('#e0c890'), 'buoy')
        buoy((0.06, -0.2, 0), r=0.07)
    with at((-0.02, 1.15, 0.08)):
        add(box(0.016, 0.08, 0.016, (0, -0.04, 0.03), r=0.0), flat('#e0c890'), 'float')
        add(sph(0.075, (0, -0.15, 0.03), K=8, J=5), lambda p, n: mix(mul('#5fc8b8', 0.8), mix('#5fc8b8', '#f4fff8', 0.3), clamp(n.z * 0.6 + 0.35)), 'float', glow=True, tint=0.6)
        rope_bag(gl((-0.02, 1.0, 0.11)), 0.075)
    return dict(light=(0, 1.45, 0.34))

# ################################################################## giantClam (tidepoolAssets.js giantClam, seed 1)
# Kit: a ~0.87 m clam, the lower shell a bowl, the upper propped open at its hinge (z -0.3), a teal mantle and a glowing
# pearl at (0, 0.26, 0.02) (light (0, 0.4, 0.05)); placed at scale 1.25 on the treasure pool's floor. Ours: thick
# fluted shells with scalloped rims (lilac outside, pearly pink inside), a wavy teal mantle with spots, the pearl.
def clam_shell(up, R=0.44, H=0.17, D=0.85, flutes=7):
    """one half shell as a closed solid: a fluted dome (outer) and its inner face (0.92 R, 0.78 H), joined at the
    scalloped rim; local: rim on y = 0, the dome below (up=False, a bowl) or above (up=True)"""
    K, J = 36, 6; rings, cs, cols = [], [], []
    def P(th, ph, inner):
        fl = 1 + 0.07 * abs(math.sin(flutes * th / 2)) * (ph / (PI / 2))
        rr = R * math.sin(ph) * fl * (0.92 if inner else 1.0); yy = H * math.cos(ph) * (0.78 if inner else 1.0)
        rim = 0.03 * math.cos(flutes * th) * (ph / (PI / 2)) ** 3
        return (rr * math.cos(th), (yy if up else -yy) + rim, rr * math.sin(th) * D)
    for inner in (False, True):
        for j in (range(1, J + 1) if not inner else range(J, 0, -1)):
            ph = PI / 2 * j / J
            ring = [gl(P(TAU * k / K, ph, inner)) for k in range(K)]
            rings.append(ring); cs.append(sum(ring, Vector()) / K)
            for k in range(K):
                fl = abs(math.sin(flutes * TAU * k / K / 2))
                if inner: cols.append(mix('#f8d8e6', '#fff4f8', 0.3 + 0.5 * fl))
                else: cols.append(mix(mix('#a890c8', '#dccbee', ph / (PI / 2)), '#f4eaff', 0.35 * fl))
    t = Tmp()
    ring_surface(t, rings, cs, pole0=gl(P(0, 0, False)), pole1=gl(P(0, 0, True)))
    t.c = cols + [cols[0], cols[-1]]
    return t

def build_giantClam():
    new_asset('rg-tidepool-giantClam')
    with at((0, 0.17, 0)):
        lo = clam_shell(False); t = lo.xform(F.m); add(t, None, 'shell')
        # the mantle: a wavy teal disc just inside the lower rim, with paler spots
        mt = lathe([(0.0, -0.06), (0.36, -0.05), (0.385, -0.005), (0.3, 0.02), (0.0, 0.03)], 28, sx=1.0, sy=0.84,
                   rfn=lambda rr, z, th: rr * (1 + 0.06 * math.sin(7 * th))).xform(F.m)
        add(mt, lambda p, n: mix('#2f98b8', '#6ee0d8', clamp(n.z * 0.4 + 0.3 + 0.5 * (vnoise(p, 18.0, 4) > 0.62))), 'mantle')
        with at((0, 0.0, -0.3), rx=-0.95):                               # the upper shell, propped open at the hinge
            up = clam_shell(True); add(up.xform(F.m @ lm((0, 0, 0.3))), None, 'shell')
        add(gtube([(-0.12, 0.0, -0.3), (0.0, 0.03, -0.32), (0.12, 0.0, -0.3)], 0.04, K=5), soft('#8a7098', 0.3), 'hinge')
    add(sph(0.09, (0, 0.26, 0.02), K=12, J=8), lambda p, n: mix('#f0e8f8', '#fffaff', clamp(n.z * 0.5 + 0.5)), 'pearl', glow=True, tint=0.4)
    return dict(pearl=(0, 0.26, 0.02))

# ################################################################## lookout (tidepoolAssets.js lookout, seed 6)
# Kit: a 2.2 x 1.6 deck at y 0.18 on four legs, a back rail (z -0.75) to 1.0 m, a brass telescope on a tripod at
# (0.35, 0.24, -0.25) yaw 0.5, a bench at (-0.6, 0.24, 0.2) and a striped wind sock on a 2.4 m pole at (-1.2, 0.24, -0.8).
def build_lookout():
    new_asset('rg-tidepool-lookout')
    Y = 0.24
    for (x, z) in ((-1.0, -0.7), (1.0, -0.7), (-1.0, 0.7), (1.0, 0.7)):
        add(cyl(0.07, 0.08, 0.5, (x, Y - 0.27, z), K=7), wood('#6a5040', seed=int(x * 3 + z)), 'legs')
        rock((x, -0.02, z), 0.14, sq=0.6, seed=int(x * 7 + z * 3 + 20), col='#c9bfc6', tag='pads', K=7)
    for i in range(8):
        k = hz(i * 3.7 + 1)
        add(pbox(2.3 + (k - 0.5) * 0.06, 0.07, 0.19, ((k - 0.5) * 0.03, Y - 0.035, -0.7 + i * 0.2), r=0.014), wood(mul(['#c89868', '#d8aa78', '#b88a60', '#dcb488'][i % 4], 1.0), seed=i), 'deck')
    for z in (-0.72, 0.72): add(beam(2.3, 0.1, 0.08, (0, Y - 0.12, z), c=0.018), wood('#6a5040'), 'deck')
    for sx in (-1, 0, 1):
        add(beam(0.08, 0.86, 0.08, (sx * 1.05, Y + 0.43, -0.76), c=0.016), wood('#7a5e48', seed=sx + 2), 'rail')
        add(glathe([(0.0, 0.0), (0.065, 0.0), (0.0, 0.07)], 6, pos=(sx * 1.05, Y + 0.86, -0.76)), wood('#5a4434'), 'rail')
    add(beam(2.26, 0.07, 0.1, (0, Y + 0.8, -0.76), c=0.018), wood('#8a6a52'), 'rail')
    mid = [(-1.05 + 2.1 * t / 8, Y + 0.42 - 0.07 * math.sin(PI * (t % 4) / 4), -0.74) for t in range(9)]
    add(gtube(mid, 0.026, K=4), soft('#e0c890', 0.3), 'rail')
    # a red-and-white life ring hung on the rail
    with at((0.55, Y + 0.55, -0.7)):
        loc = local_fn()
        add(gloop([(0.17 * math.cos(TAU * k / 14), 0.17 * math.sin(TAU * k / 14), 0) for k in range(14)], 0.05, K=6, up=Vector((0, 1, 0))),
            lambda p, n: (lambda q: mix(mul('#e8503a' if (math.atan2(q[1], q[0]) % (PI / 2)) < PI / 4 else '#fff6ea', 0.85), '#fff8f0', 0.2 * clamp(n.z)))(loc(p)), 'ring')
    # the telescope on its tripod
    with at((0.35, Y, -0.25), ry=0.5):
        for k in range(3):
            a = k / 3 * TAU + 0.3
            add(gtube([(0, 1.02, 0), (math.cos(a) * 0.3, 0.0, math.sin(a) * 0.3)], 0.025, K=5), wood('#5a4434'), 'scope')
        add(sph(0.05, (0, 1.05, 0), K=6, J=3), lac('#c89a50'), 'scope')
        with at((0, 1.12, -0.05), rx=-0.25):
            add(cyl(0.055, 0.075, 0.72, (0, 0, -0.05), K=10, rx=PI / 2), lac('#a87a3e', '#e8c080', '#6a4a24'), 'scope')
            add(cyl(0.085, 0.085, 0.06, (0, 0, -0.42), K=10, rx=PI / 2), lac('#e8c86a'), 'scope')
            add(cyl(0.04, 0.04, 0.08, (0, 0, 0.34), K=8, rx=PI / 2), soft('#4f4a58', 0.3), 'scope')
            for zz in (-0.2, 0.12): add(gloop([(0.068 * math.cos(TAU * k / 10), 0.068 * math.sin(TAU * k / 10), zz) for k in range(10)], 0.012, K=3, up=Vector((0, 1, 0))), lac('#8a6430'), 'scope')
    # the bench
    with at((-0.6, Y, 0.2)):
        add(pbox(0.95, 0.07, 0.36, (0, 0.4, 0), r=0.02), wood('#e2b988'), 'bench')
        for sx in (-1, 1): add(beam(0.07, 0.4, 0.3, (sx * 0.36, 0.2, 0), c=0.015), wood('#7a5a44'), 'bench')
        add(sph(0.11, (0.25, 0.5, 0.02), sc=(1.1, 0.5, 1.0), K=8, J=4), soft('#5a8ac8', 0.3), 'bench')     # a folded blue cushion
    # the rope coil and a crate of charts by the rail
    with at((-0.15, Y, -0.45)):
        for k in range(3):
            rr = 0.2 - k * 0.04
            add(gloop([(rr * math.cos(TAU * i / 10), 0.035 + k * 0.05, rr * math.sin(TAU * i / 10)) for i in range(10)], 0.034, K=4), soft('#e0c890' if k % 2 else '#d0b880', 0.3), 'coil')
    crate2((0.95, Y, 0.45), s=0.34, wd='#6a9ac8', ry=0.3)
    # the wind sock: a white pole, a red-and-white striped sock (cloth, its weight off the pole)
    with at((-1.2, Y, -0.8)):
        add(cyl(0.035, 0.045, 2.45, (0, 1.2, 0), K=7, bev=0.01), lambda p, n: mix('#d8d0c4', '#fff6ea', clamp(n.z * 0.5 + 0.4)), 'sock')
        add(sph(0.05, (0, 2.45, 0), K=6, J=3), lac('#e8b84a'), 'sock')
        add(gloop([(0.03 + 0.13 * math.cos(TAU * k / 10) * 0.0 + 0.0, 2.25 + 0.13 * math.cos(TAU * k / 10), 0.13 * math.sin(TAU * k / 10)) for k in range(10)], 0.018, K=3, up=X), soft('#4f4a58', 0.3), 'sock')
        def Ssock(u, v):                                                 # u along the sock, v round it
            rr = 0.13 - 0.07 * u; th = TAU * v
            return F.W((0.04 + 0.72 * u, 2.25 - 0.12 * u * u + rr * math.cos(th), rr * math.sin(th) + 0.04 * math.sin(u * 4)))
        def scol(u, v, front):
            c = '#e8503a' if int(u * 4) % 2 == 0 else '#fff6ea'
            return mul(c, 0.95 if front else 0.75)
        sheet(Ssock, 8, 10, 0.02, scol, uvfn=lambda u, v: (u, 1.0 - u), tag='sock', cloth=True)
    return dict(deck=Y)

# ################################################################## netRack (tidepoolAssets.js netRack, seeds 5 and 9)
# Kit: posts at x +-1.3 (1.9 m), a pole at 1.85, a net drying on it (cloth), glass floats on the pole, red/white buoys at
# x ~1.7-2.0, cork floats at x ~-1.8, two crates, a bucket and a rope coil on the sand. Ours: the same, chunkier: driftwood
# posts with lashings and stone feet, a real toy net (rope grid, cloth so it sways from the pole) with a cork hem.
def build_netRack():
    new_asset('rg-tidepool-netRack')
    w = 2.6
    for sx in (-1, 1):
        with at((sx * w / 2, 0, 0), rz=sx * 0.05):
            add(cyl(0.07, 0.085, 2.15, (0, 2.15 / 2 - 0.2, 0), K=8, bev=0.015), drift_col(4 + sx), 'posts')
            add(glathe([(0.0, 0.0), (0.09, 0.0), (0.0, 0.1)], 7, pos=(0, 1.95, 0)), wood('#54494a'), 'posts')
            add(gloop([(0.085 * math.cos(TAU * k / 10), 1.84, 0.085 * math.sin(TAU * k / 10)) for k in range(10)], 0.025, K=4), soft('#e0c890', 0.3), 'posts')
        rock((sx * w / 2, 0.03, 0.02), 0.2, sq=0.9, seed=30 + sx, col='#c9bfc6', tag='feet', K=8)
        add(strut((sx * (w / 2 - 0.05), 0.7, 0), (sx * (w / 2 - 0.5), 1.8, 0), 0.05), wood('#8a6e56'), 'posts')
    add(cyl(0.045, 0.045, w + 0.5, (0, 1.86, 0), K=7, rz=PI / 2), wood('#a08466'), 'pole')
    # the net: a rope grid hanging from the pole, gathered at the ends, sagging hem with folds (cloth: v = 1 at the pole)
    NU, NV, yTop, hN = 13, 8, 1.82, 1.25
    def Npt(u, v):
        x = (u - 0.5) * (w - 0.3) * (1 - 0.12 * v)
        sag = 0.12 * math.sin(PI * u)
        y = yTop - v * (hN - 0.25 * abs(u - 0.5) * 2) - sag * v
        z = 0.05 + 0.06 * math.sin(u * 13) * v + 0.04 * v
        return (x, y, z)
    G_ = [[Npt(i / (NU - 1), j / (NV - 1)) for j in range(NV)] for i in range(NU)]
    ncol = lambda p, n: mix('#b8a274', '#e6d4a6', clamp(n.z * 0.5 + 0.5))
    nuv = lambda p: (0.5, clamp(1 - (yTop - p.z) / hN))
    for i in range(NU): add(gtube(G_[i], 0.016, K=3), ncol, 'net', cloth=nuv)
    for j in range(1, NV): add(gtube([G_[i][j] for i in range(NU)], 0.016, K=3), ncol, 'net', cloth=nuv)
    for i in range(0, NU, 2):
        p = G_[i][-1]
        add(sph(0.045, (p[0], p[1] - 0.02, p[2]), sc=(1.0, 1.3, 0.8), K=6, J=3), soft('#ee6a40' if (i // 2) % 2 else '#f0b070', 0.3), 'net', cloth=nuv)
    for x in (-1.0, -0.35, 0.3, 0.95): add(gloop([(x + 0.06 * math.cos(TAU * k / 6), 1.86, 0.06 * math.sin(TAU * k / 6)) for k in range(6)], 0.016, K=3, up=X), soft('#e0c890', 0.3), 'net')
    # glass floats hanging off the pole in rope cradles
    for k, (x, drop, r, c) in enumerate(((0.45, 0.22, 0.1, '#3fc0b0'), (0.7, 0.34, 0.09, '#5aa8e0'), (0.92, 0.2, 0.095, '#7ad890'), (-0.62, 0.26, 0.1, '#5aa8e0'), (-0.84, 0.18, 0.085, '#3fc0b0'))):
        cp = (x, 1.86 - drop - r, 0.16)
        add(gtube([(x, 1.86, 0.04), (x, cp[1] + r * 1.05, 0.16)], 0.014, K=3), soft('#e0c890', 0.3), 'floats')
        add(sph(r, cp, K=8, J=5), lambda p, n, c=c: mix(mul(c, 0.8), mix(c, '#f4fff8', 0.25), clamp(n.z * 0.6 + 0.35)), 'floats', glow=True, tint=0.6)
        rope_bag(gl(cp), r)
    # on the sand: buoys, cork floats, crates, a bucket, the coil
    for i, (x, z, y) in enumerate(((1.72, 0.42, 0.18), (2.04, 0.36, 0.18), (1.86, 0.06, 0.18), (1.88, 0.26, 0.48))):
        buoy((x, y, z), r=0.17, base='#e8503a' if i % 2 == 0 else '#fff6ea', band='#fff6ea' if i % 2 == 0 else '#e8503a')
    for i in range(5):
        add(cyl(0.085, 0.085, 0.18, (-1.82 + (i % 3) * 0.18, 0.085 + (i // 3) * 0.16, 0.52 + (i // 3) * 0.0), K=8, rz=PI / 2, bev=0.02), lambda p, n: mix('#b8864a', '#dcaa6a', clamp(n.z * 0.5 + 0.5)), 'corks')
    crate2((-1.9, 0, -0.3), s=0.38, wd='#6a9ac8', ry=0.3)
    crate2((-1.48, 0, -0.45), s=0.3, wd='#e2c9a0', ry=-0.2)
    bucket2((1.3, 0, -0.5))
    with at((0.2, 0, 0.78)):
        for k in range(4):
            rr = 0.24 - k * 0.035
            add(gloop([(rr * math.cos(TAU * i / 12), 0.034 + k * 0.05, rr * math.sin(TAU * i / 12)) for i in range(12)], 0.034, K=4), soft('#e0c890' if k % 2 else '#d0b880', 0.3), 'coil')
    starfish((-0.6, 0.0, 0.85), 0.12, 1.1, '#ff7a3a')
    return dict(w=w)

# ################################################################## arenaGate (tidepoolAssets.js arenaGate, seed 8)
# Kit: two weathered driftwood posts (x +-1.65, yawed +-0.06) on stone footings, 3.2 m with caps, sea-green and amber
# glass floats in rope nets on each post, a sagging shimenawa (w 3.2, y 2.82, sag 0.32) with shide; opening along z.
def build_arenaGate():
    new_asset('rg-tidepool-arenaGate')
    for sx in (-1, 1):
        with at((sx * 1.65, 0, 0), ry=sx * 0.06):
            boulder((0.0, 0.05, 0.0), (0.52, 0.32, 0.5), 60 + sx, moss=True, cover=0.55, K=11, J=6)
            rock((sx * 0.45, 0.0, 0.3), 0.18, sq=0.8, seed=62 + sx, col='#bdb4c4', tag='footing', K=7)
            add(cyl(0.16, 0.21, 3.45, (0, 3.45 / 2 - 0.1, 0), K=10, bev=0.03), drift_col(8 + sx), 'posts')
            # a gnarled stub of a branch, a cap, rope wraps
            add(gtube([(sx * 0.12, 2.0, 0.05), (sx * 0.35, 2.25, 0.08), (sx * 0.45, 2.45, 0.05)], lambda u: 0.06 * (1 - u * 0.6), K=6), drift_col(9 + sx), 'posts')
            add(glathe([(0.0, 0.0), (0.24, 0.0), (0.25, 0.05), (0.12, 0.2), (0.0, 0.26)], 9, pos=(0, 3.33, 0)), wood('#54494a'), 'posts')
            for y in (0.7, 1.1, 3.05):
                add(gloop([(0.19 * math.cos(TAU * k / 12), y, 0.19 * math.sin(TAU * k / 12)) for k in range(12)], 0.03, K=4), soft('#e0c890', 0.3), 'wraps')
            for dy, dz, c, r in ((2.25, 0.21, '#5fd8c0', 0.17), (1.85, 0.19, '#f0b860', 0.15)):
                cp = (sx * 0.02, dy, dz)
                add(sph(r, cp, K=9, J=6), lambda p, n, c=c: mix(mul(c, 0.8), mix(c, '#fffaf0', 0.3), clamp(n.z * 0.6 + 0.35)), 'floats', glow=True, tint=0.6)
                rope_bag(F.W(cp), r)
            for k, (y, a) in enumerate(((1.3, 0.4), (0.4, 2.2), (2.7, -1.0))):
                barnacle_cluster(F.W((math.cos(a) * 0.19, y, math.sin(a) * 0.19)), F.N((math.cos(a), 0.1, math.sin(a))), 1.0, 300 + k + sx * 10)
    # the shimenawa: two twisted strands sagging between the posts, lashed round them, five shide and draped kelp
    yR, sag, zR, Wr = 2.82, 0.32, 0.12, 3.3
    rp = lambda u: (-Wr / 2 + Wr * u, yR - sag * 4 * u * (1 - u), zR)
    twisted_rope(rp, 26, 0.06, tw=11.0, off=0.05, K=5)
    for sx in (-1, 1):
        add(gloop([(sx * 1.65 + 0.24 * math.cos(TAU * k / 12), yR + 0.03, 0.24 * math.sin(TAU * k / 12)) for k in range(12)], 0.05, K=5), lambda p, n: mix('#c8a868', '#f0dca4', clamp(n.z * 0.6 + 0.4)), 'rope')
        add(gtube([(sx * 1.45, yR - 0.02, zR + 0.04), (sx * 1.42, yR - 0.35, zR + 0.06), (sx * 1.44, yR - 0.62, zR + 0.04)], lambda u: 0.045 * (1 - u * 0.5), K=5), lambda p, n: mix('#c8a868', '#f0dca4', clamp(n.z * 0.6 + 0.4)), 'rope')
    for u in (0.2, 0.35, 0.5, 0.65, 0.8):
        c = rp(u); shide((c[0], c[1] - 0.07, zR + 0.07), s=1.3)
    for u, L in ((0.28, 0.5), (0.58, 0.7), (0.74, 0.4)):
        c = rp(u); kelp_strand([(c[0], c[1] + 0.05, zR - 0.05), (c[0] + 0.03, c[1] - 0.05, zR + 0.06), (c[0] + 0.06, c[1] - L, zR + 0.05)], 0.04, int(u * 10))
    return dict(rope=(yR, sag))

# ################################################################## weddedRocks (tidepoolAssets.js weddedRocks, seed 4)
# Kit: two sea stacks (a: x -2.1, 4.6 m, R 1.5; b: (2.0, 0.2), 3.2 m, R 1.15) with dune grass on their crowns, joined by a
# great shimenawa from (-1.05, 3.4, 0.05) to (1.05, 2.55, 0.25), sagging 0.55, five groups of shide. Placed at ground -0.2
# where the beach meets the sea. Ours: banded, ledged stacks with a wet barnacled foot, a sea-moss crown (icing), dune
# grass (reed, it sways) and sea pinks, the rope twisted and wrapped round both stacks, shide (cloth).
def stack_surf(cx, cz, H, R, seed):
    rng = random.Random(seed); ph = [rng.uniform(0, TAU) for _ in range(3)]
    def S(th, y):                                                        # y: 0..H up the stack (radius along th)
        t = y / H
        prof = 1.14 - 0.34 * t + 0.15 * math.sin(t * 7 + ph[0]) + 0.12 * max(0.0, 0.18 - t) / 0.18 - (0.0 if t < 0.9 else (t - 0.9) * 4.5)
        ledge = -0.15 * smooth(0.36, 0.1, abs(math.sin((y + math.cos(th - ph[2]) * 0.3) * 1.9)))
        k = max(0.12, prof * (1 + 0.1 * math.sin(2 * th + ph[1]) + 0.06 * math.sin(3 * th + seed) + ledge))
        return (cx + math.cos(th) * R * k, y, cz + math.sin(th) * R * k)
    return S

def sea_stack(cx, cz, H, R, seed, tag='stacks'):
    S = stack_surf(cx, cz, H, R, seed); K, NR = 18, 24
    rings, cs = [], []
    ys = [-0.5] + [H * (i / NR) for i in range(1, NR)] + [H * 0.97]
    for y in ys:
        ring = [gl(S(TAU * k / K, max(0.0, y)) if y >= 0 else vadd(S(TAU * k / K, 0.0), (0, y, 0))) for k in range(K)]
        rings.append(ring); cs.append(gl((cx, y, cz)))
    t = Tmp(); ring_surface(t, rings, cs, pole0=gl((cx, -0.5, cz)), pole1=gl((cx, H + 0.08, cz)))
    def col(p, n):
        y = p.z
        band = int(math.floor((y + 0.3 * vnoise(p, 1.0, seed)) * 2.6))
        c = ['#c8baa8', '#b4a698', '#d4c6b2', '#bcae9e', '#a89c94'][band % 5]
        c = mix(mul(c, 0.8), mix(c, '#f2e8d8', 0.32), clamp(n.z * 0.7 + 0.4))
        if abs(((y * 2.6) % 1.0)) < 0.1: c = mul(c, 0.86)
        if n.z > 0.5 and vnoise(p, 2.4, seed + 3) > 0.7: c = mix(c, '#e8b04a', 0.35)
        if y < 0.75:
            k = clamp((0.75 - y) / 0.6); c = mix(c, '#5e5a64', 0.72 * k)
            if 0.15 < y < 0.75 and vnoise(p, 8.0, seed + 5) > 0.62: c = mix(c, '#efe8da', 0.6 * k)
        if y > H * 0.55 and math.sin(math.atan2(p.y + cz, p.x - cx) * 5 + seed) > 0.85: c = mix(c, '#f6f2e8', 0.4 * clamp((y - H * 0.55) / (H * 0.4)))
        return c
    add(t, col, tag)
    # the crown: a sea-moss icing over the top
    def Fm(th, h):                                                       # h from the crown pole down the side
        y = H + 0.06 - h
        if y > H * 0.97: rr = (H + 0.08 - y) / 0.1 * 0.0 + (1 - (y - H * 0.97) / (H * 0.03 + 0.08)) * 1.0
        q = S(th, min(H * 0.97, max(0.0, y)))
        if y > H * 0.97:
            f = clamp((H + 0.08 - y) / (H * 0.03 + 0.08))
            q = (cx + (q[0] - cx) * f, y, cz + (q[2] - cz) * f)
        return gl(q)
    rng = random.Random(seed + 1)
    drips = [(TAU * k / 5 + rng.uniform(-0.3, 0.3), rng.uniform(0.25, 0.5), rng.uniform(0.22, 0.32)) for k in range(5)]
    he = drip_he(lambda th: 0.55 + 0.12 * math.sin(3 * th + seed), drips)
    add(drape(Fm, he, lambda th, s: 0.07 * (1 - 0.3 * s), drip_angles(18, drips, offs=(-0.7, 0.0, 0.7)), 4, gl((cx, H - 0.6, cz))), moss_col, 'crown')
    return S

def grass_tuft(pos, seed, n=8, h=0.6, tag='grass', mat='reed'):
    """dune grass (reed: the game sways it): long fountain blades, sun-bleached tips"""
    rng = random.Random(seed)
    for k in range(n):
        a = TAU * k / n + rng.uniform(-0.35, 0.35); lean = rng.uniform(0.3, 0.7); hh = h * rng.uniform(0.7, 1.15)
        b = vadd(pos, (math.cos(a) * 0.06, 0.0, math.sin(a) * 0.06))
        m = vadd(b, (math.cos(a) * hh * lean * 0.35, hh * 0.65, math.sin(a) * hh * lean * 0.35))
        tip = vadd(b, (math.cos(a) * hh * lean, hh * 0.95, math.sin(a) * hh * lean))
        add(gtube([b, m, tip], lambda u: 0.028 * (1 - u * 0.85), K=3), lambda p, nn, y0=pos[1]: mix('#6e8a48', '#ecdc9a', clamp((p.z - y0) / h)), tag, mat=mat)

def build_weddedRocks():
    new_asset('rg-tidepool-weddedRocks', mat='rock')
    Sa = sea_stack(-2.1, 0.0, 4.6, 1.5, 41)
    Sb = sea_stack(2.0, 0.2, 3.2, 1.15, 42)
    for (cx, cz, H, R, s) in ((-2.1, 0.0, 4.6, 1.5, 3), (2.0, 0.2, 3.2, 1.15, 5)):
        for k in range(3):
            a = 0.6 + k * 1.9 + s; d = R * 0.35
            grass_tuft((cx + math.cos(a) * d, H + 0.05, cz + math.sin(a) * d), s * 10 + k, n=6, h=0.55)
        tuft((cx + 0.2, H + 0.06, cz + 0.25), s + 50, flowers=True, n=0)
    for i, (x, z, r) in enumerate(((-0.5, 0.9, 0.42), (0.6, -0.6, 0.36), (-3.4, 0.9, 0.38), (3.1, 0.9, 0.3))):
        boulder((x, 0.0, z), (r, r * 0.7, r * 0.9), 140 + i, moss=False, K=9, J=5, tag='rocks')
    # the great rope: wrapped round each stack, then twisted across, sagging between them
    p0, p1 = (-1.05, 3.4, 0.05), (1.05, 2.55, 0.25)
    rp = lambda u: (p0[0] + (p1[0] - p0[0]) * u, p0[1] + (p1[1] - p0[1]) * u - math.sin(u * PI) * 0.55, p0[2] + (p1[2] - p0[2]) * u)
    twisted_rope(rp, 24, 0.065, tw=10.0, off=0.055, K=5, tag='rope')
    rcol = lambda p, n: mix('#c8a868', '#f0dca4', clamp(n.z * 0.6 + 0.4))
    for (S, y, cx, cz) in ((Sa, 3.4, -2.1, 0.0), (Sb, 2.55, 2.0, 0.2)):
        loop = []
        for k in range(16):
            th = TAU * k / 16; q = S(th, y)
            loop.append((cx + (q[0] - cx) * 1.06, y + 0.04 * math.sin(th * 2), cz + (q[2] - cz) * 1.06))
        add(gloop(loop, 0.085, K=6), rcol, 'rope', mat='body')
    for k in range(1, 6):
        u = k / 6; c = rp(u)
        for j in range(2):
            shide((c[0] + (j - 0.5) * 0.12, c[1] - 0.1, c[2] + 0.1), s=1.2 + 0.1 * j)
    return dict(tops=[(-2.1, 4.6, 0.0), (2.0, 3.2, 0.2)])

# ################################################################## grottoMouth (tidepoolAssets.js grottoMouth, seed 9)
# Kit: a ~16 m banded rock arch round a dark cave throat (open toward +z), flanking masses and a back mass; the throat
# glows teal (hot), stalactites hang from the soffit (body), plankton crystals glow at its floor (hot); lights at
# (0, 1.2, 0.6) and (-2.2, 0.6, 0.2). Ours: a lumpy arch (rock) with great moss-capped boulders piled round and over it
# (the toy-diorama falls look), the dark glowing throat and crystal clusters (hot), stalactites, grass tufts and sea pinks.
def build_grottoMouth():
    new_asset('rg-tidepool-grottoMouth', mat='rock')
    rng = random.Random(9)
    arch = [(-math.cos(PI * k / 18) * 3.6, math.sin(PI * k / 18) * 4.2 - 0.5, 0.0) for k in range(19)]
    arch = [(-3.7, -0.6, 0.0)] + arch[1:-1] + [(3.7, -0.6, 0.0)]
    add(lumpy_tube(arch, lambda u: 1.5 + 0.3 * math.sin(u * PI * 3 + 1) + (0.5 if (u < 0.1 or u > 0.9) else 0.0), 16, 9, amp=0.22, f=0.6), coast_rock_col(9, wet=0.35), 'arch')
    # the back mass and flanks: big rounded boulders (moss-capped tops), the throat closed behind
    BIG = [(0.0, 2.9, -5.1, 3.7, 2.9, 2.3, True), (-4.6, 0.7, -0.9, 1.75, 1.5, 1.6, True), (4.7, 0.6, -0.8, 1.7, 1.4, 1.6, True),
           (-6.2, 0.3, -1.6, 1.4, 1.1, 1.3, True), (6.3, 0.2, -1.7, 1.35, 1.0, 1.3, False), (-2.6, 4.2, -1.5, 1.55, 1.15, 1.4, True),
           (2.4, 4.3, -1.3, 1.5, 1.1, 1.4, True), (0.0, 5.0, -1.4, 1.4, 0.9, 1.3, True), (-3.6, 2.6, -3.4, 1.9, 1.6, 1.7, False),
           (3.8, 2.4, -3.2, 1.9, 1.6, 1.7, True), (-7.0, 0.0, 0.6, 0.9, 0.7, 0.85, False), (7.0, 0.0, 0.4, 0.95, 0.75, 0.85, True)]
    for i, (x, y, z, rx, ry, rz, moss) in enumerate(BIG):
        boulder((x, y, z), (rx, ry, rz), 200 + i * 5, moss=moss, cover=0.7 + 0.12 * (i % 3), K=12, J=7, tag='mass')
    # the throat: a dark dome inside the arch, glowing teal deep in (hot, tint 1)
    K, J = 16, 7; rings, cs = [], []
    def TP(th, ph, back):
        k = 1.07 if back else 1.0; dz = -0.25 if back else 0.0
        return gl((-math.cos(th) * 3.0 * k * math.sin(ph), -0.4 - (0.2 if back else 0.0) + math.sin(th) * 3.6 * k * math.sin(ph), -0.2 + dz - 3.2 * k * math.cos(ph)))
    for back in (False, True):
        for j in (range(1, J + 1) if not back else range(J, 0, -1)):
            ph = PI / 2 * j / J
            ring = [TP(PI * kk / K, ph, back) for kk in range(K + 1)]; rings.append(ring); cs.append(sum(ring, Vector()) / len(ring))
    tt = Tmp(); ring_surface(tt, rings, cs, pole0=TP(0, 0, False), pole1=TP(0, 0, True))
    def thc(p, n):
        q = B2G(p); d = clamp(math.hypot(q[0] / 3.0, (q[1] - 1.0) / 3.4))
        return mix(mix('#08202c', '#1a6a78', clamp(1 - d) * 0.85), '#040c14', clamp(-q[2] / 3.4) * 0.3)
    A.add(OB + '_hot', 'hot', tt, thc, 'throat', uv=lambda p: (0.0, 1.0))
    # stalactites from the soffit
    for k in range(11):
        t = 0.2 + 0.6 * k / 10 + rng.uniform(-0.03, 0.03); a = PI * t
        x, y = -math.cos(a) * 3.6 * 0.68, math.sin(a) * 4.2 * 0.68 - 0.45
        L = rng.uniform(0.45, 0.95); z = 0.25 + rng.uniform(-0.4, 0.4)
        add(glathe([(0.0, -L), (0.07, -L * 0.55), (0.13, -0.1), (0.15, 0.1), (0.0, 0.12)], 6, pos=(x, y, z)), lambda p, n: mix('#a89c94', '#e2d6ca', clamp(n.z * 0.5 + 0.45)), 'stalactites', mat='body')
    # plankton crystal clusters on the throat floor (hot: they glow their own colour)
    for k, (x, z) in enumerate(((-1.9, -0.6), (1.7, -0.9), (-0.6, -1.6), (2.4, 0.1), (-2.6, 0.2), (0.9, -2.0))):
        cc = ['#6ff4ff', '#8affd8', '#b8a0ff'][k % 3]
        for j in range(3):
            h = rng.uniform(0.25, 0.55); tx, tz = rng.uniform(-0.4, 0.4), rng.uniform(-0.4, 0.4)
            add(glathe([(0.0, 0.0), (0.08 + 0.03 * j, 0.0), (0.09 + 0.02 * j, h * 0.7), (0.0, h)], 5, pos=(x + j * 0.12 - 0.12, -0.05, z + (j % 2) * 0.1), rx=tz, rz=tx),
                lambda p, n, cc=cc: mix(cc, '#ffffff', clamp(n.z * 0.4)), 'crystals', mat='hot', flick=0.3, tint=1.0)
    # grass and sea pinks on the boulder crowns
    for k, (x, y, z) in enumerate(((0.0, 5.85, -1.3), (-2.6, 5.25, -1.4), (2.4, 5.35, -1.2), (-4.5, 2.15, -0.8), (4.8, 1.95, -0.7))):
        grass_tuft((x, y, z), 70 + k, n=6, h=0.6, mat='body')
        if k % 2 == 0: tuft((x + 0.3, y - 0.05, z + 0.3), 80 + k, flowers=True, n=0)
    return dict(lights=[(0, 1.2, 0.6), (-2.2, 0.6, 0.2)])

PIECES = {'wreck': (build_wreck, 3, 0.03), 'seaTorii': (build_seaTorii, 2, 0.015), 'shoreLamp': (build_shoreLamp, 1, 0.02),
          'giantClam': (build_giantClam, 1, 0.02), 'lookout': (build_lookout, 6, 0.02), 'netRack': (build_netRack, 5, 0.02),
          'arenaGate': (build_arenaGate, 8, 0.015), 'weddedRocks': (build_weddedRocks, 4, 0.0), 'grottoMouth': (build_grottoMouth, 9, 0.0)}
def run():
    names = list(PIECES) if PIECE == 'all' else PIECE.split(',')
    for name in names:
        fn, seed, amt = PIECES[name]
        info = fn()
        finish_rg(A, seed, amt)
        print('RG %s info %s' % (name, info))
        export_rg(A, 'rg-tidepool-' + name)

run()
