// Homestead test page (/?test=homestead): &view=icons (every pantry icon on a cream sheet, &size=px) or
// &view=crops (every crop at every growth stage in a soil bed, the props and the seed stall; &hour=, &dist=) or
// &view=fish (the 15 catch models, the two rods, the float and the ice hole).
import { PANTRY, KINDS, KIND_INFO, CROP_IDS } from '../life/pantry.js';
import { pantryIcon } from '../life/pantryIcons.js';

export default async function () {
  const P = new URLSearchParams(location.search);
  const view = P.get('view') || 'icons';
  if (view === 'icons') return icons(P);
  const M = await import('./homesteadCrops.js');
  return view === 'fish' ? M.fish(P) : M.crops(P);
}

function icons(P) {
  const size = +(P.get('size') || 64);
  document.body.style.cssText = 'margin:0;background:#fff3e2;overflow:auto;font-family:Fredoka,system-ui,sans-serif;color:#4a2c2a';
  const wrap = document.createElement('div'); wrap.style.cssText = 'padding:14px 18px';
  for (const k of KINDS) {
    const ids = Object.keys(PANTRY).filter(id => PANTRY[id].kind === k);
    const row = document.createElement('div'); row.style.cssText = 'margin-bottom:10px';
    row.innerHTML = `<div style="font-weight:700;font-size:15px;margin:4px 0">${KIND_INFO[k].name} (${ids.length})</div><div style="display:flex;flex-wrap:wrap;gap:8px">${ids.map(id => `<div style="width:${size + 24}px;text-align:center;font-size:10.5px;line-height:1.1"><div style="width:${size}px;height:${size}px;margin:0 auto;border-radius:12px;background:radial-gradient(circle at 50% 38%,#fffbf5,#f4e4cf);border:2px solid rgba(74,44,42,.3);display:grid;place-items:center"><img src="${pantryIcon(id)}" style="width:${size * 0.9}px;height:${size * 0.9}px"></div>${PANTRY[id].name}</div>`).join('')}</div>`;
    wrap.appendChild(row);
  }
  document.body.appendChild(wrap);
  window.__info = { count: Object.keys(PANTRY).length, crops: CROP_IDS.length };
  setTimeout(() => { window.__ready = true; }, 300);
}
