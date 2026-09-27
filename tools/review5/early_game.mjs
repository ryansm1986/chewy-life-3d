import { open } from './lib.mjs';
// Early game with real input: fresh save through the intro, Esc out of the chat menu, walk to the Burrow by
// clicking along the quest arrow, then fight floor 1 at level 1 with LMB/RMB only (no stat tweaks).
const s = await open('/?fresh&hour=9', { wait: 1500 });
// advance intro lines with F until the chat menu shows up, then Esc
for (let i = 0; i < 12; i++) { await s.key('f'); await s.sleep(450); }
const menu = await s.ev(() => ({ active: G.ui.dlg.active, choices: [...document.querySelectorAll('.dlg button, .dlg .choice, [class*=choice]')].map(b => b.innerText.trim()).filter(Boolean).slice(0, 8) }));
console.log('dialog before Esc', JSON.stringify(menu));
await s.snap('80_intro_menu');
await s.key('Escape'); await s.sleep(700);
console.log('after Esc', JSON.stringify(await s.ev(() => ({ dlg: G.ui.dlg.active, locked: G.player.controlLocked, paused: !!document.querySelector('.menu.open, .pause.open, [class*=paused]') }))));
await s.snap('80b_after_esc');
// walk to the Burrow using click-to-move toward the quest target (real clicks, 180 px ahead of Chewy)
const t0 = Date.now(); let clicks = 0;
while (Date.now() - t0 < 45000) {
  const st = await s.ev(() => { const t = G.questTarget?.(); if (!t?.pos) return null; const d = G.player.pos.distanceTo(t.pos); const me = G.player.pos.clone().project(G.engine.camera); const tp = t.pos.clone().project(G.engine.camera); return { d, mode: G.mode, me: [(me.x * .5 + .5) * innerWidth, (-me.y * .5 + .5) * innerHeight], tp: [(tp.x * .5 + .5) * innerWidth, (-tp.y * .5 + .5) * innerHeight] }; });
  if (!st || st.mode !== 'village' || st.d < 2.5) break;
  const dx = st.tp[0] - st.me[0], dy = st.tp[1] - st.me[1], L = Math.hypot(dx, dy) || 1;
  const k = Math.min(260, L);
  const x = Math.min(1300, Math.max(360, st.me[0] + dx / L * k)), y = Math.min(660, Math.max(160, st.me[1] + dy / L * k));
  await s.page.mouse.move(x, y); await s.page.mouse.down(); await s.sleep(80); await s.page.mouse.up(); clicks++;
  await s.sleep(1100);
}
console.log('walk to burrow', ((Date.now() - t0) / 1000).toFixed(1), 's clicks', clicks, JSON.stringify(await s.ev(() => ({ mode: G.mode, d: G.questTarget?.()?.pos && +G.player.pos.distanceTo(G.questTarget().pos).toFixed(1), prompt: document.querySelector('.hud-interact, .interact, [class*=prompt]')?.innerText }))));
await s.snap('81_at_burrow_gate');
await s.key('f'); await s.sleep(1500);
await s.snap('81b_gate_f');
console.log('after F at gate', JSON.stringify(await s.ev(() => ({ mode: G.mode, dlg: G.ui.dlg.active, choices: [...document.querySelectorAll('.dlg button, [class*=choice]')].map(b => b.innerText.trim()).filter(Boolean).slice(0, 6) }))));
// pick first choice if a menu is up
await s.key('1'); await s.sleep(5000);
console.log('mode', JSON.stringify(await s.ev(() => ({ mode: G.mode, floor: G.dungeon?.floor ?? G.state.dungeon?.floor, dlg: G.ui.dlg.active }))));
await s.snap('82_floor1_arrival');
await s.ev(() => { window.__scr = (p, y = 0.6) => { const v = p.clone().setY(p.y + y).project(G.engine.camera); return [Math.round((v.x * .5 + .5) * innerWidth), Math.round((-v.y * .5 + .5) * innerHeight)]; };
  window.__near = () => { let b = null, bd = 1e9; for (const m of (G.dungeon?.monsters || [])) { if (!m.alive) continue; const d = m.pos.distanceTo(G.player.pos); if (d < bd) { bd = d; b = m; } } return b ? { sc: __scr(b.pos), d: bd, name: b.name } : null; }; });
// fight with real LMB (hold) / RMB, walk toward nearest monster when off-screen
const SAFE = (p) => p[0] > 330 && p[0] < 1330 && p[1] > 130 && p[1] < 680;
const t1 = Date.now(); let i = 0, shot = 0; const log = [];
while (Date.now() - t1 < 50000) {
  const st = await s.ev(() => { if (G.ui.dlg.active) { G.ui.dlg.finish?.(-1); } return { n: __near(), life: Math.round(G.state.player.life ?? G.derived.lifeMax), max: G.derived.lifeMax, lvl: G.state.player.lvl, xp: G.state.player.xp, dead: !!G.playerDead, kills: G.dungeon?.monsters.filter(m => !m.alive).length }; });
  if (!st) break;
  if (i % 8 === 0) log.push(`${((Date.now() - t1) / 1000).toFixed(0)}s life=${st.life}/${st.max} lvl=${st.lvl} kills=${st.kills} near=${st.n?.name}@${st.n?.d?.toFixed(1)} dead=${st.dead}`);
  if (st.dead) { await s.snap('83_dead'); break; }
  if (st.life < st.max * 0.35) { await s.key('q'); }
  if (!st.n) break;
  let tgt = st.n.sc;
  if (!SAFE(tgt) || st.n.d > 9) {
    const me = await s.ev(() => __scr(G.player.pos, 0.5)); const dx = tgt[0] - me[0], dy = tgt[1] - me[1], L = Math.hypot(dx, dy) || 1;
    const g = [Math.min(1300, Math.max(360, me[0] + dx / L * 200)), Math.min(660, Math.max(160, me[1] + dy / L * 200))];
    await s.page.mouse.move(g[0], g[1]); await s.page.mouse.down(); await s.sleep(200); await s.page.mouse.up();
  } else {
    await s.page.mouse.move(tgt[0], tgt[1]);
    if (i % 5 === 4) { await s.page.mouse.down({ button: 'right' }); await s.sleep(150); await s.page.mouse.up({ button: 'right' }); }
    else { await s.page.mouse.down(); await s.sleep(500); await s.page.mouse.up(); }
  }
  await s.sleep(100);
  if (i % 12 === 5 && shot < 6) await s.snap('84_f1_fight_' + shot++);
  i++;
}
console.log(log.join('\n'));
console.log('end', JSON.stringify(await s.ev(() => ({ lvl: G.state.player.lvl, statPts: G.state.player.statPts, skillPts: G.state.player.skillPts, life: G.state.player.life, loot: G.dungeon?.loot.list.length, coins: G.state.coins, bag: (G.state.inventory || []).filter(Boolean).length, kills: G.dungeon?.monsters.filter(m => !m.alive).length, total: G.dungeon?.monsters.length }))));
await s.snap('85_f1_end');
await s.close();
