# Brief: village-pieces (ROADMAP Z-D6): the zone villages' signature set pieces in Blender

## Why
The game's four zone villages (Takemori, Akane Hamlet, Shiokaze Port, Yukimi Spa Village) are built by the procedural kit.
The buildings stay kit. A handful of **signature set pieces**, the things a player stops and looks at, get Blender models
to lift each village toward the game's 9/10 bar:

| # | GLB (`public/models/`) | Where | The kit version to read (read-only) |
|---|---|---|---|
| 1 | `waystone.glb` | the **Waypoint Shrine** in all four villages, the fast-travel point | `src/regions/village/art.js`, `waystone()` (about line 386) |
| 2 | `shishi-odoshi.glb` | Takemori's square: the bamboo deer-scarer basin that clacks | `src/regions/assets/bambooProps.js`, `shishiOdoshi()` and `shishiCycle()`; placed in `src/regions/village/artBamboo.js` `decor()` |
| 3 | `hoshigaki-frame.glb` | Akane Hamlet's square once saved: the persimmon drying frame | `src/regions/village/artMaple.js`, the `c.saved === 'persimmons'` block (about line 885), with `kakiString`, `basket`, `heap` |
| 4 | `ashiyu.glb` | Yukimi's square: the steaming foot bath under a little snowy roof | `src/regions/village/artOnsen.js`, `footbath()` and its placement (about line 941) |
| 5 | `fishing-boat.glb` | Shiokaze Port: Funaki's fishing boat moored at the pier | `src/regions/village/artTidepool.js`, `fishingBoat()` and `hull()` |

**Each piece keeps its kit design, layout and footprint.** It's the same object, rebuilt beautifully: the director
swaps the GLB in where the kit piece stands. Read each kit function first: it gives the parts, sizes, colours and the
local frame.

## The look
- The owner's chosen world style is **"chunky toy diorama"**: `refs/style-C-owner-pick-falls.png` and
  `refs/style-C-owner-pick-bridge.png`, built in the game as `refs/game-falls-as-built.png`. That means:
  - candy-smooth rounded stone with soft painted gradients;
  - moss and snow caps like thick icing;
  - chunky timber with rounded edges and rope-lashed joints;
  - glossy lacquer;
  - plump fruit;
  - nothing thinner than about 3 cm.
- Your pieces stand among kit buildings. `refs/kit-*.png` are the saved villages at the game camera and close up. Match
  their palette and their chunky, rounded language, but with a finer finish: smooth curves instead of facets, deliberate
  painted shading, real rope and wood-grain colour variation.
- The game camera looks down at 45° from about 20 m, at yaws ±45° round the village. Spend the detail on what it sees:
  tops, rims, the roof and the silhouette.

## Per piece
### 1. `waystone.glb`, the Waypoint Shrine (the most important: it's in every village)
- Keep the kit's composition:
  - a low stone plinth;
  - a little hokora (spirit house) on a pedestal under a gable roof with a shimenawa;
  - a tall **guardian standing stone** with a carved paw plaque;
  - a small vermilion torii in front;
  - two small stone lanterns.
- You may make it grander: the guardian stone about 1.6–1.8 m, the hokora roof up to about 1.6 m, the torii about 1.7 m.
  But stay **inside the kit footprint**: x −1.0 to 1.0, and game z −0.95 to 0.75 (game z is Blender −Y). The torii and
  lanterns may stand out to game z 1.1.
- The hero stands at game (0, 1.55) to use it: keep that clear.
- **Materials the game recolours per zone** (keep these names):
  - `tintRoof`: the hokora roof, recoloured to the zone's tint (bamboo #5a9a88, maple #c8402e, tide #3a8ab8,
    onsen #6a7ac8). Paint its shading as greyscale vertex colours (light top, darker eaves), since the game multiplies the
    tint in.
  - `tintCap`: the cap on the guardian stone's crown and the hokora roof's top, set per zone to moss, snow, salt crust or
    red leaves. Paint it as soft greyscale too.
- **The rune**: a separate mesh object named `rune`, the paw rune on the plaque, with a material named `rune_glow`
  (emission #8fd0ff). The game shows it only once the village is saved, so the plaque must look finished without it: a
  carved paw recess.
- ≤ 6,000 triangles.

### 2. `shishi-odoshi.glb`, the deer-scarer
- Two objects:
  - `base`: the stone tsukubai basin with water, the river stones, the bamboo spout and the rocker's frame;
  - `rocker`: the bamboo tube that tips.
- **`rocker`'s origin is its pivot**: the kit's pivot is game (−0.62, 0.52, 0.02), which is Blender (−0.62, −0.02, 0.52).
  - At rest (rotation 0) it lies exactly as the kit's rocker geometry does.
  - The game rotates it about the game z axis, which is Blender −Y, through −0.62 to +0.35 rad. Make sure it clears the
    basin and the frame over that whole range.
- The basin's water disc: a slightly lighter, glossy-painted blue-green.
- ≤ 4,000 triangles.

### 3. `hoshigaki-frame.glb`, the persimmon drying frame
- The kit block's layout, in its local frame:
  - two posts and two rails, about 2.1 m wide and 1.5 m tall;
  - a little tiled cap;
  - strings of dried orange persimmons;
  - a straw mat with a heap of fresh persimmons;
  - two baskets of fruit;
  - a little ladder.
- The persimmons are the star: plump, glossy orange (#e8782a to #f4a040), each with a little green-brown calyx; the dried
  ones on the strings a deeper amber. 8–10 strings are enough if each one reads.
- ≤ 6,000 triangles.

### 4. `ashiyu.glb`, the foot bath
- Keep the kit's layout:
  - a stone trough of steaming water;
  - a little snowy roof on posts;
  - benches both sides.
- Villagers sit at game (±0.55, ±0.62), seat height 0.40, feet in the water. The kit's colliders are at x −0.9, 0 and 0.9
  (radius 0.38). Steam comes out of the water at (±0.6, 0.42), so keep that open to the sky under the roof's eaves.
- Snow lies on the roof like thick icing, with chunky icicles at the eaves. The water: milky turquoise.
- ≤ 6,000 triangles.

### 5. `fishing-boat.glb`, Funaki's boat
- The kit's `fishingBoat()`, about 3.5 m long and 1.2 m in beam:
  - a wasen hull with a tall swept bow;
  - an antifouling-red bottom under the waterline (0.2 m), a cream hull and a blue trim band;
  - thwarts;
  - a stubby mast with a furled sail;
  - the squid-lamp pole with three big bulbs (material `bulb_glow`);
  - the sculling oar;
  - nets and floats heaped amidships;
  - the name boards.
- Frame: bow toward game +x, which is Blender +X; the keel at z = 0; centred on the hull.
- ≤ 7,000 triangles.

## Technical (all pieces)
- The contract in `.claude/skills/codex-blender/templates/codex-preamble.md`: 1 unit = 1 m, front = Blender −Y (game +z),
  the lowest point at z = 0 (the boat's keel at 0), apply transforms.
- **Use the kit function's local frame**: its +z is your −Y, its x is your x, its y is your z. The director places your
  GLB exactly where the kit piece stood.
- **Vertex colours** (a `Col` attribute) with soft painted gradients and AO-like darkening in crevices, no textures. Named
  materials only where the game needs them (`tintRoof`, `tintCap`, `rune_glow`, `bulb_glow`), and one `body` material for
  the rest.
- Smooth normals, no zero-area faces or NaNs, closed shells.
- One deterministic script builds them all: `build_village-pieces.py --piece <name|all>`, sharing a stone, timber, rope
  and moss/snow kit.

## Deliverables each round
- The GLBs.
- For each piece, `preview/<piece>/sheet.png` and `game.png` from `tools/blender/codex/preview.py`, plus your own 45°-down
  render from about 8 m and from ±45° yaw beside a 1 m capsule (`preview/<piece>-gamecam.png`).
- `preview/<piece>-kitcmp.png`: your render beside the kit piece's crop from `refs/kit-*.png`, where it shows.
- A report table: triangles, size, the footprint against the kit's, and the named nodes and materials.

## Order
1. **Round 1: `waystone.glb` only.** It sets the shared kit and the finish. Report and stop.
2. After approval, the shishi-odoshi, the drying frame, the foot bath and the boat. Two per round is fine.

## Done when
- At the game camera each piece reads at a glance as the same object as the kit's, clearly richer, and at home among the
  kit buildings and in the owner's toy-diorama world.
- Footprints, pivots, seats and named materials and nodes are exactly as specified.
- Each piece is within its budget, with a deterministic build and no warnings.
