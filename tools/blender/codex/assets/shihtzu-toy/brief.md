# Asset brief: shihtzu-toy (the Toybox Shih Tzu dark knight; phase 1, the model)

## What it is
The **Shih Tzu Knight** (a working name) is a **male Shih Tzu dark knight**, the game's fourth playable hero. He fights
with a dog-toy flail and casts spooky-cute dark dog magic. The game is cozy, so he's solemn and dramatic but sweet.
The owner picked **Option B, "Gloomhowl Warlock-Knight"**: `refs/sheet.png` is **the blueprint**, so match it closely.
He belongs to the same toy line as:
- the samurai Chewy (`refs/chewy-samurai-sheet-E.png`, `refs/sheet-B.png`, `refs/chewy-toy-game-crop.png`);
- Poe (`refs/poe-sheet-D.png`);
- Moka (`refs/moka-sheet.png`);
- Shadow (`refs/shadow-sheet-A.png`);
- the cast lineup (`refs/cast-lineup.png`).

This task has two phases:
- **Phase 1 (now)**: the model in a neutral A-pose, until the director rates it 9/10 and the owner signs off.
- **Phase 2 (later)**: rigging to the 37-bone biped hero contract.
Build rig-ready, but don't rig yet.

## Measure the sheet first
**Measure on the sheet yourself**, scripted, with ruled crops or colour extents, not by eye. Write `measurements.json`
with the targets below as fractions of W (the head width at the cheeks, excluding the ear locks) and H (crown to chin,
excluding the topknot). Show your measurements next to the model's in every report. Use the turnaround and the head
close-ups; if they disagree, follow the head close-ups for the face and the turnaround for the body, and say so.

Targets to measure and match:
- **Height**: the crown at the same height as chewy-b.glb's crown, about 2.4 heads. The topknot is extra, about
  +0.12 m.
- **Head**:
  - the W:H ratio and outline: a wide, soft head with a full **"chrysanthemum" face**;
  - white fur puffs radiating round the face;
  - a white blaze up the forehead to the topknot;
  - **a moustache and beard puff** under the nose.
- **Eyes**:
  - centres, opening size, iris and pupil as on the sheet, with warm amber-brown irises (#c88a3a) and the toy-line
    construction (white crescents, two catchlights, a thick upper lash line);
  - they **face about 30° outward, set into the head's curve**;
  - **the iris bottom is at or above the nose top**;
  - the face fluff never covers them.
- **Nose and muzzle**:
  - a small, wide black nose button high on a short muzzle buried in fluff;
  - the mouth a small soft line under the moustache.
- **Ears**:
  - the long drapey **ear locks**, big soft black masses hanging past the jaw to about the shoulders;
  - thick, clay-like volumes in a few big locks, never strands or thin cards. Check them from both 45° yaws.
- **Topknot**: a white puff tied with a plum (#4a2a4a) band and a silver paw bead, standing up from the crown.
- **The coat**: black (#2c2a30) and white (#f4f0ea) masses, as on the sheet. Paint the true colours; the game corrects dark
  fur at runtime.
- **The tail**: a big **plumed curl** over the back, black with a white tip.
- **The body**: compact, with black mitten paws, white-and-black leg fluff, and boots.
- **The costume**:
  - a plum (#4a2a4a) hooded tabard and cloak over light armour (#34303e);
  - silver (#c8ccd8) trim: shoulder pieces, gauntlet cuffs, boot caps;
  - a belt with a big silver paw buckle;
  - a **spell tome** on the hip, plum with a paw emblem (a separate object, `tome`);
  - **teal ghostlight** (#5ce0c0) rune stitches and gems on the tabard hem;
  - crescent moons on the tabard panels;
  - the hood **down** behind the neck.
  - Measure each piece's heights and widths as fractions of the crown height.

## The flail (a separate prop)
**`public/models/shihtzu-flail.glb`**, as on the sheet's callout:
- a chew-bone handle with a paw mark;
- a braided plum rope-toy chain about 0.6 m long, as a chain of about 6 chunky links or braided segments, so the game can
  swing it;
- a black **squeaky spiky-ball** head, about 0.22 m across, with soft rounded nubs and **teal glowing paw marks**. Name a
  material `*glow*` for the glow.
- The pivot is at the grip. Name the head `flail_head` and the rope segments `flail_link_*`, each pivoting at its joint, so
  the game can simulate the swing.
- Write the paw grip position to `prop_mount.json`.

## Technical
- A neutral A-pose (arms about 40° from vertical if the body width needs it), facing **−Y**, standing on z = 0, centred.
- **≤ 30k triangles** (the head, face and fur may take up to half). One material with **one 2048² painted atlas**, plus
  the flail's own small material. No fur strands or cards.
- **The game's toon band**: shading is a hard band (`smoothstep(-0.04, 0.34, N·L)`). Keep the face finely tessellated where
  it curves fast. Render `preview/toon-check.png`.
- **Rig-ready**:
  - eyeballs as separate spheres;
  - loops around the lids and mouth corners;
  - the ear locks, topknot, tail, cloak and tabard panels as separate pieces with bend loops;
  - enough loops at the joints;
  - hidden surface under clothing deleted;
  - `joints.json` written with chewy-b's joint names (`tools/blender/codex/assets/chewy-b/joints-round13.json`).
- Output: `public/models/shihtzu-toy.glb`.
- Previews with `--character`:
  - the turnaround, head, `portrait.png`, and `game.png` from both 45° yaws;
  - same-scale comparisons against the sheet: `cmp-head.png` (front and 3/4), `cmp-front.png`, `cmp-side.png`,
    `cmp-back.png`, `cmp-eyes.png`, and `cmp-cast.png` next to chewy-b.

## Done when (phase 1)
- The comparisons read as the same character as `sheet.png`, within about 5% on your measured targets.
- He's appealing and polished in `portrait.png`, in the same finish as the cast.
- At 45° the face (eyes and white muzzle) reads on the dark coat, and the ear locks and cloak never read as spikes or flat
  cards.
- ≤ 30k triangles, one atlas, stands on the ground, faces −Y, no preview warnings, and `joints.json`,
  `measurements.json` and the flail GLB written.
