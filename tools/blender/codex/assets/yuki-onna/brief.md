# Model brief: yuki-onna (Pawhaven boss, ROADMAP EN-1)

Follow `D:/projects/chewy-life-3d/tools/blender/work/codex/boss-contract.md` (it sits on top of the enemy contract,
`D:/projects/chewy-life-3d/.claude/skills/codex-blender/templates/enemy-model-contract.md`). The pick is **Option A "Frost Princess"**:
`refs/sheet.png`. Build that design. `refs/current-yuki-onna-in-game.png` is today's procedural boss in the game (size and
read only); `refs/approved-region-in-game.jpg` shows the region's approved Blender enemies he leads (the AFTER half): match
their finish. The builder you replace (read-only): **`buildYuki` in `src/regions/bosses/yukionna.js`**; read it and its `animate()` / fight code first.

## Size
Model units: about **1.2 units** tall (the game scales ×2.4: ≈ 2.9 m); she floats (the game lifts her). The origin is
under her hem's centre. Follow the sheet.

## The kimono pattern: vertex colours, not a texture
Today the kimono has a painted texture. Your model has **no texture**: carry the pattern as **big flat colour shapes**
in the mesh (the hem fading to icy blue as 2–3 bands, a wave band, big snowflakes ≥ 12 cm across as their own colour
regions cut into the mesh), like the sheet. The game lights ice-crystal colours: a pale cyan like **#c6f2ff** (high green
and blue, red a little lower) glows: use it for the tiara crystals, the brooch and the snowflake kanzashi; keep the
kimono's whites and pale blues out of that range.

## Parts (pivots in Blender coordinates, model units; L = −X, R = +X)
| name | what | pivot |
|---|---|---|
| `body` | the kimono (with its train), the obi, the brooch and the big bow | (0, 0, 0) |
| `head` | skull, neck, hair cap, the fringe and side locks, the tiara, the kanzashi | (0, 0, 0.87) |
| `face` | the face features only (eyes, brows, nose, mouth, blush; the game gives it a very thin outline, no shadow) | (0, 0, 0.87) |
| `lids` | closed eyelids (blink, meditation) | (0, 0, 0.87) |
| `mouthO` | the small "o" mouth of the breath (scaled 0 → 1) | (0, 0, 0.87) |
| `puff` | the puffed cheeks of the breath (scaled 0 → 1) | (0, 0, 0.87) |
| `hairB` | the long back hair (sways about X) | (0, 0.05, 1.0) |
| `slR` / `slL` | each long sleeve (+X / −X), swinging from the shoulder | (0.172, 0, 0.725) / (−0.172, 0, 0.725) |
| `shawl` | the floating hagoromo shawl ribbon (≥ 4 cm thick, broad face up) | (0, 0, 0.7) |
The game rotates: slR (x −2.7…−0.22, z 0.06…2.1), slL (x −1.6…−0.22, z −2.1…−0.06), head (x −0.3…0.16, roll 0…0.14),
hairB (x −0.3…0.15), the whole figure spins for the twirl; glass copies use the same model in a glassy material. Check
the idle, the blizzard breath (sleeves up, cheeks puffed), the icicle call (one sleeve raised) and the twirl.

## Budget and file
≤ 22,000 triangles: `D:/projects/chewy-life-3d/public/models/yuki-onna.glb`.

## Done when
- Matches the sheet's turnaround (measured) and its signature poses at the game's rotation values (rendered).
- Reads at the 45° game camera at the boss's game size, at 12 m and 25 m: the face, the silhouette, the props.
- The parts, names, pivots and markers exactly as above; flat hierarchy; rotation 0 / scale 1 on every object.
