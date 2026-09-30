import { open } from './lib.mjs';
// Floor 1 at level 1 with a fresh save, real mouse only: click the nearest reachable monster when on screen (Chewy
// walks up and swings), otherwise click a point ~5 m along the nav route toward it. Potions with Q when low.
const floor = +(process.argv[2] || 1);
const dur = +(process.argv[3] || 70000);
const s = await open(`/?fresh&nointro&hour=10`, { wait: 2500 });
await s.ev((floor) => { window.__navFor = () => G.player.nav; G.enterDungeon(floor); }, floor);
await s.sleep(5000);
await s.ev(() => {
  window.__scr = (p, y = 0.6) => { const v = p.clone().setY(p.y + y).project(G.engine.camera); return [Math.round((v.x * .5 + .5) * innerWidth), Math.round((-v.y * .5 + .5) * innerHeight)]; };
  window.__plan = () => {
    const nav = __navFor(G.world); const P = G.player.pos; let best = null;
    for (const m of G.dungeon.monsters) { if (!m.alive) continue; const e = Math.hypot(m.pos.x - P.x, m.pos.z - P.z); if (e > 40) continue; if (!best || e < best.e) best = { m, e }; }
    // pick among the 6 closest by euclid the one with shortest route
    const cands = G.dungeon.monsters.filter(m => m.alive).map(m => ({ m, e: Math.hypot(m.pos.x - P.x, m.pos.z - P.z) })).sort((a, b) => a.e - b.e).slice(0, 6);
    let pick = null;
    for (const c of cands) { const r = nav.findPath(P.x, P.z, c.m.pos.x, c.m.pos.z, 60000); if (!r) continue; let len = 0, px = P.x, pz = P.z; for (let i = 0; i < r.pts.length; i += 2) { len += Math.hypot(r.pts[i] - px, r.pts[i + 1] - pz); px = r.pts[i]; pz = r.pts[i + 1]; } if (!pick || len < pick.len) pick = { m: c.m, len, pts: r.pts }; }
    if (!pick) return null;
    // way point ~5 m along the route
    let left = 5, px = P.x, pz = P.z, wx = px, wz = pz;
    for (let i = 0; i < pick.pts.length; i += 2) { const d = Math.hypot(pick.pts[i] - px, pick.pts[i + 1] - pz); if (d >= left) { wx = px + (pick.pts[i] - px) * left / d; wz = pz + (pick.pts[i + 1] - pz) * left / d; left = 0; break; } left -= d; px = pick.pts[i]; pz = pick.pts[i + 1]; wx = px; wz = pz; }
    const w = new G.THREE.Vector3(wx, G.world.heightAt ? G.world.heightAt(wx, wz) : 0, wz);
    return { name: pick.m.name, len: +pick.len.toFixed(1), msc: __scr(pick.m.pos), wsc: __scr(w, 0) };
  };
});
const SAFE = (p) => p[0] > 330 && p[0] < 1330 && p[1] > 130 && p[1] < 680;
const t1 = Date.now(); let i = 0, shot = 0, pots = 0; const log = [];
while (Date.now() - t1 < dur) {
  const st = await s.ev(() => { if (G.ui.dlg.active) G.ui.dlg.finish?.(-1); return { plan: __plan(), life: Math.round(G.state.player.life ?? G.derived.lifeMax), max: G.derived.lifeMax, lvl: G.state.player.lvl, dead: !!G.playerDead || G.state.player.life === 0, kills: G.dungeon.monsters.filter(m => !m.alive).length, total: G.dungeon.monsters.length, loot: G.dungeon.loot.list.length }; });
  if (!st) break;
  if (i % 10 === 0) log.push(`${((Date.now() - t1) / 1000).toFixed(0)}s life=${st.life}/${st.max} lvl=${st.lvl} kills=${st.kills}/${st.total} loot=${st.loot} next=${st.plan?.name}@${st.plan?.len}`);
  if (st.dead) { log.push('DEAD at ' + ((Date.now() - t1) / 1000).toFixed(0)); await s.snap(`86_f${floor}_dead`); await s.sleep(2500); await s.snap(`86_f${floor}_dead2`); break; }
  if (st.life < st.max * 0.35) { await s.key('q'); pots++; }
  if (!st.plan) break;
  if (SAFE(st.plan.msc) && st.plan.len < 7) {
    await s.page.mouse.move(st.plan.msc[0], st.plan.msc[1]);
    if (i % 6 === 5) { await s.page.mouse.down({ button: 'right' }); await s.sleep(150); await s.page.mouse.up({ button: 'right' }); }
    else { await s.page.mouse.down(); await s.sleep(450); await s.page.mouse.up(); }
  } else {
    const w = st.plan.wsc; const g = [Math.min(1300, Math.max(360, w[0])), Math.min(660, Math.max(160, w[1]))];
    await s.page.mouse.move(g[0], g[1]); await s.page.mouse.down(); await s.sleep(250); await s.page.mouse.up();
  }
  await s.sleep(80);
  if (i % 14 === 7 && shot < 6) await s.snap(`86_f${floor}_fight_${shot++}`);
  i++;
}
console.log(log.join('\n'));
console.log('end', JSON.stringify(await s.ev(() => ({ lvl: G.state.player.lvl, xp: G.state.player.xp, life: G.state.player.life, loot: G.dungeon.loot.list.map(l => l.d.item?.rarity || l.d.type), coins: G.state.coins, kills: G.dungeon.monsters.filter(m => !m.alive).length, potions: G.state.potions }))), 'potions used', pots);
await s.snap(`86_f${floor}_end`);
await s.close();
