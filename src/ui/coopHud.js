// Couch co-op's HUD (docs/COOP.md §4): what players 2-4 see of themselves while player 1 keeps the full HUD.
//  - The player cards (bottom-left, stacked up from the corner, clear of the hotbar's life orb): portrait in the player's
//    colour ring with their P badge and level, name, life and zoom bars, the six hotbar icons with cooldown sweeps; greyed
//    with a revive ring while downed, "Reconnect your controller" when the pad is lost, a bag badge while their pane is
//    open, a flash on a hero switch. They slide in on join and out on leave; the toasts lift over the stack.
//  - The join card (a spare pad's A or Menu: coop.js joinInput): slides up over the hotbar in the new player's colour,
//    a carousel of the free heroes, "A Join · B Back" in that pad's glyphs, or why nobody can join. A join pops it and it
//    flies into the new player's card. Several pads at once stack side by side.
//  - The picker (LB held): an arc of portraits over that player's card, the highlight following left / right.
//  - In the world: a soft ring in each player's colour under every hero (player 1's too), a "P2" tag over the head that
//    fades while they stand still, players 2-4's interact prompt over their heads, and over a downed hero the revive ring
//    on the ground filling as a friend stands by, plus Shadow's countdown.
//  - Toasts for joins, leaves and lost controllers; the minimap's dots are world/minimap.js's (in each player's colour).
// Everything is built once per player and diffed per frame (no DOM built per frame). Ticks after the UI's own update
// (G.ui.update is wrapped once), so world tags project with this frame's camera, as the floats do.
import './coopHud.css';
import * as THREE from 'three';
import { PLAYER_COLORS } from '../coop/coop.js';
import { CLASSES } from '../rpg/classes.js';
import { Actions } from '../core/actions.js';
import { Events } from '../core/events.js';
import { padGlyph } from './padGlyphs.js';
import { portrait } from './portraits.js';
import { glyph } from './glyphs.js';
import { hotbarIconURL } from './rpg.js';
import { el, esc, clamp, setText, setVar, setCls, setStyle, replay } from './dom.js';

const CARD_W = 248, CARD_H = 72, CARD_PITCH = 80; // (design px, the HUD layer's)
const REVIVE_R = 1.9;   // m (coop.js: a teammate this close revives)
const HEAD_Y = 1.92;    // m over the feet: the tag's point
const IDLE_FADE = 2.6;  // s standing still before the tag fades
const PAD_SVG = '<svg class="ch-padic" viewBox="0 0 40 26" aria-hidden="true"><path d="M9 3h22c4.5 0 7 3 8 8l1 6c.6 4-1.6 7-4.6 7-2.4 0-3.8-1.4-5.2-3.6L29 18H11l-1.2 2.4C8.4 22.6 7 24 4.6 24 1.6 24-.6 21 0 17l1-6C2 6 4.5 3 9 3z" fill="#fff6e8" stroke="#4a2c2a" stroke-width="2.4" stroke-linejoin="round"/><path d="M9 8.5v6M6 11.5h6" stroke="#4a2c2a" stroke-width="2.4" stroke-linecap="round"/><circle cx="29" cy="9.5" r="2" fill="#62c25a" stroke="#4a2c2a" stroke-width="1.4"/><circle cx="32.5" cy="13" r="2" fill="#ee5b4a" stroke="#4a2c2a" stroke-width="1.4"/></svg>';
const CHEV = d => `<svg viewBox="0 0 20 28" aria-hidden="true"><path d="${d ? 'M6 4l10 10L6 24' : 'M14 4L4 14l10 10'}" fill="none" stroke="#4a2c2a" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/><path d="${d ? 'M6 4l10 10L6 24' : 'M14 4L4 14l10 10'}" fill="none" stroke="#fff6e8" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const V3 = new THREE.Vector3(), N3 = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
const heroName = id => CLASSES[id]?.name || id;
/** a pad's glyph style: Settings › Controls › Button glyphs, else from its id (a PlayStation pad's symbols) */
function padStyleOf(r) {
  const g = Actions.opts?.glyphs;
  if (g === 1) return 'xbox';
  if (g === 2) return 'ps';
  return /054c|playstation|dualshock|dualsense|sony/i.test(r?.id || '') ? 'ps' : 'xbox';
}
const cap = (t, style) => `<span class="kc pad ch-cap">${padGlyph(t, style)}</span>`;

// ------------------------------------------------------------------ the world: a ring under each hero, the revive zone
let RING_TEX = null;
/** a soft white ring (tinted per player): a bright band with soft edges and a faint fill inside */
function ringTex() {
  if (RING_TEX) return RING_TEX;
  const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d'), c = S / 2;
  const grd = g.createRadialGradient(c, c, 0, c, c, c);
  grd.addColorStop(0, 'rgba(255,255,255,0)'); grd.addColorStop(0.5, 'rgba(255,255,255,0.05)'); grd.addColorStop(0.66, 'rgba(255,255,255,0.22)');
  grd.addColorStop(0.76, 'rgba(255,255,255,0.95)'); grd.addColorStop(0.83, 'rgba(255,255,255,0.95)'); grd.addColorStop(0.93, 'rgba(255,255,255,0.12)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, S, S);
  RING_TEX = new THREE.CanvasTexture(cv); RING_TEX.colorSpace = THREE.SRGBColorSpace; RING_TEX.anisotropy = 4;
  return RING_TEX;
}
const RING_K = 0.795; // (the band's radius in the texture, of its half-size)
let FLAT = null, FILL_GEO = null;
const FILL_SEG = 96;
function geos() {
  if (!FLAT) { FLAT = new THREE.PlaneGeometry(1, 1); FLAT.rotateX(-Math.PI / 2); }
  if (!FILL_GEO) { FILL_GEO = new THREE.RingGeometry(REVIVE_R - 0.2, REVIVE_R, FILL_SEG, 1, Math.PI / 2, Math.PI * 2); FILL_GEO.rotateX(-Math.PI / 2); }
  return { flat: FLAT, fill: FILL_GEO };
}
/** drawn a little toward the camera along each view ray (the same spot on screen, PULL m nearer in depth): the ring
 *  shows over grass and pebbles at the hero's feet, while the hero's own body (nearer still) keeps covering its far side */
const PULL = 0.34;
function pulled(mat) {
  mat.onBeforeCompile = sh => { sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
    mvPosition.xyz *= max(0.05, 1.0 - ${PULL.toFixed(2)} / max(0.001, length(mvPosition.xyz)));
    gl_Position = projectionMatrix * mvPosition;`); };
  mat.customProgramCacheKey = () => 'coopPull';
  return mat;
}
function ringMat(color, opacity) {
  return pulled(new THREE.MeshBasicMaterial({ map: ringTex(), color: new THREE.Color(color), transparent: true, opacity, depthWrite: false, fog: false, toneMapped: false }));
}

/** a hero's marks in the world: the ring under them, the revive zone while downed, the tag over the head */
class Mark {
  constructor(H, s) {
    this.H = H; this.s = s; this.n = s.n;
    const { flat, fill } = geos();
    this.group = new THREE.Group(); this.group.name = 'coop-mark-' + s.n;
    this.ring = new THREE.Mesh(flat, ringMat(s.color, 0.62)); this.ring.renderOrder = 3;
    this.ring.scale.setScalar(0.62 / RING_K * 2);
    this.zone = new THREE.Mesh(flat, ringMat(s.color, 0.32)); this.zone.renderOrder = 3; this.zone.visible = false;
    this.zone.scale.setScalar((REVIVE_R - 0.05) / RING_K * 2);
    this.fillMat = pulled(new THREE.MeshBasicMaterial({ color: new THREE.Color(s.color), transparent: true, opacity: 0.85, depthWrite: false, fog: false, toneMapped: false, side: THREE.DoubleSide }));
    this.fill = new THREE.Mesh(fill.clone(), this.fillMat); // (its own copy: the draw range is its progress)
    this.fill.renderOrder = 4; this.fill.visible = false; this.fill.scale.x = -1; // (mirrored: it fills clockwise on screen)
    this.group.add(this.ring, this.zone, this.fill);
    this.group.traverse(o => { o.frustumCulled = false; o.raycast = () => {}; }); // (never picked by the game's rays)
    // the tag over the head (the world layer: not zoomed, scaled by the UI's scale)
    const e = this.el = el('div', 'cw');
    e.style.setProperty('--pc', s.color);
    e.innerHTML = `<div class="cw-in">
      <div class="cw-dn"><span class="cw-sh"><svg viewBox="0 0 40 40"><circle class="t" cx="20" cy="20" r="17"/><circle class="f" cx="20" cy="20" r="17" pathLength="100"/></svg><span class="cw-shf"></span></span><span class="cw-dt"><b>Needs a hand!</b><small></small></span></div>
      <div class="cw-pill"><b class="cw-p">P${s.n}</b><span class="cw-pr"><span class="cw-k"></span><span class="cw-t"></span></span></div>
    </div>`;
    H.worldRoot.appendChild(e);
    const q = c => e.querySelector(c);
    this.$ = { pill: q('.cw-pill'), k: q('.cw-k'), t: q('.cw-t'), sh: q('.cw-sh .f'), shf: q('.cw-shf'), dt: q('.cw-dt small'), dtb: q('.cw-dt b') };
    this.last = null; this.movedT = performance.now(); this.vis = null; this.promptSig = ''; this.revQ = -1; this.autoQ = -1; this.t = 0;
  }
  dispose() {
    this.group.removeFromParent();
    for (const m of [this.ring.material, this.zone.material, this.fillMat]) m.dispose();
    this.fill.geometry.dispose();
    this.el.classList.remove('show');
    const e = this.el; setTimeout(() => e.remove(), 400);
  }
  /** per frame: c is C.card(s); vis: the world marks may show now */
  update(c, dt, vis, cam, now) {
    const H = this.H, C = H.C, s = this.s, B = C.bodyOf(s);
    if (!B?.pos) { this.group.visible = false; setCls(this.el, 'show', false); return; }
    this.t += dt;
    const scene = (B.world || H.G.world)?.scene;
    if (scene && this.group.parent !== scene) scene.add(this.group);
    const down = !!c.downed, hidden = !vis || B.hidden === true || B.rig?.root?.visible === false;
    this.group.visible = !hidden;
    const p = B.pos;
    // (laid on the ground under them: tilted to the slope, so a hillside doesn't swallow half the ring)
    const Wd = B.world, hr = down ? 1.3 : 0.55;
    if (Wd?.heightAt) {
      const hx = (Wd.heightAt(p.x + hr, p.z) - Wd.heightAt(p.x - hr, p.z)) / (2 * hr), hz = (Wd.heightAt(p.x, p.z + hr) - Wd.heightAt(p.x, p.z - hr)) / (2 * hr);
      const gy = Wd.heightAt(p.x, p.z);
      this.group.position.set(p.x, (Number.isFinite(gy) && Math.abs(gy - p.y) < 0.6 ? Math.max(gy, p.y) : p.y) + 0.05, p.z);
      if (Number.isFinite(hx) && Number.isFinite(hz) && Math.abs(hx) < 1.5 && Math.abs(hz) < 1.5) this.group.quaternion.setFromUnitVectors(UP, N3.set(-hx, 1, -hz).normalize());
    } else this.group.position.set(p.x, p.y + 0.05, p.z);
    // the ring under them breathes a little; the revive zone and its fill while downed
    this.ring.visible = !down;
    if (!down) this.ring.material.opacity = 0.56 + Math.sin(this.t * 2.2 + s.n) * 0.05;
    this.zone.visible = this.fill.visible = down;
    if (down) {
      const rev = clamp(c.downed.rev);
      this.zone.material.opacity = (c.downed.helpers ? 0.62 : 0.44) + Math.sin(this.t * 4) * 0.08;
      const k = Math.round(rev * FILL_SEG);
      if (k !== this.revQ) { this.revQ = k; this.fill.geometry.setDrawRange(0, k * 6); }
      this.fill.visible = k > 0;
      const f = H.G.engine.rig.groundAxes().f; // (the fill starts at the far side: screen top)
      this.fill.rotation.y = Math.atan2(-f.x, -f.z) + Math.PI;
    }
    // the tag: shows while they move (fades after a few seconds standing still), with a prompt, or downed
    const moved = this.last ? Math.hypot(p.x - this.last.x, p.z - this.last.z) : 0;
    if (!this.last) this.last = { x: p.x, z: p.z }; else { this.last.x = p.x; this.last.z = p.z; }
    if (moved > 0.01 || (s.joinT ?? 9) < 3) this.movedT = now;
    const prompt = !down && !s.primary ? c.prompt : null;
    const show = !hidden && (down || !!prompt || now - this.movedT < IDLE_FADE * 1000);
    // the prompt: "(A) Talk to Rosie" in that pad's glyph
    const psig = prompt ? prompt.act + '|' + prompt.label + '|' + padStyleOf(s.pad) : '';
    if (psig !== this.promptSig) {
      this.promptSig = psig;
      if (prompt) {
        const tok = Actions.promptToken(prompt.act === 'interactAlt' ? 'interactAlt' : 'interact', 'pad') || 'A';
        this.$.k.innerHTML = cap(tok, padStyleOf(s.pad)); setText(this.$.t, prompt.label || '');
        replay(this.$.pill, 'pop', 400);
      }
      setCls(this.el, 'prompt', !!prompt);
    }
    setCls(this.el, 'down', down);
    if (down) {
      const D = c.downed, a = Math.round((1 - clamp(D.auto)) * 100);
      if (a !== this.autoQ) { this.autoQ = a; setStyle(this.$.sh, 'strokeDashoffset', String(100 - a)); }
      setText(this.$.dtb, D.helpers ? 'Hang in there!' : 'Needs a hand!');
      setText(this.$.dt, D.helpers ? 'Helping up…' : `Shadow comes in ${Math.max(1, Math.ceil((1 - clamp(D.auto)) * 20))}s`);
      setCls(this.el, 'helped', !!D.helpers);
      if (!this.$.shf.firstChild) this.$.shf.innerHTML = H.face('shadow');
    }
    if (show !== this.vis) { this.vis = show; setCls(this.el, 'show', show); }
    if (hidden) return;
    // project the head point; kept on the screen (the leash keeps everyone on it, this keeps the tag readable at the edge)
    // (over the head: its bone's height, eased, so a short pup's tag sits as close as a tall one's)
    const hd = B.rig?.parts?.head;
    if (hd && !down) { const hy = V3.setFromMatrixPosition(hd.matrixWorld).y - p.y; if (hy > 0.4 && hy < 3) this.headY = this.headY ? this.headY + (hy + 0.62 - this.headY) * Math.min(1, dt * 6) : hy + 0.62; }
    V3.set(p.x, p.y + (down ? 1.05 : this.headY || HEAD_Y), p.z).project(cam);
    if (V3.z > 1) { setStyle(this.el, 'opacity', '0'); return; }
    setStyle(this.el, 'opacity', '');
    const W = innerWidth, Hh = innerHeight, sc = H.G.ui.scale || 1;
    const x = clamp((V3.x * 0.5 + 0.5) * W, 40 * sc, W - 40 * sc), y = clamp((-V3.y * 0.5 + 0.5) * Hh, 70 * sc, Hh - 10);
    this.sx = x; this.sy = y; this.sc = sc; this.placed = true; // (written by the HUD after the tags are kept apart: place)
  }
  place(dt) {
    this.ox = (this.ox || 0) + ((this.want || 0) - (this.ox || 0)) * Math.min(1, dt * 10);
    this.el.style.transform = `translate3d(${(this.sx + this.ox).toFixed(1)}px,${this.sy.toFixed(1)}px,0) scale(${this.sc.toFixed(3)})`;
  }
}

// ------------------------------------------------------------------ a player card (players 2-4)
class Card {
  constructor(H, s) {
    this.H = H; this.s = s; this.n = s.n;
    const e = this.el = el('div', 'ch-card');
    e.dataset.coopCard = s.n; // (ui/coopPanes.js grows a pane out of it)
    e.style.setProperty('--pc', s.color);
    e.innerHTML = `<div class="ch-plate"></div>
      <div class="ch-face"><div class="ch-pf"></div><svg class="ch-rev" viewBox="0 0 80 80"><circle class="t" cx="40" cy="40" r="36"/><circle class="f" cx="40" cy="40" r="36" pathLength="100"/></svg><i class="ch-p">P${s.n}</i><span class="ch-lv"><span></span><i class="ch-pts"></i></span></div>
      <div class="ch-info">
        <div class="ch-name"><b></b></div>
        <div class="ch-bar ch-life"><i class="g"></i><i class="f"></i></div>
        <div class="ch-bar ch-zoom"><i class="f"></i></div>
        <div class="ch-hb">${Array.from({ length: 6 }, () => '<div class="ch-sk"><img alt="" draggable="false"><i class="cd"></i></div>').join('')}</div>
        <div class="ch-msg"><b></b><small></small></div>
      </div>
      <span class="ch-bag">${glyph('bag')}</span>
      <div class="ch-pick"><div class="ch-pl"></div></div>`;
    const q = c => e.querySelector(c);
    this.$ = { face: q('.ch-pf'), lv: q('.ch-lv span'), pts: q('.ch-pts'), lvw: q('.ch-lv'), name: q('.ch-name b'), lifeF: q('.ch-life .f'), lifeG: q('.ch-life .g'), life: q('.ch-life'), zoomF: q('.ch-zoom .f'),
      rev: q('.ch-rev .f'), msgB: q('.ch-msg b'), msgS: q('.ch-msg small'), pick: q('.ch-pick'), pl: q('.ch-pl'), bag: q('.ch-bag') };
    this.sk = [...e.querySelectorAll('.ch-sk')].map(n => ({ el: n, img: n.querySelector('img'), cd: n.querySelector('.cd'), id: undefined, key: '', q: -1 }));
    this.hero = null; this.lvl = null; this.lf = -1; this.zf = -1; this.state = ''; this.revQ = -1; this.pickSig = ''; this.pickI = -1; this.pane = null;
    H.cardsRoot.appendChild(e);
    requestAnimationFrame(() => requestAnimationFrame(() => e.classList.add('in'))); // (slides in from the left)
  }
  setK(k) { if (k !== this.k) { this.k = k; this.el.style.setProperty('--k', k); } }
  leave() {
    const e = this.el; e.classList.remove('in'); e.classList.add('out');
    setTimeout(() => e.remove(), 520);
  }
  flash() { replay(this.el, 'swap', 760); }
  update(c) {
    const H = this.H, $ = this.$;
    if (c.hero !== this.hero) {
      const first = this.hero === null;
      this.hero = c.hero;
      $.face.innerHTML = H.face(c.hero);
      this.el.style.setProperty('--hc', CLASSES[c.hero]?.color || '#ff8fb0');
      $.name.textContent = c.name || heroName(c.hero);
      this.lvl = null; this.lf = -1;
      for (const k of this.sk) k.key = '';
      if (!first) this.flash();
    }
    if (c.lvl !== this.lvl) { if (this.lvl != null && c.lvl > this.lvl) replay($.lvw, 'up', 1200); this.lvl = c.lvl; setText($.lv, String(c.lvl || 1)); }
    setCls($.pts, 'on', (c.statPts || 0) + (c.skillPts || 0) > 0);
    // the bars (transform only: the fill eases, the pale ghost of a hit drains after it)
    const lf = Math.round(clamp((c.life ?? c.lifeMax) / Math.max(1, c.lifeMax)) * 400) / 400;
    if (lf !== this.lf) {
      if (this.lf >= 0 && lf < this.lf - 0.02 && !c.downed) replay(this.el, 'hurt', 420);
      this.lf = lf; setVar($.lifeF, '--f', lf.toFixed(4)); setVar($.lifeG, '--f', lf.toFixed(4));
      setCls($.life, 'low', lf < 0.3);
    }
    const zf = Math.round(clamp((c.zoom ?? c.zoomMax) / Math.max(1, c.zoomMax)) * 400) / 400;
    if (zf !== this.zf) { this.zf = zf; setVar($.zoomF, '--f', zf.toFixed(4)); }
    // the six hotbar icons and their cooldown sweeps
    const hb = c.hotbar || [];
    for (let i = 0; i < 6; i++) {
      const k = this.sk[i], id = hb[i] || null;
      const key = id ? id + (id === 'attack' ? ':' + (H.weaponOf(this.s) || '') : '') : '';
      if (key !== k.key) {
        const was = k.key; k.key = key; k.id = id;
        if (id) k.img.src = H.C.with(this.s, () => hotbarIconURL(id, H.G.derived));
        setCls(k.el, 'empty', !id);
        if (was) replay(k.el, 'swap', 450);
      }
      const q = id ? Math.round(clamp(c.cds?.[i] || 0) * 100) / 100 : 0;
      if (q !== k.q) { if (k.q > 0 && q === 0) replay(k.el, 'ready', 600); k.q = q; setVar(k.cd, '--cd', q.toFixed(2)); setCls(k.el, 'cool', q > 0); }
    }
    // the states: downed (the revive ring fills round the portrait), the lost pad, the open pane
    const st = c.downed ? 'down' : c.lost ? 'lost' : '';
    if (st !== this.state) {
      this.state = st;
      setCls(this.el, 'down', st === 'down'); setCls(this.el, 'lost', st === 'lost');
      if (st === 'lost') { $.msgB.innerHTML = `${PAD_SVG}<span>Reconnect your<br>controller</span>`; setText($.msgS, ''); }
      if (st) replay(this.el, 'state', 500);
    }
    if (st === 'down') {
      const r = Math.round(clamp(c.downed.rev) * 100);
      if (r !== this.revQ) { this.revQ = r; setStyle($.rev, 'strokeDashoffset', String(100 - r)); }
      const sig = c.downed.helpers ? 'h' : 'n';
      if (sig !== this._dsig) { this._dsig = sig; $.msgB.innerHTML = c.downed.helpers ? 'Hang in there!' : 'Needs a hand!'; }
      setText($.msgS, c.downed.helpers ? 'A friend is helping…' : `Shadow comes in ${Math.max(1, Math.ceil((1 - clamp(c.downed.auto)) * 20))}s`);
    } else if (this.revQ !== -1) { this.revQ = -1; setStyle($.rev, 'strokeDashoffset', '100'); }
    if (!!c.pane !== !!this.pane) { this.pane = c.pane; setCls(this.el, 'pane', !!c.pane); }
    this.picker(c.picker);
  }
  /** LB held: an arc of portraits over the card (the first is the hero they play now), the highlight following */
  picker(P) {
    const $ = this.$;
    if (!P) {
      if (this.pickSig) { this.pickSig = ''; this.pickI = -1; setCls(this.el, 'picking', false); }
      return;
    }
    const sig = P.list.join(',');
    if (sig !== this.pickSig) {
      this.pickSig = sig; this.pickI = -1;
      // (a gentle arc in a balloon over the card: the middle highest, the ends dipping)
      const n = P.list.length, W = 236, sp = n > 1 ? Math.min(54, (W - 58) / (n - 1)) : 0, half = Math.max(1, sp * (n - 1) / 2);
      for (const f of [...$.pick.querySelectorAll('.ch-pk')]) f.remove();
      P.list.forEach((id, i) => {
        const dx = (i - (n - 1) / 2) * sp, f = el('div', 'ch-pk');
        f.style.setProperty('--x', `${(W / 2 + dx).toFixed(1)}px`); f.style.setProperty('--y', `${(40 + 14 * (dx / half) ** 2).toFixed(1)}px`);
        f.style.setProperty('--hc', CLASSES[id]?.color || '#ff8fb0'); f.style.setProperty('--i', i);
        f.innerHTML = `<div class="ch-pkf">${this.H.face(id)}</div>${i === 0 ? '<em>now</em>' : ''}`;
        $.pick.insertBefore(f, $.pl);
      });
      requestAnimationFrame(() => setCls(this.el, 'picking', true));
    }
    if (P.i !== this.pickI) {
      this.pickI = P.i;
      [...$.pick.querySelectorAll('.ch-pk')].forEach((f, i) => f.classList.toggle('sel', i === P.i));
      const id = P.list[P.i];
      $.pl.innerHTML = `<b>${esc(heroName(id))}</b><span>${P.i === 0 ? 'Keep playing' : `Lv ${this.H.G.state.heroes?.[id]?.player?.lvl || 1} · ${esc(CLASSES[id]?.title || '')}`}</span>`;
      this.el.querySelector('.ch-pick').style.setProperty('--hc', CLASSES[id]?.color || '#ff8fb0');
      replay($.pl, 'swap', 300);
    }
  }
}

// ------------------------------------------------------------------ the join card (a spare pad)
class JoinCard {
  constructor(H, pad) {
    this.H = H; this.pad = pad; this.n = 0; this.sig = ''; this.i = -1; this.why = null; this.closing = false; this.joined = null;
    const e = this.el = el('div', 'cj');
    e.innerHTML = `<div class="cj-h"><b class="cj-tag">Player <span class="cj-n"></span></b><span class="cj-sub">pick a hero</span></div>
      <div class="cj-car"><span class="cj-ar l">${CHEV(0)}</span><div class="cj-track"></div><span class="cj-ar r">${CHEV(1)}</span></div>
      <div class="cj-who"><b></b><span></span></div>
      <div class="cj-why"><span class="cj-wic">${glyph('paw')}</span><b></b></div>
      <div class="cj-foot"></div><i class="cj-bar"></i>`;
    const q = c => e.querySelector(c);
    this.$ = { n: q('.cj-n'), track: q('.cj-track'), who: q('.cj-who'), whoB: q('.cj-who b'), whoS: q('.cj-who span'), why: q('.cj-why b'), foot: q('.cj-foot'), l: q('.cj-ar.l'), r: q('.cj-ar.r'), bar: q('.cj-bar') };
    H.joinsRoot.appendChild(e);
    requestAnimationFrame(() => requestAnimationFrame(() => e.classList.add('in')));
  }
  update(J, n) {
    const H = this.H, $ = this.$;
    if (n !== this.n) { this.n = n; this.el.style.setProperty('--pc', PLAYER_COLORS[n - 1] || PLAYER_COLORS[1]); setText($.n, String(n)); }
    const style = padStyleOf(J.reader);
    if (style !== this.style) { this.style = style; this.footSig = ''; }
    const why = J.why || '';
    if (why !== this.why) {
      this.why = why; setCls(this.el, 'why', !!why); setText($.why, why);
      if (why) { $.bar.style.animation = 'none'; void $.bar.offsetWidth; $.bar.style.animation = ''; replay(this.el, 'nope', 500); }
    }
    const fsig = (why ? 'w' : 'j') + style;
    if (fsig !== this.footSig) { this.footSig = fsig; $.foot.innerHTML = why ? `${cap('B', style)}<span>Back</span>` : `${cap('A', style)}<span>Join</span><i>·</i>${cap('B', style)}<span>Back</span>`; }
    const sig = J.list.join(',');
    if (sig !== this.sig) {
      this.sig = sig; this.i = -1;
      $.track.innerHTML = J.list.map(id => `<div class="cj-f" style="--hc:${CLASSES[id]?.color || '#ff8fb0'}"><div class="cj-fi">${H.face(id)}</div></div>`).join('');
      this.faces = [...$.track.children];
      setCls(this.el, 'one', J.list.length < 2);
    }
    if (J.i !== this.i && J.list.length) {
      const prev = this.i, L = J.list.length;
      if (prev >= 0 && L > 1) { const d = ((J.i - prev + L) % L); replay(d === 1 ? $.r : $.l, 'bump', 260); }
      this.i = J.i;
      this.faces.forEach((f, k) => {
        let d = k - J.i; if (d > L / 2) d -= L; if (d < -L / 2) d += L; // (the nearest way round: the carousel wraps)
        f.style.setProperty('--d', d); setCls(f, 'sel', d === 0); setCls(f, 'far', Math.abs(d) > 1);
      });
      const id = J.list[J.i], C = CLASSES[id], lvl = H.G.state.heroes?.[id]?.player?.lvl || 1;
      $.whoB.textContent = C?.name || id;
      $.whoS.innerHTML = `${esc(C?.title || '')} · <em>Lv ${lvl}</em>`;
      this.el.style.setProperty('--hc', C?.color || '#ff8fb0');
      if (prev >= 0) replay($.who, 'swap', 320);
    }
  }
  /** closed: a join pops it and it flies into the new player's card; B or a timeout drops it back down */
  close() {
    if (this.closing) return; this.closing = true;
    const e = this.el, s = this.joined, H = this.H;
    const ox = e.offsetLeft, oy = e.offsetTop; // (out of the row where it stands: the others close up round it)
    e.classList.add('gone'); e.style.position = 'absolute'; e.style.left = ox + 'px'; e.style.top = oy + 'px';
    if (s) {
      if (s.n !== this.n) { this.n = s.n; e.style.setProperty('--pc', s.color); setText(this.$.n, String(s.n)); } // (the number they really got)
      const r = e.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
      const col = s.color, hc = CLASSES[s.hero]?.color || '#fff';
      H.G.ui?.burst?.(x, y - r.height * 0.15, { n: 26, spread: 150, colors: [col, '#fff6e8', hc, '#ffe79a', col], kind: 'mix' });
      H.G.ui?.ring?.(x, y - r.height * 0.15, col);
      const card = H.cards.get(s)?.el.getBoundingClientRect();
      const dx = card ? card.left + card.width * 0.25 - x : -x * 0.6, dy = card ? card.top + card.height / 2 - y : innerHeight * 0.4;
      e.classList.add('popped');
      e.animate([
        { transform: 'translate(0,0) scale(1)', opacity: 1 },
        { transform: 'translate(0,-10px) scale(1.09)', opacity: 1, offset: 0.22 },
        { transform: `translate(${(dx / (H.G.ui.scale || 1)).toFixed(0)}px,${(dy / (H.G.ui.scale || 1)).toFixed(0)}px) scale(.18)`, opacity: 0 },
      ], { duration: 620, easing: 'cubic-bezier(.45,0,.3,1)', fill: 'forwards' });
      setTimeout(() => e.remove(), 640);
    } else {
      e.classList.remove('in'); e.classList.add('out');
      setTimeout(() => e.remove(), 460);
    }
  }
}

// ------------------------------------------------------------------ the HUD
class CoopHud {
  constructor(G, C) {
    this.G = G; this.C = C; this.ready = false;
    const ui = G.ui;
    this.root = el('div', 'coop-hud');
    this.root.innerHTML = '<div class="ch-cards"></div><div class="ch-joins"></div>';
    ui.layers.hud.appendChild(this.root);
    this.cardsRoot = this.root.querySelector('.ch-cards'); this.joinsRoot = this.root.querySelector('.ch-joins');
    this.worldRoot = el('div', 'coop-world'); ui.layers.world.appendChild(this.worldRoot);
    this.cards = new Map(); this.marks = new Map(); this.joinCards = new Map();
    this.faces = new Map();
    this.layoutT = 0; this.lift = -1; this.k = 1;
    // player 1's gold P1 badge on the HUD portrait (shown while co-op is on: coopHud.css)
    const bub = ui.hud?.$?.bub;
    if (bub && !bub.querySelector('.ch-p1')) bub.insertAdjacentHTML('beforeend', '<i class="ch-p1">P1</i>');
    this.listen();
    // after the UI's own update each frame (the floats' camera, the HUD's numbers): wrapped once
    if (!ui._coopHudWrapped) {
      ui._coopHudWrapped = true;
      const u0 = ui.update;
      ui.update = function (dt) { const r = u0.call(this, dt); try { G.coopHud?.update(dt); } catch (e) { if (!G.coopHud._err) { G.coopHud._err = 1; console.warn('[coop] hud', e); } } return r; };
    }
    addEventListener('resize', () => { this.layoutT = 0; });
    this.ready = true;
  }
  /** a hero's face: the 3D portrait (game.js G.portrait), else the drawn one; cached per hero */
  face(id) {
    let h = this.faces.get(id);
    if (h) return h;
    const url = this.G.portrait?.(id);
    h = url ? `<img class="p3d" src="${url}" alt="" draggable="false">` : portrait(id);
    if (url) this.faces.set(id, h);
    return h;
  }
  weaponOf(s) { return this.C.with(s, () => this.G.derived?.weaponType); }

  listen() {
    const G = this.G, C = this.C, toast = (t, o) => C.primary(() => G.ui?.toast?.(t, o));
    Events.on('coop:pad', p => {
      const s = C.slots.find(x => x.n === p?.n); if (!s) return;
      if (p.connected) toast(`Player ${s.n}'s controller is back!`, { color: s.color, iconURL: this.url(s.hero), sub: `${heroName(s.hero)} is ready to go` });
      else toast(`Player ${s.n}'s controller disconnected`, { color: s.color, iconURL: this.url(s.hero), sub: 'Reconnect it within a minute', duration: 5 });
    });
    Events.on('coop:revived', p => {
      const s = C.slots.find(x => x.n === p?.n); if (!s || p.why === 'regroup') return;
      const B = C.bodyOf(s); if (!B) return;
      C.primary(() => G.ui?.float?.(B.pos.clone().setY(B.pos.y + 1.9), p.why === 'shadow' ? 'Shadow helped them up!' : 'Back on their paws!', { kind: 'status', color: s.color }));
      if (!s.primary) this.cards.get(s)?.flash();
    });
  }
  url(id) { return this.G.portrait?.(id) || undefined; }

  // ---- the core's hooks (coop.js: this.ui?.joined / left / switched)
  joined(s) {
    const G = this.G, C = this.C;
    for (const J of this.joinCards.values()) if (J.pad === s.pad?.index) J.joined = s;
    this.cards.set(s, new Card(this, s));
    this.restack();
    C.primary(() => G.ui?.toast?.(`Player ${s.n} joined as ${heroName(s.hero)}!`, { color: s.color, iconURL: this.url(s.hero), sub: CLASSES[s.hero]?.title }));
  }
  left(s) {
    const G = this.G, C = this.C;
    const card = this.cards.get(s); if (card) { card.leave(); this.cards.delete(s); }
    const m = this.marks.get(s); if (m) { m.dispose(); this.marks.delete(s); }
    this.restack();
    C.primary(() => G.ui?.toast?.(`Player ${s.n} left`, { color: s.color, iconURL: this.url(s.hero), sub: `${heroName(s.hero)} heads home for a rest` }));
  }
  switched(s) { this.cards.get(s)?.flash(); const m = this.marks.get(s); if (m) { m.movedT = performance.now(); replay(m.$.pill, 'pop', 400); } }

  restack() {
    const list = [...this.cards.values()].sort((a, b) => a.n - b.n);
    list.forEach((c, k) => c.setK(k));
    this.nCards = list.length;
    this.layoutT = 0;
  }
  /** where the stack fits (left of the life orb: scaled down if the orb reaches in) and how far the toasts lift over it */
  layout() {
    const ui = this.G.ui, R = ui.root, s = ui.scale || 1;
    const busy = R.classList.contains('building') || R.classList.contains('decorating') || R.classList.contains('dlg-open');
    if (!busy) {
      const orb = ui.hud?.$?.bc?.querySelector('.orb-slot.l'), L = ui.layers.hud.getBoundingClientRect();
      if (orb) { const o = orb.getBoundingClientRect(); if (o.width > 4) { const free = (o.left - L.left) / s - (parseFloat(getComputedStyle(this.cardsRoot).left) || 4) - 8; this.k = clamp(free / CARD_W, 0.62, 1); } }
      setVar(this.root, '--ch-k', this.k.toFixed(3));
    }
    const n = this.nCards || 0, T = ui.toasts?.root;
    let lift = 0;
    if (n && T && !busy) {
      const base = parseFloat(getComputedStyle(T).bottom) || 0;
      const top = (parseFloat(getComputedStyle(this.cardsRoot).bottom) || 4) + this.k * (n * CARD_PITCH - (CARD_PITCH - CARD_H)) + 12;
      lift = Math.max(0, Math.round(top - base));
    }
    if (lift !== this.lift) { this.lift = lift; R.style.setProperty('--coop-lift', lift + 'px'); }
  }

  update(dt) {
    const G = this.G, C = this.C, ui = G.ui, R = ui.root;
    if (!ui?.ready) return;
    const title = ui.mode === 'title' || G.titleActive;
    const busy = R.classList.contains('building') || R.classList.contains('decorating');
    setCls(R, 'coop-on', C.active && !title);
    setCls(this.root, 'off', title);
    setCls(this.root, 'busy', busy);
    // the join cards: one per pad in C.joins (opened in order: they'll be the next players, in that order)
    this.joinsTick();
    // the player cards and the world marks
    const vis = C.active && !title && !busy && !ui.iris?.active && !ui.dlg?.active;
    setCls(this.worldRoot, 'off', !vis);
    const cam = G.engine?.camera, now = performance.now();
    if ((this.layoutT -= dt) <= 0) { this.layoutT = 0.5; this.layout(); }
    if (!C.active) { if (this.marks.size) { for (const m of this.marks.values()) m.dispose(); this.marks.clear(); } return; }
    for (const s of C.slots) {
      if (s.gone) continue;
      const c = C.card(s);
      if (!s.primary) { let k = this.cards.get(s); if (!k) { k = new Card(this, s); this.cards.set(s, k); this.restack(); } k.update(c); }
      let m = this.marks.get(s); if (!m) { m = new Mark(this, s); this.marks.set(s, m); }
      m.placed = false;
      if (cam) m.update(c, dt, vis, cam, now);
    }
    // tags of heroes standing close would sit on each other: each pair that overlaps eases apart sideways
    const L = [...this.marks.values()].filter(m => m.placed && m.vis);
    for (const m of L) m.want = 0;
    L.sort((a, b) => a.sx - b.sx);
    for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
      const a = L[i], b = L[j], need = 46 * a.sc - (b.sx - a.sx);
      if (need > 0 && Math.abs(a.sy - b.sy) < 30 * a.sc) { a.want -= need / 2; b.want += need / 2; }
    }
    for (const m of this.marks.values()) if (m.placed) m.place(dt);
    for (const [s, m] of this.marks) if (s.gone || !C.slots.includes(s)) { m.dispose(); this.marks.delete(s); }
    for (const [s, k] of this.cards) if (s.gone || !C.slots.includes(s)) { k.leave(); this.cards.delete(s); this.restack(); }
  }
  /** a join card leaving the row: it's lifted out where it stands (its own exit plays there) and the others glide to
   *  their new places rather than jump (FLIP on the independent translate, so their own transforms are left alone) */
  flip(fn) {
    const rest = [...this.joinsRoot.children].filter(e => !e.classList.contains('gone')), before = new Map(rest.map(e => [e, e.getBoundingClientRect().left]));
    fn();
    const sc = this.G.ui.scale || 1;
    for (const e of rest) {
      if (e.classList.contains('gone')) continue;
      const dx = (before.get(e) - e.getBoundingClientRect().left) / sc;
      if (Math.abs(dx) > 0.5) e.animate([{ translate: `${dx.toFixed(1)}px 0` }, { translate: '0 0' }], { duration: 420, easing: 'cubic-bezier(.2,.9,.3,1)' });
    }
  }
  joinsTick() {
    const C = this.C, used = new Set(C.slots.map(s => s.n)), free = [];
    for (let n = 2; n <= 4; n++) if (!used.has(n)) free.push(n);
    let k = 0;
    for (const [pad, J] of C.joins) {
      let jc = this.joinCards.get(pad);
      if (!jc) { jc = new JoinCard(this, pad); this.joinCards.set(pad, jc); }
      jc.update(J, free[k++] || J.n);
    }
    for (const [pad, jc] of this.joinCards) if (!C.joins.has(pad)) { this.flip(() => jc.close()); this.joinCards.delete(pad); }
  }
}

/** coop.js installCoop (a lazy chunk, once the UI exists) */
export function installCoopHud(G, C) {
  if (G.coopHud || !G.ui?.layers) return G.coopHud || null;
  const H = G.coopHud = new CoopHud(G, C);
  C.ui = H;
  return H;
}
