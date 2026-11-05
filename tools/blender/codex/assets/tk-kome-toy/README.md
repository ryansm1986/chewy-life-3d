# Kome (tk-kome-toy): Blender source (ROADMAP VL-2)

The Sasanoha Inn's cook in Takemori Village, a calico cat. Codex drew `sheet.png` (2026-11-02) and Claude picked it; the
owner delegated the pick. An Opus agent modelled and rigged her by script on Mochi's machinery, with Sasa's lid module.
The working folder `tools/blender/work/codex/tk-kome-toy/` is git-ignored.

- `build_tk-kome-toy.py`: the deterministic model build. The ears are three-arc convex cones rising from behind the
  headband; the lash is its own object.
- `rig_tk-kome-toy.py` (with `rig_lids.py`):
  - the 37-bone rig;
  - the lids on hinges tilted 29.6° (`lidTilt` 0.517);
  - `Kome_lash_L/R` on `lidU`;
  - the mouth;
  - the weights.
  The paddle is rigid on the hips.

**In the game**: `HERO_MODELS.tk_kome`, in `ZONE_TOY.bamboo`. `squint [0.08, -0.30]`, judged in the game: the happy
crescent comes from the lower lid, and higher upper values read sad.

**Known**:
- A faint pale lid on the cream-side eye at the 0.85 blink frame.
- A thin line round the patch-side lower lid in the happy pose.
- The shut lash is a soft line, not a deep ∪: the rigid lid on the shared 1.22 rad hinge. A game-side closed-eye shape
  would fix it for every Blender villager.

33,402 triangles.
