// The debug menu's section registry and its password check (docs/DEBUG.md, ROADMAP R-10). Always loaded and tiny: no
// DOM, no three.js (node-tested in tools/test-rpg.mjs). The menu itself (src/debug/debugMenu.js) is lazy-loaded only
// once debug is on, so a feature anywhere can register its own actions at boot without pulling the menu in:
//
//   import { registerDebug } from '../debug/registry.js';
//   registerDebug('cozy', [
//     { label: 'Skip 8 game hours', run: G => { …; return 'Skipped 8 hours'; } },                 // a button
//     { label: 'Crew size', choices: [1, 2, 3], run: (G, n) => `Crew of ${n}` },                // one tap per choice
//     { label: 'Send a crew', fields: [{ key: 'zone', label: 'Zone', choices: ['bamboo', 'maple'] }], go: 'Send', run: (G, v) => … }, // a small form
//     { label: 'Show wages', toggle: true, get: G => !!G.x, run: (G, on) => … },               // a switch
//     { note: 'Some words under the section' },
//   ], { title: 'Cozy', icon: 'leaf', order: 90 });
//
// An action's run(G, value) returns the toast text (or nothing: "<label> ✓"); a choice is a value or { label, value };
// `choices` may be a function of G (built when the tab opens); `confirm: true` asks for a second tap; `group` starts a
// small heading above the action. Registering the same section again adds to it (an action with the same id or label
// replaces the old one), so a feature can register from wherever its code lives.

/** id → { id, title, icon, order, note, actions: [] } */
export const DEBUG_SECTIONS = new Map();
let changed = 0;
/** bumps whenever a section changes (the open menu re-renders) */
export const registryVersion = () => changed;

export function registerDebug(section, actions = [], o = {}) {
  if (!section) return null;
  let S = DEBUG_SECTIONS.get(section);
  if (!S) { S = { id: section, title: o.title || section[0].toUpperCase() + section.slice(1), icon: o.icon || 'gear', order: o.order ?? 50 + DEBUG_SECTIONS.size, note: o.note || '', actions: [] }; DEBUG_SECTIONS.set(section, S); }
  else { if (o.title) S.title = o.title; if (o.icon) S.icon = o.icon; if (o.order != null) S.order = o.order; if (o.note) S.note = o.note; }
  for (const a of actions || []) {
    if (!a) continue;
    const key = a.id || a.label || a.note;
    const i = key ? S.actions.findIndex(b => (b.id || b.label || b.note) === key) : -1;
    if (i >= 0) S.actions[i] = a; else S.actions.push(a);
  }
  changed++;
  return S;
}
/** the sections in menu order */
export const debugSections = () => [...DEBUG_SECTIONS.values()].sort((a, b) => a.order - b.order);

// ------------------------------------------------------------------ the password
// A casual deterrent, NOT security: it all runs on the player's own device, so anyone who reads the bundle can turn
// debug on by hand (localStorage 'chewy3d.debug'). It keeps players from stumbling in, and keeps the plaintext out of
// the bundle. To change the password: `node -e "require('crypto').subtle.digest('SHA-256', new TextEncoder().encode('NEW')).then(b => console.log(Buffer.from(b).toString('hex')))"`
// and replace PASS_HASH with the printed hex (docs/DEBUG.md).
export const PASS_HASH = '96a24ac1a2fa75ec6a7ddf4a4ce9476f18bd8b338c3cb4483b654f065b1162f6';

/** SHA-256 of a string → lowercase hex. Web Crypto where it exists (https, localhost, the desktop app); a small JS
 *  fallback otherwise (a dev server opened over the LAN is not a secure context, so crypto.subtle is missing there). */
export async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(String(text));
  const subtle = globalThis.crypto?.subtle;
  if (subtle?.digest) { try { return hex(new Uint8Array(await subtle.digest('SHA-256', bytes))); } catch (e) { /* fall through */ } }
  return hex(sha256js(bytes));
}
/** does this typed password match? (trimmed; case kept) */
export async function checkPassword(text) { return (await sha256Hex(String(text ?? '').trim())) === PASS_HASH; }

const hex = b => [...b].map(x => x.toString(16).padStart(2, '0')).join('');
const K = new Uint32Array([0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
function sha256js(msg) {
  const L = msg.length, n = ((L + 9 + 63) >> 6) << 6, m = new Uint8Array(n);
  m.set(msg); m[L] = 0x80;
  const dv = new DataView(m.buffer); dv.setUint32(n - 8, Math.floor(L / 0x20000000)); dv.setUint32(n - 4, (L << 3) >>> 0);
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]), W = new Uint32Array(64);
  const r = (x, k) => (x >>> k) | (x << (32 - k));
  for (let o = 0; o < n; o += 64) {
    for (let i = 0; i < 16; i++) W[i] = dv.getUint32(o + i * 4);
    for (let i = 16; i < 64; i++) { const a = W[i - 15], b = W[i - 2]; W[i] = (W[i - 16] + (r(a, 7) ^ r(a, 18) ^ (a >>> 3)) + W[i - 7] + (r(b, 17) ^ r(b, 19) ^ (b >>> 10))) >>> 0; }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + W[i]) >>> 0;
      const t2 = ((r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
  }
  const out = new Uint8Array(32), ov = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) ov.setUint32(i * 4, H[i]);
  return out;
}
