import { open } from './lib.mjs';
// Rosie's shop through the real chat menu, a hover, a buy, and a gift; then the death screen in the Burrow.
const s = await open('/?fresh&nointro&hour=11', { wait: 3500 });
await s.ev(() => { const r = G.npcs.find(n => n.id === 'rosie'); G.player.setPos(r.pos.x + 0.9, r.pos.z + 0.9); G.engine.rig.focus.copy(G.player.pos); G.engine.rig.snap(); G.interactCooldown = 0; });
await s.sleep(1500);
await s.key('f'); await s.sleep(1800);
await s.log('chat', () => [...document.querySelectorAll('button.dch')].map(b => b.innerText.trim()));
const shopIdx = await s.ev(() => [...document.querySelectorAll('button.dch')].findIndex(b => /shop/i.test(b.innerText)));
if (shopIdx < 0) { await s.key('f'); await s.sleep(1500); }
const idx = await s.ev(() => [...document.querySelectorAll('button.dch')].findIndex(b => /shop/i.test(b.innerText)));
console.log('shop choice', idx);
if (idx >= 0) await s.key(String(idx + 1));
for (let i = 0; i < 2; i++) { await s.sleep(150); await s.snap('95_shop_opening_' + i); }
await s.sleep(1200); await s.snap('95_shop');
const cell = await s.ev(() => { const e = [...document.querySelectorAll('[class*=shop] .has, [class*=shop] .card, [class*=shop] [data-i], .sh-item, .shop .slot')].find(e => e.offsetParent); if (!e) return null; const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2, e.className]; });
console.log('cell', JSON.stringify(cell));
if (cell) { await s.page.mouse.move(cell[0], cell[1], { steps: 3 }); await s.sleep(700); await s.snap('95_shop_hover'); }
await s.key('Escape'); await s.sleep(600);
// death in the Burrow
await s.ev(() => { G.state.flags.burrowTut = true; G.enterDungeon(4); });
await s.sleep(5000);
await s.ev(() => { if (G.ui.dlg.active) G.ui.dlg.finish(-1); const P = G.state.player; P.life = 1; const m = G.dungeon.monsters.find(m => m.alive && !m.isBoss); if (m) { G.player.setPos(m.pos.x + 1, m.pos.z); } G.combat.hitPlayer ? G.combat.hitPlayer(999, { element: 'phys', level: 5, from: G.player.pos.clone() }) : null; });
for (let i = 0; i < 4; i++) { await s.sleep(700); await s.snap('96_death_' + i); }
await s.log('death', () => ({ dead: G.playerDead, txt: [...document.querySelectorAll('[class*=death], [class*=dead], [class*=ko]')].map(e => e.innerText).filter(Boolean).slice(0, 3) }));
await s.close();
