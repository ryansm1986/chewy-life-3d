# The desktop app (Windows, Linux and the Steam Deck)

Pawhaven also ships as a desktop app: an Electron shell that plays the same production build as the web and itch
versions, from its own files, full screen, with the controller. It is how the game runs on a **Steam Deck** (added
to Steam as a non-Steam game). Design: [CONTROLS.md](CONTROLS.md) §5; as built: §11. Tracked as CT-4 in
[ROADMAP.md](ROADMAP.md).

## Building it

```
npm run build:desktop                 # Windows x64 + Linux x64 → release/desktop/
npm run build:desktop -- --win        # only Windows
npm run build:desktop -- --linux      # only Linux
npm run build:desktop -- --dir        # only the unpacked folders (quick: for testing)
```

| File in `release/desktop/` | What it is |
|---|---|
| `Pawhaven-<version>-linux-x64.AppImage` | **The Steam Deck build.** One file: mark it executable and run it. |
| `Pawhaven-<version>-linux-x64.tar.gz` | The same app as a folder (SteamOS or any x64 Linux), executable bits included. |
| `Pawhaven-<version>-win-x64.zip` | Windows: extract anywhere and run `Pawhaven.exe`. |
| `Pawhaven-<version>-win-x64-portable.exe` | Windows, one file. It unpacks itself on every start, so it starts slower than the zip. |
| `win-unpacked/`, `linux-unpacked/` | The unpacked apps (the QA runs `win-unpacked/Pawhaven.exe`). |
| `pawhaven-game-<version>.zip`, `update.json`, `release-notes-<version>.md` | Written by `npm run release:desktop` (also with `--dry-run`): the content pack, the manifest and the release text (see "Releasing an update"). |

- The first build downloads Electron for each platform and the AppImage runtime (they are cached). After that it takes
  about two minutes.
- The game inside is a normal production build with relative paths (as the itch build), in `dist-desktop/app/game/`.
- Electron and electron-builder are **devDependencies only**. The web build (`npm run build`) and the itch build
  (`npm run build:itch`) never include them.
- The Windows builds are **not code-signed**. The first time, Windows SmartScreen may say "Windows protected your PC":
  click **More info → Run anyway**.

## Playing on Windows

1. Extract the zip, for example to `C:\Games\Pawhaven\`.
2. Run `Pawhaven.exe`.

It opens full screen:
- **F11** or **Alt+Enter** switches to a window and back, as does Settings › **Full screen**. The app remembers which.
- **Quit** is on the title screen, and **Quit game** in the pause menu. Both save first.
- A controller works as soon as you press a button. The game switches between it and the mouse and keyboard on its
  own.

## Putting it on a Steam Deck

### 1. Get the AppImage onto the Deck
Switch to **Desktop Mode** (hold the power button → Switch to Desktop). Then use any of these:
- **From GitHub** (0.6.5 and later): https://github.com/ryansm1986/chewy-life-3d/releases/latest in the Deck's
  browser. After this one install it updates itself (see "Updates from inside the app" and "The owner's one-time Deck
  steps").
- **Download it** in the Deck's browser (for example from the itch.io page or a cloud drive). It lands in
  `~/Downloads`.
- **A USB stick or SD card**: copy the AppImage onto it on the PC, plug it into the Deck (a USB-C hub or adapter), and
  copy it off in the Dolphin file manager.
- **A network share**: share a folder on the PC, then in Dolphin open `smb://<pc-name>/<share>` in the address bar.
- **KDE Connect** (installed on SteamOS) or `scp` (after `passwd` and `sudo systemctl start sshd` on the Deck) also
  work.

Move it somewhere permanent, for example `/home/deck/Games/Pawhaven/`. Steam will point at this path, so don't move it
afterwards.

### 2. Mark it executable
Copying through a browser, a USB stick or a share drops the executable bit. Either:
- in Dolphin: right-click the AppImage → **Properties → Permissions** → tick **Is executable** → OK; or
- in Konsole: `chmod +x ~/Games/Pawhaven/Pawhaven-*.AppImage`

Double-click it to check that it starts.

**The tar.gz instead**: `tar xzf Pawhaven-<version>-linux-x64.tar.gz -C ~/Games`. This keeps the executable bits; the
program is `~/Games/Pawhaven-<version>-linux-x64/pawhaven`.

### 3. Add it to Steam
1. In Desktop Mode, open **Steam**.
2. Choose **Games → Add a Non-Steam Game to My Library… → Browse…**.
3. Pick the AppImage. Set the file type to **All Files** if it isn't listed.
4. Click **Add Selected Programs**.
5. In the Library, right-click it → **Properties**:
   - name it **Pawhaven**;
   - optionally set its icon (`tools/desktop/icon.png` in the repository).

### 4. The controller
In the game's **Properties → Controller**, set **Steam Input** on with the **Gamepad** template ("Gamepad with Mouse
Trackpad" is also fine). Steam then presents the Deck's controls as an Xbox controller, which is what the game
expects:
- the left stick moves; the right stick aims;
- A attacks or talks; X, Y, RB, RT and LT are the skills; B rolls;
- the D-pad is potions, the meal and interact; View is the map; Menu is the game menu.

The full mapping is in the README. Don't use a keyboard template ("Keyboard (WASD) and Mouse", "Web Browser"): the
game would see a keyboard, not a controller.

### 5. Launch options
None are needed. Steam sets `SteamDeck=1` for games it starts on a Deck. The app passes that on, and the first start
picks the **Deck** graphics preset with a larger UI. You can change both in Settings.

Optional, in **Properties → General → Launch Options**:

| Option | What it does |
|---|---|
| `--windowed` | Start in a window this time. |
| `--deck` / `--no-deck` | Treat the machine as a Deck, or not, whatever Steam says. |
| `--no-sandbox` | Only if it won't start (see Troubleshooting). |

### 6. Play in Game Mode
Return to Gaming Mode (the **Return to Gaming Mode** icon on the desktop). Pawhaven is in the Library under
**Non-Steam**.
- The **frame rate**: the Deck preset aims at 60 fps. Settings › **Frame cap** (60 / 40) or the Quick Access menu's
  frame-rate limit can hold it steady. The Deck's own 40 Hz limit is the smoothest 40.
- **Quit** from the game's menu (it saves), or with Steam's **Exit game**. Closing the window saves too.

## Where saves live

The app keeps its saves (the game's localStorage) and its window state (`window.json`: full screen or the window's
size and place) in its own folder:

| System | Folder |
|---|---|
| Windows | `%APPDATA%\Pawhaven\` (zip and portable alike) |
| Linux, Steam Deck | `~/.config/Pawhaven/` |

- To back up or move a save, copy the whole folder.
- These saves are separate from the browser and itch versions' (a different origin). There's no import between them
  yet.
- Deleting the folder starts the game afresh (and resets Settings).

## Updates from inside the app (CT-9)

From 0.6.5 the app updates itself from the repository's GitHub Releases, so a Steam Deck never needs the file copied
over again. Tracked as CT-9 in [ROADMAP.md](ROADMAP.md).

### What the player sees
- **On the title screen**, a few seconds after it appears, the app looks for a newer version. If there is one, a card
  opens over the title:
  - "Update available: **v0.6.6**", what's new, the download size;
  - **Install now** and **Later**.
- **Install now** downloads the update with a progress bar, checks it, and restarts the game into the new version. A
  toast on the new title says "Pawhaven is now v0.6.6". It saves first if a game is running.
  - For a content update the "restart" is the window reloading into the new files. The app process stays, so in Game
    Mode Steam never sees the game stop and start. (The sketch said restart; a reload is the same for the player and
    avoids a relaunch under Steam.) Only a shell update really restarts the app.
- **Later** (or B / Esc) closes the card. It doesn't ask again until the app is started again.
- Closing the card during a download cancels it. The next Install resumes it.
- **Settings › About › Check for updates** checks by hand at any time. It says "You're up to date" or shows the same
  card. If it can't reach GitHub, it says so gently.
- The card works with the Deck's controller (the focus ring, the A / B glyphs), touch and the mouse.
- **Offline**, or if GitHub doesn't answer, the launch check stays silent: no card, no error.
- Saves are never touched. An update only adds files to the app's own update folder.
- The browser and itch builds never show any of this. The card needs the desktop app's `window.pawhaven.update`.

### Two kinds of update
Most releases change only the game. The Electron shell around it (`main.cjs`, `preload.cjs`, `updater.cjs` and
Electron itself) rarely changes.

1. **A content update (the usual kind).**
   - Every release publishes the game's production build as a zip, `pawhaven-game-<version>.zip` (about 35 MB:
     33.4 MB for 0.6.4), with its SHA-256.
   - The app downloads it into its update folder, checks the hash and unpacks it.
   - Then it switches `app://pawhaven` to serve the new files and reloads the window.
   - It works wherever the AppImage or exe lives. Nothing executable is replaced, and Steam keeps tracking the same
     process.
2. **A shell update (only when needed).** A release whose game needs a newer shell says so with `minShell`.
   - **On the Steam Deck (the AppImage):**
     - The app downloads the new AppImage next to the running one (`$APPIMAGE`), checks the hash and marks it
       executable.
     - It keeps the old one as `<name>.prev`, then renames the new one over the old name. A rename is atomic, so
       Steam's shortcut keeps working.
     - Then it restarts itself.
   - **On Windows, or Linux from the tar.gz:** the card offers **Open the download page**, the release in the
     browser.
     - A self-replacing, unsigned exe would need a helper script and would fight SmartScreen and Defender.
     - Windows still gets every content update in the app, which is nearly every release.

### How a content update is kept safe
- **The folder:** `userData/updates/` (`%APPDATA%\Pawhaven\updates\`, `~/.config/Pawhaven/updates/`):
  - `game-<version>/`: an unpacked game;
  - `downloads/`: zips being downloaded (`.part`);
  - `state.json`: which version is active, the previous one, a trial, and versions that failed.
  - The app only ever deletes inside this folder. (The sketch put `game-<version>/` straight in userData. A
    subfolder keeps "never delete user data" easy to prove.)
- **Which game runs:** the newest of the built-in game (inside the app) and the active update, if the update is
  newer than the built-in game and this shell is at least its `minShell`. After a shell update, the new built-in
  game is newer, so old update folders are pruned.
- **The switch:**
  - The zip is unpacked into a temporary folder.
  - It must hold `index.html` and a `content.json` naming the expected version.
  - The folder is renamed to `game-<version>/`, then `state.json` is rewritten (a temporary file, then a rename).
  - That rename is the switch. A crash at any point leaves either the old state or the new one, never a half.
- **The trial and the rollback:**
  - A newly installed version runs on trial. If the game hasn't reached `window.__ready` within 60 seconds, or its
    page crashes, the app goes back to the previous version (or the built-in one), marks the new one as failed, and
    reloads.
  - The title then says "That update wouldn't start, so Pawhaven went back to v0.6.5".
  - If the app is closed or killed during a trial, the next start rolls back first.
  - A failed version isn't offered on launch again. A manual check still offers it, saying "It didn't start last
    time".
- **Kept for rollback:** the active version and the one before it. Older update folders, finished zips, and half
  downloads of versions that are no longer newer are deleted.
- **Downloads resume:** a cut-off download is kept as `.part`, next to a note of its URL and hash. The next Install
  continues it with an HTTP Range request (GitHub's asset host supports them). A mismatch starts it afresh, and a
  failed hash check deletes it.

### Security
- **HTTPS only**, to three hosts:
  - `github.com`;
  - `objects.githubusercontent.com`;
  - `release-assets.githubusercontent.com`, where GitHub sends release downloads since 2025 (checked 2026-10-10).
- Every redirect hop is checked against the list. Anything else is refused.
- The manifest is fetched from `https://github.com/ryansm1986/chewy-life-3d/releases/latest/download/update.json`
  (no token, no API rate limit). It is size-capped and strictly validated.
- **Everything downloaded is hash-checked (SHA-256) before it is used.**
- Zips are unpacked with a strict reader:
  - only plain files and folders;
  - no absolute paths, no `..`, no links;
  - capped in file count and size.
- Downloaded game files only run as the game does today: inside the sandboxed `app://pawhaven` origin, with no Node
  access. The main process never executes anything downloaded, except the hash-checked AppImage of a shell update.
- The test switch `--update-url=` only accepts loopback addresses (`127.0.0.1`, `localhost`), so it can't point a
  player's app at another server.
- The release notes are shown as text, never as HTML.

### Releasing an update
```
npm run release:desktop -- --dry-run      # everything but GitHub: builds, packs, hashes, writes update.json, prints the plan
npm run release:desktop                   # the same, then a GitHub release vX.Y.Z with all the files
npm run release:desktop -- --no-build     # reuse the last full build:desktop (refused if dist-desktop was rebuilt since)
```
1. Bump `version` in `package.json` and commit as usual (`Pawhaven X.Y.Z: …`). The release script uses the
   commit's subject as the release notes, unless you pass `--notes "…"` or `--notes-file <file>`.
2. Push the commit. The script refuses a dirty tree or a commit that isn't on `origin`, because the tag would
   otherwise point at something else.
3. `npm run release:desktop`:
   - builds Windows and Linux (`build:desktop`);
   - zips the game (`pawhaven-game-X.Y.Z.zip`);
   - hashes every file and writes `release/desktop/update.json`;
   - creates the release as a **draft**, uploads the AppImage, the Windows zip, the portable exe, the game zip and
     `update.json`, then publishes it as the latest.
   - Clients only see a release once it is published, so they never find a half-uploaded one.
4. **`minShell` is worked out for you.**
   - The script fingerprints the shell (`main.cjs`, `preload.cjs`, `updater.cjs` and the Electron version) and
     compares it with the last release's `update.json`.
   - The same fingerprint keeps the last `minShell`, so every installed app takes the update as content.
   - A changed shell sets `minShell` to this version, so older apps get a shell update.
   - `--shell-compatible` keeps the old `minShell` anyway, for a shell change that the game doesn't depend on.
5. A real release needs `gh` logged in (`gh auth status`). It refuses a version that isn't newer than the latest
   release, or one whose release already exists.
   - The biggest file is the Windows zip, about 181 MB, well under GitHub's 2 GB per asset.

The dry run does the whole build. It reads the pack back with the app's own unzip and validates `update.json` with the
app's own checker, then prints the two `gh` commands it would run. It was run for 0.6.4 on 2026-10-10, and nothing was
published.

`update.json` (one per release, also an asset of it):
```json
{ "schema": 1, "name": "Pawhaven", "version": "0.6.6", "released": "2026-10-12", "notes": "…",
  "page": "https://github.com/ryansm1986/chewy-life-3d/releases/tag/v0.6.6",
  "content": { "url": ".../pawhaven-game-0.6.6.zip", "sha256": "…", "size": 41234567, "minShell": "0.6.5" },
  "shell": { "version": "0.6.6", "fingerprint": "…",
    "linux": { "url": ".../Pawhaven-0.6.6-linux-x64.AppImage", "sha256": "…", "size": 166000000 },
    "winZip": { "url": "…", "sha256": "…", "size": 0 }, "winPortable": { "url": "…", "sha256": "…", "size": 0 } } }
```

### The owner's one-time Deck steps
A Pawhaven from before 0.6.5 (if one is on the Deck at all) has no updater, so the Deck needs one last manual
install. Every version after that comes from inside the app.
1. **Publish the first updatable release** (0.6.5 or later) from the PC: bump the version, commit, push, then
   `npm run release:desktop`.
2. **On the Deck, in Desktop Mode**, open https://github.com/ryansm1986/chewy-life-3d/releases/latest in the browser
   and download `Pawhaven-<version>-linux-x64.AppImage`.
3. **Move it to `~/Games/Pawhaven/` and rename it `Pawhaven.AppImage`.**
   - Use a name without the version: a shell update replaces the file under the same name.
   - An older Pawhaven AppImage can be deleted.
4. **Mark it executable:** Dolphin → right-click → Properties → Permissions → **Is executable**. In Konsole:
   `chmod +x ~/Games/Pawhaven/Pawhaven.AppImage`.
5. **Point Steam at it.**
   - If Pawhaven is already in the Library: right-click it → **Properties → Shortcut**. Set **Target** to
     `"/home/deck/Games/Pawhaven/Pawhaven.AppImage"` and **Start in** to `"/home/deck/Games/Pawhaven/"`.
   - Otherwise, add it as a non-Steam game (step 3 of "Putting it on a Steam Deck").
   - Keep the controller settings (Steam Input on, the Gamepad template).
6. **Start it once from Game Mode.** Settings › About should show the new version with a **Check for updates**
   button next to it.
   - Saves carry over: it's the same `~/.config/Pawhaven/` folder.

From then on, when a new version is released, the title shows the card: press **A** on **Install now**.

### Testing it on the Deck (what Windows can't test)
The Windows QA covers content updates end to end (`tools/qa/desktop-update.mjs`). These steps need the Deck:
1. **A content update.**
   - With the updatable version installed (above), publish the next version from the PC.
   - The release script should say `minShell <the installed version>: the shell is unchanged`.
   - Start Pawhaven in Game Mode. Within a few seconds of the title, the card shows the new version.
   - Press A on Install now. A progress bar runs, then the title comes back with "Pawhaven is now vX.Y.Z".
   - Settings › About shows it too. Exit through Steam and start again: still the new version, no card.
2. **Offline:** turn Wi-Fi off and start Pawhaven. There is no card and the game plays. Settings › About › Check for
   updates says it couldn't reach GitHub.
3. **A shell update** (only when a release changes the shell: the script says "older apps get a shell update"):
   - The card says "the app itself: it restarts when done". The download is about 160 MB.
   - Then the app closes and opens again by itself, on the new version.
   - In Desktop Mode, `~/Games/Pawhaven/` then holds `Pawhaven.AppImage` (new) and `Pawhaven.AppImage.prev` (old).
   - If Game Mode shows the game as stopped instead of reopening it, start it again from the Library. It's already
     updated.
4. **Undoing a shell update by hand** (if a new shell won't start), in Konsole:
   `cd ~/Games/Pawhaven && mv Pawhaven.AppImage.prev Pawhaven.AppImage`.
5. **Back to the built-in game** (if a content update misbehaves without crashing): delete
   `~/.config/Pawhaven/updates/`. Saves are elsewhere in that folder and stay.

## Troubleshooting

**A black screen, or the window never appears.** Run it from Konsole in Desktop Mode to see its messages:
`~/Games/Pawhaven/Pawhaven-*.AppImage`. Then:
- *"The SUID sandbox helper binary was found, but is not configured correctly"* or *"No usable sandbox"*: add
  `--no-sandbox` to the launch options. The AppImage adds it by itself when the system has no user namespaces. The
  tar.gz's `pawhaven` doesn't.
- *A GPU or GL error*: try `--disable-gpu-sandbox`. If that doesn't help, try `--ozone-platform=x11`.
- *"AppImages require FUSE to run"*: SteamOS has FUSE, but another Linux may not. Use the tar.gz instead.
- Only in Game Mode: open the Quick Access menu → Performance, check nothing forces a very low resolution, and
  restart Steam.

**An update won't install, or the card never shows.**
- The card's message says why: GitHub can't be reached, the download failed its safety check (it is thrown away and
  can be retried), not enough free space, or "can't write next to the app". For the last one, move the AppImage to a
  folder you own, such as `~/Games/Pawhaven/`.
- Started from Konsole, the app prints what it does on lines starting with `[updates]`.
- The launch check runs once a launch and stays quiet when offline. Settings › About › Check for updates always
  answers.
- To go back to the game built into the app, delete `~/.config/Pawhaven/updates/` (`%APPDATA%\Pawhaven\updates\` on
  Windows). Saves aren't in it.

**The controller isn't detected.**
- The browser engine only reveals a controller after a button is pressed while the window has focus. Press A once.
- In Game Mode, check **Properties → Controller → Steam Input** is on with the Gamepad template.
- In Desktop Mode, start it through Steam, not by double-clicking. Steam's desktop configuration otherwise turns the
  Deck's controls into a mouse and keyboard.
- On a PC: plug the controller in before starting, and press a button.
- If the buttons show PlayStation symbols on a Deck, set Settings › Controls › Button glyphs to **Xbox**.

**It starts in a window.** Press F11, or turn on Settings › Full screen. It is remembered.

**The portable exe takes a while to start.** It unpacks itself every time. Use the zip.

## How it works (for development)

| Piece | Role |
|---|---|
| `tools/desktop/main.cjs` | The main process. It serves `dist-desktop/app/game/` on the private origin `app://pawhaven` (a secure context: the Gamepad API, localStorage and module scripts all work, and nothing outside the game folder can be read). It opens one window without chrome, full screen unless the player chose windowed, and F11 / Alt+Enter toggle it. It remembers the window in `window.json`. Links open in the system browser. It runs the updates (CT-9): it picks which game folder `app://pawhaven` serves, answers the game's `pawhaven:update` calls, and watches a fresh update's trial. |
| `tools/desktop/preload.cjs` | The bridge: `window.pawhaven = { desktop, deck, platform, version, isFullscreen(), setFullscreen(on), onFullscreen(fn), quit(), update }`. `update` is `{ info, check, install, cancel, later, openPage, onProgress }`, or null with updates off. `deck` comes from Steam's `SteamDeck=1`, or `--deck` / `--no-deck`. |
| `src/ui/desktop.js` | The game's side: Settings › Full screen, the Quit buttons, the running version in the title's footer, and the updates' set-up (`desktopUpdate.js`). In a browser it's inert. `src/core/deck.js` reads `pawhaven.deck`. |
| `tools/desktop/build-desktop.mjs` | `npm run build:desktop`: the game build, electron-builder (with Electron already unpacked: on Windows its own unzip-then-rename trips over Defender), the AppImage and the tar.gz. |
| `tools/desktop/appimage.mjs` | Writes the AppImage on any OS. It joins the type-2 static runtime from electron-builder's pinned toolset to a SquashFS this module builds itself (gzip, no fragments). Its `AppRun` adds `--no-sandbox` only where user namespaces are missing. |
| `tools/desktop/verify-squashfs.py` | Reads an AppImage back with an independent SquashFS reader (`pip install PySquashfsImage`) and compares every file with `linux-unpacked/`. |
| `tools/desktop/make-icon.mjs` | Renders `icon.png` (the title's Chewy badge) from the dev server. |
| `tools/qa/desktop-smoke.mjs` | Boots the packaged Windows app through Playwright's Electron support and checks it. |
| `tools/desktop/updater.cjs` | The updater (CT-9), plain Node: the URL policy, `update.json` validation, `decide()`, the checked HTTPS client, resumable hash-checked downloads, the strict unzip, `ContentStore` (`userData/updates/`: install, trial, confirm, rollback, prune), `swapAppImage`. |
| `tools/desktop/contentpack.mjs` | `packGame()` (the game folder → a reproducible zip) and `shellFingerprint()`. |
| `tools/desktop/release-desktop.mjs` | `npm run release:desktop` (see "Releasing an update"). |
| `src/ui/desktopUpdate.js` (+ `.css`) | The update card: the pause menu's `update` view (`src/ui/menu.js`), the launch check on the title, Settings › About › Check for updates, the toasts after an update or a rollback. Inert without `pawhaven.update`. |
| `tools/qa/desktop-update.mjs` | The updates end to end in the packaged Windows app, against a local server (see QA below). |
| `tools/qa/desktop-updater-unit.mjs` | The updater's unit tests in plain Node (no build needed). |

Switches for testing:

| Switch | Effect |
|---|---|
| `--windowed`, `--fullscreen` | Start that way this time. |
| `--user-data=<dir>` | A separate save folder. |
| `--query=<qs>` | Open with a query string, e.g. `fresh&nointro`. |
| `--url=<url>` | Load the dev server instead of the packaged build: `npm run desktop -- --url=http://localhost:5173`. |
| `--game-dir=<dir>` | Serve the game from another folder (updates off). |
| `--no-updates` | Never check for updates. (`--url` and `--game-dir` turn them off too, as does running unpackaged.) |
| `--update-url=<url>` | Take `update.json` from a local test server. Loopback addresses only (`http://127.0.0.1:…`): anything else turns updates off. |
| `--update-boot-timeout=<s>` | With `--update-url`: how long a fresh update may take to reach the title before it is rolled back (default 60). |

`npm run desktop` runs the shell from `tools/desktop/` against the last `dist-desktop` build.

**QA**: `node tools/qa/desktop-smoke.mjs`, after `npm run build:desktop` (or `-- --win --dir`). It checks:
- the title from the app's files;
- `window.pawhaven`, WebGL2 on the GPU;
- Full screen really switching the window;
- New Game, a controller walking the hero, the focus ring;
- Quit game saving and closing the app, and a relaunch finding the save;
- `SteamDeck=1` picking the Deck preset.

It runs with `--no-updates`, so a real release never puts a card over its title.

**QA for updates** (no GitHub, nothing published):
- `node tools/qa/desktop-updater-unit.mjs`: the updater in plain Node, in seconds, with no build needed. It checks:
  - versions, the URL policy and `update.json` validation;
  - `decide()`;
  - the pack round trip and hostile zips;
  - downloads (a redirect, a refused host, a resumed cut, a bad hash, offline);
  - the store's install, trial, confirm and rollback, minShell, pruning, and userData left alone;
  - the AppImage swap and the relaunch arguments.
- `node tools/qa/desktop-update.mjs`, after `npm run build:desktop -- --win` (or `-- --win --dir`): the packaged
  Windows app against a local server. It makes a good pack (the build's game, with its version changed to 9.9.1)
  and a broken one (9.9.2), then checks:
  - offline: no card, and a gentle manual error;
  - the card with the pad's focus ring, and B for Later, with no nagging after a reload;
  - the next launch asks again, and a bad hash is refused;
  - Install now: the reload into 9.9.1, the toast, the trial confirmed, still 9.9.1 after a relaunch, "up to date";
  - the broken 9.9.2 rolled back by itself, not offered on the next launch, offered by a manual check;
  - the save surviving all of it.
  - Screenshots: `tools/qa/tmp/desktop-update/`.
- Not testable on Windows: the AppImage swap and relaunch on a real Deck. It is unit-tested, and the Deck steps are
  above.

**Not done yet**:
- Steamworks (achievements, cloud saves) if the game goes on Steam;
- code signing;
- signing `update.json` itself (today its trust is HTTPS from github.com plus the hashes it lists);
- macOS;
- importing a browser save.
