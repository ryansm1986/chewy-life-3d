// Stella's icon sheet (docs/STELLA.md): /?test=stellaIcons[&dark=1]
// Every skill icon (rpg/iconsStella.js via icons.js skillIcon) at 64 px and at hotbar size (48 px), the dragoon's for
// comparison, the twelve sun wagasa items (normal, rare, and the 2 x 2 inventory footprint) and her four UI glyphs.
import { skillIcon, itemIcon, itemIconSized } from '../rpg/icons.js';
import { glyph } from '../ui/glyphs.js';

const TREES = [
  ['Radiance', [['goldenRay', 'Golden Ray'], ['innerLight', 'Inner Light'], ['glint', 'Glint'], ['prism', 'Prism'], ['sunlit', 'Sunlit'], ['solarRay', 'Solar Ray'], ['sundial', 'Sundial']]],
  ['Corona', [['solarFlare', 'Solar Flare'], ['sunKissed', 'Sun-Kissed'], ['skippingSun', 'Skipping Sun'], ['sunspot', 'Sunspot'], ['sunburn', 'Sunburn'], ['littleSun', 'Little Sun'], ['risingSun', 'Rising Sun']]],
  ['Dawn', [['morningLight', 'Morning Light'], ['sunnyDisposition', 'Sunny Disposition'], ['kindLight', 'Kind Light'], ['halo', 'Halo'], ['stlZoomies', 'Zoomies!'], ['sunDog', 'Sun Dog'], ['daybreak', 'Daybreak']]],
];
const WAGASA = [
  ['paper', 'Paper', ['#d9573e', '#f0c24e', '#dfa23c']], ['morning', 'Morning', ['#ffe6b0', '#f0c24e', '#e07a5a']],
  ['marigold', 'Marigold', ['#f8b440', '#ffe08a', '#c8501e']], ['lantern', 'Lantern', ['#e85a3a', '#ffd36a', '#ffe8a0']],
  ['festival', 'Festival', ['#d9573e', '#f0c24e', '#fff4dc']], ['golden', 'Golden Hour', ['#ffcf6a', '#ff9a5a', '#fff6e0']],
  ['shrine', 'Shrine', ['#c8382e', '#fff4dc', '#f0c24e']], ['sunburst', 'Sunburst', ['#f0c24e', '#d9573e', '#fff8e0']],
  ['daystar', 'Daystar', ['#fff0c0', '#ffd36a', '#ffffff']], ['corona', 'Corona', ['#ffb070', '#fff1b8', '#d9573e']],
  ['solstice', 'Solstice', ['#7a3a8a', '#ffd36a', '#ffb070']], ['dawn', 'Dawn', ['#f7b8a8', '#ffd36a', '#fffaf0']],
];
const GOLDEN = ['attack_lance', 'sunbeamThrust', 'knightsVow', 'sunfallJump', 'tailwagVolley', 'emberBreath', 'bestFriends', 'dragonHeart'];

export default function () {
  const Q = new URLSearchParams(location.search);
  document.getElementById('boot')?.remove();
  document.body.style.cssText = `margin:0;background:${Q.has('dark') ? '#3a2c34' : '#fdeedd'};font:12px system-ui;color:${Q.has('dark') ? '#fdeedd' : '#4a2c2a'};padding:12px 14px`;
  const row = (title, cells, gap = 8) => `<h3 style="margin:10px 0 4px;font-size:13px">${title}</h3><div style="display:flex;flex-wrap:wrap;gap:${gap}px;align-items:flex-end">${cells.join('')}</div>`;
  const cell = (url, name, px = 64, w = 86) => `<div style="width:${w}px;text-align:center"><img src="${url}" style="width:${px}px;height:${px}px"><div>${name || ''}</div></div>`;
  const small = (url, px = 48) => `<img src="${url}" style="width:${px}px;height:${px}px">`;
  const item = (v, cols, rarity) => ({ kind: 'gear', rarity, icon: { shape: 'parasol', variant: v, colors: cols } });
  let html = row('Basic attack · Sunsweep', [cell(skillIcon('attack_parasol'), 'attack_parasol')]);
  for (const [t, ids] of TREES) html += row(t, ids.map(([id, n]) => cell(skillIcon(id), n)));
  html += row('Hotbar size (48 px): Stella', [small(skillIcon('attack_parasol')), ...TREES.flatMap(([, ids]) => ids.map(([id]) => small(skillIcon(id))))], 4);
  html += row('Hotbar size (48 px): the dragoon, for comparison', GOLDEN.map(id => small(skillIcon(id))), 4);
  html += row('Sun wagasa (normal)', WAGASA.map(([v, n, c]) => cell(itemIcon(item(v, c, 'normal')), n)));
  html += row('Sun wagasa (rare)', WAGASA.map(([v, n, c]) => cell(itemIcon(item(v, c, 'rare')), n)));
  html += row('Inventory footprint (2 x 2)', WAGASA.slice(0, 6).map(([v, n, c], i) => cell(itemIconSized(item(v, c, ['normal', 'magic', 'rare', 'unique', 'set', 'normal'][i]), 2, 2), n, 112, 116)));
  html += row('', WAGASA.slice(6).map(([v, n, c], i) => cell(itemIconSized(item(v, c, ['normal', 'magic', 'rare', 'unique', 'set', 'rare'][i]), 2, 2), n, 112, 116)));
  const gl = (n, px) => `<span style="display:inline-block;width:${px}px;height:${px}px">${glyph(n)}</span>`;
  html += row('Glyphs (32 px, 20 px), beside the dragoon\'s and the sun', ['parasol', 'ray', 'flare', 'dawn', 'lance', 'javelin', 'whelp', 'sun'].map(n => `<div style="width:64px;text-align:center">${gl(n, 32)} ${gl(n, 20)}<div>${n}</div></div>`));
  document.body.innerHTML = `<style>.gl{width:100%;height:100%;display:block}</style>${html}`;
  const imgs = [...document.images];
  Promise.all(imgs.map(im => im.complete ? 0 : new Promise(r => { im.onload = im.onerror = r; }))).then(() => { window.__ready = true; });
}
