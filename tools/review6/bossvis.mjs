import { open } from './lib.mjs';
// During real-input boss fights: how often is Chewy hidden (camera ray to his chest AND head blocked) by the boss or
// arena props? Samples every ~0.3 s; snaps a few hidden frames.  usage: node bossvis.mjs <floor> [ms]
const f = +(process.argv[2] || 20);
const dur = +(process.argv[3] || 25000);
const lvl = 14 + f;
const s = await open(`/?fresh&nointro&hour=10`, { wait: 2500 });
await s.ev(([f, lvl]) => {
  G.state.flags.burrowTut = true;
  const P = G.state.player; P.lvl = lvl; P.statPts = 0; P.stats = { str: 40 + lvl * 2, dex: 35 + lvl * 1.5, vit: 50 + lvl * 3, ene: 40 + lvl * 1.5 };
  for (const id of ['chomp', 'boneMastery', 'whirl', 'bonestorm', 'woof', 'packcall']) P.skills[id] = Math.min(8, Math.round(lvl / 4));
  P.hotbar = ['attack', 'chomp', 'whirl', 'bonestorm', 'woof', 'packcall'];
  G.actions.recompute(); P.life = null; P.zoom = null;
  G.enterDungeon(f);
}, [f, lvl]);
await s.sleep(5500);
await s.ev(() => {
  if (G.ui.dlg.active) G.ui.dlg.finish(-1);
  const T = G.THREE; const rc = new T.Raycaster();
  window.__scr = (p, y = 0.6) => { const v = p.clone().setY(p.y + y).project(G.engine.camera); return [Math.round((v.x * .5 + .5) * innerWidth), Math.round((-v.y * .5 + .5) * innerHeight)]; };
  const b = G.dungeon.boss;
  for (const m of G.dungeon.monsters) if (m !== b && m.pos.distanceTo(b.pos) < 14) { m.alive = false; m.mesh && (m.mesh.visible = false); m.rig?.root && (m.rig.root.visible = false); }
  let best = null; for (let a = 0; a < 48; a++) for (const r of [9, 8, 10, 7]) { const x = b.pos.x + Math.cos(a / 48 * 6.283) * r, z = b.pos.z + Math.sin(a / 48 * 6.283) * r; if (!G.world.walkable(x, z)) continue; let ok = true; for (let t = 0.1; t < 1; t += 0.1) if (!G.world.walkable(x + (b.pos.x - x) * t, z + (b.pos.z - z) * t)) ok = false; if (!ok) continue; const sc = (x - b.pos.x) + (z - b.pos.z); if (!best || sc > best.sc) best = { x, z, sc }; }
  G.player.setPos(best.x, best.z); G.companion.setPos(best.x + 0.8, best.z + 0.6); G.engine.rig.focus.copy(G.player.pos); G.engine.rig.snap?.();
  const pr = G.player.rig.root, sr = G.companion.rig.root;
  const isOf = (o, root) => { for (let p = o; p; p = p.parent) if (p === root) return true; return false; };
  const bossRoot = b.rig?.root || b.model?.root || b.mesh;
  window.__vis = { n: 0, hid: 0, byBoss: 0, byOther: {}, offscreen: 0 };
  window.__probe = () => {
    const cam = G.engine.camera.position; const list = [];
    G.world.scene.traverse(o => { if (!o.isMesh || !o.visible || o.isInstancedMesh) return; if (isOf(o, pr) || isOf(o, sr)) return; for (let p = o; p; p = p.parent) if (!p.visible) return; const m = o.material; if (m && m.transparent && m.opacity < 0.5) return; if (m && m.blending === T.AdditiveBlending) return; list.push(o); });
    let blocked = 0, by = null;
    for (const h of [0.5, 0.95]) { const tgt = G.player.pos.clone().setY(G.player.pos.y + h); const dir = tgt.clone().sub(cam); const L = dir.length(); dir.normalize(); rc.set(cam, dir); rc.far = L - 0.3; const hits = rc.intersectObjects(list, false); if (hits.length) { blocked++; by = hits[0].object; } }
    const o = window.__vis; o.n++;
    const sc = __scr(G.player.pos, 0.6); if (sc[0] < 0 || sc[0] > innerWidth || sc[1] < 0 || sc[1] > innerHeight) o.offscreen++;
    if (blocked === 2) { o.hid++; if (bossRoot && isOf(by, bossRoot)) o.byBoss++; else { let nm = by.name || by.geometry?.type || '?'; for (let p = by; p; p = p.parent) if (p.userData?.type || p.userData?.kind || p.name) { nm = p.userData?.type || p.userData?.kind || p.name; break; } o.byOther[nm] = (o.byOther[nm] || 0) + 1; } return true; }
    return false;
  };
});
await s.sleep(1000);
const SAFE = (p) => p[0] > 330 && p[0] < 1330 && p[1] > 130 && p[1] < 680;
const t0 = Date.now(); let i = 0, shots = 0;
while (Date.now() - t0 < dur) {
  const st = await s.ev(() => { const b = G.dungeon.boss; if (!b || !b.alive) return null; if (G.state.player.life != null && G.state.player.life < G.derived.lifeMax * 0.4) G.state.player.life = null; const hid = __probe(); return { sc: __scr(b.pos, 0.8), me: __scr(G.player.pos, 0.5), hid }; });
  if (!st) break;
  if (st.hid && shots < 3) { await s.snap(`62_bossvis${f}_hidden_${shots++}`); await s.log('me@', () => __scr(G.player.pos, 0.5)); }
  let target = st.sc;
  if (!SAFE(target)) { const dx = target[0] - st.me[0], dy = target[1] - st.me[1], L = Math.hypot(dx, dy) || 1; const g = [Math.min(1300, Math.max(360, st.me[0] + dx / L * 180)), Math.min(660, Math.max(160, st.me[1] + dy / L * 180))]; await s.page.mouse.move(g[0], g[1]); await s.page.mouse.down(); await s.sleep(250); await s.page.mouse.up(); i++; continue; }
  await s.page.mouse.move(target[0], target[1]);
  const k = i % 6;
  if (k < 3) { await s.page.mouse.down(); await s.sleep(300); await s.page.mouse.up(); }
  else if (k === 3) { await s.page.mouse.down({ button: 'right' }); await s.sleep(150); await s.page.mouse.up({ button: 'right' }); }
  else if (k === 4) await s.key('2'); else await s.key('3');
  await s.sleep(60); i++;
}
await s.log('visibility', () => { const o = __vis; return { ...o, pctHidden: +(100 * o.hid / Math.max(1, o.n)).toFixed(1) }; });
await s.close();
