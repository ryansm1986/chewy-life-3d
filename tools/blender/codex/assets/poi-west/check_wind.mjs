// poi-west: in the game, do my leaf and cloth parts wear the kit's wind materials, does each cloth hang from its top (uv.y highest at the top),
// and does the crown really sway between two frames? node tools/blender/work/codex/poi-west/check_wind.mjs
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { launch, BASE } from '../../../../qa/lib.mjs';
const OUT = 'tools/blender/work/codex/poi-west/ingame'; fs.mkdirSync(OUT, { recursive: true });
const { browser, page, errors } = await launch({ w: 1600, h: 900 });
await page.goto(`${BASE}/?fresh&nointro&hour=10.5`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready === true && window.G?.outskirts && window.G?.engine?.rig, null, { timeout: 90000 });
const r = await page.evaluate(async () => {
  const { MATS } = await import('/src/world/buildings/kit.js'); const M = MATS(), out = [];
  for (const id of ['lighthouse', 'tea', 'tidepools', 'wishtree']) {
    window.G.outskirts.group.children.filter(g => g.name === `west:${id}`).forEach((g, k) => g.traverse(o => {
      if (!o.isMesh || o.userData.isInk) return;
      const named = /cards_round/i.test(o.name) ? 'cards_round' : /leaf/i.test(o.name) ? 'leaf' : /cloth/i.test(o.name) ? 'cloth' : null, ink = o.children.some(c => c.userData.isInk);
      const mat = named ? named + (o.material.side === 2 ? ':double' : '') + (ink ? ':ink' : ':noink') : o.material === M.leaf ? 'leaf' : o.material === M.cloth ? 'cloth' : o.material === M.glow ? 'glow' : o.material === M.water ? 'water' : o.material?.name || '?';
      const e = { id, k, mat, tris: (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3 };
      if (mat.startsWith('cloth')) { // (uv.y against height: +1 means uv.y is highest at the top, so it hangs from its top)
        const P = o.geometry.attributes.position, U = o.geometry.attributes.uv; let sy = 0, su = 0, syy = 0, suu = 0, syu = 0; const n = P.count;
        for (let i = 0; i < n; i++) { const y = P.getY(i), u = U.getY(i); sy += y; su += u; syy += y * y; suu += u * u; syu += y * u; }
        e.corrYU = +((n * syu - sy * su) / Math.sqrt(Math.max(1e-9, (n * syy - sy * sy) * (n * suu - su * su)))).toFixed(2); let lo = 9, hi = -9; for (let i = 0; i < n; i++) { lo = Math.min(lo, U.getY(i)); hi = Math.max(hi, U.getY(i)); } e.uv = [+lo.toFixed(2), +hi.toFixed(2)];
      }
      out.push(e);
    }));
  }
  const p = window.G.outskirts.places.find(q => q.poi.id === 'wishtree').poi, G = window.G; const fx = p.x + 0.3, fz = p.z - 13.8; G.player.setPos(fx, fz); G.companion?.setPos?.(fx + 1, fz);
  const c = G.engine.rig; c.focus.set(fx, G.world.heightAt(fx, fz), fz); c.distTarget = 32; c.yawTarget = Math.PI / 4; c.snap();
  document.getElementById('ui')?.style.setProperty('display', 'none'); return out;
});
console.log(r.map(e => JSON.stringify(e)).join('\n'));
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/sway_a.png` });
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}/sway_b.png` });
if (errors.length) console.log('errors:', errors.slice(0, 5).join('\n'));
await browser.close();
const py = `
from PIL import Image, ImageChops
a=Image.open(r'${OUT}/sway_a.png').convert('RGB'); b=Image.open(r'${OUT}/sway_b.png').convert('RGB')
d=ImageChops.difference(a,b).convert('L').point(lambda v:255 if v>24 else 0); d.save(r'${OUT}/sway_diff.png')
w,h=a.size; print('changed px, top half', sum(1 for v in d.crop((0,0,w,h//2)).getdata() if v), 'of', w*h//2)`;
console.log(spawnSync('python', ['-c', py], { encoding: 'utf8' }).stdout);
