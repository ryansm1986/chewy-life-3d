# Chewy Life 3D: notes for Claude

A cozy 3D browser action-RPG and village sim (Three.js + Vite), starring Chewy, Shadow, Moka, Poe and Rosie.

## Start here
- **What's in flight and what's next: [docs/ROADMAP.md](docs/ROADMAP.md).**
  - Pick objectives from it.
  - Set their status as you work.
  - Add a dated log line when you finish or hand off.
- Design docs:
  - [ZONES](docs/ZONES.md): the zone, village, dungeon and tier loop, the current big plan;
  - [ARCHITECTURE](docs/ARCHITECTURE.md): the code map;
  - [REGIONS](docs/REGIONS.md), [HEROES](docs/HEROES.md), [POE](docs/POE.md), [CHARGE](docs/CHARGE.md),
    [HOUSING](docs/HOUSING.md), [HOMESTEAD](docs/HOMESTEAD.md), [TUTORIALS](docs/TUTORIALS.md),
    [VILLAGE_PLAN](docs/VILLAGE_PLAN.md), [ITCH](docs/ITCH.md), [MULTIPLAYER](docs/MULTIPLAYER.md).
- Run it: `npm run dev` (port 5173).

## How the owner wants work done
- **Quality bar: 9/10** for models, rooms and effects.
  - Verify with screenshots you look at yourself (`tools/shot.mjs`, the `tools/qa/*-shots.mjs` tools), at the game
    camera.
  - Effects must never wash the screen out.
- **Test the production build** too (`node tools/qa/prod-smoke.mjs`); the owner plays the built bundle.
- **QA**:
  - `node tools/test-rpg.mjs`;
  - the relevant `tools/qa/s*.mjs`;
  - a full `node tools/qa/run-all.mjs` at milestones.
  - Waits in tests key on game state, not wall time.
- **Commit only when the owner asks.**
- **Line endings**: many files are CRLF. Preserve each file's endings exactly; in Python write with `newline=''` or bytes.
  New files are LF. Check `git diff --stat` for whole-file churn.
- **Blender**: all Blender work (models, rigs, props) is done by an **Opus agent**. Codex only draws concept sheets. See
  `.claude/skills/toybox-character` and `.claude/skills/codex-blender`.
- **Processes**: never stop processes you didn't start, and never kill by image name. No blocking sleep or poll loops:
  run long jobs in the background and wait for the notification.
- **Parallel agents**: give each agent its own files. On shared files, re-read before every edit and make small Edit-tool
  changes; never revert someone else's work.
