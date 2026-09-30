# Disney-style Chewy (Blender)

A from-scratch, feature-animation style Chewy built in Blender from the two references:
the photo of the real Chewy (`D:\projects\chewy-life\assets\chewy_ref.jpg`: chocolate coat, rose ears with folded tips,
amber eyes, liver nose, white chest blaze) and the concept art (`D:\projects\chewy-the-dog\art\chewy-reference.png`:
navy gi, red scarf and sash, bandaged forearms, baggy charcoal pants, bushy tail).

```
tools/blender/disney/render.sh OUT_DIR SHEET_NAME front,34,side,back look=final samples=256 res=1200 [furdensity=1] [blend=PATH]
```
Views: `front 34 side back head headfront headside hero`. `look=clay` renders the bare sculpt (fast, no fur);
`parts=head,eyes,...` limits the build; `furdensity=0.5` for quick previews. A full build + render takes ~1–2 min on the
RTX 5080 (≈1.3 M fur strands).

## How it is made (everything is code, so it can be re-tuned and re-built)
- `sdf.py` — signed-distance sculpting kit in numpy (ellipsoids, round cones, tubes, smooth union/subtract/intersect)
  and a surface-nets mesher with Newton projection onto the true surface.
- `chewy.py` — the character: every form is a primitive blended smoothly into the next.
  - **Head** (sculpted around `H`, then scaled ×1.12 and lowered onto the neck — ~3.6 heads tall):
    round skull, a face mass kept inside the skull at the sides (a wide blend of coincident surfaces bulges into a
    ridge), cheeks, orbit forms that seat the eyes, a tapered lab-mix muzzle with flews and chin, a leather nose with
    comma nostrils, philtrum and a ω smile line, lids as shells cut by an almond window, rose ears as two exact plates
    (standing base + flap folded forward) joined by a soft crease.
  - **Body**: chest/belly, arms with 4-fingered paw hands and a thumb, legs, big paws with toes, tail.
  - **Costume**: gi as a 7.5 mm cloth layer off the body (cinched under the sash, flaring into a skirt, V-neck,
    short sleeves, collar bands), sash with knot/loops/tails, neckerchief with knot, baggy pants gathered into
    cuffs with folds, spiral bandage wraps.
  - **Colour masks** (per vertex): chocolate coat, tan muzzle/cheeks, white chin/throat/chest blaze, liver nose,
    dark lid rims and mouth line, inner ears, paw pads; eyes painted with amber iris, fibres, limbal ring, pupil.
  - **Fur fields**: where fur grows (not under clothes, on the nose, lid rims, mouth line or pads), strand length
    (velvet muzzle, fluffy cheeks and chest ruff, bushy tail) and comb direction (back from the nose, down the body,
    along the tail).
- `fur.py` — grows groomed strands from those fields (lift off the skin, curl toward the comb, clumping) and
  `build.py` turns them into Blender hair curves with a Principled Hair material (darker roots, lighter tips).
- `build.py` — meshes, materials (painted fur skin, cotton cloth with a weave bump, clear-coated eyes), a cyclorama
  and three-point light rig that turn with the camera, Cycles GPU renders, optional `.blend`.

## Rig, face and animation (`rig.py`)
- **Skeleton**: root, hips, spine, chest, neck, head; per side upper arm, forearm, hand, thigh, shin, foot; a 4-bone tail.
  Face: **jaw** (the mouth is a real parting between the lips into a cavity, with a tongue), **upper/lower lids**,
  **brows**, **lip corners**, and per **ear a base bone and a tip bone** for the folded flap.
- **Weights**: body verts pick the nearest limb chain (so a hand never pulls the gi), blending smoothly inside it;
  clothes copy the skin they cover (sleeves the arm, everything else the trunk); face weights are analytic (below the
  lip parting → jaw, around the eyes → lids, the ear plates → ear / ear tip). The fur is skinned with its roots' blend.
- **Shots**: `render.sh OUT NAME "head:apose:happy,34:hero:laugh"` = `view:bodyPose:expression`. Body poses:
  `apose hero wave`. Expressions: `neutral happy laugh surprised sad determined blink bark`.
- **Clip**: `build.py -- OUT anim=hello` renders "Hi there! I'm Chewy!" (lip-sync jaw, smile, brow emphasis, a
  blink, a laugh; ears perk, then ride the head's motion through springs) to `chewy_hello.mp4`.
  `animtimes=0.4,1.0` renders single moments for checking.

## Game version (`game_export.py`, `src/actors/disneyChewy.js`)
```
blender -b --factory-startup -P tools/blender/disney/build.py -- tools/blender/work/disney views=none look=final fur=0 export=public/rigs
```
- Decimated parts (head 40k tris for the face; ~63k in all), one 2048 atlas: colour with fur streaks along the
  comb + AO, a tangent normal map (1024). The coat is repainted with the classic Chewy's browns for the export
  (the film chocolate reads maroon under the game's toon light).
- In game the bones become the groups the Animator drives: `jaw` opens on talk/bark with uneven syllables, the
  **lids close to blink** (and squint when happy), the **lip corners lift** with the mood, and the ears ride the
  Animator's springs with a gain (`rig.earGain`), idle flicks, and soft limits (the flap perks up to ~60°, folds at
  most ~35°).
- **Settings → Disney Chewy** swaps between this model and the classic toon Chewy live (saved in localStorage;
  `?chewy=classic|disney` overrides). `tools/qa/prod-smoke.mjs` requires it to load in the production build.
- `game_motion.mjs` grabs talk / bark / walk frames from the game renderer.

## Other heroes: `char=` (Moka)
Every script above is character-agnostic; `build.py -- ... char=moka` swaps `chewy.py` for `moka.py` (default
`char=chewy`, which builds exactly what it did before — the rig outputs are regression-checked bit for bit).
```
tools/blender/disney/render.sh tools/blender/work/moka turnaround front,34,side,back char=moka look=final samples=128 res=1000
tools/blender/disney/render.sh tools/blender/work/moka faces "face:apose:happy,face:apose:surprised,face:apose:determined" char=moka look=final
tools/blender/disney/render.sh tools/blender/work/moka cast "cast:cast:determined" char=moka look=final
blender -b --factory-startup -P tools/blender/disney/build.py -- tools/blender/work/moka char=moka views=none look=final fur=0 export=public/rigs
```
- **Moka** (`moka.py`, docs/HEROES.md §1): a Boykin Spaniel mage on Chewy's skeleton (same body landmarks, so the game's
  Animator drives both alike). Round domed head, short broad muzzle, big golden eyes with lashes (their own part,
  skinned to the upper lids), long pendant wavy ears (a base + tip bone each: `ear_bones` / `ear_weights` hooks), a
  stubby curly tail; lavender robe with bell sleeves and star embroidery (the skirt follows the hips and each thigh
  half-way, so it never tears between the legs), seafoam capelet with the hood down, gold piping and a star clasp,
  violet sash with a rubber-duck charm, floppy wizard hat with a paw-print patch. Her staff is film-only
  (`film_only=True`: never exported; the game builds its staffs in `src/actors/heroGear.js`). Extra poses: `hold`,
  `hero`, `cast`; extra shot: `face`, `cast`.
- A character module provides `parts()`, `head_fur` / `body_fur` (a 5th field = per-strand curl → `fur.grow(curl=…)`),
  the rig landmarks (EYE, EAR_*, ARM_P, LEG_P, TAIL_P, …) and optional hooks: `ear_bones(s)`, `ear_weights(P)`,
  `BODY_BONES`, `FACE_W`, `POSES`, `tweak_expression(name, E, helpers)`, `SHOTS`, `FUR_DENSITY`, `CURL`, and `GAME`
  (export name, scale, height, budgets, texel weights, coat colours for the game bake).
- Part options: `skin=` (clothes: `'arm'`, a mask fn, `('bone', b)` rigid, `('fn', f)` custom weights), `mesh=` (a
  function returning (verts, quads) instead of an SDF, e.g. swept tubes for piping and lashes), `clamp=` (limit the
  Newton projection step: stops vertices shooting off on cloth-shell creases), `film_only=`.
- `hscale=2` meshes every SDF part at twice the cell size for quick previews; materials `gold`, `glow`, `wood` join
  `fur`, `cloth`, `eye`, `skin`.

## Next steps
- Hand-sculpt passes on the ears and clothes (Blender's sculpt mode on the exported .blend).
- More clips (sword swing, bark, sad walk) from the same rig; retarget them to the in-game Animator actions.
