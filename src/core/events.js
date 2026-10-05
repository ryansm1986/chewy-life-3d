// Tiny global event bus.
const map = new Map();
export const Events = {
  on(name, fn) { if (!map.has(name)) map.set(name, new Set()); map.get(name).add(fn); return () => map.get(name)?.delete(fn); },
  once(name, fn) { const off = Events.on(name, (...a) => { off(); fn(...a); }); return off; },
  off(name, fn) { map.get(name)?.delete(fn); },
  emit(name, ...args) { const s = map.get(name); if (s) for (const fn of [...s]) fn(...args); },
  /** how many listeners are subscribed in all (QA leak checks) */
  listenerCount() { let n = 0; for (const s of map.values()) n += s.size; return n; },
};
