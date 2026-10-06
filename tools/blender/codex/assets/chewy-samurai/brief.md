# Asset brief: chewy-samurai (Toybox Chewy re-dressed as a samurai; phase 1, the model)

## What it is
**Chewy**, the game's star hero, is becoming a **samurai**. The owner picked the outfit **Option B, "Haori Captain"**:
`refs/sheet.png` is **the blueprint for the clothes**.

**This is a re-dress of the existing, approved Toybox Chewy**, not a new character. His model is built by
`tools/blender/codex/assets/chewy-b/build_chewy-b.py` (read its `README.md`), from `refs/sheet-B.png`. The game uses his rig
`public/rigs/chewy_b.*`, and `refs/chewy-game-*.png` show him in the game.

**Locked (must not change at all)**:
- the head, face, eyes, lids, brows, nose, mouth and muzzle;
- the ears, the fur colours and atlas painting of the face and fur, the white chin and chest blaze;
- the body and limb shapes, the mitten paws, the feet and the tail;
- the proportions and the total height.

Build from **a copy of the archive** into this task folder, and change **only the clothing** (today's navy gi, red scarf,
red sash and dark pants). Prove the lock: in `report.md`, compare the head, paws and feet vertex positions with an
unmodified build of `build_chewy-b.py`. They should be identical, apart from body surface you delete because the new
clothes hide it.

This task has two phases:
- **Phase 1 (now)**: the re-dressed model in his neutral A-pose, until the director rates it 9/10 and the owner signs off.
- **Phase 2 (later)**: the rig, adapting `rig_chewy-b.py` (the same 37-bone hero contract) with weights for the new
  clothes.
Build rig-ready, but don't rig yet.

## The outfit (measured on `refs/measure-front.png` and `measure-side.png`)
The measurements are sheet pixels, ground at y = 492 and crown (top of the head, not the ears) at y ≈ 97, so the crown
height is **395 px**. Fractions below are of that crown height, measured up from the ground. W is the head width at the
cheeks (about 223 px on the sheet).

- **Kimono (inner layer)**, cream #F4ECE0:
  - a crossed wrap collar (left over right as seen on the sheet), its V meeting at about **0.43**;
  - visible at the chest between the open haori fronts;
  - the white chest blaze shows above the collar exactly as today.
- **Haori jacket**, red #BB3A2E:
  - **Shape**: worn **open at the front** and boxy, a soft A-line from the shoulders (collar top at about **0.58**) to the
    hem at about **0.22**, front and back. Its width at the hem is about **0.94 W**.
  - **Collar**: a wide flat band along the front edges.
  - **Sleeves**: wide, short **box sleeves** that end just above the elbow, at the top of the arm wraps. They must not
    hide the arm wraps or block the arm swing: keep their underside open and short.
  - **Crests**: white #F4ECE0 **paw-print mon** decals, one on each chest panel (about 0.11 W across, at about **0.49**)
    and **one big mon centred on the back** (about 0.45 W across, at about 0.42).
  - **Ties**: a red #D8402E **haori-himo cord**, a chunky knot with two short tassels, joining the fronts at about
    **0.43**.
  - Painted as clean blocks with crisp borders, like sheet-B. There's no cloth-fold detail beyond a few soft big folds.
- **Hakama**, indigo #243A6A:
  - wide pleated trousers from the waist (waistband top at about **0.36**) to the hem at about **0.13**, so the feet stay
    fully visible;
  - **split per leg**: two wide trouser legs that read together as a pleated hakama from the front (a centre parting and
    4–5 broad pleats per side), but each leg is its own tube so it can follow its leg when rigged;
  - the hem width across both legs is about **0.95 W**;
  - the waistband sits under the haori, and the haori hem overlaps the hakama by about 0.14.
- **Arm wraps**: keep today's cream wraps on the forearms (the same pieces and positions as now).
- **Saya** (scabbard), indigo #243A6A with gold #EBB84A fittings and a red #D8402E sageo cord:
  - tucked into the waistband at the **character's left hip**;
  - its mouth (where the blade enters) at the front-left of the waist, about 0.36 high;
  - it runs back and down at about 30° below horizontal, its gold-capped tip ending behind the hip at about **0.13**
    (see the side view).
  - **The saya is empty**: model no hilt or tsuba on it. The Bone Katana is a separate game prop, and the game puts its
    hilt in the saya mouth when it's sheathed.
  - Write the saya mouth's position and the blade-entry direction (a unit vector, metres, model space) to
    `saya_mount.json`, and give them in the report.
  - The saya must not cross the leg's path: check it at the side view and from both 45° yaws.
- **Remove**: today's navy gi, red scarf, red sash with knot, and dark pants. The tail now comes out **below the haori back
  hem**, over the hakama, as on the sheet's back view. Keep the tail mesh itself unchanged.
- **Palette**: haori #BB3A2E, cord #D8402E, kimono and mon #F4ECE0, hakama and saya #243A6A, gold #EBB84A. The fur and face
  colours stay as they are.

## Technical
- Keep Chewy's neutral A-pose, facing **−Y**, standing on z = 0, centred, at his current height.
- About today's triangle count + 25% at most (report both). Keep one material and one 2048² painted atlas, and re-pack
  only the clothing islands if needed. No cloth sim.
- **Rig-ready**:
  - the haori and hakama with bend loops at the shoulders, elbows, hips and knees, so phase 2 can weight them to the same
    37-bone rig;
  - the hakama legs as separate tubes;
  - the haori sleeves free of the arm swing;
  - hidden body surface under the clothes deleted;
  - `joints.json` written with the same joints as `joints-round13.json` (unchanged values, since the body is locked).
- Output: `public/models/chewy-samurai.glb`. **Don't touch `public/models/chewy-b.glb` or `public/rigs/`.**
- Preview with `--character`: the turnaround, head, `portrait.png` and the 45° `game.png` from both yaws.
- Build the **same-scale comparisons against `refs/sheet.png`** (PIL, with
  `.claude/skills/toybox-character/scripts/compare.py`):
  - `preview/cmp-front.png`, `cmp-side.png` and `cmp-back.png` (the full figure);
  - `cmp-today.png`: today's chewy-b next to the samurai, same scale, front and side, to show the lock held.

## Done when (phase 1)
- The front, side and back comparisons read as `sheet.png`'s outfit, within about 5% on the targets above.
- The head, paws, feet and tail are unchanged (proved in the report).
- `portrait.png` looks appealing, in the same finish as today's Chewy.
- `game.png` (45°) reads the red haori, the back mon, the indigo hakama and the saya, and no part reads as a thin spike
  from either yaw.
- One atlas, stands on the ground, faces −Y, no preview warnings, and `joints.json` and `saya_mount.json` written.
