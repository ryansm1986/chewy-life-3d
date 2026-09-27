import { open } from './lib.mjs';
const s = await open('/?fresh&nointro&hour=10', { wait: 2500 });
await s.log('village rig', () => { const r = G.engine.rig; return { dist: r.dist, distT: r.distTarget, pitch: r.pitch, yaw: r.yaw, fov: G.engine.camera.fov, min: r.minDist, max: r.maxDist }; });
// character on-screen height in px (village)
const h = async () => s.ev(() => { const p = G.player.pos; const a = p.clone().project(G.engine.camera), b = p.clone().setY(p.y + 1.0).project(G.engine.camera); return Math.round(Math.abs(a.y - b.y) * innerHeight / 2); });
console.log('chewy px per 1m (village)', await h());
// zoom limits via wheel
for (let i = 0; i < 15; i++) { await s.page.mouse.wheel(0, 400); await s.sleep(60); }
await s.sleep(1200);
await s.log('after zoom out', () => ({ dist: G.engine.rig.dist.toFixed(1) }));
for (let i = 0; i < 30; i++) { await s.page.mouse.wheel(0, -400); await s.sleep(60); }
await s.sleep(1200);
await s.log('after zoom in', () => ({ dist: G.engine.rig.dist.toFixed(1) }));
await s.snap('47_zoom_in_min');
await s.ev(() => G.enterDungeon(4)); await s.sleep(5000);
await s.ev(() => { if (G.ui.dlg.active) G.ui.dlg.finish(-1); });
await s.log('dungeon rig', () => { const r = G.engine.rig; return { dist: r.dist, distT: r.distTarget, pitch: r.pitch, yaw: r.yaw }; });
console.log('chewy px per 1m (dungeon)', await h());
await s.close();
