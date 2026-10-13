// The look review for quests as moments (ROADMAP UX-2, docs/QUESTS.md): the quest card for a few quests and the place
// title on arrival, at the game camera, on the desktop (1920×1080, keys), the Steam Deck (1280×800: the Deck UI and a
// virtual pad), a phone (844×390, touch) and an iPad (1180×820, touch). Each card is closed the device's own way (Enter,
// the pad's A, a tap) and the shot is checked to have fitted (ui-audit-lib panelFit). Contact sheets per kind with
// tools/qa/sheet.py. Shots in tools/qa/tmp/ux2/ (SHOT_DIR).
// Checkpoint 2: Shadow's lines in place (the Burrow door, a floor's arrival, the boss in sight, the way home) and the
// hand-in's frames (near Rosie: the place title; F: her thanks with her hop and hearts; the reward flying; the stamp).
//   usage: node tools/qa/quest-shots.mjs [card] [place] [lines] [handin] [desktop] [deck] [phone] [ipad]   (none: all)
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { launch, boot, sleep, waitMode } from './lib.mjs';
import { launchTouch, PHONE, IPAD } from './touch-lib.mjs';
import { installPad, padTap } from './pad-lib.mjs';
import { panelFit, hudOverlap } from './ui-audit-lib.mjs';

const OUT = process.env.SHOT_DIR || path.resolve('tools/qa/tmp/ux2');
fs.mkdirSync(OUT, { recursive: true });
const args = process.argv.slice(2);
const ALLK = ['card', 'place', 'lines', 'handin'];
const KINDS = ALLK.filter(k => !args.some(a => ALLK.includes(a)) || args.includes(k));
const DEVS = ['desktop', 'deck', 'phone', 'ipad'].filter(d => !args.some(a => ['desktop', 'deck', 'phone', 'ipad'].includes(a)) || args.includes(d));
const CARDS = ['king', 'keroRod', 'umbrella', 'tasteTest'], ZONE_CARDS = ['tk_kome', 'tk_ledger'];
const shots = { card: [], place: [], lines: [], handin: [] }, problems = [];
let bad = 0;

async function open(dev) {
  if (dev === 'phone' || dev === 'ipad') { const D = dev === 'phone' ? PHONE : IPAD; const r = await launchTouch({ w: D.w, h: D.h, dpr: D.dpr, ua: D.ua }); return { ...r, touch: true }; }
  const r = dev === 'deck' ? await launch({ w: 1280, h: 800 }) : await launch({ w: 1920, h: 1080 });
  return r;
}

for (const dev of DEVS) {
  const S = await open(dev), { page, browser, errors } = S;
  const ev = (f, a) => page.evaluate(f, a);
  const shot = async (kind, name, label) => { const f = path.join(OUT, `${kind}-${dev}-${name}.png`); await page.screenshot({ path: f }); shots[kind].push([f, `${dev} · ${label}`]); return f; };
  try {
    await boot(page, `fresh&nointro&notut&qcard&hour=10${dev === 'deck' ? '&deck' : ''}`);
    if (dev === 'deck') { await installPad(page); await padTap(page, 'DDown'); await ev(() => { const G = window.G; if (G.ui.dlg.active) G.ui.dlg.finish(-1); }); await page.waitForFunction(() => !window.G.ui.dlg.active && !window.G.player.controlLocked, null, { timeout: 8000 }); } // (▼ is the pad's interact: a villager by the spawn may have started talking)
    // a game a little way in: the welcome done, the Burrow's first quests behind, Moka in the pack
    await ev(() => { const G = window.G, Q = G.state.quests; G.state.flags.hints = { all: true }; G.state.flags.burrowTut = true; G.state.flags.mokaJoined = true; Q.active = []; Q.done = ['welcome', 'burrow1', 'homes', 'lights']; Q.cards = []; G.ui.toasts?.retire?.(9); G.events.emit('quest:update'); });
    const quiet = () => page.waitForFunction(() => { const B = window.G.ui.banners; return !B?.busy && !B?.q?.length && !window.G.ui.iris?.active; }, null, { timeout: 15000 }).catch(() => {});
    // ---------------------------------------------------------------- the cards
    const card = async (id, tag) => {
      await quiet();
      await ev(id => { const G = window.G, Q = G.state.quests; Q.active = Q.active.filter(q => q.id !== id); Q.done = Q.done.filter(x => x !== id); G.ui.toasts?.retire?.(9); G.story.start(id); }, id);
      await page.waitForFunction(() => window.G.ui.isOpen('questCard') && !window.G.ui.panels.questCard.wrap.classList.contains('opening'), null, { timeout: 20000 });
      await sleep(page, 250);
      const title = await ev(() => document.querySelector('.p-qcard .qc-title')?.textContent);
      await shot('card', `${tag || id}`, title);
      for (const o of await ev(panelFit)) { problems.push(`${dev} card ${id}: ${o.sel} ${o.why}`); }
      // closed the device's way: Enter (keys), the pad's A (the focus starts on Let's go!), a tap (touch)
      if (dev === 'deck') await padTap(page, 'A');
      else if (S.touch) { const c = await ev(() => { const r = document.querySelector('.p-qcard .qc-go').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }); await S.F.tap(c[0], c[1]); }
      else await page.keyboard.press('Enter');
      const closed = await page.waitForFunction(() => !window.G.ui.isOpen('questCard'), null, { timeout: 5000 }).then(() => true, () => false);
      if (!closed) problems.push(`${dev} card ${id}: didn't close on ${dev === 'deck' ? 'A' : S.touch ? 'a tap' : 'Enter'}`);
      await ev(id => { const G = window.G, Q = G.state.quests; Q.active = Q.active.filter(q => q.id !== id); G.lead?.stop?.('qa'); if (G.lead) { G.lead.ask = null; G.lead.focus = null; } }, id);
    };
    if (KINDS.includes('card')) for (const id of CARDS) await card(id);
    // ---------------------------------------------------------------- the place titles
    const titled = async (kind, name, label) => {
      await page.waitForFunction(n => window.G.questMoments.stats.titles > n && window.G.ui.banners.live?.style === 'place', await ev(() => window.__t0 ?? 0), { timeout: 20000 });
      await sleep(page, 1300); // (the letters in, the brush drawn, the step line up)
      await shot('place', name, label);
      for (const o of await ev(hudOverlap)) if (/screen/.test(o.b)) problems.push(`${dev} place ${name}: ${o.a} off the screen`);
    };
    if (KINDS.includes('place')) {
      // Blossom Hollow: walking up to Kero (where he is now: the map's People lookup) with his quest at "Visit Kero"
      await quiet();
      await ev(() => { const G = window.G, Q = G.state.quests, k = G.npcs.find(n => n.id === 'kero'); Q.active = [{ id: 'keroRod', step: 0, prog: 0 }]; Q.cards = []; window.__t0 = G.questMoments.stats.titles; G.player.setPos(k.pos.x + 44, k.pos.z + 40); G.questMoments.placeTick(); });
      await sleep(page, 400);
      await ev(() => { const G = window.G, k = G.npcs.find(n => n.id === 'kero'); let p = null; for (const [dx, dz] of [[5, 6], [-5, 6], [6, -4], [-6, -4], [3, 3]]) if (G.world.walkable?.(k.pos.x + dx, k.pos.z + dz) !== false) { p = [k.pos.x + dx, k.pos.z + dz]; break; } p ||= [k.pos.x + 3, k.pos.z + 3]; G.player.setPos(p[0], p[1]); G.player.moveTarget = null; G.companion?.setPos?.(p[0] + 1, p[1] + 1); G.engine.rig.focus.copy(G.player.pos); G.engine.rig.snap(); });
      await titled('place', 'district', 'near Kero');
      // a den floor: the King of Squish on the Mossy Burrow's second floor
      await quiet();
      await ev(() => { const G = window.G, Q = G.state.quests; Q.active = [{ id: 'king', step: 0, prog: 0 }]; window.__t0 = G.questMoments.stats.titles; G.enterDungeon({ id: 'mossyBurrow', floor: 2 }); });
      await waitMode(page, 'dungeon');
      await titled('place', 'den', 'Mossy Burrow, floor 2');
    }
    // a zone: Takemori saved, the Missing Cook's card there, then the Bamboo Depths floor 2 with it, and Chiku's ledger
    // brought home to the village
    if (KINDS.includes('card') || KINDS.includes('place')) {
      await quiet();
      await ev(() => { const G = window.G; G.zoneDebug.saveVillage('bamboo'); G.state.quests.active = []; G.enterRegion('bamboo'); });
      await waitMode(page, 'dungeon'); await quiet();
      if (KINDS.includes('card')) for (const id of ZONE_CARDS) await card(id);
      if (KINDS.includes('place')) {
        await quiet();
        await ev(() => { const G = window.G, Q = G.state.quests; Q.active = [{ id: 'tk_kome', step: 0, prog: 0 }]; window.__t0 = G.questMoments.stats.titles; G.enterDungeon({ id: 'bambooDepths', floor: 2 }); });
        await waitMode(page, 'dungeon');
        await titled('place', 'zone-dungeon', 'Bamboo Depths, floor 2');
        await quiet();
        await ev(() => { const G = window.G, Q = G.state.quests; Q.active = [{ id: 'tk_ledger', step: 1, prog: 0 }]; window.__t0 = G.questMoments.stats.titles; G.enterRegion('bamboo'); });
        await waitMode(page, 'dungeon');
        await titled('place', 'zone', 'Takemori Village');
      }
    }
    // ---------------------------------------------------------------- Shadow's lines and the hand-in (checkpoint 2)
    if (KINDS.includes('lines') || KINDS.includes('handin')) {
      const said = (q, st, beat) => page.waitForFunction(([q, st, beat]) => window.G.questMoments.said.some(x => x[0] === q && x[1] === st && x[2] === beat), [q, st, beat], { timeout: 25000 });
      const atToast = () => page.waitForFunction(() => [...document.querySelectorAll('.toasts .toast')].some(t => /Shadow/.test(t.textContent) && !t.classList.contains('out')), null, { timeout: 4000 }).catch(() => {});
      await ev(() => { if (window.G.mode !== 'village') window.G.returnToVillage(); }); await waitMode(page, 'village', 60000); await quiet();
      await ev(() => { const G = window.G, Q = G.state.quests, r = G.state.dungeon.dens?.mossyBurrow; if (r) r.bestFloor = 0; /* (the place shots' visit to floor 2 would finish the floor step at once) */ Q.active = [{ id: 'king', step: 0, prog: 0 }]; Q.done = Q.done.filter(x => x !== 'king'); Q.cards = []; G.questMoments.said.length = 0; G.questMoments.lineQ = []; setInterval(() => { G.player.invuln = true; G.actions.restoreAll?.(); }, 250); const L = G.world.landmarks?.dungeon || { x: 178, z: 78 }; G.player.setPos(L.x + 2, L.z + 4); G.engine.rig.focus.copy(G.player.pos); G.engine.rig.snap(); });
      if (KINDS.includes('lines')) { await said('king', 0, 'door'); await atToast(); await sleep(page, 700); await shot('lines', 'door', 'the Burrow door'); }
      await ev(() => window.G.enterDungeon({ id: 'mossyBurrow', floor: 2 })); await waitMode(page, 'dungeon', 60000);
      if (KINDS.includes('lines')) { await said('king', 1, 'arrive'); await atToast(); await sleep(page, 700); await shot('lines', 'arrive', 'floor 2, arriving'); }
      await ev(() => { const G = window.G, D = G.dungeon, b = D.boss, C = G.combat; for (const m of [...D.monsters]) if (m.alive && m !== b) C.applyDamageToMonster(m, Math.ceil(m.life) + 1, { silent: true }); /* (the whole floor: a pack that chased you from the stairs would be a fight, and he never talks in one) */ { const cam = G.engine.camera, f = cam.position.clone(); cam.getWorldDirection(f); f.y = 0; f.normalize(); let put = null; for (const r of [11, 12, 10, 13]) for (const fw of [0, 2, -2, 4]) { const x = b.pos.x + f.z * r - f.x * fw, z = b.pos.z - f.x * r - f.z * fw; if (!put && G.world.walkable(x, z)) put = [x, z]; } if (put) G.player.setPos(put[0], put[1]); G.player.moveTarget = null; G.engine.rig.focus.copy(G.player.pos); G.engine.rig.snap(); } /* (the boss to the right on the screen, 11 m off: in sight, not yet noticing you at 9 m) */ });
      if (KINDS.includes('lines')) { await said('king', 1, 'boss'); await atToast(); await sleep(page, 300); /* (before he notices you: his card would take the frame) */ await shot('lines', 'boss', 'King Mochi in sight'); }
      await ev(() => { const G = window.G, b = G.dungeon.boss; G.combat.applyDamageToMonster(b, Math.ceil(b.life) + 1, {}); });
      await said('king', 2, 'home'); await atToast(); await sleep(page, 600);
      if (KINDS.includes('lines')) await shot('lines', 'home', 'the way home');
      if (KINDS.includes('handin')) {
        await ev(() => window.G.returnToVillage()); await waitMode(page, 'village', 60000); await quiet();
        // Rosie by her shop; walked up to: the title near her
        await ev(() => { const G = window.G, n = G.npcs.find(x => x.id === 'rosie'); G.player.setPos(n.pos.x + 40, n.pos.z + 34); });
        await sleep(page, 700);
        await ev(() => { const G = window.G, n = G.npcs.find(x => x.id === 'rosie'); window.__t0 = G.questMoments.stats.titles; G.player.setPos(n.pos.x + 2.2, n.pos.z + 2.2); G.player.moveTarget = null; G.engine.rig.focus.copy(G.player.pos); G.engine.rig.snap(); });
        await page.waitForFunction(() => window.G.questMoments.stats.titles > window.__t0 && window.G.ui.banners.live?.style === 'place', null, { timeout: 10000 }).catch(() => {});
        await sleep(page, 1400); await shot('handin', '1-title', 'near Rosie: the place title');
        await quiet();
        await ev(() => { const G = window.G, n = G.npcs.find(x => x.id === 'rosie'); G.player.setPos(n.pos.x + 1.1, n.pos.z + 0.7); G.player.faceTo(n.pos.x, n.pos.z); G.engine.rig.focus.copy(G.player.pos); G.engine.rig.snap(); G.talkTo(n); });
        await sleep(page, 300); await shot('handin', '2-hop', 'her happy hop and hearts');
        await page.waitForFunction(() => window.G.ui.dlg.active && !window.G.ui.dlg.typing, null, { timeout: 8000 }).catch(() => {});
        await sleep(page, 250); await shot('handin', '3-thanks', 'her thanks');
        for (let i = 0; i < 12 && await ev(() => window.G.ui.dlg.active); i++) { if (dev === 'deck') await padTap(page, 'A'); else if (S.touch) await S.F.tap(400, 200); else await page.keyboard.press('Enter'); await sleep(page, 180); }
        await sleep(page, 380); await shot('handin', '4-fly', 'the reward flying from her');
        await page.waitForFunction(() => !!document.querySelector('.banners .bn-stamp'), null, { timeout: 6000 }).catch(() => {});
        await sleep(page, 1300); await shot('handin', '5-stamp', 'the "Quest complete" stamp');
        await ev(() => window.G.ui.close('questCard'));
      }
    }
  } catch (e) { console.log(`!! ${dev}: ${String(e.message || e).split('\n')[0]}`); bad++; }
  if (errors.length) { console.log(`${dev} page errors:`, [...new Set(errors)].slice(0, 5).join('\n')); bad++; }
  await browser.close();
}
for (const k of KINDS) {
  if (!shots[k].length) continue;
  const list = path.join(OUT, `${k}-list.txt`);
  fs.writeFileSync(list, shots[k].map(([f, l]) => `${f}\t${l}`).join('\n'));
  const r = spawnSync('python', [path.resolve('tools/qa/sheet.py'), list, path.join(OUT, `sheet-${k}.png`), '4', '480'], { encoding: 'utf8' });
  console.log(r.stdout.trim() || r.stderr.trim());
}
for (const p of problems) console.log('  PROBLEM', p);
console.log(`${shots.card.length} card shots, ${shots.place.length} place shots; ${problems.length} problems. Shots: ${OUT}`);
process.exit(bad || problems.length ? 1 : 0);
