# Skeleton, skin weights, poses and expressions for the Disney-style heroes (numpy side; build.py makes the Blender
# armature). World space: Z up, facing -Y, character's left = +X. Face weights are computed in head sculpt space.
# The landmarks come from a character module (chewy.py by default; build.py calls bind(moka) for Moka). A module may
# add hooks: ear_bones(s) / ear_weights(P) (ears that are not Chewy's rose ears), BODY_BONES (limb radii), FACE_W
# (jaw/lip-corner ranges), POSES (extra body poses) and tweak_expression(name, E, helpers).
import numpy as np
import chewy
from chewy import (V, to_world, to_head, EYE, EYE_R, EYE_ROT, EAR_BASE, EAR_R, EAR_UF, EAR_TH, JAW_PIVOT, LIP_CORNER,
                   BROW, lip_z, ARM_P, LEG_P, TAIL_P, smoothstep, ear_plates, _len)
CH = chewy
_BOUND = ('V', 'to_world', 'to_head', 'EYE', 'EYE_R', 'EYE_ROT', 'EAR_BASE', 'EAR_R', 'EAR_UF', 'EAR_TH', 'JAW_PIVOT',
          'LIP_CORNER', 'BROW', 'lip_z', 'ARM_P', 'LEG_P', 'TAIL_P', 'smoothstep', 'ear_plates', '_len')

def bind(ch):
    """point the rig at a character module (its landmarks and optional hooks)"""
    global CH
    CH = ch
    g = globals()
    for n in _BOUND:
        if hasattr(ch, n): g[n] = getattr(ch, n)
    BODY_POSES.clear(); BODY_POSES.update(_BASE_POSES); BODY_POSES.update(getattr(ch, 'POSES', {}))

MX = np.diag([-1.0, 1, 1])

def _m(p, s):
    p = np.array(p, float).copy(); p[..., 0] *= s; return p

def ear_frame(s):
    """world-space axes of an ear: across (v), out of the inner face (w), up the ear (u)"""
    R = EAR_R if s > 0 else MX @ EAR_R
    return R[:, 0], -R[:, 1], R[:, 2]

def bone_defs():
    """(name, head, tail, parent, z-axis hint) in world space; the Animator-facing names match the game rig"""
    B = []
    def add(n, h, t, par, up=(0, -1, 0)):
        B.append((n, np.array(h, float), np.array(t, float), par, np.array(up, float)))
    add('root', (0, 0, 0), (0, 0, 0.08), None)
    add('hips', (0, 0.0, 0.33), (0, 0.0, 0.43), 'root')
    add('spine', (0, 0, 0.43), (0, 0, 0.52), 'hips')
    add('chest', (0, 0, 0.52), (0, 0, 0.62), 'spine')
    add('neck', (0, 0.0, 0.62), (0, -0.005, 0.71), 'chest')
    add('head', (0, -0.005, 0.71), (0, -0.005, 0.9), 'neck')
    add('jaw', to_world(JAW_PIVOT), to_world((0, -0.2, 0.905)), 'head', (0, 0, 1))
    for side, s in (('L', 1), ('R', -1)):
        eye = to_world(_m(EYE, s)); gaze = _m(EYE_ROT @ V(0, -1, 0), s)
        add(f'eye_{side}', eye, eye + gaze * 0.03, 'head', (0, 0, 1))
        add(f'lidU_{side}', eye, eye + gaze * 0.028, 'head', (0, 0, 1))
        add(f'lidD_{side}', eye, eye + gaze * 0.026, 'head', (0, 0, 1))
        add(f'brow_{side}', to_world(_m(BROW, s)), to_world(_m(BROW, s)) + V(0, -0.02, 0), 'head', (0, 0, 1))
        add(f'lip_{side}', to_world(_m(LIP_CORNER, s)), to_world(_m(LIP_CORNER, s)) + V(0, -0.015, 0), 'head', (0, 0, 1))
        if hasattr(CH, 'ear_bones'):  # (base, fold, tip end, roll hint) in world space
            base, fold, end, hint = CH.ear_bones(s)
            add(f'ear_{side}', base, fold, 'head', hint)
            add(f'earTip_{side}', fold, end, f'ear_{side}', hint)
        else:
            v, w, u = ear_frame(s)
            base = to_world(_m(EAR_BASE, s)); fold = base + u * EAR_UF * CH.HEAD_SCALE
            flap_dir = u * np.cos(EAR_TH) + w * np.sin(EAR_TH)
            add(f'ear_{side}', base, fold, 'head', w)
            add(f'earTip_{side}', fold, fold + flap_dir * 0.08, f'ear_{side}', w)
        add(f'upperarm_{side}', _m(ARM_P[0], s), _m(ARM_P[1], s), 'chest')
        add(f'forearm_{side}', _m(ARM_P[1], s), _m(ARM_P[2], s), f'upperarm_{side}')
        add(f'hand_{side}', _m(ARM_P[2], s), _m((0.182, -0.034, 0.285), s), f'forearm_{side}')
        add(f'thigh_{side}', _m(LEG_P[0], s), _m(LEG_P[1], s), 'hips')
        add(f'shin_{side}', _m(LEG_P[1], s), _m(LEG_P[2], s), f'thigh_{side}')
        add(f'foot_{side}', _m(LEG_P[2], s), _m((0.073, -0.092, 0.02), s), f'shin_{side}', (0, 0, 1))
    prev = 'hips'
    for i in range(4):
        add(f'tail{i + 1}', TAIL_P[i], TAIL_P[i + 1], prev, (0, -1, 0)); prev = f'tail{i + 1}'
    return B

# ------------------------------------------------------------------ weights
# body: each vertex goes to the nearest bone "surface" (distance to the bone segment minus a local radius), with a
# soft exponential blend across joints
BODY_BONES = {'hips': 0.104, 'spine': 0.104, 'chest': 0.104, 'neck': 0.05, 'head': 0.07,
              'upperarm': 0.039, 'forearm': 0.032, 'hand': 0.03, 'thigh': 0.056, 'shin': 0.042, 'foot': 0.04,
              'tail1': 0.034, 'tail2': 0.038, 'tail3': 0.03, 'tail4': 0.015}

def _seg_dist(P, a, b):
    ba = b - a; t = np.clip(((P - a) @ ba) / (ba @ ba), 0, 1)
    return _len(P - (a + ba * t[:, None]))

CHAINS = {  # a vertex belongs to one chain; it blends inside it and with the chain's anchor (shoulder / hip)
    'torso': ['hips', 'spine', 'chest', 'neck', 'head'],
    'arm_L': ['upperarm_L', 'forearm_L', 'hand_L'], 'arm_R': ['upperarm_R', 'forearm_R', 'hand_R'],
    'leg_L': ['thigh_L', 'shin_L', 'foot_L'], 'leg_R': ['thigh_R', 'shin_R', 'foot_R'],
    'tail': ['tail1', 'tail2', 'tail3', 'tail4'],
}
ANCHOR = {'arm_L': 'chest', 'arm_R': 'chest', 'leg_L': 'hips', 'leg_R': 'hips', 'tail': 'hips'}

def body_weights(P, sigma=0.011, chains=None):
    """(weights, chain per vertex). `chains` restricts which chains a point may join (clothes: the gi body never
    follows a hand)."""
    defs = {n: (h, t) for n, h, t, _, _ in bone_defs()}
    names = [n for c in CHAINS.values() for n in c]
    radius = getattr(CH, 'BODY_BONES', BODY_BONES)
    S = np.stack([_seg_dist(P, *defs[n]) - radius[n.split('_')[0]] for n in names], 1)
    col = {n: i for i, n in enumerate(names)}
    cs = [c for c in CHAINS if chains is None or c in chains]
    best = np.stack([S[:, [col[n] for n in CHAINS[c]]].min(1) for c in cs], 1)
    chain = np.array(cs)[best.argmin(1)]
    allowed = np.zeros_like(S, bool)
    for c in cs:
        m = chain == c
        for n in CHAINS[c] + ([ANCHOR[c]] if c in ANCHOR else []): allowed[m, col[n]] = True
        if c == 'torso':  # the shoulder tops and hips of the torso ease into the limbs (armpits stay with the chest)
            for n in ('thigh_L', 'thigh_R', 'tail1'): allowed[m, col[n]] = True
            for n in ('upperarm_L', 'upperarm_R'): allowed[m & (P[:, 2] > 0.575), col[n]] = True
    S = np.where(allowed, S, np.inf)
    W = np.exp(-(S - S.min(1, keepdims=True)) / sigma)
    top = np.argsort(-W, 1)[:, 4:]; np.put_along_axis(W, top, 0, 1)
    W /= W.sum(1, keepdims=True)
    return {n: W[:, i] for i, n in enumerate(names)}, chain

def face_weights(Pw):
    """head mesh (world points): jaw, lip corners, lids, brows, ears (base + folded tip), the rest on the head"""
    Q = to_head(Pw); sx = np.sign(Q[:, 0]); P = np.concatenate([np.abs(Q[:, :1]), Q[:, 1:]], -1)
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    W = {}
    F = dict(corner_x=(0.045, 0.065), jaw_y=(-0.07, -0.15), jaw_z=(0.85, 0.885), corner_r=0.018, brow_r=0.024)
    F.update(getattr(CH, 'FACE_W', {}))
    trans = 0.0012 + 0.02 * smoothstep(*F['corner_x'], x)  # sharp at the parting (lips separate cleanly), soft in the cheeks
    below = smoothstep(0.0, -trans, z - lip_z(x))                       # under the parting ...
    jaw = below * smoothstep(*F['jaw_y'], y) * smoothstep(*F['jaw_z'], z)  # ... toward the front, easing into cheeks/throat
    corner = np.exp(-(_len(P - LIP_CORNER) / F['corner_r']) ** 2)
    q = (P - EYE) @ EYE_ROT; r = _len(q)
    near = smoothstep(EYE_R + 0.021, EYE_R + 0.012, r) * smoothstep(0.35 * EYE_R, -0.05 * EYE_R, q[:, 1])
    up = smoothstep(-0.25 * EYE_R, 0.05 * EYE_R, q[:, 2])
    brow = np.exp(-(_len(P - BROW) / F['brow_r']) ** 2) * (1 - near)
    if hasattr(CH, 'ear_weights'):  # (whole ear, tip part) 0..1
        ear, tip = CH.ear_weights(P)
    else:
        lower, flap = ear_plates(P)
        ear = smoothstep(0.016, 0.0, np.minimum(lower, flap))
        tip = ear * smoothstep(-0.004, 0.004, lower - flap)
    for side, m in (('L', sx > 0), ('R', sx <= 0)):
        f = m.astype(float)
        W[f'lip_{side}'] = corner * f * 0.8
        W[f'lidU_{side}'] = near * up * f
        W[f'lidD_{side}'] = near * (1 - up) * f
        W[f'brow_{side}'] = brow * f * 0.9
        W[f'earTip_{side}'] = tip * f
        W[f'ear_{side}'] = (ear - tip) * f
    W['jaw'] = jaw * (1 - corner * 0.5)
    tot = sum(W.values())
    k = np.where(tot > 1, 1 / np.maximum(tot, 1e-9), 1.0)
    for n in W: W[n] = W[n] * k
    W['head'] = np.clip(1 - sum(W.values()), 0, 1)
    return W

# ------------------------------------------------------------------ poses and expressions
# Each entry: bone -> list of (world axis, degrees) rotations about the bone's head, relative to its parent, and/or
# a world-space translation ('t'). Built so the numbers read like directions: +X = his left, -Y = forward, +Z = up.
def ear_axes(s):
    v, w, u = ear_frame(s)
    return v, w, u

def rot_about(axis, deg):
    return (np.asarray(axis, float), float(deg))

def expression(name):
    """face poses (plus a little head/ear body language)"""
    E = {'rot': {}, 't': {}}
    R, T = E['rot'], E['t']
    def both(bone, fn):
        for side, s in (('L', 1), ('R', -1)): fn(f'{bone}_{side}', s)
    def ears(back=0.0, out=0.0, unfold=0.0):
        def f(b, s):
            v, w, u = ear_axes(s)
            R[b] = [rot_about(V(1, 0, 0), -back), rot_about(V(0, 1, 0), out * s)]
        both('ear', f)
        both('earTip', lambda b, s: R.__setitem__(b, [rot_about(ear_axes(s)[0], -unfold * s)]))
    def lids(upper=0.0, lower=0.0):
        def f(b, s):
            ax = _m(EYE_ROT[:, 0], s)
            R[b] = [rot_about(ax, (upper if b.startswith('lidU') else -lower) * s)]
        both('lidU', f); both('lidD', f)
    def brows(up=0.0, inner=0.0):
        both('brow', lambda b, s: T.__setitem__(b, V(0, 0, up * 0.001) + V(-s * inner * 0.0006, 0, inner * 0.001)))
    def lips(up=0.0, back=0.0):
        both('lip', lambda b, s: T.__setitem__(b, V(0, back * 0.001, up * 0.001)))
    def jaw(deg): R['jaw'] = [rot_about(V(1, 0, 0), deg)]
    if name == 'neutral':
        pass
    elif name == 'happy':        # talking, smiling, ears forward
        jaw(7); lips(8, 5); brows(2); lids(0, 12); ears(-8, 0, 12)
    elif name == 'laugh':
        jaw(20); lips(7, 4); brows(3); lids(8, 22); ears(-5, 6, 18)
    elif name == 'surprised':
        jaw(18); lips(-1, -2); brows(6); lids(-9, 0); ears(-12, -6, 40)
    elif name == 'sad':
        jaw(2); lips(-4, 0); brows(1, 5); lids(14, 0); ears(22, 18, -10)
    elif name == 'determined':
        jaw(0); lips(-2, 2); brows(-3, -4); lids(12, 8); ears(18, -4, 20)
    elif name == 'blink':
        lids(70, 8); lips(3, 2)
    elif name == 'bark':
        jaw(26); lips(2, 2); brows(-2, -3); lids(10, 14); ears(14, 0, 10)
    if hasattr(CH, 'tweak_expression'):  # the character's own take (e.g. Moka's hanging ears lift instead of perking)
        CH.tweak_expression(name, E, dict(both=both, ears=ears, lids=lids, brows=brows, lips=lips, jaw=jaw, rot_about=rot_about))
    return E

BODY_POSES = {
    'apose': {},
    'hero': {  # chest out, fists on hips (elbows out), head up a touch
        'spine': [rot_about(V(1, 0, 0), -4)], 'chest': [rot_about(V(1, 0, 0), -3)], 'head': [rot_about(V(1, 0, 0), -6), rot_about(V(0, 0, 1), 8)],
        'upperarm_L': [rot_about(V(0, 1, 0), -42), rot_about(V(1, 0, 0), 12)], 'forearm_L': [rot_about(V(0, 1, 0), 88)],
        'upperarm_R': [rot_about(V(0, 1, 0), 42), rot_about(V(1, 0, 0), 12)], 'forearm_R': [rot_about(V(0, 1, 0), -88)],
        'thigh_L': [rot_about(V(0, 1, 0), -6)], 'thigh_R': [rot_about(V(0, 1, 0), 6)],
        'tail1': [rot_about(V(1, 0, 0), -10)], 'tail2': [rot_about(V(0, 0, 1), 15)], 'tail3': [rot_about(V(0, 0, 1), 15)],
    },
    'wave': {
        'head': [rot_about(V(0, 0, 1), -10), rot_about(V(0, 1, 0), 6)],
        'upperarm_R': [rot_about(V(0, 1, 0), 88), rot_about(V(1, 0, 0), -15)], 'forearm_R': [rot_about(V(0, 1, 0), 62)], 'hand_R': [rot_about(V(0, 1, 0), 10)],
        'upperarm_L': [rot_about(V(0, 1, 0), -8)],
        'tail2': [rot_about(V(0, 0, 1), -20)], 'tail3': [rot_about(V(0, 0, 1), -25)],
    },
}
_BASE_POSES = dict(BODY_POSES)


# ------------------------------------------------------------------ animation
def _spring(drive, dt, k=260.0, c=9.0):
    """damped spring following drive(t) samples: ears and ear tips lag, overshoot and settle"""
    x = np.zeros_like(drive); v = 0.0
    for i in range(1, len(drive)):
        a = k * (drive[i] - x[i - 1]) - c * v
        v += a * dt; x[i] = x[i - 1] + v * dt
    return x

def _bump(t, a, b):
    """0 -> 1 -> 0 over [a, b]"""
    u = np.clip((t - a) / (b - a), 0, 1)
    return np.sin(np.pi * u) ** 2 if np.ndim(t) else float(np.sin(np.pi * u) ** 2)

class Clip:
    """'hello': Chewy greets the camera. Jaw on syllables, smile, brow emphasis, a blink, a laugh at the end; the ears
    perk up at the start and ride the head's motion through a spring (lag, overshoot, flop)."""
    SYL = [(0.28, 0.44, 11), (0.47, 0.66, 15), (0.72, 0.86, 8), (0.9, 1.18, 17),                  # "Hi there!"
           (1.62, 1.76, 9), (1.79, 1.98, 13), (2.02, 2.14, 7), (2.18, 2.5, 15),                  # "I'm Chewy!"
           (2.75, 2.93, 18), (2.98, 3.16, 21), (3.2, 3.42, 19)]                                  # laugh
    def __init__(self, T=4.0, hz=240):
        self.T, self.dt = T, 1.0 / hz
        t = np.arange(0, T + self.dt, self.dt); self.t = t
        self.nod = 3.5 * np.sin(2 * np.pi * 1.1 * t) * smoothstep(0.0, 0.6, t) + 5 * _bump(t, 2.7, 3.5)  # smooth: its acceleration drives the ears
        self.turn = 7 * np.sin(2 * np.pi * 0.28 * t + 0.4)
        self.tilt = 6 * _bump(t, 1.35, 2.2) - 3 * _bump(t, 2.6, 3.4)
        head_acc = np.gradient(np.gradient(self.nod, self.dt), self.dt)
        perk = _bump(t, 0.0, 0.9)
        # ears: drive = expression target + inertia from the head (they swing opposite the head's acceleration)
        self.ear_back = _spring(-10 * perk + 12 * _bump(t, 2.7, 3.6) - 0.004 * head_acc, self.dt)
        self.ear_out = _spring(4 * _bump(t, 1.4, 2.2) + 6 * _bump(t, 2.7, 3.6), self.dt, k=180)
        self.tip = _spring(30 * perk - 12 * _bump(t, 2.7, 3.5) - 0.012 * head_acc, self.dt, k=140, c=5)
    def at(self, t):
        i = min(int(round(t / self.dt)), len(self.t) - 1)
        jaw = sum(amp * np.sin(np.pi * (t - a) / (b - a)) ** 0.8 for a, b, amp in self.SYL if a < t < b)
        E = expression('neutral'); R, Tr = E['rot'], E['t']
        R['jaw'] = [rot_about(V(1, 0, 0), jaw)]
        smile = 5 + 3 * _bump(t, 0.0, 0.6) + 4 * _bump(t, 2.6, 3.6)
        emph = sum(_bump(t, a - 0.05, b) for a, b, amp in self.SYL if amp >= 15)
        blink = _bump(t, 1.5, 1.66)
        squint = 14 * _bump(t, 2.65, 3.6)
        for side, s_ in (('L', 1), ('R', -1)):
            Tr[f'lip_{side}'] = V(0, 0.004 + 0.002 * smile / 8, 0.001 * smile)
            Tr[f'brow_{side}'] = V(0, 0, 0.001 * (2 + 3 * min(emph, 1)))
            ax = EYE_ROT[:, 0].copy(); ax[0] *= s_
            R[f'lidU_{side}'] = [rot_about(ax, (70 * blink + 0.6 * squint) * s_)]
            R[f'lidD_{side}'] = [rot_about(ax, -(8 + squint) * s_)]
            R[f'ear_{side}'] = [rot_about(V(1, 0, 0), -self.ear_back[i]), rot_about(V(0, 1, 0), self.ear_out[i] * s_)]
            R[f'earTip_{side}'] = [rot_about(ear_frame(s_)[0], -self.tip[i] * s_)]
        body = {
            'head': [rot_about(V(1, 0, 0), self.nod[i]), rot_about(V(0, 1, 0), self.tilt[i]), rot_about(V(0, 0, 1), self.turn[i])],
            'chest': [rot_about(V(0, 0, 1), 0.3 * self.turn[i])],
            'tail2': [rot_about(V(0, 0, 1), 22 * np.sin(2 * np.pi * 2.2 * t))], 'tail3': [rot_about(V(0, 0, 1), 26 * np.sin(2 * np.pi * 2.2 * t - 0.6))],
            'tail4': [rot_about(V(0, 0, 1), 20 * np.sin(2 * np.pi * 2.2 * t - 1.2))],
            'upperarm_L': [rot_about(V(0, 1, 0), -6 - 4 * _bump(t, 2.7, 3.5))], 'upperarm_R': [rot_about(V(0, 1, 0), 6 + 4 * _bump(t, 2.7, 3.5))],
        }
        return body, E
