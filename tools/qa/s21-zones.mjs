// Scenario 21: the zones phase A foundations (docs/ZONES.md §8, §9; ROADMAP Z-A1 to Z-A5).
//  a) sprint: hold Shift while walking (WASD and click-to-move) for +40%, for all three heroes; the charge slow-walk, Poe's
//     Vanish and the Zoomies shrine still apply; it drops during an attack and resumes with Shift still held; Toggle mode;
//     Shadow keeps up without teleporting
//  b) Alt+LMB attacks in place in the Burrow; Shift+LMB and Ctrl+LMB walk; Alt never reaches the browser or sticks;
//     the loot labels on a held Z
//  c) DungeonDef: G.enterDungeon(n) and G.enterDungeon({ id, floor }) give the same Burrow; a stub zone dungeon runs
//     floor 1 → stairs → floor 2 (its boss), no Burrow waypoints / deepest
//  d) seeds: a pinned ?dseed gives the old layouts; without it each entry rerolls (state.dungeon.runs)
//  e) state.zones: an old save's state.regions migrates; the regions view still reads and writes; events carry
//     { zone, dungeon, floor, tier }; dungeon:cleared on a Burrow boss
//  f) quest steps in the game: a kill step filtered to the Burrow, a dungeonFloor step, the quest pointer to the stairs
import { launch, boot, waitMode, sleep, makeReport, BASE } from './lib.mjs';

const R = makeReport('S21 zones phase A');
const { browser, page, errors, warns } = await launch();
const ev = (fn, arg) => page.evaluate(fn, arg);

// average ground speed over n frames (m/s of game time), sampled in the page
const measure = (frames = 30) => ev(n => new Promise(res => {
  const G = window.G, P = G.player; let d = 0, t = 0, last = P.pos.clone(), t0 = G.engine.time, k = 0;
  const step = () => {
    const now = G.engine.time, dt = now - t0; t0 = now;
    d += Math.hypot(P.pos.x - last.x, P.pos.z - last.z); t += dt; last.copy(P.pos);
    if (++k < n) requestAnimationFrame(step); else res({ v: +(d / Math.max(1e-6, t)).toFixed(3), sprint: P.sprint.on, k: +P.sprint.k.toFixed(2), mul: +P.speedMul.toFixed(3), anim: +P.anim.sprintAmt.toFixed(2) });
  };
  requestAnimationFrame(step);
}), frames);
// a spot in the village with ~22 m of open ground straight ahead of W (camera forward), Shadow beside the hero
const openRun = () => ev(() => {
  const G = window.G, W = G.world, { f } = G.engine.rig.groundAxes(), L = W.landmarks;
  const clear = (x, z) => { for (let s = 0; s <= 24; s += 0.5) { const px = x + f.x * s, pz = z + f.z * s; if (!W.walkable(px, pz) || W.collision.solidAt(px, pz, 0.45) || G.sim.buildingAt(px, pz)) return false; } return true; };
  for (let r = 0; r < 70; r += 2) for (let a = 0; a < 16; a++) {
    const x = L.spawn.x + Math.cos(a / 16 * Math.PI * 2) * r, z = L.spawn.z + Math.sin(a / 16 * Math.PI * 2) * r;
    if (clear(x, z)) { G.player.setPos(x, z); G.player.moveTarget = null; G.companion.setPos(x - f.x * 1.2, z - f.z * 1.2); return { x, z }; }
  }
  return null;
});
const holdWalk = async (shift, frames = 26) => {
  await openRun(); await sleep(page, 150);
  if (shift) await page.keyboard.down('Shift');
  await page.keyboard.down('w');
  await page.waitForFunction(s => { const P = window.G.player; return P.anim.speed > 3.5 && (!s || P.sprint.k > 0.97); }, shift, { timeout: 5000 }).catch(() => {});
  const m = await measure(frames);
  await page.keyboard.up('w'); if (shift) await page.keyboard.up('Shift');
  await page.waitForFunction(() => window.G.player.anim.speed < 0.3, null, { timeout: 5000 }).catch(() => {});
  return m;
};
const near = (a, b, tol = 0.06) => Math.abs(a / b - 1) < tol;

try {
  await boot(page, 'fresh&nointro&notut&hour=11');
  await ev(() => { const G = window.G; G.state.flags.burrowTut = true; G.state.flags.hints = { sprint: true }; });

  // ---------------------------------------------------------------- a) sprint
  const base = await ev(() => window.G.player.speed);
  const walk = await holdWalk(false), run = await holdWalk(true);
  R.check('sprint: Shift + W runs +40% (walk ≈ base speed, sprint ≈ ×1.4), the sprint pose blends in', near(walk.v, base) && near(run.v, base * 1.4) && run.sprint && run.anim > 0.8 && !walk.sprint, JSON.stringify({ base, walk, run }));
  // Shadow keeps up on a long sprint: no catch-up teleports, never far behind
  const pace = await (async () => {
    await openRun(); await ev(() => { window.G.companion.catchUps = 0; window.__maxD = 0; });
    await page.keyboard.down('Shift'); await page.keyboard.down('w');
    const t0 = await ev(() => window.G.engine.time);
    await page.waitForFunction(t => { const G = window.G, P = G.player, S = G.companion; window.__maxD = Math.max(window.__maxD, Math.hypot(P.pos.x - S.pos.x, P.pos.z - S.pos.z)); return G.engine.time - t > 3.2 || P.anim.speed < 1; }, t0, { timeout: 8000, polling: 'raf' }).catch(() => {});
    await page.keyboard.up('w'); await page.keyboard.up('Shift');
    return ev(t => ({ catchUps: window.G.companion.catchUps, maxD: +window.__maxD.toFixed(2), secs: +(window.G.engine.time - t).toFixed(2) }), t0);
  })();
  R.check('sprint: Shadow paces himself on the hero (no teleports, stays within ~6 m)', pace.catchUps === 0 && pace.maxD < 6.5 && pace.secs > 2, JSON.stringify(pace));
  // click-to-move with Shift held sprints too
  const click = await (async () => {
    const p0 = await openRun(); await sleep(page, 150);
    await ev(() => { const G = window.G, { f } = G.engine.rig.groundAxes(), P = G.player; P.moveTarget = new G.THREE.Vector3(P.pos.x + f.x * 20, P.pos.y, P.pos.z + f.z * 20); });
    const w = await (async () => { await page.waitForFunction(() => window.G.player.anim.speed > 3.5, null, { timeout: 4000 }).catch(() => {}); return measure(18); })();
    await page.keyboard.down('Shift');
    await page.waitForFunction(() => window.G.player.sprint.k > 0.97, null, { timeout: 4000 }).catch(() => {});
    const s = await measure(18);
    await page.keyboard.up('Shift'); await ev(() => { window.G.player.moveTarget = null; });
    return { p0: !!p0, w, s };
  })();
  R.check('sprint: click-to-move sprints while Shift is held', near(click.w.v, base) && near(click.s.v, base * 1.4) && click.s.sprint, JSON.stringify(click));
  // the charge slow-walk wins over the sprint; the Zoomies shrine stacks with it
  const mods = await ev(async () => {
    const G = window.G, P = G.player, out = {};
    P.chargeSlow = 0.55; out.chargeBlock = P.sprint.blocked(); P.chargeSlow = 1;
    G.combat.buffs.shrineZoom = { t: 30 }; return out;
  });
  const zoom = await holdWalk(true, 20);
  await ev(() => { delete window.G.combat.buffs.shrineZoom; });
  R.check('sprint: a charge wind-up blocks it (the slow walk stays); the Zoomies shrine stacks (×1.35 × 1.4)', mods.chargeBlock === 'charge' && near(zoom.v, base * 1.35 * 1.4, 0.07), JSON.stringify({ mods, zoom }));
  // Toggle mode: a tap latches it, a second tap ends it
  await ev(() => window.G.ui.setSetting('sprintMode', 1));
  const tog = await (async () => {
    await openRun(); await sleep(page, 120);
    await page.keyboard.down('w');
    await page.waitForFunction(() => window.G.player.anim.speed > 3.5, null, { timeout: 4000 }).catch(() => {});
    await page.keyboard.press('Shift');
    await page.waitForFunction(() => window.G.player.sprint.k > 0.97, null, { timeout: 4000 }).catch(() => {});
    const on = await measure(14);
    await page.keyboard.press('Shift');
    await page.waitForFunction(() => window.G.player.sprint.k < 0.02, null, { timeout: 4000 }).catch(() => {});
    const off = await measure(10);
    await page.keyboard.up('w');
    return { on, off };
  })();
  await ev(() => window.G.ui.setSetting('sprintMode', 0));
  R.check('sprint: Settings › Sprint Toggle — tap Shift to sprint, tap again to walk', near(tog.on.v, base * 1.4) && near(tog.off.v, base) && tog.on.sprint && !tog.off.sprint, JSON.stringify(tog));

  // ---------------------------------------------------------------- b) the Burrow: drop on attack, Alt+LMB, Shift+LMB, keys
  await ev(() => window.G.enterDungeon(1));
  await waitMode(page, 'dungeon'); await sleep(page, 500);
  await ev(() => { for (const m of window.G.dungeon.monsters) { m.status.stun = 9999; m.aggro = false; } });
  // a clear spot: the start, aim 3 m to the side where no monster is
  const aimAt = (dx, dz) => ev(([dx, dz]) => {
    const G = window.G, P = G.player, cam = G.engine.camera, p = new G.THREE.Vector3(P.pos.x + dx, P.pos.y, P.pos.z + dz).project(cam);
    return { x: (p.x * 0.5 + 0.5) * innerWidth, y: (-p.y * 0.5 + 0.5) * innerHeight };
  }, [dx, dz]);
  const startAt = () => ev(() => { const G = window.G, s = G.dungeon.startPos; G.player.setPos(s.x, s.z); G.player.moveTarget = null; G.player.anim.stop(); G.skills.cds = {}; });
  // drop on attack: Shift + W, then an attack; the sprint is held back while it swings, then comes back by itself
  await startAt(); await sleep(page, 200);
  const drop = await (async () => {
    await page.keyboard.down('Shift'); await page.keyboard.down('d');
    await page.waitForFunction(() => window.G.player.sprint.on, null, { timeout: 4000 }).catch(() => {});
    const before = await ev(() => window.G.player.sprint.on);
    const during = await ev(() => new Promise(res => {
      const G = window.G, P = G.player; G.skills.cds = {};
      G.skills.tryCast('attack', P.pos.clone().add(new G.THREE.Vector3(Math.sin(P.facing) * 2, 0, Math.cos(P.facing) * 2)));
      requestAnimationFrame(() => requestAnimationFrame(() => res({ on: P.sprint.on, why: P.sprint.why, act: P.anim.action?.name || null })));
    }));
    await page.waitForFunction(() => !window.G.player.anim.busy() && window.G.player.sprint.on, null, { timeout: 4000 }).catch(() => {});
    const after = await ev(() => ({ on: window.G.player.sprint.on, why: window.G.player.sprint.why }));
    await page.keyboard.up('d'); await page.keyboard.up('Shift');
    return { before, during, after };
  })();
  R.check('sprint: an attack drops it (why: attack) and it resumes while Shift is still held', drop.before && !drop.during.on && drop.during.why === 'attack' && drop.after.on, JSON.stringify(drop));
  // a roll drops it too
  const roll = await ev(() => { const P = window.G.player; P.rollCd = 0; P.roll(new window.G.THREE.Vector3(1, 0, 0)); return P.rollT > 0; });
  const rollWhy = await ev(() => new Promise(res => requestAnimationFrame(() => res(window.G.player.sprint.blocked()))));
  R.check('sprint: rolling blocks it', roll && rollWhy === 'roll', JSON.stringify({ roll, rollWhy }));
  // Alt+LMB: attack in place at the cursor (no monster under it), no walking
  await page.waitForFunction(() => !(window.G.player.rollT > 0), null, { timeout: 3000 });
  const clickWith = async (mod, dx) => {
    await startAt(); await sleep(page, 400);
    const a = await aimAt(dx, 0), p0 = await ev(() => [window.G.player.pos.x, window.G.player.pos.z]);
    const hover = await ev(a => !!window.G.combat.pickAtScreen(a.x, a.y, window.G.engine.camera), a);
    await page.mouse.move(a.x, a.y); await page.keyboard.down(mod); await page.mouse.down();
    // (an attack is a busy action; a samurai's sheathing flourish from the last combo isn't)
    await page.waitForFunction(() => window.G.player.anim.busy() || !!window.G.player.moveTarget, null, { timeout: 2000 }).catch(() => {});
    const s = await ev(() => { const P = window.G.player; return { act: P.anim.busy() ? P.anim.action.name : null, mt: !!P.moveTarget }; });
    await page.mouse.up(); await page.keyboard.up(mod);
    await page.waitForFunction(() => !window.G.player.moveTarget && !window.G.player.anim.busy(), null, { timeout: 4000 }).catch(() => {});
    const p1 = await ev(() => [window.G.player.pos.x, window.G.player.pos.z]);
    return { hover, ...s, moved: +Math.hypot(p1[0] - p0[0], p1[1] - p0[1]).toFixed(2) };
  };
  const alt = await clickWith('Alt', 3);
  R.check('Alt+LMB attacks in place at the cursor (an attack plays, no walk)', !alt.hover && !!alt.act && !alt.mt && alt.moved < 0.4, JSON.stringify(alt));
  const ctl = await clickWith('Control', 3.5);
  R.check('Ctrl+LMB on open floor just walks now (the old binding is gone)', !ctl.act && ctl.mt && ctl.moved > 2.5, JSON.stringify(ctl));
  // Shift+LMB on open floor walks there now (and sprints), no attack
  await startAt(); await sleep(page, 500);
  const sh = await (async () => {
    const a = await aimAt(3.5, 0), p0 = await ev(() => [window.G.player.pos.x, window.G.player.pos.z]);
    await page.mouse.move(a.x, a.y); await page.keyboard.down('Shift'); await page.mouse.down(); await sleep(page, 60); await page.mouse.up();
    await page.waitForFunction(() => window.G.player.anim.speed > 2, null, { timeout: 2000 }).catch(() => {});
    const s = await ev(() => ({ act: window.G.player.anim.action?.name || null, mt: !!window.G.player.moveTarget, sprint: window.G.player.sprint.on }));
    await page.waitForFunction(() => !window.G.player.moveTarget, null, { timeout: 4000 }).catch(() => {});
    await page.keyboard.up('Shift');
    const p1 = await ev(() => [window.G.player.pos.x, window.G.player.pos.z]);
    return { ...s, moved: +Math.hypot(p1[0] - p0[0], p1[1] - p0[1]).toFixed(2) };
  })();
  R.check('Shift+LMB on open floor walks (sprinting) instead of attacking', !sh.act && sh.sprint && sh.moved > 2.5, JSON.stringify(sh));
  // Alt on Windows Chrome: a lone Alt (down and up) and Alt + the game keys never reach the browser (its menu, the address
  // bar, back / forward); the Ctrl workarounds are gone (Ctrl+2 passes through again)
  const keys = await ev(() => {
    const fire = (type, o) => { const e = new KeyboardEvent(type, { bubbles: true, cancelable: true, ...o }); dispatchEvent(e); return e.defaultPrevented; };
    const out = { altDown: fire('keydown', { code: 'AltLeft', key: 'Alt', altKey: true }), altUp: fire('keyup', { code: 'AltLeft', key: 'Alt', altKey: false }) };
    out.combos = ['KeyD', 'KeyF', 'KeyE', 'ArrowLeft', 'Digit2'].map(code => { fire('keydown', { code: 'AltLeft', key: 'Alt', altKey: true }); const r = fire('keydown', { code, key: code.slice(-1), altKey: true }); fire('keyup', { code, key: code.slice(-1), altKey: true }); fire('keyup', { code: 'AltLeft', key: 'Alt' }); return r; });
    out.ctrl2 = fire('keydown', { code: 'Digit2', key: '2', ctrlKey: true }); fire('keyup', { code: 'Digit2', key: '2', ctrlKey: true });
    return out;
  });
  R.check('a lone Alt (down and up) and Alt+D / F / E / ← / 2 are kept from the browser; Ctrl+2 is no longer blocked', keys.altDown && keys.altUp && keys.combos.every(Boolean) && !keys.ctrl2, JSON.stringify(keys));
  // a held Alt never sticks: the window losing focus mid-hold, or a missed keyup (the next mouse event says Alt is up)
  const stick = await ev(() => {
    const I = window.G.input, down = () => dispatchEvent(new KeyboardEvent('keydown', { code: 'AltLeft', key: 'Alt', altKey: true, bubbles: true, cancelable: true }));
    down(); const held = I.keys.has('alt'); dispatchEvent(new Event('blur')); const afterBlur = I.keys.has('alt');
    down(); dispatchEvent(new MouseEvent('mousemove', { clientX: 400, clientY: 300, altKey: false, bubbles: true })); const afterMove = I.keys.has('alt');
    return { held, afterBlur, afterMove };
  });
  R.check('a held Alt never sticks (cleared on blur, and by the next mouse event without Alt)', stick.held && !stick.afterBlur && !stick.afterMove, JSON.stringify(stick));
  // the loot labels: hold Z (they were on Alt); Ctrl+Z (the decorate undo) doesn't show them
  const labels = await (async () => {
    await page.keyboard.down('z'); await sleep(page, 120); const on = await ev(() => !!window.G.ui.labels.all);
    await page.keyboard.up('z'); await sleep(page, 80); const off = await ev(() => !!window.G.ui.labels.all);
    await page.keyboard.down('Control'); await page.keyboard.down('z'); await sleep(page, 100); const ctrlZ = await ev(() => !!window.G.ui.labels.all);
    await page.keyboard.up('z'); await page.keyboard.up('Control');
    const altNo = await ev(() => { dispatchEvent(new KeyboardEvent('keydown', { code: 'AltLeft', key: 'Alt', altKey: true, bubbles: true, cancelable: true })); const v = !!window.G.ui.labels.all; dispatchEvent(new KeyboardEvent('keyup', { code: 'AltLeft', key: 'Alt', bubbles: true, cancelable: true })); return v; });
    return { on, off, ctrlZ, altNo };
  })();
  R.check('loot labels show while Z is held (not on Alt any more, not on Ctrl+Z)', labels.on && !labels.off && !labels.ctrlZ && !labels.altNo, JSON.stringify(labels));
  await ev(() => { window.G.input.keys.clear(); });

  // ---------------------------------------------------------------- c) DungeonDef + events
  await ev(() => { const G = window.G; window.__ev = []; for (const n of ['monster:killed', 'boss:dead', 'dungeon:cleared', 'tier:unlocked', 'mode:changed']) G.events.on(n, e => window.__ev.push([n, { ...e }])); });
  // enter a floor and wait for THAT floor (a floor-to-floor hop never leaves mode 'dungeon')
  const enter = async arg => { await ev(a => { window.__oldD = window.G.dungeon || null; window.G.enterDungeon(a); }, arg); await page.waitForFunction(() => { const G = window.G; return G.mode === 'dungeon' && G.dungeon && G.dungeon !== window.__oldD && !G.ui?.iris?.active; }, null, { timeout: 20000 }); await sleep(page, 300); };
  const killOne = (boss = false) => ev(b => { const G = window.G, D = G.dungeon, m = b ? D.boss : D.monsters.find(x => x.alive && !x.breakable && x !== D.boss); if (!m) return null; m.life = 1; G.combat.hitMonster(m, { dmgPct: 500 }); return m.id; }, boss);
  const sig = () => ev(() => { const L = window.G.dungeon.layout; return JSON.stringify([L.W, L.rooms.map(r => [r.x, r.y, r.w, r.h]), L.spawns.map(s => [s.x, s.y, s.rank, s.count])]); });
  await enter(3);
  const b3 = await ev(async () => { const G = window.G, D = G.dungeon, { generate } = await import('/src/dungeon/gen.js'), old = generate({ floor: 3, seed: 1 + 3 * 17 }), L = D.layout; return { kind: D.kind, def: D.def.id, floor: D.floor, same: JSON.stringify(old.spawns) === JSON.stringify(L.spawns) && old.theme === L.theme && old.mlvl === L.mlvl, deepest: G.state.dungeon.deepest, stairs: !!D.stairsPos, label: D.world.interactables.find(i => /deeper/.test(i.label))?.label }; });
  const s3a = await sig();
  await enter({ id: 'burrow', floor: 3 });
  const s3b = await sig();
  R.check('the Burrow is DUNGEONS.burrow: G.enterDungeon(3) is the old floor 3 (dseed=1), and { id, floor } gives the same floor', b3.kind === 'burrow' && b3.def === 'burrow' && b3.floor === 3 && b3.same && b3.deepest >= 3 && b3.stairs && /Burrow deeper \(Floor 4\)/.test(b3.label) && s3a === s3b, JSON.stringify(b3));
  // a Burrow kill carries where it happened
  await ev(() => { window.__ev.length = 0; });
  await killOne(); await sleep(page, 200);
  const kb = await ev(() => window.__ev.find(e => e[0] === 'monster:killed')?.[1] || null);
  R.check('monster:killed carries { zone, dungeon, floor, tier } (the Burrow: zone null, dungeon burrow)', kb && kb.dungeon === 'burrow' && kb.zone === null && kb.floor === 3 && kb.tier === 0, JSON.stringify(kb));
  // a Burrow boss: dungeon:cleared
  await enter(5); await ev(() => { window.__ev.length = 0; });
  await killOne(true); await page.waitForFunction(() => window.__ev.some(e => e[0] === 'dungeon:cleared'), null, { timeout: 5000 }).catch(() => {});
  const bc = await ev(() => ({ boss: window.__ev.find(e => e[0] === 'boss:dead')?.[1] || null, clear: window.__ev.find(e => e[0] === 'dungeon:cleared')?.[1] || null }));
  R.check('a Burrow boss: boss:dead { …, dungeon: burrow } and dungeon:cleared { id: burrow, tier: 0, floor: 5 }', bc.boss?.dungeon === 'burrow' && bc.clear?.id === 'burrow' && bc.clear.tier === 0 && bc.clear.floor === 5, JSON.stringify(bc));
  await page.waitForFunction(() => window.G.world.interactables.some(i => /deeper/.test(i.label)), null, { timeout: 5000 }).catch(() => {});
  const bstairs = await ev(() => window.G.world.interactables.some(i => /Burrow deeper \(Floor 6\)/.test(i.label)));
  R.check('…and its stairs down still appear (the Burrow never ends)', bstairs, String(bstairs));
  // a stub zone dungeon: floor 1 (its own roster on a stand-in kit) → stairs → floor 2 (its boss), no Burrow records
  await ev(() => { const G = window.G; G.state.quests.active = []; G.state.quests.requests.req_s21 = { def: { title: 'S21', giver: 'rosie', desc: '', steps: [{ type: 'kill', n: 2, dungeon: 'bambooDepths', text: 'Defeat 2 yokai in the Bamboo Depths' }, { type: 'dungeonFloor', dungeon: 'bambooDepths', n: 2, text: 'Reach floor 2 of the Bamboo Depths' }, { type: 'boss', dungeon: 'bambooDepths', text: 'Defeat its boss' }], reward: { coins: 1 }, request: true, next: null } }; G.story.start('req_s21', true); });
  await ev(() => { window.__ev.length = 0; window.__deep = window.G.state.dungeon.deepest; window.__wps = window.G.state.dungeon.waypoints.length; });
  await enter({ id: 'bambooDepths', floor: 1 });
  const z1 = await ev(() => { const G = window.G, D = G.dungeon, q = G.state.quests.active.find(q => q.id === 'req_s21'); return { kind: D.kind, zone: D.zoneId, floor: D.floor, roster: D.theme.monsters, ids: [...new Set(D.monsters.map(m => m.id))], stairs: !!D.stairsPos, wp: !!D.layout.waypoint, deepest: G.state.dungeon.deepest === window.__deep, wps: G.state.dungeon.waypoints.length === window.__wps, best: G.state.zones.bamboo.dungeon.bestFloor, mode: window.__ev.find(e => e[0] === 'mode:changed')?.[1] || null, step: q?.step, prog: q?.prog }; });
  R.check('a zone dungeon (stub): floor 1 with the zone\'s monsters and stairs, no waypoint, the Burrow\'s deepest untouched, zones.bamboo.dungeon.bestFloor = 1', z1.kind === 'zone' && z1.zone === 'bamboo' && z1.floor === 1 && z1.ids.every(i => z1.roster.includes(i)) && z1.stairs && !z1.wp && z1.deepest && z1.wps && z1.best === 1 && z1.mode?.dungeon === 'bambooDepths' && z1.mode?.zone === 'bamboo', JSON.stringify(z1));
  await killOne(); await killOne(); await sleep(page, 200);
  const zk = await ev(() => { const k = window.__ev.filter(e => e[0] === 'monster:killed').map(e => e[1]); const q = window.G.state.quests.active.find(q => q.id === 'req_s21'); return { k: k.slice(0, 2), step: q?.step, ptr: window.G.questTarget()?.label || null }; });
  R.check('zone kills carry { zone: bamboo, dungeon: bambooDepths, floor: 1 }; the dungeon-filtered kill step completes; the pointer heads for the stairs', zk.k.length === 2 && zk.k.every(e => e.zone === 'bamboo' && e.dungeon === 'bambooDepths' && e.floor === 1) && zk.step === 1 && zk.ptr === 'Stairs down', JSON.stringify(zk));
  await ev(() => { const it = window.G.world.interactables.find(i => /deeper/.test(i.label)); window.__lab = it?.label; it?.onInteract(); });
  await page.waitForFunction(() => window.G.dungeon?.floor === 2 && !window.G.ui?.iris?.active, null, { timeout: 20000 }); await sleep(page, 400);
  const z2 = await ev(() => { const G = window.G, D = G.dungeon, q = G.state.quests.active.find(q => q.id === 'req_s21'); return { lab: window.__lab, floor: D.floor, def: D.def.id, boss: D.boss?.id || null, stairs: !!D.stairsPos, best: G.state.zones.bamboo.dungeon.bestFloor, step: q?.step, ptr: G.questTarget()?.label || null }; });
  R.check('its stairs ("Go deeper") lead to floor 2: its boss, no stairs; the dungeonFloor step is done; the pointer finds the boss', /Go deeper \(Floor 2\)/.test(z2.lab) && z2.floor === 2 && z2.def === 'bambooDepths' && !!z2.boss && !z2.stairs && z2.best === 2 && z2.step === 2 && !!z2.ptr && z2.ptr !== 'Stairs down', JSON.stringify(z2));
  await ev(() => { window.__ev.length = 0; });
  await killOne(true); await page.waitForFunction(() => window.__ev.some(e => e[0] === 'dungeon:cleared'), null, { timeout: 5000 }).catch(() => {});
  await sleep(page, 1800);
  const zc = await ev(() => { const G = window.G, Z = G.state.zones.bamboo.dungeon; return { clear: window.__ev.find(e => e[0] === 'dungeon:cleared')?.[1] || null, tier: window.__ev.find(e => e[0] === 'tier:unlocked')?.[1] || null, Z: JSON.parse(JSON.stringify(Z)), quest: G.state.quests.active.some(q => q.id === 'req_s21'), stairs: G.world.interactables.some(i => /deeper/.test(i.label)), portal: G.world.interactables.some(i => /Return to Blossom Hollow/.test(i.label)) }; });
  R.check('its boss: dungeon:cleared { id: bambooDepths, first: true }, tier:unlocked { tier: 1 }, zones.bamboo.dungeon cleared 1 / T1 open; the boss step completes; a portal home and no stairs', zc.clear?.id === 'bambooDepths' && zc.clear.first === true && zc.clear.zone === 'bamboo' && zc.tier?.tier === 1 && zc.Z.cleared === 1 && zc.Z.tier.unlocked === 1 && zc.Z.tier.cleared.includes(0) && !zc.quest && !zc.stairs && zc.portal, JSON.stringify(zc));
  await ev(() => window.G.returnToVillage()); await waitMode(page, 'village');
  // the pointer from the village: a zone step → the Wayfarer's Post; a Burrow step → the Burrow
  const ptrs = await ev(() => { const G = window.G, S = G.story; return { zone: S.placeFor({ type: 'dungeonFloor', dungeon: 'mapleRoots', n: 2 }, { dungeon: 'mapleRoots', zone: 'maple', floor: 2 })?.label || null, burrow: S.placeFor({ type: 'floor', n: 9 }, { dungeon: 'burrow', floor: 9 })?.label || null }; });
  R.check('the quest pointer from the village: a zone dungeon step → the Wayfarer\'s Post, a Burrow step → the Burrow', ptrs.zone === "The Wayfarer's Post" && ptrs.burrow === 'The Burrow', JSON.stringify(ptrs));

  // ---------------------------------------------------------------- d) seeds reroll per entry (unpinned); pinned stays put
  await page.goto(`${BASE}/?fresh&nointro&notut&hour=11&dseed=off`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true && window.G?.player, null, { timeout: 60000 }); await sleep(page, 500);
  await ev(() => { window.G.state.flags.burrowTut = true; });
  await enter(1); const r1 = await sig(); const run1 = await ev(() => ({ runs: window.G.state.dungeon.runs, seed: window.G.state.dungeon.seed, dseed: window.G.dseed }));
  await enter(1); const r2 = await sig(); const run2 = await ev(() => window.G.state.dungeon.runs);
  R.check('seeds: unpinned, each entry rerolls the floor (state.dungeon.runs +1 per entry, a per-save seed)', r1 !== r2 && run2 === run1.runs + 1 && run1.seed > 0 && run1.dseed === null, JSON.stringify({ run1, run2, differ: r1 !== r2 }));
  await page.goto(`${BASE}/?fresh&nointro&notut&hour=11&dseed=7`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true && window.G?.player, null, { timeout: 60000 }); await sleep(page, 500);
  await ev(() => { window.G.state.flags.burrowTut = true; });
  await enter(1); const p1 = await sig(); await enter(1); const p2 = await sig();
  const pin = await ev(() => ({ runs: window.G.state.dungeon.runs || 0, dseed: window.G.dseed }));
  R.check('seeds: ?dseed=N pins the layouts (the same floor every entry, runs untouched)', p1 === p2 && pin.runs === 0 && pin.dseed === 7, JSON.stringify(pin));
  await ev(() => window.G.returnToVillage()); await waitMode(page, 'village');

  // ---------------------------------------------------------------- e) an old save's state.regions migrates into state.zones
  const old = await ev(() => {
    const G = window.G; G.save(); const st = JSON.parse(localStorage.getItem('chewy3d.save'));
    delete st.zones; st.regions = { unlocked: { bamboo: true, maple: true }, cleared: { bamboo: 2 }, visits: { bamboo: 5, maple: 1 } };
    const txt = JSON.stringify(st); localStorage.setItem('chewy3d.save', txt);
    addEventListener('beforeunload', () => localStorage.setItem('chewy3d.save', txt)); // (after the game's own save-on-unload)
    return !!st.regions;
  });
  await page.goto(`${BASE}/?notitle&nointro&notut&hour=11&dseed=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true && window.G?.player, null, { timeout: 60000 }); await sleep(page, 500);
  const mig = await ev(() => {
    const G = window.G, Z = G.state.zones, R = G.state.regions, list = G.travel.list();
    R.visits.onsen = 3; R.unlocked.tidepool = true;
    G.save(); const saved = JSON.parse(localStorage.getItem('chewy3d.save'));
    return { bamboo: { u: Z.bamboo.unlocked, boss: Z.bamboo.regionBoss, v: Z.bamboo.visits, d: Z.bamboo.dungeon.cleared, village: Z.bamboo.village }, maple: { u: Z.maple.unlocked, v: Z.maple.visits },
      view: { c: R.cleared.bamboo, v: R.visits.bamboo, u: R.unlocked.maple, keys: Object.keys(R.unlocked) }, write: { onsen: Z.onsen.visits, tide: Z.tidepool.unlocked },
      travel: list.filter(p => p.unlocked).map(p => p.id), savedZones: !!saved.zones && saved.zones.onsen.visits === 3, savedRegions: 'regions' in saved };
  });
  R.check('an old save: state.regions → state.zones (unlocked, regionBoss, visits), the dungeon record fresh; state.regions stays a live view (reads, writes); the save keeps zones only', old && mig.bamboo.u && mig.bamboo.boss === 2 && mig.bamboo.v === 5 && mig.bamboo.d === 0 && mig.bamboo.village === 'besieged' && mig.maple.u && mig.maple.v === 1 && mig.view.c === 2 && mig.view.v === 5 && mig.view.u === true && mig.view.keys.length === 4 && mig.write.onsen === 3 && mig.write.tide && mig.travel.includes('maple') && mig.savedZones && !mig.savedRegions, JSON.stringify(mig));
  await page.goto(`${BASE}/?notitle&nointro&notut&hour=11&dseed=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true && window.G?.player, null, { timeout: 60000 }); await sleep(page, 400);
  const mig2 = await ev(() => ({ boss: window.G.state.zones.bamboo.regionBoss, onsen: window.G.state.regions.visits.onsen, tide: window.G.state.regions.unlocked.tidepool }));
  R.check('…and it survives a reload', mig2.boss === 2 && mig2.onsen === 3 && mig2.tide === true, JSON.stringify(mig2));
  // a region boss (today's zone climax): zones[id].regionBoss counts it, dungeon:cleared { id: bamboo, kind: region }
  await ev(() => { const G = window.G; G.state.flags.burrowTut = true; window.__ev = []; for (const n of ['monster:killed', 'dungeon:cleared']) G.events.on(n, e => window.__ev.push([n, { ...e }])); G.enterRegion('bamboo'); });
  await waitMode(page, 'dungeon'); await page.waitForFunction(() => !!window.G.dungeon?.boss, null, { timeout: 30000 }); await sleep(page, 400);
  await killOne(); await killOne(true);
  await page.waitForFunction(() => window.__ev.some(e => e[0] === 'dungeon:cleared'), null, { timeout: 6000 }).catch(() => {});
  const rb = await ev(() => ({ kill: window.__ev.find(e => e[0] === 'monster:killed')?.[1] || null, clear: window.__ev.find(e => e[0] === 'dungeon:cleared')?.[1] || null, boss: window.G.state.zones.bamboo.regionBoss, view: window.G.state.regions.cleared.bamboo, dclear: window.G.state.zones.bamboo.dungeon.cleared }));
  R.check('a region: kills carry { zone: bamboo, dungeon: null, floor: 0 }; its boss bumps zones.bamboo.regionBoss (3) and fires dungeon:cleared { id: bamboo, kind: region }; the zone dungeon record is untouched', rb.kill?.zone === 'bamboo' && rb.kill.dungeon === null && rb.kill.floor === 0 && rb.clear?.id === 'bamboo' && rb.clear.kind === 'region' && rb.boss === 3 && rb.view === 3 && rb.dclear === 0, JSON.stringify(rb));
  await ev(() => window.G.returnToVillage()); await waitMode(page, 'village');

  // all three heroes sprint (Moka, Poe), and Poe's Vanish speed stacks with it
  for (const hero of ['moka', 'poe']) {
    await page.goto(`${BASE}/?fresh&nointro&notut&hour=11&dseed=1&hero=${hero}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__ready === true && window.G?.player, null, { timeout: 60000 }); await sleep(page, 600);
    await ev(() => { window.G.state.flags.hints = { sprint: true }; });
    const b2 = await ev(() => window.G.player.speed);
    const w2 = await holdWalk(false, 20), s2 = await holdWalk(true, 20);
    let vanish = null;
    if (hero === 'poe') { // Vanish's stealth (poeSkills.js updatePoe → player.poeSpeed)
      await ev(() => { window.G.skills.poeStealth = { t: 99, max: 99, move: 1.3 }; });
      vanish = await holdWalk(true, 20);
      await ev(() => { window.G.skills.poeReveal('clear'); });
    }
    R.check(`sprint works for ${hero}${hero === 'poe' ? ' (and stacks with Vanish\'s move speed)' : ''}`, near(w2.v, b2) && near(s2.v, b2 * 1.4) && s2.anim > 0.8 && (!vanish || near(vanish.v, b2 * 1.4 * 1.3, 0.07)), JSON.stringify({ hero, w2, s2, vanish }));
  }
} catch (e) {
  R.check('scenario ran to the end', false, e.stack || e.message);
}
const failed = R.finish(errors, warns);
await browser.close();
process.exit(failed ? 1 : 0);
