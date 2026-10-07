// Device-aware button prompts (docs/CONTROLS.md §1): keyboard keycaps, or gamepad glyphs drawn in the game's style
// (chunky shapes, the soft ink outline, a shine). Xbox names and colours by default (the Steam Deck's A/B/X/Y match);
// PlayStation symbols when the pad's id says so, or Settings › Controls › Button glyphs.
//   padGlyph(token, style)       → '<svg class="pg">…' for a pad button ('A', 'LB', 'RT', 'DDown', 'L3+R3', 'LS'…)
//   keyCap(action, { sm })       → a cap for an action on the active device, tagged data-act so refreshCaps() can redraw
//                                  it when the device or the bindings change ('' inside and hidden when unbound there)
//   capInner(action, dev)        → just the inside of a cap
//   keyText(action)              → plain text ('F', 'A', 'D-pad ▼')
//   resolveKeys(text)            → '{action}' tokens → keyText; on the pad, "press F" / "hold Tab" phrases too
//   keyHint(label)               → HTML for an emphasised key in guide / dialogue text (*F*, *Tab*) on the pad, else null
// installPadGlyphs(ui) wires the redraws (UI.init).
import './pad.css';
import { Actions } from '../core/actions.js';
import { Events } from '../core/events.js';
import { glyph } from './glyphs.js';

const INK = '#4a2c2a', LAV2 = '#ddd3ea', CREAM = '#fff6e8';
const svg = (inner, wide) => `<svg class="pg${wide ? ' wide' : ''}" viewBox="0 0 ${wide ? 48 : 32} 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${inner}</svg>`;
const txt = (s, x, y, size, fill = '#fff', sw = 3.4) => `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central" font-size="${size}" font-weight="700" fill="${fill}" stroke="${INK}" stroke-width="${sw}" stroke-linejoin="round" paint-order="stroke">${s}</text>`;
const shine = (x, y, rx = 3, ry = 1.6) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" transform="rotate(-32 ${x} ${y})" fill="#fff" opacity=".6"/>`;
const disc = (fill, cx = 16, r = 12.6) => `<circle cx="${cx}" cy="17" r="${r}" fill="${INK}"/><circle cx="${cx}" cy="15.6" r="${r}" fill="${fill}" stroke="${INK}" stroke-width="2.4"/>`;
const face = (letter, col) => disc(col) + `<circle cx="16" cy="15.6" r="9.3" fill="none" stroke="#fff" stroke-opacity=".3" stroke-width="1.6"/>` + txt(letter, 16, 16.1, 15.5) + shine(10.6, 9.6);
// PlayStation: cream keys with the coloured symbols
const psFace = (sym) => disc(CREAM) + sym + shine(10.6, 9.6);
const stroked = (d, col, w = 2.8) => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${w + 2.6}" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const PS_SYM = {
  A: stroked('M11.6 11.2l8.8 8.8M20.4 11.2l-8.8 8.8', '#5b8fe8'),
  B: stroked('M16 10.2a5.4 5.4 0 1 1 0 10.8a5.4 5.4 0 1 1 0-10.8z', '#ec5a5a'),
  X: stroked('M11.2 10.8h9.6v9.6h-9.6z', '#e77ac2'),
  Y: stroked('M16 10l5.6 9.4H10.4z', '#33b88f'),
};
// shoulder buttons: a wide pill with the outer top corner swept (LB / RB), a tall rounded trigger (LT / RT); plum keys
// with white labels so the two letters read at hotbar size
const PLUM = '#7d6bb0', PLUM2 = '#c9bce6';
const BUMP_L = 'M29 10.5Q29 6.5 24.5 6.5H13Q3 6.5 3 16.5V21Q3 25.5 7.5 25.5H24.5Q29 25.5 29 21Z';
const BUMP_R = 'M3 10.5Q3 6.5 7.5 6.5H19Q29 6.5 29 16.5V21Q29 25.5 24.5 25.5H7.5Q3 25.5 3 21Z';
const bumper = (label, right) => `<path d="${right ? BUMP_R : BUMP_L}" fill="${INK}" transform="translate(0 1.4)"/><path d="${right ? BUMP_R : BUMP_L}" fill="${PLUM}" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>`
  + `<path d="${right ? 'M7 9.6H19' : 'M25 9.6H13'}" stroke="${PLUM2}" stroke-width="1.8" stroke-linecap="round" opacity=".8"/>` + txt(label, 16, 17, 12.5, '#fff', 3.6);
const TRIG = 'M6.5 29V12Q6.5 2.6 16 2.6T25.5 12V29Q25.5 30 24.5 30H7.5Q6.5 30 6.5 29Z';
const trigger = (label) => `<path d="${TRIG}" fill="${INK}" transform="translate(0 1.2)"/><path d="${TRIG}" fill="${PLUM}" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>`
  + `<path d="M10.5 9.5Q12 5.6 16 5.6" fill="none" stroke="${PLUM2}" stroke-width="1.8" stroke-linecap="round" opacity=".8"/>` + txt(label, 16, 18.6, 12.5, '#fff', 3.6);
const DPAD = 'M11.4 2.6h9.2a1.4 1.4 0 0 1 1.4 1.4v6h6a1.4 1.4 0 0 1 1.4 1.4v9.2a1.4 1.4 0 0 1-1.4 1.4h-6v6a1.4 1.4 0 0 1-1.4 1.4h-9.2a1.4 1.4 0 0 1-1.4-1.4v-6H4a1.4 1.4 0 0 1-1.4-1.4v-9.2A1.4 1.4 0 0 1 4 10h6V4a1.4 1.4 0 0 1 1.4-1.4z'; // (chunky arms: it still reads at hotbar size on the Deck)
const ARM = { DUp: [11.2, 3.6, 9.6, 7.6, 'M16 4.8l3.4 4.4h-6.8z'], DDown: [11.2, 20.8, 9.6, 7.6, 'M16 27.2l3.4-4.4h-6.8z'], DLeft: [3.6, 11.2, 7.6, 9.6, 'M4.8 16l4.4-3.4v6.8z'], DRight: [20.8, 11.2, 7.6, 9.6, 'M27.2 16l-4.4-3.4v6.8z'] };
const dpad = (dir) => `<path d="${DPAD}" fill="${INK}" transform="translate(0 1.2)"/><path d="${DPAD}" fill="${CREAM}" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>`
  + Object.entries(ARM).map(([k, [x, y, w, h, tri]]) => (k === dir ? `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1.4" fill="#ff8fb0"/><path d="${tri}" fill="#fff" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>` : `<path d="${tri}" fill="${INK}" opacity=".28"/>`)).join('')
  + '<circle cx="16" cy="16" r="2" fill="' + INK + '" opacity=".18"/>';
const stick = (label, cx = 16, r = 12.6, size = 10, arrows = false) => disc(LAV2, cx, r) + `<circle cx="${cx}" cy="15.6" r="${r * 0.74}" fill="${PLUM}" stroke="${INK}" stroke-width="2"/>` + txt(label, cx, 16, size, '#fff', 3.2)
  + (arrows ? ['M16 1.6l2 2.4h-4z', 'M16 30.4l2-2.4h-4z', 'M1.6 16l2.4-2v4z', 'M30.4 16l-2.4-2v4z'].map(d => `<path d="${d}" fill="${INK}"/>`).join('') : '') + shine(cx - r * 0.42, 9.8, 2.4, 1.3);
const small = (inner) => `<circle cx="16" cy="17" r="11" fill="${INK}"/><circle cx="16" cy="15.6" r="11" fill="${LAV2}" stroke="${INK}" stroke-width="2.4"/>` + inner + shine(11.4, 10.4, 2.2, 1.2);
const GLYPH = {
  xbox: {
    A: () => face('A', '#62c25a'), B: () => face('B', '#ee5b4a'), X: () => face('X', '#4f95ec'), Y: () => face('Y', '#f3c13f'),
    View: () => small(`<rect x="10.4" y="10.6" width="7.6" height="6.4" rx="1.4" fill="${CREAM}" stroke="${INK}" stroke-width="1.8"/><rect x="14" y="14.2" width="7.6" height="6.4" rx="1.4" fill="${CREAM}" stroke="${INK}" stroke-width="1.8"/>`),
    Menu: () => small(`<path d="M11 11.6h10M11 15.6h10M11 19.6h10" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>`),
  },
  ps: {
    A: () => psFace(PS_SYM.A), B: () => psFace(PS_SYM.B), X: () => psFace(PS_SYM.X), Y: () => psFace(PS_SYM.Y),
    View: () => small(`<path d="M12.6 11.2l2 8.6M15.6 11.2l2 8.6M18.6 11.2l2 8.6" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>`),
    Menu: () => small(`<path d="M11.4 11.8h9.2M11.4 15.6h9.2M11.4 19.4h9.2" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>`),
  },
};
const BUMP = { xbox: { LB: 'LB', RB: 'RB', LT: 'LT', RT: 'RT' }, ps: { LB: 'L1', RB: 'R1', LT: 'L2', RT: 'R2' } };
const cache = new Map();
/** the SVG for a pad button in a style ('xbox' | 'ps') */
export function padGlyph(t, style = Actions.padStyle) {
  const key = style + '|' + t; if (cache.has(key)) return cache.get(key);
  const S = GLYPH[style] || GLYPH.xbox, B = BUMP[style] || BUMP.xbox;
  let out;
  if (S[t]) out = svg(S[t]());
  else if (t === 'LB' || t === 'RB') out = svg(bumper(B[t], t === 'RB'));
  else if (t === 'LT' || t === 'RT') out = svg(trigger(B[t]));
  else if (ARM[t]) out = svg(dpad(t));
  else if (t === 'LS' || t === 'RS') out = svg(stick(t[0], 16, 12.6, 12.5, true));
  else if (t === 'L3' || t === 'R3') out = svg(stick(t, 16, 12.6, 11));
  else if (t === 'L3+R3') out = svg(stick('L3', 11, 10, 9) + stick('R3', 37, 10, 9) + txt('+', 24, 15.6, 12, INK, 0), true);
  else out = svg(disc(LAV2) + txt(t, 16, 16, 9));
  cache.set(key, out);
  return out;
}

// ---------------------------------------------------------------- caps for actions
const MOUSE_GLYPH = { mouse0: 'mouseL', mouse2: 'mouseR' };
/** the inside of a cap: a pad glyph, a mouse glyph or the key's name ('' when the action is unbound on dev) */
export function capInner(a, dev = Actions.device) {
  const t = Actions.promptToken(a, dev); if (!t) return '';
  if (dev === 'pad') return padGlyph(t);
  if (MOUSE_GLYPH[t]) return glyph(MOUSE_GLYPH[t]);
  return Actions.text(a, 'kbm');
}
/** a whole cap: <span class="kc[ sm][ pad]" data-act=…> (refreshCaps redraws it on a device or bindings change) */
export function keyCap(a, { sm = false, cls = '' } = {}) {
  const dev = Actions.device, inner = capInner(a, dev);
  return `<span class="kc${sm ? ' sm' : ''}${dev === 'pad' ? ' pad' : ''}${inner ? '' : ' unbound'}${cls ? ' ' + cls : ''}" data-act="${a}">${inner}</span>`;
}
export const keyText = (a, dev) => Actions.text(a, dev);
export const resolveKeys = text => Actions.resolve(text);
/** redraw every tagged cap (data-act) under root for the active device */
export function refreshCaps(root = document) {
  const dev = Actions.device;
  for (const e of root.querySelectorAll('[data-act]')) {
    const inner = capInner(e.dataset.act, dev);
    if (e._cap !== dev + inner) { e.innerHTML = inner; e._cap = dev + inner; }
    e.classList.toggle('pad', dev === 'pad'); e.classList.toggle('unbound', !inner);
  }
}
/** HTML for an emphasised key in guide or dialogue text (*F*, *Tab*) while the pad plays; null: leave the text alone */
export function keyHint(label) {
  if (Actions.device === 'touch') return touchHint(label);
  if (Actions.device !== 'pad') return null;
  const v = /^(tap|hold|press|click|use) (.+)$/i.exec(String(label).trim()); // ("*Tap Tab*", "*hold Tab*")
  if (v) { const g = keyHint(v[2]); return g && `<b>${v[1]}</b> ${g}`; }
  const a = Actions.forKey(label); if (!a) return null;
  const inner = capInner(a, 'pad'); if (!inner) return null;
  return `<span class="kc sm pad inline" data-act="${a}">${inner}</span>`;
}

/** touch (CT-5): an emphasised key names the on-screen control instead ("press *F*" → "press the attack button") */
function touchHint(label) {
  const v = /^(tap|hold|press|click|use) (.+)$/i.exec(String(label).trim());
  if (v) { const g = touchHint(v[2]); return g && `<b>${v[1]}</b> ${g}`; }
  const a = Actions.forKey(label), t = a && Actions.text(a, 'touch');
  return t ? `<b class="touch-name">${t}</b>` : null;
}

// ---------------------------------------------------------------- mouse wording → the pad's buttons
const CAP = t => `<span class="kc sm pad inline">${padGlyph(t)}</span>`;
/** while the pad plays, a tooltip's or footer's mouse wording names the pad's buttons instead (CONTROLS §9: the focus
 *  handlers): Click → A, Right-click → Y, Shift+Click / Shift+Right-click / Ctrl+Click → X, Drag → A, ⚡ → X,
 *  the mouse wheel → the triggers. Anything else is left alone; with the mouse the text is returned as is. */
export function padWording(html) {
  if (Actions.device === 'touch' && html) return touchWording(html);
  if (Actions.device !== 'pad' || !html) return html;
  return String(html)
    .replace(/<b>(Shift\+Right-click|Shift\+Click|Ctrl\+Click)<\/b>/g, () => CAP('X'))
    .replace(/<b>Right-click<\/b>\s*\/\s*<b>1–4<\/b>/g, () => CAP('Y'))
    .replace(/<b>Right-click<\/b>/g, () => CAP('Y'))
    .replace(/<b>(Click|Drag)<\/b>/g, () => CAP('A'))
    .replace(/<b>⚡<\/b>/g, () => CAP('X'))
    .replace(/\b(Shift\+Right-click|Shift\+Click|Ctrl\+Click)\b/g, () => CAP('X'))
    .replace(/\bRight-click\b/g, () => CAP('Y'))
    .replace(/\b(?:Click|click)\b/g, () => CAP('A'))
    .replace(/\bDrag items\b/g, () => `${CAP('A')} moves items`)
    .replace(/drag gear here/g, 'pick up gear and put it here')
    .replace(/Scroll the mouse wheel to zoom/g, () => `${CAP('LT')}${CAP('RT')} zoom`);
}

/** touch (CT-5): a tooltip's or footer's mouse wording in touch's words (ui/mobile.js: a tap is the click, a double-tap
 *  the right-click, a long press shows the details; the shop's Sell tab sells) */
export function touchWording(html) {
  return String(html)
    .replace(/<b>(Shift\+Right-click|Shift\+Click)<\/b>\s*(sell|to sell)/g, 'the <b>Sell</b> tab sells')
    .replace(/<b>Ctrl\+Click<\/b>/g, '<b>Drag</b>')
    .replace(/<b>Right-click<\/b>\s*\/\s*<b>1–4<\/b>/g, '<b>Double-tap</b>')
    .replace(/<b>Right-click<\/b>/g, '<b>Double-tap</b>')
    .replace(/<b>Click<\/b>/g, '<b>Tap</b>')
    .replace(/\b(Shift\+Right-click|Shift\+Click)\b to sell/g, 'The Sell tab sells')
    .replace(/\bCtrl\+Click\b/g, 'Drag')
    .replace(/\bRight-click\b/g, 'Double-tap')
    .replace(/\bright-click\b/g, 'double-tap')
    .replace(/\bClick or drag to paint\b/g, 'Drag to paint')
    .replace(/\bClick\b/g, 'Tap').replace(/\bclick\b/g, 'tap')
    .replace(/Scroll the mouse wheel to zoom/g, 'Pinch to zoom')
    .replace(/ · R to rotate/g, ' · Turn rotates it');
}

// ---------------------------------------------------------------- wiring
export function installPadGlyphs(ui) {
  const redraw = () => { try { refreshCaps(document); } catch (e) { console.warn('[pad] glyph refresh', e); } };
  Events.on('input:device', p => { if (p?.device === 'pad') ui.tip?.hide?.(); redraw(); ui.onDevice?.(p); });
  Events.on('input:bindings', redraw);
  return redraw;
}
