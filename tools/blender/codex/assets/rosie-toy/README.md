# Toybox Rosie (rosie-toy): Blender source

The game's Rosie, the village baker and Chewy's best friend (`public/rigs/rosie_toy.*`), was built by an Opus agent under
Claude's direction with the toybox-character skill. Codex (GPT-6.1-Sol) drew the concept sheets; the owner picked
"A · Sweetheart" and signed off on the model before rigging. This folder archives what's needed to rebuild it. The working
folder `tools/blender/work/codex/rosie-opus/` is git-ignored.

**History.** Codex modelled Rosie first, for 12 rounds. The body and costume came out well, but the head lost its round
shape. The owner moved the model to an Opus agent, which rebuilt the head as a ball in 3 rounds.
`direction/codex-track/` keeps Codex's brief and its feedback rounds for the lessons, and
`public/models/rosie-toy.glb` is Codex's last model.

- `sheet-A.png`: the approved concept sheet, the blueprint. `concepts/` holds the concept brief, the three options
  (`lineup.png`) and Codex's notes.
- `brief.md` and `direction/feedback-*.md`: the Opus brief and every director round:
  - 2–3 for the model;
  - 4 for the rig;
  - 5 for the face fixes: shading triangulation, blink and squint;
  - 6 for the owner's "her head isn't round like the other chibis": a bigger, chubbier head (W 0.52 m) and a lower crown.
- `build_rosie-opus.py`: the deterministic model build.
  - It paints the atlas, saves `rosie-opus.blend`, writes `joints.json` and `measurements.json`, and exports
    `public/models/rosie-opus.glb` (an absolute path; a rebuild rewrites the same bytes).
  - With `RIG_MODE` (set by the rig script) it also refines the face triangulation for the game's toon band and skips the
    export.
- `rig_rosie-opus.py`: runs the build in `RIG_MODE`, then adds:
  - the 37-bone hero rig;
  - the lid shells;
  - the mouth cut, cavity and tongue;
  - the weights.
  It saves `rosie-opus_rig.blend` and writes `joints-rig.json`.
- `rig_tests.py`: the pose, face and toon-band test renders (`--only toon` for the hard-ramp check). `render_views.py` is the
  model review renders.

Rebuild (from a copy of this folder, so the outputs don't land in git):
```bash
cp -r tools/blender/codex/assets/rosie-toy tools/blender/work/codex/rosie-rebuild && cd tools/blender/work/codex/rosie-rebuild
blender --background --factory-startup --python rig_rosie-opus.py
blender --background rosie-opus_rig.blend --python ../../../codex/hero_export.py -- --out export --name rosie_toy --height 1.29
python ../../../codex/install_rig.py export rosie_toy
```

**In the game** (`HERO_MODELS.rosie` in `src/actors/heroModels.js`; `game.js` hands her Villager this rig when it's loaded):
- **`darkGrade` [0.4, -10, 6, 4]**: the warm grade turned her chocolate hair maroon.
- **`wave: 'out'`**: the wave and happy-hop raise her arms outward, since inward-up hid her hands in her curls.
- **`squint` [0.40, -0.26]**: her happy lids.
- **`hat`**: the nightcap anchor.

The portrait framing is in `gfx/portraits.js`. Without these files she falls back to the kit `CAST.rosie`.
