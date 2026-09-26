// Animal-Crossing-style gibberish speech. One formant voice per utterance (osc + breath → F1/F2/F3 band-passes)
// whose pitch, formants and amplitude are automated per character, plus a noise channel for consonant onsets.
// Every letter has its own little pitch "key" (like Animalese), with a falling sentence contour, a lift on "!"
// and a rise at the end of questions. Cheap: ~12 nodes per line regardless of length.
import { noiseBuffer } from './core.js';

const VOW = { a: [820, 1300, 2700], e: [500, 1950, 2750], i: [330, 2350, 3000], o: [540, 950, 2500], u: [380, 850, 2350] };
export const VOICES = {
  cute: { f0: 290, form: 1.12, type: 'sawtooth', breath: 0.05 },   // default villager
  kid: { f0: 370, form: 1.22, type: 'sawtooth', breath: 0.04 },    // Rosie
  deep: { f0: 150, form: 0.9, type: 'sawtooth', breath: 0.07 },    // bear, tanuki
  squeak: { f0: 540, form: 1.3, type: 'triangle', breath: 0.03 },  // mouse, bird
  dog: { f0: 230, form: 1.0, type: 'sawtooth', breath: 0.1 },      // Chewy / Shadow "talking"
};
const SIB = 'szcxjç', FRIC = 'fvh', PLOS = 'pbtdkgq', SOFT = 'mnlrwy';
const SYL = 0.068;
const isLetter = ch => /[\p{L}\p{N}]/u.test(ch);

export function babbleDuration(text, speed = 1) {
  let d = 0;
  for (const ch of String(text).slice(0, 220)) {
    if (ch === ' ' || ch === '\n') d += 0.6; else if (',;:、'.includes(ch)) d += 2; else if ('.!?…。！？'.includes(ch)) d += 3.2; else if (isLetter(ch)) d += 1;
  }
  return (d * SYL) / speed + 0.1;
}

const SYLS = ['ka', 'po', 'mi', 'ne', 'ru', 'to', 'ya', 'chi', 'su', 'wa', 'ko', 'ni', 'bu', 'ho', 'ri', 'pa', 'mo', 'yu', 'ta', 'no', 'pe', 'fu'];
export function gibberish(words = 2 + ((Math.random() * 4) | 0)) {
  const out = [];
  for (let w = 0; w < words; w++) { let s = ''; const n = 1 + ((Math.random() * 3) | 0); for (let i = 0; i < n; i++) s += SYLS[(Math.random() * SYLS.length) | 0]; out.push(s); }
  return out.join(' ') + ['!', '?', '.', '~', '!'][(Math.random() * 5) | 0];
}

// out = { dry, wet }. Returns duration in seconds.
export function babble(ctx, out, text, { t = ctx.currentTime, pitch = 1, speed = 1, vol = 1, voice = 'cute' } = {}) {
  const vp = VOICES[voice] || VOICES.cute;
  const f0 = vp.f0 * pitch, fs = vp.form * Math.pow(pitch, 0.35), syl = SYL / speed;
  const chars = [...String(text).toLowerCase()].slice(0, 220);
  const letters = chars.filter(isLetter).length;
  const q = /\?\s*$/.test(text), excl = /!/.test(text);
  const G = v => { const g = ctx.createGain(); g.gain.value = v; return g; };
  const BP = (f, qv) => { const b = ctx.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = f; b.Q.value = qv; return b; };

  const osc = ctx.createOscillator(); osc.type = vp.type;
  const nz = ctx.createBufferSource(); nz.buffer = noiseBuffer(ctx.sampleRate, 'white'); nz.loop = true;
  const src = G(1); osc.connect(src); const br = G(vp.breath); nz.connect(br); br.connect(src);
  const F1 = BP(700, 5), F2 = BP(1500, 8), F3 = BP(3000 * fs, 4);
  const sum = G(1);
  for (const [f, g] of [[F1, 3.2], [F2, 2.2], [F3, 0.7]]) { const gg = G(g); src.connect(f); f.connect(gg); gg.connect(sum); }
  const body = ctx.createBiquadFilter(); body.type = 'lowpass'; body.frequency.value = f0 * 1.6; const bg = G(0.45); osc.connect(body); body.connect(bg); bg.connect(sum);
  const env = G(0); sum.connect(env);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5200; env.connect(lp);
  const cbp = BP(3000, 1.5), cg = G(0); nz.connect(cbp); cbp.connect(cg);
  const master = G(vol * 0.21); lp.connect(master); cg.connect(master);
  master.connect(out.dry);
  if (out.wet) { const w = G(0.12); master.connect(w); w.connect(out.wet); }

  let tt = t + 0.01, li = 0;
  env.gain.setValueAtTime(0, t); cg.gain.setValueAtTime(0, t);
  osc.frequency.setValueAtTime(f0, t);
  for (const ch of chars) {
    if (ch === ' ' || ch === '\n') { tt += syl * 0.6; continue; }
    if (',;:、'.includes(ch)) { tt += syl * 2; continue; }
    if ('.!?…。！？'.includes(ch)) { tt += syl * 3.2; continue; }
    if (!isLetter(ch)) continue;
    const code = ch.codePointAt(0), isV = 'aeiouy'.includes(ch);
    const vk = isV ? (ch === 'y' ? 'i' : ch) : 'aeiou'[code % 5];
    const [a1, a2] = VOW[vk];
    const prog = li / Math.max(1, letters - 1); li++;
    let semi = [0, 2, 4, 5, 7, 9][(code * 7) % 6] * 0.6 - prog * 2.5 + (excl ? 2 : 0);
    if (q && prog > 0.7) semi += (prog - 0.7) * 20;
    const f = f0 * Math.pow(2, semi / 12) * (1 + (Math.random() - 0.5) * 0.03);
    const d = syl * (isV ? 1 : 0.88) * (0.9 + Math.random() * 0.2);
    let vs = tt;
    if (!isV) {
      let cf = 0, cl = 0, cd = 0;
      if (SIB.includes(ch)) { cf = 5200; cl = 0.3; cd = 0.045; }
      else if (FRIC.includes(ch)) { cf = 2400; cl = 0.22; cd = 0.035; }
      else if (PLOS.includes(ch)) { cf = 1800; cl = 0.4; cd = 0.012; }
      else if (!SOFT.includes(ch)) { cf = 3000; cl = 0.1; cd = 0.02; }
      if (cl) {
        cd = Math.min(cd, d * 0.7);
        cbp.frequency.setValueAtTime(cf * fs, tt);
        cg.gain.setValueAtTime(0, tt); cg.gain.linearRampToValueAtTime(cl, tt + 0.004); cg.gain.linearRampToValueAtTime(0, tt + cd);
        vs = tt + cd * 0.6;
      }
    }
    osc.frequency.setValueAtTime(f * 0.94, tt); osc.frequency.linearRampToValueAtTime(f, tt + d * 0.35);
    F1.frequency.setValueAtTime(a1 * fs, tt); F2.frequency.setValueAtTime(a2 * fs, tt);
    const pk = isV ? 1 : SOFT.includes(ch) ? 0.75 : 0.9;
    env.gain.setValueAtTime(0, vs); env.gain.linearRampToValueAtTime(pk, vs + 0.012);
    env.gain.linearRampToValueAtTime(pk * 0.75, tt + d * 0.6); env.gain.linearRampToValueAtTime(0, tt + d * 0.92);
    tt += d;
  }
  const end = tt + 0.08;
  osc.start(t); nz.start(t, Math.random() * 3); osc.stop(end); nz.stop(end);
  return end - t;
}
