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
| `tools/desktop/main.cjs` | The main process. It serves `dist-desktop/app/game/` on the private origin `app://pawhaven` (a secure context: the Gamepad API, localStorage and module scripts all work, and nothing outside the game folder can be read). It opens one window without chrome, full screen unless the player chose windowed, and F11 / Alt+Enter toggle it. It remembers the window in `window.json`. Links open in the system browser. |
| `tools/desktop/preload.cjs` | The bridge: `window.pawhaven = { desktop, deck, platform, version, isFullscreen(), setFullscreen(on), onFullscreen(fn), quit() }`. `deck` comes from Steam's `SteamDeck=1`, or `--deck` / `--no-deck`. |
| `src/ui/desktop.js` | The game's side: Settings › Full screen and the Quit buttons. In a browser it's inert. `src/core/deck.js` reads `pawhaven.deck`. |
| `tools/desktop/build-desktop.mjs` | `npm run build:desktop`: the game build, electron-builder (with Electron already unpacked: on Windows its own unzip-then-rename trips over Defender), the AppImage and the tar.gz. |
| `tools/desktop/appimage.mjs` | Writes the AppImage on any OS. It joins the type-2 static runtime from electron-builder's pinned toolset to a SquashFS this module builds itself (gzip, no fragments). Its `AppRun` adds `--no-sandbox` only where user namespaces are missing. |
| `tools/desktop/verify-squashfs.py` | Reads an AppImage back with an independent SquashFS reader (`pip install PySquashfsImage`) and compares every file with `linux-unpacked/`. |
| `tools/desktop/make-icon.mjs` | Renders `icon.png` (the title's Chewy badge) from the dev server. |
| `tools/qa/desktop-smoke.mjs` | Boots the packaged Windows app through Playwright's Electron support and checks it. |

Switches for testing:

| Switch | Effect |
|---|---|
| `--windowed`, `--fullscreen` | Start that way this time. |
| `--user-data=<dir>` | A separate save folder. |
| `--query=<qs>` | Open with a query string, e.g. `fresh&nointro`. |
| `--url=<url>` | Load the dev server instead of the packaged build: `npm run desktop -- --url=http://localhost:5173`. |
| `--game-dir=<dir>` | Serve the game from another folder. |

`npm run desktop` runs the shell from `tools/desktop/` against the last `dist-desktop` build.

**QA**: `node tools/qa/desktop-smoke.mjs`, after `npm run build:desktop` (or `-- --win --dir`). It checks:
- the title from the app's files;
- `window.pawhaven`, WebGL2 on the GPU;
- Full screen really switching the window;
- New Game, a controller walking the hero, the focus ring;
- Quit game saving and closing the app, and a relaunch finding the save;
- `SteamDeck=1` picking the Deck preset.

**Not done yet**:
- Steamworks (achievements, cloud saves) if the game goes on Steam;
- code signing;
- macOS;
- importing a browser save.
