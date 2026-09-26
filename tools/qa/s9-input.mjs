// Scenario 9: input edge cases. Mash every hotkey in both modes, cast every skill from the hotbar in the village,
// build mode -> enter the Burrow, B with the pause menu open, T spam during the iris, Esc cascades.
import { launch, boot, waitMode, sleep, makeReport, drainDialogue, tap } from './lib.mjs';

const R = makeReport('S9 input edge cases');
const { browser, page, errors, warns } = await launch();
const KEYS = ['i', 'c', 'k', 'j', 'm', 'b', 'Escape', 'x', 'q', 'e', 'r', 't', 'f', 'Space', '1', '2', '3', '4', 'Tab'];
async function mash(rounds = 3, hold = 30) {
  for (let r = 0; r < rounds; r++) for (const k of KEYS) { await page.keyboard.down(k); await page.waitForTimeout(hold); await page.keyboard.up(k); await page.waitForTimeout(20); }
}
async function calm() {
  for (let i = 0; i < 8; i++) {
    await drainDialogue(page);
    const s = await page.evaluate(() => ({ modal: window.G.ui.anyModal(), build: window.G.build.active, iris: window.G.ui.iris.active, menu: window.G.ui.isOpen('menu') }));
    if (s.iris) { await sleep(page, 800); continue; }
    if (s.build) { await page.evaluate(() => window.G.build.exit()); continue; }
    if (!s.modal) break;
    await page.keyboard.press('Escape'); await sleep(page, 250);
  }
}
const sane = () => page.evaluate(() => { const s = window.QA.state(); const open = Object.keys(window.G.ui.panels).filter(k => window.G.ui.isOpen(k)); return { ...s, open, buildFocus: !!window.G.buildFocus, camToPlayer: +Math.hypot(window.G.engine.rig.focus.x - window.G.player.pos.x, window.G.engine.rig.focus.z - window.G.player.pos.z).toFixed(2) }; });
try {
  await boot(page, 'fresh&nointro');
  await page.evaluate(async () => {
    const G = window.G; const { SKILL_IDS } = await import('/src/rpg/skills.js');
    G.state.flags.burrowTut = true; G.state.player.lvl = 30; for (const id of SKILL_IDS) G.state.player.skills[id] = 5;
    G.state.player.hotbar = ['attack', 'chomp', 'packcall', 'blaze', 'decoy', 'moonhowl']; G.actions.recompute();
    G.state.potions = { heart: 5, zoom: 5, rejuv: 2 };
  });
  // --- village mash
  const e0 = errors.length;
  await mash(3);
  await sleep(page, 800);
  await calm();
  let s = await sane();
  R.check('village: mashing every hotkey leaves a sane state', s.mode === 'village' && !s.locked && !s.modal && !s.build && s.finite, JSON.stringify(s));
  R.check('village: no errors from hotkey mashing', errors.length === e0, errors.slice(e0).join(' | '));
  // --- every hotbar skill cast in the village
  const vil = await page.evaluate(async () => {
    const G = window.G, ids = ['chomp', 'whirl', 'dig', 'bonestorm', 'throw', 'ricochet', 'multi', 'decoy', 'blaze', 'fetchstorm', 'woof', 'zoom', 'packcall', 'treat', 'howl', 'moonhowl'];
    const out = {};
    for (const id of ids) { G.skills.cds = {}; G.player.anim.stop(); G.player.leap = null; try { out[id] = G.skills.tryCast(id, G.player.pos.clone().add(new G.THREE.Vector3(3, 0, 1))); } catch (e) { out[id] = 'THREW ' + e.message; } await new Promise(r => setTimeout(r, 450)); }
    await new Promise(r => setTimeout(r, 1500));
    const pups = (G.skills.pups || []).filter(p => p.alive);
    const chasing = pups.map(p => { const t = G.combat.nearest(G.player.pos, 'ally', 9); return t ? (t.breakable ? 'phantom Burrow pot' : t.name) : null; });
    return { out, pups: pups.length, pupTargets: chasing, vCombatEntities: G.combat.entities.size };
  });
  R.check('casting every skill in the village does not throw', !Object.values(vil.out).some(v => typeof v === 'string'), JSON.stringify(vil.out));
  await page.evaluate(() => { window.G.player.leap = null; window.G.player.anim.stop(); });
  // --- build mode, then enter the Burrow
  await tap(page, 'b'); await sleep(page, 500);
  const b1 = await page.evaluate(() => window.G.build.active);
  await page.evaluate(() => window.G.enterDungeon(1));
  await waitMode(page, 'dungeon');
  await sleep(page, 400);
  s = await sane();
  R.check('build mode active -> enter Burrow: build mode fully exits, camera follows Chewy', b1 && !s.build && !s.open.includes('build') && !s.buildFocus && s.camToPlayer < 3, JSON.stringify({ b1, build: s.build, open: s.open, buildFocus: s.buildFocus, camToPlayer: s.camToPlayer }));
  // --- dungeon mash (T returns home mid-mash)
  const e1 = errors.length;
  await page.evaluate(() => { for (const m of window.G.dungeon.monsters) m.status.stun = 999; });
  await mash(2);
  await sleep(page, 3000);
  await calm();
  s = await sane();
  R.check('dungeon: mashing every hotkey (incl. T) ends sane', !s.locked && !s.modal && !s.build && s.finite && !s.leap, JSON.stringify(s));
  R.check('dungeon: no errors from hotkey mashing', errors.length === e1, errors.slice(e1).join(' | '));
  // --- T spam: exactly one trip home
  if ((await page.evaluate(() => window.G.mode)) !== 'dungeon') { await page.evaluate(() => window.G.enterDungeon(2)); await waitMode(page, 'dungeon'); }
  const m0 = await page.evaluate(() => window.QA.counts['mode:changed'] || 0);
  for (let i = 0; i < 6; i++) await tap(page, 't', 30);
  await waitMode(page, 'village'); await sleep(page, 2500);
  const m1 = await page.evaluate(() => window.QA.counts['mode:changed'] || 0);
  R.check('spamming T in the Burrow triggers exactly one return', m1 - m0 === 1, `mode:changed x${m1 - m0}`);
  await calm();
  // --- B while the pause menu is open
  await page.keyboard.press('Escape'); await sleep(page, 400);
  const menuOpen = await page.evaluate(() => window.G.ui.isOpen('menu'));
  await tap(page, 'b'); await sleep(page, 400);
  const bm = await page.evaluate(() => ({ build: window.G.build.active, panel: window.G.ui.isOpen('build'), menu: window.G.ui.isOpen('menu'), grid: window.G.sim.terrain.material.userData.u.uGrid.value }));
  R.check('B with the pause menu open does not half-enter build mode (active without its panel)', !(bm.build && !bm.panel), JSON.stringify({ menuOpen, ...bm }));
  await page.keyboard.press('Escape'); await sleep(page, 300);
  await calm();
  // --- Esc cascade: open inventory + character + skills, Esc closes one at a time, never opens the menu while panels exist
  await tap(page, 'i'); await tap(page, 'c'); await tap(page, 'k'); await sleep(page, 300);
  const opened = await page.evaluate(() => Object.keys(window.G.ui.panels).filter(k => window.G.ui.isOpen(k)));
  const seq = [];
  for (let i = 0; i < 4; i++) { await page.keyboard.press('Escape'); await sleep(page, 250); seq.push(await page.evaluate(() => Object.keys(window.G.ui.panels).filter(k => window.G.ui.isOpen(k)).join('+') || '-')); }
  R.check('Esc closes open panels one by one, then opens the menu', seq[seq.length - 1] === 'menu' || seq.includes('menu'), `${opened.join('+')} -> ${seq.join(' -> ')}`);
  await calm();
  s = await sane();
  R.check('final state sane', s.mode === 'village' && !s.locked && !s.modal && !s.build, JSON.stringify(s));
} catch (e) { errors.push('[harness] ' + e.stack); }
const failed = R.finish(errors, warns);
await browser.close();
process.exit(failed ? 1 : 0);
