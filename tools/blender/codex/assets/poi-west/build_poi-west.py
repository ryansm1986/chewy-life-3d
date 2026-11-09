# poi-west: Lighthouse Point, the Bamboo Tea Garden, the Tide Pools, Kite Hill and its Wishing Tree (ROADMAP Z-D6, the brief: brief.md).
#   blender --background --factory-startup --python build_poi-west.py -- --piece <lighthouse|tea|tidepools|wishtree|all>
# Deterministic: fixed seeds, the ground from site/<id>.json (dumped from the game by dump_site.mjs). Each GLB is in its kit call's frame.
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
for _f in ('dg_common.py', 'pw_kit.py', 'p_lighthouse.py', 'p_tea.py', 'p_tidepools.py', 'p_wishtree.py'):
    _p = os.path.join(HERE, _f)
    if os.path.exists(_p): exec(compile(open(_p, encoding='utf-8').read(), _p, 'exec'))
HERE = os.path.dirname(os.path.abspath(__file__))
print('PW pid', os.getpid())
BUILDS = {k: globals().get('build_' + k) for k in ('lighthouse', 'tea', 'tidepools', 'wishtree')}
for k, fn in BUILDS.items():
    if fn and PIECE in ('all', k): fn()
print('PW budget', BUDGET)
