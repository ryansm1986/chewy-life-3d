// s37: the story rerouted, the cozy path's phase E (docs/COZY.md §3, ROADMAP CZ-9).
//   a) THE HEADLINE: a fresh game reaches the first zone dungeon's clear with ZERO fights, using only expeditions sent
//      from the Board by clicks, building, farming, the town's own growth and the debug clock (no debug unlocks):
//      Rosie's welcome; Moka joins; "Peek into the Burrow" (burrow1) by Moka's crew; turnips grown and cooked into
//      lunches; errands; A Home for Everyone and the Lights grow and get built; "The King of Squish" by a crew (King
//      Mochi's crown cushion, his unique owed to your own win); Takemori relieved by a crew; the arrival in Bamboo: the
//      crew's celebration in the square; Poe joins in the calm grove; "Clear the Bamboo Depths" by Moka and Poe: the
//      Maple Hollow opens, the Travel Map's 救 stamp, Tier 1 at the Depths' Spirit Lantern, the Tengu's fan; no kills,
//      no boss fallen, Bamboo's dungeon.cleared still 0 (the boss unique waits for your own first clear)
//   b) the keepsakes placed in Chewy's cottage (the decorate mode), a shot at the game camera
//   c) all four sieges: their gates, the camps you broke shrinking the relief, each relief and its celebration on arrival
//   d) (opt-in: S37_FULL=1 or ONLY=d, ~1.5 h) the rest of the story from part a's save, still with no fights: a zone
//      villager's rescue and find by crews, the Guild built and upgraded, the town grown to rank 4 (painted zones and the
//      player's home upgrades), the other three zones' reliefs and dungeon clears by crews; the kill-request swap; homestead XP
//   shots → tools/qa/tmp/s37-cozy-story/: the reports (burrow1, king, the relief, the clear), the celebration, the
//   Travel Map stamp, the Lantern, the trophies in a room
//   usage: node tools/qa/s37-cozy-story.mjs        (ONLY=a, VERBOSE=1)
import fs from 'node:fs';
import { launch, boot, sleep, waitIdle, waitMode, drainDialogue, makeReport, BASE } from './lib.mjs';

const OUT = new URL('./tmp/s37-cozy-story/', import.meta.url); fs.mkdirSync(OUT, { recursive: true });
const shot = (page, n) => page.screenshot({ path: new URL(n + '.png', OUT).pathname.replace(/^\/([A-Z]:)/, '$1') });
const R = makeReport('s37-cozy-story');
const errs = [], warns = [];
const want = k => !process.env.ONLY || process.env.ONLY.includes(k);
const ev = (page, fn, arg) => page.evaluate(fn, arg);
const log = (...a) => { if (process.env.VERBOSE) console.log('  ....', ...a); };

// ---- the Board by real clicks (as s31)
async function atBoard(page) {
  await ev(page, () => { const G = window.G, it = G.cozy.board.it; G.ui.closeAll(); G.player.setPos(it.pos.x, it.pos.z); G.player.moveTarget = null; G.interactCooldown = 0; });
  await sleep(page, 250);
  await page.keyboard.press('f');
  await page.waitForFunction(() => window.G.ui.isOpen('expeditions'), null, { timeout: 5000 }).catch(() => {});
  return ev(page, () => window.G.ui.isOpen('expeditions') && window.G.ui.panels.expeditions.atBoard);
}
const click = async (page, sel) => { const ok = await ev(page, s => !!document.querySelector(s), sel); if (ok) { await page.click(sel); await sleep(page, 120); } return ok; };
async function sendVia(page, view, objId, members, { potions = 0, lunch = false, shotName = null } = {}) {
  if (!(await atBoard(page))) return { ok: false, why: 'board did not open' };
  await click(page, `.p-exp .ex-tab[data-v="${view}"]`);
  if (objId) await click(page, `.p-exp .ex-obj[data-o="${objId}"]`);
  await click(page, '.p-exp [data-a="clear"]:not([disabled])');
  for (const m of members) await click(page, `.p-exp .ex-mem[data-m="${m}"]`);
  if (lunch && !(await ev(page, () => !!document.querySelector('.p-exp .ex-tog.on')))) await click(page, '.p-exp [data-a="lunch"]');
  for (let i = 0; i < potions; i++) await click(page, '.p-exp [data-pot="1"]:not([disabled])');
  const info = await ev(page, () => { const P = window.G.ui.panels.expeditions, I = P.info(); return I ? { ok: I.ok, why: I.why, r: Math.round(I.r * 100) / 100, odds: I.odds.key, need: I.need } : null; });
  if (shotName) { await sleep(page, 300); await shot(page, shotName); }
  const n0 = await ev(page, () => window.G.cozy.exp.list().length);
  const sent = info?.ok && await click(page, '.p-exp .ex-go:not([disabled])');
  const n = await ev(page, () => window.G.cozy.exp.list().length);
  await ev(page, () => window.G.ui.closeAll());
  return { ...info, sent: !!sent && n > n0 };
}
const skip = (page, h) => ev(page, h => window.G.cozy.clock.add(h), h);
/** an errand sent the quick way after the first few by clicks: the same G.cozy.exp.send the Board's Send off calls */
let clicked = 0;
async function sendErrand(page, id, crew) {
  if (clicked < 4) { clicked++; return sendVia(page, 'errands', id, crew); }
  return ev(page, ([id, crew]) => ({ sent: !!window.G.cozy.exp.send(id, crew, {})?.ok }), [id, crew]);
} // (the debug clock: the Cozy debug section's "Add world hours")
/** the town's growth tick, run now (the village sim ticks every 6 s of real time in town: a time skip, no unlock) */
const growTown = async (page, n = 6) => { for (let i = 0; i < n; i++) { await ev(page, () => { window.G.sim.tickT = 99; }); await sleep(page, 90); } };
async function readReport(page, name) {
  await page.waitForFunction(() => !window.G.ui.banners?.busy, null, { timeout: 15000 }).catch(() => {});
  await atBoard(page); await click(page, '.p-exp .ex-tab[data-v="reports"]'); await sleep(page, 500);
  const r = await ev(page, () => ({ ribbon: [...document.querySelectorAll('.p-exp .ex-saved')].map(e => e.textContent.trim()).join(' | '), loot: document.querySelector('.p-exp .ex-loot')?.textContent || '', note: document.querySelector('.p-exp .ex-note')?.textContent || '' }));
  await shot(page, name);
  await ev(page, () => window.G.ui.closeAll());
  return r;
}

// ================================================================== a) the headline: no fights, a crew clears the Bamboo Depths
if (want('a')) {
  const { browser, page, errors, warns: w } = await launch({ w: 1600, h: 900 });
  await boot(page, 'fresh&nointro&notut&hour=9');
  await ev(page, () => { const G = window.G; window.__fights = { kills: 0, bosses: [], hits: 0 }; G.events.on('monster:killed', () => window.__fights.kills++); G.events.on('boss:dead', e => window.__fights.bosses.push(e?.id)); window.__hxp = 0; G.events.on('homestead:xp', e => { window.__hxp += e?.xp || 0; }); window.__ev = []; for (const n of ['expedition:back', 'village:saved', 'dungeon:cleared', 'tier:unlocked', 'village:celebrate']) G.events.on(n, e => window.__ev.push([n, e?.crew ? 'crew' : '', e?.result || e?.zone || e?.id || ''])); });
  // Rosie's welcome: walk up and talk
  await ev(page, () => { const G = window.G, n = G.npcs.find(x => x.id === 'rosie'); G.player.setPos(n.pos.x + 1, n.pos.z + 1); G.player.moveTarget = null; n.interacted(); });
  await drainDialogue(page, [0]); await sleep(page, 3200);
  // Moka joins by her own scene at the fountain
  await ev(page, () => { window.G.heroes.join('moka'); }); await sleep(page, 600); await drainDialogue(page, [0]);
  const q0 = await ev(page, () => ({ act: window.G.state.quests.active.map(q => q.id), moka: window.G.heroes.joined('moka'), story: window.G.cozy.exp.objectives('story').map(o => o.id) }));
  R.check('a) a fresh game: Rosie\'s welcome done, Moka joins; "Something Squishy" is on the Board\'s Story tab as "Peek into the Burrow"', q0.act.includes('burrow1') && q0.moka && q0.story.includes('quest:burrow1'), q0);
  // burrow1 by Moka's crew: Rosie packs the lunch. R-14: the Board says so plainly (the toggle on and locked, "Lunch
  // packed by Rosie ♡", never "0 in the pantry"), a tap can't turn it off, the odds count her lunch (fed), and a dish in
  // the pantry stays there
  await ev(page, () => window.G.actions.addPantry('onigiri', 1, { silent: true }));
  let rl = null;
  if (await atBoard(page)) {
    await click(page, '.p-exp .ex-tab[data-v="story"]'); await click(page, '.p-exp .ex-obj[data-o="quest:burrow1"]'); await click(page, '.p-exp [data-a="clear"]:not([disabled])');
    const tog = () => ev(page, () => { const t = document.querySelector('.p-exp .ex-tog'); return t ? { on: t.classList.contains('on'), locked: t.classList.contains('locked'), dis: t.disabled, text: t.textContent.replace(/\s+/g, ' ').trim(), fact: [...document.querySelectorAll('.p-exp .ex-facts > div')].map(d => d.textContent.replace(/\s+/g, ' ').trim()).join(' | ') } : null; });
    const empty = await tog();
    await click(page, '.p-exp .ex-mem[data-m="hero:moka"]');
    const t0 = await tog(); await click(page, '.p-exp [data-a="lunch"]'); const t1 = await tog();
    const I = await ev(page, () => { const P = window.G.ui.panels.expeditions, I = P.info(); return { fed: I.crewPower.fed, odds: I.odds.key, meals: Object.keys(P.supplies(P.current()).meals).length }; });
    rl = { empty, t0, t1, I };
    await ev(page, () => window.G.ui.closeAll());
  }
  R.check('a) R-14: burrow1\'s lunch reads as Rosie\'s on the Board (on and locked before and after a crew is picked, "Lunch packed by Rosie ♡", not "in the pantry"), a tap leaves it on, the odds count it (fed), no dish is packed', !!rl && [rl.empty, rl.t0, rl.t1].every(t => t && t.on && t.locked && !t.dis && /Lunch packed by Rosie ♡/.test(t.text) && !/in the pantry/.test(t.text)) && /packed\s*by Rosie/.test(rl.t0.fact) && rl.I.fed && rl.I.odds === 'good' && rl.I.meals === 0, rl);
  let b1 = null;
  for (let k = 0; k < 6 && !(await ev(page, () => window.G.state.quests.done.includes('burrow1'))); k++) { // (good odds, not a sure thing: a partial leaves half the kills, and she tries again after a rest)
    const rest = await ev(page, () => (window.G.state.cozy.exp.tired['hero:moka'] || 0) - window.G.cozy.clock.h);
    if (rest > 0) await skip(page, rest + 0.1);
    const r = await sendVia(page, 'story', 'quest:burrow1', ['hero:moka'], { shotName: b1 ? null : 'a1-board-burrow1' }); b1 ||= r;
    await skip(page, 2.1); await sleep(page, 900);
  }
  await page.waitForFunction(() => window.G.state.quests.active.some(q => q.id === 'homes' || q.id === 'lights'), null, { timeout: 6000 }).catch(() => {});
  const b1r = await ev(page, () => ({ done: window.G.state.quests.done.includes('burrow1'), mochi: window.G.state.materials.mochi, rep: window.G.cozy.exp.reports().at(-1)?.result, potions: window.G.state.potions.heart, next: window.G.state.quests.active.map(q => q.id), onigiri: window.G.state.pantry.onigiri || 0 }));
  R.check("a) R-14: Rosie's lunch, not the pantry's: the onigiri in the pantry is still there after Moka's trip", b1r.onigiri === 1, { onigiri: b1r.onigiri });
  await ev(page, () => window.G.actions.spendPantry({ onigiri: 1 }, { quiet: true })); // (the later parts start from the pantry they always had)
  const b1rep = b1r.rep === 'success' ? await readReport(page, 'a2-report-burrow1') : null;
  R.check('a) burrow1 by Moka alone (level 1, good odds with Rosie\'s lunch): the quest done, the 3 Mochi Jelly home, its reward paid, "A Home for Everyone" next', b1.sent && b1.odds === 'good' && b1r.done && b1r.mochi >= 3 && b1r.potions >= 3 && (b1r.next.includes('homes') || b1r.next.includes('lights')) && /Something Squishy: done/.test(b1rep?.ribbon || ''), { b1, b1r, b1rep });  // the farm for lunches: four turnips
  const farm = await ev(page, () => { const G = window.G, g = G.life.garden; const ok = G.actions.buyPantry('turnipSeed', 10, 4); g.syncBeds?.(true); return { ok, tiles: g.beds[0].tiles.slice(0, 4) }; });
  const tend = async (fn) => { for (const i of farm.tiles) { await ev(page, ([i, fn]) => { const g = window.G.life.garden, r = g.rec(i); if (fn === 'plant' && !r?.crop) { if (!(window.G.state.pantry.turnipSeed > 0)) window.G.actions.buyPantry('turnipSeed', 10, 4); if (!g.tilled(i)) { g.ensure(i).till = true; g.draw(i); } g.plant(i, 'turnipSeed'); } else if (fn === 'water' && r?.crop) g.water(i); else if (fn === 'harvest' && r?.crop && r.stage >= 2) g.harvest(i); }, [i, fn]); await page.waitForFunction(() => !window.G.life.tools.busy, null, { timeout: 4000 }).catch(() => {}); await sleep(page, 60); } };
  await ev(page, () => { const G = window.G, t = G.life.garden.tiles.get(G.life.garden.beds[0].tiles[0]); G.player.setPos(t.x + 0.5, t.z - 0.6); });
  await tend('plant'); await tend('water');
  // a night's sleep (the world clock jumps to 6:30), then the morning's farm round: harvest, replant, water, cook lunches
  const sleepNight = async () => { await ev(page, () => window.G.sleep()); await sleep(page, 400); await waitIdle(page); await drainDialogue(page); await tend('harvest'); await tend('plant'); await tend('water'); await ev(page, () => { const P = window.G.state.pantry; if ((P.turnip || 0) >= 2) window.G.actions.cook('roastedVeggies', Math.floor(P.turnip / 2)); }); };
  // the town grows (homes on the painted zones) and the lanterns go up (paid from the purse)
  await growTown(page, 8);
  const lamps = await ev(page, () => {
    const G = window.G, sim = G.sim, P = G.world.landmarks.plaza; let n = 0;
    for (let r = 4; r < 40 && n < 3; r += 2) for (let a = 0; a < 24 && n < 3; a++) { const x = Math.round(P.x + Math.cos(a / 24 * Math.PI * 2) * r), z = Math.round(P.z + Math.sin(a / 24 * Math.PI * 2) * r); if (sim.canPlace('stoneLantern', x, z, 0).ok && sim.roadAccess({ type: 'stoneLantern', x, z, rot: 0, level: 1 }) && sim.place('stoneLantern', x, z, 0, { silent: true })) n++; }
    return n;
  });
  await growTown(page, 4);
  await page.waitForFunction(() => window.G.state.quests.active.some(q => q.id === 'king'), null, { timeout: 8000 }).catch(() => {});
  const town1 = await ev(page, () => ({ homes: window.G.sim.stats.homes, pop: window.G.sim.stats.population, rank: window.G.sim.stats.rank, done: window.G.state.quests.done.slice(), act: window.G.state.quests.active.map(q => q.id) }));
  R.check('a) the town grows on its own zones and three stone lanterns are built: "A Home for Everyone" and "Lights of Blossom Hollow" done; "The King of Squish" next', lamps === 3 && town1.done.includes('homes') && town1.done.includes('lights') && town1.act.includes('king'), { lamps, town1 });
  // errands, lunches and the king; then Takemori; levelling between (errands sent by clicks)
  const pickErrand = () => ev(page, () => { const G = window.G, L = G.cozy.exp.objectives('errands').map(o => ({ id: o.id, I: G.cozy.exp.info(o.id, ['hero:moka'], {}) })).filter(x => x.I.ok); L.sort((a, b) => b.I.need - a.I.need); return L[0]?.id || null; });
  const lunchDish = () => ev(page, () => window.G.state.pantry.roastedVeggies || 0);
  let trips = 0, kingRep = null, relief = null, reliefTry = 0, kingTry = 0;
  for (let k = 0; k < 400; k++) {
    const st = await ev(page, () => { const G = window.G, E = G.state.cozy.exp; return { king: G.state.quests.done.includes('king'), saved: G.state.zones.bamboo.village === 'saved', rest: (E.tired['hero:moka'] || 0) - G.cozy.clock.h, out: E.active.length, lvl: G.state.heroes.moka.player.lvl, story: G.cozy.exp.objectives('story').map(o => o.id) }; });
    log(k, JSON.stringify(st));
    if (st.king && st.saved) break;
    if (st.out) { await skip(page, 1); continue; }
    if (st.rest > 0) { await skip(page, st.rest + 0.1); continue; }
    const target = !st.king && st.story.includes('quest:king') ? 'quest:king' : !st.saved && st.story.includes('relief:bamboo') ? 'relief:bamboo' : null;
    if (target) {
      if (!(await lunchDish())) { await sleepNight(); continue; }
      const I = await ev(page, id => { const I = window.G.cozy.exp.info(id, ['hero:moka'], { meals: { roastedVeggies: 1 } }); return { ok: I.ok, r: I.r, why: I.why }; }, target);
      if (I.ok && I.r >= 0.85) {
        const r = await sendVia(page, 'story', target, ['hero:moka'], { shotName: target === 'quest:king' && !kingTry ? 'a3-board-king' : target === 'relief:bamboo' && !reliefTry ? 'a5-board-relief' : null });
        if (target === 'quest:king') kingTry++; else reliefTry++;
        if (!r.sent) { log('send failed', target, JSON.stringify(r)); break; }
        await skip(page, 6.1); await sleep(page, 600);
        if (target === 'quest:king' && await ev(page, () => window.G.state.quests.done.includes('king'))) kingRep = await readReport(page, 'a4-report-king');
        if (target === 'relief:bamboo' && await ev(page, () => window.G.state.zones.bamboo.village === 'saved')) relief = await readReport(page, 'a6-report-relief');
        continue;
      }
    }
    const err = await pickErrand();
    if (!err) { await sleepNight(); continue; }
    if (!(await sendErrand(page, err, ['hero:moka'])).sent) { await sleepNight(); continue; }
    trips++; await skip(page, 3.05);
    if (trips % 4 === 0) await sleepNight();
  }
  const kr = await ev(page, () => { const G = window.G; return { done: G.state.quests.done.includes('king'), owed: G.state.quests.owed?.mochiKing || null, trophy: G.state.furniture?.trophyMochiCrown || 0, uniques: [...G.state.inventory || [], ...G.state.stash || []].filter(it => it?.rarity === 'unique').length, next: G.state.quests.active.map(q => q.id) }; });
  R.check('a) "The King of Squish" by Moka\'s crew: the quest done, King Mochi\'s crown cushion in storage, his quest unique owed to your own win (none in the bag)', kr.done && kr.trophy === 1 && kr.owed?.quest === 'king' && kr.uniques === 0 && /King of Squish: done/.test(kingRep?.ribbon || '') && /Crown Cushion/.test(kingRep?.loot || ''), { kr, kingRep, kingTry });
  const sv = await ev(page, () => { const Z = window.G.state.zones.bamboo; return { village: Z.village, by: Z.savedBy, celebrate: Z.celebrate, crew: Z.celebrateCrew, banner: window.G.state.furniture?.bannerGaleclaw || 0 }; });
  R.check('a) Takemori relieved by a crew: saved by the crew, its celebration waiting for your arrival, Galeclaw\'s torn banner in storage', sv.village === 'saved' && sv.by === 'crew' && sv.celebrate && sv.crew?.includes('hero:moka') && sv.banner === 1 && /Takemori Village is saved/.test(relief?.ribbon || ''), { sv, relief, reliefTry, trips });
  // the arrival: the crew's celebration in the square
  await ev(page, () => window.G.travel.go('bamboo'));
  await waitMode(page, 'dungeon', 30000);
  await page.waitForFunction(() => window.G.dungeon?.village?.celebrate?.stage >= 2, null, { timeout: 15000 }).catch(() => {});
  await sleep(page, 1400);
  const party = await ev(page, () => { const G = window.G, V = G.dungeon.village; return { party: V.party, stage: V.celebrate?.stage, crew: (V.crew?.members || []).map(m => m.name), near: (V.crew?.members || []).every(m => Math.hypot(m.actor.pos.x - G.player.pos.x, m.actor.pos.z - G.player.pos.z) < 7), saved: V.savedGroup?.visible, banner: document.querySelector('.banners')?.textContent || '', flag: G.state.zones.bamboo.celebrate }; });
  await shot(page, 'a7-arrival-celebration');
  R.check('a) the arrival in Bamboo: the crew (Moka) stands in the square by the shrine, the saved village grows in, the banner names the crew; it plays once', party.party && party.stage >= 2 && party.crew.includes('Moka') && party.near && party.saved && /is saved/.test(party.banner) && /Moka/.test(party.banner) && party.flag === false, party);
  await page.waitForFunction(() => !window.G.dungeon?.village?.celebrate, null, { timeout: 20000 }).catch(() => {});
  const gone = await ev(page, () => ({ crew: !!window.G.dungeon.village.crew, kills: window.__fights.kills }));
  R.check('a) the crew heads home after the cheer (no actors left behind)', !gone.crew, gone);
  // Poe joins in the calm grove (her scene: she tails you, you catch her)
  // (onto the trail by the village: the shrine's steps and fences hem the arrival spot in)
  await ev(page, () => { const G = window.G, P = G.player, tr = G.dungeon.layout.plan.trail; let bi = 0, bd = 1e9; for (let j = 0; j < tr.length; j++) { const q = Math.hypot(tr[j][0] - P.pos.x, tr[j][1] - P.pos.z); if (q < bd) { bd = q; bi = j; } } P.setPos(tr[bi][0], tr[bi][1]); });
  const walk = async n => { for (let i = 0; i < n; i++) { await ev(page, () => { const G = window.G, P = G.player, tr = G.dungeon?.layout?.plan?.trail, ok = (x, z) => G.world.walkable(x, z) && !G.world.collision?.solidAt?.(x, z, 0.3); if (!tr) return; let bi = window.__walkI || 0, bd = 1e9; for (let j = 0; j < tr.length; j++) { const q = Math.hypot(tr[j][0] - P.pos.x, tr[j][1] - P.pos.z); if (q < bd) { bd = q; bi = j; } } window.__walkI = bi; const nx = tr[Math.min(tr.length - 1, bi + 2)], L = Math.hypot(nx[0] - P.pos.x, nx[1] - P.pos.z) || 1, d = { x: (nx[0] - P.pos.x) / L, z: (nx[1] - P.pos.z) / L }; const x = P.pos.x + d.x * 0.35, z = P.pos.z + d.z * 0.35; if (ok(x, z)) { P.setPos(x, z); P.facing = P.faceTarget = Math.atan2(d.x, d.z); } }); await sleep(page, 55); } };
  for (let k = 0; k < 6 && (await ev(page, () => window.G.heroes.poeJoin.state)) !== 'tail'; k++) await walk(30);
  await page.waitForFunction(() => { const J = window.G.heroes.poeJoin; return J.state === 'tail' && J.poe; }, null, { timeout: 20000 }).catch(() => {});
  await ev(page, () => { const J = window.G.heroes.poeJoin, P = window.G.player; if (J.poe) P.setPos(J.poe.pos.x + 1.4, J.poe.pos.z + 0.8); });
  await page.waitForFunction(() => window.G.ui.dlg?.active, null, { timeout: 12000 }).catch(() => {});
  await drainDialogue(page, [1, 0]);
  await page.waitForFunction(() => window.G.state.flags.poeJoined, null, { timeout: 10000 }).catch(() => {});
  const poe = await ev(page, () => ({ joined: !!window.G.state.flags.poeJoined, lvl: window.G.state.heroes.poe?.player?.lvl, kills: window.__fights.kills }));
  R.check('a) Poe joins in the calm grove (her scene, no fight)', poe.joined && poe.kills === 0, poe);
  await ev(page, () => window.G.returnToVillage()); await waitMode(page, 'village', 30000); await sleep(page, 1500);
  // the dungeon: Moka and Poe, a lunch each and 2 Heart Treats; errands (Bamboo's too) until the odds are good
  let clear = null, dTry = 0;
  for (let k = 0; k < 400; k++) {
    const st = await ev(page, () => { const G = window.G, E = G.state.cozy.exp, t = k => (E.tired[k] || 0) - G.cozy.clock.h; return { crew: G.state.zones.bamboo.dungeon.crew, rest: Math.max(t('hero:moka'), t('hero:poe')), out: E.active.length, lunch: G.state.pantry.roastedVeggies || 0, pots: G.state.potions.heart || 0, rank: G.sim.stats.rank, I: (() => { const I = G.cozy.exp.info('dungeon:bamboo', ['hero:moka', 'hero:poe'], { meals: { roastedVeggies: 2 }, potions: 2 }); return I && { ok: I.ok, r: Math.round(I.r * 100) / 100, why: I.why }; })(), lv: [G.state.heroes.moka.player.lvl, G.state.heroes.poe.player.lvl] }; });
    log('d', k, JSON.stringify(st));
    if (st.crew > 0) break;
    if (st.out) { await skip(page, 1); continue; }
    if (st.rest > 0) { await skip(page, st.rest + 0.1); continue; }
    if (st.rank < 2) { await growTown(page, 6); continue; }
    if (st.lunch < 2) { await sleepNight(); continue; }
    if (st.I?.ok && st.I.r >= 0.85) {
      const r = await sendVia(page, 'story', 'dungeon:bamboo', ['hero:moka', 'hero:poe'], { potions: 2, shotName: dTry ? null : 'a8-board-dungeon' }); dTry++;
      if (!r.sent) { log('dungeon send failed', JSON.stringify(r)); break; }
      await skip(page, 10.1); await sleep(page, 800);
      if (await ev(page, () => window.G.state.zones.bamboo.dungeon.crew > 0)) clear = await readReport(page, 'a9-report-dungeon');
      continue;
    }
    // errands for both, the best first
    let sent = 0;
    for (const who of ['hero:moka', 'hero:poe']) {
      const err = await ev(page, who => { const G = window.G, L = G.cozy.exp.objectives('errands').map(o => ({ id: o.id, I: G.cozy.exp.info(o.id, [who], {}) })).filter(x => x.I.ok); L.sort((a, b) => b.I.need - a.I.need); return L[0]?.id || null; }, who);
      if (err && (await sendErrand(page, err, [who])).sent) sent++;
    }
    if (!sent) { await sleepNight(); continue; }
    await skip(page, 3.05); if (k % 3 === 2) await sleepNight();
  }
  const dc = await ev(page, () => { const G = window.G, d = G.state.zones.bamboo.dungeon; return { crew: d.crew, cleared: d.cleared, t1: d.tier.unlocked, maple: G.travel.list().find(x => x.id === 'maple').unlocked, fan: G.state.furniture?.trophyTenguFan || 0, kills: window.__fights.kills, bosses: window.__fights.bosses.slice(), ev: window.__ev.filter(e => e[0] === 'dungeon:cleared' || e[0] === 'tier:unlocked') }; });
  R.check('a) THE HEADLINE: "Clear the Bamboo Depths" by Moka and Poe: dungeon.crew 1 (cleared stays 0: the boss unique waits for you), the Maple Hollow open, Tier 1 at its Spirit Lantern, the Tengu\'s fan; zero kills, no boss fallen', dc.crew === 1 && dc.cleared === 0 && dc.t1 === 1 && dc.maple && dc.fan === 1 && dc.kills === 0 && !dc.bosses.length && dc.ev.some(e => e[0] === 'dungeon:cleared' && e[1] === 'crew') && dc.ev.some(e => e[0] === 'tier:unlocked') && /Bamboo Depths is clear/.test(clear?.ribbon || ''), { dc, clear, dTry });
  // the Travel Map's 救 stamp
  await ev(page, () => { window.G.ui.closeAll(); window.G.openTravel({ select: 'bamboo' }); }); await sleep(page, 900);
  const tv = await ev(page, () => ({ stamp: document.querySelector('.tv-pin[data-id="bamboo"] .tv-stamp')?.textContent, crew: document.querySelector('.tv-pin[data-id="bamboo"] .tv-stamp')?.classList.contains('crew'), card: document.querySelector('.tv-card')?.textContent || '' }));
  await shot(page, 'a10-travel-stamp');
  await ev(page, () => window.G.ui.closeAll());
  R.check('a) the Travel Map stamps Bamboo 救 (relieved by a crew), its card says "cleared by a crew"', tv.stamp === '救' && tv.crew && /cleared by a crew/.test(tv.card), tv);
  const hx = await ev(page, () => window.__hxp);
  R.check('a) homestead XP: the farming, cooking and building along the way paid the hero you walk with (COZY §3.3)', hx > 0, { hxp: hx });
  const swap = await ev(page, () => { const G = window.G, n = G.npcs.find(x => x.id === 'usagi'), t = G.story.scavengeRequest(n); return { type: t.steps[0].type, mat: t.steps[0].mat, n: t.steps[0].n, text: t.text }; });
  R.check('a) the kill-request swap: a "defeat yokai" ask can come as a gathering ask instead (driftwood, river stones, petals, bones)', swap.type === 'deliver' && ['wood', 'stone', 'petal', 'bone'].includes(swap.mat) && swap.n >= 2, swap);
  const jr = await ev(page, () => ({ chewy: window.G.state.player.lvl, kills: window.__fights.kills, bosses: window.__fights.bosses.length, h: Math.round(window.G.cozy.clock.h) }));
  R.note(`a) the whole cozy route: ${jr.h} world hours, Chewy L${jr.chewy} (quest rewards only), ${jr.kills} kills, ${jr.bosses} bosses`);
  // b) the keepsakes in Chewy's cottage
  if (want('b')) {
    await ev(page, () => window.G.openHome()); await waitMode(page, 'interior'); await sleep(page, 600);
    await page.keyboard.press('b'); await sleep(page, 800);
    const placed = await ev(page, async () => {
      const G = window.G, D = G.housing.decor, W = G.world, P = await import('/src/home/placement.js'), F = await import('/src/home/furniture.js');
      const [px, pz] = W.cellAt(G.player.pos.x, G.player.pos.z), out = {};
      // floor pieces along the back walls, spread out; a wall piece low on the back wall's middle, where the game camera frames it
      const spot = (id, mount) => {
        const cands = [];
        if (mount === 'wall') { for (const side of ['n', 'w']) for (let u = 0; u < (side === 'n' ? W.S.W : W.S.D); u++) for (const y of [0.5, 0.75]) cands.push({ id, mount, side, x: side === 'n' ? u : 0, z: side === 'n' ? 0 : u, y, rot: 0, w: Math.abs(u - (side === 'n' ? W.S.W : W.S.D) / 2) + (side === 'n' ? 0 : 0.5) + y }); cands.sort((a, b) => a.w - b.w); }
        else for (let z = 1; z < W.S.D - 1; z++) for (let x = 0; x < W.S.W; x++) for (const rot of [0, 3]) { if (W.items.some(i => window.__kept?.includes(i) && Math.abs(i.x - x) + Math.abs(i.z - z) < 3)) continue; cands.push({ id, mount, x, z, rot }); }
        for (const c of cands) { const { w, ...q } = c; void w; if (P.canPlace(W.layout, W.items, { k: 999, ...q }, { player: { x: px, z: pz }, guests: [] }).ok) return q; }
        return null;
      };
      for (const id of ['trophyMochiCrown', 'trophyTenguFan', 'bannerGaleclaw']) { const d = F.FURNITURE[id], c = spot(id, d.mount); if (c && (G.state.furniture[id] || 0) > 0) { D.select(id); D.place({ ...c, k: undefined }); out[id] = [c.x, c.z, c.rot, c.side || '']; (window.__kept ||= []).push(W.items[W.items.length - 1]); } }
      return { out, n: W.items.filter(i => F.FURNITURE[i.id]?.trophy).length, store: { mochi: G.state.furniture.trophyMochiCrown || 0 } };
    });
    await page.keyboard.press('b'); await sleep(page, 600);
    await ev(page, () => { for (const e of document.querySelectorAll('.ui-root')) e.style.opacity = '0'; }); await sleep(page, 900);
    await shot(page, 'b-trophies-in-the-cottage');
    await ev(page, () => { for (const e of document.querySelectorAll('.ui-root')) e.style.opacity = ''; });
    R.check('b) the keepsakes go into a room with the decorate mode (King Mochi\'s cushion, the Tengu\'s fan, Galeclaw\'s banner on the wall)', placed.n === 3 && placed.store.mochi === 0, placed);
    await ev(page, () => window.G.housing.exit({ instant: true })); await sleep(page, 500);
  }
  // the save at this point carries on in part d (a fresh browser: the whole story from this same game)
  { const snap = await ev(page, () => { window.G.save(); return { save: localStorage.getItem('chewy3d.save'), kills: window.__fights.kills, bosses: window.__fights.bosses.length }; }); fs.writeFileSync(new URL('after-a.json', OUT), JSON.stringify(snap)); }
  errs.push(...errors); warns.push(...w); await browser.close();
}

// ================================================================== d) the whole story: the other three zones, still no fights
// (from the save part a left at the Bamboo Depths' clear: tools/qa/tmp/s37-cozy-story/after-a.json; ONLY=d reuses the last one)
// part d is opt-in (~1.5 h): S37_FULL=1 (run-all s37-full), or ONLY=d to replay it from the last part a's save
const wantD = process.env.S37_FULL === '1' || !!process.env.ONLY?.includes('d');
if (wantD && fs.existsSync(new URL('after-a.json', OUT))) {
  const { browser, page, errors, warns: w } = await launch({ w: 1600, h: 900 });
  await boot(page, 'fresh&nointro&notut&hour=9');
  const snap = JSON.parse(fs.readFileSync(new URL('after-a.json', OUT), 'utf8'));
  await ev(page, s => { window.G.saveBlocked = true; localStorage.setItem('chewy3d.save', s); }, snap.save);
  await page.goto(`${BASE}/?nointro&notut&notitle&dseed=1`); await page.waitForFunction(() => window.__ready === true && window.G?.player, null, { timeout: 60000 }); await sleep(page, 2500);
  await ev(page, k => { const G = window.G; window.__fights = { kills: k, bosses: [] }; G.events.on('monster:killed', () => window.__fights.kills++); G.events.on('boss:dead', e => window.__fights.bosses.push(e?.id)); G.ui.closeAll(); }, snap.kills + snap.bosses);
  // the farm: every tile of the cottage's beds (lunches for bigger crews), the same round each morning as in part a
  const farm = { tiles: await ev(page, () => window.G.life.garden.beds.flatMap(b => b.tiles)) };
  const tend = async (fn) => { for (const i of farm.tiles) { await ev(page, ([i, fn]) => { const g = window.G.life.garden, r = g.rec(i); if (fn === 'plant' && !r?.crop) { if (!(window.G.state.pantry.turnipSeed > 0)) window.G.actions.buyPantry('turnipSeed', 10, 6); if (!g.tilled(i)) { g.ensure(i).till = true; g.draw(i); } g.plant(i, 'turnipSeed'); } else if (fn === 'water' && r?.crop) g.water(i); else if (fn === 'harvest' && r?.crop && r.stage >= 2) g.harvest(i); }, [i, fn]); await page.waitForFunction(() => !window.G.life.tools.busy, null, { timeout: 4000 }).catch(() => {}); await sleep(page, 40); } };
  await ev(page, () => { const G = window.G, t = G.life.garden.tiles.get(G.life.garden.beds[0].tiles[0]); G.player.setPos(t.x + 0.5, t.z - 0.6); });
  const sleepNight = async () => { await ev(page, () => window.G.sleep()); await sleep(page, 400); await waitIdle(page); await drainDialogue(page); await tend('harvest'); await tend('plant'); await tend('water'); await ev(page, () => { const P = window.G.state.pantry; if ((P.turnip || 0) >= 2) window.G.actions.cook('roastedVeggies', Math.floor(P.turnip / 2)); }); };
  await tend('plant'); await tend('water');
    // a zone villager's quests by crew (COZY §3.2): Okami Fuku's missing cook and Chiku's ledger, offered in the saved village
    const zq = await ev(page, () => { const G = window.G, offers = [...G.story.zoneOffers('tk_fuku', 'bamboo'), ...G.story.zoneOffers('tk_chiku', 'bamboo')]; for (const id of ['tk_kome', 'tk_ledger']) if (offers.includes(id)) G.story.start(id, true); return { offers, list: G.cozy.exp.objectives('village').map(o => o.id) }; });
    R.check('d) the zone villagers\' quests: the steps in the Bamboo Depths turn up on the Board\'s Villages tab', zq.list.includes('zq:tk_kome:0') && zq.list.includes('zq:tk_ledger:0'), zq);
    await atBoard(page); await click(page, '.p-exp .ex-tab[data-v="village"]'); await click(page, '.p-exp .ex-obj[data-o="zq:tk_kome:0"]'); await sleep(page, 400); await shot(page, 'd1-board-villages'); await ev(page, () => window.G.ui.closeAll());
    // the farm takes every tile of the cottage's bed now (lunches for bigger crews)
    // the driver: one look at the board a wave (the API the Board's Send off calls; the clicks are proven above)
    await ev(page, () => {
      const G = window.G, X = G.cozy.exp;
      const free = () => X.members().filter(m => !m.active && !m.away && !(m.tired > 0) && !m.onBreak);
      const supFor = (o, crew) => ({ meals: X.pickMeals(X.mealsNeeded(o, crew)), potions: Math.min(3, G.state.potions.heart || 0) });
      const pick = (o, want, pool) => { const s = pool.slice().sort((a, b) => b.power - a.power), crew = []; for (const m of s) { if (crew.length >= (G.state.cozy.guild.level >= 3 ? 5 : 4)) break; crew.push(m.key); const I = X.info(o.id, crew, supFor(o, crew)); if (I.ok && I.r >= want) return crew; } return null; };
      window.__czWave = () => {
        const out = { sent: [], notes: [] }, st = G.state, T = X.town();
        // the Adventurers' Guild: built on a civic plot once rank 2 opens (paid), upgraded as the ranks open, hires signed on
        const g = G.cozy.guild;
        if (!g.built() && T.rank >= 2 && G.actions.hasMaterials({ coins: 400, wood: 30, stone: 16, petal: 4 })) {
          for (const pl of window.__civic || []) { const sp = G.sim.spotFor(pl, 'guild', 1); if (sp && G.sim.place('guild', sp.x, sp.z, sp.rot, { plot: pl.id })) { out.notes.push('the Guild built'); break; } }
        }
        if (g.built() && g.upgradeInfo().ok && !G.housing?.ext?.busy) { if (g.upgrade()) out.notes.push(`the Guild to L${g.level + 1}`); }
        if (g.built()) for (const c of g.candidates()) if (c.check?.ok && (st.coins || 0) > c.fee + 400) { const r = g.hire(c.i); if (r?.ok !== false) out.notes.push(`hired ${c.name} L${c.lvl}`); }
        // the town: home upgrades once rank 3 opens, while short of rank 4 (the player's own Upgrade, paid)
        if (T.rank >= 3 && T.rank < 4 && !G.housing?.ext?.busy) { const rec = G.sim.list.find(r => r.data.type === 'home' && G.housing.upgradeInfo(r.data).ok); if (rec && (st.coins || 0) > 900) { G.housing.upgrade(rec); out.notes.push('a home upgraded'); } }
        // potions for the dungeons (Rosie's shop)
        while ((st.potions.heart || 0) < 3 && (st.coins || 0) > 600) if (!G.actions.buyItem({ kind: 'potion', key: 'heart' }, 25)) break;
        // the story and the villages first: a relief at r ≥ 0.75, a dungeon or a quest step at good odds
        for (const o of [...X.objectives('story'), ...X.objectives('village')]) {
          const want = o.kind === 'siege' ? 0.75 : 0.85, crew = pick(o, want, free()); if (!crew) continue;
          const r = X.send(o.id, crew, supFor(o, crew)); if (r?.ok) out.sent.push(o.id); else out.notes.push(`${o.id}: ${r?.why}`);
        }
        // errands: heroes first, the hires keep two of today's for each hero
        const heroes = free().filter(m => m.type === 'hero'), hires = free().filter(m => m.type === 'hire');
        for (const m of [...heroes, ...hires]) {
          const L = X.objectives('errands'); if (m.type === 'hire' && L.length <= 2 * heroes.length) continue;
          const best = L.map(o => ({ o, I: X.info(o.id, [m.key], {}) })).filter(x => x.I.ok).sort((a, b) => b.o.level - a.o.level)[0];
          if (best && X.send(best.o.id, [m.key], {})?.ok) out.sent.push(best.o.id);
        }
        out.next = Math.min(99, ...X.list().map(e => X.left(e)));
        return out;
      };
    });
    await ev(page, async () => { const { PLOTS } = await import('/src/world/plots.js'); window.__civic = PLOTS.filter(p => /civic/.test(p.id)); });
    await ev(page, () => { window.__czKills0 = window.__fights.kills; window.__hxp = 0; window.G.events.on('homestead:xp', e => { window.__hxp += e?.xp || 0; }); });
    const t0 = Date.now(); let waves = 0, nights = 0, lastNote = '';
    for (let k = 0; k < 4000 && Date.now() - t0 < 110 * 60e3; k++) { // (each wave's crews come home and walk into town: about 10 s a wave)
      const done = await ev(page, () => window.G.state.zones.onsen.dungeon.crew > 0);
      if (done) break;
      const w = await ev(page, () => window.__czWave()); waves++;
      const story = w.sent.filter(id => !/^errand/.test(id));
      if (story.length || w.notes.length) { lastNote = `${story.join(',')} ${w.notes.join(',')}`; log(`w${waves} h${Math.round(await ev(page, () => window.G.cozy.clock.h))} ${lastNote}`); }
      const st = await ev(page, () => ({ out: window.G.cozy.exp.list().length, lunch: window.G.state.pantry.roastedVeggies || 0, rank: window.G.sim.stats.rank, pop: window.G.sim.stats.population }));
      if (st.pop < 50) { await ev(page, () => { const sim = window.G.sim; sim.autoZone(1, 2, 0, 110); sim.autoZone(2, 1, 0, 110); sim.autoZone(3, 1, 0, 110); }); await growTown(page, 3); } // (the player paints more zones: B → Zones; the town's own growth fills them)
      if (waves % 25 === 0) log(`w${waves} h${Math.round(await ev(page, () => window.G.cozy.clock.h))} rank ${st.rank} pop ${st.pop} ${JSON.stringify(await ev(page, () => ({ lv: ['moka', 'poe'].map(id => window.G.state.heroes[id].player.lvl), hires: window.G.state.cozy.guild.hires.map(h => h.lvl), g: window.G.state.cozy.guild.level, coins: window.G.state.coins, zones: ['bamboo', 'maple', 'tidepool', 'onsen'].map(z => window.G.state.zones[z].village[0] + window.G.state.zones[z].dungeon.crew) })))}`);
      if (!w.sent.length) { if (st.out && w.next < 30) { await skip(page, Math.max(0.3, w.next + 0.05)); await sleep(page, 200); continue; } await sleepNight(); nights++; await growTown(page, 2); continue; }
      await skip(page, Math.max(0.3, w.next + 0.05)); await sleep(page, 200);
    }
    const end = await ev(page, () => { const G = window.G, Z = z => G.state.zones[z]; return { saved: ['bamboo', 'maple', 'tidepool', 'onsen'].map(z => Z(z).village === 'saved' && Z(z).savedBy), crew: ['bamboo', 'maple', 'tidepool', 'onsen'].map(z => Z(z).dungeon.crew), cleared: ['bamboo', 'maple', 'tidepool', 'onsen'].map(z => Z(z).dungeon.cleared), t1: ['bambooDepths', 'mapleRoots', 'tideCaves', 'onsenCaverns'].map(id => G.lantern?.info?.(id)?.tierOpen || 0), trophies: Object.keys(G.state.furnitureFound || {}).filter(id => /^(trophy|banner)/.test(id)).length, kills: window.__fights.kills, bosses: window.__fights.bosses.length, h: Math.round(G.cozy.clock.h), guild: G.state.cozy.guild.level, hires: G.state.cozy.guild.hires.map(h => h.lvl), lv: ['moka', 'poe'].map(id => G.state.heroes[id].player.lvl), chewy: G.state.player.lvl, rank: G.sim.stats.rank, kome: Z('bamboo').quests.rescued?.includes('tk_kome'), komeStep: G.state.quests.active.find(q => q.id === 'tk_kome')?.step ?? (G.state.quests.done.includes('tk_kome') ? 'done' : null), ledger: G.state.quests.active.find(q => q.id === 'tk_ledger')?.step ?? null, hxp: window.__hxp }; });
    R.note(`d) the whole story: ${waves} waves, ${nights} nights, ${end.h} world hours (${(end.h * 35 / 3600).toFixed(1)} h of clock), ${Math.round((Date.now() - t0) / 1000)} s of test`);
    R.check('d) THE WHOLE STORY with no fights: all four villages saved by crews, all four zone dungeons cleared by crews (dungeon.cleared still 0: every boss unique waits), every Lantern\'s Tier 1 awake, 4 + 4 + 1 keepsakes', end.saved.every(Boolean) && end.crew.every(n => n === 1) && end.cleared.every(n => n === 0) && end.t1.every(n => n === 1) && end.trophies >= 9 && end.kills === 0 && end.bosses === 0, end);
    R.check('d) the zone villagers\' quests by crew: Kome walked home (rescued, living in Takemori), the ledger found; both wait for your turn-in talk', end.kome && end.komeStep === 1 && end.ledger === 1, end);
    await ev(page, () => { window.G.ui.closeAll(); window.G.openTravel({ select: 'onsen' }); }); await sleep(page, 900);
    await shot(page, 'd2-travel-all-four'); await ev(page, () => window.G.ui.closeAll());
    errs.push(...errors); warns.push(...w); await browser.close();
}

// ================================================================== c) all four sieges: their gates, the camps you broke, the relief, the celebration on arrival
if (want('c')) {
  const { browser, page, errors, warns: w } = await launch({ w: 1600, h: 900 });
  await boot(page, 'fresh&nointro&notut&hour=11');
  // (not the headline: the gates are set straight in the save here; a) plays the path itself)
  await ev(page, () => { const G = window.G; G.state.flags.mokaJoined = true; G.state.flags.poeJoined = true; G.state.heroes.moka.player.lvl = 30; G.state.heroes.poe.player.lvl = 30; G.state.pantry = { roastedVeggies: 20 }; G.heroes.spawnBench(); G.sim.tickT = -1e9; });
  const gates = await ev(page, () => { const G = window.G, out = {}; for (const z of ['maple', 'tidepool', 'onsen']) { G.state.zones[z].unlocked = true; } for (const z of ['bamboo', 'maple', 'tidepool', 'onsen']) { const o = G.cozy.exp.objectives('story').find(x => x.id === `relief:${z}`); out[z] = o ? G.cozy.exp.info(o.id, ['hero:moka'], { meals: { roastedVeggies: 1 } }).checks.map(c => [c.label, c.ok]) : null; } return out; });
  R.check('c) all four reliefs are on the Board once their zones open, each with its gate (Takemori: the Guild, a crew of 2 or lunches; Akane rank 3; Shiokaze rank 3 + Guild L2; Yukimi Guild L3)', gates.bamboo && gates.maple?.[0]?.[0] === 'Village rank 3' && gates.tidepool?.length === 2 && /Guild level 2/.test(gates.tidepool[1][0]) && /Guild level 3/.test(gates.onsen?.[0]?.[0] || ''), gates);
  await ev(page, () => { const G = window.G; G.state.village.rankFloor = 4; G.sim.simulate(); G.cozy.guild.debugBuild?.(); G.state.cozy.guild.level = 3; });
  // the camps you broke shrink the relief (Akane: two of three camps broken by you)
  const need = await ev(page, () => window.G.cozy.exp.info('relief:maple', ['hero:moka'], { meals: { roastedVeggies: 1 } }).need);
  const camps = await ev(page, async () => { const G = window.G, { VILLAGES } = await import('/src/regions/village/data.js'), Z = G.state.zones.maple; Z.siegeCamps = VILLAGES.maple.camps.map((c, i) => ({ id: c.id, cleared: i < 2 })); return { need: G.cozy.exp.info('relief:maple', ['hero:moka'], { meals: { roastedVeggies: 1 } }).need, power: G.cozy.exp.objective('relief:maple').power }; });
  R.check('c) the camps you broke shrink the relief: two of three broken in Akane, half the power left (the captain is the last quarter)', need === camps.power && camps.need === Math.round(camps.power * 0.5), { need, camps });
  for (const z of ['bamboo', 'maple', 'tidepool', 'onsen']) {
    const s = await ev(page, z => { const G = window.G, t = G.state.cozy.exp.tired; for (const k in t) delete t[k]; return G.cozy.exp.send(`relief:${z}`, ['hero:moka', 'hero:poe'], { meals: { roastedVeggies: 2 } }); }, z);
    await skip(page, 6.1); await sleep(page, 700);
    const sv = await ev(page, z => { const G = window.G, Z = G.state.zones[z], r = G.cozy.exp.reports().at(-1); return { sent: true, village: Z.village, by: Z.savedBy, celebrate: Z.celebrate, result: r?.result, trophy: r?.loot?.trophy, owned: G.state.furniture?.[r?.loot?.trophy] || 0 }; }, z);
    await ev(page, z => window.G.travel.go(z), z);
    await waitMode(page, 'dungeon', 30000);
    await page.waitForFunction(() => window.G.dungeon?.village?.celebrate?.stage >= 2, null, { timeout: 15000 }).catch(() => {});
    await sleep(page, 1600);
    const pt = await ev(page, () => { const G = window.G, V = G.dungeon.village, P = G.player, cam = G.engine.camera; const onScreen = p => { const v = p.clone().setY(p.y + 0.8).project(cam); return Math.abs(v.x) < 0.9 && v.y > -0.85 && v.y < 0.6; }; return { party: V?.party, stage: V?.celebrate?.stage, crew: (V?.crew?.members || []).map(m => m.name), seen: (V?.crew?.members || []).every(m => onScreen(m.actor.pos)), grown: V?.savedGroup?.visible }; });
    await shot(page, `c-celebration-${z}`);
    R.check(`c) ${z}: relieved by the crew (the captain's banner home), and on arrival the crew cheers in the square, on screen by the shrine`, s.ok && sv.village === 'saved' && sv.by === 'crew' && sv.result === 'success' && sv.owned === 1 && /^banner/.test(sv.trophy || '') && pt.party && pt.stage >= 2 && pt.crew.length === 2 && pt.seen && pt.grown, { s: s.ok ? 'sent' : s.why, sv, pt });
    await ev(page, () => window.G.returnToVillage()); await waitMode(page, 'village', 30000); await sleep(page, 1200);
  }
  errs.push(...errors); warns.push(...w); await browser.close();
}

console.log('  shots: ' + OUT.pathname);
process.exit(R.finish(errs, warns) ? 1 : 0);
