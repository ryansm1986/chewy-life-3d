
# ================================================================== King Mochi
KING = dict(body='#ffdbe8', top='#fff0f3', band='#f2b6cc', blush='#f0959c', cool=None)
COMMON = dict(eye='#292125', eye_low='#4a3330', catch='#ffffff')
KC = dict(gold='#f2c24a', gold_dk='#c8952a', ruby='#d94351', ruby_hi='#f07a84', sapph='#4a8ee0', emer='#3fae5a',
          velvet='#c8283a', cape='#c8283a', cape_in='#8e1b2c', fur='#fbf8f4', fur_dk='#e6dfe2', spot='#2a2430',
          stache='#6a3e2a')

def tilt_shell(m, v0, centres, rad, tilt):
    """bend a shell's normals (from vertex v0 on) away from its centre line, so a raised decal shades like a plump
    dome; they all still lean outward, so the ink hull stays behind it"""
    for i in range(v0, len(m.v)):
        p, n = m.v[i], m.n[i]
        c = min(centres, key=lambda q: (q - p).length_squared)
        d = p - c; d = d - n * d.dot(n)
        if d.length < 1e-6: continue
        m.n[i] = (n + d.normalized() * (tilt * min(1.0, d.length / rad))).normalized()

def face_king(m):
    eye, low, catch = hexc(COMMON['eye']), hexc(COMMON['eye_low']), hexc(COMMON['catch'])
    EX, EZ, EA, EB = 0.158, 0.290, 0.058, 0.072        # the callout: eyes ~0.11 x 0.13 m at z 0.29 (the slime's style)
    fe = EA / 0.050
    for s in (-1, 1):
        cx = s * EX
        oval_shell(m, cx, EZ, EA, EB, 0.0, 18, (1.0, 0.72, 0.4), 0.0012, 0.0035,
                   lambda u, v: mixc(eye, low, 0.85 * smooth(-0.005, -0.06, v)))
        oval_shell(m, cx - 0.013 * fe, EZ + 0.031 * fe, 0.0195 * fe, 0.0170 * fe, -0.5, 14, (1.0, 0.5), 0.0046, 0.0060, lambda u, v: catch)
        oval_shell(m, cx + 0.019 * fe, EZ - 0.028 * fe, 0.0085 * fe, 0.0080 * fe, 0.0, 10, (1.0,), 0.0046, 0.0058, lambda u, v: catch)
        # stern brows: steeper and thicker than the slime's, the inner end low over the eye
        sp = [(-0.030, 0.094), (0.0, 0.084), (0.024, 0.070), (0.042, 0.054), (0.050, 0.040)]
        stroke_shell(m, [(cx - s * x * fe, EZ + z * fe) for x, z in sp], 0.0155, 9, 0.0012, 0.0045, eye,
                     radfn=lambda t: lerp(0.85, 1.12, t))
        oval_shell(m, s * 0.300, 0.215, 0.048, 0.031, s * -0.05, 14, (1.0,), 0.0010, 0.0025, lambda u, v: hexc(KING['blush']))
    # the grand curly moustache: two plump lobes (raised 1.6 cm, normals bent so they shade round), tips curled up
    st = hexc(KC['stache'])
    for s in (-1, 1):
        sp = [(0.012, 0.205), (0.060, 0.186), (0.120, 0.166), (0.178, 0.168), (0.218, 0.190), (0.234, 0.222), (0.218, 0.246)]
        sp = [(s * x, z) for x, z in sp]
        v0 = len(m.v)
        stroke_shell(m, sp, 0.046, 12, 0.0015, 0.016, st, A=5,
                     radfn=lambda t: 0.74 + 0.30 * smooth(0.0, 0.25, t) - 0.70 * smooth(0.35, 1.0, t))
        spine3 = [front_map(q.x, q.y)[0] for q in catmull([Vector((x, z, 0)) for x, z in sp], 24)]
        tilt_shell(m, v0, spine3, 0.045, 0.55)
    # the brooch under it: a gold setting and a ruby (the callout's jewel where the mouth would be)
    v0 = len(m.v)
    oval_shell(m, 0.0, 0.088, 0.048, 0.048, 0.0, 16, (1.0, 0.6), 0.0012, 0.008, lambda u, v: hexc(KC['gold']))
    tilt_shell(m, v0, [front_map(0.0, 0.088)[0]], 0.048, 0.5)
    v0 = len(m.v)
    ruby, rhi = hexc(KC['ruby']), hexc(KC['ruby_hi'])
    oval_shell(m, 0.0, 0.090, 0.031, 0.033, 0.0, 14, (1.0, 0.55), 0.0085, 0.017,
               lambda u, v: mixc(ruby, rhi, 0.8 * (1 - smooth(0.004, 0.016, math.hypot(u + 0.010, v - 0.012)))))
    tilt_shell(m, v0, [front_map(0.0, 0.090)[0]], 0.031, 0.7)

# ------------------------------------------------------------------ the crown
CR_Z0, CR_R0, CR_SL = 0.500, 0.195, 0.25          # bottom height, bottom radius, flare (dr/dz)
CR_T = 0.030                                        # wall thickness
CR_VALLEY = 0.645
CR_N = 8                                            # points: front, +-45, +-90, +-135, back
def cr_peak(i):                                     # tip heights (under the balls): the front point tallest, as drawn
    c = math.cos(2 * math.pi * i / CR_N)
    return 0.735 + 0.050 * max(0.0, c) ** 1.5
def cr_top(th):
    w = math.pi / CR_N                              # half the spacing
    k = round(th / (2 * w)); d = abs(th - 2 * w * k)
    b = math.cos(math.pi / 2 * min(1.0, d / w)) ** 1.2
    return CR_VALLEY + (cr_peak(k % CR_N) - CR_VALLEY) * b
def cr_r(z): return CR_R0 + CR_SL * (z - CR_Z0)
def crown_wall_pt(th, z, h=0.0):
    r = cr_r(z); d = radial(th)
    n = Vector((d.x, d.y, -CR_SL)).normalized()
    return Vector((d.x * r, d.y * r, z)) + n * h, n

def crown(m):
    gold, gdk = hexc(KC['gold']), hexc(KC['gold_dk'])
    K = 40
    BAND = 0.548
    def bead(z): return 0.012 * math.sin(math.pi * clamp((z - CR_Z0 + 0.004) / (BAND - CR_Z0 + 0.004)))
    P = []
    for k in range(K):
        th = 2 * math.pi * k / K; top = cr_top(th); d = radial(th)
        sec = [(cr_r(z) + bead(z), z) for z in (CR_Z0, 0.524, BAND, top - 0.006)]
        sec.append((cr_r(top) - CR_T * 0.5, top + 0.010))                     # the rounded lip
        sec += [(cr_r(z) - CR_T, z) for z in (top - 0.006, CR_Z0)]
        P.append([Vector((d.x * r, d.y * r, z)) for r, z in sec])
    NS = len(P[0])
    ids = [[m.vert(p) for p in col] for col in P]
    f0 = len(m.f)
    for k in range(K):
        k1 = (k + 1) % K
        for j in range(NS):
            j1 = (j + 1) % NS
            q = [ids[k][j], ids[k1][j], ids[k1][j1], ids[k][j1]]
            m.face(q, gdk if (j < 2 or j == NS - 1) else gold, Vector((0, 0, 0)))
    def centre(p):
        th = math.atan2(p.x, -p.y); d = radial(th); z = clamp(p.z, CR_Z0, 0.8)
        r = cr_r(z) - CR_T * 0.5; return Vector((d.x * r, d.y * r, z))
    fix_hints_from_centre(m, f0, centre)
    # gold balls on the tips (rounded, 6.4 cm)
    for i in range(CR_N):
        th = 2 * math.pi * i / CR_N; z = cr_peak(i) + 0.022; d = radial(th); r = cr_r(z) - CR_T * 0.5
        oval_solid(m, Vector((d.x * r, d.y * r, z)), 0.032, 0.032, 0.032, gold, 8, 3)
    # jewels: domed shells on the wall (ruby in front, emeralds at +-45, sapphires at +-90)
    def mapper_for(th0):
        def mp(x, z, h): return crown_wall_pt(th0 + x / cr_r(z), z, h)
        return mp
    for th0, (a, b), col, zc in ((0.0, (0.050, 0.060), KC['ruby'], 0.672),
                                 (math.radians(45), (0.027, 0.040), KC['emer'], 0.650),
                                 (math.radians(-45), (0.027, 0.040), KC['emer'], 0.650),
                                 (math.radians(90), (0.026, 0.036), KC['sapph'], 0.640),
                                 (math.radians(-90), (0.026, 0.036), KC['sapph'], 0.640)):
        v0 = len(m.v); c = hexc(col); hi = mixc(c, '#ffffff', 0.45)
        oval_shell(m, 0.0, zc, a, b, 0.0, 12, (1.0, 0.55), 0.0015, 0.010,
                   lambda u, v, c=c, hi=hi, a=a: mixc(c, hi, 0.9 * (1 - smooth(0.15 * a, 0.5 * a, math.hypot(u + 0.3 * a, v - 0.35 * a)))),
                   mapper=mapper_for(th0))
        tilt_shell(m, v0, [crown_wall_pt(th0, zc)[0]], a, 0.7)

def velvet_cap(m):
    """the red velvet cap filling the crown: a soft dome, its rim just inside the crown's inner wall"""
    vel = hexc(KC['velvet']); vdk = mulc(vel, 0.82)
    prof = [(0.0, CR_Z0 - 0.01), (cr_r(CR_Z0) - CR_T - 0.004, CR_Z0 - 0.01), (cr_r(0.58) - CR_T - 0.004, 0.58),
            (cr_r(0.63) - CR_T - 0.012, 0.632), (0.13, 0.664), (0.07, 0.684), (0.0, 0.690)]
    f0 = len(m.f)
    lathe_solid(m, prof, 16, lambda p, pl: mixc(vdk, vel, smooth(0.60, 0.68, p.z)))
    fix_hints_from_centre(m, f0, lambda p: Vector((0, 0, min(p.z, 0.6))))

# ------------------------------------------------------------------ the ermine mantle (a fur roll on the shoulders)
FUR_A0, FUR_SPAN = 40, 280
def fur_path(u):
    """u 0..1: from the front-right end (azimuth +40 deg) round the back to the front-left end (-40 deg). Round 2:
    the callout's broad collar band: lowest on the upper sides (its lower edge ~0.31 m), a little higher at the back,
    rising onto the shoulders toward its front ends, which lie flat on the dome"""
    th = math.radians(FUR_A0 + FUR_SPAN * u)
    d = min(abs(th), abs(2 * math.pi - th))          # angular distance from the front
    z = 0.360 + 0.085 * smooth(math.radians(100), math.radians(40), d) + 0.040 * smooth(math.radians(100), math.pi, d)
    return th, z
def fur_frame(u):
    th, z = fur_path(u); s = s_at_z(z); p, n = dome_pt(th, s)
    p2, _ = dome_pt(th, s + 0.01); tm = (p2 - p).normalized()          # up the meridian
    return p, n, tm
FUR_W, FUR_T, FUR_OUT, FUR_P = 0.062, 0.030, 0.012, 3.0   # half-width (12.4 cm band), half-thickness, lift, squareness
def sqe(c, p): return math.copysign(abs(c) ** (2 / p), c)
def fur_taper(u):
    t = smooth(0.0, 0.11, u) * smooth(1.0, 0.89, u)
    return 0.45 + 0.55 * math.sqrt(t), 0.30 + 0.70 * math.sqrt(t)
def fur_pt(u, ph):
    """a flat-ish band: a rounded-rectangle (superellipse) section, 1.2 cm lifted, its underside sunk into the dome"""
    p, n, tm = fur_frame(u); tw, tt = fur_taper(u)
    c = p + n * FUR_OUT
    return c + tm * (FUR_W * tw * sqe(math.cos(ph), FUR_P)) + n * (FUR_T * tt * sqe(math.sin(ph), FUR_P)), c
def fur_top(u, y, h=0.0):
    """the band's top face at an across offset y (m, up the meridian): for the tail-tip dots"""
    p, n, tm = fur_frame(u); tw, tt = fur_taper(u)
    a = clamp(y / (FUR_W * tw), -0.95, 0.95)
    top = FUR_T * tt * (1 - abs(a) ** FUR_P) ** (1 / FUR_P)
    nn = (n - tm * (a * 0.6)).normalized()
    return p + n * (FUR_OUT + top) + tm * y + nn * h, nn
def fur(m):
    fu, fd, spot = hexc(KC['fur']), hexc(KC['fur_dk']), hexc(KC['spot'])
    NU, NP = 22, 8
    us = [0.012 + 0.976 * (i / (NU - 1)) for i in range(NU)]
    P = [[fur_pt(u, 2 * math.pi * k / NP + math.pi / NP)[0] for k in range(NP)] for u in us]
    def endpole(u, du):
        p, n, tm = fur_frame(u); c = fur_pt(u, 0)[1]; nxt = fur_pt(u + du, 0)[1]
        return c + (c - nxt).normalized() * 0.026 - n * 0.006
    f0 = len(m.f)
    def col(p):                                       # a soft grey-lilac shade on its underside
        u = min(us, key=lambda u: (fur_pt(u, 0)[1] - p).length_squared)
        n = fur_frame(u)[1]; return mixc(fd, fu, smooth(-0.015, 0.02, (p - fur_pt(u, 0)[1]).dot(n)))
    grid(m, P, None, lambda j, k, q: [col(m.v[i]) for i in q], pole0=(endpole(us[0], 0.02), None),
         pole1=(endpole(us[-1], -0.02), None), hint=lambda j, k: None)
    def centre(p):
        u = min(us, key=lambda u: (fur_pt(u, 0)[1] - p).length_squared); return fur_pt(u, 0)[1]
    fix_hints_from_centre(m, f0, centre)
    # round dark tail-tip dots, two staggered rows on the top face
    L = sum((fur_pt(b, 0)[1] - fur_pt(a, 0)[1]).length for a, b in zip(us, us[1:]))
    for i in range(14):
        u = 0.05 + 0.90 * i / 13; y = 0.026 if i % 2 else -0.024
        def mp(x, z, h, u=u, y=y): return fur_top(clamp(u + x / L), y + z, h)
        oval_shell(m, 0.0, 0.0, 0.0145, 0.0145, 0.0, 8, (1.0,), 0.0015, 0.0035, lambda x, z: spot, mapper=mp)

# ------------------------------------------------------------------ the royal cape
def dome_env(z):
    """the dome's outermost radius at or above height z"""
    r = at_s(s_at_z(max(z, 0.0)))[0]
    return max(r, R0 * 0.999) if z <= PROF[I_WIDE][1] else r
def cape(m):
    """a closed shell 3.5 cm thick round the back half, from under the fur roll to the floor, flaring out a little,
    with soft folds; red outside, darker inside, the front edges and the hem rounded"""
    red, dk = hexc(KC['cape']), hexc(KC['cape_in'])
    NT = 16
    def edges(j):                                     # round 2: the front edge sweeps back a little toward the hem
        t = 1 - FR[j] if j < len(FR) else 1.0
        e = math.radians(94 + 13 * t ** 1.4 + 3 * math.sin(math.pi * t))
        return e, 2 * math.pi - e
    TA, TB = math.radians(94), math.radians(266)
    T = 0.035
    def ztop(th):
        return fur_path(clamp((math.degrees(th) - FUR_A0) / FUR_SPAN))[1] - 0.035
    def r_mid(th, z):
        zt = ztop(th); t = clamp((zt - z) / zt)
        r_top = at_s(s_at_z(zt))[0] - 0.006                                  # tucked in at the top, under the fur
        r_lin = lerp(r_top, 0.560, t ** 0.9)                                 # an A-line down to a flared hem
        base = max(r_lin, dome_env(z) + 0.022) if z < zt - 0.05 else r_lin
        return base + 0.014 * math.sin(7 * th + 0.5) * t ** 1.2           # soft folds, growing toward the floor
    FR = (1.0, 0.78, 0.56, 0.36, 0.18)
    NR = len(FR) + 2
    def zrow(th, j): return ztop(th) * FR[j] if j < len(FR) else (0.024 if j == len(FR) else 0.0)
    loops = []
    for j in range(NR):
        hw = T / 2 if j < NR - 1 else 0.006
        TA, TB = edges(j); ths = [lerp(TA, TB, i / (NT - 1)) for i in range(NT)]
        loop = []
        for th in ths:
            z = zrow(th, j); r = r_mid(th, z) + hw; d = radial(th); loop.append((Vector((d.x * r, d.y * r, z)), 'o'))
        z = zrow(TB, j); r = r_mid(TB, z); d = radial(TB + hw / r * 1.2); loop.append((Vector((d.x * r, d.y * r, z)), 'e'))
        for th in reversed(ths):
            z = zrow(th, j); r = r_mid(th, z) - hw; d = radial(th); loop.append((Vector((d.x * r, d.y * r, z)), 'i'))
        z = zrow(TA, j); r = r_mid(TA, z); d = radial(TA - hw / r * 1.2); loop.append((Vector((d.x * r, d.y * r, z)), 'e'))
        loops.append(loop)
    ids = [[m.vert(p) for p, t in lp] for lp in loops]
    tags = [t for p, t in loops[0]]
    NL = len(tags)
    f0 = len(m.f)
    for j in range(NR - 1):
        for k in range(NL):
            k1 = (k + 1) % NL
            q = [ids[j][k], ids[j][k1], ids[j + 1][k1], ids[j + 1][k]]
            tg = {tags[k], tags[k1]}
            m.face(q, dk if 'i' in tg and 'o' not in tg else red, Vector((0, 0, 0)))
    # the hem: close the bottom loop (outer and inner 1.2 cm apart there)
    last = ids[NR - 1]
    for k in range(NT - 1):
        m.face([last[k], last[k + 1], last[2 * NT - k - 1], last[2 * NT - k]], dk, Vector((0, 0, -1)))
    m.face([last[NT - 1], last[NT], last[NT + 1]], dk, Vector((0, 0, -1)))
    m.face([last[2 * NT], last[2 * NT + 1], last[0]], dk, Vector((0, 0, -1)))
    def centre(p):
        th = math.atan2(p.x, -p.y) % (2 * math.pi); th = clamp(th, math.radians(94), math.radians(266)); z = clamp(p.z, 0.0, 0.6)
        r = r_mid(th, z); d = radial(th); return Vector((d.x * r, d.y * r, z))
    fix_hints_from_centre(m, f0, centre)
    # (the top loop is tucked inside the dome, under the fur roll: never seen)

def build_king():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mat = make_material()
    m = Part('body')
    counts = {}
    def mark(n, f):
        f(); counts[n] = m.tris() - sum(counts.values())
    mark('dome', lambda: build_dome(m, KING))
    mark('face', lambda: face_king(m))
    mark('crown', lambda: crown(m))
    mark('cap', lambda: velvet_cap(m))
    mark('fur', lambda: fur(m))
    mark('cape', lambda: cape(m))
    ob, bad = to_object(m, mat)
    lo = Vector((min(v.x for v in m.v), min(v.y for v in m.v), min(v.z for v in m.v)))
    hi = Vector((max(v.x for v in m.v), max(v.y for v in m.v), max(v.z for v in m.v)))
    print('KING tris %d %s | W%.3f D%.3f H%.3f | z %.4f..%.3f x %.3f..%.3f y %.3f..%.3f | validate-fixed %s' % (
        m.tris(), counts, hi.x - lo.x, hi.y - lo.y, hi.z - lo.z, lo.z, hi.z, lo.x, hi.x, lo.y, hi.y, bad))
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, 'mochi-king.blend'))
    for o in bpy.context.scene.objects: o.select_set(o.type == 'MESH')
    out = os.path.join(MODELS, 'mochi-king.glb')
    kw = dict(filepath=out, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
              export_attributes=True, export_lights=False, export_cameras=False, export_animations=False,
              export_normals=True, export_texcoords=False, export_materials='EXPORT')
    try:
        bpy.ops.export_scene.gltf(export_vertex_color='ACTIVE', **kw)
    except TypeError as e:
        print('KING export_vertex_color rejected:', e)
        bpy.ops.export_scene.gltf(export_colors=True, **kw)
    print('KING wrote', out)

build_king()
