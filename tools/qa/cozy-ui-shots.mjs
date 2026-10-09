// The cozy path's UI look review on the desktop (docs/COZY.md §10; ROADMAP CZ-10): every cozy surface with something in
// it (tools/qa/cozy-ui-lib.mjs seeds the state), at the mouse's 1600×900 and 1280×720, plus the hover cases: the HUD chip's
// tooltip, the hero wheel with an away hero, a mini's tooltip. The phone, the iPad and the Deck run the same scenes inside
// tools/qa/mobile-ui.mjs and deck-ui.mjs (their audits: the text floor, the targets, panels cut off).
//   usage: node tools/qa/cozy-ui-shots.mjs [view…]   SIZES=1600x900,1280x720   SHOT_DIR (default tools/qa/tmp/cozy-ui)
import fs from 'node:fs';
import path from 'node:path';
import { launch, boot, sleep } from './lib.mjs';
import { seedCozy, cozyScenes, quietUi } from './cozy-ui-lib.mjs';

const OUT = process.env.SHOT_DIR || path.resolve('tools/qa/tmp/cozy-ui');
const ONLY = new Set(process.argv.slice(2).filter(a => !a.startsWith('--')));
const SIZES = (process.env.SIZES || '1600x900,1280x720').split(',').map(s => s.split('x').map(Number));
fs.mkdirSync(OUT, { recursive: true });
let bad = 0;
for (const [w, h] of SIZES) {
  const { browser, page, errors } = await launch({ w, h });
  const ev = (f, a) => page.evaluate(f, a);
  const tag = `${w}`;
  try {
    await boot(page, 'fresh&nointro&notut&hour=10');
    const seed = await seedCozy(page);
    console.log(`${w}×${h} seed`, JSON.stringify(seed));
    await quietUi(page);
    for (const s of [...cozyScenes(ev), ...extra(ev, page)]) {
      if (ONLY.size && !ONLY.has(s.name)) continue;
      try { await s.open(); await sleep(page, 700); await quietUi(page, 4000); await page.screenshot({ path: path.join(OUT, `${s.name}-${tag}.png`) }); console.log('  shot', s.name); }
      catch (e) { console.log(`!! ${s.name}: ${String(e.message || e).split('\n')[0]}`); bad++; }
      try { if (s.close) await s.close(); else await ev(() => { const U = window.G.ui; for (const n of [...U._order]) U.close(n); }); await sleep(page, 300); } catch (e) { /* next */ }
    }
  } catch (e) { console.log('!! run:', e.message); bad++; }
  if (errors.length) { console.log('page errors:', [...new Set(errors)].slice(0, 6).join('\n')); bad++; }
  await browser.close();
}
console.log(bad ? 'FAIL cozy-ui-shots' : `PASS cozy-ui-shots → ${OUT}`);
process.exit(bad ? 1 : 0);

function extra(ev, page) {
  return [
    { name: 'cozy-chip-tip', open: async () => { const b = await page.$('.cz-chip.on'); if (b) await b.hover(); await sleep(page, 500); }, close: async () => { await page.mouse.move(5, 5); } },
    { name: 'cozy-mini-tip', open: async () => { const b = await page.$('.hud .hsw.away'); if (b) await b.hover(); await sleep(page, 500); }, close: async () => { await page.mouse.move(5, 5); } },
    { name: 'cozy-wheel', open: async () => { await page.mouse.move(800, 450); await page.keyboard.down('Tab'); await sleep(page, 700); }, close: async () => { await ev(() => window.G.heroes.pickFromWheel(null)); await page.keyboard.up('Tab'); await sleep(page, 300); } },
  ];
}
