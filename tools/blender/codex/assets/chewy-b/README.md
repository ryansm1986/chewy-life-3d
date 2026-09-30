# Toybox Chewy (chewy-b): Blender source

The game's default Chewy (`public/rigs/chewy_b.*`) was built by the Codex CLI (GPT-6.1-Sol) under Claude's direction,
with the codex-blender / toybox-character skills. This folder archives what's needed to rebuild it; the working folder
`tools/blender/work/codex/chewy-b/` is git-ignored.

- `sheet-B.png`: the approved concept sheet ("B · Toybox Chibi"), the blueprint.
- `brief.md` + `direction/feedback-*.md`: the modelling brief and every director feedback round (2–15). The measured
  targets and the lessons are in there.
- `build_chewy-b.py`: the deterministic model build (inputs `ear-front-round5.json` and `ear-front-paint-round5.png`).
  It paints the atlas, saves `chewy-b.blend` and exports `public/models/chewy-b.glb`.
- `rig_chewy-b.py`: rebuilds the model through build_chewy-b.py, then adds the 37-bone hero rig, the lid shells, the
  mouth cavity and the weights, and saves `chewy-b_rig.blend` (reads `joints-round13.json`).

Rebuild (from a copy of this folder, so the outputs don't land in git):
```bash
cp -r tools/blender/codex/assets/chewy-b tools/blender/work/codex/chewy-b-rebuild && cd tools/blender/work/codex/chewy-b-rebuild
blender --background --factory-startup --python rig_chewy-b.py
blender --background chewy-b_rig.blend --python ../../../codex/hero_export.py -- --out ../../../../../public/rigs --name chewy_b --height 1.2
```
(`rig_chewy-b.py` first copies a few round-13 review images if they exist; this archived copy skips missing ones.)
