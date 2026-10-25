// Scenario 53: an expedition's Receive rewards (docs/COZY.md §4.5). A crew home from a job holds its haul in the report:
// nothing reaches the purse, the materials or the bag until you press Receive rewards on the board (the XP and the
// world's changes still come at once). The chip and the board show a "!" while a haul waits; the button gives it all
// (the chips fly to the purse and the bag); a full bag keeps the items in the report (Take all); a haul survives a save
// and reload and the report list's trim; Enter and the pad's A press it; the away card's link says "Get rewards".
// Shots: tools/qa/tmp/exp-rewards/*.png.  node tools/qa/s53-expedition-rewards.mjs
import fs from 'node:fs';
import { launch, boot, sleep, makeReport } from './lib.mjs';
import { installPad, padTap } from './pad-lib.mjs';

const R = makeReport('S53 expedition rewards');
const OUT = 'tools/qa/tmp/exp-rewards'; fs.mkdirSync(OUT, { recursive: true });
const { browser, page, errors, warns } = await launch();
const ev = (fn, a) => page.evaluate(fn, a);
const purse = () => ev(() => { const S = window.G.state; return { coins: S.coins, mats: { ...S.materials }, pantry: { ...S.pantry }, bag: S.inventory.filter(Boolean).length, furn: Object.values(S.furniture || {}).reduce((a, n) => a + n, 0) }; });
const matSum = m => Object.values(m || {}).reduce((a, n) => a + n, 0);
// Moka joins, levelled for a sure thing, and the clock's crews come home on demand
async function crew() {
  await ev(() => { const G = window.G, S = G.state; G.actions.prepareJoin?.('moka'); S.flags.mokaJoined = true; S.heroes.moka.player.lvl = 30; G.heroes.spawnBench?.(); for (const k in S.cozy.exp.tired) delete S.cozy.exp.tired[k]; });
}
// send Moka on the first open errand and bring her straight home → the report
async function trip() {
  await crew();
  const id = await ev(() => { const G = window.G, o = G.cozy.exp.objectives('errands').find(x => G.cozy.exp.info(x.id, ['hero:moka'], {})?.ok); if (!o) return null; G.cozy.exp.send(o.id, ['hero:moka'], {}); return o.id; });
  await ev(() => window.G.cozy.exp.finishAll());
  await page.waitForFunction(() => window.G.cozy.exp.list().length === 0, null, { timeout: 10000 });
  return { id, rep: await ev(() => { const r = window.G.cozy.exp.reports().at(-1); return r && { uid: r.uid, pending: !!r.pending, loot: r.loot, items: r.items.length, xp: r.xp }; }) };
}
const view = () => ev(() => { const B = document.querySelector('.p-exp'); return { open: window.G.ui.isOpen('expeditions'), view: window.G.ui.panels.expeditions.view, claim: !!B?.querySelector('.ex-claim'), claimText: B?.querySelector('.ex-claim')?.innerText.replace(/\s+/g, ' ').trim() || '', got: !!B?.querySelector('.ex-got'), gift: !!B?.querySelector('.ex-repc .ex-gift'), wait: !!B?.querySelector('.ex-wait'), tab: B?.querySelector('[data-v="reports"] .ex-new')?.textContent || '' }; });

try {
  await boot(page, 'fresh&nointro&notitle');
  await ev(() => { const G = window.G; G.ui.closeAll?.(); G.state.coins = 100; });

  // ---- a crew comes home: the haul waits
  const p0 = await purse();
  const t1 = await trip();
  const p1 = await purse();
  const mark = await ev(() => ({ chip: document.querySelector('.hud .cz-chip')?.innerText.replace(/\s+/g, ' ').trim() || '', bang: !!document.querySelector('.hud .cz-chip.on .cz-bang'), pending: window.G.cozy.exp.pending() }));
  R.check('a) a crew home from an errand: the report holds the haul (coins and materials), none of it in the purse or the materials yet; the XP came at once', !!t1.id && t1.rep?.pending && t1.rep.loot.coins > 0 && matSum(t1.rep.loot.mats) > 0 && p1.coins === p0.coins && matSum(p1.mats) === matSum(p0.mats) && (t1.rep.xp['hero:moka'] || 0) > 0, JSON.stringify({ t1, p0: p0.coins, p1: p1.coins, m0: matSum(p0.mats), m1: matSum(p1.mats) }));
  R.check('a) the HUD chip stays up with the "!" while a haul waits', mark.bang && mark.pending === 1, JSON.stringify(mark));

  // ---- the board: the chip opens the report with Receive rewards
  await ev(() => window.G.cozy.exp.read(window.G.cozy.exp.reports().at(-1).uid)); // (read, but not received: the "!" stays)
  const still = await ev(() => ({ bang: window.G.cozy.board?.mark ?? null, chip: !!document.querySelector('.hud .cz-chip.on') }));
  await ev(() => document.querySelector('.hud .cz-chip')?.click());
  await page.waitForFunction(() => window.G.ui.isOpen('expeditions'), null, { timeout: 5000 });
  await sleep(page, 500);
  const v1 = await view();
  await page.screenshot({ path: `${OUT}/report-pending.png` });
  R.check('b) read but not received, the chip stays up; it opens the board on the report, with the gift on its card, the tab\'s badge and Receive rewards naming the haul', still.chip && v1.open && v1.view === 'reports' && v1.claim && v1.gift && v1.tab === '1' && /Receive rewards/.test(v1.claimText) && /coins/.test(v1.claimText), JSON.stringify({ still, v1 }));

  // ---- Receive rewards
  await ev(() => document.querySelector('.p-exp .ex-claim').click());
  await sleep(page, 120);
  const fly = await ev(() => document.querySelectorAll('.fly').length);
  await sleep(page, 900);
  const p2 = await purse();
  const v2 = await view();
  await page.screenshot({ path: `${OUT}/report-received.png` });
  const rep2 = await ev(() => { const r = window.G.cozy.exp.reports().at(-1); return { pending: !!r.pending }; });
  R.check('c) Receive rewards: the coins into the purse and every material in, exactly the report\'s haul; the report says Received, no button, no gift; the chip\'s "!" goes', p2.coins === p1.coins + t1.rep.loot.coins && Object.entries(t1.rep.loot.mats).every(([k, n]) => (p2.mats[k] || 0) === (p1.mats[k] || 0) + n) && !rep2.pending && v2.got && !v2.claim && !v2.gift && !v2.tab && !(await ev(() => !!document.querySelector('.hud .cz-chip.on .cz-bang'))), JSON.stringify({ c: [p1.coins, p2.coins, t1.rep.loot.coins], mats: Object.keys(t1.rep.loot.mats).map(k => [k, p1.mats[k] || 0, p2.mats[k] || 0, t1.rep.loot.mats[k]]), v2, rep2, bang: await ev(() => document.querySelector('.hud .cz-chip')?.innerText) }));
  R.check('c) the chips fly off to the purse and the bag', fly > 0, `flyers ${fly}`);
  const again = await ev(uid => window.G.cozy.exp.claim(uid), t1.rep.uid);
  R.check('c) a haul is received once (a second claim gives nothing)', again === null && (await purse()).coins === p2.coins, JSON.stringify({ again }));
  await ev(() => window.G.ui.closeAll?.());

  // ---- items, a full bag, a find and a keepsake (a report written by hand: errands rarely bring items)
  const made = await ev(async () => {
    const G = window.G, S = G.state, { generateItem } = await import('/src/rpg/items.js');
    const items = [generateItem({ ilvl: 5, rarity: 'magic' }), generateItem({ ilvl: 5, rarity: 'rare' })];
    const E = S.cozy.exp, uid = 'x' + E.seq++;
    E.reports.push({ uid, obj: 'test', name: 'A test haul', kind: 'errand', result: 'success', crew: ['hero:moka'], loot: { coins: 40, mats: { wood: 3 }, pantry: {}, items: items.map(it => ({ name: it.name, rarity: it.rarity, uid: it.uid })), furniture: null, trophy: 'trophyMochiCrown' }, xp: {}, levels: {}, lines: [], items, note: '', progress: null, read: true, at: G.cozy.clock.h, hours: 2, pending: true });
    // a full bag (pickup refuses, as the real one does when there's no room)
    window.__pickup = G.actions.pickup; G.actions.pickup = () => false;
    G.ui.open('expeditions', { view: 'reports', report: uid });
    return { uid, furn0: S.furniture?.trophyMochiCrown || 0 };
  });
  await sleep(page, 400);
  const p3 = await purse();
  // Enter presses it
  await page.keyboard.press('Enter');
  await sleep(page, 600);
  const r4 = await ev(uid => { const G = window.G, r = G.cozy.exp.reports().find(x => x.uid === uid); return { pending: !!r.pending, waiting: r.items.length, trophy: G.state.furniture?.trophyMochiCrown || 0 }; }, made.uid);
  const v4 = await view();
  const p4 = await purse();
  await page.screenshot({ path: `${OUT}/report-bag-full.png` });
  R.check('d) Enter receives it; a full bag: the coins, the wood and the keepsake come in, the items wait in the report with Take all', !r4.pending && r4.waiting === 2 && r4.trophy === made.furn0 + 1 && p4.coins === p3.coins + 40 && (p4.mats.wood || 0) === (p3.mats.wood || 0) + 3 && v4.wait && v4.got, JSON.stringify({ r4, v4, c: [p3.coins, p4.coins] }));
  R.check('d) a report still holding items keeps the chip\'s "!" (Take all is still to do)', await ev(() => window.G.cozy.exp.pending() === 1 && !!document.querySelector('.hud .cz-chip.on .cz-bang')), '');
  await ev(() => { window.G.actions.pickup = window.__pickup; });
  await ev(() => document.querySelector('.p-exp .ex-wait [data-a="take"]')?.click());
  await sleep(page, 300);
  const r5 = await ev(uid => ({ waiting: window.G.cozy.exp.reports().find(x => x.uid === uid).items.length, pending: window.G.cozy.exp.pending() }), made.uid);
  R.check('d) room again: Take all puts the items in the bag; nothing waits any more', r5.waiting === 0 && r5.pending === 0, JSON.stringify(r5));
  await ev(() => window.G.ui.closeAll?.());

  // ---- a haul survives a save and a reload, and the report list's trim
  const t6 = await trip();
  const kept = await ev(async uid => {
    const G = window.G, S = G.state, E = S.cozy.exp;
    for (let i = 0; i < 30; i++) E.reports.push({ uid: 'f' + i, obj: 'test', name: 'Filler', kind: 'errand', result: 'success', crew: ['hero:moka'], loot: {}, xp: {}, levels: {}, lines: [], items: [], note: '', progress: null, read: true, at: 1, hours: 1 });
    const { normalizeCozy } = await import('/src/cozy/state.js'); normalizeCozy(S);
    G.save();
    return { n: E.reports.length, has: !!E.reports.find(r => r.uid === uid)?.pending };
  }, t6.rep.uid);
  await ev(() => { window.G.saveBlocked = true; }); // (the save above is the one to load: no unload save over it)
  await boot(page, 'nointro&notitle');
  const after = await ev(uid => { const r = window.G.cozy.exp.reports().find(x => x.uid === uid); return { pending: !!r?.pending, n: window.G.cozy.exp.reports().length }; }, t6.rep.uid);
  R.check('e) the report list trims to 24 but keeps a haul still waiting (the oldest unclaimed survives 30 newer reports), and a reload keeps it waiting', t6.rep.pending && kept.has && kept.n === 24 && after.pending, JSON.stringify({ kept, after }));

  // ---- the pad: focus lands on Receive rewards, its hint says Receive, A presses it
  await installPad(page);
  await ev(() => { const G = window.G; G.ui.closeAll?.(); });
  await padTap(page, 'A'); await sleep(page, 300); // (the pad becomes the device)
  await ev(() => window.G.ui.open('expeditions', { view: 'reports' }));
  await page.waitForFunction(() => window.G.controls.device === 'pad' && !!document.querySelector('.pad-ring.on') && window.G.ui.padNav.cur?.matches?.('.ex-claim'), null, { timeout: 8000 }).catch(() => {});
  const pad = await ev(() => ({ focus: !!window.G.ui.padNav.cur?.matches?.('.ex-claim'), hint: document.querySelector('.pad-hints')?.textContent || '' }));
  await page.screenshot({ path: `${OUT}/report-pad.png` });
  const c0 = (await purse()).coins;
  await padTap(page, 'A');
  await page.waitForFunction(c => window.G.state.coins > c, c0, { timeout: 5000 }).catch(() => {});
  const c1 = (await purse()).coins;
  R.check('f) the pad: Receive rewards is where the focus starts, its hint says Receive; A receives the haul', pad.focus && /Receive/.test(pad.hint) && c1 > c0 && !(await ev(uid => !!window.G.cozy.exp.reports().find(x => x.uid === uid)?.pending, t6.rep.uid)), JSON.stringify({ pad, c0, c1 }));

  // ---- the away card's link
  await ev(() => window.G.ui.closeAll?.());
  const t7 = await trip();
  const aw = await ev(uid => { const G = window.G; G.ui.closeAll?.(); G.ui.open('awayCard', { ms: 3600e3, hours: 3, reports: [G.cozy.exp.reports().find(r => r.uid === uid)], out: [], refills: [], guild: [] }); return document.querySelector('.p-away [data-rep]')?.innerText.trim() || ''; }, t7.rep.uid);
  await page.waitForFunction(() => window.G.ui.isOpen('awayCard') && !window.G.ui.isOpen('expeditions'), null, { timeout: 5000 }).catch(() => {}); await sleep(page, 700);
  await page.screenshot({ path: `${OUT}/away-card.png` });
  R.check('g) the away card: a crew whose haul waits says "Get rewards", and opens its report', aw === 'Get rewards', aw);
} catch (e) { errors.push('[harness] ' + e.stack); }
const failed = R.finish(errors, warns);
await browser.close();
process.exit(failed ? 1 : 0);
