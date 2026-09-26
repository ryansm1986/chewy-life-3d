(() => {
  const sim = G.sim; let best = null;
  for (let r = 8; r < 22 && !best; r++) for (let a = 0; a < 32 && !best; a++) {
    const cx = Math.round(56 + Math.cos(a / 32 * 6.283) * r), cz = Math.round(60 + Math.sin(a / 32 * 6.283) * r);
    let ok = true;
    for (let z = cz - 3; z < cz + 3 && ok; z++) for (let x = cx - 4; x < cx + 4 && ok; x++) { const c = sim.canPlace('well', x, z, 0); if (!c.ok) ok = false; }
    if (ok) best = { cx, cz };
  }
  window.__lot = best;
  return JSON.stringify(best);
})()
