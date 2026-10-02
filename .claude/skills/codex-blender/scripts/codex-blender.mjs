#!/usr/bin/env node
// Run a Blender asset task on the Codex CLI (GPT-6.1-Sol by default), directed by Claude.
//
//   node .claude/skills/codex-blender/scripts/codex-blender.mjs start  --task NAME --brief BRIEF.md [--kind model|concept] [--image REF.png]... [--effort high] [--model gpt-6.1-sol]
//   node .claude/skills/codex-blender/scripts/codex-blender.mjs resume --task NAME --message FEEDBACK.md [--image SHOT.png]...
//   node .claude/skills/codex-blender/scripts/codex-blender.mjs status --task NAME
//
// Each task lives in tools/blender/work/codex/NAME/ (git-ignored):
//   brief.md, prompt-*.md (what Codex was sent), events-*.jsonl (Codex's event stream), reply-*.md (its final
//   message), session.json (the thread id, for resume), and whatever Codex builds (build_NAME.py, NAME.blend,
//   NAME.glb, preview/sheet.png, preview/game.png, preview/stats.json, report.md).
// --kind concept: Codex generates model-sheet images with its image-generation tool, working from
// templates/concept-preamble.md, instead of Blender files. The images land in NAME/concepts/; everything the
// thread generated is also copied from Codex's generated_images folder, as a fallback.
// Codex runs in the workspace-write sandbox (the unelevated Windows variant). Its working root is the task folder,
// and public/models/ is its only other writable folder. It can read the whole repo.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKILL = path.resolve(HERE, '..');
const REPO = path.resolve(SKILL, '../../..');
const WORK = path.join(REPO, 'tools/blender/work/codex');
const MODELS = path.join(REPO, 'public/models');
const MIN_CODEX = [0, 159, 0]; // gpt-6.1-sol needs Codex CLI 0.159+

const [cmd, ...rest] = process.argv.slice(2);
const opt = { images: [] };
for (let i = 0; i < rest.length; i++) {
  const a = rest[i], v = rest[i + 1];
  if (a === '--task') { opt.task = v; i++; }
  else if (a === '--brief') { opt.brief = v; i++; }
  else if (a === '--message') { opt.message = v; i++; }
  else if (a === '--image') { opt.images.push(v); i++; }
  else if (a === '--effort') { opt.effort = v; i++; }
  else if (a === '--model') { opt.model = v; i++; }
  else if (a === '--kind') { opt.kind = v; i++; }
  else { console.error('unknown argument: ' + a); process.exit(2); }
}
const die = m => { console.error('codex-blender: ' + m); process.exit(1); };
if (!['start', 'resume', 'status'].includes(cmd)) die('usage: start | resume | status  --task NAME ... (see the header of this file)');
if (!opt.task || !/^[a-z0-9][a-z0-9_-]*$/.test(opt.task)) die('--task NAME (lowercase letters, digits, - and _)');
const dir = path.join(WORK, opt.task);
const sessFile = path.join(dir, 'session.json');
const readSess = () => (fs.existsSync(sessFile) ? JSON.parse(fs.readFileSync(sessFile, 'utf8')) : null);

if (cmd === 'status') {
  const s = readSess();
  if (!s) die('no session for task ' + opt.task);
  const files = fs.readdirSync(dir).filter(f => !f.startsWith('events-'));
  console.log(JSON.stringify({ ...s, dir, files }, null, 2));
  const prev = path.join(dir, 'preview/stats.json');
  if (fs.existsSync(prev)) console.log('preview stats: ' + fs.readFileSync(prev, 'utf8'));
  process.exit(0);
}

// ------------------------------------------------------------------ the codex binary (global if new enough, else npx)
function codexCmd() {
  if (process.env.CODEX_BIN) return { bin: process.env.CODEX_BIN, pre: [] };
  const v = spawnSync('codex', ['--version'], { encoding: 'utf8', shell: true });
  const m = /(\d+)\.(\d+)\.(\d+)/.exec(v.stdout || '');
  const ok = m && [1, 2, 3].map(i => +m[i]).reduce((acc, n, i) => (acc !== 0 ? acc : Math.sign(n - MIN_CODEX[i])), 0) >= 0;
  return ok ? { bin: 'codex', pre: [] } : { bin: 'npx', pre: ['-y', '@openai/codex@latest'] };
}

// ------------------------------------------------------------------ prompt
fs.mkdirSync(dir, { recursive: true }); fs.mkdirSync(MODELS, { recursive: true });
const n = (readSess()?.rounds ?? 0) + 1;
let prompt;
// {{TASK}} / {{TASK_DIR}} / {{REPO}} / {{MODELS_DIR}} in the contract, briefs and feedback become real paths
const slash = p => p.replace(/\\/g, '/');
const fill = t => t.replaceAll('{{TASK}}', opt.task).replaceAll('{{TASK_DIR}}', slash(dir)).replaceAll('{{REPO}}', slash(REPO)).replaceAll('{{MODELS_DIR}}', slash(MODELS));
if (cmd === 'start') {
  if (!opt.brief || !fs.existsSync(opt.brief)) die('--brief FILE (write it from templates/brief.md)');
  if (readSess()) die(`task ${opt.task} already has a session: use resume (or delete ${dir} to start over)`);
  const brief = fill(fs.readFileSync(opt.brief, 'utf8'));
  fs.writeFileSync(path.join(dir, 'brief.md'), brief);
  if (opt.kind && !['model', 'concept'].includes(opt.kind)) die('--kind model | concept');
  const pre = fill(fs.readFileSync(path.join(SKILL, opt.kind === 'concept' ? 'templates/concept-preamble.md' : 'templates/codex-preamble.md'), 'utf8'));
  prompt = pre + '\n\n---\n\n# The brief\n\n' + brief;
} else {
  if (!readSess()) die('no session for task ' + opt.task + ': use start');
  if (!opt.message || !fs.existsSync(opt.message)) die('--message FILE (the director\'s feedback)');
  prompt = '# Feedback from the director (round ' + n + ')\n\n' + fill(fs.readFileSync(opt.message, 'utf8')) +
    '\n\nApply it, re-export, re-render the preview, look at it yourself, and update report.md. End with the same report format as before.';
}
for (const im of opt.images) if (!fs.existsSync(im)) die('image not found: ' + im);
fs.writeFileSync(path.join(dir, `prompt-${n}.md`), prompt);

// ------------------------------------------------------------------ run
const model = opt.model || readSess()?.model || 'gpt-6.1-sol', effort = opt.effort || readSess()?.effort || 'high';
const { bin, pre } = codexCmd();
// (TOML literal strings in single quotes: they survive the Windows shell that npm's codex shim needs)
const common = ['-m', model, '-c', `model_reasoning_effort='${effort}'`, '-c', "windows.sandbox='unelevated'", '-s', 'workspace-write',
  '-C', dir, '--add-dir', MODELS, '--json', '-o', path.join(dir, `reply-${n}.md`), ...opt.images.flatMap(im => ['-i', path.resolve(im)])];
const args = cmd === 'start' ? [...pre, 'exec', ...common, '-'] : [...pre, 'exec', ...common, 'resume', readSess().thread, '-'];
console.log(`codex-blender: ${cmd} ${opt.task} (round ${n}) on ${model} / ${effort} via ${bin}${pre.length ? ' (npx: install Codex CLI 0.159+ globally to skip this)' : ''}`);
// one run per task at a time (a second resume on the same thread would interleave both turns)
const lock = path.join(dir, 'run.lock');
if (fs.existsSync(lock)) {
  const L = JSON.parse(fs.readFileSync(lock, 'utf8') || '{}');
  let alive = false; try { process.kill(L.pid, 0); alive = true; } catch { /* stale */ }
  if (alive) die(`task ${opt.task} is already running (round ${L.round}, pid ${L.pid}, since ${L.since}); wait for it to finish`);
}
fs.writeFileSync(lock, JSON.stringify({ pid: process.pid, round: n, since: new Date().toISOString() }));
const unlock = () => { try { if (JSON.parse(fs.readFileSync(lock, 'utf8')).pid === process.pid) fs.unlinkSync(lock); } catch { /* gone */ } };
process.on('exit', unlock);
const t0 = Date.now();
const ev = fs.createWriteStream(path.join(dir, `events-${n}.jsonl`));
const win = process.platform === 'win32', q = a => (win && /[\s"&|<>^()]/.test(a) ? `"${a.replace(/"/g, '""')}"` : a);
const child = spawn(bin, win ? args.map(q) : args, { cwd: dir, shell: win, stdio: ['pipe', 'pipe', 'pipe'] });
child.stdin.end(prompt);
let thread = readSess()?.thread || null, usage = null, buf = '', cmds = 0, failed = null;
child.stdout.on('data', d => {
  ev.write(d); buf += d;
  let i; while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    try {
      const e = JSON.parse(line);
      if (e.type === 'thread.started') thread = e.thread_id;
      if (e.type === 'turn.completed') usage = e.usage;
      if (e.type === 'item.completed' && e.item?.type === 'command_execution') cmds++;
      if (e.type === 'turn.failed') failed = e.error?.message || 'turn failed';
      if (e.type === 'error' || e.type === 'turn.failed') console.error('codex error: ' + JSON.stringify(e.error || e).slice(0, 400));
    } catch { /* not a JSON line */ }
  }
});
let err = '';
child.stderr.on('data', d => { err += d; });
child.on('close', code => {
  ev.end();
  const kind = opt.kind || readSess()?.kind || 'model';
  const s = { task: opt.task, kind, thread, model, effort, rounds: n, updated: new Date().toISOString(), dir };
  if (thread) fs.writeFileSync(sessFile, JSON.stringify(s, null, 2));
  const reply = path.join(dir, `reply-${n}.md`);
  console.log(`codex-blender: exit ${code} after ${((Date.now() - t0) / 60000).toFixed(1)} min, ${cmds} shell commands, usage ${JSON.stringify(usage)}`);
  if (code !== 0 && err) console.error(err.split('\n').filter(l => /error|Error/.test(l)).slice(-8).join('\n'));
  if (fs.existsSync(reply)) console.log('\n===== Codex reply =====\n' + fs.readFileSync(reply, 'utf8'));
  // concept images: also collect everything this thread generated (in case Codex's own copy step failed)
  const home = process.env.CODEX_HOME || path.join(process.env.USERPROFILE || process.env.HOME || '', '.codex');
  const gen = thread && path.join(home, 'generated_images', thread);
  if (gen && fs.existsSync(gen)) {
    const cdir = path.join(dir, 'concepts', 'generated'); fs.mkdirSync(cdir, { recursive: true });
    const got = fs.readdirSync(gen).filter(f => /\.(png|jpe?g|webp)$/i.test(f));
    for (const f of got) fs.copyFileSync(path.join(gen, f), path.join(cdir, f));
    if (got.length) console.log(`\ngenerated images (${got.length}) copied to ${cdir}`);
  }
  const cons = path.join(dir, 'concepts');
  if (fs.existsSync(cons)) console.log('concepts: ' + fs.readdirSync(cons).filter(f => /\.(png|jpe?g|webp|md)$/i.test(f)).map(f => path.join(cons, f)).join('\n          '));
  const prev = path.join(dir, 'preview');
  if (fs.existsSync(prev)) console.log('\npreview: ' + fs.readdirSync(prev).map(f => path.join(prev, f)).join('\n         '));
  if (failed) { // (codex exits 0 even when the turn failed, e.g. "model is at capacity": the work may be half done)
    console.error(`
codex-blender: THE TURN FAILED (${failed}). No final report was written; the files may be half-way.` +
      ` Review what exists, then resume the same task (it keeps its context) once the model is available.`);
    process.exit(3);
  }
  process.exit(code ?? 1);
});
