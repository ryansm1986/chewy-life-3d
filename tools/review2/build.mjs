import { open } from './lib.mjs';
const s = await open('/?fresh&nointro&hour=11', { wait: 3000 });
await s.ev(() => {
  window.__w2s = (x, z) => { const v = new G.THREE.Vector3(x, G.world.heightAt(x, z), z).project(G.engine.camera); return [Math.round((v.x * .5 + .5) * innerWidth), Math.round((-v.y * .5 + .5) * innerHeight)]; };
});
await s.key('b');
for (let i = 0; i < 4; i++) { await s.sleep(90); await s.snap('14a_build_opening_' + i); }
await s.sleep(1200);
await s.snap('14_build_palette');
const info = await s.ev(() => ({ tabs: [...document.querySelectorAll('.bd-tabs .tab')].map(t => t.innerText), cards: [...document.querySelectorAll('.bd-cards .card')].map(c => c.dataset.id + (c.classList.contains('locked') ? '(L)' : '') + (c.classList.contains('poor') ? '(poor)' : '')), imgs: [...document.querySelectorAll('.bd-cards .card img')].map(i => i.src.slice(0, 40)).slice(0, 3), mats: G.state.materials, coins: G.state.coins }));
console.log(JSON.stringify(info));
// tabs
const tabs = await s.ev(() => [...document.querySelectorAll('.bd-tabs .tab')].map(t => { const r = t.getBoundingClientRect(); return [t.dataset.c, r.x + r.width / 2, r.y + r.height / 2]; }));
for (const [c] of tabs) {
  const [x, y] = await s.ev(c => { const t = document.querySelector(`.bd-tabs .tab[data-c="${c}"]`); const r = t.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, c);
  await s.click(x, y); await s.sleep(900);
  if (['service', 'decor', 'special'].includes(c)) await s.snap('14b_tab_' + c);
  console.log(c, JSON.stringify(await s.ev(() => [...document.querySelectorAll('.bd-cards .card')].map(c => c.dataset.id + (c.classList.contains('locked') ? '(L)' : '') + (c.classList.contains('poor') ? '(poor)' : '')))));
}
// hover a card for tooltip
{ const [x, y] = await s.ev(() => { const t = document.querySelector('.bd-tabs .tab[data-c="service"]'); const r = t.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }); await s.click(x, y); await s.sleep(800); }
const card = await s.ev(() => { const c = [...document.querySelectorAll('.bd-cards .card')].find(c => c.dataset.id === 'well') || document.querySelector('.bd-cards .card'); const r = c.getBoundingClientRect(); return [c.dataset.id, r.x + r.width / 2, r.y + r.height / 2]; });
await s.page.mouse.move(card[1], card[2]); await s.sleep(700);
await s.snap('14c_card_tooltip');
// find a free spot for a well near player and pick it
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
// Zones: pick R and drag-paint
await s.key('Escape'); await s.sleep(300);
const zbtn = await s.ev(() => { const b = document.querySelector('.bd-tools .zone[data-z="R"]'); const r = b.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
await s.click(zbtn[0], zbtn[1]); await s.sleep(500);
const zspot = await s.ev(() => {
  const sim = G.sim, T = sim.terrain.tiles, W = 112; const p = G.player.pos;
  let best = null;
  for (let z0 = 10; z0 < 100; z0++) for (let x0 = 10; x0 < 100; x0++) {
    let ok = true; for (let z = z0; z < z0 + 5 && ok; z++) for (let x = x0; x < x0 + 5 && ok; x++) { const i = z * sim.world.terrain.W + x; }
    // use paintZone preconditions: grass & unoccupied & no zone
    for (let z = z0; z < z0 + 5 && ok; z++) for (let x = x0; x < x0 + 5 && ok; x++) { const t = sim.terrain.tile(x, z); if (t !== 0 && t !== sim.terrain.tile(0, 0) && false) ok = false; }
    if (!ok) continue;
    let good = true; for (let z = z0; z < z0 + 5 && good; z++) for (let x = x0; x < x0 + 5 && good; x++) { if (!sim.canPlace('home', x, z, 0).ok && !sim.canPlace('well', x, z, 0).ok) good = false; if (sim.zone[z * 112 + x]) good = false; }
    if (!good) continue;
    if (!sim.roadAccess({ type: 'home', x: x0, z: z0, rot: 0, level: 1 })) continue;
    const d = Math.hypot(x0 - p.x, z0 - p.z); if (!best || d < best.d) { const a = __w2s(x0 + 0.5, z0 + 0.5), b = __w2s(x0 + 4.5, z0 + 4.5); if (a[1] > 120 && b[1] < 620 && a[0] > 200 && b[0] < 1350 && a[0] > 200) best = { x0, z0, d, a, b }; }
  }
  return best;
});
console.log('zspot', JSON.stringify(zspot));
if (zspot) {
  const [ax, ay] = zspot.a, [bx, by] = zspot.b;
  await s.page.mouse.move(ax, ay); await s.page.mouse.down();
  for (let i = 1; i <= 10; i++) { await s.page.mouse.move(ax + (bx - ax) * i / 10, ay + (by - ay) * i / 10); await s.sleep(40); }
  await s.sleep(200); await s.snap('16_zone_drag');
  await s.page.mouse.up(); await s.sleep(700);
  await s.snap('16b_zone_painted');
  console.log('zone tiles', await s.ev(() => G.sim.S.zones.length));
}
// overlays
for (const m of ['water', 'joy', 'light']) {
  const ob = await s.ev(m => { const b = document.querySelector(`.bd-ov .ovl[data-m="${m}"]`); const r = b.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, m);
  await s.click(ob[0], ob[1]); await s.sleep(700); await s.snap('17_overlay_' + m);
}
await s.click(...(await s.ev(() => { const b = document.querySelector('.bd-ov .ovl[data-m="light"]'); const r = b.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })));
// rotate view
await s.page.mouse.move(800, 300);
await s.key('q'); await s.sleep(1200); await s.snap('17d_rotated_view');
await s.key('e'); await s.sleep(800);
// growth: exit build, force ticks
await s.key('Escape'); await s.sleep(200); await s.key('b'); await s.sleep(800);
const before = await s.ev(() => ({ n: G.state.village.buildings.length, pop: G.sim.stats.population, dem: G.sim.demand }));
await s.snap('18_growth_before');
for (let i = 0; i < 12; i++) { await s.ev(() => { G.sim.tickT = 99; }); await s.sleep(400); }
await s.sleep(1500);
const after = await s.ev(() => ({ n: G.state.village.buildings.length, pop: G.sim.stats.population, dem: G.sim.demand, rank: G.sim.stats.rank, zonesLeft: G.sim.S.zones.length }));
console.log('growth', JSON.stringify(before), '->', JSON.stringify(after));
await s.snap('18b_growth_after');
await s.ev(() => { G.engine.rig.distTarget = 55; }); await s.sleep(1500);
await s.snap('18c_growth_wide');
await s.log('toasts', () => [...document.querySelectorAll('[class*=toast]')].map(e => e.innerText).filter(Boolean));
await s.close();
