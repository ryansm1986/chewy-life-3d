import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.routeWebSocket(/.*/, ws => { ws.onMessage(() => {}); });
await page.goto('http://localhost:5173/?fresh&nointro&hour=11');
await page.waitForFunction(() => window.__ready === true, null, { timeout: 40000 });
await page.waitForTimeout(8000);
const cdp = await page.context().newCDPSession(page);
await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 100 }); await cdp.send('Profiler.start');
const n = await page.evaluate(() => {
  const S = window.G.sim; let k = 0;
  // place 6 homes on free grass near the plaza, each followed by a real frame
  const spots = []; for (let z = 30; z < 100 && spots.length < 6; z += 3) for (let x = 30; x < 100 && spots.length < 6; x += 3) if (S.canPlace('home', x, z, 0).ok && S.canPlace('home', x - 1, z - 1, 0).ok) spots.push([x, z]);
  for (const [x, z] of spots) { const t = performance.now(); S.place('home', x, z, 0, { free: true, silent: true }); k++; }
  return k;
});
await page.waitForTimeout(500);
const { profile } = await cdp.send('Profiler.stop');
await browser.close();
const byId = new Map(profile.nodes.map(n => [n.id, n])), parent = new Map();
for (const nd of profile.nodes) for (const c of nd.children || []) parent.set(c, nd.id);
const key = nd => { const cf = nd.callFrame; return `${cf.functionName || '(anon)'} ${(cf.url || '').split('/').pop().split('?')[0]}:${cf.lineNumber + 1}`; };
const incl = new Map(), self = new Map();
profile.samples.forEach((id, i) => { const us = profile.timeDeltas[i] || 0; self.set(key(byId.get(id)), (self.get(key(byId.get(id))) || 0) + us); const seen = new Set(); let c = id; while (c !== undefined) { const k = key(byId.get(c)); if (!seen.has(k)) { seen.add(k); incl.set(k, (incl.get(k) || 0) + us); } c = parent.get(c); } });
console.log('placed', n);
for (const [k, us] of [...incl].filter(([k]) => /village|buildings|vegetation|terrain|collision|kit|index|villageLife|minimap|needIcons/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log((us / 1000).toFixed(1).padStart(7), 'ms', k);
console.log('-- self');
for (const [k, us] of [...self].sort((a, b) => b[1] - a[1]).slice(0, 10)) console.log((us / 1000).toFixed(1).padStart(7), 'ms', k);
