# Round 4: the owner approved Poe. Blunter ear tips, then rig her (phase 2).

The owner approved the model ("Rig it (blunter ear tips too)").

## Step 1: the last model change
- **Blunter ear tips**: round off the tip of each ear so it reads as a soft rounded lobe, not a taper, from the 3/4 portrait
  and both 45° cameras. Make the tip broader (the end radius about 1.5× today's) and keep the length, base, fold position,
  thickness and the "under the crown" rule.
- **Nothing else changes**: the head, face, cheeks, mask, body, outfit, palette and fūma are locked, and determinism holds.
- Re-render `portrait.png`, `cmp-head.png` and `game-45-head.png` so I can confirm the tips.

## Step 2: the rig (the 37-bone biped hero contract)
Follow `D:/projects/chewy-life-3d/.claude/skills/toybox-character/templates/rig-brief.md` exactly: the skeleton, game
values, face geometry, weights quality bar and tests. Read it now. The Toybox Chewy's `rig_chewy-b.py`
(`tools/blender/codex/assets/chewy-b/`) and Moka's (`tools/blender/codex/assets/moka-toy/`) are working references.
The Poe-specific parts:

- **The face** on a black coat:
  - the eyelid shells in the coat colour #2E2A30, with the sheen kept subtle;
  - the lash line #141216 on the lower edge of the upper lid;
  - **hidden at rest** (lidD held at −0.1) from every view, including the 45° camera;
  - closed at +1.22, and a happy squint at +0.488 with lidD −0.24, giving "^ ^".
- **The mouth**:
  - cut along the painted W-shaped mouth line, with a dark #3a1418 cavity and a pink #e07a86 tongue;
  - the jaw region on her flat face is the lower lip band, the chin, and a soft falloff into the jowls;
  - at +0.42 it's a cute open "D". No holes and no tearing, and the corners stay sealed at every jaw value.
- **The ears**:
  - `ear_*` carries the whole ear; `earTip_*` carries the flap beyond the fold, with a smooth blend across the fold;
  - at +0.6 the flap must not pass into the skull; at −1.05 it flips up cleanly;
  - **the left ear sits under the festival mask**, which is rigid on `head`. Check the left ear tip across the game's
    range: if the flap passes through the mask, give me the largest safe `earGain` (a 0–1 multiplier the game applies to
    the ear motion) in the report, rather than moving the mask.
- **The tail**: the spiral curl on `tail1`–`tail4`, with the root on the rump. A wag of ±0.7 must not push the curl into
  the shorts or the fūma.
- **The costume weights**:
  - the moss top follows the spine and chest;
  - the sleeves and cuffs follow the upper arms; the forearm guards follow the forearms; the mitten paws go to the hands;
  - the cream collar roll and hood cowl follow the neck and chest;
  - the scarf knot is on the chest, with its tails loosely on the chest and spine;
  - the obi sash and knot are on the hips, with the sash tails partly following the thigh on their side;
  - the puffy shorts are split per leg, on the thighs with a hip blend at the top and a soft seat;
  - the shin wraps follow the shins and the tabi the feet;
  - the pouch, its mini shuriken and the scroll are rigid on the hips;
  - the festival mask and its tassel are rigid on the head.
  **No fur may show through cloth** on the walk (±0.62 and ±0.8), the run (±0.97 with a 0.26 lean) or the roll crouch.
  Count it per pose in `pose-check.json`, as the samurai Chewy's builder did.
- **The fūma on her back is a separate prop, not part of the hero mesh.** The hero exporter merges every skinned mesh
  into one, so a `fuma_back` inside it couldn't be hidden while the fūma is thrown.
  - **Keep `fuma_back` out of the hero export**: no Armature modifier, or `hide_render`. The exporter only takes meshes
    with an Armature modifier.
  - Export it on its own as **`public/models/poe-fuma.glb`**: pivot at the hub centre, the bone arms in the model's XY
    plane (the spin axis is +Z in Blender, so +Y up becomes the game's forward Z), with the same atlas paint (its own small
    material is fine).
  - In `export/fuma_mount.json`, give the back mount (the hub centre and its orientation as a quaternion) in the **chest
    bone's frame** and in model space, in game axes (game [x, y, z] = Blender [x, z, −y]). The game puts the prop there,
    and in her paw or in flight when she throws.
- **Export**: `hero_export.py` into **your task folder** (`export/`) as `poe_toy` at `--height 1.2`, with **0 warnings**.
  **Don't write to `public/rigs/`**: I install it.
- **Tests**:
  - `preview/poses.png` and `poses-other.png` (front and both 45° yaws):
    - rest, the walk extremes and the game-amplitude walk, the run;
    - the arms raised (Z ±1.3), the attack (right upper arm −2.4 X), a **two-paw hand seal** (both forearms in to the
      chest), a one-arm throw;
    - the head turned and nodded, the ear tips at −1.05 and +0.6, the tail wag ±0.7, the roll crouch, a sit.
  - `preview/face.png`: rest, blink, happy, jaw 0.42, jaw + happy.
  - `toon-check.png`, `crops.png` of any problem area, `pose-check.json`, and `validation.json` (finite data, weights
    summing to 1, no degenerate triangles).
- **Processes**: every Blender run goes through your launcher with its PID logged; stop only those PIDs. Keep the
  timeouts and caps.

## Report
End with the report:
- the ear tip change;
- the rig approach;
- export stats (bones, triangles, the warnings count);
- the per-pose checks;
- the safe `earGain` for the left ear;
- the fūma prop and its mount;
- known issues.
Then stop.
