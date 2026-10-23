# Phase 2: rig your villager for the game (VL-1, shared rig brief)

The director approved your model. Now **rig it** so the game can animate it. **The approved look must not change**: with
every bone at rest it must look exactly like your last model round from every view, apart from any model fixes the
director lists in the message that sent you here.

The villagers are built by the same baked-hero loader as Rosie and the heroes, so they use the **37-bone hero contract**
and the same Animator (`src/actors/animator.js`: `poseBiped`, `face`, `secondary`). Rosie's rig is the closest reference:
read `tools/blender/codex/assets/rosie-toy/rig_rosie-opus.py`, `rig_tests.py` and `README.md` (its rounds 5 and 8:
the face triangulation for the toon band, the lids, the convex face).

## Deliverables
- `rig_<id>-toy.py`: builds on your `build_<id>-toy.py` (import or extend it, deterministically) and adds everything below.
- `<id>-toy_rig.blend`: the rigged character. **Apply every modifier except the Armature one** on every mesh; the
  exporter reads the mesh data plus vertex groups.
- `preview/poses.png`, `preview/face.png` and `preview/toon-check.png` (the tests below). Look at every one yourself.
- Run the game exporter and fix everything it warns about. It must end with **no warnings**:
  `blender --background <TASK>/<id>-toy_rig.blend --python D:/projects/chewy-life-3d/tools/blender/codex/hero_export.py -- --out <TASK>/export --name <id>_toy --height <your model's top height in m>`
  Read `hero_export.py` once: it lists the contract (`HERO_BONES` / `PARENT`) and its rules. Put its final `HERO_EXPORT`
  line in your report. The director installs the export into the game.
- Don't touch `public/models/<id>-toy.glb` (the approved model).

## How the game uses the rig
- The exporter keeps only each bone's **head position** (rest pose). In the game each bone becomes a joint at that point
  with **no rotation**, and the animation rotates joints **about axes parallel to the world axes**, pivoting at the joint.
- Axis mapping, Blender → game: a game rotation about X by θ = Blender world **+X** by θ; about Y (up) = Blender world
  **+Z**; about Z = Blender world **−Y**. Test your weights with exactly these rotations about each bone's head.
- Joints the game drives (they must deform well):
  - `spine` (bob, lean ±0.35 X, twist ±0.4 Y); `head` (nod ±0.3 X, turn ±0.45 Y, tilt ±0.15 Z);
  - `upperarm_L/R` (swing ±1.2 X; raised out to ±1.4 Z; a wave and the happy hop at about ±2.4–2.5 Z with a little X);
  - `thigh_L/R` (walk ±0.62 X, run up to ±1.0 X);
  - `jaw` (0 to **+0.42 X**; talking flaps it with uneven syllables, so the in-between values matter);
  - `lidU_L/R` (0 to **+1.22 X** = closed; **+0.488 X** = the happy squint);
  - `lidD_L/R` (the game **always** holds these at **−0.10 X**, and at **−0.24 X** in a happy squint);
  - `lip_L/R` (up to 7 mm up and 4 mm back on a smile, game space; the neutral holds 40% of that);
  - **`ear_L/R` and `earTip_L/R` get a spring** (a small sway and flop as the character moves) and **`tail1–4` a wag**.
    Animal villagers **weight them** (unlike Rosie, whose ears were part of her head): each ear 100% to `ear_*` near
    the base blending to `earTip_*` over its top half; the tail along `tail1 → tail4`. Ears that sit through a hat
    (Usagi) swing from where they leave the hat. Characters without a tail still need the four tail bones, unweighted.
  - forearm, hand, shin, foot, neck, chest and hips follow their parents; they must exist and carry weights where they
    belong.

## The skeleton: exactly these 37 bones, names and parents
- `root` (on the ground, between the feet) → `hips` (pelvis centre) → `spine` (lower belly) → `chest` (mid chest) →
  `neck` (top of the collar) → `head`.
  - **`head` sits at the base of the skull**, the pivot for nodding: about chin height, at the back of the neck. Not the
    head's centre.
- Under `head`: `jaw` (the hinge line inside the head at mouth-corner height, about 0.22 W behind the mouth);
  `eye_L/R`, `lidU_L/R`, `lidD_L/R` (at each eyeball's centre; moving a lid pivot is fine if a rigid lid can't otherwise
  cover the opening); `brow_L/R` (above the eyes; not animated, but must exist); `lip_L/R` (the mouth corners);
  `ear_L/R` (each ear's base). `earTip_L/R` under `ear_L/R`, a little up and out along the ear.
- `upperarm_L/R` under `chest` → `forearm_L/R` → `hand_L/R`. `thigh_L/R` under `hips` → `shin_L/R` → `foot_L/R`.
- `tail1` under `hips` (at the tail's root) → `tail2` → `tail3` → `tail4` along the tail.
- `_L` = the character's left = **+X**. No other bones.

## Tilted lid hinges (all the villagers: their eyes face outward)
A rigid lid turning about world X can't make a level happy squint on an eye that faces outward: the lid's inner half
sits further from the hinge than its outer half, so the edge slopes down at the outer corner and the eye reads sad
(Mochi's first rig). The game has the fix: a HERO_MODELS entry's `lidTilt` (radians; `src/actors/animator.js`
`lidTurn`) turns each lid about **its own eye's sideways axis**. The character's left (+X) eye hinges about game axis
(cos t, 0, −sin t) = Blender (cos t, +sin t, 0); the right eye mirrors it, Blender (cos t, −sin t, 0). The angles stay
the same (1.22, 0.488, −0.24, −0.10). Set **t = your eyes' outward facing angle** (from your model report), build the lid
shells hinged on those axes through each eye's centre, test every face row with rotations about those axes, and put
the t you used in your report. Floofy (`tools/blender/codex/assets/shihtzu-toy/README.md`, rounds 5–5c) is the
precedent. If a different squint pair reads happier with your lids (Poe [0.58, −0.24], Floofy [0.74, −0.36]), say
which and render that row too.

## New geometry the face needs (the rest look stays identical)
1. **Upper eyelids**: a thin shell in the skin colour round each eye (matched to the atlas there, so a calico or a mask
   patch continues across the closed lid), just outside the eyeball, 100% to `lidU_*`. Its lower edge carries the
   **thick dark lash line**, so a closed eye reads as **one soft downward lash curve ("∪") with the wing**, never a ring.
   **Hidden at rest (0)** from every view, including the 45° game camera; at **+1.22** it covers the whole opening and
   meets the lower lid with no gap; at **+0.488** it covers the top 25–30%, its edge **level or a little higher at the
   outer corner, never sloping down outward** (that reads sad).
2. **Lower eyelids**, the same from below, 100% to `lidD_*`: hidden (or exactly at the rim) at the neutral −0.10; at
   −0.24 they rise to cover the bottom ~30% with an **upward-arched** edge, so with the upper lid at +0.488 the character
   gets happy crescent eyes.
3. **The mouth**: cut along the painted mouth line and add a **mouth cavity** behind it (a closed pocket, dark red-brown
   #5a1e22, a pink tongue #e88a96 on its floor; no teeth). Weight the lower lip, chin and under-jaw to `jaw` with a
   smooth falloff into the cheeks; the blush and cheek volume stay on `head`. At rest it's closed and looks exactly like
   now. At +0.42 it's a cute open smile (a rounded "D", wider than tall) showing the cavity and the tongue, with no holes
   and no tearing; at 0.1–0.2 (talking) a small open "o" smile, not a crack. **The corners stay sealed** at every value,
   with and without the lip offset (weight them to `lip_*`). Animals with a muzzle: the muzzle's lower half rides the jaw.
4. **Eyeballs**: 100% `eye_*`. Nothing pokes through the skin at rest, at a blink or in a squint.

## Weights (the quality bar: a premium game character)
- ≤ 4 influences per vertex, normalized, smooth falloffs at the shoulders, elbows, hips, knees and neck.
- Rigid to `head`: the skull, the hat or head accessory, the face's surroundings and the hidden neck top. Hats and leaves
  never stretch. Blend the neck smoothly from `neck` to `head` under the jaw.
- **Costume**: tops follow `chest` / `spine`; collars, scarves and neckerchiefs follow `chest`, riding a little with
  `neck` so a nod doesn't push the chin through them; scarf or bow ends hang from `chest`; sleeves follow `upperarm_*`
  blending to `chest` at the armhole (check ±1.4 Z and the wave at ±2.4 Z); skirts, hakama, aprons and overall shorts
  follow `hips`, with their front and back panels partly following the thighs (about 25–40% near the hem) so a walk
  (±0.62) and a run (±1.0) never push a leg through; bags and satchels follow `spine` / `chest`; props tucked in a belt
  or pocket (a brush, a trowel) are rigid to their holder.
- Weld or merge intersecting islands where a bend would open a gap (sleeve to arm, collar to top).
- Mitten hands rigid to `hand_*`; feet rigid to `foot_*`.

## Tests (render into `preview/poses.png` at the 45° game camera plus the front view)
- Rest; a walk extreme (thighs +0.62 / −0.62, upper arms −0.55 / +0.55); a run (thighs ±1.0, spine +0.26 X); arms raised
  (upper arms Z ±1.4); a wave (right upper arm +2.5 Z, −0.3 X; head tilt 0.12 Z); head turned (+0.45 Y) and nodded
  (+0.3 X); the happy hop (both arms ±2.4 Z, −0.2 X); the ears swung (ear_L/R ±0.35 Z and ±0.3 X) and the tail wagged
  (tail1–4 each +0.25 Y), if your villager has them.
- `preview/face.png` at the front, both 45° game yaws and the 3/4: rest; blink 1.22; happy (lidU +0.488, lidD −0.24);
  jaw 0.15 (talk); jaw 0.42; jaw 0.42 + happy + lips at 100%.
- `preview/toon-check.png`: a hard-ramp toon render (a sun about 50° up at yaw ±0.6). If the band zigzags on the face,
  refine the face triangulation adaptively (Rosie's `RIG_MODE` refinement).
- Fix any tearing, candy-wrapper twist, costume poke-through over about 1 cm, gaps, or a lid or mouth showing at rest.
- **≤ 34k triangles** including the lids and the mouth.

Report as before (the bones with their head positions, a weights summary, the triangle count, the tests, the
`HERO_EXPORT` line, known issues), then stop.
