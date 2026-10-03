// Kero and fishing (docs/HOMESTEAD.md §3): "Pond Guardian's Apprentice" (offered from day 2: visit Kero → he gives
// the Bamboo Rod → catch 3 fish), the Fishing Hut shop (the rods; Kero buys fish at a premium), the Fish Log
// milestone gifts (5 / 10 / 15 kinds) and his comments on new records.
import { Events } from '../core/events.js';
import { PANTRY } from './pantry.js';
import { SPOTS, MILESTONES, fishingOf, fishLogOf } from './fishData.js';
import { toolIcon } from './pantryIcons.js';

export const RODS = {
  1: { name: 'Bamboo Rod', jp: '竹の釣り竿', price: 150, desc: 'A springy bamboo rod with a red reel. Everything a beginner needs.' },
  2: { name: 'Moonlit Rod', jp: '月夜の釣り竿', price: 650, rank: 3, desc: 'Navy lacquer and gold fittings. A bigger catch zone, a slower-draining meter and rare fish bite more often.' },
};
const MILESTONE_GIFTS = {
  5: { coins: 300, pantry: { grilledFish: 2 }, text: "Five kinds already! Here — grilled fish, still warm. And a little pocket money, ribbit." },
  10: { coins: 600, rod: 2, text: 'Ten kinds! You have the paws of a true angler. Take my Moonlit Rod — the moon koi likes it.' },
  15: { coins: 2000, pantry: { moonKoiBento: 1 }, text: "Every fish in the Hollow… The koi will sing of you. This bento is for legends only." },
};

export function installFishingSocial(G, fishing) {
  const F = () => fishingOf(G.state), story = () => G.story;
  const offer = () => {
    const S = story(); if (!S) return;
    const Q = S.Q, day = G.day?.day || G.state.day || 1;
    if (day >= 2 && !Q.done.includes('keroRod') && !Q.active.some(q => q.id === 'keroRod')) S.start('keroRod');
  };
  setTimeout(offer, 2500);
  Events.on('mode:changed', () => setTimeout(offer, 1500));

  // what a talk with Kero adds (called by Story.talk after its talk steps are marked)
  const onTalk = async (npc, say) => {
    if (npc.id !== 'kero') return;
    const f = F(), Q = story().Q, q = Q.active.find(x => x.id === 'keroRod');
    if (q && q.step >= 1 && !f.gotRod) {
      f.gotRod = true;
      if (!f.rod) {
        await say(["Ribbit! You're the one who keeps staring at my pond. Hmm.", "Fine. Take my spare Bamboo Rod. Stand at the water's edge, face the water and press *F* to cast.", 'When the float jumps, press *F* quick! Then *hold* to keep the fish in the green. Catch three and come tell me.']);
        f.rod = 1; Events.emit('fishing:rod', { rod: 1 });
        G.ui?.toast?.('Got the Bamboo Rod! Face water and press F to fish.', { iconURL: toolIcon('rod1'), color: '#8fd0ff', sub: 'A gift from Kero', duration: 5 });
        Events.emit('sfx', 'ui_quest');
      } else await say(["Oh, you already have a rod. Good taste. Catch three fish and come tell me — I'll be watching. Ribbit."]);
    }
    const m = f.pendingMilestone && !f.milestones.includes(f.pendingMilestone) ? f.pendingMilestone : MILESTONES.find(k => Object.keys(fishLogOf(G.state)).length >= k && !f.milestones.includes(k));
    if (m) {
      const R = MILESTONE_GIFTS[m]; f.milestones.push(m); f.pendingMilestone = null;
      await say([R.text]);
      if (R.coins) G.actions.addCoins(R.coins);
      for (const [id, n] of Object.entries(R.pantry || {})) { G.actions.addPantry(id, n, { src: 'gift' }); G.ui?.pantryGain?.(id, n, {}); }
      if (R.rod && f.rod < R.rod) { f.rod = R.rod; G.ui?.toast?.(`Got the ${RODS[R.rod].name}!`, { iconURL: toolIcon('rod' + R.rod), color: '#ffd84a', sub: 'A gift from Kero' }); }
      else if (R.rod) G.actions.addCoins(800);
      Events.emit('sfx', 'ui_quest'); G.vfx?.emote?.(npc, 'heart', 2);
    }
    const lr = f.lastRecord;
    if (lr && !lr.told) {
      lr.told = true;
      const name = PANTRY[lr.id]?.name.toLowerCase() || 'fish';
      await say([lr.first ? `A ${name}? That's a first for your log. ${lr.size} cm — not bad, not bad at all.` : `I heard about your ${lr.size} cm ${name}. A new record! The koi are gossiping already. Ribbit.`]);
    }
  };
  const markerFor = id => {
    if (id !== 'kero') return null;
    const f = F();
    if (f.pendingMilestone && !f.milestones.includes(f.pendingMilestone)) return 'gift';
    return null;
  };

  // the Fishing Hut: the rods, and Kero buys fish (×1.3)
  G.openFishHut = () => {
    if (!G.ui?.open) return;
    const f = F(), rank = G.sim?.stats?.rank || 1, goods = [];
    for (const t of [1, 2]) {
      const R = RODS[t]; if (f.rod >= t) continue;
      goods.push({ id: 'rod' + t, name: R.name, jp: R.jp, desc: R.desc, icon: toolIcon('rod' + t), price: R.price, once: true,
        locked: R.rank && rank < R.rank ? `Kero orders these in when the village reaches rank ${R.rank}.` : null,
        onBuy: () => { if (F().rod >= t) return false; F().rod = t; Events.emit('fishing:rod', { rod: t }); G.ui?.toast?.(`Got the ${R.name}!`, { iconURL: toolIcon('rod' + t), color: '#8fd0ff', sub: "Face water and press F to fish" }); return true; } });
    }
    G.ui.open('shop', {
      name: "Kero's Fishing Hut", jp: '釣り小屋', keeper: 'kero', portrait: G.portrait?.('kero'),
      greeting: f.rod ? 'Ribbit. Bring me fish and I pay well — better than anyone in the Hollow.' : "A rod? Ribbit. Every pond guardian needs an apprentice. Or a customer.",
      goods, potions: [], stock: [], sellKinds: ['fish'], buyer: 'kero', noBagSell: true,
      thanks: ['Ribbit! Fine fish.', 'The koi approve.', 'Pleasure, apprentice.', 'Ribbit ribbit!'],
    });
    Events.emit('sfx', 'ui_open');
  };
  return { onTalk, markerFor, onNewDay: () => setTimeout(offer, 2600) };
}
