# Round 7c — owner feedback (2026-10-28): "Rosie's face still protrudes too far out"

The round-7 front view is right (the face fills the head) and the ringlets are fine: keep both. The problem is the
**side view** (`preview/head_side.png`): the face juts forward of the head like a muzzle.

What the side view shows:
- from the ear to the nose tip is about as long as from the ear to the back of the hair;
- the whole face (cheek, mouth, chin) stands well forward of the bangs' front edge;
- a long, sloping under-jaw runs from the chin back to the neck.

On Mochi, Kuma and Moka (`refs/side-*.png`) the face is the front of the ball, barely ahead of the forehead and the
hairline, and the under-chin is short and tucked.

## Targets (W = 0.62 m, unchanged; measured on the side render, in W)
- **Shorten the head's front half in depth**: nose tip to ear centre from **0.555 W to about 0.40 W**.
  - Pull the face back toward the skull's centre.
  - Don't scale the whole head: the width at the cheeks (W), the crown height, the front view and the hair at the back
    stay as they are.
- **Head-plus-hair depth (nose tip to the back of the hair)**: from 1.145 W to **about 1.00 W** (Mochi ≈ 1.03 W).
- **The face sits under the bangs, not ahead of them**:
  - the cheek's front at z 0.25 is no more than **0.06 W** ahead of the bangs' lowest front edge;
  - the nose tip is no more than 0.05 W ahead of the cheek's front.
- **Undo the lower-face push** (`LOWFACE`, the 11% at z 0.14): the mouth and the cheeks must not sit ahead of the brow.
  - The profile from the brow to the chin is close to a vertical, gently convex arc. The chin is slightly *behind* the
    mouth, not jutting.
- **A short, tucked under-chin**: from the chin's front back to the neck about **0.30 W** (now ≈ 0.5 W), curving round
  rather than a long sloping plane. Keep it clear of the collar.
- **The eyes stay set into the ball's curve** at about 33° outward, still inside the profile silhouette. With a shallower
  front they may need to sit a little further round the sides: re-check the margin.
- Keep everything else: the front-view face widths (0.826 / 0.998 / 0.922 W), the hair hugging the skull, the bangs, the
  bow, the ringlets and their clearances, and the temple fixes.

## Deliver
- `preview/head_side.png`, `head_front.png`, `head_34.png`, `portrait.png`, `game-45.png`, `toon-check.png`.
- `cmp-cast.png`: the front and side rows, as before.
- **New: `cmp-profile.png`**: Rosie's side silhouette over Mochi's and Moka's side game frames, at the same head height
  (chin to crown). Use outlines or 50% overlays, so the face depths compare directly.
- The table:
  - nose-to-ear, head-plus-hair depth, cheek-ahead-of-bang, nose-ahead-of-cheek and the under-chin length, before and
    after;
  - the unchanged front numbers, to confirm;
  - the eye margin;
  - triangles.

Then stop. The rig round (8) follows the owner's sign-off. In that round we'll also trim the triangles to the rig's
budget and weight the front ringlets' tips to the neck and chest.
