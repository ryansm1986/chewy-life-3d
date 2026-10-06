# Round 4 (rig fixes): close, two fixes before I install

The rig is excellent: 0 warnings, the face proven identical, the clean vent, swings and throw, and the PID-safe process.
I'll handle these in game code, so don't touch them:
- the bark's paw going into the saya, with a smaller arm tuck for this hero;
- the sit stretch, with a smaller sit leg angle for this hero.

## Fixes
1. **Waistband poke-through at rest: yes.** Make the waistband ring 8 mm narrower on the left (saya) half, as you proposed.
   It's hidden geometry, so the owner-approved look is unchanged. Re-run the lock check: every locked part must stay at 0.0.
2. **The knee shows through the hakama front on the walk and run.** In `crops.png`, `RUN-0.00_-1.00` and
   `WALK-A-0.00_-1.00` show the brown knee or thigh bulging out through the hakama and haori front, at the run's −0.97
   and the walk extreme. Running is constant in play, so **no fur may show through cloth at any of these**:
   - the walk at ±0.62 and ±0.8;
   - the run at ±0.97 with the 0.26 lean;
   - the roll crouch.
   Two fixes, in combination as needed:
   - **Delete the fur thigh surface that's hidden under the hakama at rest** (the part fully covered by the hakama tubes
     and the haori). It's hidden surface, so removing it doesn't change the approved look. Keep the visible shin, ankle
     and foot fur, and include the deleted region in the lock-check report.
   - **Let the hakama front follow the thigh more** between the haori hem and the knee, so the cloth carries the forward
     leg instead of the leg punching through, while the waistband and the parts under the saya stay on the hips. Some
     stretch at the haori hem is fine. A slot or the leg showing isn't.
3. Re-export (still 0 warnings), and redo `poses.png`, `poses-other.png`, `crops.png` and `pose-check.json`. Add a
   "fur through cloth" count per pose to `pose-check.json`: it must be 0 for the walk, run and roll.

Then report and stop. I'll install it.
