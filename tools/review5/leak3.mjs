import { open } from './lib.mjs';
// Which GL textures survive dungeon round trips? Wrap gl.createTexture/deleteTexture and group survivors by stack.
const s = await open('/?fresh&nointro&hour=10', { wait: 3000 });
await s.ev(() => {
  G.state.flags.burrowTut = true; G.sim.grow = () => {};
  const gl = G.engine.renderer.getContext(); const live = new Map(); window.__live = live; let id = 0; window.__phase = 'pre'; Error.stackTraceLimit = 60;
  const c = gl.createTexture.bind(gl), d = gl.deleteTexture.bind(gl);
  gl.createTexture = function () { const t = c(); t.__id = ++id; live.set(t.__id, { phase: window.__phase, st: (new Error().stack || '').split('\n').slice(2, 40).map(l => l.trim().replace(/\?[^:]*/, '').replace(/https?:\/\/[^/]+\//, '')).filter(l => !/three\.module/.test(l)).slice(0, 3).join(' < ') }); return t; };
  gl.deleteTexture = function (t) { if (t && t.__id) live.delete(t.__id); return d(t); };
});
// warm-up trip so first-time caches do not count
await s.ev(() => G.enterDungeon(1)); await s.sleep(3000); await s.ev(() => G.returnToVillage()); await s.sleep(2000);
await s.ev(() => { window.__phase = 'trips'; });
for (let i = 0; i < 6; i++) {
  await s.ev((f) => G.enterDungeon(f), 2 + (i % 6));
  await s.sleep(3000);
  await s.ev(() => { for (let k = 0; k < 5; k++) { const m = G.dungeon.monsters.find(m => m.alive); if (!m) break; G.player.setPos(m.pos.x + 1.5, m.pos.z); G.state.player.zoom = null; G.state.player.life = null; if (G.skills.cds) G.skills.cds.chomp = 0; G.skills.tryCast('chomp', m.pos.clone(), m); } });
  await s.sleep(900);
  await s.ev(() => G.returnToVillage());
  await s.sleep(2000);
}
const r = await s.ev(() => { const g = {}; for (const v of window.__live.values()) if (v.phase === 'trips') g[v.st] = (g[v.st] || 0) + 1; return { tex: G.engine.renderer.info.memory.textures, survivors: Object.entries(g).sort((a, b) => b[1] - a[1]).slice(0, 12) }; });
console.log('textures now', r.tex);
for (const [st, n] of r.survivors) console.log(n, st);
await s.close();
