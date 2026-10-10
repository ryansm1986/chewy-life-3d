// Publish a desktop release that installed apps update from (docs/DESKTOP.md "Releasing an update", ROADMAP CT-9):
//   npm run release:desktop -- --dry-run     everything but GitHub: build, pack, hash, update.json, and the plan printed
//   npm run release:desktop                  the same, then the GitHub release vX.Y.Z with every file
// Options:
//   --no-build            reuse release/desktop/ and dist-desktop/ from the last full `npm run build:desktop` (same version;
//                         refused when dist-desktop is newer than the packages, e.g. after a `-- --win --dir` build)
//   --notes "…"           the release notes (default: the subject of the commit "Pawhaven X.Y.Z: …", after the colon)
//   --notes-file <file>   the release notes from a file
//   --shell-compatible    keep the last release's minShell although the shell changed (the game doesn't need the new one)
//   --allow-dirty         release from a working tree with uncommitted changes (not advised: the tag won't match)
// Steps:
//   1. checks: a clean tree, HEAD pushed to origin, origin is the repository the app reads (updater.cjs REPO), the
//      version newer than the latest release (and, for real, gh logged in and no release vX.Y.Z yet);
//   2. `npm run build:desktop` (Windows + Linux), unless --no-build;
//   3. the game content pack: dist-desktop/app/game → release/desktop/pawhaven-game-X.Y.Z.zip, read back with the app's
//      own unzip (tools/desktop/updater.cjs) as a check;
//   4. minShell: the shell's fingerprint (tools/desktop/contentpack.mjs) against the latest release's update.json;
//   5. release/desktop/update.json (checked with the app's own validateManifest) and the release notes;
//   6. gh release create vX.Y.Z --draft (all five files), then gh release edit --draft=false --latest: a client never
//      sees a release before every file is up. Then it reads the published update.json back.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { packGame, sha256Of, shellFingerprint } from './contentpack.mjs';

const require = createRequire(import.meta.url);
const U = require('./updater.cjs');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'release/desktop'), GAME = path.join(ROOT, 'dist-desktop/app/game');
const argv = process.argv.slice(2);
const has = f => argv.includes(f);
const opt = f => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null; };
const DRY = has('--dry-run'), NO_BUILD = has('--no-build');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const V = U.normVersion(pkg.version), TAG = `v${V}`;
const MB = n => (n / 2 ** 20).toFixed(1) + ' MB';
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const say = s => console.log(s);
const problems = [];

say(`== Pawhaven ${V} desktop release${DRY ? ' (DRY RUN: nothing is published)' : ''}`);

// ---------------------------------------------------------------- 1. checks
const origin = git('remote', 'get-url', 'origin');
const repo = (/github\.com[/:]([^/]+\/[^/]+?)(\.git)?$/.exec(origin) || [])[1];
if (repo !== U.REPO) problems.push(`origin is ${origin}, but the app reads releases from ${U.REPO} (tools/desktop/updater.cjs REPO)`);
const head = git('rev-parse', 'HEAD'), subject = git('log', '-1', '--format=%s');
const dirty = git('status', '--porcelain');
if (dirty && !has('--allow-dirty')) problems.push(`the working tree has uncommitted changes (${dirty.split('\n').length} paths): commit first, or pass --allow-dirty`);
let pushed = ''; try { pushed = git('branch', '-r', '--contains', head); } catch (e) { /* */ }
if (!pushed) problems.push(`HEAD ${head.slice(0, 7)} is not on origin yet: push it first (the tag is made from it)`);
if (!DRY) {
  const gh = spawnSync('gh', ['auth', 'status'], { encoding: 'utf8' });
  if (gh.status !== 0) problems.push('gh is not logged in (gh auth login)');
  const exists = spawnSync('gh', ['release', 'view', TAG, '-R', U.REPO, '--json', 'tagName'], { encoding: 'utf8' });
  if (exists.status === 0) problems.push(`the release ${TAG} already exists: bump the version in package.json`);
}
say(`   ${U.REPO} @ ${head.slice(0, 7)} "${subject}"${dirty ? `, ${dirty.split('\n').length} uncommitted paths` : ''}`);
if (!DRY && problems.length) { for (const p of problems) say(`   ✗ ${p}`); process.exit(1); }

// ---------------------------------------------------------------- 2. the build
if (!NO_BUILD) {
  say('== npm run build:desktop (Windows + Linux)');
  const b = spawnSync(process.execPath, [path.join(ROOT, 'tools/desktop/build-desktop.mjs')], { cwd: ROOT, stdio: 'inherit' });
  if (b.status !== 0) { say('   ✗ the build failed'); process.exit(1); }
}
const assets = {
  linux: `Pawhaven-${V}-linux-x64.AppImage`,
  winZip: `Pawhaven-${V}-win-x64.zip`,
  winPortable: `Pawhaven-${V}-win-x64-portable.exe`,
};
for (const [k, f] of Object.entries(assets)) if (!fs.existsSync(path.join(OUT, f))) { say(`   ✗ no ${f} in release/desktop (${k}): run npm run build:desktop${NO_BUILD ? ' or drop --no-build' : ''}`); process.exit(1); }
const builtVersion = U.gameVersionOf(GAME);
if (builtVersion !== V) { say(`   ✗ the game in dist-desktop is ${builtVersion || 'unversioned'}, not ${V}: build again`); process.exit(1); }
// the pack and the packages must hold the same game: a later build (say `-- --win --dir`) replaces dist-desktop but not the packages
const gameAt = fs.statSync(path.join(GAME, 'index.html')).mtimeMs, stale = Object.values(assets).filter(f => fs.statSync(path.join(OUT, f)).mtimeMs < gameAt);
if (stale.length) { say(`   ✗ dist-desktop was built after ${stale.join(', ')}: the pack wouldn't match the packages. Run without --no-build`); process.exit(1); }

// ---------------------------------------------------------------- 3. the content pack (read back with the app's own reader)
const zipName = `pawhaven-game-${V}.zip`;
say(`== the content pack: dist-desktop/app/game -> release/desktop/${zipName}`);
const pack = packGame(GAME, path.join(OUT, zipName));
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pawhaven-pack-'));
  try {
    const r = await U.extractZip(pack.file, path.join(tmp, 'g'));
    if (r.files !== pack.files || r.bytes !== pack.bytes || U.gameVersionOf(path.join(tmp, 'g')) !== V) throw new Error(`read back ${r.files} files, ${r.bytes} bytes`);
  } catch (e) { say(`   ✗ the app can't read the pack back: ${e.message}`); process.exit(1); } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}
say(`   ${pack.files} files, ${MB(pack.bytes)} -> ${MB(pack.size)}, read back by the app's unzip: OK`);

// ---------------------------------------------------------------- 4. minShell, from the last release
const fingerprint = shellFingerprint(ROOT);
let prev = null;
try {
  const r = await fetch(`https://github.com/${U.REPO}/releases/latest/download/update.json`, { redirect: 'follow', signal: AbortSignal.timeout(15000) });
  if (r.ok) prev = U.validateManifest(await r.json());
  else if (r.status !== 404) say(`   (the latest release's update.json answered ${r.status})`);
} catch (e) { say(`   (couldn't read the latest release's update.json: ${e.message})`); }
if (prev && U.cmpVersion(V, prev.version) <= 0) problems.push(`${V} is not newer than the latest release (${prev.version}): bump the version`);
let minShell = V, why = 'no earlier release with an update.json: this is the first updatable shell';
if (prev && prev.shell.fingerprint === fingerprint) { minShell = prev.content.minShell; why = `the shell is unchanged since ${prev.version}`; }
else if (prev && has('--shell-compatible')) { minShell = prev.content.minShell; why = `the shell changed since ${prev.version}, kept compatible (--shell-compatible)`; }
else if (prev) why = `the shell changed since ${prev.version} (${prev.shell.fingerprint || 'no fingerprint'} -> ${fingerprint}): older apps get a shell update`;
say(`== minShell ${minShell}: ${why}`);

// ---------------------------------------------------------------- 5. update.json and the notes
let notes = opt('--notes');
if (opt('--notes-file')) notes = fs.readFileSync(path.resolve(opt('--notes-file')), 'utf8').trim();
if (!notes) {
  const subj = git('log', '-50', '--format=%s').split('\n').find(s => s.startsWith(`Pawhaven ${V}:`));
  notes = subj ? subj.slice(`Pawhaven ${V}:`.length).trim().replace(/^./, c => c.toUpperCase()) + '.' : `Pawhaven ${V}.`;
}
const base = `https://github.com/${U.REPO}/releases/download/${TAG}/`;
const asset = f => ({ url: base + f, sha256: sha256Of(path.join(OUT, f)), size: fs.statSync(path.join(OUT, f)).size });
const manifest = {
  schema: 1, name: 'Pawhaven', version: V, released: new Date().toISOString().slice(0, 10), notes,
  page: `https://github.com/${U.REPO}/releases/tag/${TAG}`,
  content: { url: base + zipName, sha256: pack.sha256, size: pack.size, minShell },
  shell: { version: V, fingerprint, linux: asset(assets.linux), winZip: asset(assets.winZip), winPortable: asset(assets.winPortable) },
};
try { U.validateManifest(manifest); } catch (e) { say(`   ✗ ${e.message}`); process.exit(1); }
const manifestFile = path.join(OUT, 'update.json');
fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
const bodyFile = path.join(OUT, `release-notes-${V}.md`);
fs.writeFileSync(bodyFile, `${notes}

### Install
- **Steam Deck and Linux:** \`${assets.linux}\`. Already installed (0.6.5 or later)? Pawhaven updates itself: the title screen offers it, or Settings › About › Check for updates.
- **Windows:** \`${assets.winZip}\` (extract and run \`Pawhaven.exe\`), or the one-file \`${assets.winPortable}\`.
- \`${zipName}\` and \`update.json\` are what the app's updater downloads.

The guide: [docs/DESKTOP.md](https://github.com/${U.REPO}/blob/${TAG}/docs/DESKTOP.md).
`);

// ---------------------------------------------------------------- 6. the plan, then GitHub
const files = [...Object.values(assets), zipName, 'update.json'].map(f => path.join(OUT, f));
say('== the release files');
for (const f of files) say(`   ${path.basename(f).padEnd(42)} ${MB(fs.statSync(f).size).padStart(9)}  ${f.endsWith('update.json') ? '' : 'sha256 ' + sha256Of(f).slice(0, 16) + '…'}`);
say(`   notes: ${notes.length > 110 ? notes.slice(0, 110) + '…' : notes}`);
const cmds = [
  ['gh', 'release', 'create', TAG, ...files.map(f => path.relative(ROOT, f)), '-R', U.REPO, '--draft', '--title', `Pawhaven ${V}`, '--notes-file', path.relative(ROOT, bodyFile), '--target', head],
  ['gh', 'release', 'edit', TAG, '-R', U.REPO, '--draft=false', '--latest'],
];
if (DRY) {
  say('== would run');
  for (const c of cmds) say('   ' + c.map(a => (/\s/.test(a) ? JSON.stringify(a) : a)).join(' '));
  if (problems.length) { say('== a real release would stop here first:'); for (const p of problems) say(`   ✗ ${p}`); }
  say(`== dry run done: update.json and the pack are in release/desktop/; nothing was published`);
  process.exit(0);
}
if (problems.length) { for (const p of problems) say(`   ✗ ${p}`); process.exit(1); }
for (const [cmd, ...a] of cmds) {
  say(`== ${cmd} ${a.slice(0, 3).join(' ')} …`);
  const r = spawnSync(cmd, a, { cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0) { say(`   ✗ ${cmd} ${a[0]} ${a[1]} failed: the release ${TAG} may be a draft now; finish or delete it on GitHub`); process.exit(1); }
}
try {
  const back = await U.fetchManifest(U.MANIFEST_URL, { timeout: 15000 });
  say(back?.version === V ? `== published: the latest update.json is ${V}` : `== published, but the latest update.json says ${back?.version || 'nothing'} so far (GitHub can take a minute)`);
} catch (e) { say(`== published; reading update.json back failed: ${e.message}`); }
