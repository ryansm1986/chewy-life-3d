# zv-maple: Blender source (ROADMAP Z-D6 "Blender everything", 2026-11-03)

The maple zone village's buildings (elder, shop, inn and the rest), its gate and lantern post, each with `saved` / `siege` overlay objects. Built by an Opus agent by script (`build_zv-maple.py --piece <name|all>`, deterministic); reviewed by Claude in the game. The working
folder `tools/blender/work/codex/zv-maple/` (renders, .blend files, kit dumps) is git-ignored. Brief: `brief.md`. GLBs in
`public/models/`. Game hook: src/regions/village/data.js BUILDING_GLB.maple (village.js placeBuildingGlb, decorGlb for the gate and lantern posts).
