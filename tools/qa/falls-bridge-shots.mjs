// The village waterfall (world/waterfall.js) and the arched bridge (buildings/decor.js bridge) at the game camera, for
// judging and for Codex mockups (ROADMAP WB-1). node tools/qa/falls-bridge-shots.mjs [tag=now] [hour=10.5]
// → tools/qa/tmp/falls-bridge/<tag>_*.png (HUD hidden; Chewy stands in for scale)
import fs from 'node:fs';
import path from 'node:path';
import { launch, BASE } from './lib.mjs';
const [tag = 'now', hour = '10.5'] = process.argv.slice(2);
const OUT = 'tools/qa/tmp/falls-bridge'; fs.mkdirSync(OUT, { recursive: true });
const { browser, page, errors } = await launch({ w: 1600, h: 900 });
await page.goto(`${BASE}/?fresh&nointro&hour=${hour}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
await page.waitForTimeout(3000);
await page.evaluate(() => { const ui = document.getElementById('ui'); if (ui) ui.style.display = 'none'; document.getElementById('fps')?.remove(); });
const L = await page.evaluate(() => import('/src/world/layout.js').then(m => ({ fall: m.LANDMARKS.waterfall, bridge: m.LANDMARKS.bridgeW })));
// [name, player x, z, camera distance, yaw, hide the trees (their crowns stand between the camera and the falls)]
const spots = [
  ['falls', L.fall.x - 2, L.fall.z + 4, 24, Math.PI / 4, 1], ['falls-near', L.fall.x - 2.5, L.fall.z + 4.5, 15, Math.PI / 4, 1],
  ['falls-game', L.fall.x + 8, L.fall.z + 8, 10.5, Math.PI / 4, 0], ['falls-play', L.fall.x + 6.5, L.fall.z + 6.5, 17, Math.PI / 4, 0],
  ['bridge', L.bridge.x - 0.5, L.bridge.z + 0.5, 12, Math.PI / 4, 0], ['bridge-wide', L.bridge.x, L.bridge.z, 16, Math.PI / 4, 0],
  ['bridge-side', L.bridge.x, L.bridge.z + 3, 11, 0, 0],
];
for (const [name, x, z, d, yaw, hide] of spots) {
  await page.evaluate(([x, z, d, yaw, hide]) => { const G = window.G; G.engine.scene.traverse(o => { if (o.name?.startsWith('veg:')) o.visible = !hide; });
    G.player.setPos(x, z); G.companion?.setPos(x + 1, z + 0.6); const r = G.engine.rig; r.focus.copy(G.player.pos); r.distTarget = d; r.yawTarget = yaw; r.snap(); }, [x, z, d, yaw, hide]);
  await page.waitForTimeout(1200);
  const f = path.join(OUT, `${tag}_${name}.png`); await page.screenshot({ path: f }); console.log('saved', f);
}
if (errors.length) console.log('errors:', errors.slice(0, 5).join('\n'));
await browser.close();
