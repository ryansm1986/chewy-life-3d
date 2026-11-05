# ================================================================== Yuki-onna's Frost Mirror (decor, 0.5 x 0.5, h 1.14)
# Yuki-onna (public/models/yuki-onna.glb): a white and ice-blue kimono sown with snowflakes, a tiara of pale ice
# crystals, a snowflake hair ornament and a long light-blue sash. Here: a pale birch stand (bark flecks, frosted silver
# ball tops capped with snow, a snowdrift on the foot), the round mirror between the uprights, tilted back a touch, in a
# frosted silver ring edged with frost points and five snowflakes; her ice-crystal tiara crowns the frame, and her
# light-blue sash is tied in a bow round one upright.
def build_trophyFrostMirror():
    new_asset()
    birch = lambda p, n: mul(paint(mix('#f4eee6', '#ddd2c6', 0.5 + 0.5 * math.sin(p.z * 60 + p.x * 20)), top=0.15, bot=0.3)(p, n), 0.97 + 0.04 * vnoise(p, 20.0, 3))
    silver = lac('#ccd8ec', hi='#ffffff', lo='#7a88aa')
    ice = lambda p, n: mix(mix('#9ccbea', '#e4f6ff', clamp(n.z * 0.6 - n.y * 0.3 + 0.3)), '#ffffff', clamp(-n.y * 0.5 + n.z * 0.5 - 0.3) ** 2 * 0.6)
    # -- the stand: the foot, two uprights with bark flecks, frosted ball tops with snow caps
    add(box(0.44, 0.05, 0.26, (0, 0.025, 0), r=0.02), birch, 'stand')
    UX = 0.212
    for s in (-1, 1):
        add(gl_lathe([(0.0, 0.05), (0.028, 0.05), (0.024, 0.08), (0.02, 0.4), (0.019, 0.87), (0.0, 0.87)], 8, pos=(s * UX, 0, 0)), birch, 'stand')
        for k in range(7):
            y = 0.13 + k * 0.1 + 0.02 * math.sin(k * 2.3 + s)
            a = 0.6 * math.sin(k * 1.7 + s) - s * 0.5
            add(box(0.022 + 0.008 * (k % 2), 0.006, 0.006, (s * UX + math.sin(a) * 0.0195, y, math.cos(a) * 0.0195), r=0.0, ry=a), flat('#5a5458'), 'stand')
        add(sph(0.03, (s * UX, 0.895, 0), K=8, J=4), silver, 'stand')
        add(sph(0.026, (s * UX, 0.916, 0), sc=(1.05, 0.45, 1.05), K=8, J=3), lambda p, n: mix('#d8e4f4', '#ffffff', clamp(n.z)), 'snow')
    for x, z, r in ((-0.12, 0.05, 0.065), (0.03, 0.075, 0.05), (0.14, 0.03, 0.055)):
        add(sph(r, (x, 0.048, z), sc=(1, 0.55, 0.75), K=10, J=4), lambda p, n: mix('#c8d8f0', '#ffffff', clamp(n.z * 0.9 + 0.2)), 'snow')
    # -- the mirror, between the uprights, tilted back a touch
    R = 0.162; MY = 0.79
    with at((0, MY, 0.0), rx=-0.1):
        # the glass: pale ice blue with a diagonal sheen (not a lamp: plain body)
        Lf = loc_fn()
        def glass(p, n):
            q = Lf(p); t_ = (q.x * 0.6 + q.y) / R
            c = mix('#9cbce0', '#d8eaf8', clamp(0.5 + t_ * 0.5))
            c = mix(c, '#f4faff', clamp(1 - abs(t_ - 0.3) * 2.4) * 0.75)
            return c if q.z > 0.0 else mul('#8a98b4', 1.0)
        prof = [(0.0, -0.006), (R, -0.006), (R, 0.007), (0.14, 0.008), (0.1, 0.0085), (0.05, 0.009), (0.0, 0.009)]
        add(gl_lathe(prof, 28, rx=PI / 2), glass, 'glass')
        # the frosted silver ring, the frost points round it
        add(gloopc([((R + 0.012) * math.cos(TAU * k / 28), (R + 0.012) * math.sin(TAU * k / 28), 0.0) for k in range(28)], 0.018, K=6), silver, 'frame')
        for k in range(22):
            a = (k + 0.5) / 22 * TAU
            if abs(math.atan2(math.sin(a), math.cos(a)) - 0.0) < 0.0: continue
            L = 0.034 if k % 2 else 0.022
            with at(((R + 0.026) * math.sin(a), (R + 0.026) * math.cos(a), 0.0), rz=-a):
                add(glathe([(0.0, -0.004), (0.009, 0.0), (0.0, L)], K=4), ice, 'frost')
        # five snowflakes on the frame
        for a in (PI / 6, -PI / 6, PI * 0.62, -PI * 0.62, PI):
            cx, cy = (R + 0.062) * math.sin(a), (R + 0.062) * math.cos(a)
            with at((cx, cy, 0.006), rz=-a):
                for j in range(3):
                    b = j / 3 * PI
                    add(gtube([(-math.sin(b) * 0.026, -math.cos(b) * 0.026, 0.0), (math.sin(b) * 0.026, math.cos(b) * 0.026, 0.0)], 0.0052, K=3), ice, 'flakes')
                add(dot(0.009, (0, 0, 0.004), sc=(1, 1, 0.5), K=6, J=2), flat('#ffffff'), 'flakes')
        # the pivots
        for s in (-1, 1):
            add(cyl(0.013, 0.013, UX - R - 0.012, (s * (R + 0.012 + (UX - R - 0.012) / 2), 0, 0), K=6, rz=PI / 2), silver, 'frame')
        # her ice-crystal tiara on the crown of the frame
        for k, (dx, h, rr, tilt) in enumerate(((0.0, 0.13, 0.017, 0.0), (-0.036, 0.095, 0.014, 0.22), (0.036, 0.095, 0.014, -0.22), (-0.066, 0.062, 0.012, 0.45), (0.066, 0.062, 0.012, -0.45))):
            with at((dx, R + 0.018, 0.0), rz=tilt):
                add(gl_lathe([(0.0, -0.01), (rr, 0.0), (rr, h * 0.68), (0.0, h)], 6), lambda p, n: mix(mix('#8ed4ee', '#d8f6ff', clamp(n.z * 0.5 - n.y * 0.4 + 0.3)), '#ffffff', clamp(-n.y * 0.6 + n.x * 0.3) ** 2 * 0.7), 'tiara')
    # -- her light-blue sash tied in a bow round the left upright, two tails hanging
    bx, by = -UX, 0.6
    sash = lambda p, n: paint('#8ec8ec', hi='#d4eefc', top=0.2, bot=0.3)(p, n)
    add(gloopc([(bx + 0.026 * math.sin(TAU * k / 8), by + 0.004 * math.cos(TAU * k / 8), 0.026 * math.cos(TAU * k / 8)) for k in range(8)], 0.009, K=4), sash, 'sash')
    add(sph(0.016, (bx, by, 0.03), K=6, J=3), sash, 'sash')
    for s in (-1, 1):
        add(gtube(catmull([(bx, by, 0.032), (bx + s * 0.022, by + 0.034, 0.04), (bx + s * 0.036, by + 0.02, 0.038), (bx + s * 0.026, by - 0.01, 0.036), (bx, by - 0.002, 0.032)], 8), 0.008, K=4), sash, 'sash')
    for (dx, L, a) in ((-0.008, 0.2, 0.1), (0.012, 0.15, -0.16)):
        with at((bx + dx, by - 0.01, 0.034), rz=a):
            yt_, yb_ = by - 0.01, by - 0.01 - L
            sh = sheet(-0.016, 0.016, [-L * j / 5 for j in range(6)], lambda x, y: 0.005 * math.sin(y * 40), nx=2)
            def uv_t(p, yt_=yt_, yb_=yb_): return (p.x * 2.0, 1.0 - clamp((p.z - yb_) / (yt_ - yb_)))
            add_open(sh, lambda p, n: mix('#7ab8e4', '#b8e0f8', clamp(n.z * 0.4 + 0.5)), 'sash', 'cloth', uv_t)
