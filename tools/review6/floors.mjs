import { open } from './lib.mjs';
const floors = (process.argv[2] || '6,11,16').split(',').map(Number);
const s = await open('/?fresh&nointro&hour=10', { wait: 2500 });
await s.ev(() => {
  G.state.flags.burrowTut = true;
  window.__scr = (p) => { const v = p.clone().setY(p.y + 0.5).project(G.engine.camera); return [Math.round((v.x * .5 + .5) * innerWidth), Math.round((-v.y * .5 + .5) * innerHeight)]; };
  window.__near = () => { let b = null, bd = 1e9; for (const m of (G.dungeon?.monsters || [])) { if (!m.alive) continue; const d = m.pos.distanceTo(G.player.pos); if (d < bd) { bd = d; b = m; } } return b; };
  window.__packNear = () => { // monster with most alive neighbours within 5
    let b = null, bn = -1; const ms = (G.dungeon?.monsters || []).filter(m => m.alive && !m.isBoss);
    for (const m of ms) { let n = 0; for (const o of ms) if (o.pos.distanceTo(m.pos) < 5) n++; const sc = n - m.pos.distanceTo(G.player.pos) * 0.02; if (sc > bn) { bn = sc; b = m; } }
    return b;
  };
  const P = G.state.player; P.lvl = 30; P.statPts = 0; P.stats = { str: 90, dex: 90, vit: 120, ene: 120 };
  for (const id of ['chomp', 'boneMastery', 'whirl', 'dig', 'guard', 'frenzy', 'bonestorm', 'throw', 'fetchMastery', 'ricochet', 'multi', 'decoy', 'blaze', 'fetchstorm', 'woof', 'goodboy', 'zoom', 'packcall', 'treat', 'howl', 'moonhowl']) P.skills[id] = 10;
  P.hotbar = ['attack', 'chomp', 'whirl', 'bonestorm', 'blaze', 'fetchstorm'];
  G.actions.recompute(); P.life = null; P.zoom = null;
});
for (const f of floors) {
  await s.ev(f => G.enterDungeon(f), f);
  await s.sleep(4500);
  await s.ev(() => { if (G.ui.dlg.active) G.ui.dlg.finish(-1); });
  await s.snap(`23_floor${f}_start`);
  console.log('floor', f, JSON.stringify(await s.fps(2000)), JSON.stringify(await s.stats()));
  await s.log('info', () => ({ theme: G.dungeon.theme.name, mons: G.dungeon.monsters.length, names: [...new Set(G.dungeon.monsters.map(m => m.name))].slice(0, 25) }));
  // close-up art shot
  await s.ev(() => { G.engine.rig.distTarget = 18; }); await s.sleep(1500);
  await s.snap(`23_floor${f}_close`);
  await s.ev(() => { G.engine.rig.distTarget = 34; });
  await s.ev(() => { const m = __packNear(); const d = m.pos.clone().sub(G.player.pos).normalize(); const p = m.pos.clone().addScaledVector(d, -7); G.player.setPos(p.x, p.z); G.companion.setPos(p.x + 0.8, p.z + 0.6); G.player.faceTo?.(m.pos.x, m.pos.z); });
  await s.sleep(1200);
  await s.snap(`23_floor${f}_pack`);
  // fight with skills: cycle bonestorm/blaze/fetchstorm/whirl via tryCast at nearest
  const seq = f >= 11 ? ['blaze', 'fetchstorm', 'bonestorm', 'whirl', 'chomp', 'woof'] : ['bonestorm', 'chomp', 'whirl', 'blaze'];
  let k = 0;
  for (let i = 0; i < 18; i++) {
    const id = seq[i % seq.length];
    await s.ev(id => { const m = __near(); if (!m) return; G.state.player.zoom = null; if (G.skills.cds) G.skills.cds[id] = 0; if (id === 'blaze' || id === 'fetchstorm') { G.actions.swapWeapons && G.derived.weaponType !== 'ball' && G.actions.swapWeapons(); G.player.setWeapon(G.derived.weaponType); } else if (G.derived.weaponType !== 'sword') { G.actions.swapWeapons(); G.player.setWeapon(G.derived.weaponType); } G.skills.tryCast(id, m.pos.clone(), m); }, id);
    await s.sleep(260);
    if (i === 2 || i === 7 || i === 13) await s.snap(`23_floor${f}_fight_${k++}`);
    if (i === 9) console.log('fight fps', f, JSON.stringify(await s.fps(1500)), JSON.stringify(await s.stats()));
  }
  await s.sleep(800);
  await s.snap(`23_floor${f}_after`);
  await s.log('after', () => ({ life: G.state.player.life, alive: G.dungeon.monsters.filter(m => m.alive).length, loot: G.dungeon.loot.list.length, lootR: G.dungeon.loot.list.map(l => l.d.item?.rarity).filter(Boolean) }));
}
await s.close();
