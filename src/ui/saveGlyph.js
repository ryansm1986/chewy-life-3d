// The autosave's "saving…" glyph (ROADMAP R-11, core/autosave.js): a small paw and a word that fade in and out in the
// HUD's bottom-left corner. It lives in the HUD layer, so it keeps inside the safe area (--sa-*, the itch inset, the
// Deck's margins: mobile.css / deck.css) and scales with the UI; it sits above the FPS line and left of the orbs, below
// the touch stick's ring (bottom-right when touch plays left-handed). No pointer events, no toast. prefers-reduced-motion: a plain fade, no paw steps.
import { glyph } from './glyphs.js';
import './saveGlyph.css';

/** → { show(), el } in the UI's HUD layer, or null without a UI */
export function makeSaveGlyph(ui) {
  const layer = ui?.layers?.hud; if (!layer) return null;
  const el = document.createElement('div');
  el.className = 'save-glyph'; el.setAttribute('aria-live', 'polite'); el.setAttribute('role', 'status');
  el.innerHTML = `<span class="sg-paws">${glyph('paw')}${glyph('paw')}</span><span class="sg-t">saving…</span>`;
  layer.appendChild(el);
  let t = 0;
  return {
    el,
    show(ms = 1600) {
      // touch, left-handed: the buttons are on the left, so the glyph takes the stick's corner (mirrored, like touch.js)
      el.classList.toggle('sg-right', !!ui.settings?.touchLeft && !!ui.root?.classList.contains('m-touch'));
      el.classList.add('on'); el.dataset.shown = String((+el.dataset.shown || 0) + 1);
      clearTimeout(t); t = setTimeout(() => el.classList.remove('on'), ms);
    },
  };
}
