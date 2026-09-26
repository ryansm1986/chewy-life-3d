// Shop (Rosie's Treats): keeper bubble, Buy / Sell tabs, price tags, fly-to-bag on purchase.
import { el, esc, fmt, replay, setText, rarityColor } from './dom.js';
import { glyph, glyphURL } from './glyphs.js';
import { portraitHTML } from './portraits.js';
import { Panel } from './panel.js';
import { itemIconURL, buyPrice, sellPrice, itemName, potionIconURL, potionInfo } from './rpg.js';
import { itemTipHTML, simpleTip } from './tooltip.js';

const THANKS = ['Thank you!! ♡', 'Enjoy, Chewy!', 'Good choice~', 'Come back soon!', 'Shadow will love that!'];
const POTIONS = { heart: ['potionHeart', 'Heart Potion', 'Restores a chunk of Life.'], zoom: ['potionZoom', 'Zoom Potion', 'Restores a chunk of Zoom.'], rejuv: ['potionRejuv', 'Rejuv Potion', 'Restores Life and Zoom.'] };

export class ShopPanel extends Panel {
  constructor(ui) { super(ui, { name: 'shop', title: "Rosie's Treats", jp: 'おやつ屋', side: 'left', cls: 'p-shop', icon: 'shop' }); this.tab = 'buy'; }
  init() {
    this.body.innerHTML = `
      <div class="sh-keeper"><div class="sh-por"></div><div class="sh-bub"><span class="sh-say"></span></div></div>
      <div class="tabs sh-tabs"><button class="tab on" data-t="buy">${glyph('gift')}Buy</button><button class="tab" data-t="sell">${glyph('coin')}Sell</button></div>
      <div class="sh-grid"></div>
      <div class="inv-foot"><div class="pill coins">${glyph('coin')}<b>0</b></div><div class="inv-hint sh-hint">Click to buy</div></div>`;
    this.$ = { por: this.body.querySelector('.sh-por'), say: this.body.querySelector('.sh-say'), bub: this.body.querySelector('.sh-bub'), grid: this.body.querySelector('.sh-grid'), coins: this.body.querySelector('.inv-foot .coins b'), hint: this.body.querySelector('.sh-hint') };
    this.body.querySelector('.sh-tabs').addEventListener('click', e => { const t = e.target.closest('.tab'); if (t && t.dataset.t !== this.tab) { this.tab = t.dataset.t; this._sig = null; this.render(); replay(this.$.grid, 'swap', 400); this.ui.sfx?.('tab'); } });
    const G = this.$.grid;
    G.addEventListener('click', e => { const s = e.target.closest('.sh-item'); if (s) this.click(s); });
    G.addEventListener('contextmenu', e => { const s = e.target.closest('.sh-item'); if (s) { e.preventDefault(); this.click(s); } });
    G.addEventListener('mouseover', e => { const s = e.target.closest('.sh-item'); if (!s || s === this._hov) return; this._hov = s; this.ui.tip.show(this.tipFor(s), 'item', s); });
    G.addEventListener('mouseout', e => { const s = e.target.closest('.sh-item'); if (s && !s.contains(e.relatedTarget)) { this._hov = null; this.ui.tip.hide(s); } });
  }
  onOpen() {
    const o = this.opts;
    this.setTitle(o.name || "Rosie's Treats", o.jp || 'おやつ屋');
    this.$.por.innerHTML = portraitHTML(o.portrait || o.keeper || 'rosie');
    this.say(o.greeting || 'Welcome, Chewy! Fresh treats today~');
    const pots = (o.potions || []).map(k => (typeof k === 'string' ? { potion: k } : k));
    this.entries = [...pots, ...(o.items || o.stock || [])].map(x => (x && (x.item || x.potion) ? { ...x } : x?.kind === 'potion' ? { potion: x.key, price: x.price } : { item: x }));
    this.tab = o.tab || 'buy';
    this._sig = null;
    this.render();
  }
  itemAt(i) { return this.entries?.[i]?.item || null; }
  say(t) { this.$.say.innerHTML = esc(t).replace(/\*([^*]+)\*/g, '<span class="em">$1</span>'); replay(this.$.bub, 'talk', 500); }
  price(e) { return e.price ?? e.item?.price ?? (e.potion ? potionInfo(e.potion)?.price ?? 25 : e.item ? buyPrice(e.item) : 10); }
  render() {
    const st = this.st;
    setText(this.$.coins, fmt(st.coins || 0));
    for (const t of this.body.querySelectorAll('.sh-tabs .tab')) t.classList.toggle('on', t.dataset.t === this.tab);
    this.$.hint.textContent = this.tab === 'buy' ? 'Click to buy · Items fly into your bag' : 'Click to sell · or Shift+Right-click in your bag';
    let html = '';
    if (this.tab === 'buy') {
      const sig = 'b' + (st.coins || 0) + '|' + (this.entries || []).map(e => (e.item?.uid || e.potion) + ':' + (e.stock ?? '')).join();
      if (sig === this._sig) return; this._sig = sig;
      html = (this.entries || []).map((e, i) => {
        const p = this.price(e), afford = (st.coins || 0) >= p;
        const icon = e.potion ? potionIconURL(e.potion) : itemIconURL(e.item);
        const r = e.item?.rarity || 'normal';
        return `<div class="sh-item r-${r} ${afford ? '' : 'poor'}" data-i="${i}" style="--i:${i};--rc:${rarityColor(r)}"><div class="shi-art"><img src="${icon}" alt="" draggable="false">${e.stock != null ? `<b class="qty">×${e.stock}</b>` : ''}</div><div class="tag">${glyph('coin')}${fmt(p)}</div></div>`;
      }).join('') || `<div class="bd-empty">${glyph('sakura')}Sold out! Come back tomorrow~</div>`;
    } else {
      const inv = st.inventory || [];
      const sig = 's' + inv.map(x => x?.uid || '').join();
      if (sig === this._sig) return; this._sig = sig;
      html = inv.map((it, i) => it ? `<div class="sh-item sell r-${it.rarity || 'normal'}" data-inv="${i}" style="--i:${i};--rc:${rarityColor(it.rarity)}"><div class="shi-art"><img src="${itemIconURL(it)}" alt="" draggable="false">${it.qty > 1 ? `<b class="qty">${it.qty}</b>` : ''}</div><div class="tag sellp">${glyph('coin')}${fmt(sellPrice(it))}</div></div>` : '').join('') || `<div class="bd-empty">${glyph('bag')}Your bag is empty!</div>`;
    }
    this.$.grid.innerHTML = html;
  }
  tipFor(s) {
    const st = this.st;
    if (s.dataset.inv != null) {
      const it = st.inventory?.[+s.dataset.inv]; if (!it) return '';
      return itemTipHTML(it, { state: st, derived: this.d, price: { label: 'Sells for', value: fmt(sellPrice(it)) }, hints: ['<b>Click</b> sell'] });
    }
    const e = this.entries?.[+s.dataset.i]; if (!e) return '';
    const p = this.price(e), afford = (st.coins || 0) >= p;
    if (e.potion) { const P = POTIONS[e.potion] || [], I = potionInfo(e.potion) || {}; return simpleTip(e.name || I.name || P[1] || 'Potion', `${esc(e.desc || I.desc || P[2] || '')}<div class="tt-dim">You have ${st.potions?.[e.potion] || 0}</div><div class="tt-price ${afford ? '' : 'bad'}">Price: ${glyph('coin')}<b>${fmt(p)}</b></div><div class="tt-hints"><span><b>Click</b> buy</span></div>`); }
    return itemTipHTML(e.item, { state: st, derived: this.d, compare: x => this.ui.drag.equippedFor(x), price: { label: 'Price', value: fmt(p), afford }, hints: [afford ? '<b>Click</b> buy' : "Can't afford yet"] });
  }
  click(s) {
    this.ui.tip.hide(); this._hov = null;
    if (s.dataset.inv != null) { this.ui.drag.sell({ c: 'inv', i: +s.dataset.inv }); this.say(['Ooh, thank you!', 'I can use this!', 'Pleasure doing business~'][Math.floor(Math.random() * 3)]); return; }
    const i = +s.dataset.i, e = this.entries?.[i]; if (!e) return;
    const st = this.st, p = this.price(e), A = this.G.actions || {};
    if ((st.coins || 0) < p) { replay(s, 'deny', 450); this.say("Hmm, you're a few coins short~"); this.ui.sfx?.('deny'); return; }
    let ok;
    if (this.opts.onBuy) ok = this.opts.onBuy(e.potion ? { kind: 'potion', key: e.potion } : e.item, p, e);
    else if (e.potion) {
      if (A.buyItem) ok = A.buyItem({ kind: 'potion', key: e.potion }, p);
      else if (A.spendCoins?.(p)) { st.potions[e.potion] = (st.potions[e.potion] || 0) + 1; this.G.events?.emit?.('potions:changed'); ok = true; }
      else ok = false;
    } else ok = A.buyItem ? A.buyItem(e.item, p) : false;
    if (ok === false || ok == null) { replay(s, 'deny', 450); this.say(e.potion ? 'Your belt is full, silly pup!' : 'Oh no — your bag looks full!'); return; }
    const r = s.getBoundingClientRect();
    const icon = s.querySelector('img')?.src;
    this.ui.flyToBag(icon, { x: r.left + r.width / 2, y: r.top + r.height / 2 }, e.item);
    this.ui.burst(r.left + r.width / 2, r.top + r.height / 2, { n: 10, spread: 50, colors: ['#ffcf4a', '#fff3b8', '#ff8fb0'] });
    this.ui.sfx?.('buy');
    this.say(THANKS[Math.floor(Math.random() * THANKS.length)]);
    if (e.stock != null) { e.stock--; if (e.stock <= 0) this.entries.splice(i, 1); }
    else if (e.item && e.item.kind === 'gear' && !e.infinite) this.entries.splice(i, 1);
    this._sig = null;
    this.ui.refreshItems();
    this.render();
  }
}
