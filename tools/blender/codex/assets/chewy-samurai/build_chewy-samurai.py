"""chewy-samurai: the approved Toybox Chewy (chewy-b) re-dressed as a samurai, Option E "Black and Gold". Phase 1, unrigged.

Blender 4.3:  blender --background --factory-startup --python build_chewy-samurai.py [-- --skip-portrait]

The lock: this script runs base/build_chewy-b.py, a byte-identical copy of the archive (the MD5 is asserted), up to its
pre-join marker, unchanged. It then deletes only the old costume objects (gi, lapels, gi sleeves, pants, sash, kerchief,
hip knot) and builds the new outfit next to the untouched head, face, ears, eyes, arms, wraps, paws, feet and tail.
The atlas keeps every locked chart; the outfit is painted only into the four charts the old costume used.
Units are metres, front is -Y, character left is +X, ground z = 0.
"""
import bpy, bmesh, math, json, os, sys, struct, zlib, hashlib
import numpy as np
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

TASK = os.path.dirname(os.path.abspath(__file__))
BASE = os.path.join(TASK, 'base', 'build_chewy-b.py')
BASE_MD5 = '6dbbb9dcc3055bd6044bfbc826ad4e18'
MODEL = 'D:/projects/chewy-life-3d/public/models/chewy-samurai.glb'
PI = math.pi

# ------------------------------------------------------------------ the outfit palette (all outfit colours live here)
OUTFIT = {
    'haori': '#1E1C22', 'haori_sheen': '#3C3B4A', 'haori_fold': '#4A4959', 'haori_inner': '#18171C', 'haori_edge': '#46454F',
    'collar': '#25232B', 'collar_sheen': '#45434F',
    'gold': '#E8B84A', 'gold_light': '#F3CD6A', 'gold_shade': '#C99936',
    'kimono': '#34303A', 'kimono_sheen': '#4A4652', 'kimono_shade': '#29262E',
    'cream': '#F4ECE0', 'cream_shade': '#E0D3C0', 'blaze': '#EBDDC8',
    'hakama': '#24222A', 'hakama_sheen': '#3D3B47', 'hakama_crease': '#141218', 'hakama_inner': '#151419',
    'cord': '#D8402E', 'cord_light': '#EA5A42', 'cord_shade': '#B3311F',
    'saya': '#1E1C22', 'saya_sheen': '#4A4956', 'saya_mouth': '#141218',
}

# ------------------------------------------------------------------ 1. the locked base, unchanged
src = open(BASE, 'rb').read()
assert hashlib.md5(src).hexdigest() == BASE_MD5, 'base/build_chewy-b.py differs from the archive'
src = src.decode('utf-8')
MARKER = '# Record the actual authored parts before joining, for profile QA.'
ns = {'__file__': BASE, '__name__': 'chewy_b_base'}
exec(compile(src[:src.index(MARKER)], BASE, 'exec'), ns)
parts, mat, CHARTS = ns['parts'], ns['mat'], ns['CHARTS']
rgb, mix, clamp, smooth = ns['rgb'], ns['mix'], ns['clamp'], ns['smooth']
torso_depth_shift = ns['torso_depth_shift']
GI_RINGS = ns['GI_RINGS']

COSTUME = ('gi_soft_flared_shell', 'ivory_under_lapel', 'ivory_right_over_lapel', 'navy_lapel_overlap_below_sash',
           'straight_open_gi_sleeve.', 'open_sleeve_cuff.', 'rounded_hakama.', 'gathered_pants_cuff.', 'red_waist_sash',
           'red_neckerchief_band', 'kerchief_drape_', 'flattened_throat_knot', 'short_triangular_kerchief_tail_', 'left_hip_')
removed = []
for ob in list(parts['body']):
    if ob.name.startswith(COSTUME):
        removed.append(ob.name); parts['body'].remove(ob); bpy.data.objects.remove(ob, do_unlink=True)
assert len(removed) == 23, removed
# Lock record: every remaining authored part, before any join, in metres.
lock = {}
for g, obs in parts.items():
    for ob in obs:
        lock[ob.name] = np.array([v.co[:] for v in ob.data.vertices], np.float64)
np.savez_compressed(os.path.join(TASK, 'lock-parts.npz'), **{k.replace('.', '__'): v for k, v in lock.items()})
LOCKED = {g: [ob.name for ob in obs] for g, obs in parts.items()}

# ------------------------------------------------------------------ helpers
def hexrgb(c): return rgb(OUTFIT.get(c, c))
def v3(p): return Vector((float(p[0]), float(p[1]), float(p[2])))
def nrm(a):
    a = np.asarray(a, np.float64); return a / np.maximum(1e-12, np.linalg.norm(a, axis=-1, keepdims=True))
def sstep(a, b, x):
    t = min(1., max(0., (x - a) / (b - a))); return t * t * (3 - 2 * t)
def interp(z, zs, vs): return float(np.interp(z, zs, vs))

# Outfit atlas charts: carved out of the old costume's four charts (coat, pants, red, navy). (x, y, w, h); y from the bottom.
SUB = {
    'haori': (1024, 1024, 1024, 512),
    'hakama': (0, 640, 512, 384), 'waist': (0, 512, 512, 128),
    'sleeve': (512, 768, 512, 256),
    'collar': (512, 704, 256, 64),
    'kimono': (512, 256, 512, 256),
}
SW = ['sw_haori_in', 'sw_edge', 'sw_gold', 'sw_cream', 'sw_cord', 'sw_saya', 'sw_mouth', 'sw_hakama_in', 'sw_kimono',
      'sw_collar']
for k, name in enumerate(SW):          # 64 px solid swatches in the old red chart's free corner
    SUB[name] = (768 + 64 * (k % 4), 512 + 64 * (k // 4), 64, 64)
for k, r in SUB.items(): CHARTS[k] = r

def make(name, verts, faces, uvs, chart):
    """Through the base's own mesh(): one material, smooth shading, consistent normals, parts['body']."""
    return ns['mesh'](name, [tuple(map(float, v)) for v in verts], faces, uvs, chart, 'body')

def grid_faces(nv, nu, closed_u=False, off=0):
    f = []
    for j in range(nv - 1):
        for i in range(nu - (0 if closed_u else 1)):
            i1 = (i + 1) % nu
            f.append((off + j * nu + i, off + j * nu + i1, off + (j + 1) * nu + i1, off + (j + 1) * nu + i))
    return f

def grid_normals(P, seam=False):
    """Vertex normals of a (nv, nu, 3) grid by central differences; seam = the last column repeats the first."""
    if seam:
        core = P[:, :-1]; du = np.roll(core, -1, 1) - np.roll(core, 1, 1); du = np.concatenate([du, du[:, :1]], 1)
    else:
        du = np.gradient(P, axis=1)
    dv = np.gradient(P, axis=0)
    return nrm(np.cross(du, dv))

def make_uv(name, verts, faces, face_uvs, want=None):
    """Like the base's mesh(), but with final atlas UVs per face corner (UVs travel with loops when normals flip).
    want: one outward direction per face. Open shells can't be oriented by recalc_face_normals (it flipped whole
    haori regions in rounds 1-4), so each face is flipped to agree with its known outside instead."""
    me = bpy.data.meshes.new(name); me.from_pydata([tuple(map(float, v)) for v in verts], [], faces); me.update()
    uv = me.uv_layers.new(name='Atlas')
    for poly, f, pts in zip(me.polygons, faces, face_uvs):
        lookup = dict(zip(f, pts))
        for li in poly.loop_indices: uv.data[li].uv = lookup[me.loops[li].vertex_index]
        poly.use_smooth = True
    bm = bmesh.new(); bm.from_mesh(me)
    if want is None:
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    else:
        bm.faces.ensure_lookup_table(); bm.normal_update()
        flip = [f for f, w in zip(bm.faces, want) if f.normal.dot(Vector(tuple(map(float, w)))) < 0]
        if flip: bmesh.ops.reverse_faces(bm, faces=flip)
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob)
    ob.data.materials.append(mat); parts['body'].append(ob)
    return ob

def thick_shell(name, P, chart, uv_out, thickness, inner_chart, rim_chart, seam=False, rims=('u0', 'u1', 'v0', 'v1'),
                outward=None, rim_bulge=.0045, extra=None, inner_rows=None):
    """A cloth panel with real thickness: outer grid, inner grid offset inward, rolled rims on the open boundaries."""
    au = ns['atlas_uv']
    nv, nu, _ = P.shape
    N = grid_normals(P, seam)
    if outward is not None:
        sgn = np.sign(np.sum(N * outward(P), -1, keepdims=True)); sgn[sgn == 0] = 1; N = N * sgn
    Q = P - N * thickness
    ir = nv if inner_rows is None else inner_rows
    verts = list(P.reshape(-1, 3)) + list(Q.reshape(-1, 3))
    faces, fuv, want = [], [], []
    Nf = N.reshape(-1, 3)
    for f in grid_faces(nv, nu):
        faces.append(f); fuv.append([au(chart, *uv_out[k // nu, k % nu]) for k in f]); want.append(Nf[list(f)].sum(0))
    k0 = nv * nu
    cin = au(inner_chart, .5, .5); crim = au(rim_chart, .5, .5)
    for f in grid_faces(ir, nu, False, k0):
        faces.append(tuple(reversed(f))); fuv.append([cin] * 4); want.append(-Nf[[i - k0 for i in f]].sum(0))
    for which in rims:
        if which == 'v0': ids = [(0, i) for i in range(nu)]
        elif which == 'v1': ids = [(nv - 1, i) for i in range(nu)]
        elif which == 'u0': ids = [(j, 0) for j in range(nv)]
        else: ids = [(j, nu - 1) for j in range(nv)]
        rows = []
        for (j, i) in ids:
            if which in ('v0', 'v1'): d = P[j, i] - P[1 if which == 'v0' else nv - 2, i]
            else: d = P[j, i] - P[j, 1 if which == 'u0' else nu - 2]
            d = d - N[j, i] * np.dot(d, N[j, i]); d = d / max(1e-9, np.linalg.norm(d))
            o, q = P[j, i], Q[j, i]
            rows.append((j * nu + i, len(verts), len(verts) + 1, k0 + j * nu + i, d))
            verts.extend([o * .72 + q * .28 + d * rim_bulge, o * .28 + q * .72 + d * rim_bulge])
        for a, b in zip(rows[:-1], rows[1:]):
            for s_ in range(3):
                faces.append((a[s_], b[s_], b[s_ + 1], a[s_ + 1])); fuv.append([crim] * 4); want.append(a[4] + b[4])
    if extra is not None:
        extra(verts, faces, fuv, P, Q, au)
        want.extend([np.array([0, 0, -1.])] * (len(faces) - len(want)))      # (the hakama's ceiling faces down the leg)
    ob = make_uv(name, verts, faces, fuv, want)
    return ob, N, Q

def sweep(name, centers, across, normal, profile, chart, caps=True, cap_chart=None, vparam=None):
    """Tube along stations; profile = list of (a, n, U): offsets along `across` and `normal`, and the profile's U."""
    centers = np.asarray(centers, np.float64); across = np.asarray(across); normal = np.asarray(normal)
    ns_, npf = len(centers), len(profile)
    vp = np.linspace(0, 1, ns_) if vparam is None else vparam
    verts, faces, uvs = [], [], []
    for k in range(ns_):
        for (a, n, U) in profile:
            aa = a(k / (ns_ - 1)) if callable(a) else a
            nn = n(k / (ns_ - 1)) if callable(n) else n
            verts.append(centers[k] + across[k] * aa + normal[k] * nn)
    for k in range(ns_ - 1):
        for i in range(npf):
            i1 = (i + 1) % npf
            faces.append((k * npf + i, k * npf + i1, (k + 1) * npf + i1, (k + 1) * npf + i))
            U0 = profile[i][2]; U1 = profile[i1][2] if i1 else 1.0
            uvs.append(((U0, vp[k]), (U1, vp[k]), (U1, vp[k + 1]), (U0, vp[k + 1])))
    ob = make(name, verts, faces, uvs, chart)
    if caps:
        me = ob.data; bm = bmesh.new(); bm.from_mesh(me)
        bm.verts.ensure_lookup_table()
        rings_ = [[bm.verts[k * npf + i] for i in range(npf)] for k in (0, ns_ - 1)]
        for k, ring in zip((0, ns_ - 1), rings_):
            if k == 0: ring = ring[::-1]
            c = bm.verts.new(tuple(np.mean([v.co[:] for v in ring], 0)))
            for i in range(npf):
                bm.faces.new((c, ring[i], ring[(i + 1) % npf]))
        bm.to_mesh(me); bm.free()
        uvl = me.uv_layers.active.data; au = ns['atlas_uv']
        nf = len(faces)
        for p in me.polygons:
            if p.index >= nf:
                for li in p.loop_indices: uvl[li].uv = au(cap_chart or chart, .5, .5)
            p.use_smooth = True
        bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:]); bm.to_mesh(me); bm.free()
    return ob

def rrect_profile(w, t, r, n_side=4, n_corner=3, U0=0.):
    """Rounded rectangle cross-section, counter-clockwise from the inner-front corner; returns (a, n, U)."""
    pts = []
    hw, ht = w / 2, t / 2
    corners = [(-hw + r, ht - r, PI / 2, PI), (-hw + r, -ht + r, PI, 1.5 * PI), (hw - r, -ht + r, 1.5 * PI, 2 * PI), (hw - r, ht - r, 0, PI / 2)]
    # start at the front face, inner end, walk: inner edge -> back face -> outer edge -> front face
    seq = []
    for (cx, cy, a0, a1) in corners:
        for k in range(n_corner + 1):
            a = a0 + (a1 - a0) * k / n_corner
            seq.append((cx + r * math.cos(a), cy + r * math.sin(a)))
        # straight side to the next corner is implied; add midpoints
    out = []
    for i in range(len(seq)):
        p = seq[i]; q = seq[(i + 1) % len(seq)]
        out.append(p)
        L = math.hypot(q[0] - p[0], q[1] - p[1])
        if L > 2.5 * r:
            m = max(1, int(L / (w / n_side)))
            for k in range(1, m):
                out.append((p[0] + (q[0] - p[0]) * k / m, p[1] + (q[1] - p[1]) * k / m))
    # perimeter U
    per = [0.]
    for i in range(1, len(out)): per.append(per[-1] + math.hypot(out[i][0] - out[i - 1][0], out[i][1] - out[i - 1][1]))
    tot = per[-1] + math.hypot(out[0][0] - out[-1][0], out[0][1] - out[-1][1])
    return [(a, n, per[i] / tot) for i, (a, n) in enumerate(out)]

def circle_profile(r, k=10, ry=None):
    return [(r * math.cos(2 * PI * i / k), (ry or r) * math.sin(2 * PI * i / k), i / k) for i in range(k)]

def frames_along(points, up_hint=(0, 0, 1)):
    """Parallel-transport frames (tangent, across, normal) along a polyline."""
    P = np.asarray(points, np.float64); n = len(P)
    T = np.gradient(P, axis=0); T = nrm(T)
    a0 = np.cross(T[0], up_hint)
    if np.linalg.norm(a0) < 1e-6: a0 = np.cross(T[0], (1, 0, 0))
    A = [nrm(a0)]
    for k in range(1, n):
        a = A[-1] - T[k] * np.dot(A[-1], T[k]); A.append(nrm(a))
    A = np.array(A); Nn = nrm(np.cross(T, A))
    return T, A, Nn

def catmull_pts(ctrl, n):
    c = ns['catmull']; return [tuple(c(ctrl, t)) for t in np.linspace(0, 1, n)]

# ------------------------------------------------------------------ 2. the body references (locked)
BODY = {ob.name: ob for ob in parts['body']}
def bvh_of(names):
    vs, fs = [], []
    for nm in names:
        ob = BODY[nm]; o = len(vs)
        vs.extend([v.co.copy() for v in ob.data.vertices]); fs.extend([tuple(o + i for i in p.vertices) for p in ob.data.polygons])
    return BVHTree.FromPolygons(vs, fs)
ARM_L = ['upper_arm_skin.L', 'thick_forearm_wrap.L', 'wrist_skin.L', 'large_mitten_paw.L', 'short_thumb_bump.L']
ARM_R = [n.replace('.L', '.R') for n in ARM_L]
bvh_arm_L, bvh_arm_R = bvh_of(ARM_L), bvh_of(ARM_R)
bvh_head = BVHTree.FromObject(parts['head'][0], bpy.context.evaluated_depsgraph_get())
tail_ob = parts['tail'][0]
TAIL = np.array([v.co[:] for v in tail_ob.data.vertices])

# kimono / torso surface = the approved gi body volume (same rings, offset and depth shift), without the gi skirt flare
KZ = [.425, .45] + [p[0] for p in GI_RINGS if p[0] > .47]
KRX = [.228, .226] + [p[1] for p in GI_RINGS if p[0] > .47]
KRY = [.182, .176] + [p[2] for p in GI_RINGS if p[0] > .47]
def torso(a, z):
    rx, ry = interp(z, KZ, KRX), interp(z, KZ, KRY)
    x = rx * math.sin(a); y = ry * math.cos(a) + .011
    return x, y + torso_depth_shift(y, z), z
def torso_front(z): return torso(PI, z)[1]
def torso_back(z): return torso(0, z)[1]

# ------------------------------------------------------------------ 3. the saya (fixed first: the haori's left side clears it)
SAYA_M = np.array([.222, -.214, .440])     # mouth centre (blade entry)
SAYA_T = np.array([.370, .250, .178])      # tip centre (gold cap end)
SAYA_D = nrm(SAYA_T - SAYA_M); SAYA_L = float(np.linalg.norm(SAYA_T - SAYA_M))
SAYA_W, SAYA_H = .0175, .0235              # oval half-sizes: horizontal-across, vertical-ish
SAYA_SIDE = nrm(np.cross(SAYA_D, (0, 0, 1)))
if SAYA_SIDE[0] < 0: SAYA_SIDE = -SAYA_SIDE
SAYA_UP = nrm(np.cross(SAYA_SIDE, SAYA_D))
if SAYA_UP[2] < 0: SAYA_UP = -SAYA_UP
def saya_at_z(z):
    t = (SAYA_M[2] - z) / (SAYA_M[2] - SAYA_T[2]); return SAYA_M + t * (SAYA_T - SAYA_M), t

# ------------------------------------------------------------------ 4. the haori body
HZ = [.264, .29, .32, .35, .38, .41, .44, .48, .52, .56, .60, .63, .647, .656, .662]
#              z    y_front  y_back  X_right X_left  exponent
HT = np.array([
    [.264, -.228, .262, .315, .300, 2.9],
    [.300, -.226, .260, .310, .300, 2.9],
    [.335, -.225, .255, .300, .290, 2.9],
    [.370, -.224, .248, .290, .282, 2.8],
    [.410, -.221, .240, .270, .265, 2.8],
    [.440, -.215, .232, .258, .255, 2.7],
    [.480, -.200, .222, .248, .246, 2.7],
    [.520, -.182, .212, .238, .238, 2.6],
    [.560, -.171, .202, .232, .232, 2.6],
    [.600, -.162, .190, .228, .228, 2.5],
    [.630, -.155, .178, .226, .226, 2.4],
    [.650, -.145, .166, .214, .214, 2.3],
    [.662, -.133, .157, .188, .188, 2.2],
    [.662, -.124, .152, .162, .162, 2.1],
])
_HZF = np.linspace(.20, .72, 521)
_HTF = np.stack([np.interp(_HZF, HT[:, 0], HT[:, k]) for k in range(1, 6)], -1)
_g = np.exp(-.5 * ((_HZF[:, None] - _HZF[None, :]) / .022) ** 2); _g /= _g.sum(1, keepdims=True)
_HTF = _g @ _HTF                                   # smooth profiles: no slope breaks at the table rows
def hring(z):
    return [float(np.interp(z, _HZF, _HTF[:, k])) for k in range(5)]
def opening(z, side):          # half-width of the front opening at the haori's front edges
    lo = .148 if side < 0 else .132
    return .107 + (.118 - .107) * sstep(.662, .60, z) + (lo - .118) * sstep(.55, .264, z)
GAP = .009
def left_limit(z, yc, Yf, Yb, n):
    """The haori's left half-width that keeps its surface GAP inside the saya where the saya crosses height z."""
    if z > SAYA_M[2] + .02 or z < SAYA_T[2]: return 9.
    p, t = saya_at_z(z)
    if not (0 <= t <= 1): return 9.
    yr = p[1] - yc; Y = Yb if yr > 0 else Yf
    f = max(.15, (1 - min(.999, abs(yr / Y)) ** n)) ** (1 / n)
    return (p[0] - SAYA_W * 1.02 - GAP - .002) / f
def _raw_left(z):
    yf, yb, Xr, Xl, n = hring(z)
    yc = (yf + yb) / 2
    return min(Xl, left_limit(z, yc, yc - yf, yb - yc, n))
_ZS = np.linspace(.20, .70, 501); _RAW = np.array([_raw_left(z) for z in _ZS])
# a smooth lower envelope (parabolic erosion): never wider than the saya allows, no ring-to-ring steps
_ENV = np.array([np.min(_RAW + 9.0 * (_ZS - z) ** 2) for z in _ZS])
def ring_params(z):
    yf, yb, Xr, Xl, n = hring(z)
    yc = (yf + yb) / 2; Yf = yc - yf; Yb = yb - yc
    Xl = min(Xl, float(np.interp(z, _ZS, _ENV)))
    return yc, Yf, Yb, Xr, Xl, n
def ring_point(th, z, pr):
    yc, Yf, Yb, Xr, Xl, n = pr
    s, c = math.sin(th), math.cos(th)
    X = Xl if s > 0 else Xr; Y = Yb if c > 0 else Yf
    return np.array([X * math.copysign(abs(s) ** (2 / n), s), yc + Y * math.copysign(abs(c) ** (2 / n), c), z])
# columns by arc length from the back centre, dense at the vent and at the front edges
NU_HALF = 30; NU = 2 * NU_HALF + 1; NV = len(HZ)
QF = np.interp(np.linspace(0, 1, NU_HALF + 1), [0, .24, .88, 1], [0, .10, .94, 1])
def ring_columns(z):
    pr = ring_params(z)
    eL, eR = opening(z, 1), opening(z, -1)
    yc, Yf, Yb, Xr, Xl, n = pr
    thL = PI - math.asin(min(.999, (eL / Xl) ** (n / 2))); thR = -(PI - math.asin(min(.999, (eR / Xr) ** (n / 2))))
    cols = []
    for side, th_end in ((1, thL), (-1, thR)):
        ths = np.linspace(0, th_end, 900); pts = np.array([ring_point(t, z, pr) for t in ths])
        L = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(pts, axis=0), axis=1))])
        tq = np.interp(QF * L[-1], L, ths)
        cols.append(tq)
    th = np.concatenate([cols[0][::-1], cols[1][1:]])            # left front edge ... back centre ... right front edge
    return th, pr
VENT_W, VENT_TOP = .072, .422
def vent_z(x):
    q = 1 - (abs(x) / VENT_W) ** 3
    return HZ[0] + (VENT_TOP - HZ[0]) * (math.sqrt(q) if q > 0 else 0.)
def fold(theta, z):
    """A few soft big folds, growing toward the hem (radial offset, metres)."""
    amp = .0055 * sstep(.47, .27, z)
    return amp * (math.cos(7 * theta + .5) * .6 + math.cos(3 * theta - .4) * .4)
HP = np.zeros((NV, NU, 3)); HTH = np.zeros((NV, NU))
for j, z0 in enumerate(HZ):
    th, pr = ring_columns(z0)
    for i, t in enumerate(th):
        HP[j, i] = ring_point(t, z0, pr); HTH[j, i] = t
# the tail vent: raise the bottom of the centre-back columns, compressing each column toward its top
ZTOP = HZ[-1]
for i in range(NU):
    x0, y0 = HP[0, i, 0], HP[0, i, 1]
    zb = vent_z(x0) if y0 > 0 else HZ[0]
    if zb <= HZ[0] + 1e-9: continue
    for j in range(NV):
        znew = zb + (HZ[j] - HZ[0]) * (ZTOP - zb) / (ZTOP - HZ[0])
        HP[j, i] = ring_point(HTH[j, i], znew, ring_params(znew))
# soft folds (radial, in the horizontal plane); never push the saya side outward
for j in range(NV):
    for i in range(NU):
        x, y, z = HP[j, i]; yc = ring_params(z)[0]
        d = np.array([x, y - yc, 0.]); d /= max(1e-9, np.linalg.norm(d))
        f = fold(HTH[j, i], z)
        if x > 0 and z < SAYA_M[2] + .03: f = min(f, 0.)
        HP[j, i] += d * f
ARM_CAPS = [((.226, .009, .596), (.280, .001, .524), .068), ((.283, -.004, .529), (.349, -.018, .433), .074),
            ((.349, -.019, .436), (.378, -.026, .385), .067), ((.385, -.029, .361), (.385, -.029, .361), .075)]
def arm_clear(p, gap=.008):
    best = 9.
    for a, b, r in ARM_CAPS:
        a = np.array(a) * (1 if p[0] > 0 else (-1, 1, 1)); b = np.array(b) * (1 if p[0] > 0 else (-1, 1, 1))
        ab = b - a; t = 0. if not ab.any() else float(np.clip(np.dot(p - a, ab) / np.dot(ab, ab), 0, 1))
        best = min(best, float(np.linalg.norm(p - (a + t * ab))) - r - gap)
    return best
DX = np.zeros((NV, NU))
for j in range(NV):
    for i in range(NU):
        p = HP[j, i].copy()
        if not (.40 < p[2] < .64 and abs(p[0]) > .15): continue
        k = 0
        while arm_clear(p - np.array([np.sign(p[0]) * DX[j, i], 0, 0])) < 0 and k < 40:
            DX[j, i] += .002; k += 1
for _ in range(6):                                  # spread the push so the side wall dents softly, never creases
    D2 = DX.copy(); D2[1:-1, 1:-1] = np.maximum(DX[1:-1, 1:-1], .25 * (DX[:-2, 1:-1] + DX[2:, 1:-1] + DX[1:-1, :-2] + DX[1:-1, 2:]))
    DX = D2
HP[..., 0] -= np.sign(HP[..., 0]) * DX
CHECK0 = {'haori_arm_push_max_m': float(DX.max())}
HUV = np.stack(np.meshgrid(np.linspace(0, 1, NU), np.linspace(0, 1, NV)), -1)
def haori_outward(P):
    return np.stack([P[..., 0], P[..., 1] - .01, np.zeros_like(P[..., 0])], -1)
haori_ob, HN, HQ = thick_shell('haori_body', HP, 'haori', HUV, .011, 'sw_haori_in', 'sw_edge', outward=haori_outward,
                               rims=('v0',), inner_rows=HZ.index(.48) + 1)

# ------------------------------------------------------------------ 5. the box sleeves
SH = {}
SL_S = [-.006, .03, .16]
SL_TOP, SL_BOT, SL_DEP, SL_HANG = [.052, .080, .133], [.064, .090, .104], [.080, .098, .116], [0., .004, .040]
def sleeve_size(sv):
    return (float(np.interp(sv, SL_S, SL_TOP)), float(np.interp(sv, SL_S, SL_BOT)), float(np.interp(sv, SL_S, SL_DEP)))
def sleeve_hang(sv): return float(np.interp(sv, SL_S, SL_HANG))
SL_N, SL_EXP, SL_CUT = 24, 3.2, .040
def sleeve(s):
    tag = 'L' if s > 0 else 'R'
    sh = np.array([s * .188, .013, .641]); el = np.array([s * .284, -.002, .510])
    A = nrm(el - sh)
    U = np.array([0, 0, 1.]) - A * A[2]; U = nrm(U)                     # up-and-outward, perpendicular to the arm
    F = nrm(np.cross(A, U))
    if F[1] > 0: F = -F                                                  # F points to the front (-Y)
    stations = np.linspace(0, 1, 7)
    th = np.linspace(0, 2 * PI, SL_N, endpoint=False)
    P = np.zeros((len(stations), SL_N, 3))
    for i, t in enumerate(th):
        sn, cs = math.sin(t), math.cos(t)
        s_end = SL_S[-1] - SL_CUT * sstep(.15, -.85, sn)                # the underside (toward the body) ends shorter
        for k, q in enumerate(stations):
            sv = SL_S[0] + (s_end - SL_S[0]) * q
            top, bot, dep = sleeve_size(sv)
            u = (top if sn > 0 else bot) * math.copysign(abs(sn) ** (2 / SL_EXP), sn)
            f = dep * math.copysign(abs(cs) ** (2 / SL_EXP), cs)
            # the box hangs straight down (world -Z) from its top edge, so it reads square, not winged
            P[k, i] = sh + A * sv + U * u + F * f - np.array([0, 0, 1.]) * sleeve_hang(sv) * (1 - sn) / 2
    P = np.concatenate([P, P[:, :1]], 1)                                   # explicit seam column for UVs
    uv = np.stack(np.meshgrid(np.linspace(0, 1, SL_N + 1), np.linspace(0, 1, len(stations))), -1)
    c0 = sh + A * .07
    ob, N, Q = thick_shell('box_sleeve.' + tag, P, 'sleeve', uv, .011, 'sw_haori_in', 'sw_edge', seam=True,
                           rims=('v1',), outward=lambda Pp: Pp - c0)
    SH[tag] = dict(sh=sh, A=A, U=U, F=F, P=P, Q=Q, N=N)
    return ob
sleeve(1); sleeve(-1)

# ------------------------------------------------------------------ 6. the kimono (front sector, the only part that shows)
KZS = [.425, .45, .48, .51, .54, .57, .60, .63, .655, .679]
KA = np.linspace(PI - 1.18, PI + 1.18, 13)
KP = np.array([[torso(a, z) for a in KA] for z in KZS], np.float64)
KUV = np.stack(np.meshgrid(np.linspace(0, 1, len(KA)), np.linspace(0, 1, len(KZS))), -1)
kimono_ob, KN, KQ = thick_shell('kimono_front', KP, 'kimono', KUV, .006, 'sw_kimono', 'sw_kimono',
                                outward=lambda Pp: np.stack([Pp[..., 0], Pp[..., 1] - .011, 0 * Pp[..., 0]], -1), rim_bulge=.002)
bvh_kim = BVHTree.FromPolygons([Vector(p) for p in KP.reshape(-1, 3)], grid_faces(len(KZS), len(KA)))
def on_kimono(x, z, lift):
    hit = bvh_kim.ray_cast(Vector((x, -1, z)), Vector((0, 1, 0)), 2)[0]
    y = hit.y if hit else torso_front(z)
    return np.array([x, y - lift, z])
# crossed cream inner collar: the wearer's left (+X) panel over the right
def collar_band(name, ctrl, width, lift, order):
    pts = catmull_pts(ctrl, 15)
    C = np.array([on_kimono(p[0], p[2], lift) for p in pts])
    T, _, _ = frames_along(C)
    Nk = []
    for p in C:
        loc, nn, _, _ = bvh_kim.find_nearest(Vector(p)); nn = np.array(nn[:])
        if nn[1] > 0: nn = -nn
        Nk.append(nn)
    Nk = nrm(np.array(Nk)); Ak = nrm(np.cross(Nk, T))
    w0 = .030
    prof = [((lambda a: (lambda t: a + math.copysign(1, a) * (width(t) - w0) / 2))(a), n, U) for (a, n, U) in rrect_profile(w0, .009, .0035, 2, 1)]
    return sweep(name, C, Ak, Nk, prof, 'sw_cream', caps=True)
ZX = .536                                                     # the V crossing
collar_band('kimono_collar_under', [(-.098, 0, .676), (-.092, 0, .668), (-.06, 0, .62), (-.022, 0, .566), (.012, 0, .528), (.03, 0, .512)],
            lambda t: .034 - .006 * t, .0052, 0)
collar_band('kimono_collar_over', [(.098, 0, .676), (.092, 0, .668), (.06, 0, .62), (.022, 0, .566), (-.012, 0, .530), (-.05, 0, .49),
                                   (-.088, 0, .45), (-.104, 0, .432)],
            lambda t: .034 - .018 * sstep(.45, .7, t), .0092, 1)
# the cream collar line behind the neck, peeking over the haori's back collar
back_ctrl = [(.098, -.096, .668), (.124, -.02, .669), (.113, .072, .674), (.062, .123, .679), (0, .133, .681),
             (-.062, .123, .679), (-.113, .072, .674), (-.124, -.02, .669), (-.098, -.096, .668)]
bc = np.array(catmull_pts(back_ctrl, 20))
Tb, _, _ = frames_along(bc)
Nb = nrm(np.stack([bc[:, 0], bc[:, 1] - .01, np.zeros(len(bc))], -1)); Ab = nrm(np.cross(Tb, Nb))
Ab = np.where(Ab[:, 2:3] < 0, -Ab, Ab)
sweep('kimono_collar_back', bc, Ab, Nb, rrect_profile(.017, .0065, .0028, 2, 1), 'sw_cream', caps=True)

# ------------------------------------------------------------------ 7. the haori collar band (black, gold inner edge)
bpy.context.view_layer.update()
hverts = [Vector(p) for p in HP.reshape(-1, 3)]
bvh_haori = BVHTree.FromPolygons(hverts, grid_faces(NV, NU))
raw = [HP[j, 0] for j in range(NV)] + [HP[NV - 1, i] for i in range(1, NU - 1)] + [HP[j, NU - 1] for j in range(NV - 1, -1, -1)]
raw = np.array(raw)
def resample(P, step):
    sl = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(P, axis=0), axis=1))])
    n = max(3, int(sl[-1] / step) + 1)
    assert n <= 20000, f'resample would make {n} samples'          # hard cap: never balloon memory
    st = np.linspace(0, sl[-1], n)
    return np.stack([np.interp(st, sl, P[:, k]) for k in range(3)], -1), st
def gsmooth(P, st, sigma, pin=0):
    out = P.copy()
    for k in range(len(P)):
        w = np.exp(-.5 * ((st - st[k]) / sigma) ** 2); out[k] = (P * w[:, None]).sum(0) / w.sum()
    if pin:
        f = np.clip(np.minimum(st, st[-1] - st) / pin, 0, 1)[:, None]; out = P * (1 - f) + out * f
    return out
path, st = resample(raw, .004)
for _ in range(2):
    path = gsmooth(path, st, .022, pin=.12)
    path = np.array([np.array(bvh_haori.find_nearest(Vector(p))[0][:]) for p in path])
path[0] += np.array([0, 0, -.006]); path[-1] += np.array([0, 0, -.006])
NS_C = 62
_L = float(np.sum(np.linalg.norm(np.diff(path, axis=0), axis=1)))
CP, st = resample(path, _L / (NS_C - 1) * .999)
CP = CP[:NS_C]
st = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(CP, axis=0), axis=1))])
CN = []
for p in CP:
    loc, nn, _, _ = bvh_haori.find_nearest(Vector(p)); nn = np.array(nn[:])
    out = np.array([p[0], p[1] - .01, .25 * max(0, p[2] - .62)]); out = out / max(1e-9, np.linalg.norm(out))
    if np.dot(nn, out) < 0: nn = -nn
    CN.append(nn)
CN = nrm(gsmooth(np.array(CN), st, .03))
CT_ = nrm(np.gradient(CP, axis=0))
CI = nrm(np.cross(CT_, CN))
CN = nrm(np.cross(CI, CT_))
CW, CT, OVER = .036, .026, .006
centre = CP + CI * (CW / 2 - OVER) + CN * (-.002)
collar_prof = rrect_profile(CW, CT, .0075, 2, 2)
# a = across (negative = the inner/opening edge), n = normal (positive = outside)
collar_ob = sweep('haori_collar_band', centre, CI, CN, collar_prof, 'collar', caps=True, cap_chart='sw_collar',
                  vparam=st / st[-1])
COLLAR_PROFILE = collar_prof

# ------------------------------------------------------------------ 8. the hakama: two split legs + waistband
LEGZ = [.156, .162, .172, .19, .214, .225, .25, .275, .30, .33, .364, .40, .436]   # hem -> waist
#             z     xc    Xout   Xin   Yf    Yb   n_in
LT = np.array([[.436, .112, .124, .122, .190, .200, 4.0],
               [.364, .118, .114, .123, .186, .204, 3.4],
               [.300, .132, .114, .132, .180, .200, 2.8],
               [.250, .148, .132, .143, .178, .196, 2.4],
               [.200, .160, .146, .150, .177, .193, 2.2],
               [.156, .168, .153, .153, .177, .192, 2.2]])
PLEATS, SAMP = 10, [0, .34, .67, .955]
def front_inner_edge(z):
    '''Inner front edge of a leg, signed toward its own side (negative = past the centre line).'''
    return -.020 + .0275 * sstep(.181, .156, z)
OVER, UNDER = .0025, .0055               # the wearer's left leg laps over the right at the centre front
PDR = [-.5, -.16, .18, .5]
def pleat_amp(z): return .0105 * sstep(.40, .17, z)
def leg(s):
    tag = 'L' if s > 0 else 'R'
    th = []
    for k in range(PLEATS):
        for f in SAMP: th.append(2 * PI * (k + f) / PLEATS)
    th = np.array(th); NS = len(th)
    P = np.zeros((len(LEGZ), NS + 1, 3))
    for j, z in enumerate(LEGZ):
        xc, Xo, Xi, Yf, Yb, ni = [float(np.interp(z, LT[::-1, 0], LT[::-1, k])) for k in range(1, 7)]
        Xi_front = xc - front_inner_edge(z)
        for i in range(NS + 1):
            t = th[i % NS]
            sn, cs = math.sin(t), math.cos(t)               # t = 0 back, pi/2 outer side, pi front
            outer = sn > 0
            wf = sstep(.35, -.35, cs)                       # 1 on the front half, 0 on the back half
            n = 2.3 if outer else ni + (10. - ni) * wf        # a near-square front-inner corner: the front stays flat to the centre
            X = Xo if outer else Xi + (Xi_front - Xi) * wf
            Y = Yb if cs > 0 else Yf
            x = X * math.copysign(abs(sn) ** (2 / n), sn); y = Y * math.copysign(abs(cs) ** (2 / n), cs)
            d = PDR[(i % NS) % len(SAMP)] * pleat_amp(z)
            x *= 1 + d / X; y *= 1 + d / Y
            # lap: near the centre front the left leg sits a touch forward, the right a touch back (no z-fight)
            w = (1 - sstep(.02, .05, xc + x)) * sstep(.1, -.4, cs)
            y += (-OVER if s > 0 else UNDER) * w
            P[j, i] = (s * (xc + x), .006 + y, z)
    uv = np.stack(np.meshgrid(np.linspace(0, 1, NS + 1), np.linspace(0, 1, len(LEGZ))), -1)
    cx = np.array([s * .14, .006, 0])
    jc = LEGZ.index(.214)
    def ceiling(verts, faces, fuv, P_, Q_, au):
        # close the leg's inner wall above the ankle: the leg reads as a filled volume from under the hem
        nv, nu = P_.shape[:2]; k0 = nv * nu
        c = Q_[jc, :-1].mean(0); ci = len(verts); verts.append(c)
        cc = au('sw_hakama_in', .5, .5)
        for i in range(nu - 1):
            faces.append((k0 + jc * nu + i, k0 + jc * nu + i + 1, ci)); fuv.append([cc] * 3)
    ob, N, Q = thick_shell('hakama_leg.' + tag, P, 'hakama', uv, .010, 'sw_hakama_in', 'sw_edge', seam=True, rims=('v0',),
                           outward=lambda Pp: np.stack([Pp[..., 0] - cx[0], Pp[..., 1] - cx[1], 0 * Pp[..., 0]], -1), extra=ceiling,
                           inner_rows=jc + 1)
    return ob, P
leg_L, LP_L = leg(1); leg_R, LP_R = leg(-1)
# waistband: a padded ring under the haori, visible between the open fronts
WB = []; NW, MW = 44, 8
for jm in range(MW):
    p = 2 * PI * jm / MW
    for i in range(NW):
        a = 2 * PI * i / NW; sn, cs = math.sin(a), math.cos(a)
        X, Yf, Yb, n = .238 - .008 * sstep(-.25, .25, sn), .202, .212, 2.4      # round 4: the left (saya) half 8 mm narrower, clear of the haori
        Y = Yb if cs > 0 else Yf
        bulge = .0085 * math.cos(p)
        x = (X + bulge) * math.copysign(abs(sn) ** (2 / n), sn); y = (Y + bulge) * math.copysign(abs(cs) ** (2 / n), cs)
        WB.append((x, y + .004, .404 + .032 * math.sin(p)))
wf, wuv = [], []
for jm in range(MW):
    for i in range(NW):
        wf.append((jm * NW + i, jm * NW + (i + 1) % NW, ((jm + 1) % MW) * NW + (i + 1) % NW, ((jm + 1) % MW) * NW + i))
        wuv.append(((i / NW, jm / MW), ((i + 1) / NW, jm / MW), ((i + 1) / NW, (jm + 1) / MW), (i / NW, (jm + 1) / MW)))
waist_ob = make('hakama_waistband', WB, wf, wuv, 'waist')

# ------------------------------------------------------------------ 9. the haori-himo cord: two cords, a bow knot, two tassels
KNOT = np.array([0., -.198, .526])
def cord(name, ctrl, r, n=12, chart='sw_cord'):
    pts = np.array(catmull_pts(ctrl, n)); T, A, N = frames_along(pts, (0, -1, 0))
    return sweep(name, pts, A, N, circle_profile(r, 8), chart, caps=True)
def ball(name, c, r, chart, seg=12, rows=8):
    vs = [(c[0], c[1], c[2] - r[2])]
    for j in range(1, rows):
        p = PI * j / rows
        for i in range(seg):
            a = 2 * PI * i / seg; vs.append((c[0] + r[0] * math.sin(p) * math.cos(a), c[1] + r[1] * math.sin(p) * math.sin(a), c[2] - r[2] * math.cos(p)))
    vs.append((c[0], c[1], c[2] + r[2])); top = len(vs) - 1; fs = []
    idx = lambda j, i: 1 + (j - 1) * seg + i % seg
    for i in range(seg): fs.append((0, idx(1, i + 1), idx(1, i)))
    for j in range(1, rows - 1):
        for i in range(seg): fs.append((idx(j, i), idx(j, i + 1), idx(j + 1, i + 1), idx(j + 1, i)))
    for i in range(seg): fs.append((idx(rows - 1, i), idx(rows - 1, i + 1), top))
    return make(name, vs, fs, [[(.5, .5)] * len(f) for f in fs], chart)
eL = HP[np.searchsorted(HZ, .555), 0]; eR = HP[np.searchsorted(HZ, .555), -1]
attachL = np.array([.118, eL[1] - .012, .556]); attachR = np.array([-.130, eR[1] - .012, .556])
cord('himo_cord.L', [attachL, (.078, -.186, .546), (.036, -.196, .532), KNOT + (.012, 0, .001)], .0088)
cord('himo_cord.R', [attachR, (-.082, -.186, .546), (-.036, -.196, .532), KNOT + (-.012, 0, .001)], .0088)
for nm, a in (('himo_bead.L', attachL), ('himo_bead.R', attachR)):
    ball(nm, a + (0, -.004, 0), (.0125, .0115, .0125), 'sw_cream')
ball('himo_knot', KNOT + (0, -.006, 0), (.020, .0145, .017), 'sw_cord', 14, 9)
for s in (-1, 1):
    tag = 'L' if s > 0 else 'R'
    loop = [KNOT + (s * .010, .002, .006), KNOT + (s * .030, -.002, .020), KNOT + (s * .046, -.001, .010),
            KNOT + (s * .040, .000, -.006), KNOT + (s * .016, -.001, -.004)]
    cord('himo_bow_loop.' + tag, loop, .0075, 11)
    tas = [KNOT + (s * .006, -.004, -.010), KNOT + (s * .013, -.006, -.030), KNOT + (s * .020, -.006, -.050)]
    pts = np.array(catmull_pts(tas, 10)); T, A, N = frames_along(pts, (0, -1, 0))
    sweep('himo_tassel.' + tag, pts, A, N, [((lambda c: (lambda t: c * (.0075 + .0055 * t ** 1.5)))(math.cos(2 * PI * i / 10)),
                                             (lambda c: (lambda t: c * (.0065 + .0035 * t)))(math.sin(2 * PI * i / 10)), i / 10)
                                            for i in range(10)], 'sw_cord', caps=True)

# ------------------------------------------------------------------ 10. the saya: black oval scabbard, gold mouth ring and end cap, red sageo
def saya_section(t, scale=1.):
    return [(SAYA_W * scale * math.cos(a), SAYA_H * scale * math.sin(a)) for a in np.linspace(0, 2 * PI, 16, endpoint=False)]
def saya_tube(name, t0, t1, n, scale, chart, round_end=False):
    ts = np.linspace(t0, t1, n)
    C = np.array([SAYA_M + SAYA_D * SAYA_L * t for t in ts])
    if round_end:                              # the cap's end rounds over into a dome
        k = 5; extra = []
        for q in range(1, k + 1):
            a = q / (k + 1) * PI / 2
            extra.append((SAYA_M + SAYA_D * (SAYA_L * t1 + .012 * math.sin(a)), math.cos(a)))
    prof = [(SAYA_W * scale * math.cos(a), SAYA_H * scale * math.sin(a), a / (2 * PI)) for a in np.linspace(0, 2 * PI, 16, endpoint=False)]
    if round_end:
        C2 = np.concatenate([C, np.array([e[0] for e in extra])]); sc = [1.] * n + [e[1] for e in extra]
        prof2 = [((lambda c, ss: (lambda t: c * ss[min(len(ss) - 1, int(round(t * (len(ss) - 1))))]))(a, sc), (lambda c, ss: (lambda t: c * ss[min(len(ss) - 1, int(round(t * (len(ss) - 1))))]))(nn, sc), U)
                 for (a, nn, U) in prof]
        return sweep(name, C2, [SAYA_SIDE] * len(C2), [SAYA_UP] * len(C2), prof2, chart, caps=True)
    return sweep(name, C, [SAYA_SIDE] * n, [SAYA_UP] * n, prof, chart, caps=True)
saya_tube('saya_body', .012, .935, 6, 1.0, 'sw_saya')
saya_tube('saya_kojiri_gold', .925, 1.0, 5, 1.12, 'sw_gold', round_end=True)
# the koiguchi: a gold ring whose front face is a gold lip around the dark, empty mouth
kc = [SAYA_M, SAYA_M, SAYA_M + SAYA_D * .001, SAYA_M + SAYA_D * .040, SAYA_M + SAYA_D * .040]
ksc = [.80, 1.13, 1.13, 1.13, .98]
sweep('saya_koiguchi_gold', np.array(kc), [SAYA_SIDE] * 5, [SAYA_UP] * 5,
      [((lambda c: (lambda t: c * SAYA_W * ksc[int(round(t * 4))]))(math.cos(a)),
        (lambda c: (lambda t: c * SAYA_H * ksc[int(round(t * 4))]))(math.sin(a)), a / (2 * PI)) for a in np.linspace(0, 2 * PI, 18, endpoint=False)],
      'sw_gold', caps=True, cap_chart='sw_mouth')
# sageo: a wrap band on the saya and two tails hanging down the haori's left side
tw = .15
wrap_c = SAYA_M + SAYA_D * SAYA_L * tw
wr = [wrap_c + SAYA_D * (-.009 + .018 * k / 3) for k in range(4)]
sweep('sageo_wrap', np.array(wr), [SAYA_SIDE] * 4, [SAYA_UP] * 4,
      [((lambda c: (lambda t: c * SAYA_W * (1.42 - .14 * abs(t - .5) * 2)))(math.cos(a)),
        (lambda c: (lambda t: c * SAYA_H * (1.30 - .10 * abs(t - .5) * 2)))(math.sin(a)), a / (2 * PI)) for a in np.linspace(0, 2 * PI, 18, endpoint=False)],
      'sw_cord', caps=True)
knot_c = wrap_c - SAYA_UP * SAYA_H * 1.30
ball('sageo_knot', knot_c, (.0145, .015, .0135), 'sw_cord')
bvh_haori_full = BVHTree.FromPolygons([Vector(p) for p in HP.reshape(-1, 3)], grid_faces(NV, NU))
def side_x(y, z, lift):
    hit = bvh_haori_full.ray_cast(Vector((1, y, z)), Vector((-1, 0, 0)), 2)
    return (hit[0].x + lift, np.array(hit[1][:])) if hit[0] is not None else (None, None)
SAGEO_TAILS = []
for k, (side, L, sag) in enumerate(((.62, .060, .006), (1.05, .048, .004))):    # both on the saya's outer side
    pts = []
    for q in np.linspace(0, 1, 8):
        tt = tw + .012 / SAYA_L + q * L / SAYA_L                # along the saya, from just behind the knot
        c = SAYA_M + SAYA_D * SAYA_L * tt
        off = -SAYA_UP * (SAYA_H + .0062 + sag * math.sin(PI * q) * .6 + .004 * q) + SAYA_SIDE * SAYA_W * side * (1 + .3 * q)
        pts.append(c + off)
    pts = np.array(pts); pts[0] = knot_c + SAYA_D * .006 + SAYA_SIDE * SAYA_W * side * .5
    T = nrm(np.gradient(pts, axis=0))
    Nn = nrm(np.array([-SAYA_UP - t * np.dot(-SAYA_UP, t) for t in T]))
    A = nrm(np.cross(Nn, T))
    ob = sweep('sageo_tail.' + str(k), pts, A, Nn, [((lambda c: (lambda t: c * (.0095 + .0040 * t)))(math.cos(a)),
                                                    (lambda c: (lambda t: c * .0052))(math.sin(a)), a / (2 * PI)) for a in np.linspace(0, 2 * PI, 12, endpoint=False)],
               'sw_cord', caps=True)
    SAGEO_TAILS.append(ob)

# ------------------------------------------------------------------ 11. clearance checks against the locked body
def min_dist(ob_or_pts, bvh):
    pts = ob_or_pts if isinstance(ob_or_pts, np.ndarray) else np.array([v.co[:] for v in ob_or_pts.data.vertices])
    best = 9.
    for p in pts:
        r = bvh.find_nearest(Vector(p))
        if r[0] is not None: best = min(best, r[3])
    return best
def inside_count(pts, bvh):
    """Points inside a closed mesh, by ray parity along +X and +Y (both must agree)."""
    n = 0
    for p in pts:
        ins = []
        for d in (Vector((1, 0, 0)), Vector((0, 1, 0))):
            o = Vector(p); k = 0
            for _ in range(20):
                h = bvh.ray_cast(o, d, 5)
                if h[0] is None: break
                k += 1; o = h[0] + d * 1e-5
            ins.append(k % 2 == 1)
        n += int(all(ins))
    return n
CHECK = dict(CHECK0)
saya_pts = np.array([v.co[:] for nm in ('saya_body', 'saya_kojiri_gold', 'saya_koiguchi_gold') for v in bpy.data.objects[nm].data.vertices])
CHECK['saya_to_left_arm_min_m'] = min_dist(saya_pts, bvh_arm_L)
CHECK['saya_to_haori_min_m'] = min_dist(saya_pts, bvh_haori_full)
CHECK['saya_inside_left_arm'] = inside_count(saya_pts, bvh_arm_L)
legbvh = BVHTree.FromPolygons([Vector(p) for p in LP_L.reshape(-1, 3)], grid_faces(len(LEGZ), LP_L.shape[1]))
CHECK['saya_to_left_leg_rest_min_m'] = min_dist(saya_pts, legbvh)
# leg swing sweep: the thigh rotates about world X through the hip joint, +-1.0 rad; the saya stays with the hips
hipJ = np.array([.119, .014, .364]); worst = 9.
thigh_rows = [j for j, z in enumerate(LEGZ) if z <= .33]          # the part that follows the thigh; the top blends to hips
LPT = LP_L[:max(thigh_rows) + 1]
sageo_pts = np.array([v.co[:] for nm in ('sageo_wrap', 'sageo_knot', 'sageo_tail.0', 'sageo_tail.1') for v in bpy.data.objects[nm].data.vertices])
worst_s = 9.
for ang in np.linspace(-1.0, 1.0, 21):
    R = np.array(Matrix.Rotation(ang, 3, 'X'))
    Q = (LPT.reshape(-1, 3) - hipJ) @ R.T + hipJ
    b = BVHTree.FromPolygons([Vector(p) for p in Q], grid_faces(LPT.shape[0], LPT.shape[1]))
    dmin = min_dist(saya_pts[::2], b); worst = min(worst, dmin)
    CHECK.setdefault('saya_to_left_thigh_by_swing', {})['%+.1f' % ang] = round(dmin, 4)
    smin_ = min_dist(sageo_pts, b); worst_s = min(worst_s, smin_)
    CHECK.setdefault('sageo_to_left_thigh_by_swing', {})['%+.1f' % ang] = round(smin_, 4)
    for nm in ('sageo_wrap', 'sageo_knot', 'sageo_tail.0', 'sageo_tail.1'):
        pts_ = np.array([v.co[:] for v in bpy.data.objects[nm].data.vertices])
        CHECK.setdefault('sageo_parts_by_swing', {}).setdefault(nm, {})['%+.1f' % ang] = round(min_dist(pts_, b), 4)
CHECK['saya_to_left_leg_swing_min_m'] = worst
CHECK['sageo_to_left_leg_swing_min_m'] = worst_s
CHECK['sageo_tail_lowest_z_m'] = float(np.array([v.co[2] for nm in ('sageo_tail.0', 'sageo_tail.1') for v in bpy.data.objects[nm].data.vertices]).min())
CHECK['sageo_to_haori_min_m'] = min_dist(sageo_pts, bvh_haori_full)
for nm in ('sageo_wrap', 'sageo_knot', 'sageo_tail.0', 'sageo_tail.1'):
    pts_ = np.array([v.co[:] for v in bpy.data.objects[nm].data.vertices])
    CHECK.setdefault('sageo_part_to_haori_min_m', {})[nm] = round(min_dist(pts_, bvh_haori_full), 4)
    CHECK.setdefault('sageo_part_lowest_z', {})[nm] = round(float(pts_[:, 2].min()), 4)
haori_outer_pts = HP.reshape(-1, 3)
def inside_pts(pts, bvh):
    return np.array([p for p in pts if inside_count([p], bvh)]).reshape(-1, 3)
ia = np.concatenate([inside_pts(haori_outer_pts, bvh_arm_L), inside_pts(haori_outer_pts, bvh_arm_R)])
CHECK['haori_inside_arms'] = len(ia)
CHECK['haori_inside_arms_z_range'] = [float(ia[:, 2].min()), float(ia[:, 2].max())] if len(ia) else []
ih = inside_pts(haori_outer_pts, bvh_head)
CHECK['haori_inside_head_xyz_min'] = ih.min(0).tolist() if len(ih) else []
CHECK['haori_to_arms_min_m'] = min(min_dist(haori_outer_pts, bvh_arm_L), min_dist(haori_outer_pts, bvh_arm_R))
CHECK['haori_inside_head'] = len(ih)
for tag in 'LR':
    S = SH[tag]; Q = S['Q'][:, :-1].reshape(-1, 3)
    CHECK['sleeve_inside_head.' + tag] = inside_count(S['P'][:, :-1].reshape(-1, 3), bvh_head)
    arm = np.array([v.co[:] for nm in ('upper_arm_skin.' + tag, 'thick_forearm_wrap.' + tag) for v in BODY[nm].data.vertices])
    # margin of arm points inside the sleeve's inner surface, in the sleeve's own frame
    sob = bpy.data.objects['box_sleeve.' + tag]
    sbvh = BVHTree.FromPolygons([v.co.copy() for v in sob.data.vertices], [tuple(p.vertices) for p in sob.data.polygons])
    abvh = bvh_of(['upper_arm_skin.' + tag, 'thick_forearm_wrap.' + tag, 'wrist_skin.' + tag, 'large_mitten_paw.' + tag])
    CHECK['sleeve_arm_triangle_overlaps.' + tag] = len(sbvh.overlap(abvh))
    CHECK['sleeve_to_arm_min_m.' + tag] = min_dist(arm, sbvh)
    CHECK['sleeve_to_head_min_m.' + tag] = min_dist(sob, bvh_head)
    PP = S['P'][:, :-1]; best = (9., None)
    for kk in range(PP.shape[0]):
        for ii in range(PP.shape[1]):
            r = bvh_head.find_nearest(Vector(PP[kk, ii]))
            if r[0] is not None and r[3] < best[0]: best = (r[3], (kk, ii, [round(float(c), 4) for c in PP[kk, ii]]))
    CHECK['sleeve_outer_to_head_min.' + tag] = [round(best[0], 4), best[1]]
    so = S['P'][:, :-1].reshape(-1, 3)
    CHECK['sleeve_outer_x_max_m.' + tag] = round(float(np.abs(so[:, 0]).max()), 4)
    CHECK['sleeve_lowest_z_m.' + tag] = round(float(so[:, 2].min()), 4)
tail_near = TAIL[(TAIL[:, 1] > .2) & (TAIL[:, 1] < .30)]
CHECK['tail_to_haori_min_m'] = min_dist(tail_near, bvh_haori_full)
CHECK['tail_inside_haori_shell_pts'] = 0
print('CHECK', json.dumps(CHECK, indent=1), flush=True)

# ------------------------------------------------------------------ 12. the outfit atlas (locked charts untouched)
def read_png(path):
    raw = open(path, 'rb').read(); off = 8; chunks = []
    w, h = struct.unpack('>II', raw[16:24])
    while off < len(raw):
        size = struct.unpack_from('>I', raw, off)[0]
        if raw[off + 4:off + 8] == b'IDAT': chunks.append(raw[off + 8:off + 8 + size])
        off += size + 12
    rows = np.frombuffer(zlib.decompress(b''.join(chunks)), np.uint8).reshape(h, w * 4 + 1)
    assert not rows[:, 0].any()
    return rows[:, 1:].reshape(h, w, 4)[::-1].copy()
atlas = read_png(os.path.join(TASK, 'base', 'chewy-b_atlas.png'))
base_atlas = atlas.copy()
def texel_grid(chart):
    x, y, w, h = SUB[chart]
    u = np.clip((np.arange(w) - 5) / (w - 10), 0, 1); v = np.clip((np.arange(h) - 5) / (h - 10), 0, 1)
    return np.meshgrid(u, v)
def put(chart, C):
    x, y, w, h = SUB[chart]; atlas[y:y + h, x:x + w, :3] = np.round(clamp(C) * 255).astype(np.uint8); atlas[y:y + h, x:x + w, 3] = 255
def bilinear(G, U, V):
    nv, nu = G.shape[:2]; fu = U * (nu - 1); fv = V * (nv - 1)
    i0 = np.clip(fu.astype(int), 0, nu - 2); j0 = np.clip(fv.astype(int), 0, nv - 2); a = (fu - i0)[..., None]; b = (fv - j0)[..., None]
    return (G[j0, i0] * (1 - a) * (1 - b) + G[j0, i0 + 1] * a * (1 - b) + G[j0 + 1, i0] * (1 - a) * b + G[j0 + 1, i0 + 1] * a * b)
def sdf_ellipse(px, py, cx, cy, rx, ry, rot=0.):
    c, s = math.cos(rot), math.sin(rot); lx = (px - cx) * c + (py - cy) * s; ly = -(px - cx) * s + (py - cy) * c
    k = np.sqrt((lx / rx) ** 2 + (ly / ry) ** 2); return (k - 1) * min(rx, ry)
def smin(a, b, k):
    h = clamp(.5 + .5 * (b - a) / k); return b * (1 - h) + a * h - k * h * (1 - h)
def paw_sdf(px, py):
    """Paw-print crest in units of its width (1.0), y up."""
    pad = smin(sdf_ellipse(px, py, 0, -.15, .27, .19), smin(sdf_ellipse(px, py, -.12, -.25, .165, .15), sdf_ellipse(px, py, .12, -.25, .165, .15), .04), .06)
    toes = np.minimum(np.minimum(sdf_ellipse(px, py, -.375, .10, .105, .135, .38), sdf_ellipse(px, py, .375, .10, .105, .135, -.38)),
                      np.minimum(sdf_ellipse(px, py, -.135, .285, .112, .148, .12), sdf_ellipse(px, py, .135, .285, .112, .148, -.12)))
    return np.minimum(pad, toes)
CREST = {'chest_x': .183, 'chest_z': .574, 'chest_w': .068, 'back_z': .565, 'back_w': .196}
def crest_mask(X, Y, Z, Nrm, px_per_m):
    m = np.zeros(X.shape)
    for s in (-1, 1):
        w = CREST['chest_w']; d = paw_sdf((X - s * CREST['chest_x']) / w, (Z - CREST['chest_z']) / w) * w
        m = np.maximum(m, (1 - smooth(-1.1 / px_per_m, 1.1 / px_per_m, d)) * (Nrm[..., 1] < -.35))
    w = CREST['back_w']; d = paw_sdf(-X / w, (Z - CREST['back_z']) / w) * w
    m = np.maximum(m, (1 - smooth(-1.1 / px_per_m, 1.1 / px_per_m, d)) * (Nrm[..., 1] > .35))
    return m
def cloth(base, sheen, fold_col, Nrm, Z, ridge, top_light=.10):
    up = clamp(Nrm[..., 2]); C = mix(hexrgb(base), hexrgb(sheen), clamp(.42 * smooth(.05, .85, up) + top_light * smooth(.3, .7, Z)))
    return mix(C, hexrgb(fold_col), clamp(ridge))
# --- haori body
U, V = texel_grid('haori'); Pp = bilinear(HP, U, V); Nn = nrm(bilinear(HN, U, V)); TH = bilinear(HTH[..., None], U, V)[..., 0]
X, Y, Z = Pp[..., 0], Pp[..., 1], Pp[..., 2]
ridge = np.zeros_like(X)
famp = np.clip((.47 - Z) / .2, 0, 1)
ridge = .55 * famp * clamp(np.cos(7 * TH + .5) * .6 + np.cos(3 * TH - .4) * .4) ** 2
C = cloth('haori', 'haori_sheen', 'haori_fold', Nn, (Z - .26) / .41, ridge)
m = crest_mask(X, Y, Z, Nn, 1000.)
gold_c = mix(hexrgb('gold_shade'), hexrgb('gold_light'), clamp(.35 + .9 * Nn[..., 2] + .25 * smooth(-.5, .5, (Z - .55) * 8)))
gold_c = mix(hexrgb('gold'), gold_c, .55)
C = mix(C, gold_c, m)
put('haori', C)
# --- sleeves (both share the island)
U, V = texel_grid('sleeve'); Pp = bilinear(SH['L']['P'], U, V); Nn = nrm(bilinear(SH['L']['N'], U, V))
ridge = .35 * clamp(np.cos(U * 2 * PI * 3 + .7)) ** 4 * smooth(.3, 1, V)
C = cloth('haori', 'haori_sheen', 'haori_fold', Nn, V, ridge, .06)
C = mix(C, hexrgb('haori_inner'), .30 * smooth(.85, 1, V))
put('sleeve', C)
# --- collar band: black with the gold inner edge (profile 'a' < -w/2 + 9 mm on the outer half)
U, V = texel_grid('collar')
prof = COLLAR_PROFILE; pu = np.array([p[2] for p in prof] + [1.]); pa = np.array([p[0] for p in prof] + [prof[0][0]]); pn = np.array([p[1] for p in prof] + [prof[0][1]])
A_ = np.interp(U, pu, pa); N_ = np.interp(U, pu, pn)
goldm = (1 - smooth(-CW / 2 + .0085, -CW / 2 + .0105, A_)) * smooth(-.004, .002, N_)
C = mix(hexrgb('collar'), hexrgb('collar_sheen'), clamp(.45 * smooth(-.002, .013, N_) * (1 - smooth(.012, .025, A_)) + .2 * smooth(.25, 1, V)))
C = mix(C, mix(hexrgb('gold'), hexrgb('gold_light'), .35), goldm)
put('collar', C)
# --- kimono front: charcoal, the fur blaze in the collar V above the crossing
U, V = texel_grid('kimono'); Pp = bilinear(KP, U, V); Nn = nrm(bilinear(KN, U, V))
X, Z = Pp[..., 0], Pp[..., 2]
half_v = np.clip((Z - (ZX - .004)) / (.672 - ZX) * .068, 0, None)
blaze = (1 - smooth(half_v - .002, half_v + .002, np.abs(X))) * (Z > ZX - .004)
C = mix(hexrgb('kimono'), hexrgb('kimono_sheen'), clamp(.35 * smooth(0, .8, Nn[..., 2]) + .18 * smooth(.45, .62, Z)))
C = mix(C, hexrgb('kimono_shade'), .5 * (1 - smooth(.43, .47, Z)))
C = mix(C, hexrgb('blaze'), blaze)
put('kimono', C)
# --- hakama legs: soft pleat highlights, crisp crease at each fold step
U, V = texel_grid('hakama')
k = (U * PLEATS) % 1.0
face = smooth(.0, .72, k) * (1 - smooth(.72, .80, k))
crease = smooth(.74, .82, k) * (1 - smooth(.96, 1.0, k))
ZZ = .156 + (.436 - .156) * V
C = mix(hexrgb('hakama'), hexrgb('hakama_sheen'), clamp(.75 * face * smooth(.30, .17, ZZ) + .15 * face))
C = mix(C, hexrgb('hakama_crease'), .75 * crease * smooth(.42, .24, ZZ))
C = mix(C, hexrgb('hakama_crease'), .45 * smooth(.215, .262, ZZ) * (1 - smooth(.30, .33, ZZ)))   # soft shade under the haori hem
put('hakama', C)
# --- waistband: two padded bands
U, V = texel_grid('waist')
band = np.abs(np.sin(V * 2 * PI))
C = mix(hexrgb('hakama'), hexrgb('hakama_sheen'), .55 * smooth(.2, .95, np.cos((V - .25) * 2 * PI) * .5 + .5))
C = mix(C, hexrgb('hakama_crease'), .7 * (1 - smooth(.0, .06, np.abs(V - .5))))
put('waist', C)
# --- solid swatches
SWC = {'sw_haori_in': OUTFIT['haori_inner'], 'sw_edge': OUTFIT['haori_edge'], 'sw_gold': OUTFIT['gold'], 'sw_cream': OUTFIT['cream'],
       'sw_cord': OUTFIT['cord'], 'sw_saya': OUTFIT['saya'], 'sw_mouth': OUTFIT['saya_mouth'], 'sw_hakama_in': OUTFIT['hakama_inner'],
       'sw_kimono': OUTFIT['kimono'], 'sw_collar': OUTFIT['collar']}
for nm, c in SWC.items():
    U, V = texel_grid(nm); put(nm, np.broadcast_to(hexrgb(c), U.shape + (3,)).copy())
# the locked charts must be untouched
LOCKED_CHARTS = ['head', 'eye', 'eye.R', 'fur', 'ear', 'cream', 'nose', 'dark', 'brow', 'wrap', 'foot']
for nm in LOCKED_CHARTS:
    x, y, w, h = CHARTS[nm]
    assert np.array_equal(atlas[y:y + h, x:x + w], base_atlas[y:y + h, x:x + w]), nm
def write_png(path, A):
    def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    raw = b''.join(b'\x00' + r.tobytes() for r in A[::-1])
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', A.shape[1], A.shape[0], 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))
atlas_path = os.path.join(TASK, 'chewy-samurai_atlas.png'); write_png(atlas_path, atlas)
old_img = [n.image for n in mat.node_tree.nodes if n.type == 'TEX_IMAGE'][0]
img = bpy.data.images.load(atlas_path); img.name = 'Chewy_Samurai_painted_atlas_2048'; img.pack()
for n in mat.node_tree.nodes:
    if n.type == 'TEX_IMAGE': n.image = img
bpy.data.images.remove(old_img)
mat.name = 'Chewy_Samurai_atlas'

# ------------------------------------------------------------------ 12b. measured outfit targets
CROWN, WH = 1.20, .675
def fr(z): return round(float(z) / CROWN, 3)
cb = np.array([v.co[:] for v in collar_ob.data.vertices]); kj = np.array([v.co[:] for v in bpy.data.objects['saya_kojiri_gold'].data.vertices])
hem_rows = HP[0]; front_hem = hem_rows[hem_rows[:, 1] < 0]
legL = np.array([v.co[:] for v in leg_L.data.vertices]); legR = np.array([v.co[:] for v in leg_R.data.vertices])
low = lambda P: P[P[:, 2] < .175]
MEAS = {
    'haori_collar_top_back_frac': fr(cb[np.abs(cb[:, 0]) < .05][:, 2].max()),
    'haori_hem_frac': fr(front_hem[:, 2].min()),
    'haori_hem_width_W': round(float(HP[:3, :, 0].max() - HP[:3, :, 0].min()) / WH, 3),
    'haori_hem_half_widths_m': {'left_saya_side': round(float(HP[:3, :, 0].max()), 3), 'right': round(float(-HP[:3, :, 0].min()), 3)},
    'kimono_V_crossing_frac': fr(.533), 'cord_knot_frac': fr(KNOT[2]),
    'chest_crest_W': round(CREST['chest_w'] / WH, 3), 'chest_crest_centre_frac': fr(CREST['chest_z']), 'chest_crest_x_m': CREST['chest_x'],
    'back_crest_W': round(CREST['back_w'] / WH, 3), 'back_crest_centre_frac': fr(CREST['back_z']),
    'hakama_waistband_top_frac': fr(max(p[2] for p in WB)), 'hakama_hem_frac': fr(min(legL[:, 2].min(), legR[:, 2].min())),
    'hakama_hem_width_W': round(float(low(legL)[:, 0].max() - low(legR)[:, 0].min()) / WH, 3),
    'haori_hakama_overlap_frac': round(fr(max(p[2] for p in WB)) - fr(front_hem[:, 2].min()), 3),
    'saya_mouth_frac': fr(SAYA_M[2]), 'saya_tip_cap_bottom_frac': fr(kj[:, 2].min()),
    'saya_angle_below_horizontal_deg': round(math.degrees(math.asin(-SAYA_D[2])), 1),
    'tail_vent_top_frac': fr(VENT_TOP), 'tail_vent_half_width_m': VENT_W,
}
json.dump(MEAS, open(os.path.join(TASK, 'measurements.json'), 'w', encoding='utf-8'), indent=1)
print('MEAS', json.dumps(MEAS), flush=True)

# ------------------------------------------------------------------ 13. part list for phase 2, then the base's own cleanup and join
islands = {}
for g, obs in parts.items():
    islands[g] = []
    for ob in obs:
        ob.data.calc_loop_triangles()
        islands[g].append({'name': ob.name, 'locked': ob.name in LOCKED.get(g, []), 'vertices': len(ob.data.vertices),
                           'triangles': len(ob.data.loop_triangles)})
json.dump(islands, open(os.path.join(TASK, 'phase2-islands.json'), 'w', encoding='utf-8'), indent=1)
SHELL_TEST = {}
def shell_axis(name, c):
    if name.startswith('hakama_leg'):
        a = np.array([.14 if name.endswith('L') else -.14, .006, c[2]])
    elif name.startswith('box_sleeve'):
        S_ = SH[name[-1]]; a = S_['sh'] + S_['A'] * float(np.dot(c - S_['sh'], S_['A']))
    else:
        a = np.array([0., .01, c[2]])
    r = c - a; return r / max(1e-9, np.linalg.norm(r))
for ob in parts['body']:
    chart = {'haori_body': 'haori', 'box_sleeve.L': 'sleeve', 'box_sleeve.R': 'sleeve', 'hakama_leg.L': 'hakama', 'hakama_leg.R': 'hakama', 'kimono_front': 'kimono'}.get(ob.name)
    if not chart: continue
    x0, y0, w0, h0 = SUB[chart]; uvd0 = ob.data.uv_layers.active.data; bad0 = 0; n0 = 0
    for p in ob.data.polygons:
        u, v = uvd0[p.loop_start].uv
        if not (x0 <= u * 2048 <= x0 + w0 and y0 <= v * 2048 <= y0 + h0): continue
        n0 += 1; c = np.array(p.center[:])
        if np.dot(np.array(p.normal[:]), shell_axis(ob.name, c)) < -.25: bad0 += 1
    SHELL_TEST[ob.name] = {'outer_faces': n0, 'facing_their_axis': bad0}
HEAD_CZ = ns['HEAD_CZ']; eye_centers = ns['eye_centers']; ear_paths = ns['ear_paths']; tail_path = ns['tail_path']
objects = []
for name, group in parts.items():
    bpy.ops.object.select_all(action='DESELECT')
    for ob in group: ob.select_set(True)
    bpy.context.view_layer.objects.active = group[0]
    if len(group) > 1: bpy.ops.object.join()
    ob = bpy.context.object; ob.name = 'Chewy_' + name.replace('.', '_')
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bm = bmesh.new(); bm.from_mesh(ob.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-7)
    bmesh.ops.dissolve_degenerate(bm, edges=bm.edges[:], dist=1e-7)
    bad = [f for f in bm.faces if f.calc_area() < 1e-12]
    if bad: bmesh.ops.delete(bm, geom=bad, context='FACES')
    uvl_ = bm.loops.layers.uv.active
    def outfit_face(f):
        u, v = f.loops[0][uvl_].uv
        return any(x <= u * 2048 <= x + w and y <= v * 2048 <= y + h for (x, y, w, h) in SUB.values())
    bmesh.ops.recalc_face_normals(bm, faces=[f for f in bm.faces if not outfit_face(f)])
    bm.to_mesh(ob.data); bm.free()
    ob.data.materials.clear(); ob.data.materials.append(mat)
    for p in ob.data.polygons: p.material_index = 0; p.use_smooth = True
    piv = {'head': (0, 0, HEAD_CZ), 'eye.L': eye_centers['L'], 'eye.R': eye_centers['R'], 'ear.L': ear_paths['L'][0],
           'ear.R': ear_paths['R'][0], 'tail': tail_path[0], 'body': (0, 0, 0)}
    bpy.context.scene.cursor.location = piv[name]
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    objects.append(ob)
    for v in ob.data.vertices: assert all(math.isfinite(c) for c in v.co), 'Nonfinite geometry in ' + name
    for p in ob.data.polygons: assert all(math.isfinite(c) for c in p.normal), 'Nonfinite normal in ' + name
    ob['phase'] = 'Phase 1; unrigged'; ob['front_axis'] = '-Y'

# ------------------------------------------------------------------ 13b. every outer cloth face faces outward (the game culls back faces)
bodyob = [o for o in objects if o.name == 'Chewy_body'][0]; me_ = bodyob.data; uvd = me_.uv_layers.active.data
def region(p):
    u, v = uvd[p.loop_start].uv
    for nm, (x, y, w, h) in SUB.items():
        if x <= u * 2048 <= x + w and y <= v * 2048 <= y + h: return nm
    return None
def axis_out(nm, c):
    """The outward reference at a face centre: radial from the body, a leg, an arm or the saya axis."""
    if nm == 'hakama':                                   # the leg this face belongs to: the nearest leg surface
        side = 1 if LEGTREE_L.find(Vector(tuple(c)))[2] <= LEGTREE_R.find(Vector(tuple(c)))[2] else -1
        a = np.array([side * .14, .006, c[2]])
    elif nm == 'sleeve':
        S_ = SH['L' if c[0] > 0 else 'R']; t = float(np.dot(c - S_['sh'], S_['A'])); a = S_['sh'] + S_['A'] * t
    elif nm in ('sw_saya', 'sw_gold', 'sw_mouth'):
        t = float(np.clip(np.dot(c - SAYA_M, SAYA_D), -.01, SAYA_L + .02)); a = SAYA_M + SAYA_D * t
    else:
        a = np.array([0., .01, c[2]])
    r = c - a; n_ = np.linalg.norm(r)
    return r / n_ if n_ > 1e-9 else np.array([0, -1., 0])
OUTER = {'haori': 'haori body', 'sleeve': 'sleeves', 'collar': 'collar band', 'hakama': 'hakama legs', 'kimono': 'kimono front',
         'waist': 'waistband', 'sw_saya': 'saya', 'sw_gold': 'saya fittings', 'sw_cord': 'cord and sageo', 'sw_cream': 'kimono collar and beads'}
SHELLS = ('haori', 'sleeve', 'hakama', 'kimono')
from mathutils.kdtree import KDTree
def kd(P_):
    t_ = KDTree(len(P_))
    for i_, q_ in enumerate(P_): t_.insert(Vector(tuple(q_)), i_)
    t_.balance(); return t_
LEGTREE_L = kd(np.concatenate([LP_L.reshape(-1, 3), np.array([v.co[:] for v in leg_L.data.vertices]) if False else LP_L.reshape(-1, 3)]))
LEGTREE_R = kd(LP_R.reshape(-1, 3))
bvh_body = BVHTree.FromPolygons([v.co.copy() for v in me_.vertices], [tuple(p.vertices) for p in me_.polygons])
ocheck = {}
for p in me_.polygons:
    nm = region(p)
    if nm not in OUTER: continue
    e = ocheck.setdefault(OUTER[nm], {'faces': 0, 'toward_centre': 0, 'ray_hits_from_behind': 0, 'rays_hit_self': 0})
    e['faces'] += 1
    c = np.array(p.center[:]); n_ = np.array(p.normal[:]); ro = axis_out(nm, c)

    # a ray from outside (along the outward reference) aimed at this face: whatever it hits first must face the ray
    o = Vector(tuple(c + ro * .6)); d = Vector(tuple(-ro))
    hit, hn, fi, dist = bvh_body.ray_cast(o, d, 1.0)
    if hit is not None and fi == p.index:
        e['rays_hit_self'] += 1
        if me_.polygons[fi].normal.dot(d) > .2:          # clearly back-facing (grazing step faces of the gold rings and ribbon caps excluded)
            e['ray_hits_from_behind'] += 1; e.setdefault('examples', []).append(['behind', np.round(c, 3).tolist(), np.round(n_, 2).tolist(), round(p.area * 1e6, 1)])
for nm_, v_ in SHELL_TEST.items():
    key_ = {'haori_body': 'haori body', 'kimono_front': 'kimono front'}.get(nm_, 'sleeves' if nm_.startswith('box_sleeve') else 'hakama legs')
    ocheck[key_]['toward_centre'] += v_['facing_their_axis']; ocheck[key_].setdefault('shell_test_per_object', {})[nm_] = v_
OUTWARD_TOTAL = sum(v['toward_centre'] + v['ray_hits_from_behind'] for v in ocheck.values())
print('OUTWARD_CHECK', json.dumps(ocheck), 'total', OUTWARD_TOTAL, flush=True)

# ------------------------------------------------------------------ 14. joints (unchanged, the body is locked) and the saya mount
J = json.load(open(os.path.join(TASK, 'joints-round13.json'), encoding='utf-8'))
J['notes'] = list(J.get('notes', [])) + ['chewy-samurai: joint values copied unchanged from joints-round13.json; the head, arms, legs and tail are the locked chewy-b parts.']
json.dump(J, open(os.path.join(TASK, 'joints.json'), 'w', encoding='utf-8'), indent=2)
def game(p): return [round(float(p[0]), 5), round(float(p[2]), 5), round(float(-p[1]), 5)]
mount = {
    'units': 'metres, model space', 'blender_axes': 'Z up, front -Y, character left +X',
    'game_axes': 'glTF/three.js: Y up, front +Z; game = (bx, bz, -by)',
    'mouth_blender': [round(float(c), 5) for c in SAYA_M], 'mouth_game': game(SAYA_M),
    'blade_entry_dir_blender': [round(float(c), 5) for c in SAYA_D],
    'blade_entry_dir_game': game(SAYA_D),
    'edge_up_blender': [round(float(c), 5) for c in SAYA_UP], 'edge_up_game': game(SAYA_UP),
    'scabbard_length_m': round(SAYA_L, 4), 'inner_slot_depth_m': .012,
    'angle_below_horizontal_deg': round(math.degrees(math.asin(-SAYA_D[2])), 2),
    'tip_blender': [round(float(c), 5) for c in SAYA_T],
    'notes': ['The hilt goes at the mouth, pointing along -blade_entry_dir (forward, up and slightly inward); the blade runs along +blade_entry_dir.',
              'edge_up is the oval section\'s long axis (the blade\'s spine-to-edge plane), for orienting the katana in the scabbard.',
              'The saya is rigid; in phase 2 weight it 100% to hips.'],
}
json.dump(mount, open(os.path.join(TASK, 'saya_mount.json'), 'w', encoding='utf-8'), indent=2)

tri_count = 0
for ob in objects:
    ob.data.calc_loop_triangles(); tri_count += len(ob.data.loop_triangles)
    print('PART_TRIANGLES', ob.name, len(ob.data.loop_triangles), flush=True)
print('SAMURAI_BUILD_TRIANGLES', tri_count, flush=True)
assert tri_count <= 37367, f'Triangle budget exceeded: {tri_count}'
bpy.ops.object.select_all(action='DESELECT')
for ob in objects: ob.select_set(True)
bpy.context.view_layer.objects.active = objects[0]
bpy.ops.export_scene.gltf(filepath=MODEL, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                          export_attributes=True, export_vertex_color='ACTIVE', export_lights=False, export_cameras=False,
                          export_animations=False)
json.dump({'checks': CHECK, 'outward_faces': {'rule': 'per outer part: toward_centre = shell faces (haori, sleeves, each hakama leg, kimono front) whose normal points toward their own body, arm or leg axis (dot < -0.25), tested per part before the join; ray_hits_from_behind = faces that a ray from outside along the outward direction hits first while facing away from it (dot > 0.2); both must be 0', 'parts': ocheck, 'total_bad': OUTWARD_TOTAL},
           'triangles': tri_count, 'removed_costume': removed}, open(os.path.join(TASK, 'build-checks.json'), 'w'), indent=1)
assert OUTWARD_TOTAL == 0, f'{OUTWARD_TOTAL} outfit faces face inward'

# ------------------------------------------------------------------ 15. portrait: the base's studio framing and lights, unchanged
scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE_NEXT'
scene.render.resolution_x = 1100; scene.render.resolution_y = 1100; scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.view_settings.view_transform = 'Standard'
scene.view_settings.look = 'Medium High Contrast' if 'Medium High Contrast' in [x.identifier for x in bpy.types.ColorManagedViewSettings.bl_rna.properties['look'].enum_items] else 'None'
scene.world = bpy.data.worlds.new('portrait_world'); scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.52, .44, .36, 1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .45
def area(name, loc, power, size, color):
    data = bpy.data.lights.new(name, 'AREA'); data.energy = power; data.shape = 'DISK'; data.size = size; data.color = color
    ob = bpy.data.objects.new(name, data); scene.collection.objects.link(ob); ob.location = loc
    ob.rotation_euler = (Vector((0, 0, .91)) - ob.location).to_track_quat('-Z', 'Y').to_euler()
area('portrait_key', (-2.4, -3.4, 4.0), 220, 3.2, (1, .85, .73))
area('portrait_fill', (2.8, -1.8, 2.5), 115, 3.0, (.80, .88, 1))
area('portrait_rim', (.6, 2.0, 3.0), 180, 2.5, (1, .79, .60))
cam = bpy.data.objects.new('portrait_camera', bpy.data.cameras.new('portrait_camera')); scene.collection.objects.link(cam)
target = Vector((0, -.045, .940)); cam.location = (1.52, -2.75, 1.39)
cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler(); cam.data.type = 'ORTHO'; cam.data.ortho_scale = .96
scene.camera = cam; scene.render.film_transparent = True
scene.use_nodes = True
nt = scene.node_tree; nt.nodes.clear()
rl = nt.nodes.new('CompositorNodeRLayers'); over = nt.nodes.new('CompositorNodeAlphaOver'); over.inputs[0].default_value = 1
over.inputs[1].default_value = (.82, .76, .66, 1)
nt.links.new(rl.outputs['Image'], over.inputs[2])
comp = nt.nodes.new('CompositorNodeComposite'); nt.links.new(over.outputs[0], comp.inputs[0])
scene.render.filepath = os.path.join(TASK, 'portrait.png')
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(TASK, 'chewy-samurai.blend'))
if '--skip-portrait' not in sys.argv: bpy.ops.render.render(write_still=True)
print('SAMURAI_BUILD_DONE', MODEL, flush=True)
