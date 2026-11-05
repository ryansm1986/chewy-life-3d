# folk-tanuki-b-toy (Bun, the baker's helper): measured targets vs model (round 1)

Measured on `refs/sheet.png` (row B) with PIL masks (`measure/mext.py`, `measure/mfront.py` colour classes,
`measure/mface.py` + `measure/grid.py` -> `measure/grid_b.png`). Model numbers from `measurements-model-b.json`.

## Scale
- Turnaround front: ground y 654.5, skull crown (midline) y 418 -> **1.05 m crown-to-sole = 225.2 px / m**. Ear tops y 409
  (1.09 m).
- Head: W 165 px = **0.733 m** (B's head is the broadest); the chin is hidden by the neckerchief: the scarf top at the
  midline is y 515, the chin taken ~0.03 W under it, y 520 = **0.597 m**; crown-to-chin ~0.453 m.
- **Note 1**: the close-up is referenced to the scarf top; its numbers are shifted by the hidden 0.03 W and used x 0.937.
  B's face features sit ~0.01 W lower than A's on her fuller head (DZ = -0.010).

## Head (W units, z above the chin)
| item | sheet | model |
|---|---|---|
| crown at midline / x 0.1 / 0.2 / 0.3 W | 0.620 / 0.614 / 0.578 / 0.530 | 0.602 / 0.597 / 0.578 / 0.538 |
| widths z .05/.12/.20/.235 | .80/.94/.993/1.0 | .78/.96/1.009/1.009 |
| widths z .31/.385/.46/.535/.57 | .979/.90/.78/.595/.465 | .961/.884/.789/.611/.458 |
| front profile at z .19 (muzzle) / .383 / .48 | .485 / .385 / .335 | .479 / .380 / .323 |
| back profile at z .24 / .383 / .48 | .40 / .36 / .30 | .412 / .380 / .325 |
| eye opening centre / size | (0.180, 0.318) / 0.15 x 0.165 | (0.180, 0.305) / 0.150 x 0.162 |
| muzzle w x h, centre z | 0.33 x 0.23, 0.18 | 0.332 x 0.248, 0.167 |
| nose centre z | 0.262 | 0.265 |
| blush centre | (0.29, 0.197) | (0.30, 0.201) |
| brows peak z | 0.497 | 0.497 |
| ears: front x span, apex z | 0.14-0.42, 0.68 (from the hidden chin) | outer 0.423, apex 0.69 (1.108 m) |

Crown -3% (0.602 vs 0.620 W) and her eyes 0.013 W lower than the close-up's: within 5%.

## Body (metres)
| item | sheet | model |
|---|---|---|
| crown / ear top | 1.050 / 1.09 | 1.038 / 1.108 |
| smock width (no arms, z 0.19-0.28) | 0.737 | 0.737 |
| smock depth (side, z 0.42) | ~0.60 | 0.62 |
| arm span | 0.964 | 1.007 (+4.5%) |
| hem z (sides; the sheet's hem dips to ~0.135 at the centre) | 0.167 | 0.172 (level) |
| pocket z span / width | 0.189-0.362 / 0.356 | 0.186-0.366 / 0.361 |
| neckerchief band: z span at the back / half-width | 0.52-0.61 / 0.30 | ~0.51-0.60 / 0.29 |
| knot centre z, width | 0.553, 0.09 | ~0.54, 0.096 |
| scarf ends: length, width, tips z | ~0.12, ~0.07, ~0.43 | 0.13, 0.088 (x 0.40 squash in depth), ~0.43 |
| feet outer x / leg width | 0.32 / 0.29 | 0.320 / 0.303 |
| tail: back extent / z span | ~0.44 / 0.13-0.36 | 0.440 / 0.085-0.377 |
