// Render-health sessions shared by tools/qa/flash-hunt.mjs and s24-render-health.mjs (ROADMAP R-7): drive a page that
// was booted with a probe flag (?nanprobe / ?rh: src/gfx/renderHealth.js) through a scripted session and return the
// per-stage NaN counts, the flash frames and the singular-matrix scan. PNGs of NaN / flash frames go to shotDir.
import fs from 'node:fs';
import path from 'node:path';

export async function huntSession(page, name, { secs = 14, shotDir = null } = {}) {
  const [kind, hero] = name.split('-');
  // ---- the probes: every frame read back, the singular-matrix scan, PNGs of NaN frames
  await page.evaluate(() => {
    const RH = window.__rh, G = window.G; if (!RH) throw new Error('no render health probe (flag missing?)');
    RH.read = true; RH.scanOn = RH.mode !== 'stats'; RH.capture = true; RH.frameLog = []; RH.flashes.length = 0; RH.stage = {}; RH.scan = null; RH.frames = 0; RH.shots = 0;
    RH.skipFn = () => !!G.ui?.iris?.active || !!G.ui?.anyModal?.();
    window.__nanShots = [];
    RH.onBad = f => { if (window.__nanShots.length < 3 && !f.skip) { try { window.__nanShots.push({ f, png: G.engine.renderer.domElement.toDataURL('image/png') }); } catch (e) { /* */ } } };
  });
  const t0 = Date.now();
  if (kind === 'cottage') await cottage(page);
  let fightInfo = null;
  if (kind !== 'cottage') fightInfo = await fight(page, kind, hero, secs);
  const res = await page.evaluate(() => {
    const RH = window.__rh, L = RH.frameLog;
    const bad = L.filter(f => (f.scene || 0) + (f.ao || 0) + (f.tone || 0) > 0);
    return { frames: RH.frames, stage: RH.stage, nanFrames: bad.length, nanSkip: bad.filter(f => f.skip).length, firstBad: bad.slice(0, 4).map(f => ({ i: f.i, tag: f.tag, scene: f.scene, ao: f.ao, tone: f.tone, sing: f.sing })),
      flashes: RH.flashes.map(({ png, ...e }) => e), flashPngs: RH.flashes.filter(e => e.png).map(e => ({ i: e.i, png: e.png })),
      scan: RH.scan, nanShots: window.__nanShots, skipped: L.filter(f => f.skip).length };
  });
  res.secs = (Date.now() - t0) / 1000; res.fight = fightInfo;
  if (shotDir) for (const s of res.nanShots) fs.writeFileSync(path.join(shotDir, `${name}-nan-${s.f.i}.png`), Buffer.from(s.png.split(',')[1], 'base64'));
  if (shotDir) for (const s of res.flashPngs) fs.writeFileSync(path.join(shotDir, `${name}-flash-${s.i}.png`), Buffer.from(s.png.split(',')[1], 'base64'));
  delete res.flashPngs; res.nanShots = res.nanShots.map(s => s.f.i);
  return res;
}

// ---------------------------------------------------------------- the cottage: a lap, in, the room, out, a lap
export async function walkTo(page, x, z, ms = 7000) {
  await page.evaluate(([x, z]) => { const G = window.G; G.player.moveTarget = new G.THREE.Vector3(x, 0, z); G.player.interactTarget = null; }, [x, z]);
  await page.waitForFunction(([x, z]) => { const P = window.G.player; return Math.hypot(P.pos.x - x, P.pos.z - z) < 0.8 || !P.moveTarget; }, [x, z], { timeout: ms }).catch(() => {});
}
export async function cottage(page) {
  const C = await page.evaluate(() => {
    const G = window.G, rec = G.sim.list.find(r => r.data.type === 'chewyHouse'), L = G.village.world.landmarks.chewyHouse;
    window.__rh.tag = 'village';
    return { cx: L.x, cz: L.z, door: rec ? { x: rec.door.x, z: rec.door.z } : { x: L.x + 2.5, z: L.z } };
  });
  await page.evaluate(([x, z]) => { const G = window.G; G.player.setPos(x, z); G.companion.setPos(x + 1, z + 0.6); G.engine.rig.focus.copy(G.player.pos); G.engine.rig.snap(); }, [C.door.x + 2, C.door.z]);
  await page.waitForTimeout(800);
  const lap = async () => { for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; await walkTo(page, C.cx + Math.cos(a) * 6.5, C.cz + Math.sin(a) * 6.5, 6000); } };
  await lap();
  await walkTo(page, C.door.x + 1.2, C.door.z, 5000);
  await page.evaluate(() => { window.__rh.tag = 'enter'; window.G.openHome(); });
  await page.waitForFunction(() => window.G.mode === 'interior' && !window.G.ui?.iris?.active, null, { timeout: 20000 });
  await page.evaluate(() => { window.__rh.tag = 'interior'; });
  const R = await page.evaluate(() => { const W = window.G.housing.world, m = W.doorMatPos, o = W.doorOut; return { m: { x: m.x, z: m.z }, o: { x: o.x, z: o.z } }; });
  const inward = (d, side) => [R.m.x - R.o.x * d - R.o.z * side, R.m.z - R.o.z * d + R.o.x * side];
  for (const [d, s] of [[2.5, 0], [3.5, 2], [4, -2], [2, 1.5], [1, 0]]) { const [x, z] = inward(d, s); await walkTo(page, x, z, 5000); }
  await page.waitForTimeout(1200);
  await page.evaluate(() => { window.__rh.tag = 'exit'; window.G.housing.exit(); });
  await page.waitForFunction(() => window.G.mode === 'village' && !window.G.ui?.iris?.active, null, { timeout: 20000 });
  await page.evaluate(() => { window.__rh.tag = 'village2'; });
  await lap();
}

// ---------------------------------------------------------------- fights
export async function fight(page, kind, hero, secs) {
  await page.evaluate(({ kind }) => {
    const G = window.G; G.state.flags.burrowTut = true;
    const P = G.state.player; P.lvl = 30; P.stats = { str: 90, dex: 90, vit: 400, ene: 300 }; P.statPts = 0;
    const tree = { chewy: ['chomp', 'whirl', 'bonestorm', 'blaze', 'fetchstorm', 'woof', 'packcall', 'multi', 'ricochet', 'throw', 'fetchMastery', 'boneMastery', 'dig', 'frenzy', 'howl'],
      moka: ['splash', 'tideMastery', 'bubble', 'shake', 'puddleHop', 'whirlpool', 'greatWave', 'kibble', 'starMastery', 'squeak', 'pawRune', 'moonbeam', 'constellation', 'meteor', 'duckDecoy', 'retriever', 'fetchLeash', 'feathers', 'duckCall', 'spiritRetriever', 'mallards'],
      poe: ['fumaThrow', 'shurikenMastery', 'kunaiFan', 'shadowStitch', 'whirlingFuma', 'shurikenRain', 'thousandStars', 'smokeBomb', 'ninjutsuMastery', 'puffBall', 'shadowClone', 'substitution', 'thunderPaw', 'smokeDragon', 'caltropFlip', 'phantomBarrage'] }[G.player.hero] || [];
    for (const id of tree) P.skills[id] = 10;
    G.actions.recompute(); P.life = null; P.zoom = null;
    G.actions.addXp = () => {};
    window.__rh.tag = 'enter';
    if (kind === 'zone') G.enterDungeon({ id: 'bambooDepths', floor: 1 }); else G.enterDungeon(12);
  }, { kind });
  await page.waitForFunction(() => window.G?.mode === 'dungeon' && window.G.dungeon?.monsters?.length && !window.G.ui?.iris?.active, null, { timeout: 60000 });
  await page.waitForTimeout(1200);
  await page.evaluate(({ kind, secs }) => {
    const G = window.G, D = G.dungeon, P = G.player, E = G.engine; window.__rh.tag = 'fight';
    const KINDS = kind === 'zone' ? [] : ['mochi', 'takenoko', 'dustbunny', 'kodama', 'kasa', 'kappa', 'tanuki', 'kurage', 'kinoko', 'oni'];
    if (KINDS.length) D.warmMonsters?.(KINDS);
    const lvl = D.layout.mlvl || 10;
    const spot = (r0, r1) => { for (let k = 0; k < 80; k++) { const a = Math.random() * Math.PI * 2, r = r0 + Math.random() * (r1 - r0); const x = P.pos.x + Math.cos(a) * r, z = P.pos.z + Math.sin(a) * r; if (G.world.walkable(x, z) && !G.world.collision?.solidAt?.(x, z, 0.4)) return [x, z]; } return [P.pos.x + 2, P.pos.z + 2]; };
    const H = window.__hunt = { n: 0, kills0: 0, casts: 0, charged: 0, end: performance.now() + secs * 1000, set: new Set() };
    const pack = (n) => { const id = KINDS[H.n++ % KINDS.length], [cx, cz] = spot(4, 9); for (let i = 0; i < n; i++) { let x = cx + Math.cos(i * 2.4) * (0.6 + i * 0.25), z = cz + Math.sin(i * 2.4) * (0.6 + i * 0.25); if (!G.world.walkable(x, z)) { x = cx; z = cz; } const m = D.spawnMonster(id, { level: lvl, rank: H.n % 3 === 0 ? 'champion' : 'normal', variant: (Math.random() * 3) | 0, x, z }); m.aggro = true; H.set.add(m); } };
    const ROT = {
      chewy: ['attack', 'attack', 'chomp', 'attack', 'whirl', 'bonestorm', 'woof', 'attack', 'packcall', 'blaze', 'fetchstorm', 'multi', 'throw'],
      moka: ['attack', 'splash', 'kibble', 'shake', 'whirlpool', 'squeak', 'constellation', 'feathers', 'meteor', 'pawRune', 'greatWave', 'duckCall', 'mallards', 'duckDecoy', 'spiritRetriever', 'fetchLeash', 'bubble'],
      poe: ['attack', 'fumaThrow', 'kunaiFan', 'shadowClone', 'shurikenRain', 'thunderPaw', 'whirlingFuma', 'attack', 'thousandStars', 'smokeBomb', 'puffBall', 'shadowClone', 'substitution', 'smokeDragon', 'caltropFlip', 'phantomBarrage'],
    }[P.hero] || ['attack'];
    const BALL = new Set(['blaze', 'fetchstorm', 'multi', 'throw']);
    let ri = 0, next = 0, hop = 0;
    const tick = E.tick.bind(E);
    E.tick = () => {
      try {
        const now = performance.now();
        if (now < H.end) {
          if (KINDS.length) { for (const m of H.set) if (!m.alive) H.set.delete(m); if (H.set.size < 70 && (H.nextP || 0) < now) { pack(10); H.nextP = now + 350; } }
          if (now > next) {
            next = now + 170;
            const id = ROT[ri++ % ROT.length];
            G.state.player.zoom = null; G.state.player.life = null; G.skills.cds = {};
            if (P.hero === 'chewy') { const ball = BALL.has(id); if (id !== 'attack' && (G.derived.weaponType === 'ball') !== ball) { G.actions.swapWeapons(); P.setWeapon(G.derived.weaponType); } }
            let t = G.combat.nearest(P.pos, 'ally', 9, e => !e.breakable);
            if (!t && kind === 'zone' && now > hop) { const m = D.monsters.filter(m => m.alive).sort((a, b) => a.pos.distanceToSquared(P.pos) - b.pos.distanceToSquared(P.pos))[0]; if (m) { let hx = m.pos.x, hz = m.pos.z; for (let k = 0; k < 24; k++) { const a = k * 2.4, r = 1.5 + (k % 4) * 0.6, x = m.pos.x + Math.cos(a) * r, z = m.pos.z + Math.sin(a) * r; if (G.world.walkable(x, z) && !G.world.collision?.solidAt?.(x, z, 0.4)) { hx = x; hz = z; break; } } P.setPos(hx, hz); E.rig.focus.copy(P.pos); E.rig.snap(); H.cutUntil = now + 250; hop = now + 1500; } }
            t ||= [...H.set].find(m => m.alive);
            if (t) { H.casts++; const charged = id !== 'attack' && H.casts % 3 === 0; if (charged) H.charged++; if (P.anim.busy?.() && id !== 'attack') P.anim.stop(); G.skills.tryCast(id, t.pos.clone(), t, charged ? { stage: 1 + (H.casts % 9 === 0 ? 2 : 0) } : null); }
          }
        }
      } catch (e) { H.err = String(e.stack || e).slice(0, 300); }
      return tick();
    };
    const sk = window.__rh.skipFn; window.__rh.skipFn = () => sk?.() || performance.now() < (H.cutUntil || 0); // (a camera cut is not a flash)
    H.kills0 = window.QA?.counts?.['monster:killed'] || 0;
    G.events.on('monster:killed', () => { H.kills = (H.kills || 0) + 1; });
  }, { kind, secs });
  await page.waitForFunction(() => performance.now() > window.__hunt.end, null, { timeout: (secs + 60) * 1000 });
  const h = await page.evaluate(() => ({ casts: window.__hunt.casts, charged: window.__hunt.charged, kills: window.__hunt.kills || 0, err: window.__hunt.err || null, n: window.G.dungeon.monsters.length }));
  return h;
}

