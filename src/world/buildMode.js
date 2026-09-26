// Build mode: palette (via UI), ghost preview on the grid, zone/path painting, bulldozer, coverage overlays.
import * as THREE from 'three';
import { BUILDINGS, CATEGORIES, buildModel, sizeOf } from './buildings/index.js';
import { ZONES, RANK_POP } from './village.js';
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
    this.view = 0; // 0..1 build-view blend (grass shrink)
    this.lastCur = null;
  }
  overlay(mode) {
    this.sim.setOverlay(mode);
    const u = this.sim.terrain.material.userData.u;
    if (u.uOverlayMode) u.uOverlayMode.value = (mode === 'build' || mode === 'zones' || !mode) ? 1 : 0;
  }
  cursorCol(hex, fill = 0.14) {
    const u = this.sim.terrain.material.userData.u; if (!u.uCursorCol) return;
    const c = new THREE.Color(hex); u.uCursorCol.value.set(c.r, c.g, c.b, fill);
  }
  catalog() {
    const rank = this.sim.stats.rank;
    const cats = [];
    for (const [cid, cname] of Object.entries(CATEGORIES)) {
      // prebuilt landmarks are listed too (always 'Already built') so the Landmarks tab shows the whole village set
      const items = Object.entries(BUILDINGS).filter(([id, b]) => b.cat === cid && !b.zone).map(([id, b]) => {
        const need = RANK_REQ[id] || 1;
        const unique = b.unique && this.sim.S.buildings.some(x => x.type === id);
        return { id, name: b.name, cost: b.cost || {}, desc: b.desc, cover: b.cover || null, covers: b.covers || null, size: sizeOf(id, 1), icon: this.G.thumbs?.get(id) || null, locked: unique || b.prebuilt ? 'Already built' : rank < need ? `Village rank ${need}` : null };
      }).sort((a, b) => !!a.locked - !!b.locked);
      if (items.length) cats.push({ id: cid, name: cname, items });
    }
    return cats;
  }
  enter() {
    if (this.active || this.G.mode !== 'village') return;
    this.active = true; this.G.buildMode = true;
    const rig = this.G.engine.rig; this.prevDist = rig.distTarget; rig.distTarget = Math.max(rig.distTarget, 44);
    this.overlay('build');
    this.sim.terrain.material.userData.u.uGrid.value = 1;
    this.G.ui?.open?.('build', {
      categories: this.catalog(),
      onSelect: id => this.setTool({ kind: 'building', type: id }),
      onZone: z => this.setTool(z ? { kind: 'zone', zone: typeof z === 'string' ? ZONES[z] ?? 0 : z } : { kind: 'zone', zone: 0 }),
      onPath: (erase) => this.setTool({ kind: 'path', erase: !!erase }),
      onBulldoze: () => this.setTool({ kind: 'bulldoze' }),
      onOverlay: m => this.overlay(m || 'build'),
      onClose: () => this.exit(),
      stats: () => ({ ...this.sim.stats, demand: this.sim.demand, rankInfo: this.rankInfo() }),
    });
    this.sim.showNeedIcons?.(true);
    Events.emit('sfx', 'ui_open');
  }
  exit() {
    if (!this.active) return;
    this.active = false; this.G.buildMode = false; this.setTool(null);
    this.sim.showNeedIcons?.(false); this.inspectAt(null);
    this.G.engine.rig.distTarget = this.prevDist;
    this.G.engine.rig.yawTarget = Math.round((this.G.engine.rig.yawTarget - Math.PI / 4) / (Math.PI / 2)) * (Math.PI / 2) + Math.PI / 4;
    this.overlay(null);
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
    if (t?.kind === 'zone') this.overlay('zones');
    else if (this.active && !['water', 'light', 'joy', 'health', 'learn'].includes(this.sim.overlayMode)) this.overlay('build');
  }
  // village rank progress for the palette: current rank, villagers, next threshold and what it unlocks
  rankInfo() {
    const rank = this.sim.stats.rank || 1, pop = this.sim.stats.population || 0;
    const unlocks = Object.entries(RANK_REQ).filter(([, r]) => r === rank + 1).map(([id]) => BUILDINGS[id]?.name).filter(Boolean);
    return { rank, pop, cur: RANK_POP[rank - 1] ?? 0, next: RANK_POP[rank] ?? null, unlocks };
  }
  // hover card: inspect the tile under the cursor (throttled; re-evaluated when the tile changes or every 0.4 s)
  inspectAt(cur, dt = 0) {
    const ui = this.G.ui;
    if (!cur) { this.insKey = ''; this.insInfo = null; ui?.buildInspect?.(null); return null; }
    const key = cur.x + ',' + cur.z;
    this.insT = (this.insT || 0) - dt;
    if (key !== this.insKey || this.insT <= 0) { this.insKey = key; this.insT = 0.4; this.insInfo = this.sim.inspect?.(cur.x, cur.z) || null; }
    ui?.buildInspect?.(this.insInfo, Input.mouse.x, Input.mouse.y);
    return this.insInfo;
  }
  cursorTile() {
    const G = this.G;
    const p = G.engine.mouseGround(Input.mouse.nx, Input.mouse.ny, (x, z) => this.sim.world.heightAt(x, z));
    return { x: Math.floor(p.x), z: Math.floor(p.z), p };
  }
  update(dt) {
    // grass shrinks in build view so zones and overlays read clearly (eases in and out)
    const vt = this.active ? 1 : 0;
    if (Math.abs(this.view - vt) > 0.001) { this.view = damp(this.view, vt, 6, dt); if (Math.abs(this.view - vt) < 0.01) this.view = vt; this.sim.world.veg.setBuildView?.(this.view); }
    if (!this.active) return;
    const G = this.G, sim = this.sim, U = sim.terrain.material.userData.u;
    // over the palette: keep using the last world cursor (so drags can finish), but never start actions there
    const overUI = Input.mouse.overUI;
    const cur = overUI && this.lastCur ? this.lastCur : this.cursorTile();
    if (!overUI) this.lastCur = cur;
    if (Input.hit('escape')) { if (this.tool) { this.setTool(null); Input.consume('escape'); } }
    if (Input.mouseHit(2) && this.tool) this.setTool(null);
    // info card for the hovered lot / building (only while browsing or painting zones, never over the palette)
    const inspecting = !overUI && (!this.tool || (this.tool.kind === 'zone' && !this.drag));
    const ins = this.inspectAt(inspecting ? cur : null, dt);
    if (!this.tool) {
      const hb = ins?.kind === 'building' ? sim.buildingAt(cur.x, cur.z) : null;
      if (hb) { const [w, d] = sim.dims(hb.type, hb.rot, hb.level); U.uCursor.value.set(hb.x + w / 2, hb.z + d / 2, w, d); this.cursorCol(ins.ok ? '#bff5da' : '#ffb0bc', 0.16); }
      else { U.uCursor.value.set(cur.x + 0.5, cur.z + 0.5, 1, 1); this.cursorCol('#fff8d8', 0.1); }
      return;
    }
    if (this.tool.kind === 'zone' || this.tool.kind === 'path') {
      if (Input.mouseHit(0) && !overUI) this.drag = { x: cur.x, z: cur.z };
      const a = this.drag || cur;
      const x0 = Math.min(a.x, cur.x), x1 = Math.max(a.x, cur.x), z0 = Math.min(a.z, cur.z), z1 = Math.max(a.z, cur.z);
      const zc = { 1: '#7adc7a', 2: '#6eaaff', 3: '#ffc45a', 0: '#ff8a8a' }[this.tool.zone ?? 0];
      if (this.tool.kind === 'path' && this.drag) { // paths paint as you drag
        if (!overUI && sim.paintPath(cur.x, cur.z, !this.tool.erase)) Events.emit('sfx', 'build_place', { vol: 0.3 });
        U.uCursor.value.set(cur.x + 0.5, cur.z + 0.5, 1, 1); this.cursorCol(this.tool.erase ? '#ff8a8a' : '#f4e2c4', 0.35);
      } else {
        U.uCursor.value.set((x0 + x1 + 1) / 2, (z0 + z1 + 1) / 2, x1 - x0 + 1, z1 - z0 + 1);
        this.cursorCol(this.tool.kind === 'path' ? '#f4e2c4' : zc, this.drag ? 0.35 : 0.2);
      }
      const n = (x1 - x0 + 1) * (z1 - z0 + 1);
      const zname = { 1: 'homes', 2: 'shops', 3: 'workshops', 0: 'unzoned' }[this.tool.zone ?? 0];
      let hint;
      if (this.tool.kind === 'path') hint = this.tool.erase ? 'Drag to remove paths' : 'Drag to lay stone paths';
      else if (this.drag) hint = `${x1 - x0 + 1}×${z1 - z0 + 1} · ${n} tiles → ${zname}`;
      else hint = `Drag to paint a ${zname} zone · villagers build there when there is demand`;
      G.ui?.setInteract?.(hint);
      if (!Input.mouseDown(0) && this.drag) { // finish on mouse-up even if released over the palette
        if (this.tool.kind === 'zone') {
          const k = sim.paintZone(x0, z0, x1, z1, this.tool.zone);
          if (k) {
            Events.emit('sfx', 'build_place', { vol: 0.5 });
            G.vfx.sparkle(new THREE.Vector3((x0 + x1 + 1) / 2, sim.terrain.heightAt(x0, z0) + 0.3, (z0 + z1 + 1) / 2), { n: 10 + Math.min(20, k), r: Math.min(4, (x1 - x0) / 2 + 0.5), color: zc });
          }
        } else sim.refreshTiles();
        this.drag = null;
      }
      return;
    }
    if (overUI) return;
    if (this.tool.kind === 'building') {
      if (Input.hit('r')) { this.rot = (this.rot + 1) % 4; Events.emit('sfx', 'ui_click'); }
      const [w, d] = sim.dims(this.tool.type, this.rot);
      const x0 = Math.round(cur.p.x - w / 2), z0 = Math.round(cur.p.z - d / 2);
      const chk = sim.canPlace(this.tool.type, x0, z0, this.rot);
      const afford = G.actions.hasMaterials(BUILDINGS[this.tool.type].cost);
      const ok = chk.ok && afford;
      U.uCursor.value.set(x0 + w / 2, z0 + d / 2, w, d); this.cursorCol(ok ? '#8affb0' : '#ff7a8a', 0.3);
      // ghost follows smoothly with a little hop
      const target = new THREE.Vector3(x0 + w / 2, sim.terrain.heightAt(x0 + w / 2, z0 + d / 2) + 0.05, z0 + d / 2);
      this.ghost.position.x = damp(this.ghost.position.x, target.x, 22, dt); this.ghost.position.z = damp(this.ghost.position.z, target.z, 22, dt);
      this.ghost.position.y = target.y + Math.abs(Math.sin(G.engine.time * 4)) * 0.08;
      this.ghost.rotation.y = damp(this.ghost.rotation.y, -this.rot * Math.PI / 2, 16, dt);
      if (ok !== this.ghostOk) { this.ghostOk = ok; this.ghost.traverse(o => { if (o.isMesh) o.material = ok ? this.okMat : this.badMat; }); }
      G.ui?.setInteract?.(ok ? 'Click to build · R to rotate' : (!chk.ok ? chk.why : 'Not enough materials'));
      if (Input.mouseHit(0)) {
        const b = sim.place(this.tool.type, x0, z0, this.rot);
        if (b) { G.vfx.sparkle(target.clone().setY(target.y + 1), { n: 20, r: 1.2 }); if (BUILDINGS[this.tool.type].unique) this.setTool(null); }
      }
    } else if (this.tool.kind === 'bulldoze') {
      const b = sim.buildingAt(cur.x, cur.z);
      U.uCursor.value.set(cur.x + 0.5, cur.z + 0.5, 1, 1); this.cursorCol('#ff7a8a', 0.25);
      G.ui?.setInteract?.(b ? (BUILDINGS[b.type].prebuilt ? `${BUILDINGS[b.type].name} can't be removed` : `Click to remove ${BUILDINGS[b.type].name} (50% refund)`) : 'Click a building to remove it');
      if (b) { const [w, d] = sim.dims(b.type, b.rot, b.level); U.uCursor.value.set(b.x + w / 2, b.z + d / 2, w, d); }
      if (Input.mouseHit(0) && b && !BUILDINGS[b.type].prebuilt) sim.remove(b);
    }
  }
}
