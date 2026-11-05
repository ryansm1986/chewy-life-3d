# montage.py out.png cols cell img1 img2 ...  (a plain grid of images, each scaled to cell px)
import sys
from PIL import Image
out, cols, cell = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]); ims = sys.argv[4:]
rows = (len(ims) + cols - 1) // cols
M = Image.new('RGB', (cols * cell, rows * cell), (250, 246, 240))
for i, p in enumerate(ims):
    im = Image.open(p).convert('RGB'); im.thumbnail((cell, cell)); M.paste(im, ((i % cols) * cell, (i // cols) * cell))
M.save(out)
