# Toybox Moka (moka-toy): Blender source

The game's default Moka, the second playable hero (`public/rigs/moka_toy.*`), was built by an Opus agent under Claude's direction
with the toybox-character skill. Opus is now the pipeline's default Blender builder. Codex (GPT-6.1-Sol) drew the concept sheets;
the owner picked "C · Star Scholar" and signed off on the model before it was rigged. This folder archives what's needed to rebuild
it. The working folder `tools/blender/work/codex/moka-toy/` is git-ignored.

- `sheet-C.png`: the approved concept sheet, the blueprint. `concepts/` holds the concept brief, all three options (`lineup.png`)
  and Codex's notes.
- `brief.md`, `direction/opus-prompt.md` and `direction/feedback-*.md`: the brief, the builder prompt and every director round:
  - 2–3 for the model; `feedback-2b.md` is the owner's "the eyes are too low, they're on the cheeks";
  - 4 for the rig;
  - 5 for the face fixes: adaptive face triangulation for the toon band, and lids painted and shaded as fur.
- `build_moka-toy.py`: the deterministic model build. It paints the atlas, writes `joints.json` and exports
  `public/models/moka-toy.glb`. In rig mode it also refines the face triangulation (`REFINE_ADD`).
- `rig_moka-toy.py`: runs the build in rig mode, then adds:
  - the 37-bone hero rig, with the hanging ears on `ear_*` and `earTip_*`;
  - the lid shells;
  - the mouth, cavity and tongue;
  - the weights.
  It writes `joints-rig.json`, which includes the staff grip.
- `rig_tests.py`: the pose, face and toon-check renders. `render_views.py`: the model review renders.

Rebuild (from a copy of this folder, so the outputs don't land in git):
```bash
cp -r tools/blender/codex/assets/moka-toy tools/blender/work/codex/moka-rebuild && cd tools/blender/work/codex/moka-rebuild && mkdir -p scratch
blender --background --factory-startup --python rig_moka-toy.py
blender --background moka-toy_rig.blend --python ../../../codex/hero_export.py -- --out export --name moka_toy --height 1.39
python ../../../codex/install_rig.py export moka_toy
```
Create `scratch/` in the copy first (the build writes there).

**In the game**, `HERO_MODELS.mokaToy` in `src/actors/heroModels.js` sets:
- `darkGrade` [0.2, 4, 16, 12], for the warm grade's maroon cast on her fur;
- `wave: 'front'`: the wave and happy-hop raise her arms forward-up, in front of the long ears;
- `earGain` 0.45, for the ear spring;
- `palm`, from the rig's measured grip.

The "Toybox heroes" setting (or `?chewymodel=disney`) falls back to the Storybook `moka_disney`. Her portrait framing is in
`gfx/portraits.js`.
