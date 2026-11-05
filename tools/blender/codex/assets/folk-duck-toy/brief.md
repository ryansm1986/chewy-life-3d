# Asset brief: folk-duck-toy (Z-D6 "Blender everything": the Blender townsfolk ducks, phase 1: the models)

Read `../villager-toy-common.md` first: the shared technical rules, the lessons and the process rules. **Differences from
it**:
- These are **townsfolk**, not named villagers: ordinary ducks who move into Blossom Hollow as it grows (and stand in
  the zone villages, the Guild hires and the dungeon NPCs). The game draws them at random from the set of Blender
  townsfolk, so many may be on screen at once: keep each one **<= 22k triangles** (not 30k), one 2048 atlas each.
- You build **2 characters**, one GLB each, in this task:
  - design **A**: game id `folk_duck_a`, `public/models/folk-duck-a-toy.glb`
  - design **B**: game id `folk_duck_b`, `public/models/folk-duck-b-toy.glb`
- The sheet `refs/sheet.png` (Codex, 2026-11-04) has three designs in rows A, B, C; **the owner picked A and B**. It is
  the blueprint: don't redesign, just build them beautifully. `refs/notes.md` is Codex's own notes for the sheet (palette,
  outfit, volumes, left/right consistency): the sections for your designs are copied below.
- Build the designs as **one family**: one deterministic `build_folk-duck-toy.py --design <a|b|c>|all` with a shared
  species base (head, face, eyes, hands, feet, tail) and per-design proportions, markings and outfits. Model
  **design A fully first** (measured, compared, checked at the game camera), then the others from the same base.
- Measure each design on its own row of the sheet (`measure-<x>.md`). Write `joints-<x>.json` per design.
- Outputs: `D:/projects/chewy-life-3d/public/models/folk-duck-<x>-toy.glb`; previews in `preview/<x>/` (the shared
  brief's list: `portrait.png`, `game-45.png` from both yaws, `cmp-head.png`, `cmp-body.png`, ...), plus
  `preview/family.png`: all your designs side by side at the game camera, same scale.

## The owner's picks (from `refs/notes.md`)
### A — Mugi, the steady gardener
**Idea:** A dependable white duck whose wide straw hat and sage work overalls make a clear, practical garden silhouette.

**Proportions:** 1.05 m, approximately 2.4 heads tall excluding hat; head height approximately 0.438 m. Standard sturdy build with an upright oval torso.

**Palette:** Plumage `#FFF8EC`; bill / feet `#F2A044`; irises `#8A572D`; brows / pupils / nostrils `#35251E`; blush `#EAA095`; overalls / hat band `#91B58A`; straw hat `#DFC280`; overall buttons `#FFF8EC`.

**Outfit and volumes:** Overalls are a rounded trouser mass, a broad square bib and two thick shoulder bands; one large rounded bib pocket and simple round buttons. The back has two parallel shoulder bands. Hat is a low rounded dome over a thick rounded disk brim, with one broad sage band. White wing-arms and orange feet remain exposed. Avoid weave texture and hanging hat strings.

**Difference:** The widest headwear silhouette, the most upright working build and the square green bib distinguish Mugi from the round baker and the smaller smock-wearing child.

### B — Mochi, the gentle baker's helper
**Idea:** A butter-yellow duck with a generous pear-shaped belly, a soft lilac wrap top and a simple cream work apron.

**Proportions:** 1.05 m, approximately 2.4 heads tall; head height approximately 0.438 m. Widest belly and shortest-looking, thickest legs of the three.

**Palette:** Plumage `#FFE8A0`; bill / feet `#F2A044`; irises `#8A572D`; brows / pupils / nostrils `#35251E`; blush `#EAA095`; wrap tunic `#B8A3CC`; apron / waistband / sclera `#FFF8EC`.

**Outfit and volumes:** Torso is a broad pear / egg. Tunic is a short rounded shell with thick short sleeves and an overlapping diagonal collar. Apron is a softly curved rectangular front panel with one large rounded pocket. A broad waistband circles the torso and closes with a flat rounded patch at the back; no bow or strings. Scalp feather bumps are blunt integrated shapes, not hair or ears. No hat or handheld accessory.

**Difference:** The full butter-yellow head, uncovered crown, broad belly and pale apron create a softer, rounder read than either neighbour.

## Shared notes from the sheet
### Shared modelling language
- Target proportion: approximately 2.4 heads tall, excluding headwear; head : remainder of body = 1 : 1.4. Heights below are barefoot to scalp, excluding hats.
- Head: broad rounded squircle / softened box, slightly wider than tall. Body: short rounded volume. Arms: thick tapered capsules ending in fingerless wing mittens, held about 30 degrees out. Feet: broad flattened orange webbed wedges with three rounded toe lobes.
- Bill: short, broad, flattened orange capsule with rounded edges, a closed smile seam and two small nostril dimples. No separate mammal nose, muzzle or ears. Tail: one small rounded wedge at the lower back.
- Matte smooth surfaces, crisp material boundaries, simple large forms. Eyes use warm-white sclera, amber-brown irises, dark pupils and upper lash lines, with two catchlights. Blush is a simple oval dab.
- Common palette: white plumage / sclera `#FFF8EC`; butter-yellow plumage `#FFE8A0`; bill and feet `#F2A044`; irises `#8A572D`; brows, pupils, lash lines and nostrils `#35251E`; blush `#EAA095`.
- Swatch hex values specify intended base materials; highlights and shading in the illustration are not additional material colours.

## Done when
As in the shared brief, for every design:
- within about 5% of your measured targets;
- appealing in `portrait.png`;
- the outfit and accessories reading well in `game-45.png` from both 45 deg yaws;
- <= 22k triangles, one atlas, `joints-<x>.json`.
End your reply with one report covering every design (the shared brief's report, per design), then stop.

## Closest finished references
`D:/projects/chewy-life-3d/tools/blender/codex/assets/`: sk-shinju-toy (a cream duck), kero-toy (no ears, eyes high). Their build scripts, READMEs and `direction/` show the technique and what the director checks.
