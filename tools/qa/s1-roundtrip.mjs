// Scenario 1: village <-> dungeon round trips x5 (+ a stairs chain) — leak & duplication checks.
// Measures renderer.info.memory (GPU geometries/textures), programs, village scene children, light-pool sources,
// window listeners (CDP), bus-handler duplication (one emit -> one sfx / one toast) and loot-label DOM residue.
import { launch, boot, waitMode, sleep, makeReport, drainDialogue } from './lib.mjs';

const R = makeReport('S1 village<->dungeon round trips');
const { browser, context, page, errors, warns } = await launch();
const cdp = await context.newCDPSession(page);
async function windowListeners() {
  const { result } = await cdp.send('Runtime.evaluate', { expression: 'window' });
  const { listeners } = await cdp.send('DOMDebugger.getEventListeners', { objectId: result.objectId });
  const by = {}; for (const l of listeners) by[l.type] = (by[l.type] || 0) + 1; return { n: listeners.length, by };
}
async function dupCheck() {
  return page.evaluate(() => {
    const QA = window.QA; const s0 = QA.sfx.length, t0 = QA.toasts.length;
    QA.Events.emit('sfx', 'ui_click');
    const sfx = QA.sfx.length - s0;
    QA.Events.emit('toast', { text: 'qa-dup-' + Math.random() });
    return { sfx, toast: QA.toasts.length - t0 };
  });
}
try {
  await boot(page, 'fresh&nointro');
  // freeze village growth so new buildings don't pollute the leak numbers (sim.update grows every 6 s)
  await page.evaluate(() => { window.__freeze = setInterval(() => { window.G.sim.tickT = -1e9; }, 200); window.G.sim.tickT = -1e9; });
  const base = await page.evaluate(() => window.QA.mem());
  const wl0 = await windowListeners();
  R.note(`baseline ${JSON.stringify(base)} windowListeners=${wl0.n}`);
  const hist = [];
  for (let i = 0; i < 5; i++) {
    const floor = 1 + (i % 3);
    await page.evaluate(f => window.G.enterDungeon(f), floor);
    await waitMode(page, 'dungeon');
    // fight a bit so projectiles / loot / labels / light sources exist when leaving
    await page.evaluate(() => {
      const G = window.G, D = G.dungeon;
      const ms = D.monsters.slice(0, 6);
      for (const m of ms) { G.player.setPos(m.pos.x + 0.6, m.pos.z); G.combat.hitMonster(m, { dmgPct: 100000 }); }
      G.skills.throwBall({ dmgPct: 100, speed: 15, range: 11 }, G.player.pos.clone().add(new G.THREE.Vector3(5, 0, 0)));
      G.player.setPos(D.startPos.x, D.startPos.z);
    });
    await sleep(page, 1200);
    const inDungeon = await page.evaluate(() => {
      const G = window.G; window.__old = { scene: G.world.scene, vfx: G.vfx, sun: G.world.sun, mask: G.world.mask };
      return { sources: G.world.lightPool.sources.size, loot: G.dungeon.loot.list.length, labels: document.querySelectorAll('.ll').length, ents: G.combat.entities.size };
    });
    await page.evaluate(() => window.G.returnToVillage());
    await waitMode(page, 'village');
    await sleep(page, 700);
    if (i === 0) {
      // first-ever Burrow visit schedules Shadow's combat tutorial 2.6 s after entering; we left after ~1.5 s
      await sleep(page, 1500);
      const tut = await page.evaluate(() => ({ mode: window.G.mode, dlg: !!window.G.ui.dlg.active, speaker: window.G.ui.dlg.active ? window.G.ui.dlg.opts.speaker : null, line: window.G.ui.dlg.active ? window.G.ui.dlg.lines[0].text.slice(0, 60) : null, locked: window.G.player.controlLocked }));
      R.check('Burrow combat tutorial does not pop up after already leaving the Burrow', !(tut.dlg && tut.speaker === 'Shadow' && tut.mode === 'village'), JSON.stringify(tut));
      await drainDialogue(page);
      await sleep(page, 300);
    }
    const m = await page.evaluate(() => window.QA.mem());
    if (i === 0) {
      const old = await page.evaluate(() => {
        const o = window.__old, geos = new Set(), mats = new Set();
        o.scene.traverse(x => { if (x.geometry) geos.add(x.geometry); if (x.material) mats.add(x.material); });
        let disposedFlag = 0; // three sets no public flag; check the particle layers still hold their buffers
        return { oldSceneChildren: o.scene.children.length, oldSceneGeometries: geos.size, oldSceneMaterials: mats.size, shadowMapStillAllocated: !!o.sun.shadow.map, shadowMapSize: o.sun.shadow.mapSize.x, maskTex: !!o.mask?.image, vfxLayers: o.vfx.layers.length };
      });
      R.note(`old dungeon after leaving: ${JSON.stringify(old)}`);
      R.check('old dungeon scene emptied / disposed after leaving', old.oldSceneChildren === 0, `${old.oldSceneChildren} children, ${old.oldSceneGeometries} geometries still referenced (shadow render target is covered by the texture-count check)`);
    }
    // light sources in the village that do not belong to a building record (projectiles, pups, etc.)
    m.foreignSources = await page.evaluate(() => { const G = window.G; const own = new Set(); for (const r of G.sim.list) for (const l of r.lights) own.add(l); let n = 0; for (const s of G.village.world.lightPool.sources) if (!own.has(s)) n++; return n; });
    const dup = await dupCheck();
    const st = await page.evaluate(() => window.QA.state());
    hist.push({ i, ...m, dungeon: inDungeon, dup, locked: st.locked, st: JSON.stringify({ anim: st.anim, dlg: st.dlg, modal: st.modal, dead: st.dead }) });
    R.note(`cycle ${i + 1} (floor ${floor}): geo=${m.geo} tex=${m.tex} progs=${m.progs} vChildren=${m.villageChildren} vSources=${m.villageSources} labels=${m.lootLabels} | in-dungeon loot=${inDungeon.loot} labels=${inDungeon.labels} | dup=${JSON.stringify(dup)}`);
  }
  const wl1 = await windowListeners();
  const first = hist[0], last = hist[hist.length - 1];
  const geoPerCycle = (last.geo - first.geo) / (hist.length - 1), texPerCycle = (last.tex - first.tex) / (hist.length - 1);
  R.check('GPU geometries do not grow per round trip', geoPerCycle < 5, `+${geoPerCycle.toFixed(1)} geometries per cycle (cycle1 ${first.geo} -> cycle5 ${last.geo}; baseline ${base.geo})`);
  R.check('GPU textures do not grow per round trip', texPerCycle < 1, `+${texPerCycle.toFixed(1)} textures per cycle (cycle1 ${first.tex} -> cycle5 ${last.tex}; baseline ${base.tex})`);
  R.check('shader programs stable', last.progs - first.progs <= 2, `${first.progs} -> ${last.progs}`);
  R.check('village scene child count stable', last.villageChildren === first.villageChildren, `${base.villageChildren} -> ${hist.map(h => h.villageChildren).join(',')}`);
  R.check('village light-pool sources do not accumulate', last.villageSources === first.villageSources && last.foreignSources === first.foreignSources, `${base.villageSources} -> ${hist.map(h => h.villageSources).join(',')} (non-building sources ${hist.map(h => h.foreignSources).join(',')})`);
  R.check('village interactables stable', last.villageInteract === base.villageInteract, `${base.villageInteract} -> ${last.villageInteract}`);
  R.check('no loot labels left over in the village', hist.every(h => h.lootLabels === 0), hist.map(h => h.lootLabels).join(','));
  R.check('bus events not duplicated (1 sfx emit -> 1 audio.play, 1 toast -> 1 toast)', hist.every(h => h.dup.sfx === 1 && h.dup.toast === 1), hist.map(h => JSON.stringify(h.dup)).join(' '));
  R.check('window event listeners do not multiply', wl1.n <= wl0.n, `${wl0.n} -> ${wl1.n} ${JSON.stringify(wl1.by)}`);
  R.check('controls unlocked after every return', hist.every(h => !h.locked), hist.map(h => h.locked + ':' + h.st).join(' '));

  // stairs chain: floor 1 -> 2 -> 3 via G.enterDungeon while already in the dungeon (the "burrow deeper" path)
  await page.evaluate(() => window.G.enterDungeon(1));
  await waitMode(page, 'dungeon');
  const c0 = await page.evaluate(() => ({ geo: window.G.engine.renderer.info.memory.geometries, tex: window.G.engine.renderer.info.memory.textures }));
  const chain = [];
  for (let f = 2; f <= 4; f++) {
    await page.evaluate(ff => { const G = window.G; const it = G.world.interactables.find(x => /Burrow deeper/.test(x.label)); it ? it.onInteract() : G.enterDungeon(ff); }, f);
    await page.waitForFunction(ff => window.G.dungeon?.floor === ff && !window.G.ui.iris.active, f, { timeout: 20000 });
    await sleep(page, 500);
    chain.push(await page.evaluate(() => ({ geo: window.G.engine.renderer.info.memory.geometries, tex: window.G.engine.renderer.info.memory.textures, sources: window.G.world.lightPool.sources.size, children: window.G.world.scene.children.length })));
  }
  R.note(`stairs chain from ${JSON.stringify(c0)}: ${JSON.stringify(chain)}`);
  R.check('stairs chain: GPU memory released between floors', chain[2].geo - chain[0].geo < 50, `geo ${chain.map(c => c.geo).join(' -> ')}, tex ${chain.map(c => c.tex).join(' -> ')}`);
  await page.evaluate(() => window.G.returnToVillage());
  await waitMode(page, 'village');
} catch (e) { errors.push('[harness] ' + e.stack); }
const failed = R.finish(errors, warns);
await browser.close();
process.exit(failed ? 1 : 0);
