# Phase 2: rig Shadow for the game (the owner signed off on the model)

The owner approved your round-3 model. Now **rig it** so the game can animate it. **The approved look must not change**: with every
bone at rest he must look exactly like round 3 from every view.

## Deliverables
- `rig_shadow-toy.py`: builds on `build_shadow-toy.py` (import or extend it, deterministically) and adds everything below.
- `shadow-toy_rig.blend`: the rigged dog. **Apply every modifier except the Armature one**; the exporter reads the mesh data
  plus vertex groups.
- A **pose test sheet** `preview/poses.png` and `preview/face.png` (the tests below).
- Run the game exporter and fix everything it warns about (it must end with **no warnings**):
  `blender --background D:/projects/chewy-life-3d/tools/blender/work/codex/shadow-toy/shadow-toy_rig.blend --python D:/projects/chewy-life-3d/tools/blender/codex/hero_export.py -- --contract quad --out D:/projects/chewy-life-3d/tools/blender/work/codex/shadow-toy/export --name shadow_toy --height 0.62`
  Put its final `HERO_EXPORT` line in your report. (The exporter writes into your task folder; the director copies it into
  the game.) Read `hero_export.py` once: it lists the quad contract (`QUAD_BONES` / `QUAD_PARENT`) and its rules.

## How the game uses the rig
- The exporter keeps only each bone's **head position** (rest pose). In the game each bone becomes a joint at that point with
  **no rotation**, and the animation system rotates joints **about axes parallel to the world axes**, pivoting at the joint.
- Axis mapping, Blender → game:
  - a game rotation about X by θ = a Blender rotation about **world +X** by θ;
  - about Y (up) = about Blender world **+Z**;
  - about Z = about Blender world **−Y**.
  Test your weights with exactly these rotations, about each bone's head.
- Joints the game drives (`src/actors/animator.js`, `poseQuad` / `secondary` / `face`):
  - `body`: bob up to +0.03 m in y; pitch ±0.15 X; roll ±0.06 Z. In the **sit** pose it pitches **−0.5 X** (front up) and drops
    0.045 m.
  - `head`: nod ±0.25 X, turn ±0.3 Y, tilt ±0.1 Z. In sit it counter-tilts **+0.38 X**.
  - `legFL` / `legFR` / `legBL` / `legBR`: walk and run swing **±0.75 X**.
    - In sit, the **hind legs rotate −1.45 X** (folding forward along the ground) and **drop 0.08 m**.
    - The front legs stay planted (the body pitches up over them).
    - The legs are children of `root`, **not** of the body, so the body's pitch doesn't move them. The haunch and shoulder
      weights must blend body ↔ leg smoothly so a swing or a sit doesn't tear the skin.
  - `ear_L` / `ear_R`: a whole-ear spring, about ±0.4 X and ±0.2 Z. Upright ears: no tip bones.
  - `tail1`: set **absolutely** to −0.3 X plus a wag of up to **±0.9 Y**. `tail2` follows.
  - `jaw`: 0 to **+0.42 X** (bark, pant).
  - `lidU_L/R`: 0 to **+1.22 X** (blink, fully closed); **+0.4 X** = happy squint.
  - `lidD_L/R`: the game **always** holds these at **−0.10 X**, and **−0.24 X** in a happy squint.
  - `lip_L/R`: up to 7 mm up and 4 mm back on a smile (in game space).
  - `neck`, `eye_L/R` and `tail2` aren't driven yet, but must exist (the eyes can aim later).

## The skeleton: exactly these bones, names and parents (the quad contract)
- `root`: on the ground, under the body's centre.
- `body`: **the barrel's centre**, the pivot for pitch and roll. Parent `root`.
- `neck`: at the neck base, under the collar. Parent `body`.
- `head`: **at the base of the skull / top of the neck**, the nod pivot, **not** the head's centre. Parent `neck`.
- Under `head`:
  - `jaw`: the hinge line inside the head, at the mouth-corner height, behind the muzzle;
  - `eye_L/R`, `lidU_L/R`, `lidD_L/R`: all at each eyeball's centre;
  - `lip_L/R`: at the mouth corners;
  - `ear_L/R`: at each ear's base on the skull.
- `legFL`, `legFR`, `legBL`, `legBR`: at the **shoulder / hip** tops (the swing pivots). Parent `root`.
- `tail1`: at the tail root, parent `body`; `tail2`: mid-nub, parent `tail1`.
- `_L` = the dog's left = **+X**. Front legs are toward −Y.

## New geometry the face needs (keep the rest look identical)
1. **Upper eyelids**: a thin fur-coloured shell (black fur #34303f, or white where the lid sits on the blaze) just outside each
   eyeball, about the upper half of the eye.
   - Its lower edge is painted with the dark lid line (#1c181e), so a **closed eye reads as one soft downward lash curve
     ("∪")**, never a ring.
   - 100% weighted to `lidU_*`.
   - **At rest (0) it must be completely hidden**, tucked inside the head above the eye opening, from every view including
     the 45° game camera.
   - At +1.22 it covers the whole opening, including any painted rim. At +0.4 it covers about the top third.
2. **Lower eyelids**: the same idea from below, weighted to `lidD_*`. At the game's neutral **−0.10** they're hidden or just at the
   lower rim, and the eye looks exactly like round 3. At −0.24 they rise to cover the bottom ~quarter (happy crescent eyes with the
   upper at +0.4).
3. **Mouth**:
   - Cut the muzzle along the painted "w" smile line and add a **mouth cavity** behind it: a closed pocket inside the head,
     dark red-brown #4a1c1c, with a **pink tongue** #e07a86 that can hang a little forward when the jaw opens (a panting
     look).
   - Weight the lower jaw region (the lower lip, chin and under-jaw white, down to the throat) to `jaw`, with a smooth falloff
     into the cheek pads.
   - At rest the mouth is closed and looks exactly like now: no visible seam or cavity from any view.
   - At **+0.42** it's a cute open "happy pant" or bark, showing the cavity and tongue, with no holes into the head and no
     tearing. The corners stay sealed at every value from 0 to 0.42, with and without the lip offset.
   - Weight the corners to `lip_*`.
4. **Eyeballs**: 100% `eye_*`. Nothing may poke through the skin at rest, at blink or in a squint (watch the inner eye corners and
   the lid shells).

## Weights
- ≤ 4 influences per vertex, normalized, with smooth falloffs at the shoulders, hips, neck and tail root.
- The head, ears and paws are rigid where they should be.
- **The collar and tag follow `neck`/`body`**, so they ride with the head nod a little but stay on the neck.
- The haunch region blends `body` ↔ `legB*` so the **sit** pose looks right: the rump settles onto the ground and the hind legs
  fold forward under and beside the belly, with no candy-wrapping or skin tearing. The thighs bulge rather than collapse.

## Tests (render them into `preview/poses.png`, 45° game camera plus side view; look at every one yourself)
Rest; walk extreme (FL/BR +0.75, FR/BL −0.75); run bob (body +0.03 y, pitch +0.1); **sit** (body pitch −0.5 X and −0.045 y, hind legs
−1.45 X and −0.08 y, head +0.38 X); head turned +0.3 Y and nodded +0.25 X; ears +0.4 X / −0.4 X; tail −0.3 X with a wag of ±0.9 Y.
Plus the face sheet: blink 1.22; happy squint (lidU +0.4, lidD −0.24); jaw 0.42 (pant, tongue out); jaw 0.42 + happy.
Fix any tearing, collapse, poke-through larger than about 1 cm, gaps, or a lid or mouth that shows at rest. Keep **≤ 28k triangles**
including the new lids and mouth.

Report as before (the table plus the `HERO_EXPORT` line), then stop.
