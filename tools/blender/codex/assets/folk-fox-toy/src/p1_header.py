"""The Toybox townsfolk foxes (Z-D6 "Blender everything"), one family: design A "Hana, sunny gardener" and design C "Yume, dreamy
schoolkid" (refs/sheet.png rows A and C, the owner's picks; refs/notes.md). Phase 1, the models in a neutral A-pose. Blender 4.3, no
addons. Deterministic.

    blender --background --factory-startup --python build_folk-fox-toy.py -- --design a|c|all
    python build_folk-fox-toy.py --tune --design a        (plain Python: prints the head field's profile / widths, then stops)

1 unit = 1 m, front = -Y, feet on z = 0, character left = +X. Writes only inside this folder plus
public/models/folk-fox-<x>-toy.glb.

Assembled by src/assemble.py from src/p*.py. The machinery is Mikan's build (tools/blender/codex/assets/yk-mikan-toy, after Kaede /
Kazemaru / Kitsune), re-measured for the townsfolk foxes and slimmed to the townsfolk budget (<= 22k triangles each).

One shared species base (the head field, the face, the eyes and lash rolls, the ears, the mitten paws, the feet, the tail) with
per-design proportions (DES), markings and outfits:
- A: cream short-sleeve shirt, sage overalls (bib, broad shoulder straps, one big rounded bib pocket, short legs with rolled cuffs),
  a thick five-petal yellow flower at her right ear; orange fur all over.
- C: smaller; an orange head on fawn limbs; a lilac A-line tunic dress with short sleeves and a broad hem, a mustard satchel at her
  left hip on one very wide diagonal band from her right shoulder.

Technique (the Toybox machinery):
- The head is ONE smooth implicit field: a wide squircle skull, a low cheek ruff flaring to soft pointed tufts at the sides, a short
  shallow fox muzzle, a soft chin and a rounded dark nose. No eye sockets: the face stays convex. The skin is the field's zero surface
  reached by radial projection (CDT in a stereographic domain, with edge loops round the eyelids, nose and mouth), every vertex
  carrying its analytic normal; adaptive refinement where the game's toon band would zigzag.
- The mouth is a sculpted soft U groove with a painted line; the skin is cut along it (rig-ready).
- The eyes are separate lens globes facing 30 deg outward; the upper lash line is its own 3-D roll with the wing and two small flicks.
- The ears are big thick rounded pyramids (a loft of D-shaped rings), dark-capped, a cream inner triangle.
- One 2048 painted atlas per design: face, eyes, ears and tail painted from their own coordinates, 2-D shade x tone charts and ramps.
"""
import math, json, os, sys, struct, zlib, subprocess
import numpy as np
TUNE = '--tune' in sys.argv and 'bpy' not in sys.modules
if not TUNE:
    import bpy, bmesh
    from mathutils import Vector, Matrix
    from mathutils.geometry import delaunay_2d_cdt
    from mathutils.kdtree import KDTree

ROOT = os.path.dirname(os.path.abspath(__file__))
ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
def _arg(k, d=None): return ARGV[ARGV.index(k) + 1] if k in ARGV else d
DESIGN = _arg('--design', 'a').lower()
if DESIGN == 'all' and not TUNE:
    # one Blender process per design (a fresh scene each), run in turn
    for _d in ('a', 'c'):
        subprocess.run([bpy.app.binary_path, '--background', '--factory-startup', '--python', os.path.abspath(__file__), '--', '--design', _d], check=True)
    sys.exit(0)
assert DESIGN in ('a', 'c'), DESIGN
HEAD_ONLY = '--head-only' in ARGV
RIG = bool(globals().get('RIG_MODE'))
MODELS = 'D:/projects/chewy-life-3d/public/models'
TASK_NAME = 'folk-fox-%s-toy' % DESIGN
MODEL = MODELS + '/' + TASK_NAME + '.glb'
OUT_MODEL = os.path.join(ROOT, 'scratch', 'fox-%s-head-test.glb' % DESIGN) if HEAD_ONLY else MODEL
PFX = {'a': 'FoxA_', 'c': 'FoxC_'}[DESIGN]
os.makedirs(os.path.join(ROOT, 'scratch'), exist_ok=True)
np.random.seed(41)
if not TUNE: bpy.ops.wm.read_factory_settings(use_empty=True)
PI = math.pi
# ---- per-design proportions, measured on refs/sheet.png (measure-a.md / measure-c.md). The notes' heights include the ear tips.
# W = the head's full width at the cheek tufts (the front turnaround); CHIN from the front turnaround; the face features (W units)
# from the head close-up, where A and C share one layout.
DES = {
    'a': dict(T_EAR=1.050, W=.663, CHIN=.497, CROWN_W=.660, HY_W=.075, EAR_TIP_Z=.835, EAR_TIP_X=.285, EAR_LEAN=.090, DEPTH=1.00,
              iris='#A9692C', irisdark='#5A3014', irisglow='#D69A58', body='fur'),
    'c': dict(T_EAR=0.940, W=.536, CHIN=.460, CROWN_W=.674, HY_W=.046, EAR_TIP_Z=.895, EAR_TIP_X=.290, EAR_LEAN=.070, DEPTH=1.06,
              iris='#996D37', irisdark='#4E3216', irisglow='#C89A60', body='fawn'),
}[DESIGN]
W = DES['W']; CHIN = DES['CHIN']; CROWN_W = DES['CROWN_W']; T_CROWN = round(CHIN + CROWN_W * W, 4); HY = round(DES['HY_W'] * W, 4)
LOG = {'design': DESIGN, 'T_EAR_target': DES['T_EAR'], 'T_CROWN': T_CROWN, 'W': W, 'CHIN': CHIN}

PAL = {'fur': '#FF9A4A', 'furlight': '#FFB46E', 'furdark': '#EA8236',
       'fawn': '#F4D0A0', 'fawnlight': '#FADDB4', 'fawndark': '#E2B886',
       'white': '#FFF0D5', 'whitelight': '#FFF6EA', 'whitedark': '#EED8B6',
       'inner': '#FFF0D5', 'innerlight': '#FFF6EA', 'innerdark': '#F0D6B4',
       'ear': '#FF9A4A', 'earlight': '#FFB46E', 'eardark': '#EA8236',
       'tip': '#493128', 'tiplight': '#5C4034', 'tipdark': '#3A271F',
       'nose': '#493128', 'nosehi': '#7A5E52', 'nosedark': '#35231C',
       'iris': DES['iris'], 'irisdark': DES['irisdark'], 'irisglow': DES['irisglow'], 'pupil': '#2E1E18',
       'sclera': '#FFF8EF', 'lash': '#3A2620', 'brow': '#493128', 'blush': '#EBA095', 'mouth': '#493128', 'dark': '#2A2230'}
if DESIGN == 'a':
    PAL.update({'cloth1': '#8EAD78', 'cloth1light': '#A2C08C', 'cloth1dark': '#738F60',          # the sage overalls
                'cloth2': '#FFF0D5', 'cloth2light': '#FFF6EA', 'cloth2dark': '#EBD5B2',          # the cream shirt
                'petal': '#E6C86E', 'petallight': '#F2D888', 'petaldark': '#CCAA52'})
else:
    PAL.update({'cloth1': '#B4A0CB', 'cloth1light': '#C4B2D8', 'cloth1dark': '#9884B2',          # the lilac dress
                'cloth2': '#D8B86C', 'cloth2light': '#E6C884', 'cloth2dark': '#BE9C54',          # the mustard satchel and its band
                'petal': '#E6C86E', 'petallight': '#F2D888', 'petaldark': '#CCAA52'})
CHARTS = {'head': (0, 768, 1280, 1280), 'eye.L': (1280, 1664, 384, 384), 'eye.R': (1664, 1664, 384, 384),
          'ramp': (1280, 1152, 768, 512), 'furmix': (1280, 896, 256, 256), 'c1mix': (1536, 896, 256, 256),
          'c2mix': (1792, 896, 256, 256), 'ear': (0, 0, 768, 768), 'tail': (768, 0, 768, 768)}
if RIG:
    CHARTS.update({'lidU_L': (1536, 0, 256, 192), 'lidU_R': (1792, 0, 256, 192), 'lidD_L': (1536, 192, 256, 128), 'lidD_R': (1792, 192, 256, 128),
                   'cavity': (1536, 320, 128, 128), 'tongue': (1664, 320, 128, 128)})
PAINT_OPTS = {'lash': False, 'blush': True, 'eyeband': not RIG}          # the upper lash is a 3-D roll (<Fox>_lash_L/R), never paint on the skin
BODYFUR = DES['body']                                                    # the limbs' fur ramp: A orange, C fawn
RAMPS = {'fur': ('furdark', 'fur', 'furlight'), 'white': ('whitedark', 'white', 'whitelight'),
         'fawn': ('fawndark', 'fawn', 'fawnlight'),
         'cloth1': ('cloth1dark', 'cloth1', 'cloth1light'), 'cloth2': ('cloth2dark', 'cloth2', 'cloth2light'),
         'nose': ('nosedark', 'nose', '#5C4236'), 'eyedark': ('#2E1E1A', '#3A2620', '#4C3630'),
         'lining1': ('#5E7450', '#6A8258', '#768E62') if DESIGN == 'a' else ('#7C6A94', '#88769E', '#9482AA'),
         'tip': ('tipdark', 'tip', 'tiplight'), 'inner': ('innerdark', 'inner', 'innerlight'),
         'ear': ('eardark', 'ear', 'earlight'), 'petal': ('petaldark', 'petal', 'petallight'),
         'lining2': ('#C8B08E', '#D4BC9A', '#E0C8A6') if DESIGN == 'a' else ('#9E7E3C', '#AA8A46', '#B69650')}
RAMP_ROWS = {k: i for i, k in enumerate(RAMPS)}
assert len(RAMPS) <= 16
