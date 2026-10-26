// Production-build smoke test: `vite build` into a temp dir, serve it with `vite preview` on a free port, boot the
// title screen and the village, and fail if the UI/audio did not load or the page logged errors.
// (The dev server resolves things the bundle can't — e.g. a variable import() path — so this catches "works in dev,
// no UI in the real game" bugs.)  usage: node tools/qa/prod-smoke.mjs [case…]
import { DUNGEONS } from '../../src/dungeon/defs.js';
import { DEBUG_PASS, skipNote } from './debug-pass.mjs';
import { tooltipCheck } from './tooltip-lib.mjs'; // (R-13: a tooltip's background, read off the screen) // (the debug password: the env or a git-ignored file, never in the repo)
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
// the Toybox villagers (ROADMAP VL-1): each one whose rig ships must be its Villager's rig in the bundle
const TOY_VILLAGERS = ['mochi', 'kuma', 'usagi', 'kitsune', 'pan', 'tanu', 'kero'].filter(id => fs.existsSync(new URL(`../../public/rigs/${id}_toy.json`, import.meta.url)));
const TOY_POE = fs.existsSync(new URL('../../public/rigs/poe_toy.json', import.meta.url)); // the Toybox Poe ships: playing Poe must use it
const POE_FUMA = fs.existsSync(new URL('../../public/models/poe-fuma.glb', import.meta.url)); // her Blender fūma ships: every fūma must be it (actors/poeGear.js FUMA_MODEL)
const TOY_STZ = fs.existsSync(new URL('../../public/rigs/shihtzu_toy.json', import.meta.url)); // the Toybox Shih Tzu ships: playing him must use it (docs/SHIHTZU.md)
const STZ_FLAIL = fs.existsSync(new URL('../../public/models/shihtzu-flail.glb', import.meta.url)); // his Blender flail ships: his flail must be it (actors/shihtzuGear.js)
const has = f => fs.existsSync(new URL('../../public/' + f, import.meta.url));
const TOY_STELLA = has('rigs/stella_toy.json'), STL_WAGASA = has('models/stella-parasol.glb'); // Stella ships: playing her must use her rig and the sun wagasa (docs/STELLA.md)
const TOY_GOLDEN = has('rigs/golden_toy.json'), GLD_PROPS = has('models/golden-lance.glb') && has('models/golden-javelin.glb'); // Foosy ships: playing him must use his rig and props (docs/GOLDEN.md)
const WHELP = has('rigs/shadow_whelp.json') && has('models/shadow-whelp-wing.glb'); // the whelp outfit ships: Shadow must wear it (and fly) while Foosy is played

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chewy-prod-'));
await build({ logLevel: 'error', build: { outDir, emptyOutDir: true } });
const server = await preview({ logLevel: 'error', build: { outDir }, preview: { port: 0, strictPort: false } });
const url = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });
let failed = 0;
const ONLY = process.argv.slice(2).filter(a => !a.startsWith('--'));
for (const [label, q] of [['title', '/?smoke=1'], ['village', '/?fresh&nointro'], ['moka', '/?fresh&nointro&hero=moka'], ['poe', '/?fresh&nointro&hero=poe'], ['shihtzu', '/?fresh&nointro&hero=shihtzu'], ['golden', '/?fresh&nointro&hero=golden'], ['stella', '/?fresh&nointro&hero=stella'], ['home', '/?fresh&nointro'], ['tooltip', '/?fresh&nointro&notut'], ['charge', '/?fresh&nointro&notut'], ['pad', '/?fresh&nointro&notut'], ['deck', '/?fresh&nointro&notut'], ['touch', '/?fresh&nointro&notut'], ...['bamboo', 'maple', 'tidepool', 'onsen'].map(id => ['region:' + id, `/?fresh&nointro&region=${id}`]), ...Object.values(DUNGEONS).filter(dd => dd.gate).map(dd => ['zone:' + dd.id, '/?fresh&nointro']), ['tier:bambooDepths', '/?fresh&nointro&notut'], ['tier:burrowDeep', '/?fresh&nointro&notut'], ['pinnacle:bambooDepths', '/?fresh&nointro&notut'], ['debug', '/?fresh&nointro&notut&debug'], ['cozy', '/?fresh&nointro&notut'], ['guild', '/?fresh&nointro&notut'], ['dig', '/?fresh&nointro&notut'], ['fish', '/?fresh&nointro&notut&hour=10'], ['peaceful', '/?fresh&nointro&notut&villagesaved=bamboo'], ['crewclear', '/?fresh&nointro&notut&villagesaved=bamboo'], ['lead', '/?fresh&nointro&notut&hour=10'], ['dens', '/?fresh&nointro&notut'], ['portal', '/?fresh&nointro&notut'], ['quest', '/?fresh&nointro&notut&qcard&hour=10'], ['arrival', '/?fresh&nointro&notut&arrive&qcard&hour=11']]) { // (every zone dungeon that has its gate: its kit, a dense floor, the arena)
  if (ONLY.length && !ONLY.includes(label)) continue; // (node tools/qa/prod-smoke.mjs tooltip home: just those cases)
  const page = await browser.newPage(label === 'touch' ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true } : { viewport: label === 'deck' ? { width: 1280, height: 800 } : { width: 1600, height: 900 } }); // (deck: the Steam Deck's screen; touch: a phone in landscape)
  // the resource-timing buffer holds 250 entries by default; the bundle fetches more than that (the baked heroes' and
  // villagers' rigs, the enemy GLBs), so the late lazy chunks (debugMenu) fell off the list the checks below read
  await page.addInitScript(() => performance.setResourceTimingBufferSize(4000));
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' || /optional module missing|\[rigs\]|\[chewy\]|\[heroes\]|\[shadow\]|\[rosie\]|\[moka\]|\[poe\]|\[shihtzu\]|\[golden\]|\[stella\]|\[whelp\]/.test(m.text())) errs.push(m.type() + ': ' + m.text()); }); // ([heroes]: a baked hero model missing from the bundle)
  await page.goto(url + q);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 }).catch(() => errs.push('never became ready'));
  await page.waitForTimeout(2500);
  const s = await page.evaluate(() => ({ ui: document.querySelector('#ui')?.children.length || 0, hasUI: !!window.G?.ui, audio: !!window.G?.audio, title: !!window.G?.titleActive, mode: window.G?.mode, refinedRigs: !!((window.G?.player?.rig?.refined || window.G?.player?.rig?.disney) && (window.G?.companion?.rig?.refined || window.G?.companion?.rig?.disney)), disney: !!(window.G?.player?.rig?.bakedDisney && window.G?.companion?.rig?.disney && window.G?.npcs?.every(n => n.rig.disney)), model: window.G?.player?.rig?.model || null, saya: !!window.G?.player?.rig?.parts?.saya, pet: window.G?.companion?.rig?.model || null, rosie: window.G?.npcs?.find(n => n.id === 'rosie')?.rig?.model || null, villagers: Object.fromEntries((window.G?.npcs || []).map(n => [n.id, n.rig?.model || null])) }));
  if (label === 'title') { // the title's animated painting in the bundle (ROADMAP TA-1, ui/titleArt.js): loaded from public/title, drawn by WebGL, covering the 3D
    await page.waitForFunction(() => window.G?.ui?.titleScreen?.art?.ready, null, { timeout: 20000 }).catch(() => {});
    s.art = await page.evaluate(() => { const A = window.G.ui.titleScreen.art; return { ready: !!A?.ready, gl: !!A?.gl && !A.static, covers: !!A?.covers, canvas: !!document.querySelector('.title canvas.ti-art.ready') }; });
  }
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
  if (label === 'shihtzu') { // the fourth hero in the bundle (docs/SHIHTZU.md): his baked rig + the Blender flail (its chain), a swing, a hex, a switch
    s.shihtzu = await page.evaluate(async () => {
      const G = window.G, P = G.player, kind = () => P.flail?.kind || null;
      for (let i = 0; i < 30 && kind() !== 'glb'; i++) await new Promise(q => setTimeout(q, 100)); // (the prop loads after boot)
      const r = { hero: P.hero, baked: !!P.rig.bakedDisney && P.rig.hero === 'shihtzu', flail: kind(), links: P.flail?.links.every(l => l.children.length === 1), wt: G.derived.weaponType, dr: G.derived.dmgReduce };
      const x = P.flail.chain.x; r.chain = [...x].every(Number.isFinite);
      r.icons = [...document.querySelectorAll('.hotbar .hb-ic')].slice(0, 3).every(i => /^data:image\/png/.test(i.src));
      // checkpoint 2's kit in the bundle: the ghost pups and Grandpaw (the ghosts' own shaders), the lantern, a charged hex
      const pl = G.state.player; pl.lvl = 30; for (const id of ['ghostPups', 'grandpawsGhost', 'wayhomeLantern', 'drippingPaw', 'caseOfMopes', 'everlastingGloom', 'mournfulAwoo']) pl.skills[id] = 5; G.actions.recompute(); G.actions.restoreAll?.();
      const at = () => P.pos.clone().add(new P.pos.constructor(Math.sin(P.facing) * 2, 0, Math.cos(P.facing) * 2));
      for (const [id, st] of [['ghostPups'], ['grandpawsGhost'], ['wayhomeLantern'], ['drippingPaw', 3]]) { G.skills.cds = {}; pl.zoom = null; G.skills.tryCast(id, at(), null, st ? { stage: st } : undefined); await new Promise(q => setTimeout(q, 1300)); }
      const A = (G.skills.stzAllies || []).filter(a => a.alive); r.kit = { pups: A.filter(a => a.constructor.name === 'GhostPup' || a.slot).length, gp: A.some(a => a.gp), lantern: !!G.skills.stzLantern };
      G.heroes.cd = 0; r.switch = G.heroes.switchTo('chewy', { quiet: true });
      await new Promise(q => setTimeout(q, 3000));
      r.after = G.state.activeHero; r.villager = G.heroes.villagers.shihtzu?.rig?.parts?.flail?.kind || null;
      return r;
    });
  }
  if (label === 'golden') { // the fifth hero in the bundle (docs/GOLDEN.md): his baked rig + the Blender lance, Shadow in the whelp outfit flying, a thrust, a javelin, a switch
    s.golden = await page.evaluate(async () => {
      const G = window.G, P = G.player, S = G.companion;
      const until = async (f, ms) => { const t0 = performance.now(); while (!f() && performance.now() - t0 < ms) await new Promise(q => requestAnimationFrame(q)); return f(); };
      await until(() => P.lance?.glb, 3000); // (the props load after boot)
      const r = { hero: P.hero, baked: !!P.rig.bakedDisney && P.rig.hero === 'golden', model: P.rig.model, lance: !!P.lance?.glb, wt: G.derived.weaponType, shadowLife: G.derived.shadowLife };
      r.whelp = S.whelp.on; r.whelpModel = S.rig.model || null; r.wings = !!S.rig.parts.wings;
      r.flying = await until(() => S.whelp.air > 0.9 && S.whelp.lift > 0.8, 4000); // (on his own state: up at his hover)
      r.icons = [...document.querySelectorAll('.hotbar .hb-ic')].slice(0, 3).every(i => /^data:image\/png/.test(i.src));
      const at = () => P.pos.clone().add(new P.pos.constructor(Math.sin(P.facing) * 3, 0, Math.cos(P.facing) * 3));
      G.skills.cds = {}; G.state.player.zoom = null; r.thrust = G.skills.tryCast('sunbeamThrust', at(), null);
      await until(() => !P.anim.action, 2000);
      G.skills.cds = {}; G.state.player.zoom = null; r.dart = G.skills.tryCast('bonkDart', at(), null);
      r.javelin = await until(() => (G.skills.gldJav || []).some(j => j.state === 'fly'), 2000); // (a javelin in the air: the instanced batch)
      r.landed = await until(() => (G.skills.gldJav || []).every(j => j.state !== 'fly'), 3000);
      // checkpoint 2: the Jump (his own leap: up, over, the crash), Shadow's Ember Breath (he flies over and puffs), a charged thrust
      const st = G.state.player; st.lvl = 30; st.skills.sunfallJump = 3; st.skills.emberBreath = 3; G.actions.recompute();
      await until(() => !P.anim.action, 2000);
      G.skills.cds = {}; st.zoom = null; r.jump = G.skills.tryCast('sunfallJump', at(), null);
      r.air = await until(() => (P.rig.offsetY || 0) > 1.5, 2000); r.crash = await until(() => !G.skills.gldJump && !P.leap, 3000);
      G.skills.cds = {}; st.zoom = null; r.breath = G.skills.tryCast('emberBreath', at(), null);
      r.puffed = await until(() => (G.skills.gldW?.puffs || 0) > 0, 3000); await until(() => !G.skills.gldW, 3000);
      await until(() => !P.anim.action, 2000);
      G.skills.cds = {}; st.zoom = null; r.charged = G.skills.tryCast('sunbeamThrust', at(), null, { stage: 1 }) && G.player.anim.action?.name === 'sunbeamThrust';
      await until(() => !P.anim.action, 2000);
      G.heroes.cd = 0; r.switch = G.heroes.switchTo('chewy', { quiet: true });
      await until(() => G.state.activeHero === 'chewy' && !G.heroSwitching, 6000);
      r.after = G.state.activeHero; r.whelpOff = !S.whelp.on && S.rig.model !== 'shadow_whelp'; r.villager = !!G.heroes.villagers.golden?.rig?.parts?.lance?.glb;
      return r;
    });
  }
  if (label === 'stella') { // the sixth hero in the bundle (docs/STELLA.md): her baked rig + the Blender sun wagasa, the Sunsweep, Golden Ray, Morning Light's heal and sun shells, a charged ray, the Burrow: a flare and Hinata, a switch
    s.stella = await page.evaluate(async () => {
      const G = window.G, P = G.player;
      const until = async (f, ms) => { const t0 = performance.now(); while (!f() && performance.now() - t0 < ms) await new Promise(q => requestAnimationFrame(q)); return f(); };
      await until(() => P.parasol?.glb, 3000); // (the wagasa loads after boot)
      const r = { hero: P.hero, baked: !!P.rig.bakedDisney && P.rig.hero === 'stella', model: P.rig.model, wagasa: !!P.parasol?.glb, tassels: P.parasol?.tassels?.length || 0, wt: G.derived.weaponType, revive: G.derived.shadowRevive };
      r.icons = [...document.querySelectorAll('.hotbar .hb-ic')].slice(0, 3).every(i => /^data:image\/png/.test(i.src));
      const at = () => P.pos.clone().add(new P.pos.constructor(Math.sin(P.facing) * 3, 0, Math.cos(P.facing) * 3)), st = G.state.player;
      G.skills.cds = {}; st.zoom = null; r.sweep = G.skills.tryCast('attack', at(), null) && /parasolSweep/.test(P.anim.action?.name || '');
      await until(() => !P.anim.action, 2000);
      G.skills.cds = {}; st.zoom = null; r.ray = G.skills.tryCast('goldenRay', at(), null);
      await until(() => !P.anim.action, 2000);
      G.actions.damage(G.derived.lifeMax * 0.05); const l0 = G.actions.life(); // (a small hurt: a level-1 Morning Light (12%) mends it and its overheal becomes a sun shell)
      G.skills.cds = {}; st.zoom = null; r.light = G.skills.tryCast('morningLight', P.pos.clone(), null);
      r.healed = await until(() => G.actions.life() > l0 + 1, 3000);
      r.shell = await until(() => G.skills.stlShell('player') > 0, 4000); // (overheal: a sun shell)
      await until(() => !P.anim.action, 2000);
      G.skills.cds = {}; st.zoom = null; r.charged = G.skills.tryCast('goldenRay', at(), null, { stage: 1 }) && P.anim.action?.name === 'parasolAim';
      await until(() => !P.anim.action, 2000);
      // the Burrow: a Solar Flare on its monsters, Hinata out
      st.lvl = 30; st.skills.solarFlare = 3; st.skills.skippingSun = 1; st.skills.littleSun = 1; G.actions.recompute(); G.state.flags.burrowTut = true;
      G.enterDungeon(3); await until(() => G.mode === 'dungeon' && !G.ui?.iris?.active && G.dungeon?.monsters?.length, 15000);
      const foe = G.combat.nearest(P.pos, 'ally', 60, e => e.team === 'enemy' && !e.breakable);
      if (foe) { P.setPos(foe.pos.x - 3, foe.pos.z); P.pos.y = G.world.heightAt(P.pos.x, P.pos.z); }
      const life0 = foe?.life ?? 0;
      G.skills.cds = {}; st.zoom = null; r.flare = G.skills.tryCast('solarFlare', foe ? foe.pos.clone() : at(), foe);
      r.flareHit = await until(() => foe && (foe.life < life0 || !foe.alive), 3000);
      await until(() => !P.anim.action, 2000);
      G.skills.cds = {}; st.zoom = null; r.sun = G.skills.tryCast('littleSun', P.pos.clone(), null) && await until(() => (G.skills.stlSuns || []).some(x => x.alive), 3000);
      await until(() => !P.anim.action, 2000);
      G.heroes.cd = 0; r.switch = G.heroes.switchTo('chewy', { quiet: true });
      await until(() => G.state.activeHero === 'chewy' && !G.heroSwitching, 6000);
      r.after = G.state.activeHero; r.cleared = !(G.skills.stlSuns || []).some(x => x.alive);
      return r;
    });
  }
  if (label === 'poe') { // the third hero in the bundle (docs/POE.md): her baked rig (or the kit) + the fūma on her back (the Blender prop when it ships), a Fūma Throw out and back, a switch
    s.poe = await page.evaluate(async () => {
      const G = window.G, P = G.player, kind = () => P.rig.parts.fumaBack?.children[0]?.userData.kind || null;
      for (let i = 0; i < 30 && kind() !== 'glb'; i++) await new Promise(q => setTimeout(q, 100)); // (the prop loads after boot)
      const r = { hero: P.hero, kit: !!P.rig.toy, baked: !!P.rig.bakedDisney && P.rig.hero === 'poe', fuma: kind(), back: !!P.rig.parts.fumaBack?.visible, wt: G.derived.weaponType };
      r.cast = G.skills.tryCast('fumaThrow', P.pos.clone().add(new G.THREE.Vector3(3, 0, 0)), null);
      // (on the game's state, not the wall's: the fūma seen in flight, then home in her paw)
      const until = async (f, ms) => { const t0 = performance.now(); while (!f() && performance.now() - t0 < ms) await new Promise(q => requestAnimationFrame(q)); return f(); };
      r.flying = await until(() => !!G.skills.poeFuma, 3000);
      r.caught = await until(() => !G.skills.poeFuma && !P.fumaOut, 5000);
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
  if (label === 'pad') { // the gamepad in the bundle (docs/CONTROLS.md): a virtual pad (as tools/qa/pad-lib.mjs) walks, casts Y, and the glyphs show
    s.pad = await page.evaluate(async () => {
      const G = window.G, P = G.player, wait = ms => new Promise(q => setTimeout(q, ms));
      const btn = () => ({ pressed: false, value: 0 }), pad = { id: 'Xbox 360 Controller (XInput STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, btn) };
      navigator.getGamepads = () => [pad];
      const p0 = P.pos.clone(); pad.axes[1] = -1; await wait(700); pad.axes[1] = 0; await wait(100);
      const r = { dev: G.controls.device, moved: +P.pos.distanceTo(p0).toFixed(2), glyphs: document.querySelectorAll('.hud .hotbar .hb-k.pad svg').length, cursor: document.body.classList.contains('pad-active') };
      G.state.player.hotbar[2] = 'chomp'; G.state.player.skills.chomp = 1; G.skills.cds = {};
      let cast = 0; const raw = G.skills.tryCast.bind(G.skills); G.skills.tryCast = (...a) => { const x = raw(...a); if (x) cast++; return x; };
      pad.buttons[3].pressed = true; await wait(80); pad.buttons[3].pressed = false; await wait(400);
      r.cast = cast;
      // CT-2: a panel takes the focus ring, the D-pad moves it (docs/CONTROLS.md §3)
      G.ui.toggle('inventory', { view: 'bag' }); await wait(400);
      const c0 = G.ui.padNav.cur; pad.buttons[15].pressed = true; await wait(80); pad.buttons[15].pressed = false; await wait(200);
      r.focus = !!c0 && document.querySelector('.pad-ring')?.classList.contains('on') && G.ui.padNav.cur !== c0;
      G.ui.close('inventory');
      return r;
    });
  }
  if (label === 'touch') { // a phone in the bundle (docs/CONTROLS.md §12): touch plays, the Mobile preset picked itself, a finger on the stick walks
    const cdp = await page.context().newCDPSession(page), send = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
    const p0 = await page.evaluate(() => window.G.player.pos.toArray());
    await send('touchStart', [{ x: 150, y: 290, id: 1 }]); for (let i = 1; i <= 4; i++) await send('touchMove', [{ x: 150, y: 290 - 13 * i, id: 1 }]);
    await page.waitForTimeout(800); await send('touchEnd', []); await page.waitForTimeout(200);
    s.touch = await page.evaluate(p0 => { const G = window.G, E = G.engine, P = G.player.pos; return { dev: G.controls.device, on: document.querySelector('.tc')?.classList.contains('on'), slots: document.querySelectorAll('.tc-slot > .hb').length, preset: E.preset, pr: E.renderer.getPixelRatio(), phone: G.ui.root.classList.contains('m-phone'), moved: +Math.hypot(P.x - p0[0], P.z - p0[2]).toFixed(2), manifest: !!document.querySelector('link[rel=manifest]') }; }, p0);
    // the Mobile preset's memory diet in the bundle (core/deck.js releaseAfterUpload): a Burrow floor's chunks let go of
    // their arrays once drawn and still draw; out to the village and into a fresh floor, which builds and draws again
    const floor = async () => {
      await page.waitForFunction(() => window.G?.mode === 'dungeon' && !window.G.ui?.iris?.active, null, { timeout: 60000 }); await page.waitForTimeout(1200);
      return page.evaluate(async () => { const G = window.G, R = G.engine.renderer; let rel = 0, gone = 0; G.world.scene.traverse(o => { const g = o.geometry; if (g?.userData?.released) { rel++; if (g.attributes.position?.array === null) gone++; } });
        R.info.autoReset = false; R.info.reset(); for (let i = 0; i < 10; i++) await new Promise(r => requestAnimationFrame(r)); const calls = R.info.render.calls; R.info.autoReset = true; return { rel, gone, calls, paused: !!G.ui?.isPaused?.() }; }); // (ten frames' draws: a hitch or the frame cap can skip one or two)
    };
    await page.evaluate(() => { window.G.state.flags.burrowTut = true; window.G.enterDungeon(3); }); s.touch.burrow = await floor();
    await page.evaluate(() => window.G.returnToVillage()); await page.waitForFunction(() => window.G?.mode === 'village' && !window.G.ui?.iris?.active, null, { timeout: 60000 });
    await page.evaluate(() => window.G.enterDungeon(4)); s.touch.burrow2 = await floor();
  }
  if (label === 'village') s.noDebug = await page.evaluate(() => !performance.getEntriesByType('resource').some(e => /debugMenu/.test(e.name)) && !window.G.ui.panels.debug && !document.querySelector('.dbg-bug')); // (debug off: its lazy chunk is never fetched)
  if (label === 'debug') { // the debug menu in the bundle (docs/DEBUG.md): ?debug asks for the password, the right one opens the lazy menu
    await page.waitForFunction(() => window.G.ui.isOpen('debugGate'), null, { timeout: 15000 }).catch(() => errs.push('no password prompt'));
    await page.fill('.dg-in', 'nope'); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
    const refused = await page.evaluate(() => !window.G.debug.on && window.G.ui.isOpen('debugGate'));
    if (DEBUG_PASS) { await page.fill('.dg-in', DEBUG_PASS); await page.keyboard.press('Enter'); }
    else { skipNote('production debug: the right password'); await page.evaluate(() => { window.G.ui.close('debugGate', true); window.G.debug.enable({ open: true }); }); } // (on through the remembered flag's own path)
    await page.waitForFunction(() => window.G.ui.isOpen('debug'), null, { timeout: 15000 }).catch(() => errs.push('the debug menu never opened'));
    s.debug = await page.evaluate(async () => {
      const G = window.G, r = { refused: false, on: G.debug.on, chunk: performance.getEntriesByType('resource').some(e => /debugMenu/.test(e.name)), tabs: document.querySelectorAll('.p-debug .dbg-tabs .tab').length, css: getComputedStyle(document.querySelector('.p-debug')).width };
      document.querySelector('.p-debug [data-tab="village"]').click(); await new Promise(q => setTimeout(q, 200));
      const c0 = G.state.coins, chip = [...document.querySelectorAll('.p-debug .dbg-chip')].find(b => b.textContent.trim() === '+1k'); chip?.click();
      await new Promise(q => setTimeout(q, 300)); r.coins = G.state.coins - c0; r.used = !!G.state.debugUsed;
      return r;
    });
    s.debug.refused = refused;
    await page.keyboard.press('F10'); await page.waitForTimeout(400); s.debug.closed = await page.evaluate(() => !window.G.ui.isOpen('debug'));
  }
  if (label === 'peaceful') { // the peaceful overworld in the bundle (docs/COZY.md §6): a saved Bamboo with only its wild packs, the gateways and the edge tint, the leash tags, the Sightings board and a bounty
    s.peaceful = await page.evaluate(async () => {
      const G = window.G, sleep = ms => new Promise(q => setTimeout(q, ms)), r = {};
      G.state.player.lvl = 8; G.state.flags.poeJoined = true;
      r.board = !!G.peaceful?.board?.group?.parent && G.village.world.interactables.includes(G.peaceful.board.it);
      G.ui.open('sightings', { at: 'village' }); await sleep(500); r.cards = document.querySelectorAll('.p-sight .sg-card').length; r.css = getComputedStyle(document.querySelector('.p-sight')).width; G.ui.closeAll();
      G.enterRegion('bamboo'); await new Promise(q => { const f = () => (G.dungeon?.isRegion && !G.ui?.iris?.active && G.dungeon.monsters.length ? q() : requestAnimationFrame(f)); f(); }); await sleep(500);
      const D = G.dungeon, L = D.layout;
      r.peace = D.peaceful; r.wild = L.wild.length; r.allWild = D.monsters.every(m => !!m.wild); r.edge = !!D.world.scene.getObjectByName('wildEdge'); r.glades = L.glades.length;
      r.zoneBoard = D.world.interactables.some(i => i.label === 'Read the Sightings board');
      const g = [...D.wild.sights.values()][0]; r.sight = !!g;
      if (g) { const r0 = G.peaceful.renown().n; for (const m of g.monsters) m.takeDamage(1e9); await sleep(800); r.bounty = G.peaceful.renown().n > r0; }
      return r;
    });
  }
  if (label === 'guild') { // the Adventurers' Guild in the bundle (docs/COZY.md §5): built, Old Hachi, a hire signed on in its panel, sent on an errand from the Guild's board and back with XP, living in town
    s.guild = await page.evaluate(async () => {
      const G = window.G, sleep = ms => new Promise(q => setTimeout(q, ms)), r = {};
      G.state.village.rankFloor = 2; G.sim.simulate(); G.state.coins = 3000;
      const b = G.cozy.guild.debugBuild(); await sleep(1500);
      r.built = !!b && G.cozy.guild.level === 1; r.model = !!G.sim.list.find(x => x.data.type === 'guild')?.model?.tris;
      r.hachi = G.npcs.some(n => n.id === 'hachi');
      G.cozy.guild.open('hire'); await sleep(600);
      r.css = getComputedStyle(document.querySelector('.p-guild')).width; r.cands = document.querySelectorAll('.p-guild .gd-cand').length;
      document.querySelector('.p-guild .gd-sign:not([disabled])')?.click(); await sleep(300);
      const h = G.state.cozy.guild.hires[0]; r.hired = !!h; if (h) h.lvl = Math.max(h.lvl, 4); // (a fresh game's candidate is level 1: too weak alone for an errand)
      G.ui.closeAll(); G.ui.open('expeditions', { at: 'guild', view: 'errands' }); await sleep(500);
      document.querySelector(`.p-exp .ex-mem[data-m="hire:${h?.id}"]`)?.click(); await sleep(150);
      document.querySelector('.p-exp .ex-go:not([disabled])')?.click(); await sleep(300);
      r.out = G.cozy.exp.list().length; r.away = !!G.cozy.guild.hireInfo(h?.id)?.away;
      G.ui.closeAll(); G.cozy.clock.add(3.5); await sleep(900);
      r.back = G.cozy.exp.list().length === 0; r.xp = G.cozy.exp.reports().slice(-1)[0]?.xp?.[`hire:${h?.id}`] || 0;
      await sleep(400); r.inTown = G.npcs.some(n => n.hire === h?.id);
      return r;
    });
  }
  if (label === 'crewclear') { // the story rerouted in the bundle (docs/COZY.md §3.2, CZ-9): the Bamboo Depths cleared by a crew from the Board: dungeon.crew, the next zone, the 救 stamp, Tier 1 at the Lantern (lit at the gate), the Tengu's fan; then a zone villager's step by a crew
    s.crewclear = await page.evaluate(async () => {
      const G = window.G, sleep = ms => new Promise(q => setTimeout(q, ms)), r = {};
      G.state.flags.mokaJoined = true; G.state.flags.poeJoined = true; G.state.heroes.moka.player.lvl = 9; G.state.heroes.poe.player.lvl = 9; G.state.pantry = { roastedVeggies: 6 }; G.state.potions.heart = 3; G.state.village.rankFloor = 2; G.sim.simulate(); G.heroes.spawnBench();
      r.offered = G.cozy.exp.objectives('story').some(o => o.id === 'dungeon:bamboo');
      G.ui.open('expeditions', { at: 'board', view: 'story' }); await sleep(500);
      document.querySelector('.p-exp .ex-obj[data-o="dungeon:bamboo"]')?.click(); await sleep(150);
      for (const m of ['hero:moka', 'hero:poe']) { document.querySelector(`.p-exp .ex-mem[data-m="${m}"]`)?.click(); await sleep(120); }
      for (let i = 0; i < 2; i++) { document.querySelector('.p-exp [data-pot="1"]:not([disabled])')?.click(); await sleep(100); }
      document.querySelector('.p-exp .ex-go:not([disabled])')?.click(); await sleep(300);
      r.out = G.cozy.exp.list().length; G.ui.closeAll();
      G.cozy.clock.add(10.2); await sleep(900);
      const d = G.state.zones.bamboo.dungeon, rep = G.cozy.exp.reports().at(-1);
      r.fan0 = G.state.furniture?.trophyTenguFan || 0; // (the keepsake waits in the report: Receive rewards, docs/COZY.md §4.5)
      G.ui.open('expeditions', { view: 'reports', report: rep?.uid }); await sleep(500);
      r.claim = !!document.querySelector('.p-exp .ex-claim'); document.querySelector('.p-exp .ex-claim')?.click(); await sleep(400); G.ui.closeAll();
      Object.assign(r, { result: rep?.result, crew: d.crew, cleared: d.cleared, t1: G.lantern?.info?.('bambooDepths')?.tierOpen, maple: G.travel.list().find(x => x.id === 'maple')?.unlocked, fan: G.state.furniture?.trophyTenguFan || 0, ribbon: !!rep?.cleared });
      if (rep?.result !== 'success') return r;
      G.openTravel({ select: 'bamboo' }); await sleep(600); r.stamp = document.querySelector('.tv-pin[data-id="bamboo"] .tv-stamp')?.textContent; G.ui.closeAll();
      G.travel.go('bamboo'); for (let i = 0; i < 80 && !(G.mode === 'dungeon' && G.dungeon?.isRegion && !G.ui?.iris?.active); i++) await sleep(250);
      await sleep(800); r.lit = !!G.dungeon?.gate?.lantern?.model?.lit;
      return r;
    });
  }
  if (label === 'cozy') { // the cozy path in the bundle (docs/COZY.md §4): the board by the Post, a crew sent from its panel and back, the report, the chip, the away card
    s.cozy = await page.evaluate(async () => {
      const G = window.G, sleep = ms => new Promise(q => setTimeout(q, ms)), r = {};
      G.state.flags.mokaJoined = true; G.heroes.spawnBench();
      r.board = !!G.cozy?.board?.group?.parent && G.village.world.interactables.includes(G.cozy.board.it);
      G.ui.open('expeditions', { at: 'board', view: 'errands' }); await sleep(500);
      const P = G.ui.panels.expeditions; r.css = getComputedStyle(document.querySelector('.p-exp')).width; r.cards = document.querySelectorAll('.p-exp .ex-obj').length;
      document.querySelector('.p-exp .ex-mem[data-m="hero:moka"]')?.click(); await sleep(150);
      document.querySelector('.p-exp .ex-go:not([disabled])')?.click(); await sleep(300);
      r.out = G.cozy.exp.list().length; r.away = G.heroes.away('moka') && !G.heroes.bench().includes('moka');
      G.ui.closeAll(); G.cozy.clock.add(3.1); await sleep(600);
      r.back = G.cozy.exp.list().length === 0; r.report = G.cozy.exp.reports()[0]?.result || null; r.xp = Object.values(G.cozy.exp.reports()[0]?.xp || {})[0] || 0;
      r.chip = !!document.querySelector('.cz-chip.on'); r.inTown = !!G.heroes.villagers.moka;
      G.cozy.showAway(); await sleep(400); r.card = G.ui.isOpen('awayCard'); G.ui.closeAll();
      G.ui.open('quests', { tab: 'crews' }); await sleep(400); r.log = document.querySelectorAll('.p-quests .cl-rep').length; G.ui.closeAll(); // (the Journal's Crews tab: CZ-10)
      r.guides = G.tutorials?.list?.().length || 0; // (the cozy guides are in the bundle: CZ-11)
      void P; return r;
    });
  }
  if (label === 'deck') s.deck = await page.evaluate(() => { const G = window.G, E = G.engine; return { preset: E.preset, quality: E.quality, pr: E.renderer.getPixelRatio(), ao: E.post.ao.enabled, shadow: G.world.sun.shadow.mapSize.x, ui: G.ui.settings.uiScale, safe: getComputedStyle(document.querySelector('.l-hud')).top, floor: getComputedStyle(document.querySelector('.hud .loc-s') || document.body).fontSize }; }); // (CT-3: the Deck profile and deck.css in the bundle)
  const regionId = label.startsWith('region:') ? label.slice(7) : null;
  if (regionId) { // every outdoor region in the bundle (docs/REGIONS.md): built, populated, with its own boss (or its dungeon gate)
    await page.waitForFunction(() => window.G?.dungeon?.isRegion && !window.G.ui?.iris?.active, null, { timeout: 30000 }).catch(() => errs.push('region never loaded'));
    s.region = await page.evaluate(() => ({ id: window.G.dungeon?.regionId, monsters: window.G.dungeon?.monsters?.length || 0, boss: !!window.G.dungeon?.boss, gate: !!window.G.dungeon?.gate, glb: window.__enemyModels?.() || [] }));
    if (regionId === 'onsen') { // since Z-H3 Foosy arrives in Blossom Hollow (docs/GOLDEN.md §5): the old scene at the big spring never plays (his scene in town: the arrival case)
      await new Promise(q => setTimeout(q, 4000));
      s.region.gld = await page.evaluate(() => { const S = window.G.heroes.gldJoin, k = S.knight; return { state: S.state, vis: !!k?.visible }; });
    }
  }
  // (a zone whose boss moved into its dungeon has the dungeon gate at the trail's end instead: docs/ZONES.md §8.2)
  const rg = s.region?.gld, gldSceneOk = regionId !== 'onsen' || (rg?.state === 'off' && !rg.vis);
  const regionOk = !s.region || (s.region.id === regionId && s.region.monsters >= 10 && (s.region.boss || s.region.gate) && gldSceneOk && ({ bamboo: ['takenoko', 'kodama', 'kamaitachi'], maple: ['kuri', 'kakashi', 'kakashi_crow', 'momiji-wisp'], tidepool: ['kappa', 'heikegani', 'kurage'], onsen: ['yukiwarashi', 'yukidaruma', 'tsurara'] }[regionId] || []).every(f => s.region.glb.includes(f))); // (the Blender enemies in the bundle: ROADMAP EN-1)
  const zoneId = label.startsWith('zone:') ? label.slice(5) : null;
  if (zoneId) { // a zone dungeon in the bundle (docs/ZONES.md §8.2): its cave kit, a dense floor, the arena with its boss
    s.zone = await page.evaluate(async id => {
      const G = window.G; G.state.flags.burrowTut = true; G.enterDungeon({ id, floor: 2 });
      for (let i = 0; i < 250 && !(G.dungeon?.kind === 'zone' && G.dungeon.boss && !G.ui?.iris?.active); i++) await new Promise(q => setTimeout(q, 120));
      await new Promise(q => setTimeout(q, 1500));
      const D = G.dungeon; return { kind: D?.kind, kit: !!G.world.kit, n: D?.monsters?.length || 0, boss: D?.boss?.id || null, arena: D?.layout?.arena?.r || 0, tank: !!D?.monsters?.some(m => m.id === D.def.tank) };
    }, zoneId);
  }
  const tierId = label.startsWith('tier:') ? label.slice(5) : null;
  if (tierId) { // a tier run in the bundle (docs/ZONES.md §5.1): T5 + three modifiers; Haunted's ghost rises
    s.tier = await page.evaluate(async id => {
      const G = window.G; G.state.flags.burrowTut = true; G.player.invuln = true;
      G.enterDungeon({ id, floor: 1, tier: 5, mods: ['swarming', 'haunted', 'elementalFire'] });
      for (let i = 0; i < 250 && !(G.dungeon?.def?.id === id && G.dungeon.tr && !G.ui?.iris?.active); i++) await new Promise(q => setTimeout(q, 120));
      await new Promise(q => setTimeout(q, 1200));
      const D = G.dungeon, m = D?.monsters?.find(x => x.alive && !x.def.boss && x.rank === 'normal');
      if (m) G.combat.hitMonster(m, { dmgPct: 1e7 }); // (a plain one: Haunted raises 20% of them, so the queue may stay empty)
      const e = D?.monsters?.find(x => x.alive && x.rank !== 'normal' && !x.def.boss); if (e) G.combat.hitMonster(e, { dmgPct: 1e7 }); // (an elite always rises again)
      for (let i = 0; i < 30 && !D?.monsters?.some(x => x._ghost); i++) await new Promise(q => setTimeout(q, 100));
      return { kind: D?.kind, label: D?.tr?.label, mods: D?.mods?.length || 0, n: D?.monsters?.length || 0, ghost: !!D?.monsters?.some(x => x._ghost), el: D?.monsters?.filter(x => x._el).length || 0, lvl: D?.layout?.mlvl || 0 };
    }, tierId);
  }
  const pinId = label.startsWith('pinnacle:') ? label.slice(9) : null;
  if (pinId) { // the Spirit Lantern's panel and the pinnacle in the bundle (docs/ZONES.md §5.2, §5.3): Spirit 10's Four Seasons, end to end
    s.pin = await page.evaluate(async id => {
      const G = window.G, sleep = ms => new Promise(q => setTimeout(q, ms)), o = {}; G.state.flags.burrowTut = true; G.player.invuln = true;
      G.tierDebug.clearAll(5); G.state.zones.bamboo.dungeon.spirit.best = 9;
      G.lantern.open(id); await sleep(400); o.cards = document.querySelectorAll('.p-lantern .ln-card').length; o.spiritTab = !!document.querySelector('.ln-tier.spirit'); G.ui.close('lantern');
      G.tierDebug.run(id, 5, [], 10, 2);
      for (let i = 0; i < 300 && !(G.dungeon?.tr?.pin && G.dungeon.boss && !G.ui?.iris?.active); i++) await sleep(120);
      const D = G.dungeon, pin = D?.tr?.pin; if (!pin) return o;
      o.chip = document.querySelector('.run-chip.on')?.textContent.trim(); const seen = [];
      for (let k = 0; k < 4; k++) {
        for (let i = 0; i < 120 && !(D.boss?.alive && pin.k === k); i++) await sleep(100);
        if (!D.boss) break; seen.push(D.boss.id); D.boss.alert(); await sleep(1200); G.player.invuln = true;
        G.combat.hitMonster(D.boss, { dmgPct: 1e8 });
      }
      for (let i = 0; i < 80 && !G.world.interactables.some(t => /Lantern chest/.test(t.label)); i++) await sleep(100);
      return { ...o, seen: seen.join(), spirits: pin.stats.falls, done: pin.done, chest: G.world.interactables.some(t => /Lantern chest/.test(t.label)) };
    }, pinId);
  }
  const pinOk = !s.pin || (s.pin.cards === 17 && s.pin.spiritTab && /Spirit 10/.test(s.pin.chip || '') && s.pin.seen === 'tenguMaster,umibozu,danzaburo,yukiOnna' && s.pin.done && s.pin.chest);
  const tierOk = pinOk && (!s.tier || (s.tier.label === 'Tier 5' && s.tier.mods === 3 && s.tier.ghost && s.tier.el > 20 && s.tier.n >= (tierId === 'burrowDeep' ? 40 : 180)));
  const zoneOk = tierOk && (!s.zone || (s.zone.kind === 'zone' && s.zone.kit && s.zone.n >= 120 && !!s.zone.boss && s.zone.arena >= 15));
  const h = s.home, homeOk = !h || (h.mode === 'interior' && h.items >= 12 && h.batches >= 10 && h.jobs === 4 && h.palette && h.thumbs >= 3 && h.back === 'village');
  if (label === 'dig') { // scavenging in the bundle (docs/COZY.md §7): a gather, Shadow's nose, a held dig let go in the golden band
    const E = (fn, a) => page.evaluate(fn, a), W = (fn, t = 5000) => page.waitForFunction(fn, null, { timeout: t }).catch(() => {});
    s.dig = await E(() => { const G = window.G, S = G.cozy.scav, r = { nodes: S.nodes().length, draws: 0, w0: G.state.materials.wood }; G.village.world.scene.traverse(o => { if (/^scavenge:/.test(o.name)) r.draws++; }); const n = S.nodes()[0]; G.player.setPos(n.x + 0.6, n.z - 0.6); G.player.moveTarget = null; G.interactCooldown = 0; return r; });
    await page.waitForTimeout(250); await page.keyboard.press('f');
    await W(() => window.G.cozy.scav.nodes()[0].taken, 3000);
    s.dig.gathered = await E(w0 => window.G.cozy.scav.nodes()[0].taken && window.G.state.materials.wood > w0, s.dig.w0);
    await E(() => { const G = window.G, sp = G.cozy.scav.spots()[0]; G.player.setPos(sp.x + 5, sp.z + 4.5); G.player.moveTarget = null; G.companion.setPos(sp.x + 5.6, sp.z + 5); });
    await W(() => window.G.cozy.scav.spots()[0].state === 'found', 15000);
    s.dig.nose = await E(() => window.G.cozy.scav.spots()[0].state === 'found');
    await E(() => { const G = window.G, sp = G.cozy.scav.spots()[0]; G.player.setPos(sp.x + 0.7, sp.z - 0.7); G.player.moveTarget = null; G.interactCooldown = 0; });
    await page.waitForTimeout(250);
    await page.keyboard.down('f');
    await W(() => (window.G.cozy.scav.session?.k || 0) >= 0.74);
    await page.keyboard.up('f');
    await W(() => !window.G.cozy.scav.busy, 4000);
    Object.assign(s.dig, await E(() => ({ dug: window.G.cozy.scav.spots()[0].state === 'dug', perfect: window.G.state.cozy.scav.stats.perfect })));
  }
  if (label === 'dens') { // the Burrow's four dens in the bundle (ROADMAP Z-H1): the door's picker (its painted hill, four pins, only the first open), the Mossy Burrow entered from it, its floor 2 with King Mochi in the big chamber
    s.dens = await page.evaluate(async () => {
      const G = window.G, sl = ms => new Promise(q => setTimeout(q, ms)), r = {};
      G.state.flags.burrowTut = true; G.openBurrowMenu();
      for (let i = 0; i < 30 && !G.ui.isOpen('burrow'); i++) await sl(100);
      await sl(300);
      const cv = document.querySelector('.p-burrow canvas'); r.open = G.ui.isOpen('burrow'); r.pins = document.querySelectorAll('.p-burrow .dn-pin').length; r.locked = document.querySelectorAll('.p-burrow .dn-pin.locked').length; r.go = !!document.querySelector('.p-burrow .dn-go');
      try { const g = cv.getContext('2d'), a = g.getImageData(Math.floor(cv.width * 0.27), Math.floor(cv.height * 0.33), 1, 1).data, b = g.getImageData(Math.floor(cv.width * 0.5), Math.floor(cv.height * 0.95), 1, 1).data; r.painted = a[3] > 0 && b[3] > 0 && (a[0] !== b[0] || a[1] !== b[1] || a[2] !== b[2]); } catch (e) { r.painted = false; }
      document.querySelector('.p-burrow .dn-go')?.click();
      for (let i = 0; i < 300 && !(G.mode === 'dungeon' && G.dungeon?.def?.id === 'mossyBurrow' && !G.ui.iris.active); i++) await sl(100);
      r.den = G.dungeon?.def?.id || null; r.floor = G.dungeon?.floor; r.kind = G.dungeon?.kind; r.closed = !G.ui.isOpen('burrow'); r.loc = G.ui.hud?.cache?.loc?.name || null;
      G.enterDungeon({ id: 'mossyBurrow', floor: 2 });
      for (let i = 0; i < 300 && !(G.dungeon?.floor === 2 && G.dungeon?.boss && !G.ui.iris.active); i++) await sl(100);
      r.boss = G.dungeon?.boss?.id || null; r.big = G.dungeon?.layout?.bossRoom ? Math.min(G.dungeon.layout.bossRoom.w, G.dungeon.layout.bossRoom.h) : 0; r.stairs = !!G.dungeon?.stairsPos;
      return r;
    });
  }
  if (label === 'portal') { // the Town Portal in the bundle (ROADMAP Z-H2): cast on a den floor (the moon gate's swirl shader), the return portal by the plaza, stepping back in rebuilds the floor as left
    s.portal = await page.evaluate(async () => {
      const G = window.G, sl = ms => new Promise(q => setTimeout(q, ms)), r = {};
      G.state.flags.burrowTut = true; setInterval(() => { G.player.invuln = true; G.actions.restoreAll?.(); }, 250);
      G.enterDungeon({ id: 'mossyBurrow', floor: 1 });
      for (let i = 0; i < 300 && !(G.mode === 'dungeon' && G.dungeon?.def?.id === 'mossyBurrow' && !G.ui.iris.active); i++) await sl(100);
      const D = G.dungeon, foes = D.monsters.filter(m => m.alive && !m.breakable).slice(0, 3);
      for (const m of foes) G.combat.hitMonster(m, { dmgPct: 1e7 });
      await sl(400); const s0 = D.startPos; G.player.setPos(s0.x, s0.z); G.player.moveTarget = null;
      r.pressed = G.townPortal.press(); await sl(200); r.casting = G.townPortal.casting;
      r.gate = !!D.world.scene.children.find(o => o.name === 'townPortal');
      for (let i = 0; i < 300 && !(G.mode === 'village' && !G.ui.iris.active); i++) await sl(100);
      r.mode = G.mode; r.label = G.townPortal.village?.label || null; r.alive = G.state.portal?.alive?.length ?? null; r.dead = G.state.portal?.dead?.length ?? null;
      await sl(500); G.townPortal.resume();
      for (let i = 0; i < 300 && !(G.mode === 'dungeon' && G.dungeon?.def?.id === 'mossyBurrow' && !G.ui.iris.active); i++) await sl(100);
      r.back = G.mode === 'dungeon' && G.dungeon !== D; r.after = G.dungeon?.monsters.filter(m => m.alive && m._sid != null).length ?? null; r.used = !G.state.portal;
      return r;
    });
  }
  if (label === 'arrival') { // ROADMAP Z-H3 in the bundle (actors/arrivals.js, poeJoin.js, shihtzuJoin.js, stellaJoin.js + kaizoArrive.js, goldenJoin.js, sceneStage.js; docs/ZONES.md §3.1): the Bamboo open, Poe arrives in town: she tails you round the plaza (her baked rig), the scene's view of the scenery is built, the sneeze and the staging, the dialogue and her plea, she joins and her quest's card opens; then Floofy kneels on the Shrine Road by his lanterns (his baked rig), Captain Kaizo's boat comes ashore with Stella in its bow, and Foosy marches in to guard the fountain (his baked rig and the Blender lance) and plays to the end: the vow, the ball, the whelp, his plea, he joins, his card
    s.arrival = await page.evaluate(async () => {
      const G = window.G, sl = ms => new Promise(q => setTimeout(q, ms)), r = {}, J = G.heroes.poeJoin, P = G.player, F = G.world.landmarks.fountain;
      G.sim.tickT = -1e9; G.state.quests.active = G.state.quests.active.filter(q => q.id !== 'welcome'); G.state.quests.cards = []; G.state.flags.hints = { all: true, scavDig: 1, travel: 1 };
      G.state.flags.mokaJoined = true; const mv = G.heroes.villagers.moka; if (mv) { mv.frozen = false; mv.waitingToJoin = false; }
      G.state.player.lvl = 4; G.actions.recompute(); if (G.day) G.day.paused = true;
      for (let i = 0; i < 100 && J.state !== 'wait'; i++) await sl(100);
      r.due = G.arrivals.cur?.a?.who || null;
      const marks = [[-4, 7], [-8, 2], [-7, -5], [0, -7], [7, -5], [8, 2], [4, 7]];
      for (let k = 0; k < 28 && J.state === 'wait'; k++) { P.moveTarget = new G.THREE.Vector3(F.x + marks[k % 7][0], 0, F.z + marks[k % 7][1]); for (let i = 0; i < 60 && P.moveTarget && J.state === 'wait'; i++) await sl(100); }
      r.tail = J.state === 'tail'; r.model = J.poe?.rig?.model || null;
      for (let i = 0; i < 60 && !J.view?.occ; i++) await sl(100);
      r.view = J.view?.occ?.n || 0;
      if (J.poe) P.moveTarget = new G.THREE.Vector3(J.poe.pos.x, 0, J.poe.pos.z);
      for (let i = 0; i < 150 && !G.ui.dlg.active; i++) await sl(100);
      r.staged = !!J.stg && !J.stg.fallback; r.speaker = G.ui.dlg.opts?.speaker || null;
      const said = [];
      for (let i = 0; i < 200 && J.state !== 'done' && J.state !== 'off'; i++) { if (G.ui.dlg.active) { said.push((G.ui.dlg.lines || []).map(l => l.text).join(' ')); if (G.ui.dlg.typing) G.ui.dlg.advance(); else if (G.ui.dlg.choices?.length && G.ui.dlg.i >= G.ui.dlg.lines.length - 1) G.ui.dlg.finish(0); else G.ui.dlg.advance(); } await sl(150); }
      r.plea = said.some(t => /Takemori is under siege/.test(t));
      r.joined = !!G.state.flags.poeJoined; r.villager = !!G.heroes.villagers.poe;
      for (let i = 0; i < 150 && !G.ui.isOpen('questCard'); i++) await sl(100);
      await sl(400);
      r.card = G.ui.isOpen('questCard') && G.questMoments.open === 'hq_takemori'; r.title = document.querySelector('.p-qcard .qc-title')?.textContent || null; r.face = !!document.querySelector('.p-qcard .qc-por img');
      G.ui.close('questCard');
      r.quest = G.state.quests.active.some(q => q.id === 'hq_takemori'); r.rec = G.state.flags.arrivals?.bamboo?.quest || null;
      return r;
    });
    Object.assign(s.arrival, await page.evaluate(async () => { // checkpoint 2: the next three in order (each the one due once the one before is behind us)
      const G = window.G, sl = ms => new Promise(q => setTimeout(q, ms)), r = {}, P = G.player;
      const Fl = G.state.flags, A = G.arrivals, Q = G.state.quests, wait = async (fn, n) => { for (let i = 0; i < n && !fn(); i++) await sl(100); return !!fn(); };
      const past = (zone, quest, joined) => { if (joined) Fl[joined + 'Joined'] = true; Fl.arrivals[zone] = { how: 'scene', quest: 'had', day: 1 }; Q.active = Q.active.filter(q => q.id !== quest); if (!Q.done.includes(quest)) Q.done.push(quest); A.cur = null; A.coolT = 0; };
      past('bamboo', 'hq_takemori'); G.state.player.lvl = 26; G.actions.recompute(); Q.cards = [];
      const S1 = G.heroes.stzJoin; r.stz = (await wait(() => S1.state === 'kneel' && S1.lanterns.length === 3, 600)) ? (S1.knight?.rig?.model || 'kit') : null;
      S1.reset(true); past('maple', 'hq_akane', 'shihtzu');
      const S2 = G.heroes.stlJoin; r.kaizo = await wait(() => S2.state === 'land' && !!S2.boat?.parent && !!S2.kaizo?.visible && !!S2.stella?.visible, 600); // (Stella in the bow of Captain Kaizo's boat: stellaJoin.js)
      S2.reset(true); past('tidepool', 'hq_shiokaze', 'stella');
      const S3 = G.heroes.gldJoin; await wait(() => S3.state === 'guard', 600); await sl(1500);
      const k3 = S3.knight; r.gld = { state: S3.state, model: k3?.rig?.model || null, glb: !!k3?.lance?.glb, act: k3?.anim.action?.name || null };
      if (k3) P.setPos(k3.pos.x + Math.sin(k3.facing) * 3.6, k3.pos.z + Math.cos(k3.facing) * 3.6);
      await wait(() => G.ui.dlg.active, 150);
      const said3 = []; let ball = false;
      for (let i = 0; i < 300 && S3.state !== 'done' && S3.state !== 'off'; i++) { ball ||= !!S3.ballState?.held; if (G.ui.dlg.active) { said3.push((G.ui.dlg.lines || []).map(l => l.text).join(' ')); if (G.ui.dlg.typing) G.ui.dlg.advance(); else if (G.ui.dlg.choices?.length && G.ui.dlg.i >= G.ui.dlg.lines.length - 1) G.ui.dlg.finish(0); else G.ui.dlg.advance(); } await sl(150); }
      r.gldBall = ball; r.gldPlea = said3.some(t => /Frostbelly/.test(t)); r.gldJoined = !!Fl.goldenJoined && !!G.heroes.villagers.golden;
      await wait(() => G.ui.isOpen('questCard'), 150); await sl(300);
      r.gldCard = G.questMoments.open === 'hq_yukimi'; G.ui.close('questCard');
      return r;
    }));
  }
  if (label === 'quest') { // UX-2 in the bundle (world/questMoments.js, docs/QUESTS.md): a quest taken opens its storybook card (its CSS, the giver's 3D face), Enter presses "Let's go!" and Shadow sets off; the Mossy Burrow's floor 1 shows its place title (its style, in the area banner's place) with the sting
    s.quest = await page.evaluate(async () => {
      const G = window.G, sl = ms => new Promise(q => setTimeout(q, ms)), r = {}, Q = G.state.quests;
      G.state.flags.burrowTut = true; G.state.flags.hints = { all: true }; Q.active = []; Q.done = ['welcome', 'burrow1', 'homes', 'lights']; Q.cards = [];
      const stings = []; const rs = G.audio.sting.bind(G.audio); G.audio.sting = (n, o) => { stings.push(n); return rs(n, o); };
      G.story.start('king');
      for (let i = 0; i < 200 && !G.ui.isOpen('questCard'); i++) await sl(100);
      await sl(900);
      const P = document.querySelector('.p-qcard'), F = P?.querySelector('.qc-frame'), go = P?.querySelector('.qc-go');
      r.card = G.ui.isOpen('questCard'); r.title = P?.querySelector('.qc-title')?.textContent; r.face = !!P?.querySelector('.qc-por img'); r.chips = P?.querySelectorAll('.qc-chip').length || 0;
      r.css = F ? getComputedStyle(F).borderTopLeftRadius !== '0px' && getComputedStyle(P).width !== 'auto' : false; r.goH = go ? Math.round(go.getBoundingClientRect().height) : 0;
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      for (let i = 0; i < 40 && G.ui.isOpen('questCard'); i++) await sl(100);
      r.closed = !G.ui.isOpen('questCard');
      for (let i = 0; i < 60 && G.lead.intent?.t?.quest !== 'king'; i++) await sl(100);
      r.lead = G.lead.intent?.t?.quest || null;
      // the hand-in (docs/QUESTS.md §4): the King of Squish done, told to Rosie: her thanks, the stamp (its CSS), the next quest
      G.lead.toggle?.(); Q.active = [{ id: 'king', step: 2, prog: 0, handIn: 1 }]; Q.cards = [];
      const ro = G.npcs.find(n => n.id === 'rosie'); G.player.setPos(ro.pos.x + 1, ro.pos.z + 1); G.talkTo(ro);
      for (let i = 0; i < 40 && !G.ui.dlg.active; i++) await sl(100);
      r.thanks = (G.ui.dlg.lines || []).map(l => l.text).join(' ');
      for (let i = 0; i < 40 && G.ui.dlg.active; i++) { G.ui.dlg.advance(); await sl(120); }
      for (let i = 0; i < 60 && !document.querySelector('.banners .bn-stamp'); i++) await sl(100);
      await sl(700);
      const H = document.querySelector('.banners .bn-stamp .st-hanko');
      r.stamp = !!H; r.stampCss = H ? getComputedStyle(H).position === 'absolute' && getComputedStyle(H.querySelector('circle')).strokeWidth !== '' : false; r.kingDone = Q.done.includes('king');
      for (let i = 0; i < 80 && !G.ui.isOpen('questCard'); i++) await sl(100);
      r.next = G.ui.isOpen('questCard') ? document.querySelector('.p-qcard .qc-title')?.textContent : null;
      G.ui.close('questCard'); Q.active = [{ id: 'king', step: 0, prog: 0 }]; Q.done = Q.done.filter(x => x !== 'king'); Q.cards = [];
      const den = G.state.dungeon.dens?.mossyBurrow; if (den) { den.bestFloor = 0; den.cleared = 0; den.crew = 0; } // (the hand-in cleared the den: its floor step would be done on arrival)
      G.enterDungeon({ id: 'mossyBurrow', floor: 1 });
      for (let i = 0; i < 300 && !(G.mode === 'dungeon' && !G.ui.iris.active && G.ui.banners.live?.style === 'place'); i++) await sl(100);
      await sl(600);
      const B = document.querySelector('.banners .bn-place');
      r.place = G.questMoments.stats.lastTitle?.sub || null; r.placeCss = B ? getComputedStyle(B.querySelector('.bn-pk span')).borderTopStyle === 'solid' : false; r.area = !!document.querySelector('.banners .bn-area'); r.sting = stings.includes('place');
      return r;
    });
  }
  if (label === 'lead') { // R-17 in the bundle (actors/shadowLead.js): a "Follow Shadow" reach step, he plans one route and leads it ahead of the hero, the paw trail's instanced mesh (its shader), the growl, the setting's default, the tracker's tap
    const E = (fn, a) => page.evaluate(fn, a), W = (fn, t = 6000) => page.waitForFunction(fn, null, { timeout: t }).then(() => true, () => false);
    await E(() => { const G = window.G, P = G.player, nav = P.nav, Q = G.state.quests; for (const sp of G.cozy?.scav?.view?.()?.spots || []) if (sp.state === 'hidden') sp.state = 'dug'; Q.active = [];
      for (let k = 0; k < 300; k++) { const a = k * 2.4, x = P.pos.x + Math.sin(a) * 30, z = P.pos.z + Math.cos(a) * 30; if (nav.freeAt(x, z) && nav.findPath(P.pos.x, P.pos.z, x, z)?.exact) { Q.requests.req_smoke = { def: { title: 'Follow Shadow', giver: 'rosie', desc: '', steps: [{ type: 'reach', at: 'home', x, z, text: 'Follow Shadow to the spot', lead: true }], reward: { coins: 1 }, request: true, next: null } }; G.story.start('req_smoke', true); break; } } });
    const led = await W(() => window.G.lead?.state === 'go');
    for (let i = 0; i < 12; i++) { await E(() => { const G = window.G, L = G.lead, R = L.route, P = G.player; if (R?.pts) { const q = L.pointAt(R, Math.max(0, L.sS - 1.4)); P.moveTarget = new P.pos.constructor(q.x, P.pos.y, q.z); } }); await page.waitForTimeout(250); }
    s.lead = { led, ...(await E(() => { const G = window.G, L = G.lead, m = L.trail.mesh; return { setting: L.setting(), plans: L.stats.plans, prints: L.stats.prints, ahead: +(L.sS - L.sH).toFixed(2), trail: !!m && m.parent === G.world.scene && m.geometry.instanceCount > 0, said: L.said.map(x => x[1]).join('|'), tracker: G.ui.hud.$.qtList?.dataset?.lead ?? null }; })) };
    await E(() => { window.G.lead.toggle(); window.G.player.moveTarget = null; });
    s.lead.stopped = await W(() => window.G.lead.state === 'off' && !!window.G.lead.dismiss, 3000);
  }
  if (label === 'fish') { // R-12 in the bundle (docs/HOMESTEAD.md §7): the cast, the big "!" at the float, the reel card with its how-to (their CSS), the camera's lean
    const E = (fn, a) => page.evaluate(fn, a), W = (fn, t = 5000) => page.waitForFunction(fn, null, { timeout: t }).catch(() => {});
    await E(() => { const G = window.G, P = G.player; G.state.fishing = { rod: 1, gotRod: true, milestones: [] }; P.moveTarget = null; P.setPos(152.5, 146); P.faceTo(142, 146); P.facing = P.faceTarget; });
    await page.waitForTimeout(500); await E(() => { window.G.interactCooldown = 0; }); await page.keyboard.press('f');
    await W(() => window.G.life.fishing.s?.phase === 'wait');
    await E(() => { const s = window.G.life.fishing.s; if (s) s.wait = s.t; });
    await W(() => window.G.life.fishing.s?.phase === 'bite'); await page.waitForTimeout(150);
    s.fish = await E(() => { const b = document.querySelector('.fish-cue.show .fc-in.bite .fc-bang'); return { cue: !!b, bang: b ? getComputedStyle(b).width : null }; });
    await page.keyboard.press('f'); await W(() => window.G.life.fishing.s?.phase === 'reel'); await page.waitForTimeout(800);
    Object.assign(s.fish, await E(() => { const c = document.querySelector('.reel.show .rl-card'); return { card: !!c, howto: !!c?.classList.contains('howto'), zoom: c ? getComputedStyle(c).zoom : null, how: c ? getComputedStyle(c.querySelector('.rl-how')).display : null, fishing: document.querySelector('.ui-root').classList.contains('fishing'), lean: +window.G.life.fishing.fk.toFixed(2) }; }));
    await page.keyboard.press('a'); await W(() => !window.G.life.fishing.s, 3000);
  }
  if (label === 'tooltip') { // R-13 (the owner's "tooltip backgrounds invisible"): the mouse over the HUD's bag button, a hotbar slot, a skill node and the bag's weapon; each tooltip shows with its gradient and reads dark on the screen (tools/qa/tooltip-lib.mjs; shots in tools/qa/tmp/prod-smoke/)
    // (the launcher's way in: Play Chewy Life.cmd opens the bundle's title screen; Continue, clicked, loads the save)
    await page.evaluate(() => window.G.save()); await page.goto(url + '/?notut');
    await page.waitForFunction(() => window.__ready === true && window.G?.titleActive, null, { timeout: 60000 }).catch(() => errs.push('tooltip: no title screen'));
    await page.waitForTimeout(1200);
    const cont = await page.evaluate(() => { const r = document.querySelector('.ti-btns [data-a="continue"]')?.getBoundingClientRect(); return r ? [r.x + r.width / 2, r.y + r.height / 2] : null; });
    if (cont) await page.mouse.click(cont[0], cont[1]);
    await page.waitForFunction(() => !window.G.titleActive && !window.G.ui.iris?.active, null, { timeout: 20000 }).catch(() => errs.push('tooltip: Continue did not start the game'));
    await page.waitForTimeout(1200);
    const r = await tooltipCheck(page, { shot: path.resolve('tools/qa/tmp/prod-smoke/tooltip') });
    s.tooltip = { ok: r.ok, ...Object.fromEntries(Object.entries(r.kinds).map(([k, v]) => [k, v ? { luma: v.luma, bg: /gradient/.test(v.bg || '') ? 'gradient' : v.bg || null, ok: v.ok } : null])) };
    // (the cause, found 2026-10-12: a Windows contrast theme (forced colours) drops the box's gradients and Dark Reader
    // rewrites them; the page opts out of both (style.css :root forced-color-adjust, index.html darkreader-lock). The
    // same check again with a contrast theme emulated)
    await page.emulateMedia({ forcedColors: 'active' }); await page.waitForTimeout(400);
    const f = await tooltipCheck(page, { shot: path.resolve('tools/qa/tmp/prod-smoke/tooltip-forced') });
    await page.emulateMedia({ forcedColors: 'none' });
    s.tooltip.forced = { ok: f.ok, ...Object.fromEntries(Object.entries(f.kinds).map(([k, v]) => [k, v ? v.luma : null])) };
    s.tooltip.lock = await page.evaluate(() => !!document.querySelector('meta[name="darkreader-lock"]'));
    s.tooltip.ok = s.tooltip.ok && f.ok && s.tooltip.lock;
  }
  if (label === 'charge') { // R-16 (the owner's "the charge window can't change"): by the real mouse in the bundle, K opens the skills, the Charge drawer's strip shows Whirlwind Stance and a click buys its perk
    const E = (fn, a) => page.evaluate(fn, a), W = (fn, a, t = 5000) => page.waitForFunction(fn, a, { timeout: t }).then(() => true, () => false);
    const at = sel => E(sel => { const e = document.querySelector(sel), r = e?.getBoundingClientRect(); return r?.width ? [r.x + r.width / 2, r.y + r.height / 2] : null; }, sel);
    await E(() => { const G = window.G, pl = G.state.player; pl.lvl = 14; pl.skillPts = 3; Object.assign(pl.skills, { chomp: 6, whirl: 3 }); pl.chargePerks = {}; G.state.flags.hints = { all: true }; G.actions.recompute(); });
    await page.mouse.move(1500, 450); await page.keyboard.press('k');
    const open = await W(() => window.G.ui.isOpen('skills') && !document.querySelector('.pw.opening') && document.querySelectorAll('.chg-pick .chg-sk').length === 4);
    const b = await at('.chg-sk[data-k="whirl"]'); if (b) await page.mouse.click(b[0], b[1]);
    const shown = await W(() => window.G.ui.panels.skills.chg.id === 'whirl' && !document.querySelector('.chg-drawer.swap'));
    const p = await E(() => document.querySelector('.chg-pk.can')?.dataset.p || null), pb = p && await at(`.chg-pk[data-p="${p}"]`);
    if (pb) await page.mouse.click(pb[0], pb[1]);
    await W(p => (window.G.state.player.chargePerks?.whirl?.[p] || 0) > 0, p);
    s.charge = { open, shown, ...(await E(() => ({ id: window.G.ui.panels.skills.chg.id, perks: JSON.stringify(window.G.state.player.chargePerks), pts: window.G.state.player.skillPts, strip: [...document.querySelectorAll('.chg-pick .chg-sk')].map(e => e.dataset.k + (e.classList.contains('sel') ? '*' : '')).join() }))), perk: p };
  }
  const ttOk = !s.tooltip || s.tooltip.ok;
  const cg = s.charge, chgOk = !cg || (cg.open && cg.shown && cg.id === 'whirl' && cg.perk && JSON.parse(cg.perks).whirl?.[cg.perk] === 1 && cg.pts === 2 && /whirl\*/.test(cg.strip));
  const fi = s.fish, fishOk = !fi || (fi.cue && Math.abs(parseFloat(fi.bang) - 46) < 1 && fi.lean > 0.5 && fi.card && fi.howto && fi.zoom === '1.15' && fi.how === 'flex' && fi.fishing);
  const pz = s.poe, poeOk = !pz || (pz.hero === 'poe' && (!TOY_POE || (s.model === 'poe_toy' && pz.baked)) && (!POE_FUMA || (pz.fuma === 'glb' && pz.villagerFuma === 'glb')) && pz.back && pz.wt === 'fuma' && pz.cast && pz.flying && pz.caught && pz.icons && pz.switch && pz.after === 'chewy' && pz.poeVillager);
  const sz = s.shihtzu, stzOk = !sz || (sz.hero === 'shihtzu' && (!TOY_STZ || (s.model === 'shihtzu_toy' && sz.baked)) && (!STZ_FLAIL || (sz.flail === 'glb' && sz.links && sz.villager === 'glb')) && sz.chain && sz.wt === 'flail' && sz.dr >= 5 && sz.icons && sz.kit?.pups >= 2 && sz.kit.gp && sz.kit.lantern && sz.switch && sz.after === 'chewy');
  const gd = s.golden, gldOk = !gd || (gd.hero === 'golden' && (!TOY_GOLDEN || (gd.model === 'golden_toy' && gd.baked)) && (!GLD_PROPS || (gd.lance && gd.villager)) && gd.wt === 'lance' && gd.shadowLife >= 20
    && gd.whelp && (!WHELP || (gd.whelpModel === 'shadow_whelp' && gd.wings)) && gd.flying && gd.icons && gd.thrust && gd.dart && gd.javelin && gd.landed && gd.jump && gd.air && gd.crash && gd.breath && gd.puffed && gd.charged && gd.switch && gd.after === 'chewy' && gd.whelpOff);
  const sl = s.stella, stlOk = !sl || (sl.hero === 'stella' && (!TOY_STELLA || (sl.model === 'stella_toy' && sl.baked)) && (!STL_WAGASA || (sl.wagasa && sl.tassels >= 4)) && sl.wt === 'parasol' && sl.revive === 6
    && sl.icons && sl.sweep && sl.ray && sl.light && sl.healed && sl.shell && sl.charged && sl.flare && sl.flareHit && sl.sun && sl.switch && sl.after === 'chewy' && sl.cleared);
  const dg = s.dig, digOk = !dg || (dg.nodes === 10 && dg.draws === 3 && dg.gathered && dg.nose && dg.dug && dg.perfect === 1);
  const ld = s.lead, leadOk = !ld || (ld.led && ld.setting === 1 && ld.plans === 1 && ld.prints > 3 && ld.ahead > 0.5 && ld.trail && /This way!/.test(ld.said) && ld.tracker === '0' && ld.stopped);
  const pc = s.peaceful, peaceOk = !pc || (pc.board && pc.cards >= 1 && pc.css === '760px' && pc.peace && pc.wild === 2 && pc.allWild && pc.edge && pc.glades >= 2 && pc.zoneBoard && (!pc.sight || pc.bounty));
  const gl = s.guild, guildOk = !gl || (gl.built && gl.model && gl.hachi && gl.css === '960px' && gl.cands === 3 && gl.hired && gl.out === 1 && gl.away && gl.back && gl.xp > 0 && gl.inTown);
  const cc = s.crewclear, crewOk = !cc || (cc.offered && cc.out === 1 && cc.result === 'success' && cc.crew === 1 && cc.cleared === 0 && cc.t1 === 1 && cc.maple && cc.fan0 === 0 && cc.claim && cc.fan === 1 && cc.ribbon && cc.stamp === 'Saved' && cc.lit);
  const cz = s.cozy, cozyOk = !cz || (cz.board && cz.css === '1010px' && cz.cards >= 6 && cz.out === 1 && cz.away && cz.back && /success|partial|setback/.test(cz.report) && cz.xp > 0 && cz.chip && cz.inTown && cz.card && cz.log >= 1 && cz.guides === 13); // (13 since H-6: Meet Stella)
  const db = s.debug, debugOk = (label !== 'village' || s.noDebug) && (!db || (db.refused && db.on && db.chunk && db.tabs >= 10 && db.css === '760px' && db.coins === 1000 && db.used && db.closed));
  const pd = s.pad, padOk = !pd || (pd.dev === 'pad' && pd.moved > 1.5 && pd.glyphs >= 6 && pd.cursor && pd.cast >= 1 && pd.focus);
  const tc = s.touch, touchOk = !tc || (tc.dev === 'touch' && tc.on && tc.slots === 6 && tc.preset === 4 && tc.pr === 1 && tc.phone && tc.moved > 1 && tc.manifest && tc.burrow?.gone > 0 && tc.burrow.calls > 0 && tc.burrow2?.gone > 0 && tc.burrow2.calls > 0);
  const dk = s.deck, deckOk = !dk || (dk.preset === 3 && dk.quality === 1 && dk.pr === 0.85 && !dk.ao && dk.shadow === 1536 && dk.ui === 1.15 && dk.safe === '12px' && dk.floor === '12px');
  const m = s.moka, mokaOk = !m || ((!TOY_MOKA || s.model === 'moka_toy') && m.baked && m.staff && m.wt === 'staff' && m.cast && m.switch && m.after === 'chewy' && m.chewyBaked && m.mokaVillager);
  const dn = s.dens, densOk = !dn || (dn.open && dn.pins === 4 && dn.locked === 3 && dn.go && dn.painted && dn.den === 'mossyBurrow' && dn.floor === 1 && dn.kind === 'burrow' && dn.closed && dn.loc === 'Mossy Burrow' && dn.boss === 'mochiKing' && dn.big >= 15 && !dn.stairs);
  const tp = s.portal, portalOk = !tp || (tp.pressed && tp.casting && tp.gate && tp.mode === 'village' && tp.label === 'Step into the Town Portal (the Mossy Burrow, floor 1)' && tp.dead >= 3 && tp.back && tp.after === tp.alive && tp.used);
  const av = s.arrival, arrivalOk = !av || (av.due === 'poe' && av.tail && (!TOY_POE || av.model === 'poe_toy') && av.view > 1000 && av.staged && av.speaker === 'Poe' && av.plea && av.joined && av.villager && av.card && av.title === 'Takemori Under Siege' && av.face && av.quest && av.rec === 'start'
    && !!av.stz && (!TOY_STZ || av.stz === 'shihtzu_toy') && av.kaizo && av.gld?.state === 'guard' && (!TOY_GOLDEN || av.gld.model === 'golden_toy') && (!GLD_PROPS || av.gld.glb) && av.gldBall && av.gldPlea && av.gldJoined && av.gldCard);
  const qm = s.quest, questOk = !qm || (qm.card && qm.title === 'The King of Squish' && qm.face && qm.chips === 4 && qm.css && qm.goH >= 40 && qm.closed && qm.lead === 'king' && /festival mochi/.test(qm.thanks || '') && qm.stamp && qm.stampCss && qm.kingDone && qm.next === 'A Shrine for Wishes' && qm.place === 'Floor 1 of 2 · Find the stairs down to floor 2' && qm.placeCss && !qm.area && qm.sting);
  const ok = s.ui > 0 && s.hasUI && s.audio && !errs.length && questOk && arrivalOk && densOk && portalOk && ttOk && chgOk && debugOk && cozyOk && crewOk && guildOk && peaceOk && digOk && leadOk && fishOk && mokaOk && padOk && touchOk && deckOk && poeOk && stzOk && gldOk && stlOk && regionOk && zoneOk && homeOk && (label !== 'title' || (s.title && s.art?.ready && s.art.gl && s.art.covers && s.art.canvas)) && (label !== 'village' || (s.mode === 'village' && s.refinedRigs && s.disney && (!CHEWY_MODEL || s.model === CHEWY_MODEL) && (!SAMURAI_CHEWY || s.saya) && (!TOY_SHADOW || s.pet === 'shadow_toy') && (!TOY_ROSIE || s.rosie === 'rosie_toy') && TOY_VILLAGERS.every(id => s.villagers?.[id] === `${id}_toy`))) && (!regionId || s.mode === 'dungeon'); // Blender skins + the Disney Chewy shipped in public/rigs
  console.log(`${ok ? 'PASS' : 'FAIL'}  production ${label}: ${JSON.stringify(s)}${errs.length ? '\n   ' + [...new Set(errs)].slice(0, 8).join('\n   ') : ''}`);
  if (!ok) failed++;
  await page.close();
}
await browser.close();
await new Promise(r => server.httpServer.close(r));
fs.rmSync(outDir, { recursive: true, force: true });
console.log(failed ? `== production smoke: ${failed} FAILED` : '== production smoke: PASS');
process.exit(failed ? 1 : 0);
