# Asset brief: folk-tanuki-toy (Z-D6 "Blender everything": the Blender townsfolk tanuki, phase 1: the models)

Read `../villager-toy-common.md` first: the shared technical rules, the lessons and the process rules. **Differences from
it**:
- These are **townsfolk**, not named villagers: ordinary tanuki who move into Blossom Hollow as it grows (and stand in
  the zone villages, the Guild hires and the dungeon NPCs). The game draws them at random from the set of Blender
  townsfolk, so many may be on screen at once: keep each one **<= 22k triangles** (not 30k), one 2048 atlas each.
- You build **2 characters**, one GLB each, in this task:
  - design **A**: game id `folk_tanuki_a`, `public/models/folk-tanuki-a-toy.glb`
  - design **B**: game id `folk_tanuki_b`, `public/models/folk-tanuki-b-toy.glb`
- The sheet `refs/sheet.png` (Codex, 2026-11-04) has three designs in rows A, B, C; **the owner picked A and B**. It is
  the blueprint: don't redesign, just build them beautifully. `refs/notes.md` is Codex's own notes for the sheet (palette,
  outfit, volumes, left/right consistency): the sections for your designs are copied below.
- Build the designs as **one family**: one deterministic `build_folk-tanuki-toy.py --design <a|b|c>|all` with a shared
  species base (head, face, eyes, hands, feet, tail) and per-design proportions, markings and outfits. Model
  **design A fully first** (measured, compared, checked at the game camera), then the others from the same base.
- Measure each design on its own row of the sheet (`measure-<x>.md`). Write `joints-<x>.json` per design.
- Outputs: `D:/projects/chewy-life-3d/public/models/folk-tanuki-<x>-toy.glb`; previews in `preview/<x>/` (the shared
  brief's list: `portrait.png`, `game-45.png` from both yaws, `cmp-head.png`, `cmp-body.png`, ...), plus
  `preview/family.png`: all your designs side by side at the game camera, same scale.

## The owner's picks (from `refs/notes.md`)
### A — Momo, the gardener
**Idea:** An attentive flower gardener with a pear-shaped body, green work overalls and one peach flower beside the left ear.

**Proportions:** 1.05 m crown-to-sole; approximately 2.4 heads; target head height 0.4375 m and remaining body height 0.6125 m. Standard build between B's wide belly and C's compact child body.

**Palette:** Fur **#A08070**; mask/ears/limbs/tail tip **#4A3A34**; muzzle **#E7D6BD**; eyes **#68432C**; nose/pupils **#32251F**; overalls **#8DAA72**; shirt **#F4E8D7**; flower petals **#EAA382**; flower center **#E8C77B**; eye whites **#FFF8EF**; blush **#E8A093**.

**Outfit:** Ivory short-sleeve shirt beneath green short overalls. Two thick rounded shoulder bands, a broad bib, simple waistband and short trouser legs. One five-petal flower on the character's anatomical left, visible on the viewer's right in the front view. No extra tools or accessories.

**Main volumes:** Broad squircle head; small rounded triangular ears; flattened oval muzzle; pear-shaped torso; rounded box bib and shorts; capsule arms; oval mittens; short cylinder legs; wide rounded wedge feet; compact capsule tail with a broad dark end. Flower = five thick flattened ovals around a rounded center.

**Difference:** Most practical workwear silhouette; the green bib and flower distinguish the gardener immediately.

### B — Bun, the baker's helper
**Idea:** A cheerful, round-bellied bakery helper in a butter-yellow work smock and powder-blue neckerchief.

**Proportions:** 1.05 m crown-to-sole; approximately 2.4 heads; target head height 0.4375 m and remaining body height 0.6125 m. Widest torso and low rounded cheeks; stocky visible lower legs.

**Palette:** Fur **#8F7466**, a deeper shade of the game's taupe family; mask/ears/limbs/tail tip **#4A3A34**; muzzle **#E7D6BD**; eyes **#68432C**; nose/pupils **#32251F**; smock **#E8C77B**; pocket **#F4E8D7**; neckerchief **#8FB8CA**; eye whites **#FFF8EF**; blush **#E8A093**.

**Outfit:** Simple yellow short-sleeve smock with one large cream front patch pocket, bare dark lower legs and feet. Blue neckerchief uses a thick rounded band, one solid knot and two short broad ends. The pocket and knot stay on the front; no rear pocket.

**Main volumes:** Broad squircle head with fuller cheek lobes; oval muzzle; wide egg-shaped belly; smock as one rounded bell shell with a gently curved hem; short rounded sleeve cylinders; capsule limbs and oval mittens; broad low feet; short thick tail emerging below the rear hem. Pocket = shallow rounded rectangle. Scarf = rounded band, ball knot and two flattened teardrops.

**Difference:** Deepest fur, largest belly and a simple yellow bell silhouette; the baker's helper reads softer and stockier than the others.

## Shared notes from the sheet
### Shared toy-line construction
Match the supplied Kuma villager reference: smooth matte vinyl surfaces, a broad rounded squircle head, simple soft volumes, mitten hands, wide bare feet, clear markings and no individual fur strands. Keep the face mask crisp, the muzzle short and the tail thick and unringed with one broad dark tip. Use the same anatomy and costume around each turnaround.

Modelling target: 2.4 heads tall, measured crown-to-chin against crown-to-sole, excluding ears and accessories. That is a head-to-rest-of-body height ratio of 1:1.4. Generated views approximate these proportions and are visual guides, not dimensionally exact orthographic drawings. Use the dimensions below to establish the model.

Shared palette: dark masks, ears, limbs and tail tips **#4A3A34**; cream muzzle **#E7D6BD**; brown irises **#68432C**; nose and pupils **#32251F**; eye whites and catchlights **#FFF8EF**; blush **#E8A093**. Use flat base-color boundaries; the sheet's shading is not additional marking. For final eye materials, give each eye a large dark pupil and two simple catchlights; the small second catchlight is not reliably resolved in this sheet.

## Done when
As in the shared brief, for every design:
- within about 5% of your measured targets;
- appealing in `portrait.png`;
- the outfit and accessories reading well in `game-45.png` from both 45 deg yaws;
- <= 22k triangles, one atlas, `joints-<x>.json`.
End your reply with one report covering every design (the shared brief's report, per design), then stop.

## Closest finished references
`D:/projects/chewy-life-3d/tools/blender/codex/assets/`: tk-fuku-toy, yk-yuzu-toy, ak-benji-toy (the leaf on the head), tanu-toy. Their build scripts, READMEs and `direction/` show the technique and what the director checks.
