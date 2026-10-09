# Controls: gamepad, Steam Deck, touch (design)

Status: **CT-1 to CT-3 done**; **CT-4 built** (2026-10-07, in review). The as-built notes are §8 (CT-1), §9 (CT-2),
§10 (CT-3, with the polish before it) and §11 (CT-4; the user guide is [DESKTOP.md](DESKTOP.md)). CT-5 (touch) is
built through checkpoint 2 and in review: §12 (the touch device, the play controls, the phone HUD, menus on touch, the
mobile layout, the Mobile preset, perf and memory). The real-phone checks are in [ITCH.md](ITCH.md) ("Mobile").
Tracked in [ROADMAP.md](ROADMAP.md) as CT-1 to CT-5.

The owner's goals:
- **controller first**, in a **console ARPG** style (Diablo on console);
- play on the **Steam Deck** through a **desktop app** (Electron, added to Steam);
- then **touch controls** for phones and tablets.

Mouse and keyboard stay fully supported. The game switches seamlessly to whichever device was used last.

## 1. An action layer (the base for every device)
- `src/core/input.js` today reads raw keys and the mouse. Add an **action layer** that the game reads instead of raw keys:
  - analogue actions: `move` (a vector) and `aim` (a vector or a world point);
  - buttons: `attack`, `skillAlt` (right click), `skill1`–`skill4`, `roll`, `sprint`, `interact`, `potionHeart` (Q),
    `potionZoom` (E), `potionR` (R), `meal` (G), `swap` (X), `heroNext` and `heroWheel` (Tab), the panels (I, C, K, J, M, P),
    `build` (B), `menu` (Esc), `lootLabels` (Z), `home` (T), `rotate` (Q/E in build mode), `undo` (Ctrl+Z);
  - each button has `held`, `pressed` and `released`, so a **hold-to-charge** reads the same on every device.
- Devices: **keyboard and mouse** (the current behaviour, unchanged), **gamepad** (the browser Gamepad API, polled each
  frame), and later **touch**.
- The **last active device** drives the prompts and cursor:
  - glyphs switch between keyboard keys, Xbox and Steam Deck (A/B/X/Y look the same), and PlayStation if it's detected;
  - the mouse cursor hides while a gamepad is in use.
- **Rebinding**: Settings → Controls lists the bindings for each device. Store them in settings.

## 2. Gamepad gameplay (console ARPG)
The default mapping uses Xbox names (the Deck's face buttons match):

| Input | Action |
|---|---|
| Left stick | move. Analogue speed; click **L3** to sprint (it stays on while moving) |
| Right stick | **aim**: fine-aim skills and the attack direction; with no input, aim follows the facing and soft lock |
| **A** | basic attack (the left-click action). **Context-sensitive**: interacts when an interactable is highlighted and no foe is near |
| **X** | the right-click skill |
| **Y**, **RB**, **RT**, **LT** | skill slots 1–4 (hotbar 1–4) |
| **B** | roll / dodge |
| **LB** | tap: the next hero. Hold: the hero wheel, picked with the right stick |
| D-pad left / right | the heart and zoom potions |
| D-pad up | the quick meal |
| D-pad down | interact (an explicit fallback) and the loot labels (hold) |
| **View / Back** | the map |
| **Menu / Start** | the game menu: a radial or tab menu that reaches inventory, character, skills, journal, settings and home |
| L3 + R3 | swap weapons |

- **Holding a skill button charges it** (the charge system reads `held` and `released`).
- **Aim assist**: a soft lock on the nearest foe in a cone around the aim direction, with a small target ring. Skills aim at
  it when it exists, otherwise along the facing; the right stick nudges or overrides. Melee magnetism is short-range only.
- **Interactables**: the nearest one in front gets a highlight and an A prompt. This covers doors, NPCs, chests, gates,
  shops, beds and fishing spots.
- **Fishing and cooking minigames**: map their mouse inputs to A, the triggers and the stick.
- **Build and decorate modes** use a **virtual cursor** on the left stick, snapped to the build grid, with A to place, B to
  cancel, the bumpers or Y to rotate, and X to remove.
- **Rumble**: light hit and charge-release pulses, togglable.

## 3. UI navigation
- **Spatial focus navigation** for every panel, menu, dialogue choice, shop, the K-panel skill trees, the charge drawer,
  the inventory grid, the stash, crafting, the Travel Map, the Spirit Lantern later, and the title screen.
  - D-pad or the left stick moves focus, **A** selects, **B** goes back, **LB / RB** switch tabs, and **X / Y** act per
    panel (drop, compare, learn).
  - Tooltips follow the focus.
- **Drag-and-drop actions** (the inventory, hotbar assignment) get controller equivalents, such as "A to pick up, A to place"
  or a context menu.
- **The dialogue typewriter**: A advances, B skips.

## 4. The Steam Deck
- **Screen**: 1280×800 (16:10) at 7".
  - When a Deck-sized screen or the desktop app is detected, default the UI scale to about 1.15, check text legibility,
    keep everything inside a safe area, and make sure no essential text is under about 12 px at 1280×800.
- **Performance**: the Deck's APU is far weaker than the RTX 5080 dev target.
  - Add a **Deck quality preset**: a lower pixel ratio, AO off or half-res, reduced grass and detail density, shadow map
    size and distance, and fewer particles. Target **60 fps in the village and in dense fights**, with a fixed 40 fps mode
    as a fallback.
  - This needs **R-2** (the saved quality applying at boot).
  - Add a perf test that emulates Deck settings (1280×800, the Deck preset) and reports the frame time.
- **Input**: in the desktop app, Steam Input maps the Deck's controls to an Xbox pad (XInput), so the Gamepad API sees a
  standard controller. Map the trackpads to the mouse as Steam's default; no special handling is needed.

## 5. The desktop app (for Steam and the Deck)
- **Shell**: an **Electron** shell in `tools/desktop/`. It loads the production build (`base: './'`) from local files.
  - It opens full screen on the Deck, with no browser chrome.
  - Saves live in localStorage under the app's own profile (userData), so they persist.
  - The main process does nothing else.
- **Builds**:
  - **Linux x64** (SteamOS: an AppImage or tar.gz) and **Windows x64**;
  - `npm run build:desktop`, outputs in `release/desktop/`.
- **Docs**: `docs/DESKTOP.md` explains how to copy the build to the Deck (desktop mode), "Add a Non-Steam Game", set
  controller defaults, and launch from Game Mode.
- **Later**: Steamworks (achievements, cloud saves) if the game goes on Steam.

## 6. Touch (phones and tablets)
- **Landscape.** A floating virtual stick on the left half, skill buttons on the right (attack, the right-click skill,
  skills 1–4, roll), and a hold to charge.
- **Tap gestures**: tap to interact or talk; tap a monster to target it.
- **Menus** are touch-sized: hit targets of at least 44 px.
- **Performance**: a mobile quality preset, similar to the Deck's or lower.

## 7. Phases
| ID | Objective |
|---|---|
| CT-1 | The action layer, gamepad gameplay (§2) and device-aware glyph prompts |
| CT-2 | UI focus navigation for every menu, panel and dialogue, plus build and decorate with a virtual cursor (§3) |
| CT-3 | The Steam Deck: the UI scale and safe area, the Deck quality preset, R-2 (quality at boot), the Deck perf test (§4) |
| CT-4 | The desktop app: an Electron Linux and Windows build plus `docs/DESKTOP.md` (§5) |
| CT-5 | Touch controls (§6) |

## 8. As built: CT-1 (2026-10-06)

### 8.1 The action layer (`src/core/actions.js`)
- **`ACTIONS`** lists every action with a label, a group (Play, Menus, Build and decorate) and its default `kbm` and `pad`
  bindings. The keyboard and mouse defaults are exactly the old raw keys, so nothing changed for them.
  - Keyboard tokens are Input's key names (`f`, `space`, `tab`, `1`…), `mouse0` / `mouse1` / `mouse2` and `ctrl+z`.
  - Pad tokens are the standard mapping's names (`A B X Y LB RB LT RT View Menu L3 R3 DUp DDown DLeft DRight`), plus the
    chord `L3+R3`, and `LS` / `RS` for display.
- **Buttons**: `Actions.held(a, dev?)`, `pressed`, `released`, `heldTime(a)` (the pad's hold time) and `consume(a, dev?)`.
  `dev` is `'kbm'`, `'pad'`, or omitted for any device. Consuming `interact` also takes the pad's A press (A is the
  context interact).
- **Analogue**:
  - `Actions.move()` gives `{ x, y, mag, pad }` (x right, y forward). WASD and the arrows give a unit vector at mag 1. The
    left stick has a radial dead zone (0.2), its outer edge counts as full tilt (0.94), and a response curve
    `0.16 + 0.84·s^1.4`.
  - `Actions.aim()` is the right stick (dead zone 0.24, linear).
  - `Actions.padAim` is the pad's world aim point (written by `combat/padAim.js`).
  - `Actions.nav` is a D-pad or left-stick menu direction with key-repeat (0.38 s, then 0.11 s).
- **Polling**: `Actions.poll()` runs once a frame at the top of game.js `frame()`. It reads `navigator.getGamepads()` (the
  first connected pad, preferring the standard mapping) and works out the edges and hold times in real time. The
  triggers count as pressed past 0.35 and let go under 0.22.
- **The last device** (`Actions.device`):
  - the pad becomes active on any button press or a stick pushed past 0.35;
  - the mouse and keyboard become active on a key press, a mouse button, the wheel or a real mouse move (over 10 px);
  - a switch emits `input:device` and toggles `body.pad-active` (the cursor hides).
- **The glyph style**: Xbox, or PlayStation when the pad's id says Sony (vendor 054c, "DualSense", "Wireless
  Controller" without "Xbox"). Settings › Controls › Button glyphs overrides it.
- **Rebinding**: `rebind(a, dev, token)` swaps with the action that had the button (within Play and Menus; interact and
  the loot labels may share D-pad ▼). LMB and RMB, Esc / Menu, the sticks and the build keys are fixed.
  `resetBindings(dev)`. Overrides are saved in the UI settings (`binds`).
- **Text**:
  - `text(a)` names a binding ('F', 'A', 'D-pad ▼'; a panel with no pad button names Menu);
  - `resolve(text)` turns `{action}` tokens into key names and, on the pad, rewrites old "press F / hold Tab" phrases;
  - `forKey('F')` maps a key's name in text to its action.
- **Rumble**: `rumble(strong, weak, ms)` plays the `dual-rumble` effect on the active pad (Settings › Rumble). A
  stronger pulse overrides a weaker one.

### 8.2 What reads actions now
- **game.js `handleInput`**:
  - the mouse path is unchanged (LMB via `held('attack', 'kbm')`, Alt via `attackInPlace`);
  - the hotbar slots read `skillAlt`, `skill1`–`skill4` on both devices;
  - the potions, meal, swap, home and interact read their actions;
  - `build` (B) reads its action.
  - The charge machine's `bindKeys` and the channels' `holding()` read the slot actions.
- **Elsewhere**:
  - `player.js`: the move vector from `Actions.move()` (the stick's tilt scales `speedMul`); `roll`.
  - `sprint.js`: Shift Hold / Toggle as before; the pad's L3 is always a click that stays on while moving. An L3 click
    that turns into the L3 + R3 chord within 0.5 s gives its toggle back.
  - `heroes.js`: the `hero` action (Tab / LB).
  - `heroWheel.js`: the right stick picks a card; B closes the wheel.
  - `fishing.js`: interact, attack or `reel` (RT) cast, strike and reel; a fresh stick push, B or Menu stops.
  - `tools.js`: the stick or B cancels a chore.
  - npc.js, talk.js and game.js `talkTo`: `consume('interact')`.
  - ui.js `onKey`: the panel keys go through `Actions.isKey`.
  - `combat/charge.js cursorGround` and Moonbeam's aim: `Actions.padAim` while the pad plays.
- **Still on raw keys** (CT-2): build mode and decorate mode (WASD pans, Q / E, R, Ctrl+Z, Delete) and the panels' own
  key handlers (cook, craft, pantry, gift, travel).

### 8.3 Gamepad gameplay (`src/combat/padAim.js`, game.js)
- **The aim direction**: the right stick when it's pushed, else the left stick (attack where you walk), else the facing.
  While charging, the left stick only walks.
- **The soft lock**:
  - the best foe within 11 m in a cone round the aim, scored by distance × (1 + 2.6·(1 − cos));
  - the cone is 0.62 rad, narrowing to 0.24 rad at full right-stick tilt, scaled by Aim assist (0–100%, default 70%; 0 is
    off);
  - it is sticky: the lock holds while it stays in range and in 1.45× the cone;
  - warded captains weigh ×3, and a pot is picked only with no monster in the cone and within 5.
  - The lock is the skill target, the target frame and the aim point. With no lock, the aim point is 6 m along the aim
    (the right stick's tilt sets 2.5–9 m).
- **The ring**: a 256 px canvas texture (a cream and gold broken ring, four pink chevrons) on one flat plane. It uses
  normal blending at opacity 0.9, renderOrder 8, and is at least 1.7 m across (the foe's body hides the middle). It is
  only in the scene while a lock exists and the pad plays.
- **A** (CONTROLS §2):
  - it interacts when `pickInteract` has an interactable and no foe (a monster, not a pot) is within 5 m. The prompt
    shows A, or D-pad ▼ when A would attack.
  - Otherwise, in a combat world, A holds the basic attack: tap, hold to charge, or repeat. A melee attack walks up to a
    lock only from within reach + 1.8 m (short magnetism).
  - An A press that interacted swings nothing until A is let go. The same applies after a dialogue or panel closes with
    A still down.
- **Picking an interactable**: the nearest in reach, preferring those in front (distance × (1 + 0.8·(1 − cos))).
- **Rumble**:
  - a hit tick (crits stronger), at most one every 110 ms;
  - 0.35 / 0.55 for 110 ms when hurt; a long pulse on a knock-out;
  - a tick per charge stage, and 0.16 + 0.14 × stage on a charged release.

### 8.4 Prompts and glyphs (`src/ui/padGlyphs.js`, `src/ui/pad.css`)
- **`padGlyph(token, style)`**: SVG drawn in the game's style (an ink outline, a drop under the shape, a shine). The
  pieces are:
  - Xbox face buttons in green, red, blue and yellow with white letters;
  - PlayStation keys in cream with the coloured ✕ ○ □ △;
  - plum bumpers and triggers with white labels (LB, RB, LT, RT; L1, R1, L2, R2);
  - a cream D-pad with the pressed arm in pink;
  - sticks (LS and RS with arrows, L3 and R3), View and Menu, and the wide L3 + R3 chord.
- **Caps**:
  - `keyCap(action)` makes a cap tagged `data-act`, and `refreshCaps()` redraws every tagged cap on `input:device` and
    `input:bindings`.
  - The HUD tags its hotbar, belt, meal, menu-button, Build and hero-bubble caps. A cap with no binding on the device
    hides.
  - The HUD's interact prompt shows the pad glyph (`opts.act`: interact = A, interactAlt = D-pad ▼).
- **Text**:
  - guide text (`tutorial.js md`) and dialogue emphasis (`*F*`, `*Tab*`, `*hold Tab*`) become glyphs while the pad plays;
  - toasts and Shadow's tips go through `Actions.resolve`;
  - the hero wheel hub, the hotbar tooltips and the reel bar hint (`.kbm-only` / `.pad-only`) follow the device.
- **The cursor**: `body.pad-active` hides it.

### 8.5 Menus in CT-1 (a bridge until CT-2's focus navigation)
- ui.js `padInput()` handles the pad in menus:
  - **Menu** acts like Esc: a popover, a held item, the top panel, else the game menu;
  - **B** backs out of an open panel;
  - **View** toggles the map;
  - a held D-pad ▼ (over 0.25 s) shows the loot labels;
  - pad presses flash the hotbar and the belt.
- **Dialogue**: A finishes the line or advances; the D-pad or stick moves a `.pad-focus` ring over the choices (the
  number keys hide); A picks; B is Esc (it takes the leave option).
- **The game menu**: while the pad plays, it shows a panel row (Bag, Character, Skills, Journal, Map) and, in a dungeon,
  Home.
- **Settings › Controls**:
  - Keyboard & mouse and Controller tabs;
  - a row per action, by group;
  - click a binding to rebind it: the next key, the middle or a side mouse button, or a pad button. Esc or Menu cancels,
    and a swap is noted.
  - Reset;
  - on the Controller tab: Rumble, Aim assist (0–100%) and Button glyphs (Auto, Xbox, PlayStation).

### 8.6 QA and tools
- **`tools/qa/s25-gamepad.mjs`** (28 checks; in run-all) uses a virtual pad: `tools/qa/pad-lib.mjs` stubs
  `navigator.getGamepads`, and every press waits for the game's poll. It covers:
  - the device switch, the glyphs and the hidden cursor;
  - rebinding;
  - analogue walking, the L3 sprint, the L3 + R3 swap and the roll;
  - the soft lock and its ring (aim assist 0 = none);
  - A at the lock, every hotbar slot, a charge hold and release with rumble (and with rumble off);
  - the D-pad potions, the A interact in a dungeon, the A prompt and talk;
  - the dialogue (A, the D-pad, B), D-pad ▼ interact, the D-pad ▲ meal;
  - View / B, Menu and its panel row, the Controls panel;
  - the LB tap and the wheel;
  - Moka's Moonbeam channel and her slots, Poe's throw and blink at the lock;
  - back to the mouse and keyboard, and the PlayStation glyphs.
- **test-rpg "CONTROLS"**: the default bindings, the move vector, the dead zone and curve, edges and holds, the trigger
  hysteresis, the chord, text, rebinding and reset.
- **The look review**: `tools/qa/pad-shots.mjs` (the HUD in Xbox and PlayStation, the A prompt, the dialogue focus, guide
  glyphs, the hero wheel, the menu, the Controls panel, the aim ring at the game camera).

## 9. As built: CT-2 (2026-10-06)

### 9.1 Spatial focus navigation (`src/ui/padNav.js`, `ui.padNav`)
- **Scope**: while the pad plays, the focus covers whatever is open:
  - the popover (the hotbar slot chooser);
  - the guide's offer card (A answers; B or Menu says "No thanks");
  - else every open panel that pauses play, so side-by-side panels form one space (the bag next to a shop or the stash);
  - the pause menu covers everything else while it is open.
- **What can take focus**: buttons, item slots, skill nodes, charge perks, shop wares, recipe rows, mix items, quests,
  Travel Map pins, gift and seed cards, Pantry and furniture slots, palette cards, Fish Log cards, stat rows, remodel
  options and sliders.
  - Hidden elements, the close X and anything nested in another focusable element are skipped.
- **Moving the focus** (the D-pad or the left stick, with key-repeat):
  - The first pass only looks at elements in a cone that way (or sharing the row or column). If nothing is there, any
    element that way counts.
  - The score is the edge gap that way, plus 3 × the gap across, plus a 30-point toll for leaving the row or column,
    plus a small tiebreak on the centre offset.
  - Lists scroll the focus into view.
  - Each panel's last focus is remembered (as the element or a data-attribute selector), and each panel has a starting
    element (`START`).
- **The buttons**:
  - **A** selects (a click, or the element's own handler);
  - **B** goes back: a held item, then the popover, then the menu's sub-page (Settings and Controls go back to its main
    page), then the top panel;
  - **LB / RB** switch the top panel's tabs (the bag's views, the skill trees, Buy / Sell, the journal, the Controls
    devices, the cook's book and mix);
  - **X / Y** act per element (below);
  - **◀ ▶** adjust a slider;
  - **LT / RT** or the right stick zoom the map.
- **Per-element actions** (`HANDLERS`):
  - the bag, stash and paper doll: A picks up and puts down (the held item rides the focus); Y equips, uses, unequips
    or sends to the bag; X sells (shop open), stashes (stash open) or drops (press twice);
  - skill nodes: A learns, Y opens the slot popover, X opens the charge perks;
  - shop wares: A buys or sells one, X sells all (pantry goods);
  - Pantry slots: Y eats.
- **Tooltips follow the focus**: the element's own hover tooltip is anchored to its top-right corner (synthetic
  `mouseover` / `mouseenter`), so item compare boxes, skill details and building costs show as with the mouse.
- **The look**: `.pad-ring` is a white and pink double ring with an ink edge, a soft pulse and a bobbing paw badge. It
  glides between elements, matches their corner radius and bumps when there's nowhere to go.
  - `.pad-hints` is a cream pill of glyph hints (for example "Ⓐ Pick up · Ⓧ Drop · Ⓨ Equip · LB RB Tabs · Ⓑ Back"),
    centred under the top panel (above it when there's no room).
- **Cost**: the candidates (layout reads) are recomputed on a scope change, any pad press or every 0.3 s. Nothing runs
  while the mouse plays.

### 9.2 The game menu, guides and the title
- **The pause menu's pad row**: Bag, Character, Skills, Journal and Map, plus Build in the village, Decorate indoors and
  Home in a dungeon. It is the pad's way into every panel.
- **Settings**: the menu's Settings page links to Controls.
- **Guides**: View answers "Got it!" (a View glyph shows on the button). The offer card takes the focus.
- **Title and dialogue**: the title's buttons and dialogue choices keep their small CT-1 handlers.

### 9.3 Build and decorate: the virtual cursor (`src/ui/padCursor.js`, `ui.padCursor`)
- **The cursor**: a paw pointer that the left stick moves (820 px/s at full tilt, scaled by the UI scale). It is
  published as `Actions.vcursor`.
  - `Actions.pointer()` returns the mouse or the cursor. Build mode's `cursorTile` and inspect card, and decorate's
    `ray()`, aim with it, so the tile highlight, the ghost, plot snapping, wall and tabletop placement all work as with
    the mouse.
  - Pushing the cursor into a screen edge pans the camera; so does the right stick.
- **The palette**:
  - ◀ ▶ walk the cards (in build mode, also the tools row: zones, paths, bulldoze, reached by ▲ from the first
    category) and pick what they land on. A locked building, or a wallpaper (it costs one), only shows its tooltip.
  - ▲ ▼ change the category.
  - The focus ring marks the picked card.
- **Build mode** (`world/buildMode.js`):
  - A builds, paints (hold A and move to drag a zone or path) or opens a house's card;
  - B drops the tool, and with nothing in hand leaves build mode;
  - Y or RB rotate;
  - X removes the building under the cursor (press twice; landmarks stay);
  - LT / RT turn the camera a quarter;
  - View cycles the coverage overlays.
  - The prompt uses the pad's wording.
- **Decorate** (`home/decorate.js`):
  - A places or picks up;
  - B cancels, and with nothing in hand leaves;
  - Y or RB rotate (Y uses the highlighted wallpaper or floor);
  - X stores the piece in hand;
  - LB undoes;
  - LT / RT zoom.
- **The hero**: the left stick and B don't walk or roll it while the cursor is on.
- **Hints**: a glyph hint bar at the top centre, and the palettes show the pad's keys (`.pad-only`).

### 9.4 Minigames
- **Fishing** is playable end to end on the pad (CT-1's actions, checked in s25): A casts at the water, A strikes the
  bite, and holding A (or RT) through the reel bar lands the fish.
- **Cooking** is the Cook panel: A on a recipe, A on Cook.

### 9.5 QA
- **s25** adds sections g) and h): 45 checks in all, with a D-pad walker that steers the focus by screen position.
  - g) covers every main panel: the bag (pick up, put down, equip, drop, compare tooltip, tabs), the character sheet,
    the skill trees (learn, assign via the popover, a charge perk, the next tree), the journal's tabs, the map's zoom,
    Settings (a slider, a toggle, back, the Controls devices), Rosie's shop (buy, then sell in the bag), the stash,
    cooking, the workbench, the Travel Map and the gift picker.
  - h) covers build mode (pick the Park Bench, move the cursor, build, drop the tool, X twice removes it, leave),
    decorate (pick, rotate, place, undo, leave) and fishing end to end.
- **prod-smoke's `pad` case** also checks the focus ring in the bundle.
- **`tools/qa/pad-shots.mjs`** adds `ct2-*` shots (the bag with a compare tooltip and with a held item, the skill tree,
  the shop, the build and decorate cursors). Run it with `W=1280 H=800` for the Steam Deck.

## 10. As built: CT-3 (2026-10-06)

### 10.0 Two polish items before CT-3
- **Device-aware wording.** While the pad plays, `padWording(html)` (`ui/padGlyphs.js`) swaps the mouse words for
  glyphs. It works on tooltips (`tooltip.js` `show()`) and on the bag, shop and stash hint lines:
  - Click and Drag become **A**;
  - Right-click becomes **Y**;
  - Shift- or Ctrl+Click becomes **X**;
  - "Scroll the mouse wheel to zoom" becomes **LT RT**.
- Every panel footer that names mouse buttons or keys has a `.kbm-only` and a `.pad-only` twin, and `body.pad-active`
  picks one. That covers cook, craft, gift, seeds, travel, the map, skills, the stash, build, decorate, the reel and the
  guide's buttons. A device switch redraws the bag, shop and stash hints.
- **The build ghost over a building.** The red "can't place" ghost draws on top (no depth test, render order 20), so
  it stays visible over a house or the fountain. The green ghost keeps its depth.

### 10.1 R-2: the saved quality at boot
- `src/core/deck.js` `bootGraphics()` picks the preset the engine boots with:
  1. `?q=0..3` (for tests; it still wins);
  2. else the saved Settings › Graphics (`chewy3d.settings`);
  3. else, on a first start, **Deck** on a Deck-like screen and **High** elsewhere.
- `engine.preset` is that preset. `engine.quality` (0..2) is the density tier the worlds build with: grass, flowers,
  details and the sun's shadow map size. The Deck preset builds at Medium's density.
- A change in Settings applies at once where it can: the pixel ratio, AO, tilt-shift, the Deck's shadows and the
  particle cap (`Engine.applyPreset`). Grass and scenery density need the worlds rebuilt, so a toast says they change
  at the next start.

### 10.2 The Deck preset (Settings › Graphics: Low · Medium · High · **Deck**)
| | High | Deck |
|---|---|---|
| Grass, flowers, details | full (grass 44 per chunk, 9000 flowers) | Medium's (24, 4000) |
| Pixel ratio | up to 1.5 on a HiDPI screen | 0.85 (1088×680 on the Deck, upscaled) |
| AO, tilt-shift | on (AO at full resolution) | off |
| Sun shadow map | 4096 (village, regions), 2048 (dungeons, rooms) | 1536 at most, over 0.82 of the area (village ±28 m) |
| Shadow redraw | every frame | every other frame (moving things' shadows trail by one frame) |
| Particles | each layer's cap | ×0.6 (`PARTICLE_BUDGET` in `gfx/particles.js`) |
- The Deck's numbers live in `DECK` (`src/core/deck.js`). `Engine.tuneShadows` sizes the shadows as each world is
  set (`setWorld`) and on a live change.
- `Engine.render` does the half-rate redraw. It switches three's shadow auto-update off only around its own render,
  so portraits and thumbnails still draw theirs. A new world, or a resized map, redraws on its first frame.
  - In the throttled Burrow fight it took the shadow pass from 1.5 to 0.7 ms a frame.
- **A Deck-like screen** (`deckLike()`):
  - the Deck's 1280×800 screen, either way up;
  - the desktop app reporting a Deck (`window.pawhaven.deck`; CT-4's preload sets it from Steam's `SteamDeck=1`);
  - `?deck` (and `?deck=0` turns the detection off).
- On a Deck-like screen's **first start** the game picks the Deck preset and the UI at 1.15. After that, Settings
  decides.
- **The desktop app on a PC** is not treated as a Deck: a 1920×1080 monitor with a strong GPU keeps High. (CONTROLS §4
  said "a Deck-sized screen or the desktop app"; the app only counts when it runs on a Deck.)
- **Settings › Frame cap** (Off · 60 · 40): game.js `frame()` skips display refreshes until the next slot. The slots
  step by the cap's interval, so 40 on a 60 Hz screen alternates one and two refreshes and averages 40. On the Deck,
  Steam's own frame-rate limit (the Quick Access menu) does the same at the display and is smoother; the in-game cap
  is the fallback when that is not available. 60 on a 90 Hz Deck OLED or a 144 Hz monitor holds 60.

### 10.3 The UI on the Deck (`src/ui/deck.css`, `.ui-root.deck-ui`)
- **The scale**: the UI starts at 1.15 on a Deck-like screen. At 1280×800 that is 0.92 of the 1600×900 design
  (`ui.scale` = min(1280 / 1600, 800 / 900) × 1.15).
- **The safe area**: the HUD, panel, dialogue and message layers inset 12 px top and bottom and 18 px at the sides.
  The panel layer keeps its bottom edge, so the build and decorate palettes still sit on the screen's edge.
- **The text floor**: everything the design sets under 12 px is raised to 12, which is 11 px on the Deck's screen.
  That covers about 40 selectors: the HUD badges, the skill tree's levels and charge perks, the recipe and craft
  lists, the Travel Map pins, the gift and seed cards, the house card, remodel, the guide's header, the reel bar and
  build mode's cards and side panel, and the keyboard's small keycaps. They are listed in one `:is()` rule.
  - Left as they are: the Japanese subtitles, the compass's 北, the portrait's tiny "Lv" and the glyph art.
  - The glyph footer (`.pad-hints`) and the tooltips are in the unscaled overlay layer: 14 px and up.
- **Toasts** move up above the hotbar row: at 1280 wide the health orb reached in under them.
- **The glyph footer** (`padNav`) for a panel as tall as the screen (Settings) now sits beside the panel's bottom
  corner, not over its title. In the safe area it keeps 14 px from the edges. Build mode's hint bar drops below the
  safe area's top.
- **Glyph caps never shrink** in a flex row (`.kc.pad { flex: none }`). In build mode's side panel the A / Y / X / B
  caps had been squeezed over the first letters of "place / rotate / remove / cancel" at 1280 wide.
- On the pad, the number keys on the gift and seed cards are hidden. The Pantry's "Press F at your garden bed" shows
  the interact glyph instead of F.

### 10.4 QA
- **`tools/qa/s26-deck.mjs`** (in run-all) checks:
  - the Deck profile picking itself at 1280×800 (and not at 1280×720);
  - Settings showing Low / Medium / High / Deck and the Frame cap;
  - R-2: a saved Low builds less grass, has a 2048 shadow map and no AO; `?q=` wins;
  - the live preset switch and its next-start toast;
  - the frame cap (40 draws about 40 frames a second, 60 about 60);
  - the text floor on the HUD, bag, skills and build mode.
- **`tools/qa/deck-ui.mjs`** goes through every panel and overlay at 1280×800 with the pad active: 26 views from the HUD
  to decorate mode and the title screen.
  - For each view it lists text under 11 px, panels cut off and text at the screen's edge.
  - It saves a screenshot of each view to `tools/qa/tmp/deck-ui/`.
  - Result: no text under the floor and no panel cut off. It flags three edge cases, none real:
    - two are in the workbench's scrolled list, where the list clips the text;
    - one is the title's centred footer line, whose box spans the screen.
- **`tools/qa/deck-perf.mjs`** measures the game's whole CPU frame (`engine.tick` to the end of render).
  - Scenes: the village plaza; a busy square at 17:00 with every named villager round the fountain; a Burrow fight
    (floor 8, 60 monsters on the hero plus the floor's own, Chewy's rotation); a zone dungeon fight (Bamboo Depths 1,
    about 140 of its own plus 40).
  - Configs:
    - the Deck preset at 1280×800 with the CPU throttled ×3 (CDP; a Deck core against this Ryzen 7 7800X3D,
      roughly);
    - the same unthrottled;
    - High at 1600×900 unthrottled.
  - Also reported: draw calls, triangles, live particles, and the render's span on the GPU timeline
    (`EXT_disjoint_timer_query_webgl2`).
  - The GPU can't be throttled, so the GPU numbers compare the presets; they don't predict the Deck.

| Scene | Deck, CPU ×3: p50 / p95 | Deck ×1 | High ×1 (1600×900) | Draws, Deck / High | GPU span p50, Deck / High |
|---|---|---|---|---|---|
| Village | 9.6 / 11.9 ms | 2.7 / 4.1 | 4.9 / 6.1 | 253 / 354 | 3.1 / 5.6 ms (−45%) |
| Busy square | 10.6 / 13.2 | 2.9 / 4.3 | 5.2 / 6.0 | 278 / 365 | 3.5 / 5.7 (−38%) |
| Burrow fight | 11.2 / 17.2 | 3.0 / 4.1 | 4.2 / 4.9 | 187 / 318 | 3.4 / 4.6 (−26%) |
| Zone fight | 10.7 / 16.5 | 3.2 / 4.2 | 4.4 / 5.2 | 164 / 282 | 3.8 / 4.6 (−17%) |

- **The verdict at ×3**: the village, the busy square and the zone fight hold 60 fps on the CPU (p95 under 16.7 ms).
  The Burrow fight averages 60 (p50 11.2 ms) with a p95 of 17.2 ms, so about 7 frames in 100 miss: WARN, just over.
- The run was on a busy machine: other agents had the CPU at 62 to 65%.
- The throttle is pessimistic. Chrome's ×3 turns a p95 of 4 ms into 16 to 17 (×4), because the throttler quantises.
  The p50s scale by about ×3.5.
- **The half-rate shadows** (above) took the Burrow fight's throttled p95 from 19 to 23 ms (two runs) down to 17.
- At ×1 the fight's frame breaks down as:
  - render 1.4 ms, of which shadows 0.15;
  - the dungeon 0.5;
  - the HUD 0.3;
  - VFX 0.25;
  - skills 0.15.
  No single system stands out.
- The GPU span is from the render's start to its end on the GPU timeline, so it includes the GPU waiting for commands.
  Only the ×1 columns compare the GPU work.
- **What only a real Deck can tell** is the GPU: its RDNA 2 iGPU has about 1/30 of this GPU's compute. The
  CT-4 desktop build on the Deck, with Settings › Show FPS, is the check. If the dense fights drop there, the next
  levers are:
  - fewer bloom mips;
  - SMAA at Medium;
  - a lower particle cap.

## 11. As built: CT-4, the desktop app (2026-10-07)
The player's guide (building, Windows, the Steam Deck step by step, saves, troubleshooting) is
[DESKTOP.md](DESKTOP.md). This section is the engineering summary.

### 11.1 The shell (`tools/desktop/`)
- **`main.cjs`** (the main process) does four things:
  - It serves the production build from the app's own files on a private, privileged scheme, `app://pawhaven/`
    (standard, secure, fetch and CORS enabled). It is a secure context, so the Gamepad API, localStorage and module
    scripts all work as on https. Paths are normalised and confined to the game folder; anything else gets a 403.
  - It opens one window: no menu or chrome, full screen unless the player chose windowed, a minimum of 960×600, and
    the ink background colour while it loads.
  - F11 and Alt+Enter toggle full screen (the game never sees them). The state and the windowed bounds go in
    `userData/window.json`.
  - Links open in the system browser; pop-ups and navigating away are refused.
- **Saves**: the game's localStorage for the `app://pawhaven` origin, in the app's userData: `%APPDATA%\Pawhaven` or
  `~/.config/Pawhaven`. They persist across updates and are separate from the browser's.
- **`preload.cjs`** (context isolation, sandboxed) exposes `window.pawhaven`:
  - `desktop`, `platform`, `version`;
  - `deck`: Steam's `SteamDeck=1`, or the `--deck` / `--no-deck` switches;
  - `isFullscreen()`, `setFullscreen(on)`, `onFullscreen(fn)`;
  - `quit()`, which closes the window, so the game's `beforeunload` save runs.
- **The game's side** (`src/ui/desktop.js`, inert in a browser):
  - Settings › **Full screen** (`settings.fullscreen` mirrors the window both ways);
  - **Quit** on the title and **Quit game** in the pause menu (save, then `quit()`);
  - `body.desktop-app`;
  - `src/core/deck.js` already reads `pawhaven.deck`. A desktop app on a PC keeps its normal preset (the
    director's call); the Deck preset needs Steam's flag (or the Deck's 1280×800 screen).
- Chromium switches set in the main process: `ignore-gpu-blocklist` (WebGL2 on any driver, the Deck's Mesa included)
  and `autoplay-policy=no-user-gesture-required` (the title music plays at once).
- Test switches: `--windowed`, `--fullscreen`, `--user-data=`, `--query=`, `--url=` (the dev server) and
  `--game-dir=`.

### 11.2 The build (`npm run build:desktop`, `tools/desktop/build-desktop.mjs`)
1. The game is built by vite with `base: './'` into `dist-desktop/app/game/`, with the licences (as the itch build).
2. Next to it go `main.cjs`, `preload.cjs`, `icon.png` and a small `package.json` (main `main.cjs`, no
   dependencies).
3. **electron-builder 26** (devDependency) packs it with **Electron 44.6.0** (devDependency) into `asar`. It never
   publishes, and the app has no node_modules.
   - It gets Electron already unpacked: `node_modules/electron/dist` for Windows, and for Linux the official zip,
     downloaded once into `node_modules/.cache/pawhaven-desktop/`.
   - On this machine, electron-builder's own unzip-then-rename step failed with EPERM: Defender holds the fresh
     folder while it scans.
   - Windows targets: `zip` and `portable` (an NSIS self-extractor).
   - Linux target: `dir`.
4. **The Linux packages are written by the script itself:**
   - electron-builder's AppImage step needs Linux: its `mksquashfs` is a Linux binary, and its staging makes
     symlinks, which Windows refuses without Developer Mode.
   - `tools/desktop/appimage.mjs` builds the AppImage from the pinned, checksummed type-2 static runtime that
     electron-builder ships (AppImage/type2-runtime 20251108) plus a **SquashFS 4.0 image it writes itself**: gzip
     data blocks of 128 KiB, no fragments, no xattrs, uncompressed metadata blocks, files and folders only.
   - The AppImage's `AppRun` adds `--no-sandbox` only when unprivileged user namespaces are missing (the setuid
     helper can't be setuid inside a FUSE mount). It also carries the `.desktop` entry, the icon and `.DirIcon`.
   - The `.tar.gz` is a ustar written with the executable bits: `pawhaven`, `chrome_crashpad_handler`,
     `chrome-sandbox` and the `.so` files 0755, the rest 0644.
   - **`tools/desktop/verify-squashfs.py`** reads the AppImage back with an independent reader (PySquashfsImage 0.9).
     It finds the image after the runtime's ELF sections and compares all 72 app files, byte for byte, plus the 5
     extras and the modes. Result: PASS, 362 MB of files identical.
5. Outputs in `release/desktop/` (0.3.0):

| File | Size |
|---|---|
| `Pawhaven-0.3.0-win-x64.zip` | 181 MB |
| `Pawhaven-0.3.0-win-x64-portable.exe` | 124 MB |
| `Pawhaven-0.3.0-linux-x64.AppImage` | 158 MB |
| `Pawhaven-0.3.0-linux-x64.tar.gz` | 155 MB |

It also leaves `win-unpacked/` and `linux-unpacked/`. A full build takes about 2.5 minutes once the downloads are
cached; `--win --dir` takes seconds.
- **The icon** (`tools/desktop/icon.png`, 512 px) is the title's Chewy badge, rendered from the game by
  `tools/desktop/make-icon.mjs`.
- **Kept out of the web and itch bundles**: nothing in `src/` imports Electron. The bundle's only desktop code is
  `src/ui/desktop.js`, which reads `globalThis.pawhaven`. `tools/build-itch.mjs` and vite's config are unchanged.

### 11.3 QA
- **`tools/qa/desktop-smoke.mjs`**: Playwright's Electron support boots the packaged
  `release/desktop/win-unpacked/Pawhaven.exe`, windowed, with throwaway userData folders. 5/5 checks:
  - a) the title from `app://pawhaven`: a secure context, `window.pawhaven` (desktop, no Deck, win32, 0.3.0), WebGL2
    on the RTX 5080, and the Quit button;
  - b) Settings › Full screen and the pause menu's Quit game; the toggle really switches the window to full screen
    and back;
  - c) New Game reaches the village. The Gamepad API answers, and the window and document have focus. A virtual pad
    walks the hero, the glyphs show, and the bag takes the focus ring;
  - d) Quit game saves and closes the app. A relaunch has the save (Continue) and `window.json`;
  - e) with `SteamDeck=1` (as Steam sets on a Deck) the app reports a Deck and the first start picks the Deck preset.
- No physical controller was connected here. The real pad path is the same Gamepad API as Chrome, and the
  stub-driven check covers the game's side.
- Screenshots: `tools/qa/tmp/desktop/title.png`, `village.png`.
- Not run here: the Linux builds. The AppImage's SquashFS is verified by the independent reader, but it has not been
  started on a Linux machine or a Deck yet. That is the owner's first Deck test (DESKTOP.md walks through it).

## 12. As built: CT-5, touch (2026-10-07)
Phones and tablets in landscape. Checkpoint 1 was the touch device and the play controls (12.1, 12.2). Checkpoint 2 is
the phone's HUD and hero wheel, the menus on touch, the mobile layout, build / decorate / the minigames by touch, and the
Mobile preset with its numbers (12.3 to 12.7). The QA is 12.8.

### 12.1 The touch device (`src/core/touch.js`, `src/core/actions.js`)
- **Touch is the action layer's third device.** `core/touch.js` holds what the on-screen controls are doing, in
  actions:
  - buttons: `Touch.hold(a)` / `release(a)` / `pulse(a)` (held for one frame: a tap decided on release);
  - `Touch.stick` `{ on, x, y, mag, sprint }` and `Touch.aim` `{ on, x, y, mag }` (x right, y up);
  - `Touch.taps`, the world taps, which game.js takes each frame.
- `Actions.poll()` works out the touch buttons' edges and hold times (`Touch.poll`), like the pad's.
  - `held / pressed / released / consume(a, 'touch')` read them;
  - `held(a)` with no device includes touch;
  - consuming `interact` also takes the attack button's press (it is the context interact, as A is).
- `move()` takes the stick (after WASD, before the pad's left stick), with `pad: true` (analogue walking).
- `aim()` takes a drag off a skill or the hero button, as the right stick. So `combat/padAim.js`, the charge machine
  and the hero wheel read touch with no changes of their own.
- **The last device**:
  - a touch anywhere (pointerdown or touchstart) makes touch the device: `body.touch-active`, `Actions.style` 'touch';
  - the mouse events a browser sends after a tap (`sourceCapabilities.firesTouchEvents`, or within 600 ms of the last
    touch) don't count as the mouse;
  - a key, a real mouse move or a pad press switch back, and every touch button lets go (`Touch.releaseAll`).
- A touch-first screen (`(pointer: coarse)` and no `(any-pointer: fine)`) starts on touch, so the controls are up
  before the first tap.
- **Text**: `Actions.text(a, 'touch')` names the control ('the roll button', 'the heart potion', 'Skills in the
  menu'). `resolve()` turns "Press Q to…" into "Tap the heart potion to…" and "hold Tab" into "hold the hero button".
  Banners' sub lines now go through `resolve()` too (the pad gets its glyph names there as well).
- The key caps hide by themselves (no bindings on 'touch'); `.kbm-only` and `.pad-only` hints hide on touch.
- **No browser gestures**:
  - the viewport meta has `maximum-scale=1, user-scalable=no, viewport-fit=cover`;
  - the canvas is `touch-action: none` and cancels its touchstart (no compatibility mouse events, no scroll or zoom);
  - the UI is `touch-action: pan-x pan-y` (lists still scroll, no pinch or double-tap zoom); since CT-7 the HUD, the world
    labels and the touch layer are `none`, and a one-finger touchmove outside a scrolling list is cancelled (§12.10);
  - `overscroll-behavior: none` (no pull-to-refresh);
  - Safari's `gesturestart` and any two-finger touchmove are cancelled;
  - text selection and the long-press callout are off; the long-press context menu was already blocked (input.js).
  - CT-6 does all of this from the first frame in `index.html`, and adds the zoom and full-screen cards (§12.9).

### 12.2 The play controls (`src/ui/touch.js`, `src/ui/touch.css`)
They show while touch plays and play is on: not on the title, in a menu or dialogue, in build or decorate mode. Sizes
are CSS px × `--u`: the screen (an 844 px wide phone is 0.9, a tablet up to 1.3) × Settings › Button size. They sit
inside the safe area (`env(safe-area-inset-*)`).
- **The floating stick** (the left half; the right half when left-handed):
  - it appears where the thumb lands and follows a long push (past 1.7 × its radius);
  - analogue: a dead zone of 0.12, then 0.26 to 1 of the speed;
  - pushed out to its ring (1.24 × the radius) it sprints: the ring turns gold and races, the knob glows
    (`Touch.hold('sprint')`, read by sprint.js);
  - at rest a faint ghost shows where to put the thumb;
  - a short tap there is a world tap;
  - the knob is a pink paw pad.
- **The cluster** (bottom right, mirrored when left-handed):
  - the **attack button** (84 px at size 1) is the LMB slot, in a cream frame of dots like the orbs'. It has the pad's
    A behaviour: it uses or talks when the prompt is up and no foe is near (it shows a paw then), else it attacks the
    soft lock (tap, hold to charge, hold to repeat). A foe tapped on purpose is walked up to, as a click does.
  - **the five skill slots** (RMB, 1–4, 52 px) on an arc round it;
  - **roll** (mint), and the **weapon-set badge** at the attack button's shoulder.
  - **The HUD's own hotbar slots move into these buttons** while touch plays, and go home when another device does.
    So their icons (the tile cropped round), cooldown sweeps and numbers, out-of-zoom tint, ready flash, charge
    sweep, stage pips and perk badges all keep working. A round charge ring replaces the square rim.
  - An empty slot is a dim dashed circle; a tap opens the skill chooser.
- **Aim** (Settings › Controls › Touch › Skill aim):
  - **Auto** (the default): skills go at the soft lock (padAim's cone round the stick or the facing), else along the
    facing;
  - **Drag**: drag off a skill button to aim. The drag is the right stick: its direction, and its length (to 140 px)
    is the distance (2.5–9 m) and narrows the lock's cone. A ground mark shows where it goes: a trail of cream
    chevrons and a ring where it lands, or padAim's ring on a locked foe. Back onto the button shows a cross; letting
    go there cancels. A chargeable skill charges from the press and fires charged at the aim; any other skill casts
    when let go (a still press past 0.22 s holds and repeats, as in Auto).
- **The belt** (the HUD's potion and meal slots, moved in) sits between the orbs, which shrink to 0.74 and show their
  numbers. The orbs and belt stay centred, but clear of the cluster on a narrow phone.
- **Top right**, left of the minimap:
  - the **hero button**: the next hero's face, the switch cooldown ring and level. A tap is the next hero. A hold opens
    the hero wheel (fitted to the screen), which stays up for a tap on a card; sliding onto a card and letting go picks
    it too; a tap elsewhere closes it. It works for any number of heroes.
  - the **bag** and the **menu** (its dot counts skill and stat points). The pause menu's quick row (Bag, Character,
    Skills, Journal, Map, Build, Decorate, Home) shows on touch too.
  - The minimap opens the map.
- **The world**: a tap on a monster locks it (`padAim.target`: kept while it lives and stays within 1.6 × the lock's
  range, whatever the cone; the ring and the target frame show). A tap on a villager, a door or anything usable walks
  over and uses it. Anything else is walked to (click-to-move), with a small ping. Two fingers pinch the zoom (as the
  wheel). During dialogue a tap anywhere reads on.
- **The prompt** has no key on touch (a paw badge instead), and a tap on it interacts.
- The quest arrow keeps out of the cluster and the top corners.
- **Haptics** (`navigator.vibrate`; iOS Safari has none): a tick on a press, a charge stage, the sprint ring and a
  cancel; a thump on a charged release, being hurt and a knock-out.
- **Settings › Controls › Touch**: Button size (75–135%), Opacity (30–100%, 85% by default; a pressed button is
  opaque), Left-handed, Skill aim (Auto · Drag), Haptics, and a list of what each control does in place of bindings.
- **The HUD on touch**: the dock (the hotbar strip) and the bottom-right menu row hide; the top-left hero portrait
  hides (the hero button replaces it); toasts move to the top centre; the materials row hides on a short screen.

### 12.3 The phone's HUD and the hero wheel
- **The quest tracker** starts folded on a short screen (under 520 px tall); its toggle opens it. The toggle and the
  hotbar's level badges have 44 px hit areas.
- **Toasts** sit at the top centre and let taps through. On a phone they step aside while a menu is open (build and
  decorate keep theirs).
- **The hero wheel on touch** (`TouchControls.fitWheel`) fits the free play area: left of the cluster and the hero
  button, above the orbs and belt, inside the safe area.
  - It is a ring when the ring fits at 85% or more. Otherwise it is a row of cards, 146 px apart, which is what a phone
    gets with 4 or 5 heroes.
  - A scrim dims the world. The toasts, world labels and the guide dock hide while it is open.
  - The hub says "Tap a card to play as…". A closed wheel no longer catches taps (`visibility: hidden`).
- The quest arrow keeps out of the cluster and the top corners (12.2).

### 12.4 Menus on touch (`src/ui/mobile.js`, `src/ui/mobile.css`)
- **The screen**: `.m-touch` on the UI root on a touch-first screen (or while touch plays); `.m-phone` when the short side
  is 500 px or less; `.m-tablet` otherwise.
- **Scale**: on a phone the panels, dialogue, tooltips and popovers draw at `--m-pscale` 0.86, so the design's 14 px is
  12 px on screen. A tablet uses at least that. Toasts and banners use the UI scale, but at least 0.78.
- **The text floor**: anything still under 12 px gets an inline size. That covers the panels, dialogue, tooltips,
  popovers, the guide dock, the hero wheel, toasts, the reel bar and the flip chip.
  - A MutationObserver marks it dirty, and it runs at most once a frame.
  - The Japanese subtitles, key caps, minimap names and level pips are exempt.
- **Fit**: a phone shows one panel at a time, centred between the safe area's top and bottom margins.
  - Its body scrolls inside the panel (`pan-y`, overscroll contained), and the panel is never off the top.
  - Its title, tabs and ✕ (52 px) sit at the bottom, by the thumbs.
  - Tabs at the top of a body (the shop's Buy / Sell, the skill trees, the journal, the pantry) stick to the body's
    bottom on a solid band. A wide row of tabs scrolls sideways.
  - The skill trees' three tabs share their row instead, for every hero ("Starlight Kibble", "Ghostlight Tome"). The
    name wraps to two lines and the points badge sits on the tab's corner. They are still 52 design px tall.
  - The bag's paperdoll is a strip of two 52 px rows: the weapon | hat, collar | outfit, boots | the portrait (100 px) |
    charms | paws, the swap | the second weapon. The slot names hide (an empty slot shows its silhouette, and a long press
    names it) and the stats stay one row, so about three rows of the bag show under them (one did before).
  - Cooking and the workbench take the screen's height. Their list and their details scroll separately, and Cook /
    Craft sticks to the foot of the details.
  - The Travel Map draws its map at 0.76 so all of it shows. Its details scroll beside it, and Set off! stays in
    sight.
  - A guide's dock and offer sit in the free band along the top, between the top-left card and the hero / bag / menu
    buttons (`--tc-band-l / -w` from the touch layout), so they never cover the buttons they talk about.
- **Pairs**: two side panels open together (a shop or the stash beside the bag) take turns on a phone. A flip chip at
  the left edge switches between them; the shop or stash shows first.
- **Targets**: tabs, buttons, segments and dialogue choices are at least 52 design px (44 on screen). Also enlarged:
  - toggles (a bigger hit area);
  - sliders (a 52 px track and a 36 px thumb);
  - the controls panel's device tabs, the cooking and workbench quantity buttons, the remodel chips, and the guide's
    Skip.
- **Gestures** (`Mobile.gestures`):
  - a tap is the click, so ItemDrag's own click-to-pick-up and click-to-put-down work as tap-to-move;
  - a finger drag drags an item;
  - a **double-tap** (330 ms) is the right-click: equip, use, assign, eat or stash. It works on a slot, a skill node, a
    skill slot, a shop item, a card, or anything with `data-id`;
  - a **long press** (430 ms) shows the hover tooltip by the finger. It stays for 5 s or until the next touch, and the
    release doesn't click or pick up;
  - the browser's own long-press menu is blocked.
- **The K panel's charge drawer** folds to its tag on a phone. A tap on the tag, or on a node's ⚡ chip, opens it as a
  sheet over the tree.
- **Words**:
  - key caps in tabs hide;
  - mouse wording in tooltips and footers becomes touch wording (`touchWording`: Right-click → Double-tap, Click → Tap,
    Ctrl+Click → Drag, the wheel → Pinch, "R to rotate" → "Turn rotates it");
  - the guides name the control on screen ("press *F*" becomes "press the attack button");
  - mouse-only hints with no touch equivalent hide (the character sheet's "Shift+click spends 5").
  - Shadow's tips wait while fishing, so they don't cover the reel bar.
- **Dialogue**: a tap anywhere reads on. The choices are 52 px buttons with no key caps.
- **The title on a phone**: the logo at 0.78, the buttons in a row.

### 12.5 The mobile layout
- **Safe areas**: `env(safe-area-inset-*)` (the viewport has `viewport-fit=cover`), read through a probe element.
  `?safe=t,r,b,l` fakes a notch for the QA. Every layer stays inside: the HUD, messages, dialogue, panels, the touch
  controls, the flip chip and the wheel.
- **Portrait**: a card ("Turn your phone sideways", with a turning phone) covers the game and pauses it
  (`ui.isPaused`). Turned back, it plays on.
- The page is `100dvh` tall, so the browser's bars don't cut it off.
- **Full screen**: the first tap on a touch-first screen asks for it, then locks landscape (`requestFullscreen`
  with `navigationUI: 'hide'`, then `screen.orientation.lock('landscape')`).
  - Android Chrome, Samsung Internet and Firefox have it. An iPhone's Safari has no full screen for a page, so the game
    plays with the browser bar.
  - Not asked: in the desktop app, or under automation (`navigator.webdriver`) unless `?fs`.
- **Audio** unlocks on the first touch (`audio.js` also listens for `touchend`).
- **Add to Home Screen**: `public/manifest.webmanifest` (full screen, landscape, a 192 and a 512 icon made from the
  desktop icon), `apple-mobile-web-app-capable` and the theme colour. Started from the home screen, an iPhone plays it
  full screen as well. That works when the game is served on its own; inside itch's iframe the browser adds the itch
  page.

### 12.6 Build, decorate and the minigames by touch
- **Build and decorate** (`TouchControls.editTick` and its neighbours): the play controls become edit buttons, and the
  finger is the cursor (`Actions.tcursor`, which `Actions.pointer()` returns; a click goes into Input for one frame).
  - On the thumb's side, above the palette: **Build** (**Set down** when decorating, **Remove** for the bulldozer) and
    **Turn**.
  - On the other side: **Cancel**, **Store** (decorate, with a piece in hand), **Undo** (decorate) and **Done**.
  - With a piece in hand, a touch or a drag moves it. A paint tool paints along the drag.
  - With nothing in hand, a drag pans (the ground follows the finger), and a tap is a click: a house's card, or picking
    up a piece. Two fingers pan and pinch.
  - On a phone the palette is full width with a scrolling header, and it folds away while a piece is in hand.
- **Fishing**: the attack button casts (the context interact at the water), a touch anywhere strikes, and holding the
  screen reels (`Touch.hold('reel')`). The reel bar shows a pink paw cap (touch's mark, as on the prompt) over
  "hold to reel". A drag on the stick's side moves the hero instead.
- **Cooking, the workbench, the seed and gift pickers and the shops** are menus, so they work with taps. Their
  quantity buttons are 44 px. A long press shows an item's details, and a tap buys.
- **The garden**: the attack button's context interact at a plot, as A on the pad.

### 12.7 The Mobile preset, perf and memory
- **`PRESET.MOBILE` = 4** (`core/deck.js`; Settings › Graphics: Low · Medium · High · Deck · Mobile):
  - Low density;
  - a pixel ratio of 1 (an 844×390 phone at DPR 3 renders 844×390);
  - no AO or tilt-shift, SMAA on low, no hit aberration (`Post.noChroma`);
  - a 1024 sun shadow map over 0.72 of the area, redrawn every other frame;
  - half the particles;
  - **hero skins at 1024** (`capTexture`, called from `heroModels.js` at load; a 2048 skin is 22 MB of GPU memory with
    its mips, a 1024 one 5.6 MB).
  - Frame cap: a fresh touch-first start caps at 60. Settings › Frame cap now also has 30.
- It is picked on the first start on a touch-first screen (`mobileLike()`: a coarse pointer and no fine one), unless a
  quality is saved or `?q=` is given. A preset changed later takes effect for the skins and density after a reload.
- **`tools/qa/mobile-perf.mjs`**: 844×390 at DPR 3 with touch, the controls up, and the CPU throttled. These numbers
  were taken with the machine 80 to 94% busy (other agents were building at the time), so treat the throttled ones as
  a ceiling:
  - **Unthrottled** (CPU p95, village / Burrow fight / zone fight): Mobile 7.6 / 10.2 / 10.3 ms; High at the same size
    10.3 / 9.8 / 11.2 ms.
    - Mobile cuts the GPU work: in the village, 160 draws against 387, 681k triangles against 2.78M, and the render's
      GPU span p50 1.4 ms against 5.8 ms (75% less).
  - **CPU ×4**: 63 / 74 / 80 ms p95 (FAIL against the 30 fps line).
  - **CPU ×3, side by side with the Deck preset under the same load**:
    - Mobile 42 / 72 / 53 ms;
    - Deck 46 / 45 / 34 ms. The Deck's own baseline, at 62 to 65% load, was 12 / 17 / 16.5 ms.
    - The load is most of it. Mobile matches the Deck in the village and runs up to 1.6× it in the big fights.
  - Phases in the Burrow fight at ×3 (`PHASES=1` now also splits the UI): the damage numbers 2.8 ms, the HUD 2.0 ms,
    the touch layer 0.35 ms, the render 17 ms.
  - The real check is a phone. My estimate: a mid-range phone holds 30 fps in the village, and the 60-monster fights dip.
- **The memory diet** (all of it on the Mobile preset only, except the first item):
  - **A dungeon floor's staging arrays are freed (every preset).** The batched chunks (`dungeonWorld.js` `Batch`) grow
    their arrays by doubling, and then copy them out exactly sized. The staging arrays used to stay alive with the floor:
    about 130 MB on B8. `Chunks.build` now drops them.
  - **Static geometry lets go of its arrays once uploaded** (`core/deck.js releaseAfterUpload(geo)`, three's
    `BufferAttribute.onUpload`).
    - It's opt-in, per call site, never a global switch. Today it covers a floor's chunk meshes (solid props, wall
      dressing, clutter, the glowing bits) and each pot's own geometry.
    - Both are built once, drawn as is and disposed with their owner. Nothing raycasts, merges, clones or edits them.
    - Templates and caches are never released, because a later mesh may be built from them. The same goes for
      buildings (companions and villagers raycast them), vegetation (BatchedMesh reads its arrays for culling),
      skinned rigs and terrain.
    - Bounds are computed before the arrays go. `geometry.userData.released` marks a released geometry.
    - A lost WebGL context can't re-upload those buffers. If any were released, the game saves on the loss and reloads
      once the context is back (`Engine`).
  - **Building templates are capped** (`world/buildings/index.js`).
    - The prewarm builds level 1 in two variants, 12 templates, instead of every level in all eight variants: 112
      templates, over 120 MB, built in the background while in a dungeon.
    - Unused unstyled templates beyond `UNUSED_CAP_MOBILE` (16) are evicted least-recently-used first, as styled ones
      already were. One is rebuilt on demand (5 to 20 ms) when a building needs it.
- **`tools/qa/mobile-mem.mjs`** counts every WebGL allocation as the page makes it (an init script wraps the context).
  After a full GC it also reads the JS heap and the ArrayBuffers' memory (`Runtime.getHeapUsage`).
  - The run: the village, a Burrow (B8), a fight there (60 more monsters on the hero for 6 s), two more Burrow trips back
    to back, and a zone dungeon. The village is measured after each trip.
  - **Before the diet**: ArrayBuffers 241 MB in the village, 600 to 670 MB in the Burrow and 535 MB in the zone. Back in
    the village they grew trip by trip: 347, 412, then 440 MB.
  - **After** (Mobile):

    | Stop | GPU | ArrayBuffers | JS heap |
    |---|---|---|---|
    | Village | 202 MB | 232 MB | 84 MB |
    | Burrow B8 | 322 MB | 283 MB | 98 MB |
    | **The fight** | 330 MB | **290 MB** | 99 MB |
    | Village after trips 1, 2 and 3 | 193 MB | 268 MB each time | 89 to 90 MB |
    | Zone | 264 MB | 311 MB | 102 MB |

    - The village no longer grows trip by trip. What stays after the first trip (about 36 MB) is mostly villager rigs
      kept while they're indoors.
    - In a big Burrow fight the game now holds about 0.7 GB (290 + 330 + 100 MB), against 1.1 GB before.
  - **High on the same phone** (before the diet): GPU 513 to 655 MB, with textures at 359 to 394 MB (4096 shadow maps
    and 2048 skins).
  - The checks:
    - in each Burrow, 195 geometries are marked released and 123 have let go (the rest go when first drawn), and two
      frames draw 92 to 175 calls;
    - a building template evicted by the cap is rebuilt and drawn;
    - screenshots at `tools/qa/tmp/mobile-mem/burrow3.png` and `village4.png`.
    - The verdict: GPU at most 600 MB at any stop, and on Mobile at most 400 MB of ArrayBuffers in the fight
      (`AB_MAX`).
  - `performance.memory.usedJSHeapSize` counts the JS heap and the ArrayBuffers together.

### 12.8 QA
- **`tools/qa/touch-lib.mjs`**: a phone- or tablet-like Chrome (hasTouch, isMobile, a DPR) and fingers driven through
  CDP `Input.dispatchTouchEvent`, so multi-touch arrives as real touch and pointer events.
- **`tools/qa/s27-touch.mjs`** (844×390 at DPR 3), 37 checks:
  - the play controls: the touch device and the HUD; 44 px targets; the stick (direction, analogue, sprint); ground and
    villager taps; pinch; a monster tap locks; the attack button; every skill; a charge; roll; Drag aim and its cancel;
    the belt; the weapon badge; the prompt and the attack button using; the hero tap and wheel; the meal; the bag and
    menu; the Touch settings and left-handed;
  - the menus: the bag fits a phone; drag, tap-to-move, double-tap to equip, long press for details; the shop (long
    press, tap to buy, the flip); the K panel (learn, the charge drawer); dialogue taps and choices;
  - build, decorate, cooking and fishing by touch;
  - portrait (the overlay pauses); the Mobile preset picked at the first start; back to the mouse and back.
- **`tools/qa/touch-shots.mjs [phone|tablet|all] [names]`** → `tools/qa/tmp/touch-shots/`. The shots: hud, stick,
  sprint, wheel, wheel5 (a fake fifth hero), left, controls, dark, dungeon, fight, cancel, charge, build-palette,
  build, reel, decorate-palette, decorate.
- **`tools/qa/mobile-ui.mjs`**: 29 views at phone size. These cover the HUD, every panel, the skills panel with each
  hero's trees, the game menu's pages, the shop, stash, cooking, the workbench, the Travel Map, the gift and seed pickers,
  a house card, remodel, dialogue, a guide, the reel, build, the home, decorate, portrait and the title.
  - For each view it lists text under 12 px, tappables under 44 px and panels cut off. The skill tabs must fit their
    row, labels and all. Screenshots go to `tools/qa/tmp/mobile-ui/`.
  - Three views had been auditing nothing: the bag, the character sheet and decorate named panel classes that don't
    exist (`.p-inventory`, `.p-character`, `.p-decorate`; they are `.p-inv`, `.p-char`, `.p-decor`).
  - Fixing that turned up the weapon swap's key cap and size, and the character sheet's + buttons at 29 px. Both are
    44 px on touch now.
- **`tools/qa/mobile-perf.mjs`** and **`tools/qa/mobile-mem.mjs`** (12.7).
- **prod-smoke's `touch` case**, on the built bundle: a mobile page, a CDP stick drag moves the hero, touch is the device,
  the controls are up with 6 slots, preset 4, pixel ratio 1, `.m-phone`, and the manifest is linked.
  - It then takes a Burrow trip and a second floor. Each floor's chunks must have let go of their arrays and still draw.
- **Any scenario on the Mobile preset**: `QA_QS=q=4 node tools/qa/s1-roundtrip.mjs` (`lib.mjs boot` appends `QA_QS`).
  s1 (13/13) and s13 (10/10) pass that way.
- test-rpg's CONTROLS section has 9 touch checks. s9, s25 and s26 stay green. s26's Graphics check and test-rpg's Deck
  checks now expect the fifth preset (Mobile) and the 30 cap.
- **Full run-all** (the machine was 83 to 94% busy throughout): s27 passed 37/37.
  - s8, s12, s15 and s23 failed on timing or perf under the load, and each passed when run alone.
  - profile-horde fails its CPU gates even alone at this load. CT-5's own cost on a desktop page in a Burrow fight is
    0.005 ms a frame, so profile-horde needs a re-run on a quiet machine.
- Not tested here: a real phone. Next steps are the owner's Android and iPhone checks (docs/ITCH.md, "Mobile").

### 12.9 As built: CT-6, iPad and phones on itch (2026-10-08)
The owner's iPad report from itch: the page zoomed in by accident and wouldn't zoom back out, full screen was easy to
leave, and itch's own buttons sat over the minimap and the hero, bag and menu buttons. What itch does on an iPad was
measured from its live page (docs/ITCH.md, "iPad and itch"). In short, iPadOS Safari sends a Mac user agent, so itch
embeds the game in the page at 1280 × 720. On a 1180 px screen that frame runs 100 px off the right, and itch's button
column floats over its top right. The iframe is allowed full screen (`allow="… fullscreen * …"`).
- **Gestures, from the first frame** (`index.html`, before the game loads):
  - Safari's `gesturestart` / `gesturechange` / `gestureend`, any multi-finger `touchmove` (or one with a `scale` other
    than 1) and `dblclick` are cancelled;
  - `html, body` are `touch-action: pan-x pan-y`, so there is no pinch or double-tap zoom anywhere and lists still
    scroll. WebKit intersects touch-action with the ancestors, so `none` there would stop the menus' lists scrolling.
    The boot screen is `none`;
  - no text selection, no long-press callout or "Save image" (`img`, `canvas`), no pull-to-refresh
    (`overscroll-behavior: none`);
  - `html.pinch-ok` turns all of it off. ui/touch.js's own guards respect it too.
- **"Zoomed in?" card** (`Mobile.zoomCheck`, `.m-hold .mh-zoom`):
  - **The top frame**: `visualViewport.scale` over 1.01. A viewport reset is tried first (the viewport meta is
    rewritten with `minimum-scale=1` and put back two frames later). Whether iPadOS honours that is part of the owner's
    test. If the page is still zoomed 400 ms later, the card shows.
  - **In a frame**: a cross-origin frame's `visualViewport.scale` is always 1, so the IntersectionObserver's visible rect
    of the document stands in. Under three quarters each way, the card shows with "Can't see all of Pawhaven?".
  - The card pauses the game (`ui.isPaused` includes `mobile.hold`), sets `html.pinch-ok` so a pinch reaches the page,
    and is drawn over the part on screen at its normal size (`placeHold`: the visual viewport, scaled by 1 / scale).
    It goes by itself when the zoom ends; "Play on" dismisses it until then.
- **"Back to full screen?" card** (`Mobile.fsCheck`, `.mh-fs`):
  - **In full screen** means `fullscreenElement` (or the webkit one), or, in a frame, a frame the screen's size (itch
    put the frame in full screen).
  - **When it ends**, checked 450 ms after a resize so a rotation doesn't count, or when the page is visible again, on a
    touch screen in landscape where full screen is possible: the game pauses under the card.
  - **Full screen** asks again (a user gesture; `webkitRequestFullscreen` before iPadOS 16.4). **Stay in a window**
    sets Settings › Controls › Touch › **Full screen: Off**, which also stops the first-tap full screen.
  - **No loop**: a third close within a minute stops asking for the visit, with a toast. It never asks without the API
    (an iPhone) or in the desktop app.
- **The top edge in full screen**: `edgeTop` 24 px goes into `--sa-t`, so the HUD, the touch buttons and the panels
  start below it (the minimap's top is at 33 px on an iPad). The stick doesn't start from a touch in that strip, since a
  drag down from there is iPadOS's exit.
- **itch's buttons and the off-page strip** (`Mobile.safe` / `itchInset`): on touch, each side of the safe area is the
  largest of four insets, so every layer (`--sa-*`) and the touch layout (`TouchControls.safe`) respect them all:
  - the device's own safe area;
  - the full-screen top edge;
  - the part of the frame the page doesn't show (the IntersectionObserver, when it sees at least 60% each way);
  - itch's buttons. **Auto** applies on itch (inside a frame on an `itch.zone` / `itch.io` host, with the itch build's
    `VITE_ITCH` flag, or with the QA's `?itch`), out of full screen and not in itch's maximized frame:
    - the button column's 80 px at the top (`clipT + 100` above 1300 px, where the column is fixed);
    - the Fullscreen button's 28 px at the bottom;
    - the frame's width past the screen's on the right. The observer can miss this, because a browser may widen the
      page's layout viewport to the frame, as Chrome's mobile emulation does.
  - Settings › Controls › Touch › **itch.io buttons**: Auto · Top (100 px top, 28 bottom) · Side (200 px right) · Off.
- **Saves**: on `pagehide` and whenever the page is hidden, besides game.js's `beforeunload` and every 30 s. iOS Safari
  doesn't always send `beforeunload`. There's no leave-page prompt.
- **Can't be fixed from inside the frame**: a zoom of itch's page that starts outside the game; Safari's swipe-down and
  ✕ exits from full screen and its edge swipe for Back; itch's own buttons, and the frame wider than the screen. The game
  keeps clear of those, pauses and offers one tap back. The itch dashboard settings that avoid most of it, and the
  owner's iPad checklist, are in ITCH.md "iPad and itch".
- **QA**:
  - **s27 k)**: 8 checks on an iPad (1180×820, DPR 2, iPad Safari's agent; `touch-lib.mjs` `IPAD`). They cover the
    guards; zoom (a mocked 2× `visualViewport`, because Chrome clamps CDP's page scale to `maximum-scale=1`); the first-tap
    full screen and the 24 px edge; the card's tap back, Stay in a window and the loop guard; the itch.io buttons Top
    setting; the pagehide save; and portrait.
    - `S27_ONLY=k node tools/qa/s27-touch.mjs` runs only this section. Shots go to `tools/qa/tmp/ct6/`.
  - **`build-itch --test`**: after the desktop iframe pass, an iPad on a replica of itch's page (the measured column
    boxes, a 1280 × 720 frame 20 px down, the Fullscreen button). It checks that no touch control lies under itch's
    buttons or off the 1180 px page, and saves `release/itch-test-ipad.png`.

### 12.10 As built: CT-7, the owner's phone and iPad report (2026-10-08)
The report: Settings ran off a phone's screen, the iPad in full screen was cut off at the sides, and a stick drag on the
left sometimes dragged the whole screen. Settings also lost two rows (below).
- **One cast, no choice** (`actors/heroModels.js`): Settings' "Hero models" (Samurai · Toybox · Storybook) and "Disney
  style" rows are gone. `chewyModel()` is always 'samurai' and `heroStyle()` 'disney', so the game plays the samurai Chewy
  with the Toybox Moka, Poe, Floofy and Foosy.
  - Old saves' choices (`chewy.model`, `chewy.modelV`, `chewy.style`, and the settings' `disneyChewy` / `heroModel`) are
    dropped quietly on the first call.
  - The Toybox cast never falls back to a Storybook model: a missing or still-loading Toybox rig plays its kit build
    (Toybox style), and the samurai Chewy falls back to the Toybox Chewy, then his kit.
  - `?chewymodel=toy|disney` and `?chewy=classic|disney` still work, for the QA and dev only.
- **Panels that fit a tablet** (`Mobile.fitTall`, `mobile.css` `.m-fit`). CT-5's fit (between the safe area's margins,
  the body scrolling inside) was phone-only (`.m-phone`).
  - On a tablet, Settings (about 1,000 px tall at the menus' 0.86) and Controls › Touch ran off the top and bottom of an
    iPad: opened from the title, −109 to 895 px on a 1180×820 screen and −135 to 869 on a 1024×768 one; even the
    12.9" (1366×1024) lost a few px at the top.
  - Now a tablet's panel that would cross the safe area's margins where it sits (centred 20 px above the middle, 40 at
    the sides) gets `.m-fit`: the phone's fit with the title on top. Panels that already fit keep their layout.
  - Rows wrap on every touch screen (Graphics' five presets ran past a tablet's panel). The skill trees' three tabs share
    their row on a tablet too (a hero's third tab ran past the panel's side).
  - A tablet's ✕, the bag's weapon swap and build's overlay toggles reach 44 px through a wider hit area.
  - The Keyboard and Controller tabs' binding buttons are 44 px on touch.
  - Phones were already fitted in Chrome at 844×390, 932×430 and 667×375 (every Settings view scrolls inside). What the
    owner's phone did differently can't be reproduced here; the likely causes are a phone or foldable whose short side
    is over 500 px (it was a "tablet", with no fit) or Safari's own bars. Both are covered now.
- **The iPad in full screen** (`Mobile.reseen`). The IntersectionObserver that measures the part of the frame on the page
  only reports when the visible fraction crosses a threshold.
  - So a frame that grew while staying wholly visible kept its old rect. itch's frame put in full screen on a
    1366×1024 iPad stayed "1280 × 720", and the HUD kept clear of a strip that wasn't there: 86 px at the right and
    304 px at the bottom, so the controls sat in from the side and up the screen. A 1180×820 iPad lost 100 px at the
    bottom the same way.
  - A resize, rotation or full-screen change now drops the old rect and observes again, which reports the new one.
  - In full screen the frame is the screen, so the off-page clip isn't applied at all, and a rect bigger than the frame
    (a stale one) is ignored.
  - itch's insets already applied only out of full screen; they still do.
- **No page pan from a drag** (`index.html`, `touch.css`):
  - CT-6 made `html, body` `touch-action: pan-x pan-y` so lists scroll. A thumb that landed on anything but the canvas
    in the stick's half (the quest tracker, the portrait card, a loot label) could pan the page, and one-finger
    touchmoves were never cancelled. Inside itch's frame on an iPad, an uncancelled touchmove scrolls itch's page around
    the frame. So the stick sometimes "picked up the whole screen".
  - Now `index.html` cancels every one-finger touchmove that didn't start in something that scrolls (a menu's list, a tab
    row, a slider, a text field), from the first frame. `html.pinch-ok` (the zoom card) still lets it through.
  - The world labels, the HUD and the touch layer are `touch-action: none`, as the canvas was. Only the menus keep their
    pan.
  - Safari's edge swipe for Back can't be cancelled by a page; the stick's base keeps clear of the edge.
- **QA**:
  - **s27 k)** has 10 checks now:
    - in full screen at 1180×820, 1194×834, 1366×1024 and 1024×768, the canvas and every HUD edge element fill the
      screen with nothing kept clear but the 24 px top, and Settings and Controls › Touch fit, scrolling;
    - ~2 s of big stick circles with a real finger (CDP) walk the hero with every touchmove cancelled and the page and
      visual viewport at 0, and a drag from the quest tracker is cancelled too.
    - Shots: `tools/qa/tmp/ct7/ipad-fs-<size>.png`, `-settings.png`, and `ipad-fs-portrait.png` (the rotate card).
  - **`mobile-ui.mjs`** didn't catch Settings because it only ran at a phone's size, where the fit existed, and its "cut
    off" was the bare screen with 2 px of slack.
    - It now measures against the safe area, flags a body whose content runs past it without scrolling (or is clipped
      at a side), and audits Settings with every row (the debug row too), each Controls tab (touch, keyboard, controller)
      and Settings from the title.
    - `DEVICE=ipad` runs it all at 1180×820, DPR 2, with iPad Safari's agent. Both pass.
  - **`build-itch --test`**: the iPad replica (now with a scrolling page under the game) adds a stick drag in big circles
    and a drag from the quest tracker (itch's page and the frame never scroll, and every touchmove in the frame is
    cancelled, because Chrome won't chain the frame's scroll to the page as Safari does), then itch's Fullscreen button:
    the HUD fills the screen with only the top 24 px kept.
    - It also runs a 1366×1024 iPad Pro, whose frame fits the page windowed (the stale-rect case).
    - Shots: `release/itch-test-ipad[-pro][-fullscreen].png`.
- **Only a real iPad and phone can confirm**: Safari's own scroll chaining from the frame to itch's page (Chrome doesn't
  chain it, so the tests check the cancelled touchmoves instead); iPadOS element full screen inside itch's frame and
  the sizes it reports; Safari's toolbars over a phone's Settings; and the edge swipe for Back next to the stick.
