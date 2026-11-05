# PAWHAVEN: the housing catalog's small pieces (task furn-small): wall pieces and tabletop things, built in Blender by script.
#   blender --background --factory-startup --python build_furn-small.py -- --piece <id|all>
# writes D:/projects/chewy-life-3d/public/models/furn-<id>.glb (and furn-<id>.blend beside this script).
# Deterministic: seeded maths only; a re-run reproduces every GLB exactly.
# Frame (src/home/furnitureMesh.js): 1 unit = 1 m. The layout code is written in the kit's game frame (x right, y up,
# z = the item's front) and mapped to Blender (x, -z, y). Wall items: the back flat on the wall plane (game z = 0 =
# Blender y = 0), the front toward game +z (Blender -Y), the bottom centre at the origin. Table items: z = 0 at the base,
# centred on the footprint.
# Technique and the core kit come from the Hollow landmarks / Guild (tools/blender/codex/assets/landmarks-hollow): a mesh
# accumulator with painted per-vertex colours (attribute `Col`), rounded boxes, lathes, tubes, puffy relief slabs; plus
# faceted shells here (per-face colours over smooth normals: gingham, painted plate rims, pine-cone scales).
# Materials by name choose the game's bucket: body, leaf, cloth, glow, water.
import bpy, bmesh, math, os, sys
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..', '..'))
MODELS = os.path.join(REPO, 'public', 'models')
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
PIECE = argv[argv.index('--piece') + 1] if '--piece' in argv else 'all'
print('FS build pid', os.getpid())
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
    """cloth uv: the game needs glTF uv.y = 1 at the hung top (game y = yt) and 0 at the free bottom (yb); the glTF
    exporter flips v (v_gltf = 1 - v_blender), so Blender's v is 0 at the top and 1 at the bottom; u = x"""
    return lambda p: (p.x * 2.0, 1.0 - clamp((p.z - yb) / (yt - yb)))

def angle_k(cen, K, th0):
    """the lathe step index of a face centroid (local frame)"""
    th = math.atan2(cen.y, cen.x)
    return int(math.floor(((th - th0) / (TAU / K)) % K + 1e-6)) % K

# ================================================================== Little Wall Shelf (wall, 1 x 0.5, h 0.4)
def jam_jar(pos, jam, lid, fruit, s=1.0, ry=0.0):
    r, h = 0.047, 0.09
    with at(pos, ry=ry, s=s):
        K = 9; th0 = PI / K
        prof = [(0.0, 0.0), (r * 0.94, 0.0), (r * 1.03, 0.026), (r * 1.04, 0.062), (r * 0.9, 0.08), (r * 0.8, h), (0.0, h)]
        def jc(cen, fn):
            k = angle_k(cen, K, th0); zc = cen.z
            if 0.026 < zc < 0.062: return '#fff1da'                       # the paper label band
            c = mix(jam, '#2a1a20', 0.16) if zc < 0.026 else jam
            if k in (5,) and zc > 0.01: c = mix(c, '#fff4f0', 0.5)       # the glass glint (front-left)
            if zc > 0.075: c = mix(jam, '#fff0f0', 0.25)                   # the shoulder glass
            return c
        t = facet(lathe(prof, K, th0=th0), jc); t.xform(F.m @ lm((0, 0, 0)))
        add(t, fsh(0.16, 0.28, sheen=0.35), 'jars')
        # the gingham cloth cover, a ribbon band and a frilled hem
        K2 = 10; t0 = PI / K2
        lp = [(r * 0.78, h - 0.004), (r * 1.24, h - 0.02), (r * 1.15, h - 0.003), (r * 1.05, h + 0.006), (r * 0.66, h + 0.026), (0.0, h + 0.032)]
        def lrf(rr, z, th): return rr * (1 + 0.075 * math.cos(5 * th + 0.4)) if z < h - 0.01 else rr
        light = mix(lid, '#fff8f0', 0.78); mid = mix(lid, '#fff8f0', 0.38)
        def lc(cen, fn):
            k = angle_k(cen, K2, t0); zc = cen.z; rr = math.hypot(cen.x, cen.y)
            if zc < h - 0.009 and rr < r * 1.05: return mul(lid, 0.7)         # the underside
            if h - 0.003 < zc < h + 0.007 and rr > r * 0.98: return '#fff4ea'   # the ribbon band
            j = 0 if zc < h else (1 if rr > r * 0.5 else 2)
            tone = (k % 2) + (j % 2)
            return (light, mid, lid)[tone]
        t = facet(lathe(lp, K2, th0=t0, rfn=lrf), lc, open_=True); t.xform(F.m @ lm((0, 0, 0)))
        add(t, fsh(0.18, 0.3), 'lids')
        # the fruit on the label
        fz = r * 1.06 + 0.004
        if fruit == 'strawberry':
            add(sph(0.0125, (0, 0.042, fz), sc=(1, 1.15, 0.6), K=6, J=3), soft('#e8404a', 0.3), 'fruit')
            add(sph(0.008, (0, 0.056, fz + 0.001), sc=(1.4, 0.5, 0.5), K=5, J=2), soft('#5aa84a'), 'fruit')
        elif fruit == 'orange':
            add(sph(0.013, (0, 0.043, fz), sc=(1, 1, 0.6), K=6, J=3), soft('#f49a30', 0.3), 'fruit')
            add(leafb(0.012, 0.008, (0.004, 0.058, fz + 0.002), rz=-0.8, T=0.003), soft('#5aa84a'), 'fruit')
        else:
            for dx, dy in ((-0.0075, 0.038), (0.0075, 0.04), (0.0, 0.051)):
                add(sph(0.0075, (dx, dy, fz), sc=(1, 1, 0.65), K=5, J=2), soft('#6a5ac8', 0.35), 'fruit')

def trailing_plant(pos):
    with at(pos):
        K = 10; th0 = PI / K
        prof = [(0.0, 0.0), (0.044, 0.0), (0.056, 0.056), (0.064, 0.062), (0.06, 0.076), (0.05, 0.072), (0.0, 0.068)]
        def pc(cen, fn):
            zc = cen.z; rr = math.hypot(cen.x, cen.y)
            if zc > 0.066 and rr < 0.05: return '#6a4a3a'          # the soil
            if zc > 0.056: return MINT                                # the rim
            k = angle_k(cen, K, th0)
            return '#fff1e0' if zc > 0.012 else '#f0dcc4'
        t = facet(lathe(prof, K, th0=th0), pc); t.xform(F.m @ lm((0, 0, 0)))
        add(t, fsh(0.16, 0.3, sheen=0.25), 'pot')
        for dx, dy in ((-0.018, 0.03), (0.02, 0.022), (0.0, 0.045)):
            add(sph(0.0065, (dx, dy, 0.06), sc=(1, 1, 0.6), K=4, J=2), soft(MINT), 'pot')
        # the crown: leaves rising and spilling from the soil
        for i in range(7):
            a = -1.35 + i * 0.45 + 0.06 * math.sin(i * 2.3)
            L = 0.056 + 0.008 * ((i * 5) % 3)
            d = Vector((math.sin(a), math.cos(a), 0.3 + 0.25 * (i % 2)))
            p = Vector((0, 0.066, 0.004 * (i % 3))) + d * (L * 0.45)
            add(leafb(L, L * 0.82, tuple(p), rz=-a, rx=0.45 + 0.25 * (i % 2), T=0.0065), paint(LEAVES[i % 5], top=0.22, bot=0.3), 'crown', 'leaf')
    # three vines over the shelf's front edge (shelf-local positions)
    x0, y0, z0 = pos
    vines = [((-0.02, 0.06), [(-0.02, 0.07, 0.03), (-0.035, 0.085, 0.075), (-0.05, 0.06, 0.12), (-0.055, 0.0, 0.128), (-0.06, -0.09, 0.124), (-0.07, -0.19, 0.12), (-0.075, -0.25, 0.118)]),
             ((0.015, 0.11), [(0.015, 0.07, 0.035), (0.02, 0.09, 0.08), (0.025, 0.055, 0.125), (0.03, -0.01, 0.13), (0.03, -0.08, 0.127), (0.035, -0.14, 0.124)]),
             ((0.045, 0.08), [(0.04, 0.07, 0.02), (0.06, 0.082, 0.06), (0.075, 0.05, 0.11), (0.08, -0.01, 0.118), (0.085, -0.07, 0.115), (0.09, -0.105, 0.112)])]
    for vi, (_, pts) in enumerate(vines):
        P = catmull([(x0 + x, y0 + y, z0 + z) for x, y, z in pts], 8)
        add(gtube(P, lambda s: 0.0058 - 0.0012 * s, K=3), soft('#4f8a3a', 0.2), 'vines', 'leaf')
        nl = 5 if vi < 2 else 4
        for j in range(nl):
            u = 0.22 + 0.78 * j / (nl - 1)
            q = Vector(catmull([(x0 + x, y0 + y, z0 + z) for x, y, z in pts], 41)[int(u * 40)])
            side = 1 if (j + vi) % 2 else -1
            L = 0.05 - 0.008 * (j / nl)
            off = Vector((side * 0.008, 0.0, 0.007))
            add(leafb(L, L * 0.85, tuple(q + off), rz=side * (PI * 0.5 + 0.35), rx=-0.2), paint(LEAVES[(j + vi) % 5], top=0.22, bot=0.3), 'vineleaf', 'leaf')

def build_wallShelf():
    new_asset()
    sy = 0.24
    add(rb(0.92, 0.05, 0.19, (0, sy + 0.025, 0.095), r=0.016), wood(WOOD, seed=1), 'board')
    # the scrolled brackets (side profile u = depth, v = height below the board)
    br = [(0.004, 0.0), (0.165, 0.0), (0.158, -0.026), (0.122, -0.045), (0.082, -0.062), (0.052, -0.09), (0.038, -0.125), (0.034, -0.158), (0.004, -0.158)]
    for sx in (-1, 1):
        with at((sx * 0.31, sy, 0.0), ry=PI / 2):
            add(puffy([(-u, v) for u, v in br], 0.032, bev=0.009, z0=-0.016), wood(WOOD_R, seed=2), 'brackets')
        add(sph(0.017, (sx * 0.31, sy - 0.16, 0.034), K=6, J=2), wood(WOOD_R), 'brackets')
    top = sy + 0.05
    jam_jar((-0.33, top, 0.092), '#d8303e', '#e8404a', 'strawberry', 1.2, 0.0)
    jam_jar((-0.17, top, 0.088), '#f08a28', '#5fb05a', 'orange', 1.06, 0.35)
    jam_jar((-0.005, top, 0.094), '#6a4aa8', '#5a8ad8', 'plum', 1.24, -0.3)
    trailing_plant((0.255, top, 0.085))

# ================================================================== Plate Rack (wall, 1 x 0.5, h 0.42)
def side_slab(x, ys, ds, thick, c=0.008):
    """a side board: a vertical sweep of a chamfered rectangle whose depth follows the profile ds(y)"""
    t = Tmp(); rings, cs = [], []
    h = thick / 2
    for y, d in zip(ys, ds):
        q = [(x - h, 0.0), (x + h, 0.0), (x + h, d - c), (x + h - c, d), (x - h + c, d), (x - h, d - c)]
        rings.append([F.W((a, y, b)) for a, b in q]); cs.append(F.W((x, y, d * 0.5)))
    ring_surface(t, rings, cs, pole0=cs[0], pole1=cs[-1])
    return t

def plate(pos, rim, emblem, ec):
    with at(pos, rx=-0.22):
        K = 12; th0 = PI / K
        prof = [(0.0, 0.0), (0.05, 0.0), (0.09, 0.012), (0.1, 0.02), (0.066, 0.015), (0.0, 0.013)]
        rim_l = mix(rim, '#fff8f0', 0.55)
        def pcol(cen, fn):
            rr = math.hypot(cen.x, cen.y); zc = cen.z
            if zc < 0.011 and fn.z < 0.2: return '#efe0cc'          # the back
            if rr > 0.09: return mul(rim, 0.92)                       # the edge
            if rr > 0.07: return rim if angle_k(cen, K, th0) % 2 else rim_l   # the painted rim, alternating
            return '#fff6ea'                                          # the well
        t = facet(lathe(prof, K, th0=th0), pcol); t.xform(F.m @ lm((0, 0, 0), rx=PI / 2))
        add(t, fsh(0.12, 0.22, sheen=0.4), 'plates')
        z0 = 0.0125
        if emblem == 'heart':
            with at((0, 0.002, 0)): add(puffy(heart_poly(0.085, n=3), 0.008, bev=0.004, z0=z0), lac(ec), 'emblems')
        elif emblem == 'flower':
            for k in range(5):
                a = PI / 2 + k * TAU / 5
                add(sph(0.0155, (math.cos(a) * 0.019, math.sin(a) * 0.019, z0 + 0.002), sc=(0.78, 1.0, 0.32), K=5, J=2, rz=a - PI / 2), lac(ec), 'emblems')
            add(sph(0.011, (0, 0, z0 + 0.004), sc=(1, 1, 0.4), K=5, J=2), lac('#ffd24a'), 'emblems')
        elif emblem == 'fish':
            add(sph(0.022, (0.006, 0, z0 + 0.002), sc=(1.35, 0.78, 0.3), K=7, J=2), lac(ec), 'emblems')
            add(puffy([(-0.016, 0.0), (-0.036, 0.016), (-0.032, 0.0), (-0.036, -0.016)], 0.006, bev=0.003, z0=z0, centre=(-0.03, 0.0)), lac(ec), 'emblems')
            add(sph(0.004, (0.02, 0.004, z0 + 0.008), K=4, J=2), flat(INK), 'emblems')
        else:  # paw
            add(sph(0.017, (0, -0.008, z0 + 0.002), sc=(1.1, 0.9, 0.32), K=7, J=2), lac(ec), 'emblems')
            for k in range(3):
                a = PI / 2 + (k - 1) * 0.62
                add(sph(0.0085, (math.cos(a) * 0.028, -0.006 + math.sin(a) * 0.028, z0 + 0.002), sc=(1, 1.1, 0.35), K=6, J=2), lac(ec), 'emblems')

def mug(x, c):
    y0, z = 0.07, 0.112
    with at((x, y0, z)):
        K = 8; th0 = PI / K
        prof = [(0.0, 0.0), (0.032, 0.0), (0.036, 0.07), (0.031, 0.074), (0.029, 0.062), (0.0, 0.062)]
        def mc(cen, fn):
            rr = math.hypot(cen.x, cen.y)
            if cen.z > 0.06 and (rr < 0.031 or fn.z > 0.5 and rr < 0.03): return mul(c, 0.62)   # inside
            if cen.z > 0.07: return mix(c, '#fff8f0', 0.35)                                       # the lip
            return c
        t = facet(lathe(prof, K, th0=th0), mc); t.xform(F.m @ lm((0, 0, 0)))
        add(t, fsh(0.14, 0.26, sheen=0.35), 'mugs')
        hp = [(0.03, 0.058, 0), (0.05, 0.056, 0), (0.058, 0.036, 0), (0.05, 0.016, 0), (0.03, 0.014, 0)]
        add(gtube(hp, 0.0064, K=4, caps=False), soft(c, 0.2), 'mugs')
        add(sph(0.0095, (-0.004, 0.034, 0.034), sc=(1, 1, 0.4), K=5, J=2), soft('#fffaf2', 0.1), 'mugs')
    # the brass hook: down from the shelf behind the handle, then forward through its loop, the tip turned up
    hx = x + 0.047
    add(gtube([(hx, 0.19, 0.084), (hx, 0.122, 0.086), (hx, 0.1, 0.104), (hx, 0.101, 0.13), (hx, 0.118, 0.142)], 0.0052, K=4, caps=False), lac(BRASS), 'hooks')

def build_plateRack():
    new_asset()
    ys = [0.0, 0.03, 0.2, 0.232, 0.27, 0.33, 0.4, 0.445]
    ds = [0.155, 0.168, 0.168, 0.14, 0.1, 0.087, 0.098, 0.104]
    for sx in (-1, 1): add(side_slab(sx * 0.462, ys, ds, 0.026), wood(WOOD_R, seed=3), 'sides')
    add(rb(1.0, 0.04, 0.124, (0, 0.462, 0.062), r=0.014), wood(WOOD, seed=4), 'cornice')
    add(rb(0.9, 0.23, 0.016, (0, 0.332, 0.008), r=0.006), paint('#fff4e4', top=0.05, bot=0.1, ao_z=0.22, ao_k=0.18, ao_h=0.06), 'back')
    add(rb(0.93, 0.032, 0.17, (0, 0.205, 0.085), r=0.012), wood(WOOD, seed=5), 'shelf')
    add(gtube([(-0.452, 0.302, 0.112), (0.452, 0.302, 0.112)], 0.0095, K=6, caps=False), wood(WOOD_R), 'rail')
    plates = [('#6a9ad8', 'heart', '#ff7a9a'), ('#ff9eb0', 'flower', '#ff6f8f'), ('#7cc0a0', 'fish', '#5a98d8'), ('#f4c04a', 'paw', '#e8606a')]
    for i, (rim, em, ec) in enumerate(plates):
        plate((-0.33 + i * 0.22, 0.33, 0.05), rim, em, ec)
    for i, c in enumerate(['#ff9eb0', '#8fd0ff', '#ffe08a', '#a8e8cc']):
        mug(-0.345 + i * 0.22, c)

# ================================================================== Cuckoo Clock (wall, 0.5 x 1, h 0.9)
def cone_scales(prof, K, amp=0.2):
    """a pine cone: rings (r, z, tier) bottom -> top; a tier >= 0 ring is a row of scale tips whose alternate
    vertices stick out, shifted one step per tier, so the rows interlock; tier -1 rings are the waists between"""
    t = Tmp(); rings, cs = [], []
    body = list(prof); p0 = Vector((0, 0, body[0][1])); p1 = Vector((0, 0, body[-1][1])); body = body[1:-1]
    for r, z, tier in body:
        ring = []
        for k in range(K):
            th = TAU * k / K
            rr = r * ((1 + amp) if (k + tier) % 2 == 0 else (1 - amp * 0.6)) if tier >= 0 else r
            zz = z - (0.006 if tier >= 0 and (k + tier) % 2 == 0 else 0.0)      # (the tips droop)
            ring.append(Vector((rr * math.cos(th), rr * math.sin(th), zz)))
        rings.append(ring); cs.append(Vector((0, 0, z)))
    ring_surface(t, rings, cs, p0, p1)
    return t

def pine_cone(pos):
    with at(pos):
        K = 8
        prof = [(0.0, 0.0, -1), (0.016, 0.014, 0), (0.017, 0.024, -1), (0.031, 0.044, 1), (0.02, 0.056, -1), (0.033, 0.078, 0), (0.02, 0.09, -1), (0.026, 0.108, 1), (0.0, 0.128, -1)]
        def cc(cen, fn):
            if cen.z > 0.112: return '#7a4e30'
            rr = math.hypot(cen.x, cen.y)
            if fn.z < -0.05: return mix('#c8925a', '#a8743e', clamp((0.03 - rr) * 60))   # the scale tips (lit undersides)
            return mix('#6a4430', '#8a5a3a', clamp((rr - 0.016) * 60))                    # the shadowed tops
        t = facet(cone_scales(prof, K), cc); t.xform(F.m @ lm((0, 0, 0)))
        add(t, fsh(0.18, 0.3), 'cones')
        add(glathe([(0.0, 0.0), (0.02, 0.0), (0.021, 0.014), (0.0, 0.016)], K=6, pos=(0, 0.122, 0)), lac(GOLD), 'cones')

def build_cuckooClock():
    new_asset()
    base, eave, apex, D = 0.52, 0.835, 0.968, 0.135
    house = [(-0.152, base), (0.152, base), (0.165, base + 0.014), (0.165, eave), (0.012, apex), (-0.012, apex), (-0.165, eave), (-0.165, base + 0.014)]
    hw = wood(HONEY, ao_z=base, ao_k=0.12, seed=6)
    add(puffy(house, D, bev=0.014, z0=0.0), lambda p, n: mix(hw(p, n), mul(HONEY, 0.78), clamp(1 - (-n.y)) * 0.8), 'house')
    add(rb(0.35, 0.026, 0.152, (0, base + 0.006, 0.076), r=0.01), wood('#9a6038'), 'house')
    # the roof: two shingle courses a side, chocolate, with a scalloped icing trim on the front edge
    a = math.atan2(apex - eave, 0.165); dv = Vector((math.cos(a), -math.sin(a))); nv = Vector((math.sin(a), math.cos(a)))
    ap = Vector((0.0, apex + 0.004))
    for sx in (-1, 1):
        for (s0, s1, off, th, c) in ((-0.02, 0.155, 0.008, 0.034, '#94583a'), (0.135, 0.285, 0.0, 0.036, '#a0643c')):
            cen = ap + dv * ((s0 + s1) / 2) + nv * (th / 2 + off)
            add(rb(s1 - s0, th, 0.19, (sx * cen.x, cen.y, 0.095), r=0.012, rz=-sx * a), wood(c, seed=7), 'roof')
        # the lace bargeboard: a cream scalloped trim hanging just under the roof's front edge
        L = 0.27; nb = 4; pts_bot = []
        for i in range(nb * 2 + 1):
            u = 0.0 + L * i / (nb * 2)
            dip = 0.008 if i % 2 == 0 else 0.026 + 0.003 * math.sin(i * 1.7)
            p = ap + dv * u + nv * (-dip)
            pts_bot.append((sx * p.x, p.y))
        pts_top = [(sx * q.x, q.y) for q in (ap + dv * L + nv * 0.012, ap + dv * 0.0 + nv * 0.012)]
        poly = pts_bot + pts_top
        if sx < 0: poly = poly[::-1]
        add(puffy(poly, 0.02, bev=0.007, z0=0.164), paint('#fff1de', top=0.12, bot=0.3), 'icing')
    add(sph(0.02, (0, apex + 0.05, 0.1), K=6, J=3), lac('#ff8fb0'), 'finial')
    # the cuckoo's arched door and the bird peeking out
    arch = [(-0.036, 0.0), (0.036, 0.0), (0.036, 0.04)] + [(0.036 * math.cos(t), 0.04 + 0.036 * math.sin(t)) for t in (0.5, 1.05, PI / 2 + 0.53, PI - 0.5)] + [(-0.036, 0.04)]
    with at((0, 0.842, D)):
        def door(p, n):
            q = F.m.inverted() @ p
            return '#4a3226'
        add(puffy(arch, 0.01, bev=0.006, z0=-0.002), lambda p, n: mix('#3a2622', '#7a5238', clamp((abs(n.y) < 0.95) * 1.0)), 'door')
    add(sph(0.023, (0, 0.876, D + 0.024), K=7, J=4), soft('#ffd24a', 0.25), 'bird')
    add(glathe([(0.009, 0.0), (0.0, 0.02)], K=5, pos=(0, 0.872, D + 0.044), rx=PI / 2), soft('#ff8a3a'), 'bird')
    for sx in (-1, 1): add(sph(0.0055, (sx * 0.0095, 0.882, D + 0.043), K=4, J=2), flat(INK), 'bird')
    add(sph(0.008, (0.0, 0.9, D + 0.02), sc=(0.6, 1.0, 0.8), K=4, J=2, rz=0.4), soft('#ff8a3a'), 'bird')
    # the clock face: a gold bezel round a cream dial, 12 pips and two hands at ten past ten
    K = 14; th0 = PI / K; cy = 0.70
    prof = [(0.0, 0.0), (0.102, 0.0), (0.106, 0.012), (0.098, 0.022), (0.084, 0.016), (0.0, 0.014)]
    def fc(cen, fn):
        rr = math.hypot(cen.x, cen.y)
        if rr < 0.084 and cen.z > 0.01: return '#fff8ec'
        return GOLD if cen.z > 0.008 else mul(GOLD, 0.8)
    t = facet(lathe(prof, K, th0=th0), fc); t.xform(F.m @ lm((0, cy, D - 0.008), rx=PI / 2))
    add(t, fsh(0.14, 0.26, sheen=0.4), 'clock')
    for k in range(12):
        a2 = k / 12 * TAU; big = k % 3 == 0
        add(sph(0.0085 if big else 0.0055, (math.sin(a2) * 0.067, cy + math.cos(a2) * 0.067, D + 0.009), sc=(1, 1, 0.45), K=5 if big else 4, J=2), flat(INK if big else '#7a5a50'), 'clock')
    hour = [(-0.0075, -0.008), (0.0075, -0.008), (0.006, 0.026), (0.0135, 0.033), (0.0, 0.049), (-0.0135, 0.033), (-0.006, 0.026)]
    minute = [(-0.0055, -0.01), (0.0055, -0.01), (0.0045, 0.054), (0.0, 0.068), (-0.0045, 0.054)]
    with at((0, cy, D + 0.007), rz=1.0): add(puffy(hour, 0.006, bev=0.003, centre=(0.0, 0.02)), soft(INK, 0.3), 'clock')
    with at((0, cy, D + 0.011), rz=-1.05): add(puffy(minute, 0.005, bev=0.0025, centre=(0.0, 0.02)), soft(INK, 0.3), 'clock')
    add(sph(0.009, (0, cy, D + 0.018), sc=(1, 1, 0.6), K=5, J=2), lac(GOLD), 'clock')
    # carved leaves curling out from the dial's upper shoulders (darker wood, in relief)
    for sx in (-1, 1):
        for (ang, L, dz) in ((0.68, 0.064, 0.0), (1.18, 0.056, 0.002)):
            a2 = sx * ang
            px, py = math.sin(a2) * 0.128, cy + math.cos(a2) * 0.128
            add(leafb(L, L * 0.58, (px, py, D + 0.004 + dz), rz=sx * (PI / 2 - ang + 0.25), T=0.0065), wood('#a86e42', hi='#d8a070'), 'carving')
    # the flower box under the face
    add(rb(0.22, 0.034, 0.05, (0, 0.566, D + 0.022), r=0.01), lac('#e8503a'), 'flowers')
    for i in range(5):
        x = -0.08 + i * 0.04; pc = ('#ff6f8f', '#fff6ea', '#ff9ec0', '#fff6ea', '#ff6f8f')[i]
        add(sph(0.0165, (x, 0.594 + 0.004 * (i % 2), D + 0.036), sc=(1, 0.5, 1), K=5, J=2, rx=PI / 2), lambda p, n, pc=pc: mix(pc, '#ffd24a', clamp((-n.y - 0.75) * 4)), 'flowers')
    for i in range(4):
        x = -0.06 + i * 0.04
        add(leafb(0.02, 0.011, (x, 0.588, D + 0.032), rz=(0.9 if i % 2 else -0.9), heart=False), paint(LEAVES[i], top=0.2, bot=0.3), 'flowers', 'leaf')
    # pendulum (heart bob) and two pine-cone weights on beaded chains
    add(rbox((0.012, 0.008, 0.21), r=0.0, M=F.m @ lm((0, 0.425, 0.06))), lac(BRASS), 'pendulum')
    t = glathe([(0.0, 0.0), (0.042, 0.0), (0.045, 0.006), (0.042, 0.012), (0.0, 0.012)], K=9, pos=(0, 0.32, 0.058), rx=PI / 2)
    add(t, lac(GOLD), 'pendulum')
    with at((0, 0.316, 0.07)): add(puffy(heart_poly(0.052, n=2), 0.006, bev=0.003), lac('#ff7a9a'), 'pendulum')
    for sx in (-1, 1):
        x = sx * 0.078
        add(gtube([(x, base + 0.01, 0.06), (x, 0.21, 0.06)], 0.0042, K=4, caps=False), lac('#c8b078'), 'chains')
        for j in range(3): add(sph(0.0078, (x, 0.27 + j * 0.085, 0.06), K=4, J=2), lac(BRASS), 'chains')
        pine_cone((x, 0.075, 0.06))

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

# ================================================================== Pack Photo (wall, 0.5 x 0.5, h 0.42)
def build_packPhoto():
    new_asset()
    # the wobbly crayon frame: four chunky sticks crossing at the corners, each a different colour, with pin heads
    add(rb(0.45, 0.042, 0.026, (0.0, 0.448, 0.022), r=0.012, rz=0.035), lac('#ffa8bc'), 'frame')
    add(rb(0.45, 0.042, 0.026, (0.006, 0.084, 0.022), r=0.012, rz=-0.03), lac('#a8e8c8'), 'frame')
    add(rb(0.038, 0.43, 0.026, (-0.188, 0.266, 0.014), r=0.012, rz=0.025), lac('#ffe08a'), 'frame')
    add(rb(0.038, 0.43, 0.026, (0.192, 0.262, 0.014), r=0.012, rz=-0.035), lac('#a8d4ff'), 'frame')
    for (x, y) in ((-0.17, 0.442), (0.17, 0.454), (-0.165, 0.09), (0.175, 0.079)):
        add(dot(0.0095, (x, y, 0.037), sc=(1, 1, 0.6), K=6), lac('#ff7a9a'), 'frame')
    add(gtube([(-0.15, 0.452, 0.03), (-0.07, 0.478, 0.03), (0.0, 0.495, 0.03), (0.07, 0.478, 0.03), (0.15, 0.458, 0.03)], 0.0034, K=3), soft('#c8a068'), 'string')
    add(sph(0.012, (0.0, 0.497, 0.03), K=6, J=3), lac(GOLD), 'string')
    # the paper
    add(rb(0.33, 0.33, 0.008, (0.0, 0.265, 0.009), r=0.003), paint('#fffaf0', top=0.04, bot=0.06), 'paper')
    z0 = 0.0125
    with at((0.0, 0.265, 0.0)):
        grass = [(-0.158, -0.155), (0.158, -0.155), (0.158, -0.09)] + [(0.158 - 0.316 * i / 8, -0.095 + 0.012 * math.sin(i * 1.9)) for i in range(1, 8)] + [(-0.158, -0.092)]
        add(puffy(grass, 0.003, bev=0.0015, z0=z0, centre=(0.0, -0.125)), flat('#8fd06a'), 'drawing')
        add(puffy([(0.105 + x, 0.095 + y) for x, y in circ_ol(10, 0.03)], 0.004, bev=0.002, z0=z0), flat('#ffd24a'), 'drawing')
        for k in range(7):
            a = k / 7 * TAU + 0.2
            add(rbox((0.008, 0.004, 0.022), r=0.0, M=F.m @ lm((0.105 + math.cos(a) * 0.048, 0.095 + math.sin(a) * 0.048, z0 + 0.002), rz=a - PI / 2)), flat('#ffc04a'), 'drawing')
        add(puffy(heart_poly(0.055, oy=0.09, n=2), 0.004, bev=0.002, z0=z0), flat('#ff7aa0'), 'drawing')
        # Chewy: a chocolate pup with floppy ears, a cream muzzle and a red scarf
        cx = -0.068
        for lx in (-0.03, -0.012, 0.012, 0.03): add(dot(0.011, (cx + lx, -0.09, z0 + 0.002), sc=(0.8, 1.3, 0.35), K=6), flat('#6a3a20'), 'chewy')
        add(sph(0.05, (cx, -0.055, z0 + 0.003), sc=(1.0, 0.62, 0.22), K=8, J=3), soft('#7a4426', 0.1), 'chewy')
        add(sph(0.035, (cx, 0.012, z0 + 0.007), sc=(1.0, 0.92, 0.3), K=8, J=3), soft('#8a5030', 0.1), 'chewy')
        for sx in (-1, 1): add(dot(0.022, (cx + sx * 0.034, 0.0, z0 + 0.006), sc=(0.55, 1.1, 0.3), K=6, rz=sx * 0.35), flat('#4e2a18'), 'chewy')
        add(dot(0.016, (cx, -0.006, z0 + 0.016), sc=(1.2, 0.8, 0.35), K=6), flat('#f0c890'), 'chewy')
        add(sph(0.006, (cx, 0.0, z0 + 0.022), K=4, J=2), flat(INK), 'chewy')
        for sx in (-1, 1): add(sph(0.0055, (cx + sx * 0.013, 0.02, z0 + 0.017), K=4, J=2), flat(INK), 'chewy')
        add(dot(0.03, (cx, -0.027, z0 + 0.01), sc=(1.2, 0.33, 0.3), K=6), flat('#e8404a'), 'chewy')
        # Shadow: a black pup with a white blaze and chest, pointy ears
        cx = 0.068
        for lx in (-0.028, -0.01, 0.012, 0.03): add(dot(0.011, (cx + lx, -0.09, z0 + 0.002), sc=(0.8, 1.3, 0.35), K=6), flat('#2a2230'), 'shadow')
        add(sph(0.048, (cx, -0.055, z0 + 0.003), sc=(1.0, 0.62, 0.22), K=8, J=3), soft('#3a3240', 0.1), 'shadow')
        add(dot(0.018, (cx, -0.05, z0 + 0.008), sc=(0.8, 1.1, 0.3), K=6), flat('#fff6ea'), 'shadow')
        add(sph(0.034, (cx, 0.012, z0 + 0.007), sc=(1.0, 0.92, 0.3), K=8, J=3), soft('#3a3240', 0.1), 'shadow')
        for sx in (-1, 1):
            add(puffy([(cx + sx * 0.012, 0.03), (cx + sx * 0.036, 0.03), (cx + sx * 0.03, 0.068)], 0.004, bev=0.002, z0=z0 + 0.004), flat('#2a2230'), 'shadow')
        add(dot(0.016, (cx, -0.004, z0 + 0.016), sc=(1.1, 0.85, 0.35), K=6), flat('#fff6ea'), 'shadow')
        add(dot(0.006, (cx, 0.012, z0 + 0.016), sc=(0.7, 1.6, 0.4), K=6), flat('#fff6ea'), 'shadow')
        add(sph(0.0055, (cx, 0.002, z0 + 0.022), K=4, J=2), flat(INK), 'shadow')
        for sx in (-1, 1):
            add(sph(0.0075, (cx + sx * 0.014, 0.02, z0 + 0.016), K=5, J=2), flat('#fff6ea'), 'shadow')
            add(sph(0.004, (cx + sx * 0.014, 0.02, z0 + 0.021), K=4, J=2), flat(INK), 'shadow')

# ================================================================== Hanging Scroll (wall, 0.5 x 1, h 0.95)
def build_hangingScroll():
    new_asset()
    yt, yb = 0.895, 0.06
    uv = hang_uv(yb, yt)
    def cl(t, col, tag): return add(t, col, tag, 'cloth', uv)
    add(rb(0.43, 0.024, 0.026, (0.0, 0.905, 0.026), r=0.008), wood('#6b4a3a'), 'rod')
    add(gtube([(-0.14, 0.915, 0.032), (0.0, 0.985, 0.03), (0.14, 0.915, 0.032)], 0.0035, K=3), soft('#d8b878'), 'cord')
    add(sph(0.011, (0.0, 0.987, 0.026), K=6, J=3), lac(GOLD), 'cord')
    for sx in (-1, 1):
        add(gtube([(sx * 0.2, 0.9, 0.04), (sx * 0.205, 0.86, 0.042)], 0.0032, K=3, caps=False), soft('#8a6ac8'), 'tassel')
        add(glathe([(0.0, 0.0), (0.012, 0.004), (0.014, 0.03), (0.0, 0.036)], K=6, pos=(sx * 0.205, 0.82, 0.042)), soft('#8a6ac8', 0.2), 'tassel')
    # the silk mount, the paper, gold bands, the two hanging strips, the weighted roller
    ys = [yb + 0.03, 0.2, 0.35, 0.5, 0.65, 0.8, yt]
    cl(vslab(-0.185, 0.185, ys, 0.012, 0.022), soft('#3f6e66', 0.1), 'mount')
    py = [0.21, 0.35, 0.5, 0.65, 0.76]
    cl(vslab(-0.145, 0.145, py, 0.021, 0.026), paint('#f6efe0', top=0.03, bot=0.05), 'paper')
    for y in (0.775, 0.196): cl(rbox((0.296, 0.007, 0.022), r=0.0, M=F.m @ lm((0.0, y, 0.025))), lac('#e8b84a'), 'bands')
    for sx in (-1, 1): cl(rbox((0.026, 0.006, 0.13), r=0.0, M=F.m @ lm((sx * 0.07, 0.83, 0.025))), soft('#2c5048'), 'strips')
    cl(glathe([(0.0, -0.22), (0.016, -0.22), (0.016, 0.22), (0.0, 0.22)], K=8, pos=(0.0, 0.078, 0.022), rz=PI / 2), wood('#5a3a2a'), 'roller')
    for sx in (-1, 1): cl(sph(0.02, (sx * 0.228, 0.078, 0.022), sc=(0.8, 1, 1), K=7, J=3), lac('#f4ead8'), 'roller')
    # the art: a gold moon, a crane flying past it, drifts of mist and a mountain range, a red seal
    z0 = 0.0262
    cl(puffy([(0.035 + x, 0.62 + y) for x, y in circ_ol(14, 0.062)], 0.0035, bev=0.002, z0=z0), lac('#f0c040'), 'moon')
    for k, (yy, x0, x1) in enumerate(((0.47, -0.13, 0.08), (0.42, -0.05, 0.13))):
        mist = [(x0 + (x1 - x0) * i / 6, yy + 0.008 * math.sin(i * 1.4 + k)) for i in range(7)] + [(x0 + (x1 - x0) * i / 6, yy - 0.012 + 0.006 * math.sin(i * 1.7 + k)) for i in range(6, -1, -1)]
        cl(puffy(mist, 0.002, bev=0.001, z0=z0, centre=((x0 + x1) / 2, yy - 0.002)), flat('#d8d0e0'), 'mist')
    mtn = [(-0.14, 0.24), (0.14, 0.24), (0.14, 0.29), (0.09, 0.33), (0.05, 0.3), (0.0, 0.355), (-0.05, 0.31), (-0.09, 0.335), (-0.14, 0.285)]
    cl(puffy(mtn, 0.003, bev=0.0015, z0=z0, centre=(0.0, 0.27)), lambda p, n: mix('#9aa8bc', '#c8ccd8', clamp((p.z - 0.24) * 9)), 'mountains')
    cl(rbox((0.016, 0.004, 0.016), r=0.0, M=F.m @ lm((-0.11, 0.255, z0 + 0.004))), flat('#d83a3a'), 'seal')
    # the crane, wings wide, flying left past the moon
    cx, cy = -0.02, 0.6
    cl(sph(0.03, (cx, cy, z0 + 0.005), sc=(1.4, 0.55, 0.25), K=7, J=3, rz=0.12), soft('#fffaf2', 0.1), 'crane')
    cl(gtube([(cx - 0.035, cy + 0.006, z0 + 0.006), (cx - 0.07, cy + 0.022, z0 + 0.006), (cx - 0.1, cy + 0.03, z0 + 0.006)], 0.0045, K=4), soft('#fffaf2'), 'crane')
    cl(sph(0.008, (cx - 0.104, cy + 0.031, z0 + 0.007), K=5, J=2), flat('#2a2230'), 'crane')
    cl(sph(0.0045, (cx - 0.104, cy + 0.039, z0 + 0.008), K=4, J=2), flat('#e83a3a'), 'crane')
    cl(gtube([(cx - 0.11, cy + 0.03, z0 + 0.007), (cx - 0.13, cy + 0.026, z0 + 0.007)], 0.0028, K=3), flat('#e8c060'), 'crane')
    cl(gtube([(cx + 0.03, cy - 0.006, z0 + 0.004), (cx + 0.085, cy - 0.022, z0 + 0.004)], 0.003, K=3), flat('#3a3240'), 'crane')
    wing_u = [(0.0, 0.0), (0.03, 0.01), (0.055, 0.045), (0.06, 0.085), (0.04, 0.07), (0.02, 0.05), (-0.01, 0.02)]
    def wcol(p, n):
        return '#3a3240' if p.z > cy + 0.06 else '#fffaf2'
    cl(fan_shape(wing_u, (cx - 0.005, cy + 0.008, z0 + 0.008), sc=1.0, T=0.003, rz=0.2), wcol, 'crane')
    wing_d = [(0.0, 0.0), (0.03, -0.004), (0.06, -0.03), (0.075, -0.06), (0.05, -0.05), (0.02, -0.03), (-0.01, -0.01)]
    cl(fan_shape(wing_d, (cx + 0.005, cy - 0.004, z0 + 0.003), sc=1.0, T=0.003, rz=-0.1), lambda p, n: '#3a3240' if p.z < cy - 0.045 else '#f0ece8', 'crane')

# ================================================================== Kamidana (wall, 1 x 0.5, h 0.5)
def build_kamidana():
    new_asset()
    sy = 0.17
    add(rb(0.94, 0.04, 0.215, (0.0, sy + 0.02, 0.1075), r=0.012), wood('#f0d4a4', seed=11), 'shelf')
    br = [(0.004, 0.0), (0.17, 0.0), (0.16, -0.022), (0.11, -0.04), (0.07, -0.06), (0.045, -0.09), (0.035, -0.12), (0.004, -0.12)]
    for sx in (-1, 1):
        with at((sx * 0.38, sy, 0.0), ry=PI / 2):
            add(puffy([(-u, v) for u, v in br], 0.028, bev=0.008, z0=-0.014), wood('#c89a64', seed=12), 'brackets')
    top = sy + 0.04
    # the little shrine: hinoki platform and body, doors, a mirror on a stand, a copper-green gable roof with
    # crossed chigi boards and katsuogi logs on the ridge
    add(rb(0.32, 0.026, 0.16, (0.0, top + 0.013, 0.09), r=0.008), wood('#e8c890', seed=13), 'shrine')
    add(rb(0.21, 0.13, 0.11, (0.0, top + 0.026 + 0.065, 0.075), r=0.008), wood('#f0d8a8', seed=14), 'shrine')
    add(rb(0.12, 0.1, 0.008, (0.0, top + 0.026 + 0.058, 0.132), r=0.004), wood('#c8965a'), 'shrine')
    add(rbox((0.006, 0.006, 0.094), r=0.0, M=F.m @ lm((0.0, top + 0.084, 0.137))), flat('#8a5a3a'), 'shrine')
    for sx in (-1, 1): add(sph(0.006, (sx * 0.014, top + 0.084, 0.139), K=4, J=2), lac(GOLD), 'shrine')
    for x in (-0.115, 0.115): add(glathe([(0.0, 0.0), (0.012, 0.0), (0.012, 0.135), (0.0, 0.135)], K=6, pos=(x, top + 0.026, 0.135)), wood('#e8c890'), 'shrine')
    ry0 = top + 0.026 + 0.13 + 0.06
    a = 0.52
    for (sgn, L) in ((1, 0.125), (-1, 0.088)):
        d = Vector((0.0, -math.sin(a), sgn * math.cos(a))); nrm = Vector((0.0, math.cos(a), sgn * math.sin(a)))
        cen = Vector((0.0, ry0, 0.082)) + d * (L / 2 - 0.006) + nrm * 0.013
        add(rb(0.33, 0.026, L, tuple(cen), r=0.009, rx=(a if sgn > 0 else PI - a)), lac('#6fb8a0', hi='#a8e0c8'), 'roof')
    add(glathe([(0.0, -0.17), (0.014, -0.17), (0.014, 0.17), (0.0, 0.17)], K=6, pos=(0.0, ry0 + 0.016, 0.075), rz=PI / 2), wood('#e8c890'), 'roof')
    for x in (-0.07, 0.0, 0.07):
        add(glathe([(0.0, -0.032), (0.011, -0.032), (0.011, 0.032), (0.0, 0.032)], K=6, pos=(x, ry0 + 0.034, 0.078), rx=PI / 2), wood('#f0d4a0'), 'roof')
    for sx in (-1, 1):
        for s2 in (-1, 1):
            add(rbox((0.014, 0.012, 0.09), r=0.0, M=F.m @ lm((sx * 0.16, ry0 + 0.03, 0.075), rx=s2 * 0.5)), wood('#e8c890'), 'roof')
    # the mirror on its stand, in front of the doors
    add(rb(0.05, 0.016, 0.03, (0.0, top + 0.034, 0.17), r=0.006), wood('#c8965a'), 'mirror')
    K = 12
    prof = [(0.0, 0.0), (0.032, 0.0), (0.034, 0.008), (0.028, 0.012), (0.0, 0.01)]
    t = facet(lathe(prof, K, th0=PI / K), lambda c, fn: '#dfe8f0' if (math.hypot(c.x, c.y) < 0.028 and c.z > 0.009) else GOLD)
    t.xform(F.m @ lm((0.0, top + 0.075, 0.162), rx=PI / 2 - 0.15)); add(t, fsh(0.14, 0.24, sheen=0.5), 'mirror')
    # two sakaki vases and two sake bottles
    for sx in (-1, 1):
        with at((sx * 0.36, top, 0.11)):
            vp = [(0.0, 0.0), (0.028, 0.0), (0.034, 0.03), (0.024, 0.06), (0.02, 0.07), (0.026, 0.078), (0.0, 0.076)]
            t = facet(lathe(vp, 6, th0=PI / 6), lambda c, fn: '#fffaf2' if c.z < 0.066 else '#f0e8dc'); t.xform(F.m @ lm((0, 0, 0)))
            add(t, fsh(0.12, 0.22, sheen=0.4), 'vases')
            stem = [(0.0, 0.07, 0.0), (sx * 0.006, 0.12, 0.004), (sx * 0.016, 0.17, 0.008), (sx * 0.024, 0.215, 0.01)]
            add(gtube(stem, 0.0045, K=3), soft('#5a7a3a'), 'sakaki', 'leaf')
            for j in range(5):
                q = stem[min(3, 1 + (j + 1) // 2)]; side = 1 if j % 2 else -1
                add(leafb(0.042, 0.02, (q[0] + side * 0.016, q[1] - 0.012 + (j % 2) * 0.01, q[2] + 0.004), rz=-side * 0.95 + sx * 0.1, rx=0.3, T=0.005, heart=False, K=6), paint('#2f7a44', top=0.3, bot=0.3, hi='#5aa860'), 'sakaki', 'leaf')
        with at((sx * 0.215, top, 0.12)):
            bp = [(0.0, 0.0), (0.02, 0.0), (0.024, 0.026), (0.012, 0.05), (0.008, 0.062), (0.011, 0.066), (0.0, 0.066)]
            t = facet(lathe(bp, 6, th0=PI / 6), lambda c, fn: '#e8404a' if 0.026 < c.z < 0.04 else '#fffaf2'); t.xform(F.m @ lm((0, 0, 0)))
            add(t, fsh(0.12, 0.22, sheen=0.4), 'bottles')
    # the shimenawa: a fat twisted straw rope along the shelf's front with tufted ends, and zigzag paper shide
    xs = [-0.45 + 0.9 * i / 14 for i in range(15)]
    rope = [(x, sy - 0.006 - 0.022 * math.sin(PI * (x + 0.45) / 0.45) ** 2, 0.198) for x in xs]
    K = 5
    t = tube([F.W(p) for p in rope], lambda s: 0.02 * (1 - 0.25 * abs(s - 0.5) * 2) ** 0.5, K=K, caps=True)
    def rope_col(cen, fn):          # a helix: the segment index plus the step round the rope, every third a groove
        j = int((cen.x + 0.45) / 0.9 * 14 + 0.5); k = int(((math.atan2(fn.z, -fn.y) + TAU) % TAU) / (TAU / K))
        return '#b8944e' if (j + k) % 3 == 0 else ('#f4dc94' if (j + k) % 3 == 1 else '#e4c87e')
    t = facet(t, rope_col); add(t, fsh(0.16, 0.3), 'rope')
    for sx in (-1, 1):
        add(glathe([(0.0, 0.0), (0.022, 0.0), (0.012, 0.04), (0.0, 0.044)], K=6, pos=(sx * 0.452, sy - 0.006, 0.198), rz=-sx * PI / 2), paint('#e8cc80', top=0.2, bot=0.3), 'rope')
    for x in (-0.3, -0.1, 0.1, 0.3):
        y0 = sy - 0.006 - 0.022 * math.sin(PI * (x + 0.45) / 0.45) ** 2 - 0.016
        for k in range(3):
            add(rbox((0.026, 0.009, 0.03), r=0.0, M=F.m @ lm((x + (0.012 if k % 2 else 0.0), y0 - 0.014 - k * 0.028, 0.2))), paint('#fffaf2', top=0.05, bot=0.1), 'shide')

# ================================================================== Maple Wreath (wall, 0.5 x 0.5, h 0.45)
def build_mapleWreath():
    new_asset()
    cy, R = 0.245, 0.155
    ring = [(math.cos(TAU * k / 18) * R, cy + math.sin(TAU * k / 18) * R, 0.035) for k in range(18)]
    ring = [(math.cos(TAU * k / 16) * R, cy + math.sin(TAU * k / 16) * R, 0.035) for k in range(16)]
    t = tube_loop([F.W(p) for p in ring], lambda s: 0.03, K=5, up=Vector((0, -1, 0)))
    def twig(cen, fn):
        a = math.atan2(cen.z - cy, cen.x)
        return '#8e5e3a' if int(a / TAU * 16 + 0.5 * math.atan2(fn.z, -fn.y) / PI + 20) % 2 else '#74482c'
    add(facet(t, twig), fsh(0.16, 0.3), 'twigs')
    cols = ['#e8402e', '#f4782a', '#f4a82a', '#d8302a', '#f0c040', '#e85a2a']
    n = 38
    for k in range(n):
        a = TAU * k / n + 0.11 * math.sin(k * 2.7)
        rr = R + 0.022 * math.sin(k * 1.9) + (0.02 if k % 2 else -0.012)
        if abs(math.atan2(math.sin(a + PI / 2), math.cos(a + PI / 2))) < 0.42: continue      # (the bow's gap at the bottom)
        L = 0.075 + 0.015 * ((k * 7) % 3) / 2
        pos = (math.cos(a) * rr, cy + math.sin(a) * rr, 0.05 + 0.012 * (k % 3))
        rz = a - PI / 2 + (0.9 if k % 2 else -0.5)
        c = cols[(k * 5) % len(cols)]
        add(fan_shape(MAPLE, pos, sc=L, T=0.008, rz=rz, rx=0.18 * (1 if k % 2 else -1), centre=(0.0, 0.42)), paint(c, top=0.25, bot=0.35, hi=mix(c, '#fff0c0', 0.35)), 'leaves', 'leaf')
    for (a, rr) in ((2.4, R + 0.01), (0.55, R - 0.005), (3.8, R + 0.005)):
        p = (math.cos(a) * rr, cy + math.sin(a) * rr, 0.085)
        with at(p, rz=a - PI / 2 + 0.6):
            add(sph(0.016, (0, -0.006, 0), sc=(1, 1.25, 1), K=6, J=3), soft('#c8803a', 0.3), 'acorns')
            add(sph(0.018, (0, 0.012, 0), sc=(1, 0.6, 1), K=6, J=2), soft('#7a5030', 0.2), 'acorns')
            add(gtube([(0, 0.02, 0), (0.004, 0.032, 0)], 0.003, K=3), flat('#5a3a20'), 'acorns')
    for (a, rr) in ((1.7, R + 0.03), (1.82, R + 0.012), (4.6, R + 0.02), (4.5, R + 0.038), (0.1, R + 0.025), (3.05, R + 0.028)):
        add(sph(0.012, (math.cos(a) * rr, cy + math.sin(a) * rr, 0.09), K=5, J=2), lac('#d82a3a'), 'berries')
    # the red bow at the bottom, the loop of ribbon at the top
    with at((0.0, cy - R - 0.005, 0.085)):
        for sx in (-1, 1):
            add(sph(0.04, (sx * 0.036, 0.008, 0), sc=(1.0, 0.62, 0.42), K=8, J=3, rz=-sx * 0.25), lac('#e8323a'), 'bow')
            add(puffy([(sx * 0.006, -0.008), (sx * 0.026, -0.07), (sx * 0.014, -0.064), (sx * 0.004, -0.074), (sx * -0.004, -0.012)], 0.012, bev=0.005, z0=-0.008, centre=(sx * 0.01, -0.04)), lac('#d02a32'), 'bow')
        add(sph(0.018, (0, 0.004, 0.012), sc=(1, 1, 0.8), K=6, J=3), lac('#c8202a'), 'bow')
    add(gtube([(0.0, cy + R + 0.01, 0.03), (0.0, 0.455, 0.022)], 0.006, K=4), lac('#e8323a'), 'hanger')
    add(sph(0.012, (0.0, 0.462, 0.02), K=6, J=3), lac(GOLD), 'hanger')

# ================================================================== Glass Floats (wall, 1 x 0.5, h 0.45)
def build_glassFloats():
    new_asset()
    # a bleached driftwood branch on two pegs
    br = [(-0.43, 0.425, 0.04), (-0.3, 0.432, 0.042), (-0.15, 0.42, 0.045), (0.0, 0.43, 0.046), (0.15, 0.438, 0.045), (0.3, 0.428, 0.042), (0.44, 0.436, 0.04)]
    P = catmull(br, 9)
    add(gtube(P, lambda s: 0.021 + 0.006 * math.sin(s * 9.0) - 0.005 * s, K=6), wood('#d8c4a6', hi='#f4e8d4', nz=0.12), 'branch')
    add(gtube([(0.22, 0.436, 0.045), (0.27, 0.465, 0.05), (0.3, 0.475, 0.052)], lambda s: 0.011 - 0.004 * s, K=5), wood('#d0bc9c'), 'branch')
    add(gtube([(-0.25, 0.428, 0.045), (-0.28, 0.395, 0.05)], lambda s: 0.01 - 0.003 * s, K=5), wood('#d0bc9c'), 'branch')
    for x in (-0.33, 0.33):
        add(glathe([(0.0, 0.0), (0.008, 0.0), (0.008, 0.07), (0.0, 0.07)], K=5, pos=(x, 0.428, 0.0), rx=PI / 2), wood('#7a5a42'), 'pegs')
        add(tube_loop([F.W((x + 0.024 * math.cos(TAU * k / 8), 0.428 + 0.024 * math.sin(TAU * k / 8), 0.04)) for k in range(8)], lambda s: 0.004, K=3, up=Vector((0, -1, 0))), soft('#d8b070'), 'pegs')
    # the fishing net: diagonal hemp strands in a diamond lattice, hanging in a soft fan
    def netp(u, v):          # u across (-1..1), v down (0 top .. 1 bottom)
        w = 0.36 - 0.06 * v
        return (u * w, 0.415 - v * 0.24 + 0.02 * (1 - u * u) * v, 0.022 + 0.012 * v)
    for i in range(-5, 6):
        for sgn in (-1, 1):
            u0 = i / 5.0; pts = []
            for s in range(3):
                v = s / 2.0; u = u0 + sgn * v * 0.55
                if abs(u) > 1.0: break
                pts.append(netp(u, v))
            if len(pts) >= 2: add(gtube(pts, 0.0038, K=3, caps=False), soft('#d8b880', 0.15), 'net')
    add(gtube([netp(-1.0, 1.0), netp(-0.5, 1.0), netp(0.0, 1.0), netp(0.5, 1.0), netp(1.0, 1.0)], 0.0045, K=3, caps=False), soft('#c8a870', 0.15), 'net')
    # three glass floats in rope cages (the glow material, like the kit), each on a cord from the branch
    for (x, y, z, r, c) in ((-0.2, 0.282, 0.085, 0.074, '#a8ecc8'), (0.0, 0.222, 0.105, 0.085, '#a8d8ff'), (0.205, 0.29, 0.085, 0.07, '#d8f0a0')):
        hl = mix(c, '#ffffff', 0.6)
        add(sph(r, (x, y, z), K=10, J=6), lambda p, n, c=c, hl=hl: mix(mul(c, 0.86), hl, clamp(n.z * 0.5 - n.y * 0.3 - n.x * 0.4) ** 1.6), 'floats', 'glow')
        rr = r * 1.04
        add(tube_loop([F.W((x + rr * math.cos(TAU * k / 10), y + rr * 0.32 * math.sin(TAU * k / 10), z + rr * math.sin(TAU * k / 10) * 0.95)) for k in range(10)], lambda s: 0.004, K=3, up=Vector((0, 0, 1))), soft('#d8b070'), 'rope')
        add(tube_loop([F.W((x + rr * math.sin(TAU * k / 10) * 0.28, y + rr * math.cos(TAU * k / 10), z + rr * math.sin(TAU * k / 10) * 0.96)) for k in range(10)], lambda s: 0.004, K=3, up=Vector((1, 0, 0))), soft('#d8b070'), 'rope')
        add(gtube([(x, y + r, z - 0.01), (x + 0.004, 0.41, 0.04)], 0.0036, K=3, caps=False), soft('#d8b070'), 'rope')
    # a pink scallop shell and an orange starfish caught in the net
    sc_ol = [(0.0, -0.4)] + [(0.5 * math.cos(a), 0.05 + 0.45 * math.sin(a)) for a in [PI * (0.1 + 0.8 * i / 6) for i in range(7)]][::-1]
    add(fan_shape(sc_ol[::-1], (-0.1, 0.36, 0.045), sc=0.06, T=0.01, rz=0.25, centre=(0.0, 0.05)), lambda p, n: mix('#ff9eb0', '#ffe0e8', clamp(n.z * 0.6 - n.y * 0.4)), 'shells')
    add(fan_shape(star_ol(5, 1.0, 0.42), (0.11, 0.37, 0.05), sc=0.032, T=0.01, rz=0.3, centre=(0.0, 0.0)), lambda p, n: mix('#f0603a', '#ffa070', clamp(-n.y * 0.5 + n.z * 0.4)), 'shells')
    for k in range(5):
        a = 0.3 + PI / 2 + k * TAU / 5
        add(sph(0.004, (0.11 + math.cos(a) * 0.016, 0.37 + math.sin(a) * 0.016, 0.06), K=4, J=2), flat('#fff0e0'), 'shells')

# ================================================================== Onsen Noren (wall, 1 x 1, h 0.95)
def build_onsenNoren():
    new_asset()
    yt, yb = 0.88, 0.07
    uv = hang_uv(yb, yt)
    # the pole on two brackets, and the folded-over top band
    add(glathe([(0.0, -0.49), (0.016, -0.49), (0.016, 0.49), (0.0, 0.49)], K=8, pos=(0.0, 0.925, 0.055), rz=PI / 2), wood('#c8965a'), 'pole')
    for sx in (-1, 1):
        add(sph(0.024, (sx * 0.5, 0.925, 0.055), sc=(0.8, 1, 1), K=7, J=4), wood('#8a5a3a'), 'pole')
        add(rb(0.03, 0.05, 0.055, (sx * 0.43, 0.93, 0.028), r=0.01), wood('#8a5a3a'), 'pole')
    navy, navyL = '#2a3e6e', '#3a5288'
    # three panels (the middle one carries the hot-spring mark), soft folds that deepen toward the hem
    def zf(x, y):
        hang = clamp((yt - y) / (yt - yb))
        return 0.05 + hang * (0.012 * math.sin(x * 26.0) + 0.006)
    panels = [(-0.49, -0.168), (-0.162, 0.162), (0.168, 0.49)]
    ys = [yt, 0.72, 0.56, 0.4, 0.25, yb + 0.03]
    for (x0, x1) in panels:
        t = sheet(x0, x1, ys, zf, nx=4)
        def pc(p, n, x0=x0):
            return mix(navy, navyL, 0.25) if p.z > 0.86 else navy
        add_open(t, paint(navy, top=0.08, bot=0.15), 'panels', 'cloth', uv)
        hem = [(x0 + (x1 - x0) * i / 4, yb + 0.03, zf(x0 + (x1 - x0) * i / 4, yb + 0.03)) for i in range(5)]
        add(gtube(hem, 0.011, K=4), soft('#1e2c50', 0.15), 'hem', 'cloth', uv)
        band = [(x0 + (x1 - x0) * i / 4, 0.16, zf(x0 + (x1 - x0) * i / 4, 0.16) + 0.004) for i in range(5)]
        add(gtube(band, 0.0075, K=4, caps=False), soft('#e8e0d0', 0.1), 'hem', 'cloth', uv)
    add(rb(1.0, 0.07, 0.02, (0.0, 0.888, 0.048), r=0.008), soft('#22345e', 0.12), 'band')
    # the mark: a bowl and three wavy steam lines, in cream relief (cloth: it sways with the panel)
    def on(x, y, dz=0.007): return (x, y, zf(x, y) + dz)
    bowl = [on(0.11 * math.cos(a), 0.44 + 0.085 * math.sin(a)) for a in [PI + PI * i / 8 for i in range(9)]]
    add(gtube(bowl, 0.012, K=4), soft('#f4ecdc', 0.12), 'mark', 'cloth', uv)
    for k, x in enumerate((-0.055, 0.0, 0.055)):
        steam = [on(x + 0.016 * math.sin(i * 1.6 + k), 0.47 + i * 0.03) for i in range(6)]
        add(gtube(steam, lambda s: 0.0105 - 0.003 * s, K=4), soft('#f4ecdc', 0.12), 'mark', 'cloth', uv)

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

# ================================================================== Tea Set (table, 0.5 x 0.5, h 0.18)
def build_teaSet():
    new_asset()
    add(rb(0.42, 0.018, 0.3, (0.0, 0.009, 0.0), r=0.008), lac('#c8302a', hi='#f07060'), 'tray')
    add(gloopc(rrect(0.42, 0.3, 0.05, 4, 0.024), 0.014, K=5), lac('#5a1e1a', hi='#a84838'), 'tray')
    # the round mint teapot with a sakura on its side, a gold bail handle and a little bud on the lid
    with at((-0.075, 0.018, -0.025), ry=-0.5):
        bp = [(0.0, 0.0), (0.045, 0.0), (0.062, 0.018), (0.068, 0.042), (0.062, 0.064), (0.044, 0.08), (0.0, 0.082)]
        add(gl_lathe(bp, 14), lac('#9adcc0', hi='#d8fff0'), 'teapot')
        add(gl_lathe([(0.0, 0.078), (0.042, 0.078), (0.043, 0.085), (0.03, 0.094), (0.0, 0.097)], 12), lac('#8ad0b4', hi='#d0f8e8'), 'teapot')
        add(sph(0.012, (0.0, 0.103, 0.0), sc=(1, 0.8, 1), K=6, J=3), lac('#ff9eb0'), 'teapot')
        add(gtube([(0.058, 0.03, 0.0), (0.082, 0.05, 0.0), (0.094, 0.07, 0.0), (0.1, 0.082, 0.0)], lambda s: 0.014 - 0.007 * s, K=6), lac('#9adcc0', hi='#d8fff0'), 'teapot')
        add(gtube([(-0.036, 0.086, 0.0), (-0.034, 0.12, 0.0), (0.0, 0.14, 0.0), (0.034, 0.12, 0.0), (0.036, 0.086, 0.0)], 0.0055, K=5), lac(GOLD), 'teapot')
        for sx in (-1, 1): add(sph(0.008, (sx * 0.036, 0.084, 0.0), K=5, J=2), lac(GOLD), 'teapot')
    # the sakura, in relief on the pot's camera side (pot local frame)
    with at((-0.075, 0.018, -0.025), ry=0.35):
        add(fan_shape(flower_ol(5, 1.0, 0.5, 2), (0.0, 0.04, 0.069), sc=0.02, T=0.004, centre=(0, 0)), lac('#ff9eb0'), 'teapot')
        add(sph(0.006, (0.0, 0.04, 0.073), K=4, J=2), flat('#ffd24a'), 'teapot')
    # two cups of green tea on wooden coasters
    for (x, z) in ((0.085, 0.07), (0.115, -0.045)):
        with at((x, 0.018, z)):
            add(gl_lathe([(0.0, 0.0), (0.042, 0.0), (0.044, 0.008), (0.0, 0.009)], 12), wood('#a86e42'), 'cups')
            cp = [(0.0, 0.009), (0.026, 0.009), (0.031, 0.014), (0.035, 0.056), (0.031, 0.058), (0.029, 0.048), (0.0, 0.048)]
            add(gl_lathe(cp, 12, colfn=lambda c, fn: '#a8d860' if (c.z > 0.046 and math.hypot(c.x, c.y) < 0.029) else '#fff6e6'), fsh(0.14, 0.24, sheen=0.35), 'cups')

# ================================================================== Flower Vase (table, h 0.42)
def build_flowerVase():
    new_asset()
    vp = [(0.0, 0.0), (0.045, 0.0), (0.06, 0.028), (0.067, 0.068), (0.056, 0.108), (0.034, 0.138), (0.029, 0.158), (0.04, 0.174), (0.036, 0.18), (0.027, 0.172), (0.0, 0.168)]
    add(gl_lathe(vp, 14), lambda p, n: mix(mix('#fff6fa', '#8fd0ff', clamp(p.z / 0.12)), '#fff8f0', clamp(n.z * 0.4 - n.y * 0.25 - n.x * 0.2) ** 2 * 0.6), 'vase')
    rv = prof_r(vp[:6])
    for k, (th, y) in enumerate(((0.3, 0.05), (-0.5, 0.075), (1.1, 0.06), (-1.3, 0.045), (0.0, 0.1), (2.0, 0.08))):
        add(dot(0.0075, on_lathe(rv, th, y, 0.001), sc=(1, 1, 0.45), K=6, ry=th), flat('#fffaf2'), 'vase')
    heads = [((0.0, 0.405, 0.0), 0.0, 0.0), ((-0.055, 0.365, 0.02), 0.35, 0.15), ((0.058, 0.372, -0.012), -0.4, -0.05), ((-0.025, 0.33, -0.05), 0.18, -0.4), ((0.034, 0.325, 0.052), -0.2, 0.42)]
    pinks = ['#ff8fb0', '#ffa8c4', '#ff7aa0', '#ffb8d0', '#ff94b4']
    for i, (hp, rz, rx) in enumerate(heads):
        x, y, z = hp
        stem = [(x * 0.1, 0.16, z * 0.1), (x * 0.45, 0.24, z * 0.45), (x * 0.85, y - 0.06, z * 0.85), (x, y - 0.012, z)]
        add(gtube(catmull(stem, 5), 0.0055, K=4), soft('#5aa84a'), 'stems', 'leaf')
        c = pinks[i]
        with at((x, y - 0.014, z), rz=rz, rx=rx):
            for k in range(3):
                with at((0, 0, 0), ry=TAU * k / 3 + i):
                    add(sph(1.0, (0.0, 0.024, 0.009), sc=(0.017, 0.028, 0.011), K=7, J=3, rx=0.22), lambda p, n, c=c: mix(mul(c, 0.86), mix(c, '#fff0f6', 0.55), clamp((p.z - (y - 0.02)) / 0.05)), 'tulips')
            add(sph(1.0, (0.0, 0.026, 0.0), sc=(0.014, 0.026, 0.014), K=6, J=3), soft(mix(c, '#ffd0e0', 0.3)), 'tulips')
    for (rz, ry, L) in ((0.45, 0.4, 0.15), (-0.5, -0.3, 0.14), (0.2, 2.6, 0.13), (-0.25, -2.4, 0.12)):
        with at((0.0, 0.165, 0.0), ry=ry):
            add(sph(1.0, (0.0, L * 0.5, 0.012), sc=(0.016, L * 0.5, 0.005), K=6, J=2, rz=rz * 0.4, rx=0.15), paint('#4f9a44', top=0.25, bot=0.3, hi='#8acc66'), 'blades', 'leaf')

# ================================================================== Book Stack (table, h 0.22)
def book(w, t, d, pos, ry, c, band=False, ribbon=None):
    with at(pos, ry=ry):
        add(rb(w, t, d, (0.0, t / 2, 0.0), r=0.007), lac(c, hi=mix(c, '#fff4e8', 0.35)), 'covers')
        add(rbox((w - 0.016, d + 0.003, t - 0.012), r=0.0, M=F.m @ lm((0.0095, t / 2, 0.0))), lambda p, n: mix('#fff4e0', '#e8d8bc', clamp(-n.z * 2 + 0.2)), 'pages')
        if band:
            for dx in (-0.018, 0.018): add(rbox((0.004, d + 0.002, t + 0.002), r=0.0, M=F.m @ lm((-w / 2 + 0.03 + dx, t / 2, 0.0))), lac(GOLD), 'covers')
        if ribbon:
            add(rbox((0.012, 0.005, 0.045), r=0.0, M=F.m @ lm((0.03, t - 0.02, d / 2 + 0.002), rx=0.25)), soft(ribbon), 'covers')

def build_bookStack():
    new_asset()
    stack = [(0.3, 0.042, 0.21, 0.08, '#e8606a', True, None), (0.28, 0.036, 0.2, -0.12, '#6a9ad8', False, '#ffd24a'),
             (0.27, 0.046, 0.19, 0.18, '#ffd24a', True, None), (0.25, 0.034, 0.18, -0.05, '#fff1dc', False, '#ff7a9a'),
             (0.24, 0.04, 0.18, 0.26, '#8fd07a', True, None)]
    y = 0.0015; x = 0.0
    for i, (w, t, d, ry, c, band, rib) in enumerate(stack):
        x = (-0.012, 0.014, -0.02, 0.012, -0.006)[i]
        book(w, t, d, (x, y, 0.004 * (i % 2)), ry, c, band, rib)
        y += t
    # round reading glasses resting on the top book
    with at((-0.01, y + 0.008, 0.01), ry=0.4):
        for sx in (-1, 1):
            add(gloopc([(sx * 0.038 + 0.03 * math.cos(TAU * k / 12), 0.0, 0.03 * math.sin(TAU * k / 12)) for k in range(12)], 0.0055, K=4), lac('#8a4a2a'), 'glasses')
        add(gtube([(-0.009, 0.0, -0.004), (0.0, 0.006, -0.006), (0.009, 0.0, -0.004)], 0.0045, K=4, caps=False), lac('#8a4a2a'), 'glasses')
        for sx in (-1, 1): add(gtube([(sx * 0.066, 0.0, -0.006), (sx * 0.072, 0.0, -0.06), (sx * 0.068, -0.004, -0.085)], 0.0045, K=4), lac('#8a4a2a'), 'glasses')

# ================================================================== Fruit Bowl (table, h 0.2)
def apple(pos, c, s=1.0, ry=0.0):
    with at(pos, ry=ry, s=s):
        add(gl_lathe([(0.0, 0.006), (0.022, 0.0), (0.039, 0.018), (0.043, 0.04), (0.035, 0.062), (0.016, 0.07), (0.0, 0.062)], 9), lambda p, n, c=c: mix(mul(c, 0.82), mix(c, '#ffd8c0', 0.4), clamp(n.z * 0.6 - n.y * 0.3)), 'apples')
        add(gtube([(0.0, 0.062, 0.0), (0.004, 0.078, 0.0), (0.009, 0.086, 0.0)], 0.0035, K=3), flat('#6a4a2a'), 'apples')
        add(leafb(0.03, 0.022, (0.016, 0.076, 0.0), rz=-1.0, rx=0.3, T=0.004), paint('#5aa84a', top=0.25, bot=0.3), 'apples', 'leaf')

def build_fruitBowl():
    new_asset()
    bp = [(0.0, 0.0), (0.07, 0.0), (0.076, 0.012), (0.13, 0.05), (0.168, 0.085), (0.163, 0.094), (0.124, 0.066), (0.062, 0.034), (0.0, 0.03)]
    def bc(c, fn):
        rr = math.hypot(c.x, c.y)
        if c.z > 0.08 and rr > 0.15: return '#8fc8f0'                     # the painted rim band
        return '#fff6e8' if fn.z > 0.3 and rr < 0.16 else '#f6ead6'
    add(gl_lathe(bp, 16, colfn=bc), fsh(0.12, 0.24, sheen=0.35), 'bowl')
    apple((-0.05, 0.032, 0.04), '#e8402e', 1.0, 0.3)
    apple((0.04, 0.034, -0.045), '#d83a30', 1.05, -0.6)
    apple((-0.055, 0.04, -0.06), '#f05a3a', 0.95, 1.2)
    with at((0.07, 0.034, 0.045)):
        add(gl_lathe([(0.0, 0.0), (0.03, 0.002), (0.045, 0.02), (0.043, 0.038), (0.026, 0.05), (0.0, 0.047)], 9), lambda p, n: mix('#e8701e', '#ffb050', clamp(n.z * 0.6 - n.y * 0.3)), 'persimmon')
        for k in range(4): add(leafb(0.022, 0.016, (math.cos(k * PI / 2) * 0.01, 0.05, math.sin(k * PI / 2) * 0.01), ry=-k * PI / 2, rz=-PI / 2 + 0.25, T=0.003), paint('#5a8a3a', top=0.2, bot=0.3), 'persimmon', 'leaf')
        add(gtube([(0.0, 0.048, 0.0), (0.0, 0.06, 0.0)], 0.004, K=3), flat('#5a3a20'), 'persimmon')
    # a bunch of purple grapes spilling over the front
    with at((0.0, 0.05, 0.075), rx=0.5):
        gp = [(0.0, 0.03, 0.0), (-0.018, 0.022, 0.006), (0.018, 0.022, 0.004), (0.0, 0.012, 0.014), (-0.026, 0.004, 0.0), (0.026, 0.006, -0.004), (-0.01, -0.006, 0.01), (0.012, -0.008, 0.008), (0.0, -0.024, 0.004), (0.0, 0.0, -0.014)]
        for k, q in enumerate(gp):
            c = ('#8a4ac8', '#7a3ab8', '#9a5ad8')[k % 3]
            add(sph(0.0155, q, K=6, J=3), lambda p, n, c=c: mix(mul(c, 0.8), mix(c, '#e8d0ff', 0.45), clamp(n.z * 0.6 - n.y * 0.4) ** 1.4), 'grapes')
        add(gtube([(0.0, 0.04, 0.0), (0.004, 0.058, -0.004)], 0.004, K=3), flat('#6a5a2a'), 'grapes')

# ================================================================== Little Succulent (table, h 0.24)
def build_succulent():
    new_asset()
    pp = [(0.0, 0.0), (0.06, 0.0), (0.07, 0.068), (0.08, 0.078), (0.082, 0.098), (0.075, 0.104), (0.07, 0.094), (0.0, 0.09)]
    def pc(c, fn):
        rr = math.hypot(c.x, c.y)
        if c.z > 0.089 and rr < 0.07: return '#7a5238'
        if c.z > 0.07: return '#ffa8c0'
        return '#fff4e6'
    add(gl_lathe(pp, 12, colfn=pc), fsh(0.14, 0.26, sheen=0.3), 'pot')
    rv = prof_r(pp[:3])
    for k in range(7):
        th = k * TAU / 7 + 0.3; y = 0.025 + 0.022 * (k % 2)
        add(dot(0.0085, on_lathe(rv, th, y, 0.001), sc=(1, 1, 0.45), K=6, ry=th), flat(('#8fe0c0', '#ff9eb8')[k % 2]), 'dots')
    # the rosette: four tiers of fat pointed leaves, sage with blushing pink tips, a tight bud in the middle
    def leafc(p, n):
        rr = math.hypot(p.x, p.y)
        c = mix('#9ac8a0', '#c8e8c0', clamp(n.z * 0.6))
        return mix(c, '#f0a0b0', smooth(0.05, 0.1, rr))
    tiers = [(10, 0.09, 0.034, 0.25, 0.098), (8, 0.072, 0.03, 0.55, 0.106), (6, 0.054, 0.026, 0.85, 0.114), (4, 0.036, 0.02, 1.15, 0.122)]
    for ti, (n, L, W, tilt, y) in enumerate(tiers):
        for k in range(n):
            a = TAU * k / n + ti * 0.4
            with at((0.0, y, 0.0), ry=a):
                add(sph(1.0, (0.0, L * 0.18 * math.sin(tilt) + 0.004, L * 0.5 * math.cos(tilt) * 0.95), sc=(W * 0.5, 0.012, L * 0.5), K=8, J=2, rx=-tilt), leafc, 'rosette', 'leaf')
    add(sph(0.018, (0.0, 0.13, 0.0), sc=(1, 1.1, 1), K=7, J=3), soft('#b8dcb0'), 'rosette', 'leaf')
    # a flower stalk with three orange blooms
    st = [(0.02, 0.12, 0.01), (0.04, 0.17, 0.02), (0.05, 0.2, 0.03)]
    add(gtube(st, 0.0035, K=3), soft('#9ab070'), 'flowers', 'leaf')
    for q in ((0.05, 0.205, 0.03), (0.062, 0.196, 0.026), (0.044, 0.196, 0.044)):
        add(sph(0.011, q, K=5, J=2), soft('#ff8a3a', 0.3), 'flowers')

# ================================================================== Paint Pots (table, h 0.2)
def build_paintPots():
    new_asset()
    add(rb(0.29, 0.016, 0.19, (0.0, 0.008, 0.0), r=0.007), wood('#e8a866', seed=21), 'tray')
    add(gloopc(rrect(0.29, 0.19, 0.04, 3, 0.02), 0.011, K=4), wood('#c98a50'), 'tray')
    jars = [(-0.095, -0.04, '#b89ae8', 'open'), (-0.045, -0.05, '#ffa8c4', 'lid'), (-0.105, 0.03, '#fff0e0', 'open'), (-0.045, 0.02, '#8fd0ff', 'lid'), (0.005, 0.04, '#a8e8b8', 'lid'), (0.005, -0.045, '#ffd24a', 'open')]
    for (x, z, c, kind) in jars:
        with at((x, 0.016, z)):
            jp = [(0.0, 0.0), (0.024, 0.0), (0.027, 0.006), (0.027, 0.04), (0.022, 0.046), (0.0, 0.046)]
            def jc(cc, fn, c=c):
                if cc.z > 0.044: return mix(c, '#2a2230', 0.05)                # (open: the paint inside)
                return c if cc.z < 0.03 else '#fffaf2'
            add(gl_lathe(jp, 9, colfn=jc), fsh(0.14, 0.26, sheen=0.3), 'jars')
            if kind == 'lid':
                add(gl_lathe([(0.0, 0.042), (0.028, 0.042), (0.029, 0.054), (0.022, 0.059), (0.0, 0.059)], 9), lac(c), 'jars')
            else:
                add(sph(0.012, (0.012, 0.047, 0.01), sc=(1, 0.25, 1), K=5, J=2), soft(c), 'jars')
    # the brush cup on the right, four brushes with coloured tips
    with at((0.085, 0.016, 0.0)):
        add(gl_lathe([(0.0, 0.0), (0.034, 0.0), (0.038, 0.074), (0.033, 0.076), (0.03, 0.064), (0.0, 0.064)], 10, colfn=lambda c, fn: '#5a6a90' if c.z > 0.062 and math.hypot(c.x, c.y) < 0.031 else '#8fc8f0'), fsh(0.14, 0.26, sheen=0.35), 'cup')
        add(gtube([(0.032, 0.058, 0.0), (0.052, 0.054, 0.0), (0.056, 0.035, 0.0), (0.05, 0.016, 0.0), (0.033, 0.014, 0.0)], 0.0062, K=4, caps=False), lac('#8fc8f0'), 'cup')
        for k, (dx, dz, ax, az, tip, hc) in enumerate(((-0.012, -0.008, -0.25, -0.1, '#ff7a9a', '#ffd24a'), (0.01, -0.01, 0.2, -0.15, '#6a9ad8', '#ff9eb0'), (-0.008, 0.012, -0.12, 0.25, '#ffd24a', '#8fd0ff'), (0.012, 0.01, 0.28, 0.2, '#b89ae8', '#a8e8b8'))):
            with at((dx, 0.03, dz), rz=-ax, rx=az):
                add(glathe([(0.0, 0.0), (0.0055, 0.0), (0.0055, 0.1), (0.0, 0.1)], K=5, pos=(0, 0, 0)), lac(hc), 'brushes')
                add(glathe([(0.0, 0.0), (0.0065, 0.0), (0.0065, 0.018), (0.0, 0.018)], K=5, pos=(0, 0.1, 0)), lac('#d8d8e0'), 'brushes')
                add(glathe([(0.0, 0.0), (0.0075, 0.004), (0.006, 0.02), (0.0, 0.032)], K=5, pos=(0, 0.118, 0)), soft(tip, 0.25), 'brushes')
    for (x, z, c) in ((0.03, 0.068, '#ff9eb0'), (-0.12, -0.07, '#8fd0ff')):
        add(sph(0.014, (x, 0.017, z), sc=(1.2, 0.18, 0.9), K=6, J=2), soft(c), 'splats')

# ================================================================== Incense Burner (table, h 0.22)
def build_incenseBurner():
    new_asset()
    sp = [(0.0, 0.0), (0.098, 0.0), (0.108, 0.006), (0.11, 0.018), (0.104, 0.026), (0.09, 0.028), (0.0, 0.028)]
    def stc(c, fn):
        rr = math.hypot(c.x, c.y)
        if 0.008 < c.z < 0.016 and rr > 0.105: return '#e8b84a'
        return '#5a3428' if fn.z > 0.6 else '#3e241c'
    add(gl_lathe(sp, 14, colfn=stc), fsh(0.16, 0.26, sheen=0.35), 'stand')
    bp = [(0.0, 0.048), (0.04, 0.048), (0.062, 0.06), (0.076, 0.082), (0.08, 0.093), (0.079, 0.104), (0.072, 0.116), (0.064, 0.124), (0.066, 0.13), (0.075, 0.134), (0.075, 0.141), (0.0, 0.141)]
    K = 12
    def bc(c, fn):
        if 0.086 < c.z < 0.1: return '#d8a858' if angle_k(c, K, PI / K) % 2 else '#a07038'        # the beaded band
        if c.z > 0.128: return '#c89a50'
        return None
    t = facet(lathe(bp, K, th0=PI / K), lambda c, fn: bc(c, fn) or '#7a5230'); t.xform(F.m @ lm((0, 0, 0)))
    add(t, lambda c, p, n: c if c != srgb('#7a5230') else bronze_col(p, n), 'burner')
    for k in range(3):
        a = k / 3 * TAU + 0.5; dx, dz = math.sin(a), math.cos(a)
        add(gtube([(dx * 0.045, 0.062, dz * 0.045), (dx * 0.068, 0.05, dz * 0.068), (dx * 0.078, 0.034, dz * 0.078)], lambda s: 0.014 - 0.003 * s, K=6, caps=False), bronze_col, 'legs')
        add(sph(0.016, (dx * 0.08, 0.04, dz * 0.08), sc=(1, 0.8, 1), K=7, J=3), bronze_col, 'legs')
    for sx in (-1, 1):
        add(gtube([(sx * 0.05, 0.141, 0.0), (sx * 0.055, 0.162, 0.0), (sx * 0.072, 0.17, 0.0), (sx * 0.088, 0.162, 0.0), (sx * 0.09, 0.141, 0.0)], 0.0062, K=4), bronze_col, 'ears')
    lp = [(0.0, 0.139), (0.073, 0.139), (0.074, 0.147), (0.068, 0.16), (0.055, 0.176), (0.034, 0.188), (0.012, 0.193), (0.0, 0.194)]
    def lc(c, fn):
        k = angle_k(c, K, PI / K)
        if 0.142 < c.z < 0.149: return '#d8a858'
        return '#7a5230'
    t = facet(lathe(lp, K, th0=PI / K), lc); t.xform(F.m @ lm((0, 0, 0)))
    add(t, lambda c, p, n: c if c != srgb('#7a5230') else bronze_col(p, n), 'lid')
    rl = prof_r(lp[2:])
    for k in range(9):
        for (y, a0, r) in ((0.167, 0.0, 0.0055), (0.182, PI / 9, 0.0042)):
            th = a0 + k * TAU / 9
            add(dot(r, on_lathe(rl, th, y, 0.001), sc=(1, 1, 0.4), K=6, ry=th, rx=-0.6), flat('#2e1e14'), 'lid')
    add(gl_lathe([(0.0, 0.19), (0.011, 0.193), (0.014, 0.2), (0.011, 0.209), (0.005, 0.217), (0.0, 0.221)], 8), lac('#d8a858'), 'finial')
    for k in range(5):
        with at((0.0, 0.194, 0.0), ry=k * TAU / 5):
            add(sph(1.0, (0.0, 0.0, 0.012), sc=(0.008, 0.004, 0.014), K=5, J=2, rx=-0.5), lac('#d8a858'), 'finial')
    # the thread of smoke: a chunky, softly tapering curl (a toy's smoke: solid, pale lavender to white)
    sm = [(0.0, 0.222, 0.0), (0.004, 0.24, 0.003), (0.016, 0.262, 0.0), (0.013, 0.286, -0.01), (-0.01, 0.304, -0.006), (-0.02, 0.326, 0.01), (0.0, 0.345, 0.018), (0.018, 0.358, 0.01)]
    add(gtube(catmull(sm, 12), lambda s: 0.0042 + 0.0035 * math.sin(PI * min(1.0, s * 1.15)), K=5), lambda p, n: mix('#c8c0d8', '#f6f2fa', clamp((p.z - 0.22) / 0.13)), 'smoke')

# ================================================================== Panda Plush (table, h 0.3)
def build_pandaPlush():
    new_asset()
    W_, B_ = '#fff8f0', '#2e2836'
    def plush(c):
        return lambda p, n: mix(mul(c, 0.84), mix(c, '#ffffff', 0.25), clamp(n.z * 0.5 - n.y * 0.35 + 0.25))
    add(sph(1.0, (0.0, 0.098, 0.0), sc=(0.1, 0.098, 0.086), K=12, J=7), plush(W_), 'body')
    add(sph(1.0, (0.0, 0.206, 0.012), sc=(0.092, 0.08, 0.08), K=12, J=7), plush(W_), 'head')
    for sx in (-1, 1):
        add(sph(0.03, (sx * 0.064, 0.27, -0.004), sc=(1, 1, 0.62), K=8, J=4), plush(B_), 'ears')
        add(sph(1.0, (sx * 0.033, 0.208, 0.079), sc=(0.021, 0.027, 0.01), K=8, J=3, rz=sx * 0.55), flat(B_), 'face')
        add(sph(0.0105, (sx * 0.032, 0.207, 0.088), sc=(1, 1.1, 0.6), K=6, J=3), lac('#2a2230', hi='#6a6080'), 'face')
        add(sph(0.004, (sx * 0.029, 0.212, 0.0945), K=4, J=2), flat('#fffaf2'), 'face')
        add(dot(0.011, (sx * 0.056, 0.185, 0.07), sc=(1.1, 0.7, 0.4), K=6), flat('#ffb0c0'), 'face')
    add(sph(1.0, (0.0, 0.186, 0.08), sc=(0.03, 0.021, 0.016), K=8, J=3), plush('#fff2e6'), 'face')
    add(sph(0.009, (0.0, 0.193, 0.095), sc=(1.3, 0.8, 0.8), K=6, J=2), lac('#2a2230'), 'face')
    add(gtube([(-0.008, 0.18, 0.094), (0.0, 0.183, 0.096), (0.008, 0.18, 0.094)], 0.0022, K=3, caps=False), flat('#2a2230'), 'face')
    # black arms hugging a bamboo shoot, black legs with pink paw pads
    for sx in (-1, 1):
        add(gtube([(sx * 0.07, 0.152, 0.025), (sx * 0.06, 0.125, 0.07), (sx * 0.03, 0.112, 0.1)], lambda s: 0.031 - 0.006 * s, K=7), plush(B_), 'arms')
        add(sph(1.0, (sx * 0.058, 0.034, 0.058), sc=(0.042, 0.034, 0.052), K=8, J=4), plush(B_), 'legs')
        add(dot(0.016, (sx * 0.06, 0.036, 0.106), sc=(1, 1, 0.35), K=6), flat('#ffb0c0'), 'pads')
        for k in range(3): add(sph(0.0065, (sx * 0.06 + (k - 1) * 0.013, 0.056, 0.104), sc=(1, 1, 0.5), K=4, J=2), flat('#ffb0c0'), 'pads')
    add(sph(1.0, (0.0, 0.135, -0.03), sc=(0.104, 0.03, 0.084), K=10, J=3), plush(B_), 'body')
    with at((0.022, 0.03, 0.095), rz=-0.32, rx=0.12):
        bp = [(0.0, 0.0), (0.016, 0.0), (0.017, 0.05), (0.0195, 0.055), (0.017, 0.06), (0.016, 0.11), (0.0185, 0.115), (0.0155, 0.12), (0.012, 0.17), (0.0, 0.178)]
        add(gl_lathe(bp, 7, colfn=lambda c, fn: '#b8e08a' if math.hypot(c.x, c.y) > 0.0172 else '#78bc58'), fsh(0.16, 0.28, sheen=0.25), 'bamboo')
        for sx in (-1, 1): add(leafb(0.036, 0.014, (sx * 0.014, 0.175, 0.0), rz=-sx * 0.9, T=0.004, heart=False), paint('#5aa84a', top=0.25, bot=0.3), 'bamboo', 'leaf')
    with at((0.07, 0.29, 0.012)):
        add(fan_shape(flower_ol(5, 1.0, 0.55, 2), (0.0, 0.0, 0.0), sc=0.02, T=0.006, rx=-0.3, centre=(0, 0)), lac('#ff9eb8'), 'flower')
        add(sph(0.006, (0.0, 0.002, 0.006), K=4, J=2), flat('#ffd24a'), 'flower')

# ================================================================== Frog Fountain (table, h 0.3)
def build_frogFountain():
    new_asset()
    base = [(0.0, 0.0), (0.2, 0.0), (0.216, 0.014), (0.208, 0.034), (0.172, 0.046), (0.0, 0.048)]
    add(gl_lathe(base, 12, rfn=lambda r, z, th: r * (1 + 0.04 * math.sin(3 * th + 1) + 0.03 * math.sin(5 * th))), lambda p, n: mix(mix('#a89ca8', '#c8bec8', clamp(n.z)), '#8ab870', smooth(0.5, 0.8, n.z)), 'base')
    # the pink scallop-shell basin with water in it
    with at((-0.045, 0.044, 0.065)):
        sp = [(0.0, 0.0), (0.085, 0.0), (0.125, 0.032), (0.138, 0.052), (0.124, 0.052), (0.11, 0.04), (0.0, 0.036)]
        add(gl_lathe(sp, 16, rfn=lambda r, z, th: r * (1 + 0.07 * abs(math.cos(4 * th))) if z > 0.02 else r), lambda p, n: mix('#ff9eb0', '#ffe4ec', clamp(n.z * 0.7 - n.y * 0.2)), 'shell')
        add(gl_lathe([(0.0, 0.041), (0.116, 0.041), (0.116, 0.046), (0.0, 0.046)], 16), lambda p, n: mix('#5ab8d8', '#a8e4f4', clamp(n.z)), 'water', 'water')
        add(gloopc([(0.035 * math.cos(TAU * k / 10) + 0.01, 0.048, 0.035 * math.sin(TAU * k / 10)) for k in range(10)], 0.0035, K=3), flat('#e8f8ff'), 'water', 'water')
        add(fan_shape([(math.cos(a) * 0.035, math.sin(a) * 0.035) for a in [0.35 + (TAU - 0.7) * i / 9 for i in range(10)]] + [(0.0, 0.0)], (-0.05, 0.049, 0.025), sc=1.0, T=0.004, rx=-PI / 2, centre=(-0.012, 0.0)), paint('#5aa84a', top=0.3, bot=0.3), 'lily', 'leaf')
        add(fan_shape(flower_ol(5, 1.0, 0.5, 2), (-0.055, 0.056, 0.022), sc=0.016, T=0.006, rx=-PI / 2 + 0.3, centre=(0, 0)), lac('#ffb0c8'), 'lily')
    # the rock and the stone frog sitting on it, spouting a stream into the shell
    add(sph(1.0, (0.07, 0.07, -0.07), sc=(0.09, 0.065, 0.08), K=8, J=4), lambda p, n: mix(mix('#a89ca8', '#c8c0c8', clamp(n.z)), '#8ab870', smooth(0.55, 0.85, n.z)), 'rock')
    G_ = '#9ac08a'
    def stone(p, n): return mix(mul(G_, 0.8), mix(G_, '#e0f0d0', 0.4), clamp(n.z * 0.6 - n.y * 0.25 + 0.15))
    with at((0.07, 0.11, -0.06), ry=-0.55):
        add(sph(1.0, (0.0, 0.035, 0.0), sc=(0.062, 0.05, 0.066), K=10, J=5), stone, 'frog')
        add(sph(1.0, (0.0, 0.075, 0.03), sc=(0.058, 0.04, 0.05), K=10, J=5), stone, 'frog')
        add(sph(1.0, (0.0, 0.03, 0.05), sc=(0.04, 0.036, 0.02), K=8, J=3), soft('#e8f0c8'), 'frog')
        for sx in (-1, 1):
            add(sph(0.02, (sx * 0.03, 0.108, 0.03), K=8, J=4), stone, 'frog')
            add(sph(0.0105, (sx * 0.032, 0.11, 0.046), sc=(1, 1, 0.6), K=6, J=3), lac('#2a2230', hi='#6a6080'), 'frog')
            add(sph(0.0038, (sx * 0.028, 0.115, 0.052), K=4, J=2), flat('#fffaf2'), 'frog')
            add(dot(0.01, (sx * 0.046, 0.068, 0.062), sc=(1, 0.7, 0.4), K=6), flat('#ffb0b8'), 'frog')
            add(sph(1.0, (sx * 0.058, 0.02, -0.01), sc=(0.028, 0.022, 0.05), K=8, J=3), stone, 'frog')
            add(sph(1.0, (sx * 0.034, 0.014, 0.062), sc=(0.016, 0.03, 0.016), K=6, J=3), stone, 'frog')
        add(sph(0.012, (0.0, 0.062, 0.078), sc=(1.2, 0.8, 0.6), K=6, J=3), flat('#4a3a40'), 'frog')
    # the stream: from the frog's mouth in an arc down to the water
    m = F.W((0, 0, 0))
    a = -0.55; mx, mz = 0.07 + math.sin(a) * 0.078, -0.06 + math.cos(a) * 0.078
    st = [(mx, 0.172, mz), (mx - 0.03, 0.17, mz + 0.03), (mx - 0.055, 0.14, mz + 0.055), (-0.03, 0.095, 0.075), (-0.035, 0.052, 0.07)]
    add(gtube(catmull(st, 7), lambda s: 0.0075 - 0.002 * s, K=5), lambda p, n: mix('#7ad0f0', '#e0f8ff', clamp(n.z * 0.5 - n.y * 0.4)), 'stream', 'water')
    for q in ((-0.045, 0.054, 0.08), (-0.025, 0.054, 0.062), (-0.04, 0.056, 0.058)):
        add(sph(0.007, q, K=5, J=2), flat('#e8f8ff'), 'stream', 'water')
    for (x, z, r0) in ((0.16, 0.06, 0.0), (-0.15, -0.09, 1.2)):
        for k in range(3):
            add(leafb(0.05, 0.012, (x + (k - 1) * 0.008, 0.07, z), ry=r0 + k * 0.9, rz=(k - 1) * 0.35, T=0.004, heart=False), paint('#6ab84a', top=0.25, bot=0.3), 'grass', 'leaf')
    add(sph(0.016, (0.12, 0.052, 0.13), sc=(1.2, 0.6, 1), K=6, J=2), soft('#d8d0d8'), 'pebble')

# ================================================================== Daruma (table, h 0.3)
def build_daruma():
    new_asset()
    dp = [(0.0, 0.0), (0.09, 0.0), (0.118, 0.026), (0.132, 0.075), (0.13, 0.125), (0.114, 0.176), (0.087, 0.222), (0.05, 0.256), (0.0, 0.27)]
    add(gl_lathe(dp, 18), lac('#e8302a', hi='#ff7a60', lo='#a81e1e'), 'body')
    rf = prof_r(dp[1:])
    # the cream face, painted in relief: a thick brow over each eye, one eye painted in, the other still blank
    add_open(surf_patch(rf, 0.72, 0.148, 0.082, lift=0.005, seg=18, rings=3), paint('#fff4e4', top=0.06, bot=0.1), 'face')
    L = lambda th, y, lf=0.012: on_lathe(rf, th, y, lf)
    for sx in (-1, 1):
        add(gtube([L(sx * 0.1, 0.186), L(sx * 0.2, 0.197), L(sx * 0.31, 0.196), L(sx * 0.39, 0.184)], lambda s: 0.0085 - 0.003 * abs(s - 0.4), K=5), lac('#2a2230', hi='#5a5068'), 'face')
    # the wished eye: a white ring with a black pupil; the other: a blank white circle with a black outline
    with at(L(-0.21, 0.158, 0.005), ry=-0.21):
        add(dot(0.026, (0, 0, 0.0), sc=(1, 1, 0.28), K=12), flat('#2a2230'), 'face')
        add(dot(0.021, (0, 0, 0.0035), sc=(1, 1, 0.3), K=12), flat('#fffaf2'), 'face')
        add(dot(0.0145, (0.002, -0.002, 0.007), sc=(1, 1, 0.35), K=9), lac('#2a2230', hi='#5a5068'), 'face')
        add(sph(0.0042, (0.007, 0.004, 0.012), K=4, J=2), flat('#fffaf2'), 'face')
    with at(L(0.21, 0.158, 0.005), ry=0.21):
        add(dot(0.026, (0, 0, 0.0), sc=(1, 1, 0.28), K=12), flat('#2a2230'), 'face')
        add(dot(0.021, (0, 0, 0.0035), sc=(1, 1, 0.3), K=12), flat('#fffaf2'), 'face')
    add(dot(0.009, L(0.0, 0.137, 0.008), sc=(1.1, 0.8, 0.6), K=6), lac('#e8504a'), 'face')
    for sx in (-1, 1):
        add(gtube([L(sx * 0.02, 0.123), L(sx * 0.11, 0.118), L(sx * 0.2, 0.123), L(sx * 0.25, 0.134), L(sx * 0.235, 0.142)], lambda s: 0.0072 - 0.003 * s, K=5), lac('#2a2230', hi='#5a5068'), 'face')
    add(gtube([L(-0.07, 0.106, 0.007), L(0.0, 0.102, 0.007), L(0.07, 0.106, 0.007)], 0.0035, K=3), flat('#c82a2a'), 'face')
    # gold swirls on the belly and the cheeks
    for sx in (-1, 1):
        add(gtube([L(sx * 0.15, 0.06, 0.004), L(sx * 0.35, 0.05, 0.004), L(sx * 0.55, 0.06, 0.004), L(sx * 0.68, 0.085, 0.004)], 0.006, K=4), lac(GOLD), 'gold')
        add(gtube([L(sx * 0.62, 0.15, 0.004), L(sx * 0.72, 0.12, 0.004), L(sx * 0.7, 0.09, 0.004)], 0.0055, K=4), lac(GOLD), 'gold')
    add(gtube([L(-0.12, 0.045, 0.004), L(0.0, 0.04, 0.004), L(0.12, 0.045, 0.004)], 0.006, K=4), lac(GOLD), 'gold')

# ================================================================== Goldfish Bowl (table, h 0.3)
def build_goldfishBowl():
    new_asset()
    lo = [(0.0, 0.0), (0.07, 0.0), (0.112, 0.028), (0.142, 0.075), (0.15, 0.13), (0.145, 0.185), (0.138, 0.2)]
    add(gl_lathe(lo, 16), lambda p, n: mix(mix('#6ac8e4', '#a8e4f4', clamp(p.z / 0.2)), '#f0fcff', clamp(n.z * 0.3 - n.y * 0.3 - n.x * 0.35) ** 2.5 * 0.8), 'water', 'water')
    up = [(0.138, 0.198), (0.12, 0.222), (0.098, 0.236), (0.112, 0.256), (0.145, 0.286), (0.152, 0.296), (0.14, 0.296), (0.115, 0.27), (0.092, 0.248), (0.112, 0.212), (0.13, 0.202)]
    def frill(r, z, th): return r * (1 + 0.075 * math.cos(9 * th)) if z > 0.26 else r
    t = lathe(up, 16, th0=PI / 16, rfn=frill); t.xform(F.m @ lm((0, 0, 0)))
    add_open(t, lambda p, n: mix(mix('#dff4fa', '#a8d8f0', smooth(0.27, 0.296, p.z)), '#ffffff', clamp(n.z * 0.4 - n.y * 0.3) ** 2 * 0.6), 'glass')
    add(gl_lathe([(0.0, 0.203), (0.132, 0.203), (0.132, 0.206), (0.0, 0.206)], 16), lambda p, n: mix('#5ab8d8', '#a8e4f4', clamp(n.z)), 'water', 'water')
    # the very proud goldfish (in front, swimming left, chest puffed), bubbles, weed and pebbles
    rf = prof_r(lo[1:])
    with at(on_lathe(rf, 0.15, 0.105, 0.008), ry=0.15):
        add(sph(1.0, (0.0, 0.0, 0.0), sc=(0.042, 0.03, 0.02), K=9, J=4), lambda p, n: mix('#f05a2a', '#ffb060', clamp(n.z * 0.5 - n.y * 0.4)), 'fish')
        add(fan_shape([(0.0, 0.0), (0.03, 0.03), (0.024, 0.0), (0.03, -0.028)], (0.036, 0.0, 0.0), sc=1.0, T=0.006, centre=(0.018, 0.0)), lac('#ff7a3a'), 'fish')
        add(fan_shape([(-0.015, 0.0), (0.0, 0.026), (0.016, 0.004)], (0.0, 0.022, 0.0), sc=1.0, T=0.005, centre=(0.0, 0.01)), lac('#ff8a4a'), 'fish')
        add(sph(0.0075, (-0.024, 0.008, 0.016), K=5, J=2), flat('#fffaf2'), 'fish')
        add(sph(0.0042, (-0.026, 0.008, 0.021), K=4, J=2), flat('#2a2230'), 'fish')
        add(gtube([(-0.038, -0.006, 0.014), (-0.032, -0.01, 0.017), (-0.026, -0.007, 0.018)], 0.002, K=3, caps=False), flat('#a82a1a'), 'fish')
    for k, (th, y, r) in enumerate(((-0.2, 0.14, 0.008), (-0.25, 0.165, 0.006), (-0.18, 0.186, 0.0045))):
        add(dot(r, on_lathe(rf, th, y, 0.006), sc=(1, 1, 0.5), K=6, ry=th), flat('#f0fcff'), 'bubbles')
    for k in range(10):
        th = -1.1 + k * 0.24; y = 0.016 + 0.008 * (k % 2)
        add(dot(0.011, on_lathe(rf, th, y, 0.003), sc=(1.1, 0.8, 0.5), K=6, ry=th), flat(('#ff9eb0', '#ffe08a', '#a8e8cc', '#fff6ea', '#b8a8e8')[k % 5]), 'pebbles')
    for (th, h, rz) in ((-0.75, 0.09, 0.15), (-0.62, 0.07, -0.25)):
        q = on_lathe(rf, th, 0.05 + h * 0.5, 0.005)
        add(leafb(h, 0.02, q, ry=th, rz=rz, T=0.004, heart=False), paint('#5aa84a', top=0.25, bot=0.3), 'weed', 'leaf')

# ================================================================== Lucky Cat (table, h 0.32)
def build_luckyCat():
    new_asset()
    cp = [(0.0, 0.0), (0.11, 0.0), (0.124, 0.014), (0.128, 0.028), (0.12, 0.044), (0.085, 0.052), (0.0, 0.054)]
    def cc(c, fn):
        rr = math.hypot(c.x, c.y)
        return '#f4c04a' if 0.012 < c.z < 0.03 and fn.z > -0.5 and abs(fn.z) < 0.6 else '#e83a3a'
    add(gl_lathe(cp, 16, colfn=cc, e=3.2), fsh(0.16, 0.28, sheen=0.3), 'cushion')
    for (sx, sz) in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
        x, z = sx * 0.098, sz * 0.098
        add(sph(0.011, (x, 0.03, z), K=5, J=2), lac(GOLD), 'tassels')
        with at((x * 1.12, 0.03, z * 1.12), rz=sx * 2.5, rx=-sz * 0.6):
            add(glathe([(0.0, 0.0), (0.011, 0.004), (0.014, 0.03), (0.0, 0.036)], K=6), lac(GOLD), 'tassels')
    W_ = '#fffaf2'; O_ = '#f4a050'
    def fur(p, n, patch=None):
        c = mix(mul(W_, 0.86), W_, clamp(n.z * 0.5 - n.y * 0.35 + 0.3))
        if patch and patch(p): c = mix(mul(O_, 0.86), mix(O_, '#ffe0c0', 0.3), clamp(n.z * 0.5 - n.y * 0.3 + 0.3))
        return c
    y0 = 0.054
    add(sph(1.0, (0.0, y0 + 0.062, -0.006), sc=(0.074, 0.068, 0.068), K=12, J=6), lambda p, n: fur(p, n, lambda q: q.x < -0.03 and q.y > 0.01), 'body')
    add(sph(1.0, (0.0, y0 + 0.165, 0.006), sc=(0.078, 0.066, 0.07), K=12, J=7), lambda p, n: fur(p, n, lambda q: q.x > 0.035 and q.z > y0 + 0.17), 'head')
    for sx in (-1, 1):
        with at((sx * 0.046, y0 + 0.215, 0.0), rz=-sx * 0.35):
            add(glathe([(0.0, 0.0), (0.026, 0.0), (0.014, 0.03), (0.0, 0.042)], K=6), (lambda p, n: fur(p, n, lambda q: True)) if sx > 0 else (lambda p, n: fur(p, n)), 'ears')
            add(puffy([(-0.012, 0.006), (0.012, 0.006), (0.0, 0.03)], 0.004, bev=0.002, z0=0.014), flat('#ffb0c0'), 'ears')
        add(sph(1.0, (sx * 0.028, y0 + 0.168, 0.07), sc=(0.011, 0.014, 0.008), K=6, J=3), lac('#2a2230', hi='#6a6080'), 'face')
        add(sph(0.0042, (sx * 0.025, y0 + 0.174, 0.077), K=4, J=2), flat('#fffaf2'), 'face')
        add(dot(0.01, (sx * 0.05, y0 + 0.148, 0.062), sc=(1.1, 0.7, 0.4), K=6), flat('#ffb0c0'), 'face')
        for dy in (-0.004, 0.006):
            add(gtube([(sx * 0.036, y0 + 0.148 + dy, 0.07), (sx * 0.072, y0 + 0.152 + dy * 2, 0.06)], 0.0018, K=3, caps=False), flat('#c8b8b0'), 'face')
    add(sph(0.007, (0.0, y0 + 0.155, 0.077), sc=(1.2, 0.8, 0.7), K=5, J=2), flat('#ff8fa8'), 'face')
    add(gtube([(-0.012, y0 + 0.146, 0.074), (-0.006, y0 + 0.142, 0.076), (0.0, y0 + 0.146, 0.077), (0.006, y0 + 0.142, 0.076), (0.012, y0 + 0.146, 0.074)], 0.0022, K=3, caps=False), flat('#8a5a5a'), 'face')
    # the red collar and gold bell
    add(gloopc([(0.056 * math.cos(TAU * k / 12), y0 + 0.112 + 0.006 * math.cos(TAU * k / 12 - PI / 2), 0.056 * math.sin(TAU * k / 12) + 0.002) for k in range(12)], 0.0075, K=4), lac('#e83a3a'), 'collar')
    add(sph(0.016, (0.0, y0 + 0.1, 0.062), K=8, J=4), lac(GOLD), 'collar')
    # the raised beckoning paw (right), the coin held at the chest (left), feet, a curling tail with an orange tip
    add(sph(1.0, (0.062, y0 + 0.12, 0.03), sc=(0.022, 0.052, 0.024), K=8, J=4, rz=-0.25), lambda p, n: fur(p, n), 'paws')
    add(sph(0.026, (0.072, y0 + 0.178, 0.04), sc=(1, 1.05, 0.85), K=8, J=4), lambda p, n: fur(p, n), 'paws')
    add(dot(0.01, (0.072, y0 + 0.174, 0.061), sc=(1.1, 1, 0.4), K=6), flat('#ffb0c0'), 'paws')
    for k in range(3): add(sph(0.005, (0.072 + (k - 1) * 0.01, y0 + 0.19, 0.06), K=4, J=2), flat('#ffb0c0'), 'paws')
    add(sph(1.0, (-0.05, y0 + 0.07, 0.05), sc=(0.022, 0.04, 0.024), K=8, J=4, rz=0.5, rx=0.4), lambda p, n: fur(p, n), 'paws')
    with at((-0.045, y0 + 0.07, 0.075), rx=PI / 2 - 0.25, rz=0.15):
        add(gl_lathe([(0.0, 0.0), (0.04, 0.0), (0.042, 0.006), (0.036, 0.011), (0.0, 0.01)], 12, sx=0.66, colfn=lambda c, fn: '#ffe08a' if math.hypot(c.x / 0.66, c.y) < 0.035 and c.z > 0.009 else GOLD), fsh(0.14, 0.24, sheen=0.5), 'coin')
    for sx in (-1, 1): add(sph(1.0, (sx * 0.034, y0 + 0.016, 0.054), sc=(0.022, 0.016, 0.026), K=8, J=3), lambda p, n: fur(p, n), 'feet')
    tl = [(0.06, y0 + 0.015, -0.05), (0.085, y0 + 0.02, -0.01), (0.088, y0 + 0.03, 0.03), (0.075, y0 + 0.045, 0.055)]
    add(gtube(catmull(tl, 6), lambda s: 0.014 - 0.004 * s, K=6), lambda p, n: fur(p, n, lambda q: q.z > y0 + 0.035), 'tail')

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
    print('FS %s tris %d' % (name, A.tris()))
    print('FS %s parts %s' % (name, dict(sorted(A.count.items(), key=lambda kv: -kv[1]))))
    print('FS %s lowest %s' % (name, sorted(((round(v, 3), k) for k, v in A.low.items()))[:3]))
    print('FS %s size x %.3f (%.3f..%.3f)  game y %.3f (%.3f..%.3f)  game z %.3f (%.3f..%.3f)' % (
        name, hi.x - lo.x, lo.x, hi.x, hi.z - lo.z, lo.z, hi.z, hi.y - lo.y, -hi.y, -lo.y))
    for ob in obs: print('FS %s check %s %s mats %s' % (name, ob.name, check(ob), [m.name for m in ob.data.materials]))
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, name + '.blend'))
    for o in bpy.context.scene.objects: o.select_set(o.type == 'MESH')
    out = os.path.join(MODELS, name + '.glb')
    kw = dict(filepath=out, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
              export_attributes=True, export_lights=False, export_cameras=False, export_animations=False,
              export_normals=True, export_texcoords=True, export_materials='EXPORT')
    try: bpy.ops.export_scene.gltf(export_vertex_color='ACTIVE', **kw)
    except TypeError as e:
        print('FS export_vertex_color rejected:', e); bpy.ops.export_scene.gltf(export_colors=True, **kw)
    print('FS wrote', out)

PIECES = {'wallShelf': (build_wallShelf, True), 'plateRack': (build_plateRack, True), 'cuckooClock': (build_cuckooClock, True),
          'packPhoto': (build_packPhoto, True), 'hangingScroll': (build_hangingScroll, True), 'kamidana': (build_kamidana, True),
          'mapleWreath': (build_mapleWreath, True), 'glassFloats': (build_glassFloats, True), 'onsenNoren': (build_onsenNoren, True),
          'teaSet': (build_teaSet, False),
          'flowerVase': (build_flowerVase, False),
          'bookStack': (build_bookStack, False),
          'fruitBowl': (build_fruitBowl, False),
          'succulent': (build_succulent, False),
          'paintPots': (build_paintPots, False),
          'incenseBurner': (build_incenseBurner, False),
          'pandaPlush': (build_pandaPlush, False),
          'frogFountain': (build_frogFountain, False),
          'daruma': (build_daruma, False),
          'goldfishBowl': (build_goldfishBowl, False),
          'luckyCat': (build_luckyCat, False)}
for pid in (list(PIECES) if PIECE == 'all' else PIECE.split(',')):
    fn, wall = PIECES[pid]
    fn()
    finish(A, seed=len(pid), wall=wall)
    export_piece(A, 'furn-' + pid)
