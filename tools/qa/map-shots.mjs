// The maps' look review (ROADMAP UX-1, docs/MAP.md): the HUD minimap and the big map in the village, a zone, a dungeon
// floor and an interior, at the game camera, on a desktop (1600×900), the Steam Deck (1280×800, the Deck preset) and a
// phone (844×390 at DPR 3, touch). For each: the whole screen with the minimap, a close crop of the minimap, and the
// big map open (plus, in the village, the People list with someone picked when the directory exists). The explored
// floors (xdun: the Fox Shrine den's floor 1, with its stairs, chests and shrine; xboss: the Mossy Burrow's floor 2, the
// boss's room; DEN_XDUN=foxShrine:1 / DEN_XBOSS=… for another den's floor, dseed=6 pins their layouts) are
// revealed whole by the minimap's own reveal, one chest opened, the stairs pinned, you by the portal home.
//   usage: node tools/qa/map-shots.mjs [device…] [scene…]   devices: desktop deck phone   scenes: village zone dungeon zdun home xdun xboss
//   SHOT_DIR (default tools/qa/tmp/ux1/<TAG>)   TAG (default after)
import fs from 'node:fs';
import path from 'node:path';
import { launch, boot, sleep, waitMode } from './lib.mjs';
import { launchTouch, PHONE } from './touch-lib.mjs';

const TAG = process.env.TAG || 'after';
const OUT = process.env.SHOT_DIR || path.resolve('tools/qa/tmp/ux1', TAG);
fs.mkdirSync(OUT, { recursive: true });
const args = process.argv.slice(2);
const DEVICES = ['desktop', 'deck', 'phone'].filter(d => !args.some(a => ['desktop', 'deck', 'phone'].includes(a)) || args.includes(d));
const ALLS = ['village', 'zone', 'dungeon', 'zdun', 'home', 'xdun', 'xboss'], SCENES = ALLS.filter(s => !args.some(a => ALLS.includes(a)) || args.includes(s));
const QS = { village: 'fresh&nointro&notut&hour=10', zone: 'fresh&nointro&notut&hour=10&villagesaved=bamboo&region=bamboo', dungeon: 'fresh&nointro&notut&floor=2', zdun: 'fresh&nointro&notut&hour=10', home: 'fresh&nointro&notut&hour=10', xdun: 'fresh&nointro&notut&hour=10&dseed=6', xboss: 'fresh&nointro&notut&hour=10&dseed=6' }; // (dseed=6: the Fox Shrine's floor 1 has its shrine, a gold chest and three more; the Mossy Burrow's floor 2 a shrine, four chests and the boss)
const DEN = { xdun: (process.env.DEN_XDUN || 'foxShrine:1').split(':'), xboss: (process.env.DEN_XBOSS || 'mossyBurrow:2').split(':') }; // (a den's id and floor: dungeon/defs.js) // (zdun: a zone dungeon's boss floor, the Bamboo Depths 2F)

for (const k of ALLS) if (process.env['QS_' + k.toUpperCase()]) QS[k] = process.env['QS_' + k.toUpperCase()]; // (QS_XDUN=… : another floor, e.g. a den's)

async function open(device) {
  if (device === 'phone') return launchTouch({ w: PHONE.w, h: PHONE.h, dpr: PHONE.dpr, ua: PHONE.ua });
  return launch(device === 'deck' ? { w: 1280, h: 800 } : { w: 1600, h: 900 });
}

for (const device of DEVICES) {
  for (const scene of SCENES) {
    const { browser, page, errors } = await open(device);
    const ev = (f, a) => page.evaluate(f, a);
    const shot = (name, clip) => page.screenshot({ path: path.join(OUT, `${device}-${scene}-${name}.png`), ...(clip ? { clip } : {}) });
    try {
      await boot(page, QS[scene] + (device === 'deck' ? '&deck' : ''));
      if (scene === 'zone') await waitMode(page, 'dungeon');
      if (scene === 'zdun') { await ev(() => { const G = window.G; G.zoneDebug?.saveVillage?.('bamboo'); G.enterDungeon({ id: 'bambooDepths', floor: 2 }); }); }
      if (DEN[scene]) await ev(([id, floor]) => window.G.enterDungeon({ id, floor: +floor }), DEN[scene]);
      if (scene === 'dungeon' || scene === 'zdun') {
        await waitMode(page, 'dungeon');
        // walk the reveal round a few rooms (the fog of war) by moving the hero to open cells near the start
        await ev(async () => {
          const G = window.G, D = G.dungeon, L = D.layout, s = D.startPos, CELL = 2, pts = [];
          for (let y = 0; y < L.H; y++) for (let x = 0; x < L.W; x++) if (L.at(x, y) && Math.hypot(x * CELL - s.x, y * CELL - s.z) < 34) pts.push([x * CELL + 1, y * CELL + 1]);
          pts.sort((a, b) => Math.hypot(a[0] - s.x, a[1] - s.z) - Math.hypot(b[0] - s.x, b[1] - s.z));
          for (let i = 0; i < pts.length; i += Math.max(1, Math.floor(pts.length / 14))) { G.player.setPos(pts[i][0], pts[i][1]); G.ui.minimap?.provider?.reveal?.(); G.ui.hud.mm.provider?.reveal?.(); await new Promise(r => setTimeout(r, 30)); }
          G.player.setPos(s.x, s.z);
        });
        await sleep(page, 400);
      }
      if (scene === 'xdun' || scene === 'xboss') {
        await waitMode(page, 'dungeon');
        // the whole floor seen: the minimap's own reveal from every third cell, in one go (no frame runs between, so no
        // room's trigger sees you), then one chest opened, the stairs pinned and you back by the portal home
        const x = await ev(() => {
          const G = window.G, D = G.dungeon, L = D.layout, P = G.ui.hud.mm.provider, CELL = 2, s = D.startPos.clone();
          for (let y = 0; y < L.H; y += 2) for (let x = (y / 2) % 2; x < L.W; x += 2) if (L.at(x, y)) { G.player.pos.set((x + 0.5) * CELL, G.player.pos.y, (y + 0.5) * CELL); P.reveal(); }
          G.player.pos.set(s.x, G.player.pos.y, s.z); G.player.setPos(s.x, s.z);
          const inter = G.world.interactables, chests = inter.filter(i => /^Open (golden )?chest/.test(i.label));
          const near = chests.sort((a, b) => a.pos.distanceTo(s) - b.pos.distanceTo(s));
          if (near.length > 1) near[0].onInteract(); // (the nearest opened: the map keeps it, dimmed)
          P._LT = 0; const pl = P.lists().places, st = pl.find(p => p.name === 'Stairs down') || pl.find(p => p.icon === 'skull');
          if (st) G.mapPin.set(st);
          return { chests: chests.length, shrines: L.shrines.length, waypoint: !!L.waypoint, boss: !!L.bossRoom, places: pl.map(p => p.name) };
        });
        console.log(`   ${scene}: ${JSON.stringify(x)}`);
        await sleep(page, 600);
      }
      if (scene === 'home') { await ev(() => window.G.openHome()); await waitMode(page, 'interior'); await sleep(page, 900); }
      if (scene === 'village') { // stand on Market Street, east of the plaza, where the bakery, folk and stalls are
        await ev(() => { const G = window.G; G.player.setPos(124, 121.5); G.companion.setPos(125, 122.5); G.engine.rig.focus.copy(G.player.pos); G.engine.rig.snap?.(); });
        await sleep(page, 1200);
      }
      await sleep(page, 700);
      await shot('hud');
      const mm = await ev(() => { const r = document.querySelector('.hud .mm-wrap')?.getBoundingClientRect(); return r && r.width ? { x: Math.max(0, r.left - 30), y: Math.max(0, r.top - 6), width: Math.min(innerWidth - Math.max(0, r.left - 30), r.width + 60), height: r.height + 26 } : null; });
      if (mm) await shot('minimap', mm);
      await ev(() => window.G.ui.open('map'));
      await sleep(page, 900);
      await shot('map');
      // the People directory, someone picked (when the map has one: UX-1)
      const explored = scene === 'xdun' || scene === 'xboss'; // (the pin already on the stairs: the Places list as it is)
      const picked = !explored && await ev(() => { const M = window.G.ui.panels?.map; if (!M?.dir) return false; return M.dir.demo?.() || false; });
      if (picked) { await sleep(page, 900); await shot('map-people'); }
      const places = explored ? await ev(() => { const M = window.G.ui.panels?.map; if (!M?.dir) return false; M.dir.tab = 'places'; M.dir.render(true); return true; })
        : await ev(() => { const M = window.G.ui.panels?.map; return M?.dir?.demoPlaces?.() || false; });
      if (places) { await sleep(page, 900); await shot('map-places'); }
      const key = await ev(() => { const M = window.G.ui.panels?.map; if (!M?.dir) return false; M.dir.tab = 'key'; M.dir.render(true); return true; });
      if (key) { await sleep(page, 500); await shot('map-key'); await ev(() => { const M = window.G.ui.panels.map; M.dir.tab = 'people'; M.dir.render(true); }); }
      // zoomed in on the market (the place and people names)
      const zoomed = await ev(() => { const G = window.G, M = G.ui.panels?.map; if (!M?.pans?.()) return false; M.glide = null; const village = G.mode === 'village'; M.view.cx = village ? 132 : G.player.pos.x; M.view.cz = village ? 121 : G.player.pos.z; M.zoom = village ? 3.4 : 2.4; M.draw(); return true; }); // (the market, else round you)
      if (zoomed) { await sleep(page, 600); await shot('map-zoomed'); }
      if (picked || places) { // closed again: the pin on the HUD (the quest arrow and the minimap's edge pin)
        await ev(() => window.G.ui.closeAll());
        await sleep(page, 900);
        await shot('pinned');
        if (mm) await shot('minimap-pinned', mm);
      }
      console.log(`${device} ${scene}: ok${errors.length ? ' · ' + errors.length + ' errors' : ''}`);
      for (const e of [...new Set(errors)].slice(0, 6)) console.log('   ' + e.slice(0, 300));
    } catch (e) { console.log(`${device} ${scene}: FAILED ${e.message}`); }
    await browser.close();
  }
}
console.log('shots in', OUT);
