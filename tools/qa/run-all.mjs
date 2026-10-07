// Run every QA scenario sequentially and print a summary.  usage: node tools/qa/run-all.mjs [s1 s3 ...]
// Needs the dev server on :5173 (npx vite --port 5173). Each scenario is also runnable on its own.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const ALL = ['gen-fuzz', 's1-roundtrip', 's2-combat', 's3-bosses', 's4-death', 's5-village-save', 's7-inventory', 's8-dialogue', 's9-input', 's10-misc', 's11-story-title', 's12-heroes', 's13-regions', 's14-village-plan', 's15-homestead', 's16-tutorials', 's17-housing', 's18-furniture-sources', 's19-charge', 's20-poe', 's21-zones', 's22-zone-dungeons', 's23-zone-villages', 's24-render-health', 's25-gamepad', 's26-deck', 'profile-horde'];
// s26-deck: the Steam Deck profile (CONTROLS §10). Its full panel sweep (tools/qa/deck-ui.mjs) and the frame times
// (tools/qa/deck-perf.mjs) run on their own.
// s24-render-health builds and serves its own production bundle (the NaN probe, flash-free sessions, menu first opens:
// ROADMAP R-7 / R-8).
// profile-horde: the horde perf gate (ROADMAP Z-B5) — 150 / 250 mixed monsters in a Burrow floor and a region for Chewy,
// Moka and Poe; FAILS when a 150 fight's CPU frame p95 is over max(8 ms, its floor-alone baseline + 3 ms) after one
// retry (ZONES §7.1; prints a machine-load verdict); 250 is reported only. ~5 min. `run-all s` skips it (scenario
// prefixes), `run-all profile` runs it alone.
const want = process.argv.slice(2);
const list = want.length ? ALL.filter(n => want.some(w => n.startsWith(w))) : ALL;
const summary = [];
for (const name of list) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(dir, name + '.mjs')], { encoding: 'utf8', timeout: 15 * 60 * 1000, maxBuffer: 64 * 1024 * 1024 });
  const out = (r.stdout || '') + (r.stderr || '');
  process.stdout.write(out);
  const fails = out.split('\n').filter(l => /^\s+FAIL\s/.test(l)).map(l => l.replace(/^\s+FAIL\s+/, '').split('  — ')[0]);
  summary.push({ name, code: r.status, secs: ((Date.now() - t0) / 1000) | 0, fails });
}
console.log('\n================ QA SUMMARY ================');
for (const s of summary) {
  console.log(`${s.code === 0 ? 'PASS' : 'FAIL'}  ${s.name.padEnd(16)} ${String(s.secs).padStart(4)}s  ${s.fails.length ? s.fails.length + ' failing checks' : ''}`);
  for (const f of s.fails) console.log(`        - ${f}`);
}
process.exit(summary.some(s => s.code !== 0) ? 1 : 0);
