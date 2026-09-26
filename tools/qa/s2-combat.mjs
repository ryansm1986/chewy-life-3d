// Scenario 2: dungeon combat stress. Level 30, every skill at 10, cast everything at monsters for 30 s
// (including the whirl channel via a held hotbar key, dash, leap, bonestorm, packcall, decoy, treat, moonhowl, fetchstorm).
// Asserts: no exceptions, player never NaN / inside rock / off-map, kills + xp + loot happen, no stuck skill state.
// Then targeted repros: Dig Slam interrupted by a potion / by Tail Spin (P.leap never cleared), Dig Slam through walls.
import { launch, boot, waitMode, sleep, makeReport, tap } from './lib.mjs';

const R = makeReport('S2 dungeon combat stress');
const { browser, page, errors, warns } = await launch();
const DUR = +(process.env.DUR || 30);
try {
  await boot(page, 'fresh&nointro');
  await page.evaluate(() => { window.G.state.flags.burrowTut = true; window.G.enterDungeon(4); });
  await waitMode(page, 'dungeon');
  await page.evaluate(async () => {
    const G = window.G; const { SKILL_IDS } = await import('/src/rpg/skills.js');
    G.state.player.lvl = 30; G.state.player.stats.str = 120; G.state.player.stats.dex = 120; G.state.player.stats.vit = 150; G.state.player.stats.ene = 150;
    for (const id of SKILL_IDS) G.state.player.skills[id] = 10;
    G.state.player.hotbar = ['attack', 'chomp', 'whirl', 'dig', 'zoom', 'bonestorm'];
    G.actions.recompute(); G.actions.restoreAll(); G.companion.recalc();
    window.QA.xp0 = G.state.player.xp + G.state.player.lvl * 1e7;
  });
  const before = await page.evaluate(() => ({ monsters: window.G.dungeon.monsters.length, kills: window.QA.counts['monster:killed'] || 0 }));
  R.note(`floor 4: ${before.monsters} monsters`);

  // in-page stress loop (keeps timing tight, no CDP round-trips per cast)
  await page.evaluate((DUR) => new Promise(res => {
    const G = window.G, QA = window.QA, V = G.THREE.Vector3;
    const ids = ['attack', 'chomp', 'dig', 'bonestorm', 'throw', 'ricochet', 'multi', 'decoy', 'blaze', 'fetchstorm', 'woof', 'zoom', 'packcall', 'treat', 'howl', 'moonhowl'];
    QA.stress = { casts: 0, ok: 0, byId: {}, anomalies: [], samples: 0, whirlTicks: 0, teleports: 0, castErr: [] };
    let k = 0, t0 = performance.now(), whirlUntil = 0;
    const S = QA.stress;
    const iv = setInterval(() => {
      const now = performance.now();
      try {
        const P = G.player;
        if (G.mode !== 'dungeon') { S.anomalies.push('left dungeon'); }
        G.actions.restoreAll();
        // sample invariants
        S.samples++;
        if (!QA.finite(P.pos)) S.anomalies.push(`NaN pos @${(now - t0) | 0}`);
        const w = QA.wallCheck(P.pos);
        if (!w.ok) S.anomalies.push(`inside rock cell ${w.cell} @${(now - t0) | 0}ms anim=${P.anim.action?.name} leap=${!!P.leap} dash=${!!P.dash}`);
        const L = G.dungeon.layout; if (P.pos.x < 0 || P.pos.z < 0 || P.pos.x > L.W * 2 || P.pos.z > L.H * 2) S.anomalies.push('off map');
        for (const m of G.dungeon.monsters) if (!QA.finite(m.pos)) { S.anomalies.push(`monster NaN ${m.id}`); break; }
        // find a target, bring the fight to it
        let tgt = G.combat.nearest(P.pos, 'ally', 14, e => !e.breakable);
        if (!tgt) {
          const alive = G.dungeon.monsters.filter(m => m.alive);
          if (alive.length) { const m = alive[(Math.random() * alive.length) | 0]; P.setPos(m.pos.x, m.pos.z); S.teleports++; tgt = m; }
        }
        if (now < whirlUntil) { S.whirlTicks++; return; }
        G.input.keys.delete('1');
        if (k % 9 === 8) { whirlUntil = now + 1500; G.input.keys.add('1'); k++; S.byId.whirl = (S.byId.whirl || 0) + 1; return; }
        const id = ids[k++ % ids.length];
        if (Math.random() < 0.3) G.skills.cds = {};
        const aim = tgt ? tgt.pos.clone() : P.pos.clone().add(new V(Math.random() * 6 - 3, 0, Math.random() * 6 - 3));
        S.casts++;
        const ok = G.skills.tryCast(id, aim, tgt);
        if (ok) { S.ok++; S.byId[id] = (S.byId[id] || 0) + 1; }
      } catch (e) { S.castErr.push(String(e && e.stack || e).slice(0, 300)); }
      if (now - t0 > DUR * 1000) { clearInterval(iv); G.input.keys.delete('1'); res(); }
    }, 110);
  }), DUR);
  const S = await page.evaluate(() => window.QA.stress);
  R.note(`casts=${S.casts} started=${S.ok} whirlTicks=${S.whirlTicks} teleports=${S.teleports} byId=${JSON.stringify(S.byId)}`);
  R.check('no exceptions thrown by tryCast/update during stress', !S.castErr.length, S.castErr.slice(0, 3).join(' | '));
  const anomalies = [...new Set(S.anomalies)];
  R.check('player never NaN / inside rock / off-map', !anomalies.length, anomalies.slice(0, 6).join(' | '));
  const allFired = ['attack', 'chomp', 'dig', 'bonestorm', 'throw', 'ricochet', 'multi', 'decoy', 'blaze', 'fetchstorm', 'woof', 'zoom', 'packcall', 'treat', 'howl', 'moonhowl', 'whirl'].filter(id => !S.byId[id]);
  R.check('every skill was actually cast at least once', !allFired.length, allFired.length ? 'never started: ' + allFired.join(',') : '');
  await sleep(page, 2500);
  const after = await page.evaluate(() => ({ kills: window.QA.counts['monster:killed'] || 0, xp: window.G.state.player.xp + window.G.state.player.lvl * 1e7, xp0: window.QA.xp0, loot: window.G.dungeon.loot.list.length, drops: window.QA.sfx.filter(s => s === 'drop_item').length, alive: window.G.dungeon.monsters.filter(m => m.alive).length, orbits: window.G.skills.orbits.length, pups: (window.G.skills.pups || []).filter(p => p.alive).length, decoys: (window.G.skills.decoys || []).filter(d => d.alive).length, zones: window.G.combat.zones.length, proj: window.G.combat.projectiles.length }));
  R.note(JSON.stringify(after));
  R.check('monsters die (monster:killed fired)', after.kills - before.kills > 5, `${after.kills - before.kills} kills`);
  R.check('xp increases', after.xp > after.xp0, `${after.xp0} -> ${after.xp}`);
  R.check('loot drops', after.drops > 0 || after.loot > 0, `drop sfx ${after.drops}, on ground ${after.loot}`);
  const st = await page.evaluate(() => window.QA.state());
  R.check('no stuck skill state after casting stops (leap/dash/channel/invuln)', !st.leap && !st.dash && !st.channel && !st.invuln, JSON.stringify(st));
  // can the player still walk?
  const p0 = await page.evaluate(() => window.G.player.pos.clone());
  for (const k of ['w', 'a', 's', 'd']) await tap(page, k, 350);
  const moved = await page.evaluate(p0 => { const P = window.G.player.pos; return Math.hypot(P.x - p0.x, P.z - p0.z); }, p0);
  R.check('player can still move with WASD after the stress run', moved > 0.3, `moved ${moved.toFixed(2)}`);

  // ---------------------------------------------------------------- targeted: Dig Slam interrupted
  async function leapInterrupted(label, interrupt) {
    await page.evaluate(() => { const G = window.G; G.skills.clearAll(); G.skills.cds = {}; G.player.leap = null; G.player.dash = null; G.player.anim.stop(); G.player.invuln = false; for (const m of G.dungeon.monsters) m.status.stun = 99; const s = G.dungeon.startPos; G.player.setPos(s.x, s.z); });
    await sleep(page, 200);
    const r = await page.evaluate(async (interrupt) => {
      const G = window.G, P = G.player, V = G.THREE.Vector3;
      G.actions.recompute(); G.actions.restoreAll();
      const ok = G.skills.tryCast('dig', P.pos.clone().add(new V(1.5, 0, 0)));
      await new Promise(r => setTimeout(r, 150));
      if (interrupt === 'potion') { G.actions.damage(40); window.__qaPot = G.state.potions.heart; }
      if (interrupt === 'whirl') { G.input.keys.add('1'); }
      return { ok, leap: !!P.leap };
    }, interrupt);
    if (interrupt === 'potion') await tap(page, 'q');
    if (interrupt === 'whirl') { await sleep(page, 400); await page.evaluate(() => window.G.input.keys.delete('1')); }
    await sleep(page, 1500);
    const st = await page.evaluate(() => ({ leap: !!window.G.player.leap, anim: window.G.player.anim.action?.name || null, pos: window.G.player.pos.clone() }));
    await tap(page, 'd', 500);
    const moved = await page.evaluate(p0 => { const P = window.G.player.pos; return Math.hypot(P.x - p0.x, P.z - p0.z); }, st.pos);
    R.check(`Dig Slam interrupted by ${label}: player not frozen`, !st.leap && moved > 0.2, `cast=${r.ok} leapAfter1.5s=${st.leap} anim=${st.anim} movedWithD=${moved.toFixed(2)}`);
    await page.evaluate(() => { window.G.player.leap = null; window.G.player.anim.stop(); });
  }
  await leapInterrupted('a Heart Treat (Q)', 'potion');
  await leapInterrupted('Tail Spin (hotbar key held)', 'whirl');

  // ---------------------------------------------------------------- targeted: Dig Slam through a wall
  const tunnel = await page.evaluate(async () => {
    const G = window.G, L = G.dungeon.layout, P = G.player, V = G.THREE.Vector3;
    for (const m of G.dungeon.monsters) m.status.stun = 99;
    // BFS distance helper on the cell grid
    const bfs = (sx, sy) => { const D = new Int32Array(L.W * L.H).fill(-1), q = [sy * L.W + sx]; D[q[0]] = 0; for (let h = 0; h < q.length; h++) { const i = q[h], x = i % L.W, y = (i / L.W) | 0; for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + ox, ny = y + oy; if (!L.at(nx, ny)) continue; const j = ny * L.W + nx; if (D[j] < 0) { D[j] = D[i] + 1; q.push(j); } } } return D; };
    // find floor cell A, direction d: A+d is wall, A+2d is floor (1-cell wall), whose walking distance is long
    const cands = [];
    for (let y = 2; y < L.H - 2; y++) for (let x = 2; x < L.W - 2; x++) {
      if (!L.at(x, y)) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (!L.at(x + dx, y + dy) && L.at(x + 2 * dx, y + 2 * dy) && L.at(x + 3 * dx, y + 3 * dy)) cands.push({ x, y, dx, dy });
      }
    }
    if (!cands.length) return { skipped: 'no 1-cell walls on this floor' };
    let best = null;
    for (const c of cands.slice(0, 400)) { const D = bfs(c.x, c.y); const far = D[(c.y + 2 * c.dy) * L.W + c.x + 2 * c.dx]; if (far > 6 && (!best || far > best.far)) best = { ...c, far }; }
    if (!best) return { skipped: 'walls here are short-cuts only' };
    G.skills.clearAll(); G.skills.cds = {}; P.anim.stop(); P.leap = null; G.actions.restoreAll();
    const sx = (best.x + 0.5) * 2, sz = (best.y + 0.5) * 2;
    P.setPos(sx, sz);
    await new Promise(r => setTimeout(r, 200));
    const aim = new V(sx + best.dx * 5, 0, sz + best.dy * 5);
    const ok = G.skills.tryCast('dig', aim);
    await new Promise(r => setTimeout(r, 1500));
    const cx = Math.floor(P.pos.x / 2), cy = Math.floor(P.pos.z / 2);
    const D = bfs(best.x, best.y);
    return { ok, from: [best.x, best.y], dir: [best.dx, best.dy], walkDistToOtherSide: best.far, endCell: [cx, cy], endWalkDist: D[cy * L.W + cx], leapDist: Math.hypot(P.pos.x - sx, P.pos.z - sz).toFixed(2) };
  });
  if (tunnel.skipped) R.note('dig-through-wall: ' + tunnel.skipped);
  else R.check('Dig Slam cannot leap through a 1-cell rock wall', !(tunnel.endWalkDist > 4), JSON.stringify(tunnel));
} catch (e) { errors.push('[harness] ' + e.stack); }
const failed = R.finish(errors, warns);
await browser.close();
process.exit(failed ? 1 : 0);
