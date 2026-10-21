# Enemy model contract (Pawhaven enemy series, ROADMAP EN-1)

Every enemy GLB follows this, on top of `.claude/skills/codex-blender/templates/codex-preamble.md`. Where they differ,
**this file wins** (it replaces the preamble's materials/texture and transform rules).

## Why it's different from a hero
The game draws up to ~150 monsters at once by **instancing**: every copy of a kind shares one geometry per part and is
drawn in one batch. That only works with:
- **No textures, no UVs needed. Colour is vertex colour only.**
- **No skeleton, no skinning, no shape keys, no animation.** The game animates monsters by moving, rotating and
  squashing a few **rigid parts** (see each brief's part list). The code that does it is in
  `src/regions/monsters/bamboo.js` (read-only for you): look at your kind's `…Spec` / `build…` functions to see how
  the parts move (spins, squash, tilts, the tail swish, the head rattle).
- The game wraps **every part in an inverted-hull ink outline** (about 2 cm thick) made from the same geometry, and
  re-shades everything with its toon ramp. So: closed volumes, smooth normals, nothing thinner than about 2.5 cm.

## Objects (= parts)
- One **mesh object per part**, named exactly as the brief lists (`body`, `head`, `tail`, `mound`, …). No other mesh
  objects. No empties, cameras or lights in the export. Don't parent the objects to each other.
- **Each object's origin is its pivot** (the joint it rotates about), at the location the brief gives or the one you
  choose and report. Rotation 0, scale 1 (apply rotation and scale, **keep the location**: the game reads each node's
  translation as the pivot). `body`'s origin is (0, 0, 0): ground centre, under the middle of the creature.
- Front faces **−Y**; the creature stands on z = 0 at rest (floaters too: the game lifts them).
- Join everything that doesn't move on its own into its part (eyes, blush, arms that don't swing, scarf, toes…).

## Colour
- One colour attribute (call it `Col`), **face-corner domain**, so colour borders are crisp (the exporter splits
  vertices at a border). Paint by assigning colours per face: **every colour border runs along an edge loop** you
  modelled for it (eye outlines, the face patch, markings). Soft painted shading may be baked into the colours
  gently (a slightly darker underside), but the main read is flat blocks with clean borders.
- Hex values in the brief are sRGB as seen; make the preview match them.
- Darkest about #252333 (eyes); avoid pure black; whites about #fff6ea except catchlights (#ffffff allowed).
- **Materials**: one Principled BSDF named `toon` whose Base Color reads the colour attribute, roughness 0.8. Faces
  that should **glow** (only where the brief says) get a second material named `glow` (Emission = the colour
  attribute, strength 1). Nothing else.

## Faces (the most important 5 % of the model)
- The face is the toy line's: big glossy eyes (dark iris with a warm-brown lower half if the sheet has it, one big
  and one small white catchlight, a thick upper lash line / lid), brows if the sheet has them, a small nose dot,
  a tiny mouth, blush ovals. **Match the sheet's default (front-view) expression**; it's the only face the game has.
- Build the features as **geometry** that holds crisp borders: eyes as slightly domed lenses sunk into the head
  surface (or shallow shells within 3–4 mm of it), catchlights and lash lines as their own faces. Never let a feature
  float off the surface or poke through the outline.
- Check the face at the game camera (45° down, 20 m: the eyes must still read as two big dark eyes with a sparkle).

## Budget and variants
- **Triangles: the brief's budget, counted over all parts of one variant** (about 3.5–5k). Spend them on the
  silhouette from 45° above and on the face. Use subdivision then decimate/remesh sensibly, or build low-poly smooth
  forms; never ship 50k and hope.
- **Variants** are separate GLBs from the same parametrised script: `<task>.glb` (base) and `<task>_<variant>.glb`.
  Same part names and pivots; colours change and at most one small accessory is added or swapped.

## Export and preview
- Export each variant with `export_apply=True` (after applying rotation/scale only, origins kept), `export_yup=True`,
  `export_vertex_color='ACTIVE'` (Blender 4.3: check the option names; the colour attribute must arrive as COLOR_0),
  `export_animations=False`, no lights or cameras, no textures.
- Preview every variant: `preview.py -- --in …glb --out <task>/preview/<variant>` and once with `--character` for the
  base. Also render your own **45°-down game shot from front-left and front-right**, and a **parts check**: each part
  rotated about its pivot by the amounts the game uses (the brief lists them), to prove the pivots are right and no
  gap or seam opens.
- Same-scale comparisons against `refs/sheet.png` (front, side, face) with
  `.claude/skills/toybox-character/scripts/compare.py`. Measure, don't eyeball.

## Report (end of every round)
Parts (name, pivot in Blender coords, triangles), total triangles per variant, overall size (W × D × H), the measured
targets vs yours, what you checked, known issues.
