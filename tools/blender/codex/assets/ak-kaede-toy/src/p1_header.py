"""Elder Kaede, the elder of Akane Hamlet (a zone villager, the maple valley), Toybox line: phase 1, the model in a neutral A-pose
(refs/sheet.png "Elder Kaede - Elder", approved by the director). Blender 4.3, no addons. Deterministic.

    blender --background --factory-startup --python build_ak-kaede-toy.py [-- --head-only]
    python build_ak-kaede-toy.py --tune          (plain Python: prints the head field's profile / widths, then stops)

1 unit = 1 m, front = -Y, feet on z = 0, character left = +X. Writes only inside this folder plus
public/models/ak-kaede-toy.glb (--head-only writes scratch/ instead).

Assembled by src/assemble.py from src/p*.py. The machinery is the Kitsune / Kazemaru builds' (tools/blender/codex/assets/tk-kazemaru-toy),
re-measured and re-dressed for Kaede.

Technique (the Toybox machinery of Poe / Moka / Stella / Tamamo / Kitsune / Kazemaru):
- The head is ONE smooth implicit field: a broad deep mochi skull (a superellipse, a long rounded back), a low wide cheek mass with
  soft pointed cheek tufts sweeping out and back, a short rounded fox muzzle, a soft chin and a rounded dark nose. No eye sockets: the
  face stays convex. The skin is the field's zero surface reached by radial projection (CDT in a stereographic domain, with edge loops
  round the eyelids, nose and mouth), so every vertex carries its analytic normal. Adaptive refinement adds points where the game's toon
  band would zigzag.
- The mouth is SCULPTED (a soft groove along the small "w" smile) with a painted line, and the skin is cut along it (rig-ready).
- The eyes are separate lens globes following the ball, facing 30 deg outward; amber-brown irises tucked toward the nose.
- The ears are big thick rounded pyramids (a loft of D-shaped rings) on the head's top corners, painted in their own chart (a pink inner
  triangle, dark brown caps).
- The brick kimono top, its flared skirt below the obi and the short wide sleeves are lofted and thickened shells, with the wrap's raised
  edge; the gold obi is a thick ring with a box knot at the back; the ivory kerchief is a thick ring with a round front knot and two
  leaf-shaped ends; the dark trousers are two baggy barrel legs gathered at the ankles.
- The tail is a separate big plume sweeping to her left and rising, with bend rings, painted in its own chart (a cream tip, cloud edge).
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
MODEL = MODELS + '/ak-kaede-toy.glb'
OUT_MODEL = os.path.join(ROOT, 'scratch', 'kaede-head-test.glb') if HEAD_ONLY else MODEL
os.makedirs(os.path.join(ROOT, 'scratch'), exist_ok=True)
np.random.seed(29)
if not TUNE: bpy.ops.wm.read_factory_settings(use_empty=True)
PI = math.pi
# ---- proportions, measured on refs/sheet.png (measure.md): the front turnaround's crown is at sheet y 122, the chin (shade line) at 276,
# the ground at 491 (369 px = 0.99 m, 2.683 mm / px); the head is 209 px wide at the cheeks under the tufts (W = 0.561 m). The turnaround
# draws the head 0.737 W tall, the head close-up 0.739 W: the model takes 0.738 W. The face features come from the close-up (W = 264 px).
T_CROWN = 0.990                 # the crown (the sheet's 0.99 m; the ear tips stand at 1.12 m)
W = 0.561                       # head width at the cheeks (the tufts stand out past it)
CROWN_W = .738                  # skull top above the chin, in W
CHIN = round(T_CROWN - CROWN_W * W, 4); HY = round(.127 * W, 4)
LOG = {'T_CROWN': T_CROWN, 'W': W, 'CHIN': CHIN}

PAL = {'fur': '#D89A7A', 'furlight': '#E8B294', 'furdark': '#BE7C5E',
       'white': '#FBE8DA', 'whitelight': '#FFF4EC', 'whitedark': '#EACFBE',
       'kim': '#9A3A2E', 'kimlight': '#B04A3A', 'kimdark': '#7C2C24',
       'trous': '#5A3630', 'trouslight': '#6C443C', 'trousdark': '#46282A',
       'obi': '#E8C070', 'obilight': '#F2D28A', 'obidark': '#C8A050',
       'kerch': '#F2E6D4', 'kerchlight': '#FAF0E2', 'kerchdark': '#D8C8B4',
       'inner': '#EC9E8C', 'innerlight': '#F4B09E', 'innerdark': '#D8887A',
       'ear': '#C88468', 'earlight': '#D89A7C', 'eardark': '#AE6E54',
       'tip': '#5A4040', 'tiplight': '#6C5050', 'tipdark': '#483232',
       'nose': '#4A3434', 'nosehi': '#7A6060', 'nosedark': '#3A2828',
       'iris': '#C89A4A', 'irisdark': '#5A3A1A', 'irisglow': '#E0B460', 'pupil': '#22181A',
       'sclera': '#FFF8F2', 'lash': '#3A2A2A', 'brow': '#4A3434', 'blush': '#E8A8A0', 'mouth': '#4A3434', 'dark': '#2A2230'}
CHARTS = {'head': (0, 768, 1280, 1280), 'eye.L': (1280, 1664, 384, 384), 'eye.R': (1664, 1664, 384, 384),
          'ramp': (1280, 1152, 768, 512), 'furmix': (1280, 896, 256, 256), 'kimmix': (1536, 896, 256, 256),
          'skmix': (1792, 896, 256, 256), 'ear': (0, 0, 768, 768), 'tail': (768, 0, 768, 768)}
if RIG:
    CHARTS.update({'lidU_L': (1536, 0, 256, 192), 'lidU_R': (1792, 0, 256, 192), 'lidD_L': (1536, 192, 256, 128), 'lidD_R': (1792, 192, 256, 128),
                   'cavity': (1536, 320, 128, 128), 'tongue': (1664, 320, 128, 128)})          # (the lids painted per side, never mirrored)
PAINT_OPTS = {'lash': False, 'blush': True}          # the upper lash is a 3-D roll (Kaede_lash_L/R), never paint on the skin
RAMPS = {'fur': ('furdark', 'fur', 'furlight'), 'white': ('whitedark', 'white', 'whitelight'),
         'kim': ('kimdark', 'kim', 'kimlight'), 'trous': ('trousdark', 'trous', 'trouslight'),
         'obi': ('obidark', 'obi', 'obilight'), 'kerch': ('kerchdark', 'kerch', 'kerchlight'),
         'nose': ('nosedark', 'nose', '#5C4444'), 'eyedark': ('#2A1E1E', '#3A2A2A', '#4E3A3A'),
         'lining': ('#5A2018', '#6E2A22', '#80342A'), 'tip': ('tipdark', 'tip', 'tiplight'), 'inner': ('innerdark', 'inner', 'innerlight'),
         'ear': ('eardark', 'ear', 'earlight'), 'trlining': ('#38201E', '#442826', '#52302C')}
RAMP_ROWS = {k: i for i, k in enumerate(RAMPS)}
assert len(RAMPS) <= 16
