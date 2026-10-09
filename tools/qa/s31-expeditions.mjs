// s31: expeditions, the cozy path's phase A (docs/COZY.md §4, §9, §10; ROADMAP CZ-1, CZ-2).
//   a) the cozy route end to end, with no fighting and no debug unlocks (only the clock is skipped): a fresh game, Moka
//      joins by her own scene, turnips grown and cooked into lunches, Moka levelled on errands sent from the Board by
//      clicks until Bamboo opens (any hero at level 4), then Takemori relieved by Moka alone with a packed lunch; the
//      village saved by the crew; the arrival in Bamboo: the celebration banner, the saved village, its buildings open
//   b) the away hero: off the bench and the Tab target, greyed in the wheel and the HUD's minis, "away" to switch to
//   c) the hold rule: a relief that comes back while you're in Bamboo waits for you to leave; "You beat us to it!"
//   d) time away (a stubbed Date.now): a normal absence, the 8 h cap, a backwards clock (0), the away card; an old save
//      (no cozy state) loads with 0 hours away; a saved expedition whose hero is now being played comes home
//   e) the pad (Y best crew, A send) and the phone (two columns, 44 px targets, the 12 px floor), with shots of the
//      Board, the chip, the report and the away card → tools/qa/tmp/s31-expeditions/
//   usage: node tools/qa/s31-expeditions.mjs
import fs from 'node:fs';
import { launch, boot, sleep, waitIdle, waitMode, drainDialogue, makeReport, BASE } from './lib.mjs';
import { installPad, padTap } from './pad-lib.mjs';
import { launchTouch } from './touch-lib.mjs';

const OUT = new URL('./tmp/s31-expeditions/', import.meta.url); fs.mkdirSync(OUT, { recursive: true });
const shot = (page, n) => page.screenshot({ path: new URL(n + '.png', OUT).pathname.replace(/^\/([A-Z]:)/, '$1') });
const R = makeReport('s31-expeditions');
const errs = [], warns = [];
const want = k => !process.env.ONLY || process.env.ONLY.includes(k); // (ONLY=ad: just those parts)
const ev = (page, fn, arg) => page.evaluate(fn, arg);

// ---- helpers: the Board by real clicks
async function atBoard(page) { // walk up to the board and press F (its interaction opens the panel)
  await ev(page, () => { const G = window.G, it = G.cozy.board.it; G.player.setPos(it.pos.x, it.pos.z); G.player.moveTarget = null; G.ui.closeAll(); });
  await sleep(page, 250);
  await page.keyboard.press('f');
  await page.waitForFunction(() => window.G.ui.isOpen('expeditions'), null, { timeout: 5000 }).catch(() => {});
  return ev(page, () => window.G.ui.isOpen('expeditions') && window.G.ui.panels.expeditions.atBoard);
}
const click = async (page, sel) => { const ok = await ev(page, s => !!document.querySelector(s), sel); if (ok) { await page.click(sel); await sleep(page, 120); } return ok; };
async function sendVia(page, view, objId, members) {
  if (!(await atBoard(page))) return { ok: false, why: 'board did not open' };
  await click(page, `.p-exp .ex-tab[data-v="${view}"]`);
  if (objId) await click(page, `.p-exp .ex-obj[data-o="${objId}"]`);
  await click(page, '.p-exp [data-a="clear"]:not([disabled])'); // (the panel keeps the last crew picked)
  for (const m of members) await click(page, `.p-exp .ex-mem[data-m="${m}"]`);
  const info = await ev(page, () => { const P = window.G.ui.panels.expeditions, I = P.info(); return I ? { ok: I.ok, why: I.why, r: I.r, odds: I.odds.key } : null; });
  const sent = info?.ok && await click(page, '.p-exp .ex-go:not([disabled])');
  const n = await ev(page, () => window.G.cozy.exp.list().length);
  await ev(page, () => window.G.ui.closeAll());
  return { ...info, sent: !!sent && n > 0 };
}
/** after the first few errands by clicks (the Board proven), the same G.cozy.exp.send its Send off calls: CZ-9's level-matched
 *  XP takes more trips to Moka's level 7 */
let clicked = 0;
async function sendErrand(page, id, crew) {
  if (clicked < 4) { clicked++; return sendVia(page, 'errands', id, crew); }
  return ev(page, ([id, crew]) => ({ sent: !!window.G.cozy.exp.send(id, crew, {})?.ok }), [id, crew]);
}
const skip = (page, h) => ev(page, h => window.G.cozy.clock.add(h), h); // (the debug clock: G.cozy.clock.add, as the Cozy debug section's "Add world hours")

// ================================================================== a) the cozy route, end to end
if (want('a')) {
  const { browser, page, errors, warns: w } = await launch({ w: 1600, h: 900 });
  await boot(page, 'fresh&nointro&notut&hour=9');
  const events = [];
  await ev(page, () => { window.__cz = []; for (const n of ['expedition:sent', 'expedition:back', 'village:saved']) window.G.events.on(n, e => window.__cz.push([n, e?.result || e?.zone || ''])); });
  // Moka joins through her own scene (she's waiting by the fountain)
  await ev(page, () => { window.G.heroes.join('moka'); }); await sleep(page, 600);
  await drainDialogue(page, [0]);
  const m0 = await ev(page, () => ({ joined: window.G.heroes.joined('moka'), lvl: window.G.state.heroes.moka.player.lvl, chewy: window.G.state.player.lvl, kills: 0, bamboo: window.G.travel.list().find(x => x.id === 'bamboo').unlocked }));
  R.check('a) a fresh game: Moka joins by her scene; Chewy L1, Bamboo still closed', m0.joined && m0.lvl === 1 && m0.chewy === 1 && !m0.bamboo, m0);
  // the farm for lunches: four turnips from Usagi's stall, planted and watered in Chewy's bed
  const farm = await ev(page, () => { const G = window.G, g = G.life.garden; const ok = G.actions.buyPantry('turnipSeed', 10, 4); g.syncBeds?.(true); return { ok, tiles: g.beds[0].tiles.slice(0, 4) }; });
  const tend = async (fn) => { for (const i of farm.tiles) { await ev(page, ([i, fn]) => { const g = window.G.life.garden, r = g.rec(i); if (fn === 'plant' && !r?.crop) { if (!g.tilled(i)) { g.ensure(i).till = true; g.draw(i); } g.plant(i, 'turnipSeed'); } else if (fn === 'water' && r?.crop) g.water(i); else if (fn === 'harvest' && r?.crop && r.stage >= 2) g.harvest(i); }, [i, fn]); await page.waitForFunction(() => !window.G.life.tools.busy, null, { timeout: 4000 }).catch(() => {}); await sleep(page, 80); } };
  await ev(page, () => { const G = window.G, t = G.life.garden.tiles.get(G.life.garden.beds[0].tiles[0]); G.player.setPos(t.x + 0.5, t.z - 0.6); });
  await tend('plant'); await tend('water');
  const planted = await ev(page, t => t.filter(i => window.G.life.garden.rec(i)?.crop === 'turnip').length, farm.tiles);
  R.check('a) lunches start on the farm: four turnip seeds bought, planted and watered', farm.ok && planted === 4, { planted });
  // errands from the Board by clicks, the clock skipped; nights slept for the turnips (sleep adds the hours it skips)
  let trips = 0, nights = 0, firstSend = null, sleepAdd = null, lunches = 0;
  const sleepNight = async () => { const h0 = await ev(page, () => window.G.cozy.clock.h), vh = await ev(page, () => window.G.day.hour); await ev(page, () => window.G.sleep()); await sleep(page, 400); await waitIdle(page); await drainDialogue(page); nights++; const h1 = await ev(page, () => window.G.cozy.clock.h); if (sleepAdd == null) sleepAdd = { add: h1 - h0, from: vh }; };
  for (let k = 0; k < 300; k++) {
    if (process.env.VERBOSE) console.log('  .... loop', k, JSON.stringify(await ev(page, () => ({ lvl: window.G.state.heroes.moka.player.lvl, h: window.G.cozy.clock.h, out: window.G.cozy.exp.list().length }))));
    const st = await ev(page, () => ({ bamboo: window.G.travel.list().find(x => x.id === 'bamboo').unlocked, lvl: window.G.state.heroes.moka.player.lvl, away: window.G.heroes.away('moka'), rest: window.G.state.cozy.exp.tired['hero:moka'] - window.G.cozy.clock.h }));
    if (st.bamboo) break;
    if (st.rest > 0) { await skip(page, st.rest + 0.1); continue; }
    const err = await ev(page, () => { const G = window.G, L = G.cozy.exp.objectives('errands').map(o => ({ id: o.id, I: G.cozy.exp.info(o.id, ['hero:moka'], {}) })).filter(x => x.I.ok); L.sort((a, b) => b.I.r - a.I.r); return L[0]?.id || null; });
    if (!err) { await sleepNight(); await tend('water'); continue; }
    const r = await sendErrand(page, err, ['hero:moka']);
    if (!firstSend) { firstSend = r; await shot(page, 'a-sent'); }
    if (!r.sent) break;
    trips++;
    await skip(page, 3.05);
    if (trips === 1) { await sleep(page, 600); await shot(page, 'a-back-chip'); }
    if (trips % 3 === 0) { await sleepNight(); await tend('water'); await tend('harvest'); }
  }
  const lv = await ev(page, () => ({ moka: window.G.state.heroes.moka.player.lvl, chewy: window.G.state.player.lvl, bamboo: window.G.travel.list().find(x => x.id === 'bamboo').unlocked, reports: window.G.cozy.exp.reports().length, kills: window.G.state.quests.active.find(q => q.id === 'burrow1')?.prog || 0 }));
  R.check('a) errands sent from the Board (F at the board, a click on the job, on Moka, on Send off)', firstSend?.sent && trips >= 3, { firstSend, trips });
  R.check('a) Moka levels on errands while Chewy stays level 1 and fights nothing; Bamboo opens on her level (any hero at level 4)', lv.moka >= 4 && lv.chewy === 1 && lv.bamboo, lv);
  R.check('a) sleeping adds the night to the world clock (to 6:30)', sleepAdd && Math.abs(sleepAdd.add - ((sleepAdd.from < 6.5 ? 6.5 - sleepAdd.from : 30.5 - sleepAdd.from))) < 0.2, { sleepAdd, nights });
  // the lunches: harvest, cook (a starter recipe at the cottage stove's action)
  for (let k = 0; k < 4 && (await ev(page, () => Object.keys(window.G.state.pantry).filter(id => id === 'turnip').reduce((a, id) => a + window.G.state.pantry[id], 0))) < 2; k++) { await sleepNight(); await tend('water'); await tend('harvest'); }
  lunches = await ev(page, () => { const c = window.G.actions.cook('roastedVeggies', 1); return c ? window.G.state.pantry.roastedVeggies || 0 : 0; });
  R.check('a) the turnips grow and are cooked into a lunch (Roasted Veggies)', lunches >= 1, { lunches, pantry: await ev(page, () => window.G.state.pantry) });
  // the relief: on the Story tab; more errands until the odds are good, then Moka alone with her lunch
  let relief = null, tries = 0;
  for (let k = 0; k < 300; k++) {
    const st = await ev(page, () => { const G = window.G, o = G.cozy.exp.objectives('story').find(x => x.kind === 'siege'); if (!o) return { none: true, saved: G.state.zones.bamboo.village }; const I = G.cozy.exp.info(o.id, ['hero:moka'], { meals: { roastedVeggies: 1 } }); return { id: o.id, r: I.r, ok: I.ok, why: I.why, rest: (G.state.cozy.exp.tired['hero:moka'] || 0) - G.cozy.clock.h, lunch: G.state.pantry.roastedVeggies || 0 }; });
    if (st.none) break;
    if (st.rest > 0) { await skip(page, st.rest + 0.1); continue; }
    if (!st.lunch) { await sleepNight(); await tend('water'); await tend('harvest'); await ev(page, () => window.G.actions.cook('roastedVeggies', 1)); continue; }
    if (st.ok && st.r >= 0.85) {
      if (!relief) { await atBoard(page); await click(page, '.p-exp .ex-tab[data-v="story"]'); await click(page, '.p-exp .ex-mem[data-m="hero:moka"]'); await sleep(page, 300); await shot(page, 'a-relief-board'); relief = await ev(page, () => { const I = window.G.ui.panels.expeditions.info(); return { checks: I.checks.map(c => [c.label, c.ok]), odds: I.odds.key, lunch: I.meals }; }); await ev(page, () => window.G.ui.closeAll()); }
      const r = await sendVia(page, 'story', st.id, ['hero:moka']); tries++;
      if (!r.sent) break;
      await skip(page, 6.1);
      continue;
    }
    const err = await ev(page, () => { const G = window.G, L = G.cozy.exp.objectives('errands').map(o => ({ id: o.id, I: G.cozy.exp.info(o.id, ['hero:moka'], {}) })).filter(x => x.I.ok); L.sort((a, b) => b.I.r * 0 + (b.I.need - a.I.need)); return L[0]?.id || null; });
    if (!err) { await sleepNight(); await tend('water'); await tend('harvest'); continue; }
    if (!(await sendErrand(page, err, ['hero:moka'])).sent) break;
    await skip(page, 3.05);
  }
  const sv = await ev(page, () => { const Z = window.G.state.zones.bamboo; return { village: Z.village, by: Z.savedBy, celebrate: Z.celebrate, freed: Z.quests.freed?.length || 0, events: window.__cz.filter(e => e[0] === 'village:saved').length, lvl: window.G.state.heroes.moka.player.lvl, chewy: window.G.state.player.lvl, reps: window.G.cozy.exp.reports().filter(r => r.kind === 'siege').map(r => r.result) }; });
  R.check('a) the relief gate takes one hero with packed lunches (no Guild, no second hero)', relief && relief.checks.every(c => c[1]) && relief.lunch.have >= 1, relief);
  R.check('a) Takemori saved by Moka\'s crew: savedBy crew, the cages opened, village:saved, the celebration waiting for the next arrival', sv.village === 'saved' && sv.by === 'crew' && sv.celebrate && sv.freed >= 3 && sv.events >= 1 && sv.reps.at(-1) === 'success' && sv.chewy === 1, { sv, tries });
  await page.waitForFunction(() => !window.G.ui.banners?.busy, null, { timeout: 15000 }).catch(() => {});
  await atBoard(page); await click(page, '.p-exp .ex-tab[data-v="reports"]'); await sleep(page, 400);
  const rib = await ev(page, () => ({ ribbon: document.querySelector('.p-exp .ex-saved')?.textContent || '', banner: !!window.G.ui.banners?.busy, bannerText: document.querySelector('.banners')?.textContent || '' }));
  await shot(page, 'a-report');
  R.check("a) in Blossom Hollow the news is a ribbon on the relief's report (the rescued villagers named), never the zone's banner", /Takemori Village is saved!/.test(rib.ribbon) && /Chiku/.test(rib.ribbon) && /Galeclaw/.test(rib.ribbon) && !/Takemori/.test(rib.bannerText), rib);
  await ev(page, () => window.G.ui.closeAll());
  // the arrival: the banner, the saved village's buildings
  await ev(page, () => { window.G.travel.go('bamboo'); });
  await waitMode(page, 'dungeon', 30000); await sleep(page, 3600);
  const arr = await ev(page, () => { const G = window.G, V = G.dungeon.village; return { region: G.dungeon.zoneId, saved: !!V?.saved, celebrate: G.state.zones.bamboo.celebrate, doors: G.world.interactables.filter(it => /Sasanoha|Chiku|Dojo|Craftshop|Inn|Store|Shop|Talk|Enter/i.test(it.label || '')).length, camps: (G.dungeon.monsters || []).filter(m => m.alive).length }; });
  await shot(page, 'a-arrival');
  R.check('a) back in Bamboo: the arrival banner plays once, the village is saved and open (no siege camps)', arr.region === 'bamboo' && arr.saved && !arr.celebrate && arr.doors > 0, arr);
  errs.push(...errors); warns.push(...w); await browser.close();
}

// ================================================================== b, c) away heroes, the hold rule, "you beat us to it"
if (want('b')) {
  const { browser, page, errors, warns: w } = await launch({ w: 1600, h: 900 });
  await boot(page, 'fresh&nointro&notut&hour=10');
  await ev(page, () => { const G = window.G; G.state.flags.mokaJoined = true; G.state.flags.poeJoined = true; G.state.heroes.moka.player.lvl = 9; G.state.heroes.poe.player.lvl = 8; G.state.pantry = { roastedVeggies: 6 }; G.heroes.spawnBench(); });
  await sleep(page, 400);
  const s1 = await sendVia(page, 'story', 'relief:bamboo', ['hero:moka']);
  await sleep(page, 800); // (the HUD's minis catch up on their next frame)
  const away = await ev(page, () => { const G = window.G, H = G.heroes; H.openWheel(); const ro = H.roster(); const card = document.querySelector('.hw-card[data-id="moka"]'); const out = { bench: H.bench(), next: H.next(), why: H.canSwitch('moka'), ro: ro.find(r => r.id === 'moka'), card: card?.classList.contains('away') && !!card.querySelector('.cz-away-badge'), mini: !!document.querySelector('.hsw.away .cz-away-badge'), inTown: !!H.villagers.moka && !H.villagers.moka.leaving }; return out; });
  await sleep(page, 400); await shot(page, 'b-wheel-away');
  await ev(page, () => window.G.heroes.pickFromWheel(null));
  R.check('b) an away hero: off the bench and not the Tab target, greyed with a backpack in the wheel and the HUD minis, "away" to switch to', s1.sent && !away.bench.includes('moka') && away.next === 'poe' && /away on an expedition/.test(away.why) && away.ro.away && !away.ro.ready && away.card && away.mini, away);
  await ev(page, () => window.G.travel.go('bamboo')); await waitMode(page, 'dungeon', 30000); await sleep(page, 1500);
  await skip(page, 7);
  const held = await ev(page, () => ({ hold: window.G.cozy.exp.list()[0]?.hold, village: window.G.state.zones.bamboo.village, out: window.G.cozy.exp.list().length }));
  await ev(page, () => window.G.returnToVillage()); await waitMode(page, 'village', 30000); await sleep(page, 1200);
  const after = await ev(page, () => ({ out: window.G.cozy.exp.list().length, village: window.G.state.zones.bamboo.village, rep: window.G.cozy.exp.reports().at(-1)?.result }));
  R.check('c) the hold rule: back while you\'re in Bamboo, the relief waits at the edge; it moves in once you leave', held.hold && held.village === 'besieged' && held.out === 1 && after.out === 0 && (after.rep === 'success' ? after.village === 'saved' : true), { held, after });
  // you beat us to it: a relief out on another save, then the village saved by you
  await ev(page, () => { const G = window.G; G.state.zones.maple.village = 'besieged'; });
  const p0 = await ev(page, () => window.G.state.pantry.roastedVeggies || 0);
  await ev(page, () => { const G = window.G; G.state.zones.bamboo.village = 'besieged'; G.state.zones.bamboo.savedBy = null; G.state.zones.bamboo.siegeCamps = []; const t = G.state.cozy.exp.tired; for (const k in t) delete t[k]; });
  const s2 = await sendVia(page, 'story', 'relief:bamboo', ['hero:poe']);
  const p1 = await ev(page, () => window.G.state.pantry.roastedVeggies || 0);
  await ev(page, () => window.G.zoneDebug.saveVillage('bamboo'));
  await sleep(page, 300);
  const beat = await ev(page, () => ({ out: window.G.cozy.exp.list().length, rep: window.G.cozy.exp.reports().at(-1), pantry: window.G.state.pantry.roastedVeggies || 0 }));
  R.check('c) "You beat us to it!": the crew comes home early with XP and half the loot, the lunches refunded', s2.sent && p1 === p0 - 1 && beat.out === 0 && beat.rep.result === 'beaten' && beat.pantry === p0 && Object.values(beat.rep.xp).some(v => v > 0), { s2, p0, p1, beat: { out: beat.out, result: beat.rep.result, xp: beat.rep.xp, pantry: beat.pantry } });
  errs.push(...errors); warns.push(...w); await browser.close();
}

// ================================================================== d) time away, the tamper guards, old saves
if (want('d')) {
  const { browser, page, errors, warns: w } = await launch({ w: 1600, h: 900 });
  await boot(page, 'fresh&nointro&notut&hour=10');
  await ev(page, () => { const G = window.G; G.state.flags.mokaJoined = true; G.heroes.spawnBench(); });
  const s = await sendVia(page, 'errands', null, ['hero:moka']);
  // reload with the save's mark moved back: a normal absence (70 s → 2 h), then a day (the cap), then a clock gone back
  const reload = async (shiftMs, edit) => {
    await ev(page, ([shiftMs, edit]) => {
      const G = window.G; G.save(); G.saveBlocked = true;
      const st = JSON.parse(localStorage.getItem('chewy3d.save'));
      if (edit === 'old') delete st.cozy; else st.cozy.clock.wall = Date.now() - shiftMs;
      if (edit === 'broken') st.cozy.exp.active.push({ uid: 'x900', obj: 'errand:0:home:drift', name: 'Driftwood', crew: ['hero:chewy'], start: st.cozy.clock.h, hours: 2, power: 10, need: 12, odds: 'good', p: 0.6, supplies: { meals: {}, potions: 0 } });
      localStorage.setItem('chewy3d.save', JSON.stringify(st));
    }, [shiftMs, edit]);
    await page.goto(`${BASE}/?nointro&notut&notitle&dseed=1`); await page.waitForFunction(() => window.__ready === true && window.G?.player, null, { timeout: 60000 }); await sleep(page, 1800);
  };
  const h0 = await ev(page, () => window.G.cozy.clock.h);
  await reload(70e3);
  const a1 = await ev(page, () => ({ h: window.G.cozy.clock.h, away: window.G.cozy.awayNow(), card: window.G.ui.isOpen('awayCard'), out: window.G.cozy.exp.list().length }));
  R.check('d) a normal absence: 70 s away (plus the reload) counts its world hours on load, 35 s each', a1.away?.load && a1.away.ms >= 70e3 && a1.away.ms < 100e3 && Math.abs(a1.away.hours - a1.away.ms / 35e3) < 0.01 && a1.h - h0 >= a1.away.hours, { h0, a1 });
  await ev(page, () => { const G = window.G; G.ui.closeAll(); const t = G.state.cozy.exp.tired; for (const k in t) delete t[k]; const o = G.cozy.exp.objectives('errands')[0]; G.cozy.exp.send(o.id, ['hero:moka'], {}); }); // (a crew out over the next absence)
  await reload(86400e3);
  await page.waitForFunction(() => window.G.ui.isOpen('awayCard'), null, { timeout: 8000 }).catch(() => {});
  const a2 = await ev(page, () => ({ h: window.G.cozy.clock.h, capped: window.G.cozy.awayNow()?.capped, card: window.G.ui.isOpen('awayCard'), text: document.querySelector('.p-away .aw-hd')?.textContent, rows: document.querySelectorAll('.p-away .aw-row').length, out: window.G.cozy.exp.list().length, banner: window.G.ui.banners?.busy }));
  await shot(page, 'd-away-card');
  R.check('d) a day away counts only the cap (8 world hours); the crew came home; "While you were away…" says so', a2.capped && a2.out === 0 && a2.card && /8 game hours passed, the most/.test(a2.text) && a2.rows >= 1 && !a2.banner, a2);
  await page.keyboard.press('Enter'); await sleep(page, 400);
  R.check('d) the card closes with Enter', !(await ev(page, () => window.G.ui.isOpen('awayCard'))));
  const h2 = await ev(page, () => window.G.cozy.clock.h);
  await reload(-3600e3);
  const a3 = await ev(page, () => ({ h: window.G.cozy.clock.h, wall: window.G.state.cozy.clock.wall, now: Date.now(), card: window.G.ui.isOpen('awayCard') }));
  R.check('d) a clock set backwards counts nothing (the mark stays ahead), no card', Math.abs(a3.h - h2) < 0.1 && a3.wall > a3.now && !a3.card, a3);
  await ev(page, () => { window.G.state.cozy.clock.wall = Date.now(); });
  await reload(0, 'broken');
  const a4 = await ev(page, () => ({ out: window.G.cozy.exp.list().length, rep: window.G.cozy.exp.reports().at(-1) }));
  R.check('d) a saved expedition with the hero being played comes home at once, as a partial with a note (COZY §9)', a4.out === 0 && a4.rep.result === 'partial' && /being played/.test(a4.rep.note), { out: a4.out, rep: a4.rep && { result: a4.rep.result, note: a4.rep.note } });
  await reload(0, 'old');
  const a5 = await ev(page, () => ({ v: window.G.state.cozy?.v, h: window.G.cozy.clock.h, wall: window.G.state.cozy.clock.wall > 0, card: window.G.ui.isOpen('awayCard'), away: window.G.cozy.awayNow() }));
  R.check('d) an old save (no cozy state): it gets one, 0 hours away, the mark set, no card', a5.v === 1 && a5.h < 0.1 && a5.wall && !a5.card && !a5.away, a5);
  // a hidden tab: the frame loop stalls, time counts on the way back
  const a6 = await ev(page, async () => { const G = window.G, h = G.cozy.clock.h, real = Date.now; Date.now = () => real() + 35e3 * 3; await new Promise(r => setTimeout(r, 300)); const out = G.cozy.clock.h - h; Date.now = real; G.state.cozy.clock.wall = real(); return out; });
  R.check('d) a stalled frame loop (a hidden tab) counts its time away when it runs again', a6 > 2.9 && a6 < 3.2, { a6 });
  void s;
  errs.push(...errors); warns.push(...w); await browser.close();
}

// ================================================================== e) the pad and the phone
if (want('e')) {
  const { browser, page, errors, warns: w } = await launch({ w: 1280, h: 800 });
  await boot(page, 'fresh&nointro&notut&hour=15');
  await installPad(page);
  await ev(page, () => { const G = window.G; G.state.flags.mokaJoined = true; G.state.flags.poeJoined = true; G.state.heroes.moka.player.lvl = 9; G.state.heroes.poe.player.lvl = 8; G.state.pantry = { cabbageRolls: 4 }; G.heroes.spawnBench(); });
  await padTap(page, 'A'); await sleep(page, 300);
  await atBoard(page);
  await ev(page, () => { const P = window.G.ui.panels.expeditions; P.view = 'story'; P.render(); });
  await sleep(page, 500);
  await padTap(page, 'Y'); await sleep(page, 500);
  const pb = await ev(page, () => ({ crew: window.G.ui.panels.expeditions.crew, hints: document.querySelector('.pad-hints')?.textContent || '', ring: document.querySelector('.pad-ring.on') != null }));
  await shot(page, 'e-pad-board');
  // focus Send off and press A
  await ev(page, () => { const nav = window.G.ui.padNav, go = document.querySelector('.p-exp .ex-go'); nav.focus(go, []); });
  await padTap(page, 'A'); await sleep(page, 600);
  const pa = await ev(page, () => ({ out: window.G.cozy.exp.list().length, view: window.G.ui.panels.expeditions.view }));
  await shot(page, 'e-pad-away');
  R.check('e) the pad: Y picks the best crew, the hints name Best crew and Clear, A on Send off sends', pb.crew.length >= 1 && /Best crew/.test(pb.hints) && pb.ring && pa.out === 1 && pa.view === 'away', { pb, pa });
  await ev(page, () => window.G.ui.closeAll()); await sleep(page, 300);
  await shot(page, 'e-pad-chip');
  errs.push(...errors); warns.push(...w); await browser.close();
}
if (want('f')) {
  const { browser, page, errors, warns: w, F } = await launchTouch();
  await boot(page, 'fresh&nointro&notut&hour=15&mobile');
  await ev(page, () => { const G = window.G; G.state.flags.mokaJoined = true; G.state.flags.poeJoined = true; G.state.heroes.moka.player.lvl = 9; G.state.heroes.poe.player.lvl = 8; G.state.pantry = { cabbageRolls: 4 }; G.heroes.spawnBench(); });
  const audit = async () => page.evaluate(() => {
    const p = document.querySelector('.p-exp'), r = p.getBoundingClientRect(), small = [], tiny = [];
    for (const b of p.querySelectorAll('button')) { const q = b.getBoundingClientRect(); if (!q.width || getComputedStyle(b).visibility === 'hidden') continue; if (Math.min(q.height, q.width) < 43.5 && !b.classList.contains('ph-x')) small.push(b.className.split(' ')[0] + ':' + Math.round(q.height)); }
    for (const e of p.querySelectorAll('*')) { if (!e.offsetParent || !e.childNodes.length || ![...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue; const fs = parseFloat(getComputedStyle(e).fontSize) * (parseFloat(getComputedStyle(document.querySelector('.ui-root')).getPropertyValue('--m-pscale')) || 1); if (fs < 11.9 && !e.closest('.jp, .ph-jp')) tiny.push(e.className + ':' + e.textContent.trim().slice(0, 12) + ':' + fs.toFixed(1)); }
    return { fits: r.top >= -1 && r.bottom <= innerHeight + 1 && r.left >= -1 && r.right <= innerWidth + 1, phone: window.G.ui.root.classList.contains('m-phone'), cols: getComputedStyle(p.querySelector('.ex')).gridTemplateColumns.split(' ').length, small: small.slice(0, 8), tiny: tiny.slice(0, 8) };
  });
  await ev(page, () => { window.G.ui.open('expeditions', { at: 'board', view: 'story' }); });
  await sleep(page, 900);
  const b1 = await audit();
  await shot(page, 'f-phone-board');
  const mem = await ev(page, () => { const b = document.querySelector('.p-exp .ex-mem[data-m="hero:moka"]'); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await F.tap(mem.x, mem.y); await sleep(page, 400);
  const go = await ev(page, () => { const b = document.querySelector('.p-exp .ex-go'); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, dis: b.disabled }; });
  await F.tap(go.x, go.y); await sleep(page, 700);
  const sent = await ev(page, () => window.G.cozy.exp.list().length);
  const b2 = await audit();
  await shot(page, 'f-phone-away');
  R.check('f) the phone: two columns, fits the screen, 44 px targets, the 12 px floor; taps add Moka and send', b1.phone && b1.cols === 2 && b1.fits && !b1.small.length && !b1.tiny.length && !b2.small.length && sent === 1, { b1, b2, go, sent });
  await ev(page, () => { window.G.ui.closeAll(); window.G.cozy.clock.add(7); });
  await sleep(page, 900); await shot(page, 'f-phone-chip');
  await ev(page, () => { window.G.ui.open('expeditions', { view: 'reports' }); }); await sleep(page, 800);
  const b3 = await audit();
  await shot(page, 'f-phone-report');
  await ev(page, () => { window.G.ui.closeAll(); const c = window.G.state.cozy.clock; c.wall = Date.now() - 300e3; }); await sleep(page, 2500);
  await ev(page, () => { if (!window.G.ui.isOpen('awayCard')) window.G.cozy.showAway(); }); await sleep(page, 900);
  await shot(page, 'f-phone-away-card');
  const card = await ev(page, () => { const p = document.querySelector('.p-away'), r = p?.getBoundingClientRect(), b = document.querySelector('.p-away .aw-ok')?.getBoundingClientRect(), h = document.querySelector('.pw[data-name="awayCard"] .ph')?.getBoundingClientRect(); return p ? { fits: r.top >= -1 && r.bottom <= innerHeight + 1, gap: h && b ? Math.round(h.top - b.bottom) : null } : null; });
  R.check('f) the phone: the report fits; the away card fits, its button clear of the title bar', !b3.small.length && !b3.tiny.length && card?.fits && card.gap >= 4, { b3, card });
  errs.push(...errors); warns.push(...w); await browser.close();
}
console.log('  shots: ' + OUT.pathname);
process.exit(R.finish(errs, warns) ? 1 : 0);
