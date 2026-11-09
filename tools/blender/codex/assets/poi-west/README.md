# Outskirts places (poi-west): Blender source (Z-D6, 2026-11-06)

Lighthouse Point, the Bamboo Tea Garden, the Tide Pools and Kite Hill's Wishing Tree: public/models/poi-<id>-<k>.glb, k = the place's k-th ctx.kit call, listed in world/poiGlb.js POI_GLB, standing in for that call's kit meshes (buildings/index.js glbStandIn, wind: true). The kit's moving parts, lights, colliders and decks stay; each GLB is built in its kit call's frame. The Wishing Tree's crown is 3,874 atlas cards (material cards_round: the trees' own card material, UVs on the C1 / C2 rects, check_cards.py); it first used plain leaf geometry, whose leaves were head-sized beside the Blender trees. Shrubs are layered cards only and moss is plump cushions (both after a fix round). Build: build_poi-west.py --piece <lighthouse|tea|tidepools|wishtree|all>, ground heights from site/ (dump_site.mjs).


The ground heights in site/ are not archived (they are large): node dump_site.mjs regenerates them from the running game.
