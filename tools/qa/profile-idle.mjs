// CPU-profile the idle village and attribute each long frame (> 20 ms) to the functions that ran during it.
// usage: node tools/qa/profile-idle.mjs [seconds=30]
import { chromium } from 'playwright-core';
const secs = +(process.argv[2] || 30);
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.routeWebSocket(/.*/, ws => { ws.onMessage(() => {}); });
await page.goto('http://localhost:5173/?fresh&nointro&hour=11');
await page.waitForFunction(() => window.__ready === true, null, { timeout: 40000 });
await page.waitForTimeout(3000);
const cdp = await page.context().newCDPSession(page);
await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 250 }); await cdp.send('Profiler.start');
const t0wall = await page.evaluate(() => performance.timeOrigin + performance.now());
const spikes = await page.evaluate(async secs => {
  const out = []; let last = performance.now(); const t0 = last, npc0 = window.G.npcs.length;
  await new Promise(res => { (function f() { const n = performance.now(); if (n - last > 20) out.push([Math.round(last - t0), Math.round(n - t0), window.G.npcs.length - npc0]); last = n; if (n - t0 < secs * 1000) requestAnimationFrame(f); else res(); })(); });
  return out;
}, secs);
const { profile } = await cdp.send('Profiler.stop');
await browser.close();
console.log(`long frames (>20 ms) in ${secs}s: ${spikes.length}`);
const byId = new Map(profile.nodes.map(n => [n.id, n])), parent = new Map();
for (const nd of profile.nodes) for (const c of nd.children || []) parent.set(c, nd.id);
const key = nd => { const cf = nd.callFrame; return `${cf.functionName || '(anon)'} ${(cf.url || '').split('/').pop().split('?')[0]}:${cf.lineNumber + 1}`; };
let t = profile.startTime; const times = profile.timeDeltas.map(d => (t += d));
// profile clock (µs, monotonic) vs page clock: align on the first sample ≈ start of the spike window
const base = times[0];
const agg = new Map();
for (const [a, b, dn] of spikes) {
  const incl = new Map();
  profile.samples.forEach((id, i) => {
    const ms = (times[i] - base) / 1000; if (ms < a || ms > b) return;
    const seen = new Set(); let c = id;
    while (c !== undefined) { const k = key(byId.get(c)); if (!seen.has(k)) { seen.add(k); incl.set(k, (incl.get(k) || 0) + (profile.timeDeltas[i] || 0)); } c = parent.get(c); }
  });
  const top = [...incl].filter(([k]) => /src\//.test(k) || /\.js:/.test(k) && !/three\.module|chunk-|playwright/.test(k)).sort((x, y) => y[1] - x[1]).slice(0, 4);
  const main = top.find(([k]) => !/^(frame|loop|\(anon\) main|boot) /.test(k)) || top[0];
  const label = main ? main[0] : '(gpu / idle / gc)';
  agg.set(label, (agg.get(label) || 0) + 1);
  console.log(`  ${a}-${b} (${b - a} ms) +npcs=${dn}  ${top.map(([k, us]) => `${k} ${(us / 1000).toFixed(1)}`).join(' | ')}`);
}
console.log('-- by top game function');
for (const [k, n] of [...agg].sort((x, y) => y[1] - x[1])) console.log(`  ${n}  ${k}`);
