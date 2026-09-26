# python montage.py out.png w img1 img2 ... [--crop x,y,w,h applies to all]
import sys
from PIL import Image
args = sys.argv[1:]
crop = None
if '--crop' in args:
    i = args.index('--crop'); crop = tuple(map(int, args[i+1].split(','))); del args[i:i+2]
out, W, files = args[0], int(args[1]), args[2:]
ims = [Image.open(f).convert('RGB') for f in files]
if crop: ims = [im.crop((crop[0], crop[1], crop[0]+crop[2], crop[1]+crop[3])) for im in ims]
cols = 2 if len(ims) > 1 else 1
cw = W // cols
ims = [im.resize((cw, int(im.height * cw / im.width))) for im in ims]
rows = (len(ims) + cols - 1) // cols
rh = max(im.height for im in ims)
sheet = Image.new('RGB', (cw * cols, rh * rows), (30, 30, 30))
for k, im in enumerate(ims): sheet.paste(im, ((k % cols) * cw, (k // cols) * rh))
sheet.save(out); print(out)
