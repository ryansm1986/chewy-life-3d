// Production-build smoke test: `vite build` into a temp dir, serve it with `vite preview` on a free port, boot the
// title screen and the village, and fail if the UI/audio did not load or the page logged errors.
// (The dev server resolves things the bundle can't — e.g. a variable import() path — so this catches "works in dev,
// no UI in the real game" bugs.)  usage: node tools/qa/prod-smoke.mjs
import { DUNGEONS } from '../../src/dungeon/defs.js';
import { build, preview } from 'vite';
import { chromium } from 'playwright-core';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
const TOY_CHEWY = (await import('node:fs')).existsSync(new URL('../../public/rigs/chewy_b.json', import.meta.url)); // the Toybox Chewy ships (the samurai's fallback)
const SAMURAI_CHEWY = (await import('node:fs')).existsSync(new URL('../../public/rigs/chewy_samurai.json', import.meta.url)); // the samurai Chewy ships: the player must be it (the default model)
const CHEWY_MODEL = SAMURAI_CHEWY ? 'chewy_samurai' : TOY_CHEWY ? 'chewy_b' : null;
const TOY_SHADOW = fs.existsSync(new URL('../../public/rigs/shadow_toy.json', import.meta.url)); // the Toybox Shadow ships: the companion must be it
const TOY_MOKA = fs.existsSync(new URL('../../public/rigs/moka_toy.json', import.meta.url)); // the Toybox Moka ships: playing Moka must use it
const TOY_ROSIE = fs.existsSync(new URL('../../public/rigs/rosie_toy.json', import.meta.url)); // the Toybox Rosie ships: the village's Rosie must be it
const TOY_POE = fs.existsSync(new URL('../../public/rigs/poe_toy.json', import.meta.url)); // the Toybox Poe ships: playing Poe must use it
const POE_FUMA = fs.existsSync(new URL('../../public/models/poe-fuma.glb', import.meta.url)); // her Blender fūma ships: every fūma must be it (actors/poeGear.js FUMA_MODEL)

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chewy-prod-'));
await build({ logLevel: 'error', build: { outDir, emptyOutDir: true } });
const server = await preview({ logLevel: 'error', build: { outDir }, preview: { port: 0, strictPort: false } });
const url = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });
let failed = 0;
for (const [label, q] of [['title', '/?smoke=1'], ['village', '/?fresh&nointro'], ['moka', '/?fresh&nointro&hero=moka'], ['poe', '/?fresh&nointro&hero=poe'], ['home', '/?fresh&nointro'], ...['bamboo', 'maple', 'tidepool', 'onsen'].map(id => ['region:' + id, `/?fresh&nointro&region=${id}`]), ...Object.values(DUNGEONS).filter(dd => dd.gate).map(dd => ['zone:' + dd.id, '/?fresh&nointro'])]) { // (every zone dungeon that has its gate: its kit, a dense floor, the arena)
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' || /optional module missing|\[rigs\]|\[chewy\]|\[heroes\]|\[shadow\]|\[rosie\]|\[moka\]|\[poe\]/.test(m.text())) errs.push(m.type() + ': ' + m.text()); }); // ([heroes]: a baked hero model missing from the bundle)
  await page.goto(url + q);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 }).catch(() => errs.push('never became ready'));
  await page.waitForTimeout(2500);
  const s = await page.evaluate(() => ({ ui: document.querySelector('#ui')?.children.length || 0, hasUI: !!window.G?.ui, audio: !!window.G?.audio, title: !!window.G?.titleActive, mode: window.G?.mode, refinedRigs: !!((window.G?.player?.rig?.refined || window.G?.player?.rig?.disney) && (window.G?.companion?.rig?.refined || window.G?.companion?.rig?.disney)), disney: !!(window.G?.player?.rig?.bakedDisney && window.G?.companion?.rig?.disney && window.G?.npcs?.every(n => n.rig.disney)), model: window.G?.player?.rig?.model || null, saya: !!window.G?.player?.rig?.parts?.saya, pet: window.G?.companion?.rig?.model || null, rosie: window.G?.npcs?.find(n => n.id === 'rosie')?.rig?.model || null }));
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
  if (label === 'poe') { // the third hero in the bundle (docs/POE.md): her baked rig (or the kit) + the fūma on her back (the Blender prop when it ships), a Fūma Throw out and back, a switch
    s.poe = await page.evaluate(async () => {
      const G = window.G, P = G.player, kind = () => P.rig.parts.fumaBack?.children[0]?.userData.kind || null;
      for (let i = 0; i < 30 && kind() !== 'glb'; i++) await new Promise(q => setTimeout(q, 100)); // (the prop loads after boot)
      const r = { hero: P.hero, kit: !!P.rig.toy, baked: !!P.rig.bakedDisney && P.rig.hero === 'poe', fuma: kind(), back: !!P.rig.parts.fumaBack?.visible, wt: G.derived.weaponType };
      r.cast = G.skills.tryCast('fumaThrow', P.pos.clone().add(new G.THREE.Vector3(3, 0, 0)), null);
      await new Promise(q => setTimeout(q, 700)); r.flying = !!G.skills.poeFuma;
      await new Promise(q => setTimeout(q, 1600)); r.caught = !G.skills.poeFuma && !P.fumaOut;
      r.icons = [...document.querySelectorAll('.hotbar .hb-ic')].slice(0, 2).every(i => /^data:image\/png/.test(i.src));
      G.heroes.cd = 0; r.switch = G.heroes.switchTo('chewy', { quiet: true });
      await new Promise(q => setTimeout(q, 3000));
      r.after = G.state.activeHero; r.poeVillager = !!G.heroes.villagers.poe?.rig?.parts?.fumaBack; r.villagerFuma = G.heroes.villagers.poe?.rig?.parts?.fumaBack?.children[0]?.userData.kind || null;
      return r;
    });
  }
  if (label === 'home') { // the cottage in the bundle (docs/HOUSING.md): in through the door, the furniture drawn, the decorate palette with thumbnails
    s.home = await page.evaluate(async () => {
      const G = window.G, wait = ms => new Promise(q => setTimeout(q, ms));
      G.openHome(); await wait(2600);
      const r = { mode: G.mode, items: G.world.items?.length || 0, batches: G.world.batches?.map.size || 0, jobs: G.world.interactables.filter(i => i.use).length };
      G.housing.decor.enter(); await wait(1500);
      r.palette = G.ui.isOpen('decorate'); r.thumbs = [...document.querySelectorAll('.p-decor .card img')].filter(i => /^data:image\/png/.test(i.src) && !i.classList.contains('dc-wait')).length;
      G.housing.decor.exit(); G.housing.exit(); await wait(2400);
      r.back = G.mode;
      return r;
    });
  }
  const regionId = label.startsWith('region:') ? label.slice(7) : null;
  if (regionId) { // every outdoor region in the bundle (docs/REGIONS.md): built, populated, with its own boss (or its dungeon gate)
    await page.waitForFunction(() => window.G?.dungeon?.isRegion && !window.G.ui?.iris?.active, null, { timeout: 30000 }).catch(() => errs.push('region never loaded'));
    s.region = await page.evaluate(() => ({ id: window.G.dungeon?.regionId, monsters: window.G.dungeon?.monsters?.length || 0, boss: !!window.G.dungeon?.boss, gate: !!window.G.dungeon?.gate }));
  }
  // (a zone whose boss moved into its dungeon has the dungeon gate at the trail's end instead: docs/ZONES.md §8.2)
  const regionOk = !s.region || (s.region.id === regionId && s.region.monsters >= 10 && (s.region.boss || s.region.gate));
  const zoneId = label.startsWith('zone:') ? label.slice(5) : null;
  if (zoneId) { // a zone dungeon in the bundle (docs/ZONES.md §8.2): its cave kit, a dense floor, the arena with its boss
    s.zone = await page.evaluate(async id => {
      const G = window.G; G.state.flags.burrowTut = true; G.enterDungeon({ id, floor: 2 });
      for (let i = 0; i < 250 && !(G.dungeon?.kind === 'zone' && G.dungeon.boss && !G.ui?.iris?.active); i++) await new Promise(q => setTimeout(q, 120));
      await new Promise(q => setTimeout(q, 1500));
      const D = G.dungeon; return { kind: D?.kind, kit: !!G.world.kit, n: D?.monsters?.length || 0, boss: D?.boss?.id || null, arena: D?.layout?.arena?.r || 0, tank: !!D?.monsters?.some(m => m.id === D.def.tank) };
    }, zoneId);
  }
  const zoneOk = !s.zone || (s.zone.kind === 'zone' && s.zone.kit && s.zone.n >= 120 && !!s.zone.boss && s.zone.arena >= 15);
  const h = s.home, homeOk = !h || (h.mode === 'interior' && h.items >= 12 && h.batches >= 10 && h.jobs === 4 && h.palette && h.thumbs >= 3 && h.back === 'village');
  const pz = s.poe, poeOk = !pz || (pz.hero === 'poe' && (!TOY_POE || (s.model === 'poe_toy' && pz.baked)) && (!POE_FUMA || (pz.fuma === 'glb' && pz.villagerFuma === 'glb')) && pz.back && pz.wt === 'fuma' && pz.cast && pz.flying && pz.caught && pz.icons && pz.switch && pz.after === 'chewy' && pz.poeVillager);
  const m = s.moka, mokaOk = !m || ((!TOY_MOKA || s.model === 'moka_toy') && m.baked && m.staff && m.wt === 'staff' && m.cast && m.switch && m.after === 'chewy' && m.chewyBaked && m.mokaVillager);
  const ok = s.ui > 0 && s.hasUI && s.audio && !errs.length && mokaOk && poeOk && regionOk && zoneOk && homeOk && (label !== 'title' || s.title) && (label !== 'village' || (s.mode === 'village' && s.refinedRigs && s.disney && (!CHEWY_MODEL || s.model === CHEWY_MODEL) && (!SAMURAI_CHEWY || s.saya) && (!TOY_SHADOW || s.pet === 'shadow_toy') && (!TOY_ROSIE || s.rosie === 'rosie_toy'))) && (!regionId || s.mode === 'dungeon'); // Blender skins + the Disney Chewy shipped in public/rigs
  console.log(`${ok ? 'PASS' : 'FAIL'}  production ${label}: ${JSON.stringify(s)}${errs.length ? '\n   ' + [...new Set(errs)].slice(0, 8).join('\n   ') : ''}`);
  if (!ok) failed++;
  await page.close();
}
await browser.close();
await new Promise(r => server.httpServer.close(r));
fs.rmSync(outDir, { recursive: true, force: true });
console.log(failed ? `== production smoke: ${failed} FAILED` : '== production smoke: PASS');
process.exit(failed ? 1 : 0);
