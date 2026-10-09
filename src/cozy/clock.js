// The world clock (docs/COZY.md §4.4, ROADMAP CZ-1). Pure (no three.js, no DOM): node-tested in tools/test-rpg.mjs
// "COZY".
//
//   state.cozy.clock = { h, wall }
//     h     world hours of play: they run in every mode (the village, interiors, regions, dungeons) at the village day
//           clock's rate (24 h in 14 real minutes: 1 game hour = 35 s), stop while the game is paused (dt = 0, like the
//           day clock), and only ever go up. Sleeping adds the hours it skips (sleepHours).
//     wall  the wall-clock high-water mark in ms (Date.now): the last moment the game ran. The runtime
//           (cozy/expeditionRun.js) raises it about once a second while the frame loop runs, so every save carries it;
//           it never goes down. Time away is measured from it (awayHours).
//
// The village's own day clock (gfx/sky.js DayNight, state.day / state.hour) is untouched: it still only moves in the
// village and interiors, and the farm, income and shop days keep following it. The world clock is separate.
//
// Time away (§4.4.1): on load and when a hidden tab comes back, the real time since `wall` turns into world hours at
// the same rate, capped at OFFLINE_CAP_H per absence. Tamper guards: a clock set backwards (now < wall) gives 0 and the
// mark stays where it was; a clock set far forwards only ever gives the cap, and the mark moves up to that future time,
// so setting it back afterwards gives nothing until real time passes the mark. An old save has no `wall`: its first
// load counts 0 and sets it (docs/COZY.md §9).

/** real seconds per world hour: the village day clock's rate (gfx/sky.js: 24 h every 14 minutes) */
export const SECS_PER_HOUR = 14 * 60 / 24; // 35
/** the most world hours one absence can count (tunable) */
export const OFFLINE_CAP_H = 8;
/** sleeping wakes you at 6:30 (world/services.js G.sleep) */
export const WAKE_HOUR = 6.5;

const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
/** a clock record made whole: { h ≥ 0, wall ≥ 0 } */
export function fillClock(c) {
  c = c && typeof c === 'object' && !Array.isArray(c) ? c : {};
  c.h = Math.max(0, num(c.h));
  c.wall = Math.max(0, num(c.wall));
  return c;
}
const clk = state => (state.cozy ||= {}).clock = fillClock(state.cozy.clock);
/** world hours so far */
export const worldHours = state => clk(state).h;
/** the world day (a world day is 24 world hours; errands, refills and the like roll over on it) */
export const worldDay = h => Math.floor(Math.max(0, h) / 24);
/** add world hours (never negative) → the new total */
export function addHours(state, h) {
  const c = clk(state);
  if (num(h) > 0) c.h += h;
  return c.h;
}
/** the per-frame tick: dt real seconds of unpaused play → world hours */
export const tickClock = (state, dt) => addHours(state, num(dt) / SECS_PER_HOUR);
/** raise the high-water mark to `now` (ms); it never goes down → the mark */
export function markWall(state, now) {
  const c = clk(state);
  if (num(now) > c.wall) c.wall = now;
  return c.wall;
}
/** How much time away counts at `now` (ms), without changing anything →
 *  { ms (real time since the mark; negative: the clock went back), raw (uncapped world hours), hours (what counts),
 *    capped, backwards, first (no mark yet: an old save or a new game) } */
export function awayHours(state, now) {
  const c = clk(state);
  if (!(c.wall > 0)) return { ms: 0, raw: 0, hours: 0, capped: false, backwards: false, first: true };
  const ms = num(now) - c.wall;
  if (ms <= 0) return { ms, raw: 0, hours: 0, capped: false, backwards: ms < 0, first: false };
  const raw = ms / 1000 / SECS_PER_HOUR;
  return { ms, raw, hours: Math.min(raw, OFFLINE_CAP_H), capped: raw > OFFLINE_CAP_H, backwards: false, first: false };
}
/** Count the time away at `now`: the hours are added to the clock and the mark moves up to `now` (if later) →
 *  awayHours' record */
export function catchUp(state, now) {
  const a = awayHours(state, now);
  addHours(state, a.hours);
  markWall(state, now);
  return a;
}
/** the hours a night's sleep skips, from the village hour to 6:30 the next morning (G.sleep always crosses 6:00) */
export function sleepHours(hour) {
  const h = ((num(hour) % 24) + 24) % 24;
  return h < WAKE_HOUR ? WAKE_HOUR - h : 24 - h + WAKE_HOUR;
}

// ------------------------------------------------------------------ words
/** a duration in world hours, the board's way: "about 6 h", "about 2½ h", "under an hour" */
export function aboutHours(h) {
  h = Math.max(0, num(h));
  if (h < 0.75) return 'under an hour';
  const r = Math.round(h * 2) / 2;
  return `about ${Math.floor(r)}${r % 1 ? '½' : ''} h`;
}
/** what's left of a crew's trip: "back in about 2 h", "back in under an hour", "any minute now" */
export function backIn(left) {
  left = num(left);
  if (left <= 0.15) return 'any minute now';
  if (left < 0.75) return 'back in under an hour';
  return `back in ${aboutHours(left)}`;
}
/** the village hour a trip ends at → "back by evening" (the part of the day; "tomorrow" past midnight) */
export function backBy(hourNow, hours) {
  const t = num(hourNow) + Math.max(0, num(hours)), h = ((t % 24) + 24) % 24, next = t >= 24;
  const part = h < 5 ? 'the small hours' : h < 11 ? 'morning' : h < 13.5 ? 'midday' : h < 17 ? 'afternoon' : h < 21 ? 'evening' : 'night';
  if (next && t >= 48) return 'back in a couple of days';
  if (part === 'the small hours') return next ? 'back in the small hours' : 'back late tonight';
  return next ? (part === 'night' ? 'back tomorrow night' : `back by tomorrow ${part}`) : part === 'night' ? 'back tonight' : `back by ${part}`;
}
/** real time for the away card: "3 h 12 min", "4 min", "a few seconds" */
export function realSpan(ms) {
  const s = Math.max(0, num(ms)) / 1000;
  if (s < 50) return 'a few seconds';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), mm = m % 60;
  if (h < 48) return mm ? `${h} h ${mm} min` : `${h} h`;
  const d = Math.round(h / 24);
  return `${d} days`;
}
