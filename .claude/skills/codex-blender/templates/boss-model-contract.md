# Boss model contract (Pawhaven bosses, ROADMAP EN-1)

On top of `.claude/skills/codex-blender/templates/enemy-model-contract.md` (vertex colours only, `toon` + optional `glow`
material, no rig, closed volumes, smooth normals, ≥ 2.5 cm everywhere, faces built as geometry). Where they differ,
**this file wins**.

## A boss is a set of rigid named parts the game already drives
The boss's procedural builder (read-only for you: the file and function in your brief) builds a tree of named groups
and meshes, and its `animate()` / fight code turns, scales and hides them by name. Your GLB replaces those meshes 1:1.
- **One mesh object per part, named exactly** as your brief's parts table. Plus **markers**: an *empty* (no mesh) named
  as listed, at the listed point (the fight spawns effects there). No other objects.
- **Flat hierarchy**: every object is top-level (not parented), its **origin at its pivot in model space**, rotation 0,
  scale 1 (apply rotation and scale, keep the location). The game re-nests them itself.
- **Model units**: build at the size the builder builds (its "units"; the game multiplies by `def.scale`). Your brief
  gives the unit height. Front −Y, up +Z; the brief's pivots are given in **Blender coordinates** already.
- **Rest orientation**: each part must look right at **rotation 0 about its pivot**, in the orientation the builder
  builds it (read the builder: e.g. a wing built pointing along +X from its shoulder). The game's `animate()` then turns
  it by the amounts it uses today. **Read `animate()`** for the idle values and the attack poses, and check with a parts
  render that the game's idle pose reproduces the sheet's idle look and the attack values give the sheet's attack poses.
- **Budget**: the brief's (about 15–25k triangles for the whole boss). Spend on the silhouette and the face.
- **Glow**: only where the brief says (the game's boss shaders light some colours; the brief lists them).

## Report
As the enemy contract, plus: the parts table (name, pivot, triangles), the markers, the game poses you rendered.
