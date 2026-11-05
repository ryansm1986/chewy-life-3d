// Combo chains: the chain's state machine (docs/COMBO.md §1, §5). One per SkillRunner (G.skills.chain).
//
//   tap ──▶ step 1 ──its swing and recovery done──▶ the window (WINDOW s) ──tap the same skill──▶ step 2 ─▶ … ─▶ finisher
//                                                          └──runs out / another skill / a roll──▶ dropped
//   a held charge released while the chain is live ──▶ the finisher (the bonus; the chain ends)
//
// Wired into SkillRunner.tryCast once, for every skill: plan(id, charge) before the cast (which step it would be),
// apply(R, plan) on its runtime (rpg/combo.js comboRuntime: the step's cost, the finisher's damage), commit(...) after
// it went off. The step's attack speed reaches every hero's casts because it scales the animator ACTION the cast started
// (and any action the cast chains into while the step runs): its duration and its clock together, so the hit frames and
// events stay in sync whichever helper the cast read its own speed from (animSpeed, castRate, castMul). A press during
// a step's recovery is buffered by tryCast's queue (bufferFor). Nothing here touches move speed.
// Events: 'combo:step' {id, step}, 'combo:finish' {id, charged}, 'combo:land' {id}, 'combo:drop' {id, step, reason}.
import * as THREE from 'three';
import { Events } from '../core/events.js';
import { COMBO, STEPS, WINDOW, TEMPO, comboable, comboPerksOf, comboRuntime, fullComboPerks } from '../rpg/combo.js';
import { SKILLS, skillRuntime } from '../rpg/skills.js';
import { comboFx } from '../gfx/comboFx.js';
import { registerDebug } from '../debug/registry.js';

const _f = new THREE.Vector3();
const LAND_T = 1.4; // s after a finisher's cast that its first hit still counts as it landing (a thrown ball's flight)

export class ComboController {
  constructor(runner) {
    this.runner = runner; this.G = runner.G;
    this.clock = 0;
    this.chain = null; // the live chain: { id, step (the last step done), until (the window's end; Infinity while the step runs) }
    this.cur = null;   // the step in progress: { id, m (its attack-speed multiplier), wait (a runner field that keeps it going) }
    this.fin = null;   // the last finisher, until it lands: { id, t, color, tempo }
    this.last = null;  // the last cast's step record (QA): { id, step, fin, cost, speed, charged }
    // what the hotbar draws (ui/comboHud.js; never reallocated): the chain's skill, the steps done, the window left (0..1),
    // the finisher flash (1 → 0)
    this.view = { on: false, id: null, step: 0, k: 0, flash: 0, flashId: null };
    Events.on('player:roll', () => { if (this.G.skills === this.runner) this.drop('roll'); }); // (couch co-op: only the hero who rolled)
  }
  /** is a chain of `id` live right now? (its step still going, or inside its window) */
  live(id) { const c = this.chain; return !!c && c.id === id && this.clock <= c.until; }
  tempoOn() { return (this.G.combat?.buffs?.tempo?.t || 0) > 0; }
  /** Which step would a cast of `id` be? → { step, charged } or null (not a combo skill; a held charge outside a chain) */
  plan(id, charge = null) {
    if (!comboable(id)) return null;
    const on = this.live(id);
    if (charge) return on ? { step: STEPS, charged: true } : null; // (a held charge lands as the live chain's finisher)
    return { step: on ? Math.min(STEPS, this.chain.step + 1) : 1, charged: false };
  }
  /** the planned step's runtime (rpg/combo.js comboRuntime: cost, finisher damage, R.combo) */
  apply(R, plan) {
    if (!plan || !R) return R;
    return comboRuntime(R, plan.step, comboPerksOf(this.G.state, R.id), { charged: plan.charged, tempo: this.tempoOn() });
  }
  /** the zoom usable() should judge a cast of `id` by: the hero's own, plus what the planned step saves (Light Touch, Free
   *  Finisher), so a free finisher goes off on an empty pool; undefined when the step saves nothing */
  zoomFor(id, charge = null) {
    const plan = this.plan(id, charge); if (!plan || plan.charged || plan.step < 2) return undefined;
    const G = this.G, R0 = skillRuntime(id, G.state, G.derived), R = this.apply(skillRuntime(id, G.state, G.derived), plan);
    if (!R0 || !R || !(R.cost < R0.cost)) return undefined;
    const z = G.actions?.zoom ? G.actions.zoom() : G.state.player.zoom ?? G.derived?.zoomMax ?? 1e9;
    return z + (R0.cost - R.cost);
  }
  /** how long tryCast keeps a press made while the hero is busy: a combo skill TAPPED during its own step's recovery waits
   *  for the step to end (then chains), not just the usual 0.25 s */
  bufferFor(id) {
    if (!this.runner.tapping || !this.cur || this.cur.id !== id) return 0; // (only a tap: a held key's repeats (Charge on hold: Off) keep the usual 0.25 s, so letting go never fires one more)
    const a = this.G.player?.anim?.action;
    return a && !a.def?.hold ? Math.min(1.5, Math.max(0, a.dur - a.t) + 0.12) : 0.25;
  }
  /** the cast went off (zoom paid). id, R (its runtime, with R.combo for a combo step), plan, before: the animator's action
   *  before the cast (so the one the cast started can be found) */
  commit(id, R, plan, before) {
    const G = this.G, P = G.player;
    if (!plan || !R?.combo) { if (this.chain) this.drop('switch'); this.cur = null; this.last = null; return; }
    const c = COMBO[id], st = R.combo;
    if (this.chain && this.chain.id !== id) this.drop('switch');
    // the step's speed: the action the cast started (and those it chains into: update)
    this.cur = { id, m: st.speed, wait: c.waitKey };
    const act = P?.anim?.action;
    if (act && act !== before) this.scale(act, st.speed);
    this.last = { id, step: st.step, fin: st.fin, cost: R.cost, speed: st.speed, charged: st.charged };
    if (st.fin) {
      this.chain = null;
      const k = comboPerksOf(G.state, id);
      this.fin = { id, t: this.clock, color: c.color, tempo: !!k.tempo };
      this.view.flash = 1; this.view.flashId = id;
      if (P) comboFx(G).finisher(this.runner.charge.focusPoint(_f), c.color);
      Events.emit('sfx', 'combo_finish', { vol: 0.8 });
      Events.emit('combo:finish', { id, charged: st.charged });
    } else {
      this.chain = { id, step: st.step, until: Infinity };
      const fl = G.state?.flags; if (fl && !fl.comboTut && G.mode !== 'village' && fl.tutorials?.charge?.done) fl.comboTut = true; // (the "Tap, tap, finish!" guide waits for a combo strike in a fight: world/guides.js)
      if (st.step > 1) Events.emit('sfx', 'combo_step', { pitch: 1 + 0.12 * (st.step - 1), vol: 0.7 });
      Events.emit('combo:step', { id, step: st.step });
    }
  }
  /** scale an action's playback by m (its duration and clock together: the same frame, the hits in sync) */
  scale(a, m) {
    if (!a || a._cmb || a.def?.hold || !(m > 0) || m === 1) { if (a) a._cmb = true; return; }
    a.dur /= m; a.t /= m; a._cmb = true;
  }
  /** a player hit landed (combat.hitMonster): the first one after a finisher is it landing */
  onHit(m) {
    const f = this.fin; if (!f || !m?.pos) return;
    if (this.clock - f.t > LAND_T) { this.fin = null; return; }
    this.fin = null;
    const G = this.G;
    comboFx(G).land(m.pos, f.color, m.bodyR || m.radius || 0.45, m.height || 1);
    if (f.tempo && G.combat) G.combat.buffs.tempo = { t: TEMPO.t, pct: TEMPO.pct }; // (Tempo: attack speed for the Combo strikes; ticks down in combat.js)
    Events.emit('combo:land', { id: f.id });
  }
  drop(reason = 'drop') {
    const c = this.chain; if (!c) return false;
    this.chain = null;
    Events.emit('combo:drop', { id: c.id, step: c.step, reason });
    return true;
  }
  clear() { this.chain = null; this.cur = null; this.fin = null; this.view.on = false; this.view.flash = 0; }

  // ------------------------------------------------------------------ per frame (SkillRunner.update)
  update(dt) {
    this.clock += dt;
    const G = this.G, P = G.player, cur = this.cur;
    if (cur) {
      // the step runs while the hero is busy with it (and, for Fūma Throw, until the fūma is home)
      const a = P?.anim?.action, busy = !!P && P.anim.busy(), wait = !!(cur.wait && this.runner[cur.wait]);
      if (busy && a && !a._cmb) this.scale(a, cur.m); // (an action the cast chained into: the step's speed too)
      if (!busy && !wait) { this.cur = null; if (this.chain?.id === cur.id) this.chain.until = this.clock + WINDOW; }
    }
    const c = this.chain;
    if (c && c.until !== Infinity) {
      // the next press is in (a tap is only known on release; a charge may be winding up): the window holds
      const ch = this.runner.charge, held = ch?.press?.id === c.id || ch?.active?.id === c.id;
      if (held) c.until = Math.max(c.until, this.clock + 0.05);
      else if (this.clock > c.until) this.drop('window');
    }
    if (this.fin && this.clock - this.fin.t > LAND_T) this.fin = null;
    // the hotbar's view
    const V = this.view, live = this.chain;
    V.on = !!live; V.id = live ? live.id : null; V.step = live ? live.step : 0;
    V.k = !live ? 0 : live.until === Infinity ? 1 : Math.max(0, Math.min(1, (live.until - this.clock) / WINDOW));
    if (V.flash > 0) V.flash = Math.max(0, V.flash - dt * 2.2);
  }
}

// ------------------------------------------------------------------ the debug menu (docs/DEBUG.md)
const heroCombo = G => Object.keys(COMBO).filter(id => (SKILLS[id].cls || 'chewy') === (G.state.player.cls || 'chewy'));
registerDebug('combo', [
  { label: 'Grant every Combo perk (this hero)', hint: 'Learns each of the hero\'s combo skills to 10 and buys all four perks, free', run: G => {
    const pl = G.state.player, all = pl.comboPerks || (pl.comboPerks = {}), ids = heroCombo(G);
    for (const id of ids) { pl.skills[id] = Math.max(pl.skills[id] || 0, 10); all[id] = fullComboPerks(id); }
    G.actions?.recompute?.(); Events.emit('stats:changed', G.derived);
    return `Every Combo perk on ${ids.length} skill${ids.length === 1 ? '' : 's'}`;
  } },
  { label: 'Clear Combo perks (refund the points)', run: G => {
    const pl = G.state.player; let n = 0; for (const id in pl.comboPerks || {}) for (const q in pl.comboPerks[id]) n += pl.comboPerks[id][q] || 0;
    pl.comboPerks = {}; pl.skillPts = (pl.skillPts || 0) + n; Events.emit('stats:changed', G.derived);
    return `${n} point${n === 1 ? '' : 's'} back`;
  } },
  { label: 'Log chain steps to the console', toggle: true, get: () => !!globalThis.__comboLog, run: (G, on) => {
    if (on && !globalThis.__comboLog) globalThis.__comboLog = ['combo:step', 'combo:finish', 'combo:land', 'combo:drop'].map(n => Events.on(n, p => console.log(`[combo] ${n}`, p)));
    else if (!on && globalThis.__comboLog) { for (const off of globalThis.__comboLog) off(); globalThis.__comboLog = null; }
    return on ? 'Logging combo steps' : 'Logging off';
  } },
], { title: 'Combo', icon: 'bolt', note: 'Tap-again chains (docs/COMBO.md)' });
