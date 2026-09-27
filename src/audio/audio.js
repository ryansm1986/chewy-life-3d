// Chewy Life 3D — procedural audio system (no asset files; everything is synthesized with Web Audio).
//
//   import { Audio } from './audio/audio.js';
//   Audio.init();                                   // once at boot; the AudioContext is created on the first pointer/key gesture
//   Audio.play('bark', { vol, pitch, pan, pos, delay, vary });   // → handle { stop(fade), duration } | null
//   Audio.babble('Hello there!', { pitch: 1.2, speed: 1, voice: 'cute'|'kid'|'deep'|'squeak'|'dog' }) // → { duration, stop }
//   Audio.music('village_day', { fade: 2 });        // crossfades; Audio.music(null) stops. Requests before unlock are remembered.
//   Audio.ambience('village'); Audio.setAmbienceMix({ water: 0.6 });   // water = stream-proximity overlay (0..1)
//   Audio.update(dt, { pos: player.position, camera });              // or { x, z, yaw } — positional panning / attenuation
//   Audio.setVolume('master'|'music'|'sfx'|'ambience', 0..1); Audio.toggleMute(); Audio.duck(0.4, 1.5);
//   Audio.sting('victory');                          // one-shot musical cue on the music bus
//
// Volumes are perceptual (gain = v²) and persisted in localStorage.
//
// Music direction (init() binds this to the core event bus — no game-side wiring needed):
//  - music('dungeon') plays the current Burrow biome's theme (G.dungeon.layout.theme → BIOME_TRACKS); floors of the same
//    biome keep the theme running, a new biome crossfades. ambience('dungeon') resolves the same way.
//  - music('boss') plays the biome's boss theme once the encounter has started (boss.introDone); before that (entering a
//    boss floor) it resolves to the biome theme, so the boss music arrives with the boss intro (boss:spawn).
//  - boss intensity follows the fight: 1 below 66% life / first summon, 2 when enraged (polled, bar-quantised).
//    Biome themes get a combat drive layer while a pack is hunting Chewy.
//  - boss:dead → boss music out, victory sting, the level-up/quest fanfares that the kill triggers fold into it,
//    then the biome theme returns.
//  - Big SFX (level up, quest, rare loot, roars) and dialogue babble duck the music; ducks stack (deepest wins).
import { Graph, Voice, clamp } from './core.js';
import { SFX, SFX_NAMES, SFX_GROUPS } from './sfx.js';
import { MusicPlayer, TRACKS, TRACK_NAMES, STINGS, STING_NAMES, BIOME_TRACKS, BOSS_TRACKS } from './music.js';
import { AmbiencePlayer, AMBIENCES, AMBIENCE_NAMES, BIOME_AMBIENCES } from './ambience.js';
import { babble as synthBabble, babbleDuration, gibberish, VOICES } from './babble.js';
import { Events as CoreEvents } from '../core/events.js';
import { cacheStats, cacheOpts } from './instruments.js';

export { SFX_NAMES, SFX_GROUPS, TRACK_NAMES, STING_NAMES, AMBIENCE_NAMES, BIOME_TRACKS, BOSS_TRACKS, gibberish, cacheStats, cacheOpts };
export const BABBLE_VOICES = Object.keys(VOICES);
export const DEFAULT_VOLUMES = { master: 0.85, music: 0.7, sfx: 0.85, ambience: 0.65 };
const LS_KEY = 'chewy3d.audio.v1';
const MAX_VOICES = 28;
const curve = v => v * v;
const CELEBRATE = new Set(['ui_levelup', 'ui_quest_done']); // folded into the victory sting
const gameG = () => (typeof window !== 'undefined' ? window.G : null);

class AudioSystem {
  constructor() {
    this.ctx = null; this.graph = null;
    this.vol = { ...DEFAULT_VOLUMES }; this.muted = false;
    try { const s = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); if (s) { Object.assign(this.vol, s.vol || {}); this.muted = !!s.muted; } } catch { /* private mode */ }
    this.voices = []; this.lastPlay = new Map(); this.warned = new Set();
    this.listener = { x: 0, y: 0, z: 0, rx: 1, rz: 0 };
    this.track = null; this.wantTrack = null; this.fading = []; this.stings = [];
    this.amb = null; this.wantAmb = null; this.water = null; this.mix = { water: 0 }; this.waterZeroAt = 0; this.waterEff = 0;
    this.babbleHandle = null; this.inited = false; this.timer = 0;
    // director state
    this.ducks = []; this.duckLvl = 1; this.remaps = new Map(); this.victoryUntil = 0; this.victoryShimmer = false;
    this.returnT = 0; this.fightUntil = 0; this.forcedIntensity = null; this.biomeOverride = null; this.dirT = 0; this.unbind = null;
    this.onGesture = this.onGesture.bind(this); this.tick = this.tick.bind(this);
  }

  // ------------------------------------------------------------------------------------------ lifecycle
  init() {
    if (this.inited || typeof window === 'undefined') return this;
    this.inited = true; this.addGestures();
    this.unbind = this.bindEvents(CoreEvents);
    return this;
  }
  get ready() { return !!this.ctx && this.ctx.state === 'running'; }
  get currentTrack() { return this.wantTrack; }
  get currentAmbience() { return this.wantAmb; }
  addGestures() { for (const e of ['pointerdown', 'keydown', 'touchend']) window.addEventListener(e, this.onGesture, { capture: true, passive: true }); }
  removeGestures() { for (const e of ['pointerdown', 'keydown', 'touchend']) window.removeEventListener(e, this.onGesture, { capture: true }); }
  onGesture() { this.unlock(); }
  // Creates/resumes the AudioContext. Must run inside a user gesture (init() wires that up).
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      try { this.ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { console.warn('[audio] AudioContext failed', e); return; }
      this.graph = new Graph(this.ctx, this.ctx.destination);
      this.applyVolumes(true);
      this.ctx.addEventListener('statechange', () => { if (this.ctx.state === 'suspended' || this.ctx.state === 'interrupted') this.addGestures(); });
      this.timer = setTimeout(this.tick, 30);
    }
    if (this.ctx.state === 'running') this.started();
    else this.ctx.resume().then(() => this.started()).catch(() => {});
  }
  started() {
    if (!this.ready) return;
    this.removeGestures();
    if (this.wantTrack && !this.track) this.music(this.wantTrack, { fade: 1.5 });
    if (this.wantAmb && !this.amb) this.ambience(this.wantAmb, { fade: 2 });
    if (this.mix.water > 0 && !this.water) this.setAmbienceMix({});
  }
  // Scheduler: keeps music/ambience generated slightly ahead of the audio clock (longer lookahead in hidden tabs,
  // where timers are throttled), retires faded players and finished voices.
  tick() {
    const c = this.ctx; if (!c) return;
    const hidden = typeof document !== 'undefined' && document.hidden;
    if (c.state === 'running') {
      const now = c.currentTime, ahead = hidden ? 2.5 : 0.5;
      if ((this.dirT -= 1) <= 0) { this.dirT = 4; try { this.direct(now); } catch (e) { /* game state mid-teardown */ } }
      for (const p of [this.track, this.amb, this.water, ...this.fading]) {
        if (!p) continue;
        if (p.nextBar != null && p.nextBar < now - 0.05) p.resync(now);
        p.scheduleUntil(now + ahead, now);
      }
      const retire = p => { if (now > p.stopAt) { p.dispose(); return false; } return true; };
      this.fading = this.fading.filter(retire);
      if (this.stings.length) this.stings = this.stings.filter(retire);
      if (this.ducks.length && this.ducks.some(d => d.until <= now)) this.applyDuck(now);
      this.prune(now);
      if (this.water && this.waterEff <= 0.001 && now - this.waterZeroAt > 3) { this.water.fadeOut(now, 0.5); this.fading.push(this.water); this.water = null; }
    }
    this.timer = setTimeout(this.tick, hidden ? 250 : 60);
  }
  // Reads the live game (window.G) a few times a second: boss phase → boss-track intensity, a pack hunting Chewy →
  // combat layer on the biome theme (held 5 s after the fight calms). Everything lands on the next bar line.
  direct(now) {
    const tr = this.track, G = gameG();
    if (!tr || !tr.def.maxIntensity) return;
    let lvl = 0;
    if (G?.mode === 'dungeon' && G.dungeon) {
      const D = G.dungeon;
      if (tr.def.boss) {
        const b = D.boss;
        if (b?.alive) { const f = b.life / (b.lifeMax || 1); lvl = b.enraged || f < 0.33 ? 2 : b.summoned > 0 || f < 0.66 ? 1 : 0; }
        else lvl = tr.wantIntensity;
      } else {
        const P = G.player?.pos; let n = 0;
        if (P) for (const m of D.monsters) {
          if (!m.alive || !m.aggro || m.def?.boss || Math.abs(m.pos.x - P.x) + Math.abs(m.pos.z - P.z) > 16) continue;
          n += m.rank && m.rank !== 'normal' ? 2 : 1; if (n >= 2) break;
        }
        if (n >= 2) this.fightUntil = now + 5;
        lvl = now < this.fightUntil ? 1 : 0;
      }
    }
    tr.setIntensity(this.forcedIntensity ?? lvl);
  }

  // ------------------------------------------------------------------------------------------ volume
  setVolume(bus, v) {
    if (!(bus in this.vol)) return;
    this.vol[bus] = clamp(+v || 0, 0, 1); this.save(); this.applyVolumes();
  }
  getVolume(bus) { return this.vol[bus]; }
  setMuted(m) { this.muted = !!m; this.save(); this.applyVolumes(); return this.muted; }
  toggleMute() { return this.setMuted(!this.muted); }
  save() { try { localStorage.setItem(LS_KEY, JSON.stringify({ vol: this.vol, muted: this.muted })); } catch { /* ignore */ } }
  applyVolumes(instant) {
    if (!this.graph) return;
    const t = this.ctx.currentTime, tc = instant ? 0.001 : 0.04;
    for (const k of Object.keys(this.vol)) { const g = this.graph.gainFor(k); if (g) g.gain.setTargetAtTime(curve(this.vol[k]), t, tc); }
    this.graph.muteG.gain.setTargetAtTime(this.muted ? 0 : 1, t, tc);
  }
  // Temporarily lower the music (boss roars, dialogue, big stingers). Ducks stack: the deepest active one wins and
  // the music eases back up when the last one expires (checked by the scheduler tick).
  duck(level = 0.4, dur = 1.5, attack = 0.08) {
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    this.ducks.push({ level: clamp(level, 0, 1), until: now + dur });
    this.applyDuck(now, attack);
  }
  applyDuck(now, attack = 0.08) {
    this.ducks = this.ducks.filter(d => d.until > now);
    const lvl = this.ducks.reduce((m, d) => Math.min(m, d.level), 1);
    if (Math.abs(lvl - this.duckLvl) < 1e-3) return;
    const p = this.graph.duckG.gain;
    p.cancelScheduledValues(now); p.setValueAtTime(p.value, now);
    p.setTargetAtTime(lvl, now, lvl < this.duckLvl ? attack / 3 : 0.45);
    this.duckLvl = lvl;
  }
  // The next `from` sfx within `secs` plays as `to` instead (to = null → skipped). Used to pick a sound from game
  // context that the emitter doesn't know about (item rarity, quest vs level-up) without double-playing.
  remap(from, to, secs = 0.25) { this.remaps.set(from, { to, until: performance.now() + secs * 1000 }); }
  resolveSfx(name) {
    const now = performance.now();
    if (now < this.victoryUntil && CELEBRATE.has(name)) { if (this.victoryShimmer) { this.victoryShimmer = false; return 'victory_sfx'; } return null; }
    const rm = this.remaps.get(name);
    if (rm) { this.remaps.delete(name); if (now <= rm.until) return rm.to; }
    return name;
  }

  // ------------------------------------------------------------------------------------------ sfx
  // opts: vol (0..n), pitch (multiplier), pan (-1..1), pos {x,y,z} (world, uses listener), delay (s), vary (random pitch ±),
  //       rev (reverb send multiplier), force (ignore retrigger gap), text/voice (villager_chatter)
  play(name, o = {}) {
    const c = this.ctx;
    if (!c || c.state !== 'running' || this.muted || this.vol.sfx <= 0 || this.vol.master <= 0) return null;
    if (this.remaps.size || this.victoryUntil) { name = this.resolveSfx(name); if (!name) return null; }
    const def = SFX[name];
    if (!def) { if (!this.warned.has(name)) { this.warned.add(name); console.warn('[audio] unknown sfx', name); } return null; }
    const now = c.currentTime;
    if (!o.force && now - (this.lastPlay.get(name) ?? -9) < (def.gap ?? 0.025)) return null;
    this.lastPlay.set(name, now);
    let vol = (o.vol ?? 1) * (def.trim ?? 1), pan = o.pan ?? 0, lp = 0;
    if (o.pos) { const sp = this.spatial(o.pos); if (sp.gain < 0.015) return null; vol *= sp.gain; pan = clamp(pan + sp.pan, -1, 1); lp = sp.lp; }
    this.prune(now);
    const active = this.voices.filter(v => !v.stolen && v.end > now), same = active.filter(v => v.name === name);
    // Voice limiting: steal the oldest voice — unless it only just started, in which case this is a burst
    // (e.g. 30 hits in one frame) and the voices already playing cover it; stealing would still overlap.
    if (same.length >= (def.max ?? 4)) { if (now - same[0].start < 0.06) return null; this.steal(same[0], now); }
    else if (active.length >= MAX_VOICES) { if (now - active[0].start < 0.06) return null; this.steal(active[0], now); }
    // Density attenuation: crowds of the same sound, and very busy moments overall, get quieter rather than louder.
    vol /= 1 + 0.35 * same.filter(v => now - v.start < 0.12).length;
    const busy = active.filter(v => now - v.start < 0.25).length;
    if (busy > 4) vol /= Math.sqrt(1 + (busy - 4) / 4);
    const vary = o.vary ?? def.vary ?? 0.05;
    const P = (o.pitch ?? 1) * (1 + (Math.random() * 2 - 1) * vary);
    const out = this.voiceOut(vol, pan, lp, o.rev ?? 1);
    const t = now + 0.004 + (o.delay || 0);
    const s = new Voice(c, out, t, P);
    try { def.fn(s, o); } catch (e) { console.error('[audio] sfx failed', name, e); }
    const v = { name, start: t, end: s.end, ...out };
    this.voices.push(v);
    if (def.duck && !o.pos && performance.now() >= this.victoryUntil) this.duck(def.duck[0], def.duck[1], 0.06);
    return { duration: s.end - t, stop: (fade = 0.05) => this.steal(v, c.currentTime, fade) };
  }
  voiceOut(vol, pan, lp, rev) {
    const c = this.ctx, dry = c.createGain(); dry.gain.value = vol;
    let n = dry; const extra = [];
    if (lp) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; n.connect(f); n = f; extra.push(f); }
    if (pan) { const p = c.createStereoPanner(); p.pan.value = pan; n.connect(p); n = p; extra.push(p); }
    n.connect(this.graph.sfxIn);
    const wet = c.createGain(); wet.gain.value = vol * rev; wet.connect(this.graph.sfxRev);
    return { dry, wet, extra };
  }
  steal(v, now, fade = 0.03) {
    if (v.stolen) return;
    for (const g of [v.dry, v.wet]) { g.gain.cancelScheduledValues(now); g.gain.setValueAtTime(g.gain.value, now); g.gain.linearRampToValueAtTime(0, now + fade); }
    v.stolen = true; v.end = Math.min(v.end, now + fade);
  }
  prune(now) {
    if (!this.voices.length) return;
    this.voices = this.voices.filter(v => {
      if (now < v.end + 0.3) return true;
      for (const n of [v.dry, v.wet, ...v.extra]) { try { n.disconnect(); } catch { /* ok */ } }
      return false;
    });
  }
  spatial(p) {
    const L = this.listener, dx = (p.x ?? 0) - L.x, dz = (p.z ?? 0) - L.z, dy = ((p.y ?? L.y) - L.y) * 0.5;
    const d = Math.sqrt(dx * dx + dz * dz + dy * dy), ref = 6, max = 45;
    if (d >= max) return { gain: 0, pan: 0, lp: 0 };
    let gain = d <= ref ? 1 : Math.pow(ref / d, 1.1);
    if (d > max * 0.7) gain *= (max - d) / (max * 0.3);
    const pan = clamp(((dx * L.rx + dz * L.rz) / (d + 3)) * 1.1, -0.8, 0.8);
    const lp = d > 14 ? clamp(16000 * Math.pow(14 / d, 1.6), 2200, 16000) : 0;
    return { gain, pan, lp };
  }
  // listener: { pos|position: {x,y,z}, yaw?, right?: {x,z}, camera?: THREE.Object3D } or { x, y, z, yaw }
  setListener(l) {
    if (!l) return;
    const L = this.listener, p = l.pos || l.position || l;
    if (p && p.x != null) { L.x = p.x; L.y = p.y ?? 0; L.z = p.z ?? 0; }
    if (l.right) { const n = Math.hypot(l.right.x, l.right.z) || 1; L.rx = l.right.x / n; L.rz = l.right.z / n; }
    else if (l.yaw != null) { L.rx = Math.cos(l.yaw); L.rz = -Math.sin(l.yaw); }
    else if (l.camera && l.camera.matrixWorld) { const e = l.camera.matrixWorld.elements, n = Math.hypot(e[0], e[2]) || 1; L.rx = e[0] / n; L.rz = e[2] / n; }
  }
  update(dt, listener) { if (listener) this.setListener(listener); }

  // ------------------------------------------------------------------------------------------ babble
  // Gibberish speech for a dialogue line. Interrupts the previous line unless opts.interrupt === false.
  babble(text, o = {}) {
    const est = babbleDuration(text, o.speed ?? 1), c = this.ctx;
    if (!c || c.state !== 'running' || this.muted) return { duration: est, stop() {} };
    if (this.babbleHandle && o.interrupt !== false) this.babbleHandle.stop(0.04);
    let vol = (o.vol ?? 1) * 0.9, pan = o.pan ?? 0, lp = 0;
    if (o.pos) { const sp = this.spatial(o.pos); vol *= Math.max(0.2, sp.gain); pan = clamp(pan + sp.pan, -1, 1); lp = sp.lp; }
    const out = this.voiceOut(vol, pan, lp, 1), t = c.currentTime + 0.01;
    const duration = synthBabble(c, out, text, { t, pitch: o.pitch ?? 1, speed: o.speed ?? 1, voice: o.voice || 'cute' });
    const v = { name: '__babble', start: t, end: t + duration, ...out };
    this.voices.push(v);
    const h = { duration, stop: (fade = 0.05) => this.steal(v, c.currentTime, fade) };
    this.babbleHandle = h;
    if (!o.pos) this.duck(0.62, duration + 0.15, 0.12); // dialogue: the music steps back while someone talks
    return h;
  }

  // ------------------------------------------------------------------------------------------ music
  // 'dungeon' / 'boss' are resolved against the live Burrow floor (see the header comment).
  resolveTrack(name) {
    if (name !== 'dungeon' && name !== 'boss') return name;
    const D = gameG()?.dungeon, th = this.biomeOverride || D?.layout?.theme;
    if (name === 'boss') {
      const b = D?.boss;
      if (D && !(b && b.alive && b.introDone)) return BIOME_TRACKS[th] || 'dungeon';
      return BOSS_TRACKS[th] || 'boss';
    }
    return BIOME_TRACKS[th] || 'dungeon';
  }
  music(name, { fade = 2, restart = false, internal = false } = {}) {
    name = name ? this.resolveTrack(name) : null;
    if (name && !TRACKS[name]) { console.warn('[audio] unknown track', name); return; }
    if (!internal && this.returnT) { clearTimeout(this.returnT); this.returnT = 0; }
    this.wantTrack = name || null;
    const c = this.ctx; if (!c || c.state !== 'running') return;
    if (!restart && (this.track ? this.track.name : null) === this.wantTrack) return;
    const now = c.currentTime;
    if (this.track) { this.track.fadeOut(now, fade); this.fading.push(this.track); this.track = null; }
    if (!internal) for (const s of this.stings) if (s.stopAt > now + fade) s.fadeOut(now, Math.max(0.3, fade * 0.6));
    if (name) {
      const p = new MusicPlayer(this.graph, name, { start: now + 0.08, intensity: this.forcedIntensity ?? 0 });
      p.fadeIn(now, Math.max(0.05, fade * 0.8)); p.scheduleUntil(now + 0.5); this.track = p;
    }
  }
  stopMusic(fade = 2) { this.music(null, { fade }); }
  // One-shot cue (STINGS) on the music bus; rings out on its own.
  sting(name, { delay = 0 } = {}) {
    const def = STINGS[name]; if (!def) { console.warn('[audio] unknown sting', name); return null; }
    if (!this.ready) return null;
    const now = this.ctx.currentTime, p = new MusicPlayer(this.graph, name);
    p.fadeIn(now, 0.01); def.play(p, now + 0.05 + delay);
    p.stopAt = now + delay + def.len + 3.5;
    this.stings.push(p);
    return p;
  }
  // Debug / test override of the music intensity (null = follow the game).
  setIntensity(n) { this.forcedIntensity = n == null ? null : n; if (this.track) this.track.setIntensity(n ?? 0); }
  get intensity() { return this.track ? this.track.intensity : 0; }
  // Boss down: the boss theme gives way to the victory sting, then the floor's theme returns.
  victory() {
    this.victoryUntil = performance.now() + 3000; this.victoryShimmer = true;
    if (this.returnT) clearTimeout(this.returnT);
    const back = () => { this.returnT = 0; if (gameG()?.mode === 'dungeon') this.music('dungeon', { fade: 3, internal: true }); };
    if (!this.ready) { this.wantTrack = this.resolveTrack('dungeon'); return; }
    const now = this.ctx.currentTime;
    if (this.track) { this.track.fadeOut(now, 0.7); this.fading.push(this.track); this.track = null; this.wantTrack = null; }
    this.ducks.length = 0; this.applyDuck(now);
    this.sting('victory', { delay: 0.1 });
    this.returnT = setTimeout(back, (STINGS.victory.len - 0.4) * 1000);
  }

  // ------------------------------------------------------------------------------------------ ambience
  ambience(name, { fade = 2.5 } = {}) {
    if (name === 'dungeon') { const th = this.biomeOverride || gameG()?.dungeon?.layout?.theme; name = BIOME_AMBIENCES[th] || 'dungeon'; }
    if (name && !AMBIENCES[name]) { console.warn('[audio] unknown ambience', name); return; }
    this.wantAmb = name || null;
    const c = this.ctx; if (!c || c.state !== 'running') return;
    if ((this.amb ? this.amb.name : null) === this.wantAmb) return;
    const now = c.currentTime;
    if (this.amb) { this.amb.fadeOut(now, fade); this.fading.push(this.amb); this.amb = null; }
    if (name) { const p = new AmbiencePlayer(this.graph, name, { start: now + 0.05 }); p.fadeIn(now, fade); p.scheduleUntil(now + 0.5); this.amb = p; }
    this.setAmbienceMix({});
  }
  // Overlay layers on top of the base ambience. water: 0..1 (stream proximity).
  setAmbienceMix(mix = {}) {
    Object.assign(this.mix, mix);
    const c = this.ctx; if (!c || c.state !== 'running') return;
    const now = c.currentTime, w = this.wantAmb === 'water' ? 0 : clamp(this.mix.water ?? 0, 0, 1);
    if (w > 0.001) {
      if (!this.water) { this.water = new AmbiencePlayer(this.graph, 'water', { start: now + 0.05 }); this.water.fadeIn(now, 0.8, w); }
      else this.water.setLevel(w, now);
    } else if (this.water) {
      if (this.waterEff > 0.001) this.waterZeroAt = now;
      this.water.setLevel(0, now, 0.3);
    }
    this.waterEff = w;
  }
}

// Music director wiring to the game event bus (docs/ARCHITECTURE.md events); init() binds it to core/events.js.
// It never plays a sound the game already plays for the same event (the game routes 'sfx' events and calls
// music()/ambience() itself) — it only adds musical direction and picks context-specific variants via remap().
// Returns an unsubscribe function.
AudioSystem.prototype.bindEvents = function (Events) {
  const offs = [
    // boss encounter: a hard duck for the intro roar (the boss track itself is started by the game's music('boss'))
    Events.on('boss:spawn', () => { if (this.returnT) { clearTimeout(this.returnT); this.returnT = 0; } this.victoryUntil = 0; this.duck(0.35, 1.5, 0.05); }),
    Events.on('boss:dead', () => this.victory()),
    Events.on('mode:changed', () => { this.fightUntil = 0; }),
    // loot rarity → pickup sound tier (the loot code emits pickup_item / pickup_rare right after this event)
    Events.on('item:pickup', e => {
      const it = e?.item; if (!it) return;
      if (it.kind === 'gem') this.remap('pickup_item', 'pickup_gem');
      else if (it.rarity === 'magic') this.remap('pickup_item', 'pickup_magic');
      else if (it.rarity === 'unique' || it.rarity === 'set') this.remap('pickup_rare', 'pickup_unique');
    }),
    // quest completion shows its banner, then plays the level-up sfx: give it its own jingle
    Events.on('ui:banner', e => { if (e?.style === 'quest' && /complete/i.test(e.title || '')) this.remap('ui_levelup', 'ui_quest_done', 0.4); }),
  ];
  return () => offs.forEach(off => off && off());
};

export const Audio = new AudioSystem();
export default Audio;

// ------------------------------------------------------------------------------------------ offline rendering
// Renders one sound / track / ambience into an AudioBuffer with an OfflineAudioContext (used by ?test=audio).
//   kind: 'sfx' | 'music' | 'sting' | 'ambience' | 'babble'.  chain 'raw' = buses at unity, no limiter; 'full' = default volumes + limiter.
//   music opts: skip (bars), solo ([channels]), intensity (0..2)
export async function renderOffline(kind, name, { seconds, sampleRate = 44100, seed = 1234, opts = {}, chain = 'raw' } = {}) {
  const secs = seconds ?? (kind === 'sfx' || kind === 'babble' ? 5 : kind === 'sting' ? 7 : 8);
  const ctx = new OfflineAudioContext(2, Math.ceil(secs * sampleRate), sampleRate);
  const vols = chain === 'full' ? Object.fromEntries(Object.entries(DEFAULT_VOLUMES).map(([k, v]) => [k, curve(v)])) : {};
  const part = kind === 'sfx' || kind === 'babble' ? 'sfx' : kind === 'sting' ? 'music' : kind;
  const g = new Graph(ctx, ctx.destination, { limiter: chain === 'full', vols, parts: [part] });
  let dur = 0;
  if (kind === 'sfx' || kind === 'babble') {
    const def = SFX[name], trim = kind === 'sfx' ? (def.trim ?? 1) * (opts.vol ?? 1) : 0.9;
    const dry = ctx.createGain(), wet = ctx.createGain(); dry.gain.value = trim; wet.gain.value = trim;
    dry.connect(g.sfxIn); wet.connect(g.sfxRev);
    if (kind === 'sfx') { const s = new Voice(ctx, { dry, wet }, 0.01, opts.pitch ?? 1); def.fn(s, opts); dur = s.end - 0.01; }
    else dur = synthBabble(ctx, { dry, wet }, name, { t: 0.01, ...opts });
  } else if (kind === 'music') {
    const p = new MusicPlayer(g, name, { seed, start: 0.02, intensity: opts.intensity || 0 }); p.fadeIn(0, 0.01);
    if (opts.skip) p.skip(opts.skip); if (opts.solo) p.solo(opts.solo);
    for (let i = 0; i < 40 && p.nextBar < secs; i++) p.scheduleUntil(secs);
    dur = secs;
  } else if (kind === 'sting') {
    const p = new MusicPlayer(g, name, { seed }); p.fadeIn(0, 0.01);
    STINGS[name].play(p, 0.05); dur = secs;
  } else if (kind === 'ambience') {
    const p = new AmbiencePlayer(g, name, { seed, start: 0.02 }); p.fadeIn(0, 0.01); p.scheduleUntil(secs); dur = secs;
  }
  const buffer = await ctx.startRendering();
  return { buffer, dur };
}
