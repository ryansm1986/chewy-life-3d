# The Lagoon Pier: poi-pier-0 (the pier, local: landing at 0, out along +z, y the sea's level; its deck top exactly 0.46) and
# poi-pier-1 (the shore). Kept from the kit: the rowboat (bobs), the cat's body and tail, the two lamp lights, the deck, the colliders.
PP = Place('pier')
PIER = dict(x=168.55, z=54.35, yaw=1.9, ln=7.0, w=2.0, top=0.46)
SHED = dict(x=165.95, z=53.2, yaw=1.2)
HD = (math.sin(PIER['yaw']), math.cos(PIER['yaw'])); SD = (math.cos(PIER['yaw']), -math.sin(PIER['yaw']))
def onPier(s, t): return (PIER['x'] + HD[0] * s + SD[0] * t, PIER['z'] + HD[1] * s + SD[1] * t)
def shedPt(lx, lz):
    c, s_ = math.cos(SHED['yaw']), math.sin(SHED['yaw'])
    return (SHED['x'] + c * lx + s_ * lz, SHED['z'] - s_ * lx + c * lz)
BOAT = dict(s=4.7, t=-2.3)

def build_pier0():
    ln, w, top = PIER['ln'], PIER['w'], PIER['top']; hw = w / 2
    rnd = random.Random(7707)
    bed = lambda s, t: min(PP.H(*onPier(s, t)), 0.3) - 0.25
    # the deck: chunky boards across, each its own tone, dark pegs at the ends (the top surface is the walkable deck)
    n = int(round((ln + 0.75) / 0.34)); PTH = 0.095
    for i in range(n):
        z = -0.75 + (i + 0.5) * (ln + 0.75) / n
        plank(w + rnd.uniform(-0.05, 0.05), PTH, (ln + 0.75) / n - 0.034, (rnd.uniform(-0.025, 0.025), top - PTH / 2, z), PLK[(i * 5 + 1) % 4], seed=i, tag='deck', c=0.028)
        for s in (-1, 1):
            for k in (0.32, 0.68): stud(s * (hw - 0.14), top, z + (k - 0.5) * 0.2, r=0.03, K=5, tag='deck')
    for x in (-hw + 0.16, 0.0, hw - 0.16):
        solid(beam(0.15, 0.17, ln + 0.6, (x, top - PTH - 0.08, (ln - 0.6) / 2), c=0.04), woodc(W_DD, 3), 'deck')
    # the posts in pairs, stout and round, rope-wrapped; the outer pairs tall with a rope rail along the north side
    stations = [-0.45, ln * 0.33, ln * 0.66, ln - 0.15]; rail = []
    for i, s in enumerate(stations):
        for sd in (-1, 1):
            t = sd * (hw + 0.06); tall = i == 0 or i == len(stations) - 1 or sd > 0; y1 = top + (0.5 if tall else 0.12)
            round_post(t, s, bed(s, t), y1, r=0.155, col='#86604a', K=10, tag='posts')
            if tall: rope_wrap(t, y1 - 0.31, s, 0.15, 3, K=8)
            else: rope_wrap(t, top - 0.34, s, 0.15, 2, K=8)
            if s > 0.5:
                rows([(0.17, 0.0, '#a8e0dc'), (0.235, 0.035, '#eefaf6'), (0.3, 0.012, '#c4ecea'), (0.33, -0.01, '#8fd8d8')], 10, pos=(t, 0, s), tag='foam', top=0.0, bot=0.0)
            if sd > 0: rail.append((t, top + 0.4, s))
    for i in range(len(rail) - 1):
        rope_span(rail[i], rail[i + 1], 0.15, r=0.036, n=6, K=5)
    # the mooring line, from the third post on the south side to the boat's bow (the boat stays the kit's)
    tie = (-hw - 0.06, top + 0.2, stations[2]); bow = (BOAT['t'] + 0.25, 0.48, BOAT['s'] - 1.3)
    rope_span(tie, bow, 0.2, r=0.03, n=6, K=5)
    solid(sph(0.07, tie, sc=(1.2, 0.9, 1.2), K=6, J=3), lambda p, n_: mix(ROPE_DK, ROPE_LT, clamp(n_.z * 0.6 + 0.5)), 'rope')
    ground_ao(PP, frame=lambda x, z: onPier(z, x))
    return 'origin = the kit call (x %.2f, z %.2f, y 0, yaw %.2f); deck top local y %.3f' % (PIER['x'], PIER['z'], PIER['yaw'], top)

# ------------------------------------------------------------------ the shore
SW, SDP, WALL_H = 2.3, 2.1, 1.75
TILES = ['#c4523f', '#b84a38', '#cc5a44', '#ba4e3c']
BOARDS = ['#c0925c', '#b0834e', '#c99c68', '#b88a56']

def shed_():
    hw, hd = SW / 2, SDP / 2; rng = random.Random(77)
    solid(box(SW + 0.16, 0.2, SDP + 0.16, (0, 0.06, 0), r=0.05), stonec('#b0a8a8', '#d8d2d0', '#7a7280', seed=3, amp=0.06), 'shed')
    def bd(x, z, ry, h, y0=0.16, w_=0.25):
        solid(box(w_ - 0.022, h, 0.075, (x, y0 + h / 2, z), r=0.0, ry=ry), woodc(rng.choice(BOARDS), rng.randrange(99), 0.07), 'shedwall')
    x = -hw + 0.125
    while x < hw:
        bd(x, -hd + 0.035, 0, WALL_H)
        if abs(x) >= 0.45: bd(x, hd - 0.035, 0, WALL_H)
        x += 0.25
    z = -hd + 0.125
    while z < hd:
        bd(-hw + 0.035, z, PI / 2, WALL_H); bd(hw - 0.035, z, PI / 2, WALL_H); z += 0.25
    solid(beam(1.0, 0.2, 0.11, (0, 1.45, hd - 0.03), c=0.03), woodc(W_DK, 2), 'shed')
    x = -0.375
    while x <= 0.38:
        solid(box(0.23, 0.32, 0.07, (x, 1.72, hd - 0.035), r=0.0), woodc(rng.choice(BOARDS), rng.randrange(99), 0.07), 'shedwall'); x += 0.25
    # the dark inside, a plank floor
    solid(box(SW - 0.2, WALL_H, SDP - 1.0, (0, WALL_H / 2 + 0.16, -hd + 0.1 + (SDP - 1.0) / 2), r=0.0), '#46301f', 'shed')
    solid(box(SW - 0.2, 0.04, SDP - 0.2, (0, 0.17, 0), r=0.0), '#8a6444', 'shed')
    for sx in (-1, 1): solid(box(0.04, WALL_H, SDP - 0.2, (sx * (hw - 0.1), WALL_H / 2 + 0.16, 0), r=0.0), '#57392a', 'shed')
    solid(box(SW - 0.2, 0.04, SDP - 0.2, (0, WALL_H + 0.12, 0), r=0.0), '#3c2a20', 'shed')
    for px, pz in ((-hw, -hd), (hw, -hd), (-hw, hd), (hw, hd)):
        solid(beam(0.17, WALL_H + 0.2, 0.17, (px, (WALL_H + 0.2) / 2 + 0.1, pz), c=0.03), woodc(W_DK, 4), 'shed')
    for sx in (-1, 1): solid(beam(0.11, 1.35, 0.13, (sx * 0.5, 0.16 + 0.67, hd), c=0.025), woodc(W_DK, 5), 'shed')
    solid(box(1.14, 0.11, 0.42, (0, 0.08, hd + 0.25), r=0.03), woodc('#b48a58', 6), 'shed')
    with at((-0.25, 0.16, hd - 0.4)): barrel_tub(r=0.16, h=0.25, wood_='#a87c52', K=8, tag='shed', soil='#3a5a68')
    with at((0.22, 0.16, hd - 0.55)): barrel_tub(r=0.14, h=0.32, wood_='#9c7048', K=8, tag='shed')
    # the round blue window on the camera's side wall, in a chunky frame with a cross-bar
    with at((-hw - 0.01, 1.05, 0.15), ry=-PI / 2):
        P = [(math.cos(TAU * k / 14) * 0.3, math.sin(TAU * k / 14) * 0.3, 0.0) for k in range(14)]
        fr = gloop(P, 0.075, K=5, up=F.N((0, 0, 1))); fr.__class__ = PTmp; fr.normals()
        fr.c = [shade(W_DK, n, 0.22, 0.3) for n in fr.n]; put(fr, None, 'window', 'body')
        t = PTmp(); c = t.vert(F.W((0, 0, 0.012))); ring = [t.vert(F.W((math.cos(TAU * k / 14) * 0.3, math.sin(TAU * k / 14) * 0.3, 0.012))) for k in range(14)]; nf = F.N((0, 0, 1))
        for k in range(14): t.face([c, ring[k], ring[(k + 1) % 14]], nf)
        t.normals(); t.c = ['#a4dcf4'] + [mix('#5aa0d8', '#8cd0f0', 0.5 + 0.5 * math.sin(TAU * k / 14)) for k in range(14)]
        put(t, None, 'window', 'window_glow', uv=lambda p: (0.2, 0.35))
        for rz_ in (0, PI / 2): solid(box(0.6, 0.06, 0.05, (0, 0, 0.03), r=0.0, rz=rz_), lambda p, n: shade(W_DK, n), 'window')
    # the gables, then the red roof: chunky rounded tile courses on two pitches, a round ridge, barge boards
    rise, ov = 0.95, 0.28; slope = math.atan2(rise, hw + ov)
    for z in (-hd + 0.03, hd - 0.03):
        x = -hw + 0.125
        while x < hw:
            h = max(0.06, rise * (1 - abs(x) / (hw + 0.02)) - 0.04)
            solid(box(0.23, h, 0.07, (x, WALL_H + 0.16 + h / 2, z), r=0.0), woodc(rng.choice(BOARDS), rng.randrange(99), 0.07), 'shedwall'); x += 0.25
    slopeLen = math.hypot(hw + ov, rise); NR_ = 4; nT = 6; tw = (SDP + 0.5) / nT
    for sx in (-1, 1):
        for r_ in range(NR_):
            u = (r_ + 0.5) / NR_; along = slopeLen * (1 - u)
            x = sx * math.cos(slope) * along; y = WALL_H + 0.18 + math.sin(slope) * (slopeLen - along)
            for k in range(nT + (r_ % 2)):
                half = (r_ % 2) and (k == 0 or k == nT); w2 = tw / 2 if half else tw
                if r_ % 2: zz = -(SDP + 0.5) / 2 + tw / 4 if k == 0 else ((SDP + 0.5) / 2 - tw / 4 if k == nT else -(SDP + 0.5) / 2 + k * tw)
                else: zz = -(SDP + 0.5) / 2 + (k + 0.5) * tw
                plank(slopeLen / NR_ + 0.14, 0.11, w2 - 0.03, (x, y + 0.055, zz), rng.choice(TILES), seed=k + r_ * 7, rz=sx * -slope, tag='roof', c=0.035)
        solid(box(slopeLen + 0.05, 0.05, SDP + 0.48, (sx * math.cos(slope) * slopeLen / 2, WALL_H + 0.16 + math.sin(slope) * slopeLen / 2, 0), r=0.0, rz=sx * -slope), '#8a3a2a', 'roof')
    yr = WALL_H + 0.18 + rise + 0.07
    with at((0, yr, 0), rx=PI / 2):
        rows([(0.0, -(SDP + 0.6) / 2 - 0.05, '#b04a36'), (0.12, -(SDP + 0.6) / 2 - 0.03, '#b9503a'), (0.125, (SDP + 0.6) / 2 + 0.03, '#b9503a'), (0.0, (SDP + 0.6) / 2 + 0.05, '#b04a36')], 10, tag='roof', top=0.24, bot=0.35)
    for z in (-hd - 0.22, hd + 0.22):
        for sx in (-1, 1):
            Ln = math.hypot(hw + ov, rise - 0.02) + 0.05
            mx_, my_ = sx * (hw + ov) / 2, WALL_H + 0.19 + rise / 2 - 0.04
            solid(beam(Ln, 0.15, 0.085, (mx_, my_, z), c=0.022, rz=sx * -slope), woodc(W_DK, 7), 'roof')
    # the paper lantern by the door
    solid(beam(0.52, 0.075, 0.075, (hw + 0.17, 1.66, hd + 0.04), c=0.016), woodc(W_DK, 8), 'shed')
    return lantern(hw + 0.34, 1.62, hd + 0.04, r=0.15, h=0.26, cord=0.05, tag='shed')

def rod_rack():
    for sx in (-1, 1):
        solid(beam(0.095, 1.25, 0.095, (sx * 0.45, 0.62, 0), c=0.02), woodc(W_DK, 3), 'rack')
        solid(box(0.24, 0.07, 0.34, (sx * 0.45, 0.03, 0), r=0.0), lambda p, n: shade(W_DD, n), 'rack')
    for y in (0.25, 1.05): solid(beam(1.05, 0.085, 0.085, (0, y, -0.02), c=0.02), woodc(W_MD, 4), 'rack')
    for i, (x, col) in enumerate(((-0.26, '#c8a46a'), (0.02, '#8a5a3a'), (0.3, '#d8b878'))):
        a = Vector((x, 0.12, 0.12)); b = Vector((x + 0.05, 1.95 + i * 0.12, -0.12))
        tube_col([tuple(a), tuple(a.lerp(b, 0.4)), tuple(b)], lambda s, r0=0.03, r1=0.016: r0 + (r1 - r0) * s, col, K=5, tag='rack')
        tube_col([(x, 0.18, 0.11), (x + 0.01, 0.46, 0.08)], 0.042, '#5a3a2a', K=6, tag='rack', caps=True)
        with at((x + 0.075, 0.5, 0.09), rz=PI / 2):
            rows([(0.0, -0.04, '#a0a0b0'), (0.075, -0.035, '#3fa8a8' if i == 1 else '#b8b8c8'), (0.075, 0.035, '#3fa8a8' if i == 1 else '#b8b8c8'), (0.0, 0.04, '#d0d0dc')], 8, tag='rack')

def bait_bucket():
    barrel_tub(r=0.19, h=0.3, wood_='#a87a50', soil='#3a5a68', K=9, tag='bucket')
    for i in range(4):
        solid(sph(0.04, (math.cos(i * 1.7) * 0.075, 0.27, math.sin(i * 1.7) * 0.075), K=5, J=3), lambda p, n: shade('#a86a4a', n), 'bucket')
    P = [(math.cos(PI * j / 6) * 0.18, 0.3 + math.sin(PI * j / 6) * 0.18, 0) for j in range(7)]
    tube_col(P, 0.02, ROPE_LT, K=4, tag='bucket')

def build_pier1():
    rnd = random.Random(7708); gy = PP.gy; L_ = PP.L; SEA = -PP.Y
    sx, sz = L_(SHED['x'], SHED['z'])
    with at((sx, gy(sx, sz) - 0.04, sz), ry=SHED['yaw']): cy_lamp = shed_()
    # the cat's crate at the shed's front corner (the cat stays the kit's, on top at +0.53), a second crate, the rods, the bait, the lantern
    cx, cz = L_(*shedPt(-0.95, 1.65))
    with at((cx, gy(cx, cz), cz), ry=SHED['yaw'] + 0.2): crate_box(0.62, 0.527, '#b48c58', lid=True, tag='crates', seed=3)
    c2x, c2z = L_(*onPier(-0.45, 1.6))
    with at((c2x, gy(c2x, c2z), c2z), ry=SHED['yaw'] - 0.15): crate_box(0.5, 0.425, '#c09660', lid=True, tag='crates', seed=5)
    rx, rz = L_(*shedPt(1.35, 1.5))
    with at((rx, gy(rx, rz), rz), ry=SHED['yaw'] - 0.35): rod_rack()
    bx, bz = L_(*onPier(-0.55, -1.55))
    with at((bx, gy(bx, bz), bz)): bait_bucket()
    lpx, lpz = L_(*onPier(-0.35, -1.42))
    lamp = lantern_post(lpx, gy(lpx, lpz), lpz, h=1.55, face=PIER['yaw'] - PI / 2)
    print('POI lamp world', (round(lamp[0] + PP.X, 3), round(lamp[1] + PP.Y, 3), round(lamp[2] + PP.Z, 3)), 'shed lamp local y', round(cy_lamp, 3), 'kit lights', PP.d['lights'])
    # the fence by the trail
    fence_run([L_(x, z) for x, z in ((163.3, 53.5), (164.2, 54.15), (165.2, 54.75))], gy)
    # mossy boulders along the shore, wet where the sea meets them
    for x, z, r, i in ((169.7, 56.5, 0.7, 0), (170.5, 57.6, 0.5, 1), (167.0, 51.8, 0.85, 2), (168.7, 51.3, 0.6, 3), (164.1, 51.0, 0.9, 4), (169.6, 49.6, 0.75, 5), (162.6, 52.4, 0.6, 6)):
        lx, lz = L_(x, z); rock(lx, gy(lx, lz), lz, r, yaw=i * 1.7, seed=30 + i, moss=0.5, wet=SEA)
        if i % 2 == 0: flower_tuft(lx - r * 0.8, gy(lx - r * 0.8, lz + r * 0.6), lz + r * 0.6, rnd, n=2, r=0.25)
    for x, z in ((170.1, 55.8), (171.0, 56.9), (169.5, 51.6), (170.0, 50.4)):
        lx, lz = L_(x, z); cattail_clump(lx, max(SEA, gy(lx, lz)) - 0.02, lz, rnd, n=5, h=0.9)
    for x, z, r, lot in ((171.9, 56.4, 0.42, True), (173.0, 57.3, 0.36, False), (174.4, 56.8, 0.46, False), (176.2, 55.9, 0.38, True), (174.6, 50.6, 0.44, False), (176.0, 51.4, 0.34, True), (172.6, 51.2, 0.32, False)):
        lx, lz = L_(x, z); lily(lx, SEA - 0.02, lz, r, rnd.uniform(0, TAU), lot, K=10)
    # the bank
    for x, z in ((164.2, 53.0), (167.2, 55.6), (166.0, 51.2), (168.1, 52.6), (167.8, 50.6)):
        lx, lz = L_(x, z); fern_(lx, gy(lx, lz), lz, rnd, 0.95, n=5)
    for x, z in ((166.6, 55.2), (165.0, 55.6), (168.3, 56.1), (163.6, 52.1), (167.6, 52.9), (169.2, 52.6), (166.3, 50.3)):
        lx, lz = L_(x, z); flower_tuft(lx, gy(lx, lz), lz, rnd, n=2, r=0.36)
    cols = PP.d['cols']
    for x, z in ((164.8, 51.4), (166.4, 49.9)):
        if any(math.hypot(c[0] - x, c[1] - z) < 0.02 and abs(c[2] - 0.42) < 0.01 for c in cols):
            lx, lz = L_(x, z); bamboo_clump(lx, gy(lx, lz), lz, rnd, n=2, h=2.8)
    for k, (x, z, r) in enumerate(((163.0, 51.2, 0.5), (167.9, 49.8, 0.45))):
        lx, lz = L_(x, z); leafy_bush(lx, gy(lx, lz), lz, r, rnd, seed=k * 5 + 3)
    ground_ao(PP)
    return 'origin = the kit call (F.X, F.Y, F.Z); sea level local y %.3f' % SEA
