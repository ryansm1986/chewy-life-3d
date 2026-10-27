// Scenario 56: the waterfall and its rock garden (ROADMAP WB-1: world/waterfall.js, fallsGarden.js, koi.js; the owner's
// pick, the "chunky toy diorama" mockup). The falls step down four ledges in a notch cut into the cliff; the garden is
// one kit build inside its triangle budget; the koi, the foam and the curtains are there; the lookout on the west rim is
// a walkable deck; rim rocks on walkable ground collide; no tree stands in the pool's view toward the camera; nothing
// throws. Shots: node tools/qa/falls-bridge-shots.mjs.   node tools/qa/s56-falls.mjs
import { launch, makeReport, BASE } from './lib.mjs';

const R = makeReport('S56 the waterfall');
const errs = [], warns = [];
try {
  const { browser, page, errors, warns: w } = await launch({ w: 1280, h: 720 });
  await page.goto(`${BASE}/?fresh&nointro&hour=10.5`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true && window.G?.waterfall, null, { timeout: 60000 });
  const s = await page.evaluate(async () => {
    const G = window.G, W = G.waterfall, world = G.world, T = world.terrain, { FALLS, LANDMARKS } = await import('/src/world/layout.js');
    const curtains = W.group.children.filter(m => m.name.startsWith('curtain')).length;
    const notch = FALLS.steps.map((st, i) => +T.heightAt(st.x, st.z - 0.5).toFixed(2));
    const d = W.garden.deck, deck = world.deckAt(d.x, d.z);
    const trees = []; const B = LANDMARKS.basin;
    for (const [k, list] of Object.entries(world.veg.treeSpots)) for (const t of list) {
      const dx = t.x - B.x, dz = t.z - B.z, u = (dx + dz) / Math.SQRT2, v = (dx - dz) / Math.SQRT2;
      if ((Math.abs(dx) < B.w / 2 && Math.abs(dz) < B.d / 2) || (u > 0 && u < 14 && Math.abs(v) < 7)) trees.push([k, +t.x.toFixed(1), +t.z.toFixed(1)]);
    }
    const col = W.garden.cols.filter(([x, z, r]) => world.collision.solidAt(x, z)).length;
    return { tris: Math.round(W.garden.tris), curtains, foam: W.foam.n, koi: W.koi.mesh.geometry.instanceCount, notch, steps: FALLS.steps.map(s => s.y),
      deck: !!deck, deckH: deck ? +world.heightAt(d.x, d.z).toFixed(2) : null, deckTop: +d.top.toFixed(2), walk: world.walkable(d.x, d.z), trees, cols: W.garden.cols.length, col };
  });
  R.check('a) a curtain per step down the ledges (four), each in a notch below its ledge stone', s.curtains === s.steps.length && s.steps.length >= 3 && s.notch.every((h, i) => h < s.steps[i] - 0.2), JSON.stringify({ curtains: s.curtains, notch: s.notch, steps: s.steps }));
  R.check('b) the garden is one build inside its budget (< 140k triangles); foam and koi are there', s.tris > 20000 && s.tris < 140000 && s.foam > 60 && s.koi >= 4, JSON.stringify({ tris: s.tris, foam: s.foam, koi: s.koi }));
  R.check('c) the lookout on the west rim is a walkable deck at its plank height', s.deck && s.walk && Math.abs(s.deckH - s.deckTop) < 0.02, JSON.stringify({ deck: s.deck, walk: s.walk, h: s.deckH, top: s.deckTop }));
  R.check('d) the rim rocks on walkable ground collide', s.cols > 4 && s.col === s.cols, JSON.stringify({ cols: s.cols, solid: s.col }));
  R.check('e) no tree stands in the pool or between it and the camera', !s.trees.length, JSON.stringify(s.trees.slice(0, 6)));
  // the falls run their spray near the player and nothing throws
  await page.evaluate(() => { window.G.player.setPos(106.5, 31.5); });
  await page.waitForTimeout(2500);
  R.check('f) no errors with the falls running', !errors.length, errors.slice(0, 3).join(' | '));
  errs.push(...errors); warns.push(...w); await browser.close();
} catch (e) { errs.push('[harness] ' + e.stack); }
const failed = R.finish(errs, warns);
process.exit(failed ? 1 : 0);
