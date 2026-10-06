# Round 2 feedback (chewy-samurai): 8.5/10, close

## Approved and locked
Don't touch these:
- the lock: the head, body, tail and atlas regions;
- the palette and the `OUTFIT` constants;
- the haori's length, hem and lopsided width, and the tail vent;
- the gold collar edges and crests (their placement as built is fine);
- the kimono V and the cream collar line;
- the cord and knot;
- the saya's position, angle and length, and `saya_mount.json`.
The back collar at 0.558 is accepted, since the head limits it. The black reads as fabric at 45°.

In the game the black shifts toward navy and the fur toward maroon (the grade pass). That's mine to fix with a runtime
grade on the hero entry, so **don't change the paint**.

## Fixes
1. **Bigger box sleeves**, closer to the sheet. Grow them **outward and downward**, not up, since the head underside limits
   the top:
   - the outer edge at about x = 0.39 m (now 0.36);
   - the lower edge hanging about 2 cm lower, so each sleeve reads as a wide square box over the upper arm, as on sheet
     E's front view;
   - let the sleeve top slope down from the shoulder to keep its 9 mm head clearance.
   They must stay open underneath, and clear of the arm wraps and the arm swing. Check from both 45° yaws that they don't
   read as wings.
2. **The hakama front reads as one pleated mass.** Today the gap between the two leg tubes shows as a dark slot down the
   centre front, so it reads as shorts. On the sheet the centre front is closed, with just a slight notch at the hem.
   - Bring the inner front edges of the two legs together, overlapping a pleat at the centre front, so the front view
     shows at most a small notch, about 1 cm or less, at the hem.
   - Keep them two separate tubes for rigging.
   - The back can keep a slightly larger parting, as on the sheet.
3. **Sageo tails**: shorten them and lay them along the saya, or tuck them at the obi, so they don't hang in the left leg's
   path. Add them to the leg-swing check and report the clearance.
4. **The forward leg swing past −0.6 rad** touching the saya mouth is accepted. Note it for the rig phase; nothing to change
   now.

## Deliver
The same set as round 1:
- `cmp-front`, `cmp-side`, `cmp-back`, `cmp-34`, `game-45` and `game-45-back`;
- a close-up of the sleeves from the front and both 45° yaws, and of the hakama front;
- the updated `build-checks.json` (with the sageo in the swing check) and `lock-check.json`;
- the report. Then stop: the owner sees it before the rig.
