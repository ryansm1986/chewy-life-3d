// The Steam Deck UI check (docs/CONTROLS.md §4 and §10, ROADMAP CT-3): a 1280×800 screen (Deck-like: the Deck preset,
// the UI at 1.15 and the safe area pick themselves), the pad active, then every panel and overlay in turn — the HUD, bag
// (with a tooltip), character, skills, quests, map, the game menu's three pages, Rosie's shop, the stash, cooking, the
// workbench, the Travel Map, the gift and seed pickers, a house card and remodel, a dialogue, a guide line, the hero
// wheel, the reel bar, build mode, decorate mode and the title. For each: a screenshot, the text drawn under the floor (11 px on
// screen: "about 12 px", the design's 12 px at the Deck's 0.92; ui/deck.css raises what was under), a panel that
// doesn't fit on the screen, and anything the safe area should hold that reaches within 8 px of the screen's edge.
// Decorative text is left out: the Japanese subtitles (.jp), the compass's 北, the portrait's "Lv", glyph art (svg).
// CT-10 (the owner's Deck: Settings ran off the screen, and the bottom-right buttons and the pad's glyph footer sat on the
// hotbar): the page plays the desktop app on a Deck (a window.pawhaven stub: Settings' Full screen row, About's Check
// for updates, the pause menu's Quit game; APP=0 for a plain browser), and every scene is also checked with the shared
// panelFit (each panel inside the safe area, its ✕ and tabs on the screen, its body scrolling with the last row in
// reach, nothing past its sides) and hudOverlap (no two HUD pieces or floating chips, toasts, the pad's glyph footer
// overlapping; ui-audit-lib.mjs). Settings is opened at its tallest (the debug row shown) in every view: the menu,
// Settings, Controls' three tabs and the update card, from the game and from the title; the pad walks Settings and the
// Controls' Touch tab top to bottom (the focus ring on the screen and in the body's view at every step); and the HUD is
// checked busy (both level badges, three toasts, the saving glyph), in a Burrow fight and with a panel open there.
// Exit 1 when the profile is wrong, a panel doesn't fit, the HUD overlaps, or any text is under (--report: list only).
//   usage: node tools/qa/deck-ui.mjs [--report] [view…]   SHOT_DIR (default tools/qa/tmp/deck-ui)   FLOOR=11   APP=0
import fs from 'node:fs';
import path from 'node:path';
import { launch, boot, sleep, waitMode, BASE } from './lib.mjs';
import { installPad, padDown, padUp, padTap, padStick } from './pad-lib.mjs';
import { seedCozy, cozyScenes, quietUi } from './cozy-ui-lib.mjs';
import { panelFit, hudOverlap } from './ui-audit-lib.mjs';

const OUT = process.env.SHOT_DIR || path.resolve('tools/qa/tmp/deck-ui');
const FLOOR = +(process.env.FLOOR || 11), STRICT = !process.argv.includes('--report');
fs.mkdirSync(OUT, { recursive: true });
const { browser, page, errors } = await launch({ w: 1280, h: 800 });
const ev = (f, a) => page.evaluate(f, a);
// the desktop app on a Deck (tools/desktop/preload.cjs's window.pawhaven): its own Settings rows, and an update card
// with notes when Settings › About › Check for updates asks (the launch check finds none)
if (process.env.APP !== '0') await page.addInitScript(() => {
  const NOTES = ['Settings fit the Steam Deck', 'The hotbar keeps clear of the menu buttons', "The controller's button hints keep off the HUD", 'A phone shows Settings in two columns', 'Smoother fishing on the Deck'].join('\n');
  const update = { info: async () => ({ shell: '0.6.5', game: '0.6.5', source: 'built-in' }), check: async o => (o?.manual ? { status: 'available', version: '0.7.0', current: '0.6.5', kind: 'content', size: 24e6, notes: NOTES } : { status: 'none' }),
    install: async () => ({ ok: false, error: 'not in the audit' }), cancel: async () => {}, later: async () => {}, openPage: async () => {}, onProgress: () => () => {} };
  window.pawhaven = { desktop: true, deck: true, platform: 'linux', version: '0.6.5', isFullscreen: () => true, setFullscreen() {}, onFullscreen() {}, quit() {}, update };
});
let bad = 0;
const small = [], edges = [], clipped = [], overlaps = [], reach = [];
const DECOR = /\.jp\b|mm-n > span|pc-lv > small|chg-jp|\.floor > span/; // (decorative: see the header; .floor > span: a dungeon floor's 地下4階 under its B4F)

// text under the floor inside `scopes` (selectors), grouped by where it sits; the on-screen size is the computed font
// size times the element's effective CSS zoom (the UI layers' --ui-scale)
const audit = (name, scopes) => ev(([scopes, floor]) => {
  const vis = el => { for (let e = el; e && e !== document.body; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05) return false; } return true; };
  const name = el => { const p = el.closest('.panel, .hud, .tip, .dlg, .tut-dock, .pad-hints, .pc-hints, .hero-wheel, .reel, .bh, .home-hud, .toasts'); const own = el.classList.length ? '.' + [...el.classList].slice(0, 2).join('.') : el.tagName.toLowerCase(); const up = !el.classList.length && el.parentElement?.classList.length ? '.' + el.parentElement.classList[0] + ' > ' : ''; return (p ? '.' + [...p.classList].find(c => c !== 'panel' && c !== 'show' && c !== 'open') + ' ' : '') + up + own; };
  const out = new Map(), edge = new Map();
  for (const sc of scopes) for (const root of document.querySelectorAll(sc)) {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const t = n.textContent.replace(/\s+/g, ' ').trim(); if (!t || t.length < 1) continue;
      const el = n.parentElement; if (!el) continue;
      const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1 || r.right < 0 || r.bottom < 0 || r.left > innerWidth || r.top > innerHeight) continue;
      if (!vis(el)) continue;
      const px = parseFloat(getComputedStyle(el).fontSize) * (el.currentCSSZoom ?? 1);
      const k = name(el);
      if (el.closest('svg')) continue;
      if (px < floor) { const o = out.get(k) || { sel: k, px, n: 0, text: t.slice(0, 38) }; o.n++; if (px < o.px) { o.px = px; o.text = t.slice(0, 38); } out.set(k, o); }
      if (r.left < 8 || r.top < 8 || r.right > innerWidth - 8 || r.bottom > innerHeight - 8) edge.set(k, { sel: k, rect: [r.left, r.top, r.right, r.bottom].map(v => Math.round(v)), text: t.slice(0, 30) });
    }
  }
  return { small: [...out.values()].map(o => ({ ...o, px: +o.px.toFixed(1) })).sort((a, b) => a.px - b.px), edge: [...edge.values()] };
}, [scopes, FLOOR]).then(r => {
  r.small = r.small.filter(s => !DECOR.test(s.sel));
  console.log(`\n== ${name}: ${r.small.length ? r.small.length + ' under ' + FLOOR + ' px' : 'all text ≥ ' + FLOOR + ' px'}${r.edge.length ? ' · ' + r.edge.length + ' at the edge' : ''}`);
  for (const s of r.small) console.log(`   ${String(s.px).padStart(5)} px  ${s.sel}  ×${s.n}  "${s.text}"`);
  for (const e of r.edge) console.log(`   edge ${JSON.stringify(e.rect)}  ${e.sel}  "${e.text}"`);
  small.push(...r.small.map(s => ({ ...s, where: name }))); edges.push(...r.edge.map(e => ({ ...e, where: name })));
  return r;
});
const shot = (name) => page.screenshot({ path: path.join(OUT, name + '.png') });
const ONLY = new Set(process.argv.slice(2).filter(a => !a.startsWith('--'))); // (deck-ui.mjs [view…]: just those)
// the HUD's overlaps that last: a toast sliding in, or one pushing the stack up, moves the pad's footer within 0.1 s
// (ui/fit.js hudRects), so an overlap is counted when it is still there 0.4 s later
const stillOver = async () => { const k = o => `${o.a}|${o.b}`, a = await ev(hudOverlap); if (!a.length) return a; await sleep(page, 400); const b = new Set((await ev(hudOverlap)).map(k)); return a.filter(o => b.has(k(o))); };
const scene = async (name, open, scopes, close) => {
  if (ONLY.size && !ONLY.has(name)) return;
  try {
    await open(); await sleep(page, 650); await shot(name); await audit(name, scopes);
    // CT-10: every panel fits the safe area (its body scrolling, the last row in reach), and the HUD's pieces keep apart
    for (const o of await ev(panelFit)) { console.log(`   CUT OFF ${o.sel} ${JSON.stringify(o.rect)}: ${o.why}`); clipped.push({ ...o, where: name }); }
    for (const o of await stillOver()) { console.log(`   OVERLAP ${o.a} ${JSON.stringify(o.ra)} × ${o.b} ${JSON.stringify(o.rb)}`); overlaps.push({ ...o, where: name }); }
  }
  catch (e) { console.log(`!! ${name}: ${String(e.message || e).split('\n')[0]}`); bad++; }
  try { if (close) await close(); else { await ev(() => { const U = window.G.ui; for (const n of [...U._order]) U.close(n); }); } await sleep(page, 250); } catch (e) { /* next */ }
};
const P_HINTS = ['.pad-hints', '.tip'];
// the debug row in Settings (G.debug.on faked for the run, as mobile-ui does)
const fakeDebug = () => ev(() => { const G = window.G; if (G.debug && !G.__dbgOn) { G.__dbgOn = true; Object.defineProperty(G.debug, 'on', { get: () => true, configurable: true }); } });
// the game menu at a view (Controls with a device's tab; the update card through About's Check for updates), from the
// game or the title
const menuView = (v, dev, from) => ev(([v, dev, from]) => { const U = window.G.ui, M = U.panels.menu; if (from === 'title') { if (!U.isOpen('menu')) document.querySelector('.l-title [data-a="settings"]').click(); } else U.open('menu'); /* (from the title, its own Settings button: it tucks the title away) */ if (v === 'controls') { M.setView('controls'); M.dev = dev; M.renderControls(); } else if (v === 'update') M.act('checkUpdate'); else M.setView(v); }, [v, dev || 'pad', from]);
const MENU_VIEWS = [['menu', 'main'], ['settings', 'settings'], ['controls-kbm', 'controls', 'kbm'], ['controls', 'controls', 'pad'], ['controls-touch', 'controls', 'touch'], ['update', 'update']];
async function menuScenes(pre, from) {
  for (const [n, v, dev] of MENU_VIEWS) {
    if (from === 'title' && v === 'main') continue;
    if (v === 'update' && !(await ev(() => !!window.pawhaven?.update).catch(() => false))) continue;
    await scene(pre + n, async () => { await menuView(v, dev, from); if (v === 'update') await page.waitForFunction(() => !!document.querySelector('.mn-update [data-a="updInstall"]'), null, { timeout: 5000 }); await padTap(page, 'DDown'); }, ['.p-menu', ...P_HINTS]);
  }
}
// the pad walks a menu view top to bottom (D-down until it stops, then the next column: D-right, D-up): at every step
// the focus ring is on, on the screen, and its row inside the body's view (padNav scrolls a fitted body to it)
async function padWalk(name) {
  const seen = new Set(), bad = []; let last = null, stuck = 0;
  const look = () => ev(() => { const N = window.G.ui.padNav, e = N.cur, ring = document.querySelector('.pad-ring'); if (!e) return null; const r = e.getBoundingClientRect(), b = e.closest('.pb'), br = b?.getBoundingClientRect();
    return { k: `${e.dataset.k || e.dataset.a || e.dataset.dev || e.parentElement?.dataset.k || ''}:${e.dataset.v ?? ''}:${e.textContent.trim().slice(0, 18)}`, r: [r.left, r.top, r.right, r.bottom].map(Math.round), b: br ? [br.top, br.bottom].map(Math.round) : null, ring: ring.classList.contains('on'), H: innerHeight }; });
  for (const [dir, n] of [['DDown', 40], ['DRight', 1], ['DUp', 40]]) {
    for (let i = 0; i < n; i++) {
      const s = await look(); if (!s) break;
      if (!s.ring || s.r[1] < 0 || s.r[3] > s.H || (s.b && (s.r[1] < s.b[0] - 2 || s.r[3] > s.b[1] + 2))) bad.push(s);
      seen.add(s.k);
      if (s.k === last) { if (++stuck > 1) break; } else stuck = 0;
      last = s.k; await padTap(page, dir); await sleep(page, 160);
    }
    stuck = 0;
  }
  console.log(`   pad walk ${name}: ${seen.size} stops${bad.length ? ', ' + bad.length + ' off the screen or the body: ' + JSON.stringify(bad.slice(0, 3)) : ', every one on the screen and in the body'}`);
  return { name, n: seen.size, bad };
}
// the HUD at its busiest: both level badges, three toasts, the saving glyph
const busyHud = async () => {
  await ev(() => { const G = window.G; G.state.player.statPts = 2; G.state.player.skillPts = 3;
    G.ui.toast("The Wayfarer's Post by the bamboo points to new lands! Walk the west trail to find it.", { icon: 'map' }); G.ui.toast('Blossom Visage · Rare find! +2 more', { icon: 'star', color: '#ffd8a8' }); G.ui.toast('Quest updated: Say hi to Rosie', { icon: 'book' });
    document.querySelector('.save-glyph')?.classList.add('on'); });
  await sleep(page, 1100);
};
// a dozen foes round the hero, a few skills cast, toasts: the fight's HUD
const fight = async () => {
  await ev(() => { const G = window.G, D = G.dungeon, P = G.player; if (!D) return;
    const ids = ['mochi', 'dustbunny', 'kinoko'];
    for (let i = 0; i < 12; i++) { const a = i * 0.52, r = 3 + (i % 3), x = P.pos.x + Math.cos(a) * r, z = P.pos.z + Math.sin(a) * r; if (G.world.walkable && !G.world.walkable(x, z)) continue; const m = D.spawnMonster?.(ids[i % 3], { level: 4, rank: i % 6 ? 'normal' : 'champion', x, z }); if (m) { m.aggro = true; m.lifeMax = m.life = m.lifeMax * 20; } }
    G.state.player.statPts = 2; G.state.player.skillPts = 3;
    for (const id of ['chomp', 'packcall', 'blaze']) { const t = G.combat.nearest(P.pos, 'ally', 9); if (t) { G.skills.cds = {}; G.skills.tryCast(id, t.pos.clone(), t); } }
    G.ui.toast('Champion pack! Watch out for the stomp.', { icon: 'oni', color: '#ffb3c9' }); G.ui.toast('Chomp ready', { icon: 'bolt' }); });
  await sleep(page, 1300);
};

try {
  await boot(page, 'fresh&nointro&notut&hour=10');
  // the Deck profile, picked by the screen on a first start
  const prof = await ev(() => { const G = window.G, E = G.engine, S = G.world?.sun?.shadow; return { screen: [screen.width, screen.height], preset: E.preset, quality: E.quality, deck: E.deck, uiScale: G.ui.settings.uiScale, scale: +G.ui.scale.toFixed(3), deckUi: G.ui.root.classList.contains('deck-ui'), pixelRatio: E.renderer.getPixelRatio(), shadow: S?.mapSize.x, ext: G.world?.sun?.shadow.camera.right, ao: E.post.ao.enabled, tilt: E.post.tiltPass.enabled }; });
  console.log('profile', JSON.stringify(prof));
  if (!(prof.preset === 3 && prof.deck && prof.quality === 1 && prof.uiScale === 1.15 && prof.deckUi && !prof.ao && !prof.tilt && prof.shadow <= 1536)) { console.log('FAIL the Deck profile did not pick itself on a 1280×800 screen'); bad++; }
  await ev(() => { const G = window.G; G.state.flags.mokaJoined = true; G.state.flags.poeJoined = true; G.state.flags.hints = { all: true }; G.state.potions = { heart: 4, zoom: 3, rejuv: 1 }; G.state.coins = 2400; G.state.player.hotbar = ['attack', 'chomp', 'packcall', 'blaze', 'decoy', 'moonhowl']; G.state.player.lvl = 20; G.state.player.skillPts = 3; for (const id of ['chomp', 'packcall', 'blaze', 'decoy', 'moonhowl']) G.state.player.skills[id] = 3; G.actions.recompute(); G.heroes.spawnBench?.(); G.ui.toasts?.retire?.(0); });
  await ev(async () => { const G = window.G, I = await import('/src/rpg/items.js'); for (const o of [{ ilvl: 6, rarity: 'rare', slot: 'hat' }, { ilvl: 4, rarity: 'magic', slot: 'boots' }, { ilvl: 3, rarity: 'normal', slot: 'charm' }, { ilvl: 5, rarity: 'magic', slot: 'outfit' }]) G.actions.pickup(I.generateItem(o)); G.actions.addPantry('rice', 3); G.actions.addPantry('carrotSeed', 2); G.ui.toasts?.retire?.(0); });
  await installPad(page);
  await padStick(page, 'left', 0, -0.5); await sleep(page, 300); await padStick(page, 'left', 0, 0); await sleep(page, 500);

  await scene('hud', async () => {}, ['.l-hud'], async () => {});
  await scene('bag', async () => { await ev(() => window.G.ui.open('inventory', { view: 'bag' })); await sleep(page, 400); await padTap(page, 'DRight'); }, ['.p-inv', ...P_HINTS]);
  await scene('character', () => ev(() => window.G.ui.open('character')), ['.p-char', ...P_HINTS]);
  await scene('skills', async () => { await ev(() => window.G.ui.open('skills')); await sleep(page, 300); await padTap(page, 'DRight'); }, ['.p-skills', ...P_HINTS]);
  await scene('quests', () => ev(() => window.G.ui.open('quests')), ['.p-quests', ...P_HINTS]);
  await scene('map', () => ev(() => window.G.ui.open('map')), ['.p-map', ...P_HINTS]);
  // the game menu at its tallest (CT-10): the debug row shown (G.debug.on faked for the run), the desktop app's rows (the
  // stub); each view, Controls with each device's tab, and the update card; then the pad walks Settings and Controls › Touch
  await fakeDebug();
  await menuScenes('', null);
  await scene('settings-pad', async () => { await menuView('settings'); reach.push(await padWalk('settings')); }, ['.p-menu', ...P_HINTS]);
  await scene('controls-touch-pad', async () => { await menuView('controls', 'touch'); reach.push(await padWalk('controls-touch')); }, ['.p-menu', ...P_HINTS]);
  // the HUD busy: both level badges, three toasts, the saving glyph (CT-10: the Deck's bottom right)
  await scene('hud-busy', () => busyHud(), ['.l-hud', '.toasts'], () => ev(() => { document.querySelector('.save-glyph')?.classList.remove('on'); window.G.ui.toasts?.retire?.(9); }));
  await scene('shop', () => ev(() => window.G.openShop()), ['.p-shop', '.p-inv', ...P_HINTS]);
  await scene('stash', () => ev(() => window.G.ui.open('stash')), ['.p-stash', '.p-inv', ...P_HINTS]);
  await scene('cook', () => ev(() => window.G.life.kitchen.open('kitchen')), ['.p-cook', ...P_HINTS]);
  await scene('craft', () => ev(() => window.G.openWorkbench?.('home')), ['.p-craft', ...P_HINTS]);
  await scene('travel', () => ev(() => window.G.openTravel()), ['.p-travel', ...P_HINTS]);
  await scene('burrow', () => ev(() => window.G.openBurrowMenu()), ['.p-burrow', ...P_HINTS]); // (the Burrow door's den picker: docs/ZONES.md §4.1)
  await scene('gift', () => ev(() => { const G = window.G; G.actions.addPantry('onigiri', 1); G.ui.pickGift({ name: 'Rosie', portrait: G.portrait('rosie'), items: [{ key: 'onigiri', name: 'Onigiri', n: 1, pantry: true, love: 'liked' }] }); }), ['.p-gift', ...P_HINTS]);
  await scene('seeds', () => ev(() => window.G.ui.open('seeds', { seeds: ['carrotSeed', 'riceSeed'], last: 'carrotSeed', onPick() {} })), ['.p-seeds', ...P_HINTS]);
  await scene('house-card', () => ev(() => { const G = window.G, rec = G.sim.list.find(r => r.data?.owner === 'usagi') || G.sim.list.find(r => r.data?.owner); G.ui.open('houseCard', { rec }); }), ['.p-house', ...P_HINTS]);
  await scene('remodel', () => ev(() => { const G = window.G, rec = G.sim.list.find(r => r.data?.owner === 'usagi') || G.sim.list.find(r => r.data?.owner); G.ui.open('remodel', { rec }); }), ['.p-remodel', ...P_HINTS]);
  await scene('dialogue', async () => {
    await ev(() => { const G = window.G, R = G.npcs.find(n => n.id === 'rosie'); R.talking = false; G.player.setPos(R.pos.x + 0.9, R.pos.z + 0.4); G.player.faceTo(R.pos.x, R.pos.z); G.engine.rig.focus.copy(G.player.pos); G.engine.rig.snap(); });
    await sleep(page, 600); await padTap(page, 'A'); await sleep(page, 900);
    for (let i = 0; i < 12; i++) { const s = await ev(() => ({ a: window.G.ui.dlg.active, ch: !!window.G.ui.dlg.$.ch.querySelector('.dch') })); if (!s.a || s.ch) break; await padTap(page, 'A'); await sleep(page, 350); }
  }, ['.l-dlg'], async () => { for (let i = 0; i < 8 && await ev(() => window.G.ui.dlg.active); i++) { await padTap(page, 'B'); await sleep(page, 300); } });
  await scene('guide', () => ev(() => { const T = window.G.ui.tutorial; T.step({ n: 2, total: 6, title: 'Fishing with Kero', objective: 'Face the water and press *F* to cast' }); T.say('kero', 'Hold *F* to lift the green zone. Tap *Tab* for the next hero, *Shift* to sprint.'); }), ['.tut-dock'], () => ev(() => window.G.ui.tutorial.hide()));
  await scene('hero-wheel', async () => { await padDown(page, 'LB'); await sleep(page, 450); await padStick(page, 'right', 0.9, 0.3); }, ['.hero-wheel'], async () => { await padStick(page, 'right', 0, 0); await ev(() => window.G.heroes.pickFromWheel(null)); await padUp(page, 'LB'); });
  // CT-10: a Burrow fight (a dozen foes on the hero, skills going off, toasts), then the K panel and the bag open in it
  if (!ONLY.size || [...ONLY].some(n => n.startsWith('fight'))) {
    await ev(() => { const G = window.G; G.ui.closeAll(); G.state.flags.burrowTut = true; G.enterDungeon(4); });
    await page.waitForFunction(() => window.G?.mode === 'dungeon' && window.G.dungeon?.monsters?.length && !window.G.ui?.iris?.active, null, { timeout: 60000 }); await sleep(page, 1200);
    await scene('fight', () => fight(), ['.l-hud', '.toasts'], async () => {});
    await scene('fight-skills', async () => { await fight(); await ev(() => window.G.ui.open('skills')); await sleep(page, 300); await padTap(page, 'DRight'); }, ['.p-skills', ...P_HINTS]);
    await scene('fight-bag', async () => { await ev(() => window.G.ui.open('inventory', { view: 'bag' })); await sleep(page, 300); await padTap(page, 'DRight'); }, ['.p-inv', ...P_HINTS]);
    await ev(() => { const G = window.G; G.ui.closeAll(); G.returnToVillage(); }); await waitMode(page, 'village', 40000); await sleep(page, 900);
  }
  // the cozy path (docs/COZY.md §10; CZ-10): every cozy view with the pad playing (the board's focus on its cards)
  console.log('cozy seed', JSON.stringify(await seedCozy(page))); await quietUi(page);
  for (const c of cozyScenes(ev)) await scene(c.name, async () => { await c.open(); await quietUi(page, 4000); await sleep(page, 300); await padTap(page, 'DRight'); }, [...c.scopes, ...P_HINTS], c.close);
  await scene('cozy-wheel', async () => { await padDown(page, 'LB'); await sleep(page, 450); await padStick(page, 'right', 0.3, 0.9); }, ['.hero-wheel'], async () => { await padStick(page, 'right', 0, 0); await ev(() => window.G.heroes.pickFromWheel(null)); await padUp(page, 'LB'); });
  await scene('reel', () => ev(() => window.G.ui.reel.start({ icon: '', name: 'Koi', known: false, zone: 0.3 })), ['.reel'], () => ev(() => window.G.ui.reel.hide()));
  await scene('build', async () => { await ev(() => window.G.build.enter()); await sleep(page, 500); await padTap(page, 'DRight'); }, ['.p-build', '.pc-hints', '.l-hud', ...P_HINTS], async () => { await ev(() => window.G.build.exit?.() ?? window.G.build.leave?.()); });
  await ev(() => window.G.openHome()); await waitMode(page, 'interior'); await sleep(page, 900);
  await scene('home', async () => {}, ['.l-hud'], async () => {});
  await scene('decorate', async () => { await ev(() => window.G.housing.decor.enter()); await sleep(page, 500); await padTap(page, 'DRight'); }, ['.p-decor', '.pc-hints', '.l-hud', ...P_HINTS], () => ev(() => window.G.housing.decor.exit?.()));
  // the title screen (a save present: reload to the title)
  await scene('title', async () => { await ev(() => { window.G.housing.decor.active && window.G.housing.decor.exit?.(); window.G.save(); }); await page.goto(`${BASE}/`, { waitUntil: 'load' }); await page.waitForFunction(() => window.__ready === true && window.G?.titleActive, null, { timeout: 60000 }); await sleep(page, 1800); }, ['.l-title'], async () => {});
  // Settings from the title (its Settings button: no game menu behind it), every view at its tallest again
  if (!ONLY.size || [...ONLY].some(n => n.startsWith('title-'))) { await installPad(page); await padTap(page, 'DDown'); await sleep(page, 300); await fakeDebug(); }
  await menuScenes('title-', 'title');
} catch (e) { console.log('!! run:', e.message); bad++; }

const where = {}; for (const s of small) (where[s.where] ||= []).push(s.sel);
const offPad = reach.reduce((n, r) => n + r.bad.length, 0);
console.log(`\n${small.length} text groups under ${FLOOR} px in ${Object.keys(where).length} views; ${clipped.length} panels that don't fit; ${overlaps.length} HUD overlaps; ${offPad} pad stops off the screen or the body (${reach.map(r => r.name + ' ' + r.n).join(', ') || 'no walks'}); ${edges.length} at the screen edge. Shots: ${OUT}`);
if (errors.length) { console.log('page errors:', errors.slice(0, 6).join('\n')); bad++; }
await browser.close();
const fail = bad || clipped.length || overlaps.length || offPad || reach.some(r => r.n < 6) || (STRICT && small.length);
console.log(fail ? 'FAIL deck-ui' : 'PASS deck-ui');
process.exit(fail ? 1 : 0);
