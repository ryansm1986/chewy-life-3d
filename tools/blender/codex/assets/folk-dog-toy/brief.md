# Asset brief: folk-dog-toy (Z-D6 "Blender everything": the Blender townsfolk dogs, phase 1: the models)

Read `../villager-toy-common.md` first: the shared technical rules, the lessons and the process rules. **Differences from
it**:
- These are **townsfolk**, not named villagers: ordinary dogs who move into Blossom Hollow as it grows (and stand in
  the zone villages, the Guild hires and the dungeon NPCs). The game draws them at random from the set of Blender
  townsfolk, so many may be on screen at once: keep each one **<= 22k triangles** (not 30k), one 2048 atlas each.
- You build **2 characters**, one GLB each, in this task:
  - design **A**: game id `folk_dog_a`, `public/models/folk-dog-a-toy.glb`
  - design **C**: game id `folk_dog_c`, `public/models/folk-dog-c-toy.glb`
- The sheet `refs/sheet.png` (Codex, 2026-11-04) has three designs in rows A, B, C; **the owner picked A and C**. It is
  the blueprint: don't redesign, just build them beautifully. `refs/notes.md` is Codex's own notes for the sheet (palette,
  outfit, volumes, left/right consistency): the sections for your designs are copied below.
- Build the designs as **one family**: one deterministic `build_folk-dog-toy.py --design <a|b|c>|all` with a shared
  species base (head, face, eyes, hands, feet, tail) and per-design proportions, markings and outfits. Model
  **design A fully first** (measured, compared, checked at the game camera), then the others from the same base.
- Measure each design on its own row of the sheet (`measure-<x>.md`). Write `joints-<x>.json` per design.
- Outputs: `D:/projects/chewy-life-3d/public/models/folk-dog-<x>-toy.glb`; previews in `preview/<x>/` (the shared
  brief's list: `portrait.png`, `game-45.png` from both yaws, `cmp-head.png`, `cmp-body.png`, ...), plus
  `preview/family.png`: all your designs side by side at the game camera, same scale.

## The owner's picks (from `refs/notes.md`)
### A — Mugi, the patient gardener
**Idea:** A dependable tan floppy-eared neighbour whose sage overalls and leaf make a simple garden silhouette.

**Proportions:** 1.05 m crown-to-sole; approximately 2.4 heads tall (head : remaining body height = 1 : 1.4). Skull height about 0.44 m. Medium pear-shaped torso, broader than C and narrower than B.

**Outfit:** Sage short-leg bib overalls with two broad rounded shoulder bands, two cream buttons and one large rounded front pocket. One green leaf beside the character's left ear. No shirt or footwear.

**Simple volumes:** Wide softened box for skull; two tapered drooping oval capsules for ears; flattened oval muzzle pad with shallow paired cheek lobes; pear torso; short tapered arm capsules and mitten hands; fused rounded shorts/bib shell; squat foot ovals. Tail is a thick upward bean with a cream tip. Leaf is one thick flattened oval, with at most a shallow central groove.

**Palette:** Fur `#E8C89A`; ears `#9A6A4A`; muzzle / chin / tail tip / buttons `#FFF4EA`; eyes `#8B582B`; nose / brows / pupils / mouth `#3A3036`; overalls `#8DAA78`; leaf `#6F8C58`; blush `#E9A095`.

**Distinctive read:** Medium build, long brown ears, green bib and a single leaf. The large front pocket distinguishes the front from the plain overall back. Keep both overall straps wide in every view.

### C — Sora, the curious schoolkid
**Idea:** An earnest black-and-tan youngster with upright ears, cheerful yellow-and-blue clothes and one chunky school satchel.

**Proportions:** 0.96 m crown-to-sole, excluding upright ear tips; approximately 2.4 heads tall (head : remaining body height = 1 : 1.4). Skull height about 0.40 m. Smallest and most compact torso, with a narrower waist than A or B. Do not slim the limbs into thin rods.

**Outfit:** Butter-yellow short-sleeved shirt, desaturated blue shorts and one terracotta satchel at the character's left hip. The thick crossbody band runs from the character's right shoulder to left hip. No hat or footwear.

**Simple volumes:** Rounded skull box with broad cheek corners; two thick rounded triangular ears; paired short muzzle lobes over a rounded chin; compact oval torso; rounded sleeve cones; capsule forearms and mitten paws; two soft shorts lobes; broad tan foot ovals. Satchel is a rounded rectangular box with a simple rounded flap and a broad padded band. Tail is one thick short upward hook with a tan tip.

**Palette:** Main fur `#3A3036`; eyebrow spots / ear interiors / muzzle cheeks / hands / feet / tail tip `#E8C89A`; central chin `#FFF4EA`; eyes `#A86C32`; nose / pupils / mouth `#282126`; shirt `#EBCB77`; shorts `#88AFC5`; satchel / band `#C88268`; blush `#E9A095`.

**Distinctive read:** Upright ears, dark head, pale eyebrow spots, yellow shirt, blue shorts and a single side bag. Preserve the bag's anatomical left side when rotating: viewer-right in front and viewer-left in back. Keep the tail small, thick and canine rather than a large fox plume.

## Shared notes from the sheet
### Shared modelling guidance and review
- Use simple rounded meshes with crisp painted material borders. Shading does not introduce extra palette colours.
- Eyes have warm-white sclera (`#FFF4EA`), large dark pupils and two white catchlights (`#FFFFFF`). Preserve the thick upper lid, small wing, soft brow, blush and gentle closed smile.
- Keep muzzles low and short; avoid lengthening them into realistic dog snouts. Keep the wide cheeks and rounded mitten anatomy at game distance.
- Check the four body views together when fitting meshes. Keep ear length, outfit hems, markings, accessory side and tail attachment consistent. Minor perspective foreshortening in three-quarter views is not a change in model dimensions.
- Extra expression thumbnails were omitted to preserve space for all required turnarounds and both head angles. The sheet contains only the requested title, A/B/C labels and labelled hex swatches.
- Generated with the built-in image_gen tool. The exact generation prompt is saved in `generation-prompt.md`. Original output remains at `C:/Users/there/.codex/generated_images/01a1a6e2-6819-7912-8cef-b5c47439e21e/exec-26eb117f-181b-4f62-89bf-9170c3c52a33.png`; `option-A.png` is a verified identical copy.

## Done when
As in the shared brief, for every design:
- within about 5% of your measured targets;
- appealing in `portrait.png`;
- the outfit and accessories reading well in `game-45.png` from both 45 deg yaws;
- <= 22k triangles, one atlas, `joints-<x>.json`.
End your reply with one report covering every design (the shared brief's report, per design), then stop.

## Closest finished references
`D:/projects/chewy-life-3d/tools/blender/codex/assets/`: ak-tobi-toy (a floppy-eared dog), sk-kaizo-toy (a grey dog), shadow-toy and moka-toy (the hero dogs). Their build scripts, READMEs and `direction/` show the technique and what the director checks.
