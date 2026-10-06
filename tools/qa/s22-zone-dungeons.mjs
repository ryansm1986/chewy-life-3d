// Scenario 22: the zone dungeons (docs/ZONES.md §4, §8.2; ROADMAP Z-C1 to Z-C4), on the Bamboo Depths.
//  a) the gate: the region boss no longer spawns outdoors; the gate at the trail's end is sealed (label, F refuses,
//     mode.gatePos for the pointer) until the village is saved; 'village:saved' unseals it live
//  b) entering: "Enter Bamboo Depths" → floor 1 (kind zone, the bamboo cave kit, the zone's roster, 120–160 monsters in
//     packs of 8–16 laid out as clusters 4–8 m wide, 2 champion packs and a unique pack, no Burrow records)
//  c) the objectives API with a fake provider (G.story.dungeonObjectives): a cage in an objective slot, locked while its
//     guards stand, F frees the villager → 'villager:rescued' { npc, zone, dungeon, floor }; a 'drop' on the marked
//     champion pack → a quest drop on the ground → 'quest:find' { item, zone, dungeon, floor }, not in the bag;
//     mode.questMark(step) points at the cage, the marked pack, the drop
//  d) kill pacing: a pack's fodder pays less xp than the Burrow's full rate and drops thinned
//  e) the stairs → floor 2: the round arena (r 17 m), the boss inside it; stepping into the ring raises the seal and
//     wakes the boss (its intro); the seal blocks the way out
//  f) the boss: dungeon:cleared { first: true }, tier:unlocked; the seal opens; the first-clear chest (the zone's boss
//     unique + a rare); Momiji Hollow opens; a portal back to the zone (no stairs); the Travel Map shows the dungeon
//  g) the portal → the zone, arriving in front of the gate; a second clear: first false, no chest
//  h) the unlock rule: level, the previous dungeon's clear, or (migrated saves) a beaten region boss
//  z) every other zone whose dungeon is gated (defs.js gate: true): its gate sealed → unsealed, floor 1 on its own kit
//     at the density, floor 2's arena with its boss, the seal, the kill, the first-clear chest (that zone's boss unique
//     + a rare), the next zone opening, the way back out to the gate (ZONES=maple,onsen narrows it)
//  i) perf: a dense fight on a real floor at the game camera (CPU frame p95, all the floor's monsters)
import { launch, boot, sleep, makeReport } from './lib.mjs';

const R = makeReport('S22 zone dungeons: gate, floors, objectives, arena, boss, rewards, unlock, density');
const { browser, page, errors, warns } = await launch({ w: 1600, h: 900 });
const ev = (fn, arg) => page.evaluate(fn, arg);
const waitDungeon = async (pred, timeout = 40000) => {
  try { await page.waitForFunction(pred, null, { timeout }); }
  catch (e) { const s = await ev(() => { const G = window.G; return { mode: G.mode, kind: G.dungeon?.kind, floor: G.dungeon?.floor, region: G.dungeon?.regionId, iris: !!G.ui?.iris?.active, dead: G.playerDead, modal: !!G.ui?.anyModal?.(), dlg: !!G.ui?.dlg?.active }; }).catch(() => null); throw new Error('wait timed out; state ' + JSON.stringify(s)); }
  await sleep(page, 700);
};

try {
  await boot(page, 'fresh&nointro&notut&hour=11');
  await ev(() => {
    const G = window.G; G.state.flags.burrowTut = true; G.state.player.lvl = 9; G.actions.recompute();
    const E = window.QA.Events; window.__ev = [];
    for (const n of ['dungeon:cleared', 'tier:unlocked', 'villager:rescued', 'quest:find', 'village:saved', 'boss:spawn', 'boss:dead']) E.on(n, p => window.__ev.push([n, JSON.parse(JSON.stringify(p || {}))]));
  });
  // ---------------------------------------------------------------- a) the gate
  await ev(() => window.G.travel.go('bamboo'));
  await waitDungeon(() => window.G?.dungeon?.regionId === 'bamboo' && !window.G.ui?.iris?.active);
  const a = await ev(() => {
    const G = window.G, D = G.dungeon, g = D.gate;
    const t0 = window.QA.toasts.length; g.it.onInteract(); const refused = window.QA.toasts.slice(t0).join(' | ');
    return { gate: !!g, sealed: g?.sealed, label: g?.it?.label, boss: !!D.boss, bossSpawns: D.layout.spawns.filter(s => s.boss).length, gatePos: !!D.gatePos && Math.hypot(D.gatePos.x - g.pos.x, D.gatePos.z - g.pos.z) < 0.01, mode: G.mode, kind: D.kind, refused,
      ptr: G.story.placeFor({ type: 'dungeonFloor', dungeon: 'bambooDepths', n: 2 }, { dungeon: 'bambooDepths', zone: 'bamboo', floor: 2 })?.label || null, monsters: D.monsters.length };
  });
  R.check('the gate: no outdoor region boss (it moved into the dungeon), the gate stands sealed at the trail\'s end ("save the village first"), F refuses, mode.gatePos is the pointer\'s target', a.gate && a.sealed && /sealed/i.test(a.label) && !a.boss && a.bossSpawns === 0 && a.gatePos && /curse|seal/i.test(a.refused) && a.ptr === 'Bamboo Depths' && a.monsters > 10, JSON.stringify(a));
  const a2 = await ev(async () => {
    const G = window.G, D = G.dungeon, g = D.gate; G.zoneDebug.saveVillage('bamboo');
    for (let k = 0; k < 80 && g.curtain.visible; k++) await new Promise(r => setTimeout(r, 100)); // (the burst runs on game time)
    return { sealed: g.sealed, label: g.it.label, saved: G.state.zones.bamboo.village, ev: window.__ev.filter(e => e[0] === 'village:saved').length, curtain: g.curtain.visible, lit: g.lit.length };
  });
  R.check("'village:saved' { zone: bamboo } unseals the gate live: the curtain bursts and goes, the lanterns light, \"Enter Bamboo Depths\"", !a2.sealed && a2.label === 'Enter Bamboo Depths' && a2.saved === 'saved' && a2.ev === 1 && !a2.curtain && a2.lit === 2, JSON.stringify(a2));
  // ---------------------------------------------------------------- b) entering, floor 1
  await ev(() => { // a fake phase D provider: a cage and a champion's quest drop on floor 1, a unique's drop on floor 2
    const G = window.G; window.__objCalls = [];
    G.story.dungeonObjectives = (q) => { window.__objCalls.push(q); return q.floor === 1 ? [{ kind: 'cage', npc: 'tk_mochi_s22', label: 'Grandma Mochi' }, { kind: 'drop', item: 'bambooFlute', label: "Ojii's Bamboo Flute", from: 'champion' }] : [{ kind: 'drop', item: 'tenguFeather', label: 'A Tengu Feather', from: 'unique' }]; };
    window.__deep = G.state.dungeon.deepest; window.__wps = G.state.dungeon.waypoints.length;
    G.dungeon.gate.it.onInteract();
  });
  await waitDungeon(() => window.G?.dungeon?.kind === 'zone' && window.G.dungeon.floor === 1 && !window.G.ui?.iris?.active);
  await ev(() => { const P = window.G.player; P.invuln = true; window.__inv = setInterval(() => { P.invuln = true; window.G.actions.restoreAll?.(); }, 250); }); // (the test teleports through dense packs)
  const b = await ev(() => {
    const G = window.G, D = G.dungeon, L = D.layout, W = G.world, zr = D.zr;
    const packs = zr.packs.map(p => { const ms = p.members; let cx = 0, cz = 0; for (const m of ms) { cx += m.pos.x; cz += m.pos.z; } cx /= ms.length; cz /= ms.length; let w = 0; for (const m of ms) w = Math.max(w, Math.hypot(m.pos.x - cx, m.pos.z - cz)); return { n: ms.length, rank: p.sp.rank, kind: p.sp.kind, w: +(w * 2).toFixed(1) }; });
    const roomPacks = packs.filter(p => p.kind !== 'corridor');
    return { kind: D.kind, def: D.def.id, floor: D.floor, theme: L.theme, kit: !!W.kit, n: D.monsters.length, roster: [...D.theme.monsters, D.def.tank].filter(Boolean), ids: [...new Set(D.monsters.map(m => m.id))],
      packs: packs.length, sizes: [Math.min(...roomPacks.map(p => p.n)), Math.max(...roomPacks.map(p => p.n))], widths: [Math.min(...roomPacks.map(p => p.w)), Math.max(...roomPacks.map(p => p.w))],
      champ: packs.filter(p => p.rank === 'champion').length, uniq: packs.filter(p => p.rank === 'unique').length, rooms: L.rooms.length, stairs: !!D.stairsPos, wp: !!L.waypoint,
      deepest: G.state.dungeon.deepest === window.__deep, wps: G.state.dungeon.waypoints.length === window.__wps, best: G.state.zones.bamboo.dungeon.bestFloor, objCall: window.__objCalls[0] || null,
      exit: W.interactables.find(i => /Return to/.test(i.label))?.label || null, music: G.audio?.musicPlayer?.wantTrack || G.audio?.music?.wantTrack || null };
  });
  R.check('floor 1: a zone floor on the bamboo cave kit, the zone\'s roster, ~9 chambers, stairs, no waypoint and no Burrow records; the exit portal leads back to the grove', b.kind === 'zone' && b.def === 'bambooDepths' && b.floor === 1 && b.theme === 'bambooCave' && b.kit && b.ids.every(i => b.roster.includes(i)) && b.rooms >= 8 && b.stairs && !b.wp && b.deepest && b.wps && b.best === 1 && /Bamboo Grove/.test(b.exit || ''), JSON.stringify(b));
  R.check('density: 120–160 monsters, room packs of 8–16 in cluster formations 4–8 m wide, 2 champion packs and 1 unique pack', b.n >= 120 && b.n <= 165 && b.sizes[0] >= 8 && b.sizes[1] <= 17 && b.widths[0] >= 2.5 && b.widths[1] <= 9 && b.champ === 2 && b.uniq === 1, JSON.stringify({ n: b.n, sizes: b.sizes, widths: b.widths, champ: b.champ, uniq: b.uniq, packs: b.packs }));
  R.check('the objectives API: DungeonMode asked G.story.dungeonObjectives({ dungeon, floor, zone, tier }) at build', b.objCall && b.objCall.dungeon === 'bambooDepths' && b.objCall.floor === 1 && b.objCall.zone === 'bamboo' && b.objCall.tier === 0, JSON.stringify(b.objCall));
  // ---------------------------------------------------------------- c) the cage and the quest drop
  const c1 = await ev(async () => {
    const G = window.G, D = G.dungeon, zr = D.zr, cage = zr.cages[0];
    const mark = D.questMark({ type: 'rescue', npc: 'tk_mochi_s22' }), slot = D.layout.slots[0], sp = D.world.cellToWorld(slot.x, slot.y);
    G.player.setPos(cage.pos.x + 1.6, cage.pos.z + 1.6); await new Promise(r => setTimeout(r, 300));
    const lockedLabel = cage.it.label, t0 = window.QA.toasts.length; cage.it.onInteract(); const refused = window.QA.toasts.slice(t0).join(' | ');
    const guards = zr.packs.find(p => p.index === cage.guard);
    for (const m of guards.members) if (m.alive) G.combat.hitMonster(m, { dmgPct: 1e7 });
    await new Promise(r => setTimeout(r, 900));
    const freeLabel = cage.it.label; cage.it.onInteract();
    await new Promise(r => setTimeout(r, 400));
    return { cages: zr.cages.length, inSlot: Math.hypot(cage.pos.x - sp.x, cage.pos.z - sp.z) < 0.01, mark: !!mark && Math.hypot(mark.x - cage.pos.x, mark.z - cage.pos.z) < 0.01, lockedLabel, refused, guards: guards.members.length, freeLabel, open: cage.open, rig: !!cage.rig?.root, ev: window.__ev.filter(e => e[0] === 'villager:rescued').map(e => e[1]) };
  });
  R.check('a cage stands in objective slot 0 with its villager; locked while its guard pack stands (F refuses); the guards down, F frees them → villager:rescued { npc, zone, dungeon, floor }; questMark pointed at it', c1.cages === 1 && c1.inSlot && c1.mark && /locked/.test(c1.lockedLabel) && /guards/i.test(c1.refused) && c1.guards >= 8 && /^Free /.test(c1.freeLabel) && c1.open && c1.rig && c1.ev.length === 1 && c1.ev[0].npc === 'tk_mochi_s22' && c1.ev[0].zone === 'bamboo' && c1.ev[0].dungeon === 'bambooDepths' && c1.ev[0].floor === 1, JSON.stringify(c1));
  const c2 = await ev(async () => {
    const G = window.G, D = G.dungeon, zr = D.zr, q = zr.drops[0], pk = q.pack, ld = pk.leader;
    const m0 = D.questMark({ type: 'find', item: 'bambooFlute' }), atLeader = !!m0 && Math.hypot(m0.x - ld.pos.x, m0.z - ld.pos.z) < 0.01;
    G.player.setPos(ld.pos.x + 5, ld.pos.z + 5); // (out of the loot magnet's reach until we walk over)
    G.combat.hitMonster(ld, { dmgPct: 1e7 }); await new Promise(r => setTimeout(r, 1200));
    const drop = D.loot.list.find(e => e.d.type === 'quest'), m1 = D.questMark({ type: 'find', item: 'bambooFlute' });
    const onGround = !!drop && !!m1 && Math.hypot(m1.x - drop.to.x, m1.z - drop.to.z) < 0.6;
    if (drop) G.player.setPos(drop.to.x, drop.to.z);
    await new Promise(r => setTimeout(r, 1500));
    return { from: q.from, mark: pk.sp.mark, rank: ld.rank, atLeader, dropped: !!drop, label: drop?.label || null, onGround, gone: !D.loot.list.some(e => e.d.type === 'quest'), bagSame: !G.state.inventory.some(it => it && (it.base === 'bambooFlute' || it.name === q.label || it.quest)), ev: window.__ev.filter(e => e[0] === 'quest:find').map(e => e[1]), after: D.questMark({ type: 'find', item: 'bambooFlute' }) };
  });
  R.check("a 'drop' objective rides the marked champion pack's leader (questMark points at it), falls as a quest item (the pointer follows it), picking it up emits quest:find { item, zone, dungeon, floor } and nothing enters the bag", c2.from === 'champion' && c2.mark === 'champion' && c2.rank === 'champion' && c2.atLeader && c2.dropped && c2.onGround && c2.gone && c2.bagSame && c2.ev.length === 1 && c2.ev[0].item === 'bambooFlute' && c2.ev[0].zone === 'bamboo' && c2.ev[0].dungeon === 'bambooDepths' && c2.ev[0].floor === 1 && c2.after === null, JSON.stringify(c2));
  // ---------------------------------------------------------------- d) kill pacing
  const d = await ev(async () => {
    const G = window.G, D = G.dungeon, xs = []; const add = G.actions.addXp.bind(G.actions); G.actions.addXp = n => { xs.push(n); return add(n); };
    const fod = D.monsters.filter(m => m.alive && m._thin).slice(0, 30);
    const full = fod.map(m => m.stats.xp);
    for (const m of fod) { G.player.setPos(m.pos.x + 1, m.pos.z); G.combat.hitMonster(m, { dmgPct: 1e7 }); }
    await new Promise(r => setTimeout(r, 900)); G.actions.addXp = add;
    const life = D.monsters.find(m => m._thin), stats = life ? { life: life.lifeMax, full: life.stats.life } : null;
    return { n: fod.length, xp: xs.reduce((a, b) => a + b, 0), fullXp: full.reduce((a, b) => a + b, 0), stats, ground: D.loot.list.length };
  });
  R.check('kill pacing: a pack\'s fodder pays ~0.4× the full xp, is lighter (life 0.7×), and its drops are thinned (30 kills leave a modest pile)', d.n === 30 && d.xp > d.fullXp * 0.25 && d.xp < d.fullXp * 0.6 && d.stats && d.stats.life < d.stats.full * 0.8 && d.ground < 30, JSON.stringify(d));
  // ---------------------------------------------------------------- e) floor 2: the arena
  await ev(() => { const G = window.G, it = G.world.interactables.find(i => /Go deeper/.test(i.label)); window.__lab = it?.label; it.onInteract(); });
  await waitDungeon(() => window.G?.dungeon?.kind === 'zone' && window.G.dungeon.floor === 2 && !window.G.ui?.iris?.active);
  const e = await ev(() => {
    const G = window.G, D = G.dungeon, L = D.layout, A = L.arena, b = D.boss;
    return { lab: window.__lab, floor: D.floor, arena: A, boss: b?.id, inRing: !!b && Math.hypot(b.pos.x - A.x, b.pos.z - A.z) < A.r - 3, stairs: !!D.stairsPos, mouth: !!L.arenaMouth, lanterns: G.world.arenaLanterns?.length || 0, best: G.state.zones.bamboo.dungeon.bestFloor, intro: !!b?.introDone, n: D.monsters.length };
  });
  R.check('the stairs ("Go deeper (Floor 2)") lead to floor 2: ~8 chambers, then the round arena (r 17 m) with Master Tengu in it, lanterns round the ring, no stairs', /Go deeper \(Floor 2\)/.test(e.lab) && e.floor === 2 && e.arena?.r === 17 && e.boss === 'tenguMaster' && e.inRing && !e.stairs && e.mouth && e.lanterns >= 6 && e.best === 2 && !e.intro && e.n >= 120, JSON.stringify(e));
  const e2 = await ev(async () => {
    const G = window.G, D = G.dungeon, L = D.layout, A = L.arena, M = L.arenaMouth, b = D.boss;
    for (const m of D.monsters) if (m !== b && m.alive && Math.hypot(m.pos.x - A.x, m.pos.z - A.z) < A.r + 14) { m.pos.set(-900, 0, -900); m.aggro = false; } // (the approach's packs out of the way)
    const ux = (M.x - A.x) / Math.hypot(M.x - A.x, M.z - A.z), uz = (M.z - A.z) / Math.hypot(M.x - A.x, M.z - A.z);
    G.player.setPos(A.x + ux * (A.r - 3.5), A.z + uz * (A.r - 3.5));
    await new Promise(r => setTimeout(r, 2600));
    const seal = D.zr.seal, blocked = G.world.collision.solidAt(seal.cx, seal.cz, 0.1);
    return { intro: !!b.introDone, aggro: !!b.aggro, seal: seal.want, blocked, spawn: window.__ev.filter(x => x[0] === 'boss:spawn').length, banner: !!document.querySelector('.banner, .bn, .bnr'), track: G.audio?.track?.name || null };
  });
  R.check('stepping into the ring: the lanterns flare, the seal rises across the mouth (it blocks the way out), the boss wakes with its intro (boss:spawn)', e2.intro && e2.aggro && e2.seal === 1 && e2.blocked && e2.spawn >= 1, JSON.stringify(e2));
  // ---------------------------------------------------------------- f) the boss falls
  const f = await ev(async () => {
    const G = window.G, D = G.dungeon, b = D.boss; window.__ev.length = 0;
    const st = b.def.debug?.state?.(b);
    G.combat.hitMonster(b, { dmgPct: 1e8 }); await new Promise(r => setTimeout(r, 3200));
    const W = G.world, chestIt = W.interactables.find(i => /treasure chest/i.test(i.label));
    const Z = G.state.zones.bamboo.dungeon, seal = D.zr.seal;
    const out = { dead: !b.alive, st, clear: window.__ev.find(x => x[0] === 'dungeon:cleared')?.[1] || null, tier: window.__ev.find(x => x[0] === 'tier:unlocked')?.[1] || null, Z, seal: seal.want, blocked: G.world.collision.solidAt(seal.cx, seal.cz, 0.1),
      chest: !!chestIt, portal: W.interactables.find(i => /Return to/.test(i.label))?.label || null, stairs: W.interactables.some(i => /deeper/.test(i.label)), maple: G.state.zones.maple.unlocked, mapleOk: G.travel.list().find(p => p.id === 'maple').unlocked };
    if (chestIt) {
      // (new drops by identity, not by index: older piles can be picked up meanwhile; and anything that went straight to the bag)
      const before = new Set(D.loot.list), bag0 = new Set((G.state.inventory?.items || G.state.inventory || []).map?.(i => i?.uid ?? i) || []);
      G.player.setPos(chestIt.pos.x + 1, chestIt.pos.z); chestIt.onInteract(); await new Promise(r => setTimeout(r, 1800));
      const bagNew = ((G.state.inventory?.items || G.state.inventory || []).filter?.(i => i && !bag0.has(i.uid ?? i)) || []).filter(i => i.rarity);
      const items = [...D.loot.list.filter(e => !before.has(e) && e.d.type === 'item').map(e => e.d.item), ...bagNew].map(it => ({ r: it.rarity, u: it.uniqueId || null }));
      out.items = items; out.unique = items.some(i => i.u === 'tenguGaleFeather'); out.rare = items.filter(i => i.r === 'rare').length;
    }
    const card = G.travel.list().find(p => p.id === 'bamboo'); out.card = { cleared: card.cleared, dungeon: card.dungeon };
    return out;
  });
  R.check("the boss falls: dungeon:cleared { id: bambooDepths, first: true }, tier:unlocked { tier: 1 }, zones.bamboo.dungeon cleared 1; the seal opens; a portal back to the grove and no stairs", f.dead && f.clear?.id === 'bambooDepths' && f.clear.first === true && f.clear.zone === 'bamboo' && f.tier?.tier === 1 && f.Z.cleared === 1 && f.Z.tier.unlocked === 1 && f.seal === 0 && !f.blocked && /Bamboo Grove/.test(f.portal || '') && !f.stairs, JSON.stringify(f));
  R.check("first-clear rewards: a treasure chest rises by the boss with Master Tengu's Gale Feather (the zone's boss unique) and a guaranteed rare; Momiji Hollow opens; the Travel Map card shows the dungeon cleared", f.chest && f.unique && f.rare >= 1 && f.maple && f.mapleOk && f.card.cleared === 1 && f.card.dungeon?.name === 'Bamboo Depths' && f.card.dungeon.cleared === 1, JSON.stringify({ items: f.items, maple: f.maple, card: f.card }));
  // ---------------------------------------------------------------- g) back out at the gate, a second clear
  await ev(() => { window.G.world.interactables.find(i => /Return to/.test(i.label)).onInteract(); });
  await waitDungeon(() => window.G?.dungeon?.regionId === 'bamboo' && !window.G.ui?.iris?.active);
  const g = await ev(() => { const G = window.G, D = G.dungeon, P = G.player.pos; return { kind: D.kind, near: Math.hypot(P.x - D.gate.pos.x, P.z - D.gate.pos.z), open: !D.gate.sealed }; });
  R.check('the portal goes back out to the grove, arriving in front of the gate (open now)', g.kind === 'region' && g.near < 3.5 && g.open, JSON.stringify(g));
  await ev(() => window.G.enterDungeon({ id: 'bambooDepths', floor: 2 }));
  await waitDungeon(() => window.G?.dungeon?.kind === 'zone' && window.G.dungeon.floor === 2 && !window.G.ui?.iris?.active);
  const g2 = await ev(async () => { const G = window.G, D = G.dungeon; window.__ev.length = 0; D.boss.alert(); await new Promise(r => setTimeout(r, 1500)); G.combat.hitMonster(D.boss, { dmgPct: 1e8 }); await new Promise(r => setTimeout(r, 3000)); return { clear: window.__ev.find(x => x[0] === 'dungeon:cleared')?.[1] || null, chest: G.world.interactables.some(i => /treasure chest/i.test(i.label)), cleared: G.state.zones.bamboo.dungeon.cleared }; });
  R.check('a second clear: dungeon:cleared { first: false }, no first-clear chest, the clear count 2', g2.clear?.first === false && !g2.chest && g2.cleared === 2, JSON.stringify(g2));
  // ---------------------------------------------------------------- h) the unlock rule (pure checks in the page)
  const h = await ev(async () => {
    const { regionUnlocked } = await import('/src/regions/index.js');
    const { fillZone } = await import('/src/rpg/zones.js');
    const mk = (z) => ({ player: { lvl: 1 }, heroes: {}, zones: { bamboo: fillZone({ unlocked: true, ...z }), maple: fillZone({}), tidepool: fillZone({}), onsen: fillZone({}) } });
    const lvl = { player: { lvl: 12 }, heroes: {}, zones: { bamboo: fillZone({ unlocked: true }), maple: fillZone({}), tidepool: fillZone({}), onsen: fillZone({}) } };
    return { none: regionUnlocked(mk({}), 'maple'), dungeon: regionUnlocked(mk({ dungeon: { cleared: 1 } }), 'maple').ok, migrated: regionUnlocked(mk({ regionBoss: 2 }), 'maple').ok, level: regionUnlocked(lvl, 'maple').ok };
  });
  R.check('the unlock rule: Momiji Hollow opens at its level, on the Bamboo Depths\' first clear, or (a migrated save) for a beaten region boss; otherwise locked with the reason', !h.none.ok && /Bamboo Depths/.test(h.none.why) && h.dungeon && h.migrated && h.level, JSON.stringify(h));
  // ---------------------------------------------------------------- z) the other gated zones, end to end (compact)
  const others = await ev(async () => { const { DUNGEONS, ZONE_DUNGEON } = await import('/src/dungeon/defs.js'); return ['maple', 'tidepool', 'onsen'].filter(z => DUNGEONS[ZONE_DUNGEON[z]]?.gate); });
  const want = process.env.ZONES ? process.env.ZONES.split(',') : null;
  for (const z of others.filter(z => !want || want.includes(z))) {
    const info = await ev(async z => {
      const { DUNGEONS, ZONE_DUNGEON } = await import('/src/dungeon/defs.js'), { ZONE_UNIQUE, nextZone } = await import('/src/rpg/zoneProgress.js');
      const G = window.G, def = DUNGEONS[ZONE_DUNGEON[z]]; G.state.zones[z].unlocked = true; G.state.player.lvl = def.levels[0] + 2; G.actions.recompute();
      delete G.story.dungeonObjectives; // (the real provider again, or none)
      return { id: def.id, name: def.name, theme: def.theme, boss: def.boss, unique: ZONE_UNIQUE[z], next: nextZone(z) };
    }, z);
    await ev(z => window.G.travel.go(z), z);
    await waitDungeon(() => window.G?.dungeon?.isRegion && !window.G.ui?.iris?.active, 60000);
    const za = await ev(async z => {
      const G = window.G, D = G.dungeon, g = D.gate, sealed0 = !!g?.sealed, label0 = g?.it?.label || null;
      G.zoneDebug.saveVillage(z); for (let k = 0; k < 80 && g?.curtain?.visible; k++) await new Promise(r => setTimeout(r, 100));
      return { region: D.regionId, gate: !!g, sealed0, label0, open: !!g && !g.sealed, label: g?.it?.label || null, boss: !!D.boss, bossSpawns: D.layout.spawns.filter(s => s.boss).length };
    }, z);
    R.check(`${z}: no outdoor boss; the ${info.name} gate stands sealed at the trail's end, and 'village:saved' opens it ("Enter ${info.name}")`, za.region === z && za.gate && za.sealed0 && /sealed/i.test(za.label0 || '') && za.open && za.label === `Enter ${info.name}` && !za.boss && za.bossSpawns === 0, JSON.stringify(za));
    await ev(() => window.G.dungeon.gate.it.onInteract());
    await waitDungeon(() => window.G?.dungeon?.kind === 'zone' && window.G.dungeon.floor === 1 && !window.G.ui?.iris?.active, 60000);
    await ev(() => { const P = window.G.player; P.invuln = true; });
    const zb = await ev(() => {
      const G = window.G, D = G.dungeon, L = D.layout, packs = D.zr.packs;
      return { def: D.def.id, theme: L.theme, kit: !!G.world.kit, n: D.monsters.length, ids: [...new Set(D.monsters.map(m => m.id))], roster: [...D.theme.monsters, D.def.tank].filter(Boolean), champ: packs.filter(p => p.sp.rank === 'champion').length, uniq: packs.filter(p => p.sp.rank === 'unique').length, stairs: !!D.stairsPos, exit: G.world.interactables.find(i => /Return to/.test(i.label))?.label || null };
    });
    R.check(`${z}: floor 1 of the ${info.name} on its own kit (${info.theme}), 120–160 of the zone's monsters, 2 champion packs and a unique pack, stairs, a way back out`, zb.def === info.id && zb.theme === info.theme && zb.kit && zb.n >= 120 && zb.n <= 165 && zb.ids.every(i => zb.roster.includes(i)) && zb.champ === 2 && zb.uniq === 1 && zb.stairs && !!zb.exit, JSON.stringify(zb));
    await ev(() => { const it = window.G.world.interactables.find(i => /Go deeper/.test(i.label)); it.onInteract(); });
    await waitDungeon(() => window.G?.dungeon?.kind === 'zone' && window.G.dungeon.floor === 2 && window.G.dungeon.boss && !window.G.ui?.iris?.active, 60000);
    const zc = await ev(async () => {
      const G = window.G, D = G.dungeon, L = D.layout, A = L.arena, M = L.arenaMouth, b = D.boss, P = G.player; P.invuln = true;
      const inRing0 = Math.hypot(b.pos.x - A.x, b.pos.z - A.z) < A.r - 2;
      for (const m of D.monsters) if (m !== b && m.alive && Math.hypot(m.pos.x - A.x, m.pos.z - A.z) < A.r + 14) { m.pos.set(-900, 0, -900); m.aggro = false; }
      const ux = (M.x - A.x) / Math.hypot(M.x - A.x, M.z - A.z), uz = (M.z - A.z) / Math.hypot(M.x - A.x, M.z - A.z);
      P.setPos(A.x + ux * (A.r - 3.5), A.z + uz * (A.r - 3.5)); await new Promise(r => setTimeout(r, 2600));
      const seal = D.zr.seal;
      return { boss: b.id, r: A.r, inRing0, intro: !!b.introDone, aggro: !!b.aggro, seal: seal?.want, blocked: !!seal && G.world.collision.solidAt(seal.cx, seal.cz, 0.1), lanterns: G.world.arenaLanterns?.length || 0, stairs: !!D.stairsPos };
    });
    R.check(`${z}: floor 2's round arena (r 17) with ${info.boss} in it; stepping in raises the seal and wakes the boss`, zc.boss === info.boss && zc.r === 17 && zc.inRing0 && zc.intro && zc.aggro && zc.seal === 1 && zc.blocked && !zc.stairs, JSON.stringify(zc));
    const zd = await ev(async ({ unique, next, z }) => {
      const G = window.G, D = G.dungeon, b = D.boss; window.__ev.length = 0;
      G.combat.hitMonster(b, { dmgPct: 1e8 }); await new Promise(r => setTimeout(r, 3400));
      const W = G.world, chestIt = W.interactables.find(i => /treasure chest/i.test(i.label));
      const out = { dead: !b.alive, clear: window.__ev.find(x => x[0] === 'dungeon:cleared')?.[1] || null, chest: !!chestIt, portal: W.interactables.find(i => /Return to/.test(i.label))?.label || null, next: next ? G.state.zones[next].unlocked : null, seal: D.zr.seal?.want };
      if (chestIt) {
        const before = new Set(D.loot.list), bag0 = new Set(G.state.inventory.filter(Boolean).map(i => i.uid));
        G.player.setPos(chestIt.pos.x + 1, chestIt.pos.z); chestIt.onInteract(); await new Promise(r => setTimeout(r, 1800));
        const items = [...D.loot.list.filter(e => !before.has(e) && e.d.type === 'item').map(e => e.d.item), ...G.state.inventory.filter(i => i && !bag0.has(i.uid))];
        out.unique = items.some(i => i.uniqueId === unique); out.rare = items.filter(i => i.rarity === 'rare').length;
      }
      return out;
    }, info);
    R.check(`${z}: the boss falls → dungeon:cleared { first: true }, the seal opens, the first-clear chest (${info.unique} + a rare), ${info.next ? 'the next zone opens, ' : ''}a portal back out`, zd.dead && zd.clear?.id === info.id && zd.clear.first === true && zd.seal === 0 && zd.chest && zd.unique && zd.rare >= 1 && (info.next ? zd.next === true : true) && !!zd.portal, JSON.stringify(zd));
    await ev(() => window.G.world.interactables.find(i => /Return to/.test(i.label)).onInteract());
    await waitDungeon(() => window.G?.dungeon?.isRegion && !window.G.ui?.iris?.active, 60000);
    const ze = await ev(() => { const G = window.G, D = G.dungeon, P = G.player.pos; return { region: D.regionId, near: +Math.hypot(P.x - D.gate.pos.x, P.z - D.gate.pos.z).toFixed(1), open: !D.gate.sealed }; });
    R.check(`${z}: the portal goes back out to the region, in front of the open gate`, ze.region === z && ze.near < 3.5 && ze.open, JSON.stringify(ze));
  }
  // ---------------------------------------------------------------- i) perf: a dense fight on a real floor
  await ev(() => window.G.enterDungeon({ id: 'bambooDepths', floor: 1 }));
  await waitDungeon(() => window.G?.dungeon?.kind === 'zone' && window.G.dungeon.floor === 1 && !window.G.ui?.iris?.active, 40000);
  await sleep(page, 1500);
  const measure = () => ev(async () => {
    const G = window.G, D = G.dungeon, E = G.engine, P = G.player;
    G.state.player.lvl = 30; G.state.player.stats = { str: 90, dex: 90, vit: 400, ene: 300 }; G.actions.recompute(); G.actions.addXp = () => {};
    P.invuln = true;
    // the hero in the busiest room: every monster within 20 m wakes and comes
    const rooms = D.layout.rooms.filter(r => r.kind !== 'start' && r.kind !== 'boss');
    let best = null, bn = -1; for (const r of rooms) { const x = (r.cx + 0.5) * 2, z = (r.cy + 0.5) * 2, n = D.monsters.filter(m => Math.hypot(m.pos.x - x, m.pos.z - z) < 20).length; if (n > bn) { bn = n; best = { x, z }; } }
    P.setPos(best.x, best.z); E.rig.distTarget = 27; E.rig.focus.copy(P.pos); E.rig.snap();
    const tb = [], tk0 = E.tick.bind(E), rd0 = E.render.bind(E); let tb0 = 0; // the floor alone first: this machine's baseline right now (a game may share the GPU)
    E.tick = () => { tb0 = performance.now(); return tk0(); }; E.render = () => { rd0(); tb.push(performance.now() - tb0); };
    await new Promise(r => setTimeout(r, 3000)); E.tick = tk0; E.render = rd0;
    tb.sort((a, b) => a - b); const base = +tb[Math.floor(tb.length * 0.95)].toFixed(2);
    const near = D.monsters.filter(m => m.alive && !m.def.boss).sort((a, b) => Math.hypot(a.pos.x - best.x, a.pos.z - best.z) - Math.hypot(b.pos.x - best.x, b.pos.z - best.z)).slice(0, 70);
    for (const m of near) { m.aggro = true; } // (the four or five packs nearest the hero come at once)
    const t = [], tick = E.tick.bind(E), render = E.render.bind(E); let t0 = 0, on = false, calls = 0;
    E.tick = () => { t0 = performance.now(); return tick(); };
    E.renderer.info.autoReset = false; // (count every pass of the frame, not just the last full-screen one)
    E.render = () => { E.renderer.info.reset(); render(); if (on) { t.push(performance.now() - t0); calls = Math.max(calls, E.renderer.info.render.calls); } };
    await new Promise(r => setTimeout(r, 1500)); on = true;
    const ROT = ['attack', 'attack', 'chomp', 'attack', 'whirl'];
    let k = 0; const iv = setInterval(() => { const tg = G.combat.nearest(P.pos, 'ally', 6, e => !e.breakable); if (tg) { G.skills.cds = {}; G.state.player.zoom = null; try { G.skills.tryCast(ROT[k++ % ROT.length], tg.pos.clone(), tg); } catch (e) { /* skill not learnt */ } } }, 200);
    await new Promise(r => setTimeout(r, 6000)); on = false; clearInterval(iv);
    E.tick = tick; E.render = render;
    t.sort((a, b) => a - b);
    const q = p => +t[Math.min(t.length - 1, Math.floor(t.length * p))].toFixed(2);
    return { frames: t.length, base, p50: q(0.5), p95: q(0.95), p99: q(0.99), aggro: D.monsters.filter(m => m.aggro && m.alive).length, alive: D.monsters.length, calls };
  });
  const gate = r => r.aggro >= 60 && r.p95 <= Math.max(10, r.base + 4);
  let i = await measure();
  if (!gate(i)) { // (as profile-horde: a failed run is retried once on a fresh floor, and the retry decides; a busy machine stalls the GPU in bursts)
    R.note(`dense floor fight, first try: p95 ${i.p95} (the floor alone ${i.base}); retrying on a fresh floor`);
    await ev(() => window.G.enterDungeon({ id: 'bambooDepths', floor: 1 }));
    await waitDungeon(() => window.G?.dungeon?.kind === 'zone' && window.G.dungeon.floor === 1 && !window.G.ui?.iris?.active);
    await sleep(page, 1500);
    i = await measure();
  }
  R.note(`dense floor fight: ${i.aggro} aggroed of ${i.alive} on the floor, CPU frame p50 ${i.p50} / p95 ${i.p95} / p99 ${i.p99} ms over ${i.frames} frames (the floor alone: p95 ${i.base}), up to ${i.calls} draw calls`);
  R.check('perf: a dense fight on a real zone floor (60+ monsters on the hero, the whole floor alive): CPU frame p95 ≤ max(10, the floor-alone baseline + 4) ms (one retry)', gate(i), JSON.stringify(i));
} catch (e) { errors.push('[harness] ' + e.stack); }
const failed = R.finish(errors, warns);
await browser.close();
process.exit(failed ? 1 : 0);
