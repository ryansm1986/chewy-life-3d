"""Mikan, the shopkeeper of Yukimi Spa Village (a zone villager, the snowy hot-spring village), Toybox line: phase 1, the model in a
neutral A-pose (refs/sheet.png "Mikan - Shopkeeper", approved by the director). Blender 4.3, no addons. Deterministic.

    blender --background --factory-startup --python build_yk-mikan-toy.py [-- --head-only]
    python build_yk-mikan-toy.py --tune          (plain Python: prints the head field's profile / widths, then stops)

1 unit = 1 m, front = -Y, feet on z = 0, character left = +X. Writes only inside this folder plus
public/models/yk-mikan-toy.glb (--head-only writes scratch/ instead).

Assembled by src/assemble.py from src/p*.py. The machinery is Elder Kaede's build (tools/blender/codex/assets/ak-kaede-toy, after
Kitsune / Kazemaru), re-measured and re-dressed for Mikan.

Technique (the Toybox machinery of Poe / Moka / Stella / Tamamo / Kitsune / Kazemaru / Kaede):
- The head is ONE smooth implicit field: a round deep mochi skull, a low wide cheek mass (no tufts on this sheet), a short rounded
  fox muzzle, a soft chin and a rounded dark nose. No eye sockets: the face stays convex. The skin is the field's zero surface reached
  by radial projection (CDT in a stereographic domain, with edge loops round the eyelids, nose and mouth), so every vertex carries its
  analytic normal. Adaptive refinement adds points where the game's toon band would zigzag.
- The mouth is SCULPTED (a soft groove along the small "w" smile and the philtrum) with a painted line; the skin is cut along it.
- The eyes are separate lens globes following the ball, facing 30 deg outward; blue irises tucked toward the nose.
- The ears are big thick rounded pyramids (a loft of D-shaped rings) on the head's top corners, painted in their own chart (a peach
  inner triangle, dark brown caps).
- The red beret is a soft puffy disc set back on the crown between and behind the ears, tilted back, with a little stalk on top.
- The red shirt (a short A-line top with a peplum flare and rounded front panels), its puffed short sleeves, the plum bloomers
  gathered at the ankles and the cream scarf (a thick ring with a round knot and two fat drooping bow loops) are lofted shells.
- The tail is a separate big plume from the low back sweeping out and back to her left and rising, its cream tip up.
- One 2048 painted atlas: face, eyes, ears and tail painted from their own coordinates, 2-D shade x tone charts and 1-D ramps.
"""
import math, json, os, sys, struct, zlib
import numpy as np
TUNE = '--tune' in sys.argv and 'bpy' not in sys.modules
if not TUNE:
    import bpy, bmesh
    from mathutils import Vector, Matrix
    from mathutils.geometry import delaunay_2d_cdt
    from mathutils.kdtree import KDTree

ROOT = os.path.dirname(os.path.abspath(__file__))
ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
HEAD_ONLY = '--head-only' in ARGV
RIG = bool(globals().get('RIG_MODE'))
MODELS = 'D:/projects/chewy-life-3d/public/models'
MODEL = MODELS + '/yk-mikan-toy.glb'
OUT_MODEL = os.path.join(ROOT, 'scratch', 'mikan-head-test.glb') if HEAD_ONLY else MODEL
os.makedirs(os.path.join(ROOT, 'scratch'), exist_ok=True)
np.random.seed(29)
if not TUNE: bpy.ops.wm.read_factory_settings(use_empty=True)
PI = math.pi
# ---- proportions, measured on refs/sheet.png (measure.md): the front turnaround's chin (the head / scarf line) is at sheet y 276, the
# ground at 496; the sheet's "1.05 m, 2.4 heads" puts the skull's crown (hidden under the beret) at y 119 (377 px = 1.05 m, 2.785 mm / px);
# the head is 222 px wide at the cheeks (W = 0.618 m) and 157 px = 0.707 W tall from the chin to the crown. The face features come from
# the head close-up (W = 294 px).
T_CROWN = 1.050                 # the skull's crown, under the beret (the sheet's 1.05 m; the ear tips stand at about 1.20 m)
W = 0.618                       # head width at the cheeks
CROWN_W = .707                  # skull top above the chin, in W
CHIN = round(T_CROWN - CROWN_W * W, 4); HY = round(.094 * W, 4)
LOG = {'T_CROWN': T_CROWN, 'W': W, 'CHIN': CHIN}

PAL = {'fur': '#FFAE5C', 'furlight': '#FFBE7C', 'furdark': '#E8913E',
       'white': '#FDEEDF', 'whitelight': '#FFF6EA', 'whitedark': '#F0D8C4',
       'shirt': '#E8503A', 'shirtlight': '#F26A4E', 'shirtdark': '#C63C2C',
       'trous': '#5C4A6A', 'trouslight': '#6E5C7C', 'trousdark': '#46384F',
       'scarf': '#FAF0E8', 'scarflight': '#FFF6EE', 'scarfdark': '#E4D4C8',
       'inner': '#FFC2A6', 'innerlight': '#FFD2BA', 'innerdark': '#F0A888',
       'ear': '#FFA654', 'earlight': '#FFBC74', 'eardark': '#EA8C40',
       'tip': '#5A3A3A', 'tiplight': '#6C4A48', 'tipdark': '#4A2E2E',
       'nose': '#4A3030', 'nosehi': '#7A5C5C', 'nosedark': '#3A2424',
       'iris': '#4A8AD0', 'irisdark': '#1E3A6A', 'irisglow': '#7CB8EC', 'pupil': '#1C1A2A',
       'sclera': '#FFF8F2', 'lash': '#2E2228', 'brow': '#4A3030', 'blush': '#FFA3A0', 'mouth': '#4A3030', 'dark': '#2A2230'}
CHARTS = {'head': (0, 768, 1280, 1280), 'eye.L': (1280, 1664, 384, 384), 'eye.R': (1664, 1664, 384, 384),
          'ramp': (1280, 1152, 768, 512), 'furmix': (1280, 896, 256, 256), 'shirtmix': (1536, 896, 256, 256),
          'skmix': (1792, 896, 256, 256), 'ear': (0, 0, 768, 768), 'tail': (768, 0, 768, 768)}
if RIG:
    CHARTS.update({'lidU_L': (1536, 0, 256, 192), 'lidU_R': (1792, 0, 256, 192), 'lidD_L': (1536, 192, 256, 128), 'lidD_R': (1792, 192, 256, 128),
                   'cavity': (1536, 320, 128, 128), 'tongue': (1664, 320, 128, 128)})          # (the lids painted per side, never mirrored)
PAINT_OPTS = {'lash': False, 'blush': True, 'eyeband': not RIG}          # (rig: no contact shade under the lash: no grey ring)          # the upper lash is a 3-D roll (Mikan_lash_L/R), never paint on the skin
RAMPS = {'fur': ('furdark', 'fur', 'furlight'), 'white': ('whitedark', 'white', 'whitelight'),
         'shirt': ('shirtdark', 'shirt', 'shirtlight'), 'trous': ('trousdark', 'trous', 'trouslight'),
         'scarf': ('scarfdark', 'scarf', 'scarflight'),
         'nose': ('nosedark', 'nose', '#5C4040'), 'eyedark': ('#241C22', '#2E2228', '#42343A'),
         'lining': ('#7A2418', '#8E2E22', '#A0382A'), 'tip': ('tipdark', 'tip', 'tiplight'), 'inner': ('innerdark', 'inner', 'innerlight'),
         'ear': ('eardark', 'ear', 'earlight'), 'trlining': ('#3A2C44', '#46364F', '#52405C')}
RAMP_ROWS = {k: i for i, k in enumerate(RAMPS)}
assert len(RAMPS) <= 16
