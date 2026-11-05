# shop-12: Blender source (ROADMAP Z-D6 "Blender everything", 2026-11-04)

Blossom Hollow's level-1 stalls and level-2 shops, one model per seeded variant (shop-1-v0..v7: tea / onigiri / taiyaki by
v % 3; shop-2-v0..v7: bakery / cafe / flower / toy by v % 4). Built by an Opus agent by script (`build_shop-12.py
--piece <level>:<variant>|<level>|all`, deterministic); reviewed in the game. Game hook: catalog `glbVariants`, with
`glbKeep: ['anim']` (the toy shop's spinning pinwheel heads stay the kit's; the GLB keeps their sticks).
