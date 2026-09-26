(() => {
  const T = G.THREE;
  window.R = {
    alive() { return G.dungeon.monsters.filter(m => m.alive && !m.breakable); },
    near(filter) { const p = G.player.pos; let b = null, bd = 1e9; for (const m of R.alive()) { if (filter && !filter(m)) continue; const d = Math.hypot(m.pos.x - p.x, m.pos.z - p.z); if (d < bd) { bd = d; b = m; } } return b; },
    tele(m, off = 3) { const a = Math.random() * 6.28; const x = m.pos.x + Math.cos(a) * off, z = m.pos.z + Math.sin(a) * off; G.player.setPos(x, z); G.companion.setPos(x + 0.6, z + 0.6); G.engine.rig.focus.copy(G.player.pos); G.engine.rig.snap(); },
    teleSafe(m, off = 3) { for (let k = 0; k < 16; k++) { const a = k / 16 * 6.28; const x = m.pos.x + Math.cos(a) * off, z = m.pos.z + Math.sin(a) * off; const v = new T.Vector3(x, 0, z); const q = v.clone(); G.world.collision?.resolve?.(q, 0.3, m.pos); if (q.distanceTo(v) < 0.05) { G.player.setPos(x, z); G.companion.setPos(x + 0.6, z + 0.6); G.engine.rig.focus.copy(G.player.pos); G.engine.rig.snap(); return 'ok'; } } R.tele(m, off); return 'fallback'; },
    scr(p) { const v = new T.Vector3(p.x, (p.y || 0) + 0.5, p.z).project(G.engine.camera); return [Math.round((v.x * 0.5 + 0.5) * innerWidth), Math.round((-v.y * 0.5 + 0.5) * innerHeight)]; },
    fight(ms, skill = 'attack', every = 120) { return new Promise(res => { const t0 = performance.now(); let casts = 0; const iv = setInterval(() => { const m = R.near(); if (!m || performance.now() - t0 > ms || G.playerDead) { clearInterval(iv); res(casts); return; } const d = Math.hypot(m.pos.x - G.player.pos.x, m.pos.z - G.player.pos.z); if (d > 1.6 && skill === 'attack' && G.derived.weaponType === 'sword') G.player.moveTarget = m.pos.clone(); else if (G.skills.tryCast(skill, m.pos.clone(), m)) casts++; }, every); }); },
    summary() { const a = R.alive(); return { alive: a.length, hp: Math.round(G.state.player.life ?? G.derived.lifeMax), lvl: G.state.player.lvl, xp: G.state.player.xp, coins: G.state.coins, loot: G.dungeon.loot?.list?.length, dead: G.playerDead }; },
  };
  return 'helpers ok';
})()
