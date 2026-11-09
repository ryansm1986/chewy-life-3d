# The Windmill Orchard: poi-windmill-0 (windmill.js's one kit call). Kept from the kit: the sails (spin) and each tree's
# pickable half of the fruit (its own still part, hidden once picked), so the crowns are built round those fruit.
S2_ = math.sqrt(0.5); KW = 0.86
PW = Place('windmill')
def W_at(sr, su): return (127.3 + 1.5 + (sr - su) * S2_ * KW, 58 + 1.5 + (-sr - su) * S2_ * KW)
MILL_P = W_at(-4.9, 2.4); MILL_YAW = 1.2
WALL = [(1.38, 0.18), (1.35, 1.0), (1.28, 2.1), (1.18, 3.2), (1.12, 3.86)]
def wallR(y):
    for i in range(1, len(WALL)):
        if y <= WALL[i][1]:
            r0, y0 = WALL[i - 1]; r1, y1 = WALL[i]
            return r0 + (r1 - r0) * (y - y0) / (y1 - y0)
    return WALL[-1][0]
HUB_Y, HUB_Z = 4.2, 1.62
CREAM = '#f2e4c4'; CREAM_LT = '#fdf3dc'; CREAM_DK = '#d4c098'; DRESS = ['#e0cfa8', '#e8d9b6', '#d4c29c']
RED_ = '#c8553f'; RED_LT = '#dc6c50'; RED_DK = '#96402f'

def _arch_pts(hw, spring, n=6):
    return [(math.cos(PI * k / n) * hw, spring + math.sin(PI * k / n) * hw) for k in range(n + 1)]

def pillow(w, h, d, base, seed=0, tag='tower'):
    """a raised stone: a rounded outline, a chamfered face (22 tris)"""
    t = PTmp(); hw, hh = w / 2, h / 2
    outl = [(hw * 0.68, hh), (-hw * 0.68, hh), (-hw, hh * 0.45), (-hw, -hh * 0.45), (-hw * 0.68, -hh), (hw * 0.68, -hh), (hw, -hh * 0.45), (hw, hh * 0.45)]
    a = [t.vert(F.W((x, y, -0.015))) for x, y in outl]; b = [t.vert(F.W((x * 0.84, y * 0.8, d))) for x, y in outl]
    nf = F.N((0, 0, 1)); cen = F.W((0, 0, -0.1))
    for k in range(8):
        q = [a[k], a[(k + 1) % 8], b[(k + 1) % 8], b[k]]; t.face(q, sum((t.v[i] for i in q), Vector()) / 4 - cen)
    for k in range(1, 7): t.face([b[0], b[k], b[k + 1]], nf)
    t.normals()
    t.c = [mul(base, 0.78)] * 8 + [mul(mix(base, '#fff6e2', 0.28), 0.97 + 0.06 * ((i * 3) % 2)) for i in range(8)]
    put(t, None, tag, 'body')

def windmill_tower():
    # the plinth: a low ring of cut stone, the tower's foot on it
    wob = lambda rr, z, th: rr * (1 + 0.012 * math.sin(3 * th + z * 2) + 0.006 * math.sin(7 * th))
    rows([(1.66, -0.2, '#8e8690'), (1.64, 0.1, '#a8a0a4'), (1.58, 0.2, '#bab2b2'), (1.5, 0.27, '#cfc8c4'), (1.38, 0.29, '#a89e90')], 20, rfn=wob, tag='tower',
         jitter=lambda k, i, c: mul(c, 1.07 if (k // 2) % 2 else 0.92) if i < 3 else c)
    # the tower: warm cream plaster, warmer up top, a soft shade at the foot and under the cap
    W = [(1.385, 0.2, mul(CREAM_DK, 0.92)), (1.365, 0.75, CREAM), (1.32, 1.6, mix(CREAM, CREAM_LT, 0.3)), (1.26, 2.4, mix(CREAM, CREAM_LT, 0.55)), (1.18, 3.2, CREAM_LT), (1.14, 3.6, mix(CREAM, CREAM_DK, 0.5)), (1.12, 3.86, mul(CREAM_DK, 0.72))]
    t = lathe([(a[0], a[1]) for a in W], 24, th0=PI / 24, rfn=wob); t.__class__ = PTmp
    t.xform(F.m); t.normals()
    cc = []
    for a in W: cc += [a[2]] * 24
    t.c = [mul(c, 0.95 + 0.1 * vnoise(p, 1.5, 3)) for c, p in zip(cc, t.v)]
    put(t, None, 'tower', 'body')
    # raised dressed stones on the wall, clear of the door and the windows (seen from every side)
    rnd = random.Random(55); keep = [(0.0, 0.9, 0.75), (-0.95, 2.35, 0.42), (1.05, 2.75, 0.42)]; placed = 0
    for k in range(80):
        if placed >= 9: break
        a = rnd.uniform(-PI, PI); y = rnd.uniform(0.5, 3.45)
        if any(abs((a - ka + PI) % TAU - PI) < kr + 0.25 and abs(y - ky) < 0.72 for ka, ky, kr in keep): continue
        if abs(a) < 0.66 and y < 1.95: continue
        w = rnd.uniform(0.3, 0.46); h = rnd.uniform(0.17, 0.25); r = wallR(y)
        with at((math.sin(a) * (r - 0.01), y, math.cos(a) * (r - 0.01)), ry=a):
            pillow(w, h, 0.05, rnd.choice(DRESS), seed=k)
        placed += 1

def _door_outline(R, y0, spring):
    return [(-R, y0), (R, y0)] + _arch_pts(R, spring, 6)

def windmill_door():
    zd = wallR(0.4) + 0.02; dh = 0.88; dw = 0.8; y0 = 0.34; spring = y0 + dh; R = dw / 2
    # the dark backing, then four boards cut to the arch
    solid(prism(_door_outline(R, y0, spring), 0.06, zd - 0.05), '#3a2a26', 'door')
    tones = ['#a86e3c', '#b87c44', '#a0683a', '#b47840']
    xs = [-R, -R / 2, 0, R / 2, R]
    for i in range(4):
        x0, x1 = xs[i] + 0.012, xs[i + 1] - 0.012
        top = lambda x: spring + math.sqrt(max(0.0, (R * 0.985) ** 2 - x * x))
        mids = [x0 + (x1 - x0) * j / 2 for j in range(3)]
        poly = [(x0, y0), (x1, y0)] + [(x, top(x)) for x in reversed(mids)]
        solid(prism(poly, 0.05, zd + 0.005), woodc(tones[i], 20 + i, 0.08, 4.0), 'door')
    for y in (y0 + 0.24, y0 + 0.82):
        solid(box(0.68, 0.06, 0.025, (0, y, zd + 0.066), r=0.0), lambda p, n: shade('#55484c', n), 'door')
    solid(sph(0.05, (0.28, y0 + 0.55, zd + 0.09), K=7, J=4), lambda p, n: mix('#b88a2a', '#ffe08a', clamp(n.z * 0.6 + 0.4)), 'door')
    # the stone surround: blocks up the jambs, voussoirs round the arch
    rnd = random.Random(8)
    jt = [('#d4ccc4', 0.42), ('#c6bebc', 0.48)]
    for sx in (-1, 1):
        yy = y0 - 0.02
        for c_, h_ in jt:
            solid(beam(0.24, h_ - 0.012, 0.26, (sx * (R + 0.1), yy + h_ / 2, zd - 0.04), c=0.035), stonec(c_, '#f0ebe4', '#8a828a', seed=int(yy * 50), amp=0.04), 'surround')
            yy += h_
    NV = 5
    for k in range(NV):
        a = PI * (k + 0.5) / NV; rr = R + 0.105; L_ = (R + 0.2) * PI / NV * 0.94
        solid(beam(L_, 0.235, 0.27, (math.cos(a) * rr, spring + math.sin(a) * rr, zd - 0.04), c=0.035, rz=a - PI / 2), stonec(rnd.choice(['#d8d0c8', '#cac2c0', '#e0d8ce']), '#f4efe8', '#8a828a', seed=k + 30, amp=0.04), 'surround')
    # two stone steps
    solid(box(1.4, 0.2, 0.52, (0, 0.05, zd + 0.42), r=0.05), stonec('#c8c0bc', '#ece6e0', '#7e7680', seed=4, amp=0.05), 'steps')
    solid(box(1.12, 0.18, 0.34, (0, 0.2, zd + 0.13), r=0.05), stonec('#d4ccc6', '#f2ece6', '#7e7680', seed=5, amp=0.05), 'steps')

def windmill_window(a, y):
    r = wallR(y)
    with at((math.sin(a) * r, y, math.cos(a) * r), ry=a):
        R = 0.165; sp = 0.04; yb = -0.22
        # the glass: dark by day, lamplit at night (window_glow)
        gl_pts = [(-R, yb), (R, yb)] + _arch_pts(R, sp, 5)
        t = PTmp(); c = t.vert(F.W((0, 0, 0.012))); ring = [t.vert(F.W((x, yy, 0.012))) for x, yy in gl_pts]; nf = F.N((0, 0, 1))
        for k in range(len(ring)): t.face([c, ring[k], ring[(k + 1) % len(ring)]], nf)
        t.normals(); t.c = ['#4a4256'] + ['#332c40' if yy < 0 else '#3e3650' for x, yy in gl_pts]
        put(t, None, 'window', 'window_glow', uv=lambda p: (0.3, 0.0))
        # the stone frame: a chunky arch swept round the glass, its blocks painted in turn
        Rf = R + 0.055
        path = [(-Rf, yb - 0.02), (-Rf, sp)] + [(math.cos(PI - PI * k / 6) * Rf, sp + math.sin(PI - PI * k / 6) * Rf) for k in range(1, 6)] + [(Rf, sp), (Rf, yb - 0.02)]
        P = [F.W((x, yy, 0.02)) for x, yy in path]
        hw, hd = 0.062, 0.075
        ft = sweep(P, [(-hw, -hd), (hw, -hd), (hw, hd), (-hw, hd)], up=F.N((0, 0, 1)), cap=False); ft.__class__ = PTmp
        ft.normals()
        tones = []
        for i in range(len(P)): tones += [('#d8d0c8' if i % 2 else '#c8c0bc')] * 4
        ft.c = [shade(c_, n_, 0.2, 0.32) for c_, n_ in zip(tones, ft.n)]
        put(ft, None, 'window', 'body')
        solid(beam(0.54, 0.085, 0.17, (0, yb - 0.04, 0.03), c=0.025), stonec('#d8d0c8', '#f4efe8', '#8a828a', seed=11, amp=0.04), 'window')
        for dx, dy, w_, h_ in ((0, -0.05, 0.035, 0.42), (0, -0.04, 0.33, 0.035)):
            solid(box(w_, h_, 0.03, (dx, dy, 0.022), r=0.0), lambda p, n: shade(W_DK, n), 'window')

def windmill_cap():
    # the wooden curb under the cap
    rows([(1.28, 3.6, W_DD), (1.36, 3.7, W_MD), (1.36, 3.8, W_LT), (1.2, 3.84, W_DD)], 20, tag='cap',
         jitter=lambda k, i, c: mul(c, 1.08 if k % 2 else 0.9))
    # the dome: five courses of big rounded shingles, each overlapping the next; the lower edge is scalloped, its seams dark
    Rc, Hc, y0 = 1.42, 1.42, 3.8; NC = 5; K = 24
    def surf(tt): return (Rc * math.cos(tt * PI / 2) ** 0.75, y0 + Hc * math.sin(tt * PI / 2))
    t = PTmp(); rings, cs, cols = [], [], []
    for c in range(NC):
        t0, t1 = c / NC, (c + 1) / NC
        st = c % 2
        for rw, (tt, off) in enumerate(((t0 - 0.015 * (c > 0), 0.0), (t0 + 0.012, 0.075), (t1 - 0.03 / NC, 0.0))):
            ring = []; rc = []
            for k in range(K):
                th = TAU * k / K + PI / K
                r_, y_ = surf(clamp(tt))
                pk = ((k + st) % 2 == 0)      # (every other vertex is a shingle's middle: its foot hangs lower and proud)
                dy = 0.0; dr = off
                if rw == 0: dy = -0.05 if pk else 0.03; dr = -0.015 if not pk else 0.015
                if rw == 1: dy = -0.022 if pk else 0.03; dr = off * (1.1 if pk else 0.55)
                rr = r_ + dr
                ring.append(Vector((math.cos(th) * rr, -math.sin(th) * rr, y_ + dy)))
                base = RED_ if (c % 2 == 0) else RED_LT
                tone = mul(base, 0.93 + 0.14 * (((k // 2) * 7 + c * 3) % 4) / 3)
                if rw == 0: q = mul(tone, 0.62 if not pk else 0.72)
                elif rw == 1: q = mix(tone, '#f08a68', 0.24) if pk else mul(tone, 0.74)
                else: q = mul(tone, 0.8)
                rc.append(q)
            rings.append([F.m @ v for v in ring]); cs.append(F.m @ Vector((0, 0, y_))); cols += rc
    pole = F.m @ Vector((0, 0, y0 + Hc + 0.03))
    ring_surface(t, rings, cs, pole1=pole)
    t.normals()
    t.c = cols + [mul(RED_, 0.9)]
    put(t, None, 'cap', 'body')
    # the finial and the axle out through a timber collar to the kit's hub
    rows([(0.2, y0 + Hc - 0.05, W_DD), (0.17, y0 + Hc + 0.02, W_DK), (0.13, y0 + Hc + 0.06, W_MD), (0.16, y0 + Hc + 0.14, W_MD), (0.0, y0 + Hc + 0.27, W_LT)], 8, tag='cap')
    with at((0, HUB_Y, 0), rx=PI / 2):
        # (rows run along local y, here the axle's +z)
        rows([(0.3, 1.1, W_DD), (0.27, 1.24, W_DK), (0.25, 1.33, W_MD), (0.17, 1.36, W_DD), (0.115, 1.36, W_DD), (0.105, HUB_Z + 0.1, W_DK)], 9, tag='axle')

# ------------------------------------------------------------------ the fruit trees
_KIT_OBJ = {}
def load_obj(name):
    """kit OBJ dump -> {object: [triangles of (x, y, z, r, g, b) x 3]}"""
    if name in _KIT_OBJ: return _KIT_OBJ[name]
    V_, out, cur = [], {}, None
    for ln in open(os.path.join(HERE, 'kitdump', name + '.obj')):
        if ln.startswith('v '): V_.append(tuple(float(x) for x in ln.split()[1:]))
        elif ln.startswith('o '): cur = out.setdefault(ln.split()[1], [])
        elif ln.startswith('f '): cur.append([V_[int(x) - 1] for x in ln.split()[1:]])
    _KIT_OBJ[name] = out
    return out

def comps(tris):
    """connected components of triangles sharing a vertex position -> [list of tris]"""
    par = {}
    def fd(a):
        while par.setdefault(a, a) != a: par[a] = par[par[a]]; a = par[a]
        return a
    key = lambda v: (round(v[0], 3), round(v[1], 3), round(v[2], 3))
    for t in tris:
        a = fd(key(t[0]))
        for v in t[1:]: par[fd(key(v))] = a
    out = {}
    for t in tris: out.setdefault(fd(key(t[0])), []).append(t)
    return list(out.values())

def balls_of(trs, rmin=0.07, rmax=0.14):
    """fruit balls among components: (centre, r)"""
    res = []
    for c in comps(trs):
        if len(c) < 20: continue
        vs = [v for t in c for v in t]
        lo = [min(v[i] for v in vs) for i in range(3)]; hi = [max(v[i] for v in vs) for i in range(3)]
        rr = max(hi[0] - lo[0], hi[2] - lo[2]) / 2
        if rmin <= rr <= rmax: res.append((Vector(((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2)), rr))
    return res

def tree_fit():
    """each tree's kept fruit (the kit's still parts), its static fruit spots and its five crown puffs, fitted to the kit's leaves"""
    d = PW.d; obj = load_obj('kit-windmill-0')
    leaf = obj['kit_2']; body = obj['kit_0']
    out = []
    # the pickable parts in the scene dump: partIdx 4.. in tree order
    parts = sorted([p for p in d['parts'] if p['partIdx'] >= 4], key=lambda p: p['partIdx'])
    for ti, t in enumerate(d['trees']):
        lx, lz, y0 = t['lx'], t['lz'], PW.gy(t['lx'], t['lz'])
        pp = parts[ti]['pos']; trs = [[(pp[i + j * 3], pp[i + j * 3 + 1], pp[i + j * 3 + 2]) for j in range(3)] for i in range(0, len(pp), 9)]
        kept = [(c - Vector((lx, y0, lz)), r) for c, r in balls_of(trs)]
        near = [tr for tr in body if abs(tr[0][0] - lx) < 1.4 and abs(tr[0][2] - lz) < 1.4 and tr[0][1] > y0 + 1.0]
        stat = [(c - Vector((lx, y0, lz)), r) for c, r in balls_of(near)]
        lv = []
        for c in comps([tr for tr in leaf if abs(tr[0][0] - lx) < 1.6 and abs(tr[0][2] - lz) < 1.6 and tr[0][1] > y0 + 0.9]):
            vs = [v for t_ in c for v in t_]; p = Vector((sum(v[0] for v in vs) / len(vs) - lx, sum(v[1] for v in vs) / len(vs) - y0, sum(v[2] for v in vs) / len(vs) - lz))
            lv.append((p, sum(v[3] + v[4] for v in vs) / len(vs)))
        lum = sorted(l[1] for l in lv); cut = lum[int(len(lum) * 0.3)] if lum else 0
        outer = [l[0] for l in lv if l[1] >= cut]
        puffs = [(Vector((0, 2.05, 0)), 0.6)]
        for k in range(4):
            a0 = k / 4 * TAU + 0.4; best = None
            for ai in range(11):
                a = a0 + 0.5 * ai / 10
                for yi in range(5):
                    y = 1.62 + 0.12 * yi / 4
                    for ri in range(3):
                        r = 0.5 + 0.03 * ri
                        c = Vector((math.cos(a) * 0.52, y, math.sin(a) * 0.52))
                        sc = sum(1 for p in outer if abs((p - c).length - r) < 0.06) + 6 * sum(1 for fc, _ in kept + stat if abs((fc - c).length - 0.96 * r) < 0.02)
                        if best is None or sc > best[0]: best = (sc, c, r)
            puffs.append((best[1], best[2]))
        # the fit, checked against the fruit
        res = [min(abs((fc - c).length - 0.96 * r) for c, r in puffs) for fc, _ in kept + stat]
        print('POI tree %d %s kept %d static %d leaves %d residual max %.3f mean %.3f' % (ti, t['kind'], len(kept), len(stat), len(lv), max(res), sum(res) / len(res)))
        out.append(dict(kind=t['kind'], lx=lx, lz=lz, y0=y0, kept=kept, stat=stat, puffs=puffs))
    return out

LEAF_C = ('#2c6a2e', '#5d9c3e', '#a6cc62')
def fruit_tree(T, seed):
    rnd = random.Random(seed); kind = T['kind']; puffs = T['puffs']
    with at((T['lx'], T['y0'], T['lz'])):
        # the trunk: stout, a flared and lobed foot (three vertices a lobe, so the roots stay round), bark streaks
        ph = seed * 1.3
        rf = lambda rr, z, th: rr * (1 + (0.24 * max(0.0, 1 - (z + 0.1) / 0.5) ** 1.3) * math.cos(4 * th + ph) + 0.04 * math.sin(3 * th + z * 5))
        prof = [(0.36, -0.28, '#4e3426'), (0.31, 0.03, '#66442f'), (0.215, 0.22, '#72523b'), (0.19, 0.62, '#7a5840'), (0.17, 1.08, '#573e30')]
        rows(prof, 12, rfn=rf, tag='trunk', jitter=lambda k, i, c: mul(c, 1.12 if k % 3 == 0 else 0.93), top=0.2, bot=0.2)
        # the crown's depth: big dark cards deep inside it (no solid shape), layered, turned to the sky like the leaves over them
        hrnd = random.Random(seed * 17 + 1)
        for qi, (c, r) in enumerate(puffs):
            cw_ = F.W(tuple(c)); NI = 5 if qi == 0 else 3
            for k in range(NI):
                u = 0.75 - 1.1 * (k + 0.5) / NI; sr = math.sqrt(max(0.0, 1 - u * u)); a = k * 2.4 + qi * 1.3 + 0.8
                d_ = Vector((sr * math.cos(a), sr * math.sin(a), u)); nn_, ax_ = shingle(d_, hrnd, yawj=1.5)
                Ln_ = r * 1.3
                diamond(cw_ + d_ * (r * 0.52) - ax_ * Ln_ * 0.45, ax_, nn_, Ln_, r * 0.56, '#1d4628', '#2c6230', normal=lambda v, c_=cw_, d2=d_: ((v - c_).normalized() * 0.7 + d2 * 0.3).normalized(), tag='crown', ao=False)
        kept = T['kept']; stat = T['stat'][:4]; fruits = kept + stat
        # the leaves: big ovate cards laid like scales on each puff, tips out and down; soft normals round each puff, so
        # the crown models as clumps under the toon band while every leaf still shows
        Ns = [46] + [33] * 4
        ga = PI * (3 - math.sqrt(5)); total = 0
        for qi, (c, r) in enumerate(puffs):
            N = Ns[qi]; cw = F.W(tuple(c))
            for k in range(N):
                u = 1 - 1.42 * (k + 0.5) / N; sr = math.sqrt(max(0.0, 1 - u * u)); a = k * ga + qi * 1.7 + rnd.uniform(-0.2, 0.2)
                d = Vector((sr * math.cos(a), u, sr * math.sin(a)))
                # (the far side of the crown, and its underside, take fewer: most leaves go where the game camera looks)
                face = (d.x + d.z) * 0.7071
                if (face < -0.3 and rnd.random() < 0.6) or (u < -0.2 and rnd.random() < 0.3): continue
                p = c + d * (r * rnd.uniform(0.97, 1.05))
                if any(oc != c and (p - oc).length < or_ * 0.86 for oc, or_ in puffs): continue
                if any((p - fc).length < fr + 0.075 for fc, fr in fruits): continue
                w = F.W(tuple(p)); dw = (w - cw).normalized()
                nn_, ax = shingle(dw, rnd, yawj=0.8)
                t_ = clamp(0.47 + dw.z * 0.5 + dw.dot(Vector((0.35, -0.5, 0)).normalized()) * 0.16 + rnd.uniform(-0.1, 0.1))
                cc = mix(LEAF_C[0], LEAF_C[1], clamp(t_ * 1.9)); cc = mix(cc, LEAF_C[2], clamp(t_ * 2.1 - 1.1))
                Ln = 0.4 * rnd.uniform(0.86, 1.14); Wd = 0.285 * rnd.uniform(0.9, 1.1)
                card(w - ax * Ln * 0.42, ax, nn_, Ln, Wd, mul(cc, 0.78), mix(cc, LEAF_C[2], 0.3), fold=0.14, roll=-0.06,
                     normal=lambda v, c_=cw, d_=dw: ((v - c_).normalized() * 0.72 + d_ * 0.28).normalized(), tag='crown')
                total += 1
        # the static half of the fruit, at the kit's own spots
        for i, (fc, fr) in enumerate(stat):
            ball_fruit(fc.x, fc.y, fc.z, 0.118 if kind == 'peach' else 0.112, kind, k=i + seed, K=7, J=4, tag='fruit')
    return total

def ladder_(tree_xz, yaw, h):
    tx, tz = tree_xz; dx, dz = math.sin(yaw), math.cos(yaw)
    fx, fz = tx + dx * 0.72, tz + dz * 0.72; tp_x, tp_z = tx + dx * 0.24, tz + dz * 0.24
    foot = Vector((fx, PW.gy(fx, fz) - 0.03, fz)); topP = Vector((tp_x, PW.gy(tx, tz) + h, tp_z))
    side = Vector((math.cos(yaw), 0, -math.sin(yaw))) * 0.21
    col = lambda p, n: mix(mul(W_LT, 0.74), mix(W_LT, '#ffe6c4', 0.16), clamp(n.z * 0.7 + 0.45))
    for s in (-1, 1):
        tube_col([tuple(foot + side * s), tuple(topP + side * (s * 0.9))], 0.042, col, K=5, tag='ladder')
    for i in range(1, 4):
        tt = i / 3.6; c = foot.lerp(topP, tt)
        tube_col([tuple(c - side), tuple(c + side)], 0.03, col, K=4, tag='ladder')

def tub_(x, y, z, r, kind):
    with at((x, y, z)):
        barrel_tub(r=r, h=0.3, wood_='#a87c52', soil='#6a4a36', K=10, tag='tubs')
    for i in range(4):
        a = i / 3 * TAU + 0.5; d = 0.0 if i == 3 else r * 0.52
        ball_fruit(x + math.cos(a) * d, y + 0.31 + (0.075 if i == 3 else 0), z + math.sin(a) * d, 0.105, kind, k=i, K=6, J=3, leaf=i % 2 == 0)

def stall_():
    W_, D_, Ht = 2.0, 0.72, 0.74
    tn = ['#c49660', '#b48654', '#cc9e6c', '#ba8c58']
    for i in range(4):
        plank(W_, 0.075, D_ / 4 - 0.016, (0, Ht - 0.038, -D_ / 2 + D_ / 8 + i * D_ / 4), tn[i], seed=i, tag='stall')
    for sx in (-1, 1):
        for sz in (-1, 1):
            solid(beam(0.14, Ht - 0.06 + 0.08, 0.14, (sx * (W_ / 2 - 0.13), (Ht - 0.06 - 0.08) / 2, sz * (D_ / 2 - 0.1)), c=0.03), woodc(W_DK, 7 + sx), 'stall')
    for sz in (-1, 1):
        solid(beam(W_ - 0.2, 0.09, 0.07, (0, Ht - 0.13, sz * (D_ / 2 - 0.07)), c=0.02), woodc(W_DK, 9), 'stall')
    plank(W_ - 0.3, 0.05, D_ - 0.22, (0, 0.2, 0), '#a87e52', seed=9, tag='stall')
    # two open trays heaped with fruit, and a hand basket
    for x, kind, sd in ((-0.5, 'peach', 2), (0.26, 'persimmon', 3)):
        with at((x, Ht, 0.0), ry=0.05 * x):
            tray(0.68, 0.56, 0.2, '#c8a06c', tag='stall', seed=sd)
            fr = 0.106 if kind == 'peach' else 0.1
            for i in range(9):
                u = (i % 3) - 1; v = i // 3 - 1
                ball_fruit(u * 0.2 + (v % 2) * 0.012, 0.215 + (0.05 if i == 4 else 0), v * 0.158, fr, kind, k=i + sd, K=6, J=3, leaf=i in (1, 4, 6))
    with at((0.8, Ht - 0.005, 0.03)):
        basket_(0, 0, 0, 0.17, h=0.17, handle=True, color='#d4aa64', K=10, tag='stall')

def build_windmill():
    rnd = random.Random(5505)
    gy = PW.gy; L_ = PW.L
    mx, mz = L_(*MILL_P)
    with at((mx, gy(mx, mz) - 0.05, mz), ry=MILL_YAW):
        windmill_tower(); windmill_door()
        for a, y in ((-0.95, 2.35), (1.05, 2.75)): windmill_window(a, y)
        windmill_cap()
    # barrel planters either side of the door
    for s in (-1, 1):
        ox = math.cos(MILL_YAW) * s * 1.05 + math.sin(MILL_YAW) * 1.75; oz = -math.sin(MILL_YAW) * s * 1.05 + math.cos(MILL_YAW) * 1.75
        x, z = mx + ox, mz + oz; y = gy(x, z)
        with at((x, y, z)):
            barrel_tub(r=0.235, h=0.44, wood_='#a87a50', soil='#5e4032')
            fern_(0, 0.37, 0, rnd, 0.46, n=4)
            flower_tuft(0, 0.42, 0, rnd, n=3, r=0.1, colors=('#ffffff', '#ffd24a', '#ffffff') if s > 0 else ('#ff9dc1', '#ffffff', '#ff9dc1'), size=0.1, leaves=1)
    # the trees
    fit = tree_fit()
    nl = 0
    for i, T in enumerate(fit): nl += fruit_tree(T, 40 + i)
    print('POI leaves', nl)
    ladder_((fit[0]['lx'], fit[0]['lz']), 0.9, 1.4); ladder_((fit[4]['lx'], fit[4]['lz']), -0.2, 1.25)
    # baskets and tubs
    for a, b, kind, tub in ((0.9, 3.1, 'peach', False), (-0.5, 0.1, 'peach', True), (4.2, 1.1, 'persimmon', True), (0.8, -1.7, 'persimmon', False)):
        x, z = L_(*W_at(a, b)); y = gy(x, z)
        if tub: tub_(x, y, z, 0.28, kind)
        else: basket_(x, y, z, 0.25, h=0.22, kind=kind, n=4)
    # the stall
    sx, sz = L_(*W_at(4.1, -3.7))
    with at((sx, gy(sx, sz), sz), ry=PI / 4): stall_()
    # the fences
    fenceA = [L_(*W_at(a, b)) for a, b in ((1.3, -2.3), (3.1, -2.1), (5.0, -1.9))]
    fenceB = [L_(*W_at(a, b)) for a, b in ((-6.9, -0.4), (-5.4, -1.6), (-3.7, -2.4))]
    fence_run(fenceA, gy); fence_run(fenceB, gy)
    # mossy boulders with a tuft of flowers beside them
    for i, (a, b, r) in enumerate(((-7.2, 3.2, 0.95), (-6.8, 0.6, 0.6), (6.0, 3.2, 0.8), (6.4, 1.4, 0.5), (-2.6, -3.1, 0.55), (6.3, -1.0, 0.6), (-3.0, 5.6, 0.6))):
        x, z = L_(*W_at(a, b))
        rock(x, gy(x, z), z, r, yaw=i * 1.3, seed=50 + i, moss=0.55)
        if i % 2 == 0: flower_tuft(x + r * 0.9, gy(x + r * 0.9, z + r * 0.4), z + r * 0.4, rnd, n=2, r=0.22)
    # ferns, flowers, a bush, the bamboo
    for a, b in ((-7.4, -1.4), (5.2, 4.6), (6.8, 0.2), (-3.2, -2.6)):
        x, z = L_(*W_at(a, b)); fern_(x, gy(x, z), z, rnd, 0.95, n=4)
    for a, b in ((-2.8, 2.6), (0.9, 1.6), (4.6, -0.4), (-1.2, -2.2)):
        x, z = L_(*W_at(a, b)); flower_tuft(x, gy(x, z), z, rnd, n=2, r=0.3, colors=('#ffffff', '#ffffff', '#ff9dc1', '#ffd24a'))
    for k, (a, b, r) in enumerate(((-7.0, -2.2, 0.45),)):
        x, z = L_(*W_at(a, b)); leafy_bush(x, gy(x, z), z, r, rnd, seed=k * 3 + 1)
    x, z = L_(*W_at(-8.6, 0.8)); bamboo_clump(x, gy(x, z), z, rnd, n=2, h=2.6)
    ground_ao(PW)
    return 'origin = the kit call (F.X, F.Y, F.Z)'
