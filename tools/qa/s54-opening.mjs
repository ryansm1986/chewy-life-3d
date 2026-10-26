// Scenario 54: a new game's opening (world/opening.js, ROADMAP CN-1). Three shots of Blossom Hollow in letterbox bars,
// the HUD away, "Blossom Hollow" over the town, the crane down to Chewy (he yawns and stretches), the camera landing on
// the game camera's own yaw, pitch and lens; then the bars go, the HUD comes back, Rosie trots in and her welcome starts.
// Nothing pops up over it (no guide, quest card or place title; no autosave). Esc, a click, the pad's A skip it.
// Filmstrip: node tools/qa/opening-shots.mjs.   node tools/qa/s54-opening.mjs
import { launch, boot, sleep, makeReport } from './lib.mjs';
import { installPad, padTap } from './pad-lib.mjs';

const R = makeReport('S54 the opening');
const { browser, page, errors, warns } = await launch({ w: 1280, h: 720 });
const ev = (fn, a) => page.evaluate(fn, a);
const state = () => ev(() => { const G = window.G, op = G.opening, rig = G.engine.rig, hud = getComputedStyle(document.querySelector('.l-hud')).opacity; return { act: !!op?.active, i: op?.i ?? -1, t: op?.t ?? 0, cut: G.cutscene, cine: G.ui.root.classList.contains('cine'), bars: !!document.querySelector('.op .op-bar'), hud: +hud, titled: !!document.querySelector('.op.titled'), dlg: !!G.ui.dlg?.active, speaker: G.ui.dlg?.active ? G.ui.dlg.opts?.speaker : null, locked: G.player.controlLocked, yaw: rig.yaw, pitch: rig.pitch, fov: G.engine.camera.fov, dist: rig.dist, anim: G.player.anim.action?.name || null, card: G.ui.isOpen?.('questCard') || false, guide: !!G.tutorials?.active, saves: G.autosave?.log?.length ?? 0 }; });

try {
  // ---- it plays through
  await boot(page, 'fresh&cine&notut');
  await page.waitForFunction(() => window.G.opening?.active, null, { timeout: 15000 });
  const s0 = await state();
  R.check('a) a new game opens on the opening: letterbox bars, the HUD away, a cutscene (Chewy held still)', s0.act && s0.cut === 'opening' && s0.cine && s0.bars && s0.hud < 0.05 && s0.locked, JSON.stringify(s0));
  const seen = { shots: new Set(), title: false, yawn: false, stretch: false, popups: [] };
  const saves0 = s0.saves;
  for (let k = 0; k < 300; k++) {
    const s = await state();
    seen.shots.add(s.i); if (s.titled) seen.title = true; if (s.anim === 'yawn') seen.yawn = true; if (s.anim === 'stretch') seen.stretch = true;
    if (s.card || s.dlg) seen.popups.push(s.card ? 'card' : 'dialogue');
    if (!s.act) break;
    await sleep(page, 150);
  }
  const s1 = await state();
  R.check('a) three shots, "Blossom Hollow" over the town, Chewy yawns and stretches as the camera comes down; nothing pops up over it and no autosave mid-shot', seen.shots.size === 3 && seen.title && seen.yawn && seen.stretch && !seen.popups.length && s1.saves === saves0, JSON.stringify({ shots: [...seen.shots], title: seen.title, yawn: seen.yawn, stretch: seen.stretch, popups: seen.popups, saves: [saves0, s1.saves] }));
  R.check('a) it lands on the game camera (yaw π/4, pitch 0.62, lens 20°), close on Chewy; the cutscene ends', !s1.act && !s1.cut && Math.abs(s1.yaw - Math.PI / 4) < 1e-6 && Math.abs(s1.pitch - 0.62) < 1e-6 && s1.fov === 20 && s1.dist < 14, JSON.stringify(s1));
  await page.waitForFunction(() => window.G.ui.dlg?.active, null, { timeout: 8000 }).catch(() => {});
  await sleep(page, 1600);
  const s2 = await state();
  const rosie = await ev(() => { const G = window.G, R = G.npcs[0]; return { d: Math.hypot(R.pos.x - G.player.pos.x, R.pos.z - G.player.pos.z) }; });
  R.check('b) then the bars go, the HUD comes back, the camera eases out to the two-shot and Rosie (beside Chewy) says good morning', s2.dlg && s2.speaker === 'Rosie' && !s2.bars && !s2.cine && s2.hud > 0.95 && Math.abs(s2.dist - 20) < 0.6 && rosie.d < 2.5, JSON.stringify({ s2, rosie }));

  // ---- Esc skips it (and doesn't open the menu)
  await boot(page, 'fresh&cine&notut');
  await page.waitForFunction(() => window.G.opening?.active && window.G.opening.t > 1, null, { timeout: 15000 });
  const tk = Date.now();
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !window.G.opening.active, null, { timeout: 5000 }).catch(() => {});
  const k1 = { ...(await state()), ms: Date.now() - tk, menu: await ev(() => window.G.ui.isOpen('menu')) };
  R.check('c) Esc skips it: a dip to black, then straight to Chewy (under 1.5 s), and the pause menu stays shut', !k1.act && k1.ms < 1500 && !k1.menu && Math.abs(k1.pitch - 0.62) < 1e-6 && k1.fov === 20, JSON.stringify(k1));
  await page.waitForFunction(() => window.G.ui.dlg?.active, null, { timeout: 8000 }).catch(() => {});
  R.check('c) …and Rosie\'s welcome follows', (await state()).speaker === 'Rosie', '');

  // ---- a click skips it; the hint names the key
  await boot(page, 'fresh&cine&notut');
  await page.waitForFunction(() => window.G.opening?.active && window.G.opening.t > 1.8, null, { timeout: 15000 });
  const hint = await ev(() => document.querySelector('.op-skip')?.textContent.trim());
  await page.mouse.click(640, 360);
  await page.waitForFunction(() => !window.G.opening.active, null, { timeout: 5000 }).catch(() => {});
  R.check('d) a click skips it; the skip hint reads "Skip Esc"', !(await state()).act && hint === 'SkipEsc', JSON.stringify({ hint }));

  // ---- the pad's A skips it
  await boot(page, 'fresh&cine&notut');
  await installPad(page);
  await page.waitForFunction(() => window.G.opening?.active && window.G.opening.t > 1, null, { timeout: 15000 });
  await padTap(page, 'A');
  await page.waitForFunction(() => !window.G.opening.active, null, { timeout: 5000 }).catch(() => {});
  R.check('e) the pad\'s A skips it', !(await state()).act, '');

  // ---- the QA's own fresh games keep the old start (no opening)
  await boot(page, 'fresh&notut');
  await sleep(page, 2500);
  R.check('f) a ?fresh session (the QA) has no opening: Rosie\'s welcome as before', !(await ev(() => !!window.G.opening)) && (await state()).speaker === 'Rosie', '');
} catch (e) { errors.push('[harness] ' + e.stack); }
const failed = R.finish(errors, warns);
await browser.close();
process.exit(failed ? 1 : 0);
