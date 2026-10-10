// Shadow leads the way (ROADMAP R-17; docs/ARCHITECTURE.md "Shadow leads the way"). The owner's ask: "Shadow would
// actually kind of lead the way during quests that say Shadow leads the way, or will help guide you to the next or
// current active quest objective. But he also needs to make sure that he still attacks enemies that are nearby."
//
// A Lead hangs off the companion (companion.lead). Each frame:
//  - watch(dt, hero) (always): the calm clock (no fight for CALM s), the L / R3 ask, the paw trail's fade, Story's
//    reach steps;
//  - tick(dt, hero) (in Companion.update after his combat AI, so a fight always comes first): → true when it moved him.
// What he leads to is G.questTarget(), the quest pointer's own objective (a guide's step first; tutorials.js and
// story.js tag it with { guide | quest, step, lead }), so the arrow, the minimap pin and Shadow always agree:
//  - automatically, on a step that says so (lead: true: "Follow me!", "Follow Shadow…", "Shadow has her scent"), with
//    Settings › Shadow leads the way at Quests (the default; ui.settings.shadowLead 1), or on any objective at Always (2);
//  - on request (any setting): L, the pad's R3 (a clean click: not the L3+R3 swap), a tap on the quest tracker's quest,
//    the Journal's Follow Shadow (that quest: the pointer follows it too, `focus`). Asking again stops him for that step.
// The route: one nav.findPath from the hero to the objective on this world's clearance grid (core/nav.js: the village,
// a zone, a dungeon floor, a house), cached; planned again only when the objective moves, the hero strays well off it
// or the world changes (stats.plans: never per frame). He walks it a few metres ahead of the hero at the hero's pace
// (walk or sprint), corner by corner (no cutting through what the grid routed round), lets the hero catch up at sharp
// turns, stops and looks back (then barks "This way!") when they fall behind, and sits by the objective with a paw and
// a happy bark. Nose down now and then, tail up, a faint paw-print trail behind him (gfx/pawTrail.js). As the whelp
// (Foosy played) he flies the same route ahead in the air.
// Combat first: a fight near the hero (his own combat AI, an aggroed foe within HOT_R, the hero hurt) drops the lead at
// once and he fights; he picks it up after CALM s of calm. He never walks the hero into a pack: when the route ahead
// crosses an unalerted pack's notice radius he stops short of it and growls a warning; a hero who walks on past him has
// him at heel (the normal follow, and the fight).
// Paused (the normal companion) in build / decorate mode, dialogue, fishing, a dig, scenes and celebrations, transitions,
// while his nose has a dig spot (it comes first), staged, knocked out, or a Whelp Bond move; indoors only a guide's
// objective points anywhere. No path (water, a gap): he stays with the hero and barks toward the objective, and the
// quest arrow shows the way.
import * as THREE from 'three';
import { navFor } from '../core/nav.js';
import { Events } from '../core/events.js';
import { Actions } from '../core/actions.js';
import { rand, damp } from '../core/util.js';
import { PawTrail } from '../gfx/pawTrail.js';
import { installLeadUI } from '../ui/leadUI.js';

export { LEAD_LABELS } from '../ui/leadUI.js';
export const LEAD_DEFAULT = 1; // (Settings › Shadow leads the way, ui.settings.shadowLead: 0 off (only when asked) · 1 when a quest says so · 2 always)

const AHEAD = 3.4, AHEAD_RUN = 4.8;        // m along the route ahead of the hero (walking, sprinting)
const WAIT_GAP = 6.4, RESUME_GAP = 4.6;    // the hero this far behind along the route: he stops and looks back; on again when closer
const LOST = 12;                           // the hero this far from him and off the route: he goes back to them
const OFF_ROUTE = 6;                       // the hero this far off the route: plan again from where they are
const REJOIN = 1.6;                        // he's this far off the route (knocked off, after a fight): back onto it
const CORNER = 0.85, CORNER_GAP = 2.6;     // a turn sharper than this (rad): the hero closes to this before he goes round
const ARRIVE = 1.0, ARRIVE_NPC = 1.35;     // he sits this far short of the objective (a villager: a little further)
const NEAR = 2.8;                          // the hero this near the objective: nothing to lead
const CALM = 2.0;                          // s of calm before he leads again after a fight
const HOT_R = 14;                          // an aggroed foe this near the hero: not calm
const PACK_PAD = 1.4, PACK_BACK = 1.3, PACK_LOOK = 42; // a pack's notice radius + this; he stops this short; how far ahead he looks
const NOPATH_GAP = 4.5;                    // a route that ends this far from the objective doesn't get there
const PRINT_STEP = 0.78;                   // m between paw prints
const _v = new THREE.Vector3(), _q = { x: 0, z: 0 };
// a step's key: the guide or quest, the step, and that run of it (a quest record or a guide run is its own instance: a
// new request from the same villager, or a replayed guide, is never the step you told him to drop)
const INST = new WeakMap(); let instN = 0;
const inst = o => (o ? INST.get(o) ?? (INST.set(o, ++instN), instN) : 0);

export class Lead {
  constructor(sh) {
    this.sh = sh;
    this.route = null; this.state = 'off'; this.stT = 0; this.intent = null; this.why = null;
    this.ask = null; this.dismiss = null; this.focus = null;
    this.calmT = 99; this.hotT = 0; this.hotNear = false; this.lastLife = null;
    this.sS = 0; this.sH = 0; this.hDist = 0; this._ps = 0; this._pd = 0;
    this.clock = 0; this.planT = -99; this.heelT = 0; this.sayT = 0; this.holdT = 0;
    this.sniffT = rand(3, 6); this.sniffing = 0; this.printD = 0; this.printSide = 1; this.px = null; this.pz = 0;
    this.block = null; this.packT = 0; this.warned = null; this.arrT = 0; this.tail = 0;
    this.padHeld = false; this.padClean = false;
    this.trail = new PawTrail();
    this.stats = { plans: 0, planMs: 0, maxMs: 0, nopath: 0, leadT: 0, prints: 0, warns: 0, waits: 0, arrivals: 0, asks: 0 };
    this.said = []; // (QA: the last lines he said: [state, text])
  }
  get G() { return this.sh.G; }
  /** Settings › Shadow leads the way */
  setting() { const v = this.G.ui?.settings?.shadowLead; return v == null ? LEAD_DEFAULT : v; }
  /** leading right now (walking the route, waiting for the hero, warning of a pack, or sat at the objective) */
  get active() { return this.state === 'go' || this.state === 'wait' || this.state === 'warn' || this.state === 'arrived'; }

  // ------------------------------------------------------------------ every frame
  watch(dt, p) {
    const G = this.G, sh = this.sh;
    this.clock += dt;
    this.trail.update(dt);
    G.story?.reachTick?.(dt);
    this.input();
    // the calm clock: Shadow fighting or knocked out, an aggroed foe near the hero, the hero hurt
    let hot = !!sh.combatBusy || sh.fainted > 0;
    if (G.mode === 'dungeon' && G.combat) {
      if ((this.hotT -= dt) <= 0) { this.hotT = 0.25; this.hotNear = !!G.combat.nearest(p.pos, 'ally', HOT_R, e => e.aggro && !e.breakable); }
      hot ||= this.hotNear;
      const life = G.actions?.life?.();
      if (life != null) { if (this.lastLife != null && life < this.lastLife - 0.01) hot = true; this.lastLife = life; }
    } else { this.hotNear = false; this.lastLife = null; }
    this.calmT = hot ? 0 : this.calmT + dt;
    // what stops the lead even on the frames his update never reaches tick (his nose or a dig first, staged, knocked
    // out, a Bond move, a fight): the state says so at once
    const pz = this.pauseWhy(p);
    if (pz) { this.intent = null; if (this.state !== 'off') this.stop(pz); }
    else if (this.calmT < CALM && this.active) { this.setState('fight'); this.block = null; }
    this.stT += dt;
    if (this.active) this.stats.leadT += dt;
    // tail up while he leads (the Animator's poseQuad: tailUp)
    this.tail = damp(this.tail, this.active ? (this.state === 'warn' ? 0.4 : 1) : 0, 4, dt);
    sh.anim.tailUp = this.tail;
  }
  /** L on the keyboard; the pad's lead button (R3, shared with CT-8's Next target: combat/padAim.js) on a clean, short
   *  click with no foe about: never the L3 + R3 weapon swap, never a target switch mid-fight */
  input() {
    const G = this.G;
    if (G.titleActive || G.ui?.isPaused?.() || G.ui?.dlg?.active || G.ui?.anyModal?.()) { this.padHeld = false; return; }
    let hit = Actions.pressed('lead', 'kbm');
    const tok = Actions.binds('lead', 'pad')[0];
    if (tok) {
      if (Actions.padDown(tok)) { if (!this.padHeld) { this.padHeld = true; this.padT = this.clock; this.padClean = !Actions.padDown('L3'); } else if (Actions.padDown('L3')) this.padClean = false; }
      else if (this.padHeld) { this.padHeld = false; if (this.padClean && this.clock - this.padT < 0.6 && !this.foeAbout()) hit = true; }
    }
    if (hit) this.toggle();
  }
  /** a foe near the hero (the pad's R3 is Next target then) */
  foeAbout() { const G = this.G; return G.mode === 'dungeon' && !!G.combat?.nearest?.(G.player.pos, 'ally', 16, e => !e.breakable); }

  // ------------------------------------------------------------------ what to lead to
  /** a quest the Journal asked him to follow: its objective while that step lasts (G.questTarget asks this) */
  focusTarget() {
    const f = this.focus; if (!f) return null;
    const G = this.G, q = G.state.quests.active.find(x => x.id === f.quest);
    if (!q || q.step !== f.step) { this.focus = null; return null; }
    return G.mode === 'interior' ? null : G.story?.target?.(f.quest) || null;
  }
  keyOf(t) {
    const G = this.G;
    if (t.guide) return `g:${t.guide}:${t.step}:${inst(G.tutorials?.cur)}`;
    if (t.quest) return `q:${t.quest}:${t.step}:${inst(G.state.quests.active.find(x => x.id === t.quest))}`;
    return `p:${t.label || ''}`;
  }
  /** is the step behind a key still the current one? */
  current(key) {
    if (!key) return false;
    const G = this.G, [k, a, b, n] = key.split(':');
    if (k === 'g') { const c = G.tutorials?.cur; return !!c && c.id === a && c.step?.id === b && String(inst(c)) === n; }
    if (k === 'q') { const q = G.state.quests.active.find(x => x.id === a); return !!q && String(q.step) === b && String(inst(q)) === n; }
    return true;
  }
  /** → { t, key, why: 'ask' | 'quest' | 'always' } or null */
  want() {
    const G = this.G;
    if (this.ask && !this.current(this.ask)) this.ask = null;
    if (this.dismiss && !this.current(this.dismiss)) this.dismiss = null;
    const t = G.questTarget?.(); if (!t?.pos) return null;
    const key = this.keyOf(t);
    if (this.dismiss === key) return null;
    const mode = this.setting();
    const why = this.ask === key ? 'ask' : mode >= 1 && t.lead ? 'quest' : mode === 2 ? 'always' : null;
    return why ? { t, key, why } : null;
  }
  /** why he can't lead right now (null: he can) */
  pauseWhy(p) {
    const G = this.G, sh = this.sh, ui = G.ui;
    if (G.titleActive || G.playerDead) return 'busy';
    if (ui?.iris?.active || G.leavingDungeon) return 'transition';
    if (sh.hold || sh.nose || sh.digging || sh.fainted > 0 || sh.whelp?.act) return 'shadow';
    if (G.build?.active || G.buildMode) return 'build';
    if (G.housing?.decor?.active || G.decorFocus) return 'decorate';
    if (ui?.dlg?.active) return 'dialogue';
    if (G.life?.fishing?.s) return 'fishing';
    if (G.cozy?.scav?.busy || G.cozy?.scav?.session) return 'dig';
    if (G.introFocus || G.cutscene || G.heroSwitching || G.heroFocus || p.controlLocked) return 'scene';
    if (G.dungeon?.village?.celebrate) return 'celebration';
    return null;
  }

  // ------------------------------------------------------------------ asking him
  /** ask him to lead the way (to the active objective, or that quest's), or, while he leads, to stop for this step.
   *  → true when he's leading after it */
  toggle(quest = null) {
    const G = this.G, P = G.player;
    if (this.intent && (!quest || this.intent.t.quest === quest)) { // he's on it: stop (for this step)
      this.dismiss = this.intent.key; this.ask = null; this.focus = null; this.stop('dismissed');
      this.say("Okay! I'll stay close.", null, false); this.sh.anim.play('happy');
      Events.emit('lead:stop', { why: 'asked' });
      return false;
    }
    if (quest) { const q = G.state.quests.active.find(x => x.id === quest); this.focus = q ? { quest, step: q.step } : null; }
    const t = G.questTarget?.();
    if (!t?.pos) { this.focus = null; this.say(G.mode === 'interior' ? 'The way is outside!' : 'Hmm… nowhere to go?', '?', false); return false; }
    const key = this.keyOf(t);
    this.ask = key; this.dismiss = null; this.stats.asks++;
    if (Math.hypot(P.pos.x - t.pos.x, P.pos.z - t.pos.z) < NEAR) { this.say("We're here!", 'heart'); return true; }
    this.route = null; // (a fresh route from where the hero stands)
    this.say('This way!', null, true); this.startSaid = this.clock; // (once: not again as the lead starts)
    Events.emit('lead:ask', { key, label: t.label || '' });
    return true;
  }
  /** what he says: a little line floating up over him (the HUD's float, in his blue), a bubble, a bark */
  say(text, emote = null, bark = true, sfx = 'bark_small') {
    const G = this.G, sh = this.sh, air = sh.whelp?.on ? sh.whelp.lift || 0 : 0;
    if (text) { _v.set(sh.pos.x, sh.pos.y + 0.75 + air, sh.pos.z); G.ui?.float?.(_v, text, { kind: 'status', color: '#bfe0ff' }); }
    if (emote) G.vfx?.emote?.(sh, emote, 1.5);
    if (bark) {
      if (!sh.anim.action || sh.anim.action.name === 'sit') sh.anim.play('bark', { force: false });
      Events.emit('sfx', sfx, { pos: sh.pos });
    }
    this.said.push([this.state, text || emote || sfx]); if (this.said.length > 24) this.said.shift();
  }
  setState(s) { if (s === this.state) return; this.state = s; this.stT = 0; }
  stop(why = '') {
    if (this.state === 'off') return;
    this.why = why; this.setState('off'); this.block = null;
    if (this.sh.anim.action?.name === 'groundSniff') this.sh.anim.stop('groundSniff');
  }

  // ------------------------------------------------------------------ the route
  /** one A* from the hero to the objective (cached: see the header) */
  plan(nav, p, T, key) {
    const t0 = performance.now();
    const r = nav.findPath(p.pos.x, p.pos.z, T.pos.x, T.pos.z);
    const ms = performance.now() - t0, st = this.stats;
    st.plans++; st.planMs += ms; if (ms > st.maxMs) st.maxMs = ms;
    this.planT = this.clock;
    const tx = T.pos.x, tz = T.pos.z, npc = T.kind === 'npc' || !!T.npc;
    const R = this.route = { world: this.sh.world, key, tx, tz, none: false, partial: false, pts: null, cum: null, L: 0, corners: [], sArr: 0, spot: { x: 0, z: 0 }, npc };
    const gap = r ? Math.hypot(r.x - tx, r.z - tz) : Infinity;
    // a route that stops well short: the objective is cut off (across water, walled in: no path), or the search gave up on
    // a long trek (the objective's ground is joined to the hero's: lead as far as it got, then plan again)
    let cut = !r;
    if (r && !r.exact && gap > NOPATH_GAP) { const sc = nav.nearestOpen(p.pos.x, p.pos.z, 4), reg = sc >= 0 ? nav.region[sc] : 0; if (reg && nav.nearestOpen(tx, tz, 8, reg) >= 0) R.partial = true; else cut = true; }
    if (cut) { R.none = true; st.nopath++; Events.emit('lead:nopath', { key }); return R; }
    const raw = [p.pos.x, p.pos.z, ...r.pts], pts = [raw[0], raw[1]];
    for (let i = 2; i < raw.length; i += 2) if (Math.hypot(raw[i] - pts[pts.length - 2], raw[i + 1] - pts[pts.length - 1]) > 0.05) pts.push(raw[i], raw[i + 1]);
    if (pts.length < 4) pts.push(r.x, r.z);
    const n = pts.length >> 1, cum = new Float32Array(n);
    for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(pts[2 * i] - pts[2 * i - 2], pts[2 * i + 1] - pts[2 * i - 1]);
    for (let i = 1; i < n - 1; i++) {
      const a = Math.atan2(pts[2 * i] - pts[2 * i - 2], pts[2 * i + 1] - pts[2 * i - 1]), b = Math.atan2(pts[2 * i + 2] - pts[2 * i], pts[2 * i + 3] - pts[2 * i + 1]);
      if (Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a))) > CORNER) R.corners.push(cum[i]);
    }
    R.pts = pts; R.cum = cum; R.L = cum[n - 1];
    R.sArr = R.partial ? R.L : Math.max(0, R.L - Math.max(0, (npc ? ARRIVE_NPC : ARRIVE) - (r.exact ? 0 : gap)));
    this.pointAt(R, R.sArr); R.spot.x = _q.x; R.spot.z = _q.z;
    if (!R.partial) this.pickSpot(nav, R, T);
    this.sS = -1; this.sH = -1;
    Events.emit('lead:plan', { key, L: +R.L.toFixed(1), ms: +ms.toFixed(2), partial: R.partial });
    return R;
  }
  /** where he sits at the objective: round it at his sitting distance, reachable from the route's end, near where the
   *  route arrives, on the camera's side, and (in the village) not tucked behind a house or a tree */
  pickSpot(nav, R, T, ex = R.pts[R.pts.length - 2], ez = R.pts[R.pts.length - 1]) {
    const sh = this.sh, r0 = R.npc ? ARRIVE_NPC : ARRIVE, bx = R.spot.x, bz = R.spot.z;
    const village = this.G.mode === 'village', P = { pos: T.pos };
    let best = null, bs = -Infinity;
    for (let k = 0; k < 12; k++) {
      const a = k / 12 * Math.PI * 2, x = T.pos.x + Math.sin(a) * r0, z = T.pos.z + Math.cos(a) * r0;
      if (!nav.freeAt(x, z) || !nav.los(ex, ez, x, z)) continue;
      const sc = (sh.camSide?.(P, x, z) || 0) * 0.8 - Math.hypot(x - bx, z - bz) * 0.6 - (village && sh.hiddenAt?.(x, z) ? 3 : 0);
      if (sc > bs) { bs = sc; best = a; }
    }
    if (best != null) { R.spot.x = T.pos.x + Math.sin(best) * r0; R.spot.z = T.pos.z + Math.cos(best) * r0; }
  }
  /** the nearest point of the route to (x, z) → this._ps (its arc length), this._pd (how far off); prefers staying near
   *  the previous arc, so a route that doubles back never makes him jump legs */
  project(R, x, z, prev) {
    const P = R.pts, C = R.cum, n = C.length;
    let best = Infinity;
    for (let i = 0; i < n - 1; i++) {
      const ax = P[2 * i], az = P[2 * i + 1], dx = P[2 * i + 2] - ax, dz = P[2 * i + 3] - az, l2 = dx * dx + dz * dz;
      let u = l2 > 1e-9 ? ((x - ax) * dx + (z - az) * dz) / l2 : 0; u = u < 0 ? 0 : u > 1 ? 1 : u;
      const d = Math.hypot(x - ax - dx * u, z - az - dz * u), s = C[i] + Math.sqrt(l2) * u;
      const sc = prev < 0 ? d : d + Math.max(0, Math.abs(s - prev) - 5) * 0.3; // (prev < 0: a fresh route, no history)
      if (sc < best) { best = sc; this._ps = s; this._pd = d; }
    }
  }
  /** the route's point at arc s → _q */
  pointAt(R, s) {
    const P = R.pts, C = R.cum, n = C.length;
    if (s <= 0) { _q.x = P[0]; _q.z = P[1]; return _q; }
    for (let i = 0; i < n - 1; i++) {
      if (s > C[i + 1] && i < n - 2) continue;
      const l = C[i + 1] - C[i], u = l > 1e-6 ? Math.min(1, (s - C[i]) / l) : 1;
      _q.x = P[2 * i] + (P[2 * i + 2] - P[2 * i]) * u; _q.z = P[2 * i + 1] + (P[2 * i + 3] - P[2 * i + 1]) * u;
      return _q;
    }
    _q.x = P[2 * n - 2]; _q.z = P[2 * n - 1]; return _q;
  }
  /** the first pack whose notice radius the route enters ahead (from arc s0): { s, m } or null. A pack behind a wall
   *  from that stretch (no line of sight) doesn't count there. */
  findBlock(R, s0) {
    const D = this.G.dungeon, list = D?.monsters; if (!list?.length || !R.pts) return null;
    const rad = (D.alertR || 9) + PACK_PAD, r2 = rad * rad, s1 = Math.min(R.L, s0 + PACK_LOOK), P = R.pts, C = R.cum, n = C.length;
    let best = null, bs = Infinity;
    for (const m of list) {
      if (!m.alive || m.untargetable || m.def?.passive || m.captive) continue;
      const mx = m.pos.x, mz = m.pos.z;
      for (let i = 0; i < n - 1; i++) {
        if (C[i + 1] < s0) continue;
        if (C[i] > s1 || C[i] > bs) break;
        const ax = P[2 * i], az = P[2 * i + 1], bx = P[2 * i + 2], bz = P[2 * i + 3];
        if (mx < Math.min(ax, bx) - rad || mx > Math.max(ax, bx) + rad || mz < Math.min(az, bz) - rad || mz > Math.max(az, bz) + rad) continue;
        const dx = bx - ax, dz = bz - az, fx = ax - mx, fz = az - mz, A = dx * dx + dz * dz, B = 2 * (fx * dx + fz * dz), Cc = fx * fx + fz * fz - r2;
        if (A < 1e-9) continue;
        const disc = B * B - 4 * A * Cc; if (disc < 0) continue;
        const sq = Math.sqrt(disc), u0 = Math.max(0, (-B - sq) / (2 * A)), u1 = Math.min(1, (-B + sq) / (2 * A));
        if (u0 > u1) continue;
        // the first spot inside the disc that the pack can see (1 m steps through it)
        const L = Math.sqrt(A), steps = Math.max(1, Math.ceil((u1 - u0) * L));
        let hit = -1;
        for (let k = 0; k <= steps; k++) {
          const u = u0 + (u1 - u0) * k / steps; _v.set(ax + dx * u, 0, az + dz * u);
          if (!D.los || D.los(m.pos, _v)) { hit = u; break; }
        }
        if (hit < 0) continue;
        const s = Math.max(s0, C[i] + L * hit);
        if (s < bs) { bs = s; best = m; }
        break;
      }
    }
    return best ? { s: bs, m: best } : null;
  }

  // ------------------------------------------------------------------ leading
  /** Companion.update, after his combat AI: → true when it moved him this frame */
  tick(dt, p) {
    const G = this.G, sh = this.sh;
    const pause = this.pauseWhy(p), w = pause ? null : this.want();
    this.intent = w;
    if (!w) { if (this.state !== 'off') this.stop(pause || 'none'); return false; }
    if (this.calmT < CALM) { this.setState('fight'); this.block = null; return false; } // (a fight: his own AI; then CALM s of calm)
    if (this.heelT > 0) { this.heelT -= dt; this.setState('heel'); return false; } // (the hero went another way: with them a moment)
    const T = w.t, tx = T.pos.x, tz = T.pos.z;
    if (this.state !== 'arrived' && Math.hypot(p.pos.x - tx, p.pos.z - tz) < NEAR) { this.stop('here'); return false; }
    const nav = navFor(sh.world);
    if (!nav) return this.noPath(dt, p, T);
    let R = this.route;
    const fresh = !R || R.world !== sh.world || R.key !== w.key;
    const tmv = R ? Math.hypot(tx - R.tx, tz - R.tz) : 0, since = this.clock - this.planT;
    // sat by an objective that shuffles about (a villager): his spot follows it, no new route
    if (!fresh && !R.none && this.state === 'arrived' && tmv > 1 && tmv <= 3 && since > 0.6) { R.tx = tx; R.tz = tz; this.planT = this.clock; this.pickSpot(nav, R, T, sh.pos.x, sh.pos.z); }
    // planned again only when: a new objective or world; the objective moved off (a villager walking; in a small room a
    // metre counts); the hero strayed well off the route; the end of a long trek's partial route
    else if (fresh || (R.none && since > 4) || (since > 2.5 && (tmv > 3 || this.hDist > OFF_ROUTE || (R.partial && this.sS > R.L - 4))) || (since > 0.6 && tmv > 1 && R.L < 14)) R = this.plan(nav, p, T, w.key);
    if (R.none) return this.noPath(dt, p, T);
    // where he and the hero are along it
    this.project(R, sh.pos.x, sh.pos.z, this.sS); const sS = this.sS = this._ps, dS = this._pd;
    this.project(R, p.pos.x, p.pos.z, this.sH); const sH = this.sH = this._ps; this.hDist = this._pd;
    const e = Math.hypot(p.pos.x - sh.pos.x, p.pos.z - sh.pos.z);
    if (e > LOST && this.hDist > 4 && this.state !== 'arrived') { this.heelT = 4; this.route = null; this.setState('heel'); return false; }
    const heroSpd = p.anim?.speed || 0, run = (p.sprint?.k || 0) > 0.4 || heroSpd > 5.2;
    const flying = !!sh.whelp?.on && (sh.whelp.air || 0) > 0.3;
    // a pack ahead (the combat worlds): he stops short of its notice radius; a hero who walks on past has him at heel
    if (G.mode === 'dungeon') { if ((this.packT -= dt) <= 0) { this.packT = 0.3; this.block = this.findBlock(R, Math.max(0, Math.min(sS, sH) - 1)); } } else this.block = null;
    if (this.block && sH > this.block.s - PACK_BACK + 1.2) { this.setState('heel'); return false; }
    // how far along he wants to be: ahead of the hero, not past a sharp turn the hero hasn't reached, short of a pack
    if (heroSpd > 0.5) this.nudge = 0; // (a step or two further on when he'd stand hidden: go())
    let sWant = Math.min(R.sArr, sH + (run ? AHEAD_RUN : AHEAD) + (this.nudge || 0)), blocked = false;
    for (const c of R.corners) { if (c < sS - 0.3) continue; if (c > sWant + 0.4) break; if (sH < c - CORNER_GAP) sWant = Math.min(sWant, c + 0.3); break; }
    if (this.block) { const sb = this.block.s - PACK_BACK; if (sb < sWant) { sWant = Math.max(0, sb); blocked = true; } }
    const gap = sS - sH;
    let st;
    if ((this.state === 'arrived' && this.route === R && Math.hypot(sh.pos.x - R.spot.x, sh.pos.z - R.spot.z) < 2.5) || (!R.partial && !blocked && sS >= R.sArr - 0.35 && Math.hypot(sh.pos.x - R.spot.x, sh.pos.z - R.spot.z) < 2.6)) st = 'arrived';
    else if (blocked && Math.abs(sS - sWant) < 0.5) st = 'warn';
    else if (this.state === 'wait' ? gap > RESUME_GAP : gap > WAIT_GAP || e > WAIT_GAP + 2.5) st = 'wait';
    else st = 'go';
    if (st !== this.state) this.enter(st, p, T, R);
    this.setState(st);
    if (sh.whelp?.on && st !== 'arrived') sh.whelp.still = 0; // (the whelp stays up while he leads; he may land at the objective)
    if (sh.anim.action?.name === 'sit' && st !== 'arrived' && !(st === 'wait' && this.stT > 6)) sh.anim.stop('sit');
    if (st === 'go') this.go(dt, p, R, sS, dS, sWant, heroSpd, run, flying, blocked);
    else if (st === 'wait') this.waitFor(dt, p, R, dS, sWant);
    else if (st === 'warn') this.warn(dt, p, R, dS, sWant);
    else this.arrived(dt, p, T, R);
    // the paw trail behind him (on the ground only)
    if (this.px == null || this.pw !== sh.world) { this.pw = sh.world; this.px = sh.pos.x; this.pz = sh.pos.z; }
    const mv = Math.hypot(sh.pos.x - this.px, sh.pos.z - this.pz); this.px = sh.pos.x; this.pz = sh.pos.z;
    if (!flying && mv < 1) { this.printD += mv; if (this.printD >= PRINT_STEP) { this.printD = 0; this.printSide = -this.printSide; this.trail.print(sh.world, sh.pos.x, sh.pos.z, sh.facing, this.printSide); this.stats.prints++; } }
    return true;
  }
  /** the moment he enters a state: what he says and does */
  enter(st, p, T, R) {
    const sh = this.sh, was = this.active;
    if (!was) { // (a lead begins, or picks up again after a fight, a detour back to the hero, a pause)
      if (this.state === 'off' && st !== 'warn' && st !== 'arrived' && this.clock - (this.startSaid ?? -99) > 12) { this.startSaid = this.clock; this.say('This way!'); }
      Events.emit('lead:start', { key: R.key, why: this.intent?.why, from: this.state });
    }
    if (st === 'wait') { this.sayT = was ? 1.6 : 7; this.stats.waits++; }
    if (st === 'warn') {
      this.stats.warns++;
      const pk = this.block?.m?.pack || this.block?.m; // (one warning a pack)
      if (this.warned !== pk) { this.warned = pk; this.sayT = 5; this.say('Grrr… yokai ahead!', null, true, 'growl'); Events.emit('lead:warn', { monster: this.block?.m?.def?.id || '' }); }
      else this.sayT = 2;
    }
    if (st === 'arrived') { this.arrT = 0; this.arrWalk = 0; this.stats.arrivals++; Events.emit('lead:arrive', { key: R.key }); }
  }
  /** walking the route */
  go(dt, p, R, sS, dS, sWant, heroSpd, run, flying, blocked) {
    const sh = this.sh;
    this.sniffing = Math.max(0, this.sniffing - dt);
    if (dS > REJOIN) { // off the route: back onto it, round whatever is in the way
      const q = this.pointAt(R, Math.min(sWant, Math.max(sS, this.sH)));
      sh.follow(q.x, q.z, dt, 1.4 * Math.max(1, heroSpd / sh.speed), 0.3);
    } else if (Math.abs(sWant - sS) > 0.2 && (sWant > sS || blocked)) {
      const fwd = sWant > sS, q = this.pointAt(R, fwd ? Math.min(sS + 0.9, sWant) : Math.max(sS - 0.9, sWant));
      const idle = heroSpd < 0.5, top = idle ? sh.speed : Math.max(heroSpd * 1.3, sh.speed * 1.1) + 1.5;
      let v = Math.min(top, Math.max(1.6, heroSpd + Math.abs(sWant - sS) * 1.7));
      if (this.sniffing > 0) v *= 0.8;
      sh.moveTo(q.x, q.z, dt, v / sh.speed, 0.02);
      // nose down to the trail now and then (walking pace, on the ground)
      if (!flying && !run && (this.sniffT -= dt) <= 0) { this.sniffT = rand(5, 10); if (!sh.anim.action) { sh.anim.play('groundSniff'); this.sniffing = 0.9; } }
    } else { // where he wants to be: face the way on, or the hero if they lag a little
      if (this.sH < sS - 2.5) sh.faceTo(p.pos.x, p.pos.z); else { const q = this.pointAt(R, sS + 1.5); sh.faceTo(q.x, q.z); }
      if (!flying && (this.sniffT -= dt) <= 0) { this.sniffT = rand(4, 8); if (!sh.anim.action) sh.anim.play('groundSniff'); }
      // standing tucked behind a house or a tree (the village's camera check): a step or two further on, into view
      if (this.G.mode === 'village' && (this.hidT = (this.hidT || 0) - dt) <= 0) { this.hidT = 0.8; if ((this.nudge || 0) < 2.4 && sh.hiddenAt?.(sh.pos.x, sh.pos.z)) this.nudge = (this.nudge || 0) + 1.2; }
      // the hero standing about: now and then a "This way!"
      if (heroSpd < 0.3) { if ((this.idleSay = (this.idleSay || 0) + dt) > 5) { this.idleSay = -3; this.say('This way!'); } } else this.idleSay = 0;
    }
    sh.anim.mood = 0.8;
    sh.idleT = 0; sh.wanderTarget = null;
  }
  /** the hero fell behind: he stops, turns to look back, and barks "This way!" */
  waitFor(dt, p, R, dS, sWant) {
    const sh = this.sh;
    if (dS > REJOIN) { const q = this.pointAt(R, Math.min(this.sS, sWant)); sh.follow(q.x, q.z, dt, 1.2, 0.3); }
    sh.faceTo(p.pos.x, p.pos.z);
    if ((this.sayT -= dt) <= 0) { this.sayT = 7; this.say('This way!'); }
    if (this.stT > 6 && !sh.anim.action && !(sh.whelp?.on && sh.whelp.air > 0.3)) sh.anim.play('sit');
    sh.anim.mood = 0.6; sh.idleT = 0;
  }
  /** a pack ahead: he holds short of it, facing it, and growls now and then */
  warn(dt, p, R, dS, sWant) {
    const sh = this.sh, m = this.block?.m;
    const q = this.pointAt(R, sWant);
    if (Math.hypot(q.x - sh.pos.x, q.z - sh.pos.z) > 0.3) sh.moveTo(q.x, q.z, dt, 0.9, 0.1);
    if (m) sh.faceTo(m.pos.x, m.pos.z);
    if ((this.sayT -= dt) <= 0) { this.sayT = 6; this.say(null, '!', true, 'growl'); } // (a '!' over him with each growl after the first)
    sh.anim.mood = 0.1; sh.idleT = 0;
  }
  /** at the objective: a paw at it, a happy bark, then he sits facing the hero until they get there */
  arrived(dt, p, T, R) {
    const sh = this.sh, A = sh.anim;
    // onto his spot first (a few steps round the objective), then the paw at it; a spot that moved (the villager shuffled
    // off): a few steps after it
    const far = Math.hypot(R.spot.x - sh.pos.x, R.spot.z - sh.pos.z);
    if (far > 0.2 && (this.arrT === 0 ? this.arrWalk < 2.5 : far > 0.6)) {
      this.arrWalk += dt; sh.moveTo(R.spot.x, R.spot.z, dt, 0.9, 0.12); A.mood = 1; sh.idleT = 0;
      if (A.action?.name === 'sit') A.stop('sit');
      if (this.arrT === 0) return;
    }
    if (this.arrT === 0) { sh.faceTo(T.pos.x, T.pos.z); A.play('pawDig'); }
    this.arrT += dt;
    if (this.arrT < 0.7) sh.faceTo(T.pos.x, T.pos.z);
    else if (this.arrT - dt < 0.7) { if (A.action?.name === 'pawDig') A.stop('pawDig'); A.play('happy'); this.say(null, 'heart', true); }
    else {
      sh.faceTo(p.pos.x, p.pos.z);
      if (this.arrT > 1.7 && !A.action && !(sh.whelp?.on && sh.whelp.air > 0.3)) A.play('sit');
      if (this.arrT > 5 && (this.sayT -= dt) <= 0 && Math.hypot(p.pos.x - sh.pos.x, p.pos.z - sh.pos.z) > 4) { this.sayT = 7; this.say('Over here!'); }
    }
    A.mood = 1; sh.idleT = 0;
  }
  /** no way there on foot: he stays with the hero (the normal follow) and now and then turns and barks toward it */
  noPath(dt, p, T) {
    const sh = this.sh;
    this.setState('nopath');
    if ((this.sayT -= dt) <= 0 && Math.hypot(p.pos.x - sh.pos.x, p.pos.z - sh.pos.z) < 5) { this.sayT = 8; this.holdT = 1.1; sh.faceTo(T.pos.x, T.pos.z); this.say('This way!'); }
    if (this.holdT > 0) { this.holdT -= dt; sh.faceTo(T.pos.x, T.pos.z); return true; }
    return false;
  }
}

// ------------------------------------------------------------------ the game's hooks
/** game.js, once G.questTarget and the UI exist: the pointer follows a quest the Journal asked him to follow, the
 *  tracker's tap, the debug actions (ui/leadUI.js) */
export function installShadowLead(G) {
  const lead = G.companion?.lead; if (!lead) return null;
  G.lead = lead;
  const base = G.questTarget;
  if (base && !base.__lead) {
    G.questTarget = () => { const f = lead.focus && !G.titleActive && !G.playerDead && !G.tutorials?.target() ? lead.focusTarget() : null; return f || base(); };
    G.questTarget.__lead = true;
  }
  installLeadUI(G, lead);
  return lead;
}
