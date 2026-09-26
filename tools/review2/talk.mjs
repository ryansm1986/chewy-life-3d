import { open } from './lib.mjs';
const s = await open('/?fresh&nointro&hour=10', { wait: 3000 });
// walk toward Rosie to see marker
await s.ev(() => { const r = G.npcs[0]; G.player.setPos(r.pos.x + 5, r.pos.z + 5); G.companion.setPos(r.pos.x + 6, r.pos.z + 5); });
await s.sleep(1500);
await s.snap('08_near_rosie_marker');
await s.ev(() => { const r = G.npcs[0]; G.player.setPos(r.pos.x + 1.2, r.pos.z + 0.6); });
await s.sleep(600);
await s.snap('08b_rosie_prompt');
await s.key('f');
await s.sleep(1800);
await s.snap('09_rosie_talk1');
await s.log('dlg', () => ({ active: G.ui.dlg.active, lines: G.ui.dlg.lines?.map(l => l.text), ch: G.ui.dlg.choices }));
await s.skipDlg(); await s.sleep(2500);
await s.snap('09b_after_welcome');
await s.log('quests', () => G.story.uiList().map(q => q.title + ': ' + q.steps.map(x => x.text + ' ' + x.have + '/' + x.need).join(', ')));
await s.log('toasts/banners', () => [...document.querySelectorAll('[class*=toast],[class*=banner]')].map(e => e.className + ':' + e.innerText.replace(/\n/g, ' ')).filter(t => t.length > 10).slice(0, 8));
// dialogue flow may continue (choices)
await s.log('dlg2', () => ({ active: G.ui.dlg.active, lines: G.ui.dlg.lines?.map(l => l.text), ch: G.ui.dlg.choices }));
await s.sleep(500);
await s.snap('09c_dialog_choices');
// talk again to get choices
await s.ev(() => { while (G.ui.dlg.active) G.ui.dlg.finish(-1); });
await s.sleep(800);
await s.ev(() => { G.interactCooldown = 0; });
await s.key('f');
await s.sleep(2500);
await s.ev(() => { if (G.ui.dlg.typing) G.ui.dlg.advance(); });
await s.sleep(900);
await s.snap('10_rosie_choices');
await s.log('dlg3', () => ({ active: G.ui.dlg.active, lines: G.ui.dlg.lines?.map(l => l.text), ch: G.ui.dlg.choices }));
// choose shop
await s.ev(() => { const ch = G.ui.dlg.choices || []; const i = ch.findIndex(c => (c.text || c).includes('shop')); if (i >= 0) G.ui.dlg.choose(i); });
await s.sleep(1200);
await s.snap('11_shop');
await s.sleep(800);
await s.snap('11b_shop_settled');
await s.page.mouse.move(700, 400); await s.sleep(600);
await s.snap('11c_shop_hover');
await s.key('Escape'); await s.sleep(800);
// talk to a villager
await s.ev(() => { const v = G.npcs.find(n => n.id === 'usagi') || G.npcs[1]; G.player.setPos(v.pos.x + 1, v.pos.z + 0.8); G.interactCooldown = 0; });
await s.sleep(700);
await s.key('f'); await s.sleep(2200);
await s.snap('12_villager_talk');
await s.log('dlg4', () => ({ speaker: G.ui.dlg.opts?.speaker, lines: G.ui.dlg.lines?.map(l => l.text), ch: G.ui.dlg.choices }));
await s.ev(() => { if (G.ui.dlg.typing) G.ui.dlg.advance(); }); await s.sleep(300);
await s.ev(() => G.ui.dlg.choose(2)); await s.sleep(2500);
await s.snap('12b_villager_request');
await s.ev(() => { if (G.ui.dlg.typing) G.ui.dlg.advance(); }); await s.sleep(300);
await s.ev(() => G.ui.dlg.choose(0)); await s.sleep(1500);
await s.snap('12c_request_accepted');
await s.log('quests2', () => G.story.uiList().map(q => q.title + ': ' + q.steps.map(x => x.text + ' ' + x.have + '/' + x.need).join(', ')));
await s.close();
