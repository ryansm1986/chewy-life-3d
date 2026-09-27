import { open } from './lib.mjs';
const s = await open('/?fresh&nointro&hour=10', { wait: 3000 });
const info = await s.ev(() => {
  const r = G.npcs[0]; const L = G.world.landmarks;
  const shopIt = G.world.interactables.find(i => /Rosie/.test(i.label));
  return { rosie: [r.pos.x.toFixed(1), r.pos.z.toFixed(1)], anchor: [r.anchor.x, r.anchor.z], shop: L.rosieShop, shopIt: shopIt && [shopIt.pos.x.toFixed(1), shopIt.pos.z.toFixed(1), shopIt.label], cam: G.engine.camera.position.toArray().map(v => v.toFixed(1)) };
});
console.log(JSON.stringify(info));
// Walk Chewy to the shop door interactable naturally (click-to-move style target)
await s.ev(() => { const it = G.world.interactables.find(i => /Rosie/.test(i.label)); G.player.setPos(it.pos.x + 4, it.pos.z + 4); G.companion.setPos(it.pos.x + 5, it.pos.z + 4); });
await s.sleep(1200);
await s.ev(() => { const it = G.world.interactables.find(i => /Rosie/.test(i.label)); G.player.moveTarget = it.pos.clone(); });
await s.sleep(3500);
await s.snap('13_shop_door_approach');
const vis = await s.ev(() => { const r = G.npcs[0]; const v = r.pos.clone().setY(r.pos.y + 0.8).project(G.engine.camera); return { sx: ((v.x * .5 + .5) * innerWidth) | 0, sy: ((-v.y * .5 + .5) * innerHeight) | 0, rosie: [r.pos.x.toFixed(1), r.pos.z.toFixed(1)], interact: document.querySelector('.interact, [class*=interact]')?.innerText }; });
console.log(JSON.stringify(vis));
// sample Rosie positions over 60s
const samples = [];
for (let i = 0; i < 12; i++) { await s.sleep(2500); samples.push(await s.ev(() => { const r = G.npcs[0]; return [+r.pos.x.toFixed(1), +r.pos.z.toFixed(1)]; })); }
console.log('rosie samples', JSON.stringify(samples));
await s.snap('13b_shop_later');
await s.close();
