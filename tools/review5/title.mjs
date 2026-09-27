import { open } from './lib.mjs';
const s = await open('/', { wait: 2500 });
await s.snap('00_title');
const btns = await s.ev(() => [...document.querySelectorAll('button')].filter(b => b.offsetParent).map(b => { const r = b.getBoundingClientRect(); return [b.innerText.trim(), Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)]; }));
console.log(JSON.stringify(btns));
const ng = btns.find(b => /new/i.test(b[0]));
if (ng) { await s.page.mouse.move(ng[1], ng[2], { steps: 4 }); await s.sleep(500); await s.snap('00b_title_hover'); await s.click(ng[1], ng[2]); }
for (let i = 0; i < 3; i++) { await s.sleep(350); await s.snap('00c_title_newgame_' + i); }
await s.sleep(5000);
await s.snap('00d_after_newgame');
await s.log('state', () => ({ title: G.titleActive, dlg: G.ui?.dlg?.active, spk: G.ui?.dlg?.opts?.speaker }));
await s.close();
