# Asset brief: folk-panda-toy (Z-D6 "Blender everything": the Blender townsfolk pandas, phase 1: the models)

Read `../villager-toy-common.md` first: the shared technical rules, the lessons and the process rules. **Differences from
it**:
- These are **townsfolk**, not named villagers: ordinary pandas who move into Blossom Hollow as it grows (and stand in
  the zone villages, the Guild hires and the dungeon NPCs). The game draws them at random from the set of Blender
  townsfolk, so many may be on screen at once: keep each one **<= 22k triangles** (not 30k), one 2048 atlas each.
- You build **2 characters**, one GLB each, in this task:
  - design **A**: game id `folk_panda_a`, `public/models/folk-panda-a-toy.glb`
  - design **B**: game id `folk_panda_b`, `public/models/folk-panda-b-toy.glb`
- The sheet `refs/sheet.png` (Codex, 2026-11-04) has three designs in rows A, B, C; **the owner picked A and B**. It is
  the blueprint: don't redesign, just build them beautifully. `refs/notes.md` is Codex's own notes for the sheet (palette,
  outfit, volumes, left/right consistency): the sections for your designs are copied below.
- Build the designs as **one family**: one deterministic `build_folk-panda-toy.py --design <a|b|c>|all` with a shared
  species base (head, face, eyes, hands, feet, tail) and per-design proportions, markings and outfits. Model
  **design A fully first** (measured, compared, checked at the game camera), then the others from the same base.
- Measure each design on its own row of the sheet (`measure-<x>.md`). Write `joints-<x>.json` per design.
- Outputs: `D:/projects/chewy-life-3d/public/models/folk-panda-<x>-toy.glb`; previews in `preview/<x>/` (the shared
  brief's list: `portrait.png`, `game-45.png` from both yaws, `cmp-head.png`, `cmp-body.png`, ...), plus
  `preview/family.png`: all your designs side by side at the game camera, same scale.

## The owner's picks (from `refs/notes.md`)
### A — Hana, the steady gardener
Idea: A practical, welcoming gardener with a flower beside one ear and sturdy sage overalls.

Proportions: 1.05 m; 2.4 heads tall, approximately 0.438 m per head unit. Medium-width pear-shaped body, broad softly squared head and medium rounded ears.

Outfit: Coral short-sleeved shirt, sage bib overalls with thick shoulder bands, two large cream buttons and one broad bib pocket. A chunky yellow flower sits beside the character's left ear. Bare dark paws.

Main volumes: Rounded squircle head; shallow oval muzzle; vertical oval eye patches; pear torso; short capsule arms; mitten hands; two squat rounded overall legs; broad flattened oval feet. Build the flower from thick petal lobes. Back straps and waistband are broad solid bands.

Palette:

| Part | Hex |
| --- | --- |
| White fur | #FBF8F4 |
| Eye patches, ears, limbs | #262D2B |
| Irises | #795037 |
| Nose and pupils | #191B1A |
| Shirt and blush | #E8A18D |
| Overalls and flower leaf | #91AF84 |
| Buttons | #F2E3BD |
| Flower | #E8C56A |

Difference: The medium sturdy build, upright patches, overall bib and ear flower distinguish Hana from the round helper and smaller schoolkid.

### B — Momo, the shy baker's helper
Idea: A soft, round helper whose cream apron and low beret form a simple, friendly silhouette.

Proportions: 1.05 m; 2.4 heads tall, approximately 0.438 m per head unit. Widest barrel belly and hips, fullest cheeks and smaller round ears.

Outfit: Lilac short-sleeved shirt, butter-cream apron with broad bands and one large lilac pocket, plus a matching flattened beret. Keep the apron fastening solid and simple, without thin ties. Bare dark paws.

Main volumes: Broad rounded squircle head; shallow oval muzzle; short broad eye patches; barrel torso; squat capsule limbs; wide flattened feet. The apron is a thick curved rounded rectangle following the belly. The beret is one soft flattened dome above a short rounded band.

Palette:

| Part | Hex |
| --- | --- |
| White fur | #FBF8F4 |
| Eye patches, ears, limbs | #302B2A |
| Irises | #795037 |
| Nose and pupils | #1D1918 |
| Shirt and apron pocket | #BAA6CE |
| Apron and beret | #F2E3BD |
| Blush | #E8A18D |

Difference: Momo has the broadest build and a large pale apron block; the low beret separates the silhouette from Hana's flower and Sora's bare head.

## Shared notes from the sheet
### Shared modelling guidance
The white fur remains #FBF8F4 throughout. Variation stays within subtle warm, green and cool near-black tones rather than adding non-panda fur colours. Use warm-white sclera, dark pupils, two catchlights and a heavy upper lid; keep the eyes visibly above the muzzle. Marking boundaries should be crisp. Use a small white rounded tail where visible. Keep garment thickness and straps substantial enough to read from the elevated game camera. No individual fur strands, thin strings, fragile flower stems or handheld props.

The sheet is an image-generated concept blueprint, not a measured technical drawing. Hex values here are the authoritative material targets; painted lighting can shift the apparent pixel colours.

## Done when
As in the shared brief, for every design:
- within about 5% of your measured targets;
- appealing in `portrait.png`;
- the outfit and accessories reading well in `game-45.png` from both 45 deg yaws;
- <= 22k triangles, one atlas, `joints-<x>.json`.
End your reply with one report covering every design (the shared brief's report, per design), then stop.

## Closest finished references
`D:/projects/chewy-life-3d/tools/blender/codex/assets/`: yk-hokuto-toy, tk-sasa-toy, pan-toy. Their build scripts, READMEs and `direction/` show the technique and what the director checks.
