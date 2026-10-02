# Asset brief: rosie-toy (the Toybox Rosie model, phase 1: the model)

## What it is
**Rosie**, Chewy's best friend and the village's little baker (a young human girl). The owner picked design **Option A,
"Sweetheart"**: the attached `sheet.png` is **the blueprint**, so match it closely. She's the same toy line as the new
Chewy (attached `sheet-B.png`, and `chewy-toy-game-crop.png` in game), whom you modelled earlier as task `chewy-b`. Match
his finish, construction and quality bar. `rosie-current-crop.png` is her current game model, **not this**: its small
sleepy eyes, adult proportions and thin limbs are exactly what's being replaced.

This task has two phases:
- **Phase 1 (now)**: the model in a neutral A-pose, until the director rates it 9/10 and the owner signs off.
- **Phase 2 (later)**: rigging to the same 37-bone game contract as Chewy.
Build rig-ready, but don't rig yet.

## Measured targets (taken from `sheet.png`; build your own same-scale comparisons to check them)
**Units.** W = the face width at the cheeks, skin only (no ears, no hair). Heights on the face are measured **up from the
bottom of the chin** in units of W. x is measured from the face midline. (On the sheet's HEAD FRONT close-up W ≈ 215 px,
the chin is at y ≈ 835, and the midline is at x ≈ 190.)

**Overall** (front view)
- Total height to the **top of the hair: 1.25 m**. The bow adds about 0.10 m above that. The feet are at z = 0.
- The chin is at **0.72 m**. W ≈ **0.44 m**. About 2.4 heads tall (hair top to chin : chin to ground ≈ 0.53 : 0.72).

**Face** (a toddler face: wide, chubby lower cheeks, a broad rounded chin, features low on the face)
- **Outline**: widest at about 0.25 W above the chin, so the cheeks bulge gently. The jaw is round and wide (the width
  at the chin level ≈ 0.75 W). The skull crown under the hair is about 1.02 W above the chin.
- **Eyes**: the dominant feature. Match the construction of sheet-B and Chewy's final eyes (round 13):
  - centres at x = ±0.27 W, **0.34 W above the chin**;
  - opening **0.28 W wide × 0.27 W tall**, a rounded egg;
  - a warm-white sclera #fff9f2, with white showing as a crescent on the outer side and a thin crescent at the bottom;
  - iris **dark warm brown #7a4424**, lighter amber-brown toward the bottom (#b0703a), about 68% of the opening width ×
    90% of its height, tucked toward the nose and under the lash;
  - pupil #1a0e08, about 70% × 76% of the iris;
  - two catchlights (a big one at the upper-left of the pupil, a small one below it);
  - a **thick dark upper lash line** #2a1a14 with **3 small flicks** at the outer corner (girl lashes, as on the sheet),
    and a soft thin lower line on the outer half.
- **Brows**: thin, soft brown arcs #6b3a22, 0.15 W long, centred over each eye at **0.56 W above the chin**. Mostly
  hidden just under the bangs' edge.
- **Nose**: a tiny rounded button, 0.09 W wide, peach-pink #f4a88a (a touch darker than the skin), at 0.26 W above the
  chin, centred.
- **Mouth**: a small gentle closed smile line #7a3a2a, **0.17 W wide at 0.15 W above the chin**, with curled-up corners.
- **Blush**: two soft pink ovals #ff9ab0, 0.14 W × 0.08 W, centred at x = ±0.31 W, 0.16 W above the chin. Painted
  with soft edges.
- **Ears**: small, round skin ears at x = ±0.52 W, spanning 0.28 to 0.42 W above the chin, partly tucked into the hair.
- **Skin**: #ffe4d2, with soft painted shading (a slightly deeper peach #f5cdb6 under the jaw and around the ears).

**Hair**: the signature. A curly bob of **big, smooth, rounded lobes**, like the Toybox Chewy's ears and like sculpted
vinyl: no strands, no fine curls.
- **Colour**: #6b3a22, with **#8e5634** sheen on the top of each lobe and deeper #4e2a18 in the gaps between lobes.
- **Outer width ≈ 1.6 W** at the widest (around eye level). It reaches down to the chin level at the sides, and the
  lowest lobes hang about 0.1 W below the chin behind the ears.
- **Bangs**: one big smooth rounded bang mass across the forehead, its lower edge at about **0.58 W above the chin**
  (just above the brows), with a gentle wave and two smaller side lobes framing the face down to the cheeks.
- **Lobes**: about 14–18 rounded lobes, 0.25–0.4 W across, around the sides and back. The side view shows a big
  rounded volume at the back: head depth including hair ≈ 1.5 W. The back view is a full rounded mass of lobes down to
  the nape. **Every lobe is a real volume**, so nothing reads as a thin card from any angle, especially the 45° game
  camera.
- **Bow**: a big red bow **#e8364a** on top of the head, centred. It's **0.8 W wide × 0.3 W tall**: two rounded loops
  with a centre knot and two short tails hidden in the hair, sitting on the crown about 1.05–1.35 W above the chin.
  Chunky, with soft folds.

**Body and costume** (heights in metres above the ground)
- **Neck**: hidden. The head sits right on the collar at 0.67 m.
- **Collar**: a white rounded Peter Pan collar #fff6f0, with two rounded flaps meeting at the front, about 0.08 m deep.
  A **strawberry brooch** at the centre, at 0.58 m: a red berry #e8364a with white seed dots and green leaves #568d4a,
  0.07 m tall.
- **Dress**: pink #ff8fb0.
  - The bodice runs from 0.67 m to the waist at 0.51 m.
  - An **A-line skirt** flares to the hem at 0.32 m; the hem is about **0.60 m wide**, with soft big folds.
  - A **white scalloped trim** #fff6f0 at the hem, 0.05–0.06 m tall, with about 9 rounded scallops around the front
    half.
  - Slight lighter pink #ffa8c4 on the top planes.
- **Sleeves**: short **puffy sleeves**, rounded balloons about 0.14 m across at the shoulders (x ≈ ±0.28 m), with a
  gathered cuff.
- **Arms**: short and chubby, hanging about 20° out; skin #ffe4d2. **Hands** are mittens with a small thumb, about
  0.09 m, at 0.40–0.47 m high, x ≈ ±0.33 m.
- **Legs**: short and chubby, skin, 0.11 m thick, centres at x = ±0.10 m, visible from the hem down to the socks.
- **Socks**: white #fff6f0, from 0.11 to 0.20 m, with a slightly wider folded cuff at the top.
- **Shoes**: red Mary-Janes **#d8443a**, 0–0.13 m tall, about 0.19 m wide × 0.22 m long, with rounded toes, a strap across
  the instep with a small button, a slightly darker sole (#b8302a) and a soft highlight.
- **Palette** (from the sheet): skin #FFE4D2, hair #6B3A22 / #8E5634, eyes #7A4424, blush #FF9AB0, dress #FF8FB0, white
  #FFF6F0, bow #E8364A, shoes #D8443A, leaf #568D4A.

## Technical
- A neutral A-pose (arms about 20–30° out, as on the sheet), facing **−Y**, standing on z = 0, centred.
- **≤ 30k triangles** (the head, hair and eyes may take up to 60%). One material with **one 2048² painted atlas**. No
  hair strands.
- Your technique from `chewy-b` worked well: parametric quad surfaces / subdivision, clean rounded forms, a
  deterministic build script. Reuse your own approach and helpers (read `D:/projects/chewy-life-3d/tools/blender/codex/assets/chewy-b/`
  for the chewy-b scripts if useful, read-only).
- **Rig-ready**:
  - eyeballs as separate spheres;
  - edge loops around the eyelids and the mouth corners;
  - the hair as its own mesh, with lobes that can follow the head rigidly;
  - the skirt with enough loops to follow the thighs;
  - loops at the shoulders, elbows, hips and knees;
  - hidden body surface under the dress deleted.
  Record the joint positions in `joints.json` in metres, using the same keys as chewy-b's.
- Output: `public/models/rosie-toy.glb`.
- Preview **with `--character`**:
  `blender --background --factory-startup --python D:/projects/chewy-life-3d/tools/blender/codex/preview.py -- --in D:/projects/chewy-life-3d/public/models/rosie-toy.glb --out D:/projects/chewy-life-3d/tools/blender/work/codex/rosie-toy/preview --character`
  - Also render `portrait.png` (3/4 front, head and shoulders, soft studio light).
  - Build the **same-scale comparisons against `sheet.png` yourself**, as you did for chewy-b: `preview/cmp-head.png`
    (front and 3/4), `cmp-side.png`, `cmp-back.png`, `cmp-eyes.png` and `comparison.png` (the full turnaround
    against the sheet's row).
  - Also render a 45°-down game-camera head shot from both yaws (±45°).

## Done when (phase 1)
- The turnaround and head comparisons read as the same character as `sheet.png`, within about 5% on the targets above.
- `portrait.png` looks appealing and polished, in the same finish as the Toybox Chewy.
- From the 45° game camera, the face (big eyes, blush), the bow and the curly hair silhouette read clearly from both
  yaws, and no hair lobe reads as a spike or card.
- ≤ 30k triangles, one atlas, stands on the ground, faces −Y, no preview warnings, and `joints.json` written.

## Time
This is a hero-quality character. Up to about 60 minutes of wall time for a strong, complete first pass: the whole
character, textured and previewed.
