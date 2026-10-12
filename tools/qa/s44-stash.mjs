// s44: the stash outside and its tabs (ROADMAP R-18, R-19; docs/HOUSING.md "The stash", docs/VILLAGE_PLAN.md §14).
//   a) build mode: the Stash Chest's card (Services, no rank, 150 coins · 10 wood · 6 stone, 2 × 1), placed twice with
//      the real mouse (any number), each paid for
//   b) the keyboard: F at a chest ("Open the stash") opens the stash with the bag beside it, the lid pops, the chest
//      sound; an item put in at one chest is there at the other and at the cottage's Treasure Chest
//   c) the tabs: the "+" tab's price and card, refused when poor (nothing spent), bought up to 6 at the table's prices
//      (coins and materials), then no "+"; each purchase autosaves
//   d) renaming and colouring a tab through its popover (typed, a swatch), and a name tidied
//   e) moving: Ctrl+Click from the bag goes to the open tab, then the first tab with room; a drag dropped on a tab's
//      header files it in that tab; a click-held item put down on a header too; a full tab refuses
//   f) the pad: A at a chest opens it, LT / RT (and LB / RB) step the tabs, X stashes into the open tab, A on a header
//      with an item held files it there
//   g) touch: the attack button at a chest opens it, a tap opens a tab, a tap on a header with an item held files it
//   h) the save migration: a real 0.5.1 save (tools/qa/fixtures/precozy-0.5.1.json) with mixed items in its flat 60-slot
//      stash loads as tab 1: every item kept (counts and uids exact), packed in Sort's order (items take up space, R-20),
//      and a second load leaves it as it was
//   i) a save and reload: the tabs, their names and colours, the items in each, and the chests in the village
//   j) the debug menu's actions: "Unlock all stash tabs", "Place a stash by me"
//   usage: node tools/qa/s44-stash.mjs        S44_ONLY=abc (sections)   BASE=<a production bundle's URL>
import fs from 'node:fs';
import { launch, boot, sleep, tap, makeReport, waitMode, BASE } from './lib.mjs';
import { installPad, padTap } from './pad-lib.mjs';
import { launchTouch } from './touch-lib.mjs';

const OUT = 'tools/qa/tmp/s44-stash'; fs.mkdirSync(OUT, { recursive: true });
const R = makeReport('s44-stash');
const want = k => !process.env.S44_ONLY || process.env.S44_ONLY.includes(k);
const allErr = [], allWarn = [];
const PRICES = [null, { coins: 500, wood: 12, stone: 8 }, { coins: 1500, wood: 25, stone: 15, silk: 3 }, { coins: 4000, wood: 40, stone: 25, silk: 5, lantern: 2 }, { coins: 10000, wood: 60, stone: 40, crystal: 4, lantern: 4 }, { coins: 25000, wood: 90, stone: 60, silk: 6, crystal: 8, lantern: 6 }];

const { browser, page, errors, warns } = await launch({ w: 1600, h: 900 });
allErr.push(...[]); // (collected at the end)
const ev = (fn, a) => page.evaluate(fn, a);
const until = (fn, a, timeout = 6000) => page.waitForFunction(fn, a, { timeout, polling: 'raf' }).then(() => true, () => false);
const shot = n => page.screenshot({ path: `${OUT}/${n}.png` });
/** a world point → the page's pixels */
const toScreen = (x, y, z) => ev(([x, y, z]) => { const G = window.G, v = new G.THREE.Vector3(x, y, z).project(G.engine.camera); return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight }; }, [x, y, z]);
/** an item into the bag → its bag index */
const give = (o = {}) => ev(async o => { const I = await import('/src/rpg/items.js'); const G = window.G, it = I.generateItem({ ilvl: 6, rarity: 'magic', ...o }); G.actions.pickup(it); return G.state.inventory.findIndex(x => x === it); }, o);
/** walk up to a stash chest (the n-th built) and stand at its door */
const atChest = (n = 0) => ev(n => { const G = window.G, rec = G.sim.list.filter(r => r.data.type === 'stashChest')[n]; if (!rec) return null; G.ui.closeAll(); G.player.setPos(rec.inter.pos.x, rec.inter.pos.z); G.player.moveTarget = null; G.interactCooldown = 0; G.engine.rig.focus.copy(G.player.pos); G.engine.rig.snap(); return rec.data.id; }, n);

await boot(page, 'fresh&nointro&notut');
await ev(() => { const G = window.G; G.state.flags.burrowTut = true; G.saveBlocked = false; });

// ================================================================== a) build mode: place two
if (want('a')) {
  await ev(() => { const G = window.G; G.state.coins = 2000; G.state.materials.wood = 80; G.state.materials.stone = 60; G.player.setPos(113.5, 125.5); G.engine.rig.focus.copy(G.player.pos); G.engine.rig.snap(); });
  await ev(() => window.G.build.enter()); await sleep(page, 700);
  await ev(() => { const B = window.G.ui.panels.build; B.cat = 'service'; B.render(true); });
  await until(() => { const i = document.querySelector('.p-build .card[data-id="stashChest"] .cd-art img'); return i && !i.classList.contains('gi') && i.src.startsWith('data:image'); }, null, 20000); // (its 3D thumbnail comes in after the palette opens: buildMode.fillThumbs)
  const card = await ev(() => { const c = document.querySelector('.p-build .card[data-id="stashChest"]'); const it = window.G.build.catalog().flatMap(c => c.items).find(i => i.id === 'stashChest'); const img = c?.querySelector('.cd-art img'); return c ? { locked: c.classList.contains('locked'), cost: it.cost, size: it.size, name: it.name, art: !!img && !img.classList.contains('gi') && img.src.startsWith('data:image') } : null; });
  R.check('build mode: the Stash Chest is a Services card, open from rank 1, 150 coins · 10 wood · 6 stone, 2 × 1, with its 3D thumbnail', card && !card.locked && card.cost.coins === 150 && card.cost.wood === 10 && card.cost.stone === 6 && card.size.join('x') === '2x1' && card.art, card);
  await shot('a1-palette');
  const placed = [];
  for (let k = 0; k < 2; k++) {
    // a free 2 × 1 spot near the camera's focus, then the real mouse: the card, the spot, a click
    const spot = await ev(k => { const G = window.G, sim = G.sim, P = G.engine.rig.focus; for (let r = 3; r < 14; r++) for (let a = 0; a < 24; a++) { const x = Math.round(P.x + Math.cos(a / 24 * 6.283) * r) - 1, z = Math.round(P.z + Math.sin(a / 24 * 6.283) * r); if (sim.canPlace('stashChest', x, z, 0).ok && sim.canPlace('stashChest', x - 1, z - 1, 0).ok && sim.canPlace('stashChest', x + 1, z + 1, 0).ok && (k === 0 || Math.hypot(x - window.__s0.x, z - window.__s0.z) > 4)) { const s = { x, z, y: sim.terrain.heightAt(x + 1, z + 0.5) }; if (k === 0) window.__s0 = s; return s; } } return null; }, k);
    if (!spot) { R.check('build mode: an open spot for a Stash Chest', false); break; }
    if (k === 0) { await page.click('.p-build .card[data-id="stashChest"]'); await sleep(page, 250); } // (it stays in hand for the next one)
    await ev(() => { window.G.build.rot = 0; });
    const p = await toScreen(spot.x + 1, spot.y, spot.z + 0.5);
    await page.mouse.move(p.x - 30, p.y - 20); await sleep(page, 80); await page.mouse.move(p.x, p.y, { steps: 4 }); await sleep(page, 450);
    const c0 = await ev(() => ({ coins: window.G.state.coins, wood: window.G.state.materials.wood, stone: window.G.state.materials.stone, n: window.G.sim.S.buildings.filter(b => b.type === 'stashChest').length }));
    await page.mouse.down(); await sleep(page, 60); await page.mouse.up(); await sleep(page, 500);
    const c1 = await ev(() => ({ coins: window.G.state.coins, wood: window.G.state.materials.wood, stone: window.G.state.materials.stone, n: window.G.sim.S.buildings.filter(b => b.type === 'stashChest').length }));
    placed.push({ spot, c0, c1 });
  }
  await ev(() => window.G.ui.panels.build.clearSelection());
  await shot('a2-placed');
  await ev(() => window.G.build.exit()); await sleep(page, 600);
  const ok = placed.length === 2 && placed.every(p => p.c1.n === p.c0.n + 1 && p.c0.coins - p.c1.coins === 150 && p.c0.wood - p.c1.wood === 10 && p.c0.stone - p.c1.stone === 6);
  R.check('build mode: two Stash Chests placed with the mouse (any number), each paid for once', ok, placed.map(p => ({ n: [p.c0.n, p.c1.n], coins: p.c0.coins - p.c1.coins })));
}
// (the later sections need two chests: from a), else put down directly)
await ev(() => { const G = window.G; if (G.sim.S.buildings.filter(b => b.type === 'stashChest').length < 2) { G.player.setPos(113.5, 125.5); G.stashDebug.placeNear(2, 0); G.player.setPos(100.5, 128.5); G.stashDebug.placeNear(2, 0); } });

// ================================================================== b) the keyboard: F opens, the same stash everywhere
if (want('b')) {
  await atChest(0); await sleep(page, 300);
  const prompt = await ev(() => ({ show: document.querySelector('.hud .prompt')?.classList.contains('show'), text: document.querySelector('.hud .prompt .pr-t')?.textContent || '' }));
  const sfx0 = await ev(() => window.QA.sfx.length);
  await tap(page, 'f', 70);
  const open = await until(() => window.G.ui.isOpen('stash') && window.G.ui.isOpen('inventory'));
  const lid = await ev(() => { const G = window.G, rec = G.sim.list.filter(r => r.data.type === 'stashChest')[0], parts = rec.model.group.children.filter(c => c.isGroup); const q = parts[0]?.quaternion; return { parts: parts.length, angle: q ? +(2 * Math.acos(Math.min(1, Math.abs(q.w)))).toFixed(3) : 0 }; });
  const sfx = await ev(n => window.QA.sfx.slice(n), sfx0);
  await sleep(page, 200); await shot('b1-open-keyboard');
  R.check('the keyboard: F at a Stash Chest ("Open the stash") opens the stash with the bag beside it; the lid pops open and the chest sound plays', prompt.show && /Open the stash/.test(prompt.text) && open && lid.parts >= 1 && lid.angle > 0.15 && sfx.includes('chest_open'), { prompt, open, lid, sfx });
  await until(() => { const rec = window.G.sim.list.filter(r => r.data.type === 'stashChest')[0]; const q = rec.model.group.children.find(c => c.isGroup)?.quaternion; return q && Math.abs(q.w) > 0.9999; }, null, 4000);
  // an item in at chest A (Ctrl+Click from the bag) → there at chest B and at the cottage's Treasure Chest
  await ev(() => window.G.ui.closeAll());
  const bi = await give({ rarity: 'rare', slot: 'boots' });
  await atChest(0); await tap(page, 'f', 70); await until(() => window.G.ui.isOpen('stash'));
  await sleep(page, 300);
  const uid = await ev(i => window.G.state.inventory[i]?.uid, bi);
  await page.click(`.p-inv .slot[data-c="inv"][data-i="${bi}"]`, { modifiers: ['Control'] }); await sleep(page, 300);
  const inA = await ev(u => ({ stash: window.G.state.stash.findIndex(x => x?.uid === u), shown: !!document.querySelector('.p-stash .slot.has') }), uid);
  await ev(() => window.G.ui.closeAll()); await sleep(page, 200);
  await atChest(1); await tap(page, 'f', 70); const openB = await until(() => window.G.ui.isOpen('stash'));
  await sleep(page, 300);
  const inB = await ev(u => { const i = window.G.state.stash.findIndex(x => x?.uid === u); const s = document.querySelector(`.p-stash .slot[data-c="stash"][data-i="${i}"]`); return { i, painted: !!s?.classList.contains('has') }; }, uid);
  await ev(() => window.G.ui.closeAll());
  // the cottage: in through its door, F at the chest
  await ev(() => window.G.openHome()); await waitMode(page, 'interior'); await sleep(page, 600);
  await ev(() => { const G = window.G, it = G.world.interactables.find(i => i.use === 'stash'); G.player.setPos(it.pos.x, it.pos.z); G.player.moveTarget = null; G.interactCooldown = 0; });
  await sleep(page, 250); await tap(page, 'f', 70); const openC = await until(() => window.G.ui.isOpen('stash'));
  await sleep(page, 300);
  const inC = await ev(u => { const i = window.G.state.stash.findIndex(x => x?.uid === u); const s = document.querySelector(`.p-stash .slot[data-c="stash"][data-i="${i}"]`); return { i, painted: !!s?.classList.contains('has'), label: window.G.world.interactables.find(x => x.use === 'stash')?.label }; }, uid);
  await shot('b2-cottage-chest');
  R.check('the same stash: an item stashed at one chest shows at the other and at the cottage\'s Treasure Chest', inA.stash >= 0 && openB && inB.i === inA.stash && inB.painted && openC && inC.i === inA.stash && inC.painted, { inA, inB, inC });
  await ev(() => window.G.ui.closeAll());
  await ev(() => window.G.housing.exit()); await waitMode(page, 'village'); await sleep(page, 500);
}

// ================================================================== c) the tabs: buy up to 6
if (want('c')) {
  await ev(() => { const G = window.G, st = G.state; st.coins = 300; st.materials = { ...st.materials, wood: 0, stone: 0, silk: 0, crystal: 0, lantern: 0 }; });
  await atChest(0); await tap(page, 'f', 70); await until(() => window.G.ui.isOpen('stash')); await sleep(page, 300);
  const plus = await ev(() => { const b = document.querySelector('.p-stash .st-buy'); return b ? { poor: b.classList.contains('poor'), price: b.querySelector('.st-pr')?.textContent.trim() } : null; });
  await page.click('.p-stash .st-buy'); await until(() => !!document.querySelector('.pop-wrap.show .sb-pop'));
  const card = await ev(() => { const p = document.querySelector('.pop-wrap.show .sb-pop'); return p ? { go: !!p.querySelector('.sb-go[disabled]'), why: p.querySelector('.sb-why')?.textContent || '', chips: [...p.querySelectorAll('.sb-c')].map(c => c.textContent.trim()), what: p.querySelector('.sb-what')?.textContent.replace(/\s+/g, ' ').trim() } : null; });
  await shot('c1-buy-poor');
  await page.click('.pop-wrap.show .sb-go', { force: true }).catch(() => {}); await sleep(page, 200);
  const poor = await ev(() => ({ tabs: window.G.state.stashTabs.length, coins: window.G.state.coins, len: window.G.state.stash.length, refused: window.G.actions.buyStashTab() }));
  R.check('the "+" tab: greyed with its price (500); its card says what you get and what you\'re short of, Buy is off; poor, nothing is bought or spent', plus && plus.poor && /500/.test(plus.price) && card && card.go && /200 more coins/.test(card.why) && /Tab 2/.test(card.what) && /60 more slots/.test(card.what) && poor.tabs === 1 && poor.coins === 300 && poor.len === 60 && poor.refused === false, { plus, card, poor });
  await ev(() => window.G.ui.hidePopover());
  // rich: buy each through the card, checking the price taken
  await ev(() => { const st = window.G.state; st.coins = 50000; Object.assign(st.materials, { wood: 300, stone: 300, silk: 30, crystal: 30, lantern: 30 }); window.G.autosave.event = null; });
  const buys = [];
  for (let t = 1; t < 6; t++) {
    const m0 = await ev(() => ({ coins: window.G.state.coins, ...window.G.state.materials }));
    const a0 = await ev(() => ({ ev: window.G.autosave.state().event, w: window.G.autosave.state().writes }));
    await page.click('.p-stash .st-buy'); await until(() => !!document.querySelector('.pop-wrap.show .sb-go:not([disabled])'));
    await page.click('.pop-wrap.show .sb-go'); await until(n => window.G.state.stashTabs.length === n && !document.querySelector('.pop-wrap.show'), t + 1);
    const m1 = await ev(() => ({ coins: window.G.state.coins, ...window.G.state.materials, tabs: window.G.state.stashTabs.length, len: window.G.state.stash.length, open: window.G.ui.panels.stash.tab, ev: window.G.autosave.state().event, w: window.G.autosave.state().writes }));
    const paid = { coins: m0.coins - m1.coins }; for (const k of ['wood', 'stone', 'silk', 'crystal', 'lantern']) if (m0[k] - m1[k]) paid[k] = m0[k] - m1[k];
    buys.push({ t, paid, tabs: m1.tabs, len: m1.len, open: m1.open, autosave: m1.ev || (m1.w > a0.w ? 'saved' : null) }); // (flagged, or already written)
    await ev(() => { window.G.autosave.event = null; });
  }
  const want6 = buys.every((b, k) => JSON.stringify(b.paid) === JSON.stringify(PRICES[k + 1]) && b.tabs === k + 2 && b.len === (k + 2) * 60 && b.open === k + 1 && !!b.autosave);
  const after = await ev(() => ({ plus: !!document.querySelector('.p-stash .st-buy'), tabs: document.querySelectorAll('.p-stash .st-tab[data-t]').length, more: window.G.actions.buyStashTab() }));
  await shot('c2-six-tabs');
  R.check('the tabs: bought one by one up to 6 at 500 / 1,500 / 4,000 / 10,000 / 25,000 coins plus their materials; each opens on the new tab and autosaves; then no "+" and no seventh', want6 && !after.plus && after.tabs === 6 && after.more === false, { buys, after });
}

// ================================================================== d) rename and colour
if (want('d')) {
  await ev(() => { const G = window.G, st = G.state, P = G.ui.panels.stash; st.coins = Math.max(st.coins, 9000); Object.assign(st.materials, { wood: 300, stone: 300, silk: 30, crystal: 30, lantern: 30 }); while (st.stashTabs.length < 3 && G.actions.buyStashTab()) { /* */ } if (!G.ui.isOpen('stash')) G.ui.open('stash'); P.setTab(1); });
  await sleep(page, 300);
  await page.click('.p-stash .st-tab.on'); await until(() => !!document.querySelector('.pop-wrap.show .se-pop'));
  const pop = await ev(() => !!document.querySelector('.pop-wrap.show .se-pop'));
  await page.fill('.pop-wrap.show .se-name', 'Treats & charms');
  await page.click('.pop-wrap.show .se-col[data-col="lav"]'); await sleep(page, 200);
  await shot('d1-rename');
  await page.click('.pop-wrap.show .se-ok'); await sleep(page, 300);
  const t1 = await ev(() => ({ ...window.G.state.stashTabs[1], shown: document.querySelector('.p-stash .st-tab[data-t="1"] .st-nm')?.textContent, popped: !!document.querySelector('.pop-wrap.show') }));
  const tidy = await ev(() => { const A = window.G.actions; A.renameStashTab(2, '   a   very long tab name indeed  '); const a = window.G.state.stashTabs[2].name; A.renameStashTab(2, '  '); const b = window.G.state.stashTabs[2].name; const c = A.colorStashTab(2, 'plaid'); return { a, b, c, col: window.G.state.stashTabs[2].color }; });
  R.check('renaming: the open tab\'s popover takes a typed name and a colour swatch; the header shows it; names are tidied (16 characters, blank gives "Tab 3"), a colour off the palette is refused', pop && t1.name === 'Treats & charms' && t1.color === 'lav' && t1.shown === 'Treats & charms' && !t1.popped && tidy.a === 'a very long tab' && tidy.b === 'Tab 3' && tidy.c === false && tidy.col !== 'plaid', { pop, t1, tidy });
}

// ================================================================== e) moving items: the quick move, a drop on a header
if (want('e')) {
  await ev(() => { const G = window.G, st = G.state; while (st.stashTabs.length < 6 && G.actions.buyStashTab()) { /* */ } for (let i = 0; i < st.stash.length; i++) st.stash[i] = null; st.inventory.fill(null); G.ui.closeAll(); G.ui.open('stash'); G.ui.panels.stash.setTab(2); });
  await sleep(page, 300);
  const bi = await give(); await sleep(page, 150);
  await page.click(`.p-inv .slot[data-c="inv"][data-i="${bi}"]`, { modifiers: ['Control'] }); await sleep(page, 250);
  const q1 = await ev(() => window.G.state.stash.findIndex(Boolean));
  // the open tab full: the next goes to the first tab with room (tab 1)
  await ev(async () => { const I = await import('/src/rpg/items.js'); const st = window.G.state; for (let k = 120; k < 180; k++) if (!st.stash[k]) st.stash[k] = I.generateItem({ ilvl: 3 }); window.G.ui.refreshItems(); });
  const bj = await give(); await sleep(page, 150);
  const uj = await ev(i => window.G.state.inventory[i].uid, bj);
  await page.click(`.p-inv .slot[data-c="inv"][data-i="${bj}"]`, { modifiers: ['Control'] }); await sleep(page, 250);
  const q2 = await ev(u => window.G.state.stash.findIndex(x => x?.uid === u), uj);
  R.check('the quick move (Ctrl+Click): into the open tab (tab 3: slot 120); with it full, into the first tab with room (tab 1: slot 0)', q1 === 120 && q2 === 0, { q1, q2 });
  // a drag from the bag dropped on tab 5's header
  const bk = await give(); await sleep(page, 150);
  const uk = await ev(i => window.G.state.inventory[i].uid, bk);
  const from = await page.$eval(`.p-inv .slot[data-c="inv"][data-i="${bk}"]`, e => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  const to = await page.$eval('.p-stash .st-tab[data-t="4"]', e => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(from.x + 30, from.y + 10, { steps: 3 }); await page.mouse.move(to.x, to.y, { steps: 12 }); await sleep(page, 120);
  await shot('e1-drag-to-tab');
  await page.mouse.up(); await until(u => window.G.state.stash.some(x => x?.uid === u), uk);
  const d1 = await ev(u => ({ i: window.G.state.stash.findIndex(x => x?.uid === u), open: window.G.ui.panels.stash.tab, count: document.querySelector('.p-stash .st-tab[data-t="4"] .st-n')?.textContent }), uk);
  // a click-held item put down on tab 6's header (a click picks it up, a click on the header puts it in)
  const bl = await give(); await sleep(page, 150);
  const ul = await ev(i => window.G.state.inventory[i].uid, bl);
  await page.click(`.p-inv .slot[data-c="inv"][data-i="${bl}"]`); await sleep(page, 200);
  const held = await ev(() => !!window.G.ui.drag.held);
  await page.click('.p-stash .st-tab[data-t="5"]'); await until(u => window.G.state.stash.some(x => x?.uid === u), ul);
  const d2 = await ev(u => ({ i: window.G.state.stash.findIndex(x => x?.uid === u), held: !!window.G.ui.drag.held }), ul);
  // a full tab refuses (tab 3 is full)
  const bm = await give(); await sleep(page, 150);
  const um = await ev(i => window.G.state.inventory[i].uid, bm);
  const t0 = await ev(() => window.QA.toasts.length);
  await page.click(`.p-inv .slot[data-c="inv"][data-i="${bm}"]`); await sleep(page, 150);
  await page.click('.p-stash .st-tab[data-t="2"]'); await sleep(page, 300);
  const d3 = await ev(([u, t0]) => ({ inBag: window.G.state.inventory.some(x => x?.uid === u), toast: window.QA.toasts.slice(t0).join(' | ') }), [um, t0]);
  R.check('a drop on a tab\'s header: a drag lands in tab 5 (slot 240, its count shows 1, the view stays), a click-held item in tab 6 (slot 300); a full tab refuses with a toast and the item stays in the bag', d1.i === 240 && d1.open === 2 && d1.count === '1' && held && d2.i === 300 && !d2.held && d3.inBag && /full/.test(d3.toast), { d1, held, d2, d3 });
  await ev(() => window.G.ui.closeAll());
}

// ================================================================== f) the pad
if (want('f')) {
  await installPad(page);
  await atChest(0); await sleep(page, 250);
  await padTap(page, 'A'); const open = await until(() => window.G.ui.isOpen('stash'));
  await sleep(page, 400);
  await ev(() => window.G.ui.panels.stash.setTab(0));
  const steps = [];
  for (const b of ['RT', 'RT', 'LT', 'RB', 'LB', 'LT']) { await padTap(page, b); await sleep(page, 120); steps.push(await ev(() => window.G.ui.panels.stash.tab)); }
  const hints = await ev(() => document.querySelector('.pad-hints')?.textContent || '');
  await shot('f1-pad-tabs');
  // X on a focused bag item stashes it into the open tab
  await ev(() => { const st = window.G.state; for (let i = 0; i < st.stash.length; i++) st.stash[i] = null; window.G.ui.panels.stash.setTab(3); });
  const bi = await give(); await sleep(page, 150);
  const ui = await ev(i => window.G.state.inventory[i].uid, bi);
  const focus = await ev(i => { const N = window.G.ui.padNav, e = document.querySelector(`.p-inv .slot[data-c="inv"][data-i="${i}"]`); N.blur(); N.cur = null; N.focus(e, N._cands || []); return N.cur === e; }, bi);
  await padTap(page, 'X'); await sleep(page, 300);
  const x1 = await ev(u => window.G.state.stash.findIndex(x => x?.uid === u), ui);
  // A picks a bag item up, the focus to tab 2's header, A files it there
  const bj = await give(); await sleep(page, 150);
  const uj = await ev(i => window.G.state.inventory[i].uid, bj);
  await ev(i => { const N = window.G.ui.padNav, e = document.querySelector(`.p-inv .slot[data-c="inv"][data-i="${i}"]`); N.blur(); N.cur = null; N.focus(e, N._cands || []); }, bj);
  await padTap(page, 'A'); await sleep(page, 200);
  const held = await ev(() => !!window.G.ui.drag.held);
  await ev(() => { const N = window.G.ui.padNav, e = document.querySelector('.p-stash .st-tab[data-t="1"]'); N.blur(); N.cur = null; N.focus(e, N._cands || []); });
  await sleep(page, 150);
  const lbl = await ev(() => document.querySelector('.pad-hints')?.textContent || '');
  await padTap(page, 'A'); await sleep(page, 300);
  const a1 = await ev(u => window.G.state.stash.findIndex(x => x?.uid === u), uj);
  await padTap(page, 'B'); await sleep(page, 300);
  const closed = await ev(() => !window.G.ui.isOpen('stash'));
  R.check('the pad: A at a chest opens the stash; RT / LT (and RB / LB) step the tabs, wrapping; the hints name "Stash tabs"; X stashes into the open tab; A on a header with an item held files it there; B closes', open && JSON.stringify(steps) === JSON.stringify([1, 2, 1, 2, 1, 0]) && /Stash tabs/.test(hints) && focus && x1 === 180 && held && /Put it in here/.test(lbl) && a1 === 60 && closed, { open, steps, hints, focus, x1, held, lbl, a1, closed });
  await page.mouse.move(400, 400); await page.mouse.move(420, 410); await sleep(page, 300); // (back to the mouse)
}

// ================================================================== h) the save migration (a real 0.5.1 save)
if (want('h')) {
  // a real 0.5.1 save (its own save path) with a flat 60-slot stash of mixed items: some sit where footprints would now
  // overlap or hang off the grid (a 1 x 2 katana in the last row, a 2 x 2 outfit at the right edge)
  const fx = JSON.parse(fs.readFileSync(new URL('./fixtures/precozy-0.5.1.json', import.meta.url), 'utf8'));
  const old = JSON.parse(fx.storage['chewy3d.save']);
  const made = await ev(async () => {
    const I = await import('/src/rpg/items.js'), B = I.ITEM_BASES, base = f => Object.keys(B).find(k => f(B[k]));
    const mk = (id, rarity, ilvl) => { const it = I.generateItem({ ilvl, base: id, rarity }); delete it.req; it.req = { lvl: 1 }; return it; };
    const list = [[base(b => b.wtype === 'sword'), 'rare', 9], [base(b => b.slot === 'outfit'), 'magic', 6], [base(b => b.wtype === 'staff'), 'unique', 12], [base(b => b.slot === 'hat'), 'normal', 3], [base(b => b.slot === 'charm'), 'magic', 8], [base(b => b.wtype === 'sword'), 'magic', 4], [base(b => b.slot === 'boots'), 'rare', 7]];
    return list.map(([id, r, l]) => mk(id, r, l)).concat([I.makeGem('lemon', 1)]);
  });
  const SLOTS = [59 - 9 + 0, 9, 7, 33, 0, 19, 48, 21]; // (the katana at 50: the last row; the outfit at 9: the right edge)
  old.stash = Array(60).fill(null); made.forEach((it, k) => { old.stash[SLOTS[k]] = it; });
  delete old.stashTabs; delete old.gridV;
  const uids = made.map(it => it.uid).sort().join();
  // through the game's own load: localStorage, a reload; then a second load of what it saved
  const load = async () => { await page.goto(`${BASE}/?notitle&nointro&notut&dseed=1`, { waitUntil: 'load' }); await page.waitForFunction(() => window.__ready === true && window.G?.player, null, { timeout: 90000 }); await sleep(page, 1200); };
  await ev(s => { window.G.saveBlocked = true; localStorage.clear(); localStorage.setItem('chewy3d.save', s); }, JSON.stringify(old));
  await load();
  const look = () => ev(async () => {
    const G = window.G, st = G.state, Gr = await import('/src/rpg/grid.js'), S = await import('/src/rpg/stash.js');
    const all = [...st.inventory, ...st.stash, ...(st.lostFound || [])].filter(Boolean);
    const tab = S.tabGrid(st, 0), want = Gr.packGrid(S.tabItems(st, 0), 10, 6).cells.map(x => x?.uid || null).join();
    return { tabs: st.stashTabs.map(t => t.name + ':' + t.color), n: all.length, uids: all.map(x => x.uid).sort().join(), problems: Gr.gridProblems(tab).length + Gr.gridProblems(Gr.bagGrid(st)).length,
      sorted: st.stash.slice(0, 60).map(x => x?.uid || null).join() === want, layout: JSON.stringify(st.stash.map(x => x?.uid || null)), gridV: st.gridV };
  });
  const first = await look();
  await ev(() => { window.G.ui.open('stash'); }); await sleep(page, 500); await shot('h1-migrated');
  await ev(() => { window.G.saveBlocked = false; window.G.save(); });
  await load();
  const second = await look();
  R.check('the migration: a 0.5.1 save\'s flat stash becomes tab 1 ("Tab 1", pink); every item is kept (the counts and uids match exactly), packed in Sort\'s order with no footprint overlapping or off the grid; a second load leaves it as it was', first.tabs.join() === 'Tab 1:pink' && first.n === made.length && first.uids === uids && first.problems === 0 && first.sorted && first.gridV === 1 && second.layout === first.layout && second.n === made.length, { first: { ...first, layout: undefined }, secondSame: second.layout === first.layout, made: made.length });
  await ev(() => { window.G.ui.closeAll(); localStorage.clear(); });
  await boot(page, 'fresh&nointro&notut');
  await ev(() => { window.G.state.flags.burrowTut = true; window.G.player.setPos(113.5, 125.5); window.G.stashDebug.placeNear(2, 0); window.G.player.setPos(100.5, 128.5); window.G.stashDebug.placeNear(2, 0); });
}

// ================================================================== i) a save and reload
if (want('i')) {
  const before = await ev(async () => {
    const I = await import('/src/rpg/items.js'); const G = window.G, A = G.actions, st = G.state;
    st.coins = 9000; Object.assign(st.materials, { wood: 200, stone: 200, silk: 20, crystal: 20, lantern: 20 });
    while (st.stashTabs.length < 4 && A.buyStashTab()) { /* */ }
    A.renameStashTab(3, 'Spare boots'); A.colorStashTab(3, 'mint');
    const it = I.generateItem({ ilvl: 9, rarity: 'rare', slot: 'boots' }); st.stash[3 * 60 + 17] = it;
    G.save();
    return { tabs: JSON.stringify(st.stashTabs), uid: it.uid, chests: G.sim.S.buildings.filter(b => b.type === 'stashChest').map(b => `${b.x},${b.z}`).join(';') };
  });
  await page.goto(`${BASE}/?notitle&nointro&notut&dseed=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true && window.G?.player, null, { timeout: 90000 });
  await sleep(page, 1500);
  const after = await ev(() => { const G = window.G, st = G.state; return { tabs: JSON.stringify(st.stashTabs), at: st.stash[3 * 60 + 17]?.uid, len: st.stash.length, chests: G.sim.S.buildings.filter(b => b.type === 'stashChest').map(b => `${b.x},${b.z}`).join(';'), inter: G.village.world.interactables.filter(i => i.label === 'Open the stash').length }; });
  R.check('a save and reload: 4 tabs with their names and colours, the item in tab 4\'s slot 17, both Stash Chests (and their prompts)', after.tabs === before.tabs && after.at === before.uid && after.len === 240 && after.chests === before.chests && after.inter === 2, { before, after });
}

// ================================================================== j) the debug menu's actions
if (want('j')) {
  const d = await ev(async () => {
    const { DEBUG_SECTIONS } = await import('/src/debug/registry.js');
    const S = DEBUG_SECTIONS.get('village'), act = l => S?.actions.find(a => a.label === l);
    const G = window.G, n0 = G.sim.S.buildings.filter(b => b.type === 'stashChest').length;
    G.player.setPos(120.5, 132.5);
    const r1 = await act('Unlock all stash tabs')?.run(G);
    const r2 = await act('Place a stash by me')?.run(G);
    return { r1, r2, tabs: G.state.stashTabs.length, n: G.sim.S.buildings.filter(b => b.type === 'stashChest').length - n0 };
  });
  R.check('the debug menu: "Unlock all stash tabs" opens all six, "Place a stash by me" builds a chest nearby', d.tabs === 6 && /6 of 6|already/.test(d.r1 || '') && d.n === 1 && /Stash Chest/.test(d.r2 || ''), d);
}
allErr.push(...errors); allWarn.push(...warns);
await browser.close();

// ================================================================== g) touch (a phone)
if (want('g')) {
  const T = await launchTouch();
  const tp = T.page, tev = (fn, a) => tp.evaluate(fn, a);
  await boot(tp, 'fresh&nointro&notut');
  await tev(() => { const G = window.G; G.state.flags.burrowTut = true; G.player.setPos(113.5, 125.5); G.stashDebug.placeNear(2, 0); const st = G.state; st.coins = 9000; Object.assign(st.materials, { wood: 99, stone: 99, silk: 9 }); G.actions.buyStashTab(); G.actions.buyStashTab(); });
  const center = sel => tp.$eval(sel, e => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await tev(() => { const G = window.G, rec = G.sim.list.find(r => r.data.type === 'stashChest'); G.player.setPos(rec.inter.pos.x, rec.inter.pos.z); G.player.moveTarget = null; G.interactCooldown = 0; G.engine.rig.focus.copy(G.player.pos); G.engine.rig.snap(); });
  await sleep(tp, 400);
  const btn = await center('.tc-attack'); await T.F.tap(btn.x, btn.y);
  const open = await tp.waitForFunction(() => window.G.ui.isOpen('stash'), null, { timeout: 5000 }).then(() => true, () => false);
  await sleep(tp, 600);
  const front = await tev(() => window.G.ui.mobile?.front || null);
  const t2 = await center('.p-stash .st-tab[data-t="2"]'); await T.F.tap(t2.x, t2.y); await sleep(tp, 300);
  const tab = await tev(() => window.G.ui.panels.stash.tab);
  const big = await tev(() => [...document.querySelectorAll('.p-stash .st-tab')].map(e => Math.round(Math.min(e.getBoundingClientRect().width, e.getBoundingClientRect().height))));
  await tp.screenshot({ path: `${OUT}/g1-phone.png` });
  // an item from the bag: flip to the bag, a tap picks it up, flip back, a tap on tab 2's header files it there
  const bi = await tev(async () => { const I = await import('/src/rpg/items.js'); const G = window.G, it = I.generateItem({ ilvl: 5 }); G.actions.pickup(it); G.ui.refreshItems(); return G.state.inventory.indexOf(it); });
  const uid = await tev(i => window.G.state.inventory[i].uid, bi);
  const flipTo = async n => { const f = await tp.$(`.m-flip button[data-n="${n}"], .flip button[data-n="${n}"]`); if (f) { const r = await f.boundingBox(); await T.F.tap(r.x + r.width / 2, r.y + r.height / 2); await sleep(tp, 350); return true; } return tev(n => { window.G.ui.mobile.front = n; window.G.ui.mobile.pairs(true); return false; }, n); };
  await flipTo('inventory');
  const sl = await center(`.p-inv .slot[data-c="inv"][data-i="${bi}"]`); await T.F.tap(sl.x, sl.y); await sleep(tp, 250);
  const held = await tev(() => !!window.G.ui.drag.held);
  await flipTo('stash');
  const t1 = await center('.p-stash .st-tab[data-t="1"]'); await T.F.tap(t1.x, t1.y); await sleep(tp, 350);
  const filed = await tev(u => window.G.state.stash.findIndex(x => x?.uid === u), uid);
  R.check('touch (a phone): the attack button at a chest opens the stash (shown first), a tap opens a tab, tabs are ≥ 44 px; a tapped-up item tapped onto a tab\'s header goes in that tab', open && front === 'stash' && tab === 2 && big.every(v => v >= 40) && held && filed === 60, { open, front, tab, big, held, filed });
  allErr.push(...T.errors); allWarn.push(...T.warns);
  await T.browser.close();
}

process.exit(R.finish(allErr, allWarn) ? 1 : 0);
