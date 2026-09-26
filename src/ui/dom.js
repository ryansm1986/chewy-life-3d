// Small DOM helpers shared by every UI module. No per-frame layout reads here.
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

// el('div', 'a b', '<b>html</b>')
export function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));

export function fmt(n) {
  n = +n || 0;
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (Math.abs(n) >= 1e4) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'k';
  return Math.round(n).toLocaleString('en-US');
}

// Only touch the DOM when the value actually changed.
export function setText(e, v) { if (e && e._t !== v) { e._t = v; e.textContent = v; } }
export function setHTML(e, v) { if (e && e._h !== v) { e._h = v; e.innerHTML = v; } }
export function setVar(e, k, v) {
  if (!e) return;
  const c = e._v || (e._v = {});
  if (c[k] !== v) { c[k] = v; e.style.setProperty(k, v); }
}
export function setCls(e, cls, on) {
  if (!e) return;
  const c = e._c || (e._c = {});
  on = !!on;
  if (c[cls] !== on) { c[cls] = on; e.classList.toggle(cls, on); }
}
export function setStyle(e, k, v) {
  if (!e) return;
  const c = e._s || (e._s = {});
  if (c[k] !== v) { c[k] = v; e.style[k] = v; }
}

// Restart a one-shot CSS animation class (event-driven only, never per frame).
export function replay(e, cls, ms) {
  if (!e) return;
  e.classList.remove(cls);
  void e.offsetWidth;
  e.classList.add(cls);
  if (ms) { clearTimeout(e['_rp' + cls]); e['_rp' + cls] = setTimeout(() => e.classList.remove(cls), ms); }
}

export const RARITY = { normal: '#f4efe6', magic: '#6ea8ff', rare: '#ffd84a', unique: '#ff9a3c', set: '#5ee07a', champion: '#8fd0ff', boss: '#ff6a7a', minion: '#f4efe6' };
export const rarityColor = r => RARITY[r] || RARITY.normal;
export const RARITY_JP = { normal: 'ふつう', magic: 'まほう', rare: 'レア', unique: 'ユニーク', set: 'セット' };

export const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : '');

// Split a string into letter spans for bouncy text. Spaces stay as spaces.
export function letters(text, cls = 'lt') {
  return [...String(text)].map((ch, i) => ch === ' ' ? '<span class="sp"> </span>'
    : `<span class="${cls}" style="--i:${i}">${esc(ch)}</span>`).join('');
}

export const isTyping = () => { const a = document.activeElement; return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable) && a.type !== 'range' && a.type !== 'checkbox'; };

export function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
