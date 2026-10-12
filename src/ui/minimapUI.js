// The HUD minimap's extras (ROADMAP UX-1, docs/MAP.md): its zoom chip (three spans, Settings' mmZoom), the N badge
// that sits where north really is on the ring (the disc turns with the camera unless Settings › Minimap says North up),
// a tooltip naming the mark under the mouse (a held finger on touch), and a click that opens the big map (on the mark
// you clicked, when there's one). The provider (world/minimap.js) leaves its marks in provider.hits.
import { el, esc } from './dom.js';
import { simpleTip } from './tooltip.js';
import { tipFor } from '../world/mapData.js';
import { mapRot, MM_SPANS } from '../world/minimap.js';
import { Actions } from '../core/actions.js';
import './map.css';

export function installMinimapUI(ui) {
  const hud = ui.hud, wrap = hud.root.querySelector('.mm-wrap'), cv = hud.$.mmCv, N = wrap?.querySelector('.mm-n');
  if (!wrap || !cv) return null;
  const zoom = el('button', 'mm-zoom');
  zoom.title = 'Zoom the minimap';
  wrap.appendChild(zoom);
  const LENS = '<svg class="mz-g" viewBox="0 0 20 20" aria-hidden="true"><path d="M12.4 12.4 L16.6 16.6" stroke="#4a2c2a" stroke-width="4.4" stroke-linecap="round"/><path d="M12.6 12.6 L16.4 16.4" stroke="#c98f5e" stroke-width="2.2" stroke-linecap="round"/><circle cx="8.6" cy="8.6" r="5.6" fill="#bfe6ff" stroke="#4a2c2a" stroke-width="2"/><path d="M6.2 7.1 Q7.4 5.4 9.6 5.6" stroke="#fff" stroke-width="1.4" fill="none" stroke-linecap="round"/></svg>';
  const paint = () => { const z = ui.settings.mmZoom ?? 1; zoom.innerHTML = `${LENS}<span class="mz-d">${MM_SPANS.map((_, i) => `<b class="${i === z ? 'on' : ''}"></b>`).join('')}</span>`; zoom.dataset.z = z; zoom.title = `Minimap: ${MM_SPANS[z]} m across (click to change)`; };
  paint();
  // (a tap on the disc opens the map on touch: the chip keeps its own taps)
  for (const ev of ['pointerdown', 'pointerup']) zoom.addEventListener(ev, e => e.stopPropagation());
  zoom.addEventListener('click', e => { e.stopPropagation(); ui.setSetting('mmZoom', ((ui.settings.mmZoom ?? 1) + 1) % MM_SPANS.length); paint(); ui.minimap.redraw(); ui.sfx?.('tick'); });
  ui.onSetting(k => { if (k === 'mmZoom' || k === 'mmNorth') { paint(); ui.minimap.redraw(); } });
  // the mark under a point of the canvas (CSS px of the canvas's own 180 px drawing)
  const hitAt = (cx, cy) => {
    const P = hud.mm.provider; if (!P?.hits?.length) return null;
    const r = cv.getBoundingClientRect(), s = 180 / (r.width || 180), x = (cx - r.left) * s, y = (cy - r.top) * s;
    let best = null, bd = 1e9;
    for (const h of P.hits) { const d = Math.hypot(h.x - x, h.y - y); if (d < h.r + 3 && d < bd && h.e) { bd = d; best = h; } }
    return best;
  };
  const tip = (h) => {
    if (!h) { ui.tip.hide(cv); return; }
    const t = tipFor(ui.G, h.e, hud.mm.provider?.lists?.().places); if (!t) return;
    ui.tip.show(simpleTip(esc(t.title), t.text), 'tt-map', cv);
  };
  cv.addEventListener('pointermove', e => { if (e.pointerType !== 'mouse') return; tip(hitAt(e.clientX, e.clientY)); });
  cv.addEventListener('pointerleave', () => ui.tip.hide(cv));
  // the mouse: a click opens the big map (on the mark clicked)
  cv.addEventListener('click', e => {
    if (Actions.device === 'touch' || ui.anyModal()) return;
    const h = hitAt(e.clientX, e.clientY);
    ui._user = true; try { ui.open('map', h?.e?.key ? { focus: h.e.key } : {}); } finally { ui._user = false; }
  });
  // touch: a finger held on the disc names the mark under it (a tap still opens the map: ui/touch.js)
  let holdT = null;
  cv.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse') return;
    clearTimeout(holdT); const x = e.clientX, y = e.clientY;
    holdT = setTimeout(() => { const h = hitAt(x, y); if (h) { ui.tip.x = x; ui.tip.y = y; tip(h); wrap.dataset.held = '1'; setTimeout(() => ui.tip.hide(cv), 2200); } }, 420);
  });
  for (const ev of ['pointerup', 'pointercancel']) cv.addEventListener(ev, () => clearTimeout(holdT));
  // (a held tooltip: the release that follows doesn't open the map)
  wrap.addEventListener('pointerup', e => { if (wrap.dataset.held) { e.stopImmediatePropagation(); delete wrap.dataset.held; } }, true);
  let lastA = null;
  return {
    hitAt,
    /** each frame: the N badge where north is */
    update() {
      if (!ui.G?.engine?.rig) return;
      const P = hud.mm.provider, turns = P?.ownHud ? !ui.settings.mmNorth : true; // (the zones', dungeons' and rooms' maps always turn)
      const zv = !P?.views; if (zoom.hidden !== zv) zoom.hidden = zv; // (the lens: the village's disc only, for now)
      const a = (turns ? mapRot(ui.G.engine.rig.yaw) : 0) - Math.PI / 2; // (north is world -z: up the canvas, turned with the map)
      if (!N || (lastA != null && Math.abs(a - lastA) < 0.004)) return;
      lastA = a;
      if (Math.abs(a + Math.PI / 2) < 0.004) { N.style.left = ''; N.style.top = ''; N.style.transform = ''; return; }
      const R = 92, c = 98;
      N.style.left = `${(c + Math.cos(a) * R).toFixed(1)}px`; N.style.top = `${(c + Math.sin(a) * R).toFixed(1)}px`; N.style.transform = 'translate(-50%, -50%)';
    },
  };
}
