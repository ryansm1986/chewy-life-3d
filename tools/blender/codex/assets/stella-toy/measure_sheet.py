"""Measure refs/sheet.png (Stella, Option C with blue eyes) -> measurements.json.   python measure_sheet.py

Automated (colour extents on the sheet): the crown and ground of each turnaround view, the head close-up crown and chin,
the face width W at the cheeks (the shadow line between the face and the ears, rows 672-696), the side-view profile
(front-most silhouette per row), and the robe / pink layer / fur extents per row in the front view.
Ruled crops (measure/ruled.py, 2.2x-3x with a 5 px grid, read in sheet pixels) give the face features; they are listed
in RULED with their sheet coordinates so every number can be re-checked.

Units: W = the head width at the cheeks (excluding the ears) in the FRONT HEAD CLOSE-UP; H = crown to chin there.
z = height above the chin in W; x = from the face centre in W; b = behind the nose tip in W (side view).
Body numbers: fractions of the crown height T of the front turnaround (ground 0, crown 1).
"""
import json, os
import numpy as np
from PIL import Image
ROOT = os.path.dirname(os.path.abspath(__file__))
im = np.array(Image.open(os.path.join(ROOT, 'refs', 'sheet.png')).convert('RGB')).astype(float)
BG = np.array([245, 241, 236.])
FG = np.linalg.norm(im - BG, axis=2) > 30
L = im.mean(2)
R_, G_, B_ = im[..., 0], im[..., 1], im[..., 2]
PERI = (B_ > R_ + 15) & (B_ > G_ + 35) & (B_ > 150)
PINK = (R_ > 190) & (R_ - G_ > 22) & (B_ - G_ > 4) & ~PERI
mx = im.max(2); mn = im.min(2); SAT = (mx - mn) / np.maximum(mx, 1); FUR = (SAT < .2) & (mx < 215) & (mx > 80)

def top_row(x0, x1, y0, y1):
    m = FG[y0:y1, x0:x1]; return int(y0 + np.where(m.sum(1) > 0)[0].min())
def feet_bottom(x0, x1, y0=430, y1=470):
    """the last row before the drawn ground line (which spans the whole view)"""
    w = FG[y0:y1, x0:x1].sum(1)
    for k in range(len(w)):
        if w[k] > .6 * (x1 - x0): return y0 + k - .5
    return float(y1)
views = {'front': (30, 330), 'three_quarter': (370, 690), 'side_left': (695, 1000), 'back': (1015, 1305)}
turn = {}
for k, (x0, x1) in views.items():
    turn[k] = {'crown_y': top_row(x0, x1, 84, 470), 'ground_y': feet_bottom(x0, x1)}
    turn[k]['height_px'] = turn[k]['ground_y'] - turn[k]['crown_y']

# ---- the head close-up (front): crown at the centre column, chin from the lower-lip / neck shadow, W from the face-ear shadow line
CU_CX = 157.75
cu_crown = int(559)
for x in (150, 159, 168):
    c = FG[540:620, x]; cu_crown = min(cu_crown, 540 + int(np.argmax(c)))
cu_chin = 737          # column 159: the lower lip ends at 735-737, the neck shadow starts at 738 (sheet RGB 140,125,115)
edges = []
for y in range(672, 700, 4):
    l = L[y, 55:110]; r = L[y, 210:265]; edges.append((55 + int(np.argmin(l)), 210 + int(np.argmin(r))))
edges = np.array(edges, float); W_px = float(np.mean(edges[:, 1] - edges[:, 0])); H_px = float(cu_chin - cu_crown)

def zW(y): return round((cu_chin - y) / W_px, 3)
def xW(x): return round((x - CU_CX) / W_px, 3)
# ---- RULED readings (sheet px) on the head close-up front (measure/ruled.py 0 540 320 850 2.6 / 15 550 290 840 3)
RULED = {
    'eye_R_opening_x': [87.7, 132.7], 'eye_L_opening_x': [184.0, 227.0], 'eye_opening_y': [637.0, 683.0],
    'eye_lash_top_y': 632.0, 'eye_centre_y': 657.0,
    'iris_R_x': [96.0, 132.7], 'iris_L_x': [184.0, 221.0], 'iris_y': [638.0, 680.0],
    'pupil_R_centre': [119.0, 659.0], 'pupil_diameter_px': 19.0,
    'catchlight_big_R': [124.0, 650.0], 'catchlights_L': [[194.0, 650.0], [206.0, 650.0]],
    'nose_x': [139.0, 179.0], 'nose_y': [679.0, 706.0],
    'mouth_corners': [[120.0, 704.6], [199.0, 704.6]], 'mouth_centre_bottom_y': 718.8,
    'brow_R_centre': [114.0, 602.0], 'blush_R_centre': [85.0, 685.0], 'blush_radii_px': [20.0, 17.0],
    'ear_L_outer_x': 10.0, 'ear_R_outer_x': 304.0, 'ear_widest_y': 713.0, 'ear_bottom_y': 795.5,
    'ear_root_inner_x_at_crown_side': [100.0, 216.0], 'ear_inner_edge_bottom_x': [50.0, 266.0],
    'pearl_centre_big': [159.0, 778.0], 'pearl_big_diameter_px': 33.0, 'pearl_small_diameter_px': 22.0,
}
eyeR = RULED['eye_R_opening_x']; eyeL = RULED['eye_L_opening_x']
eye_cx = ((eyeR[0] + eyeR[1]) / 2, (eyeL[0] + eyeL[1]) / 2)
face = {
    'W_px': round(W_px, 1), 'H_px': H_px, 'W_over_H': round(W_px / H_px, 3), 'crown_z_W': zW(cu_crown),
    'face_edge_rows_px(left,right)': edges.tolist(),
    'eye_centre_x_W': round((eye_cx[1] - eye_cx[0]) / 2 / W_px, 3), 'eye_centre_z_W': zW(RULED['eye_centre_y']),
    'eye_opening_W(w,h)': [round((eyeR[1] - eyeR[0]) / W_px, 3), round((RULED['eye_opening_y'][1] - RULED['eye_opening_y'][0]) / W_px, 3)],
    'iris_W(w,h)': [round((RULED['iris_R_x'][1] - RULED['iris_R_x'][0]) / W_px, 3), round((RULED['iris_y'][1] - RULED['iris_y'][0]) / W_px, 3)],
    'iris_of_opening_width': round((RULED['iris_R_x'][1] - RULED['iris_R_x'][0]) / (eyeR[1] - eyeR[0]), 3),
    'iris_offset_to_nose_of_halfwidth': round(((RULED['iris_R_x'][0] + RULED['iris_R_x'][1]) / 2 - eye_cx[0]) / ((eyeR[1] - eyeR[0]) / 2), 3),
    'iris_bottom_z_W': zW(RULED['iris_y'][1]), 'pupil_of_iris_width': round(RULED['pupil_diameter_px'] / (RULED['iris_R_x'][1] - RULED['iris_R_x'][0]), 3),
    'nose_W(w,h)': [round((RULED['nose_x'][1] - RULED['nose_x'][0]) / W_px, 3), round((RULED['nose_y'][1] - RULED['nose_y'][0]) / W_px, 3)],
    'nose_centre_z_W': zW((RULED['nose_y'][0] + RULED['nose_y'][1]) / 2), 'nose_top_z_W': zW(RULED['nose_y'][0]),
    'mouth_corner_x_W': round((RULED['mouth_corners'][1][0] - RULED['mouth_corners'][0][0]) / 2 / W_px, 3),
    'mouth_corner_z_W': zW(RULED['mouth_corners'][0][1]), 'mouth_centre_z_W': zW(RULED['mouth_centre_bottom_y']),
    'brow_centre_W(x,z)': [xW(RULED['brow_R_centre'][0]), zW(RULED['brow_R_centre'][1])],
    'blush_centre_W(x,z)': [xW(RULED['blush_R_centre'][0]), zW(RULED['blush_R_centre'][1])],
    'ear_outer_x_W(L,R)': [xW(RULED['ear_L_outer_x']), xW(RULED['ear_R_outer_x'])],
    'ear_span_W': round((RULED['ear_R_outer_x'] - RULED['ear_L_outer_x']) / W_px, 3),
    'ear_widest_z_W': zW(RULED['ear_widest_y']), 'ear_bottom_z_W': zW(RULED['ear_bottom_y']),
    'ear_root_inner_x_W': round((RULED['ear_root_inner_x_at_crown_side'][1] - RULED['ear_root_inner_x_at_crown_side'][0]) / 2 / W_px, 3),
    'pearl_big_diameter_W': round(RULED['pearl_big_diameter_px'] / W_px, 3), 'pearl_small_diameter_W': round(RULED['pearl_small_diameter_px'] / W_px, 3),
}
# ---- side view profile (front-most silhouette per row): b behind the nose tip vs z above the chin, in W (H_side x W/H)
S_CROWN = turn['side_left']['crown_y']; S_CHIN = 205; S_TIP = None
prof = []
for y in range(86, 216, 4):
    r = FG[y, 690:800]; prof.append((y, 690 + int(np.argmax(r))))
S_TIP = min(x for y, x in prof if 170 < y < 195)
Ws = (S_CHIN - S_CROWN) * W_px / H_px
side = {'crown_y': S_CROWN, 'chin_y': S_CHIN, 'nose_tip_x': S_TIP, 'W_side_px': round(Ws, 1),
        'profile_b(z)': {('%.3f' % ((S_CHIN - y) / Ws)): round((x - S_TIP) / Ws, 3) for y, x in prof},
        'muzzle_depth_W(nose tip to the stop at z 0.37-0.40)': round((735 - S_TIP) / Ws, 3),
        'eye_side_x_px': [744, 767], 'ear_side_px(front x, back x, top y, bottom y)': [785, 893, 85, 255],
        'note': 'the eye and brow form the near-vertical face front (b 0.30-0.33) from z 0.40 to 0.68; the muzzle projects ahead of it'}
# ---- body (front turnaround, fractions of the crown height T; x half-widths from the centre column 179.5)
F = turn['front']; T = F['height_px']; GY = F['ground_y']; CX = 179.5
def fz(y): return round((GY - y) / T, 4)
def fx(px): return round(px / T, 4)
rows = {}
for y in range(235, 462, 5):
    e = {}
    for nm, m in (('periwinkle', PERI), ('pink', PINK), ('fur', FUR)):
        xs = np.where(m[y, 30:330])[0]
        if len(xs) > 2: e[nm] = [fx(30 + xs.min() - CX), fx(30 + xs.max() - CX)]
    rows[str(fz(y))] = e
BODY_RULED = {   # ruled crops of the front (25 80 335 470 x2.2), side (690 80 1000 470 x2.2) and back (1010 80 1310 470 x2.2) views
    'chin_y': 203.6, 'collar_top_y': 230.0, 'shoulder_y': 236.0, 'shoulder_x': [118.0, 241.0], 'pearls_y': [221.0, 250.0],
    'pearl_centre_big': [179.5, 241.4], 'pearl_big_diameter_px': 16.0, 'pearl_small_diameter_px': 11.0,
    'obi_y': [271.0, 298.0], 'obi_x_front': [130.0, 225.0], 'beads': [[186.8, 286.4, 18.0], [204.0, 293.0, 16.0], [201.0, 314.6, 20.0]],
    'obi_tail_long_bottom_y': 393.6, 'obi_tail_short_bottom_y': 344.0,
    'sleeve_cuff_y': [282.0, 335.0], 'sleeve_cuff_x_R': [68.0, 123.0], 'paw_R': [41.0, 84.0, 294.0, 332.0],
    'peri_hem_y(top of notches, lobe bottoms)': [371.0, 384.0], 'peri_hem_x': [75.0, 282.0], 'peri_lobes_across_front': 6,
    'pink_hem_y(top of notches, lobe bottoms)': [398.0, 421.0], 'pink_hem_x': [68.0, 290.0], 'pink_lobes_across_front': 7,
    'inner_skirt_bottom_y': 425.0, 'inner_skirt_x': [98.0, 261.0],
    'leg_x_R': [120.0, 157.0], 'leg_x_L': [202.0, 239.0], 'foot_x_R': [104.5, 163.6], 'foot_y': [439.0, 460.5],
    'side_chest_front_x': 755.0, 'side_hem_front_x': 718.0, 'side_hem_back_x': 893.0, 'side_leg_centre_x': 810.0,
    'side_toe_x': 752.0, 'side_heel_x': 849.0, 'side_tail_path': [[850, 330], [920, 350], [965, 330], [977, 298]],
    'side_tail_thickness_px(root, tip)': [14.0, 10.0], 'side_bow_x': [835.0, 872.0], 'side_beads': [[745, 287, 9], [737, 312, 9]],
    'back_bow_centre': [1151.0, 289.0], 'back_bow_x': [1108.0, 1196.0], 'back_bow_y': [271.0, 307.0], 'back_knot_x': [1142.0, 1160.0],
    'back_bow_tails_bottom_y': 355.0, 'back_tail_root': [1151.0, 316.0], 'back_tail_tip': [1246.0, 364.0],
    'back_ear_span_x': [1027.0, 1285.0], 'back_skull_x': [1092.0, 1219.0], 'back_ear_bottom_y': 257.0,
}
B = BODY_RULED
body = {
    'T_px': T, 'chin_z_T': fz(B['chin_y']), 'heads_crown_to_chin': round(T / (B['chin_y'] - F['crown_y']), 2),
    'turnaround_head_W_px': 122.0, 'turnaround_W_over_H': round(122.0 / (B['chin_y'] - F['crown_y']), 3),
    'collar_top_z_T': fz(B['collar_top_y']), 'shoulder_z_T': fz(B['shoulder_y']), 'shoulder_halfwidth_T': fx((B['shoulder_x'][1] - B['shoulder_x'][0]) / 2),
    'pearls_z_T': [fz(B['pearls_y'][1]), fz(B['pearls_y'][0])], 'pearl_big_diameter_T': fx(B['pearl_big_diameter_px']), 'pearl_small_diameter_T': fx(B['pearl_small_diameter_px']),
    'obi_z_T': [fz(B['obi_y'][1]), fz(B['obi_y'][0])], 'obi_halfwidth_T': fx((B['obi_x_front'][1] - B['obi_x_front'][0]) / 2),
    'beads_T(x, z, diameter)': [[fx(b[0] - CX), fz(b[1]), fx(b[2])] for b in B['beads']],
    'obi_tail_bottom_z_T(long, short)': [fz(B['obi_tail_long_bottom_y']), fz(B['obi_tail_short_bottom_y'])],
    'sleeve_cuff_z_T': [fz(B['sleeve_cuff_y'][1]), fz(B['sleeve_cuff_y'][0])], 'sleeve_cuff_width_T': fx(B['sleeve_cuff_x_R'][1] - B['sleeve_cuff_x_R'][0]),
    'paw_T(x0, x1, z0, z1)': [fx(B['paw_R'][0] - CX), fx(B['paw_R'][1] - CX), fz(B['paw_R'][3]), fz(B['paw_R'][2])],
    'peri_hem_z_T(lobe bottoms, notch tops)': [fz(B['peri_hem_y(top of notches, lobe bottoms)'][1]), fz(B['peri_hem_y(top of notches, lobe bottoms)'][0])],
    'peri_hem_halfwidth_T': fx((B['peri_hem_x'][1] - B['peri_hem_x'][0]) / 2),
    'pink_hem_z_T(lobe bottoms, notch tops)': [fz(B['pink_hem_y(top of notches, lobe bottoms)'][1]), fz(B['pink_hem_y(top of notches, lobe bottoms)'][0])],
    'pink_hem_halfwidth_T': fx((B['pink_hem_x'][1] - B['pink_hem_x'][0]) / 2),
    'inner_skirt_bottom_z_T': fz(B['inner_skirt_bottom_y']), 'inner_skirt_halfwidth_T': fx((B['inner_skirt_x'][1] - B['inner_skirt_x'][0]) / 2),
    'leg_centre_x_T': fx(((B['leg_x_L'][0] + B['leg_x_L'][1]) / 2 - (B['leg_x_R'][0] + B['leg_x_R'][1]) / 2) / 2), 'leg_width_T': fx(B['leg_x_R'][1] - B['leg_x_R'][0]),
    'foot_width_T': fx(B['foot_x_R'][1] - B['foot_x_R'][0]), 'foot_centre_x_T': fx(CX - (B['foot_x_R'][0] + B['foot_x_R'][1]) / 2), 'foot_height_T': fx(B['foot_y'][1] - B['foot_y'][0]),
    'side_depths_T(from the leg centre; - = front)': {'chest_front': fx(B['side_chest_front_x'] - B['side_leg_centre_x']), 'hem_front': fx(B['side_hem_front_x'] - B['side_leg_centre_x']),
                                                      'hem_back': fx(B['side_hem_back_x'] - B['side_leg_centre_x']), 'toe': fx(B['side_toe_x'] - B['side_leg_centre_x']),
                                                      'heel': fx(B['side_heel_x'] - B['side_leg_centre_x'])},
    'tail_side_path_T(y back, z)': [[fx(x - B['side_leg_centre_x']), fz(y)] for x, y in B['side_tail_path']], 'tail_thickness_T(root, tip)': [fx(14.0), fx(10.0)],
    'bow_back_T(width, height)': [fx(B['back_bow_x'][1] - B['back_bow_x'][0]), fx(B['back_bow_y'][1] - B['back_bow_y'][0])], 'bow_centre_z_T': fz(B['back_bow_centre'][1]),
    'bow_tails_bottom_z_T': fz(B['back_bow_tails_bottom_y']),
    'back_ear_span_over_skull': round((B['back_ear_span_x'][1] - B['back_ear_span_x'][0]) / (B['back_skull_x'][1] - B['back_skull_x'][0]), 3),
    'front_rows(z_T: extents of periwinkle / pink / fur, x_T)': rows,
}
OUT = {'source': 'refs/sheet.png (1536x1024), Option C with blue eyes', 'views_px': turn,
       'head_closeup_front_px': {'crown_y': cu_crown, 'chin_y': cu_chin, 'centre_x': CU_CX}, 'face_W': face, 'side_W': side, 'body_T': body,
       'ruled_face_px': RULED, 'ruled_body_px': BODY_RULED,
       'decisions': ['The sheet draws 3.2 heads in the turnaround but says 2.4 heads; the brief and the cast (chewy-b, Foosy, Floofy at about 2.3-2.4) '
                     'say about 2.4: the head is built at 2.4 heads (crown to chin) and the body below the chin is shortened to fit (widths kept).',
                     'The turnaround head is wider (W/H 1.06) and its ears wider (span 2.0 W) than the head close-up (W/H 0.97, ear span 1.71 W): '
                     'the face and ears follow the close-up, the body follows the turnaround (as the brief says).',
                     'The front view shows three sea-glass beads on the obi (two side by side, one below); the 3/4 and side views show two. '
                     'The brief says two: built as two (stacked, as in the 3/4 view), constant BEADS in the build.']}
with open(os.path.join(ROOT, 'measurements.json'), 'w', encoding='utf-8') as f: json.dump(OUT, f, indent=1)
print(json.dumps({k: OUT[k] for k in ('views_px', 'face_W')}, indent=1))
print(json.dumps({k: v for k, v in body.items() if k != 'front_rows(z_T: extents of periwinkle / pink / fur, x_T)'}, indent=1))
print(json.dumps(side['profile_b(z)']))
