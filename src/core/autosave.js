// Autosave (ROADMAP R-11, docs/ARCHITECTURE.md § Save flow). game.js keeps save() (state → saveableState → here) and
// installs this module, which owns:
//   - the save slots (SL-1): SLOTS adventures, each its own save. Slot 1 keeps the first keys, 'chewy3d.save' and
//     'chewy3d.save.prev' (a save from before slots is slot 1, and so are the QA's fixtures); slot n is
//     'chewy3d.save.<n>' and its '.prev'. 'chewy3d.slot' remembers the slot played last: the page loads it at boot and
//     writes only it (the title's picker switches slot by reloading). Settings, volumes and controls stay per device.
//   - the storage write, writeSave(): the save goes to the slot's main key and the one it replaces is copied to its
//     .prev first (a rotating backup, apart from the debug menu's 'chewy3d.save.debugBackup'); a full storage drops
//     .prev (this slot's, then the others') to make room, then toasts once if the save still can't fit
//   - the read, loadSave(validate): the main save, or .prev when the main one fails to parse or to normalize (a gentle
//     toast once the UI is up). A missing main save is a new game: .prev is NOT used then (New Game removes the main)
//   - the timed autosave: every 1 / 2 / 5 min of play (Settings › Autosave, default 2 min; Off stops it), counted only
//     while the page is visible and the game isn't paused
//   - the event autosave: a quest step, a level up, a building placed / upgraded / removed, a hero joining, a village
//     saved, a dungeon / tier cleared, a unique or set item picked up, a big purchase, an expedition sent or back;
//     at most one per 20 s (later events in the window fold into one save at its end), dropped when the game saved on
//     its own after the event
//   - deferral: either kind waits (never skipped) while a boss fight or an arena seal is up, the hero is down, a
//     transition / hero switch / cutscene / joining scene runs, the title shows, a build-mode placement or a decor
//     piece is in hand, or G.saveBlocked; it goes RETRY s after the blocker clears
//   - the page lifecycle: beforeunload, pagehide and visibility-hidden save on every platform, once per burst
//   - the paw "saving…" glyph (ui/saveGlyph.js) on an autosave (no toast: the menu's Save keeps its toast)
// A serialise measured over IDLE_MS runs in requestIdleCallback so it never lands on a busy combat frame.
// Test hooks (s36): G.autosave.manual = true stops the real clock; advance(s, { play }) drives it; state(); now().
import { Events } from './events.js';

export const SAVE_KEY = 'chewy3d.save', PREV_KEY = 'chewy3d.save.prev';
export const SLOTS = 3;
const SLOT_KEY = 'chewy3d.slot';
/** Settings › Autosave: the setting holds the index (Off / 1 / 2 / 5 min) */
export const AUTOSAVE_MIN = [0, 1, 2, 5], AUTOSAVE_LABELS = ['Off', '1 min', '2 min', '5 min'], AUTOSAVE_DEFAULT = 2;
const EVENT_GAP = 20;      // s between event autosaves
const RETRY = 4;           // s clear of every blocker before a deferred autosave goes
const IDLE_MS = 4;         // a save that took longer than this waits for an idle callback
const LIFE_GAP = 600;      // ms: the lifecycle saves of one burst (hide → pagehide → beforeunload) write once
const BIG_BUY = 300;       // coins: a purchase this big is progress
const BIG_LOOT = new Set(['unique', 'set']);

// ---------------------------------------------------------------- the slots
/** slot n's storage keys */
export const slotKeys = n => (n === 1 ? { main: SAVE_KEY, prev: PREV_KEY } : { main: `${SAVE_KEY}.${n}`, prev: `${SAVE_KEY}.${n}.prev` });
const okSlot = n => Number.isInteger(n) && n >= 1 && n <= SLOTS;
const get = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
/** the slot this page loaded and saves to: the one played last (1 when none was ever picked) */
let deleted = false;       // the picker deleted the slot this page holds
const slot = (() => { const n = +get(SLOT_KEY); return okSlot(n) ? n : 1; })();
export const currentSlot = () => slot;
/** the slot the next boot loads (the page reloads onto it) */
export function setSlot(n) { if (okSlot(n)) try { localStorage.setItem(SLOT_KEY, String(n)); } catch (e) { /* */ } }
export const slotUsed = n => !!get(slotKeys(n).main);
/** slot n at a glance, for the title's picker (null: empty). A save that won't parse shows as damaged; its .prev
 *  still loads it */
export function slotInfo(n) {
  const raw = get(slotKeys(n).main);
  if (!raw) return null;
  try {
    const st = JSON.parse(raw), hs = st.heroes || {}, act = hs[st.activeHero] ? st.activeHero : 'chewy';
    const P = hs[act]?.player || st.player || {};
    const team = Object.keys(hs).filter(id => id === 'chewy' || st.flags?.[`${id}Joined`]);
    return { n, hero: act, name: P.name || 'Chewy', lvl: P.lvl || 1, team, day: st.day || 1, coins: st.coins || 0, playSec: st.playSec, at: st.savedAt || 0 };
  } catch (e) { return { n, damaged: true, at: 0 }; }
}
/** the slot Continue plays: the one played last when it has a save, else the one saved most recently (0: none) */
export function lastSlot() {
  const p = +get(SLOT_KEY), mine = okSlot(p) ? p : 1;
  if (slotUsed(mine)) return mine;
  let best = 0, at = -1;
  for (let n = 1; n <= SLOTS; n++) { const i = slotInfo(n); if (i && i.at > at) { best = n; at = i.at; } }
  return best;
}
/** wipe slot n (and its backup). The slot this page holds stops saving: its state would bring it back */
export function deleteSlot(n) {
  if (!okSlot(n)) return;
  const k = slotKeys(n);
  try { localStorage.removeItem(k.main); localStorage.removeItem(k.prev); } catch (e) { /* */ }
  if (n === slot) { mainGood = false; deleted = true; }
}
export const slotDeleted = () => deleted;

// ---------------------------------------------------------------- storage
let mainGood = false;      // the stored main save is one we read fine or wrote: safe to rotate into .prev
let recovered = false;     // loadSave fell back to .prev (the toast waits for the UI)
let quotaWarned = false;
let ui = null;             // for the quota toast
const stat = { writes: 0, lastAt: 0, lastMs: 0, avgMs: 0, bytes: 0, rotated: 0, failed: 0 };

const isQuota = e => !!e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014);
function warnQuota() {
  if (quotaWarned) return; quotaWarned = true;
  console.warn('[save] storage is full: the game could not be saved');
  try { ui?.toast?.("Your browser's storage is full, so the game couldn't save. Free up some space and it'll try again ♡", { icon: 'save', color: '#ffb0a0', duration: 8 }); } catch (e) { /* */ }
}

/** the save object → this slot's main key (the one it replaces → .prev). → true when it was written */
export function writeSave(data) {
  if (deleted) return false; // (the title's picker deleted this slot: nothing may write it back)
  const t0 = performance.now();
  const json = JSON.stringify({ ...data, savedAt: Date.now() }); // (savedAt: the picker's "last played")
  const { main: SAVE_KEY, prev: PREV_KEY } = slotKeys(slot);
  let ok = false;
  try {
    if (mainGood) {
      const cur = localStorage.getItem(SAVE_KEY);
      if (cur && cur !== json) { try { localStorage.setItem(PREV_KEY, cur); stat.rotated++; } catch (e) { if (!isQuota(e)) throw e; try { localStorage.removeItem(PREV_KEY); } catch (e2) { /* */ } } }
    }
    try { localStorage.setItem(SAVE_KEY, json); ok = true; }
    catch (e) {
      if (!isQuota(e)) throw e;
      try { localStorage.removeItem(PREV_KEY); localStorage.setItem(SAVE_KEY, json); ok = true; } // (the main save matters more than its backup)
      catch (e2) {
        if (!isQuota(e2)) throw e2;
        for (let n = 1; n <= SLOTS; n++) if (n !== slot) localStorage.removeItem(slotKeys(n).prev); // (then the other slots' backups)
        try { localStorage.setItem(SAVE_KEY, json); ok = true; } catch (e3) { if (isQuota(e3)) warnQuota(); else throw e3; }
      }
    }
  } catch (e) { /* storage unavailable (a private window, blocked site data) */ }
  const ms = performance.now() - t0;
  if (ok) { mainGood = true; stat.writes++; stat.lastAt = performance.now(); stat.bytes = json.length; } // (the quota toast stays once a session)
  else stat.failed++;
  stat.lastMs = ms; stat.avgMs = stat.avgMs ? stat.avgMs * 0.6 + ms * 0.4 : ms;
  return ok;
}

/** the save to boot from: the main slot, else .prev when the main one is damaged. validate(st) normalizes it (and may
 *  throw); a result with no heroes / player counts as damaged. → the validated state, or null for a new game */
export function loadSave(validate = st => st) {
  const read = raw => {
    const st = JSON.parse(raw);
    if (!st || typeof st !== 'object' || !st.version) throw new Error('not a save');
    const v = validate(st);
    if (!v || typeof v !== 'object' || !(v.player || v.heroes)) throw new Error('the save did not normalize');
    return v;
  };
  const { main: SAVE_KEY, prev: PREV_KEY } = slotKeys(slot);
  let raw = null;
  try { raw = localStorage.getItem(SAVE_KEY); } catch (e) { return null; }
  if (!raw) return null; // (no save: a new game; .prev belongs to whatever came before)
  try { const st = read(raw); mainGood = true; return st; }
  catch (e) { console.warn('[save] the main save is damaged; trying the backup', e); }
  try {
    const prev = localStorage.getItem(PREV_KEY);
    if (prev) { const st = read(prev); recovered = true; return st; } // (mainGood stays false: the damaged main isn't rotated over the good .prev)
  } catch (e) { console.warn('[save] the backup is damaged too', e); }
  return null;
}

// ---------------------------------------------------------------- what defers an autosave
/** → why an autosave must wait now ('' when it may go) */
export function blocker(G) {
  if (G.saveBlocked) return 'saveBlocked';
  if (G.titleActive || G.ui?.mode === 'title') return 'title';
  if (G.playerDead || G.state?.player?.life === 0) return 'down';
  if (G.ui?.iris?.active || G.housing?.busy) return 'transition';
  if (G.heroSwitching || G.heroFocus) return 'heroSwitch';
  if (G.introFocus || G.introJoinPending || G.cutscene) return 'cutscene';
  const H = G.heroes; if (H && (H.arrivals?.busy || H.arrivals?.selfBusy || H.poeJoin?.busy || H.stzJoin?.busy || H.gldJoin?.busy)) return 'joinScene'; // (an arrival's scene, a hand-in to the hero you play: actors/arrivals.js)
  const D = G.mode === 'dungeon' ? G.dungeon : null;
  if (D) {
    const b = D.boss, p = G.player?.pos;
    if (b?.alive && (b.aggro || b.introDone || (p && b.pos && b.pos.distanceTo(p) < 14))) return 'boss';
    if (D.zr?.seal?.want || D.zr?.arenaOn && b?.alive) return 'arena';
  }
  const B = G.build; if (B?.active && (B.tool || B.drag)) return 'build';
  const Dc = G.housing?.decor; if (Dc?.active && (Dc.hold || Dc.sel)) return 'decor';
  return '';
}

// ---------------------------------------------------------------- the scheduler
/** game.js: installAutosave(G) after G.save exists (and G.ui, when the UI loaded) */
export function installAutosave(G, { indicator } = {}) {
  ui = G.ui || null;
  const S = ui?.settings;
  if (S && !(S.autosave >= 0 && S.autosave < AUTOSAVE_MIN.length)) S.autosave = AUTOSAVE_DEFAULT; // (not stored until changed)
  const minutes = () => AUTOSAVE_MIN[S ? S.autosave : AUTOSAVE_DEFAULT] || 0;
  const A = {
    manual: false,           // (tests: the real clock stops; advance() drives it)
    now: 0,                  // s, real time since install (debounce, retry)
    play: 0,                 // s of play since the last save (the timed autosave)
    due: false,              // the timed autosave is due
    event: null,             // a pending event autosave: { name, at } (at: performance.now())
    lastEvent: -Infinity,    // A.now of the last event autosave
    blocked: '', clear: 0,   // the blocker now; s clear of blockers since one held a save back
    held: false,             // an autosave is waiting on a blocker
    idle: false,             // waiting for an idle callback
    log: [],                 // the last autosaves: { kind, at, ms, why }
    life: [],                // the last lifecycle saves (event types)
    stat,
  };

  // a save written anywhere (game.js save(), the menu, a mode change) restarts the timer and settles pending events
  let seenWrites = stat.writes;
  const noteWrites = () => {
    if (stat.writes === seenWrites) return;
    seenWrites = stat.writes; A.play = 0; A.due = false;
    if (A.event && stat.lastAt >= A.event.at) A.event = null;
  };

  function run(kind, why) {
    const go = deadline => {
      A.idle = false;
      if (G.saveBlocked) return;
      const before = stat.writes;
      try { G.save?.(); } catch (e) { console.warn('[autosave] failed', e); }
      noteWrites();
      if (stat.writes > before) {
        A.log.push({ kind, why, at: +A.now.toFixed(1), ms: +stat.lastMs.toFixed(2), idle: !!deadline });
        if (A.log.length > 20) A.log.shift();
        indicator?.show();
      }
    };
    // a costly serialise waits for the browser's idle time (a 3 s cap), never mid-frame in a fight
    if (stat.avgMs > IDLE_MS && typeof requestIdleCallback === 'function') { A.idle = true; requestIdleCallback(go, { timeout: 3000 }); }
    else go(null);
  }

  /** one step of the scheduler. dt: s of real time; playing: whether this time counts as play */
  function tick(dt, playing) {
    noteWrites();
    A.now += dt;
    const mins = minutes();
    if (playing && mins > 0) { A.play += dt; if (A.play >= mins * 60) A.due = true; }
    if (mins <= 0) A.due = false;
    const want = A.due ? 'timer' : A.event && A.now - A.lastEvent >= EVENT_GAP ? 'event' : null;
    if (!want || A.idle) { A.held = false; A.clear = 0; A.blocked = blocker(G); return; }
    A.blocked = blocker(G);
    if (A.blocked) { A.held = true; A.clear = 0; return; }
    if (A.held) { A.clear += dt; if (A.clear < RETRY) return; } // (the blocker just cleared: give it a few seconds)
    A.held = false; A.clear = 0;
    const why = want === 'event' ? A.event.name : `${mins} min`;
    if (want === 'event') { A.lastEvent = A.now; A.event = null; }
    A.due = false; A.play = 0;
    run(want, why);
  }
  A.tick = tick;
  /** tests: s seconds of the clock in 1 s steps (play: whether it counts as play time; default: as the page would) */
  A.advance = (s, o = {}) => { for (let t = s; t > 1e-6; t -= 1) tick(Math.min(1, t), o.play ?? playingNow()); return A.state(); };
  A.state = () => ({ now: +A.now.toFixed(2), play: +A.play.toFixed(2), due: A.due, event: A.event?.name || null, blocked: blocker(G), held: A.held, clear: A.clear, minutes: minutes(), idle: A.idle, writes: stat.writes, lastMs: stat.lastMs, avgMs: stat.avgMs, bytes: stat.bytes, rotated: stat.rotated, log: A.log.slice() });
  A.flag = name => { if (!A.event) A.event = { name, at: performance.now() }; }; // (later events in the window join the first)
  G.autosave = A;

  // ---- the events that count as progress (names: grep Events.emit)
  const flag = name => () => A.flag(name);
  for (const n of ['quest:update', 'player:levelup', 'hero:levelup', 'village:changed', 'building:levelup', 'house:upgraded', 'hero:joined',
    'village:saved', 'villager:rescued', 'village:campCleared', 'dungeon:cleared', 'region:cleared', 'pinnacle:cleared', 'tier:unlocked',
    'spirit:unlocked', 'expedition:sent', 'expedition:back', 'sighting:cleared', 'village:celebrate', 'stash:tab', 'portal:opened']) Events.on(n, flag(n)); // (sighting:cleared: a bounty paid, cozy/peacefulRun.js; stash:tab: one bought, renamed or recoloured, rpg/actions.js; portal:opened: a Town Portal's floor to come back to, dungeon/townPortal.js)
  Events.on('item:pickup', e => { if (BIG_LOOT.has(e?.item?.rarity)) A.flag('item:pickup'); });
  Events.on('coins:changed', e => { if (e?.delta <= -BIG_BUY) A.flag('purchase'); });
  Events.on('scavenge:dig', e => { if (e?.find) A.flag('scavenge:dig'); }); // (a dig that turned up furniture: cozy/scavengeWorld.js)

  // ---- the real clock: play time counts while the page is visible and the game runs
  const playingNow = () => !document.hidden && !G.titleActive && !G.ui?.isPaused?.();
  let last = performance.now();
  // the play time on the picker's card: counted for a game started since slots came in (an older save has no playSec,
  // and a part count would read wrong)
  const playClock = dt => { if (typeof G.state?.playSec === 'number') G.state.playSec += dt; };
  setInterval(() => {
    const t = performance.now(), dt = Math.min(5, (t - last) / 1000); last = t; // (a throttled background tab doesn't bank minutes)
    if (!A.manual) { const p = playingNow(); tick(dt, p); if (p) G.coop?.cur ? G.coop.primary(() => playClock(dt)) : playClock(dt); }
  }, 1000);

  // ---- the page lifecycle, every platform: one save per burst (hide → pagehide → beforeunload, or Quit then close)
  // (only lifecycle saves fold together: a change made just after an ordinary save is still written on the way out)
  let lifeAt = -Infinity;
  const lifeSave = e => {
    if (G.titleActive || G.saveBlocked) return;
    const t = performance.now(); if (t - lifeAt < LIFE_GAP) return;
    try { G.save?.(); lifeAt = t; A.life.push(e?.type || '?'); if (A.life.length > 10) A.life.shift(); } catch (err) { /* storage unavailable */ }
  };
  addEventListener('beforeunload', lifeSave);
  addEventListener('pagehide', lifeSave);
  document.addEventListener('visibilitychange', () => { if (document.hidden) lifeSave(); });

  // ---- the boot fell back to .prev: say so, gently, once the game is on screen
  if (recovered) setTimeout(() => { try { ui?.toast?.('Your last save was a little scrambled, so we loaded the one just before it ♡', { icon: 'save', color: '#ffd8a8', duration: 7 }); } catch (e) { /* */ } }, 2500);
  return A;
}
export const saveRecovered = () => recovered;
