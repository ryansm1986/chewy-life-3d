import { open } from './lib.mjs';
// Which THREE textures created during dungeon trips are still uploaded afterwards (never disposed)?
const s = await open('/?fresh&nointro&hour=10', { wait: 3000 });
await s.ev(() => {
  G.state.flags.burrowTut = true; G.sim.grow = () => {};
  const T = G.THREE; const reg = new Set(); window.__reg = reg; window.__phase = 'pre';
  const desc = Object.getOwnPropertyDescriptor(T.Texture.prototype, 'needsUpdate');
  Object.defineProperty(T.Texture.prototype, 'needsUpdate', { configurable: true, get: desc.get, set(v) { if (v === true && !this.__tr) { this.__tr = { phase: window.__phase, st: (new Error().stack || '').split('\n').slice(2, 7).map(l => l.trim().replace(/\?[^:]*/, '').replace(/https?:\/\/[^/]+\//, '')).join(' < ') }; reg.add(this); this.addEventListener('dispose', () => reg.delete(this)); } desc.set.call(this, v); } });
});
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
const r = await s.ev(() => {
  const P = G.engine.renderer.properties; const g = {};
  for (const t of window.__reg) { if (t.__tr.phase !== 'trips') continue; const up = !!P.get(t).__webglTexture; if (!up) continue; const k = `${t.constructor.name} ${t.image?.width}x${t.image?.height} ${t.name || ''} :: ${t.__tr.st}`; g[k] = (g[k] || 0) + 1; }
  return { tex: G.engine.renderer.info.memory.textures, g: Object.entries(g).sort((a, b) => b[1] - a[1]).slice(0, 12) };
});
console.log('textures now', r.tex);
for (const [k, n] of r.g) console.log(n, k);
await s.close();
