// CT-10's screenshots (ROADMAP CT-10, docs/CONTROLS.md §10.5 and §12.11): the owner's Deck and phone layout report.
//   app    Settings in the packaged desktop app as a Deck runs it (--deck, the window's page 1280×800, a virtual pad): the
//          menu, Settings, Controls with each device's tab, from the game and from the title, each at the top of its
//          body and scrolled to its foot (deck-*.png)
//   phone  the same views on phones in landscape with an iPhone's Safari agent at DPR 3 (844×390, 667×375, 932×430),
//          from the pause menu and from the title (phone-<w>x<h>-*.png)
//   ipad   the same on an iPad (1180×820, DPR 2): in itch's frame on itch's page (1280×720, 20 px down) and in full
//          screen (ipad-frame-*.png, ipad-fs-*.png)
//   hud    the Deck's HUD in a Burrow fight, busy (both level badges, toasts, the saving glyph), with the pad, and with
//          the K panel open: hud-after-*.png; with BEFORE_ROOT=<a checkout of the old game> also hud-before-*.png
// Each view is also checked with ui-audit-lib's panelFit (a line in ct10-shots.txt says if one doesn't fit).
// Shots go to tools/qa/tmp/ct10/ (SHOT_DIR). Uses the dev server (BASE) for phone, ipad and hud; app needs
// `node tools/desktop/build-desktop.mjs --win --dir` first (EXE=… for another build).
//   usage: node tools/qa/ct10-shots.mjs [app] [phone] [ipad] [hud]   (none: all)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, _electron as electron } from 'playwright-core';
import { BASE, launch, boot, sleep, waitMode } from './lib.mjs';
import { launchTouch, PHONE, IPAD } from './touch-lib.mjs';
import { installPad, padStick, padTap } from './pad-lib.mjs';
import { panelFit } from './ui-audit-lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = process.env.SHOT_DIR || path.join(ROOT, 'tools/qa/tmp/ct10');
fs.mkdirSync(OUT, { recursive: true });
const WANT = new Set(process.argv.slice(2)); const want = k => !WANT.size || WANT.has(k);
const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const QS = 'fresh&nointro&notut&hour=10&dseed=1';
const log = [];
const note = s => { console.log(s); log.push(s); };

// ---------------------------------------------------------------- the menu's views, top and foot
const VIEWS = [['menu', 'main'], ['settings', 'settings'], ['controls-pad', 'controls', 'pad'], ['controls-touch', 'controls', 'touch'], ['controls-kbm', 'controls', 'kbm']];
const openView = (f, [, v, dev], from) => f.evaluate(([v, dev, from]) => {
  const G = window.G, U = G.ui, M = U.panels.menu;
  if (G.debug && !G.__dbgOn) { G.__dbgOn = true; Object.defineProperty(G.debug, 'on', { get: () => true, configurable: true }); } // (Settings at its tallest: the debug row)
  if (from === 'title') { if (!U.isOpen('menu')) document.querySelector('.l-title [data-a="settings"]').click(); } else U.open('menu'); // (the title's own Settings button)
  if (v === 'controls') { M.setView('controls'); M.dev = dev; M.renderControls(); } else M.setView(v);
}, [v, dev || 'pad', from]);
/** the menu's body (and a list scrolling inside it) to its top or its foot → { scrolls, panel: [l, t, r, b], screen } */
const scrollMenu = (f, foot) => f.evaluate(foot => {
  const P = document.querySelector('.p-menu'), b = P.querySelector(':scope > .pb');
  const sc = [b, ...b.querySelectorAll('*')].filter(e => e.scrollHeight > e.clientHeight + 2 && /auto|scroll/.test(getComputedStyle(e).overflowY));
  for (const e of sc) e.scrollTop = foot ? e.scrollHeight : 0;
  const r = P.getBoundingClientRect();
  return { scrolls: sc.length > 0, panel: [r.left, r.top, r.right, r.bottom].map(Math.round), screen: [innerWidth, innerHeight] };
}, foot);
async function menuShots(page, f, tag, from, views = VIEWS) {
  for (const V of views) {
    if (from === 'title' && V[1] === 'main') continue;
    await openView(f, V, from); await sleep(page, 700);
    const top = await scrollMenu(f, false); await sleep(page, 250);
    const name = `${tag}-${from === 'title' ? 'title-' : ''}${V[0]}`;
    const fit = await f.evaluate(panelFit); if (fit.length) note(`${name}: DOESN'T FIT: ${fit.map(o => `${o.sel} ${JSON.stringify(o.rect)}: ${o.why}`).join(' | ')}`); // (ui-audit-lib)
    await page.screenshot({ path: path.join(OUT, name + (top.scrolls ? '-top' : '') + '.png') });
    if (top.scrolls) { const bot = await scrollMenu(f, true); await sleep(page, 350); await page.screenshot({ path: path.join(OUT, name + '-foot.png') }); note(`${name}: panel ${JSON.stringify(top.panel)} on ${JSON.stringify(top.screen)}, its body scrolls (top and foot shots)${JSON.stringify(bot.panel) !== JSON.stringify(top.panel) ? ' (moved!)' : ''}`); }
    else note(`${name}: panel ${JSON.stringify(top.panel)} on ${JSON.stringify(top.screen)}, all of it fits`);
    await f.evaluate(() => window.G.ui.close('menu')); await sleep(page, 300);
  }
}
const toTitle = async (page, f, url) => { await f.evaluate(() => window.G.save()); await f.goto(url, { waitUntil: 'load' }); await f.waitForFunction(() => window.__ready === true && window.G?.titleActive, null, { timeout: 90000 }); await sleep(page, 1500); };

// ---------------------------------------------------------------- the desktop app, as a Deck runs it
if (want('app')) {
  const EXE = process.env.EXE || path.join(ROOT, 'release/desktop/win-unpacked/Pawhaven.exe');
  if (!fs.existsSync(EXE)) note(`app: no app at ${EXE} (node tools/desktop/build-desktop.mjs --win --dir)`);
  else {
    const UD = fs.mkdtempSync(path.join(os.tmpdir(), 'pawhaven-ct10-'));
    const app = await electron.launch({ executablePath: EXE, args: ['--windowed', '--deck', `--user-data=${UD}`, `--query=${QS}`] /* (updates on: About's Check for updates row; the launch check finds 0.6.5 the newest) */, env: { ...process.env, SteamDeck: '1' }, timeout: 90000 });
    try {
      const page = await app.firstWindow();
      await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.setContentSize(1280, 800); w.center(); });
      await page.waitForFunction(() => window.__ready === true && window.G?.player && innerWidth === 1280 && innerHeight === 800, null, { timeout: 90000 });
      await sleep(page, 1200);
      const prof = await page.evaluate(() => ({ deck: window.pawhaven?.deck, deckUi: window.G.ui.root.classList.contains('deck-ui'), scale: +window.G.ui.scale.toFixed(3), preset: window.G.engine.preset, inner: [innerWidth, innerHeight] }));
      note(`app: ${JSON.stringify(prof)}`);
      await installPad(page); await padStick(page, 'left', 0, -0.5); await sleep(page, 300); await padStick(page, 'left', 0, 0); await sleep(page, 300);
      await menuShots(page, page, 'deck', null);
      await toTitle(page, page, 'app://pawhaven/index.html'); // (without the query: the title, as a player starts it)
      await installPad(page); await padTap(page, 'DDown'); await sleep(page, 300);
      await page.screenshot({ path: path.join(OUT, 'deck-title.png') });
      await menuShots(page, page, 'deck', 'title');
    } catch (e) { note('app: ' + String(e.message || e).split('\n')[0]); }
    await app.close().catch(() => {});
    try { fs.rmSync(UD, { recursive: true, force: true }); } catch (e) { /* */ }
  }
}

// ---------------------------------------------------------------- phones (an iPhone's Safari agent)
if (want('phone')) for (const [w, h] of [[844, 390], [667, 375], [932, 430]]) {
  const { browser, page } = await launchTouch({ w, h, dpr: 3, ua: IOS });
  try {
    await boot(page, QS.replace('&dseed=1', ''));
    const tag = `phone-${w}x${h}`;
    await menuShots(page, page, tag, null, w === 844 ? VIEWS : VIEWS.slice(0, 2));
    await toTitle(page, page, `${BASE}/`);
    await menuShots(page, page, tag, 'title', w === 844 ? VIEWS : VIEWS.slice(1, 2));
  } catch (e) { note(`phone ${w}x${h}: ` + String(e.message || e).split('\n')[0]); }
  await browser.close();
}

// ---------------------------------------------------------------- the iPad: in itch's frame, and in full screen
if (want('ipad')) {
  // itch's game page as an iPad lays it out (tools/build-itch.mjs ITCH_PAGE, measured 2026-10-08): the frame 20 px down,
  // 1280 × 720, wider than the 1180 screen; itch's button column over its top right
  const PAGE = src => `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0;background:#eee}.header{height:20px}.game_frame{position:relative;margin:0 auto;width:1280px;height:720px}.game_frame iframe{display:block;border:0}.user_tools{position:absolute;top:0;right:0;margin:10px 10px 0 0;padding:0;list-style:none;z-index:2;pointer-events:none}.user_tools li{margin-bottom:10px;height:21px;text-align:right}.user_tools a{display:inline-block;height:21px;background:rgba(0,0,0,.6)}</style></head><body><ul class="user_tools"><li><a style="width:158px"></a></li><li><a style="width:136px"></a></li><li><a style="width:123px"></a></li></ul><div class="header"></div><div class="game_frame"><iframe src="${src}" width="1280" height="720" allowfullscreen allow="autoplay; fullscreen *; gamepad"></iframe></div><div style="height:1400px"></div></body></html>`;
  const { browser, page } = await launchTouch({ w: IPAD.w, h: IPAD.h, dpr: IPAD.dpr, ua: IPAD.ua });
  try {
    // (the page is served at the dev server's own origin: Chrome won't let a page elsewhere frame localhost, and the
    // layout only needs the frame; ?itch is the itch mode)
    await page.route(`${BASE}/__ct10-itch.html`, r => r.fulfill({ contentType: 'text/html', body: PAGE(`${BASE}/?itch&${QS}`) }));
    await page.goto(`${BASE}/__ct10-itch.html`, { waitUntil: 'load' });
    const f = await (await page.waitForSelector('iframe')).contentFrame();
    await f.waitForFunction(() => window.__ready === true && window.G?.player, null, { timeout: 90000 }); await sleep(page, 1500);
    await menuShots(page, f, 'ipad-frame', null, VIEWS.slice(0, 4));
    await page.evaluate(() => document.querySelector('iframe').requestFullscreen()); await sleep(page, 1500);
    await menuShots(page, f, 'ipad-fs', null, VIEWS.slice(0, 4));
  } catch (e) { note('ipad: ' + String(e.message || e).split('\n')[0]); }
  await browser.close();
}

// ---------------------------------------------------------------- the Deck's HUD in a fight, before and after
async function hudShots(base, tag) {
  const { browser, page } = await launch({ w: 1280, h: 800 });
  try {
    await page.goto(`${base}/?${QS}`, { waitUntil: 'load' }); await page.waitForFunction(() => window.__ready === true && window.G?.player, null, { timeout: 90000 }); await sleep(page, 800);
    await installPad(page); await padStick(page, 'left', 0, -0.5); await sleep(page, 300); await padStick(page, 'left', 0, 0);
    await page.evaluate(() => { const G = window.G; G.state.flags.mokaJoined = true; G.state.flags.poeJoined = true; G.state.potions = { heart: 4, zoom: 3, rejuv: 1 }; const P = G.state.player; P.lvl = 20; P.hotbar = ['attack', 'chomp', 'packcall', 'blaze', 'decoy', 'moonhowl']; for (const id of ['chomp', 'packcall', 'blaze', 'decoy', 'moonhowl']) P.skills[id] = 3; G.actions.recompute(); G.state.flags.burrowTut = true; G.enterDungeon(4); });
    await waitMode(page, 'dungeon', 60000); await page.waitForFunction(() => window.G.dungeon?.monsters?.length > 0, null, { timeout: 30000 }); await sleep(page, 1200);
    await page.evaluate(() => {
      const G = window.G, D = G.dungeon, P = G.player, ids = ['mochi', 'dustbunny', 'kinoko'];
      for (let i = 0; i < 12; i++) { const a = i * 0.52, r = 3 + (i % 3), x = P.pos.x + Math.cos(a) * r, z = P.pos.z + Math.sin(a) * r; if (G.world.walkable && !G.world.walkable(x, z)) continue; const m = D.spawnMonster?.(ids[i % 3], { level: 4, rank: i % 6 ? 'normal' : 'champion', x, z }); if (m) { m.aggro = true; m.lifeMax = m.life = m.lifeMax * 20; } }
      G.state.player.statPts = 2; G.state.player.skillPts = 3;
      for (const id of ['chomp', 'packcall', 'blaze']) { const t = G.combat.nearest(P.pos, 'ally', 9); if (t) { G.skills.cds = {}; G.skills.tryCast(id, t.pos.clone(), t); } }
      G.ui.toast('Champion pack! Watch out for the stomp.', { icon: 'oni' }); G.ui.toast('Blossom Visage · Rare find! +2 more', { icon: 'star' }); G.ui.toast("The Wayfarer's Post points to new lands!", { icon: 'map' });
      document.querySelector('.save-glyph')?.classList.add('on');
    });
    await sleep(page, 1300);
    await page.screenshot({ path: path.join(OUT, `hud-${tag}-fight.png`) });
    await page.screenshot({ path: path.join(OUT, `hud-${tag}-fight-corner.png`), clip: { x: 640, y: 480, width: 640, height: 320 } });
    await page.evaluate(() => window.G.ui.open('skills')); await sleep(page, 400); await padTap(page, 'DRight'); await sleep(page, 900);
    await page.screenshot({ path: path.join(OUT, `hud-${tag}-fight-skills.png`) });
    note(`hud ${tag}: hud-${tag}-fight.png, -fight-corner.png, -fight-skills.png`);
  } catch (e) { note(`hud ${tag}: ` + String(e.message || e).split('\n')[0]); }
  await browser.close();
}
if (want('hud')) {
  await hudShots(BASE, 'after');
  if (process.env.BEFORE_ROOT) {
    const { startProd } = await import('./prod-server.mjs');
    const S = await startProd({ root: path.resolve(process.env.BEFORE_ROOT) });
    try { await hudShots(S.url, 'before'); } finally { await S.close(); }
  }
}
fs.appendFileSync(path.join(OUT, 'ct10-shots.txt'), `== ${new Date().toISOString()} ct10-shots ${[...WANT].join(' ') || 'all'}\n` + log.join('\n') + '\n'); // (each run adds its lines)
console.log(`shots: ${OUT}`);
