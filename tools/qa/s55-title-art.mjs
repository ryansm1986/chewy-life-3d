// Scenario 55: the title screen's animated painting (ui/titleArt.js, ROADMAP TA-1). The painting covers the screen
// (the logo's portraits step aside, the 3D world isn't drawn under it); the sea shimmers and the tree sways while the
// friends stay still; both blink; leaving the title stops it and the 3D draws again; "reduce motion" keeps it still;
// on a phone the menu clears the friends; if WebGL fails it's the still painting. Shots: node tools/qa/title-art-shots.mjs,
// the clip: node tools/qa/title-art-video.mjs.   node tools/qa/s55-title-art.mjs
import { launch, sleep, makeReport, BASE } from './lib.mjs';

const R = makeReport('S55 the title painting');
const errs = [], warns = [];
async function open(opts = {}, init = null) {
  const L = await launch(opts);
  if (init) await L.page.addInitScript(init);
  if (opts.reduce) await L.page.emulateMedia({ reducedMotion: 'reduce' });
  await L.page.goto(`${BASE}/?dseed=1${opts.qs ? '&' + opts.qs : ''}`, { waitUntil: 'load' });
  await L.page.waitForFunction(() => window.__ready === true && window.G?.titleActive && window.G.ui.titleScreen.art?.ready, null, { timeout: 60000 });
  await L.page.waitForTimeout(2600);
  await L.page.evaluate(() => { document.getElementById('fps')?.remove(); });
  return L;
}
// the 3D world's own draws (engine.render → its post chain), counted
const spy = page => page.evaluate(() => { const P = window.G.engine.post; if (P.__n == null) { P.__n = 0; const r = P.render.bind(P); P.render = (...a) => { P.__n++; return r(...a); }; } });
const frames = page => page.evaluate(() => window.G.engine.post.__n);
// how much a painting-pixel box changed between two screenshots (the title's petals, logo and menu hidden)
async function change(page, boxes, ms = 700) {
  await page.evaluate(() => { for (const s of ['.ti-center', '.ti-petals', '.ti-foot', '.ti-vig']) document.querySelector(s).style.visibility = 'hidden'; window.G.ui.titleScreen.art.holdShut = 0; window.G.ui.titleScreen.art.holdZoom = 1.02; });
  await sleep(page, 200);
  const rects = await page.evaluate(B => { const c = document.querySelector('.ti-art'), W = c.clientWidth, H = c.clientHeight, ir = 1536 / 1024, sr = W / H;
    let sx = 1, sy = 1; if (sr > ir) sy = ir / sr; else sx = sr / ir;
    const cx = Math.min(Math.max(0.42, sx / 2), 1 - sx / 2), cy = Math.min(Math.max(0.6, sy / 2), 1 - sy / 2);
    const to = (u, v) => [((u / 1536 - cx) / sx + 0.5) * W, ((v / 1024 - cy) / sy + 0.5) * H];
    return B.map(b => { const [x0, y0] = to(b[0], b[1]), [x1, y1] = to(b[2], b[3]); return { x: Math.round(x0), y: Math.round(y0), width: Math.round(x1 - x0), height: Math.round(y1 - y0) }; }); }, boxes);
  const a = await Promise.all(rects.map(r => page.screenshot({ clip: r })));
  await sleep(page, ms);
  const b = await Promise.all(rects.map(r => page.screenshot({ clip: r })));
  const d = await page.evaluate(async ([a, b]) => {
    const px = async s => { const im = new Image(); im.src = 'data:image/png;base64,' + s; await im.decode(); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0); return x.getImageData(0, 0, c.width, c.height).data; };
    const out = []; for (let i = 0; i < a.length; i++) { const p = await px(a[i]), q = await px(b[i]); let s = 0; for (let k = 0; k < p.length; k += 4) s += Math.abs(p[k] - q[k]) + Math.abs(p[k + 1] - q[k + 1]) + Math.abs(p[k + 2] - q[k + 2]); out.push(+(s / (p.length / 4) / 3).toFixed(2)); }
    return out; }, [a.map(x => x.toString('base64')), b.map(x => x.toString('base64'))]);
  await page.evaluate(() => { for (const s of ['.ti-center', '.ti-petals', '.ti-foot', '.ti-vig']) document.querySelector(s).style.visibility = ''; window.G.ui.titleScreen.art.holdShut = null; window.G.ui.titleScreen.art.holdZoom = null; });
  return d;
}
const SEA = [900, 430, 1150, 520], CREST = [80, 60, 420, 300], FRIENDS = [140, 560, 470, 820];

try {
  // ---- it covers the title, moves, blinks
  {
    const { browser, page, errors, warns: w } = await open();
    const a = await page.evaluate(() => { const T = document.querySelector('.title'), A = window.G.ui.titleScreen.art; return { canvas: !!T.querySelector('canvas.ti-art.ready'), covers: A.covers, portraits: getComputedStyle(T.querySelector('.ti-chewy')).display }; });
    await spy(page); const f0 = await frames(page); await sleep(page, 1000); const f1 = await frames(page);
    R.check('a) the title shows the painting (the logo\'s portraits step aside) and the 3D world isn\'t drawn under it', a.canvas && a.covers && a.portraits === 'none' && f1 === f0, JSON.stringify({ ...a, frames: [f0, f1] }));
    const d = await change(page, [SEA, CREST, FRIENDS]);
    R.check('b) the sea shimmers and the cherry crown sways; Chewy and Shadow stay still', d[0] > 1.2 && d[1] > 0.3 && d[2] < 0.25, JSON.stringify({ sea: d[0], crown: d[1], friends: d[2] }));
    const bl = await page.evaluate(() => new Promise(res => { const A = window.G.ui.titleScreen.art, seen = { chewy: 0, shadow: 0 }, t0 = performance.now(); A.holdShut = null;
      const tick = () => { seen.chewy = Math.max(seen.chewy, A.shut.chewy); seen.shadow = Math.max(seen.shadow, A.shut.shadow); if ((seen.chewy >= 0.99 && seen.shadow >= 0.99) || performance.now() - t0 > 14000) res(seen); else requestAnimationFrame(tick); }; tick(); }));
    R.check('c) both friends blink (eyes fully shut) within a few seconds', bl.chewy >= 0.99 && bl.shadow >= 0.99, JSON.stringify(bl));
    // leaving the title (Continue on this page's own save: no reload): the painting stops, the 3D draws again
    await page.evaluate(() => { const G = window.G; G.save(); G.ui.titleScreen.sync?.(); document.querySelector('.ti-btns [data-a="continue"]')?.click(); });
    await page.waitForFunction(() => !window.G.titleActive && window.G.mode === 'village', null, { timeout: 30000 }).catch(() => {});
    await sleep(page, 1500);
    const g0 = await frames(page); await sleep(page, 600); const g1 = await frames(page);
    const st = await page.evaluate(() => { const A = window.G.ui.titleScreen.art; return { title: window.G.titleActive, covers: A.covers, raf: !!A.raf, on: A.on }; });
    R.check('d) leaving the title (Continue): the painting stops and the 3D world draws again', !st.title && !st.covers && !st.on && !st.raf && g1 > g0, JSON.stringify({ st, frames: [g0, g1] }));
    errs.push(...errors); warns.push(...w); await browser.close();
  }
  // ---- reduce motion: still (the blinks stay)
  {
    const { browser, page, errors, warns: w } = await open({ reduce: true });
    const d = await change(page, [SEA, CREST]);
    const ok = await page.evaluate(() => window.G.ui.titleScreen.art.reduce);
    R.check('e) "reduce motion": the painting holds still (the sea and the tree)', ok && d[0] < 0.25 && d[1] < 0.25, JSON.stringify({ reduce: ok, sea: d[0], crown: d[1] }));
    errs.push(...errors); warns.push(...w); await browser.close();
  }
  // ---- a phone: the menu clears the friends
  {
    const { browser, page, errors, warns: w } = await open({ w: 844, h: 390, qs: 'mobile' });
    const o = await page.evaluate(() => { const c = document.querySelector('.ti-art'), W = c.clientWidth, H = c.clientHeight, ir = 1536 / 1024, sr = W / H; let sx = 1, sy = 1; if (sr > ir) sy = ir / sr; else sx = sr / ir;
      const cx = Math.min(Math.max(0.42, sx / 2), 1 - sx / 2), cy = Math.min(Math.max(0.6, sy / 2), 1 - sy / 2), to = (u, v) => [((u / 1536 - cx) / sx + 0.5) * W, ((v / 1024 - cy) / sy + 0.5) * H];
      const [fx0, fy0] = to(150, 560), [fx1, fy1] = to(470, 860);
      const hits = [...document.querySelectorAll('.ti-btns .btn')].filter(b => { const r = b.getBoundingClientRect(); return r.right > fx0 && r.left < fx1 && r.bottom > fy0 && r.top < fy1; }).map(b => b.dataset.a);
      return { phone: window.G.ui.root.classList.contains('m-phone'), hits, friends: [fx0, fy0, fx1, fy1].map(Math.round) }; });
    R.check('f) a phone: the logo and a 2 × 2 menu sit right of Chewy and Shadow (no button over them)', o.phone && !o.hits.length, JSON.stringify(o));
    errs.push(...errors); warns.push(...w); await browser.close();
  }
  // ---- WebGL fails: the still painting
  {
    const { browser, page, errors, warns: w } = await open({}, () => { const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (k, o) { return this.classList?.contains('ti-art') ? null : g.call(this, k, o); }; });
    const s = await page.evaluate(() => { const T = document.querySelector('.title'); return { canvas: !!T.querySelector('.ti-art'), bg: T.style.background || '', covers: window.G.ui.titleScreen.art.covers }; });
    R.check('g) no WebGL for it: the still painting as the title\'s background', !s.canvas && /painting\.jpg/.test(s.bg), JSON.stringify(s));
    errs.push(...errors); warns.push(...w); await browser.close();
  }
} catch (e) { errs.push('[harness] ' + e.stack); }
const failed = R.finish(errs, warns);
process.exit(failed ? 1 : 0);
