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
    for (const e of P.querySelectorAll('.tab, .ph-x, button:not(.fit-more), .btn, .slot, .node, .card, .tog, .seg button, .chg-tag, .sh-item')) test(e, P, pn); // (every tappable, as mobile-ui's target check; not CT-10's scroll chevron, a hint: the body still scrolls and fades under a guide's card)
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

// CT-10: page.evaluate(panelFit) → [{ sel, rect, why }]: every open panel (not a build or decorate palette, not one
// closing or hidden behind its pair on a phone) must fit the screen's room: the safe area (the HUD layer's box: the
// Deck's margins, a notch, CT-6's itch insets) top to bottom and side to side. Its ✕, title-row buttons and tabs must be
// on the screen. Its body's content must either fit, or scroll inside it; then the body is scrolled to its foot and its
// last row (the last button, slider, card or row) must come into the body's view, so all of it can be reached (the
// body's scroll is put back after). And nothing in it may run past the panel's sides (a row of segments wider than the
// panel, as Graphics' five presets did at 1280×720), unless a row that scrolls sideways clips it. Why the Deck's Settings
// got through before CT-10: deck-ui compared panels with the bare screen only (2 px of slack), never with the room, and
// never looked at the body or the sides; it wasn't in run-all; and a browser never shows the desktop app's own rows.
export function panelFit() {
  const out = [], U = window.G?.ui; if (!U) return out;
  const vis = el => { for (let e = el; e && e !== document.body; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05) return false; } return true; };
  const S = U.layers.hud.getBoundingClientRect(), room = { t: S.top, b: S.bottom, l: S.left, r: S.right };
  for (const e of U.root.querySelectorAll('.fit-above')) { const q = e.getBoundingClientRect(); if (q.height > 1 && q.bottom < innerHeight / 2 && vis(e)) room.t = Math.max(room.t, q.bottom); } // (a bar over the panels' top: ui/fit.js room)
  const box = r => [r.left, r.top, r.right, r.bottom].map(Math.round);
  const clip = (e, stop) => {
    const r = e.getBoundingClientRect(); let L = r.left, T = r.top, R = r.right, B = r.bottom;
    for (let a = e.parentElement; a && a !== stop; a = a.parentElement) { const cs = getComputedStyle(a); if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue; const c = a.getBoundingClientRect(); L = Math.max(L, c.left); R = Math.min(R, c.right); T = Math.max(T, c.top); B = Math.min(B, c.bottom); }
    return { left: L, top: T, right: R, bottom: B };
  };
  const label = e => `${(typeof e.className === 'string' && e.className.split(' ')[0]) || e.tagName.toLowerCase()} "${(e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 22)}"`;
  for (const P of document.querySelectorAll('.pw .panel')) {
    const w = P.closest('.pw');
    if (!P.offsetParent || w.closest('.closing') || w.classList.contains('side-bottom') || w.classList.contains('m-back') || !vis(P)) continue;
    const r = P.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
    const name = [...P.classList].find(c => c.startsWith('p-')) || 'panel';
    const sel = name + (P.dataset.view ? `[${P.dataset.view}${P.dataset.view === 'controls' && P.dataset.dev ? ':' + P.dataset.dev : ''}]` : '');
    if (r.top < room.t - 1 || r.bottom > room.b + 1 || r.left < room.l - 1 || r.right > room.r + 1) out.push({ sel, rect: box(r), why: `off the room ${JSON.stringify(box({ left: room.l, top: room.t, right: room.r, bottom: room.b }))}` });
    // (the title screen draws in a higher layer: it must tuck itself away while a panel is open over it, ui/title.js)
    const TL = U.layers.title, ts = TL && getComputedStyle(TL);
    if (TL?.querySelector('.title.show') && ts.display !== 'none' && +ts.opacity > 0.05 && !TL.classList.contains('behind')) out.push({ sel, rect: box(r), why: 'the title screen draws over it' });
    for (const e of P.querySelectorAll(':scope > .ph :is(button, .tab, .btn), :scope > .pb > .tabs .tab, :scope > .pb > .sk-tabs .tab, .ctl-tabs button')) {
      if (!vis(e)) continue; const c = e.getBoundingClientRect(); if (c.width < 1 || c.height < 1) continue;
      if (c.top < -0.5 || c.bottom > innerHeight + 0.5 || c.left < -0.5 || c.right > innerWidth + 0.5) out.push({ sel: `${sel} ${label(e)}`, rect: box(c), why: 'off the screen' });
    }
    const b = P.querySelector(':scope > .pb'); if (!b) continue;
    const z = b.currentCSSZoom || 1, scrolls = /auto|scroll/.test(getComputedStyle(b).overflowY);
    if (b.scrollHeight > b.clientHeight + 2) {
      if (!scrolls) out.push({ sel, rect: box(b.getBoundingClientRect()), why: `its body's content (${Math.round(b.scrollHeight * z)} px) is cut off: it doesn't scroll` });
      else { // scrolled to its foot, its last row shows
        // (a list that scrolls on its own inside the body, Controls' bindings, goes to its foot too)
        const nest = [...b.querySelectorAll('*')].filter(e => e.scrollHeight > e.clientHeight + 2 && /auto|scroll/.test(getComputedStyle(e).overflowY)), was = [b, ...nest].map(e => e.scrollTop);
        for (const e of [b, ...nest]) e.scrollTop = e.scrollHeight;
        const items = [...b.querySelectorAll('button, input[type=range], .slot, .card, .node, .set-row, .ctl-row, .tab')].filter(e => vis(e) && e.getBoundingClientRect().height > 1);
        let last = null, lb = -1e9; for (const e of items) { const y = e.getBoundingClientRect().bottom; if (y > lb) { lb = y; last = e; } }
        const br = clip(b, P);
        if (last && (lb > br.bottom + 2 || lb > room.b + 1)) out.push({ sel: `${sel} last row ${label(last)}`, rect: box(last.getBoundingClientRect()), why: `out of reach at the body's foot ${JSON.stringify(box(br))}` });
        [b, ...nest].forEach((e, i) => { e.scrollTop = was[i]; });
      }
    } else if (!scrolls && b.getBoundingClientRect().top + b.scrollHeight * z > room.b + 2) out.push({ sel, rect: box(b.getBoundingClientRect()), why: 'its body runs past the room' });
    // nothing past the panel's sides (inside its border), unless a sideways-scrolling row clips it
    const bw = (parseFloat(getComputedStyle(P).borderLeftWidth) || 0) * (P.currentCSSZoom || 1), iL = r.left + bw - 2, iR = r.right - bw + 2;
    for (const e of b.querySelectorAll('.set-row > *, .seg, .sld, .tog, .btn, .tab')) {
      if (!vis(e)) continue; const c = clip(e, P); if (c.right - c.left < 1 || c.bottom - c.top < 1) continue;
      if (c.left < iL || c.right > iR) { out.push({ sel: `${sel} ${label(e)}`, rect: box(c), why: `past the panel's side ${JSON.stringify([Math.round(iL), Math.round(iR)])}` }); break; }
    }
  }
  return out;
}

// CT-10: page.evaluate(hudOverlap) → [{ a, b, ra, rb }]: the HUD's pieces, and what floats over the play area (the
// toasts, the saving glyph, the level badges, the crews and run chips, the prompt, the pad's glyph footer, the FPS line),
// must not overlap one another or run off the screen (b 'screen' when off it). The orbs sit in the dock's ends by
// design; a touch cluster's buttons are one group. Why the Deck's bottom right got through: no audit set the HUD's
// pieces against each other. At the Deck's 1.15 UI the bottom-right buttons sat on the mana orb, and the pad's glyph
// footer, beside a panel as tall as the screen, sat on the hotbar.
export function hudOverlap() {
  const out = [], U = window.G?.ui; if (!U || U.mode === 'title' || U.root.classList.contains('m-portrait')) return out; // (portrait: the rotate card covers it all)
  const vis = el => { for (let e = el; e && e !== document.body; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.3) return false; } return true; };
  const ITEMS = [
    ['orb', '.l-hud .hud-bc .orb-slot'], ['dock', '.l-hud .hud .dock'], ['badge', '.l-hud .lvb.on'], ['menu-buttons', '.l-hud .hud-br .menubtns'], ['demand', '.l-hud .hud-br .rci'], ['build', '.l-hud .hud-br .build-btn'],
    ['minimap', '.l-hud .hud-tr .mm-wrap'], ['portrait', '.l-hud .hud-tl .pcard'], ['quests', '.l-hud .qtrack'], ['coins', '.l-hud .hud-res'], ['clock', '.l-hud .loc'],
    ['toast', '.toasts .toast'], ['saving', '.save-glyph.on'], ['crews', '.cz-chip.on'], ['run', '.run-chip.on'], ['prompt', '.l-hud .prompt.show'], ['pad-hints', '.pad-hints.on'], ['fps', '.fps.show'],
    ['touch', '.tc .tc-b'],
  ];
  const ALLOW = new Set(['orb|dock', 'dock|orb']);
  // (what draws over the panels: a HUD piece under an open panel is hidden there, so a toast or the pad's footer over
  // that part of it is fine)
  const OVER = new Set(['toast', 'pad-hints', 'fps']), panels = [...document.querySelectorAll('.pw .panel')].filter(P => P.offsetParent && !P.closest('.closing') && vis(P)).map(P => P.getBoundingClientRect());
  const hidden = (L, T, R, B) => panels.some(p => L >= p.left - 1 && R <= p.right + 1 && T >= p.top - 1 && B <= p.bottom + 1);
  const its = [];
  for (const [g, q] of ITEMS) for (const e of document.querySelectorAll(q)) {
    if (!vis(e)) continue; const r = e.getBoundingClientRect(); if (r.width < 3 || r.height < 3) continue;
    if (g === 'toast' && (getComputedStyle(e).animationName === 'toastOut' || e.getAnimations?.().some(x => x.playState === 'running' && x.effect?.getComputedTiming?.().progress < 1))) continue; // (one sliding in or out: in a moment it's in place, or gone)
    its.push({ g, n: g === 'toast' ? `toast "${e.textContent.replace(/\s+/g, ' ').trim().slice(0, 22)}"` : g === 'orb' ? `orb ${e.classList.contains('l') ? 'left' : 'right'}` : g === 'badge' ? `badge "${e.textContent.trim().slice(0, 12)}"` : g, r });
  }
  const box = r => [r.left, r.top, r.right, r.bottom].map(Math.round);
  for (const a of its) if (a.r.left < -1 || a.r.top < -1 || a.r.right > innerWidth + 1 || a.r.bottom > innerHeight + 1) out.push({ a: a.n, b: 'screen', ra: box(a.r), rb: [0, 0, innerWidth, innerHeight] });
  for (let i = 0; i < its.length; i++) for (let j = i + 1; j < its.length; j++) {
    const a = its[i], b = its[j]; if (a.g === b.g || ALLOW.has(a.g + '|' + b.g)) continue;
    const ox = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left), oy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
    if (!(ox > 3 && oy > 3)) continue;
    if (OVER.has(a.g) !== OVER.has(b.g) && hidden(Math.max(a.r.left, b.r.left), Math.max(a.r.top, b.r.top), Math.min(a.r.right, b.r.right), Math.min(a.r.bottom, b.r.bottom))) continue;
    out.push({ a: a.n, b: b.n, ra: box(a.r), rb: box(b.r) });
  }
  return out;
}
