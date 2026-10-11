// Steam and Game Mode on Linux: the Chromium switches the desktop shell adds there by itself (docs/DESKTOP.md
// "Troubleshooting", docs/CONTROLS.md §11, ROADMAP CT-10). Plain Node and pure, so tools/qa/desktop-env-unit.mjs tests it
// without Electron. main.cjs applies the decision; the AppImage's AppRun (tools/desktop/appimage.mjs) makes the same one in
// bash, so in the AppImage the switches are on Chromium's real command line from the first exec.
//
// Why: in the Deck's Game Mode (gamescope) the 0.6.5 AppImage showed only Steam's spinner until the owner added the
// launch options --no-sandbox --ozone-platform=x11 (2026-10-10). Electron picks Wayland when the session offers it, and
// gamescope only puts the game's X11 (Xwayland) windows on screen.
//
// gameModeEnv({ env, argv, platform }) → {
//   platform, steam,       under Steam or gamescope: any of the signals below
//   signals,               which, as NAME=value (for the log)
//   applies,               Linux and steam
//   add,                   the switches to add: [{ name, value?, arg }]
//   skip,                  the switches it left out, and why
//   summary }              one line for the log
// The signals: GAMESCOPE_WAYLAND_DISPLAY set; XDG_CURRENT_DESKTOP contains "gamescope" (any case); SteamDeck=1;
// SteamGameId or SteamAppId set and not 0 (a non-Steam shortcut has SteamAppId=0).
// On Linux only, it then asks for
//   --ozone-platform=x11   unless an --ozone-platform or --ozone-platform-hint switch is given, or --no-x11 (the opt-out)
//   --no-sandbox           unless it is given already
// Windows and macOS: never anything.
'use strict';

const OZONE = 'x11';
const SIGNALS = ['GAMESCOPE_WAYLAND_DISPLAY', 'XDG_CURRENT_DESKTOP', 'SteamDeck', 'SteamGameId', 'SteamAppId'];
/** the environment the log records (what decides the window system and the Steam launch) */
const LOGGED_ENV = ['XDG_SESSION_TYPE', 'XDG_CURRENT_DESKTOP', 'WAYLAND_DISPLAY', 'DISPLAY', 'GAMESCOPE_WAYLAND_DISPLAY', 'SteamDeck', 'SteamGameId', 'SteamAppId', 'SteamEnv', 'APPIMAGE', 'PAWHAVEN_APPRUN_ADDED'];

/** is --name (or --name=…) among the arguments */
const hasSwitch = (argv, name) => (argv || []).some(a => typeof a === 'string' && (a === `--${name}` || a.startsWith(`--${name}=`)));
const set = v => typeof v === 'string' && v !== '';
const steamId = v => set(v) && v !== '0';

/** the Steam / gamescope signals present in env, as NAME=value */
function steamSignals(env = {}) {
  const out = [];
  if (set(env.GAMESCOPE_WAYLAND_DISPLAY)) out.push(`GAMESCOPE_WAYLAND_DISPLAY=${env.GAMESCOPE_WAYLAND_DISPLAY}`);
  if (set(env.XDG_CURRENT_DESKTOP) && /gamescope/i.test(env.XDG_CURRENT_DESKTOP)) out.push(`XDG_CURRENT_DESKTOP=${env.XDG_CURRENT_DESKTOP}`);
  if (env.SteamDeck === '1') out.push('SteamDeck=1');
  if (steamId(env.SteamGameId)) out.push(`SteamGameId=${env.SteamGameId}`);
  if (steamId(env.SteamAppId)) out.push(`SteamAppId=${env.SteamAppId}`);
  return out;
}

function gameModeEnv({ env = process.env, argv = process.argv, platform = process.platform } = {}) {
  const signals = steamSignals(env), steam = signals.length > 0, applies = steam && platform === 'linux';
  const add = [], skip = [];
  if (applies) {
    if (hasSwitch(argv, 'no-x11')) skip.push('ozone-platform: --no-x11 (the opt-out: Chromium picks)');
    else if (hasSwitch(argv, 'ozone-platform')) skip.push(`ozone-platform: given (${argv.find(a => a === '--ozone-platform' || String(a).startsWith('--ozone-platform='))})`);
    else if (hasSwitch(argv, 'ozone-platform-hint')) skip.push(`ozone-platform: --ozone-platform-hint given (${argv.find(a => String(a).startsWith('--ozone-platform-hint'))})`);
    else add.push({ name: 'ozone-platform', value: OZONE, arg: `--ozone-platform=${OZONE}` });
    if (hasSwitch(argv, 'no-sandbox')) skip.push('no-sandbox: given');
    else add.push({ name: 'no-sandbox', arg: '--no-sandbox' });
  }
  const summary = !steam ? 'not under Steam or gamescope: no switches'
    : !applies ? `Steam / gamescope (${signals.join(', ')}) on ${platform}: switches are for Linux only, none added`
    : `Steam / gamescope (${signals.join(', ')}): ${add.length ? 'adding ' + add.map(s => s.arg).join(' ') : 'nothing to add'}${skip.length ? '; ' + skip.join('; ') : ''}`;
  return { platform, steam, signals, applies, add, skip, summary };
}

/**
 * How main.cjs applies a decision. Chromium reads the window system (ozone) and the sandbox very early, before the main
 * script runs, so an appended switch reaches the browser process's children but not the browser process itself.
 *   ozoneNow:   app.commandLine.getSwitchValue('ozone-platform'): the platform this process was started on ('' if unset)
 *   relaunched: this process is already the relaunch (PAWHAVEN_RELAUNCHED=1): never relaunch twice
 * → { append: [switch], relaunch: [arg] | null, note }
 *   no-sandbox is appended (the children start without the sandbox; the AppImage's AppRun covers the browser process).
 *   ozone-platform is appended only when the process already runs on that platform; otherwise the GPU process would
 *   use another window system than the browser, so the app relaunches itself once with the switches on its command line
 *   (the tar.gz's pawhaven started straight from Steam; the AppImage never gets here, its AppRun passes them).
 */
function planSwitches(decision, { ozoneNow = '', relaunched = false } = {}) {
  const oz = decision.add.find(s => s.name === 'ozone-platform');
  if (oz && ozoneNow !== oz.value && !relaunched) return { append: [], relaunch: decision.add.map(s => s.arg), note: `this process started on ozone "${ozoneNow || 'default'}": relaunching with ${decision.add.map(s => s.arg).join(' ')}` };
  const note = !decision.add.length ? 'no switches to apply' : oz && ozoneNow !== oz.value ? `appending ${decision.add.map(s => s.arg).join(' ')} (already relaunched once; this process started on ozone "${ozoneNow || 'default'}")` : `appending ${decision.add.map(s => s.arg).join(' ')}`;
  return { append: decision.add.slice(), relaunch: null, note };
}

/** NAME=value for the environment variables the log records (unset ones left out) */
const loggedEnv = (env = process.env) => LOGGED_ENV.filter(k => set(env[k])).map(k => `${k}=${env[k]}`).join(' ') || '(none of them set)';

module.exports = { OZONE, SIGNALS, LOGGED_ENV, hasSwitch, steamSignals, gameModeEnv, planSwitches, loggedEnv };
