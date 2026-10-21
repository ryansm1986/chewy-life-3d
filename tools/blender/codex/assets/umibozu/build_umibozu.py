"""Umibozu (Pawhaven boss, ROADMAP EN-1) -- deterministic build, Option A "Sleepy Sea Monk" (refs/sheet.png).

Blender 4.3:
  blender --background --factory-startup --python build_umibozu.py [-- --what body|hand|all]

Builds from an empty scene, saves umibozu.blend (+ umibozu-hand.blend) and exports
  public/models/umibozu.glb       the body, in model units (the game scales x4.4), z 0 = the waterline
  public/models/umibozu-hand.glb  the mitten hand, in metres: wrist at the origin, fingers -Y, palm -Z, thumb +X
Blender axes: front = -Y, up = +Z, character left = +X (the builder's L = -X).

Boss contract (tools/blender/work/codex/boss-contract.md on top of the enemy contract): flat named rigid parts, each
object's origin its pivot, rotation 0 / scale 1, vertex colours only (one face-corner attribute `Col`), one material
`toon`, closed volumes / tucked decals, smooth normals.
  body        (0, 0, 0)       the gumdrop body + shoulder sleeves, eye sockets + heavy lids, blush, juzu, gold bead, sprout
  eyeL/eyeR   eye centres     the eye whites (domed lenses following the face, ~20 deg outward)
  pupilL/R    on the white    pupil + catchlights, at the game's rest offset (0, -0.035) below the eye centre
  mouthSmile  MOUTH           the smile stroke
  mouthOpen   MOUTH           the open "O" (plum lip, dark inside, pink tongue)
  cheeks      MOUTH           the two puffed cheek lobes (blush on them) + a pursed "o"

Technique: the body is a generalised lathe (a profile measured on the sheet, a per-height superellipse cross-section
with separate front / back depth, a radial shoulder bulge) so every face feature is a decal shell projected exactly
onto it (rows of points pushed out along the surface normal, a skirt tucked under the surface). Beads, cheeks are
ellipsoid grids; the sprout and leaf are sweeps; the hand is a smooth union of ellipsoids sampled on a star grid.
"""
import bpy, bmesh, math, os, sys, json
import numpy as np
from mathutils import Vector

TASK_DIR = 'D:/projects/chewy-life-3d/tools/blender/work/codex/umibozu'
MODELS = 'D:/projects/chewy-life-3d/public/models'
ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(name, default=None):
    return ARGV[ARGV.index(name) + 1] if name in ARGV else default
WHAT = arg('--what', 'all')
PI = math.pi
print('UMI pid', os.getpid())

# =========================================================================================== small math
def nrm(v):
    v = np.asarray(v, float); return v / np.linalg.norm(v, axis=-1, keepdims=True)
def L(q): return np.sqrt(np.einsum('...i,...i->...', q, q))
def clamp01(x): return np.clip(x, 0, 1)
def sstep(a, b, x):
    t = clamp01((np.asarray(x, float) - a) / (b - a)); return t * t * (3 - 2 * t)
def smin(a, b, k):
    h = clamp01(.5 + .5 * (b - a) / k); return b * (1 - h) + a * h - k * h * (1 - h)
def rot(axis, ang):
    axis = nrm(axis); x, y, z = axis; c, s = math.cos(ang), math.sin(ang); C = 1 - c
    return np.array([[c + x * x * C, x * y * C - z * s, x * z * C + y * s],
                     [y * x * C + z * s, c + y * y * C, y * z * C - x * s],
                     [z * x * C - y * s, z * y * C + x * s, c + z * z * C]])
def srgb_lin(h):
    h = h.lstrip('#'); c = np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)])
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)

def sd_ell(p, c, r, R=None):
    d = p - np.asarray(c, float)
    if R is not None: d = d @ R
    r = np.asarray(r, float)
    k0 = L(d / r); k1 = L(d / (r * r))
    return np.where(k1 < 1e-7, -r.min(), k0 * (k0 - 1) / np.maximum(k1, 1e-9))
def sd_cap(p, a, b, r):
    a = np.asarray(a, float); ba = np.asarray(b, float) - a; pa = p - a
    h = np.clip((pa @ ba) / (ba @ ba), 0, 1)
    return L(pa - h[..., None] * ba) - r
def grad(f, P, h=1e-4):
    e = np.eye(3) * h
    return np.stack([f(P + e[i]) - f(P - e[i]) for i in range(3)], -1) / (2 * h)
def unit_normals(sdf, P):
    g = grad(sdf, P); return g / np.maximum(L(g), 1e-12)[:, None]
def ray_exit(sdf, O, D, tmax, K=160, iters=32):
    D = np.asarray(D, float); N = len(D); O = np.broadcast_to(np.asarray(O, float), D.shape)
    ts = np.linspace(0, tmax, K)
    lo = np.zeros(N); hi = np.full(N, tmax); found = np.zeros(N, bool)
    for k in range(1, K):
        v = sdf(O + D * ts[k]); newly = (~found) & (v >= 0)
        lo[newly] = ts[k - 1]; hi[newly] = ts[k]; found |= newly
        if found.all(): break
    assert found.all(), 'ray_exit: ray without exit'
    for _ in range(iters):
        mid = .5 * (lo + hi); inside = sdf(O + D * mid[:, None]) < 0
        lo = np.where(inside, mid, lo); hi = np.where(inside, hi, mid)
    return O + D * (.5 * (lo + hi))[:, None]

def rows_mesh(rows):
    """rows: list of (n, 3) rings or (1, 3) poles -> verts, quads/tris"""
    V = []; F = []; idx = []
    for r in rows:
        idx.append(list(range(len(V), len(V) + len(r)))); V.extend(list(r))
    for a, b in zip(idx[:-1], idx[1:]):
        if len(a) == 1:
            n = len(b); F += [(a[0], b[(j + 1) % n], b[j]) for j in range(n)]
        elif len(b) == 1:
            n = len(a); F += [(a[j], a[(j + 1) % n], b[0]) for j in range(n)]
        else:
            n = len(a); F += [(a[j], a[(j + 1) % n], b[(j + 1) % n], b[j]) for j in range(n)]
    return np.array(V, float), F

def star_rows(sdf, centre, axis, ref, thetas, nseg, tmax):
    a = nrm(axis); r = nrm(np.asarray(ref, float) - np.dot(ref, a) * a); b = np.cross(a, r)
    rows = []
    for th in thetas:
        if th < 1e-6 or th > PI - 1e-6:
            D = np.array([a if th < 1 else -a])
        else:
            ph = 2 * PI * np.arange(nseg) / nseg
            D = (math.cos(th) * a + math.sin(th) * (np.cos(ph)[:, None] * r + np.sin(ph)[:, None] * b))
        rows.append(ray_exit(sdf, centre, D, tmax))
    return rows

def catmull(ctrl, n):
    P = np.asarray(ctrl, float); P = np.vstack([2 * P[0] - P[1], P, 2 * P[-1] - P[-2]])
    pts = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for t in np.linspace(0, 1, 40, endpoint=False):
            t2, t3 = t * t, t * t * t
            pts.append(.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    pts.append(P[-2]); pts = np.array(pts)
    seg = L(pts[1:] - pts[:-1]); cum = np.concatenate([[0], np.cumsum(seg)])
    s = np.linspace(0, cum[-1], n)
    return np.stack([np.interp(s, cum, pts[:, k]) for k in range(pts.shape[1])], -1), cum[-1]

def sweep(ctrl, nr, nseg, prof, side, expo=2.0, capr=(1.0, 1.0), cap_rings=3, twist=None):
    """tube along a Catmull-Rom curve; prof(s) -> (rn, rb) half-sizes along N and B; ball caps (scaled by capr)"""
    C, _ = catmull(ctrl, nr)
    T = np.gradient(C, axis=0); T /= L(T)[:, None]
    B0 = nrm(np.asarray(side, float) - (np.asarray(side, float) @ T[0]) * T[0]); Bs = [B0]
    for i in range(1, nr):
        b = Bs[-1] - (Bs[-1] @ T[i]) * T[i]; Bs.append(nrm(b))
    B = np.array(Bs); N = np.cross(T, B)
    s = np.linspace(0, 1, nr)
    if twist is not None:
        for i in range(nr):
            R = rot(T[i], twist(s[i])); N[i] = R @ N[i]; B[i] = R @ B[i]
    ph = 2 * PI * np.arange(nseg) / nseg; ex = 2.0 / expo
    cu = np.sign(np.cos(ph)) * np.abs(np.cos(ph)) ** ex; su = np.sign(np.sin(ph)) * np.abs(np.sin(ph)) ** ex
    def ring(c, n, b, rn, rb, sc=1.0):
        return c + sc * (rn * cu[:, None] * n + rb * su[:, None] * b)
    rows = []
    rn, rb = prof(0.0); rc = min(rn, rb) * capr[0]
    for a in np.linspace(PI / 2, 0, cap_rings + 2)[:-1]:
        if a > PI / 2 - 1e-6: rows.append((C[0] - T[0] * rc)[None])
        else: rows.append(ring(C[0] - T[0] * rc * math.sin(a), N[0], B[0], rn, rb, math.cos(a)))
    for i in range(nr):
        rn, rb = prof(s[i]); rows.append(ring(C[i], N[i], B[i], rn, rb))
    rn, rb = prof(1.0); rc = min(rn, rb) * capr[1]
    for a in np.linspace(0, PI / 2, cap_rings + 2)[1:]:
        if a > PI / 2 - 1e-6: rows.append((C[-1] + T[-1] * rc)[None])
        else: rows.append(ring(C[-1] + T[-1] * rc * math.sin(a), N[-1], B[-1], rn, rb, math.cos(a)))
    V, F = rows_mesh(rows)
    return V, F, dict(C=C, T=T, N=N, B=B, rows=[len(r) for r in rows])

def ell_grid(c, R, radii, n_lat, n_lon, lat=None):
    """ellipsoid grid around its local +z pole: R columns = local axes (x, y, z) in world. lat: polar angles (deg)"""
    th = np.radians(lat) if lat is not None else np.linspace(0, PI, n_lat)
    rows = []
    for t in th:
        if t < 1e-6: q = np.array([[0, 0, 1.0]])
        elif t > PI - 1e-6: q = np.array([[0, 0, -1.0]])
        else:
            ph = 2 * PI * np.arange(n_lon) / n_lon
            q = np.stack([math.sin(t) * np.cos(ph), math.sin(t) * np.sin(ph), np.full(n_lon, math.cos(t))], -1)
        rows.append(np.asarray(c, float) + (q * np.asarray(radii, float)) @ np.asarray(R, float).T)
    return rows_mesh(rows), th

def frame_z(n, ref=(0, 0, 1)):
    """3x3 with columns (u, v, n): n = the local +z; v as close to ref as possible"""
    n = nrm(n); v = np.asarray(ref, float) - np.dot(ref, n) * n
    if np.linalg.norm(v) < 1e-6: v = np.array([0, 1.0, 0]) - n[1] * n
    v = nrm(v); u = np.cross(v, n)
    return np.stack([u, v, n], 1)

# =========================================================================================== the body surface
# profile (half-width a, z) measured on the sheet's front view (eye centres = +-0.2 units, eye height 0.79)
PROF = [(0.0, -0.62), (0.30, -0.62), (0.45, -0.60), (0.53, -0.55), (0.575, -0.45), (0.590, -0.30), (0.593, -0.10),
        (0.591, 0.05), (0.586, 0.15), (0.576, 0.25), (0.556, 0.35), (0.527, 0.45), (0.493, 0.53), (0.465, 0.60),
        (0.449, 0.68), (0.443, 0.74), (0.436, 0.79), (0.425, 0.84), (0.407, 0.885), (0.385, 0.925), (0.356, 0.97),
        (0.313, 1.025), (0.266, 1.07), (0.207, 1.112), (0.138, 1.150), (0.068, 1.177), (0.0, 1.189)]
PD, _ = catmull(PROF, 1200)            # dense smooth profile (a, z)
PD[0] = (0.0, -0.62); PD[-1] = (0.0, 1.189)
ZTOP = 1.189
_mono = PD[:, 1] > -0.595              # the z-monotonic part (the flat bottom excluded)
_PZ, _PA = PD[_mono, 1], PD[_mono, 0]
def a_of_z(z): return np.interp(z, _PZ, _PA)
def kf(z): return 0.885 + (0.955 - 0.885) * sstep(0.30, 0.62, z)     # front depth / half-width
def kb(z): return 1.02 + (0.905 - 1.02) * sstep(0.28, 0.62, z)       # back depth / half-width
def nf(z): return 2.15 + (2.38 - 2.15) * sstep(0.35, 0.65, z)        # front superellipse exponent (a flatter face)
def nb(z): return 2.10 + 0.0 * z
SH_TH, SH_Z, SH_ST, SH_SZ, SH_B = math.radians(80), 0.26, 0.55, 0.25, 0.34
def bump(z, th):
    """the shoulder sleeves: a radial bulge on both flanks (the game's hose arms start at (+-0.8, 0.16 fwd, 0.1))"""
    g = np.exp(-((np.asarray(z) - SH_Z) / SH_SZ) ** 2) * (1 - 0.55 * sstep(SH_Z, SH_Z + 0.45, z))
    h = np.exp(-((np.abs(th) - SH_TH) / SH_ST) ** 2)
    return SH_B * g * h
def rho(z, th, a=None):
    """polar radius of the cross-section at height z in direction th (0 = front -Y, +pi/2 = +X)"""
    z = np.asarray(z, float); th = np.asarray(th, float)
    a = a_of_z(z) if a is None else a
    s, c = np.abs(np.sin(th)), np.cos(th)
    front = c > 0
    d = np.where(front, kf(z), kb(z)) * a; n = np.where(front, nf(z), nb(z))
    r = 1.0 / ((s / np.maximum(a, 1e-6)) ** n + (np.abs(c) / np.maximum(d, 1e-6)) ** n) ** (1.0 / n)
    return r * (1 + bump(z, th))
def S(z, th, a=None):
    r = rho(z, th, a)
    return np.stack([r * np.sin(th), -r * np.cos(th), np.broadcast_to(np.asarray(z, float), np.shape(r))], -1)
def S_norm(z, th):
    """outward unit normal at (z, th) by finite differences"""
    e = 1e-4
    dth = (S(z, th + e) - S(z, th - e)) / (2 * e); dz = (S(z + e, th) - S(z - e, th)) / (2 * e)
    n = np.cross(dth, dz); n = n / np.maximum(L(n), 1e-12)[..., None]
    P = S(z, th); out = np.stack([P[..., 0], P[..., 1], np.zeros_like(P[..., 2])], -1)
    return np.where((np.einsum('...i,...i->...', n, out) < 0)[..., None], -n, n)
def theta_of(q): return np.arctan2(q[..., 0], -q[..., 1])
def proj(q, off=0.0):
    """project points horizontally (radially) onto the body; push out along the normal by off. -> P, N"""
    q = np.asarray(q, float); z = q[..., 2]; th = theta_of(q)
    P = S(z, th); N = S_norm(z, th)
    return P + N * np.asarray(off, float)[..., None] if np.ndim(off) else P + N * off, N
def surf_at_x(x, z):
    """the front surface point with this x at height z (bisection on th)"""
    lo, hi = 0.0, PI / 2
    for _ in range(50):
        m = .5 * (lo + hi)
        if S(z, m)[0] < x: lo = m
        else: hi = m
    return .5 * (lo + hi)

def build_body_shell():
    """rows along the profile (arc-length spaced, a little coarser under the water), 76 columns"""
    seg = L(PD[1:] - PD[:-1]); cum = np.concatenate([[0], np.cumsum(seg)])
    w = np.where(PD[:, 1] < -0.15, 0.55, 1.0)                       # (row density weight: coarser under water)
    wc = np.concatenate([[0], np.cumsum(seg * .5 * (w[1:] + w[:-1]))])
    NR = 50; t = np.linspace(0, wc[-1], NR)
    rows = []; NC = 76
    th = 2 * PI * (np.arange(NC)) / NC - PI
    for k, tt in enumerate(t):
        a = np.interp(tt, wc, PD[:, 0]); z = np.interp(tt, wc, PD[:, 1])
        if k == 0: rows.append(np.array([[0, 0, -0.62]])); continue
        if k == NR - 1: rows.append(np.array([[0, 0, ZTOP]])); continue
        rows.append(S(np.full(NC, z), th, a=np.full(NC, a)))
    V, F = rows_mesh(rows)
    return V, F

# =========================================================================================== colours
PAL = {
    'body': '#1f7480', 'body_hi': '#358e9d', 'body_lo': '#195a66', 'wet': '#19515d',
    'lid': '#2d5e68', 'line': '#25343b', 'socket': '#31636e',
    'white': '#fff8ef', 'pupil': '#18252d', 'catch': '#ffffff',
    'blush': '#ed91a0', 'pearl': '#f2e4c7', 'pearl_hi': '#fff4de', 'pearl_lo': '#d6c39f',
    'gold': '#d8aa45', 'gold_hi': '#f2d27e', 'gold_lo': '#b2852c',
    'kelp': '#5c873e', 'kelp_tip': '#93b95d', 'kelp_dk': '#4a7232', 'rib': '#4b7433',
    'smile': '#3a2333', 'lip': '#683c51', 'mouth_in': '#3a1d2c', 'tongue': '#dc8f91',
    'cheek': '#268390', 'palm': '#287e8a',
}

# =========================================================================================== mesh assembly
class Shell:
    """one shell of a part: verts, faces (tris / quads), per-face colour keys (or a function of the centroid),
    closed (recalc normals) or a decal (orient along `ori(points) -> normals`), optional shading function"""
    def __init__(self, name, V, F, keys, closed=True, ori=None, shade=None, cull=None):
        self.name, self.V, self.F = name, np.asarray(V, float), [tuple(f) for f in F]
        self.keys, self.closed, self.ori, self.shade, self.cull = keys, closed, ori, shade, cull

def default_shade(rgb, P, N):
    k = 1.0 - 0.10 * clamp01(-N[:, 2]) ** 1.2 + 0.03 * clamp01(N[:, 2]); return rgb * k[:, None]

def bake_shell(sh):
    bm = bmesh.new(); vs = [bm.verts.new(Vector(v)) for v in sh.V]
    for f in sh.F:
        try: bm.faces.new([vs[i] for i in f])
        except ValueError: pass
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-7)
    bmesh.ops.triangulate(bm, faces=bm.faces[:], quad_method='BEAUTY', ngon_method='BEAUTY')
    bm.normal_update()
    if sh.closed:
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    elif sh.ori is not None:
        fl = list(bm.faces); C = np.array([f.calc_center_median() for f in fl]); Nf = np.array([f.normal for f in fl])
        bad = np.einsum('ij,ij->i', Nf, sh.ori(C)) < 0
        if bad.any(): bmesh.ops.reverse_faces(bm, faces=[f for f, m in zip(fl, bad) if m])
    bm.normal_update(); bm.verts.index_update()
    P = np.array([v.co for v in bm.verts]); Nv = np.array([v.normal for v in bm.verts])
    T = np.array([[v.index for v in f.verts] for f in bm.faces]); Cn = P[T].mean(1)
    keys = sh.keys(Cn, T) if callable(sh.keys) else np.full(len(T), sh.keys, dtype=object)
    bm.free()
    if sh.cull is not None:   # drop faces buried deep inside another shell of the part
        keep = ~(sh.cull(P)[T] > 0.0).all(1)
        T, keys = T[keep], np.asarray(keys)[keep]
        used = np.unique(T); remap = -np.ones(len(P), int); remap[used] = np.arange(len(used))
        P, Nv, T = P[used], Nv[used], remap[T]
    return dict(P=P, N=Nv, T=T, keys=np.asarray(keys, dtype=object), shade=sh.shade or default_shade, name=sh.name)

def make_material():
    m = bpy.data.materials.get('toon') or bpy.data.materials.new('toon')
    m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); bs = nt.nodes.new('ShaderNodeBsdfPrincipled')
    ca = nt.nodes.new('ShaderNodeVertexColor'); ca.layer_name = 'Col'
    nt.links.new(ca.outputs['Color'], bs.inputs['Base Color']); nt.links.new(bs.outputs['BSDF'], out.inputs['Surface'])
    bs.inputs['Roughness'].default_value = 0.8; bs.inputs['Metallic'].default_value = 0.0
    return m

def make_object(name, shells, origin):
    items = [bake_shell(s) for s in shells]
    origin = np.asarray(origin, float)
    P = np.concatenate([it['P'] for it in items]) - origin
    N = np.concatenate([it['N'] for it in items])
    T, off = [], 0
    for it in items: T.append(it['T'] + off); off += len(it['P'])
    T = np.concatenate(T)
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(p) for p in P], [], [tuple(int(i) for i in t) for t in T]); me.update()
    me.polygons.foreach_set('use_smooth', np.ones(len(me.polygons), bool))
    cols = []
    for it in items:
        base = np.array([srgb_lin(PAL[k]) for k in it['keys']]).reshape(-1, 3)
        li = it['T'].ravel(); rgb = np.repeat(base, 3, 0)
        cols.append(it['shade'](rgb, it['P'][li], it['N'][li]))
    rgb = np.clip(np.concatenate(cols), 0, 1)
    ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    ca.data.foreach_set('color', np.hstack([rgb, np.ones((len(rgb), 1))]).astype(np.float32).ravel())
    me.color_attributes.active_color = ca; me.color_attributes.render_color_index = 0
    me.normals_split_custom_set_from_vertices([tuple(n) for n in N])
    me.materials.append(make_material())
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
    ob.location = Vector(origin)
    return ob, {it['name']: len(it['T']) for it in items}

# =========================================================================================== decals on the body
SKIRT_OUT, SKIRT_DN = 0.004, -0.0025
def body_ori(C): return proj(C)[1]

def patch_rows(centre_uv, frame, radii_fn, fracs, heights, nseg, host_off=0.0, phase=0.5):
    """polar decal rows around a surface point: frame = (E, U, V) (E on the body); radii_fn(ang) -> (ru, rv);
    fracs: ring fractions (0 = the centre pole), heights: offset along the body normal per ring"""
    E, U, V = frame; cu, cv = centre_uv
    ang = 2 * PI * (np.arange(nseg) + phase) / nseg
    ru, rv = radii_fn(ang)
    rows = []
    for f, h in zip(fracs, heights):
        if f == 0:
            q = (E + cu * U + cv * V)[None]
        else:
            q = E + (cu + f * ru * np.cos(ang))[:, None] * U + (cv + f * rv * np.sin(ang))[:, None] * V
        P, _ = proj(q, h); rows.append(P)
    return rows

def eye_frame(k):
    th = surf_at_x(0.2, 0.79) * k
    E = S(0.79, th); N = S_norm(0.79, th)
    U = nrm(np.cross([0, 0, 1.0], N)); V = np.cross(N, U)
    return E, U, V, N
EYE_A, EYE_B = 0.104, 0.124            # the eye oval (socket incl. its outline), sheet
LID_V0, LID_SAG = 0.006, 0.010         # lid line height above the eye centre (middle) / rise toward the sides
def lid_v(u): return LID_V0 + LID_SAG * (u / EYE_A) ** 2 + 0.003 * (u / EYE_A)

def build_socket(k):
    """the eye socket on the body: the oval in the lid colour (shows when the eye blinks) with a thin dark outline"""
    E, U, V, N = eye_frame(k)
    fr = [0, 0.4, 0.75, 0.915, 1.0, 1.0 + SKIRT_OUT / 0.11]
    hs = [0.0016, 0.0016, 0.0016, 0.0016, 0.0016, SKIRT_DN]
    rows = patch_rows((0, 0), (E, U, V), lambda a: (np.full_like(a, EYE_A), np.full_like(a, EYE_B)), fr, hs, 28)
    Vv, F = rows_mesh(rows)
    nseg = 28; ring_of = np.concatenate([[0]] + [[i] * nseg for i in range(1, len(rows))])
    def keys(Cn, T):
        rr = ring_of[T].min(1); return np.where(rr >= 3, 'line', 'socket')
    return Shell(f'socket{k}', Vv, F, keys, closed=False, ori=body_ori)

def build_lid(k):
    """the heavy upper lid: a raised shell over the top of the oval, flush at the top, ~2.6 cm proud at its lower
    rim, which rolls under toward the eye (the dark lid line along the rim)"""
    E, U, V, N = eye_frame(k)
    A, B = EYE_A - 0.009, EYE_B - 0.009
    # columns across u; the lid spans from the lid line up to the oval top
    ncol = 17
    # find u range where lid_v(u) < oval top
    us = np.linspace(-A, A, 401); top = B * np.sqrt(clamp01(1 - (us / A) ** 2)); ok = top - lid_v(us) > 0.004
    u0, u1 = us[ok].min(), us[ok].max()
    ucols = u0 + (u1 - u0) * (0.5 - 0.5 * np.cos(np.linspace(0, PI, ncol)))
    # profile across the lid from the rim (s = 0) to the top edge (s = 1): (s, height, dv) ; rim rows dark
    prof = [  # (v-param or rim offset, height); rim rows below the lid line roll under
        ('r', -0.020, -0.004), ('r', -0.012, 0.0105), ('r', -0.006, 0.0155), ('r', 0.000, 0.0185),
        ('s', 0.10, 0.0185), ('s', 0.30, 0.0160), ('s', 0.55, 0.0120), ('s', 0.80, 0.0085), ('s', 1.0, 0.0050),
        ('e', SKIRT_OUT, SKIRT_DN)]
    rows = []
    for kind, a_, h in prof:
        vl = lid_v(ucols); vt = B * np.sqrt(clamp01(1 - (ucols / A) ** 2))
        if kind == 'r':
            v = vl + a_ * 0.6; uu = ucols * (1 - 0.0 * a_)
            if a_ < -0.015: v = vl + 0.006                                 # (tucks back under the lid, behind the white)
        elif kind == 's': v = vl + (vt - vl) * a_; uu = ucols
        else: v = vt + a_; uu = ucols * (1 + a_ / A)
        q = E + uu[:, None] * U + v[:, None] * V
        tap = 0.30 + 0.70 * sstep(0.004, 0.040, vt - vl)
        hh = np.where(h > 0, h * tap, h)
        P, _ = proj(q, hh); rows.append(P)
    # open grid: columns x rows (not closed around); ends: pinch the first / last column (lid corners)
    nrow = len(rows); G = np.stack(rows, 0)             # (nrow, ncol, 3)
    Vv = G.reshape(-1, 3); F = []
    for i in range(nrow - 1):
        for j in range(ncol - 1):
            a0 = i * ncol + j; F.append((a0, a0 + 1, a0 + ncol + 1, a0 + ncol))
    # side caps: fan each end column into a point tucked below the surface just outside the corner
    for j, sgn in ((0, -1), (ncol - 1, 1)):
        c = G[:, j].mean(0); cq = c + sgn * U * 0.006
        tip, _ = proj(cq[None], SKIRT_DN); ti = len(Vv); Vv = np.vstack([Vv, tip])
        for i in range(nrow - 1): F.append((i * ncol + j, (i + 1) * ncol + j, ti))
    rowk = np.concatenate([np.full(ncol, i) for i in range(nrow)] + [[99, 99]])
    def keys(Cn, T):
        r = rowk[T]; rmin = np.where(r == 99, 0, r).min(1)
        return np.where(np.where(r == 99, -1, r).max(1) <= 4, 'line', 'lid')
    return Shell(f'lid{k}', Vv, F, keys, closed=False, ori=body_ori)

def build_blush(k, centre=(0.276, 0.645), ru=0.043, rv=0.028, host='body'):
    th = surf_at_x(centre[0], centre[1]) * k
    E = S(centre[1], th); Nn = S_norm(centre[1], th)
    U = nrm(np.cross([0, 0, 1.0], Nn)); Vd = np.cross(Nn, U)
    fr = [0, 0.5, 1.0, 1.0 + SKIRT_OUT / 0.03]; hs = [0.0015, 0.0015, 0.0015, SKIRT_DN]
    rows = patch_rows((0, 0), (E, U, Vd), lambda a: (np.full_like(a, ru), np.full_like(a, rv)), fr, hs, 14)
    Vv, F = rows_mesh(rows); nseg = 14
    ring_of = np.concatenate([[0]] + [[i] * nseg for i in range(1, len(rows))])
    def keys(Cn, T): return np.where(ring_of[T].max(1) >= 3, 'body', 'blush')
    return Shell(f'blush{k}', Vv, F, keys, closed=False, ori=body_ori, shade=body_shade)

# =========================================================================================== body shading
def body_shade(rgb, P, N):
    hi, lo, wet = srgb_lin(PAL['body_hi']), srgb_lin(PAL['body_lo']), srgb_lin(PAL['wet'])
    isbody = (np.abs(rgb - srgb_lin(PAL['body'])[None]).sum(1) < 1e-6)[:, None]
    t_hi = (clamp01(N[:, 2]) ** 1.5 * 0.55 + clamp01(-N[:, 1]) * 0.15 * sstep(0.2, 0.9, P[:, 2]))[:, None]
    t_lo = (clamp01(-N[:, 2]) ** 1.1 * 0.55)[:, None]
    t_wet = (sstep(0.10, -0.12, P[:, 2]) * 0.75)[:, None]
    c = rgb * (1 - t_hi) + hi * t_hi
    c = c * (1 - t_lo) + lo * t_lo
    c = c * (1 - t_wet) + wet * t_wet
    return np.where(isbody, c, default_shade(rgb, P, N))

# =========================================================================================== beads
BEAD_R, GOLD_R = 0.071, 0.088
def bead_h(th): return 0.5275 - 0.095 * np.cos(th) - 0.0725 * np.cos(2 * th)
def bead_path(n=2000):
    th = np.linspace(-PI, PI, n, endpoint=False)
    z = bead_h(th); P = S(z, th); Nn = S_norm(z, th)
    return th, P, Nn
def build_beads():
    th, P, Nn = bead_path()
    Cn = P + Nn * (BEAD_R * 0.42)                     # pearl centres (the gold bead sits a little further out)
    # arc length from the front (th = 0), both ways
    i0 = int(np.argmin(np.abs(th)))
    order = np.r_[i0:len(th), 0:i0]; C = Cn[order]; TH = th[order]
    seg = L(np.roll(C, -1, 0) - C); cum = np.concatenate([[0], np.cumsum(seg)])[:-1]; tot = cum[-1] + seg[-1]
    first = GOLD_R + BEAD_R * 0.97; last = tot - first
    npearl = int(round((last - first) / (2 * BEAD_R * 1.01))) + 1
    ss = np.linspace(first, last, npearl)
    shells = []
    for i, s_ in enumerate(ss):
        k = int(np.searchsorted(cum, s_)) % len(C); c = C[k]
        nn = Nn[order][k]
        Rf = frame_z(nn, (0, 0, 1))
        (Vv, F), lat = ell_grid(c, frame_z([0, 0, 1.0], (0, 1, 0)), (BEAD_R,) * 3, 9, 12)
        shells.append(Shell(f'pearl{i}', Vv, F, 'pearl', shade=pearl_shade))
    # the gold mother bead: a slightly flattened bead facing out
    g_th = 0.0; gz = bead_h(np.array(g_th)); gp = S(gz, np.array(g_th)); gn = S_norm(gz, np.array(g_th))
    gc = gp + gn * 0.036
    (Vv, F), _ = ell_grid(gc, frame_z(gn, (0, 0, 1)), (GOLD_R, GOLD_R, 0.066), 11, 16)
    shells.append(Shell('gold', Vv, F, 'gold', shade=gold_shade))
    return shells, npearl

def pearl_shade(rgb, P, N):
    hi, lo = srgb_lin(PAL['pearl_hi']), srgb_lin(PAL['pearl_lo'])
    t = N[:, 2][:, None]
    return np.where(t > 0, rgb * (1 - 0.6 * t) + hi * 0.6 * t, rgb * (1 + 0.75 * t) - lo * 0.75 * t)
def gold_shade(rgb, P, N):
    hi, lo = srgb_lin(PAL['gold_hi']), srgb_lin(PAL['gold_lo'])
    t = (N[:, 2] * 0.8 - N[:, 0] * 0.2)[:, None]
    return np.where(t > 0, rgb * (1 - 0.7 * t) + hi * 0.7 * t, rgb * (1 + 0.8 * t) - lo * 0.8 * t)

# =========================================================================================== the sprout
def build_sprout():
    stem = [(-0.025, 0.035, 1.12), (-0.020, 0.036, 1.215), (-0.010, 0.040, 1.300), (0.020, 0.052, 1.362),
            (0.070, 0.075, 1.378), (0.112, 0.104, 1.352)]
    V1, F1, info = sweep(stem, 16, 10, lambda s: (0.035 - 0.010 * s, 0.035 - 0.010 * s), [1, 0, 0], capr=(1.0, 0.9))
    sh = [Shell('stem', V1, F1, 'kelp_dk', shade=kelp_shade)]
    # the leaf: a broad blade from the stem tip toward +X and back, its broad face turned up toward the camera
    a = np.array([0.100, 0.094, 1.355]); d = nrm([0.72, 0.60, -0.26])
    up = nrm([0.0, -0.55, 0.85]); up = nrm(up - (up @ d) * d); side = nrm(np.cross(up, d))
    Lf = 0.34
    ctrl = [a + d * Lf * t + up * (0.035 * math.sin(PI * t) - 0.012 * t * t) for t in (0.0, 0.25, 0.5, 0.75, 1.0)]
    def prof(s):
        w = 0.084 * (math.sin(PI * min(1, s * 1.04) ** 0.72)) + 0.012
        th = 0.0105 * (1 - 0.45 * s) + 0.002
        return th, w
    V2, F2, inf2 = sweep(ctrl, 18, 14, prof, side, expo=2.4, capr=(0.8, 1.0), cap_rings=2,
                         )
    def leaf_shade(rgb, P, N):
        t = clamp01((P - a) @ d / Lf); g = sstep(0.25, 0.95, t)[:, None]
        c = rgb * (1 - g) + srgb_lin(PAL['kelp_tip'])[None] * g
        return kelp_shade(c, P, N)
    sh.append(Shell('leaf', V2, F2, 'kelp', shade=leaf_shade))
    return sh
def kelp_shade(rgb, P, N):
    k = 1.0 - 0.18 * clamp01(-N[:, 2]) + 0.06 * clamp01(N[:, 2]); return rgb * k[:, None]

# =========================================================================================== the parts
EYE_PIVOT = {}
def build_eye(k):
    """the eye white: a domed lens over the whole oval (its top under the lid), clean flat white"""
    E, U, V, N = eye_frame(k)
    A, B = EYE_A - 0.0085, EYE_B - 0.0085
    fr = [0, 0.3, 0.55, 0.75, 0.9, 1.0, 1.0 + 0.004 / 0.1]
    hs = [0.0125, 0.0118, 0.0102, 0.0082, 0.0060, 0.0038, -0.0030]
    rows = patch_rows((0, 0), (E, U, V), lambda a: (np.full_like(a, A), np.where(np.sin(a) > 0, WHITE_BUP, B)), fr, hs, 30)
    print('UMI eye', k, 'normal', np.round(N, 3), 'outward deg', round(math.degrees(math.atan2(abs(N[0]), -N[1])), 1))
    Vv, F = rows_mesh(rows)
    piv = np.array([E[0], E[1] + 0.010, 0.79])          # (x = +-0.2, z = 0.79 as the brief; 1 cm behind the face)
    EYE_PIVOT[k] = piv
    flat = lambda rgb, P, Nn: rgb * (1 - 0.06 * clamp01(-(Nn @ V)))[:, None]   # (a whisper of shade at the bottom)
    return Shell(f'eye{k}', Vv, F, 'white', closed=False, ori=body_ori, shade=flat), piv

PUPIL_R, PUPIL_DV = 0.047, -0.035
WHITE_BUP = 0.080                      # the white's top semi-axis (its top edge stays well under the lid)
PUP_H = 0.0110                         # the pupil rim's height over the white (the dome rises 4.5 mm more)
def white_front(E, U, V, u, v):
    """a point on the eye white's front surface (the lens height profile at this radius)"""
    A, B = EYE_A - 0.0085, EYE_B - 0.0085
    r = np.sqrt((u / A) ** 2 + (v / np.where(v > 0, WHITE_BUP, B)) ** 2)
    fr = np.array([0, 0.3, 0.55, 0.75, 0.9, 1.0]); hs = np.array([0.0125, 0.0118, 0.0102, 0.0082, 0.0060, 0.0038])
    h = np.interp(r, fr, hs)
    q = E + np.outer(u, U) + np.outer(v, V)
    return proj(q, h)
def build_pupil(k):
    """the pupil: a dark dome lying on the white (deep skirt: the game slides it +-3 cm), a big + a small catchlight"""
    E, U, V, N = eye_frame(k)
    nseg = 22; ang = 2 * PI * (np.arange(nseg) + 0.5) / nseg
    rows = []
    for f, dh in ((0.0, PUP_H + 0.0045), (0.45, PUP_H + 0.0040), (0.75, PUP_H + 0.0028), (0.92, PUP_H + 0.0012),
                  (1.0, PUP_H), (1.0, -0.0040), (0.86, -0.0140)):
        if f == 0: u = np.array([0.0]); v = np.array([PUPIL_DV])
        else: u = f * PUPIL_R * np.cos(ang); v = PUPIL_DV + f * PUPIL_R * np.sin(ang)
        P, Nn = white_front(E, U, V, u, v); rows.append(P + Nn * dh)
    Vv, F = rows_mesh(rows + [rows[-1].mean(0)[None]])
    sh = [Shell(f'pupil{k}', Vv, F, 'pupil', closed=True)]
    # catchlights (toward the nose, like the sheet): small domes 1.5 mm over the pupil
    for (cu, cv, r, nm) in ((-k * 0.017, 0.017, 0.0125, 'cl'), (k * 0.016, -0.019, 0.0058, 'cs')):
        ang2 = 2 * PI * np.arange(12) / 12; rr = []
        for f, dh in ((0.0, PUP_H + 0.0080), (0.6, PUP_H + 0.0074), (1.0, PUP_H + 0.0058), (1.15, PUP_H + 0.0025)):
            if f == 0: u = np.array([cu]); v = np.array([PUPIL_DV + cv])
            else: u = cu + f * r * np.cos(ang2); v = PUPIL_DV + cv + f * r * np.sin(ang2)
            P, Nn = white_front(E, U, V, u, v); rr.append(P + Nn * dh)
        Vc, Fc = rows_mesh(rr + [rr[-1].mean(0)[None] - N * 0.002])
        sh.append(Shell(f'{nm}{k}', Vc, Fc, 'catch', closed=True))
    P0, N0 = white_front(E, U, V, np.array([0.0]), np.array([PUPIL_DV]))
    return sh, P0[0]

MOUTH_Z = 0.6                        # the brief's mouth pivot height (the geometry sits where the sheet draws it)
SMILE_Z = 0.664
def mouth_frame(z=0.645):
    E = S(z, 0.0); N = S_norm(z, 0.0); U = np.array([1.0, 0, 0]); V = np.cross(N, U)
    return E, U, V, N
def build_smile():
    xs = np.linspace(-0.079, 0.079, 17)
    zc = SMILE_Z - 0.017 * (1 - (xs / 0.079) ** 2) + 0.004 * (xs / 0.079) ** 4
    C = np.array([S(z, math.copysign(surf_at_x(abs(x), z), x)) for x, z in zip(xs, zc)])   # (front points with this x)
    Nn = proj(C)[1]; T = np.gradient(C, axis=0); T /= L(T)[:, None]; Sd = np.cross(Nn, T)
    e = np.abs(xs / 0.079)
    width = 0.0105 * (1 - 0.25 * e ** 3) * np.sqrt(clamp01(1 - e ** 10)).clip(0.45, 1)
    cols = np.array([-1.5, -1.0, -0.55, 0.0, 0.55, 1.0, 1.5])
    hcol = lambda c: np.where(np.abs(c) > 1.01, SKIRT_DN, 0.0045 * (1 - np.clip(np.abs(c), 0, 1) ** 2) ** 0.6 + 0.0012)
    rows = []
    for i in range(len(xs)):
        Q = C[i] + Sd[i] * (cols * width[i] * np.where(np.abs(cols) > 1.01, 1.0, 1.0))[:, None]
        Q[np.abs(cols) > 1.01] = C[i] + Sd[i] * (np.sign(cols[np.abs(cols) > 1.01]) * (width[i] + 0.004))[:, None]
        P, _ = proj(Q, hcol(cols)); rows.append(P)
    nc = len(cols); Vv = np.concatenate(rows); F = []
    for i in range(len(xs) - 1):
        a, b = i * nc, (i + 1) * nc; F += [(a + j, a + j + 1, b + j + 1, b + j) for j in range(nc - 1)]
    for end, sgn in ((0, -1), (len(xs) - 1, 1)):
        tip = proj((C[end] + sgn * T[end] * (width[end] + 0.0045))[None], SKIRT_DN)[0]
        ti = len(Vv); Vv = np.vstack([Vv, tip]); base = end * nc
        F += [(base + j, base + j + 1, ti) for j in range(nc - 1)]
    return Shell('smile', Vv, F, lambda Cn, T: np.full(len(T), 'smile', dtype=object), closed=False, ori=body_ori)

def build_mouth_open():
    E, U, V, N = mouth_frame(0.643)
    ru, rv = 0.060, 0.052
    fr = [0, 0.45, 0.70, 0.80, 0.90, 1.0, 1.08]; hs = [0.0020, 0.0022, 0.0030, 0.0090, 0.0110, 0.0068, SKIRT_DN]
    rows = patch_rows((0, 0), (E, U, V), lambda a: (np.full_like(a, ru), np.full_like(a, rv)), fr, hs, 26)
    Vv, F = rows_mesh(rows); nseg = 26
    ring_of = np.concatenate([[0]] + [[i] * nseg for i in range(1, len(rows))])
    def keys(Cn, T): return np.where(ring_of[T].max(1) >= 4, 'lip', 'mouth_in')
    sh = [Shell('open', Vv, F, keys, closed=False, ori=body_ori)]
    fr2 = [0, 0.6, 1.0, 1.12]; hs2 = [0.0046, 0.0044, 0.0036, 0.0012]
    rows2 = patch_rows((0, -0.019), (E, U, V), lambda a: (np.full_like(a, 0.036), np.full_like(a, 0.020)), fr2, hs2, 16)
    V2, F2 = rows_mesh(rows2)
    sh.append(Shell('tongue', V2, F2, 'tongue', closed=False, ori=body_ori))
    return sh

def build_cheeks():
    sh = []
    for k in (-1, 1):
        cz = 0.630; th = surf_at_x(0.212, cz) * k
        E = S(cz, th); Nn = S_norm(cz, th)
        out = nrm(Nn + np.array([k * 0.10, 0, -0.05]))
        c = E - Nn * 0.030
        R = frame_z(out, (0, 0, 1))
        (Vv, F), lat = ell_grid(c, R, (0.112, 0.100, 0.088), 0, 22,
                                lat=[0, 9, 18, 24, 34, 48, 64, 82, 104, 130, 155, 180])
        nl = 22; ring_of = np.concatenate([[0]] + [[i] * nl for i in range(1, 11)] + [[11]])
        blush_ring = 2      # faces between ring 0..3 (<= 24 deg) are the blush
        def keys(Cn, T, ro=ring_of): return np.where(ro[T].max(1) <= 3, 'blush', 'cheek')
        def shade(rgb, P, N_, k_=k):
            hi = srgb_lin(PAL['body_hi']); t = (clamp01(N_[:, 2]) * 0.45)[:, None]
            return default_shade(rgb * (1 - t) + hi * t, P, N_)
        sh.append(Shell(f'cheek{k}', Vv, F, keys, shade=shade))
    # a pursed "o" between the puffs (the smile hides while he puffs)
    E, U, V, N = mouth_frame(0.646)
    fr = [0, 0.55, 0.8, 1.0, 1.15]; hs = [0.0040, 0.0045, 0.0085, 0.0062, SKIRT_DN]
    rows = patch_rows((0, 0), (E, U, V), lambda a: (np.full_like(a, 0.026), np.full_like(a, 0.022)), fr, hs, 16)
    Vv, F = rows_mesh(rows); ring_of = np.concatenate([[0]] + [[i] * 16 for i in range(1, len(rows))])
    sh.append(Shell('pursed', Vv, F, lambda Cn, T: np.where(ring_of[T].max(1) >= 3, 'lip', 'mouth_in'),
                    closed=False, ori=body_ori))
    return sh

# =========================================================================================== the hand (metres)
H_PALM = ((0.0, -0.95, 0.0), (0.82, 0.70, 0.42))
H_TOP = ((0.0, -1.55, -0.04), (0.80, 0.62, 0.40))
H_CUFF = ((0.0, -0.10, 0.0), (0.50, 0.34, 0.45))
H_THUMB = ((0.52, -0.72, 0.06), (0.90, -1.20, 0.17), 0.31)
def mitten_f(p):
    d = sd_ell(p, *H_PALM)
    R = rot([1, 0, 0], 0.16)
    d = smin(d, sd_ell(p, H_TOP[0], H_TOP[1], R), 0.22)
    d = smin(d, sd_ell(p, *H_CUFF), 0.26)
    return d
def thumb_f(p):
    a, b, r = H_THUMB
    d = sd_cap(p, a, b, r)
    return smin(d, sd_ell(p, (0.46, -0.75, 0.04), (0.32, 0.36, 0.32)), 0.12)
def hand_f(p): return smin(mitten_f(p), thumb_f(p), 0.10)
def project_sdf(f, P, iters=6):
    for _ in range(iters):
        g = grad(f, P); P = P - (f(P) / np.maximum(np.einsum('ij,ij->i', g, g), 1e-12))[:, None] * g
    return P
HAND_TRIS = 2300
def fuse_hand(shells):
    """join the mitten + thumb shells, voxel-remesh them into one closed surface, decimate to the budget, then
    project every vertex onto the smooth union (so the thumb root is a soft crease, the silhouette exact)"""
    V = np.concatenate([s.V for s in shells]); F, off = [], 0
    for s_ in shells: F += [tuple(i + off for i in f) for f in s_.F]; off += len(s_.V)
    me = bpy.data.meshes.new('tmp'); me.from_pydata([tuple(v) for v in V], [], F); me.update()
    ob = bpy.data.objects.new('tmp', me); bpy.context.scene.collection.objects.link(ob)
    r = ob.modifiers.new('r', 'REMESH'); r.mode = 'VOXEL'; r.voxel_size = 0.03; r.adaptivity = 0.0
    dg = bpy.context.evaluated_depsgraph_get(); n0 = len(ob.evaluated_get(dg).data.polygons)
    d = ob.modifiers.new('d', 'DECIMATE'); d.decimate_type = 'COLLAPSE'; d.ratio = HAND_TRIS / (2.0 * n0)
    dg = bpy.context.evaluated_depsgraph_get(); ev = ob.evaluated_get(dg); m2 = ev.to_mesh()
    bm = bmesh.new(); bm.from_mesh(m2); bmesh.ops.triangulate(bm, faces=bm.faces[:])
    for _ in range(2):
        bmesh.ops.smooth_vert(bm, verts=bm.verts[:], factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    P = project_sdf(hand_f, np.array([v.co for v in bm.verts]))
    Fo = [tuple(v.index for v in f.verts) for f in bm.faces]
    bm.free(); ev.to_mesh_clear(); bpy.data.objects.remove(ob); bpy.data.meshes.remove(me)
    return P, Fo
def build_hand_shells():
    th = np.radians([0, 10, 21, 33, 46, 59, 72, 84, 96, 108, 120, 132, 144, 156, 168, 180])
    rows = star_rows(mitten_f, np.array([0, -0.95, 0.0]), [0, -1, 0], [0, 0, 1], th, 40, 2.4)
    V1, F1 = rows_mesh(rows)
    c = np.array(H_THUMB[0]); d = nrm(np.array(H_THUMB[1]) - c)
    rows = star_rows(thumb_f, c + d * 0.15, d, [0, 0, 1], np.radians([0, 18, 36, 55, 75, 95, 120, 150, 180]), 18, 1.2)
    V2, F2 = rows_mesh(rows)
    def hshade(rgb, P, N):
        lo, hi, palm = srgb_lin(PAL['body_lo']), srgb_lin(PAL['body_hi']), srgb_lin(PAL['palm'])
        t_hi = (clamp01(N[:, 2]) ** 1.4 * 0.5)[:, None]; t_lo = (clamp01(-N[:, 2]) ** 1.2 * 0.35)[:, None]
        cc = rgb * (1 - t_hi) + hi * t_hi
        cc = cc * (1 - t_lo) + palm * t_lo
        return cc
    P, F = fuse_hand([Shell('m', V1, F1, 'body'), Shell('t', V2, F2, 'body')])
    return [Shell('mitten', P, F, 'body', shade=hshade)]

# =========================================================================================== export
def export(path):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_apply=True,
                              export_yup=True, export_attributes=False, export_vertex_color='ACTIVE',
                              export_all_vertex_colors=False, export_normals=True, export_texcoords=False,
                              export_lights=False, export_cameras=False, export_animations=False,
                              export_skins=False, export_morph=False, export_materials='EXPORT')

def build_body():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    np.random.seed(7)
    Vb, Fb = build_body_shell()
    body = [Shell('shell', Vb, Fb, 'body', shade=body_shade)]
    for k in (-1, 1): body += [build_socket(k), build_lid(k), build_blush(k)]
    beads, npearl = build_beads(); body += beads
    body += build_sprout()
    obs, stats = [], {}
    ob, st = make_object('body', body, np.zeros(3)); obs.append(ob); stats['body'] = st
    for k, nm in ((-1, 'L'), (1, 'R')):
        sh, piv = build_eye(k)
        ob, st = make_object('eye' + nm, [sh], piv); obs.append(ob); stats['eye' + nm] = st
    for k, nm in ((-1, 'L'), (1, 'R')):
        sh, piv = build_pupil(k)
        ob, st = make_object('pupil' + nm, sh, piv); obs.append(ob); stats['pupil' + nm] = st
    mp = S(MOUTH_Z, 0.0)
    for nm, fn in (('mouthSmile', lambda: [build_smile()]), ('mouthOpen', build_mouth_open), ('cheeks', build_cheeks)):
        ob, st = make_object(nm, fn(), mp); obs.append(ob); stats[nm] = st
    info = {ob.name: dict(tris=len(ob.data.polygons), pivot=[round(x, 4) for x in ob.location]) for ob in obs}
    info['total'] = sum(len(ob.data.polygons) for ob in obs); info['pearls'] = npearl + 1
    info['pieces'] = stats
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(TASK_DIR, 'umibozu.blend'))
    export(os.path.join(MODELS, 'umibozu.glb'))
    print('UMI body', json.dumps({k: v for k, v in info.items() if k != 'pieces'}))
    return info

def build_hand():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    ob, st = make_object('body', build_hand_shells(), np.zeros(3))
    info = dict(tris=len(ob.data.polygons), pieces=st)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(TASK_DIR, 'umibozu-hand.blend'))
    export(os.path.join(MODELS, 'umibozu-hand.glb'))
    print('UMI hand', json.dumps(info))
    return info

if __name__ == '__main__':
    out = {}
    if WHAT in ('all', 'body'): out['body'] = build_body()
    if WHAT in ('all', 'hand'): out['hand'] = build_hand()
    os.makedirs(os.path.join(TASK_DIR, 'work'), exist_ok=True)
    with open(os.path.join(TASK_DIR, 'work', f'build_stats_{WHAT}.json'), 'w', encoding='utf-8') as f:
        json.dump(out, f, indent=1)
