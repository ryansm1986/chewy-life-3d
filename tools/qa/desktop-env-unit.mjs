// Unit tests of the desktop shell's Steam / Game Mode switches and its log file (tools/desktop/steamenv.cjs,
// mainlog.cjs, appimage.mjs appRunScript; docs/DESKTOP.md "Troubleshooting", ROADMAP CT-10), in plain Node: no
// Electron, no build needed.
//   a) the detection: each Steam / gamescope signal on Linux asks for --ozone-platform=x11 --no-sandbox; lookalikes
//      don't (SteamDeck=0, SteamGameId=0, an empty SteamAppId, a KDE desktop); Windows and macOS never add anything
//   b) the opt-out (--no-x11) and the player's own switches (--ozone-platform=…, --ozone-platform-hint=…, --no-sandbox)
//      are never doubled or overridden; after a relaunch nothing is left to add
//   c) planSwitches (how main.cjs applies it): appended when the process already runs on x11, else one relaunch, never two
//   d) the AppImage's AppRun, run by bash (Git Bash on Windows; skipped if there is none) with a stand-in app: the same
//      decisions as steamenv.cjs, no switch twice, the player's arguments kept in order, the user-namespace check kept
//   e) the log: the line format, rotation at the size cap while writing and at the start, `keep` old files and no more,
//      an unwritable folder never throws, wrapConsole still prints and also appends
// usage: node tools/qa/desktop-env-unit.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { makeReport } from './lib.mjs';
import { appRunScript } from '../desktop/appimage.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const E = require(path.join(ROOT, 'tools/desktop/steamenv.cjs'));
const ML = require(path.join(ROOT, 'tools/desktop/mainlog.cjs'));
const R = makeReport('desktop-env-unit');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'pawhaven-env-unit-'));
const BOTH = ['--ozone-platform=x11', '--no-sandbox'];
const args = d => d.add.map(s => s.arg);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// the Deck's Game Mode as Steam starts a non-Steam shortcut there (SteamAppId=0 for a shortcut)
const DECK = { GAMESCOPE_WAYLAND_DISPLAY: 'gamescope-0', XDG_CURRENT_DESKTOP: 'gamescope', SteamDeck: '1', SteamGameId: '15398267108474912768', SteamAppId: '0', XDG_SESSION_TYPE: 'wayland', WAYLAND_DISPLAY: 'gamescope-0', DISPLAY: ':0' };
const ENVS = {
  none: {},
  gamescopeDisplay: { GAMESCOPE_WAYLAND_DISPLAY: 'gamescope-0' },
  desktopGamescope: { XDG_CURRENT_DESKTOP: 'gamescope' },
  desktopMixedCase: { XDG_CURRENT_DESKTOP: 'KDE:GameScope' },
  steamDeck: { SteamDeck: '1' },
  steamGameId: { SteamGameId: '12345' },
  steamAppId: { SteamAppId: '413150' },
  lookalikes: { SteamDeck: '0', SteamGameId: '0', SteamAppId: '', XDG_CURRENT_DESKTOP: 'KDE', GAMESCOPE_WAYLAND_DISPLAY: '' },
  deck: DECK,
};
const STEAMY = new Set(['gamescopeDisplay', 'desktopGamescope', 'desktopMixedCase', 'steamDeck', 'steamGameId', 'steamAppId', 'deck']);
const ARGVS = {
  plain: [], optOut: ['--no-x11'], wayland: ['--ozone-platform=wayland'], hint: ['--ozone-platform-hint=auto'], bareOzone: ['--ozone-platform'],
  noSandbox: ['--no-sandbox'], bothGiven: ['--no-sandbox', '--ozone-platform=x11'], lookalike: ['--ozone-platformx=1', '--no-sandboxes'], player: ['--windowed', '--deck'],
};
const WANT = { plain: BOTH, optOut: ['--no-sandbox'], wayland: ['--no-sandbox'], hint: ['--no-sandbox'], bareOzone: ['--no-sandbox'], noSandbox: ['--ozone-platform=x11'], bothGiven: [], lookalike: BOTH, player: BOTH };

try {
  // ---------------------------------------------------------------- a) the detection
  const det = Object.fromEntries(Object.entries(ENVS).map(([k, env]) => [k, E.gameModeEnv({ env, argv: ['/opt/pawhaven'], platform: 'linux' })]));
  const detBad = Object.entries(det).filter(([k, d]) => d.steam !== STEAMY.has(k) || d.applies !== STEAMY.has(k) || !same(args(d), STEAMY.has(k) ? BOTH : [])).map(([k, d]) => `${k}: ${JSON.stringify(args(d))}`);
  R.check('a) on Linux each signal (GAMESCOPE_WAYLAND_DISPLAY, XDG_CURRENT_DESKTOP with gamescope in any case, SteamDeck=1, SteamGameId, SteamAppId) asks for --ozone-platform=x11 --no-sandbox; no signal, or only lookalikes (0, empty, KDE), asks for nothing',
    !detBad.length, detBad.join(' | ') || `${Object.keys(ENVS).length} environments`);
  const deckSig = det.deck.signals;
  R.check('a) the Deck\'s Game Mode: four signals (a shortcut\'s SteamAppId=0 is not one), named with their values for the log',
    deckSig.length === 4 && deckSig.includes('SteamDeck=1') && deckSig.includes('GAMESCOPE_WAYLAND_DISPLAY=gamescope-0') && !deckSig.some(s => s.startsWith('SteamAppId')) && /adding --ozone-platform=x11 --no-sandbox/.test(det.deck.summary), det.deck.summary);
  const other = ['win32', 'darwin'].map(platform => E.gameModeEnv({ env: DECK, argv: ['x'], platform }));
  R.check('a) Windows and macOS: Steam is noticed for the log, but no switch is ever added',
    other.every(d => d.steam && !d.applies && d.add.length === 0 && /Linux only/.test(d.summary)), other.map(d => d.summary).join(' | '));
  const none = E.gameModeEnv({ env: {}, argv: [], platform: 'linux' });
  R.check('a) a plain Linux desktop (no Steam): nothing, and the log says so', !none.steam && none.add.length === 0 && /not under Steam/.test(none.summary), none.summary);

  // ---------------------------------------------------------------- b) the opt-out and the player's own switches
  const argBad = [];
  for (const [k, argv] of Object.entries(ARGVS)) { const d = E.gameModeEnv({ env: DECK, argv: ['/opt/pawhaven', ...argv], platform: 'linux' }); if (!same(args(d), WANT[k])) argBad.push(`${k}: ${JSON.stringify(args(d))}`); }
  R.check('b) --no-x11 opts out of x11 only; a given --ozone-platform(=…) or --ozone-platform-hint=… wins; a given --no-sandbox isn\'t added again; lookalike switches don\'t count',
    !argBad.length, argBad.join(' | ') || `${Object.keys(ARGVS).length} command lines`);
  const optOut = E.gameModeEnv({ env: DECK, argv: ['x', '--no-x11'], platform: 'linux' });
  R.check('b) the opt-out is named in the log line', optOut.skip.some(s => /--no-x11/.test(s)) && /--no-x11/.test(optOut.summary), optOut.summary);

  // ---------------------------------------------------------------- c) how main.cjs applies it
  const dBoth = E.gameModeEnv({ env: DECK, argv: ['x'], platform: 'linux' }), dOpt = optOut;
  const p = {
    onX11: E.planSwitches(dBoth, { ozoneNow: 'x11' }), unset: E.planSwitches(dBoth, { ozoneNow: '' }), wayland: E.planSwitches(dBoth, { ozoneNow: 'wayland' }),
    again: E.planSwitches(dBoth, { ozoneNow: 'wayland', relaunched: true }), optOut: E.planSwitches(dOpt, { ozoneNow: 'wayland' }), nothing: E.planSwitches(none, { ozoneNow: '' }),
  };
  const after = E.gameModeEnv({ env: DECK, argv: ['x', ...p.wayland.relaunch], platform: 'linux' });
  R.check('c) planSwitches: on x11 already both are appended; on another (or an unknown) platform one relaunch with both on the command line; never a second relaunch; the opt-out never relaunches',
    !p.onX11.relaunch && same(p.onX11.append.map(s => s.arg), BOTH) && same(p.unset.relaunch, BOTH) && same(p.wayland.relaunch, BOTH) && !p.again.relaunch && same(p.again.append.map(s => s.arg), BOTH)
      && !p.optOut.relaunch && same(p.optOut.append.map(s => s.arg), ['--no-sandbox']) && !p.nothing.relaunch && !p.nothing.append.length,
    JSON.stringify(Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v.relaunch ? 'relaunch ' + v.relaunch.join(' ') : 'append ' + v.append.map(s => s.arg).join(' ')]))));
  R.check('c) after that relaunch the switches are on the command line, so there is nothing left to add (no loop)', after.add.length === 0 && !E.planSwitches(after, { ozoneNow: 'x11' }).relaunch, after.summary);
  R.check('c) the log\'s environment line names what decides the window system, and leaves unset variables out',
    E.loggedEnv(DECK).includes('XDG_SESSION_TYPE=wayland') && E.loggedEnv(DECK).includes('WAYLAND_DISPLAY=gamescope-0') && !E.loggedEnv({ SteamDeck: '1' }).includes('DISPLAY') && E.loggedEnv({}) === '(none of them set)', E.loggedEnv(DECK));

  // ---------------------------------------------------------------- d) the AppImage's AppRun
  const run = appRunScript({ name: 'Pawhaven', exe: 'pawhaven' });
  R.check('d) AppRun is a bash script with LF line endings that ends by exec\'ing the app with the added switches before the player\'s',
    run.startsWith('#!/usr/bin/env bash\n') && !run.includes('\r') && run.includes('exec "$HERE/pawhaven" "${ADD[@]}" "$@"') && run.includes('unshare -Ur true'), `${run.length} bytes`);
  const bash = findBash();
  if (!bash) R.note('d) no bash found (set BASH_EXE): the AppRun runs were skipped');
  else {
    const dir = path.join(TMP, 'AppDir'); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'AppRun'), run);
    fs.writeFileSync(path.join(dir, 'pawhaven'), '#!/usr/bin/env bash\nfor a in "$@"; do printf \'ARG %s\\n\' "$a"; done\nprintf \'ADDED %s\\n\' "$PAWHAVEN_APPRUN_ADDED"\n');
    fs.writeFileSync(path.join(dir, 'unshare'), '#!/usr/bin/env bash\n[ "$FAKE_USERNS" = 1 ]\n'); // (AppRun puts its own folder first on PATH)
    for (const f of ['AppRun', 'pawhaven', 'unshare']) { try { fs.chmodSync(path.join(dir, f), 0o755); } catch (e) { /* */ } }
    const base = { ...process.env }; for (const k of [...E.SIGNALS, 'APPDIR', 'PAWHAVEN_APPRUN_ADDED']) for (const key of Object.keys(base)) if (key.toLowerCase() === k.toLowerCase()) delete base[key];
    const appRun = (env, argv, userns) => {
      const out = execFileSync(bash, [posix(path.join(dir, 'AppRun')), ...argv], { env: { ...base, ...env, APPDIR: posix(dir), FAKE_USERNS: userns ? '1' : '0' }, encoding: 'utf8', timeout: 20000 });
      const all = out.split(/\r?\n/).filter(l => l.startsWith('ARG ')).map(l => l.slice(4)), added = all.slice(0, all.length - argv.length);
      return { all, added, kept: same(all.slice(added.length), argv), reported: (out.match(/^ADDED (.*)$/m) || [])[1]?.trim() ?? null };
    };
    const twice = a => ['--no-sandbox', '--ozone-platform'].some(n => a.filter(x => x === n || x.startsWith(n + '=')).length > 1);
    const bad = []; let runs = 0;
    const expect = (label, env, argv, userns, want) => {
      const r = appRun(env, argv, userns); runs++;
      if (!same(r.added, want) || !r.kept || twice(r.all) || r.reported !== want.join(' ')) bad.push(`${label}: added ${JSON.stringify(r.added)}, want ${JSON.stringify(want)}${r.kept ? '' : ', the player\'s args changed'}${twice(r.all) ? ', a switch twice' : ''}, reported "${r.reported}"`);
    };
    // every environment, the same decision as steamenv.cjs (user namespaces present, so only Steam adds anything)
    for (const [k, env] of Object.entries(ENVS)) expect(`env ${k}`, env, [], true, args(E.gameModeEnv({ env, argv: [], platform: 'linux' })));
    // the Deck with every command line
    for (const [k, argv] of Object.entries(ARGVS)) expect(`deck ${k}`, DECK, argv, true, args(E.gameModeEnv({ env: DECK, argv, platform: 'linux' })));
    // no Steam: the user-namespace check, as before
    expect('no userns', {}, [], false, ['--no-sandbox']);
    expect('no userns, --no-sandbox given', {}, ['--no-sandbox', '--windowed'], false, []);
    expect('no userns under Steam (added once)', DECK, [], false, BOTH);
    R.check(`d) AppRun (run ${runs} times by ${path.basename(bash)} with a stand-in app) adds what steamenv.cjs decides, never a switch twice, keeps the player's arguments in order, reports what it added, and still adds --no-sandbox without user namespaces`,
      !bad.length, bad.join(' | ') || `${runs} runs`);
  }

  // ---------------------------------------------------------------- e) the log
  let tick = Date.UTC(2026, 9, 10, 12, 0, 0);
  const now = () => new Date(tick += 1000);
  const LD = path.join(TMP, 'logs');
  const L = ML.openLog({ dir: LD, maxBytes: 400, keep: 2, now });
  L.write('info', 'hello'); L.write('warn', 'two\nlines');
  const first = fs.readFileSync(L.file, 'utf8');
  R.check('e) one record per line: "<ISO time> <level> <text>", continuation lines indented',
    /^2026-10-10T12:00:01\.000Z info  hello\n2026-10-10T12:00:02\.000Z warn  two\n  lines\n$/.test(first), JSON.stringify(first));
  for (let i = 0; i < 60; i++) L.write('info', `line ${String(i).padStart(2, '0')} ${'x'.repeat(30)}`);
  const names = fs.readdirSync(LD).sort(), sizes = names.map(n => fs.statSync(path.join(LD, n)).size);
  const cur = fs.readFileSync(path.join(LD, 'main.log'), 'utf8'), old1 = fs.readFileSync(path.join(LD, 'main.1.log'), 'utf8');
  const lastNum = s => Math.max(...[...s.matchAll(/line (\d\d)/g)].map(m => +m[1]));
  R.check('e) while writing it rotates at the size cap: main.log, main.1.log, main.2.log and no more, each under the cap, the newest line in main.log',
    same(names, ['main.1.log', 'main.2.log', 'main.log']) && sizes.every(s => s <= 400) && /line 59/.test(cur) && lastNum(old1) < lastNum(cur), JSON.stringify({ names, sizes }));
  const LD2 = path.join(TMP, 'logs2'); fs.mkdirSync(LD2); fs.writeFileSync(path.join(LD2, 'main.log'), 'y'.repeat(500)); fs.writeFileSync(path.join(LD2, 'main.1.log'), 'older');
  const L2 = ML.openLog({ dir: LD2, maxBytes: 400, keep: 2, now }); L2.write('info', 'fresh start');
  R.check('e) at the start an over-size main.log is rotated first (main.log → main.1.log → main.2.log)',
    fs.readFileSync(path.join(LD2, 'main.1.log'), 'utf8') === 'y'.repeat(500) && fs.readFileSync(path.join(LD2, 'main.2.log'), 'utf8') === 'older' && /fresh start\n$/.test(fs.readFileSync(path.join(LD2, 'main.log'), 'utf8')) && fs.statSync(path.join(LD2, 'main.log')).size < 100);
  const blocker = path.join(TMP, 'a-file'); fs.writeFileSync(blocker, 'not a folder');
  let threw = null, L3 = null, w3 = null;
  try { L3 = ML.openLog({ dir: path.join(blocker, 'logs') }); w3 = L3.write('info', 'nowhere'); for (let i = 0; i < 10; i++) L3.write('error', 'still nowhere'); } catch (e) { threw = e; }
  R.check('e) a folder it can\'t create or write never throws: the log is just off', !threw && L3 && L3.ok === false && w3 === false, threw?.message || '');
  const printed = [], fake = { log: (...a) => printed.push(['log', ...a]), info: (...a) => printed.push(['info', ...a]), warn: (...a) => printed.push(['warn', ...a]), error: (...a) => printed.push(['error', ...a]), debug: (...a) => printed.push(['debug', ...a]) };
  const LD4 = path.join(TMP, 'logs4'), L4 = ML.openLog({ dir: LD4, now });
  ML.wrapConsole(fake, L4);
  fake.log('[env] %s: %d', 'switches', 2); fake.warn('[window]', { a: 1 }); fake.error(new Error('boom'));
  const t4 = fs.readFileSync(L4.file, 'utf8');
  R.check('e) wrapConsole: console.log / warn / error still print with their own arguments and also append (formatted, an error with its stack)',
    printed.length === 3 && printed[0][1] === '[env] %s: %d' && printed[0][3] === 2 && / info  \[env\] switches: 2\n/.test(t4) && / warn  \[window\] \{ a: 1 \}\n/.test(t4) && / error Error: boom\n {2}\s*at /.test(t4), JSON.stringify(t4.slice(0, 300)));
  const LD5 = path.join(TMP, 'logs5'), L5 = ML.openLog({ dir: LD5, now }); L5.write('info', 'z'.repeat(20000));
  R.check('e) a huge record is capped', fs.statSync(L5.file).size < 8200 && /more characters\)\n$/.test(fs.readFileSync(L5.file, 'utf8')));
} catch (err) { R.check('the run finished', false, String(err.stack || err).split('\n').slice(0, 3).join(' | ')); }

try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { /* */ }
process.exit(R.finish([], []) ? 1 : 0);

/** a bash to run AppRun with: BASH_EXE, else Git Bash on Windows (not WSL's), else /bin/bash */
function findBash() {
  if (process.env.BASH_EXE) return process.env.BASH_EXE;
  if (process.platform !== 'win32') return ['/bin/bash', '/usr/bin/bash'].find(p => fs.existsSync(p)) || null;
  const c = [];
  try { c.push(path.resolve(execFileSync('git', ['--exec-path'], { encoding: 'utf8' }).trim(), '../../../bin/bash.exe')); } catch (e) { /* no git */ }
  c.push(path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Git', 'bin', 'bash.exe'));
  return c.find(p => fs.existsSync(p)) || null;
}
/** a path as bash sees it (Git Bash: C:\a\b → /c/a/b) */
function posix(p) { return process.platform === 'win32' ? p.replace(/^([A-Za-z]):/, (m, d) => '/' + d.toLowerCase()).replace(/\\/g, '/') : p; }
