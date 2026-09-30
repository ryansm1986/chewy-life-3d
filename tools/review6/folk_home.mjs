import { open } from './lib.mjs';
// Townsfolk out at 16:00, clock jumps to 19.6: do they reach home, and how long does it take? Also named villagers' night states.
const s = await open('/?fresh&nointro&hour=15.5', { wait: 3000 });
await s.ev(() => { const L = G.world.landmarks; G.player.setPos(L.plaza.x + 1, L.plaza.z + 2); G.engine.rig.focus.copy(G.player.pos); G.engine.rig.snap(); });
await s.sleep(25000); // let townsfolk move in and go out
await s.log('before', () => G.npcs.filter(n => /^folk/.test(n.id)).map(n => n.id + ':' + n.state + (n.goal?.kind ? '>' + n.goal.kind : '') + (n.visible ? '' : '(hid)')).join(' '));
await s.ev(() => { G.day.hour = 19.6; window.__h0 = performance.now(); window.__trk = {}; window.__trkT = setInterval(() => { for (const n of G.npcs) { if (!/^folk/.test(n.id)) continue; const t = window.__trk[n.id] || (window.__trk[n.id] = { start: n.visible ? Math.hypot(n.pos.x - n.home.x, n.pos.z - n.home.z) : 0, hidAt: n.visible ? null : 0, path: 0, lx: n.pos.x, lz: n.pos.z, maxStuck: 0 }); if (t.hidAt == null && !n.visible) t.hidAt = Math.round((performance.now() - window.__h0) / 1000); t.path += Math.hypot(n.pos.x - t.lx, n.pos.z - t.lz); t.lx = n.pos.x; t.lz = n.pos.z; t.maxStuck = Math.max(t.maxStuck, n.stuckT || 0); t.st = n.state + (n.goal?.kind ? '>' + n.goal.kind : ''); t.d = +Math.hypot(n.pos.x - n.home.x, n.pos.z - n.home.z).toFixed(1); } }, 250); });
for (let i = 0; i < 6; i++) {
  await s.sleep(10000);
  const r = await s.ev(() => Object.entries(window.__trk).map(([id, t]) => `${id}: start=${t.start.toFixed(1)} hidAt=${t.hidAt} walked=${t.path.toFixed(1)} d=${t.d} st=${t.st} maxStuck=${t.maxStuck.toFixed(1)}`));
  console.log(`t+${(i + 1) * 10}s hour=${await s.ev(() => G.day.hour.toFixed(2))}\n  ` + r.join('\n  '));
  if (i === 1) await s.snap('78_folk_home_20s');
}
await s.log('named at night', () => G.npcs.filter(n => !/^folk/.test(n.id)).map(n => n.id + ':' + n.state + (n.act?.slot?.kind ? ':' + n.act.slot.kind : '')).join(' '));
await s.close();
