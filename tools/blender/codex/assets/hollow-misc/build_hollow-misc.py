# PAWHAVEN hollow-misc: Blossom Hollow's arched taiko bridge, the fence (4 variants) and the flower bed (2 variants),
# built in Blender by script.
#   blender --background --factory-startup --python build_hollow-misc.py -- --piece bridge|fence|flowerBed|all
# Deterministic (seeded PRNGs only). Frame: 1 unit = 1 m, Blender Z up, front = -Y (the game's +z, the door side).
# A kit function's local (x, y, z) maps to Blender (x, -z, y). Each piece keeps the kit design's footprint, door, lights
# and front (src/world/buildings/decor.js bridge / fence / fenceSection / flowerBed).
# The bridge's deck top follows bridgeDeckHeight(z) exactly (the player walks on that curve): every plank's top is the
# chord of the curve over its span (<= 1 mm under it), the same as the kit's.
# The shared mesh/paint kit (hd_kit.py) is the village-pieces kit.
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hd_kit import *   # noqa: F401,F403  (bpy, math, random, Vector, Matrix, Asset, Tmp, rbox, lathe, tube, sweep, ...)

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
PIECE = argv[argv.index('--piece') + 1] if '--piece' in argv else 'all'
print('HM build pid', os.getpid())
D2R = math.pi / 180

# ================================================================== generators (from hollow-decor)
def frame_of(nrm):
    z = nrm.normalized(); xa = (X if abs(z.x) < 0.9 else Y).cross(z).normalized(); return xa, z.cross(xa), z

def blossom(c, nrm, r, rot, per=3, notch=0.42, cup=0.22, dome=0.2, petals=5):
    """a petal blossom card: a closed, slightly cupped lens (top + bottom fans), round-tipped notched petals"""
    xa, ya, z = frame_of(nrm); t = Tmp(); ids = []; M = petals * per
    for k in range(M):
        a = rot + TAU * k / M
        f = abs((k % per) / per - 0.5) * 2
        rr = r * (1 - notch * f ** 2)
        ids.append(t.vert(c + (xa * math.cos(a) + ya * math.sin(a)) * rr + z * (cup * r * (rr / r) ** 2)))
    top = t.vert(c + z * r * dome); bot = t.vert(c - z * r * 0.1)
    for k in range(M):
        t.face([top, ids[k], ids[(k + 1) % M]], z); t.face([bot, ids[(k + 1) % M], ids[k]], -z)
    return t

def leaf_card(base, d, up, L, W, cup=0.35):
    """a cupped leaf card (closed lens): base -> tip along d, its face toward up"""
    d = d.normalized(); s = d.cross(up).normalized(); n = s.cross(d).normalized()
    t = Tmp()
    rim = [(0.0, 0.0), (0.3, 0.85), (0.66, 0.7), (1.0, 0.0), (0.66, -0.7), (0.3, -0.85)]
    ids = [t.vert(base + d * (u * L) + s * (w * W * 0.5) + n * (abs(w) * cup * W * 0.5 - 0.12 * W * u)) for u, w in rim]
    top = t.vert(base + d * (0.45 * L) + n * (W * 0.12)); bot = t.vert(base + d * (0.45 * L) - n * (W * 0.1))
    for k in range(6):
        t.face([top, ids[k], ids[(k + 1) % 6]], n); t.face([bot, ids[(k + 1) % 6], ids[k]], -n)
    return t

def blade(base, d, up, L, W):
    """a grass blade: a slim closed lens card, base -> tip"""
    d = d.normalized(); s = d.cross(up).normalized(); n = s.cross(d).normalized(); t = Tmp()
    rim = [(0.0, -0.5), (0.0, 0.5), (0.55, 0.42), (1.0, 0.0), (0.55, -0.42)]
    ids = [t.vert(base + d * (u * L) + s * (w * W)) for u, w in rim]
    top = t.vert(base + d * (0.4 * L) + n * W * 0.25); bot = t.vert(base + d * (0.4 * L) - n * W * 0.2)
    for k in range(5):
        t.face([top, ids[k], ids[(k + 1) % 5]], n); t.face([bot, ids[(k + 1) % 5], ids[k]], -n)
    return t

def chip(c, r, rot, nrm=Z, k=5, squash=1.0, th=0.008):
    """a flat closed lens (a peg head, a nail head)"""
    xa, ya, z = frame_of(nrm); t = Tmp(); ids = []
    for i in range(k):
        a = rot + TAU * i / k
        ids.append(t.vert(c + xa * (math.cos(a) * r) + ya * (math.sin(a) * r * squash)))
    top = t.vert(c + z * th); bot = t.vert(c - z * th * 0.5)
    for i in range(k):
        t.face([top, ids[i], ids[(i + 1) % k]], z); t.face([bot, ids[(i + 1) % k], ids[i]], -z)
    return t

def fib_dirs(n, zmin=-0.2, seed=0):
    out = []; ga = math.pi * (3 - math.sqrt(5)); ph = seed * 1.37
    for i in range(n):
        zz = 1 - (i + 0.5) / n * (1 - zmin); rr = math.sqrt(max(0.0, 1 - zz * zz)); a = i * ga + ph
        out.append(Vector((math.cos(a) * rr, math.sin(a) * rr, zz)))
    return out

def tube_lite(path, rad, K=5, flat=False):
    """a closed tube along path: one ring per point; pole caps pushed out along the ends (flat=True: the poles sit on the
    end points, a flat cut end)"""
    F = frames(path); n = len(path); rings, cs = [], []
    for i, (p, (T, W, U)) in enumerate(zip(path, F)):
        r = rad(i / (n - 1))
        rings.append([p + W * (r * math.cos(TAU * k / K)) + U * (r * math.sin(TAU * k / K)) for k in range(K)]); cs.append(p)
    t = Tmp()
    if flat: ring_surface(t, rings, cs, path[0].copy(), path[-1].copy())
    else: ring_surface(t, rings, cs, path[0] - F[0][0] * rad(0.0) * 0.7, path[-1] + F[-1][0] * rad(1.0) * 0.8)
    return t

def ring_flat(c, r0, r1, K, z=0.0):
    """a flat open annulus facing up (a ripple)"""
    t = Tmp(); a = [t.vert(c + Vector((math.cos(TAU * k / K) * r0, math.sin(TAU * k / K) * r0, z))) for k in range(K)]
    b = [t.vert(c + Vector((math.cos(TAU * k / K) * r1, math.sin(TAU * k / K) * r1, z))) for k in range(K)]
    for k in range(K): t.face([a[k], a[(k + 1) % K], b[(k + 1) % K], b[k]], Z)
    return t

def cushion(c, r, h, seed=0, K=10, lobes=4, amp=0.18):
    ph = seed * 1.7
    t = lathe([(0.0, 0.0), (r, 0.0), (r * 0.96, h * 0.35), (r * 0.78, h * 0.75), (r * 0.42, h * 0.97), (0.0, h)], K, th0=ph,
              rfn=lambda rr, z, th: rr * (1 + amp * math.cos(lobes * th + ph) + 0.06 * math.sin(3 * th + seed)))
    return t.xform(Matrix.Translation(c))

class XA:
    """draw into asset A through a matrix: colours are painted in the part's own frame, then it is moved"""
    def __init__(self, A, M, obj=None): self.A, self.M, self.obj = A, M, obj
    def add(self, obj, mat, t, col, tag=None):
        t.orient(); t.normals()
        cols = [col(p, n) if callable(col) else col for p, n in zip(t.v, t.n)]
        t.xform(self.M); it = iter(cols)
        return self.A.add(self.obj or obj, mat, t, lambda p, n: next(it), tag)

import hd_kit
_make_mat = hd_kit.make_mat
def make_mat_vc(name, factor=None, emission=None):
    """hd_kit's make_mat, but a glow material takes the vertex colours as base and emission (the game reads them)"""
    if emission is None: return _make_mat(name, factor)
    mt = bpy.data.materials.new(name); mt.use_nodes = True; nt = mt.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Roughness'].default_value = 0.8; bsdf.inputs['Metallic'].default_value = 0.0
    vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'
    nt.links.new(vc.outputs['Color'], bsdf.inputs['Base Color']); nt.links.new(vc.outputs['Color'], bsdf.inputs['Emission Color'])
    bsdf.inputs['Emission Strength'].default_value = 3.0
    return mt
hd_kit.make_mat = make_mat_vc

# ================================================================== palette and painters
LDIR = Vector((-0.35, -0.55, 0.76)).normalized()
CAMV = Vector((0, -0.62, 0.78)).normalized()     # toward the game camera (45 deg down, from the front)
MOSS = '#79a446'; MOSS_HI = '#a3c866'; MOSS_LO = '#557f36'
STN = '#c4bcc0'; STN_HI = '#e2dcd8'; STN_LO = '#7a7084'
GREENS = ['#4f9a48', '#6aae50', '#5aa04a', '#7cbc58']
SOIL = '#6b5546'

def moss_col(seed=3):
    def f(p, n):
        c = mix(MOSS_LO, MOSS, smooth(-0.15, 0.45, n.z))
        c = mix(c, MOSS_HI, smooth(0.55, 0.95, n.z) * 0.85)
        c = mul(c, 0.86 + 0.18 * clamp(n.dot(LDIR) * 0.5 + 0.5))
        g = vnoise(p, 9, seed)
        return mix(c, MOSS_HI, clamp((g - 0.55) * 2.0) * 0.35)
    return f

def stone_col(base=STN, hi=STN_HI, lo=STN_LO, ao_z=None, ao_h=0.12, ao_k=0.28, seed=0, nzf=6.0, nza=0.07, under=0.32):
    def f(p, n):
        up = n.z
        c = mix(base, hi, smooth(0.15, 1.0, up) * 0.8) if up >= 0 else mix(base, lo, clamp(-up) * under * 2.2)
        if ao_z is not None: c = mul(c, 1 - ao_k * (1 - smooth(0.0, ao_h, p.z - ao_z)))
        return mul(c, 1 + nza * (vnoise(p, nzf, seed) - 0.5) * 2)
    return f

def leaf_tone(tone, b, L, lo=0.74):
    def f(p, n):
        k = clamp((p - b).length / max(L, 1e-6))
        return mul(mix(mul(tone, lo), tone, smooth(0.0, 0.6, k)), 0.95 + 0.1 * clamp(n.z))
    return f

def bronze_col(p, n):
    c = mix('#9c7a3c', '#4e3818', clamp(-n.z * 1.4 + 0.35) * 0.8)
    c = mix(c, '#f0cf7e', clamp(n.z * 1.5 - 0.35) * 0.8)
    if 0.6 < n.z < 0.9: c = mix(c, '#fff0c4', 0.35)
    return c

def gold_col(p, n):
    return mix(mix('#c8902c', '#f4c04a', smooth(-0.4, 0.4, n.z)), '#fff0b0', smooth(0.6, 1.0, n.z) * 0.6)

# ================================================================== flowers (flower bed, fence bush, bridge boxes)
def daisy(c, nrm, r, rot):
    return blossom(c, nrm, r, rot, per=3, notch=0.45, cup=0.18, dome=0.12, petals=6)

def tulip(c, r, h, rot):
    """a tulip cup: a lobed lathe whose rim rises into three petal points, a dimple inside"""
    t = Tmp(); K = 6
    prof = [(r * 0.25, -h * 0.45), (r * 0.85, -h * 0.25), (r, h * 0.12), (r * 0.82, h * 0.5), (r * 0.42, h * 0.3)]
    rings, cs = [], []
    for j, (rr, z) in enumerate(prof):
        ring = []
        for k in range(K):
            a = rot + TAU * k / K
            dz = (h * 0.16 if k % 2 == 0 else -h * 0.04) if j == 3 else 0.0
            ring.append(c + Vector((math.cos(a) * rr, math.sin(a) * rr, z + dz)))
        rings.append(ring); cs.append(c + Vector((0, 0, z)))
    ring_surface(t, rings, cs, c + Vector((0, 0, -h * 0.55)), c + Vector((0, 0, h * 0.18)))
    return t

def bloom(A, OB, kind, p, color, rot, mat='leaf', tag='flowers', size=1.0):
    """one flower head at p: 'blossom' (five petals), 'daisy', 'tulip' or 'cluster' (forget-me-nots)"""
    nrm = Z.lerp(CAMV, 0.45).normalized()
    eye = '#ffd24a' if color.lower() not in ('#ffd24a',) else '#ff9a3a'
    if kind == 'tulip':
        r = 0.04 * size; pc = p.copy()
        A.add(OB, mat, tulip(p, r, 0.07 * size, rot),
              lambda q, n: mul(mix(mul(color, 0.8), color, smooth(-0.03, 0.02, q.z - pc.z)), 0.94 + 0.12 * clamp(n.z)), tag)
        return
    if kind == 'cluster':
        for j, d in enumerate(fib_dirs(3, zmin=0.35, seed=int(rot * 10))):
            q = p + d * 0.024 * size; qc = q.copy()
            A.add(OB, mat, blossom(q, d.lerp(nrm, 0.5).normalized(), 0.028 * size, rot + j, per=2, notch=0.3, cup=0.3, dome=0.3),
                  lambda v, n, qc=qc: mix('#fff6d8', color, smooth(0.004, 0.011, (v - qc).length)), tag)
        return
    if kind == 'daisy':
        r = 0.05 * size
        A.add(OB, mat, daisy(p, nrm, r, rot), lambda q, n: mix(mul(color, 0.9), color, smooth(0.01, 0.03, (q - p).length)), tag)
    else:
        r = 0.052 * size
        A.add(OB, mat, blossom(p, nrm, r, rot, per=3, notch=0.4, cup=0.3, dome=0.18),
              lambda q, n: mix(mix(color, '#fff6ea', 0.22), color, smooth(0.012, 0.04, (q - p).length)), tag)
    A.add(OB, mat, ellipsoid(p + nrm * r * 0.16, (r * 0.32, r * 0.32, r * 0.2), K=5, J=2), eye, tag)

def rosette(A, OB, c, rng, n=4, L=0.13, mat='leaf', tag='leaves', el=0.5):
    """a rosette of cupped leaves arcing up and out from c"""
    ph = rng.uniform(0, TAU)
    for i in range(n):
        a = ph + TAU * i / n + rng.uniform(-0.25, 0.25)
        m = Vector((math.cos(a), math.sin(a), 0)); e = el + rng.uniform(-0.15, 0.15)
        d = m * math.cos(e) + Z * math.sin(e); up = (Z * math.cos(e) - m * math.sin(e)).lerp(Z, 0.2).normalized()
        LL = L * rng.uniform(0.85, 1.15); tone = rng.choice(GREENS)
        A.add(OB, mat, leaf_card(c, d, up, LL, LL * 0.55, cup=0.4), leaf_tone(tone, c, LL), tag)

def tuft(A, OB, c, rng, n=3, L=0.12, mat='leaf', tag='grass'):
    ph = rng.uniform(0, TAU)
    for i in range(n):
        a = ph + TAU * i / n + rng.uniform(-0.3, 0.3); m = Vector((math.cos(a), math.sin(a), 0))
        e = 1.15 + rng.uniform(-0.15, 0.2); d = m * math.cos(e) + Z * math.sin(e)
        LL = L * rng.uniform(0.8, 1.15)
        A.add(OB, mat, blade(c + m * 0.008, d, m.cross(Z).cross(d).normalized() * -1, LL, 0.022),
              leaf_tone(rng.choice(['#6aae50', '#7cbc58', '#5aa04a']), c, LL, lo=0.7), tag)

def leaf_bush(A, OB, c, rb, n, seed, mat='leaf', tag='bush'):
    """a leaf-card bush: outward cupped leaves over a dome, an inner darker layer so it never reads see-through"""
    rng = random.Random(seed)
    for i, d in enumerate(fib_dirs(n, zmin=-0.1, seed=seed)):
        inner = i % 5 == 4
        hl = math.hypot(d.x, d.y)
        m = Vector((d.x, d.y, 0)).normalized() if hl > 1e-3 else Vector((math.cos(i), math.sin(i), 0))
        T = (m * d.z - Z * hl) if hl > 0.2 else m
        dd = (T * 0.6 + d * 0.4 + Vector((rng.uniform(-.15, .15), rng.uniform(-.15, .15), 0))).normalized()
        b = c + Vector((d.x * rb * 0.4, d.y * rb * 0.4, d.z * rb * 0.5)) * (0.6 if inner else 1.0) + Z * rb * 0.3
        L = rb * (0.85 if inner else 1.0) * rng.uniform(0.9, 1.1)
        up = d.lerp(Z, 0.3).normalized()
        tone = mix('#3f7e3c', '#5aa84a', 0.35) if inner else mix('#5aa84a', '#9ad06a', clamp(0.15 + 0.7 * d.z + rng.uniform(-0.15, 0.15)))
        A.add(OB, mat, leaf_card(b, dd, up, L, L * 0.6), leaf_tone(tone, b, L, lo=0.82), tag)

# ================================================================== 1. the arched bridge (decor.js bridge)
BR_HALF, BR_END, BR_PEAK = 4.5, 0.9, 1.42
def dh(s):
    """bridgeDeckHeight (decor.js): the walkable deck top at span coordinate s (Blender y = -kit z; the curve is even)"""
    u = min(1.0, abs(s) / BR_HALF); return BR_END + (BR_PEAK - BR_END) * (1 - u * u)
def dslope(s): e = 1e-4; return (dh(s + e) - dh(s - e)) / (2 * e)
LANTERNS_IN_GLB = False   # (the swinging cord + lanterns are the kit's: catalog glbKeep ['anim'])
XB, XE = 1.14, 1.22                      # rail / beam line and the round end posts (all clear the walkway |x| < 1)
LAC = '#e13c28'; LAC_DK = '#a12c2b'; LAC_HI = '#f46a4c'
PLANKS = ['#efbc80', '#e6b276', '#f2c48a']; SEAM = '#3e261c'; PEG = '#7e6c62'; ROPE = '#d8b878'; ROPE_DK = '#a8844c'
IRON = '#4a4650'; BR_STONES = ['#b6afb4', '#aaa3aa', '#bfb7b0', '#b0a8af', '#bab1a8']

def lac_col(ao_z=None):
    def f(p, n):
        c = mix(LAC, LAC_DK, clamp(-n.z * 1.25 + 0.1))
        c = mix(c, LAC_HI, smooth(0.35, 1.0, n.z) * 0.4)
        c = mul(c, 0.94 + 0.1 * clamp(n.dot(LDIR)))
        if ao_z is not None: c = mul(c, 0.8 + 0.2 * smooth(ao_z, ao_z + 0.6, p.z))
        return c
    return f

def arch_path(x, off, s0, s1, n):
    return [Vector((x, s0 + (s1 - s0) * i / (n - 1), dh(s0 + (s1 - s0) * i / (n - 1)) + off)) for i in range(n)]

def rrect(w, h, r, k=1):
    pts = []; hw, hh = w / 2 - r, h / 2 - r
    for cx, cy, a0 in ((hw, -hh, -math.pi / 2), (hw, hh, 0.0), (-hw, hh, math.pi / 2), (-hw, -hh, math.pi)):
        for j in range(k + 1):
            a = a0 + math.pi / 2 * j / k; pts.append((cx + math.cos(a) * r, cy + math.sin(a) * r))
    return pts

def finial(A, OB, c, big):
    """a bronze giboshi standing at c: a big onion (end posts) or a small acorn (rail posts)"""
    pr = ([(0, 0), (0.2, 0), (0.2, 0.04), (0.15, 0.062), (0.172, 0.14), (0.14, 0.235), (0.06, 0.3), (0.05, 0.355), (0.022, 0.42), (0, 0.45)] if big else
          [(0, 0), (0.12, 0), (0.12, 0.034), (0.09, 0.046), (0.104, 0.09), (0.07, 0.15), (0, 0.2)])
    A.add(OB, 'body', lathe(pr, 10 if big else 7, th0=0.2).xform(Matrix.Translation(c)), bronze_col, 'finials')

def bridge_lantern(A, OB, top, r, h, color):
    """a round ribbed paper lantern hanging from top: a short cord, dark caps, the paper (window_glow)"""
    A.add(OB, 'body', tube_lite([top + Vector((0, 0, 0.004)), top - Vector((0, 0, 0.06))], lambda s: 0.013, K=3), '#3a2c2a', 'lantern_caps')
    z0 = top.z - 0.07; N = 8
    cap = lambda zc, rr: lathe([(0, zc - 0.024), (rr * 0.9, zc - 0.024), (rr, zc), (rr * 0.9, zc + 0.024), (0, zc + 0.024)], 6).xform(Matrix.Translation((top.x, top.y, 0)))
    A.add(OB, 'body', cap(z0, r * 0.44), lambda p, n: mix('#2e2224', '#5a4440', clamp(n.z)), 'lantern_caps')
    A.add(OB, 'body', cap(z0 - h, r * 0.44), lambda p, n: mix('#2e2224', '#5a4440', clamp(n.z)), 'lantern_caps')
    prof = []
    for k in range(N + 1):     # bottom -> top
        u = k / N
        rr = r * (0.36 + 0.64 * math.sin(u * math.pi) ** 0.34) * (1.0 if k % 2 else 0.95)
        prof.append((rr, z0 - h + u * h))
    prof = [(0, z0 - h + 0.01)] + prof + [(0, z0 - 0.01)]
    cc = srgb(color); rib = mul(cc, 0.8); lit = mix(cc, '#fffaf0', 0.3)
    zc = z0 - h / 2
    def f(p, n):
        u = clamp(1 - abs(p.z - zc) / (h / 2))
        on_rib = abs(math.hypot(p.x - top.x, p.y - top.y) - 0) < 1e-9
        k = round((p.z - (z0 - h)) / h * N)
        return mix(cc if k % 2 else rib, lit, u * 0.35 * (k % 2))
    A.add(OB, 'window_glow', lathe(prof, 10, th0=0.1).xform(Matrix.Translation((top.x, top.y, 0))), f, 'lanterns')

def bridge_flower_box(A, OB, M, rng):
    """a bracketed wooden flower box; local frame: centred, its back against x = -0.16, length along y, up z"""
    XL = XA(A, M, OB); L = 1.0
    for z, c in ((-0.068, '#a46d3e'), (0.068, '#b37a48')):
        XL.add(OB, 'body', rbox((0.3, L, 0.13), r=0.03, M=M_at((0, 0, z))),
               lambda p, n, c=c: mul(c, 1.08 if n.z > 0.6 else (1.0 if n.x > 0.6 else 0.84)), 'fbox')
    for y in (-0.34, 0.34):
        XL.add(OB, 'body', rbox((0.322, 0.05, 0.285), r=0.012, M=M_at((0, y, 0))), lambda p, n: mul(IRON, 0.9 + 0.3 * clamp(n.z + 0.3)), 'fbox_iron')
        XL.add(OB, 'body', rbox((0.27, 0.05, 0.035), r=0.0, M=M_at((-0.015, y, -0.16))), IRON, 'fbox_iron')
        XL.add(OB, 'body', rbox((0.035, 0.05, 0.24), r=0.0, M=M_at((-0.165, y, -0.22))), IRON, 'fbox_iron')
        XL.add(OB, 'body', rbox((0.03, 0.045, 0.25), r=0.0, M=M_at((-0.075, y, -0.245), ry=0.72)), IRON, 'fbox_iron')
    XL.add(OB, 'body', rbox((0.26, L - 0.04, 0.03), r=0.0, M=M_at((0, 0, 0.128))), SOIL, 'fbox')
    for y in (-0.22, 0.22):    # a low leafy mound filling the box
        XL.add(OB, 'leaf', cushion(Vector((0, y, 0.13)), 0.17, 0.08, seed=int(y * 10) + 5, K=7, lobes=3, amp=0.12).xform(
            Matrix.Translation((0, 0, 0)) @ Matrix.Scale(1.0, 4)), lambda p, n: mix('#3f7e3c', '#5aa84a', smooth(-0.2, 0.9, n.z)), 'fbox_leaves')
    for i in range(7):         # leaves spilling over the lips, mostly the outer (+x) one
        yy = -0.4 + i * 0.133 + rng.uniform(-0.03, 0.03); out = 1 if i % 3 else -1
        b = Vector((out * 0.1, yy, 0.18)); d = Vector((out * 0.8, rng.uniform(-0.4, 0.4), rng.uniform(-0.35, 0.1)))
        L2 = rng.uniform(0.11, 0.14); tone = rng.choice(GREENS)
        XL.add(OB, 'leaf', leaf_card(b, d, Vector((out * 0.3, 0, 1)).normalized(), L2, L2 * 0.62, cup=0.4), leaf_tone(tone, b, L2), 'fbox_leaves')
    pinks = ['#ff9dc1', '#ffb4d0', '#fff0f4', '#ff8fb6', '#ffc8dc']
    nrm = Vector((0.35, 0, 1)).normalized()
    for i in range(9):         # five-petal blossoms in two staggered rows, faces up and a touch outward
        y = -0.4 + i * 0.1 + rng.uniform(-0.015, 0.015); x = (0.05 if i % 2 else -0.05) + rng.uniform(-0.015, 0.015)
        p = Vector((x, y, 0.215 + (0 if i % 2 else 0.035) + rng.uniform(0, 0.02))); R = rng.uniform(0.07, 0.085)
        col = pinks[i % 5]
        XL.add(OB, 'leaf', blossom(p, nrm, R, rng.uniform(0, TAU), per=2, notch=0.3, cup=0.32, dome=0.15),
               lambda q, n, p=p, col=col, R=R: mix(mix(col, '#fff8f4', 0.35), col, smooth(R * 0.15, R * 0.7, (q - p).length)), 'fbox_flowers')
        XL.add(OB, 'leaf', ellipsoid(p + nrm * 0.012, (0.016, 0.016, 0.01), K=5, J=2), '#ffd24a', 'fbox_flowers')

def bridge_block(A, OB, size, c, tint, rng, seed, moss_top=False, moss_bot=False, shoulder=None):
    def f(p, n):
        k = stone_col(tint, STN_HI, STN_LO, seed=seed, nza=0.05)(p, n)
        if moss_top and n.z > 0.4 and vnoise(p, 5, seed) > 0.35: k = mix(k, moss_col(seed)(p, n), 0.85)
        if moss_bot and n.z < -0.4: k = mix(k, MOSS_LO, 0.8)
        if shoulder is not None:     # soft moss on the outer shoulder (the bank side and the river side), fading inward
            sx, sg = shoulder
            out = max(((p.x - c.x) * math.copysign(1, sx) / (size[0] / 2)) if sx else -1.0, (p.y - c.y) * sg / (size[1] / 2))
            w = smooth(0.2, 0.9, out) * (1.0 if n.z > 0.4 else 0.55) * smooth(-0.1, 0.4, p.z - c.z)
            k = mix(k, moss_col(seed)(p, n), 0.8 * w)
        lift = 0.84 + 0.16 * smooth(-0.4, 0.6, p.z)       # (darker toward the water)
        return mul(k, lift)
    A.add(OB, 'body', rbox(size, r=0.075, M=M_at(c)), f, 'abutments')

def build_bridge():
    A = Asset(); OB = 'bridge'; rng = random.Random(4517)
    # ---- deck: 22 broad honey planks (each top the chord of bridgeDeckHeight over its span), pegged at both ends
    NP = 22; step = 2 * BR_HALF / NP
    for i in range(NP):
        s0 = -BR_HALF + i * step; s1 = s0 + step; sm = (s0 + s1) / 2; z0, z1 = dh(s0), dh(s1)
        ang = math.atan2(z1 - z0, s1 - s0); L = math.hypot(s1 - s0, z1 - z0)
        nrm = Vector((0, -math.sin(ang), math.cos(ang)))
        sag = (dh(sm) - (z0 + z1) / 2) * 0.55     # (lift the chord half its sag: the top within +-0.6 mm of the curve)
        top = Vector((0, sm, (z0 + z1) / 2 + sag))
        wx = 2.08 + rng.uniform(0.0, 0.03); xo = rng.uniform(-0.01, 0.01)
        pc = mul(PLANKS[(i * 7) % 3], 1 + rng.uniform(-0.04, 0.04)); sd = i
        def pf(p, n, pc=pc, sd=sd):
            if n.z > 0.9: c = mul(pc, 1.0 + 0.07 * (vnoise(p, 2.2, sd) - 0.5) * 2)
            else: c = mul(pc, 0.8 if n.z > -0.5 else 0.62)
            return mul(c, 1 - 0.1 * smooth(0.85, 1.05, abs(p.x)))
        A.add(OB, 'body', rbox((wx, L - 0.036, 0.1), r=0.026, M=M_at(top - nrm * 0.05 + Vector((xo, 0, 0)), rx=ang)), pf, 'planks')
        for sx in (-1, 1):
            A.add(OB, 'body', chip(top + Vector((sx * 0.84, rng.uniform(-0.03, 0.03), 0)) + nrm * 0.001, 0.028, rng.uniform(0, 1), nrm=nrm, k=4, th=0.01),
                  lambda p, n: mix(PEG, '#a8988c', clamp(n.z - 0.5)), 'pegs')
    A.add(OB, 'body', sweep(arch_path(0, -0.125, -BR_HALF + 0.02, BR_HALF - 0.02, 17), [(1.0, -0.02), (1.0, 0.02), (-1.0, 0.02), (-1.0, -0.02)]), SEAM, 'seam')
    # ---- side beams: a thick rounded curb at the deck's edge, dark cherry underneath; they end in the end posts
    for sx in (-1, 1):
        A.add(OB, 'body', sweep(arch_path(sx * XB, -0.12, -4.3, 4.3, 13), rrect(0.24, 0.36, 0.075, 1)), lac_col(), 'beams')
    # ---- rails: a thick round top rail and a mid rail, end post to end post
    ZE = BR_HALF - 0.25
    for sx in (-1, 1):
        A.add(OB, 'body', tube_lite(arch_path(sx * XB, 0.76, -ZE, ZE, 13), lambda s: 0.068, K=8), lac_col(), 'rails')
        A.add(OB, 'body', tube_lite(arch_path(sx * XB, 0.42, -ZE, ZE, 13), lambda s: 0.052, K=6), lac_col(), 'rails')
    # ---- rail posts: stout rounded-square, bronze acorn caps; on the far side (-x) three tall ones carry the lantern cord
    PZ = (-2.8, -1.4, 0.0, 1.4, 2.8); TALL = 1.92; tops = {}
    for sx in (-1, 1):
        for s in PZ:
            y = dh(s); tall = sx < 0 and s not in (-1.4, 1.4); t = y + (TALL if tall else 0.9); b = y - 0.04; w = 0.19 if tall else 0.18
            A.add(OB, 'body', rbox((w, w, t - b), r=0.05, M=M_at((sx * XB, s, (t + b) / 2))), lac_col(), 'posts')
            finial(A, OB, Vector((sx * XB, s, t - 0.004)), False)
            if tall:
                tops[s] = Vector((sx * (XB + 0.1), s, t - 0.16))
                for zb in (y + 0.9, t - 0.16):
                    A.add(OB, 'body', rbox((0.222, 0.222, 0.05), r=0.014, M=M_at((sx * XB, s, zb))), bronze_col, 'post_bands')
    # ---- round end posts on the abutments: a dark collar, thick rope lashings, big bronze onion finials
    for s0 in (-1, 1):
        for sx in (-1, 1):
            s = s0 * ZE; y = dh(s); b = 0.74; t = y + 0.94
            prof = [(0, b), (0.158, b), (0.15, t - 0.075), (0.168, t - 0.065), (0.168, t - 0.008), (0.13, t), (0, t)]
            A.add(OB, 'body', lathe(prof, 10, th0=0.13).xform(Matrix.Translation((sx * XE, s, 0))),
                  lambda p, n, t=t: mix(LAC_DK, '#5a1e20', 0.35) if p.z > t - 0.07 else lac_col()(p, n), 'end_posts')
            finial(A, OB, Vector((sx * XE, s, t - 0.004)), True)
            zr = y + 0.1; rp = [(0, zr - 0.04), (0.15, zr - 0.04)]
            for k in range(3):
                zc = zr + k * 0.066
                rp += [(0.176, zc - 0.024), (0.19, zc), (0.176, zc + 0.024)] + ([(0.162, zc + 0.033)] if k < 2 else [])
            rp += [(0.15, zr + 2 * 0.066 + 0.04), (0, zr + 2 * 0.066 + 0.04)]
            def rope_col(p, n, cx=sx * XE, cy=s):
                th = math.atan2(p.y - cy, p.x - cx); w = 0.5 + 0.5 * math.sin(th * 5 + p.z * 95)
                return mul(mix(ROPE_DK, ROPE, 0.45 + 0.55 * w), 0.82 + 0.22 * clamp(n.z * 0.6 + 0.5))
            A.add(OB, 'body', lathe(rp, 10, th0=0.2).xform(Matrix.Translation((sx * XE, s, 0))), rope_col, 'rope')
    # ---- the lantern cord: a sagging dark cord between the tall posts' outer faces, three round paper lanterns per bay.
    # These are the kit's two `anim` nodes (decor.js bridge B.anim 'swing', one per bay: the cord + the lanterns). The catalog
    # keeps them (glbKeep ['anim']) so they sway; the GLB leaves them out unless LANTERNS_IN_GLB.
    LC = ['#fff4e0', '#ffecb0', '#ffd8bc', '#ffecb0', '#fff4e0', '#ffd8bc']
    for bay, (sa, sb) in enumerate(((-2.8, 0.0), (0.0, 2.8)) if LANTERNS_IN_GLB else ()):
        Pa, Pb = tops[sa], tops[sb]
        at = lambda u, Pa=Pa, Pb=Pb: Pa.lerp(Pb, u) - Z * (math.sin(u * math.pi) * 0.3)
        A.add(OB, 'body', tube_lite([at(k / 12) for k in range(13)], lambda s: 0.016, K=4), '#3a2c2a', 'cord')
        for i, u in enumerate((0.24, 0.5, 0.76)):
            bridge_lantern(A, OB, at(u), 0.2 if i == 1 else 0.185, 0.3 if i == 1 else 0.28, LC[bay * 3 + i])
    for s in (-2.8, 0.0, 2.8):       # cord ties round the tall posts
        p = tops[s]
        loop = [Vector((-XB + math.cos(TAU * k / 8) * 0.142, s + math.sin(TAU * k / 8) * 0.142, p.z)) for k in range(8)]
        A.add(OB, 'body', tube_loop(loop, lambda u: 0.017, K=4), '#3a2c2a', 'cord')
    # ---- legs: thick red legs under the posts in broad mossy stone sockets with ripple collars; dark cross beams
    for s in (-2.8, -1.4, 1.4, 2.8):
        y = dh(s); lt = y - 0.26; lb = 0.1
        mossy = [rng.randrange(8)]; mossy += [(mossy[0] + 1) % 8, (mossy[0] + 4 + rng.randrange(2)) % 8]
        for sx in (-1, 1):
            A.add(OB, 'body', rbox((0.22, 0.22, lt - lb), r=0.055, M=M_at((sx * XB, s, (lt + lb) / 2))), lac_col(ao_z=0.1), 'legs')
            sd = rng.randrange(1000)
            prof = [(0, -1.3), (0.31, -1.3), (0.335, -0.02), (0.318, 0.1), (0.25, 0.17), (0, 0.19)]
            def sock(p, n, cx=sx * XB, cy=s, sd=sd, mossy=tuple(mossy)):
                c = stone_col('#aca5ac', '#d2ccca', STN_LO, seed=sd)(p, n)
                th = math.atan2(p.y - cy, p.x - cx); sec = int(round(((th - math.pi / 8) / (math.pi / 4)) % 8)) % 8
                if sec in mossy and -0.2 < p.z < 0.12: c = mix(c, MOSS if sec != mossy[1] else MOSS_LO, 0.85)
                if sec == mossy[0] and n.z > 0.5: c = mix(c, MOSS_HI, 0.75)
                return mul(c, 0.86 + 0.14 * smooth(-0.3, 0.2, p.z))
            A.add(OB, 'body', lathe(prof, 8, th0=math.pi / 8, rfn=lambda r, z, th, sd=sd: r * (1 + 0.025 * math.sin(3 * th + sd))).xform(
                Matrix.Translation((sx * XB, s, 0))), sock, 'sockets')
            A.add(OB, 'body', ring_flat(Vector((sx * XB, s, 0.012)), 0.38, 0.43, 10), '#c4dce8', 'ripples')
        A.add(OB, 'body', rbox((2.46, 0.18, 0.16), r=0.0, M=M_at((0, s, y - 0.36))), lambda p, n: mul(LAC_DK, 0.85 + 0.15 * clamp(n.z + 0.5)), 'cross_beams')
    # ---- abutments: courses of big chunky blocks, joints staggered both ways, each a touch proud or shy of the face; moss
    # along the waterline joint and as soft pads on some top-course shoulders
    courses = [(-0.36, 0.04, [1.05, 0.9, 1.05], [1.1]), (0.04, 0.42, [0.75, 0.8, 0.7, 0.75], [1.1]), (0.42, 0.8, [0.95, 1.1, 0.95], [0.56, 0.54])]
    for sg in (-1, 1):
        zf, zb = 3.62, 4.72
        A.add(OB, 'body', rbox((3.0, zb - zf, 0.96), r=0.0, M=M_at((0, sg * (zf + zb) / 2, -0.85))), stone_col(BR_STONES[1], seed=7), 'abutments')
        pads = 0
        for ci, (z0, z1, ws, ds) in enumerate(courses):
            x = -1.5
            for w in ws:
                zz = zf
                for d in ds:
                    tint = rng.choice(BR_STONES); mossy = rng.random() < (0.4 if ci == 2 else 0.65)
                    jx, jz = rng.uniform(-0.02, 0.02), rng.uniform(-0.025, 0.025)
                    size = (w - 0.04 + rng.uniform(-0.015, 0.015), d - 0.04, z1 - z0 - 0.035)
                    c = Vector((x + w / 2 + jx, sg * (zz + d / 2 + jz), (z0 + z1) / 2))
                    bridge_block(A, OB, size, c, tint, rng, rng.randrange(999), moss_top=(ci == 0 and mossy), moss_bot=(ci == 1 and mossy),
                                 shoulder=(c.x if abs(c.x) > 0.6 else 0.0, sg) if (ci == 2 and mossy) else None)
                    zz += d
                x += w
    # ---- flower boxes on brackets outside the near-side (+x) rail, in the second bay from each end
    for sc in (-2.1, 2.1):
        ang = math.atan(dslope(sc))
        M = Matrix.Translation((XB + 0.12 + 0.16, sc, dh(sc) + 0.02)) @ Matrix.Rotation(ang, 4, 'X')
        bridge_flower_box(A, OB, M, rng)
    return A, (dict(body={}, leaf={}, window_glow=dict(emission='#fbe2a6')) if LANTERNS_IN_GLB else dict(body={}, leaf={}))

def deck_check(A):
    """ray-cast the built deck straight down at a few spans and compare its top with bridgeDeckHeight"""
    from mathutils.bvhtree import BVHTree
    o = A.objs['bridge']; tree = BVHTree.FromPolygons(o['v'], o['f'])
    rows = []
    step = 2 * BR_HALF / 22
    for s in [-BR_HALF + step * (i + 0.5) for i in (0, 2, 5, 8, 10, 11, 13, 16, 19, 21)] + [-BR_HALF + step * 0.25, 0.1]:
        for x in (0.0, 0.6):
            hit = tree.ray_cast(Vector((x, s, 5.0)), Vector((0, 0, -1)))
            z = hit[0].z if hit[0] else float('nan')
            rows.append((s, x, z, dh(s), z - dh(s)))
    for r in rows: print('HM deck s %+.2f x %.1f top %.4f curve %.4f diff %+.4f' % r)
    return rows

# ================================================================== 2. fences (decor.js fence: style ['picket', 'bamboo', 'rail', 'picket'][v % 4])
# One 1 m section along x; posts at x = +-0.5 (shared with the neighbouring piece: identical and symmetric, so two pieces
# side by side, either way round, meet flush on one post); rails and canes end exactly at x = +-0.5.
WOOD_MID = '#9c7458'; PAINT = '#fbf1e2'; GRIME = '#a89070'

def post_col(base, foot='#6e8a4a'):
    def f(p, n):
        c = mix(base, mix(base, '#fff2dc', 0.25), smooth(0.3, 1.0, n.z)) if n.z > 0 else mul(base, 1 + 0.3 * n.z)
        c = mul(c, 0.94 + 0.08 * clamp(abs(n.x) * 0.5 + n.z * 0.5 + 0.3))
        return mix(c, foot, 0.4 * (1 - smooth(0.0, 0.1, p.z)))
    return f

def fence_tufts(A, OB, rng):
    for x in (-0.5, 0.5):
        for sy in (-1, 1):
            tuft(A, OB, Vector((x + rng.uniform(-0.05, 0.05), sy * 0.075, 0.0)), rng, n=3, L=0.11, mat='leaf', tag='grass')

def picket_fence(A, OB, rng, h=0.55):
    for x in (-0.5, 0.5):
        A.add(OB, 'body', rbox((0.11, 0.11, h + 0.15), r=0.026, M=M_at((x, 0, (h + 0.15) / 2 - 0.04))), post_col(WOOD_MID), 'posts')
        A.add(OB, 'body', lathe([(0, h + 0.1), (0.1, h + 0.1), (0.1, h + 0.125), (0, h + 0.235)], 4, th0=math.pi / 4).xform(Matrix.Translation((x, 0, 0))),
              lambda p, n: mul(mix('#7c5a44', '#a98266', smooth(0.0, 1.0, n.z)), 1.0), 'caps')
        A.add(OB, 'body', ellipsoid(Vector((x, 0, h + 0.252)), (0.03, 0.03, 0.028), K=8, J=4), gold_col, 'knobs')
    for z in (h * 0.28, h * 0.72):
        A.add(OB, 'body', rbox((0.9, 0.04, 0.062), r=0.012, M=M_at((0, 0.048, z))), post_col(mul(WOOD_MID, 0.95)), 'rails')
    n = 7
    for i in range(n):
        x = -0.4 + i * 0.8 / (n - 1); ph = h * (0.9 + 0.1 * math.sin(i / (n - 1) * math.pi)) + rng.uniform(-0.008, 0.008)
        hw = 0.038; prof = [(hw, -0.02), (hw, ph - hw)] + [(math.cos(a) * hw, ph - hw + math.sin(a) * hw) for a in
                                                       [math.pi * k / 6 for k in range(1, 6)]] + [(-hw, ph - hw), (-hw, -0.02)]
        # the outline in x (w) and z (u), extruded along +y (the face at y = 0 looks to the front)
        path = [Vector((x, 0.0, 0)), Vector((x, 0.03, 0))]
        def pf(p, nn):
            c = mul(PAINT, 0.95 + 0.06 * clamp(-nn.y)) if abs(nn.y) > 0.5 else mul(PAINT, 0.9 + 0.08 * clamp(nn.z))
            return mix(c, GRIME, 0.55 * (1 - smooth(0.0, 0.085, p.z)))
        t = sweep(path, prof, up=Z, cap=True, inset=0.25, cap_d=0.006)
        # sweep's frame: w along T x U; put the outline in x / z whatever its sign
        A.add(OB, 'body', t, pf, 'pickets')
        for z in (h * 0.28, h * 0.72):
            A.add(OB, 'body', chip(Vector((x, -0.0065, z)), 0.011, 0.4, nrm=-Y, k=4, th=0.006), '#5a5060', 'nails')
    fence_tufts(A, OB, rng)

def cane(A, OB, x, h, r, rng, cut=0.32, K=6):
    """a bamboo cane standing at x: node rings, the top cut on a slant above a node (a pale cut face, a dark hollow)"""
    ph = rng.uniform(0.0, 0.3); zs = [-0.03]
    nodes = [z for z in (0.3 - ph, 0.6 - ph, 0.9 - ph) if 0.08 < z < h - 0.1]
    rows = [(r, -0.03)]
    for zn in nodes: rows += [(r, zn - 0.014), (r * 1.13, zn), (r, zn + 0.014)]
    rows += [(r * 0.98, h)]
    t = Tmp(); rings, cs = [], []
    th0 = rng.uniform(0, 1); dirc = 1 if rng.random() < 0.5 else -1
    for j, (rr, z) in enumerate(rows):
        ring = []
        for k in range(K):
            a = th0 + TAU * k / K; px, py = math.cos(a) * rr, math.sin(a) * rr
            zz = z + (dirc * px * math.tan(cut) if j == len(rows) - 1 else 0.0)
            ring.append(Vector((x + px, py, zz)))
        rings.append(ring); cs.append(Vector((x, 0, z)))
    ring_surface(t, rings, cs, Vector((x, 0, -0.03)), Vector((x, 0, h - 0.012)))
    tone = rng.random()
    lo = mix('#9aae4e', '#c4a850', tone * 0.6); hi = mix('#d8e690', '#f0d888', tone * 0.6); node = mix('#66763a', '#8a6e34', tone * 0.6); cutc = '#f0e4b0'
    nz = list(nodes)
    def f(p, n):
        if p.z > h - 0.06 - r and n.z > 0.5:     # the cut face, dark in the hollow middle
            d = math.hypot(p.x - x, p.y); return mix('#9a8a50', cutc, smooth(0.0, r * 0.8, d))
        c = mix(lo, hi, clamp(n.dot(Vector((-0.6, -0.5, 0.3)).normalized()) * 0.6 + 0.3))
        for zn in nz:
            if abs(p.z - zn) < 0.016: c = mix(c, node, 0.85 if abs(p.z - zn) < 0.005 else 0.4)
        return mix(c, '#6e7a40', 0.5 * (1 - smooth(0.0, 0.1, p.z)))
    A.add(OB, 'body', t, f, 'canes')

def rail_cane(A, OB, z, y, r, rng, K=6):
    """a horizontal bamboo rail from x = -0.5 to 0.5, cut flat at both ends (meets the next piece's rail flush)"""
    xs = [-0.5]; nodes = [-0.22 + rng.uniform(-0.03, 0.03), 0.18 + rng.uniform(-0.03, 0.03)]
    for xn in nodes: xs += [xn - 0.012, xn, xn + 0.012]
    xs += [0.5]
    path = [Vector((xx, y, z)) for xx in xs]
    rad = lambda u, xs=xs: r * (1.12 if any(abs(xs[min(len(xs) - 1, int(round(u * (len(xs) - 1))))] - xn) < 1e-6 for xn in nodes) else 1.0)
    t = tube_lite(path, rad, K=K, flat=True)
    nodes_x = list(nodes)
    A.add(OB, 'body', t, lambda p, n: mix(mix(mix('#8ea24a', '#d0de88', clamp(n.z * 0.6 + 0.4)), '#66763a', 0.6 if any(abs(p.x - xn) < 0.004 for xn in nodes_x) else 0.0), '#efe2a8', 0.6 if abs(abs(p.x) - 0.5) < 1e-4 else 0.0), 'rails')

def bamboo_fence(A, OB, rng, h=0.8):
    n = 9
    for i in range(n):
        x = -0.5 + (i + 0.5) / n
        cane(A, OB, x, h + rng.uniform(-0.03, 0.03), 0.045 + rng.uniform(-0.002, 0.003), rng)
    for z in (h * 0.3, h * 0.75):
        y = -0.072
        rail_cane(A, OB, z, y, 0.03, rng)
        for i in range(0, n, 2):    # black cord tied in an X where the rail crosses every other cane
            x = -0.5 + (i + 0.5) / n
            for rz in (0.75, -0.75):
                A.add(OB, 'body', rbox((0.085, 0.018, 0.02), r=0.0, M=M_at((x, y - 0.024, z), ry=rz)), '#3a2a2a', 'cord')
            A.add(OB, 'body', rbox((0.03, 0.09, 0.022), r=0.0, M=M_at((x, -0.035, z))), '#3a2a2a', 'cord')
    for x in (-0.44, 0.44):
        tuft(A, OB, Vector((x, -0.07, 0.0)), rng, n=3, L=0.1)

def rail_fence(A, OB, rng, h=0.55):
    for x in (-0.5, 0.5):        # stout round posts, the bark painted, a pale end-grain top
        A.add(OB, 'body', lathe([(0, -0.04), (0.068, -0.04), (0.066, h + 0.06), (0.054, h + 0.09), (0, h + 0.096)], 8, th0=math.pi / 8,
                                rfn=lambda r, z, th: r * (1 + 0.04 * math.sin(4 * th) * (0 if r < 0.06 else 1))).xform(Matrix.Translation((x, 0, 0))),
              lambda p, n, x=x: mul(post_col('#8a6448')(p, n), 0.92 + 0.12 * math.sin(math.atan2(p.y, p.x - x) * 5)), 'posts')
        # the sawn end: a flat pale end-grain disc with a darker ring, its own verts (a crisp edge, not a dome)
        A.add(OB, 'body', lathe([(0, h + 0.084), (0.058, h + 0.084), (0.056, h + 0.097), (0.03, h + 0.1), (0, h + 0.1)], 8, th0=math.pi / 8).xform(Matrix.Translation((x, 0, 0))),
              lambda p, n, x=x: mix('#b08458', mix('#e8c08a', '#f4d4a0', 0.5 + 0.5 * math.cos(math.hypot(p.x - x, p.y) * 160)), smooth(0.5, 0.9, n.z) * (1 - smooth(0.045, 0.056, math.hypot(p.x - x, p.y)))), 'posts')
    prof = [(0.022, -0.046), (0.022, 0.046), (-0.004, 0.046), (-0.034, 0.033), (-0.047, 0.0), (-0.034, -0.033), (-0.004, -0.046)]
    for z, sag in ((h * 0.36, 0.018), (h * 0.8, 0.026)):
        y = -0.11; e = 0.008
        path = [Vector((-0.5 + e + (1 - 2 * e) * k / 8, y + 0.006 * math.sin(k * 1.7 + z * 9), z - math.sin(k / 8 * math.pi) * sag)) for k in range(9)]
        def rf(p, n):
            front = clamp(-n.y)
            c = mix(mix('#6e4c38', '#9a7050', clamp(n.z * 0.6 + 0.4)), mix('#c89a70', '#e2b88a', clamp(n.z + 0.3)), smooth(0.6, 0.85, front))
            if abs(abs(p.x) - 0.5) < 0.02 and abs(n.x) > 0.7: c = '#e8c08a'
            return mul(c, 0.94 + 0.1 * vnoise(Vector((p.x * 6, p.y, p.z)), 3, 5))
        A.add(OB, 'body', sweep(path, prof, up=Z, cap=True, inset=0.3, cap_d=e), rf, 'rails')
        for x in (-0.5, 0.5):     # a rope lashing round post and rail
            # a tight stadium hugging the post's back and the rail's front, tilted a touch (a diagonal wrap)
            loop = [Vector((x + math.cos(a) * 0.086, math.sin(a) * 0.086, 0)) for a in [math.pi * k / 5 for k in range(6)]] +                    [Vector((x + math.cos(a) * 0.07, y + math.sin(a) * 0.065, 0)) for a in [math.pi + math.pi * k / 5 for k in range(6)]]
            tilt = 0.018 * (1 if x > 0 else -1)
            loop = [Vector((q.x, q.y, z + tilt * (q.x - x) / 0.086)) for q in loop]
            A.add(OB, 'body', tube_loop(loop, lambda u: 0.019, K=5), lambda p, n: mul(mix(ROPE_DK, ROPE, 0.5 + 0.5 * math.sin(p.x * 80 + p.y * 80)), 0.85 + 0.2 * clamp(n.z + 0.4)), 'rope')
    fence_tufts(A, OB, rng)

def build_fence(v):
    A = Asset(); OB = 'fence'; rng = random.Random(300 + v)
    style = ['picket', 'bamboo', 'rail', 'picket'][v % 4]
    if style == 'picket': picket_fence(A, OB, rng)
    elif style == 'bamboo': bamboo_fence(A, OB, rng)
    else: rail_fence(A, OB, rng)
    if v % 4 == 3:          # the kit's v3: the picket fence with a little flowering bush in front (kit (0.2, 0, 0.2))
        c = Vector((0.2, -0.2, 0.0))
        leaf_bush(A, OB, c, 0.15, 17, seed=33)
        for j, d in enumerate(fib_dirs(5, zmin=0.2, seed=2)):
            bloom(A, OB, 'blossom', c + Vector((0, 0, 0.13)) + d * 0.11, '#ff8fb0', j * 1.3, size=0.8)
    return A, dict(body={}, leaf={})

# ================================================================== 3. flower beds (decor.js flowerBed: stone ring v % 2 = 0, planked box 1)
BED_PAL = [[('blossom', '#ff8fb0'), ('daisy', '#fff4ec'), ('tulip', '#ffd24a')],
           [('blossom', '#c8a8ff'), ('cluster', '#8fc8ff'), ('daisy', '#fff4ec')]]

def bed_flowers(A, OB, rng, pal, z0):
    """ten clumps filling the soil: a leaf rosette and two or three flower heads each"""
    spots = [Vector((0.03, 0.02, 0))] + [Vector((math.cos(a) * 0.15, math.sin(a) * 0.15, 0)) for a in [TAU * k / 3 + 0.5 for k in range(3)]] + \
            [Vector((math.cos(a) * 0.29, math.sin(a) * 0.29, 0)) for a in [TAU * k / 6 + 0.1 for k in range(6)]]
    for ci, sp in enumerate(spots):
        sp = sp + Vector((rng.uniform(-0.03, 0.03), rng.uniform(-0.03, 0.03), 0))
        gz = z0 - 0.04 * (sp.length / 0.3) ** 2
        c = Vector((sp.x, sp.y, gz))
        rosette(A, OB, c, rng, n=4 if ci else 5, L=0.15, el=0.4)
        kind, color = pal[ci % 3]
        nh = 3 if ci == 0 else 2 + (ci % 3 == 1)
        for j in range(nh):
            a = rng.uniform(0, TAU); off = Vector((math.cos(a), math.sin(a), 0)) * rng.uniform(0.02, 0.06)
            hgt = rng.uniform(0.13, 0.22) + (0.06 if ci < 4 else 0)
            p = c + off + Vector((0, 0, hgt))
            A.add(OB, 'leaf', tube_lite([c + off * 0.5, p - Vector((0, 0, 0.01))], lambda s: 0.009, K=3), '#4a8a3a', 'stems')
            k2, c2 = (kind, color) if j < 2 else pal[(ci + 1) % 3]
            bloom(A, OB, k2, p, c2, rng.uniform(0, TAU), size=rng.uniform(1.15, 1.35))

def plant_marker(A, OB, color):
    M = Matrix.Translation((0.24, -0.27, 0.0)) @ Matrix.Rotation(-0.3, 4, 'Z'); XL = XA(A, M, OB)
    XL.add(OB, 'body', rbox((0.03, 0.022, 0.26), r=0.008, M=M_at((0, 0, 0.11))), post_col('#c98f5e'), 'marker')
    XL.add(OB, 'body', rbox((0.12, 0.024, 0.075), r=0.012, M=M_at((0, -0.012, 0.24))), lambda p, n: mul('#fff2e0', 0.9 + 0.1 * clamp(-n.y)), 'marker')
    XL.add(OB, 'leaf', blossom(Vector((0, -0.026, 0.24)), -Y, 0.026, 0.3, per=2, notch=0.4, cup=0.1, dome=0.1), color, 'marker')

def soil_mound(A, OB, sx=1.0, e=2.0):
    prof = [(0, -0.02), (0.42, -0.02), (0.41, 0.05), (0.34, 0.09), (0.2, 0.118), (0, 0.13)]
    A.add(OB, 'body', lathe(prof, 16 if e > 2 else 14, sx=sx, sy=sx, e=e, th0=(math.pi / 16 if e > 2 else 0.0), rfn=lambda r, z, th: r * (1 + 0.02 * math.sin(5 * th))),
          lambda p, n: mul(mix(mul(SOIL, 0.85), mix(SOIL, '#8a6a56', 0.4), smooth(0.2, 1.0, n.z)), 0.9 + 0.18 * vnoise(p, 14, 3)), 'soil')

def build_flowerBed(v):
    A = Asset(); OB = 'flowerBed'; rng = random.Random(700 + v)
    stone = v % 2 == 0
    if stone:
        n = 16
        for i in range(n):
            a = i / n * TAU + rng.uniform(-0.05, 0.05); big = i % 2 == 0; r = 0.1 if big else 0.078
            sd = rng.randrange(999); mossy = rng.random() < 0.45
            prof = [(0, -0.02), (r * 0.95, -0.02), (r, r * 0.3), (r * 0.72, r * 0.62), (0, r * 0.74)]
            t = lathe(prof, 7, sx=1.25, sy=0.95, th0=rng.uniform(0, 1), rfn=lambda rr, z, th, sd=sd: rr * (1 + 0.08 * math.sin(3 * th + sd) + 0.05 * math.sin(2 * th + sd * 0.7)))
            t.xform(M_at((math.cos(a) * 0.43, math.sin(a) * 0.43, 0), rz=a))
            base = rng.choice(['#bdb2ba', '#b0a6b2', '#c4bab0', '#b8acb6', '#aaa2b4'])
            def sf(p, nn, base=base, sd=sd, mossy=mossy):
                c = stone_col(base, mix(base, '#e4dcd8', 0.4), '#6e647a', ao_z=0.0, ao_h=0.05, ao_k=0.25, seed=sd, under=0.4)(p, nn)
                if mossy and nn.z > 0.45: c = mix(c, mul(moss_col(sd)(p, nn), 0.82), 0.65 * smooth(0.3, 0.6, vnoise(p, 18, sd)))
                return c
            A.add(OB, 'body', t, sf, 'stones')
            if not big and rng.random() < 0.4:
                tuft(A, OB, Vector((math.cos(a) * 0.5, math.sin(a) * 0.5, 0.0)), rng, n=2, L=0.13)
        soil_mound(A, OB)
    else:
        wood = '#c98f5e'
        for k in range(4):
            R = Matrix.Rotation(k * math.pi / 2, 4, 'Z')
            for row in range(2):
                c = '#c48a58' if row == 0 else '#d29a66'
                A.add(OB, 'body', rbox((0.8, 0.065, 0.09), r=0.022, M=R @ M_at((0, -0.43, 0.045 + row * 0.095))),
                      lambda p, n, c=c: mul(c, 1.06 if n.z > 0.6 else (0.82 if n.z < -0.5 else 0.94)), 'planks')
            A.add(OB, 'body', rbox((0.1, 0.1, 0.24), r=0.024, M=R @ M_at((0.43, -0.43, 0.1))), post_col(WOOD_MID), 'posts')
            A.add(OB, 'body', lathe([(0, 0.215), (0.085, 0.215), (0.085, 0.232), (0, 0.29)], 4, th0=math.pi / 4).xform(R @ Matrix.Translation((0.43, -0.43, 0))),
                  lambda p, n: mix('#6b4a3a', '#9a7258', smooth(0.0, 1.0, n.z)), 'caps')
            for x in (-0.3, 0.3):
                for row in (1,):
                    A.add(OB, 'body', chip((R @ Vector((x, -0.4635, 0.045 + row * 0.095))), 0.011, 0.4, nrm=(R.to_3x3() @ -Y), k=4, th=0.006), '#4a4650', 'nails')
        soil_mound(A, OB, sx=0.97, e=3.2)
    pal = BED_PAL[v % 2]
    bed_flowers(A, OB, rng, pal, 0.12)
    plant_marker(A, OB, pal[0][1])
    return A, dict(body={}, leaf={})

# ================================================================== main
def run(name, fn):
    A, mats = fn()
    export(A, name, mats)
    return A

if PIECE in ('all', 'bridge'):
    A = run('bridge', build_bridge)
    deck_check(A)
if PIECE in ('all', 'fence'):
    for v in range(4): run('fence-1-v%d' % v, lambda v=v: build_fence(v))
if PIECE in ('all', 'flowerBed'):
    for v in range(2): run('flowerBed-1-v%d' % v, lambda v=v: build_flowerBed(v))
print('HM done')
