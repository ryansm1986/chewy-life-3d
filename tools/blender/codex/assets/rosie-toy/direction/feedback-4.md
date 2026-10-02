# Phase 2: rig Rosie for the game (the owner signed off on the model)

The owner approved your round-3 model ("Looks good, rig her"). Now **rig it** so the game can animate it. **The approved look must
not change**: with every bone at rest she must look exactly like round 3 from every view, apart from the two small model fixes
at the end of this brief.

She'll be a village NPC (the baker, Chewy's best friend). The game builds her with the same baked-hero loader as the Toybox Chewy,
so she uses the **37-bone hero contract** and the same Animator (`src/actors/animator.js`, `poseBiped`, `face`, `secondary`).

## Deliverables
- `rig_rosie-opus.py`: builds on `build_rosie-opus.py` (import or extend it, deterministically) and adds everything below.
- `rosie-opus_rig.blend`: the rigged character. **Apply every modifier except the Armature one** on every mesh; the exporter reads
  the mesh data plus vertex groups.
- A **pose test sheet** `preview/poses.png` and a face sheet `preview/face.png` (the tests below).
- Run the game exporter and fix everything it warns about (it must end with **no warnings**):
  `blender --background D:/projects/chewy-life-3d/tools/blender/work/codex/rosie-opus/rosie-opus_rig.blend --python D:/projects/chewy-life-3d/tools/blender/codex/hero_export.py -- --out D:/projects/chewy-life-3d/tools/blender/work/codex/rosie-opus/export --name rosie_toy --height 1.26`
  Read `hero_export.py` once, since it lists the contract (`HERO_BONES` / `PARENT`) and its rules. Put its final `HERO_EXPORT`
  line in your report. The exporter writes into your task folder, and the director installs it into the game.
- Don't touch `public/models/rosie-opus.glb` (the approved model) or `rosie-toy.glb`.

## How the game uses the rig
- The exporter keeps only each bone's **head position** (rest pose). In the game each bone becomes a joint at that point with
  **no rotation**. The animation system rotates joints **about axes parallel to the world axes**, pivoting at the joint.
- Axis mapping, Blender → game:
  - a game rotation about X by θ = a Blender rotation about **world +X** by θ;
  - about Y (up) = about Blender world **+Z**;
  - about Z = about Blender world **−Y**.
  Test your weights with exactly these rotations about each bone's head.
- Joints the game drives (so they must deform well):
  - `spine` (the body: bob, lean ±0.35 X, twist ±0.4 Y);
  - `head` (nod ±0.3 X, turn ±0.45 Y, tilt ±0.15 Z);
  - `upperarm_L/R` (swing ±1.2 X; raised out to ±1.4 Z, as in waving and the happy hop, about ±2.4–2.5 Z with a little X);
  - `thigh_L/R` (walk ±0.62 X, run up to ±1.0 X);
  - `jaw` (0 to **+0.42 X**: talking flaps it with uneven syllables, so the in-between values matter as much as the extremes);
  - `lidU_L/R` (0 to **+1.22 X**, fully closed; **+0.488 X** = happy squint, the game's 0.4 × 1.22);
  - `lidD_L/R` (the game **always** holds these at **−0.10 X**, and at **−0.24 X** in a happy squint);
  - `lip_L/R` (moved up to 7 mm up and 4 mm back on a smile, in game space; her neutral holds the lips at 40% of that).
  - `ear_L/R` / `earTip_L/R` get a small spring from the game. **Put no weights on them** (her ears are part of the head; see
    Weights). `tail1–4` get a wag: **no weights** either.
  - forearm, hand, shin, foot, neck, chest and hips just follow their parents, but must exist and carry weights where they
    belong.

## The skeleton: exactly these 37 bones, names and parents
- `root` (on the ground, between the feet) → `hips` (pelvis centre) → `spine` (lower belly) → `chest` (mid chest) → `neck` (top of
  the collar) → `head`.
  - **`head` sits at the base of the skull**, the pivot for nodding: about chin height, at the back of the neck. **Not** the head's
    centre. Your `joints.json` `head` (z 0.852) is the head centre, so don't use it for this bone.
- Under `head`:
  - `jaw`: the hinge line **inside** the head, at mouth-corner height, about 0.22 W behind the smile;
  - `eye_L/R`, `lidU_L/R`, `lidD_L/R`: at each eyeball's centre (move the lid pivots if a rigid lid can't otherwise cover the
    opening; Shadow's rig needed that, and it's fine);
  - `brow_L/R`: above the eyes (not animated, but must exist);
  - `lip_L/R`: at the mouth corners;
  - `ear_L/R`: at each ear's base.
- `earTip_L/R` under `ear_L/R`, a little outward of the ear base.
- `upperarm_L/R` under `chest` (the shoulder joints) → `forearm_L/R` (elbows) → `hand_L/R` (wrists).
- `thigh_L/R` under `hips` (hip joints) → `shin_L/R` (knees) → `foot_L/R` (ankles).
- `tail1` under `hips`, placed at the small of the back inside the skirt → `tail2` → `tail3` → `tail4`, short steps behind it.
- `_L` = her left = **+X**. No other bones.

## New geometry the face needs (keep the rest look identical)
1. **Upper eyelids**, one per eye: a thin skin-coloured shell (her face skin colour, matched to the atlas around the eye) just
   outside the eyeball, covering about the upper half of the eye, 100% weighted to `lidU_*`.
   - Its lower edge carries her **thick dark lash line** (#2a1a14). So a closed eye reads as **one soft downward lash curve ("∪")
     with the 3 outer flicks**, never as a ring; the lid must cover the painted lash band around the opening when closed.
   - **At rest (0) it's completely hidden**, tucked inside the head above the opening, from every view including the 45° game
     camera.
   - At **+1.22** it covers the whole opening, meeting the lower lid with no gap.
   - At **+0.488** it covers the top ~25–30%, its edge **level or a little higher at the outer corner, never sloping down outward**
     (that reads sad; it happened on Shadow).
2. **Lower eyelids**, the same idea from below, 100% `lidD_*`.
   - At the neutral **−0.10** they're hidden (or exactly at the lower rim) and the eye looks exactly like round 3.
   - At **−0.24** they rise to cover the bottom ~30% with an **upward-arched** top edge, so with the upper lid at +0.488 she gets
     happy crescent eyes.
3. **Mouth**:
   - Cut the face along the painted **smile line** and add a **mouth cavity** behind it: a closed pocket inside the head, dark
     red-brown #5a1e22, with a pink tongue #e88a96 on its floor. No teeth (toy style).
   - Weight the **lower lip, chin and under-jaw** (down to where the chin meets the neck) to `jaw`, with a smooth falloff into the
     cheeks, so opening pulls the lower lip down and away. The blush and cheek volume stay on `head`.
   - At rest the mouth is closed and looks exactly like now (just the smile line), with no visible seam or cavity from any view.
   - At **+0.42** it's a cute open smile (a rounded "D", wider than tall), showing the cavity and tongue, with no holes into the head
     and no tearing. At small values (0.1–0.2, talking) it reads as a small open "o" smile, not a crack.
   - **The mouth corners stay sealed at every value from 0 to 0.42**, with and without the lip offset. Weight them to `lip_*`.
4. **Eyeballs**: 100% `eye_*`. Nothing pokes through the skin at rest, at blink or in a squint.

## Weights (quality bar: a premium game character)
- ≤ 4 influences per vertex, normalized, with smooth falloffs at the shoulders, elbows, hips, knees and neck.
- **Rigid to `head`**: the skull skin, ears, all the hair, the bow, the eyes' surroundings and the hidden neck top. The hair must
  never stretch. Blend the neck smoothly from `neck` to `head` under the jaw.
- **Costume**:
  - the dress bodice follows `chest` / `spine`;
  - the flat collar and the brooch follow `chest`, with the collar's front points riding a little with `neck`, so a head nod
    doesn't poke the chin through the collar;
  - the puffy sleeves follow `upperarm_*`, blending to `chest` at the armhole; check the arms raised to ±1.4 Z and the wave
    (≈ ±2.4 Z);
  - the **A-line skirt** follows `hips`. Its front and back panels partly follow the thighs (about 25–40% near the hem on each
    side), so a walk (±0.62) and a run (±1.0) never push a leg through the skirt, and the scalloped hem swings a little with the
    stride. The hem must not tear or fold into the legs.
  - the legs, socks and shoes follow `thigh` / `shin` / `foot`, with the shoes rigid.
- Weld or merge intersecting islands where needed so a bend never opens a gap (sleeve cuff to arm, sock to leg, collar to dress).
- Mitten hands: rigid to `hand_*`.

## Two small model fixes (the owner saw round 3; do these as part of this phase)
1. **Neck sliver**: in `portrait.png` (3/4) and the front view a bit of neck now shows **between the collar flaps**, with a shading
   line at its centre. On the sheet the collar sits right under the chin. Close it: tuck the neck further under the chin's shade
   or let the collar's inner edges meet higher. Keep the collar outline as approved.
2. **Crown facet**: the faint step at the top-right of the crown outline in `portrait.png` (the rear crown pillow) and the faint mark
   where the near crown-side lobe ends at the temple. Smooth them if it's cheap; it's optional.

## Tests (render into `preview/poses.png`, 45° game camera plus front view; look at every one yourself)
- Rest; walk extreme (thighs +0.62 / −0.62, upper arms −0.55 / +0.55); run (thighs ±1.0, spine +0.26 X); arms raised
  (upper arms Z ±1.4); a wave (right upper arm +2.5 Z, −0.3 X; head tilt 0.12 Z); head turned (+0.45 Y) and nodded (+0.3 X);
  the happy hop (both arms ±2.4 Z, −0.2 X).
- The face sheet `preview/face.png`, at the front, both 45° game yaws and the 3/4: rest; blink 1.22; **happy (lidU +0.488,
  lidD −0.24)**; jaw 0.15 (talk); jaw 0.42; jaw 0.42 + happy + lips at 100%.
- Fix any tearing, candy-wrapper twist, costume poke-through larger than about 1 cm, gaps, or a lid or mouth that shows at rest.
- Keep **≤ 34k triangles** including the new lids and mouth.

Report as before (a table of the bones with head positions, the weights summary, the triangle count, the tests, the `HERO_EXPORT`
line, known issues), then stop.
