# Asset brief: folk-bear-toy (Z-D6 "Blender everything": the Blender townsfolk bears, phase 1: the models)

Read `../villager-toy-common.md` first: the shared technical rules, the lessons and the process rules. **Differences from
it**:
- These are **townsfolk**, not named villagers: ordinary bears who move into Blossom Hollow as it grows (and stand in
  the zone villages, the Guild hires and the dungeon NPCs). The game draws them at random from the set of Blender
  townsfolk, so many may be on screen at once: keep each one **<= 22k triangles** (not 30k), one 2048 atlas each.
- You build **2 characters**, one GLB each, in this task:
  - design **A**: game id `folk_bear_a`, `public/models/folk-bear-a-toy.glb`
  - design **B**: game id `folk_bear_b`, `public/models/folk-bear-b-toy.glb`
- The sheet `refs/sheet.png` (Codex, 2026-11-04) has three designs in rows A, B, C; **the owner picked A and B**. It is
  the blueprint: don't redesign, just build them beautifully. `refs/notes.md` is Codex's own notes for the sheet (palette,
  outfit, volumes, left/right consistency): the sections for your designs are copied below.
- Build the designs as **one family**: one deterministic `build_folk-bear-toy.py --design <a|b|c>|all` with a shared
  species base (head, face, eyes, hands, feet, tail) and per-design proportions, markings and outfits. Model
  **design A fully first** (measured, compared, checked at the game camera), then the others from the same base.
- Measure each design on its own row of the sheet (`measure-<x>.md`). Write `joints-<x>.json` per design.
- Outputs: `D:/projects/chewy-life-3d/public/models/folk-bear-<x>-toy.glb`; previews in `preview/<x>/` (the shared
  brief's list: `portrait.png`, `game-45.png` from both yaws, `cmp-head.png`, `cmp-body.png`, ...), plus
  `preview/family.png`: all your designs side by side at the game camera, same scale.

## The owner's picks (from `refs/notes.md`)
### A — Hana, the gardener
Idea: a sunny honey bear with a practical pear-shaped silhouette, sage overalls and an apricot ear flower.

Proportions: 1.05 m tall; head : total height approximately 1 : 2.4; head : body below head approximately 1 : 1.4. Medium build with broad hips.

Outfit: ivory short-sleeve shirt, sage short overalls with thick shoulder bands, two large buttons and a broad bib pocket. One rounded five-petal flower at the anatomical left ear. Bare paws.

Main volumes: softened squircle head; flattened spheres for ears and muzzle; pear-shaped torso; tapered capsule arms; mitten-shaped hands; short pill-shaped legs and flattened oval feet. Overalls are a simple rounded shell with thick bands; pocket is a shallow rounded box; flower petals are five flattened ovals around a rounded centre.

Palette:

| Part | Hex |
| --- | --- |
| Honey fur | #D8A878 |
| Muzzle / inner ears | #F0D1A5 |
| Irises | #4B2C20 |
| Nose / pupils / brows / mouth | #2D1B16 |
| Eye whites | #FFF8EF |
| Catchlights | #FFFFFF |
| Blush | #EAA095 |
| Ivory shirt | #FFF1D8 |
| Sage overalls | #8EAE7B |
| Green accents | #658B58 |
| Apricot flower | #E8A16A |

Distinctive read: honey fur, broad hips, green workwear and a single ear flower; more active and practical than the other two.

### B — Mugi, the storyteller
Idea: a calm dark-brown elder with the roundest build, a lilac wrap jacket and a mustard beret.

Proportions: 1.05 m tall excluding beret; head : total height approximately 1 : 2.4; head : body below head approximately 1 : 1.4. Widest barrel belly and thick short legs. Relaxed upper eyelids suggest age without adding fragile facial details.

Outfit: short-sleeve lilac crossover kimono jacket, broad sky-blue obi band, dark slate cropped balloon trousers and a softly tilted mustard beret. Bare paws. No loose ties.

Main volumes: broad softened squircle head; small round ears; short flattened muzzle; oval barrel torso; thick capsule arms and legs; mitten hands and broad oval feet. Jacket is a rounded wrap shell with one diagonal overlap; obi is a thick rounded band. Trouser legs are two short inflated rounded volumes. Beret is a squashed sphere over a thick band.

Palette:

| Part | Hex |
| --- | --- |
| Dark-brown fur | #6A4A3A |
| Muzzle / inner ears | #E8C49A |
| Irises | #4B2C20 |
| Nose / pupils / brows / mouth | #2D1B16 |
| Eye whites | #FFF8EF |
| Catchlights | #FFFFFF |
| Blush | #EAA095 |
| Lilac jacket | #B4A0C8 |
| Sky-blue obi | #9FC6CE |
| Slate trousers | #4D5365 |
| Mustard beret | #D9B96D |

Distinctive read: darkest fur, widest body, relaxed eyes and horizontal waist band; the quiet, settled elder of the group.

## Shared notes from the sheet
### Shared modelling guidance
Use crisp material boundaries for muzzle, inner ears, blush and clothing. Eyes sit above the short muzzle, with warm-white sclera, brown irises toward the nose, large pupils, two catchlights and thick upper lids. Keep fur smooth. Each bear has a small round tail low at the centre of the back. Preserve consistent accessory placement using anatomical left/right, rather than screen left/right.

The six large front / three-quarter figures use a common presentation scale and ground line; C is shorter. Side and back views are reduced supporting views and should be rescaled using the stated heights before tracing. All views describe neutral A-poses. The sheet is concept guidance rather than dimensioned orthographic CAD.

## Done when
As in the shared brief, for every design:
- within about 5% of your measured targets;
- appealing in `portrait.png`;
- the outfit and accessories reading well in `game-45.png` from both 45 deg yaws;
- <= 22k triangles, one atlas, `joints-<x>.json`.
End your reply with one report covering every design (the shared brief's report, per design), then stop.

## Closest finished references
`D:/projects/chewy-life-3d/tools/blender/codex/assets/`: tk-takumi-toy, kuma-toy. Their build scripts, READMEs and `direction/` show the technique and what the director checks.
