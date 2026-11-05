# Takumi (tk-takumi-toy): Blender source (ROADMAP VL-2)

Takemori Village's bamboo craftsman, a brown bear. Codex drew `sheet.png` (2026-11-02) and Claude picked it; the owner
delegated the pick. An Opus agent modelled and rigged him by script on Kuma's machinery. The working folder
`tools/blender/work/codex/tk-takumi-toy/` is git-ignored.

- `build_tk-takumi-toy.py`: the deterministic model build. `scratch/fit_head2.py` fits the head to the sheet.
- `rig_tk-takumi-toy.py` (with `rig_lids.py`, from Sasa's rig):
  - the 37-bone rig;
  - the lids on hinges tilted 13.5° (`lidTilt` 0.236);
  - the 3D lash rolls `Takumi_lash_L/R` on `lidU`;
  - the mouth;
  - the weights.
  Export with `--no-outline eye,tongue,mouth,lid,lash`.

**In the game**: `HERO_MODELS.tk_takumi`, in `ZONE_TOY.bamboo`. `squint [0.20, -0.30]`, judged in the game.

**Known**: shut, the lash is a short, nearly straight dark line, not a deep ∪. A rigid lash on the shared 1.22 rad lid
hinge can't sag into a curve. A closed-lash shape key or a lash bone would be the game-side way to get one, for every
villager.

33,860 triangles.
