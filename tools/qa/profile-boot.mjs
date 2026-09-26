// CPU-profile boot (navigation -> window.__ready) on the warm dev server and print the hottest functions
// by self time and by inclusive time for game modules. usage: node tools/qa/profile-boot.mjs
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const warm = await browser.newPage();
await warm.routeWebSocket(/.*/, ws => { ws.onMessage(() => {}); });
await warm.goto('http://localhost:5173/?fresh&nointro');
await warm.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
await warm.close();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.routeWebSocket(/.*/, ws => { ws.onMessage(() => {}); });
const cdp = await page.context().newCDPSession(page);
await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 500 }); await cdp.send('Profiler.start');
const t0 = Date.now();
await page.goto('http://localhost:5173/?fresh&nointro');
await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
const ms = Date.now() - t0;
const { profile } = await cdp.send('Profiler.stop');
await browser.close();
const byId = new Map(profile.nodes.map(n => [n.id, n]));
const parent = new Map(); for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
const key = n => { const cf = n.callFrame; return `${cf.functionName || '(anon)'} ${(cf.url || '').split('/').pop().split('?')[0]}:${cf.lineNumber + 1}`; };
const self = new Map(), incl = new Map();
profile.samples.forEach((id, i) => {
  const us = profile.timeDeltas[i] || 0; const n = byId.get(id);
  self.set(key(n), (self.get(key(n)) || 0) + us);
  const seen = new Set(); let cur = id;
  while (cur !== undefined) { const k = key(byId.get(cur)); if (!seen.has(k)) { seen.add(k); incl.set(k, (incl.get(k) || 0) + us); } cur = parent.get(cur); }
});
console.log('ready in', ms, 'ms');
console.log('-- self');
for (const [k, us] of [...self].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log((us / 1000).toFixed(0).padStart(6), 'ms', k);
console.log('-- inclusive (game code)');
for (const [k, us] of [...incl].filter(([k]) => /\.js:/.test(k) && !/three\.module|postprocessing|n8ao|chunk-/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log((us / 1000).toFixed(0).padStart(6), 'ms', k);
