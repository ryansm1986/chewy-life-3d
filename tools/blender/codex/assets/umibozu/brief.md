# Model brief: umibozu (Pawhaven boss, ROADMAP EN-1)

Follow `D:/projects/chewy-life-3d/tools/blender/work/codex/boss-contract.md` (it sits on top of the enemy contract,
`D:/projects/chewy-life-3d/.claude/skills/codex-blender/templates/enemy-model-contract.md`). The pick is **Option A "Sleepy Sea Monk"**:
`refs/sheet.png`. Build that design. `refs/current-umibozu-in-game.png` is today's procedural boss in the game (size and
read only); `refs/approved-region-in-game.jpg` shows the region's approved Blender enemies he leads (the AFTER half): match
their finish. The builder you replace (read-only): **`buildUmibozu` in `src/regions/bosses/umibozu.js` and `handGeo` in `src/regions/bosses/fx_umibozu.js`**; read it and its `animate()` / fight code first.

## Size
Model units: from **−0.62 to 1.19 units** in height, **z 0 = the waterline** (the body continues 0.62 below it, under the
sea); the game scales ×4.4 (≈ 5.2 m above the water). The origin (0, 0, 0) is on the waterline under his centre.

## Parts (pivots in Blender coordinates, model units)
| name | what | pivot |
|---|---|---|
| `body` | the round body and head, shoulders, brows, blush, the forehead pearl, the juzu (pearl beads + the gold mother bead + tassel), the kelp sprout, any small shells | (0, 0, 0) |
| `eyeL` / `eyeR` | each eye white (a flattened disc / lens), facing outward ~19° like the builder's | (−0.2, −0.457, 0.79) / (0.2, −0.457, 0.79) |
| `pupilL` / `pupilR` | each dark pupil + its catchlight (the game slides them to look at you) | on each eye's front surface, centred |
| `mouthSmile` | the gentle smile (hidden when the mouth opens) | (0, −0.491, 0.6) |
| `mouthOpen` | the open mouth (scaled 0 → 1 when he spits) | (0, −0.491, 0.6) |
| `cheeks` | the two puffed cheek bulges (scaled 0 → 1.1 for the ink spit) | (0, −0.491, 0.6) |
The game blinks the eyes (scale Z 1 → 0.08), makes them glow (their material is its own: just give them clean flat
white / dark colours), and lays a water sheet and foam over the body (keep the body a smooth closed shape).

## The hand (a separate GLB, in metres)
`umibozu-hand.glb`: one object `body`, the giant **mitten hand** of the sheet, in **metres** at the size `handGeo` builds
today, the **wrist at the origin, the fingers pointing −Y, the palm facing −Z (down)**, the thumb on **+X**. The game
mirrors it for the other hand, and draws the rubber-hose arm itself. ≤ 2,500 triangles.

## Budget and files
Body ≤ 20,000 triangles: `D:/projects/chewy-life-3d/public/models/umibozu.glb`; the hand `D:/projects/chewy-life-3d/public/models/umibozu-hand.glb`.

## Done when
- Matches the sheet's turnaround (measured) and its signature poses at the game's rotation values (rendered).
- Reads at the 45° game camera at the boss's game size, at 12 m and 25 m: the face, the silhouette, the props.
- The parts, names, pivots and markers exactly as above; flat hierarchy; rotation 0 / scale 1 on every object.
