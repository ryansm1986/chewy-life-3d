// siege-camp: how far the ground sits from the camp's flat h0 under each piece (the Builder places everything at h0). Read-only on src.
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });
for (const zone of ['bamboo', 'maple', 'tidepool', 'onsen']) {
  const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
  await page.routeWebSocket(/.*/, ws => { ws.onMessage(() => {}); });
  await page.goto(`http://localhost:5173/?fresh&nointro&notut&region=${zone}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true && globalThis.G?.dungeon?.village && !G.ui?.iris?.active, null, { timeout: 90000 });
  const r = await page.evaluate(async () => {
    const urlOf = k => performance.getEntriesByType('resource').map(e => new URL(e.name).pathname + new URL(e.name).search).find(u => u.includes(k)) || k;
    const DA = await import(urlOf('/src/regions/village/data.js'));
    const D = G.dungeon, V = D.village, W = D.world, out = [];
    const probe = (x, z, R) => { let lo = 1e9, hi = -1e9; for (let i = 0; i < 16; i++) for (const f of [0, 0.5, 1]) { const y = W.heightAt(x + Math.cos(i / 16 * 6.283) * R * f, z + Math.sin(i / 16 * 6.283) * R * f) - V.h0; lo = Math.min(lo, y); hi = Math.max(hi, y); } return lo.toFixed(2) + '..' + hi.toFixed(2); };
    for (const c of V.camps) { const P = c.pieces || {}; const a = q => DA.screenAt(V.site, q[0], q[1]); const row = { camp: c.id, seed: c.a | 0 };
      const f = a(P.fire || c.at); row.fire = probe(f.x, f.z, 0.5); if (P.tent) { const t = a(P.tent); row.tent = probe(t.x, t.z, 1.0); } if (P.spikes) { const t = a(P.spikes); row.spikes = probe(t.x, t.z, 1.2); } const q = P.cage && a(P.cage); if (q) row.cage = probe(q.x, q.z, 0.6); out.push(row); }
    return out;
  });
  console.log(zone, JSON.stringify(r));
  await page.close();
}
await browser.close();
