// Portrait sheet: /?test=portraits
import { Engine } from '../core/engine.js';
import { Portraits } from '../gfx/portraits.js';
import { VILLAGERS } from '../actors/roster.js';
import { loadHeroModels } from '../actors/heroModels.js';

export default async function () {
  await loadHeroModels(['chewy', 'moka', 'shadow', 'rosie']); // the baked heroes, as in the game (portraits.js prefers them when loaded)
  const engine = new Engine();
  const P = new Portraits(engine);
  for (const v of VILLAGERS) P.register(v.id, v.spec);
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:fixed;inset:0;display:flex;flex-wrap:wrap;gap:16px;padding:24px;background:linear-gradient(#fff6e8,#ffd8e8);z-index:5;align-content:flex-start';
  document.body.appendChild(wrap);
  for (const id of ['chewy', 'moka', 'shadow', 'rosie', ...VILLAGERS.map(v => v.id)]) {
    const url = P.get(id);
    const d = document.createElement('div');
    d.style.cssText = 'width:180px;height:200px;border-radius:24px;background:radial-gradient(circle at 50% 40%,#fff,#ffd0e0);border:4px solid #4a2c2a;display:flex;flex-direction:column;align-items:center;font:600 16px Fredoka,sans-serif;color:#4a2c2a;overflow:hidden';
    d.innerHTML = `<img src="${url}" style="width:170px;height:170px">${id}`;
    wrap.appendChild(d);
  }
  window.__ready = true;
}
