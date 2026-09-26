// CPU-profile the review "stress fight" (every skill cast in rotation into a big pack) and report long frames
// together with the functions that were running during them.
// usage: node tools/qa/profile-stress.mjs
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.routeWebSocket(/.*/, ws => { ws.onMessage(() => {}); });
await page.addInitScript(c => { if (c) window.__casts = c; }, process.env.CASTS || '');
await page.goto('http://localhost:5173/?fresh&nointro&hour=10');
await page.waitForFunction(() => window.__ready === true, null, { timeout: 40000 });
await page.waitForTimeout(2500);
await page.evaluate(() => {
  const G = window.G; G.state.flags.burrowTut = true;
  const P = G.state.player; P.lvl = 30; P.stats = { str: 90, dex: 90, vit: 400, ene: 300 };
  for (const id of ['chomp', 'whirl', 'bonestorm', 'blaze', 'fetchstorm', 'woof', 'packcall', 'multi', 'ricochet', 'throw', 'fetchMastery', 'boneMastery', 'dig']) P.skills[id] = 10;
  G.actions.recompute(); P.life = null; P.zoom = null;
  G.enterDungeon(12);
});
await page.waitForTimeout(5000);
await page.evaluate(() => { const G = window.G, p = G.player.pos; let k = 0; for (const m of G.dungeon.monsters) { if (!m.alive || m.isBoss) continue; if (k++ > 45) break; const a = Math.random() * 6.28, r = 3 + Math.random() * 5; const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r; if (G.world.walkable(x, z)) { m.pos.set(x, m.pos.y, z); m.aggro = true; } } });
await page.waitForTimeout(800);
const cdp = await page.context().newCDPSession(page);
await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start');
const T0 = await page.evaluate(() => {
  const t0 = performance.now(); window.__spikes = []; let last = t0;
  (function f() { const n = performance.now(); if (n - last > 45) window.__spikes.push([Math.round(last - t0), Math.round(n - t0)]); last = n; requestAnimationFrame(f); })();
  const casts = (window.__casts || 'fetchstorm,bonestorm,blaze,packcall,woof,multi').split(','); let i = 0; window.__castLog = [];
  const iv = setInterval(() => {
    const G = window.G; if (performance.now() - t0 > 5000) return clearInterval(iv);
    const id = casts[i++ % casts.length]; const m = G.dungeon.monsters.find(x => x.alive);
    G.state.player.zoom = null; G.state.player.life = null; if (G.skills.cds) G.skills.cds[id] = 0;
    const ball = ['fetchstorm', 'blaze', 'multi'].includes(id);
    if ((G.derived.weaponType === 'ball') !== ball) { G.actions.swapWeapons(); G.player.setWeapon(G.derived.weaponType); }
    window.__castLog.push(`${Math.round(performance.now() - t0)}:${id}`);
    if (m) G.skills.tryCast(id, m.pos.clone(), m);
  }, 120);
  return t0;
});
await page.waitForTimeout(5500);
const { profile } = await cdp.send('Profiler.stop');
const { spikes, casts } = await page.evaluate(() => ({ spikes: window.__spikes, casts: window.__castLog }));
await browser.close();
console.log('long frames [start,end] ms:', JSON.stringify(spikes));
console.log('casts:', casts.slice(0, 14).join(' '));
// attribute samples inside each long frame (profile times are µs from profile.startTime; align roughly via first sample)
const byId = new Map(profile.nodes.map(n => [n.id, n]));
let t = profile.startTime; const times = profile.timeDeltas.map(d => (t += d));
const tStart = profile.startTime;
for (const [a, b] of spikes.filter(([a, b]) => b - a > 60)) {
  const self = new Map();
  profile.samples.forEach((id, i) => {
    const ms = (times[i] - tStart) / 1000; if (ms < a - 5 || ms > b + 5) return;
    const cf = byId.get(id).callFrame; const k = `${cf.functionName || '(anon)'} ${(cf.url || '').split('/').pop()}:${cf.lineNumber + 1}`;
    self.set(k, (self.get(k) || 0) + (profile.timeDeltas[i] || 0));
  });
  console.log(`-- frame ${a}..${b} (${b - a} ms)`);
  for (const [k, us] of [...self.entries()].sort((x, y) => y[1] - x[1]).slice(0, 8)) console.log('   ', (us / 1000).toFixed(1).padStart(7), 'ms', k);
}
