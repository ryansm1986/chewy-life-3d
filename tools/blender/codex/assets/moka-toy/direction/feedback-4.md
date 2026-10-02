# Phase 2: rig Moka for the game (the owner signed off on the model)

The owner approved your round-3 model ("Looks good, rig her"). Now **rig it** so the game can animate her. **The approved look must
not change**: with every bone at rest she must look exactly like round 3 from every view.

She's a **playable hero**: she walks, runs, swings and points a staff, and casts spells with big arm moves. The player switches
between her and Chewy. The game builds her with the same baked-hero loader as the Toybox Chewy and the Toybox Rosie, so she uses
the **37-bone hero contract** and the Animator (`src/actors/animator.js`: `poseBiped`, `face`, `secondary`, and the action table
at the top). Read that file once; it's the ground truth for every value below.

Two rigs you can learn from: Rosie's `D:/projects/chewy-life-3d/tools/blender/work/codex/rosie-opus/rig_rosie-opus.py` and
`rig_tests.py` (the same contract, a girl in a skirt, and the latest), and Shadow's
`tools/blender/codex/assets/shadow-toy/rig_shadow-toy.py`. Read Rosie's direction rounds `rosie-opus/feedback-4.md` and
`feedback-5.md` for what the director checks.

## Deliverables
- `rig_moka-toy.py`: builds on `build_moka-toy.py` (import or extend it, deterministically) and adds everything below.
- `moka-toy_rig.blend`: the rigged character. **Apply every modifier except the Armature one** on every mesh.
- `preview/poses.png`, `preview/face.png` and `preview/toon-check.png` (the tests below).
- Run the game exporter and fix everything it warns about (it must end with **no warnings**):
  `blender --background D:/projects/chewy-life-3d/tools/blender/work/codex/moka-toy/moka-toy_rig.blend --python D:/projects/chewy-life-3d/tools/blender/codex/hero_export.py -- --out D:/projects/chewy-life-3d/tools/blender/work/codex/moka-toy/export --name moka_toy --height 1.39`
  Put its final `HERO_EXPORT` line in your report. The director installs the export into the game.
- Don't touch `public/models/moka-toy.glb` (the approved model). Keep every file inside your task folder.

## How the game uses the rig
- The exporter keeps only each bone's **head position** (rest pose). In the game each bone becomes a joint at that point with **no
  rotation**, and the Animator rotates joints **about axes parallel to the world axes**, pivoting at the joint.
- Axis mapping, Blender → game:
  - a game rotation about X by θ = a Blender rotation about **world +X**;
  - about Y (up) = about Blender world **+Z**;
  - about Z = about Blender world **−Y**.
  Test your weights with exactly these rotations about each bone's head.
- Joints the game drives:
  - `spine` (the body: bob, lean up to +0.35 X, twist ±0.4 Y);
  - `head` (nod ±0.3 X, turn ±0.45 Y, tilt ±0.15 Z);
  - `upperarm_L/R`: walk swing ±0.55 X, run ±0.95 X.
    - **The casting and staff actions reach far**: both arms raised forward and up to **−2.95 X** (right) and −2.5 X (left);
      a right-arm thrust to about −1.6 X; the right arm lifted out about +1.05 Z with −1.35 X; arms swept out about ±1.35 Z.
    - The wave (+2.5 Z on the right arm) and the happy hop (±2.4 Z) raise the arms inward-up. If her hands vanish into her ears
      or head there, say so: the game has a per-model switch for that, so don't distort the rig.
  - `thigh_L/R`: walk ±0.62 X, run up to ±0.97 X.
  - `jaw`: 0 to **+0.42 X** (talking flaps it at uneven in-between values).
  - `lidU_L/R`: 0 to **+1.22 X** (fully closed); **+0.488 X** = the happy squint.
  - `lidD_L/R`: the game **always** holds these at **−0.10 X**, and at **−0.24 X** in the happy squint.
  - `lip_L/R`: up to 7 mm up and 4 mm back on a smile (in game space); her neutral holds them at 40% of that.
  - **Ears (hanging spaniel ears)**: `ear_L/R` swing on a spring up to about **±0.35 X** and **±0.10 Z**. `earTip_L/R` swing up to
    about **±0.6 X**: both signs, because the game may mount the hanging ears flipped.
  - `tail1` wags up to **±0.7 Y** and droops −0.15 X while walking; `tail2–4` follow.
  - forearm, hand, shin, foot, neck, chest and hips follow their parents, but must exist and carry weights where they belong.

## The skeleton: exactly these 37 bones, names and parents
- `root` (on the ground, between the feet) → `hips` (pelvis centre) → `spine` (lower belly) → `chest` (mid chest) → `neck` (top of
  the collar) → `head`.
  - **`head` sits at the base of the skull**, the nod pivot: about chin height, at the back of the neck. Not the head's centre.
- Under `head`:
  - `jaw`: the hinge inside the head, at mouth-corner height, behind the smile;
  - `eye_L/R`, `lidU_L/R`, `lidD_L/R`: at each eyeball's centre (the lid pivots may move if a rigid lid can't cover the opening
    otherwise, as on Rosie);
  - `brow_L/R`: above the eyes (must exist, not animated);
  - `lip_L/R`: at the mouth corners;
  - `ear_L/R`: **at each ear's root, under the brim** where the column leaves the head.
- `earTip_L/R` under `ear_L/R`, about **halfway down the ear**, just above the ribbon. The lower half of the ear swings on it.
- `upperarm_L/R` under `chest` (the shoulders) → `forearm_L/R` (elbows) → `hand_L/R` (wrists).
- `thigh_L/R` under `hips` (hip joints) → `shin_L/R` (knees) → `foot_L/R` (ankles). Lower the thigh pivots below the pelvis
  centre if the robe needs it, as Rosie's did.
- `tail1` under `hips`, **at the tail root in the robe's back split** → `tail2` → `tail3` → `tail4`, along the curl tail.
- `_L` = her left = **+X**. No other bones.

## New geometry the face needs (keep the rest look identical)
1. **Upper eyelids**: a thin shell in her face fur colour (matched under the same light to the skin around the eye), just outside
   each eyeball, 100% `lidU_*`.
   - **At rest (0) completely hidden** from every view, including the 45° game camera.
   - At **+1.22** it covers the opening fully, and the painted lash band too, so a closed eye reads as **fur with one soft ∪ lash
     curve plus her outer lashes**, never a ring or an outlined patch.
   - At **+0.488** it covers the top ~25–30%, with the edge level or a little higher at the outer corner, never sloping down
     outward.
   - Keep its dark lash strip thin: about her open-eye lash width at the centre, tapering to the corners.
2. **Lower eyelids**, 100% `lidD_*`: hidden or exactly at the rim at −0.10. At **−0.24** they rise about 30% at the centre (20% at
   the corners) with an upward-arched edge, giving happy crescent eyes.
3. **Mouth**:
   - Cut along the painted "ω" smile, with a closed **mouth cavity** behind it (dark red-brown #4a1c1c) and a pink tongue (#e07a86).
   - Weight the lower lip, chin and under-jaw to `jaw`, falling smoothly into the cheeks and muzzle sides. The muzzle top and nose
     stay on `head`.
   - At rest the mouth is closed and invisible (just the smile line).
   - At **+0.42** it's a cute open smile, a soft "D" wider than tall, showing the cavity and tongue, with no holes or tearing.
   - At 0.1–0.2 (talking) it's a small open smile, not a crack.
   - **The corners stay sealed at every value**, with and without the lip offset. Weight them to `lip_*`.
4. **Eyeballs**: 100% `eye_*`. Nothing pokes through the skin at rest, blink or squint.

## Weights
- ≤ 4 influences per vertex, normalized, with smooth falloffs at the shoulders, elbows, hips, knees and neck.
- **Rigid to `head`**: the head skin, the hat (cone, band, glasses, the moon and its loop) and the topknot. The hat must never
  stretch or tilt off the head.
- **Ears**:
  - The upper half is on `ear_*`, blending to `earTip_*` across the ribbon area; the ribbon and bow go with the lower half.
  - The root blends into `head` under the brim, so a ±0.35 swing doesn't tear the ear away from the head or push it through the
    brim.
  - Lumps stay rigid shapes: no candy-wrapping inside the column.
- **Costume**:
  - inner kimono and sash: `hips` → `spine` → `chest`;
  - bell sleeves on `upperarm_*`, blending to `chest` at the armhole. They must hold up at −2.95 X and ±1.35 Z.
  - **the outer robe and inner skirt** follow `hips`, with the front and back panels partly following the thighs (about 25–40% near
    the hem), so a walk and a run never push a leg through. The open front edges and the back split stay tidy.
  - **stole and tassels** on `chest`, with the tassels a little on `spine`;
  - **satchel** rigid on `hips`, a little on `thigh_L` at its bottom so a stride doesn't punch through; the strap blends `chest` →
    `hips`;
  - **duck charm** rigid on `hips`;
  - legs and feet on `thigh` / `shin` / `foot`, with the feet rigid; the mitten paws rigid on `hand_*`.
- **Tail** lobes on `tail1–tail3`. Check the wag (±0.7 Y) doesn't tear the robe's back split; the tail may poke out, but the robe
  mustn't deform around it.
- Weld or merge intersecting islands so a bend never opens a gap.

## Staff grip (the game attaches her staff to the right hand)
- In `joints-rig.json` report:
  - `hand_R`'s head position;
  - the **palm centre** of the closed right mitten;
  - the **grip axis** (the direction a staff shaft passes through the fist);
  all in **game axes** (X = +X, Y = up, Z = −Blender Y). Do the same for the left hand.
- The game will place a 1.1 m staff along that grip. Render one test with a simple cylinder (r 0.018 m) along the grip axis in
  `poses.png`, so the fist visibly closes around it.

## Tests (render into `preview/poses.png`, 45° game camera plus front view; look at every one yourself)
- **Rest**.
- **Walk extreme**: thighs ±0.62, upper arms ∓0.55.
- **Run**: thighs ±0.97, upper arms ∓0.95, spine +0.26 X.
- **Cast overhead**: upper arms R −2.95 X, L −2.5 X.
- **Staff thrust**: R −1.6 X.
- **Arms out**: ±1.35 Z.
- **Wave**: R +2.5 Z, −0.3 X.
- **Happy hop**: R +2.4 Z, L −2.4 Z, both −0.2 X.
- **Head turned** +0.45 Y and nodded +0.3 X.
- **Ears**: +0.35 X / −0.35 X, with the tips +0.6 / −0.6.
- **Tail wag**: ±0.7 Y.
- **The staff grip test**.
- **The face sheet** `preview/face.png`, at the front, both game yaws and the 3/4: rest; blink 1.22; happy (+0.488 / −0.24);
  jaw 0.15; jaw 0.42; jaw 0.42 + happy + lips.
- **`preview/toon-check.png`**:
  - the face and body under a hard two-tone ramp (Shader to RGB → Constant ColorRamp at about 0.1–0.15; a sun about 50° up, at
    yaw ±0.6) for rest, blink and happy;
  - the light/shade edge must be a smooth curve on the face, ears and limbs;
  - if it zigzags, refine the face triangulation where the surface curves fast, as Rosie's rig did; exact normals alone don't fix
    it.
- Fix any tearing, candy-wrapper twist, costume poke-through larger than about 1 cm, gaps, or a lid or mouth that shows at rest.
  Report any **ear–arm or ear–head intersections** in the walk and the casting poses. The ears hang right beside the upper arms.
- Keep **≤ 34k triangles**, including the lids and mouth.

Report as before:
- a table of the bones with head positions;
- the weights summary;
- the staff grip numbers;
- the triangle count;
- the tests;
- the `HERO_EXPORT` line;
- known issues.
Then stop.
