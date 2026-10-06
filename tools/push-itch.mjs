// Push the itch.io build with butler: npm run push:itch [-- --skip-build] [--dry-run]
//   1. builds and checks it (tools/build-itch.mjs --test: relative URLs, itch's limits, a boot in an itch-style iframe);
//   2. pushes dist-itch/ to the target in package.json "itch" ({ target: "user/game", channel: "html5" }), with the
//      package.json version as the build's user version. butler only uploads what changed since the last push.
// butler is found on PATH, in $BUTLER, or in %LOCALAPPDATA%\butler\butler.exe. Sign in once with `butler login` (it opens
// the browser and saves the credentials on this PC). Details and the itch page settings: docs/ITCH.md.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const { target, channel = 'html5' } = pkg.itch || {};
const args = process.argv.slice(2);
const die = msg => { console.error('push-itch: ' + msg); process.exit(1); };
if (!target) die('package.json has no "itch": { "target": "user/game" }');

const local = process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'butler', 'butler.exe') : null;
const butler = [process.env.BUTLER, 'butler', local].filter(Boolean).find(b => spawnSync(b, ['-V'], { stdio: 'ignore' }).status === 0);
if (!butler) die('butler not found: install it from https://itch.io/docs/butler/ (or set BUTLER to its path)');
// butler keeps its sign-in in butler_creds (where depends on the OS and butler version); only warn, the push itself
// fails clearly if the sign-in is missing
const home = process.env.USERPROFILE || process.env.HOME || '';
const credPaths = [process.env.APPDATA && path.join(process.env.APPDATA, 'itch', 'butler_creds'), path.join(home, '.config', 'itch', 'butler_creds')].filter(Boolean);
if (!process.env.BUTLER_API_KEY && !credPaths.some(p => fs.existsSync(p))) console.warn(`push-itch: no saved butler sign-in found; if the push fails, run "${butler}" login once`);

if (!args.includes('--skip-build')) {
  const b = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'build-itch.mjs'), '--test'], { stdio: 'inherit', cwd: ROOT });
  if (b.status !== 0) die('the build or its iframe test failed; nothing was pushed');
}
const dir = path.join(ROOT, 'dist-itch');
if (!fs.existsSync(path.join(dir, 'index.html'))) die('dist-itch/ has no index.html: build first');

const dest = `${target}:${channel}`;
const cmd = ['push', dir, dest, '--userversion', pkg.version, ...(args.includes('--dry-run') ? ['--dry-run'] : [])];
console.log(`== butler ${cmd.join(' ')}`);
const r = spawnSync(butler, cmd, { stdio: 'inherit', cwd: ROOT });
if (r.status !== 0) die('butler push failed');
console.log(`== pushed ${pkg.version} to https://${target.split('/')[0]}.itch.io/${target.split('/')[1]} (channel ${channel})`);
console.log('   first push only: on the itch edit page, tick "This file will be played in the browser" for this channel');
