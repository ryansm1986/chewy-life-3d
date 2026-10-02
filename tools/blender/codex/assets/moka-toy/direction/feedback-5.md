# Rig review: installed in the game, one round of face fixes

Your rig is in the game, and the test page and the hero loader now use `moka_toy`. **Approved and locked**:
- the skeleton, pivots and staff grip;
- the body, robe, satchel, stole, tail and ear weights (walk, run and casting are clean);
- the mouth (talk and the open smile read well).

On the game side I grade her fur (the warm light turned it maroon), so **don't change any colours**. The ear–arm contacts in arms
out, wave and happy hop are the game's arm values meeting her long ears; I'll handle them in the game, so leave them.

My in-game frames are in `D:/projects/chewy-life-3d/tools/blender/work/codex/moka-face/`: `face.png` (rest, talk, blink, happy) and
`grades.png`.

## 1. Face shading: a finer face mesh (the budget is raised for it)
- The blotchy, wavy light/shade edge on the cheeks, jaw and forehead in `toon-check.png` also shows in the game.
- **The budget is now ≤ 38k triangles.** Spend the extra on **adaptive face triangulation**, as Rosie's rig did (her
  `build_rosie-opus.py` in rig mode): add points where the interpolated normal would move the toon band (the band displacement), and
  keep the surface itself unchanged.
- **Targets**, as on Rosie, measured the same way and reported: band displacement p90 ≤ 1.5 mm and p99 ≤ 3 mm over the visible
  face.
- Re-render `toon-check.png`. The light/shade edge must be a smooth curve on the face, ears and limbs.

## 2. Lids read as dark outlined circles
- In the game (`face.png`), at blink and in the squint the lid shells show as **darker discs with an outline**. At the squint the
  edge is ragged, with the crease line you mentioned. They read as patches, not eyelids.
- Do what fixed Rosie's lids:
  - paint the lid with **exactly her surrounding face fur** at the closed pose (no lash band, no blush);
  - **blend the lid's shading normals from the skin normals all round the rim**, so lid and skin shade as one surface with no
    ring;
  - sink the lid's top smoothly into the skin so no top edge shows;
  - keep the dark lash strip thin, about her open-eye lash width at the centre, tapering to the corners.
- At the squint, hide or tuck the inner part that creases or stands proud, so the edge is one clean, level line. If a rigid lid
  can't get the inner half clean at +0.488, tell me: there's a per-model squint override in the game, and I can lower her value.
- Check blink, squint and rest in the toon render too. The game's band shading shows any step between the lid and the skin.

Re-render `preview/face.png` (front, both game yaws and 3/4) and `preview/toon-check.png`, and re-export with the same command
(no warnings, deterministic). Report as before (band-displacement stats, triangle count, known issues), then stop.
