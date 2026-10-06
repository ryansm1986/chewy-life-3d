// RPG test sheet: every item/gem/potion/material/skill icon in labelled grids + sample tooltips.
// /?test=rpg  [&sec=items|uniques|skills|misc|tips] [&z=2 (zoom)] [&bg=dark|cream] [&seed=N]
import { RNG } from '../core/util.js';
import { itemIcon, skillIcon, potionIcon, materialIcon, gemIcon } from '../rpg/icons.js';
import { ITEM_BASES, GEAR_BASE_IDS, UNIQUE_IDS, SET_ITEM_IDS, GEM_TYPES, generateItem, makeUnique, makeSetItem, makeGem, itemTooltip, starterItems } from '../rpg/items.js';
import { SKILLS, SKILL_IDS, TREES, ATTACK } from '../rpg/skills.js';
import { computeStats } from '../rpg/stats.js';
import { newGameState } from '../rpg/actions.js';
import { MATERIAL_KEYS } from '../rpg/loot.js';

export default function () {
  const P = new URLSearchParams(location.search);
  const sec = (P.get('sec') || 'items,uniques,misc,skills,tips').split(',');
  const z = +(P.get('z') || 1);
  const bg = P.get('bg') || 'dark';
  const seed = +(P.get('seed') || 7);
  const css = `
    body{margin:0;background:${bg === 'dark' ? '#2e2230' : '#fff6e8'};color:${bg === 'dark' ? '#f4efe6' : '#4a2c2a'};font:12px Fredoka,system-ui,sans-serif}
    h2{font-size:15px;margin:10px 12px 4px;letter-spacing:.5px;opacity:.85}
    .grid{display:flex;flex-wrap:wrap;gap:4px;padding:4px 10px}
    .cell{width:${76 * z}px;display:flex;flex-direction:column;align-items:center;background:${bg === 'dark' ? '#3e2e3c' : '#f3e2c8'};border-radius:10px;padding:4px 2px 3px;box-shadow:inset 0 0 0 1px rgba(0,0,0,.15)}
    .cell img{width:${64 * z}px;height:${64 * z}px}
    .cell span{font-size:9.5px;line-height:1.1;text-align:center;opacity:.85;margin-top:1px;max-width:${74 * z}px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
    .tips{display:flex;flex-wrap:wrap;gap:10px;padding:8px 12px;align-items:flex-start}
    .tip{width:250px;background:rgba(28,18,26,.94);border:2px solid #6b4a3a;border-radius:12px;padding:8px 10px;color:#f4efe6;box-shadow:0 4px 14px rgba(0,0,0,.4)}
    .tip .hd{display:flex;gap:8px;align-items:center}
    .tip img{width:44px;height:44px}
    .tip .t{font-weight:700;font-size:13px}.tip .s{font-size:10px;opacity:.75}
    .tip .l{font-size:11px;line-height:1.35}.tip .gap{margin-top:5px}.tip .i{font-style:italic}
    .tip .c{font-size:10.5px;margin-top:5px;border-top:1px solid rgba(255,255,255,.12);padding-top:4px}
  `;
  document.head.insertAdjacentHTML('beforeend', `<style>${css}</style>`);
  const root = document.createElement('div');
  document.body.appendChild(root);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const cell = (src, label) => `<div class="cell"><img src="${src}"><span title="${esc(label)}">${esc(label)}</span></div>`;
  const section = (title, cells) => `<h2>${esc(title)}</h2><div class="grid">${cells.join('')}</div>`;
  let html = '';
  const rng = new RNG(seed);
  const baseItem = (id, rarity = 'normal') => generateItem({ ilvl: 60, base: id, rarity: rarity === 'normal' ? 'normal' : rarity, rng });

  if (sec.includes('items')) {
    const bySlot = s => GEAR_BASE_IDS.filter(id => ITEM_BASES[id].slot === s);
    html += section('Bone Katanas', bySlot('weapon').filter(id => ITEM_BASES[id].wtype === 'sword').map(id => cell(itemIcon(baseItem(id)), ITEM_BASES[id].name)));
    html += section('Balls', bySlot('weapon').filter(id => ITEM_BASES[id].wtype === 'ball').map(id => cell(itemIcon(baseItem(id)), ITEM_BASES[id].name)));
    html += section('Hats · Outfits', [...bySlot('hat'), ...bySlot('outfit')].map(id => cell(itemIcon(baseItem(id)), ITEM_BASES[id].name)));
    html += section('Collars · Charms · Boots · Paws', [...bySlot('collar'), ...bySlot('charm'), ...bySlot('boots'), ...bySlot('paws')].map(id => cell(itemIcon(baseItem(id, ITEM_BASES[id].slot === 'collar' || ITEM_BASES[id].slot === 'charm' ? 'magic' : 'normal')), ITEM_BASES[id].name)));
    html += section('Rarity glow', ['normal', 'magic', 'rare', 'set', 'unique'].map(r => { const it = baseItem('boneSword'); it.rarity = r; return cell(itemIcon(it), r); }));
  }
  if (sec.includes('uniques')) {
    html += section('Uniques', UNIQUE_IDS.map(id => { const it = makeUnique(id, 60, rng); return cell(itemIcon(it), it.name); }));
    html += section('Sets', SET_ITEM_IDS.map(id => { const it = makeSetItem(id, rng); return cell(itemIcon(it), it.name); }));
  }
  if (sec.includes('misc')) {
    html += section('Treat gems', GEM_TYPES.flatMap(t => [0, 1, 2].map(tier => cell(gemIcon(t, tier), makeGem(t, tier).name))));
    html += section('Potions · Materials', [...['heart', 'zoom', 'rejuv'].map(k => cell(potionIcon(k), k)), ...MATERIAL_KEYS.map(k => cell(materialIcon(k), k))]);
  }
  if (sec.includes('skills')) {
    html += section('Skills', [cell(skillIcon('attack'), ATTACK.name), ...TREES.flatMap(t => SKILL_IDS.filter(id => SKILLS[id].tree === t.id).sort((a, b) => SKILLS[a].row - SKILLS[b].row).map(id => cell(skillIcon(id), SKILLS[id].name)))]);
  }
  if (sec.includes('tips')) {
    const st = newGameState();
    st.player.lvl = 28; st.player.stats.str = 55; st.player.stats.dex = 40;
    const s0 = starterItems();
    st.equipment.hat = generateItem({ ilvl: 20, slot: 'hat', rarity: 'magic', rng });
    st.equipment.outfit = makeSetItem('gbSweater', rng);
    st.equipment.collar = makeSetItem('gbNameTag', rng);
    const d = computeStats(st);
    const items = [
      generateItem({ ilvl: 12, rarity: 'magic', slot: 'weapon', wtype: 'sword', rng }), generateItem({ ilvl: 30, rarity: 'rare', slot: 'weapon', wtype: 'ball', rng }),
      generateItem({ ilvl: 26, rarity: 'rare', slot: 'hat', rng }), generateItem({ ilvl: 40, rarity: 'rare', slot: 'charm', rng }),
      makeUnique('lastTennisBall', 15, rng), makeUnique('coneOfShame', 20, rng), makeUnique('moonfang', 44, rng),
      makeSetItem('gbPartyHat', rng), makeGem('cheese', 1), generateItem({ ilvl: 5, rarity: 'normal', slot: 'outfit', rng }),
    ];
    items[9].sockets = 2;
    const tip = it => {
      const t = itemTooltip(it, st, d);
      const lines = t.lines.map(l => `<div class="l${l.gap ? ' gap' : ''}${l.italic ? ' i' : ''}" style="color:${l.color}">${esc(l.text)}</div>`).join('');
      const req = t.req.map(r => `<div class="l" style="color:${r.met ? '#f4efe6' : '#ff6a5a'}">${esc(r.text)}</div>`).join('');
      const cmp = t.compare.length ? `<div class="c">${t.compare.map(c => `<span style="color:${c.delta > 0 ? '#8fe0a0' : '#ff8a7a'}">${esc(c.text)}</span>`).join(' · ')}</div>` : '';
      return `<div class="tip"><div class="hd"><img src="${itemIcon(it)}"><div><div class="t" style="color:${t.titleColor}">${esc(t.title)}</div><div class="s">${esc(t.subtitle)}</div></div></div>${lines}<div class="gap"></div>${req}${cmp}</div>`;
    };
    html += `<h2>Tooltips (vs a level-28 Chewy)</h2><div class="tips">${items.map(tip).join('')}</div>`;
    void s0;
  }
  root.innerHTML = html;
  const imgs = [...root.querySelectorAll('img')];
  Promise.all(imgs.map(i => (i.complete ? 1 : new Promise(r => { i.onload = i.onerror = r; })))).then(() => {
    window.__info = { icons: imgs.length, empty: imgs.filter(i => !i.getAttribute('src')).length };
    window.__ready = true;
  });
}
