# The R-15 comparison sheet (tools/qa/katana-shots.mjs writes the spec): one band per katana look, two rows each:
#   the blade (studio turnaround, the tip close, item tints, the item icon, sheathed close, the noto into the saya);
#   the game camera (22 m: idle and mid-cut from both 45° yaws, sheathed from both yaws), crops shown at 1.6×;
#   the trail on the blade at 9 m (drawing, and drawn)
# python tools/qa/katana-sheet.py <sheet.json>
import json, sys
from PIL import Image, ImageDraw, ImageFont

spec = json.load(open(sys.argv[1], encoding='utf-8'))
def font(sz, bold=True):
    try: return ImageFont.truetype('C:/Windows/Fonts/segoeuib.ttf' if bold else 'C:/Windows/Fonts/segoeui.ttf', sz)
    except Exception: return ImageFont.load_default()
F_T, F_L, F_S = font(40), font(17), font(15, False)
ROWS = [
  [('studio', 540, 360), ('tip', 360, 360), ('tints', 460, 360), ('icon', 200, 360), ('sheathClose', 360, 360), ('noto', 360, 360)],
  [('idle+45', 384, 384), ('idle−45', 384, 384), ('swing+45', 384, 384), ('swing−45', 384, 384), ('sheath+45', 384, 384), ('sheath−45', 384, 384)],
  [('trail', 360, 360), ('trail2', 360, 360)],
]
if spec.get('layout') == 'final':  # the chosen look, finished (R-15): the blade, the game camera, the noto frame by frame, the effects, the loot
    G = 300
    ROWS = [
      [('studio', 540, 360), ('tip', 360, 360), ('tints', 460, 360), ('icon', 200, 360), ('sheathClose', 360, 360), ('backClose', 360, 360), ('noto', 360, 360)],
      [('idle+45', G, G), ('idle−45', G, G), ('swing+45', G, G), ('swing−45', G, G), ('sheath+45', G, G), ('sheath−45', G, G), ('back+45', G, G), ('back−45', G, G)],
      [(f'noto{y}@{u}', 250, 250) for y in ('+45', '−45') for u in ('0.5', '0.58', '0.64', '0.69')],
      [('trail', 330, 330), ('trail2', 330, 330), ('bonestorm0', 330, 330), ('bonestorm1', 330, 330), ('bonestormFar', 300, 330), ('moonhowl0', 330, 330), ('moonhowl1', 330, 330)],
      [('moonhowl2', 330, 330), ('moonhowlFar', 300, 330), ('loot', 330, 330), ('loot+45', 300, 330), ('loot−45', 300, 330)],
    ]
LAB, PAD, CAP = 230, 10, 24
W = LAB + max(sum(w for _, w, _ in R) + PAD * len(R) for R in ROWS) + PAD * 2
RH = [max(h for _, _, h in R) for R in ROWS]
band = sum(CAP + h + PAD for h in RH) + PAD * 2
HEAD = 120
S = Image.new('RGB', (W, HEAD + band * len(spec['looks']) + PAD), '#241a24')
d = ImageDraw.Draw(S)
d.text((PAD * 2, 14), spec.get('title') or 'R-15  A bone-shaped katana for Chewy: pick one', fill='#fff6e8', font=F_T)
d.text((PAD * 2, 70), spec.get('sub') or ('Rows: Today (for reference), then A, B, C: ?katana=a|b|c, or the debug menu (Heroes > Katana look).  Per look: the blade up close (studio, item tints, '
       'the icon, sheathed, the noto);  the game camera (22 m), crops at 1.6×;  the trail at 9 m.  The icon is today\'s: it is redrawn once a look is picked.'), fill='#d8c8d8', font=F_S)
for li, L in enumerate(spec['looks']):
    y0 = HEAD + li * band
    d.rectangle([PAD, y0, W - PAD, y0 + band - PAD], fill='#2e2230')
    d.text((PAD * 2, y0 + 30), L['name'].replace('  ', '\n').replace(' bone', '\nbone'), fill='#ffd88a' if L['tag'] != 'today' else '#c8b8c8', font=font(30))
    sh = spec['shots'].get(L['tag'], {})
    for ri, row in enumerate(ROWS):
        x, y = LAB, y0 + PAD + sum(CAP + h + PAD for h in RH[:ri])
        for key, cw, ch in row:
            f, lab = sh.get(key, [None, key])
            d.text((x + 4, y + 2), lab[:58], fill='#fff6e8', font=F_S)
            if f:
                try:
                    im = Image.open(f).convert('RGB')
                    k = min(cw / im.width, ch / im.height); im = im.resize((max(1, int(im.width * k)), max(1, int(im.height * k))), Image.LANCZOS)
                    S.paste(im, (x + (cw - im.width) // 2, y + CAP + (ch - im.height) // 2))
                except Exception as e: d.text((x + 6, y + 40), str(e)[:40], fill='#ff8080', font=F_S)
            x += cw + PAD
S.save(spec['out'])
print(spec['out'], S.size)
