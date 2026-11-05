# Asset brief: folk-bunny-toy (Z-D6 "Blender everything": the Blender townsfolk bunnies, phase 1: the models)

Read `../villager-toy-common.md` first: the shared technical rules, the lessons and the process rules. **Differences from
it**:
- These are **townsfolk**, not named villagers: ordinary bunnies who move into Blossom Hollow as it grows (and stand in
  the zone villages, the Guild hires and the dungeon NPCs). The game draws them at random from the set of Blender
  townsfolk, so many may be on screen at once: keep each one **<= 22k triangles** (not 30k), one 2048 atlas each.
- You build **2 characters**, one GLB each, in this task:
  - design **A**: game id `folk_bunny_a`, `public/models/folk-bunny-a-toy.glb`
  - design **B**: game id `folk_bunny_b`, `public/models/folk-bunny-b-toy.glb`
- The sheet `refs/sheet.png` (Codex, 2026-11-04) has three designs in rows A, B, C; **the owner picked A and B**. It is
  the blueprint: don't redesign, just build them beautifully. `refs/notes.md` is Codex's own notes for the sheet (palette,
  outfit, volumes, left/right consistency): the sections for your designs are copied below.
- Build the designs as **one family**: one deterministic `build_folk-bunny-toy.py --design <a|b|c>|all` with a shared
  species base (head, face, eyes, hands, feet, tail) and per-design proportions, markings and outfits. Model
  **design A fully first** (measured, compared, checked at the game camera), then the others from the same base.
- Measure each design on its own row of the sheet (`measure-<x>.md`). Write `joints-<x>.json` per design.
- Outputs: `D:/projects/chewy-life-3d/public/models/folk-bunny-<x>-toy.glb`; previews in `preview/<x>/` (the shared
  brief's list: `portrait.png`, `game-45.png` from both yaws, `cmp-head.png`, `cmp-body.png`, ...), plus
  `preview/family.png`: all your designs side by side at the game camera, same scale.

## The owner's picks (from `refs/notes.md`)
### A — Hana, the gardener
**Idea:** An attentive white bunny whose upright ears and mint overalls make a fresh, vertical silhouette.

**Proportions:** Approximately 2.4 heads from sole to skull crown, excluding ears; modelling target 1.05 m to crown. Head height approximately 0.44 m; ear extension approximately 0.30 m. Standard compact build, intermediate in width between B and C. These are intended modelling dimensions, not measured orthographic dimensions from the generated image.

**Outfit:** Cream short-sleeve shirt under mint work overalls, two thick straps, two large buttons and one broad bib pocket. One coral flower sits at the base of the character's left ear (viewer right in front). Bare feet and mittens.

**Simple volumes:** Soft bevelled squircle head; two long upright tapered capsules with inset pink panels; shallow paired muzzle cushions; pear-shaped torso; short padded sleeves; capsule arms and mittens; two thick rounded trouser lobes; broad flattened oval feet; spherical tail. Flower consists of five thick rounded petals and one central button. Overall straps are raised solid bands, with two parallel straps on the back.

**Difference:** Tallest ear silhouette, brightest fur, practical trouser costume and an alert, open personality.

| Material | Hex |
| --- | --- |
| Fur | #FFFFFF |
| Muzzle / eye whites | #FFF8EF |
| Inner ears / blush | #EAA99F |
| Irises | #704B32 |
| Nose / brows / pupils / mouth | #49332D |
| Shirt / overall buttons | #F3E5CD |
| Overalls | #8FB79B |
| Flower | #E89291 |

### B — Momo, the baker's helper
**Idea:** A soft fawn lop with a lavender beret and a roomy apron, giving the village a calm, comforting presence.

**Proportions:** Approximately 2.4 heads from sole to skull crown, excluding hat; modelling target 1.05 m to crown. Head height approximately 0.44 m. Beret adds approximately 0.12 m. Widest belly and cheeks of the three, with long ears falling to shoulder level.

**Outfit:** Peach short-sleeve smock dress, cream apron with one rounded pocket, two broad shoulder straps and a broad rear waist fastening. Lavender beret with a stout top nub. Bare fawn feet and mittens; no dangling apron ties.

**Simple volumes:** Broad squircle head; two heavy curved capsule ears; small muzzle cushions; rounded pear torso inside a bell-shaped smock shell; thick apron slab with rounded edges; shallow padded pocket; flattened dome beret with a broad rolled band; round tail; broad oval feet. Keep the ears visibly rooted under the beret and separate from the arms.

**Difference:** Only lop-eared character; warm fawn fur, fullest build and a broad skirt/apron silhouette. The beret gives a low, rounded crown instead of A and C's upright ear silhouettes.

| Material | Hex |
| --- | --- |
| Fur | #E8D0C0 |
| Muzzle / eye whites | #FFF8EF |
| Inner ears / blush | #EAA99F |
| Irises | #704B32 |
| Nose / brows / pupils / mouth | #49332D |
| Smock | #E8AD93 |
| Apron / straps | #F3E5CD |
| Beret | #B7AACD |

## Shared notes from the sheet
### Modelling handoff
- Use the hex tables as material targets; the gentle shading in the artwork changes apparent local colour.
- Keep each bunny's front and three-quarter views as the main shape reference. Side and back views clarify garment construction, ear depth and tail placement.
- Keep markings crisp. Use smooth surfaces and a few solid volumes rather than fur strands, cloth weave, fringes or thin ties.
- The sheet includes all required views, palettes and three different townsfolk. Optional expressions were omitted to preserve room for the turnarounds.
- Generated with the built-in image-generation tool. The exact generation prompt is saved in `generation-prompt.md`.

## Done when
As in the shared brief, for every design:
- within about 5% of your measured targets;
- appealing in `portrait.png`;
- the outfit and accessories reading well in `game-45.png` from both 45 deg yaws;
- <= 22k triangles, one atlas, `joints-<x>.json`.
End your reply with one report covering every design (the shared brief's report, per design), then stop.

## Closest finished references
`D:/projects/chewy-life-3d/tools/blender/codex/assets/`: tk-chiku-toy, usagi-toy. Their build scripts, READMEs and `direction/` show the technique and what the director checks.
