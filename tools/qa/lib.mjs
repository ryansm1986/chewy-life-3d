// Shared QA harness: headless Chrome (GPU), HMR socket blocked, error capture, in-page probes, assertion log.
import { chromium } from 'playwright-core';

export const BASE = process.env.BASE || 'http://localhost:5173';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

export async function launch({ w = 1280, h = 720 } = {}) {
  const browser = await chromium.launch({
    executablePath: CHROME, headless: true,
    args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
  });
  const context = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await context.newPage();
  // Block Vite HMR: other engineers edit files concurrently and a full reload would reset the page mid-test.
  await page.routeWebSocket(/.*/, ws => { ws.onMessage(() => {}); });
  const errors = [], warns = [];
  page.on('pageerror', e => errors.push(`[pageerror] ${e.message}\n    ${(e.stack || '').split('\n').slice(1, 5).join('\n    ')}`));
  page.on('console', m => {
    const t = m.text();
    if (m.type() === 'error') { if (!/favicon|404 \(Not Found\)/.test(t)) errors.push(`[console.error] ${t}`); }
    else if (m.type() === 'warning') warns.push(t);
  });
  return { browser, context, page, errors, warns };
}

export async function boot(page, qs = 'fresh&nointro') {
  // dungeon floors reroll per entry now (dungeon/defs.js): the QA pins them to the old fixed layouts (?dseed=1, kept for
  // the tab, so reloads stay pinned too) unless a scenario asks otherwise (dseed=N, or dseed=off to roll)
  if (!/(^|&)dseed=/.test(qs)) qs += '&dseed=1';
  if (process.env.QA_QS) qs += '&' + process.env.QA_QS; // (any scenario on another setup, e.g. QA_QS=q=4: the Mobile preset)
  await page.goto(`${BASE}/?${qs}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true && window.G?.player, null, { timeout: 60000 });
  await page.waitForTimeout(600);
  await installProbes(page);
}

export const sleep = (page, ms) => page.waitForTimeout(ms);

// wait until the iris transition is finished and G.mode === mode
export async function waitMode(page, mode, timeout = 20000) {
  await page.waitForFunction(m => window.G?.mode === m && !window.G?.ui?.iris?.active, mode, { timeout });
  await page.waitForTimeout(250);
}
export async function waitIdle(page, timeout = 20000) {
  await page.waitForFunction(() => !window.G?.ui?.iris?.active, null, { timeout });
}

// Probes installed into the page (window.QA)
export async function installProbes(page) {
  await page.evaluate(async () => {
    if (window.QA) return;
    // (the game's own bus: under the dev server an edited module is served as …?t=…, and a fresh import here would be
    //  another instance that never hears the game's events)
    const Events = window.G?.events || (await import('/src/core/events.js')).Events;
    const QA = window.QA = { Events, counts: {}, log: [] };
    // count interesting bus events (single observer: we only add ONE listener per name)
    for (const n of ['monster:killed', 'boss:dead', 'boss:spawn', 'player:dead', 'player:levelup', 'mode:changed', 'quest:update', 'toast', 'item:pickup', 'equip:changed', 'village:changed', 'friend:changed'])
      Events.on(n, (p) => { QA.counts[n] = (QA.counts[n] || 0) + 1; if (n !== 'toast' && n !== 'quest:update') QA.log.push([performance.now() | 0, n, p && typeof p === 'object' ? JSON.stringify(p, (k, v) => (v && typeof v === 'object' && (v.isVector3 || k === 'item')) ? undefined : v).slice(0, 120) : String(p)]); });
    // spy audio.play + toasts
    QA.sfx = [];
    const A = window.G.audio;
    if (A?.play) { const raw = A.play.bind(A); A.play = (n, o) => { QA.sfx.push(n); if (QA.sfx.length > 5000) QA.sfx.splice(0, 2500); return raw(n, o); }; }
    QA.toasts = [];
    const T = window.G.ui?.toasts;
    if (T?.show) { const raw = T.show.bind(T); T.show = (text, o) => { QA.toasts.push(String(text)); return raw(text, o); }; }
    QA.finite = v => v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
    QA.mem = () => {
      const G = window.G, r = G.engine.renderer;
      return { geo: r.info.memory.geometries, tex: r.info.memory.textures, progs: r.info.programs?.length || 0,
        villageChildren: G.village.world.scene.children.length - 2 * (G.npcs || []).length, // villagers (rig + contact shadow) move in over time
        villagers: (G.npcs || []).length, villageSources: G.village.world.lightPool.sources.size,
        villageInteract: G.village.world.interactables.length, vfxFx: G.village.vfx.fx.length,
        lootLabels: document.querySelectorAll('.l-world .ll, .ll').length, floats: document.querySelectorAll('.l-world > *').length };
    };
    QA.state = () => {
      const G = window.G, P = G.player;
      return { mode: G.mode, pos: [P.pos.x, P.pos.y, P.pos.z], finite: QA.finite(P.pos), dead: G.playerDead, locked: P.controlLocked,
        life: G.actions.life(), lifeMax: G.derived.lifeMax, timeScale: G.engine.timeScale, leap: !!P.leap, dash: !!P.dash, invuln: !!P.invuln,
        anim: P.anim.action?.name || null, modal: !!G.ui?.anyModal?.(), dlg: !!G.ui?.dlg?.active, iris: !!G.ui?.iris?.active, build: !!G.build?.active,
        channel: !!G.skills.channel, dungeon: !!G.dungeon };
    };
    // wall check in the Burrow: strict (inside a rock cell) and soft (walkable margin)
    QA.wallCheck = (p) => {
      const G = window.G; if (G.mode !== 'dungeon' || !G.dungeon) return { ok: true };
      const L = G.dungeon.layout, cx = Math.floor(p.x / 2), cy = Math.floor(p.z / 2);
      return { ok: !!L.at(cx, cy), walk: G.world.walkable(p.x, p.z), cell: [cx, cy] };
    };
  });
}

// assertion log
export function makeReport(name) {
  const rows = [];
  const R = {
    name, rows,
    check(label, ok, detail = '') { rows.push({ label, ok: !!ok, detail }); console.log(`${ok ? '  PASS' : '  FAIL'}  ${label}${detail ? '  — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); return !!ok; },
    note(s) { console.log('  ....  ' + s); },
    finish(errors = [], warns = []) {
      const uniq = [...new Set(errors)];
      if (uniq.length) { console.log(`  ERRORS (${errors.length}, ${uniq.length} unique):`); for (const e of uniq.slice(0, 25)) console.log('   ' + e); }
      const noisyWarn = [...new Set(warns)].filter(w => !/GPU stall|THREE\.|Hardware|autoplay|AudioContext/i.test(w));
      if (noisyWarn.length) { console.log(`  WARNINGS (${noisyWarn.length} unique):`); for (const w of noisyWarn.slice(0, 12)) console.log('   ' + w.slice(0, 240)); }
      const failed = rows.filter(r => !r.ok).length + (uniq.length ? 1 : 0);
      console.log(`== ${name}: ${rows.length - rows.filter(r => !r.ok).length}/${rows.length} checks passed, ${uniq.length} unique runtime errors → ${failed ? 'FAIL' : 'PASS'}`);
      return failed;
    },
  };
  console.log(`== ${name}`);
  return R;
}

// press a key and let a frame see it
export async function tap(page, key, hold = 60) { await page.keyboard.down(key); await page.waitForTimeout(hold); await page.keyboard.up(key); await page.waitForTimeout(40); }

// Answer any open dialogues: choose `picks` (list of 0-based choice indexes, consumed in order) or advance with Enter.
export async function drainDialogue(page, picks = [], maxSteps = 40) {
  const chosen = [];
  for (let i = 0; i < maxSteps; i++) {
    const s = await page.evaluate(() => { const d = window.G.ui?.dlg; if (!d?.active) return null; return { typing: d.typing, choices: d.choices?.map(c => c.text || c) || null, last: d.i >= d.lines.length - 1, text: d.lines?.[d.i]?.text }; });
    if (!s) return chosen;
    if (s.typing) { await page.keyboard.press('Enter'); await page.waitForTimeout(80); continue; }
    if (s.choices && s.last) {
      let k = picks.length ? picks.shift() : s.choices.length - 1;
      if (k >= s.choices.length) k = s.choices.length - 1;
      chosen.push(s.choices[k]);
      await page.keyboard.press(String(k + 1)); await page.waitForTimeout(420);
    } else { await page.keyboard.press('Enter'); await page.waitForTimeout(120); }
  }
  return chosen;
}
