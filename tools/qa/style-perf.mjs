// Disney-style cast vs the classic kit: boot-to-ready time, triangles drawn and frame times in the village.
//   node tools/qa/style-perf.mjs   (dev server on :5173)
import { chromium } from 'playwright-core';
const BASE = process.env.BASE || 'http://localhost:5173';
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });
for (const [label, q] of [['disney', ''], ['classic', '&chewy=classic&kit=classic']]) {
  const rows = [];
  for (let run = 0; run < 2; run++) {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    await page.routeWebSocket(/.*/, ws => { ws.onMessage(() => {}); });
    const t0 = Date.now();
    await page.goto(`${BASE}/?fresh&nointro&hour=11${q}`);
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
    const boot = Date.now() - t0;
    await page.waitForTimeout(2500);
    const stats = await page.evaluate(() => new Promise(res => {
      const r = G.engine.renderer, ts = [];
      r.info.autoReset = false; r.info.reset();
      requestAnimationFrame(() => {
        const tris = r.info.render.triangles, calls = r.info.render.calls; r.info.autoReset = true;
        const t0 = performance.now();
        const f = t => { ts.push(t); if (t - t0 < 4000) requestAnimationFrame(f); else {
          const d = []; for (let i = 1; i < ts.length; i++) d.push(ts[i] - ts[i - 1]); d.sort((a, b) => a - b);
          let charTris = 0; G.world.scene.traverse(o => { if (o.isSkinnedMesh && o.visible) charTris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
          res({ tris, calls, charTris, fps: +(ts.length / 4).toFixed(1), p95: +d[Math.floor(d.length * 0.95)].toFixed(1), max: +d[d.length - 1].toFixed(1), npcs: G.npcs.length });
        } };
        requestAnimationFrame(f);
      });
    }));
    rows.push({ boot, ...stats });
    await page.close();
  }
  console.log(label.padEnd(8), JSON.stringify(rows));
}
await browser.close();
