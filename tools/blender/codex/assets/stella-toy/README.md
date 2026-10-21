# Toybox Stella, Weimaraner healer (stella-toy): Blender source

Stella, the female Weimaraner Sun Oracle (sixth hero, from Shiokaze Port), is `public/models/stella-toy.glb`, with her
sun wagasa `public/models/stella-parasol.glb`. Her rig is the hero export `stella_toy`. An **Opus agent** built
her by script under Claude's direction with the toybox-character skill: model in four rounds, then the rig, then phase 3.
- **The concept** was drawn by Codex. The owner picked **Option C, "Jellyfish Oracle"**, with blue eyes, for the shapes.
- **Phase 3, the Sun Oracle** (`direction/sun-brief.md`): the owner redirected her theme and picked **Option B, "Midday"**
  (`refs/sheet-sun.png`). The shapes, UVs and rig are unchanged; the costume is repainted in the atlas (saffron #F0C24E
  top, sleeves and outer skirt; warm white #FFF9EC petticoats, cuffs and motifs; sunset red #D9573E obi, bow and collar;
  amber #DFA23C beads), sun discs and sun rays replace the sparkles, and the jellyfish parasol becomes the sun wagasa.
- **The work folder** `tools/blender/work/codex/stella-toy/` is git-ignored. It keeps the .blend files, the exports and
  every review render.

**What's here:**
- `refs/sheet.png`: the approved concept sheet (Option C redrawn with blue eyes), the blueprint for the shapes;
  `refs/sheet-sun.png`: the Midday sheet, the blueprint for the colours and the wagasa.
- `brief.md`, `measurements.json` (from `measure_sheet.py`) and `direction/feedback-1..3.md`: the model brief and the
  first three review rounds.
  - Round 1: head widths, darker nose, bell sleeves, cooler fur.
  - Round 2: wider fanned ears, bell flare.
  - Round 3: ears hang vertically in game-45.
  - Round 4 (as a message) was approved.
- `rig-brief.md`: the rig brief (joint ranges, weights, lids, mouth, tests).
- `build_stella-toy.py`: the deterministic model build. It paints the atlas (the Midday palette is the `PAL` table's
  costume entries) and exports both public GLBs. It also writes `joints.json`, `measurements-model.json` and
  `prop_mount.json` (the wagasa's grip, axis, finial and tassel hang points).
- **The sun wagasa** (`stella-parasol.glb`, 5,730 triangles, 0.80 m canopy, 0.81 m shaft): a peaked sunburst canopy of
  saffron rays and red panels with gold ribs and a pale underside; a red lacquer shaft with a crook. Its nodes:
  - `stella_parasol`: the canopy, ribs, rim, shaft and crook (a 512 atlas);
  - `sun_disc_glow`: the gold sun disc, material `Stella_wagasa_sun_glow` (#E8B44A, value 0.91: under pure white);
  - `finial`: an empty at the disc's centre (game [0, 0.63, 0]), where her light leaves the wagasa;
  - `tassel_0..7`: eight chunky amber tassels, each its own mesh with its origin at its hang point (game y 0.412).

  The grip is at the origin and the shaft runs along +Y (game), as with the jellyfish parasol. `wagasa_views.py` renders
  `preview/wagasa.png` (side, 3/4, top, below, next to the sheet's callout).
- `rig_stella-toy.py`: the rig. It runs the build in RIG mode, which never writes `public/models`, then adds:
  - the 37-bone hero rig, with world-axis rotations;
  - the lid shells on the tilted hinge;
  - the mouth cavity and tongue;
  - the weights.

  It saves `stella-toy_rig.blend`, `joints-rig.json`, `rig-part-labels.json` and `prop_mount.rig.json`.
- `rig_tests.py`, `pose_check.py` and `validate.py`:
  - the pose, face, toon and crop sheets;
  - the poke-through, shell-crossing, earGain, closed-eye and open-mouth checks (`pose-check.json`);
  - the export validation, including the lock against the approved GLB and atlas (`validation.json`).

  `run_rig_round.sh` runs the whole rig round.
- `make_compare.py`, `render_views.py`, `review.sh`, `head_round.sh` and `measure/*.py`: the model rounds' review
  renders, same-scale sheet comparisons and measurements (ear width / game-45 angle, hem flare, width table).
- `review_sheets.py` (phase 3, from the rig): `preview/face-sheet.png` (rest, talk, blink, mid-blink 0.6 and 0.9, bark,
  happy; front and both game yaws), `body-midday.png` (front, game ±45, back) and `wagasa-poses.png` (the cast, the carry
  in the paw, the chest carry while walking, the sit; game ±45 and front).
- `measure/carry_clear.py`: how the carry and cast directions were picked. It ray-casts her face and head against the
  wagasa at the game camera (45° down, yaws 0 to ±90), checks the canopy against the head and ears (also at the game's
  head-turn and ear-swing extremes), and renders candidates. Run it from a task folder's `measure/` or `scratch/`.
- `run_blender.py`: runs one Blender 4.3 job with a time cap. It logs its PID to `pids.log` and kills only that PID.

**The game's values** (for the `HERO_MODELS` entry):
- `lidTilt: 0.5585`: her eyes face 32° outward.
  - The lid hinges are (0.848, 0, ∓0.530) in game axes (animator.js `lidTurn`); in Blender, L (0.84805, 0.52991, 0) and
    R (0.84805, −0.52991, 0).
  - They are also in `joints-rig.json` as `lidTilt` and `lid_hinge_blender`. The test scripts turn the lid bones about
    these hinges.
  - Without lidTilt the lids would turn about world X, which this rig is not built for.
- `squint`: the default `[0.488, -0.24]`, which the lids are designed for.
- `earGain: 0.8`: the largest gain whose full-range sweep stays under 6 mm (ear into head 2.0 mm, ear/sleeve crossing
  4.9 mm).
- `wave: 'front'`: with `'out'` the raised arm goes behind her long ears.
- `anim: { sitThigh: -1.0 }`: −1.4 lifts the bell skirts a lot.
- **The sun wagasa** (`prop_mount.rig.json`; phase 3 changed the cast and the carry, `stellaGear.js` `GRIP` and
  `parasolMount` take the new numbers):
  - In the right paw: grip `[-0.03976, -0.03183, 0.0025]` on `hand_R` (unchanged).
  - **Cast** (`GRIP.cast`, upper arm `[-2.4, 0, -0.12]`): `[0.831517, -0.078793, 0.117034, 0.537283]`. Raised over her
    head, leaning about 30° out and back (Blender lean (-0.35, 0.45, 1)). The old `[0.912831, 0.000529, 0.048648,
    0.405428]` cut the canopy into her crown and hid a third of her face from the right 45° yaw; this one covers none of
    her face from yaws 0 to ±45 (1.3% at −60) and clears the head and ears.
  - **Carry in the paw** (`GRIP.shoulder`, arm pose `upperarm_R [-0.55, 0, -0.10]`, `forearm_R [-1.0, 0, 0]`,
    unchanged): `[0.264693, -0.141442, 0.392361, 0.869474]`.
  - **Carry on the chest** (`parasolMount`, while the arm swings): bone `chest`, `pos [-0.37931, 0.56792, 0.17561]`
    (model space, game axes), `quat [-0.421275, 0.170075, 0.333494, 0.826065]`.
  - The carry's shaft (game axes) is `[-0.69427, 0.42262, -0.58256]`: 65° from vertical, heading 50° from straight back
    toward her right (`CARRY_DIR=65,50` in the rig script). The wagasa leans back and out past her right shoulder with
    the canopy behind her head. Measured with `measure/carry_clear.py`:
    - 0% of her face is covered from yaws 0, ±30, ±45, ±60 and ±90 (45° down);
    - the canopy clears the head by 184 mm and the right ear by 88 mm at rest, and by at least 15.7 mm at the game's
      extremes (head turn ±0.45, nod, ear swing ±0.35 X, ear tips +0.6 / −1.0).
    - Why not a shaft resting on the shoulder: the carry pose's paw is 0.38 m out at her side at chest height, and the
      0.8 m canopy starts 0.43 m up the shaft. Every inward heading (the old carry was about 57° / −33°) cut the canopy
      through her head or right ear, and headings under 40° touch the right ear.

**The final checks:**
- `HERO_EXPORT {"name": "stella_toy", "verts": 17656, "tris": 33610, "warnings": []}` (2026-10-17: the Midday rig with the
  nose fix and the rebuilt mid-blink lids).
- Validation passes; the approved meshes are 0.0 mm off at rest. Against round 4 every object keeps its shapes and UVs
  (0.0 mm, 0.0 UV), the atlas changes only in the costume's charts and ramp rows (0 pixels changed elsewhere), and the
  rig's atlas is the model's outside the lid, cavity and tongue charts.
- Lids are hidden at rest from every view, and through the whole blink. Mouth: no holes.

**Fixes after the in-game check** (in the rig since checkpoint 1; phase 3's model build carries them into
`public/models/stella-toy.glb` too):
- **The nose** is repainted from #573F42 (chocolate in the game's toon light and grade) to the sheet's dusty mauve: base
  #8F7474, top highlight #A88A8A, underside #6F5456, nostrils #5C4448. `validate.py`'s atlas lock allows the nose's
  pixels and its ramp row.
- **The mid-blink lids (rebuilt 2026-10-17).** In the game, from the look camera (20 degrees up, both 45 degree yaws),
  the half-closed lid showed a pale flap past the lash at the outer corner, a torn lash edge, and the iris between the outline
  and the lid at the inner corner. The earlier fix had been checked only from 45 degrees down. The game's hinge was right
  (`lidTilt` 0.5585 matches the rig). The lid shell was wrong:
  - the eye is a flat lens about 25 mm inside the face, and a rigid shell row sweeps a circle about the hinge: every row
    passes the upper rim, so its radius must clear the eyeball there and stay under the skin just above it (a band about
    6 mm wide). The old rows sat outside that band (inside the eyeball near the top: the tear; out of the skin at the
    corners: the flap), because the solve only bounded them at the closed and squint angles;
  - the hinge sat 2 cm low (`PIV_DZ` -0.02), so the lower rim was about 20 mm nearer the hinge than the upper rim, and
    the closed lid's dive under the lower rim fought the mid-blink.

  The solve (`MID_FIX`, default on; `MID_FIX=0` rebuilds the old lid) raises the hinge 2 cm (`PIV_DZ` 0; R stays 0.12, so
  the 0.488 squint still covers the top 30% and `lidTilt` is unchanged). At 14 angles from 0.1 to 1.16 it keeps each
  vertex in front of the eyeball wherever its hinge ray sees the eye (`G_MID` 1.5 mm), and under the skin wherever it does
  not (up to `MID_UMAX` 1.04). Over the eye the closed lid's face-level cover is a target, not a bound (`COVER_SOFT`), and
  the mid-blink bound beats the closed lid's dive under the lower rim (`MID_WINS`). The closed lash now runs down to the
  shell's own edge (`LASH_EDGE` 5.5-8.5 mm), so the half-closed edge is one lash line.
  - `LID_MIDVIEW` logs a ray count from 8 game views at 9 angles. At 0.732 the flap / tear / gap counts were 215 / 100 / 13
    before and are 92 / 27 / 7 after (the rest is lid against the rim, not seen in the game).
  - `LID_DRY=1` (with `LID_DRY_SHOTS=<dir>`) stops after the L lid and renders it in magenta at the blink's angles.
  - `validate.py`'s round-4 lock allows the lidU chart, whose paint follows the new shell.
- Closed eye, rays reaching the eyeball: 0 at front, game ±45 and 3/4-in; 6–7 of 7,200 from 3/4-out at eye level.

**Known limits** (accepted):
- **Ear Z: keep it at or under 0.06** (the game's secondary motion does, for earGain ≤ 1). The contract's ±0.3 ear Z
  sinks the ear root about 24 mm into the crown. X swings and the tip extremes stay within 1–2.4 mm.
- **Nodding into the pearls.** The pearls sit right under the chin; they are rigid on chest and neck, never jaw or head.
  - The game's largest nod (+0.25 X) sinks the chin about 19 mm into the necklace; +0.3 with the jaw open, 24 mm. It
    reads as the chin resting on the pearls.
  - A head turn of 0.45 gives about 11 mm.
- **Feet in the sheer under-layer.** At walk ±0.8 and run ±1.0 the foot passes 21–47 mm into the sheer under-layer, but
  stays inside the pink layer. The pink and periwinkle layers are never pierced.
  - The layers cross by at most 6.7 mm at run, at the scalloped hem.
  - The obi tails dip into the skirt top only under the obi band.
- **Sleeves behind the ears.** On arm swing the sleeves pass behind the long ear lobes (up to 13 mm at walk, 18 mm at
  run); the ear stays on top.
- **The tail over the bow tails.** At run and in a spine twist the dog's tail sweeps over the bow's ribbon tails.

**Rebuild** (from a copy of this folder; Git Bash, Blender 4.3 at `C:\Program Files\Blender Foundation\Blender 4.3`):
```bash
cp -r tools/blender/codex/assets/stella-toy tools/blender/work/codex/stella-rebuild && cd tools/blender/work/codex/stella-rebuild
mkdir -p scratch preview export
# the model: deterministic, but it rewrites public/models/stella-toy.glb and stella-parasol.glb
# (the phase 3 Midday MD5s are acf95a435127182455e8787c0d83619c and 87ef3dc3d3eb9893a8c7883c2c45b11d;
#  the jellyfish-era ones were abe857f5e50fb8d4cae66e4c031b5d9a and b403a0a0b3bfb3036448e915e541bda7)
python run_blender.py scratch/log_build.txt 900 -- --background --factory-startup --python build_stella-toy.py
# the rig, the hero export, the validation, the sheets and the pose check (outputs stay in this folder)
sh run_rig_round.sh
python ../../../codex/install_rig.py export stella_toy
```
- **The rig alone:**
  `python run_blender.py scratch/log_rig.txt 1500 -- --background --factory-startup --python rig_stella-toy.py`.
- **The export alone:** `blender --background stella-toy_rig.blend --python ../../../codex/hero_export.py -- --out export
  --name stella_toy --height 1.24`.
- **validate.py's atlas lock** compares against `stella-toy_atlas.png`, which the model build writes. Run the model build
  first, or copy that file from the work folder.
- **Phase 3's locks** compare against round 4 in the work folder's `approved-r4/` (`stella-toy.glb`: the shapes and UVs
  of every object, 0.001 mm and 1e-6; `stella-toy_rig_atlas_nosefix.png`: the atlas outside the costume's charts and
  ramp rows, pixel for pixel). Copy `approved-r4/` from the work folder; without it validate.py skips those two locks.
