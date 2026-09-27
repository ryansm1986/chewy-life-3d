import { open } from './lib.mjs';
const s = await open('/?fresh&nointro&floor=1', { wait: 7500 });
await s.ev(() => { if (G.ui.dlg.active) G.ui.dlg.finish(-1); G.state.flags.burrowTut = true; });
await s.sleep(500);
// 1) weapon swap visual
const before = await s.ev(() => ({ derived: G.derived.weaponType, player: G.player.weaponType, inHand: G.player.rig.parts.handR.children.map(c => c === G.player.sword ? 'sword' : c === G.player.ball ? 'ball' : c.name || c.type), swordBack: G.player.swordBack.visible }));
await s.key('x'); await s.sleep(600);
const after = await s.ev(() => ({ derived: G.derived.weaponType, player: G.player.weaponType, inHand: G.player.rig.parts.handR.children.map(c => c === G.player.sword ? 'sword' : c === G.player.ball ? 'ball' : c.name || c.type), swordBack: G.player.swordBack.visible, hb0: G.state.player.hotbar[0] }));
console.log('swap before', JSON.stringify(before), 'after', JSON.stringify(after));
await s.ev(() => { G.engine.rig.distTarget = 12; }); await s.sleep(1500);
await s.snap('40_swap_closeup');
// 2) glow rectangles: toggle candidate meshes
await s.ev(() => { G.engine.rig.distTarget = 34; }); await s.sleep(1200);
await s.snap('41_glow_all');
const cands = await s.ev(() => { const out = []; G.world.scene.traverse(o => { if (o.isMesh && o.material && o.material.transparent && o.material.blending === G.THREE.AdditiveBlending) out.push((o.material.type) + ':' + (o.geometry.type) + ':' + (o.renderOrder)); }); const c = {}; for (const k of out) c[k] = (c[k] || 0) + 1; return c; });
console.log('additive meshes', JSON.stringify(cands));
await s.ev(() => { G.world.scene.traverse(o => { if (o.isMesh && o.material?.type === 'ShaderMaterial' && o.material.blending === G.THREE.AdditiveBlending) o.visible = false; }); });
await s.sleep(400); await s.snap('41b_glow_no_halos');
await s.ev(() => { G.world.scene.traverse(o => { if (o.isMesh && o.material?.type === 'ShaderMaterial' && o.material.blending === G.THREE.AdditiveBlending) o.visible = true; }); G.engine.post.ao.enabled = false; });
await s.sleep(400); await s.snap('41c_glow_no_ao');
await s.close();
