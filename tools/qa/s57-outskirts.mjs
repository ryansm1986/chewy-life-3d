// Scenario 57: Blossom Hollow's outskirts (ROADMAP HP-1: world/outskirtsPlan.js, world/outskirts/). The Ramble is
// walkable from end to end (the footbridges are decks: you cross the river on them, not wade it); no tree trunk or rock
// blocks it; every place is built (its pieces in the scene, its interactions); walking into a place finds it (the name
// card, the state, the map's Places list names it; before, a "???"); daily things lock until tomorrow; the trail is on
// the map; nothing throws.   node tools/qa/s57-outskirts.mjs
import { launch, makeReport, sleep, BASE } from './lib.mjs';

const R = makeReport('S57 the outskirts');
const errs = [], warns = [];
try {
  const { browser, page, errors, warns: w } = await launch({ w: 1280, h: 720 });
  await page.goto(`${BASE}/?fresh&nointro&hour=10.5`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true && window.G?.outskirts, null, { timeout: 60000 });
  await sleep(page, 1500);
  // ---- the trail: walkable all the way, the bridges are decks, nothing solid on it
  const t = await page.evaluate(async () => {
    const G = window.G, W = G.world, { RAMBLE, FOOTBRIDGES, RAMBLE_W } = await import('/src/world/outskirtsPlan.js');
    const bad = [], solid = [];
    for (const R of RAMBLE) for (let i = 0; i < R.pts.length - 1; i++) {
      const [ax, az] = R.pts[i], [bx, bz] = R.pts[i + 1], L = Math.hypot(bx - ax, bz - az);
      for (let u = 0; u <= L; u += 0.5) {
        const x = ax + (bx - ax) * u / L, z = az + (bz - az) * u / L;
        if (!W.walkable(x, z)) bad.push([R.id, +x.toFixed(1), +z.toFixed(1)]);
        if (W.collision.solidAt(x, z, 0.25)) solid.push([R.id, +x.toFixed(1), +z.toFixed(1)]);
      }
    }
    const bridges = FOOTBRIDGES.map(F => { const out = []; for (let k = 0; k <= 10; k++) { const u = k / 10, x = F.a[0] + (F.b[0] - F.a[0]) * u, z = F.a[1] + (F.b[1] - F.a[1]) * u; out.push(!!W.deckAt(x, z) && W.walkable(x, z) && W.heightAt(x, z) > 0.1); }
      // a step off the deck's side is water, not deck (the turned deck doesn't claim the river beside it)
      const mx = (F.a[0] + F.b[0]) / 2, mz = (F.a[1] + F.b[1]) / 2, L = Math.hypot(F.b[0] - F.a[0], F.b[1] - F.a[1]), nx = -(F.b[1] - F.a[1]) / L, nz = (F.b[0] - F.a[0]) / L;
      return { id: F.id, deck: out.every(Boolean), side: !W.deckAt(mx + nx * (F.w / 2 + 1.2), mz + nz * (F.w / 2 + 1.2)), peak: +W.heightAt(mx, mz).toFixed(2) }; });
    return { bad: bad.length, badAt: bad.slice(0, 5), solid: solid.length, solidAt: solid.slice(0, 5), bridges, w: RAMBLE_W };
  });
  R.check('a) the Ramble is walkable end to end (no water, no cliff)', t.bad === 0, JSON.stringify(t.badAt));
  R.check('b) nothing solid stands on the trail', t.solid === 0, JSON.stringify(t.solidAt));
  R.check('c) both footbridges are walkable decks over the river, and only the deck (not the water beside it)', t.bridges.every(b => b.deck && b.side && b.peak > 0.4), JSON.stringify(t.bridges));
  // ---- the places are built
  const b = await page.evaluate(() => {
    const O = window.G.outskirts, W = window.G.world;
    return O.places.map(p => ({ id: p.poi.id, built: !!p.api || O.group.children.length > 0, its: W.interactables.filter(i => i.outskirts === p.poi.id).length }));
  });
  const built = b.filter(p => p.its > 0).map(p => p.id);
  R.check('d) every place is built with something to do there', built.length === 10, JSON.stringify(b));
  // ---- finding a place: the card, the state, the map
  const before = await page.evaluate(async () => { const { places } = await import('/src/world/mapData.js'); const l = places(window.G).filter(p => p.outskirts); return { n: l.length, unknown: l.filter(p => p.unknown).length }; });
  await page.evaluate(() => { const G = window.G, p = G.outskirts.places.find(x => x.poi.id === 'bees').poi; G.player.setPos(p.x, p.z); });
  await page.waitForFunction(() => window.G.outskirts.found('bees'), null, { timeout: 8000 }).catch(() => {});
  const after = await page.evaluate(async () => { const G = window.G, { places } = await import('/src/world/mapData.js'); const l = places(G).filter(p => p.outskirts), bees = l.find(p => p.id === 'bees');
    return { found: G.outskirts.found('bees'), cards: G.outskirts.stats.cards, name: bees?.name, unknown: l.filter(p => p.unknown).length, state: !!G.state.outskirts?.found?.bees }; });
  R.check('e) walking into a place finds it: the name card, the state, the map names it (the rest stay "???")', before.n === 10 && before.unknown === 10 && after.found && after.state && after.cards >= 1 && after.name === 'Bee Meadow' && after.unknown === 9, JSON.stringify({ before, after }));
  // ---- a daily thing locks until tomorrow
  const d = await page.evaluate(() => { const ctx = window.G.outskirts.places[0].ctx; const a = ctx.daily('qa'), b2 = ctx.daily('qa'); window.G.state.day = (window.G.state.day || 1) + 1; const c = ctx.daily('qa'); return { a, b: b2, c }; });
  R.check('f) a daily thing: once today, again tomorrow', d.a && !d.b && d.c, JSON.stringify(d));
  // ---- it saves
  const sv = await page.evaluate(() => { window.G.save?.(); const raw = Object.keys(localStorage).map(k => localStorage.getItem(k)).find(v => v && v.includes('"outskirts"')); return !!raw; });
  R.check('g) the outskirts state is saved', sv, '');
  await sleep(page, 500);
  R.check('h) no errors', !errors.length, errors.slice(0, 3).join(' | '));
  errs.push(...errors); warns.push(...w); await browser.close();
} catch (e) { errs.push('[harness] ' + e.stack); }
const failed = R.finish(errs, warns);
process.exit(failed ? 1 : 0);
