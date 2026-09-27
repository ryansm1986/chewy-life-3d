import { open } from './lib.mjs';
// Visual of a townsfolk stuck at its door after dusk (walk>home, within ~1 m of home, not hidden).
const s = await open('/?fresh&nointro&hour=15.5', { wait: 3000 });
await s.sleep(25000);
await s.ev(() => { G.day.hour = 19.6; });
await s.sleep(25000);
const f = await s.ev(() => { const n = G.npcs.find(n => /^folk/.test(n.id) && n.visible && n.goal?.kind === 'home' && Math.hypot(n.pos.x - n.home.x, n.pos.z - n.home.z) < 1.5); if (!n) return null; G.player.setPos(n.pos.x + 2.5, n.pos.z + 2.5); G.engine.rig.distTarget = 14; G.engine.rig.focus.set(n.pos.x, n.pos.y, n.pos.z); G.engine.rig.snap(); window.__f = n; return { id: n.id, home: [n.home.x, n.home.z], pos: [n.pos.x, n.pos.z], stuck: n.stuckT }; });
console.log('folk', JSON.stringify(f));
if (f) {
  for (let i = 0; i < 3; i++) { await s.sleep(700); await s.snap('79_folk_door_' + i); console.log(JSON.stringify(await s.ev(() => ({ p: [+__f.pos.x.toFixed(2), +__f.pos.z.toFixed(2)], rot: +(__f.rig?.root?.rotation.y || 0).toFixed(2), st: __f.state, anim: __f.anim.action?.name, spd: +(__f.anim.speed || 0).toFixed(2) })))); }
}
await s.close();
