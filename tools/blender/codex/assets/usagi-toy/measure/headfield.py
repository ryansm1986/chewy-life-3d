"""exec the build's head-field part in plain Python (bpy mocked) for quick probes"""
import sys, types
for m in ('bpy', 'bmesh', 'mathutils', 'mathutils.geometry', 'mathutils.bvhtree', 'mathutils.kdtree'):
    mod = types.ModuleType(m); sys.modules[m] = mod
class _Any:
    def __getattr__(self, k): return _Any()
    def __call__(self, *a, **k): return _Any()
sys.modules['bpy'].ops = _Any(); sys.modules['bpy'].data = _Any(); sys.modules['bpy'].context = _Any(); sys.modules['bpy'].types = _Any()
sys.modules['mathutils'].Vector = _Any(); sys.modules['mathutils'].Matrix = _Any()
sys.modules['mathutils.geometry'].delaunay_2d_cdt = _Any(); sys.modules['mathutils.bvhtree'].BVHTree = _Any(); sys.modules['mathutils.kdtree'].KDTree = _Any()
P = 'D:/projects/chewy-life-3d/tools/blender/work/codex/usagi-toy/build_usagi-toy.py'
src = open(P, encoding='utf-8').read(); src = src[:src.index('# ============================================================== face layout')]
g = {'__file__': P, '__name__': 'hf'}; exec(compile(src, 'build_head', 'exec'), g); globals().update(g)
