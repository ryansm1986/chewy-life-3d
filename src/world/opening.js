// The opening (ROADMAP CN-1; docs/ARCHITECTURE.md § The opening): a new game's cinematic before Rosie's "Good morning".
// Letterbox bars, the HUD away, three shots of Blossom Hollow on its own morning (the villagers going about their day):
//   1. the shrine hill: a slow drift through the autumn maples to the torii, the sea behind;
//   2. the pond park: a slow arc round the water (whoever is out fishing);
//   3. the town: high over the plaza, "Blossom Hollow" fading in, then one long crane down and push in to Chewy, who
//      yawns and stretches as the camera arrives. The last key is the game camera itself (its yaw, pitch and lens), so
//      the hand-off to the intro is seamless: the bars slide away and Rosie trots in (game.js intro).
// Any skip key (Esc, Enter, Space, a click or tap, the pad's A, B or Start) dips to black and lands on the last shot.
// The camera is the game's own rig (core/engine.js CameraRig): each frame sets its target, yaw, pitch, distance and the
// lens, so whatever follows the rig (the sun's shadows, the light pool) follows the shot.
//   const op = new Opening(G); await op.play({ at: { x, z } }) — at: where Chewy stands for the last shot
//   op.settle({ x, z }, dist, s): after it, the camera eases back out to the intro's two-shot over s seconds (slowly: the
//   game rig's own easing would snap back from the close-up in half a second)
//   game.js calls op.frame(rig, dt) every frame before rig.update while op.active (or settling). G.cutscene is set while it plays (the
//   tutorials, the quest cards, the arrivals and the autosave wait for it).
import './opening.css';
import { Actions } from '../core/actions.js';

const GAME = { yaw: Math.PI / 4, pitch: 0.62, fov: 20 }; // (the game camera: game.js startGame, core/engine.js)
const FADE = 0.55; // a dip to black between shots (s, each way)

/** the shots, each a list of keys { t, x, y, z, yaw, pitch, dist, fov } (t in seconds from the shot's start; the camera
 *  looks at x y z from dist away, yaw 0 = from the south), from the island's landmarks; `at` is Chewy's spot */
function shots(L, h, at) {
  const S = L.shrine, P = L.pond, C = { x: at.x, y: h(at.x, at.z) + 0.6, z: at.z };
  return [
    { name: 'shrine', fadeIn: 1.4, keys: [
      { t: 0, x: S.x - 8, y: 5, z: S.z + 6, yaw: -0.92, pitch: 0.28, dist: 40, fov: 30 },
      { t: 6, x: S.x - 1, y: 4.4, z: S.z + 2, yaw: -0.52, pitch: 0.3, dist: 36, fov: 30 },
    ] },
    { name: 'pond', keys: [
      { t: 0, x: P.x + 3, y: 0.4, z: P.z - 1, yaw: 2.75, pitch: 0.27, dist: 38, fov: 30 },
      { t: 5.6, x: P.x - 1, y: 0.2, z: P.z + 1, yaw: 2.2, pitch: 0.33, dist: 32, fov: 30 },
    ] },
    { name: 'town', title: [0.9, 4.6], arrive: 9.4, keys: [
      { t: 0, x: L.plaza.x - 10, y: 1, z: L.plaza.z - 6, yaw: 1.05, pitch: 0.5, dist: 74, fov: 26 },
      { t: 4.2, x: L.plaza.x - 3, y: 1, z: L.plaza.z - 1, yaw: 0.86, pitch: 0.52, dist: 60, fov: 25 },
      { t: 10.2, ...C, yaw: GAME.yaw, pitch: GAME.pitch, dist: 10.5, fov: GAME.fov },
    ] },
  ];
}
// a key track: per channel a cubic Hermite through the keys (Catmull-Rom tangents inside, still at both ends: every
// shot eases in and out); the distance in log space, so a push in keeps its pace as it closes
const CH = ['x', 'y', 'z', 'yaw', 'pitch', 'ld', 'fov'];
function sample(keys, t, out) {
  const n = keys.length, last = keys[n - 1];
  if (t <= keys[0].t || n === 1) { for (const c of CH) out[c] = keys[0][c]; return out; }
  if (t >= last.t) { for (const c of CH) out[c] = last[c]; return out; }
  let i = 0; while (i < n - 2 && t >= keys[i + 1].t) i++;
  const a = keys[i], b = keys[i + 1], H = b.t - a.t, u = (t - a.t) / H, u2 = u * u, u3 = u2 * u;
  const tan = (j, c) => (j <= 0 || j >= n - 1 ? 0 : (keys[j + 1][c] - keys[j - 1][c]) / (keys[j + 1].t - keys[j - 1].t));
  for (const c of CH) out[c] = (2 * u3 - 3 * u2 + 1) * a[c] + (u3 - 2 * u2 + u) * H * tan(i, c) + (-2 * u3 + 3 * u2) * b[c] + (u3 - u2) * H * tan(i + 1, c);
  return out;
}
const len = s => s.keys[s.keys.length - 1].t;

export class Opening {
  constructor(G) { this.G = G; this.active = false; this.cur = {}; }
  /** play it → a promise when the camera is on Chewy and the bars are going (skipped or not) */
  play({ at }) {
    const G = this.G, L = G.world.landmarks, T = G.world.terrain;
    this.shots = shots(L, (x, z) => T.heightAt(x, z), at);
    for (const s of this.shots) for (const k of s.keys) k.ld = Math.log(k.dist);
    this.i = 0; this.t = 0; this.skipping = 0; this.done = false; this.arrived = false;
    this.active = true; G.cutscene = 'opening';
    const rig = G.engine.rig;
    this.saved = { minDist: rig.minDist, maxDist: rig.maxDist };
    rig.minDist = 1; rig.maxDist = 400; rig.clearBias();
    this.build();
    this.onKey = e => { if (!this.active || e.repeat) return; if (['Escape', 'Enter', ' ', 'Spacebar'].includes(e.key)) { e.preventDefault(); e.stopPropagation(); this.skip(); } };
    addEventListener('keydown', this.onKey, true); // (capture: Esc never opens the menu under it)
    return new Promise(res => { this.resolve = res; });
  }
  build() {
    const ui = this.G.ui, root = ui?.root; if (!root) return;
    root.classList.add('cine');
    const el = this.el = document.createElement('div');
    el.className = 'op';
    const dev = Actions.device, key = dev === 'touch' ? 'Tap' : dev === 'pad' ? 'A' : 'Esc';
    el.innerHTML = `<i class="op-bar t"></i><i class="op-bar b"></i><div class="op-black"></div>
      <div class="op-title"><small>Welcome to</small><b>${[...'Blossom Hollow'].map((c, i) => `<span style="--i:${i}">${c === ' ' ? '&nbsp;' : c}</span>`).join('')}</b><em>a little village on a little island</em></div>
      <button class="op-skip" type="button">Skip<kbd>${key}</kbd></button>`;
    (ui.layers?.over || root).appendChild(el);
    this.black = el.querySelector('.op-black');
    el.addEventListener('pointerdown', e => { e.preventDefault(); this.skip(); });
    requestAnimationFrame(() => el.classList.add('in'));
    setTimeout(() => el.classList.add('hint'), 1600);
  }
  skip() {
    if (!this.active || this.skipping || this.arrived) return;
    this.skipping = 1e-6; // (dip to black, then the last shot's end)
    this.G.ui?.sfx?.('tick');
  }
  /** after the arrival: ease the camera from the close-up to { x, z } at dist over dur seconds, then let the rig go */
  settle(to, dist, dur = 2.4) {
    const rig = this.G.engine.rig;
    this.tail = { t: 0, dur, a: { x: rig.focus.x, y: rig.focus.y, z: rig.focus.z, d: Math.log(rig.dist) }, b: { x: to.x, y: rig.focus.y, z: to.z, d: Math.log(dist) } };
  }
  get settling() { return !!this.tail; }
  tailFrame(rig, dt) {
    const T = this.tail; T.t += Math.min(dt, 0.1);
    const u = Math.min(1, T.t / T.dur), k = u * u * u * (u * (u * 6 - 15) + 10), L = (a, b) => a + (b - a) * k; // (smootherstep)
    rig.focus.set(L(T.a.x, T.b.x), L(T.a.y, T.b.y), L(T.a.z, T.b.z)); rig.target.copy(rig.focus);
    rig.dist = rig.distTarget = Math.exp(L(T.a.d, T.b.d));
    if (u >= 1) this.tail = null;
  }
  /** each frame (game.js, before rig.update): the shot's camera; dt is real time */
  frame(rig, dt) {
    if (this.tail) { this.tailFrame(rig, dt); return; }
    if (!this.active) return;
    const pad = Actions.padHit?.('A') || Actions.padHit?.('B') || Actions.padHit?.('Menu');
    if (pad) { for (const b of ['A', 'B', 'Menu']) Actions.padConsume?.(b); this.skip(); }
    dt = this.hold ? 0 : Math.min(dt, 0.1); // (hold: frozen on a frame, for the QA's shots)
    let black = 0;
    if (this.skipping) {
      this.skipping += dt; black = Math.min(1, this.skipping / 0.3);
      if (this.skipping >= 0.3) { this.skipping = 0; this.i = this.shots.length - 1; this.t = len(this.shots[this.i]); this.skipped = true; this.fadeT = 0.6; this.el?.classList.remove('titled'); }
    } else {
      this.t += dt;
      const s = this.shots[this.i], D = len(s);
      if (this.t >= D && this.i < this.shots.length - 1) { this.i++; this.t = 0; }
    }
    const s = this.shots[this.i], D = len(s), t = this.t;
    if (!this.skipping) {
      if (this.skipped) black = Math.max(0, (this.fadeT -= dt) / 0.6);
      else {
        const fin = s.fadeIn || FADE, last = this.i === this.shots.length - 1;
        black = Math.max(t < fin ? 1 - t / fin : 0, !last && t > D - FADE ? (t - (D - FADE)) / FADE : 0);
      }
    }
    if (this.black) this.black.style.opacity = black.toFixed(3);
    if (s.title && this.el) this.el.classList.toggle('titled', !this.skipped && t >= s.title[0] && t < s.title[1]);
    // the camera
    const c = sample(s.keys, t, this.cur), cam = this.G.engine.camera;
    rig.focus.set(c.x, c.y, c.z); rig.target.copy(rig.focus);
    rig.yaw = rig.yawTarget = c.yaw; rig.pitch = c.pitch; rig.dist = rig.distTarget = Math.exp(c.ld);
    if (Math.abs(cam.fov - c.fov) > 1e-3) { cam.fov = c.fov; cam.updateProjectionMatrix(); }
    // Chewy wakes as the camera comes down to him
    if (s.arrive != null && !this.woke && t >= s.arrive - 2.6) { this.woke = true; const a = this.G.player.anim; a.play('yawn'); setTimeout(() => this.active && a.play('stretch'), 1700); }
    if (s.arrive != null && t >= D - 0.05 && !this.arrived) this.arrive();
  }
  /** the camera is on Chewy: the bars go, the HUD comes back, the intro takes over */
  arrive() {
    const G = this.G, rig = G.engine.rig, cam = G.engine.camera;
    this.arrived = true; this.active = false;
    rig.minDist = this.saved.minDist; rig.maxDist = this.saved.maxDist;
    rig.pitch = GAME.pitch; rig.yaw = rig.yawTarget = GAME.yaw; cam.fov = GAME.fov; cam.updateProjectionMatrix();
    removeEventListener('keydown', this.onKey, true);
    const R = G.ui?.root; if (R) { R.classList.add('cine-out'); R.classList.remove('cine'); setTimeout(() => R.classList.remove('cine-out'), 1500); }
    const el = this.el;
    if (el) { el.classList.remove('in', 'titled', 'hint'); el.classList.add('out'); if (this.black) this.black.style.opacity = '0'; setTimeout(() => el.remove(), 1200); }
    G.cutscene = null;
    this.resolve?.({ skipped: !!this.skipped });
  }
}
