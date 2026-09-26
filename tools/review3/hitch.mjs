import { open } from './lib.mjs';
// Reproduce first-cast hitches: fresh sessions, cast each skill twice, record worst frame in the next 60 frames.
const groups = [['packcall', 'packcall', 'howl', 'decoy'], ['fetchstorm', 'fetchstorm', 'bonestorm', 'blaze']];
for (const g of groups) {
  const s = await open('/?fresh&nointro&floor=11', { wait: 6000 });
  await s.ev(() => { if (G.ui.dlg.active) G.ui.dlg.finish(-1); G.state.flags.burrowTut = true; const P = G.state.player; P.lvl = 30; P.stats = { str: 90, dex: 90, vit: 400, ene: 400 }; for (const id of ['chomp', 'whirl', 'bonestorm', 'blaze', 'fetchstorm', 'woof', 'packcall', 'multi', 'ricochet', 'throw', 'decoy', 'howl', 'fetchMastery', 'boneMastery']) P.skills[id] = 10; G.actions.recompute(); P.life = null; P.zoom = null;
    window.__mx = () => new Promise(res => { let mx = 0, last = performance.now(), n = 0; const fr = []; function f(t) { fr.push(+(t - last).toFixed(1)); mx = Math.max(mx, t - last); last = t; if (++n < 60) requestAnimationFrame(f); else res({ mx: +mx.toFixed(1), top: fr.sort((a, b) => b - a).slice(0, 3) }); } requestAnimationFrame(f); }); });
  // bring monsters near
  await s.ev(() => { const p = G.player.pos; let k = 0; for (const m of G.dungeon.monsters) { if (!m.alive || m.isBoss) continue; if (k++ > 12) break; const a = Math.random() * 6.28, r = 3 + Math.random() * 3; const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r; if (G.world.walkable(x, z)) m.pos.set(x, m.pos.y, z); } });
  await s.sleep(800);
  console.log('baseline', JSON.stringify(await s.ev(() => __mx())));
  for (const id of g) {
    const r = await s.ev(async id => { const m = G.dungeon.monsters.find(m => m.alive); G.state.player.zoom = null; G.state.player.life = null; if (G.skills.cds) G.skills.cds[id] = 0; const ball = ['fetchstorm', 'blaze', 'multi', 'ricochet', 'decoy'].includes(id); if ((G.derived.weaponType === 'ball') !== ball) { G.actions.swapWeapons(); G.player.setWeapon(G.derived.weaponType); } const p = __mx(); const ok = G.skills.tryCast(id, (m ? m.pos : G.player.pos).clone(), m); return [ok, await p]; }, id);
    console.log('cast', id, JSON.stringify(r));
    await s.sleep(1500);
  }
  await s.close();
}
