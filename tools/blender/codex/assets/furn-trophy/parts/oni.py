# ================================================================== Gorobei's Cleaver Plaque (wall, 1 x 0.5, h 0.46)
# Oni Chef Gorobei (public/models/oni-chef.glb): a red oni in a white toque and apron with little cream horns, a big
# pale steel cleaver (a hanging hole at the top corner, a brown handle) and a steel ladle. Here: a walnut board with a
# raised panel and a twisted rope border, his cleaver and ladle crossed on it, a red lacquer medallion of three
# dumplings where they cross, his two little horns carved on the top corners.
def resample_2d(poly, n):
    """n points evenly spaced by arc length round a closed 2-D outline"""
    P = [Vector((x, y, 0)) for x, y in poly] + [Vector((poly[0][0], poly[0][1], 0))]
    Q = resample(P, n + 1)[:-1]
    return [(q.x, q.y) for q in Q]

def build_trophyOniCleaver():
    new_asset()
    WAL = '#7a4e34'; WAL_L = '#9a6a48'
    def walnut(base, seed=0):
        def f(p, n):
            c = mul(base, 1 + 0.07 * math.sin(p.z * 70 + math.sin(p.x * 9) * 1.6 + vnoise(p, 6.0, seed) * 2.0))
            return paint(c, top=0.2, bot=0.3)(p, n)
        return f
    yc = 0.205
    # -- the board, the raised panel, the twisted rope border
    add(puffy(rr2(0.9, 0.37, 0.06, n=3, cy=yc), 0.03, bev=0.01, z0=0.0), walnut(WAL), 'board')
    add(puffy(rr2(0.8, 0.28, 0.04, n=2, cy=yc), 0.01, bev=0.005, z0=0.028), walnut(WAL_L, 3), 'board')
    rope = [(x, y, 0.034) for x, y in resample_2d(rr2(0.845, 0.322, 0.05, n=3, cy=yc), 28)]
    add(gloop(rope, 0.0095, K=3), lambda p, n: mix('#ead2a0', '#b88a58', 0.5 + 0.5 * math.sin((p.x + p.z) * 150)), 'rope')
    # -- his two little horns on the top corners (cream, a buttery tip)
    for s in (-1, 1):
        hp = [(s * 0.35, 0.36, 0.03), (s * 0.358, 0.39, 0.03), (s * 0.372, 0.42, 0.03), (s * 0.392, 0.445, 0.03)]
        add(gtube(catmull(hp, 6), lambda q: 0.024 * (1 - q) ** 0.9 + 0.006, K=5),
            lambda p, n: paint(mix('#f2d690', '#fff4d8', smooth(0.37, 0.44, p.z)), top=0.25, bot=0.3)(p, n), 'horns')
    # -- the cleaver: a broad pale steel blade (its hanging hole at the top corner), a wood handle with a brass ferrule
    with at((0.01, yc, 0.0), rz=0.42, s=1.3):
        Lf = loc_fn()
        def steel(p, n):
            q = Lf(p)
            c = mix('#a8b4c4', '#e8eef6', smooth(-0.07, 0.05, q.y))
            if q.y < -0.058: c = mix(c, '#f4f8fc', 0.6)                        # (the bright blunt toy edge)
            return mix(c, '#ffffff', clamp(n.z * 0.4 - n.y * 0.5) ** 2 * 0.5)
        add(puffy(rr2(0.21, 0.15, 0.022, n=2, cx=0.1, cy=0.0), 0.014, bev=0.006, z0=0.04), steel, 'cleaver')
        add(gloopc([(0.172 + 0.016 * math.cos(TAU * k / 10), 0.046 + 0.016 * math.sin(TAU * k / 10), 0.055) for k in range(10)], 0.005, K=3), flat('#8a96a8'), 'cleaver')
        add(dot(0.0145, (0.172, 0.046, 0.05), sc=(1, 1, 0.2), K=10, J=2), flat('#4a3226'), 'cleaver')
        add(cyl(0.02, 0.022, 0.016, (-0.004, 0.0, 0.05), K=8, rz=PI / 2), gold(0.9), 'cleaver')
        add(cyl(0.019, 0.021, 0.17, (-0.095, 0.0, 0.05), K=8, rz=PI / 2), lambda p, n: paint(mix('#a8683a', '#c88a52', 0.5 + 0.5 * math.sin(p.x * 120)), top=0.25, bot=0.3)(p, n), 'cleaver')
        for x in (-0.06, -0.09):
            add(cyl(0.023, 0.023, 0.012, (x, 0.0, 0.05), K=8, rz=PI / 2), lac('#d8383a'), 'cleaver')
        add(sph(0.024, (-0.182, 0.0, 0.05), sc=(0.8, 1, 1), K=7, J=3), lac(BLACK_LAC, hi='#6a5a70'), 'cleaver')
    # -- the ladle: a long steel handle with a hook end and a round bowl facing out, crossed the other way
    with at((-0.01, yc, 0.0), rz=PI - 0.42, s=1.3):
        Lf2 = loc_fn()
        def steel2(p, n):
            return mix(mix('#98a4b6', '#dfe6f0', clamp(n.z * 0.5 - n.y * 0.4 + 0.3)), '#ffffff', clamp(-n.y * 0.6 + n.z * 0.3 - 0.3) * 0.5)
        add(gtube([(-0.25, 0.012, 0.046), (-0.235, 0.0, 0.05), (-0.1, 0.0, 0.05), (0.06, 0.0, 0.05), (0.14, 0.0, 0.05)], lambda q: 0.0105, K=6), steel2, 'ladle')
        cup = [(0.0, -0.002), (0.034, 0.002), (0.054, 0.014), (0.062, 0.03), (0.064, 0.038), (0.056, 0.04), (0.048, 0.03), (0.032, 0.022), (0.0, 0.018)]
        def cup_col(p, n):
            q = Lf2(p); inner = math.hypot(q.x - 0.198, q.y) < 0.056 and -n.y > 0.25 and q.z > 0.046
            return mix('#6e7a8e', '#dce4ee', clamp((q.y + 0.03) * 12) * clamp((q.x - 0.17) * 12)) if inner else steel2(p, n)
        add(gl_lathe(cup, 14, pos=(0.198, 0.0, 0.032), rx=PI / 2), cup_col, 'ladle')
    # -- the medallion where they cross: red lacquer, a gold rim, three dumplings with pleated tops
    with at((0.0, yc, 0.03), s=1.2):
        add(puffy(circ_ol(14, 0.064), 0.014, bev=0.006, z0=0.058), lac(RED_LAC, hi='#f0806a', lo='#8a1e2a'), 'medallion')
        add(gloopc([(0.064 * math.cos(TAU * k / 14), 0.064 * math.sin(TAU * k / 14), 0.07) for k in range(14)], 0.0065, K=3), gold(), 'medallion')
        for dx, dy, c in ((-0.024, -0.014, '#fff4e4'), (0.024, -0.014, '#ffdce4'), (0.0, 0.02, '#ddf0c8')):
            add(sph(0.023, (dx, dy, 0.078), sc=(1, 0.86, 0.66), K=7, J=3), lambda p, n, c=c: paint(c, top=0.08, bot=0.3)(p, n), 'medallion')
            add(sph(0.009, (dx, dy + 0.016, 0.086), sc=(1.3, 1, 0.8), K=5, J=2), lambda p, n, c=c: paint(mul(c, 0.9), top=0.2, bot=0.3)(p, n), 'medallion')
    # -- two brass nail heads that hang it
    for s in (-1, 1):
        add(dot(0.013, (s * 0.3, 0.335, 0.034), sc=(1, 1, 0.5), K=8, J=2), gold(0.9), 'board')
