// The outskirts' places at the game camera (ROADMAP HP-1, world/outskirts/): each place at play distance and wider,
// by day (and at dusk with `dusk`), and a side-by-side with its Codex concept.
//   node tools/qa/outskirts-shots.mjs [tag=now] [ids=all, comma-separated] [dusk]
//   → tools/qa/tmp/outskirts/<tag>_<id>.png, <tag>_<id>-wide.png, (<tag>_<id>-dusk.png), <tag>_<id>-cmp.png
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { launch, BASE } from './lib.mjs';
const [tag = 'now', ids = 'all', dusk = ''] = process.argv.slice(2);
const OUT = 'tools/qa/tmp/outskirts'; fs.mkdirSync(OUT, { recursive: true });
const CONCEPT = { lighthouse: '01-lighthouse', tea: '02-tea', tidepools: '03-tidepools', wishtree: '04-wishtree', windmill: '05-windmill', moonpond: '06-moonpond', pier: '07-pier', seaarch: '08-seaarch', bees: '09-bees', cove: '10-cove' };
async function run(hour, suffixes) {
  const { browser, page, errors } = await launch({ w: 1600, h: 900 });
  await page.goto(`${BASE}/?fresh&nointro&hour=${hour}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true && window.G?.outskirts, null, { timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => { const ui = document.getElementById('ui'); if (ui) ui.style.display = 'none'; document.getElementById('fps')?.remove(); });
  const pois = await page.evaluate(() => import('/src/world/outskirtsPlan.js').then(m => m.POIS));
  for (const p of pois) {
    if (ids !== 'all' && !ids.split(',').includes(p.id)) continue;
    for (const [suf, d] of suffixes) {
      await page.evaluate(([x, z, d]) => { const G = window.G; G.player.setPos(x, z); G.companion?.setPos?.(x + 0.9, z + 0.5); const r = G.engine.rig; r.focus.set(x, G.world.heightAt(x, z), z); r.distTarget = d; r.yawTarget = Math.PI / 4; r.snap(); }, [p.x + 1.5, p.z + 1.5, d]);
      await page.waitForTimeout(1300);
      const f = path.join(OUT, `${tag}_${p.id}${suf}.png`); await page.screenshot({ path: f }); console.log('saved', f);
    }
  }
  if (errors.length) console.log('errors:', errors.slice(0, 6).join('\n'));
  await browser.close();
  return pois;
}
const pois = await run(10.5, [['', 14], ['-wide', 22]]);
if (dusk) await run(19.4, [['-dusk', 16]]);
// side by side with the concept
const py = `
import sys
from PIL import Image
a=Image.open(sys.argv[1]).convert('RGB'); b=Image.open(sys.argv[2]).convert('RGB'); h=540
a=a.resize((int(a.width*h/a.height),h)); b=b.resize((int(b.width*h/b.height),h))
c=Image.new('RGB',(a.width+b.width+10,h),'white'); c.paste(a,(0,0)); c.paste(b,(a.width+10,0)); c.save(sys.argv[3])`;
for (const p of pois) {
  if (ids !== 'all' && !ids.split(',').includes(p.id)) continue;
  const concept = `tools/blender/work/codex/hollow-pois/concepts/poi-${CONCEPT[p.id]}.png`, shot = path.join(OUT, `${tag}_${p.id}.png`);
  if (fs.existsSync(concept) && fs.existsSync(shot)) spawnSync('python', ['-c', py, concept, shot, path.join(OUT, `${tag}_${p.id}-cmp.png`)]);
}
