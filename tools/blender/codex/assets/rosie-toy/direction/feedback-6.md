# Owner feedback: "Rosie's head isn't round like most chibi models"

Rosie is in the game next to the other Toybox characters. See
`D:/projects/chewy-life-3d/tools/blender/work/codex/rosie-r2/heads.png`, from left to right:
- Rosie;
- the kit villagers Kuma and Mochi;
- Moka;
- her own sheet's head front.

Next to them her head reads wrong in three ways:
1. **Her face is a narrow, tall oval.** The others are wide squircles, clearly wider than tall, with full round cheeks; the face
   fills the head. Hers is about as tall as it is wide and tapers toward the chin.
2. **Her head is small for a chibi.** At W 0.44 m she's the narrowest in the cast (Moka 0.49, the kit villagers about 0.55–0.6,
   Chewy 0.68). The Toybox proportion is about 2.4 heads tall, and she's nearer 2.7.
3. **The hair makes the head tall, not round.** The crown pillows plus the bow stack upward, so the whole head reads as a tall egg.
   On the sheet the hair is a wide, round cloud around a round face.

## Targets (W = face width at the cheeks; z above the chin, in W)
- **Bigger head**: W from 0.44 m to **0.52 m**. Scale the whole head, hair and bow together about the chin; the chin stays at
  0.72 m above the ground, and the body, costume and legs stay as they are.
- **Round, chubby face, wider than tall**: chin to skull crown about **0.86 W** (now 1.02 W).
  - The widest point is **low**, at the cheeks (z 0.22–0.30), with **full round cheeks** that bulge past the eye line.
  - The jaw and chin are a broad soft curve, not tapering. At z 0.08 the face is still about 0.80 W wide.
  - The front outline is a round squircle, like Mochi's and Kuma's in heads.png.
- **The face fills more of the head**:
  - the hair's side masses sit a little further out, so the face's round outline shows clearly between them;
  - the bangs rest on the forehead at the same height relative to the brows;
  - **no tall crown**: lower the crown pillows so the hair's top sits about 0.30 W above the skull crown (now it stacks much higher);
  - the bow sits **on** that lowered crown, the same size relative to the head.
  - The overall head-plus-hair outline from the front should be **round, about as wide as tall**, not an upright egg.
- **Keep the face language and the round-ball construction you built**:
  - the eyes, sockets, brows, nose, mouth and blush, positioned in W units, so they scale with the head;
  - the eyes stay mid-face above the nose, with their 33° facing;
  - the profile stays one convex arc.
  Re-check that the eye is still inside the profile silhouette and the chin tuck stays.
- **Toon check**: re-run your adaptive face triangulation for the new head and confirm the band displacement stats are still within
  Rosie's numbers.

## Then re-rig
The skeleton, weights, lids, mouth and face controls are approved. Carry them across to the new head:
- move the head-bone children (eyes, lids, jaw, lips, brows, ears) with the scaled head;
- keep the lid coverage and hidden-at-rest checks passing;
- keep the toon-check smooth.
Re-export with the same command (`--name rosie_toy --height` set to her new total height), with no warnings and deterministic.
Update `public/models/rosie-opus.glb` with the new approved-look model too.

## Report
Before / after numbers:
- W, chin-to-crown, the face width at z 0.08 / 0.25 / 0.5, the head-plus-hair width and height, and total heads tall.

Images:
- `preview/head_front.png` and `head_side.png`;
- `portrait.png`;
- a **`cmp-cast.png`**: your new head front beside `rosie-r2/f-kuma/rest.png`, `f-mochi/rest.png` and `f-moka/rest.png` at the
  same scale.

Then the rig checks (the HERO_EXPORT line, lids, toon) and known issues, then stop.
