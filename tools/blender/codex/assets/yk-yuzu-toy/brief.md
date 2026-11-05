# Asset brief: yk-yuzu-toy (VL-2: the Blender Yuzu, phase 1: the model)

Read `../villager-toy-common.md` first (the shared rules, lessons and process), then this. **Differences from it**:
- This is a **zone villager** (Yukimi Spa Village, a snowy hot-spring village of thatched roofs, steam and lanterns on the snow).
- `refs/sheet.png` was drawn for this task and approved by the director (the owner delegated the pick). It is the
  blueprint: don't redesign, build it beautifully.
- `refs/current-*-portrait.png` (where present) is the procedural kit version: identity only.

## Who
**Yuzu**, a tanuki (raccoon dog), the bathkeeper. Keeps the baths at exactly the right temperature: "a little too hot".

## Must keep (from the sheet; the data's colours, which the sheet's swatches should match)
- **Look**: fur #b08a70; a lighter muzzle and belly #f6e6d6; markings or patches #4a3a34; ears #4a3a34 with inner #d9908a; nose #302622; eyes #c8a040; blush #f0a090; big and chubby.
- **Outfit**: a kimono top #f0c040; a skirt or trousers #a85a2a; a sash or obi #ffffff; a thick headband #ffffff.
Where the sheet and these words disagree, follow the sheet's front view and say so in your report.

## Sizes
- Total height: the sheet's note (about 1.05 m, chubby). Measure everything else on the sheet in Step 0 (`measure.md`, fractions of the
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
