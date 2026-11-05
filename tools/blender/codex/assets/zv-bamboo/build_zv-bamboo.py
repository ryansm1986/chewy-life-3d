# PAWHAVEN: Takemori (the bamboo village)'s buildings (task zv-bamboo), built in Blender by script.
#   blender --background --factory-startup --python build_zv-bamboo.py -- --piece elder|shop|all
# Deterministic: seeded PRNGs only; a re-run reproduces every GLB exactly.
# Frame: 1 unit = 1 m, Blender Z up, the front (the door side) faces -Y (the glTF exporter makes it the game's +z),
# centred on the kit building's local origin (src/regions/village/artBamboo.js). Layout code is written in the kit's
# game frame (x, y up, z front) and mapped to Blender (x, -z, y).
# The shared mesh kit (accumulator, rounded boxes, lathes, tubes, walls, windows, doors, props, finish) is the Blossom
# Hollow landmarks' (tools/blender/codex/assets/landmarks-hollow), extracted into base_kit.py and exec'd here so its
# functions share this script's globals. New here: the kayabuki thatch (artBamboo.js thatch, rebuilt as closed tier
# shells with crisp cut edges, combed straw columns, a ragged eave hem and fringe, the bound ridge and chigi), and the
# Takemori parts (lattice windows, sudare, bonsai pots, geta, boards, soot, debris, sacks, the shop's goods).
import bpy, bmesh, math, os, sys, random
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..', '..'))
MODELS = os.path.join(REPO, 'public', 'models')
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
PIECE = argv[argv.index('--piece') + 1] if '--piece' in argv else 'all'
print('ZV build pid', os.getpid())
_base = os.path.join(HERE, 'base_kit.py')
exec(compile(open(_base, encoding='utf-8').read(), _base, 'exec'))

# the glow of the saved / siege overlays stays in their own object (the game toggles the object as a whole)
def add(t, col, tag='misc', glow=False):
    if OB in ('saved', 'siege'): A.add(OB, GLOW if glow else 'body', t, col, tag)
    else: A.add(GLOW if glow else OB, GLOW if glow else 'body', t, col, tag)
    return t

class layer:
    """with layer('saved'): everything added goes to that object"""
    def __init__(self, name): self.name = name
    def __enter__(self):
        global OB
        self.prev = OB; OB = self.name
    def __exit__(self, *e):
        global OB
        OB = self.prev

# ================================================================== Takemori palette (artBamboo.js T, warmed a touch)
T = dict(thatch='#c8a25e', thatchEdge='#f0dca4', thatchUnder='#5e4030', thatchOld='#ae9466', thatchDeep='#8a663c',
         moss='#8aa85a', ridge='#55402f', ridgeDark='#3e3026', plaster='#f2e8d4', frame='#5b4232', koshi='#86664a',
         deck='#c99f6e', stone='#aa9e92', bamboo='#a8b860', bambooDark='#7a8a48', paper='#fffaf0', rope='#d0b88c')
BOARD = ['#8a6a4e', '#7e604a', '#94745a', '#6e5444']

def hsh(i, s=0):
    n = (int(i) * 374761393 + int(s) * 668265263) & 0xffffffff
    n = ((n ^ (n >> 13)) * 1274126177) & 0xffffffff
    return ((n ^ (n >> 16)) & 0xffffff) / 0xffffff

# ================================================================== the kayabuki thatch
def rr_pt(ax, az, rc, seg, s):
    """a point on a rounded rectangle (half sizes ax, az, corner radius rc), segment seg (0..7) at fraction s; with its
    outward normal. Segments: right end, front-right arc, front, front-left arc, left end, back-left arc, back, back-right."""
    rc = max(0.02, min(rc, ax * 0.995, az * 0.995)); hx, hz = ax - rc, az - rc
    if seg == 0: return ax, -hz + 2 * hz * s, 1.0, 0.0
    if seg == 2: return hx - 2 * hx * s, az, 0.0, 1.0
    if seg == 4: return -ax, hz - 2 * hz * s, -1.0, 0.0
    if seg == 6: return -hx + 2 * hx * s, -az, 0.0, -1.0
    a = {1: 0.0, 3: PI / 2, 5: PI, 7: 1.5 * PI}[seg] + s * PI / 2
    cx = hx if seg in (1, 7) else -hx; cz = hz if seg in (1, 3) else -hz
    return cx + rc * math.cos(a), cz + rc * math.sin(a), math.cos(a), math.sin(a)

def rc_of(r): return min(r['ax'], r['az']) * min(0.97, 2.1 / r['n'])

def thatch_cols(A_, B_, n0, step):
    rc = min(A_, B_) * min(0.97, 2.1 / n0)
    cx = max(2, round(2 * (A_ - rc) / step)); cz = max(2, round(2 * (B_ - rc) / step)); ca = max(3, round(PI / 2 * rc / step))
    cols = []
    for seg in range(8):
        c = (cz if seg in (0, 4) else cx) if seg % 2 == 0 else ca
        cols += [(seg, i / c) for i in range(c)]
    return cols

def ring_shell(rings, cols, colfn, gcol, cap_bot=None, cap_top=None, tag='thatch'):
    """one closed thatch shell: rings (dicts ax, az, n, y, k = the group of the segment below it, c = colour kind,
    g = groove amount, drop = per-column hem drop) lofted over the shared column layout; a fan cap below / above.
    Split normals per group, so every cut edge stays crisp; per-vertex painted colours from colfn."""
    t = Tmp(); cols_c = []; ids = []
    for r in rings:
        rc = rc_of(r); row = []
        for i, (seg, s) in enumerate(cols):
            x, z, nx, nz = rr_pt(r['ax'], r['az'], rc, seg, s)
            gv = r.get('g', 0.0) * gcol(i, r['y'])
            x += nx * gv; z += nz * gv
            y = r['y'] - (r['drop'][i] if r.get('drop') else 0.0)
            row.append(t.vert(F.W((x, y, z)))); cols_c.append(colfn(r, i, x, y, z, nx, nz))
        ids.append(row)
    grp = {}; K = len(cols)
    for j in range(len(rings) - 1):
        g = rings[j + 1]['k']
        for i in range(K):
            q = [ids[j][i], ids[j][(i + 1) % K], ids[j + 1][(i + 1) % K], ids[j + 1][i]]
            fc = sum((t.v[v] for v in q), Vector()) / 4
            ax_ = F.W((0, (rings[j]['y'] + rings[j + 1]['y']) / 2, 0))
            n0 = len(t.f); t.face(q, fc - ax_)
            if len(t.f) > n0: grp[frozenset(t.f[-1])] = g
    for cap, row, r, up in ((cap_bot, ids[0], rings[0], False), (cap_top, ids[-1], rings[-1], True)):
        if cap is None: continue
        y, ccol = cap
        ci = t.vert(F.W((0, y, 0))); cols_c.append(ccol)
        hint = F.N((0, 1, 0)) if up else F.N((0, -1, 0))
        for i in range(K):
            n0 = len(t.f); t.face([ci, row[i], row[(i + 1) % K]], hint)
            if len(t.f) > n0: grp[frozenset(t.f[-1])] = 'capt' if up else 'capb'
    t.c = cols_c
    acc = {}
    def cn(face, acc=acc):
        if not acc:
            for f in t.f:
                P = [t.v[v] for v in f]; nn = Vector((0, 0, 0))
                for q in range(1, len(P) - 1): nn += (P[q] - P[0]).cross(P[q + 1] - P[0])
                g = grp.get(frozenset(f), 'x')
                for v in f:
                    k = (v, g); acc[k] = acc.get(k, Vector((0, 0, 0))) + nn
        g = grp.get(frozenset(face), 'x')
        return [acc[(v, g)].normalized() if acc[(v, g)].length > 1e-12 else Vector((0, 0, 1)) for v in face]
    t.cn = cn
    add(t, None, tag)
    return t

def thatch(o):
    """artBamboo.js thatch: a kayabuki over a w x d wall block (wall top y0): NT stacked straw tiers, each tier's cut edge
    standing proud of the one below with a dark tucked underside; the eave a thick clipped edge with a ragged hem and a
    fringe of straw wedges; the ridge a dark beam under a bound bamboo bundle with rope ties and crossed chigi.
    type 'hip' | 'irimoya' (vertical gable ends above tg, a timber gable board with a lattice vent) | 'gable'.
    Moss on the lower tiers' back (-z) slopes. Returns the kit's info: ridgeY, yb, yl, H, A, Bz, yAt, underAt."""
    typ = o.get('type', 'hip'); over = o.get('over', 0.5); A_ = o['w'] / 2 + over; Bz = o['d'] / 2 + over
    H = o.get('H', 1.5); lip = o.get('lip', 0.3); seed = o.get('seed', 7)
    yb = o['y0'] - lip * 0.5; yl = yb + lip; yTop = yl + H
    tg = o.get('tg', 0.58) if typ == 'irimoya' else (0.0 if typ == 'gable' else 1.0)
    R = A_ if typ == 'gable' else max(0.12, A_ - Bz * o.get('hip', 0.85))
    axG = A_ if typ == 'gable' else R + (A_ - R) * (1 - tg) ** 0.9
    azAt = lambda t: max(0.12, Bz * (1 - t) ** 0.92 * (1 + 0.07 * math.sin(PI * t)))
    flat = lambda t: typ == 'gable' or (typ == 'irimoya' and t >= tg)
    axAt = lambda t: A_ if typ == 'gable' else (axG if flat(t) else (R + (A_ - R) * (1 - t) ** 0.9) * (1 + 0.03 * math.sin(PI * t)))
    nAt = lambda t: (5 - 2.2 * t) if typ == 'hip' else (14.0 if t >= tg else 6.5 - 1.5 * t)
    def ringAt(t, y, out, **kw):
        t = clamp(t)
        return dict(y=y, ax=axAt(t) + (0 if flat(t) else out), az=azAt(t) + out, n=nAt(t), t=t, **kw)
    NT = o.get('tiers', 4 if H >= 1.45 else 3)
    tAt = lambda i: 0.0 if i <= 0 else 1.0 if i >= NT else 1 - (1 - i / NT) ** 1.18
    lipH = clamp(0.09 + H * 0.035, 0.12, 0.16); dl = lipH / H; outOf = lambda i: 0.15 - 0.018 * i
    cols = thatch_cols(A_, Bz, nAt(0), o.get('step', 0.17)); K = len(cols)
    gph = [0.6 * math.sin(i * 2.399 + seed) + 0.4 * (hsh(i, seed) * 2 - 1) for i in range(K)]
    gcol = lambda i, y: gph[i] * (0.75 + 0.25 * math.sin(y * 3.1 + i * 0.7))
    straw, pale, dark = T['thatch'], T['thatchEdge'], T['thatchUnder']
    old, deep, moss = T['thatchOld'], T['thatchDeep'], o.get('moss_col', T['moss'])
    mossAmt = o.get('moss', 0.4)
    streak = [1 + 0.15 * (hsh(i, seed + 3) * 2 - 1) + 0.05 * (1 if i % 2 else -1) for i in range(K)]   # combed straw: a tone per column
    def stip(i, y, s=0): return 0.88 + 0.12 * hsh(i * 31 + int(y * 97), seed + s)

    def colfn_tier(i_t, yS, yShade, lower, tint):
        def f(r, i, x, y, z, nx, nz):
            c = r['c']
            if c == 'dark': return dark
            if c == 'soffit': return mix(dark, deep, 0.3)
            if c == 'eave':
                u = clamp((y - yb) / lip)
                return mul(mix(pale, deep, (1 - u) * 0.5), stip(i, y) * streak[i])
            if c == 'cut':
                u = clamp((y - r['yE']) / lipH)
                return mul(mix(pale, deep, (1 - u) * 0.55), stip(i, y, 5) * (0.96 + 0.04 * streak[i]))
            # band
            hk = clamp((y - yl) / H)
            fresh = 1 - clamp((y - yS) / 0.16)
            top = clamp((y - yS) / max(0.05, min(yShade, yTop) - yS))      # up the visible band
            k = mix(straw, old, tint); k = mix(k, pale, fresh * 0.3); k = mix(k, deep, hk * hk * 0.18)
            k = mul(k, (1.04 - 0.1 * top) * streak[i] * (0.94 + 0.12 * vnoise(Vector((x, y, z)), 3.0, seed)))
            sh = clamp((y - (yShade - 0.1)) / 0.045)
            if sh > 0: k = mix(k, dark, sh * 0.62)
            if lower and mossAmt > 0:
                back = clamp((-nz - 0.25) / 0.5) + 0.45 * clamp((abs(nx) - 0.7) / 0.3) * clamp(-nz + 0.3)
                cov = back * (0.2 + 0.8 * vnoise(Vector((x, y * 0.5, z)), 3.2, seed + 9)) * (1 - sh) * min(1.0, mossAmt * 2.2) * (1.1 - 0.5 * top)
                mk = smooth(0.52, 0.58, cov)
                if mk > 0: k = mix(k, mix('#6f9448', '#a8c870', 0.5 * (1 - top)), mk * 0.9)
            return k
        return f

    for i in range(NT):
        t0, t1 = tAt(i), tAt(i + 1); last = i == NT - 1; out = outOf(i) if i else 0.0; y0 = yl + H * t0
        tEnd = 1.0 if last else min(1.0, t1 + 0.6 * dl)
        yShade = 1e9 if last else yl + H * t1 - lipH * 0.35
        lower = i < max(1, round(NT / 2)); tint = (NT - 1 - i) / max(1, NT - 1) * 0.22
        rings = []
        if i == 0:
            hem = [0.015 + 0.05 * hsh(k, seed + 11) ** 1.5 for k in range(K)]
            for kk in range(4):
                u = kk / 3; bl = 1 + 0.035 * math.sin(PI * u)
                rings.append(dict(y=yb + lip * u, ax=A_ * bl - (1 - u) * 0.04, az=Bz * bl - (1 - u) * 0.04, n=nAt(0), k='eave', c='eave',
                                  g=0.012, drop=hem if kk == 0 else None))
            tS, outS = 0.0, 0.0
        else:
            yE = y0 - lipH * 0.35
            rings.append(ringAt(t0, y0 - 0.03, -0.03, k='-', c='dark'))
            rings.append(ringAt(t0, yE, out, k='under', c='cut', yE=yE, g=0.006))
            rings.append(ringAt(t0 + dl * 0.55, y0 + lipH * 0.55, out * 0.98, k='cut', c='cut', yE=yE, g=0.01))
            rings.append(ringAt(t0 + dl * 0.65, y0 + lipH * 0.65, out * 0.86, k='cut', c='cut', yE=yE, g=0.01))
            tS, outS = t0 + dl * 0.65, out * 0.86
        yS = yl + H * tS
        # the band: even steps, plus rings at the contact-shadow line under the next tier's edge
        ts = [tS + (tEnd - tS) * s for s in [k / max(3, round(14 * (tEnd - tS))) for k in range(max(3, round(14 * (tEnd - tS))) + 1)]]
        if not last:
            for yy in (yShade - 0.1, yShade - 0.055):
                tt = (yy - yl) / H
                if tS < tt < tEnd: ts.append(tt)
        ts = sorted(set(round(v, 5) for v in ts))
        for k, t in enumerate(ts):
            if k == 0 and i == 0: continue          # (the eave's top ring is the band's first)
            s = clamp((t - tS) / max(1e-6, tEnd - tS))
            rings.append(ringAt(t, yl + H * t, outS * (1 - s) ** 1.25 + 0.03 * math.sin(PI * s) * (1 - t), k='band', c='band',
                                g=0.032 * (0.5 if k == 0 else 1.0)))
        cb = (yb + 0.0, mix(dark, deep, 0.2)) if i == 0 else (rings[0]['y'] - 0.01, dark)
        ct = (rings[-1]['y'] + (0.02 if last else 0.0), mix(straw, deep, 0.25))
        ring_shell(rings, cols, colfn_tier(i, yS, yShade, lower, tint), gcol, cap_bot=cb, cap_top=ct, tag='thatch')

    # the ragged fringe: one row of tapered straw wedges round the eave's cut edge
    r0 = dict(ax=A_, az=Bz, n=nAt(0)); rc0 = rc_of(r0)
    pts = [rr_pt(A_ - 0.04, Bz - 0.04, rc0, seg, s) for seg, s in cols]
    for k, (px, pz, nx, nz) in enumerate(pts):
        for half in (0.0,):
            q = pts[(k + 1) % K]
            fx, fz = px + (q[0] - px) * half, pz + (q[1] - pz) * half
            tx, tz = -nz, nx
            j = k * 2 + int(half * 2)
            h = 0.06 + 0.1 * hsh(j, seed + 21); w0 = 0.055 * (0.85 + 0.3 * hsh(j, seed + 22)); w1 = w0 * (0.45 + 0.25 * hsh(j, seed + 23))
            lean = 0.02 + 0.03 * hsh(j, seed + 24); jt = (hsh(j, seed + 25) - 0.5) * 0.04; yT = yb + 0.05
            def P(tw, dn, y):
                return F.W((fx + tx * (tw + jt) + nx * dn, y, fz + tz * (tw + jt) + nz * dn))
            tt = Tmp()
            v = [tt.vert(P(-w0, 0.02, yT)), tt.vert(P(w0, 0.02, yT)), tt.vert(P(w0, -0.05, yT)), tt.vert(P(-w0, -0.05, yT)),
                 tt.vert(P(-w1, 0.02 + lean, yT - h)), tt.vert(P(w1, 0.02 + lean, yT - h)), tt.vert(P(w1, lean - 0.01, yT - h)), tt.vert(P(-w1, lean - 0.01, yT - h))]
            cen = P(0, 0, yT - h / 2)
            for fq in ([0, 1, 2, 3], [4, 7, 6, 5], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]):
                fcn = sum((tt.v[x] for x in fq), Vector()) / 4; tt.face([v[x] for x in fq], fcn - cen)
            kk = hsh(j, seed + 26)
            tt.c = [mix(pale, deep, 0.35 + 0.15 * kk)] * 4 + [mix(pale, deep, 0.62 + 0.15 * kk)] * 4
            add(tt, None, 'fringe')

    # the ridge: a dark beam under a bound bamboo bundle, rope ties, crossed chigi at both ends
    L = 2 * (A_ if typ == 'gable' else axG if typ == 'irimoya' else R) + 0.12
    rr0 = o.get('ridge_rr', clamp(0.07 + H * 0.045, 0.1, 0.145))
    add(lathe([(0.0, -L / 2), (rr0 * 0.8, -L / 2), (rr0, -L / 2 + 0.03), (rr0, L / 2 - 0.03), (rr0 * 0.8, L / 2), (0.0, L / 2)], 10, th0=PI / 10)
        .xform(F.m @ lm((0, yTop + 0.01, 0), rz=PI / 2, s=(0.75, 1, 1.12))), paint(T['ridgeDark'], top=0.3, bot=0.3), 'ridge')
    pr = rr0 * 0.42
    for dz, dy in ((-pr * 1.05, 0), (pr * 1.05, 0), (0, pr * 0.85)):
        add(cyl(pr, pr, L - 0.06, (0, yTop + rr0 * 0.62 + dy, dz), K=8, rz=PI / 2, bev=0.01),
            lambda p, n: mul(mix('#b0a868', dark, 0.25), 0.84 + 0.22 * clamp(n.z + 0.4)), 'ridge')
    nr = max(2, round(L / o.get('rope_step', 0.5)))
    for k in range(nr + 1):
        x = -L / 2 + 0.12 + k * (L - 0.24) / nr
        add(gloop([(x, yTop + rr0 * 0.55 + rr0 * 1.08 * math.cos(TAU * q / 8), rr0 * 1.2 * math.sin(TAU * q / 8)) for q in range(8)], 0.022, K=4,
                  up=F.N((1, 0, 0))), soft(T['rope'], 0.25, 0.3), 'ridge')
    for s2 in ((-1, 1) if o.get('chigi', True) else ()):
        x = s2 * (L / 2 - 0.06)
        for k2 in (-1, 1): add(beam(0.05, 0.7, 0.08, (x, yTop + 0.2, 0), c=0.014, rx=k2 * 0.6), wood('#5e4634'), 'ridge')
        add(gloop([(x, yTop + 0.2 + 0.055 * math.cos(TAU * q / 6), 0.055 * math.sin(TAU * q / 6)) for q in range(6)], 0.02, K=4, up=F.N((1, 0, 0))),
            soft(T['rope'], 0.25), 'ridge')
    # the gable boards of an irimoya / gable: a dark timber triangle with a lattice vent
    if typ != 'hip' and o.get('boards', True):
        for s in (-1, 1):
            t0g = 0.0 if typ == 'gable' else tg
            y0g = yl + H * t0g + 0.02; hw = azAt(t0g) + 0.16; hg = yTop - y0g
            with at((s * (axG + 0.012), 0, 0), ry=s * PI / 2):
                add(prism([(hw, y0g), (0.0, yTop + 0.06), (-hw, y0g)], 0.04, 0.0), paint('#5e4634', top=0.2, bot=0.2), 'gable')
                for k in range(-2, 3):
                    zk = k * hw * 0.3; hk2 = hg * (1 - abs(zk) / hw) * 0.8
                    if hk2 < 0.1: continue
                    add(box(0.04, hk2, 0.035, (zk, y0g + hk2 / 2 + 0.03, 0.05), r=0.0), wood('#9a7a58'), 'gable')
                add(beam(hw * 2.06, 0.07, 0.06, (0, y0g + 0.02, 0.05), c=0.016), wood(T['ridgeDark']), 'gable')
    yAt = lambda x, z: yl + H * clamp(1 - abs(z) / Bz)
    return dict(ridgeY=yTop, yb=yb, yl=yl, H=H, A=A_, Bz=Bz, yAt=yAt, underAt=lambda x, z: yb + 0.02 * min(1.0, abs(z) / Bz))

# ================================================================== Takemori parts
def lattice_window(w, h, frame=None, tag='window'):
    """parts.js latticeWindow (koshi): a glowing paper pane behind close vertical slats, a kumiko band, a deep sill"""
    frame = frame or T['frame']
    add(box(w - 0.08, h - 0.08, 0.04, (0, 0, 0.02), r=0.0), lambda p, n: T['paper'], tag, glow=True)
    frame_ring(w - 0.06, h - 0.06, 0.05, 0.042, wood(frame), tag)
    iw = w - 0.13; n = max(4, round(iw / 0.075))
    for i in range(1, n):
        add(box(0.034, h - 0.12, 0.03, (-iw / 2 + i * iw / n, -0.01, 0.06), r=0.0), flat(frame if i % 2 else mul(frame, 0.88)), tag)
    yb_ = h / 2 - 0.16
    add(box(iw + 0.02, 0.036, 0.036, (0, yb_, 0.066), r=0.0), flat(mul(frame, 0.94)), tag)
    add(box(iw + 0.02, 0.034, 0.036, (0, -h / 2 + 0.11, 0.066), r=0.0), flat(mul(frame, 0.94)), tag)
    add(beam(w + 0.16, 0.07, 0.14, (0, -h / 2 - 0.025, 0.07), c=0.02), wood(frame), tag)

def sudare(w, drop, y, z=0.1, tag='window'):
    """a bamboo blind half let down over a window (face frame; its roll at y)"""
    add(cyl(0.035, 0.035, w + 0.06, (0, y, z), K=6, rz=PI / 2), lambda p, n: mix('#a89a5a', '#d8c888', clamp(n.z * 0.5 + 0.5)), tag)
    if drop > 0:
        def sc(p, n, y0_=F.W((0, y, 0)).z):
            k = int((y0_ - p.z) / 0.035)
            return mul('#c8b878' if k % 2 else '#b8a868', 0.9 + 0.1 * clamp(n.z + 0.5))
        add(box(w, drop, 0.016, (0, y - drop / 2, z - 0.01), r=0.0, extra=(0, max(2, int(drop / 0.035)), 0)), sc, tag)
        for s in (-1, 1): add(box(0.012, drop + 0.05, 0.02, (s * w * 0.3, y - drop / 2 + 0.02, z + 0.004), r=0.0), flat('#8a5a3a'), tag)

def bonsai_pot(r=0.14, color='#8a7a9a', seed=0, tag='pots'):
    """a potted pine (props.js pot plant 'pine'): a glazed pot, a crooked trunk and three cloud pads"""
    rng = random.Random(seed)
    add(glathe([(0.0, 0.0), (r * 0.8, 0.0), (r * 1.0, r * 0.75), (r * 1.1, r * 0.95), (r * 0.95, r * 1.0), (0.0, r * 0.9)], 9), lac(color), tag)
    add(cyl(r * 0.9, r * 0.9, 0.02, (0, r * 0.92, 0), K=9), flat('#5a4434'), tag)
    pts = [(0, r * 0.9, 0), (0.03, r * 0.9 + 0.12, 0.01), (-0.02, r * 0.9 + 0.22, 0.0), (0.03, r * 0.9 + 0.32, 0.0)]
    add(gtube(pts, lambda s: 0.03 - 0.012 * s, K=5), wood('#6a4a36'), tag)
    for k, (x, y, z, rr) in enumerate(((0.07, 0.27, 0.0, 0.12), (-0.08, 0.32, 0.02, 0.1), (0.03, 0.42, -0.01, 0.1))):
        add(sph(rr, (x, r * 0.9 + y - 0.1, z), sc=(1.25, 0.55, 1.05), K=8, J=4),
            lambda p, n: mix(mix('#2f5a3a', '#4a7a44', clamp(n.z * 0.8 + 0.5)), '#8cb860', clamp(n.z - 0.4) * 0.6), tag)

def geta(tag='stoop'):
    for s in (-1, 1):
        with at((s * 0.07, 0, 0), ry=s * 0.12):
            add(beam(0.09, 0.03, 0.2, (0, 0.055, 0), c=0.01), wood('#c99f6e'), tag)
            for zz in (-0.06, 0.06): add(box(0.08, 0.04, 0.025, (0, 0.02, zz), r=0.0), flat('#7a5a42'), tag)
            add(box(0.022, 0.02, 0.1, (0, 0.08, 0.03), r=0.0), flat('#c83a3a'), tag)

def stoop_stone(r=0.36, tag='stoop'):
    pebble((0, -0.02, 0), r, sq=0.38, seed=71, col='#cfc6bc', tag=tag, K=11)
    with at((0.02, r * 0.38 - 0.03, -0.02), ry=0.2): geta(tag)

def sack(r=0.18, color='#d8c49a', tag='sacks', seed=0):
    rng = random.Random(seed)
    add(lathe([(0.0, 0.0), (r * 0.9, 0.0), (r * 1.05, r * 0.5), (r * 0.95, r * 1.1), (r * 0.5, r * 1.45), (r * 0.25, r * 1.55), (0.0, r * 1.5)], 9,
              th0=rng.uniform(0, 1), rfn=lambda rr, z, th: rr * (1 + 0.06 * math.sin(3 * th + seed) + 0.04 * math.sin(5 * th))).xform(F.m @ lm()),
        lambda p, n: mix(mul(color, 0.82), mix(color, '#fff6e6', 0.15), clamp(n.z * 0.6 + 0.4)), tag)
    add(gloop([(r * 0.3 * math.cos(TAU * k / 6), r * 1.42, r * 0.3 * math.sin(TAU * k / 6)) for k in range(6)], 0.018, K=3), soft('#8a5a3a'), tag)
    add(blob(F.W((0, r * 1.5, 0)), r * 0.32, r * 0.25, lobes=4, K=8, seed=seed, amp=0.35), soft(mul(color, 0.95)), tag)

def plank(L, wd, th, col, x, y, z, a, tag):
    add(beam(L, wd, th, (x, y, z), c=0.012, rz=a), lambda p, n, c=col: mul(c, 0.86 + 0.16 * clamp(-n.y * 0.5 + n.z * 0.5 + 0.4)), tag)

def nail(x, y, z, tag): add(box(0.03, 0.03, 0.02, (x, y, z), r=0.0), flat('#4f4a58'), tag)

def boards(w, h, seed=0, depth=0.05, tag='boards'):
    """art.js boards: two crossed planks and the cross boards nailed over an opening (face frame, centred)"""
    rng = random.Random(seed * 131 + 7); z = depth
    L = math.hypot(w, h) * 0.96; a = math.atan2(h, w)
    plank(L, 0.13, 0.04, BOARD[seed % 4], 0, 0, z, a + (rng.random() - 0.5) * 0.08, tag)
    plank(L * 0.96, 0.12, 0.04, BOARD[(seed + 1) % 4], 0, 0.02, z + 0.04, -a + (rng.random() - 0.5) * 0.08, tag)
    nh = max(1, round(h / 0.55))
    for i in range(nh):
        y = -h / 2 + (i + 0.5) * h / nh + (rng.random() - 0.5) * 0.06
        plank(w * (1.06 + rng.random() * 0.08), 0.11 + rng.random() * 0.03, 0.04, BOARD[(seed + i + 2) % 4], (rng.random() - 0.5) * 0.06, y, z + 0.08, (rng.random() - 0.5) * 0.12, tag)
        for s in (-1, 1): nail(s * w * 0.46, y, z + 0.105, tag)
    for sx, sy in ((-1, -1), (1, 1), (-1, 1), (1, -1)): nail(sx * w * 0.44, sy * h * 0.44, z + 0.065, tag)

def soot(w, h, wall=None, seed=0, tag='soot'):
    """art.js soot: a dark scorch licking up a wall from its foot (face frame, base at the origin), blended to the plaster"""
    wall = wall or T['plaster']
    prof = [(0.0, 0.0), (0.35, 0.0), (0.7, 0.0), (1.0, 0.0), (0.96, 0.008), (0.0, 0.012)]
    t = lathe(prof, 14, sx=w * 0.5, sy=h * 0.5, th0=seed * 0.3, rfn=lambda rr, z, th: rr * (1 + 0.16 * math.sin(3 * th + seed) + 0.1 * math.sin(5 * th + seed * 2)))
    t.xform(F.m @ lm((0, h * 0.5, 0.012), rx=PI / 2))
    Mi = F.m.inverted()
    def sc(p, n):
        q = GMi @ (Mi @ p); k = clamp(math.hypot(q.x / (w * 0.5), (q.y - h * 0.5) / (h * 0.5)))
        return mix('#3a302c', wall, k * k * 0.85 + clamp((q.y - h * 0.3) / h) * 0.25)
    add(t, sc, tag)

def crate_k(s=0.34, seed=0, tag='crates'): crate(s, '#c8a070', tag=tag, seed=seed)

def debris(r=1.4, seed=0, n=6, tag='debris'):
    """art.js debris: broken planks, a tipped crate, a rolled barrel, stones"""
    rng = random.Random(seed * 101 + 9)
    for i in range(n):
        a = rng.random() * TAU; d = r * math.sqrt(rng.random()); x, z = math.cos(a) * d, math.sin(a) * d; k = rng.random()
        if k < 0.45:
            with at((x, 0.035, z), ry=rng.random() * PI): add(beam(0.5 + rng.random() * 0.5, 0.05, 0.13, (0, 0, 0), c=0.012, rz=(rng.random() - 0.5) * 0.2), wood(BOARD[i % 4]), tag)
        elif k < 0.65:
            with at((x, 0.0, z), ry=rng.random() * TAU, rx=(rng.random() - 0.5) * 0.3): crate(0.3, '#b8946a', tag=tag, seed=i)
        elif k < 0.8:
            with at((x, 0.16, z), ry=rng.random() * TAU, rx=PI / 2):
                with at((0, -0.17, 0)): barrel(0.16, 0.34, tag=tag)
        else: pebble((x, -0.01, z), 0.1 + rng.random() * 0.07, sq=0.6, seed=i + seed, tag=tag)

def bamboo_mark(size, pos=(0, 0, 0), depth=0.02, col='#4a7a3a', tag='sym'):
    """the bamboo emblem in relief: a culm with two nodes and a leaf (art.js symbolGeo 'bamboo')"""
    x, y, z = pos; s = size
    with at((x, y, z)):
        add(beam(0.12 * s, 0.9 * s, depth, (-0.08 * s, 0, depth / 2), c=depth * 0.3, rz=0.08), soft(col, 0.25), tag)
        for yy in (-0.15, 0.17): add(beam(0.17 * s, 0.05 * s, depth * 1.3, (-0.08 * s - yy * 0.08 * s, yy * s, depth * 0.6), c=depth * 0.3, rz=0.08), soft(mul(col, 0.8), 0.2), tag)
        for k, (ax_, ay, rot) in enumerate(((0.16, 0.22, -0.5), (0.2, -0.02, -0.15))):
            leaf = [(0.0, 0.0), (0.14 * s, 0.05 * s), (0.32 * s, 0.0), (0.14 * s, -0.045 * s)]
            with at((ax_ * s - 0.08 * s, ay * s, 0), rz=rot): add(puffy(leaf[::-1] if False else leaf, depth * 0.9, bev=depth * 0.3), soft(mix(col, '#8ac060', 0.3), 0.25), tag)

def coin(r=0.07, pos=(0, 0, 0), tag='sign'):
    with at(pos):
        add(glathe([(0.0, 0.0), (r, 0.0), (r, 0.025), (0.0, 0.025)], 12, rx=PI / 2), lac('#e8b84a', '#fff0b0', '#b8862a'), tag)
        add(box(0.03, 0.03, 0.012, (0, 0, 0.03), r=0.0), flat('#7a5a2a'), tag)

def leaf_mark(size, pos=(0, 0, 0), depth=0.016, col='#fff6ea', tag='sym'):
    x, y, z = pos; s = size
    leaf = [(0.0, -0.4 * s), (0.2 * s, -0.1 * s), (0.16 * s, 0.2 * s), (0.0, 0.42 * s), (-0.16 * s, 0.2 * s), (-0.2 * s, -0.1 * s)][::-1]
    with at((x, y, z)):
        add(puffy(leaf, depth, bev=depth * 0.4), soft(col, 0.2), tag)
        add(box(0.025 * s, 0.7 * s, depth * 0.6, (0, 0, depth + 0.002), r=0.0), flat(mul(col, 0.8)), tag)

def noren_b(w=0.94, h=0.48, y=1.33, z=0.17, color='#3f6f5a', strips=3, sym='bamboo', tag='noren'):
    """a noren over a doorway (face frame, the door top at y): split cloth strips with a pale hem, an emblem across them"""
    rod = '#4a3628'
    add(cyl(0.028, 0.028, w + 0.16, (0, y + 0.02, z), K=7, rz=PI / 2), wood(rod), tag)
    for s in (-1, 1): add(beam(0.045, 0.06, z + 0.02, (s * (w / 2 + 0.05), y + 0.02, z / 2), c=0.012), wood(rod), tag)
    gap = 0.035; sw = (w - gap * (strips - 1)) / strips; hem = 0.075
    for i in range(strips):
        x = -w / 2 + sw / 2 + i * (sw + gap); sway = (i - (strips - 1) / 2) * 0.012
        add(beam(sw, h - hem, 0.03, (x, y - (h - hem) / 2, z), c=0.012, rx=0.04, rz=sway),
            lambda p, n: mix(mul(color, 0.8), mix(color, '#ffffff', 0.12), smooth(y - h, y, p.z) * 0.7 + clamp(-n.y) * 0.1), tag)
        add(beam(sw, hem, 0.034, (x - sway * 0.45, y - h + hem / 2 + 0.005, z + 0.018), c=0.014, rx=0.04), soft('#f4efe6', 0.2), tag)
    if sym == 'bamboo': bamboo_mark(h * 0.62, (0, y - h * 0.45, z + 0.03), depth=0.016, col='#f4efe6', tag=tag)
    elif sym == 'futon': futon_mark(h * 0.5, (0, y - h * 0.45, z + 0.03), depth=0.014, cols=('#f4efe6', '#c8d4e8'), tag=tag)
    else: leaf_mark(h * 0.6, (0, y - h * 0.45, z + 0.03), tag=tag)

def nobori_b(h=2.3, w=0.4, color='#5a9a6a', tag='banners'):
    add(cyl(0.03, 0.036, h, (0, h / 2, 0), K=6), wood('#6b4a3a', ao_z=0.0), tag)
    add(cyl(0.02, 0.02, w + 0.08, (w / 2, h - 0.08, 0), K=4, rz=PI / 2), wood('#6b4a3a'), tag)
    add(sph(0.055, (0, h + 0.03, 0), K=6, J=3), lac('#f2c04a'), tag)
    fh = h * 0.72; yTop = h - 0.1
    def cloth(p, n):
        u = clamp((p.z - (yTop - fh)) / fh)
        return mix(mul(color, 0.82), mix(color, '#ffffff', 0.1), u * 0.7 + 0.2 * clamp(-n.y))
    add(beam(w, fh - 0.1, 0.03, (0.02 + w / 2, yTop - (fh - 0.1) / 2, 0), c=0.012, rx=0.02), cloth, tag)
    add(box(w + 0.004, 0.1, 0.034, (0.02 + w / 2, yTop - fh + 0.05, 0), r=0.0), soft('#fff6ea', 0.2), tag)
    add(box(0.05, fh, 0.036, (0.045, yTop - fh / 2, 0.002), r=0.0), soft('#fff6ea', 0.2), tag)
    leaf_mark(w * 0.62, (0.02 + w / 2, yTop - fh * 0.32, 0.018), tag=tag)
    add(cyl(0.1, 0.13, 0.14, (0, 0.07, 0), K=7), stone_col(STONES[1]), tag)

def lamp_hook(x, y, z, top, tag='hooks'):
    """an iron hook where the game hangs a lantern (the kit's lamps point): a short drop from the beam above"""
    L = max(0.04, top - y)
    add(box(0.022, L + 0.02, 0.022, (x, y + L / 2, z), r=0.0), flat('#4f4a58'), tag)
    add(gloop([(x + 0.03 * math.cos(TAU * k / 6), y + 0.03 * math.sin(TAU * k / 6), z) for k in range(6)], 0.01, K=3, up=F.N((0, 0, 1))), flat('#4f4a58'), tag)

def plaster_patch(w=0.5, h=0.32, seed=0, tag='walls'):
    """weathered plaster (parts.js weatherWalls): a flaked patch with the bamboo lath showing (face frame)"""
    add(box(w, h, 0.012, (0, 0, 0.006), r=0.0), flat('#c8b090'), tag)
    for k in range(4): add(box(w * 0.85, 0.035, 0.016, (0, -h / 2 + (k + 0.5) * h / 4, 0.014), r=0.0), soft('#a89058', 0.2), tag)
    add(gloop([(w / 2 * math.cos(TAU * k / 10) * (1 + 0.12 * math.sin(k * 2.3 + seed)), h / 2 * math.sin(TAU * k / 10), 0.014) for k in range(10)], 0.022, K=3,
              up=F.N((0, 0, 1))), soft('#fff4e0', 0.15), tag)

def tea_tray_b(tag='porch'): tea_tray(tag)

def cushion(c='#e86a6a', s=0.32, tag='porch'):
    add(box(s, 0.07, s, (0, 0.035, 0), r=0.03), lambda p, n: mix(mul(c, 0.82), mix(c, '#fff0f0', 0.15), clamp(n.z * 0.6 + 0.4)), tag)
    add(box(0.035, 0.025, 0.035, (0, 0.075, 0), r=0.0), flat(mul(c, 0.7)), tag)

def basket(r=0.13, h=0.1, tag='baskets'):
    def bc(p, n, base=F.W((0, 0, 0))):
        k = int((p.z - base.z) / 0.03) % 2
        return mul('#c8a060' if k else '#b08a4c', 0.86 + 0.18 * clamp(n.z + 0.4))
    add(glathe([(0.0, 0.0), (r * 0.78, 0.0), (r, h), (r * 0.9, h * 0.98), (0.0, h * 0.4)], 8), bc, tag)
    add(gloop([(r * math.cos(TAU * k / 10), h, r * math.sin(TAU * k / 10)) for k in range(10)], 0.016, K=3), soft('#a07a40'), tag)

# ================================================================== Grandma Sasa's house (artBamboo.js elder)
def new_asset(name):
    global A, OB
    A = Asset2(); F.__init__(); OB = name
    PAL.update(dict(wall=T['plaster'], wallLo='#e2d2b8', frame=T['frame'], frameLo='#3e3026', paper=T['paper'], indigo='#3f6f5a'))

def build_elder():
    new_asset('zv-bamboo-elder')
    w, d, h, y0, zc = 3.9, 2.6, 1.66, 0.36, -0.42
    Fz = zc + d / 2
    F.push((0, 0, zc))
    foundation(w, d, y0, pad=0.14, seed=3, color=T['stone'])
    walls(dict(w=w, d=d, h=h, y0=y0, plaster=T['plaster'], frame=T['frame'], koshi=T['koshi'], koshiSkip='f'))
    blk = dict(w=w, d=d)
    with on_face(blk, 'f', 0, y0): door_slide(1.5, 1.34, style='shoji', wd=T['deck'], frame=T['frame'])
    for s in (-1, 1):
        with on_face(blk, 'f', s * 1.4, y0 + 0.8):
            shoji(0.74, 0.56, frame=T['frame'])
            add(beam(0.98, 0.07, 0.07, (0, 0.36, 0.04), c=0.016), wood(T['frame']), 'window')
            if s < 0: sudare(0.72, 0.24, 0.31, z=0.1)
    with on_face(blk, 'r', 0.1, y0 + 0.84): round_window(0.3, frame=T['frame'])
    with on_face(blk, 'l', -0.2, y0 + 0.82): lattice_window(0.72, 0.52, frame=T['frame'])
    with on_face(blk, 'l', 0.75, y0 + 0.62): plaster_patch(0.42, 0.3, seed=2)
    for u in (0.7, -0.8):
        with on_face(blk, 'b', u, y0 + 0.84): shoji(0.62, 0.5, frame=T['frame'])
    R = thatch(dict(type='irimoya', w=w, d=d, y0=y0 + h, over=0.56, H=1.6, tg=0.6, lip=0.32, seed=11))
    ez = d / 2 + 0.74
    engawa(-w / 2 - 0.05, w / 2 + 0.05, d / 2, 0.78, y0 + 0.02, wd=T['deck'], beamC=T['frame'], seed=8)
    pTop = R['underAt'](w / 2, ez) - 0.04
    posts_row([-w / 2 + 0.04, w / 2 - 0.04], ez, pTop, T['frame'], r=0.07)
    add(beam(w + 0.1, 0.11, 0.11, (0, pTop - 0.02, ez), c=0.025), wood(T['frame']), 'porch')
    for s in (-1, 1): add(gtube([(s * (w / 2 - 0.04), pTop - 0.36, ez), (s * (w / 2 - 0.3), pTop - 0.07, ez)], 0.028, K=4), wood(T['frame']), 'porch')
    # porch life: dried persimmons, a wind chime, potted pines, a tea tray, geta on the stoop stone
    for i in range(4):
        with at((-1.15 + i * 0.13, pTop - 0.08, ez - 0.02)): persimmons(4 + (i % 2), 'charms')
    with at((0.95, pTop - 0.08, ez - 0.02)): furin('#bfe6ff')
    for s in (-1, 1):
        with at((s * 1.65, y0 + 0.02, d / 2 + 0.28)): bonsai_pot(0.14, '#8a7a9a', seed=4 + s)
    with at((1.05, y0 + 0.02, d / 2 + 0.42), ry=0.3): tea_tray('porch')
    with at((0, 0, d / 2 + 0.98)): stoop_stone(0.36)
    pTopW = R['underAt'](w / 2 - 0.4, ez) - 0.06
    F.pop()
    # the yard: firewood at the side, a rain barrel, a stone lantern
    with at((-2.35, 0, -0.9), ry=PI / 2): wood_stack(0.9, 0.5, 0.26, roofed=True, seed=5)
    with at((2.3, 0, -1.15)): barrel(0.18, 0.4)
    with at((2.45, 0, 0.7)): toro(0.8)
    # ---- the overlays (separate objects: the game shows one or the other)
    with layer('siege'):
        with at((0, y0 + 0.67, Fz)): boards(1.55, 1.4, seed=1)
        for s in (-1, 1):
            with at((s * 1.4, y0 + 0.8, Fz)): boards(0.8, 0.62, seed=2 + (s > 0))
        with at((1.62, y0, Fz + 0.01)): soot(0.6, 1.25, seed=3)
        with at((-2.1, 0, Fz + 1.5)): debris(0.9, seed=11, n=5)
    with layer('saved'):
        with at((0, y0, Fz)): noren_b(1.3, 0.46, 1.34 - 0.02, 0.18, '#3f6f5a', 3, 'bamboo')
        with at((-0.55, y0 + 0.02, Fz + 0.4), ry=0.2): cushion('#e86a6a')
        for s in (-1, 1):
            with at((s * 2.3, 0, Fz + 1.0)): pot_flowers(0.16, 0.22, ('#ff8fb0', '#fff6ea', '#ffd24a'), 'pots')
    info = dict(fp=[-w / 2 - 0.12, zc - d / 2 - 0.12, w / 2 + 0.12, Fz + 0.8], door=[0, Fz + 1.4],
                lamps=[[-1.55, round(pTopW, 3), round(zc + ez, 3)], [1.55, round(pTopW, 3), round(zc + ez, 3)]], ridgeY=round(R['ridgeY'], 3))
    return A, info

# ================================================================== Chiku's General Store (artBamboo.js shop)
GOODS = ['#d86a4a', '#e8c86a', '#7ab06a', '#8fb8e0', '#f0e6d0', '#b07ad0']
def build_shop():
    new_asset('zv-bamboo-shop')
    w, d, h, y0, zc = 3.2, 2.2, 1.5, 0.28, -0.28
    Fz = zc + d / 2
    F.push((0, 0, zc))
    foundation(w, d, y0, pad=0.14, seed=5, color=T['stone'])
    walls(dict(w=w, d=d, h=h, y0=y0, plaster=T['plaster'], frame=T['frame'], koshi=T['koshi'], koshiSkip='f'))
    blk = dict(w=w, d=d)
    # the open front: a dark interior recess with goods on shelves, posts and a deep lintel, the counter
    with on_face(blk, 'f', 0, y0):
        add(box(w - 0.3, h - 0.14, 0.04, (0, (h - 0.14) / 2 + 0.02, 0.02), r=0.0), lambda p, n: mix('#3e2e28', '#5a4436', clamp(p.z - 0.6)), 'shelves')
        rng = random.Random(77)
        for y in (0.42, 0.78, 1.12):
            add(beam(w - 0.46, 0.05, 0.22, (0, y, 0.13), c=0.012), wood('#a8845e'), 'shelves')
            x = -(w - 0.66) / 2
            while x < (w - 0.66) / 2:
                k = rng.random(); c = GOODS[int(rng.random() * 6)]
                if k < 0.45:
                    add(cyl(0.055, 0.06, 0.15, (x, y + 0.1, 0.13), K=6, bev=0.0), lac(c), 'goods')
                    add(cyl(0.04, 0.04, 0.035, (x, y + 0.19, 0.13), K=6), flat('#5a4434'), 'goods')
                elif k < 0.8:
                    hh = 0.1 + rng.random() * 0.08
                    add(box(0.13, hh, 0.13, (x, y + 0.025 + hh / 2, 0.13), r=0.02), soft(c, 0.2), 'goods')
                else:
                    add(sph(0.065, (x, y + 0.08, 0.13), sc=(1, 0.8, 1), K=6, J=3), lac(c), 'goods')
                x += 0.17 + rng.random() * 0.06
        for s in (-1, 1): add(beam(0.13, h, 0.13, (s * (w / 2 - 0.12), h / 2, 0.07), c=0.025), wood(T['frame'], ao_z=0.0), 'timber')
        add(beam(w + 0.06, 0.17, 0.15, (0, h - 0.06, 0.08), c=0.03), wood(T['frame']), 'timber')
        add(box(w - 0.6, 0.6, 0.4, (0, 0.3, 0.28), r=0.03), wood('#9a7656', ao_z=0.0), 'counter')
        add(beam(w - 0.48, 0.07, 0.5, (0, 0.63, 0.28), c=0.02), wood('#c99f6e'), 'counter')
        for i in range(7): add(box(0.025, 0.5, 0.02, (-(w - 0.6) / 2 + (i + 0.5) * (w - 0.6) / 7, 0.29, 0.485), r=0.0), flat('#7a5a42'), 'counter')
        # an abacus and a lucky cat-dog on the counter (always there: the shop's keeper works behind it)
        with at((0.75, 0.665, 0.25), ry=-0.2):
            add(beam(0.34, 0.03, 0.14, (0, 0.015, 0), c=0.01), wood('#6a4a36'), 'counter')
            for k in range(5):
                for q in range(4): add(sph(0.018, (-0.13 + k * 0.065, 0.04, -0.045 + q * 0.03), sc=(1, 0.7, 1), K=5, J=3), lac('#c8503a'), 'counter')
    for side in ('l', 'r'):
        with on_face(blk, side, 0, y0 + 0.82): shoji(0.62, 0.5, frame=T['frame'])
    with on_face(blk, 'b', 0, y0 + 0.82): shoji(0.8, 0.5, frame=T['frame'])
    R = thatch(dict(type='hip', w=w, d=d, y0=y0 + h, over=0.6, H=1.3, lip=0.3, hip=0.55, seed=23))
    # the shop sign: a kanban propped on the front thatch (the kit's sat inside the eave), the bamboo emblem and three
    # coins (no words), leaning back toward the high camera
    zs = d / 2 + 0.6 - 0.62; ys = R['yAt'](0, zs) - 0.02
    with at((0, ys, zs), rx=-0.42):
        for sx in (-1, 1): add(beam(0.07, 0.42, 0.07, (sx * 0.48, 0.05, -0.05), c=0.016), wood(T['frame']), 'sign')
        add(box(1.27, 0.45, 0.06, (0, 0.34, -0.02), r=0.025), wood(T['frame']), 'sign')
        add(box(1.17, 0.36, 0.05, (0, 0.34, 0.014), r=0.02), soft('#f0dcb4', 0.15, 0.25), 'sign')
        bamboo_mark(0.3, (-0.38, 0.34, 0.035), depth=0.022, col='#4a7a3a')
        for i in range(3): coin(0.075, (0.03 + i * 0.2, 0.34, 0.035))
        add(box(1.36, 0.08, 0.14, (0, 0.6, 0.0), r=0.025), wood(T['ridgeDark']), 'sign')
    F.pop()
    with at((-2.0, 0, 0.0)):
        crate_k(0.36, 1)
        with at((0.04, 0.36 * 0.85, 0.02), ry=0.3): crate_k(0.28, 2)
    with at((2.0, 0, -0.4)): sack(0.18, '#d8c49a', seed=1)
    with at((2.05, 0, 0.15), ry=0.6): sack(0.16, '#e8dcc0', seed=2)
    # ---- the overlays
    with layer('siege'):
        with at((0, y0, Fz + 0.55)):
            n = 7
            for i in range(n):
                add(beam((w - 0.3) / n - 0.02, h - 0.12, 0.05, (-(w - 0.3) / 2 + (i + 0.5) * (w - 0.3) / n, (h - 0.12) / 2, 0), c=0.012, rz=(i - 3) * 0.006),
                    wood(BOARD[i % 3]), 'amado')
            with at((0, h * 0.5, 0)): boards(w - 0.4, h - 0.3, seed=13)
        with at((-1.9, 0, Fz + 1.4)): debris(0.8, seed=31, n=5)
    with layer('saved'):
        with at((0, y0, Fz + 0.28)):
            for i in range(5):
                x = -1.0 + i * 0.5
                with at((x, 0.665, 0)): basket(0.13, 0.1)
                for k in range(4):
                    add(glathe([(0.0, 0.0), (0.04, 0.0), (0.0, 0.17)], 6, pos=(x + (k % 2 - 0.5) * 0.08, 0.7, (k // 2 - 0.5) * 0.07), rz=(k - 1.5) * 0.15),
                        lambda p, n, c=('#c8a050' if i % 2 else '#b8c870'): mix(mul(c, 0.82), mix(c, '#fff0c0', 0.25), clamp(n.z * 0.5 + 0.5)), 'shoots')
        with at((0, y0 + h + 0.02, Fz + 0.5)): awning(w - 0.2, 0.62, 0.3, ['#5a9a6a', '#f6eedc'], 10)
        with at((-1.85, 0, Fz + 1.0)): nobori_b(2.3, 0.4, '#5a9a6a')
        with at((1.5, 0, Fz + 1.1)):
            for i in range(3):
                with at((i * 0.32 - 0.32, 0, (i % 2) * 0.12), ry=i):
                    with at((0, 0, 0), s=1.15): basket(0.13, 0.17)
                    add(sph(0.13, (0, 0.2, 0), sc=(1, 0.4, 1), K=8, J=4), lac(['#e86a4a', '#7ab06a', '#f0c84a'][i]), 'produce')
    info = dict(fp=[-w / 2 - 0.1, zc - d / 2 - 0.1, w / 2 + 0.1, Fz + 0.52], door=[0, Fz + 1.15],
                lamps=[[-1.25, round(y0 + h, 3), round(Fz + 0.55, 3)], [1.25, round(y0 + h, 3), round(Fz + 0.55, 3)]], ridgeY=round(R['ridgeY'], 3))
    return A, info

# ================================================================== round 2: more Takemori parts
def bpole(a, b, r=0.035, col=None, nodes=True, K=6, tag='bamboo', rings=False):
    """a bamboo pole from a to b (game-local points): a tube, a pale cut end on top. rings: real node rings (a swell and a
    dark band every 0.36 m: costs rings, so only on the poles seen up close)"""
    col = col or T['bamboo']; A_, B_ = F.W(a), F.W(b); L = (B_ - A_).length; d = (B_ - A_).normalized()
    ts = [0.0, 1.0]; nd = []
    if rings and L > 0.4:
        u = 0.36
        while u < L - 0.1:
            nd.append(u / L); ts += [(u - 0.03) / L, u / L, (u + 0.03) / L]; u += 0.36
    ts = sorted(set(ts))
    def rad(sv):
        tt = ts[min(len(ts) - 1, round(sv * (len(ts) - 1)))]
        return r * (1 - 0.08 * tt) * (1.13 if any(abs(tt - q) < 1e-6 for q in nd) else 1.0)
    t = tube([A_ + d * (L * tt) for tt in ts], rad, K=K, caps=True)
    def bc(p, n):
        u = (p - A_).dot(d)
        c = mix(mul(col, 0.84), mix(col, '#f4f0c0', 0.18), clamp(n.z * 0.6 + 0.4))
        if u > L + r * 0.3: return mix(col, '#f0e8b8', 0.6)
        if nd and any(abs(u - q * L) < 0.012 for q in nd): c = mix(c, mul(T['bambooDark'], 0.8), 0.7)
        return c
    add(t, bc, tag)

def hood(w, y, color, depth=0.34, wd=None, tag='window'):
    """parts.js hood: a small tiled hisashi over a window (face frame)"""
    wd = wd or T['frame']
    with at((0, y, 0)):
        add(box(w, 0.07, depth, (0, 0.02, depth / 2 - 0.02), r=0.03, rx=0.42), lambda p, n: mix(mul(color, 0.8), mix(color, '#d8e0f0', 0.3), clamp(n.z)), tag)
        add(box(w + 0.04, 0.07, 0.08, (0, -0.05, depth - 0.03), r=0.03), soft(mix(color, '#fff6ea', 0.35), 0.2), tag)
        n = max(2, round(w / 0.16))
        for i in range(n + 1):
            add(cyl(0.03, 0.03, depth * 0.95, (-w / 2 + 0.04 + i * (w - 0.08) / n, 0.075, depth / 2 - 0.02), K=5, rx=PI / 2 + 0.42),
                lambda p, nn: mix(color, '#c8d0e0', 0.2 * clamp(nn.z)), tag)
        for sd in (-1, 1): add(box(0.05, 0.05, depth * 0.7, (sd * (w / 2 - 0.1), -0.12, 0.12), r=0.0, rx=-0.6), wood(wd), tag)

def bay_lattice(w, h, frame, roof_col, tag='window'):
    """parts.js latticeWindow({bay}): the lattice stands proud of the wall on side boards under a little tiled hood"""
    bay = 0.11
    for sd in (-1, 1): add(box(0.07, h - 0.02, bay + 0.02, (sd * (w / 2 - 0.035), 0, (bay + 0.02) / 2), r=0.0), wood(mul(frame, 0.9)), tag)
    with at((0, 0, bay)): lattice_window(w, h, frame, tag)
    hood(w + 0.18, h / 2 + 0.1, roof_col, 0.17 + bay + 0.1, tag=tag)

def star_poly(n, r0, r1, a0=PI / 2):
    return [((r0 if k % 2 == 0 else r1) * math.cos(a0 + PI * k / n), (r0 if k % 2 == 0 else r1) * math.sin(a0 + PI * k / n)) for k in range(2 * n)]

def star_mark(size, pos=(0, 0, 0), depth=0.016, col='#fff6ea', tag='sym'):
    with at(pos): add(puffy(star_poly(5, 0.42 * size, 0.18 * size), depth, bev=depth * 0.4), soft(col, 0.2), tag)

def shuriken_mark(size, pos=(0, 0, 0), depth=0.02, col='#2a2630', hole='#e8dcc0', tag='sym'):
    with at(pos):
        add(puffy(star_poly(4, 0.45 * size, 0.13 * size, a0=PI / 4), depth, bev=depth * 0.35), lac(col, mix(col, '#a8a0b8', 0.5)), tag)
        add(glathe([(0.0, 0.0), (0.05 * size, 0.0), (0.05 * size, 0.01), (0.0, 0.01)], 8, rx=PI / 2, pos=(0, 0, depth + 0.002)), flat(hole), tag)

def futon_mark(size, pos=(0, 0, 0), depth=0.02, cols=('#3a5a8a', '#e8eef8'), tag='sym'):
    """the inn's emblem: a folded futon stack (art.js symbolGeo 'futon')"""
    with at(pos):
        for k in range(3):
            add(box(0.8 * size - k * 0.06 * size, 0.2 * size, depth, (k * 0.02 * size, -0.25 * size + k * 0.23 * size, depth / 2), r=min(0.04, depth * 0.45)),
                soft(cols[k % 2], 0.2), tag)

def basket_mark(size, pos=(0, 0, 0), depth=0.02, col='#8a5a2a', tag='sym'):
    with at(pos):
        add(puffy([(-0.36 * size, 0.08 * size), (-0.26 * size, -0.32 * size), (0.26 * size, -0.32 * size), (0.36 * size, 0.08 * size)][::-1], depth, bev=depth * 0.35), soft(col, 0.2), tag)
        add(gtube([(-0.26 * size, 0.08 * size, depth * 0.6)] + [(0.26 * size * math.cos(a), 0.08 * size + 0.3 * size * math.sin(a), depth * 0.6) for a in (PI * 0.85, PI / 2, PI * 0.15)] + [(0.26 * size, 0.08 * size, depth * 0.6)],
                  0.04 * size, K=4), soft(col, 0.2), tag)
        for k in range(3): add(box(0.56 * size, 0.035 * size, depth * 0.5, (0, -0.22 * size + k * 0.11 * size, depth + 0.004), r=0.0), flat(mix(col, '#f0d8a0', 0.45)), tag)

def war_banner(h=2.4, w=0.55, seed=0, tag='banner'):
    """art.js warBanner: the yokai's tattered banner: a dark pole, a crossbar, ragged purple cloth, a pale weasel mask"""
    rng = random.Random(seed)
    add(cyl(0.035, 0.042, h, (0, h / 2, 0), K=6), wood('#3a2a2a', ao_z=0.0), tag)
    add(cyl(0.022, 0.022, w + 0.12, (w / 2, h - 0.1, 0), K=4, rz=PI / 2), wood('#3a2a2a'), tag)
    add(glathe([(0.0, 0.0), (0.05, 0.0), (0.0, 0.14)], 4, pos=(0, h, 0)), lac('#c8c0b0'), tag)
    fh = h * 0.62; yT = h - 0.12; cx = 0.03 + w / 2
    def cl(p, n): return mix('#3a2440', '#6a3a78', clamp(n.z * 0.3 + 0.55))
    add(box(w, fh, 0.03, (cx, yT - fh / 2, 0), r=0.0, rz=rng.uniform(-0.03, 0.03)), cl, tag)
    for k in range(3):
        tl = rng.uniform(0.12, 0.26)
        add(prism([(cx - w / 2 + k * w / 3, yT - fh + 0.005), (cx - w / 2 + (k + 1) * w / 3, yT - fh + 0.005), (cx - w / 2 + (k + 0.5) * w / 3 + rng.uniform(-0.03, 0.03), yT - fh - tl)], 0.03, -0.015), cl, tag)
    with at((cx, yT - fh * 0.42, 0.016)):
        s = w * 0.8
        add(puffy([(0.0, -0.32 * s), (0.3 * s, 0.0), (0.34 * s, 0.34 * s), (0.14 * s, 0.14 * s), (-0.14 * s, 0.14 * s), (-0.34 * s, 0.34 * s), (-0.3 * s, 0.0)][::-1], 0.016, bev=0.006), soft('#f0e8f0', 0.2), tag)
        for sd in (-1, 1): add(box(0.11 * s, 0.035 * s, 0.01, (sd * 0.11 * s, 0.03 * s, 0.018), r=0.0, rz=sd * 0.35), flat('#2a2030'), tag)
    add(cyl(0.1, 0.12, 0.1, (0, 0.05, 0), K=6), stone_col(STONES[2]), tag)

def tea_bench(w=1.0, felt='#d84848', tag='bench'):
    add(beam(w, 0.06, 0.44, (0, 0.42, 0), c=0.02), wood('#b8946a'), tag)
    for sx in (-1, 1):
        for sz in (-1, 1): add(beam(0.06, 0.4, 0.06, (sx * (w / 2 - 0.07), 0.2, sz * 0.16), c=0.012), wood('#7a5a42', ao_z=0.0), tag)
    add(box(w + 0.04, 0.025, 0.52, (0, 0.465, 0), r=0.0), lambda p, n: mix(mul(felt, 0.8), felt, clamp(n.z * 0.6 + 0.4)), tag)
    for sx in (-1, 1): add(box(0.03, 0.12, 0.52, (sx * (w / 2 + 0.02), 0.41, 0), r=0.0), soft(mul(felt, 0.86)), tag)
    with at((0.2, 0.48, 0)): tea_tray(tag)

def futon_rail(w=0.56, color='#ff9ec0', tag='futons'):
    """a futon airing over a rail (along local x): a rolled fold, a long drop outside (+z), dots"""
    add(cyl(0.05, 0.05, w, (0, 0.03, 0), K=8, rz=PI / 2), lambda p, n: mix(mul(color, 0.8), color, clamp(n.z * 0.6 + 0.6)), tag)
    for sd, L in ((1, 0.4), (-1, 0.24)):
        with at((0, 0.03 - L / 2, sd * 0.05), rx=-sd * 0.1):
            add(box(w, L, 0.05, (0, 0, 0), r=0.022), lambda p, n: mix(mul(color, 0.8), color, clamp(0.5 + n.z * 0.3 + 0.2 * (n.y * -sd))), tag)
            if sd > 0:
                add(box(w + 0.01, 0.05, 0.06, (0, -L / 2 + 0.03, 0), r=0.02), soft('#fff6ea', 0.2), tag)
                for i in range(5): add(cyl(0.024, 0.024, 0.012, (-w * 0.36 + i * w * 0.18, L / 2 - 0.1 - (i % 2) * 0.11, 0.03), K=6, rx=PI / 2), flat('#fffaf2'), tag)

def lit_lantern(r=0.1, h=0.26, color='#f0d890', cord=0.08, tag='lantern'):
    chochin(r, h, color, cord=cord, pos=(0, 0, 0), glow=True, tag=tag)

def makiwara(tag='yard'):
    add(cyl(0.075, 0.085, 1.15, (0, 0.58, 0), K=7), wood('#9a7a5a', ao_z=0.0), tag)
    add(cyl(0.11, 0.11, 0.38, (0, 0.86, 0), K=9, bev=0.02), lambda p, n: mix('#b89858', '#e8d098', clamp(n.z * 0.4 + 0.5)), tag)
    for k in range(4): add(gloop([(0.115 * math.cos(TAU * q / 9), 0.72 + k * 0.095, 0.115 * math.sin(TAU * q / 9)) for q in range(9)], 0.014, K=3), soft('#8a6a3a'), tag)
    add(cyl(0.17, 0.21, 0.09, (0, 0.045, 0), K=7), stone_col(STONES[1]), tag)

def chopping_block(tag='block'):
    add(cyl(0.2, 0.22, 0.36, (0, 0.18, 0), K=9), lambda p, n: '#e0c090' if n.z > 0.8 else mul('#8a6a4a', 0.88 + 0.15 * clamp(n.z + 0.4)), tag)
    with at((0.06, 0.37, 0), rz=-0.5):
        add(beam(0.045, 0.36, 0.045, (0, 0.16, 0), c=0.01), wood('#7a5a3a'), tag)
        add(beam(0.16, 0.09, 0.035, (0.05, 0.31, 0), c=0.01), soft(PAL['iron'], 0.35), tag)

def nobori_star(h=2.5, w=0.42, color='#34405e', tag='banners'):
    add(cyl(0.03, 0.036, h, (0, h / 2, 0), K=6), wood('#6b4a3a', ao_z=0.0), tag)
    add(cyl(0.02, 0.02, w + 0.08, (w / 2, h - 0.08, 0), K=4, rz=PI / 2), wood('#6b4a3a'), tag)
    add(sph(0.055, (0, h + 0.03, 0), K=6, J=3), lac('#f2c04a'), tag)
    fh = h * 0.72; yTop = h - 0.1
    add(beam(w, fh - 0.1, 0.03, (0.02 + w / 2, yTop - (fh - 0.1) / 2, 0), c=0.012, rx=0.02),
        lambda p, n: mix(mul(color, 0.82), mix(color, '#ffffff', 0.12), clamp((p.z - (yTop - fh)) / fh) * 0.7), tag)
    add(box(w + 0.004, 0.1, 0.034, (0.02 + w / 2, yTop - fh + 0.05, 0), r=0.0), soft('#fff6ea', 0.2), tag)
    add(box(0.05, fh, 0.036, (0.045, yTop - fh / 2, 0.002), r=0.0), soft('#fff6ea', 0.2), tag)
    star_mark(w * 0.7, (0.02 + w / 2, yTop - fh * 0.32, 0.018))
    add(cyl(0.1, 0.13, 0.14, (0, 0.07, 0), K=7), stone_col(STONES[1]), tag)

# ================================================================== Sasanoha Inn (artBamboo.js inn)
def build_inn():
    new_asset('zv-bamboo-inn')
    w, d, h, y0, zc = 3.4, 2.5, 1.52, 0.32, -0.3
    Fz = zc + d / 2; tile = '#565a6a'
    F.push((0, 0, zc))
    foundation(w, d, y0, pad=0.14, seed=7, color=T['stone'])
    walls(dict(w=w, d=d, h=h, y0=y0, plaster=T['plaster'], frame=T['frame'], koshi=T['koshi'], koshiSkip='f'))
    blk = dict(w=w, d=d)
    with on_face(blk, 'f', 0, y0): door_slide(1.0, 1.34, style='lattice', wd=T['deck'], frame=T['frame'])
    for s in (-1, 1):
        with on_face(blk, 'f', s * 1.12, y0 + 0.8): bay_lattice(0.66, 0.52, T['frame'], tile)
    for side in ('l', 'r'):
        with on_face(blk, side, 0, y0 + 0.82): shoji(0.7, 0.5, frame=T['frame'])
    with on_face(blk, 'b', 0, y0 + 0.82): shoji(0.9, 0.5, frame=T['frame'])
    R1 = roof(dict(type='skirt', w=w, d=d, y0=y0 + h, over=0.46, H=0.95, tTop=0.44, color=tile, ribW=0.24, curve=0.34, lift=0.18, liftW=0.6,
                   thick=0.13, ribAmp=0.035, course=0.3, courseAmp=0.025, pastel=0.1, rich=1, seed=31))
    uw, ud, uh, uy = min(2.6, R1['openW'] - 0.12), min(1.8, R1['openD'] - 0.1), 1.1, R1['topY']
    walls(dict(w=uw, d=ud, h=uh, y0=uy, plaster=T['plaster'], frame=T['frame'], rail=True, sill=True))
    ub = dict(w=uw, d=ud)
    for u in (-0.75, 0.0, 0.75):
        with on_face(ub, 'f', u, uy + 0.56):
            shoji(0.6, 0.5, frame=T['frame'])
            if u == 0: sudare(0.58, 0.2, 0.28, z=0.1)
    for side in ('l', 'r'):
        with on_face(ub, side, 0, uy + 0.58): round_window(0.22, frame=T['frame'])
    rz = ud / 2 + 0.2
    for i in range(9): add(box(0.04, 0.32, 0.04, (-uw / 2 + i * uw / 8, uy + 0.16, rz), r=0.0), wood(T['frame']), 'balcony')
    add(beam(uw + 0.08, 0.06, 0.07, (0, uy + 0.33, rz), c=0.016), wood(T['frame']), 'balcony')
    add(beam(uw + 0.06, 0.05, 0.25, (0, uy + 0.02, ud / 2 + 0.12), c=0.012), wood(T['deck']), 'balcony')
    R2 = thatch(dict(type='irimoya', w=uw, d=ud, y0=uy + uh, over=0.5, H=1.3, tg=0.6, lip=0.28, seed=37, moss=0.3, step=0.2))
    F.pop()
    # the hanging sign by the door: the futon emblem (rooms for the night) on both faces
    with at((w / 2 - 0.15, y0 + 1.32, Fz + 0.02)):
        add(box(0.045, 0.045, 0.5, (0, 0, 0.24), r=0.0), wood(T['frame']), 'sign')
        with at((0, -0.28, 0.42), ry=PI / 2):
            add(box(0.48, 0.42, 0.04, (0, 0, 0), r=0.015), wood(T['frame']), 'sign')
            add(box(0.42, 0.36, 0.06, (0, 0, 0), r=0.018), soft('#f6ead2', 0.15), 'sign')
            for sd in (0, PI):
                with at((0, 0, 0), ry=sd): futon_mark(0.34, (0, 0.02, 0.03), depth=0.016)
            for sx in (-1, 1): add(box(0.015, 0.1, 0.015, (sx * 0.16, 0.25, 0), r=0.0), flat('#4f4a58'), 'sign')
    with at((-2.05, 0, -0.6), ry=PI / 2): wood_stack(0.8, 0.5, 0.36, roofed=True, seed=9)
    with at((2.05, 0, -0.9)): barrel(0.17, 0.38)
    with layer('siege'):
        with at((0, y0 + 0.67, Fz)): boards(1.05, 1.36, seed=5)
        for s in (-1, 1):
            with at((s * 1.12, y0 + 0.8, Fz + 0.12)): boards(0.74, 0.6, seed=6 + (s > 0))
        for u in (-0.75, 0.75):
            with at((u, R1['topY'] + 0.56, zc + ud / 2)): boards(0.66, 0.56, seed=9 + (u > 0))
        with at((-1.45, y0, Fz + 0.01)): soot(0.6, 1.2, seed=7)
        with at((1.7, 0, Fz + 1.4)): debris(0.8, seed=23, n=4)
    with layer('saved'):
        with at((0, y0, Fz)): noren_b(0.96, 0.5, 1.32, 0.16, '#2f4a7a', 2, 'futon')
        for x, c in ((-0.7, '#ff9ec0'), (0.15, '#8fd0ff'), (0.85, '#fff0b0')):
            with at((x, R1['topY'] + 0.36, zc + rz)): futon_rail(0.56, c)
        with at((1.25, 0, Fz + 1.0), ry=PI): tea_bench(1.0, '#d84848')
        with at((1.95, 0, Fz + 1.25)): parasol(0.75, 1.75, '#d84848', tag='parasol')
        for s in (-1, 1):
            with at((s * 2.0, 0, Fz + 0.6)): pot_flowers(0.15, 0.21, ('#ff8fb0', '#fff6ea', '#ffd24a'), 'pots')
    info = dict(fp=[-w / 2 - 0.1, zc - d / 2 - 0.1, w / 2 + 0.1, Fz + 0.12], door=[0, Fz + 0.9],
                lamps=[[-0.72, round(y0 + h - 0.04, 3), round(Fz + 0.36, 3)], [0.72, round(y0 + h - 0.04, 3), round(Fz + 0.36, 3)]], ridgeY=round(R2['ridgeY'], 3))
    return A, info

# ================================================================== Kaze Ninja Dojo (artBamboo.js dojo)
def build_dojo():
    new_asset('zv-bamboo-dojo')
    PAL.update(dict(wall='#f6f0e6', wallLo='#e6dccc', frame='#3e3028'))
    w, d, h, y0, zc = 4.0, 2.9, 1.72, 0.52, -0.35
    Fz = zc + d / 2; fr = '#3e3028'
    F.push((0, 0, zc))
    foundation(w, d, y0, pad=0.14, seed=11, color='#9a9088')
    walls(dict(w=w, d=d, h=h, y0=y0, plaster='#f6f0e6', frame=fr, koshi='#4a3a30', koshiSkip='f'))
    blk = dict(w=w, d=d)
    with on_face(blk, 'f', 0, y0):
        add(box(w - 0.3, h - 0.16, 0.04, (0, (h - 0.16) / 2 + 0.02, 0.02), r=0.0), lambda p, n: mix('#34282a', '#4a3a34', clamp(p.z - 1.0)), 'hall')
        add(box(w - 0.3, 0.05, 0.32, (0, 0.025, 0.16), r=0.0), wood('#b8946a'), 'hall')
        for x in (-(w / 2 - 0.1), -0.66, 0.66, w / 2 - 0.1): add(beam(0.14, h, 0.14, (x, h / 2, 0.08), c=0.03), wood(fr, ao_z=0.0), 'timber')
        add(beam(w + 0.08, 0.19, 0.16, (0, h - 0.06, 0.09), c=0.03), wood(fr), 'timber')
        add(box(0.42, 0.92, 0.025, (0, 0.86, 0.045), r=0.0), soft('#f4ecd8', 0.15), 'hall')
        add(cyl(0.022, 0.022, 0.52, (0, 1.33, 0.06), K=5, rz=PI / 2), wood('#5a4434'), 'hall')
        add(cyl(0.022, 0.022, 0.48, (0, 0.39, 0.06), K=5, rz=PI / 2), wood('#5a4434'), 'hall')
        shuriken_mark(0.3, (0, 0.9, 0.06), depth=0.02)
        for i in range(4): add(cyl(0.022, 0.022, 1.2, (-1.3 + i * 0.12, 0.62, 0.1), K=5, rz=0.12), wood('#a8845e'), 'hall')
        add(beam(0.62, 0.06, 0.08, (-1.15, 0.9, 0.12), c=0.012), wood('#5a4434'), 'hall')
        Mf = F.m.copy()
        def dc(p, n, Mf=Mf):
            ln = (Mf.to_3x3().inverted() @ n)
            if abs(ln.z) > 0.75 * ln.length: return '#efe2c8'
            return mix('#8a2a20', '#c84a38', clamp(n.z * 0.5 + 0.5))
        add(glathe([(0.0, -0.16), (0.2, -0.16), (0.23, -0.12), (0.25, 0.0), (0.23, 0.12), (0.2, 0.16), (0.0, 0.16)], 12, pos=(1.25, 0.5, 0.17), rx=PI / 2), dc, 'hall')
        add(beam(0.5, 0.05, 0.05, (1.25, 0.25, 0.17), c=0.01), wood('#5a4434'), 'hall')
    for side in ('l', 'r'):
        with on_face(blk, side, 0, y0 + 0.9): lattice_window(0.9, 0.5, frame=fr)
    with on_face(blk, 'b', 0, y0 + 0.9): lattice_window(1.2, 0.5, frame=fr)
    R = roof(dict(type='irimoya', w=w, d=d, y0=y0 + h, over=0.62, gOver=0.3, H=1.62, tg=0.52, curve=0.42, lift=0.3, liftW=0.9, thick=0.17,
                  ribW=0.28, ribAmp=0.04, course=0.32, courseAmp=0.03, color='#4c4c5a', pastel=0.1, gable='plaster', gableColor='#f6f0e6',
                  timber=fr, rich=2, oni=True, seed=41, hipCut=0.045))
    with at((0, 0, d / 2 + 0.64)): steps(1.5, 3, y0 / 3, 0.22, '#b8ae9e')
    F.pop()
    # the kanban beside the steps: a tall plank on posts, a shuriken and two leaves (no words)
    with at((-1.55, 0, Fz + 0.82)):
        for sx in (-1, 1): add(beam(0.08, 1.55, 0.08, (sx * 0.2, 0.78, 0), c=0.018), wood(fr, ao_z=0.0), 'kanban')
        add(box(0.44, 1.12, 0.035, (0, 0.95, 0.0), r=0.015), wood(fr), 'kanban')
        add(box(0.37, 1.05, 0.05, (0, 0.95, 0.03), r=0.018), soft('#e8d8b8', 0.15), 'kanban')
        add(box(0.52, 0.07, 0.17, (0, 1.58, 0.02), r=0.025), wood(fr), 'kanban')
        shuriken_mark(0.26, (0, 1.25, 0.056), depth=0.018)
        for y in (0.82, 0.6): leaf_mark(0.18, (0, y, 0.056), depth=0.014, col='#3a5a3a')
    for x, z in ((-2.7, 0.6), (-2.85, -0.45)):
        with at((x, 0, z)): makiwara()
    with at((-2.9, 0, 1.6), ry=0.5):
        for sx in (-1, 1): add(beam(0.06, 1.0, 0.06, (sx * 0.25, 0.5, -0.1), c=0.012, rz=sx * 0.12), wood('#6a4a36', ao_z=0.0), 'target')
        with at((0, 0.78, 0), rx=-0.15):
            M = F.m.copy()
            def tc(p, n, M=M):
                q = GMi @ (M.inverted() @ p); r = math.hypot(q.x, q.y)
                ln = M.to_3x3().inverted() @ n
                if abs(ln.z) < 0.6 * ln.length: return '#d8c088'
                return '#d84a3a' if r < 0.1 or r > 0.21 else '#f4ecd8'
            add(glathe([(0.0, -0.04), (0.32, -0.04), (0.32, 0.04), (0.0, 0.04)], 16, rx=PI / 2), tc, 'target')
            for x, y in ((0.08, 0.08), (-0.12, -0.06), (0.15, -0.12)): shuriken_mark(0.12, (x, y, 0.045), depth=0.014, col='#4a4656')
    with layer('siege'):
        with at((0, y0, Fz + 0.16)):
            for i in range(9):
                add(beam((w - 0.4) / 9 - 0.02, h - 0.2, 0.05, (-(w - 0.4) / 2 + (i + 0.5) * (w - 0.4) / 9, (h - 0.2) / 2, 0), c=0.012), wood(['#6a5040', '#5e4838', '#745646'][i % 3]), 'shutters')
            for x in (-1.2, 1.2):
                with at((x, h * 0.48, 0)): boards(1.0, 1.1, seed=17 + (x > 0))
        with at((-2.5, 0, 1.05)): war_banner(2.4, 0.55, seed=41)
        with at((1.9, 0, Fz + 1.3)): debris(0.7, seed=43, n=4)
    with layer('saved'):
        with at((1.6, 0, Fz + 0.95)): nobori_star(2.5, 0.42, '#34405e')
        with at((-1.0, y0, Fz + 0.25)): cushion('#34405e', 0.34)
    info = dict(fp=[-w / 2 - 0.1, zc - d / 2 - 0.1, w / 2 + 0.1, Fz + 0.2], door=[0, Fz + 1.25],
                lamps=[[-1.05, round(y0 + h, 3), round(Fz + 0.58, 3)], [1.05, round(y0 + h, 3), round(Fz + 0.58, 3)]], ridgeY=round(R['ridgeY'], 3))
    return A, info

# ================================================================== the Bamboo Craftshop (artBamboo.js craft)
def build_craft():
    new_asset('zv-bamboo-craft')
    w, d, h, zc, y0 = 3.7, 2.4, 1.72, -0.3, 0.16
    Fz = zc + d / 2
    F.push((0, 0, zc))
    foundation(w, d, y0, pad=0.1, seed=13, color=T['stone'])
    for i in range(9):
        add(box(w - 0.04, 0.04, d / 9 - 0.016, (0, y0 + 0.02, -d / 2 + (i + 0.5) * d / 9), r=0.0), wood('#b08a62' if i % 3 == 1 else '#c09a6e' if i % 2 else '#b8946a', seed=i), 'floor')
    add(box(w, h, 0.1, (0, y0 + h / 2, -d / 2 + 0.05), r=0.02), wood('#8a6a4e', ao_z=y0), 'walls')
    for i in range(1, 12): add(box(0.03, h - 0.06, 0.02, (-w / 2 + i * w / 12, y0 + h / 2, -d / 2 + 0.11), r=0.0), flat('#6a4e3a'), 'walls')
    for sx in (-1, 1):
        add(box(0.08, h * 0.5, d - 0.1, (sx * (w / 2 - 0.04), y0 + h * 0.25, 0), r=0.02), wood('#8a6a4e', ao_z=y0), 'walls')
        for i in range(7):
            z = -d / 2 + 0.2 + i * (d - 0.4) / 6
            bpole((sx * (w / 2 - 0.04), y0 + h * 0.5, z), (sx * (w / 2 - 0.04), y0 + h - 0.02, z), 0.026, nodes=False, tag='lattice')
        for y in (y0 + h * 0.5, y0 + h * 0.78):
            bpole((sx * (w / 2 - 0.04), y, -d / 2 + 0.1), (sx * (w / 2 - 0.04), y, d / 2 - 0.1), 0.024, col=T['bambooDark'], tag='lattice')
    for x, z in ((-w / 2, d / 2), (w / 2, d / 2), (-w / 2, -d / 2), (w / 2, -d / 2)):
        add(cyl(0.08, 0.09, h + 0.1, (x, y0 + (h + 0.1) / 2, z), K=8), wood(T['frame'], ao_z=0.0), 'timber')
    add(beam(w + 0.14, 0.15, 0.14, (0, y0 + h + 0.04, d / 2), c=0.03), wood(T['frame']), 'timber')
    add(beam(w + 0.14, 0.12, 0.12, (0, y0 + h + 0.04, -d / 2 + 0.05), c=0.03), wood(T['frame']), 'timber')
    R = thatch(dict(type='hip', w=w, d=d, y0=y0 + h + 0.12, over=0.5, H=1.15, lip=0.28, hip=0.6, moss=0.5, seed=43))
    # inside: the workbench, a half-woven basket, a knife; poles leaning on the back wall; drying strips on a pole
    add(beam(1.7, 0.08, 0.6, (-0.45, y0 + 0.74, -d / 2 + 0.55), c=0.02), wood('#c99f6e'), 'bench')
    for x, z in ((-1.2, -0.22), (0.3, -0.22), (-1.2, 0.22), (0.3, 0.22)): add(beam(0.07, 0.72, 0.07, (x, y0 + 0.37, -d / 2 + 0.55 + z), c=0.014), wood('#6a4e3a'), 'bench')
    with at((-0.75, y0 + 0.78, -d / 2 + 0.52)):
        basket(0.2, 0.18)
        for k in range(7):
            a = k * 0.9
            add(gtube([(0.18 * math.cos(a), 0.17, 0.18 * math.sin(a)), (0.26 * math.cos(a), 0.34, 0.26 * math.sin(a)), (0.28 * math.cos(a + 0.2), 0.48, 0.28 * math.sin(a + 0.2))], 0.012, K=3), soft('#d8c890', 0.2), 'bench')
    with at((0.05, y0 + 0.78, -d / 2 + 0.6)):
        add(box(0.3, 0.025, 0.07, (0, 0.012, 0), r=0.0), soft('#e8d8a8', 0.2), 'bench')
        add(beam(0.13, 0.04, 0.05, (-0.21, 0.02, 0), c=0.01), wood('#5a4434'), 'bench')
    for i in range(8):
        x = 0.78 + i * 0.12
        bpole((x, y0, -d / 2 + 0.17), (x + 0.06, y0 + 2.0 - (i % 3) * 0.12, -d / 2 + 0.33), 0.036, col=(T['bambooDark'] if i % 3 == 1 else '#c8c070' if i % 3 else T['bamboo']), tag='poles')
    for k in range(7): add(box(0.04, 0.64, 0.015, (-1.25 + k * 0.11, y0 + 1.18, -0.05), r=0.0), soft('#dcd490', 0.2), 'strips')
    bpole((-1.5, y0 + 1.52, -0.05), (-0.4, y0 + 1.52, -0.05), 0.022, col=T['frame'], nodes=False, tag='strips')
    F.pop()
    # the shop front: bamboo bundles roped to the front posts, a tiered basket stand, a trestle of poles, the chopping block, the sign
    for sx in (-1, 1):
        for i in range(5):
            x = sx * (w / 2 + 0.18) + (i - 2) * 0.075; z = Fz + 0.12 + (i % 2) * 0.06
            bpole((x, 0, z), (x - sx * 0.12, 2.0 + (i % 3) * 0.12, z - 0.12), 0.036, col=('#b8c070' if i % 2 else T['bamboo']), tag='bundles')
        add(gloop([(sx * (w / 2 + 0.16) + 0.22 * math.cos(TAU * k / 10), 1.0, Fz + 0.1 + 0.12 * math.sin(TAU * k / 10)) for k in range(10)], 0.028, K=4), soft(T['rope'], 0.25), 'bundles')
    with at((0.9, 0, Fz + 0.95), ry=-0.25):
        for y, dz in ((0, 0), (0.36, -0.2), (0.72, -0.4)): add(beam(1.2, 0.06, 0.3, (0, y + 0.3, dz), c=0.014), wood('#a8845e'), 'stand')
        for sx in (-1, 1): add(beam(0.06, 1.15, 0.06, (sx * 0.56, 0.52, -0.18), c=0.012, rx=0.5), wood('#6a4e3a', ao_z=0.0), 'stand')
        for x, y, dz, r in ((-0.35, 0.33, 0, 0.15), (0.05, 0.33, 0, 0.13), (0.4, 0.33, 0, 0.14), (-0.2, 0.69, -0.2, 0.12), (0.25, 0.69, -0.2, 0.13), (0, 1.05, -0.4, 0.11)):
            with at((x, y, dz)): basket(r, r * 1.1)
    with at((2.45, 0, -0.1), ry=PI / 2):
        for sd in (-1, 1):
            for k in (-1, 1): add(beam(0.06, 0.68, 0.06, (sd * 0.7 + k * 0.1, 0.31, 0), c=0.012, rz=k * 0.32), wood('#6a4e3a', ao_z=0.0), 'trestle')
        for i in range(6): bpole((-1.25, 0.62 + (i % 2) * 0.06, -0.15 + i * 0.06), (1.25, 0.62 + (i % 2) * 0.06, -0.15 + i * 0.06), 0.036, col=(T['bamboo'] if i % 2 else '#c8c070'), tag='trestle')
    with at((1.75, 0, Fz + 2.0)): chopping_block()
    with at((-w / 2 - 0.1, 1.5, Fz - 0.2), ry=-PI / 2):
        add(box(0.045, 0.045, 0.42, (0, 0, 0.2), r=0.0), wood(T['frame']), 'sign')
        with at((0, -0.26, 0.34), ry=PI / 2):
            add(box(0.48, 0.42, 0.04, (0, 0, 0), r=0.015), wood(T['frame']), 'sign')
            add(box(0.42, 0.36, 0.06, (0, 0, 0), r=0.018), soft('#f0dcb4', 0.15), 'sign')
            for sd in (0, PI):
                with at((0, 0, 0), ry=sd): basket_mark(0.3, (0, -0.01, 0.03), depth=0.016)
            for sx in (-1, 1): add(box(0.015, 0.08, 0.015, (sx * 0.16, 0.24, 0), r=0.0), flat('#4f4a58'), 'sign')
    with layer('siege'):
        with at((0, 0, Fz + 0.5)): debris(1.2, seed=51, n=8)
        for i in range(5):
            with at((-0.6 + i * 0.3, 0.05, Fz + 0.9), ry=i * 0.7 + 0.3):
                bpole((-0.55, 0, 0), (0.5, 0.02, (i - 2) * 0.1), 0.035, col=(T['bamboo'] if i % 2 else '#c8c070'), tag='broken')
        for x, z, r in ((0.5, Fz + 1.2, 0.14), (1.1, Fz + 0.7, 0.12), (-0.9, Fz + 1.4, 0.13)):
            with at((x, r * 0.95, z), ry=x * 3, rz=PI / 2):
                with at((0, -r * 0.55, 0)): basket(r, r * 1.1)
        with at((w / 2 + 0.3, 0, Fz + 0.3)): war_banner(2.3, 0.5, seed=52)
    with layer('saved'):
        for i in range(4):
            with at((-1.3 + i * 0.85, 1.72, Fz + 0.05)):
                if i % 2:
                    add(box(0.015, 0.1, 0.015, (0, -0.05, 0), r=0.0), flat(PAL['ink']), 'wares')
                    with at((0, -0.27, 0)): basket(0.12, 0.17)
                else: lit_lantern(0.1, 0.26, '#f0d890', 0.08)
        with at((-1.1, 0, Fz + 1.0), ry=0.3):
            basket(0.22, 0.3)
            for k in range(5):
                add(glathe([(0.0, 0.0), (0.04, 0.0), (0.0, 0.18)], 6, pos=((k - 2) * 0.07, 0.29, (k % 2) * 0.05)),
                    lambda p, n: mix(mul('#b8c870', 0.82), mix('#b8c870', '#fff0c0', 0.25), clamp(n.z * 0.5 + 0.5)), 'shoots')
    info = dict(fp=[-w / 2 - 0.15, zc - d / 2 - 0.12, w / 2 + 0.15, zc + 0.1], door=[0, Fz + 0.75],
                lamps=[[-1.1, round(y0 + h, 3), round(Fz + 0.3, 3)], [1.1, round(y0 + h, 3), round(Fz + 0.3, 3)]], ridgeY=round(R['ridgeY'], 3))
    return A, info

# ================================================================== the village gate (artBamboo.js gate, w 3.6 as decor places it)
def build_gate():
    new_asset('zv-bamboo-gate')
    w, h = 3.6, 2.35
    for s in (-1, 1):
        pebble((s * w / 2, -0.06, 0), 0.26, sq=1.0, seed=60 + s, col=STONES[2], tag='bases', K=8)
        add(cyl(0.1, 0.115, h, (s * w / 2, h / 2, 0), K=9), wood(T['frame'], ao_z=0.18), 'posts')
        add(beam(0.07, 0.86, 0.07, (s * w / 2, 0.38, -0.22), c=0.016, rx=0.5), wood(T['frame']), 'posts')
        add(gloop([(s * w / 2 + 0.13 * math.cos(TAU * k / 8), h - 0.62, 0.13 * math.sin(TAU * k / 8)) for k in range(8)], 0.022, K=4), soft(T['rope'], 0.25), 'posts')
    add(beam(w + 0.7, 0.17, 0.17, (0, h - 0.1, 0), c=0.03), wood(T['frame']), 'beam')
    add(beam(w + 0.3, 0.11, 0.11, (0, h - 0.55, 0), c=0.022), wood(T['frame']), 'beam')
    thatch(dict(type='gable', w=w + 0.5, d=0.22, y0=h + 0.02, over=0.2, H=0.34, lip=0.16, tiers=2, seed=53, moss=0.25, step=0.3, boards=False, ridge_rr=0.075, chigi=False, rope_step=1.6))
    with at((0, h - 0.33, 0.1)):
        add(box(0.98, 0.42, 0.04, (0, 0, -0.01), r=0.015), wood(T['frame']), 'sign')
        add(box(0.9, 0.34, 0.06, (0, 0, 0.012), r=0.018), soft('#f0dcb4', 0.15), 'sign')
        for k in (-1, 1): bamboo_mark(0.24, (k * 0.25, 0, 0.04), depth=0.018, col='#4a7a3a')
        add(glathe([(0.0, 0.0), (0.065, 0.0), (0.065, 0.02), (0.0, 0.02)], 10, rx=PI / 2, pos=(0, 0, 0.04)), lac('#c8503a'), 'sign')
    return A, dict(posts=[[-w / 2, 0], [w / 2, 0]], h=h)

# ================================================================== a lantern post (artBamboo.js lanternPost; hook [0.4, 1.8, 0])
def build_lanternPost():
    new_asset('zv-bamboo-lanternPost')
    pebble((0, -0.06, 0), 0.24, sq=0.85, seed=70, col=STONES[0], tag='base', K=9)
    add(blob(F.W((0.0, 0.12, 0.0)), 0.16, 0.06, lobes=5, K=12, seed=3, amp=0.28), lambda p, n: mix('#6f9448', '#a8c870', clamp(n.z)), 'base')
    bpole((0, 0.0, 0), (0, 2.0, 0), 0.058, nodes=True, K=8, tag='pole', rings=True)
    # a little straw hat on the cut top, a dark knob
    add(glathe([(0.0, 1.98), (0.17, 1.99), (0.19, 2.02), (0.1, 2.12), (0.0, 2.16)], 10,
               rfn=lambda rr, z, th: rr * (1 + 0.04 * math.sin(th * 7))), lambda p, n: mix(T['thatchDeep'], T['thatchEdge'], clamp(n.z * 0.7 + 0.2)), 'hat')
    add(sph(0.035, (0, 2.17, 0), K=6, J=3), lac(T['ridgeDark'], '#7a6050'), 'hat')
    # the arm and its brace, lashed with rope
    bpole((-0.02, 1.74, 0), (0.46, 1.84, 0), 0.034, nodes=False, K=6, tag='arm')
    bpole((0.0, 1.42, 0), (0.24, 1.78, 0), 0.022, nodes=False, K=5, tag='arm')
    for y in (1.7, 1.78): add(gloop([(0.068 * math.cos(TAU * k / 8), y, 0.068 * math.sin(TAU * k / 8)) for k in range(8)], 0.016, K=3), soft(T['rope'], 0.25), 'arm')
    add(gloop([(0.068 * math.cos(TAU * k / 8), 1.44, 0.068 * math.sin(TAU * k / 8)) for k in range(8)], 0.014, K=3), soft(T['rope'], 0.25), 'arm')
    # a paper charm tied under the arm (no writing)
    add(box(0.012, 0.1, 0.012, (0.3, 1.76, 0), r=0.0), flat(T['rope']), 'charm')
    add(box(0.07, 0.16, 0.012, (0.3, 1.64, 0), r=0.0), soft('#fff4e0', 0.2), 'charm')
    add(box(0.07, 0.025, 0.014, (0.3, 1.69, 0), r=0.0), flat('#c8503a'), 'charm')
    # the iron hook where the game hangs the lantern (hook point [0.4, 1.8, 0])
    add(box(0.022, 0.06, 0.022, (0.4, 1.83, 0), r=0.0), flat('#4f4a58'), 'hook')
    add(gloop([(0.4 + 0.024 * math.cos(TAU * k / 6), 1.8 + 0.024 * math.sin(TAU * k / 6), 0) for k in range(6)], 0.009, K=3, up=F.N((0, 0, 1))), flat('#4f4a58'), 'hook')
    return A, dict(hook=[0.4, 1.8, 0])

# ================================================================== finishing and export
def export_piece(A, name):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mats = {}
    mt = bpy.data.materials.new('body'); mt.use_nodes = True; nt = mt.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Roughness'].default_value = 0.8; bsdf.inputs['Metallic'].default_value = 0.0
    vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'; nt.links.new(vc.outputs['Color'], bsdf.inputs['Base Color'])
    mats['body'] = mt
    mg = bpy.data.materials.new('window_glow'); mg.use_nodes = True; nt = mg.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Roughness'].default_value = 0.8
    vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'; nt.links.new(vc.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Emission Color'].default_value = lin('#ffd890'); bsdf.inputs['Emission Strength'].default_value = 1.0
    mats['window_glow'] = mg
    obs = [to_object(k, o, mats) for k, o in A.objs.items()]
    lo = Vector((1e9,) * 3); hi = Vector((-1e9,) * 3)
    for k, o in A.objs.items():
        if k in ('saved', 'siege'): continue
        for v in o['v']: lo = Vector(map(min, lo, v)); hi = Vector(map(max, hi, v))
    print('ZV %s tris %d %s' % (name, A.tris(), {k: A.tris(k) for k in A.objs}))
    print('ZV %s parts %s' % (name, dict(sorted(A.count.items(), key=lambda kv: -kv[1]))))
    print('ZV %s bounds game x %.3f..%.3f y %.3f..%.3f z %.3f..%.3f' % (name, lo.x, hi.x, lo.z, hi.z, -hi.y, -lo.y))
    for ob in obs: print('ZV %s check %s %s' % (name, ob.name, check(ob)))
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, name + '.blend'))
    for o in bpy.context.scene.objects: o.select_set(o.type == 'MESH')
    out = os.path.join(MODELS, name + '.glb')
    kw = dict(filepath=out, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
              export_attributes=True, export_lights=False, export_cameras=False, export_animations=False,
              export_normals=True, export_texcoords=False, export_materials='EXPORT')
    try: bpy.ops.export_scene.gltf(export_vertex_color='ACTIVE', **kw)
    except TypeError as e:
        print('ZV export_vertex_color rejected:', e); bpy.ops.export_scene.gltf(export_colors=True, **kw)
    print('ZV wrote', out)

PIECES = {'elder': build_elder, 'shop': build_shop, 'inn': build_inn, 'dojo': build_dojo, 'craft': build_craft, 'gate': build_gate, 'lanternPost': build_lanternPost}
for name in (list(PIECES) if PIECE == 'all' else PIECE.split(',')):
    asset, info = PIECES[name]()
    finish(asset, seed={'elder': 5, 'shop': 9, 'inn': 13, 'dojo': 17, 'craft': 19, 'gate': 23, 'lanternPost': 29}[name], amt=0.015 if name in ('gate', 'lanternPost') else 0.03)
    print('ZV %s info %s' % (name, info))
    export_piece(asset, 'zv-bamboo-' + name)
