# Asset brief: sk-shinju-toy (VL-2: the Blender Okami Shinju, phase 1: the model)

Read `../villager-toy-common.md` first (the shared rules, lessons and process), then this. **Differences from it**:
- This is a **zone villager** (Shiokaze Port, a little fishing port of salt-silvered boards, glass floats and stilted inns by the sea).
- `refs/sheet.png` was drawn for this task and approved by the director (the owner delegated the pick). It is the
  blueprint: don't redesign, build it beautifully.
- `refs/current-*-portrait.png` (where present) is the procedural kit version: identity only.

## Who
**Okami Shinju**, a duck, the innkeeper. Her inn sways a little on its stilts. Guests say it rocks them to sleep.

## Must keep (from the sheet; the data's colours, which the sheet's swatches should match)
- **Look**: fur #fff8ec; a lighter muzzle and belly #ffffff; eyes #3a2a20; blush #f5b0a0.
- **Outfit**: a kimono top #3a7ab0; a skirt or trousers #2a3a5a; a sash or obi #ffd24a; an apron #fff8ee.
Where the sheet and these words disagree, follow the sheet's front view and say so in your report.

## Sizes
- Total height: the sheet's note (about 1.05 m). Measure everything else on the sheet in Step 0 (`measure.md`, fractions of the
  head width W).

## Lessons from the Takemori villagers (each cost a round)
- **Build the upper lash line as its own object** (`<Name>_lash_L/R`): a thick tapered roll with the wing, lying on the
  skin where the lash goes. Don't paint any lash, eyeline or eye outline onto the head skin (a faint contact shade at
  most). The rig weights it to the lid.
- **Ears are solid volumes** that read thick from both 45° game yaws and from the side: no cupped shells, no thin cards,
  no ears turned so far out that one camera sees them edge-on (about 12-20° outward is right).
- Hats, bands and headbands: ears rise from behind them (pull ear points under the band's outer face), so the band's top
  edge stays one clean line.
- Dark cloth goes near-black in the game's grade: paint dark navies, greens, browns and plums a little lighter.
- Painted features (the muzzle, patches) need soft 2-3 mm borders. The crown's shading is value-only (no hue shift).
- Straps and cords are thick rounded bands, never thin lines. Props readable from 20 m (at least 4 cm across).

## Done when
As in the shared brief:
- within about 5% of your measured targets;
- appealing in `portrait.png`;
- the outfit reading well in `game.png` from both 45° yaws;
- ≤ 30k triangles, one atlas, `joints.json`.
