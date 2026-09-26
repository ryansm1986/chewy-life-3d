// Save/load round-trip test: new game -> mutate -> save -> reload (continue) -> compare
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.routeWebSocket(/.*/, ws => { ws.onMessage(() => {}); });
const logs = []; page.on('pageerror', e => logs.push('[pageerror] ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) logs.push('[error] ' + m.text()); });
await page.goto('http://localhost:5173/?fresh&nointro');
await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
await page.waitForTimeout(1500);
const before = await page.evaluate(() => {
  G.actions.addCoins(777); G.actions.addXp(500); G.state.player.skills.woof = 2;
  G.sim.place('bench', 70, 52, 0, { free: true, silent: true });
  G.save();
  return { coins: G.state.coins, lvl: G.state.player.lvl, n: G.state.village.buildings.length, quests: G.state.quests.active.map(q => q.id) };
});
await page.goto('http://localhost:5173/?notitle');
await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
await page.waitForTimeout(1500);
const after = await page.evaluate(() => ({ coins: G.state.coins, lvl: G.state.player.lvl, n: G.state.village.buildings.length, quests: G.state.quests.active.map(q => q.id), rendered: G.sim.list.length }));
console.log('before', JSON.stringify(before)); console.log('after ', JSON.stringify(after));
console.log(before.coins === after.coins && before.n === after.n && after.rendered === after.n ? 'PASS' : 'FAIL');
if (logs.length) console.log(logs.join('\n'));
await browser.close();
