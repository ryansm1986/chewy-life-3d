// The Spirit Lantern look review (docs/ZONES.md §5.2; ROADMAP Z-E3): the lantern at a zone gate and at the Burrow door,
// and its panel on the desktop, with a controller (the focus ring, the glyphs), on a phone (a tier, the cards scrolled, a
// Spirit 10 run) and on a tablet. Waits key on game state. The touch shots print the left column's fit (unscrolled?).
//   node tools/qa/lantern-shots.mjs [--dev desktop|pad|phone|tablet|all] [--zone bamboo] [--tag now]
// → <SHOT_DIR>/lantern_<tag>_<dev>_<what>.png
import fs from 'node:fs';
import path from 'node:path';
import { launch, boot } from './lib.mjs';
import { launchTouch, PHONE, TABLET } from './touch-lib.mjs';
import { installPad, padTap } from './pad-lib.mjs';

const args = process.argv.slice(2), arg = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const devs = arg('dev', 'all') === 'all' ? ['desktop', 'pad', 'phone', 'tablet'] : arg('dev').split(','), zone = arg('zone', 'bamboo'), tag = arg('tag', 'now');
const OUT = process.env.SHOT_DIR || path.resolve('tools/qa/out/lantern');
fs.mkdirSync(OUT, { recursive: true });
const ZD = { bamboo: 'bambooDepths', maple: 'mapleRoots', tidepool: 'tideCaves', onsen: 'onsenCaverns' }[zone];

for (const dev of devs) {
  const L = dev === 'phone' ? await launchTouch(PHONE) : dev === 'tablet' ? await launchTouch(TABLET) : await launch({ w: 1600, h: 900 });
  const { browser, page, errors } = L;
  const shot = async (what) => { const f = path.join(OUT, `lantern_${tag}_${dev}_${what}.png`); await page.screenshot({ path: f }); console.log(`${dev} ${what} → ${f}`); };
  try {
    await boot(page, `fresh&nointro&notut&hour=18&villagesaved=${zone}`);
    if (dev === 'pad') { await installPad(page); await padTap(page, 'DDown'); } // (a press makes the pad the device: the glyphs, the focus ring)
    await page.evaluate(({ ZD }) => { const G = window.G; G.state.flags.burrowTut = true; G.state.player.lvl = 22; G.actions.recompute(); G.tierDebug.unlock(ZD, 3); G.state.dungeon.deepest = 22; G.burrowLantern?.refresh(); }, { ZD });
    if (dev === 'desktop') { // the Burrow door's lantern in Blossom Hollow, lit
      await page.evaluate(() => { const G = window.G, h = G.burrowLantern, P = G.player; P.setPos(h.pos.x - 1.5, h.pos.z + 3.2); G.engine.rig.focus.copy(P.pos); G.engine.rig.snap(); });
      await page.waitForTimeout(1500); await shot('burrow-door');
    }
    await page.evaluate(z => { const G = window.G; G._zoneArrive = { zone: z, gate: true }; G.enterRegion(z); }, zone);
    await page.waitForFunction(() => window.G?.dungeon?.gate?.lantern && !window.G.ui?.iris?.active, null, { timeout: 60000 });
    await page.waitForTimeout(2500);
    await page.evaluate(() => { const G = window.G, l = G.dungeon.gate.lantern, P = G.player; P.setPos(l.pos.x + 1.6, l.pos.z + 1.6); P.invuln = true; G.engine.rig.focus.copy(P.pos); G.engine.rig.snap(); });
    await page.waitForTimeout(1200);
    if (dev === 'desktop') await shot('gate');
    await page.evaluate(ZD => { window.G.lantern.open(ZD); }, ZD);
    await page.waitForFunction(() => window.G.ui.isOpen('lantern'), null, { timeout: 5000 });
    await page.waitForTimeout(700);
    if (dev === 'desktop') {
      await page.click('.ln-card[data-m="swarming"]'); await page.click('.ln-card[data-m="haunted"]');
      await page.hover('.ln-card[data-m="nightMarch"]'); await page.waitForTimeout(400);
      await shot('panel');
      await page.click('.ln-tier[data-t="1"]'); await page.waitForTimeout(300); await shot('panel-t1');
    } else if (dev === 'pad') {
      await padTap(page, 'Y'); await page.waitForTimeout(300); // (recommended)
      for (const b of ['DRight', 'DUp', 'DUp']) { await padTap(page, b); await page.waitForTimeout(160); }
      await page.waitForTimeout(400); await shot('panel');
    } else {
      const fit = () => page.evaluate(() => { const s = document.querySelector('.p-lantern .ln-side'), g = document.querySelector('.ln-go').getBoundingClientRect(), c = document.querySelector('.ln-cards');
        return `side ${s.scrollHeight}/${s.clientHeight}${s.scrollHeight > s.clientHeight + 1 ? ' SCROLLS' : ' fits'}, go bottom ${g.bottom.toFixed(0)}/${innerHeight}, cards ${c.scrollHeight}/${c.clientHeight}`; });
      await page.evaluate(() => { const P = window.G.ui.panels.lantern; P.sel.mods = ['swarming', 'treasureTrove']; P.render(); });
      await page.waitForTimeout(500); await shot('panel'); console.log(dev, 'tier 3:', await fit());
      await page.evaluate(() => { const c = document.querySelector('.p-lantern .ln-cards'); c.scrollTop = c.scrollHeight; });
      await page.waitForTimeout(400); await shot('panel-cards');
      await page.evaluate(ZD => { const G = window.G; G.ui.close('lantern'); G.tierDebug.clearAll(5); G.state.zones.bamboo.dungeon.spirit.best = 9; G.lantern.open(ZD); }, ZD);
      await page.waitForFunction(() => window.G.ui.isOpen('lantern') && document.querySelector('.ln-tier.spirit'), null, { timeout: 5000 });
      await page.click('.ln-tier.spirit'); await page.evaluate(() => { const P = window.G.ui.panels.lantern; P.stepSpirit(9); P.surprise(); });
      await page.waitForTimeout(700); await shot('panel-spirit'); console.log(dev, 'spirit 10:', await fit());
    }
  } catch (e) { console.log(dev, 'FAILED', e.message); }
  if (errors.length) console.log(dev, 'errors:', [...new Set(errors)].slice(0, 6).join('\n'));
  await browser.close();
}
