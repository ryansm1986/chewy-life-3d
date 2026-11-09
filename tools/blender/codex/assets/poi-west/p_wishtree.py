# Kite Hill and the Wishing Tree: poi-wishtree-0 (kit call 0 of pois/wishtree.js, y0 = 0.3: the tree, rack, picnic, spool, fences, stones, plants),
# poi-wishtree-1 (kit call 1: the crown's leaf clusters and the plaques on the low limbs; its frame: y - (gT + 3)), poi-wishtree-2 (the swing, its pivot at y = 3).
# What stays the kit's: the two kites (B.anim), the crown's shadow-only masses (ctx.add), the wish slots (kit calls 3-8), the lantern's light, the colliders.
BARK = '#bc9870'; BARK_D = '#987654'; BARK_HI = '#dcb88a'; PLAQUE_C = '#ecca8e'; CORD_C = '#d2503c'
TR = (-1.8, -1.8); RACK = dict(x=1.55, z=-0.4, yaw=PI / 4, w=2.2); SW = dict(x=-1.65, z=1.95, y=2.95, yaw=PI / 2)

def mulberry(seed):
    """the kit's mulberry32, so the crown's clusters land exactly where wishtree.js puts the masses"""
    st = [seed & 0xffffffff]
    def r():
        st[0] = (st[0] + 0x6D2B79F5) & 0xffffffff; t = st[0]
        def imul(a, b): return (a * b) & 0xffffffff
        t = imul(t ^ (t >> 15), t | 1); t ^= (t + imul(t ^ (t >> 7), t | 61)) & 0xffffffff
        return ((t ^ (t >> 14)) & 0xffffffff) / 4294967296
    return r

def crown_clusters(gT):
    r = mulberry(4040); c = []
    for k in range(9):
        a = k / 9 * TAU + r() * 0.3; d = 3.4 + r() * 0.6; cx, cz = TR[0] + math.cos(a) * d, TR[1] + math.sin(a) * d
        front = max(0.0, (math.cos(a) + math.sin(a)) / math.sqrt(2)); y = gT + 4.5 + r() * 0.9 + front * 0.6; c.append(dict(x=cx, y=y, z=cz, R=1.25 + r() * 0.55))
    for k in range(5):
        a = k / 5 * TAU + 0.6 + r() * 0.3; d = 1.6 + r() * 0.4; x, z = TR[0] + math.cos(a) * d, TR[1] + math.sin(a) * d; y = gT + 6.0 + r() * 0.8; c.append(dict(x=x, y=y, z=z, R=1.35 + r() * 0.4))
    c.append(dict(x=TR[0] + 0.2, y=gT + 7.2, z=TR[1] - 0.1, R=1.55))
    return c

def bark_col(seed=0):
    def f(p, n):
        s = Vector((p.x * 5.0, p.y * 5.0, p.z * 0.9))
        g = vnoise(s, 1.0, seed)
        c = mix(BARK_D, BARK, clamp(0.45 + n.z * 0.35 + (g - 0.5) * 1.5))
        return mix(c, BARK_HI, clamp(n.z * 0.7 - 0.2 + (g - 0.6) * 0.8) * 0.55)
    return f

def tree(gT):
    """a thick twisting lobed trunk on flaring roots (one lathe, its lobes growing into the roots at the foot), big limbs, the low swing limb"""
    tx, tz = TR
    rows = 12; K = 20; LOBES = 7; t = PTmp(); ids = []; cs = []
    for j in range(rows + 1):
        s = j / rows; y = gT - 0.35 + s * 3.5; tw = s * 1.3
        cx, cz = tx + math.sin(s * 1.4) * 0.25 * s, tz + math.cos(s * 1.4) * 0.18 * s - 0.18 * s
        r0 = 0.98 - s * 0.42 + 0.9 * max(0.0, 0.28 - s) ** 1.4 * 3.2
        row = []
        for k in range(K):
            a = TAU * k / K
            lob = math.sin(a * LOBES + tw * 3.0)
            amp = 0.07 + 0.42 * max(0.0, 0.3 - s) / 0.3
            rr = r0 * (1 + amp * lob + 0.03 * math.sin(a * 13 + s * 9))
            row.append(V3(cx + math.cos(a) * rr, y, cz + math.sin(a) * rr))
        ids.append(row); cs.append(V3(cx, y, cz))
    ring_surface(t, ids, cs)
    t.normals(); put(t, bark_col(2), 'trunk', 'body')
    # roots flaring into the ground, between the lobes
    for k in range(6):
        a = TAU * k / 6 + 0.3; L_ = 1.65 + (k % 3) * 0.35; ex, ez = tx + math.cos(a) * L_, tz + math.sin(a) * L_
        mx, mz = tx + math.cos(a) * 0.95, tz + math.sin(a) * 0.95
        put(gtube([(tx + math.cos(a) * 0.5, gT + 0.6, tz + math.sin(a) * 0.5), (mx, gT + 0.2, mz), ((mx + ex) / 2, H((mx + ex) / 2, (mz + ez) / 2) + 0.05, (mz + ez) / 2), (ex, H(ex, ez) - 0.1, ez)], lambda s: 0.38 - 0.28 * s, K=6), bark_col(3 + k), 'roots', 'body')
    # limbs from the fork out to the ring clusters
    fork = Vector((tx + 0.25, gT + 2.9, tz - 0.15))
    cr = crown_clusters(gT)
    for i, c in enumerate(cr[:9]):
        end = Vector((tx + (c['x'] - tx) * 0.72, c['y'] - 0.6, tz + (c['z'] - tz) * 0.72))
        st = fork + Vector((0, -0.2 if i < 9 else 0.3, 0)); mid = st.lerp(end, 0.55) + Vector((0, 0.5, 0))
        r0 = 0.36 if i < 9 else 0.28
        put(gtube([tuple(st), tuple(mid), tuple(end)], lambda s, r0=r0: r0 - (r0 - 0.11) * s, K=5, caps=True), bark_col(10 + i), 'limbs', 'body')
    # the low swing limb, with rope wraps where the swing hangs; a second low limb toward the rack
    sw = [Vector((tx - 0.1, gT + 2.0, tz + 0.6)), Vector((SW['x'] - 0.15, gT + SW['y'] + 0.12, SW['z'] - 1.2)), Vector((SW['x'], gT + SW['y'] + 0.05, SW['z'])), Vector((SW['x'] + 0.25, gT + SW['y'] + 0.35, SW['z'] + 1.3))]
    pts = []
    for i in range(10):
        k = i / 9 * 3; j = min(2, int(k)); pts.append(tuple(sw[j].lerp(sw[j + 1], k - j)))
    put(gtube(pts, lambda s: 0.32 - 0.2 * s, K=8), bark_col(40), 'limbs', 'body')
    for s_ in (-1, 1):
        put(gloop([(SW['x'] + 0.2 * math.cos(TAU * k / 8), gT + SW['y'] + 0.06 + 0.2 * math.sin(TAU * k / 8), SW['z'] + s_ * 0.36) for k in range(8)], 0.04, K=4, up=gl((1, 0, 0))), lambda p, n: mix(ROPE_LO, ROPE, clamp(n.z + 0.5)), 'limbs', 'body')
    put(gtube([(tx + 0.6, gT + 2.4, tz + 0.2), (tx + 1.8, gT + 3.05, tz + 0.65), (tx + 3.0, gT + 3.3, tz + 1.1)], lambda s: 0.25 - 0.15 * s, K=6), bark_col(41), 'limbs', 'body')

def plaque(C, kind, x, y, z, ry, cord, s=0.15):
    """a little house-shaped wooden plaque on a red cord (y: the cord's top), a paw or a leaf mark on its face. Cloth bucket; uv.y 1 at the knot."""
    w, h = s, s * 1.45; y0 = y - cord; n0 = len(C.t.v)
    cy, sy = math.cos(ry), math.sin(ry); ux, uz = cy, -sy; fx, fz = sy, cy
    def W_(u, v, d=0.0): return V3(x + ux * u + fx * d, v, z + uz * u + fz * d)
    fn = W_(0, 0, 1) - W_(0, 0, 0); pts = [(-w / 2, y0 - h), (w / 2, y0 - h), (w / 2, y0 - h * 0.25), (0, y0), (-w / 2, y0 - h * 0.25)]
    pc = PLAQUE_C
    fr = [C.v(W_(u, v, 0.02), fn, mix(pc, '#fff0cc', 0.25)) for u, v in pts]; bk = [C.v(W_(u, v, -0.02), -fn, mul(pc, 0.85)) for u, v in pts]
    C.tri(fr[0], fr[1], fr[2]); C.tri(fr[0], fr[2], fr[3]); C.tri(fr[0], fr[3], fr[4])
    C.tri(bk[0], bk[1], bk[2]); C.tri(bk[0], bk[2], bk[3]); C.tri(bk[0], bk[3], bk[4])
    for k in range(5):
        k1 = (k + 1) % 5; (a, b), (c, d) = pts[k], pts[k1]; en = (W_(a + c, b + d - 2 * (y0 - h * 0.55)) - W_(0, 0)).normalized()
        i0, i1 = C.v(W_(a, b, 0.02), en, mul(pc, 0.8)), C.v(W_(c, d, 0.02), en, mul(pc, 0.8)); i2, i3 = C.v(W_(c, d, -0.02), en, mul(pc, 0.7)), C.v(W_(a, b, -0.02), en, mul(pc, 0.7))
        C.quad(i0, i1, i2, i3)
    mk = '#6a9a3a' if kind else '#8a5230'; yc = y0 - h * 0.62
    def disc(u, v, r, n=5, sc=1.0):
        c0 = C.v(W_(u, v, 0.024), fn, mk); rr = [C.v(W_(u + math.cos(TAU * k / n) * r * sc, v + math.sin(TAU * k / n) * r, 0.024), fn, mk) for k in range(n)]
        for k in range(n): C.tri(c0, rr[k], rr[(k + 1) % n])
    if kind:   # a leaf: a pointed kite
        i0 = C.v(W_(0, yc - w * 0.32, 0.024), fn, mk); i1 = C.v(W_(w * 0.2, yc, 0.024), fn, mk); i2 = C.v(W_(0, yc + w * 0.36, 0.024), fn, mk); i3 = C.v(W_(-w * 0.2, yc, 0.024), fn, mk)
        C.tri(i0, i1, i2); C.tri(i0, i2, i3)
    else:      # a paw: a pad and three toes
        disc(0, yc - w * 0.06, w * 0.17, n=6, sc=1.2)
        for t in (-1, 0, 1): disc(t * w * 0.2, yc + w * (0.2 + (0.05 if t == 0 else 0.0)), w * 0.075, n=4)
    # the cord (a thin box) and its knot
    for d in (0,):
        a0 = C.v(W_(-0.012, y, 0.012), fn, CORD_C); a1 = C.v(W_(0.012, y, 0.012), fn, CORD_C); a2 = C.v(W_(0.012, y0, 0.012), fn, CORD_C); a3 = C.v(W_(-0.012, y0, 0.012), fn, CORD_C)
        C.quad(a3, a2, a1, a0)
    if not hasattr(C, 'uvm'): C.uvm = {}
    for v in C.t.v[n0:]: C.uvm[id(v)] = ((x * 3.7 + z * 1.9) % 1.0, 1 - 0.45 * clamp((y - v.z) / (cord + h)))

def rack(gy):
    R = RACK; ux, uz = math.cos(R['yaw']), -math.sin(R['yaw'])
    ends = [(R['x'] + ux * s * R['w'] / 2, R['z'] + uz * s * R['w'] / 2) for s in (-1, 1)]
    for i, (x, z) in enumerate(ends): post_(x, z, 1.55, r=0.1, seed=70 + i, K=6, wraps=0)
    for y, r, c0 in ((1.45, 0.08, WD_HI), (1.0, 0.06, WD)):
        a = Vector((ends[0][0] - ux * 0.18, gy + y, ends[0][1] - uz * 0.18)); b = Vector((ends[1][0] + ux * 0.18, gy + y, ends[1][1] + uz * 0.18))
        put(gtube([tuple(a), tuple(a.lerp(b, 0.5)), tuple(b)], lambda s, r=r: r, K=6), lambda p, n, c0=c0: mix(WD_LO, c0, clamp(n.z * 0.7 + 0.55)), 'rack', 'body')
        for x, z in ends:
            t = gloop([(x + (-uz) * (r + 0.03) * 0 + uz * 0 + math.cos(TAU * k / 6) * (r + 0.035) * (-uz), gy + y + math.sin(TAU * k / 6) * (r + 0.035), z + math.cos(TAU * k / 6) * (r + 0.035) * ux) for k in range(6)], 0.03, K=3, up=gl((ux, 0, uz)))
            put(t, lambda p, n: mix(ROPE_LO, ROPE, clamp(n.z + 0.5)), 'rack', 'body')
    # the plaques already there on the top log, the lantern hung by the right post
    C = Cards('plaques', 'cloth')
    for i in range(7):
        u = -0.9 + i * 0.3; plaque(C, i % 2, R['x'] + ux * u, gy + 1.43, R['z'] + uz * u, R['yaw'], 0.09 + (i % 3) * 0.05, 0.15)
    uvm = C.uvm; C.flush(uv=lambda p: uvm[id(p)])
    x, z = ends[1]; lantern_paper((x + ux * 0.17, gy + 1.38, z + uz * 0.17), r=0.13, h=0.24, cord=0.03, color='#fff0d0', K=7)

def picnic(x, z, rot):
    """the coral-and-cream check blanket lying on the grass (crisp cells), the wicker basket, two mugs"""
    W_, D_, nx, nz = 2.0, 1.5, 8, 6; c, s = math.cos(rot), math.sin(rot)
    def at_(lx, lz):
        wx, wz = x + lx * c + lz * s, z - lx * s + lz * c
        return V3(wx, H(wx, wz) + 0.04, wz)
    C = Cards('picnic', 'body'); coral, mid, cream = '#ec8078', '#f6bcae', '#fff3e2'
    for i in range(nx):
        for j in range(nz):
            a, b = i % 2, j % 2; col = coral if a and b else (mid if a or b else cream)
            x0, x1 = -W_ / 2 + i * W_ / nx, -W_ / 2 + (i + 1) * W_ / nx; z0, z1 = -D_ / 2 + j * D_ / nz, -D_ / 2 + (j + 1) * D_ / nz
            q = [C.v(at_(u, v), Z, col) for u, v in ((x0, z0), (x1, z0), (x1, z1), (x0, z1))]
            C.quad(q[0], q[3], q[2], q[1])
    C.flush()
    bx = x + 0.55 * c + 0.2 * s; bz = z - 0.55 * s - 0.2 * c - 0.2; by = H(bx, bz) + 0.04
    with at((bx, by, bz), ry=rot):
        def wv(p, n):
            q = (int(p.z * 20) + int((p.x + p.y) * 18)) % 2
            return mix(mul('#c58a48', 0.8), '#e0a862', 0.3 + 0.55 * q + 0.15 * clamp(n.z))
        put(box(0.54, 0.3, 0.38, (0, 0.15, 0), r=0.04, extra=(3, 2, 2)), wv, 'basket', 'body')
        put(box(0.57, 0.07, 0.41, (0, 0.33, 0), r=0.025), lambda p, n: mix('#a06c36', '#d09a58', clamp(n.z)), 'basket', 'body')
        put(gtube([(0.19 * math.cos(PI * k / 5), 0.35 + 0.18 * math.sin(PI * k / 5), 0) for k in range(6)], lambda q: 0.024, K=4, caps=False), lambda p, n: mix('#7a4a2a', '#b07a48', clamp(n.z + 0.3)), 'basket', 'body')
        put(box(0.08, 0.09, 0.03, (0, 0.28, 0.2), r=0.0), flat('#7a4a2a'), 'basket', 'body')
    for dx, dz, cc in ((-0.25, 0.15, '#5a88c4'), (0.05, 0.3, '#fff3e2')):
        cx = x + dx * c + dz * s; cz = z - dx * s + dz * c - 0.1; cy = H(cx, cz) + 0.04
        put(glathe([(0.0, 0.0), (0.06, 0.0), (0.066, 0.12), (0.052, 0.122), (0.0, 0.085)], K=8, pos=(cx, cy, cz)), lambda p, n, cc=cc: mix(mul(cc, 0.8), cc, clamp(n.z * 0.6 + 0.5)) if n.z < 0.8 else '#7a5436', 'picnic', 'body')
        put(gloop([(cx + 0.065 + 0.03 * math.cos(TAU * k / 5), cy + 0.065 + 0.03 * math.sin(TAU * k / 5), cz) for k in range(5)], 0.014, K=3, up=gl((0, 0, 1))), flat(cc), 'picnic', 'body')

def spool_(x, z):
    y = H(x, z)
    put(cyl(0.03, 0.035, 0.4, (x, y + 0.1, z), K=5), lambda p, n: mix(WD_LO, WD, clamp(n.z + 0.5)), 'spool', 'body')
    with at((x, y + 0.2, z), ry=0.6):
        put(gtube([(-0.1, 0, 0), (0.1, 0, 0)], lambda s: 0.07, K=7, caps=False), flat('#f4ead6'), 'spool', 'body')
        for s in (-1, 1):
            put(cyl(0.12, 0.12, 0.035, (s * 0.12, 0, 0), K=8, rz=PI / 2), lambda p, n: mix(WD_LO, WD_HI, clamp(n.z + 0.6)), 'spool', 'body')
        put(gtube([(-0.22, 0, 0), (0.22, 0, 0)], lambda s: 0.022, K=4), flat(WD_LO), 'spool', 'body')

def kite_string(a, b, sag=0.6, n=10, wid=0.022):
    """the kite string: a fine ribbon facing up and toward the camera side (the ink shell is drawn BackSide, so from the camera it stays a fine line)"""
    C = Cards('strings', 'body'); prev = None; fac = Vector((0, -0.7, 0.7)).normalized()
    pts = [Vector(a).lerp(Vector(b), i / n) - Vector((0, math.sin(i / n * PI) * sag, 0)) for i in range(n + 1)]
    for i, q in enumerate(pts):
        d = (gl(tuple(pts[min(i + 1, n)])) - gl(tuple(pts[max(i - 1, 0)]))).normalized(); s = d.cross(fac).normalized(); nn = s.cross(d).normalized()
        if nn.dot(fac) < 0: nn = -nn
        c = V3(*q); l, r = C.v(c + s * (wid / 2), nn, '#f8f0de'), C.v(c - s * (wid / 2), nn, '#f8f0de')
        if prev: C.quad(prev[0], prev[1], r, l)
        prev = (l, r)
    C.flush()

# ================================================================== the hero camphor's crown: atlas cards as the village trees build them (trees-village build_round)
AT_ = 512
UVR_ = {'C1': (2 / AT_, 2 / AT_, 254 / AT_, 254 / AT_), 'C2': (2 / AT_, 258 / AT_, 254 / AT_, 510 / AT_)}   # (the kit's rects, 2 px inset; v = canvas row / 512, export_glb compensates the exporter's flip)
CROWN_PAL = dict(outer=['#6eb452', '#7cc05a', '#8ecc62', '#62a84c', '#74b856'], deep=['#245a36', '#2f6e3a', '#468a42'], hi='#aed66e')
CROWN_CLUMPS, CROWN_FILL = 252, 420
def cunit(r):
    while True:
        v = Vector((r.uniform(-1, 1), r.uniform(-1, 1), r.uniform(-1, 1))); l = v.length
        if 0.05 < l <= 1: return v / l
def cjit(c, r, a=0.035):
    c = srgb(c); k = r.uniform(-a, a); return tuple(clamp(x + k + r.uniform(-a, a) * 0.4) for x in c)
class CMass:
    def __init__(s, x, y, z, R, seed):
        s.c = Vector((x, y, z)); s.rx = s.ry = R * 1.02; s.rz = R * 0.88; s.seed = seed; rr = random.Random(seed * 7919 + 101); s.L = []
        for _ in range(5):
            u = rr.uniform(-0.6, 1.0); th = rr.uniform(0, TAU); q = math.sqrt(max(0.0, 1 - u * u))
            s.L.append((Vector((q * math.cos(th), q * math.sin(th), u)), 0.4 + rr.random() * 0.6))
    def surf(s, d):
        k = 1 - 0.34 * 0.3 + sum(0.34 * a * max(0.0, d.dot(dd)) ** 3 for dd, a in s.L) + 0.07 * (vnoise(d, 2.2, s.seed) - 0.5) * 2
        return s.c + Vector((d.x * s.rx, d.y * s.ry, d.z * s.rz)) * k
    def inside(s, p, f=0.9):
        q = p - s.c; return (q.x / s.rx) ** 2 + (q.y / s.ry) ** 2 + (q.z / s.rz) ** 2 < f * f

def hero_crown(masses, keep_clear=None):
    r = random.Random(9404); M = [CMass(x, y, z, R, i) for i, (x, y, z, R) in enumerate(masses)]
    cen = sum((m.c for m in M), Vector()) / len(M); z0 = min(m.c.z - m.rz for m in M); z1 = max(m.c.z + m.rz for m in M); pal = CROWN_PAL
    def out(p):
        q = p - cen; q.z *= 1.6; return q.normalized() if q.length > 1e-6 else Z.copy()
    def depth(p):
        best = 0.0
        for m in M:
            q = p - m.c; e = math.sqrt((q.x / m.rx) ** 2 + (q.y / m.ry) ** 2 + (q.z / m.rz) ** 2)
            best = max(best, 1.0 - abs(1.0 - e) if e < 1 else 1.0)
        return best
    C = Cards('crown', 'cards_round'); uvm = {}; n = [0]
    def card(p, fn, size, rect, col, light, tilt=0.55):
        """a cluster card centred at p, facing fn (roughly tangent to the clump), randomly rolled, tilted a little (Cards.cluster in trees-village)"""
        fn = fn.normalized(); t = fn.cross(Vector((r.uniform(-0.5, 0.5), r.uniform(-0.5, 0.5), 1)).normalized())
        if t.length < 1e-3: t = Vector((1, 0, 0))
        t.normalize(); bt = fn.cross(t).normalized(); rot = r.uniform(0, TAU)
        if keep_clear is not None and (p - keep_clear[0]).length < keep_clear[1]: return
        ax = t * math.cos(rot) + bt * math.sin(rot); ay = (fn.cross(ax).normalized() + fn * r.uniform(-1, 1) * tilt).normalized()
        ax, ay = ax * (size / 2), ay * (size / 2); u0, v0, u1, v1 = UVR_[rect]; ids = []
        for q, uv in ((p - ax - ay, (u0, v0)), (p + ax - ay, (u1, v0)), (p + ax + ay, (u1, v1)), (p - ax + ay, (u0, v1))):
            i = C.v(q, light, col(q)); uvm[id(C.t.v[i])] = uv; ids.append(i)
        C.quad(*ids); n[0] += 1
    # the clumps: on the masses' surfaces, top-biased (the camera looks down), none buried in a neighbour
    amax = max(m.rx * m.ry for m in M); pts = []; rmin = 0.62
    for _ in range(40000):
        if len(pts) >= CROWN_CLUMPS: break
        m = M[r.randrange(len(M))]
        if r.random() > (m.rx * m.ry) / amax: continue
        d = cunit(r); d.z = d.z * 0.55 + 0.45 * abs(d.z) + 0.135; d.normalize()
        if d.z < -0.65: continue
        p = m.c + (m.surf(d) - m.c) * 0.9
        if any(o is not m and o.inside(p, 0.86) for o in M) or any((p - q[0]).length < rmin for q in pts): continue
        pts.append((p, d, m))
    print('PW crown clumps', len(pts))
    for p, d, m in pts:
        hz = clamp((p.z - z0) / max(0.5, z1 - z0)); under = d.z < -0.2; rc = 0.6
        base = cjit(pal['outer'][r.randrange(5)], r); base = mix(base, pal['deep'][r.randrange(3)], 0.42 * (1 - hz) ** 1.4 + (0.24 if under else 0))
        core = mix(pal['deep'][r.randrange(3)], base, 0.34)
        qn = p - m.c; co = (Vector((qn.x / m.rx ** 2, qn.y / m.ry ** 2, qn.z / m.rz ** 2 * 0.7)).normalized() * 0.8 + out(p) * 0.2).normalized()
        def shade(q, p=p):
            return (0.86 + 0.18 * smooth(0.15, 1.15, (q - p).length / rc)) * (0.7 + 0.3 * smooth(0.3, 1.0, depth(q)))
        n_in, n_sh = 3, (7 if under else 11)
        for j in range(n_in + n_sh):
            if j < n_in:
                q = p - d * (rc * r.uniform(0.25, 0.55)) + cunit(r) * (rc * 0.35); fn = (d + cunit(r) * 0.4).normalized(); sz = r.uniform(1.1, 1.3); c0 = cjit(core, r, 0.03)
            else:
                u = (cunit(r) + d * 1.25 + Z * 0.55).normalized(); q = p + u * (rc * r.uniform(0.6, 1.08)); fn = (u + Z * 0.3).normalized(); sz = r.uniform(0.85, 1.12); c0 = cjit(base, r, 0.03)
                if u.z > 0.55: c0 = mix(c0, pal['hi'], 0.25 * smooth(0.55, 1.0, u.z) * (0.4 + 0.6 * hz))
            light = (co * 0.55 + fn * 0.45 + Z * 0.15).normalized()
            card(q, fn, sz, 'C1' if j % 2 else 'C2', (lambda cc, sh=shade: (lambda qq: mul(cc, sh(qq))))(c0), light)
    # dark cards deep in the volume: gaps show leaves in shade, never a solid shape or the sky
    for i in range(CROWN_FILL):
        m = M[i % len(M)]; d = cunit(r); d.z = abs(d.z) * 0.8 + 0.1; d.normalize()
        q = m.c + (m.surf(d) - m.c) * r.uniform(0.42, 0.74)
        c0 = mix(pal['deep'][r.randrange(3)], pal['outer'][0], r.uniform(0.08, 0.28))
        card(q, (d + cunit(r) * 0.5).normalized(), 1.2 * r.uniform(0.9, 1.15), 'C1' if i % 2 else 'C2', (lambda cc: (lambda qq: cc))(c0), (out(q) * 0.7 + Z * 0.1).normalized(), 0.6)
    C.fix_winding = lambda: None     # (double-sided cards: each keeps the winding its corners were laid out in, so every card maps the atlas the same way round)
    C.flush(uv=lambda p: uvm[id(p)])
    return n[0]

def build_wishtree():
    use_site('wishtree')
    gT = H(TR[0], TR[1])
    tree(gT)
    gyR = H(RACK['x'], RACK['z'])
    rack(gyR)
    picnic(-4.35, 3.6, -0.35)
    spool_(3.35, 1.55)
    k2 = (3.7, gT + 8.4, -2.4); k1 = (TR[0] - 2.0, gT + 7.6, TR[1] + 1.9)
    kite_string((3.35, H(3.35, 1.55) + 0.2, 1.55), k2)
    kite_string((k1[0], k1[1] - 0.5, k1[2]), (k1[0] + 0.4, k1[1] - 1.9, k1[2] + 0.6), sag=0.05, n=4)
    rail_fence(((-0.3, 7.55), (0.55, 6.5), (1.3, 5.6)), h=0.75, r=0.08, seed=4)
    rail_fence(((2.95, 3.5), (4.1, 2.05), (5.3, 0.6), (6.3, -0.75)), h=0.75, r=0.08, seed=9)
    for i, (x, z, r) in enumerate(((-6.9, -0.4, 1.15), (-6.1, -4.6, 1.0), (-3.6, -6.7, 0.85), (2.3, -5.9, 0.8), (-7.0, 3.6, 0.7), (-0.9, 7.4, 0.45), (5.7, 1.6, 0.42), (3.6, -3.6, 0.5), (-5.2, -6.3, 0.55))):
        ground_rock(x, z, r, moss=0.5, sink=0.25, seed=600 + i, lod=1 if r >= 0.7 else 0, cuts=3)
    for i, (x, z, n_, h_) in enumerate(((5.6, -4.2, 2, 4.0), (6.6, -2.2, 2, 3.6))): bamboo_(x, z, n=n_, h=h_, spread=0.45, seed=620 + i, sprays=3)
    shrub_(-6.3, 5.6, 0.65, flowers=['#f1afc8', '#ff93b6', '#ffc4d8', '#fff6ee'], nf=9, fs=0.1, seed=630, density=0.8)
    shrub_(0.4, 0.9, 0.5, color='#62ad45', seed=631, density=0.85)
    for i, (x, z) in enumerate(((-0.9, -0.1), (-3.2, -0.3), (2.8, 0.2), (4.6, -1.0))): fern_(x, z, s=0.85, seed=640 + i)
    w1 = ['#ffb6cf', '#f1afc8', '#fff6ee', '#ffd877']; w2 = ['#fff6ee', '#c8d8ff', '#ffb6cf']
    for i, (x, z, c) in enumerate(((-1.4, 6.6, 0), (0.6, 4.4, 1), (2.6, 2.3, 0), (4.6, 0.5, 1), (-3.2, 5.3, 0), (-5.9, 4.6, 1), (1.9, -2.1, 0), (1.2, 3.4, 0))):
        flowers_(x, z, n=3, r=0.42, colors=w2 if c else w1, seed=650 + i, nleaf=1)
    finish('poi-wishtree-0', place='wishtree', K=0.4, weights={'leaf': 0.5})
    # ---- the crown (kit call 1): its frame is local y - (gT + 3). The trees' own textured cards (material cards_round): clumps over the kit's 15 masses, inner and outer
    use_site('wishtree'); S.water = -99
    OY = gT + 3.0
    n_cards = hero_crown([(c['x'], -c['z'], c['y'] - OY, c['R']) for c in crown_clusters(gT)], keep_clear=(Vector((TR[0] - 2.0, -(TR[1] + 1.9), gT + 7.72 - OY)), 1.0))
    print('PW crown cards', n_cards)
    # the plaques on the low limbs, as wishtree.js hangs them
    C = Cards('plaques', 'cloth')
    at_ = ((SW['x'] - 0.05, gT + 2.95, SW['z'] - 0.8, 0.3), (SW['x'] + 0.1, gT + 3.15, SW['z'] + 0.95, 0.4), (TR[0] + 1.6, gT + 2.8, TR[1] + 0.7, 0.25), (TR[0] + 2.5, gT + 3.1, TR[1] + 0.95, 0.35), (TR[0] + 2.0, gT + 2.95, TR[1] + 0.85, 0.3))
    for i, (x, y, z, cord) in enumerate(at_): plaque(C, i % 2, x, y - OY, z, 0.4 + i * 0.7, cord, 0.16)
    uvm = C.uvm; C.flush(uv=lambda p: uvm[id(p)])
    export_glb('poi-wishtree-1', place='wishtree')
    # ---- the swing (kit call 2: its pivot at y = 3 in its frame; the seat hangs L below)
    use_site('wishtree'); S.water = -99
    L_ = (gT + SW['y']) - 0.47 - H(SW['x'], SW['z'])
    with at((0, 3.0, 0)):
        for s in (-1, 1):
            put(gtube([(s * 0.36, 0, 0), (s * 0.36, -L_ / 2, 0), (s * 0.36, -L_ + 0.06, 0)], lambda q: 0.032, K=5, caps=False), lambda p, n: mix(ROPE_LO, ROPE, 0.5 + 0.5 * math.sin(p.z * 45)), 'swing', 'body')
            put(sph(0.052, (s * 0.36, -L_ + 0.1, 0), sc=(1, 1.4, 1), K=6, J=3), lambda p, n: mix(ROPE_LO, ROPE, clamp(n.z + 0.5)), 'swing', 'body')
            put(box(0.04, 0.09, 0.36, (s * 0.25, -L_ - 0.01, 0), r=0.0), flat(WD_LO), 'swing', 'body')
        put(box(0.9, 0.085, 0.34, (0, -L_, 0), r=0.03), lambda p, n: mix(mul(WD, 0.74), mix(WD_HI, '#ffe8c0', 0.2), clamp(n.z)), 'swing', 'body')
    export_glb('poi-wishtree-2', place='wishtree')
