// Build mode: palette (via UI), ghost preview on the grid, zone/path painting, bulldozer, coverage overlays.
import * as THREE from 'three';
import { BUILDINGS, CATEGORIES, buildModel, sizeOf } from './buildings/index.js';
import { ZONES } from './village.js';
import { Input } from '../core/input.js';
import { Events } from '../core/events.js';
import { WORLD } from './terrain.js';
import { ease, damp } from '../core/util.js';

const RANK_REQ = { shrine: 2, boneSmith: 2, waterTower: 2, fountain: 2, onsen: 3, clinic: 3, school: 3, koiStatue: 3, chewyStatue: 4, bridge: 2 };

export class BuildMode {
  constructor(G, sim) {
    this.G = G; this.sim = sim; this.active = false; this.tool = null;
    this.ghost = null; this.ghostKey = ''; this.rot = 0; this.drag = null;
    this.okMat = new THREE.MeshBasicMaterial({ color: '#8affb0', transparent: true, opacity: 0.55, depthWrite: false });
    this.badMat = new THREE.MeshBasicMaterial({ color: '#ff7a8a', transparent: true, opacity: 0.55, depthWrite: false });
    this.prevDist = 34;
  }
  catalog() {
    const rank = this.sim.stats.rank;
    const cats = [];
    for (const [cid, cname] of Object.entries(CATEGORIES)) {
      const items = Object.entries(BUILDINGS).filter(([id, b]) => b.cat === cid && !b.prebuilt && !b.zone).map(([id, b]) => {
        const need = RANK_REQ[id] || 1;
        const unique = b.unique && this.sim.S.buildings.some(x => x.type === id);
        return { id, name: b.name, cost: b.cost, desc: b.desc, cover: b.covers || null, locked: rank < need ? `Village rank ${need}` : unique ? 'Already built' : null };
      });
      if (items.length) cats.push({ id: cid, name: cname, items });
    }
    return cats;
  }
  enter() {
    if (this.active || this.G.mode !== 'village') return;
    this.active = true; this.G.buildMode = true;
    const rig = this.G.engine.rig; this.prevDist = rig.distTarget; rig.distTarget = Math.max(rig.distTarget, 44);
    this.sim.setOverlay('build');
    this.sim.terrain.material.userData.u.uGrid.value = 1;
    this.G.ui?.open?.('build', {
      categories: this.catalog(),
      onSelect: id => this.setTool({ kind: 'building', type: id }),
      onZone: z => this.setTool(z ? { kind: 'zone', zone: typeof z === 'string' ? ZONES[z] ?? 0 : z } : { kind: 'zone', zone: 0 }),
      onPath: (erase) => this.setTool({ kind: 'path', erase: !!erase }),
      onBulldoze: () => this.setTool({ kind: 'bulldoze' }),
      onOverlay: m => this.sim.setOverlay(m || 'build'),
      onClose: () => this.exit(),
      stats: () => ({ ...this.sim.stats, demand: this.sim.demand }),
    });
    Events.emit('sfx', 'ui_open');
  }
  exit() {
    if (!this.active) return;
    this.active = false; this.G.buildMode = false; this.setTool(null);
    this.G.engine.rig.distTarget = this.prevDist;
    this.G.engine.rig.yawTarget = Math.round((this.G.engine.rig.yawTarget - Math.PI / 4) / (Math.PI / 2)) * (Math.PI / 2) + Math.PI / 4;
    this.sim.setOverlay(null);
    this.sim.terrain.material.userData.u.uGrid.value = 0;
    this.sim.terrain.material.userData.u.uCursor.value.set(-99, -99, 0, 0);
    if (this.G.ui?.isOpen?.('build')) this.G.ui.close('build');
  }
  setTool(t) {
    this.tool = t; this.drag = null;
    if (this.ghost) { this.ghost.parent?.remove(this.ghost); this.ghost = null; this.ghostKey = ''; }
    if (t?.kind === 'building') {
      const m = buildModel(t.type, { level: 1, seed: 1 });
      const g = new THREE.Group(); g.add(m.group);
      g.traverse(o => { if (o.isMesh) { o.userData.origMat = o.material; o.castShadow = false; } });
      this.ghost = g; this.sim.world.scene.add(g); this.ghostOk = null; this.ghostY = 0;
    }
    if (t?.kind === 'zone') this.sim.setOverlay('zones');
    else if (this.active) this.sim.setOverlay('build');
  }
  cursorTile() {
    const G = this.G;
    const p = G.engine.mouseGround(Input.mouse.nx, Input.mouse.ny, (x, z) => this.sim.world.heightAt(x, z));
    return { x: Math.floor(p.x), z: Math.floor(p.z), p };
  }
  update(dt) {
    if (!this.active) return;
    const G = this.G, sim = this.sim, cur = this.cursorTile(), U = sim.terrain.material.userData.u;
    if (Input.hit('escape')) { if (this.tool) { this.setTool(null); Input.consume('escape'); } }
    if (Input.mouseHit(2) && this.tool) this.setTool(null);
    if (!this.tool) { U.uCursor.value.set(cur.x + 0.5, cur.z + 0.5, 1, 1); return; }
    if (Input.mouse.overUI) return;
    if (this.tool.kind === 'building') {
      if (Input.hit('r')) { this.rot = (this.rot + 1) % 4; Events.emit('sfx', 'ui_click'); }
      const [w, d] = sim.dims(this.tool.type, this.rot);
      const x0 = Math.round(cur.p.x - w / 2), z0 = Math.round(cur.p.z - d / 2);
      const chk = sim.canPlace(this.tool.type, x0, z0, this.rot);
      const afford = G.actions.hasMaterials(BUILDINGS[this.tool.type].cost);
      const ok = chk.ok && afford;
      U.uCursor.value.set(x0 + w / 2, z0 + d / 2, w, d);
      // ghost follows smoothly with a little hop
      const target = new THREE.Vector3(x0 + w / 2, sim.terrain.heightAt(x0 + w / 2, z0 + d / 2) + 0.05, z0 + d / 2);
      this.ghost.position.x = damp(this.ghost.position.x, target.x, 22, dt); this.ghost.position.z = damp(this.ghost.position.z, target.z, 22, dt);
      this.ghost.position.y = target.y + Math.abs(Math.sin(G.engine.time * 4)) * 0.08;
      this.ghost.rotation.y = damp(this.ghost.rotation.y, -this.rot * Math.PI / 2, 16, dt);
      if (ok !== this.ghostOk) { this.ghostOk = ok; this.ghost.traverse(o => { if (o.isMesh) o.material = ok ? this.okMat : this.badMat; }); }
      G.ui?.setInteract?.(ok ? `Click to build · R to rotate` : (!chk.ok ? chk.why : 'Not enough materials'));
      if (Input.mouseHit(0)) {
        const b = sim.place(this.tool.type, x0, z0, this.rot);
        if (b) { G.vfx.sparkle(target.clone().setY(target.y + 1), { n: 20, r: 1.2 }); if (BUILDINGS[this.tool.type].unique) this.setTool(null); }
      }
    } else if (this.tool.kind === 'zone' || this.tool.kind === 'path') {
      if (Input.mouseHit(0)) this.drag = { x: cur.x, z: cur.z };
      const a = this.drag || cur;
      const x0 = Math.min(a.x, cur.x), x1 = Math.max(a.x, cur.x), z0 = Math.min(a.z, cur.z), z1 = Math.max(a.z, cur.z);
      if (this.tool.kind === 'path' && this.drag) { // paths paint as you drag
        if (sim.paintPath(cur.x, cur.z, !this.tool.erase)) Events.emit('sfx', 'build_place', { vol: 0.3 });
        U.uCursor.value.set(cur.x + 0.5, cur.z + 0.5, 1, 1);
      } else U.uCursor.value.set((x0 + x1 + 1) / 2, (z0 + z1 + 1) / 2, x1 - x0 + 1, z1 - z0 + 1);
      G.ui?.setInteract?.(this.tool.kind === 'path' ? (this.tool.erase ? 'Drag to remove paths' : 'Drag to lay stone paths') : 'Drag to paint a zone · villagers build there when there is demand');
      if (Input.mouse && !Input.mouseDown(0) && this.drag) {
        if (this.tool.kind === 'zone') { const n = sim.paintZone(x0, z0, x1, z1, this.tool.zone); if (n) Events.emit('sfx', 'build_place', { vol: 0.5 }); }
        else sim.refreshTiles();
        this.drag = null;
      }
    } else if (this.tool.kind === 'bulldoze') {
      const b = sim.buildingAt(cur.x, cur.z);
      U.uCursor.value.set(cur.x + 0.5, cur.z + 0.5, 1, 1);
      G.ui?.setInteract?.(b ? (BUILDINGS[b.type].prebuilt ? `${BUILDINGS[b.type].name} can't be removed` : `Click to remove ${BUILDINGS[b.type].name} (50% refund)`) : 'Click a building to remove it');
      if (b) { const [w, d] = sim.dims(b.type, b.rot, b.level); U.uCursor.value.set(b.x + w / 2, b.z + d / 2, w, d); }
      if (Input.mouseHit(0) && b && !BUILDINGS[b.type].prebuilt) sim.remove(b);
    }
  }
}
