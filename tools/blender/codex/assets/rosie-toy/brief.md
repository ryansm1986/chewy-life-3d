# Asset brief: rosie-opus (the Toybox Rosie, an Opus rebuild of the head; phase 1: the model)

## Why you're here
**Rosie** (Chewy's best friend, a little girl baker) was modelled by another builder over 12 rounds (`codex-history/`: its brief, every
director feedback round, and its final build script `build_rosie-toy.py`). The costume and body came out well. **The head did not.**
The owner's verdict on the last version: **"The head has completely lost its rounded shape."** The repeated local fixes (sockets,
profile measurements, bang moves) turned the face into a flat-fronted, box-like mask with a hard top corner. See
`refs/codex-r12-review.png` and `refs/codex-r12-comparison.png` (sheet above, model below). `refs/codex-r10-portrait.png` is the
most appealing front/3/4 it ever reached.

**Your job: build Rosie with a properly round head**, matching the approved sheet `refs/sheet.png` (option A "Sweetheart"),
while keeping the body and costume look the owner already approved.

## What to keep (approved by the director and the owner; reuse it)
From `codex-history/build_rosie-toy.py` (read it; you may import or copy its code for these parts, or rebuild them to the same
spec):
- **Body and costume**:
  - the pink dress (#ff8fb0) with an A-line skirt and round white scalloped hem;
  - puffy short sleeves;
  - the flat white Peter Pan collar (#fff6f0) with the strawberry brooch;
  - chubby arms with mitten hands;
  - chubby legs, white folded socks and red Mary-Jane shoes (#d8443a).
  The proportions and colours in `codex-r12-comparison.png`'s lower row are right **from the neck down**.
- **The bow**: big red (#e8364a), two rounded loops and a centre knot on top of the head.
- **Overall size**: the hair top at about 1.18 m, the chin at **0.72 m**, the feet on z = 0, facing −Y.
- **The palette** (sheet swatches): skin #FFE4D2 (in practice a warm peach #ffdcc4 read best), hair #6B3A22 / sheen #8E5634 /
  gaps #4E2A18, eyes #7A4424, blush #FF9AB0, dress #FF8FB0, white #FFF6F0, bow #E8364A, shoes #D8443A, leaf #568D4A.

## The head: build it as a BALL (the whole point)
Start from a **sphere-like skull** and keep it round in every view. The face is painted and gently sculpted **onto** that ball; it is
not a flat plate.
- **Size**: W (the face width at the cheeks) = **0.44 m**; from the chin to the top of the skull (under the hair) about 1.02 W.
  The head is a slightly squashed ball, very slightly wider than tall.
- **Front view**: a round, chubby toddler face, widest at the cheeks 0.25 W above the chin, with a round full jaw and **no flat sides
  or corners**.
- **Side view**: the face front is a **convex arc**, forehead over cheek to chin. Use the sheet's profile table, measured on its
  side view (x = behind the nose tip, z = above the chin, in W):

  | Feature | x | z |
  |---|---|---|
  | Nose tip (the only projection) | 0 | 0.27 |
  | Forehead under the bangs | 0.06 | 0.60 |
  | Mouth | 0.05 | 0.12 |
  | Chin front | 0.10 | 0.03 |
  | Under the chin, into the neck | 0.37 | −0.04 |
  | Eye white, front / back edge | 0.14 / 0.38 | centre 0.34 |
  | Ear centre | 0.74 | 0.22 |
  | Back of the hair | 1.6 | — |

  **But keep it round**: all of these points lie on a smooth ball-like surface with generous curvature. There's no vertical flat
  plane and no sharp forehead or crown corner. The skull curves continuously from the forehead over the top to the back.
- **Top view and 3/4**: the cheeks wrap back toward the ears. In 3/4 the far cheek is a round curve with the far eye foreshortened
  **inside** the outline.
- **Eyes**: these are approved and worth keeping in look. Big glossy eyes:
  - centres at x = ±0.27 W, 0.34 W above the chin;
  - opening about **0.30 W wide × 0.26 W tall**;
  - iris dark warm brown #7a4424 → lighter #b0703a at the bottom, about 70% of the opening width × 92% of its height,
    **tucked toward the nose**;
  - white crescents on the outer side and the bottom;
  - pupil about 68% × 76% of the iris;
  - two catchlights;
  - a thick dark upper lash line #2a1a14 with **3 small outer flicks laid flat on the skin**.
  The eyes face about 30° outward following the ball (set into the head, at most 0.015 W proud), and the far eye is hidden in
  profile.
- **Brows**: soft brown arcs #6b3a22, about 0.04 W thick, 0.16 W long, at about 0.56 W above the chin, their tops just under the bang
  edge.
- **Nose**: a tiny rounded button, 0.09 W wide, #f4a88a, at 0.26 W above the chin.
- **Mouth**: a small closed smile, 0.17 W wide, at 0.14 W above the chin, with the corners curled up.
- **Blush**: soft round ovals, #ff8fa8 at about 70% in the centre fading out, 0.17 × 0.10 W, at x = ±0.31 W, 0.18 W above the chin.
- **Ears**: small round skin ears, about 0.10 W × 0.13 W, partly tucked into the hair, visible from the front.
- **Skin**: perfectly smooth vinyl, no creases anywhere. A soft shadow band under the bang edge.

## Hair: a curly bob of big, smooth clay volumes
- **Bangs**: 3 separate rolled lobes (a centre one about 0.52 W wide, two side ones about 0.30 W) **resting on the forehead**.
  - The centre lower edge is at **0.60 W** above the chin, just above the brows; the temple ends are at 0.50 W **beside** the
    outer eye corners, not over the eyes.
  - In profile the bang hugs the forehead's curve and rolls back into the crown (front edge about x 0.00–0.05).
- **Crown**: 3–4 big smooth pillow sections from a soft part, continuing over the top to the back. **Round, not flat.**
- **Sides and back**: about 12–14 big rounded curl lobes (0.28–0.40 W) from temple height down to about the chin. The outer width at
  eye level is about **1.6 W**, and the back view is a full rounded mass from the bow down to the nape. The previous builder's
  side and back curls were good (see its comparison); match that volume.
- **Colour**: #6b3a22, with #8e5634 sheen on the upper third of each lobe and #4e2a18 in the gaps. No gaps or holes through to the
  inside from any angle. No thin wisps.

## Technical
- A neutral A-pose (arms about 20–30° out); facing −Y; on z = 0; centred.
- **≤ 30k triangles**, with the head and hair taking up to 60%. One material, one 2048² painted atlas. Smooth silhouettes, with no
  visible polygon steps at portrait size.
- **Rig-ready** (rigging later, to the game's 37-bone hero contract like the Toybox Chewy):
  - eyeballs as separate spheres;
  - loops around the eyelids and the mouth corners;
  - the hair as its own meshes;
  - the skirt with loops;
  - loops at the joints;
  - `joints.json` (the same keys as `codex-history`'s build writes).
- Output **`public/models/rosie-opus.glb`** (don't overwrite `rosie-toy.glb`; that's the previous builder's).

## Review deliverables (every round)
- The standard preview with `--character`.
- Same-scale comparisons against `refs/sheet.png`, built with compare.py:
  - `cmp-head.png` (front and 3/4);
  - `cmp-side-head.png` (side head, chin and nose aligned);
  - `cmp-back.png`;
  - `comparison.png` (the full turnaround vs the sheet's row);
  - **`cmp-vs-codex.png`**: your head beside `codex-r12-portrait.png` and the sheet, to show the roundness gain.
- `portrait.png` (3/4 head and shoulders, studio light).
- `game-45.png` (45° down, yaw ±45°, long lens).

## Done when (phase 1)
- **The head reads as a round ball in every view**: front, 3/4, side, back, top and the 45° game camera.
- The face matches the sheet's features within about 5%.
- The portrait is at least as appealing as `codex-r10-portrait.png`.
- The costume matches the approved look.
