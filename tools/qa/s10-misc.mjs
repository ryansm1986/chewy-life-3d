// Scenario 10 (extras found while reading the code):
//  a) per-kill / per-projectile GPU geometry leaks inside one floor (monster models, acorn caps, ball drops)
//  b) Burrow light-pool sources return to baseline after heavy combat
//  c) loot that is still "in the air" (drop timers) when leaving the Burrow -> ghost labels in the village
//  d) reload during the death animation -> 0-HP "zombie" (no regen, potions refused) after load
import { launch, boot, waitMode, sleep, makeReport, drainDialogue, BASE, installProbes } from './lib.mjs';

const R = makeReport('S10 misc: leaks inside a floor, pending loot, reload while dying');
const { browser, page, errors, warns } = await launch();
try {
  await boot(page, 'fresh&nointro');
  await page.evaluate(() => { const G = window.G; G.state.flags.burrowTut = true; G.state.player.lvl = 30; G.actions.recompute(); });
  await page.evaluate(() => window.G.enterDungeon(11)); await waitMode(page, 'dungeon');
  await sleep(page, 800);

  // a) monster kills
  const geo = await page.evaluate(async () => {
    const G = window.G, D = G.dungeon, P = G.player, mem = () => G.engine.renderer.info.memory.geometries;
    for (const m of D.monsters) m.status.stun = 999;
    G.player.invuln = true;
    const rounds = [];
    // warm-up round (not counted): first kills upload shared, cached loot/VFX geometry once
    { const n0 = D.monsters.length; for (const kind of ['mochi', 'kasa', 'lantern', 'oni', 'kinoko', 'wisp']) D.summonAround({ pos: P.pos }, kind, 5);
      const fresh = D.monsters.slice(n0); for (const m of fresh) m.status.stun = 999; await new Promise(r => setTimeout(r, 900));
      for (const m of fresh) G.combat.hitMonster(m, { dmgPct: 1e6, silent: true }); await new Promise(r => setTimeout(r, 1500)); }
    for (let r = 0; r < 3; r++) {
      const n0 = D.monsters.length, gPre = mem();
      for (const kind of ['mochi', 'kasa', 'lantern', 'oni', 'kinoko', 'wisp']) D.summonAround({ pos: P.pos }, kind, 5);
      const fresh = D.monsters.slice(n0); for (const m of fresh) m.status.stun = 999;
      await new Promise(r => setTimeout(r, 900)); // rendered at least once -> uploaded
      const g0 = mem();
      for (const m of fresh) G.combat.hitMonster(m, { dmgPct: 1e6, silent: true });
      await new Promise(r => setTimeout(r, 1500)); // die() -> dispose() after 480 ms
      rounds.push({ killed: fresh.length, geoBeforeSummon: gPre, geoWhileAlive: g0, geoAfterKill: mem() });
    }
    return rounds;
  });
  
  R.note(`kill rounds: ${JSON.stringify(geo)}`);
  R.check('killed monsters free their GPU geometry (count returns to pre-summon level)', geo.slice(1).every(r => r.geoAfterKill - r.geoBeforeSummon <= 3), `summon->alive->killed: ${geo.map(r => `${r.geoBeforeSummon}->${r.geoWhileAlive}->${r.geoAfterKill} (${r.killed} monsters, +${r.geoAfterKill - r.geoBeforeSummon} leaked)`).join(', ')}`);

  // acorns (tanuki bandits) + weapon-ball drops
  const proj = await page.evaluate(async () => {
    const G = window.G, P = G.player, mem = () => G.engine.renderer.info.memory.geometries, V = G.THREE.Vector3;
    // warm-up: one acorn so its cached (shared) geometry is uploaded before measuring
    G.combat.spawn({ team: 'enemy', kind: 'acorn', pos: P.pos.clone().add(new V(3, 0.8, 0)), dir: new V(1, 0, 0), speed: 6, range: 2, radius: 0.3 }); await new Promise(r => setTimeout(r, 700));
    const g0 = mem();
    for (let i = 0; i < 40; i++) { const a = i / 40 * Math.PI * 2; G.combat.spawn({ team: 'enemy', kind: 'acorn', pos: P.pos.clone().add(new V(Math.cos(a) * 3, 0.8, Math.sin(a) * 3)), dir: new V(Math.cos(a), 0, Math.sin(a)), speed: 6, range: 3, radius: 0.2 }); }
    await new Promise(r => setTimeout(r, 1500));
    const g1 = mem();
    const { generateItem } = await import('/src/rpg/items.js');
    const L = G.dungeon.loot;
    for (let i = 0; i < 20; i++) { const it = generateItem({ ilvl: 10, rarity: 'magic', base: 'redTennisBall' }); L.spawn({ type: 'item', item: it }, P.pos.clone().setY(1), P.pos.clone().add(new V(i % 5, 0, (i / 5) | 0))); }
    await new Promise(r => setTimeout(r, 800));
    const g2 = mem(); L.clear(); await new Promise(r => setTimeout(r, 500));
    return { acornGeoLeak: g1 - g0, ballDrops: g2 - g1, afterClear: mem() - g1 };
  });
  R.check('expired acorn projectiles leave no GPU geometry behind', proj.acornGeoLeak <= 1, JSON.stringify(proj));
  R.check('picked-up/cleared ground-loot meshes free their geometry', proj.afterClear <= 1, JSON.stringify(proj));

  // b) light sources back to baseline after projectiles/pups/beams are gone
  const lights = await page.evaluate(async () => {
    const G = window.G, P = G.player, V = G.THREE.Vector3; const s0 = G.world.lightPool.sources.size;
    for (let i = 0; i < 20; i++) G.combat.spawn({ team: 'enemy', kind: i % 2 ? 'fireball' : 'foxfire', pos: P.pos.clone().setY(0.8), dir: new V(Math.cos(i), 0, Math.sin(i)), speed: 8, range: 4, radius: 0.3 });
    const s1 = G.world.lightPool.sources.size;
    await new Promise(r => setTimeout(r, 2000));
    return { baseline: s0, during: s1, after: G.world.lightPool.sources.size };
  });
  R.check('Burrow light-pool sources return to baseline after projectiles expire', lights.after === lights.baseline && lights.during > lights.baseline, JSON.stringify(lights));

  // e) monster death animation (squash) actually plays
  const deathAnim = await page.evaluate(async () => {
    const G = window.G, D = G.dungeon, P = G.player; const n0 = D.monsters.length;
    D.summonAround({ pos: P.pos }, 'mochi', 3); const m = D.monsters[n0]; m.status.stun = 999;
    await new Promise(r => setTimeout(r, 300));
    const sy0 = m.model.pivot.scale.y;
    G.combat.hitMonster(m, { dmgPct: 1e6, silent: true });
    await new Promise(r => setTimeout(r, 300));
    return { deathT: +m.anim.deathT.toFixed(3), scaleYBefore: +sy0.toFixed(3), scaleYAt300ms: +m.model.pivot.scale.y.toFixed(3) };
  });
  R.check('monster death squash animation plays (anim updated after death)', deathAnim.deathT > 0.1, JSON.stringify(deathAnim));

  // f) Pack Call's Shadow buff expires
  const pack = await page.evaluate(async () => {
    const G = window.G; G.state.player.skills.packcall = 3; G.actions.recompute(); G.actions.restoreAll(); G.skills.cds = {}; G.player.anim.stop();
    const p = G.skillParams('packcall');
    G.skills.tryCast('packcall', G.player.pos.clone());
    await new Promise(r => setTimeout(r, 700));
    const b = G.combat.buffs.shadowPower;
    return { buff: b ? JSON.stringify(b) : null, hasTimer: !!(b && b.t !== undefined), pupDuration: p.duration };
  });
  R.check("Pack Call's shadowPower buff has a duration (not permanent for the rest of the floor)", pack.hasTimer, JSON.stringify(pack));

  // g) Tail Spin held while taking the stairs: spin anim / slow-walk flag must not survive the floor change
  const spin = await page.evaluate(async () => {
    const G = window.G; G.state.player.skills.whirl = 3; G.state.player.skills.chomp = 1; G.state.player.hotbar[2] = 'whirl'; G.actions.recompute(); G.actions.restoreAll();
    if (G.derived.weaponType !== 'sword') G.actions.swapWeapons();
    G.skills.cds = {}; G.player.anim.stop();
    G.input.keys.add('1'); await new Promise(r => setTimeout(r, 300));
    G.enterDungeon(G.dungeon.floor + 1);
    await new Promise(r => setTimeout(r, 1500)); G.input.keys.delete('1'); // still holding when the iris swaps floors (~760 ms)
    return true;
  });
  await page.waitForFunction(() => !window.G.ui.iris.active && window.G.mode === 'dungeon', null, { timeout: 20000 }); await sleep(page, 500);
  const spinAfter = await page.evaluate(() => ({ anim: window.G.player.anim.action?.name || null, canMoveWhileActing: !!window.G.player.canMoveWhileActing, channel: !!window.G.skills.channel }));
  R.check('Tail Spin + stairs: no endless spin / permanent 75% walk speed on the next floor', spinAfter.anim !== 'spin' && !spinAfter.canMoveWhileActing, JSON.stringify(spinAfter));
  await page.evaluate(() => { window.G.player.anim.stop(); window.G.player.canMoveWhileActing = false; });

  // h) Shadow faints, Chewy goes home, comes back: Shadow should not start the next floor on 1 HP
  await page.evaluate(() => { const S = window.G.companion; S.takeDamage(1e6); });
  await page.evaluate(() => window.G.returnToVillage()); await waitMode(page, 'village'); await drainDialogue(page);
  await page.evaluate(() => window.G.enterDungeon(1)); await waitMode(page, 'dungeon');
  const shadow = await page.evaluate(() => ({ life: Math.round(window.G.companion.life), lifeMax: window.G.companion.lifeMax, fainted: window.G.companion.fainted }));
  R.check('Shadow is healed after a faint once back home (not 1 HP on the next floor)', shadow.life > shadow.lifeMax * 0.5, JSON.stringify(shadow));

  // c) loot still in flight when leaving
  await page.evaluate(async () => {
    const G = window.G, P = G.player; const { generateItem } = await import('/src/rpg/items.js');
    const drops = []; for (let i = 0; i < 16; i++) drops.push({ type: 'item', item: generateItem({ ilvl: 12, rarity: i % 2 ? 'rare' : 'magic' }) });
    G.dungeon.loot.drop(P.pos.clone(), drops); // spawns one every 70 ms
    G.returnToVillage(); // iris closes in ~760 ms, drops keep spawning until ~1.05 s
  });
  await waitMode(page, 'village'); await sleep(page, 1500);
  await drainDialogue(page);
  const ghost = await page.evaluate(() => ({ labels: document.querySelectorAll('.ll').length, labelTexts: [...document.querySelectorAll('.ll')].slice(0, 3).map(e => e.textContent.trim().slice(0, 30)) }));
  R.check('no ghost loot labels in the village from drops still in flight when leaving', ghost.labels === 0, JSON.stringify(ghost));

  // d) reload while dying
  await page.evaluate(() => window.G.enterDungeon(1)); await waitMode(page, 'dungeon');
  await page.evaluate(() => { window.G.actions.damage(1e9); });
  await sleep(page, 400);
  // the tab is closed / reloaded during the 2.6 s death animation: beforeunload -> save()
  await page.goto(`${BASE}/?notitle`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true && window.G?.player, null, { timeout: 60000 });
  await sleep(page, 1500); await installProbes(page);
  const z = await page.evaluate(async () => {
    const G = window.G, A = G.actions;
    const l0 = A.life(); G.state.potions.heart = Math.max(1, G.state.potions.heart);
    await new Promise(r => setTimeout(r, 2000));
    const pot = A.usePotion('heart');
    return { savedLife: G.state.player.life, lifeAtLoad: l0, lifeAfter2s: A.life(), lifeMax: G.derived.lifeMax, potionUsed: !!pot, mode: G.mode, dead: G.playerDead };
  });
  R.check('reloading during the death animation does not leave Chewy at 0 HP forever', z.lifeAfter2s > 0, JSON.stringify(z));
} catch (e) { errors.push('[harness] ' + e.stack); }
const failed = R.finish(errors, warns);
await browser.close();
process.exit(failed ? 1 : 0);
