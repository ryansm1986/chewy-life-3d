"""HSV colour classes for refs/sheet.png + an overlay check image.  python measure/classes.py"""
import numpy as np
from PIL import Image
IM = np.array(Image.open('refs/sheet.png').convert('RGB')).astype(float) / 255
def hsv(im):
    r, g, b = im[..., 0], im[..., 1], im[..., 2]; mx = im.max(-1); mn = im.min(-1); d = mx - mn + 1e-9
    h = np.where(mx == r, (g - b) / d % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
    return h, d / (mx + 1e-9), mx
H, S, V = hsv(IM)
C = {}
C['fur'] = (H > 17) & (H < 33) & (S > .55) & (V > .50)
C['sash'] = ((H < 14) | (H > 345)) & (S > .55) & (V > .72)
C['bell'] = (H > 33) & (H < 52) & (S > .35) & (V > .72)
C['kimono'] = (H > 235) & (H < 262) & (S > .35) & (V > .45)
C['skirt'] = (H > 262) & (H < 310) & (V < .50) & (S > .18)
C['dark'] = (V < .42) & ~C['skirt']
C['pink'] = (H > 5) & (H < 26) & (S > .26) & (S < .50) & (V > .88)
C['white'] = (S < .20) & (S > .075) & (V > .88)
COL = {'fur': (255, 140, 0), 'sash': (255, 0, 0), 'bell': (255, 230, 0), 'kimono': (60, 60, 255), 'skirt': (20, 0, 90), 'dark': (0, 0, 0),
       'pink': (255, 120, 200), 'white': (255, 255, 255)}
if __name__ == '__main__':
    out = np.full(IM.shape, 128, np.uint8)
    for k, c in COL.items(): out[C[k]] = c
    Image.fromarray(out).save('scratch/classes.png')
    print('ok')
