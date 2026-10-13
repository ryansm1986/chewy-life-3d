// Scenario 3: the Burrow's four bosses, one at the end of each den's floor 2 (ROADMAP Z-H1: the Mossy Burrow, the Fox
// Shrine, Oni's Kitchen, the Moonlit Sanctum). Aggro the boss (intro), push it through its summon phases, kill it, then
// verify: boss:dead fires once, onBossDefeated -> a return portal appears where it fell (the den ends there: no stairs),
// boss bar hidden, time scale restored, the boss quest's objectives done and its hand-in waiting (docs/QUESTS.md §4), then
// handed in it completes (reward unique), and the next den opens (after the
// Moonlit Sanctum: the Deep Burrow's Spirit Lantern).
import { launch, boot, waitMode, sleep, makeReport, drainDialogue } from './lib.mjs';

const R = makeReport('S3 the dens\' bosses');
const { browser, page, errors, warns } = await launch();
const DENS = [['mossyBurrow', 'king', 'mochiKing', 'foxShrine'], ['foxShrine', 'umbrella', 'kasaLord', 'oniKitchen'], ['oniKitchen', 'oni', 'oniChef', 'moonSanctum'], ['moonSanctum', 'tails', 'nineTails', null]];
try {
  await boot(page, 'fresh&nointro');
  await page.evaluate(() => { const G = window.G; G.state.flags.burrowTut = true; G.state.player.lvl = 40; G.state.player.stats.vit = 300; G.actions.recompute(); G.actions.restoreAll(); });
  for (const [id, q, boss, next] of DENS) {
    const f = id; // (the checks' labels)
    await page.evaluate(({ id, q }) => { const G = window.G; G.state.quests.active = [{ id: q, step: 0, prog: 0 }]; G.state.quests.done = G.state.quests.done.filter(x => x !== q); G.enterDungeon({ id, floor: 2 }); }, { id, q });
    await waitMode(page, 'dungeon');
    await page.waitForFunction(id => window.G.dungeon?.def?.id === id && window.G.dungeon.floor === 2, id);
    const info = await page.evaluate(() => { const G = window.G, b = G.dungeon.boss, B = G.dungeon.layout.bossRoom; return b ? { id: b.id, name: b.name, life: b.lifeMax, pos: [b.pos.x, b.pos.z], big: Math.min(B.w, B.h) >= 15, quest: JSON.stringify(G.state.quests.active) } : null; });
    R.check(`${f}: boss ${boss} spawned in the big chamber at the end of floor 2`, info?.id === boss && info.big, JSON.stringify(info));
    if (!info) continue;
    R.check(`${f}: "Reach the den's second floor" quest step completed on arrival`, /"step":1/.test(info.quest), info.quest);
    const spawn0 = await page.evaluate(() => window.QA.counts['boss:spawn'] || 0);
    // walk up to the boss (teleport next to it on a walkable spot) -> intro
    await page.evaluate(() => {
      const G = window.G, b = G.dungeon.boss;
      for (const [dx, dz] of [[5, 0], [-5, 0], [0, 5], [0, -5], [4, 3], [-4, -3], [3, -4]]) if (G.world.walkable(b.pos.x + dx, b.pos.z + dz)) { G.player.setPos(b.pos.x + dx, b.pos.z + dz); break; }
      G.player.invuln = true;
    });
    await sleep(page, 1800);
    const intro = await page.evaluate(() => ({ aggro: window.G.dungeon.boss?.aggro, bar: !!window.G.ui.hud.boss, spawnEvt: window.QA.counts['boss:spawn'] || 0, ts: window.G.engine.timeScale }));
    R.check(`${f}: boss aggroes and the boss bar shows`, intro.aggro && intro.bar, JSON.stringify(intro));
    R.check(`${f}: 'boss:spawn' event emitted (docs contract; audio boss-music hook listens to it)`, intro.spawnEvt > spawn0, `boss:spawn count ${spawn0} -> ${intro.spawnEvt}`);
    // summon phases
    const phases = await page.evaluate(async () => {
      const G = window.G, b = G.dungeon.boss, n0 = G.dungeon.monsters.length;
      b.life = b.lifeMax * 0.6; await new Promise(r => setTimeout(r, 500));
      const n1 = G.dungeon.monsters.length;
      b.life = b.lifeMax * 0.3; await new Promise(r => setTimeout(r, 500));
      return { n0, n1, n2: G.dungeon.monsters.length, summoned: b.summoned, enraged: !!b.enraged };
    });
    R.check(`${f}: summon phases at 66% / 33% fire (enrage on 2nd)`, phases.summoned === 2 && phases.enraged && phases.n2 > phases.n0, JSON.stringify(phases));
    // kill
    const dead0 = await page.evaluate(() => window.QA.counts['boss:dead'] || 0);
    const inter0 = await page.evaluate(() => window.G.world.interactables.map(i => i.label));
    await page.evaluate(() => { const G = window.G, b = G.dungeon.boss; b.life = 1; G.combat.hitMonster(b, { dmgPct: 500 }); });
    await sleep(page, 400);
    const mid = await page.evaluate(() => ({ ts: window.G.engine.timeScale }));
    await sleep(page, 2600);
    await drainDialogue(page);
    const after = await page.evaluate(next => {
      const G = window.G, L = G.burrow.list();
      return { dead: (window.QA.counts['boss:dead'] || 0), boss: !!G.dungeon.boss, bar: !!G.ui.hud.boss, ts: G.engine.timeScale, inter: G.world.interactables.map(i => i.label), done: [...G.state.quests.done], active: G.state.quests.active.map(q => q.id), handIn: G.state.quests.active.map(q => q.handIn ? q.id : null).filter(Boolean), ptr: G.questTarget()?.label || null, step: G.story.uiList().find(x => x.handIn)?.steps.at(-1)?.text || null, uniques: G.state.inventory.filter(x => x && x.rarity === 'unique').length, log: window.QA.log.filter(l => l[1] === 'boss:dead').slice(-1),
        nextOpen: next ? L.find(d => d.id === next).open : null, deep: G.state.dungeon.deep?.tier?.unlocked || 0, cleared: L.find(d => d.id === G.dungeon.def.id).cleared };
    }, next);
    R.check(`${f}: boss:dead fired exactly once`, after.dead === dead0 + 1, `${dead0} -> ${after.dead} ${JSON.stringify(after.log)}`);
    R.check(`${f}: slow-mo during the kill, restored afterwards`, mid.ts < 1 && after.ts === 1, `mid ${mid.ts} after ${after.ts}`);
    R.check(`${f}: boss bar hidden and dungeon.boss cleared`, !after.bar && !after.boss);
    const newStairs = after.inter.filter(l => /deeper/.test(l)).length - inter0.filter(l => /deeper/.test(l)).length;
    const newPortal = after.inter.filter(l => l === 'Return to Blossom Hollow').length - inter0.filter(l => l === 'Return to Blossom Hollow').length;
    R.check(`${f}: a return portal appears where the boss fell, and no stairs (the den ends with its boss)`, newStairs === 0 && newPortal === 1, `stairs +${newStairs}, portal +${newPortal}`);
    // (docs/QUESTS.md §4: a quest's objectives done, it waits for its hand-in to the giver; s46 plays the scene itself)
    R.check(`${f}: boss quest "${q}": its objectives done, it waits for its hand-in ("${after.step}"), the pointer on the way out`, after.handIn.includes(q) && !after.done.includes(q) && /^(Bring|Tell)/.test(after.step || '') && after.ptr === 'The way out', JSON.stringify({ handIn: after.handIn, done: after.done, step: after.step, ptr: after.ptr }));
    const hd = await page.evaluate(q => { const G = window.G, ok = G.story.handIn(q); return { ok, done: G.state.quests.done.includes(q), active: G.state.quests.active.map(x => x.id) }; }, q);
    R.check(`${f}: handed in, boss quest "${q}" completed`, hd.ok && hd.done, JSON.stringify(hd));
    R.check(next ? `${f}: the den is cleared and ${next} opens` : `${f}: the den is cleared and the Deep Burrow's Spirit Lantern wakes (T1)`, after.cleared >= 1 && (next ? after.nextOpen === true : after.deep >= 1), JSON.stringify({ cleared: after.cleared, nextOpen: after.nextOpen, deep: after.deep }));
  }
  // the boss portal spawns on a 1.5 s timer: leave right after the kill -> does it touch the new world?
  await page.evaluate(() => { const G = window.G; G.state.quests.active = []; G.enterDungeon({ id: 'mossyBurrow', floor: 2 }); });
  await waitMode(page, 'dungeon');
  await page.evaluate(() => { const G = window.G, b = G.dungeon.boss; window.__oldInteract = G.world.interactables; b.life = 1; G.combat.hitMonster(b, { dmgPct: 500 }); G.returnToVillage(); });
  await waitMode(page, 'village');
  await sleep(page, 2000);
  const late = await page.evaluate(() => ({ villageInteract: window.G.world.interactables.map(i => i.label).filter(l => /Burrow deeper|Return to Blossom/.test(l)), ts: window.G.engine.timeScale, bar: !!window.G.ui.hud.boss }));
  R.check('leaving right after a boss kill: no boss stairs/portal leak into the village, time scale 1, bar hidden', !late.villageInteract.length && late.ts === 1 && !late.bar, JSON.stringify(late));

  // boss dies with its back to a wall: the portal home must land on open floor next to it (openSpotNear), never in rock.
  // Put the boss as close to a +x wall as its own collider allows (radius*0.8 from the rock face), then kill it.
  for (const wf of ['mossyBurrow', 'moonSanctum']) {
    await page.evaluate(id => { window.G.enterDungeon({ id, floor: 2 }); }, wf);
    await page.waitForFunction(id => window.G.dungeon?.def?.id === id && window.G.dungeon.floor === 2 && !window.G.ui.iris.active, wf, { timeout: 20000 });
    const wallKill = await page.evaluate(async () => {
      const G = window.G, D = G.dungeon, L = D.layout, b = D.boss, room = L.bossRoom;
      let spot = null;
      for (let y = room.y; y < room.y + room.h && !spot; y++) for (let x = room.x; x < room.x + room.w; x++) if (L.at(x, y) && L.at(x, y - 1) && L.at(x, y + 1) && !L.at(x + 1, y) && !L.at(x + 2, y) && L.at(x - 1, y)) { spot = { x: (x + 1) * 2 - b.radius * 0.8 - 0.01, z: (y + 0.5) * 2 }; break; }
      if (!spot) return { skipped: true };
      const p = new G.THREE.Vector3(spot.x, 0, spot.z); G.world.collision.resolve(p, b.radius * 0.8, p.clone());
      b.pos.copy(p); b.life = 1; G.combat.hitMonster(b, { dmgPct: 500 });
      await new Promise(r => setTimeout(r, 2200));
      const st = G.world.interactables.filter(i => i.label === 'Return to Blossom Hollow' && i.pos.distanceTo(D.exitPos) > 0.5).pop();
      let reach = false;
      for (let dz = -1.7; dz <= 1.7; dz += 0.05) for (let dx = -1.7; dx <= 1.7; dx += 0.05) if (Math.hypot(dx, dz) < 1.69 && G.world.walkable(st.pos.x + dx, st.pos.z + dz)) reach = true;
      return { boss: b.id, radius: b.radius, deathPos: [p.x.toFixed(2), p.z.toFixed(2)], portalPos: [st.pos.x.toFixed(2), st.pos.z.toFixed(2)], portalCellIsRock: !L.at(Math.floor(st.pos.x / 2), Math.floor(st.pos.z / 2)), canStandInReach: reach };
    });
    if (wallKill.skipped) R.note('boss-by-wall: no suitable wall in boss room');
    else R.check(`${wf}: boss killed with its back to a wall: the portal home is not buried in rock and is reachable`, wallKill.canStandInReach && !wallKill.portalCellIsRock, JSON.stringify(wallKill));
  }
} catch (e) { errors.push('[harness] ' + e.stack); }
const failed = R.finish(errors, warns);
await browser.close();
process.exit(failed ? 1 : 0);
