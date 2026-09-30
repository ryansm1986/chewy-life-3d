// Detail tour: gameplay-camera shots of village spots and dungeon biomes, for judging how "finished" the world looks.
//   node tools/qa/detail-tour.mjs [tag] [village|dungeon|all]   (dev server on :5173) → <SHOT_DIR>/tour_<tag>_*.png
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
const tag = process.argv[2] || 'now', which = process.argv[3] || 'all';
const OUT = process.env.SHOT_DIR || path.resolve('tools/blender/work/shots');
fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE || 'http://localhost:5173';
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });
async function open(q, wait) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.routeWebSocket(/.*/, ws => { ws.onMessage(() => {}); });
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.goto(`${BASE}/${q}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
  await page.waitForTimeout(wait);
  await page.evaluate(() => { const ui = document.getElementById('ui'); if (ui) ui.style.display = 'none'; }); // judge the world, not the HUD
  return page;
}
const snap = async (page, name) => { const f = path.join(OUT, `tour_${tag}_${name}.png`); await page.screenshot({ path: f }); console.log('saved', f); };
if (which !== 'dungeon') {
  const page = await open('?fresh&nointro&hour=10.5', 3000);
  // [name, x, z, camera distance, yaw]
  const spots = [['plaza', 56, 61, 16, 0.785], ['homes', 46, 64, 14, 0.785], ['shops', 64, 57, 14, 2.3], ['pond', 70, 72, 16, 0.785],
    ['shrinepath', 80, 50, 16, 0.785], ['bridge', 33, 58.5, 14, 0.785], ['north', 51, 40, 16, 0.785], ['wide', 58, 62, 34, 0.785]];
  for (const [name, x, z, d, yaw] of spots) {
    await page.evaluate(([x, z, d, yaw]) => { G.player.setPos(x, z); G.companion?.setPos(x + 1, z + 0.5); const r = G.engine.rig; r.focus.copy(G.player.pos); r.distTarget = d; r.yawTarget = yaw; r.snap(); }, [x, z, d, yaw]);
    await page.waitForTimeout(900);
    await snap(page, 'v_' + name);
  }
  await page.close();
}
if (which !== 'village') {
  for (const floor of (process.env.FLOORS || '1,4,7,12').split(',').map(Number)) {
    const page = await open(`?floor=${floor}&hour=10.5`, 3500);
    const spots = await page.evaluate(() => { // the start room plus three other rooms (cell centres, 2 m cells)
      const rooms = G.world.L?.rooms || [];
      return rooms.slice(0, 4).map(r => [(r.cx + 0.5) * 2, (r.cy + 0.5) * 2]);
    });
    let i = 0;
    for (const [x, z] of spots) {
      await page.evaluate(([x, z]) => { G.player.setPos(x, z); const r = G.engine.rig; r.focus.copy(G.player.pos); r.distTarget = 18; r.snap(); for (const m of G.dungeon?.monsters || []) { const r = m.model?.root || m.root; if (r) r.visible = false; } }, [x, z]);
      await page.waitForTimeout(800);
      await snap(page, `d${floor}_${i++}`);
    }
    await page.close();
  }
}
await browser.close();
