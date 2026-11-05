// Scenario 58: swimming and climbing (ROADMAP TR-1, actors/traverse.js; the owner's picks: free, cozy swimming in any
// deep water, climbing the village's natural cliffs; no jump). Walking into the sea the hero swims (sunk to the
// shoulders, slower, Shadow paddles after him), with no attack, skill or roll while swimming, and walks back out; a
// wading depth stays a walk; walking into a cliff of the northern terraces climbs it to the top and back down; the
// waterfall's rock garden isn't a climb; villagers and monsters still stop at the water; fishing from the bank still works;
// a region's lake swims too; nothing throws.   node tools/qa/s58-traverse.mjs
import { launch, makeReport, sleep, BASE } from './lib.mjs';

const R = makeReport('S58 swimming and climbing');
const errs = [], warns = [];
// walk the hero along (dx, dz) for `secs` by its own step (as the keys do), up to `n` frames of 1/60 s
const walk = (page, dx, dz, secs) => page.evaluate(([dx, dz, secs]) => { const P = window.G.player, d = new window.THREE_V(dx, 0, dz).normalize(); const out = []; for (let t = 0; t < secs; t += 1 / 60) { P.step(d, 1 / 60, 1); out.push(P.trav.mode); } return { modes: [...new Set(out)], pos: [+P.pos.x.toFixed(2), +P.pos.y.toFixed(2), +P.pos.z.toFixed(2)], mode: P.trav.mode }; }, [dx, dz, secs]);
try {
  const { browser, page, errors, warns: w } = await launch({ w: 1280, h: 720 });
  await page.goto(`${BASE}/?fresh&nointro&hour=10.5`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true && window.G?.player?.trav, null, { timeout: 60000 });
  await page.evaluate(async () => { window.THREE_V = (await import('/node_modules/.vite/deps/three.js')).Vector3; });
  await sleep(page, 1200);
  // ---- the sea off the south-east beach
  const S = await page.evaluate(() => { const T = window.G.world.terrain; let x = 112, z = 150; while (T.heightAt(x, z) > 0.4 && z < 222) { x += 0.35; z += 0.7; } return { x, z }; });
  await page.evaluate(([x, z]) => { window.G.player.setPos(x, z); window.G.companion?.setPos?.(x - 0.8, z - 0.8); }, [S.x, S.z]);
  const out = await walk(page, 0.45, 0.9, 4);
  const sw = await page.evaluate(() => { const G = window.G, P = G.player; return { mode: P.trav.mode, y: +P.pos.y.toFixed(2), mul: P.trav.mul, depth: +G.world.waterDepth(P.pos.x, P.pos.z).toFixed(2), cast: G.skills.tryCast('attack', P.pos.clone().add(new window.THREE_V(1, 0, 0))), roll: (() => { const r0 = P.rollT; P.update(0.016); return r0; })() }; });
  R.check('a) walking into the sea: the hero swims, sunk to the shoulders, slower', out.modes.includes('swim') && sw.mode === 'swim' && sw.y < -0.4 && sw.mul < 0.8 && sw.depth > 0.5, JSON.stringify({ out, sw }));
  R.check('b) no attack or skill while swimming', sw.cast === false, JSON.stringify(sw));
  // Shadow paddles after him
  await page.evaluate(() => { for (let i = 0; i < 240; i++) { window.G.companion.update(1 / 60); } });
  const pup = await page.evaluate(() => { const C = window.G.companion, P = window.G.player; return { mode: C.trav.mode, d: +Math.hypot(C.pos.x - P.pos.x, C.pos.z - P.pos.z).toFixed(2) }; });
  R.check('c) Shadow paddles after him (swimming, close by)', pup.mode === 'swim' && pup.d < 4.5, JSON.stringify(pup));
  // and back out
  const back = await walk(page, -0.45, -0.9, 6);
  R.check('d) walking back out of the water: on foot again', back.mode === 'walk' && back.pos[1] > 0.1, JSON.stringify(back));
  // ---- a wading depth stays a walk
  const wd = await page.evaluate(() => { const G = window.G, T = G.world.terrain; for (let z = 150; z < 222; z += 0.2) { const x = 112 + (z - 150) * 0.5, h = T.heightAt(x, z); if (h < -0.15 && h > -0.3) { G.player.setPos(x, z); return { h: +h.toFixed(2), mode: G.player.trav.mode }; } } return null; });
  R.check('e) shallow water (wading) is still a walk', wd && wd.mode === 'walk', JSON.stringify(wd));
  // ---- a cliff: up and back down
  const C = await page.evaluate(() => { const W = window.G.world, T = W.terrain; let best = null;
    for (let z = 20; z < 60; z += 0.5) for (let x = 60; x < 170; x += 0.5) { if (!W.climbable(x, z)) continue; const s = T.slopeAt(x, z); if (!best || s > best.s) best = { x, z, s }; }
    const n = T.normalAt(best.x, best.z), ux = -n.x, uz = -n.z, l = Math.hypot(ux, uz); best.ux = ux / l; best.uz = uz / l;
    best.bx = best.x - best.ux * 2.5; best.bz = best.z - best.uz * 2.5; best.h0 = T.heightAt(best.bx, best.bz); return best; });
  await page.evaluate(([x, z]) => window.G.player.setPos(x, z), [C.bx, C.bz]);
  const up = await walk(page, C.ux, C.uz, 5);
  const top = await page.evaluate(() => +window.G.player.pos.y.toFixed(2));
  R.check('f) walking into a rocky cliff climbs it, to the top', up.modes.includes('climb') && up.mode === 'walk' && top > C.h0 + 1.5, JSON.stringify({ up, top, h0: +C.h0.toFixed(2), s: +C.s.toFixed(2) }));
  const down = await walk(page, -C.ux, -C.uz, 5);
  R.check('g) and back down it (climbing down, then on foot below)', down.modes.includes('climb') && down.mode === 'walk' && down.pos[1] < top - 1.5, JSON.stringify(down));
  // ---- the waterfall's rock garden isn't a climb; villagers and monsters still stop at the water
  const k = await page.evaluate(() => { const W = window.G.world; let garden = 0; for (let z = 18; z < 45; z += 1) for (let x = 89; x < 111; x += 1) if (W.climbable(x, z)) garden++;
    const blocked = W.collision.blockFn(140, 215); return { garden, npcBlocked: blocked }; });
  R.check("h) the waterfall's garden isn't climbable, and the water still stops everyone else", k.garden === 0 && k.npcBlocked, JSON.stringify(k));
  // ---- fishing from the bank still finds the water
  const f = await page.evaluate(async () => { const G = window.G, Fi = G.life?.fishing; if (!Fi) return null; const { POND } = await import('/src/world/layout.js');
    const b = Fi.bankSpotNear(POND.x - POND.r - 1, POND.z, { x: POND.x, z: POND.z }); if (!b) return { bank: null };
    G.player.setPos(b.x, b.z); G.player.facing = b.face; const s = Fi.scanAt(b.x, b.z, b.face); return { mode: G.player.trav.mode, spot: s?.spot || null }; });
  R.check('i) fishing from the bank still finds the water', f && f.mode === 'walk' && !!f.spot, JSON.stringify(f));
  await sleep(page, 400);
  R.check('j) no errors in the village', !errors.length, errors.slice(0, 3).join(' | '));
  errs.push(...errors); warns.push(...w); await browser.close();
  // ---- a region's water (the Tide Pools: the sea)
  {
    const { browser: b2, page: p2, errors: e2, warns: w2 } = await launch({ w: 1280, h: 720 });
    await p2.goto(`${BASE}/?fresh&nointro&region=tidepool`, { waitUntil: 'load' });
    await p2.waitForFunction(() => window.__ready === true && window.G?.dungeon?.isRegion && window.G.player?.trav, null, { timeout: 60000 });
    await p2.evaluate(async () => { window.THREE_V = (await import('/node_modules/.vite/deps/three.js')).Vector3; });
    await sleep(p2, 1500);
    const r = await p2.evaluate(() => { const G = window.G, W = G.world, P = G.player; for (const m of G.dungeon.monsters) { m.pos.set(-400, 0, -400); m.frozen = true; }
      let spot = null; for (let z = 4; z < 120 && !spot; z += 1) for (let x = 4; x < 120; x += 1) if (W.waterAt(x, z) > 0.9 && W.travelOk(x, z)) { spot = { x, z }; break; }
      if (!spot) return null; P.setPos(spot.x, spot.z); return { mode: P.trav.mode, y: +P.pos.y.toFixed(2), lvl: +W.waterSurface(spot.x, spot.z).toFixed(2), climb: !!W.climbable }; });
    R.check("k) a region's water swims too (and no climbing in the regions)", r && r.mode === 'swim' && r.y < r.lvl - 0.3 && !r.climb, JSON.stringify(r));
    R.check('l) no errors in the region', !e2.length, e2.slice(0, 3).join(' | '));
    errs.push(...e2); warns.push(...w2); await b2.close();
  }
} catch (e) { errs.push('[harness] ' + e.stack); }
const failed = R.finish(errs, warns);
process.exit(failed ? 1 : 0);
