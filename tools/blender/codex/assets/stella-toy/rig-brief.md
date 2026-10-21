# Phase 2: rig Stella for the game

The owner approved the model (round 4, GLB MD5 `abe857f5…`). Now **rig it** so the game can animate it. **The approved
look must not change**: at rest, with every bone at rest, Stella must look exactly like round 4 from every view.
Floofy's and Foosy's rigs are the closest finished examples:
- `tools/blender/work/codex/golden-toy/rig_golden-toy.py`, `rig_tests.py`, `run_rig_round.sh`;
- `tools/blender/work/codex/shihtzu-toy/`.
Read them; don't modify them.

## Deliverables
- `rig_stella-toy.py`: builds on your model build (import or call `build_stella-toy.py`, or extend it) and adds
  everything below, deterministically.
- `stella-toy_rig.blend`: the rigged character. **Apply every modifier except the Armature one** on every mesh; the
  exporter reads the mesh data plus vertex groups.
- A **pose test sheet** `preview/poses.png` (see the tests below) and `preview/face.png`: blink, happy squint, mouth
  open, mouth open + happy.
- Run the game exporter on your rig and fix everything it warns about:
  `blender --background D:/projects/chewy-life-3d/tools/blender/work/codex/stella-toy/stella-toy_rig.blend --python D:/projects/chewy-life-3d/tools/blender/codex/hero_export.py -- --out D:/projects/chewy-life-3d/tools/blender/work/codex/stella-toy/export --name stella_toy --height 1.24`
  It must finish with **no warnings**. Put its final `HERO_EXPORT` line in the report. (`--height` only writes metadata.)
- `prop_mount.rig.json`: the parasol's grip relative to `hand_R`, in the game's axes, like Foosy's
  `prop_mount.rig.json`, so the parasol can sit in her right paw. Also suggest a **carry pose**: the parasol resting
  over her right shoulder when she walks, as an offset and rotation relative to `hand_R` or `chest`.

## How the game uses the rig (this defines everything)
- The exporter keeps only each bone's **head position** (rest pose). In the game each bone becomes a joint at that
  point with **no rotation**. The animation system rotates joints **about axes parallel to the world axes**, pivoting at
  the joint.
- **Axis mapping**, Blender → game:
  - a game rotation about X by θ = a Blender rotation about **world +X** by θ;
  - about Y (up) = about Blender world **+Z** by θ;
  - about Z = about Blender world **−Y** by θ.
  Test your weights with exactly these rotations.
- **Joints the game drives** (they must deform well):
  - `spine`: the body; bob, lean ±0.35 X, twist ±0.4 Y.
  - `head`: nod ±0.3 X, turn ±0.45 Y, tilt ±0.15 Z.
  - `upperarm_L/R`: swing ±1.2 X; raised out to ±1.4 Z; attacks and casts swing the right arm up to −2.4 X.
  - `thigh_L/R`: walk and run ±1.0 X.
  - `tail1`: wag ±0.7 about Y, droop −0.3 X.
  - `ear_L/R` (±0.35 X, ±0.3 Z) and `earTip_L/R`: from **−1.05 X** (the flap flipping up and back) to **+0.6 X**
    (folding tighter).
  - `jaw`: 0 to **+0.42 X**, mouth open.
  - `lidU_L/R`: 0 to **+1.22 X**, fully closed. **+0.488 X** is the happy squint (the game's 0.4 × 1.22).
  - `lidD_L/R`: the game **always** holds these at **−0.1 X**, and at **−0.24 X** in a happy squint.
  - `lip_L/R`: moved up to 7 mm up and 4 mm back on a smile.
  - forearm, hand, shin, foot, neck, chest, hips and tail2–4 just follow their parents, but must exist and carry
    weights where they belong.

## The skeleton: exactly the 37-bone contract
The names and parents are exactly as in `tools/blender/codex/hero_export.py` (`HERO_BONES` / `PARENT`), with `_L` = her
left = +X:
- **The spine chain**: `root` (at the ground, between the feet) → `hips` → `spine` → `chest` → `neck` → `head`.
  **`head` sits at the base of the skull**, at about chin height at the back of the neck, the nod pivot. It's **not**
  the head's centre.
  - Her neck is part of the head field (round 2), so place `neck` at the collar.
  - Weight the nape blend between `neck` and `head` smoothly, so a nod doesn't crease the pearls' line.
- **Under `head`**:
  - `jaw`: the hinge line, inside the head, at the mouth-corner height, about 0.22 W behind the smile;
  - `eye_L/R`, `lidU_L/R`, `lidD_L/R`: all at each eyeball's centre;
  - `brow_L/R`;
  - `lip_L/R`: at the mouth corners;
  - `ear_L/R`: at each ear's root on the skull.
- `earTip_L/R` under `ear_L/R`: at the **fold**, where the ear twists from the root into the hanging lobe (round 4's
  z 0.56–0.82 band; pick the line that bends best).
- **Arms**: `upperarm_L/R` (shoulders) → `forearm_L/R` (elbows) → `hand_L/R` (wrists).
- **Legs**: `thigh_L/R` (hips) → `shin_L/R` (knees) → `foot_L/R` (ankles). They're hidden under the skirts but must
  drive the feet.
- **Tail**: `tail1` (the root) → `tail2` → `tail3` → `tail4`, along her long thin tail.

## New geometry the face needs (keep the rest look identical)
1. **Upper eyelids**, one per eye:
   - a thin shell in her fur (#A8A6AA, the light #CFCDD1 where the brow area is lighter) just outside the eyeball,
     covering about the upper half;
   - its lower edge carries the dark lash line, so a closed eye shows one soft lash curve ("∪"), with the little wing at
     the outer corner;
   - 100% `lidU_L/R`.
   - **At rest (0) it's completely hidden** from every view, including the 45° game camera.
   - At +1.22 it fully covers the opening and meets the lower lid with no gap.
   - At +0.488 it covers the top ~25–30%, its edge level or a little higher at the outer corner (never sloping down
     outward: that reads sad). Her eyes face 32° out and 8° up, so check the squint from the front and from 45°. Report
     a `lidTilt` / `squint` override if the defaults don't sit right (Floofy needed `squint: [0.74, -0.36]`).
2. **Lower eyelids**: the same idea from below, 100% `lidD_L/R`.
   - Hidden at the game's −0.1, so the eye looks exactly like round 4.
   - At −0.24 they rise to the bottom ~quarter, with an upward-arched top edge, for happy crescent eyes.
3. **Mouth**:
   - You already cut the parting along the "w" smile (39 split vertices). Add a **mouth cavity** behind it: a closed
     pocket, dark rose-brown #4a1c24, with a pink tongue #e07a86 on its floor.
   - Weight the lower jaw region (the lower lip, the chin, down to where the chin meets the nape and the pearls) to
     `jaw`, with a smooth falloff into the cheeks.
   - **At rest** the mouth looks exactly like now, with no seam or cavity visible from any view.
   - **At +0.42** it's a cute open smile (a rounded "D") showing the cavity and tongue, with no holes and no tearing.
   - The **pearls** must not be pulled by the jaw: they belong to the neck and chest.
   - Weight the corners to `lip_L/R`.
4. **Eyeballs**: 100% `eye_L/R`.

## Weights (a premium game character)
- ≤ 4 influences per vertex, normalized, with smooth falloffs at the shoulders, elbows, hips, knees and neck.
- The head, the paws and the eyes are rigid where they should be.
- **The costume:**
  - **The robe top and the obi** follow `chest` / `spine`. The **obi's front knot and its two tails** and the **two
    sea-glass beads** follow `spine` and `hips`, with the tails swinging a little with the thigh on their side.
  - **The three bell skirts** (periwinkle, pink, sheer) follow `hips`, with their front and side panels partly
    following the thighs (about 30–45% at the hem, falling to 0 at the waist). A ±1.0 X leg swing must never punch a
    foot or shin through any skirt layer, and the layers must never cross each other.
  - **The bell sleeves** follow `upperarm` near the shoulder and `forearm` toward the cuff. At ±1.4 Z (arms raised) and
    −2.4 X (casting), the sleeve must not collapse into the arm or tear at the armpit.
  - **The back bow** follows `chest`, its loops rigid and its tails following `spine`.
  - **The pearl necklace** follows `chest` and `neck`, never `jaw` or `head`, and stays round, with no stretching on a
    head turn.
  - Weld or merge intersecting islands where needed, so a bend never opens a gap.
- **Ears**: `ear_*` for the whole ear; `earTip_*` for the hanging lobe below the fold, with a smooth blend across it.
  - At +0.6 the lobe must not pass into the cheek or the sleeve.
  - At −1.05 it flips up and back cleanly, without passing through the skull.
- **Tail**: smooth along tail1–4. At ±0.7 Y it must not pass through the skirts or the bow.

## Tests (render into `preview/poses.png` from the 45° game camera plus the front; look at every one yourself)
- Rest.
- The walk extreme: thighs +0.8/−0.8, upper arms −0.6/+0.6.
- The run lean: spine +0.3.
- Arms raised: upper arms Z ±1.3.
- The cast: right upper arm −2.4 X, the parasol in her paw.
- Head turned (+0.45 Y) and nodded (+0.3 X).
- Ear tips at −1.05 and +0.6.
- Tail wag ±0.7.
- The face sheet: blink 1.22; the happy squint (lidU 0.488 + lidD −0.24); jaw 0.42; jaw 0.42 + happy.

Fix any tearing, candy-wrapper twist, costume poke-through larger than about 1 cm, gaps, or a lid or mouth that shows
at rest. Keep the triangle count ≤ 34k including the new lids and mouth.

Also render `preview/toon-check.png` (the hard two-tone ramp, a sun about 50° up at yaw ±0.6) for rest, blink and
happy. The light/shade edge must be a smooth curve.

## Lessons from earlier rigs
- **The closed eye**: it must read as one soft downward lash curve. The lid must cover the painted rim, or a closed eye
  reads as a ring.
- **At rest**: nothing may poke through the skin. A lid shell at the game's lidD −0.1 once showed as a crack at the
  inner corner.
- **Mouth corners**: they stay sealed at every jaw value from 0 to 0.42, with and without the lip offset. Red slivers
  of the cavity once showed through a cheek.
- **Long ears near the shoulders**: on the arm-raise and cast poses, check that the ear lobe and the bell sleeve don't
  intersect. If they do, nudge the lobe's weighting toward `head` near the sleeve, not the sleeve inward.
