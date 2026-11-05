"""Kaito, the deckhand of Shiokaze Port (a zone villager, the fishing port), Toybox line: phase 1, the model in a neutral A-pose
(refs/sheet.png "Kaito - Deckhand", approved by the director). Blender 4.3, no addons. Deterministic.

    blender --background --factory-startup --python build_sk-kaito-toy.py [-- --head-only]
    python build_sk-kaito-toy.py --tune          (plain Python: prints the head field's profile / widths, then stops)

1 unit = 1 m, front = -Y, feet on z = 0, character left = +X. Writes only inside this folder plus
public/models/sk-kaito-toy.glb (--head-only writes scratch/ instead).

Assembled by src/assemble.py from src/p*.py. The machinery is the Kaede / Kazemaru builds' (tools/blender/codex/assets/ak-kaede-toy),
re-measured and re-dressed for Kaito.

Technique (the Toybox machinery of Poe / Moka / Stella / Tamamo / Kitsune / Kazemaru / Kaede):
- The head is ONE smooth implicit field: a broad deep mochi skull, a low wide cream cheek mass with soft pointed cheek tufts sweeping
  out and back, a short rounded fox muzzle, a soft chin and a rounded dark nose. No eye sockets: the face stays convex. The skin is the
  field's zero surface reached by radial projection (CDT in a stereographic domain, with edge loops round the eyelids, nose and mouth),
  so every vertex carries its analytic normal. Adaptive refinement adds points where the game's toon band would zigzag.
- The mouth is SCULPTED (a soft groove along the small "U" smile) with a painted line, and the skin is cut along it (rig-ready).
- The eyes are separate lens globes following the ball, facing 30 deg outward; big teal irises tucked toward the nose.
- The ears are big thick rounded pyramids (a loft of D-shaped rings) on the head's top corners, painted in their own chart (a big pink
  inner triangle, dark plum caps).
- The white sailor shirt is a lofted, thickened shell with a hem rim; the puffy short sleeves end in rolled cuffs; the navy sailor collar
  is a thick shell draped on the shoulders (two lapels meeting in a V at the chest, a square flap on the back); the red scarf is a round
  knot at the V with two broad leaf ends; the navy shorts are two baggy legs sharing a flush seat, with rolled cuffs.
- The tail is a separate big egg-shaped plume rising behind him, with bend rings, painted in its own chart (a cream tip).
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
MODEL = MODELS + '/sk-kaito-toy.glb'
OUT_MODEL = os.path.join(ROOT, 'scratch', 'kaito-head-test.glb') if HEAD_ONLY else MODEL
os.makedirs(os.path.join(ROOT, 'scratch'), exist_ok=True)
np.random.seed(29)
if not TUNE: bpy.ops.wm.read_factory_settings(use_empty=True)
PI = math.pi
# ---- proportions, measured on refs/sheet.png (measure.md): the front turnaround's crown is at sheet y 137, the chin at 307, the feet's
# soles at 511 (374 px = 0.99 m, 2.647 mm / px); the head is 229 px wide at eye level (W = 0.606 m). The turnaround draws the head
# 0.742 W tall, the head close-up 0.776 W (its features sit proportionally higher too): the model takes 0.75 W, and every face height is
# the two views' mean as a fraction of the head height. Normalised that way the two views' outlines agree within 0.01 W.
T_CROWN = 0.990                 # the crown (the sheet's 0.99 m; the ear tips stand at 1.14 m)
W = 0.606                       # head width at eye level (the cheek tufts stand out past it, 0.575 W each side)
CROWN_W = .750                  # skull top above the chin, in W
CHIN = round(T_CROWN - CROWN_W * W, 4); HY = round(.157 * W, 4)
LOG = {'T_CROWN': T_CROWN, 'W': W, 'CHIN': CHIN}

# the data's colours; dark navy painted lighter (the dark-cloth lesson), the plain white shirt kept under #fff6ea, the fur's shading
# value-only (no hue shift)
PAL = {'fur': '#FF9A4A', 'furlight': '#FFAC62', 'furdark': '#E2873E',
       'white': '#FDE9D6', 'whitelight': '#FFF4E8', 'whitedark': '#F0D2B8',
       'shirt': '#F6F0EC', 'shirtlight': '#FFF6EA', 'shirtdark': '#DCCFCF',
       'navy': '#3C5A84', 'navylight': '#4C6C98', 'navydark': '#2E4A6E',
       'scarf': '#E8503A', 'scarflight': '#F4664A', 'scarfdark': '#C63E2E',
       'inner': '#FDAA96', 'innerlight': '#FFBEAC', 'innerdark': '#EC9482',
       'ear': '#FF8A3A', 'earlight': '#FF9C50', 'eardark': '#E27832',
       'tip': '#553846', 'tiplight': '#674656', 'tipdark': '#452E3A',
       'nose': '#493044', 'nosehi': '#7C5C6E', 'nosedark': '#382434',
       'iris': '#3A8AA0', 'irisdark': '#1C4656', 'irisglow': '#6CC0CE', 'pupil': '#1C2026',
       'sclera': '#FFF8F2', 'lash': '#3A2430', 'brow': '#4A2E3A', 'blush': '#FFA3A0', 'mouth': '#493044', 'dark': '#2A2230'}
CHARTS = {'head': (0, 768, 1280, 1280), 'eye.L': (1280, 1664, 384, 384), 'eye.R': (1664, 1664, 384, 384),
          'ramp': (1280, 1152, 768, 512), 'furmix': (1280, 896, 256, 256), 'shirtmix': (1536, 896, 256, 256),
          'navymix': (1792, 896, 256, 256), 'ear': (0, 0, 768, 768), 'tail': (768, 0, 768, 768)}
if RIG:
    CHARTS.update({'lidU_L': (1536, 0, 256, 192), 'lidU_R': (1792, 0, 256, 192), 'lidD_L': (1536, 192, 256, 128), 'lidD_R': (1792, 192, 256, 128),
                   'cavity': (1536, 320, 128, 128), 'tongue': (1664, 320, 128, 128)})          # (the lids painted per side, never mirrored)
PAINT_OPTS = {'lash': False, 'blush': True, 'eyeband': False}     # (no contact shade under the lash: no grey ring round the shut eye)          # the upper lash is a 3-D roll (Kaito_lash_L/R), never paint on the skin
RAMPS = {'fur': ('furdark', 'fur', 'furlight'), 'white': ('whitedark', 'white', 'whitelight'),
         'shirt': ('shirtdark', 'shirt', 'shirtlight'), 'navy': ('navydark', 'navy', 'navylight'),
         'scarf': ('scarfdark', 'scarf', 'scarflight'),
         'nose': ('nosedark', 'nose', '#5C4054'), 'eyedark': ('#2A1C24', '#3A2430', '#4E3442'),
         'lining': ('#BEB2B4', '#CEC2C4', '#DCD2D2'), 'tip': ('tipdark', 'tip', 'tiplight'), 'inner': ('innerdark', 'inner', 'innerlight'),
         'ear': ('eardark', 'ear', 'earlight'), 'navylining': ('#243A58', '#2C4466', '#344E72')}
RAMP_ROWS = {k: i for i, k in enumerate(RAMPS)}
assert len(RAMPS) <= 16
