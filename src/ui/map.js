// Big map (uses the same provider as the minimap) and the quest journal.
import { el, esc, fmt } from './dom.js';
import { glyph } from './glyphs.js';
import { padGlyph } from './padGlyphs.js';
import { Panel } from './panel.js';
import { drawPlaceholderMap } from './hud.js';
import { FishLogView } from './fishlog.js';
import { GuidesView } from './tutorial.js';
import { CrewLogView } from './crewLog.js';
import { cozyIcon } from './cozyIcons.js';
import { pantryIcon } from '../life/pantryIcons.js';

const LEGEND_VILLAGE = [['you', 'Chewy'], ['shop', 'Shops'], ['home', 'Homes'], ['craft', 'Workshops'], ['quest', 'Quest'], ['gate', 'Burrow gate'], ['dig', "Shadow's dig spot"], ['node', 'Gather spot']];
// an outdoor zone (docs/COZY.md §6.2–§7): the wild areas, today's sightings, the scavenging marks (the swatches: ui/sightings.css)
const LEGEND_REGION = [['you', 'Chewy'], ['mon', 'Monsters'], ['elite', 'Elites'], ['wild', 'Wild area'], ['sight', 'Sighting'], ['dig', "Shadow's dig spot"], ['node', 'Gather spot'], ['portal', "Wayfarer's Stone"], ['quest', 'Quest']];
const LEGEND_DUNGEON = [['you', 'Chewy'], ['mon', 'Monsters'], ['elite', 'Elites'], ['boss', 'Boss'], ['stairs', 'Stairs down'], ['portal', 'Portal home'], ['wp', 'Waypoint'], ['quest', 'Quest']];
const LEGEND_HOME = [['you', 'You'], ['furn', 'Furniture'], ['rugs', 'Rugs'], ['door', 'The door'], ['pup', 'Shadow']]; // (indoors: docs/HOUSING.md)
export class MapPanel extends Panel {
  constructor(ui) { super(ui, { name: 'map', title: 'Map', jp: '地図', side: 'center', cls: 'p-map', icon: 'map' }); }
  init() {
    this.body.innerHTML = `<div class="mp-wrap"><div class="mp-frame"><canvas class="mp-cv"></canvas><div class="mp-compass">${glyph('sakura')}<b>N</b></div><div class="mp-vig"></div></div>
      <div class="mp-side"><div class="mp-loc"><b class="mp-name">Blossom Hollow</b><span class="jp mp-jp">さくら村</span></div>
        <div class="mp-legend"></div>
        <div class="mp-tip kbm-only">${glyph('paw')}Scroll the mouse wheel to zoom the map</div><div class="mp-tip pad-only">${glyph('paw')}<span class="kc sm pad">${padGlyph('LT')}</span><span class="kc sm pad">${padGlyph('RT')}</span> zoom the map</div>
      </div></div>`;
    this.cv = this.body.querySelector('.mp-cv');
    this.zoom = 1;
    this.cv.addEventListener('wheel', e => { e.preventDefault(); this.zoom = Math.max(0.5, Math.min(3, this.zoom * (e.deltaY > 0 ? 0.9 : 1.1))); this.draw(); }, { passive: false });
  }
  onOpen() { this.acc = 0; this.draw(); }
  render() {
    const dun = this.ui.mode === 'dungeon', home = this.ui.mode === 'interior', region = dun && !!this.ui.G?.dungeon?.isRegion;
    const lg = region ? 'region' : this.ui.mode;
    if (this._lgMode !== lg) {
      this._lgMode = lg;
      this.body.querySelector('.mp-legend').innerHTML = (region ? LEGEND_REGION : dun ? LEGEND_DUNGEON : home ? LEGEND_HOME : LEGEND_VILLAGE).map(([c, t]) => `<div><i class="lg ${c}"></i>${t}</div>`).join('');
    }
    const loc = this.ui.hud?.cache.loc;
    const name = dun ? (loc?.name || 'The Burrow') : home ? (loc?.name || 'Home') : 'Blossom Hollow';
    this.body.querySelector('.mp-name').textContent = name;
    this.body.querySelector('.mp-jp').textContent = dun ? (loc?.sub || '地下') : home ? 'おうち' : 'さくら村';
  }
  update(dt) { if (!this.isOpen) return; this.acc = (this.acc || 0) + dt; if (this.acc > 0.1) { this.acc = 0; this.draw(); } }
  draw() {
    const cv = this.cv, size = 560, dpr = Math.min(2, devicePixelRatio || 1);
    if (cv.width !== Math.round(size * dpr)) { cv.width = cv.height = Math.round(size * dpr); }
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, size, size);
    const pp = this.ui.hud.playerPos();
    const P = this.ui.hud.mm.provider;
    g.save();
    try {
      if (P?.drawBig) P.drawBig(g, size, pp, { zoom: this.zoom });
      else if (P?.draw) P.draw(g, size, pp, { big: true, zoom: this.zoom });
      else drawPlaceholderMap(g, size, pp, this.ui.mode);
    } catch (e) { console.warn('[ui] map provider', e); }
    g.restore();
    const facing = this.ui.G?.player?.facing ?? 0;
    g.save(); g.translate(size / 2, size / 2);
    const pulse = 1 + Math.sin(performance.now() / 250) * 0.15;
    g.fillStyle = 'rgba(255,143,176,.25)'; g.beginPath(); g.arc(0, 0, 18 * pulse, 0, Math.PI * 2); g.fill();
    g.rotate(Math.PI - facing);
    g.beginPath(); g.moveTo(0, -12); g.lineTo(9, 9); g.lineTo(0, 4.5); g.lineTo(-9, 9); g.closePath();
    g.fillStyle = '#ff5c8a'; g.strokeStyle = '#fff'; g.lineWidth = 4; g.lineJoin = 'round'; g.stroke(); g.fill();
    g.strokeStyle = '#4a2c2a'; g.lineWidth = 1.6; g.stroke();
    g.restore();
  }
}

export class QuestPanel extends Panel {
  constructor(ui) { super(ui, { name: 'quests', title: 'Journal', jp: 'クエスト帳', side: 'left', cls: 'p-quests', icon: 'book' }); this.sel = null; this.tab = 'active'; }
  init() {
    this.body.innerHTML = `<div class="tabs q-tabs"><button class="tab on" data-t="active">${glyph('scroll')}Active <b class="tab-n">0</b></button><button class="tab" data-t="done">${glyph('check')}Done <b class="tab-n">0</b></button><button class="tab fl-tab" data-t="fish" style="--tc:#6ab8ff"><img class="pt-ti" src="${pantryIcon('koi')}" alt="">Fish Log <b class="tab-n">0</b></button><button class="tab cl-tab" data-t="crews" style="--tc:#8fc0f0">${cozyIcon('pack')}Crews <b class="tab-n">0</b></button><button class="tab gd-tab" data-t="guides" style="--tc:#c3b3ff">${glyph('book')}Guides</button></div>
      <div class="q-wrap"><div class="q-list"></div><div class="q-detail"></div></div>`;
    this.$ = { list: this.body.querySelector('.q-list'), det: this.body.querySelector('.q-detail'), wrap: this.body.querySelector('.q-wrap') };
    this.fish = new FishLogView(this.ui); this.body.appendChild(this.fish.root); // (docs/HOMESTEAD.md)
    this.guides = new GuidesView(this.ui); this.body.appendChild(this.guides.root); // (replay the tutorials: docs/TUTORIALS.md)
    this.crews = new CrewLogView(this.ui); this.body.appendChild(this.crews.root); // (the expeditions' log: docs/COZY.md §10)
    this.body.querySelector('.q-tabs').addEventListener('click', e => { const t = e.target.closest('.tab'); if (t) { if (t.dataset.t !== this.tab) this.ui.sfx?.('tab'); this.tab = t.dataset.t; this.sel = null; this._sig = null; this.render(); } });
    this.$.list.addEventListener('click', e => { const q = e.target.closest('.q-item'); if (q) { this.sel = q.dataset.id; this._sig = null; this.render(); this.ui.sfx?.('tab'); } });
    // Follow Shadow: he leads the way to this quest's objective (again: he stops; actors/shadowLead.js, ROADMAP R-17)
    this.$.det.addEventListener('click', e => { const b = e.target.closest('.qd-lead'); if (!b || b.disabled) return; const L = this.ui.G?.lead; if (!L) return; const on = L.toggle(b.dataset.q); this.ui.sfx?.('click'); this._sig = null; if (on) this.ui.close?.('quests'); else this.render(); });
  }
  onOpen() { if (this.opts?.tab) { this.tab = this.opts.tab; this._sig = null; this.render(); } }
  render() {
    const all = this.ui.questList(true);
    const act = all.filter(q => !q.done), done = all.filter(q => q.done);
    const tabs = this.body.querySelectorAll('.q-tabs .tab');
    for (const t of tabs) t.classList.toggle('on', t.dataset.t === this.tab);
    tabs[0].querySelector('.tab-n').textContent = act.length; tabs[1].querySelector('.tab-n').textContent = done.length;
    tabs[2].querySelector('.tab-n').textContent = Object.keys(this.st.fishLog || {}).length;
    tabs[3].querySelector('.tab-n').textContent = this.crews.count();
    this.$.wrap.style.display = ['fish', 'guides', 'crews'].includes(this.tab) ? 'none' : ''; this.fish.root.style.display = this.tab === 'fish' ? '' : 'none'; this.guides.root.style.display = this.tab === 'guides' ? '' : 'none'; this.crews.root.style.display = this.tab === 'crews' ? '' : 'none';
    if (this.tab === 'fish') { this.fish.render(); return; }
    if (this.tab === 'guides') { this.guides._sig = null; this.guides.render(); return; }
    if (this.tab === 'crews') { this.crews.render(); return; }
    const list = this.tab === 'active' ? act : done;
    if (!this.sel || !list.find(q => q.id === this.sel)) this.sel = list[0]?.id || null;
    const L = this.ui.G?.lead, leadQ = L?.active && L.intent ? L.intent.t.quest : null; // (Follow Shadow: this quest's objective here, and is he on it)
    const can = this.tab === 'active' && this.sel && !!this.ui.G?.story?.target?.(this.sel) && this.ui.G?.mode !== 'interior';
    const sig = this.tab + this.sel + JSON.stringify(list) + can + leadQ;
    if (sig === this._sig) return; this._sig = sig;
    this.$.list.innerHTML = list.map((q, i) => {
      const n = q.objectives.length, k = q.objectives.filter(o => o.done).length;
      return `<div class="q-item ${q.id === this.sel ? 'on' : ''} ${q.done ? 'done' : ''}" data-id="${esc(q.id)}" style="--i:${i}"><div class="qi-ic">${glyph(q.done ? 'check' : q.main ? 'star' : 'scroll')}</div><div class="qi-t"><b>${esc(q.name)}</b><span>${q.giver ? esc(q.giver) + ' · ' : ''}${k}/${n}</span></div></div>`;
    }).join('') || `<div class="bd-empty">${glyph('sakura')}${this.tab === 'active' ? 'No quests yet — talk to villagers!' : 'Nothing finished yet.'}</div>`;
    const q = list.find(x => x.id === this.sel);
    this.$.det.innerHTML = q ? `<div class="qd-h"><div class="qd-n">${esc(q.name)}</div>${q.giver ? `<div class="qd-g">from <b>${esc(q.giver)}</b></div>` : ''}</div>
      ${q.desc ? `<div class="qd-desc">${esc(q.desc)}</div>` : ''}
      <div class="qd-objs">${q.objectives.map(o => `<div class="qo ${o.done ? 'done' : ''}"><i class="qo-box">${o.done ? glyph('check') : ''}</i><span class="qo-t">${esc(o.text)}</span>${o.need > 1 ? `<span class="qo-bar"><i style="width:${Math.min(100, (o.have / o.need) * 100)}%"></i></span><span class="qo-n">${Math.min(o.have, o.need)}/${o.need}</span>` : ''}</div>`).join('')}</div>
      ${q.rewards ? `<div class="qd-rw"><span class="qd-rh">Rewards</span>${q.rewards}</div>` : ''}
      ${!q.done && L ? `<button class="btn sm qd-lead${leadQ === q.id ? ' on' : ''}" data-q="${esc(q.id)}"${can || leadQ === q.id ? '' : ' disabled title="Nothing to lead to from here"'}>${glyph('paw')}${leadQ === q.id ? 'Shadow is leading · stop' : 'Follow Shadow'}</button>` : ''}` : `<div class="qd-empty">${glyph('book')}</div>`;
  }
}

// Normalise whatever shape quests arrive in → [{id,name,desc,giver,objectives:[{text,have,need,done}],done,rewards}]
export function normQuest(q, done) {
  if (!q) return null;
  if (typeof q === 'string') return { id: q, name: q.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()), objectives: [], done };
  const raw = q.objectives || q.steps || q.goals || q.tasks || [];
  let objectives = raw.map(o => (typeof o === 'string' ? { text: o, have: 0, need: 1, done: false } : {
    text: o.text || o.desc || o.name || '', have: +(o.have ?? o.cur ?? o.count ?? o.progress ?? (o.done ? 1 : 0)) || 0,
    need: +(o.need ?? o.goal ?? o.n ?? o.target ?? o.max ?? 1) || 1, done: !!(o.done ?? o.complete),
  }));
  objectives = objectives.map(o => ({ ...o, done: o.done || o.have >= o.need && o.need > 0 && (o.have > 0) }));
  if (!objectives.length && (q.goal || q.need)) objectives = [{ text: q.text || q.desc || '', have: +(q.progress ?? q.have ?? 0), need: +(q.goal ?? q.need), done: !!q.done }];
  const r = q.rewards || q.reward;
  let rewards = '';
  if (r) {
    if (typeof r === 'string') rewards = `<span>${esc(r)}</span>`;
    else rewards = [r.coins ? `<span>${glyph('coin')}${fmt(r.coins)}</span>` : '', r.xp ? `<span class="rw-xp">✦ ${fmt(r.xp)} XP</span>` : '', r.item ? `<span>${glyph('gift')}${esc(r.item.name || r.item)}</span>` : '', r.text ? `<span>${esc(r.text)}</span>` : ''].join('');
  }
  return { id: String(q.id ?? q.name ?? q.title), name: q.name || q.title || q.id, desc: q.desc || q.description || '', giver: q.giver || q.from || '', main: !!q.main, objectives, done: !!(done || q.done || q.complete), rewards };
}
