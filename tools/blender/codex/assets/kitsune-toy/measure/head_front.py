"""Pixel measurements of the sheet's HEAD FRONT panel (refs/sheet.png). python measure/head_front.py"""
import numpy as np, json
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
IM = np.array(Image.open('refs/sheet.png').convert('RGB')).astype(int)
R, G, B = IM[..., 0], IM[..., 1], IM[..., 2]
BG = np.array([246, 242, 233]); dbg = np.abs(IM - BG).sum(-1)
X0, Y0, X1, Y1 = 20, 525, 410, 868
out = {}
# head silhouette (ears included), the panel only
sil = dbg > 18; sil[:Y0] = 0; sil[Y1:] = 0; sil[:, :X0] = 0; sil[:, X1:] = 0
sil = ndi.binary_fill_holes(ndi.binary_closing(sil, iterations=2))
lab, n = ndi.label(sil); big = np.argmax(np.bincount(lab.ravel())[1:]) + 1; sil = lab == big
fur = (R > 200) & (G > 95) & (G < 200) & (B < 125) & (R - B > 110)
dark = (R + G + B < 330) & (B < 120)
# the widest head row at the cheeks (below the ears, y 720..800)
rows = {}
for y in range(700, 820):
    xs = np.nonzero(sil[y])[0]; rows[y] = (int(xs.min()), int(xs.max()))
yc = max(rows, key=lambda y: rows[y][1] - rows[y][0]); xl, xr = rows[yc]; W = xr - xl; CX = (xl + xr) / 2
out['cheek_row_y'] = yc; out['W_px'] = W; out['centre_x'] = CX
# crown: top of the head dome at the centre column (between the ears)
col = np.nonzero(sil[:, int(CX)])[0]; crown = int(col.min()); out['crown_y'] = crown
# chin: the luminance step from the white chin to the white collar along the centre column -> use the head outline from the sides:
# fit the lower outline (sil rows above the collar) and extrapolate to the centre
low = []
for x in range(int(CX) - 110, int(CX) + 111, 5):
    ys = np.nonzero(fur[:, x] & (np.arange(IM.shape[0]) > 700) & (np.arange(IM.shape[0]) < 860))[0]
    if len(ys): low.append((x, int(ys.max())))
out['fur_lower_edge(x,y)'] = low
lum = IM[..., :3].mean(-1)
c = lum[780:860, int(CX) - 3:int(CX) + 4].mean(1); g = np.diff(c)
out['centre_column_lum_780_860'] = [round(float(v), 1) for v in c[::2]]
json.dump(out, open('measure/head_front_raw.json', 'w'), indent=1)
print(json.dumps({k: v for k, v in out.items() if k != 'fur_lower_edge(x,y)'}))
print('fur lower edge', low)
