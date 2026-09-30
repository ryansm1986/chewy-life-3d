// Unfiltered console capture + boot timing across village, dungeon, boss, build mode.
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.routeWebSocket(/.*/, ws => { ws.onMessage(() => {}); });
const counts = {}; const samples = {};
page.on('console', m => { const t = m.type(); if (t === 'log' || t === 'debug' || t === 'info') return; const k = t + ':' + m.text().slice(0, 90); counts[k] = (counts[k] || 0) + 1; });
page.on('pageerror', e => { const k = 'pageerror:' + e.message.slice(0, 120); counts[k] = (counts[k] || 0) + 1; });
for (let run = 0; run < 2; run++) {
  await page.goto('http://localhost:5173/?fresh&nointro&hour=10', { waitUntil: 'load' });
  await page.evaluate(() => { window.__t0 = performance.now(); });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 45000, polling: 50 });
  const t = await page.evaluate(() => ({ ready: Math.round(performance.now()), dcl: Math.round(performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd), load: Math.round(performance.getEntriesByType('navigation')[0].loadEventEnd), res: performance.getEntriesByType('resource').length }));
  console.log('boot run', run, JSON.stringify(t));
}
await page.waitForTimeout(2000);
await page.keyboard.press('b'); await page.waitForTimeout(1500); await page.keyboard.press('Escape'); await page.keyboard.press('b'); await page.waitForTimeout(500);
await page.evaluate(() => { G.state.flags.burrowTut = true; G.enterDungeon(5); });
await page.waitForTimeout(5000);
await page.evaluate(() => { if (G.ui.dlg.active) G.ui.dlg.finish(-1); const b = G.dungeon.boss; G.player.setPos(b.pos.x + 3, b.pos.z + 3); G.state.player.lvl = 30; G.actions.recompute(); for (let i = 0; i < 5; i++) G.skills.tryCast('chomp', b.pos.clone(), b); });
await page.waitForTimeout(4000);
await page.evaluate(() => G.returnToVillage()); await page.waitForTimeout(3000);
console.log(JSON.stringify(counts, null, 1));
await browser.close();
