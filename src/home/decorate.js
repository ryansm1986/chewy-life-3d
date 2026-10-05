// Decorate mode (docs/HOUSING.md §2): B indoors (or the HUD's Decorate button). A 0.5 m floor grid and wall grid
// strips; the palette (ui/decorate.js) lists your furniture storage; pick an item for a ghost that follows the mouse
// (green / red by placement.js canPlace), R rotates, click places. Wall items snap to the back walls, tabletop items
// onto anything with a `surface`, rugs under furniture, ceiling lamps over the floor. Click a placed item to pick it
// up (move it, or Store it back), Ctrl+Z undoes. Wallpaper and floors apply from the palette's last tab.
// WASD pans the camera, the wheel zooms; the player stays where they are.
import * as THREE from 'three';
import { Input } from '../core/input.js';
import { Events } from '../core/events.js';
import { FURNITURE, SURFACES, CELL, footprint, itemDef } from './furniture.js';
import { canPlace, poseOf, boxOf, cellsOf, wallSpan, nextK, WALL_STEP } from './placement.js';
import { WALL_H, CEIL_H, WALL_MIN, isBack } from './rooms.js';
import { ORIGIN } from './interiorWorld.js';
import { furnitureGroup } from './furnitureMesh.js';
import { clamp, damp } from '../core/util.js';

const _ray = new THREE.Ray(), _v = new THREE.Vector3(), _box = new THREE.Box3(), _hit = new THREE.Vector3();
const _rc = new THREE.Raycaster();

export class Decorator {
  constructor(G, housing) {
    this.G = G; this.H = housing; this.active = false;
    this.sel = null;   // an id picked from the palette (placing a new one from storage)
    this.hold = null;  // a placed item picked up to move: { it, kids: [...], before }
    this.rot = 0; this.undoStack = [];
    this.okMat = new THREE.MeshBasicMaterial({ color: '#8affb0', transparent: true, opacity: 0.38, depthWrite: false });
    this.badMat = new THREE.MeshBasicMaterial({ color: '#ff7a8a', transparent: true, opacity: 0.5, depthWrite: false });
    this.cellOk = new THREE.MeshBasicMaterial({ color: '#7cf0b0', transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });
    this.cellBad = new THREE.MeshBasicMaterial({ color: '#ff6f86', transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide });
    this.cellHover = new THREE.MeshBasicMaterial({ color: '#ffe48a', transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide });
    this.gridMat = new THREE.LineBasicMaterial({ color: '#7a4a3a', transparent: true, opacity: 0.3, depthWrite: false });
    this.cellGeo = new THREE.PlaneGeometry(CELL * 0.86, CELL * 0.86);
  }
  get W() { return this.H.world; }
  get I() { return this.H.rec?.data.interior; }
  get items() { return this.W?.items || []; }

  // ---------------------------------------------------------------- mode
  enter() {
    const G = this.G, H = this.H;
    if (this.active || !H.inside) return false;
    if (!H.canDecorate()) { G.ui?.toast?.("You can't redecorate someone else's home!", { color: '#ffb0bc', icon: 'home' }); return false; }
    this.active = true; G.decorating = true;
    const P = G.player; P.moveTarget = null; P.interactTarget = null; P.route?.clear?.();
    P.controlLocked = true; // (WASD pans the camera while decorating; the player stays put)
    const rig = G.engine.rig, W = this.W;
    this.cam0 = rig.distTarget; rig.distTarget = 19; rig.maxDist = 23;
    // the room sits a little above the screen's middle, clear of the palette along the bottom
    const { f } = rig.groundAxes();
    this.focus = W.centre.clone().addScaledVector(f, -1.3).setY(0.9);
    G.decorFocus = this.focus;
    this.buildGrid();
    this.cursor = new THREE.InstancedMesh(this.cellGeo, this.cellOk, 48); this.cursor.count = 0; this.cursor.frustumCulled = false; this.cursor.renderOrder = 6;
    W.scene.add(this.cursor);
    G.ui?.open?.('decorate', this.paletteOpts());
    Events.emit('sfx', 'ui_open');
    Events.emit('decor:enter', {});
    return true;
  }
  exit() {
    const G = this.G; if (!this.active) return;
    this.cancel(true);
    this.active = false; G.decorating = false; G.decorFocus = null;
    G.player.controlLocked = false;
    const rig = G.engine.rig; rig.distTarget = this.cam0 || 13.5; rig.maxDist = 19;
    this.grid?.removeFromParent(); this.grid?.geometry.dispose(); this.grid = null;
    this.cursor?.removeFromParent(); this.cursor?.dispose(); this.cursor = null;
    this.dropGhost();
    if (G.ui?.isOpen?.('decorate')) G.ui.close('decorate');
    G.ui?.setInteract?.(null);
    G.save?.();
    Events.emit('decor:exit', {});
  }
  toggle() { return this.active ? (this.exit(), false) : this.enter(); }
  paletteOpts() {
    return {
      house: () => ({ name: this.H.home?.name || 'Home', wall: this.W?.wallId, floor: this.W?.floorId, own: [this.I?.ownWall, this.I?.ownFloor].filter(Boolean), rating: this.H.ratingNow?.() || null, owner: this.H.home?.owner || null }),
      state: () => ({ sel: this.sel, holding: this.hold ? this.hold.it.id : null, canUndo: this.undoStack.length > 0 }),
      onSelect: id => this.select(id),
      onSurface: id => this.applySurface(id),
      onStore: () => this.storeHeld(),
      onUndo: () => this.undo(),
      onCancel: () => this.cancel(),
      onClose: () => { if (this.active) this.exit(); },
    };
  }
  /** Esc in the UI: cancel what's in hand first; returns true when it did something */
  onEscape() { if (this.sel || this.hold) { this.cancel(); return true; } return false; }

  // ---------------------------------------------------------------- choosing
  select(id) {
    if (!FURNITURE[id]) return;
    if (this.hold) this.cancel();
    const st = this.G.state.furniture || {};
    if ((st[id] || 0) <= 0) { this.G.ui?.toast?.('None left in storage', { color: '#ffb0bc' }); return; }
    this.sel = this.sel === id ? null : id;
    this.rot = 0; this.makeGhost(this.sel);
    Events.emit('sfx', 'ui_click');
    this.refreshUI();
  }
  cancel(quiet) {
    if (this.hold) { // put it back where it was
      const h = this.hold; this.hold = null;
      this.H.refresh();
      if (!quiet) Events.emit('sfx', 'ui_close', { vol: 0.5 });
      void h;
    }
    this.sel = null; this.dropGhost(); this.refreshUI();
  }
  pickUp(it) {
    const kids = it.mount === 'floor' || it.mount === 'table' ? this.items.filter(o => o.mount === 'table' && o.on === it.k) : [];
    this.hold = { it, kids, before: { ...it }, kidsBefore: kids.map(k => ({ ...k })) };
    this.sel = null; this.rot = it.rot || 0;
    this.makeGhost(it.id, kids);
    this.H.refresh(new Set([it.k]));
    Events.emit('sfx', 'pickup_item', { vol: 0.5 });
    Events.emit('decor:pick', { id: it.id, k: it.k });
    this.refreshUI();
  }

  // ---------------------------------------------------------------- the ghost
  makeGhost(id, kids = []) {
    this.dropGhost(); if (!id) return;
    const g = new THREE.Group(); g.name = 'decor:ghost';
    const main = furnitureGroup(id); g.add(main);
    this.ghostKids = kids.map(k => { const m = furnitureGroup(k.id); g.add(m); return { k, m }; });
    g.traverse(o => { if (o.isMesh) { o.userData.mat0 = o.material; o.castShadow = false; o.renderOrder = 5; } });
    this.ghost = g; this.ghostMain = main; this.ghostOk = null;
    this.W.scene.add(g);
  }
  dropGhost() { this.ghost?.removeFromParent(); this.ghost = null; this.ghostMain = null; this.ghostKids = []; }
  tint(ok) {
    if (ok === this.ghostOk || !this.ghost) return;
    this.ghostOk = ok;
    this.ghost.traverse(o => { if (o.isMesh) o.material = ok ? o.userData.mat0 : this.badMat; });
  }

  // ---------------------------------------------------------------- per frame
  update(dt, rdt) {
    if (!this.active) return;
    const G = this.G, W = this.W, rig = G.engine.rig;
    if (!W?.S) return;
    // camera: WASD pans over the room, the wheel zooms
    const { f, r } = rig.groundAxes(), d = _v.set(0, 0, 0);
    if (!G.ui?.dlg?.active) { if (Input.down('w')) d.add(f); if (Input.down('s')) d.sub(f); if (Input.down('d')) d.add(r); if (Input.down('a')) d.sub(r); }
    this.focus.addScaledVector(d, rdt * 6);
    this.H.clampFocus(this.focus, -1.2);
    if (Input.mouse.wheel) rig.zoom(Input.mouse.wheel);
    if (G.ui?.anyModal?.()) { this.cursor && (this.cursor.count = 0); return; }
    // keys
    if (Input.down('ctrl') && Input.hit('z')) { Input.consume('z'); this.undo(); }
    if ((Input.hit('delete') || Input.hit('backspace')) && this.hold) this.storeHeld();
    if (Input.mouseHit(2) && (this.sel || this.hold)) { Input.consumeMouse(2); this.cancel(); }
    const overUI = Input.mouse.overUI;
    const id = this.hold?.it.id || this.sel;
    if (!id) { this.hover(overUI); return; }
    if (Input.hit('r') && FURNITURE[id].mount !== 'wall') { this.rot = (this.rot + 1) % 4; Events.emit('sfx', 'ui_tab'); }
    const cand = overUI ? this.lastCand : this.candidate(id);
    if (!overUI) this.lastCand = cand;
    if (!cand) { this.ghost && (this.ghost.visible = false); this.cursor.count = 0; G.ui?.setInteract?.(FURNITURE[id].mount === 'wall' ? 'Point at a back wall' : FURNITURE[id].mount === 'table' ? 'Point at a table or a shelf' : 'Point at the floor'); return; }
    const P = G.player, [pcx, pcz] = W.cellAt(P.pos.x, P.pos.z);
    const guests = this.H.hosts.map(v => { const [x, z] = W.cellAt(v.pos.x, v.pos.z); return { x, z }; });
    const chk = canPlace(W.layout, this.items, cand, { skip: this.hold?.it || null, player: { x: pcx, z: pcz }, guests });
    this.showGhost(cand, chk.ok, dt);
    this.showCells(cand, chk.ok);
    G.ui?.setInteract?.(chk.ok ? `Click to ${this.hold ? 'put down' : 'place'} the ${FURNITURE[id].name}${FURNITURE[id].mount === 'wall' ? '' : ' · R to rotate'}` : chk.why);
    if (Input.mouseHit(0) && !overUI) {
      Input.consumeMouse(0);
      if (chk.ok) this.place(cand); else { Events.emit('sfx', 'ui_error'); this.G.ui?.float?.(this.ghost.position.clone().setY(this.ghost.position.y + 1), chk.why, { kind: 'status', color: '#ffb0bc' }); }
    }
  }
  /** what's under the mouse when nothing is in hand: highlight it, and a click picks it up */
  hover(overUI) {
    const G = this.G, it = overUI ? null : this.itemAtMouse();
    this.showHover(it);
    G.ui?.setInteract?.(it ? `Click to move the ${FURNITURE[it.id].name}` : 'Pick something from the palette · click furniture to move it');
    if (it && Input.mouseHit(0)) { Input.consumeMouse(0); this.pickUp(it); }
  }
  ray() { const G = this.G; _rc.setFromCamera({ x: Input.mouse.nx, y: Input.mouse.ny }, G.engine.camera); return _rc.ray; }
  itemAtMouse() {
    const r = this.ray(), items = this.items;
    let best = null, bt = 1e9;
    for (const it of items) {
      const b = boxOf(it, items);
      _box.min.set(ORIGIN + b[0], b[1], ORIGIN + b[2]); _box.max.set(ORIGIN + b[3], Math.max(b[4], b[1] + 0.05), ORIGIN + b[5]);
      const h = r.intersectBox(_box, _hit); if (!h) continue;
      let t = r.origin.distanceTo(_hit);
      if (it.mount === 'table') t -= 0.3; // small things on top win over the table they stand on
      if (it.mount === 'rug') t += 0.5;   // and rugs lose to whatever stands on them
      if (t < bt) { bt = t; best = it; }
    }
    return best;
  }
  /** a candidate placement for item `id` under the mouse (null when the mouse isn't over a valid surface) */
  candidate(id) {
    const d = FURNITURE[id], W = this.W, S = W.S, r = this.ray();
    if (d.mount === 'wall') return this.wallCandidate(id, r);
    const [fw, fd] = footprint(d, this.rot);
    if (d.mount === 'table') {
      let best = null, bt = 1e9;
      for (const h of this.items) {
        const hd = FURNITURE[h.id]; if (!hd.surface || h === this.hold?.it || h.mount !== 'floor') continue;
        const y = hd.surface; if (Math.abs(r.direction.y) < 1e-4) continue;
        const t = (y - r.origin.y) / r.direction.y; if (t < 0 || t > bt) continue;
        const px = r.origin.x + r.direction.x * t, pz = r.origin.z + r.direction.z * t;
        const [cx, cz] = W.cellAt(px, pz);
        const cells = cellsOf(h); if (!cells.some(([x, z]) => x === cx && z === cz)) continue;
        const xs = cells.map(c => c[0]), zs = cells.map(c => c[1]);
        const x0 = clamp(cx - Math.floor((fw - 1) / 2), Math.min(...xs), Math.max(...xs) - fw + 1), z0 = clamp(cz - Math.floor((fd - 1) / 2), Math.min(...zs), Math.max(...zs) - fd + 1);
        bt = t; best = { k: this.hold?.it.k ?? 0, id, mount: 'table', on: h.k, x: x0, z: z0, rot: this.rot };
      }
      return best;
    }
    // the floor plane (ceiling lamps too: they hang over the cell you point at)
    if (Math.abs(r.direction.y) < 1e-4) return null;
    const t = (0 - r.origin.y) / r.direction.y; if (t < 0) return null;
    const px = r.origin.x + r.direction.x * t, pz = r.origin.z + r.direction.z * t;
    const [cx, cz] = W.cellAt(px, pz);
    if (cx < -2 || cz < -2 || cx > S.W + 1 || cz > S.D + 1) return null;
    return { k: this.hold?.it.k ?? 0, id, mount: d.mount === 'rug' ? 'rug' : d.mount === 'ceiling' ? 'ceiling' : 'floor', x: cx - Math.floor((fw - 1) / 2), z: cz - Math.floor((fd - 1) / 2), rot: this.rot };
  }
  wallCandidate(id, r) {
    const d = FURNITURE[id], W = this.W, S = W.S, w = d.size[0], h = d.size[1] * CELL;
    let best = null, bt = 1e9;
    for (const run of S.walls) {
      if (!isBack(run)) continue;
      const horiz = run.side === 'n', line = ORIGIN + (horiz ? run.z0 : run.x0) * CELL;
      const dir = horiz ? r.direction.z : r.direction.x, org = horiz ? r.origin.z : r.origin.x;
      if (Math.abs(dir) < 1e-4) continue;
      const t = (line - org) / dir; if (t < 0 || t > bt) continue;
      const px = r.origin.x + r.direction.x * t, py = r.origin.y + r.direction.y * t, pz = r.origin.z + r.direction.z * t;
      const u = ((horiz ? px : pz) - ORIGIN) / CELL, a = horiz ? run.x0 : run.z0, b = horiz ? run.x1 : run.z1;
      if (u < a - 0.5 || u > b + 0.5 || py < -0.2 || py > WALL_H + 0.4) continue;
      const u0 = clamp(Math.floor(u) - Math.floor((w - 1) / 2), a, b - w);
      const y = clamp(Math.round((py - h / 2) / WALL_STEP) * WALL_STEP, WALL_MIN, WALL_H - 0.15 - h);
      bt = t;
      best = horiz ? { k: this.hold?.it.k ?? 0, id, mount: 'wall', side: 'n', x: u0, z: run.z0, y } : { k: this.hold?.it.k ?? 0, id, mount: 'wall', side: 'w', x: run.x0, z: u0, y };
    }
    return best;
  }
  showGhost(cand, ok, dt) {
    const g = this.ghost; if (!g) return;
    g.visible = true;
    const items = this.hold ? this.items.map(o => (o === this.hold.it ? cand : o)) : [...this.items, cand];
    const p = poseOf(cand, items), lift = cand.mount === 'wall' ? 0 : 0.05 + Math.abs(Math.sin(this.G.engine.time * 4)) * 0.05;
    const tx = ORIGIN + p.x, tz = ORIGIN + p.z;
    if (this.ghostAt !== cand.id + cand.mount) { g.position.set(tx, p.y + lift, tz); this.ghostAt = cand.id + cand.mount; }
    g.position.x = damp(g.position.x, tx, 24, dt); g.position.z = damp(g.position.z, tz, 24, dt); g.position.y = damp(g.position.y, p.y + lift, 24, dt);
    this.ghostMain.rotation.y = p.yaw; this.ghostMain.position.set(0, 0, 0);
    // things riding on a table being moved: same offsets, turned with it
    if (this.hold && this.ghostKids.length) {
      const h0 = this.hold.before, turns = ((cand.rot || 0) - (h0.rot || 0) + 4) % 4;
      for (const { k, m } of this.ghostKids) {
        const nk = this.kidAt(k, this.hold.kidsBefore.find(q => q.k === k.k), h0, cand, turns);
        const kp = poseOf(nk, [...items.filter(o => o !== k), nk]);
        m.position.set(ORIGIN + kp.x - tx, kp.y - p.y, ORIGIN + kp.z - tz); m.rotation.y = kp.yaw;
      }
    }
    this.tint(ok);
  }
  /** where a table item ends up when its host moves from h0 to h1 with `turns` quarter turns */
  kidAt(k, k0, h0, h1, turns) {
    const hd = FURNITURE[h0.id], [hw, hdp] = footprint(hd, h0.rot || 0), kd = FURNITURE[k.id];
    let rx = k0.x - h0.x, rz = k0.z - h0.z, [w, dd] = footprint(kd, k0.rot || 0), W0 = hw, D0 = hdp;
    for (let i = 0; i < turns; i++) { const nx = D0 - rz - dd, nz = rx; rx = nx; rz = nz; [w, dd] = [dd, w]; [W0, D0] = [D0, W0]; }
    return { ...k, on: h1.k || h0.k, x: h1.x + rx, z: h1.z + rz, rot: ((k0.rot || 0) + turns) % 4 };
  }
  showCells(cand, ok) {
    const C = this.cursor; if (!C) return;
    C.material = ok ? this.cellOk : this.cellBad;
    const items = this.hold ? this.items.map(o => (o === this.hold.it ? cand : o)) : [...this.items, cand];
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    let n = 0;
    if (cand.mount === 'wall') {
      const sp = wallSpan(cand), rows = Math.round((sp.y1 - sp.y0) / CELL);
      for (let u = sp.u0; u < sp.u1; u++) for (let j = 0; j < rows; j++) {
        const y = sp.y0 + (j + 0.5) * CELL;
        if (sp.side === 'n') { q.identity(); p.set(ORIGIN + (u + 0.5) * CELL, y, ORIGIN + sp.line * CELL + 0.01); }
        else { q.setFromAxisAngle(_v.set(0, 1, 0), Math.PI / 2); p.set(ORIGIN + sp.line * CELL + 0.01, y, ORIGIN + (u + 0.5) * CELL); }
        if (n < 48) C.setMatrixAt(n++, m.compose(p, q, s));
      }
    } else {
      const y = cand.mount === 'table' ? (FURNITURE[items.find(o => o.k === cand.on)?.id]?.surface || 0) + 0.01 : 0.012;
      q.setFromAxisAngle(_v.set(1, 0, 0), -Math.PI / 2);
      for (const [x, z] of cellsOf(cand)) if (n < 48) C.setMatrixAt(n++, m.compose(p.set(ORIGIN + (x + 0.5) * CELL, y, ORIGIN + (z + 0.5) * CELL), q, s));
    }
    C.count = n; C.instanceMatrix.needsUpdate = true;
  }
  showHover(it) {
    const C = this.cursor; if (!C) return;
    if (!it) { C.count = 0; return; }
    if (it.mount === 'wall') { this.showCells(it, true); C.material = this.cellHover; return; }
    this.showCells(it, true); C.material = this.cellHover;
  }

  // ---------------------------------------------------------------- actions
  place(cand) {
    const G = this.G, A = G.actions, W = this.W, I = this.I, items = this.items;
    let placed;
    if (this.hold) {
      const h = this.hold, it = h.it, turns = ((cand.rot || 0) - (h.before.rot || 0) + 4) % 4;
      Object.assign(it, cand, { k: it.k });
      if (it.mount !== 'wall') { delete it.side; delete it.y; }
      if (it.mount !== 'table') delete it.on;
      const lost = [];
      for (const k of h.kids) {
        const nk = this.kidAt(k, h.kidsBefore.find(q => q.k === k.k), h.before, it, turns);
        Object.assign(k, nk);
      }
      // (a tabletop item that no longer fits goes back to storage)
      for (const k of h.kids) { const c = canPlace(W.layout, items, k, { skip: k }); if (!c.ok) lost.push(k); }
      for (const k of lost) { items.splice(items.indexOf(k), 1); A.addFurniture(k.id, 1, { src: 'store' }); }
      this.push({ kind: 'move', k: it.k, before: h.before, kids: h.kidsBefore, lost: lost.map(k => ({ ...k })) });
      placed = it;
      this.hold = null; this.dropGhost();
      Events.emit('sfx', 'build_place', { vol: 0.55 });
      Events.emit('decor:move', { id: it.id, k: it.k });
    } else {
      if (!A.spendFurniture({ [cand.id]: 1 })) { G.ui?.toast?.('None left in storage', { color: '#ffb0bc' }); this.cancel(); return; }
      const it = { ...cand, k: nextK(items) };
      if (it.mount !== 'wall') { delete it.side; delete it.y; }
      if (it.mount !== 'table') delete it.on;
      items.push(it); placed = it;
      this.push({ kind: 'place', k: it.k });
      Events.emit('sfx', 'build_place', { vol: 0.6 });
      Events.emit('decor:place', { id: it.id, k: it.k, mount: it.mount });
      if (!(G.state.furniture?.[cand.id] > 0)) { this.sel = null; this.dropGhost(); }
    }
    I.items = items;
    this.H.refresh();
    const p = poseOf(placed, items);
    this.G.vfx?.sparkle?.(new THREE.Vector3(ORIGIN + p.x, p.y + 0.4, ORIGIN + p.z), { n: 12, r: 0.5, color: '#ffe8a0' });
    this.refreshUI();
  }
  storeHeld() {
    const h = this.hold; if (!h) return;
    const A = this.G.actions, items = this.items;
    const gone = [h.it, ...h.kids];
    if (gone.some(it => it.own)) { // (a villager's own piece: theirs to keep — move it, don't take it)
      const sp = poseOf(h.it, [h.it]), who = this.H.home?.owner ? this.H.nameOf(this.H.home.owner) : 'They';
      this.G.ui?.float?.(new THREE.Vector3(ORIGIN + sp.x, sp.y + 0.9, ORIGIN + sp.z), `${who}'s — you can move it, not take it`, { kind: 'status', color: '#ffb0bc' });
      Events.emit('sfx', 'ui_error'); return;
    }
    for (const it of gone) { const i = items.indexOf(it); if (i >= 0) items.splice(i, 1); A.addFurniture(it.id, 1, { src: 'store' }); }
    this.push({ kind: 'store', items: [h.before, ...h.kidsBefore] });
    this.hold = null; this.dropGhost();
    this.I.items = items;
    this.H.refresh();
    Events.emit('sfx', 'pickup_item', { vol: 0.6, pitch: 1.2 });
    Events.emit('decor:store', { id: h.it.id });
    const sp = poseOf(h.before, [h.before]);
    this.G.ui?.float?.(new THREE.Vector3(ORIGIN + sp.x, sp.y + 0.9, ORIGIN + sp.z), 'Stored ♡', { kind: 'status', color: '#ffd8a8' });
    this.refreshUI();
  }
  applySurface(id) {
    const s = SURFACES[id], W = this.W, I = this.I, A = this.G.actions; if (!s || !I) return;
    const kind = s.kind, cur = kind === 'wall' ? I.wall : I.floor;
    if (cur === id) return;
    const theirs = id === I.ownWall || id === I.ownFloor; // (back to the villager's own wallpaper / floor: free)
    if (!s.free && !theirs && !A.spendFurniture({ [id]: 1 })) { this.G.ui?.toast?.('None left in storage', { color: '#ffb0bc' }); return; }
    if (cur && SURFACES[cur] && !SURFACES[cur].free && cur !== I.ownWall && cur !== I.ownFloor) A.addFurniture(cur, 1, { src: 'store' }); // (a villager's own wallpaper stays theirs)
    if (kind === 'wall') I.wall = id; else I.floor = id;
    W.setSurface(kind, id);
    this.push({ kind: 'surface', which: kind, before: cur, after: id });
    Events.emit('sfx', 'build_place', { vol: 0.5, pitch: 1.2 });
    Events.emit('decor:surface', { kind, id });
    this.refreshUI();
  }
  push(e) { this.undoStack.push(e); if (this.undoStack.length > 40) this.undoStack.shift(); }
  undo() {
    if (this.hold || this.sel) this.cancel(true);
    const e = this.undoStack.pop(); if (!e) { Events.emit('sfx', 'ui_error'); return; }
    const A = this.G.actions, items = this.items, I = this.I, W = this.W;
    if (e.kind === 'place') {
      const it = items.find(o => o.k === e.k);
      if (it) { for (const k of items.filter(o => o.mount === 'table' && o.on === it.k)) { items.splice(items.indexOf(k), 1); A.addFurniture(k.id, 1, { src: 'store' }); } items.splice(items.indexOf(it), 1); A.addFurniture(it.id, 1, { src: 'store' }); }
    } else if (e.kind === 'move') {
      const it = items.find(o => o.k === e.k);
      if (it) { for (const key of Object.keys(it)) delete it[key]; Object.assign(it, e.before); }
      for (const kb of e.kids) { const k = items.find(o => o.k === kb.k); if (k) { for (const key of Object.keys(k)) delete k[key]; Object.assign(k, kb); } }
      for (const kb of e.lost || []) { if (A.spendFurniture({ [kb.id]: 1 })) items.push({ ...kb, ...e.kids.find(q => q.k === kb.k) }); }
    } else if (e.kind === 'store') {
      for (const it of e.items) if (A.spendFurniture({ [it.id]: 1 })) items.push({ ...it });
    } else if (e.kind === 'surface') {
      const s = SURFACES[e.after];
      if (e.before && SURFACES[e.before] && !SURFACES[e.before].free && e.before !== I.ownWall && e.before !== I.ownFloor) A.spendFurniture({ [e.before]: 1 });
      if (s && !s.free && e.after !== I.ownWall && e.after !== I.ownFloor) A.addFurniture(e.after, 1, { src: 'store' });
      if (e.which === 'wall') I.wall = e.before; else I.floor = e.before;
      W.setSurface(e.which, e.before);
    }
    I.items = items;
    this.H.refresh();
    Events.emit('sfx', 'ui_tab');
    Events.emit('decor:undo', { kind: e.kind });
    this.refreshUI();
  }
  // ---------------------------------------------------------------- grid
  buildGrid() {
    const S = this.W.S, P = [], y = 0.01;
    for (let z = 0; z <= S.D; z++) for (let x = 0; x < S.W; x++) if (S.isFloor(x, z) || S.isFloor(x, z - 1)) P.push(ORIGIN + x * CELL, y, ORIGIN + z * CELL, ORIGIN + (x + 1) * CELL, y, ORIGIN + z * CELL);
    for (let x = 0; x <= S.W; x++) for (let z = 0; z < S.D; z++) if (S.isFloor(x, z) || S.isFloor(x - 1, z)) P.push(ORIGIN + x * CELL, y, ORIGIN + z * CELL, ORIGIN + x * CELL, y, ORIGIN + (z + 1) * CELL);
    // wall grid strips on the back walls: half-metre columns and rows from 0.25 m up to the head rail
    for (const run of S.walls) {
      if (!isBack(run)) continue;
      const horiz = run.side === 'n', line = ORIGIN + (horiz ? run.z0 : run.x0) * CELL + 0.012, a = horiz ? run.x0 : run.z0, b = horiz ? run.x1 : run.z1;
      const at = (u, yy) => (horiz ? [ORIGIN + u * CELL, yy, line] : [line, yy, ORIGIN + u * CELL]);
      for (let u = a; u <= b; u++) P.push(...at(u, WALL_MIN), ...at(u, 1.98));
      for (let yy = WALL_MIN; yy <= 1.99; yy += 0.5) P.push(...at(a, yy), ...at(b, yy));
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    this.grid = new THREE.LineSegments(g, this.gridMat); this.grid.renderOrder = 4; this.grid.frustumCulled = false; this.grid.name = 'decor:grid';
    this.W.scene.add(this.grid);
  }
  refreshUI() { this.G.ui?.panels?.decorate?.refresh?.(); }
}
