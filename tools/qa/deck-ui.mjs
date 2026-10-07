// The Steam Deck UI check (docs/CONTROLS.md §4 and §10, ROADMAP CT-3): a 1280×800 screen (Deck-like: the Deck preset,
// the UI at 1.15 and the safe area pick themselves), the pad active, then every panel and overlay in turn — the HUD, bag
// (with a tooltip), character, skills, quests, map, the game menu's three pages, Rosie's shop, the stash, cooking, the
// workbench, the Travel Map, the gift and seed pickers, a house card and remodel, a dialogue, a guide line, the hero
// wheel, the reel bar, build mode, decorate mode and the title. For each: a screenshot, the text drawn under the floor (11 px on
// screen: "about 12 px", the design's 12 px at the Deck's 0.92; ui/deck.css raises what was under), a panel that
// doesn't fit on the screen, and anything the safe area should hold that reaches within 8 px of the screen's edge.
// Decorative text is left out: the Japanese subtitles (.jp), the compass's 北, the portrait's "Lv", glyph art (svg).
// Exit 1 when the profile is wrong, a panel is cut off, or any text is under (--report: list only).
//   usage: node tools/qa/deck-ui.mjs [--report]   SHOT_DIR (default tools/qa/tmp/deck-ui)   FLOOR=11
import fs from 'node:fs';
import path from 'node:path';
import { launch, boot, sleep, waitMode, BASE } from './lib.mjs';
import { installPad, padDown, padUp, padTap, padStick } from './pad-lib.mjs';

const OUT = process.env.SHOT_DIR || path.resolve('tools/qa/tmp/deck-ui');
const FLOOR = +(process.env.FLOOR || 11), STRICT = !process.argv.includes('--report');
fs.mkdirSync(OUT, { recursive: true });
const { browser, page, errors } = await launch({ w: 1280, h: 800 });
const ev = (f, a) => page.evaluate(f, a);
let bad = 0;
const small = [], edges = [], clipped = [];
const DECOR = /\.jp\b|mm-n > span|pc-lv > small|chg-jp/; // (decorative: see the header)

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
  // (a bottom palette sits on the screen's edge by design; a panel wholly off the screen is the prewarm's, or closing)
  const cut = [...document.querySelectorAll('.pw .panel')].filter(p => p.offsetParent && !p.closest('.closing, .side-bottom') && p.getBoundingClientRect().top < innerHeight).map(p => ({ p: [...p.classList].find(c => c.startsWith('p-')), r: p.getBoundingClientRect() })).filter(({ r }) => r.top < -1 || r.left < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1).map(({ p, r }) => ({ sel: p, rect: [r.left, r.top, r.right, r.bottom].map(v => Math.round(v)) }));
  return { cut, small: [...out.values()].map(o => ({ ...o, px: +o.px.toFixed(1) })).sort((a, b) => a.px - b.px), edge: [...edge.values()] };
}, [scopes, FLOOR]).then(r => {
  r.small = r.small.filter(s => !DECOR.test(s.sel));
  for (const c of r.cut) { console.log(`   CUT OFF ${c.sel} ${JSON.stringify(c.rect)}`); clipped.push({ ...c, where: name }); }
  console.log(`\n== ${name}: ${r.small.length ? r.small.length + ' under ' + FLOOR + ' px' : 'all text ≥ ' + FLOOR + ' px'}${r.edge.length ? ' · ' + r.edge.length + ' at the edge' : ''}`);
  for (const s of r.small) console.log(`   ${String(s.px).padStart(5)} px  ${s.sel}  ×${s.n}  "${s.text}"`);
  for (const e of r.edge) console.log(`   edge ${JSON.stringify(e.rect)}  ${e.sel}  "${e.text}"`);
  small.push(...r.small.map(s => ({ ...s, where: name }))); edges.push(...r.edge.map(e => ({ ...e, where: name })));
  return r;
});
const shot = (name) => page.screenshot({ path: path.join(OUT, name + '.png') });
const scene = async (name, open, scopes, close) => {
  try { await open(); await sleep(page, 650); await shot(name); await audit(name, scopes); }
  catch (e) { console.log(`!! ${name}: ${String(e.message || e).split('\n')[0]}`); bad++; }
  try { if (close) await close(); else { await ev(() => { const U = window.G.ui; for (const n of [...U._order]) U.close(n); }); } await sleep(page, 250); } catch (e) { /* next */ }
};
const P_HINTS = ['.pad-hints', '.tip'];

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
  await scene('bag', async () => { await ev(() => window.G.ui.open('inventory', { view: 'bag' })); await sleep(page, 400); await padTap(page, 'DRight'); }, ['.p-inventory', ...P_HINTS]);
  await scene('character', () => ev(() => window.G.ui.open('character')), ['.p-character', ...P_HINTS]);
  await scene('skills', async () => { await ev(() => window.G.ui.open('skills')); await sleep(page, 300); await padTap(page, 'DRight'); }, ['.p-skills', ...P_HINTS]);
  await scene('quests', () => ev(() => window.G.ui.open('quests')), ['.p-quests', ...P_HINTS]);
  await scene('map', () => ev(() => window.G.ui.open('map')), ['.p-map', ...P_HINTS]);
  await scene('menu', () => ev(() => window.G.ui.open('menu')), ['.p-menu', ...P_HINTS]);
  await scene('settings', () => ev(() => { window.G.ui.open('menu'); window.G.ui.panels.menu.setView('settings'); }), ['.p-menu', ...P_HINTS]);
  await scene('controls', () => ev(() => { window.G.ui.open('menu'); window.G.ui.panels.menu.setView('controls'); }), ['.p-menu', ...P_HINTS]);
  await scene('shop', () => ev(() => window.G.openShop()), ['.p-shop', '.p-inventory', ...P_HINTS]);
  await scene('stash', () => ev(() => window.G.ui.open('stash')), ['.p-stash', '.p-inventory', ...P_HINTS]);
  await scene('cook', () => ev(() => window.G.life.kitchen.open('kitchen')), ['.p-cook', ...P_HINTS]);
  await scene('craft', () => ev(() => window.G.openWorkbench?.('home')), ['.p-craft', ...P_HINTS]);
  await scene('travel', () => ev(() => window.G.openTravel()), ['.p-travel', ...P_HINTS]);
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
  await scene('reel', () => ev(() => window.G.ui.reel.start({ icon: '', name: 'Koi', known: false, zone: 0.3 })), ['.reel'], () => ev(() => window.G.ui.reel.hide()));
  await scene('build', async () => { await ev(() => window.G.build.enter()); await sleep(page, 500); await padTap(page, 'DRight'); }, ['.p-build', '.pc-hints', '.l-hud', ...P_HINTS], async () => { await ev(() => window.G.build.exit?.() ?? window.G.build.leave?.()); });
  await ev(() => window.G.openHome()); await waitMode(page, 'interior'); await sleep(page, 900);
  await scene('home', async () => {}, ['.l-hud'], async () => {});
  await scene('decorate', async () => { await ev(() => window.G.housing.decor.enter()); await sleep(page, 500); await padTap(page, 'DRight'); }, ['.p-decorate', '.pc-hints', '.l-hud', ...P_HINTS], () => ev(() => window.G.housing.decor.exit?.()));
  // the title screen (a save present: reload to the title)
  await scene('title', async () => { await ev(() => { window.G.housing.decor.active && window.G.housing.decor.exit?.(); window.G.save(); }); await page.goto(`${BASE}/`, { waitUntil: 'load' }); await page.waitForFunction(() => window.__ready === true && window.G?.titleActive, null, { timeout: 60000 }); await sleep(page, 1800); }, ['.l-title'], async () => {});
} catch (e) { console.log('!! run:', e.message); bad++; }

const where = {}; for (const s of small) (where[s.where] ||= []).push(s.sel);
console.log(`\n${small.length} text groups under ${FLOOR} px in ${Object.keys(where).length} views; ${clipped.length} panels cut off; ${edges.length} at the screen edge. Shots: ${OUT}`);
if (errors.length) { console.log('page errors:', errors.slice(0, 6).join('\n')); bad++; }
await browser.close();
const fail = bad || clipped.length || (STRICT && small.length);
console.log(fail ? 'FAIL deck-ui' : 'PASS deck-ui');
process.exit(fail ? 1 : 0);
