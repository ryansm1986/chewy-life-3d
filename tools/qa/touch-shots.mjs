// The touch controls' look review (docs/CONTROLS.md §12, ROADMAP CT-5): screenshots at a phone in landscape (844×390 at
// DPR 3) and a tablet (1180×820 at DPR 2), driven by real touches (tools/qa/touch-lib.mjs).
//   node tools/qa/touch-shots.mjs [phone|tablet|all] [shot names…]   → tools/qa/tmp/touch-shots/<device>-<name>.png
// Shots: hud (the village), stick (walking, sprinting), fight (a Burrow fight, Drag aim held on a skill), charge (a skill
// charging), wheel / wheel5 (the hero wheel up, with the roster / a fake 5th hero), left (left-handed), controls (Settings › Controls › Touch), dark (a night village),
// dungeon (the HUD over a dark floor), build-palette / build (build mode by touch, a building in hand), reel (fishing),
// decorate-palette / decorate (a piece in hand). The menus at a phone's size: tools/qa/mobile-ui.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { launchTouch, boot, waitMode, sleep, center, PHONE, TABLET } from './touch-lib.mjs';

const OUT = path.resolve('tools/qa/tmp/touch-shots');
fs.mkdirSync(OUT, { recursive: true });
const args = process.argv.slice(2), which = ['phone', 'tablet', 'all'].includes(args[0]) ? args.shift() : 'all';
const only = new Set(args);
const want = n => !only.size || only.has(n);

async function run(dev) {
  const D = dev === 'tablet' ? TABLET : PHONE;
  const { browser, page, errors, F } = await launchTouch(D);
  const ev = (f, a) => page.evaluate(f, a);
  const shot = async name => { const f = path.join(OUT, `${dev}-${name}.png`); await page.screenshot({ path: f }); console.log('  shot', f); };
  const C = sel => center(page, sel);
  try {
    await boot(page, 'fresh&nointro&notut&hour=10');
    await ev(() => {
      const G = window.G, st = G.state;
      st.flags.burrowTut = true; st.flags.hints = { all: true };
      st.potions = { heart: 4, zoom: 3, rejuv: 1 };
      const pl = st.player; pl.lvl = 12; for (const id of ['chomp', 'packcall', 'blaze', 'decoy', 'moonhowl']) pl.skills[id] = 3;
      pl.hotbar = ['attack', 'chomp', 'blaze', 'packcall', 'decoy', 'moonhowl'];
      G.actions.addPantry('onigiri', 3); st.cookbook = st.cookbook || {}; st.cookbook.quick = 'onigiri';
      G.actions.recompute(); G.actions.restoreAll();
      st.flags.mokaJoined = true; const v = G.heroes.villagers.moka; if (v) { v.frozen = false; v.waitingToJoin = false; }
      const T = (st.flags.tutorials ||= {}); for (const id of ['house', 'switch', 'fishing', 'makeHome', 'remodel', 'charge', 'meetPoe']) T[id] = { done: true };
      G.heroes.joinPoe?.();
      G.ui.toasts?.retire?.(0);
      const c = G.world.landmarks.plaza; G.player.setPos(c.x + 2, c.z + 7); G.engine.rig.focus.copy(G.player.pos); G.engine.rig.snap();
    });
    await page.waitForFunction(() => !window.G.ui.banners?.busy, null, { timeout: 15000 }).catch(() => {}); // (Poe's joining banner)
    await sleep(page, 800);
    if (want('hud')) await shot('hud');
    if (want('stick')) {
      await F.down(1, 150, D.h - 110); await F.frame(); await F.move(1, 150 + 40, D.h - 140, 4); await sleep(page, 400); await shot('stick');
      await F.move(1, 150 + 80, D.h - 175, 4); await sleep(page, 500); await shot('sprint');
      await F.up(1); await sleep(page, 300);
    }
    const wheel = async (name) => { // (hold the hero button: the wheel stays up for a tap; a toast is up behind it)
      await ev(() => { window.G.heroes.cd = 0; window.G.ui.toast('Shadow found a shiny pebble by the fountain!', { color: '#9fd0ff', duration: 9 }); });
      await sleep(page, 400);
      const h = await C('.tc-hero');
      if (!h) return;
      await F.down(2, h.x, h.y); await sleep(page, 700); await F.up(2); await sleep(page, 600); await shot(name);
      if (await ev(() => window.G.heroes.wheelOpen)) await ev(() => window.G.heroes.pickFromWheel(null));
      await sleep(page, 300);
    };
    if (want('wheel')) await wheel('wheel');
    if (want('wheel5')) { // a fifth hero (test only: H-5's dragoon is coming)
      await ev(() => { const H = window.G.heroes, raw = H.roster.bind(H); H.roster = () => { const l = raw(); if (l.length < 5) l.push({ id: 'golden', name: '???', title: 'Not met yet', color: '#e8a040', lvl: 1, active: false, joined: false, ready: false, why: 'Somewhere far away…' }); return l; }; });
      await wheel('wheel5');
    }
    if (want('left')) {
      await ev(() => window.G.ui.setSetting('touchLeft', true)); await sleep(page, 1200);
      await F.down(1, D.w - 160, D.h - 110); await F.frame(); await F.move(1, D.w - 200, D.h - 140, 4); await sleep(page, 300);
      await shot('left');
      await F.up(1);
      await ev(() => window.G.ui.setSetting('touchLeft', false)); await sleep(page, 1200);
    }
    if (want('controls')) {
      await ev(() => { window.G.ui.open('menu'); window.G.ui.panels.menu.setView('controls'); }); await sleep(page, 700); await shot('controls');
      await ev(() => window.G.ui.close('menu')); await sleep(page, 400);
    }
    if (want('dark')) {
      await ev(() => { window.G.day.hour = 21.5; window.G.day.apply?.(); }); await sleep(page, 1500); await shot('dark');
      await ev(() => { window.G.day.hour = 10; window.G.day.apply?.(); }); await sleep(page, 600);
    }
    if (want('build')) { // build mode by touch: the Park Bench in hand over the plaza (the palette folds on a phone), then the palette open
      await ev(() => { const G = window.G; G.state.coins = 3000; G.state.materials.wood = 99; G.ui.toasts?.retire?.(0); G.build.enter(); });
      await sleep(page, 900); await shot('build-palette');
      await ev(() => { const B = window.G.build, P = window.G.ui.panels.build; const card = [...document.querySelectorAll('.p-build .card')].find(e => /Park Bench/.test(e.textContent)); if (card) card.click(); else B.setTool?.({ kind: 'building', type: 'bench' }); });
      await sleep(page, 500);
      await F.tap(Math.round(D.w * 0.45), Math.round(D.h * 0.42)); await sleep(page, 700); await shot('build');
      await ev(() => window.G.build.exit()); await sleep(page, 600);
    }
    if (want('decorate') || want('reel')) {
      if (want('reel')) { // fishing by touch: the reel bar with its touch hint
        await ev(() => { const G = window.G, P = G.player, W = G.world, L = W.landmarks, c = L.pond || L.fishing || null; G.state.fishing = { ...(G.state.fishing || {}), rod: 1, gotRod: true };
          for (let r = 2; r < 40; r += 0.5) for (let a = 0; a < 24; a++) { const x = (c?.x ?? L.plaza.x) + Math.cos(a / 12 * Math.PI) * r, z = (c?.z ?? L.plaza.z) + Math.sin(a / 12 * Math.PI) * r; if (!W.walkable(x, z) || W.heightAt(x, z) < 0.02) continue; const fx = Math.cos(a / 12 * Math.PI + Math.PI), fz = Math.sin(a / 12 * Math.PI + Math.PI); if (W.heightAt(x + fx * 1.6, z + fz * 1.6) < -0.05) { P.setPos(x, z); P.faceTo(x + fx, z + fz); P.facing = P.faceTarget; G.engine.rig.focus.copy(P.pos); G.engine.rig.snap(); return; } } });
        await sleep(page, 700);
        const atk = await C('.tc-attack'); if (atk) await F.tap(atk.x, atk.y);
        await page.waitForFunction(() => window.G.life.fishing.s?.phase === 'wait', null, { timeout: 6000 }).catch(() => {});
        await ev(() => { const s = window.G.life.fishing.s; if (s) { s.wait = s.t + 0.01; s.fish = 'koi'; } });
        await page.waitForFunction(() => window.G.life.fishing.s?.phase === 'bite', null, { timeout: 4000 }).catch(() => {});
        await F.down(7, Math.round(D.w * 0.6), Math.round(D.h * 0.4)); await sleep(page, 900); await shot('reel'); await F.up(7);
        await page.waitForFunction(() => !window.G.life.fishing.s, null, { timeout: 30000 }).catch(() => {});
      }
      if (want('decorate')) { // decorate by touch: a piece in hand in the cottage
        await ev(() => window.G.openHome()); await page.waitForFunction(() => window.G.mode === 'interior' && !window.G.ui.iris.active, null, { timeout: 20000 }); await sleep(page, 900);
        await ev(async () => { const F = (await import('/src/home/furniture.js')).FURNITURE; const id = Object.keys(F).find(k => F[k].mount === 'floor' && F[k].size?.[0] === 1 && !F[k].own) || Object.keys(F)[0]; window.G.actions.addFurniture(id, 2); window.G.housing.decor.enter(); });
        await sleep(page, 900); await shot('decorate-palette');
        await ev(() => { const c = [...document.querySelectorAll('.p-decor .card')].find(e => e.offsetParent); c?.click(); });
        await sleep(page, 400);
        await F.tap(Math.round(D.w * 0.5), Math.round(D.h * 0.36)); await sleep(page, 700); await shot('decorate');
        await ev(() => { const D2 = window.G.housing.decor; D2.cancel?.(); D2.exit?.(); window.G.housing.exit?.(); }); await page.waitForFunction(() => window.G.mode === 'village' && !window.G.ui.iris.active, null, { timeout: 20000 }).catch(() => {}); await sleep(page, 600);
      }
    }
    if (want('fight') || want('charge') || want('dungeon')) {
      await ev(() => window.G.enterDungeon(2));
      await waitMode(page, 'dungeon'); await sleep(page, 1500);
      await ev(() => { // a few foes round the hero, held still
        const G = window.G, P = G.player, { f, r } = G.engine.rig.groundAxes(); let k = 0;
        for (const m of G.dungeon.monsters) { if (!m.alive || m.isBoss) continue; if (k < 4) { const a = [[4, 2.5], [5.5, -1.5], [3, -4], [7, 3.5]][k]; m.pos.set(P.pos.x + f.x * a[0] + r.x * a[1], P.pos.y, P.pos.z + f.z * a[0] + r.z * a[1]); m.sync?.(); m.status.stun = 999; m.lifeMax = m.life = 1e6; m.speed = 0; } else { m.pos.set(-999, 0, -999); m.sync?.(); } k++; }
        G.engine.rig.focus.copy(P.pos); G.engine.rig.snap(); G.ui.toasts?.retire?.(0);
      });
      await sleep(page, 600);
      if (want('dungeon')) await shot('dungeon');
      if (want('fight')) {
        await ev(() => window.G.ui.setSetting('touchAim', 1));
        const s = await C('.tc-slot[data-slot="2"]');
        await F.down(1, 150, D.h - 110); await F.frame(); await F.move(1, 175, D.h - 120, 3);
        await F.down(3, s.x, s.y); await F.frame(); await F.move(3, s.x - 70, s.y - 60, 6); await sleep(page, 500);
        await shot('fight');
        await F.move(3, s.x + 3, s.y + 2, 4); await sleep(page, 250); await shot('cancel');
        await F.up(3); await F.up(1); await sleep(page, 400);
        await ev(() => window.G.ui.setSetting('touchAim', 0));
      }
      if (want('charge')) {
        await ev(() => { const G = window.G; G.skills.cds = {}; G.actions.restoreAll(); });
        const s = await C('.tc-slot[data-slot="2"]');
        await F.down(3, s.x, s.y); await page.waitForFunction(() => (window.G.skills.charge.active?.stage || 0) >= 2, null, { timeout: 6000 }).catch(() => {});
        await sleep(page, 150); await shot('charge');
        await F.up(3); await sleep(page, 400);
      }
    }
  } catch (e) { console.log('  FAILED', e.message); }
  if (errors.length) console.log('  errors:', [...new Set(errors)].slice(0, 6).join('\n  '));
  await browser.close();
}

for (const d of which === 'all' ? ['phone', 'tablet'] : [which]) { console.log(`== touch-shots ${d}`); await run(d); }
