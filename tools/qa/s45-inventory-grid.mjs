// s45: items take up space, Sort and the stash's filter, Lost & Found, and Treats (ROADMAP R-20, R-21, R-22;
// docs/INVENTORY.md).
//   a) footprints: the bag draws each item across its cells (a 1 x 2 katana, a 2 x 2 outfit, a 2 x 1 hat), the cells it
//      covers hide, the paper doll's weapon stands upright
//   b) the drag: a 2 x 2 carried over a full area shows a red footprint and is refused; over one item a gold one, and the
//      drop swaps (you then hold the other, as in Diablo); over free cells a green one, and it lands under the pointer
//   c) the quick move and right-click find the first spot that fits; Lost & Found only gives back
//   d) no room: walking over loot with a full bag ("No room in your bag", it stays on the ground); a shop buy refused
//      (nothing spent); a quest reward goes to the stash, then to Lost & Found, whose tab shows and goes once it's empty
//   e) Sort: the bag and a stash tab pack in Sort's order, nothing lost, sorting twice gives the same layout; R3 on the pad
//   f) the filter: each chip fades what doesn't match (no hover, no pick-up, nothing dropped onto it), the headers count
//      the matches, the choice is remembered
//   g) the pad: the focus steps by cell and an item is one stop; the held item's footprint follows the focus; A puts it down
//   h) touch (a phone): a tap picks an item up, a press shows its footprint, the lift puts it down
//   i) Treats: the names and tiers, the tooltip, the debug grant; an old save's gems renamed in the bag, the stash and
//      socketed in worn gear; and an old save's bag packed (every item kept, the counts exact; a second load the same)
//   usage: node tools/qa/s45-inventory-grid.mjs     S45_ONLY=abc   BASE=<a production bundle's URL>   SHOTS=0 (no shots)
import fs from 'node:fs';
import { launch, boot, sleep, makeReport, waitMode, BASE } from './lib.mjs';
import { installPad, padTap } from './pad-lib.mjs';
import { launchTouch } from './touch-lib.mjs';

const OUT = 'tools/qa/tmp/s45-inventory-grid'; fs.mkdirSync(OUT, { recursive: true });
const R = makeReport('s45-inventory-grid');
const want = k => !process.env.S45_ONLY || process.env.S45_ONLY.includes(k);
const allErr = [], allWarn = [];
const { browser, page, errors, warns } = await launch({ w: 1600, h: 900 });
const ev = (fn, a) => page.evaluate(fn, a);
const until = (fn, a, timeout = 6000) => page.waitForFunction(fn, a, { timeout, polling: 'raf' }).then(() => true, () => false);
const shot = n => (process.env.SHOTS === '0' ? null : page.screenshot({ path: `${OUT}/${n}.png` }));
const centre = sel => page.$eval(sel, e => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; });
/** a cell's centre on screen (the grid's geometry: its padding, 52 px cells, 6 px gaps, its zoom) */
const cellAt = (sel, x, y) => page.$eval(sel, (e, [x, y]) => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e), C = parseFloat(cs.gridTemplateColumns), G = parseFloat(cs.columnGap), pl = parseFloat(cs.paddingLeft), bl = parseFloat(cs.borderLeftWidth), pt = parseFloat(cs.paddingTop), bt = parseFloat(cs.borderTopWidth), z = r.width / e.offsetWidth; return { x: r.left + (bl + pl + x * (C + G) + C / 2) * z, y: r.top + (bt + pt + y * (C + G) + C / 2) * z }; }, [x, y]);
// the items, by base: one of each footprint
const SETUP = async () => ev(async () => {
  const I = await import('/src/rpg/items.js'), B = I.ITEM_BASES, base = f => Object.keys(B).find(k => B[k].kind === 'gear' && f(B[k]));
  const mk = (f, o = {}) => { const it = I.generateItem({ ilvl: 6, base: base(f), rarity: 'magic', ...o }); it.req = { lvl: 1 }; return it; };
  window.__mk = { sword: () => mk(b => b.wtype === 'sword'), staff: () => mk(b => b.wtype === 'staff'), fuma: () => mk(b => b.wtype === 'fuma'), ball: () => mk(b => b.wtype === 'ball'), hat: () => mk(b => b.slot === 'hat'), outfit: () => mk(b => b.slot === 'outfit'), boots: () => mk(b => b.slot === 'boots'), charm: () => mk(b => b.slot === 'charm'), collar: () => mk(b => b.slot === 'collar'), treat: (t = 'lemon', k = 1) => I.makeGem(t, k) };
  return true;
});
/** a clean bag: items put at their anchors */
const putBag = list => ev(list => { const G = window.G, st = G.state; st.inventory.fill(null); for (const [kind, i] of list) st.inventory[i] = window.__mk[kind](); G.ui.refreshItems(); return st.inventory.map((x, k) => x ? k : -1).filter(k => k >= 0); }, list);

await boot(page, 'fresh&nointro&notut');
await ev(() => { window.G.state.flags.burrowTut = true; });
await SETUP();

// ================================================================== a) footprints
if (want('a')) {
  await putBag([['sword', 0], ['outfit', 1], ['hat', 3], ['staff', 5], ['charm', 6], ['boots', 26], ['treat', 39]]);
  await ev(() => { const G = window.G; G.state.equipment.weapon = window.__mk.sword(); G.actions.recompute(); G.ui.open('inventory'); }); await sleep(page, 600);
  const fp = await ev(() => {
    const q = i => document.querySelector(`.p-inv .slot[data-c="inv"][data-i="${i}"]`), r = i => { const b = q(i).getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)]; };
    const one = r(39), [cw, ch] = one;
    const rel = i => { const [w, h] = r(i); return `${Math.round((w + 6 * cw / 52) / (cw + 6 * cw / 52))}x${Math.round((h + 6 * ch / 52) / (ch + 6 * ch / 52))}`; };
    return { sword: rel(0), outfit: rel(1), hat: rel(3), staff: rel(5), boots: rel(26), treat: rel(39), hidden: [10, 2, 11, 12, 4, 15, 25, 27].map(i => q(i).classList.contains('cov') && getComputedStyle(q(i)).display === 'none'), doll: (() => { const w = document.querySelector('.p-inv .slot.eq[data-i="weapon"] img'); return !!w && w.naturalHeight > w.naturalWidth * 1.6; })() };
  });
  await shot('a1-bag-footprints');
  R.check('footprints: a katana 1x2, an outfit 2x2, a hat 2x1, a staff 1x3, boots 2x1, a treat 1x1, each drawn across its cells; the cells under them hide; the doll\'s katana stands upright', fp.sword === '1x2' && fp.outfit === '2x2' && fp.hat === '2x1' && fp.staff === '1x3' && fp.boots === '2x1' && fp.treat === '1x1' && fp.hidden.every(Boolean) && fp.doll, fp);
}

// ================================================================== b) the drag: red over two, gold over one (swap), green onto free
if (want('b')) {
  // a crowded corner: the outfit (2x2) to carry, two charms and a hat in the way
  await putBag([['outfit', 28], ['charm', 0], ['charm', 1], ['hat', 12], ['sword', 5]]);
  await ev(() => { window.G.ui.closeAll(); window.G.ui.open('inventory'); }); await sleep(page, 500);
  const o = await centre('.p-inv .slot[data-c="inv"][data-i="28"]');
  await page.mouse.move(o.x, o.y); await page.mouse.down(); await page.mouse.move(o.x + 20, o.y - 10, { steps: 3 });
  const over2 = await cellAt('.p-inv .grid[data-g="inv"]', 1, 1); // (the 2x2 there covers the charm at (1,0) and the hat at (2,1))
  await page.mouse.move(over2.x - 26, over2.y - 26, { steps: 8 }); await sleep(page, 120);
  const red = await ev(() => { const f = document.querySelector('.p-inv .g-fp.on'); return f ? [...f.classList].find(c => ['ok', 'swap', 'bad'].includes(c)) : null; });
  await shot('b1-carry-2x2-red');
  await page.mouse.up(); await sleep(page, 250);
  const after1 = await ev(() => ({ at28: window.G.state.inventory[28]?.slot, held: !!window.G.ui.drag.held }));
  // over exactly one item (the sword at 5: the 2x2 at (5,0) covers only it): gold, and the drop swaps
  const sw = await ev(() => window.G.state.inventory[5].uid);
  const p2 = await centre('.p-inv .slot[data-c="inv"][data-i="28"]');
  await page.mouse.move(p2.x, p2.y); await page.mouse.down(); await page.mouse.move(p2.x + 20, p2.y - 10, { steps: 3 });
  const c5 = await cellAt('.p-inv .grid[data-g="inv"]', 5, 0);
  await page.mouse.move(c5.x + 26, c5.y + 26, { steps: 8 }); await sleep(page, 120);
  const gold = await ev(() => { const f = document.querySelector('.p-inv .g-fp.on'); return f ? [...f.classList].find(c => ['ok', 'swap', 'bad'].includes(c)) : null; });
  await page.mouse.up(); await sleep(page, 300);
  const sw2 = await ev(u => { const G = window.G, D = G.ui.drag; return { outfitAt5: G.state.inventory[5]?.slot, held: D.held && D.get(D.held)?.uid === u, heldRef: D.held }; }, sw);
  await shot('b2-swapped-holding-sword');
  // over free cells (the bottom right): green, and the held sword lands under the pointer
  const c9 = await cellAt('.p-inv .grid[data-g="inv"]', 9, 2);
  await page.mouse.move(c9.x, c9.y + 26, { steps: 6 }); await sleep(page, 120);
  const green = await ev(() => { const f = document.querySelector('.p-inv .g-fp.on'); return f ? [...f.classList].find(c => ['ok', 'swap', 'bad'].includes(c)) : null; });
  await page.mouse.down(); await page.mouse.up(); await sleep(page, 300);
  const placed = await ev(u => ({ at: window.G.state.inventory.findIndex(x => x?.uid === u), held: !!window.G.ui.drag.held }), sw);
  R.check('the drag: a 2x2 over two items shows red and is refused (it stays where it was); over one, gold, and the drop swaps (you then hold the other); over free cells, green, and it lands under the pointer', red === 'bad' && after1.at28 === 'outfit' && !after1.held && gold === 'swap' && sw2.outfitAt5 === 'outfit' && sw2.held && green === 'ok' && placed.at === 29 && !placed.held, { red, after1, gold, sw2, green, placed });
}

// ================================================================== c) quick move, right-click, Lost & Found gives back only
if (want('c')) {
  await ev(() => { const G = window.G, st = G.state; st.stash.fill(null); for (let i = 0; i < 60; i++) if (i % 10 < 2) st.stash[i] = window.__mk.charm(); G.ui.closeAll(); G.ui.open('stash'); G.ui.panels.stash.setTab(0); });
  await putBag([['staff', 0]]);
  await sleep(page, 400);
  await page.click('.p-inv .slot[data-c="inv"][data-i="0"]', { modifiers: ['Control'] }); await sleep(page, 250);
  const q = await ev(() => window.G.state.stash.findIndex(x => x?.wtype === 'staff'));
  await page.click(`.p-stash .slot[data-c="stash"][data-i="${q}"]`, { button: 'right' }); await sleep(page, 250);
  const back = await ev(() => window.G.state.inventory.findIndex(x => x?.wtype === 'staff'));
  const lostIn = await ev(() => { const A = window.G.actions; window.G.state.lostFound = Array(60).fill(null); const it = window.__mk.charm(); window.G.state.lostFound[0] = it; window.G.state.inventory[20] = window.__mk.ball(); const r = A.moveItem({ c: 'inv', i: 20 }, { c: 'lost', i: 5 }); const out = A.moveItem({ c: 'lost', i: 0 }, { c: 'inv', i: 39 }); return { r, out: !!out, gone: !window.G.state.lostFound }; });
  R.check('the quick move (Ctrl+Click) puts a 1x3 staff at the first spot it fits (column 2: the charms fill columns 0-1); right-click brings it to the bag\'s first spot; Lost & Found only gives back, and goes once it\'s empty', q === 2 && back === 0 && lostIn.r === false && lostIn.out && lostIn.gone, { q, back, lostIn });
  await ev(() => window.G.ui.closeAll());
}

// ================================================================== d) no room: loot, a shop, a reward, Lost & Found
if (want('d')) {
  const fill = await ev(() => { const G = window.G, st = G.state; st.inventory.fill(null); for (let i = 0; i < 40; i++) st.inventory[i] = window.__mk.charm(); G.ui.refreshItems(); return G.actions.firstFree('inv'); });
  // loot on the ground in the village, walked over
  const t0 = await ev(() => window.QA.toasts.length);
  const g0 = await ev(() => { const G = window.G, P = G.player, L = G.villageLoot, it = window.__mk.outfit(); window.__lootIt = it; const to = P.pos.clone(); L.spawn({ type: 'item', item: it }, to.clone().setY(to.y + 0.5), to); return L.list.length; });
  await sleep(page, 1800);
  const ground = await ev(t0 => ({ still: window.G.villageLoot.list.some(e => e.d?.item === window.__lootIt), inBag: window.G.state.inventory.includes(window.__lootIt), toasts: window.QA.toasts.slice(t0) }), t0);
  // a shop buy
  const buy = await ev(() => { const G = window.G; G.state.coins = 5000; const c0 = G.state.coins; const r = G.actions.buyItem(window.__mk.hat(), 100); return { r, spent: c0 - G.state.coins }; });
  // a quest reward: the bag full → the stash; the stash full too → Lost & Found
  const rw = await ev(() => { const G = window.G, st = G.state; const a = window.__mk.sword(); G.story.giveItem(a); const inStash = st.stash.includes(a); for (let i = 0; i < st.stash.length; i++) st.stash[i] = window.__mk.charm(); const b = window.__mk.fuma(); G.story.giveItem(b); return { inStash, inLost: (st.lostFound || []).includes(b) }; });
  await ev(() => { const G = window.G; G.ui.open('stash'); }); await sleep(page, 500);
  const tab = await ev(() => !!document.querySelector('.p-stash .st-tab.st-lost'));
  await page.click('.p-stash .st-tab.st-lost'); await sleep(page, 400);
  await shot('d1-lost-and-found');
  const lostView = await ev(() => ({ g: document.querySelector('.p-stash .stash-grid').dataset.g, has: !!document.querySelector('.p-stash .slot[data-c="lost"].has') }));
  await ev(() => { const st = window.G.state; st.inventory[0] = null; st.inventory[1] = null; st.inventory[10] = null; st.inventory[11] = null; window.G.ui.refreshItems(); });
  const li = await ev(() => window.G.state.lostFound.findIndex(Boolean));
  await page.click(`.p-stash .slot[data-c="lost"][data-i="${li}"]`, { modifiers: ['Control'] }); await sleep(page, 400);
  const gone = await ev(() => ({ lost: !!window.G.state.lostFound, tab: !!document.querySelector('.p-stash .st-tab.st-lost'), open: window.G.ui.panels.stash.tab, fuma: window.G.state.inventory.findIndex(x => x?.wtype === 'fuma') }));
  R.check('no room: loot walked over stays on the ground with "No room in your bag"; a shop buy is refused and costs nothing; a reward goes to the stash, then to Lost & Found (its tab shows); taken out, Lost & Found and its tab go', fill < 0 && ground.still && !ground.inBag && ground.toasts.some(t => /No room in your bag/.test(t)) && buy.r === false && buy.spent === 0 && rw.inStash && rw.inLost && tab && lostView.g === 'lost' && lostView.has && !gone.lost && !gone.tab && gone.open === 0 && gone.fuma === 0, { fill, ground: { ...ground, toasts: ground.toasts.slice(-3) }, buy, rw, tab, lostView, gone });
  await ev(() => { const st = window.G.state; st.stash.fill(null); st.inventory.fill(null); window.G.ui.closeAll(); });
}

// ================================================================== e) Sort
if (want('e')) {
  const mess = [['treat', 0], ['charm', 2], ['sword', 4], ['hat', 7], ['outfit', 20], ['boots', 23], ['staff', 9], ['ball', 25], ['collar', 37], ['fuma', 17]];
  await putBag(mess);
  await ev(() => window.G.ui.open('inventory')); await sleep(page, 400);
  await shot('e1-sort-before');
  const n0 = await ev(() => window.G.state.inventory.filter(Boolean).length);
  await page.click('.p-inv .sort'); await sleep(page, 700);
  await shot('e2-sort-after');
  const s1 = await ev(async () => { const st = window.G.state, Gr = await import('/src/rpg/grid.js'); const items = st.inventory.filter(Boolean); return { n: items.length, layout: st.inventory.map(x => x ? x.uid : '').join(), packed: Gr.packGrid(items, 10, 4).cells.map(x => x ? x.uid : '').join(), problems: Gr.gridProblems(Gr.bagGrid(st)).length, first: st.inventory[0]?.wtype, order: Gr.packOrder(items).map(Gr.sortGroup).join() }; });
  await page.click('.p-inv .sort'); await sleep(page, 400);
  const s2 = await ev(() => window.G.state.inventory.map(x => x ? x.uid : '').join());
  // a stash tab, and R3 on the pad
  await ev(() => { const G = window.G, st = G.state; st.stash.fill(null); const ks = ['charm', 'sword', 'treat', 'outfit', 'hat', 'staff', 'boots']; ks.forEach((k, j) => { st.stash[j * 8 + 1] = window.__mk[k](); }); G.ui.closeAll(); G.ui.open('stash'); G.ui.panels.stash.setTab(0); });
  await sleep(page, 400);
  await page.click('.p-stash .st-sort'); await sleep(page, 500);
  const ss = await ev(async () => { const st = window.G.state, Gr = await import('/src/rpg/grid.js'), S = await import('/src/rpg/stash.js'); return { n: S.tabItems(st, 0).length, first: Gr.sortGroup(st.stash[0]), problems: Gr.gridProblems(S.tabGrid(st, 0)).length }; });
  const ok1 = s1.n === n0 && s1.problems === 0 && s1.first === 'fuma' && s1.layout === s1.packed && s1.order === 'weapon,weapon,weapon,weapon,outfit,hat,feet,jewel,jewel,treat' && s2 === s1.layout;
  R.check('Sort: the bag packs top-left in Sort\'s order (weapons, the biggest first: the fuma at 0; outfits after them; treats last), nothing lost, no overlaps; Sort again: the same layout; a stash tab\'s Sort too', ok1 && ss.n === 7 && ss.first === 'weapon' && ss.problems === 0, { s1: { ...s1, layout: undefined }, same: s2 === s1.layout, ss });
  // R3 on the pad sorts the grid with the focus
  await installPad(page);
  await ev(() => { const G = window.G, st = G.state; st.inventory.fill(null); st.inventory[39] = window.__mk.sword(); st.inventory[38] = window.__mk.charm(); G.ui.closeAll(); G.ui.open('inventory'); });
  await padTap(page, 'DDown'); await sleep(page, 300);
  await ev(() => { const N = window.G.ui.padNav, e = document.querySelector('.p-inv .slot[data-c="inv"][data-i="0"]'); N.blur(); N.cur = null; N.focus(e, N._cands || []); });
  await until(() => /Sort/.test(document.querySelector('.pad-hints')?.textContent || ''), null, 3000);
  const hintR3 = await ev(() => document.querySelector('.pad-hints')?.textContent || '');
  await padTap(page, 'R3'); await sleep(page, 400);
  const r3 = await ev(() => ({ at0: window.G.state.inventory[0]?.wtype, n: window.G.state.inventory.filter(Boolean).length }));
  R.check('Sort on the pad: R3 in the bag sorts it (the hint bar names "R3 Sort")', /Sort/.test(hintR3) && r3.at0 === 'sword' && r3.n === 2, { hintR3, r3 });
  await page.mouse.move(400, 400); await page.mouse.move(420, 410); await sleep(page, 300);
  await ev(() => window.G.ui.closeAll());
}

// ================================================================== f) the stash's filter
if (want('f')) {
  await ev(() => { const G = window.G, st = G.state; st.coins = 9000; Object.assign(st.materials, { wood: 99, stone: 99 }); while (st.stashTabs.length < 2) G.actions.buyStashTab(); st.stash.fill(null); const put = (k, i) => { st.stash[i] = window.__mk[k](); }; put('sword', 0); put('staff', 1); put('outfit', 2); put('hat', 4); put('boots', 24); put('charm', 6); put('collar', 7); put('treat', 8); st.stash[60] = window.__mk.sword(); st.stash[61] = window.__mk.treat('ruby', 2); G.ui.closeAll(); G.ui.open('stash'); G.ui.panels.stash.setTab(0); G.ui.panels.stash.setFilter('all'); });
  await sleep(page, 400);
  const res = {};
  for (const f of ['weapon', 'armour', 'jewel', 'treat', 'other', 'all']) {
    await page.click(`.p-stash .st-chip[data-f="${f}"]`); await sleep(page, 200);
    res[f] = await ev(() => ({ lit: [...document.querySelectorAll('.p-stash .slot.has:not(.dim)')].map(e => +e.dataset.i), dim: document.querySelectorAll('.p-stash .slot.has.dim').length, counts: [...document.querySelectorAll('.p-stash .st-tab[data-t]')].map(e => e.querySelector('.st-n')?.textContent).join(',') }));
    if (f !== 'all') await shot(`f-${f}`);
  }
  // a faded item: no pick-up, and nothing dropped onto it
  await page.click('.p-stash .st-chip[data-f="weapon"]'); await sleep(page, 200);
  const o = await centre('.p-stash .slot[data-c="stash"][data-i="2"]');
  await page.mouse.click(o.x, o.y); await sleep(page, 150);
  const noPick = await ev(() => !window.G.ui.drag.held);
  await page.click('.p-stash .slot[data-c="stash"][data-i="0"]'); await sleep(page, 150); // (the sword: picked up)
  const c6 = await cellAt('.p-stash .grid[data-g="stash"]', 6, 0); // (onto the faded charm)
  await page.mouse.move(c6.x, c6.y + 20, { steps: 4 }); await sleep(page, 100);
  const vd = await ev(() => document.querySelector('.p-stash .g-fp.on')?.classList.contains('bad'));
  await page.mouse.down(); await page.mouse.up(); await sleep(page, 200);
  const kept = await ev(() => ({ sword: window.G.state.stash[0]?.wtype, charm: window.G.state.stash[6]?.slot }));
  await ev(() => window.G.ui.drag.cancel());
  // remembered
  const mem = await ev(() => { try { return localStorage.getItem('chewy3d.stashFilter'); } catch (e) { return null; } });
  const okF = res.weapon.lit.sort().join() === '0,1' && res.weapon.dim === 6 && res.weapon.counts === '2,1' && res.armour.lit.sort((a, b) => a - b).join() === '2,4,24' && res.jewel.lit.sort((a, b) => a - b).join() === '6,7' && res.treat.lit.join() === '8' && res.treat.counts === '1,1' && res.other.lit.length === 0 && res.all.dim === 0 && res.all.counts === '8,2';
  R.check('the filter: Weapons, Armour (hats, outfits, boots), Jewellery, Treats and Other each show only theirs and fade the rest, which keeps its place; the headers count the matches; a faded item can\'t be picked up or dropped onto; the choice is remembered', okF && noPick && vd && kept.sword === 'sword' && kept.charm === 'charm' && mem === 'weapon', { res, noPick, vd, kept, mem });
  await ev(() => { window.G.ui.panels.stash.setFilter('all'); window.G.ui.closeAll(); });
}

// ================================================================== g) the pad
if (want('g')) {
  await installPad(page);
  await putBag([['outfit', 2], ['charm', 0]]);
  await ev(() => { window.G.ui.closeAll(); window.G.ui.open('inventory'); }); await sleep(page, 400);
  await padTap(page, 'DDown'); await sleep(page, 200);
  const focusOn = i => ev(i => { const N = window.G.ui.padNav, e = document.querySelector(`.p-inv .slot[data-c="inv"][data-i="${i}"]`); N.blur(); N.cur = null; N.focus(e, N._cands || []); return N.cur === e; }, i);
  await focusOn(1);
  const steps = [];
  for (let k = 0; k < 3; k++) { await padTap(page, 'DRight'); await sleep(page, 120); steps.push(await ev(() => +window.G.ui.padNav.cur?.dataset.i)); }
  // pick the charm up, walk onto free cells: the footprint follows, A puts it down there
  await focusOn(0); await padTap(page, 'A'); await sleep(page, 150);
  await focusOn(30); await sleep(page, 150);
  const fp = await ev(() => { const f = document.querySelector('.p-inv .g-fp.on'); return f ? [...f.classList].filter(c => c !== 'g-fp' && c !== 'on').join() : null; });
  await shot('g1-pad-footprint');
  await padTap(page, 'A'); await sleep(page, 250);
  const put = await ev(() => ({ at30: window.G.state.inventory[30]?.slot, held: !!window.G.ui.drag.held }));
  R.check('the pad: the focus steps by cell and an item is one stop (from cell 1 ▶ lands on the 2x2 outfit at 2, ▶ again skips its other cells to column 4, then column 5); the held item\'s footprint follows the focus (green on free cells); A puts it down there', steps[0] === 2 && steps[1] % 10 === 4 && steps[2] % 10 === 5 && fp === 'ok' && put.at30 === 'charm' && !put.held, { steps, fp, put });
  await page.mouse.move(400, 400); await page.mouse.move(420, 410); await sleep(page, 300);
  await ev(() => window.G.ui.closeAll());
}

// ================================================================== i) Treats, and an old save's bag packed
if (want('i')) {
  const names = await ev(async () => { const I = await import('/src/rpg/items.js'); return I.GEM_TYPES.map(t => [0, 1, 2].map(k => I.makeGem(t, k).name)); });
  const tip = await ev(async () => { const I = await import('/src/rpg/items.js'); return I.itemTooltip(I.makeGem('blueberry', 2), window.G.state, window.G.derived).subtitle; });
  const dbg = await ev(async () => { const { DEBUG_SECTIONS } = await import('/src/debug/registry.js'); (await import('/src/debug/debugActions.js')).registerCoreSections(window.G, {}); const S = DEBUG_SECTIONS.get('items'); return { has: !!S?.actions.some(a => a.label === 'Treats'), gems: !!S?.actions.some(a => a.label === 'Gems') }; });
  // an old save: gems with their old names (the bag, the stash, socketed in worn gear) and a bag packed in 1x1 slots
  const old = await ev(async () => {
    const I = await import('/src/rpg/items.js'), A = await import('/src/rpg/actions.js'), G = window.G;
    const st = JSON.parse(JSON.stringify(A.saveableState(G.state)));
    const mk = window.__mk, list = [];
    st.inventory = Array(40).fill(null); for (let i = 0; i < 40; i++) { const it = [mk.sword, mk.outfit, mk.hat, mk.charm, mk.staff][i % 5](); st.inventory[i] = it; list.push(it.uid); }
    const g1 = { ...I.makeGem('blueberry', 0), name: 'Chipped Blueberry Gem' }; st.inventory[39] = g1; list.pop(); list.push(g1.uid);
    st.stash = Array(60).fill(null); const g2 = { ...I.makeGem('topaz', 2), name: 'Perfect Honeycomb Topaz' }; st.stash[3] = g2; list.push(g2.uid);
    const hat = mk.hat(); hat.gems = [{ type: 'blueberry', tier: 2, name: 'Perfect Blueberry Gem' }]; st.heroes.chewy.equipment.hat = hat;
    delete st.stashTabs; delete st.gridV; delete st.lostFound;
    return { json: JSON.stringify(st), uids: list.sort().join(), n: list.length };
  });
  const load = async () => { await page.goto(`${BASE}/?notitle&nointro&notut&dseed=1`, { waitUntil: 'load' }); await page.waitForFunction(() => window.__ready === true && window.G?.player, null, { timeout: 90000 }); await sleep(page, 1200); };
  await ev(s => { window.G.saveBlocked = true; localStorage.clear(); localStorage.setItem('chewy3d.save', s); }, old.json);
  await load();
  const look = () => ev(async () => { const st = window.G.state, Gr = await import('/src/rpg/grid.js'); const all = [...st.inventory, ...st.stash, ...(st.lostFound || [])].filter(Boolean); const by = n => all.find(x => x.kind === 'gem' && x.name === n); return { n: all.length, uids: all.map(x => x.uid).sort().join(), problems: Gr.gridProblems(Gr.bagGrid(st)).length, bagN: st.inventory.filter(Boolean).length, lost: (st.lostFound || []).filter(Boolean).length, g1: !!by('Crumbly Blueberry Bite'), g2: !!by('Gourmet Honey Chew'), sock: st.heroes.chewy.equipment.hat?.gems?.[0]?.name, layout: st.inventory.map(x => x?.uid || '').join() + '|' + st.stash.map(x => x?.uid || '').join() }; });
  const L1 = await look();
  await ev(() => { window.G.ui.open('stash'); }); await sleep(page, 500); await shot('i1-old-save-packed');
  await ev(() => { window.G.saveBlocked = false; window.G.save(); });
  await load();
  const L2 = await look();
  const want3 = names.map(r => r.join('/')).join(' | ');
  R.check('Treats: Crumbly / plain / Gourmet of Ruby Jerky, Blueberry Bite, Lemon Drop, Stinky Cheese, Diamond Biscuit and Honey Chew; the tooltip says "Gourmet Treat"; the debug menu grants "Treats"', names[1][0] === 'Crumbly Blueberry Bite' && names[5][2] === 'Gourmet Honey Chew' && names[0][1] === 'Ruby Jerky' && tip === 'Gourmet Treat' && dbg.has && !dbg.gems, { want3, tip, dbg });
  R.check('an old save: its gems renamed (the bag, the stash, socketed in worn gear: "Gourmet Blueberry Bite"); its 1x1 bag packed with every item kept (the counts and uids exact, the overflow in the stash and Lost & Found), no overlaps; a second load the same', L1.n === old.n && L1.uids === old.uids && L1.problems === 0 && L1.g1 && L1.g2 && L1.sock === 'Gourmet Blueberry Bite' && L2.layout === L1.layout && L2.n === old.n, { L1: { ...L1, layout: undefined }, same: L2.layout === L1.layout, n: old.n });
  await ev(() => { window.G.ui.closeAll(); localStorage.clear(); });
}
allErr.push(...errors); allWarn.push(...warns);
await browser.close();

// ================================================================== h) touch (a phone): tap up, press to see, lift to put down
if (want('h')) {
  const T = await launchTouch();
  const tp = T.page, tev = (fn, a) => tp.evaluate(fn, a);
  await boot(tp, 'fresh&nointro&notut');
  await tev(() => { window.G.state.flags.burrowTut = true; });
  await tp.evaluate(async () => { const I = await import('/src/rpg/items.js'), B = I.ITEM_BASES; const base = f => Object.keys(B).find(k => B[k].kind === 'gear' && f(B[k])); const st = window.G.state; st.inventory.fill(null); const o = I.generateItem({ ilvl: 5, base: base(b => b.slot === 'outfit'), rarity: 'magic' }); st.inventory[0] = o; window.__o = o; window.G.ui.open('inventory'); });
  await tp.waitForTimeout(700);
  const c = s => tp.$eval(s, e => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  const a = await c('.p-inv .slot[data-c="inv"][data-i="0"]'); await T.F.tap(a.x, a.y); await tp.waitForTimeout(250);
  const held = await tev(() => !!window.G.ui.drag.held);
  const cell = await tp.$eval('.p-inv .grid[data-g="inv"]', e => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e), C = parseFloat(cs.gridTemplateColumns), G = parseFloat(cs.columnGap), pl = parseFloat(cs.paddingLeft), bl = parseFloat(cs.borderLeftWidth), z = r.width / e.offsetWidth; return { x: r.left + (bl + pl + 6 * (C + G) + C + G / 2) * z, y: r.top + (bl + pl + 1 * (C + G) + C + G / 2) * z }; });
  await T.F.down(3, cell.x, cell.y); await tp.waitForTimeout(150);
  const pre = await tev(() => { const f = document.querySelector('.p-inv .g-fp.on'); return f ? [...f.classList].filter(k => k !== 'g-fp' && k !== 'on').join() : null; });
  await tp.screenshot({ path: `${OUT}/h1-phone-press-footprint.png` });
  await T.F.up(3); await tp.waitForTimeout(300);
  const at = await tev(() => window.G.state.inventory.indexOf(window.__o));
  R.check('touch (a phone): a tap picks the outfit up; a press over the grid shows its footprint (green) under the finger; lifting puts it down there (its top-left at (6,1))', held && pre === 'ok' && at === 16, { held, pre, at });
  allErr.push(...T.errors); allWarn.push(...T.warns);
  await T.browser.close();
}

process.exit(R.finish(allErr, allWarn) ? 1 : 0);
