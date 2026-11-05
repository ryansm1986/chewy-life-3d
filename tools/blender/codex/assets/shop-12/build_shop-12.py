# PAWHAVEN: Blossom Hollow's market shops, levels 1 and 2, one model per seeded variant (task shop-12).
#   blender --background --factory-startup --python build_shop-12.py -- --piece <level>:<variant>|<level>|all
# Writes public/models/shop-<level>-v<k>.glb (k = 0..7) and shop-<level>-v<k>.blend here.
# Each variant rebuilds the kit's design (src/world/buildings/shops.js shopL1 / shopL2) with the same per-variant
# choices: the stall / shop type (variant % 3 at level 1, % 4 at level 2), the roof colour, the wall tint, the roof
# style, the charms. Footprint, door, light, window and chimney positions follow the kit exactly (same frames, the kit's
# Builder yaw wobble and its hand-made warp with the kit's own seed).
# Deterministic: seeded PRNGs only. The mesh / paint / roof kit is lh_kit.py (a copy of the Blossom Hollow landmarks'
# kit, tools/blender/codex/assets/landmarks-hollow), exec'd into this module. Layout code is in the kit's game frame
# (x right, y up, z toward the front) and mapped to Blender (x, -z, y).
import os, sys, math, random
_HERE = os.path.dirname(os.path.abspath(__file__))
exec(compile(open(os.path.join(_HERE, 'lh_kit.py'), encoding='utf-8').read(), os.path.join(_HERE, 'lh_kit.py'), 'exec'))
print('SHOP build pid', os.getpid())
BEND_Q = (1.0, 0.5)   # (the curved roofs' underside: two samples are enough at these sizes, chord sag < 3 cm vs 10-15 cm slabs)

# ================================================================== kit tables (src/world/buildings/kit.js, shops.js)
C = dict(woodDark='#6b4a3a', timber='#8f6a52', woodMid='#9c7458', woodLight='#c98f5e', woodPale='#e2b988',
         red='#e8503a', vermilion='#e2573a', gold='#f4c04a', indigo='#2f4a7a', pink='#ff8fb0', ink='#3a2a30',
         white='#fffaf2', cream='#fff6e8', iron='#4a4650', terracotta='#d4774e', bronze='#b58a4a', soil='#8a5e44')
ROOFS = dict(slate='#5d6f9e', teal='#3f8f8a', terracotta='#d86a4a', moss='#6e9a5a', plum='#8a5a8a')
WALL_TINTS = ['#fff3e0', '#fff0e4', '#fdf2ea', '#f6f1ff', '#fff7e6', '#f1f7ea', '#ffece6']
FLOWERS = ['#ff8fb0', '#ffd24a', '#ffffff', '#c8a8ff', '#ff6f7f', '#ffb86a', '#8fc8ff']
STALLS = [dict(name='tea', sym='teacup', noren='#4f8a5a', roof=ROOFS['moss']),
          dict(name='onigiri', sym='onigiri', noren='#f4efe6', symCol='#2a3a30', roof=ROOFS['slate']),
          dict(name='taiyaki', sym='taiyaki', noren=C['indigo'], roof=ROOFS['terracotta'])]
SHOPS2 = [dict(name='bakery', sym='bread', noren='#b0603a', roof=ROOFS['terracotta'], wall='#fff3e0'),
          dict(name='cafe', sym='teacup', noren='#4a6a8a', roof=ROOFS['teal'], wall='#f6f1ff'),
          dict(name='flower', sym='flower', noren='#5a9a5a', roof=ROOFS['moss'], wall='#fff0e8'),
          dict(name='toy', sym='toy', noren='#c84a6a', roof=ROOFS['plum'], wall='#fff7e6')]

# the kit Builder's per-variant seed (index.js getTemplate: hashStr(id) + level * 977 + variant * 7919) and its first
# draw, B.wob(0.04), the level-1 cart's yaw (kitdump/yaw.mjs)
def _hash_str(s):
    h = 2166136261
    for ch in s:
        h ^= ord(ch); h = (h * 16777619) & 0xffffffff
    return h
def kit_seed(L, v): return (_hash_str('shop') + L * 977 + v * 7919) & 0xffffffff
def _mulberry(a):
    def imul(x, y): return ((x & 0xffffffff) * (y & 0xffffffff)) & 0xffffffff
    st = [a & 0xffffffff]
    def r():
        st[0] = (st[0] + 0x6D2B79F5) & 0xffffffff; a_ = st[0]
        t = imul(a_ ^ (a_ >> 15), 1 | a_)
        t = ((t + imul(t ^ (t >> 7), 61 | t)) & 0xffffffff) ^ t
        return ((t ^ (t >> 14)) & 0xffffffff) / 4294967296
    return r
def kit_wob(L, v, a=0.04):
    # (JS: ((seed + 1) * 2654435761) >>> 0 multiplies in doubles: the product is rounded to 53 bits before the wrap)
    r = _mulberry(int(float((kit_seed(L, v) + 1) * 2654435761)) % 4294967296); return (r() - 0.5) * 2 * a

# ================================================================== small helpers
def loc():
    """colour fns: Blender world point -> the current game-local frame"""
    Mi = F.m.inverted(); return lambda p: GMi @ (Mi @ p)
def ell_pts(cx, cy, rx, ry, n=14, rot=0.0, a0=0.0, a1=TAU, closed=True):
    m = n if closed else n + 1
    out = []
    for k in range(m):
        a = a0 + (a1 - a0) * k / n
        x, y = rx * math.cos(a), ry * math.sin(a)
        out.append((cx + x * math.cos(rot) - y * math.sin(rot), cy + x * math.sin(rot) + y * math.cos(rot)))
    return out
def star_pts(r0, r1, n=5, ox=0.0, oy=0.0):
    return [(ox + math.cos(PI / 2 + i * PI / n) * (r1 if i % 2 else r0), oy + math.sin(PI / 2 + i * PI / n) * (r1 if i % 2 else r0)) for i in range(n * 2)]
def relief(c):
    return lambda p, n: mix(mul(c, 0.84), mix(c, '#fff6ea', 0.22), clamp(-n.y * 0.5 + n.z * 0.45 + 0.35))

# ================================================================== emblems (symbols.js, in relief; face frame, z out)
def _layers(name, n=14):
    """symbols.js layers as (polys | ('loop', cx, cy, r, tube), colour, z-offset) in unit size"""
    if name == 'teacup':
        cup = [(0.3 * math.cos(a), 0.12 - 0.38 * math.sin(a)) for a in [PI * k / (n - 4) for k in range(n - 3)]]
        return [([cup, ('loop', 0.31, -0.02, 0.09, 0.03)], '#fff6ea', 0.0),
                ([ell_pts(0, -0.3, 0.36, 0.06, n)], '#9ad0e8', -0.004),
                ([ell_pts(0, 0.1, 0.25, 0.045, n)], '#8fc070', 0.6)] +                ([([ell_pts(-0.08, 0.3, 0.045, 0.085, 8), ell_pts(0.08, 0.37, 0.045, 0.085, 8)], '#fff6f0', 0.0)] if n >= 12 else [])
    if name == 'onigiri':
        tri = [(0.0, 0.38), (0.09, 0.33), (0.26, 0.06), (0.38, -0.17), (0.37, -0.29), (0.28, -0.34), (0.0, -0.345),
               (-0.28, -0.34), (-0.37, -0.29), (-0.38, -0.17), (-0.26, 0.06), (-0.09, 0.33)]
        return [([tri], '#fffaf2', 0.0), ([[(-0.15, -0.36), (0.15, -0.36), (0.15, -0.07), (-0.15, -0.07)]], '#2a3a30', 0.5)]
    if name == 'taiyaki':
        return [([ell_pts(-0.05, 0.0, 0.3, 0.2, n + 2), [(0.14, 0.0), (0.42, 0.2), (0.4, 0.0), (0.42, -0.2)]], '#e8a050', 0.0),
                ([ell_pts(0.02, -0.03, 0.12, 0.075, max(6, n - 4))], '#f4c078', 0.55),
                ([ell_pts(-0.2, 0.05, 0.045, 0.045, 8)], '#4a2c2a', 0.6)]
    if name == 'bread':
        dome = [(0.42, -0.18)] + [(0.43 * math.cos(a), -0.18 + 0.42 * math.sin(a)) for a in [PI * k / (n - 4) for k in range(1, n - 4)]] + [(-0.42, -0.18)]
        return [([dome], '#d89050', 0.0),
                ([ell_pts(x, 0.06, 0.05, 0.11, 8, rot=0.5) for x in (-0.18, 0.0, 0.18)], '#f8d8a0', 0.55)]
    if name == 'flower':
        return [([ell_pts(math.cos(PI / 2 + i * TAU / 5) * 0.2, math.sin(PI / 2 + i * TAU / 5) * 0.2, 0.15, 0.12, max(6, n - 4), rot=PI / 2 + i * TAU / 5) for i in range(5)], '#ff9ec0', 0.0),
                ([ell_pts(0, 0, 0.1, 0.1, max(6, n - 4))], '#ffd24a', 0.55)]
    if name == 'toy':
        band = [(x, y) for x, y in [(-0.33, -0.07), (0.33, -0.07), (0.33, 0.07), (-0.33, 0.07)]]
        return [([ell_pts(0, 0, 0.34, 0.34, n + 2)], '#ff6f7f', 0.0), ([band], '#fffaf2', 0.45), ([star_pts(0.15, 0.065)], '#ffd24a', 0.75)]
    if name == 'cake':
        if n >= 12: return 'cake'
        return [([[(-0.36, -0.34), (0.36, -0.34), (0.36, 0.0), (-0.36, 0.0)]], '#fff0d8', 0.0),
                ([[(-0.37, -0.2), (0.37, -0.2), (0.37, -0.12), (-0.37, -0.12)]], '#ff8fb0', 0.5),
                ([ell_pts(0, 0.02, 0.4, 0.1, n)], '#ffb0cc', 0.4),
                ([ell_pts(0, 0.2, 0.1, 0.1, 7)], '#e8323a', 0.6)]
    return [([star_pts(0.42, 0.19)], '#ffd24a', 0.0)]

def emblem(name, s, pos=(0, 0, 0), depth=0.03, mono=None, tag='sign', colors=None):
    """a symbols.js emblem in relief, unit size s, its back at pos (face frame). mono: the first layer only, one colour
    (a print on cloth)."""
    L_ = _layers(name, 12 if s >= 0.4 else 9 if s >= 0.24 else 8)
    with at(pos):
        if L_ == 'cake':
            if mono:
                add(puffy([(x * s, y * s) for x, y in [(-0.36, -0.34), (0.36, -0.34), (0.36, 0.06), (-0.36, 0.06)]], depth, bev=0.008), flat(mono), tag)
                add(sph(0.1 * s, (0, 0.2 * s, depth * 0.5), sc=(1, 1, 0.4), K=6, J=3), flat(mono), tag)
            else: cake_emblem(s, tag)
            return
        for li, (shapes, c, zo) in enumerate(L_):
            if mono and li: break
            c = mono or (colors[li] if colors and li < len(colors) else c)
            col_fn = flat(c) if mono else relief(c)
            z0 = max(0.0, zo) * depth + li * 0.002
            dep = depth * (1.0 if li == 0 else 0.55)
            for sh in shapes:
                if isinstance(sh, tuple):
                    _, cx, cy, r, tb = sh
                    add(gloop(circle(r * s, 10 if s >= 0.3 else 7, z0 + dep * 0.5, cx * s, cy * s), tb * s, K=4, up=F.N((0, 0, 1))), col_fn, tag)
                else:
                    add(puffy([(x * s, y * s) for x, y in sh], dep, bev=min(0.012, dep * 0.4), z0=z0), col_fn, tag)

def sign_board(w, h, sym, color='#fff6e8', frame=None, sym_size=None, tag='sign', sym_colors=None):
    """props.js signboard: a painted board in a timber frame, the emblem on its face (face frame, centred)"""
    signboard_board(w, h, color, frame or C['woodDark'], tag)
    emblem(sym, sym_size or min(w, h) * 0.82, (0, 0, 0.035), depth=0.028, tag=tag, colors=sym_colors)

def aframe(w, h, sym, color='#3a4a44', frame=None, sym_size=0.22, tag='aframe'):
    for s in (-1, 1):
        with at((0, 0, s * 0.12)):
            with at((0, 0.34, 0), ry=0 if s > 0 else PI, rx=-0.28):
                if s > 0: signboard_board(w, h, color, frame or C['woodLight'], tag)
                else: add(box(w + 0.06, h + 0.06, 0.05, (0, 0, -0.01), r=0.0), wood(frame or C['woodLight']), tag)
                if s > 0: emblem(sym, sym_size, (0, 0.02, 0.035), depth=0.024, tag=tag)   # (the street side)
                add(box(w * 0.66, 0.022, 0.01, (0, -h * 0.34, 0.04), r=0.0), flat('#e8e0d0'), tag)

# ================================================================== props (props.js / props2.js / trim.js, chunky)
def cart_wheel(r=0.28, wd='#9c7458', tag='wheel'):
    """props2.js wheel (axis = local z): one round rim tube, its outer half an iron tyre, six spokes, a hub"""
    o = F.W((0, 0, 0)); Mi = F.m.inverted()
    def rc(p, n):
        q = GMi @ (Mi @ p); rr = math.hypot(q.x, q.y)
        return mix(mul(C['iron'], 0.9), '#7a7888', clamp(n.z * 0.5 + 0.3)) if rr > r + 0.004 else wood(wd)(p, n)
    add(gloop(circle(r, 12, 0.0, a0=PI / 12), 0.05, K=5, up=F.N((0, 0, 1))), rc, tag)
    for i in range(6):
        a = i / 6 * TAU + 0.26
        add(beam(0.04, r - 0.06, 0.035, (math.cos(a) * (r / 2 + 0.02), math.sin(a) * (r / 2 + 0.02), 0), c=0.01, rz=a - PI / 2), wood(mul(wd, 1.06)), tag)
    add(glathe([(0.0, -0.08), (0.05, -0.08), (0.075, -0.03), (0.075, 0.03), (0.05, 0.08), (0.0, 0.08)], 8, rx=PI / 2), wood(C['woodDark']), tag)
    add(cyl(0.03, 0.035, 0.03, (0, 0, 0.09), K=6, rx=PI / 2), soft(C['iron'], 0.3), tag)

def sudare_blind(w, y, drop=0.0, color='#dcc088', z=0.08, tag='sudare'):
    """trim.js sudare (face frame): a rolled bamboo blind with red ties, optionally half let down (painted slats)"""
    add(cyl(0.045, 0.045, w + 0.08, (0, y + 0.02, z), K=6, rz=PI / 2), lambda p, n: mix(mul(color, 0.8), mix(color, '#fff4d8', 0.2), clamp(n.z * 0.6 + 0.4)), tag)
    for s in (-1, 1): add(box(0.025, 0.16, 0.02, (s * w * 0.32, y - 0.02, z + 0.045), r=0.0), soft('#c83a3a'), tag)
    if drop > 0:
        lp = loc()
        add(box(w, drop, 0.02, (0, y - drop / 2, z - 0.01), r=0.0, extra=(0, 0, 0)),
            lambda p, n: mul(color, 0.82 + 0.16 * (1 if int((lp(p).y - y) / 0.04) % 2 else 0.55)), tag)
        add(box(w + 0.02, 0.03, 0.03, (0, y - drop, z - 0.008), r=0.0), flat(mul(color, 0.7)), tag)

def fuda_row(w, y, n=5, z=0.012, rail=None, colors=('#f0d8a8',), tag='fuda', seed=0):
    """trim.js fudaRow: menu plaques hung from a rail, each with an ink stroke"""
    rng = random.Random(seed)
    add(box(w + 0.06, 0.035, 0.035, (0, y, z), r=0.0), wood(rail or C['woodDark']), tag)
    for i in range(n):
        x = -w / 2 + (i + 0.5) * w / n; hh = 0.2 + rng.uniform(-0.02, 0.02); pc = colors[i % len(colors)]
        ink = '#fff6ea' if sum(srgb(pc)) < 1.4 else '#4a2c2a'
        add(box(0.1, hh, 0.022, (x, y - 0.03 - hh / 2, z + 0.006), r=0.0, rz=rng.uniform(-0.05, 0.05)), soft(pc, 0.15, 0.2), tag)
        add(box(0.024, hh * 0.55, 0.01, (x, y - 0.03 - hh * 0.45, z + 0.02), r=0.0), flat(ink), tag)

def tea_bench(w=0.95, felt='#d84848', tag='bench'):
    add(beam(w, 0.07, 0.42, (0, 0.38, 0), c=0.02), wood(C['woodLight']), tag)
    add(box(w * 0.92, 0.035, 0.5, (0, 0.43, 0), r=0.015), lambda p, n: mix(mul(felt, 0.86), mix(felt, '#ff9a8a', 0.25), clamp(n.z)), tag)
    for s in (-1, 1): add(box(w * 0.92, 0.15, 0.03, (0, 0.355, s * 0.25), r=0.0), soft(mul(felt, 0.92)), tag)
    for x in (-w / 2 + 0.09, w / 2 - 0.09):
        for z in (-0.14, 0.14): add(box(0.065, 0.36, 0.065, (x, 0.18, z), r=0.0), wood(C['woodMid'], ao_z=0.0), tag)

def sack(r=0.15, color='#f4ead8', band='#c8a070', tag='sacks'):
    add(glathe([(0.0, 0.0), (r * 0.85, 0.0), (r * 1.02, r * 0.55), (r * 0.95, r * 1.3), (r * 0.55, r * 1.95), (r * 0.33, r * 2.1),
                (r * 0.45, r * 2.38), (0.0, r * 2.45)], 8), lambda p, n: mul(color, 0.88 + 0.12 * clamp(n.z + 0.5)), tag)
    add(gloop([(r * 0.36 * math.cos(TAU * k / 7), r * 2.12, r * 0.36 * math.sin(TAU * k / 7)) for k in range(7)], 0.018, K=3), soft(band), tag)

def pottery(n=3, spread=0.06, seed=0, tag='pottery'):
    rng = random.Random(seed); pal = ['#5a8ac8', '#e8e0d0', '#c86a4a', '#6aa878', '#f4d8a8']
    for i in range(n):
        r, h = rng.uniform(0.06, 0.09), rng.uniform(0.12, 0.2); c = pal[(i * 2 + seed) % len(pal)]
        x, z = rng.uniform(-spread, spread) + (i - (n - 1) / 2) * 0.12, rng.uniform(-spread, spread)
        lp = None
        add(glathe([(0.0, 0.0), (r * 0.7, 0.0), (r, h * 0.45), (r * 0.55, h * 0.85), (r * 0.66, h), (0.0, h * 0.95)], 8, pos=(x, 0, z)),
            lambda p, nn, c=c: mix(mul(c, 0.86), mix(c, '#ffffff', 0.25), clamp(nn.z * 0.6 + 0.3)), tag)

def produce_crate(kind='fish', s=0.28, seed=0, tag='produce'):
    crate(s, '#e2b988', tag=tag, seed=seed)
    rng = random.Random(seed + 3); hh = s * 0.85
    add(box(s - 0.03, 0.03, s - 0.03, (0, hh + 0.012, 0), r=0.0), soft('#e8d49a'), tag)
    pal = {'fish': ['#8ab8e0', '#a8c8e8'], 'apple': ['#e8403a', '#ff6a50', '#f4c04a'], 'flower': FLOWERS}[kind]
    for i in range(5):
        c = pal[i % len(pal)]; x, z = rng.uniform(-s * 0.28, s * 0.28), rng.uniform(-s * 0.28, s * 0.28)
        if kind == 'fish':
            add(sph(0.05, (x, hh + 0.05, z), sc=(2.0, 0.6, 0.85), K=7, J=3, ry=rng.uniform(0, PI)), lambda p, n, c=c: mix(mul(c, 0.85), '#f4f8ff', clamp(n.z) * 0.4), tag)
        else:
            add(sph(0.055, (x, hh + 0.06, z), K=6, J=3), lambda p, n, c=c: mix(mul(c, 0.85), mix(c, '#ffffff', 0.3), clamp(n.z * 0.7 + 0.2)), tag)

def tiny_flower(c, pos, r=0.05, seed=0, tag='flowers'):
    fb = blob(F.W(pos), r, r * 0.75, lobes=5, K=7, seed=seed, amp=0.3)
    fb.c = [mul(c, 0.85)] * 7 + [mix(c, '#fff6ea', 0.18)] * 7 + [mul(c, 0.8), '#ffd24a' if c != '#ffd24a' else '#ff9a3a']
    add(fb, None, tag)

def small_pot(r=0.08, h=0.11, color='#d4774e', flowers=('#ff8fb0',), seed=0, tag='pots'):
    add(glathe([(0.0, 0.0), (r * 0.72, 0.0), (r * 1.08, h), (0.0, h * 0.94)], 6),
        lambda p, n: mix(mul(color, 0.84), mix(color, '#fff0e0', 0.2), clamp(n.z * 0.6 + 0.3)), tag)
    add(blob(F.W((0, h * 0.85, 0)), r * 1.05, r * 0.9, lobes=3, K=5, seed=seed, amp=0.2), lambda p, n: mix('#4f9a48', '#8ccf6a', clamp(n.z)), tag)
    tiny_flower(flowers[0], (r * 0.15, h * 0.85 + r * 0.7, r * 0.2), 0.055, seed, tag)

def pinwheel(h=0.9, colors=('#ff6f7f', '#ffd24a', '#6ab0ff', '#8fe0c0'), spin=0.0, heads=True, tag='pinwheel'):
    """props2.js pinwheel: a stick and four curled blades round a gold pin (static: the kit spins its own only when the
    building keeps its 'anim' layer)"""
    add(cyl(0.016, 0.016, h, (0, h / 2, 0), K=5), wood(C['woodLight']), tag)
    if not heads: return      # (the catalog keeps the kit's 'anim' layer: its spinning heads pivot at (0, h, 0.03))
    with at((0, h, 0.04), rz=spin):
        for i in range(4):
            with at((0, 0, 0), rz=i * PI / 2):
                poly = [(0.0, 0.0), (0.14, 0.025), (0.15, 0.09), (0.11, 0.135), (0.03, 0.14)]
                add(prism(poly, 0.016, -0.008), lambda p, n, c=colors[i]: mix(mul(c, 0.86), mix(c, '#ffffff', 0.2), clamp(-n.y * 0.6 + 0.4)), tag)
        add(sph(0.026, (0, 0, 0.02), K=5, J=3), lac(C['gold']), tag)

def hang_sign(sym, w=0.34, h=0.3, color='#fff6e8', frame=None, sym_size=0.24, tag='hangsign'):
    """trim.js hangSign (face frame): an iron arm with a curl, two chains and a board seen from the street, both faces"""
    add(box(0.04, 0.04, 0.5, (0, 0, 0.25), r=0.0), soft(C['iron'], 0.3), tag)
    add(box(0.03, 0.03, 0.34, (0, -0.11, 0.12), r=0.0, rx=0.75), soft(C['iron'], 0.3), tag)
    add(box(0.05, 0.05, 0.05, (0, 0.0, 0.5), r=0.0), soft(C['iron'], 0.3), tag)
    bz = 0.3
    for s in (-1, 1): add(box(0.014, 0.1, 0.014, (0, -0.06, bz + s * w * 0.32), r=0.0), flat(C['iron']), tag)
    with at((0, -0.11 - h / 2, bz), ry=PI / 2):
        add(beam(w + 0.05, h + 0.05, 0.035, (0, 0, 0), c=0.012), wood(frame or C['woodDark']), tag)
        add(box(w, h, 0.05, (0, 0, 0), r=0.018), soft(color, 0.15), tag)
        emblem(sym, sym_size, (0, 0, -0.046), depth=0.092, tag=tag)   # (one relief right through the board: both faces)

def battari(w=0.4, y=0.36, tag='battari'):
    add(beam(w, 0.05, 0.3, (0, y, 0.17), c=0.015), wood(C['woodLight']), tag)
    for i in range(1, 4): add(box(0.015, 0.052, 0.3, (-w / 2 + i * w / 4, y + 0.002, 0.17), r=0.0), flat(mul(C['woodLight'], 0.82)), tag)
    for s in (-1, 1): add(box(0.05, y, 0.05, (s * (w / 2 - 0.06), y / 2, 0.28), r=0.0), wood(C['woodMid'], ao_z=0.0), tag)
    add(box(w, 0.04, 0.04, (0, y, 0.02), r=0.0), wood(C['woodMid']), tag)

def stool2(color='#e8c898', tag='stools'):
    add(cyl(0.14, 0.14, 0.06, (0, 0.4, 0), K=8), wood(color), tag)
    for i in range(3):
        a = i / 3 * TAU
        add(box(0.04, 0.4, 0.04, (math.cos(a) * 0.08, 0.2, math.sin(a) * 0.08), r=0.0, rz=math.cos(a) * 0.1, rx=-math.sin(a) * 0.1), wood(C['woodDark']), tag)

def barrel2(r=0.14, h=0.3, wd='#c98f5e', tag='barrel'):
    K = 8
    pr = [(0.0, 0.0)] + [(r * (0.86 + 0.14 * math.sin(t * PI)), t * h) for t in (0.0, 0.5, 1.0)] + [(r * 0.8, h), (0.0, h - 0.02)]
    def bc(p, n, base=F.W((0, 0, 0))):
        a = math.atan2(p.y - base.y, p.x - base.x); k = int(((a / TAU) % 1) * 8)
        if n.z > 0.8: return mul(wd, 0.8)
        return mul(wd, [1.0, 0.92, 1.05, 0.95, 1.02, 0.9, 1.04, 0.96][k] * (0.9 + 0.12 * clamp(n.z + 0.4)))
    add(glathe(pr, K), bc, tag)
    for t in (0.2, 0.8):
        R = r * (0.86 + 0.14 * math.sin(t * PI)) + 0.01
        add(gloop([(R * math.cos(TAU * k / 9), t * h, R * math.sin(TAU * k / 9)) for k in range(9)], 0.016, K=3), soft(PAL['iron'], 0.3), tag)

def parasol2(r=0.62, h=1.5, color='#ff8fb0', ribs=6, band=True, tag='parasol'):
    """props2.js parasol (wagasa): a pole, a ribbed canopy with a pale ring, a dark knob (a leaner profile than lh_kit's)"""
    add(cyl(0.028, 0.032, h + 0.3, (0, (h + 0.3) / 2, 0), K=6), wood('#9c7458'), tag)
    base = F.W((0, 0, 0))
    def cc(p, n):
        if n.z < -0.2: return mul(color, 0.72)
        rr = math.hypot(p.x - base.x, p.y - base.y); a = math.atan2(p.y - base.y, p.x - base.x)
        c = mix(mul(color, 0.9), mix(color, '#fff0f4', 0.25), 0.5 + 0.5 * math.cos(a * ribs))
        return mix('#fff6ea', c, 0.15) if band and abs(rr - r * 0.56) < r * 0.06 else c
    add(glathe([(0.0, h + 0.2), (r * 0.95, h - 0.03), (r, h + 0.02), (r * 0.56, h + 0.19), (r * 0.12, h + 0.3), (0.0, h + 0.31)], ribs * 2,
               rfn=lambda rr, z, th: rr * (1 - 0.05 * abs(math.sin(th * ribs / 2))) if rr > r * 0.9 else rr), cc, tag)
    add(sph(0.05, (0, h + 0.33, 0), K=6, J=3), wood('#6b4a3a'), tag)

def cafe_set(cloth='#fff6ea', umbrella=None, seed=0, tag='cafe', sweets=True):
    """props2.js cafeTable: a cloth-topped iron table, a cup and a cake, two stools, an optional parasol"""
    add(cyl(0.3, 0.3, 0.05, (0, 0.6, 0), K=10), lambda p, n: mix(mul(cloth, 0.9), cloth, clamp(n.z * 0.6 + 0.4)), tag)
    add(cyl(0.03, 0.03, 0.56, (0, 0.3, 0), K=6), soft(C['iron']), tag)
    add(cyl(0.15, 0.17, 0.04, (0, 0.02, 0), K=8), soft(C['iron']), tag)
    add(glathe([(0.0, 0.0), (0.035, 0.0), (0.045, 0.065), (0.0, 0.06)], 6, pos=(0.1, 0.625, 0.05)), soft('#fffaf2', 0.2), tag)
    if sweets:
        with at((-0.08, 0.625, -0.04)): cake(0.06, 1, ('#ffb0cc',), cherry=True, tag=tag, K=6)
    if umbrella: parasol2(0.62, 1.5, umbrella, 6, band=False)
    for a in (0.5, 0.5 + PI):
        with at((math.cos(a) * 0.5, 0, math.sin(a) * 0.5)): stool2('#e8c898', tag)

def bakery_table(seed=0, tag='display'):
    rng = random.Random(seed)
    add(beam(1.3, 0.06, 0.4, (0, 0.55, 0), c=0.02), wood(C['woodLight']), tag)
    for x in (-0.58, 0.58):
        for z in (-0.15, 0.15): add(box(0.05, 0.55, 0.05, (x, 0.27, z), r=0.0), wood(C['woodMid'], ao_z=0.0), tag)
    for i in range(3):
        x = -0.4 + i * 0.4
        add(glathe([(0.0, 0.0), (0.13, 0.0), (0.17, 0.1), (0.15, 0.1), (0.12, 0.03), (0.0, 0.03)], 9, pos=(x, 0.58, 0)),
            lambda p, n: mix('#a8784a', '#e0b07a', clamp(n.z * 0.5 + 0.5)), tag)
        for k in range(3):
            c = ['#d89050', '#e8b070', '#c87a3a'][(i + k) % 3]
            add(sph(0.075, (x + rng.uniform(-0.05, 0.05), 0.65 + k * 0.02, rng.uniform(-0.05, 0.05)), sc=(1.4, 0.7, 0.9), K=7, J=3, ry=k + i),
                lambda p, n, c=c: mix(mul(c, 0.82), mix(c, '#fff0c8', 0.35), clamp(n.z * 0.8)), tag)

def flower_stand(seed=0, tag='flowerstand'):
    rng = random.Random(seed)
    for t in range(3): add(box(1.3, 0.05, 0.22, (0, 0.2 + t * 0.2, -t * 0.16 + 0.16), r=0.0), wood(C['woodLight']), tag)
    for x in (-0.62, 0.62): add(box(0.05, 0.62, 0.52, (x, 0.31, 0), r=0.015), wood(C['woodMid'], ao_z=0.0), tag)
    for t in range(3):
        for i in range(4):
            with at((-0.45 + i * 0.3, 0.225 + t * 0.2, -t * 0.16 + 0.16)):
                small_pot(0.075, 0.1, ['#d4774e', '#e8e0d0', '#7a9ac8'][(i + t) % 3], (FLOWERS[(i * 3 + t) % 7], FLOWERS[(i + t * 2 + 1) % 7]), seed=i + t * 4, tag=tag)

def toy_table(tag='toys'):
    add(box(1.0, 0.5, 0.36, (0, 0.25, 0), r=0.04), lambda p, n: mix(mul('#ffd8a8', 0.88), '#ffe8c8', clamp(n.z * 0.6 + 0.4)), tag)
    add(box(1.04, 0.05, 0.4, (0, 0.5, 0), r=0.02), soft('#ff9ec0', 0.2), tag)
    for i, (c, r) in enumerate((('#ff6f7f', 0.1), ('#6ab0ff', 0.08), ('#ffd24a', 0.09), ('#8fe0c0', 0.07))):
        lp = None; base = F.W((-0.35 + i * 0.23, 0.525 + r, (i % 2) * 0.05 - 0.02))
        add(sph(r, (-0.35 + i * 0.23, 0.525 + r, (i % 2) * 0.05 - 0.02), K=7, J=4),
            lambda p, n, c=c, b=base, r=r: mix(c, '#fffaf2', 0.75) if abs(p.z - b.z) < r * 0.2 else mix(mul(c, 0.86), mix(c, '#ffffff', 0.25), clamp(n.z * 0.6 + 0.3)), tag)
    for i, c in enumerate(('#ff8fb0', '#6ab0ff', '#ffd24a')):
        add(box(0.1, 0.1, 0.1, (0.3 + (i - 1) * 0.02, 0.1 + i * 0.1, 0.22), r=0.02, ry=i * 0.3), relief(c), tag)

def flower_bucket(c, seed=0, tag='buckets'):
    add(glathe([(0.0, 0.0), (0.11, 0.0), (0.13, 0.24), (0.115, 0.24), (0.1, 0.2), (0.0, 0.2)], 9),
        lambda p, n: mix(mul('#8aa0b8', 0.85), '#b8c8d8', clamp(n.z * 0.5 + 0.4)), tag)
    add(blob(F.W((0, 0.18, 0)), 0.15, 0.17, lobes=5, K=8, seed=seed, amp=0.18), lambda p, n: mix('#3f8a40', '#8ccf6a', clamp(n.z * 0.8 + 0.1)), tag)
    for i, cc in enumerate((c, '#fffaf2', c)):
        a = i * TAU / 3 + seed
        tiny_flower(cc, (math.cos(a) * 0.08, 0.3 + (i % 2) * 0.03, math.sin(a) * 0.08), 0.055, seed + i, tag)

def kamoi(w, y, frame, tag='trim'):
    add(beam(w, 0.06, 0.06, (0, y, 0.03), c=0.015), wood(frame), tag)

def grille(w, h, color, tag='grille'):
    n = max(4, round(w / 0.075))
    for i in range(1, n): add(box(0.03, h, 0.03, (-w / 2 + i * w / n, 0, 0.09), r=0.0), wood(color), tag)
    for y in (-h / 2 + 0.03, h / 2 - 0.03): add(box(w, 0.035, 0.035, (0, y, 0.09), r=0.0), wood(mul(color, 0.92)), tag)

def shop_noren(w, h, y, z, color, strips, sym, sym_scale, hem='#f4efe6', sym_col='#fff6ea', tag='noren'):
    """parts.js noren: a rod on two brackets, cloth strips with a pale hem, the shop's crest printed across them"""
    rod = PAL['frameLo']
    add(cyl(0.028, 0.028, w + 0.16, (0, y + 0.02, z), K=7, rz=PI / 2), wood(rod), tag)
    for s in (-1, 1): add(beam(0.045, 0.06, z + 0.02, (s * (w / 2 + 0.05), y + 0.02, z / 2), c=0.012), wood(rod), tag)
    gap = 0.03; sw = (w - gap * (strips - 1)) / strips; hm = min(0.075, h * 0.22)
    lp = loc()
    for i in range(strips):
        x = -w / 2 + sw / 2 + i * (sw + gap); sway = (i - (strips - 1) / 2) * 0.012
        add(beam(sw, h - hm, 0.03, (x, y - (h - hm) / 2, z), c=0.012, rx=0.04, rz=sway),
            lambda p, n: mix(mul(color, 0.8), mix(color, '#fff6ea', 0.12), smooth(y - h, y, lp(p).y) * 0.8 + clamp(-n.y) * 0.1), tag)
        add(beam(sw, hm, 0.034, (x + sway * -0.45, y - h + hm / 2 + 0.005, z + 0.018), c=0.014, rx=0.04), soft(hem, 0.2), tag)
    emblem(sym, sym_scale, (0, y - h * 0.45, z + 0.02), depth=0.014, mono=sym_col, tag=tag)

def roof_open(o):
    """roof() with open gable ends (the cart's roof sits on four posts: no infill)"""
    g = globals(); keep = g['gable_tri']; g['gable_tri'] = lambda *a, **k: 0.0
    try: return roof(o)
    finally: g['gable_tri'] = keep

def warm_pal(wall, frame='#8f6a52', frameLo='#6b4a3a'):
    return dict(wall=wall, wallLo=mix(wall, '#d8bca0', 0.3), frame=frame, frameHi='#b0886a', frameLo=frameLo, paper='#fffaf0', door=C['woodLight'])

# ================================================================== level 1: the food stall cart (shops.js shopL1)
def build_l1(v):
    S = dict(STALLS[v % 3])
    if v >= 3: S['roof'] = [ROOFS['plum'], ROOFS['teal'], ROOFS['slate'], ROOFS['moss'], ROOFS['terracotta']][v % 5]
    name = 'shop-1-v%d' % v
    new_asset(name, warm_pal('#fff3e0'))
    tea, oni = S['name'] == 'tea', S['name'] == 'onigiri'
    cz, cw, cd, ch = -0.25, 1.3, 0.6, 0.8
    F.push((0, 0, cz), ry=kit_wob(1, v))
    # the counter cart: a planked body on a skirt rail, an overhanging counter top, two big wheels, the push handle
    body_c = C['woodLight']
    lp = loc()
    add(box(cw, ch - 0.25, cd, (0, 0.25 + (ch - 0.25) / 2, 0), r=0.045), lambda p, n: mul(mix(mul(body_c, 0.88), mix(body_c, '#ffe0b8', 0.15), clamp(n.z * 0.6 + 0.5)), 0.9 + 0.1 * smooth(0.25, ch, lp(p).y)), 'cart')
    for i in range(1, 6): add(box(0.022, ch - 0.32, 0.014, (-cw / 2 + i * cw / 6, 0.25 + (ch - 0.25) / 2, cd / 2 + 0.006), r=0.0), flat(mul(body_c, 0.74)), 'cart')
    for s in (-1, 1): add(beam(0.07, ch - 0.25, 0.07, (s * (cw / 2 - 0.02), 0.25 + (ch - 0.25) / 2, cd / 2 - 0.02), c=0.02), wood(C['woodMid']), 'cart')
    add(beam(cw + 0.16, 0.07, cd + 0.18, (0, ch, 0.02), c=0.025), wood(C['woodMid'], hi=mix(C['woodMid'], '#ffe8c8', 0.35)), 'cart')
    add(beam(cw + 0.06, 0.09, cd + 0.06, (0, 0.27, 0), c=0.025), wood(mul(C['woodMid'], 0.9)), 'cart')
    for sx in (-1, 1):
        with at((sx * (cw / 2 + 0.06), 0.3, 0), ry=PI / 2): cart_wheel(0.28)
    add(beam(0.055, 0.055, 0.72, (cw / 2 - 0.05, 0.55, -0.55), c=0.015, rx=-0.25), wood(C['woodMid']), 'cart')
    add(cyl(0.035, 0.035, 0.2, (cw / 2 - 0.05, 0.47, -0.88), K=6, rz=PI / 2), wood(C['woodDark']), 'cart')
    # posts and the little tiled roof (open gables), the kanban on the ridge
    pT = 1.78
    for sx in (-1, 1):
        for sz in (-1, 1): add(beam(0.075, pT - ch, 0.075, (sx * (cw / 2 - 0.04), ch + (pT - ch) / 2, sz * (cd / 2 - 0.04)), c=0.02), wood(C['woodMid'], ao_z=ch), 'posts')
    for sz in (-1, 1): add(beam(cw + 0.02, 0.07, 0.07, (0, pT - 0.04, sz * (cd / 2 - 0.04)), c=0.018), wood(C['woodDark']), 'posts')
    info = roof_open(dict(type='gable', w=cw - 0.05, d=cd, y0=pT, over=0.24, gOver=0.16, H=0.42, curve=0.25, lift=0.12, liftW=0.35,
                          thick=0.1, ribW=0.2, ribAmp=0.03, course=0.2, courseAmp=0.02, color=S['roof'], pastel=0.14, rich=1,
                          oni=False, seed=101 + v, bendUnder=True))
    with at((0, 0, cd / 2 + 0.2)):
        shop_noren(cw + 0.2, 0.3, pT - 0.06, 0.02, S['noren'], 4, S['sym'], 0.2, hem='#c83a3a' if oni else '#f4efe6',
                   sym_col=S.get('symCol', '#fff6ea'))
    with at((0, info['ridgeY'] + 0.2, 0)):
        add(beam(0.06, 0.3, 0.06, (0, -0.13, 0), c=0.015), wood(C['woodDark']), 'sign')
        sign_board(0.56, 0.36, S['sym'], '#f4e2c0', C['woodDark'], 0.3, sym_colors=['#ffffff', '#2a3a30'] if oni else None)
    for sx in (-1, 1):
        chochin(0.09, 0.18, '#f0e6cc' if tea else C['red'], cord=0.06, pos=(sx * (cw / 2 + 0.08), pT - 0.02, cd / 2 + 0.12))
    # stall dressing: menu plaques on the cart front, a rolled blind along the back, a bell (wind chime) at the back corner
    with at((0, 0, cd / 2 + 0.005)):
        fuda_row(cw - 0.24, ch - 0.06, 5, 0.012, C['woodMid'], ('#f0d8a8', '#e8604a', '#f0d8a8', '#8fbf70', '#f0d8a8'), seed=v)
    with at((0, 0, -cd / 2 - 0.02), ry=PI): sudare_blind(cw - 0.12, pT - 0.1, 0.28 if v % 2 else 0.0, z=0.02)
    with at((cw / 2 - 0.04, pT - 0.04, -cd / 2 + 0.02)):
        if v % 3 == 1: furin('#bfe6ff')
        else: bell_charm()
    # wares on the counter
    with at((0, ch + 0.035, 0.05)):
        if tea:
            add(sph(0.11, (-0.3, 0.09, 0), sc=(1, 0.85, 1), K=9, J=5), lac('#6a8a6a'), 'wares')
            add(cyl(0.05, 0.06, 0.03, (-0.3, 0.18, 0), K=8), lac('#5a7a5a'), 'wares')
            add(gtube([(-0.22, 0.08, 0), (-0.16, 0.12, 0), (-0.13, 0.17, 0)], lambda s: 0.026 - 0.008 * s, K=5), lac('#6a8a6a'), 'wares')
            add(gtube([(-0.37, 0.19, 0), (-0.3, 0.27, 0), (-0.23, 0.19, 0)], 0.014, K=4), wood(C['woodDark']), 'wares')
            add(beam(0.5, 0.025, 0.26, (0.2, 0.0, 0.04), c=0.008), lac('#c83a3a'), 'wares')
            for i in range(4):
                x, z = 0.05 + i * 0.11, 0.08 * (i % 2)
                add(glathe([(0.0, 0.012), (0.03, 0.012), (0.04, 0.065), (0.0, 0.055)], 7, pos=(x, 0, z)), lambda p, n, lp_=loc(): '#8fc070' if n.z > 0.85 and lp_(p).y > 0.05 else mix('#e8e0d0', '#fffaf2', clamp(n.z * 0.5 + 0.5)), 'wares')
        elif oni:
            add(cyl(0.24, 0.22, 0.03, (-0.15, 0.015, 0), K=12, bev=0.01), soft('#e8f0f4', 0.2), 'wares')
            for x, y, z, r in ((-0.27, 0.03, 0.0, 0.085), (-0.09, 0.03, 0.0, 0.085), (-0.18, 0.13, -0.03, 0.08), (0.2, 0.0, 0.05, 0.075), (0.36, 0.0, -0.02, 0.075)):
                with at((x, y + r * 0.95, z), rx=-0.25):
                    emblem('onigiri', r * 2.2, (0, 0, -0.045), depth=0.09, tag='wares')
        else:
            add(beam(0.62, 0.1, 0.34, (-0.05, 0.05, 0), c=0.02), lambda p, n: mix('#3e3a46', '#6a6878', clamp(n.z * 0.6 + 0.2)), 'wares')
            add(box(0.54, 0.02, 0.26, (-0.05, 0.1, 0), r=0.0), lambda p, n: '#ff8a3a', 'wares', glow=True)
            for i in range(4):
                with at((-0.28 + i * 0.15, 0.115, 0.02), rx=-PI / 2): emblem('taiyaki', 0.16, (0, 0, 0), depth=0.03, tag='wares', mono='#e0a050')
            for i in range(3):
                with at((0.38, 0.02 + i * 0.03, 0.05), ry=0.3 * i, rx=-PI / 2): emblem('taiyaki', 0.14, (0, 0, 0), depth=0.03, tag='wares', mono=['#e8a050', '#d89040', '#f0b060'][i])
    F.pop()
    # the customer side (the kit's world frame)
    if tea:
        with at((-0.25, 0, 0.72)): tea_bench(0.95)
        with at((0.72, 0, 0.62)): parasol2(0.46, 1.35, '#e8604a', 6)
    else:
        for i, x in enumerate((-0.4, 0.3)):
            with at((x, 0, 0.5), ry=0.4 + i): stool2('#e8c898' if oni else '#c86a4a', 'stools')
        with at((0.75, 0, 0.72)):
            if oni: crate(0.28, '#e2b988', seed=v)
            else: barrel2(0.15, 0.32)
    with at((-0.8, 0, -0.75)): crate(0.26, '#e2b988', seed=v + 3)
    if oni:
        with at((0.72, 0, -0.72), ry=0.3): sack(0.15)
        with at((0.45, 0, -0.85), ry=-0.4): sack(0.12)
    elif tea:
        with at((0.7, 0, -0.75), ry=0.2):
            crate(0.26, '#c8a878', seed=v + 5)
            with at((0, 0.225, 0)): pottery(3, 0.02, seed=v)
    else:
        with at((0.72, 0, -0.72), ry=0.2): produce_crate('fish', 0.28, seed=v)
    with at((-0.92, 0, 0.42), ry=0.55): aframe(0.3, 0.36, S['sym'], sym_size=0.22)
    return A, dict(door=(0, 0, 0.95), light=(0, 1.4, 0.6), ridgeY=round(info['ridgeY'], 3), yaw=round(kit_wob(1, v), 4))

# ================================================================== level 2: the machiya shop (shops.js shopL2)
def build_l2(v):
    S = dict(SHOPS2[v % 4])
    if v >= 4: S['roof'] = [ROOFS['slate'], ROOFS['plum'], ROOFS['terracotta'], ROOFS['teal']][v % 4]; S['wall'] = WALL_TINTS[(v * 3) % len(WALL_TINTS)]
    kind = S['name']; name = 'shop-2-v%d' % v
    frame, frameLo = C['timber'], C['woodDark']
    new_asset(name, warm_pal(S['wall'], frame, frameLo))
    w, d, h, y0, zc = 2.4, 1.55, 1.55, 0.26, -0.62
    dress = 'grille' if v % 3 == 2 else 'sudare'
    F.push((0, 0, zc))
    foundation(w, d, y0, pad=0.14, seed=11 + v, color='#a89ca8', gap=1.05)
    walls(dict(w=w, d=d, h=h, y0=y0, plaster=S['wall'], frame=frame, koshi='#c9a27a', koshiSkip='f'))
    blk = dict(w=w, d=d)
    # the wide shop front: lattice doors and the big noren
    with on_face(blk, 'f', -0.2, y0):
        door_slide(1.5, 1.3, 'lattice', wd=C['woodLight'], frame=frame)
        shop_noren(1.44, 0.48, 1.36, 0.17, S['noren'], 4, S['sym'], 0.26)
    with on_face(blk, 'f', 0.88, y0 + 0.78):
        shoji(0.42, 0.6, frame=frame)
        if dress == 'grille': grille(0.36, 0.52, mul(frame, 1.05))
        else: sudare_blind(0.4, 0.31, 0.18 if v % 2 else 0.0, z=0.09)
    with on_face(blk, 'r', 0, y0 + 0.84):
        shoji(0.7, 0.5, frame=frame, box_=True, flowers=[FLOWERS[v % 7], '#fffaf2'])
        kamoi(1.0, 0.31, frame)
    with on_face(blk, 'l', 0, y0 + 0.84): round_window(0.26, frame=frame, fine=True)
    with on_face(blk, 'b', 0, y0 + 0.84):
        shoji(0.8, 0.5, frame=frame)
        if dress == 'grille': grille(0.74, 0.42, mul(frame, 1.05))
        else: sudare_blind(0.78, 0.26, 0.2, z=0.09)
    irimoya = v % 2 == 1
    info = roof(dict(type='irimoya' if irimoya else 'gable', w=w, d=d, y0=y0 + h, over=0.4, gOver=0.3, H=0.9, curve=0.4, lift=0.26,
                     liftW=0.7, thick=0.15, ribW=0.4 if irimoya else 0.3, ribAmp=0.045, course=0.48 if irimoya else 0.36, courseAmp=0.028, color=S['roof'], pastel=0.14,
                     gable='plaster', gableColor=S['wall'], timber=frameLo, tg=0.5, vent=not irimoya, rich=1, seed=201 + v, bendUnder=True))
    # the front hood roof over the display
    with on_face(blk, 'f', 0, y0 + h - 0.12):
        with at((0, 0, 0.27)):
            roof(dict(type='shed', w=w + 0.1, d=0.52, y0=-0.06, over=0.12, gOver=0.1, H=0.2, curve=0.2, lift=0.1, liftW=0.35, thick=0.08,
                      ribW=0.34, ribAmp=0.03, course=0.0, color=S['roof'], pastel=0.14, rich=1, seed=221 + v))
        for s in (-1, 1): add(beam(0.06, 0.06, 0.36, (s * (w / 2 - 0.15), -0.06, 0.18), c=0.015, rx=-0.35), wood(frameLo), 'hood')
    # the standing kanban on the front slope, its post planted in the tiles
    with at((0.1, info['ridgeY'] - 0.3, d / 2 + 0.28)):
        yr = info['yAt'](0.1, d / 2 + 0.18); Lp = info['ridgeY'] - 0.3 - 0.2 - yr + 0.08
        add(beam(0.07, Lp, 0.07, (0, -0.2 - Lp / 2 + 0.04, -0.1), c=0.02), wood(C['woodDark']), 'sign')
        sign_board(0.74, 0.5, S['sym'], '#fff6e8', C['woodDark'], 0.42)
    for sx in (-1, 1):
        chochin(0.1, 0.2, '#fff0d0' if kind == 'cafe' else C['red'], cord=0.02, pos=(sx * (w / 2 - 0.12), y0 + h - 0.2, d / 2 + 0.52))
    smoke = None
    if kind == 'bakery':
        smoke = chimney(0.7, -0.3, info['yAt'](0.7, -0.3) - 0.2, info['ridgeY'] + 0.1, 0.9, hat=v == 0, seed=31 + v)
    if kind != 'cafe':
        with on_face(blk, 'f', 0.95, 0): battari(0.4, 0.36)
    with on_face(blk, 'r', -0.52, y0 + 1.3): hang_sign(S['sym'])
    with at((0.62, y0 + h - 0.26, d / 2 + 0.36)):
        if kind == 'flower': furin('#ffd0e0')
        else: bell_charm()
    rain_chain(-(w / 2 + 0.02), y0 + h - 0.24, d / 2 + 0.42, 0.0, color=C['bronze'])
    F.pop()
    fz = zc + d / 2
    # the outside display, per shop
    if kind == 'bakery':
        with at((-0.3, 0, fz + 0.5)): bakery_table(seed=v)
        with at((1.1, 0, fz + 0.5)): sack(0.15, '#f4ead8')
        with at((1.32, 0, fz + 0.6), ry=0.6): sack(0.12, '#ece0c8')
    elif kind == 'cafe':
        with at((-0.75, 0, fz + 0.72)): cafe_set('#fff6ea', '#6aa8d8', seed=v)
        with at((0.65, 0, fz + 0.72)): cafe_set('#e8f4ff', None, seed=v + 1, sweets=False)
        with at((1.25, 0, fz + 0.3), ry=-0.4): aframe(0.36, 0.44, 'cake', sym_size=0.26)
    elif kind == 'flower':
        with at((-0.35, 0, fz + 0.42)): flower_stand(seed=v)
        for i, (x, c) in enumerate(((0.75, '#ff8fb0'), (1.1, '#ffd24a'))):
            with at((x, 0, fz + 0.55)): flower_bucket(c, seed=v + i)
    else:
        # the sticks only, to the kit's random heights (its spin pivots, kitdump/kit-info.json anims): the kit's own
        # heads spin on top (catalog shop glbKeep ['anim'])
        KIT_PIN_H = {3: (0.8522, 0.9230, 0.9926), 7: (0.8352, 0.8678, 1.0015)}[v]
        for i, (x, z) in enumerate(((-0.9, fz + 0.45), (-0.6, fz + 0.75), (1.15, fz + 0.5))):
            with at((x, 0, z)): pinwheel(KIT_PIN_H[i], heads=False)
        with at((0.3, 0, fz + 0.5)): toy_table()
    # deliveries against the side wall, a potted plant beside the door, stepping stones to the street
    with at((1.36, 0, -0.95), ry=0.08):
        crate(0.28, '#e2b988', seed=v)
        with at((0.01, 0.24, 0.02), ry=0.35): crate(0.22, C['woodLight'], seed=v + 2)
    with at((1.36, 0, -0.45), ry=0.4):
        if kind == 'bakery': sack(0.13)
        else: barrel2(0.13, 0.3)
    if kind != 'bakery':
        with at((0.62, 0, fz + 0.2)):
            if kind == 'cafe':
                add(glathe([(0.0, 0.0), (0.09, 0.0), (0.12, 0.14), (0.13, 0.16), (0.0, 0.15)], 8), lambda p, n: mix(mul('#d4774e', 0.86), '#ec9a6e', clamp(n.z * 0.6 + 0.3)), 'pot')
                add(blob(F.W((0, 0.13, 0)), 0.15, 0.24, lobes=4, K=8, seed=v, amp=0.16), lambda p, n: mix('#3f7a40', '#7cbf5a', clamp(n.z * 0.8 + 0.2)), 'pot')
            else: pot_flowers(0.12, 0.17, (FLOWERS[(v + 1) % 7], FLOWERS[(v + 3) % 7]))
    step_stones(-0.2, fz + 0.2, -0.2, 1.4, 2, seed=40 + v)
    out = dict(door=(-0.2, 0, 1.4), light=(0, 1.4, round(fz + 0.8, 3)), ridgeY=round(info['ridgeY'], 3), roof='irimoya' if irimoya else 'gable')
    if smoke: out['smoke'] = (round(smoke[0], 3), round(smoke[1], 3), round(smoke[2] + zc, 3))
    return A, out

# ================================================================== run
PIECE_ = argv[argv.index('--piece') + 1] if '--piece' in argv else 'all'
todo = []
for tok in PIECE_.split(','):
    if tok == 'all': todo += [(L, k) for L in (1, 2) for k in range(8)]
    elif ':' in tok: todo.append(tuple(int(x) for x in tok.split(':')))
    else: todo += [(int(tok), k) for k in range(8)]
for L, k in todo:
    asset, info = (build_l1 if L == 1 else build_l2)(k)
    finish(asset, seed=kit_seed(L, k), amt=0.05)
    print('LH shop-%d-v%d info %s' % (L, k, info))
    print('LH shop-%d-v%d tags %s' % (L, k, dict(sorted(asset.count.items(), key=lambda kv: -kv[1]))))
    export_level(asset, 'shop-%d-v%d' % (L, k))
print('SHOP done')
