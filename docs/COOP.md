# Couch co-op: 2–4 controllers on one screen

Status: **built, in review** (2026-10-18): the core (`src/coop/`), the HUD and join card (`src/ui/coopHud.js`) and
the shared bag panes (`src/ui/coopPanes.js`); waiting on the owner's check on a real Deck with extra controllers. Online
co-op (docs/MULTIPLAYER.md) is a separate plan; this builds its Phase 1 seams for real: several hero bodies, one
SkillRunner per caster, monsters that pick a hero.

## 1. What it is
- Up to **four players on one screen**: the Steam Deck plus up to three more controllers (Bluetooth or USB), or a PC
  with pads. Player 1 is whoever plays the game now (the Deck's own controls, the keyboard and mouse, the first pad).
- Each player plays **one of the heroes who have joined the pack** (Chewy, Moka, Poe, Floofy, Foosy, Stella). A hero
  nobody plays lives in town as before. Two players can't play the same hero.
- **One shared camera** (not split screen: a 7" screen split four ways is too small, and a cozy ARPG reads best as
  one picture). It frames the whole pack and pulls back as the pack spreads; a leash keeps everyone on screen.
- **Shared bag, coins, potions, pantry and stash** (they already belong to the household). Each hero keeps their own
  level, stats, skills, gear and hotbar (`state.heroes[id]`, as in single player).
- Drop in, drop out at any time outside the title screen, menus and screen transitions.

## 2. Controls
| | Player 1 | Players 2–4 |
|---|---|---|
| Device | keyboard + mouse, touch, or the first pad (the Deck's) | their own pad |
| Join | — | **A** or **Menu** on a spare pad opens the join card; left / right picks a hero, **A** joins, **B** backs out |
| Play | as today (docs/CONTROLS.md) | the same pad layout as player 1's pad: left stick, A attack / interact, X Y RB RT LT skills, B roll, L3 sprint, D-pad potions and meal, L3+R3 swap |
| Switch hero | LB / Tab: tap = the next free hero, hold = the wheel; a quick tag-in on the spot (no camera fly-over in co-op) | LB: tap = the next free hero, hold = the picker over their card (left / right, let go to pick) |
| Bag and hero | in co-op: Menu on the pad (I / C on the keyboard) opens player 1's pane; the game menu is inside it | **Menu** opens their pane |
| Leave | — | from their pane (with a confirm), or unplug: after 60 s without the controller the hero heads home |
| Map | View | View (the shared big map) |

Dialogues, shops, the stash, build mode, the Burrow door and the game menu are **shared** (one at a time, as today):
while one is open everyone's hero stands still and **any player's pad can answer it**.

## 3. The core (`src/coop/`)
- `pads.js`: a `PadReader` per extra pad (buttons, edges, hold times, sticks, the menu nav, rumble), polled once a
  frame; a `PadView` answers Actions' questions for that pad alone.
- `coop.js` (`G.coop`): the slots, joining and leaving, each player's input, the context swap, the camera and the
  leash, the downed, shared XP and the loot class.
- **The context swap** (`G.coop.with(slot, fn)`): the game has ~640 reads of `G.player`, plus `G.skills`, `G.derived`,
  `G.state.player` / `.equipment` / `.activeHero`, `G.actions`, `G.padAim`, `G.autoAim`, `G.playerDead`, and
  `Actions` (via `Actions.view`). A slot's systems run with those swapped to the slot's, then swapped back:
  - each frame: that player's input, regen, body and skills (`Coop.update`, after player 1's in game.js `frame`);
  - **every monster runs as the hero it is after** (`dungeon/crowd.js` → `Coop.foeUpdate`): the nearest standing hero
    who isn't in their bag, sticky so it doesn't dither. Its bites, AoEs and `hitPlayer` land on that hero;
  - projectiles and ground zones tick in the context they were made in (`combat/combat.js` tags `_slot`); enemy
    projectiles can hit every standing hero (`combat/projectile.js`);
  - a timer set inside a slot's context fires inside it (`setTimeout` is wrapped once);
  - **events** raised inside a slot's context reach their listeners in player 1's context (the HUD and panels are
    player 1's), except `player:dead` (that hero is downed), `player:levelup` (their own sparkle and toast), and the
    sounds, steps, rolls and charge events (they stay in the slot, so the right pad rumbles). `equip:changed` also
    re-dresses that hero's weapon.
- **Interacting**: a villager talks to whoever walked up (`G.talkTo` locks that body). Doors, the Burrow, stairs,
  portals, the Travel Map and beds run as player 1's (`PACK_MOVE`), and the whole pack comes along: `mode:changed`
  regroups everyone beside player 1 (`Coop.regroup`). Other interactables run as the player who used them.
- **The camera** (`Coop.frame`): the middle of the pack's bounds on the camera's ground axes (a touch toward the
  camera, so the pack sits clear of the skill bar); `rig.extraDistTarget` pulls back (up to 16 m, eased:
  `core/engine.js`) until every hero is inside a comfortable box on screen (NDC ±0.62 across, 0.56 up, 0.42 down).
  **The leash** (`Coop.leash`), on screen too: a step that would take a hero past the edge (±0.9 across, 0.86 up, 0.7
  down) is undone, so walking out pushes the camera back until it's all the way out, then stops; teleports and blinks
  (over 2.5 m in a frame) are never undone; someone 46 m from player 1 (stuck) sparkles back beside them.
- **Seeing everyone**: the cut-away through roofs and trees has a circle per hero (`uOcclB` in `gfx/materials.js`),
  each hero bends the grass (`uBenders` slots 2-4), and at night every hero gets player 1's rim light.
- **Downed**: at 0 life with a teammate standing, a hero is downed (not dragged home). A teammate standing within
  1.9 m for 1.6 s revives them at 40% life; after 20 s Shadow nudges them up at 25%. Everyone down → the old knock-out
  flow for the pack ("The whole pack needs a nap…": `G.partyWipe`), and everyone wakes at home (or a saved zone's inn).
- **XP**: a kill or a quest gives its XP to every hero in the pack, each with their own catch-up and level-ups
  (`Coop.shareXp`). **Loot**: the loot class takes turns through the pack's heroes, so drops suit everyone.
- **Hero switching**: a player takes a free hero (joined, not away on an expedition, nobody playing them). The old
  hero carries on in town right there (in the village) or goes home. `HeroManager` skips claimed heroes (the bench,
  the wheel, Tab, `spawnBench`); player 1's switch is a quick tag-in (`T.quick`).
- **Pausing**: the game menu pauses everything, as today. A pane doesn't pause; when **every** player has their pane
  open in a fight (or is down), the fight pauses.

## 4. The HUD (`src/ui/coopHud.js`, `coopHud.css`)
- Player 1 keeps today's full HUD, with a small gold **P1** badge on the portrait while co-op is on.
- A **player card** for each of players 2–4 (bottom corners and edges, never over the skill bar or the minimap):
  their colour ring and P badge, portrait, name and level, life and zoom bars, the six hotbar icons with cooldown
  sweeps; greyed with a revive ring while downed, "Reconnect your controller" when the pad is lost, a bag icon while
  their pane is open. Cards slide in on join and out on leave.
- **The join card**: slides up from the bottom in the new player's colour: "Player 3: pick a hero", a carousel of
  the free heroes (portrait, name, title, level), arrows, "A Join · B Back". It shows why when nobody's free.
- **The picker** (LB held): a small arc of portraits over that player's card; the highlight follows left / right.
- **In the world**: a soft ring in the player's colour under every hero while co-op is on, a "P2" tag over the head
  (it fades when they stand still), the interact prompt over their head ("A Talk to Rosie"), and over a downed hero
  the revive ring filling on the ground, plus Shadow's countdown.
- Toasts: "Player 2 joined as Moka!", "Player 2 left", "Player 2's controller disconnected".
- Minimap: a dot per hero in their player's colour.

## 5. The shared bag panes (`src/ui/coopPanes.js`, `coopPanes.css`)
Status: **built** (2026-10-18).
- Each player has a **pane**: their hero (paper doll, stats, skills) and the **shared bag**. Several panes can be
  open at once; each player drives their own with their own controller and a cursor in their colour. Players 2–4:
  **Menu** (the core calls `C.panes.open`). Player 1 in co-op: the pad's **Menu**, or **I / C / K** on the keyboard
  (the Bag / Stats / Skills tab; the same key again closes it), from `ui/ui.js`; Esc closes it, Esc again is the game
  menu. The panes aren't panels: `G.ui.anyModal()` stays false (their own layer over the HUD, under the shared panels,
  dialogues and toasts), and a shared dialogue or menu takes the pads while it's up.
- **Layout**: one → a centred card; two → left and right halves, in player order; three or four → quadrants, each
  player's own by number (P1 top left … P4 bottom right), so a pane keeps its place as others open, close or leave.
  A pane is drawn at a fixed design size and **zoomed** (CSS `zoom`: crisp text) to fit its region, capped at 1.3× the
  UI scale: **tall** (640 × 860) for one or two, **wide** (720 × 440, the compact one: the tabs in the header, the doll
  in a column beside the grid, a trimmed tooltip) for three or four. Every section sits at design coordinates the
  module sets (`LAYOUT`), so the cursor, the footprints, the markers and the tooltip are placed from the same numbers.
  At 1280 × 800 with four open the scale is 0.87 (the design's 14 px text: 12 px on the Deck's screen).
- **Motion**: a pane grows out of its player's HUD card (`[data-coop-card=n]`, else ui/coopHud.js's `.ch-card`, else the
  bottom edge of its place) and shrinks back into it; when the count changes the others glide (FLIP, 290 ms) to their
  new places, a layout change fading the contents in on the gliding card; tabs slide (the indicator and the view); the
  cursor glides; an equipped item flies from its cell to the doll (and the old piece back); a dropped item pops;
  numbers count up. The world behind is dimmed, never washed out. Sounds: `ui_open`, `ui_close`, `ui_tab`,
  `ui_equip`, `ui_click`, `ui_learn`, `ui_error`, `ui_hover`; the player's pad rumbles a little.
- **Tabs** (LB / RB, or Q / E): **Bag**, **Stats** (A spends a point), **Skills** (the class's three trees; A learns, Y on
  a learned active skill picks a hotbar slot for it, A puts it there, X on a slot clears it).
- **The bag**: the cursor moves cell by cell and an item is one stop (`grid.js` footprints, laid out by ui/inventory.js
  `layoutGrid`); off the grid's doll side it walks the doll. A on gear equips it to *this* hero (`G.actions.equip` in
  that player's context; the old piece goes back), on anything else picks it up; A on a worn item takes it off; Y picks
  up to move (the item rides the cursor over a green / gold (swap) / red footprint; A puts it down, onto the doll too;
  B puts it back); X drops (a rare or better item asks twice) at that player's hero. The tooltip (`itemTipHTML`)
  compares with what this hero wears, comes up once the cursor settles, and sits beside a lone card, above the grid in
  the tall layout, beside the focus in the wide one. Another hero's weapon wears their portrait on its cell, and its
  tooltip says whose it is and who plays them; trying to wear it says so in the pane ("That's Chewy's (P1)!").
- **Live**: the other players' cursors show on every pane's shared grid (a dashed outline and a P tag in their colour,
  with what they're carrying), an item someone carries shows outlined in their colour, and every pane redraws on every
  change. An item someone carries that another player takes: the carry lets go with a little shake and a note.
- Footer hints in that pad's glyphs (Xbox or PlayStation by its id; the keyboard's keys for player 1 on it). Players
  2–4: View = Leave the game (a confirm: View or A leaves, B stays). Player 1: View = the game menu. B (nothing held)
  or Menu closes.
- While a pane is open that hero stands still and monsters ignore them; all panes open in a fight pause it (the core).
- QA: `tools/qa/tmp/coop-panes.mjs [W H]` (one, two and four panes; equip to the right hero; a carry seen in another
  pane; a carry taken; a drop at the right hero; stats, skills, the hotbar; leaving; player 1's pad, keys and mouse),
  `coop-motion.mjs` (the motion, slowed 10× through CDP), `coop-tall.mjs` (the tall layout's tabs and tooltips).

## 6. QA
- `tools/qa/pad-lib.mjs` `installPads(page, n)`, `pTap / pDown / pUp / pStick / pConnect (page, i, …)`.
- `tools/qa/s49-coop.mjs` (38 checks): joining from a spare pad (the card, the picks, B, Menu, four players, nobody
  free), moving as player 2 and player 1 apart, the camera and the leash, a floor with three players (monsters choosing
  their hero, a bite and a bolt landing on player 2 alone, player 2's attack, shared XP, a level-up that isn't player
  1's), switching (LB tap, the picker, player 1's quick tag-in, the wheel, no claimed hero in town), downed and revived
  (a friend, Shadow at 20 s, player 1 downed, the whole pack home), the pack moving together (player 2's stairs, a
  zone, home, the cottage, out again), a lost controller, a villager talking to player 2, leaving, save and reload.
- `tools/qa/s50-coop-panes.mjs [W H]` (25 checks): one, two and four panes (the layouts), equip to the right hero, a
  sword refused for Moka, a carry seen live in another pane, a hold let go when someone takes the item, a drop at
  player 4's hero, stats, skills, the hotbar, leaving from the pane, player 1's pad Menu, I / C, the arrows, a click and Esc.
- Perf (`tools/qa/tmp/coop-perf.mjs`, a one-off): a Burrow floor's CPU frame p95 3.0 ms solo fighting → 4.3 ms with
  four heroes fighting (this PC); a join costs one ~100 ms frame (the new hero's rig and shaders, under its sparkle).

## 7. Known limits
- On a PC played with the keyboard, the first pad that's pressed becomes player 1's; a second pad joins as player 2.
- Fishing follows player 1 (its spot is found in front of player 1); digging needs Shadow, who follows player 1.
  Gathering, cooking and a cast started by player 2–4 run as them.
- Stella's heals reach every hero; her sun shells on another player's hero aren't checked yet.
- The panes have no touch layout (co-op is for pads).
