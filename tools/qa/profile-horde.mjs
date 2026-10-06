// The horde perf gate (docs/ZONES.md §7, ROADMAP Z-B5): 150- and 250-monster fights around the hero, in a Burrow floor
// and in a region, with the hero's scripted combat (Chewy's combo + skills, Moka's AoE, Poe's throws).
//
// Per world and hero, one page (?dseed=1: the fixed floor): enter the world, spawn a mixed horde of N around the hero —
// 4 Burrow + 4 region kinds incl. a skinned tanuki, the transparent kurage and the GPU-deformed kappa, packs of 10, every
// 3rd pack champions, every 5th led by a unique — all aggroed; killed horde monsters come back as fresh packs 11-15 m
// out, so the model cache and pools get exercised and every pack spawn is timed. The hero's rotation, the respawns and
// the bookkeeping run inside the frame (engine.tick → engine.render), so the CPU frame time includes them.
//
// Reports per run: CPU frame time (tick → end of render) p50 / p95 / p99 / max, the uncapped rAF interval, draw calls,
// triangles, GPU geometries / textures (start → end: leaks), the worst spawn frame and the pack spawn cost, the +100
// burst (150 → 250), and the Horde's batches / instances / sleeping monsters.
//
// GATE (docs/ZONES.md §7.1), per 150-monster run: before the horde spawns, the same page measures the floor alone (no
// horde, the hero idle: the BASELINE for this machine right now). The fight passes when its CPU p95 ≤ 8 ms, or, when the
// baseline's own p95 is over 5 ms (the machine is busy: another game or a render alongside shows up as GPU stalls,
// single GL calls blocking for 15-25 ms, and preemption), when it is ≤ baseline + 3 ms. Put together: p95 ≤ max(8,
// baseline + 3), since baseline + 3 only exceeds 8 when the baseline is over 5. A failed run is retried once (a fresh
// page, baseline and fight) and the retry decides. Exit 1 on a fail; PASS / FAIL lines for run-all; 250 is reported
// only. The machine-load verdict (idle / busy from the baselines, plus Windows' CPU load and the other programs'
// 3D-engine use, sampled before Chrome starts and after it closes) is printed with the table.
//
// usage: node tools/qa/profile-horde.mjs [--quick] [WORLDS=burrow,region(,zone)] [HEROES=chewy,moka,poe] [SECS=6] [FLOOR=12]
//        [REGION=bamboo] [KINDS=all|a,b,…] [QS=noinst] [LIFE=8] [BASE=http://localhost:5173] [PRIO=0]
//   --quick: Chewy only (both worlds), 4 s windows.  QS: extra query (noinst / nogrid / nolod / nocull for A/B; gridcheck
//   compares every grid query with the old scans and fuzzes them, reported as gridcheck / crowdcheck counts).
//   PRIO=0: leave the Chrome processes at normal priority (default on Windows: High, against preemption on a busy box).
//   Diagnostics: PHASES=1 (ms per frame per game phase), FLOOR0=1 (the floor alone first), DIAG=1 (draws per render
//   call, program switches, scene make-up), ABLATE=1 (render cost with a category hidden), PROF=1 [INCL=re] [CALLERS=fn,…]
//   (a CPU profile of the 150 window: self time, inclusive time per module, callers).
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';

const quick = process.argv.includes('--quick');
const BASE = process.env.BASE || 'http://localhost:5173';
const SECS = +(process.env.SECS || (quick ? 4 : 6));
const FLOOR = +(process.env.FLOOR || 12), REGION = process.env.REGION || 'bamboo';
const WORLDS = (process.env.WORLDS || 'burrow,region').split(',');
const HEROES = (process.env.HEROES || (quick ? 'chewy' : 'chewy,moka,poe')).split(',');
const QS = process.env.QS ? '&' + process.env.QS : '';
const LIFE = +(process.env.LIFE || 8), PROF = !!process.env.PROF;
const GATE = 8, BASE_BUSY = 5, BASE_EXCESS = 3; // (p95 ≤ GATE, or ≤ baseline + BASE_EXCESS when the baseline p95 > BASE_BUSY)
const limitOf = r => Math.max(GATE, (r.base?.p95 ?? 0) + BASE_EXCESS);
const gatePass = r => !r.failed && r.p95 <= limitOf(r);

// Windows: overall CPU load and the other programs' 3D-engine use (the GPU Engine counters, summed per process)
const LOAD_PS = String.raw`$cpu=(Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average; $s=(Get-Counter '\GPU Engine(*engtype_3D)\Utilization Percentage' -ErrorAction SilentlyContinue).CounterSamples; $by=@{}; foreach ($x in $s) { if ($x.InstanceName -match 'pid_(\d+)_') { $by[$matches[1]] += $x.CookedValue } }; $top=@($by.GetEnumerator() | Where-Object { $_.Value -ge 2 } | Sort-Object Value -Descending | Select-Object -First 4 | ForEach-Object { $n=(Get-Process -Id $_.Key -ErrorAction SilentlyContinue).ProcessName; if (-not $n) { $n='pid' + $_.Key }; '{0}={1:N0}' -f $n, $_.Value }); 'cpu=' + $cpu + ';' + ($top -join ',')`;
function loadSample() {
  if (process.platform !== 'win32' || process.env.LOAD === '0') return null;
  try {
    const [c, g = ''] = execFileSync('powershell', ['-NoProfile', '-Command', LOAD_PS], { encoding: 'utf8', timeout: 30000 }).trim().split(';');
    return { cpu: +c.slice(4) || 0, gpu: g ? g.split(',').map(x => { const [name, pct] = x.split('='); return { name, pct: +pct }; }) : [] };
  } catch (e) { return null; }
}
const fmtLoad = L => !L ? 'n/a' : `CPU ${L.cpu}%, 3D engine ${L.gpu.length ? L.gpu.map(g => `${g.name} ${g.pct}%`).join(', ') : 'idle'}`;
const loadBefore = loadSample(); // (before Chrome starts: only other programs)

const browser = await chromium.launch({ executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--disable-frame-rate-limit', '--disable-gpu-vsync', '--autoplay-policy=no-user-gesture-required'] });
const rows = [];
let gpuName = '';
// (Windows, unless PRIO=0) raise the launched Chrome's process tree to High priority, so other programs on a busy machine
// don't preempt the measured frames (only this harness's own processes are touched)
if (process.env.PRIO !== '0' && process.platform === 'win32') {
  const pid = browser.process?.()?.pid;
  if (pid) {
    const ps = `$root=${pid}; $all=Get-CimInstance Win32_Process; $ids=@($root); $q=@($root); while ($q.Count) { $p=$q[0]; $q=$q[1..($q.Count)]; foreach ($c in ($all | Where-Object { $_.ParentProcessId -eq $p })) { $ids+=$c.ProcessId; $q+=$c.ProcessId } }; foreach ($i in $ids) { try { (Get-Process -Id $i).PriorityClass='High' } catch {} }; $ids.Count`;
    browser.__prio = () => { try { return execFileSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' }).trim(); } catch (e) { return 'n/a'; } };
  }
}

async function run(world, hero) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await context.newPage();
  await page.routeWebSocket(/.*/, ws => { ws.onMessage(() => {}); });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errors.push(m.text()); });
  await page.goto(`${BASE}/?fresh&nointro&notut&dseed=1&hour=10&hero=${hero}${QS}`);
  await page.waitForFunction(() => window.__ready === true && window.G?.player, null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  if (browser.__prio) browser.__prio(); // (the new page's renderer process too)
  if (process.env.SPIKES) await page.evaluate(() => { window.__spikeProbe = true; });
  if (process.env.CASTS_PROBE) await page.evaluate(() => { window.__castProbe = true; });
  if (process.env.CENSUS) await page.evaluate(() => { window.__census = true; });
  if (process.env.SKEL) await page.evaluate(() => { // count / time Skeleton.update per frame, and who owns the skeletons
    const G = window.G; let sk = null; G.world?.scene?.traverse?.(o => { if (!sk && o.isSkinnedMesh) sk = o.skeleton; }); if (!sk) sk = G.player.rig?.skeleton; if (!sk) return;
    const proto = Object.getPrototypeOf(sk), raw = proto.update; const S = window.__skel = { n: 0, ms: 0, bones: 0 };
    S.by = {}; proto.update = function () { const t = performance.now(); raw.call(this); if (window.__perf?.on) { const dt = performance.now() - t; S.n++; S.ms += dt; S.bones += this.bones.length; const k = (this.bones[0]?.name || '?') + '/' + this.bones.length + (this.boneTexture ? '' : ':notex') + (G.world.scene.matrixWorldAutoUpdate === false ? ' [in N8AO re-render]' : ''); const e = S.by[k] ||= [0, 0]; e[0]++; e[1] += dt; } };
  });
  await page.evaluate(({ world, floor, region }) => {
    const G = window.G; G.state.flags.burrowTut = true;
    const P = G.state.player; P.lvl = 30; P.stats = { str: 90, dex: 90, vit: 400, ene: 300 }; P.statPts = 0;
    const tree = { chewy: ['chomp', 'whirl', 'bonestorm', 'blaze', 'fetchstorm', 'woof', 'packcall', 'multi', 'ricochet', 'throw', 'fetchMastery', 'boneMastery', 'dig', 'frenzy', 'howl'],
      moka: ['splash', 'tideMastery', 'bubble', 'shake', 'puddleHop', 'whirlpool', 'greatWave', 'kibble', 'starMastery', 'squeak', 'pawRune', 'moonbeam', 'constellation', 'meteor', 'duckDecoy', 'retriever', 'fetchLeash', 'feathers', 'duckCall', 'spiritRetriever', 'mallards'],
      poe: ['fumaThrow', 'shurikenMastery', 'kunaiFan', 'shadowStitch', 'whirlingFuma', 'shurikenRain', 'thousandStars', 'smokeBomb', 'ninjutsuMastery', 'puffBall', 'shadowClone', 'substitution', 'thunderPaw', 'smokeDragon', 'caltropFlip', 'phantomBarrage'] }[G.player.hero] || [];
    for (const id of tree) P.skills[id] = 10;
    G.actions.recompute(); P.life = null; P.zoom = null;
    G.actions.addXp = () => {}; // (no level-up banners in the middle of a measurement)
    if (world === 'region') G.enterRegion(region); else if (world === 'zone') G.enterDungeon({ id: 'bambooDepths', floor: 1 }); else G.enterDungeon(floor); // (zone: a real Bamboo Depths floor, ~140 of its own on top)
  }, { world, floor: FLOOR, region: REGION });
  await page.waitForFunction(() => window.G?.mode === 'dungeon' && window.G.dungeon?.monsters?.length && !window.G.ui?.iris?.active, null, { timeout: 40000 });
  await page.waitForTimeout(2500);
  if (!gpuName) gpuName = await page.evaluate(() => { try { const gl = window.G.engine.renderer.getContext(), e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : ''; } catch (e) { return ''; } });
  // ---- in-page harness: horde spawner, the hero's rotation, frame bookkeeping
  const setup = await page.evaluate(({ life, world, kinds }) => {
    const G = window.G, E = G.engine, D = G.dungeon, P = G.player;
    const BURROW = ['mochi', 'dustbunny', 'kinoko', 'lantern', 'kasa', 'wisp', 'oni', 'tanuki'];
    const REGIONK = ['takenoko', 'kodama', 'kamaitachi', 'kuri', 'kakashi', 'momijiWisp', 'yukiwarashi', 'yukidaruma', 'tsurara', 'kappa', 'heikegani', 'kurage'];
    const MON = D.monsters[0].constructor;
    // the fight's roster: 4 Burrow + 4 region kinds (a skinned tanuki, the transparent kurage, GPU-deformed kappa),
    // more mixed than any real floor (3-5 kinds); KINDS=all spawns every kind
    let KINDS = kinds === 'all' ? [] : kinds ? kinds.split(',') : world === 'region' ? ['takenoko', 'mochi', 'kodama', 'kinoko', 'kamaitachi', 'lantern', 'kurage', 'tanuki'] : world === 'zone' ? ['takenoko', 'kodama', 'kamaitachi', 'iwabozu', 'karasuKozo', 'kurage', 'tanuki', 'kappa'] : ['mochi', 'takenoko', 'dustbunny', 'kodama', 'kasa', 'kappa', 'tanuki', 'kurage'];
    if (kinds === 'all') for (let i = 0; i < Math.max(BURROW.length, REGIONK.length); i++) { if (REGIONK[i]) KINDS.push(REGIONK[i]); if (BURROW[i]) KINDS.push(BURROW[i]); }
    D.warmMonsters?.(KINDS); // (as a floor load warms its roster)
    const H = window.__horde = { set: new Set(), want: 0, queue: 0, packN: 0, spawnLog: [], lastSpawnFrame: false, kinds: KINDS };
    const lvl = D.layout.mlvl || 10;
    const spot = (r0, r1) => {
      for (let k = 0; k < 80; k++) {
        const a = Math.random() * Math.PI * 2, r = r0 + Math.random() * (r1 - r0 + k * 0.1);
        const x = P.pos.x + Math.cos(a) * r, z = P.pos.z + Math.sin(a) * r;
        if (G.world.walkable(x, z) && !G.world.collision?.solidAt?.(x, z, 0.4)) return [x, z];
      }
      return [P.pos.x + 2, P.pos.z + 2];
    };
    const one = (id, o) => {
      if (D.spawnMonster) return D.spawnMonster(id, o);
      const m = new MON(D, id, o); D.monsters.push(m); D.combat.add(m); return m;
    };
    // a pack of n of one kind at a spot r0..r1 from the hero (every 3rd pack champions, every 5th led by a unique)
    H.pack = (n, r0, r1) => {
      const t0 = performance.now(), id = KINDS[H.packN % KINDS.length], k = H.packN++;
      const [cx, cz] = spot(r0, r1);
      const rank = k % 3 === 2 ? 'champion' : 'normal';
      for (let i = 0; i < n; i++) {
        let x = cx + Math.cos(i * 2.4) * (0.6 + i * 0.25), z = cz + Math.sin(i * 2.4) * (0.6 + i * 0.25);
        if (!G.world.walkable(x, z)) { x = cx; z = cz; }
        const m = one(id, { level: lvl, rank: i === 0 && k % 5 === 4 ? 'unique' : rank, variant: (Math.random() * 3) | 0, x, z });
        m.lifeMax = m.life = Math.round(m.lifeMax * life); m.aggro = true; m._horde = true; H.set.add(m);
      }
      const ms = performance.now() - t0; H.spawnLog.push({ n, ms, id }); H.lastSpawnFrame = true;
      return ms;
    };
    H.top = () => { // keep the fight at `want` (inside the frame: called from the tick wrapper)
      for (const m of H.set) if (!m.alive) H.set.delete(m);
      let miss = H.want - H.set.size;
      if (miss <= 0 || (H.nextT || 0) > performance.now()) return;
      while (miss > 0) { const n = Math.min(10, miss); H.pack(n, 11, 15); miss -= n; }
      H.nextT = performance.now() + 500;
    };
    // the hero's rotation (run inside the frame, every 160 ms)
    const ROT = {
      chewy: ['attack', 'attack', 'attack', 'chomp', 'attack', 'whirl', 'attack', 'bonestorm', 'woof', 'attack', 'packcall', 'blaze', 'fetchstorm', 'multi', 'throw'],
      moka: ['attack', 'splash', 'kibble', 'shake', 'whirlpool', 'squeak', 'constellation', 'feathers', 'meteor', 'pawRune', 'greatWave', 'duckCall', 'mallards', 'duckDecoy', 'spiritRetriever', 'fetchLeash', 'bubble'],
      poe: ['attack', 'fumaThrow', 'kunaiFan', 'attack', 'shurikenRain', 'thunderPaw', 'whirlingFuma', 'attack', 'thousandStars', 'smokeBomb', 'puffBall', 'shadowClone', 'substitution', 'smokeDragon', 'caltropFlip', 'phantomBarrage'],
    }[P.hero] || ['attack'];
    const BALL = new Set(['blaze', 'fetchstorm', 'multi', 'throw']);
    let ri = 0, nextCast = 0;
    H.cast = () => {
      if (!H.fight || performance.now() < nextCast) return;
      nextCast = performance.now() + 160;
      const id = ROT[ri++ % ROT.length];
      G.state.player.zoom = null; G.state.player.life = null; G.skills.cds = {};
      if (P.hero === 'chewy') { const ball = BALL.has(id); if (id !== 'attack' && (G.derived.weaponType === 'ball') !== ball) { G.actions.swapWeapons(); P.setWeapon(G.derived.weaponType); } }
      const t = G.combat.nearest(P.pos, 'ally', 9, e => !e.breakable) || [...H.set].find(m => m.alive);
      H.casts = (H.casts || 0) + 1; H.lastCast = id; H.castFrames = 0;
      if (t) { P.anim.busy?.() && id !== 'attack' && P.anim.stop(); try { G.skills.tryCast(id, t.pos.clone(), t); } catch (e) { H.castErr = String(e); } }
    };
    // frame bookkeeping: CPU time from tick() to the end of render(), the rAF interval, draw calls / triangles
    const tick = E.tick.bind(E), render = E.render.bind(E), R = window.__perf = { t: [], w: [], calls: [], tris: [], spawnFrames: [], on: false, t0: 0 };
    E.renderer.info.autoReset = false;
    // ?gridcheck: fuzz the grid queries every frame (screen picks over the fight, circles and nearest round the hero);
    // combat.compare() counts any answer that differs from the old scans
    const fuzz = G.combat.check ? () => {
      const C = G.combat, cam = E.camera;
      for (let i = 0; i < 12; i++) {
        const m = [...H.set][(Math.random() * H.set.size) | 0];
        if (m) { const v = m.pos.clone().setY(m.pos.y + 0.5).project(cam); C.pickAtScreen((v.x * 0.5 + 0.5) * innerWidth + (Math.random() - 0.5) * 120, (-v.y * 0.5 + 0.5) * innerHeight + (Math.random() - 0.5) * 120, cam); }
        C.pickAtScreen(Math.random() * innerWidth, Math.random() * innerHeight, cam);
        const x = P.pos.x + (Math.random() - 0.5) * 24, z = P.pos.z + (Math.random() - 0.5) * 24, r = Math.random() * 6;
        C.inRadius(x, z, r, 'ally', () => {}); C.inRadius(x, z, r, 'enemy', () => {});
        C.nearest({ x, z }, 'ally', Math.random() < 0.2 ? 99 : Math.random() * 10); C.nearest({ x, z }, 'enemy', Math.random() * 10);
      }
    } : null;
    E.tick = () => { R.t0 = performance.now(); E.renderer.info.reset(); H.lastSpawnFrame = false; try { H.top(); H.cast(); fuzz?.(); } catch (e) { H.err = String(e.stack || e); } return tick(); };
    R.spikeKinds = {};
    E.render = () => { render(); if (R.on) { const dt = performance.now() - R.t0; R.t.push(dt); R.calls.push(E.renderer.info.render.calls); R.tris.push(E.renderer.info.render.triangles); if (H.lastSpawnFrame) R.spawnFrames.push(dt); if (window.__castProbe && H.lastCast && H.castFrames++ < 4) { const c = (R.byCast ||= {})[H.lastCast] ||= { n: 0, sum: 0, max: 0, over: 0 }; c.n++; c.sum += dt; c.max = Math.max(c.max, dt); if (dt > 8) c.over++; }
      if (window.__census && (R.censusN = (R.censusN || 0) + 1) % 10 === 0) { const S = G.world.scene, k = R.census ||= { frames: 0 }; k.frames++; const H = G.dungeon._horde?.root;
        S.traverseVisible(o => { if (!(o.isMesh || o.isSprite || o.isPoints || o.isLine)) return; let top = o; while (top.parent && top.parent !== S) top = top.parent; if (top === H) return;
          const key = (o.isSprite ? 'sprite' : o.isInstancedMesh ? 'inst' : o.isSkinnedMesh ? 'skin' : o.isMesh ? 'mesh' : 'other') + (o.layers.mask !== 1 ? '(hidden)' : '') + ':' + (top.name || top.userData?.poolKey || top.type) + (o.material?.transparent ? ':T' : '') + (o.castShadow ? ':S' : ''); k[key] = (k[key] || 0) + 1; }); }
      if (window.__spikeProbe && E.renderer.info.render.calls > 550) { const k = R.spikeKinds; k.frames = (k.frames || 0) + 1; for (const f of G.vfx.fx) { const o = f.obj; if (!o || !o.visible) continue; const t = o.isSprite ? 'sprite:' + (o.renderOrder) : o.type + ':' + (o.geometry?.type || ''); k[t] = (k[t] || 0) + 1; } let skins = 0; G.world.scene.traverseVisible(o => { if (o.isSkinnedMesh) skins++; }); k.skinned = (k.skinned || 0) + skins; } } };
    let last = performance.now();
    (function f() { const n = performance.now(); if (R.on) R.w.push(n - last); last = n; requestAnimationFrame(f); })();
    // phase timers (PHASES=1): where a frame's CPU goes (ms per frame, averaged over the window)
    R.ph = {};
    const wrap = (o, k, name) => { const f = o?.[k]; if (typeof f !== 'function') return; o[k] = function (...a) { const t = performance.now(); try { return f.apply(this, a); } finally { if (R.on) R.ph[name] = (R.ph[name] || 0) + performance.now() - t; } }; };
    wrap(D, 'update', 'dungeon'); wrap(G.skills, 'update', 'skills'); wrap(G.combat, 'update', 'combat'); wrap(G.vfx, 'update', 'vfx'); wrap(G.ui, 'update', 'ui'); wrap(G.player, 'update', 'player');
    wrap(E.post, 'render', 'render'); wrap(G.world, 'update', 'world'); wrap(G.world.lightPool, 'update', 'lights'); wrap(D._horde, 'sync', 'hordeSync');
    const mem = E.renderer.info.memory;
    return { floorMonsters: D.monsters.length, geo: mem.geometries, tex: mem.textures, isRegion: !!D.isRegion, theme: D.layout.theme, kinds: KINDS.join(',') };
  }, { life: LIFE, world, kinds: process.env.KINDS || '' });

  const measure = async () => {
    await page.evaluate(() => { const R = window.__perf; for (const k of ['t', 'w', 'calls', 'tris', 'spawnFrames']) R[k].length = 0; R.ph = {}; window.__horde.spawnLog.length = 0; if (window.__skel) Object.assign(window.__skel, { n: 0, ms: 0, bones: 0, by: {} }); R.on = true; });
    await page.waitForTimeout(SECS * 1000);
    return page.evaluate(() => {
      const R = window.__perf, H = window.__horde; R.on = false;
      const s = a => [...a].sort((x, y) => x - y), q = (a, f) => a.length ? a[Math.min(a.length - 1, Math.floor(a.length * f))] : 0;
      const t = s(R.t), w = s(R.w), c = s(R.calls), tr = s(R.tris), mem = window.G.engine.renderer.info.memory;
      return { n: t.length, p50: q(t, 0.5), p95: q(t, 0.95), p99: q(t, 0.99), max: t[t.length - 1] || 0, w50: q(w, 0.5), w95: q(w, 0.95), w99: q(w, 0.99),
        calls: q(c, 0.5), calls95: q(c, 0.95), tris: q(tr, 0.5), geo: mem.geometries, tex: mem.textures,
        hitch: Math.max(0, ...R.spawnFrames), packs: H.spawnLog.length, packMax: Math.max(0, ...H.spawnLog.map(x => x.ms)), packAvg: H.spawnLog.length ? H.spawnLog.reduce((a, x) => a + x.ms / x.n, 0) / H.spawnLog.length : 0,
        alive: window.G.dungeon.monsters.filter(m => m.alive).length, horde: [...H.set].filter(m => m.alive).length, casts: H.casts || 0, err: H.err || H.castErr || null,
        skel: window.__skel ? { perFrame: +(window.__skel.n / Math.max(1, t.length)).toFixed(1), ms: +(window.__skel.ms / Math.max(1, t.length)).toFixed(3), bonesPerFrame: +(window.__skel.bones / Math.max(1, t.length)).toFixed(0), by: Object.fromEntries(Object.entries(window.__skel.by || {}).sort((x, y) => y[1][1] - x[1][1]).slice(0, 8).map(([k, [n, ms]]) => [k, `${(n / Math.max(1, t.length)).toFixed(1)}/f ${(ms / Math.max(1, t.length)).toFixed(3)} ms`])) } : null,
        census: window.__census ? Object.fromEntries(Object.entries(R.census || {}).map(([k, v]) => [k, k === 'frames' ? v : +(v / Math.max(1, R.census.frames)).toFixed(1)]).sort((x, y) => y[1] - x[1]).slice(0, 30)) : null,
        spikes: window.__spikeProbe ? Object.fromEntries(Object.entries(R.spikeKinds).map(([k, v]) => [k, k === 'frames' ? v : +(v / Math.max(1, R.spikeKinds.frames || 1)).toFixed(1)])) : null,
        phases: Object.fromEntries(Object.entries(R.ph).map(([k, v]) => [k, +(v / Math.max(1, t.length)).toFixed(2)])),
        inst: window.G.dungeon._horde?.info?.() || null, slept: window.G.dungeon.lodSlept ?? null, gridcheck: window.G.combat.check || null, crowdcheck: window.G.dungeon._crowd?.check || null };
    });
  };

  // ---- the baseline: this floor alone (no horde, the hero idle) on this machine right now — the gate's reference
  const b0 = await measure();
  const base = { p50: b0.p50, p95: b0.p95, max: b0.max, calls: b0.calls, n: b0.n, alive: b0.alive };
  console.log(`${(world + '/' + hero).padEnd(14)} baseline (the floor alone, ${b0.alive} floor monsters, no horde): cpu p50 ${b0.p50.toFixed(2)}  p95 ${b0.p95.toFixed(2)}  max ${b0.max.toFixed(1)} ms | draws ${b0.calls}${process.env.FLOOR0 || process.env.PHASES ? ` | phases ${JSON.stringify(b0.phases)}` : ''}`);
  // ---- 150: spawn (timed: the floor-load case), let them close in, measure
  const spawn150 = await page.evaluate(() => { const H = window.__horde, t0 = performance.now(); for (let i = 0; i < 15; i++) H.pack(10, 3, 14); H.want = 150; return { ms: performance.now() - t0, horde: H.set.size }; });
  await page.waitForTimeout(2500);
  if (process.env.SKEL) { const r0 = await measure(); console.log('   before any cast — skeleton updates per frame:', JSON.stringify(r0.skel), 'cpu p50', r0.p50.toFixed(2)); }
  await page.evaluate(() => { window.__horde.fight = true; });
  await page.waitForTimeout(800);
  let cdp = null;
  if (PROF) { cdp = await context.newCDPSession(page); await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start'); }
  const r150 = await measure();
  if (cdp) printProfile((await cdp.send('Profiler.stop')).profile, `${world}/${hero} @150`);
  if (process.env.ABLATE) console.log('render ms/frame with a category hidden', JSON.stringify(await page.evaluate(async () => {
    const G = window.G, E = G.engine, S = G.world.scene, H = G.dungeon._horde, P = window.__perf;
    const frames = n => new Promise(res => { let k = 0; const f = () => (++k < n ? requestAnimationFrame(f) : res()); requestAnimationFrame(f); });
    const time = async () => { const t = P.ph.render || 0, c = P.t.length; P.on = true; await frames(60); P.on = false; return +(((P.ph.render || 0) - t) / Math.max(1, P.t.length - c)).toFixed(2); };
    const cats = {
      none: () => [],
      horde: () => [H.root],
      rigs: () => G.dungeon.monsters.filter(m => m.model.rig && m.model.root.parent).map(m => m.model.root),
      projectiles: () => G.combat.projectiles.map(p => p.mesh),
      vfx: () => G.vfx.fx.map(f => f.obj).filter(Boolean),
      worldStatic: () => S.children.filter(o => o !== H.root && !o.isLight && !G.dungeon.monsters.some(m => m.model.root === o) && !G.combat.projectiles.some(p => p.mesh === o)),
    };
    const out = {};
    for (const [k, f] of Object.entries(cats)) { const objs = f(); const vis = objs.map(o => o.visible); objs.forEach(o => { o.visible = false; }); out[k] = await time(); objs.forEach((o, i) => { o.visible = vis[i]; }); }
    return out;
  })));
  // ---- 250: +100 in one burst (timed), measure
  const burst = await page.evaluate(() => new Promise(res => { const H = window.__horde; requestAnimationFrame(() => { const t0 = performance.now(); for (let i = 0; i < 10; i++) H.pack(10, 6, 16); H.want = 250; const ms = performance.now() - t0; requestAnimationFrame(() => res({ ms })); }); }));
  await page.waitForTimeout(2000);
  const r250 = await measure();
  if (process.env.DIAG) console.log('render calls per frame', JSON.stringify(await page.evaluate(() => new Promise(res => {
    const G = window.G, r = G.engine.renderer, raw = r.render.bind(r), acc = new Map(); let frames = 0, wi = 0;
    r.render = (scene, cam) => { const c0 = r.info.render.calls, t0 = performance.now(); raw(scene, cam); const k = (scene === G.world.scene ? 'world#' + (wi++ % 3) : scene.type + (scene.children?.length || 0)) + (r.getRenderTarget() ? ':rt' : ''); const a = acc.get(k) || { n: 0, calls: 0, ms: 0 }; a.n++; a.calls += r.info.render.calls - c0; a.ms += performance.now() - t0; acc.set(k, a); };
    const sm = r.shadowMap, sr = sm.render.bind(sm); let sh = { calls: 0, ms: 0 }; sm.render = (...x) => { const c0 = r.info.render.calls, t0 = performance.now(); sr(...x); const k = 'shadow#' + ((wi + 2) % 3); const a = acc.get(k) || { n: 0, calls: 0, ms: 0 }; a.n++; a.calls += r.info.render.calls - c0; a.ms += performance.now() - t0; acc.set(k, a); };
    const f = () => { if (++frames < 40) return requestAnimationFrame(f); r.render = raw; sm.render = sr; res({ shadow: { calls: (sh.calls / 40).toFixed(1), ms: (sh.ms / 40).toFixed(2) }, ...Object.fromEntries([...acc].map(([k, a]) => [k, { perFrame: (a.n / 40).toFixed(1), calls: (a.calls / 40).toFixed(1), ms: (a.ms / 40).toFixed(2) }])) }); };
    requestAnimationFrame(f);
  }))));
  if (process.env.DIAG) console.log('program switches per frame', JSON.stringify(await page.evaluate(() => new Promise(res => {
    // getParameters() calls material.customProgramCacheKey() every time a program is re-evaluated: count them per material
    const G = window.G, S = G.world.scene, cnt = new Map(), seen = new Set();
    S.traverse(o => { const ms = [o.material, o.customDepthMaterial].flat().filter(Boolean); for (const m of ms) { if (seen.has(m)) continue; seen.add(m); const f = m.customProgramCacheKey; m.customProgramCacheKey = function () { const users = []; S.traverse(x => { if (x.material === m) users.push(x); }); const k = `${m.type}:${m.uuid.slice(0, 6)}:${o.isSkinnedMesh ? 'skin' : o.isInstancedMesh ? 'inst' : o.isSprite ? 'sprite' : 'mesh'}:${o.name || o.parent?.name || ''} users=${users.length} side=${m.side} vc=${m.vertexColors} colSize=${[...new Set(users.map(u => u.geometry?.attributes?.color?.itemSize || 0))]} inst=${[...new Set(users.map(u => !!u.isInstancedMesh))]} skin=${[...new Set(users.map(u => !!u.isSkinnedMesh))]} recv=${[...new Set(users.map(u => u.receiveShadow))]} t=${m.transparent} geo=${o.geometry?.type}:${o.geometry?.attributes?.position?.count} map=${!!m.map} blend=${m.blending} parent=${o.parent?.type}:${o.parent?.name}:${o.parent?.parent?.type} ro=${o.renderOrder}`; cnt.set(k, (cnt.get(k) || 0) + 1); return f.call(this); }; } });
    let n = 0; const f = () => { if (++n < 30) return requestAnimationFrame(f); res([...cnt].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => `${k} ${(v / 30).toFixed(1)}`)); };
    requestAnimationFrame(f);
  }))));
  if (process.env.DIAG) console.log('scene', JSON.stringify(await page.evaluate(() => {
    const G = window.G, S = G.world.scene, out = {}, H = G.dungeon._horde;
    S.traverseVisible(o => { if (!(o.isMesh || o.isSprite || o.isPoints)) return; for (let p = o; p; p = p.parent) if (p === H?.root) return;
      const k = (o.isSkinnedMesh ? 'skin:' : o.isInstancedMesh ? 'inst:' : o.isSprite ? 'sprite:' : '') + (o.material?.type || '?') + (o.castShadow ? '+sh' : ''); out[k] = (out[k] || 0) + 1; });
    let nodes = 0, auto = 0, rigNodes = 0, modelNodes = 0; S.traverse(o => { nodes++; if (o.matrixAutoUpdate) auto++; });
    for (const m of G.dungeon.monsters) { let n = 0; m.model.root.traverse(() => n++); if (m.model.rig) rigNodes += n; else modelNodes += n; }
    const top = {}; for (const c of S.children) { let n = 0; c.traverse(() => n++); const k = c.name || c.type; top[k] = (top[k] || 0) + n; }
    const layers = (G.vfx.layers || []).map(l => `${l.p.length}/${l.max}`).join(' '), fxk = {}; for (const f of G.vfx.fx) { const o = f.obj; const k = !o ? 'logic' : (o.type + ':' + (o.geometry?.type || o.children?.map(c => c.geometry?.type || c.type).join('+') || '') + (o.visible ? '' : ':hidden')); fxk[k] = (fxk[k] || 0) + 1; } const fx = JSON.stringify(fxk);
    return { out, proj: G.combat.projectiles.length, zones: G.combat.zones.length, loot: G.dungeon.loot?.list?.length, ents: G.combat.entities.size, nodes, auto, rigNodes, modelNodes, top, layers, fx };
  })));
  if (process.env.CASTS_PROBE) console.log('frames after each cast (4 frames): ', JSON.stringify(await page.evaluate(() => Object.fromEntries(Object.entries(window.__perf.byCast || {}).sort((a, b) => b[1].sum / b[1].n - a[1].sum / a[1].n).map(([k, c]) => [k, `avg ${(c.sum / c.n).toFixed(1)} max ${c.max.toFixed(1)} >8:${c.over}/${c.n}`])))));
  const end = await page.evaluate(() => { const G = window.G; window.__horde.fight = false; G.skills.clearAll?.(); const mem = G.engine.renderer.info.memory; return { geo: mem.geometries, tex: mem.textures, progs: G.engine.renderer.info.programs?.length || 0 }; });
  await context.close();
  const info = { world, hero, base, theme: setup.theme, floorMonsters: setup.floorMonsters, geo0: setup.geo, tex0: setup.tex, end, errors: [...new Set(errors)].slice(0, 5) };
  const out = [{ ...info, N: 150, spawnMs: spawn150.ms, ...r150 }, { ...info, N: 250, spawnMs: burst.ms, ...r250 }];
  for (const r of out) { printRow(r); if (process.env.PHASES) console.log('   phases (ms/frame):', JSON.stringify(r.phases)); if (r.spikes) console.log('   frames over 550 draws (per-frame make-up):', JSON.stringify(r.spikes)); if (r.census) console.log('   drawn objects per frame (outside the horde batches):', JSON.stringify(r.census)); if (r.skel) console.log('   skeleton updates per frame:', JSON.stringify(r.skel)); }
  return out;
}

function printRow(r) {
  const f = x => x.toFixed(2);
  console.log(`${(r.world + '/' + r.hero).padEnd(14)} N=${r.N} (alive ${r.alive}, horde ${r.horde})  cpu p50 ${f(r.p50)}  p95 ${f(r.p95)}  p99 ${f(r.p99)}  max ${r.max.toFixed(1)} ms | rAF p50 ${f(r.w50)} p95 ${f(r.w95)} | draws ${r.calls} (p95 ${r.calls95})  tris ${(r.tris / 1000).toFixed(0)}k | geo ${r.geo} tex ${r.tex} | spawn ${r.N === 150 ? '150' : '+100'} in ${r.spawnMs.toFixed(1)} ms, packs ${r.packs} (worst ${r.packMax.toFixed(1)} ms, ${r.packAvg.toFixed(2)} ms/monster), worst spawn frame ${r.hitch.toFixed(1)} ms | casts ${r.casts}${r.inst ? ` | batches ${r.inst.batches} (${r.inst.instances} inst, ${r.inst.models} models)` : ''}${r.slept != null ? `, asleep ${r.slept}` : ''}${r.gridcheck ? ` | gridcheck ${r.gridcheck.bad}/${r.gridcheck.n} bad ${JSON.stringify(r.gridcheck.kinds)}` : ''}${r.crowdcheck ? ` | crowdcheck ${r.crowdcheck.bad}/${r.crowdcheck.n} bad` : ''}${r.err ? ' | ERR ' + r.err.slice(0, 160) : ''}`);
}

function printProfile(profile, label) {
  const byId = new Map(profile.nodes.map(n => [n.id, n]));
  const self = new Map(); let total = 0;
  profile.samples.forEach((id, i) => {
    const cf = byId.get(id).callFrame, us = profile.timeDeltas[i] || 0;
    const k = `${cf.functionName || '(anon)'} ${(cf.url || '').split('/').pop().split('?')[0]}:${cf.lineNumber + 1}`;
    self.set(k, (self.get(k) || 0) + us); if (cf.functionName !== '(idle)' && cf.functionName !== '(program)') total += us;
  });
  if (process.env.CALLERS) { // PROF=1 CALLERS=traverse,getParameters: who calls them (inclusive time per caller chain, 3 deep)
    const parent = new Map(); for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
    const name = id => { const cf = byId.get(id)?.callFrame; return cf ? `${cf.functionName || '(anon)'} ${(cf.url || '').split('/').pop().split('?')[0]}:${cf.lineNumber + 1}` : '?'; };
    for (const want of process.env.CALLERS.split(',')) {
      const agg = new Map();
      profile.samples.forEach((id, i) => { const cf = byId.get(id).callFrame; if (cf.functionName !== want) return; let c = parent.get(id), chain = []; for (let k = 0; k < 4 && c !== undefined; k++) { chain.push(name(c)); c = parent.get(c); } const key = chain.join(' < '); agg.set(key, (agg.get(key) || 0) + (profile.timeDeltas[i] || 0)); });
      console.log(`-- callers of ${want}:`); for (const [k, us] of [...agg].sort((x, y) => y[1] - x[1]).slice(0, 8)) console.log('   ', (us / 1000).toFixed(1).padStart(7), 'ms', k);
    }
  }
  if (process.env.INCL) { // inclusive time of functions whose file matches INCL (a regex), e.g. INCL='monster|crowd|horde'
    const parent = new Map(); for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
    const re = new RegExp(process.env.INCL), incl = new Map();
    profile.samples.forEach((id, i) => { const us = profile.timeDeltas[i] || 0, seen = new Set(); for (let c = id; c !== undefined; c = parent.get(c)) { const cf = byId.get(c).callFrame, f = (cf.url || '').split('/').pop().split('?')[0]; if (!re.test(f)) continue; const k = `${cf.functionName || '(anon)'} ${f}:${cf.lineNumber + 1}`; if (seen.has(k)) continue; seen.add(k); incl.set(k, (incl.get(k) || 0) + us); } });
    console.log(`-- inclusive (${process.env.INCL}):`); for (const [k, us] of [...incl].sort((x, y) => y[1] - x[1]).slice(0, 26)) console.log('   ', (us / 1000).toFixed(1).padStart(8), 'ms', k);
  }
  console.log(`-- CPU profile ${label}: ${(total / 1000).toFixed(0)} ms busy; top self time:`);
  for (const [k, us] of [...self.entries()].filter(([k]) => !/^\(idle\)|^\(program\)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log('   ', (us / 1000).toFixed(1).padStart(8), 'ms', k);
}

const attempt = async (w, h) => { try { return await run(w, h); } catch (e) { console.log(`${w}/${h}: harness error ${e.message}`); return [{ world: w, hero: h, N: 150, p95: 999, failed: true }]; } };
for (const w of WORLDS) for (const h of HEROES) {
  let got = await attempt(w, h);
  if (!gatePass(got[0])) { // one retry: a fresh page, baseline and fight; the retry decides
    const f = got[0];
    console.log(`  retry ${w}/${h}: ${f.failed ? 'the run did not finish' : `p95 ${f.p95.toFixed(2)} > ${limitOf(f).toFixed(2)} ms (baseline p95 ${f.base.p95.toFixed(2)})`}; running it once more`);
    const again = await attempt(w, h);
    for (const r of again) r.firstTry = f;
    got = again;
  }
  rows.push(...got);
}
await browser.close();
const loadAfter = loadSample();
const f2 = x => x.toFixed(2);
console.log(`\n== horde perf (${gpuName || 'GPU ?'}; ${SECS}s windows, CPU frame = tick → end of render; baseline = the same floor with no horde, measured first on the same page)`);
console.log('| world | hero | N | baseline p95 | cpu p50 | p95 | limit | p99 | max | rAF p95 | draws | tris | geo start→end | worst spawn frame | pack spawn ms/monster |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const r of rows) if (!r.failed) console.log(`| ${r.world} | ${r.hero} | ${r.N} | ${f2(r.base.p95)} | ${f2(r.p50)} | ${f2(r.p95)} | ${r.N === 150 ? f2(limitOf(r)) : '–'} | ${f2(r.p99)} | ${r.max.toFixed(1)} | ${f2(r.w95)} | ${r.calls} | ${(r.tris / 1000).toFixed(0)}k | ${r.geo0}→${r.end.geo} | ${r.hitch.toFixed(1)} | ${f2(r.packAvg)} |`);
for (const r of rows) {
  if (r.failed) { console.log(`  FAIL  ${r.world}/${r.hero} @${r.N}: the run did not finish${r.firstTry ? ' (after a retry)' : ''}`); continue; }
  const gated = r.N === 150, ok = !gated || gatePass(r), lim = limitOf(r), busy = r.base.p95 > BASE_BUSY;
  const rule = !gated ? ' (reported)' : busy ? ` (gate: baseline ${f2(r.base.p95)} > ${BASE_BUSY}, so ≤ baseline + ${BASE_EXCESS} = ${f2(lim)}; excess ${f2(r.p95 - r.base.p95)})` : ` (gate ≤ ${GATE}; baseline ${f2(r.base.p95)}, excess ${f2(r.p95 - r.base.p95)})`;
  const first = gated && r.firstTry ? `; first try ${r.firstTry.failed ? 'did not finish' : `p95 ${f2(r.firstTry.p95)} vs limit ${f2(limitOf(r.firstTry))}`}, retried` : '';
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${r.world}/${r.hero} @${r.N}: cpu p95 ${f2(r.p95)} ms${rule}, p50 ${f2(r.p50)}, worst spawn frame ${r.hitch.toFixed(1)} ms, geo ${r.geo0}→${r.end.geo}${first}`);
  if (r.gridcheck) console.log(`  ${r.gridcheck.bad || r.crowdcheck?.bad ? 'FAIL' : 'PASS'}  ${r.world}/${r.hero} @${r.N}: grid queries equal the scans (${r.gridcheck.n} combat, ${r.crowdcheck?.n || 0} crowd checked)`);
}
// the machine-load verdict: BUSY when a run's baseline p95 is over BASE_BUSY (that run is then gated at baseline +
// BASE_EXCESS), or when other programs were loading the machine (Windows: CPU ≥ 40%, or one program ≥ 10% of the 3D
// engine, before or after the run). A light GPU load from another game does not always lift the floor baseline, so the
// verdict says which it was: the gate only relaxes on the measured baseline.
const bases = rows.filter(r => r.N === 150 && !r.failed).map(r => r.base.p95), busyRuns = rows.filter(r => r.N === 150 && !r.failed && r.base.p95 > BASE_BUSY);
const lo = bases.length ? Math.min(...bases) : 0, hi = bases.length ? Math.max(...bases) : 0;
const cpuMax = Math.max(loadBefore?.cpu || 0, loadAfter?.cpu || 0), gpuBy = new Map();
for (const L of [loadBefore, loadAfter]) for (const g of L?.gpu || []) if (g.pct >= 10 && !/^(dwm|chrome|node)$/i.test(g.name)) gpuBy.set(g.name, Math.max(gpuBy.get(g.name) || 0, g.pct));
const osBusy = [...(cpuMax >= 40 ? [`CPU up to ${cpuMax}%`] : []), ...[...gpuBy].map(([n, p]) => `${n} ${p}% of the 3D engine`)];
const why = [...(busyRuns.length ? [`baseline p95 over ${BASE_BUSY} ms in ${busyRuns.map(r => `${r.world}/${r.hero} (${f2(r.base.p95)})`).join(', ')}, gated at baseline + ${BASE_EXCESS}`] : []), ...(osBusy.length ? [`other programs: ${osBusy.join(', ')}`] : [])];
console.log(`== machine load: ${why.length ? 'BUSY — ' + why.join('; ') : 'idle'}${osBusy.length && !busyRuns.length ? ` (the floor baselines stayed ≤ ${BASE_BUSY} ms, so the gate stayed at ${GATE} ms)` : ''} | baselines p95 ${f2(lo)}–${f2(hi)} ms | Windows before the run: ${fmtLoad(loadBefore)}; after: ${fmtLoad(loadAfter)}`);
const bad = rows.filter(r => r.N === 150 && !gatePass(r));
const errs = rows.filter(r => r.errors?.length);
for (const r of errs) console.log(`  errors in ${r.world}/${r.hero}: ${r.errors.join(' | ').slice(0, 400)}`);
console.log(bad.length ? `== HORDE GATE: FAIL (${bad.map(r => r.failed ? `${r.world}/${r.hero} did not finish` : `${r.world}/${r.hero} p95 ${f2(r.p95)} > ${f2(limitOf(r))}`).join(', ')} ms at 150)` : `== HORDE GATE: PASS (every 150 run p95 ≤ max(${GATE}, baseline + ${BASE_EXCESS}) ms${rows.some(r => r.firstTry) ? '; ' + rows.filter(r => r.firstTry && r.N === 150).length + ' passed on the retry' : ''})`);
process.exit(bad.length || errs.length ? 1 : 0);
