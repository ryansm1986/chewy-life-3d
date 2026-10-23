// Cursor-following tooltip + item/skill tooltip builders.
import { el, esc, rarityColor, cap, fmt } from './dom.js';
import { glyph } from './glyphs.js';
import { itemName, baseName, meetsReq, rpgItemTooltip, equipSlotsFor } from './rpg.js';
import { padWording } from './padGlyphs.js';
import { Actions } from '../core/actions.js';
import { itemPower } from '../rpg/power.js';
import { itemDamage, itemKindName, statText, SETS, RARITY } from '../rpg/items.js';
import { CLASSES } from '../rpg/classes.js';

// Item tooltips come simple (Power, a better / worse verdict, the bonuses in plain words: docs/STATS.md §1) unless
// details are on: Settings › Item details (full), Shift held, or L3 on the pad (sticks until pressed again).
export const TIP = { full: false, held: false, sticky: false };
export const tipDetail = () => TIP.full || TIP.held || TIP.sticky;

export class Tooltip {
  constructor(layer) {
    this.wrap = el('div', 'tt-wrap');
    this.box = el('div', 'tt');
    this.wrap.appendChild(this.box);
    layer.appendChild(this.wrap);
    this.on = false; this.x = 0; this.y = 0; this.w = 0; this.h = 0; this.owner = null;
    addEventListener('mousemove', e => { this.x = this._px = e.clientX; this.y = this._py = e.clientY; if (this.on) this.place(); }, { passive: true }); // (_px / _py: where the real pointer last was)
    // Shift held: the item tooltip shows its details (TIP)
    const held = v => { if (TIP.held !== v) { TIP.held = v; this.rerender(); } };
    addEventListener('keydown', e => { if (e.key === 'Shift') held(true); });
    addEventListener('keyup', e => { if (e.key === 'Shift') held(false); });
    addEventListener('blur', () => held(false));
  }
  /** gen: the tooltip's builder, so it can be built again (details on / off) */
  show(html, cls = '', owner = null, gen = null) {
    if (this.muted) return; // (a background panel build or render: ui/prewarm.js)
    if (!html) return this.hide();
    // (while the pad plays, a hidden pointer resting on a panel (the Deck's trackpad) brings up no hover tooltip as the
    // panels change under it; the focus's own come from padNav's untrusted events, and a pointer really moving shows its
    // own as before: CT-11)
    const ev = typeof window !== 'undefined' ? window.event : null;
    if (Actions.device === 'pad' && ev?.isTrusted && /^(mouse|pointer)(over|enter|move)$/.test(ev.type) && ev.clientX === this._px && ev.clientY === this._py) return; // (the same spot as its last move: it didn't move)
    html = padWording(html); // (while the pad plays: its buttons instead of the mouse's, ui/padGlyphs.js)
    this.owner = owner; this.gen = gen;
    this.box.className = 'tt ' + cls;
    this.box.innerHTML = html;
    const r = this.box.getBoundingClientRect();
    this.w = r.width; this.h = r.height;
    if (!this.on) { this.on = true; this.wrap.classList.remove('show'); void this.wrap.offsetWidth; }
    this.wrap.classList.add('show');
    this.place();
  }
  refresh(html) { if (this.on) this.show(html, this.box.className.replace(/^tt\s*/, ''), this.owner, this.gen); }
  /** build the showing tooltip again (its builder's now) */
  rerender() { if (this.on && this.gen) { const g = this.gen, h = g(); if (h) this.show(h, this.box.className.replace(/^tt\s*/, ''), this.owner, g); } }
  /** L3 on the pad: details on / off for every item tooltip until pressed again → on */
  toggleDetail() { TIP.sticky = !TIP.sticky; this.rerender(); return TIP.sticky; }
  place() {
    const pad = 10, off = 20;
    let x = this.x + off, y = this.y - this.h - 22;
    if (x + this.w > innerWidth - pad) x = this.x - this.w - off;
    if (x < pad) x = pad;
    if (y < pad) y = Math.min(this.y + off + 6, innerHeight - this.h - pad);
    this.wrap.style.transform = `translate3d(${x | 0}px,${y | 0}px,0)`;
  }
  hide(owner) {
    // muted: the menu prewarm builds and renders closed panels in the background while a menu is open, and their
    // setup calls hide() — which used to close the tooltip the player was reading (ui/prewarm.js run)
    if (this.muted) return;
    if (owner && this.owner && owner !== this.owner) return;
    if (!this.on) return;
    this.on = false; this.owner = null; this.gen = null;
    this.wrap.classList.remove('show');
  }
  // Bind hover tooltip to an element. fn() returns html (or null).
  bind(target, fn, cls = '') {
    target.addEventListener('mouseenter', () => { const h = fn(target); if (h) this.show(h, cls, target, () => fn(target)); });
    target.addEventListener('mouseleave', () => this.hide(target));
    return target;
  }
}

// ------------------------------------------------------------------ item tooltip
const STAT_NAMES = {
  str: 'Strength', dex: 'Dexterity', vit: 'Vitality', ene: 'Energy', lifeMax: 'Life', zoomMax: 'Zoom', lifeRegen: 'Life back a second', zoomRegen: '% Zoom refill',
  dmgMin: 'Weakest hit', dmgMax: 'Strongest hit', dmgPct: '% Harder hits', aspd: 'Hits a second', atkSpeed: '% Attack speed', castSpeed: '% Skill speed', moveSpeed: '% Run speed',
  crit: '% Big hit chance', critDmg: '% Big hit damage', def: 'Defense', block: '% Block', resFire: 'Fire guard', resFrost: 'Frost guard', resZap: 'Zap guard', resStink: 'Stink guard',
  lifeSteal: '% Heal on hit', zoomSteal: '% Zoom on hit', fireDmg: 'Fire damage', frostDmg: 'Frost damage', zapDmg: 'Zap damage', stinkDmg: 'Stink damage', mf: '% Treasure luck', gf: '% More coins',
  thorns: 'Prickly', allSkills: 'Every skill', xpBonus: '% XP', pierce: 'Fly-through', cdr: '% Sooner skills', lifeOnKill: 'Life per yokai beaten', shadowDmg: '% Shadow bites', shadowLife: '% Shadow life',
};
export const statName = k => STAT_NAMES[k] || k;

function statSums(item) {
  const m = {};
  if (!item) return m;
  if (item.dmg) m.__dmg = (item.dmg[0] + item.dmg[1]) / 2;
  if (item.def) m.def = (m.def || 0) + item.def;
  if (item.aspd) m.__aspd = item.aspd;
  for (const a of item.affixes || []) {
    const v = Array.isArray(a.value) ? (a.value[0] + a.value[1]) / 2 : +a.value || 0;
    m[a.stat] = (m[a.stat] || 0) + v;
  }
  return m;
}
function compareLines(item, other) {
  const a = statSums(item), b = statSums(other);
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out = [];
  for (const k of keys) {
    const d = (a[k] || 0) - (b[k] || 0);
    if (Math.abs(d) < 0.01) continue;
    const name = k === '__dmg' ? 'Avg Damage' : k === '__aspd' ? 'Attacks/s' : statName(k);
    const v = Math.abs(d) < 10 && d % 1 ? Math.abs(d).toFixed(1) : Math.round(Math.abs(d));
    out.push(`<div class="tt-cmp ${d > 0 ? 'up' : 'down'}"><b>${d > 0 ? '▲ +' : '▼ −'}${v}</b> ${esc(name)}</div>`);
  }
  return out;
}

// ------------------------------------------------------------------ Power (docs/STATS.md §1)
const sgnN = n => (n > 0 ? '+' : n < 0 ? '−' : '') + fmt(Math.abs(n));
/** the Power box: what the piece adds, better / worse than what's on now, and what stops the hero wearing it */
export function powerBox(item, ctx = {}) {
  const pw = ctx.state ? itemPower(item, ctx.state) : null;
  if (!pw) return '';
  const C = CLASSES[pw.hero], nm = esc(C?.name || 'another hero');
  if (pw.verdict === 'none') return `<div class="tt-pow v-none"><div class="tt-vd"><b>${nm}'s weapon</b></div></div>`;
  const v = pw.verdict, who = pw.other ? ` for ${nm}` : '';
  const vd = v === 'better' ? `<b>▲ Better${who}!</b><span>${sgnN(pw.delta)}</span>`
    : v === 'worse' ? `<b>▼ Not as good${who}</b><span>${sgnN(pw.delta)}</span>`
    : v === 'same' ? `<b>= About the same${who}</b>`
    : v === 'empty' ? `<b>✦ Nothing on there${who}: wear it!</b>`
    : `<b>✓ Wearing it</b>`;
  const vs = pw.vs && v !== 'worn' && v !== 'empty' ? `<div class="tt-vs">vs. ${pw.other ? `${nm}'s` : 'your'} <span style="color:${rarityColor(pw.vs.rarity)}">${esc(itemName(pw.vs))}</span></div>` : '';
  const lock = pw.locked ? `<div class="tt-lock">${glyph('lock')}<span>${esc(pw.locked)}</span></div>` : '';
  return `<div class="tt-pow v-${v}${pw.other ? ' other' : ''}"><div class="tt-pw">${glyph('bolt')}<span>Power</span><b>${sgnN(pw.power)}</b></div><div class="tt-vd">${vd}</div>${vs}${lock}</div>`;
}
const speedWord = a => (a >= 1.3 ? 'Very fast' : a >= 1.2 ? 'Fast' : a >= 1.05 ? 'Normal speed' : a >= 0.97 ? 'Slow' : 'Very slow');
const AFF_COL = { unique: '#ffb86a', set: '#7ef09a' };
/** a piece of gear, simply: Power, its damage or defense, its bonuses in plain words */
function simpleGearTip(item, ctx) {
  const col = rarityColor(item.rarity), R = RARITY[item.rarity];
  const sub = `${item.rarity && item.rarity !== 'normal' ? `${esc(R?.name || cap(item.rarity))} ` : ''}${esc(itemKindName(item))}`;
  let body = powerBox(item, ctx);
  if (item.dmg) { const d = itemDamage(item); body += `<div class="tt-bs">${glyph('swords')}<span>Damage</span><b>${d[0]}–${d[1]}</b><i>${speedWord(item.aspd || 1)}</i></div>`; }
  if (item.def) { let ed = 0; for (const a of item.affixes || []) if (a.stat === 'def') ed += a.value; body += `<div class="tt-bs">${glyph('shield')}<span>Defense</span><b>${item.def + ed}</b></div>`; }
  const affs = item.affixes || [];
  if (affs.length) body += `<div class="tt-affs">${affs.map(a => `<div class="tt-aff" style="--c:${a.gem ? '#ff9ad0' : AFF_COL[item.rarity] || '#8ab8ff'}">${esc(statText(a.stat, a.value, a, item))}</div>`).join('')}</div>`;
  if (item.sockets) { const gems = item.gems || []; body += `<div class="tt-sock">${Array.from({ length: item.sockets }, (_, i) => `<i class="${gems[i] ? 'on' : ''}"></i>`).join('')}<span>Treats ${gems.length}/${item.sockets}</span></div>`; }
  if (item.setId && SETS[item.setId]) {
    const S = SETS[item.setId], eq = ctx.state?.equipment || {};
    const n = Object.values(eq).filter(e => e && e.setId === item.setId).length;
    body += `<div class="tt-set">${glyph('sparkle')}<span>Part of <b>${esc(S.name)}</b> · ${n}/${S.pieces.length} worn</span></div>`;
  }
  if (item.flavor && item.rarity === 'unique') body += `<div class="tt-flavor">“${esc(String(item.flavor).replace(/^["“]|["”]$/g, ''))}”</div>`;
  const price = ctx.price ? `<div class="tt-price ${ctx.price.afford === false ? 'bad' : ''}">${ctx.price.label || 'Value'}: ${glyph('coin')}<b>${ctx.price.value}</b></div>` : '';
  const hints = [...(ctx.hints || [])];
  if (ctx.more !== false && Actions.device !== 'touch') hints.push('<b>Shift</b> details'); // (touch: Settings › Item details)
  const hintsH = hints.length ? `<div class="tt-hints">${hints.map(h => `<span>${h}</span>`).join('')}</div>` : '';
  return `<div class="tt-item tt-simple-item r-${item.rarity || 'normal'}" style="--rc:${col}">
    <div class="tt-name">${esc(itemName(item))}</div>
    <div class="tt-kind"><span>${sub}</span></div>
    ${body}${price}${hintsH}</div>`;
}

// ctx: {state, derived, compare(item)→equipped item | null, price:{label, value, afford}, hints:[..], detail?: true (the
// full tooltip) | false (simple) | undefined (TIP), more?: false (no "Shift details" hint)}
export function itemTipHTML(item, ctx = {}) {
  if (!item) return '';
  const full = ctx.detail ?? tipDetail();
  if (item.kind === 'gear' && !full) return simpleGearTip(item, ctx);
  const col = rarityColor(item.rarity);
  let name = itemName(item), sub = '', titleColor = col;
  const base = baseName(item.base);
  const req = meetsReq(item, ctx.state, ctx.derived);
  const kindName = item.kind === 'gear' ? (item.slot === 'weapon' ? cap(item.wtype || 'weapon') : cap(item.slot || 'gear')) : cap(item.kind || '');
  sub = `${cap(item.rarity || 'normal')} ${esc(kindName)}`;
  let body = '', cmp = '';
  const ext = rpgItemTooltip(item, ctx);
  if (ext && typeof ext === 'object' && !Array.isArray(ext) && Array.isArray(ext.lines)) {
    // structured tooltip from src/rpg/items.js → {title, titleColor, subtitle, lines, req, compare}
    name = ext.title || name; titleColor = ext.titleColor || col; sub = esc(ext.subtitle || '');
    const reqHTML = (ext.req || []).map(r => `<div class="tt-l tt-req ${r.met ? '' : 'bad'}">${esc(r.text)}</div>`).join('');
    let placedReq = false, out = '';
    for (const l of ext.lines) {
      if (ctx.price && /^Sell value/i.test(l.text)) continue;
      if (l.gap && !placedReq) { out += reqHTML; placedReq = true; }
      out += `${l.gap ? '<div class="tt-sep"></div>' : ''}<div class="tt-l${l.italic ? ' tt-it' : ''}" style="color:${l.color || '#f4efe6'}">${esc(l.text)}</div>`;
    }
    if (!placedReq) out += reqHTML;
    body = out;
    const other = ctx.compare ? ctx.compare(item) : null;
    if (ctx.compare && ext.compare?.length) {
      cmp = `<div class="tt-cmpbox"><div class="tt-cmph">${other ? `vs. <span style="color:${rarityColor(other.rarity)}">${esc(itemName(other))}</span>` : 'If equipped'}</div>${ext.compare.map(c => `<div class="tt-cmp ${c.delta > 0 ? 'up' : 'down'}"><b>${c.delta > 0 ? '▲' : '▼'}</b> ${esc(c.text)}</div>`).join('')}</div>`;
    } else if (ctx.compare && equipSlotsFor(item).length && !other) cmp = `<div class="tt-cmpbox"><div class="tt-cmp up"><b>✦ Empty slot</b> — any upgrade!</div></div>`;
  } else if (typeof ext === 'string' && ext.trim()) {
    body = `<div class="tt-ext">${ext}</div>`;
  } else {
    const parts = [];
    if (item.dmg) parts.push(`<div class="tt-l">Damage: <b class="tt-w">${item.dmg[0]}–${item.dmg[1]}</b></div>`);
    if (item.aspd) parts.push(`<div class="tt-l">Attack speed: <b class="tt-w">${(+item.aspd).toFixed(2)}/s</b></div>`);
    if (item.def) parts.push(`<div class="tt-l">Defense: <b class="tt-w">${item.def}</b></div>`);
    if (item.qty > 1) parts.push(`<div class="tt-l">Quantity: <b class="tt-w">${item.qty}</b></div>`);
    const r = item.req || {};
    if (r.lvl > 1) parts.push(`<div class="tt-l tt-req ${req.lvl === false ? 'bad' : ''}">Requires Level ${r.lvl}</div>`);
    if (r.str) parts.push(`<div class="tt-l tt-req ${req.str === false ? 'bad' : ''}">Requires ${r.str} Strength</div>`);
    if (r.dex) parts.push(`<div class="tt-l tt-req ${req.dex === false ? 'bad' : ''}">Requires ${r.dex} Dexterity</div>`);
    if (item.affixes?.length) {
      parts.push('<div class="tt-sep"></div>');
      for (const a of item.affixes) parts.push(`<div class="tt-aff" style="--c:${item.rarity === 'unique' ? '#ffb86a' : item.rarity === 'set' ? '#7ef09a' : '#8ab8ff'}">${esc(a.text || `+${a.value} ${statName(a.stat)}`)}</div>`);
    }
    if (item.sockets) {
      const gems = item.gems || [];
      parts.push(`<div class="tt-sock">${Array.from({ length: item.sockets }, (_, i) => `<i class="${gems[i] ? 'on' : ''}"></i>`).join('')}<span>Sockets ${gems.length}/${item.sockets}</span></div>`);
    }
    if (item.flavor) parts.push(`<div class="tt-flavor">“${esc(item.flavor)}”</div>`);
    body = parts.join('');
    const other = ctx.compare ? ctx.compare(item) : null;
    if (other && other !== item) {
      const lines = compareLines(item, other);
      if (lines.length) cmp = `<div class="tt-cmpbox"><div class="tt-cmph">vs. <span style="color:${rarityColor(other.rarity)}">${esc(itemName(other))}</span></div>${lines.join('')}</div>`;
    } else if (ctx.compare && equipSlotsFor(item).length && !other) {
      cmp = `<div class="tt-cmpbox"><div class="tt-cmp up"><b>✦ Empty slot</b> — any upgrade!</div></div>`;
    }
  }
  const price = ctx.price ? `<div class="tt-price ${ctx.price.afford === false ? 'bad' : ''}">${ctx.price.label || 'Value'}: ${glyph('coin')}<b>${ctx.price.value}</b></div>` : '';
  const hints = ctx.hints?.length ? `<div class="tt-hints">${ctx.hints.map(h => `<span>${h}</span>`).join('')}</div>` : '';
  return `<div class="tt-item r-${item.rarity || 'normal'}" style="--rc:${titleColor}">
    <div class="tt-name">${esc(name)}</div>
    <div class="tt-kind"><span>${sub}</span>${item.ilvl ? `<span class="tt-il">iLvl ${item.ilvl}</span>` : ''}</div>
    ${item.kind === 'gear' ? powerBox(item, ctx) : ''}${body}${cmp}${price}${hints}</div>`;
}

export function simpleTip(title, text, extra = '') {
  return `<div class="tt-simple"><div class="tt-h">${title}</div>${text ? `<div class="tt-d">${text}</div>` : ''}${extra}</div>`;
}
