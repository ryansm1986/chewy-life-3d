import { chromium } from 'playwright-core';
const SHOT = 'C:/Users/there/AppData/Local/Temp/claude/D--projects-chewy-life-3d/8589dfce-d448-4273-9d64-a50029bd572d/scratchpad/review/';
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.routeWebSocket(/.*/, ws => { ws.onMessage(() => {}); });
const t0 = Date.now();
page.goto('http://localhost:5173/');
for (const ms of [1500, 3500, 5500]) { await page.waitForTimeout(ms - (Date.now() - t0) > 0 ? ms - (Date.now() - t0) : 0); await page.screenshot({ path: SHOT + `46_boot_${ms}.png` }).catch(() => {}); console.log('snap', ms); }
await page.waitForFunction(() => window.__ready === true, null, { timeout: 40000 }); console.log('ready at', Date.now() - t0);
await browser.close();
