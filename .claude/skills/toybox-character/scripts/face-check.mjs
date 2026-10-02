// In-game face check for a baked character (the toybox-character skill): loads /?test=chars&only=<id> on the dev server
// and saves close-up frames of rest, talk, blink (mid), bark and happy-with-open-mouth, through the game's own Animator.
//   node .claude/skills/toybox-character/scripts/face-check.mjs --id rosie [--out DIR] [--dist 2.6] [--pitch 0.35]
// Then compose them: python .claude/skills/toybox-character/scripts/compare.py face.png --h 360 "rest::DIR/rest.png::450,0,1150,620" …
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2), arg = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const id = arg('id', 'chewy'), out = path.resolve(arg('out', `tools/blender/work/codex/${id}-face`));
const dist = arg('dist', '2.6'), pitch = arg('pitch', '0.35'), base = process.env.BASE || 'http://localhost:5173';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.routeWebSocket(/.*/, ws => { ws.onMessage(() => {}); });
const logs = []; page.on('pageerror', e => logs.push(e.message)); page.on('console', m => { if (m.type() === 'error') logs.push(m.text()); });
await page.goto(`${base}/?test=chars&only=${id}&dist=${dist}&pitch=${pitch}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready === true && window.actors?.length, null, { timeout: 60000 });
await page.waitForTimeout(2500);
const info = await page.evaluate(() => { const r = window.actors[0].rig; return { model: r.model || (r.bakedDisney ? 'baked' : 'kit'), parts: Object.keys(r.parts).filter(k => r.parts[k]) }; });
const snap = async n => { await page.screenshot({ path: path.join(out, n + '.png') }); };
const ev = fn => page.evaluate(fn);
await snap('rest');
await ev(() => { window.actors[0].anim.talk = 1; }); await page.waitForTimeout(160); await snap('talk');
await ev(() => { const a = window.actors[0].anim; a.talk = 0; a.blinkK = 0.5; }); await page.waitForTimeout(16); await snap('blink');
await ev(() => { window.actors[0].anim.play('bark'); }); await page.waitForTimeout(140); await snap('bark');
await ev(() => { const a = window.actors[0].anim; a.action = null; a.mood = 1; const f = a.face; a.face = function (dt, A, b) { A.eyesHappy = 1; A.happy = 1; return f.call(this, dt, A, b, 0.8); }; });
await page.waitForTimeout(300); await snap('happy');
console.log(JSON.stringify({ id, ...info, out, errors: logs.slice(0, 5) }));
await browser.close();
