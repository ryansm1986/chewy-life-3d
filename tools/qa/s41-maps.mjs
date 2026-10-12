// s41: the maps (ROADMAP UX-1, docs/MAP.md). Checkpoint 1: Blossom Hollow (a–i); checkpoint 2: the other areas (j–m).
//   a) markers: the big map draws a pip for every named villager out of doors, badges for the village's places; the HUD
//      disc caps its marks (≤ 9 named, ≤ 6 others, ≤ 8 places)
//   b) the directory: People groups (something for you first), every named villager listed with where they are; Places
//      lists your cottage, Rosie's Treats, the Burrow, the Wayfarer's Post; typing filters both
//   c) a pick pins: G.questTarget answers with the pin, the quest arrow names them, the disc's rim shows the pin with its
//      distance when it's off it; you getting there clears it with a toast
//   d) "Shadow, take me there": the map closes and he leads (the pin's key), the route re-planned as Rosie walks
//   e) the mouse: a drag pans, the wheel zooms about the cursor, a click on a mark pins it; the minimap's click opens the
//      map on the mark
//   f) the pad (the Deck): View opens it, LS pans under the crosshair, RT zooms, the D-pad and A pin a row, Y leads, B closes
//   g) touch (a phone): a drag pans, a pinch zooms, a tap on a mark pins it
//   h) Settings: Minimap North up (the map's turn 0, the N badge at the top), the lens chip's three spans
//   i) perf: the HUD disc's draw (the per-frame share at its 15 draws a second)
//   Checkpoint 2:
//   j) a zone: the region painted, its village's people in People (under the village's name) and on the map, its places
//      (the Wayfarer's Stone, the dungeon, the village, the Sightings board, the wild areas); a villager's pin, and Shadow
//      leading to it; leaving the zone lets the pin go
//   k) a dungeon floor: painted under a fog that lifts where you've been; the stairs a place only once seen; the fog
//      leaks nothing (every seen floor cell joins where you've been through seen floor, every floor cell deep in the
//      unseen lies under whole fog)
//   n) a floor's names dodge the marks (none under you, Shadow, the pin, the star; the portal's named), an opened chest
//      stays on the map dimmed, the chips with nothing on this map greyed (Shops, Wild) and the others not
//   l) a room: its floor plan, its places (the bed, the stash, the kitchen, the door) as badges, redrawn when a piece moves
//   m) the filter chips: Shops and People off hide them on both maps, kept in Settings, back on again; Wild greyed here
//   Shots → tools/qa/tmp/s41-maps/   usage: node tools/qa/s41-maps.mjs   (ONLY=abc: just those parts)
import fs from 'node:fs';
import { launch, boot, sleep, makeReport } from './lib.mjs';
import { launchTouch, PHONE } from './touch-lib.mjs';
import { installPad, padDown, padUp, padTap, padStick } from './pad-lib.mjs';

const OUT = new URL('./tmp/s41-maps/', import.meta.url); fs.mkdirSync(OUT, { recursive: true });
const shotPath = n => new URL(n + '.png', OUT).pathname.replace(/^\/([A-Z]:)/, '$1');
const R = makeReport('s41-maps');
const errs = [], warns = [];
const want = k => !process.env.ONLY || process.env.ONLY.includes(k);
const ev = (page, fn, arg) => page.evaluate(fn, arg);
const until = (page, fn, arg, timeout = 8000) => page.waitForFunction(fn, arg, { timeout, polling: 100 }).then(() => true, () => false);
const NAMED = ['rosie', 'mochi', 'usagi', 'kuma', 'kitsune', 'pan', 'tanu', 'kero'];

// ---------------------------------------------------------------- a–e, h, i: the desktop
if (['a', 'b', 'c', 'd', 'e', 'h', 'i'].some(want)) {
  const { browser, page, errors, warns: w } = await launch({ w: 1600, h: 900 });
  await boot(page, 'fresh&nointro&notut&hour=10');
  await until(page, () => window.G.villageMinimap?.stats?.draws > 3);
  const openMap = () => ev(page, async () => { const G = window.G; G.ui.open('map'); await new Promise(r => setTimeout(r, 350)); G.ui.panels.map.draw(); });

  if (want('a')) {
    await openMap();
    const a = await ev(page, () => {
      const G = window.G, P = G.villageMinimap, hits = P.bigHits.map(h => h.e?.key).filter(Boolean);
      const out = G.npcs.filter(n => ['rosie', 'mochi', 'usagi', 'kuma', 'kitsune', 'pan', 'tanu', 'kero'].includes(n.id) && n.visible !== false).map(n => 'p:' + n.id);
      const places = P.bigHits.filter(h => h.e?.kind === 'place').length;
      // the disc: a crowd of townsfolk round you, then its caps
      const p = G.player.pos, g = document.createElement('canvas').getContext('2d');
      P.drawMap(g, 180, { cx: p.x, cz: p.z, span: 64 }, { mini: true });
      const mini = P.hits.filter(h => h.e?.kind === 'person' && !h.e.shadow), named = mini.filter(h => h.e.named || h.e.badge).length, rest = mini.length - named, mplaces = P.hits.filter(h => h.e?.kind === 'place').length;
      G.ui.panels.map.draw();
      return { missing: out.filter(k => !hits.includes(k)), out: out.length, places, named, rest, mplaces };
    });
    R.check(`a) markers: the big map has a pip for each named villager out of doors (${a.out}) and the places' badges (${a.places}); the disc keeps to its caps (${a.named} named ≤ 9, ${a.rest} others ≤ 6, ${a.mplaces} places ≤ 8)`, !a.missing.length && a.out >= 5 && a.places >= 12 && a.named <= 9 && a.rest <= 6 && a.mplaces <= 8, a);
    await page.screenshot({ path: shotPath('a-map') });
  }
  if (want('b')) {
    const b = await ev(page, async () => {
      const G = window.G, M = G.ui.panels.map, D = M.dir;
      D.tab = 'people'; D.q = ''; D.render(true);
      const rows = [...D.$.list.querySelectorAll('.mp-row')].map(r => ({ key: r.dataset.key, t: r.textContent }));
      const heads = [...D.$.list.querySelectorAll('.mp-gh')].map(h => h.className.replace('mp-gh ', ''));
      D.tab = 'places'; D.render(true);
      const places = [...D.$.list.querySelectorAll('.mp-row')].map(r => r.textContent);
      D.$.q.value = 'ros'; D.$.q.dispatchEvent(new Event('input'));
      D.tab = 'people'; D.render(true); const qp = [...D.$.list.querySelectorAll('.mp-row b')].map(b => b.firstChild.textContent);
      D.tab = 'places'; D.render(true); const ql = [...D.$.list.querySelectorAll('.mp-row b')].map(b => b.textContent);
      D.$.q.value = ''; D.$.q.dispatchEvent(new Event('input')); D.tab = 'people'; D.render(true);
      return { named: ['rosie', 'mochi', 'usagi', 'kuma', 'kitsune', 'pan', 'tanu', 'kero'].filter(id => rows.some(r => r.key === 'p:' + id)).length, first: heads[0], heads, where: rows.find(r => r.key === 'p:rosie')?.t || '',
        places: ['Your cottage', "Rosie's Treats", 'The Burrow', "Wayfarer's Post", 'Expedition Board'].filter(n => places.some(t => t.includes(n))), qp, ql };
    });
    R.check(`b) the People list: all eight named villagers with where they are ("${b.where.trim().slice(0, 60)}"), something for you first (${b.heads.join(', ')}); Places: ${b.places.join(', ')}; typing "ros" finds ${b.qp.join(', ')} · ${b.ql.join(', ')}`, b.named === 8 && b.first === 'g-quest' && /by |on |in /.test(b.where) && b.places.length === 5 && b.qp.includes('Rosie') && b.qp.length <= 2 && b.ql.some(t => t === "Rosie's Treats"), b);
  }
  if (want('c')) {
    const c = await ev(page, async () => {
      const G = window.G, M = G.ui.panels.map; M.select('p:rosie', { pin: true, centre: true });
      const t = G.questTarget();
      G.ui.closeAll(); G.player.setPos(100, 152); G.companion.setPos(101, 152);
      await new Promise(r => setTimeout(r, 700));
      return { pin: G.mapPin.cur?.key, tpin: t?.pin, base: !!G.questTarget.base?.(), qa: document.querySelector('.qa .qa-n')?.textContent, pinned: document.querySelector('.qa')?.classList.contains('pinned'), edges: G.villageMinimap.edges };
    });
    await page.screenshot({ path: shotPath('c-pinned') });
    const e0 = c.edges.find(e => e.kind === 'pin');
    R.check(`c) a pick pins Rosie: G.questTarget answers with her (the objective still under it), the quest arrow says "${c.qa}" on a pink badge, the disc's rim shows the pin at ${e0?.m} m`, c.pin === 'p:rosie' && c.tpin === 'p:rosie' && c.base && c.qa === 'Rosie' && c.pinned && e0 && e0.m > 20, c);
    const c2 = await ev(page, async () => {
      const G = window.G, n = G.npcs.find(x => x.id === 'rosie'); G.player.setPos(n.pos.x + 1.1, n.pos.z + 1.1);
      await new Promise(r => setTimeout(r, 800));
      return { pin: G.mapPin.cur?.key || null, toast: (window.QA?.toasts || []).some(t => /You found Rosie/.test(t)) };
    });
    R.check('c) walking up to her clears the pin with a "You found Rosie!" toast', !c2.pin && c2.toast, c2);
  }
  if (want('d')) {
    const d = await ev(page, async () => {
      const G = window.G, M = G.ui.panels.map;
      G.player.setPos(100, 152); G.companion.setPos(101, 152); await new Promise(r => setTimeout(r, 300));
      G.ui.open('map'); await new Promise(r => setTimeout(r, 300));
      M.select('p:rosie', { pin: true, centre: true }); M.takeMeThere();
      const open = G.ui.isOpen('map');
      await new Promise(r => setTimeout(r, 2500));
      const L = G.lead, ahead = L.sS - L.sH, len = L.route?.L || 0, plans0 = L.stats.plans;
      // Rosie walks off 8 m: his route follows her
      const n = G.npcs.find(x => x.id === 'rosie'); n.setPos(n.pos.x + 6, n.pos.z + 5);
      await new Promise(r => setTimeout(r, 3500));
      return { open, state: G.lead.state, key: G.lead.intent?.key, ahead: +ahead.toFixed(2), len: +len.toFixed(1), replans: G.lead.stats.plans - plans0 };
    });
    R.check(`d) "Shadow, take me there": the map closes, he leads to the pin (${d.state}, ${d.key}: ${d.ahead} m ahead of you on a ${d.len} m route), and plans again as Rosie walks off (${d.replans})`, !d.open && ['go', 'wait', 'arrived'].includes(d.state) && d.key === 'm:p:rosie' && d.ahead > 1.5 && d.len > 15 && d.replans >= 1, d);
    await ev(page, () => { window.G.mapPin.clear('qa'); });
  }
  if (want('e')) {
    await openMap();
    const r = await ev(page, () => { const c = document.querySelector('.p-map .mp-cv').getBoundingClientRect(); return { x: c.left + c.width / 2, y: c.top + c.height / 2, w: c.width }; });
    const v0 = await ev(page, () => ({ ...window.G.ui.panels.map.view }));
    await page.mouse.move(r.x, r.y); await page.mouse.down(); await page.mouse.move(r.x + 80, r.y + 40, { steps: 6 }); await page.mouse.up(); await sleep(page, 150);
    const v1 = await ev(page, () => ({ ...window.G.ui.panels.map.view }));
    const z0 = await ev(page, () => window.G.ui.panels.map.zoom);
    await page.mouse.move(r.x - 60, r.y - 30); await page.mouse.wheel(0, -300); await sleep(page, 200); await page.mouse.wheel(0, -300); await sleep(page, 200);
    const z1 = await ev(page, () => window.G.ui.panels.map.zoom);
    // a click on a person's pip pins them
    const tgt = await ev(page, () => { const M = window.G.ui.panels.map; M.draw(); const h = window.G.villageMinimap.bigHits.find(h => h.e?.kind === 'person' && !h.e.shadow && h.e.named); const c = M.cv.getBoundingClientRect(), s = c.width / M.size(); return h ? { x: c.left + h.x * s, y: c.top + h.y * s, key: h.e.key } : null; });
    await ev(page, () => { const cv = document.querySelector('.p-map .mp-cv'), M = window.G.ui.panels.map; window.__pe = []; for (const t of ['pointerdown', 'pointerup']) cv.addEventListener(t, e => { const [x, y] = M.local(e); window.__pe.push([t, +x.toFixed(0), +y.toFixed(0), M.hitAt(x, y)?.e?.key || null, M.ptrs.size, M.moved]); }, true); window.G.events.on('map:unpin', p => window.__pe.push(['unpin', p.key, p.why])); window.G.events.on('map:pin', p => window.__pe.push(['pin', p.key])); });
    if (tgt) { await page.mouse.move(tgt.x, tgt.y); await sleep(page, 120); await page.mouse.down(); await page.mouse.up(); await sleep(page, 250); }
    const pin = await ev(page, () => window.G.mapPin.cur?.key || null), pe = await ev(page, () => window.__pe);
    const tip = await ev(page, () => document.querySelector('.tt-wrap.show .tt-simple .tt-h')?.textContent || '');
    await page.screenshot({ path: shotPath('e-mouse') });
    // the minimap's click opens the map on the mark
    await ev(page, () => { window.G.ui.closeAll(); window.G.mapPin.clear('qa'); });
    await sleep(page, 400);
    const mm = await ev(page, () => { const P = window.G.villageMinimap, c = document.querySelector('.mm-cv').getBoundingClientRect(), h = P.hits.find(h => h.e?.kind === 'place') || P.hits.find(h => h.e?.key); return h ? { x: c.left + h.x * c.width / 180, y: c.top + h.y * c.height / 180, key: h.e.key } : null; });
    if (mm) { await page.mouse.click(mm.x, mm.y); await sleep(page, 500); }
    const mo = await ev(page, () => ({ open: window.G.ui.isOpen('map'), sel: window.G.ui.panels.map.sel }));
    R.check(`e) the mouse: a drag pans (${(v1.cx - v0.cx).toFixed(1)}, ${(v1.cz - v0.cz).toFixed(1)} m), the wheel zooms (${z0.toFixed(2)} → ${z1.toFixed(2)}), the hover names a mark ("${tip}"), a click pins ${tgt?.key}; the minimap's click opens the map on ${mm?.key}`,
      Math.hypot(v1.cx - v0.cx, v1.cz - v0.cz) > 10 && z1 > z0 * 1.2 && tgt && pin === tgt.key && !!tip && mo.open && mo.sel === mm?.key, { v0, v1, z0, z1, tgt, pin, pe, tip, mm, mo });
    await ev(page, () => { window.G.ui.closeAll(); window.G.mapPin.clear('qa'); });
  }
  if (want('h')) {
    const h = await ev(page, async () => {
      const G = window.G, U = G.ui, P = G.villageMinimap, N = document.querySelector('.mm-n');
      const rot0 = P.rot(), n0 = N.getBoundingClientRect();
      U.setSetting('mmNorth', 1); await new Promise(r => setTimeout(r, 300));
      const rot1 = P.rot(), n1 = N.getBoundingClientRect(), wrap = document.querySelector('.mm-wrap').getBoundingClientRect();
      U.setSetting('mmNorth', 0);
      const spans = []; const z = document.querySelector('.mm-zoom');
      for (let i = 0; i < 3; i++) { z.click(); spans.push(P.spanMini()); }
      return { rot0, rot1, top0: n0.top - wrap.top, top1: n1.top - wrap.top, left1: n1.left + n1.width / 2 - (wrap.left + wrap.width / 2), spans, back: U.settings.mmZoom };
    });
    R.check(`h) Settings › Minimap North up: the turn goes to 0 (from ${h.rot0.toFixed(2)}), the N badge to the top (${h.top0.toFixed(0)} → ${h.top1.toFixed(0)} px); the lens chip cycles ${h.spans.join(' → ')} m`, Math.abs(h.rot1) < 1e-6 && Math.abs(h.rot0) > 0.1 && h.top1 < 4 && Math.abs(h.left1) < 3 && h.spans.join() === '64,28,40' && h.back === 1, h);
  }
  if (want('i')) {
    const i = await ev(page, async () => { const P = window.G.villageMinimap, s0 = { ...P.stats }; await new Promise(r => setTimeout(r, 4000)); const n = P.stats.draws - s0.draws, ms = (P.stats.ms - s0.ms) / n; return { n, ms: +ms.toFixed(3), frame: +(ms * n / 4 / 60).toFixed(3) }; });
    R.check(`i) perf: the HUD disc draws ${i.n} times in 4 s at ${i.ms} ms each: ${i.frame} ms a frame (≤ 0.2)`, i.n >= 40 && i.frame <= 0.2, i);
  }
  errs.push(...errors); warns.push(...w);
  await browser.close();
}

// ---------------------------------------------------------------- f: the pad on the Deck
if (want('f')) {
  const { browser, page, errors, warns: w } = await launch({ w: 1280, h: 800 });
  await boot(page, 'fresh&nointro&notut&hour=10&deck');
  await installPad(page); await sleep(page, 600);
  await padTap(page, 'View'); await until(page, () => window.G.ui.isOpen('map'));
  const v0 = await ev(page, () => ({ ...window.G.ui.panels.map.view, z: window.G.ui.panels.map.zoom }));
  await padStick(page, 'left', 0.9, 0.3); await sleep(page, 500); await padStick(page, 'left', 0, 0);
  const v1 = await ev(page, () => ({ ...window.G.ui.panels.map.view, cross: document.querySelector('.p-map .mp-frame').classList.contains('aiming') }));
  await padDown(page, 'RT'); await sleep(page, 450); await padUp(page, 'RT');
  const z1 = await ev(page, () => window.G.ui.panels.map.zoom);
  await padTap(page, 'DDown'); await sleep(page, 120); await padTap(page, 'A'); await sleep(page, 300);
  const f = await ev(page, () => ({ pin: window.G.mapPin.cur?.key || null, focus: window.G.ui.padNav.cur?.dataset?.key, hints: window.G.ui.padNav.hintsEl.textContent }));
  await page.screenshot({ path: shotPath('f-pad') });
  await padTap(page, 'Y'); await sleep(page, 600);
  const f2 = await ev(page, () => ({ open: window.G.ui.isOpen('map'), key: window.G.lead.intent?.key || null }));
  R.check(`f) the pad: View opens the map, LS pans it under the crosshair (${(v1.cx - v0.cx).toFixed(1)}, ${(v1.cz - v0.cz).toFixed(1)} m), RT zooms (${v0.z.toFixed(2)} → ${z1.toFixed(2)}), the D-pad and A pin a row (${f.pin}), Y: Shadow leads (${f2.key}) and the map closes`,
    Math.hypot(v1.cx - v0.cx, v1.cz - v0.cz) > 8 && v1.cross && z1 > v0.z * 1.2 && f.pin && f.pin === f.focus && /Move/.test(f.hints) && !f2.open && f2.key === `m:${f.pin}`, { v0, v1, z1, f, f2 });
  errs.push(...errors); warns.push(...w);
  await browser.close();
}

// ---------------------------------------------------------------- g: touch on a phone
if (want('g')) {
  const { browser, page, errors, warns: w, F } = await launchTouch({ w: PHONE.w, h: PHONE.h, dpr: PHONE.dpr, ua: PHONE.ua });
  await boot(page, 'fresh&nointro&notut&hour=10');
  await sleep(page, 800);
  await ev(page, () => window.G.ui.open('map')); await sleep(page, 600);
  const r = await ev(page, () => { const c = document.querySelector('.p-map .mp-cv').getBoundingClientRect(); return { x: c.left + c.width / 2, y: c.top + c.height / 2 }; });
  const v0 = await ev(page, () => ({ ...window.G.ui.panels.map.view, z: window.G.ui.panels.map.zoom }));
  await F.drag(r.x, r.y, r.x + 60, r.y + 30, { steps: 8 }); await sleep(page, 150);
  const v1 = await ev(page, () => ({ ...window.G.ui.panels.map.view }));
  await F.pinch(r.x, r.y, 60, 160); await sleep(page, 200);
  const z1 = await ev(page, () => window.G.ui.panels.map.zoom);
  const tgt = await ev(page, () => { const M = window.G.ui.panels.map; M.draw(); const n = M.size() / 2, H = window.G.villageMinimap.bigHits, h = H.filter(h => h.e?.kind === 'place' && !h.e.landmark && H.every(o => o === h || Math.hypot(o.x - h.x, o.y - h.y) > o.r + h.r + 4)).sort((a, b) => Math.hypot(a.x - n, a.y - n) - Math.hypot(b.x - n, b.y - n))[0]; const c = M.cv.getBoundingClientRect(), s = c.width / M.size(); return h ? { x: c.left + h.x * s, y: c.top + h.y * s, key: h.e.key } : null; }); // (the place nearest the map's middle with nothing else under the finger)
  await sleep(page, 400); // (a tap hard on the heels of a pinch is the browser's to drop: a finger settles first)
  if (tgt) await F.tap(tgt.x, tgt.y);
  await sleep(page, 300);
  const pin = await ev(page, () => window.G.mapPin.cur?.key || null);
  await page.screenshot({ path: shotPath('g-touch') });
  R.check(`g) touch: a drag pans (${(v1.cx - v0.cx).toFixed(1)}, ${(v1.cz - v0.cz).toFixed(1)} m), a pinch zooms (${v0.z.toFixed(2)} → ${z1.toFixed(2)}), a tap pins ${tgt?.key}`, Math.hypot(v1.cx - v0.cx, v1.cz - v0.cz) > 8 && z1 > v0.z * 1.5 && tgt && pin === tgt.key, { v0, v1, z1, tgt, pin });
  errs.push(...errors); warns.push(...w);
  await browser.close();
}

// ---------------------------------------------------------------- j: a zone (Takemori saved: the peaceful Bamboo Grove)
if (want('j')) {
  const { browser, page, errors, warns: w } = await launch({ w: 1600, h: 900 });
  await boot(page, 'fresh&nointro&notut&hour=10&villagesaved=bamboo&region=bamboo');
  await page.waitForFunction(() => window.G?.mode === 'dungeon' && window.G.dungeon?.isRegion && !window.G.ui?.iris?.active, null, { timeout: 40000 });
  await until(page, () => window.G.ui.hud.mm.provider?.stats?.draws > 3);
  const j = await ev(page, async () => {
    const G = window.G, M = G.ui.panels.map; G.ui.open('map'); await new Promise(r => setTimeout(r, 400)); M.draw();
    const P = G.ui.hud.mm.provider, H = P.bigHits, keys = H.map(h => h.e?.key).filter(Boolean);
    const L = P.lists(), zp = L.people.filter(e => e.zone), pl = L.places.map(p => p.name);
    M.dir.tab = 'people'; M.dir.render(true);
    const head = [...M.dir.$.list.querySelectorAll('.mp-gh')].map(h => h.textContent.replace(/\d+$/, '').trim());
    const v = zp.find(e => e.visible) || zp[0];
    M.select(v.key, { pin: true, centre: true });
    const t = G.questTarget(); G.ui.closeAll();
    // you and Shadow back at the Wayfarer's Stone (the zone's start: joined to its village by the trail; a spot picked
    // round the villager could be a pocket the thickets or a house close off), then the lead, waited for until he's on
    // the way (≤ 7 s)
    const sx = G.dungeon.startPos.x + 1.5, sz = G.dungeon.startPos.z + 1.5;
    G.player.setPos(sx, sz); G.companion.setPos(sx + 1, sz); await new Promise(r => setTimeout(r, 400));
    const led = G.mapPin.lead(); for (let i = 0; i < 70 && G.lead.state !== 'go'; i++) await new Promise(r => setTimeout(r, 100));
    return { prov: P.constructor.name, art: P.art.stats.ms, zone: zp.length, onMap: zp.filter(e => e.visible && keys.includes(e.key)).length, pl, head, pin: G.mapPin.cur?.key, tpin: t?.pin, led, lead: G.lead.state, why: G.lead.why, key: G.lead.intent?.key, wild: H.filter(h => h.e?.wild).length };
  });
  const want8 = ['Wayfarer\'s Stone', 'Bamboo Depths', 'Takemori Village', 'Sightings board'].filter(n => j.pl.some(p => p.includes(n)));
  R.check(`j) a zone: the painted region (${j.art} ms), its ${j.zone} villagers in People under "${j.head[0] === 'Something for you' ? j.head[1] : j.head[0]}" and on the map (${j.onMap}), its places (${want8.join(', ')}; the wild areas ${j.wild}); a villager's pin points there and Shadow leads to them (${j.lead}, ${j.key})`,
    j.prov === 'RegionMinimap' && j.zone >= 4 && j.onMap >= 3 && want8.length === 4 && j.wild >= 1 && j.head.includes('Takemori Village') && j.pin && j.tpin === j.pin && j.led && ['go', 'wait', 'arrived'].includes(j.lead) && j.key === `m:${j.pin}`, j);
  await page.screenshot({ path: shotPath('j-zone') });
  const j2 = await ev(page, async () => { const G = window.G; G.returnToVillage?.(); return true; });
  if (j2) { await page.waitForFunction(() => window.G?.mode === 'village' && !window.G.ui?.iris?.active, null, { timeout: 30000 }).catch(() => {}); await sleep(page, 600); }
  const j3 = await ev(page, () => ({ mode: window.G.mode, pin: window.G.mapPin.cur?.key || null }));
  R.check('j) leaving the zone lets its pin go (a zone villager is only pinned while you\'re there)', j3.mode === 'village' && !j3.pin, j3);
  errs.push(...errors); warns.push(...w);
  await browser.close();
}

// ---------------------------------------------------------------- k: a dungeon floor's fog (n: its names, a chest, the chips)
if (want('k') || want('n')) {
  const { browser, page, errors, warns: w } = await launch({ w: 1600, h: 900 });
  await boot(page, 'fresh&nointro&notut&floor=2&dseed=1'); // (dseed: the same floor every run)
  await page.waitForFunction(() => window.G?.mode === 'dungeon' && !window.G.ui?.iris?.active, null, { timeout: 40000 });
  await until(page, () => window.G.ui.hud.mm.provider?.stats?.draws > 3);
  const k1 = await ev(page, async () => {
    const G = window.G, D = G.dungeon, P = G.ui.hud.mm.provider; P._LT = 0;
    const names = P.lists().places.map(p => p.name), CELL = 2, L = D.layout, cell = Math.floor(D.stairsPos.z / CELL) * L.W + Math.floor(D.stairsPos.x / CELL);
    const a0 = P.seen[cell] ? 0 : 255; // (unseen: the fog canvas holds it at full dusk; read back once, after)
    G.player.setPos(D.stairsPos.x + 1.5, D.stairsPos.z + 1.5); await new Promise(r => setTimeout(r, 600)); P._LT = 0;
    const names2 = P.lists().places.map(p => p.name), FS = P.FS || 2, FW = P.fog.width, img = P.fog.getContext('2d').getImageData(0, 0, FW, P.fog.height).data; // (read back once)
    const alphaAt = (x, y) => img[((y * FS + (FS >> 1)) * FW + x * FS + (FS >> 1)) * 4 + 3], a1 = alphaAt(Math.floor(D.stairsPos.x / CELL), Math.floor(D.stairsPos.z / CELL));
    // no leak: a flood over the seen floor from where you've been (the start, here) reaches every seen floor cell; every
    // floor cell with nothing seen round it is under whole fog
    const vis = new Uint8Array(L.W * L.H), qq = [];
    for (const p of [D.startPos, G.player.pos]) { const x = Math.floor(p.x / CELL), y = Math.floor(p.z / CELL), i = y * L.W + x; if (!vis[i]) { vis[i] = 1; qq.push(x, y); } }
    for (let h = 0; h < qq.length; h += 2) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = qq[h] + dx, ny = qq[h + 1] + dy; if (nx < 0 || ny < 0 || nx >= L.W || ny >= L.H) continue; const i = ny * L.W + nx;
      if (!vis[i] && P.seen[i] && L.at(nx, ny)) { vis[i] = 1; qq.push(nx, ny); }
    }
    let stray = 0, deep = 0, thin = 0;
    for (let y = 1; y < L.H - 1; y++) for (let x = 1; x < L.W - 1; x++) {
      const i = y * L.W + x; if (!L.at(x, y)) continue; if (P.seen[i] && !vis[i]) stray++;
      let near = false; for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) if (P.seen[i + dy * L.W + dx]) { near = true; break; }
      if (!near) { deep++; if (alphaAt(x, y) < 250) thin++; }
    }
    G.ui.closeAll(); const s0 = { ...P.stats }; await new Promise(r => setTimeout(r, 2500)); const per = (P.stats.ms - s0.ms) / Math.max(1, P.stats.draws - s0.draws); // (the disc's draw on a floor, its monsters and fog)
    G.ui.open('map'); await new Promise(r => setTimeout(r, 400)); G.ui.panels.map.draw();
    return { prov: P.constructor.name, art: P.art.stats.ms, before: names, after: names2, a0, a1, stray, deep, thin, stairsHit: P.bigHits.some(h => h.e?.name === 'Stairs down'), portal: names.includes('Portal home'), per: +per.toFixed(3), monsters: D.monsters.filter(m => m.alive).length };
  });
  await page.screenshot({ path: shotPath('k-floor') });
  R.check(`k) a dungeon floor: painted (${k1.art} ms) under a fog (the stairs' cell ${k1.a0} → ${k1.a1} alpha once seen); the stairs are a place only once seen (${k1.before.includes('Stairs down')} → ${k1.after.includes('Stairs down')}), the portal home always; no leak (${k1.stray} seen floor cells out of reach, ${k1.thin} of ${k1.deep} deep unseen ones under thin fog); the disc's draw ${k1.per} ms with ${k1.monsters} monsters on the floor (${(k1.per * 15 / 60).toFixed(3)} ms a frame ≤ 0.2)`,
    k1.prov === 'DungeonMinimap' && k1.a0 > 200 && k1.a1 < 40 && k1.stray === 0 && k1.deep > 50 && k1.thin === 0 && !k1.before.includes('Stairs down') && k1.after.includes('Stairs down') && k1.stairsHit && k1.portal && k1.per * 15 / 60 <= 0.2, k1);
  if (want('n')) {
    const n = await ev(page, async () => {
      const G = window.G, D = G.dungeon, U = G.ui, M = U.panels.map, P = U.hud.mm.provider, wait = ms => new Promise(r => setTimeout(r, ms));
      const clash = () => (P.nameQA?.names || []).filter(a => P.nameQA.marks.some(b => !(a.r[2] < b[0] || a.r[0] > b[2] || a.r[3] < b[1] || a.r[1] > b[3]))).map(a => a.name);
      U.closeAll(); G.player.setPos(D.startPos.x + 1.2, D.startPos.z + 0.6); await wait(300); // (you by the portal home)
      U.open('map'); await wait(350); M.draw();
      const c0 = clash(), named0 = P.nameQA.names.map(a => a.name);
      P._LT = 0; const portal = P.lists().places.find(p => p.name === 'Portal home'); G.mapPin.set(portal); M.draw(); // (the pin on it too)
      const c1 = clash(), named1 = P.nameQA.names.map(a => a.name); G.mapPin.clear();
      // a chest opened: the map keeps it, dimmed
      const it = G.world.interactables.find(i => /^Open (golden )?chest/.test(i.label)); let opened = null;
      if (it) { U.closeAll(); G.player.setPos(it.pos.x + 1.4, it.pos.z + 1.4); await wait(300); it.onInteract(); await wait(200); P._LT = 0; opened = P.lists().places.find(p => p.dim && p.icon === 'chest' && Math.hypot(p.pos.x - it.pos.x, p.pos.z - it.pos.z) < 2.6) || false; }
      U.open('map'); await wait(350); P._LT = 0; M.draw(); M.paintChips();
      const chips = [...document.querySelectorAll('.p-map .mp-chip')].map(b => ({ l: b.dataset.l, off: b.disabled, n: P.layerCounts?.[b.dataset.l] ?? null }));
      return { c0, c1, named0, named1, chest: !!it, opened: opened && { name: opened.name, dim: opened.dim }, chips };
    });
    await page.screenshot({ path: shotPath('n-floor-names') });
    const ch = Object.fromEntries(n.chips.map(c => [c.l, c]));
    R.check(`n) a floor's names dodge the marks (${n.c0.length} under you or Shadow by the portal, ${n.c1.length} with the pin on it too; the portal's named: ${n.named0.includes('Portal home')}/${n.named1.includes('Portal home')}); an opened chest stays, dimmed (${n.opened?.name}); the chips greyed where nothing's here: ${n.chips.filter(c => c.off).map(c => c.l).join(', ')} (the others: ${n.chips.filter(c => !c.off).map(c => c.l + ' ' + c.n).join(', ')})`,
      n.c0.length === 0 && n.c1.length === 0 && n.named0.includes('Portal home') && n.named1.includes('Portal home') && n.chest && !!n.opened?.dim && ch.shops.off && ch.wild.off && n.chips.every(c => c.off === !c.n), n);
  }
  errs.push(...errors); warns.push(...w);
  await browser.close();
}

// ---------------------------------------------------------------- l: a room, m: the filter chips (the village)
if (want('l') || want('m')) {
  const { browser, page, errors, warns: w } = await launch({ w: 1600, h: 900 });
  await boot(page, 'fresh&nointro&notut&hour=10');
  await until(page, () => window.G.villageMinimap?.stats?.draws > 3);
  if (want('m')) {
    const m = await ev(page, async () => {
      const G = window.G, U = G.ui, M = U.panels.map, P = G.villageMinimap; U.open('map'); await new Promise(r => setTimeout(r, 350)); M.draw();
      const count = (H, cat) => H.filter(h => h.e?.kind === 'place' && h.e.cat === cat).length, ppl = H => H.filter(h => h.e?.kind === 'person' && !h.e.shadow).length;
      const g = document.createElement('canvas').getContext('2d'), p = G.player.pos, mini = () => P.drawMap(g, 180, { cx: p.x, cz: p.z, span: 64 }, { mini: true });
      mini(); const s0 = { big: count(P.bigHits, 'shop'), mini: count(P.hits, 'shop'), ppl: ppl(P.bigHits) };
      const chip = k => document.querySelector(`.p-map .mp-chip[data-l="${k}"]`);
      chip('shops').click(); chip('people').click(); M.draw(); mini();
      const s1 = { big: count(P.bigHits, 'shop'), mini: count(P.hits, 'shop'), ppl: ppl(P.bigHits), stored: { ...U.settings.mapLayers }, on: chip('shops').classList.contains('on') };
      chip('shops').click(); chip('people').click(); M.draw();
      const s2 = { big: count(P.bigHits, 'shop'), ppl: ppl(P.bigHits) }; M.paintChips();
      const grey = { wild: chip('wild').disabled, shops: chip('shops').disabled, people: chip('people').disabled };
      return { s0, s1, s2, grey };
    });
    R.check(`m) the filter chips: Shops off hides the shop badges on both maps (${m.s0.big}/${m.s0.mini} → ${m.s1.big}/${m.s1.mini}), People off the pips (${m.s0.ppl} → ${m.s1.ppl}, '!' ones stay), kept in Settings; on again they're back; Wild greyed in the village (${m.grey.wild}), Shops and People not`,
      !m.grey.shops && !m.grey.people && m.grey.wild && m.s0.big > 0 && m.s0.mini > 0 && m.s1.big === 0 && m.s1.mini === 0 && !m.s1.on && m.s1.stored.shops === false && m.s1.ppl < m.s0.ppl && m.s2.big === m.s0.big && m.s2.ppl === m.s0.ppl, m);
    await ev(page, () => window.G.ui.closeAll());
  }
  if (want('l')) {
    await ev(page, () => window.G.openHome()); await page.waitForFunction(() => window.G.mode === 'interior' && !window.G.ui?.iris?.active, null, { timeout: 20000 }); await sleep(page, 700);
    const l = await ev(page, async () => {
      const G = window.G, U = G.ui, M = U.panels.map, P = U.hud.mm.provider; U.open('map'); await new Promise(r => setTimeout(r, 350)); M.draw();
      const names = P.lists().places.map(p => p.name), hits = P.bigHits.filter(h => h.e?.kind === 'place').map(h => h.e.name), sig0 = P.art.sig;
      const it = G.world.items.find(i => i.mount === 'floor'); const x0 = it.x; it.x += 1; M.draw(); const sig1 = P.art.sig; it.x = x0; M.draw();
      return { prov: P.constructor.name, names, hits, rebuilt: sig0 !== sig1, ms: P.art.stats.ms };
    });
    await page.screenshot({ path: shotPath('l-room') });
    R.check(`l) a room: its floor plan painted (${l.ms} ms), its places (${l.names.join(', ')}) as badges on the map, drawn again when a piece moves`,
      l.prov === 'InteriorMinimap' && ['The bed', 'The stash', 'The kitchen', 'The door'].every(n => l.names.includes(n) && l.hits.includes(n)) && l.rebuilt, l);
  }
  errs.push(...errors); warns.push(...w);
  await browser.close();
}

process.exit(R.finish(errs, warns) ? 1 : 0);
