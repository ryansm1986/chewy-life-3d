# poi-north: the Windmill Orchard, the Firefly Moon Pond and the Lagoon Pier in Blender (ROADMAP Z-D6, brief.md).
#   blender --background --factory-startup --python build_poi-north.py -- --piece <windmill|moonpond|pier|pier-0|pier-1|all>
# One GLB per ctx.kit() call, in that call's local frame: poi-windmill-0, poi-moonpond-0, poi-pier-0, poi-pier-1.
# Layouts come from the place's own code and from kitdump/scene.json (colliders, heights, the kept moving parts).
import os, sys, math, random
HERE = os.path.dirname(os.path.abspath(__file__))
for _f in ('dg_common.py', 'poi_kit.py', 'p_windmill.py', 'p_moonpond.py', 'p_pier.py'):
    _p = os.path.join(HERE, _f)
    if os.path.exists(_p): exec(compile(open(_p, encoding='utf-8').read(), _p, 'exec'))
PIECES = {}
for _k, _fn in (('windmill-0', 'build_windmill'), ('moonpond-0', 'build_moonpond'), ('pier-0', 'build_pier0'), ('pier-1', 'build_pier1')):
    if _fn in globals(): PIECES[_k] = globals()[_fn]
for _k, _fn in PIECES.items():
    if PIECE == 'all' or PIECE == _k or PIECE == _k.split('-')[0]:
        new_asset()
        _info = _fn()
        export_piece('poi-' + _k, _info)
print('POI done')
