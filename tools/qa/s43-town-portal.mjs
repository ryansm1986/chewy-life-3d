// Scenario 43: the Town Portal (docs/ZONES.md §4.2; ROADMAP Z-H2, the owner's request 2026-10-11: "a way to tp back
// to town and back to the same spot in the dungeon"). Waits key on game state.
//  a) a den floor's round trip by T: the cast (a moon gate grows in front of the hero, ~1 s), Blossom Hollow with the
//     return portal by the plaza (its label, the hero beside it, G.townPortal.village); stepping in rebuilds the same floor
//     (the same layout, the beaten monsters gone, the rest where they stood and as hurt, the opened chest open, the broken
//     pot broken, the spent shrine spent, the loot on the ground where it lay, the hero where they stood); nothing is
//     killed, dropped or paid again; the portal is used up
//  b) a fizzle: moving during the cast cancels it with a toast; nothing is saved
//  c) a boss fight: T refuses with a toast while the boss is engaged; once it falls the portal works, and the floor comes
//     back with its boss fallen (the way home where it fell, no second clear, banner or reward)
//  d) a zone dungeon's floor: its objectives come back as they were built (a freed cage stays open and empty, the other
//     cage in its own slot even when the story has moved on), the packs beaten stay beaten
//  e) closing and replacing: setting off into a dungeon another way (a den from the door, a tier run) or a crew into that
//     dungeon closes it with a toast; a new portal replaces an old one (one return portal by the plaza)
//  f) save and reload: the return portal is back by the plaza with its label, and stepping in resumes the floor
//  g) the floor's own way home ends the run (no portal waits); T in an outdoor zone still goes home at once
//  h) the pad: the Game page's Home reads "Town Portal" on a floor (dimmed with the reason in a boss fight), "Home" in a
//     zone; A on it casts
//  i) touch (a phone): the portal button left of the bag on a floor (44 px, on screen, clear of the bag and the minimap),
//     hidden in the village; a tap casts; Shadow's one-time tip names the button
import { launch, boot, waitMode, sleep, makeReport, BASE } from './lib.mjs';
import { launchTouch, PHONE, center } from './touch-lib.mjs';
import { installPad, padTap } from './pad-lib.mjs';

const R = makeReport('S43 the Town Portal');
const { browser, page, errors, warns } = await launch({ w: 1600, h: 900 });
const ev = (f, a) => page.evaluate(f, a);
const until = (f, a, timeout = 20000) => page.waitForFunction(f, a, { timeout });
const waitFloor = (id, floor) => until(([id, floor]) => window.G.mode === 'dungeon' && window.G.dungeon?.def?.id === id && window.G.dungeon.floor === floor && !window.G.ui?.iris?.active, [id, floor], 60000);
const armour = () => ev(() => { const G = window.G; clearInterval(window.__inv); window.__inv = setInterval(() => { if (G.player) { G.player.invuln = true; G.actions.restoreAll?.(); } }, 250); });
const enter = async (arg) => { await ev(a => window.G.enterDungeon(a), arg); await waitFloor(arg.id, arg.floor || 1); await armour(); };
// the floor in numbers (what a round trip must keep)
const floorState = () => ev(() => {
  const G = window.G, D = G.dungeon, L = D.layout, P = G.player;
  let h = 0; for (let i = 0; i < L.grid.length; i++) h = (h * 31 + (L.grid[i] ? 1 : 0) + (i % 7)) >>> 0;
  return {
    id: D.def.id, floor: D.floor, grid: h, rooms: L.rooms.length, start: [L.start.x, L.start.y],
    alive: D.monsters.filter(m => m.alive && m._sid != null).map(m => [m._sid, m.id, +m.pos.x.toFixed(2), +m.pos.z.toFixed(2), +(m.life / m.lifeMax).toFixed(3)]).sort((a, b) => a[0] - b[0]),
    chests: (D.chests || []).map(c => !!c.opened), pots: (D.pots || []).map(p => !!p.alive), shrines: (D.shrines || []).map(s => !!s.used),
    loot: D.loot.list.map(e => [e.d.type, +e.to.x.toFixed(1), +e.to.z.toFixed(1)]).sort((a, b) => a[1] - b[1] || a[2] - b[2]),
    hero: [+P.pos.x.toFixed(2), +P.pos.z.toFixed(2)], boss: D.boss ? D.boss.alive : null, cleared: !!D.floorCleared,
    labels: D.world.interactables.map(i => i.label).filter(l => typeof l === 'string' && l),
  };
});
// T: the cast, then Blossom Hollow
async function portalHome(key = true) {
  if (key) await page.keyboard.press('t');
  await until(() => window.G.townPortal.casting, null, 4000);
  const cast = await ev(() => { const G = window.G, sc = G.dungeon.world.scene, g = sc.children.find(o => o.name === 'townPortal'); return { model: !!g, d: g ? +Math.hypot(g.position.x - G.player.pos.x, g.position.z - G.player.pos.z).toFixed(2) : null, t0: performance.now() }; });
  await waitMode(page, 'village', 40000);
  const t1 = await ev(() => performance.now()), snap = await ev(() => JSON.parse(JSON.stringify(window.G.state.portal || null)));
  return { ...cast, ms: Math.round(t1 - cast.t0), snap };
}
const villagePortal = () => ev(() => {
  const G = window.G, V = G.townPortal.village, P = G.player, its = G.village.world.interactables.filter(i => i.townPortal);
  return { v: V ? { x: V.x, z: V.z, label: V.label } : null, n: its.length, label: its[0]?.label || null, open: !!G.state.portal, place: G.state.portal?.place || null,
    hero: [+P.pos.x.toFixed(1), +P.pos.z.toFixed(1)], d: V ? +Math.hypot(P.pos.x - V.x, P.pos.z - V.z).toFixed(2) : null, models: G.village.world.scene.children.filter(o => o.name === 'townPortal').length };
});
// step into the return portal (F beside it), back on the floor
async function stepIn(id, floor) {
  await ev(() => {
    const G = window.G, it = G.village.world.interactables.find(i => i.townPortal); G.player.setPos(it.pos.x, it.pos.z); G.player.moveTarget = null; G.interactCooldown = 0;
    window.__atResume = null;
    if (!window.__resumeHook) { window.__resumeHook = true; (window.QA?.Events || G.events).on('portal:resumed', () => { const D = G.dungeon; window.__atResume = D.monsters.filter(m => m.alive && m._sid != null).map(m => [m._sid, m.id, +m.pos.x.toFixed(2), +m.pos.z.toFixed(2), +(m.life / m.lifeMax).toFixed(3)]).sort((a, b) => a[0] - b[0]); }); }
  });
  for (let i = 0; i < 3 && (await ev(() => window.G.mode)) === 'village'; i++) { await page.keyboard.press('f'); await until(() => window.G.mode !== 'village' || window.G.ui.iris.active, null, 1500).catch(() => {}); }
  await waitFloor(id, floor); await armour();
  return ev(() => window.__atResume); // (the monsters as the rebuild put them, before any of them took a step)
}
const near = (a, b, tol) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= tol;
// the same finds on the ground: each saved one has a twin of its type within 0.2 m
const sameLoot = (S, L) => { if (S.length !== L.length) return false; const left = L.slice(); return S.every(([t, x, z]) => { const i = left.findIndex(e => e[0] === t && Math.hypot(e[1] - x, e[2] - z) < 0.2); if (i < 0) return false; left.splice(i, 1); return true; }); };
const sameAlive = (A, B, tol = 1.6) => A.length === B.length && A.every((m, i) => B[i] && B[i][0] === m[0] && B[i][1] === m[1] && Math.abs(B[i][4] - m[4]) < 0.02 && Math.hypot(B[i][2] - m[2], B[i][3] - m[3]) <= (tol < 0.1 ? 1.6 : tol))
  && (tol >= 0.1 || A.filter((m, i) => Math.hypot(B[i][2] - m[2], B[i][3] - m[3]) <= tol).length >= A.length - 2); // (exact: all but a couple saved pressed against a wall's edge, put on the open floor beside it)
// (for the report: the first few that differ, saved vs put back)
const aliveDiff = (A, B, tol = 0.05) => { const out = []; const by = new Map((B || []).map(m => [m[0], m])); for (const m of A) { const b = by.get(m[0]); if (!b || b[1] !== m[1] || Math.abs(b[4] - m[4]) >= 0.02 || Math.hypot(b[2] - m[2], b[3] - m[3]) > tol) out.push([m, b || null]); if (out.length >= 4) break; } return { n: [A.length, (B || []).length], out }; };

try {
  await boot(page, 'fresh&nointro&notut&hour=11');
  await ev(() => { const G = window.G; G.state.flags.burrowTut = true; G.state.flags.mokaJoined = true; G.state.player.lvl = 6; G.actions.recompute(); });

  // ================================================================ a) a den floor's round trip
  await enter({ id: 'mossyBurrow', floor: 1 });
  const setA = await ev(() => {
    const G = window.G, D = G.dungeon, P = G.player, out = {};
    const foes = D.monsters.filter(m => m.alive && !m.breakable && m !== D.boss);
    out.killed = Math.min(5, foes.length - 2);
    for (const m of foes.slice(0, out.killed)) G.combat.hitMonster(m, { dmgPct: 1e7 });
    const hurt = foes[out.killed]; hurt.life = Math.round(hurt.lifeMax * 0.5); out.hurt = hurt._sid;
    const ch = (D.chests || []).find(c => c.layoutIdx != null && !c.opened); if (ch) { G.player.setPos(ch.pos.x + 1, ch.pos.z); ch.it.onInteract(); out.chest = ch.layoutIdx; }
    const pot = (D.pots || []).find(p => p.alive); if (pot) { pot.takeDamage(1); out.pot = true; }
    const sh = (D.shrines || []).find(s => !s.used); if (sh?.it) { G.player.setPos(sh.it.pos.x + 1, sh.it.pos.z); sh.it.onInteract(); out.shrine = !!sh.used; }
    const s = D.startPos; P.setPos(s.x, s.z); P.moveTarget = null; P.facing = P.faceTarget = 0;
    // a find on the ground, out of the magnet's reach
    const spot = D.openSpotNear(s.clone().setX(s.x + 8), 2, 1); out.spot = [spot.x, spot.z];
    D.loot.drop(spot.clone().setY(0.5), [{ type: 'material', key: 'wood', n: 3 }, { type: 'potion', key: 'heart' }]);
    window.QA.counts['monster:killed'] = 0; window.QA.counts['boss:dead'] = 0;
    return out;
  });
  await until(() => window.G.dungeon.loot.list.length >= 2 && window.G.dungeon.loot.list.every(e => e.t >= e.fly) && window.G.dungeon.monsters.filter(m => !m.alive).length === 0, null, 8000).catch(() => {});
  await ev(() => { const G = window.G, s = G.dungeon.startPos; G.player.setPos(s.x, s.z); G.player.moveTarget = null; for (const m of G.dungeon.monsters) if (m.alive) { m.aggro = false; m.target = null; } });
  const a0 = await floorState();
  await ev(() => { window.QA.toasts.length = 0; window.__portalEv = []; for (const n of ['portal:cast', 'portal:opened', 'portal:resumed', 'portal:closed', 'portal:refused', 'portal:fizzled', 'portal:replaced']) window.QA.Events.on(n, p => window.__portalEv.push([n, p])); });
  const castA = await portalHome();
  const vA = await villagePortal();
  const snapKB = await ev(() => +(JSON.stringify(window.G.state.portal).length / 1024).toFixed(1));
  const snapA = await ev(() => JSON.parse(JSON.stringify(window.G.state.portal))); // (what the cast saved: the floor must come back to it)
  R.check(`a) T on a den floor: a moon gate grows ${castA.d} m in front of the hero and opens in ~1 s (${castA.ms} ms to Blossom Hollow); the return portal stands by the plaza, labelled "${vA.label}", the hero beside it (${vA.d} m); the snapshot is ${snapKB} KB`,
    castA.model && castA.d > 0.5 && castA.d < 2.2 && castA.ms > 700 && castA.ms < 6000 && vA.n === 1 && vA.models === 1 && vA.label === 'Step into the Town Portal (the Mossy Burrow, floor 1)' && vA.v && vA.d < 3.5 && vA.open && snapKB < 64, { castA, vA, snapKB });
  const a1put = await stepIn('mossyBurrow', 1);
  const a1 = await floorState();
  const aEv = await ev(() => ({ killed: window.QA.counts['monster:killed'] || 0, boss: window.QA.counts['boss:dead'] || 0, portal: !!window.G.state.portal, models: window.G.village.world.scene.children.filter(o => o.name === 'townPortal').length, its: window.G.village.world.interactables.filter(i => i.townPortal).length, ev: window.__portalEv.map(e => e[0]) }));
  await until(() => window.QA.toasts.some(t => /^Back in the Mossy Burrow, floor 1, just as you left it/.test(t)), null, 4000).catch(() => {});
  const aToast = await ev(() => window.QA.toasts.find(t => /^Back in/.test(t)) || null);
  const hurtBack = a1.alive.find(m => m[0] === setA.hurt), hurtSnap = snapA.alive.find(m => m[0] === setA.hurt);
  const lootOk = sameLoot(snapA.loot.map(e => [e.d.type, e.x, e.z]), a1.loot);
  R.check(`a) stepping in rebuilds the same floor: the same layout, ${a1.alive.length} monsters standing where they stood (the ${setA.killed} beaten stay gone, the hurt one at ${hurtBack?.[4]} as saved ${hurtSnap?.[4]}), the chest open, the pot broken${setA.shrine ? ', the shrine spent' : ''}, ${a1.loot.length} finds on the ground where they lay, the hero where they stood`,
    a1.grid === a0.grid && a1.rooms === a0.rooms && sameAlive(snapA.alive, a1put || [], 0.05) && snapA.dead.length === setA.killed && hurtBack && hurtSnap && Math.abs(hurtBack[4] - hurtSnap[4]) < 0.02 && hurtSnap[4] < 0.7 && JSON.stringify(a1.chests) === JSON.stringify(a0.chests) && a1.chests.some(Boolean) && JSON.stringify(a1.pots) === JSON.stringify(a0.pots) && JSON.stringify(a1.shrines) === JSON.stringify(a0.shrines) && lootOk && a1.loot.length >= 2 && near(a1.hero, [snapA.hero.x, snapA.hero.z], 0.15),
    { setA, alive: [snapA.alive.length, a1.alive.length], dead: snapA.dead.length, chests: [a0.chests, a1.chests], pots: [a0.pots.filter(x => !x).length, a1.pots.filter(x => !x).length], shrines: [a0.shrines, a1.shrines], loot: [snapA.loot.length, a1.loot.length], lootOk, hero: [snapA.hero, a1.hero], hurtBack, hurtSnap });
  R.check(`a) nothing is killed, dropped or paid twice (monster:killed ${aEv.killed}, boss:dead ${aEv.boss}); the portal is used up (no snapshot, no return portal); a toast: "${aToast}"`,
    aEv.killed === 0 && aEv.boss === 0 && !aEv.portal && aEv.models === 0 && aEv.its === 0 && !!aToast && aEv.ev.includes('portal:cast') && aEv.ev.includes('portal:opened') && aEv.ev.includes('portal:resumed'), aEv);

  // ================================================================ b) a fizzle
  await ev(() => { window.QA.toasts.length = 0; window.__portalEv.length = 0; });
  await page.keyboard.press('t');
  await until(() => window.G.townPortal.casting, null, 4000);
  await page.keyboard.down('w'); await until(() => !window.G.townPortal.casting, null, 4000).catch(() => {}); await page.keyboard.up('w');
  const b = await ev(() => ({ casting: window.G.townPortal.casting, mode: window.G.mode, portal: !!window.G.state.portal, toast: window.QA.toasts.find(t => /fizzled/.test(t)) || null, models: window.G.dungeon.world.scene.children.filter(o => o.name === 'townPortal').length, ev: window.__portalEv.map(e => e[0]) }));
  R.check(`b) moving during the cast cancels it: "${b.toast}"; still on the floor, nothing saved, the gate gone`, !b.casting && b.mode === 'dungeon' && !b.portal && !!b.toast && b.models === 0 && b.ev.includes('portal:fizzled'), b);

  // ================================================================ c) a boss fight
  await enter({ id: 'mossyBurrow', floor: 2 });
  await ev(() => { const G = window.G, b = G.dungeon.boss; window.QA.toasts.length = 0; window.__portalEv.length = 0; G.player.setPos(b.pos.x + 4, b.pos.z); b.alert?.(); b.aggro = true; });
  await page.keyboard.press('t');
  await until(() => window.QA.toasts.some(t => /^No portal mid-fight/.test(t)), null, 4000).catch(() => {});
  const c0 = await ev(() => ({ casting: window.G.townPortal.casting, toast: window.QA.toasts.find(t => /^No portal mid-fight/.test(t)) || null, mode: window.G.mode }));
  R.check(`c) T while the boss is engaged refuses: "${c0.toast}"`, !c0.casting && c0.toast === 'No portal mid-fight: King Mochi won\'t let you slip away!' && c0.mode === 'dungeon', c0);
  await ev(() => { const G = window.G, b = G.dungeon.boss; b.life = 1; G.combat.hitMonster(b, { dmgPct: 500 }); });
  await until(() => window.G.dungeon.world.interactables.some(i => i.label === 'Return to Blossom Hollow'), null, 10000);
  await until(() => !window.G.ui.banners?.busy, null, 15000).catch(() => {});
  const c1rec = await ev(() => { const G = window.G; window.QA.counts['boss:dead'] = 0; window.__clears = 0; window.QA.Events.on('dungeon:cleared', () => { window.__clears++; }); const V = G.dungeon.victoryAt; return { rec: JSON.stringify(G.state.dungeon.dens.mossyBurrow), exit: G.dungeon.world.interactables.filter(i => i.label === 'Return to Blossom Hollow').sort((a, b) => Math.hypot(a.pos.x - V.x, a.pos.z - V.z) - Math.hypot(b.pos.x - V.x, b.pos.z - V.z))[0].pos }; });
  await ev(() => { const G = window.G, s = G.dungeon.startPos; G.player.setPos(s.x, s.z); G.player.moveTarget = null; });
  const cBefore = await floorState();
  const cHome = await portalHome();
  const c1put = await stepIn('mossyBurrow', 2);
  await sleep(page, 2200); // (the victory's own stairs and portal rise 1.5 s after a kill: a resumed floor must not grow a second set)
  const c1 = await floorState();
  const c1x = await ev(() => { const G = window.G, its = G.dungeon.world.interactables.filter(i => i.label === 'Return to Blossom Hollow'); return { n: its.length, at: its.map(i => [+i.pos.x.toFixed(1), +i.pos.z.toFixed(1)]), boss: G.dungeon.boss, dead: window.QA.counts['boss:dead'] || 0, clears: window.__clears, rec: JSON.stringify(G.state.dungeon.dens.mossyBurrow) }; });
  const exitsBefore = cBefore.labels.slice().sort().join('|'), exitsAfter = c1.labels.slice().sort().join('|'), fellAt = [+c1rec.exit.x.toFixed(1), +c1rec.exit.z.toFixed(1)];
  R.check(`c) the floor comes back with King Mochi fallen: the way home where it fell (and at the arrival: ${c1x.n}), no boss, no second clear (boss:dead ${c1x.dead}, dungeon:cleared ${c1x.clears}), the den's record unchanged`,
    exitsAfter === exitsBefore && c1x.at.some(p => near(p, fellAt, 0.6)) && !c1x.boss && c1x.dead === 0 && c1x.clears === 0 && c1x.rec === c1rec.rec && c1.grid === cBefore.grid && sameAlive(cHome.snap.alive, c1put || [], 0.05) && cHome.snap.boss?.dead, { c1x, fellAt, exitsBefore, exitsAfter, alive: [cHome.snap.alive.length, c1.alive.length], snapBoss: cHome.snap.boss, diff: aliveDiff(cHome.snap.alive, c1put) });
  await ev(() => window.G.returnToVillage()); await waitMode(page, 'village', 40000);

  // ================================================================ d) a zone dungeon's floor (its objectives)
  await ev(() => {
    const G = window.G; window.__objN = 0; window.__storyMoved = false;
    G.story.dungeonObjectives = q => { window.__objN++; if (q.floor !== 1) return []; const A = { kind: 'cage', npc: 'tk_s43_a', label: 'Grandma Mochi' }, B = { kind: 'cage', npc: 'tk_s43_b', label: 'Little Ume' }; return window.__storyMoved ? [B] : [A, B]; };
  });
  await enter({ id: 'bambooDepths', floor: 1 });
  const d0 = await ev(async () => {
    const G = window.G, D = G.dungeon, zr = D.zr, A = zr.cages[0], B = zr.cages[1];
    const guards = zr.packs.find(p => p.index === A.guard); if (guards) for (const m of guards.members) if (m.alive) G.combat.hitMonster(m, { dmgPct: 1e7 });
    await new Promise(r => setTimeout(r, 900));
    G.player.setPos(A.pos.x + 1.4, A.pos.z + 1.4); A.it.onInteract();
    window.__storyMoved = true; // (the story moves on: a fresh build would list only the second cage)
    const s = D.startPos; G.player.setPos(s.x, s.z); G.player.moveTarget = null; for (const m of D.monsters) if (m.alive) { m.aggro = false; m.target = null; }
    return { n: zr.cages.length, A: [A.pos.x, A.pos.z, A.open], B: [B.pos.x, B.pos.z, B.open], guards: guards?.members.length || 0 };
  });
  await until(() => window.G.dungeon.monsters.every(m => m.alive), null, 6000).catch(() => {});
  const dBefore = await floorState();
  const dHome = await portalHome();
  const d1put = await stepIn('bambooDepths', 1);
  const d1 = await ev(() => { const zr = window.G.dungeon.zr, A = zr.cages[0], B = zr.cages[1]; return { n: zr.cages.length, A: A && [A.pos.x, A.pos.z, A.open, A.rig.root.visible], B: B && [B.pos.x, B.pos.z, B.open], aIt: A ? window.G.dungeon.world.interactables.includes(A.it) : null }; });
  const dAfter = await floorState();
  R.check(`d) a zone dungeon's floor comes back as it was built: both cages in their slots (the freed one open and empty, the other still locked) though the story moved on; ${dAfter.alive.length} standing, the guards beaten stay gone`,
    d0.n === 2 && d0.A[2] && d1.n === 2 && Math.hypot(d1.A[0] - d0.A[0], d1.A[1] - d0.A[1]) < 0.01 && d1.A[2] && !d1.A[3] && !d1.aIt && Math.hypot(d1.B[0] - d0.B[0], d1.B[1] - d0.B[1]) < 0.01 && !d1.B[2] && dAfter.grid === dBefore.grid && sameAlive(dHome.snap.alive, d1put || [], 0.05) && dHome.snap.dead.length >= d0.guards, { d0, d1, alive: [dHome.snap.alive.length, dAfter.alive.length], dead: dHome.snap.dead.length, zr: dHome.snap.zr && { cages: dHome.snap.zr.cages, obj: dHome.snap.zr.obj.length } });
  await ev(() => { delete window.G.story.dungeonObjectives; }).catch(() => {});

  // ================================================================ e) closing and replacing
  // (a portal from the zone floor, then: a den from the Burrow door closes it)
  await portalHome();
  await ev(() => { window.QA.toasts.length = 0; window.G.burrow.enter('mossyBurrow'); });
  await waitFloor('mossyBurrow', 1); await armour();
  const e0 = await ev(() => ({ portal: !!window.G.state.portal, toast: window.QA.toasts.find(t => /^The Town Portal to/.test(t)) || null, its: window.G.village.world.interactables.filter(i => i.townPortal).length }));
  R.check(`e) setting off into a den from the door closes the open portal: "${e0.toast}"`, !e0.portal && e0.its === 0 && e0.toast === 'The Town Portal to the Bamboo Depths, floor 1 closed: you set off into the Mossy Burrow', e0);
  // a tier run closes it
  await portalHome();
  await ev(() => { const G = window.G; window.QA.toasts.length = 0; G.tierDebug.unlock('bambooDepths', 2); G.tierDebug.run('bambooDepths', 1, []); });
  await until(() => window.G.mode === 'dungeon' && window.G.dungeon?.tier === 1 && !window.G.ui.iris.active, null, 60000); await armour();
  const e1 = await ev(() => ({ portal: !!window.G.state.portal, toast: window.QA.toasts.find(t => /^The Town Portal to/.test(t)) || null }));
  R.check(`e) a tier run closes it: "${e1.toast}"`, !e1.portal && e1.toast === 'The Town Portal to the Mossy Burrow, floor 1 closed: you set off on a tier run', e1);
  // a portal from the tier floor names its tier; a crew sent into that dungeon closes it
  await portalHome();
  const e2p = await villagePortal();
  const e2 = await ev(async () => {
    const G = window.G, { DEBUG_SECTIONS } = await import('/src/debug/registry.js'); window.QA.toasts.length = 0;
    const Z = G.state.zones?.bamboo; if (Z) { Z.village = 'saved'; Z.dungeon.cleared = 0; Z.dungeon.crew = 0; }
    DEBUG_SECTIONS.get('cozy').actions.find(a => a.label === 'Give a sure-thing crew').run(G);
    G.state.pantry = { ...(G.state.pantry || {}), onigiri: 6 }; G.state.potions.heart = 6;
    const T = G.state.cozy.exp.tired; for (const k in T) delete T[k];
    const list = G.cozy.exp.objectives('story').map(o => o.id), obj = list.find(i => i === 'dungeon:bamboo') || null;
    const r = obj ? G.cozy.exp.send(obj, ['hero:moka', 'hero:poe'], { meals: { onigiri: 2 }, potions: 3 }) : null;
    return { obj, list, sent: !!r?.ok, why: r?.why || null, portal: !!G.state.portal, toast: window.QA.toasts.find(t => /^The Town Portal to/.test(t)) || null };
  });
  R.check(`e) a portal from a tier floor names its tier ("${e2p.label}"); a crew sent into that dungeon closes it: "${e2.toast}"`,
    e2p.label === 'Step into the Town Portal (the Bamboo Depths, floor 1 (Tier 1))' && (e2.sent ? !e2.portal && e2.toast === 'The Town Portal to the Bamboo Depths, floor 1 (Tier 1) closed: a crew set off into it' : false), { e2p, e2 });
  await ev(() => { const G = window.G; G.cozy.exp.finishAll?.(); });
  // replacing: an old snapshot waiting, a new portal cast → one portal, the new place
  await enter({ id: 'mossyBurrow', floor: 1 });
  await ev(() => { const G = window.G; window.__portalEv.length = 0; G.state.portal = { v: 1, place: 'the Fox Shrine, floor 2', theme: 'shrine', run: { id: 'foxShrine', floor: 2, seed: 7, packSeed: 7 }, hero: { x: 0, z: 0 }, n: 0, alive: [], dead: [], chests: { opened: [], late: [] }, loot: [], pots: [], shrines: [] }; const s = G.dungeon.startPos; G.player.setPos(s.x, s.z); });
  await portalHome();
  const e3 = await villagePortal(), e3ev = await ev(() => window.__portalEv.map(e => e[0]));
  R.check(`e) a new portal replaces an old one: one return portal, now "${e3.label}"`, e3.n === 1 && e3.models === 1 && e3.label === 'Step into the Town Portal (the Mossy Burrow, floor 1)' && e3ev.includes('portal:replaced'), { e3, e3ev });

  // ================================================================ f) save and reload
  const fBefore = await ev(() => { const S = window.G.state.portal; return { alive: S.alive.length, hero: [S.hero.x, S.hero.z] }; });
  await ev(() => window.G.save());
  await page.goto(`${BASE}/?notitle&nointro&notut&hour=11&dseed=1`, { waitUntil: 'load' });
  await until(() => window.__ready === true && window.G?.player && window.G.townPortal, null, 60000);
  await ev(() => { const G = window.G; G.state.flags.burrowTut = true; });
  const f0 = await villagePortal();
  await stepIn('mossyBurrow', 1);
  const f1 = await floorState();
  R.check(`f) after a save and a reload the return portal waits by the plaza ("${f0.label}"), and stepping in resumes the floor (${f1.alive.length} standing, the hero where they stood)`,
    f0.n === 1 && f0.label === 'Step into the Town Portal (the Mossy Burrow, floor 1)' && f1.alive.length === fBefore.alive && near(f1.hero, fBefore.hero, 0.15), { f0, fBefore, hero: f1.hero, alive: f1.alive.length });

  // ================================================================ g) the floor's own way home; T in a zone
  await ev(() => window.G.returnToVillage()); await waitMode(page, 'village', 40000);
  const g0 = await villagePortal();
  await ev(() => window.G.enterRegion('bamboo'));
  await until(() => window.G.mode === 'dungeon' && window.G.dungeon?.isRegion && !window.G.ui.iris.active, null, 60000);
  await page.keyboard.press('t');
  const gHome = await until(() => window.G.mode === 'village' && !window.G.ui.iris.active, null, 40000).then(() => true).catch(() => false);
  R.check('g) the floor\'s own way home ends the run (no return portal waits); T in an outdoor zone still goes home at once', !g0.open && g0.n === 0 && gHome, { g0, gHome });
} catch (e) { errors.push('[harness] ' + e.stack); }
await browser.close();

// ================================================================ h) the pad: the Game page's Town Portal
{
  const P = await launch({ w: 1280, h: 800 }), pp = P.page;
  try {
    await boot(pp, 'fresh&nointro&notut&hour=11');
    await installPad(pp);
    await pp.evaluate(() => { const G = window.G; G.state.flags.burrowTut = true; G.state.player.lvl = 6; G.actions.recompute(); G.enterDungeon({ id: 'mossyBurrow', floor: 2 }); });
    await pp.waitForFunction(() => window.G.mode === 'dungeon' && window.G.dungeon?.floor === 2 && !window.G.ui.iris.active, null, { timeout: 60000 });
    await pp.evaluate(() => { const G = window.G; setInterval(() => { G.player.invuln = true; G.actions.restoreAll?.(); }, 250); });
    await padTap(pp, 'A'); await pp.waitForTimeout(300); // (the pad becomes the device)
    const btn = () => pp.evaluate(() => { const b = document.querySelector('.p-menu [data-a="home"]'); return b ? { text: b.textContent.trim(), dim: b.classList.contains('dim'), title: b.title, shown: b.offsetParent !== null } : null; });
    // a boss fight: dimmed, with the reason
    await pp.evaluate(() => { const G = window.G, b = G.dungeon.boss; G.player.setPos(b.pos.x + 4, b.pos.z); b.alert?.(); b.aggro = true; });
    await padTap(pp, 'Menu'); await pp.waitForFunction(() => window.G.ui.isOpen('menu'), null, { timeout: 4000 });
    await pp.waitForTimeout(200);
    const h0 = await btn();
    await padTap(pp, 'Menu'); await pp.waitForFunction(() => !window.G.ui.isOpen('menu'), null, { timeout: 4000 }).catch(() => {});
    await pp.evaluate(() => { const G = window.G, b = G.dungeon.boss; b.life = 1; G.combat.hitMonster(b, { dmgPct: 500 }); });
    await pp.waitForFunction(() => window.G.dungeon.world.interactables.some(i => i.label === 'Return to Blossom Hollow'), null, { timeout: 10000 });
    await pp.waitForFunction(() => !window.G.ui.banners?.busy, null, { timeout: 15000 }).catch(() => {});
    await pp.evaluate(() => { const G = window.G, s = G.dungeon.startPos; G.player.setPos(s.x, s.z); G.player.moveTarget = null; });
    await padTap(pp, 'Menu'); await pp.waitForFunction(() => window.G.ui.isOpen('menu'), null, { timeout: 4000 });
    await pp.waitForTimeout(200);
    const h1 = await btn();
    // A on it: focus the button, then A
    await pp.evaluate(() => { const b = document.querySelector('.p-menu [data-a="home"]'); window.G.ui.padNav?.focus?.(b); });
    const focused = await pp.evaluate(() => window.G.ui.padNav?.cur === document.querySelector('.p-menu [data-a="home"]'));
    if (focused) await padTap(pp, 'A'); else await pp.evaluate(() => document.querySelector('.p-menu [data-a="home"]').click());
    const hCast = await pp.waitForFunction(() => window.G.townPortal.casting || window.G.mode === 'village', null, { timeout: 4000 }).then(() => true).catch(() => false);
    await pp.waitForFunction(() => window.G.mode === 'village' && !window.G.ui.iris.active, null, { timeout: 40000 }).catch(() => {});
    const hV = await pp.evaluate(() => ({ mode: window.G.mode, portal: !!window.G.state.portal }));
    await pp.evaluate(() => window.G.enterRegion('bamboo'));
    await pp.waitForFunction(() => window.G.mode === 'dungeon' && window.G.dungeon?.isRegion && !window.G.ui.iris.active, null, { timeout: 60000 });
    await padTap(pp, 'Menu'); await pp.waitForFunction(() => window.G.ui.isOpen('menu'), null, { timeout: 4000 }); await pp.waitForTimeout(200);
    const h2 = await btn();
    R.check(`h) the pad: the Game page's Home reads "${h1?.text}" on a floor (in a boss fight dimmed: "${h0?.title}"), "${h2?.text}" in a zone; ${focused ? 'A' : 'a click'} on it casts and goes home`,
      h0?.text === 'Town Portal' && h0.dim && /^No portal mid-fight/.test(h0.title) && h1?.text === 'Town Portal' && !h1.dim && h1.shown && hCast && hV.mode === 'village' && hV.portal && h2?.text === 'Home', { h0, h1, h2, focused, hCast, hV });
  } catch (e) { errors.push('[harness pad] ' + e.stack); }
  errors.push(...P.errors);
  await P.browser.close();
}

// ================================================================ i) touch (a phone)
{
  const T = await launchTouch(PHONE), tp = T.page;
  try {
    await boot(tp, 'fresh&nointro&hour=11&tut'); // (?tut: Shadow's tips are on, the tutorials' own guides start later)
    await tp.evaluate(() => { const G = window.G; G.state.flags.burrowTut = true; G.state.player.lvl = 6; G.actions.recompute(); G.tutorials?.skipAll?.(); });
    const vBtn = await tp.evaluate(() => { const b = document.querySelector('.tc-portal'); return b ? b.hidden : null; });
    await tp.evaluate(() => window.G.enterDungeon({ id: 'mossyBurrow', floor: 1 }));
    await tp.waitForFunction(() => window.G.mode === 'dungeon' && window.G.dungeon?.def?.id === 'mossyBurrow' && !window.G.ui.iris.active, null, { timeout: 60000 });
    await tp.evaluate(() => { const G = window.G; setInterval(() => { G.player.invuln = true; G.actions.restoreAll?.(); }, 250); const s = G.dungeon.startPos; G.player.setPos(s.x, s.z); });
    await tp.waitForFunction(() => { const b = document.querySelector('.tc.on .tc-portal'); return b && !b.hidden && b.getBoundingClientRect().width > 0; }, null, { timeout: 8000 });
    await tp.waitForTimeout(300);
    const geo = await tp.evaluate(() => {
      const r = s => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return b.width ? [b.left, b.top, b.right, b.bottom] : null; };
      const P = r('.tc-portal'), B = r('.tc-bag'), M = r('.mm-wrap'), H = r('.tc-hero'), hit0 = getComputedStyle(document.querySelector('.tc-portal'), '::after');
      const hit = (a, b) => !!a && !!b && a[0] < b[2] - 1 && b[0] < a[2] - 1 && a[1] < b[3] - 1 && b[1] < a[3] - 1;
      return { P, size: P ? [Math.round(P[2] - P[0]), Math.round(P[3] - P[1])] : null, bagSize: B ? [Math.round(B[2] - B[0]), Math.round(B[3] - B[1])] : null, hitInset: hit0.inset || hit0.top, on: !!P && P[0] >= 0 && P[1] >= 0 && P[2] <= innerWidth && P[3] <= innerHeight, bag: hit(P, B), mm: hit(P, M), hero: hit(P, H), leftOfBag: !!P && !!B && P[2] <= B[0] + 1 };
    });
    // Shadow's tip (once, 9 s into the floor, in a quiet moment)
    const tip = await tp.waitForFunction(() => window.G.state.flags.hints?.portal, null, { timeout: 30000 }).then(() => true).catch(() => false);
    const tipText = await tp.evaluate(() => window.QA.toasts.find(t => /Town Portal/.test(t)) || null);
    const c = await center(tp, '.tc-portal');
    await tp.tap('.tc-portal');
    const tCast = await tp.waitForFunction(() => window.G.townPortal.casting || window.G.mode === 'village', null, { timeout: 4000 }).then(() => true).catch(() => false);
    await tp.waitForFunction(() => window.G.mode === 'village' && !window.G.ui.iris.active, null, { timeout: 40000 }).catch(() => {});
    await tp.waitForTimeout(400);
    const tV = await tp.evaluate(() => ({ mode: window.G.mode, portal: !!window.G.state.portal, hidden: document.querySelector('.tc-portal')?.hidden }));
    R.check(`i) a phone: the portal button stands left of the bag on a floor (${geo.size?.join('×')} px like the bag, its hit area ${geo.hitInset} wider; on screen, clear of the bag, the hero button and the minimap), hidden in the village; a tap casts and goes home; Shadow's tip: "${tipText}"`,
      vBtn === true && geo.size && geo.size[0] >= 40 && geo.size[0] === geo.bagSize?.[0] && geo.size[1] === geo.bagSize?.[1] && geo.on && !geo.bag && !geo.mm && !geo.hero && geo.leftOfBag && !!c && tCast && tV.mode === 'village' && tV.portal && tV.hidden === true && tip && /portal button/.test(tipText || ''), { vBtn, geo, tip, tipText, tCast, tV });
  } catch (e) { errors.push('[harness touch] ' + e.stack); }
  errors.push(...T.errors);
  await T.browser.close();
}
const failed = R.finish(errors, warns);
process.exit(failed ? 1 : 0);
