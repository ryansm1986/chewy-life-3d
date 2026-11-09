# Brief: poi-north: the Windmill Orchard, the Firefly Moon Pond and the Lagoon Pier in Blender

## Why
The outskirts' places (ROADMAP HP-1) are some of the biggest landmarks in Blossom Hollow and are still built by the procedural kit. Rebuild them at the game's 9/10 bar in the owner's chunky toy-diorama style.

Places: `windmill`, `moonpond`, `pier`. GLBs: `public/models/poi-<id>-<k>.glb`.

Budget: <= 12,000 triangles per place. The windmill's sails stay the kit's spin; the pier's walkable deck must match its deck height.

## How the game uses your GLBs (read this first)
Each place is `src/world/outskirts/pois/<id>.js` (read-only), with shared kits in `_west.js`, `_north.js`, `_east.js`. A place
builds its static models through `ctx.kit(seed, B => ..., { x, z, y, yaw })` (`src/world/outskirts/index.js`). The game now
looks up `public/models/poi-<id>-<k>.glb`, **k = that place's k-th `ctx.kit` call in build order**, and stands it in for that
kit call's meshes (`glbStandIn` in `src/world/buildings/index.js`). What stays the kit's:
- **the moving parts** (`B.anim`: the windmill's sails, anything that spins, swings or bobs). Leave them out of your GLB and
  shape your model around them, so they still fit;
- **the lights** (`B.light`): your lamps and windows must glow where those sit (material `window_glow`);
- **colliders and walkable decks** (`ctx.collide`, `ctx.deck`): your solid shapes must match them, and **a walkable deck must
  follow the height its `h(x, z)` returns, exactly**, or the player floats or sinks;
- anything the place adds with `ctx.add` (water discs, batches, the place's own meshes). Read each place to see which parts are
  which; only replace what its `ctx.kit` calls draw.

Build each GLB in **that kit call's local frame**: the same origin and the same ground as the kit's. The ground under a place
is not flat: the kit reads the height through its frame helpers (`F.gy`), so sink your base as the kit does. The concept each place was built from is
in `refs/`: the kit is an interpretation of it, and your model should reach the concept's charm at 9/10.
Materials: `body`, `leaf`, `cloth`, `window_glow`, `water`.
See them in the game with `node tools/qa/outskirts-shots.mjs` (read its header). The dev server is on port 5173.

## Exporter rule (it cost two dungeons a rebuild)
The glTF exporter flips UV V. Anything the game reads from UVs (glow flicker and tint, cloth sway) must be written as
`(u, 1 - v)`. Use the fixed exporter in `D:/projects/chewy-life-3d/tools/blender/work/codex/dg-onsen/` (`dg_common.py`,
`glbinfo.py` reads a GLB back). Read your glow and cloth UVs back and check them.

## Technique templates (finished, in the game, the owner's chunky toy-diorama style)
`D:/projects/chewy-life-3d/tools/blender/codex/assets/`: landmarks-hollow/, hollow-decor/, rg-tidepool/, dg-tidepool/, dg-bamboo/. Reuse their kit code. `refs/style-C-*.png` are the owner's
picks. Moss and snow: 40-55% cover, irregular rounded edges, light tops, darker undersides, never flat neon pancakes. Stones
have some cut planes, not only smooth eggs. Leaves as cards and clusters, never a smooth blob. Chunky: nothing thinner than
about 3 cm. **No text anywhere** (emblems instead; the owner's rule: no Japanese text).

## Technical
- 1 unit = 1 m, vertex colours (`Col`) with painted shading, smooth normals, no NaNs or zero-area faces.
- Deterministic `build_poi-north.py --piece <name|all>`.
- Judge colours **in the game**, not in Blender: dungeon and evening light shift them, and moss has come out neon before.

## Registering, and the only `src/` edit allowed
Add each finished model to `POI_GLB` in `src/world/poiGlb.js`: `<id>: [k, ...]`, the kit calls that have a model, for example `windmill: [0]`.
That file is shared with other builders: re-read it before every edit and make small Edit-tool changes that touch only your
entries. Then run `node tools/test-rpg.mjs` from `D:/projects/chewy-life-3d`: it asserts that every listed GLB exists.

## Deliverables
The GLBs, `preview/<name>-gamecam.png` (45 deg down at about 18 m and 10 m, both 45 deg yaws, beside the kit version) and
in-game shots at the game camera. End with a report: per GLB the triangles, size and origin against the kit's, the materials,
and known issues. **Do all of it in one round** (one piece fully first, then the rest). Then stop.
