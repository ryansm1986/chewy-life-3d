import { open } from './lib.mjs';
// First-session flow with real input only (works on the production bundle): title -> New Game -> intro dialogue
// (F / clicks) -> walk to the Burrow gate with ground clicks -> F -> fight floor 1 by clicking monsters -> T home.
const s = await open('/?x=1', { wait: 3500 });
const t0 = Date.now(); const T = () => ((Date.now() - t0) / 1000).toFixed(0) + 's';
const btn = await s.ev(() => { const b = [...document.querySelectorAll('button')].find(e => /new game/i.test(e.innerText || '') && e.offsetParent); if (!b) return [800, 494]; const r = b.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
await s.click(btn[0], btn[1]);
await s.sleep(3500);
// intro: advance with F until the dialogue closes and control returns
let presses = 0;
for (let i = 0; i < 60; i++) {
  const st = await s.ev(() => ({ dlg: !!G.ui?.dlg?.active, locked: !!G.player.controlLocked, opts: [...document.querySelectorAll('button.dch')].filter(e => e.offsetParent).map(e => e.innerText.trim()) }));
  if (!st.dlg && !st.locked) break;
  if (st.opts.length) { const bye = st.opts.findIndex(o => /bye/i.test(o)); await s.key(String((bye >= 0 ? bye : st.opts.length - 1) + 1)); }
  else await s.key('f');
  presses++; await s.sleep(450);
}
console.log(T(), 'intro done after', presses, 'presses', JSON.stringify(await s.ev(() => ({ quests: G.story.uiList().map(q => q.title + ': ' + q.steps.map(x => x.text + ' ' + x.have + '/' + x.need).join('; ')), arrow: !!document.querySelector('[class*=arrow]')?.offsetParent }))));
await s.snap('90_real_after_intro');
// walk to the gate with ground clicks (click-to-move pathing)
await s.ev(() => { window.__scr = (p, y = 0) => { const v = p.clone().setY((p.y || 0) + y).project(G.engine.camera); return [Math.round((v.x * .5 + .5) * innerWidth), Math.round((-v.y * .5 + .5) * innerHeight)]; }; window.__gate = G.world.interactables.find(i => /Burrow/.test(i.label)); });
let arrived = false, clicks = 0;
for (let i = 0; i < 80; i++) {
  const st = await s.ev(() => { const g = __gate.pos, p = G.player.pos; const d = Math.hypot(g.x - p.x, g.z - p.z); const k = Math.min(1, 7 / Math.max(d, 0.01)); const w = new G.THREE.Vector3(p.x + (g.x - p.x) * k, p.y, p.z + (g.z - p.z) * k); return { d: +d.toFixed(1), sc: __scr(w), label: document.querySelector('.hud-interact, [class*=interact]')?.innerText || '' }; });
  if (st.d < 1.6) { arrived = true; break; }
  const x = Math.min(1300, Math.max(360, st.sc[0])), y = Math.min(660, Math.max(160, st.sc[1]));
  await s.click(x, y); clicks++; await s.sleep(700);
  if (i === 6) await s.snap('90_real_walking');
}
console.log(T(), 'arrived at gate', arrived, 'clicks', clicks, JSON.stringify(await s.ev(() => ({ d: +Math.hypot(__gate.pos.x - G.player.pos.x, __gate.pos.z - G.player.pos.z).toFixed(1), shadowD: +G.companion.pos.distanceTo(G.player.pos).toFixed(1) }))));
await s.snap('90_real_gate');
await s.key('f'); await s.sleep(5000);
for (let i = 0; i < 10 && await s.ev(() => !!G.ui?.dlg?.active); i++) { await s.key('f'); await s.sleep(400); }
console.log(T(), 'mode', await s.ev(() => G.mode + ' floor ' + G.dungeon?.floor));
await s.snap('91_real_floor1');
// fight: click the nearest on-screen monster (Chewy walks up and swings), else click toward it
const SAFE = p => p[0] > 330 && p[0] < 1330 && p[1] > 130 && p[1] < 680;
let snaps = 0; const log = [];
for (let i = 0; i < 140; i++) {
  const st = await s.ev(() => { if (!G.dungeon) return null; const P = G.player.pos; let b = null; for (const m of G.dungeon.monsters) { if (!m.alive) continue; const d = Math.hypot(m.pos.x - P.x, m.pos.z - P.z); if (!b || d < b.d) b = { m, d }; } if (!b) return { none: true }; const q = G.story.uiList().find(q => /Squishy/.test(q.title)); return { d: +b.d.toFixed(1), sc: __scr(b.m.pos, 0.5), me: __scr(P, 0.5), life: Math.round(G.state.player.life ?? G.derived.lifeMax), max: G.derived.lifeMax, lvl: G.state.player.lvl, q: q ? q.steps.map(x => x.have + '/' + x.need).join() : 'done?', dead: !!G.playerDead }; });
  if (!st || st.none) break;
  if (i % 15 === 0) log.push(`${T()} d=${st.d} life=${st.life}/${st.max} lvl=${st.lvl} quest=${st.q}`);
  if (/^8\/8/.test(st.q) || st.q === 'done?') { log.push(`${T()} quest progress ${st.q}`); break; }
  if (st.dead) { log.push('DEAD'); break; }
  if (st.life < st.max * 0.35) await s.key('q');
  if (SAFE(st.sc) && st.d < 9) { await s.page.mouse.move(st.sc[0], st.sc[1]); await s.page.mouse.down(); await s.sleep(380); await s.page.mouse.up(); }
  else { const dx = st.sc[0] - st.me[0], dy = st.sc[1] - st.me[1], L = Math.hypot(dx, dy) || 1; await s.click(Math.min(1300, Math.max(360, st.me[0] + dx / L * 200)), Math.min(660, Math.max(160, st.me[1] + dy / L * 200))); await s.sleep(250); }
  await s.sleep(60);
  if (i % 25 === 12 && snaps < 4) await s.snap(`91_real_fight_${snaps++}`);
}
console.log(log.join('\n'));
await s.sleep(1500);
await s.snap('92_real_after_fight');
console.log(T(), JSON.stringify(await s.ev(() => ({ quests: G.story.uiList().map(q => q.title + ': ' + q.steps.map(x => x.text + ' ' + x.have + '/' + x.need).join('; ')), bag: (G.state.inventory || []).filter(Boolean).map(i => i.rarity + ':' + i.name), lootOnGround: G.dungeon?.loot?.list?.length, coins: G.state.coins, lvl: G.state.player.lvl, audio: G.audio?.ctx?.state || G.audio?.state || typeof G.audio }))));
await s.key('t'); await s.sleep(5500);
await s.snap('93_real_home');
console.log(T(), 'mode', await s.ev(() => G.mode), JSON.stringify(await s.ev(() => ({ toasts: [...document.querySelectorAll('[class*=toast]')].map(e => e.innerText).filter(Boolean).slice(0, 5), quest: G.story.uiList().map(q => q.title + ': ' + q.steps.map(x => x.text + ' ' + x.have + '/' + x.need).join('; ')) }))));
await s.close();
