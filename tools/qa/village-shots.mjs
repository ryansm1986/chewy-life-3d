// Zone village look review (docs/ZONES.md §2; ROADMAP Z-D1..D5): boots straight into a zone, then frames its village at
// the game camera from both yaws — besieged (the camps, cages and the warded captain) and, with --saved, the saved
// village (villagers out) — plus close views of every building. Prints draw calls, triangles and the frame time.
//   node tools/qa/village-shots.mjs [--zone bamboo] [--saved] [--both] [--only square,elder,...] [--mons] [--hud]
// SHOT_DIR=<dir> picks the output folder (default tools/qa/out/village).
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2), arg = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const zone = arg('zone', 'bamboo'), only = arg('only', ''), keepMons = args.includes('--mons'), hud = args.includes('--hud');
const states = args.includes('--both') ? ['besieged', 'saved'] : [args.includes('--saved') ? 'saved' : 'besieged'];
const outDir = process.env.SHOT_DIR || path.resolve('tools/qa/out/village');
fs.mkdirSync(outDir, { recursive: true });
const base = process.env.BASE || 'http://localhost:5173';
const browser = await chromium.launch({ executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
  args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', ...(args.includes('--uncap') ? ['--disable-gpu-vsync', '--disable-frame-rate-limit'] : [])] });
const res = [];
for (const st of states) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.routeWebSocket(/.*/, ws => { ws.onMessage(() => {}); });
  const logs = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning' && /village|region/i.test(m.text())) logs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', e => logs.push(`[pageerror] ${e.message}\n${(e.stack || '').split('\n').slice(1, 4).join('\n')}`));
  // a saved village: seed the save before the region builds (fresh game, village marked saved)
  if (st === 'saved') {
    await page.goto(`${base}/?fresh&nointro&notitle`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__ready === true && window.G?.player, null, { timeout: 60000 });
    await page.evaluate(z => { const S = G.state; S.zones[z].village = 'saved'; S.zones[z].siegeCamps = []; S.zones[z].unlocked = true; G.save(); }, zone);
    await page.evaluate(z => G.enterRegion(z), zone);
  } else await page.goto(`${base}/?fresh&nointro&region=${zone}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true && globalThis.G?.dungeon?.isRegion && !G.ui?.iris?.active, null, { timeout: 60000 }).catch(() => logs.push('[harness] region not ready'));
  await page.waitForTimeout(2500);
  const info = await page.evaluate(({ keepMons, hud }) => {
    const D = G.dungeon, V = D.village;
    if (!V) return { err: 'no village' };
    if (!keepMons) for (const m of D.monsters) if (!m.siegeCamp && !m.siegeCaptain) { m.pos.set(-400, 0, -400); m.aggro = false; }
    for (const m of D.monsters) { m.aggro = false; m.cd = 99; }
    G.player.invuln = true; window.__noHit = true; if (G.combat) G.combat.hitPlayer = () => 0; // (no knock-outs mid-tour: a camp's hits would send the hero home)
    if (!hud) document.querySelector('#ui')?.style.setProperty('visibility', 'hidden');
    const spots = [{ name: 'square', x: V.site.x, z: V.site.z }];
    for (const b of V.buildings) spots.push({ name: b.id, x: b.doorPos.x, z: b.doorPos.z, near: true });
    for (const c of V.camps) spots.push({ name: 'camp-' + c.id, x: c.x, z: c.z });
    return { spots, buildings: V.buildings.length, villagers: V.villagers.map(v => `${v.id}:${v.state}`), camps: V.camps.map(c => `${c.id}:${c.monsters.length}`), captain: V.captain ? `${V.captain.name} ${V.captain.life}/${V.captain.lifeMax} warded=${V.captain.warded}` : null, buildMs: D.world.buildMs, timing: D.world.timing };
  }, { keepMons, hud });
  console.log(`== ${zone} ${st}:`, JSON.stringify({ ...info, spots: undefined }));
  if (info.err) { console.log(logs.join('\n')); await page.close(); continue; }
  for (const yaw of [Math.PI / 4, Math.PI / 4 + Math.PI / 2]) {
    for (const s of info.spots) {
      if (only && !only.split(',').some(k => s.name.startsWith(k))) continue;
      const yawName = yaw === Math.PI / 4 ? 'a' : 'b';
      const r = await page.evaluate(async ({ x, z, yaw, near }) => {
        const P = G.player, rig = G.engine.rig; P.setPos(x, z); rig.yawTarget = rig.yaw = yaw; rig.distTarget = near ? 20 : 24; rig.focus.copy(P.pos); rig.snap?.();
        await new Promise(r => setTimeout(r, 900));
        const t0 = performance.now(); let n = 0; await new Promise(res => { const f = () => { n++; if (performance.now() - t0 < 900) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
        // per frame (REGIONS §4's unit): the median of ~0.8 s of frames, counted round one E.render
        const E = G.engine; const R2 = E.renderer, er = E.render, cc = [], tt = []; E.render = function () { R2.info.autoReset = false; R2.info.reset(); const x = er.apply(this, arguments); cc.push(R2.info.render.calls); tt.push(R2.info.render.triangles); R2.info.autoReset = true; return x; }; await new Promise(r => setTimeout(r, 800)); E.render = er; cc.sort((a, b) => a - b); tt.sort((a, b) => a - b);
        const out = { calls: cc[cc.length >> 1], tris: Math.round(tt[tt.length >> 1] / 1000) + 'k' };
        return { ...out, ms: +((performance.now() - t0) / n).toFixed(2) };
      }, { ...s, yaw });
      const f = path.join(outDir, `${zone}-${st}-${s.name}-${yawName}.png`);
      await page.screenshot({ path: f });
      res.push({ st, name: s.name, yaw: yawName, ...r, f });
      console.log(`${st.padEnd(9)} ${(s.name + '/' + yawName).padEnd(14)} calls=${r.calls} tris=${r.tris} frame=${r.ms}ms → ${f}`);
    }
  }
  if (logs.length) console.log(logs.slice(0, 30).join('\n'));
  await page.close();
}
await browser.close();
