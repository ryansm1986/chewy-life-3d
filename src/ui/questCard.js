// The quest card (ROADMAP UX-2; docs/QUESTS.md §1): a storybook page when a quest is taken: the giver's portrait and
// name, the quest's title, a line or two in the giver's voice (its `hook`), the goal as an action and a place (its
// `goal`), the reward as icons, and "Let's go!". It has to be pressed, so it doesn't scroll past: Enter or F, a tap, or
// the pad's A (padNav's focus starts on the button; B / Esc close it too and count as read). world/questMoments.js
// opens it on a calm moment (never in a fight, dialogue, a scene, build or decorate) with the card's data:
//   ui.open('questCard', { id, title, name, portrait, hook, goal: [action, place], rewards: [{ k, id?, n? }], lead, kind })
// and hears back through opts.onClose(how): 'go' ("Let's go!"), or 'back' (Esc, B).
import './quest.css';
import { esc, fmt } from './dom.js';
import { glyph, glyphURL, MATERIALS } from './glyphs.js';
import { flyToBag } from './fx.js';
import { Panel } from './panel.js';
import { portraitHTML } from './portraits.js';
import { padGlyph } from './padGlyphs.js';
import { materialIconURL, potionIconURL, potionInfo } from './rpg.js';
import { pantryIcon, recipeIcon } from '../life/pantryIcons.js';
import { PANTRY } from '../life/pantry.js';
import { RECIPES } from '../life/cooking.js';
import { FURNITURE } from '../home/furniture.js';
import { Actions } from '../core/actions.js';
import { normKey } from '../core/input.js';

const img = u => (u ? `<img src="${u}" alt="" draggable="false">` : '');
const nameOf = (T, id) => T?.[id]?.name || id;
/** one reward → [icon html, label, tooltip, tint] */
function chip(r) {
  switch (r.k) {
    case 'coins': return [glyph('coin'), fmt(r.n), `${fmt(r.n)} coins`, 'gold'];
    case 'xp': return [glyph('sparkle'), `${fmt(r.n)} XP`, `${fmt(r.n)} experience`, 'lav'];
    case 'skill': return [glyph('star'), `+${r.n} skill pt${r.n > 1 ? 's' : ''}`, `${r.n} skill point${r.n > 1 ? 's' : ''}`, 'pink'];
    case 'unique': return [glyph('chest'), 'Treasure', 'A unique treasure', 'amber'];
    case 'mat': return [img(materialIconURL(r.id)), `×${r.n}`, `${r.n} ${MATERIALS[r.id]?.name || r.id}`, 'cream'];
    case 'potion': return [img(potionIconURL(r.id)), `×${r.n}`, `${r.n} ${potionInfo(r.id)?.name || r.id}`, 'cream'];
    case 'pantry': return [img(pantryIcon(r.id)), `×${r.n}`, `${r.n} ${nameOf(PANTRY, r.id)}`, 'cream'];
    case 'recipe': return [img(recipeIcon(r.id)), 'Recipe', `A recipe: ${nameOf(PANTRY, r.id) || nameOf(RECIPES, r.id)}`, 'mint'];
    case 'furniture': return [glyph('decor'), nameOf(FURNITURE, r.id), `For your home: ${nameOf(FURNITURE, r.id)}`, 'mint'];
    case 'craft': return [glyph('hammer'), 'Recipe', 'A workbench recipe', 'mint'];
    case 'hearts': return [glyph('heart'), 'Friendship', 'Friendship hearts', 'pink'];
    default: return null;
  }
}
/** the hand-in's reward flying from a spot on the screen (the giver's head) into the coin counter and the bag (docs/QUESTS.md
 *  §4): a few coins, then each kind of thing; the treasure flies as itself (ui.pickup, from the giver) */
export function rewardFly(ui, from, list = []) {
  if (!ui?.ready || !from) return;
  const bag = ui.hud?.bagRect?.(), coin = ui.hud?.$?.coins?.getBoundingClientRect?.();
  const icon = r => (r.k === 'mat' ? materialIconURL(r.id) : r.k === 'potion' ? potionIconURL(r.id) : r.k === 'pantry' ? pantryIcon(r.id) : r.k === 'recipe' ? recipeIcon(r.id) : r.k === 'furniture' ? glyphURL('decor') : r.k === 'craft' ? glyphURL('hammer') : null);
  let k = 0;
  const fly = (src, to, last, onBag) => { const at = { x: from.x + (Math.random() - 0.5) * 34, y: from.y + (Math.random() - 0.5) * 20 }; setTimeout(() => flyToBag(ui.layers.fx, src, at, to, () => { if (onBag) ui.hud?.bumpBag?.(); if (last) ui.sfx?.('coin'); }), 70 * k++); };
  for (const r of list) {
    if (r.k === 'coins' && coin?.width) { const n = Math.min(6, 2 + Math.round(Math.log10(Math.max(1, r.n)))); for (let i = 0; i < n; i++) fly(glyphURL('coin'), coin, i === n - 1, false); }
    else if (bag?.width && icon(r)) fly(icon(r), bag, true, true);
  }
}
export function rewardChips(list = []) {
  return list.map(chip).filter(Boolean).map(([ic, t, tip, tint]) => `<span class="qc-chip" data-t="${tint}" title="${esc(tip)}"><i>${ic}</i><b>${esc(t)}</b></span>`).join('');
}

export class QuestCardPanel extends Panel {
  constructor(ui) { super(ui, { name: 'questCard', title: 'New quest', jp: '冒険', side: 'center', cls: 'p-qcard', icon: 'scroll' }); }
  init() {
    this.body.addEventListener('click', e => { if (e.target.closest('[data-a="go"]')) this.go(); });
    this.onKey = e => {
      if (!this.isOpen || this.ui._order[this.ui._order.length - 1] !== 'questCard' || e.repeat) return;
      if (e.key === 'Enter' || Actions.isKey('interact', normKey(e))) { e.preventDefault(); e.stopPropagation(); this.go(); }
    };
    addEventListener('keydown', this.onKey, true); // (capture: before the game reads F as "use")
  }
  /** "Let's go!" (the button, Enter or F, a tap, the pad's A on the focused button) */
  go() {
    if (!this.isOpen || this.closingAs) return;
    this.closingAs = 'go';
    this.$go?.classList.add('pressed');
    this.ui.sfx('click');
    this.ui.close('questCard');
  }
  onOpen() { this.closingAs = null; }
  onClose() {
    const how = this.closingAs || 'back', cb = this.opts.onClose;
    this.closingAs = null;
    Actions.consume('interact'); if (this.G) this.G.interactCooldown = performance.now() + 400; // (the press that closed it uses nothing in the world)
    try { cb?.(how); } catch (e) { console.error('[questCard] onClose', e); }
  }
  render() {
    const o = this.opts || {}, [act, where] = o.goal || ['', ''];
    const por = o.portrait ? `<img class="p3d" src="${o.portrait}" alt="" draggable="false">` : portraitHTML(o.giver || 'rosie');
    this.panel.dataset.kind = o.kind || 'story';
    this.body.innerHTML = `<div class="qc">
      <i class="qc-mark" aria-hidden="true"></i>
      <div class="qc-art">
        <div class="qc-frame"><div class="qc-wash"></div><div class="qc-por">${por}</div><i class="qc-petal a">${glyph('sakura')}</i><i class="qc-petal b">${glyph('sakura')}</i></div>
        <div class="qc-name"><span>${esc(o.name || '')}</span></div>
      </div>
      <div class="qc-page">
        <div class="qc-kick">${glyph('scroll')}<span>${o.kind === 'zone' ? 'A favour' : 'A new quest'}</span><b class="jp">${o.kind === 'zone' ? 'お願い' : '冒険'}</b></div>
        <h2 class="qc-title">${esc(o.title || '')}</h2>
        <p class="qc-hook"><span class="qc-q o">“</span>${esc(o.hook || '')}<span class="qc-q c">”</span></p>
        <div class="qc-goal"><span class="qc-gi">${glyph('pin')}</span><div><b>${esc(act)}</b>${where ? `<span>${esc(where)}</span>` : ''}</div></div>
        ${o.rewards?.length ? `<div class="qc-rw"><span class="qc-rh">Rewards</span><div class="qc-chips">${rewardChips(o.rewards)}</div></div>` : ''}
      </div>
      <div class="qc-foot">
        ${o.lead ? `<span class="qc-lead">${glyph('paw')}<span>Shadow knows the way!</span></span>` : '<span class="qc-lead off"></span>'}
        <button class="btn big pink qc-go" data-a="go">${glyph('paw')}<span>Let's go!</span><span class="qc-k kbm-only"><span class="kc sm">Enter</span></span><span class="qc-k pad-only"><span class="kc sm pad">${padGlyph('A')}</span></span></button>
      </div>
    </div>`;
    this.$go = this.body.querySelector('.qc-go');
  }
}
