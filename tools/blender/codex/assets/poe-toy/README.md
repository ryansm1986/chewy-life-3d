# Toybox Poe (poe-toy): Blender source

Poe, the black pug ninja and the third playable hero (`public/rigs/poe_toy.*`, plus her fūma prop
`public/models/poe-fuma.glb`), was built by an Opus agent under Claude's direction with the toybox-character skill.
- **The concepts** were drawn by Codex (GPT-6.1-Sol). The owner picked a mix: B's black pug in C's bamboo outfit, drawn
  as **"D · Bamboo Shinobi (black)"**.
- **The work folder** `tools/blender/work/codex/poe-toy/` is git-ignored.

**What's here:**
- `sheet-D.png`: the approved concept sheet, the blueprint.
- `concepts/`: the concept brief, the mix round (`concept-feedback-1.md`) and Codex's notes.
- `brief.md` (with measured targets) and `direction/feedback-2..4.md`:
  - 2: the button ears, cheeks, nose, sheen and mask placement;
  - 3: the compact ears under the crown, the rounder head;
  - 4: the blunter ear tips, then the rig.
  - A follow-up round (4b) rebuilt the closed-eye lid edge so a blink reads as a "∪" lash. The game sets
    `squint: [0.58, -0.24]` to match.
- `build_poe-toy.py`: the deterministic model build. Its exports:
  - `public/models/poe-toy.glb`;
  - `fuma_back` as its own prop, `public/models/poe-fuma.glb`.
- `rig_poe-toy.py`: runs the build in rig mode, then adds:
  - the 37-bone hero rig;
  - the ear pivots, moved under the ears so they glide over the round skull;
  - the left ear damped to `LEFT_EAR_K = 0.12` so it stays out of the festival mask;
  - the lid shells;
  - the mouth cavity;
  - the weights.
- `fuma_mount.json`: the back mount, in model space and chest-bone frame. The game's `HERO_MODELS.poeToy.fumaMount` uses
  it.
- `rig_tests.py`, `pose_check.py` and `validate.py`: the pose, face and toon renders, the fur-through-cloth counts and the
  export validation.

**Rebuild** (from a copy of this folder):
```bash
cp -r tools/blender/codex/assets/poe-toy tools/blender/work/codex/poe-rebuild && cd tools/blender/work/codex/poe-rebuild && mkdir -p scratch preview export
blender --background --factory-startup --python rig_poe-toy.py
blender --background poe-toy_rig.blend --python ../../../codex/hero_export.py -- --out export --name poe_toy --height 1.2
python ../../../codex/install_rig.py export poe_toy
```
