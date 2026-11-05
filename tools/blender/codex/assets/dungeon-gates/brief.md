# Brief: dungeon-gates (ROADMAP Z-D6): the four zone dungeon gates in Blender

## Why
Each of the game's four outdoor zones ends at a **dungeon gate**: a cave mouth, sealed by a curtain of light until the
zone's village is saved. The player walks up to it for every dungeon run. Today the gates are built by the procedural kit
(`src/regions/gates/<zone>.js`). They work, but they rate about 7.5–8/10: lumpy, faceted noise-boulders, a plain flat torii,
thin details. The game has a slot for a Blender model for each gate (`look.glb`). Your models replace the kit's mass and
lift the gates to the game's **9/10** bar.

## The look: the owner's pick, "chunky toy diorama"
- `refs/style-C-owner-pick-falls.png` and `refs/style-C-owner-pick-bridge.png` are the style the owner picked for the
  waterfall and bridges. `refs/game-falls-as-built.png` is how it was built in the game. Match that world:
  - candy-smooth, rounded boulders with soft painted gradients;
  - moss caps that pour over the stone tops like thick icing, with clean rounded edges;
  - chunky timber with rounded edges and rope-lashed joints;
  - glossy lacquer;
  - small flowers and ferns as accents.
- It's a toy diorama, not realism: big readable shapes, no noise, no faceting, nothing thinner than about 4 cm.
- `refs/kit-<zone>-gate-game.png` (game camera) and `kit-<zone>-gate-close.png` show today's kit gates. They show the
  layout and identity to keep. The finish is what you're replacing.

## The four gates (one GLB each)
| GLB | Zone | Identity (keep) | Read |
|---|---|---|---|
| `public/models/gate-bamboo.glb` | Bamboo Depths | a mossy cave mouth in a rock outcrop, bamboo on top; a weathered vermilion torii; a shimenawa rope with paper shide across the mouth; worn stone steps | `src/regions/gates/bamboo.js` |
| `public/models/gate-maple.glb` | Maple Roots | a hollow in a hillside under a great crimson maple; its huge roots pour down the bank and **arch over the dark mouth**, crossing at the crown; a shimenawa across the roots; a vermilion torii; fallen leaves drifted on top | `src/regions/gates/maple.js` |
| `public/models/gate-tidepool.glb` | Tide Caves | a sea-cave arch in a sea cliff with sea stacks beside it; a **driftwood rope gate** (two posts, a sagging shimenawa, glass floats in their nets) before it; barnacles, shells, a glowing tide pool at its foot | `src/regions/gates/tidepool.js` |
| `public/models/gate-onsen.glb` | Onsen Caverns | an ice-cave mouth in a snowy rock face, a thick rim of blue ice and a fringe of chunky icicles round the arch; a vermilion **snow torii** with snow on its beams; snow heaped on the lintel and drifted against the jambs | `src/regions/gates/onsen.js` |

**Read each gate's file** (read-only) for its exact layout: the kit's pieces, positions and colours. Your model is the
same design, rebuilt beautifully.

## What your model replaces, and what stays kit
- **Replace**: everything the gate file puts in the `main` Placer (the rock, bank or ice mass, the mouth and its dark
  throat, the steps, the moss or snow caps, the shimenawa), **plus the torii or rope gate**. The director moves the torii
  into the replaced set when integrating.
- **Stays kit** (leave its spots clear and don't model it): the two lanterns, the jizō, the trees, bamboo stands, ferns,
  bushes, leaf litter, mushrooms and the oke buckets. These are the `dress` pieces other than the torii. They stand
  where the file puts them, so your mass mustn't swallow those points.
- The **seal curtain** (a code-made plane of light) fills the mouth at gate-local z = `mouth.lz`, width `mouth.w`, height
  `mouth.h` (bamboo: lz 0.2, 2.5 × 2.7 m; maple: lz 0.24 + 1.2; tidepool: lz 0.4, 2.8 × 2.6; onsen: lz 0.2, 2.5 × 2.7).
  - The opening must frame that rectangle snugly: an arch whose inner edge is 0.05–0.25 m outside it.
  - Nothing may cross in front of it, except the shimenawa and shide above the arch's spring line.
- The **colliders** stay as in the file (`colliders: [[lx, lz, r], …]`). Your solid mass must sit inside their union, give or
  take 0.3 m, so the hero can't walk into rock or bump into thin air.

## Frame and placement (overrides the contract's "ground at z = 0")
- The origin is the gate origin (`gx, gz` in the file), with z = 0 at the **rim height** (`rim`).
- Gate-local +z (out of the mouth, toward the camera) is **Blender −Y**. Gate-local x is Blender +X.
- Use the file's local coordinates exactly as they are: maple's `BACK = 1.2` shift, the torii at local z 1.75 (maple
  1.85, and so on).
- The terrain round the gate isn't flat. Carry every grounded mass down into a **buried skirt to z = −0.6**, so no gap
  ever shows where the ground dips.
- The mouth's floor and the steps meet the ground at about z = 0.
- The game camera looks down at 45°, from about 18–24 m, from the gate's front (yaw 0) and up to 45° to either side.
  Spend the detail on what that camera sees: the arch, the tops of the boulders, the caps and the torii's top beams.
  The back of the mass is never seen up close: keep it simple, but closed (no holes, no open shells).

## Technical
- One GLB per gate, `public/models/gate-<zone>.glb`. One script builds all four (`build_dungeon-gates.py --gate <zone|all>`),
  sharing a boulder, moss, timber and rope kit so the four read as one set.
- **≤ 12,000 triangles** a gate (the torii included).
- **Vertex colours** (a `Col` colour attribute) with soft painted gradients and baked AO-like darkening in the crevices
  and under the caps. No textures. The game's kit props are vertex-coloured, so yours will sit with them.
- Materials: one `stone` material, plus `glow` materials only where something shines. Glowing parts are a material whose
  name contains `glow`, with Emission: the tide pool's light, and maybe faint crystals in the ice rim. Not the mouth: it's
  dark. The dark throat is a plain dark vertex colour, graded to near-black deep inside.
- Lacquer reads glossy by painted highlights in the colours. There's no real gloss in the game's toon shader.
- Smooth normals (shade smooth, auto-smooth about 40° for the timber edges). No zero-area faces, no NaNs, no inside-out
  faces except the throat's inner shell.
- Export with +Y up (glTF default) and apply all transforms.

## Deliverables each round
- The four GLBs (or the ones the round asks for).
- `preview/<zone>-sheet.png` and `preview/<zone>-game.png` from `tools/blender/codex/preview.py` (`--in` each GLB).
- `preview/<zone>-gamecam.png`: your own 45°-down render from the front at about 20 m with a 1 m capsule, plus a ±45°
  yaw pair. These are what the director compares with the kit shots.
- `preview/<zone>-kitcmp.png`: your game-camera render beside `refs/kit-<zone>-gate-game.png`, at about the same
  framing.
- `preview/stats.json` per gate, and a report table: triangles, size, the mouth opening measured against the curtain
  rectangle, and the solid mass's footprint against the colliders.

## Order
1. **Round 1: `gate-bamboo` only.** It sets the shared kit and the finish. Report and stop.
2. After the director approves it: maple, tidepool and onsen. One round each, or all three together if bamboo landed
   cleanly.

## Done when
- At the game camera it reads at a glance as the same gate as today, but clearly richer: smooth chunky rocks, icing-like
  caps, a crisp lacquered torii with rounded beams and a thick rope.
- The mouth frames the seal rectangle, the colliders match the mass, and the lantern, tree and flora spots are clear.
- ≤ 12k triangles, no warnings, a deterministic build.
- It sits in the owner's toy-diorama world (`style-C-*`) next to the kit's other props.
