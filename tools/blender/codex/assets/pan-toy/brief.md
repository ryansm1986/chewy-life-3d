# Asset brief: pan-toy (the Toybox Pan, phase 1: the model)

Read `../villager-toy-common.md` first: the shared technical rules, the lessons and the process rules.

## Who
**Pan**, Blossom Hollow's sleepy panda: "naps a lot; surprisingly good at kemari". Drowsy, sweet, unhurried.
The blueprint is `refs/sheet.png` ("Pan · SLEEPY PLAYMATE"), approved by the owner.

## Must keep (from the sheet)
- **Fur** #FBF8F4; **black markings** #29262D: round ears, the eye patches, both arms and both legs (to the hips; the
  body stays white). A small round white tail.
- **The head** is big and wide (about 1.2 : 1), a soft flat-topped dome like Mochi's.
- **Eye patches**: rounded teardrops tilting down and outward, each a clean shape around its eye with a margin of black
  all round. They're painted on the convex face, never sunk into sockets.
- **The sleepy eyes are his signature**: warm amber irises #C88A37, big pupils #211D28, two catchlights, and the
  **upper lid lowered** so it covers the top third of the iris, with a heavy lash line along the lid edge. Model the
  eye opening as on the sheet's front views (half-lidded at rest). The rig round will add a lid you can open wider and
  close; for now the sleepy rest shape is what we judge.
- **Face**: soft short brows set high on the white; a tiny black nose #211D28 on a small rounded muzzle bump and a "w"
  mouth; blush #F2A1A2 under the patches.
- **Scarf** #FF7ABA: a soft thick roll round the neck with a front knot and two short rounded ends.
- **Body**: round and pear-shaped (a full belly), short thick arms and legs, mitten paws, big rounded black feet.
- The **kemari ball** (the sheet's callout, Ø 0.13 m, cream #F4E8D5 with rose panels #E87983) is a separate prop for
  later. Don't include it in the character GLB; if you have time, export it as `public/models/pan-kemari.glb`.

## The director's rough measurements (cross-check yours, Step 0)
On HEAD CLOSE-UP (FRONT) (W = head width at the cheeks, ears excluded):
- head height (crown to chin) about 0.80 W;
- eyes: centres at x = ±0.22 W, about 0.37 W above the chin; opening about 0.21 W wide, the visible part (under the
  lowered lid) about 0.14 W tall;
- eye patches about 0.33 W wide × 0.27 W tall, centred a little below and outside each eye;
- nose about 0.07 W wide, just below the patches' inner ends; mouth about 0.10 W;
- ears: discs about 0.30 W across, centred at x = ±0.42 W at the crown's corners.
- Total height 1.08 m.

## Done when
As in the shared brief: within about 5% of your measured targets, appealing in `portrait.png` (sleepy, not grumpy),
the patches and the black limbs reading cleanly in `game.png` from both 45° yaws, ≤ 30k triangles, one atlas,
`joints.json`. Black fur goes violet in the game's grade; the director fixes that at install (`darkGrade`), so paint the
true colours, with soft cool highlights on the black so its shape reads.
