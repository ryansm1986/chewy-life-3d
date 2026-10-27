// The water at the game camera (gfx/water.js: the sea, the beach, the river, the pond, the waterfall's pool), for
// judging it against the falls-bridge-style mockups (ROADMAP WB-1). node tools/qa/water-shots.mjs [tag=now] [hour=10.5]
// → tools/qa/tmp/water/<tag>_*.png (HUD hidden; Chewy stands in for scale)
import fs from 'node:fs';
import path from 'node:path';
import { launch, BASE } from './lib.mjs';
const [tag = 'now', hour = '10.5'] = process.argv.slice(2);
const OUT = 'tools/qa/tmp/water'; fs.mkdirSync(OUT, { recursive: true });
const { browser, page, errors } = await launch({ w: 1600, h: 900 });
await page.goto(`${BASE}/?fresh&nointro&hour=${hour}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
await page.waitForTimeout(3000);
await page.evaluate(() => { const ui = document.getElementById('ui'); if (ui) ui.style.display = 'none'; document.getElementById('fps')?.remove(); });
const L = await page.evaluate(() => import('/src/world/layout.js').then(m => {
  // the south-east beach: march from the plateau toward the sea until the ground goes under
  const T = window.G.world.terrain; let x = 112, z = 150; while (T.heightAt(x, z) > 0 && z < 230) { x += 0.35; z += 0.7; }
  return { basin: m.LANDMARKS.basin, bridge: m.LANDMARKS.bridgeW, pond: m.POND, shore: { x, z } };
}));
// [name, focus x, z, camera distance, yaw]
const spots = [
  ['pool', L.basin.x - 1.5, L.basin.z - 2.5, 20, Math.PI / 4], ['pool-near', L.basin.x - 1, L.basin.z + 2, 11, Math.PI / 4],
  ['river', L.bridge.x + 1, L.bridge.z + 7, 14, Math.PI / 4], ['pond', L.pond.x, L.pond.z, 18, Math.PI / 4],
  ['beach', L.shore.x - 1, L.shore.z - 1, 14, Math.PI / 4], ['sea', L.shore.x + 3, L.shore.z + 6, 28, Math.PI / 4],
];
for (const [name, x, z, d, yaw] of spots) {
  await page.evaluate(([x, z, d, yaw]) => { const G = window.G; G.player.setPos(x, z); G.companion?.setPos(x + 1.2, z + 0.4); const r = G.engine.rig; r.focus.set(x, Math.max(0, G.world.heightAt(x, z)), z); r.distTarget = d; r.yawTarget = yaw; r.snap(); }, [x, z, d, yaw]);
  await page.waitForTimeout(1300);
  const f = path.join(OUT, `${tag}_${name}.png`); await page.screenshot({ path: f }); console.log('saved', f);
}
if (errors.length) console.log('errors:', errors.slice(0, 5).join('\n'));
await browser.close();
