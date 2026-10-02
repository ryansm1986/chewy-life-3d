---
name: toybox-character
description: Make a character (hero, villager, NPC or companion) in the game's "Toybox Chibi" style, end to end. Codex (GPT-6.1-Sol) draws Toybox-style model sheets, the USER approves one, then an Opus agent (the default; Codex on request) models it in Blender by script under Claude's measured feedback until 9/10, rigs it to the game's 37-bone contract (or the quad contract), and Claude exports and integrates it and runs QA. Use when the user wants a new, redesigned or "toybox" version of a character (e.g. "do a new Rosie", "make Kuma in the toybox style").
---

# Toybox character pipeline (concept → user approval → Blender model → rig → game)

This is the flow that produced the **Toybox Chewy** (`public/rigs/chewy_b.*`; archive in `tools/blender/codex/assets/chewy-b/`).
Claude directs and reviews every round. **Codex draws the concept sheets**, on the **codex-blender** skill's runner
(read `.claude/skills/codex-blender/SKILL.md` once for the runner, sandbox and guardrails). **An Opus agent does the Blender
work by default.** The user chose that on 2026-10-01 after Rosie and Shadow: Opus fixed Rosie's head in 3 rounds where Codex
had plateaued after 12.

**The style anchor is the Toybox Chewy.** Every new character must look like it belongs next to him:
- the concept sheet `tools/blender/codex/assets/chewy-b/sheet-B.png`;
- in-game shots of the model (`/?test=chars&only=chewy`).
Attach both to every concept and model brief.

Runner: `node .claude/skills/codex-blender/scripts/codex-blender.mjs start|resume|status …`.
- Always run it with the Bash tool with `run_in_background: true`, and wait for the notification. Don't poll or sleep.
- One run per task at a time: a `run.lock` in the task folder refuses a second start/resume while one is alive.
  Never queue a delayed resume with `sleep` in a background shell (it can outlive your view of it and overlap a manual
  resume); when a usage limit hits, tell the user the reset time and resume after it.
- It exits 3 when Codex's turn failed (e.g. "model is at capacity"). Review what exists, then `resume` the same task
  when the model is available; the session keeps its context.

## Stages and gates

### 1. Scope and references
- Pick the character id (as in the game: `rosie`, `kuma`, …) and two task names: `<id>-concept` and `<id>-toy`.
- Collect references into `tools/blender/work/codex/<id>-concept/refs/`:
  - the current in-game look: `node tools/shot.mjs --url "/?test=chars&only=<id>&dist=4"` and the portrait from
    `/?test=portraits`;
  - the style anchor: `sheet-B.png` plus an in-game Toybox Chewy shot;
  - the user's own art or photos, and older versions in sibling projects (search `D:/projects/*` for the id);
  - read the character's spec (`CAST` / `VILLAGER_SPECS` in `src/actors/charKit.js` and `roster.js`) and their story
    role (`src/world/story.js`).
- Note the must-keep identity: species, colours as hex, signature items and personality.

### 2. Concept sheets (Codex draws; about 15–20 minutes)
- Fill in `templates/concept-brief.md`. It fixes the Toybox style and asks for **three genuinely different designs within
  that style** (costume, hair, silhouette), not three styles.
- Run it:
  `start --kind concept --task <id>-concept --brief … --image <sheet-B> --image <chewy in game> --image <current id> …`
- Review each sheet yourself:
  - identity kept;
  - style match with sheet-B (proportions, rendering, palette softness);
  - front, side and back views consistent enough to model;
  - no anatomy errors.
  Regenerate weak ones with `resume`.
- Build a side-by-side of each option next to sheet-B (`scripts/compare.py`) to check the family resemblance.

### 3. GATE 1: the user picks a design
- Show the sheets (SendUserFile when available, otherwise their paths) with one or two lines per option: the idea and
  any risks (for example, "views disagree on the hair length").
- Ask with AskUserQuestion (A / B / C, "mix", or "none: try again"). **Never start modelling without the user's pick.**
- Copy the chosen sheet to `tools/blender/work/codex/<id>-toy/refs/sheet.png`.

### Builder choice for stages 4–6: Opus (default) or Codex
The concept sheets always come from Codex (stage 2, image generation). The **Blender stages** can run on either builder:
- **Opus** (the default): fill in `templates/opus-builder.md` and launch it with the **Agent** tool:
  `subagent_type: "general-purpose"`, `model: "opus"`, `run_in_background: true`,
  `description: "<id>-toy Blender build"`. Put the brief in `tools/blender/work/codex/<id>-toy/brief.md` (the model
  brief).
- **Codex**, only when the user asks for it: the runner with `--kind model --effort xhigh`, as in stage 4's notes.
- If the agent stops on an API session limit, tell the user the reset time, then resume it **with SendMessage to the same
  agent** after the reset. That keeps its context; a new agent would start over.
  - Each feedback round goes to **the same agent** with SendMessage (it keeps context): send the `feedback-<n>.md` content
    plus the image paths to look at.
  - Review the same way for either builder. The work folder, previews, comparisons and archive are the same, so the rest of the
    pipeline doesn't change.
  - Note the builder in the archive README.

### 4. Model (the builder models in Blender; about 45–60 minutes per round, 3–4 rounds with Opus)
- Fill in `templates/model-brief.md`, **measuring the sheet**:
  - the head width W and head height H;
  - eye centres and opening sizes, nose, mouth, ear or hair masses, all as fractions of W and H;
  - total height (villagers and heroes are about 1.2 m to the crown).
- Launch the builder with the brief, the sheet, the style anchor and the old model marked "not this" if the user dislikes
  it (Codex: `start --kind model --effort xhigh` with `--image` for each).
- **Every review round:**
  1. Read `report.md` and the previews (`turnaround.png`, `head.png`, `portrait.png`, `game.png`).
  2. Make **same-scale comparisons** with `scripts/compare.py`: head front and 3/4, side and back, and eyes-only.
     **Measure on the comparison image, never by eye.**
  3. Look at it in the game: `/?test=glb&url=/models/<id>-toy.glb&dist=5`, from both 45° yaws (`&yaw=-0.8`).
  4. Score it out of 10, then write `feedback-<n>.md`:
     - what's approved and **locked**;
     - numbered fixes with measured targets;
     - say explicitly what stays fixed when something moves (see lessons).
  5. Send the round to the builder (Opus: SendMessage with the feedback path; Codex: `resume` with the comparison images).
- Ship at **9/10** against the sheet. Use `templates/review-checklist.md`.

### 5. GATE 2: the user signs off on the model
- Show the portrait, the turnaround comparison and an in-game shot. Ask whether to rig or to change something. The user
  often spots a thing you missed; for Chewy it was "more whites of the eyes".
- Apply their notes in more model rounds, measured the same way.

### 6. Rig (the same builder, 1–2 rounds)
- Send `templates/rig-brief.md`, filled in, to the builder (SendMessage, or `resume` for Codex). It covers:
  - the 37-bone contract and axis mapping;
  - the face controls and their exact game values;
  - the lid shells, mouth cavity, weights and pose tests.
- The builder runs `tools/blender/codex/hero_export.py` into its `export/` folder and must reach **no warnings**.
- Review `preview/poses.png`, `face.png` and the close crops. Then install the export with
  `python tools/blender/codex/install_rig.py <task>/export <name>`, which copies all four files (.json, .bin, .png,
  _n.png; a `name.*` glob misses `_n.png` and the game silently falls back to the old rig). Then check it in the game:
  - `node .claude/skills/toybox-character/scripts/face-check.mjs --id <id>` gives rest, talk, blink, bark and happy
    frames on `/?test=chars`;
  - also check walking and a swing if the character fights.
- Send back what you see (cracks, tearing, lids showing at rest) until it's clean.

**Quadrupeds** (Shadow, animals): use the 21-bone quad contract, `hero_export.py --contract quad` (`QUAD_BONES` /
`QUAD_PARENT`). The Animator's `poseQuad` drives `body`, `head`, the four legs (children of `root`), `tail1` and the
whole-ear springs, plus the `sit` and `bark` actions. `heroModels.js` builds the quad parts when `meta.contract === 'quad'`,
and `sitDrop` on the entry sets how far the hind legs drop in a sit. Shadow's rig brief
(`tools/blender/codex/assets/shadow-toy/direction/feedback-4.md`) is the template.

### 7. Integrate (Claude)
- **Load it**: add an entry to `HERO_MODELS` in `src/actors/heroModels.js` with the file, name, earGain, tint and
  palm/back attach points, and add the id to `loadHeroModels([...])` in `src/game.js`.
- **Characters that aren't the player** (villagers, Rosie): construct the NPC with
  `rig: heroModelReady(id) ? buildHeroModel(id) : null`, where it's created (`game.js` for Rosie, `village.js` for
  villagers). Portraits pick it up automatically (`gfx/portraits.js` uses `heroModelReady`).
- **Colour in the game's light**: the warm grade shifts browns toward maroon. Compare an in-game crop with the sheet and
  set `tint: [r, g, b]` on the entry (Chewy uses [1.05, 1.12, 1.18]).
- **Dark coats need `darkGrade`, not a tint.** The grade pass lifts dark pixels toward violet (`uLift` in
  gfx/post.js), so near-black fur renders purple even when it's neutral grey, and a material tint would shift the whites
  too. Set `darkGrade: [desat, r, g, b]` on the entry: the hero shader desaturates and biases only the dark texels
  (Shadow: `[1, -4, 14, -9]`). Sample the rendered fur and aim for a cool slate (about 37, 30, 55 on screen), not green.
  Portraits render without the grade pass and zero it (`gfx/portraits.js`); don't bake a bias into the atlas, because the
  portraits would turn green.
- **Keep a way back**: the old model stays as a fallback, and a Setting or URL param if the user wants one.
- **Test pages**: `/?test=chars` and `/?test=portraits` must build the baked model for that id too.

### 8. QA, archive, memory
- Run the QA:
  - `tools/qa/s12-heroes.mjs` (for heroes), `s8-dialogue.mjs` (villagers), `s1-roundtrip.mjs`, `s13-regions.mjs`;
  - `tools/qa/prod-smoke.mjs`, and add a check that the production build uses the new model.
- Archive the sources into `tools/blender/codex/assets/<id>-toy/`: the build and rig scripts plus their inputs, the
  sheet, the briefs, `direction/feedback-*.md` and a README. The work folder is git-ignored.
- Update memory and docs (ARCHITECTURE.md, the rig section). Commit only when the user asks.

## Lessons (from the Toybox Chewy; they're also in review-checklist.md)
- **Prose gets over-corrected.** "A real muzzle" became a fox snout; "bigger ears" became Mickey paddles. Give numbers,
  normalised to the head width, measured from the sheet, plus same-scale crops.
- **Measure on the comparison image.** A height misread by eye made the eyes 20% too small for a round.
- **Say what stays fixed.** "Move the top edge down" shrank the chin patch, because Codex kept the other end fixed.
- **Check thin parts from both 45° game yaws.** Thin flaps read as spikes edge-on, so give ears and hair locks volume.
- **Toon light and grade shift colour.** Judge colour in the game, and fix it with a runtime `tint` (or `darkGrade`
  for dark coats) rather than endless repaints. Check the portraits too: they render without the grade pass.
- **Brief the game's real values.** The happy squint is `0.4 × 1.22 = +0.488` on the upper lids (animator.js `face`), not
  +0.4; an under-stated value made Shadow's happy eyes read sad. Read the numbers from the code when writing a rig brief.
- **The face wraps a ball.** Check the side view early: eyes on a flat front plate, all facing forward, look terrible in
  profile (the whole face points sideways). Eyes face about 30° outward, set into the head's curve; only the nose projects.
- **Eyes sit above the muzzle, mid-face.** On Moka the owner said "the eyes are too low, they're on the cheeks", even though
  they matched the sheet's height. A nose level with the bottom of the eyes and a tall bare forehead made them read low. Keep
  the iris bottom at or above the nose top, and the brows close under the hair or brim.
- **The eyes carry the appeal.** Match the sheet's white, iris and pupil proportions exactly (iris about 68% of the
  opening width, tucked toward the nose, white crescents outside). Lashes frame them.
- **Face controls must be invisible at rest.** Lids and the mouth cavity must be hidden at the game's neutral values
  (lidD is held at −0.1), from every view including the 45° camera.
- **Lock what's approved each round**, so the builder doesn't touch it again.
- **Test faces under the game's toon band.** The game shades with a hard light/shade band (`smoothstep(-0.04, 0.34, N·L)`
  mixed 25% with a half-Lambert). On Rosie it drew a zigzag down the face, even though the normals were exact: her face
  triangles were too coarse where the surface curves fast. Ask for a hard-ramp toon render (`preview/toon-check.png`, a
  sun about 50° up at yaw ±0.6) in the rig round, and adaptive face triangulation if the band zigzags.
- **Check the game's action poses on the new proportions.** The wave and happy-hop raise the arms inward-up, which hid
  Rosie's short arms in her curls. Per-model Animator overrides on the HERO_MODELS entry (`wave`: 'out' or 'front', `squint`) fix that
  without touching other characters.
