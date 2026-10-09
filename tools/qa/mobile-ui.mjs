// The phone UI check (docs/CONTROLS.md §12, ROADMAP CT-5): a phone in landscape (844×390 at DPR 3, touch), then every
// panel and overlay in turn: the HUD, the bag (and a tooltip), character, skills (each hero's trees: its three tabs must
// fit the row, labels and all), quests, map,
// the game menu's pages, Rosie's shop, the stash, cooking, the workbench, the Travel Map, the gift and seed pickers, a
// house card and remodel, a dialogue with choices, a guide line, the reel bar, build mode, decorate mode, the title and
// the portrait rotate overlay. For each: a screenshot, text drawn under the floor (12 CSS px: ui/mobile.css raises what
// was under), a panel that runs off the screen (it must fit, or scroll inside), a header button outside its panel's
// frame (R-13: tools/qa/ui-audit-lib.mjs; all five heroes' trees), and tappables under 44 px. R-14: a guide's objective
// card over the panels the guides open (the Board, the Guild, the Journal, the menu, the pantry, Skills, a house card,
// remodel, the stash), with what it spotlights: on a phone it must cover none of the panel's tabs, buttons or ✕, nor the
// spotlit target (ui-audit-lib guideOverlap; a tablet's are listed, not failed: its panels keep their desktop layout).
// Decorative text is left out: the Japanese subtitles (.jp), the compass's 北, the portrait's "Lv", glyph art (svg).
//   CT-7: "cut off" is measured against the safe area (--sa-*: a notch, CT-6's itch insets, the full-screen top edge), not
//   the bare screen; a body whose content runs past it must scroll; Settings is audited with every row it can show (the
//   debug row too) and every Controls tab (touch, keyboard, controller), from the game and from the title; and the same
//   run works at a tablet's size (DEVICE=ipad: 1180×820 at DPR 2 with iPad Safari's agent, or W / H / DPR), where
//   panels taller than the screen used to run off it (the phone's fit was phone-only).
//   usage: node tools/qa/mobile-ui.mjs [--report] [view…]   W=844 H=390 DPR=3 | DEVICE=ipad   SHOT_DIR (default tools/qa/tmp/mobile-ui)
//   FLOOR=12 TAP=44. Exit 1 when a panel is cut off, or (without --report) text or a tappable is under.
import fs from 'node:fs';
import path from 'node:path';
import { launchTouch, boot, sleep, waitMode, BASE, PHONE, IPAD } from './touch-lib.mjs';
import { seedCozy, cozyScenes, quietUi } from './cozy-ui-lib.mjs';
import { headerOutside, guideOverlap } from './ui-audit-lib.mjs';

const OUT = process.env.SHOT_DIR || path.resolve('tools/qa/tmp/mobile-ui');
const FLOOR = +(process.env.FLOOR || 12), TAP = +(process.env.TAP || 44), STRICT = !process.argv.includes('--report');
const ONLY = new Set(process.argv.slice(2).filter(a => !a.startsWith('--')));
const DEV = process.env.DEVICE === 'ipad' ? IPAD : PHONE;
const W = +(process.env.W || DEV.w), H = +(process.env.H || DEV.h), DPR = +(process.env.DPR || DEV.dpr);
fs.mkdirSync(OUT, { recursive: true });
const { browser, page, errors, F } = await launchTouch({ w: W, h: H, dpr: DPR, ua: DEV.ua });
const ev = (f, a) => page.evaluate(f, a);
let bad = 0;
const small = [], tiny = [], clipped = [], covered = [];
const DECOR = /\.jp\b|mm-n > span|pc-lv > small|chg-jp|ph-jp|\.kc\b/; // (key caps are glyph art: ui/mobile.js's text floor skips them too)

const audit = (name, scopes) => ev(([scopes, floor, tap]) => {
  const vis = el => { for (let e = el; e && e !== document.body; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05) return false; } return true; };
  const label = el => { const own = el.classList.length ? '.' + [...el.classList].slice(0, 2).join('.') : el.tagName.toLowerCase(); const p = el.closest('.panel, .hud, .tc, .dlg, .tut-dock, .hero-wheel, .reel, .bh, .home-hud, .toasts, .ti, .m-rotate'); const pc = p ? '.' + [...p.classList].slice(0, 2).join('.') + ' ' : ''; return pc + own; };
  const out = new Map(), taps = new Map();
  const onScreen = r => r.width >= 1 && r.height >= 1 && r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight;
  for (const sc of scopes) for (const root of document.querySelectorAll(sc)) {
    const hudText = root.matches('.l-hud, .hud'); // (the HUD's own labels are not menu text: only its tappables count)
    const w = document.createTreeWalker(hudText ? document.createElement('i') : root, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const t = n.textContent.replace(/\s+/g, ' ').trim(); if (!t) continue;
      const el = n.parentElement; if (!el || el.closest('svg')) continue;
      const r = el.getBoundingClientRect(); if (!onScreen(r) || !vis(el)) continue;
      const px = parseFloat(getComputedStyle(el).fontSize) * (el.currentCSSZoom ?? 1);
      if (px < floor) { const k = label(el), o = out.get(k) || { sel: k, px, n: 0, text: t.slice(0, 34) }; o.n++; if (px < o.px) { o.px = px; o.text = t.slice(0, 34); } out.set(k, o); }
    }
    for (const el of root.querySelectorAll('button, .btn, .tab, .slot, .node:not(.lg), .sh-item, .seg button, .tog, .dch, .ph-x, .card, .tc-b, .belt, .lvb, .qt-tog, .ck-r, .cr-r, input[type=range]')) {
      const r = el.getBoundingClientRect(); if (!onScreen(r) || !vis(el) || el.disabled) continue; // (.lg.node: the map legend's swatch, not a tappable)
      const m = Math.min(r.width, r.height); if (m >= tap) continue;
      // (a target may reach past its box: an ::after with negative insets, as the touch buttons and badges have)
      const a = getComputedStyle(el, '::after'), ext = a.content !== 'none' && a.position === 'absolute' ? Math.max(0, -parseFloat(a.top) || 0) + Math.max(0, -parseFloat(a.bottom) || 0) : 0;
      if (Math.min(r.width, r.height) + ext * (el.currentCSSZoom ?? 1) >= tap) continue;
      const k = label(el), o = taps.get(k) || { sel: k, px: m, n: 0 }; o.n++; o.px = Math.min(o.px, m); taps.set(k, o);
    }
  }
  // a panel must be wholly inside the safe area (CT-7: not just the screen; its body scrolls when it is taller), and a
  // body whose content runs past it must scroll (else the rest is cut off inside the panel)
  const sa = window.G.ui.mobile?.sf || { t: 0, r: 0, b: 0, l: 0 };
  const bodyCut = p => { // the body's content: scrolled inside it, or (not scrolling) wholly inside the safe area; never clipped at a side
    const b = p.querySelector(':scope > .pb'); if (!b) return false;
    if (b.scrollWidth > b.clientWidth + 6 && getComputedStyle(b).overflowX === 'hidden') return true; // (a row wider than the body: clipped at its side)
    if (b.scrollHeight <= b.clientHeight + 2) return false;
    const oy = getComputedStyle(b).overflowY; if (/auto|scroll/.test(oy)) return false;
    return oy !== 'visible' || b.getBoundingClientRect().top + b.scrollHeight * (b.currentCSSZoom ?? 1) > innerHeight - sa.b + 2;
  };
  const cut = [...document.querySelectorAll('.pw .panel')].filter(p => p.offsetParent && !p.closest('.closing')).map(p => ({ el: p, p: [...p.classList].find(c => c.startsWith('p-')) + ` (${p.closest('.pw').className}${p.matches('.p-build') ? ', build ' + !!window.G.build?.active + ', decor ' + !!window.G.housing?.decor?.active : ''})`, r: p.getBoundingClientRect() }))
    .filter(o => o.r.top < innerHeight && o.r.bottom > 0 && (o.r.top < sa.t - 2 || o.r.left < sa.l - 2 || o.r.right > innerWidth - sa.r + 2 || o.r.bottom > innerHeight - sa.b + 2 || bodyCut(o.el)))
    .map(o => ({ sel: o.p, rect: [o.r.left, o.r.top, o.r.right, o.r.bottom].map(v => Math.round(v)) }));
  // a tab row that must fit (the skill trees' three): every tab inside the row and every label inside its tab
  for (const row of document.querySelectorAll('.sk-tabs')) {
    if (!row.offsetParent) continue;
    const R = row.getBoundingClientRect();
    for (const t of row.querySelectorAll('.tab')) {
      if (!vis(t)) continue;
      const r = t.getBoundingClientRect(), sp = t.querySelector('span');
      if (r.left < R.left - 2 || r.right > R.right + 2 || (sp && sp.scrollWidth > sp.clientWidth + 1) || r.height < tap) cut.push({ sel: 'tab ' + t.dataset.t + ' "' + t.textContent.trim() + '"', rect: [r.left, r.top, r.right, r.bottom].map(v => Math.round(v)) });
    }
  }
  return { cut, small: [...out.values()].map(o => ({ ...o, px: +o.px.toFixed(1) })).sort((a, b) => a.px - b.px), taps: [...taps.values()].map(o => ({ ...o, px: +o.px.toFixed(1) })).sort((a, b) => a.px - b.px) };
}, [scopes, FLOOR, TAP]).then(r => {
  r.small = r.small.filter(s => !DECOR.test(s.sel));
  console.log(`\n== ${name}: ${r.small.length ? r.small.length + ' text groups under ' + FLOOR + ' px' : 'text ≥ ' + FLOOR + ' px'} · ${r.taps.length ? r.taps.length + ' tappables under ' + TAP + ' px' : 'tappables ≥ ' + TAP + ' px'}${r.cut.length ? ' · CUT OFF' : ''}`);
  for (const c of r.cut) { console.log(`   CUT OFF ${c.sel} ${JSON.stringify(c.rect)}`); clipped.push({ ...c, where: name }); }
  for (const s of r.small.slice(0, 14)) console.log(`   ${String(s.px).padStart(5)} px  ${s.sel}  ×${s.n}  "${s.text}"`);
  for (const t of r.taps.slice(0, 10)) console.log(`   tap ${String(t.px).padStart(5)} px  ${t.sel}  ×${t.n}`);
  small.push(...r.small.map(s => ({ ...s, where: name }))); tiny.push(...r.taps.map(t => ({ ...t, where: name })));
  return r;
});
const shot = name => page.screenshot({ path: path.join(OUT, name + '.png') });
const scene = async (name, open, scopes, close) => {
  if (ONLY.size && !ONLY.has(name)) return;
  try {
    await open(); await sleep(page, 700); await shot(name); await audit(name, scopes);
    // R-13: a header button (title-row button, tab or badge, or the skill trees' tab row) outside its panel's frame
    for (const o of await ev(headerOutside)) { console.log(`   CUT OFF ${o.sel} ${JSON.stringify(o.rect)} outside the frame ${JSON.stringify(o.frame)}`); clipped.push({ sel: o.sel, rect: o.rect, where: name }); }
    // R-14: the guide's objective card over the panel's tabs, buttons, ✕ or the spotlit target
    const phone = await ev(() => window.G.ui.root.classList.contains('m-phone'));
    for (const o of await ev(guideOverlap)) { console.log(`   ${phone ? 'COVERS' : '(tablet) covers'} ${o.sel} ${JSON.stringify(o.rect)} under the guide card ${JSON.stringify(o.card)}`); if (phone && o.panel) covered.push({ ...o, where: name }); }
  }
  catch (e) { console.log(`!! ${name}: ${String(e.message || e).split('\n')[0]}`); bad++; }
  try { if (close) await close(); else { await ev(() => { const U = window.G.ui; for (const n of [...U._order]) U.close(n); }); } await sleep(page, 300); } catch (e) { /* next */ }
};

try {
  await boot(page, 'fresh&nointro&notut&hour=10');
  const prof = await ev(() => { const G = window.G, E = G.engine; return { dev: G.controls.device, preset: E.preset, quality: E.quality, pr: +E.renderer.getPixelRatio().toFixed(2), scale: +G.ui.scale.toFixed(3), mobile: G.ui.root.className }; });
  console.log('profile', JSON.stringify(prof));
  await ev(() => { const G = window.G; G.state.flags.mokaJoined = true; G.state.flags.poeJoined = true; G.state.flags.hints = { all: true }; G.state.potions = { heart: 4, zoom: 3, rejuv: 1 }; G.state.coins = 2400; G.state.player.lvl = 12; G.state.player.skillPts = 3; G.state.player.statPts = 2; G.state.player.hotbar = ['attack', 'chomp', 'packcall', null, null, null]; G.actions.addPantry('onigiri', 2); G.actions.addPantry('turnip', 4); G.actions.recompute(); G.ui.toasts?.retire?.(0); });
  await ev(async () => { const G = window.G, I = await import('/src/rpg/items.js'); for (const o of [{ ilvl: 6, rarity: 'rare', slot: 'hat' }, { ilvl: 4, rarity: 'magic', slot: 'boots' }, { ilvl: 3, rarity: 'normal', slot: 'charm' }, { ilvl: 5, rarity: 'magic', slot: 'weapon' }]) { try { const it = I.generateItem?.(o) || I.rollItem?.(o); if (it) G.actions.pickup(it); } catch (e) { /* */ } } });
  await sleep(page, 600);

  await scene('hud', async () => {}, ['.l-hud', '.tc'], async () => {});
  await scene('bag', () => ev(() => window.G.ui.open('inventory', { view: 'bag' })), ['.p-inv']);
  await scene('character', () => ev(() => window.G.ui.open('character')), ['.p-char']);
  await scene('skills', () => ev(() => window.G.ui.open('skills')), ['.p-skills']);
  for (const cls of ['moka', 'poe', 'shihtzu', 'golden']) // (the other heroes' trees: the panel draws the class on state.player; restored after)
    await scene('skills-' + cls, () => ev(c => { const p = window.G.state.player; window.__cls0 ??= p.cls; p.cls = c; window.G.ui.open('skills'); }, cls), ['.p-skills'],
      () => ev(() => { const U = window.G.ui; U.close('skills'); window.G.state.player.cls = window.__cls0; }));
  await scene('quests', () => ev(() => window.G.ui.open('quests')), ['.p-quests']);
  await scene('map', () => ev(() => window.G.ui.open('map')), ['.p-map']);
  await scene('menu', () => ev(() => window.G.ui.open('menu')), ['.p-menu']);
  // Settings at its tallest: the debug row shown too (G.debug.on, faked for the scene)
  await scene('settings', () => ev(() => { const G = window.G; if (G.debug && !G.__dbgOn) { G.__dbgOn = Object.getOwnPropertyDescriptor(G.debug, 'on') || { value: G.debug.on, configurable: true, writable: true }; Object.defineProperty(G.debug, 'on', { get: () => true, configurable: true }); } G.ui.open('menu'); G.ui.panels.menu.setView('settings'); }), ['.p-menu'],
    () => ev(() => { const G = window.G; G.ui.close('menu'); if (G.__dbgOn) { Object.defineProperty(G.debug, 'on', G.__dbgOn); delete G.__dbgOn; } }));
  for (const dev of ['touch', 'kbm', 'pad']) // (Controls: the Touch tab with its options and help list, the key bindings, the pad's)
    await scene(dev === 'touch' ? 'controls' : 'controls-' + dev, () => ev(d => { const M = window.G.ui.panels.menu; window.G.ui.open('menu'); M.setView('controls'); M.dev = d; M.renderControls(); }, dev), ['.p-menu']);
  await scene('shop', () => ev(() => window.G.openShop()), ['.p-shop', '.p-inv']);
  await scene('stash', () => ev(() => window.G.ui.open('stash')), ['.p-stash', '.p-inv']);
  await scene('cook', () => ev(() => window.G.life.kitchen.open('kitchen')), ['.p-cook']);
  await scene('craft', () => ev(() => window.G.openWorkbench?.('home')), ['.p-craft']);
  await scene('travel', () => ev(() => window.G.openTravel()), ['.p-travel']);
  await scene('gift', () => ev(() => { const G = window.G; G.ui.pickGift({ name: 'Rosie', portrait: G.portrait('rosie'), items: [{ key: 'onigiri', name: 'Onigiri', n: 1, pantry: true, love: 'liked' }, { key: 'turnip', name: 'Turnip', n: 4, pantry: true, love: 'like' }] }); }), ['.p-gift']);
  await scene('seeds', () => ev(() => window.G.ui.open('seeds', { seeds: ['carrotSeed', 'riceSeed'], last: 'carrotSeed', onPick() {} })), ['.p-seeds']);
  await scene('house-card', () => ev(() => { const G = window.G, rec = G.sim.list.find(r => r.data?.owner === 'usagi') || G.sim.list.find(r => r.data?.owner); G.ui.open('houseCard', { rec }); }), ['.p-house']);
  await scene('remodel', () => ev(() => { const G = window.G, rec = G.sim.list.find(r => r.data?.owner === 'usagi') || G.sim.list.find(r => r.data?.owner); G.ui.open('remodel', { rec }); }), ['.p-remodel']);
  await scene('dialogue', async () => {
    await ev(() => { const G = window.G; G.ui.dialogue({ speaker: 'Rosie', portrait: G.portrait('rosie'), lines: ['Hi Chewy! What can I do for you today?'], choices: [{ text: 'Show me your treats' }, { text: 'Any jobs for me?' }, { text: 'Give a gift' }, { text: 'Bye for now!' }] }); });
    await sleep(page, 400); for (let i = 0; i < 6 && await ev(() => window.G.ui.dlg.typing); i++) await ev(() => window.G.ui.dlg.advance());
  }, ['.l-dlg'], async () => { await ev(() => window.G.ui.dlg.finish?.(-1)); });
  await scene('guide', () => ev(() => { const T = window.G.ui.tutorial; T.step({ n: 2, total: 6, title: 'Fishing with Kero', objective: 'Face the water and press *F* to cast' }); T.say('kero', 'Hold *F* to lift the green zone. Tap *Tab* for the next hero.'); }), ['.tut-dock', '.l-over'], () => ev(() => { const T = window.G.ui.tutorial; T.hide?.(); T.clear?.(); }));
  await scene('reel', () => ev(() => window.G.ui.reel.start({ icon: '', name: 'Koi', known: false, zone: 0.3 })), ['.reel'], () => ev(() => window.G.ui.reel.hide()));
  // the cozy path (docs/COZY.md §10; CZ-10): the Board's views, the Guild's tabs, the Sightings, the away card, the
  // Journal's Crews tab, the menu's Crews view, the HUD's chip and away minis, and the touch hero wheel with an away hero
  if (!ONLY.size || [...ONLY].some(n => n.startsWith('cozy') || n.startsWith('guide-'))) { console.log('cozy seed', JSON.stringify(await seedCozy(page))); await quietUi(page); }
  for (const c of cozyScenes(ev)) await scene(c.name, async () => { await c.open(); await quietUi(page, 4000); }, c.scopes, c.close); // (banners played out: a clean shot)
  await scene('cozy-wheel', () => ev(() => window.G.heroes.openWheel()), ['.hero-wheel'], () => ev(() => window.G.heroes.pickFromWheel(null)));
  // R-14: a guide's card (Got it! and Skip step shown) over each panel a guide opens, spotlighting what its step does
  const rec = () => { const G = window.G; return G.sim.list.find(r => r.data?.owner === 'usagi') || G.sim.list.find(r => r.data?.owner); };
  const GUIDE_OVER = [
    ['board-crew', () => window.G.ui.open('expeditions', { at: 'board', view: 'story' }), '.p-exp .ex-crew'],
    ['board-send', () => window.G.ui.open('expeditions', { at: 'board', view: 'story' }), '.p-exp .ex-go'],
    ['board-away', () => window.G.ui.open('expeditions', { at: 'board', view: 'away' }), '.p-exp .ex-trip'],
    ['guild-roster', () => window.G.cozy.guild.open('roster'), '.p-guild .gd-hire:not(.free):not(.lock)'],
    ['guild-hire', () => window.G.cozy.guild.open('hire'), '.p-guild .gd-cands'],
    ['journal', () => window.G.ui.open('quests'), '.p-quests .q-tabs .tab[data-t="fish"]'],
    ['menu', () => window.G.ui.open('menu'), '.p-menu [data-a="open:quests"]'],
    ['pantry', () => window.G.ui.open('inventory', { view: 'pantry' }), null],
    ['skills', () => window.G.ui.open('skills'), '.p-skills .chg-drawer'],
    ['house-card', `(${rec})() && window.G.ui.open('houseCard', { rec: (${rec})() })`, '.p-house .hc-btns'],
    ['remodel', `(${rec})() && window.G.ui.open('remodel', { rec: (${rec})() })`, '.p-remodel .rm-sets'],
    ['stash', () => window.G.ui.open('stash'), null],
  ];
  for (const [n, open, spot] of GUIDE_OVER)
    await scene('guide-' + n, async () => {
      await ev(() => window.G.ui.closeAll()); await ev(open); await sleep(page, 300);
      await ev(sp => { const T = window.G.ui.tutorial; T.step({ n: 4, total: 7, title: 'The Expedition Board', objective: 'Add Moka to the crew', ack: true, skippable: true }); T.highlight(sp ? [...document.querySelectorAll(sp)].slice(0, 1) : []); }, spot);
    }, ['.tut-dock'], () => ev(() => { const T = window.G.ui.tutorial; T.hide(); window.G.ui.closeAll(); }));
  await scene('build', async () => { await ev(() => window.G.build.enter()); await sleep(page, 600); }, ['.p-build', '.l-hud', '.tc'], async () => { await ev(() => window.G.build.exit?.()); await sleep(page, 400); });
  if (!ONLY.size || ONLY.has('home') || ONLY.has('decorate')) { await ev(() => window.G.openHome()); await waitMode(page, 'interior'); await sleep(page, 900); }
  await scene('home', async () => {}, ['.l-hud', '.tc'], async () => {});
  await scene('decorate', async () => { await ev(() => window.G.housing.decor.enter()); await sleep(page, 600); }, ['.p-decor', '.l-hud', '.tc'], () => ev(() => window.G.housing.decor.exit?.()));
  await scene('portrait', async () => { await page.setViewportSize({ width: H, height: W }); await sleep(page, 500); }, ['.m-rotate'], async () => { await page.setViewportSize({ width: W, height: H }); await sleep(page, 500); });
  await scene('title', async () => { await ev(() => { window.G.housing?.decor?.active && window.G.housing.decor.exit?.(); window.G.save(); }); await page.goto(`${BASE}/`, { waitUntil: 'load' }); await page.waitForFunction(() => window.__ready === true && window.G?.titleActive, null, { timeout: 60000 }); await sleep(page, 2500); }, ['.l-title', '.ti'], async () => {});
  // Settings from the title (its Settings button: no game menu behind it)
  await scene('title-settings', () => ev(() => window.G.ui.open('menu', { view: 'settings', from: 'title' })), ['.p-menu']);
} catch (e) { console.log('!! run:', e.message); bad++; }

console.log(`\n${small.length} text groups under ${FLOOR} px; ${tiny.length} tappable groups under ${TAP} px; ${clipped.length} panels cut off; ${covered.length} things under a guide card. Shots: ${OUT}`);
if (errors.length) { console.log('page errors:', [...new Set(errors)].slice(0, 6).join('\n')); bad++; }
await browser.close();
const fail = bad || clipped.length || covered.length || (STRICT && (small.length || tiny.length));
console.log(fail ? 'FAIL mobile-ui' : 'PASS mobile-ui');
process.exit(fail ? 1 : 0);
