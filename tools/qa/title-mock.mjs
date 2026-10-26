// Title-screen art mock-ups: each direction from tools/blender/work/codex/title-art/concepts/ placed into the real
// title screen (the live 3D behind, the real logo and buttons), for the owner to choose from. A cut-out on a flat
// #00FF00 is keyed out in the page. node tools/qa/title-mock.mjs [w=1280] [h=720] → tools/qa/tmp/title-mock/<opt>.png
import fs from 'node:fs';
import { launch, BASE } from './lib.mjs';
const [w = 1280, h = 720] = process.argv.slice(2).map(Number);
const SRC = 'tools/blender/work/codex/title-art/concepts', OUT = 'tools/qa/tmp/title-mock'; fs.mkdirSync(OUT, { recursive: true });
const url = f => (fs.existsSync(`${SRC}/${f}`) ? `data:image/png;base64,${fs.readFileSync(`${SRC}/${f}`).toString('base64')}` : null);
const { browser, page } = await launch({ w, h });
async function title() {
  await page.goto(`${BASE}/?dseed=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true && window.G?.titleActive, null, { timeout: 60000 });
  await page.waitForTimeout(4200);
  await page.evaluate(() => document.getElementById('fps')?.remove());
}
const shots = { now: null, A: [url('option-A-chewy.png'), url('option-A-shadow.png')], B: url('option-B.png'), C: url('option-C.png') };
for (const [k, v] of Object.entries(shots)) {
  if (k !== 'now' && (!v || (Array.isArray(v) && !v.every(Boolean)))) { console.log('skip', k, '(no file)'); continue; }
  await title();
  await page.evaluate(async ([k, v]) => {
    const T = document.querySelector('.title');
    const key = src => new Promise(res => { // (a flat green background → transparent, with the green spill pulled off the edge)
      const im = new Image(); im.onload = () => {
        const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0);
        const d = x.getImageData(0, 0, c.width, c.height), p = d.data;
        const c0 = [p[0], p[1], p[2]], green = c0[1] > 180 && c0[0] < 110 && c0[2] < 110;
        if (green) for (let i = 0; i < p.length; i += 4) { const r = p[i], g = p[i + 1], b = p[i + 2], m = g - Math.max(r, b); if (m > 70) p[i + 3] = 0; else if (m > 20) { p[i + 3] = 255 * (1 - (m - 20) / 50); p[i + 1] = Math.max(r, b); } }
        x.putImageData(d, 0, 0); res(c.toDataURL());
      }; im.src = src;
    });
    if (k === 'A') {
      for (const [sel, src] of [['.ti-chewy', v[0]], ['.ti-shadow', v[1]]]) { const e = T.querySelector(sel); e.innerHTML = `<img src="${src}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">`; }
    } else if (k === 'B') {
      T.querySelectorAll('.ti-chewy, .ti-shadow').forEach(e => { e.style.display = 'none'; });
      const im = document.createElement('img'); im.src = await key(v);
      im.style.cssText = 'position:absolute;left:3vw;bottom:3vh;height:80vh;z-index:1;filter:drop-shadow(0 10px 18px rgba(60,30,40,.35))';
      T.insertBefore(im, T.querySelector('.ti-center'));
      T.querySelector('.ti-center').style.left = '61%';
    } else if (k === 'C') {
      T.querySelectorAll('.ti-chewy, .ti-shadow').forEach(e => { e.style.display = 'none'; });
      const im = document.createElement('img'); im.src = v;
      im.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0';
      T.insertBefore(im, T.firstChild);
    }
  }, [k, v]);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/${k}.png` });
  console.log('shot', k);
}
await browser.close();
