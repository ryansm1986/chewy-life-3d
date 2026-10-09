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
