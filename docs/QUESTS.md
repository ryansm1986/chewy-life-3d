# Quests as moments (ROADMAP UX-2)

The owner (2026-10-11): "Quests and their objectives seem to go by users without them understanding and reading them.
Any ideas on what we could do to make these more impactful like the player is going on an adventure?" Before UX-2 every
beat was passive: a "New Quest" banner that faded, one small line in the tracker, a "Quest updated" toast and a "Quest
Complete!" banner. Nothing asked the player to stop, and nothing happened where the adventure happened.

The owner's pick, four moments:
1. **The quest card** when a quest is taken (§1). Built (checkpoint 1).
2. **Shadow tells the story** along the way (§2). Built (checkpoint 2).
3. **The place title** when you arrive where the step is (§3). Built (checkpoint 1).
4. **Handing the quest in** to its giver (§4). Built (checkpoint 2).

Later, not in UX-2: a storybook Journal with chapters, the journey on the Travel Map, a livelier tracker.

Code: `world/questMoments.js` (`G.questMoments`: the card queue and its calm moment, the place titles, Shadow's lines,
the hand-in scene and the stamp, the debug actions), `world/questLore.js` (pure: the card's goal and rewards, the areas,
the districts, the hand-in's words, Shadow's line templates; node-tested), `ui/questCard.js` + `ui/quest.css` (the card,
the reward flight; the place title's and the stamp's look), `ui/fx.js` (the banners' `place` and `stamp` styles, `drop`,
`onShow`), `audio/music.js` (`STINGS.place`), `audio/sfx.js` (`quest_stamp`). Hooks in shared files: `world/story.js`
(`start`: the card or the slip instead of the banner; the hand-in: `stepOf`, `handInFor`, `stepsDone`, `handInsFor`,
`handIn`, the migration in the constructor, `talk` plays the scene, `complete` shows the stamp), `regions/village/talk.js`
(a zone villager's closing talk plays the scene), `world/tutorials.js` (`calm`: a waiting card goes first), `game.js` (the
install, the QA's quiet switch, the frame update, Shadow's tips wait for a card), `ui/ui.js` (the panel; a reward item
flies from the giver), `ui/padNav.js` (the pad's first focus), `cozy/expeditionRun.js` + `ui/expeditions.js` (a crew's
report says the giver wants to hear about it), `world/guides.js` (the Nose guide's crew wrap-up: Shadow sends you to
Rosie). It reads `world/mapData.js` (the People list's "where is this person now") and doesn't change it.

## 0. The data: what a quest writes
A quest in `world/story.js` `QUESTS` or `world/zoneQuests.js` `ZONE_QUESTS` adds two fields next to its `desc`:

```js
king: { title: 'The King of Squish', giver: 'rosie',
  hook: "King Mochi stole every mochi for the spring festival! He's hiding at the bottom of the Mossy Burrow, crown and all.",
  goal: ['Find King Mochi', 'the Mossy Burrow, floor 2'],
  desc: '…', steps: [ … ], reward: { … }, next: 'shrine' },
```

- **`hook`**: one or two short lines in the giver's own voice, what they'd say to you. 20 to 130 characters (test-rpg
  checks it). It is the card's quote; `desc` stays the Journal's longer note. Lines are written to Chewy and go through
  `heroText`, so "Chewy" becomes whoever you play.
- **`goal`**: `[action, place]`: what to do, as a verb ("Find King Mochi", "Rescue Kome", "Shoo 8 yokai, bring back 3 Mochi
  Jelly"), and where ("the Mossy Burrow, floor 2", "the koi pond in Pond Park"). Up to 56 and 44 characters. Without one,
  the card makes it from the main step (`questLore.js goalOf`: the last step that isn't the turn-in talk, its text without
  a trailing "(…)", and where it is).
- **`lines`**: Shadow's lines at the quest's places, `{ door, arrive, near, boss, home }`; any of them may be a list by
  step index (`arrive: ["floor 1's line", "the boss floor's line"]`; `null` for a step that has none). Up to 110
  characters each (test-rpg checks). §2.
- **`handIn: { text }`**: the hand-in step's words ("Bring the festival mochi home to Rosie"; without it "Bring the news to
  <giver>"). `handIn: false` opts a quest out (the welcome: its talk is the intro). §4.
- **`thanks`**: the giver's line when you hand it in (zone quests always had theirs). §4.

Every story quest and every zone quest has both (test-rpg's QUEST MOMENTS section fails a quest without them).

## 1. The quest card (built)
**When**: `Story.start(id)` (not silent) asks `G.questMoments.accepted(id, def)`. A story, zone or villager quest
(Kero's rod, Usagi's sprouts, Rosie's taste test) queues its card in `state.quests.cards` (saved: a card taken just before a
save opens after the load). The card opens on the first calm moment, 0.6 s of it:
- never in a fight: on a dungeon floor, Shadow's calm clock (`G.lead.calmT`: his fight, an aggroed foe within 14 m of the
  hero, the hero hurt) must be 2 s calm, no boss awake, and no aggroed foe within 14 m;
- never over a dialogue, a panel (the den picker, the Board, the bag…), a guide's offer card, a banner, a transition, a
  scene (Moka's arrival, a hero switch, a celebration, `controlLocked`), build or decorate mode, fishing or a dig;
- never over one of Shadow's one-line tips (his words first), and his tips wait while a card waits (`game.js hintHold`);
- the guides wait for a waiting card (`tutorials.js calm`), so a new game reads: Rosie's welcome, Moka's arrival, the
  "Something Squishy" card, then the guides.
A quest done before its card could show drops it (its "Quest Complete" says so).

**What it shows** (`ui/questCard.js`, a centre panel, `.p-qcard`): a storybook page (cream paper, the book's pages showing
under it, a silk bookmark):
- the giver in an oval illustration (their 3D portrait, `G.portrait(id)`, on a watercolour wash: rose for Blossom Hollow,
  sage for a zone village) with their name on a ribbon;
- the kicker ("A new quest 冒険"; a zone villager's "A favour お願い"), the title, the hook in quotes;
- the goal: a pin, the action in bold, the place under it;
- the reward as chips (`questLore.js rewardList`): coins, XP, skill points, "Treasure" for the unique, materials,
  potions, pantry goods and recipes by their own icons, furniture by name, friendship; each with a tooltip;
- "Shadow knows the way!" when pressing the button will set him leading, and **Let's go!** with its key: Enter (keys),
  the pad's A glyph (the pad), nothing on touch.

**Pressing it**: Enter or F (the interact key), the pad's A (padNav's first focus is the button; the glyph footer shows A
Select · B Back), or a tap (a 44 px target on a phone). Esc and B close it too (read, no lead). The press is consumed, so it
uses nothing in the world. **"Let's go!" sets Shadow leading the way** to that quest (`G.lead.toggle(id)`: its pointer
follows it) when Settings › *Shadow leads the way* is Quests (the default) or Always, the quest points somewhere now, and no
guide is running (a guide's steps lead themselves). At Off he stays.

**Fit**: a Panel, so CT-10's fit and the panelFit audit cover it. 664 px wide at the UI scale (1920×1080: 797 px; the
Deck: 610 px); on a phone 640 px at the menus' 0.86 with a smaller picture (it fits 844×390 without scrolling); the iPad
keeps the desktop layout. The header and ✕ are hidden: the button is the way out.

**Repeatable requests** (a villager's "Need any help?"): a card would nag, and you have just read their ask in the
dialogue, so they get a **compact slip** instead: a toast in the toast column with the giver's face, "New request: Bring 4
wood to Kero" and the reward ("Kero · 52 coins · 50 XP · friendship"). It never stops play. Errands are the cozy path's
crews' work (docs/COZY.md §4.7), not quests: no card, no slip.

**The QA's quiet sessions**: `?nointro` without `?qcard` (or `?nocard`), remembered for the tab as the guides' switch
is, keep the old "New Quest" banner and no cards, so the flows that never meet a guide never meet a card either.
`tools/qa/s46-quest-moments.mjs` and prod-smoke's `quest` case run with `?qcard`. The place titles show in every session.

## 2. Shadow tells the story along the way (built)
At the quest's places Shadow says a line about it: the quest's own (`lines`), or his template for the step's type
(`questLore.js LINE_TEMPLATES`: kill, collect, find, rescue, floor, dungeonFloor, boss, tier, reach, talk, villageSaved,
any), with `{giver}`, `{npc}`, `{item}` and `{boss}` filled in. The beats (`questMoments.lineTick`, four times a second):

| Beat | When | Example (the King of Squish) |
|---|---|---|
| `door` | within 7 m of the step's dungeon's way in: the Burrow door (a den's step), a zone dungeon's gate (in its zone) | "It smells like stolen mochi down there… Sweet, sticky, stolen mochi." |
| `arrive` | on entering the step's area, right after its place title (§3) | "He's on this floor, I just know it. Everything smells like mochi!" |
| `near` | within 10 m of a find's or a rescue's mark on its floor (on the screen by then) | "Kome! She's in that cage! Let's get her out!" |
| `boss` | the step's boss on the screen within 26 m, or within 15 m, before it notices you (at 9 m) | "Sniff… sugar and crown polish! King Mochi is just ahead. Ready when you are." |
| `home` | the objective done, on the way back (the hand-in, or a last talk to the giver) | "We got the festival mochi back! Rosie's going to be so happy!" |

**How he says it**: his tip card (his face, his blue, "Shadow", 6 s, in the toast column), a bark and a bark pose with a
little sparkle (a heart for the way home) over him (`Lead.say`). Normal priority, so the next toast doesn't push it out
before it's read.

**When**: at most one line per beat and step (the quest's record keeps `sl`, saved). A line waits (6–25 s by beat, the way
home up to 10 min) for a calm moment and is dropped if its moment passes (you left the door, the step moved on):
- never in a fight (Shadow's calm clock, a boss awake, an aggroed foe near): a line up when a fight starts steps aside;
- never over a guide, a dialogue, a banner (the place title goes first), a card (waiting or open), a panel, a transition,
  a scene, build or decorate, fishing or a dig, or another of his tips; 4 s between two lines. His next one-off tip waits
  for a line that's due (`speaking`), so a new game's back-to-back tips don't crowd a line out;
- a place's line is said only where it was due (the door's line never on the floor below; the way home anywhere).
- **The cozy path**: lines only fire where you are, so a crew's route gets none; a quest a crew finished gets no way-home
  line (he wasn't there): Rosie's hand-in has a line about the crew instead (§4).
- Repeatable requests get none.

**Every story quest with a place and every zone quest has its own lines**, the four den quests (King of Squish, Umbrella
Trouble, Oni's Kitchen Nightmare, Nine Tails of Moonlight) all five beats; the village quests (homes, lanterns, the shrine,
the hot spring, Kero's rod, the sprouts, the taste test) their way-home line. The full list: §8.

## 3. The place title (built)
**When**: you enter the area the current step targets (`questLore.js stepArea`):

| Step | Its area | Example |
|---|---|---|
| `floor` (a den's floor n), `dungeonFloor` | the dungeon, any floor | "Mossy Burrow · Floor 1 of 2 · Find the stairs down to floor 2" |
| `boss` (a den's or a zone dungeon's) | its last floor | "Mossy Burrow · Floor 2 of 2 · Defeat King Mochi" |
| `kill`, `collect` Mochi Jelly | the dungeon (an unfiltered kill: any of the Burrow's dens) | "Mossy Burrow · Floor 1 of 2 · Defeat yokai in the Burrow" |
| `find`, `rescue` with a floor | that floor | "Bamboo Depths · Floor 2 of 2 · Rescue Kome" |
| `villageSaved`, a zone `kill` / `boss`, `reach` in a zone | the zone | |
| `talk` to a zone villager (the turn-in) | their zone; the title names their village | "Takemori Village · 竹守村 · Bring the ledger back to Chiku" |
| `talk` / `deliver` to a Blossom Hollow villager, and a hand-in (§4) | the villager where they are now (the map's People lookup): within 14 m of them, or in the district they're in; the title names their spot in the map's words | "Rosie's Treats · さくら村 · Bring the festival mochi home to Rosie" |
| `decorate` | their room | |
| `reach` at home | the spot's district | |
| build, grow, cook, fish, `pop` | none | |

Where you are (`areasHere`): a dungeon floor is `dun:<id>:<floor>`, `dun:<id>` and, for a den, `dun:burrow`; a zone
`zone:<id>`; Blossom Hollow your district (`districtAt`: the plaza is the Civic Core's, the koi pond Pond Park's, Shrine
Hill its own; else the nearest lot's within 16 m, else the nearest district label within 30 m); a room its owner.
`questMoments.placeTick` checks four times a second; an area counts as entered when it wasn't in the last check, and every
arrival (a floor, a zone, home, a room: `mode:changed`, after Story has moved a step the arrival completed) counts as
entering all of it.

**Once per step and area**: the quest's record keeps what it showed (`q.tt = ['1|dun:mossyBurrow:2']`, saved). Back on
the same floor with the same step: nothing. Requests never get one.

**What it shows**: a banner of style `place` (`ui/fx.js`, `ui/quest.css`), in the area banner's spot: the quest's title
on a little gold ribbon, the place's Japanese name, the place in the storybook letters, a gold and pink brush stroke, and
the floor and the step. About 2.6 s, then it drifts up and fades. No rays, no tint, no glow: text with its ink outline over
the world, as the area banner. With a soft sting (`STINGS.place`: a harp run, two koto notes, a short flute phrase over a
pad, a rin; the music ducks under it). On an arrival it **takes the area banner's place** (`banners.drop('area')` behind
the iris; it shows once the screen opens, since a first floor's build can outlast a banner's life behind it).

**Never over**: a dialogue, the den picker, any panel or a transition (it waits while you stay in the area, then shows); a
boss's card or its Victory (a boss's card coming drops a place title at once: `Banners.show`). On touch the toasts (top
centre) step aside while it's up; on a phone it sits higher (10%) and smaller, clear of the hero.

## 4. Handing the quest in (built)
**The step**: when a quest's steps are all done (`Story.stepsDone`) and its giver is a villager you can reach (Blossom
Hollow's, or a zone's: `handInFor`), it doesn't complete: it waits (`q.handIn = 1`, saved) and its current step becomes the
hand-in, a talk to the giver (`Story.stepOf` → `handInStep`: "Bring the festival mochi home to Rosie"), which:
- shows in the tracker and the Journal as the quest's last step; "Quest updated: …" says so;
- puts Rosie's "!" over her (`markerFor`) and the "need" on her;
- points the arrow, the minimap pin and **Shadow's lead** (`lead: true`) at the giver: in a dungeon or a zone the way out
  (the Wayfarer's Stone), at home the giver where they are now, by the map's People lookup (`mapData.js personSpot`: their
  door while they're indoors; `questMoments.giverTarget`);
- gets its place title near them (§3: within 14 m of where they are now, or entering the district they're in): "The King
  of Squish · Rosie's Treats · Bring the festival mochi home to Rosie" (their spot in the map's words, `giverPlace`);
- gets Shadow's way-home line.
Which quests: every story quest whose last step isn't already a talk to its giver (Something Squishy, A Home for Everyone,
Lights of Blossom Hollow, the King of Squish, A Shrine for Wishes, Umbrella Trouble, Hot Spring Dreams, Oni's Kitchen
Nightmare, Pond Guardian's Apprentice, First Sprouts, Nine Tails of Moonlight). Those whose last step talks to the giver
(the Taste Test, every zone quest) just get the scene. Not the welcome (`handIn: false`: the intro is it) and not a
villager's daily request (repeatable: it finishes on the spot with the stamp, its reward from their paws when you hand
the goods over).

**The scene** (`questMoments.handInScene`, from `Story.talk` and `regions/village/talk.js`; a hand-in is its own
conversation, the menu is there the next time you talk): for each quest to hand in, the giver turns to you, hops (the
Animator's `happy`), hearts over them and a sparkle of pink (the `gift_loved` sound); their line (a line about the crew
first, if one did it, then `thanks`); then `Story.handIn` completes it (`complete({ from })`):
- the rewards are given as always; the coins fly from the giver's head into the coin counter, the materials, potions,
  pantry goods, recipes and furniture into the bag (`ui/questCard.js rewardFly`); a unique item flies from them as itself
  (`ui._flyFrom` → `ui.pickup`);
- the **"Quest complete" stamp** (`completed`: a banner of style `stamp`, 3 s, `ui/quest.css`): a small storybook card
  at the top (the quest's title, "Rosie says thank you!", the reward chips) with a red hanko (完了 · DONE!) pressed on at an
  angle, with the `ui_quest_done` turn and a soft wooden thunk (`quest_stamp`). It replaces the "Quest Complete!" banner
  everywhere (any completion: requests, a decorate ask, an old record). No rays, no flash. It waits behind a dialogue (the
  banners' hold) and never blocks play. On touch the toasts step aside under it.
- the next quest (`next`) starts 2.5 s after, as before, so its card comes after the stamp.

**Crews** (docs/COZY.md §3.1, §4.5): a crew that finishes a quest's last fight step leaves it waiting for your hand-in
(`completeStep` → `stepsDone`); the report says "Something Squishy: done! Rosie wants to hear all about it."; the next
time you talk to the giver their first line is about the crew ("Moka came by and told me the whole story! You sent the
best friends in the world."), then their thanks, the reward and the stamp. It never blocks the story: the hand-in is
always there to do (the arrow and Shadow point at the giver), and the next quest starts after it. The crew routes stay as
they were (the hand-in isn't a crew step).

**Unreachable givers**: a quest that opts out, a request (anything kept in `quests.requests`), or a giver who isn't a
villager completes as it always did.

**Saves** (`Story` constructor, every load): an active quest past its last step (done, never handed in: no 0.7.0 save
has one, since completion was immediate, but a hand-edited or debug save might) waits for its hand-in if its giver can
take it, else completes as before; a hand-in flag on a quest that isn't past its steps is dropped. A save made while a
hand-in waits keeps it. Old saves mid-quest go on as before (the hand-in is after their last step). s46 k) loads a real
0.5.1 save.

## 5. Adding a quest with its moments
1. Write the quest as before (`steps`, `reward`, `next`).
2. Add `hook` (the giver's words, short) and `goal` (`[action, place]`).
3. Run `node tools/test-rpg.mjs` (the QUEST MOMENTS section checks the fields and that each travel step has an area).
4. Look at it: the debug menu's Quests tab, *Show the quest card* (any active quest), or `node tools/qa/quest-shots.mjs`.

## 6. Debug (docs/DEBUG.md, the Quests tab)
- *Show the quest card*: an active quest's card, now (no calm wait).
- *Cards on accept*: on, or off (the old banner), for the session.
- *Show a place title here*: the first running quest's title, with where you are.
- *Forget the titles shown*: each step shows its place titles again.
- *Say Shadow's line* (door · arrive · near · boss · home): the first running quest's line for that beat, now.
- *Forget Shadow's lines*: he says each again at its place.
- *Finish this step* (a running quest): it moves on; its last step leaves it waiting for its hand-in.
- *Hand it in now* (a running quest): its steps finished, then the giver's scene (in Blossom Hollow or their zone village),
  else straight in.

## 7. QA
- s46 h)–k): Shadow's lines (the Burrow door, both floors after their titles, the boss in sight, once each, a line held
  in a fight then said, a rescue's cage, a zone dungeon's gate); your hand-in (the step, the pointer and Shadow, Rosie's
  "!", her place title, F at her: her hop, hearts and thanks, the reward flying, the stamp, no banner, the next card); a
  crew's hand-in (no way-home line, her line about the crew, the chain going on) and a zone quest's (Chiku); the save
  migration (a real 0.5.1 save, a record past its last step, a reload with a hand-in waiting).
- Suites changed for the hand-in (the quest now waits for its giver, so they hand it in): s3 (each boss quest waits,
  points the way out, then completes), s11 (the unique reaches a full bag once handed in), s15 (Kero, Usagi, Rosie's taste
  test), s16 g) (the Nose guide's crew wrap-up, then Rosie's hand-in), s37 a) (the cozy story: Rosie hears about each
  crew), s42 c) and e) (the King of Squish, yours and a crew's), prod-smoke `quest` (the hand-in and the stamp).
  A hand-in opens its dialogue a beat after the talk (the giver's hop, `HOP_BEAT_MS`): `lib.mjs drainDialogue` waits
  through it (`questMoments.handing`), and a check that reads the giver's words waits for the dialogue.
- `tools/qa/s46-quest-moments.mjs` (in run-all): a) the card on the keyboard (Enter, F; the lead at Quests and Off; the
  fit); b) queued in a dialogue, build mode and a fight, dropped when done first, kept over a reload, the guides waiting;
  c) a request's slip; d) the quiet QA sessions' banner; e) the pad on the Deck; f) touch on a phone; g) the place titles
  (a den's two floors, once per step and area, a boss's card first, Pond Park walked into past a dialogue, Takemori
  Village). `S46_ONLY=abg` runs some.
- test-rpg "QUEST MOMENTS": every quest's hook and goal, the rewards' order, the areas, the districts.
- prod-smoke `quest`: the built bundle's card and place title.
- The look review: `node tools/qa/quest-shots.mjs [card] [place] [lines] [handin] [desktop deck phone ipad]` →
  `tools/qa/tmp/ux2/` (`sheet-card*.png`, `sheet-place*.png`, `sheet-lines.png`, `sheet-handin.png`).

## 8. Every line (the writers' list)
The hooks are in the quests' `hook` fields (§0); the hand-in words, thanks and Shadow's lines are below as written
(`world/story.js`, `world/zoneQuests.js`). Crew lines (the giver's first line at a crew's hand-in, `questMoments.js
CREW_LINES`): Rosie "{crew} came by and told me the whole story! You sent the best friends in the world." · Kitsune
"{crew} brought word from the deep places. A good leader sends good friends." · Kuma "{crew} came in covered in dust and
very proud. Good friends, those." · Kero "{crew} told me everything. Ribbit. Knowing whom to send is a pond guardian's
skill too." · Usagi "{crew} hopped by with the news! Hop hop!" · anyone else "{crew} came back with the news! Thank you
for sending them."

**Shadow's templates** (`questLore.js LINE_TEMPLATES`, for a beat a quest has no line of its own for):
- door: "Sniff sniff… something's down there. Stay close, okay?"
- arrive, by the step's type: kill "Yokai everywhere! Let's shoo them out for {giver}." · collect "Mochi Jelly wobbles when
  the squishy ones bounce. Let's find some!" · find "Sniff… I can smell {item} on this floor!" · rescue "{npc} is on this
  floor! I can smell them. This way!" · floor, dungeonFloor "The stairs down are somewhere on this floor. Down we go!" ·
  boss "Something big is snoring on this floor… Ears up!" · tier "Spooky lanterns tonight… Stay close, okay?" · reach
  "Nearly there! It's just ahead." · talk "I can smell {npc} from here! They're close." · villageSaved "The village is
  just up the trail. Let's help them!" · anything else "We're here! Let's do this."
- near: find "There! I can see {item}!" · rescue "{npc} is right over there! Let's get that cage open!" · else "It's right
  here!"
- boss: "{boss} is just ahead! Ready when you are."
- home: "{giver}'s going to be so happy! Let's go and share the news."

**Story quests**
- **Something Squishy** (burrow1, rosie): hand-in: Bring the Mochi Jelly to Rosie · thanks: "Mochi Jelly! And not a single squeak left! You're the bravest pup in Blossom Hollow. Shadow too, of course." · door: "Sniff sniff… strawberries and trouble down there. Stay close!" · arrive (step 1): "Squeak! Squeak! There they are, the squishy ones! Let's shoo them out!" · arrive (step 2): "Mochi Jelly! It wobbles when they bounce. Three for Rosie!" · home: "Mochi Jelly for Rosie! I won't eat any. Probably."
- **A Home for Everyone** (homes, rosie): hand-in: Tell Rosie the new friends are home · thanks: "Look at all the new faces! Blossom Hollow feels like a real village now. Thank you!" · home: "Nine homes! Blossom Hollow is getting so big. Let's tell Rosie!"
- **Lights of Blossom Hollow** (lights, rosie): hand-in: Show Rosie the new lanterns · thanks: "Lanterns everywhere! Now nobody gets lost on the way home. Not even Shadow at three in the morning." · home: "So many lanterns! Nobody will get lost now, not even me. Let's show Rosie!"
- **The King of Squish** (king, rosie): hand-in: Bring the festival mochi home to Rosie · thanks: "The festival mochi! You got it all back! I could hug you. I'm going to hug you." · door: "It smells like stolen mochi down there… Sweet, sticky, stolen mochi." · arrive (step 1): "The King's chamber is on the second floor. I can smell the festival mochi from here!" · arrive (step 2): "He's on this floor, I just know it. Everything smells like mochi!" · boss: "Sniff… sugar and crown polish! King Mochi is just ahead. Ready when you are." · home: "We got the festival mochi back! Rosie's going to be so happy!"
- **A Shrine for Wishes** (shrine, kitsune): hand-in: Tell Kitsune the shrine stands · thanks: "The shrine stands, and the lanterns hum a happy song. You have done well, little one." · home: "A real shrine! Kitsune's tails are going to swish all day. Let's go tell her!"
- **Umbrella Trouble** (umbrella, rosie): hand-in: Bring the news to Rosie · thanks: "No more umbrellas at my window! I can finally sleep without something licking the glass." · door: "Pitter-patter… umbrellas, hopping around down there. They'd better not lick ME." · arrive (step 1): "Torii gates and paper lanterns… The Umbrella Lord lives on the floor below!" · arrive (step 2): "Umbrellas everywhere! Their lord is close. Keep your ears dry!" · boss: "Flap, flap… the big umbrella is just ahead! Let's fold him up!" · home: "No more window-licking umbrellas! Rosie's going to bake us something, I can feel it."
- **Hot Spring Dreams** (onsen, kuma): hand-in: Tell Kuma the hot spring is ready · thanks: "A hot spring, all ours! My paws are crying happy tears. Have a melon-pan. Have two." · home: "A hot spring! Kuma's sore paws are saved. Let's tell him, he might give us honey!"
- **Oni's Kitchen Nightmare** (oni, rosie): hand-in: Bring the dumplings home to Rosie · thanks: "Every dumpling, home safe! I'll make a big pot of soup for everyone. Even the oni, if he says sorry." · door: "Mmm… dumplings! And smoke. And something BIG chopping vegetables. Let's go!" · arrive (step 1): "Pots bubbling everywhere… The Oni's kitchen is one more floor down!" · arrive (step 2): "I can smell every stolen dumpling in town. The chef's here somewhere!" · boss: "Chop, chop, chop… Chef Gorobei is just ahead, with a cleaver AND a ladle. Careful!" · home: "The dumplings are coming home! Rosie's going to hug everyone."
- **Pond Guardian's Apprentice** (keroRod, kero): hand-in: Show Kero your catch · thanks: "Three fish. Ribbit. You may yet become a pond guardian. Keep the rod; the koi approve." · arrive (step 1): "There's the koi pond! Kero's by the water. I can smell frog." · home: "Three fish! Let's show Kero, he'll ribbit so proudly."
- **First Sprouts** (firstSprouts, usagi): hand-in: Show Usagi your harvest · thanks: "Your very first harvest! Hop hop HOP! These are for you, and I just know Rosie wants a taste of whatever you cook!" · home: "Our very own veggies! Usagi's going to hop so high. Let's show her!"
- **Taste Test** (tasteTest, rosie): thanks: "Mmm! You're a natural! Here's my strawberry mochi recipe. Don't tell Kuma I gave it away." · home: "Three dishes, and they all smell SO good. Quick, to Rosie, before I taste-test them myself!"
- **Nine Tails of Moonlight** (tails, kitsune): hand-in: Tell Kitsune that Tamamo sleeps · thanks: "Tamamo sleeps, and the moon shines softly again. The old songs will speak of you, little one." · door: "The deepest den… It smells like moonlight and old, old magic. I'm brave. I'm brave!" · arrive (step 1): "Crystals everywhere, humming… Tamamo's sanctum is one floor further down." · arrive (step 2): "The moon is shining down here somehow. She's close. Let's be gentle." · boss: "Moonlight, just ahead… Tamamo is there, and she's so sad. Let's help her rest." · home: "Tamamo is calm, and the moon feels warm again. Kitsune will be so proud of you!"

**Zone quests**
- **Roots of the Grove** (tk_roots, tk_sasa): thanks: "Two floors of them? Goodness. The grove remembers you now — take this lantern, it was my grandmother's." · door: "The old caves under the grove… They smell of bamboo shoots and bad manners." · arrive: "Grandma Sasa wants to know how deep it goes. To the stairs!" · home: "Two floors of yokai! Let's tell Grandma Sasa. She'll pat my head. Probably."
- **The Missing Ledger** (tk_ledger, tk_chiku): thanks: "My ledger! And only a little chewed. Here — shoots from the back room, the good ones." · door: "Chiku's ledger is in there somewhere. I can smell ink and nervous coins!" · arrive: "Sniff… paper and ink! One of the big yokai has Chiku's ledger." · near: "There! That big blue one is clutching the ledger!" · home: "We got the ledger! Only a little chewed, and it wasn't me. Let's take it to Chiku!"
- **The Wind Scroll** (tk_windScroll, tk_kazemaru): thanks: "You move quietly for one so fluffy. Poe chose her friends well. Keep the bench; a sensei needs only the floor." · door: "Swish, swish… sickle-weasels. Let's teach them manners, like Master Kazemaru said!" · arrive (step 1): "Kamaitachi! Twelve of them, and every one so rude." · arrive (step 2): "The Wind Scroll is on this floor. I can smell old paper and silence." · near: "That one has the scroll! Get it back!" · home: "The Wind Scroll is safe! Master Kazemaru might even smile. A tiny bit."
- **The Missing Cook** (tk_kome, tk_fuku): thanks: "Kome! You're home! …Ahem. Thank you, truly. Have some of her rice balls — she made them before she even took her apron off." · door: "I've got Kome's scent: rice and miso! She's in there. Follow me!" · arrive: "She's on this floor! Rice, miso and… sniffles. Let's hurry!" · near: "Kome! She's in that cage! Let's get her out!" · home: "Kome is safe! Let's tell Okami Fuku. Maybe there'll be rice balls. For me too?"
- **Heartwood** (tk_heartwood, tk_takumi): thanks: "Ohh, look at that grain. I'll make you something proper with this. Here, this planter came out too nice to sell." · door: "Golden heartwood… Takumi says the yokai hid it in their chests." · arrive: "The chests are on this floor. Let's open every single one!" · home: "Three pieces of heartwood! It smells of honey and sunshine. Let's bring it to Takumi!"
- **Wings Over the Grove** (tk_tengu, tk_sasa): thanks: "Listen… do you hear it? The bamboo is singing. Takemori owes you everything, little one." · door: "Master Tengu is at the very bottom. Proud, old and very rude, Grandma Sasa said." · arrive: "Feathers everywhere! The Tengu's nest is down here somewhere." · boss: "Feathers on the wind… Master Tengu is just ahead! They say his nose is even bigger than mine!" · home: "The grove is singing again! Let's go and tell Grandma Sasa."
- **Under the Red Hills** (ak_roots, ak_kaede): thanks: "Two floors of them… The roots remember everything, child. Take this wreath — the leaves on it never fall." · door: "Under the fallen maple… It smells of old leaves and straw soldiers." · arrive: "Elder Kaede asked how deep they go. To the stairs!" · home: "Two floors of straw soldiers! Elder Kaede has to hear about this."
- **The Lost Apprentice** (ak_tobi, ak_ochiyo): thanks: "Tobi. You are home. …Go and wash, you smell of mushrooms. Thank you, truly — take this tea set. It has never once been dropped. Not by me." · door: "I've got Tobi's scent: tea leaves and grumbling. This way!" · arrive: "Tobi's on this floor! I can hear him complaining already." · near: "There he is, in the cage! Still complaining. Let's get him out!" · home: "Tobi's safe! Ochiyo will be calm about it. Very calm. Let's tell her!"
- **Benji's Lucky Charms** (ak_charms, ak_benji): thanks: "My charms! Lucky, lucky, lucky — oh, this one's chewed. Still lucky. Here, a stool. Genuine acorn. Mostly." · door: "Benji's lucky charms are in there. Lucky for us!" · arrive: "The big yokai have the charms. I can smell them, they smell lucky!" · near: "That big one's wearing a charm! Get it!" · home: "Three lucky charms! I feel luckier already. Let's take them to Benji!"
- **Straw Soldiers** (ak_straw, ak_inaho): thanks: "Taro says thank you. Hanako says thank you too, but quieter. Here — rice from the top terrace, the sweetest." · door: "Mean scarecrows… Let's make the terraces safe for Taro and Hanako!" · arrive: "Kakashi everywhere! Fifteen of them, and all so grumpy." · home: "The terraces are safe! Inaho's going to beam. Let's go and tell her."
- **Golden Chestnuts** (ak_chestnuts, ak_yae): thanks: "Golden as the sunset! The whole inn will smell of chestnut rice tonight. Take this lamp — it glows like a harvest moon." · door: "Golden chestnuts! Okami Yae's chestnut rice! Let's go, let's go!" · arrive: "The chests are on this floor. I can smell roasted chestnuts!" · home: "Five golden chestnuts! Chestnut rice tonight! Let's take them to Okami Yae."
- **The Tanuki Lord** (ak_danzaburo, ak_kaede): thanks: "The hills are quiet, and the leaves fall only for the wind. Akane will tell this story for sixty autumns more." · door: "Danzaburō sits at the very bottom. He used to be a good neighbour…" · arrive: "Leaves and sake… The old tanuki lord is down here somewhere." · boss: "Sake and leaves, just ahead… Danzaburō is close! Let's remind him of his manners." · home: "The hills are quiet again! Let's tell Elder Kaede."
- **Where the Tide Breathes** (sk_tide, sk_kaizo): thanks: "Two caves deep, eh? You've got sea legs after all. Take these floats — they came off my old ship. They still remember the waves." · door: "The caves breathe in… and out. And they smell of crab!" · arrive: "Captain Kaizo wants to know what's in the second cave. Onward, matey!" · home: "Two caves deep! Let's report to Captain Kaizo. Can I be first mate?"
- **Man Overboard** (sk_kaito, sk_funaki): thanks: "…Good. Good. Kaito, hold this plank. — Thank you. Take the timber; I won't need it, I'm building a boat that doesn't sink with deckhands in it." · door: "I've got Kaito's scent: salt and sawdust. Follow me!" · arrive: "Kaito's on this floor! I can hear him shouting about Umibōzu." · near: "There's Kaito! Let's get that cage open!" · home: "Kaito's safe! Let's tell Funaki. He'll say nothing. Very happily."
- **The Shining Catch** (sk_scales, sk_saba): thanks: "Look at them shine! Clear as a happy fish's eye. Here — sea bream for luck, and a platter, because heroes should eat well." · door: "Pearl-scales… shiny, shiny! The big yokai in the first cave have them." · arrive: "Something's shimmering on this floor. Pearl-scales!" · near: "That big one is all sparkly! It has a pearl-scale!" · home: "Three pearl-scales! Saba's display is going to dazzle. Let's go!"
- **Sea Glass** (sk_glass, sk_nami): thanks: "Blue! And amber! And… green. It's a really nice green. Here, a shell lamp — it glows like the bay at night." · door: "Sea glass in the chests! Any colour but green… unless it's a really nice green." · arrive: "The chests are on this floor. I hope there's blue!" · home: "Five pieces of sea glass, even a nice green one! Let's take them to Nami!"
- **Crabs Under the Stilts** (sk_crabs, sk_shinju): thanks: "Not a single crab this morning. The guests slept like pearls. Take this rug — it's the colour of the bay at noon." · door: "Grumpy crabs with faces… they come from in there. Let's go!" · arrive: "Heike-gani! Fifteen grumpy faces. Pinch them before they pinch us!" · home: "No more crabs under the stilts! Let's tell Okami Shinju."
- **The Sea Monk** (sk_umibozu, sk_kaizo): thanks: "Listen to that — the tide's breathing slow again. You've a place on my ship any day, sailor." · door: "Umibōzu is down there, big as a storm cloud. My tail's a little shaky." · arrive: "The tide's rumbling… The sea monk is on this floor!" · boss: "The water's rumbling… Umibōzu is just ahead, and he's HUGE! Let's tuck him in!" · home: "The tide's breathing slow again! Captain Kaizo will want to hear everything."
- **The Cold Below** (yk_caverns, yk_shirayuki): thanks: "Ice that hums… yes. Just as my grandmother said. Take this bucket; it's cypress, and it smells of every bath I've ever loved." · door: "Brrr! The cold comes from in there. Let's be brave and fluffy." · arrive: "Granny Shirayuki asked how deep the ice goes. Two halls down!" · home: "Ice that hums! Let's tell Granny Shirayuki. She'll know what it means."
- **The Hiccuping Apprentice** (yk_hokuto, yk_tetsu): thanks: "…Hokuto. Go and warm your paws. — Thank you. Here: crystal and stone, the best I have. Bring them back and I'll fold you something." · door: "I've got Hokuto's scent: soot and snowflakes. Follow me!" · arrive: "Listen… hic! Hic! Hokuto's on this floor!" · near: "There he is, hiccuping in a cage! Let's get him out!" · home: "Hokuto's safe! No more hiccups… almost. Let's tell Tetsu."
- **Snow Ore** (yk_ore, yk_tetsu): thanks: "Hear it ring? That's good ore. Take some of my stock — fair trade. The forge is yours to use." · door: "Snow ore, cold as a grudge. Tetsu needs four pieces!" · arrive: "The chests on this floor smell of frost and metal." · home: "Four pieces of snow ore! Hear it ring? Let's take it to Tetsu."
- **The Mitten Thieves** (yk_mittens, yk_mikan): thanks: "My mittens! A little damp, still fluffy. Here — a noren for your door and honey for your buns. Warm paws, warm heart!" · door: "Mikan's fluffy mittens are in there! On yokai paws!" · arrive: "The big yokai on this floor are wearing mittens. So unfair!" · near: "That one's wearing Mikan's mittens! Get them back!" · home: "Three pairs of mittens, a little damp, still fluffy! Let's take them to Mikan."
- **Too Many Snowmen** (yk_snowmen, yk_yuzu): thanks: "Not a single snowman in the water! The monkeys are delighted. Here, a little tub — for soaking at home." · door: "Snowmen that sit in hot baths… They come up from in there!" · arrive: "Yuki-daruma! Twelve of them. Let's roll them back where they belong." · home: "No more snowmen in the baths! The monkeys can soak again. Let's tell Yuzu!"
- **The Snow Woman** (yk_yukionna, yk_shirayuki): thanks: "Feel that? The steam is rising straight. Sixty-one thousand, two hundred and thirteen snowfalls — and the warmest one of all." · door: "Yuki-onna sleeps at the bottom… only she isn't sleeping. Let's be gentle." · arrive: "Snowflakes falling indoors… She's on this floor." · boss: "It's getting colder… she's just ahead. Not wicked, only cold. Let's help her rest." · home: "The steam rises straight again! Granny Shirayuki will be so happy."
