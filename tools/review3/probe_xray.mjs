import { open } from './lib.mjs';
const s = await open('/?fresh&nointro&hour=17.5', { wait: 3500 });
const info = await s.ev(() => {
  const c = G.companion, p = G.player;
  const out = { comp: [c.pos.x, c.pos.y, c.pos.z].map(v => +v.toFixed(2)), compH: +G.world.heightAt(c.pos.x, c.pos.z).toFixed(2), player: [p.pos.x, p.pos.y, p.pos.z].map(v => +v.toFixed(2)), playerH: +G.world.heightAt(p.pos.x, p.pos.z).toFixed(2) };
  // children of the companion rig root and their y
  const kids = []; c.rig.root.traverse(o => { if (o.isMesh) kids.push({ n: o.name, t: o.type, vis: o.visible, mat: o.material?.type, dw: o.material?.depthWrite, tr: o.material?.transparent, ro: o.renderOrder, y: +o.getWorldPosition(new G.THREE.Vector3()).y.toFixed(2) }); });
  out.kids = kids;
  const pk = []; p.rig.root.traverse(o => { if (o.isMesh) pk.push({ n: o.name, mat: o.material?.type, dw: o.material?.depthWrite, tr: o.material?.transparent, ro: o.renderOrder }); });
  out.playerKids = pk;
  return out;
});
console.log(JSON.stringify(info, null, 0));
await s.snap('p_xray_on');
await s.ev(() => { G.companion.rig.xrayMat.visible = false; });
await s.sleep(300);
await s.snap('p_xray_off');
await s.close();
