(() => {
  const P = G.state.player; P.lvl = 30; P.statPts = 0;
  for (const id of Object.keys(G.state.player.skills)) {}
  const ids = ['chomp','boneMastery','whirl','dig','guard','frenzy','bonestorm','throw','fetchMastery','ricochet','multi','decoy','blaze','fetchstorm','woof','goodboy','zoom','packcall','treat','howl','moonhowl'];
  for (const id of ids) P.skills[id] = 8;
  P.stats.ene = 200; P.stats.vit = 120;
  G.actions.recompute();
  G.state.player.zoom = null; G.state.player.life = null;
  window.castAt = (id) => { const m = R.near(); if (!m) return 'no mon'; G.state.player.zoom = null; G.skills.cds[id] = 0; const ok = G.skills.tryCast(id, m.pos.clone(), m); return id + ':' + ok; };
  return 'lvl30 ' + JSON.stringify({ zoomMax: G.derived.zoomMax, life: G.derived.lifeMax, dmg: [G.derived.dmgMin, G.derived.dmgMax] });
})()
