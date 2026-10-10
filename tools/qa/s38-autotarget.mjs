// Scenario 38: auto targeting (docs/CONTROLS.md §13, ROADMAP CT-8). Settings › Controls › Targeting (Off · Assist ·
// Auto per device), the all-round lock, where each skill goes, manual picks, the mouse's Assist, the AoE marker.
//  a) the setting: the defaults per device, the Targeting row on each Controls tab, the old touch Skill aim migrated and
//     still settable (touchAim); the words (a skill's tooltip per device and Targeting)
//  b) per hero (S38_HEROES, default all five): every active skill (and the basic attack) hits a foe in Auto with three
//     packs round the hero (left, behind, right) and nothing in front of him, pressed on a virtual pad with no aim input
//  c) the core cases on the pad, per hero with its own ranged skill (RANGED): (a) walk up to a pack with the left stick,
//     let go and press a skill with no aim: the lock and its ring appear by themselves and the skill hits; (b) hold the
//     stick straight away from the pack and press a ranged skill: it flies at the pack and hits, the hero turns for the
//     cast and keeps fleeing
//  d) the same two cases on a phone with real fingers (the stick and a skill button)
//  e) the picks: a ground skill lands on the big group, not the lone locked foe; the elite and boss bias and a foe hitting
//     you; R3 cycles (a manual pick), the pick expires, the L3 + R3 chord doesn't cycle; the right stick flick; a cast keeps
//     the pick; the pick dies and the lock moves on; Off on the pad (the touch stick flick is in d)
//  f) the mouse: Assist snaps a skill onto a foe and a ground skill onto a group near the cursor; Off is exactly the
//     cursor; Auto on the mouse locks all round with its ring
//  g) a charged ground skill: the AoE marker follows the cluster while charging, and the release lands where the group is
//     at release
//  h) shots at the game camera (tools/qa/tmp/ct8/): the lock ring and the AoE marker on the PC, the Deck (pad), a phone
//     and an iPad
// usage: node tools/qa/s38-autotarget.mjs        S38_ONLY=a,b,…   S38_HEROES=chewy,moka (default: all five)
import { launch, boot, waitMode, sleep, makeReport } from './lib.mjs';
import { installPad, padDown, padUp, padTap, padStick } from './pad-lib.mjs';
import { launchTouch, PHONE, IPAD, center } from './touch-lib.mjs';
import fs from 'node:fs';

const R = makeReport('S38 auto targeting: the setting, every skill all round, walk up and flee, picks, the mouse, the marker');
const ONLY = (process.env.S38_ONLY || '').split(',').filter(Boolean), on = s => !ONLY.length || ONLY.includes(s);
const ALL_HEROES = 'chewy,moka,poe,shihtzu,golden', HEROES = (!process.env.S38_HEROES || process.env.S38_HEROES === 'all' ? ALL_HEROES : process.env.S38_HEROES).split(','); // (all five by default: ~8 min)
const SHOTS = 'tools/qa/tmp/ct8'; fs.mkdirSync(SHOTS, { recursive: true });
const allErrors = [], allWarns = [];
// each hero's single-target ranged skill for the walk-up and the flee (c, d): reach 11 m+, so the lock at ~11 m is in range
const RANGED = { chewy: 'blaze', moka: 'splash', poe: 'thunderPaw', shihtzu: 'drippingPaw', golden: 'bonkDart' };

// ---------------------------------------------------------------- in-page helpers (window.CT8)
async function install(page) {
  await page.evaluate(() => {
    const G = window.G;
    const T = window.CT8 = { casts: [], hits: new Map(), watch: new Set(), packs: [] };
    if (!G.skills.__ct8) {
      G.skills.__ct8 = true;
      const rc = G.skills.tryCast.bind(G.skills);
      G.skills.tryCast = (i, a, t, c) => { const P = G.player, f0 = P.facing; const x = rc(i, a, t, c); if (x) T.casts.push({ id: i, tgt: t || null, aim: a ? { x: a.x, z: a.z } : null, f0, f1: P.facing, stage: c?.stage || 0, at: { x: P.pos.x, z: P.pos.z }, t: G.engine.time }); return x; };
    }
    T.wrap = () => { // (each floor has its own Combat)
      const C = G.combat; if (C.__ct8) return; C.__ct8 = true;
      const hm = C.hitMonster.bind(C);
      C.hitMonster = (m, o = {}) => { if (o.source !== 'shadow' && T.watch.has(m)) T.hits.set(m, (T.hits.get(m) || 0) + 1); return hm(m, o); };
    };
    T.mons = () => G.dungeon.monsters.filter(m => m.alive && !m.def?.boss && !m.siegeCaptain && !m.breakable);
    T.park = () => { for (const m of G.dungeon.monsters) { if (!m.alive) continue; m.status.stun = 999; m.aggro = false; m.state = 'idle'; m.pos.set(-999, 0, -999); m.sync?.(); } T.watch.clear(); T.packs = []; };
    T.freeze = m => { m.lifeMax = m.life = 1e7; m.status = { stun: 999 }; m.speed = 0; m.aggro = false; m.state = 'idle'; m.rank = m.def?.boss ? 'boss' : 'normal'; m.knock?.set?.(0, 0, 0); };
    // an open spot near the floor's start: walkable, no rock, ±r all round
    T.spot = (r = 6) => {
      const W = G.world, s = G.dungeon.startPos;
      const open = (x, z) => W.walkable(x, z) && !W.collision?.solidAt?.(x, z, 0.6);
      for (let k = 0; k < 30; k += 1) for (let a = 0; a < 12; a++) {
        const x = s.x + Math.cos(a / 6 * Math.PI) * k, z = s.z + Math.sin(a / 6 * Math.PI) * k; let ok = true;
        for (let i = -r; i <= r && ok; i += 1) for (let j = -r; j <= r && ok; j += 1) if (i * i + j * j <= r * r && !open(x + i, z + j)) ok = false;
        if (ok) return { x, z };
      }
      return { x: s.x, z: s.z };
    };
    // a lane: a spot and a yaw with a clear, walkable straight line len m long from it (the walk-up case)
    T.lane = (len = 14) => {
      const W = G.world, s = G.dungeon.startPos, S = G.skills;
      for (let k = 0; k < 40; k += 1.5) for (let a = 0; a < 12; a++) {
        const x = s.x + Math.cos(a / 6 * Math.PI) * k, z = s.z + Math.sin(a / 6 * Math.PI) * k;
        if (!W.walkable(x, z) || W.collision?.solidAt?.(x, z, 0.6)) continue;
        for (let b = 0; b < 16; b++) { const yaw = b / 16 * Math.PI * 2, ex = x + Math.sin(yaw) * len, ez = z + Math.cos(yaw) * len; if (S.lineClear({ x, z }, { x: ex, z: ez }, 0.6)) return { x, z, yaw, ex, ez }; }
      }
      return null;
    };
    // a point near (x, z) at about dist m that the mouse can point at without hovering any foe (the screen pick misses)
    T.noHover = (x, z, dist) => {
      const cam = G.engine.camera, v = new G.THREE.Vector3();
      for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2, px = x + Math.cos(a) * dist, pz = z + Math.sin(a) * dist; v.set(px, G.world.heightAt(px, pz), pz).project(cam); const sx = (v.x * 0.5 + 0.5) * innerWidth, sy = (-v.y * 0.5 + 0.5) * innerHeight; if (!G.combat.pickAtScreen(sx, sy, cam)) return { x: px, z: pz }; }
      return null;
    };
    // the hero at (x, z) facing yaw `face`; the camera snapped
    T.hero = (x, z, face) => {
      const P = G.player, S = G.skills;
      S.clearAll(); S.cds = {}; S.queued = null; S.approach = null;
      P.anim.stop(); P.leap = null; P.dash = null; P.rollT = 0; P.moveTarget = null; P.invuln = false; P.knock?.set?.(0, 0, 0);
      P.setPos(x, z); P.facing = P.faceTarget = face;
      const Sh = G.companion; if (Sh) { const hx = x + Math.sin(face) * 1.4, hz = z + Math.cos(face) * 1.4; Sh.setPos(hx, hz); Sh.hold = { x: hx, z: hz, face }; } // (Shadow sits in front: his bites would count and his knocks drift the packs)
      G.state.player.zoom = null; G.state.player.life = null; G.actions.restoreAll();
      if (G.combat?.buffs) for (const k of Object.keys(G.combat.buffs)) delete G.combat.buffs[k]; P.hidden = false; // (a buff from the last skill is not this one's)
      G.padAim.clear(); G.autoAim.clear();
      G.engine.rig.focus.copy(P.pos); G.engine.rig.snap();
    };
    // a pack of n round (cx, cz), spread s; frozen, huge life, watched
    T.pack = (cx, cz, n = 3, s = 0.75, rank = 'normal') => {
      const free = T.mons().filter(m => !T.watch.has(m)), out = [];
      for (let i = 0; i < n && free.length; i++) {
        const m = free.shift(), a = i * 2.39996;
        T.freeze(m); m.rank = rank;
        const r = n === 1 ? 0 : s * (0.45 + 0.55 * ((i + 1) / n));
        m.pos.set(cx + Math.cos(a) * r, G.world.heightAt(cx, cz), cz + Math.sin(a) * r); m.sync?.();
        T.watch.add(m); out.push(m);
      }
      T.packs.push(out); return out;
    };
    T.dmg = () => { let n = 0; for (const m of T.watch) if (m.lifeMax - m.life > 0) n++; return n; };
    // a pure buff, ward or mark landed (the skills that hurt nobody by design): Moka's bubble, Poe's Vanish, clones and
    // marks, Floofy's Bone Ward, Foosy's Wing Shield and roar
    T.buff = () => { const S = G.skills; return !!(S.bubbleShield || G.player.hidden || S.poeClones?.some(c => c.alive) || (S.poeMarks?.size && [...S.poeMarks.keys()].some(e => T.watch.has(e))) || S.stzWard || S.gldShield || G.combat.buffs?.roar); };
    T.status = () => { let n = 0; for (const m of T.watch) { const st = m.status || {}; if (st.fear > 0 || st.slow?.t > 0) n++; } return n; };
    T.reset = () => { T.casts.length = 0; T.hits.clear(); for (const m of T.watch) { m.life = m.lifeMax; const st = m.status; for (const k of Object.keys(st)) if (k !== 'stun') delete st[k]; st.stun = 999; } };
    T.ang = (fx, fz, tx, tz) => { const a = Math.atan2(fx, fz), b = Math.atan2(tx, tz); let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return Math.abs(d); };
  });
}
// the setup for a hero: level 30, every active skill at 10, plenty of zoom, no tips
async function seedHero(page, hero) {
  return page.evaluate(async (hero) => {
    const G = window.G, st = G.state, pl = st.player;
    const { SKILLS } = await import('/src/rpg/skills.js');
    st.flags.burrowTut = true; st.flags.hints = { all: true };
    const T = (st.flags.tutorials ||= {}); for (const id of ['house', 'switch', 'fishing', 'makeHome', 'remodel', 'charge', 'meetPoe']) T[id] = { done: true };
    pl.lvl = 30; pl.stats = { str: 90, dex: 90, vit: 400, ene: 600 }; pl.statPts = 0; pl.skillPts = 0; // (no point tips over the shots)
    const ids = Object.keys(SKILLS).filter(id => SKILLS[id].cls === hero && !['passive', 'aura'].includes(SKILLS[id].kind));
    for (const id of Object.keys(SKILLS)) if (SKILLS[id].cls === hero) pl.skills[id] = 10;
    G.actions.recompute(); G.actions.restoreAll(); G.actions.addXp = () => {};
    return ids;
  }, hero);
}
const enterFloor = async (page, floor = 1) => { await page.evaluate(f => window.G.enterDungeon(f), floor); await waitMode(page, 'dungeon'); await sleep(page, 500); await page.evaluate(() => { window.CT8.wrap(); window.CT8.park(); }); };
// a world direction (x, z) as left-stick axes (the Gamepad API's y is down)
const stickFor = (page, dx, dz) => page.evaluate(([dx, dz]) => { const { f, r } = window.G.engine.rig.groundAxes(), l = Math.hypot(dx, dz) || 1; const x = (dx * r.x + dz * r.z) / l, y = (dx * f.x + dz * f.z) / l; return [x, -y]; }, [dx, dz]);
const waitG = (page, fn, arg, timeout = 5000) => page.waitForFunction(fn, arg, { timeout, polling: 'raf' }).then(() => true, () => false);

try {
  // ================================================================ a) the setting
  if (on('a')) {
    const { browser, page, errors, warns } = await launch({ w: 1280, h: 720 });
    allErrors.push(errors); allWarns.push(warns);
    // an old saved settings object (the CT-5 touch Drag, Aim assist 0) before the game boots
    await page.addInitScript(() => { if (!sessionStorage.getItem('ct8.seeded')) { sessionStorage.setItem('ct8.seeded', '1'); localStorage.setItem('chewy3d.settings', JSON.stringify({ touchAim: 1, aimAssist: 0, music: 0.5 })); } });
    await boot(page, 'fresh&nointro&notut');
    const mg = await page.evaluate(() => { const s = window.G.ui.settings; return { kbm: s.targetKbm, pad: s.targetPad, touch: s.targetTouch, saved: JSON.parse(localStorage.getItem('chewy3d.settings')) }; });
    R.check('a) migration: the old touch Drag becomes touch Off, Aim assist 0 the pad Off, the mouse starts on Assist (in memory: the boot writes nothing)', mg.kbm === 1 && mg.pad === 0 && mg.touch === 0 && mg.saved.targetTouch === undefined && mg.saved.touchAim === 1, JSON.stringify(mg));
    await page.evaluate(() => { localStorage.removeItem('chewy3d.settings'); });
    await page.goto(page.url()); await page.waitForFunction(() => window.__ready === true && window.G?.player, null, { timeout: 60000 }); await sleep(page, 500);
    const df = await page.evaluate(() => { const s = window.G.ui.settings; return { kbm: s.targetKbm, pad: s.targetPad, touch: s.targetTouch }; });
    R.check('a) the defaults on a fresh start: Assist with the mouse, Auto on the pad and on touch', df.kbm === 1 && df.pad === 2 && df.touch === 2, JSON.stringify(df));
    // the Controls panel: a Targeting row on each tab, bound to that device's key; the touch help follows it
    const rows = {};
    for (const dev of ['kbm', 'pad', 'touch']) {
      await page.evaluate(d => { const ui = window.G.ui; ui.open('menu'); const M = ui.panels.menu; M.setView('controls'); M.dev = d; M.renderControls(); }, dev); await sleep(page, 250);
      rows[dev] = await page.evaluate(d => { const P = document.querySelector('.p-menu'); const segs = [...P.querySelectorAll('.ctl-tgt .seg')].filter(e => e.offsetParent); return { n: segs.length, k: segs[0]?.dataset.k, on: segs[0]?.querySelector('button.on')?.textContent, labels: segs[0] ? [...segs[0].querySelectorAll('button')].map(b => b.textContent).join('/') : '', hint: [...P.querySelectorAll('.ctl-tgt-h')].find(e => e.offsetParent)?.textContent || '', aimHelp: [...P.querySelectorAll('.ctl-list .ctl-row')].find(r => r.querySelector('.ctl-t')?.textContent === 'Aim')?.querySelector('.ctl-h')?.textContent || null }; }, dev);
      if (dev === 'pad') await page.screenshot({ path: `${SHOTS}/a-controls-pad.png` });
    }
    // a click on Off on the touch tab: the setting, the touch help and the Drag aim follow
    await page.evaluate(() => { const b = [...document.querySelectorAll('.p-menu .ctl-tgt .seg')].find(e => e.offsetParent)?.querySelector('button[data-v="0"]'); b?.click(); });
    await sleep(page, 150);
    const offT = await page.evaluate(() => ({ v: window.G.ui.settings.targetTouch, drag: window.G.ui.touch?.aimMode, aimHelp: [...document.querySelectorAll('.p-menu .ctl-list .ctl-row')].find(r => r.querySelector('.ctl-t')?.textContent === 'Aim')?.querySelector('.ctl-h')?.textContent }));
    await page.screenshot({ path: `${SHOTS}/a-controls-touch.png` });
    await page.evaluate(() => { window.G.ui.setSetting('touchAim', 1); window.G.ui.setSetting('touchAim', 0); }); // (as s27 and touch-shots do: Drag, then back)
    const alias = await page.evaluate(() => ({ v: window.G.ui.settings.targetTouch, drag: window.G.ui.touch?.aimMode }));
    await page.evaluate(() => window.G.ui.close('menu'));
    R.check('a) Settings › Controls: one Targeting row (Off / Assist / Auto) on each tab, on its own device\'s key, with its line', ['kbm', 'pad', 'touch'].every(d => rows[d].n === 1 && rows[d].labels === 'Off/Assist/Auto' && rows[d].hint.length > 20) && rows.kbm.k === 'targetKbm' && rows.pad.k === 'targetPad' && rows.touch.k === 'targetTouch' && rows.kbm.on === 'Assist' && rows.pad.on === 'Auto' && rows.touch.on === 'Auto' && /Auto/.test(rows.touch.aimHelp || ''), JSON.stringify(rows));
    R.check('a) touch Off is Drag (the touch help says so); the old setSetting(touchAim, 0) still sets touch Auto', offT.v === 0 && offT.drag === 1 && /drag/i.test(offT.aimHelp || '') && alias.v === 2 && alias.drag === 0, JSON.stringify({ offT, alias }));
    // the words (checkpoint 2): a skill's tooltip names the cursor only with the mouse; in Auto "the biggest group" etc.
    const words = await page.evaluate(async () => {
      const Actions = window.G.controls, ui = window.G.ui, out = {}; // (the game's own modules: a fresh import could be another copy)
      for (const [dev, key, v] of [['kbm', 'targetKbm', 1], ['pad', 'targetPad', 2], ['touch', 'targetTouch', 2], ['pad', 'targetPad', 1], ['touch', 'targetTouch', 0]]) {
        ui.setSetting(key, v); Actions.setDevice(dev);
        let tip = ''; try { tip = ui.panels.skills.tipHTML('dig'); } catch (e) { tip = 'ERR ' + e.message; }
        out[dev + v] = { desc: (tip.match(/class="tt-desc">([^<]*)/) || [])[1] || '', aim: (tip.match(/class="tt-aim">([^<]*)/) || [])[1] || '', inTip: /biggest group|the cursor|your aim/.exec(tip)?.[0] || '' };
      }
      ui.setSetting('targetPad', 2); ui.setSetting('targetTouch', 2); ui.setSetting('targetKbm', 1); Actions.setDevice('kbm');
      return out;
    });
    R.check('a) the words: Leap Attack says "toward the cursor" with the mouse, "toward the biggest group" in Auto on the pad and touch, "your aim" on the pad in Assist; the tooltip line follows Targeting',
      /toward the cursor/.test(words.kbm1.desc) && /Assist/.test(words.kbm1.aim) && ['pad2', 'touch2'].every(k => /toward the biggest group/.test(words[k].desc) && /Auto: a leap onto the biggest group/.test(words[k].aim) && words[k].inTip === 'biggest group')
      && /toward your aim/.test(words.pad1.desc) && /Assist/.test(words.pad1.aim) && /drag off/.test(words.touch0.aim), JSON.stringify(words));
    await browser.close();
  }

  // ================================================================ b) every active skill, all round, facing away (pad)
  if (on('b')) for (const hero of HEROES) {
    const { browser, page, errors, warns } = await launch({ w: 1280, h: 720 });
    allErrors.push(errors); allWarns.push(warns);
    await boot(page, `fresh&nointro&notut&hero=${hero}`);
    await installPad(page); await install(page);
    const ids = await seedHero(page, hero);
    await enterFloor(page, 1);
    await padStick(page, 'left', 0.4, 0); await sleep(page, 80); await padStick(page, 'left', 0, 0); // (the pad plays)
    const rows = [], bad = [];
    const list = ['attack', ...ids];
    for (const [k, id] of list.entries()) {
      const setup = await page.evaluate(([id, k]) => {
        const G = window.G, T = window.CT8, P = G.player;
        T.park();
        const c = T.spot(7), face = (k * 2.39996) % (Math.PI * 2), fx = Math.sin(face), fz = Math.cos(face); // (a different yaw for each skill, the same each run)
        T.hero(c.x, c.z, face);
        // three packs: left, behind and right of him (2.7 m), nothing in front
        for (const a of [Math.PI / 2, Math.PI, -Math.PI / 2]) { const yaw = face + a; T.pack(c.x + Math.sin(yaw) * 2.7, c.z + Math.cos(yaw) * 2.7, 3, 0.75); }
        G.state.player.hotbar = id === 'attack' ? ['attack', null, null, null, null, null] : ['attack', id, null, null, null, null];
        T.reset();
        return { face, fx, fz };
      }, [id, k]);
      await waitG(page, () => !!window.G.padAim.lock, null, 1500);
      const { kind, idle } = await page.evaluate(async id => { const { AIM } = await import('/src/combat/autoTarget.js'); return id === 'attack' ? { kind: 'attack' } : { kind: AIM[id]?.kind, idle: AIM[id]?.idle || null }; }, id);
      const btn = id === 'attack' ? 'A' : 'X';
      const chan = ['whirl', 'moonbeam', 'maelstrom'].includes(id);
      if (chan) { await padDown(page, btn); await waitG(page, () => window.CT8.dmg() > 0, null, 4000); await padUp(page, btn); }
      else await padTap(page, btn, 40);
      const summon = ['packcall', 'decoy', 'duckDecoy', 'spiritRetriever', 'shadowClone', 'ghostPups', 'grandpawsGhost', 'pawRune'].includes(id);
      const got = await waitG(page, () => window.CT8.dmg() > 0 || window.CT8.status() > 0 || window.CT8.buff(), null, summon ? 8000 : 5000);
      const r = await page.evaluate(([id, face]) => {
        const G = window.G, T = window.CT8, P = G.player, c = T.casts.find(x => x.id === id);
        const aimAng = c?.aim ? T.ang(Math.sin(face), Math.cos(face), c.aim.x - c.at.x, c.aim.z - c.at.z) : null; // (against his facing before the press: a charged channel turns him during its wind-up)
        return { id, cast: !!c, dmg: T.dmg(), st: T.status(), buff: T.buff(), aimDeg: aimAng == null ? null : Math.round(aimAng * 180 / Math.PI), tgt: !!c?.tgt, weapon: G.derived.weaponType };
      }, [id, setup.face]);
      r.kind = kind; r.idle = idle; r.ok = got && r.cast;
      rows.push(r); if (!r.ok) bad.push(r);
      await page.evaluate(() => window.G.skills.clearAll());
    }
    await page.screenshot({ path: `${SHOTS}/b-${hero}-last.png` });
    const away = rows.filter(r => r.aimDeg != null && !['self', 'heal'].includes(r.kind) && r.idle !== 'away'); // (Substitution blinks away from the foes on purpose)
    R.check(`b) ${hero}: every active skill and the attack (${rows.length}) hits a foe in Auto, packs left / behind / right and nothing in front, no aim input`, !bad.length, bad.length ? JSON.stringify(bad) : rows.map(r => `${r.id}:${r.kind}:${r.dmg ? 'hit' + r.dmg : r.st ? 'status' : r.buff ? 'buff' : '-'}${r.aimDeg != null ? '@' + r.aimDeg + '°' : ''}`).join(' '));
    R.check(`b) ${hero}: the aimed skills turned away from the facing (every aim 60°+ off it: the foes were beside and behind him)`, away.length >= 5 && away.every(r => r.aimDeg >= 60), JSON.stringify(away.map(r => `${r.id}@${r.aimDeg}`)));
    await browser.close();
  }

  // ================================================================ c) walk up, then flee: the pad
  if (on('c')) for (const hero of HEROES) {
    const { browser, page, errors, warns } = await launch({ w: 1280, h: 720 });
    allErrors.push(errors); allWarns.push(warns);
    await boot(page, `fresh&nointro&notut&hero=${hero}`);
    await installPad(page); await install(page);
    await seedHero(page, hero);
    await enterFloor(page, 1);
    const ranged = RANGED[hero] || 'blaze';
    // (a) a pack 14 m ahead: walk toward it with the left stick until the lock appears by itself, let go, press X
    const wa = await page.evaluate((ranged) => {
      const G = window.G, T = window.CT8, L = T.lane(14) || { ...T.spot(9), yaw: 0.6 }, c = { x: L.x, z: L.z };
      T.hero(c.x, c.z, L.yaw);
      const px = L.ex ?? c.x + Math.sin(L.yaw) * 10, pz = L.ez ?? c.z + Math.cos(L.yaw) * 10;
      T.pack(px, pz, 4, 0.9);
      G.state.player.hotbar = ['attack', ranged, null, null, null, null];
      T.reset();
      return { from: c, pack: { x: px, z: pz }, d0: +Math.hypot(px - c.x, pz - c.z).toFixed(2), lane: !!L.ex };
    }, ranged);
    await sleep(page, 150);
    const lock0 = await page.evaluate(() => !!window.G.padAim.lock);
    const sa = await stickFor(page, wa.pack.x - wa.from.x, wa.pack.z - wa.from.z);
    await padStick(page, 'left', sa[0], sa[1]);
    const latched = await waitG(page, () => { const L = window.G.padAim.lock; return !!L && window.CT8.watch.has(L); }, null, 8000);
    await padStick(page, 'left', 0, 0); await sleep(page, 200);
    const la = await page.evaluate((p) => { const G = window.G, P = G.player, A = G.padAim; return { lock: !!A.lock && window.CT8.watch.has(A.lock), ring: !!A.ring?.parent && A.ring.visible, d: +Math.hypot(P.pos.x - p.x, P.pos.z - p.z).toFixed(2), ld: A.lock ? +Math.hypot(P.pos.x - A.lock.pos.x, P.pos.z - A.lock.pos.z).toFixed(2) : null, aim: G.controls.aim().mag }; }, wa.pack);
    await page.screenshot({ path: `${SHOTS}/c-${hero}-walkup-lock.png` });
    await padTap(page, 'X', 40);
    const hitA = await waitG(page, () => window.CT8.dmg() > 0, null, 5000);
    const ca = await page.evaluate(() => { const c = window.CT8.casts.find(x => x.id !== 'attack'); return { cast: c?.id, tgt: !!c?.tgt && window.CT8.watch.has(c.tgt), dmg: window.CT8.dmg() }; });
    R.check(`c) ${hero} (a), the pad: walking up to a pack (14 m off: no lock yet), the lock and its ring appear by themselves at ~11 m, and ${ranged} pressed with no aim hits it`, wa.lane && !lock0 && latched && la.lock && la.ring && la.ld <= 11.6 && la.aim === 0 && hitA && ca.tgt, JSON.stringify({ wa, lock0, la, ca }));
    // (b) the pack 4 m off; the stick held straight away from it; the ranged skill pressed while fleeing
    const wb = await page.evaluate((ranged) => {
      const G = window.G, T = window.CT8; T.park(); const c = T.spot(9), face = 2.2;
      T.hero(c.x, c.z, face + Math.PI);
      const px = c.x + Math.sin(face) * 4, pz = c.z + Math.cos(face) * 4;
      T.pack(px, pz, 4, 0.9); G.state.player.hotbar = ['attack', ranged, null, null, null, null]; T.reset();
      return { from: c, pack: { x: px, z: pz } };
    }, ranged);
    const sb = await stickFor(page, wb.from.x - wb.pack.x, wb.from.z - wb.pack.z);
    await padStick(page, 'left', sb[0], sb[1]);
    await waitG(page, (p) => { const P = window.G.player; return Math.hypot(P.pos.x - p.x, P.pos.z - p.z) > 5.2; }, wb.pack, 3000); // (running away)
    const pre = await page.evaluate((p) => { const G = window.G, P = G.player; return { d: Math.hypot(P.pos.x - p.x, P.pos.z - p.z), lock: !!G.padAim.lock && window.CT8.watch.has(G.padAim.lock), facingAway: Math.cos(P.facing - Math.atan2(P.pos.x - p.x, P.pos.z - p.z)) }; }, wb.pack);
    await padTap(page, 'X', 40);
    const hitB = await waitG(page, () => window.CT8.dmg() > 0, null, 5000);
    const atHit = await page.evaluate((p) => { const P = window.G.player; return Math.hypot(P.pos.x - p.x, P.pos.z - p.z); }, wb.pack);
    await page.screenshot({ path: `${SHOTS}/c-${hero}-flee-hit.png` });
    await sleep(page, 900);
    const post = await page.evaluate((p) => {
      const G = window.G, P = G.player, T = window.CT8, c = T.casts.find(x => x.id !== 'attack');
      const toPack = c ? T.ang(c.aim.x - c.at.x, c.aim.z - c.at.z, p.x - c.at.x, p.z - c.at.z) : null, turned = c ? T.ang(Math.sin(c.f1), Math.cos(c.f1), p.x - c.at.x, p.z - c.at.z) : null;
      const away = Math.atan2(P.pos.x - p.x, P.pos.z - p.z);
      return { cast: c?.id, aimToPack: toPack == null ? null : Math.round(toPack * 180 / Math.PI), turnedDeg: turned == null ? null : Math.round(turned * 180 / Math.PI), d: Math.hypot(P.pos.x - p.x, P.pos.z - p.z), facingAwayNow: Math.cos(P.facing - away), dmg: T.dmg() };
    }, wb.pack);
    await padStick(page, 'left', 0, 0);
    R.check(`c) ${hero} (b), the pad: fleeing with the stick straight away, ${ranged} goes at the pack (within 25°) and hits; the hero turned to cast (within 30°)`, pre.lock && pre.facingAway > 0.7 && hitB && post.aimToPack != null && post.aimToPack <= 25 && post.turnedDeg <= 30, JSON.stringify({ pre, post }));
    R.check(`c) ${hero} (b): then he keeps fleeing (1.0 m+ further in 0.9 s, facing the run again)`, post.d > atHit + 1.0 && post.facingAwayNow > 0.7, JSON.stringify({ atHit: +atHit.toFixed(2), d: +post.d.toFixed(2), facing: +post.facingAwayNow.toFixed(2) }));
    await browser.close();
  }

  // ================================================================ d) the same on a phone, with fingers
  if (on('d')) for (const hero of HEROES) {
    const { browser, page, errors, warns, F } = await launchTouch(PHONE);
    allErrors.push(errors); allWarns.push(warns);
    await boot(page, `fresh&nointro&notut&hero=${hero}`);
    await install(page); await seedHero(page, hero);
    await page.evaluate(() => window.G.ui.setSetting('touchFs', 1));
    await enterFloor(page, 1);
    const ranged = RANGED[hero] || 'blaze';
    const W0 = PHONE.w, H0 = PHONE.h;
    const stickXY = { x: 150, y: H0 - 120 };
    const fingerFor = (dx, dz) => page.evaluate(([dx, dz]) => { const { f, r } = window.G.engine.rig.groundAxes(), l = Math.hypot(dx, dz) || 1; return [(dx * r.x + dz * r.z) / l, -(dx * f.x + dz * f.z) / l]; }, [dx, dz]);
    await F.tap(W0 * 0.3, H0 * 0.4); await sleep(page, 200); // (touch plays)
    const wa = await page.evaluate((ranged) => {
      const G = window.G, T = window.CT8, L = T.lane(14) || { ...T.spot(9), yaw: 0.6 }, c = { x: L.x, z: L.z };
      T.hero(c.x, c.z, L.yaw);
      const px = L.ex ?? c.x + Math.sin(L.yaw) * 10, pz = L.ez ?? c.z + Math.cos(L.yaw) * 10;
      T.pack(px, pz, 4, 0.9); G.state.player.hotbar = ['attack', ranged, null, null, null, null]; T.reset();
      return { from: c, pack: { x: px, z: pz }, dev: G.controls.device, mode: G.padAim.targeting() };
    }, ranged);
    const fa = await fingerFor(wa.pack.x - wa.from.x, wa.pack.z - wa.from.z);
    await F.down(1, stickXY.x, stickXY.y); await F.frame(); await F.move(1, stickXY.x + fa[0] * 50, stickXY.y + fa[1] * 50, 4);
    const latched = await waitG(page, () => { const L = window.G.padAim.lock; return !!L && window.CT8.watch.has(L); }, null, 8000);
    await F.up(1); await sleep(page, 250);
    const la = await page.evaluate(() => { const A = window.G.padAim; return { lock: !!A.lock && window.CT8.watch.has(A.lock), ring: !!A.ring?.parent && A.ring.visible }; });
    await page.screenshot({ path: `${SHOTS}/d-${hero}-phone-walkup-lock.png` });
    const s1 = await center(page, '.tc-slot[data-slot="1"]');
    await F.tap(s1.x, s1.y);
    const hitA = await waitG(page, () => window.CT8.dmg() > 0, null, 5000);
    R.check(`d) ${hero} (a), a phone: the stick walks up to the pack, the lock and ring appear by themselves, a tap on ${ranged} hits it`, wa.dev === 'touch' && wa.mode === 2 && latched && la.lock && la.ring && hitA, JSON.stringify({ wa: { dev: wa.dev, mode: wa.mode }, la, hitA }));
    // (b) the stick held away from the pack, the skill tapped with another finger
    const wb = await page.evaluate((ranged) => { const G = window.G, T = window.CT8; T.park(); const c = T.spot(9), face = 2.2; T.hero(c.x, c.z, face + Math.PI); const px = c.x + Math.sin(face) * 4, pz = c.z + Math.cos(face) * 4; T.pack(px, pz, 4, 0.9); G.state.player.hotbar = ['attack', ranged, null, null, null, null]; T.reset(); return { from: c, pack: { x: px, z: pz } }; }, ranged);
    const fb = await fingerFor(wb.from.x - wb.pack.x, wb.from.z - wb.pack.z);
    await F.down(1, stickXY.x, stickXY.y); await F.frame(); await F.move(1, stickXY.x + fb[0] * 50, stickXY.y + fb[1] * 50, 4);
    await waitG(page, (p) => { const P = window.G.player; return Math.hypot(P.pos.x - p.x, P.pos.z - p.z) > 5.2; }, wb.pack, 3000);
    await F.tap(s1.x, s1.y, 2);
    const hitB = await waitG(page, () => window.CT8.dmg() > 0, null, 5000);
    const atHit = await page.evaluate((p) => { const P = window.G.player; return Math.hypot(P.pos.x - p.x, P.pos.z - p.z); }, wb.pack);
    await page.screenshot({ path: `${SHOTS}/d-${hero}-phone-flee-hit.png` });
    await sleep(page, 900);
    const post = await page.evaluate((p) => { const G = window.G, P = G.player, T = window.CT8, c = T.casts.find(x => x.id !== 'attack'); return { cast: c?.id, aimToPack: c ? Math.round(T.ang(c.aim.x - c.at.x, c.aim.z - c.at.z, p.x - c.at.x, p.z - c.at.z) * 180 / Math.PI) : null, d: Math.hypot(P.pos.x - p.x, P.pos.z - p.z), stick: G.ui.touch.T.stick.on }; }, wb.pack);
    await F.up(1);
    R.check(`d) ${hero} (b), a phone: holding the stick away, a tap on ${ranged} (a second finger) flies at the pack and hits; the hero keeps fleeing, the stick still held`, hitB && post.cast === ranged && post.aimToPack != null && post.aimToPack <= 25 && post.d > atHit + 1.0 && post.stick, JSON.stringify({ hitB, post, atHit: +atHit.toFixed(2) }));
    // the touch flick: a quick flick of the stick toward a foe picks it (a manual pick)
    const fl = await page.evaluate(() => { const G = window.G, T = window.CT8; T.park(); const c = T.spot(9); T.hero(c.x, c.z, 0); const a = T.pack(c.x + 3, c.z, 1)[0], b = T.pack(c.x - 6, c.z + 2, 1)[0]; T.reset(); window.__fa = a; window.__fb = b; return { from: c, b: { x: b.pos.x, z: b.pos.z } }; });
    await waitG(page, () => window.G.padAim.lock === window.__fa, null, 1500);
    const ff = await fingerFor(fl.b.x - fl.from.x, fl.b.z - fl.from.z);
    await F.down(1, stickXY.x, stickXY.y); await F.move(1, stickXY.x + ff[0] * 70, stickXY.y + ff[1] * 70, 2); await F.up(1); await F.frame();
    const flk = await page.evaluate(() => ({ lock: window.G.padAim.lock === window.__fb, manual: window.G.padAim.manual === window.__fb }));
    R.check(`d) ${hero}: a quick flick of the touch stick toward a farther foe picks it (a manual pick over the nearer lock)`, flk.lock && flk.manual, JSON.stringify(flk));
    await browser.close();
  }

  // ================================================================ e) the picks (the pad)
  if (on('e')) {
    const hero = HEROES.includes('moka') ? 'moka' : 'chewy'; // (e, g, h test the picks and the marker with Moka's or Chewy's kit)
    const { browser, page, errors, warns } = await launch({ w: 1280, h: 720 });
    allErrors.push(errors); allWarns.push(warns);
    await boot(page, `fresh&nointro&notut&hero=${hero}`);
    await installPad(page); await install(page); await seedHero(page, hero);
    await enterFloor(page, 1);
    await padStick(page, 'left', 0.4, 0); await sleep(page, 80); await padStick(page, 'left', 0, 0);
    const ground = hero === 'moka' ? 'meteor' : 'fetchstorm';
    // the big group, not the lone locked foe
    const g = await page.evaluate((ground) => {
      const G = window.G, T = window.CT8; T.park(); const c = T.spot(9); T.hero(c.x, c.z, 0);
      const lone = T.pack(c.x + 3, c.z, 1)[0], grp = T.pack(c.x - 5, c.z + 5, 5, 1.1);
      G.state.player.hotbar = ['attack', ground, null, null, null, null]; T.reset();
      window.__lone = lone; const cx = grp.reduce((s, m) => s + m.pos.x, 0) / grp.length, cz = grp.reduce((s, m) => s + m.pos.z, 0) / grp.length;
      return { g: { x: cx, z: cz } };
    }, ground);
    await waitG(page, () => window.G.padAim.lock === window.__lone, null, 1500);
    await padTap(page, 'X', 40);
    await waitG(page, (id) => window.CT8.casts.some(c => c.id === id), ground, 3000);
    const gc = await page.evaluate(([id, g]) => { const c = window.CT8.casts.find(x => x.id === id); return { lockLone: window.G.padAim.lock === window.__lone, off: c?.aim ? +Math.hypot(c.aim.x - g.x, c.aim.z - g.z).toFixed(2) : null, tgt: !!c?.tgt }; }, [ground, g.g]);
    const hitG = await waitG(page, () => [...window.CT8.watch].filter(m => m !== window.__lone && m.life < m.lifeMax).length >= 4, null, 5000);
    R.check(`e) ${ground} lands on the group of 5 (within 1.2 m of its middle), not the lone locked foe 3 m off; it hits 4+ of them`, gc.lockLone && gc.off != null && gc.off < 1.2 && !gc.tgt && hitG, JSON.stringify(gc));
    // the elite bias, and a foe hitting you over the elite
    const el = await page.evaluate(() => {
      const G = window.G, T = window.CT8, P = G.player; T.park(); const c = T.spot(9); T.hero(c.x, c.z, 0);
      const champ = T.pack(c.x + 4.0, c.z, 1, 0, 'champion')[0], plain = T.pack(c.x - 3.7, c.z, 1)[0];
      G.padAim.clear(); G.padAim.autoT = 0;
      const two = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      return (async () => {
        await two(); const a = G.padAim.lock === champ;
        champ.rank = 'boss'; G.padAim.lock = null; G.padAim.autoT = 0; await two(); const boss = G.padAim.lock === champ; // (a boss: the same small bias)
        const add = T.pack(c.x, c.z - 2.6, 1)[0]; add.aggro = true; add.state = 'windup'; add.atkTarget = P;
        G.padAim.lock = null; G.padAim.autoT = 0; await two();
        return { champ: a, boss, add: G.padAim.lock === add, plain: G.padAim.lock === plain };
      })();
    });
    R.check('e) the elite and boss bias: a champion (and a boss) at 4 m is picked over a plain foe at 3.7 m; a foe winding up on you at 2.6 m over both', el.champ && el.boss && el.add, JSON.stringify(el));
    // R3: the next foe (a manual pick), and the pick runs out after its hold
    const r3a = await page.evaluate(() => { const G = window.G, T = window.CT8; T.park(); const c = T.spot(9); T.hero(c.x, c.z, 0); window.__n1 = T.pack(c.x + 2.5, c.z, 1)[0]; window.__n2 = T.pack(c.x - 5, c.z + 3, 1)[0]; T.reset(); return true; });
    await waitG(page, () => window.G.padAim.lock === window.__n1, null, 1500);
    await padTap(page, 'R3', 60); await sleep(page, 120);
    const r3 = await page.evaluate(() => ({ lock: window.G.padAim.lock === window.__n2, manual: window.G.padAim.manual === window.__n2, left: +(window.G.padAim.manualUntil - window.G.padAim.t).toFixed(2) }));
    await waitG(page, () => window.G.padAim.t > window.G.padAim.manualUntil + 0.25, null, 9000);
    const r3b = await page.evaluate(() => ({ lock: window.G.padAim.lock === window.__n1, manual: !!window.G.padAim.manual }));
    R.check('e) R3 cycles to the next foe as a manual pick (held ~5 s); when it runs out, the lock returns to the best foe', r3a && r3.lock && r3.manual && r3.left > 4 && r3.left <= 5.01 && r3b.lock && !r3b.manual, JSON.stringify({ r3, r3b }));
    // the L3 + R3 chord (the weapon swap) doesn't cycle
    await padDown(page, 'L3'); await padDown(page, 'R3'); await sleep(page, 60); await padUp(page, 'R3'); await padUp(page, 'L3'); await sleep(page, 80);
    const chord = await page.evaluate(() => ({ lock: window.G.padAim.lock === window.__n1, manual: !!window.G.padAim.manual }));
    R.check('e) the L3 + R3 swap chord does not cycle the target', chord.lock && !chord.manual, JSON.stringify(chord));
    // a right-stick flick toward the far foe picks it; it holds after the stick lets go
    const rs = await page.evaluate(() => { const G = window.G, P = G.player, m = window.__n2; return [m.pos.x - P.pos.x, m.pos.z - P.pos.z]; });
    const ax = await stickFor(page, rs[0], rs[1]);
    await padStick(page, 'right', ax[0], ax[1]); await sleep(page, 90);
    const fk0 = await page.evaluate(() => ({ lock: window.G.padAim.lock?.name, n2: window.G.padAim.lock === window.__n2, hand: window.G.padAim.handAim, aim: { ...window.G.controls.aim() }, dir: [window.G.padAim.dir.x.toFixed(2), window.G.padAim.dir.z.toFixed(2)], dev: window.G.controls.device, n1: !!window.__n1.alive, n2a: window.__n2.alive, n2p: [window.__n2.pos.x - window.G.player.pos.x, window.__n2.pos.z - window.G.player.pos.z].map(v => v.toFixed(1)), isN1: window.G.padAim.lock === window.__n1, lp: window.G.padAim.lock ? [window.G.padAim.lock.pos.x - window.G.player.pos.x, window.G.padAim.lock.pos.z - window.G.player.pos.z].map(v => v.toFixed(1)) : null, near: [...window.CT8.watch].map(m => Math.hypot(m.pos.x - window.G.player.pos.x, m.pos.z - window.G.player.pos.z).toFixed(1)), strength: window.G.padAim.strength, stick: window.G.padAim.stick }));
    await padStick(page, 'right', 0, 0); await sleep(page, 200);
    const fk = await page.evaluate(() => ({ lock: window.G.padAim.lock === window.__n2, manual: window.G.padAim.manual === window.__n2 }));
    fk.pre = fk0; fk.ax = ax;
    R.check('e) a right-stick flick toward a foe picks it, and it stays picked after the stick lets go', fk.lock && fk.manual, JSON.stringify(fk));
    // a cast at the manual pick keeps it picked
    await page.evaluate(() => { window.G.state.player.hotbar = ['attack', window.G.state.player.hero === 'moka' ? 'splash' : 'blaze', null, null, null, null]; window.G.padAim.manualUntil = window.G.padAim.t + 0.6; });
    await padTap(page, 'X', 40); await sleep(page, 100);
    const ext = await page.evaluate(() => ({ left: +(window.G.padAim.manualUntil - window.G.padAim.t).toFixed(2), manual: window.G.padAim.manual === window.__n2 }));
    R.check('e) casting at the manual pick keeps it picked (2.5 s from the cast)', ext.manual && ext.left > 2, JSON.stringify(ext));
    // the manual pick dies: the lock moves on to the best foe at once
    await page.evaluate(() => { const m = window.__n2; m.life = 1; window.G.combat.applyDamageToMonster(m, 50, {}); });
    await waitG(page, () => !window.__n2.alive && window.G.padAim.lock === window.__n1, null, 2000);
    const dead = await page.evaluate(() => ({ dead: !window.__n2.alive, lock: window.G.padAim.lock === window.__n1, manual: !!window.G.padAim.manual }));
    R.check('e) when the manual pick dies, the lock moves on to the best foe left', dead.dead && dead.lock && !dead.manual, JSON.stringify(dead));
    // Off on the pad: no lock at all, the skill goes along the facing
    await page.evaluate(() => { window.G.ui.setSetting('targetPad', 0); const T = window.CT8; T.park(); const c = T.spot(9); T.hero(c.x, c.z, 0); T.pack(c.x - 3, c.z, 1); T.reset(); });
    await sleep(page, 200);
    const off = await page.evaluate(() => ({ lock: !!window.G.padAim.lock, ring: !!window.G.padAim.ring?.parent }));
    await page.evaluate(() => window.G.ui.setSetting('targetPad', 2));
    R.check('e) Off on the pad: no lock and no ring', !off.lock && !off.ring, JSON.stringify(off));
    await browser.close();
  }

  // ================================================================ f) the mouse: Assist, Off, Auto
  if (on('f')) {
    const hero = HEROES.includes('chewy') ? 'chewy' : 'moka'; // (the mouse's cases use Chewy's or Moka's kit)
    const { browser, page, errors, warns } = await launch({ w: 1280, h: 720 });
    allErrors.push(errors); allWarns.push(warns);
    await boot(page, `fresh&nointro&notut&hero=${hero}`);
    await install(page); await seedHero(page, hero);
    await enterFloor(page, 1);
    const single = hero === 'moka' ? 'splash' : 'blaze', ground = hero === 'moka' ? 'meteor' : 'fetchstorm';
    const toScreen = (x, z) => page.evaluate(([x, z]) => { const G = window.G, v = new G.THREE.Vector3(x, G.world.heightAt(x, z), z).project(G.engine.camera); return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight }; }, [x, z]);
    const setupM = (sk) => page.evaluate(([sk]) => { const G = window.G, T = window.CT8; T.park(); const c = T.spot(9); T.hero(c.x, c.z, 0); const m = T.pack(c.x + 5, c.z + 1, 1)[0]; const grp = T.pack(c.x - 4, c.z + 4, 4, 1); G.state.player.hotbar = ['attack', null, sk, null, null, null]; T.reset(); window.__m = m; const gx = grp.reduce((s, q) => s + q.pos.x, 0) / grp.length, gz = grp.reduce((s, q) => s + q.pos.z, 0) / grp.length; return { m: { x: m.pos.x, z: m.pos.z }, g: { x: gx, z: gz } }; }, [sk]);
    // Assist (the default): the cursor 1.1 m beside a foe, a single-target skill snaps onto it
    let s = await setupM(single);
    const nh1 = await page.evaluate(([x, z]) => window.CT8.noHover(x, z, 1.75), [s.m.x, s.m.z]);
    let p = await toScreen(nh1.x, nh1.z);
    await page.mouse.move(p.x - 40, p.y - 30); await page.mouse.move(p.x, p.y, { steps: 6 }); await sleep(page, 120);
    const dev = await page.evaluate(() => ({ dev: window.G.controls.device, mode: window.G.padAim.targeting(), hover: !!window.G.combat.pickAtScreen(window.G.input.mouse.x, window.G.input.mouse.y, window.G.engine.camera) }));
    await page.keyboard.press('1'); await waitG(page, (id) => window.CT8.casts.some(c => c.id === id), single, 3000);
    const as1 = await page.evaluate((id) => { const c = window.CT8.casts.find(x => x.id === id); return { tgt: c?.tgt === window.__m, off: c?.aim ? +Math.hypot(c.aim.x - window.__m.pos.x, c.aim.z - window.__m.pos.z).toFixed(2) : null }; }, single);
    // a ground skill with the cursor 1.2 m off the group: it snaps onto the group (within 1.5 m of the cursor)
    s = await setupM(ground);
    const cur = { x: s.g.x + 1.2, z: s.g.z - 0.3 };
    p = await toScreen(cur.x, cur.z); await page.mouse.move(p.x, p.y, { steps: 4 }); await sleep(page, 100);
    await page.keyboard.press('1'); await waitG(page, (id) => window.CT8.casts.some(c => c.id === id), ground, 3000);
    const as2 = await page.evaluate(([id, g, cur]) => { const c = window.CT8.casts.find(x => x.id === id); return { toGroup: c?.aim ? +Math.hypot(c.aim.x - g.x, c.aim.z - g.z).toFixed(2) : null, toCursor: c?.aim ? +Math.hypot(c.aim.x - cur.x, c.aim.z - cur.z).toFixed(2) : null }; }, [ground, s.g, cur]);
    R.check(`f) the mouse, Assist (the default): ${single} cast 1.75 m beside a foe (not under the cursor) snaps onto it; ${ground} 1.2 m off a group snaps onto the group (≤1.5 m from the cursor)`, dev.dev === 'kbm' && dev.mode === 1 && !dev.hover && as1.tgt && as2.toGroup != null && as2.toGroup < as2.toCursor && as2.toCursor <= 1.55, JSON.stringify({ dev, as1, as2 }));
    // Off: exactly the cursor
    await page.evaluate(() => window.G.ui.setSetting('targetKbm', 0));
    s = await setupM(single);
    const curO = await page.evaluate(([x, z]) => window.CT8.noHover(x, z, 1.75), [s.m.x, s.m.z]);
    p = await toScreen(curO.x, curO.z); await page.mouse.move(p.x + 3, p.y + 2, { steps: 3 }); await page.mouse.move(p.x, p.y, { steps: 2 }); await sleep(page, 100);
    await page.keyboard.press('1'); await waitG(page, (id) => window.CT8.casts.some(c => c.id === id), single, 3000);
    const of = await page.evaluate(([id, cur]) => { const c = window.CT8.casts.find(x => x.id === id); return { tgt: !!c?.tgt, toCursor: c?.aim ? +Math.hypot(c.aim.x - cur.x, c.aim.z - cur.z).toFixed(2) : null, toFoe: c?.aim ? +Math.hypot(c.aim.x - window.__m.pos.x, c.aim.z - window.__m.pos.z).toFixed(2) : null }; }, [single, curO]);
    R.check('f) the mouse, Off: the skill goes at the cursor, not the foe 1.75 m from it (no snap, no target)', !of.tgt && of.toCursor != null && of.toCursor < 0.6 && of.toFoe > 1.2, JSON.stringify(of)); // (the cursor's ground point within a few pixels: the camera settles a little after the snap)
    // Auto on the mouse: the lock all round, with its ring; a skill goes at it wherever the cursor is
    await page.evaluate(() => window.G.ui.setSetting('targetKbm', 2));
    s = await setupM(single);
    p = await toScreen(s.m.x - 10, s.m.z - 6); await page.mouse.move(p.x, p.y, { steps: 3 }); await sleep(page, 250);
    const au0 = await page.evaluate(() => ({ lock: !!window.G.padAim.lock, ring: !!window.G.padAim.ring?.parent && window.G.padAim.ring.visible }));
    await page.screenshot({ path: `${SHOTS}/f-pc-auto-ring.png` });
    await page.keyboard.press('1'); await waitG(page, (id) => window.CT8.casts.some(c => c.id === id), single, 3000);
    const au = await page.evaluate((id) => { const c = window.CT8.casts.find(x => x.id === id); return { tgt: !!c?.tgt && window.CT8.watch.has(c.tgt) }; }, single);
    await page.evaluate(() => window.G.ui.setSetting('targetKbm', 1));
    R.check('f) the mouse, Auto: the lock and its ring show all round; a skill goes at a foe wherever the cursor is', au0.lock && au0.ring && au.tgt, JSON.stringify({ au0, au }));
    await browser.close();
  }

  // ================================================================ g) a charged ground skill: the marker, the release
  if (on('g')) {
    const hero = HEROES.includes('moka') ? 'moka' : 'chewy'; // (e, g, h test the picks and the marker with Moka's or Chewy's kit)
    const { browser, page, errors, warns } = await launch({ w: 1280, h: 720 });
    allErrors.push(errors); allWarns.push(warns);
    await boot(page, `fresh&nointro&notut&hero=${hero}`);
    await installPad(page); await install(page); await seedHero(page, hero);
    await enterFloor(page, 1);
    await padStick(page, 'left', 0.4, 0); await sleep(page, 80); await padStick(page, 'left', 0, 0);
    const ground = hero === 'moka' ? 'meteor' : 'fetchstorm';
    const g0 = await page.evaluate((ground) => { const G = window.G, T = window.CT8; T.park(); const c = T.spot(9); T.hero(c.x, c.z, 0); window.__grp = T.pack(c.x + 6, c.z + 2, 4, 1); G.state.player.hotbar = ['attack', ground, null, null, null, null]; T.reset(); return { c }; }, ground);
    await waitG(page, () => !!window.G.padAim.lock, null, 1500);
    await padDown(page, 'X');
    const st1 = await waitG(page, () => (window.G.skills.charge.active?.stage || 0) >= 1, null, 6000);
    const mk1 = await page.evaluate(() => { const G = window.G, m = G.world.scene.getObjectByName('autoAimMarker'), grp = window.__grp, gx = grp.reduce((s, q) => s + q.pos.x, 0) / 4, gz = grp.reduce((s, q) => s + q.pos.z, 0) / 4; return { on: !!m?.parent && m.visible, off: m ? +Math.hypot(m.position.x - gx, m.position.z - gz).toFixed(2) : null, op: m?.material.opacity, blend: m?.material.blending, scale: m ? +(2 * (m.userData.R || 0) * m.scale.x).toFixed(2) : null }; });
    await page.screenshot({ path: `${SHOTS}/g-${hero}-charge-marker.png` });
    // the group moves (8 m the other way) while the charge holds: the marker and the release follow it
    const g1 = await page.evaluate(() => { const G = window.G, P = G.player, grp = window.__grp; grp.forEach((m, i) => { m.pos.set(P.pos.x - 6 + (i % 2) * 0.9, m.pos.y, P.pos.z - 2 + ((i / 2) | 0) * 0.9); m.sync?.(); }); const gx = grp.reduce((s, q) => s + q.pos.x, 0) / 4, gz = grp.reduce((s, q) => s + q.pos.z, 0) / 4; return { x: gx, z: gz }; });
    await sleep(page, 300);
    const mk2 = await page.evaluate((g) => { const m = window.G.world.scene.getObjectByName('autoAimMarker'); return m ? +Math.hypot(m.position.x - g.x, m.position.z - g.z).toFixed(2) : null; }, g1);
    await padUp(page, 'X');
    await waitG(page, (id) => window.CT8.casts.some(c => c.id === id && c.stage > 0), ground, 3000);
    const gone = await waitG(page, () => !window.G.world.scene.getObjectByName('autoAimMarker')?.parent, null, 1500); // (it goes on the next frame's tick after the release)
    const rel = await page.evaluate(([id, g]) => { const c = window.CT8.casts.find(x => x.id === id && x.stage > 0); const m = window.G.world.scene.getObjectByName('autoAimMarker'); return { stage: c?.stage || 0, off: c?.aim ? +Math.hypot(c.aim.x - g.x, c.aim.z - g.z).toFixed(2) : null, markerGone: !m?.parent }; }, [ground, g1]); rel.markerGone = rel.markerGone || gone;
    const hitR = await waitG(page, () => window.CT8.dmg() >= 3, null, 5000);
    R.check(`g) charging ${ground}: the AoE marker (normal blending, opacity ≤ 0.85, the skill's size) sits on the group`, st1 && mk1.on && mk1.off != null && mk1.off < 1.3 && mk1.op <= 0.85 && mk1.blend === 1 && mk1.scale > 7, JSON.stringify(mk1));
    R.check(`g) the group moves mid-charge: the marker follows it, and the charged release lands where the group is at release and hits it`, mk2 != null && mk2 < 1.3 && rel.stage >= 1 && rel.off != null && rel.off < 1.3 && rel.markerGone && hitR, JSON.stringify({ mk2, rel, hitR }));
    await browser.close();
  }

  // ================================================================ h) shots at the game camera: PC, Deck, phone, iPad
  if (on('h')) {
    const hero = HEROES.includes('moka') ? 'moka' : 'chewy'; // (e, g, h test the picks and the marker with Moka's or Chewy's kit)
    const ground = hero === 'moka' ? 'meteor' : 'fetchstorm';
    const stage = async (page) => {
      await page.evaluate(([ground]) => {
        const G = window.G, T = window.CT8; T.park(); const c = T.spot(9); T.hero(c.x, c.z, 2.4);
        T.pack(c.x + 3.2, c.z - 1.5, 1); T.pack(c.x - 5, c.z + 3, 4, 1.1); T.pack(c.x + 1, c.z + 5.5, 2, 0.8);
        for (const m of T.watch) { m.status = {}; m.speed = 0; m.aggro = false; } // (idle poses, no stun stars)
        G.state.player.hotbar = ['attack', ground, ground, null, null, null]; // (X / the touch slot 1, and key 1)
        G.ui.toasts?.retire?.(0);
      }, [ground]);
    };
    const shoot = async (name, page, press, release) => {
      await stage(page); await sleep(page, 500);
      await page.screenshot({ path: `${SHOTS}/${name}-ring.png` });
      await press(); await waitG(page, () => (window.G.skills.charge.active?.stage || 0) >= 1, null, 6000); await sleep(page, 250);
      await page.screenshot({ path: `${SHOTS}/${name}-marker.png` });
      await release(); await sleep(page, 200);
    };
    const shotsDone = [];
    { // the PC (Auto on the mouse, 1600×900) and the Deck (the pad, 1280×800)
      for (const [name, w, h, dev] of [['pc', 1600, 900, 'kbm'], ['deck', 1280, 800, 'pad']]) {
        const { browser, page, errors, warns } = await launch({ w, h });
        allErrors.push(errors); allWarns.push(warns);
        await boot(page, `fresh&nointro&notut&hero=${hero}${dev === 'pad' ? '&deck' : ''}`);
        await install(page); await seedHero(page, hero);
        if (dev === 'pad') { await installPad(page); } else await page.evaluate(() => window.G.ui.setSetting('targetKbm', 2));
        await enterFloor(page, 1);
        if (dev === 'pad') { await padStick(page, 'left', 0.4, 0); await sleep(page, 80); await padStick(page, 'left', 0, 0); }
        else { await page.mouse.move(w * 0.3, h * 0.3); await page.mouse.move(w * 0.32, h * 0.31, { steps: 4 }); }
        await shoot(name, page, () => (dev === 'pad' ? padDown(page, 'X') : page.keyboard.down('1')), () => (dev === 'pad' ? padUp(page, 'X') : page.keyboard.up('1')));
        shotsDone.push(name);
        await browser.close();
      }
    }
    for (const [name, D] of [['phone', PHONE], ['ipad', IPAD]]) {
      const { browser, page, errors, warns, F } = await launchTouch(D);
      allErrors.push(errors); allWarns.push(warns);
      await boot(page, `fresh&nointro&notut&hero=${hero}`);
      await install(page); await seedHero(page, hero);
      await page.evaluate(() => window.G.ui.setSetting('touchFs', 1));
      await enterFloor(page, 1);
      await F.tap(D.w * 0.3, D.h * 0.4); await sleep(page, 200);
      const s1 = await center(page, '.tc-slot[data-slot="1"]');
      await shoot(name, page, () => F.down(3, s1.x, s1.y), () => F.up(3));
      shotsDone.push(name);
      await browser.close();
    }
    R.check('h) shots of the lock ring and the AoE marker at the game camera: the PC, the Deck, a phone, an iPad', shotsDone.length === 4 && shotsDone.every(n => fs.existsSync(`${SHOTS}/${n}-ring.png`) && fs.existsSync(`${SHOTS}/${n}-marker.png`)), shotsDone.join(', '));
  }
} catch (e) {
  R.check('no crash', false, e.stack || String(e));
}
process.exit(R.finish(allErrors.flat(), allWarns.flat()) ? 1 : 0);
