# Asset brief: poe-toy (the Toybox Poe model; phase 1, the model)

## What it is
**Poe** is a black **pug ninja**, the game's third playable hero, next to Chewy (now a samurai) and Moka (a mage). She's
swift, light and hidden: hand seals, smoke clones, shadow-steps and a giant bone shuriken. She's earnest and a little
dramatic, and comically un-stealthy (she snorts and sneezes).

The owner picked design **Option D, "Bamboo Shinobi (black)"**. `refs/sheet.png` is **the blueprint**, so match it closely.
- `refs/option-B-face.png` has the same black pug face, larger, in more head views.
- `refs/option-C-outfit.png` has the same outfit on an apricot pug, in more views.
- She's the same toy line as the Toybox Chewy (`refs/sheet-B.png`, and `refs/chewy-toy-game-crop.png` in the game), Moka
  (`refs/moka-sheet.png`) and Shadow (`refs/shadow-sheet-A.png`), so match their style and finish too.

This task has two phases:
- **Phase 1 (now)**: the model in a neutral A-pose, until the director rates it 9/10 and the owner signs off.
- **Phase 2 (later)**: rigging to the same 37-bone biped hero contract as Chewy (`tools/blender/codex/assets/chewy-b/rig_chewy-b.py`).
Build rig-ready, but don't rig yet.

## Measured targets
Measured on `refs/measure-front.png` and `measure-head-front.png`; the labels are sheet pixels.
- W = the head width at the cheeks; H = crown to chin, excluding the ears and the festival mask; y is measured down from
  the crown.
- "Height" fractions are of the total crown height, measured up from the ground.

### Scale
- **Total** about **1.00 m to the crown** on the sheet, the same as Chewy's sheet. Match **chewy-b.glb's** scale: measure
  its crown height and give Poe the same.
- **Head**: H ≈ **0.43** of the total (about 2.3–2.4 heads).

### Head
- **Proportions**: a wide, soft pug squircle, **W : H ≈ 1.43** (wider than Chewy's). The flattest face in the cast: a broad
  forehead, full rounded cheeks, and a soft flat front plane that still wraps the ball.
- **Eyes**:
  - centres at x = **±0.25 W**, y = **0.56 H**;
  - opening **0.235 W** wide × **0.31 H** tall, round;
  - iris about **69%** of the opening width, tucked toward the nose, with white crescents outside;
  - pupil about **74%** of the iris;
  - **honey-gold iris #C88A3A** with a darker rim, two catchlights (big upper-outer, small lower), and a thick upper lash
    line;
  - each eye faces about 30° outward, set into the head's curve (not on a flat plate), and the far eye is hidden in the side
    view.
  - The eyes carry the face on black fur: keep the warm-white sclera clean and bright.
- **Head as a ball**: in profile, forehead, cheek and chin form one convex arc. Only the bun muzzle and nose project, and
  only slightly: see `measure-side.png`.
- **Nose**: a wide rounded black-grey button **0.14 W** wide.
  - Its **top sits at about the eye-centre line** (y ≈ 0.57 H), its centre at about 0.62 H.
  - A flat pug face puts the nose between the eyes. Match the sheet; don't lower it.
  - It has a soft highlight.
- **Muzzle**: a soft **bun muzzle**, about **0.33 W** wide, from just under the eyes to the mouth. It barely projects (much
  flatter than Chewy's).
  - The mask is a slightly darker tint #1E1B20 over the muzzle, with no hard edge, as on the sheet.
  - It has a small cleft and a W-shaped closed mouth at **0.78 H**, **0.27 W** wide.
- **Forehead roll**: **one** soft, broad sculpted roll across the brow, about **0.5 W** long, at y ≈ 0.19–0.28 H, with a
  hint of a second short roll over the nose bridge. They're smooth clay folds, never lines.
- **Brows**: none painted on black. The forehead roll does that job, as on the sheet.
- **Blush**: soft warm dabs under the outer eyes at about 0.8 H.
- **Ears**: small, soft, **folded forward "button" ears** at the top corners of the head.
  - Each is about **0.42 W long × 0.36 W wide**, its tip flopping down to about the top of the eyes.
  - Thick, rounded and clay-like: at least about 0.06 W thick at the fold, never thin cards. Check them from both 45° yaws.

### Body
- **Proportions**: compact and nimble. Torso width at the chest about **0.90 W**, the shorts about **0.96 W** wide.
- **Limbs**: short chunky arms (shoulder to paw tip about 0.25 of the total), black mitten paws, and short legs.
- **Tail**: a tight **black curl** (a chunky round swirl, about 0.12 of the total across) high on the rump, above the shorts
  and below the shuriken mount (see the back and side views). Make it a separate piece with bend loops.
- **Coat**: black #2E2A30 with a cool sheen and toy pads #4A4450, and the muzzle, ears and nose #1E1B20. The painted shading
  is subtle; don't make it glossy.

### Outfit (heights up from the ground, fractions of the total)
- **Cream collar** (#F4EAD2), the lowered face mask: a thick soft roll around the neck from the chin (**0.57**) to about
  0.50. It separates the head from the body, so keep it bright.
- **Mustard scarf** (#D8B040): a chunky knot on the chest at the character's right, about 0.41–0.52, with two short tails.
- **Moss wrapped top** (#5A8A4A):
  - a crossed wrap with a cream diagonal strap across the chest;
  - short sleeves to the elbow with **cream and mustard bands** at the cuffs;
  - the **moss hood worn back** as a soft cowl behind the neck (side and back views).
- **Forearm guards**: dark moss (#3D6038) with mustard bands.
- **Mustard sash** (obi) at **0.34–0.39**, with a big knot at the centre and two tails hanging to about **0.20**.
- **Puffy dark-moss shorts** (#3D6038) from about 0.32 to the gathered hems at **0.135**, split per leg.
- **Cream shin wraps**, about 0.08–0.14.
- **Moss split-toe tabi boots** with cream straps and mustard soles, about 0.00–0.09.
- **At the character's right hip**: a dark-moss **pouch** with a small bone shuriken sticking out.
- **At the character's left hip**: a cream **jutsu scroll** with brown caps, about 0.15 × 0.21 of the total, tilted as on the
  sheet.
- **Festival mask**: a cream **fox-style festival mask** with green and orange paint and a mustard tassel, worn on the
  **character's left** top corner of the head, tilted.
  - About 0.23 × 0.31 of the total.
  - One rigid piece, attached to the head. It must not hide the left eye from the front or from 45° above.
- **Giant fūma bone shuriken on the back**: four bone arms around a mustard hub ring, **0.45 of the total across**, strapped
  flat on the upper back with a mustard strap.
  - Its bone tips peek out behind the shoulders in the front view, as on the sheet.
  - **Make it a separate object named `fuma_back`**: in the game it's also the thrown weapon, so the game hides it while
    it's in flight.
  - Write its centre and facing (model space, metres) to `fuma_mount.json`.

### Palette (hex)
| Part | Hex |
|---|---|
| Fur | #2E2A30 |
| Sheen and pads | #4A4450 |
| Mask, ears and nose | #1E1B20 |
| Eyes | #C88A3A |
| Moss | #5A8A4A |
| Cream and bone | #F4EAD2 |
| Mustard | #D8B040 |
| Dark moss | #3D6038 |

Use the toy cast's warm-white sclera.

## Technical
- A neutral A-pose (arms about 30° out), facing **−Y**, standing on z = 0, centred.
- **≤ 30k triangles** (the head, face and eyes may take up to half). One material with **one 2048² painted atlas**. No
  fur strands or cards.
- Your choice of technique: the Toybox Chewy's parametric quad surfaces (`tools/blender/codex/assets/chewy-b/build_chewy-b.py`
  is the reference), the repo's SDF kit (`tools/blender/disney/sdf.py`, read-only import), or remeshing, then clean it up.
- **The game's toon band**: the game shades with a hard light/shade band (`smoothstep(-0.04, 0.34, N·L)`). Keep the face
  triangles fine enough where the surface curves fast (cheeks, muzzle, forehead roll) that the band doesn't zigzag. Render
  `preview/toon-check.png` with a hard ramp and a sun about 50° up at yaw ±0.6.
- **Rig-ready**:
  - eyeballs as separate spheres;
  - loops around the eyelids and mouth corners;
  - the ears, the tail, the scarf tails and the sash tails as separate pieces with bend loops;
  - enough loops at the joints;
  - the shorts split per leg;
  - hidden body surface deleted.
  Record the joint positions in `joints.json` (metres), with the same joint names as Chewy's `joints-round13.json`.
- Output: `public/models/poe-toy.glb`.
- Preview **with `--character`**: the turnaround, head, `portrait.png` (3/4, head and shoulders, soft studio light) and
  `game.png` from both 45° yaws.
- Build the **same-scale comparisons against `refs/sheet.png`** yourself (PIL, or
  `.claude/skills/toybox-character/scripts/compare.py`):
  - `preview/cmp-head.png` (front and 3/4, against the sheet's head close-ups and `option-B-face.png`);
  - `cmp-front.png`, `cmp-side.png`, `cmp-back.png` and `cmp-eyes.png`;
  - `cmp-cast.png`: Poe next to chewy-b.glb, at the same scale.
  Check them before every report.

## Done when (phase 1)
- The turnaround and head comparisons read as the same character as `sheet.png`, within about 5% on the measured targets.
- The face reads as **a cute black pug**: big honey eyes, the forehead roll, the bun muzzle and folded ears.
- `portrait.png` looks appealing and polished, in the same finish as the Toybox Chewy.
- `game.png` (45°) still reads the face (the eyes and cream collar), the moss and mustard outfit, the mask and the back
  shuriken. No part reads as a thin spike from either yaw.
- ≤ 30k triangles, one atlas, stands on the ground, faces −Y, no preview warnings, and `joints.json` and `fuma_mount.json`
  written.
