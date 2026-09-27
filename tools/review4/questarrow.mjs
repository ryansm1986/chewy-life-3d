import { open } from './lib.mjs';
// After intro: quest target is the Burrow (non-NPC). Check off-screen arrow + minimap star.
const s = await open('/?fresh&hour=9', { wait: 1500 });
for (let n = 0; n < 3; n++) { await s.ev(() => { let n = 0; while (G.ui?.dlg?.active && n++ < 50) G.ui.dlg.finish ? G.ui.dlg.finish(-1) : G.ui.dlg.advance(); }); await s.sleep(1200); }
await s.sleep(1500);
await s.log('quest target', () => { const t = G.questTarget?.(); return t ? { label: t.label || t.name || t.id, pos: t.pos ? [t.pos.x.toFixed(1), t.pos.z.toFixed(1)] : null } : null; });
await s.log('quests', () => G.story.uiList().map(q => q.title + ': ' + q.steps.map(x => x.text + ' ' + x.have + '/' + x.need).join(', ')));
await s.snap('46_questarrow_a');
await s.log('arrow dom', () => { const e = document.querySelector('[class*=qarrow], [class*=quest-arrow], .qa, [class*=questArrow]'); if (!e) return null; const r = e.getBoundingClientRect(); return { cls: e.className, txt: e.innerText, x: r.x, y: r.y, vis: getComputedStyle(e).opacity }; });
// walk toward the gate by holding keys for a bit (use click on ground towards arrow)
await s.ev(() => { const t = G.questTarget?.(); if (t?.pos) G.player.moveTarget = t.pos.clone(); });
await s.sleep(5000);
await s.snap('46_questarrow_b_walking');
await s.sleep(6000);
await s.snap('46_questarrow_c');
await s.log('player', () => ({ p: [G.player.pos.x.toFixed(1), G.player.pos.z.toFixed(1)], t: G.questTarget?.()?.pos && G.player.pos.distanceTo(G.questTarget().pos).toFixed(1) }));
await s.close();
