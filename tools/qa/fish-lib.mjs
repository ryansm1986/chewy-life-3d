// Fishing QA helpers (ROADMAP R-12, docs/HOMESTEAD.md §3): is the reel card on screen and clear of everything, is the
// bite's cue at the float, a reel played with real input (keys or a CDP finger) by a bot with a human's reaction time,
// and the balance sim's success rates run in the page (tools/fishing-sim.mjs over the game's own modules).
//   const A = await reelAudit(page)   → { card, onScreen, over: [...], hintPx, namePx, howPx, bar, hero, float, coversHero, coversFloat }
//   const C = await cueAudit(page)    → { on, kind, rect, onScreen, nearFloat, over }
//   await humanReel(page, { press, release, delay: 260 }) → 'catch' | 'escape' | 'end' (plays until the reel is over)
//   await simRates(page, { rod, relaxed, profile, N }) → [common, uncommon, rare, legendary]

/** what overlaps the reel card on screen: every painted element outside the card's own subtree (its coach callouts
 *  point at it from outside and don't count), plus whether the card covers the hero or the float */
export const reelAudit = page => page.evaluate(() => {
  const G = window.G, card = document.querySelector('.reel.show .rl-card'); if (!card) return { card: null };
  const r = card.getBoundingClientRect(), W = innerWidth, H = innerHeight, reel = document.querySelector('.reel');
  const px = e => { if (!e || e.offsetParent === null) return 0; let z = 1; for (let o = e; o && o !== document.documentElement; o = o.parentElement) z *= parseFloat(getComputedStyle(o).zoom) || 1; return +(parseFloat(getComputedStyle(e).fontSize) * z).toFixed(1); }; // (the font size on screen: through every zoom)
  const hidden = e => { for (let o = e; o && o !== document.body; o = o.parentElement) { const cs = getComputedStyle(o); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.3) return true; } return false; };
  const over = [];
  for (const e of document.querySelectorAll('.ui-root *')) {
    if (reel.contains(e) || e.contains(reel) || e.closest('.tut-call')) continue;
    const b = e.getBoundingClientRect(); if (b.width < 2 || b.height < 2 || (b.width >= W - 2 && b.height >= H - 2)) continue;
    const ix = Math.min(r.right, b.right) - Math.max(r.left, b.left), iy = Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top); if (ix <= 2 || iy <= 2) continue;
    if (hidden(e)) continue;
    const cs = getComputedStyle(e), paint = (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent') || cs.backgroundImage !== 'none' || /^(IMG|svg|CANVAS)$/i.test(e.tagName) || [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    if (paint) over.push(`${e.tagName.toLowerCase()}.${[...e.classList].join('.')} ${Math.round(ix * iy)}px²`);
  }
  const proj = v => { const p = v.clone().project(G.engine.camera); return { x: Math.round((p.x * 0.5 + 0.5) * W), y: Math.round((-p.y * 0.5 + 0.5) * H) }; };
  const P = G.player, F = G.life.fishing, hero = proj(P.pos.clone().setY(P.pos.y + 1)), float = proj(F.bobber.position);
  const inR = q => q.x > r.left && q.x < r.right && q.y > r.top && q.y < r.bottom;
  const vis = s => { const e = card.querySelector(s); return !!e && !hidden(e) && e.getBoundingClientRect().width > 0; };
  return { card: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }, onScreen: r.left >= 0 && r.top >= 0 && r.right <= W && r.bottom <= H,
    over: over.slice(0, 12), hintPx: vis('.rl-hint') ? px(card.querySelector('.rl-hint .rl-ht:not([style*="none"])') || card.querySelector('.rl-hint')) : 0, namePx: px(card.querySelector('.rl-name')),
    howPx: vis('.rl-how') ? px(card.querySelector('.rl-how .rh-t b')) : 0, howto: card.classList.contains('howto') && vis('.rl-how'), thumb: vis('.rh-dev.touch-only .rh-thumb'), key: vis('.rh-dev.kbm-only .rh-key'),
    bar: (b => ({ w: Math.round(b.width), h: Math.round(b.height) }))(card.querySelector('.rl-bar').getBoundingClientRect()),
    hero, float, coversHero: inR(hero), coversFloat: inR(float), dock: !!document.querySelector('.tut.on .tut-dock') && getComputedStyle(document.querySelector('.tut-dock')).display !== 'none', side: G.ui.reel.side };
});

/** the bite's cue at the float: on screen, close to the float's screen spot, and what covers it */
export const cueAudit = page => page.evaluate(() => {
  const G = window.G, c = document.querySelector('.fish-cue.show .fc-in'); if (!c) return { on: false };
  const parts = [...c.querySelectorAll('.fc-bang, .fc-t')].map(e => e.getBoundingClientRect()).filter(b => b.width > 0), W = innerWidth, H = innerHeight, F = G.life.fishing;
  const r = { left: Math.min(...parts.map(b => b.left)), right: Math.max(...parts.map(b => b.right)), top: Math.min(...parts.map(b => b.top)), bottom: Math.max(...parts.map(b => b.bottom)) }; r.width = r.right - r.left; r.height = r.bottom - r.top;
  const p = F.bobber.position.clone().project(G.engine.camera), fx = (p.x * 0.5 + 0.5) * W, fy = (-p.y * 0.5 + 0.5) * H;
  const over = [];
  for (const s of ['.tut.on:not(.paused) .tut-say.on', '.tut.on:not(.paused) .tut-obj', '.tut-flash.on', '.reel.show .rl-card', '.hud-tl', '.hud-tr', '.hud-bc', '.toasts > *']) for (const e of document.querySelectorAll(s)) { const b = e.getBoundingClientRect(); if (b.width && Math.min(r.right, b.right) - Math.max(r.left, b.left) > 2 && Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top) > 2) over.push(s); }
  return { on: true, kind: c.className.replace('fc-in ', ''), text: c.textContent.trim(), rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }, bangPx: Math.round(c.querySelector('.fc-bang').getBoundingClientRect().height),
    onScreen: r.left >= 0 && r.top >= 0 && r.right <= W && r.bottom <= H, nearFloat: fx > r.left - W * 0.05 && fx < r.right + W * 0.05 && fy > r.top - H * 0.12 && fy < r.bottom + H * 0.12, below: !!document.querySelector('.fish-cue.below'), over };
});

/** play the reel to its end with real input: press() / release() are the player's (a key, a finger), and they act on
 *  what the bar showed `delay` ms ago (a human's reaction), holding while the fish is above the zone's middle */
export async function humanReel(page, { press, release, delay = 260, cap = 40000 } = {}) {
  const hist = [], t0 = Date.now(); let held = false, out = 'end';
  while (Date.now() - t0 < cap) {
    const S = await page.evaluate(() => { const s = window.G.life.fishing.s; return s?.phase === 'reel' ? { f: s.sim.f, z: s.sim.z, zh: s.sim.zh, v: s.sim.v } : { phase: s?.phase || null }; });
    if (!('f' in S)) { out = S.phase === 'land' ? 'catch' : 'escape'; break; }
    const now = Date.now(); hist.push([now, S]);
    let o = hist[0][1]; for (const [t, s] of hist) { if (t <= now - delay) o = s; else break; }
    while (hist.length > 2 && hist[1][0] <= now - delay) hist.shift();
    const want = o.f > o.z + o.zh * 0.5 + o.v * 0.18;
    if (want !== held) { held = want; await (want ? press() : release()); }
  }
  if (held) await release();
  return out;
}

/** the balance sim's tier means in the page (the game's own ReelSim and fish data) */
export const simRates = (page, o = {}) => page.evaluate(async o => { const S = await import('/tools/fishing-sim.mjs'); return S.tierMeans(S.table(o)).map(v => Math.round(v * 1000) / 1000); }, o);
