# The four zone dungeon gates in Blender (ROADMAP Z-D6)

Built by an Opus agent under Claude's direction (2026-11-02), in the owner's chunky toy-diorama style (the WB-1 pick,
`refs/style-C-owner-pick-falls.png`). Each gate rebuilds its kit design (`src/regions/gates/<zone>.js`) in the same gate-local
frame. The working folder `tools/blender/work/codex/dungeon-gates/` is git-ignored.

- **The GLBs**: `public/models/gate-bamboo.glb`, `gate-maple.glb`, `gate-tidepool.glb`, `gate-onsen.glb`, each ≤ 12k
  triangles and vertex-coloured. The glows are `glow_<hex>` materials: the plankton crystals, the ice crystals.
- **The frame**:
  - the origin is the gate origin, z = 0 at the rim height, gate-local +z (out of the mouth) = Blender −Y;
  - every grounded mass carries a buried skirt to −0.6 for uneven ground;
  - maple's `BACK = 1.2` shift is baked in.
- **Game side**:
  - each look's `glb: { url }` names its model;
  - `regions/dungeonGate.js` hides the kit's `main` (the mass) and `frame` (the torii or rope gate) Placers when it loads;
  - the lanterns, flora, jizō and the tidepool's animated pool stay kit (the `dress` Placer);
  - the seal curtain, colliders and lantern lights are unchanged.
- `build_dungeon-gates.py --gate <bamboo|maple|tidepool|onsen|all>`: one deterministic script with a shared boulder, icing,
  rim, timber and rope kit.
- `brief.md`: the brief. The review rounds:
  - **bamboo, 2**: the moss toned down and at 40–55% cover;
  - **maple, 4**: the leaf litter as scalloped drifts with real leaves, the roots warm brown, slimmer and separated;
  - **tidepool, 2**: its own pool removed (the kit's animated one stays), dune grass, rock modelling, barnacles;
  - **onsen, 1**.

Rebuild (from a copy):
```bash
cp -r tools/blender/codex/assets/dungeon-gates tools/blender/work/codex/dungeon-gates-rebuild && cd tools/blender/work/codex/dungeon-gates-rebuild
blender --background --factory-startup --python build_dungeon-gates.py -- --gate all
```
