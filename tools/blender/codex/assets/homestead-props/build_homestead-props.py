# homestead-props: the crops, fish, rods, tools, campfire camp and Seed Stall. Deterministic.
#   blender --background --factory-startup --python build_homestead-props.py -- --piece <name|crops|fish|tools|all>
# <name>: crop-turnip-ripe, fish-koi, rod-1, tool-hoe, campfire, seedStall ...
import os, sys, json
HERE = os.path.dirname(os.path.abspath(__file__))
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
PIECE = argv[argv.index('--piece') + 1] if '--piece' in argv else 'all'
print('HS build pid', os.getpid())
for _f in ('hs_common.py', 'crops.py', 'fish.py', 'gear.py', 'camp.py', 'stall.py'):
    _p = os.path.join(HERE, _f)
    if os.path.exists(_p): exec(compile(open(_p, encoding='utf-8').read(), _p, 'exec'))

CROPS_L = ['turnip', 'carrot', 'cabbage', 'daikon', 'strawberry', 'rice', 'pumpkin', 'melon']
FISH_L = ['crucian', 'koi', 'goldKoi', 'moonKoi', 'ayu', 'trout', 'char', 'loach', 'rainbowTrout', 'salmon', 'seaBream', 'mackerel', 'flounder', 'octopus', 'pufferfish']
jobs = {}
for c in CROPS_L:
    for s in ('young', 'ripe'): jobs['crop-%s-%s' % (c, s)] = (lambda c=c, s=s: build_crop(c, s))
if 'build_fish' in globals():
    for f in FISH_L: jobs['fish-' + f] = (lambda f=f: build_fish(f))
if 'build_rod' in globals():
    jobs['rod-1'] = lambda: build_rod(1); jobs['rod-2'] = lambda: build_rod(2)
    jobs['tool-hoe'] = lambda: build_hoe(); jobs['tool-seedBag'] = lambda: build_seedbag()
if 'build_campfire' in globals(): jobs['campfire'] = lambda: build_campfire()
if 'build_stall' in globals(): jobs['seedStall'] = lambda: build_stall()
sel = [k for k in jobs if PIECE == 'all' or k == PIECE or k.startswith(PIECE + '-') or (PIECE == 'crops' and k.startswith('crop-')) or (PIECE == 'tools' and k.startswith(('rod-', 'tool-')))]
print('HS jobs', sel)
for k in sel: jobs[k]()
rp = os.path.join(HERE, 'report.json')
old = json.load(open(rp)) if os.path.exists(rp) else {}
old.update(REPORT); json.dump(old, open(rp, 'w'), indent=1, sort_keys=True)
print('HS done')
