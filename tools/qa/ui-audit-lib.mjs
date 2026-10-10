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

// R-16: page.evaluate(drawerFit) → [{ sel, rect, screen }]: the K panel's Charge drawer with each skill of each of the
// hero's trees shown in turn (its skill strip picks them): the drawer (its tag to its foot) must sit on the screen inside
// the safe area, and its strip must hold every skill on one row inside its tray. A phone's drawer is checked as the open
// sheet (it scrolls inside the panel). Leaves the panel on its first tree, the drawer on that tree's pick.
export async function drawerFit() {
  const out = [], U = window.G?.ui, S = U?.panels?.skills;
  if (!S?.isOpen || !S.chg) return out;
  const C = S.chg, d = C.el, phone = U.root.classList.contains('m-phone'), sa = U.mobile?.sf || { t: 0, r: 0, b: 0, l: 0 };
  if (phone) d.classList.add('m-open');
  const frame = () => new Promise(r => requestAnimationFrame(() => r()));
  const tabs = [...S.body.querySelectorAll('.sk-tabs .tab')].filter(t => !t.hidden).map(t => t.dataset.t), was = S.tree;
  for (const t of tabs) {
    S.setTree(t); await frame();
    for (const id of [...d.querySelectorAll('.chg-pick .chg-sk')].map(b => b.dataset.k)) {
      C.show(id); d.classList.remove('swap'); await frame();
      const r = d.getBoundingClientRect(), g = d.querySelector('.chg-tag').getBoundingClientRect(), tray = d.querySelector('.chg-pick').getBoundingClientRect();
      const top = phone ? r.top : Math.min(r.top, g.top), box = [r.left, top, r.right, r.bottom].map(Math.round);
      if (top < sa.t - 1 || r.bottom > innerHeight - sa.b + 1 || r.left < sa.l - 1 || r.right > innerWidth - sa.r + 1) out.push({ sel: `drawer ${t}/${id}`, rect: box, screen: [innerWidth, innerHeight] });
      const bs = [...d.querySelectorAll('.chg-pick .chg-sk')].map(b => b.getBoundingClientRect());
      if (bs.some(b => b.left < tray.left - 1 || b.right > tray.right + 1 || Math.abs(b.top + b.bottom - bs[0].top - bs[0].bottom) > 8)) out.push({ sel: `strip ${t}/${id} (${bs.length} skills)`, rect: [tray.left, tray.top, tray.right, tray.bottom].map(Math.round), screen: [innerWidth, innerHeight] });
    }
  }
  S.setTree(tabs.includes(was) ? was : tabs[0]); if (phone) d.classList.remove('m-open');
  return out;
}
