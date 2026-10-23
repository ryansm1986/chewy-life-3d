// The Travel Map (docs/REGIONS.md §1): a painted map with Blossom Hollow in the middle and the four outdoor regions
// around it. Pick a place and set off. Opened from the Wayfarer's Post in the village or a region's Wayfarer's Stone.
// Data comes from the game (G.travel.list / G.travel.go), so the UI never imports world code.
import { el, esc } from './dom.js';
import { glyph } from './glyphs.js';
import { padGlyph } from './padGlyphs.js';
import { Panel } from './panel.js';

const W = 560, H = 440;
// The islands make a paw (the owner's ask): Blossom Hollow is the big pad, the four regions its toes, left to right in
// the order you open them (and their 2-5 keys). Each island in map pixels: centre, radii, and the glyph on its pin.
const ISLE = {
  village: { cx: 280, cy: 312, rx: 120, ry: 92, g: 'sakura' },
  bamboo: { cx: 100, cy: 198, rx: 52, ry: 62, g: 'bamboo' },
  maple: { cx: 212, cy: 104, rx: 55, ry: 64, g: 'maple' },
  tidepool: { cx: 348, cy: 104, rx: 55, ry: 64, g: 'wave' },
  onsen: { cx: 460, cy: 198, rx: 52, ry: 62, g: 'snowflake' },
};
// where each place's pin sits on the painted map (0..1) and its map glyph
const SPOT = Object.fromEntries(Object.entries(ISLE).map(([id, s]) => [id, { x: s.cx / W, y: s.cy / H, g: s.g }]));
/** an island's coast: the pad (a wide oval with a soft dip in the top edge, as on a paw) or a toe (an oval leaning out
 *  from the pad, as toes splay), with a little wobble so it reads as a coastline */
function islePath(id, grow = 0) {
  const s = ISLE[id], P = ISLE.village, pad = id === 'village', seed = s.cx * 0.013 + s.cy * 0.007;
  const tilt = pad ? 0 : Math.atan2(s.cy - P.cy, s.cx - P.cx) + Math.PI / 2;
  const path = new Path2D(), N = 64;
  for (let k = 0; k <= N; k++) {
    const a = k / N * Math.PI * 2;
    let r = 1 + 0.018 * Math.sin(a * 5 + seed) + 0.014 * Math.sin(a * 9 + seed * 3);
    if (pad) { // (the dip between the two middle toes, and a soft three-lobed heel)
      const d = Math.atan2(Math.sin(a + Math.PI / 2), Math.cos(a + Math.PI / 2)), lo = Math.max(0, Math.sin(a));
      r += -0.17 * Math.exp(-((d / 0.45) ** 2)) + 0.05 * lo + 0.04 * lo * lo * Math.cos(6 * (a - Math.PI / 2));
    }
    const lx = Math.cos(a) * (s.rx * r + grow), ly = Math.sin(a) * (s.ry * r + grow);
    const x = s.cx + lx * Math.cos(tilt) - ly * Math.sin(tilt), y = s.cy + lx * Math.sin(tilt) + ly * Math.cos(tilt);
    if (k) path.lineTo(x, y); else path.moveTo(x, y);
  }
  path.closePath();
  return path;
}

export class TravelPanel extends Panel {
  constructor(ui) { super(ui, { name: 'travel', title: 'Travel Map', side: 'center', cls: 'p-travel', icon: 'map' }); this.sel = null; }
  init() {
    this.body.innerHTML = `<div class="tv-wrap">
      <div class="tv-map"><canvas class="tv-cv"></canvas><div class="tv-pins"></div><div class="tv-compass">${glyph('sakura')}<b>N</b></div></div>
      <div class="tv-side"><div class="tv-card"></div>
        <div class="tv-foot kbm-only"><span class="kc sm">1</span>–<span class="kc sm">5</span> choose <span class="sep">·</span> <span class="kc sm">Enter</span> set off</div><div class="tv-foot pad-only"><span class="kc sm pad">${padGlyph('DRight')}</span> choose <span class="sep">·</span> <span class="kc sm pad">${padGlyph('A')}</span> on the card: set off</div></div>
    </div>`;
    this.cv = this.body.querySelector('.tv-cv');
    this.pins = this.body.querySelector('.tv-pins');
    this.card = this.body.querySelector('.tv-card');
    this.pins.addEventListener('click', e => { const p = e.target.closest('.tv-pin'); if (p) this.select(p.dataset.id, true); });
    this.card.addEventListener('click', e => { if (e.target.closest('.tv-go')) this.go(); });
    this.onKey = e => {
      if (!this.isOpen) return;
      const L = this.list();
      if (/^[1-5]$/.test(e.key)) { const it = L[+e.key - 1]; if (it) { this.select(it.id, true); e.preventDefault(); } }
      if (e.key === 'Enter') { this.go(); e.preventDefault(); }
    };
    addEventListener('keydown', this.onKey);
  }
  list() { return this.G?.travel?.list?.() || []; }
  onOpen() {
    const L = this.list(), here = L.find(p => p.here);
    // default pick: the next place worth going (an open region you haven't beaten, else home)
    this.sel = this.opts.select || L.find(p => p.id !== 'village' && p.unlocked && !p.here && !p.cleared)?.id || (here?.id === 'village' ? L.find(p => p.unlocked && !p.here)?.id : 'village') || 'village';
    this.drawMap();
    this.render();
    this.ui.sfx?.('open');
    this.G?.audio?.play?.('travel_map_open');
  }
  select(id, user) { if (this.sel === id) return; this.sel = id; this.render(); if (user) this.ui.sfx?.('tab'); }
  go() {
    const it = this.list().find(p => p.id === this.sel);
    if (!it || !it.unlocked || it.here) { this.ui.sfx?.('deny'); return; }
    this.G?.audio?.play?.('travel_chime');
    this.G.travel.go(it.id);
  }
  render() {
    const L = this.list(), hero = this.G?.state?.player?.lvl || 1;
    // pins over the painted map
    const card = id => (id !== 'village' && this.G?.peaceful?.card?.(id)) || null; // (the wild areas, peace and today's sightings: cozy/peacefulRun.js)
    this.pins.innerHTML = L.map((p, i) => {
      const s = SPOT[p.id] || { x: 0.5, y: 0.5, g: 'pin' }, live = p.unlocked && (card(p.id)?.sightings || []).some(q => !q.done);
      const cls = ['tv-pin', p.unlocked ? 'open' : 'locked', p.here ? 'here' : '', p.id === this.sel ? 'sel' : '', p.cleared ? 'cleared' : ''].join(' ');
      return `<button class="${cls}" data-id="${p.id}" style="left:${s.x * 100}%;top:${s.y * 100}%;--pc:${p.color}">
        <span class="tv-pin-ic">${glyph(p.unlocked ? s.g : 'lock')}</span><span class="tv-pin-n"><b>${i + 1}</b>${esc(p.short || p.name)}</span>
        ${p.cleared ? `<span class="tv-stamp${p.dungeon && !p.dungeon.cleared ? ' crew' : ''}" title="${p.dungeon ? (p.dungeon.cleared ? 'Cleared' : 'Relieved by a crew') : 'Defeated'}">${p.dungeon ? (p.dungeon.cleared ? 'Cleared' : 'Saved') : 'Beaten'}</span>` : ''}${p.here ? `<span class="tv-here">${glyph('paw')}</span>` : ''}${live ? '<span class="tv-sight" title="A sighting today"></span>' : ''}</button>`;
    }).join('');
    const p = L.find(x => x.id === this.sel) || L[0]; if (!p) { this.card.innerHTML = ''; return; }
    const lv = p.levels ? `Lv ${p.levels[0]}–${p.levels[1]}` : 'Home';
    const fit = p.levels ? (hero < p.levels[0] - 1 ? 'hard' : hero > p.levels[1] + 2 ? 'easy' : 'good') : 'home';
    const fitText = { hard: 'A bit tough for you yet', easy: 'An easy stroll for you now', good: 'Just right for your level', home: 'Home sweet home' }[fit];
    const status = p.here ? `<div class="tv-st here">${glyph('paw')}You are here</div>`
      : !p.unlocked ? `<div class="tv-st locked">${glyph('lock')}${esc(p.why || 'Locked')}</div>`
      : `<button class="btn tv-go">${glyph('map')}${p.id === 'village' ? 'Head home' : 'Set off!'}</button>`;
    this.card.style.setProperty('--pc', p.color);
    const pc = card(p.id), sights = (pc?.sightings || []).filter(q => !q.done);
    this.card.innerHTML = `<div class="tv-wm">${glyph(SPOT[p.id]?.g || 'map')}</div><div class="tv-hd"><span class="tv-ic">${glyph(SPOT[p.id]?.g || 'map')}</span><div><b>${esc(p.name)}</b></div></div>
      <p class="tv-sub">${esc(p.sub || '')}</p>
      <div class="tv-rows">
        <div><span>Level</span><b>${lv}</b></div>
        ${p.levels ? `<div class="fit ${fit}"><span>For you (Lv ${hero})</span><b>${fitText}</b></div>` : ''}
        ${p.village ? `<div><span>Village</span><b>${esc(p.village.name)} <em class="tv-beat">${p.village.saved ? 'saved ♡' : 'under siege!'}</em></b></div>` : ''}
        ${p.dungeon ? `<div><span>Dungeon</span><b>${esc(p.dungeon.name)}${p.dungeon.cleared ? ` <em class="tv-beat">cleared ×${p.dungeon.cleared}</em>` : p.dungeon.crew ? ' <em class="tv-beat">cleared by a crew</em>' : ''}</b></div>` : ''}
        ${p.boss ? `<div><span>Boss</span><b>${esc(p.dungeon?.boss || p.boss)}${p.dungeon ? ' <em class="tv-beat">deep in the dungeon</em>' : p.cleared ? ` <em class="tv-beat">defeated ×${p.cleared}</em>` : ''}</b></div>` : ''}
        ${p.monsters?.length ? `<div><span>Yokai</span><b>${p.monsters.map(esc).join(', ')}</b></div>` : ''}
        ${p.village && pc ? `<div><span>Trail</span><b>${pc.peaceful ? 'Peaceful <em class="tv-beat">yokai only in the wild places</em>' : 'Under siege <em class="tv-beat">yokai on the trail</em>'}</b></div>` : ''}
        ${pc?.wild?.length ? `<div class="tv-wild"><span>Wild</span><b>${pc.wild.map(esc).join(', ')}</b></div>` : ''}
        ${p.unlocked && sights.length ? `<div class="tv-sightrow"><span>Sighting</span><b>${sights.map(q => esc(q.name)).join(', ')} <em class="tv-beat">bounty today</em></b></div>` : ''}
        ${p.levels ? `<div><span>Visits</span><b>${p.visits || 0}</b></div>` : ''}
      </div>
      ${status}`;
  }
  // a painted parchment map: sea, and the islands in the shape of a paw (the Hollow the pad, the regions its toes), each
  // in its colour, ringed by shallows and joined to the pad by dotted roads
  drawMap() {
    const cv = this.cv, dpr = Math.min(2, devicePixelRatio || 1);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const L = this.list();
    // paper + sea
    const sea = g.createLinearGradient(0, 0, 0, H); sea.addColorStop(0, '#cfeff4'); sea.addColorStop(1, '#a8dce8');
    g.fillStyle = sea; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 2; g.lineCap = 'round';
    for (let i = 0; i < 26; i++) { const x = (i * 97) % W, y = (i * 61) % H; g.beginPath(); g.arc(x, y, 7, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); g.beginPath(); g.arc(x + 12, y, 7, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); }
    const tint = { village: '#bfe8a8', bamboo: '#a8dca0', maple: '#f4c08a', tidepool: '#f4e2b0', onsen: '#eef4ff' };
    const isles = L.filter(p => ISLE[p.id]);
    // the shallows round each island (pale water), then the roads across the channels (under the land edges)
    g.fillStyle = 'rgba(236,252,250,.55)';
    for (const p of isles) g.fill(islePath(p.id, 11));
    const V = ISLE.village;
    g.setLineDash([3, 7]); g.lineWidth = 3.2; g.strokeStyle = 'rgba(122,78,54,.85)';
    for (const p of isles) {
      if (p.id === 'village') continue;
      const s = ISLE[p.id];
      g.beginPath(); g.moveTo(V.cx + (s.cx - V.cx) * 0.3, V.cy + (s.cy - V.cy) * 0.3); g.lineTo(s.cx, s.cy);
      g.globalAlpha = p.unlocked ? 1 : 0.35; g.stroke(); g.globalAlpha = 1;
    }
    g.setLineDash([]);
    for (const p of isles) {
      g.globalAlpha = p.unlocked ? 1 : 0.55;
      const path = islePath(p.id);
      g.fillStyle = tint[p.id] || '#e8dcc0'; g.fill(path);
      g.lineWidth = 3; g.strokeStyle = 'rgba(74,44,42,.55)'; g.stroke(path);
      g.globalAlpha = 1;
    }
    // little painted motifs on each land (trees / peaks / waves), soft so the pins stay readable
    const dot = (x, y, r, c) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = c; g.fill(); };
    const at = id => [ISLE[id].cx, ISLE[id].cy];
    { const [x, y] = at('village'); for (const [dx, dy] of [[-78, 8], [-62, 36], [-34, 52], [0, 58], [34, 52], [62, 36], [78, 8], [-88, -22], [88, -22]]) dot(x + dx, y + dy, 7, '#ffb8cc'); } // (a ring of blossom round the pad)
    { const [x, y] = at('bamboo'); g.strokeStyle = '#5aa04a'; g.lineWidth = 4; for (let k = 0; k < 6; k++) { g.beginPath(); g.moveTo(x - 30 + k * 12, y + 40 - Math.abs(k - 2.5) * 3); g.lineTo(x - 27 + k * 12, y + 8 - (k % 3) * 7); g.stroke(); } }
    { const [x, y] = at('maple'); for (let k = 0; k < 5; k++) dot(x - 26 + k * 13, y + 36 - (k % 2) * 8, 8, ['#ff7a4a', '#ffb03a', '#e8503a'][k % 3]); }
    { const [x, y] = at('tidepool'); g.strokeStyle = '#3cb8c8'; g.lineWidth = 3; for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(x - 22 + k * 22, y + 34, 8, Math.PI, 0); g.stroke(); } }
    { const [x, y] = at('onsen'); for (let k = 0; k < 2; k++) { const px = x - 14 + k * 28, py = y + 44; g.beginPath(); g.moveTo(px - 16, py); g.lineTo(px, py - 28 - k * 4); g.lineTo(px + 16, py); g.closePath(); g.fillStyle = '#c8d4f0'; g.fill(); g.beginPath(); g.moveTo(px - 6, py - 18 - k * 2); g.lineTo(px, py - 28 - k * 4); g.lineTo(px + 6, py - 18 - k * 2); g.closePath(); g.fillStyle = '#ffffff'; g.fill(); } }
    // paper vignette
    const vg = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.8); vg.addColorStop(0, 'rgba(255,246,232,0)'); vg.addColorStop(1, 'rgba(160,120,80,.28)');
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
  }
}
