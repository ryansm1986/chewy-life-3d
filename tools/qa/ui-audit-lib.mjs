// Shared checks for the UI audits (tools/qa/mobile-ui.mjs, desktop-ui.mjs; ROADMAP R-13).
//   page.evaluate(headerOutside) → [{ sel, rect, frame }]: every open panel's header buttons (its title row's buttons,
//   tabs and badges, and a tab row heading its body: the skill trees') whose visible part runs outside the panel's frame.
//   The visible part: the box clipped by every scrolling or clipping ancestor up to the panel (a tab row that scrolls
//   sideways may hold more tabs than it shows). The ✕ sits on the frame's corner by design and is left out, as is
//   anything docked outside the panel on purpose (the K panel's Charge drawer).
export function headerOutside() {
  const out = [];
  const vis = el => { for (let e = el; e && e !== document.body; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05) return false; } return true; };
  for (const P of document.querySelectorAll('.pw .panel')) {
    if (!P.offsetParent || P.closest('.closing')) continue;
    const F = P.getBoundingClientRect(); if (F.width < 2 || F.height < 2) continue;
    const name = [...P.classList].find(c => c.startsWith('p-')) || 'panel';
    const els = P.querySelectorAll(':scope > .ph :is(button:not(.ph-x), .btn, .tab, .sk-pts, .pill, .seg button), :scope > .pb > .tabs .tab, :scope > .pb > .sk-tabs .tab');
    for (const e of els) {
      if (e.closest('.chg-drawer') || !vis(e)) continue;
      let r = e.getBoundingClientRect(); if (r.width < 1 || r.height < 1) continue;
      let L = r.left, T = r.top, R = r.right, B = r.bottom;
      for (let a = e.parentElement; a && a !== P; a = a.parentElement) { // (clipped by a scrolling or hidden-overflow ancestor)
        const cs = getComputedStyle(a); if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
        const c = a.getBoundingClientRect(); L = Math.max(L, c.left); R = Math.min(R, c.right); T = Math.max(T, c.top); B = Math.min(B, c.bottom);
      }
      if (R - L < 1 || B - T < 1) continue; // (scrolled out of view)
      if (L < F.left - 2 || R > F.right + 2 || T < F.top - 2 || B > F.bottom + 2) {
        const id = e.dataset.t || e.dataset.a || e.dataset.v || '';
        out.push({ sel: `${name} header ${e.className.split(' ').filter(Boolean).slice(0, 2).join('.')}${id ? '[' + id + ']' : ''} "${e.textContent.trim().slice(0, 24)}"`, rect: [L, T, R, B].map(Math.round), frame: [F.left, F.top, F.right, F.bottom].map(Math.round) });
      }
    }
  }
  return out;
}

// R-14: page.evaluate(guideOverlap) → [{ sel, rect, card, panel }]: what the guide's objective card covers: an open
// panel's tabs, its title-row buttons and ✕, any of its buttons (the Board's Send off) or tappables (a skill node, a
// slot, a card, the Charge tag), and what the guide spotlights
// (panel: whether a panel was open, the R-14 rule; without one it is a note). Each target counts by its visible part (clipped by scrolling ancestors, as headerOutside). Empty when no
// card shows (the guide off, the card hidden or faded out). A side panel hidden behind its pair on a phone is left out.
export function guideOverlap() {
  const out = [], T = window.G?.ui?.tutorial, tut = T?.root;
  const vis = el => { for (let e = el; e && e !== document.body; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05) return false; } return true; };
  if (!tut?.classList.contains('on')) return out;
  const card = tut.querySelector('.tut-obj'); if (!card || !vis(card)) return out;
  const C = card.getBoundingClientRect(); if (C.width < 2 || C.height < 2) return out;
  const clip = (e, stop) => {
    const r = e.getBoundingClientRect(); let L = r.left, T0 = r.top, R = r.right, B = r.bottom;
    for (let a = e.parentElement; a && a !== stop && a !== document.body; a = a.parentElement) {
      const cs = getComputedStyle(a); if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
      const c = a.getBoundingClientRect(); L = Math.max(L, c.left); R = Math.min(R, c.right); T0 = Math.max(T0, c.top); B = Math.min(B, c.bottom);
    }
    return [L, T0, R, B];
  };
  const over = ([L, T0, R, B]) => Math.min(R, C.right) - Math.max(L, C.left) > 1 && Math.min(B, C.bottom) - Math.max(T0, C.top) > 1;
  const name = e => `${e.className && typeof e.className === 'string' ? '.' + e.className.split(' ').filter(Boolean).slice(0, 2).join('.') : e.tagName.toLowerCase()} "${(e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 24)}"`;
  const seen = new Set();
  const test = (e, stop, what) => {
    if (seen.has(e) || !vis(e)) return; seen.add(e);
    const r = clip(e, stop); if (r[2] - r[0] < 1 || r[3] - r[1] < 1) return;
    if (over(r)) out.push({ sel: `${what} ${name(e)}`, rect: r.map(Math.round), card: [C.left, C.top, C.right, C.bottom].map(Math.round), panel: panels.length > 0 });
  };
  const panels = [...document.querySelectorAll('.pw .panel')].filter(P => P.offsetParent && !P.closest('.closing') && !P.closest('.m-back'));
  for (const e of T.hl || []) if (e?.isConnected) test(e, null, 'spotlit');
  for (const P of panels) {
    const pn = [...P.classList].find(c => c.startsWith('p-')) || 'panel';
    for (const e of P.querySelectorAll('.tab, .ph-x, button, .btn, .slot, .node, .card, .tog, .seg button, .chg-tag, .sh-item')) test(e, P, pn); // (every tappable, as mobile-ui's target check)
  }
  return out;
}
