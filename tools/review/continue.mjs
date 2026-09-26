import { chromium } from 'playwright-core';
const SHOT = 'C:/Users/there/AppData/Local/Temp/claude/D--projects-chewy-life-3d/8589dfce-d448-4273-9d64-a50029bd572d/scratchpad/review/';
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.routeWebSocket(/.*/, ws => { ws.onMessage(() => {}); });
const logs = []; page.on('pageerror', e => logs.push('[pageerror] ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) logs.push('[error] ' + m.text()); });
await page.goto('http://localhost:5173/?fresh&nointro'); await page.waitForFunction(() => window.__ready === true, null, { timeout: 40000 }); await page.waitForTimeout(1500);
await page.evaluate(() => { G.actions.addCoins(333); G.save(); });
await page.goto('http://localhost:5173/'); await page.waitForFunction(() => window.__ready === true, null, { timeout: 40000 }); await page.waitForTimeout(2500);
await page.screenshot({ path: SHOT + '45_title_with_save.png' });
const btns = await page.evaluate(() => [...document.querySelectorAll('button')].filter(b => b.offsetParent).map(b => { const r = b.getBoundingClientRect(); return [b.innerText.trim(), Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2), b.disabled]; }));
console.log(JSON.stringify(btns));
const set = btns.find(b => /Settings/.test(b[0])); if (set) { await page.mouse.click(set[1], set[2]); await page.waitForTimeout(1000); await page.screenshot({ path: SHOT + '45b_title_settings.png' }); await page.keyboard.press('Escape'); await page.waitForTimeout(600); }
const c = btns.find(b => /Continue/.test(b[0])); await page.mouse.click(c[1], c[2]); await page.waitForTimeout(4000);
await page.screenshot({ path: SHOT + '45c_continued.png' });
console.log(await page.evaluate(() => JSON.stringify({ coins: G.state.coins, title: G.titleActive, locked: G.player.controlLocked })));
console.log(logs.join('\n'));
await browser.close();
