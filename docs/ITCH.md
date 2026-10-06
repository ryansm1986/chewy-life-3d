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
     default frame.
   - **Fullscreen button**: on.
   - **Click to Play**: on. Visitors don't download 21 MB until they choose to play, and the click also unlocks audio.
   - **Mobile friendly**: off. The game needs a keyboard and mouse.
   - **Scrollbars**: off.
5. Answer the **AI generation disclosure** on the edit page honestly. Much of this game's code, models, textures and
   text was made with AI tools.
6. Save as **Draft** (or **Restricted** with a password), open the page, and play through: title, New Game, the village,
   a Burrow, then Settings. Make it public once you're happy with it.

## Push with butler (`npm run push:itch`)
itch's command-line uploader, **butler**, uploads only what changed since the last push, and keeps a version history.
- **Install**: butler is installed at `%LOCALAPPDATA%utlerutler.exe` (from itch's official
  `broth.itch.zone/butler/windows-amd64`). `tools/push-itch.mjs` finds it there, on PATH, or in `$BUTLER`.
- **Sign in once**: run `"%LOCALAPPDATA%utlerutler.exe" login` yourself. It opens the browser to approve, and saves
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

## Known gaps before a public release

- **Low-end GPUs:**
  - Settings → Quality **Low** turns off AO and tilt-shift and drops the pixel ratio at runtime.
  - Grass and detail density only follow the `?q=0|1|2` URL parameter at boot, which itch players can't set. Make the
    saved setting apply at boot (in `core/engine.js`, read the saved settings when there's no `?q`) before the game
    goes public.
  - The village is about 2.6M triangles.
- **First load:** about 30 MB over the CDN. It took about 10 s to reach the title locally, and will be longer on slow
  connections.
