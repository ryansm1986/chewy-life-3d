// The tooltip check (ROADMAP R-13): hover real elements with the mouse, then read the tooltip's computed background and
// what the screen shows inside its box (the mean luma of a screenshot's pixels there: the dark box reads about 40-80; a
// box without its background would show the cream village through it, 150+). Used by tools/qa/prod-smoke.mjs.
//   const r = await tooltipCheck(page, { shot: 'tools/qa/tmp/prod-smoke/tooltip' }) → { kinds: { hud, hotbar, skill, item }, ok }
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

/** a PNG (8-bit RGB or RGBA, not interlaced: what Chrome's screenshots are) → { w, h, px(x, y) → [r, g, b] } */
export function decodePNG(buf) {
  let p = 8, w = 0, h = 0, ct = 0; const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8), data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ct = data[9]; if (data[8] !== 8 || data[12]) throw new Error('PNG: only 8-bit, non-interlaced'); }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  const bpp = ct === 6 ? 4 : ct === 2 ? 3 : 0; if (!bpp) throw new Error('PNG: colour type ' + ct);
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * bpp, out = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), row = out.subarray(y * stride, (y + 1) * stride), up = y ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? row[i - bpp] : 0, b = up ? up[i] : 0, c = up && i >= bpp ? up[i - bpp] : 0;
      let v = src[i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      row[i] = v & 255;
    }
  }
  return { w, h, px: (x, y) => { const o = y * stride + x * bpp; return [out[o], out[o + 1], out[o + 2]]; } };
}
/** the mean luma inside a rect of a decoded PNG (inset by `pad`, every `step` px) */
export function meanLuma(img, [x, y, w, h], pad = 8, step = 3) {
  let s = 0, n = 0;
  for (let j = Math.max(0, Math.round(y + pad)); j < Math.min(img.h, y + h - pad); j += step) for (let i = Math.max(0, Math.round(x + pad)); i < Math.min(img.w, x + w - pad); i += step) { const [r, g, b] = img.px(i, j); s += 0.299 * r + 0.587 * g + 0.114 * b; n++; }
  return n ? s / n : -1;
}

const state = page => page.evaluate(() => {
  const w = document.querySelector('.tt-wrap'), b = document.querySelector('.tt'); if (!w || !b) return null;
  const cw = getComputedStyle(w), cb = getComputedStyle(b), r = b.getBoundingClientRect(), dpr = devicePixelRatio;
  return { show: w.classList.contains('show'), op: cw.opacity, bg: cb.backgroundImage, bgc: cb.backgroundColor, rect: [r.x, r.y, r.width, r.height].map(v => v * dpr), text: b.textContent.trim().slice(0, 30) };
});
async function hoverTip(page, sel) {
  const p = await page.evaluate(s => { const e = [...document.querySelectorAll(s)].find(e => e.offsetParent !== null); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, sel);
  if (!p) return { missing: sel };
  await page.mouse.move(4, 4); await page.waitForTimeout(150);
  await page.mouse.move(p.x, p.y, { steps: 6 });
  await page.waitForFunction(() => document.querySelector('.tt-wrap')?.classList.contains('show') && getComputedStyle(document.querySelector('.tt-wrap')).opacity === '1', null, { timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(300); // (its pop-in played out)
  return state(page);
}
/** hover the HUD's bag button, a hotbar slot, a skill node (K) and the bag's weapon; each tooltip must be on screen with its
 *  gradient background, and the screen inside its box must be dark */
export async function tooltipCheck(page, { shot = null } = {}) {
  const kinds = {};
  const one = async (name, sel, open) => {
    if (open) { await page.evaluate(open); await page.waitForTimeout(800); }
    const s = await hoverTip(page, sel);
    if (s && s.rect) {
      const buf = await page.screenshot();
      if (shot) { fs.mkdirSync(path.dirname(shot), { recursive: true }); fs.writeFileSync(`${shot}-${name}.png`, buf); }
      s.luma = Math.round(meanLuma(decodePNG(buf), s.rect, 10 * (s.rect[2] > 400 ? 2 : 1)));
    }
    s && (s.ok = !!(s.show && s.op === '1' && /gradient/.test(s.bg) && s.rect[2] > 60 && s.rect[3] > 30 && s.luma >= 0 && s.luma < 120));
    kinds[name] = s;
    await page.evaluate(() => window.G.ui.closeAll?.()); await page.mouse.move(4, 4); await page.waitForTimeout(300);
  };
  await one('hud', '.hud .mb');
  await one('hotbar', '.hud .hb .slot, .hud .hb > *');
  await one('skill', '.p-skills .nodes .node', () => window.G.ui.open('skills'));
  await one('item', '.p-inv .slot.eq:has(img), .p-inv .slot:has(img)', () => window.G.ui.open('inventory', { view: 'bag' }));
  return { kinds, ok: Object.values(kinds).every(k => k?.ok) };
}
