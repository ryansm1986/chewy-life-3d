// The Adventurers' Guild look review (docs/COZY.md §5.1; ROADMAP CZ-7): builds the Guild on a civic plot at each level
// and frames it at the game camera from both 45° yaws (and a closer look), plus Old Hachi and the hires by the door,
// the build palette's card, and a night view. Prints draw calls and triangles.
//   node tools/qa/guild-shots.mjs [--levels 1,2,3] [--plot civic-e|civic-w] [--night] [--close] [--palette] [--hires]
// Shots → tools/qa/tmp/guild-shots/ (SHOT_DIR overrides).
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2), arg = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const levels = arg('levels', '1,2,3').split(',').map(Number), plot = arg('plot', 'civic-e');
const outDir = process.env.SHOT_DIR || path.resolve('tools/qa/tmp/guild-shots');
fs.mkdirSync(outDir, { recursive: true });
const base = process.env.BASE || 'http://localhost:5173';
const browser = await chromium.launch({ executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
  args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.routeWebSocket(/.*/, ws => { ws.onMessage(() => {}); });
const logs = [];
page.on('console', m => { if (m.type() === 'error') logs.push(`[error] ${m.text()}`); });
page.on('pageerror', e => logs.push(`[pageerror] ${e.message}\n${(e.stack || '').split('\n').slice(1, 4).join('\n')}`));
await page.goto(`${base}/?fresh&nointro&notut&hour=${args.includes('--night') ? 21 : 10}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready === true && window.G?.player, null, { timeout: 60000 });
await page.waitForTimeout(1200);
const shot = n => page.screenshot({ path: path.join(outDir, n + '.png') });
const ev = (fn, a) => page.evaluate(fn, a);
await ev(h => { window.__hideHero = h; }, !args.includes('--hero'));

for (const L of levels) {
  const info = await ev(({ L, plot, hires }) => {
    const G = window.G, sim = G.sim;
    const old = sim.S.buildings.find(b => b.type === 'guild'); if (old) sim.remove(old, false);
    const pl = sim.constructor && window.G.sim; void pl;
    const P = G.cozy?.guild?.debugBuild ? G.cozy.guild.debugBuild({ plot, level: L }) : null;
    const b = P || (() => { const plots = window.__plots || null; return null; })();
    if (!b) return { err: 'no debugBuild' };
    if (hires) G.cozy.guild.debugHires?.(3);
    for (const e of document.querySelectorAll('#ui, .ui-root')) e.style.setProperty('opacity', '0');
    G.player.invuln = true;
    const rec = sim.list.find(r => r.data === b);
    return { door: [rec.door.x, rec.door.z], pos: [sim.worldPos(b).x, sim.worldPos(b).z], rot: b.rot, tris: rec.model.tris, h: rec.model.height };
  }, { L, plot, hires: args.includes('--hires') });
  if (info.err) { console.log(info.err); break; }
  console.log(`== L${L}`, JSON.stringify(info));
  await page.waitForTimeout(1600); // (the rise animation)
  const yaws = args.includes('--all') ? [['a', Math.PI / 4], ['b', -Math.PI / 4], ['c', Math.PI * 3 / 4], ['d', -Math.PI * 3 / 4]] : [['a', Math.PI / 4], ['b', -Math.PI / 4]]; // (the game's two 45° yaws: π/4 and −π/4)
  for (const [yn, yaw] of yaws) {
    for (const [dn, dist] of args.includes('--close') ? [['far', 24], ['near', 13]] : [['far', 24]]) {
      const r = await ev(async ({ pos, door, yaw, dist }) => {
        const G = window.G, P = G.player, rig = G.engine.rig;
        const fx = Math.sin(yaw) * 4.5, fz = Math.cos(yaw) * 4.5; // (the hero stands 4.5 m toward the camera, hidden; the camera's bias brings the frame back onto the Guild)
        P.setPos(pos[0] + fx, pos[1] + fz); P.moveTarget = null; P.visible = !window.__hideHero; if (G.companion) { G.companion.setPos(pos[0] + fx + 0.5, pos[1] + fz + 0.5); G.companion.visible = !window.__hideHero; }
        rig.yawTarget = rig.yaw = yaw; rig.distTarget = rig.dist = dist; rig.biasTarget?.set?.(-fx, 0, -fz); rig.bias?.set?.(-fx, 0, -fz); rig.snap?.();
        await new Promise(r => setTimeout(r, 900));
        const E = G.engine, R2 = E.renderer, er = E.render, cc = [], tt = [];
        E.render = function () { R2.info.autoReset = false; R2.info.reset(); const x = er.apply(this, arguments); cc.push(R2.info.render.calls); tt.push(R2.info.render.triangles); R2.info.autoReset = true; return x; };
        await new Promise(r => setTimeout(r, 500)); E.render = er; cc.sort((a, b) => a - b); tt.sort((a, b) => a - b);
        return { calls: cc[cc.length >> 1], tris: Math.round(tt[tt.length >> 1] / 1000) + 'k' };
      }, { ...info, yaw, dist });
      console.log(`   ${yn} ${dn}`, JSON.stringify(r));
      await shot(`L${L}-${yn}-${dn}${args.includes('--night') ? '-night' : ''}`);
    }
  }
}
if (args.includes('--palette')) {
  await ev(() => { for (const e of document.querySelectorAll('#ui, .ui-root')) e.style.removeProperty('opacity'); const G = window.G; const old = G.sim.S.buildings.find(b => b.type === 'guild'); if (old) G.sim.remove(old, false); G.sim.stats.rank = Math.max(2, G.sim.stats.rank); G.build.enter(); });
  await page.waitForTimeout(2600);
  await ev(() => { const P = window.G.ui.panels.build; const tab = [...document.querySelectorAll('.p-build .tab, .p-build [data-cat]')].find(t => /Landmarks/i.test(t.textContent) || t.dataset.cat === 'special'); tab?.click(); });
  await page.waitForTimeout(800);
  await ev(() => { const it = document.querySelector('.p-build [data-id="guild"]'); it?.scrollIntoView({ block: 'center' }); it?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); });
  await page.waitForTimeout(600);
  await shot('palette');
}
console.log(logs.length ? logs.join('\n') : 'no errors');
await browser.close();
