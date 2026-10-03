// HUD: life/zoom orbs, hotbar, potion belt, xp, player card, minimap + clock, resources, quest tracker,
// village RCI + build button, target/boss bars, interaction prompt, level-up badges.
import * as THREE from 'three';
import { el, esc, fmt, setText, setVar, setCls, setStyle, replay, clamp, damp, rarityColor } from './dom.js';
import { glyph, glyphURL, MATERIALS } from './glyphs.js';
import { portrait } from './portraits.js';
import { skillIconURL, hotbarIconURL, skillDef, skillCost, xpProgress, potionIconURL, potionInfo, materialIconURL, skillUsable } from './rpg.js';
import { simpleTip } from './tooltip.js';
import { pantryIcon } from '../life/pantryIcons.js';
import { PANTRY } from '../life/pantry.js';
import { BUFFS, TIER_NAMES } from '../life/meals.js';

const TAU = Math.PI * 2;
const HERO_JP = { chewy: 'チューイ', moka: 'モカ' };
const SLOT_KEYS = ['LMB', 'RMB', '1', '2', '3', '4'];

// ------------------------------------------------------------------ Orb (canvas liquid)
class Orb {
  constructor(kind) {
    this.kind = kind;
    this.el = el('div', `orb orb-${kind}`);
    const S = this.S = 150;
    this.cv = el('canvas', 'orb-cv');
    this.dpr = Math.min(2, devicePixelRatio || 1);
    this.cv.width = this.cv.height = Math.round(S * this.dpr);
    this.g = this.cv.getContext('2d');
    this.el.innerHTML = `<div class="orb-glow"></div>`;
    this.el.appendChild(this.cv);
    this.el.insertAdjacentHTML('beforeend', ORB_FRAME(kind) + `<div class="orb-val"><b></b><small></small></div>`);
    this.valB = this.el.querySelector('.orb-val b'); this.valS = this.el.querySelector('.orb-val small');
    this.frac = 1; this.shown = 1; this.ghost = 1; this.ghostHold = 0; this.slosh = 0.4; this.t = Math.random() * 10;
    this.cur = -1; this.max = -1;
    this.bubbles = Array.from({ length: 9 }, () => this._bub({}, true));
    this.glints = Array.from({ length: 5 }, (_, i) => ({ a: Math.random() * TAU, r: 10 + Math.random() * 38, p: Math.random() * TAU, s: 1 + Math.random() }));
    this.col = kind === 'life'
      ? { top: '#ffa3c0', mid: '#ff4f7c', bot: '#b81e48', foam: '#ffe0ea', back: '#ff7a9e', ghost: 'rgba(255,240,245,.55)', empty: ['#4a2438', '#2a1222'] }
      : { top: '#aee4ff', mid: '#4aa6ff', bot: '#2446c8', foam: '#e6f6ff', back: '#6cc0ff', ghost: 'rgba(235,248,255,.55)', empty: ['#28304e', '#161a30'] };
  }
  _bub(b, init) {
    b.x = 75 + (Math.random() - 0.5) * 80; b.y = init ? 60 + Math.random() * 70 : 132 + Math.random() * 10;
    b.r = 1.4 + Math.random() * 3.2; b.v = 12 + Math.random() * 22; b.w = Math.random() * TAU; return b;
  }
  set(cur, max) {
    cur = Math.max(0, cur); max = Math.max(1, max);
    const f = clamp(cur / max);
    if (Math.abs(f - this.frac) > 0.001) {
      if (f < this.frac) { this.ghostHold = 0.45; this.ghost = Math.max(this.ghost, this.shown); }
      this.slosh = Math.min(1.4, this.slosh + Math.abs(f - this.frac) * 5 + 0.15);
      this.frac = f;
    }
    const c = Math.ceil(cur), m = Math.round(max);
    if (c !== this.cur || m !== this.max) { this.cur = c; this.max = m; setText(this.valB, String(c)); setText(this.valS, '/ ' + m); }
    setCls(this.el, 'low', f < 0.3 && this.kind === 'life');
    setCls(this.el, 'empty', f < 0.02);
  }
  draw(dt) {
    this.t += dt;
    const t = this.t, g = this.g, S = this.S, cx = 75, cy = 75, R = 55.5;
    this.shown = damp(this.shown, this.frac, 7, dt);
    if (this.ghostHold > 0) this.ghostHold -= dt; else this.ghost = damp(this.ghost, this.shown, 3.2, dt);
    if (this.ghost < this.shown) this.ghost = this.shown;
    this.slosh = damp(this.slosh, 0.22, 1.6, dt);
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, S, S);
    g.save();
    g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.clip();
    // empty glass
    let grd = g.createRadialGradient(cx - 14, cy - 20, 6, cx, cy, R);
    grd.addColorStop(0, this.col.empty[0]); grd.addColorStop(1, this.col.empty[1]);
    g.fillStyle = grd; g.fillRect(0, 0, S, S);
    const level = f => cy + R - f * R * 2;
    const amp = 1.6 + this.slosh * 5.5, tilt = Math.sin(t * 2.3) * this.slosh * 0.16;
    const surf = (x, lv, ph, a) => lv + Math.sin(x * 0.075 + t * 2.6 + ph) * a + Math.sin(x * 0.13 - t * 3.7 + ph * 2) * a * 0.45 + (x - cx) * tilt;
    // ghost (recent damage)
    if (this.ghost - this.shown > 0.003) {
      const lv = level(this.ghost);
      g.beginPath(); g.moveTo(0, S);
      for (let x = 0; x <= S; x += 5) g.lineTo(x, surf(x, lv, 1.3, amp * 0.6));
      g.lineTo(S, S); g.closePath(); g.fillStyle = this.col.ghost; g.fill();
    }
    if (this.shown > 0.002) {
      const lv = level(this.shown);
      // back wave
      g.beginPath(); g.moveTo(0, S);
      for (let x = 0; x <= S; x += 5) g.lineTo(x, surf(x, lv - 1.5, 2.2, amp * 0.8));
      g.lineTo(S, S); g.closePath(); g.fillStyle = this.col.back; g.globalAlpha = 0.65; g.fill(); g.globalAlpha = 1;
      // front liquid
      g.beginPath(); g.moveTo(0, S);
      for (let x = 0; x <= S; x += 4) g.lineTo(x, surf(x, lv, 0, amp));
      g.lineTo(S, S); g.closePath();
      grd = g.createLinearGradient(0, lv - 6, 0, cy + R);
      grd.addColorStop(0, this.col.top); grd.addColorStop(0.35, this.col.mid); grd.addColorStop(1, this.col.bot);
      g.fillStyle = grd; g.fill();
      // foam line
      g.beginPath();
      for (let x = 0; x <= S; x += 4) { const y = surf(x, lv, 0, amp) + 1.5; x ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.strokeStyle = this.col.foam; g.lineWidth = 2.6; g.globalAlpha = 0.85; g.stroke(); g.globalAlpha = 1;
      // bubbles
      g.lineWidth = 1.3;
      for (const b of this.bubbles) {
        b.y -= b.v * dt; b.w += dt * 3;
        const bx = b.x + Math.sin(b.w) * 3;
        if (b.y < surf(bx, lv, 0, amp) + b.r + 1) { this._bub(b); continue; }
        g.beginPath(); g.arc(bx, b.y, b.r, 0, TAU);
        g.fillStyle = 'rgba(255,255,255,.18)'; g.fill();
        g.strokeStyle = 'rgba(255,255,255,.55)'; g.stroke();
        g.fillStyle = 'rgba(255,255,255,.8)'; g.fillRect(bx - b.r * 0.45, b.y - b.r * 0.5, 1.1, 1.1);
      }
      // glints
      for (const s of this.glints) {
        const x = cx + Math.cos(s.a + t * 0.2) * s.r, y = cy + Math.sin(s.a + t * 0.2) * s.r * 0.7 + 12;
        if (y < lv + 6) continue;
        const k = Math.max(0, Math.sin(t * s.s * 2 + s.p));
        if (k < 0.2) continue;
        g.fillStyle = `rgba(255,255,255,${(k * 0.8).toFixed(2)})`;
        g.beginPath(); g.moveTo(x, y - 3 * k); g.lineTo(x + 0.8, y); g.lineTo(x, y + 3 * k); g.lineTo(x - 0.8, y); g.closePath(); g.fill();
        g.beginPath(); g.moveTo(x - 3 * k, y); g.lineTo(x, y + 0.8); g.lineTo(x + 3 * k, y); g.lineTo(x, y - 0.8); g.closePath(); g.fill();
      }
    }
    // inner shadow
    grd = g.createRadialGradient(cx, cy, R * 0.62, cx, cy, R);
    grd.addColorStop(0, 'rgba(20,8,20,0)'); grd.addColorStop(1, 'rgba(20,8,20,.38)');
    g.fillStyle = grd; g.fillRect(0, 0, S, S);
    // glass highlights
    g.fillStyle = 'rgba(255,255,255,.34)';
    g.beginPath(); g.ellipse(cx - 17, cy - 25, 22, 11, -0.62, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,255,255,.75)';
    g.beginPath(); g.ellipse(cx - 27, cy - 30, 5.5, 3, -0.7, 0, TAU); g.fill();
    g.beginPath(); g.arc(cx - 14, cy - 36, 2, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 3; g.lineCap = 'round';
    g.beginPath(); g.arc(cx, cy, R - 6, 0.25, 1.25); g.stroke();
    g.restore();
  }
}

function ORB_FRAME(kind) {
  const ink = '#4a2c2a';
  const ears = kind === 'life'
    ? `<path d="M40 30 C34 12 20 8 12 17 C6 24 9 38 18 43 C26 42 34 37 40 30Z" fill="#8a4a2c" stroke="${ink}" stroke-width="4" stroke-linejoin="round"/>
       <path d="M110 30 C116 12 130 8 138 17 C144 24 141 38 132 43 C124 42 116 37 110 30Z" fill="#8a4a2c" stroke="${ink}" stroke-width="4" stroke-linejoin="round"/>
       <path d="M20 22 C25 17 31 19 34 25" fill="none" stroke="#b86a42" stroke-width="3" stroke-linecap="round"/>`
    : `<path d="M38 36 C28 24 22 10 22 -2 C38 2 50 14 56 28Z" fill="#232132" stroke="${ink}" stroke-width="4" stroke-linejoin="round"/>
       <path d="M112 36 C122 24 128 10 128 -2 C112 2 100 14 94 28Z" fill="#232132" stroke="${ink}" stroke-width="4" stroke-linejoin="round"/>
       <path d="M36 26 C32 20 29 12 29 6 C38 9 44 16 47 24Z" fill="#ff9ab8" opacity=".75"/>
       <path d="M114 26 C118 20 121 12 121 6 C112 9 106 16 103 24Z" fill="#ff9ab8" opacity=".75"/>`;
  const dots = Array.from({ length: 10 }, (_, i) => {
    const a = (i / 10) * TAU + 0.31; const x = 75 + Math.cos(a) * 63.5, y = 75 + Math.sin(a) * 63.5;
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.3" fill="${i % 2 ? '#ffcf4a' : kind === 'life' ? '#ff8fb0' : '#8fd0ff'}" stroke="${ink}" stroke-width="1.2"/>`;
  }).join('');
  const emb = kind === 'life'
    ? `<path d="M75 146C63 138.5 59.5 131.5 62.8 125.6 65.8 120.5 71.6 121.3 75 126 78.4 121.3 84.2 120.5 87.2 125.6 90.5 131.5 87 138.5 75 146Z" fill="#ff7fa6" stroke="${ink}" stroke-width="3.2" stroke-linejoin="round"/><ellipse cx="68.5" cy="127" rx="3" ry="1.8" transform="rotate(-35 68.5 127)" fill="#fff" opacity=".8"/>`
    : `<circle cx="75" cy="134" r="12" fill="#8fd0ff" stroke="${ink}" stroke-width="3.2"/><path d="M77.5 124.5l-8 11h5.5l-2.5 8.5 9-12h-5.5l2.5-7.5z" fill="#fff" stroke="${ink}" stroke-width="1.6" stroke-linejoin="round"/>`;
  return `<svg class="orb-frame" viewBox="0 -8 150 162" xmlns="http://www.w3.org/2000/svg">
    ${ears}
    <path fill-rule="evenodd" d="M75 6a69 69 0 1 1 0 138a69 69 0 1 1 0-138zM75 18a57 57 0 1 0 0 114a57 57 0 1 0 0-114z" fill="#fff6e8" stroke="${ink}" stroke-width="4"/>
    <circle cx="75" cy="75" r="62.8" fill="none" stroke="#f0d9bd" stroke-width="3"/>
    ${dots}${emb}
  </svg>`;
}

// ------------------------------------------------------------------ HUD
export class Hud {
  constructor(ui, layer) {
    this.ui = ui;
    this.root = el('div', 'hud');
    layer.appendChild(this.root);
    this.cache = {};
    this.mm = { provider: null, acc: 1, markers: [] };
    this.cd = { provider: null };
    this.target = null; this.boss = null;
    this.buildDOM();
  }
  get G() { return this.ui.G; }
  get st() { return this.ui.G?.state || {}; }
  get pl() { return this.st.player || {}; }
  get d() { return this.ui.G?.derived || {}; }

  buildDOM() {
    const R = this.root, tip = this.ui.tip;
    R.innerHTML = `
    <div class="hud-tl">
      <div class="pcard">
        <div class="pc-bub" data-open="character"><div class="pc-face">${portrait(this.G?.state?.activeHero || 'chewy')}</div><div class="pc-lv"><small>Lv</small><span>1</span></div></div>
        <button class="hsw" hidden><div class="hsw-face"></div><svg class="hsw-cd" viewBox="0 0 40 40"><circle cx="20" cy="20" r="17.5"/></svg><span class="hsw-lv"></span><span class="kc sm">Tab</span></button>
        <div class="pc-info">
          <div class="pc-name">Chewy<span class="jp">チューイ</span></div>
          <div class="pc-xp"><i></i></div>
          <div class="pal">
            <div class="pal-b"><div class="pal-face">${portrait('shadow')}</div></div>
            <div class="pal-i"><div class="pal-n">Shadow</div><div class="pal-bar"><i class="pal-g"></i><i class="pal-f"></i></div></div>
          </div>
        </div>
      </div>
      <div class="buffs"></div>
      <div class="qtrack"><div class="qt-h">${glyph('scroll')}<span>Quests</span><span class="jp">クエスト</span><button class="qt-tog" title="Collapse">–</button></div><div class="qt-list"></div></div>
    </div>
    <div class="hud-tr">
      <div class="mm-wrap">
        <div class="mm-disc"><canvas class="mm-cv"></canvas></div>
        <svg class="mm-ring" viewBox="0 0 200 200"><circle cx="100" cy="100" r="93" fill="none" stroke="#4a2c2a" stroke-width="5"/><circle cx="100" cy="100" r="86" fill="none" stroke="#fff6e8" stroke-width="10"/><circle cx="100" cy="100" r="80.5" fill="none" stroke="#4a2c2a" stroke-width="3.5"/>${Array.from({ length: 24 }, (_, i) => { const a = i / 24 * TAU; return `<circle cx="${(100 + Math.cos(a) * 86).toFixed(1)}" cy="${(100 + Math.sin(a) * 86).toFixed(1)}" r="${i % 6 ? 1.3 : 2.4}" fill="${i % 6 ? '#e2c7a6' : '#ff8fb0'}"/>`; }).join('')}</svg>
        <div class="mm-n">N<span>北</span></div>
        <div class="clock">
          <div class="ck-sky"></div><div class="ck-stars"></div>
          <div class="ck-hand"><div class="ck-sun">${glyph('sun')}</div><div class="ck-moon">${glyph('moon')}</div></div>
          <div class="ck-hills"></div><div class="ck-rim"></div>
        </div>
        <div class="floor"><b>B1F</b><span>地下1階</span></div>
      </div>
      <div class="loc"><span class="loc-t">Day 1 · 8:30</span><span class="loc-s">am</span></div>
      <div class="hud-res">
        <div class="pill coins">${glyph('coin')}<b class="cv">0</b></div>
        <div class="mats"></div>
      </div>
    </div>
    <div class="hud-tc">
      <div class="boss">
        <div class="bb-top"><div class="bb-ic">${glyph('oni')}</div><div class="bb-name"></div></div>
        <div class="bb-frame"><div class="bb-horn l"></div><div class="bb-horn r"></div>
          <div class="bb-bar"><i class="bb-ghost"></i><i class="bb-fill"></i><div class="bb-shine"></div><span class="bb-pct"></span></div>
        </div>
        <div class="bb-sub"></div>
      </div>
      <div class="target">
        <div class="tg-name"></div>
        <div class="tg-bar"><i class="tg-ghost"></i><i class="tg-fill"></i></div>
        <div class="tg-mods"></div>
      </div>
    </div>
    <div class="prompt"><span class="kc">F</span><span class="pr-t"></span></div>
    <div class="hud-bc">
      <div class="lvl-badges">
        <button class="lvb stat" data-open="character"><span class="lvb-p">${glyph('plus')}</span><span class="lvb-t">Stats</span><b>0</b></button>
        <button class="lvb skill" data-open="skills"><span class="lvb-p">${glyph('plus')}</span><span class="lvb-t">Skill</span><b>0</b></button>
      </div>
      <div class="orb-slot l"></div>
      <div class="dock">
        <div class="xp"><div class="xp-lv"><span>1</span></div><div class="xp-bar"><i class="xp-gain"></i><i class="xp-fill"></i><span class="xp-t"></span></div></div>
        <div class="hotbar"></div>
      </div>
      <div class="orb-slot r"></div>
    </div>
    <div class="hud-br">
      <div class="vtools">
        <div class="rci">
          <div class="rci-h">Demand<span class="jp">需要</span></div>
          <div class="rci-cols">
            ${['R', 'C', 'W'].map(k => `<div class="rci-c" data-k="${k}"><div class="rci-track"><i></i></div><div class="rci-l">${glyph(k === 'R' ? 'home' : k === 'C' ? 'shop' : 'craft')}</div></div>`).join('')}
          </div>
          <div class="rci-foot"></div>
        </div>
        <button class="build-btn" data-open="build">${glyph('hammer')}<span class="bb-l">Build</span><span class="kc">B</span></button>
      </div>
      <div class="menubtns">
        ${[['inventory', 'bag', 'I', 'Bag'], ['character', 'star', 'C', 'Character'], ['skills', 'sparkle', 'K', 'Skills'], ['quests', 'book', 'J', 'Journal'], ['map', 'map', 'M', 'Map'], ['menu', 'gear', 'Esc', 'Menu']]
    .map(([n, g, k, l]) => `<button class="mb" data-open="${n}" data-tip="${l}">${glyph(g)}<span class="kc">${k}</span><span class="mb-dot"></span></button>`).join('')}
      </div>
    </div>`;
    const q = s => R.querySelector(s);
    this.$ = {
      tl: q('.hud-tl'), tr: q('.hud-tr'), tc: q('.hud-tc'), bc: q('.hud-bc'), br: q('.hud-br'),
      lv: q('.pc-lv span'), pcxp: q('.pc-xp i'), palF: q('.pal-f'), palG: q('.pal-g'), pal: q('.pal'),
      qt: q('.qtrack'), qtList: q('.qt-list'), buffs: q('.buffs'),
      mmCv: q('.mm-cv'), clock: q('.clock'), ckSky: q('.ck-sky'), ckHand: q('.ck-hand'), ckStars: q('.ck-stars'), floor: q('.floor'),
      locT: q('.loc-t'), locS: q('.loc-s'), coins: q('.coins'), coinsV: q('.coins .cv'), mats: q('.mats'),
      boss: q('.boss'), bbName: q('.bb-name'), bbSub: q('.bb-sub'), bbFill: q('.bb-fill'), bbGhost: q('.bb-ghost'), bbPct: q('.bb-pct'),
      tg: q('.target'), tgName: q('.tg-name'), tgFill: q('.tg-fill'), tgGhost: q('.tg-ghost'), tgMods: q('.tg-mods'),
      prompt: q('.prompt'), prT: q('.pr-t'), prK: q('.prompt .kc'),
      lvbStat: q('.lvb.stat'), lvbSkill: q('.lvb.skill'),
      xp: q('.xp'), xpLv: q('.xp-lv span'), xpFill: q('.xp-fill'), xpGain: q('.xp-gain'), xpT: q('.xp-t'),
      hotbar: q('.hotbar'), dock: q('.dock'), vtools: q('.vtools'), rci: q('.rci'), rciFoot: q('.rci-foot'), menubtns: q('.menubtns'),
      face: q('.pc-face'), name: q('.pc-name'), bub: q('.pc-bub'), hsw: q('.hsw'), hswFace: q('.hsw-face'), hswCd: q('.hsw-cd circle'), hswLv: q('.hsw-lv'),
    };
    // the other hero's mini portrait (docs/HEROES.md §4): Tab or a click switches, the ring shows the cooldown
    this.$.hsw.addEventListener('click', e => { e.stopPropagation(); this.ui.G?.heroes?.switchTo(); });
    tip.bind(this.$.hsw, () => {
      const H = this.ui.G?.heroes, id = H?.next(); if (!id) return '';
      const hp = this.st.heroes?.[id]?.player || {}, C = H.cls(id);
      return simpleTip(`${esc(C.name)} <span class="jp">${HERO_JP[id] || ''}</span>`, `Level ${hp.lvl || 1} ${esc(C.title)} · hanging out in town.<br><span class="tt-dim">Press <span class="kc sm">Tab</span> or click to play as ${esc(C.name)}.</span>`);
    });
    // orbs
    this.life = new Orb('life'); this.zoom = new Orb('zoom');
    q('.orb-slot.l').appendChild(this.life.el); q('.orb-slot.r').appendChild(this.zoom.el);
    tip.bind(this.life.el, () => simpleTip(`<span style="color:#ff8fb0">Life</span> <span class="jp">いのち</span>`, `${this.life.cur} / ${this.life.max}<br><span class="tt-dim">Regen ${(+this.d.lifeRegen || 0).toFixed(1)}/s · Q drinks a Heart Potion</span>`));
    tip.bind(this.zoom.el, () => simpleTip(`<span style="color:#8fd0ff">Zoom</span> <span class="jp">げんき</span>`, `${this.zoom.cur} / ${this.zoom.max}<br><span class="tt-dim">Skills spend Zoom · E drinks a Zoom Potion</span>`));
    // hotbar + belt
    const hb = this.$.hotbar;
    this.slots = SLOT_KEYS.map((k, i) => {
      const s = el('div', 'hb' + (i < 2 ? ' mouse' : ''));
      s.dataset.i = i;
      s.innerHTML = `<div class="hb-in"><img class="hb-ic" alt="" draggable="false"><div class="hb-cd"></div><span class="hb-cdt"></span><div class="hb-fl"></div></div><span class="kc hb-k">${i === 0 ? glyph('mouseL') : i === 1 ? glyph('mouseR') : k}</span>`;
      hb.appendChild(s);
      const o = { el: s, ic: s.querySelector('.hb-ic'), cd: s.querySelector('.hb-cd'), cdt: s.querySelector('.hb-cdt'), id: undefined, cdv: -1 };
      tip.bind(s, () => this.slotTip(i));
      s.addEventListener('contextmenu', e => { e.preventDefault(); this.openAssign(i, s); });
      s.addEventListener('click', () => this.openAssign(i, s));
      return o;
    });
    // weapon-set badge between LMB / RMB: which set's mouse skills are live (click or X swaps; each set keeps its own)
    const ws = this.wsBadge = el('div', 'hb-ws');
    ws.innerHTML = `<div class="ws-in"><span class="ws-ic"></span><b class="ws-n"></b></div>`;
    hb.appendChild(ws);
    ws.addEventListener('click', e => { e.stopPropagation(); const G = this.ui.G; if (!G?.actions?.swapWeapons || G.mode === 'title') return; G.actions.swapWeapons(); G.audio?.play?.('ui_equip'); });
    tip.bind(ws, () => { const set = this.pl.activeWeapon === 1 ? 1 : 0, wt = this.d.weaponType || 'sword'; return simpleTip(`Weapon set ${set ? 'II' : 'I'} · ${wt === 'ball' ? 'Tennis Ball' : wt === 'staff' ? 'Staff' : 'Bone Sword'}`, `Each weapon set remembers its own ${glyph('mouseL')} / ${glyph('mouseR')} skills.<br><span class="tt-dim">Press <span class="kc sm">X</span> or click to swap.</span>`); });
    hb.appendChild(el('div', 'hb-sep'));
    this.belt = [['heart', 'Q', 'Heart Potion', 'Restores Life'], ['zoom', 'E', 'Zoom Potion', 'Restores Zoom'], ['rejuv', 'R', 'Rejuv Potion', 'Restores Life and Zoom']].map(([k, key, name, desc]) => {
      const s = el('div', 'belt b-' + k);
      s.innerHTML = `<div class="hb-in"><img class="bt-ic" src="${potionIconURL(k)}" alt="" draggable="false"><b class="bt-n">0</b><div class="hb-fl"></div></div><span class="kc hb-k">${key}</span>`;
      hb.appendChild(s);
      s.addEventListener('click', () => { this.ui.G?.actions?.usePotion?.(k); this.flashBelt(k); });
      tip.bind(s, () => { const I = potionInfo(k) || { name, desc }; return simpleTip(I.name, `${esc(I.desc)}<br>You have <b>${this.st.potions?.[k] || 0}</b>.<br><span class="tt-dim">Press ${key} or click to drink.</span>`); });
      return { k, el: s, n: s.querySelector('.bt-n'), v: -1 };
    });
    // the quick meal (G): the last dish eaten, else the most filling one in the pantry (life/kitchen.js quickEat)
    const ms = el('div', 'belt b-meal');
    ms.innerHTML = `<div class="hb-in"><img class="bt-ic" alt="" draggable="false"><span class="bt-bowl">${glyph('heart')}</span><b class="bt-n">0</b><div class="hb-fl"></div></div><span class="kc hb-k">G</span>`;
    hb.appendChild(ms);
    ms.addEventListener('click', () => this.ui.G?.life?.kitchen?.quickEat?.());
    tip.bind(ms, () => { const id = this.mealSlot.id, d = id && PANTRY[id], B = d && BUFFS[d.food.buff]; return d ? simpleTip(`Quick meal · ${esc(d.name)}`, `Heals ${Math.round(d.food.heal * 100)}% life · Well Fed: <b>${B.name} ${TIER_NAMES[d.food.tier]}</b> (${d.food.mins} min)<br>You have <b>${this.st.pantry?.[id] || 0}</b>.<br><span class="tt-dim">Press G or click to eat. Eat any dish from the Pantry to make it your quick meal.</span>`) : simpleTip('Quick meal', 'No dishes yet.<br><span class="tt-dim">Cook at home or at a campfire, then press G to eat.</span>'); });
    this.mealSlot = { el: ms, img: ms.querySelector('.bt-ic'), n: ms.querySelector('.bt-n'), id: undefined, v: -1 };
    // buff chips: a tooltip from their data-tip ("Title — details"; the chips are rebuilt as buffs change)
    this.$.buffs.addEventListener('mouseover', e => { const c = e.target.closest('.buff'); if (!c || c === this._bHov) return; this._bHov = c; const [t, ...r] = (c.dataset.tip || '').split(' — '); const m = c.querySelector('i')?.textContent; this.ui.tip.show(simpleTip(esc(t), `${esc(r.join(' — '))}${m ? `<br><span class="tt-dim">${esc(m)} left</span>` : ''}`), '', c); });
    this.$.buffs.addEventListener('mouseout', e => { const c = e.target.closest('.buff'); if (c && !c.contains(e.relatedTarget)) { this._bHov = null; this.ui.tip.hide(c); } });
    // clicks that open panels
    R.addEventListener('click', e => {
      const b = e.target.closest('[data-open]'); if (!b) return;
      const n = b.dataset.open;
      if (n === 'build') this.ui.openBuild(); else this.ui.toggle(n);
      replay(b, 'pressed', 300);
    });
    for (const b of R.querySelectorAll('.mb')) tip.bind(b, () => simpleTip(b.dataset.tip, `<span class="tt-dim">Hotkey: ${b.querySelector('.kc').textContent}</span>`));
    tip.bind(q('.pc-bub'), () => { const C = this.ui.G?.heroes?.cls(); return simpleTip(esc(this.pl.name || 'Chewy'), `Level ${this.pl.lvl || 1} ${esc(C?.title || 'adventurer pup')}.<br><span class="tt-dim">Click for character sheet (C)</span>`); });
    tip.bind(this.$.pal, () => { const s = this.shadowHP(); return simpleTip('Shadow', `Loyal Boston terrier sidekick.<br>Life ${Math.ceil(s.cur)} / ${Math.round(s.max)}`); });
    tip.bind(this.$.xp, () => { const x = xpProgress(this.pl); return simpleTip(`Level ${this.pl.lvl || 1}`, `Experience ${fmt(x.cur)} / ${fmt(x.need)} <span class="tt-dim">(${Math.floor(x.frac * 100)}%)</span>`); });
    tip.bind(this.$.coins, () => simpleTip(`${glyph('coin')} Coins <span class="jp">小判</span>`, `Spend at Rosie's Treats and on village buildings.`));
    tip.bind(this.$.rci, () => { const r = this.cache.rci || { R: 0, C: 0, W: 0 }; return simpleTip('Village demand', `<div class="tt-rci"><span style="color:#5ec79a">Homes ${pct(r.R)}</span><span style="color:#5aa8ff">Shops ${pct(r.C)}</span><span style="color:#e8a92a">Workshops ${pct(r.W)}</span></div><span class="tt-dim">Tall bars mean villagers want more of that kind of building.</span>`); });
    tip.bind(this.$.mats, () => simpleTip('Materials <span class="jp">素材</span>', `<div class="tt-mats">${Object.entries(this.st.materials || {}).map(([k, v]) => `<span><img src="${materialIconURL(k)}" alt="">${MATERIALS[k]?.name || k}<b>${fmt(v)}</b></span>`).join('')}</div>`));
    q('.qt-tog').addEventListener('click', e => { e.stopPropagation(); this.$.qt.classList.toggle('collapsed'); });
    this.mmCtx = this.$.mmCv.getContext('2d');
    // interaction prompt click → press F for the game
    this.$.prompt.addEventListener('click', () => this.ui._fire('interact'));
  }

  setMode(mode) {
    this.mode = mode;
    this.root.dataset.mode = mode;
    this.mm.acc = 1;
  }

  // ---------------------------------------------------------------- heroes
  // the active hero's face / name, and the switch button for the other hero
  heroTick() {
    const G = this.G, H = G.heroes, id = this.st.activeHero || 'chewy', nx = H?.next() || null;
    const key = id + '|' + nx;
    if (key !== this.cache.hero) {
      const first = this.cache.hero === undefined;
      this.cache.hero = key;
      this.$.face.innerHTML = portrait(id);
      this.$.name.innerHTML = `${esc(this.pl.name || 'Chewy')}<span class="jp">${HERO_JP[id] || ''}</span>`;
      this.root.dataset.hero = id;
      this.$.hsw.hidden = !nx;
      if (nx) this.$.hswFace.innerHTML = portrait(nx);
      // a new hero's numbers are not "gains": no level-up / xp-gain flourish for the swap itself
      this.cache.lvl = null; this.cache.xf = null; this.cache.sp = null; this.cache.kp = null; this.wsKey = undefined;
      if (!first) { replay(this.$.bub, 'heroswap', 700); if (nx) replay(this.$.hsw, 'heroswap', 700); }
    }
    if (!nx) return;
    const f = H.T ? 1 : clamp((H.cd || 0) / 2);
    const fr = Math.round(f * 100) / 100;
    if (fr !== this.cache.hswCd) { this.cache.hswCd = fr; setStyle(this.$.hswCd, 'strokeDashoffset', String((1 - fr) * 110)); setCls(this.$.hsw, 'cooling', fr > 0); }
    const lv = this.st.heroes?.[nx]?.player?.lvl || 1;
    if (lv !== this.cache.hswLv) { this.cache.hswLv = lv; setText(this.$.hswLv, String(lv)); }
  }
  /** The sweep-in card while the camera changes heroes: portrait, name, class title. */
  heroCard({ id, name, title, color }) {
    let c = this.heroCardEl;
    if (!c) { c = this.heroCardEl = el('div', 'hero-card'); this.root.appendChild(c); }
    c.style.setProperty('--hc', color || '#ff8fb0');
    c.innerHTML = `<div class="hc-face">${portrait(id)}</div><div class="hc-t"><small>Now playing</small><b>${esc(name)}<span class="jp">${HERO_JP[id] || ''}</span></b><span>${esc(title || '')}</span></div>`;
    replay(c, 'show', 1700);
  }

  // ---------------------------------------------------------------- per frame
  update(dt) {
    if (!this.G || this.mode === 'title') return;
    this.heroTick();
    const st = this.st, p = this.pl, d = this.d;
    // orbs
    const lifeMax = d.lifeMax || p.lifeMax || 100, zoomMax = d.zoomMax || p.zoomMax || 50;
    this.life.set(p.life == null ? lifeMax : p.life, lifeMax);
    this.zoom.set(p.zoom == null ? zoomMax : p.zoom, zoomMax);
    this.life.draw(dt); this.zoom.draw(dt);
    const zoomNow = p.zoom == null ? zoomMax : p.zoom;
    // hotbar (LMB / RMB show the active weapon set's pair; the badge flips on a swap)
    const hot = p.hotbar || [];
    const wsKey = (p.activeWeapon === 1 ? 1 : 0) + ':' + (d.weaponType || 'sword');
    if (wsKey !== this.wsKey) {
      const first = this.wsKey === undefined;
      this.wsKey = wsKey;
      const [set, wt] = wsKey.split(':');
      this.wsBadge.querySelector('.ws-ic').innerHTML = glyph(wt === 'ball' ? 'ball' : wt === 'staff' ? 'staff' : 'sword');
      this.wsBadge.querySelector('.ws-n').textContent = set === '1' ? 'II' : 'I';
      this.$.hotbar.dataset.ws = wt;
      if (!first) { replay(this.wsBadge, 'flip', 520); for (const k of [0, 1]) replay(this.slots[k].el, 'swap', 450); }
    }
    for (let i = 0; i < 6; i++) {
      const s = this.slots[i], id = hot[i] || null;
      const icKey = id === 'attack' ? 'attack:' + (d.weaponType || 'sword') : id;
      if (s.id !== id || s.icKey !== icKey) {
        const was = s.id;
        s.id = id; s.icKey = icKey;
        s.ic.src = id ? hotbarIconURL(id, d) : '';
        setCls(s.el, 'empty', !id);
        if (was !== undefined) replay(s.el, 'swap', 450);
      }
      if (!id) continue;
      const cdv = this.cd.provider ? clamp(+this.cd.provider.cooldown?.(id) || 0) : 0;
      const q = Math.round(cdv * 200) / 200;
      if (q !== s.cdv) {
        if (s.cdv > 0 && q === 0) replay(s.el, 'ready', 600);
        s.cdv = q;
        setVar(s.cd, '--cd', q.toFixed(3));
        setCls(s.el, 'cooling', q > 0);
      }
      if (q > 0 && this.cd.provider?.remaining) { const r = +this.cd.provider.remaining(id) || 0; setText(s.cdt, r > 0 ? (r < 10 ? r.toFixed(1) : Math.ceil(r) + '') : ''); }
      else setText(s.cdt, '');
      let oom, wrong = false;
      if (this.cd.provider?.cost) oom = (+this.cd.provider.cost(id) || 0) > zoomNow + 1e-6;
      else { const u = skillUsable(id, st, d, zoomNow); oom = !u.ok && /zoom/i.test(u.why || ''); wrong = !u.ok && /needs/i.test(u.why || ''); }
      setCls(s.el, 'oom', oom); setCls(s.el, 'wrongwep', wrong);
    }
    for (const b of this.belt) {
      const n = st.potions?.[b.k] || 0;
      if (n !== b.v) { if (b.v >= 0 && n > b.v) replay(b.el, 'gain', 500); b.v = n; setText(b.n, String(n)); setCls(b.el, 'none', n <= 0); if (b.k === 'rejuv') setCls(b.el, 'has', n > 0); }
    }
    // the quick-meal slot: shows while there's a dish to eat (or one was chosen)
    const M = this.mealSlot, qid = this.ui.G?.life?.kitchen?.quickId?.() || null, qn = qid ? st.pantry?.[qid] || 0 : 0;
    if (qid !== M.id) { M.id = qid; if (qid) M.img.src = pantryIcon(qid); setCls(M.el, 'has', !!qid); replay(M.el, 'swap', 450); }
    if (qn !== M.v) { if (M.v >= 0 && qn > M.v) replay(M.el, 'gain', 500); M.v = qn; setText(M.n, String(qn)); setCls(M.el, 'none', qn <= 0); }
    // xp + level
    const lvl = p.lvl || 1;
    if (lvl !== this.cache.lvl) {
      if (this.cache.lvl && lvl > this.cache.lvl) { replay(this.$.xp, 'lvlup', 1800); replay(this.root.querySelector('.pc-bub'), 'lvlup', 1200); }
      this.cache.lvl = lvl; setText(this.$.lv, String(lvl)); setText(this.$.xpLv, String(lvl));
    }
    const x = xpProgress(p);
    const xf = Math.round(x.frac * 1000) / 10;
    if (xf !== this.cache.xf) {
      const prev = this.cache.xf;
      this.cache.xf = xf;
      setStyle(this.$.xpFill, 'width', xf + '%'); setStyle(this.$.pcxp, 'width', xf + '%');
      if (prev != null && xf > prev) { setStyle(this.$.xpGain, 'width', xf + '%'); replay(this.$.xp, 'gain', 700); }
      else setStyle(this.$.xpGain, 'width', xf + '%');
      setText(this.$.xpT, `${fmt(x.cur)} / ${fmt(x.need)}`);
    }
    // stat / skill points
    const sp = p.statPts || 0, kp = p.skillPts || 0;
    if (sp !== this.cache.sp) { this.cache.sp = sp; setText(this.$.lvbStat.querySelector('b'), String(sp)); setCls(this.$.lvbStat, 'on', sp > 0); this.dot('character', sp); }
    if (kp !== this.cache.kp) { this.cache.kp = kp; setText(this.$.lvbSkill.querySelector('b'), String(kp)); setCls(this.$.lvbSkill, 'on', kp > 0); this.dot('skills', kp); }
    // Shadow
    const sh = this.shadowHP();
    const shf = Math.round(clamp(sh.cur / sh.max) * 100);
    if (shf !== this.cache.shf) {
      if (this.cache.shf != null && shf < this.cache.shf) replay(this.$.pal, 'hurt', 400);
      this.cache.shf = shf; setStyle(this.$.palF, 'width', shf + '%'); setStyle(this.$.palG, 'width', shf + '%'); setCls(this.$.pal, 'low', shf < 30); setCls(this.$.pal, 'ko', shf <= 0);
    }
    // coins tick-up
    const coins = st.coins || 0;
    if (this.cache.coinsShown == null) this.cache.coinsShown = coins;
    if (coins !== this.cache.coinsTarget) {
      if (this.cache.coinsTarget != null) {
        const diff = coins - this.cache.coinsTarget;
        replay(this.$.coins, diff > 0 ? 'bump' : 'spend', 500);
        this.popDelta(this.$.coins, diff);
      }
      this.cache.coinsTarget = coins;
    }
    const cs = this.cache.coinsShown = Math.abs(this.cache.coinsShown - coins) < 0.6 ? coins : damp(this.cache.coinsShown, coins, 7, dt);
    setText(this.$.coinsV, fmt(cs));
    // materials (key ones)
    this.updateMats();
    // clock / location
    this.updateClock();
    // quest tracker (throttled)
    this.cache.qAcc = (this.cache.qAcc || 0) - dt;
    if (this.cache.qAcc <= 0) {
      this.cache.qAcc = 0.5; this.updateQuests();
      const vs = st.village?.stats;
      if (vs && this.mode === 'village') {
        if (vs.demand && !this._rciManual) this.setRCI(vs.demand, true);
        const pop = `${glyph('home')}<b>${vs.population ?? 0}</b><span class="rci-sep"></span>${glyph('heart')}<b>${Math.round((vs.happiness ?? 0.5) * 100)}%</b>`;
        if (pop !== this.cache.pop) { this.cache.pop = pop; this.$.rciFoot.innerHTML = pop; }
      }
    }
    // minimap (≈15 fps)
    this.mm.acc += dt;
    if (this.mm.acc > 1 / 15) { this.mm.acc = 0; this.drawMinimap(); }
    // target & boss ghost bars
    this.animBars(dt);
  }

  dot(name, n) {
    const b = this.root.querySelector(`.mb[data-open="${name}"] .mb-dot`);
    if (b) { b.textContent = n > 0 ? n : ''; b.classList.toggle('on', n > 0); }
  }

  shadowHP() {
    const c = this.G?.companion;
    const max = c?.lifeMax ?? c?.hpMax ?? c?.maxHp ?? c?.maxLife ?? 100;
    const cur = c?.life ?? c?.hp ?? max;
    return { cur: Math.max(0, cur), max: Math.max(1, max) };
  }

  popDelta(anchor, diff) {
    if (!diff) return;
    const n = el('div', 'delta ' + (diff > 0 ? 'up' : 'down'), (diff > 0 ? '+' : '−') + fmt(Math.abs(diff)));
    anchor.appendChild(n);
    setTimeout(() => n.remove(), 1100);
  }

  updateMats() {
    const m = this.st.materials || {};
    const keys = ['wood', 'stone', ...Object.keys(m).filter(k => k !== 'wood' && k !== 'stone' && m[k] > 0)].slice(0, 5);
    const sig = keys.join();
    if (sig !== this.cache.matSig) {
      this.cache.matSig = sig;
      this.$.mats.innerHTML = keys.map(k => `<div class="mat" data-k="${k}"><img src="${materialIconURL(k)}" alt="" draggable="false"><b>0</b></div>`).join('');
      this.matEls = {}; for (const e of this.$.mats.children) this.matEls[e.dataset.k] = { el: e, b: e.querySelector('b'), v: null };
    }
    for (const k in this.matEls) {
      const o = this.matEls[k], v = m[k] || 0;
      if (v !== o.v) { if (o.v != null) { replay(o.el, v > o.v ? 'bump' : 'spend', 500); this.popDelta(o.el, v - o.v); } o.v = v; setText(o.b, fmt(v)); }
    }
  }

  updateClock() {
    const G = this.G;
    const hour = ((G.day?.hour ?? this.st.hour ?? 8.5) % 24 + 24) % 24;
    const day = this.st.day ?? 1;
    const hq = Math.floor(hour * 6) / 6; // 10-minute steps
    if (this.mode === 'dungeon') {
      const loc = this.cache.loc || { name: 'The Burrow', sub: 'B1F' };
      const sig = 'd' + loc.name + loc.sub;
      if (sig !== this.cache.clockSig) { this.cache.clockSig = sig; setText(this.$.locT, loc.name); setText(this.$.locS, ''); }
      return;
    }
    const sig = `${day}|${hq}|${this.cache.loc?.name || ''}`;
    if (sig === this.cache.clockSig) return;
    this.cache.clockSig = sig;
    const hh = Math.floor(hq), mm = Math.round((hq - hh) * 60);
    const h12 = ((hh + 11) % 12) + 1;
    setText(this.$.locT, `${this.cache.loc?.name ? this.cache.loc.name + ' · ' : ''}Day ${day} · ${h12}:${String(mm).padStart(2, '0')}`);
    setText(this.$.locS, hh < 12 ? 'am' : 'pm');
    setStyle(this.$.ckHand, 'transform', `rotate(${((hour / 24) * 360 + 180).toFixed(1)}deg)`);
    const [a, b] = skyAt(hour);
    setStyle(this.$.ckSky, 'background', `radial-gradient(circle at 50% 80%, ${a}, ${b})`);
    const night = hour < 5.5 || hour > 19.5;
    setCls(this.$.clock, 'night', night);
  }

  setLocation(name, sub) {
    this.cache.loc = name ? { name, sub: sub || '' } : null;
    this.cache.clockSig = null;
    if (sub) {
      const f = this.$.floor, b = f.querySelector('b'), jp = /[^ -]/.test(sub);
      b.textContent = sub; f.querySelector('span').textContent = floorJP(sub);
      // an outdoor region's badge carries its Japanese name (3-4 kanji): shrink to fit the round badge
      b.style.fontSize = jp && sub.length >= 4 ? '13px' : jp && sub.length === 3 ? '17px' : '';
      b.style.letterSpacing = jp && sub.length >= 3 ? '-1px' : '';
    }
  }

  updateQuests() {
    const list = this.ui.questList();
    const sig = JSON.stringify(list.slice(0, 3));
    if (sig === this.cache.qSig) return;
    const prev = this.cache.qPrev || {};
    this.cache.qSig = sig;
    const next = {};
    this.$.qt.classList.toggle('none', !list.length);
    this.$.qtList.innerHTML = list.slice(0, 3).map((q, qi) => {
      const objs = q.objectives.map((o, oi) => {
        const key = q.id + ':' + oi; next[key] = o.done;
        const justDone = o.done && prev[key] === false;
        const prog = o.need > 1 ? `<span class="qo-n">${Math.min(o.have, o.need)}/${o.need}</span>` : '';
        return `<div class="qo ${o.done ? 'done' : ''} ${justDone ? 'just' : ''}"><i class="qo-box">${o.done ? glyph('check') : ''}</i><span class="qo-t">${esc(o.text)}</span>${prog}</div>`;
      }).join('');
      return `<div class="qt-q ${q.done ? 'done' : ''}" style="--i:${qi}"><div class="qt-n">${esc(q.name)}</div>${objs}</div>`;
    }).join('');
    this.cache.qPrev = next;
  }

  // ---------------------------------------------------------------- minimap
  drawMinimap() {
    const cv = this.$.mmCv, g = this.mmCtx;
    const size = 180, dpr = Math.min(2, devicePixelRatio || 1);
    if (cv.width !== Math.round(size * dpr)) { cv.width = cv.height = Math.round(size * dpr); }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const pp = this.playerPos();
    g.clearRect(0, 0, size, size);
    if (this.mm.provider?.draw) {
      g.save();
      try { this.mm.provider.draw(g, size, pp, { big: false, time: this.G.engine?.time || 0 }); } catch (e) { if (!this._mmErr) { this._mmErr = 1; console.warn('[ui] minimap provider', e); } }
      g.restore();
    } else drawPlaceholderMap(g, size, pp, this.mode);
    // camera view cone
    const yaw = this.G.engine?.rig?.yaw;
    if (yaw != null) {
      g.save(); g.translate(size / 2, size / 2); g.rotate(-yaw);
      const cone = g.createRadialGradient(0, 0, 0, 0, 0, 60);
      cone.addColorStop(0, 'rgba(255,255,255,.28)'); cone.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = cone; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 60, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5); g.closePath(); g.fill();
      g.restore();
    }
    // player arrow
    const facing = this.G.player?.facing ?? 0;
    g.save(); g.translate(size / 2, size / 2); g.rotate(-facing + Math.PI);
    g.beginPath(); g.moveTo(0, -9); g.lineTo(7, 7); g.lineTo(0, 3.5); g.lineTo(-7, 7); g.closePath();
    g.fillStyle = '#ff5c8a'; g.strokeStyle = '#fff'; g.lineWidth = 3; g.lineJoin = 'round'; g.stroke(); g.fill();
    g.strokeStyle = '#4a2c2a'; g.lineWidth = 1.4; g.stroke();
    g.restore();
  }
  playerPos() {
    const P = this.G?.player;
    return P?.pos || P?.position || P?.group?.position || P?.obj?.position || this.G?.engine?.rig?.focus || { x: 0, y: 0, z: 0 };
  }

  // ---------------------------------------------------------------- target / boss
  setTarget(info) {
    const tg = this.$.tg;
    if (!info) { if (this.target) { this.target = null; setCls(tg, 'show', false); } return; }
    const frac = clamp(info.frac ?? (info.hp ?? info.life ?? 0) / Math.max(1, info.hpMax ?? info.max ?? info.lifeMax ?? info.maxHp ?? 1));
    const key = info.id ?? info.name;
    const t = this.target;
    if (!t || t.key !== key) {
      this.target = { key, frac, ghost: frac, hold: 0 };
      setText(this.$.tgName, info.name || 'Monster');
      const rc = info.color || rarityColor(info.rarity === 'champion' ? 'champion' : info.rarity);
      setVar(tg, '--rc', rc);
      tg.dataset.r = info.rarity || 'normal';
      const mods = (info.mods || []).map(m => `<span>${esc(m)}</span>`).join('');
      this.$.tgMods.innerHTML = (info.level ? `<span class="lv">Lv ${info.level}</span>` : '') + mods;
      setCls(tg, 'show', true); replay(tg, 'swap', 300);
    } else if (frac < t.frac - 0.001) { t.hold = 0.35; replay(tg, 'hit', 200); }
    this.target.frac = frac;
  }
  setBoss(info) {
    const b = this.$.boss;
    if (!info) { if (this.boss) { this.boss = null; setCls(b, 'show', false); setCls(this.$.tc, 'has-boss', false); } return; }
    const frac = clamp(info.frac ?? (info.hp ?? info.life ?? 0) / Math.max(1, info.hpMax ?? info.max ?? info.lifeMax ?? info.maxHp ?? 1));
    const key = info.id ?? info.name;
    if (!this.boss || this.boss.key !== key) {
      this.boss = { key, frac, ghost: frac, hold: 0 };
      setText(this.$.bbName, info.name || 'Boss');
      setText(this.$.bbSub, info.title || info.sub || '');
      setCls(b, 'show', false); void b.offsetWidth; setCls(b, 'show', true);
      setCls(this.$.tc, 'has-boss', true);
      this._bbRect = null; this._band = null; // re-measured on the next request (layout offsets: valid during the drop-in)
    } else if (frac < this.boss.frac - 0.001) { this.boss.hold = 0.4; replay(b, 'hit', 260); }
    this.boss.frac = frac;
    setText(this.$.bbPct, Math.ceil(frac * 100) + '%');
  }
  animBars(dt) {
    for (const [o, fill, ghost] of [[this.target, this.$.tgFill, this.$.tgGhost], [this.boss, this.$.bbFill, this.$.bbGhost]]) {
      if (!o) continue;
      if (o.hold > 0) o.hold -= dt; else o.ghost = damp(o.ghost, o.frac, 4, dt);
      if (o.ghost < o.frac) o.ghost = o.frac;
      setStyle(fill, 'width', (o.frac * 100).toFixed(2) + '%');
      setStyle(ghost, 'width', (o.ghost * 100).toFixed(2) + '%');
    }
    this.bossDodge(dt);
  }
  // The boss bar's settled screen rect (name + bar frame). Layout offsets ignore the drop-in animation's and the dodge's
  // transforms, so it is exact from the first frame the bar shows; cached until the next boss / a resize.
  bossBarRect() {
    const b = this.$.boss;
    if (!this.boss || !b.offsetHeight) return null;
    if (this._bbRect) return this._bbRect;
    if (!this._bbResize) { this._bbResize = true; addEventListener('resize', () => { this._bbRect = null; this._band = null; }); }
    const fr = b.querySelector('.bb-frame'), tc = this.$.tc.getBoundingClientRect(); // (.hud-tc only carries a translateX)
    const x = tc.left + b.offsetLeft, y = tc.top + b.offsetTop;
    return (this._bbRect = { l: x, r: x + b.offsetWidth, t: y, b: tc.top + fr.offsetTop + fr.offsetHeight + 5 }); // (+ its drop shadow)
  }
  // The playfield band a boss fight is framed into (screen px): from the bottom of the boss bar down to the top of the
  // hotbar dock / orbs, clear of the side panels. Re-measured every 2 s (the dock slides with the UI mode).
  playBand() {
    const now = performance.now();
    if (this._band && now < this._band.until) return this._band;
    const bar = this.bossBarRect();
    let bottom = innerHeight * 0.83;
    for (const e of this.$.bc.querySelectorAll('.dock, .orb-slot')) { const r = e.getBoundingClientRect(); if (r.height > 8 && r.top > innerHeight * 0.5) bottom = Math.min(bottom, r.top); }
    return (this._band = { t: bar ? bar.b : innerHeight * 0.12, b: bottom, l: innerWidth * 0.17, r: innerWidth * 0.83, until: now + 2000 });
  }
  // The boss bar steps aside — fades to a ghost and lifts a little — while the boss itself projects underneath it
  // (a tall boss standing beyond Chewy); it comes back as soon as the boss is clear of it. During the boss's intro
  // reveal (the roar + title card) it stays a half-faded ghost and settles in when the fight begins.
  bossDodge(dt) {
    const b = this.$.boss, bb = this.G?.dungeon?.boss, cam = this.G?.engine?.camera;
    let want = 0;
    if (this.boss && bb?.alive && cam) {
      if (performance.now() < (this.G.dungeon.introUntil || 0)) want = 0.75;
      const R = this.bossBarRect();
      if (R) {
        const v = this._bbV || (this._bbV = new THREE.Vector3()), W = innerWidth, H = innerHeight;
        const h = this.G.dungeon.bossHeight?.(bb) ?? (bb.height || 2), rad = (bb.bodyR || bb.radius || 1) * 0.9;
        v.copy(bb.pos).setY(bb.pos.y + h).project(cam); const hx = (v.x * 0.5 + 0.5) * W, hy = (-v.y * 0.5 + 0.5) * H;
        v.copy(bb.pos).setY(bb.pos.y + h * 0.5).project(cam); const my = (-v.y * 0.5 + 0.5) * H;
        v.set(bb.pos.x + cam.matrixWorld.elements[0] * rad, bb.pos.y + h * 0.5, bb.pos.z + cam.matrixWorld.elements[2] * rad).project(cam);
        const rpx = Math.abs((v.x * 0.5 + 0.5) * W - hx) + 10;
        // the upper body (head down to mid-height) under the bar is what hides the boss's face and wind-ups
        if (hy < R.b && my > R.t && hx + rpx > R.l && hx - rpx < R.r) want = 1;
      }
    }
    this._bbDodge = damp(this._bbDodge || 0, want, want ? 7 : 4, dt);
    const k = this._bbDodge < 0.01 ? 0 : this._bbDodge;
    this._bbLift = Math.round(k * 14);
    setStyle(b, 'opacity', k ? (1 - 0.72 * k).toFixed(2) : '');
    setStyle(b, 'translate', k ? `0 ${-this._bbLift}px` : '');
  }

  // ---------------------------------------------------------------- prompt
  setInteract(text, opts = {}) {
    const p = this.$.prompt;
    let key = opts.key;
    if (key === undefined) key = !text ? '' : /^(click|drag)/i.test(text) ? 'mouse' : this.ui.root.classList.contains('building') ? null : 'F';
    const sig = text ? (key || '-') + '|' + text : '';
    if (sig === this.cache.prompt) return;
    this.cache.prompt = sig;
    if (!text) { setCls(p, 'show', false); return; }
    setText(this.$.prT, text);
    this.$.prK.style.display = key ? '' : 'none';
    if (key === 'mouse') this.$.prK.innerHTML = glyph('mouseL'); else if (key) { this.$.prK._t = null; setText(this.$.prK, key); }
    setCls(p, 'hint', !key);
    setCls(p, 'show', false); void p.offsetWidth; setCls(p, 'show', true);
  }

  setRCI(v, auto) {
    if (!v) return;
    if (!auto) this._rciManual = true;
    const r = { R: v.R ?? v.r ?? 0, C: v.C ?? v.c ?? 0, W: v.W ?? v.w ?? 0 };
    this.cache.rci = r;
    for (const k of ['R', 'C', 'W']) {
      const c = this.root.querySelector(`.rci-c[data-k="${k}"]`);
      const x = clamp(r[k], -1, 1);
      setVar(c, '--v', Math.abs(x).toFixed(3));
      setCls(c, 'neg', x < 0); setCls(c, 'hot', x > 0.66);
    }
  }

  setBuffs(list = []) {
    const sig = list.map(b => b.id + ':' + Math.ceil(b.time || 0) + (b.iconURL || '')).join();
    if (sig === this.cache.buffs) return;
    this.cache.buffs = sig;
    this.$.buffs.innerHTML = list.map(b => `<div class="buff${b.meal ? ' meal' : ''}" style="--bc:${b.color || '#ffcf4a'}" data-tip="${esc(b.name || '')}">${b.iconURL ? `<img src="${b.iconURL}" alt="">` : b.glyph ? glyph(b.glyph) : `<span>${b.icon || '✦'}</span>`}${b.time ? `<i>${b.time > 60 ? Math.ceil(b.time / 60) + 'm' : Math.ceil(b.time) + 's'}</i>` : ''}</div>`).join('');
  }

  // ---------------------------------------------------------------- flashes
  flashSlot(i) { const s = this.slots[i]; if (s) replay(s.el, 'press', 320); }
  // slot → skill chooser; for the mouse slots the popover names the weapon set it edits
  openAssign(i, anchor) {
    this.ui.skills?.openAssign?.(i, anchor);
    if (i > 1) return;
    const h = this.ui.pop?.querySelector?.('.pop-h');
    if (!h || h.querySelector('.pop-ws')) return;
    const wt = this.d.weaponType || 'sword', set = this.pl.activeWeapon === 1 ? 'II' : 'I';
    h.insertAdjacentHTML('beforeend', `<span class="pop-ws" data-ws="${wt}">${glyph(wt === 'ball' ? 'ball' : wt === 'staff' ? 'staff' : 'sword')}Set ${set}</span>`);
  }
  flashMeal(ok) { const M = this.mealSlot; if (M) replay(M.el, ok ? 'press' : 'deny', 360); }
  flashBelt(k) { const b = this.belt.find(x => x.k === k); if (b) replay(b.el, b.v > 0 ? 'press' : 'deny', 360); }
  slotTip(i) {
    const id = this.pl.hotbar?.[i];
    const key = SLOT_KEYS[i];
    if (!id) return simpleTip(`Empty slot <span class="kc sm">${key}</span>`, `<span class="tt-dim">Click to assign a skill, or drag one here from the skill tree (K).</span>`);
    const def = skillDef(id);
    const lvl = this.pl.skills?.[id] || (id === 'attack' ? 1 : 0);
    const cost = skillCost(id, this.st);
    const wep = id === 'attack' ? (this.d.weaponType === 'ball' ? 'Basic attack · Red Tennis Ball' : this.d.weaponType === 'staff' ? 'Basic attack · Sparkle Bolt' : 'Basic attack · Bone Sword') : '';
    const setNote = i < 2 ? `<br><span class="tt-dim">Weapon set ${this.pl.activeWeapon === 1 ? 'II' : 'I'} — <span class="kc sm">X</span> swaps to the other set's mouse skills</span>` : '';
    return simpleTip(`${esc(def?.name || id)} <span class="kc sm">${key}</span>`, `${def?.desc ? esc(def.desc) + '<br>' : ''}<span class="tt-dim">${id === 'attack' ? wep : 'Level ' + lvl}${cost ? ` · ${Math.round(cost * 10) / 10} Zoom` : ''}</span>${setNote}`);
  }
  // screen-space rect of the bag button (fly-to-bag target)
  bagRect() {
    const b = this.root.querySelector('.mb[data-open="inventory"]');
    return b ? b.getBoundingClientRect() : { left: innerWidth - 80, top: innerHeight - 60, width: 40, height: 40 };
  }
  bumpBag() { const b = this.root.querySelector('.mb[data-open="inventory"]'); if (b) replay(b, 'gulp', 500); }
}

const pct = v => `${v >= 0 ? '+' : ''}${Math.round(v * 100)}%`;
function floorJP(sub) { const m = /(\d+)/.exec(sub || ''); return m ? `地下${m[1]}階` : ''; }

// sky gradient for the clock dial
const SKY = [[0, '#2a2f6a', '#141638'], [5, '#4a4a8a', '#1e2050'], [6.5, '#ffb3a0', '#8a7ac8'], [8, '#bfe6ff', '#6ab0f0'], [16, '#bfe6ff', '#5aa0e8'], [18, '#ffc48a', '#e87a8a'], [19.5, '#8a6ab8', '#3a3478'], [21, '#2a2f6a', '#141638'], [24, '#2a2f6a', '#141638']];
function skyAt(h) {
  for (let i = 0; i < SKY.length - 1; i++) {
    const [h0, a0, b0] = SKY[i], [h1, a1, b1] = SKY[i + 1];
    if (h >= h0 && h <= h1) { const t = (h - h0) / (h1 - h0 || 1); return [mix(a0, a1, t), mix(b0, b1, t)]; }
  }
  return [SKY[0][1], SKY[0][2]];
}
function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t), g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t), bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
  return `rgb(${r},${g},${bl})`;
}

// A pleasant stand-in until the game supplies a minimap provider.
export function drawPlaceholderMap(g, size, pp, mode) {
  const dungeon = mode === 'dungeon';
  g.fillStyle = dungeon ? '#3a2c44' : '#9fd88a'; g.fillRect(0, 0, size, size);
  const ox = -(pp.x || 0) * 3, oz = -(pp.z || 0) * 3;
  g.save(); g.translate(size / 2 + (ox % 40), size / 2 + (oz % 40));
  g.strokeStyle = dungeon ? 'rgba(255,255,255,.06)' : 'rgba(255,255,255,.22)'; g.lineWidth = 1;
  for (let i = -6; i <= 6; i++) { g.beginPath(); g.moveTo(i * 20, -140); g.lineTo(i * 20, 140); g.stroke(); g.beginPath(); g.moveTo(-140, i * 20); g.lineTo(140, i * 20); g.stroke(); }
  g.restore();
  if (!dungeon) {
    g.fillStyle = '#7cc0ff'; g.beginPath(); g.ellipse(size * 0.25 + ox * 0.2, size * 0.75 + oz * 0.2, 40, 22, 0.4, 0, TAU); g.fill();
    g.fillStyle = '#e8d6b0'; g.fillRect(size / 2 - 4 + ox * 0.2, 0, 8, size);
  }
}
