// Swimming and climbing at the game camera (ROADMAP TR-1, actors/traverse.js): the hero and Shadow swimming off the
// beach (still and paddling), climbing a cliff of the northern terraces (on the face), in a region's water.
//   node tools/qa/traverse-shots.mjs [tag=now]  → tools/qa/tmp/traverse/<tag>_*.png
import fs from 'node:fs';
import path from 'node:path';
import { launch, BASE } from './lib.mjs';
const [tag = 'now'] = process.argv.slice(2);
const OUT = 'tools/qa/tmp/traverse'; fs.mkdirSync(OUT, { recursive: true });
const { browser, page, errors } = await launch({ w: 1600, h: 900 });
await page.goto(`${BASE}/?fresh&nointro&hour=10.5`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
await page.waitForTimeout(2500);
await page.evaluate(() => { const ui = document.getElementById('ui'); if (ui) ui.style.display = 'none'; document.getElementById('fps')?.remove(); });
const snap = async (name) => { const f = path.join(OUT, `${tag}_${name}.png`); await page.screenshot({ path: f }); console.log('saved', f); };
const spots = await page.evaluate(() => {
  const W = window.G.world, T = W.terrain;
  // the sea off the south-east beach: march out from the plateau until the water is 1.2 m deep
  let x = 112, z = 150; while (T.heightAt(x, z) > -1.2 && z < 222) { x += 0.35; z += 0.7; }
  const sea = { x, z };
  // a cliff face: the steepest climbable cell near the northern terraces
  let best = null;
  for (let zz = 20; zz < 60; zz += 0.5) for (let xx = 60; xx < 170; xx += 0.5) { if (!W.climbable(xx, zz)) continue; const s = T.slopeAt(xx, zz); if (!best || s > best.s) best = { x: xx, z: zz, s }; }
  return { sea, cliff: best };
});
console.log(JSON.stringify(spots));
const place = (x, z, d) => page.evaluate(([x, z, d]) => { const G = window.G; G.player.setPos(x, z); G.companion?.setPos?.(x + 1.1, z + 0.4); const r = G.engine.rig; r.focus.set(x, Math.max(-0.5, G.world.heightAt(x, z)), z); r.distTarget = d; r.yawTarget = Math.PI / 4; r.snap(); }, [x, z, d]);
// swimming: still, then paddling toward the camera's right
await place(spots.sea.x, spots.sea.z, 9); await page.waitForTimeout(1200); await snap('swim-still');
await page.keyboard.down('d'); await page.waitForTimeout(900); await snap('swim-move'); await page.keyboard.up('d');
const sw = await page.evaluate(() => ({ mode: window.G.player.trav.mode, y: +window.G.player.pos.y.toFixed(2), pup: window.G.companion?.trav?.mode }));
console.log('swim', JSON.stringify(sw));
// climbing: on the face, then moving up it
if (spots.cliff) {
  await place(spots.cliff.x, spots.cliff.z, 11); await page.waitForTimeout(1000); await snap('climb-still');
  await page.keyboard.down('w'); await page.waitForTimeout(700); await snap('climb-move'); await page.keyboard.up('w');
  console.log('climb', JSON.stringify(await page.evaluate(() => ({ mode: window.G.player.trav.mode, y: +window.G.player.pos.y.toFixed(2) }))));
}
if (errors.length) console.log('errors:', errors.slice(0, 5).join('\n'));
await browser.close();
