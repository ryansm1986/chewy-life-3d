import { open } from './lib.mjs';
// Night: who is still out at 00:30, what is Rosie doing, and does "Knock on X's door" work (F at a door)?
const s = await open('/?fresh&nointro&hour=0.5', { wait: 4000 });
await s.sleep(4000);
await s.log('out at 00:30', () => G.npcs.filter(n => n.visible).map(n => n.id + ':' + n.state + (n.act?.slot?.kind ? ':' + n.act.slot.kind : '') + ' @' + n.pos.x.toFixed(0) + ',' + n.pos.z.toFixed(0)));
await s.log('knock prompts', () => G.world.interactables.filter(i => /Knock/.test(i.label)).map(i => i.label));
const k = await s.ev(() => { const it = G.world.interactables.find(i => /Knock on/.test(i.label)); if (!it) return null; G.player.setPos(it.pos.x + 0.4, it.pos.z + 0.6); G.companion.setPos(it.pos.x + 1.4, it.pos.z + 1.2); G.engine.rig.focus.copy(G.player.pos); G.engine.rig.snap(); return it.label; });
console.log('knock at', k);
await s.sleep(1200);
await s.snap('80_knock_before');
await s.ev(() => { G.interactCooldown = 0; });
await s.key('f');
for (let i = 0; i < 6; i++) { await s.sleep(600); if (i === 1 || i === 4) await s.snap('80_knock_' + i); }
await s.log('after knock', () => ({ dlg: G.ui.dlg.active, spk: G.ui.dlg.opts?.speaker, lines: G.ui.dlg.lines?.map(l => l.text), out: G.npcs.filter(n => n.visible).map(n => n.id + ':' + n.state) }));
await s.skipDlg(); await s.sleep(3000);
await s.snap('80_knock_after');
await s.log('later', () => G.npcs.filter(n => n.visible).map(n => n.id + ':' + n.state));
// Rosie close-up at night (shop)
await s.ev(() => { const r = G.npcs.find(n => n.id === 'rosie'); G.player.setPos(r.pos.x + 2, r.pos.z + 2); G.engine.rig.focus.copy(G.player.pos); G.engine.rig.snap(); });
await s.sleep(1500);
await s.snap('81_rosie_night');
await s.log('rosie', () => { const r = G.npcs.find(n => n.id === 'rosie'); return { st: r.state, vis: r.visible, act: r.act?.slot?.kind, hour: G.day.hour.toFixed(2) }; });
await s.close();
