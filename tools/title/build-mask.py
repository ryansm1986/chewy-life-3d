# The title painting's motion mask (src/ui/titleArt.js, ROADMAP TA-1): from the painting, by colour inside hand-set
# zones, the parts that move: R the water (the sea, the river by the bridge), G what the wind moves (the cherry tree's
# blossoms, the near grass and flowers; never the friends), B the sky (clouds and the mist above the valley). Feathered so
# the warps fade in and out. Also writes the game's copy of the painting (a high-quality JPEG).
#   python tools/title/build-mask.py tools/title/painting.png [--debug OUT.png]
#   (painting.png: the source, Codex's title-art option C2, 1536 × 1024; the game reads the JPEG and the mask)
#   → public/title/painting.jpg, public/title/mask.png (half size, RGB)
import sys
from PIL import Image, ImageFilter, ImageChops

src = sys.argv[1]
dbg = sys.argv[sys.argv.index('--debug') + 1] if '--debug' in sys.argv else None
im = Image.open(src).convert('RGB')
W, H = im.size
assert (W, H) == (1536, 1024), (W, H)
px = im.load()

# zones (painting pixels)
FRIENDS = (95, 530, 520, 885)          # Chewy and Shadow: nothing of theirs moves (only their blinks)
SEA = (600, 392, 1536, 620)            # the open sea (from the horizon down)
SEA_EDGE = lambda x: 600 if x < 1120 else 572   # (below this the village's blue roofs begin)
RIVER = (1140, 730, 1425, 875)         # the river under the bridge
TREE = (0, 0, 640, 760)                # the cherry tree's crown
GRASS_Y = 800                          # the near grass, from here down
SKY_Y0, SKY_Y1 = 300, 372              # the sky, fading out over the mountains

def inside(b, x, y): return b[0] <= x < b[2] and b[1] <= y < b[3]

R = Image.new('L', (W, H)); G = Image.new('L', (W, H)); B = Image.new('L', (W, H))
r_, g_, b_ = R.load(), G.load(), B.load()
for y in range(H):
    for x in range(W):
        r, g, b = px[x, y]
        if inside(FRIENDS, x, y): continue
        lum = (r + g + b) / 3
        # water: blue over red, in the sea's zone above the village's roofs, or the river's
        # (the sea is brighter than the hazy blue forest on the headlands: lum 165+ against ~140)
        if inside(SEA, x, y) and y < SEA_EDGE(x) and b > r + 14 and b > g + 9 and lum > 165: r_[x, y] = 255
        elif inside(RIVER, x, y) and b > r + 28 and b > g + 4 and lum > 125: r_[x, y] = 230
        # the sun's road on the sea: bright gold water near the horizon, right side
        elif inside(SEA, x, y) and x > 1180 and y < 470 and lum > 200 and r > b: r_[x, y] = 255
        # the wind: pink blossoms in the crown, the near grass and flowers
        pink = r > 185 and r - g > 32 and b > g - 10
        if inside(TREE, x, y) and pink and not (y > 200 and x > 440): g_[x, y] = 255 # (not the pink-lit clouds past the crown)
        elif y > GRASS_Y and x < 1000 and ((g > r - 10 and g > b + 15) or pink):
            k = min(1.0, (y - GRASS_Y) / 70) * min(1.0, (1000 - x) / 220) # (soft at the zone's edges)
            g_[x, y] = int(170 * k)
        # the sky: above the mountains, not the tree
        if y < SKY_Y1 and not (inside(TREE, x, y) and (pink or lum < 110)) and not (x < 560 and y < 300 and (pink or lum < 140)):
            k = 1.0 if y < SKY_Y0 else 1.0 - (y - SKY_Y0) / (SKY_Y1 - SKY_Y0)
            b_[x, y] = int(255 * k)
        # the mist in the valley: pale, low-saturation, mid left
        elif 560 < x < 960 and 400 < y < 660 and lum > 170 and max(r, g, b) - min(r, g, b) < 40:
            k = min(1.0, (x - 560) / 90, (960 - x) / 90, (660 - y) / 60, (y - 400) / 40) # (soft all round: its drift lightens)
            b_[x, y] = int(150 * k)

feather = lambda c, r: c.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(r))
R, G, B = feather(R, 3), feather(G, 2.5), feather(B, 6)
# keep the friends still (a hard hole, feathered a little so nothing tears at their edge)
hole = Image.new('L', (W, H), 255); hole.paste(0, FRIENDS); hole = hole.filter(ImageFilter.GaussianBlur(6))
R, G, B = (ImageChops.multiply(c, hole) for c in (R, G, B))
mask = Image.merge('RGB', (R, G, B)).resize((W // 2, H // 2), Image.LANCZOS)
import os
os.makedirs('public/title', exist_ok=True)
mask.save('public/title/mask.png', optimize=True)
im.save('public/title/painting.jpg', quality=90, optimize=True, progressive=True, subsampling=0)
if dbg:
    ov = Image.merge('RGB', (R, G, B))
    Image.blend(im, ov, 0.55).save(dbg)
print('mask', mask.size, '-> public/title/mask.png, painting.jpg', os.path.getsize('public/title/painting.jpg') // 1024, 'KB')
