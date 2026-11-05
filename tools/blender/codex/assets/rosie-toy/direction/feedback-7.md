# Round 7 — owner feedback (2026-10-27): "Rosie's head shape is different from everyone else's; make it consistent"

This is a rework of the shipped Rosie (`rosie_toy`, built from this folder: `build_rosie-opus.py` + `rig_rosie-opus.py`;
rounds 2–6 are in `direction/`). Round 6 made her head bigger (W 0.52 m) and lowered the crown, but in the game she still
reads as the odd one out. Look at these first (all are game renders at the same camera distance):

- `refs/cast-lineup.png` — the whole cast. Rosie is the girl in pink, centre right.
- `refs/rosie-moka-mochi.png` — Rosie, Moka, Mochi; front row and side row at the same scale.
- `refs/front-*.png`, `refs/side-*.png` — the same, one per file (600 × 800 crops).

## What's wrong (measured in the game, rest pose)

| | Rosie | the cast (Mochi, Kitsune, Kuma, Pan, Tanu, Kero, Moka) |
|---|---|---|
| total height | 1.30 m | 1.09–1.43 m |
| chin height / total | 0.48 | 0.46–0.53 (so her body is fine) |
| **the skin face's width / the head's outline width (front)** | **≈ 0.54** (face ≈ 230 px inside hair ≈ 425 px) | **≈ 0.9–1.0**: the face *is* the head |
| head-plus-hair box, width | 0.82 m (1.58 W) | 0.55–0.68 m |
| head-plus-hair box, depth | 0.83 m | 0.53–0.71 m |

1. **Her face is a small doll face set inside a big hair cloud.** Every other villager's head is one round ball whose front
   is the face: wide cheeks out to the silhouette, a broad round chin. Rosie's skin face is about half as wide as her head's
   outline, framed by the side masses (which round 6 pushed further out).
2. **Her face is flat-fronted.** In the side view (`refs/side-rosie.png`) the face is a near-vertical plane from the brow to the
   chin, with the hair ball behind. The others' faces wrap the front of a ball (Mochi's side view: one convex arc from the
   crown over the forehead, cheeks and chin).
3. **She reads narrow and tall at the face**: the cheeks don't bulge and the chin tapers, against the cast's wide squircles.

## Targets (W = the skin face's width at the cheeks; z above the chin, in W)

- **A bigger, rounder face that fills the head**: W from 0.52 m to **0.62 m** (about 0.48 × her height, like Kitsune 0.49,
  Mochi 0.49). Grow it about the chin; **the chin stays where it is** and the body, costume and legs don't change.
- **The skull is a ball and the face is its front**: chin to skull crown about **0.85 W**; widest at the cheeks (z 0.22–0.32),
  cheeks full and round, out to (nearly) the head's outline; at z 0.08 still about **0.82 W** wide; a broad soft chin.
- **The profile is one convex arc**: crown → forehead → cheek → chin, the cheeks projecting forward of the eye sockets as on
  Mochi and Kuma; only the small button nose sticks out of the arc. No flat face plane.
- **The hair hugs the skull** instead of making a second, bigger ball around it:
  - head-plus-hair from the front: width **≤ 1.15 W** (now 1.58 W), height about equal to its width, a round outline;
  - the side masses become soft round curls **beside and behind** the cheeks, not standing out past them — from the front,
    the cheeks' outline must show, with at most a thin rim of curls beyond it at ear height;
  - head-plus-hair depth **≤ 1.15 W** (now ≈ 1.6 W): pull the back curls in toward the skull;
  - keep her look: dark brown curls, the bangs resting on the forehead at the same height relative to the brows, the red bow
    on top (same size relative to the head), the little ear nubs if they still show.
- **Keep the face language** (scaled in W units): the big brown eyes with their 33° outward facing set into the ball's curve,
  lashes, brows, button nose, smile, blush. Re-check the eyes stay inside the profile silhouette.
- **Toon check**: re-run the adaptive face triangulation for the new head; band displacement within Rosie's earlier numbers.

## This round: the model only — then stop

Build the new head in `build_rosie-opus.py` (deterministic), export `public/models/rosie-opus.glb`, and render:
- `preview/head_front.png`, `preview/head_side.png`, the turnaround, `portrait.png`, and a 45°-down game-camera shot;
- **`cmp-cast.png`**: your new head front and side beside `refs/front-mochi.png`, `refs/front-moka.png` and their side
  views, at the same scale (compare.py, measured on the images);
- `toon-check.png`.

Report before / after: W, chin-to-crown, the face width at z 0.08 / 0.25 / 0.5, the head-plus-hair width, height and depth
(in m and in W), the skin-face-to-outline width ratio from the front, total height; then the toon numbers and known issues.

**Stop after the report.** The director reviews it and the owner signs off on the new head before the re-rig (round 8: carry
the approved skeleton, weights, lids, mouth and face controls across; re-export `rosie_toy` with no warnings).
