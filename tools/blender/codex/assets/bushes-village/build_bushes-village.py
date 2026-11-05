# Blossom Hollow's flowering bushes, hand-built variants as the kit's own parts (task bushes-village).
#
#   blender --background --factory-startup --python build_bushes-village.py -- --piece hydrangea:0 | hydrangea | all
#
# Writes D:/projects/chewy-life-3d/public/models/tree-village-bush-<kind>-v<k>.glb, one object per game part, picked by
# material name (src/world/vegetation.js buildBush; '_' = the game's ':'):
#   foliage        the bush's simple leaf masses (the game draws them into the sun's shadow map only)
#   cards_round    leaf cards on the round (broadleaf) atlas: C1 / C2 clusters, vertex-tinted, bush-volume normals
#   cards_sakura   bloom cards on the sakura atlas (hydrangea mopheads, azalea trusses)
#   berries        the box bush's berries (smooth little spheres, vertex-coloured)
# Same frame as the kit (base at the origin, Blender z up = game y up). Deterministic: fixed seeds, own hash noise.
# Card UVs follow the kit exactly (vegetation.js RECTS / UVR, 2 px inset); the glTF exporter's v flip is compensated.
import bpy, bmesh, sys, os, math, random
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
MODELS = 'D:/projects/chewy-life-3d/public/models'
UP = Vector((0, 0, 1))
TAU = math.tau

# ================================================================== atlas layout (src/world/vegetation.js RECTS / UVR)
AT = 512
RECTS = {'C1': (0, 0, 256, 256), 'C2': (0, 256, 256, 512), 'S1': (256, 0, 384, 512), 'S2': (384, 0, 512, 512)}
UVR = {k: ((x0 + 2) / AT, (y0 + 2) / AT, (x1 - 2) / AT, (y1 - 2) / AT) for k, (x0, y0, x1, y1) in RECTS.items()}
def buv(u, v):  # game uv (v = canvas row / 512) -> Blender uv (the glTF exporter writes v' = 1 - v)
    return (u, 1.0 - v)

# ================================================================== colour (designed in sRGB, written linear)
def s2l(c): return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
def hx(h):
    if isinstance(h, tuple): return h[:3]
    h = h.lstrip('#'); return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
def mix(a, b, t):
    a, b = hx(a), hx(b); t = max(0.0, min(1.0, t)); return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))
def mul(a, k): a = hx(a); return tuple(max(0.0, min(1.0, c * k)) for c in a)
def lin(c): c = hx(c); return (s2l(c[0]), s2l(c[1]), s2l(c[2]), 1.0)
def jitter(c, rng, amt=0.04):
    c = hx(c); k = 1 + rng.uniform(-amt, amt); return tuple(max(0, min(1, x * k + rng.uniform(-amt, amt) * 0.3)) for x in c)
def clamp(x, a=0.0, b=1.0): return max(a, min(b, x))
def smooth(a, b, x):
    t = clamp((x - a) / (b - a)) if b != a else (1.0 if x >= b else 0.0)
    return t * t * (3 - 2 * t)

def _h(i, j, k, s):
    n = ((i * 73856093) ^ (j * 19349663) ^ (k * 83492791) ^ (s * 2654435761)) & 0xffffffff
    n = ((n ^ (n >> 13)) * 1274126177) & 0xffffffff
    return ((n ^ (n >> 16)) & 0xffffff) / 0xffffff
def vnoise(p, f=1.0, s=0):
    x, y, z = p[0] * f, p[1] * f, p[2] * f
    i, j, k = math.floor(x), math.floor(y), math.floor(z)
    u, v, w = x - i, y - j, z - k
    u, v, w = u * u * (3 - 2 * u), v * v * (3 - 2 * v), w * w * (3 - 2 * w)
    acc = 0.0
    for di in (0, 1):
        for dj in (0, 1):
            for dk in (0, 1):
                acc += _h(i + di, j + dj, k + dk, s) * (u if di else 1 - u) * (v if dj else 1 - v) * (w if dk else 1 - w)
    return acc

def V(x, y, z): return Vector((x, y, z))
def dir_az(az, el=0.0):  # degrees: azimuth around z, elevation above the horizon
    a, e = math.radians(az), math.radians(el)
    return V(math.cos(a) * math.cos(e), math.sin(a) * math.cos(e), math.sin(e))
def unit(rng):
    while True:
        v = V(rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-1, 1)); l = v.length
        if 0.05 < l <= 1: return v / l

# ================================================================== parts
class Part:
    def __init__(s, name): s.name = name; s.v = []; s.n = []; s.c = []; s.uv = []; s.f = []
    def vert(s, p, n, c, uv=(0.0, 0.0)):
        s.v.append(Vector(p)); nn = Vector(n)
        s.n.append(nn.normalized() if nn.length > 1e-9 else Vector(UP)); s.c.append(hx(c)); s.uv.append(uv)
        return len(s.v) - 1
    def tris(s): return sum(len(f) - 2 for f in s.f)

# ---------------------------------------------------------------- leaf masses (shadow only)
class Mass:
    def __init__(s, c, rx, ry, rz, seed=0, lumps=0.3, rough=0.06):
        s.c = Vector(c); s.rx, s.ry, s.rz = rx, ry, rz; s.seed = seed; s.lumps = lumps; s.rough = rough
        rr = random.Random(seed * 7919 + 101); s.L = []
        for _ in range(5):
            u = rr.uniform(-0.6, 1.0); th = rr.uniform(0, TAU); q = math.sqrt(max(0, 1 - u * u))
            s.L.append((V(q * math.cos(th), q * math.sin(th), u), 0.4 + rr.random() * 0.6))
    def k(s, d):
        k = 1 - s.lumps * 0.3
        for dd, a in s.L: k += s.lumps * a * max(0.0, d.dot(dd)) ** 3
        return k + s.rough * (vnoise(d * 1.0, 2.2, s.seed) - 0.5) * 2
    def surf(s, d):
        kk = s.k(d); return s.c + V(d.x * s.rx, d.y * s.ry, d.z * s.rz) * kk
    def normal(s, p):
        q = p - s.c; return V(q.x / s.rx ** 2, q.y / s.ry ** 2, q.z / s.rz ** 2).normalized()
    def inside(s, p, f=0.9):
        q = p - s.c; return (q.x / s.rx) ** 2 + (q.y / s.ry) ** 2 + (q.z / s.rz) ** 2 < f * f

def mass_mesh(part, m, stops, z0, z1, scale=0.92, belly=0.4):
    bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=2, radius=1.0)
    idx = {}
    for v in bm.verts:
        d = v.co.normalized()
        p = m.c + (m.surf(d) - m.c) * scale
        bl = max(0.02, m.c.z - m.rz * belly * scale)
        if p.z < bl: p.z = bl + (p.z - bl) * 0.3
        t = clamp((p.z - z0) / max(0.3, z1 - z0)) * (len(stops) - 1); j = min(len(stops) - 2, int(t))
        idx[v.index] = part.vert(p, V(d.x / m.rx, d.y / m.ry, d.z / m.rz), mix(stops[j], stops[j + 1], t - j))
    for f in bm.faces: part.f.append(tuple(idx[v.index] for v in f.verts))
    bm.free()

# ---------------------------------------------------------------- cards
class Cards(Part):
    def quad(s, p, ax, ay, n, rect, cols):
        u0, v0, u1, v1 = UVR[rect]
        cs = [(p - ax - ay, (u0, v0)), (p + ax - ay, (u1, v0)), (p + ax + ay, (u1, v1)), (p - ax + ay, (u0, v1))]
        lo = min(q.z for q, _ in cs)
        if lo < -0.04: cs = [(q + V(0, 0, -0.04 - lo), uv) for q, uv in cs]   # a card never digs deep into the ground
        ids = [s.vert(q, n, cols(q) if callable(cols) else cols, buv(*uv)) for q, uv in cs]
        s.f.append((ids[0], ids[1], ids[2])); s.f.append((ids[0], ids[2], ids[3]))
    def cluster(s, rng, p, fn, size, rect, cols, tilt=0.35, light=None):
        """a cluster card centred at p, facing fn (roughly tangent to the clump), randomly rolled, tilted a little"""
        fn = fn.normalized()
        t = fn.cross(V(rng.uniform(-0.5, 0.5), rng.uniform(-0.5, 0.5), 1).normalized())
        if t.length < 1e-3: t = V(1, 0, 0)
        t.normalize(); bt = fn.cross(t).normalized(); rot = rng.uniform(0, TAU)
        ax = t * math.cos(rot) + bt * math.sin(rot)
        ay = (fn.cross(ax).normalized() + fn * rng.uniform(-1, 1) * tilt).normalized()
        s.quad(p, ax * (size / 2), ay * (size / 2), light if light is not None else fn, rect, cols)

# ================================================================== the bush volume
class Crown:
    def __init__(s, masses):
        s.M = masses
        s.c = sum((m.c for m in masses), Vector()) / len(masses)
        s.z0 = 0.0; s.z1 = max(m.c.z + m.rz for m in masses)
    def out(s, p):  # bush-volume normal at p (centre lowered: a mound, not a ball)
        q = p - (s.c - V(0, 0, 0.15)); q.z *= 1.3
        return q.normalized() if q.length > 1e-6 else Vector(UP)
    def depth(s, p):  # 0 deep inside .. 1 at the shell
        best = 0.0
        for m in s.M:
            q = p - m.c; e = math.sqrt((q.x / m.rx) ** 2 + (q.y / m.ry) ** 2 + (q.z / m.rz) ** 2)
            best = max(best, 1.0 - abs(1.0 - e) if e < 1 else 1.0)
        return best
    def buried(s, p, own, f=0.88):
        return any(m is not own and m.inside(p, f) for m in s.M)

def sample_surface(crown, rng, n_target, rmin, zbias=0.45, zmin=-0.5, out_k=1.0, tries=6000, keep=None):
    """points on the masses' surfaces, area-weighted, top-biased (the camera looks down on bushes), none buried"""
    pts = []; amax = max(mm.rx * mm.ry for mm in crown.M)
    for _ in range(tries):
        if len(pts) >= n_target: break
        m = crown.M[rng.randrange(len(crown.M))]
        if rng.random() > (m.rx * m.ry) / amax: continue
        d = unit(rng); d.z = d.z * (1 - zbias) + zbias * abs(d.z) + zbias * 0.3; d.normalize()
        if d.z < zmin: continue
        p = m.c + (m.surf(d) - m.c) * out_k
        if crown.buried(p, m): continue
        if keep and not keep(p): continue
        if any((p - q[0]).length < rmin for q in pts): continue
        pts.append((p, d, m))
    return pts

def leaf_clump(B, crown, p, d, m, rc, pal, size, n_sh, n_in, tilt=0.5, top_hi=0.25, low_dark=0.45, skip=None, tone=0.0):
    """a leaf clump: a darker core of big cards and a shell over its outer / upper side, one tone, lighter on top,
    deeper toward the bush's foot and middle"""
    r = B.rng; C = B.leaves
    hz = clamp((p.z - crown.z0) / max(0.4, crown.z1 - crown.z0))
    base = jitter(pal['outer'][r.randrange(len(pal['outer']))], r, 0.035)
    base = mix(base, pal['deep'][r.randrange(len(pal['deep']))], low_dark * (1 - hz) ** 1.3 + (0.2 if d.z < -0.15 else 0))
    base = mix(base, pal['deep'][0], tone) if tone > 0 else mix(base, pal['hi'], -tone)
    core_c = mix(pal['deep'][r.randrange(len(pal['deep']))], base, 0.35)
    co = (m.normal(p) * 0.75 + crown.out(p) * 0.25).normalized()
    def shade(q):
        e = (q - p).length / max(0.15, rc)
        k = 0.86 + 0.16 * smooth(0.15, 1.15, e)
        k *= 0.72 + 0.28 * smooth(0.3, 1.0, crown.depth(q))
        k *= 1.0 - 0.22 * smooth(0.35, 0.0, q.z)            # earthy, shaded foot
        return k
    for j in range(n_in + n_sh):
        inner = j < n_in
        if inner:
            q = p - d * rc * r.uniform(0.3, 0.6) + unit(r) * rc * 0.3
            fn = (d + unit(r) * 0.4).normalized(); sz = size * r.uniform(1.1, 1.3); c0 = jitter(core_c, r, 0.03)
        else:
            u = (unit(r) + d * 1.3 + UP * 0.45).normalized()
            q = p + u * rc * r.uniform(0.45, 1.0)
            if skip and skip(q): continue
            fn = (u + UP * 0.25).normalized(); sz = size * r.uniform(0.85, 1.12); c0 = jitter(base, r, 0.03)
            if u.z > 0.55: c0 = mix(c0, pal['hi'], top_hi * smooth(0.55, 1.0, u.z) * (0.4 + 0.6 * hz))
        light = (co * 0.6 + fn * 0.4 + UP * 0.12).normalized()
        C.cluster(r, q, fn, sz, 'C1' if j % 2 else 'C2', (lambda cc: (lambda qq: mul(cc, shade(qq))))(c0), tilt, light)

def core_fill(B, crown, pal, n, k=0.66, size=0.62):
    """dark cards deep in the volume so the shadow-only masses never leave a see-through hole"""
    r = B.rng
    for i in range(n):
        m = crown.M[i % len(crown.M)]
        d = unit(r); d.z = abs(d.z) * 0.8 + 0.1; d.normalize()
        q = m.c + (m.surf(d) - m.c) * r.uniform(k - 0.1, k + 0.08)
        c = mix(pal['deep'][r.randrange(len(pal['deep']))], pal['outer'][0], r.uniform(0.15, 0.35))
        light = (crown.out(q) * 0.7 + UP * 0.1).normalized()
        B.leaves.cluster(r, q, (d + unit(r) * 0.5).normalized(), size * r.uniform(0.9, 1.15), 'C1' if i % 2 else 'C2', c, 0.6, light)

class Bush:
    def __init__(s, kind, seed):
        s.kind = kind; s.rng = random.Random(seed)
        s.fol = Part('foliage'); s.leaves = Cards('cards_round'); s.blooms = Cards('cards_sakura'); s.berries = Part('berries')
    def masses(s, spec, lumps=0.32, rough=0.06, seed0=0):
        M = []
        for i, (az, dist, z, rx, rz) in enumerate(spec):
            c = V(0, 0, z) + dir_az(az) * dist
            ry = rx * s.rng.uniform(0.88, 1.0)
            M.append(Mass(c, rx, ry, rz, seed=seed0 + i, lumps=lumps, rough=rough))
        return M

# ================================================================== species
HYD_LEAF = dict(outer=['#6cb452', '#7cc05a', '#8ccc62', '#5ea84c', '#74ba56'], deep=['#28563a', '#387640', '#4c904a'], hi='#acd872')
HYD_BLOOM = {
    'blue':  dict(outer=['#7a9cff', '#8eaaff', '#84a2fa', '#9cb6ff', '#8aa4ff'], deep=['#4c5ec8', '#5c70d8'], hi='#d6e2ff', young='#c4e0c8'),
    'pink':  dict(outer=['#ff8cc0', '#ff9ccc', '#f784bc', '#ffaad2', '#fa92c6'], deep=['#c04c8c', '#d062a0'], hi='#ffdcec', young='#e8f0c8'),
    'lilac': dict(outer=['#a688ff', '#b294ff', '#9c84f6', '#bca2ff', '#ac8eff'], deep=['#6a50c0', '#7c62d4'], hi='#e6dcff', young='#d8e8cc'),
}
# masses: (azimuth deg, distance from the axis m, centre height m, radius m, height radius m)
HYD_V = [
    dict(col='blue', masses=[(0, 0.0, 0.46, 0.42, 0.36), (40, 0.36, 0.38, 0.34, 0.3), (160, 0.38, 0.39, 0.35, 0.3), (275, 0.34, 0.36, 0.33, 0.28)],
         heads=10, clumps=40),
    dict(col='pink', masses=[(0, 0.0, 0.52, 0.38, 0.4), (110, 0.3, 0.42, 0.32, 0.31), (235, 0.3, 0.41, 0.32, 0.31), (330, 0.26, 0.32, 0.27, 0.26)],
         heads=9, clumps=38),
    dict(col='lilac', masses=[(0, 0.06, 0.42, 0.4, 0.34), (70, 0.42, 0.36, 0.33, 0.28), (190, 0.36, 0.34, 0.32, 0.27), (310, 0.44, 0.32, 0.32, 0.26),
                              (130, 0.64, 0.26, 0.24, 0.22)], heads=12, clumps=44),
]

def bloom_head(B, crown, c, d, hr, pal, rng):
    """a mophead: a ball of florets from 7 sakura cards (a dark core, a crown card, a ring of five), shaded as a ball"""
    C = B.blooms
    base = jitter(pal['outer'][rng.randrange(len(pal['outer']))], rng, 0.03)
    if rng.random() < 0.18: base = mix(base, pal['young'], 0.35)          # a few young heads still greening
    up = (d * 0.45 + UP * 0.8).normalized()
    def ball(q):  # dark underside, light crown
        w = (q - c); w = w.normalized() if w.length > 1e-6 else UP
        return 0.8 + 0.24 * smooth(-0.6, 0.8, w.z)
    def light_at(q):
        w = q - c; w = w.normalized() if w.length > 1e-6 else UP
        return (w * 0.7 + up * 0.3).normalized()
    # core (fills the middle so the ball never shows a hole)
    q = c - up * hr * 0.15
    C.cluster(rng, q, up, hr * 2.7, 'C2', mix(base, pal['deep'][0], 0.4), 0.3, (up + UP * 0.2).normalized())
    # crown card
    q = c + up * hr * 0.5
    cc = mix(base, pal['hi'], 0.3)
    C.cluster(rng, q, up, hr * 2.35, 'C1', (lambda cc: lambda qq: mul(cc, ball(qq)))(cc), 0.25, light_at(q + up * hr))
    a0 = rng.uniform(0, TAU)
    for j in range(5):
        a = a0 + j * TAU / 5 + rng.uniform(-0.25, 0.25)
        w = (V(math.cos(a), math.sin(a), 0.35) + up * 0.45).normalized()
        q = c + w * hr * 0.55
        col = jitter(base, rng, 0.03)
        if w.z < 0.3: col = mix(col, pal['deep'][rng.randrange(2)], 0.22)
        C.cluster(rng, q, w, hr * 2.15, 'C1' if j % 2 else 'C2', (lambda cc: lambda qq: mul(cc, ball(qq)))(col), 0.3, light_at(q + w * hr))

def build_hydrangea(k):
    B = Bush('hydrangea', 7100 + k); r = B.rng; cfg = HYD_V[k]
    M = B.masses(cfg['masses'], lumps=0.34, rough=0.07, seed0=k * 17)
    crown = Crown(M)
    for m in M: mass_mesh(B.fol, m, ['#28563a', '#387640', '#4c904a', '#62a652'], 0.0, crown.z1)
    # the mophead positions first (top and upper sides, spaced), so the leaves can make room for them
    heads = []
    for _ in range(4000):
        if len(heads) >= cfg['heads']: break
        m = M[r.randrange(len(M))]
        d = unit(r); d.z = abs(d.z) * 0.85 + 0.25; d.normalize()
        if d.z < 0.2: continue
        hr = r.uniform(0.19, 0.24)
        c = m.surf(d) + d * (hr * 0.5)
        if crown.buried(c, m, 0.8): continue
        if any((c - q[0]).length < (hr + q[2]) * 1.05 for q in heads): continue
        heads.append((c, d, hr))
    skip = lambda q: any((q - h[0]).length < h[2] * 1.2 for h in heads)
    for p, d, m in sample_surface(crown, r, cfg['clumps'], 0.2, zbias=0.4, zmin=-0.5, out_k=0.97):
        leaf_clump(B, crown, p, d, m, 0.22, HYD_LEAF, 0.52, 8 if d.z > -0.1 else 5, 2, tilt=0.55, skip=skip, tone=r.uniform(-0.12, 0.14))
    core_fill(B, crown, HYD_LEAF, 34, size=0.66)
    pal = HYD_BLOOM[cfg['col']]
    for c, d, hr in heads: bloom_head(B, crown, c, d, hr, pal, r)
    print('BV hydrangea-v%d heads %d' % (k, len(heads)))
    return B

AZ_LEAF = dict(outer=['#5a9e4a', '#68aa50', '#4e9446', '#74b456', '#62a44c'], deep=['#22482a', '#2e5e34', '#3c7240'], hi='#98c868')
AZ_BLOOM = [
    dict(outer=['#ff5a98', '#ff6aa4', '#f84e8c', '#ff7aae'], deep=['#c42e6c', '#d84080'], hi='#ffb4d0'),   # magenta
    dict(outer=['#ff6c6c', '#ff7e70', '#f85e64', '#ff8e7c'], deep=['#c43a46', '#d64c50'], hi='#ffc4b4'),   # coral
    dict(outer=['#ffa0c8', '#ffb2d4', '#ff94bc', '#ffc2dc'], deep=['#d46896', '#e07aa6'], hi='#ffe6f0'),   # soft pink
]
AZ_V = [
    dict(masses=[(0, 0.0, 0.36, 0.62, 0.36), (60, 0.42, 0.29, 0.42, 0.27), (195, 0.44, 0.3, 0.44, 0.28), (300, 0.4, 0.27, 0.4, 0.25)],
         trusses=30, clumps=50),
    dict(masses=[(30, 0.34, 0.38, 0.5, 0.36), (215, 0.38, 0.33, 0.48, 0.32), (120, 0.34, 0.25, 0.36, 0.23), (300, 0.3, 0.24, 0.32, 0.22)],
         trusses=27, clumps=48),
    dict(masses=[(0, 0.0, 0.42, 0.55, 0.42), (100, 0.32, 0.3, 0.38, 0.28), (240, 0.33, 0.3, 0.37, 0.28)],
         trusses=25, clumps=44),
]

def build_azalea(k):
    B = Bush('azalea', 7200 + k); r = B.rng; cfg = AZ_V[k]
    M = B.masses(cfg['masses'], lumps=0.26, rough=0.05, seed0=k * 19 + 5)
    crown = Crown(M)
    for m in M: mass_mesh(B.fol, m, ['#22482a', '#2e5e34', '#3c7240', '#52904a'], 0.0, crown.z1)
    pal = AZ_BLOOM[k]
    trusses = []
    for _ in range(4000):
        if len(trusses) >= cfg['trusses']: break
        m = M[r.randrange(len(M))]
        d = unit(r); d.z = abs(d.z) * 0.75 + 0.2; d.normalize()
        if d.z < 0.12: continue
        c = m.surf(d) + d * 0.09 + UP * 0.02
        if crown.buried(c, m, 0.85): continue
        if any((c - q[0]).length < 0.22 for q in trusses): continue
        trusses.append((c, d))
    skip = lambda q: any((q - t[0]).length < 0.19 for t in trusses)
    for p, d, m in sample_surface(crown, r, cfg['clumps'], 0.2, zbias=0.35, zmin=-0.45, out_k=0.97):
        leaf_clump(B, crown, p, d, m, 0.2, AZ_LEAF, 0.44, 7 if d.z > -0.1 else 5, 2, tilt=0.5, top_hi=0.2, skip=skip)
    core_fill(B, crown, AZ_LEAF, 30, size=0.56)
    # flower trusses: two or three small sakura cards per truss, sitting on the leaf shell, lighter on top
    for ti, (c, d) in enumerate(trusses):
        base = jitter(pal['outer'][r.randrange(len(pal['outer']))], r, 0.03)
        hz = clamp(c.z / max(0.4, crown.z1))
        base = mix(base, pal['deep'][r.randrange(2)], 0.3 * (1 - hz))
        n = 3 if r.random() < 0.6 else 2
        for j in range(n):
            fn = (d * 0.6 + UP * 0.6 + unit(r) * 0.3).normalized()
            q = c + unit(r) * 0.07 + fn * 0.025 * j
            col = base if j else mix(base, pal['hi'], 0.25 * smooth(0.2, 0.9, d.z))
            light = (M[0].normal(q) * 0.0 + crown.out(q) * 0.5 + fn * 0.5 + UP * 0.15).normalized()
            B.blooms.cluster(r, q, fn, r.uniform(0.36, 0.44), 'C1' if (j + ti) % 2 else 'C2', col, 0.35, light)
    print('BV azalea-v%d trusses %d' % (k, len(trusses)))
    return B

BOX_LEAF = dict(outer=['#4f9a50', '#5aa656', '#46904a', '#68b05c', '#54a052'], deep=['#1a4026', '#245432', '#2e6436'], hi='#8cc66a')
BOX_V = [
    dict(masses=[(0, 0.0, 0.5, 0.6, 0.5)], berries=[5, 3, 3, 2, 3, 2]),                                   # one clipped ball
    dict(masses=[(25, 0.22, 0.46, 0.5, 0.44), (205, 0.42, 0.34, 0.36, 0.33)], berries=[3, 2, 3, 2, 3, 2]),  # a cloud-pruned pair
    dict(masses=[(0, 0.0, 0.38, 0.74, 0.38)], berries=[3, 2, 3, 3, 2, 2, 2]),                             # a wide clipped dome
]

def berry_sphere(part, c, rad, colfn):
    """a smooth little sphere: a twice-split icosahedron (80 tris), sphere normals"""
    bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=2, radius=1.0)
    idx = {}
    for v in bm.verts:
        n = v.co.normalized(); idx[v.index] = part.vert(c + n * rad, n, colfn(n))
    for f in bm.faces: part.f.append(tuple(idx[v.index] for v in f.verts))
    bm.free()

def build_box(k):
    B = Bush('box', 7300 + k); r = B.rng; cfg = BOX_V[k]
    M = B.masses(cfg['masses'], lumps=0.08, rough=0.025, seed0=k * 23 + 9)
    crown = Crown(M)
    for m in M: mass_mesh(B.fol, m, ['#1a4026', '#245432', '#2e6436', '#427e46'], 0.0, crown.z1, scale=0.95)
    pal = BOX_LEAF
    # berries first: little clusters tucked into the top
    bcs = []
    for n in cfg['berries']:
        for _ in range(400):
            m = M[r.randrange(len(M))] if len(M) > 1 and r.random() < 0.45 else M[0]
            d = unit(r); d.z = abs(d.z) * 0.6 + 0.45; d.normalize()
            c = m.surf(d)
            if crown.buried(c, m, 0.92): continue
            if any((c - q[0]).length < 0.3 for q in bcs): continue
            bcs.append((c, m.normal(c), n)); break
    berry_pts = []
    for c, nrm, n in bcs:
        t1 = nrm.cross(UP if abs(nrm.z) < 0.95 else V(1, 0, 0)).normalized(); t2 = nrm.cross(t1)
        a0 = r.uniform(0, TAU)
        for j in range(n):
            a = a0 + j * TAU / n + r.uniform(-0.3, 0.3); off = 0.0 if n == 1 else r.uniform(0.045, 0.06)
            rad = r.uniform(0.042, 0.052)
            p = c + (t1 * math.cos(a) + t2 * math.sin(a)) * off + nrm * (0.035 + rad * 0.4)
            berry_pts.append((p, rad))
    def bcol(n):
        c = mix('#a8182a', '#e8343a', smooth(-0.7, 0.5, n.z))
        hl = n.dot(V(-0.35, -0.35, 0.87).normalized())
        c = mix(c, '#ffb4a4', 0.85 * smooth(0.82, 0.98, hl))         # the glossy spot
        return c
    for p, rad in berry_pts: berry_sphere(B.berries, p, rad, bcol)
    # the clipped shell: cards lying close to the surface, evenly spaced, facing out; a darker under-layer
    def keep(p): return True
    area = sum(m.rx * m.ry + m.rx * m.rz + m.ry * m.rz for m in M) * 4.19   # ~ ellipsoid surface area
    n_shell = int(area * 72)
    pts = sample_surface(crown, r, n_shell, 0.105, zbias=0.3, zmin=-0.45, out_k=1.0, tries=20000, keep=keep)
    for i, (p, d, m) in enumerate(pts):
        nrm = m.normal(p)
        hz = clamp(p.z / max(0.4, crown.z1))
        c = jitter(pal['outer'][r.randrange(len(pal['outer']))], r, 0.03)
        c = mix(c, pal['deep'][r.randrange(3)], 0.5 * (1 - hz) ** 1.5 + (0.18 if nrm.z < -0.2 else 0))
        c = mix(c, pal['hi'], 0.4 * smooth(0.45, 0.95, nrm.z))                      # the sunlit clipped top
        c = mul(c, 0.94 + 0.12 * vnoise(p, 3.2, 40 + k))                          # soft clipping patches
        q = p + nrm * r.uniform(-0.03, 0.02)
        fn = (nrm + unit(r) * 0.28).normalized()
        light = (nrm * 0.8 + crown.out(p) * 0.2 + UP * 0.06).normalized()
        def sh(qq, cc=c, m=m): return mul(cc, 1.0 - 0.2 * smooth(0.3, 0.0, qq.z))
        B.leaves.cluster(r, q, fn, r.uniform(0.36, 0.44), 'C1' if i % 2 else 'C2', sh, 0.2, light)
    # the under-layer at 0.82: dark, so the clipped ball reads solid
    n_in = int(n_shell * 0.3)
    for i in range(n_in):
        m = M[i % len(M)] if len(M) > 1 else M[0]
        d = unit(r); d.z = d.z * 0.7 + 0.3 * abs(d.z) + 0.1; d.normalize()
        q = m.c + (m.surf(d) - m.c) * r.uniform(0.76, 0.86)
        if crown.buried(q, m, 0.8): continue
        nrm = m.normal(q)
        c = mix(pal['deep'][r.randrange(3)], pal['outer'][0], r.uniform(0.2, 0.4))
        B.leaves.cluster(r, q, (nrm + unit(r) * 0.4).normalized(), r.uniform(0.48, 0.56), 'C1' if i % 2 else 'C2', c, 0.3,
                         (nrm * 0.8 + UP * 0.1).normalized())
    print('BV box-v%d shell %d inner %d berries %d' % (k, len(pts), n_in, len(berry_pts)))
    return B

BUILD = {'hydrangea': build_hydrangea, 'azalea': build_azalea, 'box': build_box}

# ================================================================== export
def make_mat(name):
    mt = bpy.data.materials.new(name); mt.use_nodes = True; nt = mt.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Roughness'].default_value = 0.8 if name != 'berries' else 0.35; bsdf.inputs['Metallic'].default_value = 0.0
    vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'
    nt.links.new(vc.outputs['Color'], bsdf.inputs['Base Color'])
    return mt

def to_object(part):
    me = bpy.data.meshes.new(part.name)
    me.from_pydata([tuple(v) for v in part.v], [], part.f)
    me.update()
    attr = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    uvl = me.uv_layers.new(name='UVMap')
    cols = []; uvs = []
    vi = [0] * len(me.loops); me.loops.foreach_get('vertex_index', vi)
    for i in vi:
        cols.extend(lin(part.c[i])); uvs.extend(part.uv[i])
    attr.data.foreach_set('color', cols)
    uvl.data.foreach_set('uv', uvs)
    me.color_attributes.active_color = attr
    try: me.color_attributes.render_color_index = me.color_attributes.find('Col')
    except Exception: pass
    me.materials.append(make_mat(part.name))
    me.shade_smooth()
    me.normals_split_custom_set_from_vertices([tuple(n) for n in part.n])
    me.update()
    ob = bpy.data.objects.new(part.name, me); bpy.context.scene.collection.objects.link(ob)
    return ob

def check(ob):
    bm = bmesh.new(); bm.from_mesh(ob.data)
    zero = sum(1 for f in bm.faces if f.calc_area() < 1e-9)
    nan = sum(1 for v in bm.verts if any(math.isnan(c) for c in v.co))
    bm.free()
    nn = sum(1 for l in ob.data.loops if any(math.isnan(c) for c in l.normal))
    return dict(zero_area=zero, nan_verts=nan, nan_normals=nn)

def export(B, key, k):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    parts = [B.fol, B.leaves, B.blooms, B.berries]
    obs = [to_object(p) for p in parts if p.v]
    lo = Vector((1e9,) * 3); hi = Vector((-1e9,) * 3)
    for p in parts:
        for v in p.v: lo = Vector(map(min, lo, v)); hi = Vector(map(max, hi, v))
    tri = {p.name: p.tris() for p in parts if p.v}
    name = 'tree-village-bush-%s-v%d' % (key, k)
    print('BV %s tris %d %s' % (name, sum(tri.values()), tri))
    print('BV %s bounds x %.2f..%.2f y %.2f..%.2f z %.2f..%.2f' % (name, lo.x, hi.x, lo.y, hi.y, lo.z, hi.z))
    for ob in obs: print('BV %s check %s %s' % (name, ob.name, check(ob)))
    os.makedirs(os.path.join(HERE, 'blend'), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, 'blend', name + '.blend'))
    for o in bpy.context.scene.objects: o.select_set(o.type == 'MESH')
    out = os.path.join(MODELS, name + '.glb')
    kw = dict(filepath=out, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
              export_attributes=True, export_lights=False, export_cameras=False, export_animations=False,
              export_normals=True, export_texcoords=True, export_materials='EXPORT')
    try:
        bpy.ops.export_scene.gltf(export_vertex_color='ACTIVE', **kw)
    except TypeError as e:
        print('BV export_vertex_color rejected:', e)
        bpy.ops.export_scene.gltf(export_colors=True, **kw)
    print('BV wrote', out)

def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    piece = argv[argv.index('--piece') + 1] if '--piece' in argv else 'all'
    jobs = []
    for tok in piece.replace(' ', ',').split(','):
        if not tok: continue
        if tok == 'all': jobs += [(s, k) for s in BUILD for k in range(3)]
        elif ':' in tok: s, k = tok.split(':'); jobs.append((s, int(k)))
        else: jobs += [(tok, k) for k in range(3)]
    for s, k in jobs:
        export(BUILD[s](k), s, k)

main()
