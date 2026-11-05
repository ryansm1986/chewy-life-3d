# The zone villages' Blender set pieces (ROADMAP Z-D6)

Built by an Opus agent under Claude's direction (2026-11-02), in the owner's chunky toy-diorama style (the WB-1 pick,
`refs/style-C-owner-pick-falls.png`). Each one replaces a kit piece at the same place and frame. The working folder
`tools/blender/work/codex/village-pieces/` is git-ignored.

| GLB (`public/models/`) | Where | Kit piece it replaces | Game hook |
|---|---|---|---|
| `waystone.glb` | the Waypoint Shrine, all four villages | `art.js` `waystone()` | `data.js WAYSTONE.glb`; `village.js placeShrineGlb`: `tintRoof` takes the zone's roof colour (`WAYSTONE_TINTS`), `tintCap` the cap (`WAYSTONE_CAPS`: moss, red leaves, salt, snow); the `rune` mesh shows only in a saved village |
| `shishi-odoshi.glb` | Takemori's square | `bambooProps.js shishiOdoshi()` | `data.js PIECE_GLB.shishiOdoshi`; `artBamboo.js decor()` swings the `rocker` node (its origin the pivot, game (−0.47, 0.62, 0)) with `shishiCycle` |
| `hoshigaki-frame.glb` | Akane Hamlet, saved | the `persimmons` block of `artMaple.js savedDecor` | `PIECE_GLB.hoshigaki`, shown with the saved look |
| `ashiyu.glb` | Yukimi's square | `artOnsen.js footbath()` | `PIECE_GLB.ashiyu` |
| `fishing-boat.glb` | Shiokaze, moored at the pier | `artTidepool.js fishingBoat()` (in `pierAlong`) | `PIECE_GLB.boat`; `pierAlong` returns the boat's frame |

All the swaps go through `village.js addPieceGlb` / `placePieceGlbs`. A `null` in `PIECE_GLB` (or `WAYSTONE.glb`) brings
the kit piece back.

- `build_village-pieces.py --piece <waystone|shishi-odoshi|hoshigaki-frame|ashiyu|fishing-boat|all>`: one deterministic
  script with a shared stone, timber, rope and icing kit. It's vertex-coloured, with named materials only where the game
  needs them.
- `brief.md`: the brief. The review rounds:
  - the waystone took 2 (the sacred rope on the stone; caps that pour like icing);
  - the shishi-odoshi took 2 (a chunky tsukubai, so its pivot moved);
  - the foot bath took 2 (no roof: the game places the unroofed bath).
- Triangles: waystone 5,990 · shishi-odoshi 3,426 · hoshigaki-frame 5,912 · ashiyu 4,026 · fishing-boat 5,588.

Rebuild (from a copy, so the outputs don't land in git):
```bash
cp -r tools/blender/codex/assets/village-pieces tools/blender/work/codex/village-pieces-rebuild && cd tools/blender/work/codex/village-pieces-rebuild
blender --background --factory-startup --python build_village-pieces.py -- --piece all
```
