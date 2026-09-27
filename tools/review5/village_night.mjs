import { open } from './lib.mjs';
// Do villagers actually get home at night? Track 'walk>home' villagers' progress over ~70 s real time.
// argv[2] = 'plaza' puts Chewy on the plaza centre-ish (like village_life); 'away' parks him in a far corner.
const where = process.argv[2] || 'plaza';
const s = await open('/?fresh&nointro&hour=19.3', { wait: 3000 });
await s.ev((where) => {
  const L = G.world.landmarks;
  if (where === 'plaza') G.player.setPos(L.plaza.x + 1, L.plaza.z + 2);
  else G.player.setPos(L.plaza.x + 30, L.plaza.z - 30);
  G.engine.rig.focus.copy(G.player.pos); G.engine.rig.snap();
}, where);
const snapNpcs = () => s.ev(() => G.npcs.map(n => ({ id: n.id, st: n.state + (n.goal?.kind ? '>' + n.goal.kind : ''), x: +n.pos.x.toFixed(1), z: +n.pos.z.toFixed(1), vis: n.visible, stuck: +(n.stuckT || 0).toFixed(1), dHome: n.home ? +Math.hypot(n.pos.x - n.home.x, n.pos.z - n.home.z).toFixed(1) : null })));
let prev = await snapNpcs();
console.log('hour', await s.ev(() => G.day.hour.toFixed(2)), 'player', await s.ev(() => [G.player.pos.x.toFixed(1), G.player.pos.z.toFixed(1)]));
for (let i = 0; i < 7; i++) {
  await s.sleep(10000);
  const cur = await snapNpcs();
  const h = await s.ev(() => G.day.hour.toFixed(2));
  const summary = cur.map(c => { const p = prev.find(q => q.id === c.id); const mv = p ? Math.hypot(c.x - p.x, c.z - p.z).toFixed(1) : '?'; return `${c.id}:${c.st}${c.vis ? '' : '(hid)'} d=${c.dHome} mv=${mv}`; });
  console.log('h', h, summary.join(' | '));
  prev = cur;
  if (i === 2 || i === 6) await s.snap(`71_night_${where}_${i}`);
}
await s.close();
