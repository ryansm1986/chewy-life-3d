// Scenario 13: outdoor regions (docs/REGIONS.md).
//  a) the Wayfarer's Post + Travel Map in the village; unlock rules
//  b) travelling to a region: world contract, camps, hero on walkable ground; the Bamboo trail ends at its dungeon gate
//     (the region boss moved into the zone dungeon: docs/ZONES.md §8.2; the other three keep theirs outdoors until
//     their dungeons are built)
//  c) fighting there: kills, loot, terrain-aware monsters (pos.y = ground)
//  d) the boss, in the Bamboo Depths' arena now: victory, the dungeon's first clear opens the next region, a portal back
//     out to the grove (s22 covers the gate / floors / rewards in depth)
//  e) the Wayfarer's Stone: region → region travel
//  f) every region builds and runs a few seconds with no errors
//  g) home again: arrival by the post, the village mood restored; save / reload keeps state.regions
//  h) round trips village ⇄ region don't leak GPU memory
import { launch, boot, waitMode, sleep, makeReport } from './lib.mjs';

const R = makeReport('S13 regions: travel, unlocks, fights, boss, region hopping, round-trip leaks');
const { browser, page, errors, warns } = await launch();
const IDS = ['bamboo', 'maple', 'tidepool', 'onsen'];
const inRegion = async (id) => { await page.waitForFunction(i => window.G?.mode === 'dungeon' && window.G.dungeon?.regionId === i && !window.G.ui?.iris?.active, id, { timeout: 30000 }); await sleep(page, 600); };
try {
  await boot(page, 'fresh&nointro');

  // a) the post + map
  const a = await page.evaluate(() => {
    const G = window.G, it = G.village.world.interactables.find(i => /Wayfarer/.test(i.label));
    G.openTravel({ from: 'village' });
    const L = G.travel.list();
    return { post: !!it, open: G.ui.isOpen('travel'), places: L.map(p => p.id), bamboo: L.find(p => p.id === 'bamboo').unlocked, why: L.find(p => p.id === 'bamboo').why, pins: document.querySelectorAll('.tv-pin').length };
  });
  R.check("the Wayfarer's Post is in the village and opens the Travel Map with home + 4 regions", a.post && a.open && a.places.join() === 'village,bamboo,maple,tidepool,onsen' && a.pins === 5, JSON.stringify(a));
  R.check('regions start locked for a level-1 hero (with a reason)', !a.bamboo && /level/i.test(a.why || ''), a.why);
  await page.evaluate(() => { const G = window.G; G.ui.close('travel', true); G.state.player.lvl = 6; G.actions.recompute(); });
  const unl = await page.evaluate(() => window.G.travel.list().filter(p => p.unlocked).map(p => p.id));
  R.check('reaching level 4+ opens the Bamboo Grove (and only it)', unl.join() === 'village,bamboo', unl.join());

  // b) travel there
  await page.evaluate(() => window.G.travel.go('bamboo'));
  await inRegion('bamboo');
  const b = await page.evaluate(() => {
    const G = window.G, W = G.world, D = G.dungeon, P = G.player;
    const contract = ['scene', 'lightPool', 'collision', 'interactables', 'L', 'terrain'].every(k => W[k]) && ['heightAt', 'walkable', 'cellToWorld', 'updateSun', 'update', 'applyMood', 'dispose'].every(k => typeof W[k] === 'function');
    return { contract, region: D.isRegion, monsters: D.monsters.length, boss: D.boss?.id || null, gate: !!D.gate, sealed: !!D.gate?.sealed, walk: W.walkable(P.pos.x, P.pos.z), stone: W.interactables.some(i => /Wayfarer/.test(i.label)), visits: G.state.regions.visits.bamboo };
  });
  R.check('travel lands in the region: world contract, camps, the hero on walkable ground, the Wayfarer\'s Stone; no outdoor boss: the trail ends at the sealed Bamboo Depths gate', b.contract && b.region && b.monsters >= 12 && !b.boss && b.gate && b.sealed && b.walk && b.stone && b.visits === 1, JSON.stringify(b));

  // c) a fight: terrain-aware monsters, kills and loot
  const c = await page.evaluate(async () => {
    const G = window.G, D = G.dungeon, P = G.player;
    const ground = D.monsters.every(m => Math.abs(m.pos.y - G.world.heightAt(m.pos.x, m.pos.z)) < 0.05);
    const pack = D.monsters.filter(m => m.alive && !m.def.boss).slice(0, 6);
    const l0 = (D.loot.list || []).length;
    for (const m of pack) { P.setPos(m.pos.x + 1, m.pos.z); G.combat.hitMonster(m, { dmgPct: 1e6 }); await new Promise(r => setTimeout(r, 60)); }
    await new Promise(r => setTimeout(r, 900));
    return { ground, killed: pack.filter(m => !m.alive).length, want: pack.length, loot: (D.loot.list || []).length - l0 };
  });
  R.check('region monsters stand on the terrain; kills work and drop loot', c.ground && c.killed === c.want && c.loot > 0, JSON.stringify(c));

  // d) the boss, in the dungeon now: unseal the gate (the debug path stands in for phase D's village rescue), floor 2's
  // arena, Master Tengu down → the first clear opens Momiji Hollow; the portal leads back out to the grove
  await page.evaluate(() => { const G = window.G; G.zoneDebug.saveVillage('bamboo'); G.enterDungeon({ id: 'bambooDepths', floor: 2 }); });
  await page.waitForFunction(() => window.G?.dungeon?.kind === 'zone' && window.G.dungeon.floor === 2 && window.G.dungeon.boss && !window.G.ui?.iris?.active, null, { timeout: 40000 });
  const d = await page.evaluate(async () => {
    const G = window.G, D = G.dungeon, b = D.boss, A = D.layout.arena;
    const mapleBefore = G.travel.list().find(p => p.id === 'maple').unlocked;
    G.player.setPos(A.x, A.z + Math.min(8, A.r)); await new Promise(r => setTimeout(r, 1500)); // intro
    G.combat.hitMonster(b, { dmgPct: 1e7 }); await new Promise(r => setTimeout(r, 2600));
    const Z = G.state.zones.bamboo;
    return { dead: !b.alive, cleared: Z.dungeon.cleared, mapleBefore, mapleOpen: G.travel.list().find(p => p.id === 'maple').unlocked, portal: G.world.interactables.find(i => /Return to/.test(i.label))?.label || null, stairs: G.world.interactables.some(i => /deeper/.test(i.label)) };
  });
  R.check('Master Tengu, in the Bamboo Depths\' arena: his fall clears the dungeon, opens Momiji Hollow, leaves a portal back to the grove (no stairs)', d.dead && d.cleared === 1 && !d.mapleBefore && d.mapleOpen && /Bamboo Grove/.test(d.portal || '') && !d.stairs, JSON.stringify(d));
  await page.evaluate(() => window.G.world.interactables.find(i => /Return to/.test(i.label)).onInteract());
  await inRegion('bamboo');

  // e) region → region via the Wayfarer's Stone
  await page.evaluate(() => { const G = window.G, it = G.world.interactables.find(i => /Wayfarer/.test(i.label)); it.onInteract(); });
  await sleep(page, 500);
  const e0 = await page.evaluate(() => ({ open: window.G.ui.isOpen('travel'), here: window.G.travel.list().find(p => p.here)?.id }));
  await page.evaluate(() => window.G.travel.go('maple'));
  await inRegion('maple');
  const e = await page.evaluate(() => ({ id: window.G.dungeon.regionId, monsters: window.G.dungeon.monsters.length }));
  R.check("the Wayfarer's Stone opens the map (you are here: the grove) and takes you straight to the next region", e0.open && e0.here === 'bamboo' && e.id === 'maple' && e.monsters >= 12, JSON.stringify({ e0, e }));

  // f) every region builds and runs
  const runs = [];
  for (const id of IDS) {
    await page.evaluate(i => { window.G.state.regions.unlocked[i] = true; window.G.travel.go(i); }, id);
    await inRegion(id);
    await sleep(page, 1800);
    runs.push(await page.evaluate(() => ({ id: window.G.dungeon.regionId, m: window.G.dungeon.monsters.length, calls: window.G.engine.renderer.info.render.calls, fps: 0 })));
  }
  R.check('all four regions build and run', runs.length === 4 && runs.every(r => r.m >= 12), JSON.stringify(runs));

  // g) home, mood restored, save / reload
  await page.evaluate(() => window.G.travel.go('village'));
  await waitMode(page, 'village'); await sleep(page, 600);
  const g = await page.evaluate(() => {
    const G = window.G, T = G.village.world.landmarks.travel, P = G.player;
    return { nearPost: Math.hypot(P.pos.x - T.x, P.pos.z - T.z) < 4, dungeon: !!G.dungeon, fog: G.world.scene.fog?.color?.getHexString?.() };
  });
  await page.evaluate(() => window.G.save());
  await boot(page, 'notitle');
  const g2 = await page.evaluate(() => ({ R: window.G.state.regions, Z: window.G.state.zones?.bamboo?.dungeon, maple: window.G.travel.list().find(p => p.id === 'maple').unlocked }));
  R.check('home again: you arrive by the Wayfarer\'s Post; state.regions and the dungeon clear survive a reload (Momiji Hollow stays open)', g.nearPost && !g.dungeon && g2.R?.visits?.bamboo >= 1 && g2.Z?.cleared === 1 && g2.maple, JSON.stringify({ g, R: g2.R, Z: g2.Z }));

  // h) round trips don't leak
  await page.evaluate(() => { const G = window.G; G.state.player.lvl = 6; Object.defineProperty(G.sim.stats, 'population', { get: () => 0, set() {}, configurable: true }); });
  const mem = [];
  for (let k = 0; k < 5; k++) {
    await page.evaluate(() => window.G.travel.go('bamboo')); await inRegion('bamboo'); await sleep(page, 800);
    await page.evaluate(() => window.G.travel.go('village')); await waitMode(page, 'village'); await sleep(page, 900);
    mem.push(await page.evaluate(() => ({ g: window.G.engine.renderer.info.memory.geometries, t: window.G.engine.renderer.info.memory.textures })));
  }
  R.note(`round trips: ${mem.map(m => `${m.g}g/${m.t}t`).join(' ')}`);
  R.check('village ⇄ region round trips: no geometry / texture growth after the first two', mem[4].g - mem[1].g <= 6 && mem[4].t - mem[1].t <= 2, JSON.stringify(mem));
} catch (e) { errors.push('[harness] ' + e.stack); }
const failed = R.finish(errors, warns);
await browser.close();
process.exit(failed ? 1 : 0);
