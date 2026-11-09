# dg-onsen snow kit: exec'd by build_dg-onsen.py after dg_common.py. The snow, ice and bath-wood helpers are ported from
# the finished onsen props (tools/blender/codex/assets/rg-onsen: onsen_kit.py snow_col / icicle / pillow, build_rg-onsen.py
# icing / rect_icing / oke_bucket / log_piece), re-tuned to the Ice Cavern's palette (src/dungeon/zoneKits/onsen.js P).
# Routing: base_kit helpers call add(t, col, tag, glow); it lands in the current material bucket (MATO, default body).
# The kit's onsen pieces only carry body / glow / cloth / water, so a 'stone' put joins body here.

_put_dg = put
def put(t, col, tag, mat='body', uv=None):
    return _put_dg(t, col, tag, 'body' if mat == 'stone' else mat, uv)

MATO = None
def add(t, col, tag='misc', glow=False):
    return put(t, col, tag, 'glow' if glow else (MATO or 'body'), (lambda p: GLOWUV[0]) if glow else None)

GLOWUV = [(0.6, 0.0)]           # (flicker, tint) for glow parts added through add()
class mat_as:
    def __init__(self, name): self.name = name
    def __enter__(self):
        global MATO; self.prev = MATO; MATO = self.name
    def __exit__(self, *e):
        global MATO; MATO = self.prev

# ------------------------------------------------------------------ the cavern palette (sRGB)
P_ICE = dict(dk='#2a568f', ice='#4f82c2', lt='#8fbfea', hi='#e0f2ff')
SNOW_HI, SNOW_SH, SNOW_LO = '#e8eef8', '#bccae6', '#96aad6'
CSTONE = '#8c94a6'
IRON = '#4a4852'

def snow_col(seed=0):
    """soft snow by normal: near-white on top, periwinkle on the sides, a deeper blue underneath, a broad painted
    variation (never pure white: the toon band lifts it)"""
    def f(p, n):
        up = n.z
        c = mix(SNOW_SH, SNOW_HI, clamp(up * 1.3 - 0.02))
        c = mix(c, SNOW_LO, clamp(-up - 0.05) * 0.85)
        return mul(c, 0.955 + 0.06 * vnoise(p, 2.3, seed))
    return f
SNOW = snow_col(3)

def ice_col(ytop, L):
    """an icicle: pale at the root, clear blue toward the tip"""
    def f(p, n):
        u = clamp((ytop - p.z) / L)
        return mul(mix('#e8f6ff', P_ICE['lt'], u * 0.9), 0.9 + 0.14 * clamp(n.z + 0.6))
    return f

def icicle(x, y, z, L, tag='ice', r0=None):
    """a chunky icicle hanging from (x, y, z) game-local, length L (>= 3 cm thick at the root)"""
    r0 = r0 or (0.022 + L * 0.1)
    t = lathe([(0.0, -L), (r0 * 0.45, -L * 0.62), (r0 * 0.8, -L * 0.25), (r0, 0.0), (0.0, 0.016)], 5, th0=(x * 7 + z * 3) % 1.0)
    t.xform(F.m @ lm((x, y + 0.01, z)))
    add(t, ice_col(F.W((x, y, z)).z, L), tag)

def pillow(pos, r, sq=0.42, seed=0, sx=1.0, sz=1.0, K=9, J=4, ry=0.0, tag='snow', col=None, fine=True, rx=0.0, rz=0.0):
    """a soft lumpy squashed dome centred at pos (half of it buried)"""
    ph = seed * 1.37 + 0.4
    ext = r * max(sx, sz)                       # (big pillows get enough segments that the outline reads round, not a plate)
    if ext >= 0.15: K, J = max(K, 18), max(J, 6)
    elif ext >= 0.085: K, J = max(K, 14), max(J, 5)
    prof = [(math.sin(math.pi * j / J), -math.cos(math.pi * j / J)) for j in range(J + 1)]
    prof[0] = (0.0, -1.0); prof[-1] = (0.0, 1.0)
    t = lathe(prof, K, th0=ph, rfn=lambda rr, z, th: rr * (1 + 0.11 * math.sin(3 * th + ph) + 0.07 * math.sin(5 * th + ph * 2.1)))
    t.xform(F.m @ lm(pos, ry=ry, rx=rx, rz=rz, s=(r * sx, r * sq, r * sz)))
    add(t, col or SNOW, tag)

def drift(pos, r, h, seed=0, sx=1.0, sz=1.0, ry=0.0, K=16, tag='drift'):
    """a snow drift on the floor: a soft lobed mound (never a flat plate: at least ~0.4 r high) whose foot tucks under
    the ground"""
    ph = seed * 1.7; h = max(h, 0.42 * r * min(sx, sz))
    t = lathe([(0.0, -0.03), (1.0, -0.03), (0.97, 0.14), (0.86, 0.4), (0.68, 0.64), (0.44, 0.84), (0.2, 0.97), (0.0, 1.0)], K, th0=ph,
              rfn=lambda rr, z, th: rr * (1 + 0.12 * math.cos(3 * th + ph) + 0.06 * math.sin(5 * th + seed)))
    t.xform(F.m @ lm(pos, ry=ry, s=(r * sx, h, r * sz)))
    add(t, SNOW, tag)

def gsurf(rings, pole0=None, pole1=None, closed=False):
    """a ring surface from game-frame rings of points (each the same length), optional game-frame poles"""
    tm = Tmp()
    R = [[F.W(p) for p in r] for r in rings]
    cs = [sum(r, Vector()) / len(r) for r in R]
    ring_surface(tm, R, cs, F.W(pole0) if pole0 else None, F.W(pole1) if pole1 else None, closed=closed)
    return tm

def icing(Ps, he, thick, ths, J, inner):
    """a snow icing cap over a top surface Ps(u, th) -> game point (u = 0 the top pole, growing outward): it covers
    u < he(th) with thickness thick(th, s), then a rolled lip that bulges proud and curls back under, tucked into the
    surface; closed by a fan to `inner` (a game point inside the base solid). (rg-onsen's)"""
    V3 = lambda p: Vector(p)
    def N(u, th):
        e = 1e-3; uu = max(u, 0.06)
        a = V3(Ps(uu + e, th)) - V3(Ps(uu - e, th)); b = V3(Ps(uu, th + e)) - V3(Ps(uu, th - e))
        n = a.cross(b)
        if n.length < 1e-12: return Vector((0, 1, 0))
        n.normalize(); q = V3(Ps(uu, th)); o = Vector((q.x, 0, q.z))
        o = o.normalized() if o.length > 1e-6 else Vector((0, 0, 0))
        return n if n.y + 0.8 * n.dot(o) >= 0 else -n
    def D(u, th):
        e = 1e-3; return (V3(Ps(u + e, th)) - V3(Ps(u, th))).normalized()
    rings = []
    for j in range(1, J + 1):
        s = (j / J) ** 1.3
        rings.append([V3(Ps(he(th) * s, th)) + N(he(th) * s, th) * thick(th, s) for th in ths])
    lipr, curl, tuck = [], [], []
    for th in ths:
        u = he(th); n = N(u, th); dn = D(u, th); tk = thick(th, 1.0); p = V3(Ps(u, th))
        lipr.append(p + dn * tk * 0.5 + n * tk * 0.82)
        curl.append(p + dn * tk * 0.72 + n * tk * 0.28)
        tuck.append(V3(Ps(u - 0.006, th)) - n * 0.008)
    rings += [lipr, curl, tuck]
    top = V3(Ps(0.0, 0.0)) + Vector((0, 1, 0)) * thick(0.0, 0.0)
    t = Tmp(); R = [[F.W(tuple(p)) for p in r] for r in rings]
    ids = ring_surface(t, R, [F.W(inner)] * len(R), pole0=F.W(tuple(top)))
    ci = t.vert(F.W(inner)); last = ids[-1]; Kn = len(last)
    for k in range(Kn): t.face([ci, last[(k + 1) % Kn], last[k]], F.W(inner) - F.W(tuple(top)))
    return t

def rect_icing(a, b, y, he, thick, inner, ths=None, rho=0.025, J=3, p=5.0, tag='snow', col=None):
    """snow icing over a flat top (half extents a (x) by b (z) at height y, game frame; p = 2 a disc): flat, rounding the
    edge (radius rho) and hanging down the sides, so drips (he > 1) drape over the edges. Returns Ps."""
    def R(th):
        c, s_ = abs(math.cos(th)), abs(math.sin(th))
        return ((c / a) ** p + (s_ / b) ** p + 1e-12) ** (-1 / p)
    def Ps(u, th):
        r = R(th); sd = u * r; c, s_ = math.cos(th), math.sin(th); f = r - rho
        if sd <= f: rad, dy = sd, 0.0
        elif sd <= f + PI * rho / 2:
            g = (sd - f) / rho; rad, dy = f + rho * math.sin(g), -rho * (1 - math.cos(g))
        else: rad, dy = r, -rho - (sd - f - PI * rho / 2)
        return (rad * c, y + dy, rad * s_)
    add(icing(Ps, he, thick, ths or [TAU * k / 32 for k in range(32)], J, inner), col or SNOW, tag)
    return Ps

def snow_cap(a, b, y, seed=0, cover=0.86, drips=3, dlen=(0.1, 0.2), th=0.06, rho=0.02, p=5.0, n=32, tag='snow', inner=None,
             icicles=0, ilen=(0.05, 0.12), dw=(0.28, 0.42)):
    """a snow cap over a flat top with a wobbly edge and rounded drips over the sides (+ icicles under some drips)"""
    rng = random.Random(seed * 131 + 7)
    dr = [(rng.uniform(0, TAU), rng.uniform(*dlen), rng.uniform(*dw)) for _ in range(drips)]
    ph = rng.uniform(0, TAU)
    he = drip_he(lambda t_: cover + 0.05 * math.sin(3 * t_ + ph) + 0.04 * math.sin(7 * t_ + 2 * ph), dr)
    thick = lambda t_, s: th * (1 - 0.45 * s * s) * (1 + 0.22 * math.sin(4 * t_ + ph) * (1 - s))
    Ps = rect_icing(a, b, y, he, thick, inner or (0, y - 0.03, 0), ths=drip_angles(n, dr, offs=(-0.7, 0.0, 0.7), min_gap=0.05), rho=rho, p=p, tag=tag)
    for k, (t_, L, w) in enumerate(dr[:icicles]):
        x, yy, z = Ps(he(t_) + 0.01, t_)
        icicle(x, yy - 0.02, z, rng.uniform(*ilen))
    return Ps, he

def oke_bucket(r=0.13, h=0.18, water=False, seed=0, lugs=False, tag='oke', K=14, hoop='#7a5a40'):
    """a wooden bath bucket: eight warm staves with dark seams, two hoops, a lighter rim, spring water (rg-onsen's)"""
    staves = 8; cB = F.W((0, 0, 0)); rng = random.Random(seed * 13 + 1)
    tones = [mul('#c99e6c', 0.9 + 0.18 * rng.random()) for _ in range(staves)]
    def col(p, n):
        a = (math.atan2(p.y - cB.y, p.x - cB.x) / TAU) % 1.0 * staves; i = int(a) % staves; f = a - math.floor(a)
        c = tones[i]
        if f < 0.1 or f > 0.9: c = mul(c, 0.7)
        if p.z - cB.z > h * 0.9 and n.z > 0.3: c = mix(c, '#f0d4a4', 0.5)
        if p.z - cB.z < h * 0.6 and n.z > 0.5: c = mul('#6a4a34', 1.0)
        return mul(c, 0.84 + 0.18 * clamp(n.z + 0.5))
    add(glathe([(0.0, 0.0), (r * 0.86, 0.0), (r, h), (r * 0.88, h), (r * 0.78, 0.035), (0.0, 0.035)], K), col, tag)
    for yy in (0.24, 0.78):
        R = r * (0.86 + 0.14 * yy) + 0.004
        add(gloop([(R * math.cos(TAU * k / 12), h * yy, R * math.sin(TAU * k / 12)) for k in range(12)], 0.013, K=4), soft(hoop, 0.3), tag)
    if lugs:
        for s in (-1, 1): add(box(0.04, 0.08, 0.04, (s * (r * 0.95), h + 0.025, 0), r=0.0), wood('#c99e6c'), tag)
    if water:
        with mat_as('water'):
            add(glathe([(0.0, -0.006), (r * 0.87, -0.006), (r * 0.87, 0.004), (0.0, 0.006)], K, pos=(0, h * 0.8, 0)),
                lambda p, n: mix('#3eb0c4', '#a0e6ee', clamp((p - F.W((0, h * 0.8, 0))).length / (r * 0.9))), tag)

def log_piece(p0, p1, r, K=7, seed=0, tag='logs', end_c='#ecc890', bark=None):
    """a log or split from p0 to p1 (game frame): bark sides with a soft bevel, flat pale ends with growth rings"""
    a, b = Vector(p0), Vector(p1); ax = (b - a).normalized(); rng = random.Random(seed)
    u = ax.cross(Vector((0, 1, 0)) if abs(ax.y) < 0.9 else Vector((1, 0, 0))).normalized(); v = ax.cross(u)
    ph = rng.uniform(0, 1); e = min(0.012, r * 0.25)
    ring = lambda c, rr: [tuple(c + (u * math.cos(TAU * (k + ph) / K) + v * math.sin(TAU * (k + ph) / K)) * rr) for k in range(K)]
    rings = [ring(a, r - e), ring(a + ax * e, r), ring(b - ax * e, r), ring(b, r - e)]
    t = gsurf(rings, pole0=tuple(a), pole1=tuple(b))
    axB = F.N(tuple(ax)); cA = F.W(tuple(a))
    bk = bark or mix('#7a5040', '#9a6a4a', rng.random())
    def col(p, n):
        if abs(n.dot(axB)) > 0.75:
            d = ((p - cA) - axB * (p - cA).dot(axB)).length / r
            return mix(end_c, '#c8945e', clamp(d) ** 2 * 0.7)
        return mul(bk, 0.82 + 0.2 * clamp(n.z + 0.4) + 0.08 * math.sin(math.atan2(n.y, n.x) * 9 + seed))
    add(t, col, tag)

def ice_crystal(pos, h, rad, lean=(0.0, 0.0), rot=0.0, tag='crystals', tip=2.0, deep=None):
    """a hexagonal ice crystal: a faceted prism with a pointed tip, deep blue at the root, pale at the tip (game-local)"""
    deep = deep or P_ICE['ice']
    with at(pos, ry=rot, rx=lean[0], rz=lean[1]):
        prof = [(0.0, -0.05), (rad * 0.92, -0.05), (rad, h * 0.5), (rad * 0.94, h), (0.0, h + rad * tip)]
        t = glathe(prof, 6)
        y0 = F.W((0, -0.05, 0)).z; y1 = F.W((0, h + rad * tip, 0)).z
        Mi = F.m.inverted()
        def f(p, n):
            lp = Mi @ p; tt = clamp((lp.z + 0.05) / (h + rad * tip + 0.05))
            c = mix(deep, P_ICE['lt'], clamp(tt * 1.25))
            c = mix(c, P_ICE['hi'], smooth(0.7, 1.0, tt) * 0.8)
            return mul(c, 0.84 + 0.26 * clamp(-n.x * 0.3 - n.y * 0.4 + n.z * 0.5 + 0.45))
        add(t, f, tag)
