# rg-bamboo: Blender source (ROADMAP Z-D6 "Blender everything", 2026-11-03)

The Bamboo Grove's landmark props: ruinedShrine, iwakura, torii, lantern, chimes, bambooBench. Built by an Opus agent by
script (`build_rg-bamboo.py` + `props_more.py`, deterministic); reviewed in the game (`game_tour.mjs` frames each prop
from the biome's own formulas). The working folder `tools/blender/work/codex/rg-bamboo/` is git-ignored. GLBs in
`public/models/rg-bamboo-*.glb`. Game hook: src/regions/assets/glbPieces.js REGION_GLB.bamboo (a model's `stone`
part joins its `body`: see intoBody).
