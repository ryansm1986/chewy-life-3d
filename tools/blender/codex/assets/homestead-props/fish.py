# The 15 catch models: head toward +z, about 0.5 m long (the kit's frame and origin), <= 1,500 triangles; all the look is vertex colour.
# Each species has its own outline and fins, a real pattern and a sculpted mouth. exec'd by build_homestead-props.py.

def body_loft(L, hh, hw, yc=None, N=15, K=18, e=2.2, stag=True):
    """the fish's body from the tail stalk (z = z0) to the snout: hh(u), hw(u) half height / half width, yc(u) the spine's height.
    u 0 tail .. 1 snout. Rings are staggered, so vertex colours read as scales."""
    z0, z1 = L[0], L[1]; yc = yc or (lambda u: 0.0)
    rings, cs, meta = [], [], []
    us = [0.0 + (i + 0.5) / N for i in range(N)]
    for i, u in enumerate(us):
        z = z0 + (z1 - z0) * u; ring = []; mr = []
        for k in range(K):
            th = TAU * (k + (0.5 if stag and i % 2 else 0)) / K
            c, s = se_dir(th, e)
            x, y = c * hw(u), s * hh(u) + yc(u)
            ring.append(toB((x, y, z))); mr.append((u, th, s))
        rings.append(ring); cs.append(toB((0, yc(u), z))); meta.append(mr)
    t = Tmp()
    ids = ring_surface(t, rings, cs, toB((0, yc(0), z0)), toB((0, yc(1), z1)))
    t.meta = [None] * len(t.v)
    for row, mr in zip(ids, meta):
        for i, m in zip(row, mr): t.meta[i] = m
    t.meta[-2] = (0.0, 0.0, 0.0); t.meta[-1] = (1.0, 0.0, 0.0)
    t.ids = ids
    return t

def on_body(hh, hw, yc, L, u, th, off=0.0):
    z = L[0] + (L[1] - L[0]) * u; c, s = se_dir(th, 2.2)
    return V3(c * (hw(u) + off), s * (hh(u) + off) + yc(u), z)

class PTmp(Tmp):
    def orient(self): return self

def disc(c, nn, r, col, K=7, lift=0.004, sc=(1.0, 1.0)):
    """a painted spot: an open, slightly domed disc lying on a surface, every normal the surface's. The catch's ink is a 2 cm inverted hull:
    a closed bump draws dark arcs over the body, an open cap with one normal translates and stays culled."""
    nb = toB(nn).normalized(); cb = toB(c)
    a = nb.cross(Vector((0.13, 0.27, 0.95))).normalized(); b = nb.cross(a).normalized()
    t = PTmp(); ids = [t.vert(cb + nb * lift + a * (math.cos(TAU * k / K) * r * sc[0]) + b * (math.sin(TAU * k / K) * r * sc[1]), nb) for k in range(K)]
    ci = t.vert(cb + nb * (lift + r * 0.12), nb)
    for k in range(K): t.face([ci, ids[k], ids[(k + 1) % K]], nb)
    return put(t, col, 'spot')

def spot(hh, hw, yc, L, u, th, r, col, sc=(1, 1), off=0.0, K=6):
    p = on_body(hh, hw, yc, L, u, th, 0.0)
    c = V3(0, yc(u), p.z); nn = (p - c); nn.normalize()
    return disc(p, nn, r, col, K=K)

def eye(x, y, z, r, s=1, out=None, iris='#2a2028', ring=None):
    """a big friendly toy eye: a pale ball, a dark pupil facing out, a bright catchlight"""
    out = (out or V3(s * 0.86, 0.22, 0.46)).normalized()
    c = V3(x, y, z)
    put(sph(r, (x, y, z), K=8, J=5), lambda p, n: mix('#e6e2dc', '#fff8ee', clamp(n.z * 0.6 + 0.6)), 'eye')
    pc = c + out * (r * 0.62)
    m = lambda rr, sc_: F.m @ lm((0, 0, 0))
    t = ellipsoid(Vector((0, 0, 0)), (r * 0.66, r * 0.66, r * 0.48), K=8, J=4)
    t.xform(Matrix.Translation(toB(pc)) @ toB(out).to_track_quat('Z', 'Y').to_matrix().to_4x4())
    put(t, (lambda p, n, a=iris: a), 'eye')
    g = c + out * (r * 1.02) + V3(0, r * 0.32, 0) + V3(s * 0.0, 0, r * 0.14)
    put(sph(r * 0.2, tuple(g), K=5, J=2), '#fffaf0', 'eye')

def lips(z, y, w, h, col='#d88a84', dark='#3a2028', x=0.0, pout=0.012):
    """a sculpted mouth: a dark parting between two soft rolled lips"""
    egg((x, y, z - 0.004), w * 0.86, sc=(1, 0.42, 0.5), K=7, J=3, col=dark, tag='mouth')
    for sy, k in ((1, 1.0), (-1, 0.9)):
        pts = []
        for i in range(3):
            t = i / 2; a = (t - 0.5) * PI * 0.9
            pts.append((x + math.sin(a) * w, y + sy * h * math.cos(a) * 0.9, z + math.cos(a) * pout))
        vtube(pts, lambda s_: 0.0105 * k * (0.72 + 0.4 * math.sin(s_ * PI)), K=4, col=lambda p, n: mix(mul(col, 0.82), col, clamp(n.z * 0.6 + 0.6)), tag='mouth')

def fan_tail(zroot, yc, hgt, zlen, fork=0.35, n=7, thick=0.032, c0='#b88a40', c1='#e8c878', rows=2):
    """the tail: a vertical fan, forked by `fork`"""
    root = []; tip = []
    for i in range(n):
        t = i / (n - 1) * 2 - 1      # -1 .. 1, belly to back
        root.append(V3(0, yc + t * hgt * 0.14, zroot))
        k = abs(t)
        zz = zroot - zlen * ((1 - fork) + fork * k ** 1.4) * (1.0 if i % 2 == 0 else 0.92)
        tip.append(V3(0, yc + t * hgt * (0.86 + 0.12 * k), zz))
    return fin(root, tip, thick, rows=rows, c0=c0, c1=c1, tag='tail')

def dorsal(z0, z1, yf, h, peak=0.35, n=6, spines=False, c0='#b88a40', c1='#e8c878', thick=0.03, x=0.0, lean=0.5, sgn=1):
    """a fin along the back (sgn 1) or belly (sgn -1): yf(z) its root height, h its height, peak the tallest point (0 front .. 1 rear)"""
    root = []; tip = []
    for i in range(n):
        t = i / (n - 1); z = z1 + (z0 - z1) * t
        pr = (1 - abs(t - peak) / max(peak, 1 - peak)) ** 0.7 if 0 <= t <= 1 else 0
        hh_ = h * (0.22 + 0.78 * pr) * (0.86 if spines and i % 2 else 1.0)
        root.append(V3(x, yf(z), z))
        tip.append(V3(x, yf(z) + sgn * hh_, z - hh_ * lean))
    return fin(root, tip, thick, rows=1 if n > 6 else 2, c0=c0, c1=c1, tag='dorsal')

def side_fin(x, y, z, L, H, s, c0='#b88a40', c1='#e8c878', down=0.18, back=0.85, thick=0.026, n=5):
    """a paired fin: a broad little fan out of the side, swept back along the body"""
    L *= 0.78
    root = []; tip = []
    for i in range(n):
        t = i / (n - 1) * 2 - 1
        root.append(V3(x, y + t * H * 0.3, z + t * H * 0.28))
        k = 1 - 0.3 * t * t
        tip.append(V3(x + s * L * (0.42 + 0.1 * (1 - abs(t))), y + t * H * 0.56 - down * L, z - back * L * k + t * H * 0.36))
    return fin(root, tip, thick, rows=1, c0=c0, c1=c1, tag='pectoral')

def gill(hh, hw, yc, L, u, s, col):
    pts = []
    for i in range(4):
        a = -0.42 + i * 0.28
        c = math.cos(a * PI); q = math.sin(a * PI)
        uu = u + 0.012 * math.cos(a * PI * 1.1)
        pts.append((s * c * (hw(uu) * 1.0 + 0.002), q * hh(uu) * 0.95 + yc(uu), L[0] + (L[1] - L[0]) * uu))
    vtube(pts, 0.0135, K=3, col=col, tag='gill')

def barbel(x, y, z, s, L, col, drop=0.05):
    # (short and swept back along the jaw: the catch's ink is a 2 cm hull, so a long whisker reads as a bar hanging off the face)
    L *= 0.7
    vtube([(x, y, z), (x + s * L * 0.6, y - drop * 0.2, z - L * 0.25), (x + s * L * 0.9, y - drop * 0.4, z - L * 0.8)], lambda q: 0.0125 - 0.003 * q, K=4, col=col, tag='barbel')

def paint_body(t, back, side, belly, pat=None, stripe=None):
    """vertex colours from (u, th, s): s -1 belly .. 1 back. pat(u, th, s, i_ring, c) -> c"""
    t.c = [None] * len(t.v)
    for i, m in enumerate(t.meta):
        u, th, s = m
        v = 0.5 + 0.5 * s
        c = mix(belly, side, smooth(0.08, 0.5, v)); c = mix(c, back, smooth(0.55, 0.96, v))
        if pat: c = pat(u, th, s, c)
        t.c[i] = c

def checker(row_k, up=0.1, dn=0.1):
    """scales: alternate rings lighter, each ring's vertices offset (the loft's stagger): soft diamonds"""
    return None

def blobs(lst, col, edge=0.75):
    """koi patches: [(u, s(height), side(+1, -1, 0 both), ru, rs)]: hard-edged"""
    def f(u, th, s, c):
        x = math.cos(th)
        for (bu, bs, bd, ru, rs) in lst:
            if bd and x * bd < -0.15: continue
            d = ((u - bu) / ru) ** 2 + ((s - bs) / rs) ** 2
            if d < 1.5: c = mix(c, col, 1 - smooth(0.7, 1.5, d))
        return c
    return f

def compose(*fs):
    def f(u, th, s, c):
        for g in fs:
            if g: c = g(u, th, s, c)
        return c
    return f

# ------------------------------------------------------------------ a generic fish
def fish_std(o):
    L0 = o['L']                      # body length (z range), tail beyond
    zt = -0.25 + o.get('tail', 0.12); zn = o.get('snout', 0.245)
    Lz = (zt - 0.02, zn)
    hh = curve(o['hh']); hw = curve(o['hw']); yc = curve(o.get('yc', [(0, 0.0), (1, 0.0)]))
    t = body_loft(Lz, hh, hw, yc, N=o.get('N', 15), K=o.get('K', 18), e=o.get('e', 2.2))
    gu_ = o.get('gillU', 0.74); gc_ = o.get('gillC') or mul(o['side'], 0.84); dgu = 1.0 / o.get('N', 15)
    def gill_band(u, th, s, c, pat=o.get('pat')):
        if pat: c = pat(u, th, s, c)
        ug = gu_ + 0.035 * math.cos(s * 1.5)      # (a curved plate edge)
        if abs(u - ug) < dgu * 0.62 and abs(s) < 0.86: c = mix(c, mul(gc_, 0.82), 0.82)
        return c
    paint_body(t, o['back'], o['side'], o['belly'], gill_band)
    put(t, None, 'body')
    fc0, fc1 = o['fin']
    # the tail
    fan_tail(zt + 0.03, yc(0.03), o.get('tailH', hh(0.5) * 1.05), o.get('tail', 0.12) + 0.03, fork=o.get('fork', 0.35), c0=fc0, c1=fc1, n=o.get('tailN', 7))
    # back
    yf = lambda z: yc((z - Lz[0]) / (Lz[1] - Lz[0])) + hh(clamp((z - Lz[0]) / (Lz[1] - Lz[0]))) * 0.9
    yb = lambda z: yc((z - Lz[0]) / (Lz[1] - Lz[0])) - hh(clamp((z - Lz[0]) / (Lz[1] - Lz[0]))) * 0.9
    d = o.get('dorsal', (0.36, 0.72, 0.09, 0.3))
    Z = lambda u: Lz[0] + (Lz[1] - Lz[0]) * u
    dorsal(Z(d[0]), Z(d[1]), yf, d[2], peak=d[3], n=o.get('dorsalN', 6), spines=o.get('spines', False), c0=fc0, c1=fc1)
    if o.get('adipose'):
        a = o['adipose']; dorsal(Z(a - 0.05), Z(a + 0.04), yf, 0.042, peak=0.5, n=3, c0=fc0, c1=fc1)
    if o.get('anal', True):
        an = o.get('analR', (0.14, 0.3, 0.05))
        dorsal(Z(an[0]), Z(an[1]), yb, an[2], peak=0.3, n=4, c0=fc0, c1=fc1, sgn=-1)
    # the paired fins
    pu = o.get('pecU', 0.68); py = yc(pu) - hh(pu) * 0.32
    for s in (-1, 1):
        side_fin(s * hw(pu) * 0.88, py, Z(pu), o.get('pecL', 0.1), o.get('pecH', 0.075), s, fc0, fc1)
        vu = o.get('venU', 0.42); side_fin(s * hw(vu) * 0.5, yc(vu) - hh(vu) * 0.8, Z(vu), 0.06, 0.04, s, fc0, fc1, down=0.3, back=0.9, n=4)
    # the gill cover
    # the eyes
    eu = o.get('eyeU', 0.86); er = o.get('eyeR', 0.042) * 0.9
    ey = yc(eu) + hh(eu) * o.get('eyeY', 0.3) * 0.72
    for s in (-1, 1): eye(s * hw(eu) * 0.72, ey, Z(eu), er, s, iris=o.get('iris', '#2a2028'))
    # the mouth
    my = yc(0.99) + o.get('mouthY', -0.012)
    lips(zn + 0.0, my, o.get('mouthW', 0.026), o.get('mouthH', 0.0085), col=o.get('lip', '#d88a84'))
    return dict(hh=hh, hw=hw, yc=yc, L=Lz)

KOI_BODY = dict(L=0.5, hh=[(0, 0.012), (0.1, 0.024), (0.35, 0.06), (0.62, 0.092), (0.82, 0.088), (0.95, 0.056), (1, 0.03)], hw=[(0, 0.012), (0.1, 0.018), (0.35, 0.044), (0.62, 0.064), (0.82, 0.062), (0.95, 0.042), (1, 0.024)], tail=0.13, fork=0.22, dorsal=(0.3, 0.68, 0.052, 0.72), pecL=0.12, pecH=0.09, eyeR=0.036, eyeU=0.87, N=15, K=18)

# ------------------------------------------------------------------ species
def F_crucian():
    scales = lambda u, th, s, c: mul(c, 1.0 + 0.1 * math.sin(u * 95 + (2.4 if int(th * 7) % 2 else 0)))
    fish_std(dict(L=0.42, hh=[(0, 0.012), (0.1, 0.03), (0.35, 0.082), (0.6, 0.118), (0.8, 0.104), (0.95, 0.06), (1, 0.03)], hw=[(0, 0.012), (0.1, 0.02), (0.4, 0.05), (0.65, 0.066), (0.82, 0.058), (0.95, 0.04), (1, 0.024)],
                  tail=0.115, snout=0.232, back='#7c6028', side='#cca24e', belly='#f6e4a8', fin=('#9a7430', '#d8b460'), dorsal=(0.3, 0.72, 0.075, 0.68), fork=0.3, eyeR=0.042, spines=False, pat=scales, lip='#c88a60', gillC='#a8843c'))

def F_koi():
    pat = blobs([(0.84, 0.5, 0, 0.09, 0.62), (0.56, 0.42, 1, 0.14, 0.6), (0.52, 0.5, -1, 0.11, 0.55), (0.28, 0.45, 0, 0.1, 0.7), (0.72, -0.2, 1, 0.05, 0.3), (0.12, 0.3, 0, 0.05, 0.9)], '#f4552e')
    pat2 = blobs([(0.44, 0.78, 1, 0.05, 0.22), (0.66, 0.84, -1, 0.05, 0.2)], '#2e2a36')
    o = dict(KOI_BODY, back='#fff2e6', side='#fff8f0', belly='#ffffff', fin=('#fff0e4', '#fffaf2'), pat=compose(pat, pat2), lip='#f09a84', gillC='#efdccc')
    b = fish_std(o)
    for s in (-1, 1): barbel(s * 0.016, -0.018, 0.24, s, 0.05, lambda p, n: '#f0c8b0')

def F_goldKoi():
    def pat(u, th, s, c):
        k = 1.0 + 0.12 * math.sin(u * 110) * math.sin(th * 9)
        c = mul(c, k)
        return mix(c, '#fff0a0', smooth(0.25, 0.75, s) * smooth(0.25, 0.65, math.sin(u * 62 + th * 9)) * 0.55)
    o = dict(KOI_BODY, back='#f0a020', side='#ffd040', belly='#fff2b0', fin=('#f4b838', '#fff0a0'), pat=pat, lip='#e88a48', gillC='#e89a28', tail=0.145, fork=0.26, pecL=0.135, dorsal=(0.28, 0.7, 0.064, 0.7), iris='#3a2418')
    fish_std(o)
    for s in (-1, 1): barbel(s * 0.016, -0.018, 0.24, s, 0.054, lambda p, n: '#f8d070')
    # a little gold crown bump on the head
    egg((0, 0.078, 0.14), 0.022, sc=(1, 0.5, 1.5), K=6, J=3, col='#fff0a0', tag='crown')

def F_moonKoi():
    pat = compose(blobs([(0.54, 0.45, 1, 0.13, 0.55), (0.5, 0.5, -1, 0.1, 0.5), (0.26, 0.4, 0, 0.1, 0.65), (0.14, 0.3, 0, 0.05, 0.9)], '#9cb8f4'),
                  lambda u, th, s, c: mix(c, '#d8e4ff', 0.25 * (0.5 + 0.5 * math.sin(u * 80 + th * 6))))
    o = dict(KOI_BODY, back='#e8eeff', side='#f6f8ff', belly='#ffffff', fin=('#cbd8ff', '#f8faff'), pat=pat, lip='#c8b8e8', gillC='#d0dcf8', tail=0.16, fork=0.34, pecL=0.14, pecH=0.1, dorsal=(0.26, 0.7, 0.07, 0.72), snout=0.25, iris='#2a2a58')
    b = fish_std(o)
    for s in (-1, 1): barbel(s * 0.016, -0.018, 0.244, s, 0.056, lambda p, n: '#d8e0ff')
    # the crescent on its forehead: a real raised moon
    pts = []
    for i in range(7):
        a = -1.25 + i * (2.5 / 6)
        pts.append((math.sin(a) * 0.036, 0.088 + (math.cos(a) * 0.032 - 0.022) * 0.45, 0.145 - math.cos(a) * 0.036))
    vtube(pts, lambda q: 0.018 * (0.5 + math.sin(q * PI)), K=5, col=lambda p, n: mix('#f0c858', '#fff0a8', clamp(n.z + 0.3)), tag='moon')

def F_ayu():
    def pat(u, th, s, c):
        x = u - 0.68
        if (x / 0.05) ** 2 + ((s - 0.18) / 0.28) ** 2 < 1.0: return '#ffd23c'
        return c
    fish_std(dict(L=0.5, hh=[(0, 0.01), (0.1, 0.018), (0.4, 0.05), (0.66, 0.066), (0.84, 0.056), (0.96, 0.032), (1, 0.018)], hw=[(0, 0.01), (0.1, 0.014), (0.4, 0.032), (0.66, 0.04), (0.84, 0.036), (0.96, 0.024), (1, 0.014)],
                  tail=0.12, back='#6e8048', side='#c6c896', belly='#f6f6ea', fin=('#c0b870', '#f0e8a8'), pat=pat, dorsal=(0.44, 0.68, 0.082, 0.82), adipose=0.2, fork=0.46, eyeR=0.031, eyeU=0.88, lip='#c8b880', mouthW=0.022, pecL=0.08, pecH=0.055, gillC='#a8ac78'))

def F_trout():
    def pat(u, th, s, c):
        k = (u * 7.0) % 1.0
        if 0.1 < u < 0.74 and abs(k - 0.5) < 0.24 and abs(s) < 0.36: return mix(c, '#4e5e6a', 0.8)
        return c
    b = fish_std(dict(L=0.48, hh=[(0, 0.012), (0.1, 0.024), (0.4, 0.062), (0.66, 0.078), (0.84, 0.066), (0.96, 0.038), (1, 0.02)], hw=[(0, 0.012), (0.1, 0.016), (0.4, 0.038), (0.66, 0.05), (0.84, 0.044), (0.96, 0.028), (1, 0.016)],
                      tail=0.12, back='#5c6e4e', side='#c8c8ae', belly='#fff6ec', fin=('#8e9070', '#c8c4a0'), pat=pat, dorsal=(0.4, 0.66, 0.068, 0.7), adipose=0.2, fork=0.14, eyeR=0.034, lip='#b89878', gillC='#8e9078'))
    for s in (-1, 1):
        for (u, th) in ((0.82, 0.3), (0.64, 0.34), (0.5, 0.3), (0.38, 0.36), (0.26, 0.3), (0.15, 0.34)):
            spot(b['hh'], b['hw'], b['yc'], b['L'], u, (th * PI if s > 0 else PI - th * PI), 0.0125, '#3e4a44')

def F_char():
    b = fish_std(dict(L=0.48, hh=[(0, 0.012), (0.1, 0.024), (0.4, 0.062), (0.66, 0.08), (0.84, 0.066), (0.96, 0.04), (1, 0.022)], hw=[(0, 0.012), (0.1, 0.016), (0.4, 0.038), (0.66, 0.05), (0.84, 0.044), (0.96, 0.03), (1, 0.018)],
                      K=16, tail=0.12, back='#3e4e50', side='#7e9084', belly='#f0a460', fin=('#e88a50', '#fff0e0'), dorsal=(0.4, 0.66, 0.062, 0.7), adipose=0.2, fork=0.1, eyeR=0.034, lip='#c88a70', gillC='#5e7068'))
    rnd = seeded('char')
    for s in (-1, 1):
        for i in range(10):
            u = 0.12 + i * 0.068 + rnd.uniform(-0.015, 0.015); h = rnd.uniform(0.1, 0.56)
            spot(b['hh'], b['hw'], b['yc'], b['L'], u, (h * PI / 1.0 if s > 0 else PI - h * PI) if False else (math.asin(clamp(h)) if s > 0 else PI - math.asin(clamp(h))), 0.0165 if i % 3 else 0.014, '#f8f4e2' if i % 2 else '#f4b878', K=5)

def F_loach():
    def pat(u, th, s, c):
        v = vnoise(Vector((u * 9, math.cos(th) * 2.4, s * 3)), 1.0, 7)
        return mix(c, '#4e3a22', 0.85) if v > 0.6 and s > -0.2 else c
    b = fish_std(dict(L=0.5, hh=[(0, 0.012), (0.1, 0.022), (0.35, 0.036), (0.7, 0.045), (0.9, 0.042), (0.97, 0.03), (1, 0.018)], hw=[(0, 0.012), (0.1, 0.016), (0.35, 0.028), (0.7, 0.038), (0.9, 0.038), (0.97, 0.028), (1, 0.018)],
                      tail=0.075, snout=0.256, back='#6e5636', side='#b89e6e', belly='#efe0bc', fin=('#9c7e4e', '#c8ac78'), pat=pat, dorsal=(0.3, 0.46, 0.05, 0.5), fork=-0.14, tailH=0.056, tailN=7, anal=False, venU=0.3, pecL=0.062, pecH=0.05, eyeR=0.024, eyeU=0.9, eyeY=0.48, lip='#c8a078', mouthW=0.018, mouthY=-0.012, gillU=0.8, N=15, gillC='#907650'))
    for s in (-1, 1):
        barbel(s * 0.014, -0.012, 0.246, s, 0.05, lambda p, n: '#c8a878')
        barbel(s * 0.022, -0.018, 0.232, s, 0.06, lambda p, n: '#c8a878', drop=0.04)

def F_rainbowTrout():
    def pat(u, th, s, c):
        if abs(s + 0.05) < 0.3 and 0.06 < u < 0.88: return mix('#ff7aa0', '#ff9ab8', 0.5 + 0.5 * math.cos(u * 20))
        if abs(s + 0.05) < 0.5 and 0.06 < u < 0.88: return mix(c, '#ffc0d0', 0.45)
        return c
    b = fish_std(dict(L=0.5, hh=[(0, 0.012), (0.1, 0.024), (0.4, 0.064), (0.66, 0.08), (0.84, 0.066), (0.96, 0.038), (1, 0.02)], hw=[(0, 0.012), (0.1, 0.016), (0.4, 0.038), (0.66, 0.05), (0.84, 0.044), (0.96, 0.028), (1, 0.016)],
                      K=16, N=14, tail=0.125, back='#667a68', side='#dbe2ea', belly='#ffffff', fin=('#a8b0a0', '#d8e0d0'), pat=pat, dorsal=(0.4, 0.66, 0.066, 0.7), adipose=0.2, fork=0.12, eyeR=0.034, lip='#d8a0a0', gillC='#f49ab0'))
    rnd = seeded('rainbow')
    for s in (-1, 1):
        for i in range(9):
            u = 0.1 + i * 0.085 + rnd.uniform(-0.02, 0.02); h = rnd.uniform(0.5, 0.82)
            spot(b['hh'], b['hw'], b['yc'], b['L'], u, math.asin(h) if s > 0 else PI - math.asin(h), 0.0125, '#343a40', K=5)

def F_salmon():
    def pat(u, th, s, c):
        if abs(s) < 0.28: return mix(c, '#ff9a84', 0.42)
        return c
    b = fish_std(dict(L=0.54, hh=[(0, 0.013), (0.1, 0.028), (0.4, 0.07), (0.62, 0.092), (0.82, 0.076), (0.95, 0.044), (1, 0.024)], hw=[(0, 0.013), (0.1, 0.018), (0.4, 0.044), (0.62, 0.058), (0.82, 0.05), (0.95, 0.032), (1, 0.018)], yc=[(0, 0), (0.86, 0.0), (1, -0.006)],
                      K=16, N=14, tail=0.125, snout=0.25, back='#566a8e', side='#dccad2', belly='#ffe2d8', fin=('#6e7e96', '#b0bac8'), pat=pat, dorsal=(0.4, 0.62, 0.07, 0.7), adipose=0.2, fork=0.26, eyeR=0.032, eyeU=0.84, lip='#c88a84', gillC='#b8a4b0'))
    # the hooked jaw (a kype): a little curved snout over the mouth
    vtube([(0, 0.02, 0.21), (0, 0.016, 0.246), (0, -0.002, 0.264), (0, -0.018, 0.256)], lambda q: 0.018 - 0.008 * q, K=5, col=lambda p, n: mix('#566a8e', '#8e9cb8', clamp(n.z + 0.3)), tag='kype')
    rnd = seeded('salmon')
    for s in (-1, 1):
        for i in range(9):
            u = 0.14 + i * 0.08 + rnd.uniform(-0.02, 0.02); h = rnd.uniform(0.56, 0.84)
            spot(b['hh'], b['hw'], b['yc'], b['L'], u, math.asin(h) if s > 0 else PI - math.asin(h), 0.012, '#2a3448', K=5)

def F_seaBream():
    b = fish_std(dict(L=0.46, hh=[(0, 0.012), (0.1, 0.032), (0.35, 0.09), (0.58, 0.132), (0.78, 0.118), (0.93, 0.066), (1, 0.03)], hw=[(0, 0.012), (0.1, 0.02), (0.4, 0.046), (0.6, 0.058), (0.8, 0.052), (0.95, 0.034), (1, 0.02)],
                      K=16, tail=0.115, snout=0.232, back='#d64c60', side='#ff8c9a', belly='#ffe6e6', fin=('#e8505e', '#ffb0b4'), dorsal=(0.22, 0.76, 0.082, 0.62), spines=True, dorsalN=9, fork=0.5, eyeR=0.04, eyeU=0.85, eyeY=0.36, lip='#e87888', gillC='#d65a68', pecL=0.13, pecH=0.08))
    rnd = seeded('bream')
    for s in (-1, 1):
        for i in range(11):
            u = 0.2 + i * 0.052 + rnd.uniform(-0.015, 0.015); h = rnd.uniform(0.25, 0.8)
            spot(b['hh'], b['hw'], b['yc'], b['L'], u, math.asin(h) if s > 0 else PI - math.asin(h), 0.013, '#78ccff', K=5)

def F_mackerel():
    def pat(u, th, s, c):
        if s > 0.28 and u < 0.8:
            w = math.sin(u * 56 + 3.0 * math.sin(s * 3.2) + (1.2 if math.cos(th) > 0 else 0))
            if w > 0.2: return '#163858'
        if s < 0.12 and s > -0.15: return mix(c, '#bfeade', 0.4)
        return c
    b = fish_std(dict(L=0.5, hh=[(0, 0.01), (0.1, 0.018), (0.35, 0.05), (0.62, 0.068), (0.84, 0.058), (0.96, 0.032), (1, 0.016)], hw=[(0, 0.01), (0.1, 0.014), (0.35, 0.036), (0.62, 0.05), (0.84, 0.044), (0.96, 0.028), (1, 0.014)],
                      tail=0.12, back='#2a6e92', side='#98ccd8', belly='#f6fafa', fin=('#2a5a78', '#7ab0c4'), pat=pat, dorsal=(0.46, 0.66, 0.064, 0.7), fork=0.8, eyeR=0.034, lip='#88a8b0', gillC='#6a9eb0', pecL=0.085, pecH=0.05, N=15, K=18))
    # finlets: a row of little chunky triangles, a mackerel's signature
    for z0 in (-0.115, -0.08, -0.045, -0.01):
        u = (z0 - b['L'][0]) / (b['L'][1] - b['L'][0])
        y = b['yc'](u) + b['hh'](u) * 0.9
        y2 = b['yc'](u) - b['hh'](u) * 0.9
        put(glathe([(0.018, 0.0), (0.012, 0.012), (0, 0.032)], 4, pos=(0, y - 0.002, z0)), '#2a5a78', 'finlet')
        put(glathe([(0, -0.032), (0.012, -0.012), (0.018, 0.0)], 4, pos=(0, y2 + 0.002, z0)), '#7ab0c4', 'finlet')

def F_flounder():
    # flat, resting on its white side at y = 0; both eyes on top (kit frame: head +z)
    rx, rz, h = 0.17, 0.235, 0.05
    top = lambda x, z: 0.045 + h * math.sqrt(max(0.0, 1 - (x / rx) ** 2 - ((z - 0.01) / rz) ** 2))
    rings = []; cs = []; K = 22; NN = 5
    t = Tmp()
    prof = [(0.0, 0.024), (0.85, 0.018), (1.0, 0.046), (0.86, 0.068), (0.55, 0.086), (0.26, 0.096)]
    for k_, (r_, y_) in enumerate(prof[1:]):
        row = []
        for k in range(K):
            th = TAU * k / K
            ww = 1 + 0.05 * math.cos(2 * th)
            row.append(toB((math.cos(th) * rx * r_ * ww, y_, 0.01 + math.sin(th) * rz * r_)))
        rings.append(row); cs.append(toB((0, y_, 0.01)))
    ids = ring_surface(t, rings, cs, toB((0, 0.008, 0.01)), toB((0, 0.1, 0.01)))
    def col(p, n):
        if n.z < -0.15: return '#fff6ea'
        g = vnoise(p, 11.0, 3)
        c = mix('#a8824f', '#d8b880', smooth(0.3, 0.7, g))
        return mix(c, '#e8d0a0', smooth(0.6, 0.98, n.z) * 0.32)
    put(t, col, 'body')
    # the frilly fin all the way round: scallops on a real thickness
    n = 28; root = []; tip = []
    t2 = Tmp(); rr = []
    N2 = 36
    for j, (k1, y, ) in enumerate(((0.92, 0.04), (1.14, 0.038), (1.26, 0.03), (1.15, 0.022), (0.92, 0.02))):
        row = []
        for k in range(N2):
            th = TAU * k / N2
            sc = 1.0 if (k % 2 == 0) else 0.94
            kk = k1 if k1 < 1 else 1 + (k1 - 1) * sc
            if math.sin(th) < -0.82: kk = min(kk, 1.0)         # (the tail goes here)
            row.append(toB((math.cos(th) * rx * kk, y, 0.01 + math.sin(th) * rz * kk)))
        rr.append(row)
    cs2 = [toB((0, 0.03, 0.01))] * 5
    ids2 = ring_surface(t2, rr, cs2, closed=True)
    t2.c = [None] * len(t2.v)
    for j, row in enumerate(ids2):
        for k, i in enumerate(row):
            c = '#ecd2a2' if k % 2 == 0 else '#c8a472'
            if j >= 3: c = '#fff0dc'
            t2.c[i] = srgb(c)
    put(t2, None, 'frill')
    # the fan tail
    fan = []
    root = [V3(-0.05 + i * 0.1 / 6, 0.038, -0.215) for i in range(7)]
    tip = [V3(-0.11 + i * 0.22 / 6, 0.034, -0.345 - 0.014 * (i % 2) + 0.02 * abs(i - 3) / 3) for i in range(7)]
    fin(root, tip, 0.032, rows=2, c0='#c09a64', c1='#e8cc98', tag='tail')
    # freckles (raised)
    for (x, z, r) in [(-0.07, -0.08, 0.024), (0.06, -0.13, 0.02), (-0.03, 0.03, 0.018), (0.09, -0.02, 0.016), (-0.1, 0.05, 0.015), (0.01, -0.17, 0.016), (0.1, -0.09, 0.014), (-0.05, -0.15, 0.016)]:
        disc(V3(x, top(x, z) * 0.98, z), V3(x * 0.5, 1, z * 0.3).normalized(), r, '#8a6642', K=8, sc=(1, 1.2))
    # both eyes on top, stalky, to one side; the crooked little mouth
    for (x, z, r) in [(0.036, 0.13, 0.034), (0.086, 0.086, 0.031)]:
        y = top(x, z) + 0.012
        eye(x, y + 0.004, z, r, 1, out=V3(0.26, 0.86, 0.34))
    lips(0.238, 0.05, 0.022, 0.0088, x=0.03, col='#d0a070', pout=0.008)

def F_octopus():
    C = '#ff7a64'; CH = '#ffb09a'; CL = '#e0543e'; PALE = '#ffdccc'
    # the head: a big soft dome with a fold at the neck
    t = glathe([(0.0, 0.0), (0.1, 0.004), (0.128, 0.05), (0.13, 0.1), (0.172, 0.16), (0.186, 0.235), (0.158, 0.31), (0.09, 0.362), (0.0, 0.378)], 16, pos=(0, -0.008, -0.022))
    def head(p, n):
        c = mix(CL, C, clamp(n.z * 0.5 + 0.55)); c = mix(c, CH, smooth(0.35, 1.0, n.z) * 0.55)
        return mix(c, '#cc4a38', 0.5 * smooth(0.6, 0.8, vnoise(p, 13.0, 2)))
    put(t, head, 'head')
    # eight fat curling arms; the suckers are real dots on the underside of the front ones
    for k in range(8):
        a = (k + 0.5) / 8 * TAU; pts = []
        ca, sa = math.cos(a), math.sin(a); curlside = 1
        N = 7
        for i in range(N + 1):
            s = i / N; r = 0.09 + s * 0.19
            cr = 0.12 * (s ** 2.0)
            x = ca * r + (-sa) * cr * curlside; z = sa * r + ca * cr * curlside
            y = 0.04 + 0.05 * math.sin(s * PI) - 0.012 * s + (0.13 * smooth(0.66, 1.0, s))
            pts.append((x, y, z))
        rad = lambda s: 0.04 * (1 - 0.6 * s ** 1.3)
        P = [toB(p) for p in pts]
        tt = tube(P, rad, K=5, caps=True, up=Vector((0.0, 0.0, 1.0)))
        put(tt, lambda p, n: mix(PALE, mix(CL, C, clamp(n.z + 0.4)), smooth(-0.55, -0.05, n.z)), 'arm')
        for s in (0.32, 0.5, 0.68):
            i = s * N; i0 = int(i); pp = lerp3(Vector(pts[i0]), Vector(pts[i0 + 1]), i - i0)
            r_ = rad(s)
            disc(pp + V3(0, r_ * 0.86, 0), V3(ca * 0.25, 1, sa * 0.25).normalized(), r_ * 0.46, '#ffc4b0', K=6)
    # the eyes on the head's front and a pursed sculpted mouth
    for s in (-1, 1): eye(s * 0.082, 0.205, 0.128, 0.05, s, out=V3(s * 0.42, 0.1, 0.9))
    vtube([(0, 0.112, 0.138), (0, 0.112, 0.178)], lambda q: 0.03 - 0.008 * q, K=8, col=lambda p, n: mix(CL, CH, clamp(n.z * 0.6 + 0.4)), tag='mouth')
    egg((0, 0.112, 0.186), 0.018, K=6, J=3, col='#6a2a2c', tag='mouth')

def F_pufferfish():
    R = 0.17
    def col(p, n):
        z = n.z
        g = vnoise(p, 11.0, 5)
        c = mix('#fffaf0', '#f4c850', smooth(-0.15, 0.2, z))
        c = mix(c, '#e8a428', smooth(0.5, 0.95, z) * 0.55)
        if z > 0.1 and g > 0.62: return mix(c, '#6e5430', 0.84)
        return c
    put(sph(R, (0, 0, 0), K=18, J=11), col, 'body')
    # the spikes: fat cones, a Fibonacci scatter, clear of the face
    N = 34; ga = PI * (3 - math.sqrt(5))
    for i in range(N):
        u = 1 - (i + 0.5) / N * 2; r = math.sqrt(1 - u * u); th = i * ga
        d = V3(r * math.cos(th), u, r * math.sin(th))
        if d.z > 0.68 and abs(d.y) < 0.62: continue         # the face
        if abs(d.x) > 0.84 and abs(d.y) < 0.3 and d.z > -0.1: continue     # the fins
        q = Vector((0, 0, 1)).rotation_difference(toB(d)).to_matrix().to_4x4()
        t = lathe([(0.03, 0.0), (0.021, 0.012), (0.0, 0.062)], 5).xform(Matrix.Translation(toB(d * (R - 0.006))) @ q)
        put(t, lambda p, n: mix('#f6dc90', '#fff8e0', smooth(0.0, 1.0, (p.length - R) / 0.056)), 'spike')
    # the fins: tail, a little dorsal, pectorals out of the sides
    fan_tail(-0.155, 0.0, 0.066, 0.08, fork=-0.1, n=5, c0='#e8b43c', c1='#ffdc84', rows=1)
    for s in (-1, 1): side_fin(s * 0.156, 0.0, 0.05, 0.1, 0.09, s, '#e8b43c', '#ffdc84', down=0.1, back=0.3, n=5)
    dorsal(-0.09, -0.025, lambda z: 0.156, 0.06, peak=0.5, n=4, c0='#e8b43c', c1='#ffdc84')
    # the big worried eyes and a pouty mouth
    for s in (-1, 1): eye(s * 0.082, 0.052, 0.134, 0.056, s, out=V3(s * 0.5, 0.14, 0.86))
    lips(0.178, -0.042, 0.03, 0.018, col='#ff9aa0', pout=0.01)

FISH_FN = dict(crucian=F_crucian, koi=F_koi, goldKoi=F_goldKoi, moonKoi=F_moonKoi, ayu=F_ayu, trout=F_trout, char=F_char, loach=F_loach, rainbowTrout=F_rainbowTrout,
               salmon=F_salmon, seaBream=F_seaBream, mackerel=F_mackerel, flounder=F_flounder, octopus=F_octopus, pufferfish=F_pufferfish)
def build_fish(id_):
    new_asset()
    FISH_FN[id_]()
    ray_ao(DMAX=0.08, K=0.4, NR=12, off=0.004)
    export_piece('prop-fish-' + id_, budget=1500)
