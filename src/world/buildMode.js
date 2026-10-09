// Build mode: palette (via UI), ghost preview on the grid, zone/path painting, bulldozer, coverage overlays.
import * as THREE from 'three';
import { BUILDINGS, CATEGORIES, buildModel, sizeOf } from './buildings/index.js';
import { ZONES, RANK_POP } from './village.js';
import { Input } from '../core/input.js';
import { Actions } from '../core/actions.js';
import { Events } from '../core/events.js';
import { WORLD } from './terrain.js';
import { ease, damp } from '../core/util.js';
import { makeToon } from '../gfx/materials.js';
import { paint, merge, xf } from '../gfx/geom.js';
import { PLOTS, DISTRICTS, plotZones } from './plots.js';

// Build-mode lot markers: a little wooden stake with a pink ribbon on each corner of every free, open plot
function stakeGeo() {
  const c = hex => (p, n, o) => o.set(hex);
  return merge([
    paint(xf(new THREE.BoxGeometry(0.07, 0.62, 0.07), { p: [0, 0.31, 0] }), c('#c89a6a')),
    paint(xf(new THREE.ConeGeometry(0.06, 0.1, 4), { p: [0, 0.67, 0] }), c('#a87a52')),
    paint(xf(new THREE.BoxGeometry(0.16, 0.06, 0.02), { p: [0.07, 0.55, 0], r: [0, 0.3, 0] }), c('#ff8fb0')),
  ]);
}

const RANK_REQ = { shrine: 2, boneSmith: 2, waterTower: 2, fountain: 2, onsen: 3, clinic: 3, school: 3, koiStatue: 3, chewyStatue: 4, bridge: 2, sprinkler: 3, guild: 2 }; // (guild: the Adventurers' Guild, docs/COZY.md §5.1)

export class BuildMode {
  constructor(G, sim) {
    this.G = G; this.sim = sim; this.active = false; this.tool = null;
    this.ghost = null; this.ghostKey = ''; this.rot = 0; this.drag = null;
    this.okMat = new THREE.MeshBasicMaterial({ color: '#8affb0', transparent: true, opacity: 0.55, depthWrite: false });
    this.badMat = new THREE.MeshBasicMaterial({ color: '#ff7a8a', transparent: true, opacity: 0.55, depthWrite: false, depthTest: false }); // (drawn on top: a ghost pointed at a building stays visible, red)
    this.prevDist = 34;
    this.view = 0; // 0..1 build-view blend (grass shrink)
    this.lastCur = null;
    this.stakes = null; // InstancedMesh of lot markers (built on first use)
    Events.on('village:changed', () => { if (this.active) this.refreshStakes(); });
  }
  // stakes on the corners of every free, open plot (Build mode only)
  refreshStakes() {
    const sim = this.sim, list = PLOTS.filter(pl => !pl.fixed && sim.plotOpen(pl) && sim.plotFree(pl));
    if (!this.stakes) {
      this.stakes = new THREE.InstancedMesh(stakeGeo(), makeToon({ vertexColors: true, rim: 0.3, brush: 0.1 }), PLOTS.length * 4);
      this.stakes.name = 'plotStakes'; this.stakes.castShadow = false; this.stakes.frustumCulled = false;
      sim.world.scene.add(this.stakes);
    }
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    let n = 0;
    for (const pl of list) for (const [x, z] of [[pl.x + 0.25, pl.z + 0.25], [pl.x + pl.w - 0.25, pl.z + 0.25], [pl.x + 0.25, pl.z + pl.d - 0.25], [pl.x + pl.w - 0.25, pl.z + pl.d - 0.25]]) {
      q.setFromAxisAngle(up, (x * 3.1 + z * 1.7) % 6.28); m.compose(p.set(x, sim.terrain.heightAt(x, z) - 0.03, z), q, sc); this.stakes.setMatrixAt(n++, m);
    }
    this.stakes.count = n; this.stakes.instanceMatrix.needsUpdate = true;
    this.stakes.visible = this.active;
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
  catalog(missing = null) {
    const rank = this.sim.stats.rank, T = this.G.thumbs;
    const cats = [];
    const icon = id => { if (!T) return null; if (!missing || T.has(id)) return T.get(id) || null; missing.push(id); return null; }; // (missing: rendered after the open, fillThumbs)
    for (const [cid, cname] of Object.entries(CATEGORIES)) {
      // prebuilt landmarks are listed too (always 'Already built') so the Landmarks tab shows the whole village set
      const items = Object.entries(BUILDINGS).filter(([id, b]) => b.cat === cid && !b.zone).map(([id, b]) => {
        const need = RANK_REQ[id] || 1;
        const unique = b.unique && this.sim.S.buildings.some(x => x.type === id);
        return { id, name: b.name, cost: b.cost || {}, desc: b.desc, cover: b.cover || null, covers: b.covers || null, size: sizeOf(id, 1), icon: icon(id), locked: unique || b.prebuilt ? 'Already built' : rank < need ? `Village rank ${need}` : null };
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
    const missing = [];
    this.G.ui?.open?.('build', {
      categories: this.catalog(missing),
      onSelect: id => this.setTool({ kind: 'building', type: id }),
      onZone: z => this.setTool(z ? { kind: 'zone', zone: typeof z === 'string' ? ZONES[z] ?? 0 : z } : { kind: 'zone', zone: 0 }),
      onPath: (erase) => this.setTool({ kind: 'path', erase: !!erase }),
      onBulldoze: () => this.setTool({ kind: 'bulldoze' }),
      onOverlay: m => this.overlay(m || 'build'),
      onClose: () => this.exit(),
      stats: () => ({ ...this.sim.stats, demand: this.sim.demand, rankInfo: this.rankInfo() }),
    });
    this.sim.showNeedIcons?.(true);
    this.refreshStakes();
    this.fillThumbs(missing);
    Events.emit('sfx', 'ui_open');
  }
  // Building thumbnails not rendered yet come in after the palette has opened, one every few frames, instead of all
  // inside the open (each is a model build + a render: the first B used to freeze ~1 s, ROADMAP R-8). The idle prewarm
  // (ui/prewarm.js) usually has them all before the first B.
  fillThumbs(ids) {
    const T = this.G.thumbs; if (!T || !ids.length) return;
    let i = 0;
    const step = () => {
      if (!this.active || i >= ids.length) return;
      const id = ids[i++]; this.G.ui?.panels?.build?.setIcon?.(id, T.get(id));
      setTimeout(step, 45);
    };
    const go = () => (T.warmPrograms ? T.warmPrograms(ids[0]) : Promise.resolve()).then(() => setTimeout(step, 0)); // (the thumbnail shaders compile off the main thread first)
    setTimeout(go, 700); // (after the palette's open animation)
  }
  exit() {
    if (!this.active) return;
    this.active = false; this.G.buildMode = false; this.setTool(null);
    this.sim.showNeedIcons?.(false); this.inspectAt(null);
    this.G.engine.rig.distTarget = this.prevDist;
    this.G.engine.rig.yawTarget = Math.round((this.G.engine.rig.yawTarget - Math.PI / 4) / (Math.PI / 2)) * (Math.PI / 2) + Math.PI / 4;
    this.overlay(null);
    if (this.stakes) this.stakes.visible = false;
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
    const m = Actions.pointer();
    ui?.buildInspect?.(this.insInfo, m.x, m.y);
    return this.insInfo;
  }
  cursorTile() {
    const G = this.G, m = Actions.pointer(); // (the mouse, or the pad's virtual cursor: ui/padCursor.js)
    const p = G.engine.mouseGround(m.nx, m.ny, (x, z) => this.sim.world.heightAt(x, z));
    return { x: Math.floor(p.x), z: Math.floor(p.z), p };
  }
  // the pad (docs/CONTROLS.md §2): A is the click, B cancels, Y / RB rotate, X removes (the virtual cursor is on)
  get pad() { return Actions.vcursor.on; }
  hitA() { if (Input.mouseHit(0)) return true; if (this.pad && Actions.padHit('A')) { Actions.padConsume('A'); return true; } return false; }
  downA() { return Input.mouseDown(0) || (this.pad && Actions.padDown('A')); }
  /** a hint for the prompt: the pad's wording (and its A glyph when A does it) */
  say(mouse, pad, act = true) { if (this.pad) this.G.ui?.setInteract?.(pad, { key: act ? 'pad:interact' : null }); else this.G.ui?.setInteract?.(mouse); }
  /** why a building can't be bulldozed ('' if it can): the landmarks stay; the Guild stays while hires live there (cozy/guildRun.js) */
  keepWhy(b) {
    if (BUILDINGS[b.type].prebuilt) return `${BUILDINGS[b.type].name} can't be removed`;
    if (b.type === 'guild' && this.G.state.cozy?.guild?.hires?.length) return "The Guild's hires live here: say goodbye to them first";
    return '';
  }
  /** X on the pad: remove the building under the cursor (press twice; the landmarks stay) */
  padRemove(cur) {
    const sim = this.sim, b = sim.buildingAt(cur.x, cur.z), G = this.G;
    if (!b) { Events.emit('sfx', 'ui_error'); return; }
    const keep = this.keepWhy(b); if (keep) { G.ui?.toast?.(keep, { color: '#ffb0bc' }); return; }
    const now = performance.now();
    if (this._rm?.b === b && now - this._rm.t < 1800) { this._rm = null; sim.remove(b); return; }
    this._rm = { b, t: now };
    G.ui?.toast?.(`Press ${Actions.tokenName('X', 'pad')} again to remove the ${BUILDINGS[b.type].name} (50% refund)`, { color: '#ffd8a8', duration: 1.8 });
  }
  update(dt) {
    // grass shrinks in build view so zones and overlays read clearly (eases in and out)
    const vt = this.active ? 1 : 0;
    if (Math.abs(this.view - vt) > 0.001) { this.view = damp(this.view, vt, 6, dt); if (Math.abs(this.view - vt) < 0.01) this.view = vt; this.sim.world.veg.setBuildView?.(this.view); }
    if (!this.active) return;
    const G = this.G, sim = this.sim, U = sim.terrain.material.userData.u;
    // over the palette: keep using the last world cursor (so drags can finish), but never start actions there
    const overUI = this.pad ? false : Input.mouse.overUI;
    const cur = overUI && this.lastCur ? this.lastCur : this.cursorTile();
    if (!overUI) this.lastCur = cur;
    if (Input.hit('escape')) { if (this.tool) { this.setTool(null); Input.consume('escape'); } }
    if (Input.mouseHit(2) && this.tool) this.setTool(null);
    if (this.pad && Actions.padHit('B') && this.tool) { Actions.padConsume('B'); this.setTool(null); } // (B with nothing in hand leaves build mode: ui/padCursor.js)
    if (this.pad && Actions.padHit('X')) { Actions.padConsume('X'); this.padRemove(cur); }
    // info card for the hovered lot / building (only while browsing or painting zones, never over the palette)
    const inspecting = !overUI && (!this.tool || (this.tool.kind === 'zone' && !this.drag));
    const ins = this.inspectAt(inspecting ? cur : null, dt);
    if (!this.tool) {
      const hb = ins?.kind === 'building' ? sim.buildingAt(cur.x, cur.z) : null;
      if (hb) { const [w, d] = sim.dims(hb.type, hb.rot, hb.level); U.uCursor.value.set(hb.x + w / 2, hb.z + d / 2, w, d); this.cursorCol(ins.ok ? '#bff5da' : '#ffb0bc', 0.16); }
      // a click on a house (no tool): its card — Upgrade / Remodel / Enter (docs/HOUSING.md §5)
      if (this.pad) this.say('', hb ? (G.housing?.isHouse?.(hb) ? `Open the ${BUILDINGS[hb.type]?.name || 'house'}'s card` : BUILDINGS[hb.type]?.name || '') : 'Pick a building or a tool with the D-pad', !!(hb && G.housing?.isHouse?.(hb)));
      if (hb && !overUI && G.housing?.isHouse?.(hb) && this.hitA()) { const rec = sim.list.find(r => r.data === hb); if (rec) G.housing.openHouseCard(rec); }
      else { U.uCursor.value.set(cur.x + 0.5, cur.z + 0.5, 1, 1); this.cursorCol('#fff8d8', 0.1); }
      return;
    }
    if (this.tool.kind === 'zone' || this.tool.kind === 'path') {
      if (!overUI && this.hitA()) this.drag = { x: cur.x, z: cur.z };
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
      else if (this.drag) hint = `${x1 - x0 + 1}×${z1 - z0 + 1} → ${zname} on the plots it covers`;
      else {
        const pl = sim.plotOf(cur.x, cur.z);
        hint = !pl ? 'Zones grow only on plots: paint over the marked lots'
          : !sim.plotOpen(pl) ? `${DISTRICTS[pl.district]?.name || 'This district'} opens at village rank ${pl.rank}`
          : this.tool.zone && !plotZones(pl).includes(this.tool.zone) ? `This plot is not for ${zname}`
          : `Click or drag to paint a ${zname} zone · villagers build there when there is demand`;
      }
      if (this.pad) this.say(hint, this.tool.kind === 'path' ? (this.tool.erase ? 'Hold A and move to remove paths' : 'Hold A and move to lay stone paths') : this.drag ? hint : hint.replace(/^Click or drag to paint/, 'Paint (hold A and move for more)'), !this.drag || this.tool.kind === 'zone');
      else G.ui?.setInteract?.(hint);
      if (!this.downA() && this.drag) { // finish on mouse-up even if released over the palette
        if (this.tool.kind === 'zone') {
          const k = sim.paintZone(x0, z0, x1, z1, this.tool.zone);
          if (!sim.lastZoneHits && this.tool.zone) G.ui?.toast?.('Zones only grow on plots: paint over the marked lots', { color: '#ffb0bc' });
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
      const type = this.tool.type, pl = sim.plotOf(cur.p.x, cur.p.z);
      // on a plot that allows it: the building snaps to the plot, its door to the street (no free rotation)
      const snap = pl && !pl.fixed && pl.allows.includes(type) ? sim.spotFor(pl, type, 1) : null;
      if (!snap && (Input.hit('r') || (this.pad && (Actions.padHit('Y') || Actions.padHit('RB'))))) { this.rot = (this.rot + 1) % 4; Events.emit('sfx', 'ui_click'); }
      const rot = snap ? snap.rot : this.rot;
      const [w, d] = sim.dims(type, rot);
      const x0 = snap ? snap.x : Math.round(cur.p.x - w / 2), z0 = snap ? snap.z : Math.round(cur.p.z - d / 2);
      let chk = snap ? sim.canPlace(type, x0, z0, rot, 1, -1, pl.id) : sim.needsPlot(type) ? { ok: false, why: pl ? `This plot isn't for a ${BUILDINGS[type].name}` : `Build the ${BUILDINGS[type].name} on a free plot` } : sim.canPlace(type, x0, z0, rot);
      if (chk.ok && snap && !sim.plotOpen(pl)) chk = { ok: false, why: `${DISTRICTS[pl.district]?.name || 'This district'} opens at village rank ${pl.rank}` };
      else if (chk.ok && snap && !sim.plotFree(pl)) chk = { ok: false, why: 'This plot is taken' };
      const afford = G.actions.hasMaterials(BUILDINGS[type].cost);
      const ok = chk.ok && afford;
      U.uCursor.value.set(x0 + w / 2, z0 + d / 2, w, d); this.cursorCol(ok ? '#8affb0' : '#ff7a8a', 0.3);
      // ghost follows smoothly with a little hop
      const target = new THREE.Vector3(x0 + w / 2, sim.terrain.heightAt(x0 + w / 2, z0 + d / 2) + 0.05, z0 + d / 2);
      this.ghost.position.x = damp(this.ghost.position.x, target.x, 22, dt); this.ghost.position.z = damp(this.ghost.position.z, target.z, 22, dt);
      this.ghost.position.y = target.y + Math.abs(Math.sin(G.engine.time * 4)) * 0.08;
      this.ghost.rotation.y = damp(this.ghost.rotation.y, -rot * Math.PI / 2, 16, dt);
      if (ok !== this.ghostOk) { this.ghostOk = ok; this.ghost.traverse(o => { if (o.isMesh) { o.material = ok ? this.okMat : this.badMat; o.renderOrder = ok ? 0 : 20; } }); }
      if (this.pad) this.say('', ok ? (snap ? `Build on this ${DISTRICTS[pl.district]?.name || ''} plot` : `Build here · ${Actions.tokenName('Y', 'pad')} rotates`) : (!chk.ok ? chk.why : 'Not enough materials'), ok);
      else G.ui?.setInteract?.(ok ? (snap ? `Click to build on this ${DISTRICTS[pl.district]?.name || ''} plot` : 'Click to build · R to rotate') : (!chk.ok ? chk.why : 'Not enough materials'));
      if (this.hitA()) {
        const b = sim.place(type, x0, z0, rot, snap ? { plot: pl.id } : {});
        if (b) { G.vfx.sparkle(target.clone().setY(target.y + 1), { n: 20, r: 1.2 }); if (BUILDINGS[this.tool.type].unique) this.setTool(null); }
      }
    } else if (this.tool.kind === 'bulldoze') {
      const b = sim.buildingAt(cur.x, cur.z);
      U.uCursor.value.set(cur.x + 0.5, cur.z + 0.5, 1, 1); this.cursorCol('#ff7a8a', 0.25);
      const keep = b ? this.keepWhy(b) : '';
      if (this.pad) this.say('', b ? (keep || `Remove ${BUILDINGS[b.type].name} (50% refund)`) : 'Point at a building to remove it', !!b && !keep);
      else G.ui?.setInteract?.(b ? (keep || `Click to remove ${BUILDINGS[b.type].name} (50% refund)`) : 'Click a building to remove it');
      if (b) { const [w, d] = sim.dims(b.type, b.rot, b.level); U.uCursor.value.set(b.x + w / 2, b.z + d / 2, w, d); }
      if (b && !keep && this.hitA()) sim.remove(b);
    }
  }
}
