# poi-north: the chunky toy kit shared by the Windmill Orchard, the Firefly Moon Pond and the Lagoon Pier.
# exec'd by build_poi-north.py after dg_common.py (base_kit primitives, the F stack, put, export_piece).
# Everything is written in the kit call's local game frame (x, y up, z), the F stack mapping it to Blender (x, -z, y).
import json

SCN = json.load(open(os.path.join(HERE, 'kitdump', 'scene.json'), encoding='utf-8'))

class Place:
    """a place's frame and its height grid (read out of the game: kitdump/dump_game.mjs)"""
    def __init__(s, pid):
        d = SCN[pid]; s.id = pid; s.d = d
        s.X, s.Y, s.Z = d['F']['X'], d['F']['Y'], d['F']['Z']
        s.R, s.gs, s.n, s.hg = d['R'], d['gs'], d['n'], d['hg']
    def H(s, x, z):
        fx = clamp((x - (s.X - s.R)) / s.gs, 0, s.n - 1.001); fz = clamp((z - (s.Z - s.R)) / s.gs, 0, s.n - 1.001)
        i, j = int(fx), int(fz); u, v = fx - i, fz - j; g = s.hg
        return (g[j][i] * (1 - u) + g[j][i + 1] * u) * (1 - v) + (g[j + 1][i] * (1 - u) + g[j + 1][i + 1] * u) * v
    def gy(s, x, z): return s.H(s.X + x, s.Z + z) - s.Y
    def L(s, x, z): return (x - s.X, z - s.Z)

# ================================================================== palette
NOAO = []; AOW = []     # vertex ranges with no / a lighter contact shade
W_LT = '#c4986c'; W_MD = '#a97c56'; W_DK = '#7f5c48'; W_DD = '#5e4234'
PLK = ['#bb8c5c', '#a97e52', '#c79a68', '#b28658']
ROPE_LT = '#e4cf98'; ROPE_DK = '#a88c58'
STN_A = '#a79fa8'; STN_HI_A = '#d4ccd0'; STN_LO_A = '#6c6478'
ML = '#4a7234'; MM = '#6f9840'; MH = '#a6c45e'
PAPER_C = '#ffefcf'

# ================================================================== painting and shells
def shade(c, n, top=0.14, bot=0.3):
    """soft modelling for the toon ramp: warm light on what faces up, darker under"""
    if n.z >= 0: return mix(c, '#fff2dc', top * n.z)
    return mul(c, 1 - bot * (-n.z))

def rows(prof, K=8, pos=(0, 0, 0), ry=0.0, rx=0.0, rz=0.0, rfn=None, mat='body', tag='misc', th0=None, uv=None, top=0.14, bot=0.3, jitter=None):
    """a surface of revolution about the local y axis from rows (r, y, colour); r = 0 at an end is a pole. Each row
    keeps its own colour, so bands (rope, hoops, shingle seams) stay crisp; jitter(k, row, c) varies it round the ring."""
    pr = [(a[0], a[1]) for a in prof]
    t = lathe(pr, K, th0=(PI / K if th0 is None else th0), rfn=rfn)
    t.__class__ = PTmp
    ring = [a for a in prof if a[0] > 1e-6]; cols = []
    for i, a in enumerate(ring):
        for k in range(K): cols.append(jitter(k, i, a[2]) if jitter else a[2])
    if prof[0][0] <= 1e-6: cols.append(prof[0][2])
    if prof[-1][0] <= 1e-6: cols.append(prof[-1][2])
    t.xform(F.m @ lm(pos, ry, rx, rz)); t.normals()
    t.c = [shade(c, n, top, bot) for c, n in zip(cols, t.n)]
    put(t, None, tag, mat, uv)
    return t

def solid(t, col, tag='misc', mat='body'):
    """a closed base_kit shell with a (p, n) -> sRGB paint (or a hex)"""
    return put(t, col, tag, mat)

def woodc(base, seed=0, amp=0.1, f=6.0):
    def c(p, n):
        k = mix(mul(base, 0.84), mix(base, '#ffe8c8', 0.16), clamp(n.z * 0.7 + 0.42))
        if n.z < -0.1: k = mul(k, 0.86)
        return mul(k, 1 - amp + 2 * amp * vnoise(p, f, seed))
    return c

def stonec(base=STN_A, hi=STN_HI_A, lo=STN_LO_A, seed=0, amp=0.08):
    def c(p, n):
        k = mix(mul(base, 0.8), mix(base, hi, 0.55), clamp(n.z * 0.72 + 0.34))
        if n.z < 0: k = mix(k, lo, -n.z * 0.6)
        return mul(k, 1 - amp + 2 * amp * vnoise(p, 3.1, seed))
    return c

# ================================================================== stones: chunky rocks with some cut planes, moss icing
def rock(x, y, z, r, sq=0.72, stretch=1.15, yaw=0.0, seed=1, sink=0.28, moss=0.5, tone=(STN_A, STN_HI_A, STN_LO_A), gy=None, wet=None, K=None, tag='rocks', ncut=3):
    """A boulder of radius r on the ground at local (x, y, z), sunk like the kit's. Its faces are lumpy rounded forms with
    a few flat cut planes (their normals follow the plane, so the toon band shows a facet). moss: 0 none, else its share;
    the icing is its own shell, an irregular edge of rounded drips with a light crown and dark undersides, and the stone
    under it is left out (cheaper, nothing pokes through)."""
    rnd = random.Random(seed * 97 + 3)
    rx_, ry_, rz_ = r * stretch, r * sq, r / math.sqrt(stretch)
    cy = y + r * sq * (0.62 - sink)
    M = F.m @ lm((x, cy, z), ry=yaw)
    a0, a1, a2 = rnd.uniform(0, TAU), rnd.uniform(0, TAU), rnd.uniform(0, TAU)
    cuts = []
    for k in range(ncut):
        th = rnd.uniform(0, TAU) if k else rnd.uniform(-0.8, 0.8) + PI * 1.75   # (one faces the game camera's side)
        el = rnd.uniform(0.05, 0.45)
        nv = Vector((math.cos(th) * math.cos(el), math.sin(th) * math.cos(el), math.sin(el))); cuts.append((nv, rnd.uniform(0.8, 0.9)))
    def unit(th, ph):
        w = 1 + 0.09 * math.sin(2 * th + a0) + 0.05 * math.sin(3 * th + ph * 2 + a1) + 0.035 * math.sin(5 * th - a2)
        cp = math.cos(ph)
        return Vector((math.sin(ph) * math.cos(th) * w, math.sin(ph) * math.sin(th) * w, cp * (0.96 if cp > 0 else 1.0) * (0.94 + 0.06 * w)))
    def S(th, ph):
        q = unit(th, ph)
        for nv, d in cuts:
            e = q.dot(nv) - d
            if e > 0: q = q - nv * e
        return M @ Vector((q.x * rx_, q.y * rz_, q.z * ry_))
    centre = M @ Vector((0, 0, 0))
    K = K or (8 if r < 0.45 else 10 if r < 0.72 else 12)
    NJ = 3 if r < 0.45 else 4 if r < 0.72 else 5
    # how far down: past the ground under the stone
    dn = clamp(((cy - (y - 0.14)) / ry_), -0.98, 0.98)
    ph_max = math.acos(-dn)
    if moss > 0:
        drng = random.Random(seed * 31 + 5)
        nd = 3 if r < 0.45 else 4 if r < 0.72 else 5
        drips = []
        for k in range(nd):
            c = drng.uniform(0, TAU) if k % 2 else ((-PI / 2 + drng.uniform(-1.1, 1.1)) % TAU)
            drips.append((c, drng.uniform(0.22, 0.5), drng.uniform(0.3, 0.5)))
        cov = 0.46 + moss * 0.5
        base = lambda th: cov + 0.12 * math.sin(3 * th + seed) + 0.08 * math.sin(5 * th + seed * 2) + 0.055 * math.sin(8 * th + seed * 3)
        he = drip_he(base, drips)
        ph_top = max(0.2, (cov - 0.25) * 0.72)
    else:
        ph_top = None
    # the stone
    t = PTmp(); rings, cs = [], []
    ph0 = ph_top if ph_top else ph_max / NJ
    nr = NJ if ph_top else NJ - 1
    for j in range(nr):
        ph = ph0 + (ph_max - ph0) * j / max(1, nr - 1)
        ring = [S(TAU * k / K, ph) for k in range(K)]; rings.append(ring); cs.append(sum(ring, Vector()) / K)
    ring_surface(t, rings, cs, pole0=None if ph_top else S(0, 0.0), hints=lambda fc, c: fc - centre)
    t.normals()
    # the cut planes read flat: a vertex on a plane takes the plane's normal
    Rm = M.to_3x3()
    for i, v in enumerate(t.v):
        lp = M.inverted() @ v; lq = Vector((lp.x / rx_, lp.y / rz_, lp.z / ry_))
        for nv, d in cuts:
            if lq.dot(nv) > d - 0.012:
                t.n[i] = t.n[i].lerp((Rm @ Vector((nv.x / rx_, nv.y / rz_, nv.z / ry_))).normalized(), 0.8).normalized()
    b, hi, lo = tone
    def sc(p, n):
        k = mix(mul(b, 0.76), mix(b, hi, 0.62), clamp(n.z * 0.78 + 0.32))
        if n.z < 0: k = mix(k, lo, -n.z * 0.7)
        k = mul(k, 0.92 + 0.16 * vnoise(p, 2.7 / max(0.5, r), seed))
        if wet is not None and p.z < wet + 0.1: k = mix(k, mul(lo, 0.82), 0.7 * clamp((wet + 0.1 - p.z) / 0.18))
        return k
    t.c = [sc(p, n) for p, n in zip(t.v, t.n)]
    put(t, None, tag, 'body')
    top_y = cy + ry_ * 0.86
    if moss > 0:
        Nb = 9 if r < 0.45 else 12 if r < 0.72 else 15
        ths = drip_angles(Nb, drips, offs=(-0.62, 0.0, 0.62), min_gap=0.05)
        Tk = max(0.035, 0.085 * r)
        P = lambda th, h: S(th, h)
        def Nn(th, h):
            e = 1e-3
            a_ = S(th + e, h) - S(th - e, h); b_ = S(th, h + e) - S(th, max(1e-3, h - e))
            nn = b_.cross(a_)
            if nn.length < 1e-10: return Z.copy()
            nn.normalize()
            return nn if nn.dot(S(th, h) - centre) >= 0 else -nn
        m = PTmp(); mr, mc = [], []
        for s_, kk in ((0.3, 1.75), (0.65, 1.35)):
            mr.append([S(th, he(th) * s_) + Nn(th, he(th) * s_) * (Tk * kk) for th in ths]); mc.append(centre)
        lip, tuck = [], []
        for th in ths:
            h = he(th); nn = Nn(th, h); dn_ = (S(th, h + 0.02) - S(th, h)).normalized()
            lip.append(S(th, h) + dn_ * Tk * 0.55 + nn * Tk * 0.8)
            tuck.append(S(th, h + 0.04) - nn * 0.02)
        mr += [lip, tuck]; mc += [centre, centre]
        ring_surface(m, mr, mc, pole0=S(0, 0.001) + Z * Tk * 1.9, hints=lambda fc, c: fc - centre)
        m.normals()
        NR = len(ths); cols = []
        for ri in range(4):
            for k in range(NR):
                p = mr[ri][k]; n = m.n[ri * NR + k]
                c = mix(ML, MM, smooth(-0.1, 0.55, n.z)); c = mix(c, MH, smooth(0.6, 1.0, n.z) * 0.6)
                g = vnoise(p, 3.1 / max(0.6, r), seed + 9)
                c = mix(c, MH, clamp((g - 0.58) * 2.2) * 0.32); c = mix(c, ML, clamp((0.42 - g) * 2.2) * 0.3)
                if ri >= 2: c = mix(c, mul(ML, 0.78), 0.5 if ri == 2 else 1.0)      # (the darker underside of the lip)
                cols.append(c)
        cols.append(mix(MM, MH, 0.8))
        m.c = cols
        o0 = A.objs.get('body'); b0 = len(o0['v']) if o0 else 0
        put(m, None, tag, 'body')
        AOW.append(('body', b0, len(A.objs['body']['v']), 0.3))
    return top_y

def flat_stone(x, y, z, r, seed=0, tone=('#b4acb4', '#d8d0d4', '#7e7686'), tag='stones', K=9, moss=0.0):
    """a flat stepping stone, a squat cut pebble with a wobbly outline"""
    rng = random.Random(seed)
    b, hi, lo = tone; a0 = rng.uniform(0, TAU); s = rng.uniform(1.05, 1.3)
    prof = [(r * 1.02, -0.05, lo), (r, 0.03, mix(b, lo, 0.4)), (r * 0.78, 0.075, mix(b, hi, 0.55)), (0.0, 0.085, mix(b, hi, 0.75))]
    rows(prof, K, pos=(x, y, z), ry=rng.uniform(0, PI), rfn=lambda rr, zz, th: rr * (1 + 0.1 * math.sin(2 * th + a0) + 0.05 * math.sin(3 * th + seed)), tag=tag)

# ================================================================== timber and rope
def rope_wrap(x, y, z, r, n=3, K=7, tag='rope', pitch=0.062):
    """rope round a post of radius r: n chunky turns stacked up from y (one shell; the grooves are its dark rows)"""
    prof = [(r + 0.002, y - 0.012, ROPE_DK)]
    for k in range(n):
        prof.append((r + 0.032, y + pitch * (k + 0.5), ROPE_LT))
        prof.append((r + 0.012, y + pitch * (k + 1), ROPE_DK))
    rows(prof, K, tag=tag, pos=(x, 0, z), top=0.1, bot=0.2)

def round_post(x, z, y0, y1, r=0.09, col=W_DK, rope=0, K=8, tag='posts', cap=True):
    grain = lambda k, i, c: mul(c, 0.92 + 0.13 * ((k * 5 + 2) % 3) / 2)
    prof = [(r, y0, mul(col, 0.8)), (r * 0.97, y1 - 0.03, col)]
    if cap: prof += [(r * 0.74, y1 + 0.012, mix(col, '#e8c89c', 0.6)), (0.0, y1 + 0.025, mix(col, '#e8c89c', 0.75))]
    else: prof += [(0.0, y1, col)]
    rows(prof, K, pos=(x, 0, z), jitter=grain, tag=tag)
    if rope: rope_wrap(x, y1 - 0.12 - rope * 0.062, z, r * 0.97, rope, K=K, tag='rope')

def plank(w, h, d, pos, base, seed=0, ry=0.0, rx=0.0, rz=0.0, c=0.024, tag='planks', nosink=False):
    """a planed board for the top view, 18 tris: top face, chamfers, sides, no underside (w along x, d along z)"""
    M = F.m @ lm(pos, ry, rx, rz); hx, hz, hy = w / 2, d / 2, h / 2
    t = PTmp()
    c = min(c, hx * 0.4, hz * 0.4)
    tp = [(hx - c, hy, hz - c), (-hx + c, hy, hz - c), (-hx + c, hy, -hz + c), (hx - c, hy, -hz + c)]
    md = [(hx, hy - c, hz), (-hx, hy - c, hz), (-hx, hy - c, -hz), (hx, hy - c, -hz)]
    bt = [(hx, -hy, hz), (-hx, -hy, hz), (-hx, -hy, -hz), (hx, -hy, -hz)]
    ids = [[t.vert(M @ gl(q)) for q in rg] for rg in (tp, md, bt)]
    cen = M @ gl((0, -hy, 0)); up = (M.to_3x3() @ gl((0, 1, 0))).normalized()
    t.face(ids[0], up)
    for a, b_ in ((0, 1), (1, 2)):
        for k in range(4):
            q = [ids[a][k], ids[a][(k + 1) % 4], ids[b_][(k + 1) % 4], ids[b_][k]]
            fc = sum((t.v[i] for i in q), Vector()) / 4
            t.face(q, fc - cen)
    t.normals()
    def col(p, n):
        lp = M.inverted() @ p
        k = mix(mul(base, 0.72), mix(base, '#ffe6c4', 0.1), clamp(n.z * 0.9 + 0.1))
        return mul(k, 0.93 + 0.14 * vnoise(Vector((p.x * 0.5, p.y * 0.5, p.z)), 4.0, seed))
    t.c = [col(p, n) for p, n in zip(t.v, t.n)]
    put(t, None, tag, 'body')
    return t

def stud(x, y, z, r=0.026, col='#4c3a36', K=5, tag='pegs'):
    """a dark round peg head on a board"""
    t = lathe([(r, -0.004), (0.0, 0.016)], K, th0=0.3); t.__class__ = PTmp
    t.xform(F.m @ lm((x, y, z))); t.normals()
    t.c = [mix(mul(col, 0.8), mix(col, '#b0a8a4', 0.3), clamp(n.z)) for n in t.n]
    put(t, None, tag, 'body')

def tube_col(pts, r, col, K=6, tag='misc', caps=False, mat='body'):
    t = gtube(pts, r, K=K, caps=caps); t.__class__ = PTmp
    t.normals()
    t.c = [col(p, n) if callable(col) else shade(col, n) for p, n in zip(t.v, t.n)]
    put(t, None, tag, mat)
    return t

def rope_span(a, b, sag, r=0.034, n=5, K=5, tag='rope'):
    """a sagging rope between local points, with painted lay (light and dark rows along it)"""
    a, b = Vector(a), Vector(b)
    pts = [tuple(a.lerp(b, k / n) + Vector((0, -math.sin(k / n * PI) * sag, 0))) for k in range(n + 1)]
    return tube_col(pts, r, lambda p, n_: mix(ROPE_DK, ROPE_LT, clamp(n_.z * 0.7 + 0.45)), K=K, tag=tag)

def lantern(lx, ly, lz, r=0.17, h=0.3, tag='lantern', cord=0.07, flicker=1.0, tint=0.55):
    """a round paper lantern hung from local (lx, ly, lz): a wooden cap, a ribbed cream glow body, a foot; the kit's own
    light sits at its centre. Returns the centre's y."""
    c0 = ly - cord
    tube_col([(lx, ly + 0.01, lz), (lx, c0, lz)], 0.016, W_DD, K=4, tag=tag)
    rows([(r * 0.42, c0 - 0.05, W_DD), (r * 0.6, c0 - 0.045, W_DK), (r * 0.56, c0 - 0.0, W_DK), (0.0, c0 + 0.012, W_DK)], 7, pos=(lx, 0, lz), tag=tag)
    prof = []
    N = 5
    for k in range(N + 1):
        tt = k / N; rr = r * (0.5 + 0.5 * math.sin(tt * PI))
        y = c0 - 0.03 - tt * h
        prof.append((rr * (1.03 if k % 2 else 0.985), y, mix(PAPER_C, '#f0a860', 0.42 * abs(tt - 0.5) * 2 + (0.12 if k % 2 == 0 else 0.0))))
    rows(prof, 10, pos=(lx, 0, lz), mat='window_glow', uv=lambda p: (flicker, tint), tag=tag, top=0.0, bot=0.0)
    yb = c0 - 0.03 - h
    rows([(0.0, yb + 0.012, W_DK), (r * 0.54, yb + 0.008, W_DK), (r * 0.58, yb - 0.03, W_DD), (0.0, yb - 0.044, W_DD)], 7, pos=(lx, 0, lz), tag=tag)
    return c0 - 0.03 - h / 2

def lantern_post(x, y, z, h=1.5, face=0.0, r=0.085, tag='lanternpost'):
    """the wooden lantern post of the concept (the kit's lanternPost's footprint): round post, rope at foot and top, an
    arm toward `face` with a knob, the paper lantern hanging at the kit's lamp."""
    round_post(x, z, y - 0.15, y + h, r=r, col=W_DK, rope=0, tag=tag)
    rope_wrap(x, y + 0.06, z, r, 2, K=6, tag='rope'); rope_wrap(x, y + h - 0.34, z, r, 2, K=6, tag='rope')
    rows([(r * 1.24, y + h - 0.012, W_DD), (r * 1.2, y + h + 0.03, W_DD), (0.0, y + h + 0.08, W_DK)], 7, pos=(x, 0, z), tag=tag)
    dx, dz = math.sin(face), math.cos(face); Ln = 0.46
    solid(beam(0.085, 0.085, Ln + 0.14, (x + dx * Ln / 2, y + h - 0.1, z + dz * Ln / 2), ry=face), woodc(W_MD, 3), tag)
    solid(sph(0.05, (x + dx * (Ln + 0.08), y + h - 0.1, z + dz * (Ln + 0.08)), K=6, J=3), woodc(W_DK, 4), tag)
    lx, lz = x + dx * (Ln - 0.06), z + dz * (Ln - 0.06)
    return (lx, lantern(lx, y + h - 0.15, lz, tag=tag), lz)

def fence_run(pts, gy, h=0.78, r=0.085, tag='fence'):
    """the rounded post-and-rail fence of the kit's helper (its posts stay on the kit's colliders)"""
    for i, (x, z) in enumerate(pts):
        y = gy(x, z)
        round_post(x, z, y - 0.15, y + h, r=r, col=W_DK, K=8, tag=tag)
        rope_wrap(x, y + h * 0.56, z, r, 2, K=6, tag='rope')
        if i == 0: continue
        px, pz = pts[i - 1]; py = gy(px, pz)
        for yy in (0.68 * h, 0.36 * h):
            a = Vector((px, py + yy, pz)); b = Vector((x, y + yy, z))
            P = [tuple(a.lerp(b, j / 2) + Vector((0, -0.018 * math.sin(j / 2 * PI), 0))) for j in range(3)]
            tube_col(P, 0.05, lambda p, n: mix(mul(W_LT, 0.72), mix(W_LT, '#ffe6c4', 0.14), clamp(n.z * 0.7 + 0.45)), K=5, tag=tag)

# ================================================================== plants (all on the leaf material: double-sided)
def card(base, axis, nrm, Ln, Wd, c0, c1, fold=0.16, roll=0.0, normal=None, tag='leaves', mat='leaf'):
    """one chunky ovate leaf, 6 tris: a raised midrib, a soft pointed tip; darker at its base, lighter toward the tip"""
    axis = axis.normalized(); side = axis.cross(nrm).normalized(); up = side.cross(axis).normalized()
    if up.dot(nrm) < 0: up = -up
    def P(s, w, lift=0.0): return base + axis * (Ln * s) + side * (Wd * w) + up * (lift * Wd + roll * Ln * s * s)
    t = PTmp()
    q = [P(0, 0), P(0.3, -0.5), P(0.3, 0.5), P(0.42, 0, fold), P(0.74, -0.42), P(0.74, 0.42), P(1, 0)]
    ids = [t.vert(v) for v in q]
    for f in ((0, 1, 3), (0, 3, 2), (1, 4, 3), (2, 3, 5), (4, 6, 3), (5, 3, 6)):
        t.face([ids[i] for i in f], up)
    if normal is not None:
        t.n = [normal(v) for v in q]
    else:
        t.normals()
    t.c = [mul(c0, 0.86), mix(c0, c1, 0.42), mix(c0, c1, 0.42), mix(c0, c1, 0.3), mix(c0, c1, 0.82), mix(c0, c1, 0.82), c1]
    put(t, None, tag, mat)

def blade(x, y, z, Ln, Wd, yaw, lean, c0, c1, droop=0.4, tag='blades', segs=2, mat='body'):
    """a sword-shaped reed or iris blade rising from local (x, y, z): a closed three-sided blade, 15 tris, its ridge outward"""
    M = F.m; base = M @ gl((x, y, z))
    dirn = M.to_3x3() @ gl((math.sin(yaw) * math.sin(lean), math.cos(lean), math.cos(yaw) * math.sin(lean)))
    out = M.to_3x3() @ gl((math.sin(yaw), 0, math.cos(yaw)))
    side = dirn.cross(out).normalized()
    t = PTmp(); ids = []; cs = []
    for i in range(segs + 1):
        s_ = i / (segs + 1)
        c = base + dirn * (Ln * s_) + out * (droop * Ln * s_ * s_)
        w = Wd * (1 - 0.35 * s_)
        ids.append([t.vert(c - side * w), t.vert(c + out * (w * 0.62)), t.vert(c + side * w)]); cs.append(c + out * (w * 0.2))
    tip = t.vert(base + dirn * Ln + out * (droop * Ln))
    for i in range(segs):
        for k in range(3):
            k1 = (k + 1) % 3; q = [ids[i][k], ids[i][k1], ids[i + 1][k1], ids[i + 1][k]]
            t.face(q, sum((t.v[j] for j in q), Vector()) / 4 - cs[i])
    for k in range(3):
        k1 = (k + 1) % 3; q = [ids[segs][k], ids[segs][k1], tip]
        t.face(q, sum((t.v[j] for j in q), Vector()) / 3 - cs[segs])
    t.normals()
    cols = []
    for i in range(segs + 1):
        c = mix(c0, c1, (i / (segs + 1)) ** 0.8); cols += [mul(c, 0.92), mix(c, c1, 0.3), mul(c, 0.92)]
    t.c = cols + [c1]
    put(t, None, tag, mat)

def fern_(x, y, z, rnd, s=1.0, n=5, tag='ferns', c0='#3f7c38', c1='#8cc45a'):
    """a chunky fern: arching folded fronds with a lobed edge (3 segs each)"""
    base = F.m @ gl((x, y + 0.02, z)); up = Z
    a0 = rnd.uniform(0, TAU)
    for k in range(n):
        a = a0 + TAU * k / n + rnd.uniform(-0.3, 0.3)
        Ln = (0.52 + rnd.uniform(0, 0.2)) * s; el = rnd.uniform(0.42, 0.68); Wd = 0.105 * s
        d = F.m.to_3x3() @ gl((math.cos(a) * math.cos(el), math.sin(el), math.sin(a) * math.cos(el)))
        sd = d.cross(up).normalized(); nr = sd.cross(d).normalized()
        if nr.z < 0: nr = -nr
        t = PTmp(); ids = []
        SS = (0.0, 0.3, 0.62, 1.0); WW = (0.35, 1.0, 0.8, 0.0)
        for i, (ss, ww) in enumerate(zip(SS, WW)):
            c = base + d * (Ln * ss) - up * (0.3 * Ln * ss * ss)
            if i == 3: ids.append([t.vert(c)]); break
            ids.append([t.vert(c - sd * (Wd * ww)), t.vert(c + nr * (Wd * ww * 0.3)), t.vert(c + sd * (Wd * ww))])
        for i in range(2):
            for j in range(2): t.face([ids[i][j], ids[i][j + 1], ids[i + 1][j + 1], ids[i + 1][j]], nr)
        for j in range(2): t.face([ids[2][j], ids[2][j + 1], ids[3][0]], nr)
        t.normals()
        cols = []
        for i in range(3):
            cc = mix(c0, c1, (0.15, 0.55, 0.85)[i]); cols += [mul(cc, 0.94), mix(cc, c1, 0.25), mul(cc, 0.94)]
        t.c = cols + [c1]
        put(t, None, tag, 'leaf')

def bloom(pos, nrm, r, petal, centre='#ffd24a', seed=0, tag='flowers', core=True):
    """a toy flower, 15 tris: five rounded petals (a slight cup, deeper colour in the middle), a little yellow dome"""
    rng = random.Random(seed); a0 = rng.uniform(0, TAU)
    nrm = nrm.normalized(); u = (Vector((1, 0, 0)) if abs(nrm.x) < 0.9 else Vector((0, 1, 0))).cross(nrm).normalized(); v = nrm.cross(u)
    t = PTmp()
    ci = t.vert(pos - nrm * r * 0.08)
    out = []
    for k in range(10):
        a = a0 + TAU * k / 10; rr = r if k % 2 == 0 else r * 0.62
        out.append(t.vert(pos + (u * math.cos(a) + v * math.sin(a)) * rr + nrm * (r * 0.16 if k % 2 == 0 else 0.0)))
    for k in range(10): t.face([ci, out[k], out[(k + 1) % 10]], nrm)
    t.n = [nrm.copy() for _ in t.v]
    deep = mix(petal, '#c04070', 0.28) if petal.lower() != '#ffffff' else '#f0e0c8'
    t.c = [deep] + [(mix(petal, '#fff8f0', 0.25) if k % 2 == 0 else mix(petal, deep, 0.45)) for k in range(10)]
    put(t, None, tag, 'leaf')
    if core:
        c = PTmp(); pole = c.vert(pos + nrm * r * 0.22); ring = [c.vert(pos + nrm * r * 0.08 + (u * math.cos(a0 + TAU * k / 5) + v * math.sin(a0 + TAU * k / 5)) * r * 0.27) for k in range(5)]
        for k in range(5): c.face([pole, ring[k], ring[(k + 1) % 5]], nrm)
        c.normals(); c.c = [mix(centre, '#fff0a0', 0.5)] + [mul(centre, 0.85)] * 5
        put(c, None, tag, 'leaf')

def flower_tuft(x, y, z, rnd, n=3, r=0.35, colors=('#ff9dc1', '#ff9dc1', '#ffffff', '#ffc2da'), tag='flowers', size=0.105, leaves=1):
    """a little tuft of toy flowers on broad leaves, on the ground at local (x, y, z)"""
    for i in range(n):
        a = rnd.uniform(0, TAU); d = r * math.sqrt(rnd.random()); fx, fz = x + math.cos(a) * d, z + math.sin(a) * d
        hh = 0.1 + rnd.random() * 0.08
        g = F.m @ gl((fx, y, fz))
        for k in range(leaves):
            la = a + k * 2.4 + rnd.uniform(-0.4, 0.4); dr = Vector((math.cos(la), math.sin(la), 0.62))
            card(g, dr, Vector((-dr.x * 0.5, -dr.y * 0.5, 1)), 0.27, 0.13, '#3f7c38', '#7cb850', tag='flowerleaf')
        nn = Vector((rnd.uniform(-0.3, 0.3), rnd.uniform(-0.45, 0.05), 1))
        bloom(g + Vector((0, 0, hh)), nn, size * rnd.uniform(0.9, 1.15), rnd.choice(colors), seed=rnd.randrange(9999), tag=tag)

def cattail_clump(x, y, z, rnd, n=6, h=0.9, tag='cattails'):
    """cattails: broad blades, seed heads on stalks"""
    for i in range(n):
        a = rnd.uniform(0, TAU); d = rnd.random() * 0.26; px, pz = x + math.cos(a) * d, z + math.sin(a) * d; hh = h + rnd.random() * 0.4
        blade(px, y, pz, hh, 0.052, a, rnd.uniform(0.1, 0.42), '#3f7f3c', '#8cc25c', droop=0.32, tag=tag)
        if i % 2 == 0:
            tube_col([(px, y, pz), (px + 0.02, y + hh * 1.02, pz)], 0.02, '#5f9a48', K=3, tag=tag, mat='body')
            rows([(0.0, y + hh * 1.02 - 0.0, '#6e4630'), (0.058, y + hh * 1.02 + 0.03, '#7c4e34'), (0.058, y + hh * 1.02 + 0.2, '#9c6844'), (0.0, y + hh * 1.02 + 0.25, '#6e8a48')], 6, pos=(px + 0.02, 0, pz), tag=tag, mat='body', top=0.2)

def lily(x, y, z, r, rot, lotus=False, tag='lilies', K=12):
    """a thick lily pad with its notch and a turned rim, optionally with a pink lotus"""
    notch = 0.42; M = F.m @ lm((x, y, z), ry=rot)
    t = PTmp(); cen = t.vert(M @ gl((0, 0.05, 0)))
    def ring(k_, y_):
        return [t.vert(M @ gl((math.cos(notch / 2 + (TAU - notch) * i / K) * r * k_, y_, math.sin(notch / 2 + (TAU - notch) * i / K) * r * k_))) for i in range(K + 1)]
    a = ring(0.62, 0.062); b = ring(0.98, 0.075); c = ring(1.0, 0.035); d_ = ring(0.97, 0.0)
    up = Z.copy()
    for i in range(K):
        t.face([cen, a[i], a[i + 1]], up)
        t.face([a[i], b[i], b[i + 1], a[i + 1]], up)
        fc = (t.v[b[i]] + t.v[c[i + 1]]) / 2 - t.v[cen]; t.face([b[i], c[i], c[i + 1], b[i + 1]], fc)
        t.face([c[i], d_[i], d_[i + 1], c[i + 1]], fc)
    t.normals()
    cols = ['#4c8c3c'] + ['#559a40'] * (K + 1) + ['#80b656'] * (K + 1) + ['#46803a'] * (K + 1) + ['#34642e'] * (K + 1)
    t.c = cols
    put(t, None, tag, 'body')
    if lotus:
        lx, lz = x + r * 0.12, z - r * 0.1
        for rg, (cnt, ln, wd, el, y0) in enumerate(((6, 0.17, 0.075, 0.35, 0.1), (5, 0.125, 0.06, 0.68, 0.12))):
            for k in range(cnt):
                aa = TAU * k / cnt + rg * 0.5 + rot
                g = F.m @ gl((lx, y + y0, lz))
                dr = Vector((math.cos(aa) * math.cos(el), math.sin(aa) * math.cos(el), math.sin(el)))
                nr = Vector((-math.cos(aa) * math.sin(el), -math.sin(aa) * math.sin(el), math.cos(el)))
                card(g, dr, nr, ln, wd * 1.5, '#f46ea6', '#ffe6f0', fold=0.3, roll=-0.12, tag='lotus', mat='body')
        rows([(0.0, y + 0.11, '#e8a820'), (0.045, y + 0.14, '#ffd24a'), (0.0, y + 0.175, '#fff0a0')], 6, pos=(lx, 0, lz), tag='lotus')

def shingle(d, rnd, tilt=0.68, yawj=0.85):
    """(leaf face, leaf axis) for a leaf on a volume at outward direction d: the face turned to the sky, the tip out and down"""
    h = Vector((d.x, d.y, 0)); hl = h.length
    if hl < 0.15: h = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), 0)); hl = max(1e-3, h.length)
    h = h / hl
    ti = tilt * clamp(1.15 - d.z)
    nn = h * math.sin(ti) + Z * math.cos(ti)
    ax = (h - nn * h.dot(nn)).normalized()
    ax = (Matrix.Rotation(rnd.uniform(-yawj, yawj), 3, nn) @ ax).normalized()
    return nn, ax

def diamond(base, axis, nrm, Ln, Wd, c0, c1, normal=None, tag='leaves', mat='leaf', ao=True):
    """the cheapest leaf, 2 tris: a pointed card folded down its midrib, its stem end dark, its tip light"""
    side = axis.cross(nrm).normalized(); up = side.cross(axis).normalized()
    if up.dot(nrm) < 0: up = -up
    q = [base, base + axis * (Ln * 0.45) - side * Wd, base + axis * Ln, base + axis * (Ln * 0.45) + side * Wd]
    q[1] -= up * (Wd * 0.22); q[3] -= up * (Wd * 0.22)
    t = PTmp(); ids = [t.vert(v) for v in q]
    t.face([ids[0], ids[1], ids[2]], up); t.face([ids[0], ids[2], ids[3]], up)
    if normal is not None: t.n = [normal(v) for v in q]
    else: t.normals()
    t.c = [mul(c0, 0.82), mix(c0, c1, 0.5), c1, mix(c0, c1, 0.5)]
    o0 = A.objs.get(mat); b0 = len(o0['v']) if o0 else 0
    put(t, None, tag, mat)
    if not ao: NOAO.append((mat, b0, len(A.objs[mat]['v'])))

def leafy_bush(x, y, z, r, rnd, seed=0, n=None, flowers_=('#ff9dc1', '#ffffff'), c0='#2c6630', c1='#7cb04e', tag='bush', nf=2, ni=None):
    """a bush of layered leaf cards only (bushes-village's recipe in geometry): dark cards deep inside for depth, then a dense
    shell of small leaves, lighter on top, deeper at the foot; no solid mass anywhere"""
    n = n or int(320 * r * r); ni = ni or 14
    cen = F.m @ gl((x, y + r * 0.5, z)); ga = PI * (3 - math.sqrt(5))
    soft = lambda d_: (lambda v, c_=cen, d_=d_: ((v - c_).normalized() * 0.72 + d_ * 0.28).normalized())
    for k in range(ni):
        u = 0.9 - 1.3 * (k + 0.5) / ni; sr = math.sqrt(max(0.0, 1 - u * u)); a = k * ga + seed + 0.7
        d = Vector((sr * math.cos(a), sr * math.sin(a), u)); nn, ax = shingle(d, rnd, yawj=1.5)
        Ln = r * 0.95; q = cen + Vector((d.x * r * 0.62, d.y * r * 0.62, d.z * r * 0.5))
        diamond(q - ax * Ln * 0.45, ax, nn, Ln, r * 0.42, '#1d4628', '#2c6230', normal=soft(d), tag=tag, ao=False)
    for k in range(n):
        u = 1 - 1.3 * (k + 0.5) / n; sr = math.sqrt(max(0.0, 1 - u * u)); a = k * ga + seed
        d = Vector((sr * math.cos(a), sr * math.sin(a), u)); nn, ax = shingle(d, rnd)
        rr = r * rnd.uniform(0.9, 1.08); q = cen + Vector((d.x * rr, d.y * rr, d.z * rr * 0.84))
        t_ = clamp(0.44 + u * 0.56 + rnd.uniform(-0.15, 0.15)); cc = mix(c0, c1, t_)
        Ln = r * 0.44 * rnd.uniform(0.88, 1.15)
        diamond(q - ax * Ln * 0.45, ax, nn, Ln, r * 0.17, mul(cc, 0.9), mix(cc, c1, 0.42), normal=soft(d), tag=tag)
    for k in range(nf):
        a = k * 2.4 + seed; u = 0.5 + 0.16 * (k % 2); sr = math.sqrt(1 - u * u)
        d = Vector((sr * math.cos(a), sr * math.sin(a), u))
        bloom(cen + Vector((d.x * r * 1.06, d.y * r * 1.06, d.z * r * 0.9)), Vector((d.x * 0.5, d.y * 0.5, 1)), 0.1, flowers_[k % len(flowers_)], seed=seed + k, tag=tag)

def bamboo_clump(x, y, z, rnd, n=3, h=2.6, spread=0.3, tag='bamboo'):
    """a chunky bamboo clump: jointed culms (rows with node bulges) and sprays of long leaves"""
    for i in range(n):
        px, pz = x + rnd.uniform(-spread, spread), z + rnd.uniform(-spread, spread); hh = h * rnd.uniform(0.78, 1.08)
        lx, lz = rnd.uniform(-0.18, 0.18), rnd.uniform(-0.18, 0.18)
        prof = [(0.058, y - 0.12, '#5a9044')]; NN = 4
        for k in range(1, NN + 1):
            yy = y + hh * k / NN
            prof += [(0.05, yy - 0.05, '#8cc660' if k % 2 else '#98d06a'), (0.06, yy - 0.012, '#5a9a48')]
        prof[-1] = (0.0, y + hh + 0.01, '#6aa44c')
        off = lambda z_, lx=lx, lz=lz, y=y, hh=hh: (lx * ((z_ - y) / hh) ** 2, -lz * ((z_ - y) / hh) ** 2)
        t = lathe([(a[0], a[1]) for a in prof], 6, th0=0.3, off=off); t.__class__ = PTmp
        t.xform(F.m @ lm((px, 0, pz))); t.normals()
        cols = []
        for a in prof[:-1]: cols += [a[2]] * 6
        cols.append(prof[-1][2]); t.c = [shade(c, nn, 0.1, 0.2) for c, nn in zip(cols, t.n)]
        put(t, None, tag, 'body')
        for k in range(2):
            tt = 0.68 + k * 0.24; a = rnd.uniform(0, TAU)
            base = F.m @ gl((px + lx * tt * tt, y + tt * hh, pz + lz * tt * tt))
            for j in range(2):
                aa = a + (j - 0.5) * 0.9; dr = Vector((math.cos(aa), math.sin(aa), rnd.uniform(-0.45, 0.05)))
                card(base, dr, Vector((-dr.x * 0.3, -dr.y * 0.3, 1)), 0.5, 0.11, '#4c8f3e', '#a2d46e', roll=-0.12, tag=tag)

# ================================================================== little props
def barrel_tub(r=0.21, h=0.42, wood_='#a97c52', soil=None, tag='barrels', K=10, hoop='#584c50', pos=(0, 0, 0)):
    """staves (a light and dark row round the ring) and iron hoops, open top: the rim, then down to its fill"""
    pr = lambda t_: r * (0.86 + 0.14 * math.sin(t_ * PI))
    prof = [(pr(0) * 0.98, 0.0 - 0.02, mul(wood_, 0.72)), (pr(0.1), h * 0.1, hoop), (pr(0.5), h * 0.48, wood_), (pr(0.5), h * 0.52, hoop), (pr(0.9), h * 0.92, hoop), (pr(1), h, mix(wood_, '#ffe6c4', 0.26)), (pr(1) * 0.84, h * 1.0, mix(wood_, '#ffe6c4', 0.14))]
    fill = soil or '#5e4032'
    prof += [(pr(1) * 0.8, h * 0.84, fill), (0.0, h * 0.86, fill)]
    def stave(k, i, c):
        if c == hoop or c == fill: return c
        return mul(c, 1.06 if k % 2 else 0.9)
    rows(prof, K, pos=pos, jitter=stave, tag=tag, top=0.1, bot=0.25)

def ball_fruit(x, y, z, r, kind, k=0, K=7, J=4, tag='fruit', leaf=True):
    """a peach (a soft cleft, a rosy blush, a leaf) or a persimmon (a little flattened, a green calyx) at local (x, y, z)"""
    peach = kind == 'peach'
    base, blush, hi = ('#f8b49a', '#e8646e', '#ffe6cc') if peach else ('#f09228', '#d65c18', '#ffc864')
    c = F.m @ gl((x, y, z))
    t = ellipsoid(c, (r, r, r * (1.0 if peach else 0.86)), K=K, J=J); t.__class__ = PTmp; t.normals()
    bd = Vector((math.sin(k * 2.4), -math.cos(k * 2.4), -0.3)).normalized()
    def col(p, n):
        q = mix(base, blush, clamp(n.dot(bd) * 0.95) * (0.8 if peach else 0.42))
        q = mix(q, hi, clamp(n.z * 1.4 - 0.5) * 0.6)
        if n.z < -0.2: q = mul(q, 1 + 0.32 * n.z)
        return q
    t.c = [col(p, n) for p, n in zip(t.v, t.n)]
    put(t, None, tag, 'body')
    if not leaf: return
    top = c + Vector((0, 0, r * (0.9 if peach else 0.8)))
    if peach:
        a = k * 1.9; dr = Vector((math.cos(a), math.sin(a), 0.5))
        card(top, dr, Vector((-dr.x * 0.4, -dr.y * 0.4, 1)), 0.17, 0.09, '#47903c', '#7cc050', tag='fruit', mat='body')
    else:
        pm = PTmp(); pole = pm.vert(top + Vector((0, 0, 0.018))); a0 = k * 1.1
        rg = [pm.vert(top + Vector((math.cos(a0 + TAU * j / 8) * (0.075 if j % 2 == 0 else 0.03), math.sin(a0 + TAU * j / 8) * (0.075 if j % 2 == 0 else 0.03), -0.012 if j % 2 == 0 else 0.008))) for j in range(8)]
        for j in range(8): pm.face([pole, rg[j], rg[(j + 1) % 8]], Z)
        pm.normals(); pm.c = ['#6a4a2a'] + ['#5c8a34' if j % 2 == 0 else '#46702c' for j in range(8)]
        put(pm, None, 'fruit', 'body')

def basket_(x, y, z, r, h=None, kind=None, n=5, handle=False, color='#d8ae68', tag='baskets', K=9):
    """a woven straw basket (the weave: rows of light and dark, staggered round the ring), a rolled rim, heaped fruit"""
    h = h or r * 0.9
    dk = mul(color, 0.74); lt = mix(color, '#fff0cc', 0.2)
    prof = [(r * 0.72, y - 0.01, dk), (r * 0.84, y + h * 0.12, dk), (r * 0.94, y + h * 0.42, lt), (r * 1.0, y + h * 0.72, dk), (r * 1.05, y + h * 0.98, '#b98c48'), (r * 1.02, y + h * 1.12, lt), (r * 0.86, y + h * 1.04, dk), (r * 0.82, y + h * 0.78, '#5a4230'), (0.0, y + h * 0.76, '#5a4230')]
    rows(prof, K, pos=(x, 0, z), jitter=lambda k, i, c: mul(c, 1.1 if (k + i) % 2 else 0.88) if i < 4 else c, tag=tag, top=0.08)
    if handle:
        P = [(x + math.cos(a) * r * 0.9, y + h * 1.04 + math.sin(a) * r * 0.9, z) for a in [PI * j / 6 for j in range(7)]]
        tube_col(P, 0.024, mix(color, '#7a5a30', 0.45), K=4, tag=tag)
    if kind:
        fr = 0.098 if kind == 'peach' else 0.092
        for i in range(n):
            a = i / max(1, n - 1) * TAU + 0.4; d = 0.0 if i == n - 1 else r * 0.5
            ball_fruit(x + math.cos(a) * d, y + h * (1.02 if i < n - 1 else 1.36), z + math.sin(a) * d, fr, kind, k=i, K=6, J=3, leaf=i % 2 == 0, tag='fruit')

def crate_box(s=0.62, h=None, wood_='#b98c58', lid=True, tag='crates', brace=True, seed=0):
    """a chunky crate: a dark core, three boards a side, corner posts; X-braced on the sides that show; plank lid"""
    h = h or s * 0.85
    rng = random.Random(seed)
    solid(box(s - 0.05, h - 0.03, s - 0.05, (0, (h - 0.03) / 2, 0), r=0.0), mul(wood_, 0.45), tag)
    ph = h / 3
    for side in range(4):
        with at((0, 0, 0), ry=side * PI / 2):
            for i in range(3):
                solid(box(s - 0.09, ph - 0.012, 0.035, (0, ph * (i + 0.5), s / 2 - 0.012), r=0.0), woodc(mul(wood_, rng.uniform(0.92, 1.08)), seed + i, 0.06), tag)
            if brace and side % 2 == 1:
                Ln = math.hypot(s - 0.1, h - 0.08); ang = math.atan2(h - 0.08, s - 0.1)
                solid(box(Ln, 0.06, 0.03, (0, h / 2, s / 2 + 0.012), r=0.0, rz=ang * (1 if side == 1 else -1)), lambda p, n, w=wood_: shade(mul(w, 0.82), n), tag)
    for sx in (-1, 1):
        for sz in (-1, 1):
            solid(box(0.065, h, 0.065, (sx * (s / 2 - 0.022), h / 2, sz * (s / 2 - 0.022)), r=0.0), lambda p, n, w=wood_: shade(mul(w, 0.76), n), tag)
    if lid:
        for i in range(3):
            solid(box(s + 0.01, 0.034, s / 3 - 0.012, (0, h - 0.012, -s / 3 + i * s / 3), r=0.0), woodc(mul(wood_, rng.uniform(0.96, 1.12)), seed + 5 + i, 0.06), tag)

def tray(s=0.62, d=0.5, h=0.2, wood_='#c49a66', tag='crates', seed=0):
    """a shallow open fruit tray of the concept's stall: four chunky boards, a dark inside"""
    solid(box(s - 0.05, h * 0.7, d - 0.05, (0, h * 0.35, 0), r=0.0), mul(wood_, 0.42), tag)
    rng = random.Random(seed)
    for sgn in (-1, 1):
        solid(beam(s, h, 0.06, (0, h / 2, sgn * (d / 2 - 0.03)), c=0.016), woodc(mul(wood_, rng.uniform(0.94, 1.08)), seed + sgn), tag)
        solid(beam(0.06, h, d - 0.1, (sgn * (s / 2 - 0.03), h / 2, 0), c=0.016), woodc(mul(wood_, rng.uniform(0.88, 1.0)), seed + 3 + sgn), tag)

# ================================================================== AO over the terrain
def ground_ao(pl=None, frame=None, skip=('window_glow',), NR=20, DMAX=0.8, K=0.62, weights=None, plane_y=None):
    """ray-traced contact shade, baked into the vertex colours (the toon ramp flattens form otherwise). The ground
    (the place's height grid in the kit's frame) occludes too."""
    weights = weights or {'leaf': 0.5}
    allv, allf = [], []
    for k, o in A.objs.items():
        b = len(allv); allv += o['v']
        for f in o['f']:
            for q in range(1, len(f) - 1): allf.append([f[0] + b, f[q] + b, f[q + 1] + b])
    if pl is not None:
        b = len(allv); N = 36; S = 16.0
        for j in range(N + 1):
            for i in range(N + 1):
                x, z = -S + 2 * S * i / N, -S + 2 * S * j / N
                wx, wz = frame(x, z) if frame else (pl.X + x, pl.Z + z)
                yy = (pl.H(wx, wz) - pl.Y) if frame is None else pl.H(wx, wz)
                allv.append(gl((x, yy, z)))
        for j in range(N):
            for i in range(N):
                a = b + j * (N + 1) + i
                allf += [[a, a + 1, a + N + 2], [a, a + N + 2, a + N + 1]]
    bvh = BVHTree.FromPolygons(allv, allf)
    dirs = []; ga = PI * (3 - math.sqrt(5))
    for k in range(NR):
        r = math.sqrt((k + 0.5) / NR); a = k * ga
        x, y = r * math.cos(a), r * math.sin(a); dirs.append(Vector((x, y, math.sqrt(max(0.0, 1 - x * x - y * y)))))
    for k, o in A.objs.items():
        if k in skip: continue
        w0 = weights.get(k, 1.0)
        no = [(a_, b_) for m_, a_, b_ in NOAO if m_ == k]; aw = [(a_, b_, w_) for m_, a_, b_, w_ in AOW if m_ == k]
        for i, (v, n) in enumerate(zip(o['v'], o['n'])):
            if any(a_ <= i < b_ for a_, b_ in no): continue
            w = w0
            for a_, b_, ww in aw:
                if a_ <= i < b_: w = ww; break
            q = n.to_track_quat('Z', 'Y'); occ = 0.0; org = v + n * 0.015
            for d in dirs:
                hit = bvh.ray_cast(org, q @ d, DMAX)
                if hit[0] is not None: occ += 1 - hit[3] / DMAX
            occ /= NR
            kk = 1 - w * clamp(occ * 1.3) * K
            c = o['c'][i]; o['c'][i] = (c[0] * kk, c[1] * kk, c[2] * kk, 1.0)
