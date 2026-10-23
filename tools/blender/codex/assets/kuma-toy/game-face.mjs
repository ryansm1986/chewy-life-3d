// Kuma's face states (after Mochi's builder) through the game's own Animator (the chars test page), blink / squint / mouth held fixed.
//   node tools/blender/work/codex/kuma-toy/scratch/game-face.mjs OUTDIR [views] [states]
// env: RIG_DIR=<export dir> serves kuma_toy.* from there; TILT=<rad> overrides rig.lidTilt; SQ=up,low overrides the squint
import fs from 'node:fs';
import path from 'node:path';
import { launch, sleep } from '../../../../../qa/lib.mjs';
const OUT = process.argv[2] || 'tools/blender/work/codex/kuma-toy/scratch/game'; fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE || 'http://localhost:5173';
const PITCH = process.env.PITCH || 0.62;
const VIEWS = { front: `face=0&pitch=${PITCH}`, '45l': `face=-0.785&pitch=${PITCH}`, '45r': `face=0.785&pitch=${PITCH}` };
const STATES = { rest: {}, blink: { blink: 1 }, b85: { blink: 0.85 }, squint: { eyes: 1 }, happy: { eyes: 1, happy: 1, open: 0.8 } };
const views = (process.argv[3] || Object.keys(VIEWS).join(',')).split(',');
const states = (process.argv[4] || Object.keys(STATES).join(',')).split(',');
const TILT = process.env.TILT ? +process.env.TILT : null;
const SQ = process.env.SQ ? process.env.SQ.split(',').map(Number) : null;
const { browser, page, errors } = await launch({ w: 1600, h: 900 });
if (process.env.RIG_DIR) {
  await page.route(/\/rigs\/kuma_toy[^/]*$/, route => {
    const f = path.join(process.env.RIG_DIR, new URL(route.request().url()).pathname.split('/').pop());
    route.fulfill({ path: f, headers: { 'cache-control': 'no-store' } });
  });
}
try {
  for (const v of views) {
    await page.goto(`${BASE}/?test=chars&only=kuma&${VIEWS[v]}&dist=${process.env.DIST || 3.4}&cx=0&cy=0.8&cz=0`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__ready === true && window.actors?.length, null, { timeout: 60000 });
    await sleep(page, 2500);
    const info = await page.evaluate(([tilt, sq]) => {
      const rig = window.actors[0].rig; if (tilt != null) rig.lidTilt = tilt; if (sq) rig.squint = sq;
      return { model: rig.model || 'kit', tilt: rig.lidTilt, squint: rig.squint };
    }, [TILT, SQ]);
    for (const s of states) {
      await page.evaluate(st => {
        const a = window.actors[0].anim; a.blinkT = 99; a.blinkK = 0; a.talk = 0; a.action = null; a.mood = st.happy ? 1 : 0;
        if (!a._face0) a._face0 = a.face;
        const f = a._face0;
        a.face = function (dt, A, b, open) {
          A.eyesHappy = st.eyes || 0; A.happy = st.happy || 0;
          return f.call(this, dt, A, st.blink ?? 0, st.open ?? 0);
        };
      }, STATES[s]);
      await sleep(page, 500);
      await page.screenshot({ path: `${OUT}/${v}-${s}.png`, ...(process.env.FULL ? {} : { clip: { x: +(process.env.CX || 420), y: +(process.env.CY || 440), width: 760, height: 380 } }) });
    }
    console.log('saved', v, JSON.stringify(info));
  }
} finally { if (errors.length) console.log('ERRORS', errors.slice(0, 5)); await browser.close(); }
