# Asset brief: <id>-toy (the Toybox <Name> model, phase 1: the model)
<!-- Claude fills in the <…> parts from MEASURING the approved sheet (on a same-scale crop, not by eye), then deletes hints. -->

## What it is
**<Name>**, <role>. The owner picked design **Option <X>**: the attached `sheet.png` is **the blueprint**, so match it
closely. It's the same toy line as the new Chewy (attached `sheet-B.png`, and `chewy-toy-game.png` in game), so match his
style and finish too.

This task has two phases:
- **Phase 1 (now)**: the model in a neutral A-pose, until the director rates it 9/10 and the owner signs off.
- **Phase 2 (later)**: rigging.
Build rig-ready, but don't rig yet.

## Measured targets
(W = head width at the cheeks, H = crown to chin excluding hair or ears; y is measured down from the crown.)
- **Heights**: total **<1.20> m** to the crown (not counting <ears / hair buns>). Head H ≈ <…> of the total. About 2.4
  heads tall.
- **Head**: W : H = <…>. Outline <squircle / round …>.
- **Eyes**:
  - centres at x = ±<…> W, y = <…> H;
  - opening <…> W wide × <…> H tall (height/width <…>);
  - iris <68>% of the opening width × <90>% of its height, tucked toward the nose;
  - pupil <70>% × <76>% of the iris.
  Match sheet-B's eye construction.
- **Head as a ball**: the face wraps around a rounded skull. In profile, forehead, cheek and chin form one convex arc, and
  only the nose projects. Each eye faces about 30–35° outward, following the head's surface, set into it (not on a flat front
  plate), and the far eye is hidden in the side view.
- **Nose / mouth**: nose <…> W wide at y = <…> H; mouth <…> W wide at y = <…> H; <muzzle depth for animals>.
- **Brows / blush**: <…>
- **Hair / ears**: <masses, sizes, how they sit on the head, their volume (thickness ≥ … W, so they never read as thin
  cards edge-on)>
- **Body / limbs / hands / feet**: <…>
- **Costume**: <each piece, with colours and measured shapes>
- **Palette (hex)**: <…>

## Technical
- A neutral A-pose (arms about 30° out), facing **−Y**, standing on z = 0, centred.
- **≤ 30k triangles** (the head, face and eyes may take up to half). One material with **one 2048² painted atlas**. No
  hair strands or fur cards.
- Your choice of technique: subdivision modelling, the repo's SDF kit (`{{REPO}}/tools/blender/disney/sdf.py`, read-only
  import) or remeshing, then clean it up.
- **Rig-ready**:
  - eyeballs as separate spheres;
  - loops around the eyelids and mouth corners;
  - the ears, hair locks and tail as separate pieces with bend loops;
  - enough loops at the joints;
  - hidden body surface deleted.
  Record the joint positions in `joints.json` (metres).
- Output: `public/models/<id>-toy.glb`.
- Preview **with `--character`**:
  `blender --background --factory-startup --python {{REPO}}/tools/blender/codex/preview.py -- --in {{MODELS_DIR}}/<id>-toy.glb --out {{TASK_DIR}}/preview --character`
  - Render `portrait.png` too: 3/4, head and shoulders, soft studio light.
  - Build the **same-scale comparisons against `sheet.png` yourself** (PIL): `preview/cmp-head.png` (front and 3/4),
    `cmp-side.png`, `cmp-back.png` and `cmp-eyes.png`. Check them before every report.

## Done when (phase 1)
- The turnaround and head comparisons read as the same character as `sheet.png`, within about 5% on the measured targets.
- `portrait.png` looks appealing and polished, in the same finish as the Toybox Chewy.
- `game.png` (45°) still reads the face and the signature colours; no part reads as a thin spike from either 45° yaw.
- ≤ 30k triangles, one atlas, stands on the ground, faces −Y, no preview warnings, and `joints.json` written.
