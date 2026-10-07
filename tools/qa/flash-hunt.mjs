// Black-flash hunt (ROADMAP R-7) on the production bundle: scripted sessions with the render health probes
// (src/gfx/renderHealth.js) reading every frame back. Reports per session: frames, NaN / Inf texels per stage (scene =
// the raw scene render, ao = the AO composite, tone = after bloom + tone map), flash frames (a sudden luminance drop or
// lit blocks turning black, iris transitions excluded), and the CPU scan's singular matrices (zero-scale meshes,
// instances, bones). Saves PNGs of the first NaN frames (magenta) and flash frames to SHOT_DIR.
//
// Sessions: cottage-day / cottage-night (a walk round Chewy's Cottage, in through the door, about the room, out, another
// lap), burrow-<hero> (a dense Burrow fight: packs round the hero, kills, charged casts, Poe's clones), zone-<hero> (the
// Bamboo Depths floor 1 with its own 120-160, the hero fighting through it).
//
// usage: node tools/qa/flash-hunt.mjs [SESSIONS=cottage-day,cottage-night,burrow,zone] [HEROES=chewy,moka,poe]
//        [MODE=paint|spread|stats] [QS=noinst,...] [SECS=14] [SHOT_DIR=dir] [BASE=http://localhost:5173 (skip the build)]
//   MODE paint (?nanprobe): NaN painted magenta where it first shows; spread (?nanprobe=spread): painted after the tone
//   map (the poisoned area); stats (?rh): the true image, luminance flashes only. QS: extra flags for bisecting
//   (noinst, nocull, nogrid, nolod, off=ao|bloom|grade|dark ...). Exit 1 when any NaN / flash frame is found.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { startProd, CHROME, CHROME_ARGS } from './prod-server.mjs';
import { huntSession } from './health-lib.mjs';

const env = process.env;
const MODE = env.MODE || 'paint';
const SECS = +(env.SECS || 14);
const HEROES = (env.HEROES || 'chewy,moka,poe').split(',');
const SESS = (env.SESSIONS || 'cottage-day,cottage-night,burrow,zone').split(',').flatMap(s => (s === 'burrow' || s === 'zone' ? HEROES.map(h => `${s}-${h}`) : [s]));
const QS = env.QS ? '&' + env.QS.split(',').join('&') : '';
const SHOT_DIR = env.SHOT_DIR || path.join(process.cwd(), 'tools/qa/tmp/flash-hunt');
fs.mkdirSync(SHOT_DIR, { recursive: true });
const PROBE_Q = MODE === 'stats' ? 'rh' : MODE === 'spread' ? 'nanprobe=spread' : 'nanprobe';

const server = env.BASE ? null : await startProd();
const BASE = env.BASE || server.url;
if (server) console.log(`(production bundle built in ${(server.buildMs / 1000).toFixed(1)} s, served at ${BASE})`);
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: CHROME_ARGS });

// ---------------------------------------------------------------- run
const rows = [];
let failed = 0;
for (const name of SESS) {
  const hero = name.split('-')[1];
  const hour = name === 'cottage-night' ? 22.5 : name === 'cottage-day' ? 12 : 10;
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  await page.routeWebSocket(/.*/, ws => { ws.onMessage(() => {}); }); // (no HMR reloads mid-session on a dev server)
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errs.push(m.text()); });
  const q = `/?fresh&nointro&notut&dseed=1&hour=${hour}&${PROBE_Q}${['chewy', 'moka', 'poe'].includes(hero) ? '&hero=' + hero : ''}${QS}`;
  await page.goto(BASE + q);
  await page.waitForFunction(() => window.__ready === true && window.G?.player, null, { timeout: 90000 });
  await page.waitForTimeout(1500);
  let r;
  try { r = await huntSession(page, name, { secs: SECS, shotDir: SHOT_DIR }); } catch (e) { r = { error: String(e.message || e).slice(0, 300) }; }
  r.errors = [...new Set(errs)].slice(0, 4);
  const S = r.stage || {};
  const nan = (S.scene?.bad || 0) + (S.ao?.bad || 0) + (S.tone?.bad || 0);
  const flashes = (r.flashes || []).length;
  const ok = !r.error && !nan && !flashes;
  if (!ok) failed++;
  rows.push({ name, ...r });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(14)} frames ${r.frames ?? '-'}  NaN texels scene ${S.scene?.bad || 0} (${S.scene?.badFrames || 0} fr) · ao ${S.ao?.bad || 0} (${S.ao?.badFrames || 0} fr) · tone ${S.tone?.bad || 0} (${S.tone?.badFrames || 0} fr)  flashes ${flashes}${r.error ? '  ERROR ' + r.error : ''}`);
  if (r.fight) console.log(`      fight: ${r.fight.casts} casts (${r.fight.charged} charged), ${r.fight.kills} kills, ${r.fight.n} monsters left${r.fight.err ? ', ERR ' + r.fight.err : ''}`);
  if (r.scan) console.log(`      singular matrices in ${r.scan.frames} frames: ${Object.entries(r.scan.hits).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => `${k} ×${n}`).join(', ')}`);
  if (r.firstBad?.length) console.log(`      first NaN frames: ${JSON.stringify(r.firstBad)}`);
  for (const f of (r.flashes || []).slice(0, 4)) console.log(`      flash frame ${f.i} [${f.tag}] ${f.why}: lum ${f.out} drop ${f.drop} black ${f.black}`);
  if (r.errors.length) console.log(`      page errors: ${r.errors.join(' | ').slice(0, 300)}`);
  await ctx.close();
}
fs.writeFileSync(path.join(SHOT_DIR, `flash-hunt-${MODE}${env.QS ? '-' + env.QS.replace(/[^a-z0-9]+/gi, '_') : ''}.json`), JSON.stringify(rows, null, 1));
await browser.close();
if (server) await server.close();
console.log(failed ? `== flash hunt (${MODE}${QS}): ${failed} session(s) with NaN or flash frames` : `== flash hunt (${MODE}${QS}): clean`);
process.exit(failed ? 1 : 0);
