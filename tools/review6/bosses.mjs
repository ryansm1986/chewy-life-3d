import { open } from './lib.mjs';
const floors = (process.argv[2] || '5,10,15,20').split(',').map(Number);
const s = await open('/?fresh&nointro&hour=10', { wait: 2500 });
await s.ev(() => {
  G.state.flags.burrowTut = true;
  window.__scr = (p) => { const v = p.clone().setY(p.y + 0.5).project(G.engine.camera); return [Math.round((v.x * .5 + .5) * innerWidth), Math.round((-v.y * .5 + .5) * innerHeight)]; };
  const P = G.state.player; P.lvl = 34; P.statPts = 0; P.stats = { str: 110, dex: 110, vit: 160, ene: 140 };
  for (const id of ['chomp', 'boneMastery', 'whirl', 'dig', 'guard', 'frenzy', 'bonestorm', 'throw', 'fetchMastery', 'ricochet', 'multi', 'decoy', 'blaze', 'fetchstorm', 'woof', 'goodboy', 'zoom', 'packcall', 'treat', 'howl', 'moonhowl']) P.skills[id] = 12;
  P.hotbar = ['attack', 'chomp', 'whirl', 'bonestorm', 'blaze', 'fetchstorm'];
  G.actions.recompute(); P.life = null; P.zoom = null;
});
for (const f of floors) {
  await s.ev(f => G.enterDungeon(f), f);
  await s.sleep(5000);
  await s.ev(() => { if (G.ui.dlg.active) G.ui.dlg.finish(-1); });
  const b = await s.ev(() => { const b = G.dungeon.boss; return b ? { name: b.name, id: b.id, life: b.lifeMax, pos: [b.pos.x, b.pos.z] } : null; });
  console.log('floor', f, JSON.stringify(b));
  if (!b) continue;
  // teleport near boss (outside aggro), then walk in
  await s.ev(() => { const b = G.dungeon.boss; const d = new G.THREE.Vector3(1, 0, 1).normalize(); const p = b.pos.clone().addScaledVector(d, 11); if (!G.world.walkable(p.x, p.z)) { p.copy(b.pos).add(new G.THREE.Vector3(-8, 0, 0)); } G.player.setPos(p.x, p.z); G.companion.setPos(p.x + 0.8, p.z + 0.6); G.engine.rig.focus.copy(G.player.pos); G.engine.rig.snap(); });
  await s.sleep(800);
  await s.snap(`24_boss${f}_approach`);
  await s.ev(() => { const b = G.dungeon.boss; G.player.moveTarget = b.pos.clone(); });
  await s.sleep(900); await s.snap(`24_boss${f}_intro`);
  await s.sleep(1300); await s.snap(`24_boss${f}_intro2`);
  // fight
  const seq = ['bonestorm', 'blaze', 'fetchstorm', 'chomp', 'woof', 'whirl', 'chomp'];
  for (let i = 0; i < 26; i++) {
    const id = seq[i % seq.length];
    await s.ev(id => { const b = G.dungeon.boss; if (!b || !b.alive) return; G.state.player.zoom = null; if (G.state.player.life != null && G.state.player.life < G.derived.lifeMax * 0.4) G.state.player.life = null; if (G.skills.cds) G.skills.cds[id] = 0; const wantBall = id === 'blaze' || id === 'fetchstorm'; if ((G.derived.weaponType === 'ball') !== wantBall) { G.actions.swapWeapons(); G.player.setWeapon(G.derived.weaponType); } if (!wantBall && G.player.pos.distanceTo(b.pos) > 3) G.player.moveTarget = b.pos.clone(); G.skills.tryCast(id, b.pos.clone(), b); }, id);
    await s.sleep(300);
    if (i === 5 || i === 14 || i === 22) await s.snap(`24_boss${f}_fight_${i}`);
    if (i === 12) console.log('boss fps', f, JSON.stringify(await s.fps(1500)), JSON.stringify(await s.stats()));
  }
  await s.log('boss after', () => { const b = G.dungeon.boss; return { alive: b?.alive, life: b && Math.round(b.life), max: b?.lifeMax, player: G.state.player.life, adds: G.dungeon.monsters.filter(m => m.alive).length }; });
  // finish it off
  await s.ev(() => { const b = G.dungeon.boss; if (b?.alive) { b.life = 1; } });
  await s.ev(() => { const b = G.dungeon.boss; if (b?.alive) { G.skills.cds && (G.skills.cds.chomp = 0); G.state.player.zoom = null; G.skills.tryCast('bonestorm', b.pos.clone(), b); } });
  await s.sleep(700);
  await s.snap(`24_boss${f}_death`);
  await s.sleep(1800);
  await s.snap(`24_boss${f}_loot`);
  await s.log('loot', () => G.dungeon.loot.list.map(l => (l.d.item?.rarity || l.d.type) + ':' + (l.d.item?.name || '')).slice(0, 15));
}
await s.close();
