// The peaceful overworld's look review and perf check (docs/COZY.md §6; ROADMAP CZ-3 / CZ-4).
//   node tools/qa/wild-shots.mjs [--region bamboo,maple,tidepool,onsen] [--besieged] [--only trail,glade,wild] [--wait 6000] [--uncap]
// Boots each zone saved (peaceful; --besieged: as before the save, for the comparison) and snaps the hero, at the game
// camera, to: the arrival, the village, points along the trail, each wildlife glade (an emptied camp site) and each
// wild area (its entry, with its packs in frame: the hero is hidden from them so they idle). Writes one PNG per spot and
// a summary with draw calls, triangles, frame time and the live monster count. Shots: tools/qa/tmp/wild/ (SHOT_DIR).
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2), arg = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const regions = arg('region', 'bamboo,maple,tidepool,onsen').split(','), besieged = args.includes('--besieged'), only = arg('only', ''), wait = +arg('wait', 6000);
const outDir = process.env.SHOT_DIR || path.resolve('tools/qa/tmp/wild');
fs.mkdirSync(outDir, { recursive: true });
const base = process.env.BASE || 'http://localhost:5173';
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
  args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', ...(args.includes('--uncap') ? ['--disable-gpu-vsync', '--disable-frame-rate-limit'] : [])],
});
const summary = [];
for (const region of regions) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.routeWebSocket(/.*/, ws => { ws.onMessage(() => {}); });
  const logs = [];
  page.on('console', m => { if (m.type() === 'error') logs.push(`[error] ${m.text()}`); });
  page.on('pageerror', e => logs.push(`[pageerror] ${e.message}`));
  await page.goto(`${base}/?fresh&nointro&notut&region=${region}${besieged ? '' : `&villagesaved=${region}`}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true && globalThis.G?.dungeon?.isRegion, null, { timeout: 90000 });
  await page.waitForTimeout(wait);
  const spots = await page.evaluate(() => {
    const D = G.dungeon, L = D.layout, P = L.plan, out = [];
    G.player.hidden = true; for (const e of G.dungeon.combat.allies || []) e.untargetable = true; // (the packs idle: shots, not fights)
    for (const f of ['poeJoined', 'shihtzuJoined', 'goldenJoined']) G.state.flags[f] = true; // (no joining scene takes the camera)
    G.heroes?.poeJoin?.reset?.(); G.heroes?.stzJoin?.reset?.(); G.heroes?.gldJoin?.reset?.();
    out.push({ name: 'trail-start', x: P.start.x, z: P.start.z });
    if (P.village) out.push({ name: 'trail-village', x: P.village.x, z: P.village.z + P.village.r * 0.6 });
    for (const k of [0.3, 0.55, 0.8]) { const i = Math.round(k * (P.trail.length - 1)), [x, z] = P.trail[i]; out.push({ name: `trail-${Math.round(k * 100)}`, x, z }); }
    (L.glades || []).forEach((g, i) => out.push({ name: 'glade' + i, x: g.x, z: g.z }));
    for (const a of L.wild || []) {
      out.push({ name: `wild-${a.id}-entry`, x: a.entry[0], z: a.entry[1] });
      out.push({ name: `wild-${a.id}`, x: a.x - a.r * 0.18, z: a.z - a.r * 0.18 }); // (a little toward its far rim, where its landmark stands)
    }
    return out;
  });
  for (const s of spots) {
    if (only && !only.split(',').some(k => s.name.startsWith(k))) continue;
    const r = await page.evaluate(async ({ x, z }) => {
      const P = G.player; P.setPos(x, z); G.engine.rig.focus.copy(P.pos); G.engine.rig.snap?.();
      for (const m of G.dungeon.monsters) if (m.aggro) { m.aggro = false; m.homing = false; }
      await new Promise(r => setTimeout(r, 1400));
      const t0 = performance.now(); let n = 0; await new Promise(res => { const f = () => { n++; if (performance.now() - t0 < 1200) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
      const R = G.engine.renderer; R.info.autoReset = false; R.info.reset();
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const i = R.info.render, o = { calls: i.calls, tris: i.triangles }; R.info.autoReset = true;
      const near = G.dungeon.monsters.filter(m => m.alive && Math.hypot(m.pos.x - x, m.pos.z - z) < 20).length;
      return { ...o, ms: +((performance.now() - t0) / n).toFixed(2), mons: G.dungeon.monsters.filter(m => m.alive).length, near };
    }, s);
    const f = path.join(outDir, `${region}${besieged ? '-besieged' : ''}-${s.name}.png`);
    await page.screenshot({ path: f });
    summary.push({ region, state: besieged ? 'besieged' : 'peaceful', ...s, ...r });
    console.log(`${region} ${pad(s.name, 26)} calls ${pad(r.calls, 4)} tris ${pad((r.tris / 1e6).toFixed(2) + 'M', 6)} ${pad(r.ms + 'ms', 7)} monsters ${r.mons} (near ${r.near})`);
  }
  if (logs.length) console.log(logs.slice(0, 8).join('\n'));
  await page.close();
}
fs.writeFileSync(path.join(outDir, `summary${besieged ? '-besieged' : ''}.json`), JSON.stringify(summary, null, 1));
await browser.close();
function pad(s, n) { return String(s).padEnd(n); }
