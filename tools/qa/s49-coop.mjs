// Scenario 49: couch co-op (docs/COOP.md): 2-4 controllers on one screen, each playing a hero.
//  a) joining: a spare pad's A opens the join card (the free heroes), the D-pad picks, B backs out, Menu opens it too,
//     A joins (the hero leaves town and pops in beside player 1); a card with nobody free says why and closes itself;
//     player 1's own pad never opens a card; four players
//  b) playing as player 2: their stick walks their hero (not player 1's), player 1's pad walks player 1 alone; the camera
//     frames both and pulls back as they spread; the leash holds the spread
//  c) a fight on a floor with three players: everyone is in the floor's world beside player 1; monsters go after the
//     hero nearest them; a monster's hit lands on that hero alone; an enemy bolt can hit player 2; player 2's attack
//     hurts monsters; XP from a kill goes to every hero; player 2's level-up isn't player 1's (no restore, no banner)
//  d) switching: player 2's LB tap takes the next free hero (the old one carries on in town), the held LB's picker picks
//     the highlighted one; player 1's Tab in co-op skips player 2's hero and tags in on the spot (no fly-over); the
//     wheel says "Player 2 is playing"; a claimed hero is never spawned in town
//  e) downed and revived: player 2 at 0 life is downed (player 1 isn't dragged home), a friend beside them revives them
//     at 40%; alone, Shadow helps them up at 20 s; player 1 downed with player 2 standing stays on the floor; everyone
//     down: the pack goes home together and everyone wakes up
//  f) the pack moves together: a floor's stairs used by player 2 take everyone down, a zone, a house and home again,
//     everyone in the same world beside player 1
//  g) a lost controller: player 2's hero waits ("disconnected"), reconnecting carries on; 60 s without it and they go home
//  h) a villager talks to whoever walked up (player 2's body is held, not player 1's) and player 2's A answers it
//  i) leaving: the hero carries on in town and is free for player 1's wheel again; save and reload keep player 1's
//     hero and player 2's progress, and player 2 can join again
// S49_ONLY=abc runs some parts. SHOTS=1 saves frames to tools/qa/tmp/s49/.
import fs from 'node:fs';
import { launch, boot, sleep, waitMode, makeReport } from './lib.mjs';
import { installPads, pTap, pDown, pUp, pStick, pConnect, pReset } from './pad-lib.mjs';

const R = makeReport('S49 couch co-op: joining, playing, the camera and leash, fights, switching, downed and revived, the pack moving together, lost pads, leaving');
const want = k => !process.env.S49_ONLY || process.env.S49_ONLY.includes(k);
const SHOTS = !!process.env.SHOTS, OUT = 'tools/qa/tmp/s49'; if (SHOTS) fs.mkdirSync(OUT, { recursive: true });
const J = o => JSON.stringify(o);
const { browser, page, errors, warns } = await launch({ w: 1280, h: 800 });
const ev = (fn, arg) => page.evaluate(fn, arg);
const until = async (fn, arg, ms = 8000) => { try { await page.waitForFunction(fn, arg, { timeout: ms, polling: 100 }); return true; } catch (e) { return false; } };
const shot = async name => { if (SHOTS) await page.screenshot({ path: `${OUT}/${name}.png` }); };
// a fresh village with heroes in the pack and four pads plugged in (pad 0: player 1's, as on the Deck)
async function fresh(heroes = ['moka', 'poe', 'shihtzu', 'golden', 'stella'], qs = '') {
  await boot(page, `fresh&nointro&notut&noarrive&nocard&hour=11${qs}`);
  await page.waitForFunction(() => window.G?.mode === 'village' && window.G.player?.rig && window.G.coop, null, { timeout: 40000 });
  await installPads(page, 4);
  await ev(async hs => {
    const G = window.G, H = G.heroes;
    if (hs.includes('moka')) G.state.flags.mokaJoined = true;
    if (hs.includes('poe')) await H.joinPoe(); if (hs.includes('shihtzu')) await H.joinShihtzu(); if (hs.includes('golden')) await H.joinGolden(); if (hs.includes('stella')) await H.joinStella();
    H.spawnBench(); G.ui?.closeAll?.();
  }, heroes);
  await pTap(page, 0, 'A'); // (the first pad is player 1's)
  await until(() => window.G.controls.padIndex === 0);
}
const slots = () => ev(() => window.G.coop.slots.map(s => ({ n: s.n, hero: window.G.coop.heroOf(s), down: window.G.coop.isDown(s) })));
async function joinAs(i, picks = 0) {
  await pTap(page, i, 'A'); await until(i => window.G.coop.joins.has(i), i, 3000);
  for (let k = 0; k < picks; k++) { await pTap(page, i, 'DRight'); await sleep(page, 60); }
  const want = await ev(i => { const J = window.G.coop.joins.get(i); return J?.list[J.i]; }, i);
  await sleep(page, 160); await pTap(page, i, 'A');
  await until(i => window.G.coop.slots.some(s => s.pad?.index === i), i, 4000);
  return want;
}
const slotOf = i => `window.G.coop.slots.find(s => s.pad?.index === ${i})`;

try {
  // ============================================================================ a) joining
  if (want('a')) {
    await fresh();
    const a0 = await ev(() => ({ slots: window.G.coop.slots.length, active: window.G.coop.active, joins: window.G.coop.joins.size }));
    await pTap(page, 0, 'Menu'); await sleep(page, 200);
    const a1 = await ev(() => ({ joins: window.G.coop.joins.size, menu: !!window.G.ui?.isOpen?.('menu') }));
    if (a1.menu) await ev(() => window.G.ui.close('menu'));
    R.check('solo: co-op is off, and player 1\'s own pad never opens a join card', a0.slots === 1 && !a0.active && a0.joins === 0 && a1.joins === 0, J({ a0, a1 }));
    await pTap(page, 1, 'A'); await until(() => window.G.coop.joins.has(1), null, 3000);
    const c0 = await ev(() => { const J = window.G.coop.joins.get(1); return { list: J.list, i: J.i, n: J.n, why: J.why }; });
    R.check('a spare pad\'s A opens a join card for player 2 with the free heroes (not player 1\'s Chewy)', c0.n === 2 && !c0.why && c0.list.join() === 'moka,poe,shihtzu,golden,stella', J(c0));
    await pTap(page, 1, 'DRight'); await sleep(page, 80); await pTap(page, 1, 'DRight'); await sleep(page, 80); await pTap(page, 1, 'DLeft'); await sleep(page, 80);
    const c1 = await ev(() => window.G.coop.joins.get(1)?.i);
    await pTap(page, 1, 'B'); await sleep(page, 150);
    const c2 = await ev(() => ({ joins: window.G.coop.joins.size, slots: window.G.coop.slots.length }));
    R.check('the D-pad walks the card\'s picks; B backs out without joining', c1 === 1 && c2.joins === 0 && c2.slots === 1, J({ c1, c2 }));
    await pTap(page, 1, 'Menu'); await until(() => window.G.coop.joins.has(1), null, 3000);
    await pTap(page, 1, 'DRight'); await sleep(page, 200); await pTap(page, 1, 'A');
    await until(() => window.G.coop.slots.length === 2, null, 4000);
    const j1 = await ev(() => { const G = window.G, C = G.coop, s = C.slots[1], P1 = G.player; return { hero: s.hero, n: s.n, inTown: !!G.heroes.villagers[s.hero], npc: G.npcs.some(v => v.id === s.hero), d: Math.hypot(s.body.pos.x - P1.pos.x, s.body.pos.z - P1.pos.z), world: s.body.world === G.world, claimed: G.controls.claimed.has(1), model: s.body.rig.model || null, weapon: G.coop.with(s, () => G.derived.weaponType) }; });
    R.check('Menu opens the card too; A joins: Poe leaves town and pops in beside player 1 with her fūma, the pad is claimed', j1.hero === 'poe' && j1.n === 2 && !j1.inTown && !j1.npc && j1.d < 3.2 && j1.world && j1.claimed && j1.weapon === 'fuma', J(j1));
    await shot('a-joined');
    await joinAs(2, 0); await joinAs(3, 1);
    const four = await slots();
    R.check('four players: each on a different hero', four.length === 4 && new Set(four.map(s => s.hero)).size === 4, J(four));
    // nobody free: a fresh pack with only Chewy
    await fresh([]);
    await pTap(page, 1, 'A'); await until(() => window.G.coop.joins.has(1), null, 3000);
    const w0 = await ev(() => window.G.coop.joins.get(1)?.why);
    await pTap(page, 1, 'A'); await sleep(page, 200);
    const w1 = await ev(() => window.G.coop.slots.length);
    const gone = await until(() => !window.G.coop.joins.has(1), null, 6000);
    R.check('with no other hero met, the card says why, A does nothing, and it closes by itself', /Moka/.test(w0 || '') && w1 === 1 && gone, J({ w0, w1, gone }));
  }

  // ============================================================================ b) moving, the camera, the leash
  if (want('b')) {
    await fresh();
    await joinAs(1);
    const b0 = await ev(() => { const G = window.G, s = G.coop.slots[1]; return { p1: [G.player.pos.x, G.player.pos.z], p2: [s.body.pos.x, s.body.pos.z] }; });
    await pStick(page, 1, 'left', 1, 0); await sleep(page, 800); await pStick(page, 1, 'left', 0, 0);
    const b1 = await ev(() => { const G = window.G, s = G.coop.slots[1]; return { p1: [G.player.pos.x, G.player.pos.z], p2: [s.body.pos.x, s.body.pos.z] }; });
    const m2 = Math.hypot(b1.p2[0] - b0.p2[0], b1.p2[1] - b0.p2[1]), m1 = Math.hypot(b1.p1[0] - b0.p1[0], b1.p1[1] - b0.p1[1]);
    R.check('player 2\'s stick walks player 2\'s hero, not player 1\'s', m2 > 1.5 && m1 < 0.05, J({ m1, m2 }));
    await pStick(page, 0, 'left', -1, 0); await sleep(page, 700); await pStick(page, 0, 'left', 0, 0);
    const b2 = await ev(() => { const G = window.G, s = G.coop.slots[1]; return { p1: [G.player.pos.x, G.player.pos.z], p2: [s.body.pos.x, s.body.pos.z] }; });
    R.check('player 1\'s pad walks player 1 alone', Math.hypot(b2.p1[0] - b1.p1[0], b2.p1[1] - b1.p1[1]) > 1.2 && Math.hypot(b2.p2[0] - b1.p2[0], b2.p2[1] - b1.p2[1]) < 0.05, J({ b1, b2 }));
    await sleep(page, 900);
    const cam = await ev(() => { const G = window.G, s = G.coop.slots[1], r = G.engine.rig; const mx = (G.player.pos.x + s.body.pos.x) / 2, mz = (G.player.pos.z + s.body.pos.z) / 2; return { off: Math.hypot(r.focus.x - mx, r.focus.z - mz), extra: r.extraDist, spread: Math.hypot(G.player.pos.x - s.body.pos.x, G.player.pos.z - s.body.pos.z) }; });
    R.check('the camera frames the middle of the pack', cam.off < 0.6, J(cam));
    await shot('b-spread');
    // the leash: player 2 runs off to the right for a long while
    await pStick(page, 1, 'left', 1, 0); await sleep(page, 6000); await pStick(page, 1, 'left', 0, 0);
    const lx = await ev(() => { const G = window.G, s = G.coop.slots[1], { r, f } = G.engine.rig.groundAxes(); const dx = s.body.pos.x - G.player.pos.x, dz = s.body.pos.z - G.player.pos.z; return { across: Math.abs(dx * r.x + dz * r.z), deep: Math.abs(dx * f.x + dz * f.z), extra: G.engine.rig.extraDist, onScreen: (() => { const v = s.body.pos.clone().project(G.engine.camera); return Math.abs(v.x) < 1 && Math.abs(v.y) < 1; })() }; });
    R.check('running apart pulls the camera back; the leash keeps player 2 on screen', lx.onScreen && lx.extra > 6 && lx.across > 14, J(lx));
    await shot('b-leash');
  }

  // ============================================================================ c) a fight on a floor
  if (want('c')) {
    await fresh();
    await joinAs(1); await joinAs(2);
    await ev(() => window.G.enterDungeon(2));
    await waitMode(page, 'dungeon'); await until(() => window.G.dungeon?.monsters?.length > 0 && !window.G.ui?.iris?.active, null, 15000); await sleep(page, 800);
    const c0 = await ev(() => { const G = window.G, P = G.player; return G.coop.slots.map(s => { const b = G.coop.bodyOf(s); return { n: s.n, world: b.world === G.world, d: +Math.hypot(b.pos.x - P.pos.x, b.pos.z - P.pos.z).toFixed(1), inScene: !!b.rig.root.parent }; }); });
    R.check('everyone is on the floor beside player 1', c0.every(s => s.world && s.d < 3.5 && s.inScene), J(c0));
    // a monster beside player 2 only (player 1 and 3 sent 14 m off): it goes after player 2 and hits player 2 alone
    const c1 = await ev(async () => {
      const G = window.G, C = G.coop, s2 = C.slots[1], P1 = G.player, b2 = s2.body;
      const m = G.dungeon.monsters.find(x => x.alive && !x.def.boss && x.def.attack?.type !== 'ranged') || G.dungeon.monsters.find(x => x.alive && !x.def.boss);
      for (const x of G.dungeon.monsters) if (x !== m && x.alive) { x.pos.set(9999, 0, 9999); x.stun = 99; x.status && (x.status.stun = 99); }
      const { r } = G.engine.rig.groundAxes();
      const at = (B, k) => { B.setPos(b2.pos.x + r.x * k, b2.pos.z + r.z * k); };
      at(P1, -12); at(C.slots[2].body, -13);
      m.pos.set(b2.pos.x + r.x * 0.9, b2.pos.y, b2.pos.z + r.z * 0.9); m.aggro = true; m.alert?.();
      const l1 = G.actions.life(), l2 = C.with(s2, () => G.actions.life());
      await new Promise(res => setTimeout(res, 4500));
      return { target: m._coopT?.n, l1a: l1, l1b: G.actions.life(), l2a: l2, l2b: C.with(s2, () => G.actions.life()), mAlive: m.alive, why: { dlg: !!G.ui?.dlg?.active, sp: G.ui?.dlg?.speaker || null, line: G.ui?.dlg?.el?.textContent?.slice(0, 120) || null, allPaned: C.allPaned(), panes: C.slots.map(x => x.pane), paused: G.ui?.isPaused?.(), modal: G.ui?.anyModal?.() } };
    });
    R.check('a monster goes after the hero nearest it (player 2) and its bites land on player 2 alone', c1.target === 2 && c1.l2b < c1.l2a && c1.l1b === c1.l1a, J(c1));
    const c2 = await ev(async () => {
      const G = window.G, C = G.coop, s2 = C.slots[1], b2 = s2.body;
      C.with(s2, () => G.actions.restoreAll());
      const l0 = C.with(s2, () => G.actions.life());
      let from = null; for (let a = 0; a < 16 && !from; a++) { const x = b2.pos.x + Math.cos(a * 0.39) * 1.6, z = b2.pos.z + Math.sin(a * 0.39) * 1.6; if (!G.world.collision.solidAt(x, z, 0.3) && !G.world.collision.solidAt((x + b2.pos.x) / 2, (z + b2.pos.z) / 2, 0.2)) from = new G.THREE.Vector3(x, 0.6, z); }
      const dir = b2.pos.clone().setY(0.6).sub(from).setY(0).normalize();
      G.companion.setPos(b2.pos.x - 12, b2.pos.z - 12); G.companion.hold = { x: b2.pos.x - 12, z: b2.pos.z - 12 }; // (Shadow out of the bolt's way)
      const log = []; const pj = G.combat.spawn({ team: 'enemy', kind: 'spark', pos: from, dir, speed: 9, range: 6, radius: 0.3, dmg: [6, 6], element: 'zap', level: 3, onHit: (e) => { log.push({ isP: e === G.player, n: e._coopSlot?.n }); if (e === G.player) log.push(G.combat.hitPlayer(6, { element: 'zap', level: 3 })); else G.combat.hitAlly(e, 6, { element: 'zap' }); } });
      const tg = pj.targets().map(e => e._coopSlot?.n || e.name), inv = b2.invuln, hid = b2.hidden;
      await new Promise(res => setTimeout(res, 900));
      return { l0, l1: C.with(s2, () => G.actions.life()), log, tg, inv, hid, from: [from.x - b2.pos.x, from.z - b2.pos.z], alive: pj.alive, t: pj.t, trav: pj.traveled };
    });
    R.check('an enemy bolt flying at player 2 hits player 2', c2.l1 < c2.l0, J(c2));
    const c3 = await ev(async () => {
      const G = window.G, C = G.coop, s2 = C.slots[1], b2 = s2.body;
      const m = G.dungeon.monsters.find(x => x.alive && !x.def.boss);
      for (const x of G.dungeon.monsters) if (x.alive && x !== m) x.pos.set(9999, 0, 9999);
      m.pos.set(b2.pos.x + Math.sin(b2.facing) * 1.1, b2.pos.y, b2.pos.z + Math.cos(b2.facing) * 1.1);
      C.with(s2, () => G.actions.restoreAll());
      window.__m = m; m.stun = 0; return { life: m.life, max: m.lifeMax };
    });
    await pDown(page, 1, 'A'); await sleep(page, 1600); await pUp(page, 1, 'A');
    const c4 = await ev(() => { const m = window.__m; return { life: m?.life, alive: m?.alive }; });
    R.check('player 2\'s attack (A held) hurts the monster in front of them', !c4.alive || c4.life < c3.life, J({ c3, c4 }));
    const c5 = await ev(() => {
      const G = window.G, C = G.coop, xp0 = C.slots.map(s => C.with(s, () => ({ xp: G.state.player.xp, lvl: G.state.player.lvl })));
      const m = G.dungeon.monsters.find(x => x.alive && !x.def.boss);
      C.with(C.slots[1], () => G.combat.applyDamageToMonster(m, 99999, { element: 'phys' }));
      const xp1 = C.slots.map(s => C.with(s, () => ({ xp: G.state.player.xp, lvl: G.state.player.lvl })));
      return { xp0, xp1, dead: !m.alive };
    });
    R.check('a kill by player 2 gives its XP to every hero in the pack', c5.dead && c5.xp1.every((x, k) => x.xp > c5.xp0[k].xp || x.lvl > c5.xp0[k].lvl), J(c5));
    const c6 = await ev(async () => {
      const G = window.G, C = G.coop, s2 = C.slots[1];
      G.actions.damage(10); const l1 = G.actions.life(); let banner = 0; const b0 = G.ui?.banner; if (G.ui) G.ui.banner = (...a) => { banner++; return b0?.apply(G.ui, a); };
      const lv0 = C.with(s2, () => G.state.player.lvl);
      C.with(s2, () => G.actions.addXp(99999));
      await new Promise(res => setTimeout(res, 200));
      if (G.ui) G.ui.banner = b0;
      return { l1, l1b: G.actions.life(), banner, lv0, lv1: C.with(s2, () => G.state.player.lvl), p1lvl: G.state.player.lvl };
    });
    R.check('player 2\'s level-up is theirs: player 1 isn\'t restored and gets no Level Up banner', c6.lv1 > c6.lv0 && c6.l1b < c6.l1 + 3 && c6.banner === 0, J(c6));
    await shot('c-fight');
  }

  // ============================================================================ d) switching
  if (want('d')) {
    await fresh();
    await joinAs(1); // (moka)
    const d0 = await ev(() => window.G.coop.slots[1].hero);
    await pTap(page, 1, 'LB'); await until(h => window.G.coop.slots[1].hero !== h, d0, 3000);
    const d1 = await ev(() => { const G = window.G, s = G.coop.slots[1]; return { hero: s.hero, oldInTown: !!G.heroes.villagers.moka, newInTown: !!G.heroes.villagers[s.hero], model: s.body.rig.model || null, wt: G.coop.with(s, () => G.derived.weaponType), state: G.coop.with(s, () => G.state.player.cls) }; });
    R.check('player 2\'s LB tap takes the next free hero (Poe); Moka carries on in town', d0 === 'moka' && d1.hero === 'poe' && d1.oldInTown && !d1.newInTown && d1.wt === 'fuma' && d1.state === 'poe', J({ d0, d1 }));
    await pDown(page, 1, 'LB'); await until(() => !!window.G.coop.slots[1].picker, null, 2000);
    const pk = await ev(() => window.G.coop.slots[1].picker.list);
    await pTap(page, 1, 'DRight'); await sleep(page, 80); await pTap(page, 1, 'DRight'); await sleep(page, 80);
    const pi = await ev(() => window.G.coop.slots[1].picker?.i);
    await pUp(page, 1, 'LB'); await until(h => window.G.coop.slots[1].hero === h, pk[2], 3000);
    const d2 = await ev(() => ({ hero: window.G.coop.slots[1].hero, picker: window.G.coop.slots[1].picker }));
    R.check('holding LB opens player 2\'s picker (their hero first); letting go takes the highlighted one', pk[0] === 'poe' && pi === 2 && d2.hero === pk[2] && !d2.picker, J({ pk, pi, d2 }));
    // player 1's Tab: skips player 2's hero, a quick tag-in on the spot
    const p2h = d2.hero;
    const e0 = await ev(() => { const G = window.G; G.heroes.cd = 0; return { dist: G.engine.rig.distTarget, pos: [G.player.pos.x, G.player.pos.z], next: G.heroes.next() }; });
    await page.keyboard.press('Tab'); await until(() => !window.G.heroes.T && window.G.state.activeHero !== 'chewy', null, 4000);
    const e1 = await ev(() => { const G = window.G; return { hero: G.state.activeHero, dist: G.engine.rig.distTarget, maxDist: G.__maxD, pos: [G.player.pos.x, G.player.pos.z], chewyInTown: !!G.heroes.villagers.chewy }; });
    const roster = await ev(() => window.G.heroes.roster().map(r => [r.id, r.why]));
    R.check(`player 1's Tab in co-op skips player 2's hero and tags in on the spot (no fly-over)`, e1.hero === e0.next && e1.hero !== p2h && e1.dist === e0.dist && Math.hypot(e1.pos[0] - e0.pos[0], e1.pos[1] - e0.pos[1]) < 0.3 && e1.chewyInTown, J({ e0, e1, p2h }));
    R.check('the hero wheel says who another player is playing', roster.some(([id, why]) => id === p2h && /Player 2 is playing/.test(why || '')), J(roster));
    const sp = await ev(() => { const G = window.G; G.heroes.spawnBench(); return G.npcs.filter(v => v.id === G.coop.slots[1].hero).length; });
    R.check('a claimed hero is never spawned in town', sp === 0, J({ sp }));
  }

  // ============================================================================ e) downed and revived
  if (want('e')) {
    await fresh();
    await joinAs(1); await joinAs(2);
    await ev(() => window.G.enterDungeon(2));
    await waitMode(page, 'dungeon'); await until(() => !window.G.ui?.iris?.active, null, 15000); await sleep(page, 600);
    await ev(() => { const G = window.G; for (const m of G.dungeon.monsters) if (m.alive && !m.def.boss) m.pos.set(9999, 0, 9999); });
    const e0 = await ev(() => { const G = window.G, C = G.coop, s = C.slots[1]; C.with(s, () => G.actions.damage(99999)); return { down: !!s.downed, mode: G.mode, p1dead: G.playerDead, anim: s.body.anim.action?.name }; });
    R.check('player 2 at 0 life is downed; the pack stays on the floor', e0.down && e0.mode === 'dungeon' && !e0.p1dead, J(e0));
    await ev(() => { const G = window.G, b = G.coop.slots[1].body; G.player.setPos(b.pos.x + 0.7, b.pos.z); G.coop.slots[2].body.setPos(b.pos.x + 9, b.pos.z); });
    await until(() => !window.G.coop.slots[1].downed, null, 5000);
    const e1 = await ev(() => { const G = window.G, C = G.coop, s = C.slots[1]; return { down: !!s.downed, frac: C.with(s, () => G.actions.life() / G.derived.lifeMax), dead: C.with(s, () => G.playerDead) }; });
    R.check('a friend standing beside them revives them at 40% life', !e1.down && !e1.dead && Math.abs(e1.frac - 0.4) < 0.03, J(e1));
    await ev(() => { const G = window.G, C = G.coop, s = C.slots[1]; G.player.setPos(s.body.pos.x - 8, s.body.pos.z); C.slots[2].body.setPos(s.body.pos.x + 9, s.body.pos.z); C.with(s, () => G.actions.damage(99999)); s.downed.t = 19.6; });
    await until(() => !window.G.coop.slots[1].downed, null, 3000);
    const e2 = await ev(() => { const G = window.G, C = G.coop, s = C.slots[1]; return { down: !!s.downed, frac: C.with(s, () => G.actions.life() / G.derived.lifeMax) }; });
    R.check('alone, Shadow helps them up after 20 s at 25%', !e2.down && Math.abs(e2.frac - 0.25) < 0.03, J(e2));
    const e3 = await ev(async () => { const G = window.G, C = G.coop; G.actions.damage(99999); await new Promise(r => setTimeout(r, 400)); return { mode: G.mode, leaving: !!G.leavingDungeon, p1down: !!C.p1.downed, dead: G.playerDead }; });
    R.check('player 1 knocked out with player 2 standing is only downed: no trip home', e3.mode === 'dungeon' && !e3.leaving && e3.p1down && e3.dead, J(e3));
    await ev(() => { const G = window.G, C = G.coop; C.revive(C.p1, 1); });
    await ev(() => { const G = window.G, C = G.coop; for (const s of C.others) C.with(s, () => G.actions.damage(99999)); G.actions.damage(99999); });
    const home = await waitMode(page, 'village', 20000).then(() => true, () => false);
    await until(() => !window.G.ui?.iris?.active && !window.G.playerDead, null, 10000); await sleep(page, 600);
    const e4 = await ev(() => { const G = window.G, C = G.coop; return { mode: G.mode, all: C.slots.map(s => ({ n: s.n, down: C.isDown(s), full: C.with(s, () => G.actions.life() >= G.derived.lifeMax), world: C.bodyOf(s).world === G.world })) }; });
    R.check('everyone down: the pack goes home together and everyone wakes up, full', home && e4.mode === 'village' && e4.all.length === 3 && e4.all.every(s => !s.down && s.full && s.world), J(e4));
    await ev(() => { const G = window.G; if (G.ui?.dlg?.active) G.ui.dlg.finish?.(-1); });
  }

  // ============================================================================ f) the pack moves together
  if (want('f')) {
    await fresh();
    await joinAs(1); await joinAs(2);
    const near = () => ev(() => { const G = window.G, P = G.player; return { mode: G.mode, all: G.coop.slots.map(s => { const b = G.coop.bodyOf(s); return { world: b.world === G.world, d: +Math.hypot(b.pos.x - P.pos.x, b.pos.z - P.pos.z).toFixed(1) }; }) }; });
    await ev(() => window.G.enterDungeon(1));
    await waitMode(page, 'dungeon'); await until(() => !window.G.ui?.iris?.active && window.G.dungeon?.stairsPos, null, 15000); await sleep(page, 500);
    const f0 = await ev(() => { const G = window.G; const sp = G.dungeon.stairsPos; const it = G.world.interactables.find(x => /deeper/i.test(x.label || '')); for (const m of G.dungeon.monsters) if (m.alive) m.pos.set(9999, 0, 9999); return { label: it?.label, floor: G.dungeon.floor, sp: sp && [sp.x, sp.z] }; });
    // player 2 walks onto the stairs and presses A
    await ev(() => { const G = window.G, sp = G.dungeon.stairsPos, s = G.coop.slots[1]; s.body.setPos(sp.x + 0.5, sp.z + 0.5); s.body.faceTo(sp.x, sp.z); s.body.facing = s.body.faceTarget; G.player.setPos(sp.x + 3, sp.z + 2); G.coop.slots[2].body.setPos(sp.x + 3.5, sp.z + 2.5); }); // (facing the stairs: the pad's prompt picks what's in front)
    await sleep(page, 300);
    const pr = await ev(() => window.G.coop.slots[1].prompt);
    await pTap(page, 1, 'A');
    await until(f => window.G.dungeon?.floor === f + 1 && !window.G.ui?.iris?.active, f0.floor, 15000); await sleep(page, 600);
    const f1 = await near();
    R.check('player 2 at the stairs gets the prompt; their A takes the whole pack down a floor, everyone beside player 1', /deeper/i.test(pr?.label || '') && f1.mode === 'dungeon' && f1.all.every(s => s.world && s.d < 3.5), J({ f0, pr, f1 }));
    await ev(() => window.G.enterRegion('bamboo'));
    await until(() => window.G.dungeon?.isRegion && !window.G.ui?.iris?.active, null, 20000); await sleep(page, 800);
    const f2 = await near();
    R.check('a zone: everyone comes along', f2.all.every(s => s.world && s.d < 3.5), J(f2));
    await shot('f-zone');
    await ev(() => window.G.returnToVillage());
    await waitMode(page, 'village'); await until(() => !window.G.ui?.iris?.active, null, 10000); await sleep(page, 600);
    const f3 = await near();
    R.check('home again: everyone in town beside player 1', f3.mode === 'village' && f3.all.every(s => s.world && s.d < 3.5), J(f3));
    await ev(() => window.G.housing.enter());
    await waitMode(page, 'interior', 15000).catch(() => {}); await until(() => !window.G.ui?.iris?.active, null, 10000); await sleep(page, 800);
    const f4 = await near();
    R.check('a house (the cottage): everyone inside together', f4.mode === 'interior' && f4.all.every(s => s.world && s.d < 3.5), J(f4));
    await shot('f-house');
    await ev(() => window.G.housing.exit?.());
    await waitMode(page, 'village', 15000).catch(() => {}); await until(() => !window.G.ui?.iris?.active, null, 10000); await sleep(page, 600);
    const f5 = await near();
    R.check('out again: everyone back in town', f5.mode === 'village' && f5.all.every(s => s.world && s.d < 3.5), J(f5));
  }

  // ============================================================================ g) a lost controller
  if (want('g')) {
    await fresh();
    await joinAs(1);
    let lost = 0; await ev(() => { window.__coopPad = []; window.G.events.on('coop:pad', p => window.__coopPad.push(p)); });
    await pConnect(page, 1, false); await sleep(page, 900);
    const g0 = await ev(() => ({ lost: window.G.coop.slots[1].lostT > 0.5, ev: window.__coopPad.slice(), slots: window.G.coop.slots.length, card: window.G.coop.card(window.G.coop.slots[1]).lost }));
    await pConnect(page, 1, true); await sleep(page, 300);
    await pStick(page, 1, 'left', 1, 0); await sleep(page, 500); await pStick(page, 1, 'left', 0, 0);
    const g1 = await ev(() => ({ lost: window.G.coop.slots[1].lostT > 0.5, ev: window.__coopPad.slice() }));
    R.check('a lost controller: the hero waits ("disconnected"), reconnecting carries on', g0.lost && g0.card && g0.slots === 2 && !g1.lost && g1.ev.some(e => e.connected === false) && g1.ev.some(e => e.connected === true), J({ g0, g1 }));
    await pConnect(page, 1, false); await sleep(page, 700);
    await ev(() => { window.G.coop.slots[1].lostT = 59.9; });
    await until(() => window.G.coop.slots.length === 1, null, 3000);
    const g2 = await ev(() => ({ slots: window.G.coop.slots.length, claimed: window.G.controls.claimed.has(1), inTown: !!window.G.heroes.villagers.moka }));
    R.check('60 s without it: they head home (the hero carries on in town, the pad is free again)', g2.slots === 1 && !g2.claimed && g2.inTown, J(g2));
    await pConnect(page, 1, true);
  }

  // ============================================================================ h) a villager talks to player 2
  if (want('h')) {
    await fresh();
    await joinAs(1);
    const h0 = await ev(() => { const G = window.G, s = G.coop.slots[1], rosie = G.npcs.find(n => n.id === 'rosie'); rosie.frozen = true; s.body.setPos(rosie.pos.x + 1.0, rosie.pos.z); s.body.faceTo(rosie.pos.x, rosie.pos.z); s.body.facing = s.body.faceTarget; G.player.setPos(rosie.pos.x + 6, rosie.pos.z + 4); return { id: rosie.id }; });
    await sleep(page, 400);
    const pr = await ev(() => window.G.coop.slots[1].prompt);
    await pTap(page, 1, 'A');
    const talking = await until(() => window.G.ui?.dlg?.active, null, 4000);
    const h1 = await ev(() => { const G = window.G, s = G.coop.slots[1]; return { p2locked: s.body.controlLocked, p1locked: G.player.controlLocked, line: G.ui.dlg?.i }; });
    for (let k = 0; k < 30 && await ev(() => window.G.ui?.dlg?.active); k++) { await pTap(page, 1, 'A'); await sleep(page, 160); const ch = await ev(() => window.G.ui?.dlg?.choices?.length || 0); if (ch) { await pTap(page, 1, 'B'); await sleep(page, 200); } }
    const h2 = await ev(() => { const G = window.G, s = G.coop.slots[1]; return { open: !!G.ui?.dlg?.active, p2locked: s.body.controlLocked }; });
    R.check('player 2 walks up to Rosie: the prompt is theirs, A talks, their hero is held (not player 1\'s)', /Rosie/i.test(pr?.label || '') && talking && h1.p2locked && !h1.p1locked, J({ pr, h1 }));
    R.check('player 2\'s A reads the dialogue on to its end, and their hero is free again', !h2.open && !h2.p2locked, J(h2));
  }

  // ============================================================================ i) leaving, save and reload
  if (want('i')) {
    await fresh();
    await joinAs(1);
    const i0 = await ev(() => { const G = window.G, C = G.coop, s = C.slots[1]; C.with(s, () => G.actions.addXp(500)); return { hero: s.hero, lvl: C.with(s, () => G.state.player.lvl), xp: C.with(s, () => G.state.player.xp) }; });
    await ev(() => window.G.coop.leave(window.G.coop.slots[1]));
    const i1 = await ev(() => { const G = window.G; return { slots: G.coop.slots.length, inTown: !!G.heroes.villagers.moka, active: G.coop.active, bench: G.heroes.bench(), claimed: G.controls.claimed.has(1) }; });
    R.check('leaving: Moka carries on in town and is on player 1\'s bench again, the pad is free', i1.slots === 1 && !i1.active && i1.inTown && i1.bench.includes('moka') && !i1.claimed, J(i1));
    await joinAs(1);
    await ev(() => window.G.save());
    await page.goto(page.url().replace(/([?&])fresh&?/, '$1') + '&notitle', { waitUntil: 'load' });
    await page.waitForFunction(() => window.__ready === true && window.G?.player && window.G.coop, null, { timeout: 60000 });
    await installPads(page, 4); await until(() => !window.G.ui?.iris?.active && !window.G.titleActive, null, 10000); await pTap(page, 0, 'A');
    const i2 = await ev(() => { const G = window.G; return { active: G.state.activeHero, slots: G.coop.slots.length, moka: G.state.heroes.moka.player.lvl, xp: G.state.heroes.moka.player.xp, mokaInTown: !!G.heroes.villagers.moka }; });
    R.check('save and reload: player 1 is still Chewy, Moka kept player 2\'s progress, and she\'s back in town', i2.active === 'chewy' && i2.slots === 1 && i2.moka === i0.lvl && i2.xp === i0.xp && i2.mokaInTown, J({ i0, i2 }));
    const again = await joinAs(1);
    R.check('player 2 can join again after a reload', await ev(() => window.G.coop.slots.length === 2) && !!again, J({ again }));
  }
} catch (e) { errors.push('[harness] ' + e.stack); }
const failed = R.finish(errors, warns);
await browser.close();
process.exit(failed ? 1 : 0);
