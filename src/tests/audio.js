// Audio audition page: /?test=audio
// Buttons for every SFX / music track / ambience, volume sliders, babble tester, stress + positional demos.
// window.renderCheck() renders everything with an OfflineAudioContext and reports peak / RMS / duration /
// spectral centroid / high-frequency energy, flagging silent, clipping, overly long or harsh sounds.
import { Audio, renderOffline, SFX_GROUPS, SFX_NAMES, TRACK_NAMES, STING_NAMES, AMBIENCE_NAMES, BABBLE_VOICES, DEFAULT_VOLUMES, gibberish } from '../audio/audio.js';

const LONG_OK = { player_die: 3.2, ghost_wail: 2.6, howl: 2.6, portal: 2.8, build_complete: 2.8, ui_levelup: 2.8, waypoint: 2.8, villager_chatter: 3.5, pickup_rare: 2.6, chest_open: 2.6, ui_quest: 2.6, ui_quest_done: 2.6, pickup_unique: 2.8, victory_sfx: 2.8, env_wave: 3.6, env_temple_bell: 3,
  tengu_storm: 3.4, umi_rise: 2.7, umi_wave: 3.1, umi_tide: 4.1, umi_defeat: 3.7 };

export default function () {
  document.title = 'Chewy Life 3D — Audio';
  const css = document.createElement('style');
  css.textContent = `
    :root { --cream:#fff6e8; --ink:#4a2c2a; --pink:#ff8fb0; --gold:#ffcf4a; --mint:#8fe0c0; --sky:#8fd0ff; }
    html,body { margin:0; background:#fdeedd; color:var(--ink); font:14px/1.4 system-ui, 'Segoe UI', sans-serif; }
    main { max-width:1180px; margin:0 auto; padding:18px 16px 60px; }
    h1 { font-size:24px; margin:0 0 4px; } h2 { font-size:15px; margin:18px 0 8px; text-transform:uppercase; letter-spacing:.06em; opacity:.75; }
    .status { display:inline-block; padding:3px 10px; border-radius:99px; background:#ffd9d9; font-size:12px; margin-left:8px; }
    .status.on { background:var(--mint); }
    .card { background:var(--cream); border-radius:16px; padding:12px 14px; box-shadow:0 2px 0 #e8c9a8; margin-bottom:12px; }
    .row { display:flex; flex-wrap:wrap; gap:6px; align-items:center; }
    button { border:0; border-radius:10px; padding:7px 11px; background:#fff; color:var(--ink); font:inherit; cursor:pointer; box-shadow:0 2px 0 #e3c3a0; transition:transform .08s; }
    button:hover { background:#fff3c4; } button:active { transform:translateY(2px); box-shadow:none; }
    button.on { background:var(--gold); } button.big { background:var(--pink); color:#fff; font-weight:600; }
    label { display:inline-flex; gap:6px; align-items:center; margin-right:14px; }
    input[type=range] { width:120px; accent-color:var(--pink); }
    input[type=text] { flex:1; min-width:220px; padding:7px 10px; border-radius:10px; border:2px solid #efd4b6; font:inherit; background:#fff; }
    select { padding:6px; border-radius:8px; border:2px solid #efd4b6; }
    .grp { margin:6px 0 10px; } .grp b { display:block; font-size:12px; opacity:.6; margin-bottom:4px; }
    table { border-collapse:collapse; width:100%; font-size:12px; } td,th { padding:3px 6px; border-bottom:1px solid #f0dcc4; text-align:left; }
    td.bad { color:#c0392b; font-weight:700; } canvas { display:block; }
  `;
  document.head.appendChild(css);
  const main = document.createElement('main');
  document.body.appendChild(main);
  const el = (tag, props = {}, ...kids) => { const e = document.createElement(tag); Object.assign(e, props); for (const k of kids) e.append(k); return e; };
  const btn = (text, fn, cls = '') => el('button', { textContent: text, className: cls, onclick: fn });

  Audio.init();
  const status = el('span', { className: 'status', textContent: 'click anywhere to start audio' });
  main.append(el('h1', { textContent: 'Chewy Life 3D — procedural audio' }, status));
  setInterval(() => { status.textContent = Audio.ready ? 'audio running' : 'click anywhere to start audio'; status.className = 'status' + (Audio.ready ? ' on' : ''); }, 300);

  // ---- mixer
  const mixer = el('div', { className: 'card row' });
  for (const bus of ['master', 'music', 'sfx', 'ambience']) {
    const r = el('input', { type: 'range', min: 0, max: 1, step: 0.01, value: Audio.getVolume(bus) });
    r.oninput = () => Audio.setVolume(bus, +r.value);
    mixer.append(el('label', { textContent: bus }, r));
  }
  const mute = btn(Audio.muted ? 'unmute' : 'mute', () => { mute.textContent = Audio.toggleMute() ? 'unmute' : 'mute'; });
  mixer.append(mute, btn('reset volumes', () => { for (const [k, v] of Object.entries(DEFAULT_VOLUMES)) Audio.setVolume(k, v); location.reload(); }));
  main.append(el('h2', { textContent: 'Mixer' }), mixer);

  // ---- music
  const mus = el('div', { className: 'card row' }), musBtns = {};
  for (const t of TRACK_NAMES) mus.append(musBtns[t] = btn(t, () => { Audio.music(t, { fade: 2 }); hl(); }));
  mus.append(btn('stop', () => { Audio.music(null, { fade: 1.5 }); hl(); }), btn('duck 1.5s', () => Audio.duck(0.3, 1.5)));
  const hl = () => { for (const [k, b] of Object.entries(musBtns)) b.classList.toggle('on', Audio.currentTrack === k); for (const [k, b] of Object.entries(ambBtns)) b.classList.toggle('on', Audio.currentAmbience === k); for (const [k, b] of Object.entries(intBtns)) b.classList.toggle('on', String(Audio.forcedIntensity) === k); };
  // intensity (combat layer on the Burrow themes; phase 2 / enrage on boss themes) + stings
  const intRow = el('div', { className: 'card row' }), intBtns = {};
  intRow.append(el('b', { textContent: 'intensity' }));
  for (const [k, n] of [['null', 'follow game'], ['0', 'calm'], ['1', 'combat / phase 2'], ['2', 'enraged']]) intRow.append(intBtns[k] = btn(n, () => { Audio.setIntensity(k === 'null' ? null : +k); hl(); }));
  intRow.append(el('b', { textContent: ' stings' }));
  for (const s of STING_NAMES) intRow.append(btn(s, () => Audio.sting(s), 'big'));
  main.append(el('h2', { textContent: 'Music (generative, crossfading)' }), mus, intRow);

  // ---- ambience
  const amb = el('div', { className: 'card row' }), ambBtns = {};
  for (const a of AMBIENCE_NAMES) amb.append(ambBtns[a] = btn(a, () => { Audio.ambience(a); hl(); }));
  const water = el('input', { type: 'range', min: 0, max: 1, step: 0.01, value: 0 });
  water.oninput = () => Audio.setAmbienceMix({ water: +water.value });
  amb.append(btn('stop', () => { Audio.ambience(null); hl(); }), el('label', { textContent: 'stream proximity (water mix)' }, water));
  main.append(el('h2', { textContent: 'Ambience' }), amb);

  // ---- sfx
  const sfx = el('div', { className: 'card' });
  const pitch = el('input', { type: 'range', min: 0.5, max: 2, step: 0.01, value: 1 });
  sfx.append(el('div', { className: 'row' }, el('label', { textContent: 'pitch' }, pitch)));
  for (const [g, names] of Object.entries(SFX_GROUPS)) {
    const row = el('div', { className: 'row' });
    for (const n of names) row.append(btn(n, () => Audio.play(n, { pitch: +pitch.value })));
    sfx.append(el('div', { className: 'grp' }, el('b', { textContent: g }), row));
  }
  main.append(el('h2', { textContent: `Sound effects (${SFX_NAMES.length})` }), sfx);

  // ---- babble
  const bab = el('div', { className: 'card row' });
  const txt = el('input', { type: 'text', value: "Hi Chewy! Rosie baked mochi today... want some? It's super squishy!" });
  const vsel = el('select'); for (const v of BABBLE_VOICES) vsel.append(el('option', { value: v, textContent: v }));
  const bp = el('input', { type: 'range', min: 0.5, max: 2, step: 0.01, value: 1 }), bs = el('input', { type: 'range', min: 0.5, max: 2, step: 0.01, value: 1 });
  bab.append(txt, vsel, el('label', { textContent: 'pitch' }, bp), el('label', { textContent: 'speed' }, bs),
    btn('speak', () => Audio.babble(txt.value, { pitch: +bp.value, speed: +bs.value, voice: vsel.value }), 'big'),
    btn('random', () => { txt.value = gibberish(4); Audio.babble(txt.value, { pitch: +bp.value, speed: +bs.value, voice: vsel.value }); }));
  main.append(el('h2', { textContent: 'Villager babble' }), bab);

  // ---- demos
  const demo = el('div', { className: 'card row' });
  demo.append(
    btn('stress: 50 hits at once', () => { for (let i = 0; i < 50; i++) Audio.play(i % 2 ? 'hit_flesh' : 'monster_hit', { force: true }); }),
    btn('combat burst', () => { const seq = ['swing', 'hit_flesh', 'monster_hit', 'swing_heavy', 'hit_crit', 'monster_die', 'pickup_gold']; seq.forEach((n, i) => setTimeout(() => Audio.play(n), i * 170)); }),
    btn('positional sweep (bark L→R)', () => { Audio.update(0, { x: 0, z: 0, yaw: 0 }); for (let i = 0; i <= 6; i++) setTimeout(() => Audio.play('bark', { pos: { x: -18 + i * 6, y: 0, z: -4 } }), i * 350); }),
    btn('distance fade (ball far→near)', () => { Audio.update(0, { x: 0, z: 0, yaw: 0 }); for (let i = 0; i <= 6; i++) setTimeout(() => Audio.play('ball_bounce', { pos: { x: 2, y: 0, z: -40 + i * 6.5 } }), i * 300); }),
    btn('footsteps walk', () => { for (let i = 0; i < 8; i++) setTimeout(() => Audio.play(['footstep_grass', 'footstep_stone', 'footstep_wood'][Math.floor(i / 3) % 3], { vol: 0.9 }), i * 280); }),
  );
  main.append(el('h2', { textContent: 'Demos' }), demo);

  // ---- render check
  const rc = el('div', { className: 'card' });
  const out = el('div');
  rc.append(el('div', { className: 'row' }, btn('run offline render check', async () => { out.textContent = 'rendering…'; const r = await window.renderCheck({ draw: out }); console.log(r); }, 'big')), out);
  main.append(el('h2', { textContent: 'Offline render check' }), rc);

  window.renderCheck = renderCheck;
  window.mixCheck = mixCheck;
  window.Audio_ = Audio;
  window.__ready = true;
}

// ------------------------------------------------------------------------------------------ analysis
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2, tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}
// A-weighting as a power factor (IEC 61672), ≈1 at 1 kHz — used for a perceptual 'loud' RMS.
function aWeight(f) {
  const f2 = f * f, ra = (12194 ** 2 * f2 * f2) / ((f2 + 20.6 ** 2) * Math.sqrt((f2 + 107.7 ** 2) * (f2 + 737.9 ** 2)) * (f2 + 12194 ** 2));
  return (ra * 1.2589) ** 2;
}
export function analyze(buf) {
  const L = buf.getChannelData(0), R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L, n = L.length, sr = buf.sampleRate;
  let peak = 0, first = -1, last = 0;
  const mono = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(Math.abs(L[i]), Math.abs(R[i])); if (a > peak) peak = a;
    mono[i] = (L[i] + R[i]) * 0.5;
    if (a > 0.002) { last = i; if (first < 0) first = i; }
  }
  if (first < 0) return { peak, rms: 0, loud: 0, dur: 0, st: 0, centroid: 0, hf: 0 };
  let ss = 0; for (let i = first; i <= last; i++) ss += mono[i] * mono[i];
  const rms = Math.sqrt(ss / (last - first + 1));
  const W = Math.floor(sr * 0.05); let st = 0;
  for (let i = first; i + W <= last + 1; i += W) { let s = 0; for (let j = 0; j < W; j++) s += mono[i + j] * mono[i + j]; st = Math.max(st, Math.sqrt(s / W)); }
  const N = 2048, re = new Float64Array(N), im = new Float64Array(N);
  let num = 0, den = 0, hi = 0, aw = 0; const hop = Math.max(N, Math.floor((last - first) / 120));
  for (let i = first; i <= last; i += hop) {
    for (let j = 0; j < N; j++) { re[j] = i + j < n ? mono[i + j] * (0.5 - 0.5 * Math.cos((2 * Math.PI * j) / (N - 1))) : 0; im[j] = 0; }
    fft(re, im);
    for (let k = 1; k < N / 2; k++) { const p = re[k] * re[k] + im[k] * im[k], f = (k * sr) / N; num += f * p; den += p; aw += p * aWeight(f); if (f > 4000) hi += p; }
  }
  return { peak, rms, loud: den ? rms * Math.sqrt(aw / den) : 0, dur: last / sr, st, centroid: den ? num / den : 0, hf: den ? hi / den : 0 };
}

function drawWave(buf, w = 180, h = 34) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'), d = buf.getChannelData(0), step = Math.ceil(d.length / w);
  g.fillStyle = '#ff8fb0';
  for (let x = 0; x < w; x++) { let m = 0; for (let j = x * step; j < Math.min(d.length, (x + 1) * step); j++) m = Math.max(m, Math.abs(d[j])); const hh = Math.max(1, m * h); g.fillRect(x, (h - hh) / 2, 1, hh); }
  g.fillStyle = 'rgba(192,57,43,.35)'; g.fillRect(0, 0, w, 1); g.fillRect(0, h - 1, w, 1);
  return c;
}

const r3 = x => Math.round(x * 1000) / 1000;
// opts: { only: ['bark', ...], music: true, ambience: true, musicSeconds: 8, draw: element, chain: 'raw'|'full' }
async function renderCheck(opts = {}) {
  const t0 = performance.now();
  const res = { sfx: {}, music: {}, ambience: {}, babble: {}, problems: [] };
  const table = opts.draw ? document.createElement('table') : null;
  if (table) { opts.draw.textContent = ''; table.innerHTML = '<tr><th>kind</th><th>name</th><th>wave</th><th>peak</th><th>rms</th><th>A-rms</th><th>maxST</th><th>dur</th><th>centroid</th><th>hf>4k</th><th>flags</th></tr>'; opts.draw.append(table); }
  const add = (kind, name, buf, a, flags) => {
    res[kind][name] = { peak: r3(a.peak), rms: r3(a.rms), loud: r3(a.loud), st: r3(a.st), dur: Math.round(a.dur * 100) / 100, centroid: Math.round(a.centroid), hf: r3(a.hf), ...(flags.length ? { flags } : {}) };
    if (flags.length) res.problems.push(`${kind}:${name} ${flags.join(',')}`);
    if (table) {
      const tr = document.createElement('tr');
      const cells = [kind, name, '', r3(a.peak), r3(a.rms), r3(a.loud), r3(a.st), a.dur.toFixed(2), Math.round(a.centroid), r3(a.hf), flags.join(' ')];
      cells.forEach((v, i) => { const td = document.createElement('td'); if (i === 2) td.append(drawWave(buf)); else td.textContent = v; if (i === 10 && v) td.className = 'bad'; tr.append(td); });
      table.append(tr);
    }
  };
  const names = opts.only || SFX_NAMES;
  for (const n of names) {
    const { buffer } = await renderOffline('sfx', n, { chain: opts.chain || 'raw' });
    const a = analyze(buffer), flags = [];
    if (a.peak < 0.02) flags.push('SILENT'); if (a.peak > 0.99) flags.push('CLIP'); if (a.dur > (LONG_OK[n] ?? 2.2)) flags.push('LONG'); if (a.hf > 0.5 && n !== 'bird_chirp') flags.push('HARSH');
    add('sfx', n, buffer, a, flags);
  }
  if (!opts.only || opts.babble) {
    const { buffer } = await renderOffline('babble', "Hi Chewy! Want some mochi? It's fresh!", { opts: { voice: 'cute' } });
    const a = analyze(buffer), flags = []; if (a.peak < 0.02) flags.push('SILENT'); if (a.peak > 0.99) flags.push('CLIP');
    add('babble', 'line', buffer, a, flags);
  }
  if (opts.music !== false && !opts.only) {
    const { TRACKS } = await import('../audio/music.js');
    for (const t of TRACK_NAMES) for (const skip of [0, 6]) for (let intensity = 0; intensity <= (skip ? TRACKS[t].maxIntensity || 0 : 0); intensity++) {
      const { buffer } = await renderOffline('music', t, { seconds: opts.musicSeconds || 8, chain: opts.chain || 'raw', opts: { skip, intensity } });
      const a = analyze(buffer), flags = [];
      if (a.rms < 0.02) flags.push('QUIET'); if (a.peak > 0.99) flags.push('CLIP'); if (a.hf > 0.3) flags.push('HARSH');
      add('music', `${t}${skip ? '@' + skip : ''}${intensity ? '!' + intensity : ''}`, buffer, a, flags);
    }
    for (const s of STING_NAMES) {
      const { buffer } = await renderOffline('sting', s, { chain: opts.chain || 'raw' });
      const a = analyze(buffer), flags = [];
      if (a.peak < 0.05) flags.push('QUIET'); if (a.peak > 0.99) flags.push('CLIP'); if (a.hf > 0.3) flags.push('HARSH');
      add('music', `sting:${s}`, buffer, a, flags);
    }
  }
  if (opts.ambience !== false && !opts.only) {
    for (const t of AMBIENCE_NAMES) {
      const { buffer } = await renderOffline('ambience', t, { seconds: 8, chain: opts.chain || 'raw' });
      const a = analyze(buffer), flags = [];
      if (a.rms < 0.005) flags.push('QUIET'); if (a.peak > 0.99) flags.push('CLIP');
      add('ambience', t, buffer, a, flags);
    }
  }
  res.ms = Math.round(performance.now() - t0);
  return res;
}

// Per-channel balance of one music track: renders each instrument channel solo.
async function mixCheck(track, { skip = 6, seconds = 10 } = {}) {
  const { TRACKS } = await import('../audio/music.js');
  const out = {};
  for (const ch of Object.keys(TRACKS[track].mix)) {
    const { buffer } = await renderOffline('music', track, { seconds, opts: { skip, solo: [ch] } });
    const a = analyze(buffer);
    out[ch] = { peak: r3(a.peak), rms: r3(a.rms), loud: r3(a.loud), st: r3(a.st), centroid: Math.round(a.centroid) };
  }
  return out;
}
