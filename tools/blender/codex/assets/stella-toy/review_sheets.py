"""The Sun Oracle review sheets from the rig (stella-toy_rig.blend), with rig_tests.py's own setup (lights, lid hinges, the
wagasa's mounts from prop_mount.rig.json), so they show exactly what the export carries.

    blender --background --factory-startup --python review_sheets.py

preview/face-sheet.png    rows: rest, talk (jaw 0.2), blink (lidU 1.22), mid-blink lidU 0.6, mid-blink lidU 0.9,
                          bark (jaw 0.42), happy (squint + smile); columns: front, game +45, game -45
preview/body-midday.png   neutral arms: front, game +45, game -45, back
preview/wagasa-poses.png  rows: cast (raised, in the paw), carry in the paw (the shoulder pose), the chest carry while
                          walking (the arm swinging), the sit (chest carry); columns: game +45, game -45, front
"""
import os
ROOT = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(ROOT, 'rig_tests.py'), encoding='utf-8').read()
exec(compile(src[:src.index('ORDER = {}')], 'rig_tests_setup', 'exec'))      # (bpy, the scene, pose(), place_parasol(), shot(), montage() ...)
k = [900]
def nxt(): k[0] += 1; return tmp(k[0])
JAW = lambda a: {'jaw': (a, 0, 0)}
HAPPY_ = {'lidU_L': (SQ[0], 0, 0), 'lidU_R': (SQ[0], 0, 0), 'lidD_L': (SQ[1], 0, 0), 'lidD_R': (SQ[1], 0, 0), 'smile': 1.0}
FACE_ROWS = [('rest', {}), ('talk', JAW(.2)), ('blink', {'lidU_L': (1.22, 0, 0), 'lidU_R': (1.22, 0, 0)}),
             ('mid-blink .6', {'lidU_L': (.6, 0, 0), 'lidU_R': (.6, 0, 0)}), ('mid-blink .9', {'lidU_L': (.9, 0, 0), 'lidU_R': (.9, 0, 0)}),
             ('bark', JAW(.42)), ('happy', dict(HAPPY_))]
paths = []
for key, ch in FACE_ROWS:
    c = dict(NEUTRAL); c.update(ch); pose(c)
    HCt = Vector((0, -.05, .93)); aim(HCt + Vector((0, -1, 0)) * 4, HCt, ortho=.80); paths.append(shot(nxt(), 400, 400))
    for yaw in (45, -45):
        gt = Vector((0, -.12, .92)); aim(gt + game_dir(yaw) * 4, gt, ortho=.80); paths.append(shot(nxt(), 400, 400))
montage(paths, 3, os.path.join(OUT, 'face-sheet.png'))
paths = []; pose(dict(NEUTRAL)); t = Vector((0, 0, .64))
aim(t + Vector((0, -1, .02)).normalized() * 8, t, ortho=1.45); paths.append(shot(nxt(), 440, 520))
for yaw in (45, -45): aim(t + game_dir(yaw) * 7.0, t, lens=120); paths.append(shot(nxt(), 440, 520))
aim(t + Vector((0, 1, .02)).normalized() * 8, t, ortho=1.45); paths.append(shot(nxt(), 440, 520))
montage(paths, 4, os.path.join(OUT, 'body-midday.png'))
SHOULDER = {'upperarm_R': (-.55, 0, -.10), 'forearm_R': (-1.0, 0, 0)}
WALK = {'thigh_L': (.6, 0, 0), 'thigh_R': (-.6, 0, 0), 'upperarm_L': (-.45, 0, .12), 'upperarm_R': (.45, 0, -.12), 'spine': (.08, 0, .04)}
SIT = {'thigh_L': (-1.0, 0, 0), 'thigh_R': (-1.0, 0, 0), 'root_y': -.12}
ROWS = [('cast', {'upperarm_R': (-2.4, 0, -.12), 'parasol': 'cast'}), ('carry', {**SHOULDER, 'parasol': 'carry'}),
        ('walk chest', {**WALK, 'parasol': 'chest'}), ('sit', {**SIT, 'parasol': 'chest'})]
paths = []
for key, ch in ROWS:
    c = dict(NEUTRAL); c.update(ch); pose(c); t = Vector((-.08, .05, .78 if key == 'cast' else .70))
    for yaw in (45, -45): aim(t + game_dir(yaw) * 8.0, t, lens=105); paths.append(shot(nxt(), 480, 560))
    aim(t + Vector((0, -1, .05)).normalized() * 8, t, ortho=1.9); paths.append(shot(nxt(), 480, 560))
montage(paths, 3, os.path.join(OUT, 'wagasa-poses.png'))
print('REVIEW_SHEETS_DONE')
