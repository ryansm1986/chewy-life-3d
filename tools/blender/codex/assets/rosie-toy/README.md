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

**Round 8 (2026-10-17, Opus agent): "Rosie's face seemed sunken in".**
- **Cause: the mesh shape, not the normals, the normal map or the light.** The build's eye-socket warp (`RECESS`,
  delta 0.045 W ≈ 23 mm) pushed the skin straight back over each eye and out to the temples, but not at the bridge or above
  the brows. The mid-face was concave: curvature +15–18 /W across the bridge, and up to +12 /W above and below the eyes.
  The eyes sat in a recessed plate, and from the 20° camera the bridge slope caught the toon band as a dark stripe beside
  the nose. The normals were exact, and `rosie_toy_n.png` is a flat 4×4 map.
- **The fix**: `RECESS.delta = 0` (`CONVEX`, env `ROSIE_CONVEX=0` restores the old face). The face is the ball, convex
  through the middle, at about −2 /W everywhere. The eyes keep their front-view place, size and 33° facing, and the lashes,
  blush, nose, mouth cut, hair and body are untouched. The toon-band refinement improved (p90 0.55 mm, was 1.40).
  `REFINE_ADD` is now 1200 (was 1300), to keep the triangle total under 34k.
- **The upper lids, rebuilt (`LID8` in `rig_rosie-opus.py`, on by default).** The old shell came out at the top rim,
  under the static painted lash band. Mid-blink it read as an empty skin oval inside a dark outline, its edge tore where it
  grazed the skin, and shut it sank about 3 cm under the cheek, so there was no lash curve. The new lid:
  - hinges 0.21 m behind the eye, 4 mm below its centre;
  - each column is one radius, the skin's distance at the top of the lash band, so the skin-coloured lid always comes out
    along the band top and covers the band from the first frame; one lash line travels down;
  - only its dark lash stripe dives to just outside the eye, so shut its edge tucks under the lower rim and draws one soft
    ∪ lash curve into the flicks;
  - the stripe fades toward the inner corner; the columns past the inner corner cover the band's inner end (it reaches
    X −1.11); the two end columns tuck under the skin;
  - shading normals are the ball's normal, averaged over the angles at which each vertex shows (2–4° from the skin
    mid-blink, was up to 50°).
  The sweep diagnostic (`LID_SWEEP` in the log) checks 13 angles from rest to shut: no holes, hidden at rest (−9.5 mm), and
  flaps only on the painted band. The lower lids and the face controls are unchanged. The happy squint stays at
  `squint: [0.40, -0.26]`: higher values read sad with this hinge, and at 0.40 the upper lid stays on the band, so the
  smile comes from the lower lid.
- 18,945 vertices, 33,908 triangles, no export warnings. The previous install is in
  `tools/blender/work/codex/rosie-opus/installed-backup-1017/` (the archive rebuilt it byte for byte before this round).
- `public/models/rosie-opus.glb`, `joints.json` and `measurements.json` (the non-rig build's outputs) were not rebuilt.
  The game uses only the rig.
