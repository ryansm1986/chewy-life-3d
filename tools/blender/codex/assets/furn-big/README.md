# furn-big: Blender source (ROADMAP Z-D6 "Blender everything", 2026-11-03)

Housing furniture (docs/HOUSING.md): see brief.md for the items. Built by an Opus agent by script (`build_furn-big.py --piece <name|all>`, deterministic); reviewed by Claude in the game. The working
folder `tools/blender/work/codex/furn-big/` (renders, .blend files, kit dumps) is git-ignored. Brief: `brief.md`. GLBs in
`public/models/`. Game hook: src/home/furnitureMesh.js FURN_GLB_IDS (material names pick the instanced buckets: body, cloth, leaf, glow, hot, water).
