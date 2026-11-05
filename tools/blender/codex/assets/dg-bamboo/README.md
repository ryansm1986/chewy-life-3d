# The Bamboo Cave's set pieces (dg-bamboo): Blender source (Z-D6, 2026-11-04)

The bamboo zone dungeon kit's own pieces (src/dungeon/zoneKits/bamboo.js, wrapped with glbFn('dg-bamboo')): hokora, culmStack, shootBasket, stoneMarker (2 variants), rockPillar (2), rootTangle (2), fallenBamboo. Each GLB is built in its kit piece's local frame; the game swaps the geometry and keeps the kit's lights (REGION_GLB['dg-bamboo'], variants by seed % 2). Build: build_dg-bamboo.py --piece <name|all> (run.sh). Known: the stones are smooth egg forms, like rg-bamboo's iwakura.
