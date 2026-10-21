# Model brief: kamaitachi (enemy series EN-1, Whispering Bamboo Grove)

Follow `tools/blender/work/codex/enemy-model-contract.md` exactly. The owner picked **Option A "Wind Ronin"**:
`refs/sheet.png`. Build that design. `refs/current-kamaitachi-in-game.png` is today's procedural model (size and
read only; the sheet wins). `refs/heroes-in-game.png` shows the heroes it fights.

## What it is
The fast melee enemy of the first region: a cocky little sickle weasel on all fours. It darts around, **rears up**
(the whole body tilts nose-up about its ground origin, sickles high) and **dashes** through you (the body stretches
1.3× long), its big brush tail whipping behind.

## Size and proportions (m)
- **0.75 m** to the top of the ears on all fours; **body length about 0.95 m** from the nose to the rump (−Y is the
  nose: the head is at about y = −0.38, the rump at y = +0.5); the **tail** rises behind to about **1.0 m** high.
- **Head**: big and round, about 0.36 m wide, 0.32 m tall, centred about 0.52 m up; round ears (#e0a45c, pink insides
  #e89191) on top; a cream muzzle and cheeks (#fff4e2) with a small dark nose (#2f2834) and a "w" mouth; angry brows;
  big toy eyes (iris warm brown #a66c32 with a dark top, two catchlights, a thick lash line); blush (#e89191). Match
  the sheet's face close-up.
- **Body**: a long low weasel body (#e0a45c, cream belly #fff4e2) about 0.3 m tall, 0.28 m wide; four short legs with
  **dark-brown paws** (#8a5a34). The forelegs carry **cloth wraps** (#fff4e2 bands) and the **crescent sickles**
  (#d6e2f0, a lighter #f2f6fb edge, ≥ 3 cm thick, rounded tips, toy-like), each held on a short wooden grip (#8a5a34),
  curving out and forward beside the front paws as on the sheet.
- **Scarf**: a green (#5ab87a) wrap round the neck with **two long tails** flowing back and up over the body (they're
  part of `body`: sculpt them as a frozen wind flutter, ≥ 3 cm thick, ending above the hips).
- **Tail**: a big S-curved tail from the rump: an orange base (#e0a45c, cream underside) rising behind, ending in a
  large **dark-brown brush tip (#8a5a34) of 3–4 big rounded tufts**, as on the sheet. About 0.75 m long along its curve,
  0.22 m thick at the widest. It's the silhouette from above: keep it bold.

## Parts
| name | what | pivot (origin) | how the game moves it |
|---|---|---|---|
| `body` | head, body, legs, sickles, scarf | (0, 0, 0) | tilts nose-up −0.5 rad (the rear-up, about the ground origin), stretches to 1.32× along Y and 0.86× in Z for the dash, bobs and rolls ±0.06 rad at a run |
| `tail` | the whole tail | the **tail root** at the rump: about (0, +0.45, 0.3) | swishes ±0.35 rad about Z, lifts up to +1.0 rad (pitch up), shakes fast during the wind-up. The root must stay buried in the rump at those angles (no gap) |

## Variants (same shape)
1. `kamaitachi.glb` (base): fur #e0a45c, belly #fff4e2, paws and tail tip #8a5a34, scarf #5ab87a, blades #d6e2f0.
2. `kamaitachi_yuki.glb` ("Yuki", snow weasel): fur #f2f0ec, belly #ffffff, paws and tail tip #2e2834, scarf #6aa8e8,
   blades #d0e8ff.
3. `kamaitachi_storm.glb` ("Storm"): fur #8c7aa6, belly #ece4f6, paws and tail tip #3a2a4a, scarf #e8503a, blades
   #ffd870, plus a **third crescent blade** on the tail tip with a small lightning-bolt notch (on the `tail` part).

## Budget
≤ 5,000 triangles for `body` + `tail`, per variant.

## Done when
- The front, 3/4, side and back match the sheet (the long low body, the big head, the scarf tails, the big brush
  tail), measured with compare.py.
- From the 45° game camera it reads as a speedy weasel with sickles and a big tail; the face and both sickles are
  visible from above.
- The rear-up (−0.5 rad), the dash stretch and the tail angles open no gaps.
- Three variant GLBs, ≤ 5k tris each, front −Y, paws on z = 0.
