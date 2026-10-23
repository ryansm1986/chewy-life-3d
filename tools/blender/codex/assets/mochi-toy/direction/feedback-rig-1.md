# Mochi, rig review 1

A clean rig: the export has no warnings, rest equals the approved model, the poses deform well (walk, run, arms raised,
head turns, ears and tail), and the open mouth is a lovely cat smile. Two things in the face, both in `face.png`.

## Fixes
1. **The happy squint reads sad (row 3, and row 6).** The upper lid's edge follows the eye's arched top, so at +0.488
   it slopes down toward the outer corners: from the front she looks worried, from the game camera sleepy. This is the
   one thing the game's happy face must never do. At +0.488 the upper lid's edge must be **level, or a little higher at
   the outer corner** than at the inner corner, covering the top ~25–30% straight across (a flat or slightly
   upward-tilted line), so together with the lower lid's upward arch the eye becomes a happy crescent "◠".
   - If a rigid lid can't make a level edge at that angle, shape the lid shell's edge for it: let the lash edge be
     straighter than the eye's top arch (it's hidden at rest anyway), or move the lid's hinge so it rotates down across
     the eye rather than wrapping it. Your kinked level-edge try: try again with the edge's straight part over the
     middle 70% and soft rounds into the corners.
   - Check the happy row from the front and both game yaws.
2. **The closed eye reads as a "J" (row 2).** The skin's painted outer lash and wing stay visible beside the shut lid,
   and the lid's own lash curve doesn't connect to it. When shut, the eye should read as one soft "∪" lash curve that
   flicks into the wing at its outer end. Either let the shut lid cover the painted outer lash (and carry the wing on
   the lid's own edge), or make the lid's lash curve run into the painted wing exactly. Also the shut lid on her left
   eye shows a faint outline round its edge in the front view: match its shading to the skin round it.
3. **The wave and the hop**: understood. I'll use Rosie's `wave: 'out'` and a smaller raise in the game, so no change
   is needed in the rig.

Re-export with no warnings and send the new `face.png` (all rows) and the `HERO_EXPORT` line.
