// siege-camp: boot into a besieged zone village, clear the camps of monsters, and shoot each Blender piece where it landed at the game
// camera, plus each cage with its kit door shut and swung open. Read-only on src.
//   node siege_shots.mjs --zone bamboo [--tag g1] [--dist 13] [--only tent,cage,fire,spikes,camp,door] [--yaw a,b]   (dev server on :5173)
import { chromium } from 'playwright-core';
import path from 'node:path';
const args = process.argv.slice(2), arg = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const zone = arg('zone', 'bamboo'), tag = arg('tag', 'g'), dist = +arg('dist', 13), only = arg('only', 'tent,cage,fire,spikes,camp,door').split(','), yawsArg = arg('yaw', 'a,b').split(','), hour = arg('hour', '10');
const OUT = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1');
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.routeWebSocket(/.*/, ws => { ws.onMessage(() => {}); });
const logs = []; page.on('pageerror', e => logs.push(e.message)); page.on('console', m => { if (m.type() === 'error' || /\[props\]/.test(m.text())) logs.push(m.text().slice(0, 300)); });
await page.goto(`http://localhost:5173/?fresh&nointro&notut&hour=${hour}&region=${zone}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready === true && globalThis.G?.dungeon?.isRegion && !G.ui?.iris?.active && G.dungeon.village, null, { timeout: 90000 });
await page.waitForTimeout(2000);
const spots = await page.evaluate(async () => {
  const urlOf = k => performance.getEntriesByType('resource').map(e => new URL(e.name).pathname + new URL(e.name).search).find(u => u.includes(k)) || k;
  const DA = await import(urlOf('/src/regions/village/data.js')), TG = await import(urlOf('/src/world/treeGlb.js'));
  const D = G.dungeon, V = D.village, out = [];
  document.querySelector('#ui')?.style.setProperty('visibility', 'hidden');
  G.player.invuln = true; if (G.combat) G.combat.hitPlayer = () => 0;
  const away = () => { for (const m of D.monsters) { m.pos.set(-400, 0, -400); m.aggro = false; m.cd = 99; m.sync?.(); } };
  away(); window.__away = away;
  for (const c of V.camps) {
    const P = c.pieces || {}, sd = c.a | 0, nv = n => ((sd % n) + n) % n;
    const at = q => DA.screenAt(V.site, q[0], q[1]);
    const f = at(P.fire || c.at); out.push({ kind: 'camp', name: c.id, x: f.x, z: f.z, far: true }); out.push({ kind: 'fire', name: `${c.id}-campfire-v${nv(2)}`, x: f.x, z: f.z });
    if (P.tent) { const t = at(P.tent); const psi = DA.screenYaw(P.tent[2] || 0); out.push({ kind: 'tent', name: `${c.id}-tent-v${nv(3)}`, x: t.x, z: t.z, mouth: Math.atan2(Math.cos(psi), -Math.sin(psi)) }); }
    if (P.spikes) { const t = at(P.spikes); out.push({ kind: 'spikes', name: `${c.id}-spikes-v${nv(2)}`, x: t.x, z: t.z }); }
  }
  V.cages.forEach((cg, i) => { const sd = (cg.camp.a | 0) + 3; out.push({ kind: 'cage', name: `${cg.camp.id}-cage-v${((sd % 2) + 2) % 2}`, x: cg.x, z: cg.z, i }); });
  return { out, h0: V.h0, listed: TG.PROP_GLB.filter(k => k.startsWith('siege-')), got: TG.PROP_GLB.filter(k => k.startsWith('siege-') && TG.propParts(k)).length };
});
console.log('listed', spots.listed.length, 'loaded', spots.got, 'h0', spots.h0);
const frame = async (s, yaw, d) => page.evaluate(async ({ s, yaw, d }) => {
  const P = G.player, rig = G.engine.rig; window.__away();
  const off = s.far ? [0, 0] : [Math.cos(yaw + 0.8) * 1.9, Math.sin(yaw + 0.8) * 1.9];
  P.setPos(s.x + off[0], s.z + off[1]); G.companion?.setPos?.(s.x + off[0] + 0.7, s.z + off[1] + 0.3);
  rig.yawTarget = rig.yaw = yaw; rig.distTarget = d; rig.focus.set(s.x, P.pos.y, s.z); rig.snap?.();
  await new Promise(r => setTimeout(r, 900)); rig.focus.set(s.x, P.pos.y, s.z); rig.snap?.();
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
}, { s, yaw, d });
const yaws = { a: Math.PI / 4, b: Math.PI / 4 + Math.PI / 2, c: Math.PI / 4 - Math.PI / 2, d: Math.PI / 4 + Math.PI };
for (const s of spots.out) {
  for (const yn of yawsArg) {
    if (only.includes(s.kind)) {
      await frame(s, yn === 'm' ? (s.mouth ?? yaws.a) : yaws[yn], s.far ? 24 : dist);
      const f = path.join(OUT, `${tag}_${zone}_${s.kind === 'camp' ? 'camp-' + s.name : s.name}_${yn}.png`);
      await page.screenshot({ path: f }); console.log(f);
    }
  }
  if (s.kind === 'cage' && only.includes('door')) {
    await frame(s, yaws.a, 9);
    const r = await page.evaluate(async i => { const V = G.dungeon.village, cg = V.cages[i]; const had = !!cg.door; cg.opening = true; const t0 = performance.now(); while (cg.open < 1 && performance.now() - t0 < 8000) await new Promise(q => setTimeout(q, 60)); return { had, open: cg.open, rot: cg.door?.rotation.y }; }, s.i);
    await page.waitForTimeout(200);
    console.log('door', s.name, JSON.stringify(r));
    await page.screenshot({ path: path.join(OUT, `${tag}_${zone}_${s.name}_doorOpen.png`) });
    await page.evaluate(i => { const cg = G.dungeon.village.cages[i]; cg.opening = false; cg.open = 0; if (cg.door) cg.door.rotation.y = 0; }, s.i);
    await page.waitForTimeout(200); await page.screenshot({ path: path.join(OUT, `${tag}_${zone}_${s.name}_doorShut.png`) });
  }
}
if (logs.length) console.log(logs.slice(0, 12).join('\n'));
await browser.close();
