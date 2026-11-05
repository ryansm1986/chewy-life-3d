"""Master Kazemaru, the sensei of Takemori's dojo (a zone villager), Toybox line: phase 1, the model in a neutral A-pose
(refs/sheet.png "Master Kazemaru - Sensei", approved by the director 2026-11-02). Blender 4.3, no addons. Deterministic.

    blender --background --factory-startup --python build_tk-kazemaru-toy.py [-- --head-only]
    python build_tk-kazemaru-toy.py --tune          (plain Python: prints the head field's profile / widths, then stops)

1 unit = 1 m, front = -Y, feet on z = 0, character left = +X. Writes only inside this folder plus
public/models/tk-kazemaru-toy.glb (--head-only writes scratch/ instead).

Assembled by src/assemble.py from src/p*.py. The machinery is the Kitsune build's (tools/blender/codex/assets/kitsune-toy), re-measured
and re-dressed for Kazemaru.

Technique (the Toybox machinery of Poe / Moka / Stella / Tamamo / Kitsune):
- The head is ONE smooth implicit field: a broad mochi skull (a superellipse, widest at the low cheeks, a rounded dome), a low wide
  cheek mass, a short rounded fox muzzle, a soft chin and a rounded dark nose. No eye sockets: the face stays convex. The skin is the
  field's zero surface reached by radial projection (CDT in a stereographic domain, with edge loops round the eyelids, nose and mouth),
  so every vertex carries its analytic normal. Adaptive refinement adds points where the game's toon band would zigzag.
- The mouth is SCULPTED (a soft groove along the small "w" smile) with a painted line, and the skin is cut along it (rig-ready).
- The eyes are separate lens globes following the ball, facing 30 deg outward; golden irises tucked toward the nose.
- The ears are tall thick cupped fox-ear shells with rolled rims, turned outward, painted in their own chart (mauve inner, slate tips).
- The red headband is a thick soft ring hugging the head (tilted: higher at the front), with a knot and two short thick tails at the back.
- The navy gi top, its skirt below the belt and the short wide sleeves are lofted and thickened shells; the lapels are sweeps; the black
  belt is a ring with a front square knot and two hanging ends; the hakama trousers are two wide thickened leg shells.
- The tail is a separate big teardrop plume sweeping to his right, with bend rings, painted in its own chart (a white tip, cloud edge).
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
MODEL = MODELS + '/tk-kazemaru-toy.glb'
OUT_MODEL = os.path.join(ROOT, 'scratch', 'kazemaru-head-test.glb') if HEAD_ONLY else MODEL
os.makedirs(os.path.join(ROOT, 'scratch'), exist_ok=True)
np.random.seed(29)
if not TUNE: bpy.ops.wm.read_factory_settings(use_empty=True)
PI = math.pi
# ---- proportions, measured on refs/sheet.png (measure.md): the front turnaround's crown is at sheet y 118, the chin (shade line) at 312,
# the ground at 532 (414 px = 1.10 m, 2.657 mm / px); the head is 262 px wide at the cheeks (W = 0.696 m). The turnaround draws the head
# 0.74 W tall, the head close-up 0.70 W: the model takes 0.72 W (both within 3%). The face features come from the close-up, z x 1.03.
T_CROWN = 1.100                 # the crown (the sheet's 1.10 m; the ear tips stand higher)
W = 0.696                       # head width at the cheeks
CROWN_W = .720                  # skull top above the chin, in W
CHIN = round(T_CROWN - CROWN_W * W, 4); HY = -.003
LOG = {'T_CROWN': T_CROWN, 'W': W, 'CHIN': CHIN}

PAL = {'fur': '#E2DCE8', 'furlight': '#EEEAF2', 'furdark': '#C0B6CC',
       'white': '#FFF8F2', 'whitelight': '#FFFBF6', 'whitedark': '#E8DCD6',
       'gi': '#34405E', 'gilight': '#46557A', 'gidark': '#252E46',
       'hakama': '#262B3C', 'hakamalight': '#343A50', 'hakamadark': '#1C2030',
       'belt': '#24242E', 'beltlight': '#363644', 'beltdark': '#1A1A22',
       'band': '#D84A3A', 'bandlight': '#EC6450', 'banddark': '#B0362C',
       'inner': '#C8B0C0', 'innerlight': '#D8C2D0', 'innerdark': '#AE94A8',
       'ear': '#D8D2DE', 'earlight': '#E6E1EA', 'eardark': '#BDB4C6',
       'tip': '#4A4656', 'tiplight': '#5C586A', 'tipdark': '#3A3644',
       'nose': '#3A3442', 'nosehi': '#6A6274', 'nosedark': '#2C2834',
       'iris': '#C8A040', 'irisdark': '#5A3A12', 'irisglow': '#E6C060', 'pupil': '#22181A',
       'sclera': '#FFF8F2', 'lash': '#2C2630', 'brow': '#3A3442', 'blush': '#E8B0B8', 'mouth': '#3A3442', 'dark': '#2A2230'}
CHARTS = {'head': (0, 768, 1280, 1280), 'eye.L': (1280, 1664, 384, 384), 'eye.R': (1664, 1664, 384, 384),
          'ramp': (1280, 1152, 768, 512), 'furmix': (1280, 896, 256, 256), 'kimmix': (1536, 896, 256, 256),
          'skmix': (1792, 896, 256, 256), 'ear': (0, 0, 768, 768), 'tail': (768, 0, 768, 768)}
if RIG:
    CHARTS.update({'lidU': (1536, 0, 512, 192), 'lidD': (1536, 192, 512, 128), 'cavity': (1536, 320, 128, 128), 'tongue': (1664, 320, 128, 128)})
PAINT_OPTS = {'lash': not RIG, 'blush': True}          # (the rig: the upper lash is a 3-D ribbon on lidU, not paint)
RAMPS = {'fur': ('furdark', 'fur', 'furlight'), 'white': ('whitedark', 'white', 'whitelight'),
         'gi': ('gidark', 'gi', 'gilight'), 'hakama': ('hakamadark', 'hakama', 'hakamalight'),
         'belt': ('beltdark', 'belt', 'beltlight'), 'band': ('banddark', 'band', 'bandlight'),
         'nose': ('nosedark', 'nose', '#4E4858'), 'eyedark': ('#1E1A24', '#2A2230', '#4A4256'),
         'lining': ('#1C2234', '#252E46', '#2E3852'), 'tip': ('tipdark', 'tip', 'tiplight'), 'inner': ('innerdark', 'inner', 'innerlight'),
         'ear': ('eardark', 'ear', 'earlight'), 'hklining': ('#15182A', '#1C2030', '#242838')}
RAMP_ROWS = {k: i for i, k in enumerate(RAMPS)}
assert len(RAMPS) <= 16
