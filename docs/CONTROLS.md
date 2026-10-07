# Controls: gamepad, Steam Deck, touch (design)

Status: **CT-1 and CT-2 done**; **CT-3 built** (2026-10-06, in review). The as-built notes are §8 (CT-1), §9 (CT-2)
and §10 (CT-3, with the polish before it). CT-4 and CT-5 are planned. Tracked in [ROADMAP.md](ROADMAP.md) as CT-1 to
CT-5.

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
