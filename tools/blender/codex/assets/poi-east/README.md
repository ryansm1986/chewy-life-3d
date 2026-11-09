# Outskirts places (poi-east): Blender source (Z-D6, 2026-11-05)

Models for the outskirts' places: public/models/poi-<id>-<k>.glb, k = the place's k-th ctx.kit call, listed in world/poiGlb.js POI_GLB, standing in for that call's kit meshes (buildings/index.js glbStandIn). The kit's moving parts, lights, colliders and walkable decks stay, so every model is built around them, in the kit call's own frame. Concepts: tools/blender/work/codex/hollow-pois/concepts. Build: build_poi-east.py --piece <name|all> with poi_kit.py and p_*.py.
