# Round 2 feedback (shihtzu-toy): about 7.5/10, a strong start

## Approved and locked
- The build approach: the implicit head ball, the lens eyes (amber iris, catchlights, the lash) facing about 30° out.
- The cast fit and height: the crown at 1.200 m, 2.23 heads.
- The costume layout: the belt and paw buckle, the tabard panels with the teal star and the moons, the tome, the cloak, the
  boots.
- The flail prop and its link hierarchy. 5.5k triangles is fine for a hero weapon.
- The toon band, and the determinism.
- One atlas (the teal glow painted in it is fine).

## The face-rule decision: follow the sheet
Set `FACE_RULE = 'sheet'`. The Shih Tzu is a flat-faced breed, like Poe, whose nose top sits at the eye-centre line. The
"iris bottom at or above the nose top" rule came from Moka's long muzzle and tall forehead, and doesn't apply here. Your
lowered nose is making his muzzle read long. Restore the sheet's nose height (top at 0.448 W) and eye height (centre
0.461 W).

## Fixes
1. **The ear locks read as a helmet or a bob haircut.**
   - **The problem**: from the front they flare out sideways at the top and give a wide, flat-topped mushroom silhouette.
   - **The sheet's shape**: they start at the top-sides of the skull, close to the head, and **drape down**. They're
     widest at the cheek or jaw line, not the top, and break into **3–4 distinct soft wavy lobes at the bottom** (look at
     the sheet's front and 3/4 head close-ups).
   - **The fix**: pull the top of each lock in against the skull (no outward flare above the eye line), let the mass hang
     and widen lower down, and sculpt the separated lobes at the bottom edge.
   - Raise their resolution a little to remove the faceting. Spend triangles from the body or the cloak if needed (stay
     at or under 30k).
   - Keep the head-plus-locks span at about 1.89 W, as on the sheet.
2. **The eye markings make him look worried or sad.**
   - **The problem**: the black patches *around and under* the eyes, plus the white "brow wings" angling up and inward,
     read as a sad, anxious face.
   - **The sheet's markings**: the face around and **below** the eyes is **white or cream**; the black sits **above and
     outside** the eyes (the forehead sides), merging into the black ear locks; the white blaze runs up the centre.
   - **The fix**: remove the dark under-eye patches. Make the white wrap under each eye as a crescent, and keep the black
     above-outside only.
   - Soften the white brow shapes so they don't form slanted "worried" brows. On the sheet the brow area is just the edge
     of the black fur, roughly level.
3. **The mouth reads as a frown.**
   - **The problem**: the mouth line under the nose is an inverted V, which reads grumpy.
   - **The sheet's mouth**: a soft **"ω"** line under the nose, between the two moustache lobes, with a gentle smile at the
     corners.
   - **The fix**: give the moustache lobes a clear centre parting, so it's a round "chrysanthemum" muzzle puff. Keep the
     beard puff below.
4. **The topknot**: replace the ball cluster with the sheet's **twisted petal bun**, a soft swirl of 3–4 broad curled
   petals rising from the plum band. Keep the band and the silver paw bead.
5. **The shoulders**: the sheet has prominent **layered silver pauldrons** (2 stacked rounded plates with plum trim) on each
   shoulder. Yours are single dark plates. Make them silver and layered so the silhouette reads "knight" from 45°.
6. **The legs**: on the sheet the legs under the tabard are **black**, with a **white fluff cuff above the boots**. Yours
   read mostly white or cream. Match the sheet.
7. **The tail**: as you noted.
   - Lift it into the sheet's **plume curling up over the back**, higher on the rump, clear of the cloak emblem and not
     overlapping the paw.
   - Its root comes out of the cloak's hem rather than through it.
   - Soften the black-to-white transition.
8. **Smaller**: widen the cloak about 10% to the sheet, and raise the chest-ruff V to about 0.48.

## Deliver
The same set:
- `cmp-front`, `cmp-head`, `cmp-side`, `cmp-back`, `cmp-eyes` and `cmp-cast`;
- `game-45` and `game-45-head` from both yaws;
- the portrait;
- `toon-check`;
- the measurements table.
Then stop: the owner sees him before the rig. Keep the process rules (log PIDs, kill only your own).
