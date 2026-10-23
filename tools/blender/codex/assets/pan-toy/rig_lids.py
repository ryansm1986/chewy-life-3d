"""Pan's eyelids for the rig (imported by rig_pan-toy.py after the RIG_MODE build has run; pure numpy + BVH).

The upper lid is Pan's approved sleepy lid: at lidU = 0 its lash ledge is exactly the approved one. It is a rigid shell
about the game's tilted lid hinge (HERO_MODELS lidTilt: Blender axis (cos t, +-sin t, 0) through the bone head). Per
column: the approved ledge rows and the approved slope rows (the lid surface down to flush with the skin), then a body
that carries on round the hinge at the slope's end radius, under the skin above the rest edge (in RIG_MODE the skin's
eye hole is the visible opening only: the game never opens Pan's eye wider than rest). Closing (+1.22) the body sweeps
down over the eye and tucks under the lower rim, where a painted dark lash ribbon lands ("U"); the static wing on the
head continues it at the outer corner.
The lower lid is built at the happy pose (-0.24) hugging the eye, then turned back about a long lever hinge, so at the
neutral -0.10 it sits under the cheek.
"""
import math
import numpy as np
from mathutils import Vector

def rot_axis(V, Pv, axis, ang):
    k = np.asarray(axis, float) / np.linalg.norm(axis); d = np.asarray(V, float) - Pv
    c, s_ = math.cos(ang), math.sin(ang)
    return Pv + d * c + np.cross(k, d) * s_ + np.outer(d @ k, k) * (1 - c)

class Lids:
    def __init__(self, ns, eye_tree):
        self.ns = ns; self.eye_tree = eye_tree
        self.W, self.EX, self.EZ, self.EHW, self.EHH, self.EN = ns['W'], ns['EX'], ns['EZ'], ns['EHW'], ns['EHH'], ns['EN']
        self.head_sdf, self.front_hit, self.grad_n = ns['head_sdf'], ns['front_hit'], ns['grad_n']
    # ------------------------------------------------------------------ helpers
    def hinge(self, tag, t):
        s = 1 if tag == 'L' else -1; return np.array([math.cos(t), s * math.sin(t), 0.])
    def eye_XZ(self, tag, P):
        s = 1 if tag == 'L' else -1; P = np.asarray(P, float)
        return s * (P[..., 0] - s * self.EX) / self.EHW, (P[..., 2] - self.EZ) / self.EHH
    def eye_sr(self, tag, P):
        X, Z = self.eye_XZ(tag, P); return (np.abs(X) ** self.EN + np.abs(Z) ** self.EN) ** (1 / self.EN)
    def in_opening(self, tag, P):
        """front projection inside the visible opening (under the rest edge, inside the outline)"""
        X, Z = self.eye_XZ(tag, P); sr = (np.abs(X) ** self.EN + np.abs(Z) ** self.EN) ** (1 / self.EN)
        return (sr < 1.0) & (Z < self.ns['lid_edge_Z'](X))
    def pivot(self, tag, B, Zo):
        """a point B metres behind the eye's surface centre along its axis, Zo (eye heights EHH) above it"""
        s = 1 if tag == 'L' else -1; ax = self.ns['eye_axes'][tag]
        Sc = np.array([s * self.EX, float(self.front_hit(s * self.EX, self.EZ)[0]), self.EZ])
        return Sc - ax * B + np.array([0, 0, Zo * self.EHH])
    def eye_dist(self, P, Pv, k, tag):
        """distance from the hinge axis to the eye surface along each point's radial direction (nan: misses)"""
        out = np.full(len(P), np.nan)
        for i, p in enumerate(P):
            c = p - Pv; a = Pv + k * (c @ k); u = c - k * (c @ k); r = np.linalg.norm(u); u = u / r
            h = self.eye_tree[tag].ray_cast(Vector(a + u * (r + .05)), Vector(-u), r + .05)
            if h[0] is not None: out[i] = r + .05 - h[3]
        return out
    # ------------------------------------------------------------------ the upper lid
    def upper(self, tag, t, B, Zo, n_body=22, a_top=1.42, v_slope=.42):
        R = self.ns['LID_REST'][tag]; G = R['G']; vc = np.array(R['vcoord']); NL = R['NL']
        k = self.hinge(tag, t); Pv = self.pivot(tag, B, Zo)
        js = [j for j in range(G.shape[0]) if j < NL or vc[j] <= .12 + .88 * v_slope + 1e-6]       # the ledge + the slope
        Gr = G[js]                                         # rows x cols x 3 (rest, world)
        nrow, ncol = Gr.shape[0], Gr.shape[1]
        last = Gr[-1]                                      # the slope's end: flush with the skin
        rows = [Gr[j] for j in range(nrow)]; vrow = [float(vc[j]) for j in js]
        # the body: from the slope's end, on round the hinge (negative angles = up, away from closing) at constant radius
        for m in range(1, n_body + 1):
            a = -a_top * (m / n_body) ** 1.0
            rows.append(np.array([rot_axis(last[i:i + 1], Pv, k, a)[0] for i in range(ncol)]))
            vrow.append(vrow[nrow - 1] + (1 - vrow[nrow - 1]) * m / n_body)
        V = np.array(rows)                                 # (rows, cols, 3)
        return dict(V=V, v=np.array(vrow), uu=R['uu'], k=k, Pv=Pv, NL=NL, nslope=nrow, tag=tag, t=t, B=B, Zo=Zo, a_top=a_top)
    def score_upper(self, L, sq=.30, detail=False):
        """the constraints, sampled through the sweep 0 .. 1.22"""
        tag, k, Pv, V = L['tag'], L['k'], L['Pv'], L['V']; nr, nc, _ = V.shape; flat = V.reshape(-1, 3)
        res = {}
        # 1. shut: the edge (ledge rows) below the lower outline for |X| < .95, i.e. no ledge point over the opening
        Vs = rot_axis(flat, Pv, k, 1.22).reshape(nr, nc, 3)
        edge_s = Vs[L['NL'] // 2]
        X_, Z_ = self.eye_XZ(tag, edge_s); zl = -(np.clip(1 - np.abs(X_) ** self.EN, 0, 1)) ** (1 / self.EN)
        m = np.abs(X_) < .95
        res['shut_edge_above_lowrim_EHH'] = float((Z_[m] - zl[m]).max()) if m.any() else 0.
        res['shut_edge_rel_lowrim_EHH'] = [round(float(v), 2) for v in np.percentile(Z_[m] - zl[m], [0, 50, 100])] if m.any() else None
        # 2. the body over the opening never inside the eye (any angle): min (lid radius - eye radius) over opening points
        worst_eye = 9.; worst_skin = -9.; poke_ledge = -9.
        for a in np.linspace(0, 1.22, 9):
            Va = rot_axis(flat, Pv, k, a).reshape(nr, nc, 3)
            body = Va[L['nslope'] - 1:].reshape(-1, 3)
            op = self.in_opening(tag, body)
            if op.any():
                ed = self.eye_dist(body[op][::3], Pv, k, tag); c = body[op][::3] - Pv; r = np.linalg.norm(c - np.outer(c @ k, k), axis=1)
                d = r - ed; d = d[np.isfinite(d)]
                if len(d): worst_eye = min(worst_eye, float(d.min()))
            # 3. outside the opening the body stays under the skin
            sd = self.head_sdf(body[~op]); worst_skin = max(worst_skin, float(sd.max()) if len(sd) else -9.)
            led = Va[:L['NL']].reshape(-1, 3); opl = self.in_opening(tag, led) | (self.eye_sr(tag, led) < 1.0)
            if a > .05 and (~opl).any(): poke_ledge = max(poke_ledge, float(self.head_sdf(led[~opl]).max()))
        res['body_minus_eye_mm'] = worst_eye * 1000; res['body_out_of_skin_mm'] = worst_skin * 1000; res['ledge_poke_mm'] = poke_ledge * 1000
        # 4. the happy edge at sq: visible edge ends in screen space, front and both game yaws (pitch 35.5 deg)
        Vq = rot_axis(flat, Pv, k, sq).reshape(nr, nc, 3); E = Vq[L['NL'] // 2]
        vis = (self.eye_sr(tag, E) < .99)
        s = 1 if tag == 'L' else -1
        out = {}
        if vis.sum() >= 2:
            Ev = E[vis]; o = np.argsort(s * Ev[:, 0]); Ev = Ev[o]
            for nm, (yaw, el) in (('front', (0, 0)), ('g0', (0, 35.5)), ('g+45', (45, 35.5)), ('g-45', (-45, 35.5))):
                e = math.radians(el); y = math.radians(yaw)
                d = np.array([math.sin(y) * math.cos(e), -math.cos(y) * math.cos(e), math.sin(e)])
                right = np.cross(-d, [0, 0, 1.]); right /= np.linalg.norm(right); up = np.cross(right, -d)
                h = Ev @ up / self.W; out[nm] = round(float(h[-1] - h[0]), 4)
            X_, Z_ = self.eye_XZ(tag, Ev); out['cover_mid'] = round(float((self.ns['lid_edge_Z'](0) - Z_[len(Z_) // 2]) / (self.ns['lid_edge_Z'](0) + 1)), 3)
        res['happy_outer_minus_inner_W'] = out
        return res
    # ------------------------------------------------------------------ the upper lid, round 2: hidden at rest
    def upper2(self, tag, t, B, Zo, u_sq=.30, zlev=-.09, slope=.04, nc=23, a_top=1.55, n_body=26, gap=.0012):
        """the moving lid (the approved ledge stays on the head): designed at the happy squint u_sq, its edge a level line
        (zlev EHH above the eye centre, rising `slope` EHH toward the outer corner, rounding up softly into the corners),
        every column at one radius r_b just in front of the eye over the opening; rest = that shape turned back by u_sq"""
        s = 1 if tag == 'L' else -1; k = self.hinge(tag, t); Pv = self.pivot(tag, B, Zo)
        EX, EZ, EHW, EHH = self.EX, self.EZ, self.EHW, self.EHH
        Xs = np.linspace(-1.10, 1.10, nc); cols = []; diag = []
        for X in Xs:
            x = s * EX + s * EHW * X
            Zq = zlev + slope * (X + 1) / 2 + .30 * float(np.clip((abs(X) - .78) / .34, 0, 1)) ** 2
            z = EZ + EHH * Zq
            h = self.eye_tree[tag].ray_cast(Vector((x, -1.5, z)), Vector((0, 1, 0)), 3)
            y = h[0].y if h[0] is not None else float(self.front_hit(np.array([x]), np.array([z]))[0])
            Eq = np.array([x, y, z]); c = Eq - Pv; A = Pv + k * (c @ k); u = (Eq - A) / np.linalg.norm(Eq - A)
            # the eye's distance along this column's circle over the visible opening, from 0.9 rad above to 1.1 below
            angs = np.linspace(-.9, 1.1, 81); r0 = float(np.linalg.norm(Eq - A))
            P = np.array([rot_axis((A + u * r0)[None], A, k, a)[0] for a in angs])
            op = self.in_opening(tag, P)
            ed = self.eye_dist(P[op], A, k, tag) if op.any() else np.array([np.nan])
            ed = ed[np.isfinite(ed)]
            r_b = (float(ed.max()) + gap) if len(ed) else r0
            E = A + u * r_b
            cols.append(dict(X=X, A=A, E=E, r_b=r_b))
            diag.append((round(float(X), 2), round(r_b, 4), round((r_b - r0) * 1000, 1)))
        rows = []; vrow = []
        for m in range(n_body + 1):
            al = a_top * (m / n_body) ** 1.0
            rows.append(np.array([rot_axis(c_['E'][None], c_['A'], k, -u_sq - al)[0] for c_ in cols])); vrow.append(m / n_body)
        V = np.array(rows)                                # (rows, cols, 3) at rest; row 0 = the edge
        return dict(V=V, v=np.array(vrow), uu=(Xs - Xs[0]) / (Xs[-1] - Xs[0]), Xs=Xs, k=k, Pv=Pv, tag=tag, t=t, B=B, Zo=Zo,
                    u_sq=u_sq, a_top=a_top, cols=cols, diag=diag)
    def score2(self, L, angs=None):
        tag, k, Pv, V = L['tag'], L['k'], L['Pv'], L['V']; nr, nc, _ = V.shape; flat = V.reshape(-1, 3); res = {}
        angs = np.linspace(0, 1.22, 13) if angs is None else angs
        worst_eye = 9.; skin = {}
        for a in angs:
            Va = rot_axis(flat, Pv, k, a); op = self.in_opening(tag, Va)
            if op.any():
                sub = np.where(op)[0][::2]; ed = self.eye_dist(Va[sub], Pv, k, tag)
                c = Va[sub] - Pv; r = np.linalg.norm(c - np.outer(c @ k, k), axis=1); d = r - ed; d = d[np.isfinite(d)]
                if len(d): worst_eye = min(worst_eye, float(d.min()))
            sd = self.head_sdf(Va); sd = np.where(op, -9., sd)
            skin[round(float(a), 3)] = round(float(sd.max()) * 1000, 1)
        res['eye_clear_min_mm'] = round(worst_eye * 1000, 1); res['out_of_skin_mm_by_angle'] = skin
        # shut: the edge below the lower outline (|X| < .95)
        Es = rot_axis(V[0], Pv, k, 1.22); X_, Z_ = self.eye_XZ(tag, Es)
        zl = -(np.clip(1 - np.abs(X_) ** self.EN, 0, 1)) ** (1 / self.EN); m = np.abs(X_) < .95
        res['shut_edge_rel_lowrim_EHH'] = [round(float(v), 2) for v in np.percentile(Z_[m] - zl[m], [0, 50, 100])]
        # rest: the edge hidden (above the hole top)
        X_, Z_ = self.eye_XZ(tag, V[0]); res['rest_edge_minus_holetop_EHH_min'] = round(float((Z_ - self.ns['lid_edge_Z'](X_))[np.abs(X_) < 1].min()), 3)
        res['r_b_mm_range'] = [round(min(c['r_b'] for c in L['cols']) * 1000, 1), round(max(c['r_b'] for c in L['cols']) * 1000, 1)]
        worst = []
        for a in (0., .3, .6, 1.22):
            Va = rot_axis(flat, Pv, k, a); op = self.in_opening(tag, Va); sd = np.where(op, -9., self.head_sdf(Va))
            for i in np.argsort(-sd)[:4]:
                j, c_ = divmod(int(i), nc); X_, Z_ = self.eye_XZ(tag, Va[i])
                worst.append((a, round(float(L['Xs'][c_]), 2), j, round(float(sd[i]) * 1000, 1), round(float(X_), 2), round(float(Z_), 2)))
        res['worst(a, colX, row, mm, X, Z)'] = worst
        return res
    # ------------------------------------------------------------------ the upper lid, round 3: circles through the hole's rims
    def skin_dist_dirs(self, A, D, t1=.25, it=30):
        """distance from A (inside the head) to the skin along each direction (outermost crossing)"""
        D = np.asarray(D, float); n = len(D); ts = np.linspace(t1, .005, 120)
        Pp = A[None, None, :] + D[:, None, :] * ts[None, :, None]
        ins = (self.head_sdf(Pp.reshape(-1, 3)) < 0).reshape(n, len(ts)); i = np.argmax(ins, 1)
        lo = ts[i]; hi = ts[np.maximum(i - 1, 0)]
        for _ in range(it):
            m = (lo + hi) / 2; inn = self.head_sdf(A + D * m[:, None]) < 0
            lo = np.where(inn, m, lo); hi = np.where(inn, hi, m)
        return (lo + hi) / 2
    def upper3(self, tag, t, B, Zo, u_sq=.36, zlev=-.05, slope=.06, nc=23, sink=.0004, gap=.0008, ledge_end=.62):
        """per column: the circle about the tilted hinge whose radius meets the skin at the top of the visible opening
        (sink under it); the squint edge where that circle passes zlev (+slope outward, rounding up into the corners)"""
        s = 1 if tag == 'L' else -1; k = self.hinge(tag, t); Pv = self.pivot(tag, B, Zo)
        EX, EZ, EHW, EHH = self.EX, self.EZ, self.EHW, self.EHH
        Xs = np.linspace(-1.10, 1.10, nc); cols = []; diag = []
        phs = np.linspace(-1.5, 1.3, 281)
        for X in Xs:
            x = s * EX + s * EHW * X
            Zq = zlev + slope * (X + 1) / 2 + .30 * float(np.clip((abs(X) - .78) / .34, 0, 1)) ** 2
            zq = EZ + EHH * Zq
            yq = float(self.front_hit(np.array([x]), np.array([zq]))[0]); Eq = np.array([x, yq, zq])
            c = Eq - Pv; A = Pv + k * (c @ k); e1 = (Eq - A) / np.linalg.norm(Eq - A); e2 = np.cross(k, e1)
            D = np.cos(phs)[:, None] * e1 + np.sin(phs)[:, None] * e2
            ds = self.skin_dist_dirs(A, D); S = A + D * ds[:, None]
            op = self.in_opening(tag, S)
            if op.any():
                iop = np.where(op)[0]; i_top = int(iop.min()); i_low = int(iop.max())
                # the hole top: just above the first opening sample (the skin there is the hole's upper rim)
                r_b = float(ds[max(i_top - 1, 0)]) - sink
                ed = self.eye_dist(A + D[iop] * r_b, A, k, tag); ed = ed[np.isfinite(ed)]
                clear = (r_b - float(ed.max())) * 1000 if len(ed) else 99.
                below = ds[i_low + 1:] - r_b
                Zs = self.eye_XZ(tag, S)[1]; hi_ = np.where((np.arange(len(phs)) < i_top) & (Zs > ledge_end))[0]   # above the ledge's slope
                above = ds[hi_] - r_b
                hid = float(min(below.min() if len(below) else 9, above.min() if len(above) else 9)) * 1000
                hid_b = float(below.min()) * 1000 if len(below) else 9.; hid_a = float(above.min()) * 1000 if len(above) else 9.
            else:
                r_b = float(ds.min()) - .0008; clear = 99.; hid = 0.; i_top = i_low = 0; hid_a = hid_b = 9.
            # the squint edge: where this circle (radius r_b) passes the height zq
            zc = (A[None, :] + D * r_b)[:, 2]; j = int(np.argmin(np.abs(zc - zq) + 9 * (phs < -.6)))
            E = A + D[j] * r_b
            cols.append(dict(X=X, A=A, E=E, r_b=r_b, e1=e1, e2=e2, ph_sq=float(phs[j]), ph_top=float(phs[i_top]), ph_low=float(phs[i_low])))
            diag.append((round(float(X), 2), round(r_b * 1000, 1), round(clear, 1), round(hid_a, 1), round(hid_b, 1)))
        return dict(cols=cols, diag=diag, Xs=Xs, uu=(Xs - Xs[0]) / (Xs[-1] - Xs[0]), k=k, Pv=Pv, tag=tag, t=t, B=B, Zo=Zo, u_sq=u_sq)
    # ------------------------------------------------------------------ the lower lid
    def lower(self, tag, t, dz=.06, NX=23, NRW=13, hug=.0025, dive=.006):
        s = 1 if tag == 'L' else -1; EX, EZ, EHW, EHH, EN = self.EX, self.EZ, self.EHW, self.EHH, self.EN
        k = self.hinge(tag, t); H = 2 * EHH; ax = self.ns['eye_axes'][tag]
        Sc = np.array([s * EX, float(self.front_hit(s * EX, EZ)[0]), EZ])
        Pv = Sc - ax * (.37 * H / .14) + np.array([0, 0, (-.40 + dz) * EHH])       # a long lever behind the eye
        target = -.24
        Xs = np.linspace(-.90, .88, NX); G = []
        for X in Xs:
            zl = -(max(1 - abs(X) ** EN, 0)) ** (1 / EN)                              # lower outline (EHH)
            arch = -1 + (.42 - .22 * min(abs(X) / .92, 1) ** 2)                       # the happy arch: 30 % of the visible opening at the centre
            z_bot = min(zl, arch) - .55
            row = []
            for tt in np.linspace(0, 1, NRW) ** 1.15:
                Z = arch + (z_bot - arch) * tt; x = s * EX + s * EHW * X; z = EZ + EHH * Z
                p = Vector((x, -1.5, z)); h = self.eye_tree[tag].ray_cast(p, Vector((0, 1, 0)), 3)
                ys = float(self.front_hit(np.array([x]), np.array([z]))[0])
                w_in = float(np.clip((zl - Z) / .10, 0, 1)); w_in = w_in * w_in * (3 - 2 * w_in)   # 0 over the opening, 1 below the rim
                ye = h[0].y if (h[0] is not None and Z > zl) else ys
                y = (ye - hug) * (1 - w_in) + (ys + dive) * w_in
                row.append((x, y, z))
            G.append(row)
        G = np.array(G)                                    # the happy pose (target), cols x rows x 3
        Vrest = rot_axis(G.reshape(-1, 3), Pv, k, -target).reshape(G.shape)
        return dict(V=Vrest, G=G, k=k, Pv=Pv, Xs=Xs, tag=tag, target=target)
