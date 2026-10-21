"""how far the ears rise above the head's silhouette from the 45-deg game camera (yaw +-45, pitch 45), in mm (screen up)"""
import sys, math, numpy as np
sys.path.insert(0, 'measure'); from glbread import load
M = load(sys.argv[1] if len(sys.argv) > 1 else 'D:/projects/chewy-life-3d/public/models/stella-toy.glb')
def blend(P): return np.stack([P[:, 0], -P[:, 2], P[:, 1]], -1)       # game -> Blender axes
H = blend(M['Stella_head']); res = {}
for yaw in (45, -45):
    e = math.radians(45); y = math.radians(yaw); d = np.array([math.sin(y) * math.cos(e), -math.cos(y) * math.cos(e), math.sin(e)])
    right = np.cross(d, [0, 0, 1.]); right /= np.linalg.norm(right); up = np.cross(right, d)
    for tag in ('L', 'R'):
        E = blend(M['Stella_ear_' + tag]); ex = E @ right; eu = E @ up; hx = H @ right; hu = H @ up
        # per screen column: the ear's top vs the head's top
        bins = np.linspace(min(ex.min(), hx.min()), max(ex.max(), hx.max()), 60); worst = -9
        for a, b in zip(bins[:-1], bins[1:]):
            me = (ex >= a) & (ex < b); mh = (hx >= a) & (hx < b)
            if me.any() and mh.any(): worst = max(worst, eu[me].max() - hu[mh].max())
        res['yaw%+d ear %s' % (yaw, tag)] = {'above_local_mm': round(worst * 1000, 1), 'above_crown_mm': round((eu.max() - hu.max()) * 1000, 1)}
print(res)
