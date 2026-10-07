"""Back-face test on the exported GLBs, the way the game draws them (three.js culls by triangle winding).

    blender --background --factory-startup --python outward_check.py

Every costume triangle in public/models/shadow-whelp.glb (found by its atlas chart) and every triangle of
public/models/shadow-whelp-wing.glb must face away from its part's interior:
  hood / coat / bib shells: away from the shell's star centre; tail cover: away from its centre line; piping rings:
  away from their tube centre line; horns and spikes: away from their axis; wing membrane: up on the top face, down
  on the underside; wing tubes, knobs and claw: away from their axis / centre.
A triangle is flagged inward when its unit winding normal dotted with the unit outward direction is below -0.25.
Writes outward.json.
"""
import bpy, os, json
import numpy as np
TASK = os.path.dirname(os.path.abspath(__file__))
SKIN = {}
def tris_of(path):
    bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.gltf(filepath=path)
    out = []
    from mathutils.kdtree import KDTree
    sk = [(tuple(o.matrix_world @ v.co), tuple((o.matrix_world.to_3x3() @ v.normal).normalized())) for o in bpy.context.scene.objects
          if o.type == 'MESH' and o.name in ('Shadow_head', 'Shadow_body', 'Shadow_tail') for v in o.data.vertices]
    if sk:
        kd = KDTree(len(sk))
        for i, (p, _) in enumerate(sk): kd.insert(p, i)
        kd.balance(); SKIN['kd'] = kd; SKIN['n'] = np.array([n for _, n in sk])
    for o in bpy.context.scene.objects:
        if o.type != 'MESH': continue
        me = o.data; me.calc_loop_triangles(); M = np.array(o.matrix_world)
        V = np.array([tuple(v.co) for v in me.vertices]); V = (np.c_[V, np.ones(len(V))] @ M.T)[:, :3]
        uvl = me.uv_layers.active.data
        for t in me.loop_triangles:
            idx = [me.loops[l].vertex_index for l in t.loops]
            uv = np.mean([tuple(uvl[l].uv) for l in t.loops], 0)
            out.append((o.name, V[idx], uv))
    return out
def seg_near(c, line):
    L = np.asarray(line); best = None; bd = 1e9
    for a, b in zip(L[:-1], L[1:]):
        ab = b - a; t = np.clip(np.dot(c - a, ab) / max(ab @ ab, 1e-12), 0, 1); q = a + t * ab; d = np.linalg.norm(c - q)
        if d < bd: bd, best = d, q
    return best
def loop_near(c, loop): L = list(loop) + [loop[0]]; return seg_near(c, L)
def unit(v): n = np.linalg.norm(v); return v / n if n > 1e-12 else v
report = {}
# ---------------- the dressed model
R = json.load(open(os.path.join(TASK, 'costume_ref.json')))
AW, AH = R['atlas']; CH = R['charts']
def chart_of(uv):
    x, y = uv[0] * AW, uv[1] * AH
    for k, (cx, cy, w, h) in CH.items():
        if cx <= x < cx + w and cy <= y < cy + h: return k
    return None
counts = {}
for name, P, uv in tris_of('D:/projects/chewy-life-3d/public/models/shadow-whelp.glb'):
    if not name.startswith('Whelp_'): continue
    ch = chart_of(uv); c = P.mean(0); n = unit(np.cross(P[1] - P[0], P[2] - P[0]))
    if ch in ('hood', 'coat', 'bib'):                         # inward only if it faces against both the skin under it and its star centre
        o1 = SKIN['n'][SKIN['kd'].find(tuple(c))[1]]; o2 = unit(c - np.array(R[ch + '_O']))
        o = o1 if np.dot(n, o1) >= np.dot(n, o2) else o2
    elif ch == 'tail': o = c - seg_near(c, R['tail_line'])
    elif ch == 'cuff': o = c - min((loop_near(c, np.array(l)) for l in R['cuff_lines'].values()), key=lambda q: np.linalg.norm(c - q))
    elif ch == 'brass':
        ul = (uv[0] * AW - CH['brass'][0] - 4) / (CH['brass'][2] - 8)          # chart-local u (4 px gutters)
        k_ = int(np.clip(np.floor(ul * len(R['cone_axes'])), 0, len(R['cone_axes']) - 1))   # its own cone (u strip)
        o = c - seg_near(c, R['cone_axes'][k_])
    else: ch = 'unknown'; o = np.zeros(3)
    k = counts.setdefault(name + ' / ' + ch, {'triangles': 0, 'inward': 0, 'flagged': []})
    k['triangles'] += 1; bad = np.dot(n, unit(o)) < -0.25; k['inward'] += int(bad)
    if bad and len(k['flagged']) < 12: k['flagged'].append([round(float(x), 3) for x in c] + [round(float(np.dot(n, unit(o))), 2), round(float(np.linalg.norm(o)), 4)])
report['shadow-whelp.glb'] = counts
# ---------------- the wing
W = json.load(open(os.path.join(TASK, 'wing_ref.json')))
AW, AH = W['atlas']; CH = W['charts']
counts = {}
for name, P, uv in tris_of('D:/projects/chewy-life-3d/public/models/shadow-whelp-wing.glb'):
    ch = chart_of(uv); c = P.mean(0); n = unit(np.cross(P[1] - P[0], P[2] - P[0]))
    if ch == 'memb':
        top = (uv[0] * AW - CH['memb'][0]) / CH['memb'][2] < 0.5; o = np.array([0, 0, 1.0 if top else -1.0])
    elif ch in ('tube', 'rib'):                                   # its own tube (v strip)
        vl = (uv[1] * AH - CH[ch][1] - 3) / (CH[ch][3] - 6)            # chart-local v (3 px gutters)
        k_ = int(np.clip(np.floor(vl * len(W['tube_order'])), 0, len(W['tube_order']) - 1))
        o = c - seg_near(c, W['tube_axes'][W['tube_order'][k_]])
    elif ch == 'knob': o = c - min((np.array(k) for k in W['knobs'].values()), key=lambda q: np.linalg.norm(c - q))
    elif ch == 'brass': o = c - seg_near(c, W['claw_axis'])
    else: ch = 'unknown'; o = np.zeros(3)
    k = counts.setdefault(ch, {'triangles': 0, 'inward': 0, 'flagged': []})
    k['triangles'] += 1; bad = np.dot(n, unit(o)) < -0.25; k['inward'] += int(bad)
    if bad and len(k['flagged']) < 12: k['flagged'].append([round(float(x), 3) for x in c] + [round(float(np.dot(n, unit(o))), 2), round(float(np.linalg.norm(o)), 4)])
report['shadow-whelp-wing.glb'] = counts
report['total_inward'] = sum(v['inward'] for g in ('shadow-whelp.glb', 'shadow-whelp-wing.glb') for v in report[g].values())
json.dump(report, open(os.path.join(TASK, 'outward.json'), 'w'), indent=1)
print('OUTWARD', json.dumps(report))
