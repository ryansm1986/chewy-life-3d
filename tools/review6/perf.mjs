import { open } from './lib.mjs';
// 1) boot time + village fps after intro vs nointro
{
  const t0 = Date.now();
  const s = await open('/?fresh&nointro&hour=10', { wait: 0 });
  console.log('boot to __ready (ms, incl. browser launch)', Date.now() - t0, 'nav timing', JSON.stringify(await s.ev(() => ({ ready: Math.round(performance.now()) }))));
  await s.sleep(2500);
  for (let i = 0; i < 3; i++) console.log('nointro village fps', JSON.stringify(await s.fps(2500)), JSON.stringify(await s.stats()));
  await s.close();
}
{
  const s = await open('/?fresh&hour=10', { wait: 1500 });
  for (let i = 0; i < 3; i++) console.log('during intro dialog fps', JSON.stringify(await s.fps(2000)));
  await s.ev(() => { let n = 0; while (G.ui?.dlg?.active && n++ < 50) G.ui.dlg.finish ? G.ui.dlg.finish(-1) : G.ui.dlg.advance(); });
  await s.sleep(1500);
  await s.ev(() => { let n = 0; while (G.ui?.dlg?.active && n++ < 50) G.ui.dlg.finish ? G.ui.dlg.finish(-1) : G.ui.dlg.advance(); });
  await s.sleep(2000);
  for (let i = 0; i < 3; i++) console.log('after intro fps', JSON.stringify(await s.fps(2500)), JSON.stringify(await s.stats()));
  await s.close();
}
// 2) first-cast hitches per skill in the dungeon (fresh page each group)
{
  const s = await open('/?fresh&nointro&floor=9', { wait: 6000 });
  await s.ev(() => { if (G.ui.dlg.active) G.ui.dlg.finish(-1); G.state.flags.burrowTut = true; const P = G.state.player; P.lvl = 30; P.stats = { str: 90, dex: 90, vit: 400, ene: 400 }; for (const id of ['chomp', 'whirl', 'bonestorm', 'blaze', 'fetchstorm', 'woof', 'packcall', 'multi', 'ricochet', 'throw', 'dig', 'guard', 'frenzy', 'decoy', 'zoom', 'treat', 'howl', 'moonhowl', 'goodboy']) P.skills[id] = 10; G.actions.recompute(); P.life = null; P.zoom = null; });
  await s.ev(() => { window.__mx = () => new Promise(res => { let mx = 0, last = performance.now(), n = 0; function f(t) { mx = Math.max(mx, t - last); last = t; if (++n < 60) requestAnimationFrame(f); else res(+mx.toFixed(1)); } requestAnimationFrame(f); }); });
  for (const id of ['chomp', 'whirl', 'bonestorm', 'dig', 'guard', 'frenzy', 'blaze', 'fetchstorm', 'multi', 'ricochet', 'decoy', 'woof', 'packcall', 'howl', 'moonhowl', 'treat', 'zoom', 'goodboy']) {
    const mx = await s.ev(async id => { const m = G.dungeon.monsters.find(m => m.alive) ; G.state.player.zoom = null; G.state.player.life = null; if (G.skills.cds) G.skills.cds[id] = 0; const ball = ['fetchstorm', 'blaze', 'multi', 'ricochet', 'decoy'].includes(id); if ((G.derived.weaponType === 'ball') !== ball) { G.actions.swapWeapons(); G.player.setWeapon(G.derived.weaponType); } const p = __mx(); const ok = G.skills.tryCast(id, (m ? m.pos : G.player.pos).clone(), m); return [ok, await p]; }, id);
    console.log('first cast', id, JSON.stringify(mx));
    await s.sleep(400);
  }
  await s.close();
}
