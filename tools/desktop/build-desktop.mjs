// The desktop app build (docs/DESKTOP.md, docs/CONTROLS.md §5 and §11, ROADMAP CT-4):
//   npm run build:desktop                 Windows x64 + Linux x64 → release/desktop/
//   npm run build:desktop -- --win        only Windows (a portable .exe and a .zip)
//   npm run build:desktop -- --linux      only Linux (an AppImage and a .tar.gz for SteamOS)
//   npm run build:desktop -- --dir        unpacked folders only (win-unpacked/, linux-unpacked/): quick, for the QA
// 1. the game: a production build with relative URLs (base './', as itch) into dist-desktop/app/game/, plus the
//    licences of what ships in it;
// 2. the app: tools/desktop/main.cjs + preload.cjs + icon.png and a small package.json next to the game;
// 3. electron-builder packs it with the Electron from devDependencies (asar, no node_modules: the app has no runtime
//    dependencies), never publishes. It gets Electron already unpacked (Windows: node_modules/electron/dist; Linux: the
//    official zip, downloaded once into node_modules/.cache/pawhaven-desktop/ and unzipped there): its own
//    unzip-then-rename step fails on Windows while Defender scans the fresh folder (EPERM on the rename);
// 4. the Linux AppImage and .tar.gz are written here (electron-builder makes linux-unpacked/): its AppImage step needs
//    Linux, and a tar made on Windows can't carry the executable bits. tools/desktop/appimage.mjs writes the AppImage
//    (the type-2 runtime electron-builder ships + a SquashFS it builds itself); the tar sets the modes (the pawhaven
//    binary, chrome_crashpad_handler, chrome-sandbox and the .so libraries 0755, the rest 0644). Check an AppImage with
//    tools/desktop/verify-squashfs.py.
// Electron is a devDependency only: the web build (vite) and the itch build (tools/build-itch.mjs) never see it.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { build as viteBuild } from 'vite';
import { createRequire } from 'node:module';
import { buildAppImage } from './appimage.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = path.join(ROOT, 'tools/desktop');
const APP = path.join(ROOT, 'dist-desktop/app');
const OUT = path.join(ROOT, 'release/desktop');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const electronVersion = JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules/electron/package.json'), 'utf8')).version;
const argv = process.argv.slice(2);
const DIR_ONLY = argv.includes('--dir');
const WANT_WIN = argv.includes('--win') || !argv.includes('--linux');
const WANT_LINUX = argv.includes('--linux') || !argv.includes('--win');
const MB = n => (n / 2 ** 20).toFixed(1) + ' MB';
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]));
const t0 = Date.now();

// ---- 1. the game
console.log(`== building the game (base ./) -> ${path.relative(ROOT, APP)}/game`);
fs.rmSync(path.join(ROOT, 'dist-desktop'), { recursive: true, force: true });
await viteBuild({ root: ROOT, base: './', logLevel: 'warn', build: { outDir: path.join(APP, 'game'), emptyOutDir: true, reportCompressedSize: false, chunkSizeWarningLimit: 8192 } });
const LIC = path.join(APP, 'game/licenses'); fs.mkdirSync(LIC, { recursive: true });
const shipped = [];
for (const f of fs.readdirSync(path.join(ROOT, 'src/ui/fonts')).filter(f => /^OFL-.*\.txt$/.test(f))) { fs.copyFileSync(path.join(ROOT, 'src/ui/fonts', f), path.join(LIC, f)); shipped.push(`${f}  (SIL Open Font License 1.1)`); }
for (const dep of Object.keys(pkg.dependencies || {})) {
  const dir = path.join(ROOT, 'node_modules', dep), meta = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  const lic = fs.readdirSync(dir).find(f => /^(licen[cs]e|copying)/i.test(f)); if (!lic) continue;
  fs.copyFileSync(path.join(dir, lic), path.join(LIC, `${dep}-LICENSE.txt`)); shipped.push(`${dep}-LICENSE.txt  (${dep} ${meta.version}, ${meta.license})`);
}
fs.writeFileSync(path.join(LIC, 'README.txt'), `Pawhaven ${pkg.version} (desktop): third-party software included\n\n${shipped.join('\n')}\nElectron ${electronVersion}: LICENSE and LICENSES.chromium.html next to the app's executable\n`);

// ---- 2. the app around it
for (const f of ['main.cjs', 'preload.cjs', 'icon.png']) fs.copyFileSync(path.join(SRC, f), path.join(APP, f));
fs.writeFileSync(path.join(APP, 'package.json'), JSON.stringify({ name: 'pawhaven', productName: 'Pawhaven', version: pkg.version, description: 'Pawhaven: a cozy blossom village adventure', author: 'Pawhaven', main: 'main.cjs', license: 'UNLICENSED' }, null, 2) + '\n');
const gameFiles = walk(path.join(APP, 'game'));
console.log(`   the game: ${gameFiles.length} files, ${MB(gameFiles.reduce((a, f) => a + fs.statSync(f).size, 0))}`);

// ---- 3. electron-builder
const { build: ebBuild, Platform, Arch } = await import('electron-builder');
// Electron, unpacked, per platform (see the header)
const CACHE = path.join(ROOT, 'node_modules/.cache/pawhaven-desktop');
async function electronDir(platform) {
  const local = path.join(ROOT, 'node_modules/electron/dist');
  if (platform === process.platform && fs.existsSync(path.join(local, 'version')) && fs.readFileSync(path.join(local, 'version'), 'utf8').trim().replace(/^v/, '') === electronVersion) return local;
  const dir = path.join(CACHE, `electron-v${electronVersion}-${platform}-x64`), exe = path.join(dir, platform === 'win32' ? 'electron.exe' : 'electron');
  if (fs.existsSync(exe)) return dir;
  const { downloadArtifact } = await import('@electron/get');
  console.log(`   downloading Electron ${electronVersion} for ${platform} x64`);
  const zip = await downloadArtifact({ version: electronVersion, platform, arch: 'x64', artifactName: 'electron' });
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  if (process.platform === 'win32') execFileSync(path.join(process.env.SystemRoot || 'C:/Windows', 'System32/tar.exe'), ['-xf', zip, '-C', dir], { stdio: 'inherit' }); // (Windows' own bsdtar reads zips)
  else execFileSync('unzip', ['-q', '-o', zip, '-d', dir], { stdio: 'inherit' });
  return dir;
}
const EDIST = { win32: WANT_WIN ? await electronDir('win32') : null, linux: WANT_LINUX ? await electronDir('linux') : null };
const ICON = path.join(SRC, 'icon.png');
const config = {
  appId: 'com.holiestdiver.pawhaven', productName: 'Pawhaven', copyright: `Pawhaven ${new Date().getFullYear()}`,
  electronVersion, electronDist: (o) => EDIST[o.platformName] || EDIST[o.packager?.platform?.nodeName], asar: true, npmRebuild: false, nodeGypRebuild: false, buildDependenciesFromSource: false, publish: null,
  directories: { app: APP, output: OUT, buildResources: SRC },
  afterPack: async (ctx) => { fs.rmSync(path.join(ctx.appOutDir, 'resources/default_app.asar'), { force: true }); }, // (Electron's demo app: the unpacked copy carries it)
  files: ['**/*'],
  win: { target: DIR_ONLY ? [{ target: 'dir', arch: ['x64'] }] : [{ target: 'portable', arch: ['x64'] }, { target: 'zip', arch: ['x64'] }], icon: ICON, artifactName: 'Pawhaven-${version}-win-x64.${ext}' },
  portable: { artifactName: 'Pawhaven-${version}-win-x64-portable.${ext}' },
  linux: { target: [{ target: 'dir', arch: ['x64'] }], icon: ICON, executableName: 'pawhaven', category: 'Game', synopsis: 'A cozy blossom village adventure', artifactName: 'Pawhaven-${version}-linux-x64.${ext}' },
};
const targets = new Map();
if (WANT_WIN) for (const [k, v] of Platform.WINDOWS.createTarget(null, Arch.x64)) targets.set(k, v);
if (WANT_LINUX) for (const [k, v] of Platform.LINUX.createTarget(null, Arch.x64)) targets.set(k, v);
console.log(`== packaging with electron-builder (Electron ${electronVersion}): ${[WANT_WIN && 'Windows x64', WANT_LINUX && 'Linux x64'].filter(Boolean).join(' + ')}${DIR_ONLY ? ', unpacked only' : ''}`);
for (const p of ['win-unpacked', 'linux-unpacked']) if ((p === 'win-unpacked' ? WANT_WIN : WANT_LINUX)) fs.rmSync(path.join(OUT, p), { recursive: true, force: true });
const made = await ebBuild({ targets, config, projectDir: ROOT });

// ---- 4. the Linux AppImage and tar.gz, with their executable bits
if (WANT_LINUX && !DIR_ONLY) {
  const name = `Pawhaven-${pkg.version}-linux-x64`, unpacked = path.join(OUT, 'linux-unpacked');
  const isExec = rel => rel === 'pawhaven' || rel === 'chrome_crashpad_handler' || rel === 'chrome-sandbox' || /\.so(\.\d+)*$/.test(rel);
  // the runtime: AppImage/type2-runtime, from electron-builder's own pinned, checksummed toolset
  const require = createRequire(import.meta.url);
  const { downloadBuilderToolset } = require('app-builder-lib/out/util/electronGet.js'), { appimageChecksums } = require('app-builder-lib/out/toolsets/linux.js');
  const tarName = 'appimage-tools-runtime-20251108.tar.gz';
  const tools = await downloadBuilderToolset({ releaseName: 'appimage@1.0.3', filenameWithExt: tarName, checksums: { [tarName]: appimageChecksums['1.0.3'][tarName] }, githubOrgRepo: 'electron-userland/electron-builder-binaries' });
  const appImage = path.join(OUT, `${name}.AppImage`);
  console.log(`== writing ${path.relative(ROOT, appImage)}`);
  const ai = buildAppImage({ appDir: unpacked, out: appImage, runtime: path.join(tools, 'runtimes/runtime-x64'), exe: 'pawhaven', name: 'Pawhaven', version: pkg.version, icon: ICON, isExec, comment: 'A cozy blossom village adventure' });
  console.log(`   runtime ${ai.offset} bytes + squashfs ${MB(ai.squashfs)}`);
  made.push(appImage);
  const tgz = path.join(OUT, `${name}.tar.gz`);
  console.log(`== writing ${path.relative(ROOT, tgz)}`);
  await tarGz(unpacked, tgz, name, isExec);
  made.push(tgz);
}

console.log(`\n== release/desktop (${((Date.now() - t0) / 1000) | 0} s)`);
for (const f of made.filter(f => fs.existsSync(f) && !/\.blockmap$|\.yml$/.test(f))) console.log(`   ${path.relative(ROOT, f).padEnd(52)} ${MB(fs.statSync(f).size)}`);
for (const d of ['win-unpacked', 'linux-unpacked']) if (fs.existsSync(path.join(OUT, d))) console.log(`   ${path.relative(ROOT, path.join(OUT, d)) + '/'}`);

// a ustar .tar.gz of a folder under a top-level name; isExec(relative path) → mode 0755, else 0644 (folders 0755)
async function tarGz(dir, outFile, top, isExec) {
  const blocks = [];
  const field = (h, off, len, s) => h.write(s, off, Math.min(len, Buffer.byteLength(s)), 'utf8');
  const octal = (h, off, len, n) => field(h, off, len, n.toString(8).padStart(len - 1, '0') + '\0');
  const header = (name, size, mode, type, mtime) => {
    const h = Buffer.alloc(512);
    let base = name, prefix = '';
    if (Buffer.byteLength(name) > 100) { const i = name.lastIndexOf('/', name.length - 2); prefix = name.slice(0, i); base = name.slice(i + 1); if (Buffer.byteLength(base) > 100 || Buffer.byteLength(prefix) > 155) throw new Error(`tar: path too long: ${name}`); }
    field(h, 0, 100, base); octal(h, 100, 8, mode); octal(h, 108, 8, 0); octal(h, 116, 8, 0); octal(h, 124, 12, size); octal(h, 136, 12, mtime);
    h.fill(0x20, 148, 156); field(h, 156, 1, type); field(h, 257, 6, 'ustar\0'); field(h, 263, 2, '00'); field(h, 265, 32, 'root'); field(h, 297, 32, 'root'); field(h, 345, 155, prefix);
    let sum = 0; for (const b of h) sum += b; field(h, 148, 8, sum.toString(8).padStart(6, '0') + '\0 ');
    return h;
  };
  const mtime = Math.floor(Date.now() / 1000);
  function* entries(d, rel) {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const r = rel ? `${rel}/${e.name}` : e.name, full = path.join(d, e.name);
      if (e.isDirectory()) { yield header(`${top}/${r}/`, 0, 0o755, '5', mtime); yield* entries(full, r); }
      else { const data = fs.readFileSync(full); yield header(`${top}/${r}`, data.length, isExec(r) ? 0o755 : 0o644, '0', mtime); yield data; if (data.length % 512) yield Buffer.alloc(512 - (data.length % 512)); }
    }
  }
  function* all() { yield header(`${top}/`, 0, 0o755, '5', mtime); yield* entries(dir, ''); yield Buffer.alloc(1024); }
  void blocks;
  await pipeline(Readable.from(all()), zlib.createGzip({ level: 9 }), fs.createWriteStream(outFile));
}
