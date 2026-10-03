// Cooking and the villagers (docs/HOMESTEAD.md §4): who teaches which recipe and when, Rosie's oven, her cookbook pages
// and honey, and her taste for dishes (she buys them at a premium).
//  - At 3 hearts a villager teaches their signature dish on the next chat (a gift marker floats over them till then).
//  - The first homestead request (crops, fish, a dish) a villager gets from you teaches their request recipe.
//  - Quest rewards (First Sprouts, Taste Test) teach through teach().
import { Events } from '../core/events.js';
import { PANTRY } from './pantry.js';
import { COOKBOOK, teachesOf, knows, cookbookOf } from './cooking.js';
import { recipeIcon } from './pantryIcons.js';

const TEACH_LINES = {
  usagi: ["Hop hop! You've been such a good friend… let me teach you my carrot soup! Two carrots, a little love~"],
  rosie: ["Can I tell you a secret? My strawberry mochi recipe! A strawberry, a mochi, and a warm oven. Come bake with me!"],
  kuma: ['You know what, little one? You deserve my honey cake recipe. Honey, strawberries and Rosie\'s oven.'],
  kero: ['Ribbit. A friend of the pond should know how to salt-grill a trout. One trout, a hot fire. That\'s all.'],
  pan: ['Zzz… oh! Melon bread… melon and honey, baked till crunchy… now you know. Zzz…'],
  mochi: ['Purrr… you and fish, fish and you. Here: my sushi platter — rice and three fish, artfully.'],
  kitsune: ['The moon has told me about you. Take this: the Moon Koi Bento. Few have ever cooked it.'],
};
const REQUEST_LINES = {
  usagi: 'Oh! Since you helped, here — my cabbage rolls recipe. Cabbage, carrot, simmer simmer~',
  kero: 'Ribbit. You may have my miso soup recipe. Daikon and a fish. Do not tell the koi.',
  kuma: 'For your trouble, my pumpkin stew! Pumpkin and daikon, low and slow.',
  mochi: 'A little thank-you: salmon onigiri! Rice and salmon. So simple, so perfect.',
  tanu: "A deal's a deal! The Fisherman's Feast: two fish, rice and daikon. Worth a fortune, that one.",
};

export function installCookSocial(G, kitchen) {
  const nameOf = id => G.story?.nameOf?.(id) || id;
  /** learn a recipe with the fanfare (toast with the page icon, sfx) → true when new */
  const teach = (id, { from = null, src = null } = {}) => {
    if (!G.actions.learnRecipe(id, { src })) return false;
    G.ui?.toast?.(`New recipe: ${PANTRY[id].name}!`, { iconURL: recipeIcon(id), color: '#ffcf4a', sub: from ? `Taught by ${nameOf(from)} · cook it from your cottage menu` : 'In your cookbook now', duration: 5 });
    Events.emit('sfx', 'recipe_learn');
    return true;
  };
  const heartsRecipe = id => { const f = G.state.friends?.[id]; if (!f || f.hearts < 3) return null; return teachesOf(id).hearts.find(r => !knows(G.state, r)) || null; };
  const onTalk = async (npc, say) => {
    const r = heartsRecipe(npc.id); if (!r) return;
    await say(TEACH_LINES[npc.id] || [`You're a good friend. Let me show you how I make ${PANTRY[r].name.toLowerCase()}!`]);
    teach(r, { from: npc.id, src: 'hearts' });
    G.vfx?.emote?.(npc, 'heart', 2); npc.anim?.play?.('happy');
  };
  const onRequestDone = giver => {
    const r = teachesOf(giver).request.find(x => !knows(G.state, x)); if (!r) return;
    if (REQUEST_LINES[giver]) G.ui?.toast?.(`${nameOf(giver)}: “${REQUEST_LINES[giver]}”`, { icon: 'chat', color: '#ffcf4a', duration: 5 });
    setTimeout(() => teach(r, { from: giver, src: 'request' }), 400);
  };
  const markerFor = id => (heartsRecipe(id) ? 'gift' : null);

  // Rosie's shop: her cookbook pages (recipes you don't know yet; some wait for a bigger village), Kuma's honey by the
  // jar, and she buys your dishes (×1.25)
  G.rosieShopExtras = () => {
    const st = G.state, rank = G.sim?.stats?.rank || 1;
    cookbookOf(st);
    const goods = COOKBOOK.filter(p => !knows(st, p.id)).map(p => ({
      id: 'recipe:' + p.id, name: `Recipe: ${PANTRY[p.id].name}`, jp: 'レシピ', desc: `A page from Rosie's cookbook. Teaches ${PANTRY[p.id].name} (${PANTRY[p.id].desc})`,
      icon: recipeIcon(p.id), price: p.price, once: true, locked: p.rank > rank ? `Rosie is still writing this page… (village rank ${p.rank})` : null,
      onBuy: () => teach(p.id, { from: 'rosie', src: 'book' }),
    }));
    return { goods, pantry: [{ id: 'honey', price: 40 }], sellKinds: ['dish'], buyer: 'rosie', onBuyPantry: (id, price, n) => G.actions.buyPantry(id, price, n) };
  };
  return { teach, onTalk, onRequestDone, markerFor };
}
