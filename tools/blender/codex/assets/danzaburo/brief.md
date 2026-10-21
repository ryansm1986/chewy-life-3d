# Model brief: danzaburo (Pawhaven boss, ROADMAP EN-1)

Follow `D:/projects/chewy-life-3d/tools/blender/work/codex/boss-contract.md` (it sits on top of the enemy contract,
`D:/projects/chewy-life-3d/.claude/skills/codex-blender/templates/enemy-model-contract.md`). The pick is **Option A "Drum Belly"**:
`refs/sheet.png`. Build that design. `refs/current-danzaburo-in-game.png` is today's procedural boss in the game (size and
read only); `refs/approved-region-in-game.jpg` shows the region's approved Blender enemies he leads (the AFTER half): match
their finish. The builder you replace (read-only): **`buildDanzaburo` in `src/regions/bosses/tanuki.js`**; read it and its `animate()` / fight code first.

## Size
Model units: about **1.3 units** to the tip of the hat's leaf (the game scales ×2.4, ×3.3 as the giant). Follow the sheet.

## Parts (pivots in Blender coordinates, model units; L = −X, R = +X)
**The tanuki** (shown normally):
| name | what | pivot |
|---|---|---|
| `body` | legs, torso, the straw rope sash | (0, 0, 0) |
| `belly` | the big cream drum belly (scaled 1…1.3 and wobbled as he drums) | (0, −0.165, 0.36) |
| marker `bellyTip` (empty) | the front of the belly (the drum effect) | (0, −0.405, 0.36) |
| `tail` | the huge ringed tail | (0, 0.26, 0.2) |
| `armL` | the −X arm **with the sake tokkuri** | (−0.31, −0.03, 0.5) |
| `armR` | the +X arm | (0.31, −0.03, 0.5) |
| `head` | head, ears, face, eye patches (closed smile mouth) | (0, −0.03, 0.74) |
| `jaw` | the open laughing mouth (scaled from 0 to 1.7 when he laughs: build it at its full open look at scale 1) | (0, −0.275, 0.77) |
| `blush` | the red tipsy cheeks (scaled 0 → 1 in the giant phase) | (0, −0.03, 0.825) |
| `hat` | the straw sugegasa **as it looks at rest (pushed back)** | (0, 0.03, 1.01) |
| `leaf` | the green transformation leaf on the hat (rest look baked in; the game wobbles it ±0.08 about Z) | ≈ (−0.016, 0.095, 1.155) |
**The boulder form** (shown instead of him): `rock` (a mossy boulder, radius **0.47**, centred on its pivot; his ears,
eyes and tail peek out of it; the game spins it about X to roll) at (0, 0, 0.47); `rockLeaf` (the leaf on top) at
(0, 0.05, 0.917). **The kettle form**: `kettle` (the bunbuku chagama body, little legs and the tail) at (0, 0, 0); `lid` (its
lid: rattles up and down and tilts) at (0, 0, 0.48); `khead` (his head peeking out the front) at (0, −0.2, 0.52); `kLeaf`
(the leaf on it) at (0.02, −0.18, 0.76); marker `spout` (empty) at the spout's tip (today ≈ (0, −0.56, 0.41)).
The game rotates: armL (x −2.6…0.5, z −1.6…0.6), armR (x −2.5…0.5, z −0.5…1.6), head (x −0.55…0.3, ±0.06, ±0.2), tail
(±0.06, ±0.6). Check the idle, the belly drum, the laugh, both forms and the giant (red cheeks, sake raised).

## Budget and file
≤ 25,000 triangles for all parts and both forms: `D:/projects/chewy-life-3d/public/models/danzaburo.glb`.

## Done when
- Matches the sheet's turnaround (measured) and its signature poses at the game's rotation values (rendered).
- Reads at the 45° game camera at the boss's game size, at 12 m and 25 m: the face, the silhouette, the props.
- The parts, names, pivots and markers exactly as above; flat hierarchy; rotation 0 / scale 1 on every object.
