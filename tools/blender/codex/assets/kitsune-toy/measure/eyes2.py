import numpy as np, json
from PIL import Image
from scipy import ndimage as ndi
IM = np.array(Image.open('refs/sheet.png').convert('RGB')).astype(int); R, G, B = IM[..., 0], IM[..., 1], IM[..., 2]
lum = IM.mean(-1)
dark = (R + G + B < 300) & (B < 120)
iris = (R > 90) & (((B < 48) & (R - B > 80)) | ((B < 58) & (G > .62 * R) & (R > 200)))
sclera = (B > 234) & (lum > 242)
eye = ndi.binary_fill_holes(ndi.binary_closing(dark | iris | sclera, iterations=2))
box = np.zeros_like(eye); box[675:760, 95:335] = 1; eye &= box.astype(bool)
eye = ndi.binary_opening(eye, iterations=1)
lab, n = ndi.label(eye); sizes = np.bincount(lab.ravel()); sizes[0] = 0
ks = np.argsort(sizes)[::-1][:2]
res = {}
vis = (IM.copy() * .5).astype(np.uint8)
for k in ks:
    mm = lab == k; ys, xs = np.nonzero(mm); nm = 'screenL' if xs.mean() < 212 else 'screenR'
    ir = iris & mm; iy, ix = np.nonzero(ndi.binary_opening(ir, iterations=1))
    pu = dark & ndi.binary_erosion(mm, iterations=5); pl, pn = ndi.label(pu); ps = np.bincount(pl.ravel()); ps[0] = 0; pm = pl == np.argmax(ps); py, px = np.nonzero(pm)
    sc = sclera & mm; sy, sx = np.nonzero(sc)
    res[nm] = dict(eye=[int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())], iris=[int(ix.min()), int(iy.min()), int(ix.max()), int(iy.max())],
                   pupil=[int(px.min()), int(py.min()), int(px.max()), int(py.max())], sclera=[int(sx.min()), int(sy.min()), int(sx.max()), int(sy.max())])
    vis[mm] = [80, 200, 80]; vis[ir & mm] = [250, 180, 0]; vis[pm] = [200, 0, 200]; vis[sc] = [255, 255, 255]
Image.fromarray(vis[640:800, 80:350]).resize((270 * 4, 160 * 4), Image.NEAREST).save('scratch/eyes_overlay.png')
print(json.dumps(res))
json.dump(res, open('measure/eyes2_raw.json', 'w'))
