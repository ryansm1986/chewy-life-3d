import { open } from './lib.mjs';
// Real flow: title -> New Game (a real click unlocks audio) -> Esc the intro -> first ground clicks: worst frames.
const s = await open('/?fresh&hour=9', { wait: 2500 });
const ng = await s.ev(() => { const b = [...document.querySelectorAll('button')].find(b => /new game/i.test(b.innerText)); const r = b.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
const pNg = s.ev(() => new Promise(res => { let mx = 0, last = performance.now(), k = 0; const top = []; function f(t) { top.push(+(t - last).toFixed(1)); mx = Math.max(mx, t - last); last = t; if (++k < 240) requestAnimationFrame(f); else res({ mx: +mx.toFixed(1), top: top.sort((a, b) => b - a).slice(0, 5) }); } requestAnimationFrame(f); }));
await s.click(ng[0], ng[1]);
console.log('new game click + 240 frames', JSON.stringify(await pNg));
await s.sleep(2500);
for (let i = 0; i < 3; i++) { await s.key('Escape'); await s.sleep(600); }
console.log('state', JSON.stringify(await s.ev(() => ({ dlg: G.ui.dlg.active, locked: G.player.controlLocked, menu: G.ui.isPaused?.() }))));
if (await s.ev(() => G.ui.isPaused?.())) { await s.key('Escape'); await s.sleep(500); }
await s.ev(() => { window.__mx = (n = 40) => new Promise(res => { let mx = 0, last = performance.now(), k = 0; function f(t) { mx = Math.max(mx, t - last); last = t; if (++k < n) requestAnimationFrame(f); else res(+mx.toFixed(1)); } requestAnimationFrame(f); }); });
const out = [];
for (let i = 0; i < 4; i++) {
  const cur = await s.ev(() => { const v = G.player.pos.clone().project(G.engine.camera); return [Math.round((v.x * .5 + .5) * innerWidth), Math.round((-v.y * .5 + .5) * innerHeight)]; });
  const a = i * 1.6; const x = cur[0] + Math.cos(a) * 170, y = cur[1] + Math.sin(a) * 90;
  const p = s.ev(() => __mx());
  await s.page.mouse.move(x, y); await s.page.mouse.down(); await s.sleep(60); await s.page.mouse.up();
  out.push(await p); await s.sleep(1000);
}
console.log('first ground clicks worst frame', JSON.stringify(out));
await s.close();
