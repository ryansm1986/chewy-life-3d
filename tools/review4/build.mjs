import { open } from './lib.mjs';
const s = await open('/?fresh&nointro&hour=11', { wait: 3000 });
await s.ev(() => {
  window.__w2s = (x, z) => { const v = new G.THREE.Vector3(x, G.world.heightAt(x, z), z).project(G.engine.camera); return [Math.round((v.x * .5 + .5) * innerWidth), Math.round((-v.y * .5 + .5) * innerHeight)]; };
});
await s.key('b');
for (let i = 0; i < 3; i++) { await s.sleep(100); await s.snap('14a_build_opening_' + i); }
await s.sleep(1200);
await s.snap('14_build_palette');
console.log('build fps', JSON.stringify(await s.fps(2000)), JSON.stringify(await s.stats()));
// hover inspect over existing buildings: find building screen positions
const bl = await s.ev(() => G.state.village.buildings.map(b => ({ t: b.type, lvl: b.level, sc: __w2s(b.x + 0.5, b.z + 0.5) })).filter(b => b.sc[0] > 300 && b.sc[0] < 1300 && b.sc[1] > 150 && b.sc[1] < 620));
console.log('onscreen buildings', JSON.stringify(bl.map(b => b.t + 'L' + b.lvl)));
let k = 0;
for (const b of bl.filter(b => ['home', 'shop', 'workshop', 'farm', 'kiln', 'lumber'].includes(b.t) || /home|shop/.test(b.t)).slice(0, 3)) {
  await s.page.mouse.move(b.sc[0], b.sc[1], { steps: 5 }); await s.sleep(900);
  await s.snap('14d_inspect_' + (k++) + '_' + b.t);
  await s.log('inspect card', () => document.querySelector('.bi-card, [class*=inspect], .build-inspect')?.innerText?.replace(/\n+/g, ' | '));
}
// hover over zoned empty lot
const zl = await s.ev(() => { const z = G.sim.S.zones.find(z => { const sc = __w2s(z[0] + 0.5, z[1] + 0.5); return sc[0] > 300 && sc[0] < 1300 && sc[1] > 150 && sc[1] < 620 && G.sim.occ[z[1] * 112 + z[0]] < 0; }); return z ? __w2s(z[0] + 0.5, z[1] + 0.5) : null; });
if (zl) { await s.page.mouse.move(zl[0], zl[1], { steps: 5 }); await s.sleep(900); await s.snap('14e_inspect_zone'); await s.log('zone card', () => document.querySelector('.bi-card, [class*=inspect]')?.innerText?.replace(/\n+/g, ' | ')); }
// tabs
const tabs = await s.ev(() => [...document.querySelectorAll('.bd-tabs .tab')].map(t => t.dataset.c));
for (const c of tabs) {
  const [x, y] = await s.ev(c => { const t = document.querySelector(`.bd-tabs .tab[data-c="${c}"]`); const r = t.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, c);
  await s.click(x, y); await s.sleep(800);
  if (['service', 'special', 'landmark', 'landmarks'].includes(c)) await s.snap('14b_tab_' + c);
  console.log(c, JSON.stringify(await s.ev(() => [...document.querySelectorAll('.bd-cards .card')].map(c => c.dataset.id + (c.classList.contains('locked') ? '(L)' : '') + (c.classList.contains('poor') ? '(poor)' : '')))));
}
{ const [x, y] = await s.ev(() => { const t = document.querySelector('.bd-tabs .tab[data-c="service"]'); const r = t.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }); await s.click(x, y); await s.sleep(800); }
const card = await s.ev(() => { const c = [...document.querySelectorAll('.bd-cards .card')].find(c => c.dataset.id === 'well') || document.querySelector('.bd-cards .card'); const r = c.getBoundingClientRect(); return [c.dataset.id, r.x + r.width / 2, r.y + r.height / 2]; });
await s.page.mouse.move(card[1], card[2]); await s.sleep(700);
await s.snap('14c_card_tooltip');
await s.click(card[1], card[2]); await s.sleep(500);
const spot = await s.ev(() => {
  const p = G.player.pos, sim = G.sim;
  for (let r = 3; r < 20; r++) for (let a = 0; a < 24; a++) { const x = Math.round(p.x + Math.cos(a / 24 * 6.283) * r), z = Math.round(p.z + Math.sin(a / 24 * 6.283) * r); if (sim.canPlace('well', x, z, 0).ok && sim.canPlace('well', x - 1, z - 1, 0).ok) { const sc = __w2s(x + 0.5, z + 0.5); if (sc[0] > 300 && sc[0] < 1300 && sc[1] > 150 && sc[1] < 600) return { x, z, sc }; } }
  return null;
});
console.log('spot', JSON.stringify(spot));
if (spot) {
  await s.page.mouse.move(spot.sc[0], spot.sc[1], { steps: 6 }); await s.sleep(700);
  await s.snap('15_ghost_well');
  await s.click(spot.sc[0], spot.sc[1]);
  await s.sleep(250); await s.snap('15b_placing');
  await s.sleep(900); await s.snap('15c_placed');
}
await s.key('Escape'); await s.sleep(300);
// overlays
for (const m of ['water', 'joy', 'light']) {
  const ob = await s.ev(m => { const b = document.querySelector(`.bd-ov .ovl[data-m="${m}"]`); if (!b) return null; const r = b.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, m);
  if (!ob) { console.log('no overlay', m); continue; }
  await s.click(ob[0], ob[1]); await s.sleep(700); await s.snap('17_overlay_' + m);
}
await s.key('Escape'); await s.sleep(200);
await s.close();
