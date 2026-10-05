// The house card and the Remodel panel (docs/HOUSING.md §5-6).
//  - HouseCardPanel ('houseCard', opened from a house's mailbox or by clicking a house in Build mode): the house's
//    picture, name, level, Home Rating and residents, and Upgrade (the level cost, what it needs) / Remodel / Enter.
//  - RemodelPanel ('remodel'): a live preview of the house (it re-renders as you choose), the four style sets, and a
//    row of swatches or option chips per part (roof colour and shape, walls, trim, door and its colour, windows, noren
//    and its mark, fence and its colour, festival bunting); the cost of the change and Apply.
import * as THREE from 'three';
import { esc, replay } from './dom.js';
import { glyph } from './glyphs.js';
import { Panel } from './panel.js';
import { BUILDINGS, buildModel, sizeOf, releaseModel } from '../world/buildings/index.js';
import { FIELDS, FIELD_IDS, STYLE_SETS, STYLE_SET_IDS, cleanStyle, setStyle, withField, lockOf } from '../world/buildings/styles.js';
import { homeRating, starText } from '../home/rating.js';
import { U } from '../gfx/materials.js';
import { Events } from '../core/events.js';
import './remodel.css';

const MAT_NAME = { coins: 'coins', wood: 'wood', stone: 'stone', petal: 'petals', silk: 'silk', lantern: 'lanterns', crystal: 'crystals', bone: 'bones', mochi: 'mochi' };
/** cost chips: have / need per material */
function costHTML(st, cost) {
  const e = Object.entries(cost || {}).filter(([, n]) => n > 0);
  if (!e.length) return `<span class="rm-free">${glyph('check')}Free</span>`;
  return e.map(([k, n]) => { const have = k === 'coins' ? st.coins || 0 : st.materials?.[k] || 0; return `<span class="rm-c ${have >= n ? 'ok' : 'bad'}" title="${esc(MAT_NAME[k] || k)}">${glyph(k === 'coins' ? 'coin' : k)}<b>${n}</b></span>`; }).join('');
}

// ------------------------------------------------------------------ a small preview renderer (its own scene + target)
class Preview {
  constructor(engine, w = 560, h = 400) {
    this.engine = engine; this.w = w; this.h = h;
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight('#fff4e8', '#b8a0c8', 1.25));
    const key = new THREE.DirectionalLight('#fff0dc', 2.4); key.position.set(6, 10, 7); this.scene.add(key);
    const rim = new THREE.DirectionalLight('#c8d8ff', 0.6); rim.position.set(-6, 4, -5); this.scene.add(rim);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(3.4, 40).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#a8d088' }));
    ground.position.y = -0.01; this.scene.add(ground);
    this.cam = new THREE.PerspectiveCamera(26, w / h, 0.1, 100);
    this.rt = new THREE.WebGLRenderTarget(w * 2, h * 2, { samples: 4, colorSpace: THREE.SRGBColorSpace });
    this.canvas = document.createElement('canvas'); this.canvas.width = w * 2; this.canvas.height = h * 2;
    this.model = null; this.yaw = 0.38;
  }
  show(type, level, seed, style) {
    if (this.model) { this.scene.remove(this.model.group); releaseModel(this.model); }
    this.model = buildModel(type, { level, seed, style });
    this.scene.add(this.model.group);
    this.foot = sizeOf(type, level);
    return this.render();
  }
  render() {
    const R = this.engine.renderer, m = this.model; if (!m) return null;
    const box = new THREE.Box3().setFromObject(m.group), c = box.getCenter(new THREE.Vector3()), r = Math.max(box.getSize(new THREE.Vector3()).length() * 0.5, 1.5);
    // (a low, mostly-front view: the door and the noren under the porch roof show, which the game's high camera hides)
    const dist = r / Math.sin(THREE.MathUtils.degToRad(13)) * 0.9, pitch = 0.3;
    this.cam.position.set(c.x + Math.sin(this.yaw) * dist * Math.cos(pitch), c.y * 0.75 + dist * Math.sin(pitch), c.z + Math.cos(this.yaw) * dist * Math.cos(pitch));
    this.cam.lookAt(c.x, c.y * 0.75, c.z);
    const prev = R.getRenderTarget(), occ = U.uOccl.value.clone(), night = U.uNight.value;
    U.uOccl.value.set(-9999, -9999, 1, 0); U.uNight.value = 0;
    R.setRenderTarget(this.rt); R.setClearColor(0x000000, 0); R.clear(); R.render(this.scene, this.cam);
    const W = this.rt.width, H = this.rt.height, px = new Uint8Array(W * H * 4);
    R.readRenderTargetPixels(this.rt, 0, 0, W, H, px);
    R.setRenderTarget(prev); U.uOccl.value.copy(occ); U.uNight.value = night;
    const ctx = this.canvas.getContext('2d'), img = ctx.createImageData(W, H);
    for (let y = 0; y < H; y++) img.data.set(px.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
    ctx.putImageData(img, 0, 0);
    return this.canvas.toDataURL('image/png');
  }
  drop() { if (this.model) { this.scene.remove(this.model.group); releaseModel(this.model); this.model = null; } }
}

// ------------------------------------------------------------------ the house card
export class HouseCardPanel extends Panel {
  constructor(ui) { super(ui, { name: 'houseCard', title: 'House', jp: 'いえ', side: 'center', cls: 'p-house', icon: 'home', width: 440 }); }
  get H() { return this.G?.housing; }
  init() {
    this.body.innerHTML = `<div class="hc">
      <div class="hc-pic"><img alt="" draggable="false"><span class="hc-lv"></span></div>
      <div class="hc-info"><b class="hc-name"></b><div class="hc-sub"></div><div class="hc-stars"></div><div class="hc-stats"></div></div>
      <div class="hc-up"><div class="hc-up-h">${glyph('hammer')}<b>Upgrade</b><span class="hc-up-to"></span></div><div class="hc-cost"></div><div class="hc-why"></div></div>
      <div class="hc-btns"><button class="btn big gold hc-upb">${glyph('hammer')}Upgrade</button><button class="btn big mint hc-rem">${glyph('sparkle')}Remodel</button><button class="btn big pink hc-in">${glyph('door')}Enter</button></div>
    </div>`;
    const q = s => this.body.querySelector(s);
    this.$ = { img: q('.hc-pic img'), lv: q('.hc-lv'), name: q('.hc-name'), sub: q('.hc-sub'), stars: q('.hc-stars'), stats: q('.hc-stats'), to: q('.hc-up-to'), cost: q('.hc-cost'), why: q('.hc-why'), up: q('.hc-upb'), rem: q('.hc-rem'), enter: q('.hc-in'), upBox: q('.hc-up') };
    this.$.up.addEventListener('click', () => { const rec = this.rec; if (!rec) return; if (this.H.upgrade(rec)) this.ui.sfx?.('buy'); else replay(this.$.up, 'deny', 400); });
    this.$.rem.addEventListener('click', () => { const rec = this.rec; if (!rec) return; this.ui.close('houseCard'); this.ui.open('remodel', { rec }); });
    this.$.enter.addEventListener('click', () => { const rec = this.rec; if (!rec) return; this.ui.close('houseCard'); this.G.build?.active && this.G.build.exit(); this.H.enter(rec); });
  }
  get rec() { const r = this.opts.rec; return r && this.G.sim?.list.includes(r) ? r : this.G.sim?.list.find(x => x.data === r?.data) || null; }
  onOpen() { this._pic = null; this.render(); }
  onClose() { this.H?.ext && null; }
  render() {
    const rec = this.rec, H = this.H; if (!rec || !H) return;
    const b = rec.data, def = BUILDINGS[b.type], st = this.st;
    this.setTitle(H.houseName(b), b.type === 'chewyHouse' ? 'おうち' : 'いえ');
    const key = `${b.type}:${b.level}:${b.seed}:${JSON.stringify(b.style || {})}`;
    if (this._pic !== key) { this._pic = key; this.$.img.src = this.ui.remodelPreview().show(b.type, b.level, b.seed, b.style) || ''; this.ui.remodelPreview().drop(); }
    this.$.lv.textContent = `Lv ${b.level}`;
    this.$.name.textContent = H.houseName(b);
    const kind = b.type === 'chewyHouse' ? "Chewy's home (and Moka's)" : b.owner ? `${H.nameOf(b.owner)} lives here` : def.cat === 'home' ? 'A villager family lives here' : def.name;
    this.$.sub.textContent = kind;
    const hasRoom = b.type === 'chewyHouse' || b.owner;
    const r = hasRoom ? H.ratingOf(b) : null;
    this.$.stars.innerHTML = r ? `<span class="hc-st">${starText(r.stars)}</span><small>Home Rating</small>` : '';
    this.$.stats.innerHTML = def.cat === 'home' ? `<span>${glyph('home')}${b.residents || 0}/${def.capacity?.[b.level - 1] ?? 0}</span><span>${glyph('heart')}${Math.round((b.happy ?? 0) * 100)}%</span>` : '';
    const u = H.upgradeInfo(b);
    this.$.to.textContent = u.max ? '' : `→ Level ${u.next}`;
    this.$.cost.innerHTML = u.max ? '' : costHTML(st, u.cost);
    this.$.why.textContent = u.ok ? 'Keeps its look and everything inside' : u.why;
    this.$.why.classList.toggle('bad', !u.ok);
    this.$.up.disabled = !u.ok; this.$.upBox.classList.toggle('max', !!u.max);
    const d = H.doorFor(rec);
    this.$.enter.style.display = d.ok ? '' : 'none';
  }
  refresh() { if (this.isOpen) this.render(); }
}

// ------------------------------------------------------------------ the Remodel panel
export class RemodelPanel extends Panel {
  constructor(ui) { super(ui, { name: 'remodel', title: 'Remodel', jp: 'リフォーム', side: 'center', cls: 'p-remodel', icon: 'sparkle', width: 1060 }); }
  get H() { return this.G?.housing; }
  init() {
    this.body.innerHTML = `<div class="rm">
      <div class="rm-left">
        <div class="rm-pv"><img alt="" draggable="false"><button class="btn sm rm-rot l" title="Turn">${glyph('swap')}</button><span class="rm-badge"></span></div>
        <div class="rm-sets"></div>
        <div class="rm-foot"><div class="rm-cost"></div><div class="rm-why"></div><div class="rm-btns"><button class="btn sm rm-reset">${glyph('x')}As it was</button><button class="btn big pink rm-apply">${glyph('check')}Remodel</button></div></div>
      </div>
      <div class="rm-fields"></div>
    </div>`;
    const q = s => this.body.querySelector(s);
    this.$ = { img: q('.rm-pv img'), badge: q('.rm-badge'), sets: q('.rm-sets'), fields: q('.rm-fields'), cost: q('.rm-cost'), why: q('.rm-why'), apply: q('.rm-apply'), reset: q('.rm-reset') };
    q('.rm-rot').addEventListener('click', () => { const P = this.ui.remodelPreview(); P.yaw += 0.7; this.$.img.src = P.render() || ''; this.ui.sfx?.('tick'); });
    this.$.sets.addEventListener('click', e => {
      const c = e.target.closest('.rm-set'); if (!c) return;
      if (c.classList.contains('locked')) { replay(c, 'deny', 400); this.ui.sfx?.('deny'); return; }
      this.draft = c.dataset.id === 'own' ? null : setStyle(c.dataset.id, this.draft); this.ui.sfx?.('select'); this.render();
      Events.emit('remodel:draft', { kind: 'set', set: c.dataset.id });
    });
    this.$.fields.addEventListener('click', e => {
      const o = e.target.closest('.rm-o'); if (!o) return;
      if (o.classList.contains('locked')) { replay(o, 'deny', 400); this.ui.sfx?.('deny'); return; }
      const k = o.dataset.k, v = o.dataset.v === '' ? null : o.dataset.v;
      this.draft = withField(this.draft, k, v); this.ui.sfx?.('tick'); this.render();
      Events.emit('remodel:draft', { kind: 'field', field: k, value: v });
    });
    this.$.reset.addEventListener('click', () => { this.draft = cleanStyle(this.rec?.data.style); this.ui.sfx?.('tick'); this.render(); });
    this.$.apply.addEventListener('click', () => {
      const rec = this.rec; if (!rec) return;
      const n = this.H.remodel(rec, this.draft);
      if (n) { this.opts.rec = n; this.ui.sfx?.('buy'); const r = this.$.apply.getBoundingClientRect(); this.ui.burst?.(r.left + r.width / 2, r.top, { n: 22, spread: 90, colors: ['#ffcf4a', '#fff3b8', '#ff8fb0', '#8fe0c0'] }); this.ui.toast?.(`${this.H.houseName(n.data)} has a new look!`, { icon: 'sparkle', color: '#8fe0c0' }); this.ui.close('remodel'); }
      else replay(this.$.apply, 'deny', 400);
    });
  }
  get rec() { const r = this.opts.rec; return r && this.G.sim?.list.includes(r) ? r : this.G.sim?.list.find(x => x.data === r?.data) || null; }
  onOpen() { this.draft = cleanStyle(this.rec?.data.style); this._pv = null; this.ui.remodelPreview().yaw = 0.38; this.render(); }
  onClose() { this.ui.remodelPreview().drop(); }
  render() {
    const rec = this.rec, H = this.H; if (!rec || !H) return;
    const b = rec.data, st = this.st, rank = H.rank(), d = this.draft || {};
    this.setTitle(`Remodel ${H.houseName(b)}`, 'リフォーム');
    // the live preview
    const key = JSON.stringify(d);
    if (this._pv !== key) { this._pv = key; this.$.img.src = this.ui.remodelPreview().show(b.type, b.level, b.seed, this.draft) || ''; replay(this.$.img, 'swap', 300); }
    this.$.badge.textContent = d.set ? STYLE_SETS[d.set].name : Object.keys(d).length ? 'Your own mix' : 'Its own look';
    // style sets
    this.$.sets.innerHTML = [`<div class="rm-set ${!Object.keys(d).length ? 'on' : ''}" data-id="own"><b>Its own look</b><small>As the village built it</small></div>`,
      ...STYLE_SET_IDS.map(id => { const S = STYLE_SETS[id], lock = S.rank > rank; return `<div class="rm-set ${d.set === id ? 'on' : ''} ${lock ? 'locked' : ''}" data-id="${id}" title="${esc(S.desc)}"><b>${esc(S.name)} <span class="jp">${esc(S.jp)}</span></b><small>${lock ? `${glyph('lock')}Rank ${S.rank}` : esc(S.desc)}</small></div>`; })].join('');
    // the parts
    this.$.fields.innerHTML = FIELD_IDS.map(k => {
      const F = FIELDS[k];
      const opts = Object.entries(F.opts).map(([v, o]) => {
        const on = (d[k] ?? null) === v, lock = lockOf(k, v) > rank, sw = o.c !== undefined;
        const face = sw ? (o.c ? `<i style="background:${o.c}"></i>` : `<i class="none">${glyph('x')}</i>`) : `<span>${esc(o.name)}</span>`;
        return `<button class="rm-o ${sw ? 'sw' : 'chip'} ${on ? 'on' : ''} ${lock ? 'locked' : ''}" data-k="${k}" data-v="${v}" title="${esc(o.name)}${lock ? ` · rank ${lockOf(k, v)}` : ''}">${face}${lock ? `<em>${glyph('lock')}</em>` : ''}</button>`;
      }).join('');
      return `<div class="rm-f"><div class="rm-fh"><b>${esc(F.name)}</b><button class="rm-o chip rm-auto ${d[k] == null ? 'on' : ''}" data-k="${k}" data-v="">Auto</button></div><div class="rm-opts">${opts}</div></div>`;
    }).join('');
    // the cost
    const r = H.remodelInfo(b, this.draft);
    this.$.cost.innerHTML = r.same ? '' : costHTML(st, r.cost);
    this.$.why.textContent = r.ok ? 'The builders will have it done in a jiffy!' : r.same ? 'Pick a style set or change a part' : r.why;
    this.$.why.classList.toggle('bad', !r.ok && !r.same);
    this.$.apply.disabled = !r.ok;
  }
  refresh() { if (this.isOpen) this.render(); }
}
export { Preview };
