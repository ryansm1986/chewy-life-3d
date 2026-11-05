# The Town Portal moon gate and the Spirit Lantern in Blender (ROADMAP Z-D6)

Built by an Opus agent under Claude's direction (2026-11-02), in the owner's toy-diorama style, to sit beside the Blender
dungeon gates. The working folder `tools/blender/work/codex/magic-props/` is git-ignored.

- **`public/models/moon-gate.glb`** (node `frame`): the Town Portal's stone moon gate.
  - It is built in the kit's units: `portalModel` scales its root 0.78.
  - The opening's inner radius is 0.890, the same as the kit, so the code's swirl disc fills it.
  - Its features: carved ring stones, a keystone crescent, moss icing, a shimenawa with zigzag shide and a bell, stone feet.
  - `dungeon/portalModel.js`: `loadPortalFrame()` at boot; the GLB replaces the kit stone and cloth once loaded.
  - 5,900 triangles.
- **`public/models/spirit-lantern.glb`** (nodes `lantern` and `flame`): the tier device at every dungeon gate and the
  Burrow door.
  - The kit's silhouette and its light point (0, 1.58, 0).
  - `flame` is the light box, two-tone `flame_glow` / `flame_core_glow`. `regions/spiritLantern.js` shows it only while
    the lantern is lit.
  - `loadLanternModel()` at boot.
  - 3,980 triangles.
- `build_magic-props.py --piece <moon-gate|spirit-lantern|kit|all>`: deterministic; `kit` rebuilds the kit designs for
  comparison.
- Review rounds, 2: the moss toned to the bamboo gate's palette at about half cover; the shide as zigzag paper streamers.
