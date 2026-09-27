# usage: python sheet.py out_name shot1 shot2 shot3 shot4  (2x2 grid at half res, labels)
import sys, os
from PIL import Image, ImageDraw
D = r'C:\Users\there\AppData\Local\Temp\claude\D--projects-chewy-life-3d\8589dfce-d448-4273-9d64-a50029bd572d\scratchpad\review5'
out, names = sys.argv[1], sys.argv[2:]
W, H = 800, 450
sheet = Image.new('RGB', (W * 2, H * ((len(names) + 1) // 2)), 'black')
for i, n in enumerate(names):
    im = Image.open(os.path.join(D, n + '.png')).convert('RGB').resize((W, H), Image.LANCZOS)
    sheet.paste(im, ((i % 2) * W, (i // 2) * H))
    d = ImageDraw.Draw(sheet); d.rectangle([(i % 2) * W, (i // 2) * H, (i % 2) * W + 260, (i // 2) * H + 16], fill='black'); d.text(((i % 2) * W + 3, (i // 2) * H + 2), n, fill='yellow')
sheet.save(os.path.join(D, out + '.png')); print('ok', out)
