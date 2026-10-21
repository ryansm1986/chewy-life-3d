# Model brief: tengu-master (Pawhaven boss, ROADMAP EN-1)

Follow `D:/projects/chewy-life-3d/tools/blender/work/codex/boss-contract.md` (it sits on top of the enemy contract,
`D:/projects/chewy-life-3d/.claude/skills/codex-blender/templates/enemy-model-contract.md`). The pick is **Option A "Wind Master"**:
`refs/sheet.png`. Build that design. `refs/current-tengu-master-in-game.png` is today's procedural boss in the game (size and
read only); `refs/approved-region-in-game.jpg` shows the region's approved Blender enemies he leads (the AFTER half): match
their finish. The builder you replace (read-only): **`buildTengu` in `src/regions/bosses/tengu.js` (and `buildKozo` for the disciple)**; read it and its `animate()` / fight code first.

## Size
Model units: about **1.15 units** to the top of the tokin (the game scales ×2.3: ≈ 2.6 m). Follow the sheet.

## Parts (pivots in Blender coordinates, model units; L = −X, R = +X as in the builder)
| name | what | pivot |
|---|---|---|
| `body` | geta, legs, hakama, robe, obi, the pompom sashes, the ruff, the arm held in a mudra, tail feathers | (0, 0, 0) |
| `head` | skull, eyes, white brows, beak (upper), tokin cap | (0, −0.02, 0.72) |
| `jaw` | the beak's lower half (opens down 0…1.05 rad about X for the laugh) | (0, −0.192, 0.805) |
| `lids` | closed eyelids over the eyes (shown while he meditates) | (0, −0.02, 0.72) |
| `fanArm` | the sleeve, the claw hand and the **whole feather fan**, one object | (0.19, 0, 0.645) |
| `wingL` / `wingR` | each wing, built **pointing along −X / +X from its shoulder** like the builder | (−0.1, 0.14, 0.63) / (0.1, 0.14, 0.63) |
| marker `fanTip` (empty) | the fan's centre, where the gust gathers | at the fan's centre in its rest pose (today ≈ (0.27, −0.16, 0.945)) |
The game rotates: fanArm (x −1.5…1.25, y −0.2…0.3, z −1.35…0.55); wings (y 0…1.3, z −0.45…0.9 ± a flap of 0.5, mirrored);
head (x ±0.3, roll 0…0.25); the whole figure leans, crouches, spins and hovers. Check the idle (wings folded behind as on
the sheet), the gust, the dive (wings spread) and the breather (fanning himself) with the game's values.

## Also: the Crow Disciple (karasu-kozō), his add
From the sheet's "Crow Disciple" callout: about **0.83 units** tall (game ×1.0), parts `body` (robe, head, eyes, brows,
beak, mini tokin, pompoms, feet), `wingL` (−0.16, 0.08, 0.36), `wingR` (0.16, 0.08, 0.36), built pointing along ∓X; the game
flaps them (y ±0.35, z ±(0.2 … 1.4)). Two GLBs: `karasu-kozo.glb` (robe #ece2ca) and `karasu-kozo_blue.glb` (robe #dfe8f4).
≤ 3,500 triangles each. Read `buildKozo` in tengu.js.

## Budget and files
Master Tengu ≤ 20,000 triangles: `D:/projects/chewy-life-3d/public/models/tengu-master.glb`. Plus the two disciple GLBs.

## Done when
- Matches the sheet's turnaround (measured) and its signature poses at the game's rotation values (rendered).
- Reads at the 45° game camera at the boss's game size, at 12 m and 25 m: the face, the silhouette, the props.
- The parts, names, pivots and markers exactly as above; flat hierarchy; rotation 0 / scale 1 on every object.
