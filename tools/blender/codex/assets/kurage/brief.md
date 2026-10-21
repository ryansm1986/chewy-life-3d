# Model brief: kurage (enemy series EN-1, Shiokaze Tidepools)

Follow `D:/projects/chewy-life-3d/.claude/skills/codex-blender/templates/enemy-model-contract.md` exactly, plus the
**Tide Pool note** and the **origin exception** below. The owner picked **Option B "Wind Chime"**: `refs/sheet.png`.
Build that design. `refs/current-kurage-in-game.png` is today's procedural model (size and read only).
`refs/approved-bamboo-trio-in-game.jpg` and `refs/approved-maple-trio-in-game.jpg` show the approved Blender enemies of
the first two regions in the game (the AFTER half): match their finish.

## Tide Pool note (how this kind is animated and drawn)
- The game merges `body`, `core`, `frill`, `arms` and `tentacles` into one mesh and sways them **on the GPU**
  (`JELLY_HOOK` in `src/regions/monsters/tidepool.js`, read-only): everything below the rim waves side to side (±7 cm),
  trails back when it drifts (the tips up to 32 cm back and 12 cm up) and widens a little on each pulse, weighted by
  how far below the rim it is.
- The **`bell` is drawn separately, see-through**: a translucent glass material (about 35–45 % opaque, more at the
  edges, brightened from inside), depth-writing, so you see one clean layer of it and the core through it. It gets an ink
  outline that only shows round its silhouette. Model it as a **smooth thin closed shell** (about 1.5–2 cm thick), open
  underneath, with a rounded lip at the rim; its vertex colour is the bell colour, with the gentle vertical lobes of a
  wind chime as soft colour bands (≥ 3 cm wide).
- The **face is on `body`, not on the bell**: eyes, brows, mouth and blush as thin opaque shells sitting **3–5 mm
  outside** the bell's surface (so they draw solid over the glass).
- Glow: give the **core** and the **glowing tentacle tips** the `glow` material (the game makes those faces glow and
  flare when it charges); nothing else glows.
- The pivots and part names must be identical in all three variants.

## Origin exception
The kurage floats. **The origin (0, 0, 0) is the centre of the bell's rim** (not the ground): the bell sits above
z = 0 and the frill, arms and tentacles hang below it. The game lifts it about 0.95 m and bobs it. Every part's origin is
(0, 0, 0).

## What it is
The zapping caster of the beach region (packs of 4–8): a sleepy wind-chime jellyfish. It floats and bobs, the bell
pulsing and the tentacles swaying and trailing as it drifts in; it **charges up** (the core flares, sparks crackle) and
sends out **expanding electric rings** across the ground.

## Size (Blender units = m; the game uses it at ×1.0)
- The **bell**: about **0.85 m** across at its widest, about 0.55 m from the rim to the top of the bell, rounder than a
  lantern like the sheet (a glass fūrin). The dark lacquer **cap** #4a2630 with its carry loop on top (a chunky ring), a
  dark lacquer **rim band** #4a2630 round the bell's mouth.
- The **core** (the clapper): a glowing bulb #fff0a0 about 0.16 m across hanging inside the bell on a dark stem from the
  cap (the stem is `body`), its bottom about 0.12 m above the rim.
- The **face** on the front of the bell, low and big like the sheet: sleepy half-lidded eyes (dark irises, catchlights,
  a heavy upper lid #4a2630), a little "ω" mouth, blush #e98c91. It must read through nothing: it's opaque, on top.
- The **frill** #ff9a68: a skirt of chunky rounded petal lobes just under the rim band.
- **Four oral arms** #ffd4b4 from the centre under the bell: short, frilly, chunky (≈ 0.25–0.3 m long).
- **Tentacles** #ffe6cc: four short soft ribbons round the rim (≈ 0.6–0.7 m) and one long broad **tanzaku** ribbon in the
  middle (≈ 0.85 m), as on the sheet, each with a glowing tip #fff0a0. Ribbons are **chunky** (≥ 4 cm thick, ≥ 8–12 cm
  wide), with their broad faces turned so they read from 45° above, never hair-thin.
- Total about **1.6 m** from the loop to the lowest tip.

## Parts
| name | what | pivot (origin) | how the game moves it |
|---|---|---|---|
| `body` | cap, loop, core stem, rim band, face | (0, 0, 0) = rim centre | bob, pulse squash ±10 %, tilt ±0.15 rad |
| `bell` | the glass shell only | (0, 0, 0) | drawn translucent (above); moves with `body` |
| `core` | the glowing bulb (all `glow`) | (0, 0, 0) | glows; brightens ×2–3 when charging |
| `frill` | the petal skirt | (0, 0, 0) | sways a little |
| `arms` | the four oral arms, one object | (0, 0, 0) | sway, trail and pulse, more toward their ends |
| `tentacles` | the five ribbons, one object (tips on `glow`) | (0, 0, 0) | sway, trail and pulse, more toward the tips |

Check with your own render of the sway: offset every vertex below the rim by up to 7 cm sideways and 30 cm back at the
lowest tip (weighted by depth below the rim); the ribbons must not cut through each other badly or through the bell.

## Variants
1. `kurage.glb` ("Chōchin", base): as above.
2. `kurage_ao.glb` ("Ao", blue): bell #86d0ff, core and tips #e6fcff, frill #6aaeff, arms #cdeeff, tentacles #e8f8ff,
   cap/rim/lids #233a5e.
3. `kurage_sakura.glb` ("Sakura", pink): bell #ffa6d2, core and tips #fff2fa, frill #ff78b6, arms #ffd2ea, tentacles
   #ffe8f6, cap/rim/lids #5a2448, plus a chunky little **sakura blossom** (#ffd0e6, centre #ff78b6) on the cap (in `body`).

## Budget
≤ 5,000 triangles for all six parts, per variant.

## Done when
- Matches the sheet's front, 3/4, side and back (measured; show the bell semi-transparent in your renders so the core
  shows through, as the game will).
- From 45° above at 16 m the face, the glowing core and the ribbons read.
- Three GLBs, ≤ 5k tris each, front −Y, origin at the rim centre, the same parts in all three.
