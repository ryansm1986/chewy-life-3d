"""Montage pose renders into preview/poses.png and preview/face.png (labels on top)."""
import os, sys
from PIL import Image, ImageDraw
R = os.path.dirname(os.path.abspath(__file__)); P = os.path.join(R, 'poses'); O = os.path.join(R, 'preview')
def grid(names, suffixes, out, cols):
    tiles = []
    for n in names:
        for s in suffixes:
            f = os.path.join(P, f'{n}_{s}.png')
            if os.path.exists(f): tiles.append((f'{n} ({s})', Image.open(f).convert('RGB')))
    w, h = tiles[0][1].size; rows = (len(tiles) + cols - 1) // cols
    canvas = Image.new('RGB', (cols * w, rows * (h + 22)), (250, 248, 244)); d = ImageDraw.Draw(canvas)
    for k, (lab, im) in enumerate(tiles):
        x, y = (k % cols) * w, (k // cols) * (h + 22)
        canvas.paste(im, (x, y + 22)); d.text((x + 6, y + 5), lab, fill=(40, 30, 30))
    canvas.save(out); print('saved', out, canvas.size)
grid(['rest', 'walk', 'run_bob', 'sit', 'head_turn_nod', 'ears_fwd', 'ears_back', 'tail_wag_L', 'tail_wag_R'], ['game', 'side'], os.path.join(O, 'poses.png'), 6)
grid(['f_rest', 'f_blink', 'f_happy', 'f_jaw', 'f_jaw_happy'], ['front', 'game', 'q34'], os.path.join(O, 'face.png'), 6)
grid(['f_happy', 'f_jaw_happy'], ['cu_front', 'cu_game+45', 'cu_game-45'], os.path.join(O, 'face-happy.png'), 3)
# face.png gets the happy close-up row (front and both 45 deg game yaws) appended at the bottom, labelled
main = Image.open(os.path.join(O, 'face.png')); W_ = main.width
row = [Image.open(os.path.join(P, 'f_happy_%s.png' % s)).convert('RGB') for s in ('cu_front', 'cu_game+45', 'cu_game-45')]
h_ = int(row[0].height * (W_ / 3) / row[0].width)
canvas = Image.new('RGB', (W_, main.height + h_ + 22), (250, 248, 244)); canvas.paste(main, (0, 0)); d = ImageDraw.Draw(canvas)
for k, (im, lab) in enumerate(zip(row, ('HAPPY close-up: front', 'HAPPY close-up: game +45', 'HAPPY close-up: game -45'))):
    canvas.paste(im.resize((W_ // 3, h_)), (k * (W_ // 3), main.height + 22)); d.text((k * (W_ // 3) + 6, main.height + 5), lab + ' (lidU +0.488, lidD -0.24)', fill=(40, 30, 30))
canvas.save(os.path.join(O, 'face.png')); print('saved face.png with happy close-up row', canvas.size)
