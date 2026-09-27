// CPU-profile building 20 random humanoid villagers and print the hottest functions (inclusive, charKit/geom only).
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.routeWebSocket(/.*/, ws => { ws.onMessage(() => {}); });
await page.goto('http://localhost:5173/?test=chars&only=none');
await page.waitForFunction(() => window.__ready === true, null, { timeout: 40000 });
const cdp = await page.context().newCDPSession(page);
await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 100 }); await cdp.send('Profiler.start');
const ms = await page.evaluate(async () => { const K = await import('/src/actors/charKit.js'), R = await import('/src/actors/roster.js'); const t0 = performance.now(); for (let i = 0; i < 20; i++) K.buildHumanoid(R.randomVillagerSpec()).dispose(); return (performance.now() - t0) / 20; });
const { profile } = await cdp.send('Profiler.stop');
await browser.close();
const byId = new Map(profile.nodes.map(n => [n.id, n])), parent = new Map();
for (const nd of profile.nodes) for (const c of nd.children || []) parent.set(c, nd.id);
const key = nd => { const cf = nd.callFrame; return `${cf.functionName || '(anon)'} ${(cf.url || '').split('/').pop().split('?')[0]}:${cf.lineNumber + 1}`; };
const incl = new Map(), self = new Map();
profile.samples.forEach((id, i) => { const us = profile.timeDeltas[i] || 0; const k0 = key(byId.get(id)); self.set(k0, (self.get(k0) || 0) + us); const seen = new Set(); let c = id; while (c !== undefined) { const k = key(byId.get(c)); if (!seen.has(k)) { seen.add(k); incl.set(k, (incl.get(k) || 0) + us); } c = parent.get(c); } });
console.log('avg ms per humanoid', ms.toFixed(1));
for (const [k, us] of [...incl].filter(([k]) => /charKit|geom|BufferGeometryUtils|three\.module/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 26)) console.log((us / 20000).toFixed(2).padStart(7), 'ms/char', k);
