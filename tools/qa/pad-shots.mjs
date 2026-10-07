// Look review for the gamepad prompts and the aim ring (docs/CONTROLS.md §1–2), at the game camera with a virtual pad
// (tools/qa/pad-lib.mjs): the HUD's glyphs (Xbox and PlayStation), the interact prompt, the soft-lock ring in a Burrow
// fight, the hero wheel, dialogue choices, a guide line, the Controls panel.  usage: node tools/qa/pad-shots.mjs
// Writes PNGs to $SHOT_DIR (default ./shots-pad); W / H set the viewport (1280 × 800 for the Steam Deck).
import fs from 'node:fs';
import path from 'node:path';
import { launch, boot, sleep } from './lib.mjs';
import { installPad, padDown, padUp, padStick, padTap, padReset } from './pad-lib.mjs';

const OUT = process.env.SHOT_DIR || path.resolve('shots-pad');
fs.mkdirSync(OUT, { recursive: true });
const { browser, page, errors } = await launch({ w: +(process.env.W || 1600), h: +(process.env.H || 900) }); // (W=1280 H=800: the Steam Deck's screen)
const shot = async (name, clip) => { await page.screenshot({ path: path.join(OUT, name + '.png'), ...(clip ? { clip } : {}) }); console.log('saved', name); };
const rectOf = sel => page.evaluate(s => { const r = document.querySelector(s)?.getBoundingClientRect(); return r ? { x: Math.max(0, r.left - 24), y: Math.max(0, r.top - 30), width: Math.min(innerWidth - Math.max(0, r.left - 24), r.width + 48), height: Math.min(innerHeight - Math.max(0, r.top - 30), r.height + 60) } : null; }, sel);
try {
  await boot(page, 'fresh&nointro&notut&hour=10');
  await page.evaluate(() => { const G = window.G; G.state.flags.mokaJoined = true; G.state.flags.poeJoined = true; G.state.flags.hints = { all: true }; G.state.potions = { heart: 4, zoom: 3, rejuv: 1 }; G.state.player.hotbar = ['attack', 'chomp', 'packcall', 'blaze', 'decoy', 'moonhowl']; G.state.player.lvl = 20; for (const id of ['chomp', 'packcall', 'blaze', 'decoy', 'moonhowl']) G.state.player.skills[id] = 3; G.actions.recompute(); G.heroes.spawnBench?.(); G.ui.toasts?.retire?.(0); });
  await installPad(page);
  await padStick(page, 'left', 0, -0.5); await sleep(page, 300); await padStick(page, 'left', 0, 0);
  await sleep(page, 600);
  await shot('hud-xbox');
  const hb = await rectOf('.hud .dock'); if (hb) await shot('hud-xbox-hotbar', hb);
  const mb = await rectOf('.hud .menubtns'); if (mb) await shot('hud-xbox-menubtns', mb);
  // the interact prompt next to Rosie
  await page.evaluate(() => { const G = window.G, R = G.npcs.find(n => n.id === 'rosie'); R.talking = false; G.player.setPos(R.pos.x + 0.9, R.pos.z + 0.4); G.player.faceTo(R.pos.x, R.pos.z); G.engine.rig.focus.copy(G.player.pos); G.engine.rig.snap(); });
  await sleep(page, 700);
  await shot('prompt-a');
  const pr = await rectOf('.hud .prompt'); if (pr) await shot('prompt-a-crop', pr);
  // dialogue choices, picked with the D-pad
  await padTap(page, 'A'); await sleep(page, 900);
  for (let i = 0; i < 12; i++) { const s = await page.evaluate(() => ({ a: window.G.ui.dlg.active, ch: !!window.G.ui.dlg.$.ch.querySelector('.dch'), typing: window.G.ui.dlg.typing })); if (!s.a || s.ch) break; await padTap(page, 'A'); await sleep(page, 350); }
  await padTap(page, 'DDown'); await sleep(page, 300);
  await shot('dialogue-choices');
  await padTap(page, 'B'); await sleep(page, 700);
  for (let i = 0; i < 6 && await page.evaluate(() => window.G.ui.dlg.active); i++) { await padTap(page, 'B'); await sleep(page, 300); }
  // a guide line with keys in it
  await page.evaluate(() => { const T = window.G.ui.tutorial; T.step({ n: 2, total: 6, title: 'Fishing with Kero', objective: 'Face the water and press *F* to cast' }); T.say('kero', 'Hold *F* to lift the green zone. Tap *Tab* for the next hero, *Shift* to sprint.'); });
  await sleep(page, 700);
  const tut = await rectOf('.tut-dock'); if (tut) await shot('guide-glyphs', tut);
  await page.evaluate(() => window.G.ui.tutorial.hide());
  // the hero wheel (LB held, the right stick points)
  await padDown(page, 'LB'); await sleep(page, 450); await padStick(page, 'right', 0.9, 0.3); await sleep(page, 350);
  await shot('hero-wheel');
  await padStick(page, 'right', 0, 0); await page.evaluate(() => { window.G.heroes.pickFromWheel(null); }); await padUp(page, 'LB'); await sleep(page, 400);
  // the Controls panel, the controller tab
  await padTap(page, 'Menu'); await sleep(page, 500);
  await shot('menu-quick');
  await page.evaluate(() => { const M = window.G.ui.panels.menu; M.setView('controls'); });
  await sleep(page, 600);
  const mp = await rectOf('.p-menu'); await shot('controls-pad', mp);
  await page.evaluate(() => { const M = window.G.ui.panels.menu; M.dev = 'kbm'; M.renderControls(); }); await sleep(page, 300);
  await shot('controls-kbm', await rectOf('.p-menu'));
  await padTap(page, 'Menu'); await sleep(page, 400);
  // CT-2: the focus ring in the bag (a compare tooltip), the skill trees, Rosie's shop; build and decorate's cursor
  await page.evaluate(async () => { const G = window.G, I = await import('/src/rpg/items.js'); for (const o of [{ ilvl: 4, rarity: 'magic', slot: 'hat' }, { ilvl: 4, rarity: 'rare', slot: 'boots' }, { ilvl: 3, rarity: 'normal', slot: 'charm' }, { ilvl: 5, rarity: 'magic', slot: 'outfit' }]) G.actions.pickup(I.generateItem(o)); G.state.player.skillPts = 3; G.actions.recompute(); G.ui.toasts?.retire?.(0); });
  await page.evaluate(() => window.G.ui.toggle('inventory', { view: 'bag' })); await sleep(page, 600);
  await padTap(page, 'DRight'); await sleep(page, 350);
  await shot('ct2-inventory');
  await padTap(page, 'A'); await padTap(page, 'DDown'); await padTap(page, 'DRight'); await sleep(page, 300);
  await shot('ct2-inventory-held');
  await padTap(page, 'B'); await padTap(page, 'B'); await sleep(page, 300);
  await page.evaluate(() => window.G.ui.toggle('skills')); await sleep(page, 600); await padTap(page, 'DDown'); await sleep(page, 350);
  await shot('ct2-skills');
  await padTap(page, 'B'); await sleep(page, 300);
  await page.evaluate(() => { window.G.state.coins = 999; window.G.openShop(); }); await sleep(page, 700); await padTap(page, 'DRight'); await sleep(page, 350);
  await shot('ct2-shop');
  await padTap(page, 'B'); await sleep(page, 400);
  await page.evaluate(() => { const G = window.G; G.state.materials.wood = 99; G.state.coins = 999; G.build.enter(); }); await sleep(page, 900);
  for (let i = 0; i < 6 && (await page.evaluate(() => document.querySelector('.p-build .bd-tabs .tab.on')?.dataset.c)) !== 'decor'; i++) { await padTap(page, 'DDown'); await sleep(page, 120); }
  await padTap(page, 'DRight'); await sleep(page, 200); await padStick(page, 'left', 0.5, -0.3); await sleep(page, 300); await padStick(page, 'left', 0, 0); await sleep(page, 400);
  await shot('ct2-build-cursor');
  await padTap(page, 'B'); await padTap(page, 'B'); await sleep(page, 500);
  await page.evaluate(() => window.G.openHome()); await page.waitForFunction(() => window.G.mode === 'interior' && !window.G.ui.iris.active, null, { timeout: 15000 }); await sleep(page, 900);
  await page.evaluate(async () => { const F = (await import('/src/home/furniture.js')).FURNITURE; const id = Object.keys(F).find(k => F[k].mount === 'floor' && F[k].size?.[0] === 1) ; window.G.actions.addFurniture(id, 2); window.G.housing.decor.enter(); });
  await sleep(page, 800); await padTap(page, 'DRight'); await sleep(page, 200); await padStick(page, 'left', 0.3, 0.2); await sleep(page, 260); await padStick(page, 'left', 0, 0); await sleep(page, 400);
  await shot('ct2-decorate-cursor');
  await padTap(page, 'B'); await padTap(page, 'B'); await sleep(page, 400);
  await page.evaluate(() => window.G.housing.exit?.()); await page.waitForFunction(() => window.G.mode === 'village' && !window.G.ui.iris.active, null, { timeout: 15000 }); await sleep(page, 500);
  // a Burrow fight: the soft lock and its ring, at the game camera
  await page.evaluate(() => window.G.enterDungeon(1));
  await page.waitForFunction(() => window.G.mode === 'dungeon' && !window.G.ui.iris.active && window.G.dungeon?.monsters?.length, null, { timeout: 30000 });
  await sleep(page, 900);
  await page.evaluate(() => {
    const G = window.G, P = G.player, D = G.dungeon;
    for (const m of D.monsters) { m.status.stun = 999; }
    const ms = D.monsters.filter(m => m.alive).sort((a, b) => a.pos.distanceTo(P.pos) - b.pos.distanceTo(P.pos));
    const m = ms[0]; if (!m) return;
    // stand 4 m from it, the camera's lower half
    const { f } = G.engine.rig.groundAxes();
    P.setPos(m.pos.x - f.x * 4, m.pos.z - f.z * 4); P.faceTo(m.pos.x, m.pos.z); P.facing = P.faceTarget;
    G.engine.rig.focus.copy(P.pos); G.engine.rig.snap();
  });
  await padStick(page, 'right', 0, -0.8); await sleep(page, 500);
  const lk = await page.evaluate(() => { const G = window.G, L = G.padAim.lock; if (!L) return null; const v = L.pos.clone(); v.project(G.engine.camera); return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight, name: L.name }; });
  console.log('lock', JSON.stringify(lk));
  await shot('aim-ring-game');
  if (lk) await shot('aim-ring-crop', { x: Math.max(0, lk.x - 220), y: Math.max(0, lk.y - 200), width: 440, height: 340 });
  await padStick(page, 'right', 0, 0);
  // PlayStation glyphs
  await padReset(page);
  await page.evaluate(() => { window.__pad.id = 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)'; });
  await padTap(page, 'DUp'); await sleep(page, 500);
  const hb2 = await rectOf('.hud .dock'); if (hb2) await shot('hud-ps-hotbar', hb2);
} finally {
  if (errors.length) console.log('page errors:', [...new Set(errors)].slice(0, 10).join('\n'));
  await browser.close();
}
