# Asset brief: stella-toy (the Toybox Stella; phase 1, the model)

## What it is
**Stella** is a **female Weimaraner** (she / her), the game's sixth playable hero and its first **healer and support**,
from Shiokaze Port, the seaside village of the Tide Pool zone. She's calm, kind and quietly confident, with a dry, playful
streak, and goofy when she gets excited. She heals the pack, shields allies in bubbles and calls tide pools, holding a
**jellyfish parasol**.

The owner picked **Option C, "Jellyfish Oracle"**, with one change: **blue eyes**. `refs/sheet.png` is **the blueprint**:
Option C redrawn with blue eyes. Match it closely. `refs/option-C-amber.png` is the same design with the original amber
eyes: use it only to cross-check shapes.

She belongs to the same toy line as:
- the samurai Chewy (`refs/chewy-samurai-sheet-E.png`, `refs/sheet-B.png`, `refs/chewy-toy-game-crop.png`);
- Poe (`refs/poe-sheet-D.png`);
- Moka (`refs/moka-sheet.png`);
- Floofy (`refs/floofy-sheet.png`);
- Foosy (`refs/foosy-sheet.png`);
- Shadow (`refs/shadow-sheet-A.png`).

This task has two phases:
- **Phase 1 (now)**: the model in a neutral A-pose, until the director rates it 9/10 and the owner signs off.
- **Phase 2 (later)**: rigging to the 37-bone biped hero contract.

Build rig-ready, but don't rig yet. Finished examples of this pipeline to learn from:
- `tools/blender/work/codex/golden-toy/` (Foosy);
- `tools/blender/work/codex/shihtzu-toy/` (Floofy);
- `tools/blender/codex/assets/chewy-b/`.

## Measure the sheet first
**Measure on the sheet yourself**, scripted (ruled crops or colour extents), not by eye. Write `measurements.json` with
the targets below as fractions of W (the head width at the cheeks, excluding the ears) and H (crown to chin). Show your
measurements next to the model's in every report. If the views disagree, follow the head close-ups for the face and the
turnaround for the body, and say so.

Targets to measure and match:
- **Height**: about **1.10 m** to the crown, as the sheet says; about 2.4 heads. Put her next to chewy-b in a
  `cmp-cast` image: she's slightly taller and slimmer than Chewy.
- **Head**:
  - a big rounded head with a slightly longer, elegant Weimaraner muzzle, still toy-short (measure the muzzle's depth
    in the side view);
  - a soft **pinkish-grey nose** (#8f7474) with a highlight;
  - a gentle closed smile as her default.
- **Mouth**: the owner dislikes painted mouth lines. **Sculpt a real lip parting** (a shallow crease with a lip roll,
  rig-ready for the jaw), not a drawn line.
- **Eyes**:
  - **blue**: iris **#7fb2e0**, a darker outer ring **#3f6f9f**, a soft lighter lower glow (#b8d8f2), a large dark pupil
    (#2a2230);
  - two catchlights, the white crescents, and the thick upper lash line with a small wing, all as on the sheet;
  - they face about 30° outward, set into the head's curve;
  - the iris bottom is at or above the nose top, mid-face (never on the cheeks).
  - The blue must read clearly against the silver fur in the game, so check it in `game.png`.
- **Ears**:
  - **long, soft, high-set floppy Weimaraner ears**, folding forward and hanging to about the jaw, wide at the base, with
    the faint pink inner tint the sheet shows;
  - thick, clay-like volumes, never thin flaps. Check them from both 45° yaws.
- **Fur**:
  - the sleek short **silver-grey** coat (base #a9a6a2, light #cfccc6, shade #85817c) as smooth masses;
  - the lighter muzzle and brow areas as on the sheet;
  - a long, thin, **waggy tail** with real volume (a tapered tube, not a ribbon).
- **The robe (the costume)**:
  - a **periwinkle** (#8c97de) layered robe with wide sleeves and **scalloped, bell-like hems** like a jellyfish;
  - a **pearl-pink** (#f1c4cf) underlayer showing at the hem;
  - a pearl-pink obi with a **big bow at the back**;
  - two **sea-glass beads** (#9ad0e6) at the front of the obi;
  - a **pearl necklace** (chunky pearls, at least 10 mm each in the game, so it reads).
  - The scallops are thick, rounded lobes (no thin frills), and the hem clears the legs for walking.
  - Measure each piece's heights and widths as fractions of the crown height.
- **Colour**: keep the periwinkle a clear blue-violet, distinct from **Moka's lavender** dress (see `moka-sheet.png`).
  Check them side by side in `cmp-cast`.

## The weapon prop (a separate GLB)
**`public/models/stella-parasol.glb`**, the jellyfish parasol, as on the callout:
- a bell-shaped canopy, about 0.75 m across, in pearl pink with periwinkle scalloped rims and a lighter centre;
- 6–7 short, **chunky** ribbon-tentacles (rounded, tapered tubes, not flat ribbons) hanging 0.15–0.25 m;
- a periwinkle shaft with a hooked handle, about 0.8 m tall;
- a pearl at the top.
- Use a material named `*glow*` for the little pearl tips of the tentacles and the top pearl: the game draws `glow`
  materials unlit, so they read as bioluminescent.
- The canopy itself is opaque; the game's toon shading doesn't do translucency. Paint the "translucent" look into the
  atlas (a lighter inner gradient, soft highlights).
- The pivot is at the grip. Write the grip point to `prop_mount.json`.
- She holds it in one paw over the shoulder when walking, and raises it to cast.

## Technical
- A neutral A-pose (arms about 40° from vertical), facing **−Y**, standing on z = 0, centred.
- **≤ 30k triangles** for the body, **≤ 6k** for the parasol. One material with **one 2048² painted atlas** for the
  body, and a small one for the parasol. No fur strands or cards.
- **The toon band**: keep the face finely tessellated where it curves fast. Render `preview/toon-check.png` (a hard ramp,
  a sun about 50° up at yaw ±0.6).
- **Rig-ready**:
  - eyeballs as separate spheres;
  - loops around the lids and mouth;
  - the ears, tail, sleeves, robe hem panels and the back bow as separate pieces with bend loops;
  - enough loops at the joints;
  - hidden surface deleted;
  - `joints.json` with chewy-b's joint names.
- Output: `public/models/stella-toy.glb`.
- **Previews** with `--character`:
  - the turnaround, the head, `portrait.png`, and **a front-facing portrait** (`portrait-front.png`, the owner asks
    for one at the model gate);
  - `game.png` from both yaws;
  - the same-scale comparisons: `cmp-head`, `cmp-front`, `cmp-side`, `cmp-back`, `cmp-eyes`, and `cmp-cast` next to
    chewy-b and Moka's model (`public/rigs/` or `public/models/`: find Moka's).

## Done when (phase 1)
- The comparisons read as the same character as `sheet.png`, within about 5% on your measured targets.
- She's appealing in `portrait.png` and `portrait-front.png`, in the same finish as the other heroes.
- At 45° her face, **the blue eyes**, the long ears, the scalloped periwinkle robe and the pink bow read, and nothing
  reads as spikes or flat cards.
- ≤ 30k triangles, one atlas, on the ground, facing −Y, no warnings; `joints.json`, `measurements.json`,
  `prop_mount.json` and the parasol GLB written.
