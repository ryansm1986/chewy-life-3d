import { open } from './lib.mjs';
const s = await open('/?fresh', { wait: 2500 });
await s.snap('01_title');
await s.sleep(1500);
await s.snap('01b_title_later');
const btn = await s.ev(() => { const b = [...document.querySelectorAll('button, .btn, [class*=title] *')].find(e => /new game/i.test(e.innerText || '')); if (!b) return null; const r = b.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2, b.innerText]; });
console.log('newgame btn', JSON.stringify(btn));
if (btn) await s.click(btn[0], btn[1]); else await s.click(800, 495);
for (let i = 0; i < 4; i++) { await s.sleep(400); await s.snap('02_newgame_' + i); }
await s.sleep(3000);
await s.snap('03_intro_a');
await s.log('dlg', () => ({ active: G.ui.dlg.active, spk: G.ui.dlg.opts?.speaker, lines: G.ui.dlg.lines?.map(l => l.text), title: G.titleActive, dist: G.engine.rig.distTarget }));
await s.sleep(2500);
await s.snap('03_intro_b');
await s.log('rosie', () => { const r = G.npcs[0]; const c = G.engine.camera.position; const f = new G.THREE.Vector3(0, 0, 1).applyQuaternion(r.rig?.root?.quaternion || r.group?.quaternion || new G.THREE.Quaternion()); const toCam = new G.THREE.Vector3(c.x - r.pos.x, 0, c.z - r.pos.z).normalize(); return { id: r.id, pos: [r.pos.x.toFixed(1), r.pos.z.toFixed(1)], facingDotCam: +(f.x * toCam.x + f.z * toCam.z).toFixed(2), player: [G.player.pos.x.toFixed(1), G.player.pos.z.toFixed(1)] }; });
for (let i = 0; i < 6; i++) { await s.key('f'); await s.sleep(700); if (i === 1 || i === 3) await s.snap('03_intro_line_' + i); }
for (let i = 0; i < 20; i++) { await s.key('f'); await s.sleep(300); }
await s.sleep(2500);
await s.log('after intro', () => ({ dlg: G.ui.dlg.active, locked: G.player.controlLocked, quests: G.story.uiList().map(q => q.title + ' ' + q.steps.map(x => x.text + ' ' + x.have + '/' + x.need).join()), toasts: [...document.querySelectorAll('[class*=toast]')].map(e => e.innerText).filter(Boolean) }));
await s.snap('04_after_intro');
await s.sleep(4000);
await s.snap('04b_after_intro_4s');
console.log('fps', JSON.stringify(await s.fps(3000)), JSON.stringify(await s.stats()));
await s.close();
