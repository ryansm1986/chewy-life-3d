import { open } from './lib.mjs';
// Where does the boss land on screen relative to the boss bar when Chewy fights from different sides?
const s = await open('/?fresh&nointro&hour=10', { wait: 2500 });
for (const f of [10, 20]) {
  await s.ev(f => { G.state.flags.burrowTut = true; const P = G.state.player; P.lvl = 34; P.stats = { str: 100, dex: 80, vit: 400, ene: 100 }; G.actions.recompute(); P.life = null; G.enterDungeon(f); }, f);
  await s.sleep(5500);
  await s.ev(() => { if (G.ui.dlg.active) G.ui.dlg.finish(-1); for (const m of G.dungeon.monsters) if (m !== G.dungeon.boss) m.aggro = false; });
  const bar = await s.ev(() => { const e = [...document.querySelectorAll('[class*=boss]')].filter(e => e.offsetParent && e.getBoundingClientRect().width > 300)[0]; if (!e) return null; const r = e.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height), e.className]; });
  const rows = [];
  for (const [name, a] of [['camera-side (S)', Math.PI / 4], ['east', -Math.PI / 4], ['west', 3 * Math.PI / 4], ['far-side (N)', -3 * Math.PI / 4]]) {
    for (const r of [2.5, 5]) {
      const res = await s.ev(([a, r]) => { const b = G.dungeon.boss; const x = b.pos.x + Math.cos(a) * r, z = b.pos.z + Math.sin(a) * r; if (!G.world.walkable(x, z)) return null; G.player.setPos(x, z); G.engine.rig.focus.copy(G.player.pos); G.engine.rig.snap(); const top = b.pos.clone().setY(b.pos.y + (b.rig?.height || b.height || 2.2)); const v = top.project(G.engine.camera); const c = b.pos.clone().setY(b.pos.y + 0.8).project(G.engine.camera); return { headY: Math.round((-v.y * .5 + .5) * innerHeight), bodyY: Math.round((-c.y * .5 + .5) * innerHeight), x: Math.round((c.x * .5 + .5) * innerWidth) }; }, [a, r]);
      rows.push(`${name} r=${r}: ${JSON.stringify(res)}`);
    }
  }
  console.log('floor', f, 'bossbar rect', JSON.stringify(bar), 'cam dist', await s.ev(() => G.engine.rig.distTarget));
  console.log('  ' + rows.join('\n  '));
  await s.ev(() => G.returnToVillage()); await s.sleep(2500);
}
await s.close();
