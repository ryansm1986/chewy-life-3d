// The desktop shell's log file (docs/DESKTOP.md "Troubleshooting", ROADMAP CT-10): userData/logs/main.log, so a blank
// window or a crash on a Steam Deck in Game Mode (no terminal to read) can be diagnosed afterwards. Plain Node, so
// tools/qa/desktop-env-unit.mjs tests it without Electron; main.cjs opens it and routes the main process's console to it.
//
// openLog({ dir, name = 'main', maxBytes = 1 MiB, keep = 2, now }) → { file, ok, write(level, text) }
//   One line per record: `<ISO time> <level> <text>` (continuation lines of a multi-line text indented by two spaces).
//   Appends synchronously (the volume is low). When main.log is over maxBytes at the start or would grow past it, it is
//   renamed main.1.log (main.1.log → main.2.log, …; `keep` old files). It never throws: a folder it can't write just means
//   no log (after 5 failures in a row it stops trying).
// wrapConsole(console, log): console.log / info / warn / error / debug still print, and also append to the log.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const util = require('node:util');

const MAX_TEXT = 8000;

/** main.log → main.1.log → … → main.<keep>.log (the oldest dropped) */
function rotate(dir, name = 'main', keep = 2) {
  const f = i => path.join(dir, i ? `${name}.${i}.log` : `${name}.log`);
  try { fs.rmSync(f(keep), { force: true }); } catch (e) { /* */ }
  for (let i = keep - 1; i >= 0; i--) { try { if (fs.existsSync(f(i))) fs.renameSync(f(i), f(i + 1)); } catch (e) { /* */ } }
}

function openLog({ dir, name = 'main', maxBytes = 1024 * 1024, keep = 2, now = () => new Date() } = {}) {
  const file = path.join(dir, `${name}.log`);
  let size = 0, fails = 0, ok = true;
  try {
    fs.mkdirSync(dir, { recursive: true });
    try { size = fs.statSync(file).size; } catch (e) { size = 0; }
    if (size > maxBytes) { rotate(dir, name, keep); size = 0; }
  } catch (e) { ok = false; fails = 1; }
  const log = {
    file,
    get ok() { return ok; },
    /** append one record; false if it couldn't */
    write(level, text) {
      if (fails >= 5) return false;
      try {
        let t = String(text);
        if (t.length > MAX_TEXT) t = t.slice(0, MAX_TEXT) + ` … (${t.length - MAX_TEXT} more characters)`;
        const line = Buffer.from(`${now().toISOString()} ${String(level).padEnd(5)} ${t.replace(/\r?\n/g, '\n  ')}\n`);
        if (size > 0 && size + line.length > maxBytes) { rotate(dir, name, keep); size = 0; }
        fs.appendFileSync(file, line);
        size += line.length; fails = 0; ok = true;
        return true;
      } catch (e) { fails++; ok = false; return false; }
    },
  };
  return log;
}

/** route console.* to the log as well (each still prints as before) */
function wrapConsole(c, log) {
  for (const [k, level] of [['log', 'info'], ['info', 'info'], ['warn', 'warn'], ['error', 'error'], ['debug', 'debug']]) {
    const orig = typeof c[k] === 'function' ? c[k].bind(c) : null;
    c[k] = (...a) => {
      try { orig?.(...a); } catch (e) { /* (no stdout: a GUI launch) */ }
      try { log.write(level, util.format(...a)); } catch (e) { /* never */ }
    };
  }
  return c;
}

module.exports = { openLog, wrapConsole, rotate };
