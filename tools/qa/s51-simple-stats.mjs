// Scenario 51: simple stats for young players (docs/STATS.md, ROADMAP UX-3). Shadow picks the points at a level up (a
// toast says where they went); the Character panel's Power, six big numbers, the star attribute, the auto switch, Pick
// for me, the free Start over and the "All the numbers" drawer (remembered); the bag's green arrow on a better piece,
// gone once it's worn; the item tooltip's Power box (better / worse / empty / another hero's), plain words, Shift for
// the details, Settings › Item details; and on a controller L3 for the details.
//   usage: node tools/qa/s51-simple-stats.mjs [W H]   SHOTS=1 saves frames to tools/qa/tmp/s51/.
import fs from 'node:fs';
import { launch, boot, sleep, makeReport } from './lib.mjs';
import { installPad, padTap, padReset } from './pad-lib.mjs';

const W = +(process.argv[2] || 1280), H = +(process.argv[3] || 800);
const SHOTS = !!process.env.SHOTS, OUT = `tools/qa/tmp/s51/${W}x${H}`; if (SHOTS) fs.mkdirSync(OUT, { recursive: true });
const R = makeReport(`S51 simple stats at ${W}×${H}: Shadow picks, Power, the six numbers, Start over, the drawer, green arrows, simple tooltips, Shift and L3 details`);
const { browser, page, errors } = await launch({ w: W, h: H });
page.on('response', r => { if (r.status() >= 400) console.log('  ....  HTTP', r.status(), r.url()); });
const ev = (f, a) => page.evaluate(f, a);
const ok = (c, m) => R.check(m, c);
const shot = n => (SHOTS ? page.screenshot({ path: `${OUT}/${n}.png` }) : null);
const wf = (f, a, t = 5000) => page.waitForFunction(f, a, { timeout: t, polling: 'raf' });
const tipText = () => ev(() => { const w = document.querySelector('.tt-wrap'); return w?.classList.contains('show') ? w.querySelector('.tt').innerHTML : ''; });
const slotOf = uid => ev(u => { const G = window.G, k = G.state.inventory.findIndex(x => x && x.uid === u); const s = document.querySelector(`.p-inv .slot[data-c="inv"][data-i="${k}"]`); if (!s) return null; const r = s.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, upg: s.classList.contains('upg') }; }, uid);
const hover = async p => { await page.mouse.move(p.x - 60, p.y); await sleep(page, 60); await page.mouse.move(p.x, p.y); await wf(() => document.querySelector('.tt-wrap')?.classList.contains('show')); await sleep(page, 120); };
try {
  await boot(page, 'fresh&nointro&notut&noarrive&hour=10');
  await page.waitForFunction(() => window.G?.mode === 'village' && window.G.player?.rig, null, { timeout: 40000 });
  await ev(() => { const G = window.G; G.state.flags.hints = { all: true }; });

  // ---- a level up: Shadow picks the points, and a toast says where they went
  const lv = await ev(() => { const G = window.G, P = G.state.player, b = { ...P.stats }; G.actions.addXp(3000); return { lvl: P.lvl, pts: P.statPts, gained: Object.keys(b).reduce((a, k) => a + P.stats[k] - b[k], 0) }; });
  ok(lv.lvl > 1 && lv.pts === 0 && lv.gained === (lv.lvl - 1) * 5, `level ${lv.lvl}: Shadow spent all ${lv.gained} points, none left waiting`);
  await wf(() => [...document.querySelectorAll('.toasts > *')].some(t => /Shadow picked your points/.test(t.textContent)), null, 4000).then(() => ok(true, 'the "Shadow picked your points!" toast'), () => ok(false, 'the "Shadow picked your points!" toast'));
  await page.waitForFunction(() => { const B = window.G.ui.banners; return !B.busy && !B.q.length; }, null, { timeout: 30000, polling: 250 });

  // ---- the Character panel
  await ev(() => window.G.ui.open('character')); await sleep(page, 600);
  await shot('01-character');
  const ch = await ev(() => {
    const q = s => document.querySelector('.p-char ' + s);
    return { pow: +q('.ch-pow b').textContent.replace(/\D/g, ''), tiles: [...document.querySelectorAll('.p-char .ch-tile')].map(t => [t.dataset.k, t.querySelector('.ct-v').textContent]), auto: q('.ch-auto').classList.contains('on'),
      main: q('.attr.main')?.dataset.k, fx: q('.attr[data-k="str"] .at-fx').textContent, drawer: getComputedStyle(q('.dgroups')).display, plus: getComputedStyle(q('.attr[data-k="str"] .at-plus')).display };
  });
  ok(ch.pow > 50, `Power ${ch.pow}`);
  ok(ch.tiles.length === 6 && ch.tiles.map(t => t[0]).join() === 'attack,life,zoom,defense,speed,luck' && ch.tiles.every(t => /\d/.test(t[1])), `the six numbers ${ch.tiles.map(t => t.join(' ')).join(', ')}`);
  ok(ch.auto && ch.plus === 'none', 'Shadow picks: on, no + buttons (nothing waiting)');
  ok(ch.main === 'str' && /Katana hits harder/.test(ch.fx), `Chewy's star attribute: Strength ("${ch.fx}")`);
  ok(ch.drawer === 'none', '"All the numbers" starts closed');

  // auto off: the points wait, Pick for me, + spends one, Start over
  await page.click('.p-char .ch-auto'); await sleep(page, 200);
  await ev(() => window.G.actions.addXp(4000)); await sleep(page, 400);
  const w = await ev(() => ({ pts: window.G.state.player.statPts, auto: window.G.state.player.autoStats, plus: getComputedStyle(document.querySelector('.p-char .attr[data-k="vit"] .at-plus')).display, banner: document.querySelector('.p-char .ch-pts').classList.contains('on') }));
  ok(w.auto === false && w.pts > 0 && w.plus !== 'none' && w.banner, `auto off: ${w.pts} points wait, the + buttons and the banner show`);
  await shot('02-manual');
  const v0 = await ev(() => window.G.state.player.stats.vit);
  await page.click('.p-char .attr[data-k="vit"] .at-plus'); await sleep(page, 150);
  ok(await ev(v => window.G.state.player.stats.vit === v + 1, v0), '+ spends a point on Vitality');
  await page.click('.p-char .ch-pick'); await sleep(page, 300);
  ok(await ev(() => window.G.state.player.statPts === 0), 'Pick for me: Shadow spends the rest');
  const before = await ev(() => { const P = window.G.state.player; return { coins: window.G.state.coins, sum: Object.values(P.stats).reduce((a, b) => a + b, 0) }; });
  await page.click('.p-char .ch-reset'); await sleep(page, 300);
  const after = await ev(() => { const P = window.G.state.player; return { coins: window.G.state.coins, pts: P.statPts, sum: Object.values(P.stats).reduce((a, b) => a + b, 0) }; });
  ok(after.pts > 0 && after.sum + after.pts === before.sum && after.coins === before.coins, `Start over: ${after.pts} points back, free`);
  await page.click('.p-char .ch-auto'); await sleep(page, 300);
  ok(await ev(() => window.G.state.player.statPts === 0 && window.G.state.player.autoStats === true), 'auto back on: Shadow places them again');

  // the drawer, remembered
  await page.click('.p-char .ch-more'); await sleep(page, 500);
  const dr = await ev(() => ({ disp: getComputedStyle(document.querySelector('.p-char .dgroups')).display, rows: document.querySelectorAll('.p-char .dgroups .dr').length, set: window.G.ui.settings.statsAll, names: [...document.querySelectorAll('.p-char .dgroups .dr-n')].map(e => e.textContent).join('|') }));
  ok(dr.disp !== 'none' && dr.rows >= 18 && dr.set === true, `All the numbers: open (${dr.rows} rows), and remembered`);
  ok(!/Crit|Resist|Magic find|Life steal/.test(dr.names) && /Big hit chance/.test(dr.names), 'the drawer in plain words too');
  await shot('03-drawer');
  await ev(() => { window.G.ui.close('character'); }); await sleep(page, 300);
  await ev(() => window.G.ui.open('character')); await sleep(page, 400);
  ok(await ev(() => getComputedStyle(document.querySelector('.p-char .dgroups')).display !== 'none'), 'the drawer is still open next time');
  await page.click('.p-char .ch-more'); await sleep(page, 200);
  await ev(() => window.G.ui.close('character')); await sleep(page, 300);

  // ---- the bag: green arrows, simple tooltips, Shift, the setting
  const items = await ev(async () => {
    const G = window.G, A = G.actions, M = await G.qaModule('items'), lvl = G.state.player.lvl;
    G.state.inventory.fill(null); G.state.equipment.hat = null; G.state.equipment.boots = null;
    const mk = o => { const it = M.generateItem({ ilvl: lvl, ...o }); it.req = { lvl: 1 }; A.pickup(it); return it; };
    const hat = mk({ slot: 'hat', rarity: 'rare' });
    const cur = G.state.equipment.weapon, weak = mk({ slot: 'weapon', wtype: 'sword', rarity: 'normal' }); weak.dmg = [1, 2]; weak.affixes = [];
    const staff = mk({ slot: 'weapon', wtype: 'staff', rarity: 'magic' });
    G.events.emit('inv:changed', { c: 'inv' }); A.recompute();
    return { hat: hat.uid, weak: weak.uid, staff: staff.uid, cur: cur?.name };
  });
  await ev(() => window.G.ui.open('inventory')); await sleep(page, 700);
  const sh = await slotOf(items.hat), sw = await slotOf(items.weak), ss = await slotOf(items.staff);
  ok(sh?.upg && !sw?.upg && !ss?.upg, 'the green arrow: on the hat (nothing on the head), not on a weaker katana or Moka\'s staff');
  await hover(sh);
  let t = await tipText();
  ok(/tt-pow v-empty/.test(t) && /Power/.test(t) && /wear it/.test(t) && !/iLvl/.test(t), 'the hat\'s tooltip: simple, Power, "Nothing on there: wear it!"');
  ok(!/Resist|Critical|Enhanced|Replenish|Magic Items/.test(t), 'its bonuses in plain words');
  await shot('04-tip-simple');
  await page.keyboard.down('Shift'); await sleep(page, 200);
  t = await tipText();
  ok(/iLvl/.test(t) && /Power/.test(t), 'Shift held: the details (and Power still on top)');
  await shot('05-tip-shift');
  await page.keyboard.up('Shift'); await sleep(page, 200);
  ok(!/iLvl/.test(await tipText()), 'Shift let go: simple again');
  await hover(sw); t = await tipText();
  ok(/v-worse/.test(t) && /Not as good/.test(t) && /vs\. your/.test(t), 'the weaker katana: "Not as good", against your own');
  await hover(ss); t = await tipText();
  ok(/Moka's weapon/.test(t), 'Moka\'s staff (she hasn\'t joined): "Moka\'s weapon"');
  await ev(() => window.G.ui.setSetting('itemTips', 1)); await hover(sh);
  ok(/iLvl/.test(await tipText()), 'Settings › Item details: Full shows every number');
  await ev(() => window.G.ui.setSetting('itemTips', 0));
  // wear the hat (right-click): its arrow goes
  await page.mouse.click(sh.x, sh.y, { button: 'right' }); await sleep(page, 400);
  ok(await ev(u => window.G.state.equipment.hat?.uid === u, items.hat), 'right-click wore the hat');
  ok(!(await ev(() => !!document.querySelector('.p-inv .slot[data-c="inv"].upg'))), 'no green arrows left once it\'s worn');
  await page.mouse.move(20, H / 2); await sleep(page, 200);

  // ---- a controller: L3 on a piece of gear shows the details, again hides them
  await installPad(page); await padTap(page, 'DDown'); await sleep(page, 300);
  await ev(() => window.G.ui.close('inventory')); await sleep(page, 200);
  await ev(async () => { const G = window.G, M = await G.qaModule('items'); G.state.inventory.fill(null); const it = M.generateItem({ ilvl: 5, slot: 'boots', rarity: 'magic' }); it.req = { lvl: 1 }; G.actions.pickup(it); G.events.emit('inv:changed', { c: 'inv' }); });
  await padTap(page, 'DDown'); await ev(() => window.G.ui.open('inventory')); await sleep(page, 700);
  await ev(() => { const N = window.G.ui.padNav, s = document.querySelector('.p-inv .slot[data-c="inv"].has'); if (N.cur !== s) N.focus(s); }); await sleep(page, 200); // (onto the boots: the bag remembers its last focus)
  await wf(() => document.querySelector('.pad-ring.on') && document.querySelector('.tt-wrap.show'), null, 5000).catch(() => {});
  const p0 = await ev(() => ({ foc: window.G.ui.padNav.cur?.className || '', tip: document.querySelector('.tt-wrap.show .tt')?.innerHTML || '', hints: document.querySelector('.pad-hints')?.textContent || '' }));
  ok(/slot/.test(p0.foc) && /Power/.test(p0.tip) && !/iLvl/.test(p0.tip), `the pad's focus on the boots: a simple tooltip (${p0.foc.slice(0, 40)})`);
  ok(/Details/.test(p0.hints), `the footer names L3 Details ("${p0.hints.slice(0, 80)}")`);
  await shot('06-pad-simple');
  await padTap(page, 'L3'); await sleep(page, 250);
  ok(/iLvl/.test(await tipText()), 'L3: the details');
  await shot('07-pad-l3');
  await padTap(page, 'L3'); await sleep(page, 250);
  ok(!/iLvl/.test(await tipText()), 'L3 again: simple');
  await padReset(page);
} catch (e) { errors.push('[harness] ' + e.stack); await shot('zz-error'); }
const failed = R.finish(errors, []);
await browser.close();
process.exit(failed ? 1 : 0);
