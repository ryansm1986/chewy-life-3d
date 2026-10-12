// The big map's directories and key (ROADMAP UX-1, docs/MAP.md): People (grouped: something for you, shopkeepers,
// townsfolk, heroes, hires; each with where they are now and how far), Places (shops, services, boards, homes,
// gathering, landmarks, gates and regions), and the Key (every mark the maps draw). Typing filters the list (the
// keyboard); a row picks that person or place: the map centres on them and pins them (world/mapPin.js), and the card
// under the list offers "Shadow, take me there" and Unpin. The rows are buttons, so the pad's focus walks them (D-pad;
// ui/padNav.js: A pins, Y Shadow, X unpins).
import { esc } from './dom.js';
import { glyph } from './glyphs.js';
import { GROUPS, CATS, personWhere, areaKey } from '../world/mapData.js';
import { iconSVG, badge, pip, flag, shadowMark, drawPin, drawStar, drawArrow, INK, DPR, markVersion } from '../world/mapArt.js';
import { pawMark, wildMark, sightingPin } from '../world/minimap.js';

const TABS = [['people', 'People', 'chat'], ['places', 'Places', 'pin'], ['key', 'Key', 'map']];
const dist = (P, p) => (P && p ? Math.hypot(p.x - P.x, p.z - P.z) : Infinity);
const fmtM = d => (d === Infinity ? '' : d < 1000 ? `${Math.round(d)} m` : `${(d / 1000).toFixed(1)} km`);

export class MapDirectory {
  constructor(panel, root) {
    this.P = panel; this.root = root; this.tab = 'people'; this.q = ''; this.sig = ''; this.cardSig = '';
    root.innerHTML = `<div class="tabs mp-tabs">${TABS.map(([k, n, g]) => `<button class="tab${k === this.tab ? ' on' : ''}" data-t="${k}" style="--tc:${k === 'people' ? '#ff8fb0' : k === 'places' ? '#8fc8ff' : '#c3b3ff'}">${glyph(g)}${n}<b class="tab-n"></b></button>`).join('')}</div>
      <label class="mp-find kbm-only">${glyph('eye')}<input class="mp-q" type="text" placeholder="Find someone or somewhere…" spellcheck="false" autocomplete="off"><button class="mp-qx" title="Clear" tabindex="-1">${glyph('x')}</button></label>
      <div class="mp-list"></div>
      <div class="mp-legend" hidden></div>
      <div class="mp-card" hidden></div>`;
    this.$ = { tabs: root.querySelector('.mp-tabs'), q: root.querySelector('.mp-q'), qx: root.querySelector('.mp-qx'), list: root.querySelector('.mp-list'), legend: root.querySelector('.mp-legend'), card: root.querySelector('.mp-card') };
    this.$.tabs.addEventListener('click', e => { const t = e.target.closest('.tab'); if (!t || t.dataset.t === this.tab) return; this.tab = t.dataset.t; this.P.ui.sfx?.('tab'); this.render(true); });
    this.$.q.addEventListener('input', () => { this.q = this.$.q.value.trim().toLowerCase(); if (this.tab === 'key') this.tab = 'people'; this.render(true); });
    this.$.q.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (this.$.q.value) { this.$.q.value = ''; this.q = ''; this.render(true); } else { this.$.q.blur(); this.P.ui.close('map'); } }
      if (e.key === 'Enter') { const first = this.$.list.querySelector('.mp-row'); if (first) { e.preventDefault(); this.P.select(first.dataset.key, { pin: true, centre: true }); } }
    });
    this.$.qx.addEventListener('click', e => { e.preventDefault(); this.$.q.value = ''; this.q = ''; this.render(true); this.$.q.focus(); });
    this.$.list.addEventListener('pointerdown', () => { this.held = true; });
    addEventListener('pointerup', () => { this.held = false; }, true);
    this.$.list.addEventListener('click', e => { const r = e.target.closest('.mp-row'); if (!r) return; this.P.select(r.dataset.key, { pin: true, centre: true }); this.P.ui.sfx?.('select'); });
    this.$.card.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.matches('.mp-lead')) this.P.takeMeThere();
      else if (b.matches('.mp-unpin')) { this.P.G.mapPin?.clear('unpin'); this.P.ui.sfx?.('click'); this.render(true); }
      else if (b.matches('.mp-pin')) { this.P.select(this.P.sel, { pin: true, centre: true }); }
      else if (b.matches('.mp-go')) this.P.centreOn(this.P.sel, true);
    });
  }
  get G() { return this.P.G; }
  /** the lists, filtered by the search, sorted (groups / categories, then nearest first) */
  rows() {
    const L = this.P.lists(); if (!L) return { people: [], places: [] };
    const G = this.G, hk = areaKey(G), P = G.player?.pos, q = this.q, PL = L.places;
    const match = (...s) => !q || s.some(x => x && String(x).toLowerCase().includes(q));
    // (how far: only for whoever is in the world you stand in; the area's own people head the list, under its name)
    const near = e => e.you || e.shadow || (e.area === hk && (e.visible || e.kind === 'place'));
    const people = L.people.map(e => ({ e, g: e.area === hk && hk !== 'village' && e.group !== 'quest' ? 'here' : e.group, where: personWhere(G, e, PL), d: near(e) ? dist(P, e.pos) : Infinity }))
      .filter(r => match(r.e.name, r.e.role, r.where));
    const order = Object.fromEntries([['quest', 0], ['here', 1], ...GROUPS.slice(1).map(([g], i) => [g, i + 2])]);
    people.sort((a, b) => ((order[a.g] ?? 9) - (order[b.g] ?? 9)) || ((b.e.named ? 1 : 0) - (a.e.named ? 1 : 0)) || (a.d - b.d));
    let places = PL.filter(e => !e.node || q).map(e => ({ e, d: near(e) ? dist(P, e.pos) : Infinity })).filter(r => match(r.e.name, r.e.sub, CATS.find(c => c[0] === r.e.cat)?.[1]));
    // a kind built more than once (the Stash Chests: e.twin) is one row, the nearest (or the pinned one), "the nearest of n"
    const pinK = G.mapPin?.cur?.key, tw = new Map();
    for (const r of places) if (r.e.twin) { const t = tw.get(r.e.twin); if (!t) tw.set(r.e.twin, { best: r, n: 1 }); else { t.n++; if (r.e.key === pinK || (t.best.e.key !== pinK && r.d < t.best.d)) t.best = r; } }
    if (tw.size) { places = places.filter(r => !r.e.twin || tw.get(r.e.twin).best === r); for (const t of tw.values()) t.best.n = t.n; }
    const corder = Object.fromEntries(CATS.map(([c], i) => [c, i]));
    places.sort((a, b) => (b.e.mine ? 1 : 0) - (a.e.mine ? 1 : 0) || (corder[a.e.cat] - corder[b.e.cat]) || (a.d - b.d));
    return { people, places };
  }
  icon(e) {
    if (e.kind === 'person') {
      if (e.shadow) return `<i class="mp-ic dog">${glyph('shadowDog')}</i>`;
      return `<i class="mp-ic pip${e.you ? ' you' : ''}" style="--c:${e.color}">${esc(e.initial || '?')}</i>`;
    }
    return `<i class="mp-ic bd" style="--c:${e.color}">${iconSVG(e.icon)}</i>`;
  }
  /** re-render when something shown changed (twice a second from the panel), or now (force) */
  render(force = false) {
    const tabs = this.$.tabs.querySelectorAll('.tab');
    for (const t of tabs) t.classList.toggle('on', t.dataset.t === this.tab);
    const R = this.rows(), pin = this.G.mapPin?.cur?.key || null, sel = this.P.sel;
    tabs[0].querySelector('.tab-n').textContent = R.people.filter(r => !r.e.you && !r.e.shadow).length;
    tabs[1].querySelector('.tab-n').textContent = R.places.length;
    tabs[2].querySelector('.tab-n').textContent = '';
    const key = this.tab === 'key';
    this.$.list.hidden = key; this.$.legend.hidden = !key;
    this.renderKey(); // (built whatever the tab: again only when the area's kind changes)
    if (key) { this.renderCard(force); return; }
    let html = '', sig = this.tab + '|' + pin + '|' + sel + '|' + this.q;
    if (this.tab === 'people') {
      let g = null;
      for (const r of R.people) {
        const e = r.e;
        if (r.g !== g) { g = r.g; const n = R.people.filter(x => x.g === g).length; html += `<div class="mp-gh g-${g}">${esc(g === 'here' ? this.P.areaName() : GROUPS.find(x => x[0] === g)?.[1] || g)}<span>${n}</span></div>`; }
        const d = fmtM(r.d), w = r.where + (d && !e.you ? ` · ${d}` : '');
        sig += `${e.key}${w}${e.badge || ''};`;
        html += `<button class="mp-row${e.key === sel ? ' sel' : ''}${e.key === pin ? ' pinned' : ''}${e.away ? ' away' : ''}" data-key="${esc(e.key)}">${this.icon(e)}<span class="mp-t"><b>${esc(e.name)}<small>${esc(e.role || '')}</small></b><em>${esc(w)}</em></span>${e.badge ? `<i class="mp-fl f-${e.badge === '!' ? 'ex' : e.badge === '?' ? 'q' : 'gift'}">${e.badge === 'gift' ? '♥' : e.badge}</i>` : ''}${e.key === pin ? `<i class="mp-pn">${glyph('pin')}</i>` : ''}</button>`;
      }
      if (!R.people.length) html = `<div class="bd-empty">${glyph('sakura')}${this.q ? 'Nobody by that name' : 'Nobody about'}</div>`;
    } else {
      let c = null;
      for (const r of R.places) {
        const e = r.e, cat = e.mine ? 'mine' : e.cat;
        if (cat !== c) { c = cat; html += `<div class="mp-gh c-${cat}">${cat === 'mine' ? 'Home' : esc(CATS.find(x => x[0] === cat)?.[1] || cat)}</div>`; }
        const d = fmtM(r.d);
        sig += `${e.key}${d};`;
        const many = r.n > 1 ? `<small>${e.key === pin ? 'pinned' : 'the nearest'} of ${r.n}</small>` : ''; // (a kind built more than once: one row)
        sig += many;
        html += `<button class="mp-row${e.key === sel ? ' sel' : ''}${e.key === pin ? ' pinned' : ''}" data-key="${esc(e.key)}">${this.icon(e)}<span class="mp-t"><b>${esc(e.name)}${many}</b><em>${esc(e.sub || '')}${d ? ` · ${d}` : ''}</em></span>${e.key === pin ? `<i class="mp-pn">${glyph('pin')}</i>` : ''}</button>`;
      }
      if (!R.places.length) html = `<div class="bd-empty">${glyph('sakura')}Nowhere by that name</div>`;
    }
    if (force || (sig !== this.sig && !this.held)) { this.sig = sig; this.$.list.innerHTML = html; }
    this.renderCard(force);
  }
  /** the picked one's card: who or what, where, and what you can do */
  renderCard(force) {
    const C = this.$.card, e = this.P.entry(this.P.sel);
    if (!e) { if (!C.hidden) { C.hidden = true; C.innerHTML = ''; this.cardSig = ''; } return; }
    const L = this.P.lists(), P = e.you || e.area === areaKey(this.G) ? this.G.player?.pos : null, pin = this.G.mapPin?.is(e.key);
    const where = e.kind === 'person' ? personWhere(this.G, e, L?.places) : e.sub || '';
    const d = e.pos && !e.you && (e.kind === 'place' || e.visible) ? fmtM(dist(P, e.pos)) : '';
    const can = !e.you && !e.shadow && !e.away && !!e.pos, lead = !!this.G.lead && can;
    const leading = lead && pin && this.G.lead.active && this.G.lead.intent?.key === `m:${e.key}`;
    const sig = [e.key, where, d, pin, lead, leading].join('|');
    if (!force && sig === this.cardSig) return; this.cardSig = sig;
    C.hidden = false;
    C.innerHTML = `<div class="mc-h">${this.icon(e)}<div class="mc-t"><b>${esc(e.name)}</b><span>${esc(e.kind === 'person' ? e.role || '' : CATS.find(x => x[0] === e.cat)?.[1] || '')}</span></div></div>
      <div class="mc-w">${glyph(e.kind === 'person' ? 'chat' : 'pin')}<span><b class="mc-nm">${esc(e.name)}</b><i class="mc-wt">${esc(where)}</i>${d ? `<b class="mc-dd">${d}</b>` : ''}</span></div>
      ${pin ? `<div class="mc-pin">${glyph('pin')}Pinned: the arrow and the minimap point the way</div>` : ''}
      ${can ? `<div class="mc-b">${lead ? `<button class="btn sm mint mp-lead"${leading ? ' disabled' : ''}>${glyph('paw')}${leading ? '<span>Shadow is leading</span>' : '<span class="l-long">Shadow, take me there</span><span class="l-short">Take me there</span>'}</button>` : ''}${pin ? `<button class="btn sm mp-unpin" title="Unpin">${glyph('x')}<span class="l-txt">Unpin</span></button>` : `<button class="btn sm pink mp-pin">${glyph('pin')}Pin</button>`}</div>` : e.away ? '<div class="mc-pin">Out on an expedition: back when the crew comes home</div>' : ''}`;
  }
  /** the Key: every mark, drawn with the same art as the maps */
  renderKey(force = false) {
    if (!force && this.$.legend.childElementCount && this._keyMode === this.P.keyMode() && this._mv === markVersion()) return;
    this._keyMode = this.P.keyMode(); this._mv = markVersion(); // (again once a glyph has loaded: it was a dot)
    const rows = this.P.legendRows();
    if (rows.html) { this.$.legend.innerHTML = rows.html; return; }
    this.$.legend.innerHTML = rows.map(([t, s]) => `<div><canvas class="lg-cv" width="56" height="56" data-s="${s}"></canvas>${esc(t)}</div>`).join('');
    for (const c of this.$.legend.querySelectorAll('.lg-cv')) drawSwatch(c, c.dataset.s);
  }
}

/** a legend swatch: the mark itself at the size the big map draws it */
function drawSwatch(c, s) {
  const k = Math.max(2, DPR()) * 1.25; c.width = c.height = Math.round(28 * k); // (sharp under the Deck's 1.15 UI zoom)
  const g = c.getContext('2d'); g.setTransform(k, 0, 0, k, 0, 0); g.clearRect(0, 0, 28, 28);
  g.translate(14, 14); g.scale(1.3, 1.3); g.translate(-14, -14); // (the marks a third bigger than on the map: a key to read)
  const put = img => g.drawImage(img, 14 - img.cssW / 2, 14 - img.cssH / 2, img.cssW, img.cssH);
  const parts = s.split('|'), [kind, a, b] = parts;
  switch (kind) {
    case 'you': drawArrow(g, 14, 14, 0, 0.95); break;
    case 'shadow': put(shadowMark(5.6)); break;
    case 'pip': put(pip(a, b || '', +(parts[3] || 7))); break;
    case 'flag': put(pip('#f78fb6', 'M', 7)); { const f = flag(a, 4.6); g.drawImage(f, 17, 3, f.cssW, f.cssH); } break;
    case 'badge': put(badge(a, b, 8.5, { dim: parts[3] === 'dim' })); break;
    case 'pin': drawPin(g, 14, 23, 0, 1); break;
    case 'star': drawStar(g, 14, 14, 0, 1); break;
    case 'dig': pawMark(g, 14, 15, 1.4); break;
    case 'node': g.beginPath(); g.arc(14, 14, 3.4, 0, Math.PI * 2); g.fillStyle = '#7ad890'; g.fill(); g.lineWidth = 1.2; g.strokeStyle = INK; g.stroke(); break;
    case 'path': g.lineCap = 'round'; g.strokeStyle = '#d6b089'; g.lineWidth = 9; g.beginPath(); g.moveTo(3, 20); g.quadraticCurveTo(14, 4, 25, 12); g.stroke(); g.strokeStyle = '#f6e6c8'; g.lineWidth = 6; g.stroke(); break;
    case 'roof': g.fillStyle = '#d86a4a'; g.beginPath(); g.roundRect(5, 7, 18, 14, 2); g.fill(); g.fillStyle = '#e8907a'; g.fillRect(5, 7, 18, 7); g.lineWidth = 1.4; g.strokeStyle = INK; g.beginPath(); g.roundRect(5, 7, 18, 14, 2); g.stroke(); break;
    case 'tree': for (const [x, y, col] of [[10, 15, '#5cab58'], [17, 11, '#f2a6c6'], [18, 18, '#3e8a5a']]) { g.beginPath(); g.arc(x, y, 6, 0, Math.PI * 2); g.fillStyle = col; g.fill(); } break;
    case 'district': g.font = '800 9px Fredoka, system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 3; g.strokeStyle = '#fffaf0'; g.strokeText('Aa', 14, 14); g.fillStyle = '#5a3440'; g.fillText('Aa', 14, 14); break;
    case 'wild': wildMark(g, 14, 14, 11, 0.75); break;
    case 'sight': sightingPin(g, 14, 14, 1, 0); break;
    case 'mon': case 'elite': case 'boss': { const r = kind === 'boss' ? 6 : kind === 'elite' ? 4.4 : 3.2; g.beginPath(); g.arc(14, 14, r, 0, Math.PI * 2); g.fillStyle = kind === 'boss' ? '#ff3a6a' : kind === 'elite' ? '#ffb030' : '#ff7a7a'; g.fill(); g.lineWidth = 1.3; g.strokeStyle = '#2a1a24'; g.stroke(); if (kind === 'elite') { g.beginPath(); g.arc(14, 14, r, Math.PI / 2, Math.PI * 1.5); g.fillStyle = '#6aa8ff'; g.fill(); g.stroke(); } break; }
    case 'fog': { const gr = g.createLinearGradient(2, 0, 26, 0); gr.addColorStop(0, '#d2bc9e'); gr.addColorStop(0.45, '#d2bc9e'); gr.addColorStop(0.75, '#211a2c'); g.fillStyle = gr; g.beginPath(); g.roundRect(3, 6, 22, 16, 4); g.fill(); break; }
    case 'trail': g.lineCap = 'round'; g.strokeStyle = 'rgba(120, 92, 64, .55)'; g.lineWidth = 9; g.beginPath(); g.moveTo(3, 21); g.quadraticCurveTo(13, 4, 25, 11); g.stroke(); g.strokeStyle = '#e8dcc0'; g.lineWidth = 6; g.stroke(); break;
    case 'thicket': g.fillStyle = 'rgba(34, 64, 44, .55)'; for (const [x, y, r] of [[10, 15, 7], [18, 12, 6], [17, 19, 6]]) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); } break;
    case 'furn': g.fillStyle = 'rgba(40,24,34,.28)'; g.beginPath(); g.roundRect(7, 9, 17, 13, 3); g.fill(); g.fillStyle = '#e2b988'; g.beginPath(); g.roundRect(5, 6, 17, 13, 3); g.fill(); g.lineWidth = 1.5; g.strokeStyle = 'rgba(74,44,42,.7)'; g.stroke(); break;
    case 'rug': g.globalAlpha = 0.75; g.fillStyle = '#ffbcd6'; g.beginPath(); g.roundRect(4, 7, 20, 14, 4); g.fill(); g.globalAlpha = 1; g.setLineDash([3, 3]); g.lineWidth = 1.5; g.strokeStyle = '#d8909e'; g.stroke(); g.setLineDash([]); break;
    case 'edge': g.save(); g.translate(14, 14); g.beginPath(); g.moveTo(8, 0); g.lineTo(-4, -6.5); g.lineTo(-1.5, 0); g.lineTo(-4, 6.5); g.closePath(); g.fillStyle = '#ff5c8a'; g.fill(); g.lineWidth = 2; g.strokeStyle = '#fff'; g.stroke(); g.lineWidth = 1; g.strokeStyle = INK; g.stroke(); g.restore(); break;
    default: break;
  }
}
