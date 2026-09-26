// Scenario 5 + 6: village sim torture for 60 s (forced growth ticks, zone painting, place/remove, bulldoze grown
// buildings, level-ups, build-mode mouse placement + bulldozer), with a full consistency audit every few seconds:
//   occupancy grid == building footprints (no overlaps / stale cells), 1 model record per building, collision rects,
//   interactables, light sources, chimney smoke emitters and zones all in sync.
// Then S6: mutate inventory/skills/quests/friends, G.save(), reload with ?notitle and compare + re-audit.
import { launch, boot, sleep, makeReport, drainDialogue, BASE } from './lib.mjs';

const R = makeReport('S5 village sim + S6 save/load');
const { browser, page, errors, warns } = await launch();
const DUR = +(process.env.DUR || 60);

const AUDIT = () => {
  const G = window.G, sim = G.sim, S = sim.S, W = Math.round(Math.sqrt(sim.occ.length)), errs = [];
  const QA = window.QA;
  const idx = new Map();
  for (const b of S.buildings) { if (idx.has(b.idx)) errs.push(`duplicate idx ${b.idx} (${b.type} & ${idx.get(b.idx).type})`); idx.set(b.idx, b); }
  const claim = new Int32Array(sim.occ.length).fill(-1);
  for (const b of S.buildings) {
    const [w, d] = sim.dims(b.type, b.rot, b.level);
    for (let z = b.z; z < b.z + d; z++) for (let x = b.x; x < b.x + w; x++) {
      const i = z * W + x;
      if (claim[i] >= 0 && claim[i] !== b.idx) errs.push(`overlap: ${b.type}#${b.idx} and ${idx.get(claim[i])?.type}#${claim[i]} both cover ${x},${z}`);
      claim[i] = b.idx;
      if (sim.occ[i] !== b.idx) errs.push(`occ[${x},${z}]=${sim.occ[i]} but ${b.type}#${b.idx} covers it`);
      if (sim.zone[i]) errs.push(`zone ${sim.zone[i]} painted under ${b.type}#${b.idx} at ${x},${z}`);
    }
  }
  for (let i = 0; i < sim.occ.length; i++) if (sim.occ[i] >= 0 && claim[i] !== sim.occ[i]) errs.push(`stale occ[${i % W},${(i / W) | 0}]=${sim.occ[i]} (no building covers it)`);
  if (sim.list.length !== S.buildings.length) errs.push(`records ${sim.list.length} != buildings ${S.buildings.length}`);
  for (const r of sim.list) { if (!S.buildings.includes(r.data)) errs.push(`record for removed ${r.data.type}#${r.data.idx}`); if (r.group.parent !== sim.group) errs.push(`record group detached ${r.data.type}`); }
  for (const b of S.buildings) { const n = sim.list.filter(r => r.data === b).length; if (n !== 1) errs.push(`${b.type}#${b.idx} has ${n} model records`); }
  const cols = new Set(); for (const a of sim.world.collision.map.values()) for (const o of a) if (o.tag === 'building') cols.add(o);
  const recCols = new Set(sim.list.map(r => r.col).filter(Boolean));
  let orphan = 0; for (const c of cols) if (!recCols.has(c)) orphan++;
  if (orphan) errs.push(`${orphan} orphan building colliders`);
  for (const c of recCols) if (!cols.has(c)) errs.push('record collider missing from collision map');
  for (const it of sim.world.interactables) if (it.building && !S.buildings.includes(it.building)) errs.push(`orphan interactable "${it.label}"`);
  const pool = sim.world.lightPool.sources;
  for (const l of QA.removedLights || []) if (pool.has(l)) { errs.push('light of a removed building still in the pool'); break; }
  for (const r of sim.list) for (const l of r.lights) if (!pool.has(l)) { errs.push(`light of ${r.data.type} missing from pool`); break; }
  const amb = G.village.ambient; const recSmoke = new Set(); for (const r of sim.list) for (const s of r.smokes) if (s) recSmoke.add(s);
  for (const s of QA.removedSmokes || []) if (amb.smokeEmitters.includes(s)) { errs.push('smoke of a removed building still emitting'); break; }
  for (const s of recSmoke) if (!amb.smokeEmitters.includes(s)) { errs.push('smoke emitter of a live building was removed'); break; }
  return [...new Set(errs)].slice(0, 12);
};

try {
  await boot(page, 'fresh&nointro');
  await page.evaluate(`window.QA.audit = ${AUDIT.toString()}`);
  await page.evaluate(() => {
    const G = window.G, sim = G.sim, QA = window.QA;
    QA.removedLights = []; QA.removedSmokes = []; QA.simLog = { placed: 0, rejected: 0, removed: 0, leveled: 0, zones: 0, grown: 0 };
    const rawDespawn = sim.despawn.bind(sim);
    sim.despawn = rec => { if (rec) { QA.removedLights.push(...rec.lights); QA.removedSmokes.push(...rec.smokes.filter(Boolean)); } return rawDespawn(rec); };
  });
  const a0 = await page.evaluate(() => window.QA.audit());
  R.check('starter village is consistent', !a0.length, a0.join(' | '));
  const smoke0 = await page.evaluate(() => { const G = window.G; const withSmoke = G.sim.list.filter(r => (r.model.smoke || []).length); return { buildingsWithChimneys: withSmoke.length, emittersRegistered: withSmoke.filter(r => r.smokes.some(Boolean)).length, total: G.village.ambient.smokeEmitters.length }; });
  R.check('buildings present at boot have chimney smoke', smoke0.buildingsWithChimneys === 0 || smoke0.emittersRegistered === smoke0.buildingsWithChimneys, JSON.stringify(smoke0));

  // ------------------------------------------------------------------ 60 s torture
  const audits = [];
  const t0 = Date.now(); let n = 0;
  while (Date.now() - t0 < DUR * 1000) {
    n++;
    await page.evaluate((n) => {
      const G = window.G, sim = G.sim, QA = window.QA, L = QA.simLog, S = sim.S;
      const P = { x: 56, z: 60 };
      G.state.coins = 99999; for (const k of Object.keys(G.state.materials)) G.state.materials[k] = 999;
      sim.tickT = 99; // force simulate + grow on the next frame
      sim.stats.rank = 5; // unlock everything
      const before = S.buildings.length;
      // paint a zone block
      if (n % 3 === 0) { const t = 1 + (n % 9 === 0 ? 2 : n % 2); L.zones += sim.autoZone(t, 1, 6, 34, 3 + (n % 3)); }
      // place something (valid auto-site + a blind random attempt that may be rejected)
      const types = ['home', 'shop', 'farm', 'well', 'stoneLantern', 'streetLamp', 'park', 'bench', 'flowerBed', 'sakuraPlanter', 'lanternString', 'fence', 'waterTower', 'clinic', 'school', 'onsen', 'koiStatue', 'miniTorii', 'kiln', 'lumber', 'fishingHut', 'fountain'];
      const type = types[n % types.length];
      const b = sim.autoPlace(type, P.x, P.z, 5, 34, true); if (b) L.placed++;
      const rx = 10 + ((n * 37) % 90), rz = 10 + ((n * 53) % 90);
      const b2 = sim.place(types[(n * 7) % types.length], rx, rz, n % 4, { silent: true }); if (b2) L.placed++; else L.rejected++;
      // remove a random non-prebuilt building (every 2nd tick), prefer grown / leveled ones
      if (n % 2 === 0) {
        const cand = S.buildings.filter(x => !(G.sim.constructor && window.__B?.[x.type]?.prebuilt) && !['townHall', 'chewyHouse', 'rosieShop', 'dungeonGate', 'bridge'].includes(x.type));
        const grown = cand.filter(x => x.level > 1 || ['home', 'shop', 'farm', 'lumber', 'kiln', 'fishingHut'].includes(x.type));
        const pick = (grown.length && n % 4 === 0 ? grown : cand)[(n * 13) % Math.max(1, (grown.length && n % 4 === 0 ? grown : cand).length)];
        if (pick) { sim.remove(pick); L.removed++; }
      }
      // level up a random zoned building
      const lv = S.buildings.filter(x => ['home', 'shop', 'farm', 'lumber', 'kiln', 'fishingHut'].includes(x.type) && x.level < (x.type === 'home' || x.type === 'shop' ? 3 : 2));
      if (lv.length) { if (sim.levelUp(lv[(n * 11) % lv.length])) L.leveled++; }
      L.grown += Math.max(0, S.buildings.length - before);
    }, n);
    await sleep(page, 1000);
    if (n % 5 === 0) { const a = await page.evaluate(() => window.QA.audit()); audits.push({ n, a }); if (a.length) R.note(`audit @${n}s: ${a.join(' | ')}`); }
  }
  const simLog = await page.evaluate(() => ({ ...window.QA.simLog, buildings: window.G.sim.S.buildings.length, pop: window.G.sim.stats.population, homes: window.G.sim.stats.homes }));
  R.note(`torture ${n}s: ${JSON.stringify(simLog)}`);
  const bad = audits.filter(x => x.a.length);
  R.check('occupancy/records/colliders/interactables/lights/smoke stay consistent through 60 s of churn', !bad.length, bad.slice(0, 3).map(x => `@${x.n}s ${x.a.slice(0, 3).join('; ')}`).join(' || '));

  // ------------------------------------------------------------------ build mode through the real mouse: place + bulldoze
  await page.evaluate(() => { const G = window.G; G.player.controlLocked = false; });
  await drainDialogue(page);
  await page.keyboard.press('b'); await sleep(page, 600);
  const bm = await page.evaluate(() => ({ active: window.G.build.active, panel: window.G.ui.isOpen('build') }));
  R.check('B opens build mode', bm.active && bm.panel, JSON.stringify(bm));
  // find a valid bench spot near the view centre, click it
  const spot = await page.evaluate(() => {
    const G = window.G, sim = G.sim, cam = G.engine.camera, V = new G.THREE.Vector3();
    G.build.setTool({ kind: 'building', type: 'bench' }); G.build.rot = 0;
    const f = G.buildFocus || G.player.pos;
    for (let r = 2; r < 14; r++) for (let a = 0; a < 16; a++) {
      const x = Math.floor(f.x + Math.cos(a / 16 * 6.283) * r), z = Math.floor(f.z + Math.sin(a / 16 * 6.283) * r);
      if (!sim.canPlace('bench', x, z, 0).ok) continue;
      V.set(x + 0.5, sim.terrain.heightAt(x + 0.5, z + 0.5), z + 0.5).project(cam);
      const sx = (V.x * 0.5 + 0.5) * innerWidth, sy = (-V.y * 0.5 + 0.5) * innerHeight;
      if (sx < 200 || sx > innerWidth - 200 || sy < 120 || sy > innerHeight - 260) continue;
      const el = document.elementFromPoint(sx, sy); if (el?.id !== 'game') continue;
      return { x, z, sx, sy, n: sim.S.buildings.length };
    }
    return null;
  });
  if (spot) {
    await page.mouse.move(spot.sx, spot.sy); await sleep(page, 400);
    await page.mouse.click(spot.sx, spot.sy); await sleep(page, 500);
    const placed = await page.evaluate(s => { const b = window.G.sim.buildingAt(s.x, s.z); return { n: window.G.sim.S.buildings.length, type: b?.type || null }; }, spot);
    R.check('build mode: clicking the ground places the selected building', placed.n === spot.n + 1 && placed.type === 'bench', JSON.stringify({ spot, placed }));
    // bulldoze it with the tool
    await page.evaluate(() => window.G.build.setTool({ kind: 'bulldoze' }));
    await page.mouse.move(spot.sx + 1, spot.sy); await sleep(page, 300);
    await page.mouse.click(spot.sx + 1, spot.sy); await sleep(page, 500);
    const dozed = await page.evaluate(s => ({ n: window.G.sim.S.buildings.length, at: window.G.sim.buildingAt(s.x, s.z)?.type || null, audit: window.QA.audit() }), spot);
    R.check('build mode: bulldozer removes the building under the cursor', dozed.n === spot.n && !dozed.at && !dozed.audit.length, JSON.stringify(dozed));
  } else R.note('no on-screen bench spot found for the mouse test');
  // bulldoze a grown building through the tool as well
  const grownDoze = await page.evaluate(() => {
    const G = window.G, sim = G.sim, cam = G.engine.camera, V = new G.THREE.Vector3();
    const b = sim.S.buildings.find(x => ['home', 'shop'].includes(x.type) && x.level >= 2) || sim.S.buildings.find(x => ['home', 'shop'].includes(x.type));
    if (!b) return null;
    const [w, d] = sim.dims(b.type, b.rot, b.level);
    G.buildFocus = new G.THREE.Vector3(b.x + w / 2, 0, b.z + d / 2);
    return { idx: b.idx, type: b.type, level: b.level, cx: b.x + w / 2, cz: b.z + d / 2 };
  });
  if (grownDoze) {
    await sleep(page, 1200); // camera glides to buildFocus
    const scr = await page.evaluate(g => { const G = window.G, V = new G.THREE.Vector3(Math.floor(g.cx) + 0.5, G.sim.terrain.heightAt(g.cx, g.cz), Math.floor(g.cz) + 0.5).project(G.engine.camera); return { sx: (V.x * 0.5 + 0.5) * innerWidth, sy: (-V.y * 0.5 + 0.5) * innerHeight }; }, grownDoze);
    await page.mouse.move(scr.sx, scr.sy); await sleep(page, 300);
    await page.mouse.click(scr.sx, scr.sy); await sleep(page, 600);
    const res = await page.evaluate(g => ({ gone: !window.G.sim.S.buildings.some(b => b.idx === g.idx && b.type === g.type), audit: window.QA.audit() }), grownDoze);
    R.check(`bulldozing a grown ${grownDoze.type} (lvl ${grownDoze.level}) with the tool`, res.gone && !res.audit.length, JSON.stringify({ ...grownDoze, ...res, scr }));
  }
  await page.keyboard.press('Escape'); await sleep(page, 200);
  await page.keyboard.press('b'); await sleep(page, 400);
  const exited = await page.evaluate(() => ({ active: window.G.build.active, panel: window.G.ui.isOpen('build') }));
  if (exited.active) { await page.evaluate(() => window.G.build.exit()); }

  // ------------------------------------------------------------------ S6: save / load
  const saved = await page.evaluate(async () => {
    const G = window.G, A = G.actions; const { generateItem } = await import('/src/rpg/items.js');
    for (let i = 0; i < 5; i++) A.pickup(generateItem({ ilvl: 10 + i, rarity: ['normal', 'magic', 'rare', 'unique', 'magic'][i] }));
    G.state.player.skills.woof = 3; G.state.player.skills.zoom = 2; G.state.player.hotbar[2] = 'woof';
    G.story.addHearts('usagi', 25); G.story.addHearts('kuma', 7);
    G.state.dungeon.deepest = 7; G.state.dungeon.waypoints = [1, 6];
    G.save();
    const s = G.state;
    return { buildings: s.village.buildings.length, bKeys: s.village.buildings.map(b => `${b.type}@${b.x},${b.z}r${b.rot}L${b.level}`).sort().join('|'), inv: s.inventory.filter(Boolean).map(i => i.uid).sort().join(','), equip: Object.values(s.equipment).filter(Boolean).map(i => i.uid).sort().join(','), skills: JSON.stringify(s.player.skills), hotbar: JSON.stringify(s.player.hotbar), quests: JSON.stringify(s.quests), friends: JSON.stringify(s.friends), coins: s.coins, mats: JSON.stringify(s.materials), zones: s.village.zones.length, paths: s.village.paths.length, deepest: s.dungeon.deepest, wps: JSON.stringify(s.dungeon.waypoints), lvl: s.player.lvl };
  });
  const errBefore = errors.length;
  await page.goto(`${BASE}/?notitle`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true && window.G?.player, null, { timeout: 60000 });
  await sleep(page, 1500);
  await page.evaluate(() => { delete window.QA; });
  const { installProbes } = await import('./lib.mjs'); await installProbes(page);
  await page.evaluate(`window.QA.audit = ${AUDIT.toString()}`);
  const loaded = await page.evaluate(() => {
    const G = window.G, s = G.state;
    return { buildings: s.village.buildings.length, bKeys: s.village.buildings.map(b => `${b.type}@${b.x},${b.z}r${b.rot}L${b.level}`).sort().join('|'), inv: s.inventory.filter(Boolean).map(i => i.uid).sort().join(','), equip: Object.values(s.equipment).filter(Boolean).map(i => i.uid).sort().join(','), skills: JSON.stringify(s.player.skills), hotbar: JSON.stringify(s.player.hotbar), quests: JSON.stringify(s.quests), friends: JSON.stringify(s.friends), coins: s.coins, mats: JSON.stringify(s.materials), zones: s.village.zones.length, paths: s.village.paths.length, deepest: s.dungeon.deepest, wps: JSON.stringify(s.dungeon.waypoints), lvl: s.player.lvl, records: G.sim.list.length, mode: G.mode, locked: G.player.controlLocked, title: G.titleActive };
  });
  for (const k of ['buildings', 'bKeys', 'inv', 'equip', 'skills', 'hotbar', 'quests', 'friends', 'coins', 'mats', 'zones', 'paths', 'deepest', 'wps', 'lvl']) {
    const same = saved[k] === loaded[k];
    R.check(`save/load keeps ${k}`, same, same ? (typeof saved[k] === 'number' ? String(saved[k]) : '') : `saved ${String(saved[k]).slice(0, 160)} | loaded ${String(loaded[k]).slice(0, 160)}`);
  }
  R.check('after load every building has a model record', loaded.records === loaded.buildings, `${loaded.records} records / ${loaded.buildings} buildings`);
  const a2 = await page.evaluate(() => window.QA.audit());
  R.check('after load the village audit is clean', !a2.length, a2.join(' | '));
  R.check('boots into the village, unlocked, no title with ?notitle', loaded.mode === 'village' && !loaded.locked && !loaded.title, JSON.stringify({ mode: loaded.mode, locked: loaded.locked, title: loaded.title }));
  R.check('no runtime errors while booting from the save', errors.length === errBefore, errors.slice(errBefore).join(' | '));
  // (run last: it corrupts the grid when it fails)
  // double remove of the same building must not delete an unrelated one
  const dbl = await page.evaluate(() => {
    const G = window.G, sim = G.sim, S = sim.S;
    const b = S.buildings.find(x => x.type === 'bench' || x.type === 'flowerBed' || x.type === 'well');
    if (!b) return { skipped: true };
    const last = S.buildings[S.buildings.length - 1], n0 = S.buildings.length;
    sim.remove(b); sim.remove(b);
    return { n0, n1: S.buildings.length, lastStillThere: S.buildings.includes(last) || last === b, audit: window.QA.audit() };
  });
  if (!dbl.skipped) R.check('removing an already-removed building is a no-op (no collateral delete)', dbl.n1 === dbl.n0 - 1 && dbl.lastStillThere && !dbl.audit.length, JSON.stringify(dbl));

} catch (e) { errors.push('[harness] ' + e.stack); }
const failed = R.finish(errors, warns);
await browser.close();
process.exit(failed ? 1 : 0);
