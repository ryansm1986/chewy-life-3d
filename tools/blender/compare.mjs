// Before/after sheets for refined rigs (dev server on :5173).
//   node tools/blender/compare.mjs [chewy shadow ...] [--faces] [--vs=DIR] [--tag=NAME]
//   default columns: procedural (left) vs Blender-refined (right)
//   --vs=DIR   left column loads the refined skins from DIR instead (e.g. a copy of public/rigs kept as
//              tools/blender/work/prev), to compare two pipeline versions
//   --faces    face close-ups (what portraits and dialogue show) instead of full-body views + an action pose
// → <SHOT_DIR>/refine_<who>[_faces][_tag].png
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.env.SHOT_DIR || path.resolve('tools/blender/work/shots');
fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE || 'http://localhost:5173';
const args = process.argv.slice(2);
const flag = k => args.find(a => a.startsWith('--' + k))?.split('=')[1] ?? (args.includes('--' + k) ? true : null);
const who = args.filter(a => !a.startsWith('--'));
if (!who.length) who.push('chewy', 'shadow');
const faces = !!flag('faces'), vs = flag('vs'), tag = flag('tag');
const COLS = vs ? [['before', `&rigdir=${vs}`], ['after', '']] : [['procedural', '&procrigs'], ['blender refined', '']];
// [label, camera, frozen pose]; distances for a 1.2 m humanoid, scaled per character; cy = focus height
const VIEWS = faces ? [ // a narrow lens from the usual distance (the game camera's near plane is 1 m)
  ['face', { dist: 3, fov: 8, pitch: 0.12, yaw: 0.785 }, null],
  ['face34', { dist: 3, fov: 8, pitch: 0.15, yaw: 1.3 }, null],
  ['faceside', { dist: 3, fov: 8.5, pitch: 0.2, yaw: 2.1 }, null],
] : [
  ['front', { dist: 3.2, pitch: 0.2, yaw: 0.785, cy: 0.62 }, null],
  ['side', { dist: 3.2, pitch: 0.3, yaw: 2.2, cy: 0.62 }, null],
  ['back', { dist: 3.2, pitch: 0.35, yaw: 3.9, cy: 0.62 }, null],
  ['action', { dist: 3.4, pitch: 0.3, yaw: 0.3, cy: 0.62 }, 'act'],
];
const SIZE = { shadow: 0.75 };
const HEAD = { chewy: { k: 1, at: [0, 0.81, 0] }, shadow: { k: 0.8, at: [0.141, 0.46, 0.141] } }; // head centre (rig faces 45°)

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const files = [];
for (const w of who) {
  for (const [label, v, pose] of VIEWS) {
    const H = HEAD[w] || HEAD.chewy, k = faces ? H.k : SIZE[w] || 1;
    const [cx, cy, cz] = faces ? H.at : [0, v.cy * k, 0];
    const q = `&dist=${v.dist}&pitch=${v.pitch}&yaw=${v.yaw}&cx=${cx}&cy=${cy}&cz=${cz}${faces ? '&off=tilt' : ''}`.replace(`dist=${v.dist}`, `dist=${v.dist * (faces ? 1 : k)}`);
    for (const [col, extra] of COLS) {
      const page = await browser.newPage({ viewport: { width: 700, height: 700 } });
      await page.routeWebSocket(/.*/, ws => { ws.onMessage(() => {}); });
      page.on('pageerror', e => console.log('[pageerror]', e.message));
      page.on('console', m => { if (m.type() === 'error' || /\[rigs\]/.test(m.text())) console.log('[console]', m.text()); });
      await page.goto(`${BASE}/?test=chars&only=${w}${q}${extra}`, { waitUntil: 'load' });
      await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
      await page.evaluate(([pose, w, fov]) => {
        if (fov) { const c = window.stage.engine.camera; c.fov = fov; c.updateProjectionMatrix(); }
        const a = window.actors[0];
        a.anim.t = 0.5; a.anim.blinkT = 99;
        if (pose) { a.anim.play(w === 'shadow' ? 'bark' : 'swing'); a.anim.update(w === 'shadow' ? 0.14 : 0.2, a.rig.root.position); }
        a.anim.update(0, a.rig.root.position);
        a.anim.update = () => {}; // freeze the pose so both renders match
      }, [pose, w, faces ? v.fov * (HEAD[w] || HEAD.chewy).k : 0]);
      await page.waitForTimeout(900);
      const f = path.join(OUT, `cmp_${w}_${label}_${col.replace(/\W/g, '')}.png`);
      await page.screenshot({ path: f });
      files.push(f);
      await page.close();
    }
  }
  const py = `
import sys
from PIL import Image, ImageDraw
out, a, b = sys.argv[1:4]; fs = sys.argv[4:]
crop = (40, 40, 660, 660) if ${faces ? 'True' : 'False'} else (140, 30, 560, 670)
ims = [Image.open(f).crop(crop) for f in fs]
w, h = ims[0].size; rows = len(ims) // 2
sheet = Image.new('RGB', (w * 2, h * rows), 'white')
for i, im in enumerate(ims): sheet.paste(im, ((i % 2) * w, (i // 2) * h))
d = ImageDraw.Draw(sheet)
for r in range(rows):
  d.text((10, r * h + 8), a, fill='black'); d.text((w + 10, r * h + 8), b, fill='black')
sheet.save(out)
print('saved', out)
`;
  const sheet = path.join(OUT, `refine_${w}${faces ? '_faces' : ''}${tag ? '_' + tag : ''}.png`);
  execFileSync('python', ['-c', py, sheet, COLS[0][0], COLS[1][0], ...files.splice(0)], { stdio: 'inherit' });
}
await browser.close();
