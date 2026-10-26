// The title's animated painting (ui/titleArt.js, ROADMAP TA-1): the title screen as it shows, a close crop of the
// friends shut mid-blink, frames over a few seconds (the motion), and the stats. node tools/qa/title-art-shots.mjs [w] [h]
// → tools/qa/tmp/title-art/*.png
import fs from 'node:fs';
import { launch, BASE } from './lib.mjs';
const [w = 1280, h = 720] = process.argv.slice(2).map(Number);
const OUT = 'tools/qa/tmp/title-art'; fs.mkdirSync(OUT, { recursive: true });
const { browser, page, errors } = await launch({ w, h });
await page.goto(`${BASE}/?dseed=1${process.env.QA_QS ? '&' + process.env.QA_QS : ''}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready === true && window.G?.titleActive && window.G.ui.titleScreen.art?.ready, null, { timeout: 60000 });
await page.waitForTimeout(3500);
await page.evaluate(() => document.getElementById('fps')?.remove());
await page.screenshot({ path: `${OUT}/title.png` });
for (let i = 0; i < 4; i++) { await page.waitForTimeout(450); await page.screenshot({ path: `${OUT}/f${i}.png`, clip: { x: w * 0.55, y: h * 0.3, width: w * 0.45, height: h * 0.45 } }); }
// a blink, frozen shut
const eyes = await page.evaluate(() => { const A = window.G.ui.titleScreen.art; A.holdShut = 1; return { covers: A.covers, render3d: !A.covers }; });
await page.waitForTimeout(40);
const box = { x: 0, y: h * 0.45, width: w * 0.42, height: h * 0.5 };
await page.screenshot({ path: `${OUT}/blink.png`, clip: box });
await page.evaluate(() => { const A = window.G.ui.titleScreen.art; A.holdShut = 0.5; }); await page.waitForTimeout(60);
await page.screenshot({ path: `${OUT}/half.png`, clip: box });
await page.evaluate(() => { window.G.ui.titleScreen.art.holdShut = null; });
console.log(JSON.stringify({ eyes, errors: errors.slice(0, 5) }));
await browser.close();
