# Asset brief: usagi-toy (the Toybox Usagi, phase 1: the model)

Read `../villager-toy-common.md` first: the shared technical rules, the lessons and the process rules.

## Who
**Usagi**, Blossom Hollow's gardener: "a bouncy gardener who knows every flower by name". A small, cheerful white bunny
who runs the Seed Stall. The blueprint is `refs/sheet.png` ("A · BLOSSOM BOUNCE"), approved by the owner.

## Must keep (from the sheet)
- **Fur** #FFFFFF, muzzle #FFF8F4 (barely different: keep the face clean and white); **inner ears** #FFC0D0.
  White fur must still read in the game's light: give it the soft warm-grey shading the sheet has, so the head isn't a
  flat white blob.
- **Face**: big warm-brown eyes (iris #7A4424) with the lash line and wing; soft brows; a tiny pink nose #E88DA4; a small
  "w" smile; blush #F3A1AC.
- **Ears**: two tall upright bunny ears through the hat, slightly splayed outward, thick and rounded (about 0.3 W wide),
  with the pink insides as a recessed rounded panel. They must stay thick from the 45° camera.
- **Petal sun hat** #FFB0D0: a soft dome with a brim of 6 big rounded petals, tilted a little back, its lower edge well
  above the eyes. Check it from 45° above: it should read as a flower hat, not a flat plate.
- **Shirt** #FFF0A8 with puffy short sleeves.
- **Overalls** #8FD0FF with straps and buttons #5A8AD8, a front bib pocket with a **trowel** standing in it (handle
  #B88659, blade #A6B6BF; a thick, simple prop), short legs ending above the feet.
- **A round cotton tail** #FFFFFF on the back of the overalls.
- **Body**: small and round, mitten paws, big rounded bunny feet with toe lines.

## The director's rough measurements (cross-check yours, Step 0)
On HEAD FRONT (W = head width at the cheeks, ears and brim excluded):
- eyes: centres at x = ±0.21 W, about 0.36 W above the chin; opening about 0.22 W wide × 0.25 W tall;
- nose about 0.06 W wide, just under the eyes' bottom line; mouth about 0.12 W wide;
- blush about 0.13 × 0.08 W at x = ±0.33 W, level with the mouth;
- hat brim about 1.3 W wide; ears about 0.30 W wide and rising about 0.65 W above the hat top.
- Total height 1.10 m including the ears.

## Done when
As in the shared brief: within about 5% of your measured targets, appealing in `portrait.png`, the hat and the ears
reading well in `game.png` from both 45° yaws, ≤ 30k triangles, one atlas, `joints.json`.
