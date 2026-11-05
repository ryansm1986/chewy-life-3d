# Asset brief: folk-cat-toy (Z-D6 "Blender everything": the Blender townsfolk cats, phase 1: the models)

Read `../villager-toy-common.md` first: the shared technical rules, the lessons and the process rules. **Differences from
it**:
- These are **townsfolk**, not named villagers: ordinary cats who move into Blossom Hollow as it grows (and stand in
  the zone villages, the Guild hires and the dungeon NPCs). The game draws them at random from the set of Blender
  townsfolk, so many may be on screen at once: keep each one **<= 22k triangles** (not 30k), one 2048 atlas each.
- You build **2 characters**, one GLB each, in this task:
  - design **A**: game id `folk_cat_a`, `public/models/folk-cat-a-toy.glb`
  - design **B**: game id `folk_cat_b`, `public/models/folk-cat-b-toy.glb`
- The sheet `refs/sheet.png` (Codex, 2026-11-04) has three designs in rows A, B, C; **the owner picked A and B**. It is
  the blueprint: don't redesign, just build them beautifully. `refs/notes.md` is Codex's own notes for the sheet (palette,
  outfit, volumes, left/right consistency): the sections for your designs are copied below.
- Build the designs as **one family**: one deterministic `build_folk-cat-toy.py --design <a|b|c>|all` with a shared
  species base (head, face, eyes, hands, feet, tail) and per-design proportions, markings and outfits. Model
  **design A fully first** (measured, compared, checked at the game camera), then the others from the same base.
- Measure each design on its own row of the sheet (`measure-<x>.md`). Write `joints-<x>.json` per design.
- Outputs: `D:/projects/chewy-life-3d/public/models/folk-cat-<x>-toy.glb`; previews in `preview/<x>/` (the shared
  brief's list: `portrait.png`, `game-45.png` from both yaws, `cmp-head.png`, `cmp-body.png`, ...), plus
  `preview/family.png`: all your designs side by side at the game camera, same scale.

## The owner's picks (from `refs/notes.md`)
### A — Momo, the patient gardener
Idea: a cream cat with one peach eye patch and practical sage overalls, always ready to tend the village seedlings.

- Proportions: approximately 1.05 m including ears; approximately 2.4 heads excluding ears. The most upright and comparatively narrow body, while retaining the same chunky toy anatomy.
- Outfit: butter-yellow short-sleeved shirt under sage short-legged bib overalls. Two broad shoulder bands and two large cream buttons; no buckles, tiny stitching or extra equipment.
- Palette: fur #FFF4EA; peach marking / inner ears #FFD8A8; hazel eyes #8A633D; nose #B77F79; overalls #9DBA8C; shirt #F6D98B; blush #EFA7A0.
- Main volumes: squircle head; two rounded triangular ear wedges with shallow inset inner ears; tiny paired muzzle lobes; compact upright bean torso; short sleeve cylinders; tapered capsule arms and mitten ends; two short rounded overall legs; flattened oval paws; one thick curved cream tail.
- Consistency: peach patch covers the character's LEFT eye and ear (viewer right in front), extending around that side of the skull. Back view consequently shows the patch on viewer left. Overall bands continue over the shoulders onto the back bib.
- Difference: pale asymmetric face, upright silhouette, and clearly readable workwear separate Momo from the round ginger helper and smaller grey child.

### B — Kinako, the cheerful baker's helper
Idea: a plump ginger cat in a butter-yellow wrap top, with a teal sash and a soft blue work bandana.

- Proportions: approximately 1.05 m including ears; approximately 2.4 heads excluding ears. Widest pear-shaped body and fullest cheeks of the three.
- Outfit: short-sleeved crossover work top, one thick teal sash, and a blue bandana band beneath the ears with one rounded rear knot and two short broad tabs. Bare ginger legs and feet.
- Palette: ginger fur #F4A860; muzzle / tail tip #FFF4EA; inner ears #FFD8A8; amber eyes #B97530; nose #B77F79; top #F6D98B; sash #78AAA3; bandana #AFD0D8; blush #EFA7A0.
- Main volumes: broad squircle head; soft ear wedges; shallow cream muzzle; pear-shaped torso; two simple overlapping rounded chest panels; wide belt ring; short sleeve cylinders; capsule arms with mitten paws; very short legs and oval feet; thick hooked tail with a cream terminal segment.
- Consistency: the diagonal chest overlap ends under the sash; sash is continuous across the back. Bandana leaves the crown exposed and has its knot at the rear. Keep its tabs chunky and close to the head. Tail-tip colour wraps around the entire tip.
- Difference: broad warm silhouette, wrap-top colour block and horizontal headband establish a sociable kitchen helper without repeating Kuma's chef hat and apron.

## Shared notes from the sheet
### Shared toy-line construction
Aim for approximately 2.4 head heights from floor to skull crown, excluding ears; body below the head is approximately 1.4 head heights. Heights below include ears and are world-scale targets, not measurements printed on the sheet. Keep the head a broad rounded squircle, muzzle shallow, hands mitten-shaped, feet broad and softly flattened, and all tails thick with rounded tips. Use matte surfaces, crisp marking borders, soft brows, dark oval pupils, warm-white sclera and a gentle closed smile.

Shared additional face material targets: pupil / lash / mouth #2D1B16; eye white / catchlight #FFF8EF. These supplementary values are specified here rather than adding more small swatches to the crowded sheet. Treat listed hex values as base-colour targets; painted shading in the artwork changes sampled pixel colours.

### Scope and modelling notes
The requested ONE shared sheet has all three cats, four full-body views each, front head close-ups, A/B/C labels and hex swatches. The specific three-cat brief requests front-only head close-ups; separate three-quarter head enlargements and optional expression rows were omitted to keep the sheet readable. No props, fine whiskers, fur strands or loose strings were added.

The image is an illustrative modelling guide rather than an orthographic CAD drawing: use the stated proportions and anatomical left/right notes to resolve small perspective and foreshortening differences. File generation and revision prompts are recorded in generation-prompts.md.

## Done when
As in the shared brief, for every design:
- within about 5% of your measured targets;
- appealing in `portrait.png`;
- the outfit and accessories reading well in `game-45.png` from both 45 deg yaws;
- <= 22k triangles, one atlas, `joints-<x>.json`.
End your reply with one report covering every design (the shared brief's report, per design), then stop.

## Closest finished references
`D:/projects/chewy-life-3d/tools/blender/codex/assets/`: tk-kome-toy (a calico cat), mochi-toy. Their build scripts, READMEs and `direction/` show the technique and what the director checks.
