# Round 3: the owner approved the model. Rig it (phase 2).

The owner signed off on round 2 as it is. **The model is locked**: don't change any geometry or paint from here on. Rig it to
the **same 37-bone hero contract as today's Chewy**.

## How
- Adapt `base/rig_chewy-b.py` (`rig_chewy-samurai.py`). It rebuilds through `build_chewy-samurai.py`, then adds the
  37-bone hero rig, the lid shells, the mouth cavity and the weights, and saves `chewy-samurai_rig.blend`.
- **The face rig is chewy-b's, unchanged**: the same bones, lid shells, mouth cavity, face weights and joint positions
  (`joints-round13.json`), because the head is byte-identical. Reuse that code exactly. The face must behave identically
  to `chewy_b` in the game at every face value (talk, blink, bark, happy squint +0.488 on the upper lids, lidD held at −0.1
  at rest).
- **The body**: reuse chewy-b's body, arm, leg and tail weights for every locked part (they're the same vertices).

## New weights (the clothes)
- **Haori**: weight it to the spine and chest, with the shoulders blending into the upper arms near the sleeve roots, so
  arm raises carry the shoulders without tearing.
  - **Sleeves**: mostly upper arm, with a soft falloff to the chest at the root. The open underside must not collapse
    into the arm on a raise.
  - **The side walls under each arm**, pushed in up to 7.8 cm: blend them to the chest so arm swings don't pull them
    through.
  - **The back hem and tail vent**: the hips, so the vent opens cleanly when the tail wags.
- **Hakama**:
  - each leg tube goes to its thigh and shin, with a hip blend at the top;
  - the **centre-front overlap zone** is weighted mostly to the hips, as you noted, so a leg swing doesn't open a slot or
    cross the two fronts;
  - the waistband ring goes to the hips;
  - the pleats must not crumple at the knee bend.
- **Saya, sageo and mouth ring**: rigid, on the hips. **The forward leg swing past −0.6 rad** touching the saya mouth and
  sageo is accepted. Soften it if you can, for example by weighting the hakama's top front partly to the hips, as you
  suggested, but don't move the saya.
- **Cord and knot**: the chest.

## Export and checks
- Export with `tools/blender/codex/hero_export.py` into **your task folder** (`export/`), named `chewy_samurai`, at
  `--height 1.2` like chewy_b. It must reach **no warnings**. **Don't write to `public/rigs/`**: I install it.
- In the same export space as the rig, write the **saya mount** (the mouth position and the blade-entry and edge-up
  directions, in the hips bone's frame as well as the model space) to `export/saya_mount.json`. The game parents the
  sheathed hilt to the hips.
- `preview/poses.png`: rest, walk at both extremes, run, a one-handed and a two-handed sword swing (arms forward and up),
  a ball throw, an arm raise to the head (the cast/wave pose), a bark/howl with the head up, a roll crouch, and a sit.
  Check the sleeves, side walls, hakama front, vent and saya in each.
- `preview/face.png`: rest, talk, blink, bark and happy, matching chewy_b's.
- Close crops of any problem area, plus a **toon check** of the clothes in the walk and swing poses.
- **Process safety**: launch every Blender run yourself, record its PID, and stop only those PIDs. Never kill by image
  name. Keep the 900 s timeouts and the sample caps.

## Report
End with the report:
- the weights approach;
- export stats (bones, triangles, the warnings count);
- the pose and face checks;
- the saya mount;
- known issues.
Then stop. I'll install it and check it in the game.
