// The Steam Deck profile (docs/CONTROLS.md §4 and §10, ROADMAP CT-3 / R-2): the Deck-like screen, the graphics presets
// at boot, the Deck preset's numbers and the frame cap.
//
// · deckLike(): the Deck's 1280×800 screen (either way up), the desktop app reporting a Deck (window.pawhaven.deck: the
//   CT-4 shell's preload sets it from Steam's SteamDeck=1), or ?deck (?deck=0 turns the detection off).
// · bootGraphics(): Settings › Graphics applies at boot (R-2: grass, flowers, details and shadow maps follow the saved
//   preset, not only ?q=). ?q=0..3 still wins, for tests; with nothing saved: Deck on a Deck-like screen, else High.
// · The Deck preset (3) builds the worlds at Medium's density (engine.quality 1) and adds DECK: a lower pixel ratio, AO
//   and tilt-shift off, smaller sun shadow maps over a tighter area (Engine.tuneShadows) redrawn every other frame
//   (Engine.render), a lower particle cap (gfx/particles.js PARTICLE_BUDGET) and, on a Deck-like screen, the UI at 1.15
//   with a safe-area inset (ui/ui.js, ui/deck.css).
// · The Mobile preset (4, CT-5: docs/CONTROLS.md §12) is the phones' and tablets' first-start pick (mobileLike(): a
//   touch-first screen): the worlds at Low's density, the pixel ratio at 1, no AO or tilt-shift, SMAA low, smaller sun
//   shadows over a tighter area redrawn every other frame, half the particles (MOBILE; the numbers from
//   tools/qa/mobile-perf.mjs).
export const SETTINGS_KEY = 'chewy3d.settings';
export const PRESET = { LOW: 0, MED: 1, HIGH: 2, DECK: 3, MOBILE: 4 };
export const PRESET_NAMES = ['Low', 'Medium', 'High', 'Deck', 'Mobile'];
export const DECK = { pixelRatio: 0.85, shadowMap: 1536, shadowExtent: 0.82, shadowEvery: 2, particles: 0.6, uiScale: 1.15 };
export const MOBILE = { pixelRatio: 1, shadowMap: 1024, shadowExtent: 0.72, shadowEvery: 2, particles: 0.5 };
/** the lighter presets' numbers (Engine.tuneShadows / render, game.js's particle cap); null: a preset that has none */
export const liteOf = p => (p === PRESET.DECK ? DECK : p === PRESET.MOBILE ? MOBILE : null);
export const FPS_CAPS = [0, 60, 40, 30]; // Settings › Frame cap: Off · 60 · 40 · 30 (game.js frame())

/** the saved settings (ui/ui.js writes them), or null: nothing saved yet, or no storage */
export function savedSettings() {
  try { const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null'); return s && typeof s === 'object' ? s : null; } catch (e) { return null; }
}

export function deckLike() {
  const p = new URLSearchParams(globalThis.location?.search || '');
  if (p.has('deck')) return p.get('deck') !== '0';
  if (globalThis.pawhaven?.deck) return true;
  const w = globalThis.screen?.width | 0, h = globalThis.screen?.height | 0;
  return (w === 1280 && h === 800) || (w === 800 && h === 1280);
}

/** a touch-first screen (a phone or tablet: a coarse pointer and no fine one), or ?mobile (?mobile=0 turns it off) */
export function mobileLike() {
  const p = new URLSearchParams(globalThis.location?.search || '');
  if (p.has('mobile')) return p.get('mobile') !== '0';
  try { return !!globalThis.matchMedia?.('(pointer: coarse)').matches && !globalThis.matchMedia('(any-pointer: fine)').matches; } catch (e) { return false; }
}

/** the graphics preset to boot with → { preset: 0..4, quality: 0..2 (the density tier the worlds build with), deck } */
export function bootGraphics(params = new URLSearchParams(globalThis.location?.search || '')) {
  const s = savedSettings();
  let p = params.has('q') ? +params.get('q') : s?.quality ?? (deckLike() ? PRESET.DECK : mobileLike() ? PRESET.MOBILE : PRESET.HIGH);
  p = Number.isFinite(p) ? Math.max(0, Math.min(4, Math.round(p))) : PRESET.HIGH;
  return { preset: p, quality: p === PRESET.DECK ? PRESET.MED : p === PRESET.MOBILE ? PRESET.LOW : p, deck: p === PRESET.DECK };
}

/** the renderer's pixel ratio for a preset (High allows 1.5 on a HiDPI screen; the Deck renders under 1 and is upscaled) */
export const pixelRatioFor = p => Math.min(globalThis.devicePixelRatio || 1, p === PRESET.HIGH ? 1.5 : 1) * (liteOf(p)?.pixelRatio ?? 1);

/** the Mobile preset's cap on a skin's side: a 2048 atlas is 22 MB of GPU memory with its mips, a 1024 one 5.6 MB (a phone
 *  shows a hero a few hundred pixels tall at most; iOS Safari closes a tab that uses too much memory) */
export const MOBILE_TEX = 1024;
/** shrink a just-loaded texture's image to `max` px on its longer side (through a canvas), before its first upload. By
 *  default the cap applies when the game boots on the Mobile preset (a preset changed later applies after a reload). */
export function capTexture(tex, max = bootGraphics().preset === PRESET.MOBILE ? MOBILE_TEX : 0) {
  const img = tex?.image, w = img?.width | 0, h = img?.height | 0;
  if (!max || !w || !h || Math.max(w, h) <= max || typeof document === 'undefined') return tex;
  const k = max / Math.max(w, h), c = document.createElement('canvas');
  c.width = Math.round(w * k); c.height = Math.round(h * k);
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, c.width, c.height);
  tex.image = c; tex.needsUpdate = true;
  return tex;
}

// ---------------------------------------------------------------- the Mobile preset's memory diet (CONTROLS §12.7)
let _memLite = null, _released = 0;
/** true when the game booted on the Mobile preset (fixed for the session, like the skins' cap and the density) */
export const memLite = () => (_memLite ??= bootGraphics().preset === PRESET.MOBILE);
/** how many geometries have let go of their arrays (core/engine.js: a lost and restored WebGL context reloads the page then) */
export const releasedGeometries = () => _released;
function dropArray() { this.array = null; }
/** opt a geometry in to dropping its JS arrays once the GPU has them (three's BufferAttribute.onUpload), on the Mobile preset
 *  only. For per-instance static geometry, built once, drawn as is and disposed with its owner: a dungeon floor's batched
 *  chunks, a pot. NEVER for a template or cache entry (another mesh may be built from it after a dispose), nor for anything
 *  raycast, merged, cloned, re-coloured or measured after its first draw. Its bounds are computed first (culling needs
 *  them). geometry.userData.released marks it. */
export function releaseAfterUpload(geo, on = memLite()) {
  if (!on || !geo?.attributes || geo.userData.released) return geo;
  if (!geo.boundingSphere) geo.computeBoundingSphere();
  if (!geo.boundingBox) geo.computeBoundingBox();
  for (const a of Object.values(geo.attributes)) if (!a.isInterleavedBufferAttribute) a.onUpload(dropArray);
  geo.index?.onUpload(dropArray);
  geo.userData.released = true; _released++;
  return geo;
}
