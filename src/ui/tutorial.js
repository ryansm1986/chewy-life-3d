// Guided tutorials, the UI side (docs/TUTORIALS.md): the director lives in world/tutorials.js and drives this.
//  - the dock (top centre): a speech card (the narrator's portrait, name and line) over the objective card ("2/6", the
//    objective, Skip / Got it! / Skip step);
//  - the spotlight: a soft pulsing ring round a UI element with the rest of the screen dimmed a little (never blocks
//    clicks: pointer-events none);
//  - coach callouts: little labelled bubbles pointing at UI elements (the reel bar's zone, fish and meter; edge: another
//    element whose side they sit past: the reel's sit just past the card, not over its meter);
//  - the flash: a big "NOW!" moment;
//  - the offer card ("New guide available: Fishing. Show me?") for saves that are already past a guide's start;
//  - GuidesView: the Journal's Guides tab (replay any guide).
// Elements are re-measured every frame (the reel card follows the player), and nothing here takes keyboard focus:
// Esc still closes panels, and gameplay keys go to the game.
// A phone with a panel up (R-14, place()): the objective card never covers the panel's tabs, its buttons, its ✕ or what
// the guide spotlights. It sits in the free strip of the panel's title band (between its name and ✕, by the thumbs) when
// the whole card fits there, else in a slim strip along the top with the panel moved down under it.
import './tutorial.css';
import { el, esc, replay } from './dom.js';
import { glyph } from './glyphs.js';
import { portraitHTML } from './portraits.js';
import { keyHint, keyCap } from './padGlyphs.js';
import { CLASSES } from '../rpg/classes.js';

// *word* → bold; while the gamepad plays, an emphasised key (*F*, *Tab*, *Shift*) becomes its pad glyph (ui/padGlyphs.js)
const md = s => esc(s).replace(/\*([^*]+)\*/g, (m, w) => keyHint(w) || `<b>${w}</b>`);
/** is it drawn (no hidden or faded-out ancestor)? */
const shown = e => { for (let a = e; a && a.nodeType === 1; a = a.parentElement) { const cs = getComputedStyle(a); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05) return false; } return true; };
/** an element's visible box: its rect clipped by every scrolling or clipping ancestor (R-14: the Board's crew grid scrolls
 *  inside the crew column on a phone, and its own box reaches far below what shows, over the title band) */
const visRect = e => {
  const r = e.getBoundingClientRect(); let L = r.left, T = r.top, R = r.right, B = r.bottom;
  for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) {
    const cs = getComputedStyle(a); if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
    const c = a.getBoundingClientRect(); L = Math.max(L, c.left); R = Math.min(R, c.right); T = Math.max(T, c.top); B = Math.min(B, c.bottom);
  }
  return { left: L, top: T, right: R, bottom: B, width: Math.max(0, R - L), height: Math.max(0, B - T) };
};
const NAMES = { shadow: 'Shadow', kero: 'Kero', moka: 'Moka', rosie: 'Rosie', usagi: 'Usagi', tanu: 'Tanu', poe: 'Poe', shihtzu: CLASSES.shihtzu.name, golden: CLASSES.golden.name, hachi: 'Old Hachi' }; // (the Shih Tzu's name is the owner's to pick: classes.js)

export class TutorialUI {
  constructor(ui, layer) {
    this.ui = ui;
    const r = this.root = el('div', 'tut');
    r.innerHTML = `<div class="tut-spot"><i class="tut-ring"></i></div><div class="tut-calls"></div>
      <div class="tut-mid"><div class="tut-flash"><b></b><small></small></div></div>
      <div class="tut-top"><div class="tut-dock">
        <div class="tut-say"><div class="ts-por"></div><div class="ts-bub"><b class="ts-name"></b><div class="ts-tx"></div></div></div>
        <div class="tut-obj"><span class="to-ic"></span><span class="to-n"></span><div class="to-t"><small class="to-h"></small><b class="to-tx"></b></div><button class="btn sm mint to-ok">${glyph('check')}<span class="to-okt">Got it!</span><span class="pad-only">${keyCap('map', { sm: true })}</span></button><button class="btn sm to-step">Skip step</button><button class="to-skip" title="Skip this guide">Skip</button></div>
      </div></div>
      <div class="tut-top"><div class="tut-offer"><div class="tf-por"></div><div class="tf-t"><small>New guide available</small><b></b><span></span></div><div class="tf-b"><button class="btn sm pink tf-yes">${glyph('play')}Show me!</button><button class="btn sm tf-no">No thanks<span class="pad-only">${keyCap('roll', { sm: true })}</span></button></div></div></div>`;
    layer.appendChild(r);
    const q = s => r.querySelector(s);
    this.$ = { spot: q('.tut-spot'), ring: q('.tut-ring'), calls: q('.tut-calls'), flash: q('.tut-flash'), flashB: q('.tut-flash b'), flashS: q('.tut-flash small'), dock: q('.tut-dock'), say: q('.tut-say'), por: q('.ts-por'), name: q('.ts-name'), tx: q('.ts-tx'),
      obj: q('.tut-obj'), ic: q('.to-ic'), n: q('.to-n'), h: q('.to-h'), otx: q('.to-tx'), ok: q('.to-ok'), step: q('.to-step'), skip: q('.to-skip'), offer: q('.tut-offer'), oPor: q('.tf-por'), oT: q('.tf-t b'), oS: q('.tf-t span') };
    this.$.ok.addEventListener('click', e => { e.stopPropagation(); this.onAck?.(); });
    this.$.step.addEventListener('click', e => { e.stopPropagation(); this.onSkipStep?.(); });
    this.$.skip.addEventListener('click', e => { e.stopPropagation(); this.onSkip?.(); });
    q('.tf-yes').addEventListener('click', e => { e.stopPropagation(); this.answerOffer(true); });
    q('.tf-no').addEventListener('click', e => { e.stopPropagation(); this.answerOffer(false); });
    this.hl = []; this.callouts = []; this.sig = {}; this.t = 0;
  }
  // ---------------------------------------------------------------- the dock
  /** show a guide's step: { guide: { title, icon }, n, total, objective, ack, skippable } */
  step(o) {
    const $ = this.$;
    this.root.classList.add('on');
    $.ic.innerHTML = o.icon ? `<img src="${o.icon}" alt="">` : glyph('paw');
    $.n.textContent = `${o.n}/${o.total}`;
    $.h.textContent = o.title || '';
    $.otx.innerHTML = md(o.objective || ''); this._step = o;
    $.obj.classList.toggle('ack', !!o.ack); $.obj.classList.toggle('skippable', !!o.skippable);
    replay($.obj, 'pop', 500);
  }
  /** the objective's text again (the device changed: world/tutorials.js redevice) */
  objective(text) { if (!this._step) return; this._step = { ...this._step, objective: text }; this.$.otx.innerHTML = md(text || ''); }
  say(who, text) {
    const $ = this.$;
    if (!text) { $.say.classList.remove('on'); this.sig.say = ''; return; }
    const sig = who + '|' + text; if (sig === this.sig.say) return; this.sig.say = sig; this._say = [who, text];
    $.por.innerHTML = portraitHTML(this.ui.G?.portrait?.(who) || who);
    $.name.textContent = NAMES[who] || who;
    $.tx.innerHTML = md(text);
    $.say.classList.add('on'); replay($.say, 'pop', 500);
    this.ui.sfx?.('tick');
  }
  /** the input device changed: re-render the key names in the current line and objective (no pop, no tick) */
  redraw() {
    if (this._step && this.root.classList.contains('on')) this.$.otx.innerHTML = md(this._step.objective || '');
    if (this._say && this.sig.say) this.$.tx.innerHTML = md(this._say[1]);
    if (this.sig.calls) { const list = this.callouts; this.sig.calls = null; this.setCallouts(list); }
  }
  setPaused(p) { this.root.classList.toggle('paused', !!p); if (p) { this.highlight([]); this.setCallouts([]); this.flash(null); } }
  hide() { this.root.classList.remove('on', 'paused'); this.say(null); this.highlight([]); this.setCallouts([]); this.flash(null); this.setPlace(null); this._placeKey = ''; }
  // ---------------------------------------------------------------- spotlight + callouts
  /** elements to ring (the first gets the dimming spotlight) */
  highlight(els) { this.hl = (els || []).filter(Boolean); if (!this.hl.length) this.root.classList.remove('spot'); }
  setCallouts(list) {
    const key = (list || []).map(c => c.text).join('|');
    if (key !== this.sig.calls) {
      this.sig.calls = key;
      this.$.calls.innerHTML = (list || []).map((c, i) => `<div class="tut-call ${c.side || 'left'}" style="--i:${i}"><span>${md(c.text)}</span><i></i></div>`).join('');
    }
    this.callouts = list || [];
  }
  flash(text, sub = '') {
    const f = this.$.flash;
    if (!text) { f.classList.remove('on'); this.sig.flash = ''; return; }
    if (this.sig.flash === text) return; this.sig.flash = text;
    this.$.flashB.textContent = text; this.$.flashS.innerHTML = md(sub);
    f.classList.remove('on'); void f.offsetWidth; f.classList.add('on');
  }
  update(dt) {
    this.t += dt;
    const s = this.ui.scale || 1;
    // the spotlight follows its element (they move: the reel card, the dialogue choices sliding in)
    const e = this.hl.find(x => x.isConnected && x.offsetParent !== null);
    this.place(dt); // (a phone with a panel up: the card's place, R-14)
    if (e) {
      const r = e.getBoundingClientRect(), pad = 8 * s;
      if (r.width > 2 && r.height > 2) {
        this.root.classList.add('spot');
        const st = this.$.spot.style;
        st.transform = `translate(${(r.left - pad).toFixed(1)}px,${(r.top - pad).toFixed(1)}px)`;
        st.width = `${(r.width + pad * 2).toFixed(1)}px`; st.height = `${(r.height + pad * 2).toFixed(1)}px`;
        st.borderRadius = `${Math.min(r.width, r.height) / 2 + pad}px`;
      } else this.root.classList.remove('spot');
    } else this.root.classList.remove('spot');
    // callouts point at their elements
    const kids = this.$.calls.children;
    this.callouts.forEach((c, i) => {
      const k = kids[i]; if (!k) return;
      const t = typeof c.el === 'string' ? document.querySelector(c.el) : c.el;
      if (!t || !t.isConnected || t.offsetParent === null) { k.style.opacity = '0'; return; }
      const r = t.getBoundingClientRect(), w = k.offsetWidth, h = k.offsetHeight, gap = 14 * s;
      const e = c.edge && document.querySelector(c.edge), xr = e && e.offsetParent !== null ? e.getBoundingClientRect() : r; // (edge: the element whose side it sits past, at t's height)
      const x = Math.max(4, Math.min(innerWidth - w - 4, c.side === 'right' ? xr.right + gap : c.side === 'top' ? r.left + r.width / 2 - w / 2 : xr.left - gap - w)); // (never off the screen)
      const y = c.side === 'top' ? r.top - gap - h : r.top + r.height * (c.at ?? 0.5) - h / 2;
      k.style.opacity = '1';
      k.style.transform = `translate(${x.toFixed(1)}px,${(y + Math.sin(this.t * 4 + i) * 3 * s).toFixed(1)}px)`;
    });
  }
  // ---------------------------------------------------------------- a phone with a panel up (R-14)
  /** Where the objective card sits while a panel fills a phone's screen, so it covers none of the panel's tabs, buttons,
   *  ✕ or spotlit target (CZ-11 only moved it when the spotlit thing sat under it; the Board's tabs stayed covered):
   *  - 'band': the free strip of the panel's title band, right of its name (and any header tabs), left of the ✕: the
   *    whole card, its line unclipped, or 'tight' (no paw, a ✓ for Got it!); never over what it spotlights;
   *  - 'strip': along the top, between what the HUD shows there (stripBox), the panel moved down under it
   *    (.ui-root.tut-strip, --tut-push: mobile.css); its line wraps, and a narrow strip goes 'tight' too.
   *  Placed when the panel (or its opening spring), the step, its line, the spotlit element or the screen changes; a band
   *  is measured again twice a second. */
  place(dt) {
    const R = this.ui.root, P = R?.classList.contains('m-phone') && this.root.classList.contains('on') ? this.phonePanel() : null;
    const key = P ? `${this._step?.n}|${this._step?.title}|${this.$.otx.textContent}|${this.$.obj.className.replace(/\s*\bpop\b/, '')}|${innerWidth}x${innerHeight}|${P.classList.contains('opening')}` : ''; // (opening: the panel springs in scaled; placed again once it stands)
    const fresh = key !== this._placeKey || P !== this._placeP || this.hl[0] !== this._placeHl;
    if (!fresh && (this._placeT = (this._placeT || 0) + dt) < 0.5) return;
    this._placeKey = key; this._placeP = P; this._placeHl = this.hl[0]; this._placeT = 0;
    if (!P) { this.setPlace(null); return; }
    if (!fresh && this._place === 'strip') return; // (the strip covers nothing: it stays until the panel, the step or the screen changes)
    if (!(this.tryBand(P, false) || this.tryBand(P, true))) this.setPlace('strip'); // (a band is measured again twice a second)
    if (fresh) this.reveal(P);
  }
  /** a spotlit element its panel's body cuts off (the strip moved the panel down: a house card's buttons) scrolls into
   *  view, once a placement; one taller than the body stays as it is */
  reveal(P) {
    for (const h of this.hl) {
      if (!h?.isConnected || !P.contains(h)) continue;
      let sc = h.parentElement; while (sc && sc !== P && !/auto|scroll/.test(getComputedStyle(sc).overflowY)) sc = sc.parentElement;
      if (!sc || sc === P) continue;
      const r = h.getBoundingClientRect(), c = sc.getBoundingClientRect(), z = sc.currentCSSZoom || 1;
      if (r.height > c.height - 8) continue;
      if (r.bottom > c.bottom - 2) sc.scrollTop += (r.bottom - c.bottom + 8) / z;
      else if (r.top < c.top + 2) sc.scrollTop -= (c.top - r.top + 8) / z;
    }
  }
  /** the panel a phone shows: the topmost open one (one at a time; a build or decorate palette along the bottom is not one,
   *  the card stays on top; nor the menu prewarm's closed panel, drawn for a frame at opacity 0.004: ui/prewarm.js) */
  phonePanel() {
    const U = this.ui; let top = null;
    for (const n of U._order || []) { const w = U.panels?.[n]?.isOpen && U.panels[n].wrap; if (w && !w.inert && !/\b(side-bottom|m-back|closing)\b/.test(w.className) && w.offsetParent !== null) top = w; }
    return top;
  }
  tryBand(P, tight) {
    this.setPlace(null); // (the panel at its own place, not moved down)
    const ph = P.querySelector(':scope > .panel > .ph'), x = ph?.querySelector('.ph-x'); if (!x || x.offsetParent === null) return false;
    const B = ph.getBoundingClientRect(), X = x.getBoundingClientRect();
    let left = B.left;
    for (const k of ph.querySelectorAll(':scope > .ph-tag, :scope > .ph-extra > *')) { const r = k.getBoundingClientRect(); if (r.width > 0 && r.height > 0) left = Math.max(left, r.right); }
    const l = left + 8, w = X.left - 8 - l, top = Math.min(B.top, X.top), h = Math.max(B.bottom, X.bottom) - top;
    if (w < 160) return false;
    const st = this.root.style;
    st.setProperty('--tb-l', l.toFixed(1) + 'px'); st.setProperty('--tb-w', w.toFixed(1) + 'px'); st.setProperty('--tb-t', top.toFixed(1) + 'px'); st.setProperty('--tb-h', h.toFixed(1) + 'px');
    this.root.classList.add('band'); this.root.classList.toggle('tight', tight); this._place = 'band';
    if (this.bandOk()) return true;
    this.root.classList.remove('band', 'tight'); this._place = null;
    return false;
  }
  /** the band's card: whole (inside the strip, its lines unclipped) and over nothing it spotlights. (The dock is measured,
   *  not the card: the card's pop-in scales it for half a second; with a panel up the dock holds the card alone.) */
  bandOk() {
    if (this._place !== 'band') return false;
    const o = this.$.dock.getBoundingClientRect(), w = parseFloat(this.root.style.getPropertyValue('--tb-w')) || 0;
    if (o.width > w + 1 || [this.$.otx, this.$.h].some(t => t.scrollWidth > t.clientWidth + 1)) return false;
    return !this.hl.some(h => { if (!h?.isConnected || h.offsetParent === null) return false; const r = visRect(h); return Math.min(r.right, o.right) - Math.max(r.left, o.left) > 1 && Math.min(r.bottom, o.bottom) - Math.max(r.top, o.top) > 1; });
  }
  setPlace(mode) {
    const c = this.root.classList, R = this.ui.root;
    if (mode !== 'band') c.remove('band', 'tight');
    c.toggle('strip', mode === 'strip'); this._place = mode;
    if (mode === 'strip') {
      const b = this.stripBox(), st = this.root.style;
      st.setProperty('--ts-l', b.l.toFixed(1) + 'px'); st.setProperty('--ts-w', b.w.toFixed(1) + 'px');
      if (this.$.otx.parentElement.clientWidth < 96) c.add('tight'); // (a narrow strip: room for the line first)
      const o = this.$.dock.getBoundingClientRect(); R?.style.setProperty('--tut-push', Math.ceil(o.bottom + 6) + 'px'); R?.classList.add('tut-strip');
    } else R?.classList.remove('tut-strip');
  }
  /** the strip along the top: the width between what the HUD shows at its height (the top-left card, the minimap column,
   *  the touch buttons) → { l, w } in CSS px */
  stripBox() {
    const sf = this.ui.mobile?.sf || { l: 0, r: 0 }, W = innerWidth;
    let l = (sf.l || 0) + 8, r = W - (sf.r || 0) - 8;
    for (const e of this.ui.root?.querySelectorAll('.hud-tl > *, .hud-tr > *, .tc.on .tc-top > *') || []) {
      const b = e.getBoundingClientRect(); if (b.width < 1 || b.top > 64 || !shown(e)) continue;
      if (b.left + b.width / 2 < W / 2) l = Math.max(l, b.right + 8); else r = Math.min(r, b.left - 8);
    }
    return { l, w: Math.max(220, r - l) };
  }
  // ---------------------------------------------------------------- the offer card
  /** → Promise<boolean> */
  offer({ title, text, who }) {
    const $ = this.$;
    $.oPor.innerHTML = portraitHTML(this.ui.G?.portrait?.(who) || who);
    $.oT.textContent = title; $.oS.innerHTML = md(text || '');
    $.offer.classList.add('on'); replay($.offer, 'pop', 500);
    this.ui.sfx?.('open');
    return new Promise(res => { this._offer = res; });
  }
  answerOffer(yes) {
    const r = this._offer; if (!r) return;
    this._offer = null; this.$.offer.classList.remove('on');
    this.ui.sfx?.(yes ? 'select' : 'close');
    r(yes);
  }
  get offering() { return !!this._offer; }
}

/** The Journal's Guides tab: every guide, its status, and Play / Replay. */
export class GuidesView {
  constructor(ui) {
    this.ui = ui;
    this.root = el('div', 'gd-wrap');
    this.root.addEventListener('click', e => {
      const b = e.target.closest('[data-play]'); if (!b || b.classList.contains('dis')) return;
      this.ui.close('quests');
      this.ui.G?.tutorials?.start(b.dataset.play, { replay: true });
      this.ui.sfx?.('select');
    });
  }
  render() {
    const T = this.ui.G?.tutorials; if (!T) { this.root.innerHTML = ''; return; }
    const list = T.list();
    const sig = JSON.stringify(list); if (sig === this._sig) return; this._sig = sig;
    this.root.innerHTML = `<div class="gd-h">${glyph('book')}<span>Guides you can replay any time. Finished ones get a <b>✓</b>.</span></div>` + list.map((g, i) => `
      <div class="gd-card ${g.status}" style="--i:${i};--gc:${g.color}">
        <div class="gd-por">${portraitHTML(this.ui.G?.portrait?.(g.narrator) || g.narrator)}</div>
        <div class="gd-t"><b>${esc(g.title)}</b><small>${esc(g.blurb)}</small>${g.locked ? `<span class="gd-lock">${glyph('lock')}${esc(g.locked)}</span>` : ''}</div>
        <div class="gd-st">${g.status === 'done' ? `<i class="gd-ok">${glyph('check')}Done</i>` : g.status === 'active' ? '<i class="gd-on">In progress</i>' : g.status === 'skipped' ? '<i>Skipped</i>' : ''}</div>
        <button class="btn sm ${g.locked ? 'dis' : 'pink'}" data-play="${g.id}">${glyph('play')}${g.status === 'new' ? 'Play' : 'Replay'}</button>
      </div>`).join('');
  }
}
