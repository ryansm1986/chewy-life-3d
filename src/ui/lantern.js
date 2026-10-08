// The Spirit Lantern panel (docs/ZONES.md §5.2 as built; ROADMAP Z-E3): pick a tier (or a Spirit tier), fill the
// modifier slots from the cards, read the summed reward, and set off. Opened by F at a dungeon's lantern
// (regions/spiritLantern.js → G.lantern.open(id) → ui.open('lantern', { dungeon })). Data from G.lantern.info(id); the
// numbers and texts from the pure rpg modules (tiers.js, zoneMods.js), so the panel never imports world code.
//   - the tiers are a .tabs row (LB / RB on a pad, 1–5 on the keyboard); a Spirit tier has a − / + stepper;
//   - the slots show what's picked (click to take one out); the cards add or remove (one Elemental; full slots grey out
//     the rest); "Recommended" fills the slots with a gentle set, "Surprise me" with a random one (X / Y on a pad);
//   - the summary is the run's level, packs, champions and the reward bonus, summed (rewardTotals);
//   - Enter (or the big button) sets off; the setup is remembered per dungeon (rpg/zones.js rememberSetup).
// Phones: two columns like the desktop: the run on the left (fits a landscape phone unscrolled), the cards scrolling on
// the right, two to a row; 44 px targets (lantern.css).
import './lantern.css';
import { esc } from './dom.js';
import { glyph } from './glyphs.js';
import { padGlyph } from './padGlyphs.js';
import { Panel } from './panel.js';
import { modIcon, lanternIcon } from './lanternIcons.js';
import { ZONE_MODS, MOD_IDS, cleanMods, rewardTotals, recommendMods, surpriseMods, REWARD_NAMES } from '../rpg/zoneMods.js';
import { runInfo, runLabel, TIER_MAX } from '../rpg/tiers.js';

const pct = v => `${Math.round(v * 100)}%`;
const REWARD_SHORT = { qty: 'quantity', rarity: 'rarity', xp: 'XP', boss: 'boss loot' }, REWARD_PHONE = { qty: 'qty', rarity: 'rarity', xp: 'XP', boss: 'boss' };

export class LanternPanel extends Panel {
  constructor(ui) { super(ui, { name: 'lantern', title: 'Spirit Lantern', jp: '霊灯', side: 'center', cls: 'p-lantern', icon: 'lantern' }); this.sel = null; this.id = null; }
  init() {
    this.body.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b || b.disabled) return;
      if (b.dataset.t != null) this.setTier(b.dataset.t === 'S' ? { spirit: Math.max(1, this.sel.spirit || this.info.spiritMax) } : { tier: +b.dataset.t });
      else if (b.dataset.sp) this.stepSpirit(+b.dataset.sp);
      else if (b.dataset.m) this.toggle(b.dataset.m);
      else if (b.dataset.slot != null) { const id = this.sel.mods[+b.dataset.slot]; if (id) this.toggle(id); }
      else if (b.dataset.a === 'rec') this.recommend();
      else if (b.dataset.a === 'surprise') this.surprise();
      else if (b.dataset.a === 'clear') { this.sel.mods = []; this.ui.sfx?.('tick'); this.render(); }
      else if (b.dataset.a === 'go') this.go();
    });
    this.onKey = e => {
      if (!this.isOpen || this.ui.dlg?.active || this.ui._order[this.ui._order.length - 1] !== 'lantern') return;
      if (/^[1-5]$/.test(e.key)) { const t = +e.key; if (t <= this.info?.tierOpen) { this.setTier({ tier: t }); e.preventDefault(); } }
      if (e.key === 'Enter') { this.go(); e.preventDefault(); }
    };
    addEventListener('keydown', this.onKey);
  }
  get run() { return { tier: this.sel.spirit > 0 ? TIER_MAX : this.sel.tier, spirit: this.sel.spirit || 0, mods: this.sel.mods }; }
  onOpen() {
    this.id = this.opts.dungeon; this.info = this.G?.lantern?.info?.(this.id);
    if (!this.info) return;
    const L = this.info.last, open = this.info.tierOpen;
    // the last setup (if it is still open), else the highest open tier with nothing picked
    if (L && (L.spirit > 0 ? L.spirit <= this.info.spiritMax : L.tier >= 1 && L.tier <= open)) this.sel = { tier: L.spirit > 0 ? TIER_MAX : L.tier, spirit: L.spirit || 0, mods: L.mods.slice() };
    else this.sel = { tier: Math.max(1, open), spirit: 0, mods: [] };
    this.sel.mods = cleanMods(this.sel.mods, this.run);
    this.setTitle('Spirit Lantern', '霊灯');
    this.render();
  }
  setTier(t) {
    if (t.spirit) { this.sel.spirit = Math.max(1, Math.min(this.info.spiritMax, t.spirit)); this.sel.tier = TIER_MAX; }
    else { if (t.tier > this.info.tierOpen) { this.ui.sfx?.('deny'); return; } this.sel.tier = t.tier; this.sel.spirit = 0; }
    this.sel.mods = cleanMods(this.sel.mods, this.run);
    this.ui.sfx?.('tab'); this.render();
  }
  stepSpirit(d) { const s = Math.max(1, Math.min(this.info.spiritMax, (this.sel.spirit || 1) + d)); if (s === this.sel.spirit) { this.ui.sfx?.('deny'); return; } this.sel.spirit = s; this.sel.mods = cleanMods(this.sel.mods, this.run); this.ui.sfx?.('tick'); this.render(); }
  slots() { return runInfo(this.run).slots; }
  toggle(id) {
    const m = this.sel.mods, i = m.indexOf(id);
    if (i >= 0) { m.splice(i, 1); this.ui.sfx?.('tick'); }
    else {
      const g = ZONE_MODS[id].group, j = g ? m.findIndex(x => ZONE_MODS[x].group === g) : -1;
      if (j >= 0) m.splice(j, 1, id); // (another Elemental: swap it)
      else if (m.length >= this.slots()) { this.ui.sfx?.('deny'); this.flash('.ln-slots'); return; }
      else m.push(id);
      this.ui.sfx?.('pick');
    }
    this.render();
  }
  recommend() { this.sel.mods = recommendMods(this.run); this.ui.sfx?.('tab'); this.render(); }
  surprise() { this.sel.mods = surpriseMods(this.run, Math.random); this.ui.sfx?.('tab'); this.render(); this.flash('.ln-slots'); }
  flash(sel) { const e = this.body.querySelector(sel); if (!e) return; e.classList.remove('ln-flash'); void e.offsetWidth; e.classList.add('ln-flash'); }
  go() {
    if (!this.info) return;
    this.G?.audio?.play?.('portal');
    this.G.lantern.enter(this.id, this.run);
  }
  render() {
    const I = this.info, B = this.body; if (!I || !this.sel) { B.innerHTML = ''; return; }
    const run = this.run, R = runInfo(run), rw = rewardTotals(run), nS = R.slots, mods = this.sel.mods;
    const lvl = I.level(run), lvl2 = Math.min(60, lvl + (I.floors > 1 && !run.spirit ? 1 : 0));
    const best = I.cleared.filter(t => t > 0), bestT = best.length ? Math.max(...best) : 0;
    const groupTaken = g => g && mods.some(x => ZONE_MODS[x].group === g);
    const tiers = [1, 2, 3, 4, 5].map(t => {
      const open = t <= I.tierOpen, on = !run.spirit && run.tier === t, done = I.cleared.includes(t);
      return `<button class="tab ln-tier${on ? ' on' : ''}${open ? '' : ' locked'}" data-t="${t}" ${open ? '' : 'disabled'} title="${open ? `Tier ${t}` : 'Clear the tier below to open it'}">${open ? '' : glyph('lock')}<b>T${t}</b>${done ? '<i class="ln-done">✓</i>' : ''}</button>`;
    }).join('') + (I.spiritOpen ? `<button class="tab ln-tier spirit${run.spirit ? ' on' : ''}" data-t="S"><b>霊</b><span>Spirit</span></button>` : '');
    const spiritRow = run.spirit ? `<div class="ln-spirit"><button class="btn sm" data-sp="-1" ${run.spirit <= 1 ? 'disabled' : ''}>−</button><div><b>Spirit ${run.spirit}</b><span>open to ${I.spiritMax}${R.pinnacle ? ' · <em>the Four Seasons await</em>' : ''}</span></div><button class="btn sm" data-sp="1" ${run.spirit >= I.spiritMax ? 'disabled' : ''}>+</button></div>` : '';
    const slots = Array.from({ length: nS }, (_, i) => {
      const id = mods[i], m = id && ZONE_MODS[id];
      return m ? `<button class="ln-slot has" data-slot="${i}" style="--mc:${m.color}" title="Take out ${esc(m.name)}">${modIcon(m.icon)}<i class="ln-x">${glyph('x')}</i></button>` : `<button class="ln-slot" data-slot="${i}" disabled title="An empty slot: pick a modifier">${glyph('plus')}</button>`;
    }).join('');
    const rows = [
      ['Monster level', 'Lv', run.spirit ? '60' : `${lvl}–${lvl2}`],
      ['Pack size', 'Packs', `×${R.pack.toFixed(2)}`],
      ['Champion packs', 'Champions', R.champ > 0 ? `+${pct(R.champ)}<i class="ln-dk"> chance</i>` : '—'],
      ...(run.spirit ? [['Monsters', '', `life ×${R.life.toFixed(1)}, <i class="ln-dk">damage</i><i class="ln-ph">dmg</i> ×${R.dmg.toFixed(2)}`]] : []),
    ].map(([k, s, v]) => `<div data-s="${s}"><span>${k}</span><b>${v}</b></div>`).join(''); // (data-s: the phone's one-line label)
    const rewards = ['qty', 'rarity', 'xp', 'boss'].map(k => `<div class="ln-rw${rw[k] > 0 ? '' : ' zero'}" data-k="${k}" data-s="${REWARD_PHONE[k]}"><b>+${pct(rw[k])}</b><span>${REWARD_SHORT[k]}</span></div>`).join('');
    const cards = MOD_IDS.map(id => {
      const m = ZONE_MODS[id], on = mods.includes(id), full = !on && mods.length >= nS && !groupTaken(m.group), swap = !on && groupTaken(m.group);
      const rtext = Object.entries(m.reward).map(([k, v]) => `+${pct(v)} ${REWARD_NAMES[k]}`).join(', ') || 'Its chests are the reward';
      return `<button class="ln-card${on ? ' on' : ''}${full ? ' full' : ''}${swap ? ' swap' : ''}" data-m="${id}" style="--mc:${m.color}" ${full ? 'aria-disabled="true"' : ''}>
        <span class="ln-icw"><span class="ln-ic">${modIcon(m.icon)}</span><i class="ln-risk" title="How much harder">${'●'.repeat(m.risk)}${'○'.repeat(3 - m.risk)}</i></span><span class="ln-txt"><b>${esc(m.name)}</b><span class="ln-eff">${esc(m.desc)}</span><span class="ln-rew">${esc(rtext)}</span></span>
        ${on ? `<i class="ln-check">${glyph('check')}</i>` : ''}</button>`;
    }).join('');
    const label = runLabel(run), sub = (mods.length ? `${mods.length} of ${nS} modifier${nS > 1 ? 's' : ''}` : 'no modifiers') + (R.pinnacle ? ' · the Four Seasons' : '');
    B.innerHTML = `<div class="ln">
      <div class="ln-side">
        <div class="ln-hd"><span class="ln-lic">${lanternIcon()}</span><div><b>${esc(I.name)}</b><span class="ln-best">${I.clears ? `${bestT ? `Best: Tier ${bestT}` : 'Story cleared'}${I.spiritHere ? ` · Spirit ${I.spiritHere}` : ''}` : ''}</span></div></div>
        <div class="tabs ln-tiers">${tiers}</div>
        ${spiritRow}
        <div class="ln-rows">${rows}</div>
        <div class="ln-sh">Modifiers <em>${nS} slot${nS > 1 ? 's' : ''}</em></div>
        <div class="ln-slots">${slots}</div>
        <div class="ln-picks"><button class="btn sm" data-a="rec">${glyph('star')}Recommended</button><button class="btn sm" data-a="surprise">${glyph('sparkle')}Surprise me</button><button class="btn sm" data-a="clear" ${mods.length ? '' : 'disabled'}>${glyph('x')}Clear</button></div>
        <div class="ln-sh">Rewards <em>summed</em></div>
        <div class="ln-rews">${rewards}</div>
      </div>
      <div class="ln-cards">${cards}</div>
      <div class="ln-gobar">
        <button class="btn ln-go" data-a="go">${lanternIcon()}<span><b>Enter ${esc(label)}</b><small>${sub} · free</small></span></button>
        <div class="ln-foot kbm-only"><span class="kc sm">1</span>–<span class="kc sm">5</span> tier <span class="sep">·</span> <span class="kc sm">Enter</span> set off</div>
        <div class="ln-foot pad-only"><span class="kc sm pad">${padGlyph('LB')}</span><span class="kc sm pad">${padGlyph('RB')}</span> tier <span class="sep">·</span> <span class="kc sm pad">${padGlyph('Y')}</span> recommended <span class="sep">·</span> <span class="kc sm pad">${padGlyph('X')}</span> surprise</div>
      </div>
    </div>`;
  }
}
