# PAWHAVEN: Blossom Hollow's level-2 homes (the Porch House), one GLB per kit variant (task home-2), built in Blender
# by script.
#   blender --background --factory-startup --python build_home-2.py -- --piece 2:<variant>|all
# Deterministic: seeded PRNGs only; a re-run reproduces every GLB exactly.
# Frame: 1 unit = 1 m, Blender Z up, the front (the door side) faces -Y (the glTF exporter makes it the game's +z),
# centred on the kit's footprint origin (src/world/buildings/homes.js homeL2, footprint 3 x 3). Layout code is written
# in the kit's game frame (x, y up, z front) and mapped to Blender (x, -z, y).
# The shared mesh kit (accumulator, rounded boxes, lathes, tubes, the roofs.js roof port with crisp tile courses, walls,
# windows, doors, props, finish) is the Blossom Hollow landmarks' (tools/blender/codex/assets/landmarks-hollow, via the
# zv-bamboo base_kit.py extraction, plus the final landmarks' bendUnder roof fix), exec'd here. Per variant the
# parameters are the kit's own (homeL2): roof colour / wall tint / roof type / door side / door style / noren / koshi /
# chimney / laundry / firewood / hedge / mailbox / bamboo fence / the yard props the kit's random stream picks
# (kitdump/yard-2.json) and its detail-stream choices (kitdump/detail-2.json: window dressing, chimney rain hat,
# zabuton colour). The kit's hand-made warp is applied with the kit Builder's own seed, so the leans match.
import bpy, bmesh, math, os, sys, random, json
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..', '..'))
MODELS = os.path.join(REPO, 'public', 'models')
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
PIECE = argv[argv.index('--piece') + 1] if '--piece' in argv else 'all'
NOEXPORT = '--noexport' in argv
print('H2 build pid', os.getpid())
_base = os.path.join(HERE, 'base_kit.py')
exec(compile(open(_base, encoding='utf-8').read(), _base, 'exec'))

KIT_INFO = json.load(open(os.path.join(HERE, 'kitdump', 'kit-info.json')))
YARD = json.load(open(os.path.join(HERE, 'kitdump', 'yard-2.json')))
DETAIL = json.load(open(os.path.join(HERE, 'kitdump', 'detail-2.json')))

# ================================================================== kit palette (kit.js)
C = dict(woodDark='#6b4a3a', timber='#8f6a52', woodMid='#9c7458', woodLight='#c98f5e', woodPale='#e2b988', indigo='#2f4a7a',
         red='#e8503a', pink='#ff8fb0', terracotta='#d4774e', bronze='#b58a4a', iron='#4a4650', paper='#fffaf0')
ROOFS = dict(slate='#5d6f9e', teal='#3f8f8a', terracotta='#d86a4a', moss='#6e9a5a', plum='#8a5a8a')
ROOF_LIST = [ROOFS['slate'], ROOFS['teal'], ROOFS['terracotta'], ROOFS['moss'], ROOFS['plum']]
WALL_TINTS = ['#fff3e0', '#fff0e4', '#fdf2ea', '#f6f1ff', '#fff7e6', '#f1f7ea', '#ffece6']
def moss_of(c): return 0.35 if c in (ROOFS['slate'], ROOFS['teal'], ROOFS['moss']) else 0.05

# ================================================================== extra parts (kit parts.js / trim.js / props*.js, chunky)
def flower_mark(size, pos=(0, 0, 0), depth=0.016, col='#fff6ea', eye='#ffd24a', tag='sym'):
    """symbols.js flower: five round petals and a round eye"""
    x, y, z = pos
    for i in range(5):
        a = PI / 2 + i * TAU / 5
        add(sph(1.0, (x + math.cos(a) * 0.2 * size, y + math.sin(a) * 0.2 * size, z), sc=(0.15 * size, 0.15 * size, depth), K=6, J=2),
            soft(col, 0.2), tag)
    add(sph(1.0, (x, y, z + depth * 0.5), sc=(0.1 * size, 0.1 * size, depth * 0.8), K=6, J=3), soft(eye, 0.2), tag)

def leaf_mark(size, pos=(0, 0, 0), depth=0.016, col='#fff6ea', tag='sym'):
    x, y, z = pos; s = size
    leaf = [(0.0, -0.4 * s), (0.2 * s, -0.1 * s), (0.16 * s, 0.2 * s), (0.0, 0.42 * s), (-0.16 * s, 0.2 * s), (-0.2 * s, -0.1 * s)][::-1]
    with at((x, y, z), rz=-0.35):
        add(puffy(leaf, depth, bev=depth * 0.4), soft(col, 0.2), tag)
        add(box(0.025 * s, 0.7 * s, depth * 0.6, (0, 0, depth + 0.002), r=0.0), flat(mul(col, 0.8)), tag)

def noren2(w, h, y, z, color, sym, sym_scale, strips=2, rod=None, tag='noren'):
    """parts.js noren (homes: two strips, a crest across the slit): a rod on brackets, cloth strips with a pale hem"""
    rod = rod or C['woodDark']
    add(cyl(0.028, 0.028, w + 0.16, (0, y + 0.02, z), K=6, rz=PI / 2), wood(rod), tag)
    for s in (-1, 1): add(beam(0.045, 0.06, z + 0.02, (s * (w / 2 + 0.05), y + 0.02, z / 2), c=0.012), wood(rod), tag)
    gap = 0.035; sw = (w - gap * (strips - 1)) / strips; hem = 0.07
    for i in range(strips):
        x = -w / 2 + sw / 2 + i * (sw + gap); sway = (i - (strips - 1) / 2) * 0.03
        zt, zb = F.W((0, y, 0)).z, F.W((0, y - h, 0)).z
        add(beam(sw, h - hem, 0.03, (x, y - (h - hem) / 2, z), c=0.012, rx=0.04, rz=sway),
            lambda p, n, zt=zt, zb=zb: mix(mul(color, 0.8), mix(color, '#fff0e8', 0.1), clamp((p.z - zb) / max(1e-4, zt - zb)) * 0.7 + clamp(-n.y) * 0.15), tag)
        add(beam(sw, hem, 0.034, (x + sway * -0.45, y - h + hem / 2 + 0.005, z + 0.018), c=0.014, rx=0.04), soft('#f4efe6', 0.2), tag)
    sy, sz = y - h * 0.45, z + 0.032
    if sym == 'sakura': sakura_mark(sym_scale, (0, sy, sz), depth=0.016, col='#fff4e6', eye='#ffb0c8', tag=tag)
    elif sym == 'leaf': leaf_mark(sym_scale * 1.1, (0, sy, sz - 0.01), depth=0.016, col='#fff4e6', tag=tag)
    elif sym == 'flower': flower_mark(sym_scale, (0, sy, sz), depth=0.016, col='#fff4e6', eye='#ffd24a', tag=tag)
    else: heart(sym_scale * 0.95, (0, sy, sz - 0.012), depth=0.02, col='#fff0f0', tag=tag)

def door_pulls(w, h, tag='door'):
    """parts.js doorTrim: a dark pull with a bronze ring on each sliding panel"""
    pw = w / 2 + 0.02
    for s in (-1, 1):
        hx = s * (w / 4 - 0.005) - s * (pw / 2 - 0.09); hz = 0.03 + (0.025 if s > 0 else 0) + 0.035
        add(box(0.035, 0.11, 0.014, (hx, h * 0.5, hz + 0.004), r=0.0), flat('#3a2a28'), tag)

def sudare(w, drop, y, z=0.1, tag='window'):
    """trim.js sudare: a rolled bamboo blind under the head beam, sometimes half let down"""
    add(cyl(0.035, 0.035, w + 0.06, (0, y, z), K=6, rz=PI / 2), lambda p, n: mix('#a89a5a', '#d8c888', clamp(n.z * 0.5 + 0.5)), tag)
    if drop > 0:
        M = F.m
        def sc(p, n, y0_=F.W((0, y, 0)).z):
            k = int((y0_ - p.z) / 0.035)
            return mul('#c8b878' if k % 2 else '#b8a868', 0.9 + 0.1 * clamp(n.z + 0.5))
        add(box(w, drop, 0.016, (0, y - drop / 2, z - 0.01), r=0.0, extra=(0, max(2, int(drop / 0.035)), 0)), sc, tag)
        for s in (-1, 1): add(box(0.012, drop + 0.05, 0.02, (s * w * 0.3, y - drop / 2 + 0.02, z + 0.004), r=0.0), flat('#8a5a3a'), tag)

def grille(w, h, frame, tag='window'):
    """trim.js grille (koshi lattice over a window): close vertical slats in a frame, standing off the pane"""
    c = mul(frame, 1.05)
    n = max(4, round(w / 0.09))
    for i in range(1, n): add(box(0.034, h - 0.06, 0.034, (-w / 2 + i * w / n, 0, 0.1), r=0.0), wood(c if i % 2 else mul(c, 0.9)), tag)
    for yy in (h / 2 - 0.05, -h / 2 + 0.06): add(beam(w + 0.04, 0.045, 0.05, (0, yy, 0.105), c=0.012), wood(c), tag)

def opening_trim(w, h, frame, u, L, yb, yt, box_=False, round_=False, posts=True, head=True, avoid=(), tag='window'):
    """parts.js openingTrim (richness 1): flanking posts sill-to-head where a real plaster panel is left before the
    corner, and a head beam (kamoi) over the opening. u: the opening's offset on a face of length L; yb / yt: the wall's
    foot and head in the opening's frame; avoid: face offsets (door posts) a flanking post must keep clear of."""
    px = w / 2 + (0.06 if round_ else 0.07)
    if posts:
        for s in (-1, 1):
            if abs(u + s * px) > L / 2 - 0.34 or any(abs(u + s * px - a) < 0.16 for a in avoid): continue
            add(box(0.075, yt - yb - 0.16, 0.05, (s * px, (yt + yb) / 2, 0.018), r=0.0), wood(frame), tag)
    if head and yt - h / 2 > 0.16:
        add(box(min(w + 0.3, L - 0.2), 0.06, 0.06, (0, h / 2 + 0.06, 0.03), r=0.0), wood(frame), tag)

def plaster_patch(w=0.5, h=0.32, seed=0, tag='walls'):
    """parts.js weatherWalls: a flaked plaster patch with the lath showing (face frame)"""
    add(box(w, h, 0.012, (0, 0, 0.006), r=0.0), flat('#c8b090'), tag)
    for k in range(3): add(box(w * 0.85, 0.035, 0.016, (0, -h / 2 + (k + 0.5) * h / 3, 0.014), r=0.0), soft('#a89058', 0.2), tag)
    add(gloop([(w / 2 * math.cos(TAU * k / 9) * (1 + 0.12 * math.sin(k * 2.3 + seed)), h / 2 * math.sin(TAU * k / 9), 0.014) for k in range(9)], 0.022, K=3,
              up=F.N((0, 0, 1))), soft('#fff4e0', 0.15), tag)

def teru(color='#ff7a8a', tag='charms'):
    """trim.js charm teru: a teru teru bozu, a tiny happy face, a coloured neck tie (hung from y = 0)"""
    add(box(0.018, 0.08, 0.018, (0, -0.04, 0), r=0.0), flat('#3a2a30'), tag)
    add(sph(0.068, (0, -0.135, 0), K=6, J=3), soft('#fffaf2', 0.2), tag)
    add(glathe([(0.0, -0.36), (0.095, -0.36), (0.07, -0.27), (0.035, -0.205), (0.0, -0.2)], 7), soft('#fff6ea', 0.15), tag)
    add(gloop([(0.046 * math.cos(TAU * k / 7), -0.205, 0.046 * math.sin(TAU * k / 7)) for k in range(7)], 0.017, K=3), soft(color), tag)
    for s in (-1, 1): add(sph(0.014, (s * 0.024, -0.128, 0.062), K=4, J=3), flat('#3a2a30'), tag)

def persimmon_string(n=4, seed=0, tag='charms'):
    """trim.js charm persimmon: a drying string of hoshigaki"""
    rng = random.Random(seed)
    L = 0.06 + n * 0.085
    add(box(0.018, L, 0.018, (0, -L / 2, 0), r=0.0), flat('#c8a060'), tag)
    for i in range(n):
        y = -0.08 - i * 0.085
        add(sph(0.048, (0, y, 0), sc=(1, 0.85, 1), K=5, J=2, ry=i * 1.3), lac(rng.choice(['#f08a3a', '#e8782e', '#f49a48'])), tag)

def bonsai_pot(r=0.14, color='#8a7a9a', seed=0, tag='pots'):
    """props.js pot plant 'pine': a glazed pot, a crooked trunk and three cloud pads"""
    add(glathe([(0.0, 0.0), (r * 0.8, 0.0), (r * 1.0, r * 0.75), (r * 1.1, r * 0.95), (r * 0.95, r * 1.0), (0.0, r * 0.9)], 8), lac(color), tag)
    pts = [(0, r * 0.9, 0), (0.03, r * 0.9 + 0.12, 0.01), (-0.02, r * 0.9 + 0.22, 0.0), (0.03, r * 0.9 + 0.32, 0.0)]
    add(gtube(pts, lambda s: 0.03 - 0.012 * s, K=5), wood('#6a4a36'), tag)
    for k, (x, y, z, rr) in enumerate(((0.07, 0.27, 0.0, 0.12), (-0.08, 0.32, 0.02, 0.1), (0.03, 0.42, -0.01, 0.1))):
        add(sph(rr, (x, r * 0.9 + y - 0.1, z), sc=(1.25, 0.55, 1.05), K=6, J=3),
            lambda p, n: mix(mix('#2f5a3a', '#4a7a44', clamp(n.z * 0.8 + 0.5)), '#8cb860', clamp(n.z - 0.4) * 0.6), tag)

def hedge(x0, x1, h=0.34, d=0.26, flowers=None, seed=0, tag='hedge'):
    """props2.js hedge: a low clipped hedge along x, lumpy rounded mounds, light tops, darker skirt, a few blossoms"""
    rng = random.Random(seed + 5)
    L = x1 - x0; cx = (x0 + x1) / 2
    lo, mid, hi = '#3f7a42', '#4f9a50', '#9ad870'
    def col(p, n):
        c = mix(mix(lo, mid, clamp(n.z * 0.9 + 0.7)), hi, clamp(n.z * 0.8 - 0.1) * 0.65)
        return mul(c, 0.93 + 0.12 * vnoise(p, 9.0, seed))
    nb = max(2, round(L / 0.3))
    for i in range(nb):         # (overlapping clipped mounds, each its own size)
        x = x0 + (i + 0.5) * L / nb + rng.uniform(-0.03, 0.03)
        add(sph(1.0, (x, h * 0.48, rng.uniform(-0.02, 0.02)), sc=(L / nb * 0.68, h * 0.56, d * 0.56), K=7, J=4, ry=rng.uniform(-0.2, 0.2)), col, tag)
    if flowers:
        for i in range(max(3, int(L / 0.2))):
            x = x0 + 0.08 + (L - 0.16) * (i + rng.uniform(0.2, 0.8)) / max(3, int(L / 0.2)); c = flowers[i % len(flowers)]
            zz = rng.choice((-1, 1)) * rng.uniform(0.0, d * 0.35)
            fb = blob(F.W((x, h + 0.01, zz)), 0.045, 0.035, lobes=5, K=7, seed=i + seed, amp=0.3)
            fb.c = [mul(c, 0.85)] * 7 + [mix(c, '#fff6ea', 0.2)] * 7 + [mul(c, 0.8), '#ffd84a']
            add(fb, None, tag)

def bamboo_fence(a, b, h=0.55, seed=0, tag='fence'):
    """parts.js fence 'bamboo': close-set culms, each its own green, two dark rails, thicker posts"""
    dx, dz = b[0] - a[0], b[1] - a[1]; L = math.hypot(dx, dz); ang = math.atan2(dx, dz)
    rng = random.Random(seed + 77)
    with at((a[0], 0, a[1]), ry=ang):
        n = max(2, round(L / 0.135))
        base = F.W((0, 0, 0)).z
        for i in range(n):
            hh = h + rng.uniform(-0.04, 0.04); c = rng.choice(['#b8c870', '#a8bc64', '#c4d27c'])
            add(cyl(0.046, 0.05, hh + 0.2, (rng.uniform(-0.01, 0.01), (hh - 0.2) / 2, (i + 0.5) * L / n), K=5),
                lambda p, nn, c=c: '#e8ecc0' if nn.z > 0.8 else (mul(c, 0.78) if ((p.z - base) % 0.3) < 0.025 else mul(c, 0.88 + 0.14 * clamp(nn.x * 0.5 + 0.5))), tag)
        for y in (h * 0.3, h * 0.78):
            add(cyl(0.03, 0.03, L, (0.06, y, L / 2), K=5, rx=PI / 2), wood('#6b4a3a'), tag)
        for i in range(round(L / 0.9) + 1):
            add(cyl(0.06, 0.065, h + 0.4, (0, (h + 0.4) / 2 - 0.3, i * L / max(1, round(L / 0.9))), K=6),
                lambda p, nn: '#d8dca8' if nn.z > 0.8 else mix('#7a8a48', '#9aac5c', clamp(nn.x * 0.5 + 0.5)), tag)

def tuft(pos, s=1.0, seed=0, col='#6aae4c', flower=None, tag='weeds'):
    """trim.js weeds: a chunky grass tuft, five blades fanning out (a clover flower on some)"""
    rng = random.Random(seed)
    hi, lo = mix(col, '#d8f08a', 0.45), mix(col, '#2f5a3a', 0.4)
    with at(pos, ry=rng.uniform(0, TAU)):
        z0 = F.W((0, 0, 0)).z
        for i in range(4):
            a = i / 4 * TAU + rng.uniform(-0.3, 0.3); L = s * rng.uniform(0.13, 0.19)
            with at((math.cos(a) * 0.025 * s, 0, math.sin(a) * 0.025 * s), ry=-a):
                add(glathe([(0.0, -0.02), (0.032 * s, -0.02), (0.0, L)], 3, rz=-rng.uniform(0.25, 0.5)),
                    lambda p, n, L=L: mix(lo, hi, clamp((p.z - z0) / L)), tag)
        if flower:
            add(sph(0.026, (0, 0.13 * s, 0), sc=(1, 0.7, 1), K=5, J=3), soft(flower, 0.2), tag)

def firewood(w=0.8, h=0.4, d=0.22, seed=5, tag='woodpile'):
    """props2.js firewood against a wall (along local x): three courses of split logs (pale cut ends, bark sides) under a
    little shingle roof on two posts"""
    rng = random.Random(seed)
    for row, y in enumerate((0.07, 0.19, 0.31)):
        n = 5 if row % 2 == 0 else 4; x0 = -w / 2 + 0.08 + (0.0 if row % 2 == 0 else 0.08)
        for i in range(n):
            L = d * rng.uniform(0.9, 1.05)
            t = lathe([(0.0, -L / 2), (0.068, -L / 2), (0.068, L / 2), (0.0, L / 2)], 5, th0=rng.uniform(0, 1))
            t.xform(F.m @ lm((x0 + i * 0.16 + rng.uniform(-0.01, 0.01), y, rng.uniform(-0.02, 0.02)), rx=PI / 2))
            bark = rng.choice(['#8a5e44', '#9a6a4a', '#7a5040'])
            add(t, lambda p, n, bark=bark, M=F.m: '#f0cc98' if abs((M.to_3x3().inverted() @ n).y) > 0.85 else mul(bark, 0.9 + 0.15 * clamp(n.z)), tag)
    add(beam(w + 0.16, 0.045, d + 0.16, (0, h + 0.07, 0.01), c=0.014, rx=0.22), wood('#8f6a52'), tag)
    for sx in (-1, 1): add(box(0.05, h + 0.08, 0.05, (sx * (w / 2 + 0.03), (h + 0.08) / 2, d / 2), r=0.0), wood('#6b4a3a', ao_z=0.0), tag)

def zabuton(c, tag='porch'):
    add(box(0.3, 0.06, 0.3, (0, 0.03, 0), r=0.025), lambda p, n: mix(mul(c, 0.82), mix(c, '#fff0f0', 0.15), clamp(n.z * 0.6 + 0.4)), tag)
    add(box(0.035, 0.022, 0.035, (0, 0.065, 0), r=0.0), flat(mul(c, 0.7)), tag)

def moss_cushion(x, z, yAt, s=1.0, seed=0, base=None, tag='moss'):
    """roofs.js moss clumps: soft moss cushions tucked on a low course (light tops, a darker underside)"""
    rng = random.Random(seed)
    mc = mix(base or '#6e9a5a', rng.choice(['#6f9c50', '#7aa458', '#668f4a']), 0.6)
    for c in range(3):
        xx, zz = x + (rng.uniform(-0.07, 0.07) if c else 0), z + (rng.uniform(-0.05, 0.05) if c else 0)
        r = rng.uniform(0.07, 0.095) * s * (0.75 if c else 1.0)
        b = blob(F.W((xx, yAt(xx, zz) + 0.02, zz)), r, r * 0.55, lobes=4, K=7, seed=seed + c, amp=0.2)
        add(b, lambda p, n, mc=mc: mix(mul(mc, 0.72), mix(mc, '#c8e098', 0.35), clamp(n.z * 0.8 + 0.2)), tag)

# ================================================================== the Porch House (homes.js homeL2, footprint 3 x 3)
def new_asset(name, pal):
    global A, OB
    A = Asset2(); F.__init__(); OB = name
    PAL.update(pal)

def yard_prop(k, pos, yaw, flowers, seed):
    """homes.js yardProps kinds: 0 flower pot, 1 barrel, 2 crate, 3 bush, 4 potted pine, 5 flower patch"""
    with at(pos, ry=yaw):
        if k == 0: pot_flowers(0.17, 0.24, tuple(flowers), tag='yard')
        elif k == 1: barrel(0.16, 0.34, tag='yard')
        elif k == 2: crate(0.3, '#e2b988', tag='yard', seed=seed)
        elif k == 3: bush(0.26, (flowers[0],), seed=seed, tag='yard', nf=4)
        elif k == 4: bonsai_pot(0.15, '#7a8aa8', seed=seed, tag='yard')
        else: flower_patch(0.5, 0.4, 6, tuple(flowers + ['#fffaf2']), tag='yard')

def build_home2(v):
    rp = 'home-2-v%d' % v
    roofCol = ROOF_LIST[(v * 2 + 3) % 5]; wall = WALL_TINTS[(v * 3 + 1) % len(WALL_TINTS)]
    frame = C['timber']
    new_asset('home', dict(wall=wall, wallLo=mix(mul(wall, 0.93), '#efdcc4', 0.35), frame=frame, frameLo=C['woodDark'], paper=C['paper']))
    det = DETAIL[str(v)]; yd = YARD[str(v)]; picks = yd['flowerPicks']
    w, d, h, y0, zc = 2.3, 1.7, 1.5, 0.3, -0.52
    side = 1 if v & 1 else -1
    koshi = '#c9a27a' if v % 3 == 0 else None
    F.push((0, 0, zc))
    foundation(w, d, y0, pad=0.14, seed=v + 1, color='#a89ca8', gap=1.05)
    walls(dict(w=w, d=d, h=h, y0=y0, plaster=wall, frame=frame, koshi=koshi, koshiSkip='f', rail=not koshi, railAt=0.36))
    blk = dict(w=w, d=d)
    dx = side * 0.42
    yb_w, yt_w = -0.0, h            # (the wall's foot and head in a frame at height y: y0 - y, y0 + h - y)
    # ---- the front door, its noren
    with on_face(blk, 'f', dx, y0):
        door_slide(0.9, 1.28, 'lattice' if v % 2 else 'shoji', wd=C['woodLight'], frame=frame)
        door_pulls(0.9, 1.28)
        if v % 3 != 1:
            noren2(0.84, 0.42, 1.34, 0.16, [C['indigo'], '#7a4a6a', '#3f6f5a', '#8a5040'][v % 4], ['sakura', 'leaf', 'flower', 'heart'][v % 4], 0.18)
    # ---- windows (homes.js homeL2: front shoji, right shoji + flower box, left round, two at the back)
    dress = det['dress']
    def wins(face, u, y, kind, ww, hh, L, box_=False, flowers=None, drop=0.0, back=False, avoid=()):
        with on_face(blk, face, u, y):
            fyb, fyt = y0 - y, y0 + h - y
            if back:                   # (the back wall: the game camera rarely sees it, so the plain window only)
                shoji(ww, hh, frame=frame, cell=0.3); return
            if kind == 'round':
                round_window(ww, frame=frame, fine=True)
                opening_trim(ww * 2, ww * 2, frame, u, L, fyb, fyt, round_=True)
                return
            shoji(ww, hh, frame=frame, box_=box_, flowers=flowers)
            opening_trim(ww, hh, frame, u, L, fyb, fyt, box_=box_, avoid=avoid)
            if dress == 'grille' and not back: grille(ww - 0.06, hh - 0.08, frame)
            elif dress == 'sudare': sudare(ww - 0.02, 0.0 if back else drop, hh / 2 + 0.01, 0.09)
    wins('f', -side * 0.55, y0 + 0.8, 'shoji', 0.78, 0.55, w, drop=0.24 if v % 2 == 0 else 0.0, avoid=(dx - 0.48, dx + 0.48))
    wins('r', -0.1, y0 + 0.84, 'shoji', 0.62, 0.5, d, box_=True, flowers=picks[0:2], drop=0.0)
    wins('l', 0.0, y0 + 0.88, 'round', 0.28, 0.0, d)
    wins('b', 0.4, y0 + 0.84, 'shoji', 0.6, 0.5, w, back=True)
    wins('b', -0.5, y0 + 0.84, 'shoji', 0.5, 0.5, w, back=True)
    if det['patches']:             # (parts.js weatherWalls: a flaked plaster patch low on a side wall)
        fside = 'l' if v % 2 else 'r'
        with on_face(blk, fside, 0.52 if v % 4 < 2 else -0.52, y0 + (0.88 if koshi else 0.5) + 0.1): plaster_patch(0.36, 0.24, seed=v)
    # ---- the roof
    ownType = ['hip', 'irimoya', 'gable', 'irimoya'][v % 4]
    rb = dict(w=w, d=d, y0=y0 + h, over=0.42, gOver=0.3, H=0.95, curve=0.42, lift=0.26, liftW=0.8, thick=0.15, ribW=0.42,
              ribAmp=0.04, course=0.55, courseAmp=0.034, contrast=0.9, rich=1, seed=29 + v * 7, bendUnder=True,
              gable='wood' if v % 4 == 1 else 'plaster', gableColor=wall, gableWood='#9c7458', timber=C['woodDark'],
              moss=moss_of(roofCol))
    info = roof(dict(rb, type=ownType, color=roofCol))
    # moss cushions on the low courses (roofs.js mossClumps: the slate / teal / moss roofs of a middling home)
    if moss_of(roofCol) >= 0.2:
        rng = random.Random(v * 13 + 1)
        for (fx, fz) in ((rng.uniform(-0.9, -0.2) * -side, d / 2 + 0.3),):
            moss_cushion(fx, fz, info['yAt'], 1.0, seed=v * 5 + int(fz * 10), base=roofCol)
    # ---- the porch (engawa) and its lean-to roof on posts
    pd = 0.72
    engawa(-w / 2 - 0.05, w / 2 + 0.05, d / 2, pd, y0 + 0.02, wd=C['woodLight'], beamC=C['woodDark'], seed=8 + v)
    postTop = y0 + h - 0.24
    posts_row([-w / 2 + 0.02, w / 2 - 0.02], d / 2 + pd - 0.06, postTop, frame, r=0.06)
    add(beam(w + 0.1, 0.11, 0.1, (0, postTop - 0.02, d / 2 + pd - 0.06), c=0.025), wood(frame), 'porch')
    pz = d / 2 + pd / 2 - 0.04
    with at((0, 0, pz)):
        porch = roof(dict(type='shed', w=w + 0.05, d=pd, y0=postTop + 0.04, over=0.18, gOver=0.12, H=0.3, curve=0.3, lift=0.14, liftW=0.4,
                          thick=0.1, ribW=0.34, ribAmp=0.032, course=0.0, color=roofCol, rich=1, seed=41 + v, contrast=0.9))
    lantern = C['pink'] if v % 3 == 2 else C['red']
    for sx in (-1, 1): chochin(0.11, 0.22, lantern, cord=0.0, pos=(sx * (w / 2 - 0.3), postTop - 0.06, d / 2 + pd - 0.02), tag='lantern')
    with at((-side * 0.12, postTop - 0.08, d / 2 + pd - 0.06)): furin(['#bfe6ff', '#ffd0e0', '#d8f0c0'][v % 3])
    if v % 2 == 0:
        for i in range(3):
            with at((-side * (0.42 + i * 0.1), postTop - 0.07, d / 2 + pd - 0.07)): persimmon_string(3, seed=v * 3 + i)
    else:
        with at((-side * 0.5, postTop - 0.08, d / 2 + pd - 0.06)): teru(['#ff7a8a', '#6ab0ff', '#ffd24a', '#8fe0c0'][(v >> 1) % 4])
    cx, cz = -side * (w / 2 - 0.02), d / 2 + pd + 0.08
    rain_chain(cx, porch['underAt'](cx, cz - pz), cz, 0.0, color='#c8a060')
    # porch life: a cushion and a tea tray, a pot (pine on odd variants), a crate on some
    with at((-side * 0.36, y0 + 0.02, d / 2 + 0.52), ry=PI if side > 0 else 0.0):
        zabuton(det['zabuton'] or '#e86a6a')
        with at((0.34, 0, 0.02)): tea_tray('porch')
    with at((-side * 0.75, y0 + 0.02, d / 2 + 0.3)):
        if v % 2: bonsai_pot(0.12, '#d4774e', seed=v, tag='porch')
        else: pot_flowers(0.13, 0.19, (picks[2], '#fffaf2'), tag='porch')
    if v % 3 == 0:
        with at((-side * 0.2, y0 + 0.02, d / 2 + 0.22), ry=PI): crate(0.24, '#e2b988', tag='porch', seed=v)
    # weeds at the back wall's foot
    for i, x in enumerate((-0.6, 0.5)):
        tuft((x + 0.05 * math.sin(v + i), 0, -d / 2 - 0.2), 0.9, seed=v * 7 + i, flower='#ffffff' if i == 1 else None)
    smoke = None
    if v % 3 != 2:
        xc, zc_ = side * -0.6, -0.35
        smoke = chimney(xc, zc_, info['yAt'](xc, zc_) - 0.3, info['ridgeY'] - 0.02, 1.0, hat=bool(det['hat']), seed=11 + v)
    F.pop()
    # ---- the yard
    sz = zc + d / 2 + pd
    step_stones(dx, sz + 0.15, dx + side * 0.1, 1.4, 2, seed=40 + v)
    line = v % 3 != 2
    if line:
        with at((-side * 1.34, 0, -0.5), ry=PI / 2):
            laundry(1.3, 1.15, [['#ffffff', '#8fd0ff', '#ff9ec0', '#ffe07a'], ['#fff6ea', '#ffb86a', '#8fe0c0', '#ffffff'], ['#c8a8ff', '#ffffff', '#ff8fb0', '#8fd0ff']][v % 3])
    if v % 4 != 1:
        with at((side * 1.3, 0, -0.55), ry=side * PI / 2): firewood(0.8, 0.4, 0.22, seed=5 + v)
    if v % 2 == 0:
        x0, x1 = (-1.45, -0.3) if side > 0 else (0.3, 1.45)
        with at((0, 0, 1.4)): hedge(x0, x1, 0.34, 0.26, ['#ffb0d0', '#fffaf2'] if v % 4 == 0 else None, seed=v)
    spots = [(side * 1.2, 1.15)] if v % 2 else [(side * 1.2, 1.15), (-side * 1.25, 1.2)]
    if not line: spots.append((-side * 1.25, -1.2))
    fp = 3
    for (x, z), y in zip(spots, yd['yard']):
        fl = [picks[fp % len(picks)], picks[(fp + 1) % len(picks)]] if y['k'] == 0 else [picks[fp % len(picks)], picks[(fp + 1) % len(picks)]]
        yard_prop(y['k'], (x, 0, z), y['yaw'], fl, seed=v * 11 + int(x * 10))
        fp += 2
    if v % 2 == 1:
        with at((-side * 1.2, 0, 1.22), ry=-side * 0.3, s=0.85): mailbox(['#e8403a', '#4a78c8', '#6ab06a', '#e8903a'][(v >> 1) % 4])
    with at((-side * 0.55, 0, 1.15)): flower_patch(0.7, 0.4, 3, (picks[-1], picks[-2], '#fffaf2'))
    if v % 4 == 1:
        with at((side * 1.2, 0, -0.2), ry=PI / 2): bamboo_fence((-0.8, 0), (0.8, 0), 0.55, seed=v)
    kit = KIT_INFO[rp]
    info_out = dict(door=(dx, 0, 1.4), kit_door=kit['door'], ridgeY=round(info['ridgeY'], 3), height=round(info['ridgeY'] + 0.3, 3), kit_height=kit['height'],
                    smoke=(round(smoke[0], 3), round(smoke[1], 3), round(smoke[2] + zc, 3)) if smoke else None, kit_smoke=kit['smoke'],
                    light=(0, 1.35, round(zc + d / 2 + pd + 0.2, 3)), kit_light=kit['lights'])
    return A, info_out, kit['seed']

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
    for o in A.objs.values():
        for vv in o['v']: lo = Vector(map(min, lo, vv)); hi = Vector(map(max, hi, vv))
    print('H2 %s tris %d %s' % (name, A.tris(), {k: A.tris(k) for k in A.objs}))
    print('H2 %s parts %s' % (name, dict(sorted(A.count.items(), key=lambda kv: -kv[1]))))
    print('H2 %s bounds game x %.3f..%.3f y %.3f..%.3f z %.3f..%.3f' % (name, lo.x, hi.x, lo.z, hi.z, -hi.y, -lo.y))
    for ob in obs: print('H2 %s check %s %s' % (name, ob.name, check(ob)))
    if NOEXPORT: return
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, name + '.blend'))
    for o in bpy.context.scene.objects: o.select_set(o.type == 'MESH')
    out = os.path.join(MODELS, name + '.glb')
    kw = dict(filepath=out, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
              export_attributes=True, export_lights=False, export_cameras=False, export_animations=False,
              export_normals=True, export_texcoords=False, export_materials='EXPORT')
    try: bpy.ops.export_scene.gltf(export_vertex_color='ACTIVE', **kw)
    except TypeError as e:
        print('H2 export_vertex_color rejected:', e); bpy.ops.export_scene.gltf(export_colors=True, **kw)
    print('H2 wrote', out, os.path.getsize(out))

pieces = list(range(8)) if PIECE == 'all' else [int(p.split(':')[-1]) for p in PIECE.split(',')]
for v in pieces:
    asset, info, kseed = build_home2(v)
    finish(asset, seed=kseed, amt=0.05)          # (the kit's warp(g, B.seed, 0.05): the same leans and sags as the kit model)
    print('H2 home-2-v%d info %s' % (v, info))
    export_piece(asset, 'home-2-v%d' % v)
