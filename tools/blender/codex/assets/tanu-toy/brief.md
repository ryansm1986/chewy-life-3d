# Asset brief: tanu-toy (the Toybox Tanu, phase 1: the model)

Read `../villager-toy-common.md` first: the shared technical rules, the lessons and the process rules.

## Who
**Tanu**, Blossom Hollow's trinket merchant: "a cheeky merchant; swears the leaf hat is for fashion". Sly but warm, a
twinkle in the eye. He runs Tanu's Trinkets (a stall). The blueprint is `refs/sheet.png` ("A · TANU — LEAF MERCHANT"),
approved by the owner. Note: the game also has an enemy "Tanuki Bandit" (`tools/blender/work/codex/tanuki-toy/`) built
by another builder. Tanu is a different character: friendly, no bandit mask cloth, no weapon. You may read that build
for technique but don't reuse its look.

## Must keep (from the sheet)
- **Fur** #A08070; **cream** #F0E0D0 on the muzzle, the cheeks under the mask and a big belly oval; **mask and limbs**
  #4A3A34: the raccoon mask band across the eyes (soft rounded shape, wider at the outer ends), the arms from the
  elbow, the legs from the knee, and the ear backs.
- **The head** is wide and soft-domed (about 1.2 : 1), with round ears (dark outer, pink inner #D99089 inside the rim).
- **Face**: big amber eyes (iris #C88A38) with the lash line and wing, sitting inside the mask; soft brows; a cream
  muzzle with a dark nose #302622 and a sly small smile; blush #D99089.
- **The leaf** #55944A on top of the head: a big smooth leaf with a centre vein and a little curled stem, lying across
  the crown, tilted a little forward. Thick (not a card), and check it from 45° above: it must read as a leaf, not a
  green plate.
- **A satchel** #C8A060 on a strap over his right shoulder to his left hip (a thick strap, a soft box bag with a flap),
  and a **tied pouch** #A87843 at his right hip.
- **Tail**: a big striped raccoon-dog tail (#A08070 and #4A3A34 bands, 4–5 rings), thick and round, curving out behind
  (a separate piece with bend loops).
- **Body**: round with a full belly, mitten paws, rounded dark feet with toe lines.

## The director's rough measurements (cross-check yours, Step 0)
On the head FRONT close-up (W = head width at the cheeks, ears excluded):
- head height (crown to chin, the leaf excluded) about 0.78 W;
- eyes: centres at x = ±0.21 W, about 0.40 W above the chin; opening about 0.22 W wide × 0.25 W tall;
- mask band about 0.95 W wide at the outer ends, about 0.30 W tall at the eyes;
- muzzle: a cream oval about 0.36 W wide × 0.24 W tall; nose about 0.09 W wide;
- ears about 0.28 W across, at x = ±0.40 W on the crown's corners;
- the leaf about 0.75 W long.
- Total height 1.08 m.

## Done when
As in the shared brief: within about 5% of your measured targets, appealing in `portrait.png`, the leaf, the mask and
the tail reading well in `game.png` from both 45° yaws, ≤ 30k triangles, one atlas, `joints.json`.
