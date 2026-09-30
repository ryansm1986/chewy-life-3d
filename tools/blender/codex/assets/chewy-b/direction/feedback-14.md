# Phase 2: rig Chewy for the game

The owner approved the model (round 13). Now **rig it** so the game can animate it. **The approved look must not change**: at
rest, with every bone at rest, the character must look exactly like round 13 from every view.

## Deliverables
- `rig_chewy-b.py`: builds on your model build (import or call `build_chewy-b.py`, or extend it) and adds everything below,
  deterministically.
- `chewy-b_rig.blend`: the rigged character. **Apply every modifier except the Armature one** on every mesh; the exporter
  reads the mesh data plus vertex groups.
- A **pose test sheet** `preview/poses.png` (see the tests below) and `preview/face.png`: blink, happy squint, mouth open,
  mouth open + happy.
- Run the game exporter on your rig and fix everything it warns about:
  `blender --background {{TASK_DIR}}/chewy-b_rig.blend --python {{REPO}}/tools/blender/codex/hero_export.py -- --out {{TASK_DIR}}/export --name chewy_b --height 1.2`
  It must finish with **no warnings**. Put its final `HERO_EXPORT` line in the report.

## How the game uses the rig (this defines everything)
- The exporter keeps only each bone's **head position** (rest pose). In the game each bone becomes a joint at that
  point with **no rotation**. The animation system rotates joints **about axes parallel to the world axes**, pivoting at
  the joint.
- Axis mapping, Blender → game:
  - a game rotation about X by θ = a Blender rotation about **world +X** by θ;
  - about Y (up) = about Blender world **+Z** by θ;
  - about Z = about Blender world **−Y** by θ.
- Test your weights with exactly these rotations. A simple way: give every pose bone rotation mode 'XYZ' and roll so
  its local axes match the world axes, or apply world-axis rotations about the bone head in a test script.
- Joints the game drives (so they must deform well):
  - `spine` (the body: bob, lean ±0.35 X, twist ±0.4 Y);
  - `head` (nod ±0.3 X, turn ±0.45 Y, tilt ±0.15 Z);
  - `upperarm_L/R` (swing ±1.2 X; raised out to ±1.4 Z; attacks swing the right arm up to −2.4 X);
  - `thigh_L/R` (walk and run ±1.0 X);
  - `tail1` (wag ±0.7 about Y, droop −0.3 X);
  - `ear_L/R` (±0.35 X, ±0.3 Z) and `earTip_L/R` (from **−1.05 X**, the flap flipping up and back, to **+0.6 X**, folding
    tighter);
  - `jaw` (0 to **+0.42 X**, mouth open);
  - `lidU_L/R` (0 to **+1.22 X**, fully closed; +0.4 X = happy squint);
  - `lidD_L/R` (the game **always** holds these at **−0.1 X**, and at **−0.45 X** in a happy squint);
  - `lip_L/R` (moved up to 7 mm up and 4 mm back on a smile).
  - forearm, hand, shin, foot, neck, chest, hips and tail2–4 just follow their parents, but must exist and carry weights
    where they belong.

## The skeleton: exactly these 37 bones, names and parents
- `root` (at the ground, between the feet) → `hips` (pelvis centre) → `spine` (lower belly) → `chest` (mid chest) → `neck`
  (top of the collar) → `head`.
  - **`head` sits at the base of the skull**, the pivot for nodding: at about chin height, at the back of the neck.
    **Not** the head's centre. (`joints.json` puts it at 0.938, which is the centre; move it down.)
- Under `head`:
  - `jaw`: the hinge line, **inside** the head, at the mouth-corner height, about 0.22 W behind the smile.
  - `eye_L/R`, `lidU_L/R`, `lidD_L/R`: all at each eyeball's centre.
  - `brow_L/R`: above the eyes (not animated, but must exist).
  - `lip_L/R`: at the mouth corners.
  - `ear_L/R`: at each ear's base on the skull.
- `earTip_L/R` under `ear_L/R`, at the **fold line**.
- `upperarm_L/R` under `chest` (the shoulder joints) → `forearm_L/R` (elbows) → `hand_L/R` (wrists).
- `thigh_L/R` under `hips` (hip joints) → `shin_L/R` (knees) → `foot_L/R` (ankles).
- `tail1` under `hips` (the tail root) → `tail2` → `tail3` → `tail4`, along the tail.
- `_L` = the character's left = **+X**. No other bones (or say which extras you need).

## New geometry the face needs (keep the rest look identical)
1. **Upper eyelids**, one per eye:
   - a thin skin-coloured shell (coat #8a5634) just outside the eyeball (radius + ~2–3 mm), covering about the upper
     half of the eye;
   - its lower edge painted with the dark lash line (#1e120c), so a closed eye shows a lash curve;
   - 100% weighted to `lidU_L/R`.
   - **At rest (0) it must be completely hidden**, tucked up inside the head above the eye opening, invisible from
     every view including the 45° top-down game camera.
   - At **+1.22 X** it must **completely cover the eye opening**, meeting the lower lid with no gap.
   - At +0.4 it covers the top ~third (a happy squint).
2. **Lower eyelids**: the same idea from below, 100% weighted to `lidD_L/R`.
   - At the game's neutral (**−0.1**) they're hidden or just at the lower eye edge, and the eye looks exactly like round 13.
   - At −0.45 they rise to cover the bottom ~quarter (with the upper at +0.4: happy crescent eyes, "^ ^").
3. **Mouth**:
   - Cut the head surface along the painted **smile line**, a lip parting following the "ω" smile.
   - Add a **mouth cavity** behind it: a closed pocket inside the head, dark red-brown #4a1c1c, with a pink tongue
     #e07a86 resting on its floor.
   - Weight the **lower jaw region** (the lower lip band, the chin, the cream patch, down to where the chin meets the
     neck) to `jaw`, with a smooth falloff into the cheeks, so opening the jaw pulls the lower lip down and away from the
     upper lip.
   - At rest the mouth is closed and looks exactly like now: just the smile line, with no visible seam or cavity from any
     view.
   - At **+0.42** it's a cute open smile (a rounded "D"), showing the cavity and tongue, with **no holes into the head
     interior and no tearing**. No teeth needed (toy style).
   - Weight the mouth corners to `lip_L/R` so a small smile lift reads.
4. Eyeballs: 100% `eye_L/R` (they'll be able to aim later).

## Weights (quality bar: a premium game character)
- ≤ 4 influences per vertex, normalized, smooth falloffs across the elbows, knees, shoulders, hips and neck.
- The head, ears and paws are rigid where they should be.
- **Costume**:
  - the gi body and skirt follow the spine and hips, with the skirt panels partly following the thighs so a leg swing
    doesn't punch through;
  - sleeves follow the upper arms;
  - the sash and knot follow the hips, with the knot tails loosely following the thigh on that side;
  - the kerchief follows the neck and chest;
  - the wraps follow the forearms;
  - pants follow the thighs and shins, with a soft seat.
- Weld or merge intersecting islands where needed so a bend never opens a gap.
- Ears: `ear_*` for the whole ear; `earTip_*` for the flap beyond the fold, with a smooth blend across the fold. At +0.6
  the flap must not pass into the skull; at −1.05 it flips up cleanly.

## Tests (render them into `preview/poses.png`, 45° game-ish camera plus front view; look at every one yourself)
Rest; walk extreme (thighs +0.8/−0.8, upper arms −0.6/+0.6); run lean (spine +0.3); arms raised (upper arms Z ±1.3); attack
(right upper arm −2.4 X); head turned (+0.45 Y) and nodded (+0.3 X); ear tips −1.05 and +0.6; tail wag ±0.7; plus the face
sheet (blink 1.22; happy squint lidU 0.4 + lidD −0.45; jaw 0.42; jaw 0.42 + happy).
Fix any tearing, candy-wrapper twist, costume poke-through larger than about 1 cm, gaps, or a lid or mouth that shows at rest.
Keep the triangle count ≤ 34k including the new lids and mouth.
