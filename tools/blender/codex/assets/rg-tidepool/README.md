# rg-tidepool: Blender source (ROADMAP Z-D6 "Blender everything", 2026-11-03)

The Shiokaze Tidepools' landmark props: wreck, seaTorii, weddedRocks, grottoMouth, lookout, shoreLamp, giantClam, netRack,
arenaGate. Built by an Opus agent by script (`build_rg-tidepool.py --piece <name|all>`, deterministic); reviewed in the
game. The working folder `tools/blender/work/codex/rg-tidepool/` is git-ignored. GLBs in `public/models/rg-tidepool-*.glb`.
Game hook: src/regions/assets/glbPieces.js REGION_GLB.tidepool (material names `rock` / `reed` / `hot` fill the tidepool
layout's own piece keys; no `leaf` or `stone` parts there).
