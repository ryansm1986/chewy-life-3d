# ================================================================== Tengu's Fan Stand (decor, 1 x 0.5, h 1.24)
# Master Tengu (public/models/tengu-master.glb): a crow tengu in indigo with white pom-poms on his sash; his great fan is
# a round fan of long indigo feathers round a white chrysanthemum with a gold heart, on a brown wooden grip. Here: a
# black lacquer display stand (a red plinth, two curved uprights with gold balls, a gold ring holding the grip) and the
# fan standing upright in it, tilted back a touch; two white pom-poms hang from the ring on a red cord.
def feather_ol(L, W):
    return [(0.0, 0.0), (0.22 * W, 0.06 * L), (0.45 * W, 0.22 * L), (0.5 * W, 0.45 * L), (0.46 * W, 0.68 * L), (0.34 * W, 0.86 * L),
            (0.16 * W, 0.97 * L), (0.0, L), (-0.16 * W, 0.97 * L), (-0.34 * W, 0.86 * L), (-0.46 * W, 0.68 * L), (-0.5 * W, 0.45 * L),
            (-0.45 * W, 0.22 * L), (-0.22 * W, 0.06 * L)]

def build_trophyTenguFan():
    new_asset()
    blk = lac(BLACK_LAC, hi='#6a5e7a')
    # -- the stand
    add(box(0.68, 0.05, 0.28, (0, 0.025, 0), r=0.02), blk, 'stand')
    add(box(0.58, 0.026, 0.2, (0, 0.063, 0), r=0.012), lac('#8a2c26', hi='#d8705a'), 'stand')
    for s in (-1, 1):
        up = catmull([(s * 0.21, 0.07, -0.01), (s * 0.232, 0.2, -0.02), (s * 0.19, 0.33, -0.014), (s * 0.075, 0.428, 0.0)], 8)
        add(gtube(up, lambda q: 0.021 - 0.004 * q, K=6), blk, 'stand')
        add(sph(0.027, (s * 0.21, 0.09, -0.01), K=7, J=4), gold(), 'stand')
        add(sph(0.018, (s * 0.06, 0.43, 0.0), K=6, J=3), gold(), 'stand')
    add(gloopc([(0.036 * math.cos(TAU * k / 14), 0.43, 0.036 * math.sin(TAU * k / 14)) for k in range(14)], 0.009, K=4), gold(), 'stand')
    # -- the fan, tilted back a touch
    with at((0, 0.0, 0.0), rx=-0.1):
        wood_c = lambda p, n: paint(mix('#7a4a2a', '#a8683c', 0.5 + 0.5 * math.sin(p.z * 160)), top=0.25, bot=0.3)(p, n)
        add(cyl(0.026, 0.021, 0.42, (0, 0.59, 0), K=8), wood_c, 'grip')
        add(sph(0.026, (0, 0.38, 0), sc=(1, 0.8, 1), K=7, J=3), gold(), 'grip')
        for y in (0.44, 0.76):
            add(cyl(0.029, 0.029, 0.02, (0, y, 0), K=8, bev=0.004), gold(), 'grip')
        C = (0, 0.86, 0)
        # the feathers: a back ring of long dark indigo ones, a front ring of shorter, lighter ones between them
        layers = ((11, 2.15, 0.37, 0.125, -0.014, '#22306a', '#40589e'), (10, 1.95, 0.28, 0.105, 0.0, '#30428a', '#5a7cc4'), (8, 1.75, 0.18, 0.085, 0.012, '#3e56a4', '#7a98d8'))
        for li, (N, span, L0, W, dz, dark, light) in enumerate(layers):
            for k in range(N):
                u = (k / (N - 1)) * 2 - 1; a = u * span
                L = L0 * (1 - 0.14 * abs(u) ** 1.5)
                with at((C[0], C[1], C[2] + dz - 0.004 * abs(u)), rz=-a):
                    with at((0, 0, 0), rx=0.1 + 0.04 * li):
                        Lf = loc_fn()
                        def fc(p, n, Lf=Lf, L=L, W=W, dark=dark, light=light):
                            q = Lf(p); e = clamp(abs(q.x) / (0.5 * W)); al = clamp(q.y / L)
                            c = mix(dark, light, e * 0.75 + smooth(0.78, 1.0, al) * 0.45)
                            return mul(c, 0.95 + 0.08 * clamp(-n.y * 0.6 + n.z * 0.4))
                        add(fan_shape(feather_ol(L, W), (0, 0, 0), T=0.008, Tb=0.006, centre=(0.0, 0.5 * L)), fc, 'feathers')
                        add(gtube([(0.0, 0.03, 0.007), (0.0, 0.5 * L, 0.009), (0.0, 0.84 * L, 0.006)], 0.005, K=3, caps=False), flat(mix(light, '#e8e0d0', 0.35)), 'feathers')
        # the heart of the fan: an indigo boss, a white chrysanthemum, a gold centre
        with at((C[0], C[1], C[2] + 0.024), s=1.35):
            add(puffy(circ_ol(16, 0.072), 0.012, bev=0.005, z0=0.0), lac('#1e2a5e', hi='#4a5aa0'), 'flower')
            for k in range(12):
                a = k / 12 * TAU
                with at((0, 0, 0.012), rz=-a):
                    pet = [(0.0, 0.018), (0.012, 0.03), (0.014, 0.05), (0.008, 0.066), (0.0, 0.07), (-0.008, 0.066), (-0.014, 0.05), (-0.012, 0.03)]
                    add(fan_shape(pet, (0, 0, 0), T=0.007, Tb=0.004, centre=(0.0, 0.045)), lambda p, n: mix('#e8e4ee', '#fffcf6', clamp(-n.y * 0.7 + n.z * 0.3 + 0.3)), 'flower')
            add(dot(0.026, (0, 0, 0.022), sc=(1, 1, 0.6), K=12, J=3), lac('#f4b830', hi='#fff0a0', lo='#c87a1a'), 'flower')
    # -- the red cord with two white pom-poms, hanging from the ring
    for x1, y1, z1 in ((0.05, 0.27, 0.07), (-0.035, 0.31, 0.065)):
        add(gtube(catmull([(0.0, 0.425, 0.04), (x1 * 0.6, 0.38, z1 * 0.9), (x1, y1 + 0.03, z1)], 5), 0.0055, K=3), flat('#d8383a'), 'poms')
        add(sph(0.04, (x1, y1, z1), K=8, J=5), lambda p, n: mul(paint('#fbf8f2', top=0.06, bot=0.25)(p, n), 0.95 + 0.07 * vnoise(p, 70.0, 3)), 'poms')
