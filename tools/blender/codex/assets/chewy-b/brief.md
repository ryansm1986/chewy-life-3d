# Asset brief: chewy-b (the new hero model, "Toybox Chibi" Chewy)

## What it is
**Chewy**, the game's hero and its most important asset. He's on screen every second: at the 45° gameplay camera
about 20 m away, in close-up dialogue portraits, and on the title screen. The owner picked design **Option B,
"Toybox Chibi"**: the attached `sheet-B.png` is **the blueprint**, so match it closely. `chewy-photo.jpg` is the
real dog, for coat colour and ear shape only.

This task has two phases:
- **Phase 1 (now)**: the model itself, in a neutral A-pose, until the director rates the look 9/10.
- **Phase 2 (a later round, only when the director says so)**: rigging to the game's skeleton.
Build phase 1 so phase 2 is easy (see "Rig-ready" below), but **don't rig yet**.

## Match the sheet (the order these matter in)
1. **Head and face**. This is 70% of the appeal.
   - A big, round, soft head, slightly wider than tall, with full cheeks. It's the largest form of the character.
   - A tiny, broad, short muzzle: a soft rounded bump in the lower third of the face. Not a snout.
   - The nose is a small rounded triangle, liver #6A3A2A, with a soft highlight.
   - A simple gentle smile line. Chin and muzzle-underside marking in #F4ECE0, shaped exactly like the sheet.
   - The eyes are **the most important detail**. They're big, glossy and set wide, low on the face:
     - amber iris #E0A040, fading darker toward the top (#b8742a);
     - a large dark pupil (#2a1812);
     - two white catchlights (one big, one small), top-left;
     - a thin dark upper lid line and a soft brow shape above each eye (a slightly darker fur tone).
   - Ears: semi-erect bases with **soft, thick tips folded forward and down**. There's a pink-brown inner ear
     (#a8604a) where visible. The right ear (his left) is a bit perkier than the other: keep that asymmetry.
2. **Silhouette and proportions**.
   - About 2.4 heads tall. **Total height 1.20 m to the top of the head, not counting the ears** (the game's hero
     height). Everything else scales from that.
   - Stubby, rounded limbs; mitten paws with a hint of three toe pads on top; broad rounded feet.
   - A small, slightly upturned tail.
   - Pear-shaped: the head is widest, then the pants and feet.
3. **Costume**, as simple, chunky, soft shapes with rounded edges, exactly as drawn:
   - a navy gi #243A6A with short sleeves;
   - a white under-collar V #F4ECE0;
   - a red neckerchief #D8402E knotted at the throat, with two short tails;
   - a red sash #D8402E, its knot and two tails at his **left** hip;
   - two thick white forearm wraps #F4ECE0, each with 1–2 visible band lines;
   - charcoal hakama pants #2E2A36 as two big rounded masses with a couple of soft folds;
   - the gi hem flaring slightly over the pants.
4. **Coat**: chocolate #6B3E2B with a warm sheen #9A5A3A on the top planes (head crown, cheeks, shoulders). It's
   short and sleek, with a vinyl-toy smoothness. At most a couple of sculpted tufts at the cheeks; **no hair strands
   and no fur cards**. The white chest blaze shows as a narrow V between the collar edges, exactly like the sheet.

## Style and quality bar (what 9/10 means here)
- It should look like **a polished, premium vinyl toy**, or a character from a Nintendo or Pixar short. Every form
  is soft, rounded and deliberate.
- No lumpy blobs, no visible booleans, no faceting.
- Clean colour borders: the markings, the eye parts and the costume edges are crisp, not blurry.
- The face must be appealing from the front, from 3/4 **and from above**, since the game camera looks down 45°.
  Check the eyes aren't hidden under the brow from above.
- Side by side with `sheet-B.png`, someone should recognise it as the same character instantly.

## Technical
- **Pose**: the neutral A-pose of the sheet: arms about 30° out from the body, feet slightly apart, mouth closed,
  eyes open. He faces **−Y** in Blender and stands on z = 0, centred.
- **Triangle budget**: **≤ 30,000 total**; the head, face and eyes may take up to half of it. Smooth silhouettes
  need the density: use subdivision where it shows, then apply it.
- **Colour**: a painted colour texture is preferred. Unwrap and paint, or bake the material regions into **one
  2048² atlas**. That gives crisp borders on the eyes, markings and wraps. Several materials are fine while you
  work, but the final GLB for this phase should use **one material with the atlas**, plus the eyes' glossy
  highlights painted into it.
- **Techniques**: your choice. Subdivision-surface modelling, metaballs or remesh, or the repo's
  signed-distance sculpt kit at `D:/projects/chewy-life-3d/tools/blender/disney/sdf.py` (numpy SDF plus a surface-nets mesher; an
  earlier Chewy was built with it). You may `sys.path`-import it read-only. Retopologise, decimate or smooth as
  needed.
- **Rig-ready (for phase 2)**:
  - Model the eyeballs as separate spheres (they'll rotate).
  - Give the eyelid area and the mouth corners enough edge loops to deform.
  - Build the ears as separate pieces joined at the base, with a crease where the tip folds.
  - Give the tail 3–4 segments' worth of loops.
  - Give the elbows, knees, shoulders, hips and neck enough loops to bend.
  - Delete body surface hidden under the clothes.
  - Record the joint positions you'd use: hips, spine, chest, neck, head, jaw pivot, eyes, ear bases and tips,
    shoulders, elbows, wrists, hips, knees, ankles, and the tail root to tip. Write them to `joints.json` in metres.
- **Output**: `public/models/chewy-b.glb`.
- **Preview**: run the standard preview **with `--character`**:
  `blender --background --factory-startup --python D:/projects/chewy-life-3d/tools/blender/codex/preview.py -- --in D:/projects/chewy-life-3d/public/models/chewy-b.glb --out D:/projects/chewy-life-3d/tools/blender/work/codex/chewy-b/preview --character`
  It adds `preview/turnaround.png` (front | 3/4 | side | back, like the sheet) and `preview/head.png` (a head
  close-up, front | 3/4).
  - **Compare the turnaround with `sheet-B.png` yourself**, view by view, before reporting.
  - Also render your own hero portrait (`portrait.png`): 3/4 front, head and shoulders, soft studio light. It's
    the appeal check.

## Done when (phase 1)
- Put `turnaround.png` next to `sheet-B.png` and it's clearly the same character. The proportions, head shape, ear
  folds, eye size and position, muzzle size and costume shapes all match.
- `head.png` and `portrait.png` look appealing and polished: glossy amber eyes with catchlights, crisp chin marking
  and blaze, soft folded ears.
- `game.png` (the 45° view) still reads the face and the red scarf and sash.
- ≤ 30k triangles, one atlas material, stands on the ground, faces −Y, no preview warnings, and `joints.json`
  written.

## Time
This is the hero model, so it's worth a longer first round: up to about 60 minutes of wall time. Aim for a strong,
complete first pass (the whole character, textured and previewed) rather than a perfect head and nothing else.
