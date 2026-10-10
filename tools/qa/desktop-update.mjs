// The desktop app's in-app updates, end to end (docs/DESKTOP.md "Updates from inside the app", ROADMAP CT-9). It boots
// the packaged Windows app (release/desktop/win-unpacked/Pawhaven.exe from `npm run build:desktop -- --win [--dir]`, or
// EXE=…) through Playwright's Electron support, with its own throwaway userData and --update-url pointing at a local
// test server (no GitHub, nothing published). Two content packs are made from the build's own game
// (dist-desktop/app/game): a good "9.9.1" (the same game, its baked version changed) and a broken "9.9.2" (an
// index.html that throws, so it never reaches window.__ready). Checks:
//   a) offline: the launch check fails quietly (no card); Settings › About › Check for updates says so gently.
//      A game is started and saved here (the save must survive everything below)
//   b) a newer version: the card opens over the title (v9.9.1, Install now / Later) with the pad's focus ring on
//      Install now; the pad's B is Later; a reload to the title (as Quit to title does) doesn't fetch or ask again
//   c) the next launch asks again; a pack whose SHA-256 is wrong is refused: nothing installed, the game unchanged
//   d) Install now (the pad's A): it downloads, checks, switches and reloads into 9.9.1 (the title footer, About and a
//      toast say so; the trial is confirmed); a relaunch still serves 9.9.1 and finds nothing newer ("up to date")
//   e) a broken 9.9.2: installed, it never starts, so after the boot timeout the app rolls back to 9.9.1 by itself (a
//      toast says so); the next launch doesn't offer 9.9.2 again, a manual check does (marked as failed before)
//   f) the save and the settings survived it all; nothing outside userData/updates/ was touched
// Screenshots go to SHOT_DIR (default tools/qa/tmp/desktop-update).   usage: node tools/qa/desktop-update.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { _electron as electron } from 'playwright-core';
import { makeReport } from './lib.mjs';
import { packGame } from '../desktop/contentpack.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const U = createRequire(import.meta.url)(path.join(ROOT, 'tools/desktop/updater.cjs'));
const EXE = process.env.EXE || path.join(ROOT, 'release/desktop/win-unpacked/Pawhaven.exe');
const GAME = path.join(ROOT, 'dist-desktop/app/game');
const OUT = process.env.SHOT_DIR || path.join(ROOT, 'tools/qa/tmp/desktop-update');
fs.mkdirSync(OUT, { recursive: true });
const R = makeReport('desktop-update');
const errors = [], mainLog = [];
if (!fs.existsSync(EXE)) { console.log(`no app at ${EXE}: run npm run build:desktop -- --win (or -- --win --dir) first`); process.exit(1); }
const V0 = U.gameVersionOf(GAME);
if (!V0) { console.log(`no content.json in ${GAME}: build again (npm run build:desktop -- --win --dir)`); process.exit(1); }
const VA = '9.9.1', VB = '9.9.2';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'pawhaven-update-qa-'));
const UD = path.join(TMP, 'userData');

// ---------------------------------------------------------------- the packs
function makeGood() {
  const dir = path.join(TMP, `game-${VA}`);
  fs.cpSync(GAME, dir, { recursive: true });
  let n = 0;
  for (const f of fs.readdirSync(path.join(dir, 'assets')).filter(f => f.endsWith('.js'))) {
    const p = path.join(dir, 'assets', f), s = fs.readFileSync(p, 'utf8');
    const c = s.split('`' + V0 + '`').length - 1 + s.split(`"${V0}"`).length - 1;
    if (c) { n += c; fs.writeFileSync(p, s.split('`' + V0 + '`').join('`' + VA + '`').split(`"${V0}"`).join(`"${VA}"`)); }
  }
  if (!n) throw new Error(`the build's version ${V0} wasn't found in its JavaScript: can't make a newer pack`);
  fs.writeFileSync(path.join(dir, 'content.json'), JSON.stringify({ name: 'pawhaven-game', version: VA }) + '\n');
  return packGame(dir, path.join(TMP, 'packs', `pawhaven-game-${VA}.zip`));
}
function makeBroken() {
  const dir = path.join(TMP, `game-${VB}`); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><meta charset="utf-8"><title>broken</title><script>throw new Error("a broken update (QA)")</script><p>broken</p>');
  fs.writeFileSync(path.join(dir, 'content.json'), JSON.stringify({ name: 'pawhaven-game', version: VB }) + '\n');
  return packGame(dir, path.join(TMP, 'packs', `pawhaven-game-${VB}.zip`));
}
const good = makeGood(), broken = makeBroken();

// ---------------------------------------------------------------- the local "GitHub"
let MANIFEST = null; const hits = { manifest: 0, packs: 0 };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/update.json') { hits.manifest++; if (!MANIFEST) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(MANIFEST)); }
  const m = /^\/packs\/([\w.-]+)$/.exec(u.pathname), file = m && path.join(TMP, 'packs', m[1]);
  if (!file || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  hits.packs++;
  const buf = fs.readFileSync(file), r = /^bytes=(\d+)-$/.exec(req.headers.range || '');
  if (r) { const s = +r[1]; res.writeHead(206, { 'content-range': `bytes ${s}-${buf.length - 1}/${buf.length}`, 'content-length': buf.length - s }); return res.end(buf.subarray(s)); }
  res.writeHead(200, { 'content-length': buf.length, 'content-type': 'application/zip' }); res.end(buf);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;
const dead = http.createServer(); await new Promise(r => dead.listen(0, '127.0.0.1', r)); const DEAD = `http://127.0.0.1:${dead.address().port}/update.json`; await new Promise(r => dead.close(r));
const manifestFor = (pack, version, o = {}) => ({ schema: 1, name: 'Pawhaven', version, released: '2026-10-10', notes: o.notes ?? `Pawhaven ${version}: a test update from the QA.\nSecond line of notes.`,
  content: { url: `${BASE}/packs/${path.basename(pack.file)}`, sha256: o.sha256 || pack.sha256, size: pack.size, minShell: V0 } });

// ---------------------------------------------------------------- the app
async function start(updateUrl, extra = []) {
  const app = await electron.launch({ executablePath: EXE, args: ['--windowed', `--user-data=${UD}`, `--update-url=${updateUrl}`, '--update-boot-timeout=12', ...extra], env: { ...process.env, SteamDeck: '' }, timeout: 90000 });
  app.process().stdout?.on('data', d => { for (const l of String(d).split(/\r?\n/)) if (l.includes('[updates]')) mainLog.push(l.trim()); });
  const page = await app.firstWindow();
  page.on('pageerror', e => { if (!/a broken update \(QA\)/.test(e.message)) errors.push(`[pageerror] ${e.message}`); });
  page.on('console', m => { if (m.type() === 'error' && !/favicon|a broken update \(QA\)/.test(m.text())) errors.push(`[console.error] ${m.text()}`); });
  await page.waitForFunction(() => window.__ready === true && window.G?.ui?.ready, null, { timeout: 90000 });
  return { app, page };
}
const stop = async app => { const closed = new Promise(r => app.once('close', r)); await app.close().catch(() => {}); await Promise.race([closed, new Promise(r => setTimeout(r, 10000))]); };
const autoDone = page => page.waitForFunction(() => window.G.ui.desktopUpdate?.auto === 'done', null, { timeout: 30000 });
const cardUp = page => page.waitForFunction(() => window.G.ui.isOpen('menu') && window.G.ui.panels.menu.view === 'update' && !!document.querySelector('.mn-update .up-t'), null, { timeout: 30000 });
const card = page => page.evaluate(() => { const u = window.G.ui.desktopUpdate; return { phase: u.phase, open: window.G.ui.isOpen('menu') && window.G.ui.panels.menu.view === 'update', title: document.querySelector('.mn-update .up-t')?.textContent || '', sub: document.querySelector('.mn-update .up-sub')?.textContent || '', btns: [...document.querySelectorAll('.mn-update .up-btns button')].map(b => b.dataset.a), notes: document.querySelector('.mn-update .up-notes')?.textContent || '', warn: document.querySelector('.mn-update .up-note.warn')?.textContent || '', auto: u.auto, autoRes: u.autoRes?.status }; });
const shownVersion = page => page.evaluate(() => ({ foot: document.querySelector('.ti-foot')?.textContent || '', about: document.querySelector('.p-menu .mn-ver')?.textContent || '' }));
const state = () => { try { return JSON.parse(fs.readFileSync(path.join(UD, 'updates/state.json'), 'utf8')); } catch (e) { return null; } };
// a virtual pad (as tools/qa/pad-lib.mjs and desktop-smoke): press(button index) for ~120 ms
const padOn = page => page.evaluate(() => {
  const btn = () => ({ pressed: false, touched: false, value: 0 });
  const pad = window.__qaPad = { id: 'Xbox 360 Controller (XInput STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', timestamp: performance.now(), axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, btn) };
  navigator.getGamepads = () => [pad, null, null, null];
});
const press = (page, i) => page.evaluate(async i => { const p = window.__qaPad, b = p.buttons[i]; b.pressed = true; b.value = 1; p.timestamp = performance.now(); await new Promise(r => setTimeout(r, 140)); b.pressed = false; b.value = 0; p.timestamp = performance.now(); await new Promise(r => setTimeout(r, 140)); }, i);
const PAD = { A: 0, B: 1, LB: 4 };
const toasts = page => page.evaluate(() => [...document.querySelectorAll('.toast, .toasts > *')].map(t => t.textContent.trim()).filter(Boolean));
const waitToast = (page, re) => page.waitForFunction(src => [...document.querySelectorAll('.toast, .toasts > *')].some(t => new RegExp(src).test(t.textContent)), re.source, { timeout: 20000 }).then(() => true, () => false);

let app, page;
try {
  // ---------------------------------------------------------------- a) offline
  ({ app, page } = await start(DEAD));
  await autoDone(page);
  const a1 = await card(page);
  await page.evaluate(() => { window.G.ui.layers.title.classList.add('behind'); window.G.ui.open('menu', { view: 'settings', from: 'title' }); });
  await page.waitForTimeout(400);
  const about = await page.evaluate(() => ({ btn: !!document.querySelector('.p-menu [data-a="checkUpdate"]'), ver: document.querySelector('.p-menu .mn-ver')?.textContent }));
  await page.evaluate(() => document.querySelector('.p-menu [data-a="checkUpdate"]').click());
  await page.waitForFunction(() => window.G.ui.desktopUpdate.phase === 'error', null, { timeout: 30000 });
  const a2 = await card(page);
  await page.screenshot({ path: path.join(OUT, 'a-offline-manual.png') });
  R.check('a) offline: the launch check fails quietly (no card); Settings › About › Check for updates says it couldn\'t, gently, with Try again and Back',
    a1.auto === 'done' && a1.autoRes === 'error' && !a1.open && about.btn && about.ver === `Pawhaven v${V0}` && a2.open && /Couldn't check/.test(a2.title) && /internet/.test(a2.sub) && a2.btns.join() === 'updRetry,back', JSON.stringify({ a1, about, a2 }));
  // a save to keep safe: New Game, some XP, saved
  await page.evaluate(() => window.G.ui.close('menu'));
  await page.evaluate(() => document.querySelector('.l-title [data-a="newGame"]')?.click());
  await page.waitForFunction(() => window.__ready === true && window.G && !window.G.titleActive && window.G.mode === 'village', null, { timeout: 90000 });
  for (let i = 0; i < 30 && await page.evaluate(() => window.G.ui.dlg?.active); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(200); }
  const XP = await page.evaluate(() => { window.G.state.player.xp += 13; window.G.save(); localStorage.setItem('pawhaven.qa.marker', 'still here'); return window.G.state.player.xp; });
  const settings0 = await page.evaluate(() => localStorage.getItem('chewy3d.settings') || localStorage.getItem('chewy3d.ui') || '');
  await stop(app);

  // ---------------------------------------------------------------- b) a newer version: the card, the pad, Later, no nagging
  MANIFEST = manifestFor(good, VA);
  ({ app, page } = await start(`${BASE}/update.json`));
  await cardUp(page);
  await padOn(page); await press(page, PAD.LB); // (the pad takes over: the focus ring comes up)
  await page.waitForFunction(() => window.G.ui.padNav?.cur && document.querySelector('.pad-ring')?.classList.contains('on'), null, { timeout: 8000 }).catch(() => {});
  const b1 = { ...(await card(page)), focus: await page.evaluate(() => window.G.ui.padNav.cur?.dataset.a || null), ring: await page.evaluate(() => document.querySelector('.pad-ring')?.classList.contains('on')), behind: await page.evaluate(() => window.G.ui.layers.title.classList.contains('behind')) };
  await page.screenshot({ path: path.join(OUT, 'b-card-pad.png') });
  R.check(`b) a newer version: the card opens over the title (v${VA}, the notes, Install now / Later) with the pad's focus ring on Install now`,
    b1.open && b1.title === `Update available: v${VA}` && /You have v/.test(b1.sub) && /MB download/.test(b1.sub) && /test update from the QA/.test(b1.notes) && b1.btns.join() === 'updInstall,updLater' && b1.focus === 'updInstall' && b1.ring && b1.behind, JSON.stringify(b1));
  await press(page, PAD.B);
  await page.waitForFunction(() => !window.G.ui.isOpen('menu'), null, { timeout: 5000 }).catch(() => {});
  const b2 = await card(page), h0 = hits.manifest;
  await page.evaluate(() => location.reload()); // (as Quit to title does)
  await page.waitForFunction(() => window.__ready === true && window.G?.ui?.desktopUpdate?.auto === 'done', null, { timeout: 90000 });
  await page.waitForTimeout(1500);
  const b3 = await card(page);
  R.check('b) the pad\'s B is Later: the card closes; back on the title (a reload) it neither fetches nor asks again this session',
    !b2.open && b3.autoRes === 'dismissed' && !b3.open && hits.manifest === h0, JSON.stringify({ b2: b2.open, b3, hits: hits.manifest, h0 }));
  await stop(app);

  // ---------------------------------------------------------------- c) the next launch asks again; a bad hash is refused
  MANIFEST = manifestFor(good, VA, { sha256: 'f'.repeat(64) });
  ({ app, page } = await start(`${BASE}/update.json`));
  await cardUp(page);
  const c0 = await card(page);
  await page.evaluate(() => document.querySelector('.mn-update [data-a="updInstall"]').click());
  await page.waitForFunction(() => ['failed', 'available'].includes(window.G.ui.desktopUpdate.phase), null, { timeout: 60000 });
  const c1 = await card(page);
  await page.screenshot({ path: path.join(OUT, 'c-bad-hash.png') });
  const left = fs.existsSync(path.join(UD, 'updates')) ? fs.readdirSync(path.join(UD, 'updates'), { recursive: true }).map(String) : [];
  const c1v = await shownVersion(page);
  R.check('c) the next launch asks again; a pack whose SHA-256 is wrong is refused ("failed its safety check"): nothing installed or left behind, the game still the built-in one',
    c0.open && c0.title === `Update available: v${VA}` && c1.phase === 'failed' && /safety check/.test(c1.sub) && /Nothing changed/.test(c1.sub) && !left.some(f => /game-9|\.part$|\.zip$/.test(f)) && (state()?.active ?? null) === null && c1v.foot.startsWith(`v${V0}`),
    JSON.stringify({ c1, left, foot: c1v.foot }));
  await page.evaluate(() => document.querySelector('.mn-update [data-a="back"]')?.click());
  await stop(app);

  // ---------------------------------------------------------------- d) Install now: download, check, switch, reload into 9.9.1
  MANIFEST = manifestFor(good, VA);
  ({ app, page } = await start(`${BASE}/update.json`));
  await cardUp(page);
  await padOn(page); await press(page, PAD.LB);
  await page.waitForFunction(() => window.G.ui.padNav?.cur?.dataset.a === 'updInstall', null, { timeout: 8000 }).catch(() => {});
  const phases = [];
  await page.exposeFunction('__qaPhase', p => phases.push(p)).catch(() => {});
  await page.evaluate(() => { window.pawhaven.update.onProgress(p => window.__qaPhase?.(p.phase)); });
  const nav = page.waitForEvent('framenavigated', { timeout: 60000 });
  await press(page, PAD.A);
  await page.waitForFunction(() => ['downloading', 'installing', 'restarting', 'failed'].includes(window.G.ui.desktopUpdate.phase), null, { timeout: 10000 }).catch(() => {});
  await page.screenshot({ path: path.join(OUT, 'd-installing.png') }).catch(() => {});
  await nav;
  await page.waitForFunction(() => window.__ready === true && window.G?.ui?.ready, null, { timeout: 90000 });
  const toastOk = await waitToast(page, new RegExp(`Pawhaven is now v${VA.replace(/\./g, '\\.')}`));
  await page.waitForFunction(() => window.G.ui.desktopUpdate?.auto === 'done', null, { timeout: 30000 }).catch(() => {});
  for (let i = 0; i < 40 && state()?.trial; i++) await page.waitForTimeout(250); // (the app confirms the trial once it sees window.__ready)
  const d1 = { v: await shownVersion(page), st: state(), auto: (await card(page)).autoRes, phases: [...new Set(phases)], ver: await page.evaluate(() => window.pawhaven.version), toastOk, toasts: await toasts(page) };
  await page.screenshot({ path: path.join(OUT, 'd-updated-title.png') });
  R.check(`d) Install now (the pad's A) downloads, checks, switches and reloads into v${VA}: the title footer says so, a toast says so, the trial is confirmed`,
    d1.phases.includes('download') && d1.phases.includes('restart') && d1.v.foot.startsWith(`v${VA}`) && d1.toastOk && d1.st?.active === VA && d1.st?.trial === null && d1.ver === V0 && d1.auto === 'none' && fs.existsSync(path.join(UD, `updates/game-${VA}/index.html`)),
    JSON.stringify(d1));
  const save1 = await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('chewy3d.save') || 'null'); return { xp: s?.heroes?.chewy?.player?.xp ?? s?.player?.xp, marker: localStorage.getItem('pawhaven.qa.marker') }; });
  await stop(app);
  ({ app, page } = await start(`${BASE}/update.json`));
  await autoDone(page);
  await page.evaluate(() => { window.G.ui.layers.title.classList.add('behind'); window.G.ui.open('menu', { view: 'settings', from: 'title' }); });
  await page.waitForTimeout(300);
  const d2v = await shownVersion(page);
  await page.evaluate(() => document.querySelector('.p-menu [data-a="checkUpdate"]').click());
  await page.waitForFunction(() => window.G.ui.desktopUpdate.phase === 'none', null, { timeout: 30000 }).catch(() => {});
  const d2 = await card(page);
  await page.screenshot({ path: path.join(OUT, 'd-up-to-date.png') });
  R.check(`d) a relaunch still serves v${VA} (footer and About) with no card; Check for updates says "You're up to date"; the save came through (XP ${XP})`,
    d2v.foot.startsWith(`v${VA}`) && d2v.about === `Pawhaven v${VA}` && d2.autoRes === 'none' && /up to date/.test(d2.title) && save1.xp === XP && save1.marker === 'still here', JSON.stringify({ d2v, d2, save1, XP }));
  await stop(app);

  // ---------------------------------------------------------------- e) a broken update rolls back by itself
  MANIFEST = manifestFor(broken, VB);
  ({ app, page } = await start(`${BASE}/update.json`));
  await cardUp(page);
  const t0 = Date.now();
  await page.evaluate(() => document.querySelector('.mn-update [data-a="updInstall"]').click());
  await page.waitForFunction(() => document.title === 'broken', null, { timeout: 60000 }).catch(() => {});
  const sawBroken = await page.evaluate(() => document.title === 'broken').catch(() => false);
  const midState = state();
  await page.waitForFunction(() => window.__ready === true && !!window.G?.ui?.ready, null, { timeout: 90000, polling: 500 });
  const toastBack = await waitToast(page, /wouldn't start/);
  const e1 = { sawBroken, mid: { active: midState?.active, trial: midState?.trial }, st: state(), v: await shownVersion(page), secs: Math.round((Date.now() - t0) / 1000), toastBack, toasts: await toasts(page) };
  await page.screenshot({ path: path.join(OUT, 'e-rolled-back.png') });
  R.check(`e) a broken v${VB} is installed on trial, never starts, and the app rolls back to v${VA} by itself after the boot timeout (a toast says so)`,
    e1.sawBroken && e1.mid.active === VB && e1.mid.trial === VB && e1.st?.active === VA && e1.st?.trial === null && (e1.st?.bad || []).includes(VB) && e1.v.foot.startsWith(`v${VA}`) && e1.toastBack && !fs.existsSync(path.join(UD, `updates/game-${VB}`)),
    JSON.stringify(e1));
  await stop(app);
  ({ app, page } = await start(`${BASE}/update.json`));
  await autoDone(page); await page.waitForTimeout(800);
  const e2 = await card(page);
  await page.evaluate(() => { window.G.ui.layers.title.classList.add('behind'); window.G.ui.open('menu', { view: 'settings', from: 'title' }); });
  await page.waitForTimeout(300);
  await page.evaluate(() => document.querySelector('.p-menu [data-a="checkUpdate"]').click());
  await page.waitForFunction(() => window.G.ui.desktopUpdate.phase === 'available', null, { timeout: 30000 }).catch(() => {});
  const e3 = await card(page);
  await page.screenshot({ path: path.join(OUT, 'e-manual-failed-before.png') });
  R.check(`e) the next launch doesn't offer v${VB} again; a manual check does, saying it didn't start last time`,
    e2.autoRes === 'none' && !e2.open && e3.open && e3.title === `Update available: v${VB}` && /didn't start last time/.test(e3.warn), JSON.stringify({ e2, e3 }));
  await page.evaluate(() => document.querySelector('.mn-update [data-a="updLater"]')?.click());

  // ---------------------------------------------------------------- f) the save and settings survived; nothing else touched
  const f1 = await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('chewy3d.save') || 'null'); return { xp: s?.heroes?.chewy?.player?.xp ?? s?.player?.xp, marker: localStorage.getItem('pawhaven.qa.marker'), settings: localStorage.getItem('chewy3d.settings') || localStorage.getItem('chewy3d.ui') || '' }; });
  const top = fs.readdirSync(UD), upd = fs.readdirSync(path.join(UD, 'updates'));
  R.check('f) the save (XP), a localStorage marker and the settings survived every update and rollback; userData/updates/ holds only the game folder and state',
    f1.xp === XP && f1.marker === 'still here' && (!settings0 || !!f1.settings) && top.includes('Local Storage') && upd.filter(n => n.startsWith('game-')).join() === `game-${VA}` && upd.includes('state.json'),
    JSON.stringify({ f1: { xp: f1.xp, marker: f1.marker }, XP, upd }));
  await stop(app); app = null;
} catch (err) { R.check('the run finished', false, String(err.message || err).split('\n')[0]); if (app) await stop(app).catch(() => {}); }

server.close();
if (mainLog.length) { console.log('  main process:'); for (const l of mainLog.slice(-14)) console.log('    ' + l); }
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { /* (Chromium may still hold a file a moment) */ }
process.exit(R.finish(errors, []) ? 1 : 0);
