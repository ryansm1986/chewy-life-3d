// The desktop app's side of the game (tools/desktop/preload.cjs gives window.pawhaven; docs/DESKTOP.md, ROADMAP CT-4):
// Settings › Full screen (two ways with F11 / Alt+Enter) and the Quit buttons on the title and in the game menu. In a
// browser DESKTOP is null and none of this shows. (Its Steam Deck flag is read by core/deck.js.)
export const DESKTOP = globalThis.pawhaven?.desktop ? globalThis.pawhaven : null;

export function installDesktop(ui) {
  if (!DESKTOP) return;
  document.body.classList.add('desktop-app');
  ui.settings.fullscreen = !!DESKTOP.isFullscreen?.(); // (the window's state is the truth: the app remembers it)
  ui.onSetting((k, v) => { if (k === 'fullscreen' && !!v !== !!DESKTOP.isFullscreen?.()) DESKTOP.setFullscreen?.(!!v); });
  DESKTOP.onFullscreen?.(on => { ui.settings.fullscreen = !!on; if (ui.isOpen('menu')) ui.panels.menu?.sync?.(); });
}

/** save, then close the app (the window's beforeunload saves again: harmless) */
export function quitGame(ui) {
  try { ui?.G?.save?.(); } catch (e) { console.warn('[desktop] save before quitting failed', e); }
  DESKTOP?.quit?.();
}
