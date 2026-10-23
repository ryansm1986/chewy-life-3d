# Mochi, director feedback, round 1: 7.5/10

A strong first round. The head shape, the patches, the eyes and the profile are very close to the sheet, and the build
is clean (deterministic, 29,976 triangles, a smooth toon band). Your calls on the sheet-vs-brief conflicts are right:
follow the sheet (both ears orange, the patch round the eye).

## Locked (don't change)
- The head's outline, width, height, depth and profile (your table), the egg-shaped front and the 30° eye facing.
- The eyes: size, position, iris, pupil, catchlights and lash lines. The brows, the nose position and the "w" mouth.
- The patches' shapes (front and back), the blush, the obi with its back knot, the paintbrush, the kimono collar.

## Fixes
1. **Ears (the main one).**
   - Stand them up: tilt each ear outward about 15–20° from vertical (now it's about 40–45°), so from the game camera
     the near ear is no longer a plate lying on the head and the far ear no longer a horn. Keep the tips at x = ±0.39 W,
     0.14 W above the crown, and move the bases inward to suit.
   - Make them soft rounded cones like the sheet: a puffy rounded rim at least 0.05 W thick all round, rounded tips
     (a tip radius of about 0.04 W) and no flat facets. The toon render shows facets on the rims: subdivide or rebuild
     them as smooth surfaces.
   - The pink hollow: a shallow, smooth dish (matte, no stray highlights), its edge 0.04–0.05 W inside the rim.
   - Judge it in `game-45.png` from both yaws: both ears should read as two upright, rounded cat ears.
2. **The lower face.** The muzzle bump draws an outline under the mouth (front view and portrait: a pouch from the mouth
   corners down to the chin). The sheet's face is one smooth surface there. Lower the muzzle blend to about half its
   height, and blend it over a wider area, so no break shows under the mouth. The nose stays 0.05 W proud. Keep the
   profile numbers within 0.01 W.
3. **The legs and feet.**
   - On the sheet's front view the legs and feet below the skirt's hem take about **0.11 of the total height** (about
     0.12 m); yours take about 0.06. Raise the hem by about 0.05 m (the skirt keeps its shape, just shorter) and show
     the legs below it.
   - The feet are grey: they're cream fur #FFF4EA, the same as the paws. Make them chunkier rounded feet (about 0.11 m
     long, 0.08 m wide) with two toe lines, as on the sheet.
4. **The sleeves**: about 15% bigger (longer and wider), reaching just past the elbow as on the sheet, with the rolled
   opening you have.
5. **The tail.** On the sheet's side view the tail leaves the body at the skirt's back top, dips, then rises in an S
   to its tip at about obi height, out behind. Yours sits lower and the club is small.
   - The club (the orange tip): about 1.4× bigger, a round mitten-like end.
   - The tail: about 1.2× thicker.
   - Raise the curve so the tip ends at about obi height, about 0.25 m behind the back.
6. **Warmth.** The cream reads pure white under the studio light, and the sheet's cream has warm peach shading. Keep
   the base #FFF4EA, but paint soft warm shading into the atlas: about #F2DCC8 under the chin, at the jaw's sides and on
   the backs of the arms, fading out. Don't touch the face's front.
7. Keep the arms at about 30° out.

## Next report
The same set: `cmp-head.png`, `cmp-side.png`, `cmp-back.png`, `cmp-body.png`, `portrait.png`, `game-45.png` (both yaws)
and the toon check, plus a close-up of the ears from the game camera.
