// Scenario 50: couch co-op's shared bag panes (docs/COOP.md §5; ui/coopPanes.js). Each player's pane over the one shared
// bag: one pane (tall, centred, not a modal, the hero stands still), two (P1 left, P2 right; player 1's pad Menu opens a
// pane, not the game menu), four (quadrants, the wide layout); A equips to that player's own hero (not player 1's), a
// sword refused for Moka; Y carries an item and another pane shows the cursor and the move live; a hold let go when
// someone else takes the item; X drops at that player's hero; stats and skills spent as them; View leaves (player 4) or
// opens the game menu (player 1); player 1's I / arrows / C / a click / Esc. usage: node tools/qa/s50-coop-panes.mjs [W H]
// SHOTS=1 saves frames to tools/qa/tmp/s50/.
import { launch, boot, sleep, makeReport } from './lib.mjs';
import { installPads, pTap, pStick } from './pad-lib.mjs';
import fs from 'node:fs';
const W = +(process.argv[2] || 1280), H = +(process.argv[3] || 800);
const SHOTS = !!process.env.SHOTS, OUT = `tools/qa/tmp/s50/${W}x${H}`; if (SHOTS) fs.mkdirSync(OUT, { recursive: true });
const R = makeReport(`S50 couch co-op's shared bag panes at ${W}×${H}: one, two and four at once, equip to the right hero, live moves, holds, drops, stats, skills, leaving, player 1's pad, keys and mouse`);
const { browser, page, errors } = await launch({ w: W, h: H });
const ev = (f, a) => page.evaluate(f, a);
const shot = n => (SHOTS ? page.screenshot({ path: `${OUT}/${n}.png` }) : null);
const ok = (c, m) => R.check(m, c);
const wf = (f, a, t = 5000) => page.waitForFunction(f, a, { timeout: t, polling: 'raf' });
const paneOf = n => ev(n => { const M = window.G.coop.panes.mgr, s = window.G.coop.slots.find(x => x.n === n), P = M.panes.get(s); return P ? { tab: P.tab, cur: P.cur, hold: P.hold ? { from: P.hold.from, uid: P.hold.item.uid } : null, kind: P.kind, k: P.k, closing: !!P.closing, rect: (r => [r.left, r.top, r.width, r.height].map(Math.round))(P.el.getBoundingClientRect()) } : null; }, n);
try {
  await boot(page, 'fresh&nointro&notut&noarrive&hour=11');
  await page.waitForFunction(() => window.G?.mode === 'village' && window.G.player?.rig && window.G.coop?.panes?.mgr, null, { timeout: 40000 });
  await installPads(page, 4);
  await ev(async () => { const G = window.G, H = G.heroes; G.state.flags.mokaJoined = true; await H.joinPoe(); await H.joinShihtzu(); await H.joinGolden(); await H.joinStella(); H.spawnBench(); });
  await sleep(page, 500);
  // the bag: one of each footprint
  await ev(async () => {
    const I = await window.G.qaModule('items'), B = I.ITEM_BASES, base = f => Object.keys(B).find(k => B[k].kind === 'gear' && f(B[k]));
    const mk = (f, o = {}) => { const it = I.generateItem({ ilvl: 6, base: base(f), rarity: 'magic', ...o }); it.req = { lvl: 1 }; return it; };
    const st = window.G.state; st.inventory.fill(null);
    const put = (i, it) => { st.inventory[i] = it; };
    put(0, mk(b => b.wtype === 'staff', { rarity: 'rare' })); put(1, mk(b => b.wtype === 'sword')); put(2, mk(b => b.slot === 'outfit')); put(4, mk(b => b.slot === 'hat'));
    put(6, mk(b => b.wtype === 'fuma')); put(8, mk(b => b.slot === 'charm')); put(9, mk(b => b.slot === 'collar')); put(24, mk(b => b.slot === 'boots', { rarity: 'unique' }));
    put(26, I.makeGem('lemon', 1)); put(27, mk(b => b.wtype === 'flail')); put(29, mk(b => b.wtype === 'ball'));
    window.G.events.emit('inv:changed', { c: 'inv' });
  });
  await pStick(page, 0, 'right', 0.6, 0); await sleep(page, 100); await pStick(page, 0, 'right', 0, 0); await sleep(page, 150); // (claims pad 0 for player 1 without pressing A at a villager)
  for (const i of [1, 2, 3]) { await pTap(page, i, 'A'); await wf(i => window.G.coop.joins.has(i), i); await sleep(page, 200); await pTap(page, i, 'A'); await wf(n => window.G.coop.slots.length === n, i + 1); await sleep(page, 150); }
  const heroes = await ev(() => window.G.coop.slots.map(s => window.G.coop.heroOf(s)));
  console.log('heroes', heroes.join(', '));
  await page.waitForFunction(() => { const B = window.G.ui.banners; return !B.busy && !B.q.length; }, null, { timeout: 30000, polling: 250 });
  await ev(() => { for (const t of document.querySelectorAll('.toasts > *')) t.remove(); });
  await sleep(page, 400);

  // ---- one pane: P2 opens theirs (Menu)
  await pTap(page, 1, 'Menu');
  await sleep(page, 120); await shot('01-p2-opening');
  await wf(() => window.G.coop.slots[1].pane === 'bag'); await sleep(page, 450);
  await shot('02-p2-one');
  let p2 = await paneOf(2); ok(p2 && p2.kind === 'tall', `one pane: tall, centred ${JSON.stringify(p2?.rect)} k=${p2?.k?.toFixed(3)}`);
  ok(await ev(() => !window.G.ui.anyModal()), 'the pane is not a modal');
  ok(await ev(() => window.G.coop.slots[1].body.paneOpen === true), "P2's hero stands still (paneOpen)");

  // ---- two: P1 opens (pad Menu)
  await pTap(page, 0, 'Menu');
  await sleep(page, 140); await shot('03-two-gliding');
  await wf(() => window.G.coop.p1.pane === 'bag'); await sleep(page, 500);
  await shot('04-two');
  const p1 = await paneOf(1); p2 = await paneOf(2);
  ok(p1 && p2 && p1.rect[0] < p2.rect[0], `two panes: P1 left ${JSON.stringify(p1?.rect)}, P2 right ${JSON.stringify(p2?.rect)}`);
  ok(await ev(() => window.G.player.paneOpen === true && !window.G.ui.isOpen('menu') && !window.G.ui.padMenu?.active), "P1's pane (not the game menu)");

  // ---- equip on P2: walk the cursor to the staff (cell 0) and press A: Moka wears it, not Chewy
  const p2hero = heroes[1];
  const before = await ev(h => ({ p2: window.G.state.heroes[h].equipment.weapon?.uid, p1: window.G.state.heroes[window.G.coop.heroOf(window.G.coop.p1)].equipment.weapon?.uid, staff: window.G.state.inventory[0]?.uid }), p2hero);
  await ev(() => { const M = window.G.coop.panes.mgr, P = M.panes.get(window.G.coop.slots[1]); P.cur = { z: 'grid', x: 0, y: 0 }; P.curDirty = true; });
  await sleep(page, 150);
  await shot('05-p2-focus-staff');
  await pTap(page, 1, 'A'); await sleep(page, 160); await shot('06-p2-equip-flying');
  await sleep(page, 500);
  const after = await ev(h => ({ p2: window.G.state.heroes[h].equipment.weapon?.uid, p1: window.G.state.heroes[window.G.coop.heroOf(window.G.coop.p1)].equipment.weapon?.uid }), p2hero);
  ok(after.p2 === before.staff && after.p1 === before.p1, `the staff went to ${p2hero} (P2), P1's weapon unchanged`);
  await shot('07-p2-equipped');

  // ---- a sword on P2 (Moka): refused, says whose
  await ev(() => { const M = window.G.coop.panes.mgr, P = M.panes.get(window.G.coop.slots[1]); P.cur = { z: 'grid', x: 1, y: 0 }; P.curDirty = true; });
  await sleep(page, 120); await pTap(page, 1, 'A'); await sleep(page, 200);
  ok(await ev(h => window.G.state.heroes[h].equipment.weapon?.wtype === 'staff', p2hero), 'a sword stays in the bag for Moka');
  await shot('08-p2-sword-refused');

  // ---- four panes
  await pTap(page, 2, 'Menu'); await sleep(page, 130); await shot('09-three-gliding');
  await wf(() => window.G.coop.slots[2].pane === 'bag'); await sleep(page, 450);
  await shot('10-three');
  await pTap(page, 3, 'Menu'); await wf(() => window.G.coop.slots[3].pane === 'bag'); await sleep(page, 500);
  await shot('11-four');
  const all = await Promise.all([1, 2, 3, 4].map(paneOf));
  ok(all.every(p => p && p.kind === 'wide'), `four panes: wide, k=${all.map(p => p?.k?.toFixed(3)).join(',')}`);
  console.log('rects', JSON.stringify(all.map(p => p.rect)));

  // ---- P2 picks up the outfit (cell 2) and carries it; P3's pane shows P2's marker and the lifted cell
  await ev(() => { const M = window.G.coop.panes.mgr, P = M.panes.get(window.G.coop.slots[1]); P.cur = { z: 'grid', x: 2, y: 0 }; P.curDirty = true; });
  await sleep(page, 100);
  const outfit = await ev(() => window.G.state.inventory[2]?.uid);
  await pTap(page, 1, 'Y'); await sleep(page, 120);
  await pTap(page, 1, 'DDown'); await sleep(page, 140); await pTap(page, 1, 'DDown'); await sleep(page, 140);
  await pTap(page, 1, 'DRight'); await sleep(page, 260);
  await shot('12-p2-carrying');
  const mk3 = await ev(() => { const M = window.G.coop.panes.mgr, P = M.panes.get(window.G.coop.slots[2]), m = P.marks.get(2); return m ? { on: m.classList.contains('on'), holding: m.classList.contains('holding') } : null; });
  ok(mk3?.on && mk3.holding, "P3's pane shows P2's cursor (holding)");
  await pTap(page, 1, 'A'); await sleep(page, 300);
  const moved = await ev(u => window.G.state.inventory.findIndex(x => x?.uid === u), outfit);
  ok(moved === 23, `P2 put the outfit down at cell 23 (got ${moved})`);
  const p3sees = await ev(u => { const M = window.G.coop.panes.mgr, P = M.panes.get(window.G.coop.slots[2]); const c = P.cells[23]; return !c.classList.contains('cov') && c.querySelector('img') && c.classList.contains('span'); }, outfit);
  ok(p3sees, "P3's pane shows the outfit's new place live");
  await shot('13-p2-placed');

  // ---- a hold another player takes: P3 picks up the hat P2 holds... P2 holds the hat, P3 equips it
  await ev(() => { const M = window.G.coop.panes.mgr, P2 = M.panes.get(window.G.coop.slots[1]); P2.cur = { z: 'grid', x: 4, y: 0 }; P2.curDirty = true; });
  await sleep(page, 80); await pTap(page, 1, 'Y'); await sleep(page, 120);
  await ev(() => { const M = window.G.coop.panes.mgr, P3 = M.panes.get(window.G.coop.slots[2]); P3.cur = { z: 'grid', x: 4, y: 0 }; P3.curDirty = true; });
  await sleep(page, 80); await pTap(page, 2, 'A'); await sleep(page, 140);
  await shot('14-hold-taken');
  ok((await paneOf(2)).hold === null, "P2's hold let go when P3 took the hat");

  // ---- drop (X) by P4: the charm at cell 8
  await ev(() => { const M = window.G.coop.panes.mgr, P = M.panes.get(window.G.coop.slots[3]); P.cur = { z: 'grid', x: 8, y: 0 }; P.curDirty = true; });
  await sleep(page, 80);
  const charm = await ev(() => window.G.state.inventory[8]?.uid);
  await pTap(page, 3, 'X'); await sleep(page, 90); await shot('15-p4-drop');
  await sleep(page, 900);
  const gone = await ev(u => !window.G.state.inventory.some(x => x?.uid === u), charm);
  ok(gone, 'P4 dropped the charm');
  const ground = await ev(u => { const G = window.G, e = G.villageLoot.list.find(x => x.d?.item?.uid === u); if (!e) return null; const C = G.coop, p4 = C.slots[3].body.pos, p1 = G.player.pos; return { d4: Math.hypot(e.to.x - p4.x, e.to.z - p4.z), d1: Math.hypot(e.to.x - p1.x, e.to.z - p1.z) }; }, charm);
  ok(ground && ground.d4 < 1.8, `the charm lies at P4's hero (${ground && ground.d4.toFixed(2)} m from P4, ${ground && ground.d1.toFixed(2)} m from P1)`);

  // ---- stats on P2
  await ev(h => { const G = window.G; G.state.heroes[h].player.statPts = 5; G.state.heroes[h].player.skillPts = 3; G.state.heroes[h].player.lvl = 3; }, p2hero);
  await ev(() => window.G.events.emit('stats:changed', {}));
  await pTap(page, 1, 'RB'); await sleep(page, 120); await shot('16-p2-stats-sliding');
  await sleep(page, 300);
  const str0 = await ev(h => window.G.state.heroes[h].player.stats.str, p2hero);
  await pTap(page, 1, 'A'); await sleep(page, 200);
  ok(await ev(([h, s]) => window.G.state.heroes[h].player.stats.str === s + 1 && window.G.state.heroes[h].player.statPts === 4, [p2hero, str0]), 'P2 spent a stat point on Strength');
  await shot('17-p2-stats');
  // Shadow's auto points (docs/STATS.md §3): X spends what's waiting, Y switches them off and on, for P2's hero only
  ok(await ev(() => { const M = window.G.coop.panes.mgr, P = M.panes.get(window.G.coop.slots[1]); return /Power/.test(P.derEl.textContent) && /Luck/.test(P.derEl.textContent); }), "P2's Stats: Power and the friendly numbers");
  await pTap(page, 1, 'X'); await sleep(page, 200);
  ok(await ev(h => window.G.state.heroes[h].player.statPts === 0, p2hero), 'P2: X, Shadow picks the 4 points left');
  await pTap(page, 1, 'Y'); await sleep(page, 200);
  ok(await ev(h => window.G.state.heroes[h].player.autoStats === false && window.G.state.heroes[window.G.coop.heroOf(window.G.coop.p1)].player.autoStats !== false, p2hero), "P2: Y, Shadow's auto points off for P2's hero (not P1's)");
  await pTap(page, 1, 'Y'); await sleep(page, 200);
  ok(await ev(h => window.G.state.heroes[h].player.autoStats === true, p2hero), 'P2: Y again, back on');
  // ---- skills on P2: learn the first, then put it on the hotbar
  await pTap(page, 1, 'RB'); await sleep(page, 400);
  const sk = await ev(h => ({ ...window.G.state.heroes[h].player.skills }), p2hero);
  await pTap(page, 1, 'A'); await sleep(page, 200);
  const sk2 = await ev(h => ({ ...window.G.state.heroes[h].player.skills, pts: window.G.state.heroes[h].player.skillPts }), p2hero);
  ok(sk2.pts === 2, `P2 learned a skill (${JSON.stringify(sk)} → ${JSON.stringify(sk2)})`);
  await shot('18-p2-skills');
  await pTap(page, 1, 'Y'); await sleep(page, 200); await shot('19-p2-assign');
  await pTap(page, 1, 'DRight'); await sleep(page, 120); await pTap(page, 1, 'A'); await sleep(page, 200);
  console.log('hotbar', JSON.stringify(await ev(h => window.G.state.heroes[h].player.hotbar, p2hero)));

  // ---- P3 closes (B): the others glide into place
  await pTap(page, 2, 'B'); await sleep(page, 130); await shot('20-p3-closing');
  await wf(() => !window.G.coop.slots[2].pane); await sleep(page, 500);
  await shot('21-three-left');
  // ---- P4 leaves from the pane: View, then A
  await pTap(page, 3, 'View'); await sleep(page, 300); await shot('22-p4-leave-confirm');
  await pTap(page, 3, 'A'); await wf(() => window.G.coop.slots.length === 3); await sleep(page, 500);
  ok(true, 'P4 left from the pane');
  await shot('23-after-leave');
  // ---- P1: View = the game menu
  await pTap(page, 0, 'View'); await sleep(page, 400);
  ok(await ev(() => !window.G.coop.p1.pane && (window.G.ui.isOpen('menu') || window.G.ui.padMenu?.active)), "P1's View: the game menu");
  await shot('24-p1-menu');
  await pTap(page, 0, 'Menu'); await sleep(page, 300);
  // ---- P2 Menu closes
  await pTap(page, 1, 'Menu'); await wf(() => !window.G.coop.slots[1].pane); await sleep(page, 400);
  // ---- P1 on the keyboard: I opens the pane, the arrows move, Enter equips, C goes to Stats, Esc closes; a click on a tab
  await page.mouse.move(5, 5);
  await page.keyboard.press('i'); await wf(() => window.G.coop.p1.pane === 'bag'); await sleep(page, 450);
  ok(await ev(() => !window.G.ui.isOpen('inventory')), "I opens P1's pane, not the classic bag");
  const cur0 = await paneOf(1);
  await page.keyboard.press('ArrowRight'); await sleep(page, 120);
  const cur1 = await paneOf(1);
  ok(JSON.stringify(cur0.cur) !== JSON.stringify(cur1.cur), `the arrows move P1's cursor ${JSON.stringify(cur0.cur)} → ${JSON.stringify(cur1.cur)}`);
  await shot('25-p1-keyboard');
  await page.keyboard.press('c'); await sleep(page, 300);
  ok((await paneOf(1)).tab === 'stats', 'C: the Stats tab');
  const tabXY = await ev(() => { const P = window.G.coop.panes.mgr.panes.get(window.G.coop.p1), b = P.el.querySelector('.cp-tab[data-t="skills"]').getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; });
  await page.mouse.click(tabXY[0], tabXY[1]); await sleep(page, 350);
  ok((await paneOf(1)).tab === 'skills', 'a click on Skills');
  await shot('26-p1-skills-mouse');
  await page.keyboard.press('Escape'); await wf(() => !window.G.coop.p1.pane); await sleep(page, 300);
  ok(await ev(() => !window.G.ui.isOpen('menu')), 'Esc closed the pane (not the menu)');
  await page.keyboard.press('Escape'); await sleep(page, 300);
  ok(await ev(() => window.G.ui.isOpen('menu')), 'Esc again: the game menu');
  await page.keyboard.press('Escape'); await sleep(page, 300);
  ok(await ev(() => window.G.coop.slots.every(s => !s.pane) && !window.G.player.paneOpen), 'all panes closed');
} catch (e) { errors.push('[harness] ' + e.stack); await shot('zz-error'); }
const failed = R.finish(errors, []);
await browser.close();
process.exit(failed ? 1 : 0);
