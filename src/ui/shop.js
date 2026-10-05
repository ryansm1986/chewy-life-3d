// Shop (Rosie's Treats, Usagi's Seed Stall...): keeper bubble, Buy / Sell tabs, price tags, fly-to-bag on purchase.
// opts: { name, jp, keeper, portrait, greeting, stock|items (Items), potions: [key], pantry: [{ id, price }] (seeds and
// other pantry goods, life/pantry.js; Shift+click buys 5), goods: [{ id, name, jp?, desc, icon (URL), price, locked?, once?,
// onBuy() -> ok }] (one-off wares such as Kero's rods), onBuy(item, price, entry), onBuyPantry(id, price, n),
// sellKinds: ['fish', ...] (the Sell tab lists those pantry goods first, at the buyer's prices; Shift+click sells them all),
// buyer: 'kero' | 'rosie' | 'usagi' (life/pantry.js sellPrice), noBagSell (the Sell tab shows only those goods),
// furniture: [{ id, price, stock (null = no limit), recipe? (a workbench recipe scroll: id 'recipe:<recipe>') }] (Tanu's
// Trinkets, home/sources.js: furniture thumbnails, ×stock badges; onBuyFurniture(entry) -> { ok, first, left, say }
// spends the coins and puts the piece in your storage), sellFurniture (the Sell tab lists your furniture storage:
// furnitureSellPrice(id), onSellFurniture(id) -> coins paid), sellThanks, emptySell }
import { heroText } from '../rpg/classes.js';
import { el, esc, fmt, replay, setText, rarityColor } from './dom.js';
import { glyph, glyphURL } from './glyphs.js';
import { portraitHTML } from './portraits.js';
import { Panel } from './panel.js';
import { itemIconURL, buyPrice, sellPrice, itemName, potionIconURL, potionInfo } from './rpg.js';
import { itemTipHTML, simpleTip } from './tooltip.js';
import { pantryIcon } from '../life/pantryIcons.js';
import { pantryTipHTML } from './pantry.js';
import { PANTRY, pantryList, sellPrice as pantrySell } from '../life/pantry.js';
import { itemDef, storageList, SETS as FSETS, SURFACES } from '../home/furniture.js';
import { surfaceSwatch } from '../home/surfaces.js';
import { RECIPES, ingredientsOf } from '../home/recipes.js';
import { furnitureThumb, furnitureTipHTML } from './decorate.js';

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
    this.body.querySelector('.sh-tabs').addEventListener('click', e => { const t = e.target.closest('.tab'); if (t && t.dataset.t !== this.tab) { this.ui.tip.hide(); this._hov = null; this.tab = t.dataset.t; this._sig = null; this.render(); replay(this.$.grid, 'swap', 400); this.ui.sfx?.('tab'); } });
    const G = this.$.grid;
    G.addEventListener('click', e => { const s = e.target.closest('.sh-item'); if (s) this.click(s, e); });
    G.addEventListener('contextmenu', e => { const s = e.target.closest('.sh-item'); if (s) { e.preventDefault(); this.click(s, e); } });
    G.addEventListener('mouseover', e => { const s = e.target.closest('.sh-item'); if (!s || s === this._hov) return; this._hov = s; this.ui.tip.show(this.tipFor(s), 'item', s); });
    G.addEventListener('mouseout', e => { const s = e.target.closest('.sh-item'); if (s && !s.contains(e.relatedTarget)) { this._hov = null; this.ui.tip.hide(s); } });
  }
  onOpen() {
    const o = this.opts;
    this.setTitle(o.name || "Rosie's Treats", o.jp || 'おやつ屋');
    this.$.por.innerHTML = portraitHTML(o.portrait || o.keeper || 'rosie');
    this.say(o.greeting || 'Welcome, Chewy! Fresh treats today~');
    const pots = (o.potions || []).map(k => (typeof k === 'string' ? { potion: k } : k));
    const pan = (o.pantry || []).map(p => ({ pantry: p.id, price: p.price })), goods = (o.goods || []).map(g => ({ goods: g, price: g.price }));
    const furn = (o.furniture || []).map(f => ({ furn: f.id, piece: f.recipe ? RECIPES[f.recipe]?.out : f.id, recipe: f.recipe || null, price: f.price, stock: f.stock ?? null, always: !!f.always }));
    this.entries = [...furn, ...goods, ...pots, ...pan, ...(o.items || o.stock || []).map(x => (x && (x.item || x.potion) ? { ...x } : x?.kind === 'potion' ? { potion: x.key, price: x.price } : { item: x }))];
    this.queue = [];
    this.tab = o.tab || 'buy';
    this._sig = null;
    this.render();
  }
  itemAt(i) { return this.entries?.[i]?.item || null; }
  say(t) { t = heroText(t, this.ui.G?.state); this.$.say.innerHTML = esc(t).replace(/\*([^*]+)\*/g, '<span class="em">$1</span>'); replay(this.$.bub, 'talk', 500); }
  price(e) { return e.price ?? e.item?.price ?? (e.potion ? potionInfo(e.potion)?.price ?? 25 : e.item ? buyPrice(e.item) : 10); }
  render() {
    const st = this.st;
    setText(this.$.coins, fmt(st.coins || 0));
    for (const t of this.body.querySelectorAll('.sh-tabs .tab')) t.classList.toggle('on', t.dataset.t === this.tab);
    const sk = this.opts.sellKinds;
    const sf = this.opts.sellFurniture;
    this.$.hint.textContent = this.tab === 'buy' ? (sf ? 'Click to buy · Furniture goes to your storage' : 'Click to buy · Items fly into your bag') : sf ? 'Click to sell one · Tanu pays half the price' : sk ? 'Click to sell one · Shift+Click sells them all' : 'Click to sell · or Shift+Right-click in your bag';
    let html = '';
    if (this.tab === 'buy') {
      const sig = 'b' + (st.coins || 0) + '|' + (this.entries || []).map(e => (e.item?.uid || e.potion || e.pantry || e.goods?.id || e.furn) + ':' + (e.stock ?? '') + (e.pantry ? ':' + (st.pantry?.[e.pantry] || 0) : '')).join();
      if (sig === this._sig) return; this._sig = sig;
      this.queue = [];
      html = (this.entries || []).map((e, i) => {
        const p = this.price(e), afford = (st.coins || 0) >= p;
        if (e.furn) return this.furnCell(e, i, afford, p);
        const icon = e.goods ? e.goods.icon : e.pantry ? pantryIcon(e.pantry) : e.potion ? potionIconURL(e.potion) : itemIconURL(e.item);
        const r = e.item?.rarity || 'normal', have = e.pantry ? st.pantry?.[e.pantry] || 0 : 0;
        return `<div class="sh-item r-${r} ${afford && !e.goods?.locked ? '' : 'poor'}${e.pantry ? ' pgood' : ''}${e.goods ? ' pgood tool' + (e.goods.locked ? ' locked' : '') : ''}" data-i="${i}" style="--i:${i};--rc:${rarityColor(r)}"><div class="shi-art"><img src="${icon}" alt="" draggable="false">${e.stock != null ? `<b class="qty">×${e.stock}</b>` : have ? `<b class="qty have">${have}</b>` : ''}${e.goods?.locked ? `<b class="lk">${glyph('lock')}</b>` : ''}</div><div class="tag">${glyph('coin')}${fmt(p)}</div></div>`;
      }).join('') || `<div class="bd-empty">${glyph('sakura')}Sold out! Come back tomorrow~</div>`;
    } else {
      if (sf) { this.renderSellFurniture(); return; }
      const inv = this.opts.noBagSell ? [] : st.inventory || [], goods = sk ? pantryList(st).filter(e => sk.includes(e.def.kind)) : [];
      const sig = 's' + goods.map(e => e.id + ':' + e.n).join() + '|' + inv.map(x => x?.uid || '').join();
      if (sig === this._sig) return; this._sig = sig;
      html = goods.map((e, i) => `<div class="sh-item sell pgood" data-pid="${e.id}" style="--i:${i}"><div class="shi-art"><img src="${pantryIcon(e.id)}" alt="" draggable="false"><b class="qty">${e.n}</b></div><div class="tag sellp">${glyph('coin')}${fmt(pantrySell(e.id, this.opts.buyer))}</div></div>`).join('')
        + inv.map((it, i) => it ? `<div class="sh-item sell r-${it.rarity || 'normal'}" data-inv="${i}" style="--i:${i};--rc:${rarityColor(it.rarity)}"><div class="shi-art"><img src="${itemIconURL(it)}" alt="" draggable="false">${it.qty > 1 ? `<b class="qty">${it.qty}</b>` : ''}</div><div class="tag sellp">${glyph('coin')}${fmt(sellPrice(it))}</div></div>` : '').join('');
      html ||= `<div class="bd-empty">${glyph('bag')}${sk ? `No ${sk.map(k => (k === 'fish' ? 'fish' : k + 's')).join(' or ')} to sell yet!` : 'Your bag is empty!'}</div>`;
    }
    this.$.grid.innerHTML = html;
    if (this.queue?.length) this.pump();
  }
  // ---------------------------------------------------------------- furniture (Tanu's Trinkets)
  furnIcon(id, now = false) { return SURFACES[id] ? surfaceSwatch(id) : furnitureThumb(this.G, id, now); }
  /** a thumbnail <img> (rendered a few per frame when it isn't cached yet) */
  furnImg(id) { const u = this.furnIcon(id); if (!u) this.queue.push(id); return `<img src="${u || glyphURL('home')}" alt="" draggable="false" data-th="${id}" class="${u ? '' : 'fu-wait'}${SURFACES[id] ? ' sh-sw' : ''}">`; }
  furnCell(e, i, afford, p) {
    const d = itemDef(e.piece), set = FSETS[d?.set];
    return `<div class="sh-item furn${e.recipe ? ' scroll' : ''}${e.always ? ' always' : ''} ${afford ? '' : 'poor'}" data-i="${i}" style="--i:${i};--sc:${set?.color || '#ffb07a'}"><div class="shi-art">${this.furnImg(e.piece)}${e.stock != null ? `<b class="qty">×${e.stock}</b>` : ''}${e.recipe ? `<b class="sh-scr">${glyph('scroll')}</b>` : ''}</div><div class="tag">${glyph('coin')}${fmt(p)}</div></div>`;
  }
  renderSellFurniture() {
    const st = this.st, list = storageList(st).filter(e => this.sellPriceOf(e.id) > 0);
    const sig = 'sf' + list.map(e => e.id + ':' + e.n).join();
    if (sig === this._sig) return; this._sig = sig;
    this.queue = [];
    this.$.grid.innerHTML = list.map((e, i) => `<div class="sh-item sell furn" data-fid="${e.id}" style="--i:${i};--sc:${FSETS[e.def.set]?.color || '#ffb07a'}"><div class="shi-art">${this.furnImg(e.id)}<b class="qty">${e.n}</b></div><div class="tag sellp">${glyph('coin')}${fmt(this.sellPriceOf(e.id))}</div></div>`).join('')
      || `<div class="bd-empty">${glyph('home')}${esc(this.opts.emptySell || 'No furniture in storage to sell!')}</div>`;
    if (this.queue.length) this.pump();
  }
  sellPriceOf(id) { const d = itemDef(id); if (!d || d.free) return 0; return this.opts.furnitureSellPrice ? this.opts.furnitureSellPrice(id) : Math.max(1, Math.floor((d.price || 0) / 2)); }
  pump() {
    if (this._pumping) return; this._pumping = true;
    const step = () => {
      const t0 = performance.now();
      while (this.queue.length && performance.now() - t0 < 10) {
        const id = this.queue.shift(), u = this.furnIcon(id, true);
        if (u) for (const img of this.$.grid.querySelectorAll(`img[data-th="${id}"]`)) { img.src = u; img.classList.remove('fu-wait'); }
      }
      if (this.queue.length && this.isOpen) requestAnimationFrame(step); else this._pumping = false;
    };
    requestAnimationFrame(step);
  }
  furnTip(id, { price, label = 'Price', afford = true, left = null, hints = [], recipe = null }) {
    const st = this.st;
    let head = '';
    if (recipe) {
      const d = itemDef(id), ing = ingredientsOf(recipe).map(x => `${x.kind === 'mat' ? glyph(x.k) : ''}${esc(x.kind === 'mat' ? x.k[0].toUpperCase() + x.k.slice(1) : PANTRY[x.k]?.name || x.k)} ×${x.n}`).join(' · ');
      head = `<div class="tt-l tt-scroll">${glyph('scroll')}<b>Recipe scroll</b> — make the ${esc(d?.name || id)} at a workbench</div><div class="tt-l tt-dim tt-needs">Needs: ${ing}</div>`;
    }
    const tail = `${left != null && left !== Infinity ? `<div class="tt-l tt-dim">${left} left today</div>` : ''}<div class="tt-price ${afford ? '' : 'bad'}">${esc(label)}: ${glyph('coin')}<b>${fmt(price)}</b></div><div class="tt-hints">${hints.map(h => `<span>${h}</span>`).join('')}</div>`;
    return furnitureTipHTML(id, recipe ? null : st.furniture?.[id] || 0).replace(/<\/div>\s*$/, head + tail + '</div>');
  }
  tipFor(s) {
    const st = this.st;
    if (s.dataset.fid) { const id = s.dataset.fid, n = st.furniture?.[id] || 0; return this.furnTip(id, { price: this.sellPriceOf(id), label: 'Tanu pays', hints: [n ? '<b>Click</b> sell one' : 'None left'] }); }
    if (s.dataset.pid) {
      const id = s.dataset.pid, n = st.pantry?.[id] || 0, p = pantrySell(id, this.opts.buyer), who = { kero: 'Kero', usagi: 'Usagi', rosie: 'Rosie' }[this.opts.buyer] || 'They';
      return pantryTipHTML(id, st, { price: { label: `${who} pays`, value: p }, hints: ['<b>Click</b> sell one', n > 1 ? `<b>Shift+Click</b> sell all ${n} (${fmt(p * n)})` : ''].filter(Boolean) });
    }
    if (s.dataset.inv != null) {
      const it = st.inventory?.[+s.dataset.inv]; if (!it) return '';
      return itemTipHTML(it, { state: st, derived: this.d, price: { label: 'Sells for', value: fmt(sellPrice(it)) }, hints: ['<b>Click</b> sell'] });
    }
    const e = this.entries?.[+s.dataset.i]; if (!e) return '';
    const p = this.price(e), afford = (st.coins || 0) >= p;
    if (e.furn) return this.furnTip(e.piece, { price: p, afford, left: e.stock, recipe: e.recipe, hints: [afford ? `<b>Click</b> buy${e.recipe ? ' and learn it' : ''}` : "Can't afford yet"] });
    if (e.pantry) return pantryTipHTML(e.pantry, st, { price: { label: 'Price', value: p, afford }, hints: afford ? ['<b>Click</b> buy', '<b>Shift+Click</b> buy 5'] : ["Can't afford yet"] });
    if (e.goods) {
      const g = e.goods;
      return `<div class="tt-item tt-pantry" style="--rc:#ffd84a"><div class="tt-name">${esc(g.name)}</div><div class="tt-kind"><span>Tool</span><span class="jp">${esc(g.jp || '')}</span></div><div class="tt-d">${esc(g.desc || '')}</div>${g.locked ? `<div class="tt-req bad">${esc(g.locked)}</div>` : ''}<div class="tt-price ${afford ? '' : 'bad'}">Price: ${glyph('coin')}<b>${fmt(p)}</b></div><div class="tt-hints"><span>${g.locked ? 'Not yet' : afford ? '<b>Click</b> buy' : "Can't afford yet"}</span></div></div>`;
    }
    if (e.potion) { const P = POTIONS[e.potion] || [], I = potionInfo(e.potion) || {}; return simpleTip(e.name || I.name || P[1] || 'Potion', `${esc(e.desc || I.desc || P[2] || '')}<div class="tt-dim">You have ${st.potions?.[e.potion] || 0}</div><div class="tt-price ${afford ? '' : 'bad'}">Price: ${glyph('coin')}<b>${fmt(p)}</b></div><div class="tt-hints"><span><b>Click</b> buy</span></div>`); }
    return itemTipHTML(e.item, { state: st, derived: this.d, compare: x => this.ui.drag.equippedFor(x), price: { label: 'Price', value: fmt(p), afford }, hints: [afford ? '<b>Click</b> buy' : "Can't afford yet"] });
  }
  click(s, ev) {
    this.ui.tip.hide(); this._hov = null;
    if (s.dataset.fid) { // selling a piece from the furniture storage
      const id = s.dataset.fid, A = this.G.actions || {}, v = this.opts.onSellFurniture ? this.opts.onSellFurniture(id) : (A.spendFurniture?.({ [id]: 1 }, { src: 'sell' }) ? (A.addCoins?.(this.sellPriceOf(id)), this.sellPriceOf(id)) : 0);
      if (!v) { replay(s, 'deny', 450); this.ui.sfx?.('deny'); return; }
      const r = s.getBoundingClientRect(); this.ui.burst(r.left + r.width / 2, r.top + r.height / 2, { n: 10, colors: ['#ffcf4a', '#fff3b8', '#ffb34a'], kind: 'dot', spread: 50 });
      this.ui.sfx?.('coin'); const T = this.opts.sellThanks || this.opts.thanks; this.say(T ? T[Math.floor(Math.random() * T.length)] : 'Pleasure doing business~');
      this._sig = null; this.render(); return;
    }
    if (s.dataset.pid) { // selling pantry goods at this keeper's price
      const id = s.dataset.pid, n = ev?.shiftKey ? this.st.pantry?.[id] || 0 : 1, v = this.G.actions?.sellPantry?.(id, n, this.opts.buyer) || 0;
      if (!v) { replay(s, 'deny', 450); this.ui.sfx?.('deny'); return; }
      const r = s.getBoundingClientRect(); this.ui.burst(r.left + r.width / 2, r.top + r.height / 2, { n: 10, colors: ['#ffcf4a', '#fff3b8', '#ffb34a'], kind: 'dot', spread: 50 });
      this.ui.sfx?.('coin'); this.say(this.opts.thanks ? this.opts.thanks[Math.floor(Math.random() * this.opts.thanks.length)] : 'Pleasure doing business~');
      this._sig = null; this.render(); return;
    }
    if (s.dataset.inv != null) { this.ui.drag.sell({ c: 'inv', i: +s.dataset.inv }); this.say(['Ooh, thank you!', 'I can use this!', 'Pleasure doing business~'][Math.floor(Math.random() * 3)]); return; }
    const i = +s.dataset.i, e = this.entries?.[i]; if (!e) return;
    const st = this.st, p = this.price(e), A = this.G.actions || {};
    if (e.furn) { this.buyFurniture(s, e, i); return; }
    if (e.goods?.locked) { replay(s, 'deny', 450); this.say(e.goods.locked); this.ui.sfx?.('deny'); return; }
    if ((st.coins || 0) < p) { replay(s, 'deny', 450); this.say("Hmm, you're a few coins short~"); this.ui.sfx?.('deny'); return; }
    if (e.goods) {
      if (!A.spendCoins?.(p)) { replay(s, 'deny', 450); return; }
      if (e.goods.onBuy?.() === false) { A.addCoins?.(p); replay(s, 'deny', 450); return; }
      const r = s.getBoundingClientRect(); this.ui.burst(r.left + r.width / 2, r.top + r.height / 2, { n: 14, spread: 60, colors: ['#ffcf4a', '#fff3b8', '#8fd0ff'] });
      this.ui.sfx?.('buy'); this.say(this.opts.thanks ? this.opts.thanks[Math.floor(Math.random() * this.opts.thanks.length)] : THANKS[0]);
      if (e.goods.once) this.entries.splice(i, 1);
      this._sig = null; this.render(); return;
    }
    if (e.pantry) { // seeds & co: straight into the pantry (Shift: five at once, as many as you can afford)
      const n = ev?.shiftKey ? Math.max(1, Math.min(5, Math.floor((st.coins || 0) / p))) : 1;
      const ok2 = this.opts.onBuyPantry ? this.opts.onBuyPantry(e.pantry, p, n) : A.buyPantry?.(e.pantry, p, n);
      if (!ok2) { replay(s, 'deny', 450); this.ui.sfx?.('deny'); return; }
      const r = s.getBoundingClientRect();
      this.ui.flyToBag(s.querySelector('img')?.src, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
      this.ui.burst(r.left + r.width / 2, r.top + r.height / 2, { n: 10, spread: 50, colors: ['#ffcf4a', '#fff3b8', '#8fe0c0'] });
      this.ui.sfx?.('buy'); this.say(this.opts.thanks ? this.opts.thanks[Math.floor(Math.random() * this.opts.thanks.length)] : THANKS[Math.floor(Math.random() * THANKS.length)]);
      this._sig = null; this.render(); this.ui.panels.inventory.refresh();
      return;
    }
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
  buyFurniture(s, e, i) {
    const st = this.st, A = this.G.actions || {}, p = this.price(e);
    const r = this.opts.onBuyFurniture ? this.opts.onBuyFurniture(e)
      : (st.coins || 0) >= p && A.spendCoins?.(p) ? { ok: true, first: !st.furnitureFound?.[e.furn], left: e.stock == null ? null : e.stock - 1, done: A.addFurniture?.(e.furn, 1, { src: 'shop' }) } : { ok: false, say: "Hmm, you're a few coins short~" };
    if (!r?.ok) { replay(s, 'deny', 450); this.ui.sfx?.('deny'); if (r?.say) this.say(r.say); if (r?.gone) { this.entries.splice(i, 1); this._sig = null; this.render(); } return; }
    const rc = s.getBoundingClientRect(), icon = s.querySelector('img')?.src, at = { x: rc.left + rc.width / 2, y: rc.top + rc.height / 2 };
    this.ui.flyToBag(icon, at);
    this.ui.burst(at.x, at.y, { n: 12, spread: 56, colors: ['#ffcf4a', '#fff3b8', '#ffb07a', '#8fe0c0'] });
    this.ui.sfx?.('buy');
    if (!e.recipe) { const d = itemDef(e.furn); this.ui.toast(`${esc(d.name)}${r.first ? ' <b class="t-new">New!</b>' : ''}`, { iconURL: icon, html: true, color: FSETS[d.set]?.color || '#ffb07a', sub: 'Sent to your storage ♡' }); }
    const T = this.opts.thanks || THANKS;
    this.say(r.say || T[Math.floor(Math.random() * T.length)]);
    if (e.stock != null) { e.stock = r.left ?? e.stock - 1; if (e.stock <= 0) this.entries.splice(i, 1); }
    this._sig = null; this.render();
    this.ui.panels.inventory?.refresh?.();
  }
}
