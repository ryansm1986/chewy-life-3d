"""Fit the head ball (cranium + cheek mass, Kuma's construction) to Takumi's measured sheet outline (measure.md)."""
import numpy as np, json, sys
from scipy.optimize import minimize
def sell(q, c, r, p, pzlo=None, rzlo=None):
    r = np.asarray(r, float); p = np.asarray(p, float); dq = q - np.asarray(c, float)
    rz = r[2] if rzlo is None else np.where(dq[..., 2] < 0, rzlo, r[2])
    pz = p[2] if pzlo is None else np.where(dq[..., 2] < 0, pzlo, p[2])
    a = np.abs(dq[..., 0]) / r[0] + 1e-12; b = np.abs(dq[..., 1]) / r[1] + 1e-12; c_ = np.abs(dq[..., 2]) / rz + 1e-12
    F = a ** p[0] + b ** p[1] + c_ ** pz; pm = (p[0] + p[1] + p[2]) / 3
    g = np.sqrt((p[0] * a ** (p[0] - 1) / r[0]) ** 2 + (p[1] * b ** (p[1] - 1) / r[1]) ** 2 + (pz * c_ ** (pz - 1) / rz) ** 2)
    return (F ** (1 / pm) - 1) / np.maximum((1 / pm) * F ** (1 / pm - 1) * g, 1e-9)
def smin(a, b, k):
    h = np.clip(.5 + .5 * (b - a) / k, 0, 1); return b * (1 - h) + a * h - k * h * (1 - h)
NAMES = ['cr_cy','cr_cz','cr_rx','cr_ry','cr_rz','cr_px','cr_py','cr_pz','ck_cy','ck_cz','ck_rx','ck_ry','ck_rz','ck_px','ck_py','ck_pz','ck_pzlo','ck_rzlo','k']
X0 = [.020,.3992,.4717,.3949,.3179,2.5,2.0,2.625, -.020,.1751,.4891,.372,.2309,2.364,2.1,2.4,3.2,.1801,.1472]
def make(x):
    x = dict(zip(NAMES, x))
    CR = ([0, x['cr_cy'], x['cr_cz']], [x['cr_rx'], x['cr_ry'], x['cr_rz']], (x['cr_px'], x['cr_py'], x['cr_pz']))
    CK = ([0, x['ck_cy'], x['ck_cz']], [x['ck_rx'], x['ck_ry'], x['ck_rz']], (x['ck_px'], x['ck_py'], x['ck_pz']), x['ck_pzlo'], x['ck_rzlo'])
    return lambda q: smin(sell(q, *CR), sell(q, *CK), x['k'])
WT = {.062:.845,.079:.879,.097:.907,.114:.931,.131:.952,.148:.966,.166:.979,.183:.986,.200:.993,.234:1.0,.269:.997,.303:.986,.338:.966,.372:.945,.407:.917,.441:.893,.476:.883}
FT = {.36:.40,.454:.39,.498:.376,.542:.354,.586:.335,.63:.306,.718:.178,.015:.308,.037:.348}
BT = {.015:.216,.037:.27,.059:.30,.081:.33,.103:.35,.147:.375,.19:.394,.25:.401,.30:.401,.366:.397,.41:.39,.476:.379,.498:.361,.542:.346,.586:.324,.63:.29,.674:.247,.696:.214}
CROWN = .748
YS = np.linspace(-.6, .6, 61)
def outer(fun, mk, lo, hi, it=22):
    # bisection for the outermost crossing between lo (inside) and hi (outside), vectorised over targets
    lo = np.array(lo, float); hi = np.array(hi, float)
    for _ in range(it):
        m = (lo + hi) / 2; ins = fun(mk(m)); lo = np.where(ins, m, lo); hi = np.where(ins, hi, m)
    return (lo + hi) / 2
def evaluate(x, verbose=False):
    f = make(x)
    # chin: lowest point at x=0 over y
    zs = np.linspace(-.25, .15, 401); q = np.stack(np.meshgrid([0.], YS, zs, indexing='ij'), -1).reshape(-1, 3)
    ins = (f(q) < 0).reshape(len(YS), len(zs)).any(0)
    if not ins.any(): return 1e3, None
    z0 = zs[np.argmax(ins)]
    def width(z):
        z = np.asarray(z, float) + z0
        def mk(xv): return np.stack([np.repeat(xv[:, None], len(YS), 1), np.broadcast_to(YS, (len(xv), len(YS))), np.repeat(z[:, None], len(YS), 1)], -1)
        return 2 * outer(lambda P: (f(P) < 0).any(-1), mk, np.zeros(len(z)), np.full(len(z), .8))
    def prof(z, sgn):
        z = np.asarray(z, float) + z0
        def mk(yv): return np.stack([np.zeros_like(yv), sgn * yv, z], -1)
        return outer(lambda P: f(P) < 0, mk, np.zeros(len(z)), np.full(len(z), .8))
    zw = np.array(list(WT)); w = width(zw); tw = np.array(list(WT.values()))
    zf = np.array(list(FT)); fr = prof(zf, -1); tf = np.array(list(FT.values()))
    zb = np.array(list(BT)); bk = prof(zb, 1); tb = np.array(list(BT.values()))
    zc = z0 + np.linspace(.5, 1.0, 501); qc = np.stack([np.zeros_like(zc), np.zeros_like(zc), zc], -1)
    # crown: highest point over y at x=0
    qq = np.stack(np.meshgrid([0.], YS, zc, indexing='ij'), -1).reshape(-1, 3); ic = (f(qq) < 0).reshape(len(YS), len(zc)).any(0)
    crown = (zc[np.where(ic)[0].max()] - z0) if ic.any() else 0
    e = np.concatenate([(w - tw) * 2.0, (fr - tf) * 1.0, (bk - tb) * 1.0, [(crown - CROWN) * 2.0]])
    loss = float((e ** 2).sum())
    xd = dict(zip(NAMES, x))
    pen = sum(max(0, 1.6 - xd[k]) ** 2 * 10 for k in NAMES if "_p" in k) + sum(max(0, xd[k] - 4.5) ** 2 * 10 for k in NAMES if "_p" in k) + sum(max(0, xd[k] - 2.7) ** 2 * 10 for k in ("cr_px", "cr_py", "ck_px", "ck_py"))
    if verbose:
        return loss, dict(z0=float(z0), width=dict(zip(map(str, zw), np.round(w, 3).tolist())), front=dict(zip(map(str, zf), np.round(fr, 3).tolist())),
                          back=dict(zip(map(str, zb), np.round(bk, 3).tolist())), crown=float(crown))
    return loss + pen, None
x = np.array(json.load(open(sys.argv[1])) if len(sys.argv) > 1 else X0, float)
print('start', evaluate(x)[0])
best = x
for rnd in range(3):
    r = minimize(lambda v: evaluate(v)[0], best, method='Nelder-Mead', options=dict(maxiter=4000, maxfev=4000, xatol=1e-5, fatol=1e-8, adaptive=True))
    best = r.x; print('round', rnd, r.fun, flush=True)
l, info = evaluate(best, True)
print(json.dumps(info, indent=1)); print(json.dumps(dict(zip(NAMES, np.round(best, 4).tolist()))))
json.dump(best.tolist(), open(__file__.replace('.py', '_best.json'), 'w'))
