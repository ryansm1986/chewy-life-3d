// Zone villagers' conversations and the reopened buildings' services (docs/ZONES.md §2–§3; ROADMAP Z-D3 to Z-D5).
//   villageTalk(village, villager): the dialogue flow — a caged plea, a freed captive's thanks, then (saved) the turn-in
//     of a quest's closing talk step, a quest offer, a reminder, chat, the zone story (the elder) and the villager's
//     service: shop / rest / training / crafting.
//   buildingAction(village, building): F at a door — the same services without the chat (or a barricade line).
// The services reuse existing systems: ui/shop.js (stock, pantry goods, furniture), actions.restoreAll / respec /
// addFurniture / addPantry, items.generateItem, the Travel Map (G.openTravel).
import { Input } from '../../core/input.js';
import { Events } from '../../core/events.js';
import { heroText } from '../../rpg/classes.js';
import { generateItem, shopStock, buyPrice, SLOT_NAMES } from '../../rpg/items.js';
import { PANTRY, sellPrice as pantrySellPrice } from '../../life/pantry.js';
import { BUFFS } from '../../life/meals.js';
import { SOAK, startSoak, soakText } from '../../rpg/zoneBuffs.js';
import { FURNITURE } from '../../home/furniture.js';
import { pick, clamp, mulberry32 } from '../../core/util.js';
import { ZONE_NPCS } from './data.js';
import { ZONE_QUESTS, offersFor } from '../../world/zoneQuests.js';

// ------------------------------------------------------------------ what they say (written to Chewy: heroText swaps the hero)
const TALK = {
  tk_sasa: {
    saved0: ['The grove is singing again… Do you hear it, Chewy? That is the sound of Takemori breathing.', 'Thank you, little one. My old bones have never been so glad to be wrong about yokai.'],
    chat: ['Takemori means "bamboo keepers". We tend the grove, and the grove tends us.', 'When the wind is right, the culms hum a song older than the village. The yokai never could stand it.', 'Pan from Blossom Hollow? Oh, I know that panda. Lovely boy. Sleeps through earthquakes.', 'Mind the Depths, dear. Caves under bamboo go down a long, long way.'],
    story: ['Long ago, the first keepers planted one culm by the stream and promised to look after whatever grew. Whatever grew turned out to be… all of this.', 'The grove keeps the old caves shut with its roots — the Bamboo Depths. Something down there woke this spring. A proud old tengu, they say, who thinks the grove should be his.', 'His yokai marched up through the roots and boarded us in. With the captain gone, the roots are loosening their grip on the gate. The way down is open now.'],
  },
  tk_fuku: {
    caged: ['You there! Get me out of this ridiculous basket! I have FUTONS to air!'], scared: ['You let me out — bless you! But that great weasel still owns the square. Nobody gets a room until it\'s gone!'],
    saved0: ['Saved! The whole village! Come, come — the Sasanoha Inn is open, and the first night is on the house. Every night is on the house, for you.'],
    chat: ['A good inn is like a good futon: soft, warm, and smelling faintly of cedar.', 'If you ever take a tumble out there, the grove-folk will carry you here. Better than being dragged home by the scarf, hm?', 'Kome makes the best bamboo-shoot rice in three valleys. Don\'t tell her I said so.'],
  },
  tk_chiku: {
    caged: ['Psst! Over here! They locked me up with my own crates! The rudeness!'], scared: ['Thank you, thank you! I\'d open the shop, but that captain is right on my doorstep…'],
    saved0: ['The shutters are coming off! Chiku\'s General Store is OPEN! Everything you need, and several things you don\'t!'],
    chat: ['Bamboo shoots are best in the morning. And in the afternoon. And at night.', 'I count my stock every evening. Then I count it again, because I lost count.', 'Blossom Hollow coins spend just fine here. Coins are coins!'],
  },
  tk_takumi: {
    caged: ['Hrmph. A cage of bamboo… badly lashed. I could have built them a better one. Let me out and I\'ll show you.'], scared: ['Free again. My hands itch to fix things… but not with that brute in the square.'],
    saved0: ['Right. First the boards come down, then I fix the boards, then I fix everything the boards were nailed to.'],
    chat: ['Split it along the grain and bamboo will do anything you ask. Fight the grain and it fights back.', 'Bring me bamboo shoots and wood, and I\'ll weave you something worth keeping.', 'A lantern frame takes an afternoon. A good lantern frame takes a lifetime of afternoons.'],
  },
  tk_kazemaru: {
    saved0: ['…You fought well. Loudly, but well. Poe always did keep noisy friends.', 'The dojo is open to you. Come and train when you want to learn to be quiet.'],
    chat: ['A ninja\'s first lesson: the floor is your friend. The second lesson: the floor is also very comfortable for naps.', 'Poe trained here as a pup. She sneezed during every hiding drill. Every single one.', 'To forget a lesson is no shame. To refuse to relearn it — that is the shame. I can help you relearn.'],
  },
  tk_kome: {
    saved0: ['Home! The inn! My kitchen! …Who has been using my good pot?!'],
    chat: ['The secret of bamboo-shoot rice? Patience. And a little bit of dashi. And more patience.', 'Those yokai made me cook for them for DAYS. They had no taste at all.', 'Okami Fuku pretends she didn\'t worry. She worried.'],
  },
  // ---------------------------------------------------------------- Akane Hamlet (maple)
  ak_kaede: {
    saved0: ['The leaves are red again, and not with fire. Thank you, Chewy. Akane can breathe.', 'Sixty autumns I have watched these hills. This one I will remember best.'],
    chat: ['Akane means "madder red". Our grandmothers dyed cloth with the roots — the hills simply copied them.', 'Every autumn the whole hamlet stops work for a day to watch the leaves fall. Very important work, leaf-watching.', 'Inaho talks to the scarecrows. I pretend not to notice. The scarecrows pretend too.'],
    story: ['Long ago a great maple stood where the square is now. When it fell, its roots went on growing — down and down, into halls of red stone.', 'We call them the Maple Roots. The old tanuki of the hills kept them quiet for us… until this year.', 'Danzaburō, the tanuki lord, sits at the bottom now and sends his straw soldiers up. The roots are not his to keep.'],
  },
  ak_ochiyo: {
    caged: ['Oh dear. A cage. And I left the kettle on.'], scared: ['Thank you, little one. I would make you tea, but that scarecrow is standing on my garden.'],
    saved0: ['The kettle is singing again. Sit, sit — the Momiji Tea House is open, and the first cup is yours.'],
    chat: ['Good tea is like autumn: you cannot hurry it, and it is gone too soon.', 'Matcha for courage, hōjicha for comfort, genmaicha for a long walk home.', 'Tobi is my apprentice. He has broken eleven cups this month. It is only the fourth.'],
  },
  ak_benji: {
    caged: ['Hey! Hey, you! Get me out and I\'ll give you a discount! A small one! Medium!'], scared: ['Free! But the shop\'s right next to that scarecrow brute. Business can wait. A little.'],
    saved0: ['Benji\'s Sundries is BACK! Chestnuts, charms, and genuine — genuine! — yokai repellent!'],
    greet: 'Welcome to Benji\'s! Roasted chestnuts, lucky charms, and everything a hero needs. Prices are fair. Mostly.',
    chat: ['The yokai repellent? Works every time. You saved the hamlet, didn\'t you? Proof.', 'I trade with the town down the river. They love our chestnuts. I love their coins.', 'A good merchant smiles at everyone. A great merchant smiles at everyone and remembers who owes him.'],
  },
  ak_yae: {
    caged: ['Let me out this instant! Who will turn down the futons? WHO?'], scared: ['Thank you, dear. But nobody sleeps a wink with that thing in the square.'],
    saved0: ['Saved! Come in, come in — the Kurikaze Inn smells of roasted chestnuts again, and so will you.'],
    wake: ['There you are. Shadow dragged you in by the scarf and the whole hamlet carried the rest. You\'ve been asleep by the hearth.', 'Rest up, dear. The red hills will wait for you.'],
    chat: ['A good inn needs three things: warm tatami, roasted chestnuts and a cat on the porch. We have two, the cat is negotiating.', 'If the hills ever knock you flat, the hamlet will bring you here. We always do.', 'Kurikaze means "chestnut wind". On autumn nights you can smell it from the river.'],
  },
  ak_inaho: {
    saved0: ['The scarecrows are back to being scarecrows! The good kind! Grandpa says I can go back to the terraces.'],
    chat: ['The rice terraces are like stairs for giants. Very short, very wet giants.', 'This scarecrow is Taro. That one is Hanako. The one that tried to eat me was not invited.', 'When the rice is cut we hang it on the hasa racks to dry. It smells like summer saying goodbye.'],
  },
  ak_tobi: {
    saved0: ['Home! Ochiyo-sensei! I kept practising the whisk the whole time — on mud, mostly.'],
    chat: ['I only broke one cup today! …So far.', 'The yokai down in the roots drink their tea cold. Barbarians.', 'Ochiyo-sensei says a good bow is half the ceremony. I have the bowing down. It\'s the other half.'],
  },
  // ---------------------------------------------------------------- Shiokaze Port (tidepool)
  sk_kaizo: {
    saved0: ['Ha! Look at that — the gulls are back on the roofs. A port without gulls is just a puddle with houses. Thank you, matey.', 'You fought like a typhoon. A small, fluffy typhoon.'],
    chat: ['Shiokaze means "salt wind". It blows the fish in and the hats off.', 'I sailed to the moon once. Well — I sailed until the moon was very close. Same thing.', 'My lookout sees every boat in the bay. And every crab. Especially the crabs.'],
    story: ['Before there was a port, there was only the bay and the sea caves under the cliffs. The tide breathes in and out of them like a sleeping giant.', 'The old fisherfolk said a giant really did sleep there — Umibōzu, the sea monk, big as a storm cloud.', 'He woke this year. The crabs and kappa came up out of the Tide Caves with him. Somebody has to tuck him back in.'],
  },
  sk_saba: {
    caged: ['A cage?! I\'m a fishmonger, not a fish! …Please get me out.'], scared: ['Thanks, friend. But that crab captain is right on top of my ice. My poor mackerel.'],
    saved0: ['The market\'s open! Fresh from the bay, still blinking! Saba\'s Fish Market is back!'],
    chat: ['You can tell a fresh fish by its eyes. Clear eyes, happy fish. Well. Happy until recently.', 'Bring me your catch and I\'ll pay better than anyone on the island. Fish deserve respect.', 'Sea bream for festivals, mackerel for Tuesdays, octopus for when you want a fight.'],
  },
  sk_funaki: {
    caged: ['Mmh. Lashed with wet rope. It\'ll shrink as it dries. Bad knot-work. Let me out?'], scared: ['Free. But I can\'t knock a hull with that crab clattering about.'],
    saved0: ['Right. The slipway first, then the old wreck. She\'ll sail again — I can hear it in her ribs.'],
    craft: 'Driftwood, rope and patience — bring me the wood and I\'ll build you something that floats. Or at least sits nicely on a shelf.',
    chat: ['Knock a hull and listen. A good one hums. A bad one says "oof".', 'That wreck on the beach? Forty years old. I\'m rebuilding her plank by plank. She was my father\'s.', 'Kaito swears he saw Umibōzu wink at him. Umibōzu does not wink. I think.'],
  },
  sk_nami: {
    caged: ['Help! They tipped my sea glass all over the floor! And then they put me in a box!'], scared: ['Thank you! I\'ll open the store the second that big crab leaves the square.'],
    saved0: ['The Port Store is open! Rope, bait, sunscreen for your nose — oh, and potions, of course!'],
    greet: 'Welcome to the Port Store! Everything a sailor needs and a few things a sailor definitely doesn\'t.',
    chat: ['I collect sea glass. Blue, white, amber, a purple one once. Never more green. I have enough green.', 'The tide pools are full of treasure if you can out-stare the crabs.', 'Okami Shinju\'s inn sways on its stilts. I sleep like a baby there. A seasick baby.'],
  },
  sk_shinju: {
    saved0: ['Saved! Oh, the gulls, the bells, the boats! Come in, come in — the Shinju Inn has a room with a view of the bay.'],
    wake: ['There, there. Funaki carried you up the ladder himself and the gulls kept watch. You\'ve been asleep in the sea-view room.', 'Rest. The tide will turn without you for one afternoon.'],
    chat: ['My inn stands on stilts so the high tide can come visiting. It usually brings crabs.', 'Shinju means "pearl". My grandmother found one in her soup and opened an inn with it.', 'If the sea ever knocks you down, the port will bring you here. Fisherfolk look after their own.'],
  },
  sk_kaito: {
    saved0: ['Free! Funaki! I held the rope the WHOLE time! …There was no rope. But I held it.'],
    chat: ['Umibōzu winked at me. Twice. Nobody believes me.', 'I\'m going to sail Funaki\'s wreck to the end of the world. After lunch.', 'Down in the Tide Caves the water glows blue. It\'s pretty. And full of teeth.'],
  },
  // ---------------------------------------------------------------- Yukimi Spa Village (onsen)
  yk_shirayuki: {
    saved0: ['The steam is rising straight again. That means the village is at peace. Thank you, little one.', 'Sixty-one thousand, two hundred and twelve snowfalls… and this is the first one I\'ve watched with a hero.'],
    chat: ['Yukimi means "snow viewing". We sit in the hot water and watch the snow fall. It is the best thing in the world.', 'The snow monkeys use the big spring in the mornings. We use it in the afternoons. Nobody argues with a monkey.', 'Never count snowflakes after dinner. You lose your place and have to start again.'],
    story: ['The springs here are warm because the mountain is warm inside. Deep under the snow there are caverns of blue ice with a hot heart.', 'The Onsen Caverns. The snow spirits slept in them for as long as anyone remembers, and left the springs to us.', 'This winter the Yuki-onna woke, and her cold crept up through the caverns into our village. The springs will only stay warm if she rests again.'],
  },
  yk_yuzu: {
    caged: ['A bucket! They put me in a BUCKET cage! I\'m a bath-keeper, not a bath toy!'], scared: ['Thank you, thank you! I\'d heat the baths, but that snowman would just melt in and ruin them.'],
    saved0: ['The baths are open! Hot, hotter and "a little too hot" — come and soak, hero, you\'ve earned it.'],
    chat: ['The right bath temperature is "a little too hot". Any cooler and it\'s soup.', 'Soak until your ears go pink. Then soak a little more.', 'The monkeys sneak into the big spring when I\'m not looking. I always look. They always sneak.'],
  },
  yk_tetsu: {
    caged: ['…This cage is iron. Badly forged. Let me out and I\'ll show them iron.'], scared: ['Free. But I won\'t light the forge with that snowman in the square. It\'d take it personally.'],
    saved0: ['The forge is lit. Snow ore wants to be steel — it just needs a hundred folds and someone to talk to it.'],
    chat: ['Snow ore comes from the ice caverns. Blue-white, cold as a grudge, rings like a bell when you strike it.', 'A hundred folds for the blade. One more for luck. The extra one is a secret.', 'Hokuto hiccups when he hammers. Somehow it keeps perfect time.'],
  },
  yk_mikan: {
    caged: ['Brr! Let me out, my mittens are in the shop and my paws are freezing!'], scared: ['Thank you! I\'ll open as soon as that snowman stops glaring at my buns.'],
    saved0: ['Mikan\'s Warm Goods is open! Hand warmers! Hot buns! The fluffiest mittens in the mountains!'],
    greet: 'Welcome to Mikan\'s! Warm paws, warm tummy, warm heart — that\'s the motto. I made it up this morning.',
    chat: ['A hot bun in each mitten and you can walk all day in the snow. Science.', 'I named the shop after myself. Mikan means "tangerine". It\'s a warm colour!', 'Granny Shirayuki has counted every snowflake. I\'ve counted every bun. We\'re very similar.'],
  },
  yk_tsubaki: {
    saved0: ['How lovely. The village is saved, the snow is falling softly, and nobody is in a hurry. Welcome to Ryokan Tsubaki.'],
    wake: ['Shh. You were found in the snow and carried to the ryokan\'s best room. There is tea, and a heated blanket, and no hurry at all.', 'Rest. The mountain will still be there.'],
    chat: ['A ryokan is a place where time takes its sandals off.', 'Tsubaki means "camellia". They bloom red in the snow, right when you think nothing can.', 'If the cold ever knocks you down, the village will bring you here. We are very good at warming people up.'],
  },
  yk_hokuto: {
    saved0: ['Home! The forge! The — hic! — warm! I missed the warm!'],
    chat: ['I hammer in time with my hiccups. Tetsu-sensei says it\'s a gift. Hic.', 'Down in the caverns everything is blue and cold and humming. I didn\'t like it. Hic.', 'One day I\'ll fold a hundred and one times. Then I\'ll know the secret!'],
  },
  folk_maple: ['The captain\'s gone! I can rake my leaves in peace again!', 'Have you tried Ochiyo\'s matcha? It makes your whiskers stand up — in a good way.', 'The scarecrows on the terraces are ours again. Inaho named all of them.', 'Benji sold me yokai repellent. Then the yokai came. Then YOU came. So it works?'],
  folk_tidepool: ['The gulls are back! I never thought I\'d miss the gulls.', 'Saba pays the best price for fish on the whole island. Ask anyone. Ask the fish.', 'Funaki\'s going to make that old wreck sail again. We\'ve been saying that for forty years.', 'Captain Kaizo saw you coming from his lookout. He says you walk like a sailor. A small one.'],
  folk_onsen: ['The baths are hot again! My tail has never been so happy.', 'Don\'t tell the snow monkeys, but the big spring is warmest just after lunch.', 'Tetsu\'s forge rings all night. It sounds like little bells in the snow.', 'Granny Shirayuki says this winter has had 4,012 snowflakes so far. Today.'],
  folk: ['The captain\'s gone! I can finally sweep my step again!', 'Have you met Grandma Sasa? She knows every culm by name.', 'The bamboo hums when you walk past. I think it likes you!', 'Thank you for saving us — I was hiding in a rice barrel for three days!', 'Chiku\'s shop has the crunchiest bamboo shoots.'],
};
const lines = (id, key) => TALK[id]?.[key] || null;
/** what the inn's keeper says when a knocked-out hero wakes on their futon (village.js wakeAtInn) */
export function wakeLines(V, keeper) {
  const who = V.G.player?.name || 'Chewy';
  return lines(keeper, 'wake') || [`Easy now, ${who}. Shadow and the villagers carried you in — you've been asleep on my best futon.`, 'Rest up. The yokai will still be there tomorrow, sadly.'];
}
const nameOf = id => ZONE_NPCS[id]?.name || id;

/** open a dialogue as a zone villager (the shared dialogue box, their portrait and voice) */
function sayer(V, v) {
  const G = V.G;
  return (ls, choices) => (G.ui?.dialogue
    ? G.ui.dialogue({ speaker: v.name, portrait: G.portrait?.(v.id), lines: ls.map(l => heroText(l, G.state)), choices: choices?.map(c => ({ ...c, text: heroText(c.text, G.state) })), voice: v.spec?.voice })
    : Promise.resolve(choices ? 0 : null));
}
/** a conversation with a zone villager (locks the hero while it runs, like Blossom Hollow's G.talkTo) */
export async function villageTalk(V, v) {
  const G = V.G, P = G.player;
  if (v.talking || !P) return;
  v.talking = true; P.controlLocked = true;
  try { await flow(V, v, sayer(V, v)); } catch (e) { console.error('[village] talk failed', e); }
  finally { v.talking = false; P.controlLocked = false; G.interactCooldown = performance.now() + 350; Input.consume('f'); }
}
async function flow(V, v, say) {
  const G = V.G, st = G.state, id = v.id;
  if (v.folk) { await say([pick(TALK['folk_' + V.zone] || TALK.folk)]); return; }
  if (v.state === 'caged') {
    const cg = V.cages.find(c => c.v === v);
    if (cg && !V.campAlive(cg.camp)) { const c = await say([pick(lines(id, 'caged') || ['Please, let me out!'])], [{ text: 'Open the cage' }, { text: 'Hang on!' }]); if (c === 0) V.freeCage(cg); }
    else await say([pick(lines(id, 'caged') || ['Help!']), 'Watch out — the yokai of the camp are still around!']);
    return;
  }
  if (!V.saved) { await say([pick(lines(id, 'scared') || ['Thank you… but please, the captain!'])]); return; }
  // friendship: a daily chat is worth a little
  const f = G.story?.friend?.(id), day = G.day?.day || 1;
  if (f && f.talkedDay !== day) { f.talkedDay = day; G.story.addHearts(id, 2); }
  // a quest's closing talk step: the thank-you line, then the reward (Story.complete via markTalk)
  const turnIn = (st.quests.active || []).filter(q => { const d = ZONE_QUESTS[q.id], s = d?.steps[q.step]; return s?.type === 'talk' && s.npc === id; });
  if (turnIn.length) {
    for (const q of turnIn) await say([ZONE_QUESTS[q.id].thanks || 'Thank you!']);
    G.story?.markTalk?.(id);
    v.anim.play('happy'); v.emote('heart', 2);
    return;
  }
  const seen = (V.Z.quests.met ||= {});
  const intro = !seen[id] && lines(id, 'saved0');
  if (intro) { seen[id] = day; await say(intro); }
  // an offer
  const offers = offersFor(st, id, V.saved);
  if (offers.length) {
    const qid = offers[0], d = ZONE_QUESTS[qid];
    const c = await say([d.offer], [{ text: 'Leave it to me!' }, { text: 'Maybe later' }]);
    if (c === 0) { G.story?.start?.(qid); v.anim.play('bow'); return; }
    // (maybe later: the usual menu — chat, the story, their service — is still there)
  }
  // the menu: chat, the zone story (the elder), their service
  const mine = (st.quests.active || []).find(q => ZONE_QUESTS[q.id]?.giver === id);
  const opener = mine ? `How is it going? (${ZONE_QUESTS[mine.id].steps[mine.step]?.text || ''})` : pick(lines(id, 'chat') || ['Hello!']);
  const svc = serviceOf(V, v);
  const choices = [{ text: 'Chat' }];
  if (lines(id, 'story')) choices.push({ text: 'Tell me about the village 📜' });
  if (svc) choices.push({ text: svc.label });
  choices.push({ text: 'Bye!' });
  const c = await say([opener], choices);
  const t = choices[c]?.text || '';
  if (t === 'Chat') await say([pick(lines(id, 'chat') || ['…']), f ? `(Friendship: ${'♥'.repeat(f.hearts)}${'♡'.repeat(10 - f.hearts)})` : '']);
  else if (t.startsWith('Tell me')) await say(lines(id, 'story'));
  else if (svc && t === svc.label) await svc.run(say);
}

// ------------------------------------------------------------------ services (by the villager's role / the building's kind)
function serviceOf(V, v) {
  const b = V.buildings.find(x => x.id === ZONE_NPCS[v.id]?.home), kind = { shopkeeper: 'shop', innkeeper: 'inn', cook: 'inn', sensei: 'dojo', craftsman: 'craft', teaMaster: 'teaHouse', fishmonger: 'fishmonger', boatwright: 'boatwright', bathkeeper: 'bathhouse', smith: 'smith' }[ZONE_NPCS[v.id]?.role];
  if (!kind) return null;
  const bb = b?.kind === kind ? b : V.buildings.find(x => x.kind === kind);
  if (!bb) return null;
  const S = SERVICES[kind];
  return { label: S.label(bb), run: say => S.run(V, bb, say, v) };
}
/** F at a building's door */
export function buildingAction(V, b) {
  const G = V.G;
  if (!V.saved) {
    G.ui?.toast?.(b.kind === 'waypoint' ? 'The waystone is cracked and dark. Break the siege to light it again!' : `${b.name} is boarded up. Break the siege first!`, { icon: 'oni', color: '#d8b8ff' });
    Events.emit('sfx', 'ui_error');
    return;
  }
  if (b.kind === 'waypoint') return waypoint(V);
  if (b.kind === 'elder') { const v = V.villager(b.keeper); if (v?.visible) return V.talk(v); G.ui?.toast?.(`Nobody answers at ${b.name}.`, { color: '#ffd8a8' }); return; }
  const S = SERVICES[b.kind]; if (!S) return;
  const keeper = V.villager(b.keeper) || { id: b.keeper, name: nameOf(b.keeper), spec: ZONE_NPCS[b.keeper]?.spec };
  const lock = async () => { const P = G.player; P.controlLocked = true; try { await S.run(V, b, sayer(V, keeper), keeper); } finally { P.controlLocked = false; G.interactCooldown = performance.now() + 350; Input.consume('f'); } };
  lock();
}
function waypoint(V) {
  const G = V.G;
  G.vfx?.sparkle?.(V.mode.villagePos.clone().setY(V.h0 + 1.2), { n: 14, color: '#8fd0ff', r: 0.6 });
  Events.emit('sfx', 'portal');
  if (G.openTravel) G.openTravel({ from: V.zone }); else G.returnToVillage?.();
}

/** the Momiji Tea House's sets: a dish eaten on the spot with its tea (its Well Fed lasts half as long again) */
const TEA_SETS = [
  { name: 'Matcha & strawberry daifuku', dish: 'strawberryMochi', price: 80 },
  { name: 'Sencha & salt-grilled trout', dish: 'grilledTrout', price: 100 },
  { name: 'Hōjicha & honey castella', dish: 'honeyCake', price: 120 },
  { name: 'Genmaicha & pumpkin nimono', dish: 'pumpkinStew', price: 140 },
  { name: 'Gyokuro & melon pan', dish: 'melonBread', price: 150 },
];
const FISH_MUL = 1.3, SOAK_PRICE = 40; // (the fish market pays ×1.3; a soak at the bathhouse)
const ilvlOf = (V, k = 0) => clamp((V.G.state.player?.lvl || 1) + k, V.mode.region.levels[0], V.mode.region.levels[1] + 3);
const SERVICES = {
  shop: {
    label: b => `Shop at ${b.name} 🛒`,
    async run(V, b, say, keeper) {
      const G = V.G; if (!G.ui?.open) return;
      const day = G.day?.day || 1, lvl = ilvlOf(V), key = `${V.def.id}:${day}:${lvl}`;
      const store = V.Z.quests.shop ||= {};
      if (store.key !== key) store.key = key, store.items = shopStock(lvl, day * 977 + lvl * 13 + (V.def.id.length * 31));
      const forage = { bamboo: ['bamboo', 'shiitake'], maple: ['shiitake', 'honey'], tidepool: ['seaweed'], onsen: ['shiitake', 'honey'] }[V.zone] || [];
      G.ui.open('shop', {
        name: b.name, jp: b.jp, keeper: keeper.id, portrait: G.portrait?.(keeper.id),
        greeting: lines(keeper.id, 'greet') || 'Welcome, welcome! Fresh from the grove — and the yokai didn\'t get the good stuff!',
        stock: store.items, potions: ['heart', 'zoom', 'rejuv'],
        pantry: forage.filter(id => PANTRY[id]).map(id => ({ id, price: Math.round((PANTRY[id].value || 20) * 1.4) })),
        onBuy: (item, price) => { const ok = G.actions.buyItem(item, price); if (ok && item.kind !== 'potion') { const i = store.items.indexOf(item); if (i >= 0) store.items.splice(i, 1); } return ok; },
      });
      Events.emit('sfx', 'ui_open');
      void say;
    },
  },
  inn: {
    label: b => `Rest at the ${b.name} 🛏️`,
    async run(V, b, say, keeper) {
      const G = V.G, A = G.actions;
      const c = await say([`Welcome to the ${b.name}! A soft futon and a warm cup — and if the wilds ever knock you flat, this is where you'll wake up.`], [{ text: 'Rest a while (heal) 🍵' }, { text: 'Something to eat 🍙' }, { text: 'Just passing' }]);
      if (c === 0) {
        A.restoreAll(); G.vfx?.heal?.(G.player.pos.clone()); Events.emit('sfx', 'buff');
        G.ui?.toast?.('Fully rested! Life and Zoom restored', { icon: 'heart', color: '#8fe0c0', sub: `Your respawn point in this zone: the ${b.name}` });
        V.Z.quests.innRest = G.day?.day || 1;
      } else if (c === 1 && G.ui?.open) {
        const menu = ['onigiri', 'misoSoup', 'grilledFish', 'salmonOnigiri'].filter(id => PANTRY[id]);
        G.ui.open('shop', { name: `${b.name} Kitchen`, jp: '台所', keeper: keeper.id, portrait: G.portrait?.(keeper.id), greeting: 'Eat up! A full belly fights better.', pantry: menu.map(id => ({ id, price: Math.round((PANTRY[id].value || 40) * 1.2) })), stock: [] });
      }
    },
  },
  dojo: {
    label: b => `Train at the ${b.name} 🥷`,
    async run(V, b, say) {
      const G = V.G, A = G.actions, P = G.state.player, lvl = P.lvl || 1;
      const respecCost = 40 + lvl * 25, trainCost = 60 + lvl * 20, trained = V.Z.quests.trained === (G.day?.day || 1);
      const c = await say(['Three lessons I teach: forgetting, practising, and dressing like you mean it.'], [
        { text: `Forget and relearn (refund every point) — ${respecCost} coins` },
        { text: trained ? 'Spar (come back tomorrow)' : `Spar with the sensei (experience) — ${trainCost} coins` },
        { text: 'Ninja gear 🗡️' }, { text: 'Not today' }]);
      if (c === 0) {
        if (!A.spendCoins(respecCost)) { Events.emit('sfx', 'ui_error'); return say(['Even forgetting has a price, little one. Come back with more coins.']); }
        const r = A.respec(); Events.emit('sfx', 'ui_levelup');
        G.vfx?.sparkle?.(G.player.pos.clone().setY(G.player.pos.y + 1), { n: 24, color: '#b8a8ff', r: 0.8 });
        await say([`Breathe out… and let it go. (${r.statPts} stat and ${r.skillPts} skill points returned — press C and K to spend them anew.)`]);
      } else if (c === 1 && !trained) {
        if (!A.spendCoins(trainCost)) { Events.emit('sfx', 'ui_error'); return say(['Sparring costs bruises AND coins. Bring the coins.']); }
        V.Z.quests.trained = G.day?.day || 1;
        const xp = Math.round(40 + lvl * lvl * 6);
        A.addXp(xp); Events.emit('sfx', 'swing');
        G.ui?.float?.(G.player.pos.clone().setY(G.player.pos.y + 2), `+${xp} xp`, { kind: 'xp' });
        await say(['Good! Faster! …Less sneezing. Again tomorrow.']);
      } else if (c === 2 && G.ui?.open) {
        const ilvl = ilvlOf(V, 1), seed = (G.day?.day || 1) * 131 + lvl;
        const store = V.Z.quests.ninja ||= {};
        if (store.key !== seed) {
          store.key = seed; store.items = [];
          const poe = !!G.state.flags?.poeJoined || P.cls === 'poe';
          if (poe) for (let i = 0; i < 2; i++) store.items.push(generateItem({ ilvl, slot: 'weapon', wtype: 'fuma', rarity: i ? 'rare' : 'magic', rng: mulberry32(seed * 7 + i) }));
          for (const slot of ['hat', 'outfit', 'boots', 'paws']) store.items.push(generateItem({ ilvl, slot, rarity: 'magic', rng: mulberry32(seed * 13 + slot.length * 7) }));
          for (const it of store.items) { it.flavor = 'Kaze Dojo issue: light, quiet, and very slightly singed.'; it.price = buyPrice(it); }
        }
        G.ui.open('shop', { name: `${b.name} — Ninja Gear`, jp: '忍具', keeper: b.keeper, portrait: G.portrait?.(b.keeper), greeting: 'Soft soles, dark cloth. Poe wore this size once.', stock: store.items,
          onBuy: (item, price) => { const ok = A.buyItem(item, price); if (ok) { const i = store.items.indexOf(item); if (i >= 0) store.items.splice(i, 1); } return ok; } });
      }
    },
  },
  craft: {
    label: b => `Commission bamboo work 🎋`,
    run: (V, b, say, keeper) => craftRun(V, b, say, keeper),
  },
  // ---------------------------------------------------------------- Akane Hamlet: the Momiji Tea House (buff meals)
  teaHouse: {
    label: b => `Take tea at the ${b.name} 🍵`,
    async run(V, b, say, keeper) {
      const G = V.G, A = G.actions, P = G.state.player;
      const sets = TEA_SETS.filter(s => PANTRY[s.dish]);
      const c = await say([lines(keeper.id, 'tea') || 'Sit, and let the leaves fall. Which tea will you take with your sweet?'],
        [...sets.map(s => ({ text: `${s.name} — ${s.price} coins (${BUFFS[PANTRY[s.dish].food.buff]?.name || 'Well Fed'}, +50% longer)` })), { text: 'A tea set to take home 🫖' }, { text: 'Just admiring the garden' }]);
      const s = sets[c];
      if (s) {
        if (!A.spendCoins(s.price)) { Events.emit('sfx', 'ui_error'); return say(['Ah — the purse is light today. Come back; the kettle will wait.']); }
        A.addPantry(s.dish, 1, { silent: true, src: 'teaHouse' });
        const r = A.eat(s.dish);
        if (r?.meal) { r.meal.left = r.meal.dur = Math.round(r.meal.dur * 1.5); A.recompute(); } // (taken slowly, with tea: it lasts)
        G.vfx?.sparkle?.(G.player.pos.clone().setY(G.player.pos.y + 1.2), { n: 14, color: '#c8e070', r: 0.5 });
        Events.emit('sfx', 'meal_buff');
        return say([pick(['There. Drink slowly — the warmth lasts longer that way.', 'Three sips, then admire the bowl. That is the whole secret.', 'The sweet first, then the tea. The bitterness becomes kind.'])]);
      }
      if (c === sets.length && G.ui?.open) {
        G.ui.open('shop', { name: `${b.name} — Tea Things`, jp: '茶道具', keeper: keeper.id, portrait: G.portrait?.(keeper.id), greeting: 'For tea at home. Use it often; a tea set gets lonely.',
          furniture: [{ id: 'teaSet', price: 260 }, { id: 'mapleWreath', price: 180 }, { id: 'acornStool', price: 140 }].filter(f => FURNITURE[f.id]),
          pantry: ['strawberryMochi', 'honeyCake', 'pumpkinStew'].filter(id => PANTRY[id]).map(id => ({ id, price: Math.round((PANTRY[id].value || 60) * 1.3) })) });
        Events.emit('sfx', 'ui_open');
      }
    },
  },
  // ---------------------------------------------------------------- Shiokaze Port: the fish market and the boatyard
  fishmonger: {
    label: b => `Browse the fish market 🐟`,
    async run(V, b, say, keeper) {
      const G = V.G, A = G.actions, st = G.state;
      const catchIds = Object.keys(st.pantry || {}).filter(id => PANTRY[id]?.kind === 'fish' && (st.pantry[id] || 0) > 0);
      const n = catchIds.reduce((a, id) => a + st.pantry[id], 0), value = catchIds.reduce((a, id) => a + Math.round(pantrySellPrice(id) * FISH_MUL) * st.pantry[id], 0);
      const c = await say([lines(keeper.id, 'market') || 'Fresh from the bay, still blinking! Buying or selling?'],
        [{ text: 'Buy fish and seafood 🛒' }, { text: n ? `Sell my catch — ${n} fish for ${value} coins (the market pays ×${FISH_MUL})` : 'Sell my catch (no fish in the pantry)' }, { text: 'Just looking' }]);
      if (c === 0 && G.ui?.open) {
        G.ui.open('shop', { name: b.name, jp: b.jp, keeper: keeper.id, portrait: G.portrait?.(keeper.id), greeting: 'Today\'s catch! Sea bream for luck, mackerel for lunch, octopus for courage.',
          pantry: ['seaBream', 'mackerel', 'flounder', 'octopus', 'salmon', 'seaweed', 'grilledFish', 'sushiPlatter', 'fishermansFeast'].filter(id => PANTRY[id]).map(id => ({ id, price: Math.round((PANTRY[id].value || 30) * 1.25) })),
          furniture: [{ id: 'fishTank', price: 320 }].filter(f => FURNITURE[f.id]) });
        Events.emit('sfx', 'ui_open');
      } else if (c === 1) {
        if (!n) return say(['No fish? Go and ask the sea nicely. Bring me what it gives you.']);
        for (const id of catchIds) { const k = st.pantry[id]; A.addPantry(id, -k, { src: 'sell' }); }
        A.addCoins(value); Events.emit('sfx', 'coin');
        G.ui?.toast?.(`Sold ${n} fish for ${value} coins`, { icon: 'coin', color: '#ffd84a' });
        return say([pick(['Beautiful fish. Clear eyes, every one.', 'A fine catch! The port eats well tonight.', 'Ooh, that one\'s still sulking. Good fish.'])]);
      }
    },
  },
  boatwright: {
    label: b => `Commission the boatwright ⛵`,
    async run(V, b, say, keeper) {
      const G = V.G, M = V.mode;
      const ferry = V.saved && M.gatePos;
      const c = await say([lines(keeper.id, 'yard') || 'Timber, rope and a good ear. What can I build you?'], [{ text: 'Commission something 🔨' }, ...(ferry ? [{ text: 'Row me to the sea cave ⛵' }] : []), { text: 'Just watching you work' }]);
      if (c === 0) return craftRun(V, b, say, keeper);
      if (ferry && c === 1) {
        const g = M.gatePos, P = G.player;
        G.ui?.iris?.wipe?.(0.5);
        Events.emit('sfx', 'splash');
        setTimeout(() => { P.setPos(g.x + 1.2, g.z + 1.6); G.engine.rig.focus.copy(P.pos); G.engine.rig.snap?.(); G.ui?.toast?.(`${nameOf(b.keeper)} rows you round the headland to the sea cave`, { icon: 'map', color: '#8fd0ff' }); }, 450);
      }
    },
  },
  // ---------------------------------------------------------------- Yukimi Spa Village: the bathhouse and the snow-ore smith
  bathhouse: {
    label: b => `Soak at the ${b.name} ♨️`,
    async run(V, b, say, keeper) {
      const G = V.G, A = G.actions, P = G.state.player;
      const c = await say([lines(keeper.id, 'bath') || 'Hot, hotter and "a little too hot". In you get!'], [{ text: `Soak in the hot spring — ${SOAK_PRICE} coins (heal + ${SOAK.name}, ${SOAK.mins} min)` }, { text: 'Bath goods to take home 🧴' }, { text: 'Maybe later' }]);
      if (c === 0) {
        if (!A.spendCoins(SOAK_PRICE)) { Events.emit('sfx', 'ui_error'); return say(['No coins, no soak — even the monkeys pay. In persimmons, but they pay.']); }
        A.restoreAll(); startSoak(P); A.recompute();
        G.vfx?.heal?.(G.player.pos.clone());
        for (let i = 0; i < 3; i++) G.vfx?.sparkle?.(G.player.pos.clone().setY(G.player.pos.y + 0.6 + i * 0.4), { n: 10, color: '#ffd0b8', r: 0.6, rise: 1.4 });
        Events.emit('sfx', 'buff');
        G.ui?.toast?.(`${SOAK.name}! ${soakText()} for ${SOAK.mins} minutes`, { icon: 'heart', color: SOAK.color, sub: 'Life and Zoom restored' });
        return say([pick(['Ahh. Your ears are pink. Perfect.', 'There — warm right through. That glow will keep the cold off for a good while.', 'See? "A little too hot" is just right.'])]);
      }
      if (c === 1 && G.ui?.open) {
        G.ui.open('shop', { name: `${b.name} — Bath Goods`, jp: '湯道具', keeper: keeper.id, portrait: G.portrait?.(keeper.id), greeting: 'A cypress bucket for home — it smells like the mountains.',
          furniture: [{ id: 'cypressBucket', price: 160 }, { id: 'onsenNoren', price: 220 }, { id: 'lilyTub', price: 280 }].filter(f => FURNITURE[f.id]),
          pantry: ['honey', 'shiitake', 'misoSoup'].filter(id => PANTRY[id]).map(id => ({ id, price: Math.round((PANTRY[id].value || 30) * 1.3) })) });
        Events.emit('sfx', 'ui_open');
      }
    },
  },
  smith: {
    label: b => `Visit the forge ⚒️`,
    async run(V, b, say, keeper) {
      const G = V.G, A = G.actions, st = G.state, lvl = st.player.lvl || 1;
      const forgeCost = { coins: 120 + lvl * 18, mats: { stone: 8, crystal: 1 } }, reCost = { coins: 80 + lvl * 12, mats: { crystal: 1 } };
      const costTxt = k => `${k.coins} coins, ${Object.entries(k.mats).map(([m, n]) => `${n} ${m}`).join(', ')}`;
      const can = k => (st.coins || 0) >= k.coins && A.hasMaterials(k.mats);
      const c = await say([lines(keeper.id, 'forge') || 'Snow ore wants to be steel. What shall we make of it?'], [
        { text: `Forge snow-ore gear (a rare piece) — ${costTxt(forgeCost)}${can(forgeCost) ? '' : ' ✗'}` },
        { text: `Re-fold your weapon (re-roll its magic) — ${costTxt(reCost)}${can(reCost) ? '' : ' ✗'}` },
        { text: 'Not today' }]);
      if (c === 0) {
        const slots = ['weapon', 'hat', 'outfit', 'boots', 'paws'];
        const k = await say(['Which piece? The ore listens better if you\'re sure.'], [...slots.map(s => ({ text: SLOT_NAMES[s] || s })), { text: 'Never mind' }]);
        const slot = slots[k]; if (!slot) return;
        if (!can(forgeCost)) { Events.emit('sfx', 'ui_error'); return say(['Not enough. Stone for the body, a crystal for the heart — and coins for the charcoal.']); }
        A.spendCoins(forgeCost.coins); A.spendMaterials(forgeCost.mats);
        const P = st.player;
        const it = generateItem({ ilvl: ilvlOf(V, 2), slot, rarity: 'rare' });
        it.flavor = `Folded a hundred and one times by ${nameOf(b.keeper)} of ${V.def.name}. It rings like a bell in the cold.`;
        G.story?.giveItem?.(it);
        Events.emit('sfx', 'build_complete'); G.vfx?.sparks?.(G.player.lift?.(1) || G.player.pos.clone().setY(G.player.pos.y + 1), { n: 16, color: '#bfe8ff', speed: 3, size: 0.25 });
        G.ui?.toast?.(`You got ${it.name}!`, { icon: 'gift', color: '#6ea8ff' });
        void P;
        return say(['There. Listen — hear it ring? That\'s the snow ore, glad to be useful.']);
      }
      if (c === 1) {
        const eqSlot = st.player.activeWeapon === 1 ? 'weaponAlt' : 'weapon', w = st.equipment?.[eqSlot];
        if (!w) return say(['No weapon in your paws. I can\'t re-fold air.']);
        if (w.rarity !== 'magic' && w.rarity !== 'rare') return say([w.rarity === 'unique' || w.rarity === 'set' ? 'That one has its own soul. I won\'t touch it.' : 'Plain steel has no magic to re-fold. Bring me something with a spark in it.']);
        if (!can(reCost)) { Events.emit('sfx', 'ui_error'); return say(['A crystal to wake the steel, and coins for the coal. Come back with both.']); }
        A.spendCoins(reCost.coins); A.spendMaterials(reCost.mats);
        const it = generateItem({ base: w.base, rarity: w.rarity, ilvl: Math.max(w.ilvl || 1, ilvlOf(V, 0)) });
        it.flavor = `Re-folded at ${b.name}.`;
        st.equipment[eqSlot] = it; A.recompute();
        Events.emit('inv:changed', { c: 'equip' }); Events.emit('sfx', 'build_complete');
        G.ui?.toast?.(`${w.name} → ${it.name}`, { icon: 'sword', color: '#bfe8ff', sub: 'Re-folded: its magic is new' });
        return say(['Fold, strike, fold. Its old magic is gone — see what the snow ore gave it instead.']);
      }
    },
  },
};
/** a commission: zone forage, materials and coins → furniture or gear (the Bamboo Craftshop, the Funaki Boatyard) */
async function craftRun(V, b, say, keeper) {
  const G = V.G, A = G.actions, st = G.state, have = id => st.pantry?.[id] || 0;
  const R = CRAFTS[V.zone] || [];
  const can = r => (st.coins || 0) >= (r.coins || 0) && Object.entries(r.pantry || {}).every(([k, n]) => have(k) >= n) && A.hasMaterials(r.mats || {});
  const cost = r => [r.coins ? `${r.coins} coins` : null, ...Object.entries(r.pantry || {}).map(([k, n]) => `${n} ${PANTRY[k]?.name || k}`), ...Object.entries(r.mats || {}).map(([k, n]) => `${n} ${k}`)].filter(Boolean).join(', ');
  const c = await say([lines(keeper?.id || b.keeper, 'craft') || 'Bring me what the grove gives — shoots, wood — and I\'ll weave it into something worth keeping.'], [...R.map(r => ({ text: `${r.name} — ${cost(r)}${can(r) ? '' : ' ✗'}` })), { text: 'Just looking' }]);
  const r = R[c]; if (!r) return;
  if (!can(r)) { Events.emit('sfx', 'ui_error'); return say(['Not enough materials, I\'m afraid. Go out and gather a little more.']); }
  if (r.coins) A.spendCoins(r.coins);
  if (r.pantry) A.spendPantry(r.pantry, { src: 'craft' });
  if (r.mats) A.spendMaterials(r.mats);
  Events.emit('sfx', 'build_complete');
  G.vfx?.sparkle?.(G.player.pos.clone().setY(G.player.pos.y + 1), { n: 20, color: '#c8e070', r: 0.7 });
  if (r.furniture) { A.addFurniture(r.furniture, 1, { src: 'craft' }); G.ui?.toast?.(`${FURNITURE[r.furniture]?.name || r.name} — sent to your furniture storage`, { icon: 'home', color: '#b8f08a' }); }
  if (r.gear) {
    const it = generateItem({ ilvl: ilvlOf(V, 1), slot: r.gear, rarity: r.rarity || 'magic' });
    it.flavor = `${V.zone === 'tidepool' ? 'Built' : 'Woven'} by ${nameOf(b.keeper)} of ${V.def.name}.`;
    G.story?.giveItem?.(it);
    G.ui?.toast?.(`You got ${it.name}!`, { icon: 'gift', color: '#6ea8ff' });
  }
  return say([pick(V.zone === 'tidepool' ? ['Knock it. Hear that? Good wood.', 'There. Sea-worthy, shelf-worthy, both.', 'Mind the varnish — it\'s still tacky.'] : ['Mind the grain. It remembers who made it.', 'There. Not bad, if I say so myself — and I do.', 'Careful with it — or don\'t. Bamboo bends.'])]);
}
/** the commissions per zone: the Bamboo Craftshop (bamboo), the Funaki Boatyard (tidepool) */
const CRAFTS = {
  tidepool: [
    { name: 'Glass Floats', furniture: 'glassFloats', pantry: { seaweed: 2 }, mats: { stone: 4 }, coins: 90 },
    { name: 'Shell Lamp', furniture: 'shellLamp', pantry: { seaweed: 2 }, mats: { stone: 3, lantern: 1 }, coins: 110 },
    { name: 'Wave Rug', furniture: 'waveRug', mats: { silk: 2, wood: 2 }, coins: 120 },
    { name: 'Sailor\'s Cap (hat)', gear: 'hat', rarity: 'magic', mats: { silk: 1, wood: 2 }, coins: 140 },
    { name: 'Deck Boots', gear: 'boots', rarity: 'magic', pantry: { seaweed: 2 }, mats: { wood: 6 }, coins: 140 },
    { name: 'Anchor Charm', gear: 'charm', rarity: 'rare', mats: { stone: 10, crystal: 1 }, coins: 320 },
  ],
  bamboo: [
    { name: 'Bamboo Lantern', furniture: 'bambooLantern', pantry: { bamboo: 3 }, mats: { wood: 4 }, coins: 60 },
    { name: 'Bamboo Bench', furniture: 'bambooBench', pantry: { bamboo: 4 }, mats: { wood: 8 }, coins: 80 },
    { name: 'Bamboo Planter', furniture: 'bambooPlanter', pantry: { bamboo: 2 }, mats: { stone: 4 }, coins: 40 },
    { name: 'Woven Kasa (hat)', gear: 'hat', rarity: 'magic', pantry: { bamboo: 4 }, mats: { silk: 1 }, coins: 120 },
    { name: 'Bamboo-weave Paws', gear: 'paws', rarity: 'magic', pantry: { bamboo: 3, shiitake: 1 }, mats: { wood: 6 }, coins: 120 },
    { name: 'Heartwood Charm', gear: 'charm', rarity: 'rare', pantry: { bamboo: 6 }, mats: { crystal: 1, wood: 10 }, coins: 300 },
  ],
};
