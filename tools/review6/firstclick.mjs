import { open } from './lib.mjs';
// Worst frame around the first few ground clicks of a session (village and Burrow).
for (const url of ['/?fresh&nointro&hour=10', '/?fresh&nointro&floor=2']) {
  const s = await open(url, { wait: url.includes('floor') ? 7000 : 3500 });
  await s.ev(() => { if (G.ui.dlg.active) G.ui.dlg.finish(-1); G.state.flags.burrowTut = true; if (G.dungeon) for (const m of G.dungeon.monsters) m.aggro = false;
    window.__mx = (n = 40) => new Promise(res => { let mx = 0, last = performance.now(), k = 0; function f(t) { mx = Math.max(mx, t - last); last = t; if (++k < n) requestAnimationFrame(f); else res(+mx.toFixed(1)); } requestAnimationFrame(f); }); });
  const out = [];
  for (let i = 0; i < 4; i++) {
    const cur = await s.ev(() => { const v = G.player.pos.clone().project(G.engine.camera); return [Math.round((v.x * .5 + .5) * innerWidth), Math.round((-v.y * .5 + .5) * innerHeight)]; });
    const a = i * 1.6; const x = cur[0] + Math.cos(a) * 170, y = cur[1] + Math.sin(a) * 90;
    const p = s.ev(() => __mx());
    await s.page.mouse.move(x, y); await s.page.mouse.down(); await s.sleep(60); await s.page.mouse.up();
    out.push(await p);
    await s.sleep(1200);
  }
  console.log(url, 'worst frame (ms) around clicks 1..4:', JSON.stringify(out), 'baseline', await s.ev(() => __mx(60)));
  await s.close();
}
