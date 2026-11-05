# shop-3: Blender source (ROADMAP Z-D6 "Blender everything", 2026-11-04)

Blossom Hollow's level-3 shops, one model per seeded variant (shop-3-v0..v7: tea house on even variants, department store
on odd, colours by variant >> 1, the kit's tables). Built by an Opus agent by script (`build_shop-3.py --piece 3:<k>|all`,
deterministic); reviewed in the game. Game hook: catalog `glbVariants` (src/world/buildings/index.js: <id>-<level>-v<k>.glb,
k = variant % n; a remodelled shop keeps the kit).
