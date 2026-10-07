// The desktop app smoke test (docs/DESKTOP.md, ROADMAP CT-4): boots the packaged Windows app (release/desktop/
// win-unpacked/Pawhaven.exe from `npm run build:desktop`, or EXE=…) through Playwright's Electron support, windowed,
// with its own throwaway userData folder, and checks:
//   a) the title loads from the app's files: the app:// origin (a secure context), window.pawhaven (desktop, not a
//      Deck, the platform), WebGL on the GPU, the Quit button, no page errors;
//   b) Settings › Full screen and the pause menu's Quit game show; the toggle really switches the window (and back);
//   c) it plays: New Game, the village; the Gamepad API is there and the window has focus; a virtual pad (as
//      tools/qa/pad-lib.mjs) walks the hero, the glyphs show and a panel takes the focus ring;
//   d) Quit game saves and closes the app; a relaunch finds the save (Continue) and the remembered window state;
//   e) SteamDeck=1 in the environment (as Steam sets on a Deck): window.pawhaven.deck and the Deck preset.
// Screenshots go to SHOT_DIR (default tools/qa/tmp/desktop).   usage: node tools/qa/desktop-smoke.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';
import { makeReport } from './lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EXE = process.env.EXE || path.join(ROOT, 'release/desktop/win-unpacked/Pawhaven.exe');
const OUT = process.env.SHOT_DIR || path.join(ROOT, 'tools/qa/tmp/desktop');
fs.mkdirSync(OUT, { recursive: true });
const R = makeReport('desktop-smoke');
const errors = [];
if (!fs.existsSync(EXE)) { console.log(`no app at ${EXE}: run npm run build:desktop (or -- --win --dir) first`); process.exit(1); }
const UD = fs.mkdtempSync(path.join(os.tmpdir(), 'pawhaven-desktop-')), UD2 = fs.mkdtempSync(path.join(os.tmpdir(), 'pawhaven-deck-'));

async function start(ud, env = {}) {
  const app = await electron.launch({ executablePath: EXE, args: ['--windowed', `--user-data=${ud}`], env: { ...process.env, SteamDeck: '', ...env }, timeout: 90000 });
  const page = await app.firstWindow();
  page.on('pageerror', e => errors.push(`[pageerror] ${e.message}  ${(e.stack || '').split(/\r?\n/).slice(1, 4).map(l => l.trim()).join(' | ')}`));
  page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push(`[console.error] ${m.text()}`); });
  await page.waitForFunction(() => window.__ready === true && window.G?.player, null, { timeout: 90000 });
  await page.waitForTimeout(1500);
  return { app, page };
}
const winState = app => app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; return { full: w.isFullScreen(), focused: w.isFocused(), visible: w.isVisible(), size: w.getSize() }; });

try {
  // ---------------------------------------------------------------- a) the title from the app's files
  let { app, page } = await start(UD);
  const a = await page.evaluate(() => {
    const G = window.G, gl = G.engine.renderer.getContext(), e = gl.getExtension('WEBGL_debug_renderer_info');
    const P = window.pawhaven;
    return { origin: location.origin, secure: isSecureContext, desktop: P?.desktop, deck: P?.deck, platform: P?.platform, version: P?.version, title: !!G.titleActive,
      buttons: [...document.querySelectorAll('.l-title .ti-btns button')].map(b => b.textContent.trim()), gpu: e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : '', webgl2: gl instanceof WebGL2RenderingContext,
      preset: G.engine.preset, desktopClass: document.body.classList.contains('desktop-app') };
  });
  await page.screenshot({ path: path.join(OUT, 'title.png') });
  R.check('a) the title loads from the app\'s files on app://pawhaven (a secure context), with window.pawhaven (desktop, no Deck, the platform, the version), WebGL2 on the GPU and a Quit button',
    a.origin === 'app://pawhaven' && a.secure && a.desktop === true && a.deck === false && a.platform === 'win32' && /^\d+\.\d+\.\d+/.test(a.version) && a.title && a.buttons.some(t => /Quit/.test(t)) && a.webgl2 && !/SwiftShader|llvmpipe|Basic Render/i.test(a.gpu) && a.desktopClass, JSON.stringify(a));

  // ---------------------------------------------------------------- b) Settings › Full screen, the pause menu's Quit game
  await page.evaluate(() => { window.G.ui.open('menu', { view: 'settings', from: 'title' }); });
  await page.waitForTimeout(500);
  const rows = await page.evaluate(() => ({ full: !!document.querySelector('.p-menu .tog[data-k="fullscreen"]'), on: document.querySelector('.p-menu .tog[data-k="fullscreen"]')?.classList.contains('on'), quit: !!document.querySelector('.p-menu [data-a="exitGame"]') }));
  const w0 = await winState(app);
  await page.evaluate(() => window.G.ui.setSetting('fullscreen', true)); await page.waitForTimeout(1200);
  const w1 = await winState(app), on1 = await page.evaluate(() => document.querySelector('.p-menu .tog[data-k="fullscreen"]')?.classList.contains('on'));
  await page.evaluate(() => window.G.ui.setSetting('fullscreen', false)); await page.waitForTimeout(1200);
  const w2 = await winState(app);
  await page.evaluate(() => window.G.ui.close('menu')); await page.waitForTimeout(400);
  R.check('b) Settings › Full screen and the pause menu\'s Quit game show in the app; the toggle switches the window to full screen and back',
    rows.full && rows.on === false && rows.quit && !w0.full && w1.full && on1 && !w2.full, JSON.stringify({ rows, w0, w1, on1, w2 }));

  // ---------------------------------------------------------------- c) it plays, on a pad
  await page.evaluate(() => document.querySelector('.l-title [data-a="newGame"]')?.click());
  await page.waitForFunction(() => window.G && !window.G.titleActive && window.G.mode === 'village' && window.G.ui && !window.G.ui.iris?.active, null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(2500);
  for (let i = 0; i < 30 && await page.evaluate(() => window.G.ui.dlg?.active); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(250); } // (the intro's lines)
  const pads0 = await page.evaluate(() => { try { return [...navigator.getGamepads()].filter(Boolean).map(p => p.id); } catch (e) { return 'threw: ' + e.message; } });
  const focus = { doc: await page.evaluate(() => document.hasFocus() && document.visibilityState), win: (await winState(app)).focused };
  const c = await page.evaluate(async () => {
    const G = window.G, P = G.player, wait = ms => new Promise(r => setTimeout(r, ms));
    const btn = () => ({ pressed: false, touched: false, value: 0 }), pad = { id: 'Xbox 360 Controller (XInput STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', timestamp: performance.now(), axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, btn) };
    navigator.getGamepads = () => [pad, null, null, null];
    const p0 = P.pos.clone(); pad.axes[1] = -1; pad.timestamp = performance.now(); await wait(900); pad.axes[1] = 0; await wait(200);
    const r = { mode: G.mode, title: G.titleActive, dev: G.controls.device, moved: +P.pos.distanceTo(p0).toFixed(2), glyphs: document.querySelectorAll('.hud .hotbar .hb-k.pad svg, .hud .kc.pad svg').length, cursorHidden: document.body.classList.contains('pad-active') };
    for (let i = 0; i < 20 && (G.ui.dlg?.active || G.ui.anyModal?.()); i++) { G.ui.dlg?.active && G.ui.dlg.key?.('Escape'); await wait(150); } // (nothing in the way of the bag)
    G.ui.open('inventory', { view: 'bag' });
    for (let i = 0; i < 20 && !(document.querySelector('.pad-ring')?.classList.contains('on') && G.ui.padNav.cur); i++) await wait(100);
    r.ring = document.querySelector('.pad-ring')?.classList.contains('on') && !!G.ui.padNav.cur;
    G.ui.close('inventory');
    return r;
  });
  await page.screenshot({ path: path.join(OUT, 'village.png') });
  R.check('c) it plays: New Game reaches the village; the Gamepad API answers and the window has focus; a pad walks the hero, the glyphs show, a panel takes the focus ring',
    c.mode === 'village' && !c.title && Array.isArray(pads0) && focus.doc === 'visible' && focus.win && c.dev === 'pad' && c.moved > 1.5 && c.glyphs >= 4 && c.cursorHidden && c.ring, JSON.stringify({ ...c, pads: pads0, focus }));

  // ---------------------------------------------------------------- d) Quit game saves and closes; a relaunch finds it
  const lvl = await page.evaluate(() => { window.G.state.player.xp += 7; return window.G.state.player.xp; });
  await page.evaluate(() => window.G.ui.open('menu'));
  await page.waitForTimeout(500);
  const closed = new Promise(res => app.once('close', () => res(true)));
  await page.evaluate(() => document.querySelector('.p-menu [data-a="exitGame"]').click());
  const didClose = await Promise.race([closed, new Promise(res => setTimeout(() => res(false), 15000))]);
  if (!didClose) await app.close().catch(() => {});
  const ws = (() => { try { return JSON.parse(fs.readFileSync(path.join(UD, 'window.json'), 'utf8')); } catch (e) { return null; } })();
  ({ app, page } = await start(UD));
  const d = await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('chewy3d.save') || 'null'); const c = document.querySelector('.l-title [data-a="continue"]'); return { save: !!s, xp: s?.heroes?.chewy?.player?.xp ?? s?.player?.xp, cont: !!c && !c.disabled, title: !!window.G.titleActive }; });
  R.check('d) Quit game saves and closes the app; a relaunch has the save (Continue) and the window state in userData', didClose && d.save && d.xp === lvl && d.cont && d.title && ws && ws.fullscreen === false, JSON.stringify({ didClose, d, lvl, ws, userData: UD }));
  await app.close();

  // ---------------------------------------------------------------- e) on a Steam Deck (Steam sets SteamDeck=1)
  ({ app, page } = await start(UD2, { SteamDeck: '1' }));
  const e = await page.evaluate(() => ({ deck: window.pawhaven.deck, preset: window.G.engine.preset, engineDeck: window.G.engine.deck, settingsQ: window.G.ui.settings.quality }));
  R.check('e) with SteamDeck=1 the app reports a Deck and a first start picks the Deck preset', e.deck === true && e.preset === 3 && e.engineDeck && e.settingsQ === 3, JSON.stringify(e));
  await app.close();
} catch (err) { R.check('the run finished', false, String(err.message || err).split('\n')[0]); }

for (const d of [UD, UD2]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) { /* (Chromium may still hold a file a moment) */ } }
process.exit(R.finish(errors, []) ? 1 : 0);
