// Scenario 4: player death in the Burrow -> wakes up in the village. Verifies life restored, dead flag cleared,
// controls unlocked, time scale 1, no lingering dungeon objects/labels/boss bar, 10% coin loss, Shadow ok, WASD works.
// Variants: dying mid Helmet Splitter leap, mid Whirlwind Stance channel, on a boss floor with the bar up, during a floor transition.
import { launch, boot, waitMode, sleep, makeReport, drainDialogue, tap } from './lib.mjs';

const R = makeReport('S4 player death');
const { browser, page, errors, warns } = await launch();

async function dieAndCheck(label, setup) {
  await page.evaluate(() => { window.G.state.coins = 1000; window.G.actions.restoreAll(); });
  const pre = await page.evaluate(setup || (() => null));
  const before = await page.evaluate(() => ({ coins: window.G.state.coins, dungeonChildren: window.G.world.scene.children.length }));
  await page.evaluate(() => { window.__deadWorld = window.G.world; window.G.actions.damage(1e9); });
  await sleep(page, 300);
  const dying = await page.evaluate(() => ({ dead: window.G.playerDead, ts: window.G.engine.timeScale, anim: window.G.player.anim.action?.name }));
  await waitMode(page, 'village', 15000);
  await sleep(page, 1300); // Rosie's wake-up dialogue opens after 900 ms
  const dlg = await page.evaluate(() => ({ active: window.G.ui.dlg.active, speaker: window.G.ui.dlg.active && window.G.ui.dlg.opts.speaker, locked: window.G.player.controlLocked }));
  await drainDialogue(page);
  await sleep(page, 300);
  const st = await page.evaluate(() => {
    const G = window.G, V = G.village.world, old = window.__deadWorld;
    const inVillage = new Set(); V.scene.traverse(o => inVillage.add(o));
    let leaked = 0; old.scene.children.forEach(c => { if (inVillage.has(c)) leaked++; });
    return { ...window.QA.state(), lifeNull: G.state.player.life === null, zoomNull: G.state.player.zoom === null, coins: G.state.coins, labels: document.querySelectorAll('.ll').length, bossBar: !!G.ui.hud.boss, shadowFainted: G.companion.fainted, shadowUntarget: !!G.companion.untargetable, playerInVillageScene: inVillage.has(G.player.rig.root), leakedDungeonObjects: leaked, villageCombatEntities: G.combat.entities.size, orbits: G.skills.orbits.length };
  });
  const p0 = await page.evaluate(() => window.G.player.pos.clone());
  await tap(page, 'w', 500); await page.evaluate(() => { window.__p1 = window.G.player.pos.clone(); }); await tap(page, 'd', 500);
  const moved = await page.evaluate(p0 => { const P = window.G.player.pos; return Math.hypot(P.x - p0.x, P.z - p0.z); }, p0);
  R.note(`${label}: pre=${JSON.stringify(pre)} dying=${JSON.stringify(dying)} rosie=${JSON.stringify(dlg)}`);
  R.check(`${label}: death flow started (dead flag, slow-mo, die anim)`, dying.dead && dying.ts < 1 && dying.anim === 'die', JSON.stringify(dying));
  R.check(`${label}: back in the village, dead flag cleared, life/zoom full`, st.mode === 'village' && !st.dead && st.lifeNull && st.zoomNull && !st.dungeon, JSON.stringify({ mode: st.mode, dead: st.dead, life: st.life, dungeon: st.dungeon }));
  R.check(`${label}: controls unlocked, time scale 1, no leap/dash/channel/invuln`, !st.locked && st.timeScale === 1 && !st.leap && !st.dash && !st.channel && !st.invuln, JSON.stringify({ locked: st.locked, ts: st.timeScale, leap: st.leap, dash: st.dash, channel: st.channel, invuln: st.invuln, anim: st.anim }));
  R.check(`${label}: player can walk after waking up`, moved > 0.5, `moved ${moved.toFixed(2)} from ${JSON.stringify(p0)}`);
  R.check(`${label}: no dungeon leftovers (labels, boss bar, objects, combat entities, bone orbits)`, st.labels === 0 && !st.bossBar && st.leakedDungeonObjects === 0 && st.villageCombatEntities === 0 && st.orbits === 0, JSON.stringify({ labels: st.labels, bossBar: st.bossBar, leaked: st.leakedDungeonObjects, ents: st.villageCombatEntities, orbits: st.orbits }));
  R.check(`${label}: lost 10% coins`, st.coins === before.coins - Math.floor(before.coins * 0.1), `${before.coins} -> ${st.coins}`);
  R.check(`${label}: Shadow is fine`, st.shadowFainted <= 0 && !st.shadowUntarget);
  // unstick for the next variant
  await page.evaluate(() => { const P = window.G.player; P.leap = null; P.dash = null; P.invuln = false; P.anim.stop(); });
}

try {
  await boot(page, 'fresh&nointro');
  await page.evaluate(async () => { const G = window.G; const { SKILL_IDS } = await import('/src/rpg/skills.js'); G.state.flags.burrowTut = true; G.state.player.lvl = 20; for (const id of SKILL_IDS) G.state.player.skills[id] = 5; G.state.player.hotbar = ['attack', 'chomp', 'whirl', 'dig', null, null]; G.actions.recompute(); });

  await page.evaluate(() => window.G.enterDungeon(2)); await waitMode(page, 'dungeon');
  // pots are built in DungeonMode.build() -> buildInteractables() BEFORE swapWorld(), so this.combat is still the old Combat
  const pots = await page.evaluate(async () => {
    const G = window.G, D = G.dungeon, pot = D.pots[0];
    const inDungeonCombat = D.pots.filter(p => G.combat.entities.has(p)).length, inVillageCombat = D.pots.filter(p => G.village.combat.entities.has(p)).length;
    // try to break one the way the player would: a sword swing next to it
    G.player.setPos(pot.pos.x + 0.9, pot.pos.z); G.player.facing = G.player.faceTarget = Math.atan2(pot.pos.x - G.player.pos.x, pot.pos.z - G.player.pos.z);
    G.skills.cds = {}; G.skills.tryCast('attack', pot.pos.clone());
    await new Promise(r => setTimeout(r, 700));
    return { pots: D.pots.length, inDungeonCombat, inVillageCombat, brokeBySwing: !pot.alive };
  });
  R.check('Burrow pots are registered with the Burrow combat (breakable)', pots.inDungeonCombat === pots.pots && pots.brokeBySwing, JSON.stringify(pots));
  await dieAndCheck('plain death on floor 2');

  await page.evaluate(() => window.G.enterDungeon(3)); await waitMode(page, 'dungeon');
  await dieAndCheck('death mid Helmet Splitter', async () => { const G = window.G; G.skills.cds = {}; const ok = G.skills.tryCast('dig', G.player.pos.clone().add(new G.THREE.Vector3(3, 0, 0))); await new Promise(r => setTimeout(r, 120)); return { cast: ok, leap: !!G.player.leap }; });

  await page.evaluate(() => window.G.enterDungeon(3)); await waitMode(page, 'dungeon');
  await dieAndCheck('death mid Whirlwind Stance channel', async () => { const G = window.G; G.input.keys.add('1'); await new Promise(r => setTimeout(r, 300)); const c = !!G.skills.channel; G.input.keys.delete('1'); G.skills.tryCast('bonestorm', G.player.pos.clone()); return { channel: c }; });

  await page.evaluate(() => window.G.enterDungeon(5)); await waitMode(page, 'dungeon');
  await dieAndCheck('death on a boss floor with the boss bar up', async () => { const G = window.G, b = G.dungeon.boss; for (const [dx, dz] of [[5, 0], [-5, 0], [0, 5], [0, -5]]) if (G.world.walkable(b.pos.x + dx, b.pos.z + dz)) { G.player.setPos(b.pos.x + dx, b.pos.z + dz); break; } await new Promise(r => setTimeout(r, 1500)); return { bar: !!G.ui.hud.boss, aggro: b.aggro }; });

  // death during a floor transition (stairs taken, dies while the iris is closing)
  await page.evaluate(() => window.G.enterDungeon(1)); await waitMode(page, 'dungeon');
  await page.evaluate(() => { window.G.state.coins = 1000; window.G.enterDungeon(2); });
  await sleep(page, 300);
  await page.evaluate(() => window.G.actions.damage(1e9));
  await sleep(page, 4500);
  await waitMode(page, 'village', 15000);
  await sleep(page, 1300); await drainDialogue(page);
  const tr = await page.evaluate(() => ({ ...window.QA.state(), floorLeft: window.G.dungeon?.floor ?? null }));
  R.check('death during a floor transition still ends in the village, unlocked', tr.mode === 'village' && !tr.dead && !tr.locked && tr.timeScale === 1 && !tr.dungeon, JSON.stringify(tr));
} catch (e) { errors.push('[harness] ' + e.stack); }
const failed = R.finish(errors, warns);
await browser.close();
process.exit(failed ? 1 : 0);
