// Production-build smoke test: `vite build` into a temp dir, serve it with `vite preview` on a free port, boot the
// title screen and the village, and fail if the UI/audio did not load or the page logged errors.
// (The dev server resolves things the bundle can't — e.g. a variable import() path — so this catches "works in dev,
// no UI in the real game" bugs.)  usage: node tools/qa/prod-smoke.mjs
import { build, preview } from 'vite';
import { chromium } from 'playwright-core';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
const TOY_CHEWY = (await import('node:fs')).existsSync(new URL('../../public/rigs/chewy_b.json', import.meta.url)); // the Toybox Chewy ships: the player must be it
const TOY_SHADOW = fs.existsSync(new URL('../../public/rigs/shadow_toy.json', import.meta.url)); // the Toybox Shadow ships: the companion must be it
const TOY_MOKA = fs.existsSync(new URL('../../public/rigs/moka_toy.json', import.meta.url)); // the Toybox Moka ships: playing Moka must use it
const TOY_ROSIE = fs.existsSync(new URL('../../public/rigs/rosie_toy.json', import.meta.url)); // the Toybox Rosie ships: the village's Rosie must be it

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chewy-prod-'));
await build({ logLevel: 'error', build: { outDir, emptyOutDir: true } });
const server = await preview({ logLevel: 'error', build: { outDir }, preview: { port: 0, strictPort: false } });
const url = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });
let failed = 0;
for (const [label, q] of [['title', '/?smoke=1'], ['village', '/?fresh&nointro'], ['moka', '/?fresh&nointro&hero=moka'], ...['bamboo', 'maple', 'tidepool', 'onsen'].map(id => ['region:' + id, `/?fresh&nointro&region=${id}`])]) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' || /optional module missing|\[rigs\]|\[chewy\]|\[heroes\]|\[shadow\]|\[rosie\]|\[moka\]/.test(m.text())) errs.push(m.type() + ': ' + m.text()); }); // ([heroes]: a baked hero model missing from the bundle)
  await page.goto(url + q);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 }).catch(() => errs.push('never became ready'));
  await page.waitForTimeout(2500);
  const s = await page.evaluate(() => ({ ui: document.querySelector('#ui')?.children.length || 0, hasUI: !!window.G?.ui, audio: !!window.G?.audio, title: !!window.G?.titleActive, mode: window.G?.mode, refinedRigs: !!((window.G?.player?.rig?.refined || window.G?.player?.rig?.disney) && (window.G?.companion?.rig?.refined || window.G?.companion?.rig?.disney)), disney: !!(window.G?.player?.rig?.bakedDisney && window.G?.companion?.rig?.disney && window.G?.npcs?.every(n => n.rig.disney)), model: window.G?.player?.rig?.model || null, pet: window.G?.companion?.rig?.model || null, rosie: window.G?.npcs?.find(n => n.id === 'rosie')?.rig?.model || null }));
  if (label === 'moka') { // the second hero in the bundle: her baked model + staff, a spell, and a switch back to Chewy
    s.moka = await page.evaluate(async () => {
      const G = window.G, P = G.player, r = { baked: !!P.rig.bakedDisney && P.rig.hero === 'moka', staff: !!P.staff, wt: G.derived.weaponType };
      r.cast = G.skills.tryCast('splash', P.pos.clone().add(new G.THREE.Vector3(3, 0, 0)), null);
      await new Promise(q => setTimeout(q, 900));
      G.heroes.cd = 0; r.switch = G.heroes.switchTo('chewy', { quiet: true });
      await new Promise(q => setTimeout(q, 3000));
      r.after = G.state.activeHero; r.chewyBaked = !!G.player.rig.bakedDisney && G.player.rig.hero === 'chewy'; r.mokaVillager = !!G.heroes.villagers.moka?.rig?.bakedDisney;
      return r;
    });
  }
  const regionId = label.startsWith('region:') ? label.slice(7) : null;
  if (regionId) { // every outdoor region in the bundle (docs/REGIONS.md): built, populated, with its own boss
    await page.waitForFunction(() => window.G?.dungeon?.isRegion && !window.G.ui?.iris?.active, null, { timeout: 30000 }).catch(() => errs.push('region never loaded'));
    s.region = await page.evaluate(() => ({ id: window.G.dungeon?.regionId, monsters: window.G.dungeon?.monsters?.length || 0, boss: !!window.G.dungeon?.boss }));
  }
  const regionOk = !s.region || (s.region.id === regionId && s.region.monsters >= 10 && s.region.boss);
  const m = s.moka, mokaOk = !m || ((!TOY_MOKA || s.model === 'moka_toy') && m.baked && m.staff && m.wt === 'staff' && m.cast && m.switch && m.after === 'chewy' && m.chewyBaked && m.mokaVillager);
  const ok = s.ui > 0 && s.hasUI && s.audio && !errs.length && mokaOk && regionOk && (label !== 'title' || s.title) && (label !== 'village' || (s.mode === 'village' && s.refinedRigs && s.disney && (!TOY_CHEWY || s.model === 'chewy_b') && (!TOY_SHADOW || s.pet === 'shadow_toy') && (!TOY_ROSIE || s.rosie === 'rosie_toy'))) && (!regionId || s.mode === 'dungeon'); // Blender skins + the Disney Chewy shipped in public/rigs
  console.log(`${ok ? 'PASS' : 'FAIL'}  production ${label}: ${JSON.stringify(s)}${errs.length ? '\n   ' + [...new Set(errs)].slice(0, 8).join('\n   ') : ''}`);
  if (!ok) failed++;
  await page.close();
}
await browser.close();
await new Promise(r => server.httpServer.close(r));
fs.rmSync(outDir, { recursive: true, force: true });
console.log(failed ? `== production smoke: ${failed} FAILED` : '== production smoke: PASS');
process.exit(failed ? 1 : 0);
