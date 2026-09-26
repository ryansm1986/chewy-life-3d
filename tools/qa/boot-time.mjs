// Boot-to-ready time: dev server (5173) vs a production preview (4173, if running).
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });
for (const base of ['http://localhost:5173', 'http://localhost:4173']) {
  for (let i = 0; i < 2; i++) {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    await page.routeWebSocket(/.*/, ws => { ws.onMessage(() => {}); });
    const t0 = Date.now();
    await page.goto(base + '/?fresh&nointro');
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
    const marks = await page.evaluate(() => performance.getEntriesByType('navigation')[0]?.domContentLoadedEventEnd | 0);
    console.log(base, 'run', i, 'ready in', Date.now() - t0, 'ms (DOMContentLoaded', marks, 'ms)');
    await page.close();
  }
}
await browser.close();
