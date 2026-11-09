# The Firefly Moon Pond: poi-moonpond-0 (moonpond.js's one kit call). The game keeps the water disc, the fireflies, the
# two lamp lights, the dock's deck and all the colliders; this is everything the kit call drew.
PM = Place('moonpond')
S2M = math.sqrt(0.5)
def M_at(sr, su): return (148 + 1.5 + (sr - su) * S2M, 56 + 1.5 + (-sr - su) * S2M)
POND_X, POND_Z = M_at(0.3, 3.8); POND_R = 2.75
DOCK_X = POND_X - 0.35; DOCK_W = 1.5; DOCK_LEN = 2.7
WY = PM.d['waterY']; DECK_Y = WY + 0.22
PTONE = ('#9e97aa', '#d0cad8', '#686280')
FROG_ST = ('#a8a2aa', '#d4cfd2', '#6e6878')

def frog_():
    """a happy stone frog sitting up (its seat at 0, facing +z): plump body, broad head, closed smiling eyes on bumps, a
    carved grin, little hands in front, the haunches either side; moss creeping over its head and back"""
    b, hi, lo = FROG_ST
    def st(p, n):
        k = mix(mul(b, 0.8), mix(b, hi, 0.6), clamp(n.z * 0.75 + 0.36))
        if n.z < 0: k = mix(k, lo, -n.z * 0.65)
        k = mul(k, 0.94 + 0.12 * vnoise(p, 6.0, 3))
        m = (n.z - 0.74) * 2.6 + (vnoise(p, 5.5, 8) - 0.5) * 2.0 - 0.3
        if m > 0: k = mix(k, mix(ML, MM, clamp(n.z)), clamp(m * 1.8) * 0.9)
        return k
    tag = 'frog'; dark = '#37313a'
    HC = (0, 0.43, 0.05); HR = (0.255 * 1.28, 0.255 * 0.72, 0.255 * 1.0)
    def on_head(x, y, lift=0.005):
        u = (x / HR[0]) ** 2 + ((y - HC[1]) / HR[1]) ** 2
        return HC[2] + HR[2] * math.sqrt(max(0.0, 1 - u)) + lift
    # the body and the broad head grow into each other: no neck
    solid(sph(0.25, (0, 0.17, 0), sc=(1.16, 0.84, 1.02), K=10, J=5), st, tag)
    solid(sph(0.255, HC, sc=(1.28, 0.72, 1.0), K=12, J=6), st, tag)
    EY, ER = 0.545, 0.098
    for s in (-1, 1):
        ex, ez = s * 0.155, 0.1
        solid(sph(ER, (ex, EY, ez), K=8, J=4), st, tag)
        # the closed eye: a thick happy arch laid on the bump
        P = []
        for j in range(5):
            a = PI * j / 4; dx, dy = math.cos(a) * 0.062, -0.022 + math.sin(a) * 0.052
            P.append((ex + dx, EY + dy, ez + math.sqrt(max(0.0, ER * ER - dx * dx - dy * dy)) + 0.004))
        tube_col(P, 0.0165, dark, K=4, tag=tag, caps=True)
        # haunch, arm, foot, melting into the body
        solid(sph(0.16, (s * 0.235, 0.1, -0.02), sc=(0.8, 0.68, 1.25), K=8, J=4), st, tag)
        solid(sph(0.075, (s * 0.13, 0.12, 0.2), sc=(0.9, 1.25, 0.9), K=8, J=4), st, tag)
        solid(sph(0.085, (s * 0.27, 0.03, 0.17), sc=(1.25, 0.42, 1.35), K=8, J=3), st, tag)
    # the grin: a wide dark line carved into the head's front, its corners turned up into the cheeks
    P = []
    for j in range(7):
        a = PI + PI * j / 6; x = math.cos(a) * 0.185; y = 0.485 + math.sin(a) * 0.07
        P.append((x, y, on_head(x, y, 0.004)))
    tube_col(P, 0.019, dark, K=4, tag=tag, caps=True)

def build_moonpond():
    rnd = random.Random(6606); gy = PM.gy; L_ = PM.L; ly = lambda y: y - PM.Y
    cols = [c for c in PM.d['cols'] if abs(c[2] - 0.48) > 1e-3 and abs(c[2] - 0.26) > 1e-3]
    zRoot = POND_Z + POND_R + 0.45
    hw = DOCK_W / 2
    def near_col(x, z, lo, hi, d=0.42):
        best = None
        for c in cols:
            if lo <= c[2] <= hi:
                dd = math.hypot(c[0] - x, c[1] - z)
                if dd < d and (best is None or dd < best[0]): best = (dd, c)
        return best[1] if best else None
    # the rim: mossy boulders all round, big at the back, low on the camera's side, a gap for the dock
    N = 22; nrock = 0
    for i in range(N):
        a = i / N * TAU + 0.06; cx, cz = math.cos(a), math.sin(a); back = clamp(-(cx + cz) * S2M * 0.5 + 0.5)
        x, z = POND_X + cx * (POND_R + 0.18), POND_Z + cz * (POND_R + 0.18)
        if abs(x - DOCK_X) < hw + 0.35 and z > POND_Z: continue
        if any(abs((a - b + PI) % TAU - PI) < 0.16 for b in (-2.3, -0.5)): continue
        r = 0.36 + back * 0.42 + 0.07
        hit = near_col(x, z, 0.26, 0.78)
        if hit: x, z, r = hit[0], hit[1], hit[2] / 0.8
        lx, lz = L_(x, z)
        rock(lx, gy(lx, lz), lz, r, yaw=a + PI / 2, seed=70 + i, moss=0.3 + back * 0.2, stretch=1.3, sq=0.62 + back * 0.12, sink=0.36, tone=PTONE, wet=ly(WY))
        nrock += 1
        if back > 0.55 and i % 2:
            flower_tuft(lx - cx * r * 0.6, gy(lx, lz) + r * 0.7, lz - cz * r * 0.6, rnd, n=2, r=0.18)
    # bigger boulders on the bank behind
    for sr, su, r in ((-2.6, 5.2, 0.9), (4.2, 3.6, 0.85), (4.4, 4.3, 0.6), (-3.4, 2.6, 0.55), (5.0, 1.2, 0.5)):
        x, z = M_at(sr, su); lx, lz = L_(x, z)
        rock(lx, gy(lx, lz), lz, r, yaw=sr, seed=90 + int(round(r * 10)), moss=0.55, tone=PTONE)
    # flat stones to the dock
    for k, (dx_, dz_, r) in enumerate(((-0.25, 0.55, 0.36), (0.3, 1.05, 0.3))):
        lx, lz = L_(DOCK_X + dx_, zRoot + dz_); flat_stone(lx, gy(lx, lz), lz, r, seed=7 + k)
    # the dock: broad planks across two rounded beams on round posts, rope wraps, tall posts at its end (its top is the deck)
    dx, dz0 = L_(DOCK_X, zRoot); dz1 = dz0 - DOCK_LEN; dy = ly(DECK_Y)
    n = int(round(DOCK_LEN / 0.27)); PTH = 0.09
    for i in range(n):
        z = dz0 - (i + 0.5) * DOCK_LEN / n
        plank(DOCK_W + rnd.uniform(-0.05, 0.05), PTH, DOCK_LEN / n - 0.022, (dx + rnd.uniform(-0.02, 0.02), dy - PTH / 2, z), PLK[(i * 7 + 3) % 4], seed=i, tag='dock')
        for s in (-1, 1): stud(dx + s * (hw - 0.13), dy, z, r=0.028, K=5, tag='dock')
    for s in (-1, 1):
        solid(beam(0.13, 0.14, DOCK_LEN, (dx + s * (hw - 0.14), dy - PTH - 0.07, (dz0 + dz1) / 2), c=0.035), woodc(W_DD, 5 + s), 'dock')
    for s, z, tall in ((-1, dz1 + 0.08, True), (1, dz1 + 0.08, True), (-1, (dz0 + dz1) / 2, False), (1, (dz0 + dz1) / 2, False), (-1, dz0 - 0.12, True), (1, dz0 - 0.12, True)):
        x = dx + s * (hw + 0.03); top = dy + (0.42 if tall else 0.06)
        round_post(x, z, ly(WY) - 0.3, top, r=0.115, col=W_DK, K=8, tag='dock')
        if tall: rope_wrap(x, top - 0.28, z, 0.112, 3, K=7)
        else: rope_wrap(x, dy - 0.22, z, 0.112, 2, K=7)
    # two happy stone frogs either side of the landing, on mossy stones
    for s in (-1, 1):
        x, z = DOCK_X + s * (hw + 1.0), zRoot + 0.55 - (0.25 if s > 0 else 0); lx, lz = L_(x, z)
        yb = rock(lx, gy(lx, lz), lz, 0.42, sq=0.5, moss=0.42, seed=120 + s, sink=0.3, tone=PTONE, K=9)
        with at((lx, yb - 0.05, lz), ry=PI / 4 + s * 0.35, s=1.3): frog_()
    # three lantern posts
    def rimAt(a, k): return (POND_X + math.cos(a) * (POND_R + k), POND_Z + math.sin(a) * (POND_R + k))
    lamps = []
    for (x, z), face in (((DOCK_X + hw + 0.55, zRoot + 0.95), PI * 0.75), (rimAt(-2.3, 1.2), PI * 0.25), (rimAt(-0.5, 1.15), -PI * 0.15)):
        lx, lz = L_(x, z)
        lamps.append(lantern_post(lx, gy(lx, lz), lz, h=1.5, face=face))
    print('POI lamps (world y, x, z)', [(round(l[1] + PM.Y, 3), round(l[0] + PM.X, 3), round(l[2] + PM.Z, 3)) for l in lamps], 'kit lights', PM.d['lights'])
    # in the water: lily pads, two with a pink lotus, drifting petals; cattails round the back
    ply = ly(WY) + 0.006
    for ox, oz, r, lot in ((1.0, -0.55, 0.46, True), (1.55, 0.45, 0.36, False), (0.2, -1.25, 0.4, False), (-0.6, 0.4, 0.3, True), (1.1, 1.35, 0.3, False)):
        lx, lz = L_(POND_X + ox, POND_Z + oz); lily(lx, ply - 0.03, lz, r, rnd.uniform(0, TAU), lot, K=10)
    for i in range(12):
        a = rnd.uniform(0, TAU); d = POND_R * (0.25 + rnd.random() * 0.65); lx, lz = L_(POND_X + math.cos(a) * d, POND_Z + math.sin(a) * d)
        if abs(lx + PM.X - DOCK_X) < hw + 0.1 and lz + PM.Z > zRoot - DOCK_LEN: continue
        t = PTmp(); yy = ply + 0.012; rot = rnd.uniform(0, PI); Ls, Ws = 0.075, 0.05
        q = [(math.cos(rot) * Ls, math.sin(rot) * Ls), (-math.sin(rot) * Ws, math.cos(rot) * Ws), (-math.cos(rot) * Ls, -math.sin(rot) * Ls), (math.sin(rot) * Ws, -math.cos(rot) * Ws)]
        ids = [t.vert(gl((lx + u, yy, lz + v))) for u, v in q]; t.face(ids, Z)
        t.n = [Z.copy() for _ in ids]; col = '#ffb4d0' if rnd.random() < 0.7 else '#fff0f6'; t.c = [col, mix(col, '#ffffff', 0.3), mix(col, '#ff90b8', 0.4), col]
        put(t, None, 'petals', 'body')
    for a in (-2.2, -1.55, -0.6, 2.45, 0.3):
        lx, lz = L_(POND_X + math.cos(a) * (POND_R - 0.1), POND_Z + math.sin(a) * (POND_R - 0.1))
        cattail_clump(lx, ply - 0.02, lz, rnd, n=5, h=0.85)
    # flat stepping stones round the east bank
    for k in range(7):
        a = -0.75 + k * 0.33; lx, lz = L_(POND_X + math.cos(a) * (POND_R + 1.35), POND_Z + math.sin(a) * (POND_R + 1.35))
        flat_stone(lx, gy(lx, lz), lz, 0.3 + (k % 2) * 0.05, seed=40 + k)
    # the bank
    for sr, su in ((-3.0, 4.2), (-1.8, 5.8), (2.2, 6.0), (4.8, 2.6), (-3.6, -0.4), (2.6, -0.8), (-3.4, -2.6)):
        x, z = M_at(sr, su); lx, lz = L_(x, z); fern_(lx, gy(lx, lz), lz, rnd, 0.95, n=4)
    for sr, su in ((-2.4, 0.6), (3.4, 0.0), (0.4, -1.4), (-4.4, 2.4), (5.2, 3.6), (1.2, 6.2), (4.0, -1.6), (-2.8, -1.6), (2.2, -2.8), (-4.6, -0.8), (0.6, -4.2)):
        x, z = M_at(sr, su); lx, lz = L_(x, z); flower_tuft(lx, gy(lx, lz), lz, rnd, n=2, r=0.36)
    for k, (sr, su, r) in enumerate(((-4.6, 4.0, 0.5), (5.6, -0.2, 0.45))):
        x, z = M_at(sr, su); lx, lz = L_(x, z); leafy_bush(lx, gy(lx, lz), lz, r, rnd, seed=k * 5 + 2)
    ground_ao(PM)
    print('POI rim rocks', nrock)
    return 'origin = the kit call (F.X, F.Y, F.Z); deck top local y %.4f (world %.4f)' % (dy, DECK_Y)
