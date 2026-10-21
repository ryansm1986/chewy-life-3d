// Couch co-op on the production bundle (docs/COOP.md): `vite build` into a temp dir, `vite preview` it, then run s49 and
// s50 against it (BASE=…): the HUD and the panes are lazy chunks, so this catches "works in dev, missing in the build".
// usage: node tools/qa/prod-coop.mjs [s49 parts, e.g. ace]
import { build, preview } from 'vite';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chewy-prod-coop-'));
await build({ logLevel: 'error', build: { outDir, emptyOutDir: true } });
const chunks = fs.readdirSync(path.join(outDir, 'assets')).filter(f => /coop/i.test(f));
console.log('co-op chunks in the bundle:', chunks.join(', ') || 'NONE');
const server = await preview({ logLevel: 'error', build: { outDir }, preview: { port: 0, strictPort: false } });
const BASE = server.resolvedUrls.local[0].replace(/\/$/, '');
let failed = chunks.length < 2 ? 1 : 0;
for (const [file, env] of [['s49-coop.mjs', { S49_ONLY: process.argv[2] || 'abcdefghi' }], ['s50-coop-panes.mjs', {}]]) {
  const r = await new Promise(res => { // (async: the preview server is in this process and must keep serving)
    const c = spawn(process.execPath, [path.join(dir, file)], { env: { ...process.env, ...env, BASE } });
    let o = ''; c.stdout.on('data', d => { o += d; }); c.stderr.on('data', d => { o += d; });
    c.on('close', status => res({ status, out: o }));
  });
  const out = r.out;
  process.stdout.write(out.split('\n').filter(l => /FAIL|^==|^  ERR|^   /.test(l)).join('\n') + '\n');
  if (r.status !== 0) failed++;
}
await server.close();
fs.rmSync(outDir, { recursive: true, force: true });
console.log(`== production co-op: ${failed ? 'FAIL' : 'PASS'}`);
process.exit(failed ? 1 : 0);
