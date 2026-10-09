// Scenario 16: the guided tutorials (docs/TUTORIALS.md), each end to end through real keys and clicks.
//  a) QA sessions (?nointro without ?tut) never start one; with ?tut the director is on
//  b) the house tour (Shadow): after Rosie's welcome → the cottage door (3D arrow, edge arrow / minimap target) → F (the
//     prompt spotlit) → inside the cottage (the arrow on the chest, the bed, the stove, the door mat) → out through the
//     mat → the garden (Shadow's seeds) → till, plant, water → P → wrap-up
//  c) switching heroes (Moka): after her join → Tab (the switch button spotlit) → her spells, find Chewy → Tab back → wrap
//     (Shadow's old Tab tip retired)
//  d) fishing (Kero): after he gives the rod → the bank spot → cast (prompt spotlit) → an early press is forgiven → the
//     sure bite (the big "!" and "NOW!" at the float, a 2 s window) → the reel coach callouts → the catch (it always
//     lands) → J → Fish Log → wrap
//  e) a missed bite in the guide brings the fish back (R-12: no recast); Skip; the Journal's Guides tab replays a guide
//  f) a reload mid-guide resumes it; an old save past a guide's start gets a one-time offer (accept / decline)
//  g) the cozy path (docs/COZY.md §11): Rosie's "Go yourself, or send Moka?" after the house tour → Send Moka → the
//     Board guide (the board's arrow, F, the job card, Moka's card, Send off!, Away, the chip) → Shadow's Nose (a gather,
//     the sniffed-out dig spot, hold F in the gold, the materials) → Moka back: the chip, the report → Rosie's thank-you
//  h) "I'll go myself": the Nose only, its lines in the keys', the pad's and touch's words; a fighter's first look at
//     the board offers the Board guide
//  i) the Guild built → Old Hachi's guide (the door, sign one on, the roster card, the board inside, a crew of two, wages)
//  j) Peaceful paths (Shadow's tip and the minimap spotlit on the first visit to a saved zone); old saves get the three
//     new guides as offers (past). S16_ONLY=gh runs just those sections (a–f run together).
// SHOTS=<dir> saves screenshots of the key moments.
import path from 'node:path';
import { launch, boot, sleep, waitMode, makeReport, drainDialogue, tap, installProbes, BASE } from './lib.mjs';

// HOUR=22 runs it at night (Kero is then tucked up indoors when the fishing guide starts, instead of off on a walk)
const HOUR = +(process.env.HOUR || 10), NIGHT = HOUR >= 21 || HOUR < 6;
const R = makeReport(`S16 guided tutorials (${HOUR}:00)`);
const { browser, page, errors, warns } = await launch({ w: 1600, h: 900 });
const G = (fn, arg) => page.evaluate(fn, arg);
const SHOTS = process.env.SHOTS;
const snap = async n => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'tut_' + n + '.png') }); };
const T = () => G(() => { const t = window.G.tutorials; return { active: t.active, step: t.cur?.step?.id || null, paused: t.paused, spot: document.querySelector('.tut')?.classList.contains('spot'), dock: document.querySelector('.tut')?.classList.contains('on'), say: document.querySelector('.ts-tx')?.textContent || '', obj: document.querySelector('.to-tx')?.textContent || '', n: document.querySelector('.to-n')?.textContent || '' }; });
const stepIs = (id, step, timeout = 15000) => page.waitForFunction(([id, step]) => window.G.tutorials.active === id && window.G.tutorials.cur?.step?.id === step && window.G.tutorials.cur.entered && !window.G.tutorials.paused, [id, step], { timeout });
const keyF = async () => { await G(() => { window.G.interactCooldown = 0; }); await tap(page, 'f', 70); };
const ringOn = sel => G(sel => { const r = document.querySelector('.tut-spot').getBoundingClientRect(), e = document.querySelector(sel); if (!e || !document.querySelector('.tut').classList.contains('spot')) return false; const b = e.getBoundingClientRect(); return Math.abs((r.left + r.width / 2) - (b.left + b.width / 2)) < 6 && Math.abs((r.top + r.height / 2) - (b.top + b.height / 2)) < 6; }, sel);
const clickSel = sel => G(sel => { const e = document.querySelector(sel); e?.click(); return !!e; }, sel);
const setup = (cozy = false) => G(cozy => { const G = window.G, F = G.state.flags; G.sim.tickT = -1e9; clearInterval(window.__freeze); window.__freeze = setInterval(() => { G.sim.tickT = -1e9; }, 200); F.hints = { garden: 1, build: 1, travel: 1, skills: 1, stats: 1, loot: 1, potion: 1 };
  // (sections a–f: the cozy path's three guides and Rosie's burrow1 question stay out of the way; g–j run them)
  if (!cozy) { const S = F.tutorials ||= {}; for (const id of ['board', 'nose', 'guild']) S[id] ||= { done: true, skipped: true }; F.burrowChoice ||= 'self'; } }, cozy);
const ONLY = process.env.S16_ONLY || ''; // (S16_ONLY=gh: just those sections; a–f run together)
try {
  if (!ONLY || /[a-f]/.test(ONLY)) {
  // ---------------------------------------------------------------- a) QA sessions stay quiet
  await boot(page, `fresh&nointro&hour=${HOUR}`);
  await G(() => window.G.story.markTalk('rosie')); await sleep(page, 3000);
  const q = await G(() => ({ en: window.G.tutorials.enabled, active: window.G.tutorials.active, rec: window.G.state.flags.tutorials }));
  R.check('a QA session (?nointro) never starts a guide, even past its start', !q.en && !q.active && !Object.keys(q.rec || {}).filter(k => k !== 'active').length, JSON.stringify(q));

  // ---------------------------------------------------------------- b) the house tour
  await boot(page, `fresh&nointro&tut&hour=${HOUR}`); await setup();
  const t0 = await G(() => ({ en: window.G.tutorials.enabled, active: window.G.tutorials.active }));
  await G(() => window.G.story.markTalk('rosie'));
  await stepIs('house', 'door', 20000); await sleep(page, 900);
  const door = await T();
  const tgt = await G(() => { const G = window.G, q = G.questTarget(), A = G.world.scene.getObjectByName('tutorial:arrow'), d = G.heroes.homeDoor(); return { kind: q?.kind, onDoor: q && Math.hypot(q.pos.x - d.x, q.pos.z - d.z) < 0.1, arrow: !!A?.visible, at: A && Math.hypot(A.position.x - d.x, A.position.z - d.z) < 0.1 }; });
  await snap('house_door');
  await G(() => { const G = window.G, d = G.heroes.homeDoor(), P = G.player, { f, r } = G.engine.rig.groundAxes(); P.setPos(d.x - f.x * 5 + r.x * 2, d.z - f.z * 5 + r.z * 2); P.faceTo(d.x, d.z); P.facing = P.faceTarget; P.moveTarget = null; G.engine.rig.focus?.copy(P.pos); G.engine.rig.snap?.(); }); // (the door a few steps up-screen)
  await sleep(page, 900); await snap('house_arrow');
  R.check("Rosie's welcome done → Shadow's house tour: speech, objective 1/9, a 3D arrow at the cottage door (the quest pointer and minimap follow it)", t0.en && !t0.active && door.dock && /home/i.test(door.say) && door.n === '1/9' && /Cottage/.test(door.obj) && tgt.kind === 'tut' && tgt.onDoor && tgt.arrow && tgt.at, JSON.stringify({ t0, door, tgt }));
  await G(() => { const G = window.G, d = G.heroes.homeDoor(), P = G.player; P.setPos(d.x + 1.1, d.z + 0.2); P.faceTo(d.x, d.z); P.facing = P.faceTarget; P.moveTarget = null; });
  await stepIs('house', 'enter'); await sleep(page, 700);
  const enter = { ...(await T()), ring: await ringOn('.hud .prompt.show') };
  await snap('house_enter');
  R.check('at the door: "Press F" with the interaction prompt spotlit', /F/.test(enter.obj) && enter.ring, JSON.stringify(enter));
  await keyF();
  await stepIs('house', 'inside', 12000);
  const seen = [];
  for (let i = 0; i < 4; i++) { // (the cottage's household jobs are furniture now: docs/HOUSING.md §1)
    await sleep(page, 1500);
    const s = await G(() => { const G = window.G, q = G.questTarget(), it = q && G.world.interactables.find(i => Math.hypot(i.pos.x - q.pos.x, i.pos.z - q.pos.z) < 0.05), A = G.world.scene.getObjectByName('tutorial:arrow'); return { mode: G.mode, use: it?.use || (it?.door ? 'door' : null), label: q?.label || null, arrow: !!A?.visible && A.parent === G.world.scene, say: document.querySelector('.ts-tx').textContent }; });
    seen.push(s); if (i === 0) await snap('house_inside');
    await sleep(page, 1700);
  }
  R.check('inside the cottage: Shadow points the arrow at the treasure chest, the bed and the stove in turn, then the door mat', seen.some(s => s.use === 'stash' && /shared/.test(s.say)) && seen.some(s => s.use === 'sleep' && /income/.test(s.say)) && seen.some(s => s.use === 'cook' && /stove/.test(s.say)) && seen.some(s => s.use === 'door') && seen.every(s => s.mode === 'interior' && s.arrow), JSON.stringify(seen));
  await G(() => { const G = window.G, m = G.world.interactables.find(i => i.door); G.player.setPos(m.pos.x, m.pos.z); G.player.moveTarget = null; });
  await sleep(page, 300); await keyF(); // (out through the door mat)
  await stepIs('house', 'garden', 12000);
  await sleep(page, 300); await snap('house_garden');
  const gift = await G(() => ({ seeds: window.G.state.pantry.turnipSeed || 0, flag: !!window.G.state.flags.shadowSeeds, say: document.querySelector('.ts-tx').textContent }));
  R.check("the garden: with no seeds, Shadow's housewarming gift of 3 turnip seeds (once)", gift.seeds === 3 && gift.flag && /3 turnip seeds/.test(gift.say), JSON.stringify(gift));
  await G(() => { const P = window.G.player; P.setPos(93.5, 127.45); P.faceTarget = P.facing = 0; P.moveTarget = null; });
  await stepIs('house', 'till'); await sleep(page, 500); await snap('house_till');
  const idle = () => page.waitForFunction(() => !window.G.life.tools.busy, null, { timeout: 6000 }).then(() => sleep(page, 250));
  await keyF(); await stepIs('house', 'plant', 6000); await idle();
  await G(() => window.G.actions.addPantry('carrotSeed', 1, { silent: true })); // (two kinds of seed: F opens the picker)
  await keyF(); await page.waitForFunction(() => window.G.ui.isOpen('seeds'), null, { timeout: 4000 });
  await sleep(page, 300); const pickRing = await ringOn('.p-seeds .sp-card.on'); await snap('house_plant');
  await page.keyboard.press('Digit' + await G(() => [...document.querySelectorAll('.sp-card')].findIndex(c => c.dataset.id === 'turnipSeed') + 1));
  await stepIs('house', 'water', 6000); await idle();
  await keyF(); await stepIs('house', 'pantry', 6000); await idle();
  const pRing = await ringOn('.hud .mb[data-open="pantry"]'); await snap('house_pantry');
  const gd = await G(() => { const g = window.G.life.garden, i = g.beds[0].tiles.find(i => g.rec(i)?.crop); return { crop: g.rec(i)?.crop, wet: !!g.rec(i)?.wet }; });
  R.check('till, plant (the seed card spotlit), water through F; then the Pantry button is spotlit', gd.crop === 'turnip' && gd.wet && pickRing && pRing, JSON.stringify({ gd, pickRing, pRing }));
  await page.keyboard.press('KeyP'); await stepIs('house', 'wrap', 5000); await sleep(page, 600);
  const wrap = await G(() => { const G = window.G, q = G.questTarget(); return { stall: q && Math.hypot(q.pos.x - G.seedStall.pos.x, q.pos.z - G.seedStall.pos.z) < 0.1, ok: getComputedStyle(document.querySelector('.to-ok')).display !== 'none', say: document.querySelector('.ts-tx').textContent }; });
  await snap('house_wrap');
  await clickSel('.to-ok'); await sleep(page, 600);
  const hd = await G(() => ({ rec: window.G.state.flags.tutorials.house, active: window.G.tutorials.active, dock: document.querySelector('.tut').classList.contains('on'), toast: window.QA.toasts.some(t => /Guide complete/.test(t)) }));
  R.check("P opens the Pantry; the wrap-up points at Usagi's stall; Got it! finishes the tour", wrap.stall && wrap.ok && /Usagi/.test(wrap.say) && hd.rec.done && !hd.rec.skipped && !hd.active && !hd.dock && hd.toast, JSON.stringify({ wrap, hd }));
  await G(() => window.G.ui.closeAll()); await sleep(page, 400);

  // ---------------------------------------------------------------- c) switching heroes
  await G(() => { const G = window.G, v = G.heroes.villagers.moka; G.player.setPos(v.pos.x + 1.2, v.pos.z); G.heroes.talk(v); });
  await sleep(page, 400); await drainDialogue(page, [0]); await sleep(page, 400);
  await stepIs('switch', 'tab', 15000); await sleep(page, 700);
  const s1 = { ...(await T()), ring: await ringOn('.hud .hsw') };
  await snap('switch_tab');
  R.check("Moka joins → her guide: \"Press Tab\" with the hero switch button spotlit", /Tab/.test(s1.say) && s1.ring && s1.n === '1/4', JSON.stringify(s1));
  await tap(page, 'Tab', 80);
  await stepIs('switch', 'spells', 12000); await sleep(page, 700);
  const s2 = await G(() => { const G = window.G, q = G.questTarget(), c = G.heroes.villagers.chewy; return { hero: G.state.activeHero, say: document.querySelector('.ts-tx').textContent, onChewy: q && c && Math.hypot(q.pos.x - c.pos.x, q.pos.z - c.pos.z) < 0.1 }; });
  await snap('switch_spells');
  R.check('Tab switches to Moka; she names her real mouse binds and points at Chewy in town', s2.hero === 'moka' && /Splash Bolt/.test(s2.say) && s2.onChewy, JSON.stringify(s2));
  await G(() => { const G = window.G, c = G.heroes.villagers.chewy; c.frozen = true; G.player.setPos(c.pos.x + 1.6, c.pos.z + 0.5); G.player.moveTarget = null; });
  await stepIs('switch', 'back', 8000); await sleep(page, 2600);
  const s3 = { ...(await T()), ring: await ringOn('.hud .hsw'), skip: await G(() => getComputedStyle(document.querySelector('.to-step')).display !== 'none') };
  await snap('switch_back');
  await tap(page, 'Tab', 80);
  await stepIs('switch', 'wrap', 12000); await sleep(page, 500);
  const s4 = await G(() => ({ hero: window.G.state.activeHero, say: document.querySelector('.ts-tx').textContent }));
  await clickSel('.to-ok'); await sleep(page, 500);
  const s5 = await G(() => ({ rec: window.G.state.flags.tutorials.switch, tip: !!window.G.state.flags.hints.tabSwitch }));
  R.check('switch back (the swirl spotlit, the step skippable); the wrap-up: shared bag, class weapons, own levels, per-hero Well Fed; the old Tab tip retired', s3.ring && s3.skip && s4.hero === 'chewy' && /bag/.test(s4.say) && /staff/.test(s4.say) && /Well Fed/.test(s4.say) && s5.rec.done && s5.tip, JSON.stringify({ s3, s4, s5 }));

  // ---------------------------------------------------------------- d) fishing with Kero
  await G(() => { const G = window.G; G.day.day = 2; G.story.start('keroRod', true); const k = G.npcs.find(n => n.id === 'kero'); k.frozen = true; G.player.setPos(k.pos.x + 1.2, k.pos.z); G.story.talk(k); });
  await G(() => { window.G.tutorials.trigT = 9; }); // (hold the guide's trigger poll for a moment: the test moves Kero first)
  await sleep(page, 400); await drainDialogue(page);
  // Kero carries on with his day before the guide starts: off on a walk 35 m away (by day), or in bed indoors (at night)
  const away = await G(night => {
    const G = window.G, k = G.npcs.find(n => n.id === 'kero'), W = G.world; k.frozen = false; k.talking = false;
    if (night) { k.tuckIn(true); return { inside: !k.visible, state: k.state }; }
    for (let a = 0; a < 6.28; a += 0.3) { const x = 142 + Math.cos(a) * 35, z = 146 + Math.sin(a) * 35; if (W.walkable(x, z) && !W.collision.solidAt(x, z, 0.4)) { k.setPos(x, z); return { x, z }; } }
    return null;
  }, NIGHT);
  await G(() => { const G = window.G, P = G.player; P.setPos(150, 158); P.moveTarget = null; }); // (Chewy a little way off the pond)
  await G(() => { window.G.tutorials.trigT = 0; });
  await stepIs('fishing', 'walk', 15000); await sleep(page, 2600);
  const f1 = await G(() => { const G = window.G, s = G.tutorials.data.spot, k = G.npcs.find(n => n.id === 'kero'), q = G.questTarget(), F = G.life.fishing; return { rod: G.state.fishing.rod, s, nearKero: +Math.hypot(s.x - k.pos.x, s.z - k.pos.z).toFixed(2), keroDry: !F.water(k.pos.x, k.pos.z), keroVisible: k.visible, claimed: !!k.tutClaim, frozen: k.frozen, onSpot: q && Math.hypot(q.pos.x - s.x, q.pos.z - s.z) < 0.1, scanOk: !!F.scanAt(s.x, s.z, s.face), say: document.querySelector('.ts-tx').textContent }; });
  await snap('fish_walk');
  R.check(`Kero's rod → his fishing guide: Kero leaves his day (${NIGHT ? 'out of bed at night' : 'back from 35 m away'}) and stands beside the marked bank spot`, f1.rod === 1 && !!away && f1.onSpot && f1.scanOk && f1.nearKero < 2.2 && f1.keroDry && f1.keroVisible && f1.claimed && /bank/.test(f1.say), JSON.stringify({ away, f1 }));
  await G(() => { const G = window.G, s = G.tutorials.data.spot, P = G.player; P.setPos(s.x, s.z); P.facing = P.faceTarget = s.face; P.moveTarget = null; });
  await stepIs('fishing', 'cast'); await sleep(page, 600);
  const f2 = { ...(await T()), ring: await ringOn('.hud .prompt.show') };
  await snap('fish_cast');
  R.check('on the bank: "press F to cast" with the prompt spotlit', /cast/.test(f2.obj) && f2.ring, JSON.stringify(f2));
  await keyF(); await stepIs('fishing', 'wait', 6000); await sleep(page, 900);
  await tap(page, 'f', 50); await sleep(page, 300);
  const f3 = await G(() => ({ s: window.G.life.fishing.s?.phase || null, say: document.querySelector('.ts-tx').textContent }));
  R.check('pressing too early during the first wait gets a gentle tip, and the fish stays', f3.s === 'wait' && /Patience|nibble/.test(f3.say), JSON.stringify(f3));
  await stepIs('fishing', 'bite', 8000); await sleep(page, 250);
  const f4 = await G(() => ({ win: window.G.life.fishing.s?.window, fish: window.G.life.fishing.s?.fish, cue: !!document.querySelector('.fish-cue.show .fc-in.bite'), txt: document.querySelector('.fish-cue .fc-t b')?.textContent, flash: document.querySelector('.tut-flash')?.classList.contains('on') }));
  await snap('fish_now');
  R.check('the sure bite (~3 s): a big "!" and "NOW!" at the float itself (R-12: no flash in the middle of the screen over it) and a widened 2 s window', f4.cue && f4.txt === 'NOW!' && !f4.flash && f4.win === 2 && f4.fish === 'crucian', JSON.stringify(f4));
  await tap(page, 'f', 40);
  await stepIs('fishing', 'reel', 4000); await sleep(page, 900);
  const f5 = await G(() => [...document.querySelectorAll('.tut-call')].map(c => ({ t: c.textContent, vis: getComputedStyle(c).opacity === '1' })));
  await snap('fish_reel');
  R.check('the reel: coach callouts at the zone, the fish and the meter', f5.length === 3 && f5.every(c => c.vis) && /zone/.test(f5[0].t) && /meter/i.test(f5[2].t), JSON.stringify(f5));
  await G(() => { // hold F the way a player would: lift when the fish is above the zone's middle
    const key = v => window.dispatchEvent(new KeyboardEvent(v ? 'keydown' : 'keyup', { code: 'KeyF', key: 'f' }));
    let held = false; clearInterval(window.__bot);
    window.__bot = setInterval(() => { const s = window.G.life.fishing.s, S = s?.phase === 'reel' && s.sim; const want = !!S && S.f > S.z + S.zh * 0.5 + S.v * 0.28; if (want) key(true); else if (held) key(false); held = want; }, 16);
  });
  const f6k = await G(() => { const G = window.G, s = G.tutorials.data.spot, k = G.npcs.find(n => n.id === 'kero'); return +Math.hypot(s.x - k.pos.x, s.z - k.pos.z).toFixed(2); }); // (still beside the spot through the reel)
  await stepIs('fishing', 'log', 25000); await sleep(page, 700);
  const f6 = { ring: await ringOn('.hud .mb[data-open="quests"]'), crucian: await G(() => window.G.state.fishLog?.crucian?.n || 0), keroStay: f6k };
  await page.keyboard.press('KeyJ'); await sleep(page, 700);
  const f7 = await ringOn('.p-quests .q-tabs .tab[data-t="fish"]'); await snap('fish_log');
  await clickSel('.p-quests .q-tabs .tab[data-t="fish"]');
  await stepIs('fishing', 'wrap', 5000); await sleep(page, 500);
  await clickSel('.to-ok'); await sleep(page, 500);
  const f8 = await G(() => ({ rec: window.G.state.flags.tutorials.fishing, tut: window.G.life.fishing.tut, quest: window.G.story.Q.active.find(q => q.id === 'keroRod')?.prog, kero: (k => ({ claimed: !!k.tutClaim, frozen: k.frozen }))(window.G.npcs.find(n => n.id === 'kero')) }));
  R.check('the catch → J (Journal button spotlit) → Fish Log tab (spotlit) → wrap-up; Kero stayed beside the spot through the reel and goes back to his day; normal fishing again', f6.ring && f6.crucian === 1 && f7 && f8.rec.done && f8.tut === null && f8.quest === 1 && f6.keroStay < 2.2 && !f8.kero.claimed && !f8.kero.frozen, JSON.stringify({ f6, f7, f8 }));
  await G(() => { clearInterval(window.__bot); window.G.ui.closeAll(); }); await sleep(page, 400);

  // ---------------------------------------------------------------- e) a missed bite loops; replay from the Guides tab; Skip
  await page.keyboard.press('KeyJ'); await sleep(page, 500);
  await clickSel('.p-quests .q-tabs .tab[data-t="guides"]'); await sleep(page, 500);
  const gl = await G(() => [...document.querySelectorAll('.gd-card')].map(c => c.className.replace('gd-card ', '') + ':' + c.querySelector('b').textContent));
  await snap('guides');
  await clickSel('.gd-card [data-play="fishing"]');
  await page.waitForFunction(() => window.G.tutorials.active === 'fishing' && ['walk', 'cast'].includes(window.G.tutorials.cur?.step?.id), null, { timeout: 8000 });
  await G(() => { const G = window.G, s = G.tutorials.data.spot, P = G.player; P.setPos(s.x, s.z); P.facing = P.faceTarget = s.face; });
  await stepIs('fishing', 'cast'); await sleep(page, 400); await keyF(); await stepIs('fishing', 'bite', 10000);
  await sleep(page, 2400);
  const miss = { ...(await T()), phase: await G(() => window.G.life.fishing.s?.phase || null) };
  // (the housing guides, Make it home and Remodel, are listed too: tools/qa/s17-housing.mjs runs them; Hold to power up!: s19-charge; and Meet Poe: s20-poe)
  R.check('the Guides tab lists all twelve (the first three done ✓) and replays one; a missed bite in the guide brings the fish back (no recast) with a kind word', gl.length === 12 && ['Two heroes', 'Home, sweet home', 'Fishing with Kero'].every(t => gl.some(x => /^done/.test(x) && x.endsWith(t))) && miss.step === 'wait' && miss.phase === 'wait' && /slow|back/i.test(miss.say), JSON.stringify({ gl, miss }));
  await clickSel('.to-skip'); await sleep(page, 400);
  const sk = await G(() => ({ active: window.G.tutorials.active, rec: window.G.state.flags.tutorials.fishing, tut: window.G.life.fishing.tut, dock: document.querySelector('.tut').classList.contains('on'), toast: window.QA.toasts.some(t => /Guide skipped/.test(t)) }));
  R.check('Skip ends the guide at once (normal fishing restored) and says where to replay it', !sk.active && sk.rec.skipped && sk.tut === null && !sk.dock && sk.toast, JSON.stringify(sk));
  await page.keyboard.down('KeyA'); await sleep(page, 120); await page.keyboard.up('KeyA'); await sleep(page, 300); // (the line from that cast is still out: reel it in)

  // ---------------------------------------------------------------- f) reload mid-guide; the old-save offer
  await G(() => window.G.tutorials.start('switch', { replay: true }));
  await stepIs('switch', 'tab', 8000);
  await tap(page, 'Tab', 80); await stepIs('switch', 'spells', 12000); await sleep(page, 400);
  await G(() => window.G.save());
  await page.goto(`${BASE}/?notitle`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true && window.G?.player, null, { timeout: 90000 }); await installProbes(page); await setup();
  await stepIs('switch', 'spells', 15000);
  const rl = await G(() => ({ hero: window.G.state.activeHero, n: document.querySelector('.to-n').textContent }));
  R.check('a reload mid-guide resumes it at the same step (Moka still in play)', rl.hero === 'moka' && rl.n === '2/4', JSON.stringify(rl));
  await clickSel('.to-skip'); await sleep(page, 300);
  // an old save: past every guide's start, with no tutorial records
  await G(() => { const G = window.G; delete G.state.flags.tutorials; G.state.flags.mokaJoined = true; G.state.fishing.rod = 1; G.save(); });
  await page.goto(`${BASE}/?notitle`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true && window.G?.player, null, { timeout: 90000 }); await installProbes(page); await setup();
  await page.waitForFunction(() => document.querySelector('.tut-offer')?.classList.contains('on'), null, { timeout: 20000 });
  const of1 = await G(() => ({ t: document.querySelector('.tf-t b').textContent, active: window.G.tutorials.active, tip: window.QA.toasts.some(t => /Press Tab to play/.test(t)) }));
  await sleep(page, 700); await snap('offer');
  await clickSel('.tf-no'); await sleep(page, 300);
  await page.waitForFunction(() => document.querySelector('.tut-offer')?.classList.contains('on'), null, { timeout: 20000 });
  const of2 = await G(() => document.querySelector('.tf-t b').textContent);
  await clickSel('.tf-yes'); await sleep(page, 800);
  const of3 = await G(() => ({ active: window.G.tutorials.active, recs: window.G.state.flags.tutorials }));
  R.check('an old save past the guides\' starts: a one-time "New guide available" offer per guide; No thanks declines, Show me! starts it', of1.t === 'Two heroes' && !of1.active && !of1.tip && of2 === 'Home, sweet home' && of3.active === 'house' && of3.recs.switch.offered && !of3.recs.switch.done, JSON.stringify({ of1, of2, of3 }));
  await clickSel('.to-skip'); await sleep(page, 300);
  await page.waitForFunction(() => document.querySelector('.tut-offer')?.classList.contains('on'), null, { timeout: 20000 }).catch(() => {});
  await clickSel('.tf-no'); await sleep(page, 300);
  await G(() => window.G.save());
  await page.goto(`${BASE}/?notitle`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true && window.G?.player, null, { timeout: 90000 }); await setup(); await sleep(page, 6000);
  const of4 = await G(() => ({ offer: document.querySelector('.tut-offer')?.classList.contains('on'), t: document.querySelector('.tf-t b')?.textContent, active: window.G.tutorials.active }));
  // (skipping the house tour unlocks the housing guide "Make it home": that one is offered now, for the first time)
  R.check('…and never again after a reload', (!of4.offer || of4.t === 'Make it home') && !of4.active, JSON.stringify(of4));
  }
  // ================================================================ the cozy path's guides (docs/COZY.md §11; CZ-11)
  const cozyBoot = async (qs = '') => { await boot(page, `fresh&nointro&tut&hour=${HOUR}${qs}`); await setup(true); await G(() => { window.__tutEv = []; for (const n of ['tutorial:start', 'tutorial:done', 'tutorial:offer', 'expedition:sent', 'expedition:back', 'scavenge:gather', 'scavenge:dig', 'cozy:burrowChoice']) window.G.events.on(n, p => window.__tutEv.push([n, p])); }); };
  const toNear = (p, d = 1.4) => G(([p, d]) => { const G = window.G, P = G.player; P.setPos(p.x + d, p.z + 0.3); P.faceTo(p.x, p.z); P.facing = P.faceTarget; P.moveTarget = null; G.engine.rig.focus?.copy(P.pos); G.engine.rig.snap?.(); }, [p, d]);
  const standAt = (p, d = 1.0) => G(([p, d]) => { const G = window.G, P = G.player; P.setPos(p.x + d * 0.7, p.z - d * 0.7); P.moveTarget = null; P.interactTarget = null; P.faceTo(p.x, p.z); P.facing = P.faceTarget; G.companion.setPos(p.x - 1.2, p.z + 1.2); G.ui.closeAll?.(); G.interactCooldown = 0; const r = G.engine.rig; r.focus.copy(P.pos); r.snap(); }, [p, d]); // (as s33: beside the node or spot, facing it)
  const objText = () => G(() => document.querySelector('.to-tx')?.innerHTML || '');
  const sayText = () => G(() => document.querySelector('.ts-tx')?.textContent || '');
  // a fresh game to the moment after the house tour: Rosie's welcome done, Moka in the pack, the house tour finished
  const pastHouse = async (answered = false) => { // (answered: Rosie's question already answered "myself", the Board guide and the Nose done)
    await G(answered => { const F = window.G.state.flags, S = F.tutorials ||= {}; S.switch = { done: true }; S.house = { done: true }; if (answered) { F.burrowChoice = 'self'; S.board = { done: true }; S.nose = { done: true }; } window.G.story.markTalk('rosie'); }, answered);
    await page.waitForFunction(() => window.G.state.quests.active.some(q => q.id === 'burrow1'), null, { timeout: 8000 });
    await G(() => { window.G.heroes.join('moka'); }); // (not awaited in the page: it resolves when her scene's dialogue ends)
    await sleep(page, 500); await drainDialogue(page, [0]);
  };
  const choiceUp = () => page.waitForFunction(() => window.G.ui.dlg.active && (window.G.ui.dlg.choices || []).length === 2 && /send/i.test(JSON.stringify(window.G.ui.dlg.choices)), null, { timeout: 25000 }).then(() => true).catch(() => false);

  if (!ONLY || ONLY.includes('g')) {
    // ---------------------------------------------------------------- g) Rosie's question → Send Moka → the Board guide → Shadow's Nose → the report and Rosie
    await cozyBoot(); await pastHouse();
    const up = await choiceUp(); await sleep(page, 1200); // (the dialogue box slides in)
    const q1 = await G(() => { const d = window.G.ui.dlg; return { choices: (d.choices || []).map(c => c.text || c), lines: (d.lines || []).map(l => l.text || l) }; });
    await snap('cozy_choice');
    await drainDialogue(page, [1]);
    await stepIs('board', 'walk', 15000); await sleep(page, 900);
    const b1 = await G(() => { const G = window.G, q = G.questTarget(), b = G.cozy.board.it.pos; return { kind: q?.kind, onBoard: !!q && Math.hypot(q.pos.x - b.x, q.pos.z - b.z) < 0.1, choice: G.state.flags.burrowChoice, say: document.querySelector('.ts-tx')?.textContent || '', q: G.state.quests.active.find(x => x.id === 'burrow1')?.step }; });
    await snap('cozy_board_walk');
    R.check("g) Rosie asks \"Go yourself, or send Moka?\" after the house tour; Send Moka keeps burrow1 and starts Shadow's Board guide: the arrow on the Expedition Board", up && /Go yourself, or send Moka/.test(q1.lines.join(' ')) && q1.choices.length === 2 && b1.choice === 'crew' && b1.q === 0 && b1.kind === 'tut' && b1.onBoard && /Expedition Board/.test(b1.say), JSON.stringify({ q1, b1 }));
    await toNear(await G(() => window.G.cozy.board.it.pos), 1.2);
    await stepIs('board', 'open', 8000); await sleep(page, 500);
    const o1 = { ring: await ringOn('.hud .prompt.show'), obj: await objText() };
    await keyF();
    await stepIs('board', 'job', 8000); await sleep(page, 700);
    const j1 = { ring: await ringOn('.p-exp .ex-det'), sel: await G(() => window.G.ui.panels.expeditions.sel.story), view: await G(() => window.G.ui.panels.expeditions.view), say: await sayText() };
    await snap('cozy_board_job');
    R.check('g) at the board: "Press F" (the prompt spotlit) opens it; the job card (Peek into the Burrow) spotlit', o1.ring && /F/.test(o1.obj) && j1.ring && j1.view === 'story' && j1.sel === 'quest:burrow1' && /Peek into the Burrow/.test(j1.say), JSON.stringify({ o1, j1 }));
    await clickSel('.to-ok');
    await stepIs('board', 'crew', 6000); await sleep(page, 600);
    const c1 = { ring: await ringOn('.p-exp .ex-mem[data-m="hero:moka"]'), obj: await objText() };
    await snap('cozy_board_crew');
    await page.click('.p-exp .ex-mem[data-m="hero:moka"]');
    await stepIs('board', 'send', 6000); await sleep(page, 600);
    const s1 = { ring: await ringOn('.p-exp .ex-go'), ok: await G(() => !document.querySelector('.p-exp .ex-go').disabled) };
    await snap('cozy_board_send');
    await page.click('.p-exp .ex-go');
    await stepIs('board', 'away', 6000); await sleep(page, 600);
    const a1 = await G(() => ({ out: window.G.cozy.exp.list().map(e => [e.obj, e.crew.join()]), view: window.G.ui.panels.expeditions.view }));
    await snap('cozy_board_away');
    R.check("g) Moka's card spotlit and picked, Send off! spotlit and sent; the Away view", c1.ring && /Moka/.test(c1.obj) && s1.ring && s1.ok && a1.out.length === 1 && a1.out[0][0] === 'quest:burrow1' && a1.out[0][1] === 'hero:moka' && a1.view === 'away', JSON.stringify({ c1, s1, a1 }));
    await page.keyboard.press('Escape');
    await stepIs('board', 'chip', 6000); await sleep(page, 700);
    const ch = { ring: await ringOn('.hud .cz-chip.on'), say: await sayText() };
    await snap('cozy_board_chip');
    await clickSel('.to-ok');
    await stepIs('nose', 'gather', 15000); await sleep(page, 900);
    const n0 = await G(() => { const G = window.G, q = G.questTarget(), n = G.cozy.scav.nodes().find(x => q && Math.hypot(q.pos.x - x.x, q.pos.z - x.z) < 0.1); return { rec: G.state.flags.tutorials.board, node: n?.kind || null, say: document.querySelector('.ts-tx')?.textContent || '' }; });
    await snap('cozy_nose_gather');
    R.check('g) the chip spotlit ("let\'s dig while we wait"), the Board guide done; Shadow\'s Nose starts: the arrow on a driftwood gather spot', ch.ring && /dig while we wait/.test(ch.say) && n0.rec.done && !n0.rec.skipped && !!n0.node && /Walk up and press F/.test(n0.say), JSON.stringify({ ch, n0 }));
    const node = await G(() => { const q = window.G.questTarget(); return { x: q.pos.x, z: q.pos.z }; });
    await standAt(node, 0.9); await sleep(page, 400); await keyF();
    await page.waitForFunction(() => window.G.tutorials.active === 'nose' && ['sniff', 'dig'].includes(window.G.tutorials.cur?.step?.id), null, { timeout: 8000 }); await sleep(page, 400); // (sniff passes at once when Shadow already found a spot)
    const spot = await G(() => { const G = window.G, P = G.player, s = G.cozy.scav.spots().filter(x => x.state === 'hidden').sort((a, b) => Math.hypot(a.x - P.pos.x, a.z - P.pos.z) - Math.hypot(b.x - P.pos.x, b.z - P.pos.z))[0]; return s ? { x: s.x, z: s.z, id: s.id } : null; });
    if (spot) await toNear(spot, 5);
    await stepIs('nose', 'dig', 25000); await sleep(page, 600);
    const d0 = await G(() => { const s = window.G.cozy.scav.spots().find(x => x.state === 'found'); return s ? { x: s.x, z: s.z } : null; });
    await standAt(d0, 1.0); await sleep(page, 500);
    const d1 = { obj: await objText(), ring: await ringOn('.hud .prompt.show') };
    await snap('cozy_nose_dig');
    await G(() => { window.G.interactCooldown = 0; }); await page.keyboard.down('f'); // (held to the end: a good dig)
    await page.waitForFunction(() => window.__tutEv.some(e => e[0] === 'scavenge:dig'), null, { timeout: 9000 }).catch(() => {}); await page.keyboard.up('f');
    await stepIs('nose', 'mats', 8000); await sleep(page, 600);
    const m1 = { ring: await ringOn('.hud .mats'), say: await sayText() };
    await snap('cozy_nose_mats');
    R.check('g) the gather (F at the spot), Shadow sniffs a dig spot out, "Hold F… let go in the gold" (the prompt spotlit), the dig; the HUD materials spotlit', /Hold/.test(d1.obj) && d1.ring && m1.ring && /materials/.test(m1.say), JSON.stringify({ d1, m1 }));
    await clickSel('.to-ok');
    await stepIs('nose', 'back', 6000); await sleep(page, 500);
    await G(() => window.G.cozy.clock.add(2.5)); // (the debug clock: Moka's 2 h trip is over)
    await stepIs('nose', 'report', 10000); await sleep(page, 700);
    const r0 = { ring: await ringOn('.hud .cz-chip.on') };
    await page.click('.hud .cz-chip.on');
    await page.waitForFunction(() => window.G.ui.isOpen('expeditions') && window.G.ui.panels.expeditions.view === 'reports', null, { timeout: 5000 });
    await sleep(page, 600); const r1 = { ring: await ringOn('.p-exp .ex-rep') }; await snap('cozy_nose_report');
    await sleep(page, 3500); await page.keyboard.press('Escape'); // (read, then the board closed: Rosie's line follows)
    await stepIs('nose', 'wrap', 12000); await sleep(page, 600);
    const w1 = await G(() => ({ who: document.querySelector('.ts-name')?.textContent, say: document.querySelector('.ts-tx')?.textContent || '', burrow1: window.G.state.quests.done.includes('burrow1') }));
    await snap('cozy_nose_wrap');
    await clickSel('.to-ok'); await sleep(page, 500);
    const w2 = await G(() => ({ rec: window.G.state.flags.tutorials.nose, active: window.G.tutorials.active }));
    R.check("g) Moka's crew comes home: the chip spotlit, the report spotlit on the board; Rosie's thank-you (burrow1 done by the crew); the Nose guide done", r0.ring && r1.ring && w1.who === 'Rosie' && /Mochi Jelly/.test(w1.say) && w1.burrow1 && w2.rec.done && !w2.active, JSON.stringify({ r0, r1, w1, w2 }));
    await G(() => window.G.ui.closeAll());
  }

  if (!ONLY || ONLY.includes('h')) {
    // ---------------------------------------------------------------- h) "Go yourself": no Board guide, the Nose; the words follow the device; the fighter's board offer
    await cozyBoot(); await pastHouse();
    await choiceUp();
    await drainDialogue(page, [0]);
    await stepIs('nose', 'gather', 15000); await sleep(page, 600);
    const h1 = await G(() => ({ choice: window.G.state.flags.burrowChoice, board: window.G.state.flags.tutorials.board || null, ev: window.__tutEv.filter(e => e[0] === 'tutorial:start').map(e => e[1].id) }));
    const words = {};
    for (const d of ['kbm', 'pad', 'touch']) { await G(d => window.G.controls.setDevice(d), d); await sleep(page, 300); words[d] = { obj: await objText(), say: await G(() => document.querySelector('.ts-tx')?.innerHTML || '') }; }
    await G(() => window.G.controls.setDevice('kbm'));
    R.check('h) "I\'ll go myself" keeps the old path (no Board guide) and Shadow\'s Nose follows; its lines follow the device: F on keys, the pad\'s button glyph, "tap" on touch', h1.choice === 'self' && !h1.board && h1.ev.join() === 'nose' && /F/.test(words.kbm.obj) && /kc[^"]*pad/.test(words.pad.obj) && /tap/i.test(words.touch.obj) && /tap it/.test(words.touch.say), JSON.stringify({ h1, words }));
    await clickSel('.to-skip'); await sleep(page, 400);
    // a fighter opens the board: the Board guide comes as an offer card once it's closed
    await toNear(await G(() => window.G.cozy.board.it.pos), 1.2); await sleep(page, 300); await keyF();
    await page.waitForFunction(() => window.G.ui.isOpen('expeditions'), null, { timeout: 5000 }); await sleep(page, 400);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelector('.tut-offer')?.classList.contains('on'), null, { timeout: 15000 }).catch(() => {});
    const h2 = await G(() => ({ t: document.querySelector('.tf-t b')?.textContent, on: document.querySelector('.tut-offer')?.classList.contains('on') }));
    await snap('cozy_board_offer');
    await clickSel('.tf-yes'); await sleep(page, 600);
    const h3 = await G(() => ({ active: window.G.tutorials.active, step: window.G.tutorials.cur?.step?.id }));
    R.check('h) the other path later: a fighter\'s first look at the board offers "The Expedition Board" (Show me! starts it)', h2.on && h2.t === 'The Expedition Board' && h3.active === 'board', JSON.stringify({ h2, h3 }));
    await clickSel('.to-skip'); await sleep(page, 300);
  }

  if (!ONLY || ONLY.includes('i')) {
    // ---------------------------------------------------------------- i) Old Hachi's guide when the Guild is first built
    await cozyBoot(); await pastHouse(true);
    await G(() => { window.G.state.coins = 3000; });
    await drainDialogue(page);
    await G(() => window.G.cozy.guild.debugBuild({ level: 1 }));
    await stepIs('guild', 'door', 20000); await sleep(page, 900);
    const g1 = await G(() => { const G = window.G, q = G.questTarget(), r = G.cozy.guild.rec(); return { kind: q?.kind, onDoor: !!q && !!r && Math.hypot(q.pos.x - r.door.x, q.pos.z - r.door.z) < 0.2, who: document.querySelector('.ts-name')?.textContent, por: !!document.querySelector('.ts-por img') }; });
    await snap('cozy_guild_door');
    await G(() => window.G.cozy.guild.open());
    await stepIs('guild', 'hire', 8000); await sleep(page, 700);
    const g2 = { ring: await ringOn('.p-guild .gd-cands') }; await snap('cozy_guild_hire');
    await page.click('.p-guild .gd-sign:not([disabled])');
    await stepIs('guild', 'roster', 8000); await sleep(page, 800);
    const g3 = { ring: await ringOn('.p-guild .gd-hire:not(.free):not(.lock)'), calls: await G(() => [...document.querySelectorAll('.tut-call')].map(c => c.textContent)) }; await snap('cozy_guild_roster');
    await clickSel('.to-ok');
    await stepIs('guild', 'board', 8000); await sleep(page, 500);
    const g4 = { ring: await ringOn('.p-guild .gd-board[data-board="exp"]') };
    await page.click('.p-guild .gd-board[data-board="exp"]');
    await stepIs('guild', 'two', 8000); await sleep(page, 600);
    const g5 = { ring: await ringOn('.p-exp .ex-crew') }; await snap('cozy_guild_two');
    for (const k of await G(() => { const P = window.G.ui.panels.expeditions; return P.members().filter(m => !P.memberWhy(m.key)).slice(0, 2).map(m => m.key); })) await page.click(`.p-exp .ex-mem[data-m="${k}"]`);
    await stepIs('guild', 'wages', 8000); await sleep(page, 500);
    const g6 = await sayText();
    await snap('cozy_guild_wages');
    await clickSel('.to-ok'); await sleep(page, 400);
    const g7 = await G(() => ({ rec: window.G.state.flags.tutorials.guild, hires: window.G.state.cozy.guild.hires.length }));
    R.check("i) the Guild built → Old Hachi's guide: his door (arrow, his bust), the candidates spotlit and one signed on, the roster card with callouts, the board inside, a crew of two, the wages line", g1.kind === 'tut' && g1.onDoor && g1.who === 'Old Hachi' && g1.por && g2.ring && g3.ring && g3.calls.length === 3 && g4.ring && g5.ring && /Guild wages/.test(g6) && g7.rec.done && g7.hires === 1, JSON.stringify({ g1, g2, g3, g4, g5, g6, g7 }));
    await G(() => window.G.ui.closeAll());
  }

  if (!ONLY || ONLY.includes('j')) {
    // ---------------------------------------------------------------- j) Peaceful paths; old saves get the three as offers (past)
    await cozyBoot('&villagesaved=bamboo'); await pastHouse(true);
    await G(() => { window.G.state.player.lvl = 6; });
    await drainDialogue(page);
    await G(() => window.G.enterRegion('bamboo')); await waitMode(page, 'dungeon');
    await page.waitForFunction(() => !!window.G.state.flags.hints?.peaceful, null, { timeout: 30000 }).catch(() => {});
    await page.waitForFunction(() => document.querySelector('.tut')?.classList.contains('spot'), null, { timeout: 4000 }).catch(() => {});
    const p1 = { tip: await G(() => window.QA.toasts.some(t => /quiet now/.test(t) && /red ofuda/.test(t))), ring: await ringOn('.hud .mm-wrap'), call: await G(() => document.querySelector('.tut-call')?.textContent || '') };
    await snap('cozy_peaceful');
    await page.waitForFunction(() => !document.querySelector('.tut')?.classList.contains('spot'), null, { timeout: 8000 }).catch(() => {});
    const p2 = await G(() => document.querySelector('.tut')?.classList.contains('spot'));
    R.check('j) the first visit to a saved zone: Shadow\'s "Peaceful paths" tip (the red ofuda), the minimap spotlit with the wild rings called out, then it clears', p1.tip && p1.ring && /violet rings/.test(p1.call) && !p2, JSON.stringify({ p1, p2 }));
    // an old save: past burrow1, the Guild built, no records of the three → one offer each (past)
    await G(() => { const G = window.G, F = G.state.flags; G.cozy.guild.debugBuild({ level: 1 }); for (const id of ['board', 'nose', 'guild']) delete F.tutorials[id]; F.tutorials.active = null; if (!G.state.quests.done.includes('burrow1')) G.state.quests.done.push('burrow1'); G.state.quests.active = G.state.quests.active.filter(q => q.id !== 'burrow1'); G.save(); });
    await page.goto(`${BASE}/?notitle&tut`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__ready === true && window.G?.player, null, { timeout: 90000 }); await installProbes(page); await setup(true);
    const offers = [];
    for (let k = 0; k < 6; k++) { // (the older guides this save is past come too: Hold to power up!, after the zone trip)
      const ok = await page.waitForFunction(() => document.querySelector('.tut-offer')?.classList.contains('on'), null, { timeout: 25000 }).then(() => true).catch(() => false);
      if (!ok) break;
      offers.push(await G(() => document.querySelector('.tf-t b').textContent));
      await clickSel('.tf-no'); await sleep(page, 400);
    }
    R.check('j) an old save past their starts gets each new guide once as an offer (past): the Board, Shadow\'s Nose, the Guild', ['The Expedition Board', "Shadow's Nose", "The Adventurers' Guild"].every(t => offers.includes(t)), JSON.stringify(offers));
  }
} catch (e) {
  errors.push('[harness] ' + e.stack);
  try { R.note('at failure: ' + JSON.stringify(await G(() => { const G = window.G, T = G.tutorials, ui = G.ui; return { active: T.active, step: T.cur?.step?.id, entered: T.cur?.entered, paused: T.paused, why: T.cur && T.pauseReason(T.cur.step), pending: [...T.pending], offers: T.offers, rec: G.state.flags.tutorials, rod: G.state.fishing?.rod, hero: G.state.activeHero, open: Object.keys(ui.panels).filter(n => ui.isOpen(n)), dlg: ui.dlg.active, locked: G.player.controlLocked }; }))); } catch (e2) { /* page gone */ }
}
const failed = R.finish(errors, warns);
await browser.close();
process.exit(failed ? 1 : 0);
