// Refined-rig pipeline driver: export from the dev server, refine in Blender, write public/rigs/<who>.{json,bin,png}.
//   node tools/blender/build.mjs [chewy shadow ...] [--tex=1024] [--tris=N] [--voxel=0.0035] [--fillet=16] [--aostr=0.55] [--blend]
// Needs the dev server (npm run dev) and Blender 4.x (BLENDER env var, default: the standard Windows install path).
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const BLENDER = process.env.BLENDER || 'C:/Program Files/Blender Foundation/Blender 4.3/blender.exe';
const args = process.argv.slice(2);
const who = args.filter(a => !a.startsWith('--'));
const opts = args.filter(a => a.startsWith('--')).map(a => a.slice(2)).map(a => (a.includes('=') ? a : a + '=1'));
const list = who.length ? who : ['chewy', 'shadow'];

execFileSync('node', [path.join(HERE, 'export-rigs.mjs'), ...list], { stdio: 'inherit', cwd: ROOT });
for (const w of list) {
  const out = execFileSync(BLENDER, ['-b', '--factory-startup', '-P', path.join(HERE, 'refine_rig.py'), '--', path.join(HERE, 'work', w + '.json'), path.join(ROOT, 'public', 'rigs'), ...opts], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 });
  const lines = out.split('\n').filter(l => /^\[refine|Error|Traceback/.test(l) && !/baked:/.test(l));
  console.log(lines.join('\n'));
  if (!/wrote /.test(out)) { console.error(out.slice(-3000)); process.exit(1); }
}
