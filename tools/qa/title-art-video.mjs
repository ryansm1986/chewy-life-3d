// A clip of the title screen's animated painting (ui/titleArt.js), rendered frame by frame (the painting's clock and
// the CSS petals stepped together at 30 fps, so it plays smoothly however slow the capture), with a blink from each
// friend on cue. node tools/qa/title-art-video.mjs [seconds=8] [w=1280] [h=720] → tools/qa/tmp/title-art/title.webm
// (and a few stills: v-<frame>.jpg)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { launch, BASE } from './lib.mjs';
const [secs = 8, w = 1280, h = 720] = process.argv.slice(2).map(Number);
const OUT = 'tools/qa/tmp/title-art', FR = path.join(OUT, 'frames'); fs.rmSync(FR, { recursive: true, force: true }); fs.mkdirSync(FR, { recursive: true });
const FPS = 30, N = Math.round(secs * FPS);
const { browser, page } = await launch({ w, h });
await page.goto(`${BASE}/?dseed=1`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready === true && window.G?.titleActive && window.G.ui.titleScreen.art?.ready, null, { timeout: 60000 });
await page.waitForTimeout(3500); // (the logo's letters have dropped in)
await page.evaluate(() => {
  document.getElementById('fps')?.remove();
  const A = window.G.ui.titleScreen.art; A.stop(); A.on = true; A.t = 0; // (driven from here)
  A.blink = { chewy: 2.2, shadow: 4.6 }; A._b = {};
  window.__anims = document.getAnimations().filter(a => a.effect?.target?.closest?.('.title'));
  for (const a of window.__anims) a.pause();
  window.__t0 = window.__anims.map(a => a.currentTime || 0);
});
const jpgs = [];
for (let i = 0; i < N; i++) {
  await page.evaluate(([i, FPS]) => {
    const A = window.G.ui.titleScreen.art; A.t += 1 / FPS; A.draw(1 / FPS);
    window.__anims.forEach((a, k) => { a.currentTime = window.__t0[k] + (i * 1000) / FPS; });
  }, [i, FPS]);
  jpgs.push(await page.screenshot({ type: 'jpeg', quality: 94 }));
  if ([0, Math.round(2.3 * FPS), Math.round(4.7 * FPS)].includes(i)) fs.writeFileSync(path.join(OUT, `v-${i}.jpg`), jpgs.at(-1));
}
await browser.close();
const ff = path.join(os.homedir(), 'AppData/Local/ms-playwright', fs.readdirSync(path.join(os.homedir(), 'AppData/Local/ms-playwright')).find(d => d.startsWith('ffmpeg')), 'ffmpeg-win64.exe');
// (Playwright's own ffmpeg is minimal: it reads a file of JPEGs one after another, and writes VP8 WebM)
const mj = path.join(FR, 'frames.mjpeg'); fs.writeFileSync(mj, Buffer.concat(jpgs));
const r = spawnSync(ff, ['-hide_banner', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', 'file:' + mj, '-c:v', 'libvpx', '-b:v', '6M', '-qmin', '4', '-qmax', '20', '-pix_fmt', 'yuv420p', 'file:' + path.join(OUT, 'title.webm')], { encoding: 'utf8' });
console.log(r.status === 0 ? `${N} frames -> ${OUT}/title.webm` : r.stderr.split('\n').slice(-6).join('\n'));
