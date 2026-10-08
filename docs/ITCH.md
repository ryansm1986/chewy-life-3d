# Publishing on itch.io

The game is **Pawhaven** on itch.io: <https://holiestdiver.itch.io/pawhaven> (renamed from "Chewy Life 3D" on 2026-10-06;
the repo folder, the code's internal names and the save keys keep the old name, so existing saves still load). It ships as an itch.io **HTML** project: a zip of the production build that itch serves from its CDN inside an
iframe on the game page.

## Build the zip

| Command | What it does |
|---|---|
| `npm run build:itch` | Production build with relative URLs into `dist-itch/`, checked against itch's limits, zipped to `release/pawhaven-itch-v<version>.zip` |
| `npm run test:itch` | The same, then boots the build the way itch serves it (an iframe pointing into `/html/<id>/`) in headless Chrome. It fails on console errors, 404s or any request that leaves the build, and saves `release/itch-test.png` |
| `npm run fonts` | Re-subsets the UI fonts (see below). Not part of the build |

The version in the zip name comes from `package.json`, so bump it before each upload you want to keep apart.

`tools/build-itch.mjs` checks:

- **Relative URLs:** itch serves the game from a sub-folder, so a root-absolute `/assets/...` URL works on the dev server
  but 404s on itch. The build uses `base: './'`, and the check fails on any `src="/…"`, `url(/…)` or `"/assets/…"` left
  in the HTML, CSS or JS.
- **itch's limits** (from <https://itch.io/docs/creators/html5>):
  - `index.html` at the zip root;
  - at most 1,000 files;
  - at most 500 MB extracted, and 200 MB for any single file;
  - paths of at most 240 characters (UTF-8, case-sensitive).

  Today's build is about 136 files and 30 MB, or 21 MB zipped.
- **External URLs:** it lists any external URLs in the bundle. The game makes no network requests outside its own
  files: the fonts are self-hosted, and the test fails if anything else is fetched.
- **Font coverage:** it warns when the source has characters newer than the font subset (`src/ui/fonts/chars.txt`).
- **Licences:** it writes `licenses/` into the zip.

## Upload

1. On itch.io go to **Dashboard → Create new project**.
2. Set **Kind of project** to **HTML**.
3. Under **Uploads**, upload the zip and tick **This file will be played in the browser**.
4. Set the **Embed options**:
   - **Embed in page**, with the viewport at **1280 × 720**. The game scales its UI to any size, so 16:9 is only the
     default frame. For iPads, **Click to launch in fullscreen** is better: see
     [iPad and itch](#ipad-and-itch-ct-6) below.
   - **Fullscreen button**: on.
   - **Click to Play**: on. Visitors don't download 21 MB until they choose to play, and the click also unlocks audio.
   - **Mobile friendly**: on, with **Orientation: Landscape**, once the owner has played it on a real phone (see
     [Mobile](#mobile) below). Until then, leave it off.
   - **Scrollbars**: off.
5. Answer the **AI generation disclosure** on the edit page honestly. Much of this game's code, models, textures and
   text was made with AI tools.
6. Save as **Draft** (or **Restricted** with a password), open the page, and play through: title, New Game, the village,
   a Burrow, then Settings. Make it public once you're happy with it.

## Push with butler (`npm run push:itch`)
itch's command-line uploader, **butler**, uploads only what changed since the last push, and keeps a version history.
- **Install**: butler is installed at `%LOCALAPPDATA%\butler\butler.exe` (from itch's official
  `broth.itch.zone/butler/windows-amd64`). `tools/push-itch.mjs` finds it there, on PATH, or in `$BUTLER`.
- **Sign in once**: run `"%LOCALAPPDATA%\butler\butler.exe" login` yourself. It opens the browser to approve, and saves
  the credentials on this PC. (Or set `BUTLER_API_KEY` from itch.io → Settings → API keys.)
- **Push**: `npm run push:itch` builds and tests (`build-itch.mjs --test`), then runs
  `butler push dist-itch holiestdiver/pawhaven:html5 --userversion <package.json version>`.
  - The target and channel are in `package.json` under `"itch"`.
  - Options: `-- --skip-build` (push the existing `dist-itch/`), `-- --dry-run`.
  - Bump `version` in package.json for each release you want labelled.
- **First push only**: on the game's edit page, the new `html5` upload appears under Uploads. Tick **This file will be
  played in the browser**, and set the embed options above.
- **Push a committed version**, not a tree with agents' unfinished work in it. Make a clean copy first:
  - run `git worktree add --detach <dir> HEAD`;
  - link `node_modules` into it;
  - run `node tools/push-itch.mjs` there.
  That's how the first push (from 6d53a3b plus the rename) was made.

## Saves on itch

The game saves to `localStorage` under the keys `chewy3d.save`, the settings, `chewy.style` and `chewy.model`. On itch
that storage belongs to itch's game-hosting domain, not to itch.io, so:

- A save lives in one browser on one machine. A private window, or clearing site data, loses it.
- A new upload should keep saves: the origin stays the same and only the upload path changes. The game upgrades older
  saves as it loads them (`normalizeHeroes`, the skill-set migrations in `rpg/actions.js`). Check this with a Draft
  upload before relying on it.
- itch appears to serve all HTML games from one shared domain, which would mean one shared storage quota. Keep the save
  small and the keys prefixed, as they are now.

## Fonts

The UI fonts are self-hosted from `src/ui/fonts/`, which `src/ui/fonts.css` imports from `main.js`:

- **Fredoka**, a variable font covering every weight;
- **M PLUS Rounded 1c** in 500, 700 and 800, for the Japanese labels.

Both are under the SIL Open Font License 1.1. `tools/fonts/build-fonts.py` downloads them from the google/fonts repo and
subsets them to Latin, kana, CJK punctuation and every non-ASCII character used in `src/` and `index.html`. That keeps
them to about 290 KB instead of several MB for full Japanese fonts.

After adding Japanese text or new symbols, run `npm run fonts`, which needs `pip install fonttools brotli`.
`build:itch` reminds you when it's due. Characters missing from the subset still show, but in a fallback system font.

## Licences

`licenses/` in the zip contains:

- the two font OFL texts;
- the licence files of the runtime npm dependencies: three (MIT), postprocessing (Zlib) and n8ao (ISC). The minified
  bundle drops their source headers.

Everything else that ships was made for this project: the models and textures from the Blender pipeline, the procedural
world, and the WebAudio-synthesised music, effects and voices. If you add a third-party asset, add its licence here
(`tools/build-itch.mjs`, the licences step).

## Mobile

Phones and tablets play in landscape with touch controls (CT-5; docs/CONTROLS.md §12; README "Touch").

**What works:**
- The whole game: moving, sprinting, fighting with every skill (charged, auto or drag aimed), rolling, potions and
  meals, switching heroes, talking, the menus, build and decorate, fishing, cooking, the garden and the shops.
- The menus fit a phone: one panel at a time, scrolling inside, with the title, tabs and close at the bottom.
  - No text is under 12 px and no tappable is under 44 px.
  - Tap, drag, double-tap (the right-click) and long-press (the details).
- **The Mobile graphics preset** is picked on the first start: a 1:1 pixel ratio, no AO, light shadows, Low grass, half
  the particles, 1024 hero skins and a 60 fps cap.
- Holding the phone upright shows a "turn your phone" card and pauses the game.
- Safe areas: the notch and home bar are kept clear.
- Audio starts on the first touch.

**Browsers:**
- **Android Chrome** (and Samsung Internet, Firefox): the first tap goes full screen and locks landscape. This is the
  best experience. Haptics work.
- **iPhone Safari**: no full screen for a web page, so the game plays with the browser bar, and Safari has no
  vibration. Inside itch's page, itch's own full-screen view is the way.
  - *Add to Home Screen* runs it full screen only when the game is served on its own (the build ships a web manifest
    and icons). On itch it adds the itch page instead.
- **iPad Safari**: full screen works on an element, and a swipe down from the top edge leaves it. The tablet layout
  uses bigger buttons. iPadOS tells websites it's a Mac, so itch treats an iPad as a desktop: see
  [iPad and itch](#ipad-and-itch-ct-6).
- WebGL 2 is required (iOS 15 or later, any recent Android).

**Embed settings for mobile:** tick **Mobile friendly**, set **Orientation** to **Landscape**, and keep the viewport at
1280 × 720. On a phone itch shows a launch button and opens the game in its own full-screen view. An iPad is different
(it isn't a "mobile" to itch): see the next section.

**Before ticking it (the owner's checks):** these have only been tested in desktop Chrome's phone emulation (CDP touch
at 844×390 DPR 3 and 1180×820), so test on real devices:
1. An Android phone (Chrome): play a Burrow fight, open the bag and the shop, build something. Watch the frame rate:
   Settings › Graphics shows the preset, and Settings › Frame cap 30 is the fallback.
2. An iPhone (Safari), ideally an older one with 4 GB or less:
   - **Memory** was the risk. On the Mobile preset the game now holds about 0.5 GB in the village (200 MB GPU,
     230 MB of geometry arrays, 85 MB of JS).
   - In a big Burrow fight it holds about 0.7 GB (330 MB GPU, 290 MB of arrays), against 1.1 GB before the memory diet.
     The village no longer grows trip by trip (CONTROLS §12.7).
   - Safari reloads a tab that uses too much memory, so play two dungeon trips in a row and see whether the page
     reloads.
3. A tablet, if one is handy.

The first load is about 30 MB, which is worth knowing on mobile data.

### iPad and itch (CT-6)

The owner's report from an iPad (2026-10-08): the page zoomed in by accident and wouldn't zoom back out, full screen
was easy to leave, and itch's own buttons sat over the minimap and the hero, bag and menu buttons.

**What itch does on an iPad.** This was measured on the live game page (its markup, `game.css` and `game.min.js`, fetched
2026-10-08, and laid out in Chrome at iPad sizes), not guessed:
- itch decides "mobile" from the browser's user agent (`/Android|webOS|iPhone|iPad|iPod|…/`). **iPadOS Safari sends a Mac
  agent by default**, so an iPad gets the desktop page: the game **embedded in the page** at the dashboard size
  (1280 × 720), not itch's mobile full-screen launch.
- On an iPad in landscape (1180 px wide) that frame is wider than the screen: its right 100 px are off the page, and the
  page can be scrolled and zoomed sideways.
- itch's `#user_tools` column ("View all by HoliestDiver", "Follow HoliestDiver", "Add To Collection") floats 10 px in
  from the page's top right whenever the page is 960 px wide or more. Each button is 21 px tall (25 above 1300 px), 10 px
  apart, and up to 158 px wide (183). The frame starts 20 px down the page, so the column covers about the frame's top
  74 px by 168 px from the visible right edge. Narrower pages (an iPad in portrait, phones) put the column in a bar above
  the game instead.
- **Fullscreen button** (when on): a 30 px button 8 px in from the frame's bottom right, at 40% opacity, over the game.
- The iframe has `allowfullscreen` and `allow="autoplay; fullscreen *; …; gamepad; …"`, so **the game may use the
  Fullscreen API** from inside the frame. That is how it went full screen on the first tap (CT-5). iPadOS leaves element
  full screen on a swipe down from the top edge, or the ✕ Safari shows in the top-left corner.
- itch's "launch in fullscreen" asks for the Fullscreen API on the frame on a phone. Where that fails (an iPhone) it
  "maximizes" the frame instead: the frame covers the whole window (`position: fixed`, `z-index: 1000`), over itch's own
  buttons, and the browser's Back button returns to the page.
- A forum report says that ticking **SharedArrayBuffer support** (Frame options) makes itch open the game in a new tab on
  an iPad instead of full screen. That hasn't been tested here.

**What the game does now** (CONTROLS §12.9):
- **No zoom from inside the game.** From the first frame, even on the loading screen, the page cancels Safari's gesture
  events, any two-finger touchmove and double-taps, and the whole page is `touch-action: pan-x pan-y` (lists still
  scroll). Text can't be selected, and a long press shows no "Save image" menu. The game's own two-finger pinch still
  zooms the camera.
- **"Zoomed in?" card.**
  - When the game is the top page (served on its own, or a home-screen app), it reads `visualViewport.scale`. Over 1.01
    it first tries a viewport reset (the viewport meta is changed and put back). If that doesn't work, a card asks for a
    pinch, pauses the game, and lets that one pinch through to the page.
  - Inside itch's frame, Safari always reports a scale of 1, so the game watches how much of its frame the page shows
    instead. Under three quarters each way, the same card shows ("Can't see all of Pawhaven?").
  - "Play on" dismisses it.
- **"Back to full screen?" card.**
  - If full screen closes during play on a touch screen, the game pauses and one tap goes back.
  - **Stay in a window** is remembered (Settings › Controls › Touch › Full screen: Ask · Off; Off also stops the
    first-tap full screen).
  - It never loops: a third close within a minute stops asking for that visit. It never asks where full screen isn't
    possible (an iPhone).
- **The top edge.** In full screen nothing you can touch sits in the top 24 px, and the stick doesn't start from there.
  That edge is iPadOS's swipe-down exit.
- **itch's buttons and the off-page strip.** Inside a frame on itch (detected by the `itch.zone` host or the itch build's
  flag), the touch layout keeps clear of itch's button column (the top 80 px, or 100 px on a page wider than 1300 px),
  of the Fullscreen button's corner (28 px at the bottom), and of any part of the frame the page doesn't show (the
  100 px off a 1180 px iPad). All of it goes into the same safe-area insets as a notch, so every layer respects it.
  Settings › Controls › Touch › **itch.io buttons**: Auto · Top · Side · Off, in case itch moves them. Nothing is reserved
  in full screen, or in itch's maximized frame.
- **Saves** on `pagehide` and when the page is hidden (switching apps), as well as `beforeunload` and every 30 s. iOS
  Safari doesn't always send `beforeunload`. There's no "leave page?" prompt: progress is already saved.

**What can't be fixed from inside the frame:**
- A zoom of itch's own page that starts outside the game (on the page around it). The game can only notice it (the
  card above) and let a pinch through. Since the game blocks pinches on itself, a page zoomed in until the game fills
  the screen used to be stuck. That was the owner's "couldn't unzoom".
- Safari's swipe-down exit from full screen, its ✕, and the edge swipe for Back. These are Safari's, and a web page
  can't cancel them. The game pauses and offers one tap back instead.
- itch's own button column and the frame wider than the screen. The game can keep clear of them, but not move or hide
  them.

**itch dashboard settings to change** (the game's edit page → **Embed options**). Step by step:
1. Open <https://itch.io/dashboard>, then **Pawhaven → Edit game**, and scroll to **Embed options**.
2. **Choose how your game is played** → pick **Click to launch in fullscreen**.
   - On a computer and on an iPad, "Launch game" then fills the browser window (itch's maximized frame), covering
     itch's own buttons. The frame is no longer wider than the screen, so the page has nothing to scroll or zoom
     around the game.
   - On a phone it already does this whatever you pick (with **Mobile friendly** ticked).
   - This is the main fix for all three problems.
3. Keep **Viewport dimensions** at **1280 × 720**: in full-window mode it only sets the aspect of the "Launch" box.
   - If you'd rather keep **Embed in page**, set **1024 × 640** instead. That fits an iPad's width in landscape, so
     nothing is off the page. The game still keeps clear of itch's buttons.
4. **Mobile friendly**: tick it, with **Orientation: Landscape** (phones then launch straight into itch's full-screen
   view).
5. **Fullscreen button**: on is fine (the game keeps 28 px clear for it). Turn it off if a tester taps it by accident
   near the attack button.
6. **Automatically start on page load**: leave off (Click to Play), as before.
7. **Frame options → SharedArrayBuffer support**: leave off for now. It may open the game in its own tab on an iPad
   (a forum report), which would make zoom detection and Add to Home Screen work fully. Try it on a Draft upload only if
   the iPad test below still has problems.
8. **Save**, then open the page on the iPad and run the checklist.

**The owner's iPad checklist** (the next test; desktop Chrome can't emulate Safari's zoom and full-screen gestures
exactly):
1. Open the game page in Safari, in landscape. Note what itch shows: a "Run game" box in the page, or "Launch game"
   (full window).
2. While it loads, pinch on the game and double-tap it: the page shouldn't zoom.
3. In play, double-tap the minimap, the bag button and the quest text: no zoom.
4. The first tap goes full screen. Nothing sits right at the top edge, and the minimap and buttons start a little lower.
5. Swipe down from the very top to leave full screen. The game pauses under **Back to full screen?**. Tap **Full
   screen** and play resumes. Do it again and tap **Stay in a window**: no more cards. Settings › Controls › Touch › Full
   screen → **Ask** turns it back on.
6. Windowed in the page (if you kept Embed in page): itch's View all / Follow / Add To Collection buttons don't cover
   the minimap or the hero, bag and menu buttons, and nothing on the right is cut off.
7. Pinch the itch page around the game (outside the frame) to zoom in, then look at the game. Does **Can't see all of
   Pawhaven?** appear? Does a pinch on it zoom the page back out? Report either way, because Safari's side of this
   can't be emulated here.
8. Long-press an icon and some text: no "Save image" menu, no text selection.
9. Switch to another app mid-play and come back: the game asks to go back to full screen. Close the tab, reopen the
   page: the progress is still there.
10. Settings › Controls › Touch › itch.io buttons: try **Top** and **Side** to see the room each keeps, then set it back
    to **Auto**.

## Known gaps before a public release

- **Low-end GPUs:**
  - Settings → Quality **Low** turns off AO and tilt-shift and drops the pixel ratio at runtime.
  - Done (ROADMAP R-2, CT-3): grass and detail density now follow the saved Graphics setting at boot, as well as
    `?q=`. A Steam Deck-sized screen (1280×800) starts on the lighter **Deck** preset.
  - The village is about 2.6M triangles.
- **First load:** about 30 MB over the CDN. It took about 10 s to reach the title locally, and will be longer on slow
  connections.
