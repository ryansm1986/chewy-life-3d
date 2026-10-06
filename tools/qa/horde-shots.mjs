// Before / after screenshots for the horde rendering work (ROADMAP Z-B1 / Z-B2): the same frozen monster scenes from two
// builds, so the instanced path can be compared with the per-mesh path (or an older build) pixel for pixel.
//
// Per world (a Burrow floor, a region): the floor's own monsters are removed, the hero and Shadow step 40 m away, then a
// lineup is spawned at fixed spots — every kind × variant, a champion and a unique row (coloured contours), a mid-flash
// row, the skinned humanoids — plus glowing projectiles hanging in the air and a far 120-monster crowd. Math.random is
// reseeded before every spawn (three's uuid draws keep the real one: builds that make different numbers of objects
// would shift the stream), time is frozen at one shared value (timeScale 0, engine.time 100: wind, water) and the AI is
// held (stunned, no cooldowns), so two builds render the same poses. Shots: the lineup close, at the game camera, and
// the crowd from far, rendered &raw (no post: its AO / grain noise differs run to run; POST=1 keeps it). With two
// bases it diffs each pair (channels > 24/255) and writes diff images (red = changed). What may differ: particles
// (sparkles, embers, shed leaves) and, since Z-B1, the dust bunnies' fluff (3 cached random layouts per variant).
//
// usage: node tools/qa/horde-shots.mjs [OUT=dir] [BASE=http://localhost:5173] [BASE2=http://localhost:5199] [QS=noinst]
//   (BASE2: the "before" build; the summary lists the share of pixels that differ per shot)
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.env.OUT || path.join(process.env.TEMP || '.', 'horde-shots');
const BASES = [process.env.BASE || 'http://localhost:5173', process.env.BASE2].filter(Boolean);
const QS = (process.env.QS ? '&' + process.env.QS : '') + (process.env.POST ? '' : '&raw'); // (&raw: no post, whose AO / grain noise differs run to run; POST=1 keeps it)
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });

const LINEUP = { burrow: ['mochi', 'dustbunny', 'kinoko', 'lantern', 'kasa', 'wisp', 'oni', 'tanuki'], region: ['takenoko', 'kodama', 'kamaitachi', 'kuri', 'kakashi', 'momijiWisp', 'yukiwarashi', 'yukidaruma', 'tsurara', 'kappa', 'heikegani', 'kurage'] };

async function shoot(base, tag, world) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  await page.routeWebSocket(/.*/, ws => { ws.onMessage(() => {}); });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}/?fresh&nointro&notut&noui&dseed=1&hour=10${QS}`);
  await page.waitForFunction(() => window.__ready === true && window.G?.player, null, { timeout: 60000 });
  await page.evaluate((w) => { const G = window.G; G.state.flags.burrowTut = true; if (w === 'region') G.enterRegion('bamboo'); else G.enterDungeon(3); }, world);
  await page.waitForFunction(() => window.G?.mode === 'dungeon' && window.G.dungeon?.monsters?.length && !window.G.ui?.iris?.active, null, { timeout: 40000 });
  await page.waitForTimeout(2500);
  const info = await page.evaluate(({ kinds }) => {
    const G = window.G, D = G.dungeon, E = G.engine, P = G.player;
    // (three's generateUUID draws Math.random for every new geometry / material / object: builds that make different
    //  numbers of them would shift a shared stream, so ids keep the real generator and the looks get the seeded one)
    let seed = 1; const real = Math.random;
    const rnd = () => { if (new Error().stack.includes('generateUUID')) return real(); seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const MON = D.monsters[0].constructor;
    D.warmMonsters?.([]); // (the Horde is created before the reseeded spawns: its floor warm-up draws random numbers)
    for (const m of [...D.monsters]) { D.combat.remove(m); m.alive = false; m.dispose(); }
    D.monsters.length = 0;
    E.timeScale = 0; E.time = 100; // freeze: every update runs with dt = 0, wind / water shaders at one shared time
    // the hero and Shadow step well away (no shoves, no companion swings) — the camera follows G.heroFocus below
    const c0 = P.pos.clone(), S = G.companion; if (S) { D.combat.remove(S); S.setPos?.(c0.x - 40, c0.z - 1); }
    P.setPos(c0.x - 40, c0.z);
    const at = (x, z, id, o) => { seed = 7919 * (D.monsters.length + 1); Math.random = rnd; const m = new MON(D, id, { level: 5, x, z, ...o }); D.monsters.push(m); D.combat.add(m); m.facing = Math.PI * 0.25; m.cd = 99; m.status.stun = 99; m.anim.t = 1.3; if (m.kit) m.kit.t = 1.3; return m; };
    const c = c0;
    const ids = kinds;
    const out = { lineup: [], crowd: 0 };
    ids.forEach((id, i) => { for (let v = 0; v < 3; v++) { const m = at(c.x - 7 + i * 1.75, c.z - 3 + v * 1.6, id, { variant: v }); out.lineup.push(id + v); } });
    ids.forEach((id, i) => { at(c.x - 7 + i * 1.75, c.z + 2.0, id, { rank: 'champion' }); at(c.x - 7 + i * 1.75, c.z + 3.7, id, { rank: 'unique' }); });
    ids.forEach((id, i) => { const m = at(c.x - 7 + i * 1.75, c.z + 5.4, id, {}); m.anim.flash = 0.6; m.anim.flashAmp = 0.9; if (m.kit) m.kit.flash = 0.6; });
    // projectiles hanging in the air in front of the lineup (their glow sprites; trails off: they'd pile up while frozen)
    ['fireball', 'foxfire', 'spark', 'bone', 'ball', 'blaze', 'acorn', 'moonball'].forEach((kind, i) => {
      const p = D.combat.spawn({ team: 'enemy', kind, pos: new c.constructor(c.x - 6 + i * 1.6, c.y + 1.1, c.z - 4.6), dir: new c.constructor(1, 0, 0), speed: 0, range: 1e6, radius: 0.01 });
      p.vis = { ...p.vis, trail: null, trailFn: null, fire: false };
    });
    // emote bubbles over the first two rows, three kinds, overlapping (normal blending: their draw order shows)
    ['!', 'heart', 'sweat'].forEach((kind, k) => D.monsters.filter((m, i) => i % 3 === k && i < ids.length * 2).forEach(m => { const f = G.vfx.emote(m, kind, 999); if (f) f.t = 0.5; }));
    // the far crowd (to the side: its own shot)
    for (let k = 0; k < 120; k++) { const a = k * 2.399, r = 2 + Math.sqrt(k) * 1.4; at(c.x + 30 + Math.cos(a) * r, c.z + Math.sin(a) * r, ids[k % ids.length], { variant: k % 3, rank: k % 11 === 0 ? 'champion' : 'normal' }); out.crowd++; }
    window.__c0 = c0;
    return out;
  }, { kinds: LINEUP[world] });
  const shots = [];
  const view = async (name, fx, fz, dist) => {
    // (the game re-aims the camera every frame: G.heroFocus is the focus it follows instead of the hero)
    await page.evaluate(({ fx, fz, dist }) => { const G = window.G, rig = G.engine.rig, P = G.player; G.heroFocus = { x: window.__c0.x + fx, y: window.__c0.y, z: window.__c0.z + fz }; rig.distTarget = dist; rig.snap(); }, { fx, fz, dist });
    await page.waitForTimeout(700);
    const file = path.join(OUT, `${tag}-${world}-${name}.png`);
    await page.screenshot({ path: file });
    shots.push(file);
  };
  await view('close', -0.5, 1, 14);
  await view('game', -0.5, 1, 27);
  await view('crowd-far', 30, 0, 48);
  await ctx.close();
  return { shots, info, errors };
}

const results = {};
for (const base of BASES) {
  const tag = base === BASES[0] ? 'now' : 'before';
  for (const w of ['burrow', 'region']) {
    const r = await shoot(base, tag, w);
    results[`${tag}-${w}`] = r;
    console.log(`${tag} ${w}: ${r.shots.length} shots, lineup ${r.info.lineup.length}, crowd ${r.info.crowd}${r.errors.length ? ' ERRORS ' + r.errors.slice(0, 3).join(' | ') : ''}`);
  }
}
// pixel diff (in a page: decode both PNGs, count channels differing by more than 24/255, write a diff image)
if (BASES.length > 1) {
  const page = await browser.newPage();
  for (const w of ['burrow', 'region']) for (let i = 0; i < 3; i++) {
    const a = results[`now-${w}`].shots[i], b = results[`before-${w}`].shots[i];
    const d = await page.evaluate(async ({ A, B }) => {
      const load = src => new Promise(res => { const im = new Image(); im.onload = () => res(im); im.src = src; });
      const [ia, ib] = await Promise.all([load(A), load(B)]);
      const W = ia.width, H = ia.height, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
      g.drawImage(ia, 0, 0); const da = g.getImageData(0, 0, W, H).data; g.drawImage(ib, 0, 0); const db = g.getImageData(0, 0, W, H);
      let n = 0; const o = db.data;
      for (let p = 0; p < da.length; p += 4) { const diff = Math.max(Math.abs(da[p] - o[p]), Math.abs(da[p + 1] - o[p + 1]), Math.abs(da[p + 2] - o[p + 2])); if (diff > 24) { n++; o[p] = 255; o[p + 1] = 0; o[p + 2] = 0; } else { o[p] = o[p + 1] = o[p + 2] = (da[p] + da[p + 1] + da[p + 2]) / 9; } }
      g.putImageData(db, 0, 0);
      return { share: n / (W * H), png: cv.toDataURL('image/png') };
    }, { A: 'data:image/png;base64,' + fs.readFileSync(a).toString('base64'), B: 'data:image/png;base64,' + fs.readFileSync(b).toString('base64') });
    const file = a.replace(/now-/, 'diff-');
    fs.writeFileSync(file, Buffer.from(d.png.split(',')[1], 'base64'));
    console.log(`diff ${path.basename(file)}: ${(d.share * 100).toFixed(3)}% of pixels differ (> 24/255)`);
  }
}
// guard: a shot that comes out (nearly) black — a blanked scene, a camera aimed off the floor — fails the run
let black = 0;
{
  const page = await browser.newPage();
  for (const r of Object.values(results)) for (const f of r.shots) {
    const share = await page.evaluate(async src => {
      const im = new Image(); await new Promise(res => { im.onload = res; im.src = src; });
      const c = document.createElement('canvas'); c.width = 160; c.height = 90; const g = c.getContext('2d'); g.drawImage(im, 0, 0, 160, 90);
      const d = g.getImageData(0, 0, 160, 90).data; let n = 0;
      for (let i = 0; i < d.length; i += 4) if (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2] < 36) n++;
      return n / (d.length / 4);
    }, 'data:image/png;base64,' + fs.readFileSync(f).toString('base64'));
    if (share > 0.6) { black++; console.log(`  FAIL  ${path.basename(f)} is ${(share * 100).toFixed(0)}% near-black`); }
  }
  if (!black) console.log('  PASS  no near-black shot (every frame shows the scene)');
}
await browser.close();
console.log('shots in', OUT);
process.exit(black ? 1 : 0);
