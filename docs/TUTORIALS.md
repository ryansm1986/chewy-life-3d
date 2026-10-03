# Guided tutorials

Status: **built** (2026-10-03). There are three guides, run by a small reusable director:
- the house tour, narrated by Shadow;
- switching heroes, narrated by Moka;
- fishing, narrated by Kero.

## The director (`src/world/tutorials.js`, `G.tutorials`)
- **A guide** (`src/world/guides.js`) is `{ title, narrator, color, priority, blurb, offer, icon(), trigger(G), locked(G)?,
  onStart?, onEnd?, steps }`.
- **A step** is `{ id, say, who?, objective, target?, highlight?, callouts?, flash?, waitFor?, done?, on?, onEnter?, tick?,
  ack?, skippable?, allow?, resumeAt? }`:
  - `say`: a line (or `(G, T) => line`) from the narrator, shown in a speech card. It is not the dialogue box, so it
    never blocks input.
  - `objective`: the objective card's line ("2/6", the guide's title, *Skip*).
  - `target(G, T) → { pos, label, npc? }`: a chunky bouncing pink 3D arrow with a pulsing ground ring at the spot.
    `G.questTarget` asks the director first, so the edge arrow (off screen) and the minimap pin point there too.
  - `highlight(G, T) → selector | Element | [..]`: a soft pulsing spotlight ring round a UI element, with the rest of
    the screen dimmed slightly. It never takes clicks.
  - `callouts(G, T) → [{ el, text, side, at }]`: little labelled bubbles pointing at UI elements (the reel bar's coach).
  - `flash: [text, sub]`: the big "NOW!" moment.
  - `waitFor`: an event name, or `{ event, test(payload) }`.
  - `done(G, T)`: a polled condition.
  - `on: { event: (p, T) => … }`: reactions such as gentle tips, or looping back with `T.goto(step, { say })`.
  - `ack`: a wrap-up step that ends on "Got it!".
  - `skippable`: shows a "Skip step" button.
  - `allow: { dialogue, switching, panels: [...] }`: what doesn't pause this step.
  - `resumeAt`: where a reload picks up (a cast in progress restarts at the cast).
- **Pausing**: the speech, spotlight and arrow hide, and the objective card fades, during dialogue, panels, screen
  transitions, hero switches, build mode, and anywhere but the village, unless the step allows it.
- **Wandering off**: a step never fails. Its target just keeps pointing (the arrow re-points from wherever you are).
- **Progress** lives in `state.flags.tutorials = { active, [id]: { step, started, offered, done, skipped } }`. A reload
  resumes the active guide at its step.
- **Starting**: a guide starts on its own when its `trigger` first becomes true and the game is calm (no dialogue,
  panel, banner, transition or switch). If several are pending, the lowest `priority` goes first.
- **Old saves**: a save that is already past a guide's trigger when it loads, with no record of that guide, gets a
  one-time offer card instead: "New guide available: … Show me! / No thanks".
- **Replay**: the Journal has a **Guides** tab (status ✓ / skipped, Play / Replay). Esc closes panels as usual and
  never skips a guide; *Skip* on the card does.
- **Shadow's tips**: his one-off toast tips wait while a guide is talking. The old `tabSwitch` tip is retired once the
  switching guide is done or skipped, and is never shown while that guide will run or be offered.
- **QA**: guides start on their own only when the director is enabled.
  - It is off with `?notut`. It is also off with the QA's `?nointro` (unless `?tut`), and that's remembered in
    sessionStorage for the tab, so a QA reload of its own save stays quiet.
  - Replays, and offers the player accepts, always work.
  - s1-s15 never meet a guide; `tools/qa/s16-tutorials.mjs` drives them with `?tut`.

## The UI (`src/ui/tutorial.js`, `tutorial.css`)
- `TutorialUI` (`G.ui.tutorial`, over everything, `pointer-events: none` except its buttons):
  - the top-centre dock (speech card, objective card);
  - the spotlight;
  - callouts;
  - the flash;
  - the offer card.
- `GuidesView`: the Journal's Guides tab (`ui/map.js`).
- Every element is re-measured each frame, so the spotlight follows things that move (the reel card beside the player,
  dialogue choices sliding in).

## The guides
- **Two heroes (Moka)** starts right after her join scene.
  1. "Press Tab, or click here": the HUD switch button is spotlit. The step waits for the switch.
  2. Her real mouse binds (from `mouseSets`), and an arrow over Chewy, now a villager in town. The step holds for at
     least 3 s: right after the swap Chewy can be standing beside Moka, and it used to finish on its first frame (that
     race was s16's intermittent failure).
  3. "Talk to him to switch back, or press Tab when the swirl is ready": the switch button with its cooldown ring is
     spotlit. The step is skippable.
  4. Wrap-up: the bag and coins are shared; weapons are class-bound (sword and ball / staff); each hero levels on
     their own; Well Fed is per hero.
- **Home, sweet home (Shadow)** starts after Rosie's welcome, and after Moka's arrival scene when that follows it
  (`G.introJoinPending`).
  1. An arrow to the cottage door.
  2. F at the door, with the prompt spotlit.
  3. The cottage menu: Shadow spotlights and explains the stash (shared), Sleep (crops, income, save) and Cook in
     turn, then Leave.
  4. An arrow to the garden bed. If the player has no seeds at all, Shadow gives 3 turnip seeds as a housewarming gift
     (`flags.shadowSeeds`, once). Usagi's starter pack and "First Sprouts" are untouched, so nothing is double-gifted
     when the player already has seeds.
  5. Till, then plant (the seed card spotlit in the picker), then water.
  6. The Pantry button (a new HUD button, P) is spotlit.
  7. Wrap-up: sleep to grow crops; Usagi's stall (the arrow points there).
- **Fishing with Kero** starts as soon as you have a rod (Kero's gift, or the Fishing Hut).
  1. A marked bank spot beside Kero:
     - the spot is a koi-pond bank spot (`Fishing.bankSpotNear`) on the side nearest the player;
     - Kero leaves his day for it (`claimKero`): seats, chats and props are let go, and he's woken and brought out if
       he's indoors or in bed at night;
     - he walks over if he's within about 11 m, otherwise he hops over;
     - he stands frozen beside the spot, without his usual greeting "!" (the bite has one);
     - he gets on with his day once the first fish is in, or the guide ends;
     - a reload re-claims him at the step it resumes.
  2. "Face the water and press F", with the prompt spotlit.
  3. The wait. This first cast is guaranteed to bite after 3.2 s. Nibbles are explained, and an early press gets a
     gentle tip instead of losing the fish (`Fishing.tut`: `biteAfter`, `forgiveEarly`).
  4. The bite: a big "NOW! Press F" and a 1.2 s window. A miss loops back to the cast with a kind word.
  5. The reel: callouts point at the zone, the fish and the meter. The fish is an easy crucian carp with a bigger zone
     and a slower drain (`zone` 0.34, `drain` 0.55). An escape loops back to the cast.
  6. The catch, then the Journal button is spotlit, then the Fish Log tab is spotlit.
  7. Wrap-up: other spots and times, selling at the Hut, cooking. Kero's "catch 3 fish" quest carries on as normal.

## Hooks added for the guides
- `fishing.js`:
  - `scanAt` and `bankSpotNear`;
  - `this.tut` overrides;
  - the events `fishing:start`, `fishing:cast`, `fishing:nibble`, `fishing:early`, `fishing:bite`, `fishing:reel`, and
    `fishing:end { result: catch | escape | late | early | cancel }`.
- `services.js`: `home:menu` and `home:menuClosed { choice }`.
- `garden.js`: `facingDoor()`. Walking up to the cottage door now means the door, not the bed's corner tile beside it.
- `hud.js`: a Pantry button in the menu bar.
- `game.js`: `G.tutorials`, `G.introJoinPending`; `questTarget` asks the director first. Moka's join toast is skipped
  when her guide will show it.
