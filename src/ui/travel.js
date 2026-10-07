// The Travel Map (docs/REGIONS.md §1): a painted map with Blossom Hollow in the middle and the four outdoor regions
// around it. Pick a place and set off. Opened from the Wayfarer's Post in the village or a region's Wayfarer's Stone.
// Data comes from the game (G.travel.list / G.travel.go), so the UI never imports world code.
import { el, esc } from './dom.js';
import { glyph } from './glyphs.js';
import { padGlyph } from './padGlyphs.js';
import { Panel } from './panel.js';

// where each place sits on the painted map (0..1) and its map glyph
const SPOT = {
  village: { x: 0.5, y: 0.56, g: 'sakura' },
  bamboo: { x: 0.2, y: 0.5, g: 'bamboo' },
  maple: { x: 0.77, y: 0.34, g: 'maple' },
  tidepool: { x: 0.56, y: 0.86, g: 'wave' },
  onsen: { x: 0.36, y: 0.15, g: 'snowflake' },
};
const W = 560, H = 440;

export class TravelPanel extends Panel {
  constructor(ui) { super(ui, { name: 'travel', title: 'Travel Map', jp: '旅の地図', side: 'center', cls: 'p-travel', icon: 'map' }); this.sel = null; }
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
    this.pins.innerHTML = L.map((p, i) => {
      const s = SPOT[p.id] || { x: 0.5, y: 0.5, g: 'pin' };
      const cls = ['tv-pin', p.unlocked ? 'open' : 'locked', p.here ? 'here' : '', p.id === this.sel ? 'sel' : '', p.cleared ? 'cleared' : ''].join(' ');
      return `<button class="${cls}" data-id="${p.id}" style="left:${s.x * 100}%;top:${s.y * 100}%;--pc:${p.color}">
        <span class="tv-pin-ic">${glyph(p.unlocked ? s.g : 'lock')}</span><span class="tv-pin-n"><b>${i + 1}</b>${esc(p.short || p.name)}</span>
        ${p.cleared ? `<span class="tv-stamp">${p.dungeon ? '踏破' : '討伐'}</span>` : ''}${p.here ? `<span class="tv-here">${glyph('paw')}</span>` : ''}</button>`;
    }).join('');
    const p = L.find(x => x.id === this.sel) || L[0]; if (!p) { this.card.innerHTML = ''; return; }
    const lv = p.levels ? `Lv ${p.levels[0]}–${p.levels[1]}` : 'Home';
    const fit = p.levels ? (hero < p.levels[0] - 1 ? 'hard' : hero > p.levels[1] + 2 ? 'easy' : 'good') : 'home';
    const fitText = { hard: 'A bit tough for you yet', easy: 'An easy stroll for you now', good: 'Just right for your level', home: 'Home sweet home' }[fit];
    const status = p.here ? `<div class="tv-st here">${glyph('paw')}You are here</div>`
      : !p.unlocked ? `<div class="tv-st locked">${glyph('lock')}${esc(p.why || 'Locked')}</div>`
      : `<button class="btn tv-go">${glyph('map')}${p.id === 'village' ? 'Head home' : 'Set off!'}</button>`;
    this.card.style.setProperty('--pc', p.color);
    this.card.innerHTML = `<div class="tv-wm">${glyph(SPOT[p.id]?.g || 'map')}</div><div class="tv-hd"><span class="tv-ic">${glyph(SPOT[p.id]?.g || 'map')}</span><div><b>${esc(p.name)}</b><span class="jp">${esc(p.jp || '')}</span></div></div>
      <p class="tv-sub">${esc(p.sub || '')}</p>
      <div class="tv-rows">
        <div><span>Level</span><b>${lv}</b></div>
        ${p.levels ? `<div class="fit ${fit}"><span>For you (Lv ${hero})</span><b>${fitText}</b></div>` : ''}
        ${p.village ? `<div><span>Village</span><b>${esc(p.village.name)} <em class="tv-beat">${p.village.saved ? 'saved ♡' : 'under siege!'}</em></b></div>` : ''}
        ${p.dungeon ? `<div><span>Dungeon</span><b>${esc(p.dungeon.name)}${p.dungeon.cleared ? ` <em class="tv-beat">cleared ×${p.dungeon.cleared}</em>` : ''}</b></div>` : ''}
        ${p.boss ? `<div><span>Boss</span><b>${esc(p.dungeon?.boss || p.boss)}${p.dungeon ? ' <em class="tv-beat">deep in the dungeon</em>' : p.cleared ? ` <em class="tv-beat">defeated ×${p.cleared}</em>` : ''}</b></div>` : ''}
        ${p.monsters?.length ? `<div><span>Yokai</span><b>${p.monsters.map(esc).join(', ')}</b></div>` : ''}
        ${p.levels ? `<div><span>Visits</span><b>${p.visits || 0}</b></div>` : ''}
      </div>
      ${status}`;
  }
  // a painted parchment map: sea, the Hollow's island, and each region's land in its colour, joined by dotted roads
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
    // land blobs
    const blob = (cx, cy, r, fill, seed) => {
      g.beginPath();
      for (let k = 0; k <= 24; k++) { const a = k / 24 * Math.PI * 2, rr = r * (1 + 0.16 * Math.sin(a * 3 + seed) + 0.08 * Math.sin(a * 5 + seed * 2)); const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr * 0.8; k ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.closePath(); g.fillStyle = fill; g.fill(); g.lineWidth = 3; g.strokeStyle = 'rgba(74,44,42,.55)'; g.stroke();
    };
    const tint = { village: '#bfe8a8', bamboo: '#a8dca0', maple: '#f4c08a', tidepool: '#f4e2b0', onsen: '#eef4ff' };
    const R = { village: 70, bamboo: 70, maple: 66, tidepool: 62, onsen: 66 };
    // roads first (under the land edges)
    const V = SPOT.village;
    g.setLineDash([3, 7]); g.lineWidth = 3.2; g.strokeStyle = 'rgba(122,78,54,.85)';
    for (const p of L) {
      if (p.id === 'village') continue;
      const s = SPOT[p.id]; if (!s) continue;
      g.beginPath(); g.moveTo(V.x * W, V.y * H);
      g.quadraticCurveTo((V.x + s.x) / 2 * W + 30, (V.y + s.y) / 2 * H - 20, s.x * W, s.y * H);
      g.globalAlpha = p.unlocked ? 1 : 0.35; g.stroke(); g.globalAlpha = 1;
    }
    g.setLineDash([]);
    L.forEach((p, i) => {
      const s = SPOT[p.id]; if (!s) return;
      g.globalAlpha = p.unlocked ? 1 : 0.55;
      blob(s.x * W, s.y * H, R[p.id] || 60, tint[p.id] || '#e8dcc0', i * 1.7 + 0.4);
      g.globalAlpha = 1;
    });
    // little painted motifs on each land (trees / peaks / waves), soft so the pins stay readable
    const dot = (x, y, r, c) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = c; g.fill(); };
    const at = id => [SPOT[id].x * W, SPOT[id].y * H];
    { const [x, y] = at('village'); for (let k = 0; k < 7; k++) dot(x - 40 + k * 13, y + 28 + (k % 2) * 6, 7, '#ffb8cc'); }
    { const [x, y] = at('bamboo'); g.strokeStyle = '#5aa04a'; g.lineWidth = 4; for (let k = 0; k < 8; k++) { g.beginPath(); g.moveTo(x - 44 + k * 12, y + 34); g.lineTo(x - 40 + k * 12, y - 2 - (k % 3) * 8); g.stroke(); } }
    { const [x, y] = at('maple'); for (let k = 0; k < 7; k++) dot(x - 38 + k * 12, y + 30 - (k % 2) * 8, 9, ['#ff7a4a', '#ffb03a', '#e8503a'][k % 3]); }
    { const [x, y] = at('tidepool'); g.strokeStyle = '#3cb8c8'; g.lineWidth = 3; for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(x - 30 + k * 20, y + 22, 8, Math.PI, 0); g.stroke(); } }
    { const [x, y] = at('onsen'); for (let k = 0; k < 3; k++) { const px = x - 36 + k * 28, py = y + 34; g.beginPath(); g.moveTo(px - 18, py); g.lineTo(px, py - 34 - k * 4); g.lineTo(px + 18, py); g.closePath(); g.fillStyle = '#c8d4f0'; g.fill(); g.beginPath(); g.moveTo(px - 7, py - 22 - k * 2); g.lineTo(px, py - 34 - k * 4); g.lineTo(px + 7, py - 22 - k * 2); g.closePath(); g.fillStyle = '#ffffff'; g.fill(); } }
    // paper vignette
    const vg = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.8); vg.addColorStop(0, 'rgba(255,246,232,0)'); vg.addColorStop(1, 'rgba(160,120,80,.28)');
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
  }
}
