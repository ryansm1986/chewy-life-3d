# PAWHAVEN: the Sea Arch Lookout, the Bee Meadow and Driftwood Cove (task poi-east), built in Blender by script.
#   blender --background --factory-startup --python build_poi-east.py -- --piece <seaarch-0|seaarch-1|bees-0|cove-0|cove-1|seaarch|bees|cove|all>
# Writes public/models/poi-<id>-<k>.glb, k = the place's k-th ctx.kit() call (src/world/outskirts/pois/<id>.js), each in that kit
# call's local frame, on the terrain dumped from the game (dump_place.mjs -> kit/places.json). Deterministic: seeded PRNGs, no clock.
import os
HERE = os.path.dirname(os.path.abspath(__file__))
_k = os.path.join(HERE, 'poi_kit.py')
exec(compile(open(_k, encoding='utf-8').read(), _k, 'exec'))
for _p in ('p_seaarch.py', 'p_bees.py', 'p_cove.py'):
    _f = os.path.join(HERE, _p)
    if os.path.exists(_f): exec(compile(open(_f, encoding='utf-8').read(), _f, 'exec'))

PIECES = {k: v for k, v in dict(globals()).items() if k.startswith('piece_')}
want = PIECE.split(',')
for name, fn in sorted(PIECES.items()):
    key = name[6:].replace('_', '-'); pid = key.split('-')[0]
    if 'all' in want or key in want or pid in want:
        fn()
