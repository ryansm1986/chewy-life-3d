// The Town Portal's look review (docs/ZONES.md §4.2; ROADMAP Z-H2): the cast on a den floor (the moon gate half open and
// nearly open, slowed so the stills land mid-cast), the return portal by the plaza in Blossom Hollow (day and night, at the
// game camera and closer), the touch HUD's portal button on a phone and the pad's Game page on the Deck. Waits key on game
// state.
//   node tools/qa/portal-shots.mjs [--dev desktop,deck,phone] [--den foxShrine] [--tag now]
// → <SHOT_DIR>/portal_<tag>_<dev>_<what>.png (SHOT_DIR default tools/qa/tmp/portal)
import fs from 'node:fs';
import path from 'node:path';
import { launch, boot, waitMode } from './lib.mjs';
import { launchTouch, PHONE } from './touch-lib.mjs';
import { installPad, padTap } from './pad-lib.mjs';

const args = process.argv.slice(2), arg = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const devs = arg('dev', 'desktop,deck,phone').split(','), tag = arg('tag', 'now'), den = arg('den', 'foxShrine');
const OUT = process.env.SHOT_DIR || path.resolve('tools/qa/tmp/portal');
fs.mkdirSync(OUT, { recursive: true });
const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const DECK_APP = () => { window.pawhaven = { desktop: true, deck: true, platform: 'linux', version: '0.6.6', isFullscreen: () => true, setFullscreen() {}, onFullscreen() {}, quit() {},
  update: { info: async () => ({ shell: '0.6.6', game: '0.6.6', source: 'built-in' }), check: async () => ({ status: 'none' }), install: async () => ({ ok: false }), cancel: async () => {}, later: async () => {}, openPage: async () => {}, onProgress: () => () => {} } }; };

for (const dev of devs) {
  const L = dev === 'phone' ? await launchTouch({ ...PHONE, ua: IOS }) : await launch(dev === 'deck' ? { w: 1280, h: 800 } : { w: 1920, h: 1080 });
  const { browser, page, errors } = L;
  if (dev === 'deck') await page.addInitScript(DECK_APP); // (the desktop app's Deck profile: the Deck preset and UI scale)
  const ev = (f, a) => page.evaluate(f, a);
  const shot = async name => { const f = path.join(OUT, `portal_${tag}_${dev}_${name}.png`); await page.screenshot({ path: f }); console.log(`${dev} ${name} → ${f}`); };
  try {
    await boot(page, 'fresh&nointro&notut&hour=11');
    if (dev === 'deck') await installPad(page);
    await ev(() => { const G = window.G; G.state.flags.burrowTut = true; G.state.flags.mokaJoined = true; G.state.player.lvl = 12; G.actions.recompute(); G.actions.restoreAll(); G.tierDebug?.unlock?.('bambooDepths', 1); });
    await ev(den => { const G = window.G; G.state.dungeon.dens = { mossyBurrow: { cleared: 1, bestFloor: 2 } }; G.enterDungeon({ id: den, floor: 1 }); }, den);
    await page.waitForFunction(id => window.G.mode === 'dungeon' && window.G.dungeon?.def?.id === id && !window.G.ui?.iris?.active, den, { timeout: 60000 });
    await ev(() => { const G = window.G; setInterval(() => { G.player.invuln = true; G.actions.restoreAll?.(); }, 250); for (const m of G.dungeon.monsters) m.aggro = false; const s = G.dungeon.startPos; G.player.setPos(s.x, s.z); G.player.moveTarget = null; });
    await page.waitForTimeout(1500);
    if (dev === 'phone') await shot('hud-floor'); // (the portal button left of the bag)
    if (dev === 'deck') { // the pad's Game page: Home reads Town Portal on a floor
      await padTap(page, 'A'); await page.waitForTimeout(200); await padTap(page, 'Menu');
      await page.waitForFunction(() => window.G.ui.isOpen('menu'), null, { timeout: 4000 }); await page.waitForTimeout(500);
      await shot('pad-game-page'); await padTap(page, 'Menu'); await page.waitForTimeout(400);
    }
    // the cast, slowed ×0.12 so the stills land half open and nearly open
    await ev(() => { const G = window.G; G.engine.timeScale = 0.12; G.townPortal.press(); });
    const openAt = async k => page.waitForFunction(k => { const g = window.G.dungeon?.world.scene.children.find(o => o.name === 'townPortal'); let u = -1; g?.traverse(c => { if (c.material?.uniforms?.uOpen) u = c.material.uniforms.uOpen.value; }); return u >= k; }, k, { timeout: 20000, polling: 'raf' });
    await openAt(0.45); await shot('cast-half');
    await openAt(0.9); await shot('cast-open');
    await ev(() => { window.G.engine.timeScale = 1; });
    await waitMode(page, 'village', 40000);
    await page.waitForTimeout(1800); await shot('village-arrive'); // (at the game camera: the hero in front of the return portal)
    await ev(() => { const G = window.G, V = G.townPortal.village, P = G.player; P.setPos(V.x + 1.2, V.z + 3.6); P.facing = P.faceTarget = Math.atan2(V.x - P.pos.x, V.z - P.pos.z); G.engine.rig.focus?.copy?.(P.pos); G.engine.rig.snap?.(); });
    await page.waitForTimeout(1500); await shot('village-portal');
    if (dev === 'desktop') { // at dusk and at night: the swirl must not wash out under the bloom
      const setHour = h => ev(h => { const G = window.G, D = G.day; D.hour = h; D._lastHour = h; D.apply?.(); G.state.hour = h; }, h); // (as the debug menu's Time of day)
      for (const [name, h] of [['dusk', 18.6], ['night', 22]]) { await setHour(h); await page.waitForTimeout(2200); await shot(`village-portal-${name}`); }
      await setHour(11);
    }
    // back in: the floor as it was left
    await ev(() => window.G.townPortal.resume());
    await page.waitForFunction(id => window.G.mode === 'dungeon' && window.G.dungeon?.def?.id === id && !window.G.ui?.iris?.active, den, { timeout: 60000 });
    await page.waitForTimeout(1600); await shot('back');
  } catch (e) { console.error(`[${dev}]`, e.stack); }
  if (errors.length) console.log(`${dev} errors:\n  ` + [...new Set(errors)].slice(0, 8).join('\n  '));
  await browser.close();
}
