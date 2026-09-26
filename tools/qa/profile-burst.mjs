// CPU-profile a big multi-skill burst in the Burrow and print the hottest functions (self time).
// usage: node tools/qa/profile-burst.mjs
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.routeWebSocket(/.*/, ws => { ws.onMessage(() => {}); });
await page.goto('http://localhost:5173/?floor=3&fresh&nointro');
await page.waitForFunction(() => window.__ready === true, null, { timeout: 40000 });
await page.waitForTimeout(6500);
await page.keyboard.press('Escape');
await page.evaluate(() => {
  const G = window.G, P = G.player; G.state.flags.burrowTut = true;
  G.state.player.lvl = 30; for (const k of ['bonestorm', 'fetchstorm', 'moonhowl', 'woof', 'blaze', 'multi']) G.state.player.skills[k] = 10;
  G.actions.recompute(); G.actions.restoreAll();
  const ms = G.dungeon.monsters.filter(m => m.alive);
  for (const m of ms.slice(0, 20)) { m.pos.set(P.pos.x + Math.random() * 8 - 4, 0, P.pos.z + Math.random() * 8 - 4); m.aggro = true; }
  window.__ms = ms;
});
await page.waitForTimeout(500);
const cdp = await page.context().newCDPSession(page);
await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start');
await page.evaluate(() => {
  const G = window.G, P = G.player, ms = window.__ms;
  const t0 = performance.now(); window.__spikes = []; let last = t0;
  (function f() { const n = performance.now(); if (n - last > 45) window.__spikes.push(`${Math.round(n - t0)}:${Math.round(n - last)}`); last = n; requestAnimationFrame(f); })();
  G.skills.tryCast('bonestorm', P.pos.clone());
  setTimeout(() => G.skills.tryCast('moonhowl', P.pos.clone()), 300);
  setTimeout(() => { G.actions.swapWeapons(); G.player.setWeapon(G.derived.weaponType); G.skills.tryCast('blaze', ms[0].pos.clone()); }, 900);
  setTimeout(() => { G.skills.cds = {}; G.skills.tryCast('fetchstorm', ms[1].pos.clone()); }, 1500);
});
await page.waitForTimeout(3500);
const { profile } = await cdp.send('Profiler.stop');
const spikes = await page.evaluate(() => window.__spikes);
await browser.close();
const self = new Map(), byId = new Map(profile.nodes.map(n => [n.id, n]));
const dt = profile.timeDeltas; const counts = new Map();
profile.samples.forEach((id, i) => counts.set(id, (counts.get(id) || 0) + (dt[i] || 0)));
for (const [id, us] of counts) { const n = byId.get(id); const cf = n.callFrame; const key = `${cf.functionName || '(anon)'}  ${(cf.url || '').split('/').slice(-2).join('/')}:${cf.lineNumber + 1}`; self.set(key, (self.get(key) || 0) + us); }
const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30);
console.log('frame spikes (t:ms):', spikes.join(' '));
for (const [k, us] of top) console.log((us / 1000).toFixed(1).padStart(8), 'ms ', k);
