// The debug menu's password for the QA (docs/DEBUG.md). The repo is public, so the word is never written in tracked
// files: it comes from the environment (PAWHAVEN_DEBUG_PASS) or a git-ignored local file (tools/qa/.debug-pass, one
// line). Without either, DEBUG_PASS is null and the tests skip the password checks (a SKIP line, not a FAIL): debug-on
// is then set up through the remembered localStorage flag, and the prompt is tested with a wrong password only.
import fs from 'node:fs';

function read() {
  const env = process.env.PAWHAVEN_DEBUG_PASS;
  if (env && env.trim()) return env.trim();
  try { const s = fs.readFileSync(new URL('./.debug-pass', import.meta.url), 'utf8').trim(); return s || null; } catch (e) { return null; }
}
export const DEBUG_PASS = read();
export const skipNote = what => console.log(`  SKIP  ${what} (no debug password: set PAWHAVEN_DEBUG_PASS or create tools/qa/.debug-pass)`);
