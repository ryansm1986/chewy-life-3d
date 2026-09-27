import { open } from './lib.mjs';
// What makes the first Pack Call hitch? programs / geometries / textures before & after, and worst frame.
for (let run = 0; run < 2; run++) {
  const s = await open('/?fresh&nointro&floor=11', { wait: 6000 });
  await s.ev(() => { if (G.ui.dlg.active) G.ui.dlg.finish(-1); G.state.flags.burrowTut = true; const P = G.state.player; P.lvl = 30; P.stats = { str: 90, dex: 90, vit: 400, ene: 400 }; P.skills.packcall = 10; G.actions.recompute(); P.life = null; P.zoom = null;
    window.__mx = () => new Promise(res => { let mx = 0, last = performance.now(), n = 0; function f(t) { mx = Math.max(mx, t - last); last = t; if (++n < 60) requestAnimationFrame(f); else res(+mx.toFixed(1)); } requestAnimationFrame(f); }); });
  await s.sleep(800);
  const r = await s.ev(async () => { const I = G.engine.renderer.info; const b = { progs: I.programs.length, geos: I.memory.geometries, tex: I.memory.textures }; const m = G.dungeon.monsters.find(m => m.alive); const p = __mx(); const t0 = performance.now(); G.skills.tryCast('packcall', (m ? m.pos : G.player.pos).clone(), m); const castMs = +(performance.now() - t0).toFixed(1); const mx = await p; return { castMs, mx, before: b, after: { progs: I.programs.length, geos: I.memory.geometries, tex: I.memory.textures }, newProgs: I.programs.slice(b.progs).map(p => p.name || p.cacheKey?.slice(0, 60)) }; });
  console.log('run', run, JSON.stringify(r));
  await s.close();
}
