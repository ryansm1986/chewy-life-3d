// Scenario 28: the Shih Tzu, the fourth hero (docs/SHIHTZU.md).
//  a) his arrival in Blossom Hollow (since ROADMAP Z-H3; docs/SHIHTZU.md §5): Momiji Hollow open and Poe joined, at
//     golden hour he kneels on the Shrine Road's paving by three paper lanterns (on screen as you come up the road),
//     lighting them one by one with a ghost pup at his shoulder; walk up and he rises, proclaims, the pup licks his face
//     mid-word; the dialogue (his name from CLASSES.shihtzu.name); he joins and snuffs the lanterns into his tome; his
//     quest starts; he lives at home at once, three heroes on the bench
//  b) leaving town mid-scene resets it (no actor, no lanterns, no pup left behind) and his arrival comes again back in
//     town; standing about nearby, the ghost pup comes to fetch you; an old save (Poe joined, him not, Momiji Hollow shut)
//     gets Shadow's rumour in town, once
//  c) the "Meet <name>" guide (?tut): hold Tab → the wheel, his card, a pick by key; the flail, the hex, the blanket, done
//  d) playing him: every active skill tapped in a Burrow fight lands its hits with no errors (the summons and the ward
//     appear); he's the baked shihtzu_toy with the Blender flail; a real hold on Woeful Wallop charges past Stage Ⅰ and
//     releases the Grand Wallop
//  e) perf: a burst of his fully charged releases frames like the tapped burst; GPU geometries plateau
// SHOTS=1 saves the scene beats and the guide steps to tools/qa/tmp/s28/.
import { launch, boot, waitMode, sleep, makeReport, drainDialogue, tap } from './lib.mjs';
import fs from 'node:fs';
import { CLASSES } from '../../src/rpg/classes.js';

const R = makeReport('S28 the Shih Tzu: his arrival on the Shrine Road, the rumour, the Meet guide, every skill, a real charge, perf');
const { browser, page, errors, warns } = await launch({ w: 1280, h: 720 });
const ev = (f, a) => page.evaluate(f, a);
const SHOTS = !!process.env.SHOTS, OUT = 'tools/qa/tmp/s28', PART = process.env.PART || 'abcde'; // (PART=a: only the scene)
if (SHOTS) fs.mkdirSync(OUT, { recursive: true });
const shot = async name => { if (SHOTS) await page.screenshot({ path: `${OUT}/${name}.png` }); };
const quiet = () => ev(() => { const G = window.G; G.sim.tickT = -1e9; clearInterval(window.__freeze); window.__freeze = setInterval(() => { G.sim.tickT = -1e9; }, 200); G.state.flags.hints = { ...(G.state.flags.hints || {}), garden: 1, build: 1, travel: 1, skills: 1, stats: 1, loot: 1, potion: 1, fight: 1 }; });
const poeIn = () => ev(() => { const G = window.G; G.state.flags.mokaJoined = true; G.state.flags.poeJoined = true; for (const id of ['moka', 'poe']) { const v = G.heroes.villagers[id]; if (v) { v.frozen = false; v.waitingToJoin = false; } } });
/** Momiji Hollow open (level 11), Poe's arrival behind us (her quest done): Floofy's arrival is due (actors/arrivals.js) */
const opened = () => ev(() => { const G = window.G, F = G.state.flags; (F.arrivals ||= {}).bamboo = { how: 'scene', quest: 'start', day: 1 }; G.state.quests.done.push('hq_takemori'); G.state.quests.active = G.state.quests.active.filter(q => q.id !== 'welcome'); G.state.quests.cards = []; G.state.player.lvl = 11; G.actions.recompute(); if (G.day) G.day.paused = true; });
/** you come up the Shrine Road: r m from him, where it's walkable, him on screen from there */
const upTheRoad = r => ev(r => {
  const G = window.G, S = G.heroes.stzJoin, k = S.knight, P = G.player, W = G.world, cam = G.engine.camera, rig = G.engine.rig, v = new G.THREE.Vector3();
  if (!k) return false;
  for (const rr of [r, r + 1, r - 1, r + 2]) for (let i = 0; i < 24; i++) {
    const a = i / 24 * Math.PI * 2, x = k.pos.x + Math.sin(a) * rr, z = k.pos.z + Math.cos(a) * rr; if (W.walkable(x, z) === false || W.collision?.solidAt?.(x, z, 0.35)) continue;
    P.setPos(x, z); rig.focus?.copy?.(P.pos); rig.snap?.(); cam.updateMatrixWorld(); v.set(k.pos.x, k.pos.y + 0.6, k.pos.z).project(cam);
    if (Math.abs(v.x) < 0.75 && v.y > -0.5 && v.y < 0.7 && !(S.view?.occ && S.view.screened(k.pos.x, k.pos.z, [0.4, 0.8], 0.2, cam.position))) { P.faceTo(k.pos.x, k.pos.z); return true; }
  }
  return false;
}, r);
const J = () => ev(() => {
  const G = window.G, S = G.heroes.stzJoin, P = G.player, k = S.knight, cam = G.engine.camera;
  const on = k ? (() => { const v = k.pos.clone(); v.y += 0.6; v.project(cam); return Math.abs(v.x) < 0.9 && v.y > -0.7 && v.y < 0.9 && v.z < 1; })() : false;
  return { state: S.state, vis: !!k?.visible, act: k?.anim.action?.name || null, d: k ? Math.round(Math.hypot(k.pos.x - P.pos.x, k.pos.z - P.pos.z) * 10) / 10 : -1, onScreen: on, paved: S.spot && G.world.terrain?.tile ? [1, 2].includes(G.world.terrain.tile(S.spot.x, S.spot.z)) : null,
    lanterns: S.lanterns.length, lit: S.lanterns.filter(L => L.want > 0).length, pup: !!S.pup, pupSlots: G.vfx.stz?._pups?.slots.length || 0, knight: !!k, joined: !!G.state.flags.shihtzuJoined };
});
/** answer the scene's dialogues (between them the lick plays) until it's done */
const drainScene = async picks => {
  const chosen = [];
  for (let i = 0; i < 12; i++) {
    const done = await ev(() => window.__scene.includes('done'));
    if (done) break;
    await page.waitForFunction(() => window.G.ui.dlg?.active || window.__scene.includes('done'), null, { timeout: 8000 }).catch(() => {});
    chosen.push(...await drainDialogue(page, picks));
  }
  return chosen;
};
try {
  const name = CLASSES.shihtzu.name; // (the owner's to pick: the scene and the guide read it)
  if (PART.includes('a')) { // ================================================================ a) his arrival on the Shrine Road
  await boot(page, 'fresh&nointro&notut&arrive&qcard&hour=18.2'); await quiet(); await poeIn();
  await ev(() => { window.__scene = []; window.G.events.on('shihtzu:joinScene', p => window.__scene.push(p.phase)); });
  await opened();
  await page.waitForFunction(() => window.G.heroes.stzJoin.state !== 'off', null, { timeout: 20000 }).catch(() => {});
  const a0 = await J();
  await page.waitForFunction(() => window.G.heroes.stzJoin.state === 'kneel', null, { timeout: 30000 }).catch(() => {});
  await page.waitForFunction(() => window.G.heroes.stzJoin.lanterns.filter(L => L.want > 0).length >= 2, null, { timeout: 8000 }).catch(() => {});
  await upTheRoad(7); await sleep(page, 900);
  const a1 = await J();
  await shot('1-kneel');
  R.check('in Blossom Hollow (Momiji Hollow open, Poe joined) he arrives at golden hour on the Shrine Road: kneeling on the paving by three paper lanterns, lighting them one by one, a ghost pup at his shoulder; on screen as you come up the road', ['wait', 'kneel'].includes(a0.state) && a1.state === 'kneel' && a1.vis && a1.act === 'stzKneel' && a1.onScreen && a1.paved && a1.lanterns === 3 && a1.lit >= 2 && a1.pup, JSON.stringify({ a0, a1 }));
  await ev(() => { const S = window.G.heroes.stzJoin, P = window.G.player, k = S.knight; P.setPos(k.pos.x + Math.sin(k.facing) * 3.2, k.pos.z + Math.cos(k.facing) * 3.2); });
  await page.waitForFunction(() => window.G.ui.dlg?.active, null, { timeout: 12000 }).catch(() => {});
  const a2 = await ev(() => ({ speaker: window.G.ui.dlg?.opts?.speaker, text: (window.G.ui.dlg?.lines || []).map(l => l.text || l).join(' '), locked: window.G.player.controlLocked, act: window.G.heroes.stzJoin.knight?.anim.action?.name, scene: window.__scene.slice() }));
  await shot('2-proclaim');
  R.check(`walk up: he rises and proclaims (${name} speaking, "Halt, traveller…", controls locked, the camera on you both)`, a2.speaker === name && /Halt, traveller/.test(a2.text) && a2.locked && a2.act === 'stzProclaim' && a2.scene.includes('proclaim'), JSON.stringify(a2));
  await drainDialogue(page, []);
  await page.waitForFunction(() => window.G.heroes.stzJoin.knight?.anim.action?.name === 'stzLicked', null, { timeout: 6000 }).catch(() => {});
  await sleep(page, 250);
  const a3 = await ev(() => ({ act: window.G.heroes.stzJoin.knight?.anim.action?.name, state: window.G.heroes.stzJoin.state }));
  await shot('3-lick');
  R.check('…and the ghost pup licks his face mid-word (slurp)', a3.act === 'stzLicked', JSON.stringify(a3));
  await page.waitForFunction(() => window.G.ui.dlg?.active, null, { timeout: 6000 }).catch(() => {});
  await sleep(page, 500); await shot('4-talk');
  const snuffShot = page.waitForFunction(() => window.__scene.includes('snuff'), null, { timeout: 30000, polling: 'raf' }).then(() => sleep(page, 800)).then(() => shot('5-snuff')).catch(() => {}); // (the lanterns flying into the tome)
  const picked = await drainScene([0, 1]);
  await snuffShot;
  await page.waitForFunction(() => window.__scene.includes('done'), null, { timeout: 12000 }).catch(() => {});
  await sleep(page, 300); await shot('6-joined');
  await sleep(page, 1300);
  const a4 = await ev(() => { const G = window.G, S = G.heroes.stzJoin; return { joined: !!G.state.flags.shihtzuJoined, lvl: G.state.heroes.shihtzu.player.lvl, locked: G.player.controlLocked, knight: !!S.knight, lanterns: S.lanterns.length, pupSlots: G.vfx.stz?._pups?.slots.length || 0, state: S.state, scene: window.__scene.slice(), quest: G.state.quests.active.some(q => q.id === 'hq_akane') }; });
  R.check('he joins (near the pack\'s level), snuffs the lanterns into his tome and fades away in ghostlight; controls back, nothing left behind; his quest starts', a4.joined && a4.lvl >= 5 && !a4.locked && !a4.knight && !a4.lanterns && !a4.pupSlots && ['done', 'off'].includes(a4.state) && a4.scene.includes('snuff') && a4.quest && picked.length >= 2, JSON.stringify({ a4, picked }));
  await page.keyboard.press('Escape'); await sleep(page, 400); // (his quest's card)
  const a5 = await ev(() => { const G = window.G, v = G.heroes.villagers.shihtzu, h = G.heroes.homeSpot('shihtzu'); return { v: !!v, near: v ? Math.round(Math.hypot(v.pos.x - h.x, v.pos.z - h.z)) : -1, bench: G.heroes.bench(), flail: v?.rig?.parts?.flail?.kind || (v?.rig?.parts?.flail ? 'yes' : null) }; });
  R.check('he lives at the cottage at once (a villager, his flail on his back), three heroes on the bench', a5.v && a5.near < 12 && a5.bench.length === 3 && !!a5.flail, JSON.stringify(a5));

  }
  if (PART.includes('b')) { // ================================================================ b) a reset mid-scene; the pup fetches you; an old save's rumour
  await boot(page, 'fresh&nointro&notut&arrive&qcard&hour=18.2'); await quiet(); await poeIn();
  await ev(() => { window.__scene = []; window.G.events.on('shihtzu:joinScene', p => window.__scene.push(p.phase)); });
  await opened();
  await page.waitForFunction(() => window.G.heroes.stzJoin.state === 'kneel', null, { timeout: 40000 }).catch(() => {});
  await ev(() => { const G = window.G; G.state.flags.burrowTut = true; G.enterRegion('maple'); }); await waitMode(page, 'dungeon'); await sleep(page, 600);
  const b0 = await J();
  await ev(() => window.G.returnToVillage()); await waitMode(page, 'village');
  await page.waitForFunction(() => ['wait', 'kneel'].includes(window.G.heroes.stzJoin.state), null, { timeout: 40000 }).catch(() => {});
  const b1 = await J();
  R.check('leaving town mid-scene resets it (no knight, no lanterns, no pup left behind); back in town his arrival comes again', b0.state === 'off' && !b0.knight && !b0.lanterns && !b0.pupSlots && !b0.joined && ['wait', 'kneel'].includes(b1.state), JSON.stringify({ b0, b1 }));
  await page.waitForFunction(() => window.G.heroes.stzJoin.state === 'kneel', null, { timeout: 30000 }).catch(() => {});
  await upTheRoad(10);
  const bk = await J();
  await page.waitForFunction(() => window.__scene.includes('proclaim'), null, { timeout: 30000 }).catch(() => {}); // (stand about: the pup comes to fetch you)
  await page.waitForFunction(() => window.G.ui.dlg?.active, null, { timeout: 10000 }).catch(() => {});
  const b2 = await ev(() => ({ scene: window.__scene.slice(), dlg: !!window.G.ui.dlg?.active }));
  R.check('standing about near his lanterns, the ghost pup comes to fetch you and he takes his mark: the scene goes on', bk.state === 'kneel' && bk.d > 4.5 && bk.d < 14 && b2.scene.includes('proclaim') && b2.dlg, JSON.stringify({ bk, b2 }));
  await drainScene([1, 0]);
  await page.keyboard.press('Escape'); await sleep(page, 300);
  await ev(() => { // an old save from before the Shih Tzu: Poe joined, no heroes.shihtzu at all, Momiji Hollow not open yet
    const G = window.G; G.save(); const s = JSON.parse(localStorage.getItem('chewy3d.save'));
    delete s.heroes.shihtzu; delete s.flags.shihtzuJoined; if (s.flags.hints) delete s.flags.hints.stzRumour; s.flags.mokaJoined = true; s.flags.poeJoined = true;
    for (const h of Object.values(s.heroes)) if (h?.player) h.player.lvl = 5; if (s.player) s.player.lvl = 5; s.quests.active = s.quests.active.filter(q => q.id !== 'hq_akane'); s.quests.cards = [];
    window.__ignoreSave = true; localStorage.setItem('chewy3d.save', JSON.stringify(s)); removeEventListener('beforeunload', G.save); G.save = () => {};
  });
  await boot(page, 'notitle&notut'); await quiet();
  const bOld = await ev(() => { const G = window.G, st = G.state; return { lvl: st.heroes.shihtzu?.player?.lvl, joined: !!st.flags.shihtzuJoined, v: !!G.heroes.villagers.shihtzu, bench: G.heroes.bench().join() }; });
  R.check('an old save (Poe joined, no Shih Tzu in it) loads with him new and not joined: no villager, Moka and Poe on the bench', bOld.lvl === 1 && !bOld.joined && !bOld.v && bOld.bench === 'moka,poe', JSON.stringify(bOld));
  await ev(() => { delete window.G.state.flags.hints.stzRumour; window.G.heroes.stzJoin.hintT = 0; });
  await page.waitForFunction(() => window.G.state.flags.hints?.stzRumour, null, { timeout: 30000 }).catch(() => {});
  await sleep(page, 300); await shot('7-rumour');
  const b3 = await ev(() => ({ rumour: !!window.G.state.flags.hints?.stzRumour, wheel: window.G.heroes.roster().find(h => h.id === 'shihtzu').why }));
  R.check('in town (Poe joined, him not, Momiji Hollow shut): Shadow passes on the rumour about the lanterns, once; the wheel says when he\'ll come', b3.rumour && b3.wheel === 'Will arrive when Momiji Hollow opens', JSON.stringify(b3));

  }
  if (PART.includes('c')) { // ================================================================ c) the Meet guide
  await boot(page, 'fresh&nointro&tut&hour=11'); await quiet(); await poeIn();
  await ev(() => { const G = window.G, T = (G.state.flags.tutorials ||= {}); for (const id of ['house', 'switch', 'fishing', 'makeHome', 'remodel', 'charge', 'meetPoe']) T[id] = { done: true }; G.heroes.spawnBench(); G.heroes.joinShihtzu(); });
  await page.waitForFunction(() => window.G.tutorials.cur?.id === 'meetShihtzu', null, { timeout: 25000 }).catch(() => {});
  await sleep(page, 900); await shot('g1-hold');
  const c0 = await ev(() => ({ id: window.G.tutorials.cur?.id, step: window.G.tutorials.cur?.step?.id, title: window.G.tutorials.cur?.guide?.title, said: window.G.tutorials.cur?.said?.text || '' }));
  await ev(() => { window.G.heroes.cd = 0; });
  await page.keyboard.down('Tab'); await page.waitForFunction(() => window.G.heroes.wheelOpen, null, { timeout: 4000 }).catch(() => {});
  await sleep(page, 400); await shot('g2-wheel');
  const wheel = await ev(() => !!document.querySelector('.hero-wheel .hw-card[data-id="shihtzu"]'));
  await page.keyboard.press('4'); await page.keyboard.up('Tab');
  await page.waitForFunction(() => window.G.tutorials.cur?.step?.id === 'flail', null, { timeout: 15000 }).catch(() => {});
  await page.waitForFunction(() => !window.G.heroSwitching, null, { timeout: 12000 }).catch(() => {});
  await sleep(page, 700); await shot('g3-flail');
  const c1 = await ev(() => ({ step: window.G.tutorials.cur?.step?.id, hero: window.G.state.activeHero }));
  const steps = [];
  for (let i = 0; i < 6; i++) {
    const st = await ev(() => window.G.tutorials.cur?.step?.id || null); if (!st) break;
    steps.push(st); if (i) await shot(`g${3 + i}-${st}`);
    await sleep(page, 700); await ev(() => document.querySelector('.tut .to-ack, .tut [data-act="ack"], .tut .ack')?.click()); await ev(() => window.G.tutorials.ack?.());
    await page.waitForFunction(s => window.G.tutorials.cur?.step?.id !== s, st, { timeout: 4000 }).catch(() => {});
  }
  await sleep(page, 600);
  const c2 = await ev(() => ({ cur: window.G.tutorials.cur?.id || null, rec: window.G.state.flags.tutorials?.meetShihtzu }));
  R.check(`the "Meet ${name}" guide (his name from classes.js): hold Tab → the wheel, his card, a pick by key; the flail, the hex, the blanket, the trees; done`, c0.id === 'meetShihtzu' && c0.title === `Meet ${name}` && c0.step === 'hold' && wheel && c1.step === 'flail' && c1.hero === 'shihtzu' && steps.join() === 'flail,hex,blanket,wrap' && !c2.cur && c2.rec?.done, JSON.stringify({ c0, wheel, c1, steps, c2 }));

  }
  if (PART.includes('d')) { // ================================================================ d) every skill tapped; a real charge
  await boot(page, 'fresh&nointro&notut&hero=shihtzu'); await ev(() => { window.G.state.flags.burrowTut = true; window.G.enterDungeon(3); }); await waitMode(page, 'dungeon'); await sleep(page, 1200);
  const ids = await ev(async () => {
    const G = window.G, P = G.state.player, { SKILLS } = await import('/src/rpg/skills.js');
    P.lvl = 30; P.stats = { str: 90, dex: 20, vit: 300, ene: 160 };
    for (const id of Object.keys(SKILLS)) if (SKILLS[id].cls === 'shihtzu') P.skills[id] = 10;
    G.actions.recompute(); G.actions.restoreAll();
    const raw = G.combat.hitMonster.bind(G.combat); window.__hits = 0; G.combat.hitMonster = (m, o) => { window.__hits++; return raw(m, o); };
    return Object.keys(SKILLS).filter(id => SKILLS[id].cls === 'shihtzu' && !['passive', 'aura'].includes(SKILLS[id].kind));
  });
  const res = [];
  for (const id of ids) {
    const r = await ev(id => {
      const G = window.G, P = G.player;
      G.skills.clearShihtzu(); G.skills.cds = {}; P.anim.stop(); G.actions.restoreAll();
      if (G.dungeon.monsters.filter(m => m.alive && !m.def.boss).length < 6) G.dungeon.summonAround({ pos: P.pos }, 'mochi', 6);
      const { r: rr } = G.engine.rig.groundAxes();
      G.dungeon.monsters.filter(m => m.alive && !m.def.boss).slice(0, 6).forEach((m, i) => { m.pos.set(P.pos.x + rr.x * (2.2 + i * 0.5) + (i % 2) * 0.6, 0, P.pos.z + rr.z * (2.2 + i * 0.5) - (i % 2) * 0.6); m.lifeMax = m.life = 1e7; m.status.stun = 99; m.speed = 0; });
      window.__hits = 0;
      const aim = P.pos.clone().addScaledVector(rr, 3), tgt = G.combat.nearest(aim, 'ally', 3);
      try { return { ok: G.skills.tryCast(id, aim, tgt) }; } catch (e) { return { threw: String(e.stack || e).slice(0, 300) }; }
    }, id);
    if (id === 'maelstrom') await ev(() => { if (window.G.skills.channel) window.G.skills.channel.toggleHeld = true; });
    await sleep(page, ['ghostPups', 'grandpawsGhost', 'grumbleCloud', 'steadfastSulk', 'maelstrom', 'everlastingGloom', 'borrowedWarmth', 'wayhomeLantern'].includes(id) ? 2600 : 1600);
    const extra = await ev(id => { const S = window.G.skills; const a = (S.stzAllies || []).filter(x => x.alive); return { pups: a.filter(x => x.slot).length, gp: a.some(x => x.gp), ward: !!S.stzWard, lantern: !!S.stzLantern, cloud: (S.stzClouds || []).length, tethers: (S.stzTethers || []).length, mopes: S.stzMopes?.size || 0, hexes: S.stzHexes?.size || 0 }; }, id);
    if (id === 'maelstrom') await ev(() => { if (window.G.skills.channel) window.G.skills.endChannel(); });
    res.push({ id, ...r, hits: await ev(() => window.__hits), ...extra });
  }
  const noHit = res.filter(r => !['caseOfMopes', 'boneWard', 'ghostPups', 'grandpawsGhost', 'wayhomeLantern'].includes(r.id) && !(r.hits > 0)).map(r => r.id), threw = res.filter(r => r.threw);
  const by = id => res.find(r => r.id === id) || {};
  const shows = by('ghostPups').pups >= 2 && by('grandpawsGhost').gp && by('boneWard').ward && by('wayhomeLantern').lantern && by('grumbleCloud').cloud >= 1 && by('borrowedWarmth').tethers >= 1 && by('caseOfMopes').mopes >= 1 && by('drippingPaw').hexes >= 1;
  R.check(`playing him: every active skill (${ids.length}) casts in a Burrow fight, the damage skills land hits, the summons, ward, lantern, cloud, threads, mopes and hexes appear, no errors`, ids.length === 15 && !threw.length && res.every(r => r.ok) && !noHit.length && shows, JSON.stringify({ noHit, threw: threw.map(t => t.id + ': ' + t.threw), casts: res.map(r => `${r.id}:${r.ok ? 'ok' : 'no'}/${r.hits}`).join(' ') }));
  const look = await ev(async () => {
    const G = window.G, P = G.player, r = P.rig;
    for (let i = 0; i < 30 && P.flail?.kind !== 'glb'; i++) await new Promise(q => setTimeout(q, 100));
    return { model: r.model, squint: r.squint, lidTilt: r.lidTilt, flail: P.flail?.kind, links: P.flail?.links.every(l => l.children.length === 1), chain: [...(P.flail?.chain.x || [])].every(Number.isFinite), wt: G.derived.weaponType };
  });
  R.check('he is the baked Toybox Shih Tzu (shihtzu_toy: its squint and lidTilt) with the Blender flail, its chain finite', look.model === 'shihtzu_toy' && look.squint?.[0] === 0.74 && look.flail === 'glb' && look.links && look.chain && look.wt === 'flail', JSON.stringify(look));
  // a real hold on right-click (Woeful Wallop)
  const xy = await ev(() => {
    const G = window.G, P = G.player, st = G.state.player; G.skills.clearShihtzu(); G.skills.cds = {}; P.anim.stop(); G.actions.restoreAll();
    st.hotbar[1] = 'woefulWallop'; st.chargePerks = { woefulWallop: { stages: 2 } };
    window.__rel = []; G.events.on('charge:release', p => window.__rel.push(p));
    const { r } = G.engine.rig.groundAxes(), p = P.pos.clone().addScaledVector(r, 2.5), v = p.project(G.engine.camera);
    return [(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight];
  });
  await page.mouse.move(xy[0], xy[1]); await sleep(page, 150);
  await page.mouse.down({ button: 'right' });
  await page.waitForFunction(() => (window.G.skills.charge.active?.stage || 0) >= 2, null, { timeout: 6000 }).catch(() => {});
  const d0 = await ev(() => ({ stage: window.G.skills.charge.active?.stage || 0, pose: window.G.player.anim.action?.style || window.G.player.anim.action?.name }));
  await page.mouse.up({ button: 'right' });
  await page.waitForFunction(() => window.G.player.anim.action?.name === 'wallop', null, { timeout: 3000 }).catch(() => {});
  const d1 = await ev(() => ({ rel: window.__rel.slice(-1)[0] || null, act: window.G.player.anim.action?.name }));
  R.check('a real hold on Woeful Wallop: the flail wound round behind him (stzWallop pose) to Stage Ⅱ, and the release swings the Grand Wallop', d0.stage >= 2 && d0.pose === 'stzWallop' && d1.rel?.stage >= 2 && d1.rel.ok && d1.act === 'wallop', JSON.stringify({ d0, d1 }));

  }
  if (PART.includes('e')) { // ================================================================ e) perf
  const burst = staged => ev(async staged => {
    const G = window.G, P = G.player, pl = G.state.player, { CHARGE } = await import('/src/rpg/charge.js');
    pl.stats.ene = 900; pl.chargePerks = {}; for (const id of ['woefulWallop', 'heaviestSigh', 'everlastingGloom', 'mournfulAwoo', 'drippingPaw', 'grumbleCloud']) pl.chargePerks[id] = Object.fromEntries(Object.entries(CHARGE[id].perks).map(([k, p]) => [k, p.ranks]));
    G.actions.recompute(); G.actions.restoreAll(); G.skills.clearShihtzu();
    const ms = G.dungeon.monsters.filter(m => m.alive && !m.def.boss);
    if (ms.length < 14) G.dungeon.summonAround({ pos: P.pos }, 'mochi', 14 - ms.length);
    const all = G.dungeon.monsters.filter(m => m.alive && !m.def.boss).slice(0, 16);
    all.forEach((m, i) => { const a = i / all.length * Math.PI * 2, r = 2.5 + (i % 3); m.pos.set(P.pos.x + Math.cos(a) * r, 0, P.pos.z + Math.sin(a) * r); m.lifeMax = m.life = 1e7; m.status.stun = 99; });
    const dts = []; let last = performance.now(), on = true;
    (function f() { const n = performance.now(); dts.push(n - last); last = n; if (on) requestAnimationFrame(f); })();
    const c = staged ? { stage: 3, t: 2 } : undefined, at = all[0].pos.clone();
    const go = id => { G.skills.cds = {}; P.anim.stop(); G.actions.restoreAll(); G.skills.tryCast(id, at, all[0], c); };
    for (const id of ['drippingPaw', 'woefulWallop', 'grumbleCloud', 'everlastingGloom', 'mournfulAwoo', 'heaviestSigh']) { go(id); await new Promise(r => setTimeout(r, 450)); }
    await new Promise(r => setTimeout(r, 2400)); on = false;
    const s = dts.slice(2).sort((a, b) => a - b);
    return { n: s.length, p50: Math.round(s[s.length >> 1]), p95: Math.round(s[Math.floor(s.length * 0.95)]), max: Math.round(s[s.length - 1]), geo: G.engine.renderer.info.memory.geometries };
  }, staged);
  await burst(true); await sleep(page, 1500); // (warm-up)
  const tapB = await burst(false); await sleep(page, 1500);
  const chgB = await burst(true); await sleep(page, 1500);
  const chgB2 = await burst(true);
  console.log('perf burst (frame ms): tapped', JSON.stringify(tapB), '· charged Ⅲ', JSON.stringify(chgB), JSON.stringify(chgB2));
  R.check(`perf: a burst of his fully charged Ⅲ releases frames like the tapped burst (p95 ${chgB.p95} vs ${tapB.p95} ms, max ${chgB.max} ms); geometries plateau (${chgB.geo} → ${chgB2.geo})`, chgB.p95 <= Math.max(40, tapB.p95 * 1.6) && chgB.max < 250 && chgB2.geo <= chgB.geo + 40, JSON.stringify({ tapB, chgB, chgB2 }));
  }
} catch (e) { errors.push('[harness] ' + e.stack); }
const failed = R.finish(errors, warns);
await browser.close();
process.exit(failed ? 1 : 0);
