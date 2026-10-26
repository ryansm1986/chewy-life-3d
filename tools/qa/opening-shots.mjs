// The opening's filmstrip (world/opening.js, ROADMAP CN-1): frames from each shot at the game's own screen size, frozen
// on each moment (op.hold), then a contact sheet. node tools/qa/opening-shots.mjs [w=1280] [h=720]
// → tools/qa/tmp/opening/<shot>-<t>.png and sheet.png
import fs from 'node:fs';
import { launch, boot } from './lib.mjs';
const [w = 1280, h = 720] = process.argv.slice(2).map(Number);
const OUT = 'tools/qa/tmp/opening'; fs.mkdirSync(OUT, { recursive: true });
const { browser, page } = await launch({ w, h });
await boot(page, 'fresh&cine&notut');
await page.waitForFunction(() => window.G.opening?.active, null, { timeout: 15000 });
await page.evaluate(() => { window.G.opening.hold = true; document.getElementById('fps')?.remove(); });
const plan = await page.evaluate(() => window.G.opening.shots.map(s => ({ name: s.name, D: s.keys.at(-1).t, title: s.title || null })));
const files = [];
for (const [i, s] of plan.entries()) {
  const ts = s.name === 'town' ? [0.6, 2.5, 4.2, 6.5, 8.2, 9.4, s.D - 0.1] : [0.8, s.D / 2, s.D - 0.7];
  for (const t of ts) {
    await page.evaluate(([i, t]) => { const op = window.G.opening; op.i = i; op.t = t; }, [i, t]);
    await page.waitForTimeout(t >= 2.5 && s.name === 'town' && t < 4.7 ? 2600 : 700); // (the title's letters take ~1.9 s)
    const f = `${OUT}/${s.name}-${t.toFixed(1)}.png`; await page.screenshot({ path: f }); files.push(f);
  }
}
const imgs = files.map(f => `<img src="data:image/png;base64,${fs.readFileSync(f).toString('base64')}" style="width:420px;display:block"><div style="color:#ccc;font:12px monospace;margin:2px 0 8px">${f.split('/').pop()}</div>`);
await page.setViewportSize({ width: 1290, height: 1000 });
await page.setContent(`<body style="margin:0;background:#222;display:grid;grid-template-columns:repeat(3,430px)">${imgs.map(x => `<div>${x}</div>`).join('')}</body>`);
await page.screenshot({ path: `${OUT}/sheet.png`, fullPage: true });
await browser.close();
console.log(files.length, 'frames →', OUT);
