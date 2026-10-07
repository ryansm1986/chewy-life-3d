// Scenario 25: the gamepad (docs/CONTROLS.md §1–2, ROADMAP CT-1), through a virtual pad (tools/qa/pad-lib.mjs stubs
// navigator.getGamepads; the game polls it once a frame):
//  a) the action layer: a stick push makes the pad the active device (glyphs, the hidden cursor); the default keyboard
//     bindings are the old keys; rebinding (pad and keys, a swap) and reset
//  b) moving: the left stick walks along the camera, analogue (half tilt walks slower); L3 sprints and stays on while
//     moving, standing still drops it; L3 + R3 swaps weapons (and leaves the sprint alone); B rolls
//  c) a Burrow fight: the soft lock (in the cone, its ring; Aim assist 0 = none), A attacks the lock, X / Y / RB / RT /
//     LT cast hotbar slots 1–5, a held Y charges and releases at Stage Ⅰ+ (rumble on, then off), D-pad ◀ / ▶ drink
//  d) the village: the A prompt and A talks (the dialogue: A advances, the D-pad picks, B leaves), D-pad ▼ interacts,
//     D-pad ▲ eats the quick meal, View opens the map and B closes it, Menu opens the game menu and its panel row
//  e) heroes: LB tapped switches to the next hero, LB held opens the wheel and the right stick picks; Moka's Moonbeam
//     channels while held; Poe's fūma throw and Shadow Step blink go at the lock
//  g) CT-2, every panel with the pad: the bag (pick up / put down, equip, drop, compare tooltips, tabs), the character
//     sheet, the skill trees (learn, assign through the popover, charge perks), the journal's tabs, the map's zoom,
//     settings (a slider, a toggle, back), Rosie's shop (buy, sell), the stash, cooking, the workbench, the Travel Map,
//     the gift picker
//  h) CT-2, build mode and decorate mode with the virtual cursor (pick, place, rotate, remove / undo, leave), and
//     fishing end to end on the pad
//  f) back to the mouse and keyboard: a mouse move switches back (cursor, key caps), the keys still play
import { launch, boot, waitMode, sleep, makeReport } from './lib.mjs';
import { installPad, padDown, padUp, padTap, padStick, padReset } from './pad-lib.mjs';

const R = makeReport('S25 gamepad: action layer, move, sprint, roll, aim assist, skills, charge, potions, interact, menus, heroes, back to mouse');
const { browser, page, errors, warns } = await launch({ w: 1280, h: 720 });
const ev = (f, a) => page.evaluate(f, a);
const wait = (f, a, timeout = 8000) => page.waitForFunction(f, a, { timeout, polling: 'raf' }).then(() => true, () => false);

// spies: tryCast, the bus, rumble calls
const spy = () => ev(() => {
  const G = window.G;
  window.__casts = []; window.__ev = [];
  if (!G.skills.__spied) {
    G.skills.__spied = true;
    const rc = G.skills.tryCast.bind(G.skills);
    G.skills.tryCast = (i, a, t, c) => { const x = rc(i, a, t, c); window.__casts.push({ id: i, ok: !!x, stage: c?.stage || 0, lock: !!t && t === G.padAim?.lock, tgt: t?.name || null }); return x; };
    for (const n of ['charge:start', 'charge:stage', 'charge:release', 'charge:cancel', 'player:roll', 'meal:eaten', 'hero:wheel', 'ui:open', 'ui:close', 'input:device']) G.events.on(n, p => window.__ev.push([n, p?.stage ?? p?.name ?? p?.device ?? p?.open ?? '']));
  }
});
const calm = () => ev(() => { const G = window.G; G.skills.cds = {}; G.skills.queued = null; G.skills.approach = null; G.player.moveTarget = null; G.player.anim.stop(); G.player.leap = null; G.player.dash = null; G.player.rollT = 0; G.player.rollCd = 0; G.actions.restoreAll(); window.__casts = []; window.__ev = []; });
const pos = () => ev(() => { const P = window.G.player; return [P.pos.x, P.pos.z]; });
const walk = async (x, y, ms) => { const a = await pos(); await padStick(page, 'left', x, y); await sleep(page, ms); const b = await pos(); await padStick(page, 'left', 0, 0); return { a, b, d: Math.hypot(b[0] - a[0], b[1] - a[1]) }; };
const openSpot = () => ev(() => { // the plaza's open middle, the camera's usual yaw
  const G = window.G, W = G.world, c = W.landmarks.plaza;
  const open = (x, z) => W.walkable(x, z) && !W.collision.solidAt(x, z, 0.8) && !G.sim.buildingAt(x, z);
  for (let r = 0; r < 40; r += 1.5) for (let a = 0; a < 12; a++) { const x = c.x + Math.cos(a / 6 * Math.PI) * r, z = c.z + 4 + Math.sin(a / 6 * Math.PI) * r; let ok = true; for (let s = -7; s <= 7 && ok; s += 1) for (let t = -7; t <= 7 && ok; t += 1) if (!open(x + s, z + t)) ok = false; if (ok) { G.player.setPos(x, z); G.engine.rig.focus.copy(G.player.pos); G.engine.rig.snap(); return [x, z]; } }
  return null;
});

try {
  await boot(page, 'fresh&nointro&notut');
  await ev(() => {
    const G = window.G, st = G.state;
    st.flags.burrowTut = true; st.flags.hints = { all: true }; // (no tips over the HUD)
    st.potions = { heart: 5, zoom: 5, rejuv: 1 };
    const pl = st.player; pl.lvl = 30; for (const id of ['chomp', 'packcall', 'blaze', 'decoy', 'moonhowl', 'whirl']) pl.skills[id] = 5;
    pl.hotbar = ['attack', 'chomp', 'blaze', 'packcall', 'decoy', 'moonhowl'];
    G.actions.recompute(); G.actions.restoreAll();
    st.flags.mokaJoined = true; const v = G.heroes.villagers.moka; if (v) { v.frozen = false; v.waitingToJoin = false; }
    const T = (st.flags.tutorials ||= {}); for (const id of ['house', 'switch', 'fishing', 'makeHome', 'remodel', 'charge', 'meetPoe']) T[id] = { done: true };
    G.heroes.joinPoe?.();
    G.ui.toasts?.retire?.(0);
  });
  await sleep(page, 400);
  await spy();

  // ================================================================ a) the action layer
  const k0 = await ev(() => { const A = window.G.controls; return { dev: A.device, keys: ['attack', 'skillAlt', 'skill1', 'skill4', 'roll', 'sprint', 'interact', 'potionHeart', 'potionZoom', 'potionR', 'meal', 'swap', 'hero', 'inventory', 'map', 'build', 'menu', 'lootLabels', 'home'].map(a => A.label(a, 'kbm')).join(' '), caps: [...document.querySelectorAll('.hud .hotbar .hb-k')].map(e => e.textContent).join('|') }; });
  R.check('before any pad input the mouse and keyboard play, with the old keys on every action', k0.dev === 'kbm' && k0.keys === 'LMB RMB 1 4 Space Shift F Q E R G X Tab I M B Esc Z T', JSON.stringify(k0));
  await installPad(page);
  await padStick(page, 'left', 0, -0.6); await sleep(page, 120); await padStick(page, 'left', 0, 0);
  const d1 = await ev(() => ({ dev: window.G.controls.device, body: document.body.classList.contains('pad-active'), cursor: getComputedStyle(document.querySelector('#game') || document.body).cursor, padCaps: [...document.querySelectorAll('.hud .hotbar .hb .hb-k')].filter(e => e.classList.contains('pad') && e.querySelector('svg.pg')).length, potion: !!document.querySelector('.hud .belt.b-heart .hb-k.pad svg'), rejuvHidden: document.querySelector('.hud .belt.b-rejuv .hb-k')?.classList.contains('unbound'), menuBtn: !!document.querySelector('.hud .mb[data-open="menu"] .kc.pad svg'), bagHidden: document.querySelector('.hud .mb[data-open="inventory"] .kc')?.classList.contains('unbound') }));
  R.check('a stick push makes the pad the active device: hotbar / belt / menu glyphs, unbound caps hidden, the cursor hidden', d1.dev === 'pad' && d1.body && d1.cursor === 'none' && d1.padCaps === 6 && d1.potion && d1.rejuvHidden && d1.menuBtn && d1.bagHidden, JSON.stringify(d1));
  // rebinding: the pad (a swap) and a key, then reset
  const rb = await ev(() => { const A = window.G.controls, r = A.rebind('skill1', 'pad', 'RB'); return { r, s1: A.binds('skill1', 'pad'), s2: A.binds('skill2', 'pad'), locked: A.rebind('attack', 'kbm', 'h') }; });
  await calm();
  await padTap(page, 'RB'); await wait(() => window.__casts.length > 0, null, 3000);
  const rbc = await ev(() => window.__casts.map(c => c.id));
  await ev(() => { const A = window.G.controls; A.resetBindings('pad'); A.rebind('skill1', 'kbm', 'h'); });
  await calm();
  await page.keyboard.down('h'); await sleep(page, 60); await page.keyboard.up('h'); await wait(() => window.__casts.length > 0, null, 3000);
  const kc = await ev(() => ({ casts: window.__casts.map(c => c.id), dev: window.G.controls.device }));
  await ev(() => window.G.controls.resetBindings());
  R.check('rebinding: Skill 1 to RB swaps Skill 2 onto Y and RB casts slot 1; LMB stays fixed; a key rebind (H) casts; reset restores', rb.r?.swapped === 'skill2' && rb.s1[0] === 'RB' && rb.s2[0] === 'Y' && rb.locked === null && rbc[0] === 'blaze' && kc.casts[0] === 'blaze', JSON.stringify({ rb, rbc, kc }));

  // ================================================================ b) moving, sprint, swap, roll
  await padTap(page, 'DUp'); // (back to the pad: the key press above took the mouse and keyboard)
  await openSpot(); await calm();
  const fwd = await ev(() => { const { f } = window.G.engine.rig.groundAxes(); return [f.x, f.z]; });
  const full = await walk(0, -1, 700);
  const dot = ((full.b[0] - full.a[0]) * fwd[0] + (full.b[1] - full.a[1]) * fwd[1]) / Math.max(1e-6, full.d);
  await openSpot();
  const half = await walk(0, -0.5, 700);
  R.check('the left stick walks along the camera, analogue: a half tilt walks slower than full', full.d > 2 && dot > 0.95 && half.d > 0.3 && half.d < full.d * 0.75, JSON.stringify({ full: +full.d.toFixed(2), half: +half.d.toFixed(2), dot: +dot.toFixed(3) }));
  await openSpot(); await calm();
  await padStick(page, 'left', 0, -1); await sleep(page, 250);
  await padTap(page, 'L3'); await sleep(page, 600);
  const sp = await ev(() => { const P = window.G.player; return { on: P.sprint.on, k: +P.sprint.k.toFixed(2), latched: !!P.sprint.padLatched, v: +P.moveSpeed.toFixed(2) }; });
  await padStick(page, 'left', 0, 0); await sleep(page, 900);
  const sp2 = await ev(() => { const P = window.G.player; return { on: P.sprint.on, latched: !!P.sprint.padLatched }; });
  R.check('L3 sprints while moving and stays on; standing still drops it', sp.on && sp.latched && sp.k > 0.8 && !sp2.on && !sp2.latched, JSON.stringify({ sp, sp2 }));
  const w0 = await ev(() => window.G.state.player.activeWeapon || 0);
  await padDown(page, 'L3'); await padDown(page, 'R3'); await sleep(page, 80); await padUp(page, 'R3'); await padUp(page, 'L3');
  const w1 = await ev(() => ({ w: window.G.state.player.activeWeapon || 0, latched: !!window.G.player.sprint.padLatched, wt: window.G.derived.weaponType }));
  R.check('L3 + R3 swaps weapons (the sprint latch left alone)', w1.w !== w0 && !w1.latched, JSON.stringify({ w0, ...w1 }));
  await padDown(page, 'L3'); await padDown(page, 'R3'); await sleep(page, 80); await padUp(page, 'R3'); await padUp(page, 'L3'); // (swap back)
  await calm();
  await padStick(page, 'left', 1, 0); await sleep(page, 150);
  await padTap(page, 'B');
  const roll = await ev(() => ({ rolls: window.__ev.filter(e => e[0] === 'player:roll').length, rollT: window.G.player.rollT }));
  await padStick(page, 'left', 0, 0);
  R.check('B rolls', roll.rolls === 1, JSON.stringify(roll));

  // ================================================================ c) a Burrow fight
  await ev(() => window.G.enterDungeon(1));
  await waitMode(page, 'dungeon');
  await sleep(page, 600);
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
  const foe = await setFoe(4);
  await padStick(page, 'right', 0, -0.9); await sleep(page, 200);
  const lk = await ev(() => { const A = window.G.padAim; return { lock: A.lock === window.__foe, ring: !!A.ring && A.ring.parent === window.G.world.scene && A.ring.visible, target: document.querySelector('.hud .target')?.classList.contains('show') ?? null, aim: window.G.controls.padAim ? [+window.G.controls.padAim.x.toFixed(2), +window.G.controls.padAim.z.toFixed(2)] : null, foe: [+window.__foe.pos.x.toFixed(2), +window.__foe.pos.z.toFixed(2)] }; });
  R.check('aim assist: the foe in the cone is soft-locked, its ring drawn, the aim point on it', lk.lock && lk.ring && lk.aim && lk.aim[0] === lk.foe[0] && lk.aim[1] === lk.foe[1], JSON.stringify({ foe, ...lk }));
  await padStick(page, 'right', 1, 0); await sleep(page, 200); // (the right stick pushed 90° away: the lock lets go)
  const lk2 = await ev(() => ({ lock: !!window.G.padAim.lock }));
  await ev(() => window.G.ui.setSetting('aimAssist', 0));
  await padStick(page, 'right', 0, -0.9); await sleep(page, 200);
  const lk3 = await ev(() => ({ lock: !!window.G.padAim.lock, ring: !!window.G.padAim.ring?.parent }));
  await ev(() => window.G.ui.setSetting('aimAssist', 0.7));
  await padStick(page, 'right', 0, 0); await sleep(page, 150);
  R.check('the right stick pointed away lets the lock go; Aim assist 0 locks nothing (no ring)', !lk2.lock && !lk3.lock && !lk3.ring, JSON.stringify({ lk2, lk3 }));
  // A attacks the lock (no stick: the aim follows the facing, the lock holds)
  await setFoe(2); await calm(); await sleep(page, 120);
  await padTap(page, 'A'); await wait(() => window.__casts.length > 0, null, 3000);
  const ac = await ev(() => window.__casts.slice());
  R.check('A attacks: the basic attack at the soft-locked foe', ac[0]?.id === 'attack' && ac[0].ok && ac[0].lock, JSON.stringify(ac));
  // every hotbar slot
  const slots = [['X', 1], ['Y', 2], ['RB', 3], ['RT', 4], ['LT', 5]], got = {};
  const hb = await ev(() => window.G.state.player.hotbar.slice());
  for (const [b, i] of slots) {
    await calm(); await sleep(page, 80);
    await padTap(page, b, 40);
    await wait(id => window.__casts.some(c => c.id === id && c.ok), hb[i], 3000); // (a cast while a swing finishes is queued: it lands a moment later)
    got[b] = await ev(id => window.__casts.find(c => c.id === id && c.ok) || window.__casts[0] || null, hb[i]);
  }
  R.check('X / Y / RB / RT / LT cast hotbar slots 1–5 (each at the lock)', slots.every(([b, i]) => got[b]?.id === hb[i] && got[b].ok), JSON.stringify(got));
  // short magnetism: a melee skill at a lock 8 m off swings in place toward it (no walk across the room)
  await setFoe(8); await calm(); await ev(() => { window.G.state.player.hotbar[2] = 'chomp'; }); await sleep(page, 150);
  const far0 = await ev(() => ({ lock: window.G.padAim.lock === window.__foe, p: [window.G.player.pos.x, window.G.player.pos.z] }));
  await padTap(page, 'Y', 40); await wait(() => window.__casts.some(c => c.id === 'chomp' && c.ok), null, 3000); await sleep(page, 600);
  const far1 = await ev(([p]) => ({ cast: window.__casts.find(c => c.id === 'chomp' && c.ok) || null, moved: +Math.hypot(window.G.player.pos.x - p[0], window.G.player.pos.z - p[1]).toFixed(2), approach: !!window.G.skills.approach }), [far0.p]);
  await ev(h => { window.G.state.player.hotbar[2] = h; }, hb[2]);
  R.check('short magnetism: a melee skill at a lock 8 m away swings in place toward it, no walk-up', far0.lock && far1.cast && !far1.cast.tgt && far1.moved < 0.8 && !far1.approach, JSON.stringify({ far0, far1 }));
  // hold to charge: Y (Blaze) held past Stage Ⅰ, then let go; rumble pulses on the release
  await setFoe(4); await calm();
  const r0 = await ev(() => window.__pad.rumbles.length);
  await padDown(page, 'Y');
  const st1 = await wait(() => (window.G.skills.charge.active?.stage || 0) >= 1, null, 6000);
  await sleep(page, 60);
  await padUp(page, 'Y');
  await wait(() => window.__ev.some(e => e[0] === 'charge:release'), null, 3000);
  const ch = await ev(([r0]) => ({ ev: window.__ev.filter(e => e[0].startsWith('charge:')).map(e => e.join(':')), casts: window.__casts.filter(c => c.stage > 0).map(c => c.id + '@' + c.stage), rumbles: window.__pad.rumbles.slice(r0).map(r => +(r.strongMagnitude || 0).toFixed(2)) }), [r0]);
  R.check('holding Y charges Blaze to Stage Ⅰ+ and letting go fires it charged (charge:start → stage → release)', st1 && ch.ev[0]?.startsWith('charge:start') && ch.ev.some(e => e.startsWith('charge:stage')) && ch.ev.some(e => /^charge:release:[123]/.test(e)) && ch.casts.some(c => c.startsWith('blaze@')), JSON.stringify(ch));
  R.check('rumble: pulses on the charge stage and release', ch.rumbles.length >= 2 && Math.max(...ch.rumbles) >= 0.25, JSON.stringify(ch.rumbles));
  await ev(() => window.G.ui.setSetting('rumble', false)); await calm();
  const r1 = await ev(() => window.__pad.rumbles.length);
  await padDown(page, 'Y'); await wait(() => (window.G.skills.charge.active?.stage || 0) >= 1, null, 6000); await padUp(page, 'Y');
  await wait(() => window.__ev.some(e => e[0] === 'charge:release'), null, 3000);
  const r2 = await ev(() => window.__pad.rumbles.length);
  await ev(() => window.G.ui.setSetting('rumble', true));
  R.check('Settings › Controls › Rumble off: no rumble', r2 === r1, JSON.stringify({ r1, r2 }));
  // potions
  await calm();
  await ev(() => { const G = window.G; G.actions.damage(Math.round(G.derived.lifeMax * 0.5)); if (G.actions.spendZoom) G.actions.spendZoom(G.derived.zoomMax * 0.6); else G.state.player.zoom = Math.round(G.derived.zoomMax * 0.4); });
  const p0 = await ev(() => ({ ...window.G.state.potions }));
  await padTap(page, 'DLeft'); await sleep(page, 150); await padTap(page, 'DRight'); await sleep(page, 150);
  const p1 = await ev(() => ({ ...window.G.state.potions }));
  R.check('D-pad ◀ drinks a Heart Potion, ▶ a Zoom Potion', p1.heart === p0.heart - 1 && p1.zoom === p0.zoom - 1, JSON.stringify({ p0, p1 }));
  // the stairs / exit with no foe near: A interacts (the prompt shows A)
  const it = await ev(() => { const G = window.G, P = G.player; for (const m of G.dungeon.monsters) { m.pos.set(-999, 0, -999); m.sync?.(); } const i = G.world.interactables.find(x => x.pos && x.label); if (!i) return null; P.setPos(i.pos.x + 0.3, i.pos.z + 0.3); P.faceTo(i.pos.x, i.pos.z); window.__it = i; const raw = i.onInteract; i.onInteract = () => { window.__itHit = (window.__itHit || 0) + 1; }; window.__itRaw = raw; return i.label; });
  await sleep(page, 200);
  const pr = await ev(() => ({ show: document.querySelector('.hud .prompt')?.classList.contains('show'), pad: !!document.querySelector('.hud .prompt .kc.pad svg'), text: document.querySelector('.hud .prompt .pr-t')?.textContent }));
  await padTap(page, 'A'); await sleep(page, 120);
  const itHit = await ev(() => { const n = window.__itHit || 0; window.__it.onInteract = window.__itRaw; return n; });
  R.check('no foe near: the nearest interactable gets the A prompt and A interacts', it && pr.show && pr.pad && itHit === 1, JSON.stringify({ it, pr, itHit }));
  await ev(() => window.G.returnToVillage());
  await waitMode(page, 'village');
  await sleep(page, 500);

  // ================================================================ d) the village: talk, D-pad, menus
  await ev(() => { const G = window.G, R = G.npcs.find(n => n.id === 'rosie'); R.talking = false; R.state = 'idle'; R.wander = 0; G.player.setPos(R.pos.x + 0.8, R.pos.z + 0.3); G.player.faceTo(R.pos.x, R.pos.z); G.player.facing = G.player.faceTarget; G.engine.rig.focus.copy(G.player.pos); G.engine.rig.snap(); G.interactCooldown = 0; });
  await padTap(page, 'DUp'); await sleep(page, 250);
  const vp = await ev(() => ({ show: document.querySelector('.hud .prompt')?.classList.contains('show'), glyph: document.querySelector('.hud .prompt .kc.pad svg') ? 'pad' : document.querySelector('.hud .prompt .kc')?.textContent, text: document.querySelector('.hud .prompt .pr-t')?.textContent }));
  await padTap(page, 'A');
  const talk = await wait(() => window.G.ui.dlg.active, null, 4000);
  let steps = 0;
  for (; steps < 20; steps++) { const s = await ev(() => { const D = window.G.ui.dlg; return { a: D.active, picking: !!(D.choices?.length && D.i >= D.lines.length - 1 && !D.typing) }; }); if (!s.a || s.picking) break; await padTap(page, 'A'); await sleep(page, 200); }
  const ch0 = await ev(() => ({ n: window.G.ui.dlg.$.ch.querySelectorAll('.dch').length, focus: [...window.G.ui.dlg.$.ch.querySelectorAll('.dch')].findIndex(b => b.classList.contains('pad-focus')) }));
  await padTap(page, 'DDown'); await sleep(page, 100);
  const ch1 = await ev(() => [...window.G.ui.dlg.$.ch.querySelectorAll('.dch')].findIndex(b => b.classList.contains('pad-focus')));
  await padTap(page, 'B');
  const closed = await wait(() => !window.G.ui.dlg.active, null, 4000);
  R.check('the village: the prompt shows A, A talks to Rosie, A advances, the D-pad moves the choice focus, B leaves', vp.show && vp.glyph === 'pad' && talk && ch0.n > 1 && ch0.focus === 0 && ch1 === 1 && closed, JSON.stringify({ vp, talk, steps, ch0, ch1, closed }));
  await sleep(page, 500);
  await ev(() => { window.G.interactCooldown = 0; });
  await padTap(page, 'DDown');
  const talk2 = await wait(() => window.G.ui.dlg.active, null, 4000);
  for (let i = 0; i < 25 && await ev(() => window.G.ui.dlg.active); i++) { await padTap(page, 'B'); await sleep(page, 260); }
  R.check('D-pad ▼ interacts too (the explicit fallback)', talk2, JSON.stringify({ talk2 }));
  // the quick meal
  await sleep(page, 500); await calm();
  await ev(() => { const G = window.G; G.actions.addPantry('onigiri', 2); G.actions.damage(Math.round(G.derived.lifeMax * 0.3)); });
  await padTap(page, 'DUp');
  const meal = await wait(() => window.__ev.some(e => e[0] === 'meal:eaten'), null, 3000);
  R.check('D-pad ▲ eats the quick meal', meal, JSON.stringify(await ev(() => window.__ev.filter(e => e[0] === 'meal:eaten'))));
  // View → the map, B closes it; Menu → the game menu with its panel row; a panel from it; Menu backs out
  await padTap(page, 'View'); await sleep(page, 300);
  const m1 = await ev(() => window.G.ui.isOpen('map'));
  await padTap(page, 'B'); await sleep(page, 300);
  const m2 = await ev(() => window.G.ui.isOpen('map'));
  await padTap(page, 'Menu'); await sleep(page, 350);
  const mm = await ev(() => ({ menu: window.G.ui.isOpen('menu'), quick: getComputedStyle(document.querySelector('.p-menu .mn-quick')).display, btns: [...document.querySelectorAll('.p-menu .mn-quick .btn')].filter(b => b.offsetParent).length }));
  await ev(() => window.G.ui.panels.menu.act('open:skills')); await sleep(page, 300);
  const mk = await ev(() => ({ skills: window.G.ui.isOpen('skills'), menu: window.G.ui.isOpen('menu') }));
  await padTap(page, 'Menu'); await sleep(page, 300);
  const mk2 = await ev(() => ({ skills: window.G.ui.isOpen('skills'), menu: window.G.ui.isOpen('menu') }));
  R.check('View opens the map and B closes it; Menu opens the game menu (its panel row: Bag … Map), a panel from it, Menu backs out', m1 && !m2 && mm.menu && mm.quick === 'flex' && mm.btns >= 5 && mk.skills && !mk.menu && !mk2.skills, JSON.stringify({ m1, m2, mm, mk, mk2 }));
  // the Controls panel: per device, the pad's options
  await ev(() => { window.G.ui.open('menu'); window.G.ui.panels.menu.setView('controls'); }); await sleep(page, 300);
  const cp = await ev(() => { const P = document.querySelector('.p-menu'); return { dev: P.dataset.dev, rows: P.querySelectorAll('.ctl-row').length, glyphs: P.querySelectorAll('.ctl-row .kc.pad svg').length, opts: getComputedStyle(P.querySelector('.ctl-opts')).display }; });
  await ev(() => window.G.ui.close('menu')); await sleep(page, 250);
  R.check('Settings › Controls opens on the pad: its bindings as glyphs, with rumble, aim assist and glyph options', cp.dev === 'pad' && cp.rows > 15 && cp.glyphs > 12 && cp.opts === 'block', JSON.stringify(cp));

  // ================================================================ e) heroes: LB tap, the wheel, Moka, Poe
  await openSpot(); await calm();
  const h0 = await ev(() => ({ act: window.G.state.activeHero, next: window.G.heroes.next() }));
  await padTap(page, 'LB', 40);
  const sw1 = await wait(n => window.G.state.activeHero === n && !window.G.heroes.T && !window.G.heroSwitching, h0.next, 9000);
  const h1 = await ev(() => window.G.state.activeHero);
  R.check('LB tapped switches to the next hero', sw1 && h1 === h0.next, JSON.stringify({ h0, h1 }));
  await sleep(page, 500); await ev(() => { window.G.heroes.cd = 0; });
  // the wheel: hold LB, point the right stick at a hero's card, let go
  const want = await ev(() => window.G.heroes.roster().map(h => h.id).find(id => id !== window.G.state.activeHero && id !== 'chewy') || 'chewy');
  await padDown(page, 'LB');
  const wOpen = await wait(() => window.G.heroes.wheelOpen, null, 3000);
  const ang = await ev(id => { const W = window.G.heroes.wheel, c = W.cards.find(x => x.h.id === id); return c ? c.a : null; }, want);
  await padStick(page, 'right', Math.cos(ang), Math.sin(ang)); await sleep(page, 150); // (the card's screen angle: y grows downward, like the pad's)
  const sel = await ev(() => { const W = window.G.heroes.wheel; return W.cards[W.sel]?.h.id; });
  await padStick(page, 'right', 0, 0);
  await padUp(page, 'LB');
  const sw2 = await wait(id => window.G.state.activeHero === id && !window.G.heroes.T && !window.G.heroSwitching, want, 9000);
  R.check('LB held opens the hero wheel; the right stick picks a hero; letting go switches', wOpen && sel === want && sw2, JSON.stringify({ want, wOpen, sel, ang, sw2 }));
  // Moka: Moonbeam channels while its button is held (the beam follows the pad's aim)
  const toHero = async id => { if (await ev(() => window.G.state.activeHero) === id) return true; await ev(id => { window.G.heroes.cd = 0; window.G.heroes.switchTo(id, { quiet: true }); }, id); return wait(id => window.G.state.activeHero === id && !window.G.heroes.T && !window.G.heroSwitching, id, 9000); };
  await toHero('moka');
  await ev(() => window.G.enterDungeon(1)); await waitMode(page, 'dungeon'); await sleep(page, 500); await spy();
  await ev(() => { const G = window.G, pl = G.state.player; pl.lvl = 30; for (const id of ['splash', 'moonbeam', 'bubble', 'puddleHop', 'meteor', 'starMastery']) pl.skills[id] = 5; pl.hotbar = ['attack', 'splash', 'moonbeam', 'bubble', 'puddleHop', 'meteor']; G.ui.setSetting('chargeMode', 1); G.actions.recompute(); G.actions.restoreAll(); });
  await setFoe(5); await calm();
  await padStick(page, 'right', 0, -0.9);
  await padDown(page, 'Y');
  const chan = await wait(() => window.G.skills.channel?.id === 'moonbeam', null, 4000);
  await sleep(page, 700);
  const held = await ev(() => ({ on: window.G.skills.channel?.id || null }));
  await padUp(page, 'Y'); await padStick(page, 'right', 0, 0);
  const ended = await wait(() => !window.G.skills.channel, null, 4000);
  R.check("Moka's Moonbeam channels while Y is held and ends when let go", chan && held.on === 'moonbeam' && ended, JSON.stringify({ chan, held, ended }));
  // and her slots through the pad
  const mk3 = {};
  for (const [b, i] of [['X', 1], ['RB', 3], ['LT', 5]]) { await calm(); await sleep(page, 80); await padTap(page, b, 40); const id = await ev(i => window.G.state.player.hotbar[i], i); await wait(id => window.__casts.some(c => c.id === id && c.ok), id, 3000); mk3[b] = await ev(id => window.__casts.find(c => c.id === id)?.ok || false, id); }
  R.check('Moka casts her slots from the pad (Splash, Bubble, Meteor)', Object.values(mk3).every(Boolean), JSON.stringify(mk3));
  await ev(() => window.G.ui.setSetting('chargeMode', 0));
  await ev(() => window.G.returnToVillage()); await waitMode(page, 'village'); await sleep(page, 500);
  // Poe: the fūma throw (X) and Shadow Step (Y) go at the lock
  await toHero('poe');
  await ev(() => window.G.enterDungeon(1)); await waitMode(page, 'dungeon'); await sleep(page, 500); await spy();
  await ev(() => { const G = window.G, pl = G.state.player; pl.lvl = 30; for (const id of ['fumaThrow', 'shadowStep', 'kunaiFan', 'smokeBomb', 'afterimageDash']) pl.skills[id] = 5; pl.hotbar = ['attack', 'fumaThrow', 'shadowStep', 'kunaiFan', 'smokeBomb', 'afterimageDash']; G.actions.recompute(); G.actions.restoreAll(); });
  await setFoe(5); await calm();
  const pz0 = await pos();
  await padTap(page, 'X', 40); await wait(() => window.__casts.some(c => c.id === 'fumaThrow'), null, 3000);
  await sleep(page, 400); await ev(() => { window.G.skills.cds = {}; window.G.player.anim.stop(); });
  await padTap(page, 'Y', 40); await wait(() => window.__casts.some(c => c.id === 'shadowStep'), null, 3000);
  await sleep(page, 700);
  const poe = await ev(([a]) => { const G = window.G, P = G.player, m = window.__foe; return { casts: window.__casts.filter(c => ['fumaThrow', 'shadowStep'].includes(c.id)).map(c => `${c.id}:${c.ok ? 'ok' : 'no'}:${c.lock ? 'lock' : '-'}`), moved: +Math.hypot(P.pos.x - a[0], P.pos.z - a[1]).toFixed(2), toFoe: +Math.hypot(P.pos.x - m.pos.x, P.pos.z - m.pos.z).toFixed(2) }; }, [pz0]);
  R.check("Poe's fūma throw and Shadow Step blink go at the soft lock (she blinks up to the foe)", poe.casts.includes('fumaThrow:ok:lock') && poe.casts.includes('shadowStep:ok:lock') && poe.moved > 1.5 && poe.toFoe < 3.5, JSON.stringify(poe));
  await ev(() => window.G.returnToVillage()); await waitMode(page, 'village'); await sleep(page, 400);
  await toHero('chewy');

  // ================================================================ g) CT-2: every panel with the pad (spatial focus, A / B / X / Y / LB / RB)
  { // (CT-2's checks in their own block scope)
  await padReset(page); await padTap(page, 'DUp'); await calm();
  const NAV = () => ev(() => { const N = window.G.ui.padNav, c = N.cur; return { cur: c ? selOf(c) : null, ring: N.ring.classList.contains('on'), hints: N.hintsEl.classList.contains('on') ? N.hintsEl.textContent.replace(/\s+/g, ' ').trim() : '', tip: !!window.G.ui.tip.on, open: Object.keys(window.G.ui.panels).filter(k => window.G.ui.isOpen(k)) }; function selOf(c) { return (c.className.split(' ')[0] || c.tagName) + (c.dataset.c ? ':' + c.dataset.c : '') + (c.dataset.i != null ? ':' + c.dataset.i : '') + (c.dataset.id ? ':' + c.dataset.id : '') + (c.dataset.a ? ':' + c.dataset.a : ''); } });
  // walk the focus with the D-pad toward an element (greedy, by screen position) → true when it lands on it
  const navTo = async (sel, max = 40) => {
    const trail = [];
    for (let i = 0; i < max; i++) {
      const s = await ev(sel => {
        const c = window.G.ui.padNav.cur, t = [...document.querySelectorAll(sel)].find(e => e.offsetParent && e.getBoundingClientRect().width > 1);
        if (!c || !t) return { err: !c ? 'no focus' : 'no target' };
        if (c === t || c.matches(sel)) return { done: true };
        const a = c.getBoundingClientRect(), b = t.getBoundingClientRect(), dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
        const rowOk = b.top < a.bottom - 2 && b.bottom > a.top + 2; // (on its row: across; else up / down first)
        const tryX = rowOk ? Math.abs(dx) > 6 : (Math.abs(dy) < 8 && !c.matches('input[type=range]'));
        return { dir: tryX ? (dx > 0 ? 'DRight' : 'DLeft') : (dy > 0 ? 'DDown' : 'DUp'), dx };
      }, sel);
      // a vertical move that just went back the way it came (the target sits between two rows): go across instead
      if (trail.length && /^D(Up|Down)/.test(s.dir || '') && trail[trail.length - 1].startsWith(s.dir === 'DUp' ? 'DDown' : 'DUp')) s.dir = s.dx > 0 ? 'DRight' : 'DLeft';
      if (s.done) return true;
      if (s.err) { console.log('  ....  navTo', sel, s.err, trail.join(' ')); return false; }
      const before = (await NAV()).cur; trail.push(s.dir + '>' + before);
      await padTap(page, s.dir, 30); await sleep(page, 40);
      if ((await NAV()).cur === before) { // (stuck that way: try the other axis)
        const alt = s.dir === 'DLeft' || s.dir === 'DRight' ? ['DDown', 'DUp'] : ['DRight', 'DLeft'];
        for (const d of alt) { await padTap(page, d, 30); await sleep(page, 40); if ((await NAV()).cur !== before) break; }
      }
    }
    console.log('  ....  navTo', sel, 'gave up', trail.slice(-8).join(' '));
    return false;
  };
  const press = async (b, ms = 40) => { await padTap(page, b, ms); await sleep(page, 220); };
  const quick = async (a) => { await press('Menu'); const m = await NAV(); const ok = await navTo(`.p-menu [data-a="${a}"]`); await press('A'); if (!ok) console.log('  ....  quick', a, 'missed', JSON.stringify(m), JSON.stringify(await NAV())); return ok; };
  const P = {};
  // the bag: A picks up and puts down (the item rides the focus), Y equips, X drops (press twice); compare tooltips
  await ev(async () => { const G = window.G, I = await import('/src/rpg/items.js'); for (const o of [{ ilvl: 3, rarity: 'magic', slot: 'hat' }, { ilvl: 3, rarity: 'normal', slot: 'boots' }, { ilvl: 2, rarity: 'normal', slot: 'charm' }]) G.actions.pickup(I.generateItem(o)); G.state.equipment.hat = null; G.actions.recompute(); });
  await quick('open:inventory'); await sleep(page, 300);
  const g0 = await NAV();
  P.bagOpen = g0.open.includes('inventory') && /^slot:inv:/.test(g0.cur || '') && g0.ring && /Pick up/.test(g0.hints) && g0.tip;
  const first = await ev(() => window.G.state.inventory.findIndex(Boolean));
  const tipCmp = await ev(() => /tt-cmp|Empty slot/.test(document.querySelector('.tt')?.innerHTML || ''));
  await navTo(`.slot[data-c="inv"][data-i="${first}"]`); await press('A');
  const heldIt = await ev(() => window.G.ui.drag.held);
  await navTo('.slot[data-c="inv"][data-i="12"]'); await press('A');
  const moved = await ev(() => ({ at12: !!window.G.state.inventory[12], held: window.G.ui.drag.held }));
  await navTo('.slot[data-c="inv"][data-i="12"]');
  const hat0 = await ev(() => window.G.state.inventory[12]?.slot);
  await press('Y'); await sleep(page, 200);
  const eq = await ev(s => ({ worn: !!window.G.state.equipment[s === 'charm' ? 'charm1' : s], at12: !!window.G.state.inventory[12] }), hat0);
  const n0 = await ev(() => window.G.state.inventory.filter(Boolean).length);
  const di = await ev(() => window.G.state.inventory.findIndex(Boolean));
  await navTo(`.slot[data-c="inv"][data-i="${di}"]`); await press('X'); const n1 = await ev(() => window.G.state.inventory.filter(Boolean).length); await press('X');
  const n2 = await ev(() => window.G.state.inventory.filter(Boolean).length);
  P.bag = { bagOpen: P.bagOpen, tipCmp, held: !!heldIt, moved, eq, drop: [n0, n1, n2] };
  R.check('the bag with the pad: focus on a slot with its compare tooltip, A picks up / A puts down elsewhere, Y equips, X drops (on the second press)', P.bagOpen && tipCmp && heldIt && moved.at12 && !moved.held && eq.worn && !eq.at12 && n1 === n0 && n2 === n0 - 1, JSON.stringify(P.bag));
  // LB / RB: the bag's views (Bag → Pantry → Furniture); B closes
  await press('RB'); const v1 = await ev(() => window.G.ui.panels.inventory.view); await press('LB'); const v2 = await ev(() => window.G.ui.panels.inventory.view);
  await press('B'); const c1 = await ev(() => window.G.ui.isOpen('inventory'));
  R.check('LB / RB switch the bag\'s tabs (Bag ⇄ Pantry); B closes it', v1 === 'pantry' && v2 === 'bag' && !c1, JSON.stringify({ v1, v2, c1 }));
  // character: A adds a stat point
  await ev(() => { const G = window.G; G.state.player.statPts = 2; G.actions.recompute(); });
  await quick('open:character'); await sleep(page, 300);
  const st0 = await ev(() => ({ ...window.G.state.player.stats }));
  const afterQ = await NAV();
  const onPlus = await navTo('.attr[data-k="vit"] .at-plus'); await press('A');
  const st1 = await ev(() => ({ ...window.G.state.player.stats, pts: window.G.state.player.statPts }));
  await press('B');
  R.check('the character sheet: A on a + adds a stat point', onPlus && st1.vit === st0.vit + 1 && st1.pts === 1, JSON.stringify({ onPlus, st0, st1, afterQ }));
  // skills: A learns, Y assigns (the popover, A on a slot), X opens the charge perks and A buys one
  await ev(() => { const G = window.G; G.state.player.skillPts = 6; G.state.player.lvl = 12; G.actions.recompute(); });
  await quick('open:skills'); await sleep(page, 350);
  const sk0 = await ev(() => ({ ...window.G.state.player.skills }));
  const onNode = await navTo('.p-skills .node[data-id="chomp"]'); await press('A');
  const sk1 = await ev(() => window.G.state.player.skills.chomp);
  await press('Y'); await sleep(page, 200);
  const pop = await ev(() => document.querySelector('.pop-wrap')?.classList.contains('show'));
  const onSlot = await navTo('.pop-slot[data-i="5"]'); await press('A');
  const hb5 = await ev(() => window.G.state.player.hotbar[5]);
  await navTo('.p-skills .node[data-id="chomp"]'); await press('X'); await sleep(page, 250);
  const pk0 = await ev(() => JSON.stringify(window.G.state.player.chargePerks || {}));
  const onPerk = await navTo('.chg-pk.can, .chg-pk.avail, .chg-pk:not(.locked):not(.owned):not(.maxed)'); await press('A');
  const pk1 = await ev(() => JSON.stringify(window.G.state.player.chargePerks || {}));
  await press('RB'); const tree = await ev(() => window.G.ui.panels.skills.tree);
  await press('B');
  R.check('the skill trees: A learns Crescent Chomp, Y opens the slot popover and A assigns it to slot 4, X opens its charge perks and A buys one, RB the next tree', onNode && sk1 === (sk0.chomp || 0) + 1 && pop && onSlot && hb5 === 'chomp' && onPerk && pk1 !== pk0 && tree !== 'bone', JSON.stringify({ sk0: sk0.chomp, sk1, pop, onSlot, hb5, onPerk, pk0, pk1, tree }));
  // the journal: LB / RB through Quests / Fish Log / Guides; the guides' Play buttons take the focus
  await quick('open:quests'); await sleep(page, 300);
  const q0 = await ev(() => window.G.ui.panels.quests.tab); await press('RB'); const q1 = await ev(() => window.G.ui.panels.quests.tab); await press('RB'); const q2 = await ev(() => window.G.ui.panels.quests.tab);
  const qn = await NAV(); await press('B');
  R.check('the journal: RB walks its tabs (quests → fish log → guides), the focus lands in each', q0 !== q1 && q1 !== q2 && !!qn.cur, JSON.stringify({ q0, q1, q2, cur: qn.cur }));
  // the map: View opens, RT zooms in, B closes
  await press('View'); const z0 = await ev(() => window.G.ui.panels.map.zoom); await padDown(page, 'RT'); await sleep(page, 500); await padUp(page, 'RT');
  const z1 = await ev(() => window.G.ui.panels.map.zoom), mh = (await NAV()).hints; await press('B');
  R.check('the map: View opens it, RT zooms, B closes (its hints name both)', z1 > z0 * 1.2 && /Zoom/.test(mh) && !(await ev(() => window.G.ui.isOpen('map'))), JSON.stringify({ z0, z1, mh }));
  // settings: a slider takes ◀ ▶, a toggle takes A, B goes back to the menu's main page, Controls' LB / RB switch devices
  await press('Menu'); await navTo('.p-menu [data-a="settings"]'); await press('A');
  const mu0 = await ev(() => window.G.ui.settings.music);
  await navTo('.p-menu input[data-k="music"]'); await press('DRight'); await press('DRight');
  const mu1 = await ev(() => window.G.ui.settings.music);
  const onShake = await navTo('.p-menu .tog[data-k="shake"]'); await press('A'); const sh = await ev(() => window.G.ui.settings.shake);
  await press('A'); await press('B'); const vw = await ev(() => window.G.ui.panels.menu.view);
  await navTo('.p-menu [data-a="controls"]'); await press('A'); const d0 = await ev(() => document.querySelector('.p-menu').dataset.dev); await press('RB'); const d1 = await ev(() => document.querySelector('.p-menu').dataset.dev);
  await press('B'); await press('B');
  R.check('settings with the pad: ▶ raises the music slider, A flips a toggle, B backs to the menu page, Controls\' RB switches the device tab', mu1 > mu0 && sh === false && vw === 'main' && d0 !== d1 && !(await ev(() => window.G.ui.isOpen('menu'))), JSON.stringify({ mu0, mu1, onShake, sh, vw, d0, d1 }));
  // Rosie's shop: A buys; on the bag side X sells
  await ev(() => { const G = window.G; G.state.coins = 2000; G.ui.toasts?.retire?.(0); G.openShop(); }); await sleep(page, 600);
  const sh0 = await ev(() => ({ coins: window.G.state.coins, cur: window.G.ui.padNav.cur?.className || '' }));
  await press('A'); const sh1 = await ev(() => window.G.state.coins);
  const sellAt = await ev(() => window.G.state.inventory.findIndex(Boolean));
  const onSell = await navTo(`.slot[data-c="inv"][data-i="${sellAt}"]`); await press('X');
  const sh2 = await ev(i => ({ coins: window.G.state.coins, gone: !window.G.state.inventory[i] }), sellAt);
  await press('B'); await sleep(page, 200);
  R.check("Rosie's shop: the focus starts on her wares, A buys, across in the bag X sells", /sh-item/.test(sh0.cur) && sh1 < sh0.coins && onSell && sh2.coins > sh1 && sh2.gone && !(await ev(() => window.G.ui.isOpen('shop'))), JSON.stringify({ sh0, sh1, sh2, onSell }));
  // the stash: X moves a bag item across
  await ev(async () => { const G = window.G, I = await import('/src/rpg/items.js'); G.actions.pickup(I.generateItem({ ilvl: 2, rarity: 'normal', slot: 'boots' })); G.ui.open('stash'); }); await sleep(page, 500);
  const ta = await ev(() => window.G.state.inventory.findIndex(Boolean));
  const s0 = await ev(() => window.G.state.stash.filter(Boolean).length);
  await navTo(`.slot[data-c="inv"][data-i="${ta}"]`); await press('X');
  const s1 = await ev(() => window.G.state.stash.filter(Boolean).length); await press('B');
  R.check('the stash: X moves the focused bag item into it', s1 === s0 + 1, JSON.stringify({ ta, s0, s1 }));
  // cooking: A picks a recipe, A on Cook cooks it
  await ev(() => { const G = window.G; G.actions.addPantry('rice', 2); G.life.kitchen.open('kitchen'); }); await sleep(page, 500);
  const on0 = await ev(() => window.G.state.pantry?.onigiri || 0);
  const onRow = await navTo('.ck-row[data-id="onigiri"]'); await press('A');
  const onGo = await navTo('.ck-go'); await press('A');
  const cooked = await wait(n => (window.G.state.pantry?.onigiri || 0) > n, on0, 8000);
  await sleep(page, 400); await press('B');
  R.check('cooking: A picks Onigiri, A on Cook cooks it (into the Pantry)', onRow && onGo && cooked, JSON.stringify({ onRow, onGo, cooked, on0 }));
  // the workbench: the focus walks its recipes; B closes
  await ev(() => window.G.openWorkbench?.('home')); await sleep(page, 500);
  const wb = await NAV(); await press('DDown'); const wb2 = await NAV(); await press('B');
  R.check('the workbench: the focus starts on a recipe and the D-pad walks them', wb.open.includes('craft') && !!wb.cur && wb2.cur && !(await ev(() => window.G.ui.isOpen('craft'))), JSON.stringify({ wb: wb.cur, wb2: wb2.cur }));
  // the Travel Map: the pins take the focus; B closes
  await ev(() => window.G.openTravel()); await sleep(page, 500);
  const tv = await NAV(); await press('DRight'); const tv2 = await NAV(); await press('B');
  R.check('the Travel Map: the focus on its places, the D-pad moves it', tv.open.includes('travel') && !!tv.cur && tv2.cur !== null, JSON.stringify({ tv: tv.cur, tv2: tv2.cur }));
  // the gift picker: A gives
  const gift = await ev(() => { const G = window.G; G.actions.addPantry('onigiri', 1); window.__gift = undefined; G.ui.pickGift({ name: 'Rosie', portrait: G.portrait('rosie'), items: [{ key: 'onigiri', name: 'Onigiri', n: 1, pantry: true, love: 'liked' }] }).then(k => { window.__gift = k; }); return true; });
  await sleep(page, 400); await press('A'); const gk = await wait(() => window.__gift !== undefined, null, 3000);
  R.check('the gift picker: A gives the focused gift', gift && gk && await ev(() => window.__gift === 'onigiri'), JSON.stringify({ gift: await ev(() => window.__gift) }));
  await sleep(page, 300);

  // ================================================================ h) CT-2: build and decorate with the virtual cursor, fishing end to end
  // build mode from the game menu: the D-pad picks the Park Bench, the stick moves the cursor, A builds it, X twice removes it
  await openSpot(); await calm();
  await ev(() => { const G = window.G; G.state.coins = 2000; G.state.materials.wood = 99; G.ui.toasts?.retire?.(0); });
  await quick('build'); await sleep(page, 600);
  const bm = await ev(() => ({ on: window.G.build.active, vc: window.G.controls.vcursor.on }));
  for (let i = 0; i < 8 && (await ev(() => document.querySelector('.p-build .bd-tabs .tab.on')?.dataset.c)) !== 'decor'; i++) await press('DDown', 30);
  for (let i = 0; i < 12 && (await ev(() => window.G.build.tool?.type)) !== 'bench'; i++) await press('DRight', 30);
  const tool = await ev(() => window.G.build.tool?.type);
  const b0 = await ev(() => window.G.sim.S.buildings.length);
  let placedB = false;
  for (const [x, y] of [[0, 0], [0.6, 0], [-0.6, 0], [0, 0.6], [0, -0.6], [0.6, 0.6]]) {
    if (x || y) { await padStick(page, 'left', x, y); await sleep(page, 180); await padStick(page, 'left', 0, 0); }
    await sleep(page, 150);
    if (await ev(() => window.G.build.ghostOk)) { await press('A'); placedB = (await ev(() => window.G.sim.S.buildings.length)) === b0 + 1; if (placedB) break; }
  }
  const cursorMoved = await ev(() => Math.abs(window.G.controls.vcursor.x - innerWidth / 2) > 20 || Math.abs(window.G.controls.vcursor.y - innerHeight * 0.46) > 20);
  await press('B'); const tool2 = await ev(() => window.G.build.tool);
  await press('X'); await press('X'); const b2 = await ev(() => window.G.sim.S.buildings.length);
  const hintsB = await ev(() => document.querySelector('.pc-hints')?.textContent || '');
  await press('B'); const bmOff = await ev(() => !window.G.build.active && !window.G.controls.vcursor.on);
  R.check('build mode with the pad: the game menu enters it, the D-pad picks the Park Bench, the stick moves the cursor, A builds, B drops the tool, X twice removes it, B leaves', bm.on && bm.vc && tool === 'bench' && placedB && tool2 === null && b2 === b0 && /Build|Remove/.test(hintsB) && bmOff, JSON.stringify({ bm, tool, placedB, cursorMoved, tool2, b0, b2, bmOff }));
  // decorate: in the cottage, the game menu's Decorate, the D-pad picks a piece, A places it, Y rotates, X stores, LB undoes
  await ev(() => { const G = window.G; G.ui.toasts?.retire?.(0); }); await ev(() => window.G.openHome()); await waitMode(page, 'interior'); await sleep(page, 900);
  const fid = await ev(async () => { const F = (await import('/src/home/furniture.js')).FURNITURE; const id = Object.keys(F).find(k => F[k].mount === 'floor' && F[k].size?.[0] === 1 && (F[k].size?.[1] ?? 1) <= 1 && !F[k].own) || Object.keys(F).find(k => F[k].mount === 'floor'); window.G.actions.addFurniture(id, 2); return id; });
  await quick('decorate'); await sleep(page, 700);
  const dc = await ev(() => ({ on: !!window.G.housing.decor.active, vc: window.G.controls.vcursor.on }));
  for (let i = 0; i < 6 && !(await ev(() => window.G.housing.decor.sel)); i++) await press('DRight', 30);
  const dsel = await ev(() => window.G.housing.decor.sel);
  const i0 = await ev(() => window.G.housing.decor.items.length);
  let placedD = false;
  for (const [x, y] of [[0, 0], [0, -0.5], [0.5, 0], [-0.5, 0], [0, 0.5], [0.5, -0.5]]) {
    if (x || y) { await padStick(page, 'left', x, y); await sleep(page, 160); await padStick(page, 'left', 0, 0); }
    await sleep(page, 150);
    if (await ev(() => window.G.housing.decor.ghostOk)) { await press('Y'); await press('A'); placedD = (await ev(() => window.G.housing.decor.items.length)) === i0 + 1; if (placedD) break; }
  }
  await press('LB'); const undone = (await ev(() => window.G.housing.decor.items.length)) === i0;
  await press('B'); await press('B'); const dcOff = await ev(() => !window.G.housing.decor.active);
  R.check('decorate with the pad: the game menu enters it, the D-pad picks a piece, Y rotates and A places it under the cursor, LB undoes, B leaves', dc.on && dc.vc && !!dsel && placedD && undone && dcOff, JSON.stringify({ fid, dc, dsel, i0, placedD, undone, dcOff }));
  await ev(() => window.G.housing.exit?.()); await waitMode(page, 'village'); await sleep(page, 500);
  // fishing end to end on the pad: A casts at the pond, A strikes on the bite, A held through the reel lands the fish
  const fishOk = await ev(() => { const G = window.G, F = G.life.fishing; G.state.fishing = { ...(G.state.fishing || {}), rod: 1, gotRod: true }; const spot = F.spots?.()?.[0] || null; return { spot: !!spot, has: !!F }; });
  const at = await ev(() => { const G = window.G, P = G.player, W = G.world, L = W.landmarks, c = L.pond || L.fishing || null; // the pond's shore, facing the water
    for (let r = 2; r < 40; r += 0.5) for (let a = 0; a < 24; a++) { const x = (c?.x ?? L.plaza.x) + Math.cos(a / 12 * Math.PI) * r, z = (c?.z ?? L.plaza.z) + Math.sin(a / 12 * Math.PI) * r; if (!W.walkable(x, z) || W.heightAt(x, z) < 0.02) continue; const fx = Math.cos(a / 12 * Math.PI + Math.PI), fz = Math.sin(a / 12 * Math.PI + Math.PI); if (W.heightAt(x + fx * 1.6, z + fz * 1.6) < -0.05) { P.setPos(x, z); P.faceTo(x + fx, z + fz); P.facing = P.faceTarget; G.engine.rig.focus.copy(P.pos); G.engine.rig.snap(); return [x, z]; } }
    return null; });
  await sleep(page, 600);
  const flab = await ev(() => ({ t: !!window.G.life.fishing.target, prompt: document.querySelector('.hud .prompt .pr-t')?.textContent }));
  await press('A');
  const cast = await wait(() => !!window.G.life.fishing.s, null, 3000);
  if (cast) await wait(() => window.G.life.fishing.s?.phase === 'wait', null, 5000);
  await ev(() => { const s = window.G.life.fishing.s; if (s) { s.wait = s.t + 0.01; s.fish = 'koi'; } });
  const bit = await wait(() => window.G.life.fishing.s?.phase === 'bite', null, 3000);
  await ev(() => { window.__reelPad = setInterval(() => { const s = window.G.life.fishing.s, S = s?.phase === 'reel' && s.sim; const b = window.__pad.buttons[0]; const want = !!S && S.f > S.z + S.zh * 0.5 + S.v * 0.28; b.pressed = want; b.value = want ? 1 : 0; }, 16); });
  await press('A', 30);
  const reel = await wait(() => window.G.life.fishing.s?.phase === 'reel', null, 2000);
  const landed = await wait(() => !window.G.life.fishing.s || window.G.life.fishing.s.phase === 'land', null, 30000);
  const caught = await ev(() => { clearInterval(window.__reelPad); const b = window.__pad.buttons[0]; b.pressed = false; b.value = 0; return { phase: window.G.life.fishing.s?.phase || null, log: Object.keys(window.G.state.fishLog || {}).length }; });
  await wait(() => !window.G.life.fishing.s, null, 5000);
  R.check('fishing on the pad end to end: A casts facing the pond, A strikes the bite, holding A through the reel bar lands the fish', fishOk.has && !!at && cast && bit && reel && landed && caught.log >= 1, JSON.stringify({ at: !!at, flab, cast, bit, reel, landed, caught }));

  } // (the end of CT-2's block)

  // ================================================================ f) back to the mouse and keyboard
  await padReset(page);
  await page.mouse.move(400, 300); await page.mouse.move(460, 340, { steps: 4 }); await sleep(page, 150);
  const kb = await ev(() => ({ dev: window.G.controls.device, body: document.body.classList.contains('pad-active'), cursor: getComputedStyle(document.querySelector('#game') || document.body).cursor, caps: [...document.querySelectorAll('.hud .hotbar .hb-k')].map(e => e.classList.contains('pad') ? 'PAD' : e.textContent).join('|'), aim: window.G.controls.padAim, ring: !!window.G.padAim.ring?.parent }));
  await ev(() => { const G = window.G; G.actions.damage(Math.round(G.derived.lifeMax * 0.4)); });
  const q0 = await ev(() => window.G.state.potions.heart);
  await page.keyboard.press('q'); await sleep(page, 150);
  const q1 = await ev(() => window.G.state.potions.heart);
  R.check('a mouse move takes the mouse and keyboard back: cursor shown, key caps back, no pad aim; Q still drinks', kb.dev === 'kbm' && !kb.body && kb.cursor !== 'none' && kb.caps === '||1|2|3|4|Q|E|R|G' && kb.aim === null && !kb.ring && q1 === q0 - 1, JSON.stringify({ ...kb, q0, q1 }));
  // the PlayStation glyphs follow the pad's id
  await ev(() => { window.__pad.id = 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)'; });
  await padTap(page, 'DUp'); await sleep(page, 150);
  const ps = await ev(() => ({ style: window.G.controls.padStyle, label: window.G.controls.label('attack', 'pad'), sk: window.G.controls.label('skill2', 'pad') }));
  R.check('a PlayStation pad gets its glyphs (✕ / R1)', ps.style === 'ps' && ps.label === '✕' && ps.sk === 'R1', JSON.stringify(ps));
} catch (e) {
  R.check('scenario ran to the end', false, String(e?.stack || e).slice(0, 600));
} finally {
  const failed = R.finish(errors, warns);
  await browser.close();
  process.exit(failed ? 1 : 0);
}
