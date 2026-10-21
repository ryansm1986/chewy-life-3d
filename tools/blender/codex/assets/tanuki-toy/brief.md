# Asset brief: tanuki-toy (the Toybox Tanuki Bandit, phase 1: the model)

## What it is
**The Tanuki Bandit**, a cheeky raccoon-dog thief: a ranged enemy of the Burrow and of Danzaburō's gang. It walks, runs
and throws acorns, animated by the game's biped Animator (the 37-bone hero contract, phase 2). The pick is **Option A
"Acorn Bandit"**: the attached `sheet.png` is **the blueprint**, so match it closely. It's the same toy line as the
Toybox Chewy (attached `sheet-B.png`, and `chewy-toy-game.png` in game): match his style and finish.
`current-tanuki-bandit-in-game.png` is today's procedural model (not this; size only).

This task has two phases:
- **Phase 1 (now)**: the model in a neutral A-pose, until the director rates it 9/10.
- **Phase 2 (later)**: rigging to the 37-bone biped contract (the same as the heroes).
Build rig-ready, but don't rig yet.

## Measured targets (measure them yourself on the sheet's front view, same scale; report sheet vs model)
- **Heights**: total **1.00 m** to the crown (not counting the ears), about 2.4 heads tall, the head about 0.42 of the
  total height.
- **Head**: the sheet's wide rounded tanuki head (wider than tall), the cream muzzle and cheeks, the dark **bandit mask**
  patches round the eyes, round dark ears with cream insides.
- **Eyes**: the sheet's big amber eyes (#dda443 iris, dark pupil, two catchlights, a thick upper lash line), set in the
  mask; iris about 68 % of the opening width, tucked toward the nose; **match the sheet's opening sizes** (measure W-fractions).
- **Head as a ball**: the face wraps round a rounded skull; in profile only the nose and muzzle project; each eye faces
  about 30° outward, set into the head's curve.
- **Nose / mouth**: the dark button nose (#3a2c28) on the cream muzzle, the smirk; blush.
- **Body / limbs**: the stubby toy body, mitten hands, dark legs (#3a2c28) and broad rounded feet as the sheet.
- **Tail**: the big ringed tail (fur #8a6a58 with dark rings #3a2c28, a cream tip), a separate piece with bend loops
  (the rig gives it a tail chain).
- **Costume**: the navy **gi** (#4a4a6a, a crossed collar, a red belt #e8503a), dark trousers (#2a2a3a), the red bandit
  **scarf** (#e8503a) knotted at the neck, the little **acorn pouch** at the belt (brown, an acorn peeking out).
- **Palette (hex)**: fur #8a6a58, cream #e0cbb0, mask/ears/legs #3a2c28, eyes #dda443, gi #4a4a6a, trousers #2a2a3a, scarf
  #e8503a (the sheet's swatches).
- **Second colourway** (phase 1 too): the maroon gi (#6a3a3a): export it as a second GLB, `tanuki-toy_maroon.glb`, the same
  mesh with only the gi's colour changed in the atlas.

## Technical
- A neutral A-pose (arms about 30° out), facing **−Y**, standing on z = 0, centred.
- **≤ 25k triangles** (the head, face and eyes may take up to half). One material with **one 2048² painted atlas**. No hair
  strands or fur cards.
- Your choice of technique (subdivision modelling, the repo's SDF kit `D:/projects/chewy-life-3d/tools/blender/disney/sdf.py`,
  remeshing), then clean it up.
- **Rig-ready**: eyeballs as separate spheres; loops round the eyelids and mouth corners; the ears and tail separate pieces
  with bend loops; enough loops at the joints; hidden body surface deleted. Record the joint positions in `joints.json`
  (metres).
- Output: `D:/projects/chewy-life-3d/public/models/tanuki-toy.glb` (+ `tanuki-toy_maroon.glb`).
- Preview **with `--character`**, render `portrait.png` (3/4, head and shoulders), and build the same-scale comparisons
  against `sheet.png` yourself: `preview/cmp-head.png` (front and 3/4), `cmp-side.png`, `cmp-back.png`, `cmp-eyes.png`.

## Done when (phase 1)
- The turnaround and head comparisons read as the same character as `sheet.png`, within about 5 % on the measured targets.
- `portrait.png` is appealing and polished, in the Toybox Chewy's finish; `game.png` (45°, both yaws) reads the face,
  mask and scarf; nothing reads as a thin spike.
- ≤ 25k triangles, one atlas, stands on the ground, faces −Y, no preview warnings, `joints.json` written.
