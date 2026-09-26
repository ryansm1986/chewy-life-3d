// Inventory (10x4 grid + paper doll), Stash (10x6) and the shared item pick-up / drag & drop controller.
import { el, esc, fmt, replay, setText, rarityColor } from './dom.js';
import { glyph, SLOT_GLYPH } from './glyphs.js';
import { portrait } from './portraits.js';
import { Panel } from './panel.js';
import { itemIconURL, itemName, meetsReq, equipSlotsFor, sellPrice } from './rpg.js';
import { itemTipHTML } from './tooltip.js';

export const EQUIP_SLOTS = ['weapon', 'weaponAlt', 'hat', 'outfit', 'collar', 'charm1', 'charm2', 'boots', 'paws'];
const SLOT_LABEL = { weapon: 'Weapon', weaponAlt: 'Swap', hat: 'Hat', outfit: 'Outfit', collar: 'Collar', charm1: 'Charm', charm2: 'Charm', boots: 'Boots', paws: 'Paws' };

// ------------------------------------------------------------------ slot helpers
export function makeSlot(c, i, cls = '') {
  const s = el('div', 'slot ' + cls);
  s.dataset.c = c; s.dataset.i = i;
  return s;
}
export function paintSlot(s, item, ui) {
  const st = ui.G?.state, d = ui.G?.derived;
  const req = item ? meetsReq(item, st, d).ok : true;
  const sig = item ? `${item.uid}|${item.qty || 1}|${req}|${ui.seen.has(item.uid)}` : '';
  if (s._sig === sig) return;
  const first = s._sig === undefined;
  const hadItem = !!s._sig || first;
  s._sig = sig;
  s.classList.remove('r-normal', 'r-magic', 'r-rare', 'r-unique', 'r-set', 'has', 'unmet', 'new');
  const lbl = s.dataset.c === 'equip' ? `<span class="sl-lbl">${glyph(SLOT_GLYPH[s.dataset.i] || 'sparkle')}</span>` : '';
  if (!item) { s.innerHTML = lbl; return; }
  s.classList.add('has', 'r-' + (item.rarity || 'normal'));
  if (!req) s.classList.add('unmet');
  if (!ui.seen.has(item.uid)) s.classList.add('new');
  s.style.setProperty('--rc', rarityColor(item.rarity));
  s.innerHTML = `<img src="${itemIconURL(item)}" alt="" draggable="false">${item.qty > 1 ? `<b class="qty">${item.qty}</b>` : ''}${item.sockets ? `<span class="socks">${Array.from({ length: item.sockets }, (_, k) => `<i class="${item.gems?.[k] ? 'on' : ''}"></i>`).join('')}</span>` : ''}`;
  if (!hadItem || s._popNext) { s._popNext = false; replay(s, 'pop', 500); }
}

// ------------------------------------------------------------------ pick-up / drag controller
export class ItemDrag {
  constructor(ui) {
    this.ui = ui; this.held = null; this.press = null; this.dragging = false;
    this.ghost = el('div', 'cursor-item'); this.ghost.innerHTML = '<div class="ci-in"><img alt=""></div>';
    ui.layers.over.appendChild(this.ghost);
    this.gimg = this.ghost.querySelector('img');
    const L = ui.layers.panels;
    L.addEventListener('pointerdown', e => this.down(e));
    addEventListener('pointermove', e => this.move(e), { passive: true });
    addEventListener('pointerup', e => this.up(e));
    L.addEventListener('contextmenu', e => { const s = e.target.closest('.slot[data-c]'); if (s) { e.preventDefault(); this.context(s, e); } });
    // clicking the world while holding an item drops it on the ground
    addEventListener('mousedown', e => {
      if (!this.held || e.button !== 0) return;
      if (e.target && e.target.id === 'game') { e.stopPropagation(); this.dropToGround(this.held); }
    }, true);
    L.addEventListener('mouseover', e => {
      const s = e.target.closest('.slot[data-c]'); if (!s || s === this._hover) return;
      this._hover = s; this.hoverSlot(s);
    });
    L.addEventListener('mouseout', e => { const s = e.target.closest('.slot[data-c]'); if (s && !s.contains(e.relatedTarget)) { this._hover = null; ui.tip.hide(s); } });
  }
  get A() { return this.ui.G?.actions || {}; }
  addr(s) { const c = s.dataset.c; return { c, i: c === 'equip' ? s.dataset.i : +s.dataset.i }; }
  get(a) {
    const st = this.ui.G?.state; if (!st || !a) return null;
    if (a.c === 'inv') return st.inventory?.[a.i] || null;
    if (a.c === 'stash') return st.stash?.[a.i] || null;
    if (a.c === 'equip') return st.equipment?.[a.i] || null;
    if (a.c === 'shop') return this.ui.panels.shop?.itemAt(a.i) || null;
    return null;
  }
  same(a, b) { return a && b && a.c === b.c && a.i === b.i; }
  hoverSlot(s) {
    const a = this.addr(s); const it = this.get(a);
    if (!it) { if (a.c === 'equip') this.ui.tip.show(`<div class="tt-simple"><div class="tt-h">${SLOT_LABEL[a.i] || a.i}</div><div class="tt-d tt-dim">Empty — drag gear here</div></div>`, '', s); return; }
    if (!this.ui.seen.has(it.uid)) { this.ui.seen.add(it.uid); s.classList.remove('new'); }
    if (this.dragging || this.held) return;
    this.ui.tip.show(this.tipFor(it, a), 'item', s);
  }
  tipFor(it, a) {
    const ui = this.ui, st = ui.G?.state;
    const hints = [];
    const shop = ui.isOpen('shop'), stash = ui.isOpen('stash');
    if (a.c === 'inv') {
      if (it.kind === 'gear') hints.push('<b>Right-click</b> equip');
      else if (it.kind !== 'material') hints.push('<b>Right-click</b> use');
      if (shop) hints.push('<b>Shift+Right-click</b> sell');
      if (stash) hints.push('<b>Ctrl+Click</b> to stash');
      hints.push('<b>Drag</b> to move');
    } else if (a.c === 'equip') hints.push('<b>Right-click</b> unequip');
    else if (a.c === 'stash') hints.push('<b>Right-click</b> to bag');
    const price = shop && a.c !== 'shop' ? { label: 'Sells for', value: sellPrice(it) } : null;
    return itemTipHTML(it, { state: st, derived: ui.G?.derived, compare: a.c === 'equip' ? null : x => this.equippedFor(x), price, hints });
  }
  equippedFor(item) {
    const eq = this.ui.G?.state?.equipment || {};
    const slots = equipSlotsFor(item); if (!slots.length) return null;
    if (item.slot === 'weapon') return eq[(this.ui.G.state.player?.activeWeapon ? 'weaponAlt' : 'weapon')] || eq.weapon || null;
    for (const s of slots) if (eq[s]) return eq[s];
    return null;
  }
  down(e) {
    if (e.button !== 0) return;
    const s = e.target.closest('.slot[data-c]'); if (!s) return;
    const a = this.addr(s);
    if (a.c === 'shop') return; // shop handles its own clicks
    e.preventDefault();
    if (this.held) { this.place(this.held, a); return; }
    const it = this.get(a); if (!it) return;
    if (e.ctrlKey || e.metaKey) { this.quickMove(a, it); return; }
    this.press = { a, x: e.clientX, y: e.clientY, s };
  }
  move(e) {
    this.mx = e.clientX; this.my = e.clientY;
    if (this.press && !this.dragging && Math.hypot(e.clientX - this.press.x, e.clientY - this.press.y) > 6) {
      this.dragging = true; this.lift(this.press.a, this.press.s);
    }
    if (this.dragging || this.held) this.ghost.style.transform = `translate3d(${e.clientX}px,${e.clientY}px,0)`;
  }
  up(e) {
    if (!this.press) return;
    const p = this.press; this.press = null;
    if (this.dragging) {
      this.dragging = false;
      const from = this.held;
      const under = document.elementFromPoint(e.clientX, e.clientY);
      const s = under?.closest?.('.slot[data-c]');
      if (s) this.place(from, this.addr(s));
      else if (under && under.id === 'game') this.dropToGround(from);
      else if (under?.closest?.('.hb')) this.cancel();
      else this.cancel();
    } else {
      // plain click → pick up (D2 style)
      this.lift(p.a, p.s);
      this.ghost.style.transform = `translate3d(${e.clientX}px,${e.clientY}px,0)`;
    }
  }
  lift(a, s) {
    const it = this.get(a); if (!it) return;
    this.held = a; this.heldEl = s;
    this.gimg.src = itemIconURL(it);
    this.ghost.style.setProperty('--rc', rarityColor(it.rarity));
    this.ghost.classList.remove('show'); void this.ghost.offsetWidth; this.ghost.classList.add('show');
    if (this.mx != null) this.ghost.style.transform = `translate3d(${this.mx}px,${this.my}px,0)`;
    s?.classList.add('lifted');
    this.ui.tip.hide();
    this.ui.root.classList.add('holding');
    // highlight equip targets
    const ok = new Set(equipSlotsFor(it));
    for (const e of this.ui.layers.panels.querySelectorAll('.slot[data-c="equip"]')) {
      e.classList.toggle('can-drop', ok.has(e.dataset.i));
      e.classList.toggle('no-drop', !ok.has(e.dataset.i));
    }
    this.ui.sfx?.('pick');
  }
  cancel() {
    this.held = null;
    this.heldEl?.classList.remove('lifted'); this.heldEl = null;
    this.ghost.classList.remove('show');
    this.ui.root.classList.remove('holding');
    for (const e of this.ui.layers.panels.querySelectorAll('.can-drop, .no-drop')) e.classList.remove('can-drop', 'no-drop');
  }
  place(from, to) {
    if (!from) return;
    if (this.same(from, to)) { this.cancel(); return; }
    const it = this.get(from);
    if (to.c === 'equip' && it && !equipSlotsFor(it).includes(to.i)) { this.deny(to); return; }
    if (to.c === 'shop') { this.cancel(); return; }
    if (from.c === 'equip' && to.c !== 'equip') {
      const other = this.get(to);
      if (other && !equipSlotsFor(other).includes(from.i)) { this.deny(to); return; }
    }
    const A = this.A;
    let ok = true;
    try { ok = A.moveItem ? A.moveItem(from, to) !== false : false; } catch (e) { console.warn('[ui] moveItem failed', e); ok = false; }
    this.cancel();
    if (!ok) { this.deny(to); return; }
    this.ui.sfx?.('drop');
    this.markPop(to);
    this.ui.refreshItems();
  }
  markPop(a) { const s = this.ui.layers.panels.querySelector(`.slot[data-c="${a.c}"][data-i="${a.i}"]`); if (s) { s._popNext = true; } }
  deny(a) {
    const s = a && this.ui.layers.panels.querySelector(`.slot[data-c="${a.c}"][data-i="${a.i}"]`);
    if (s) replay(s, 'deny', 450);
    this.cancel();
    this.ui.sfx?.('deny');
  }
  dropToGround(from) {
    const it = this.get(from);
    this.cancel();
    if (!it) return;
    try { this.A.dropItem?.(from); } catch (e) { console.warn('[ui] dropItem failed', e); }
    this.ui.refreshItems();
  }
  quickMove(a, it) {
    const st = this.ui.G.state;
    if (this.ui.isOpen('shop') && a.c === 'inv') { this.sell(a); return; }
    if (a.c === 'inv' && this.ui.isOpen('stash')) { const j = (st.stash || []).findIndex(x => !x); if (j >= 0) this.place(a, { c: 'stash', i: j }); else this.deny(a); return; }
    if (a.c === 'stash') { const j = (st.inventory || []).findIndex(x => !x); if (j >= 0) this.place(a, { c: 'inv', i: j }); else this.deny(a); }
  }
  sell(a) {
    const it = this.get(a); if (!it) return;
    const sp = this.ui.panels.shop;
    const r = sp?.opts?.onSell ? sp.opts.onSell(a, it) : this.A.sellItem?.(a);
    if (r === false) { this.deny(a); return; }
    this.ui.sfx?.('coin');
    const s = this.ui.layers.panels.querySelector(`.slot[data-c="${a.c}"][data-i="${a.i}"]`);
    if (s) { const r2 = s.getBoundingClientRect(); this.ui.burst(r2.left + r2.width / 2, r2.top + r2.height / 2, { n: 10, colors: ['#ffcf4a', '#fff3b8', '#ffb34a'], kind: 'dot', spread: 50 }); }
    this.ui.tip.hide();
    this.ui.refreshItems();
  }
  context(s, e) {
    if (this.held) { this.cancel(); return; }
    const a = this.addr(s), it = this.get(a); if (!it) return;
    const A = this.A;
    if (a.c === 'shop') return;
    if (e.shiftKey && this.ui.isOpen('shop') && a.c !== 'equip') { this.sell(a); return; }
    let r;
    if (a.c === 'inv') {
      if (it.kind === 'gear') {
        const req = meetsReq(it, this.ui.G.state, this.ui.G.derived);
        if (!req.ok) { this.deny(a); this.ui.toast("Chewy can't use that yet!", { icon: 'lock', color: '#ff6a7a' }); return; }
        r = A.equip?.(a.i);
        if (r !== false) { const sl = equipSlotsFor(it); for (const x of sl) this.markPop({ c: 'equip', i: x }); this.ui.sfx?.('equip'); }
      } else r = A.useItem ? A.useItem(a) : A.use ? A.use(a) : undefined;
    } else if (a.c === 'equip') { r = A.unequip?.(a.i); }
    else if (a.c === 'stash') { this.quickMove(a, it); return; }
    if (r === false) this.deny(a);
    this.ui.tip.hide();
    this.ui.refreshItems();
    // keep tooltip fresh on the slot still under the cursor
    requestAnimationFrame(() => { const u = document.elementFromPoint(this.mx ?? 0, this.my ?? 0)?.closest?.('.slot[data-c]'); if (u) this.hoverSlot(u); });
  }
}

// ------------------------------------------------------------------ inventory panel
export class InventoryPanel extends Panel {
  constructor(ui) { super(ui, { name: 'inventory', title: 'Bag', jp: 'かばん', side: 'right', cls: 'p-inv', icon: 'bag' }); }
  init() {
    const b = this.body;
    b.innerHTML = `
      <div class="doll">
        <div class="doll-bg"><i class="petal p1"></i><i class="petal p2"></i><i class="petal p3"></i></div>
        <div class="doll-por">${portrait('chewy')}<div class="doll-shadow"></div></div>
        <div class="doll-name">Chewy <span class="lvtag">Lv <b>1</b></span></div>
        <button class="wswap" title="Swap weapons (X)">${glyph('swap')}<span class="kc sm">X</span></button>
      </div>
      <div class="inv-stats"></div>
      <div class="grid g10"></div>
      <div class="inv-foot">
        <div class="pill coins">${glyph('coin')}<b>0</b></div>
        <div class="inv-hint">Drag items · Right-click to equip</div>
        <button class="btn sm sort">${glyph('sort')}Sort</button>
      </div>`;
    const doll = b.querySelector('.doll');
    const POS = { weapon: [18, 22, 'tall'], weaponAlt: [509, 22, 'tall'], hat: [108, 10], collar: [108, 82], outfit: [108, 154], charm1: [427, 10], charm2: [427, 82], paws: [427, 154], boots: [267, 164] };
    this.eq = {};
    for (const k of EQUIP_SLOTS) {
      const [x, y, t] = POS[k];
      const s = makeSlot('equip', k, 'eq ' + (t || ''));
      s.style.left = x + 'px'; s.style.top = y + 'px';
      doll.appendChild(s);
      doll.insertAdjacentHTML('beforeend', `<span class="eq-l" style="left:${x}px;top:${y + (t ? 111 : 59)}px;width:${t ? 64 : 56}px">${SLOT_LABEL[k]}</span>`);
      this.eq[k] = s;
    }
    const g = b.querySelector('.grid');
    this.cells = [];
    for (let i = 0; i < 40; i++) { const s = makeSlot('inv', i); s.style.setProperty('--i', i); g.appendChild(s); this.cells.push(s); }
    this.coins = b.querySelector('.inv-foot .coins b');
    this.statsEl = b.querySelector('.inv-stats');
    this.lvEl = b.querySelector('.lvtag b');
    b.querySelector('.sort').addEventListener('click', () => this.sort());
    b.querySelector('.wswap').addEventListener('click', () => { this.G.actions?.swapWeapons?.(); replay(b.querySelector('.wswap'), 'spin', 500); this.render(); });
  }
  render() {
    const st = this.st, d = this.d, eq = st.equipment || {}, inv = st.inventory || [];
    for (const k of EQUIP_SLOTS) paintSlot(this.eq[k], eq[k], this.ui);
    for (let i = 0; i < 40; i++) paintSlot(this.cells[i], inv[i], this.ui);
    const aw = st.player?.activeWeapon ? 'weaponAlt' : 'weapon';
    this.eq.weapon.classList.toggle('active', aw === 'weapon');
    this.eq.weaponAlt.classList.toggle('active', aw === 'weaponAlt');
    setText(this.coins, fmt(st.coins || 0));
    setText(this.lvEl, String(st.player?.lvl || 1));
    const dmg = `${Math.round(d.dmgMin || 1)}–${Math.round(d.dmgMax || 3)}`;
    const html = [['swords', 'Damage', dmg], ['shield', 'Defense', Math.round(d.def || 0)], ['heart', 'Life', Math.round(d.lifeMax || 0)], ['bolt', 'Zoom', Math.round(d.zoomMax || 0)]]
      .map(([g, n, v]) => `<div class="ist">${glyph(g)}<span>${n}</span><b>${v}</b></div>`).join('');
    if (html !== this._stats) { this._stats = html; this.statsEl.innerHTML = html; }
    const shop = this.ui.isOpen('shop'), stash = this.ui.isOpen('stash');
    setText(this.body.querySelector('.inv-hint'), shop ? 'Shift+Right-click to sell' : stash ? 'Ctrl+Click to stash' : 'Drag items · Right-click to equip');
  }
  sort() {
    const A = this.G.actions || {};
    if (A.sortInventory) { A.sortInventory(); this.ui.refreshItems(); return; }
    if (!A.moveItem) return;
    const inv = this.st.inventory;
    const order = { unique: 0, set: 1, rare: 2, magic: 3, normal: 4 };
    const kindO = { gear: 0, gem: 1, gift: 2, key: 3, material: 4 };
    const want = inv.map((it, i) => ({ it, i })).filter(x => x.it).sort((a, b) =>
      (kindO[a.it.kind] ?? 5) - (kindO[b.it.kind] ?? 5) || (order[a.it.rarity] ?? 5) - (order[b.it.rarity] ?? 5) || (a.it.slot || '').localeCompare(b.it.slot || '') || (b.it.ilvl || 0) - (a.it.ilvl || 0)).map(x => x.it.uid);
    for (let target = 0; target < want.length; target++) {
      const cur = this.st.inventory.findIndex(x => x && x.uid === want[target]);
      if (cur !== target && cur >= 0) A.moveItem({ c: 'inv', i: cur }, { c: 'inv', i: target });
    }
    for (const c of this.cells) c._popNext = true, c._sig = null;
    this.ui.refreshItems();
    this.ui.sfx?.('sort');
  }
}

// ------------------------------------------------------------------ stash panel
export class StashPanel extends Panel {
  constructor(ui) { super(ui, { name: 'stash', title: 'Stash', jp: '倉庫', side: 'left', cls: 'p-stash', icon: 'chest' }); }
  init() {
    this.body.innerHTML = `<div class="stash-top"><div class="stash-note">${glyph('sakura')}Items here are safe forever — shared across every adventure.</div></div><div class="grid g10 stash-grid"></div><div class="inv-foot"><div class="inv-hint">Ctrl+Click moves items between Bag and Stash</div></div>`;
    const g = this.body.querySelector('.grid');
    this.cells = [];
    const n = (this.st.stash || []).length || 60;
    for (let i = 0; i < n; i++) { const s = makeSlot('stash', i); s.style.setProperty('--i', i); g.appendChild(s); this.cells.push(s); }
  }
  render() {
    const sa = this.st.stash || [];
    for (let i = 0; i < this.cells.length; i++) paintSlot(this.cells[i], sa[i], this.ui);
  }
}
