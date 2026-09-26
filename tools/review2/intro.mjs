import { open } from './lib.mjs';
const s = await open('/', { wait: 2500 });
await s.click(800, 495); // New Game
await s.sleep(9000);
await s.log('dlg', () => ({ active: G.ui.dlg.active, spk: G.ui.dlg.opts?.speaker, title: G.titleActive, simBusyT: G.sim.tickT }));
const t0 = await s.ev(() => G.sim.tickT);
await s.sleep(3000);
const t1 = await s.ev(() => G.sim.tickT);
console.log('sim tickT during dialogue', t0, '->', t1);
for (let i = 0; i < 20; i++) { await s.key('f'); await s.sleep(350); }
await s.sleep(3000);
await s.log('after intro', () => ({ dlg: G.ui.dlg.active, locked: G.player.controlLocked, quests: G.story.uiList().map(q => q.title + ' ' + q.steps.map(x => x.have + '/' + x.need).join()), toasts: [...document.querySelectorAll('[class*=toast]')].map(e => e.innerText).filter(Boolean) }));
await s.snap('39_after_intro_complete');
await s.close();
