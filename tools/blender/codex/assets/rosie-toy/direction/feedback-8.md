# Round 8 — re-rig the approved new head (the owner: "Yes", 2026-10-28)

The owner signed off on round 7c (the round face, hair hugging the skull, the seven ringlets, the face pulled back). With
every bone at rest she must look exactly like round 7c from every view. Rig it for the game with the same pipeline as
rounds 4–5 (`rig_rosie-opus.py` runs the build in RIG_MODE; `direction/feedback-4.md` and `-5.md` are the rig contract and
the face fixes; `README.md` has the commands).

## Carry across (approved in rounds 4–5; keep all their checks passing)
- **The 37-bone hero skeleton:** move the head-bone children (eyes, lids, jaw, lips, brows, ears) to the new face.
- **The weights.**
- **The lid shells:** coverage and hidden-at-rest checks, blink at +1.22 X, happy squint at +0.488 X, lidD at −0.10 and
  −0.24 X.
- **The mouth cut, cavity and tongue.**
- **The toon-band face triangulation.**

The new face is shallower and the eyes face 28° outward. If the lid hinges need `lidTilt` (the eyes' outward angle, as on
Mochi and Pan), report the value for her HERO_MODELS entry.

## The ringlets (part label `ringlet`)
- Weight them to the **head**, with the lower part of each tip blended toward the **neck and chest**, so a head turn of
  ±0.6 rad (game Y) and a nod of ±0.3 X don't shear them through the puffy sleeves or the bodice.
- Your 7b estimate had the front side pair about 1 cm into the opposite sleeve at a ±0.6 turn: fix that.
- They're hair: no spring and no other bones.

## Triangle budget
After the cull the model is about 39.3k against the rig script's 34,000 cap. Bring it to **≤ 38,000** (Moka's is 37.9k)
by trimming where it doesn't show at the game camera:
- the ringlets' sides and rings (12 → 10 sides);
- the curls' resolution (n 6 → 5);
- a slightly coarser hair base and rims.

Raise the script's cap to 38,000. Keep the face's toon refinement as it is. If ≤ 38k can't be reached without visible
faceting, stop at the nearest clean count and say so.

## Export
- Run `hero_export.py` into `export/`: `--name rosie_toy --height <her new total height>`. It must end with no warnings and
  be deterministic.
- Leave `public/rigs/` alone: the director installs it.

## Report
- The `HERO_EXPORT` line, the total height and the triangle count.
- **The nightcap anchor for the game:** the top of her hair under the bow, as an offset from the head bone's head
  (game axes: x right, y up, z forward, in m). Her entry today is `hat: [0, 0.44, -0.03, 1.15]` for the old head.
  Report the new [x, y, z] and the scale that would fit a cap of the same relative size.
- `preview/poses.png`:
  - head turns ±0.6 Y;
  - nods ±0.3 X;
  - a tilt;
  - the walk and wave arm poses;
  - the ringlets in each.
- `preview/face.png`: rest, blink, squint, happy, talking jaw.
- The toon check.
- The lid checks.
- Known issues.

Then stop.
