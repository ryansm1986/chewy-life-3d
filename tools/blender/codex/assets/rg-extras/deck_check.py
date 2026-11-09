# Measure the exported taikobashi's walking surface against the kit's deckAt, in the game's own frame.
#   blender --background --factory-startup --python deck_check.py
# Imports the GLB, casts rays straight down over the deck and compares the first hit with deckAt(z). Writes deck_check.txt.
import bpy, os, math
from mathutils import Vector
from mathutils.bvhtree import BVHTree
HERE = os.path.dirname(os.path.abspath(__file__))
GLB = os.path.join(HERE, '..', '..', '..', '..', '..', 'public', 'models', 'rg-maple-taikobashi.glb')
L, RISE, DECK = 7.6, 0.85, 0.3
def deck_at(z): return DECK + RISE * math.cos(max(-1, min(1, z / (L / 2))) * math.pi / 2)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB)
vs, fs = [], []
for o in bpy.data.objects:
    if o.type != 'MESH': continue
    b = len(vs); vs += [o.matrix_world @ v.co for v in o.data.vertices]
    fs += [[i + b for i in p.vertices] for p in o.data.polygons]
tree = BVHTree.FromPolygons(vs, fs)
rows, worst, n, misses, flakes = [], 0.0, 0, 0, 0
for i in range(153):                       # every 5 cm along the span
    z = -3.8 + i * 0.05
    z = max(-3.79, min(3.79, z))
    for x in (-0.8, -0.6, -0.4, -0.2, 0.0, 0.2, 0.4, 0.6, 0.8):
        # game (x, y, z) -> Blender (x, -z, y)
        hit = tree.ray_cast(Vector((x, -z, 6.0)), Vector((0, 0, -1)))
        if hit[0] is None: misses += 1; continue
        d = hit[0].z - deck_at(z); n += 1
        if d > 0.003: flakes += 1              # a fallen leaf or a peg lying on the deck
        rows.append((z, x, hit[0].z, deck_at(z), d))
planks = [r for r in rows if r[4] <= 0.003]
worst = max(abs(r[4]) for r in planks)
gaps = [r for r in planks if r[4] < -0.012]    # (a ray dropping into the 3 cm gap between two planks)
tops = [r for r in planks if r[4] >= -0.012]
out = ['rays %d, misses %d' % (n, misses),
       'on leaves or pegs (+3 mm or more): %d, the highest +%.1f mm' % (flakes, max(r[4] for r in rows) * 1000),
       'in the gaps between planks (below -12 mm): %d' % len(gaps),
       'on plank tops: %d, worst %.2f mm, mean %.2f mm' % (len(tops), max(abs(r[4]) for r in tops) * 1000, sum(r[4] for r in tops) / len(tops) * 1000)]
for z in (-3.75, -2.5, -1.9, -1.25, -0.6, 0.0, 0.6, 1.25, 1.9, 2.5, 3.75):
    r = min(rows, key=lambda q: abs(q[0] - z) + abs(q[1]) * 0.001)
    out.append('z %+.2f x %+.1f  top %.4f  deckAt %.4f  diff %+.2f mm' % (r[0], r[1], r[2], r[3], r[4] * 1000))
# the flat of every plank (24 planks: its middle two thirds along the span, across the walkway)
step = L / 24; flat = []
for i in range(24):
    for f in (-0.33, 0.0, 0.33):
        z = -L / 2 + (i + 0.5 + f) * step
        for x in (-0.75, -0.5, -0.25, 0.0, 0.25, 0.5, 0.75):
            hit = tree.ray_cast(Vector((x, -z, 6.0)), Vector((0, 0, -1)))
            if hit[0] is not None: flat.append(hit[0].z - deck_at(z))
clean = [d for d in flat if d < 0.003]
out.insert(1, 'the flat of every plank: %d rays, %d on a leaf or a peg; the rest worst %.2f mm, mean %+.2f mm' % (len(flat), len(flat) - len(clean), max(abs(d) for d in clean) * 1000, sum(clean) / len(clean) * 1000))
open(os.path.join(HERE, 'deck_check.txt'), 'w').write('\n'.join(out) + '\n')
print('DECK', '\nDECK '.join(out))
