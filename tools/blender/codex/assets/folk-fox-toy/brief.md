# Asset brief: folk-fox-toy (Z-D6 "Blender everything": the Blender townsfolk foxes, phase 1: the models)

Read `../villager-toy-common.md` first: the shared technical rules, the lessons and the process rules. **Differences from
it**:
- These are **townsfolk**, not named villagers: ordinary foxes who move into Blossom Hollow as it grows (and stand in
  the zone villages, the Guild hires and the dungeon NPCs). The game draws them at random from the set of Blender
  townsfolk, so many may be on screen at once: keep each one **<= 22k triangles** (not 30k), one 2048 atlas each.
- You build **2 characters**, one GLB each, in this task:
  - design **A**: game id `folk_fox_a`, `public/models/folk-fox-a-toy.glb`
  - design **C**: game id `folk_fox_c`, `public/models/folk-fox-c-toy.glb`
- The sheet `refs/sheet.png` (Codex, 2026-11-04) has three designs in rows A, B, C; **the owner picked A and C**. It is
  the blueprint: don't redesign, just build them beautifully. `refs/notes.md` is Codex's own notes for the sheet (palette,
  outfit, volumes, left/right consistency): the sections for your designs are copied below.
- Build the designs as **one family**: one deterministic `build_folk-fox-toy.py --design <a|b|c>|all` with a shared
  species base (head, face, eyes, hands, feet, tail) and per-design proportions, markings and outfits. Model
  **design A fully first** (measured, compared, checked at the game camera), then the others from the same base.
- Measure each design on its own row of the sheet (`measure-<x>.md`). Write `joints-<x>.json` per design.
- Outputs: `D:/projects/chewy-life-3d/public/models/folk-fox-<x>-toy.glb`; previews in `preview/<x>/` (the shared
  brief's list: `portrait.png`, `game-45.png` from both yaws, `cmp-head.png`, `cmp-body.png`, ...), plus
  `preview/family.png`: all your designs side by side at the game camera, same scale.

## The owner's picks (from `refs/notes.md`)
### A — Hana, sunny gardener
**Idea:** An energetic orange fox whose sage overalls and single yellow flower make the gardening role readable at a distance.

**Proportions:** 1.05 m tall; approximately 2.4 heads; standard rounded build, broad head, short straight legs and broad feet.

**Outfit:** Cream short-sleeve shirt beneath sage work overalls, integrated broad shoulder bands and one large rounded bib pocket. One thick-petalled flower at the character's right ear. Bare paws.

**Main volumes:** Squircle head; two broad rounded triangular ear wedges; two smooth cheek masses; shallow paired muzzle lobes; compact oval torso; rounded cuboid bib; two soft short trouser volumes; capsule limbs; flattened oval feet. The tail is one broad curved teardrop rooted at the rear pelvis, orange for roughly two-thirds with a cream tip. Flower is five thick flattened ellipsoids and one rounded center.

**Palette:**

| Part | Hex |
| --- | --- |
| Fur | #FF9A4A |
| Muzzle, inner ears and tail tip | #FFF0D5 |
| Ear tips, nose, brows, eye contours and pupils | #493128 |
| Irises | #A9692C |
| Overalls and flower center | #8EAD78 |
| Shirt | #FFF0D5 |
| Flower petals | #E6C86E |
| Blush | #EBA095 |
| Sclera and catchlights | #FFF8EF |

**Difference:** Strong orange/green color blocking, a practical bib silhouette and an open, cheerful face. More balanced in build than B; taller and more work-oriented than C.

### C — Yume, dreamy schoolkid
**Idea:** A smaller curious fox in a lilac tunic dress with one large mustard satchel.

**Proportions:** 0.94 m tall; approximately 2.4 heads; narrower torso and cheeks, smaller body, relatively prominent upright ears.

**Outfit:** Simple lilac short-sleeve A-line tunic dress with a broad clean hem. Mustard satchel at the character's left hip, attached by one very wide diagonal rounded band from the right shoulder. Plain chunky flap; no clasp, thin straps or hanging details. Bare paws.

**Main volumes:** Slightly narrower squircle head; tall broad ear wedges; small shallow muzzle; compact oval torso inside a rounded bell/frustum dress; capsule limbs; oval feet. Satchel is a rounded cuboid with a thick curved flap, strap a broad solid ribbon. One medium curved orange tail with a cream distal third.

**Palette:**

| Part | Hex |
| --- | --- |
| Fawn limbs and body beneath dress | #F4D0A0 |
| Orange head, outer ears and tail base | #FF9A4A |
| Muzzle, inner ears and tail tip | #FFF0D5 |
| Ear tips, nose, brows, eye contours and pupils | #493128 |
| Irises | #996D37 |
| Dress | #B4A0CB |
| Satchel and strap | #D8B86C |
| Blush | #EBA095 |
| Sclera and catchlights | #FFF8EF |

**Difference:** Smaller stature, orange head with fawn limbs, lilac bell silhouette and a single strong diagonal bag strap. The costume and build read as a child alongside the two working adults.

## Shared notes from the sheet
(none)

## Done when
As in the shared brief, for every design:
- within about 5% of your measured targets;
- appealing in `portrait.png`;
- the outfit and accessories reading well in `game-45.png` from both 45 deg yaws;
- <= 22k triangles, one atlas, `joints-<x>.json`.
End your reply with one report covering every design (the shared brief's report, per design), then stop.

## Closest finished references
`D:/projects/chewy-life-3d/tools/blender/codex/assets/`: yk-mikan-toy, tk-kazemaru-toy, kitsune-toy. Their build scripts, READMEs and `direction/` show the technique and what the director checks.
