// S27 touch (docs/CONTROLS.md §12, ROADMAP CT-5): a phone in landscape (844×390 at DPR 3, hasTouch, isMobile) driven by
// real multi-touch (CDP Input.dispatchTouchEvent: tools/qa/touch-lib.mjs).
//  a) the touch device: a touch-first screen starts on touch (body.touch-active), the HUD's hotbar slots and belt move
//     into the touch buttons, the key caps and mouse / pad hints hide; every touch button is at least 44 px
//  b) the floating stick: it walks along the camera (analogue: a small push is slower), sprints at its edge, stops on
//     release; a tap on the ground walks there; a tap on a villager walks over and talks; two fingers pinch the zoom
//  c) a Burrow fight: a tap on a monster locks it (ring, target frame); the attack button attacks the lock; every skill
//     button casts; a hold charges and letting go fires charged; the roll button rolls; Drag aim: a drag off a skill
//     shows the ground mark and casts toward the drag, back onto the button cancels
//  d) the belt (potions, the quick meal), the weapon-set badge, the prompt tap, the attack button talking (A), the hero
//     button (a tap: the next hero; a hold: the wheel, then a tap on a card), the bag and menu buttons
//  f) the menus on a phone: the bag fits (its bar at the bottom), a finger drags an item, tap-to-move, a double-tap
//     equips, a long press shows details; the shop (a long press shows, a tap buys, the bag flips); the K panel (a tap
//     learns, the charge drawer folds); dialogue (taps read on, 44 px choices)
//  g) build mode (a tab and a card by touch, a tap puts the ghost, Turn and Build, Cancel, a drag pans, Done) and
//     decorate (pick, slide, Set down, Undo, Done)
//  h) fishing: the attack button casts, a touch strikes, the held screen reels
//  i) portrait: the rotate overlay, the game paused   j) the Mobile preset picked itself
//  e) back to the mouse: the slots go home to the hotbar and the touch layer hides; a touch brings them back
//  k) an iPad (CT-6; 1180×820 at DPR 2, iPad Safari's agent): the page's gesture guards (Safari's gesture events, a
//     two-finger touchmove, a double-click are cancelled; touch-action, no selection, no pull-to-refresh); zoomed in
//     (CDP page scale 2): the viewport reset is tried, then the "zoomed in?" card pauses and lets a pinch through, and goes
//     at scale 1; full screen on the first tap, nothing to touch in the top 24 px and no stick from there; full screen
//     closed: the card pauses, a tap goes back, "Stay in a window" is remembered, a third close in a minute stops asking;
//     the itch.io buttons setting (Top) moves the HUD down; a save on pagehide; portrait shows the rotate card
import { launchTouch, boot, waitMode, sleep, makeReport, center, IPAD } from './touch-lib.mjs';

const R = makeReport('S27 touch: the touch device, stick, taps, pinch, attack, skills, charge, drag-aim, roll, belt, heroes, menus');
const { browser, page, errors, warns, F } = await launchTouch();
const ev = (f, a) => page.evaluate(f, a);
const wait = (f, a, timeout = 8000) => page.waitForFunction(f, a, { timeout, polling: 'raf' }).then(() => true, () => false);
const spy = () => ev(() => {
  const G = window.G;
  window.__casts = []; window.__ev = [];
  if (!G.skills.__spied) {
    G.skills.__spied = true;
    const rc = G.skills.tryCast.bind(G.skills);
    G.skills.tryCast = (i, a, t, c) => { const x = rc(i, a, t, c); window.__casts.push({ id: i, ok: !!x, stage: c?.stage || 0, lock: !!t && t === G.padAim?.lock, tgt: t?.name || null, aim: a ? [+a.x.toFixed(2), +a.z.toFixed(2)] : null }); return x; };
    for (const n of ['charge:start', 'charge:stage', 'charge:release', 'charge:cancel', 'player:roll', 'meal:eaten', 'hero:wheel', 'ui:open', 'ui:close', 'input:device']) G.events.on(n, p => window.__ev.push([n, p?.stage ?? p?.name ?? p?.device ?? p?.open ?? '']));
  }
});
const calm = () => ev(() => { const G = window.G; G.skills.cds = {}; G.skills.queued = null; G.skills.approach = null; G.player.moveTarget = null; G.player.interactTarget = null; G.player.anim.stop(); G.player.leap = null; G.player.dash = null; G.player.rollT = 0; G.player.rollCd = 0; G.actions.restoreAll(); window.__casts = []; window.__ev = []; });
const pos = () => ev(() => { const P = window.G.player; return [P.pos.x, P.pos.z]; });
const openSpot = () => ev(() => { // the plaza's open middle
  const G = window.G, W = G.world, c = W.landmarks.plaza;
  const open = (x, z) => W.walkable(x, z) && !W.collision.solidAt(x, z, 0.8) && !G.sim.buildingAt(x, z);
  for (let r = 0; r < 40; r += 1.5) for (let a = 0; a < 12; a++) { const x = c.x + Math.cos(a / 6 * Math.PI) * r, z = c.z + 4 + Math.sin(a / 6 * Math.PI) * r; let ok = true; for (let s = -7; s <= 7 && ok; s += 1) for (let t = -7; t <= 7 && ok; t += 1) if (!open(x + s, z + t)) ok = false; if (ok) { G.player.setPos(x, z); G.engine.rig.focus.copy(G.player.pos); G.engine.rig.snap(); return [x, z]; } }
  return null;
});
const C = sel => center(page, sel);
const tapEl = async sel => { const c = await C(sel); if (!c) return false; await F.tap(c.x, c.y); return true; };
const innerW = k => Math.round(844 * k), innerH = k => Math.round(390 * k);
const nudge = async () => { await F.drag(150, 300, 150, 324, { steps: 3 }); await sleep(page, 150); }; // (a touch that is a short stick push, not a tap on the world: touch plays again)

let ipadClose = null;
async function ipadChecks() {
  const T = await launchTouch(IPAD), p = T.page, F2 = T.F, cdp = T.cdp;
  ipadClose = () => T.browser.close();
  const e2 = (f, a) => p.evaluate(f, a);
  const w2 = (f, a, timeout = 8000) => p.waitForFunction(f, a, { timeout, polling: 'raf' }).then(() => true, () => false);
  const shots = 'tools/qa/tmp/ct6';
  (await import('node:fs')).mkdirSync(shots, { recursive: true });
  await boot(p, 'fresh&nointro&notut&fs'); // (?fs: full screen on the first tap under automation too)
  await e2(() => { window.G.state.flags.hints = { all: true }; window.G.ui.toasts?.retire?.(0); });
  await w2(() => document.querySelector('.tc.on'));
  // the page's gesture guards
  const g = await e2(() => {
    const cv = document.querySelector('#game'), ge = new Event('gesturestart', { cancelable: true }); document.dispatchEvent(ge);
    let two = null; try { const t = (id, x) => new Touch({ identifier: id, target: cv, clientX: x, clientY: 300 }); const e = new TouchEvent('touchmove', { cancelable: true, bubbles: true, touches: [t(1, 300), t(2, 600)] }); cv.dispatchEvent(e); two = e.defaultPrevented; } catch (x) { two = 'n/a ' + x.message; }
    const dc = new MouseEvent('dblclick', { cancelable: true, bubbles: true }); document.querySelector('.mm-wrap').dispatchEvent(dc);
    const h = getComputedStyle(document.documentElement), b = getComputedStyle(document.body);
    return { gesture: ge.defaultPrevented, two, dbl: dc.defaultPrevented, ta: [h.touchAction, b.touchAction, getComputedStyle(cv).touchAction, getComputedStyle(document.querySelector('.ui-root')).touchAction], sel: b.userSelect, overscroll: h.overscrollBehaviorY, pinchOk: document.documentElement.classList.contains('pinch-ok') };
  });
  R.check("iPad: the page cancels Safari's gesture events, a two-finger touchmove and a double-tap; no pinch or double-tap zoom (touch-action), no selection, no pull-to-refresh", g.gesture && g.two === true && g.dbl && g.ta[0] === 'pan-x pan-y' && g.ta[1] === 'pan-x pan-y' && g.ta[2] === 'none' && g.sel === 'none' && g.overscroll === 'none' && !g.pinchOk, JSON.stringify(g));
  // zoomed in: the viewport reset, then the card (paused, the pinch let through), gone at scale 1. Chrome keeps the page at
  // scale 1 (it honours maximum-scale=1, so CDP's page scale is clamped), so visualViewport is a mock of Safari zoomed 2x
  const zoom = k => e2(k => {
    const real = window.__realVV || (window.__realVV = { d: Object.getOwnPropertyDescriptor(window, 'visualViewport') || Object.getOwnPropertyDescriptor(Window.prototype, 'visualViewport'), on: window.visualViewport });
    if (k === 1) { if (real.d) Object.defineProperty(window, 'visualViewport', { ...real.d, configurable: true }); real.on.dispatchEvent(new Event('resize')); return visualViewport.scale; }
    const m = new EventTarget(); Object.assign(m, { scale: k, width: innerWidth / k, height: innerHeight / k, offsetLeft: innerWidth * 0.2, offsetTop: innerHeight * 0.25, pageLeft: innerWidth * 0.2, pageTop: innerHeight * 0.25 });
    Object.defineProperty(window, 'visualViewport', { configurable: true, get: () => m }); return m.scale;
  }, k);
  await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 }).catch(() => {});
  await zoom(2);
  const zOn = await w2(() => window.G.ui.mobile.hold === 'zoom', null, 6000);
  const z1 = await e2(() => { const M = window.G.ui.mobile, c = document.querySelector('.mh-zoom').getBoundingClientRect(), vv = visualViewport; return { scale: vv.scale, resets: M.zoomResets || 0, paused: window.G.ui.isPaused(), pinchOk: document.documentElement.classList.contains('pinch-ok'), card: c.width > 0, inView: c.left >= vv.offsetLeft - 1 && c.right <= vv.offsetLeft + vv.width + 1 && c.top >= vv.offsetTop - 1 && c.bottom <= vv.offsetTop + vv.height + 1 }; });
  await p.screenshot({ path: shots + '/zoom-card.png' });
  await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 }).catch(() => {});
  await zoom(1);
  const zOff = await w2(() => !window.G.ui.mobile.hold && !document.documentElement.classList.contains('pinch-ok') && !window.G.ui.isPaused(), null, 6000);
  R.check('iPad zoomed in (page scale 2): the viewport reset is tried, then the "zoomed in?" card fits the zoomed view, pauses and lets a pinch through; back at scale 1 it goes and play resumes', zOn && z1.scale > 1.5 && z1.resets >= 1 && z1.paused && z1.pinchOk && z1.card && z1.inView && zOff, JSON.stringify({ zOn, z1, zOff }));
  // full screen on the first tap; the top 24 px
  await F2.tap(900, 420); await sleep(p, 200);
  const fsIn = await w2(() => !!document.fullscreenElement && window.G.ui.mobile.fsNow && window.G.ui.mobile.edgeTop === 24, null, 6000);
  await w2(() => window.G.ui.touch.layoutT > 3.5, null, 3000);
  const top = await e2(() => { const els = [...document.querySelectorAll('.mm-wrap, .tc .tc-b, .hud-tl .qt, .hud-tl [class*="tog"], .run-chip')].filter(e => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 0 && !e.closest('[hidden]') && cs.visibility !== 'hidden' && cs.display !== 'none'; }); return { n: els.length, minTop: Math.round(Math.min(...els.map(e => e.getBoundingClientRect().top))), saT: window.G.ui.mobile.sf.t }; });
  await F2.down(5, 160, 8); await F2.frame(); await F2.move(5, 160, 160, 6);
  const noStick = await e2(() => !window.G.ui.touch.stickP && !window.G.ui.touch.T.stick.on);
  await F2.up(5); await sleep(p, 150);
  R.check('iPad: the first tap goes full screen; in full screen nothing to touch sits in the top 24 px and a drag down from the top edge starts no stick', fsIn && top.n >= 8 && top.minTop >= 24 && top.saT >= 24 && noStick, JSON.stringify({ fsIn, top, noStick }));
  // full screen closed: the card, a tap back, Stay in a window
  await e2(() => document.exitFullscreen());
  const c1 = await w2(() => window.G.ui.mobile.hold === 'fs' && window.G.ui.isPaused(), null, 6000);
  await p.screenshot({ path: shots + '/fs-card.png' });
  const go = await center(p, '.mh-fs [data-a="fs"]');
  if (go) await F2.tap(go.x, go.y);
  const back = await w2(() => !!document.fullscreenElement && !window.G.ui.mobile.hold && !window.G.ui.isPaused(), null, 6000);
  await e2(() => document.exitFullscreen());
  const c2 = await w2(() => window.G.ui.mobile.hold === 'fs', null, 6000);
  const stay = await center(p, '.mh-fs [data-a="window"]');
  if (stay) await F2.tap(stay.x, stay.y);
  const kept = await w2(() => !window.G.ui.mobile.hold && window.G.ui.settings.touchFs === 1 && !window.G.ui.isPaused(), null, 4000);
  const remembered = await e2(() => { const M = window.G.ui.mobile; M.fsWas = true; M.fsCheck(); return M.hold === null; });
  R.check('iPad: full screen closed mid-play pauses under "Back to full screen?"; one tap goes back and play resumes; "Stay in a window" is remembered (no card the next time)', c1 && !!go && back && c2 && !!stay && kept && remembered, JSON.stringify({ c1, go: !!go, back, c2, stay: !!stay, kept, remembered }));
  const loop = await e2(() => { const U = window.G.ui, m = U.mobile; U.setSetting('touchFs', 0); m.fsLosses = []; m.fsMuted = false; const seen = []; for (let i = 0; i < 3; i++) { m.fsWas = true; m.fsCheck(); seen.push(m.hold); m.setHold(null); } return { seen, muted: !!m.fsMuted }; });
  R.check('iPad: never a loop: a third full-screen close within a minute stops asking for this visit', loop.seen[0] === 'fs' && loop.seen[1] === 'fs' && loop.seen[2] === null && loop.muted, JSON.stringify(loop));
  // the itch.io buttons setting: Top keeps the top 100 px clear, Auto off itch keeps nothing
  await e2(() => window.G.ui.setSetting('itchInset', 1));
  await w2(() => window.G.ui.mobile.sf.t >= 100, null, 3000); await w2(() => window.G.ui.touch.layoutT > 3.5, null, 3000);
  const it1 = await e2(() => ({ itch: window.G.ui.mobile.itch, t: window.G.ui.mobile.sf.t, mm: Math.round(document.querySelector('.mm-wrap').getBoundingClientRect().top), bag: Math.round(document.querySelector('.tc-bag').getBoundingClientRect().top) }));
  await p.screenshot({ path: shots + '/itch-top.png' });
  await e2(() => window.G.ui.setSetting('itchInset', 0));
  await w2(() => window.G.ui.mobile.sf.t < 1, null, 3000);
  const it0 = await e2(() => ({ t: window.G.ui.mobile.sf.t, r: window.G.ui.mobile.sf.r }));
  R.check("iPad: Settings › Controls › Touch › itch.io buttons: Top keeps the top 100 px clear (minimap, hero / bag / menu move down); Auto on the game's own page keeps nothing", !it1.itch && it1.t >= 100 && it1.mm >= 100 && it1.bag >= 100 && it0.t < 1 && it0.r < 1, JSON.stringify({ it1, it0 }));
  // a save on pagehide (Safari doesn't always send beforeunload)
  const sv = await e2(() => { localStorage.setItem('chewy3d.save', 'x'); dispatchEvent(new Event('pagehide')); try { const v = JSON.parse(localStorage.getItem('chewy3d.save')); return !!v && typeof v === 'object' && !!v.flags; } catch (e) { return false; } });
  R.check('iPad: the game saves on pagehide', sv, JSON.stringify({ sv }));
  // portrait: the rotate card
  await p.setViewportSize({ width: 820, height: 1180 });
  const pr = await w2(() => window.G.ui.mobile.portrait && window.G.ui.isPaused() && getComputedStyle(document.querySelector('.m-rotate')).display !== 'none', null, 4000);
  await p.setViewportSize({ width: 1180, height: 820 });
  const pr2 = await w2(() => !window.G.ui.mobile.portrait && !window.G.ui.isPaused(), null, 4000);
  R.check('iPad portrait shows the rotate card and pauses; back in landscape it plays on', pr && pr2, JSON.stringify({ pr, pr2 }));
  errors.push(...T.errors.map(e => '[ipad] ' + e));
}

const ONLY_K = new Error('S27_ONLY=k: the iPad section alone');
try {
  if (process.env.S27_ONLY === 'k') throw ONLY_K;
  await boot(page, 'fresh&nointro&notut');
  await ev(() => {
    const G = window.G, st = G.state;
    st.flags.burrowTut = true; st.flags.hints = { all: true };
    st.potions = { heart: 5, zoom: 5, rejuv: 1 };
    const pl = st.player; pl.lvl = 30; for (const id of ['chomp', 'packcall', 'blaze', 'decoy', 'moonhowl', 'whirl']) pl.skills[id] = 5;
    pl.hotbar = ['attack', 'chomp', 'blaze', 'packcall', 'decoy', 'moonhowl'];
    G.actions.recompute(); G.actions.restoreAll();
    st.flags.mokaJoined = true; const v = G.heroes.villagers.moka; if (v) { v.frozen = false; v.waitingToJoin = false; }
    const T = (st.flags.tutorials ||= {}); for (const id of ['house', 'switch', 'fishing', 'makeHome', 'remodel', 'charge', 'meetPoe']) T[id] = { done: true };
    G.heroes.joinPoe?.();
    G.ui.toasts?.retire?.(0);
  });
  await sleep(page, 500);
  await spy();

  // ================================================================ a) the touch device
  const a0 = await ev(() => {
    const T = document.querySelector('.tc'), sz = [...document.querySelectorAll('.tc .tc-b, .tc-belt > .belt')].filter(e => e.offsetParent && getComputedStyle(e).display !== 'none').map(e => { const r = e.getBoundingClientRect(), ext = e.classList.contains('tc-b') ? 16 : 0; return Math.round(Math.min(r.width, r.height) + ext); }); // (.tc-b::after reaches 8 px past the edge)
    return { dev: window.G.controls.device, body: document.body.classList.contains('touch-active'), on: T.classList.contains('on'), slotsIn: document.querySelectorAll('.tc-slot > .hb').length, hotbarLeft: document.querySelectorAll('.hud .hotbar .hb').length, beltIn: document.querySelectorAll('.tc-belt > .belt').length,
      caps: [...document.querySelectorAll('.hud [data-act], .tc [data-act]')].filter(e => e.offsetParent && getComputedStyle(e).display !== 'none').length, kbmOnly: [...document.querySelectorAll('.kbm-only')].filter(e => e.offsetParent).length,
      menubtns: getComputedStyle(document.querySelector('.hud-br')).display, minSize: Math.min(...sz), n: sz.length };
  });
  R.check('a touch-first phone starts on touch: body.touch-active, the controls up, the hotbar slots and belt moved in, no key caps or mouse hints, the HUD menu row hidden', a0.dev === 'touch' && a0.body && a0.on && a0.slotsIn === 6 && a0.hotbarLeft === 0 && a0.beltIn === 4 && a0.caps === 0 && a0.kbmOnly === 0 && a0.menubtns === 'none', JSON.stringify(a0));
  R.check('every touch button is at least 44 px', a0.minSize >= 44 && a0.n >= 12, JSON.stringify({ min: a0.minSize, n: a0.n }));

  // ================================================================ b) the stick, taps, pinch
  await openSpot(); await calm();
  const fwd = await ev(() => { const { f } = window.G.engine.rig.groundAxes(); return [f.x, f.z]; });
  const stick = async (dx, dy, ms) => { const a = await pos(); await F.down(1, 150, 290); await F.frame(); await F.move(1, 150 + dx, 290 + dy, 4); await sleep(page, ms); const mid = await ev(() => ({ sprint: window.G.player.sprint.on, live: document.querySelector('.tc-stick').classList.contains('live'), sring: document.querySelector('.tc-stick').classList.contains('sprint') })); await F.up(1); await sleep(page, 120); const b = await pos(); return { a, b, d: Math.hypot(b[0] - a[0], b[1] - a[1]), ...mid }; };
  const full = await stick(0, -52, 700);
  const dot = ((full.b[0] - full.a[0]) * fwd[0] + (full.b[1] - full.a[1]) * fwd[1]) / Math.max(1e-6, full.d);
  await openSpot();
  const small = await stick(0, -18, 700);
  const after = await ev(() => ({ mag: window.G.controls.move().mag, rest: document.querySelector('.tc-stick').classList.contains('rest') }));
  R.check('the stick walks along the camera, analogue (a small push is slower), and lets go cleanly', full.d > 2 && dot > 0.95 && small.d > 0.2 && small.d < full.d * 0.7 && full.live && after.mag === 0 && after.rest, JSON.stringify({ full: +full.d.toFixed(2), small: +small.d.toFixed(2), dot: +dot.toFixed(3), after }));
  await openSpot(); await calm();
  const sp = await stick(0, -100, 700);
  R.check('pushing the stick out to its ring sprints (the ring lights)', sp.sprint && sp.sring, JSON.stringify(sp));
  await openSpot(); await calm();
  const g0 = await pos();
  await F.tap(560, 150); await sleep(page, 900);
  const g1 = await ev(([p]) => ({ mt: !!window.G.player.moveTarget, moved: +Math.hypot(window.G.player.pos.x - p[0], window.G.player.pos.z - p[1]).toFixed(2), ping: document.querySelectorAll('.tc-ping').length }), [g0]);
  R.check('a tap on the ground walks there (with a ping)', g1.moved > 1, JSON.stringify(g1));
  const z0 = await ev(() => window.G.engine.rig.distTarget);
  await F.pinch(560, 200, 80, 220); await sleep(page, 200);
  const z1 = await ev(() => window.G.engine.rig.distTarget);
  await F.pinch(560, 200, 220, 80); await sleep(page, 200);
  const z2 = await ev(() => window.G.engine.rig.distTarget);
  R.check('two fingers pinch the zoom: apart closer, together further', z1 < z0 - 2 && z2 > z1 + 2, JSON.stringify({ z0: +z0.toFixed(1), z1: +z1.toFixed(1), z2: +z2.toFixed(1) }));
  // a tap on a villager: walk over and talk
  await ev(() => { const G = window.G, Ro = G.npcs.find(n => n.id === 'rosie'); Ro.talking = false; Ro.state = 'idle'; Ro.wander = 0; G.player.setPos(Ro.pos.x + 3.2, Ro.pos.z + 2.2); G.engine.rig.focus.copy(G.player.pos); G.engine.rig.snap(); G.interactCooldown = 0; });
  await sleep(page, 300);
  const ro = await ev(() => { const G = window.G, Ro = G.npcs.find(n => n.id === 'rosie'), v = Ro.pos.clone().setY(Ro.pos.y + 0.6).project(G.engine.camera); return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight }; });
  await F.tap(ro.x, ro.y);
  const talked = await wait(() => window.G.ui.dlg.active, null, 6000);
  R.check('a tap on a villager walks over and talks', talked, JSON.stringify(ro));
  // dialogue: a tap advances (CT-5 menus), else drain with Escape
  for (let i = 0; i < 30 && await ev(() => window.G.ui.dlg.active); i++) { await page.keyboard.press('Escape'); await sleep(page, 250); }
  await ev(() => window.G.ui.closeAll()); await sleep(page, 200);
  await nudge(); // (back to touch after the key presses)

  // ================================================================ c) a Burrow fight
  await ev(() => window.G.enterDungeon(1));
  await waitMode(page, 'dungeon');
  await sleep(page, 700);
  await spy();
  const setFoe = (dist = 4, side = 0) => ev(([dist, side]) => {
    const G = window.G, P = G.player, D = G.dungeon;
    for (const m of D.monsters) { m.status.stun = 999; m.pos.set(-999, 0, -999); m.sync?.(); }
    const { f, r } = G.engine.rig.groundAxes();
    const m = D.monsters.find(x => x.alive && !x.isBoss && x.def?.id !== 'boss') || D.monsters[0];
    m.lifeMax = m.life = 1e7; m.status.stun = 999; m.speed = 0;
    m.pos.set(P.pos.x + f.x * dist + r.x * side, P.pos.y, P.pos.z + f.z * dist + r.z * side); m.sync?.();
    window.__foe = m;
    P.faceTo(m.pos.x, m.pos.z); P.facing = P.faceTarget;
    G.engine.rig.focus.copy(P.pos); G.engine.rig.snap();
    return m.name;
  }, [dist, side]);
  const foeXY = () => ev(() => { const G = window.G, m = window.__foe, v = m.pos.clone().setY(m.pos.y + 0.4).project(G.engine.camera); return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight }; });
  await setFoe(5, 3); await calm(); await sleep(page, 250);
  await calm(); await setFoe(5, 3); await sleep(page, 250);
  const fx = await foeXY();
  await F.tap(fx.x, fx.y); await sleep(page, 250);
  const lk = await ev(() => { const A = window.G.padAim; return { lock: A.lock === window.__foe, manual: A.manual === window.__foe, ring: !!A.ring && A.ring.parent === window.G.world.scene && A.ring.visible, target: document.querySelector('.hud .target')?.classList.contains('show') }; });
  R.check('a tap on a monster locks it (its ring, the target frame), wherever the facing', lk.lock && lk.manual && lk.ring && lk.target, JSON.stringify({ fx, ...lk }));
  // the attack button at the lock (a melee lock 5.8 m off: it walks up and swings)
  await calm();
  const atk = await C('.tc-attack');
  await F.tap(atk.x, atk.y);
  await wait(() => window.__casts.some(c => c.id === 'attack' && c.ok), null, 4000);
  const ac = await ev(() => window.__casts.filter(c => c.id === 'attack'));
  R.check('the attack button attacks the locked foe (walking up to it first)', ac.some(c => c.ok && c.lock), JSON.stringify(ac.slice(0, 3)));
  // every skill button (Auto aim: at the lock)
  await setFoe(3); await calm(); await sleep(page, 150);
  const hb = await ev(() => window.G.state.player.hotbar.slice()), got = {};
  for (let i = 1; i <= 5; i++) {
    await calm(); await sleep(page, 80);
    await tapEl(`.tc-slot[data-slot="${i}"]`);
    await wait(id => window.__casts.some(c => c.id === id && c.ok), hb[i], 3000);
    got[i] = await ev(id => window.__casts.find(c => c.id === id && c.ok) || window.__casts[0] || null, hb[i]);
  }
  R.check('each skill button casts its slot (Auto aim: at the lock)', [1, 2, 3, 4, 5].every(i => got[i]?.id === hb[i] && got[i].ok), JSON.stringify(got));
  // hold to charge: Blaze (slot 2) held past Stage I, then let go; the ring fills on the button
  await setFoe(4); await calm();
  const bz = await C('.tc-slot[data-slot="2"]');
  await F.down(3, bz.x, bz.y);
  const st1 = await wait(() => (window.G.skills.charge.active?.stage || 0) >= 1, null, 6000);
  const ring = await ev(() => { const h = document.querySelector('.tc-slot[data-slot="2"] .hb'); return { charging: h.classList.contains('charging'), ring: +getComputedStyle(h.querySelector('.tc-ring')).opacity, k: h.style.getPropertyValue('--k') }; });
  await F.up(3);
  await wait(() => window.__ev.some(e => e[0] === 'charge:release'), null, 3000);
  const ch = await ev(() => ({ ev: window.__ev.filter(e => e[0].startsWith('charge:')).map(e => e.join(':')), casts: window.__casts.filter(c => c.stage > 0).map(c => c.id + '@' + c.stage) }));
  R.check('holding a skill button charges it (the ring fills round the button) and letting go fires it charged', st1 && ring.charging && ring.ring > 0.5 && ch.ev.some(e => /^charge:release:[123]/.test(e)) && ch.casts.some(c => c.startsWith('blaze@')), JSON.stringify({ ring, ch }));
  // roll
  await calm();
  await tapEl('.tc-roll');
  const rl = await ev(() => ({ rolls: window.__ev.filter(e => e[0] === 'player:roll').length }));
  R.check('the roll button rolls', rl.rolls === 1, JSON.stringify(rl));
  // Drag aim: a foe off to the right; a drag off the skill toward it; the ground mark; the cast goes that way
  await ev(() => window.G.ui.setSetting('touchAim', 1));
  await setFoe(4, 0); await calm(); await sleep(page, 200);
  await ev(() => { const G = window.G, m2 = G.dungeon.monsters.find(x => x.alive && x !== window.__foe && !x.isBoss); const P = G.player, { f, r } = G.engine.rig.groundAxes(); m2.lifeMax = m2.life = 1e7; m2.status.stun = 999; m2.speed = 0; m2.pos.set(P.pos.x + r.x * 5, P.pos.y, P.pos.z + r.z * 5); m2.sync?.(); window.__foe2 = m2; G.padAim.manual = null; });
  await sleep(page, 200);
  const s1 = await C('.tc-slot[data-slot="1"]');
  await F.down(4, s1.x, s1.y); await F.frame();
  await F.move(4, s1.x + 90, s1.y, 6); await sleep(page, 200);
  const dm = await ev(() => { const G = window.G, M = G.scene ? null : G.world.scene.getObjectByName('touchAimMark'); return { mark: !!M && M.visible, aiming: document.querySelector('.tc-slot[data-slot="1"]').classList.contains('aiming'), lock: G.padAim.lock === window.__foe2, aim: G.controls.aim().mag > 0 }; });
  await F.up(4);
  await wait(() => window.__casts.some(c => c.ok), null, 3000);
  const dc = await ev(() => window.__casts.find(c => c.ok) || null);
  const hb1 = await ev(() => window.G.state.player.hotbar[1]);
  R.check('Drag aim: dragging off a skill shows the ground mark and aims (the lock jumps to the foe that way); letting go casts there', dm.mark && dm.aiming && dm.aim && dm.lock && dc?.id === hb1 && dc.lock && dc.tgt === (await ev(() => window.__foe2.name)), JSON.stringify({ dm, dc, hb1 }));
  await calm(); await sleep(page, 150);
  await F.down(5, s1.x, s1.y); await F.frame();
  await F.move(5, s1.x + 90, s1.y - 20, 5); await sleep(page, 100);
  await F.move(5, s1.x + 4, s1.y + 2, 5); await sleep(page, 120);
  const cx = await ev(() => document.querySelector('.tc-slot[data-slot="1"]').classList.contains('cancel'));
  await F.up(5); await sleep(page, 300);
  const cc = await ev(() => window.__casts.filter(c => c.ok).length);
  R.check('Drag aim: back onto the button shows the cross and letting go there casts nothing', cx && cc === 0, JSON.stringify({ cx, cc }));
  await ev(() => window.G.ui.setSetting('touchAim', 0));
  // potions on the belt
  await calm();
  await ev(() => { const G = window.G; G.actions.damage(Math.round(G.derived.lifeMax * 0.5)); G.state.player.zoom = Math.round(G.derived.zoomMax * 0.4); });
  const p0 = await ev(() => ({ ...window.G.state.potions }));
  await tapEl('.tc-belt .b-heart'); await sleep(page, 150); await tapEl('.tc-belt .b-zoom'); await sleep(page, 150);
  const p1 = await ev(() => ({ ...window.G.state.potions }));
  R.check('the belt: a tap drinks a Heart Potion and a Zoom Potion', p1.heart === p0.heart - 1 && p1.zoom === p0.zoom - 1, JSON.stringify({ p0, p1 }));
  // the weapon-set badge
  const w0 = await ev(() => window.G.state.player.activeWeapon || 0);
  await tapEl('.tc-swap'); await sleep(page, 150);
  const w1 = await ev(() => window.G.state.player.activeWeapon || 0);
  await tapEl('.tc-swap'); await sleep(page, 150);
  R.check('the weapon-set badge swaps weapons', w1 !== w0, JSON.stringify({ w0, w1 }));
  // no foe near: the attack button interacts (A), as does a tap on the prompt
  const it = await ev(() => { const G = window.G, P = G.player; for (const m of G.dungeon.monsters) { m.pos.set(-999, 0, -999); m.sync?.(); } G.padAim.manual = null; const i = G.world.interactables.find(x => x.pos && x.label); if (!i) return null; P.setPos(i.pos.x + 0.3, i.pos.z + 0.3); P.faceTo(i.pos.x, i.pos.z); window.__it = i; window.__itRaw = i.onInteract; i.onInteract = () => { window.__itHit = (window.__itHit || 0) + 1; }; G.engine.rig.focus.copy(P.pos); G.engine.rig.snap(); return i.label; });
  await sleep(page, 300);
  const pr = await ev(() => ({ show: document.querySelector('.hud .prompt')?.classList.contains('show'), hint: document.querySelector('.hud .prompt')?.classList.contains('hint'), ctx: document.querySelector('.tc-attack').classList.contains('ctx') }));
  await tapEl('.tc-attack'); await sleep(page, 150);
  const hit1 = await ev(() => window.__itHit || 0);
  await ev(() => { window.G.interactCooldown = 0; });
  await tapEl('.hud .prompt'); await sleep(page, 150);
  const hit2 = await ev(() => { const n = window.__itHit || 0; window.__it.onInteract = window.__itRaw; return n; });
  R.check('no foe near: the prompt shows (no key, a paw), the attack button shows a paw and interacts, and a tap on the prompt does too', it && pr.show && pr.hint && pr.ctx && hit1 === 1 && hit2 === 2, JSON.stringify({ it, pr, hit1, hit2 }));
  await ev(() => window.G.returnToVillage());
  await waitMode(page, 'village');
  await sleep(page, 600);

  // ================================================================ d) heroes, the meal, the bag and the menu
  await nudge();
  await calm();
  const h0 = await ev(() => window.G.state.activeHero);
  const hn = await ev(() => window.G.heroes.next());
  await tapEl('.tc-hero');
  await wait(h => window.G.state.activeHero !== h && !window.G.heroSwitching, h0, 6000); await sleep(page, 400);
  const h1 = await ev(() => window.G.state.activeHero);
  R.check('a tap on the hero button switches to the next hero', h1 === hn && h1 !== h0, JSON.stringify({ h0, hn, h1 }));
  await sleep(page, 2300); // (the switch cooldown)
  const hb2 = await C('.tc-hero');
  await F.hold(hb2.x, hb2.y, 600, 6);
  const wo = await wait(() => window.G.heroes.wheelOpen, null, 2000); await sleep(page, 300);
  const card = await ev(h => { const c = [...document.querySelectorAll('.hero-wheel .hw-card')].find(e => e.dataset.id === h); if (!c) return null; const r = c.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, open: window.G.heroes.wheelOpen }; }, h0);
  if (card) await F.tap(card.x, card.y);
  await wait(h => window.G.state.activeHero === h && !window.G.heroSwitching, h0, 6000); await sleep(page, 300);
  const h2 = await ev(() => ({ hero: window.G.state.activeHero, open: window.G.heroes.wheelOpen, held: window.G.controls.held('hero') }));
  R.check('holding the hero button opens the wheel, which stays up for a tap on a card; the tap switches', wo && card?.open && h2.hero === h0 && !h2.open && !h2.held, JSON.stringify({ wo, card, h2 }));
  // five heroes (Floofy and Foosy joined): the touch wheel shows all five cards on screen and a tap on Foosy's plays him
  // (Shadow puts his dragon wings on)
  await ev(() => { const G = window.G; G.heroes.joinShihtzu?.(); G.heroes.joinGolden?.(); G.heroes.cd = 0; });
  await sleep(page, 2300);
  const hb3 = await C('.tc-hero');
  await F.hold(hb3.x, hb3.y, 600, 6);
  const wo5 = await wait(() => window.G.heroes.wheelOpen, null, 2000); await sleep(page, 300);
  const cards5 = await ev(() => [...document.querySelectorAll('.hero-wheel .hw-card')].map(c => { const r = c.getBoundingClientRect(); return { id: c.dataset.id, x: r.left + r.width / 2, y: r.top + r.height / 2, in: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight }; }));
  const gc = cards5.find(c => c.id === 'golden');
  if (gc) await F.tap(gc.x, gc.y);
  await wait(() => window.G.state.activeHero === 'golden' && !window.G.heroSwitching, null, 6000); await sleep(page, 800);
  const h5 = await ev(() => ({ hero: window.G.state.activeHero, whelp: !!window.G.companion?.whelp?.on }));
  R.check('five heroes: the touch wheel shows all five cards on screen; a tap on Foosy\'s plays him and Shadow wears his dragon wings', wo5 && cards5.length === 5 && cards5.every(c => c.in) && h5.hero === 'golden' && h5.whelp, JSON.stringify({ cards5, h5 }));
  await ev(h => { const G = window.G; G.heroes.cd = 0; G.heroes.switchTo(h, { quiet: true }); }, h0);
  await wait(h => window.G.state.activeHero === h && !window.G.heroSwitching, h0, 6000); await sleep(page, 400);
  await calm();
  await ev(() => { const G = window.G; G.actions.addPantry('onigiri', 2); G.actions.damage(Math.round(G.derived.lifeMax * 0.3)); G.ui.hud.update(0.016); });
  await sleep(page, 400);
  await tapEl('.tc-belt .b-meal');
  const meal = await wait(() => window.__ev.some(e => e[0] === 'meal:eaten'), null, 3000);
  R.check('the meal button eats the quick meal', meal, '');
  await tapEl('.tc-bag'); await sleep(page, 400);
  const bag = await ev(() => ({ inv: window.G.ui.isOpen('inventory'), tc: document.querySelector('.tc').classList.contains('on') }));
  await ev(() => window.G.ui.close('inventory')); await sleep(page, 300);
  await tapEl('.tc-menu'); await sleep(page, 400);
  const menu = await ev(() => ({ menu: window.G.ui.isOpen('menu'), quick: [...document.querySelectorAll('.p-menu .mn-quick .btn')].filter(b => b.offsetParent).length }));
  await ev(() => window.G.ui.close('menu')); await sleep(page, 300);
  R.check('the bag button opens the bag (the controls step aside), the menu button the menu with its panel row', bag.inv && !bag.tc && menu.menu && menu.quick >= 5, JSON.stringify({ bag, menu }));

  // Settings › Controls › Touch: its options; left-handed mirrors the controls
  await ev(() => { window.G.ui.open('menu'); window.G.ui.panels.menu.setView('controls'); }); await sleep(page, 400);
  const ct = await ev(() => { const P = document.querySelector('.p-menu'); return { dev: P.dataset.dev, opts: [...P.querySelectorAll('.ctl-touch .set-row')].filter(e => e.offsetParent).length, help: P.querySelectorAll('.ctl-list .ctl-row .ctl-h').length, reset: !!P.querySelector('[data-a="resetBinds"]')?.offsetParent }; });
  const lh = await C('.p-menu .ctl-touch .tog[data-k="touchLeft"]');
  if (lh) await F.tap(lh.x, lh.y);
  await sleep(page, 200);
  await ev(() => window.G.ui.close('menu')); await sleep(page, 1300);
  const mir = await ev(() => { const a = document.querySelector('.tc-attack').getBoundingClientRect(); return { left: window.G.ui.settings.touchLeft, ax: Math.round(a.left + a.width / 2) }; });
  await ev(() => window.G.ui.setSetting('touchLeft', false)); await sleep(page, 1300);
  const mir2 = await ev(() => { const a = document.querySelector('.tc-attack').getBoundingClientRect(); return Math.round(a.left + a.width / 2); });
  R.check('Settings › Controls opens on its Touch tab (size, opacity, left-handed, aim, haptics, full screen, itch.io buttons, a help list); left-handed mirrors the buttons', ct.dev === 'touch' && ct.opts === 7 && ct.help >= 10 && !ct.reset && mir.left && mir.ax < 200 && mir2 > 640, JSON.stringify({ ct, mir, mir2 }));

  { // (sections f to j: CT-5's second checkpoint, a block of their own)
  // ================================================================ f) the menus on a phone: the bag, the shop, the K panel, dialogue
  await calm(); await nudge();
  await ev(async () => { const G = window.G, I = await import('/src/rpg/items.js'); G.state.inventory.fill(null); for (const o of [{ ilvl: 6, rarity: 'rare', slot: 'hat' }, { ilvl: 1, rarity: 'normal', slot: 'boots' }]) { const it = I.generateItem?.(o) || I.rollItem?.(o); if (it) { it.req = {}; G.actions.pickup(it); } } G.state.equipment.boots = null; G.actions.recompute(); G.ui.toasts?.retire?.(0); });
  await tapEl('.tc-bag'); await sleep(page, 700);
  const bagL = await ev(() => { const p = document.querySelector('.p-inv'), r = p.getBoundingClientRect(), x = p.querySelector('.ph-x').getBoundingClientRect(), ph = p.querySelector('.ph').getBoundingClientRect(); return { inside: r.top >= 0 && r.bottom <= innerHeight + 1 && r.left >= 0 && r.right <= innerWidth + 1, bar: ph.top > r.top + r.height * 0.6, close: Math.min(x.width, x.height), phone: document.querySelector('#ui').classList.contains('m-phone') }; });
  R.check('on a phone the bag fits the screen (it scrolls inside), its title, tabs and close button at the bottom (a 44 px close)', bagL.phone && bagL.inside && bagL.bar && bagL.close >= 44, JSON.stringify(bagL));
  const slotXY = i => ev(i => { const s = document.querySelector(`.p-inv .slot[data-c="inv"][data-i="${i}"]`); s.scrollIntoView({ block: 'center' }); const r = s.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, i);
  const inv = () => ev(() => window.G.state.inventory.map(x => (x ? x.uid : null)));
  const i0 = await inv(), s0 = await slotXY(0), s7 = await slotXY(7);
  await F.drag(s0.x, s0.y, s7.x, s7.y, { steps: 10 }); await sleep(page, 300);
  const i1 = await inv();
  R.check('a finger drags an item to another bag slot', i0[0] && !i1[0] && i1[7] === i0[0], JSON.stringify({ a: i0.slice(0, 8), b: i1.slice(0, 8) }));
  const t7 = await slotXY(7); await F.tap(t7.x, t7.y); await sleep(page, 200);
  const held = await ev(() => !!window.G.ui.drag.held);
  const t3 = await slotXY(3); await F.tap(t3.x, t3.y); await sleep(page, 300);
  const i2 = await inv();
  R.check('tap to move: a tap picks an item up, a tap on a slot puts it down', held && i2[3] === i0[0] && !i2[7], JSON.stringify({ held, b: i2.slice(0, 8) }));
  const e0 = await ev(() => Object.values(window.G.state.equipment).filter(Boolean).length);
  const q1 = await slotXY(1); await F.down(9, q1.x, q1.y); await F.up(9); await page.waitForTimeout(70); await F.down(9, q1.x, q1.y); await F.up(9); await sleep(page, 350); // (a quick pair, as a finger does: a slow machine's frames between them must not stretch it past the 330 ms window)
  const e1 = await ev(() => ({ eq: Object.values(window.G.state.equipment).filter(Boolean).length, held: !!window.G.ui.drag.held }));
  R.check('a double-tap equips (the right-click)', e1.eq === e0 + 1 && !e1.held, JSON.stringify({ e0, e1 }));
  const t3b = await slotXY(3); await F.hold(t3b.x, t3b.y, 700); await sleep(page, 150);
  const lp = await ev(() => ({ tip: !!document.querySelector('.tt-wrap.show'), held: !!window.G.ui.drag.held }));
  R.check('a long press shows the item\'s details and picks nothing up', lp.tip && !lp.held, JSON.stringify(lp));
  await ev(() => window.G.ui.closeAll()); await sleep(page, 400);
  // the shop: a tap buys; a long press only shows the details; the pair flips
  await ev(() => { window.G.state.coins = 3000; window.G.openShop(); }); await sleep(page, 800);
  const ware = await ev(() => { const s = [...document.querySelectorAll('.p-shop .sh-item')].find(e => !e.classList.contains('locked') && e.offsetParent); if (!s) return null; s.scrollIntoView({ block: 'center' }); const r = s.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  const c0 = await ev(() => window.G.state.coins);
  if (ware) { await F.hold(ware.x, ware.y, 700); await sleep(page, 200); }
  const c1 = await ev(() => ({ coins: window.G.state.coins, tip: !!document.querySelector('.tt-wrap.show') }));
  if (ware) { await F.tap(ware.x, ware.y); await sleep(page, 500); }
  const c2 = await ev(() => window.G.state.coins);
  const flip = await ev(() => ({ on: document.querySelector('.m-flip')?.classList.contains('on'), n: document.querySelectorAll('.m-flip button').length, back: [...document.querySelectorAll('.pw.m-back')].map(w => w.dataset.name) }));
  R.check('the shop: a long press shows the details without buying, a tap buys; the bag beside it takes turns (the flip)', ware && c1.coins === c0 && c1.tip && c2 < c0 && flip.on && flip.n === 2 && flip.back.includes('inventory'), JSON.stringify({ c0, c1, c2, flip }));
  await ev(() => window.G.ui.closeAll()); await sleep(page, 400);
  // the K panel: a tap on a learnable node learns it; the charge drawer folds to its tag and opens on a tap
  await ev(() => { const G = window.G; G.state.player.skillPts = 3; G.ui.open('skills'); }); await sleep(page, 700);
  const node = await ev(() => { const G = window.G, st = G.state.player; for (const n of document.querySelectorAll('.p-skills .node')) { const id = n.dataset.id; if (!id || n.classList.contains('locked') || !n.offsetParent) continue; n.scrollIntoView({ block: 'center' }); const r = n.getBoundingClientRect(); if (r.width) return { id, lv: st.skills[id] || 0, x: r.left + r.width / 2, y: r.top + r.height * 0.4 }; } return null; });
  if (node) { await F.tap(node.x, node.y); await sleep(page, 500); }
  const lv1 = node ? await ev(id => window.G.state.player.skills[id] || 0, node.id) : -1;
  const tag = await C('.chg-drawer .chg-tag');
  const d0 = await ev(() => document.querySelector('.chg-drawer')?.classList.contains('m-open'));
  if (tag) { await F.tap(tag.x, tag.y); await sleep(page, 300); }
  const d1 = await ev(() => document.querySelector('.chg-drawer')?.classList.contains('m-open'));
  R.check('the K panel: a tap on a node learns it; the charge drawer folds to its tag and opens on a tap', node && lv1 === node.lv + 1 && !d0 && d1, JSON.stringify({ node, lv1, d0, d1 }));
  await ev(() => window.G.ui.closeAll()); await sleep(page, 400);
  // dialogue: a tap on the world reads on; the choices are big buttons and a tap picks one
  await ev(() => { const G = window.G; window.__dlg = G.ui.dialogue({ speaker: 'Rosie', portrait: G.portrait('rosie'), lines: ['One.', 'Two!'], choices: [{ text: 'Yes please' }, { text: 'No thanks' }] }).then(i => { window.__pick = i; }); });
  await sleep(page, 500);
  for (let i = 0; i < 4 && await ev(() => window.G.ui.dlg.typing || window.G.ui.dlg.i < window.G.ui.dlg.lines.length - 1); i++) { await F.tap(420, 120); await sleep(page, 250); }
  await sleep(page, 300);
  const dch = await ev(() => { const b = [...document.querySelectorAll('.dlg .dch')].filter(e => e.offsetParent); const r = b[1]?.getBoundingClientRect(); return { n: b.length, h: Math.min(...b.map(e => e.getBoundingClientRect().height)), x: r ? r.left + r.width / 2 : 0, y: r ? r.top + r.height / 2 : 0 }; });
  if (dch.n) { await F.tap(dch.x, dch.y); await sleep(page, 400); }
  const pick = await ev(() => window.__pick);
  R.check('dialogue: taps on the world read on to the choices, which are 44 px buttons; a tap picks one', dch.n === 2 && dch.h >= 44 && pick === 1, JSON.stringify({ dch, pick }));

  // ================================================================ g) build and decorate with touch
  await openSpot(); await calm();
  await ev(() => { const G = window.G; G.state.coins = 3000; G.state.materials.wood = 99; G.ui.toasts?.retire?.(0); G.build.enter(); });
  await sleep(page, 900);
  const be = await ev(() => ({ on: window.G.build.active, edit: document.querySelector('.tc').classList.contains('edit'), done: !!document.querySelector('.tc-done:not(.hide)')?.offsetParent, tc: window.G.controls.tcursor.on }));
  // pick the Park Bench in the palette by touch (its Decor tab, its card)
  const decorTab = await ev(() => { const t = document.querySelector('.p-build .bd-tabs .tab[data-c="decor"]'); if (!t) return null; t.scrollIntoView({ inline: 'center', block: 'nearest' }); const r = t.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  if (decorTab) { await F.tap(decorTab.x, decorTab.y); await sleep(page, 400); }
  const benchCard = await ev(() => { const c = [...document.querySelectorAll('.p-build .card')].find(e => /Park Bench/.test(e.textContent)); if (!c) return null; c.scrollIntoView({ inline: 'center', block: 'nearest' }); const r = c.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  if (benchCard) { await F.tap(benchCard.x, benchCard.y); await sleep(page, 500); }
  const bt = await ev(() => ({ tool: window.G.build.tool?.type || null, placing: document.querySelector('#ui').classList.contains('tc-placing'), place: !!document.querySelector('.tc-place:not(.hide)')?.offsetParent, rot: !!document.querySelector('.tc-rot:not(.hide)')?.offsetParent }));
  const nb0 = await ev(() => window.G.sim.S.buildings.length);
  let placed = false;
  for (const [x, y] of [[0.45, 0.42], [0.35, 0.35], [0.55, 0.3], [0.3, 0.5], [0.5, 0.55], [0.4, 0.25]]) {
    await F.tap(innerW(x), innerH(y)); await sleep(page, 300);
    if (await ev(() => window.G.build.ghostOk)) { await tapEl('.tc-rot'); await sleep(page, 150); await tapEl('.tc-place'); await sleep(page, 400); placed = (await ev(() => window.G.sim.S.buildings.length)) === nb0 + 1; if (placed) break; }
  }
  // drag to pan with nothing in hand
  await tapEl('.tc-cancel'); await sleep(page, 300);
  const f0 = await ev(() => { const f = window.G.buildFocus; return f ? [f.x, f.z] : null; });
  await F.drag(innerW(0.5), innerH(0.35), innerW(0.3), innerH(0.25), { steps: 8 }); await sleep(page, 300);
  const f1 = await ev(() => { const f = window.G.buildFocus; return f ? [f.x, f.z] : null; });
  const panned = f0 && f1 && Math.hypot(f1[0] - f0[0], f1[1] - f0[1]) > 1.5;
  await tapEl('.tc-done'); await sleep(page, 600);
  const bOff = await ev(() => !window.G.build.active && !window.G.controls.tcursor.on);
  R.check('build mode by touch: the palette is tapped (a tab, the Park Bench), a tap puts the ghost, Turn and Build place it; Cancel drops it, a drag pans, Done leaves', be.on && be.edit && be.done && bt.tool === 'bench' && bt.placing && bt.place && bt.rot && placed && panned && bOff, JSON.stringify({ be, bt, placed, f0, f1, bOff }));
  // decorate in the cottage
  await ev(() => window.G.openHome()); await waitMode(page, 'interior'); await sleep(page, 900);
  await ev(async () => { const F = (await import('/src/home/furniture.js')).FURNITURE; const id = Object.keys(F).find(k => F[k].mount === 'floor' && F[k].size?.[0] === 1 && (F[k].size?.[1] ?? 1) <= 1 && !F[k].own) || Object.keys(F).find(k => F[k].mount === 'floor'); window.G.actions.addFurniture(id, 2); window.G.housing.decor.enter(); });
  await sleep(page, 900);
  const dcard = await ev(() => { const c = [...document.querySelectorAll('.p-decor .card')].find(e => e.offsetParent); if (!c) return null; c.scrollIntoView({ inline: 'center', block: 'nearest' }); const r = c.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  if (dcard) { await F.tap(dcard.x, dcard.y); await sleep(page, 500); }
  const dsel = await ev(() => !!window.G.housing.decor.sel);
  const di0 = await ev(() => window.G.housing.decor.items.length);
  let placedD = false;
  for (const [x, y] of [[0.5, 0.35], [0.42, 0.3], [0.58, 0.4], [0.5, 0.25], [0.38, 0.4]]) {
    await F.drag(innerW(x) - 20, innerH(y), innerW(x), innerH(y), { steps: 3 }); await sleep(page, 300);
    if (await ev(() => window.G.housing.decor.ghostOk)) { await tapEl('.tc-place'); await sleep(page, 400); placedD = (await ev(() => window.G.housing.decor.items.length)) === di0 + 1; if (placedD) break; }
  }
  await tapEl('.tc-undo'); await sleep(page, 300);
  const undone = (await ev(() => window.G.housing.decor.items.length)) === di0;
  await tapEl('.tc-cancel'); await sleep(page, 200); await tapEl('.tc-done'); await sleep(page, 500);
  const dOff = await ev(() => !window.G.housing.decor.active);
  R.check('decorate by touch: a tap picks a piece, a drag slides it, Set down places it, Undo takes it back, Done leaves', !!dcard && dsel && placedD && undone && dOff, JSON.stringify({ card: !!dcard, dsel, di0, placedD, undone, dOff }));
  // cooking at the stove: a tap picks the recipe, + and Cook are taps, the ✕ closes
  await ev(() => { const A = window.G.actions; for (const [id, n] of Object.entries({ crucian: 3, loach: 2 })) A.addPantry(id, n, { silent: true }); window.G.life.kitchen.open('kitchen'); });
  await sleep(page, 700);
  const ck0 = await ev(() => ({ open: window.G.ui.isOpen('cook'), n: window.G.state.cookbook?.cooked?.grilledFish || 0, p: window.G.state.pantry.crucian || 0 }));
  await ev(() => document.querySelector('.ck-row[data-id="grilledFish"]')?.scrollIntoView({ block: 'center' })); await sleep(page, 200);
  const ckRow = await tapEl('.ck-row[data-id="grilledFish"]'); await sleep(page, 300);
  const ckSel = await ev(() => window.G.ui.panels.cook.sel);
  await ev(() => document.querySelector('.ck-det .ck-go')?.scrollIntoView({ block: 'center' })); await sleep(page, 200);
  await tapEl('.ck-det [data-q="1"]'); await sleep(page, 200);
  const ckQty = await ev(() => window.G.ui.panels.cook.qty);
  await tapEl('.ck-det .ck-go'); await sleep(page, 300);
  await wait(() => !window.G.ui.panels.cook.cooking, null, 10000); await sleep(page, 300);
  const ck1 = await ev(() => ({ n: window.G.state.cookbook?.cooked?.grilledFish || 0, p: window.G.state.pantry.crucian || 0 }));
  await tapEl('.p-cook .ph-x'); await sleep(page, 400);
  const ckShut = await ev(() => !window.G.ui.isOpen('cook'));
  R.check('cooking by touch: a tap picks the recipe, + and Cook are taps (two Grilled Fish), the ✕ closes the kitchen', ck0.open && ckRow && ckSel === 'grilledFish' && ckQty === 2 && ck1.n >= ck0.n + 2 && ck1.p < ck0.p && ckShut, JSON.stringify({ ck0, ckRow, ckSel, ckQty, ck1, ckShut }));
  await ev(() => window.G.housing.exit?.()); await waitMode(page, 'village'); await sleep(page, 600);

  // ================================================================ h) fishing: a tap casts and strikes, the screen held reels
  await calm(); await nudge();
  const fat = await ev(() => { const G = window.G, P = G.player, W = G.world, L = W.landmarks, c = L.pond || L.fishing || null; G.state.fishing = { ...(G.state.fishing || {}), rod: 1, gotRod: true };
    for (let r = 2; r < 40; r += 0.5) for (let a = 0; a < 24; a++) { const x = (c?.x ?? L.plaza.x) + Math.cos(a / 12 * Math.PI) * r, z = (c?.z ?? L.plaza.z) + Math.sin(a / 12 * Math.PI) * r; if (!W.walkable(x, z) || W.heightAt(x, z) < 0.02) continue; const fx = Math.cos(a / 12 * Math.PI + Math.PI), fz = Math.sin(a / 12 * Math.PI + Math.PI); if (W.heightAt(x + fx * 1.6, z + fz * 1.6) < -0.05) { P.setPos(x, z); P.faceTo(x + fx, z + fz); P.facing = P.faceTarget; G.engine.rig.focus.copy(P.pos); G.engine.rig.snap(); return [x, z]; } }
    return null; });
  await sleep(page, 700);
  await tapEl('.tc-attack');
  const cast = await wait(() => !!window.G.life.fishing.s, null, 3000);
  if (cast) await wait(() => window.G.life.fishing.s?.phase === 'wait', null, 5000);
  await ev(() => { const s = window.G.life.fishing.s; if (s) { s.wait = s.t + 0.01; s.fish = 'koi'; } });
  const bit = await wait(() => window.G.life.fishing.s?.phase === 'bite', null, 3000);
  await F.down(7, innerW(0.6), innerH(0.4)); await F.frame();
  const reelHeld = await ev(() => window.G.controls.held('reel'));
  const reel = await wait(() => window.G.life.fishing.s?.phase === 'reel', null, 2000);
  await F.up(7);
  await ev(() => { const T = window.G.ui.touch.T; window.__reelT = setInterval(() => { const s = window.G.life.fishing.s, S = s?.phase === 'reel' && s.sim; if (S && S.f > S.z + S.zh * 0.5 + S.v * 0.28) T.hold('reel'); else T.release('reel'); }, 16); });
  const landed = await wait(() => !window.G.life.fishing.s || window.G.life.fishing.s.phase === 'land', null, 30000);
  const caught = await ev(() => { clearInterval(window.__reelT); window.G.ui.touch.T.release('reel'); return Object.keys(window.G.state.fishLog || {}).length; });
  const hint = await ev(() => getComputedStyle(document.querySelector('.reel .rl-keys.touch-only')).display !== 'none');
  await wait(() => !window.G.life.fishing.s, null, 5000);
  R.check('fishing by touch: the attack button casts at the water, a touch strikes the bite and holding the screen reels (the reel bar says so)', !!fat && cast && bit && reelHeld && reel && landed && caught >= 1 && hint, JSON.stringify({ at: !!fat, cast, bit, reelHeld, reel, landed, caught, hint }));

  // ================================================================ i) portrait: the rotate overlay pauses the game
  await page.setViewportSize({ width: 390, height: 844 }); await sleep(page, 500);
  const prt = await ev(() => ({ shown: getComputedStyle(document.querySelector('.m-rotate')).display !== 'none', paused: window.G.ui.isPaused() }));
  await page.setViewportSize({ width: 844, height: 390 }); await sleep(page, 600);
  const pr2 = await ev(() => ({ shown: getComputedStyle(document.querySelector('.m-rotate')).display !== 'none', paused: window.G.ui.isPaused() }));
  R.check('held upright, a phone shows the rotate overlay and the game pauses; turned back, it plays on', prt.shown && prt.paused && !pr2.shown && !pr2.paused, JSON.stringify({ prt, pr2 }));

  // ================================================================ j) the Mobile preset picks itself on a touch-first first start
  const mp = await ev(() => { const E = window.G.engine, P = E.post; return { preset: E.preset, quality: E.quality, setting: window.G.ui.settings.quality, pr: +E.renderer.getPixelRatio().toFixed(2), ao: P.ao.enabled, tilt: P.tiltPass.enabled, lite: !!E.lite, cap: window.G.ui.settings.fpsCap, particles: window.G.particleBudget?.scale, noChroma: P.noChroma === true }; });
  R.check('a touch-first first start picks the Mobile preset (Low density, pixel ratio 1, no AO, tilt or hit aberration, lighter shadows and particles, capped at 60)', mp.preset === 4 && mp.quality === 0 && mp.setting === 4 && mp.pr === 1 && !mp.ao && !mp.tilt && mp.noChroma && mp.lite && mp.cap === 1 && mp.particles === 0.5, JSON.stringify(mp));

  }
  // ================================================================ e) back to the mouse, and back to touch
  await sleep(page, 700); // (the mouse events a browser sends right after a tap don't count)
  await page.mouse.move(400, 200); await page.mouse.move(470, 240, { steps: 4 }); await sleep(page, 300);
  const k1 = await ev(() => ({ dev: window.G.controls.device, body: document.body.classList.contains('touch-active'), on: document.querySelector('.tc').classList.contains('on'), hotbar: document.querySelectorAll('.hud .hotbar .hb').length, belt: document.querySelectorAll('.hud .hotbar .belt').length, menubtns: getComputedStyle(document.querySelector('.hud-br')).display }));
  await nudge();
  const t1 = await ev(() => ({ dev: window.G.controls.device, on: document.querySelector('.tc').classList.contains('on'), slotsIn: document.querySelectorAll('.tc-slot > .hb').length }));
  R.check('a mouse move takes the mouse back (the hotbar slots and belt go home, the touch layer hides); a touch brings them back', k1.dev === 'kbm' && !k1.body && !k1.on && k1.hotbar === 6 && k1.belt === 4 && k1.menubtns !== 'none' && t1.dev === 'touch' && t1.on && t1.slotsIn === 6, JSON.stringify({ k1, t1 }));

  // ================================================================ k) an iPad (CT-6)
  await ipadChecks();
} catch (e) {
  if (e === ONLY_K) { try { await ipadChecks(); } catch (x) { R.check('the iPad section ran to the end', false, x.stack || x.message); } }
  else R.check('scenario ran to the end', false, e.stack || e.message);
}
const failed = R.finish(errors, warns);
await browser.close();
await ipadClose?.();
process.exit(failed ? 1 : 0);
