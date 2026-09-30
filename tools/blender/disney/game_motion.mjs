// In-game motion check for the Disney Chewy: talking, barking and walking frames from the character test page.
//   node tools/blender/disney/game_motion.mjs  → <SHOT_DIR>/disney_motion.png
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.env.SHOT_DIR || path.resolve('tools/blender/work/shots');
fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE || 'http://localhost:5173';
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const files = [];
async function run(label, q, setup, times) {
  const page = await browser.newPage({ viewport: { width: 600, height: 600 } });
  await page.routeWebSocket(/.*/, ws => { ws.onMessage(() => {}); });
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.goto(`${BASE}/?test=chars&only=chewy${q}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
  await page.evaluate(setup);
  let last = 0;
  for (const t of times) {
    await page.waitForTimeout(Math.max(0, (t - last) * 1000)); last = t;
    const f = path.join(OUT, `motion_${label}_${t}.png`); await page.screenshot({ path: f }); files.push(f);
  }
  await page.close();
}
const face = '&dist=3&pitch=0.12&yaw=0.785&cx=0&cy=0.85&cz=0';
await run('talk', face, 'actors[0].anim.talk = 1; actors[0].anim.mood = 1', [0.3, 0.45, 0.6, 0.75]);
await run('bark', face, 'setInterval(() => actors[0].anim.play("bark"), 900)', [0.2, 0.35, 0.5, 0.8]);
await run('walk', '&walk=1&dist=4.5&pitch=0.3', '0', [0.4, 0.55, 0.7, 0.85]);
execFileSync('python', ['-c', `
import sys
from PIL import Image
fs = sys.argv[2:]; ims = [Image.open(f).crop((75, 40, 525, 560)) for f in fs]
w, h = ims[0].size; cols = 4; rows = (len(ims) + cols - 1) // cols
s = Image.new('RGB', (w * cols, h * rows), 'white')
for i, im in enumerate(ims): s.paste(im, ((i % cols) * w, (i // cols) * h))
s.save(sys.argv[1]); print('saved', sys.argv[1])
`, path.join(OUT, 'disney_motion.png'), ...files], { stdio: 'inherit' });
await browser.close();
