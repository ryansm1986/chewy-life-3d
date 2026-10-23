"""Kitsune, Blossom Hollow's shrine keeper (a villager), Toybox line: phase 1, the model in a neutral A-pose
(refs/sheet.png "KITSUNE . SHRINE SONG", approved by the owner). Blender 4.3, no addons. Deterministic.

    blender --background --factory-startup --python build_kitsune-toy.py [-- --head-only]
    python build_kitsune-toy.py --tune          (plain Python: prints the head field's profile / widths, then stops)

1 unit = 1 m, front = -Y, feet on z = 0, character left = +X. Writes only inside this folder plus
public/models/kitsune-toy.glb (--head-only writes scratch/ instead).

Assembled by src/assemble.py from src/p*.py plus the generic Toybox helpers of the Tamamo build (tools/blender/work/codex/tamamo-toy).

Technique (the Toybox machinery of Poe / Moka / Stella / Tamamo):
- The head is ONE smooth implicit field: a round skull (a superellipse), a low wide cheek mass with soft pointed cheek tufts, a short
  rounded fox muzzle, a soft chin and a rounded dark nose. No eye sockets: the face stays convex (the Rosie round-8 lesson). The skin
  is the field's zero surface reached by radial projection (CDT in a stereographic domain, with edge loops round the eyelids, nose
  and mouth), so every vertex carries its analytic normal. Adaptive refinement adds points where the game's toon band would zigzag.
- The mouth is SCULPTED (a soft groove along the wide "w" smile with curled corners), and the skin is cut along it (rig-ready).
- The eyes are separate lens globes following the ball, facing 30 deg outward; round openings; amber irises tucked toward the nose.
- The ears are thick cupped fox-ear shells with rolled rims, painted in their own chart (inner ear, the dark upper third).
- The kimono top, the hakama (big soft pleats) and the short wide sleeves are lathed / lofted and thickened shells; the white crossed
  collar bands are sweeps; the sash is a ring with a cord; the gold bell is a sculpted solid with its slot.
- The tail is a separate teardrop plume with bend rings, painted in its own chart (white tip with a soft flame edge).
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
MODEL = MODELS + '/kitsune-toy.glb'
OUT_MODEL = os.path.join(ROOT, 'scratch', 'kitsune-head-test.glb') if HEAD_ONLY else MODEL
os.makedirs(os.path.join(ROOT, 'scratch'), exist_ok=True)
np.random.seed(23)
if not TUNE: bpy.ops.wm.read_factory_settings(use_empty=True)
PI = math.pi
# ---- proportions, measured on refs/sheet.png (measure/measure_all.py -> measure/sheet.json): the front turnaround's crown is at sheet
# y 110, the chin at 284, the ground at 502 (392 px = 1.10 m, 2.806 mm / px); the head is 246 px wide at the cheeks (W = 0.690 m),
# 0.699 W crown to chin (the head close-up: W 316 px, crown 601, chin 822). The sheet draws 2.25 heads (crown to ground / crown to chin).
T_CROWN = 1.100                 # the crown (the brief's 1.10 m; the ear tips stand higher, at 1.25 m)
W = 0.690                       # head width at the cheeks, the soft tufts included
CROWN_W = .706                  # skull top above the chin, in W (sheet 0.699, plus a hair for the flat dome)
CHIN = round(T_CROWN - CROWN_W * W, 4); HY = .045
LOG = {'T_CROWN': T_CROWN, 'W': W, 'CHIN': CHIN}

PAL = {'fur': '#FF9A4A', 'furlight': '#FFB26A', 'furdark': '#E0743A',
       'white': '#FFF4E8', 'whitelight': '#FFF8F0', 'whitedark': '#EED6C6',
       'kimono': '#6A5AD0', 'kimonolight': '#8070E0', 'kimonodark': '#4E40A8',
       'skirt': '#3A3060', 'skirtlight': '#4C4078', 'skirtdark': '#2A2248',
       'sash': '#FF5A6A', 'sashlight': '#FF7A84', 'sashdark': '#D63E50',
       'bell': '#F2C451', 'belllight': '#FFDC7A', 'belldark': '#C8952C',
       'inner': '#FFBEAC', 'innerlight': '#FFD0C0', 'innerdark': '#EE9C8C',
       'tip': '#493044', 'tiplight': '#5E4258', 'tipdark': '#3A2436',
       'nose': '#493044', 'nosehi': '#7A5A74', 'nosedark': '#34202F',
       'iris': '#E6AD3F', 'irisdark': '#6A3A14', 'irisglow': '#F6C866', 'pupil': '#2A1A12',
       'sclera': '#FFF8F2', 'lash': '#2E1E26', 'brow': '#493044', 'blush': '#FFA3A0', 'mouth': '#5A2E38', 'dark': '#2A2230'}
CHARTS = {'head': (0, 768, 1280, 1280), 'eye.L': (1280, 1664, 384, 384), 'eye.R': (1664, 1664, 384, 384),
          'ramp': (1280, 1152, 768, 512), 'furmix': (1280, 896, 256, 256), 'kimmix': (1536, 896, 256, 256),
          'skmix': (1792, 896, 256, 256), 'ear': (0, 0, 768, 768), 'tail': (768, 0, 768, 768)}
if RIG:
    CHARTS.update({'lidU': (1536, 0, 512, 192), 'lidD': (1536, 192, 512, 128), 'cavity': (1536, 320, 128, 128), 'tongue': (1664, 320, 128, 128)})
PAINT_OPTS = {'lash': True, 'blush': True}
RAMPS = {'fur': ('furdark', 'fur', 'furlight'), 'white': ('whitedark', 'white', 'whitelight'),
         'kimono': ('kimonodark', 'kimono', 'kimonolight'), 'skirt': ('skirtdark', 'skirt', 'skirtlight'),
         'sash': ('sashdark', 'sash', 'sashlight'), 'bell': ('belldark', 'bell', 'belllight'), 'cord': ('#B83444', '#E04858', '#F06A78'),
         'nose': ('nosedark', 'nose', '#6A4A64'), 'eyedark': ('#1E1A24', '#2A2230', '#4A4256'), 'slot': ('#5A3A1A', '#7A5020', '#8A6030'),
         'lining': ('#2C2450', '#3A3060', '#463A70'), 'tip': ('tipdark', 'tip', 'tiplight'), 'inner': ('innerdark', 'inner', 'innerlight')}
RAMP_ROWS = {k: i for i, k in enumerate(RAMPS)}
assert len(RAMPS) <= 16
