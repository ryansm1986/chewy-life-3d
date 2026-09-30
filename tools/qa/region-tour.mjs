// Region look tour: node tools/qa/region-tour.mjs --region maple [--pts "x,z;x,z"] [--only start,arena] [--wait 8000] [--dist 34] [--uncap (no vsync: real frame times)]
// Boots straight into a region, then snaps the player to its key spots (arrival, every camp and POI, the arena, plus
// any --pts) and saves a screenshot at each, with draw calls / triangles / frame time. Monsters are parked far away so
// they don't crowd the frame (--mons keeps them).
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2), arg = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const region = arg('region', 'bamboo'), wait = +arg('wait', 8000), extra = arg('pts', ''), only = arg('only', ''), keepMons = args.includes('--mons'), dist = +arg('dist', 0);
const outDir = process.env.SHOT_DIR || path.resolve('tools/qa/out/tour');
fs.mkdirSync(outDir, { recursive: true });
const base = process.env.BASE || 'http://localhost:5173';
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
  args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', ...(args.includes('--uncap') ? ['--disable-gpu-vsync', '--disable-frame-rate-limit'] : [])],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.routeWebSocket(/.*/, ws => { ws.onMessage(() => {}); });
const logs = [];
page.on('console', m => { if (m.type() === 'error') logs.push(`[error] ${m.text()}`); });
page.on('pageerror', e => logs.push(`[pageerror] ${e.message}\n${e.stack || ''}`));
await page.goto(`${base}/?fresh&nointro&region=${region}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready === true && globalThis.G?.dungeon?.isRegion, null, { timeout: 60000 }).catch(() => logs.push('[harness] region not ready'));
await page.waitForTimeout(wait);
const spots = await page.evaluate(({ extra, keepMons }) => {
  const D = G.dungeon, P = D.layout.plan, out = [];
  if (!keepMons) for (const m of D.monsters) { m.pos.set(-400, 0, -400); m.aggro = false; m.frozen = true; }
  out.push({ name: 'start', x: P.start.x, z: P.start.z });
  P.camps.forEach((c, i) => out.push({ name: 'camp' + i, x: c.x, z: c.z }));
  P.pois.forEach((p, i) => out.push({ name: 'poi' + i + '-' + p.kind, x: p.x, z: p.z }));
  out.push({ name: 'arena', x: P.arena.x, z: P.arena.z });
  if (extra) extra.split(';').forEach((s, i) => { const [x, z] = s.split(',').map(Number); out.push({ name: 'pt' + i, x, z }); });
  return out;
}, { extra, keepMons });
const res = [];
for (const s of spots) {
  if (only && !only.split(',').some(k => s.name.startsWith(k))) continue;
  const r = await page.evaluate(async ({ x, z, dist }) => {
    const P = G.player; P.setPos(x, z); if (dist) G.engine.rig.distTarget = dist; G.engine.rig.focus.copy(P.pos); G.engine.rig.snap?.();
    await new Promise(r => setTimeout(r, 1400));
    const t0 = performance.now(); let n = 0; await new Promise(res => { const f = () => { n++; if (performance.now() - t0 < 1500) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
    const R = G.engine.renderer; R.info.autoReset = false; R.info.reset(); // (one whole frame: shadows + scene + post)
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const i = R.info.render, out = { calls: i.calls, tris: i.triangles }; R.info.autoReset = true;
    return { ...out, ms: +((performance.now() - t0) / n).toFixed(2), y: +P.pos.y.toFixed(2) };
  }, { ...s, dist });
  const f = path.join(outDir, `${region}-${s.name}.png`);
  await page.screenshot({ path: f });
  res.push({ ...s, ...r });
  console.log(`${s.name.padEnd(16)} (${s.x.toFixed(0)},${s.z.toFixed(0)}) calls=${r.calls} tris=${(r.tris / 1000).toFixed(0)}k frame=${r.ms}ms  → ${f}`);
}
if (logs.length) console.log(logs.slice(0, 30).join('\n'));
await browser.close();
