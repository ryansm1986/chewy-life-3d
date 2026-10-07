// Skill trees (the active hero's three: Bone Blade / Fetch Mastery / Pack Spirit, or Moka's Tidewater / Starlight Kibble /
// Duck Hunt) + hotbar assignment (popover, drag, hover+1-4).
import { el, esc, replay, setText } from './dom.js';
import { glyph } from './glyphs.js';
import { padGlyph } from './padGlyphs.js';
import { Panel } from './panel.js';
import { TREES, treesFor, skillList, skillDef, skillIconURL, hotbarIconURL, skillInfoLines, canLearnSkill, effLevel, treeInfo, skillTraining } from './rpg.js';
import { ChargeDrawer, chipState, chargeTipHTML } from './chargePanel.js';

const COLW = 118, ROWH = 80, NODE = 64, PADX = 64, PADY = 26;
const SLOT_NAMES = ['LMB', 'RMB', '1', '2', '3', '4'];

export class SkillsPanel extends Panel {
  constructor(ui) { super(ui, { name: 'skills', title: 'Skills', jp: 'スキル', side: 'left', cls: 'p-skills', icon: 'sparkle' }); this.tree = 'bone'; this.hoverId = null; }
  init() {
    const b = this.body;
    this.extra.innerHTML = `<div class="sk-pts">${glyph('star')}<b>0</b><span>points</span></div>`;
    b.innerHTML = `<div class="tabs sk-tabs">${TREES.map(t => `<button class="tab" data-t="${t.id}" style="--tc:${t.color}">${glyph(t.glyph)}<span>${t.name}</span><b class="tab-n">0</b></button>`).join('')}</div>
      <div class="tree-wrap"><div class="tree"><div class="tree-title"><span class="tt-jp"></span></div><svg class="links"></svg><div class="rows"></div><div class="nodes"></div></div></div>
      <div class="sk-foot kbm-only">${glyph('mouseL')}Learn <span class="sep">·</span>${glyph('mouseR')}Assign <span class="sep">·</span><span class="kc sm">1</span>–<span class="kc sm">4</span> while hovering <span class="sep">·</span> Drag to hotbar</div><div class="sk-foot pad-only"><span class="kc sm pad">${padGlyph('A')}</span>Learn <span class="sep">·</span><span class="kc sm pad">${padGlyph('Y')}</span>Assign <span class="sep">·</span><span class="kc sm pad">${padGlyph('X')}</span>Charge perks <span class="sep">·</span><span class="kc sm pad">${padGlyph('LB')}</span><span class="kc sm pad">${padGlyph('RB')}</span>Trees</div>`;
    this.$ = { pts: this.extra.querySelector('.sk-pts b'), ptsW: this.extra.querySelector('.sk-pts span'), ptsBox: this.extra.querySelector('.sk-pts'), tree: b.querySelector('.tree'), links: b.querySelector('.links'), nodes: b.querySelector('.nodes'), rows: b.querySelector('.rows'), title: b.querySelector('.tree-title') };
    this.chg = new ChargeDrawer(this); // (the Charge drawer docked to the tree's right: docs/CHARGE.md §4)
    b.querySelector('.sk-tabs').addEventListener('click', e => { const t = e.target.closest('.tab'); if (t) this.setTree(t.dataset.t); });
    const N = this.$.nodes;
    N.addEventListener('mouseover', e => { const n = e.target.closest('.node'); if (!n || n === this._hov) return; this._hov = n; this.hoverId = n.dataset.id; this.ui.tip.show(this.tipHTML(n.dataset.id), 'skill', n); });
    N.addEventListener('mouseout', e => { const n = e.target.closest('.node'); if (n && !n.contains(e.relatedTarget)) { this._hov = null; this.hoverId = null; this.ui.tip.hide(n); } });
    N.addEventListener('contextmenu', e => { const n = e.target.closest('.node'); if (!n) return; e.preventDefault(); this.assignPopover(n.dataset.id, n); });
    N.addEventListener('pointerdown', e => {
      const n = e.target.closest('.node'); if (!n || e.button !== 0) return;
      this._press = { id: n.dataset.id, x: e.clientX, y: e.clientY, n };
    });
    addEventListener('pointermove', e => {
      const p = this._press; if (!p) return;
      if (!this._drag && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 7) {
        const lvl = this.lvl(p.id), def = skillDef(p.id);
        if (lvl > 0 && !def?.passive) { this._drag = p.id; this.ui.dragSkill(p.id, e.clientX, e.clientY); }
      }
      if (this._drag) this.ui.dragSkillMove(e.clientX, e.clientY);
    }, { passive: true });
    addEventListener('pointerup', e => {
      const p = this._press; this._press = null;
      if (this._drag) { const id = this._drag; this._drag = null; this.ui.dragSkillEnd(id, e.clientX, e.clientY); return; }
      if (p && e.target.closest?.('.node') === p.n) { if (e.target.closest?.('.nd-chg')) { this.chg.show(p.id); this._treeSig = null; this.render(); this.ui.sfx?.('tab'); return; } this.learn(p.id, p.n); }
    });
  }
  lvl(id) { return this.st.player?.skills?.[id] || 0; }
  setTree(id) {
    if (id === this.tree) return;
    this.tree = id;
    this._treeSig = null;
    this.render();
    replay(this.$.tree, 'swap', 450);
    this.ui.sfx?.('tab');
  }
  onOpen() { if (this.opts?.tree) this.setTree(this.opts.tree); }
  state(s) {
    const p = this.st.player || {}, lvl = this.lvl(s.id);
    if (lvl >= s.maxLvl) return 'maxed';
    if (skillTraining(s.id)) return 'locked training'; // (greyed until its cast is built: a small "In training" note in the tooltip)
    const can = canLearnSkill(s.id, this.st).ok;
    const reqOk = (p.lvl || 1) >= s.reqLvl && s.prereq.every(q => this.lvl(q) > 0);
    if (can) return lvl > 0 ? 'learned can' : 'avail can';
    if (lvl > 0) return 'learned';
    return reqOk ? 'avail' : 'locked';
  }
  render() {
    const p = this.st.player || {};
    // only the trees of the hero being played (Chewy: bone/fetch/spirit, Moka: tide/star/duck)
    const cls = p.cls || 'chewy';
    if ((TREES.find(t => t.id === this.tree)?.cls || 'chewy') !== cls) { this.tree = treesFor(cls)[0].id; this._treeSig = null; }
    const pts = p.skillPts || 0;
    setText(this.$.pts, String(pts));
    setText(this.$.ptsW, pts === 1 ? 'point' : 'points');
    this.$.ptsBox.classList.toggle('on', pts > 0);
    const all = skillList();
    for (const t of TREES) {
      const n = all.filter(s => s.tree === t.id).reduce((a, s) => a + this.lvl(s.id), 0);
      const tab = this.body.querySelector(`.tab[data-t="${t.id}"]`);
      tab.classList.toggle('on', t.id === this.tree);
      tab.hidden = t.cls !== cls;
      setText(tab.querySelector('.tab-n'), String(n));
    }
    const T = treeInfo(this.tree);
    const list = all.filter(s => s.tree === T.id);
    const tr = this.$.tree;
    tr.style.setProperty('--tc', T.color); tr.style.setProperty('--tb1', T.bg[0]); tr.style.setProperty('--tb2', T.bg[1]);
    tr.dataset.tree = T.id;
    this.chg.pick(T.id);
    this.chg.render();
    const sig = T.id + '|' + list.map(s => s.id + this.lvl(s.id) + this.state(s)).join() + '|' + (p.hotbar || []).join() + '|' + JSON.stringify(p.chargePerks || {}) + '|' + pts + '|' + this.chg.id;
    if (sig === this._treeSig) return;
    this._treeSig = sig;
    this.$.title.innerHTML = `<span class="tr-wm">${glyph(T.glyph)}</span><span class="tr-jp">${T.jp}</span>`;
    // row level labels
    const rowReq = [];
    for (const s of list) rowReq[s.row] = Math.min(rowReq[s.row] ?? 99, s.reqLvl);
    this.$.rows.innerHTML = Array.from({ length: 6 }, (_, r) => `<div class="rowl ${(p.lvl || 1) >= (rowReq[r] ?? 99) ? 'ok' : ''}" style="top:${PADY + r * ROWH + NODE / 2}px">${rowReq[r] != null ? `Lv ${rowReq[r]}` : ''}</div>`).join('');
    // links
    const pos = s => ({ x: PADX + s.col * COLW + NODE / 2, y: PADY + s.row * ROWH + NODE / 2 });
    let svg = '';
    for (const s of list) {
      for (const q of s.prereq) {
        const o = list.find(x => x.id === q); if (!o) continue;
        const a = pos(o), b = pos(s);
        const on = this.lvl(q) > 0;
        const lit = on && this.lvl(s.id) > 0;
        const d = a.x === b.x ? `M${a.x} ${a.y + NODE / 2 - 4}L${b.x} ${b.y - NODE / 2 + 4}` : `M${a.x} ${a.y + NODE / 2 - 4}C${a.x} ${(a.y + b.y) / 2 + 10} ${b.x} ${(a.y + b.y) / 2 - 10} ${b.x} ${b.y - NODE / 2 + 4}`;
        svg += `<path class="lk-bg" d="${d}"/><path class="lk ${on ? 'on' : ''} ${lit ? 'lit' : ''}" d="${d}"/>`;
      }
    }
    this.$.links.innerHTML = svg;
    // nodes (reuse elements so learn animations survive re-render)
    const keep = new Map([...this.$.nodes.children].map(n => [n.dataset.id, n]));
    const hot = p.hotbar || [];
    for (const s of list) {
      let n = keep.get(s.id);
      if (!n) {
        n = el('div', 'node'); n.dataset.id = s.id;
        n.innerHTML = `<div class="nd-ring"></div><div class="nd-in"><img alt="" draggable="false"></div><span class="nd-lv"></span><span class="nd-lock">${glyph('lock')}</span><span class="nd-hk"></span><span class="nd-chg" title="Charge perks">${glyph('zap')}<b></b></span>`;
        n.querySelector('img').src = skillIconURL(s.id);
        this.$.nodes.appendChild(n);
      } else keep.delete(s.id);
      const { x, y } = pos(s);
      n.style.left = (x - NODE / 2) + 'px'; n.style.top = (y - NODE / 2) + 'px';
      const transient = ['learned-pop', 'deny'].filter(c => n.classList.contains(c)).join(' ');
      n.className = 'node ' + this.state(s) + (s.passive ? ' passive' : '') + (transient ? ' ' + transient : '');
      const lv = this.lvl(s.id);
      n.querySelector('.nd-lv').textContent = lv > 0 ? `${lv}/${s.maxLvl}` : `0/${s.maxLvl}`;
      const hk = hot.indexOf(s.id);
      const hkEl = n.querySelector('.nd-hk');
      hkEl.textContent = hk >= 0 ? SLOT_NAMES[hk] : '';
      hkEl.classList.toggle('on', hk >= 0);
      // the ⚡ chip: this skill's charge perks (points spent; glows when one can be bought; ringed when shown in the drawer)
      const cs = s.passive ? null : chipState(s.id, this.st), ch = n.querySelector('.nd-chg');
      ch.classList.toggle('on', !!cs); if (cs) { ch.querySelector('b').textContent = cs.spent ? String(cs.spent) : ''; ch.classList.toggle('spent', cs.spent > 0); ch.classList.toggle('can', cs.can); ch.classList.toggle('sel', this.chg.id === s.id); }
    }
    for (const n of keep.values()) n.remove();
    this.$.links.setAttribute('viewBox', `0 0 ${PADX * 2 + COLW * 2 + NODE} ${PADY * 2 + ROWH * 5 + NODE}`);
  }
  learn(id, n) {
    const s = skillDef(id); if (!s) return;
    const c = canLearnSkill(id, this.st);
    if (!c.ok) {
      replay(n, 'deny', 420); this.ui.sfx?.('deny');
      if (c.why && c.why !== 'Mastered!') this.ui.toast(c.why, { icon: 'lock', color: '#ff8fb0', duration: 2 });
      return;
    }
    const A = this.G.actions;
    const before = [...(this.st.player?.hotbar || [])];
    const r = A?.learnSkill?.(id);
    if (r === false) { replay(n, 'deny', 420); return; }
    this.render();
    const nn = this.$.nodes.querySelector(`.node[data-id="${id}"]`) || n;
    replay(nn, 'learned-pop', 800);
    const r2 = nn.getBoundingClientRect();
    const T = treeInfo(s.tree);
    this.ui.burst(r2.left + r2.width / 2, r2.top + r2.height / 2, { n: 18, spread: 80, colors: [T.color, '#fff6e8', '#ffcf4a', '#ff8fb0'] });
    this.ui.ring(r2.left + r2.width / 2, r2.top + r2.height / 2, T.color);
    this.ui.sfx?.('learn');
    if (this._hov === nn) this.ui.tip.refresh(this.tipHTML(id));
    // first point in an active skill: make sure it lands on the hotbar
    let hot = this.st.player?.hotbar || [];
    if (!s.passive && this.lvl(id) === 1 && !hot.includes(id)) {
      const empty = hot.findIndex((x, i) => i >= 1 && !x);
      if (empty >= 0) A?.setHotbar?.(empty, id);
      hot = this.st.player?.hotbar || [];
    }
    const at = hot.indexOf(id);
    if (at >= 0 && before[at] !== id) { this.ui.toast(`${s.name} added to hotbar`, { icon: 'sparkle', color: T.color, sub: `Slot [${SLOT_NAMES[at]}]` }); this.ui.hud.flashSlot(at); }
  }
  tipHTML(id) {
    const s = skillDef(id); if (!s) return '';
    const p = this.st.player || {};
    const lvl = this.lvl(id);
    const eff = lvl > 0 ? effLevel(id, this.st, this.d) : 0;
    const bonus = eff - lvl;
    const T = treeInfo(s.tree);
    const cur = eff > 0 ? skillInfoLines(id, eff, this.G) : [];
    const next = lvl < s.maxLvl ? skillInfoLines(id, (eff || 0) + 1, this.G) : [];
    const reqs = [];
    const need = s.reqLvl + lvl;
    if (need > 1 && lvl < s.maxLvl) reqs.push(`<span class="${(p.lvl || 1) >= need ? 'ok' : 'bad'}">Level ${need}</span>`);
    for (const q of s.prereq) { const d = skillDef(q); reqs.push(`<span class="${this.lvl(q) > 0 ? 'ok' : 'bad'}">${esc(d?.name || q)}</span>`); }
    const syn = (s.synergies || []).map(x => { const d = skillDef(x.id); return `<div class="tt-syn">${glyph('sparkle')}<b>${esc(d?.name || x.id)}</b> <span>${esc(x.text || '')}</span> <i>(${this.lvl(x.id)} pt${this.lvl(x.id) === 1 ? '' : 's'})</i></div>`; }).join('');
    const hot = (p.hotbar || []).indexOf(id);
    const KIND = { active: 'Active', passive: 'Passive', aura: 'Aura', channel: 'Channel' };
    const wep = s.wep === 'sword' ? ' · Bone Katana' : s.wep === 'ball' ? ' · Ball' : '';
    return `<div class="tt-skill" style="--tc:${T.color}">
      <div class="tt-name">${esc(s.name)}</div>
      <div class="tt-kind"><span>${esc(T.name)} · ${KIND[s.kind] || 'Active'}${wep}</span><span class="jp">${T.jp || ''}</span></div>
      ${s.desc ? `<div class="tt-desc">${esc(s.desc)}</div>` : ''}
      <div class="tt-lvrow"><span>Level <b>${lvl}</b>/${s.maxLvl}</span>${bonus > 0 && lvl ? `<span class="tt-bonus">+${bonus} from gear</span>` : ''}${hot >= 0 ? `<span class="kc sm">${SLOT_NAMES[hot]}</span>` : ''}</div>
      ${cur.length ? `<div class="tt-sect"><div class="tt-sh">Current</div>${cur.map(l => `<div class="tt-l">${esc(l)}</div>`).join('')}</div>` : ''}
      ${next.length ? `<div class="tt-sect next"><div class="tt-sh">${lvl ? 'Next level' : 'Level 1'}</div>${next.map(l => `<div class="tt-l">${esc(l)}</div>`).join('')}</div>` : lvl >= s.maxLvl ? '<div class="tt-max">✦ Mastered! ✦</div>' : ''}
      ${reqs.length ? `<div class="tt-reqs">Requires: ${reqs.join(', ')}</div>` : ''}
      ${skillTraining(id) ? '<div class="tt-train">In training: Poe is still practising this one. Coming soon!</div>' : ''}
      ${!s.passive && lvl ? chargeTipHTML(id, this.st, this.d) : ''}
      ${syn ? `<div class="tt-sect syn"><div class="tt-sh">Synergies</div>${syn}</div>` : ''}
      <div class="tt-hints"><span><b>Click</b> learn</span>${!s.passive && lvl ? '<span><b>Right-click</b> / <b>1–4</b> assign</span><span><b>⚡</b> charge perks</span>' : ''}</div>
    </div>`;
  }
  // skill → slot chooser
  assignPopover(id, anchor) {
    const s = skillDef(id); if (!s) return;
    if (s.passive) { this.ui.toast(`${s.name} is passive — always active!`, { icon: 'sparkle' }); return; }
    if (this.lvl(id) <= 0) { replay(anchor, 'deny', 400); this.ui.toast('Learn it first!', { icon: 'lock', color: '#ff8fb0' }); return; }
    const hot = this.st.player?.hotbar || [];
    this.ui.popover(anchor, `<div class="pop-h">Assign <b>${esc(s.name)}</b></div><div class="pop-slots">${SLOT_NAMES.map((n, i) => `<button class="pop-slot ${hot[i] === id ? 'on' : ''}" data-i="${i}">${hot[i] ? `<img src="${hotbarIconURL(hot[i], this.d)}" alt="">` : ''}<span class="kc sm">${i === 0 ? glyph('mouseL') : i === 1 ? glyph('mouseR') : n}</span></button>`).join('')}</div>`, e => {
      const b = e.target.closest('.pop-slot'); if (!b) return false;
      this.assign(+b.dataset.i, id); return true;
    });
  }
  assign(slot, id) {
    const A = this.G.actions;
    const def = skillDef(id);
    if (!def || (def.passive && id !== 'attack')) return;
    if (id !== 'attack' && this.lvl(id) <= 0) return;
    A?.setHotbar?.(slot, id);
    this.ui.hud.flashSlot(slot);
    this.ui.sfx?.('assign');
    this._treeSig = null; this.refresh();
  }
  // slot → skill chooser (from the hotbar)
  openAssign(slot, anchor) {
    const known = skillList().filter(s => this.lvl(s.id) > 0 && !s.passive);
    const hot = this.st.player?.hotbar || [];
    const items = [{ id: 'attack', name: 'Attack' }, ...known];
    this.ui.popover(anchor, `<div class="pop-h">Slot <span class="kc sm">${slot === 0 ? glyph('mouseL') : slot === 1 ? glyph('mouseR') : SLOT_NAMES[slot]}</span></div>
      <div class="pop-skills">${items.map(s => `<button class="pop-sk ${hot[slot] === s.id ? 'on' : ''}" data-id="${s.id}" title="${esc(s.name)}"><img src="${hotbarIconURL(s.id, this.d)}" alt=""><span>${esc(s.name)}</span></button>`).join('')}
      <button class="pop-sk clear" data-id="">${glyph('x')}<span>Clear</span></button></div>
      ${known.length ? '' : '<div class="pop-note">Learn skills in the skill tree (K)!</div>'}`, e => {
      const b = e.target.closest('.pop-sk'); if (!b) return false;
      const id = b.dataset.id || null;
      this.G.actions?.setHotbar?.(slot, id);
      this.ui.hud.flashSlot(slot); this._treeSig = null; this.refresh();
      return true;
    }, 'up');
  }
}
