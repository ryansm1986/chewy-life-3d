# PAWHAVEN: Tanu's trinket stall and the home mailbox (task hollow-ext), built in Blender by script.
#   blender --background --factory-startup --python build_hollow-ext.py -- --piece trinketStall|mailbox|all
# writes D:/projects/chewy-life-3d/public/models/ext-<piece>.glb (and ext-<piece>.blend beside this script).
# Deterministic: seeded maths only; a re-run reproduces every GLB exactly.
# Frame: each piece is built in its kit template's own local frame (src/home/stallModel.js trinketStallTemplate,
# src/home/exteriorModels.js mailboxTemplate): 1 unit = 1 m, base at the origin, front = game +z = Blender -Y. The layout
# code is written in the kit's game frame (x right, y up, z front) and mapped to Blender (x, -z, y).
# The core kit (mesh accumulator, rounded boxes, lathes, tubes, puffy reliefs, icing drapes, painted vertex colours `Col`)
# is copied from the furniture builders (tools/blender/work/codex/furn-small), which took it from the Hollow landmarks.
# Materials by name choose the game's bucket: body, leaf, cloth, glow.
#   cloth: Blender v = 1 - hang, so glTF uv.y = 1 at the hung top edge (the game's cloth wind bends from the top);
#   glow: Blender uv = (flicker, 1 - tint), so glTF uv = (flicker, tint) for the kit glow shader.
import bpy, bmesh, math, os, sys, random
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..', '..'))
MODELS = os.path.join(REPO, 'public', 'models')
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
PIECE = argv[argv.index('--piece') + 1] if '--piece' in argv else 'all'
print('HX build pid', os.getpid())
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
    A.add(OBJ, mat, t, col, tag, uvf); return t

MAPLE = [(0, 1.0), (0.12, 0.62), (0.42, 0.78), (0.3, 0.42), (0.5, 0.3), (0.16, 0.2), (0.06, 0.0), (-0.06, 0.0), (-0.16, 0.2), (-0.5, 0.3), (-0.3, 0.42), (-0.42, 0.78), (-0.12, 0.62)]
def star_ol(n=5, r0=1.0, r1=0.45, a0=PI / 2):
    return [((r0 if k % 2 == 0 else r1) * math.cos(a0 + k * PI / n), (r0 if k % 2 == 0 else r1) * math.sin(a0 + k * PI / n)) for k in range(2 * n)]
def circ_ol(n, rx, ry=None, a0=0.0):
    ry = ry or rx
    return [(rx * math.cos(a0 + TAU * k / n), ry * math.sin(a0 + TAU * k / n)) for k in range(n)]

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

A = None
def angle_k(cen, K, th0):
    """the lathe step index of a face centroid (local frame)"""
    th = math.atan2(cen.y, cen.x)
    return int(math.floor(((th - th0) / (TAU / K)) % K + 1e-6)) % K

# ================================================================== hollow-ext additions
OBJ = 'piece'
def new_asset(name):
    global A, OBJ
    A = FAsset(); F.m = Matrix.Identity(4); F.st = []; OBJ = name
    return A
def add(t, col, tag='misc', mat='body', uvf=None):
    A.add(OBJ, mat, t, col, tag, uvf); return t
def cloth_uv(yb, yt):
    """Blender v = 1 - hang (glTF flips v), so the game's uv.y = 1 at the hung top yt and 0 at the free bottom yb"""
    return lambda p: (p.x * 2.0, 1.0 - clamp((p.z - yb) / (yt - yb)))
def glow_uv(flick, tint):
    return lambda p: (flick, 1.0 - tint)
def CL(t, col, tag, yb, yt): return add(t, col, tag, 'cloth', cloth_uv(yb, yt))
def GL(t, col, tag, flick=1.0, tint=0.55): return add(t, col, tag, 'glow', glow_uv(flick, tint))
def LF(t, col, tag='leaves'): return add(t, col, tag, 'leaf')

class push_m:
    """push a raw game-frame matrix on the transform stack"""
    def __init__(self, Mg): self.Mg = Mg
    def __enter__(self): F.st.append(F.m.copy()); F.m = F.m @ GM @ self.Mg @ GMi; return F
    def __exit__(self, *e): F.pop()

def beam_ab(a, b, w, h=None, c=0.014):
    """a chamfered beam from game point a to b"""
    a, b = Vector(a), Vector(b); d = b - a; L = d.length
    q = Vector((0, 0, 1)).rotation_difference(d.normalized())
    with push_m(Matrix.Translation((a + b) / 2) @ q.to_matrix().to_4x4()):
        return beam(w, h or w, L, c=c)

def bezpts(p0, p1, p2, p3, k):
    out = []
    for i in range(1, k + 1):
        t = i / k; a = (1 - t) ** 3; b = 3 * (1 - t) ** 2 * t; c = 3 * (1 - t) * t * t; d = t ** 3
        out.append((a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]))
    return out
def tanu_ol(n=6):
    """Tanu's leaf (the kit's tanuLeaf shape): a broad leaf, base at (0, -0.5), tip at (0, 0.5)"""
    return bezpts((0, -0.5), (0.42, -0.36), (0.46, 0.18), (0, 0.5), n) + bezpts((0, 0.5), (-0.46, 0.18), (-0.42, -0.36), (0, -0.5), n)[:-1]

def grain(base, along='x', f=40, amt=0.06, top=0.16, bot=0.28, seed=0, ao_z=None, ao_k=0.22, ao_h=0.14):
    """planed wood: a soft grain across `along` (game axis), lit tops, darker undersides"""
    ai = 'xyz'.index(along)
    def fn(p, n):
        g = (p.x, p.z, -p.y)
        u = g[ai]; v = sum(g[i] * (1.0 if i == (ai + 1) % 3 else 0.6) for i in range(3) if i != ai)
        k = 1 + amt * math.sin(v * f + math.sin(u * 7) * 1.5 + (vnoise(p, 4, seed) - 0.5) * 2.8)
        c = mul(base, k)
        c = mul(c, 1 + top * n.z) if n.z >= 0 else mul(c, 1 + bot * n.z)
        if ao_z is not None: c = mul(c, 1 - ao_k * (1 - smooth(0.0, ao_h, p.z - ao_z)))
        return c
    return fn

# ---------------------------------------------------------------- stones and moss icing
STONE = '#b8acb6'; STONE_HI = '#ded3da'; MOSS_L = '#a8d46a'; MOSS_D = '#5c9a46'
def stone_col(seed=0, base=STONE, ao_y=0.0):
    def f(p, n):
        c = mix(mul(base, 0.78), mix(base, STONE_HI, 0.55), clamp(n.z * 0.6 + 0.38))
        c = mul(c, 0.93 + 0.14 * vnoise(p, 9, seed))
        return mul(c, 1 - 0.22 * (1 - smooth(0.0, 0.05, p.z - ao_y)))
    return f
def moss_col(seed=0):
    def f(p, n):
        c = mix(MOSS_D, MOSS_L, clamp(n.z * 0.85 + 0.1) ** 1.3)
        return mul(c, 0.88 + 0.24 * vnoise(p, 22, seed))
    return f

def stone_F(cx, cz, y0, ra, e, H, sx=1.0, sz=1.0, seed=0, dome=0.012, flare=0.012, lump=0.07):
    """a rounded stone (game centre (cx, y0, cz)) as a surface F(th, h), h = the arc length from the top centre
    (a domed top out to ra, a round edge of radius e, a side flaring a little to the ground)"""
    ph = seed * 1.31
    def L(th): return 1 + lump * math.sin(3 * th + ph) + lump * 0.55 * math.sin(5 * th + 2 * ph)
    Lt = ra + e * PI / 2 + (H - e)
    def F_(th, h):
        h = max(0.0, min(h, Lt))
        if h <= ra: r, z = h, H + dome * (1 - (h / ra) ** 2)
        elif h - ra <= e * PI / 2:
            f = (h - ra) / e; r, z = ra + e * math.sin(f), H - e + e * math.cos(f)
        else:
            z = max(0.0, H - e - (h - ra - e * PI / 2)); r = ra + e + flare * (1 - z / (H - e)) ** 2
        l = L(th)
        return F.W((cx + math.cos(th) * r * sx * l, y0 + z, cz + math.sin(th) * r * sz * l))
    return F_, Lt

def stone(cx, cz, y0, ra, e, H, K=10, col=None, tag='stone', **kw):
    F_, Lt = stone_F(cx, cz, y0, ra, e, H, **kw)
    hs = [ra * 0.55, ra, ra + e * PI / 4, ra + e * PI / 2, ra + e * PI / 2 + (H - e) * 0.6, Lt]
    t = Tmp(); ths = [TAU * k / K + 0.3 for k in range(K)]
    rings = [[F_(th, h) for th in ths] for h in hs]
    cs = [sum(r, Vector()) / K for r in rings]
    ring_surface(t, rings, cs, pole0=F_(0.0, 0.0), pole1=F.W((cx, y0, cz)))
    add(t, col, tag)
    return F_, Lt

def moss_on(F_, cx, cz, y0, H, cover, drips, thick=0.015, J=2, n_th=12, seed=0, tag='moss', offs=(-0.8, -0.35, 0.0, 0.35, 0.8)):
    """an icing cap of moss over a stone surface F_: covers h < cover(th) plus rounded drips (th, length, half-width)"""
    he = drip_he(lambda th: cover + 0.008 * math.sin(4 * th + seed), drips)
    ths = drip_angles(n_th, drips, offs=offs)
    t = drape(F_, he, lambda th, s: thick * (1 - 0.3 * s), ths, J, F.W((cx, y0 + H * 0.45, cz)))
    add(t, moss_col(seed), tag)

def rope_band(cx, cz, y, hw, turns=2, pitch=0.032, K=4, n_per=8, r=0.015, ph=0.0):
    """rope wound round a square post (half-width hw) at height y: a rounded-square helix"""
    pts = []; R = hw + r * 0.75
    for i in range(turns * n_per + 1):
        a = TAU * i / n_per + ph; c, s = math.cos(a), math.sin(a)
        rr = R / ((abs(c) ** 4 + abs(s) ** 4) ** 0.25)
        pts.append((cx + c * rr, y + pitch * i / n_per, cz + s * rr))
    return gtube(pts, r, K=K, caps=True)
def rope_col(p, n):
    c = mix('#b8945a', '#f0d8a0', clamp(n.z * 0.6 + 0.45))
    return mul(c, 0.94 + 0.12 * math.sin((p.x + p.y) * 160 + p.z * 90))

# ================================================================== Tanu's trinket stall
LEAF = '#8cc674'; LEAF_D = '#5e9e50'; LEAF_L = '#c4ec9a'; CRM = '#fff2da'; BROWN = '#8a5a3a'
POST = '#8a5c3c'; DECK = '#cf9058'; SOLE = '#5a3e2e'; WOODL = '#e2b988'; WOODM = '#c98f5e'
RED = '#e2483c'; RED_D = '#b8302a'; DARK = '#2e2428'; BRASS_C = '#d4a050'
DY = 0.08                              # the deck top
PX, PZF, PZB = 1.22, 0.64, -0.66       # post centres
YF, YK = 2.0, 2.29                     # the front and back beam centres
AX, AZF, AZB = 1.318, 0.774, -0.772     # the awning's half-width and its front / back edges
AYF, AYB = 2.075, 2.346                # its underside at the front and back edges
VBEAM = (PZF - AZB) / (AZF - AZB)
NUP = Vector((0, AZF - AZB, -(AYF - AYB))).normalized()      # the awning's up normal (game frame)

def aw(x, v):
    """the awning's underside: v = 0 at the back edge .. 1 at the front; a soft sag between the beams, a droop past
    the front beam"""
    droop = (v - VBEAM) * 0.12 if v > VBEAM else 0.0
    sag = 0.018 * math.sin(PI * min(v / VBEAM, 1.0))
    return Vector((x, AYB + (AYF - AYB) * v - droop - sag, AZB + (AZF - AZB) * v))

def leafc(lo, hi):
    """leaf relief colours: pale at the raised centre, deeper at the rim"""
    return lambda p, n: mix(lo, hi, clamp(n.z * 0.3 - n.y * 0.7 + 0.15))

def leaf_emblem(pos, sc, rz, T, lo, hi, vein, mat='body', uvf=None, tag='emblem', stalk=True):
    """Tanu's leaf as a chunky relief (front +z): a raised leaf, a pale midrib and a curled stalk"""
    with at(pos, rz=rz):
        A.add(OBJ, mat, fan_shape(tanu_ol(6), (0, 0, 0), sc=sc, T=T, centre=(0.0, -0.05)), leafc(lo, hi), tag, uvf)
        t = puffy([(-0.045 * sc, -0.36 * sc), (0.045 * sc, -0.36 * sc), (0.03 * sc, 0.36 * sc), (-0.03 * sc, 0.36 * sc)], T * 0.45, bev=T * 0.2, z0=T * 0.55)
        A.add(OBJ, mat, t, flat(vein), tag, uvf)
        if stalk:
            t = gtube([(0.0, -0.46 * sc, T * 0.3), (0.12 * sc, -0.6 * sc, T * 0.3), (0.05 * sc, -0.72 * sc, T * 0.3)], 0.05 * sc, K=4)
            A.add(OBJ, mat, t, flat(lo), tag, uvf)

def build_trinketStall():
    new_asset('ext-trinketStall')
    rng = random.Random(7310)
    # ---------------------------------------------------------------- the deck: planks with gaps over a dark sole
    add(box(2.52, 0.04, 1.48, (0, 0.02, 0), r=0.015), paint(SOLE, top=0.05, bot=0.3), 'deck')
    for i in range(6):
        z = -0.635 + i * 0.254; tone = 0.9 + 0.16 * rng.random()
        add(beam(2.6, 0.06, 0.236, (rng.uniform(-0.012, 0.012), 0.05 + rng.uniform(-0.004, 0.003), z), c=0.02, ry=rng.uniform(-0.008, 0.008)),
            grain(mul(DECK, tone), 'x', 34, amt=0.07, seed=i), 'deck')
    # ---------------------------------------------------------------- mossy stone footings, posts, beams, braces
    for sx in (-1, 1):
        for zi, (z, top) in enumerate(((PZF, YF + 0.05), (PZB, YK + 0.05))):
            sd = 7 + sx + zi * 3
            F_, Lt = stone(sx * PX, z, DY, ra=0.07, e=0.045, H=0.12, K=9 if zi == 0 else 8, col=stone_col(sd, ao_y=DY), seed=sd, sx=1.0, sz=0.94, dome=0.008, flare=0.014, lump=0.06)
            if zi == 0:
                moss_on(F_, sx * PX, z, DY, 0.12, 0.07 + 0.045 * PI / 2 * 0.55,
                        [(PI / 2 + sx * 0.5, 0.05, 0.42), (PI / 2 - sx * 0.6, 0.032, 0.32), (PI * (1 if sx > 0 else 0) + 0.2, 0.04, 0.36)], J=3, n_th=9, seed=sd, offs=(-0.7, 0.0, 0.7))
            else:
                moss_on(F_, sx * PX, z, DY, 0.12, 0.07 + 0.045 * PI / 2 * 0.3, [(PI / 2, 0.035, 0.4)], J=2, n_th=7, seed=sd, offs=(-0.6, 0.0, 0.6))
            y0 = DY + 0.12
            add(beam(0.13, top - y0, 0.13, (sx * PX, (y0 + top) / 2, z), c=0.026), grain(POST, 'y', 50, seed=sd, ao_z=y0, ao_k=0.25), 'posts')
            if zi == 0:
                add(rope_band(sx * PX, z, y0 + 0.13, 0.065, turns=2, n_per=5, pitch=0.04, ph=sx), rope_col, 'rope')
                add(box(0.15, 0.05, 0.15, (sx * PX, YF - 0.12, z), r=0.0), lac(BRASS_C), 'brass')
        # the side beam (front to back, along the slope), and a knee brace from the front post up to it
        add(beam_ab((sx * PX, YF, PZF + 0.05), (sx * PX, YK, PZB - 0.05), 0.1, c=0.02), grain(POST, 'z', 50, seed=3), 'beams')
        add(beam_ab((sx * PX, YF - 0.34, PZF - 0.03), (sx * PX, YF + 0.02, PZF - 0.38), 0.065, c=0.014), grain(POST, 'y', 50, seed=4), 'beams')
        add(box(0.03, 0.115, 0.115, (sx * (PX + 0.105), YF, PZF), r=0.0), lac(BRASS_C), 'brass')     # brass beam-end caps
    add(beam(2.58, 0.11, 0.11, (0, YF, PZF), c=0.022), grain(POST, 'x', 50, seed=5), 'beams')
    add(beam(2.58, 0.11, 0.11, (0, YK, PZB), c=0.022), grain(POST, 'x', 50, seed=6), 'beams')

    # ---------------------------------------------------------------- the awning: twelve quilted stripes
    NS = 12; sw = 2 * AX / NS
    VS = [0.0, 0.5, VBEAM, 1.0]
    for s in range(NS):
        x0 = -AX + s * sw + 0.001; xs = [x0, x0 + sw / 2 - 0.001, x0 + sw - 0.002]
        c0 = CRM if s % 2 else LEAF
        t = Tmp(); t.c = []
        def V(p, c, t=t): t.c.append(srgb(c)); return t.vert(F.W(tuple(p)))
        top, bot = [], []
        for v in VS:
            env = 0.6 + 0.4 * math.sin(PI * clamp(v / VBEAM))
            rowt, rowb = [], []
            for i, x in enumerate(xs):
                mid = i == 1
                lift = 0.014 + (0.026 * env if mid else 0.0)
                tone = (1.05 if mid else 0.84) * (0.96 if v > VBEAM else 1.0) * (0.95 + 0.05 * v)
                rowt.append(V(aw(x, v) + NUP * lift, mix(mul(c0, tone), '#fffaf0', 0.1 if mid else 0.0)))
                rowb.append(V(aw(x, v) - NUP * 0.004, mul(c0, 0.7)))
            top.append(rowt); bot.append(rowb)
        up = F.N(tuple(NUP)); fz = F.N((0, 0, 1)); fx = F.N((1, 0, 0))
        for j in range(len(VS) - 1):
            for i in range(2):
                t.face([top[j][i], top[j][i + 1], top[j + 1][i + 1], top[j + 1][i]], up)
                t.face([bot[j][i], bot[j][i + 1], bot[j + 1][i + 1], bot[j + 1][i]], -up)
            t.face([top[j][0], top[j + 1][0], bot[j + 1][0], bot[j][0]], -fx)
            t.face([top[j][2], top[j + 1][2], bot[j + 1][2], bot[j][2]], fx)
        for i in range(2):
            t.face([top[0][i], top[0][i + 1], bot[0][i + 1], bot[0][i]], -fz)
            t.face([top[-1][i], top[-1][i + 1], bot[-1][i + 1], bot[-1][i]], fz)
        add(t, fsh(0.06, 0.15), 'awning')
    # piped hems: the front edge, the sides, the back
    hem_c = grain(BROWN, 'x', 90, amt=0.05)
    fe = aw(0, 1.0) + NUP * 0.018
    add(gtube([(-AX + 0.004, fe.y, fe.z + 0.002), (AX - 0.004, fe.y, fe.z + 0.002)], 0.03, K=6), hem_c, 'hem')
    for sx in (-1, 1):
        add(gtube([tuple(aw(sx * (AX + 0.004), v) + NUP * 0.012) for v in VS], 0.018, K=4), hem_c, 'hem')
    be = aw(0, 0.0) + NUP * 0.016
    add(gtube([(-AX, be.y, be.z + 0.004), (AX, be.y, be.z + 0.004)], 0.026, K=5), hem_c, 'hem')
    # the scalloped valance (cloth), every cream flap with Tanu's leaf
    yV = fe.y - 0.024; zV = fe.z + 0.006; r = sw / 2 - 0.004
    uv = cloth_uv(yV - 0.215, yV)
    for s in range(NS):
        xc = -AX + sw * (s + 0.5)
        ol = [(-r, 0.0), (r, 0.0), (r, -0.085)] + [(r * math.cos(-a), -0.085 + r * math.sin(-a)) for a in [PI * k / 8 for k in range(1, 8)]] + [(-r, -0.085)]
        c0 = CRM if s % 2 else LEAF
        with at((xc, yV, zV)):
            t = fan_shape(ol, (0, 0, 0.008), T=0.016, Tb=0.008, centre=(0.0, -0.075))
            add(t, lambda p, n, c0=c0: mul(c0, (0.88 + 0.16 * clamp(n.z * 0.4 - n.y * 0.6 + 0.3)) * (0.9 + 0.1 * smooth(yV - 0.2, yV - 0.05, p.z))), 'valance', 'cloth', uv)
            if s % 2:
                with at((0.0, -0.098, 0.02), rz=0.45):
                    add(fan_shape(tanu_ol(6), (0, 0, 0), sc=0.135, T=0.009, centre=(0.0, -0.05)), leafc(LEAF_D, '#8ccc6c'), 'valance', 'cloth', uv)
                    add(fan_shape([(-0.006, -0.05), (0.006, -0.05), (0.004, 0.05), (-0.004, 0.05)], (0, 0, 0.007), T=0.003), flat(LEAF_L), 'valance', 'cloth', uv)

    # ---------------------------------------------------------------- the back shelf of tiny furniture
    SX, SZ, SD, SH, STOP = 1.07, -0.45, 0.34, [0.52, 0.94, 1.36], 1.8
    for sx in (-1, 1):
        add(beam(0.07, STOP - DY, SD, (sx * SX, (STOP + DY) / 2, SZ), c=0.015), grain(WOODM, 'y', 50, seed=11), 'shelf')
    nb = 8; bw = (2 * SX - 0.07) / nb
    for i in range(nb):
        x = -SX + 0.035 + bw * (i + 0.5); tone = 0.95 + 0.08 * rng.random()
        add(box(bw - 0.008, STOP - DY - 0.04, 0.026, (x, (STOP + DY) / 2, SZ - SD / 2 + 0.013), r=0), grain(mul('#f2dfba', tone), 'y', 30, amt=0.03, top=0.0, bot=0.0), 'shelf')
    for y in SH:
        add(beam(2 * SX - 0.04, 0.04, SD, (0, y - 0.02, SZ), c=0.01), grain(WOODL, 'x', 50, seed=12), 'shelf')
        add(box(2 * SX - 0.06, 0.022, 0.012, (0, y - 0.03, SZ + SD / 2 + 0.006), r=0), flat(LEAF_D), 'shelf')
    add(beam(2 * SX + 0.12, 0.06, SD + 0.08, (0, STOP + 0.02, SZ), c=0.016), grain(POST, 'x', 50, seed=13), 'shelf')
    add(box(2 * SX + 0.08, 0.024, 0.012, (0, STOP + 0.012, SZ + SD / 2 + 0.046), r=0), flat(LEAF), 'shelf')
    add(beam(2 * SX, 0.06, SD, (0, DY + 0.03, SZ), c=0.012), grain(POST, 'x', 50, seed=14), 'shelf')
    zM = SZ + 0.03
    def place(fn, x, y, ry=0.0, s=1.0, z=zM):
        with at((x, y, z), ry=ry, s=s): fn()
    place(w_chair, -0.8, SH[0], 0.3); place(w_tansu, -0.4, SH[0], -0.1); place(w_cushions, 0.02, SH[0], 0.1)
    place(lambda: w_daruma(RED), 0.42, SH[0], -0.2, 1.15); place(lambda: w_kokeshi(RED), 0.8, SH[0], 0.2)
    place(w_andon, -0.8, SH[1], 0.4); place(w_teaset, -0.37, SH[1], 0.2); place(w_vase, 0.04, SH[1])
    place(w_bonsai, 0.44, SH[1], -0.3); place(w_minilantern, 0.82, SH[1])
    place(w_screen, -0.74, SH[2], 0.2); place(w_books, -0.4, SH[2], 0.15); place(w_books, 0.7, SH[2], -0.25)
    for x, i in ((-0.62, 0), (-0.2, 0), (0.62, 0), (0.24, 1)):
        price_tag(x, SH[i] - 0.042, SZ + SD / 2 + 0.014, '#fff6c8' if i == 1 else '#fffaf0')

    # ---------------------------------------------------------------- the counter: planks, Tanu's leaf crest, a thick top
    CW, CZ0, CZ1, CT = 0.86, 0.22, 0.58, 0.8
    zm = (CZ0 + CZ1) / 2; Hp = CT - DY - 0.1
    add(box(2 * CW - 0.02, CT - DY - 0.06, CZ1 - CZ0 - 0.03, (0, DY + 0.02 + (CT - DY - 0.06) / 2, zm - 0.015), r=0), flat('#6a4430'), 'counter')
    for i in range(8):
        x = -CW + (i + 0.5) * (2 * CW / 8); tone = 0.9 + 0.16 * rng.random()
        add(beam(2 * CW / 8 - 0.012, Hp, 0.036, (x, DY + 0.06 + Hp / 2, CZ1 - 0.016), c=0.01), grain(mul(WOODM, tone), 'y', 44, amt=0.07, seed=20 + i, ao_z=DY + 0.06, ao_k=0.2), 'counter')
    for sx in (-1, 1):
        add(beam(0.036, Hp, CZ1 - CZ0, (sx * (CW - 0.018), DY + 0.06 + Hp / 2, zm), c=0.01), grain(WOODM, 'y', 44, seed=30), 'counter')
    add(rb(2 * CW + 0.04, 0.07, CZ1 - CZ0 + 0.04, (0, DY + 0.035, zm), r=0.015), paint('#5e3e2c', top=0.1, bot=0.2), 'counter')
    add(rb(2 * CW + 0.12, 0.065, CZ1 - CZ0 + 0.14, (0, CT - 0.0325, zm + 0.03), r=0.028), grain(WOODL, 'x', 40, seed=31), 'counter')
    add(box(2 * CW + 0.1, 0.024, 0.012, (0, CT - 0.075, CZ1 + 0.094), r=0), flat(LEAF_D), 'counter')
    # the crest: a cream disc in a brown rope ring, Tanu's leaf in relief
    with at((0, DY + 0.36, CZ1 + 0.002)):
        add(cyl(0.15, 0.15, 0.018, (0, 0, 0.009), K=16, rx=PI / 2), lambda p, n: CRM if n.y < -0.6 else '#e8d4ac', 'crest')
        add(gloopc([(0.152 * math.cos(TAU * k / 16), 0.152 * math.sin(TAU * k / 16), 0.02) for k in range(16)], 0.016, K=3), grain(BROWN, 'x', 120), 'crest')
        leaf_emblem((0.0, 0.01, 0.018), 0.21, 0.5, 0.014, LEAF_D, '#9ad476', LEAF_L, tag='crest')
    # on the counter: the lucky cat on its cushion, a cushion stack, a tray of daruma
    with at((0.52, CT, 0.42), ry=-0.35): w_luckycat()
    with at((-0.5, CT, 0.42), ry=0.2, s=1.1): w_cushions()
    with at((0.0, CT, 0.46), ry=-0.1):
        add(rb(0.24, 0.022, 0.14, (0, 0.011, 0), r=0.008), grain('#a86e42', 'x', 60), 'tray')
        with at((-0.058, 0.022, 0)): w_daruma(RED, K=7)
        with at((0.064, 0.022, 0), s=0.85): w_daruma('#f4c04a', K=7)

    # ---------------------------------------------------------------- the hanging sign: Tanu's face (no text)
    sy, sz = 1.62, PZF + 0.03
    for sx in (-1, 1):
        add(gtube([(sx * 0.36, YF - 0.05, sz - 0.01), (sx * 0.36, sy + 0.15, sz)], 0.01, K=4, caps=False), rope_col, 'sign')
        add(sph(0.02, (sx * 0.36, sy + 0.155, sz), K=6, J=3), lac(BRASS_C), 'sign')
    add(rb(0.98, 0.3, 0.05, (0, sy, sz), r=0.02), grain(POST, 'x', 70), 'sign')
    add(rb(0.92, 0.252, 0.02, (0, sy, sz + 0.026), r=0.012), paint(LEAF_D, top=0.15, bot=0.2), 'sign')
    add(rb(0.86, 0.196, 0.02, (0, sy, sz + 0.036), r=0.01), grain('#fbf0d6', 'x', 40, amt=0.025), 'sign')
    zf = sz + 0.046
    with at((0, sy - 0.016, zf), s=1.22):
        for sx in (-1, 1):       # ears
            with at((sx * 0.062, 0.066, 0)):
                add(puffy(circ_ol(7, 0.03), 0.012, bev=0.005), paint('#7a4e34', top=0.2), 'tanu')
                add(dot(0.016, (0, -0.002, 0.012), sc=(1, 1, 0.3), K=6), flat('#e8a890'), 'tanu')
        add(puffy(circ_ol(12, 0.088, 0.076), 0.018, bev=0.008), lambda p, n: mix('#9a6a44', '#c89466', clamp(n.z * 0.3 - n.y * 0.7 + 0.2)), 'tanu')
        for sx in (-1, 1):       # the mask, eyes with a shine, blush
            add(dot(0.03, (sx * 0.035, 0.008, 0.018), sc=(1.0, 0.72, 0.3), K=7, rz=-sx * 0.45), flat('#4a3428'), 'tanu')
            add(dot(0.011, (sx * 0.031, 0.012, 0.026), sc=(1, 1, 0.4), K=6), flat('#2a2024'), 'tanu')
            add(dot(0.0045, (sx * 0.028, 0.017, 0.03), sc=(1, 1, 0.5), K=4), flat('#fff6ea'), 'tanu')
            add(dot(0.012, (sx * 0.06, -0.026, 0.02), sc=(1.2, 0.8, 0.3), K=6), flat('#f0a0a0'), 'tanu')
        add(dot(0.042, (0, -0.03, 0.017), sc=(1.0, 0.72, 0.32), K=10), lambda p, n: mix('#f4e2c8', '#fff4e4', clamp(n.z * 0.5 - n.y * 0.5)), 'tanu')
        add(dot(0.013, (0, -0.016, 0.03), sc=(1.25, 0.9, 0.6), K=6), lac('#2a2024', hi='#6a5a60'), 'tanu')
        leaf_emblem((0.018, 0.098, 0.006), 0.085, -0.45, 0.009, LEAF_D, '#9ad476', LEAF_L, tag='tanu')
    for sx in (-1, 1):           # koban coins either side
        with at((sx * 0.26, sy - 0.004, zf), s=1.15):
            add(dot(0.05, (0, 0, 0.0), sc=(0.68, 1.0, 0.22), K=10), lac('#f0b840', hi='#fff0a8', lo='#b88a28'), 'coins')
            add(dot(0.036, (0, 0, 0.008), sc=(0.64, 1.0, 0.2), K=8), lac('#f8cc58', hi='#fff4c0'), 'coins')
    leaf_emblem((0.45, sy + 0.12, sz + 0.03), 0.12, -0.7, 0.01, LEAF_D, LEAF, LEAF_L, tag='sign')

    # ---------------------------------------------------------------- two red paper lanterns (glow; the kit's lights)
    for sx in (-1, 1):
        x, z, top, R, H = sx * 1.0, PZF + 0.03, 1.915, 0.135, 0.3       # (centre y 1.70: the kit's night light)
        yb = top - 0.08 - H
        add(gtube([(x, YF - 0.05, z - 0.02), (x, top - 0.03, z)], 0.007, K=3, caps=False), flat(DARK), 'lantern')
        prof = [(0.0, yb + 0.004)] + [(R * (0.6 + 0.4 * math.sin(k / 8 * PI)) * (1.0 if k % 2 else 0.955), yb + k / 8 * H) for k in range(9)] + [(0.0, yb + H - 0.004)]
        def lc(p, n, yb=yb, H=H):
            t = abs((p.z - yb) / H - 0.5)
            red = mix('#e2483c', '#b8302a', clamp(t * 2.4 - 0.7))
            return mix('#fff0d8', red, clamp(t / 0.1))
        with at((x, 0, z), ry=sx * 0.15):
            GL(glathe(prof, K=10), lc, 'lantern', flick=1.0, tint=0.55)
            cR = R * 0.6 + 0.008
            add(glathe([(0.0, top - 0.085), (cR, top - 0.085), (cR - 0.006, top - 0.034), (0.0, top - 0.032)], K=8), lac(DARK, hi='#5a4a50'), 'lantern')
            add(glathe([(0.0, yb - 0.03), (cR - 0.008, yb - 0.03), (cR, yb + 0.006), (0.0, yb + 0.006)], K=8), lac(DARK, hi='#5a4a50'), 'lantern')
            add(glathe([(0.0, yb - 0.13), (0.024, yb - 0.124), (0.018, yb - 0.085), (0.011, yb - 0.045), (0.0, yb - 0.04)], K=6), soft('#e2483c'), 'lantern')
            add(cyl(0.013, 0.013, 0.014, (0, yb - 0.048, 0), K=6), lac('#f4c04a'), 'lantern')
            with at((0, yb + H / 2, R + 0.002)):
                GL(fan_shape(tanu_ol(5), (0, 0, 0), sc=0.085, T=0.006, rz=0.5), flat(LEAF_D), 'lantern', flick=1.0, tint=0.3)

    # ---------------------------------------------------------------- a glass wind chime with its paper strip
    fy = 1.905
    with at((-0.66, fy, PZF + 0.03)):
        add(gtube([(0, YF - 0.05 - fy, -0.02), (0, -0.07, 0)], 0.004, K=3, caps=False), flat('#d8382e'), 'furin')
        add(glathe([(0.0, -0.066), (0.024, -0.07), (0.04, -0.094), (0.047, -0.13), (0.0, -0.126)], K=10),
            lambda p, n: mix('#a8d8ea', '#eefaff', clamp(n.z * 0.5 - n.y * 0.4 + 0.3)), 'furin')
        add(gtube([(0, -0.12, 0), (0, -0.17, 0)], 0.004, K=3, caps=False), flat('#d8382e'), 'furin')
        CL(box(0.044, 0.12, 0.008, (0, -0.232, 0), r=0), lambda p, n: mix('#fff2a8', '#ffd84a', smooth(fy - 0.2, fy - 0.29, p.z)), 'furin', fy - 0.3, fy - 0.17)

    # ---------------------------------------------------------------- crates at the front corners: rolled rugs, potted plants
    with at((-1.03, DY, 0.4), ry=0.12):
        crate(0.34, WOODL)
        for (x, z, h, c0, c1) in ((-0.062, -0.03, 0.5, '#e2483c', '#fff4de'), (0.066, 0.02, 0.42, '#34528a', '#8fd0ff')):
            with at((x, 0.03, z)): w_rug_up(h, c0, c1)
    with at((1.03, DY, 0.4), ry=-0.1):
        crate(0.34, '#d9a066')
        greens = ['#4f9a48', '#5aa84c', '#6ab854']
        with at((-0.075, 0.2, 0.045), ry=0.3):
            w_pot('#d4774e')
            for k in range(4):
                with at((0, 0.08, 0), ry=TAU * k / 4): LF(leafb(0.15, 0.05, (0, 0, 0), rx=0.75, heart=False), soft(greens[k % 3], 0.2, 0.3))
        with at((0.075, 0.2, 0.05), ry=-0.4):
            w_pot('#8fd0e8')
            for k in range(4):
                with at((0, 0.085, 0), ry=TAU * k / 4 + 0.3): LF(leafb(0.07, 0.06, (0, 0, 0), rx=1.2 + (k % 2) * 0.35), soft(greens[(k + 1) % 3], 0.2, 0.3))
        with at((0.0, 0.2, -0.08), ry=0.9):
            w_pot('#f4e6c8')
            for k in range(4):
                with at((0, 0.08, 0), ry=TAU * k / 4): LF(leafb(0.11, 0.032, (0, 0, 0), rx=0.45, heart=False), lambda p, n: mix('#6aa868', '#c8e4a0', clamp((p.z - 0.36) / 0.12)))
    finish(A, seed=7310, amt=0.004)

def crate(s, wd):
    h = s * 0.62
    add(box(s - 0.02, 0.025, s - 0.02, (0, 0.0125, 0), r=0), wood(mul(wd, 0.8)), 'crates')
    for k in range(4):
        with at((0, 0, 0), ry=k * PI / 2):
            for y in (h * 0.26, h * 0.74):
                add(box(s - 0.05, h * 0.4, 0.024, (0, y, s / 2 - 0.012), r=0), grain(mul(wd, 0.92 + 0.08 * (k % 2)), 'x', 60, amt=0.06), 'crates')
            add(box(0.042, h + 0.01, 0.042, (s / 2 - 0.021, h / 2 + 0.005, s / 2 - 0.021), r=0), wood(mul(wd, 0.78)), 'crates')

def w_pot(c):
    add(glathe([(0.0, 0.0), (0.045, 0.0), (0.06, 0.08), (0.056, 0.092), (0.0, 0.088)], K=7),
        lambda p, n: mul(c, 0.88 + 0.16 * clamp(n.z + 0.5)), 'pots')

def w_rug_up(h, c0, c1):
    """a rolled rug standing in a crate: stripes along its height, a swirl on the top"""
    st = 5
    prof = [(0.0, 0.0)] + [(0.048, h * k / st) for k in range(st + 1)] + [(0.0, h)]
    def cf(c, fn):
        if fn.z > 0.7: return c0 if angle_k(c, 6, PI / 6) % 2 else c1
        return c0 if int(c.z / (h / st)) % 2 else c1
    add(gl_lathe(prof, 6, colfn=cf), fsh(0.1, 0.2), 'rugs')

# ---------------------------------------------------------------- the wares (base at the origin, game frame)
def w_chair():
    for sx in (-1, 1):
        for sz in (-1, 1): add(cyl(0.016, 0.018, 0.13, (sx * 0.066, 0.065, sz * 0.058), K=4), wood(WOODM), 'wares')
    add(rb(0.175, 0.028, 0.16, (0, 0.14, 0), r=0.01), wood(WOODL), 'wares')
    add(rb(0.175, 0.13, 0.026, (0, 0.225, -0.068), r=0.012), wood(WOODL), 'wares')
    add(fan_shape(heart_poly(0.085, n=3), (0, 0.235, -0.054), T=0.008, Tb=0.002), flat('#ff8fa8'), 'wares')
    add(rb(0.15, 0.03, 0.13, (0, 0.168, 0.008), r=0.014), soft('#ffb0c8'), 'wares')

def w_tansu():
    add(rb(0.22, 0.165, 0.11, (0, 0.0825, 0), r=0.012), grain('#c47c48', 'x', 90), 'wares')
    add(rb(0.236, 0.018, 0.12, (0, 0.172, 0), r=0.007), wood('#a8643a'), 'wares')
    for (x, y, w, h) in ((-0.054, 0.124, 0.096, 0.042), (0.054, 0.124, 0.096, 0.042), (0.0, 0.074, 0.2, 0.042), (0.0, 0.026, 0.2, 0.036)):
        add(box(w, h, 0.008, (x, y, 0.057), r=0), wood('#dc9a60'), 'wares')
        add(sph(0.008, (x, y, 0.064), K=4, J=2), flat('#3e3a44'), 'wares')

def w_cushions():
    for i, (c, ry) in enumerate((('#ffaac4', 0.0), ('#8fd8b8', 0.3))):
        add(rb(0.19, 0.046, 0.19, (0.005 * (1 if i % 2 else -1), 0.023 + 0.044 * i, 0), r=0.021, ry=ry), soft(c, 0.18, 0.3), 'wares')
        add(sph(0.011, (0, 0.046 + 0.044 * i, 0), K=4, J=2), flat(mul(c, 0.7)), 'wares')

def w_daruma(c=RED, K=10):
    prof = [(0.0, 0.0), (0.036, 0.0), (0.052, 0.016), (0.058, 0.05), (0.052, 0.085), (0.034, 0.11), (0.0, 0.12)]
    add(glathe(prof, K=K), lac(c), 'wares')
    Rf = prof_r(prof[1:-1])
    add(dot(0.03, (0, 0.068, Rf(0.068) - 0.004), sc=(1, 0.86, 0.3), K=8), flat('#fff6ea'), 'wares')
    for sx in (-1, 1): add(dot(0.0075, (sx * 0.012, 0.072, Rf(0.068) + 0.005), sc=(1, 1, 0.5), K=4), flat('#2a2024'), 'wares')
    add(box(0.03, 0.007, 0.006, (0, 0.034, Rf(0.034) + 0.001), r=0), flat('#f4c04a'), 'wares')

def w_kokeshi(band=RED):
    def cf(c, fn):
        y = c.z
        if 0.02 < y < 0.032 or 0.06 < y < 0.072: return band
        if 0.04 < y < 0.052: return '#5aa84a'
        return '#f8e6c4'
    add(gl_lathe([(0.0, 0.0), (0.032, 0.0), (0.034, 0.012), (0.03, 0.026), (0.028, 0.036), (0.027, 0.046), (0.026, 0.056), (0.024, 0.066), (0.022, 0.078), (0.019, 0.098), (0.0, 0.1)], 6, colfn=cf), fsh(0.1, 0.2), 'wares')
    add(sph(0.036, (0, 0.13, 0), K=6, J=4), soft('#fff0dc', 0.1, 0.2), 'wares')
    add(sph(0.038, (0, 0.142, -0.008), sc=(1, 0.82, 1), K=7, J=3), lac('#2e2a30', hi='#5a5060'), 'wares')
    for sx in (-1, 1):
        add(dot(0.005, (sx * 0.012, 0.128, 0.034), sc=(1, 1, 0.5), K=4), flat('#2a2024'), 'wares')
        add(dot(0.007, (sx * 0.021, 0.118, 0.03), sc=(1.2, 0.8, 0.4), K=4, ry=sx * 0.5), flat('#ff9eb0'), 'wares')

def w_andon():
    add(rb(0.13, 0.016, 0.13, (0, 0.008, 0), r=0.005), wood('#7a4e36'), 'wares')
    for sx in (-1, 1):
        for sz in (-1, 1): add(box(0.018, 0.24, 0.018, (sx * 0.055, 0.128, sz * 0.055), r=0), wood('#7a4e36'), 'wares')
    GL(rb(0.098, 0.17, 0.098, (0, 0.118, 0), r=0.012), flat('#fff3d6'), 'andon', flick=0.5, tint=0.3)
    add(rb(0.142, 0.018, 0.142, (0, 0.252, 0), r=0.006), wood('#9a6a48'), 'wares')

def w_teaset():
    add(rb(0.22, 0.014, 0.14, (0, 0.007, 0), r=0.006), lac('#b8382e'), 'wares')
    with at((-0.04, 0.014, 0)):
        add(glathe([(0.0, 0.0), (0.03, 0.0), (0.046, 0.016), (0.05, 0.038), (0.043, 0.058), (0.02, 0.068), (0.0, 0.068)], K=8), lac('#9fd8c0', hi='#e0fff4'), 'wares')
        add(sph(0.01, (0, 0.074, 0), K=5, J=3), flat('#ff9eb8'), 'wares')
        add(gtube([(0.044, 0.03, 0.0), (0.066, 0.046, 0.0), (0.076, 0.066, 0.0)], lambda s: 0.01 - 0.004 * s, K=4), lac('#9fd8c0'), 'wares')
        add(gtube([(0.0, 0.066, -0.032), (0.0, 0.1, -0.012), (0.0, 0.1, 0.012), (0.0, 0.066, 0.032)], 0.0055, K=4, caps=False), wood('#d8b878'), 'wares')
    for (x, z) in ((0.055, 0.03), (0.062, -0.034)):
        add(glathe([(0.0, 0.014), (0.017, 0.014), (0.022, 0.048), (0.0, 0.048)], K=6, pos=(x, 0, z)), lambda p, n: '#9ac88a' if n.z > 0.8 else '#ff9eb8', 'wares')

def w_vase():
    def cf(c, fn): return '#ffffff' if 0.05 < c.z < 0.062 else '#8fd0ff'
    add(gl_lathe([(0.0, 0.0), (0.034, 0.0), (0.044, 0.04), (0.038, 0.078), (0.024, 0.1), (0.03, 0.115), (0.0, 0.11)], 8, colfn=cf), fsh(0.14, 0.2, sheen=0.3), 'wares')
    for (x, z, h, c) in ((0.0, 0.0, 0.22, '#ff8fb0'), (0.028, 0.016, 0.19, '#ffd24a'), (-0.026, 0.012, 0.18, '#ff6f9a')):
        add(gtube([(x * 0.3, 0.1, z * 0.3), (x, h - 0.02, z)], 0.005, K=3, caps=False), flat('#5a9a40'), 'wares')
        with at((x, h, z), ry=x * 8):
            LF(fan_shape(flower_ol(5, 1.0, 0.55, 2), (0, 0, 0), sc=0.032, T=0.008, rx=-PI / 2 + 0.5), lambda p, n, c=c: mix(c, '#fff0f4', clamp(n.z * 0.4 - n.y * 0.3)))
            LF(sph(0.008, (0, 0.006, 0.004), K=4, J=2), flat('#ffe070'))

def w_bonsai():
    add(rb(0.15, 0.042, 0.1, (0, 0.021, 0), r=0.01), lac('#3f6a9a', hi='#7aa0d0'), 'wares')
    add(box(0.13, 0.008, 0.08, (0, 0.044, 0), r=0), flat('#7cae5a'), 'wares')
    add(gtube(catmull([(-0.02, 0.044, 0.0), (0.004, 0.09, 0.008), (-0.026, 0.13, 0.0), (0.006, 0.17, -0.004)], 6), lambda s: 0.015 - s * 0.007, K=4), wood('#6e4a3a'), 'wares')
    for (x, y, z, R) in ((-0.05, 0.13, 0.008, 0.046), (0.04, 0.15, 0.0, 0.04), (-0.006, 0.19, -0.004, 0.04)):
        LF(sph(R, (x, y, z), sc=(1.1, 0.62, 1.0), K=7, J=3), lambda p, n: mix('#3a7f52', '#7cc06a', clamp(n.z * 0.7 + 0.2)))

def w_minilantern():
    prof = [(0.0, 0.022)] + [(0.044 * (0.62 + 0.38 * math.sin(k / 6 * PI)) * (1.0 if k % 2 else 0.95), 0.024 + k / 6 * 0.1) for k in range(7)] + [(0.0, 0.126)]
    GL(glathe(prof, K=6), flat('#e8503a'), 'minilantern', flick=0.8, tint=0.55)
    add(cyl(0.03, 0.032, 0.024, (0, 0.012, 0), K=6), flat(DARK), 'wares')
    add(cyl(0.03, 0.028, 0.018, (0, 0.13, 0), K=6), flat(DARK), 'wares')

def w_screen():
    for i in range(4):
        with at((-0.1 + i * 0.066, 0, (i % 2) * 0.02), ry=(-1 if i % 2 else 1) * 0.35):
            add(box(0.068, 0.2, 0.014, (0, 0.1, 0), r=0), wood('#a8303a'), 'wares')
            add(box(0.054, 0.174, 0.006, (0, 0.104, 0.009), r=0), flat('#fff4dc'), 'wares')
            if i % 2 == 0: add(dot(0.012, (0.006, 0.15, 0.013), sc=(1, 1, 0.4), K=5), flat('#ffbcd6'), 'wares')

def w_books():
    y = 0.0
    for i, (w, h, d, c) in enumerate(((0.14, 0.028, 0.1, '#e8706a'), (0.13, 0.026, 0.095, '#6a9ad8'), (0.12, 0.026, 0.09, '#f4c04a'))):
        with at((0.004 * i, y, 0), ry=i * 0.2 - 0.2):
            add(box(w, h, d, (0, h / 2, 0), r=0), soft(c, 0.12, 0.2), 'wares')
        y += h
    for (x, h, c) in ((0.1, 0.13, '#8fcf8a'), (0.126, 0.118, '#c890d8')):
        add(box(0.024, h, 0.09, (x, h / 2, 0), r=0), soft(c, 0.12, 0.2), 'wares')

def w_clock():
    add(rb(0.1, 0.1, 0.05, (0, 0.05, 0), r=0.01), wood('#d9a066'), 'wares')
    with at((0, 0.1, 0)):
        add(puffy([(-0.068, 0.0), (0.068, 0.0), (0.0, 0.05)], 0.06, bev=0.008, z0=-0.03, both=True), wood('#9a6038'), 'wares')
    add(cyl(0.034, 0.034, 0.008, (0, 0.054, 0.028), K=12, rx=PI / 2), flat('#fff8ec'), 'wares')
    add(box(0.005, 0.022, 0.004, (0.0, 0.064, 0.034), r=0), flat(INK), 'wares')
    add(box(0.016, 0.005, 0.004, (0.007, 0.054, 0.034), r=0), flat(INK), 'wares')

def w_rug(c0, c1):
    """a rolled rug lying along x on the shelf top"""
    st = 6; L = 0.44
    prof = [(0.0, -L / 2)] + [(0.055, -L / 2 + L * k / st) for k in range(st + 1)] + [(0.0, L / 2)]
    def cf(c, fn):
        if abs(fn.z) > 0.7: return c0 if angle_k(c, 8, PI / 8) % 2 else c1
        k = int((c.z + L / 2) / (L / st))
        return '#e8d4a0' if k in (1, st - 2) else (c0 if k % 2 else c1)
    add(gl_lathe(prof, 8, pos=(0, 0.055, 0), rz=PI / 2, colfn=cf), fsh(0.12, 0.24), 'rugs')

def price_tag(x, y, z, c):
    yt = y + 0.02
    CL(gtube([(x, yt + 0.012, z - 0.004), (x, y - 0.006, z)], 0.0035, K=3, caps=False), flat('#d8382e'), 'tags', y - 0.07, yt + 0.012)
    CL(box(0.042, 0.056, 0.007, (x, y - 0.036, z + 0.002), rz=0.06, r=0), flat(c), 'tags', y - 0.07, yt + 0.012)

def w_luckycat():
    """a chunky lucky cat on a red cushion (about 0.33 m tall)"""
    add(rb(0.2, 0.042, 0.18, (0, 0.021, 0), r=0.018), soft('#e83a3a', 0.2, 0.3), 'cat')
    y0 = 0.04
    W_, O_ = '#fffaf2', '#f4a050'
    def fur(p, n): return mix(mul(W_, 0.84), W_, clamp(n.z * 0.5 - n.y * 0.35 + 0.35))
    def ora(p, n): return mix(mul(O_, 0.84), mix(O_, '#ffe0c0', 0.3), clamp(n.z * 0.5 - n.y * 0.3 + 0.3))
    add(sph(1.0, (0, y0 + 0.08, -0.006), sc=(0.088, 0.084, 0.08), K=8, J=4), fur, 'cat')
    add(sph(1.0, (0, y0 + 0.2, 0.008), sc=(0.094, 0.08, 0.084), K=9, J=5), fur, 'cat')
    add(sph(1.0, (-0.04, y0 + 0.25, -0.004), sc=(0.05, 0.03, 0.06), K=6, J=3, rz=0.4), ora, 'cat')
    add(sph(1.0, (0.05, y0 + 0.1, -0.05), sc=(0.05, 0.05, 0.04), K=6, J=3), ora, 'cat')
    for sx in (-1, 1):
        with at((sx * 0.055, y0 + 0.255, 0.0), rz=-sx * 0.38):
            add(glathe([(0.0, 0.0), (0.03, 0.0), (0.016, 0.035), (0.0, 0.05)], K=5), ora if sx < 0 else fur, 'cat')
        add(dot(0.0115, (sx * 0.032, y0 + 0.205, 0.084), sc=(1, 1.15, 0.5), K=6), lac('#2a2230', hi='#6a6080'), 'cat')
        add(dot(0.004, (sx * 0.029, y0 + 0.211, 0.09), sc=(1, 1, 0.5), K=4), flat('#fffaf2'), 'cat')
        add(dot(0.012, (sx * 0.058, y0 + 0.182, 0.074), sc=(1.2, 0.75, 0.4), K=5), flat('#ffb0c0'), 'cat')
    add(sph(0.008, (0, y0 + 0.19, 0.088), sc=(1.2, 0.8, 0.7), K=5, J=2), flat('#ff8fa8'), 'cat')
    add(gloopc([(0.064 * math.cos(TAU * k / 9), y0 + 0.14 + 0.006 * math.cos(TAU * k / 9 - PI / 2), 0.064 * math.sin(TAU * k / 9) + 0.004) for k in range(9)], 0.009, K=3), lac('#e83a3a'), 'cat')
    add(sph(0.019, (0, y0 + 0.124, 0.07), K=6, J=3), lac(GOLD), 'cat')
    add(sph(1.0, (0.07, y0 + 0.15, 0.03), sc=(0.026, 0.06, 0.028), K=7, J=3, rz=-0.25), fur, 'cat')
    add(sph(0.03, (0.082, y0 + 0.215, 0.04), sc=(1, 1.05, 0.85), K=6, J=3), fur, 'cat')
    add(dot(0.012, (0.082, y0 + 0.21, 0.065), sc=(1.1, 1, 0.4), K=5), flat('#ffb0c0'), 'cat')
    add(sph(1.0, (-0.056, y0 + 0.085, 0.056), sc=(0.026, 0.044, 0.028), K=7, J=3, rz=0.5, rx=0.4), fur, 'cat')
    with at((-0.05, y0 + 0.088, 0.082), rx=PI / 2 - 0.25, rz=0.15):
        add(gl_lathe([(0.0, 0.0), (0.046, 0.0), (0.048, 0.007), (0.04, 0.013), (0.0, 0.012)], 8, sx=0.66), lac(GOLD, hi='#fff0b0'), 'cat')
    for sx in (-1, 1): add(sph(1.0, (sx * 0.038, y0 + 0.018, 0.06), sc=(0.026, 0.018, 0.03), K=5, J=2), fur, 'cat')
    add(gtube(catmull([(0.07, y0 + 0.02, -0.055), (0.096, y0 + 0.026, -0.01), (0.098, y0 + 0.04, 0.03), (0.085, y0 + 0.056, 0.058)], 5), lambda s: 0.016 - 0.005 * s, K=5), ora, 'cat')

# ================================================================== the home mailbox
MB_BODY, MB_BAND, MB_ROOF, MB_FLAG, MB_POST = '#fff0da', '#e8b888', '#c45a4a', '#f0443a', '#9c7458'

def tile_slab(s, yR, slope, sl, Dd, th, cols=6, per=3, amp=0.012):
    """one side (s = +1 right / -1 left) of the box's tiled roof: a slab from the ridge (y = yR at x = 0) down the
    slope, tile columns across z (a wavy top, rolled crests), the eave end showing the scallops"""
    ds = Vector((s * math.cos(slope), -math.sin(slope), 0.0)); ns = Vector((s * math.sin(slope), math.cos(slope), 0.0))
    R0 = Vector((0.0, yR, 0.0))
    na = cols * per
    As = [-Dd / 2 + Dd * i / na for i in range(na + 1)]
    Bs = [0.0, sl * 0.5, sl]
    def wav(a): return abs(math.sin(cols * PI * (a / Dd + 0.5))) ** 0.7
    def P(a, b, h): return F.W(tuple(R0 + ds * b + ns * h + Vector((0, 0, a))))
    c0 = srgb(MB_ROOF); hi = srgb('#f0a088')
    t = Tmp(); t.c = []
    def V(p, c): t.c.append(c); return t.vert(p)
    top = [[V(P(a, b, th + amp * wav(a)), mul(mix(c0, hi, 0.25 * wav(a)), (0.74 + 0.26 * wav(a)) * (1.04 - 0.14 * b / sl))) for a in As] for b in Bs]
    bot = [[V(P(a, b, 0.0), mul(c0, 0.6)) for a in As] for b in Bs]
    endt = [V(P(a, sl, th + amp * wav(a)), mul(c0, 0.72 + 0.12 * wav(a))) for a in As]     # the eave end face (own verts)
    endb = [V(P(a, sl, 0.0), mul(c0, 0.62)) for a in As]
    up, dn, dz = F.N(tuple(ns)), F.N(tuple(ds)), F.N((0, 0, 1))
    for j in range(2):
        for i in range(na):
            t.face([top[j][i], top[j][i + 1], top[j + 1][i + 1], top[j + 1][i]], up)
            t.face([bot[j][i], bot[j][i + 1], bot[j + 1][i + 1], bot[j + 1][i]], -up)
        t.face([top[j][0], top[j + 1][0], bot[j + 1][0], bot[j][0]], -dz)
        t.face([top[j][na], top[j + 1][na], bot[j + 1][na], bot[j][na]], dz)
    for i in range(na):
        t.face([endt[i], endt[i + 1], endb[i + 1], endb[i]], dn)
        t.face([top[0][i], top[0][i + 1], bot[0][i + 1], bot[0][i]], -dn)
    return t

def build_mailbox():
    new_asset('ext-mailbox')
    # ---------------------------------------------------------------- a mossy stone foot, a pebble
    F_, Lt = stone(0.0, 0.0, 0.0, ra=0.085, e=0.055, H=0.1, K=11, col=stone_col(3, base='#c4b8c2'), seed=3, sx=1.0, sz=0.9, dome=0.01, flare=0.026, lump=0.07)
    moss_on(F_, 0.0, 0.0, 0.0, 0.1, 0.085 + 0.055 * PI / 2 * 0.22, [(PI / 2 - 0.35, 0.045, 0.38), (PI * 1.15, 0.032, 0.32), (-0.45, 0.04, 0.34), (PI / 2 + 0.9, 0.028, 0.26)], thick=0.016, J=4, n_th=12, seed=3)
    add(sph(1.0, (0.12, 0.024, -0.15), sc=(0.04, 0.026, 0.032), K=6, J=3, ry=0.6), stone_col(5, base='#bdb2bc'), 'stone')
    # ---------------------------------------------------------------- the post, a cap block and two knee braces
    yP, yS = 0.09, 0.76
    add(beam(0.105, yS - yP, 0.105, (0, (yP + yS) / 2, -0.01), c=0.024), grain(MB_POST, 'y', 46, ao_z=0.1, ao_k=0.2), 'post')
    add(beam(0.15, 0.046, 0.27, (0, yS + 0.023, 0), c=0.012), grain(mul(MB_POST, 0.9), 'z', 40), 'post')
    for s in (-1, 1):      # knee braces out to the box's sides (a Y from the front)
        add(beam_ab((s * 0.04, yS - 0.17, -0.01), (s * 0.115, yS + 0.04, -0.01), 0.042, c=0.01), grain(mul(MB_POST, 0.86), 'y', 46), 'post')
    # ---------------------------------------------------------------- the box: a little house, a band at its foot, corner trims
    W, Hw, Hp, D, yB = 0.28, 0.18, 0.095, 0.28, yS + 0.046
    hw = W / 2; b = 0.02
    corners = [(-hw, 0.0), (hw, 0.0), (hw, Hw), (0.0, Hw + Hp), (-hw, Hw)]
    prof = []
    for i, p in enumerate(corners):
        pv, nx = corners[i - 1], corners[(i + 1) % len(corners)]
        for q in (pv, nx):
            d = Vector((q[0] - p[0], q[1] - p[1])); d.normalize()
            prof.append((p[0] + d.x * b, p[1] + d.y * b))
    prof = [(-x, y) for x, y in prof]           # (sweep: w runs along -x for a path toward the front)
    body = sweep([F.W((0, yB, -D / 2 + 0.014)), F.W((0, yB, D / 2 - 0.014))], prof, up=Z, cap=True, inset=0.28, cap_d=0.014)
    add(body, lambda p, n: mul(MB_BODY, 0.88 + 0.14 * clamp(n.z * 0.5 + 0.6)), 'box')
    add(rb(W + 0.012, 0.046, D + 0.012, (0, yB + 0.023, 0), r=0.014), paint(MB_BAND, top=0.15, bot=0.25), 'box')
    for sx in (-1, 1):
        for sz in (-1, 1):
            add(box(0.026, Hw - 0.05, 0.026, (sx * (hw - 0.006), yB + 0.046 + (Hw - 0.05) / 2, sz * (D / 2 - 0.006)), r=0), grain(mul(MB_POST, 1.05), 'y', 60), 'box')
    # the roof: two tiled slabs, a ridge roll with round end caps
    slope = math.atan2(Hp, W / 2); sl = math.hypot(W / 2, Hp) + 0.06; yTop = yB + Hw + Hp - 0.004
    for s in (-1, 1):
        add(tile_slab(s, yTop, slope, sl, D + 0.07, 0.024), None, 'roof')
    add(cyl(0.028, 0.028, D + 0.08, (0, yTop + 0.03, 0), K=8, rx=PI / 2), lac(mul(MB_ROOF, 0.86), hi=mix(MB_ROOF, '#ffd0c0', 0.3)), 'roof')
    for z in (-1, 1):
        add(cyl(0.036, 0.036, 0.02, (0, yTop + 0.03, z * (D / 2 + 0.048)), K=8, rx=PI / 2), lac(mix(MB_ROOF, '#fff0e0', 0.2)), 'roof')
    # the gable: a little envelope with a heart seal (no text)
    zF = D / 2; gy = yB + Hw + 0.03
    with at((0, gy, zF)):
        add(rb(0.076, 0.05, 0.01, (0, 0, 0.005), r=0.005), soft('#fffaf0', 0.1, 0.2), 'emblem')
        add(puffy([(-0.036, 0.023), (0.036, 0.023), (0.0, -0.004)], 0.005, bev=0.002, z0=0.01), flat('#f0d8b0'), 'emblem')
        add(puffy(heart_poly(0.03, -0.004, n=3), 0.006, bev=0.002, z0=0.014), flat('#e8403a'), 'emblem')
    # the slot: a dark mouth, a brass lip and sill
    yL = yB + 0.122
    add(rb(0.16, 0.034, 0.012, (0, yL, zF + 0.002), r=0.006), flat('#2a2024'), 'slot')
    add(box(0.186, 0.024, 0.018, (0, yL + 0.029, zF + 0.006), r=0), lac('#e2aa50', hi='#fff0b8'), 'slot')
    add(box(0.18, 0.012, 0.014, (0, yL - 0.024, zF + 0.004), r=0), lac('#c89038'), 'slot')
    with at((0, yB + 0.056, zF + 0.006)):
        add(puffy(heart_poly(0.07, n=4), 0.009, bev=0.004), lambda p, n: mix('#ff7f9c', '#ffb8c8', clamp(n.z * 0.4 - n.y * 0.5)), 'heart')
    # ---------------------------------------------------------------- the flag (up), on the right side
    fx, pz, py = hw + 0.012, -0.06, yB + 0.06
    add(cyl(0.026, 0.026, 0.02, (fx + 0.006, py, pz), K=8, rz=PI / 2), lac(GOLD), 'flag')
    add(box(0.03, 0.26, 0.03, (fx + 0.022, py + 0.13, pz), r=0), lac('#c83a30'), 'flag')
    add(rb(0.022, 0.086, 0.13, (fx + 0.022, py + 0.22, pz - 0.068), r=0.009), lac(MB_FLAG), 'flag')
    # ---------------------------------------------------------------- a name plate on the post: a painted paw (no text)
    with at((0, 0.56, 0.0425)):
        add(rb(0.15, 0.072, 0.014, (0, 0, 0.007), r=0.006), grain('#f4e0bc', 'x', 80, amt=0.04), 'plate')
        add(dot(0.019, (0, -0.01, 0.014), sc=(1.15, 0.9, 0.35), K=8), flat('#8a5a3a'), 'plate')
        for (x, y) in ((-0.024, 0.012), (-0.009, 0.022), (0.009, 0.022), (0.024, 0.012)):
            add(dot(0.0085, (x, y, 0.014), sc=(1, 1.15, 0.4), K=6), flat('#8a5a3a'), 'plate')
        for x in (-0.06, 0.06): add(sph(0.008, (x, 0, 0.016), K=5, J=2), lac(GOLD), 'plate')
    # ---------------------------------------------------------------- three tufts of flowers at the foot (leaf bucket)
    greens = ['#5aa04a', '#6cb452', '#4f9444']
    for i, (x, z, fc) in enumerate(((0.155, 0.11, ('#ff8fb0', '#ffffff')), (-0.15, 0.115, ('#ffd24a', '#ff8fb0')), (-0.125, -0.15, ('#c8a8ff', '#ffffff')))):
        for k in range(5):
            with at((x, 0.03, z), ry=TAU * k / 5 + i):
                LF(leafb(0.09 + (k % 2) * 0.02, 0.04, (0, 0.0, 0), rx=0.8 + (k % 3) * 0.15), soft(greens[(k + i) % 3], 0.2, 0.3))
        for k in range(2):
            R = 0.034 - k * 0.006; a = i * 2 + k * 2.4
            with at((x + math.cos(a) * 0.026, 0.07 + k * 0.035, z + math.sin(a) * 0.026), ry=-a):
                LF(fan_shape(flower_ol(5, 1.0, 0.55, 2), (0, 0, 0), sc=R, T=0.008, rx=-PI / 2 + 0.4), lambda p, n, c=fc[k]: mix(c, '#fff8fa', clamp(n.z * 0.3 - 0.1)))
                LF(sph(R * 0.3, (0, 0.006, 0.002), K=4, J=2), flat('#ff9a3a' if fc[k] == '#ffd24a' else '#ffd24a'))
    finish(A, seed=5150, amt=0.0025)

# ================================================================== finishing and export
def finish(A, seed=5, amt=0.004):
    """a gentle hand-made wobble, then a painted contact shade toward the ground"""
    ph = (seed % 97) * 1.37 + 0.7
    for o in A.objs.values():
        V = o['v']
        for i, p in enumerate(V):
            dx = math.sin(p.z * 9.0 + ph) * amt
            dz = math.sin(p.x * 7.0 + ph * 1.3) * amt * 0.7 * smooth(0.0, 0.04, p.z)
            V[i] = Vector((p.x + dx, p.y, p.z + dz))
        for i, (p, c) in enumerate(zip(V, o['c'])):
            k = 0.86 + 0.14 * smooth(-0.01, 0.12, p.z)
            o['c'][i] = (c[0] * k, c[1] * k, c[2] * k, 1.0)

def export_piece(A, name):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mats = {}
    for mname in ('body', 'leaf', 'cloth', 'glow'):
        mt = bpy.data.materials.new(mname); mt.use_nodes = True; nt = mt.node_tree
        bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
        bsdf.inputs['Roughness'].default_value = 0.8; bsdf.inputs['Metallic'].default_value = 0.0
        vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'; nt.links.new(vc.outputs['Color'], bsdf.inputs['Base Color'])
        if mname == 'glow':
            bsdf.inputs['Emission Color'].default_value = lin('#ffd890'); bsdf.inputs['Emission Strength'].default_value = 1.0
        mats[mname] = mt
    obs = [to_object(k, o, mats) for k, o in A.objs.items()]
    lo = Vector((1e9,) * 3); hi = Vector((-1e9,) * 3)
    for o in A.objs.values():
        for v in o['v']: lo = Vector(map(min, lo, v)); hi = Vector(map(max, hi, v))
    print('HX %s tris %d' % (name, A.tris()))
    print('HX %s parts %s' % (name, dict(sorted(A.count.items(), key=lambda kv: -kv[1]))))
    print('HX %s lowest %s' % (name, sorted(((round(v, 3), k) for k, v in A.low.items()))[:3]))
    print('HX %s game x %.3f..%.3f  y %.3f..%.3f  z %.3f..%.3f' % (name, lo.x, hi.x, lo.z, hi.z, -hi.y, -lo.y))
    for ob in obs:
        bt = {}
        for poly in ob.data.polygons:
            m = ob.data.materials[poly.material_index].name; bt[m] = bt.get(m, 0) + len(poly.vertices) - 2
        print('HX %s check %s %s tris/material %s' % (name, ob.name, check(ob), bt))
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, name + '.blend'))
    for o in bpy.context.scene.objects: o.select_set(o.type == 'MESH')
    out = os.path.join(MODELS, name + '.glb')
    kw = dict(filepath=out, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
              export_attributes=True, export_lights=False, export_cameras=False, export_animations=False,
              export_normals=True, export_texcoords=True, export_materials='EXPORT')
    try: bpy.ops.export_scene.gltf(export_vertex_color='ACTIVE', **kw)
    except TypeError as e:
        print('HX export_vertex_color rejected:', e); bpy.ops.export_scene.gltf(export_colors=True, **kw)
    print('HX wrote', out)

PIECES = {'trinketStall': build_trinketStall, 'mailbox': build_mailbox}
for pid in (list(PIECES) if PIECE == 'all' else PIECE.split(',')):
    PIECES[pid]()
    export_piece(A, 'ext-' + pid)
