// The debug menu's combat toggles (docs/DEBUG.md): this session only, never saved. They hook the Combat class once
// (every world builds its own Combat, so the prototype is the one place all of them share) and the actions API, and
// the menu's per-frame tick keeps the rest true (cooldowns, zoom, frozen monsters). The perf overlay counts the draw
// calls and triangles of a whole frame (every pass of the post chain), not just the last pass.
import { Combat } from '../combat/combat.js';
import { el } from '../ui/dom.js';

export const T = { god: false, oneHit: false, noCd: false, infZoom: false, speed2: false, freeze: false, perf: false };
let installed = false, perfEl = null, acc = 0, n = 0, last = { fps: 0, calls: 0, tris: 0, ms: 0 }, prevT = 0;

export function installToggles(G) {
  if (installed) return; installed = true;
  const C = Combat.prototype;
  const hitPlayer = C.hitPlayer; C.hitPlayer = function (...a) { return T.god ? 0 : hitPlayer.apply(this, a); };
  const applyDmg = C.applyDamageToMonster; C.applyDamageToMonster = function (m, dmg, o) { if (T.oneHit && m?.alive && !m.breakable && m.life > 0) dmg = Math.max(dmg, Math.ceil(m.life) + 1); return applyDmg.call(this, m, dmg, o); };
  const moveMul = C.moveMul; C.moveMul = function () { return moveMul.call(this) * (T.speed2 ? 2 : 1); };
  const A = G.actions, damage = A.damage; A.damage = n => (T.god ? 0 : damage(n)); // (traps, curses, DoTs that skip Combat)
  const spend = A.spendZoom; A.spendZoom = n => (T.infZoom ? true : spend(n));
}
/** per frame (the menu's tick, from game.js through G.debug.frame) */
export function tickToggles(G, dt) {
  const st = G.state;
  if (T.god && G.player && !G.playerDead) st.player.life = null;
  if (T.infZoom) st.player.zoom = null;
  if (T.noCd) { if (G.skills) G.skills.cds = {}; if (G.heroes) G.heroes.cd = 0; }
  if (T.freeze) for (const m of G.dungeon?.monsters || []) if (m.alive && m.status) { if (!(m.status.freeze > 0)) m.cancelAttack?.(); m.status.freeze = 0.5; }
  perf(G, dt);
}
export function resetToggles(G) {
  for (const k in T) T[k] = false;
  for (const m of G.dungeon?.monsters || []) if (m.status) m.status.freeze = 0;
  perf(G, 0);
}
/** every monster on this floor down → how many */
export function killAll(G) {
  const C = G.combat, list = (G.mode === 'dungeon' ? G.dungeon?.monsters : null) || [];
  let k = 0;
  for (const m of [...list]) if (m.alive && !m.ally) { C.applyDamageToMonster(m, Math.ceil(m.life) + 1, { silent: true }); k++; }
  return k;
}
function perf(G, dt) {
  const R = G.engine?.renderer; if (!R) return;
  if (!T.perf) { if (perfEl) { perfEl.remove(); perfEl = null; R.info.autoReset = true; } return; }
  if (!perfEl) { perfEl = el('div', 'dbg-perf'); (G.ui?.layers?.over || document.body).appendChild(perfEl); R.info.autoReset = false; R.info.reset(); prevT = performance.now(); return; }
  // (this runs before the frame renders: the counters hold all of the last frame's passes)
  const now = performance.now(), ms = now - prevT; prevT = now;
  const calls = R.info.render.calls, tris = R.info.render.triangles; R.info.reset();
  acc += ms; n++; last.calls = Math.max(last.calls * 0.8, calls) | 0; last.tris = tris;
  if (acc > 500) { last.fps = Math.round(n * 1000 / acc); last.ms = (acc / n).toFixed(1); acc = 0; n = 0; last.calls = calls;
    const mem = R.info.memory;
    perfEl.innerHTML = `<b>${last.fps}</b> fps · ${last.ms} ms<br><b>${last.calls}</b> calls · ${(last.tris / 1e6).toFixed(2)}M tris<br>${mem.geometries} geo · ${mem.textures} tex`; }
  void dt;
}
