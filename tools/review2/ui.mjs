import { open } from './lib.mjs';
import { generateItemPrep } from './prep.mjs';
const s = await open('/?fresh&nointro&floor=3', { wait: 7500 });
await s.ev(() => { if (G.ui.dlg.active) G.ui.dlg.finish(-1); G.state.flags.burrowTut = true; });
// give loot: generate several items of each rarity into inventory
await s.ev(generateItemPrep);
await s.sleep(500);
// inventory opening animation
await s.key('i');
for (let i = 0; i < 3; i++) { await s.sleep(80); await s.snap('25a_inv_opening_' + i); }
await s.sleep(900);
await s.snap('25_inventory');
// hover items of different rarities
const cells = await s.ev(() => [...document.querySelectorAll('.grid .has')].slice(0, 40).map(e => { const r = e.getBoundingClientRect(); return [e.className, Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)]; }));
console.log('cells', JSON.stringify(cells.slice(0, 12)));
const byR = {};
for (const [cls, x, y] of cells) { const m = /(unique|set|rare|magic|normal)/.exec(cls); if (m && !byR[m[1]]) byR[m[1]] = [x, y]; }
console.log('byR', JSON.stringify(byR));
for (const r of ['unique', 'set', 'rare', 'magic']) if (byR[r]) { await s.page.mouse.move(byR[r][0], byR[r][1], { steps: 3 }); await s.sleep(600); await s.snap('26_tooltip_' + r); }
await s.page.mouse.move(800, 100);
await s.key('i'); await s.sleep(400);
// skills
await s.key('k'); for (let i = 0; i < 2; i++) { await s.sleep(100); await s.snap('27a_skills_opening_' + i); }
await s.sleep(900); await s.snap('27_skills');
const sk = await s.ev(() => { const e = [...document.querySelectorAll('.sk-node, .skill, [data-skill]')].find(x => /whirl|bonestorm/.test(x.dataset.skill || x.dataset.id || '')) || document.querySelector('[data-skill], .sk-node'); if (!e) return null; const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2, e.className]; });
console.log('sk', JSON.stringify(sk));
if (sk) { await s.page.mouse.move(sk[0], sk[1], { steps: 3 }); await s.sleep(600); await s.snap('27b_skill_tip'); }
await s.key('k'); await s.sleep(400);
await s.key('c'); await s.sleep(1000); await s.snap('28_character'); await s.key('c'); await s.sleep(400);
await s.key('j'); await s.sleep(1000); await s.snap('29_quests'); await s.key('j'); await s.sleep(400);
await s.key('m'); await s.sleep(1000); await s.snap('30_map'); await s.key('m'); await s.sleep(400);
await s.key('Escape'); await s.sleep(900); await s.snap('31_menu');
await s.log('menu', () => document.querySelector('.menu, .pause, [class*=menu]')?.innerText?.slice(0, 300));
await s.key('Escape'); await s.sleep(500);
await s.close();
