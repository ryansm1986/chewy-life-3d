# The Toybox villagers in Blender: the shared brief (VL-1)

Read this first, then your character's own `brief.md`.

## Why
Blossom Hollow's seven named villagers (Kuma, Usagi, Mochi, Kitsune, Pan, Tanu, Kero) are built today at runtime by the
procedural Toybox kit (`src/actors/toyKit.js`). It reached about 8/10 against their sheets. The owner wants Blender models
to bring them to the heroes' 9/10 finish, like Rosie (`tools/blender/codex/assets/rosie-toy/`), who is the villager-type
model closest to yours. Your character's **sheet is already approved by the owner** (2026-10-02). It is the blueprint:
don't redesign anything, just build it beautifully.

`refs/current-<id>-in-game.png` is the procedural kit version that's in the game now. It shows the identity, and the
level you must beat. Don't copy its construction: its seams, its flat eye pads and its tube-like scarf are what we're
replacing.

## The style anchors (look at all of them)
- `refs/sheet.png`: your character, the blueprint.
- `refs/sheet-B.png` and `refs/chewy-toy-game.png`: the Toybox Chewy, the anchor of the toy line.
- `refs/rosie-sheet.png` and `tools/blender/work/codex/kuma-toy/refs/rosie-toy-in-game.png`: Rosie, a villager-type
  Blender model already in the game. Match her finish: smooth vinyl, clean colour blocks, glossy eyes.

## Phase 1: the model (this round)
1. **Step 0, measure the sheet** (`measure.md`). On the sheet's HEAD FRONT panel measure, in fractions of the head width W
   at the cheeks: the head height, the eye centres (x, y), the eye opening (w, h), the iris and pupil, the muzzle or
   snout (w, h, y), the nose, the mouth, the blush, the brows, and the ears or hat masses (size and position). On the
   full-body FRONT and SIDE views measure the total height, the head : body ratio and the arm, leg, foot and tail sizes.
   Put the table in `measure.md` and model to it. The director checks your table against the sheet, so measure on pixels
   (PIL crops and bounding boxes), not by eye. The director's own rough numbers are in your `brief.md` as a cross-check;
   if yours differ by more than 10%, say which and why.
2. Build it by script (`build_<id>-toy.py`, deterministic) and export `public/models/<id>-toy.glb`.
3. Preview with `--character`, render `portrait.png`, and build the comparisons against `sheet.png`
   (`preview/cmp-head.png` front and 3/4, `cmp-side.png`, `cmp-back.png`, `cmp-eyes.png`, `cmp-body.png` front/side/back
   at the same scale).
4. Report and stop.

## Technical (the same for all seven)
- The contract in `.claude/skills/codex-blender/templates/codex-preamble.md` (1 unit = 1 m, front −Y, feet on z = 0).
- A neutral A-pose, arms about 25–30° out, centred.
- **≤ 30k triangles** (the head and face up to half), **one material with one 2048² painted atlas**. Smooth silhouettes:
  no polygon steps at portrait size. No fur cards, no strands.
- **Rig-ready** for the game's 37-bone hero contract (phase 2, later; the same contract as Rosie and the heroes):
  - eyeballs as separate spheres; loops around the eyelids and the mouth corners;
  - the ears, the tail and any hanging cloth (scarf ends, apron ties) as separate pieces with bend loops;
  - enough loops at the shoulders, elbows, hips and knees; hidden body surface deleted;
  - joint positions in `joints.json` (metres).
- Villagers stand about **1.0–1.15 m** to the crown (your brief gives the exact target). They're smaller than the
  heroes' 1.2 m.

## Lessons from the heroes and Rosie (each one cost a round)
- **The face is a ball and stays convex.** No eye sockets, no recessed eye plate, no flat front. Rosie's round 8 found a
  socket warp had made her face look sunken; the fix was zero recess. Eyes sit on the curved surface, at most 0.015 W
  proud, facing about 30° outward; only the nose (and, for animals, a gentle muzzle) projects. Check the side view early:
  forehead, cheek and chin form one convex arc.
- **Eyes sit mid-face, above the muzzle.** The iris bottom is at or above the nose top. A tall bare forehead makes the eyes
  read low ("on the cheeks").
- **The eyes carry the appeal.** Match the sheet: the iris about 68% of the opening width, tucked toward the nose, white
  crescents on the outer side, a big pupil, two catchlights and a thick upper lash line with a small wing, laid flat on
  the skin.
- **Ears, hair, tails and cloth are thick volumes**, never thin cards. Check them from both 45° game yaws: thin flaps read
  as spikes edge-on. Folded or tucked shapes stay under the head's outline.
- **Head accessories from 45° above** (hats, flowers): judge them in `game.png`, not only from the front. A brim that's
  right from the front can read as a plate lying on the head.
- **Painted patches have rounded, clean shapes** with crisp borders (calico patches, muzzles, ear tips).
- **Toon light**: the game shades with a hard light/shade band. Keep the face triangles fine where the surface curves
  fast, or the band zigzags. Smooth normals, no dents, nothing crumpled.
- **Measure on the comparison image, never by eye.**

## Process rules
- Blender 4.3: `"C:\Program Files\Blender Foundation\Blender 4.3\blender.exe" --background --factory-startup --python …`.
- **Other builders run Blender at the same time** (up to four villagers at once). Record the PID of every Blender run you
  start and stop only those. **Never** `taskkill /IM blender.exe` or kill by name. Wrap each run in a timeout (about
  900 s) and cap loops and samples.
- Write only inside your task folder, plus your `public/models/<id>-toy.glb`. Don't edit `src/`, don't run git, don't
  install anything.
- End your reply with the report (what you built, triangles and size, measured targets vs yours, what you checked,
  known issues), then stop and wait for the director's feedback.
