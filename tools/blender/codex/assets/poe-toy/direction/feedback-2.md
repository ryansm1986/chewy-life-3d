# Round 2 feedback (poe-toy): 8/10, a charming start

`portrait.png` is lovely: the honey eyes, mask, collar, scarf and finish all belong in the toy line.

## First, a process rule
You killed a Blender process (PID 21460) that wasn't yours. **Never stop a process you didn't start**, even a huge one.
If one looks wrong, report it with its PID, command line and memory, and leave it running. Get your own run's PID when
you launch it, so you only ever kill that.

## Approved and locked
Don't touch these:
- the eyes: placement, size, iris and pupil, the 27° outward facing, catchlights and lash band;
- the forehead roll;
- the mouth position;
- the body proportions, outfit pieces and palette (true sheet colours);
- the tail;
- `fuma_back`: keep it at **0.80 m** (FUMA_R 0.40), following the sheet, as you did;
- the arms at 40° from vertical;
- the determinism.

## Fixes
1. **Ears: folded "button" ears, not side flaps.** From the front and in the game they read as big horizontal paddles
   sticking out past the head. On the sheet they're small folded triangles that **flop down and forward** from the top
   corners, staying close to the head's sides.
   - The outer edge is at most **0.60 W** from the centre (now 0.65).
   - The tip hangs to about the **outer top of the eye**, pointing down and forward, slightly curled under.
   - A visible rolled **fold** sits at the top corner.
   - Keep the thickness (at least 0.06 W, as now) and the forward-facing broad face, so they read from both 45° cameras.
   - From yaw −0.8 the near ear currently merges into the head top as a flat dark shape, and from +0.8 the far one reads as a
     fin. Check both yaws.
2. **Fuller pug cheeks.** The head reads boxier than the sheet, whose cheeks bulge out below the eyes into a wide soft
   lower outline.
   - **Keep the eyes, nose and mouth at their current absolute positions and sizes.**
   - Add cheek and jowl volume **below the eye line**, so the cheek width grows about 5% and the lower outline is a full
     round curve, not straight sides. Aim for W : H ≈ 1.5 measured at the cheeks.
3. **A crisper nose.**
   - Make it about **0.16 W** wide (now 0.142), with its top kept at the eye-centre line.
   - Paint two visible nostrils, and add a brighter, crisper highlight, about #8A8494 on the top front of the button.
   - If you can, give the nose a lower roughness in the material's roughness channel.
   On the sheet the nose is one of the clearest face features. Right now it's dark on dark.
4. **Readability on black in the game.** In the game the face goes dark and flat: the eyes read, the muzzle and mouth
   vanish. Paint **soft cool sheen highlights**, #4A4450 to #5A5462, on:
   - the forehead roll;
   - the top of the muzzle bun;
   - the cheek tops, under the eyes;
   - the crown.
   Paint them like the sheet's soft studio highlights, so the forms read under the game's hard toon band. Keep the
   mask tint on the muzzle subtle. Check `toon-check.png` and a 45° render.
5. **The festival mask from above.** At the 45° game camera it lies on top of the head like a big badge in front of the
   crown.
   - Move it **outward and back** onto her left side corner, over the left ear root and slightly behind it, and turn its face
     outward, about 40° from forward, toward the side.
   - From the front it should still read as on the sheet, at the top left corner, tilted. From 45° above it should read as a
     side accent, not a badge on the forehead.
   - Keep its size and paint, and keep the left eye clear.
6. **Shin wraps**: clean cream wraps with smooth edges. Today jagged white bits poke out at the boot tops (front view).
7. **The collar**: add two or three soft, broad cloth folds to the cream roll, as on the sheet. Keep it bright.
8. **The scroll**: shrink it to the sheet's size, about 0.15 × 0.21 of the total (it's about 25% larger now).

## Deliver
The same set as round 1:
- `cmp-front`, `cmp-head`, `cmp-side`, `cmp-back`, `cmp-eyes` and `cmp-cast`;
- `game-45` and `game-45-head` from both yaws;
- `toon-check`;
- the portrait;
- the report.
Then stop: the owner sees her before the rig.
