// Scenario 23: the zone villages (docs/ZONES.md §2–§3; ROADMAP Z-D1 to Z-D5): Takemori Village (bamboo) in depth (a–g),
// then Akane Hamlet, Shiokaze Port and Yukimi Spa Village (h).
//  a) besieged: the village builds mid-trail (6 buildings, boarded, 3 siege camps with monsters, 3 caged villagers,
//     the elder and the sensei hidden, the captain warded in the square, mode.villagePos); the buildings are shut
//  b) the siege: a camp falls → its record in zones.siegeCamps, its cage frees on F (villager:rescued); the siege's
//     progress survives a save and a reload; the last camp breaks the captain's ward
//  c) the captain: it wakes (the intro, its own boss bar, the boss slot), falls → saveVillage, village:saved, the
//     celebration (the siege comes down, the saved village grows in, everyone comes out)
//  d) saved persists: a reload and a new visit arrive at the Waypoint Shrine of a clean village, villagers out and about
//  e) quests: offered with '!' only once saved, accepted in dialogue, shown in the quest log; the dungeon provider
//     (G.story.dungeonObjectives) asks phase C for the right cages / drops per floor; simulated dungeon events
//     (quest:find, villager:rescued, a floor reached, the boss) move them; the turn-in pays and Kome moves in
//  f) the buildings: the shop opens with zone stock, the inn heals and is the zone's respawn point (a knock-out wakes
//     there), the dojo's respec, the craftshop turns forage into furniture, the waypoint opens the Travel Map
//  g) perf in the saved village with its villagers out; a village ⇄ zone round trip doesn't grow GPU memory
//  h) the other three: besieged → camps → their captain (its intro, the boss slot) → saved, villagers out; their
//     specials (the tea house's tea sets, the fish market, the boatyard, the bathhouse's soak, the smith's forge and
//     re-fold); the square's draw calls besieged and saved; all three stay saved over a reload
import { launch, boot, waitMode, sleep, makeReport, BASE, drainDialogue } from './lib.mjs';

const R = makeReport('S23 zone villages');
const { browser, page, errors, warns } = await launch({ w: 1600, h: 900 });
const ev = (fn, arg) => page.evaluate(fn, arg);
const V = () => ev(() => { const D = window.G.dungeon, Vl = D?.village; return Vl ? { saved: Vl.saved, b: Vl.buildings.length, camps: Vl.camps.map(c => ({ id: c.id, cleared: c.cleared, n: c.monsters.filter(m => m.alive).length })), cages: Vl.cages.map(c => ({ npc: c.npc, freed: !!c.freed })), vill: Object.fromEntries(Vl.villagers.map(v => [v.id, v.state])), cap: Vl.captain ? { alive: Vl.captain.alive, warded: Vl.captain.warded, aggro: Vl.captain.aggro, boss: D.boss === Vl.captain } : null, siegeVis: !!Vl.siegeGroup?.visible, savedVis: !!(Vl.savedGroup?.visible || Vl.savedStatic), villagePos: !!D.villagePos, zone: { ...window.G.state.zones.bamboo, dungeon: undefined } } : null; });
const killCamp = id => ev(cid => { const Vl = window.G.dungeon.village, c = Vl.camps.find(x => x.id === cid); for (const m of c.monsters) if (m.alive) m.takeDamage(m.life + 1, {}); }, id);
const enterZone = async () => { await ev(() => window.G.enterRegion('bamboo')); await waitMode(page, 'dungeon'); await page.waitForFunction(() => !!window.G.dungeon?.village?.villagers?.length, null, { timeout: 30000 }); await sleep(page, 500); };
const reload = async () => {
  await ev(() => window.G.save());
  await page.goto(`${BASE}/?notitle&nointro&notut&hour=11&dseed=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true && window.G?.player, null, { timeout: 60000 }); await sleep(page, 400);
  await ev(() => { window.__ev = []; for (const n of ['village:saved', 'villager:rescued', 'boss:spawn', 'boss:dead', 'quest:update', 'village:campCleared']) window.G.events.on(n, e => window.__ev.push([n, e && typeof e === 'object' ? { ...e } : e])); });
};
const evs = n => ev(k => window.__ev.filter(e => e[0] === k).map(e => e[1]), n);

try {
  await boot(page, 'fresh&nointro&notut&hour=11');
  await ev(() => { const G = window.G, P = G.state.player; G.story.markTalk('rosie'); G.state.flags.burrowTut = true; G.state.flags.hints = { sprint: true }; P.lvl = 8; G.actions.recompute(); window.__ev = []; for (const n of ['village:saved', 'villager:rescued', 'boss:spawn', 'boss:dead', 'quest:update', 'village:campCleared']) G.events.on(n, e => window.__ev.push([n, e && typeof e === 'object' ? { ...e } : e])); });
  await enterZone();

  // ---------------------------------------------------------------- a) besieged
  let s = await V();
  R.check('besieged: Takemori builds mid-trail — 6 buildings, the siege overlay up, the saved one hidden, mode.villagePos set', s && s.b === 6 && s.siegeVis && !s.savedVis && s.villagePos && !s.saved && s.zone.village === 'besieged', JSON.stringify(s && { b: s.b, siegeVis: s.siegeVis, savedVis: s.savedVis }));
  R.check('besieged: 3 siege camps with monsters, recorded in zones.bamboo.siegeCamps', s.camps.length === 3 && s.camps.every(c => c.n >= 4 && !c.cleared) && s.zone.siegeCamps.length === 3 && s.zone.siegeCamps.every(c => !c.cleared), JSON.stringify(s.camps));
  R.check('besieged: Chiku, Takumi and Fuku are caged; Grandma Sasa and Master Kazemaru hide; no townsfolk', s.vill.tk_chiku === 'caged' && s.vill.tk_takumi === 'caged' && s.vill.tk_fuku === 'caged' && s.vill.tk_sasa === 'hidden' && s.vill.tk_kazemaru === 'hidden' && !Object.keys(s.vill).some(k => k.includes('folk')) && !('tk_kome' in s.vill), JSON.stringify(s.vill));
  R.check('besieged: the captain holds the square, warded', s.cap?.alive && s.cap.warded && !s.cap.boss, JSON.stringify(s.cap));
  const shut = await ev(() => { const Vl = window.G.dungeon.village, it = Vl.inter.find(i => i.building?.kind === 'shop'); const n0 = window.G.ui?.isOpen?.('shop'); it.onInteract(); return { label: it.label, opened: !!window.G.ui?.isOpen?.('shop') && !n0 }; });
  R.check('besieged: the buildings are boarded up (a door says so and opens nothing)', /boarded up/.test(shut.label) && !shut.opened, JSON.stringify(shut));
  // the ward: blows glance off while the camps stand
  const ward = await ev(() => { const c = window.G.dungeon.village.captain, l = c.life; c.takeDamage(500, {}); return { before: l, after: c.life, aggro: c.aggro }; });
  R.check('besieged: the captain\'s banner ward turns blows aside while any camp stands', ward.after === ward.before && !ward.aggro, JSON.stringify(ward));

  // ---------------------------------------------------------------- b) the siege
  await killCamp('west');
  await page.waitForFunction(() => window.G.dungeon.village.camps.find(c => c.id === 'west').cleared, null, { timeout: 5000 }).catch(() => {});
  s = await V();
  const cage = await ev(() => { const Vl = window.G.dungeon.village, cg = Vl.cages.find(c => c.npc === 'tk_chiku'); return { label: cg.it.label, inList: window.G.world.interactables.includes(cg.it) }; });
  R.check('siege: a camp falls — zones.siegeCamps marks it cleared, its cage reads "Free Chiku"', s.camps.find(c => c.id === 'west').cleared && s.zone.siegeCamps.find(c => c.id === 'west').cleared && cage.label === 'Free Chiku' && cage.inList, JSON.stringify({ cage, rec: s.zone.siegeCamps }));
  const locked = await ev(() => { const Vl = window.G.dungeon.village, cg = Vl.cages.find(c => c.npc === 'tk_takumi'); cg.it.onInteract(); return { freed: !!cg.freed, label: cg.it.label }; });
  R.check('siege: a cage whose camp still stands stays shut', !locked.freed && /locked in/.test(locked.label), JSON.stringify(locked));
  await ev(() => { const Vl = window.G.dungeon.village, cg = Vl.cages.find(c => c.npc === 'tk_chiku'); window.G.player.setPos(cg.it.pos.x, cg.it.pos.z); cg.it.onInteract(); });
  await sleep(page, 400);
  const resc = await evs('villager:rescued');
  s = await V();
  R.check('siege: F frees Chiku — villager:rescued { npc, zone }, the cage opens, she runs home; zones.quests.freed records her', resc.some(e => e.npc === 'tk_chiku' && e.zone === 'bamboo' && !e.dungeon) && s.cages.find(c => c.npc === 'tk_chiku').freed && ['script', 'scared', 'idle'].includes(s.vill.tk_chiku) && s.zone.quests.freed.includes('tk_chiku'), JSON.stringify({ resc, chiku: s.vill.tk_chiku }));
  // the progress persists: reload, come back — the west camp stays cleared, Chiku stays free
  await ev(() => window.G.returnToVillage()); await waitMode(page, 'village');
  await reload(); await enterZone();
  s = await V();
  R.check('siege: its progress survives a save and a reload (the west camp stays down, Chiku stays free, the others still caged)', s.camps.find(c => c.id === 'west').cleared && s.camps.find(c => c.id === 'west').n === 0 && s.vill.tk_chiku === 'scared' && s.vill.tk_takumi === 'caged' && !s.cages.some(c => c.npc === 'tk_chiku') && s.cap?.warded, JSON.stringify({ camps: s.camps, vill: s.vill }));
  await killCamp('east'); await killCamp('south');
  await page.waitForFunction(() => window.G.dungeon.village.camps.every(c => c.cleared), null, { timeout: 5000 }).catch(() => {});
  await page.waitForFunction(() => window.G.dungeon.village.captain && !window.G.dungeon.village.captain.warded, null, { timeout: 6000 }).catch(() => {});
  s = await V();
  R.check('siege: the last camp breaks the captain\'s ward', s.camps.every(c => c.cleared) && s.cap && !s.cap.warded && (await evs('village:campCleared')).length === 2, JSON.stringify(s.cap));
  // free the other two
  await ev(() => { const Vl = window.G.dungeon.village; for (const cg of Vl.cages) if (!cg.freed) cg.it.onInteract(); });

  // ---------------------------------------------------------------- c) the captain
  await ev(() => { const Vl = window.G.dungeon.village, c = Vl.captain; window.G.player.setPos(c.pos.x + 3, c.pos.z + 3); window.G.companion.setPos(c.pos.x + 4, c.pos.z + 3.5); });
  await page.waitForFunction(() => { const c = window.G.dungeon.village.captain; return c.aggro && c.introDone; }, null, { timeout: 8000 }).catch(() => {});
  await sleep(page, 1200);
  const fight = await ev(() => { const G = window.G, D = G.dungeon, c = D.village.captain; return { aggro: c.aggro, intro: !!c.introDone, boss: D.boss === c, bar: G.ui?.hud?.boss?.key || null, name: c.name, mods: c.stats.mods, lvl: c.level, life: c.lifeMax }; });
  const spawn = await evs('boss:spawn');
  R.check('captain: it wakes with an intro (boss:spawn), takes the boss slot and shows its own boss bar; named, with elite mods', fight.aggro && fight.intro && fight.boss && fight.bar === fight.name && spawn.some(e => e.name === fight.name) && fight.mods.length >= 2, JSON.stringify(fight));
  await sleep(page, 2500); // (a few of its moves: no errors)
  await ev(() => { const c = window.G.dungeon.village.captain; c.takeDamage(c.life + 1, {}); });
  await page.waitForFunction(() => window.__ev.some(e => e[0] === 'village:saved'), null, { timeout: 6000 }).catch(() => {});
  // the celebration runs on game time (its slow-mo too): wait for the townsfolk to come out
  await page.waitForFunction(() => { const Vl = window.G.dungeon.village; return Vl.villagers.filter(v => v.folk).length === 3 && !Vl.siegeGroup?.visible; }, null, { timeout: 12000 }).catch(() => {});
  s = await V();
  const saved = await evs('village:saved');
  R.check('captain: its fall saves the village — saveVillage (zones.bamboo.village = saved, siegeCamps cleared), village:saved { zone } once, the boss slot handed back', saved.length === 1 && saved[0].zone === 'bamboo' && s.saved && s.zone.village === 'saved' && s.zone.siegeCamps.length === 0 && s.cap && !s.cap.alive && !s.cap.boss, JSON.stringify({ saved, z: s.zone.village }));
  R.check('celebration: the siege comes down, the saved village grows in, everyone comes out (the elder, the sensei, the freed, the townsfolk)', !s.siegeVis && s.savedVis && s.vill.tk_sasa !== 'hidden' && s.vill.tk_kazemaru !== 'hidden' && Object.keys(s.vill).filter(k => k.includes('folk')).length === 3 && Object.values(s.vill).every(v => v !== 'caged' && v !== 'hidden'), JSON.stringify(s.vill)); // (stepping out: 'script')

  // ---------------------------------------------------------------- d) saved persists
  await ev(() => window.G.returnToVillage()); await waitMode(page, 'village');
  await reload(); await enterZone();
  s = await V();
  const arrive = await ev(() => { const G = window.G, Vl = G.dungeon.village, wp = Vl.buildings.find(b => b.kind === 'waypoint'), P = G.player.pos; return { d: Math.hypot(P.x - wp.doorPos.x, P.z - wp.doorPos.z), monsters: G.dungeon.monsters.filter(m => m.siegeCamp || m.siegeCaptain).length }; });
  R.check('saved persists: after a reload the zone shows the clean village (no camps, cages or captain), villagers out, and travel arrives at the Waypoint Shrine', s.saved && !s.siegeVis && s.savedVis && !s.cap && s.cages.length === 0 && arrive.monsters === 0 && arrive.d < 2.5 && Object.values(s.vill).every(v => v === 'life'), JSON.stringify({ arrive, vill: s.vill }));
  await sleep(page, 6000);
  const life = await ev(() => window.G.dungeon.village.villagers.map(v => ({ id: v.id, moved: !!v.act || !!v.route, vis: v.visible })));
  R.check('saved: the villagers keep a routine (walking to their spots, posing there)', life.filter(v => v.moved).length >= 5 && life.every(v => v.vis), JSON.stringify(life));

  // ---------------------------------------------------------------- e) quests
  const mark = await ev(() => { const G = window.G, Vl = G.dungeon.village; Vl.markT = 0; Vl.updateMarkers(0.016, 0); const m = id => Vl.villager(id).marker?.visible ? Vl.villager(id).marker.userData.kind : null; return { sasa: m('tk_sasa'), chiku: m('tk_chiku'), kaze: m('tk_kazemaru'), fuku: m('tk_fuku'), takumi: m('tk_takumi') }; });
  R.check('quests: givers show a "!" once the village is saved (the sensei waits for the elder\'s quest)', mark.sasa === '!' && mark.chiku === '!' && mark.fuku === '!' && mark.takumi === '!' && !mark.kaze, JSON.stringify(mark));
  const talkTo = async (id, picks) => { await ev(i => { const Vl = window.G.dungeon.village; const v = Vl.villager(i); window.G.player.setPos(v.pos.x + 0.8, v.pos.z + 0.8); Vl.talk(v); }, id); await sleep(page, 300); return drainDialogue(page, picks); };
  for (const id of ['tk_sasa', 'tk_chiku', 'tk_fuku', 'tk_takumi']) await talkTo(id, [0]);
  const qs = await ev(() => { const G = window.G; return { active: G.state.quests.active.map(q => q.id), log: G.story.uiList().filter(q => q.id.startsWith('tk_')).map(q => ({ id: q.id, giver: q.giver, step: q.steps[q.steps.length - 1]?.text })) }; });
  R.check('quests: accepted in dialogue (Roots, the Ledger, the Missing Cook, Heartwood) and listed in the quest log with the giver\'s name', ['tk_roots', 'tk_ledger', 'tk_kome', 'tk_heartwood'].every(id => qs.active.includes(id)) && qs.log.find(q => q.id === 'tk_ledger')?.giver === 'Chiku', JSON.stringify(qs));
  const prov = await ev(() => { const S = window.G.story; return { f1: S.dungeonObjectives({ dungeon: 'bambooDepths', floor: 1, zone: 'bamboo', tier: 0 }), f2: S.dungeonObjectives({ dungeon: 'bambooDepths', floor: 2, zone: 'bamboo', tier: 0 }) }; });
  R.check('provider: G.story.dungeonObjectives asks for the ledger on floor 1, and Kome\'s cage and 3 heartwood on floor 2', prov.f1.length === 1 && prov.f1[0].item === 'tk_ledger' && prov.f1[0].kind === 'drop' && prov.f2.some(o => o.kind === 'cage' && o.npc === 'tk_kome') && prov.f2.some(o => o.item === 'tk_heartwood' && o.n === 3), JSON.stringify(prov));
  const ptr = await ev(() => { const G = window.G, t = G.story.target(); return t ? { label: t.label, kind: t.kind } : null; });
  R.check('pointer: outdoors in the zone, a dungeon objective points at the zone\'s gate (phase C: mode.gatePos) or nothing yet', !ptr || /Depths|gate|dungeon|village/i.test(ptr.label) || ptr.kind === 'npc', JSON.stringify(ptr));
  // the dungeon's events, simulated (phase C emits them)
  await ev(() => { const E = window.G.events; E.emit('quest:find', { item: 'tk_ledger', n: 1, zone: 'bamboo', dungeon: 'bambooDepths', floor: 1, tier: 0 }); E.emit('villager:rescued', { npc: 'tk_kome', zone: 'bamboo', dungeon: 'bambooDepths', floor: 2, tier: 0 }); for (let i = 0; i < 3; i++) E.emit('quest:find', { item: 'tk_heartwood', n: 1, zone: 'bamboo', dungeon: 'bambooDepths', floor: 2, tier: 0 }); window.G.state.zones.bamboo.dungeon.bestFloor = 2; window.G.story.progress('floor'); });
  await sleep(page, 300);
  const prog = await ev(() => { const G = window.G, Q = id => G.state.quests.active.find(q => q.id === id); return { ledger: Q('tk_ledger')?.step, kome: Q('tk_kome')?.step, heart: Q('tk_heartwood')?.step, roots: Q('tk_roots')?.step, rescued: G.state.zones.bamboo.quests.rescued, chikuMark: (G.dungeon.village.markT = 0, G.dungeon.village.updateMarkers(0.016, 0), G.dungeon.village.villager('tk_chiku').marker?.userData.kind) }; });
  R.check('quests: the dungeon events move them to their turn-in talk (the giver shows "!"), and Kome is recorded as rescued', prog.ledger === 1 && prog.kome === 1 && prog.heart === 1 && prog.roots === 1 && prog.rescued.includes('tk_kome') && prog.chikuMark === '!', JSON.stringify(prog));
  const coins0 = await ev(() => window.G.state.coins);
  await talkTo('tk_chiku', [0]);
  await sleep(page, 400);
  const paid = await ev(c0 => { const G = window.G; return { done: G.state.quests.done.includes('tk_ledger'), coins: G.state.coins - c0, shoots: G.state.pantry?.bamboo || 0 }; }, coins0);
  R.check('quests: the turn-in pays (coins, the zone\'s forage) and finishes the quest', paid.done && paid.coins >= 200 && paid.shoots >= 4, JSON.stringify(paid));
  for (const id of ['tk_sasa', 'tk_fuku', 'tk_takumi']) await talkTo(id, [0]);
  await sleep(page, 2200); // (furniture rewards land 1.8 s after the banner: Story.complete)
  const after = await ev(() => { const G = window.G; return { done: ['tk_roots', 'tk_kome', 'tk_heartwood'].filter(id => G.state.quests.done.includes(id)), furn: G.state.furniture || {}, hearts: G.state.friends.tk_sasa?.hearts || 0 }; });
  R.check('quests: the others turn in too (furniture finds, friendship with the zone villagers)', after.done.length === 3 && after.furn.bambooLantern >= 1 && after.furn.bambooPlanter >= 1 && after.hearts >= 1, JSON.stringify(after));
  // Kome moves in on the next visit
  await ev(() => window.G.returnToVillage()); await waitMode(page, 'village'); await enterZone();
  const kome = await ev(() => window.G.dungeon.village.villager('tk_kome')?.state || null);
  R.check('quests: Kome, rescued from the Depths, lives in the village on the next visit', kome === 'life', String(kome));

  // ---------------------------------------------------------------- f) the buildings
  const act = kind => ev(k => { const Vl = window.G.dungeon.village, it = Vl.inter.find(i => i.building?.kind === k); window.G.player.setPos(it.pos.x, it.pos.z); it.onInteract(); return it.label; }, kind);
  const shopL = await act('shop'); await sleep(page, 400);
  const shop = await ev(() => { const G = window.G, p = G.ui?.panels?.shop; return { open: !!G.ui?.isOpen?.('shop'), n: p?.entries?.length || 0, name: p?.opts?.name, pantry: (p?.opts?.pantry || []).map(e => e.id) }; });
  R.check('shop: Chiku\'s General Store opens with stock, potions and the grove\'s forage', /Shop at/.test(shopL) && shop.open && shop.n >= 10 && /Chiku/.test(shop.name) && shop.pantry.includes('bamboo'), JSON.stringify(shop));
  await ev(() => window.G.ui.close('shop')); await sleep(page, 300);
  await ev(() => { window.G.actions.setLife?.(10); const S = window.G.state.player; S.life = 10; });
  await act('inn'); await sleep(page, 300); await drainDialogue(page, [0]);
  const inn = await ev(() => { const G = window.G; return { life: G.actions.life(), max: G.derived.lifeMax, rest: G.state.zones.bamboo.quests.innRest }; });
  R.check('inn: resting heals fully', inn.life >= inn.max - 1 && inn.rest >= 1, JSON.stringify(inn));
  await ev(() => { const G = window.G; G.state.coins += 2000; G.state.player.skills.chomp = (G.state.player.skills.chomp || 0) + 2; G.state.player.skillPts = 0; });
  await act('dojo'); await sleep(page, 300); await drainDialogue(page, [0]);
  const dojo = await ev(() => { const P = window.G.state.player; return { pts: P.skillPts, skills: Object.keys(P.skills).length }; });
  R.check('dojo: the sensei\'s "forget and relearn" refunds every skill point', dojo.pts >= 2 && dojo.skills === 0, JSON.stringify(dojo));
  await ev(() => { const G = window.G; G.actions.addPantry('bamboo', 6); G.actions.addMaterial('wood', 20); });
  const f0 = await ev(() => window.G.state.furniture?.bambooLantern || 0);
  await act('craft'); await sleep(page, 300); await drainDialogue(page, [0]);
  const craft = await ev(f => ({ lantern: (window.G.state.furniture?.bambooLantern || 0) - f }), f0);
  R.check('craftshop: Takumi turns bamboo shoots and wood into a Bamboo Lantern (furniture storage)', craft.lantern === 1, JSON.stringify(craft));
  await act('waypoint'); await sleep(page, 500);
  const travel = await ev(() => !!window.G.ui?.isOpen?.('travel'));
  R.check('waypoint: the shrine opens the Travel Map', travel);
  await ev(() => window.G.ui.close('travel', true)); await sleep(page, 300);
  // the inn is the respawn point: a knock-out in the zone wakes there, alive
  await ev(() => { const G = window.G; G.player.setPos(G.dungeon.startPos.x, G.dungeon.startPos.z); G.events.emit('player:dead'); });
  await page.waitForFunction(() => { const G = window.G; return G.mode === 'dungeon' && !G.playerDead && !G.ui?.iris?.active && G.dungeon?.village; }, null, { timeout: 15000 }).catch(() => {});
  await sleep(page, 600);
  const wake = await ev(() => { const G = window.G, Vl = G.dungeon.village, inn = Vl.buildings.find(b => b.kind === 'inn'), P = G.player.pos; return { mode: G.mode, region: G.dungeon.regionId, d: Math.hypot(P.x - inn.doorPos.x, P.z - inn.doorPos.z), dead: G.playerDead, life: G.actions.life(), max: G.derived.lifeMax }; });
  R.check('inn: a knock-out in the zone wakes at the inn (not at home), healed', wake.mode === 'dungeon' && wake.region === 'bamboo' && wake.d < 2.5 && !wake.dead && wake.life >= wake.max - 1, JSON.stringify(wake));
  await drainDialogue(page);

  // ---------------------------------------------------------------- g) perf and leaks
  // CPU frame time (tick → end of render, like profile-horde) at the zone's arrival stone (the baseline, this machine
  // right now) and in the village square with its villagers out; the village passes at p95 ≤ max(8, baseline + 4) ms
  const perf = await ev(async () => {
    const G = window.G, E = G.engine, Vl = G.dungeon.village, P = G.player, rig = E.rig;
    const R = window.__cpu ||= (() => { const o = { t: [], on: false }; const tick = E.tick.bind(E), render = E.render.bind(E); E.tick = () => { o.t0 = performance.now(); return tick(); }; E.render = () => { render(); if (o.on) o.t.push(performance.now() - o.t0); }; return o; })();
    const at = async (x, z) => {
      P.setPos(x, z); rig.focus.copy(P.pos); rig.snap?.(); await new Promise(r => setTimeout(r, 1500));
      R.t = []; R.on = true; await new Promise(r => setTimeout(r, 2500)); R.on = false;
      const t = R.t.slice().sort((a, b) => a - b), q = k => +t[Math.min(t.length - 1, Math.floor(t.length * k))].toFixed(2);
      // draw calls and triangles per frame (the median over ~0.8 s of frames, counted round one E.render: REGIONS §4's unit)
      const R2 = E.renderer, er = E.render, cc = [], tt = []; E.render = function () { R2.info.autoReset = false; R2.info.reset(); const x = er.apply(this, arguments); cc.push(R2.info.render.calls); tt.push(R2.info.render.triangles); R2.info.autoReset = true; return x; }; await new Promise(r => setTimeout(r, 800)); E.render = er; cc.sort((a, b) => a - b); tt.sort((a, b) => a - b);
      const info = { calls: cc[cc.length >> 1], tris: tt[tt.length >> 1] };
      return { p50: q(0.5), p95: q(0.95), n: t.length, ...info };
    };
    const s0 = G.dungeon.campAnchor || G.world.cellToWorld(G.dungeon.layout.start.x, G.dungeon.layout.start.y);
    const base = await at(s0.x + 1, s0.z + 1), vil = await at(Vl.site.x, Vl.site.z);
    return { base, vil, villagers: Vl.villagers.length, limit: Math.max(8, base.p95 + 4) };
  });
  R.note(`perf (CPU frame, tick → render): the arrival stone p50 ${perf.base.p50} / p95 ${perf.base.p95} ms, ${perf.base.calls} calls, ${(perf.base.tris / 1e6).toFixed(2)} M tris; the saved village square (${perf.villagers} villagers out) p50 ${perf.vil.p50} / p95 ${perf.vil.p95} ms, ${perf.vil.calls} calls, ${(perf.vil.tris / 1e6).toFixed(2)} M tris (shadow passes included; per frame)`);
  R.check('perf: the saved village with its villagers out stays in budget (draw calls ≤ 450; CPU frame p95 ≤ max(8, the arrival stone p95 + 4) ms)', perf.vil.calls <= 450 && perf.vil.p95 <= perf.limit, JSON.stringify(perf));
  // (the lowest of a few samples: toasts, floating text and pooled fx come and go by a texture or two while idle)
  const mem = async () => { let geo = 1e9, tex = 1e9; for (let i = 0; i < 4; i++) { const r = await ev(() => { const m = window.G.engine.renderer.info.memory; return { geo: m.geometries, tex: m.textures }; }); geo = Math.min(geo, r.geo); tex = Math.min(tex, r.tex); await sleep(page, 250); } return { geo, tex }; };
  await ev(() => window.G.returnToVillage()); await waitMode(page, 'village'); await sleep(page, 600);
  const m0 = await mem();
  for (let i = 0; i < 2; i++) { await enterZone(); await ev(() => window.G.returnToVillage()); await waitMode(page, 'village'); await sleep(page, 600); }
  const m1 = await mem();
  R.check('leaks: two village ⇄ zone round trips don\'t grow GPU geometries or textures', m1.geo - m0.geo <= 6 && m1.tex - m0.tex <= 4, JSON.stringify({ m0, m1 })); // (≤ 4 textures: the region ⇄ village trip itself drifts ~0.7 a trip with no village at all — small quads and skinned depth passes, not the village's)

  // ---------------------------------------------------------------- h) the other three villages: siege → captain → saved, their specials, perf
  const OTHER = {
    maple: { name: 'Akane Hamlet', captain: 'Captain Strawgrin', lvl: 14, specials: ['teaHouse'] },
    tidepool: { name: 'Shiokaze Port', captain: 'Captain Brineclaw', lvl: 21, specials: ['fishmonger', 'boatwright'] },
    onsen: { name: 'Yukimi Spa Village', captain: 'Captain Frostbelly', lvl: 29, specials: ['bathhouse', 'smith'] },
  };
  const door = async kind => { await ev(k => { const Vl = window.G.dungeon.village, it = Vl.inter.find(i => i.building?.kind === k); window.G.player.setPos(it.pos.x, it.pos.z); it.onInteract(); return true; }, kind); await page.waitForFunction(() => window.G.ui?.dlg?.active, null, { timeout: 4000 }).catch(() => {}); };
  const callsAt = () => ev(async () => { const G = window.G, E = G.engine, Vl = G.dungeon.village, P = G.player; P.setPos(Vl.site.x, Vl.site.z); E.rig.focus.copy(P.pos); E.rig.snap?.(); await new Promise(r => setTimeout(r, 1200)); const R2 = E.renderer, er = E.render, cc = [], tt = []; E.render = function () { R2.info.autoReset = false; R2.info.reset(); const x = er.apply(this, arguments); cc.push(R2.info.render.calls); tt.push(R2.info.render.triangles); R2.info.autoReset = true; return x; }; await new Promise(r => setTimeout(r, 800)); E.render = er; cc.sort((a, b) => a - b); tt.sort((a, b) => a - b); return { calls: cc[cc.length >> 1], tris: tt[tt.length >> 1] }; });
  for (const [zone, Z] of Object.entries(OTHER)) {
    await ev(([z, lvl]) => { const G = window.G, S = G.state; S.zones[z].unlocked = true; S.player.lvl = Math.max(S.player.lvl, lvl); S.coins = 20000; S.materials = { ...(S.materials || {}), wood: 99, stone: 99, crystal: 20, silk: 20, lantern: 10 }; G.actions.recompute(); window.__ev = []; G.enterRegion(z); }, [zone, Z.lvl]); // (the reload's listeners record the events)
    await waitMode(page, 'dungeon');
    await page.waitForFunction(() => !!window.G.dungeon?.village?.villagers?.length, null, { timeout: 30000 }); await sleep(page, 600);
    let z = await ev(z => { const G = window.G, Vl = G.dungeon.village, c = Vl.captain; return { name: Vl.def.name, b: Vl.buildings.length, kinds: Vl.buildings.map(b => b.kind), camps: Vl.camps.map(c => c.monsters.filter(m => m.alive).length), cages: Vl.cages.length, caged: Vl.villagers.filter(v => v.state === 'caged').length, cap: c && { name: c.name, warded: c.warded, alive: c.alive }, state: G.state.zones[z].village }; }, zone);
    R.check(`${zone}: ${Z.name} builds besieged — its buildings (with ${Z.specials.join(' + ')}), siege camps with monsters, a caged villager per camp, ${Z.captain} warded in the square`,
      z.name === Z.name && z.b >= 5 && Z.specials.every(k => z.kinds.includes(k)) && z.camps.length >= 2 && z.camps.every(n => n >= 4) && z.cages === z.camps.length && z.caged === z.camps.length && z.cap?.name === Z.captain && z.cap.warded && z.state === 'besieged', JSON.stringify(z));
    const cb = await callsAt();
    for (const id of await ev(() => window.G.dungeon.village.camps.map(c => c.id))) await killCamp(id);
    await page.waitForFunction(() => { const Vl = window.G.dungeon.village; return Vl.camps.every(c => c.cleared) && !Vl.captain.warded; }, null, { timeout: 8000 }).catch(() => {});
    await ev(() => { const G = window.G, c = G.dungeon.village.captain; G.player.setPos(c.pos.x + 3, c.pos.z + 3); G.player.invuln = true; });
    await page.waitForFunction(() => { const G = window.G, c = G.dungeon.village.captain; return c.introDone && G.dungeon.boss === c; }, null, { timeout: 10000 }).catch(() => {});
    const fight = await ev(() => { const G = window.G, c = G.dungeon.village.captain; return { boss: G.dungeon.boss === c, intro: !!c.introDone, mods: c.stats.mods, sig: Object.keys(c.cap || {}).length > 0 }; });
    await ev(() => { const c = window.G.dungeon.village.captain; c.takeDamage(c.life + 1, {}); });
    await page.waitForFunction(() => window.G.dungeon.village.saved && !window.G.dungeon.village.celebrate, null, { timeout: 15000 }).catch(() => {});
    z = await ev(z => { const G = window.G, Vl = G.dungeon.village; return { state: G.state.zones[z].village, saved: window.__ev.filter(e => e[0] === 'village:saved').map(e => e[1].zone), out: Vl.villagers.filter(v => v.visible && v.state !== 'hidden' && v.state !== 'caged').length, n: Vl.villagers.length, folk: Vl.villagers.filter(v => v.folk).length, elder: Vl.markerFor(Vl.villager(Vl.buildings.find(b => b.kind === 'elder').keeper)) }; }, zone);
    R.check(`${zone}: ${Z.captain} wakes as a boss (intro, the boss slot, elite mods) and its fall saves ${Z.name} — village:saved once, everyone out, the elder offers a quest`,
      fight.boss && fight.intro && fight.mods.length >= 2 && z.state === 'saved' && z.saved.length === 1 && z.saved[0] === zone && z.out === z.n && z.folk >= 3 && z.elder === '!', JSON.stringify({ fight, z }));
    // the specials
    if (zone === 'maple') {
      await ev(() => { window.G.state.player.meal = null; window.G.actions.recompute(); });
      await door('teaHouse'); await drainDialogue(page, [0]);
      const t = await ev(() => { const m = window.G.state.player.meal; return m && { buff: m.buff, dish: m.dish, dur: m.dur, left: m.left }; });
      R.check('maple: the Momiji Tea House serves a tea set — eaten on the spot, its Well Fed lasting half as long again', t && t.dish === 'strawberryMochi' && t.buff === 'lucky' && t.dur >= 890, JSON.stringify(t));
    }
    if (zone === 'tidepool') {
      const f0 = await ev(() => { const A = window.G.actions; A.addPantry('mackerel', 3, { silent: true }); A.addPantry('seaBream', 1, { silent: true }); return window.G.state.coins; });
      await door('fishmonger'); await drainDialogue(page, [1]);
      const f1 = await ev(() => ({ coins: window.G.state.coins, mack: window.G.state.pantry.mackerel || 0, bream: window.G.state.pantry.seaBream || 0 }));
      R.check('tidepool: the fish market buys the whole catch at ×1.3', f1.mack === 0 && f1.bream === 0 && f1.coins - f0 === Math.round(28 * 1.3) * 3 + Math.round(70 * 1.3), JSON.stringify({ f0, f1 }));
      const g0 = await ev(() => window.G.state.furniture?.glassFloats || 0);
      await ev(() => window.G.actions.addPantry('seaweed', 4, { silent: true }));
      await door('boatwright'); await drainDialogue(page, [0, 0]);
      const g1 = await ev(() => window.G.state.furniture?.glassFloats || 0);
      R.check('tidepool: the Funaki Boatyard builds a commission (Glass Floats → furniture storage)', g1 === g0 + 1, JSON.stringify({ g0, g1 }));
    }
    if (zone === 'onsen') {
      await ev(() => { const P = window.G.state.player; P.soak = null; P.life = 5; window.G.actions.recompute(); });
      await door('bathhouse'); await drainDialogue(page, [0]);
      const b = await ev(() => { const G = window.G, P = G.state.player; return { soak: P.soak?.left, life: P.life, max: G.derived.lifeMax, regen: G.derived.lifeRegen, chip: !!G.ui && true }; });
      R.check('onsen: a soak at the Yukimi Bathhouse heals fully and leaves Onsen Glow on the hero (20 min)', b.soak >= 1190 && b.life == null, JSON.stringify(b));
      const n0 = await ev(() => window.G.state.inventory.filter(Boolean).length + window.G.state.stash.filter(Boolean).length);
      await door('smith'); await drainDialogue(page, [0, 0]);
      const n1 = await ev(() => window.G.state.inventory.filter(Boolean).length + window.G.state.stash.filter(Boolean).length);
      R.check('onsen: the Snow-ore Smith forges a rare piece from stone, crystal and coins', n1 === n0 + 1, JSON.stringify({ n0, n1 }));
      const w0 = await ev(async () => { const { generateItem } = await import('/src/rpg/items.js'); const G = window.G, S = G.state, slot = S.player.activeWeapon === 1 ? 'weaponAlt' : 'weapon'; const it = generateItem({ ilvl: 26, slot: 'weapon', rarity: 'magic' }); S.equipment[slot] = it; G.actions.recompute(); return { uid: it.uid, base: it.base }; });
      await door('smith'); await drainDialogue(page, [1]);
      const w1 = await ev(() => { const S = window.G.state, it = S.equipment[S.player.activeWeapon === 1 ? 'weaponAlt' : 'weapon']; return { uid: it?.uid, base: it?.base, rarity: it?.rarity }; });
      R.check('onsen: the smith re-folds the weapon in hand (same base, new magic)', w1.uid !== w0.uid && w1.base === w0.base && w1.rarity === 'magic', JSON.stringify({ w0, w1 }));
    }
    const cs = await callsAt();
    R.note(`${zone}: the square, besieged ${cb.calls} calls / ${(cb.tris / 1e6).toFixed(2)} M tris; saved (with ${z.n} villagers out) ${cs.calls} calls / ${(cs.tris / 1e6).toFixed(2)} M tris`);
    R.check(`${zone}: ${Z.name}'s square stays within the draw-call budget besieged and saved (≤ 450)`, cb.calls <= 450 && cs.calls <= 450, JSON.stringify({ cb, cs }));
    await ev(() => { window.G.player.invuln = false; window.G.returnToVillage(); }); await waitMode(page, 'village'); await sleep(page, 400);
  }
  // persistence: after a reload, every saved village stays saved (a fresh visit is clean: no camps, no captain)
  await reload();
  const per = await ev(() => Object.fromEntries(['maple', 'tidepool', 'onsen'].map(z => [z, window.G.state.zones[z].village])));
  await ev(() => window.G.enterRegion('onsen')); await waitMode(page, 'dungeon'); await page.waitForFunction(() => !!window.G.dungeon?.village?.villagers?.length, null, { timeout: 30000 }); await sleep(page, 500);
  const clean = await ev(() => { const Vl = window.G.dungeon.village; return { saved: Vl.saved, camps: Vl.camps.reduce((a, c) => a + c.monsters.length, 0), cap: !!Vl.captain, cages: Vl.cages.length }; });
  R.check('persistence: the three villages stay saved over a reload; a new visit is a clean village (no camps, cages or captain)', Object.values(per).every(v => v === 'saved') && clean.saved && !clean.camps && !clean.cap && !clean.cages, JSON.stringify({ per, clean }));
} catch (e) {
  R.check('scenario ran to the end', false, e.stack || e.message);
}
const failed = R.finish(errors, warns);
await browser.close();
process.exit(failed ? 1 : 0);
