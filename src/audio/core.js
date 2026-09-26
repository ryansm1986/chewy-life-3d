// Low-level Web Audio building blocks shared by sfx / music / ambience / babble.
// Everything takes an explicit BaseAudioContext + destination, so a sound renders identically in the live
// AudioContext and in an OfflineAudioContext (used by the ?test=audio render check).

export const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
export const ftom = f => 69 + 12 * Math.log2(f / 440);
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const rnd = (a, b) => a + Math.random() * (b - a);
export const pick = (arr, r = Math.random) => arr[Math.floor(r() * arr.length)];
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------------------------------ buffers
// AudioBuffers are context-independent, so they are cached per sample rate and shared by every context.
const bufCache = new Map();
function cached(key, make) { let b = bufCache.get(key); if (!b) { b = make(); bufCache.set(key, b); } return b; }
function makeBuffer(sr, len, ch = 1) { return new AudioBuffer({ length: Math.max(1, len | 0), numberOfChannels: ch, sampleRate: sr }); }

// 4 s seamless noise loops: white / pink / brown, normalised to ~0.25 RMS so colours are level-comparable.
export function noiseBuffer(sr, color = 'white') {
  return cached(`noise|${sr}|${color}`, () => {
    const len = sr * 4, fade = Math.floor(sr * 0.25), tot = len + fade, d = new Float32Array(tot);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, br = 0;
    for (let i = 0; i < tot; i++) {
      const w = Math.random() * 2 - 1;
      if (color === 'pink') {
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362; b6 = w * 0.115926;
      } else if (color === 'brown') { br = (br + 0.02 * w) / 1.02; d[i] = br; }
      else d[i] = w;
    }
    const out = new Float32Array(len);
    for (let i = 0; i < len; i++) out[i] = d[i];
    for (let i = 0; i < fade; i++) { const x = (i / fade) * Math.PI * 0.5; out[i] = d[i] * Math.sin(x) + d[len + i] * Math.cos(x); }
    let mean = 0; for (let i = 0; i < len; i++) mean += out[i]; mean /= len;
    let ss = 0; for (let i = 0; i < len; i++) { out[i] -= mean; ss += out[i] * out[i]; }
    const k = 0.25 / Math.sqrt(ss / len);
    for (let i = 0; i < len; i++) out[i] = clamp(out[i] * k, -1, 1);
    const b = makeBuffer(sr, len); b.copyToChannel(out, 0); return b;
  });
}

// Generated stereo impulse response: pre-delay, a few early reflections, then a decaying noise tail
// that gets progressively darker (bright → dark one-pole lowpass), which reads as a soft, woody space.
export function impulse(sr, { dur = 2.6, rt = 2.2, pre = 0.014, bright = 0.55, dark = 0.1, er = 7, seed = 7 } = {}) {
  return cached(`ir|${sr}|${dur}|${rt}|${pre}|${bright}|${dark}|${er}|${seed}`, () => {
    const len = Math.floor(sr * dur), b = makeBuffer(sr, len, 2), rng = mulberry32(seed);
    const p0 = Math.floor(pre * sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = new Float32Array(len); let l1 = 0, l2 = 0;
      for (let i = p0; i < len; i++) {
        const t = (i - p0) / sr, k = i / len;
        const a = bright + (dark - bright) * Math.min(1, t / rt);
        l1 += a * ((rng() * 2 - 1) - l1); l2 += a * (l1 - l2);
        const env = Math.exp((-6.9 * t) / rt) * (k > 0.85 ? (1 - k) / 0.15 : 1) * Math.min(1, t / 0.02 + 0.15);
        d[i] = l2 * env;
      }
      for (let r = 0; r < er; r++) {
        const ti = Math.floor((pre + 0.003 + rng() * 0.045) * sr);
        if (ti < len) d[ti] += (rng() < 0.5 ? -1 : 1) * 0.35 * (1 - r / er);
      }
      b.copyToChannel(d, ch);
    }
    return b;
  });
}

// Karplus-Strong plucked strings, one cached buffer per (kind, midi note). Tuning error from the integer
// delay line is corrected by the returned playbackRate.
const KS = {
  koto: { t60: 2.3, bright: 0.72, s: 0.45, pick: 0.13, max: 2.8 },
  shamisen: { t60: 1.0, bright: 0.93, s: 0.2, pick: 0.07, max: 1.6 },
  harp: { t60: 2.8, bright: 0.38, s: 0.5, pick: 0.27, max: 3.2 },
  pizz: { t60: 0.85, bright: 0.3, s: 0.5, pick: 0.21, max: 1.3 },
};
export function ksBuffer(sr, midi, kind = 'koto') {
  return cached(`ks|${sr}|${kind}|${midi}`, () => {
    const p = KS[kind] || KS.koto, f = mtof(midi);
    const N = Math.max(2, Math.floor(sr / f - p.s)), fEff = sr / (N + p.s);
    const t60 = p.t60 * Math.pow(220 / f, 0.3);
    const g = Math.pow(0.001, 1 / (fEff * t60));
    const len = Math.floor(sr * Math.min(p.max, t60 * 1.05 + 0.08));
    const d = new Float32Array(len), rng = mulberry32(midi * 7919 + kind.length * 31);
    const ex = new Float32Array(N); let lp = 0, mean = 0;
    for (let i = 0; i < N; i++) { lp += p.bright * ((rng() * 2 - 1) - lp); ex[i] = lp; mean += lp; }
    mean /= N; for (let i = 0; i < N; i++) ex[i] -= mean;
    const pk = Math.max(1, Math.floor(N * p.pick));
    for (let i = N - 1; i >= pk; i--) ex[i] -= ex[i - pk];
    const s0 = 1 - p.s, s1 = p.s;
    for (let n = 0; n < len; n++) {
      let y = n < N ? ex[n] : 0;
      if (n >= N) y += g * (s0 * d[n - N] + s1 * (n > N ? d[n - N - 1] : 0));
      d[n] = y;
    }
    let pk2 = 0; for (let i = 0; i < len; i++) pk2 = Math.max(pk2, Math.abs(d[i]));
    const k = 0.9 / (pk2 || 1), fade = Math.floor(sr * 0.04);
    for (let i = 0; i < len; i++) d[i] *= k * (i > len - fade ? (len - i) / fade : 1);
    const b = makeBuffer(sr, len); b.copyToChannel(d, 0);
    return { buf: b, rate: f / fEff };
  });
}

// ------------------------------------------------------------------------------------------ mix graph
// master:  buses → masterIn → hp 28Hz → master vol → mute → compressor → soft clip → destination
// music:   musicIn → duck → lowpass 7.5k → music vol → masterIn     (hall reverb returns into musicIn)
// sfx:     sfxIn → sfx vol → masterIn                              (room reverb returns into sfxIn)
// amb:     ambIn → amb vol → masterIn                              (cave/air reverb returns into ambIn)
export class Graph {
  constructor(ctx, dest = ctx.destination, { limiter = true, vols = {}, parts = ['music', 'sfx', 'ambience'] } = {}) {
    this.ctx = ctx;
    const G = v => { const g = ctx.createGain(); g.gain.value = v; return g; };
    this.masterIn = G(1);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 28; hp.Q.value = 0;
    this.master = G(vols.master ?? 1); this.muteG = G(1);
    this.masterIn.connect(hp); hp.connect(this.master); this.master.connect(this.muteG);
    let tail = this.muteG;
    if (limiter) {
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -10; comp.knee.value = 8; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.25;
      const clip = ctx.createWaveShaper(); clip.curve = softClipCurve(); clip.oversample = '2x';
      tail.connect(comp); comp.connect(clip); tail = clip; this.comp = comp;
    }
    tail.connect(dest); this.out = tail;
    const conv = (ir, ret, into) => { const c = ctx.createConvolver(); c.buffer = ir; const s = G(1), r = G(ret); s.connect(c); c.connect(r); r.connect(into); return s; };
    const sr = ctx.sampleRate;
    this.buses = {};
    if (parts.includes('music')) {
      this.musicIn = G(1); this.duckG = G(1);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 7500; lp.Q.value = -1;
      const shelf = ctx.createBiquadFilter(); shelf.type = 'highshelf'; shelf.frequency.value = 3500; shelf.gain.value = -2;
      this.buses.music = G(vols.music ?? 1);
      this.musicIn.connect(this.duckG); this.duckG.connect(lp); lp.connect(shelf); shelf.connect(this.buses.music); this.buses.music.connect(this.masterIn);
      this.musicRev = conv(impulse(sr, { dur: 3.2, rt: 2.7, pre: 0.02, bright: 0.45, dark: 0.08, seed: 11 }), 0.85, this.musicIn);
    }
    if (parts.includes('sfx')) {
      this.sfxIn = G(1); this.buses.sfx = G(vols.sfx ?? 1);
      this.sfxIn.connect(this.buses.sfx); this.buses.sfx.connect(this.masterIn);
      this.sfxRev = conv(impulse(sr, { dur: 1.6, rt: 1.25, pre: 0.008, bright: 0.5, dark: 0.12, seed: 5 }), 0.8, this.sfxIn);
    }
    if (parts.includes('ambience')) {
      this.ambIn = G(1); this.buses.ambience = G(vols.ambience ?? 1);
      this.ambIn.connect(this.buses.ambience); this.buses.ambience.connect(this.masterIn);
      this.ambRev = conv(impulse(sr, { dur: 2.8, rt: 2.3, pre: 0.03, bright: 0.35, dark: 0.07, er: 10, seed: 23 }), 0.8, this.ambIn);
    }
  }
  gainFor(bus) { return bus === 'master' ? this.master : this.buses[bus]; }
}

let _clip = null;
function softClipCurve() {
  if (_clip) return _clip;
  const n = 2048, c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1, a = Math.abs(x);
    c[i] = a < 0.7 ? x : Math.sign(x) * (0.7 + 0.3 * Math.tanh((a - 0.7) / 0.3));
  }
  return (_clip = c);
}

// ------------------------------------------------------------------------------------------ Voice
// A tiny synthesis DSL. A Voice is bound to (ctx, out = {dry, wet}, start time t0, pitch multiplier P).
// Every method takes an options object with times relative to t0 (`at`), schedules nodes and returns the
// absolute end time; `voice.end` tracks the latest end so callers know how long the sound lasts.
// Common options:
//   at      start offset (s)            v      peak level          pan   -1..1 (adds a StereoPanner)
//   a,h,d   attack / hold / decay (s)   lin    linear (not exponential) decay
//   amp     [[dt, level], ...] custom amplitude contour (overrides a/h/d)
//   f,f2,glide  pitch + exponential glide;  pts [[dt,f],...] pitch contour;  fixed  ignore P
//   lp/hp/bp (+lp2/hp2/bp2 sweep target, lt/ht/bt sweep time, lq/hq/bq Q)   rev  reverb send amount
//   vib [rate, cents, delay]            am [rate, depth, type]   fmod [rate, hz, type]
export class Voice {
  constructor(ctx, out, t0, P = 1) { this.ctx = ctx; this.out = out; this.t0 = t0; this.P = P; this.end = t0; this.nyq = ctx.sampleRate * 0.45; }
  hz(f, o) { return clamp(f * (o && o.fixed ? 1 : this.P), 8, this.nyq); }
  mark(t) { if (t > this.end) this.end = t; return t; }
  send(node, o) {
    let n = node;
    if (o.pan) { const p = this.ctx.createStereoPanner(); p.pan.value = clamp(o.pan, -1, 1); n.connect(p); n = p; }
    n.connect(this.out.dry);
    if (o.rev && this.out.wet) { const g = this.ctx.createGain(); g.gain.value = o.rev; n.connect(g); g.connect(this.out.wet); }
  }
  dur(o) { return o.amp ? o.amp[o.amp.length - 1][0] : (o.a ?? 0.004) + (o.h || 0) + (o.d ?? 0.2); }
  amp(param, t, o, v) {
    if (o.amp) {
      param.setValueAtTime(0, t); let last = t;
      for (const [dt, l] of o.amp) { param.linearRampToValueAtTime(l * v, t + dt); last = t + dt; }
      if (o.amp[o.amp.length - 1][1] !== 0) { last += 0.02; param.linearRampToValueAtTime(0, last); }
      return last;
    }
    const a = Math.max(0.001, o.a ?? 0.004), h = o.h || 0, d = Math.max(0.005, o.d ?? 0.2), e = t + a + h + d;
    param.setValueAtTime(0, t);
    param.linearRampToValueAtTime(v, t + a);
    if (h) param.setValueAtTime(v, t + a + h);
    if (o.lin) { param.linearRampToValueAtTime(0, e); return e; }
    param.exponentialRampToValueAtTime(Math.max(v * 1e-3, 1e-6), e);
    param.linearRampToValueAtTime(0, e + 0.005);
    return e + 0.005;
  }
  freq(param, t, o, dur) {
    if (o.pts) {
      param.setValueAtTime(this.hz(o.pts[0][1], o), t);
      for (let i = 1; i < o.pts.length; i++) {
        const [dt, f] = o.pts[i];
        if (o.linf) param.linearRampToValueAtTime(this.hz(f, o), t + dt); else param.exponentialRampToValueAtTime(this.hz(f, o), t + dt);
      }
    } else {
      param.setValueAtTime(this.hz(o.f, o), t);
      if (o.f2) param.exponentialRampToValueAtTime(this.hz(o.f2, o), t + (o.glide ?? dur));
    }
  }
  filt(node, t, o, dur) {
    let n = node;
    for (const [k, type] of [['lp', 'lowpass'], ['hp', 'highpass'], ['bp', 'bandpass']]) {
      if (!o[k]) continue;
      const f = this.ctx.createBiquadFilter(); f.type = type;
      const m = o.ffix ? 1 : this.P;
      f.frequency.setValueAtTime(clamp(o[k] * m, 20, this.nyq), t);
      if (o[k + '2']) f.frequency.exponentialRampToValueAtTime(clamp(o[k + '2'] * m, 20, this.nyq), t + (o[k[0] + 't'] ?? dur));
      const q = o[k[0] + 'q']; if (q != null) f.Q.value = q;
      n.connect(f); n = f;
    }
    return n;
  }
  mod(target, t, end, [rate, depth, type = 'sine']) {
    const l = this.ctx.createOscillator(); l.type = type; l.frequency.value = rate;
    const g = this.ctx.createGain(); g.gain.value = depth; l.connect(g); g.connect(target);
    l.start(t); l.stop(end + 0.03);
  }
  withAm(node, t, end, o) {
    if (!o.am) return node;
    const [rate, depth, type] = o.am, g = this.ctx.createGain(); g.gain.value = 1 - depth;
    node.connect(g); this.mod(g.gain, t, end, [rate, depth, type]); return g;
  }
  // Oscillator tone. `stack: [[type, detuneCents, level, ratio], ...]` layers several oscillators.
  tone(o) {
    const c = this.ctx, t = this.t0 + (o.at || 0), v = o.v ?? 0.3, dur = this.dur(o), end = t + dur + 0.01;
    const stack = o.stack || [[o.type || 'sine', o.detune || 0, 1, 1]];
    const mix = c.createGain(); const oscs = [];
    for (const [type, det, lvl, ratio = 1] of stack) {
      const osc = c.createOscillator(); osc.type = type; if (det) osc.detune.value = det;
      if (ratio !== 1) { this.freq(osc.frequency, t, { ...o, pts: o.pts?.map(([dt, f]) => [dt, f * ratio]), f: o.f * ratio, f2: o.f2 && o.f2 * ratio }, dur); }
      else this.freq(osc.frequency, t, o, dur);
      if (o.vib) {
        const [rate, cents, delay = 0] = o.vib, l = c.createOscillator(), lg = c.createGain();
        l.frequency.value = rate; lg.gain.setValueAtTime(0, t); lg.gain.setValueAtTime(0, t + delay); lg.gain.linearRampToValueAtTime(cents, t + delay + 0.18);
        l.connect(lg); lg.connect(osc.detune); l.start(t); l.stop(end + 0.03);
      }
      if (o.fmod) this.mod(osc.frequency, t, end, o.fmod);
      if (stack.length > 1) { const g = c.createGain(); g.gain.value = lvl; osc.connect(g); g.connect(mix); } else osc.connect(mix);
      oscs.push(osc);
    }
    const g = c.createGain();
    this.withAm(this.filt(mix, t, o, dur), t, end, o).connect(g);
    const e = this.amp(g.gain, t, o, v);
    this.send(g, o);
    for (const osc of oscs) { osc.start(t); osc.stop(e + 0.02); }
    return this.mark(e);
  }
  // Filtered noise. `f`/`pts` set the main filter (type `ft`, default bandpass, Q `q`).
  noise(o) {
    const c = this.ctx, t = this.t0 + (o.at || 0), v = o.v ?? 0.3, dur = this.dur(o), end = t + dur + 0.01;
    const src = c.createBufferSource(); src.buffer = noiseBuffer(c.sampleRate, o.color || 'white'); src.loop = true;
    if (o.rate) src.playbackRate.value = o.rate;
    let n = src;
    if (o.f || o.pts) {
      const f = c.createBiquadFilter(); f.type = o.ft || 'bandpass';
      this.freq(f.frequency, t, o, dur); if (o.q != null) f.Q.value = o.q; else if (f.type === 'bandpass') f.Q.value = 1;
      n.connect(f); n = f;
    }
    const g = c.createGain();
    this.withAm(this.filt(n, t, o, dur), t, end, o).connect(g);
    const e = this.amp(g.gain, t, o, v);
    this.send(g, o);
    src.start(t, Math.random() * 3); src.stop(e + 0.02);
    return this.mark(e);
  }
  // 2-operator FM (bells, tines, metal). index = modulation depth as a multiple of the modulator frequency,
  // decaying towards index2 with time constant id.
  fm(o) {
    const c = this.ctx, t = this.t0 + (o.at || 0), v = o.v ?? 0.2, dur = this.dur(o);
    const car = c.createOscillator(); this.freq(car.frequency, t, o, dur);
    const mod = c.createOscillator(), f = this.hz(o.f ?? o.pts[0][1], o), mf = f * (o.ratio ?? 2);
    mod.frequency.value = mf;
    const mg = c.createGain(); mg.gain.setValueAtTime((o.index ?? 2) * mf, t); mg.gain.setTargetAtTime((o.index2 ?? 0) * mf, t, (o.id ?? 0.12) / 3);
    mod.connect(mg); mg.connect(car.frequency);
    const g = c.createGain(); this.filt(car, t, o, dur).connect(g);
    const e = this.amp(g.gain, t, o, v);
    this.send(g, o);
    car.start(t); mod.start(t); car.stop(e + 0.02); mod.stop(e + 0.02);
    return this.mark(e);
  }
  // Additive bell: partials [[ratio, amp, decayMul], ...] (default: glassy furin-like).
  bell(o) {
    const c = this.ctx, t = this.t0 + (o.at || 0), v = o.v ?? 0.15, d = o.d ?? 1;
    const parts = o.partials || [[1, 1, 1], [2.76, 0.42, 0.5], [5.4, 0.2, 0.28], [8.93, 0.08, 0.16]];
    const sum = c.createGain(); let end = t;
    for (const [r, a, dm] of parts) {
      const ff = this.hz(o.f * r, o); if (ff >= this.nyq * 0.95) continue;
      const osc = c.createOscillator(); osc.frequency.value = ff; if (o.detune) osc.detune.value = o.detune * r;
      const g = c.createGain(); osc.connect(g); g.connect(sum);
      const e = this.amp(g.gain, t, { a: o.a ?? 0.002, d: d * dm }, v * a);
      osc.start(t); osc.stop(e + 0.02); end = Math.max(end, e);
    }
    this.send(this.filt(sum, t, o, d), o);
    return this.mark(end);
  }
  // Karplus-Strong pluck. m = midi (float ok). dur = damp the string after dur seconds. bend [[dt, semis], ...].
  pluck(o) {
    const c = this.ctx, t = this.t0 + (o.at || 0), v = o.v ?? 0.4;
    const eff = (o.m ?? ftom(o.f)) + 12 * Math.log2(o.fixed ? 1 : this.P), mi = Math.round(eff);
    const ks = ksBuffer(c.sampleRate, mi, o.kind || 'koto');
    const src = c.createBufferSource(); src.buffer = ks.buf;
    const base = ks.rate * Math.pow(2, (eff - mi) / 12);
    src.playbackRate.setValueAtTime(base, t);
    if (o.bend) for (const [dt, st] of o.bend) src.playbackRate.linearRampToValueAtTime(base * Math.pow(2, st / 12), t + dt);
    const g = c.createGain(); this.filt(src, t, { ...o, ffix: true }, 1).connect(g);
    const natural = t + ks.buf.duration / base;
    let end;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.0015);
    if (o.dur && t + o.dur < natural - 0.1) { g.gain.setValueAtTime(v, t + o.dur); g.gain.setTargetAtTime(0, t + o.dur, 0.035); end = t + o.dur + 0.2; }
    else end = natural;
    this.send(g, o); src.start(t); src.stop(end + 0.02);
    return this.mark(end);
  }
  // Formant voice (barks, meows, wails): source (osc + breath noise) → parallel band-pass formants → env.
  //  f: [[dt,hz],...] pitch contour   form: [[dt,[f1,f2,f3]],...]   amp: [[dt,level],...]
  //  q: [q1,q2,q3]  fg: formant gains  breath: noise amount  rough: growl AM depth (roughF Hz)  body: direct lowpassed source
  voice(o) {
    const c = this.ctx, t = this.t0 + (o.at || 0), v = o.v ?? 0.4, dur = o.amp[o.amp.length - 1][0], end = t + dur + 0.03;
    const osc = c.createOscillator(); osc.type = o.type || 'sawtooth';
    this.freq(osc.frequency, t, { pts: o.f, fixed: o.fixed }, dur);
    if (o.vib) {
      const [rate, cents, delay = 0] = o.vib, l = c.createOscillator(), lg = c.createGain();
      l.frequency.value = rate; lg.gain.setValueAtTime(0, t + delay); lg.gain.linearRampToValueAtTime(cents, t + delay + 0.2);
      l.connect(lg); lg.connect(osc.detune); l.start(t); l.stop(end);
    }
    let src = c.createGain(); osc.connect(src);
    if (o.rough) src = this.withAm(src, t, end, { am: [o.roughF || 40, o.rough, 'sine'] });
    let nz = null, ng = null;
    if (o.breath) {
      nz = c.createBufferSource(); nz.buffer = noiseBuffer(c.sampleRate, 'white'); nz.loop = true;
      ng = c.createGain(); ng.gain.value = o.breath; nz.connect(ng);
    }
    const sum = c.createGain(), qs = o.q || [6, 8, 10], fg = o.fg || [1, 0.6, 0.3], nF = o.form[0][1].length;
    for (let k = 0; k < nF; k++) {
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = qs[k] ?? 8;
      bp.frequency.setValueAtTime(this.hz(o.form[0][1][k], o), t);
      for (let i = 1; i < o.form.length; i++) bp.frequency.linearRampToValueAtTime(this.hz(o.form[i][1][k], o), t + o.form[i][0]);
      const g = c.createGain(); g.gain.value = (fg[k] ?? 0.3) * (o.makeup ?? 4);
      src.connect(bp); if (ng) ng.connect(bp); bp.connect(g); g.connect(sum);
    }
    if (o.body) {
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = this.hz(o.bodyF || 700, o);
      const g = c.createGain(); g.gain.value = o.body; src.connect(lp); lp.connect(g); g.connect(sum);
    }
    const eg = c.createGain(); this.filt(sum, t, o, dur).connect(eg);
    const e = this.amp(eg.gain, t, { amp: o.amp }, v);
    this.send(eg, o);
    osc.start(t); osc.stop(e + 0.02); if (nz) { nz.start(t, Math.random() * 3); nz.stop(e + 0.02); }
    return this.mark(e);
  }
  // Little random fairy-dust tinkles from a pentatonic set.
  sparkle(o = {}) {
    const n = o.n ?? 5, base = o.base ?? 2093, sc = [0, 2, 4, 7, 9, 12, 14, 16], v = o.v ?? 0.05;
    for (let i = 0; i < n; i++) {
      const f = base * Math.pow(2, sc[(Math.random() * sc.length) | 0] / 12);
      this.bell({ at: (o.at || 0) + (o.spread ?? 0.4) * (i / n) + Math.random() * 0.03, f, d: o.d ?? 0.35, v: v * (1 - 0.4 * (i / n)), rev: o.rev ?? 0.4, pan: (Math.random() * 2 - 1) * 0.5 });
    }
    return this.end;
  }
}
