// Building services: Chewy's cottage (the door; sleep), Rosie's shop, Blossom Hall (village ledger),
// notice board (quests), Bonesmith forge (reforge / socket / upgrade).
import { BUILDINGS } from './buildings/index.js';
import { generateItem, shopStock, itemValue, ITEM_BASES } from '../rpg/items.js';
import { Events } from '../core/events.js';
import { randInt } from '../core/util.js';

export function installServices(G) {
  const ui = () => G.ui;
  const say = (speaker, lines, choices, portrait) => ui()?.dialogue ? ui().dialogue({ speaker, lines, choices, portrait }) : Promise.resolve(null);
  const lock = async (fn) => { G.player.controlLocked = true; try { return await fn(); } finally { G.player.controlLocked = false; } };

  // ---------------------------------------------------------------- Rosie's shop
  G.shopStock = () => {
    const day = G.day?.day || 1, lvl = G.state.player.lvl;
    if (G.state.shop?.day !== day || G.state.shop?.lvl !== lvl) G.state.shop = { day, lvl, items: shopStock(lvl, day * 131 + lvl) };
    return G.state.shop.items;
  };
  G.openShop = () => {
    if (!ui()?.open) return;
    ui().open('shop', {
      name: "Rosie's Treats", keeper: 'rosie', portrait: G.portrait?.('rosie'),
      stock: G.shopStock(),
      potions: ['heart', 'zoom', 'rejuv'],
      ...(G.rosieShopExtras?.() || {}), // (the homestead: her cookbook pages, honey, and she buys dishes: life/cookSocial.js)
      onBuy: (item, price) => { const ok = G.actions.buyItem(item, price); if (ok && item.kind !== 'potion') { const s = G.state.shop.items; const i = s.indexOf(item); if (i >= 0) s.splice(i, 1); } return ok; },
    });
    Events.emit('sfx', 'ui_open');
    G.audio?.music?.('shop', { fade: 1.2 });
    const back = () => { if (G.ui?.isOpen?.('shop')) return setTimeout(back, 400); G.audio?.music?.(G.day?.isNight?.() ? 'village_night' : 'village_day', { fade: 2 }); };
    setTimeout(back, 800);
  };
  // ---------------------------------------------------------------- Chewy's cottage
  // The door goes inside now (docs/HOUSING.md §1): the bed, the treasure chest and the stove are things in the room
  // (home/housing.js), and the benched hero is often home too.
  G.openHome = () => G.housing?.enter();
  G.sleep = () => {
    const go = () => {
      const d = G.day; const h = d.hour;
      d.day++; d.hour = 6.5; d._lastHour = 6.5; // (sleeping always crosses the 6:00 day change, even from 2 am: crops grow)
      G.village.world.onNewDay?.(d.day);
      G.actions.restoreAll();
      G.state.day = d.day;
      G.save?.();
      setTimeout(() => ui()?.banner?.('Good morning!', `Day ${d.day} in Blossom Hollow`, { style: 'area' }), 600);
    };
    if (ui()?.transition) ui().transition(go); else go();
  };
  // ---------------------------------------------------------------- Blossom Hall
  G.openTownHall = () => lock(async () => {
    const S = G.sim.stats, D = G.sim.demand, inc = G.state.village.income?.[0];
    const bar = v => '▮'.repeat(Math.max(0, Math.round((v + 1) * 3))) + '▯'.repeat(6 - Math.max(0, Math.round((v + 1) * 3)));
    const rankNames = ['', 'Tiny Hamlet', 'Cozy Village', 'Blossoming Town', 'Lantern Town', 'Legendary Hollow'];
    const next = [0, 12, 28, 50, 80, 999][S.rank];
    const lines = [
      `Blossom Hollow is a *${rankNames[S.rank]}* (rank ${S.rank}). ${S.rank < 5 ? `${next - S.population} more villagers to the next rank!` : 'The most famous village on the island!'}`,
      `Villagers: ${S.population} · Homes: ${S.homes} · Shops: ${S.shops} · Workshops: ${S.workshops} · Happiness: ${Math.round(S.happiness * 100)}%`,
      `Wants — Homes ${bar(D.R)} · Shops ${bar(D.C)} · Workshops ${bar(D.W)}`,
      inc ? `Yesterday's income: ${inc.coins} coins${Object.entries(inc.mats || {}).map(([k, n]) => `, ${n} ${k}`).join('')}.` : 'Income is collected every morning.',
    ];
    const c = await say('Blossom Hall', lines, [{ text: 'Plan the village (Build mode)' }, { text: 'Thanks!' }]);
    if (c === 0) G.build?.enter();
  });
  // ---------------------------------------------------------------- notice board
  G.openBoard = () => lock(async () => {
    const act = G.state.quests.active.map(q => { const d = G.story.def(q.id); return d ? `• ${d.title} — ${d.steps[q.step]?.text || ''}` : null; }).filter(Boolean);
    await say('Notice Board', act.length ? ['Pinned notes flutter in the breeze:', ...act.slice(0, 4)] : ['Nothing pinned right now. Maybe ask the villagers if they need help!']);
    if (act.length) ui()?.open?.('quests');
  });
  // ---------------------------------------------------------------- Bonesmith forge
  G.openSmith = () => lock(async () => {
    const c = await say('Bonesmith', ['*Clang clang!* Need your gear tuned up, pup?'], [{ text: 'Reforge an item (reroll magic properties)' }, { text: 'Punch a socket into a plain item' }, { text: 'Upgrade to a sturdier tier' }, { text: 'Just looking' }]);
    if (c == null || c > 2) return;
    const inv = G.state.inventory.map((it, i) => ({ it, i })).filter(x => x.it && x.it.kind === 'gear');
    const nextTier = it => Object.entries(ITEM_BASES).find(([id, b]) => b.slot === it.slot && (b.wtype || null) === (it.wtype || null) && (b.tier || 0) > (ITEM_BASES[it.base]?.tier || 0));
    const eligible = inv.filter(({ it }) => c === 0 ? (it.rarity === 'magic' || it.rarity === 'rare') : c === 1 ? it.rarity === 'normal' && (it.sockets || 0) < 2 : !!nextTier(it));
    if (!eligible.length) return say('Bonesmith', ["Hmm, you don't have anything in your bag I can work on for that."]);
    const cost = (it) => c === 0 ? { coins: Math.round(itemValue(it) * 2 + 40), bone: 2 } : c === 1 ? { coins: 80 + it.ilvl * 6, stone: 4 } : { coins: 200 + it.ilvl * 12, bone: 5, crystal: 1 };
    const pickI = await say('Bonesmith', ['Which one?'], [...eligible.slice(0, 6).map(({ it }) => ({ text: `${it.name} — ${Object.entries(cost(it)).map(([k, v]) => `${v} ${k}`).join(', ')}` })), { text: 'Never mind' }]);
    if (pickI == null || pickI >= Math.min(6, eligible.length)) return;
    const { it, i } = eligible[pickI];
    const price = cost(it);
    if (!G.actions.hasMaterials(price)) { Events.emit('sfx', 'ui_error'); return say('Bonesmith', ['Come back with a bit more coin and bone, pup.']); }
    G.actions.spendMaterials(price);
    let out = it;
    if (c === 0) out = generateItem({ ilvl: it.ilvl, rarity: it.rarity, base: it.base });
    else if (c === 1) { out = { ...it, sockets: (it.sockets || 0) + 1 }; }
    else { const tiers = Object.entries(ITEM_BASES).filter(([id, b]) => b.slot === it.slot && (b.wtype || null) === (it.wtype || null) && (b.tier || 0) > (ITEM_BASES[it.base]?.tier || 0)); const nb = tiers[0]?.[0]; out = nb ? generateItem({ ilvl: Math.max(it.ilvl, ITEM_BASES[nb].lvl || it.ilvl), rarity: it.rarity === 'unique' || it.rarity === 'set' ? 'rare' : it.rarity, base: nb }) : it; }
    G.state.inventory[i] = out;
    Events.emit('inv:changed', { c: 'inv' });
    Events.emit('sfx', 'build_complete');
    G.vfx?.sparkle?.(G.player.pos.clone().setY(1), { n: 20, color: '#ffd84a' });
    return say('Bonesmith', [`There you go: *${out.name}*! Shiny as a fresh bone.`]);
  });
}
