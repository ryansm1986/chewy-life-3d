// Guided tutorials, the director (docs/TUTORIALS.md). A guide (world/guides.js) is a list of steps:
//   { id, say: text | (G, T) => text, who?, objective, target?: (G, T) => { pos, label } | null,
//     highlight?: (G, T) => selector | Element | [..] | null, callouts?: (G, T) => [{ el, text, side, at }],
//     flash?: [text, sub], waitFor?: 'event' | { event, test(payload) }, done?: (G, T) => bool (polled),
//     on?: { event: (payload, T) => void } (loops / gentle fails), onEnter?(G, T), tick?(G, T, dt), ack?, skippable?,
//     allow?: { dialogue, switching, panels: ['quests', …] | true }, resumeAt?: stepId (where a reload picks it up) }
// The director runs one guide at a time and saves its progress in state.flags.tutorials = { active, [id]: { step,
// done, skipped, offered } }, so a reload resumes it. It pauses (hides the speech, the spotlight and the arrow; the
// objective card fades) during dialogue, panels, screen transitions, hero switches, build mode and anywhere but the
// village, unless the step allows it. A guide whose start already happened before this save was loaded is offered
// once instead ("New guide available"). Every guide can be replayed from the Journal's Guides tab.
// Tutorials start on their own only when `enabled` (game.js: off with ?notut, and with the QA's ?nointro unless
// ?tut): the QA flows never meet one. Replays and offers answered by the player always work.
import * as THREE from 'three';
import { Events } from '../core/events.js';
import { makeToon, makeOutline } from '../gfx/materials.js';
import { GUIDES, GUIDE_IDS } from './guides.js';

const V3 = new THREE.Vector3();
let _arrow = null;
/** the world marker: a chunky bouncing pink arrow over the target and a pulsing ring on the ground (own materials:
 *  it is only ever in the village scene, and never shares the buildings' MATS()) */
function arrowMarker() {
  if (_arrow) return _arrow;
  const g = new THREE.Group(); g.name = 'tutorial:arrow';
  const body = makeToon({ color: '#ff8fb0', rim: 0.6, brush: 0.05, emissive: '#5a1a30', emissiveIntensity: 0.35 });
  const ink = makeOutline('#3a2230', 0.045);
  const head = new THREE.ConeGeometry(0.42, 0.62, 18); head.rotateX(Math.PI); head.translate(0, 0.31, 0);
  const shaft = new THREE.CylinderGeometry(0.17, 0.17, 0.62, 14); shaft.translate(0, 0.9, 0);
  const tip = new THREE.Group(); tip.name = 'tip';
  for (const geo of [head, shaft]) { const m = new THREE.Mesh(geo, body); m.add(new THREE.Mesh(geo, ink)); tip.add(m); }
  const shine = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff' })); shine.position.set(-0.1, 1.05, 0.12); tip.add(shine);
  g.add(tip);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.78, 40), new THREE.MeshBasicMaterial({ color: '#ffd84a', transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  ring.rotation.x = -Math.PI / 2; ring.name = 'ring'; ring.renderOrder = 5; g.add(ring);
  g.userData = { tip, ring };
  return (_arrow = g);
}

export class Tutorials {
  constructor(G, { enabled = true } = {}) {
    this.G = G; this.enabled = enabled;
    this.cur = null;          // { id, guide, i, step, entered, t }
    this.pending = new Set(); this.offers = [];
    this.calmT = 0; this.trigT = 0; this.paused = true; this.data = {};
    const S = this.S;
    // guides whose start already happened before this session: offered once, never auto-started
    this.pastAtLoad = {};
    for (const id of GUIDE_IDS) this.pastAtLoad[id] = !S[id] && this.safe(() => (GUIDES[id].past || GUIDES[id].trigger)(G)); // (past: an old save that is already beyond the guide's start)
    // every event any step listens for
    const names = new Set(['mode:changed']);
    for (const g of Object.values(GUIDES)) for (const st of g.steps) { const w = st.waitFor; if (w) names.add(typeof w === 'string' ? w : w.event); for (const k in st.on || {}) names.add(k); }
    for (const n of names) Events.on(n, p => this.onEvent(n, p));
    this.ui = null;
    // a guide that was running when the game was saved picks up where it left off
    if (S.active && GUIDES[S.active]) setTimeout(() => this.resume(S.active), 900); // (a replay of a finished guide too)
  }
  get S() { return (this.G.state.flags.tutorials ||= {}); }
  rec(id) { return (this.S[id] ||= {}); }
  safe(fn, d = false) { try { return fn(); } catch (e) { console.warn('[tutorials]', e); return d; } }
  attach(ui) { // (the UI arrives a little after the game state)
    if (this.ui || !ui?.tutorial) return;
    this.ui = ui.tutorial;
    this.ui.onAck = () => this.ack();
    this.ui.onSkip = () => this.skip();
    this.ui.onSkipStep = () => this.cur?.step.skippable && this.next();
  }
  /** this guide will run (or be offered) on its own: Shadow's old one-line tip for the same thing can stay quiet */
  covers(id) { const r = this.S[id]; return this.enabled && !!GUIDES[id] && !(r?.offered && !this.cur) && !r?.done || this.cur?.id === id; }
  /** a tutorial is on screen and not paused (Shadow's one-off tips wait for it) */
  get busy() { return !!this.cur && !this.paused; }
  get active() { return this.cur?.id || null; }

  // ---------------------------------------------------------------- lifecycle
  start(id, { replay = false } = {}) {
    const g = GUIDES[id]; if (!g) return false;
    if (replay && g.locked?.(this.G)) return false;
    if (this.cur) this.stop(this.cur.id === id ? null : 'skip');
    this.pending.delete(id);
    const r = this.rec(id); r.started = (r.started || 0) + 1; r.offered = true;
    this.S.active = id;
    this.data = {};
    this.cur = { id, guide: g, i: -1, step: null, t: 0, replay };
    this.safe(() => g.onStart?.(this.G, this));
    Events.emit('tutorial:start', { id, replay });
    this.goto(0);
    return true;
  }
  resume(id) {
    const g = GUIDES[id], r = this.rec(id); if (!g || this.cur) return;
    const at = g.steps.findIndex(s => s.id === r.step), st = g.steps[at];
    const back = st?.resumeAt ? g.steps.findIndex(s => s.id === st.resumeAt) : at;
    this.data = {};
    this.cur = { id, guide: g, i: -1, step: null, t: 0 };
    this.safe(() => g.onStart?.(this.G, this));
    this.goto(Math.max(0, back));
  }
  /** o.say: what the narrator says on arriving there instead of the step's own line (a loop back after a miss) */
  goto(i, o = {}) {
    const c = this.cur; if (!c) return;
    if (typeof i === 'string') i = c.guide.steps.findIndex(s => s.id === i);
    if (i < 0 || i >= c.guide.steps.length) return this.finish();
    c.i = i; c.step = c.guide.steps[i]; c.t = 0; c.entered = false; c.said = null; c.carry = o.say || null;
    this.rec(c.id).step = c.step.id;
    this.G.save?.();
  }
  next() { if (this.cur) this.goto(this.cur.i + 1); }
  /** the "Got it!" button on a wrap-up step */
  ack() { if (this.cur?.step?.ack) this.next(); }
  skip() {
    const c = this.cur; if (!c) return;
    this.rec(c.id).skipped = true; this.rec(c.id).done = true;
    Events.emit('tutorial:skip', { id: c.id, step: c.step?.id });
    this.stop();
    this.G.ui?.toast?.('Guide skipped — replay it any time from the Journal (Guides)', { icon: 'book', color: '#c3b3ff' });
  }
  finish() {
    const c = this.cur; if (!c) return;
    const r = this.rec(c.id); r.done = true; r.skipped = false;
    Events.emit('tutorial:done', { id: c.id });
    this.stop();
    this.G.ui?.toast?.(`Guide complete: ${c.guide.title}`, { icon: 'check', color: '#8fe0c0', sub: 'Replay it from the Journal → Guides' });
    Events.emit('sfx', 'ui_quest');
  }
  stop() {
    const c = this.cur; if (!c) return;
    this.safe(() => c.guide.onEnd?.(this.G, this));
    this.cur = null; this.S.active = null; this.data = {};
    this.ui?.hide();
    this.hideArrow();
    this.G.save?.();
  }

  // ---------------------------------------------------------------- per step
  say(text, who = null) { if (this.cur) { this.cur.said = { text, who: who || this.cur.step.who || this.cur.guide.narrator }; if (!this.paused) this.ui?.say(this.cur.said.who, text); } }
  onEvent(name, p) {
    if (name === 'mode:changed') { this.hideArrow(); return; }
    const c = this.cur; if (!c || !c.step || !c.entered) return;
    const st = c.step;
    if (st.on?.[name]) this.safe(() => st.on[name](p, this));
    if (this.cur !== c || c.step !== st) return;
    const w = st.waitFor;
    if (w && (typeof w === 'string' ? w === name : w.event === name && (!w.test || this.safe(() => w.test(p, this.G, this))))) this.next();
  }
  /** why the current step can't run right now (null = it can) */
  pauseReason(st) {
    const G = this.G, ui = G.ui, a = st?.allow || {};
    if (G.titleActive || G.playerDead) return 'busy';
    if (ui?.iris?.active || G.leavingDungeon) return 'transition';
    if (G.mode !== 'village' && !(G.mode === 'interior' && a.interior)) return 'away'; // (a step may run indoors: allow.interior)
    if (G.heroSwitching && !a.switching) return 'switching';
    if (G.build?.active || G.buildMode) return 'build';
    if (ui?.dlg?.active && !a.dialogue) return 'dialogue';
    if (ui?.anyModal?.()) {
      const open = Object.keys(ui.panels || {}).filter(n => ui.isOpen(n));
      const ok = a.panels === true || open.every(n => (a.panels || []).includes(n));
      if (!ok && !(ui.dlg?.active && a.dialogue && !open.length)) return 'panel';
    }
    return null;
  }
  /** is it a good moment to start a guide (or offer one)? A guide may start indoors (g.indoors) or over its own panels
   *  (g.startPanels: the house card opens the Remodel guide) */
  calm(g = null) {
    const G = this.G, ui = G.ui;
    const place = G.mode === 'village' || (G.mode === 'interior' && g?.indoors);
    const open = ui?.anyModal?.() ? Object.keys(ui.panels || {}).filter(n => ui.isOpen(n)) : [];
    const panels = !open.length || (g?.startPanels && open.every(n => g.startPanels.includes(n)));
    return !(G.titleActive || G.playerDead || !place || ui?.iris?.active || ui?.dlg?.active || !panels || ui?.banners?.busy || G.player?.controlLocked || G.heroSwitching || G.build?.active || G.introFocus || this.ui?.offering);
  }
  update(dt) {
    const G = this.G;
    if (!this.ui) this.attach(G.ui);
    // triggers: a guide whose moment just came starts (when things are calm); one that had already passed is offered
    if ((this.trigT -= dt) <= 0) {
      this.trigT = 0.5;
      if (this.enabled) for (const id of GUIDE_IDS) {
        const r = this.S[id]; if (r?.done || r?.offered || r?.started || this.pending.has(id) || this.cur?.id === id || this.offers.includes(id)) continue;
        if (!this.pastAtLoad[id] && !this.safe(() => GUIDES[id].trigger(G))) continue; // (an old save's guide is offered whatever the moment)
        if (this.pastAtLoad[id]) this.offers.push(id); else this.pending.add(id);
      }
    }
    const first = this.pending.size ? [...this.pending].sort((a, b) => GUIDES[a].priority - GUIDES[b].priority)[0] : null;
    this.calmT = this.calm(first && !this.cur ? GUIDES[first] : null) ? this.calmT + dt : 0;
    if (!this.cur && first && this.calmT > (GUIDES[first].startPanels ? 0.4 : 1.2)) {
      this.start(first);
    } else if (!this.cur && !this.pending.size && this.offers.length && this.calmT > 2.5 && this.ui && !this.ui.offering) this.offerNext();
    // the running step
    const c = this.cur;
    if (!c?.step) return;
    const st = c.step;
    const why = this.pauseReason(st);
    const was = this.paused; this.paused = !!why;
    if (why) { if (!was) { this.ui?.setPaused(true); this.hideArrow(); } return; }
    if (!c.entered) {
      c.entered = true;
      this.safe(() => st.onEnter?.(G, this));
      if (this.cur !== c || c.step !== st) return;
      const g = c.guide, total = g.steps.length;
      this.ui?.step({ title: g.title, icon: g.icon?.(), n: c.i + 1, total, objective: typeof st.objective === 'function' ? st.objective(G, this) : st.objective, ack: st.ack, skippable: st.skippable });
      const text = c.carry || (typeof st.say === 'function' ? st.say(G, this) : st.say);
      if (text) this.say(text);
      Events.emit('tutorial:step', { id: c.id, step: st.id, n: c.i + 1 });
    }
    if (was) { this.ui?.setPaused(false); if (c.said) this.ui?.say(c.said.who, c.said.text); }
    c.t += dt;
    this.safe(() => st.tick?.(G, this, dt));
    if (this.cur !== c || c.step !== st) return;
    if (st.done && this.safe(() => st.done(G, this))) { this.next(); return; }
    // the pointers
    const hl = st.highlight ? this.safe(() => st.highlight(G, this), null) : null;
    const els = (Array.isArray(hl) ? hl : [hl]).flatMap(h => (typeof h === 'string' ? [...document.querySelectorAll(h)] : h ? [h] : []));
    this.ui?.highlight(els);
    this.ui?.setCallouts(st.callouts ? this.safe(() => st.callouts(G, this), []) : []);
    this.ui?.flash(st.flash?.[0] || null, st.flash?.[1] || '');
    this.updateArrow(dt);
  }
  async offerNext() {
    const id = this.offers.shift(), g = GUIDES[id]; if (!g) return;
    this.rec(id).offered = true; this.G.save?.();
    const yes = await this.ui.offer({ title: g.title, text: g.offer || g.blurb, who: g.narrator });
    Events.emit('tutorial:offer', { id, yes });
    if (yes) this.start(id);
  }

  // ---------------------------------------------------------------- the target (world arrow, edge arrow, minimap)
  /** G.questTarget asks this first: { pos, label, kind: 'tut' } | null */
  target() {
    const c = this.cur; if (!c?.step?.target || this.paused || !c.entered) return null;
    const t = this.safe(() => c.step.target(this.G, this), null);
    return t?.pos ? { pos: t.pos, label: t.label || c.guide.title, kind: 'tut', npc: t.npc } : null;
  }
  updateArrow(dt) {
    const G = this.G, t = this.target(), A = arrowMarker();
    if (!t || (G.mode !== 'village' && G.mode !== 'interior')) { this.hideArrow(); return; }
    const scene = G.world?.scene; if (!scene) return;
    if (A.parent !== scene) scene.add(A);
    A.visible = true;
    const y = G.world.heightAt?.(t.pos.x, t.pos.z) ?? 0, time = G.engine?.time || 0;
    A.position.set(t.pos.x, y, t.pos.z);
    const d = Math.hypot(G.player.pos.x - t.pos.x, G.player.pos.z - t.pos.z), near = d < (t.npc ? 2.4 : 1.2);
    A.userData.tip.scale.setScalar(0.62 + 0.18 * Math.min(1, d / 14)); // (small up close, bolder far away)
    A.userData.tip.position.y = (t.npc ? 2.4 : 1.3) + Math.abs(Math.sin(time * 3.4)) * 0.3;
    A.userData.tip.rotation.y = time * 1.6;
    A.userData.tip.visible = !near;
    const k = 1 + 0.18 * Math.sin(time * 4);
    A.userData.ring.scale.setScalar(k); A.userData.ring.position.y = 0.06; A.userData.ring.visible = !t.npc;
    A.userData.ring.material.opacity = 0.55 + 0.3 * Math.sin(time * 4);
  }
  hideArrow() { if (_arrow) { _arrow.visible = false; _arrow.parent?.remove(_arrow); } }

  // ---------------------------------------------------------------- the Guides list
  list() {
    const G = this.G;
    return GUIDE_IDS.map(id => {
      const g = GUIDES[id], r = this.S[id] || {}, locked = this.safe(() => g.locked?.(G), null);
      return { id, title: g.title, blurb: g.blurb, narrator: g.narrator, color: g.color, locked: locked || null,
        status: this.cur?.id === id ? 'active' : r.done ? (r.skipped ? 'skipped' : 'done') : locked ? 'locked' : 'new' };
    });
  }
}
