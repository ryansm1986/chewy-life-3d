# Chiku (tk-chiku-toy): Blender source (ROADMAP VL-2)

Takemori Village's shopkeeper, a bunny. Codex drew `sheet.png` (2026-11-02) and Claude picked it; the owner delegated the
pick. An Opus agent modelled and rigged her by script on Usagi's machinery, with Sasa's lid module. The working folder
`tools/blender/work/codex/tk-chiku-toy/` is git-ignored.

- `build_tk-chiku-toy.py`: the deterministic model build. The ears are thick oval paddles turned 12° out, so they read from
  both 45° game yaws.
- `rig_tk-chiku-toy.py` (with `rig_lids.py`):
  - the 37-bone rig;
  - the lids on hinges tilted 23.8° (`lidTilt` 0.4153);
  - the 3D lash rolls `Chiku_lash_L/R` on `lidU`;
  - the mouth;
  - the weights.
  Export with `--no-outline eye,tongue,mouth,lid,lash`.

**In the game**: `HERO_MODELS.tk_chiku`, in `ZONE_TOY.bamboo`.
- `squint [0.20, -0.24]`, judged in the game.
- `wave: 'out'`: the inward wave hides the paw in her big head.

**Known**:
- Shut, the lash is a level line, not a ∪.
- A faint pale disc shows on the closed left eye: the rigid lid domes about 8 mm in front of her rounded face.
- Both come from the rigid lid on the shared 1.22 rad hinge. A game-side closed-eye shape (a shape key or a lash bone)
  would fix them for every Blender villager.

33,888 triangles.
