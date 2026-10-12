// The Burrow dens' look review (docs/ZONES.md §4.1; ROADMAP Z-H1): the Burrow door in Blossom Hollow, its den picker
// (a new save, a save part-way down, everything cleared) and every den's two floors at the game camera (the arrival on
// floor 1, the boss's chamber on floor 2 with the boss in it), on the desktop (1920×1080), the Steam Deck (1280×800, the
// desktop app's Deck profile) and a phone (an iPhone's Safari, touch, 844×390). Waits key on game state.
//   node tools/qa/dens-shots.mjs [--dev desktop,deck,phone] [--what door,picker,dens] [--dens mossyBurrow,…] [--tag now]
// → <SHOT_DIR>/dens_<tag>_<dev>_<what>.png (SHOT_DIR default tools/qa/tmp/dens)
import fs from 'node:fs';
import path from 'node:path';
import { launch, boot, waitMode } from './lib.mjs';
import { launchTouch, PHONE } from './touch-lib.mjs';

const args = process.argv.slice(2), arg = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const devs = arg('dev', 'desktop,deck,phone').split(','), what = new Set(arg('what', 'door,picker,dens').split(',')), tag = arg('tag', 'now');
const DENS = arg('dens', 'mossyBurrow,foxShrine,oniKitchen,moonSanctum').split(',');
const OUT = process.env.SHOT_DIR || path.resolve('tools/qa/tmp/dens');
fs.mkdirSync(OUT, { recursive: true });
const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const DECK_APP = () => { window.pawhaven = { desktop: true, deck: true, platform: 'linux', version: '0.6.6', isFullscreen: () => true, setFullscreen() {}, onFullscreen() {}, quit() {},
  update: { info: async () => ({ shell: '0.6.6', game: '0.6.6', source: 'built-in' }), check: async () => ({ status: 'none' }), install: async () => ({ ok: false }), cancel: async () => {}, later: async () => {}, openPage: async () => {}, onProgress: () => () => {} } }; };

for (const dev of devs) {
  const L = dev === 'phone' ? await launchTouch({ ...PHONE, ua: IOS }) : await launch(dev === 'deck' ? { w: 1280, h: 800 } : { w: 1920, h: 1080 });
  const { browser, page, errors } = L;
  if (dev === 'deck') await page.addInitScript(DECK_APP);
  const ev = (f, a) => page.evaluate(f, a);
  const shot = async name => { const f = path.join(OUT, `dens_${tag}_${dev}_${name}.png`); await page.screenshot({ path: f }); console.log(`${dev} ${name} → ${f}`); };
  const settle = () => page.waitForFunction(() => !window.G.ui?.iris?.active, null, { timeout: 30000 });
  try {
    await boot(page, 'fresh&nointro&notut&hour=17');
    await ev(() => { const G = window.G; G.state.flags.burrowTut = true; G.state.flags.mokaJoined = true; G.state.player.lvl = 12; G.actions.recompute(); G.actions.restoreAll(); });
    if (what.has('door')) { // the Burrow door at the game camera, the Spirit Lantern beside it
      await ev(() => { const G = window.G, d = G.sim.list.find(r => r.data.type === 'dungeonGate'), P = G.player; P.setPos(d.door.x - 1.2, d.door.z + 4.5); G.engine.rig.focus.copy(P.pos); G.engine.rig.snap(); });
      await page.waitForTimeout(1600); await shot('door');
    }
    if (what.has('picker')) {
      const open = async (name, setup) => {
        await ev(setup); await ev(() => { window.G.ui.close('burrow', true); window.G.openBurrowMenu(); });
        await page.waitForFunction(() => window.G.ui.isOpen('burrow'), null, { timeout: 5000 }); await page.waitForTimeout(900); await shot(name);
      };
      await open('picker-new', () => { const G = window.G; G.state.dungeon.dens = {}; G.state.quests.active = [{ id: 'burrow1', step: 0, prog: 2 }]; });
      await open('picker-mid', () => { const G = window.G, D = G.state.dungeon; D.dens = { mossyBurrow: { cleared: 2 }, foxShrine: { crew: 1 }, oniKitchen: { bestFloor: 1 } }; G.state.quests.active = [{ id: 'oni', step: 0, prog: 0 }]; });
      if (dev !== 'phone') { await page.click('.dn-pin[data-id="moonSanctum"]'); await page.waitForTimeout(400); await shot('picker-mid-locked'); }
      else { await page.tap('.dn-pin[data-id="moonSanctum"]'); await page.waitForTimeout(400); await shot('picker-mid-locked'); }
      if (dev === 'desktop') await open('picker-all', () => { const G = window.G, D = G.state.dungeon; D.dens = { mossyBurrow: { cleared: 3 }, foxShrine: { cleared: 1 }, oniKitchen: { cleared: 1 }, moonSanctum: { cleared: 1 } }; G.state.quests.active = []; window.G.burrowLantern?.refresh?.(); });
      await ev(() => window.G.ui.close('burrow', true));
    }
    if (what.has('dens')) for (const id of DENS) {
      const band = { mossyBurrow: 5, foxShrine: 10, oniKitchen: 15, moonSanctum: 20 }[id];
      await ev(([id, band]) => { const G = window.G; G.state.player.lvl = band; G.actions.recompute(); G.actions.restoreAll(); G.enterDungeon({ id, floor: 1 }); }, [id, band]);
      await page.waitForFunction(id => window.G.mode === 'dungeon' && window.G.dungeon?.def?.id === id && window.G.dungeon.floor === 1 && !window.G.ui?.iris?.active, id, { timeout: 60000 });
      await ev(() => { const G = window.G; G.player.invuln = true; for (const m of G.dungeon.monsters) m.aggro = false; });
      await page.waitForTimeout(2600); await shot(`${id}-f1`);
      // a room further in, at the game camera (the biggest normal room)
      await ev(() => { const G = window.G, D = G.dungeon, L = D.layout, r = L.rooms.filter(r => r.kind === 'normal' || r.kind === 'treasure').sort((a, b) => b.w * b.h - a.w * a.h)[0]; if (!r) return; const c = D.world.cellToWorld(r.cx, r.cy); G.player.setPos(c.x, c.z + 2); G.engine.rig.focus.copy(G.player.pos); G.engine.rig.snap(); });
      await page.waitForTimeout(1500); await shot(`${id}-f1-room`);
      await ev(id => window.G.enterDungeon({ id, floor: 2 }), id);
      await page.waitForFunction(id => window.G.mode === 'dungeon' && window.G.dungeon?.def?.id === id && window.G.dungeon.floor === 2 && !window.G.ui?.iris?.active, id, { timeout: 60000 });
      await ev(() => { const G = window.G; G.player.invuln = true; });
      await page.waitForTimeout(1800); await shot(`${id}-f2`);
      // the boss's chamber: the hero at its edge, then the reveal and the fight's framing
      await ev(() => { const G = window.G, D = G.dungeon, b = D.boss; for (const [dx, dz] of [[0, 9.5], [3, 9], [-3, 9], [6, 7], [-6, 7], [9, 0], [-9, 0], [0, -9]]) if (G.world.walkable(b.pos.x + dx, b.pos.z + dz)) { G.player.setPos(b.pos.x + dx, b.pos.z + dz); break; } G.engine.rig.focus.copy(G.player.pos); G.engine.rig.snap(); }); // (on the camera side of the boss, just outside its notice)
      await page.waitForTimeout(1200); await shot(`${id}-f2-chamber`);
      await ev(() => { const G = window.G, b = G.dungeon.boss, P = G.player; const dx = P.pos.x - b.pos.x, dz = P.pos.z - b.pos.z, k = Math.hypot(dx, dz) || 1; if (G.world.walkable(b.pos.x + dx / k * 6.5, b.pos.z + dz / k * 6.5)) P.setPos(b.pos.x + dx / k * 6.5, b.pos.z + dz / k * 6.5); }); // (step in: the reveal)
      await page.waitForFunction(() => { const b = window.G.dungeon?.boss; return !b || b.introDone; }, null, { timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(1500); await shot(`${id}-f2-boss`);
      await ev(() => window.G.returnToVillage()); await waitMode(page, 'village', 40000);
    }
  } catch (e) { console.log(dev, 'FAILED', e.message); }
  if (errors.length) console.log(dev, 'errors:', [...new Set(errors)].slice(0, 6).join('\n'));
  await browser.close();
}
