
# ============================================================== THE FLOWER (design A): five thick flattened petals and a round centre
# Sheet (A head close-up): at her right ear's inner front, ~0.27 W across, centre (-0.135, 0.675) W; petals #E6C86E, centre #8EAD78
# (0.07 W). It faces forward and up, a little outward; from the side it sits on the head's top front, in front of the ear.
FLOWER_INFO = {}
if DESIGN == 'a':
    print('STEP flower', flush=True)
    FL_N = unit(np.array([-.22, -.78, .58]))
    FL_X = (-.185, .665)                                  # head-local W (x, z) of the centre
    def _head_ears(p): return np.minimum(head_sdf(p), ears_sdf(p))
    _ys = np.linspace(-.60, .30, 361); _P = L2M(np.stack([np.full_like(_ys, FL_X[0]), _ys, np.full_like(_ys, FL_X[1])], -1))
    _ins = _head_ears(_P) < 0; _yhit = float(_ys[np.argmax(_ins)]) if _ins.any() else -.10
    FL_C = L2M(np.array([[FL_X[0], _yhit, FL_X[1]]]))[0] + FL_N * .010
    _u = unit(np.cross(FL_N, [0, 0, 1.])); _v = np.cross(FL_N, _u)
    R_PET = .046 * W / .663                               # petal centre radius from the flower centre (metres, scaled with the head)
    sc_ = W / .663
    for k in range(5):
        ang = PI / 2 + k * 2 * PI / 5 + .15
        rd = math.cos(ang) * _u + math.sin(ang) * _v
        c = FL_C + rd * R_PET - FL_N * .004 * sc_ + FL_N * .003 * (k % 2) * sc_
        lobe('petal_%d' % k, c, np.array([.0145, .0300, .0385]) * sc_, FL_N, 'flower', ramp='petal', n=3, squash=.25, occ_in=.18, pole=rd)
    lobe('flower_centre', FL_C + FL_N * .010 * sc_, np.array([.016, .0235, .0235]) * sc_, FL_N, 'flower', ramp='cloth1', n=4, squash=.30, occ_in=.10)
    FLOWER_INFO = {'centre_m': [round(float(c), 4) for c in FL_C], 'normal': [round(float(c), 3) for c in FL_N], 'across_m': round(float(2 * (R_PET + .0385 * sc_)), 3)}
    LOG['flower'] = FLOWER_INFO
