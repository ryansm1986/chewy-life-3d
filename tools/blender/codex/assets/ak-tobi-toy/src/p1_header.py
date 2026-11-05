"""Tobi, Ochiyo's apprentice in Akane Hamlet (a zone villager, VL-2), a young dog, Toybox line: phase 1, the model in a neutral A-pose
(refs/sheet.png "Tobi - Apprentice", approved by the director). Blender 4.3, no addons. Deterministic.

    blender --background --factory-startup --python build_ak-tobi-toy.py [-- --head-only]
    python build_ak-tobi-toy.py --tune          (plain Python: prints the head field's profile / widths, then stops)

1 unit = 1 m, front = -Y, feet on z = 0, character left = +X. Writes only inside this folder plus
public/models/ak-tobi-toy.glb (--head-only writes scratch/ instead).

Assembled by src/assemble.py from src/p*.py. The machinery is Master Kazemaru's (tools/blender/codex/assets/tk-kazemaru-toy, itself the
Kitsune build's), re-measured and re-dressed for Tobi.

Technique:
- The head is ONE smooth implicit field: a round mochi skull, a rounded dog snout (the cream muzzle), a soft chin and a rounded dark nose.
  No eye sockets: the face stays convex. The skin is the field's zero surface reached by radial projection (CDT in a stereographic
  domain, with edge loops round the eyelids, nose and mouth), so every vertex carries its analytic normal.
- The mouth is SCULPTED (a soft groove along the small "w" smile) with a painted line, and the skin is cut along it (rig-ready).
- The eyes are separate lens globes following the ball, facing 30 deg outward; brown irises tucked toward the nose.
- The ears are big floppy dog ears: thick rounded paddles lofted from a root on the crown (above the headband) down over the band and the
  head's sides to a fat round lobe at cheek level, with bend rings, painted in their own chart.
- The white headband is a thick soft ring hugging the head (higher at the front), with a soft square knot pad at the back.
- The blue gi top, its skirt below the obi and the short wide sleeves are lofted and thickened shells; the lapels are sweeps (his left
  over his right) over a cream chest V; the red obi is a soft ring with a rounded knot pad at the back; the dark trousers are two puffy
  thickened legs gathered over the feet.
- The tail is a short thick curl, a separate piece with bend rings.
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
MODEL = MODELS + '/ak-tobi-toy.glb'
OUT_MODEL = os.path.join(ROOT, 'scratch', 'tobi-head-test.glb') if HEAD_ONLY else MODEL
os.makedirs(os.path.join(ROOT, 'scratch'), exist_ok=True)
np.random.seed(29)
if not TUNE: bpy.ops.wm.read_factory_settings(use_empty=True)
PI = math.pi
# ---- proportions, measured on refs/sheet.png (measure.md): the front turnaround's crown is at sheet y 87, the chin at 266, the ground
# at 496.5 (409.5 px = 0.97 m, 2.369 mm / px); the head is 213 px wide at the cheeks (W = 0.505 m). The turnaround draws the head 0.84 W
# tall, the close-up 0.855 W: the model takes 0.85 W. The face features come from the close-up (W = 275 px, chin y 784, centre x 216).
T_CROWN = 0.970                 # the crown (the sheet's 0.97 m)
W = 0.505                       # head width at the cheeks
CROWN_W = .850                  # skull top above the chin, in W
CHIN = round(T_CROWN - CROWN_W * W, 4); HY = .039          # the head centre sits 3.9 cm behind the body axis (side view)
LOG = {'T_CROWN': T_CROWN, 'W': W, 'CHIN': CHIN}

PAL = {'fur': '#E6BC88', 'furlight': '#F2CEA0', 'furdark': '#C8965E',
       'white': '#FCEBD8', 'whitelight': '#FFF4E8', 'whitedark': '#E8CCAE',
       'gi': '#4A6A8A', 'gilight': '#5C7EA0', 'gidark': '#3A5472',
       'hakama': '#34465A', 'hakamalight': '#44586E', 'hakamadark': '#27364A',
       'belt': '#D8503A', 'beltlight': '#EA6A52', 'beltdark': '#B43E2C',
       'band': '#FFF8F2', 'bandlight': '#FFFBF7', 'banddark': '#E4DAD2',
       'ear': '#E2B680', 'earlight': '#F0CA98', 'eardark': '#C08E58',
       'nose': '#3A2A26', 'nosehi': '#6E5650', 'nosedark': '#2C201C',
       'iris': '#5A3A2A', 'irisdark': '#2E1A12', 'irisglow': '#8A5A3E', 'pupil': '#2A1A16',
       'sclera': '#FFF8F2', 'lash': '#2E2220', 'brow': '#5A3A2A', 'blush': '#F0A8A0', 'mouth': '#3A2A26', 'dark': '#2A2230'}
CHARTS = {'head': (0, 768, 1280, 1280), 'eye.L': (1280, 1664, 384, 384), 'eye.R': (1664, 1664, 384, 384),
          'ramp': (1280, 1152, 768, 512), 'furmix': (1280, 896, 256, 256), 'kimmix': (1536, 896, 256, 256),
          'skmix': (1792, 896, 256, 256), 'ear': (0, 0, 768, 768)}
if RIG:
    CHARTS.update({'lidU': (1536, 0, 512, 192), 'lidD': (1536, 192, 512, 128), 'cavity': (1536, 320, 128, 128), 'tongue': (1664, 320, 128, 128),
                   'lidUR': (768, 0, 512, 192), 'lidDR': (768, 192, 512, 128)})          # (the R lids get their own charts: the lid paint per side)
PAINT_OPTS = {'lash': False, 'blush': True}          # (the upper lash is a 3-D roll, Tobi_lash_L/R, never paint on the skin)
RAMPS = {'fur': ('furdark', 'fur', 'furlight'), 'white': ('whitedark', 'white', 'whitelight'),
         'gi': ('gidark', 'gi', 'gilight'), 'hakama': ('hakamadark', 'hakama', 'hakamalight'),
         'belt': ('beltdark', 'belt', 'beltlight'), 'band': ('banddark', 'band', 'bandlight'),
         'nose': ('nosedark', 'nose', '#4E3A34'), 'eyedark': ('#1C1210', '#2A1C18', '#463028'),
         'lining': ('#2C4058', '#34496A', '#3E5574'), 'ear': ('eardark', 'ear', 'earlight'), 'hklining': ('#1E2A3A', '#26344A', '#2E3E54')}
RAMP_ROWS = {k: i for i, k in enumerate(RAMPS)}
assert len(RAMPS) <= 16
