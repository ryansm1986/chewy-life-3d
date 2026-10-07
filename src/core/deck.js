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
export const SETTINGS_KEY = 'chewy3d.settings';
export const PRESET = { LOW: 0, MED: 1, HIGH: 2, DECK: 3 };
export const PRESET_NAMES = ['Low', 'Medium', 'High', 'Deck'];
export const DECK = { pixelRatio: 0.85, shadowMap: 1536, shadowExtent: 0.82, shadowEvery: 2, particles: 0.6, uiScale: 1.15 };
export const FPS_CAPS = [0, 60, 40]; // Settings › Frame cap: Off · 60 · 40 (game.js frame())

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

/** the graphics preset to boot with → { preset: 0..3, quality: 0..2 (the density tier the worlds build with), deck } */
export function bootGraphics(params = new URLSearchParams(globalThis.location?.search || '')) {
  const s = savedSettings();
  let p = params.has('q') ? +params.get('q') : s?.quality ?? (deckLike() ? PRESET.DECK : PRESET.HIGH);
  p = Number.isFinite(p) ? Math.max(0, Math.min(3, Math.round(p))) : PRESET.HIGH;
  return { preset: p, quality: p === PRESET.DECK ? PRESET.MED : p, deck: p === PRESET.DECK };
}

/** the renderer's pixel ratio for a preset (High allows 1.5 on a HiDPI screen; the Deck renders under 1 and is upscaled) */
export const pixelRatioFor = p => Math.min(globalThis.devicePixelRatio || 1, p === PRESET.HIGH ? 1.5 : 1) * (p === PRESET.DECK ? DECK.pixelRatio : 1);
