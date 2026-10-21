# Asset brief: tamamo-toy (the Toybox Tamamo, phase 1: the model)

## What it is
**Tamamo, the Nine-Tailed**, the white kitsune fox queen, the final boss of the Burrow (the Moon Sanctum). She walks and
casts, animated by the game's biped Animator (the 37-bone hero contract, phase 2); the game scales her ×2.5 (about 2.6 m).
The pick is **Option A "Moon Fox Queen"**: the attached `sheet.png` is **the blueprint**, so match it closely. It's the
same toy line as the Toybox Chewy (attached `sheet-B.png`, `chewy-toy-game.png` in game): match his style and finish.
`current-tamamo-in-game.png` is today's procedural model (not this; size only).

This task has two phases:
- **Phase 1 (now)**: the model in a neutral A-pose, until the director rates it 9/10.
- **Phase 2 (later)**: rigging to the 37-bone biped contract.
Build rig-ready, but don't rig yet.

## The tails: a separate model
Today the game draws her nine tails as **nine copies of one tail** fanned behind her (an instanced mesh it animates per
copy: `BUILD.tamamo` in `src/dungeon/monsters.js`, read-only). Keep that: **don't build the nine tails into the body**.
Instead build **one tail** (the sheet's "ONE TAIL ×9" callout: a big smooth plume, white #f8eee6 at the root, through
lavender #d8c8ff, to the pale-blue **foxfire tip** #9ad0ff) as its own file, `tamamo-tail.glb`: one object `body`,
**vertex colours only** (no texture: it's instanced), its **root at the origin**, pointing **up +Z** and curving back
(−Y is front, so the plume curls toward +Y at the top), about **0.8 m** long at the body's scale (the sheet's tail
length relative to her), ≤ 1,500 triangles. Show the fan in your previews by placing nine copies behind her as the sheet
does (a preview helper only; don't export the fan).

## Measured targets (measure them yourself on the sheet's front view, same scale; report sheet vs model)
- **Heights**: total **1.05 m** to the crown (not counting the tall fox ears), about 2.4 heads tall.
- **Head**: the sheet's white fox head with the fluffy cheek ruff, a small pointed muzzle (#ffffff), tall fox ears with
  lavender insides (#c8a8ff), thick volumes (never thin cards).
- **Eyes**: big rose-red eyes (#ff3a6a irises, dark pupils, two catchlights, a thick dark upper lash line with a wing),
  regal and a little smug; iris about 68 % of the opening width; match the sheet's opening sizes.
- **Head as a ball**: the face wraps a rounded skull; only the muzzle projects; eyes about 30° outward.
- **Hair**: the fluffy white forelock / crest as one or two big sculpted masses.
- **Regalia**: the **fox mask** worn on the side of her head (turned about 40° outward onto the side corner, so from the
  45° camera it doesn't read as a badge on top), the golden crescent **kanzashi** (#ffd24a).
- **Costume**: the deep indigo **kimono** (#3c2c78, lining #281a50) with gold trim (#ffd24a), the gold **obi** with its big bow
  (#ffcf3a), wide sleeves (thick volumes), mitten hands, small feet.
- **Palette (hex)**: fur #f8eee6, muzzle #ffffff, ear inner #c8a8ff, blush #ffb0d0, eyes #ff3a6a, kimono #3c2c78, lining
  #281a50, gold #ffd24a / #ffcf3a (the sheet's swatches).

## Technical
- A neutral A-pose (arms about 30° out), facing **−Y**, standing on z = 0, centred.
- **≤ 28k triangles** (the head, face and eyes may take up to half). One material with **one 2048² painted atlas**. No hair
  strands or fur cards. (Pale fur: keep the whites ≤ #f8f4f0 except the muzzle and catchlights; the game's bloom glares on
  pure white.)
- **Rig-ready**: eyeballs as separate spheres; loops round the eyelids and mouth corners; the ears, sleeves and kimono
  skirt with bend loops; enough loops at the joints; hidden body surface deleted. Record the joint positions in
  `joints.json` (metres). Mark the tail root on her back in `joints.json` (`tailRoot`: where the fan attaches).
- Output: `D:/projects/chewy-life-3d/public/models/tamamo-toy.glb` and `tamamo-tail.glb`.
- Preview **with `--character`**, render `portrait.png`, and build the same-scale comparisons against `sheet.png`:
  `preview/cmp-head.png`, `cmp-side.png`, `cmp-back.png`, `cmp-eyes.png` (with the nine-tail fan shown).

## Done when (phase 1)
- The turnaround and head comparisons read as the same character as `sheet.png`, within about 5 % on the measured targets.
- `portrait.png` is appealing and polished, in the Toybox Chewy's finish; `game.png` (45° at her ×2.5 size, both yaws)
  reads the face, ears, mask and the tail fan; nothing reads as a thin spike.
- ≤ 28k triangles (body), the tail ≤ 1.5k, one atlas, stands on the ground, faces −Y, no preview warnings, `joints.json`.
