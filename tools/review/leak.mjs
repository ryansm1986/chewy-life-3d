// Count live DungeonMode / Scene / Monster instances after village<->dungeon round trips (Runtime.queryObjects).
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--js-flags=--expose-gc'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.routeWebSocket(/.*/, ws => { ws.onMessage(() => {}); });
await page.goto('http://localhost:5173/?fresh&nointro');
await page.waitForFunction(() => window.__ready === true, null, { timeout: 40000 });
await page.waitForTimeout(2000);
const cdp = await page.context().newCDPSession(page);
async function count(expr) {
  const { result } = await cdp.send('Runtime.evaluate', { expression: expr });
  if (!result.objectId) return 'n/a';
  const { objects } = await cdp.send('Runtime.queryObjects', { prototypeObjectId: result.objectId });
  const { result: len } = await cdp.send('Runtime.callFunctionOn', { objectId: objects.objectId, functionDeclaration: 'function(){return this.length}', returnByValue: true });
  return len.value;
}
// grab prototypes while in the dungeon, keep them on window
await page.evaluate(() => G.enterDungeon(1)); await page.waitForTimeout(7000);
await page.evaluate(() => { window.__P = { dm: Object.getPrototypeOf(G.dungeon), world: Object.getPrototypeOf(G.dungeon.world), scene: Object.getPrototypeOf(G.dungeon.world.scene), vfx: Object.getPrototypeOf(G.vfx), mon: Object.getPrototypeOf(G.dungeon.monsters[0]) }; });
for (let f = 2; f <= 4; f++) { await page.evaluate(() => G.returnToVillage()); await page.waitForTimeout(5000); await page.evaluate((f) => G.enterDungeon(f), f); await page.waitForTimeout(7000); }
await page.evaluate(() => G.returnToVillage()); await page.waitForTimeout(5000);
await page.evaluate(() => { gc(); gc(); });
const out = {};
for (const k of ['dm', 'world', 'scene', 'vfx', 'mon']) out[k] = await count(`window.__P.${k}`);
out.heapMB = await page.evaluate(() => Math.round(performance.memory.usedJSHeapSize / 1e6));
console.log('after 4 dungeon visits, back in village:', JSON.stringify(out));
await browser.close();
