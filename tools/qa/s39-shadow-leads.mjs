// s39: Shadow leads the way (ROADMAP R-17; actors/shadowLead.js, docs/ARCHITECTURE.md "Shadow leads the way").
//   a) the village: the Expedition Board guide's "Follow me!" step (lead: true): he plans one route, walks a few metres
//      ahead of the hero to the board, the hero arriving completes the step; a reach step ("Follow Shadow to …") the
//      same way, with a sprint stretch (he keeps ahead, no catch-ups); the hero stops: he stops a few metres on and
//      looks back; the hero far behind: he waits ("This way!") and doesn't run on; the paw trail (capped) and the
//      tracker's paw; the nose comes first (he sniffs, then leads on)
//   b) the setting: Off: a lead step doesn't move him; L asks him (he leads), L again stops him for that step; the
//      tracker's tap asks him too; Always: an ordinary objective; pauses: build mode and a dialogue stop him at once,
//      he picks up after
//   c) no path (an objective in the koi pond): he stays with the hero and barks "This way!" toward it; the quest arrow
//      shows; the Journal's Follow Shadow
//   d) a zone (Takemori saved: the peaceful trail): a reach step along it, he leads and the hero arriving completes it;
//      the rescue quest (Kome: "Shadow has her scent") leads by itself to the Bamboo Depths' gate
//   e) a dungeon floor (the Burrow B1F, dseed 1): a reach step to the stairs through the packs: he stops short of each
//      pack and growls (nobody alerted); the hero walks on into it: he fights at once (the lead drops), then picks it up
//      after the calm; the hero arriving completes the step
//   f) Foosy's whelp: he flies the route ahead in the air
//   g) perf: one plan a route (no per-frame A*: the companion's own route searches too), the lead's per-frame cost
//   Shots → tools/qa/tmp/r17/ (the village, the zone trail, the dungeon, the pack stop, the whelp)
//   usage: node tools/qa/s39-shadow-leads.mjs   (ONLY=ab: just those parts)
import fs from 'node:fs';
import { launch, boot, sleep, waitMode, makeReport, drainDialogue } from './lib.mjs';

const OUT = new URL('./tmp/r17/', import.meta.url); fs.mkdirSync(OUT, { recursive: true });
const shotPath = n => new URL(n + '.png', OUT).pathname.replace(/^\/([A-Z]:)/, '$1');
const R = makeReport('s39-shadow-leads');
const errs = [], warns = [];
const want = k => !process.env.ONLY || process.env.ONLY.includes(k);
const ev = (page, fn, arg) => page.evaluate(fn, arg);
const until = (page, fn, arg, timeout = 8000) => page.waitForFunction(fn, arg, { timeout, polling: 100 }).then(() => true, () => false);

// ---- helpers (in the page)
const SETUP = () => {
  const G = window.G;
  for (const id of ['moka', 'poe', 'shihtzu']) { G.state.flags[`${id}Joined`] = true; const v = G.heroes?.villagers?.[id]; if (v) { v.frozen = false; v.waitingToJoin = false; } } // (no joining scenes on the way)
  G.sim && (G.sim.tickT = -1e9); clearInterval(window.__freeze); window.__freeze = setInterval(() => { if (G.sim) G.sim.tickT = -1e9; }, 200);
  G.state.flags.hints = { ...(G.state.flags.hints || {}), garden: 1, build: 1, travel: 1, skills: 1, stats: 1, loot: 1, potion: 1, fight: 1, sprint: 1, scavDig: 1, ball: 1, stairs: 1, tabSwitch: 1 };
  for (const s of G.cozy?.scav?.view?.()?.spots || []) if (s.state === 'hidden') s.state = 'dug'; // (no nose detours unless a check asks for one)
  const L = G.lead;
  window.__lead = { ev: [], tickMs: 0, ticks: 0, steer: 0 };
  for (const n of ['lead:start', 'lead:plan', 'lead:warn', 'lead:arrive', 'lead:nopath', 'lead:ask', 'lead:stop']) G.events.on(n, e => window.__lead.ev.push([n, e || {}]));
  if (!L.__timed) {
    L.__timed = true;
    const tick = L.tick.bind(L), watch = L.watch.bind(L);
    L.tick = (dt, p) => { const t0 = performance.now(), r = tick(dt, p); window.__lead.tickMs += performance.now() - t0; window.__lead.ticks++; return r; };
    L.watch = (dt, p) => { const t0 = performance.now(); watch(dt, p); window.__lead.tickMs += performance.now() - t0; };
    const F = G.companion.route, steer = F.steer.bind(F);
    F.steer = (...a) => { const p0 = F.planT, r = steer(...a); if (F.planT !== p0) window.__lead.steer++; return r; }; // (the companion's own route searches)
  }
  G.state.quests.active = []; G.state.quests.requests = {};
  const sh = G.companion; sh.nose = null; sh.wanderTarget = null; if (sh.anim.action?.name === 'sit') sh.anim.stop('sit'); // (back at heel, beside the hero)
  if (!sh.whelp?.on) sh.setPos(G.player.pos.x - 0.9, G.player.pos.z - 0.6);
};
/** a reach quest (lead: true) to (x, z) in this world → its id */
const REACH = ([x, z, text, lead]) => {
  const G = window.G, D = G.mode === 'dungeon' ? G.dungeon : null, id = 'req_s39';
  const at = G.mode === 'village' ? 'home' : D.kind === 'region' ? D.zoneId : D.def.id;
  G.state.quests.active = G.state.quests.active.filter(q => q.id !== id);
  G.state.quests.requests[id] = { def: { title: 'Follow Shadow', giver: 'rosie', desc: 'Shadow knows the way.', steps: [{ type: 'reach', at, floor: D?.floor, x, z, text: text || 'Follow Shadow to the spot', lead: lead !== false }], reward: { coins: 1 }, request: true, next: null } };
  G.story.start(id, true);
  return id;
};
/** a reachable spot dMin–dMax away with a turning route (≥ corners turns), as far as possible from water */
const SPOT = ([dMin, dMax, corners]) => {
  const G = window.G, P = G.player, nav = P.nav;
  let best = null;
  for (let k = 0; k < 400; k++) {
    const a = k * 2.399, r = dMin + ((k * 7) % 11) / 10 * (dMax - dMin), x = P.pos.x + Math.sin(a) * r, z = P.pos.z + Math.cos(a) * r;
    if (!nav.freeAt(x, z) || G.world.walkable?.(x, z) === false) continue;
    const route = nav.findPath(P.pos.x, P.pos.z, x, z); if (!route?.exact) continue;
    const n = route.pts.length / 2;
    if (n - 1 >= (corners || 0)) { best = { x, z, n }; break; }
  }
  return best;
};
const S = () => { // a snapshot
  const G = window.G, L = G.lead, sh = G.companion, P = G.player, R = L.route;
  return { st: L.state, why: L.why, sS: +L.sS.toFixed(2), sH: +L.sH.toFixed(2), L: R ? +R.L.toFixed(1) : 0, none: !!R?.none, blk: L.block ? +L.block.s.toFixed(1) : null,
    d: +Math.hypot(sh.pos.x - P.pos.x, sh.pos.z - P.pos.z).toFixed(2), plans: L.stats.plans, prints: L.stats.prints, alive: L.trail.alive, calm: +Math.min(99, L.calmT).toFixed(2),
    fight: !!sh.combatBusy, intent: L.intent?.why || null, q: G.state.quests.active.map(q => `${q.id}:${q.step}`).join(), said: L.said.slice(-3).map(s => s[1]), catchUps: sh.catchUps || 0,
    air: +(sh.whelp?.air || 0).toFixed(2), lift: +(sh.whelp?.lift || 0).toFixed(2), whelp: !!sh.whelp?.on, hero: G.state.activeHero, mode: G.mode,
    corners: R?.corners?.length || 0, cv: !!R?.corners?.some(c => L.sS > c + 0.8 && L.sH < c - 3.6) }; // (cv: he went round a sharp turn the hero was well short of)
};
/** the hero follows Shadow along his route (1.4 m behind him), as a player would; once he sits at the objective, the
 *  hero walks up to it */
const FOLLOW = (back = 1.4) => { const G = window.G, L = G.lead, R = L.route, P = G.player; if (!R || R.none || !R.pts) return false; const q = L.state === 'arrived' ? { x: R.tx, z: R.tz } : L.pointAt(R, Math.max(0, L.sS - back)); P.moveTarget = new P.pos.constructor(q.x, P.pos.y, q.z); return true; };
async function walkBehind(page, { until: stop, max = 240, back = 1.4, each = null } = {}) {
  let s = null;
  for (let i = 0; i < max; i++) {
    s = await ev(page, S);
    if (stop(s, i)) return s;
    if (each) await each(s, i);
    await ev(page, FOLLOW, back);
    await sleep(page, 200);
  }
  return s;
}

// ================================================================== a) b) c) the village
if (want('a') || want('b') || want('c')) {
  const { browser, page, errors, warns: w } = await launch({ w: 1600, h: 900 });
  await boot(page, 'fresh&nointro&notut&hour=10');
  await ev(page, SETUP);
  const base = await ev(page, () => ({ setting: window.G.ui.settings.shadowLead ?? null, def: window.G.lead.setting(), board: !!window.G.cozy?.board?.it }));
  R.check('Settings › Shadow leads the way defaults to "When a quest says so" (1)', base.def === 1, base);
  if (want('a')) {
    // the Expedition Board guide's walk step: "Follow me!"
    const g0 = await ev(page, () => { const G = window.G; G.tutorials.start('board'); return { cur: G.tutorials.cur?.id, step: G.tutorials.cur?.step?.id }; });
    const led = await until(page, () => window.G.lead.state === 'go' && window.G.lead.intent?.why === 'quest', null, 8000);
    const g1 = await ev(page, () => { const G = window.G, t = G.questTarget(); return { t: t && { label: t.label, guide: t.guide, lead: t.lead }, plans: G.lead.stats.plans, L: +(G.lead.route?.L || 0).toFixed(1), said: G.lead.said.map(s => s[1]) }; });
    R.check('a) the Board guide\'s "Follow me!" step tags the pointer lead: true, and Shadow leads by himself (one route, "This way!")', g0.cur === 'board' && led && g1.t?.lead && g1.t.guide === 'board' && g1.plans === 1 && g1.said.includes('This way!'), { g0, g1 });
    let ahead = [], mid = null, cv = 0, corners = 0;
    const gb = await walkBehind(page, { until: (s) => { const done = s.st !== 'go' && s.st !== 'wait' && s.st !== 'arrived'; return done; }, max: 260, each: async (s, i) => { if (s.st === 'go') ahead.push(+(s.sS - s.sH).toFixed(2)); corners = Math.max(corners, s.corners); if (s.cv) cv++; if (i === 30) { mid = s; await page.screenshot({ path: shotPath('village-board') }); } } });
    const g2 = await ev(page, () => ({ cur: window.G.tutorials.cur?.id || null, step: window.G.tutorials.cur?.step?.id || null, arrive: window.__lead.ev.filter(e => e[0] === 'lead:arrive').length }));
    const inBand = ahead.filter(g => g > 0.6 && g < 6.5).length / Math.max(1, ahead.length);
    R.check('a) he walks it ahead of the hero (≥ 90% of the walk 0.6–6.5 m ahead along the route) and the hero reaching the board completes the step', ahead.length > 20 && inBand >= 0.9 && g2.step !== 'walk', { n: ahead.length, inBand: +inBand.toFixed(2), min: Math.min(...ahead), max: Math.max(...ahead), g2, gb, mid });
    R.check('a) at the route’s sharp turns he lets the hero catch up before he goes round (never round a turn the hero is well short of)', corners >= 1 && cv === 0, { corners, cv });
    await ev(page, () => window.G.tutorials.stop());
    // a reach step with a sprint stretch
    const sp = await ev(page, SPOT, [34, 46, 3]);
    await ev(page, REACH, [sp.x, sp.z, 'Follow Shadow to the old well']);
    await until(page, () => window.G.lead.state === 'go', null, 6000);
    const c0 = await ev(page, () => window.G.companion.catchUps || 0);
    await page.keyboard.down('Shift');
    const run = [];
    const r1 = await walkBehind(page, { until: s => s.st === 'arrived' || !s.q.includes('req_s39'), max: 200, back: 1.2, each: async s => { if (s.st === 'go') run.push(+(s.sS - s.sH).toFixed(2)); } });
    await page.keyboard.up('Shift');
    const r1b = await ev(page, () => ({ sprinted: (window.G.player.sprint?.k || 0), catchUps: window.G.companion.catchUps || 0 }));
    R.check('a) a reach step: he leads at a sprint too (keeps ahead, never "waits", no catch-up teleports) and arrives first', r1.st === 'arrived' && run.length > 8 && Math.min(...run) > -0.5 && run.filter(g => g > 6.4).length === 0 && r1b.catchUps === c0, { r1, n: run.length, min: Math.min(...run), max: Math.max(...run), c0, r1b });
    await sleep(page, 2200);
    const arr = await ev(page, () => { const G = window.G, sh = G.companion, R = G.lead.route; return { st: G.lead.state, sit: sh.anim.action?.name || null, said: G.lead.said.map(s => s[1]), spot: R ? +Math.hypot(sh.pos.x - R.spot.x, sh.pos.z - R.spot.z).toFixed(2) : null, dT: R ? +Math.hypot(sh.pos.x - R.tx, sh.pos.z - R.tz).toFixed(2) : null }; });
    await page.screenshot({ path: shotPath('village-arrived') });
    R.check('a) at the objective: a paw at it, a happy bark (a heart), then he sits by it (≈1 m off)', arr.st === 'arrived' && arr.sit === 'sit' && arr.said.includes('heart') && arr.dT > 0.6 && arr.dT < 1.8, arr);
    const done = await walkBehind(page, { until: s => !s.q.includes('req_s39'), max: 40, back: -0.5 });
    await ev(page, () => { window.G.player.moveTarget = null; });
    R.check('a) the hero arriving completes the reach step (and he stops leading)', !done.q.includes('req_s39') && (await until(page, () => window.G.lead.state === 'off', null, 2000)), done);
    // the hero stops: he stops a few metres on, looks back; the hero far behind: he waits and barks
    const sp2 = await ev(page, SPOT, [36, 48, 2]);
    await ev(page, REACH, [sp2.x, sp2.z]);
    await until(page, () => window.G.lead.state === 'go', null, 6000);
    await walkBehind(page, { until: (s, i) => i > 25, max: 30 });
    await ev(page, () => { window.G.player.moveTarget = null; });
    await sleep(page, 3000);
    const st1 = await ev(page, () => { const s = window.__s39 = window.G.lead; const sh = window.G.companion, P = window.G.player; const f = Math.atan2(P.pos.x - sh.pos.x, P.pos.z - sh.pos.z); return { st: s.state, gap: +(s.sS - s.sH).toFixed(2), face: +Math.abs(Math.atan2(Math.sin(sh.faceTarget - f), Math.cos(sh.faceTarget - f))).toFixed(2), spd: +(sh.anim.speed || 0).toFixed(2) }; });
    R.check('a) the hero stops: he stops a few metres on (≤ 4.5 m ahead), standing, and turns to look back at them', st1.st === 'go' && st1.gap > 1.5 && st1.gap < 4.5 && st1.spd < 0.3 && st1.face < 0.6, st1);
    // the hero far behind (as if they wandered back): he waits, looks back, "This way!", and doesn't run on
    await ev(page, () => { const G = window.G, L = G.lead, q = L.pointAt(L.route, Math.max(0, L.sH - 7)); G.player.setPos(q.x, q.z); G.engine.rig.focus.copy(G.player.pos); G.engine.rig.snap(); });
    const waited = await until(page, () => window.G.lead.state === 'wait', null, 3000);
    const w0 = await ev(page, () => window.G.lead.sS);
    await sleep(page, 2600);
    const w1 = await ev(page, () => { const L = window.G.lead; return { st: L.state, sS: L.sS, said: L.said.slice(-3).map(s => s[0] + ':' + s[1]) }; });
    await page.screenshot({ path: shotPath('village-wait') });
    R.check('a) the hero far behind: he waits (no further on), looking back, and barks "This way!"', waited && w1.st === 'wait' && Math.abs(w1.sS - w0) < 0.8 && w1.said.some(s => s === 'wait:This way!'), { waited, w0, w1 });
    const resumed = await walkBehind(page, { until: s => s.st === 'go' && s.sS - s.sH < 4.8 && s.d < 6, max: 40 });
    R.check('a) the hero catches up: he leads on', resumed.st === 'go', resumed);
    await walkBehind(page, { until: (s, i) => i > 12, max: 14 });
    // the trail and the tracker's paw
    const tr = await ev(page, () => { const G = window.G, L = G.lead, m = L.trail.mesh, list = G.ui.hud.$.qtList; return { prints: L.stats.prints, alive: L.trail.alive, cap: L.trail.recs.length, inScene: !!m && m.parent === G.world.scene, calls: m ? 1 : 0, paw: list?.dataset?.lead ?? null, title: list?.title || '' }; });
    R.check('a) the paw trail behind him: prints laid as he walks, capped (≤ 22 alive), one instanced draw; the tracker shows the paw on the led quest', tr.prints > 20 && tr.alive > 0 && tr.alive <= tr.cap && tr.cap <= 22 && tr.inScene && tr.paw === '0', tr);
    // the nose comes first
    const n0 = await ev(page, () => { const G = window.G, sh = G.companion, L = G.lead, q = L.pointAt(L.route, L.sS + 2.5); window.__nose = 0; const ok = sh.noseTo(q.x + 1.2, q.z + 0.6, { onArrive: () => { window.__nose = 1; }, onGiveUp: () => { window.__nose = -1; } }); return { ok, st: L.state }; });
    await sleep(page, 400);
    const n1 = await ev(page, () => ({ st: window.G.lead.state, why: window.G.lead.why, nose: !!window.G.companion.nose }));
    const sniffed = await until(page, () => window.__nose !== 0, null, 9000);
    await ev(page, () => { const G = window.G, N = G.companion.nose; if (N) G.player.moveTarget = new G.player.pos.constructor(N.x, G.player.pos.y, N.z); }); // (the hero goes to see what he found)
    const noseDone = await until(page, () => !window.G.companion.nose, null, 9000);
    const back = await walkBehind(page, { until: s => s.st === 'go' || s.st === 'arrived' || s.st === 'wait', max: 60, back: 1.0 });
    R.check('a) a dig spot sniffed mid-lead: the nose comes first (the lead steps aside), then he leads on', n0.ok && n1.st === 'off' && n1.why === 'shadow' && n1.nose && sniffed && noseDone && ['go', 'arrived', 'wait'].includes(back.st), { n0, n1, sniffed, noseDone, back: back.st });
    await ev(page, () => { window.G.player.moveTarget = null; });
  }
  if (want('b')) {
    await ev(page, SETUP);
    const sp = await ev(page, SPOT, [30, 40, 1]);
    // Off: a lead step doesn't move him
    await ev(page, () => window.G.ui.setSetting('shadowLead', 0));
    const pl0 = await ev(page, () => window.G.lead.stats.plans);
    await ev(page, REACH, [sp.x, sp.z]);
    await sleep(page, 2500);
    const o1 = await ev(page, S);
    R.check('b) Off: a lead step leaves him at heel (no lead, no route, near the hero)', o1.st === 'off' && !o1.intent && o1.plans === pl0 && o1.d < 3.5, { ...o1, pl0 });
    // L asks him; L again stops him for this step
    await page.keyboard.press('l');
    const asked = await until(page, () => window.G.lead.state === 'go' && window.G.lead.intent?.why === 'ask', null, 4000);
    await sleep(page, 1200);
    await page.keyboard.press('l');
    await sleep(page, 1500);
    const o2 = await ev(page, () => { const L = window.G.lead; return { st: L.state, dismiss: L.dismiss, said: L.said.slice(-2).map(s => s[1]) }; });
    R.check('b) Off: L asks him (he leads: "ask"), L again stops him for this step ("Okay! I\'ll stay close.")', asked && o2.st === 'off' && !!o2.dismiss && o2.said.some(s => /stay close/.test(s)), { asked, o2 });
    // the tracker's tap asks him
    const tap = await ev(page, () => { const G = window.G, row = G.ui.hud.$.qtList.querySelector('.qt-q'); if (!row) return null; row.click(); return { st: G.lead.state, ask: G.lead.ask }; });
    const tapped = await until(page, () => window.G.lead.state === 'go' && window.G.lead.intent?.why === 'ask', null, 4000);
    R.check('b) a tap on the quest tracker\'s quest asks him to lead', !!tap && tapped, tap);
    await ev(page, () => window.G.lead.toggle());
    // Always: an ordinary objective (no lead tag)
    await ev(page, () => window.G.ui.setSetting('shadowLead', 2));
    await ev(page, REACH, [sp.x, sp.z, 'Walk to the spot', false]);
    const always = await until(page, () => window.G.lead.state === 'go' && window.G.lead.intent?.why === 'always', null, 4000);
    await ev(page, () => window.G.ui.setSetting('shadowLead', 1));
    await sleep(page, 600);
    const q1 = await ev(page, () => ({ st: window.G.lead.state, intent: window.G.lead.intent?.why || null }));
    R.check('b) Always: he leads to an ordinary objective; back on Quests he doesn\'t', always && q1.st === 'off' && !q1.intent, { always, q1 });
    // pauses: build mode and a dialogue
    await ev(page, REACH, [sp.x, sp.z]);
    await until(page, () => window.G.lead.state === 'go', null, 4000);
    await ev(page, () => window.G.build.enter());
    await sleep(page, 400);
    const p1 = await ev(page, () => ({ st: window.G.lead.state, why: window.G.lead.why, build: !!window.G.build.active }));
    await ev(page, () => window.G.build.exit());
    const p1b = await until(page, () => window.G.lead.state === 'go' || window.G.lead.state === 'wait', null, 4000);
    await ev(page, () => { window.__dlg = window.G.ui.dialogue({ speaker: 'Rosie', lines: ['Shadow! Sit for a second, sweetie.'] }); });
    await sleep(page, 400);
    const p2 = await ev(page, () => ({ st: window.G.lead.state, why: window.G.lead.why, dlg: !!window.G.ui.dlg?.active }));
    await drainDialogue(page);
    const p2b = await until(page, () => window.G.lead.state === 'go' || window.G.lead.state === 'wait', null, 4000);
    R.check('b) build mode and a dialogue pause the lead at once; he picks it up after', p1.build && p1.st === 'off' && p1.why === 'build' && p1b && p2.dlg && p2.st === 'off' && p2.why === 'dialogue' && p2b, { p1, p1b, p2, p2b });
  }
  if (want('c')) {
    await ev(page, SETUP);
    // no path: an objective in the middle of the koi pond
    const pond = await ev(page, async () => { const { POND } = await import('/src/world/layout.js'); const G = window.G; G.player.setPos(POND.x + POND.r + 5, POND.z); G.companion.setPos(POND.x + POND.r + 6, POND.z + 0.8); G.engine.rig.focus.copy(G.player.pos); G.engine.rig.snap(); return { x: POND.x, z: POND.z, r: POND.r }; });
    await sleep(page, 400);
    await ev(page, REACH, [pond.x, pond.z, 'Follow Shadow to the koi']);
    const np = await until(page, () => window.G.lead.state === 'nopath' && window.G.lead.holdT > 0.3, null, 9000);
    const c1 = await ev(page, () => { const G = window.G, sh = G.companion, P = G.player, t = G.questTarget(); const f = Math.atan2(t.pos.x - sh.pos.x, t.pos.z - sh.pos.z); return { st: G.lead.state, none: !!G.lead.route?.none, said: G.lead.said.map(s => s[0] + ':' + s[1]), d: +Math.hypot(sh.pos.x - P.pos.x, sh.pos.z - P.pos.z).toFixed(2), arrow: !!document.querySelector('.qa.show'), face: +Math.abs(Math.atan2(Math.sin(sh.faceTarget - f), Math.cos(sh.faceTarget - f))).toFixed(2), nopath: window.__lead.ev.filter(e => e[0] === 'lead:nopath').length }; });
    await sleep(page, 300); await page.screenshot({ path: shotPath('village-nopath') });
    R.check('c) no path (the objective is in the koi pond): no route, he stays with the hero and barks "This way!" toward it; the quest arrow shows the way', np && c1.none && c1.said.includes('nopath:This way!') && c1.d < 5 && c1.arrow && c1.nopath >= 1, c1);
    // the Journal's Follow Shadow (on Off: an ask)
    const sp = await ev(page, SPOT, [28, 38, 1]);
    await ev(page, REACH, [sp.x, sp.z, 'Follow Shadow to the bench']);
    await ev(page, () => window.G.ui.setSetting('shadowLead', 0));
    await ev(page, () => window.G.ui.open('quests'));
    await sleep(page, 600);
    const j0 = await ev(page, () => { const b = document.querySelector('.p-quests .qd-lead'); return b ? { text: b.textContent.trim(), dis: b.disabled } : null; });
    await ev(page, () => document.querySelector('.p-quests .qd-lead')?.click());
    const j1 = await until(page, () => window.G.lead.state === 'go' && window.G.lead.intent?.why === 'ask' && !window.G.ui.isOpen('quests'), null, 5000);
    R.check('c) the Journal\'s Follow Shadow: he leads to that quest (the Journal closes)', !!j0 && !j0.dis && /Follow Shadow/.test(j0.text) && j1, { j0, j1 });
    await ev(page, () => { window.G.ui.setSetting('shadowLead', 1); window.G.lead.toggle(); });
  }
  errs.push(...errors); warns.push(...w);
  await browser.close();
}

// ================================================================== d) a zone (Takemori saved: the peaceful trail)
if (want('d')) {
  const { browser, page, errors, warns: w } = await launch({ w: 1600, h: 900 });
  await boot(page, 'fresh&nointro&notut&villagesaved=bamboo&region=bamboo');
  await waitMode(page, 'dungeon', 40000);
  await sleep(page, 1200);
  await ev(page, SETUP);
  await ev(page, () => { const G = window.G; G.state.player.lvl = 12; G.actions.recompute?.(); G.player.invuln = true; });
  const sp = await ev(page, SPOT, [34, 46, 2]);
  await ev(page, REACH, [sp.x, sp.z, 'Follow Shadow down the trail']);
  const led = await until(page, () => window.G.lead.state === 'go', null, 6000);
  let shot = false, warned = 0;
  const z1 = await walkBehind(page, { until: s => !s.q.includes('req_s39'), max: 260, each: async (s, i) => {
    if (!shot && i > 18 && s.st === 'go') { shot = true; await page.screenshot({ path: shotPath('zone-trail') }); }
    if (s.st === 'warn') { warned++; await ev(page, () => { const b = window.G.lead.block; if (b) for (const m of window.G.dungeon.monsters) if (m.alive && Math.hypot(m.pos.x - b.m.pos.x, m.pos.z - b.m.pos.z) < 10) m.die(); }); }
  } });
  R.check('d) a zone (Takemori saved): a reach step down the trail: he leads (one route) and the hero arriving completes it', led && !z1.q.includes('req_s39') && z1.plans <= 2 + warned, { z1, warned, sp });
  // the rescue quest: "Shadow has her scent" leads by itself to the Bamboo Depths' gate
  await ev(page, () => { const G = window.G; G.state.quests.requests = {}; G.state.quests.active = []; G.story.start('tk_kome', true); });
  const rs = await until(page, () => window.G.lead.intent?.why === 'quest' && window.G.lead.intent.t.quest === 'tk_kome' && window.G.lead.state === 'go', null, 6000);
  const r1 = await ev(page, () => { const G = window.G, t = G.questTarget(), D = G.dungeon; return { label: t?.label, lead: t?.lead, quest: t?.quest, gate: !!D.gatePos && Math.hypot(t.pos.x - D.gatePos.x, t.pos.z - D.gatePos.z) < 0.5, st: G.lead.state, desc: /Shadow has her scent/.test(G.story.def('tk_kome').desc) }; });
  R.check('d) the rescue quest (Kome: "Shadow has her scent: follow him!") leads by itself, to the Bamboo Depths\' gate', rs && r1.lead && r1.gate && r1.desc && r1.quest === 'tk_kome', r1);
  errs.push(...errors); warns.push(...w);
  await browser.close();
}

// ================================================================== e) a dungeon floor: packs in the way, a fight, the stairs
if (want('e')) {
  const { browser, page, errors, warns: w } = await launch({ w: 1600, h: 900 });
  await boot(page, 'fresh&nointro&notut&floor=1');
  await waitMode(page, 'dungeon', 40000);
  await sleep(page, 1200);
  await ev(page, SETUP);
  await ev(page, () => { const G = window.G; G.player.invuln = true; G.state.player.lvl = 6; G.actions.recompute?.(); });
  const tgt = await ev(page, () => { const D = window.G.dungeon; return { x: D.stairsPos.x, z: D.stairsPos.z }; });
  await ev(page, REACH, [tgt.x, tgt.z, 'Follow Shadow to the stairs']);
  const led = await until(page, () => window.G.lead.state === 'go', null, 6000);
  await sleep(page, 1500);
  await page.screenshot({ path: shotPath('dungeon-lead') });
  // to the first pack: he stops short of it and growls; nobody alerted
  const w1 = await walkBehind(page, { until: s => s.st === 'warn', max: 200 });
  await ev(page, () => { window.G.player.moveTarget = null; });
  await ev(page, () => { window.G.engine.rig.distTarget = 38; }); // (zoomed out a little, as a player would, so the pack is in the picture)
  await sleep(page, 1100);
  const wv = await ev(page, () => { const G = window.G, L = G.lead, b = L.block, sh = G.companion, P = G.player, R = (G.dungeon.alertR || 9); return { st: L.state, said: L.said.map(s => s[0] + ':' + s[1]), growl: window.QA?.sfx?.includes('growl'), dSh: b ? +Math.hypot(sh.pos.x - b.m.pos.x, sh.pos.z - b.m.pos.z).toFixed(2) : null, dHero: b ? +Math.hypot(P.pos.x - b.m.pos.x, P.pos.z - b.m.pos.z).toFixed(2) : null, alertR: R, aggro: G.dungeon.monsters.filter(m => m.alive && m.aggro).length, fight: !!sh.combatBusy }; });
  await page.screenshot({ path: shotPath('dungeon-pack-stop') });
  await ev(page, () => { window.G.engine.rig.distTarget = 27; });
  R.check('e) a pack ahead: he stops short of its notice radius and growls ("Grrr… yokai ahead!"); nobody alerted, no fight', led && w1.st === 'warn' && wv.st === 'warn' && wv.said.includes('go:Grrr… yokai ahead!') && wv.dSh > wv.alertR && wv.dHero > wv.alertR && wv.aggro === 0 && !wv.fight, { w1, wv });
  // the hero walks on into the pack: he fights at once, the lead drops; then it's calm: he leads on
  await ev(page, () => { const G = window.G, m = G.lead.block?.m; if (m) G.player.moveTarget = m.pos.clone(); });
  const fought = await until(page, () => window.G.companion.combatBusy && window.G.lead.state === 'fight', null, 9000);
  const f1 = await ev(page, () => ({ st: window.G.lead.state, fight: !!window.G.companion.combatBusy, calm: window.G.lead.calmT, aggro: window.G.dungeon.monsters.filter(m => m.alive && m.aggro).length }));
  // (the fight ends: everything near falls)
  for (let k = 0; k < 6; k++) { await ev(page, () => { const G = window.G, P = G.player; for (const m of G.dungeon.monsters) if (m.alive && (m.aggro || Math.hypot(m.pos.x - P.pos.x, m.pos.z - P.pos.z) < 14)) m.die(); G.player.moveTarget = null; }); await sleep(page, 300); }
  const resumed = await until(page, () => ['go', 'warn', 'wait', 'arrived'].includes(window.G.lead.state), null, 8000);
  const f2 = await ev(page, () => ({ st: window.G.lead.state, calm: +window.G.lead.calmT.toFixed(2) }));
  R.check('e) the hero walks on into the pack: he drops the lead and fights at once; after ~2 s of calm he leads on', fought && f1.fight && f1.st === 'fight' && resumed && f2.calm >= 1.9, { fought, f1, resumed, f2 });
  // on to the stairs, packs cleared as he warns of them; the hero arriving completes the step
  let warns2 = 0, shot2 = false;
  const e2 = await walkBehind(page, { until: s => !s.q.includes('req_s39'), max: 500, each: async s => {
    if (s.st === 'warn') { warns2++; await ev(page, () => { const b = window.G.lead.block; if (b) for (const m of window.G.dungeon.monsters) if (m.alive && Math.hypot(m.pos.x - b.m.pos.x, m.pos.z - b.m.pos.z) < 10) m.die(); }); }
    if (!shot2 && s.st === 'go' && s.sS > 40) { shot2 = true; await page.screenshot({ path: shotPath('dungeon-trail') }); }
    if (s.st === 'fight') await ev(page, () => { const G = window.G, P = G.player; for (const m of G.dungeon.monsters) if (m.alive && (m.aggro || Math.hypot(m.pos.x - P.pos.x, m.pos.z - P.pos.z) < 12)) m.die(); });
  } });
  const e3 = await ev(page, () => ({ plans: window.G.lead.stats.plans, warns: window.G.lead.stats.warns, steer: window.__lead.steer }));
  R.check('e) a dungeon floor: he leads to the stairs (stopping short of each pack on the way) and the hero arriving completes the step', !e2.q.includes('req_s39') && warns2 >= 1, { e2, warns2, e3 });
  // g) perf: one plan a route (re-plans only after the fight moved the hero off it), no per-frame A* from him
  const pf = await ev(page, () => ({ plans: window.G.lead.stats.plans, avg: +(window.G.lead.stats.planMs / Math.max(1, window.G.lead.stats.plans)).toFixed(2), max: +window.G.lead.stats.maxMs.toFixed(2), steer: window.__lead.steer, ms: +(window.__lead.tickMs / Math.max(1, window.__lead.ticks)).toFixed(4), ticks: window.__lead.ticks }));
  R.check('g) perf on the floor: a handful of plans for the whole walk (≤ 4), his own route searches rare (≤ 12), the lead\'s frame cost tiny (< 0.15 ms a frame)', pf.plans <= 4 && pf.steer <= 12 && pf.ms < 0.15 && pf.ticks > 300, pf);
  errs.push(...errors); warns.push(...w);
  await browser.close();
}

// ================================================================== f) Foosy's whelp flies the route ahead
if (want('f')) {
  const { browser, page, errors, warns: w } = await launch({ w: 1600, h: 900 });
  await boot(page, 'fresh&nointro&notut&hour=11');
  await ev(page, SETUP);
  await ev(page, () => { const G = window.G; for (const id of ['moka', 'poe', 'shihtzu']) { G.state.flags[`${id}Joined`] = true; const v = G.heroes.villagers[id]; if (v) { v.frozen = false; v.waitingToJoin = false; } } G.heroes.spawnBench(); G.heroes.joinGolden(); });
  await sleep(page, 600);
  await ev(page, () => window.G.heroes.switchTo('golden'));
  const sw = await until(page, () => window.G.state.activeHero === 'golden' && !window.G.heroSwitching && window.G.companion.whelp.on, null, 20000);
  await sleep(page, 1200);
  await ev(page, SETUP);
  const sp = await ev(page, SPOT, [34, 46, 2]);
  await ev(page, REACH, [sp.x, sp.z, 'Follow Shadow to the spot']);
  await until(page, () => window.G.lead.state === 'go', null, 6000);
  await sleep(page, 1200);
  const p0 = await ev(page, () => window.G.lead.stats.prints);
  const air = [];
  let shot = false;
  const f1 = await walkBehind(page, { until: s => s.st === 'arrived' || !s.q.includes('req_s39'), max: 220, each: async (s, i) => { if (s.st === 'go' && i > 6) air.push([s.air, s.lift, +(s.sS - s.sH).toFixed(2)]); if (!shot && i > 20 && s.st === 'go') { shot = true; await page.screenshot({ path: shotPath('whelp-lead') }); } } });
  const up = air.filter(a => a[0] > 0.5 && a[1] > 0.6).length / Math.max(1, air.length), ahead = air.filter(a => a[2] > 0.5).length / Math.max(1, air.length);
  const fp = (await ev(page, () => window.G.lead.stats.prints)) - p0;
  R.check('f) Foosy played: Shadow the whelp flies the route ahead in the air (≥ 85% of it airborne and ahead), no paw prints in the air', sw && air.length > 15 && up >= 0.85 && ahead >= 0.85 && f1.whelp && fp <= 3, { sw, n: air.length, up: +up.toFixed(2), ahead: +ahead.toFixed(2), f1, prints: fp });
  errs.push(...errors); warns.push(...w);
  await browser.close();
}

process.exit(R.finish(errs, warns) ? 1 : 0);
