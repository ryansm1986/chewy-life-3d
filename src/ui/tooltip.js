// Cursor-following tooltip + item/skill tooltip builders.
import { el, esc, rarityColor, RARITY_JP, cap } from './dom.js';
import { glyph } from './glyphs.js';
import { itemName, baseName, meetsReq, rpgItemTooltip, equipSlotsFor } from './rpg.js';

export class Tooltip {
  constructor(layer) {
    this.wrap = el('div', 'tt-wrap');
    this.box = el('div', 'tt');
    this.wrap.appendChild(this.box);
    layer.appendChild(this.wrap);
    this.on = false; this.x = 0; this.y = 0; this.w = 0; this.h = 0; this.owner = null;
    addEventListener('mousemove', e => { this.x = e.clientX; this.y = e.clientY; if (this.on) this.place(); }, { passive: true });
  }
  show(html, cls = '', owner = null) {
    if (!html) return this.hide();
    this.owner = owner;
    this.box.className = 'tt ' + cls;
    this.box.innerHTML = html;
    const r = this.box.getBoundingClientRect();
    this.w = r.width; this.h = r.height;
    if (!this.on) { this.on = true; this.wrap.classList.remove('show'); void this.wrap.offsetWidth; }
    this.wrap.classList.add('show');
    this.place();
  }
  refresh(html) { if (this.on) this.show(html, this.box.className.replace(/^tt\s*/, ''), this.owner); }
  place() {
    const pad = 10, off = 20;
    let x = this.x + off, y = this.y - this.h - 22;
    if (x + this.w > innerWidth - pad) x = this.x - this.w - off;
    if (x < pad) x = pad;
    if (y < pad) y = Math.min(this.y + off + 6, innerHeight - this.h - pad);
    this.wrap.style.transform = `translate3d(${x | 0}px,${y | 0}px,0)`;
  }
  hide(owner) {
    if (owner && this.owner && owner !== this.owner) return;
    if (!this.on) return;
    this.on = false; this.owner = null;
    this.wrap.classList.remove('show');
  }
  // Bind hover tooltip to an element. fn() returns html (or null).
  bind(target, fn, cls = '') {
    target.addEventListener('mouseenter', () => { const h = fn(target); if (h) this.show(h, cls, target); });
    target.addEventListener('mouseleave', () => this.hide(target));
    return target;
  }
}

// ------------------------------------------------------------------ item tooltip
const STAT_NAMES = {
  str: 'Strength', dex: 'Dexterity', vit: 'Vitality', ene: 'Energy', lifeMax: 'Life', zoomMax: 'Zoom', lifeRegen: 'Life Regen', zoomRegen: 'Zoom Regen',
  dmgMin: 'Min Damage', dmgMax: 'Max Damage', dmgPct: '% Damage', aspd: 'Attack Speed', atkSpeed: '% Attack Speed', castSpeed: '% Cast Speed', moveSpeed: '% Move Speed',
  crit: '% Crit Chance', critDmg: '% Crit Damage', def: 'Defense', block: '% Block', resFire: 'Fire Resist', resFrost: 'Frost Resist', resZap: 'Zap Resist', resStink: 'Stink Resist',
  lifeSteal: '% Life Steal', zoomSteal: '% Zoom Steal', fireDmg: 'Fire Damage', frostDmg: 'Frost Damage', zapDmg: 'Zap Damage', stinkDmg: 'Stink Damage', mf: '% Magic Find', gf: '% Coin Find',
  thorns: 'Thorns', allSkills: 'All Skills', xpBonus: '% XP', pierce: '% Pierce', cdr: '% Cooldown Reduction', lifeOnKill: 'Life on Kill', shadowDmg: '% Shadow Damage', shadowLife: '% Shadow Life',
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

// ctx: {state, derived, compare(item)→equipped item | null, price:{label, value, afford}, hints:[..]}
export function itemTipHTML(item, ctx = {}) {
  if (!item) return '';
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
    <div class="tt-kind"><span>${sub}</span>${item.ilvl ? `<span class="tt-il">iLvl ${item.ilvl}</span>` : ''}<span class="jp">${RARITY_JP[item.rarity] || ''}</span></div>
    ${body}${cmp}${price}${hints}</div>`;
}

export function simpleTip(title, text, extra = '') {
  return `<div class="tt-simple"><div class="tt-h">${title}</div>${text ? `<div class="tt-d">${text}</div>` : ''}${extra}</div>`;
}
