"""the ears at the game camera (yaw +-45, pitch 45): for the near ear, the tip (lowest screen point) vs the chin line, how far the ear
sticks out sideways past the head's silhouette, and the lobe's screen angle from vertical (root centre -> tip); the far ear's top vs the
crown line. W units (head width). Also the front-view lean of the lobe's outer edge (z 0.5 -> -0.2).   python measure/ear_game.py [glb]"""
import sys, math, os, json
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); from glbread import load
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
M = load(sys.argv[1] if len(sys.argv) > 1 else 'D:/projects/chewy-life-3d/public/models/stella-toy.glb')
MM = json.load(open(os.path.join(ROOT, 'measurements-model.json'))); W = MM['W']; CH = MM['chin_z_m']; HY = -.020
def blend(P): return np.stack([P[:, 0], -P[:, 2], P[:, 1]], -1)
H = blend(M['Stella_head']); out = {}
for yaw in (45, -45):
    e = math.radians(45); y = math.radians(yaw); d = np.array([math.sin(y) * math.cos(e), -math.cos(y) * math.cos(e), math.sin(e)])
    right = np.cross(d, [0, 0, 1.]); right /= np.linalg.norm(right); up = np.cross(right, d)
    near = 'L' if yaw > 0 else 'R'; far = 'R' if yaw > 0 else 'L'
    E = blend(M['Stella_ear_' + near]); F = blend(M['Stella_ear_' + far])
    sgn = 1 if (E.mean(0) @ right) > (H.mean(0) @ right) else -1
    eu = E @ up; er = (E @ right) * sgn; hu = H @ up; hr = (H @ right) * sgn
    jaw = H[(H[:, 2] < CH + .06 * W) & (H[:, 1] < HY - .15 * W)]; chin_u = (jaw @ up).min()
    tip = E[np.argmin(eu)]; root = E[E[:, 2] > E[:, 2].max() - .06 * W].mean(0)
    dr = (tip - root) @ right * sgn; du = (tip - root) @ up
    out['yaw%+d' % yaw] = {'near_ear': near, 'tip_below_chin_W': round(float((chin_u - eu.min()) / W), 3),
                           'out_past_head_W': round(float((er.max() - hr.max()) / W), 3),
                           'lobe_angle_from_screen_vertical_deg': round(math.degrees(math.atan2(abs(dr), -du)), 1),
                           'far_ear_top_above_crown_mm': round(float(((F @ up).max() - hu.max()) * 1000), 1)}
E = blend(M['Stella_ear_L']); q = (E - np.array([0, HY, CH])) / W
xo = {}
for z in (.5, .35, .2, .0, -.1, -.2):
    m = np.abs(q[:, 2] - z) < .012; xo[z] = float(q[m, 0].max())
out['front_outer_x_W'] = {('%.2f' % k): round(v, 3) for k, v in xo.items()}
out['front_lean_deg(z .5 -> -.2)'] = round(math.degrees(math.atan2(xo[-.2] - xo[.5], .7)), 1)
out['front_lean_deg(z .5 -> 0)'] = round(math.degrees(math.atan2(xo[0.] - xo[.5], .5)), 1)
print(json.dumps(out, indent=1))
