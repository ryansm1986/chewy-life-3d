// Look review for the sprint run pose (actors/sprint.js, animator.js poseBiped; docs/ZONES.md §9).
// For each hero: a walk and a sprint, running screen-right (D) and screen-left (A), at the game camera, plus a closer
// crop (--side: the close crop from a low camera, to judge the profile). Writes PNGs to $SHOT_DIR (default: ./shots-sprint).   usage: node tools/qa/sprint-shots.mjs [chewy moka poe]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE || 'http://localhost:5173';
const OUT = process.env.SHOT_DIR || path.resolve('shots-sprint');
fs.mkdirSync(OUT, { recursive: true });
const heroes = process.argv.slice(2).filter(a => !a.startsWith('--')), SIDE = process.argv.includes('--side'); // --side: a low camera for the profile (pose review only)
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1.5 });
const page = await ctx.newPage();
await page.routeWebSocket(/.*/, ws => { ws.onMessage(() => {}); });
const errs = []; page.on('pageerror', e => errs.push(e.message));
for (const hero of heroes.length ? heroes : ['chewy', 'moka', 'poe']) {
  await page.goto(`${BASE}/?fresh&nointro&notut&hour=10&dseed=1&hero=${hero}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true && window.G?.player, null, { timeout: 60000 });
  await page.waitForTimeout(1200);
  await page.evaluate(() => { const G = window.G; G.state.flags.hints = { sprint: true }; G.ui?.toasts?.retire?.(0); });
  for (const [key, side] of [['d', 'right'], ['a', 'left']]) {
    for (const [sprint, close] of [[false, false], [true, false], [false, true], [true, true]]) {
      // across the plaza, screen-right or screen-left (the hero in profile), Shadow just behind
      await page.evaluate(([k, dist, side]) => {
        const G = window.G, W = G.world, { f, r } = G.engine.rig.groundAxes(), d = k === 'd' ? r.clone() : r.clone().negate(), c = W.landmarks.plaza;
        let x = c.x - d.x * 7, z = c.z + 3 - d.z * 7;
        if (side) { // the low camera needs open lawn along the run and on the camera side of it
          const open = (px, pz) => W.walkable(px, pz) && !W.collision.solidAt(px, pz, 0.8) && !G.sim.buildingAt(px, pz);
          const clear = (x0, z0) => { for (let s = -2; s <= 16; s += 0.5) for (const o of [0, 2, 4]) if (!open(x0 + d.x * s - f.x * o, z0 + d.z * s - f.z * o)) return false; return true; };
          search: for (let rr = 0; rr < 90; rr += 2) for (let a = 0; a < 16; a++) { const px = W.landmarks.spawn.x + Math.cos(a / 8 * Math.PI) * rr, pz = W.landmarks.spawn.z + Math.sin(a / 8 * Math.PI) * rr; if (clear(px, pz)) { x = px; z = pz; break search; } }
        }
        G.player.setPos(x, z); G.companion.setPos(x - d.x * 1.5, z - d.z * 1.5); G.engine.rig.distTarget = dist; if (side) G.engine.rig.pitch = close ? 0.12 : 0.62; G.engine.rig.focus.copy(G.player.pos); G.engine.rig.snap();
      }, [key, close ? (SIDE ? 7 : 9) : 22, SIDE && close]);
      await page.waitForTimeout(300);
      if (sprint) await page.keyboard.down('Shift');
      await page.keyboard.down(key);
      await page.waitForFunction(s => { const P = window.G.player; return P.anim.speed > 3.8 && (!s || P.anim.sprintAmt > 0.9); }, sprint, { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(250);
      for (let i = 0; i < 2; i++) {
        const c = await page.evaluate(() => { const G = window.G, p = G.player.pos.clone(); p.y += 0.55; p.project(G.engine.camera); return { x: (p.x * 0.5 + 0.5) * innerWidth, y: (-p.y * 0.5 + 0.5) * innerHeight, v: +G.player.moveSpeed.toFixed(2) }; });
        const tag = `${hero}-${sprint ? 'sprint' : 'walk'}-${side}${close ? '-close' : ''}-${i}`;
        await page.screenshot({ path: path.join(OUT, `${tag}-game.png`) });
        const w = close ? 560 : 340, h = close ? 520 : 300;
        await page.screenshot({ path: path.join(OUT, `${tag}-crop.png`), clip: { x: Math.max(0, c.x - w / 2), y: Math.max(0, c.y - h / 2 + (close ? 10 : -10)), width: w, height: h } });
        console.log('saved', tag, c.v, 'm/s');
        await page.waitForTimeout(110);
      }
      await page.keyboard.up(key); if (sprint) await page.keyboard.up('Shift');
      await page.waitForTimeout(400);
    }
  }
}
if (errs.length) console.log('page errors:', errs.slice(0, 10).join(' | '));
await browser.close();
