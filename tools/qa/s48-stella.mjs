// Scenario 48: Stella the Sun Oracle, the sixth hero (docs/STELLA.md).
//  a) the join: her arrival in Blossom Hollow (Kaizo's rowboat, the float down, the greeting, Shadow's bow, the zoomies)
//     plays to the end and she joins with her quest; old saves (Kaizo's quest running: it stays his, no second quest; Kaizo's
//     quest done: the thank-you, no quest); a reload keeps her
//  b) playing her: the village (the Sunsweep, Morning Light), a zone (the Tide Pool), a dungeon (the Burrow) and a horde
//     fight (60 foes round her, her whole kit on a rotation: no errors, a fair frame time)
//  c) every active tapped and fully charged (Stage Ⅲ, every perk) in a Burrow fight lands (hits, heals, shields, summons),
//     and the perks show (Split Shot's rays, Afterglow's line, Mirror Flash, the twin suns, Halo Ring, Hope Springs …)
//  d) heals and shields on her and on Shadow: Morning Light mends both and turns overheal into sun shells (capped at 20%,
//     fading), a halo soaks a blow, Sun Dog wakes a fainted Shadow at once, Shadow wakes in 6 s under her care
//  e) auto-targeting her heals (the `ally` aim): Kind Light goes to the ally who needs it most (Shadow when he's low),
//     falls back to a foe when nobody does; Halo to the one under attack; Sun Dog is always Shadow; the ring under the ally
//     while a heal charges; her ground skills' marker is gold
//  f) the wagasa: over her shoulder in town once she's idle, in her paw in a fight and through every cast; from both 45°
//     yaws at the game camera the canopy never covers her face
//  g) the pad (a tap and a held charge on RB) and touch (a skill button; a tap on Shadow picks him for her heals)
//  h) saving and reloading: she stays the hero, her skills, perks and wagasa come back
// SHOTS=1 saves a few frames to tools/qa/tmp/s48/. PART=abcdefgh picks parts.
import { launch, boot, waitMode, sleep, makeReport, drainDialogue } from './lib.mjs';
import { launchTouch, PHONE, center } from './touch-lib.mjs';
import { installPad, padTap, padDown, padUp, padStick } from './pad-lib.mjs';
import fs from 'node:fs';

const R = makeReport('S48 Stella: her join, every skill and perk, heals and shields, the ally aim, the wagasa, pad and touch, saves');
const { browser, page, errors, warns } = await launch({ w: 1280, h: 720 });
const ev = (f, a) => page.evaluate(f, a);
const SHOTS = !!process.env.SHOTS, OUT = 'tools/qa/tmp/s48', PART = process.env.PART || 'abcdefgh';
if (SHOTS) fs.mkdirSync(OUT, { recursive: true });
const shot = async (name, p = page) => { if (SHOTS) await p.screenshot({ path: `${OUT}/${name}.png` }); };
const J = (o) => JSON.stringify(o);
/** her whole kit at level 30 (skill 12 each), every charge perk optional */
const kit = (perks = false) => ev(async perks => {
  const G = window.G, P = G.state.player, { SKILLS } = await import('/src/rpg/skills.js'), { CHARGE } = await import('/src/rpg/charge.js');
  P.lvl = 30; P.stats = { str: 20, dex: 30, vit: 220, ene: 300 }; P.statPts = 0;
  for (const id of Object.keys(SKILLS)) if (SKILLS[id].cls === 'stella') P.skills[id] = 12;
  P.chargePerks = {}; if (perks) for (const id in CHARGE) if (SKILLS[id].cls === 'stella') P.chargePerks[id] = Object.fromEntries(Object.entries(CHARGE[id].perks).map(([k, q]) => [k, q.ranks]));
  G.actions.recompute(); G.actions.restoreAll(); G.actions.addXp = () => {}; G.state.flags.burrowTut = true;
  return Object.keys(SKILLS).filter(id => SKILLS[id].cls === 'stella' && !['passive', 'aura'].includes(SKILLS[id].kind));
}, perks);
/** a pack of 6 parked foes to her side (stunned, unkillable), Shadow beside her, her life and Shadow's at `lifeK` */
const stage = (lifeK = 0.5) => ev(lifeK => {
  const G = window.G, P = G.player, sh = G.companion, S = G.skills;
  S.clearStella(); if (S.channel) S.endChannel(); S.cds = {}; P.anim.stop(); G.actions.restoreAll();
  if (sh) { sh.fainted = 0; sh.untargetable = false; sh.anim.stop(); sh.life = Math.round(sh.lifeMax * lifeK); sh.setPos(P.pos.x - 1, P.pos.z - 0.6); }
  G.actions.damage(G.derived.lifeMax * (1 - lifeK));
  if (G.dungeon.monsters.filter(m => m.alive && !m.def.boss).length < 6) G.dungeon.summonAround({ pos: P.pos }, 'mochi', 6);
  const { r: rr } = G.engine.rig.groundAxes();
  G.dungeon.monsters.filter(m => m.alive && !m.def.boss).forEach((m, i) => { if (i < 6) { m.pos.set(P.pos.x + rr.x * (2.2 + i * 0.5) + (i % 2) * 0.6, G.world.heightAt(P.pos.x, P.pos.z), P.pos.z + rr.z * (2.2 + i * 0.5) - (i % 2) * 0.6); m.lifeMax = m.life = 1e7; m.status = { stun: 99 }; m.speed = 0; } else { m.pos.x += 60; m.aggro = false; } });
  window.__hits = 0; window.__l0 = G.actions.life(); window.__s0 = sh?.life || 0;
  return { life: Math.round(G.actions.life()), max: G.derived.lifeMax, shadow: sh ? [Math.round(sh.life), sh.lifeMax] : null };
}, lifeK);
const cast = (id, stage = 0) => ev(([id, stage]) => {
  const G = window.G, P = G.player, { r: rr } = G.engine.rig.groundAxes(), aim = P.pos.clone().addScaledVector(rr, 3), tgt = G.combat.nearest(aim, 'ally', 3, e => e.team === 'enemy');
  try { return { ok: stage ? G.skills.tryCast(id, aim, tgt, { stage }) : G.skills.tryCast(id, aim, tgt) }; } catch (e) { return { threw: String(e.stack || e).slice(0, 300) }; }
}, [id, stage]);
const state = () => ev(() => {
  const G = window.G, S = G.skills, sh = G.companion, D = G.dungeon;
  return { hits: window.__hits, heal: Math.round(G.actions.life() - window.__l0), sheal: Math.round((sh?.life || 0) - window.__s0), shellP: Math.round(S.stlShell('player')), shellS: Math.round(S.stlShell('shadow')), halos: S.stlHalos?.size || 0,
    suns: (S.stlSuns || []).filter(s => s.alive).length, spots: (S.stlSpotList || []).filter(s => !s.done).length, discs: (S.stlDiscs || []).length, dog: S.stlDog ? { twin: !!S.stlDog.twin, heel: !!S.stlDog.heel } : null, day: S.stlDay ? { hope: !!S.stlDay.hope } : null,
    gild: [...(S.stlGilded || [])].filter(e => e.alive).length, burn: D ? D.monsters.filter(m => m.status?.burn?.sun && m.status.burn.t > 0).length : 0, mirror: D ? D.monsters.filter(m => (m._stlMirrorT || 0) > G.engine.time).length : 0,
    blind: D ? D.monsters.filter(m => m.status?.blind > 0).length : 0, chorus: !!G.combat.buffs.chorus, daybuff: !!G.combat.buffs.daybreak, zones: G.combat.zones.length, chan: S.channel?.id || null };
});
const hitCounter = () => ev(() => { const G = window.G; if (G.combat.__stlWrapped) return; const raw = G.combat.hitMonster.bind(G.combat); G.combat.hitMonster = (m, o) => { window.__hits++; return raw(m, o); }; G.combat.__stlWrapped = true; });
const toBurrow = async () => { await ev(() => { window.G.state.flags.burrowTut = true; window.G.enterDungeon(3); }); await waitMode(page, 'dungeon'); await sleep(page, 900); await hitCounter(); };
/** advance until the page's predicate holds (keyed on the game's state), or the timeout */
const until = (fn, arg, ms = 6000) => page.waitForFunction(fn, arg, { timeout: ms }).then(() => true).catch(() => false);

/** the debug menu's Heroes actions (src/debug/debugActions.js: Play her arrival, …with Kaizo's quest running) */
const debugRun = label => ev(async label => { // (as the debug menu's actions do: src/debug/debugActions.js stellaArrival)
  const G = window.G, { arrivalOf } = await import('/src/world/heroQuests.js'), A = G.arrivals, a = arrivalOf('stella'), kaizo = /Kaizo/.test(label);
  if (A.cur) { A.scenes[A.cur.a.scene]?.reset?.(true); A.cur = null; }
  A.forget(a);
  if (kaizo) { (G.state.flags.arrivals ||= {}).tidepool = { how: 'scene', quest: 'start', day: 1 }; G.state.quests.active.push({ id: 'hq_shiokaze', step: 0, prog: 0 }); }
  A.begin(a, { force: true });
  return kaizo ? 'Captain Kaizo is rowing Stella over (his quest running)' : 'Captain Kaizo is rowing Stella over';
}, label);
/** her arrival, quickly: wait for the boat on the beach, walk up to her (within 6 m), answer to the end */
const playArrival = async () => {
  if (!await until(() => window.G.heroes.stlJoin?.state === 'land', null, 60000)) return R.note('her boat never landed: ' + J(await ev(() => ({ state: window.G.heroes.stlJoin?.state, due: window.G.arrivals?.due?.()?.who || null, why: window.G.arrivals?.why?.() || null }))));
  await ev(() => { const G = window.G, J = G.heroes.stlJoin, a = J.stella, P = G.player, W = G.world; for (const r of [5, 4, 6]) for (let i = 0; i < 16; i++) { const t = i / 16 * Math.PI * 2, x = a.pos.x + Math.sin(t) * r, z = a.pos.z + Math.cos(t) * r; if (W.walkable(x, z) !== false && !W.collision?.solidAt?.(x, z, 0.3)) { P.setPos(x, z); P.pos.y = W.heightAt(x, z); return; } } });
  for (let i = 0; i < 40; i++) {
    if (await ev(() => window.__stlPh.includes('done') && !window.G.ui.dlg?.active)) break;
    await until(() => window.G.ui.dlg?.active || window.__stlPh.includes('done'), null, 15000);
    await drainDialogue(page, [0, 0, 0, 0]);
  }
};

try {
  // ============================================================================ a) the join: her arrival and the old saves
  if (PART.includes('a')) {
    await boot(page, 'fresh&nointro&notut&hour=10&arrive&qcard');
    await ev(() => { const G = window.G; window.__stlPh = []; G.events.on('stella:joinScene', p => window.__stlPh.push(p.phase)); G.sim.tickT = -1e9; window.__freeze = setInterval(() => { G.sim.tickT = -1e9; }, 200); G.state.quests.active = G.state.quests.active.filter(q => q.id !== 'welcome'); G.state.quests.cards = []; if (G.day) G.day.paused = true; /* (a calm town: as s47's setup) */ G.state.player.lvl = 18; G.actions.recompute(); G.state.flags.hints = { ...(G.state.flags.hints || {}), stlRumour: 1, gldRumour: 1, stzRumour: 1, garden: 1, build: 1, travel: 1, skills: 1, stats: 1, loot: 1, potion: 1, fight: 1, dig: 1, scavDig: 1, sprint: 1 }; for (const id of ['moka', 'poe', 'shihtzu']) G.state.flags[id + 'Joined'] = true; });
    const a0 = await debugRun('Play her arrival');
    await playArrival();
    await until(() => !!window.G.state.flags.stellaJoined && window.G.state.quests.active.some(q => q.id === 'hq_shiokaze'), null, 20000);
    await shot('a-joined');
    const a1 = await ev(() => { const G = window.G, q = G.state.quests.active.find(x => x.id === 'hq_shiokaze'), d = G.story.def('hq_shiokaze'); return { ph: [...new Set(window.__stlPh)], joined: !!G.state.flags.stellaJoined, quest: !!q, giver: q?.giver || d.giver, n: G.state.quests.active.filter(x => x.id === 'hq_shiokaze').length, villager: !!G.heroes.villagers.stella, rec: G.state.flags.arrivals?.tidepool?.by || null }; });
    R.check(`her arrival plays to the end (${a1.ph.join(' → ')}): Kaizo's boat, the float down, the talk, the greeting with Shadow's bow, the zoomies, the leave; she joins (her villager at the cottage) and "Trouble at Shiokaze Port" is hers`, /rowing/.test(a0) && ['land', 'float', 'talk', 'greet', 'zoomies', 'leave', 'done'].every(p => a1.ph.includes(p)) && a1.joined && a1.quest && a1.n === 1 && a1.giver === 'stella' && a1.villager && a1.rec === 'stella', J({ a0, a1 }));
    // the old save: Kaizo's quest already running (it stays his: no second quest)
    await ev(() => { window.__stlPh = []; const G = window.G, Q = G.state.quests; Q.active = Q.active.filter(q => q.id !== 'hq_shiokaze'); });
    const a2 = await debugRun("Her arrival with Kaizo's quest running");
    await playArrival();
    await until(() => !!window.G.state.flags.stellaJoined, null, 20000);
    const a3 = await ev(() => { const G = window.G, Q = G.state.quests, q = Q.active.find(x => x.id === 'hq_shiokaze'); return { ph: window.__stlPh.includes('done'), joined: !!G.state.flags.stellaJoined, n: Q.active.filter(x => x.id === 'hq_shiokaze').length, qg: q?.giver || null }; });
    R.check("an old save (Kaizo's quest running): she still arrives and joins; one quest, still his (q.giver sk_kaizo)", /Kaizo/.test(a2) && a3.ph && a3.joined && a3.n === 1 && a3.qg === 'sk_kaizo', J({ a2, a3 }));
    await ev(() => window.G.save());
    await page.goto(page.url().replace(/[?&]fresh\b/, ''), { waitUntil: 'load' });
    await page.waitForFunction(() => window.__ready === true && window.G?.player, null, { timeout: 60000 });
    await sleep(page, 1500);
    const a4 = await ev(() => { const G = window.G, Q = G.state.quests; return { joined: !!G.state.flags.stellaJoined, n: Q.active.filter(x => x.id === 'hq_shiokaze').length, qg: Q.active.find(x => x.id === 'hq_shiokaze')?.giver || null, scene: G.heroes.stlJoin?.state || null, wheel: G.heroes.roster().find(h => h.id === 'stella') }; });
    R.check('a reload keeps it: she is in the pack (the wheel), the one quest still his, no second arrival', a4.joined && a4.n === 1 && a4.qg === 'sk_kaizo' && !['land', 'float', 'talk'].includes(a4.scene) && !!a4.wheel, J({ ...a4, wheel: a4.wheel && { id: a4.wheel.id, joined: a4.wheel.joined } }));
  }

  // ============================================================================ b) playing her: village, zone, dungeon, horde
  if (PART.includes('b')) {
    await boot(page, 'fresh&nointro&notut&noarrive&hero=stella&hour=11');
    const v0 = await ev(() => { const G = window.G; return { hero: G.player.hero, cls: G.state.player.cls, wt: G.derived.weaponType, model: G.player.rig.model, parasol: !!G.player.parasol, hotbar: G.state.player.hotbar.slice(0, 3), mouseSets: G.state.player.mouseSets, inv: G.state.equipment.weapon?.base }; });
    R.check('she plays as herself: the baked stella_toy rig with the sun wagasa, the Paper Wagasa equipped, Golden Ray on right-click and Morning Light on 1', v0.hero === 'stella' && v0.model === 'stella_toy' && v0.parasol && v0.wt === 'parasol' && v0.inv === 'paperWagasa' && v0.hotbar[1] === 'goldenRay' && v0.hotbar[2] === 'morningLight', J(v0));
    await ev(() => { const G = window.G; window.__acts = []; const raw = G.player.anim.play.bind(G.player.anim); G.player.anim.play = (n, o) => { window.__acts.push(n); return raw(n, o); }; G.actions.damage(G.derived.lifeMax * 0.4); window.__l0 = G.actions.life(); });
    for (let i = 0; i < 3; i++) { await ev(() => { const G = window.G, P = G.player; G.skills.tryCast('attack', P.pos.clone().add(new P.pos.constructor(Math.sin(P.facing), 0, Math.cos(P.facing)))); }); await until(() => !window.G.player.anim.busy(), null, 3000); }
    await ev(() => { const G = window.G; G.skills.tryCast('morningLight', G.player.pos.clone()); });
    await until(() => window.G.actions.life() > window.__l0 + 1, null, 4000);
    const v1 = await ev(() => ({ acts: window.__acts, heal: Math.round(window.G.actions.life() - window.__l0) }));
    R.check('in the village: the Sunsweep combo plays its sweeps and twirl, and Morning Light mends her', ['parasolSweep1', 'parasolSweep2', 'parasolTwirl'].every(a => v1.acts.includes(a)) && v1.acts.includes('parasolRaise') && v1.heal > 0, J(v1));
    // a zone (the Tide Pool, outdoors)
    await kit(false);
    await ev(() => window.G.enterRegion('tidepool')); await waitMode(page, 'dungeon'); await sleep(page, 900); await hitCounter();
    const z = await ev(async () => {
      const G = window.G, P = G.player; G.state.player.zoom = null;
      const near = G.combat.nearest(P.pos, 'ally', 40, e => e.team === 'enemy' && !e.breakable);
      if (near) { P.setPos(near.pos.x - 3, near.pos.z); P.pos.y = G.world.heightAt(P.pos.x, P.pos.z); }
      window.__hits = 0; const t = near || null;
      const ok = G.skills.tryCast('goldenRay', t ? t.pos.clone() : P.pos.clone(), t);
      return { mode: G.mode, region: G.dungeon?.region || G.dungeon?.id || null, ok, foe: !!near };
    });
    await until(() => window.__hits > 0, null, 3000);
    const z1 = { ...z, hits: await ev(() => window.__hits) };
    R.check('in a zone (the Tide Pool): Golden Ray lands on its yokai', z1.ok && z1.hits > 0, J(z1));
    // the Burrow and a horde fight
    await toBurrow();
    const hz = await ev(async () => {
      const G = window.G, D = G.dungeon, P = G.player; window.__frames = []; let last = performance.now();
      D.summonAround({ pos: P.pos }, 'mochi', 30); D.summonAround({ pos: P.pos }, 'kodama', 30);
      for (const m of D.monsters) { if (!m.alive) continue; m.lifeMax = m.life = m.lifeMax * 6; m.aggro = true; }
      const ROT = ['littleSun', 'goldenRay', 'attack', 'solarFlare', 'prism', 'sunspot', 'sunDog', 'glint', 'attack', 'skippingSun', 'halo', 'goldenRay', 'risingSun', 'morningLight', 'kindLight', 'sundial', 'attack', 'solarFlare', 'daybreak', 'prism'];
      let ri = 0; const t0 = performance.now();
      await new Promise(done => { const step = () => { const now = performance.now(); window.__frames.push(now - last); last = now;
        if (now - t0 > 9000) return done();
        if (!P.anim.busy() && (window.__nextC || 0) < now) { window.__nextC = now + 220; G.state.player.zoom = null; G.state.player.life = null; G.skills.cds = {}; const id = ROT[ri++ % ROT.length], t = G.combat.nearest(P.pos, 'ally', 9, e => e.team === 'enemy' && !e.breakable); if (t) G.skills.tryCast(id, t.pos.clone(), t); }
        requestAnimationFrame(step); }; requestAnimationFrame(step); });
      const f = window.__frames.slice(20).sort((a, b) => a - b), p95 = f[Math.floor(f.length * 0.95)], med = f[f.length >> 1];
      return { foes: D.monsters.filter(m => m.alive).length, hits: window.__hits, p50: +med.toFixed(1), p95: +p95.toFixed(1), casts: ri };
    });
    await shot('b-horde');
    R.check(`a horde fight (60 foes round her in the Burrow, her whole kit on a rotation for 9 s): no errors, the kit lands (${hz.hits} hits), frames hold (p50 ${hz.p50} ms, p95 ${hz.p95} ms; the strict gate is profile-horde's)`, hz.hits > 50 && hz.casts > 8 && hz.p95 < 100, J(hz));
  }

  // ============================================================================ c) every active, tapped and charged with every perk
  if (PART.includes('c')) {
    await boot(page, 'fresh&nointro&notut&noarrive&hero=stella'); await toBurrow();
    const ids = await kit(true);
    const LONG = new Set(['sundial', 'risingSun', 'sunspot', 'littleSun', 'skippingSun', 'daybreak', 'halo', 'sunDog', 'morningLight']);
    const res = [];
    for (const st of [0, 3]) for (const id of ids) {
      await stage(0.5);
      if (id === 'solarRay') await ev(() => { const S = window.G.skills, u = S.updateSolarRay.bind(S); window.__hold = true; if (!S.__qaRay) { S.__qaRay = true; S.updateSolarRay = dt => u(dt, { holding: k => k === 'solarRay' && window.__hold }); } });
      const r = await cast(id, st);
      if (id === 'solarRay') { await until(() => window.__hits >= 4, null, 4000); await ev(() => { window.__hold = false; }); }
      else await until(id => { const S = window.G.skills; return window.__hits > 0 || window.G.actions.life() > window.__l0 + 1 || S.stlHalos?.size || S.stlSuns?.length || S.stlDog || S.stlDay; }, id, LONG.has(id) ? 3000 : 2000);
      await sleep(page, LONG.has(id) ? 900 : 250);
      res.push({ id, st, ...r, ...await state() });
    }
    const by = (id, st) => res.find(x => x.id === id && x.st === st) || {};
    const threw = res.filter(r => r.threw), refused = res.filter(r => !r.ok && !r.threw);
    const DMG = ['goldenRay', 'glint', 'prism', 'solarRay', 'sundial', 'solarFlare', 'skippingSun', 'sunspot', 'risingSun'];
    const lands = res.every(r => DMG.includes(r.id) ? r.hits > 0 : true)
      && ['morningLight', 'daybreak'].every(id => [0, 3].every(s => by(id, s).heal > 0 && by(id, s).sheal > 0))
      && [0, 3].every(s => by('kindLight', s).heal > 0 || by('kindLight', s).sheal > 0) && [0, 3].every(s => by('halo', s).halos >= 1) && [0, 3].every(s => by('littleSun', s).suns >= 1 && by('littleSun', s).hits > 0)
      && [0, 3].every(s => !!by('sunDog', s).dog) && [0, 3].every(s => !!by('daybreak', s).day && by('daybreak', s).daybuff);
    R.check(`every active (${ids.length}) tapped and fully charged lands: the rays, flares, discs and columns hit; Morning Light, Daybreak and Kind Light heal; the halo, Hinata, the sun dog and Daybreak appear; no errors`, ids.length === 15 && !threw.length && !refused.length && lands, J({ threw: threw.map(t => t.id + ': ' + t.threw), refused: refused.map(r => r.id + '@' + r.st), res: res.map(r => [r.id, r.st, r.hits, r.heal, r.sheal, r.halos, r.suns]) }));
    const perks = {
      'Split Shot and Searing Ray (more foes hit)': by('goldenRay', 3).hits > by('goldenRay', 0).hits, 'Afterglow (a lit line left)': by('goldenRay', 3).zones > 0,
      'Mirror Flash': by('glint', 3).mirror > 0, 'Glint dazzles': by('glint', 0).blind > 0,
      'Twin Suns (Hikari)': by('littleSun', 3).suns === 2, 'Halo Ring (a second halo)': by('halo', 3).halos >= 2,
      'Twin Sun Dogs and Heel!': by('sunDog', 3).dog?.twin && by('sunDog', 3).dog?.heel, 'Hope Springs': by('daybreak', 3).day?.hope,
      'Dawn Chorus': by('morningLight', 3).chorus, 'Sea Skimmer (little sunspots)': by('skippingSun', 3).hits > by('skippingSun', 0).hits,
      'the sunburn (gold, on hit)': by('solarFlare', 0).burn > 0, 'the gilding': by('goldenRay', 0).gild > 0,
    };
    R.check('the charge perks show: ' + Object.keys(perks).join(', '), Object.values(perks).every(Boolean), J(perks));
  }

  // ============================================================================ d) heals and shields on her and on Shadow
  if (PART.includes('d')) {
    await boot(page, 'fresh&nointro&notut&noarrive&hero=stella'); await toBurrow(); await kit(false);
    await stage(1);
    await cast('morningLight'); await until(() => window.G.skills.stlShell('player') > 0 && window.G.skills.stlShell('shadow') > 0, null, 4000);
    const d1 = await ev(() => { const G = window.G, S = G.skills; return { p: Math.round(S.stlShell('player')), pc: Math.round(S.stlShellCap('player')), s: Math.round(S.stlShell('shadow')), sc: Math.round(S.stlShellCap('shadow')), life: Math.round(G.actions.life()), max: G.derived.lifeMax }; });
    R.check(`overheal becomes sun shells on her and on Shadow (her ${d1.p} of ${d1.pc}, his ${d1.s} of ${d1.sc}: up to 20% of each one's life)`, d1.p > 0 && d1.p <= d1.pc + 1 && d1.s > 0 && d1.s <= d1.sc + 1 && Math.abs(d1.pc - d1.max * 0.2) < 2, J(d1));
    await ev(() => { window.G.skills.stlFillShells(); });
    const d2 = await ev(() => { const G = window.G, before = G.actions.life(), sh = G.skills.stlShell('player'); G.combat.hitPlayer(sh * 0.5, { element: 'phys', level: 1 }); return { lost: Math.round(before - G.actions.life()), shell: Math.round(G.skills.stlShell('player')), sh0: Math.round(sh) }; });
    R.check(`a shell soaks a blow (a hit of half the shell took ${d2.lost} life; the shell ${d2.sh0} → ${d2.shell})`, d2.lost === 0 && d2.shell < d2.sh0, J(d2));
    // (8.6 s of her effects stepped in game time: a loaded machine runs the page's clock slower than the wall)
    const d2b = await ev(() => { const S = window.G.skills, mid = []; S.stlHots = []; S.stlFillShells(); /* (Morning Light's heal over time done: its overheal would top them up) */ for (let i = 0; i < 86; i++) { S.updateStellaArts(0.1); if (i === 50) mid.push(Math.round(S.stlShell('player'))); } return { mid: mid[0], p: S.stlShell('player'), s: S.stlShell('shadow') }; });
    R.check('the shells fade within 8 s (game time)', d2b.mid > 0 && d2b.p < 0.5 && d2b.s < 0.5, J(d2b));
    // Halo on Shadow soaks a blow; Sun Dog wakes him at once; under her care he wakes in 6 s
    await stage(0.5);
    const d3 = await ev(() => { const G = window.G, S = G.skills, sh = G.companion, R = S.rt('halo'); S.stlHaloOn(S.stlBody('shadow'), R.params, {}, 1); const h0 = S.stlHalos.get(sh)?.amt || 0, l0 = sh.life; sh.takeDamage(h0 * 0.5); return { h0: Math.round(h0), h1: Math.round(S.stlHalos.get(sh)?.amt || 0), lost: Math.round(l0 - sh.life) }; });
    R.check(`a halo on Shadow soaks his blows (${d3.h0} → ${d3.h1}, he lost ${d3.lost})`, d3.h0 > 0 && d3.lost === 0 && d3.h1 < d3.h0, J(d3));
    const d4 = await ev(() => { const G = window.G, sh = G.companion; G.skills.clearStella(); sh.takeDamage(sh.life + 50); return { fainted: +sh.fainted.toFixed(1), revive: G.derived.shadowRevive }; });
    R.check(`under her care a fainted Shadow wakes in ${d4.revive} s, not 10`, d4.revive === 6 && d4.fainted > 5 && d4.fainted <= 6, J(d4));
    await cast('sunDog'); await until(() => !(window.G.companion.fainted > 0), null, 3000);
    const d5 = await ev(() => { const G = window.G, sh = G.companion; return { fainted: sh.fainted, life: Math.round(sh.life / sh.lifeMax * 100), dog: !!G.skills.stlDog }; });
    R.check(`Sun Dog on a fainted Shadow wakes him at once (${d5.life}% life) and makes him a sun dog`, !(d5.fainted > 0) && d5.life >= 45 && d5.dog, J(d5));
    const d6 = await ev(() => { const G = window.G, sh = G.companion; sh.life = 5; sh.takeDamage(500); return { life: Math.round(sh.life), fainted: sh.fainted > 0, caught: !!G.skills.stlDog?.caught }; });
    R.check(`Sun Dog catches the blow that would knock him out (he stays up, mended: ${d6.life} life)`, !d6.fainted && d6.caught && d6.life > 1, J(d6));
  }

  // ============================================================================ e) auto-targeting her heals (the `ally` aim)
  if (PART.includes('e')) {
    await boot(page, 'fresh&nointro&notut&noarrive&hero=stella'); await toBurrow(); await kit(false);
    await ev(() => window.G.ui?.setSetting?.('targetKbm', 2));
    await stage(1);
    const e1 = await ev(async () => {
      const G = window.G, A = G.autoAim, sh = G.companion, P = G.player, { aimSpec, aimLine, AIM } = await import('/src/combat/autoTarget.js');
      const near = (pt, b) => Math.hypot(pt.x - b.pos.x, pt.z - b.pos.z) < 0.9;
      A.cache.clear(); sh.life = sh.lifeMax * 0.3; P._stlHitT = -9;
      const [kAim] = A.aimFor('kindLight'), kindTo = G.skills.stlAllyFor('kindLight', null)?.kind;
      A.cache.clear(); sh.life = sh.lifeMax; G.actions.restoreAll();
      const [k2] = A.aimFor('kindLight'), none = G.skills.stlAllyFor('kindLight', null);
      const foeLine = !near(k2, sh) && G.combat.nearest(k2, 'ally', 4, e => e.team === 'enemy') != null;
      A.cache.clear(); const [dAim] = A.aimFor('sunDog');
      return { kinds: ['kindLight', 'halo', 'sunDog'].map(id => AIM[id]?.kind), kindToShadow: near(kAim, sh) && kindTo === 'shadow', fallback: !none && foeLine, sunDog: near(dAim, sh), line: aimLine('kindLight', { mode: 2, dev: 'kbm' }), spec: aimSpec('goldenRay', G.skills.rt('goldenRay')).kind };
    });
    R.check('Auto: Kind Light goes to the ally who needs it most (Shadow at 30%), with nobody hurt it falls back to a foe down a line; Sun Dog always Shadow; the `ally` kind and its words', e1.kinds.every(k => k === 'ally') && e1.kindToShadow && e1.fallback && e1.sunDog && /ally who needs it most, or a foe/.test(e1.line) && e1.spec === 'line', J(e1));
    // the real cast follows the aim: Shadow low → Kind Light mends Shadow; the halo goes to the one under attack
    await stage(1); await ev(() => { const sh = window.G.companion; sh.life = sh.lifeMax * 0.3; window.__s0 = sh.life; });
    await cast('kindLight'); await until(() => window.G.companion.life > window.__s0 + window.G.companion.lifeMax * 0.1, null, 3000);
    const e2 = await state();
    await stage(1); await ev(() => { const G = window.G, sh = G.companion, m = G.dungeon.monsters.find(x => x.alive && !x.def.boss); m.pos.set(sh.pos.x + 0.8, m.pos.y, sh.pos.z); m.atkTarget = sh; m.target = sh; });
    await cast('halo'); await until(() => window.G.skills.stlHalos?.size > 0, null, 3000);
    const e3 = await ev(() => ({ onShadow: window.G.skills.stlHalos?.has(window.G.companion) }));
    R.check(`the casts follow it: Kind Light mends Shadow (+${e2.sheal}), Halo settles on the one under attack (Shadow)`, e2.sheal > 0 && e3.onShadow && e2.heal <= 1, J({ e2, e3 }));
    // the ring under the ally while a heal charges, the gold AoE marker for her ground skills
    await stage(1); await ev(() => { const G = window.G; G.companion.life = G.companion.lifeMax * 0.3; G.state.player.hotbar[2] = 'kindLight'; G.state.player.chargePerks = { kindLight: { stages: 2 } }; G.skills.charge.forceHeld = 2; G.skills.charge.feed(2, 'kindLight', G.companion.pos.clone(), null); });
    await until(() => window.G.skills.charge.active, null, 2000); await sleep(page, 300);
    const e4 = await ev(() => { const G = window.G, S = G.skills, r = S.stlRing; let vis = false, at = null; G.world.scene.traverse(o => { if (o.isMesh && o.visible && o.material?.opacity > 0.2 && o.material.map && o.position.distanceTo(G.companion.pos) < 0.6 && o.renderOrder === 8) { vis = true; at = o.position.toArray(); } }); return { charging: !!S.charge.active, ring: !!r, vis }; });
    await ev(() => { const G = window.G; G.skills.charge.forceHeld = null; G.skills.charge.cancel('qa', true); });
    R.check('while Kind Light charges, a soft rose-gold ring sits under the ally it will go to (Shadow)', e4.charging && e4.ring && e4.vis, J(e4));
  }

  // ============================================================================ f) the wagasa: carry, paw, casts, never over her face
  if (PART.includes('f')) {
    await boot(page, 'fresh&nointro&notut&noarrive&hero=stella&hour=11');
    await until(() => window.G.player.parasol?.how === 'carry', null, 6000);
    const f1 = await ev(() => ({ how: window.G.player.parasol?.how, glb: !!window.G.player.parasol?.glb, tassels: window.G.player.parasol?.tassels?.length || 0, finial: !!window.G.player.parasol }));
    await ev(() => { const G = window.G; G.skills.tryCast('attack', G.player.pos.clone().add(new G.player.pos.constructor(1, 0, 0))); });
    await until(() => window.G.player.parasol?.how === 'hand', null, 2000);
    const f2 = await ev(() => window.G.player.parasol?.how);
    await until(() => window.G.player.parasol?.how === 'carry', null, 7000);
    const f3 = await ev(() => window.G.player.parasol?.how);
    R.check(`the wagasa (the Blender sun wagasa: ${f1.tassels} tassels) rides over her shoulder in town, comes into her paw for a move, and goes back to the shoulder after a few idle seconds`, f1.how === 'carry' && f1.glb && f1.tassels >= 4 && f2 === 'hand' && f3 === 'carry', J({ f1, f2, f3 }));
    // every cast's pose from both 45° yaws at the game camera: the canopy (its disc round the finial) never covers her face
    const f4 = await ev(async () => {
      const G = window.G, P = G.player, cam = G.engine.camera, rig = G.engine.rig, out = [];
      const { finialWorld } = await import('/src/actors/stellaGear.js');
      const scr = v => { const p = v.clone().project(cam); return [(p.x * 0.5 + 0.5) * innerWidth, (-p.y * 0.5 + 0.5) * innerHeight, p.z]; };
      for (const act of ['parasolSweep1', 'parasolTwirl', 'parasolAim', 'parasolGlint', 'skimThrow', 'parasolRaise', 'gnomonPlant', 'sunCall', null]) for (const yaw of [-Math.PI / 4, Math.PI / 4]) {
        P.anim.stop(); if (act) P.anim.play(act); const A = P.anim.action; if (A) A.t = A.dur * 0.55;
        const camYaw = Math.atan2(cam.position.x - P.pos.x, cam.position.z - P.pos.z); P.facing = P.faceTarget = camYaw + yaw;
        P._parT = act ? 1e9 : 0; for (let i = 0; i < 3; i++) await new Promise(r => requestAnimationFrame(r));
        A && (A.t = A.dur * 0.55); G.engine.timeScale = 0; await new Promise(r => requestAnimationFrame(r));
        const R = P.parasol; R.holder.updateWorldMatrix(true, true);
        const head = new P.pos.constructor(); P.rig.parts.head.getWorldPosition(head); head.y += 0.12;
        const fin = finialWorld(R, new P.pos.constructor()), mid = new P.pos.constructor().setFromMatrixPosition(R.holder.matrixWorld).lerp(fin, 0.8);
        const [hx, hy, hz] = scr(head), [cx, cy, cz] = scr(mid), edge = scr(mid.clone().add(new P.pos.constructor(0.38, 0, 0)));
        const rpx = Math.hypot(edge[0] - cx, edge[1] - cy), d = Math.hypot(hx - cx, hy - cy);
        out.push({ act: act || 'stand', yaw: Math.round(yaw * 57), cover: cz < hz && d < rpx * 0.75, d: Math.round(d), r: Math.round(rpx) });
        G.engine.timeScale = 1;
      }
      P.anim.stop(); return out;
    });
    const covered = f4.filter(x => x.cover);
    R.check(`from both 45° yaws at the game camera, through every cast pose (${f4.length / 2} poses), the canopy never covers her face`, !covered.length, J(covered.length ? covered : f4.slice(0, 4)));
  }

  // ============================================================================ g) the pad and touch
  if (PART.includes('g')) {
    await boot(page, 'fresh&nointro&notut&noarrive&hero=stella'); await toBurrow(); await kit(false); await stage(1);
    await installPad(page);
    await padStick(page, 'left', 0, -0.6); await sleep(page, 120); await padStick(page, 'left', 0, 0); await sleep(page, 200); // (a stick push: the pad becomes the device playing)
    await ev(() => { window.__casts = []; window.__rel = []; const G = window.G; const raw = G.skills.tryCast.bind(G.skills); G.skills.tryCast = (id, a, t, c) => { const r = raw(id, a, t, c); if (r) window.__casts.push([id, c?.stage || 0]); return r; }; G.events.on('charge:release', p => window.__rel.push(p)); G.state.player.chargePerks = { goldenRay: { stages: 2 } }; });
    await padTap(page, 'X'); await until(() => window.__casts.some(c => c[0] === 'goldenRay'), null, 3000);
    await until(() => !window.G.player.anim.busy(), null, 2000); await ev(() => { window.G.skills.cds = {}; window.G.state.player.zoom = null; });
    await padDown(page, 'X'); await until(() => (window.G.skills.charge.active?.stage || 0) >= 2, null, 5000); await padUp(page, 'X');
    await until(() => window.__rel.some(r => r.id === 'goldenRay' && r.stage >= 2), null, 3000);
    const g1 = await ev(() => ({ casts: window.__casts, rel: window.__rel.map(r => [r.id, r.stage]) }));
    R.check('the pad: X (her right-click skill) taps a Golden Ray, and a held X charges it to Stage Ⅱ and releases the Searing Ray', g1.casts.some(c => c[0] === 'goldenRay' && c[1] === 0) && g1.rel.some(r => r[0] === 'goldenRay' && r[1] >= 2), J(g1));
    // touch: a phone, the skill button casts Morning Light; a tap on Shadow picks him for her heals
    const T = await launchTouch(PHONE), tp = T.page;
    try {
      await boot(tp, 'fresh&nointro&notut&noarrive&hero=stella');
      await tp.evaluate(() => { window.G.state.flags.burrowTut = true; window.G.enterDungeon(3); }); await waitMode(tp, 'dungeon'); await sleep(tp, 900);
      await tp.evaluate(() => { const G = window.G; G.actions.damage(G.derived.lifeMax * 0.4); window.__l0 = G.actions.life(); });
      const btn = await tp.evaluate(() => { const els = [...document.querySelectorAll('[data-slot="2"], .tc-skill[data-slot="2"], .tc-slot2')]; const e = els.find(x => x.getBoundingClientRect().width > 0); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
      if (btn) await T.F.tap(btn.x, btn.y);
      const healed = await tp.waitForFunction(() => window.G.actions.life() > window.__l0 + 1, null, { timeout: 4000 }).then(() => true).catch(() => false);
      await tp.evaluate(() => { const G = window.G, sh = G.companion, P = G.player; for (const m of G.dungeon.monsters) if (m.alive) { m.pos.x += 60; m.aggro = false; } /* (no foe under the tap: a foe there is locked instead) */ sh.setPos(P.pos.x + 1.4, P.pos.z + 0.4); sh.hold = { x: sh.pos.x, z: sh.pos.z, face: 0 }; });
      await sleep(tp, 200);
      const sxy = await tp.evaluate(() => { const G = window.G, v = G.companion.pos.clone(); v.y += 0.35; v.project(G.engine.camera); return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight }; }); // (where he is now, just before the tap)
      await T.F.tap(sxy.x, sxy.y);
      const pick = await tp.evaluate(([x, y]) => { const G = window.G, S = G.skills.stlPick, el = document.elementFromPoint(x, y); if (S) return { shadow: S.e === G.companion, secs: +(S.until - G.engine.time).toFixed(1) }; const v = G.companion.pos.clone(); v.y += 0.35; v.project(G.engine.camera); return { miss: true, el: el ? `${el.tagName}.${el.className}` : null, fainted: G.companion.fainted || 0, foe: G.combat.pickAtScreen(x, y, G.engine.camera, 40)?.id || null, drift: Math.round(Math.hypot((v.x * 0.5 + 0.5) * innerWidth - x, (-v.y * 0.5 + 0.5) * innerHeight - y)), mode: G.mode }; }, [sxy.x, sxy.y]); // (a miss says what was under the tap)
      await shot('g-touch', tp);
      R.check(`touch (a phone): her skill button casts Morning Light (she mends), and a tap on Shadow picks him for her heals for 5 s`, !!btn && healed && pick?.shadow && pick.secs > 3, J({ btn, healed, pick, errs: T.errors.slice(0, 3) }));
      errors.push(...T.errors.map(e => '[touch] ' + e));
    } finally { await T.browser.close(); }
  }

  // ============================================================================ h) saving and reloading
  if (PART.includes('h')) {
    await boot(page, 'fresh&nointro&notut&noarrive&hero=stella'); await kit(true);
    const h0 = await ev(() => { const G = window.G; G.state.player.hotbar[3] = 'halo'; G.state.equipment.weapon && (G.state.equipment.weapon.base = G.state.equipment.weapon.base); G.save(); return { lvl: G.state.player.lvl, skills: Object.keys(G.state.player.skills).length, perks: Object.keys(G.state.player.chargePerks || {}).length, joined: !!G.state.flags.stellaJoined, active: G.state.activeHero }; });
    await page.goto(page.url().replace(/[?&]fresh\b/, '').replace(/hero=stella&?/, ''), { waitUntil: 'load' });
    await page.waitForFunction(() => window.__ready === true && window.G?.player, null, { timeout: 60000 });
    await until(() => window.G.player.rig.model === 'stella_toy', null, 8000);
    const h1 = await ev(() => { const G = window.G; return { hero: G.player.hero, active: G.state.activeHero, lvl: G.state.player.lvl, skills: Object.keys(G.state.player.skills).length, perks: Object.keys(G.state.player.chargePerks || {}).length, hb3: G.state.player.hotbar[3], wt: G.derived.weaponType, parasol: !!G.player.parasol, joined: !!G.state.flags.stellaJoined }; });
    R.check('a save and a reload keep her: the hero played, her level, skills, charge perks, hotbar and wagasa', h1.hero === 'stella' && h1.active === 'stella' && h1.lvl === h0.lvl && h1.skills === h0.skills && h1.perks === h0.perks && h1.hb3 === 'halo' && h1.wt === 'parasol' && h1.parasol && h1.joined, J({ h0, h1 }));
  }
} catch (e) { errors.push('[harness] ' + e.stack); }
const failed = R.finish(errors, warns);
await browser.close();
process.exit(failed ? 1 : 0);
