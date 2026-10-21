# Model brief: akaname (enemy series EN-1, Onsen Caverns)

Follow `D:/projects/chewy-life-3d/.claude/skills/codex-blender/templates/enemy-model-contract.md` exactly, plus the **tongue note**. The pick is
**Option A "Bathhouse Imp"**: `refs/sheet.png`. Build that design. `refs/current-akaname-in-game.png` is today's procedural model
(size and read only). `refs/approved-bamboo-trio-in-game.jpg` and `refs/approved-tidepool-trio-in-game.jpg` show approved
Blender enemies of earlier regions in the game (the AFTER half): match their finish.

## Tongue note
The game **stretches the tongue along its length** to lash it out up to 6.5 m: it scales the `tongue` object along its
forward axis (−Y in Blender) by up to ~38×, and droops it about X. So build the tongue as a **simple, evenly segmented
pink tube or ribbon pointing straight forward (−Y)** from its pivot in the mouth, **0.17 m long at rest**, with a rounded
tip; any detail along it would smear when stretched. The lolling-out look of the sheet comes from the game drooping it.

## What it is
The grabber of the dungeon under Yukimi Onsen (packs of 2–4): a chubby bath-licking imp. It squats and lashes its tongue
out along a lane to yank you in, pants with its tongue hanging out, and up close puffs up and bursts in a cloud of
steam. The game scales it ×1.15.

## Size (Blender units = m; at ×1.15 in the game)
- About **0.87 m** tall to the top of the towel; follow the sheet: skin #e8463e / light #ff7a64, belly #ffb49a, the black
  hair #24182a, the two nub horns, the white tenugui #fbf8f2 with the blue stripe #3a6ec0, the huge eyes, the wide grin,
  blush #ffb0b8, stubby clawed feet (round claws), the tawashi brush (#b57a45) in one fist.

## Parts
| name | what | pivot (origin) | how the game moves it |
|---|---|---|---|
| `body` | head, hair, horns, towel, face, belly, feet | (0, 0, 0) | squash ±16 %, lean ±0.22 |
| `tongue` | the tongue (see the note) | in the mouth, at the tongue's root | stretched along −Y up to ~38×, drooped about X up to 0.95 (hanging down), turned ±0.25 |
| `armL` | the +X arm (holding the tawashi) | the +X shoulder, about (+0.22, −0.03, 0.34) | about X from +0.5 to **−1.6** (up), splays out up to 1.2 rad about the forward axis |
| `armR` | the −X arm | about (−0.22, −0.03, 0.34) | the mirror |

## Variants
1. `akaname.glb` (base): as above.
2. `akaname_yuzu.glb` ("Yuzu"): skin #f05a32 / #ff8e5a, belly #ffc49a, hair #2a1a1e, a blue towel #5a8ad8 with a white stripe,
   blush #ffc0a0, a little yuzu fruit (#f2b62a, a green leaf) on its towel.
3. `akaname_elder.glb` ("Elder"): skin #b42a3a / #dc4c56, belly #f08e8a, grey hair #a8a4ae, white bushy brows and beard,
   a red-striped (#c83a3a) white hachimaki headband instead of the folded towel.

Rotation signs are Blender's with the creature facing −Y: about X, negative = a part's lower end swings forward and up.
Check every motion above with a parts render (no gaps at the joints, nothing passing through the body).

## Budget
≤ 5,000 triangles for all parts, per variant.

## Done when
- Matches the sheet's front, 3/4, side and back (measured); the face reads at 45° from 16 m.
- 3 GLBs, ≤ 5k tris each, front −Y, feet on z = 0, the same parts and pivots in every variant.
