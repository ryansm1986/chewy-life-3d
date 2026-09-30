import { open } from './lib.mjs';
// Resource growth per dungeon trip: clear a whole floor (all monsters + chests), vacuum all loot, compare to build costs.
const floors = (process.argv[2] || '2,3').split(',').map(Number);
const s = await open('/?fresh&nointro&hour=10', { wait: 2500 });
const snapRes = () => s.ev(() => ({ coins: G.state.coins ?? G.state.player?.coins, mats: { ...(G.state.materials || G.state.mats || {}) } }));
await s.log('state keys', () => Object.keys(G.state));
const before = await snapRes();
console.log('before', JSON.stringify(before));
for (const f of floors) {
  await s.ev(f => {
    G.state.flags.burrowTut = true; G.state.flags.autoPickNormal = true;
    const P = G.state.player; P.lvl = Math.max(P.lvl, 2 + f * 2); P.stats = { str: 30 + f * 4, dex: 25 + f * 3, vit: 60, ene: 40 }; P.skills.chomp = Math.max(P.skills.chomp || 0, 3 + f);
    G.actions.recompute(); P.life = null; G.enterDungeon(f);
  }, f);
  await s.sleep(4500);
  await s.ev(() => { if (G.ui.dlg.active) G.ui.dlg.finish(-1); });
  const r0 = await snapRes();
  const info = await s.ev(() => ({ mons: G.dungeon.monsters.length, chests: G.world.interactables.filter(i => /chest/i.test(i.label)).length }));
  // kill loop: teleport next to each alive monster, drop its life to 0 via a real hit path (chomp) until dead
  for (let pass = 0; pass < 60; pass++) {
    const left = await s.ev(() => {
      let n = 0;
      for (const m of G.dungeon.monsters) {
        if (!m.alive) continue; if (n++ > 6) break;
        G.player.setPos(m.pos.x + 1.2, m.pos.z); G.state.player.life = null; G.state.player.zoom = null;
        m.life = Math.min(m.life, 1); if (G.skills.cds) G.skills.cds.chomp = 0; G.skills.tryCast('chomp', m.pos.clone(), m);
      }
      return G.dungeon.monsters.filter(m => m.alive).length;
    });
    await s.sleep(250);
    if (!left) break;
  }
  await s.sleep(800);
  // open chests
  await s.ev(() => { for (const it of [...G.world.interactables]) if (/chest/i.test(it.label)) { G.player.setPos(it.pos.x + 0.8, it.pos.z); it.onInteract(); } });
  await s.sleep(1500);
  // vacuum loot: walk onto each drop
  for (let k = 0; k < 40; k++) {
    const n = await s.ev(() => { const L = G.dungeon.loot.list; for (const e of [...L].slice(0, 12)) { G.player.setPos(e.pos?.x ?? e.mesh.position.x, e.pos?.z ?? e.mesh.position.z); G.dungeon.loot.tryPickup(e, true); } return G.dungeon.loot.list.length; });
    await s.sleep(200);
    if (!n) break;
  }
  const r1 = await snapRes();
  const diff = { coins: r1.coins - r0.coins, mats: Object.fromEntries(Object.keys({ ...r1.mats, ...r0.mats }).map(k => [k, (r1.mats[k] || 0) - (r0.mats[k] || 0)]).filter(([, v]) => v)) };
  console.log('floor', f, JSON.stringify(info), 'gain', JSON.stringify(diff), 'lootLeft', await s.ev(() => G.dungeon.loot.list.length), 'bag', await s.ev(() => (G.state.player.bag || G.state.inventory || []).filter?.(Boolean).length));
  await s.ev(() => G.returnToVillage()); await s.sleep(2500);
}
const after = await snapRes();
console.log('after', JSON.stringify(after));
await s.log('costs', async () => { const B = (await import('/src/world/buildings/index.js').catch(() => null)); return null; });
await s.close();
