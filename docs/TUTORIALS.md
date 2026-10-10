# Guided tutorials

Status: **built** (2026-10-03; the cozy path's three guides 2026-10-09). The guides are run by a small reusable director:
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
  - `objective`: the objective card's line ("2/6", the guide's title, *Skip*). It can be a function too.
  - A step whose `say` or `objective` is a function says it again when the input device changes (`redevice`, on
    `input:device`), so a line can be in the device's words (the fishing guide's "tap" on touch). A line set by an
    `on` handler stays until the next.
  - `callouts` may give `edge`: another element whose side the callout sits past, at its own element's height.
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
  - `allow: { dialogue, switching, interior, panels: [...] }`: what doesn't pause this step (`interior`: it runs inside
    a house, docs/HOUSING.md).
  - `resumeAt`: where a reload picks up (a cast in progress restarts at the cast).
  - `lead: true`: Shadow leads the way to the step's target (ROADMAP R-17, `actors/shadowLead.js`; ARCHITECTURE "Shadow
    leads the way"). Give it to a step whose line says he leads ("Follow me!", "Follow Shadow…"), so the words and what he
    does match: the house tour's door, inside and garden steps, the Board guide's walk, the nose guide's sniff (his nose
    takes over once he smells the spot). The target's `{ guide, step, lead }` tag reaches `G.questTarget`.
- **Pausing**: the speech, spotlight and arrow hide, and the objective card fades, during dialogue, panels, screen
  transitions, hero switches, build mode, and anywhere but the village, unless the step allows it (a step with
  `allow.interior` runs inside a house too, with its arrow in the room).
- **Wandering off**: a step never fails. Its target just keeps pointing (the arrow re-points from wherever you are).
- **Progress** lives in `state.flags.tutorials = { active, [id]: { step, started, offered, done, skipped } }`. A reload
  resumes the active guide at its step.
- **Starting**: a guide starts on its own when its `trigger` first becomes true and the game is calm (no dialogue,
  panel, banner, transition or switch). If several are pending, the lowest `priority` goes first. A guide with
  `indoors: true` may also start inside a house, and one with `startPanels: [...]` over those panels (the Remodel
  guide starts over the house card it was triggered by).
- **Old saves**: a save that is already past a guide's trigger when it loads (or its `past(G)`, when the guide has
  one), with no record of that guide, gets a one-time offer card instead: "New guide available: … Show me! / No
  thanks". An offered guide doesn't wait for its trigger moment.
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
- **A phone with a panel up** (R-14, `TutorialUI.place()`): the speech card steps aside, and the objective card covers
  none of the panel's tabs, buttons, ✕ or what the step spotlights. It takes the first place that fits:
  - **the title band**: the free strip of the panel's bottom title band, right of its name (and any header tabs) and left
    of the ✕, by the thumbs (`.tut.band`). The whole card must fit with its lines unclipped; if it doesn't, it tries
    again without the paw and with a ✓ for *Got it!* (`.tight`). It never sits over the spotlit element.
  - **the top strip**: a card along the top, as wide as the room between what the HUD shows at that height (its top-left
    card, the minimap column), with the panel moved down under it (`.tut.strip`; the UI root's `.tut-strip` and
    `--tut-push`; the panel's body scrolls inside, as ever). Its line wraps; a narrow strip goes `.tight` too.
  - A spotlit element the panel's body cuts off (a house card's buttons once the panel moved down) scrolls into view.
  - It is placed again when the panel (and when its opening spring ends), the step, its line, the spotlit element or
    the screen changes, and a band is measured again twice a second. The open panel is the UI's topmost open one, never
    the menu prewarm's closed panel (`ui/prewarm.js` draws one for a frame at opacity 0.004). On 844×390 the Board, the
    Guild and remodel take the band; the narrower Journal, menu, bag, Skills, house card and stash take the strip (as does
    a card with both *Got it!* and *Skip step*, or the Guild on 667×375). A build or decorate palette along the bottom
    leaves the card at the top.
  - *Got it!* and *Skip step* reach 44 px on touch through a taller hit area (`mobile.css`).
  - A tablet keeps the desktop layout (the title on top): the card sits in the panel's title row and covers no tappable;
    on the Board it reaches over the end of the panel's Japanese subtitle.
  - Not covered by the rule (no panel up): on 667×375 Shadow's long gather line wraps tall in the top band and pushes the
    card over half of the gather prompt it spotlights (`cozy-guide-shots.mjs` logs it as a note).
  - QA: `tools/qa/cozy-guide-shots.mjs` (both phones, 844×390 and 667×375: every cozy guide step, and a second pass
    over the other guides' panel steps) and `mobile-ui.mjs` (`guide-*` scenes: a card over each panel a guide opens)
    fail when the card covers one of those (`ui-audit-lib.mjs guideOverlap`).

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
  2. F at the door, with the prompt spotlit (the step waits for `home:enter`).
  3. Inside the cottage (since docs/HOUSING.md: the menu became furniture): the arrow hops from the treasure chest
     (the stash is shared) to the bed (sleep: crops, income, save) to the kitchen stove (cook), then to the door mat
     ("press F, or just walk out"). The step waits for `home:exit`; a reload resumes at step 2.
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
  2. "Face the water and press F" (touch: "tap Fish (or the attack button)"), with the prompt spotlit.
  3. The wait. This first cast is guaranteed to bite after 3.2 s. Nibbles are explained, and an early press gets a
     gentle tip and a "Not yet…" at the float instead of losing the fish (`Fishing.tut`: `biteAfter`, `forgiveEarly`).
  4. The bite: the big "!" and "NOW!" at the float itself (no flash in the middle of the screen: it sat on the float),
     "NOW! Press F" (touch: "Tap the screen") and a 2 s window. A miss brings the fish back (`retryBite`): the step goes
     back to the wait with "a little slow, but it's coming back!", no recast.
  5. The reel: callouts point at the zone, the fish and the meter, from the side of the card away from the hero (the
     roomier side when that one is too narrow; `edge`: they sit just past the card). The fish is an easy crucian carp
     with a wide zone and a slow drain (`zone` 0.42, `drain` 0.4), and the meter has a `floor`: it always lands. The
     card shows the how-to (a thumb, the F key or A pressing; "Hold ▲" / "Let go ▼"). On touch: "Hold a finger anywhere
     on the screen"; on a phone the dock steps aside while the card is up.
  6. The catch, then the Journal button is spotlit (touch: the menu button, then the menu's Journal: the step allows the
     menu, so the guide stays up in it), then the Fish Log tab is spotlit.
  7. Wrap-up: other spots and times, selling at the Hut, cooking. Kero's "catch 3 fish" quest carries on as normal.

- **Make it home (Shadow)** starts the next time you're in the cottage after the house tour (docs/HOUSING.md §7):
  1. Go in (if it was offered outside).
  2. The household jobs: the arrow hops from the bed to the chest, the stove and the workbench.
  3. B: the Decorate button is spotlit (touch: the menu button, then the menu's Decorate; the pad: the menu's Decorate).
  4. Place the cushion: its card in the palette is spotlit (one is given if there's none); touch: slide it, *Set down*.
  5. Pick it up, R, put it down (`decor:move`); touch: *Turn* and *Set down* are spotlit.
  6. A wallpaper: the Wallpaper & Floors tab, then a wallpaper's card, are spotlit (one is given if there's none).
  7. The Home Rating and its tip (R-13): the tip names a favourite in storage ("Try: a pack photo (your favourite)"), and
     the step is to follow it: the All tab, then the favourite's card (a heart on it), are spotlit with the rating, and
     hanging or placing a favourite completes the step (`decor:place`). Got it! is there too. A Pack Photo is given when
     the tip asks for a favourite and none is in storage. On a phone the rating is a chip over the palette.
  8. Wrap-up: Tanu's Trinkets, the workbench, villagers love help decorating (touch: tap *Done*).
  Every line is in the device's words (keys and mouse, touch, the pad).
- **Remodel (Tanu)** starts the first time a mailbox is opened, over the house card:
  1. (Open a mailbox, when replayed.)
  2. The house card: Upgrade / Remodel / Enter spotlit, a callout on the upgrade cost; click Remodel.
  3. The style sets are spotlit: pick one (`remodel:draft { kind: 'set' }`).
  4. The parts are spotlit: change one (`remodel:draft { kind: 'field' }`).
  5. The cost and Remodel / As it was (Got it, or Remodel ends it: `house:remodel`).
- QA: `tools/qa/s17-housing.mjs` sections o and p run both, end to end.
- **Hold to power up! (Shadow)** starts the first time you're back in the village after a Burrow trip (once the house tour
  is done; offered once to older saves) — docs/CHARGE.md §4:
  1. Hold right-click until the ring lights up, then let go (`charge:release` at Stage Ⅰ or more; a tap or a roll gets a
     kind word). With Settings › Charge on hold set to Off, it says where to turn it on and moves on.
  2. Skill points buy charge perks: press K (the Skills button is spotlit).
  3. The Charge card is spotlit, with callouts on the stages and the perks (Got it).
  4. Wrap-up: tap vs hold, a roll drops a charge, hits don't.
  - QA: `tools/qa/s19-charge.mjs` section g runs it end to end.
- **Meet Poe (Poe)** starts in town once Poe has joined (docs/POE.md §5), while you play someone else; offered once
  to older saves past her join (`past`), locked in the Journal until then — docs/POE.md §6:
  1. Tap Tab (the switch button spotlit): the next hero (`done` once the active hero changed and the switch is over).
  2. Hold Tab: the hero wheel (her card spotlit while it's open; the ring if you're her already); a pick through the
     wheel by mouse or number key (`hero:wheel { open: false, id }`).
  3. Poe's binds: left-click fūma slashes, right-click Fūma Throw (catch it), her three trees (Got it).
  4. Wrap-up: the mini portraits; tap Tab next, hold Tab pick (Got it).
  - Steps 1–3 allow switching (`allow.switching`), so the transitions don't pause it.
- **Meet <the Shih Tzu> (him)** (`meetShihtzu`; the title and lines read `CLASSES.shihtzu.name`, the owner's to pick)
  starts in town once he has joined (docs/SHIHTZU.md §5), while you play someone else; offered once to older saves past his
  join, locked in the Journal until then:
  1. Hold Tab: the wheel with four (his card spotlit); pick him (`done` once he's the active hero and the switch is over).
  2. His flail: left-click the three swings, right-click Woeful Wallop (the mouse slots spotlit; Got it).
  3. Press 1: Dripping Paw, a hex that stacks (slot 1 spotlit; Got it).
  4. The Gloom Blanket: hexed foes near him soften every blow (Got it).
  5. Wrap-up: his trees (K spotlit), "Grandpaw sends his regards" (Got it).
  - QA: `tools/qa/s28-shihtzu.mjs` section c runs it end to end.
- **Meet Foosy** (`meetGolden`; the title and lines read `CLASSES.golden.name`) starts in town once he has joined
  (docs/GOLDEN.md §5), while you play someone else; offered once to older saves past his join, locked in the Journal
  until then:
  1. Hold Tab: the wheel with five (his card spotlit); pick him (`done` once he's the active hero and the switch is over).
  2. His lance: left-click the reach combo, right-click Sunbeam Thrust (the mouse slots spotlit; Got it).
  3. Press 1: Bonk Dart (slot 1 spotlit; Got it).
  4. Shadow the dragon whelp: walk a little and he takes off beside you (`done` keyed on the flight: the whelp outfit on,
     airborne, ~0.6 m up, after 3 s on the step so the line can be read: he may be up already).
  5. Wrap-up: his trees (K spotlit), the Whelp Bond (Got it).
  - QA: `tools/qa/s29-golden.mjs` section c runs it end to end.
  - QA: `tools/qa/s20-poe.mjs` section c runs it end to end.

- **The cozy path's guides** (docs/COZY.md §11, §13.6; ROADMAP CZ-11). Every line follows the device (`dv(touch, pad,
  keys)` in guides.js, *F* through `keyHint`): keys, the pad's glyphs and words, touch's "tap" and "the attack button".
  - **Rosie's question** (not a guide: `cozy/cozyGuide.js`): once, on the first calm moment after the house tour with
    burrow1 untouched, a dialogue: "Go yourself, or send Moka?" (`flags.burrowChoice` 'self' | 'crew'). *Send Moka*
    starts the Board guide; either answer keeps burrow1 and lets Shadow's Nose follow.
  - **The Expedition Board (Shadow)** starts from *Send Moka*; a fighter's first look at the board offers it
    (`Tutorials.offer(id)`); old saves past burrow1 get the offer (`past`):
    1. The arrow to the board by the Wayfarer's Post. 2. *F* at it (the prompt spotlit). 3. The job card spotlit (Peek
    into the Burrow, picked for you; Got it). 4. Moka's card spotlit (the step waits for her in the crew). 5. *Send off!*
    spotlit (`expedition:sent`; skippable). 6. The Away view; close the board. 7. The crews chip (Got it).
    A closed board sends steps 3–5 back to step 2.
  - **Shadow's Nose (Shadow)** after the answer (on the crew path after the Board guide); old saves past burrow1 or with
    a gather get the offer:
    1. The nearest full gather spot (the driftwood when it's near; the prompt spotlit at it; `scavenge:gather`). 2. Shadow
    sniffs a spot out (`found`). 3. *Hold F*, let go in the gold (Tap mode: press; `scavenge:dig`). 4. The HUD materials
    (a Perfect dig is cheered; Got it). 5–6. On the crew path: wait for Moka's crew (the chip), then its report spotlit
    on the board (the chip, or the pause menu's Crews on a pad). 7. Wrap-up: Rosie's thank-you on the crew path (said
    with her as the speaker), else Shadow's.
  - **The Adventurers' Guild (Old Hachi)** the first time the Guild stands (old saves with a Guild: the offer):
    1. His door (the arrow; *F*). 2. Today's candidates spotlit: sign one on (skippable; done at once with a roster).
    3. The roster card (callouts: class, morale, power and wage; Got it). 4. The Expedition Board button inside.
    5. A crew of two (skippable). 6. Wages in the morning banner (Got it).
  - **Peaceful paths** (a tip, not a guide: `cozy/cozyGuide.js`): on the first visit to a saved zone, `G.hint('peaceful')`
    and the minimap spotlit for 3 s with a callout on the violet rings (the spotlight only while guides run).
  - On a phone with a panel up the speech card steps aside (as before); the objective card sits in the panel's title
    band, or along the top with the panel moved down (R-14: "A phone with a panel up" above; CZ-11's `.tut.low` moved it
    only when the spotlit element sat under it, and the Board's tabs stayed covered).
  - QA: `tools/qa/s16-tutorials.mjs` sections g–j (`S16_ONLY=ghij`); s16's guide count is twelve; every step shot on the
    desktop and a phone by `tools/qa/cozy-guide-shots.mjs`.

## Hooks added for the guides
- `fishing.js`:
  - `scanAt` and `bankSpotNear`;
  - `this.tut` overrides;
  - the events `fishing:start`, `fishing:cast`, `fishing:nibble`, `fishing:early`, `fishing:bite`, `fishing:reel`, and
    `fishing:end { result: catch | escape | late | early | cancel }`.
- `services.js`: `home:menu` and `home:menuClosed { choice }` (retired with the cottage menu: docs/HOUSING.md).
- `home/housing.js`: `home:enter { type, id, household }`, `home:exit { type }`, `home:use { use }`;
  `flags.homeVisits`, `flags.mailboxOpened`. `home/decorate.js`: `decor:place`, `decor:move`, `decor:surface`.
  `ui/remodel.js`: `remodel:draft { kind: 'set' | 'field' }`.
- `garden.js`: `facingDoor()`. Walking up to the cottage door now means the door, not the bed's corner tile beside it.
- `hud.js`: a Pantry button in the menu bar.
- `combat/charge.js`: `charge:release { id, stage, ok }`, `charge:cancel { id, reason }` (the charge guide).
- `actors/heroes.js`: `hero:wheel { open, id }` (the Meet Poe guide); `ui/heroWheel.js` cards carry `data-id`.
- `game.js`: `G.tutorials`, `G.introJoinPending`; `questTarget` asks the director first. Moka's join toast is skipped
  when her guide will show it.
