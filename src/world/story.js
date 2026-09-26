// Story quests (Rosie), villager friendship (hearts, gifts, daily chats) and villager requests.
import { Events } from '../core/events.js';
import { BUILDINGS } from './buildings/index.js';
import { VILLAGERS } from '../actors/roster.js';
import { generateItem, makeUnique, UNIQUE_IDS } from '../rpg/items.js';
import { rand, randInt, pick, uid } from '../core/util.js';

// step types: talk(npc) | collect(material,n) | kill(monster?,n) | boss(id) | floor(n) | build(type,n) | pop(n) | zone(n)
export const QUESTS = {
  welcome: { title: 'Welcome Home, Chewy', giver: 'rosie', desc: 'Rosie wants to show you around Blossom Hollow.', steps: [{ type: 'talk', npc: 'rosie', text: 'Say hi to Rosie' }], reward: { coins: 50, xp: 20 }, next: 'burrow1' },
  burrow1: { title: 'Something Squishy', giver: 'rosie', desc: 'Strange squeaks echo from the Burrow on the shrine hill. Go take a peek!', steps: [{ type: 'kill', n: 8, text: 'Defeat yokai in the Burrow' }, { type: 'collect', mat: 'mochi', n: 3, text: 'Bring back Mochi Jelly' }], reward: { coins: 120, xp: 80, potions: { heart: 3 } }, next: 'homes' },
  homes: { title: 'A Home for Everyone', giver: 'rosie', desc: 'New friends want to move in! Paint a homes zone (B → Zones) next to a path and let the village grow.', steps: [{ type: 'build', btype: 'home', n: 9, text: 'Grow the village to 9 homes' }], reward: { coins: 200, xp: 120, mats: { wood: 20, stone: 10 } }, next: 'lights' },
  lights: { title: 'Lights of Blossom Hollow', giver: 'rosie', desc: 'Nights are a little spooky. Place lanterns so everyone can find their way home.', steps: [{ type: 'buildAny', btypes: ['stoneLantern', 'streetLamp', 'lanternString'], n: 3, text: 'Build 3 more lanterns' }], reward: { coins: 150, xp: 150, mats: { lantern: 3 } }, next: 'king' },
  king: { title: 'The King of Squish', giver: 'rosie', desc: 'A giant mochi with a crown is hogging Floor 5. Time to deflate that ego!', steps: [{ type: 'floor', n: 5, text: 'Reach Floor 5' }, { type: 'boss', id: 'mochiKing', text: 'Defeat King Mochi' }], reward: { coins: 500, xp: 600, skillPts: 1, unique: true }, next: 'shrine' },
  shrine: { title: 'A Shrine for Wishes', giver: 'kitsune', desc: 'Kitsune says a shrine would make the whole village happier. (Needs village rank 2.)', steps: [{ type: 'build', btype: 'shrine', n: 1, text: 'Build a Blossom Shrine' }], reward: { coins: 300, xp: 400 }, next: 'umbrella' },
  umbrella: { title: 'Umbrella Trouble', giver: 'rosie', desc: 'Umbrellas keep hopping out of the Burrow at night. Their lord waits on Floor 10.', steps: [{ type: 'floor', n: 10, text: 'Reach Floor 10' }, { type: 'boss', id: 'kasaLord', text: 'Defeat Lord Karakasa' }], reward: { coins: 1200, xp: 2500, skillPts: 1, unique: true }, next: 'onsen' },
  onsen: { title: 'Hot Spring Dreams', giver: 'kuma', desc: 'Kuma dreams of a steamy hot spring for sore paws. (Needs village rank 3.)', steps: [{ type: 'build', btype: 'onsen', n: 1, text: 'Build a Hot Spring' }, { type: 'pop', n: 30, text: 'Reach 30 villagers' }], reward: { coins: 800, xp: 3000 }, next: 'oni' },
  oni: { title: "Oni's Kitchen Nightmare", giver: 'rosie', desc: 'Someone is stealing all the dumplings. The trail leads to Floor 15.', steps: [{ type: 'floor', n: 15, text: 'Reach Floor 15' }, { type: 'boss', id: 'oniChef', text: 'Defeat Oni Chef Gorobei' }], reward: { coins: 3000, xp: 12000, skillPts: 1, unique: true }, next: 'tails' },
  tails: { title: 'Nine Tails of Moonlight', giver: 'kitsune', desc: 'The old fox spirit Tamamo stirs on Floor 20. Kitsune believes only a good boy can calm her.', steps: [{ type: 'floor', n: 20, text: 'Reach Floor 20' }, { type: 'boss', id: 'nineTails', text: 'Calm Tamamo, the Nine-Tailed' }], reward: { coins: 10000, xp: 40000, skillPts: 2, unique: true }, next: null },
};

const CHAT = {
  rosie: ['Did you know Shadow snores? Like a tiny tractor.', 'I baked strawberry mochi! …Shadow ate three.', "If you find anything shiny in the Burrow, I'll trade you treats for it!", 'The sakura are extra fluffy this year. I think they like you, Chewy.'],
  mochi: ['I painted the sunrise again. It came out… purple. Very avant-garde.', 'Petals make the best paintbrushes. Don\'t tell Usagi.', 'Purrr… sorry, I was napping standing up.'],
  usagi: ['The hydrangeas turned blue overnight! Magic, or just soil acidity?', 'Hop hop! Have you tried the flower beds by the plaza?', 'A bench near my garden would be lovely…'],
  kuma: ['Fresh melon-pan! Mind the crumbs.', 'The secret ingredient is honey. The other secret ingredient is more honey.', 'My oven hums a little song when it\'s happy.'],
  kitsune: ['The shrine lanterns whisper when the moon is full.', 'Nine tails is a lot of grooming, you know.', 'The Burrow is older than the village. Much older.'],
  pan: ['Zzz… oh! Hi Chewy. I was practicing kemari. In my dreams.', 'Bamboo is a food, a flute and a bed. Perfect plant.', 'Want to nap together sometime? Professionally?'],
  tanu: ['This leaf hat? Pure fashion. Definitely not a disguise.', 'I can get you a great deal on a slightly haunted umbrella.', 'Coins make the nicest jingle, don\'t they?'],
  kero: ['The koi told me it will rain on Tuesday. They are rarely wrong.', 'Ribbit. That means "hello" and also "nice scarf".', 'Please do not skip stones in my pond. The koi are sensitive.'],
};
const GIFT_LINES = { love: ['For me?! You shouldn\'t have! (Please do again.)', 'This is exactly what I wanted!!'], like: ['Oh, how thoughtful! Thank you, Chewy!', 'That\'s sweet of you.'], meh: ['Oh! …Thank you. I\'ll find a use for it. Somewhere.'] };
const HEART_REWARDS = { 3: { coins: 100, text: 'Here, a little something for being such a good friend!' }, 6: { item: 'magic', text: 'I found this and thought of you!' }, 9: { item: 'rare', text: 'You\'re my best friend in the whole village. Take this, please!' } };

export class Story {
  constructor(G) {
    this.G = G;
    const Q = G.state.quests;
    Q.active ||= []; Q.done ||= []; Q.requests ||= {};
    if (!Q.active.length && !Q.done.length) this.start('welcome', true);
    Events.on('monster:killed', e => this.progress('kill', e));
    Events.on('boss:dead', e => this.progress('boss', e));
    Events.on('mode:changed', e => { if (e.mode === 'dungeon') this.progress('floor', e); });
    Events.on('village:changed', () => this.progress('build'));
    Events.on('materials:changed', () => this.progress('collect'));
    setInterval(() => this.progress('pop'), 5000);
  }
  get Q() { return this.G.state.quests; }
  def(id) { return QUESTS[id] || this.Q.requests?.[id]?.def; }
  start(id, silent = false) {
    if (this.Q.active.some(q => q.id === id) || this.Q.done.includes(id)) return;
    this.Q.active.push({ id, step: 0, prog: 0 });
    const d = this.def(id);
    if (!silent) { this.G.ui?.banner?.('New Quest', d.title, { style: 'quest' }); Events.emit('sfx', 'ui_quest'); }
    Events.emit('quest:update');
    this.progress('any');
  }
  stepDone(q, s) {
    const G = this.G, st = G.state;
    switch (s.type) {
      case 'collect': return (st.materials[s.mat] || 0) >= s.n;
      case 'build': return st.village.buildings.filter(b => b.type === s.btype).length >= s.n + (q.base || 0);
      case 'buildAny': return st.village.buildings.filter(b => s.btypes.includes(b.type)).length >= s.n + (q.base || 0);
      case 'pop': return (G.sim?.stats.population || 0) >= s.n;
      case 'floor': return (st.dungeon.deepest || 0) >= s.n;
      default: return q.prog >= (s.n || 1);
    }
  }
  progress(kind, e) {
    let changed = false;
    for (const q of [...this.Q.active]) {
      const d = this.def(q.id); if (!d) continue;
      const s = d.steps[q.step]; if (!s) continue;
      if (s.type === 'buildAny' && q.base === undefined) q.base = this.G.state.village.buildings.filter(b => s.btypes.includes(b.type)).length;
      if (kind === 'kill' && s.type === 'kill' && (!s.monster || s.monster === e.id)) { q.prog++; changed = true; }
      if (kind === 'boss' && s.type === 'boss' && s.id === e.id) { q.prog = 1; changed = true; }
      if (this.stepDone(q, s)) {
        q.step++; q.prog = 0; changed = true;
        if (q.step >= d.steps.length) this.complete(q, d);
        else this.G.ui?.toast?.(`Quest updated: ${d.steps[q.step].text}`, { color: '#ffd84a' });
      }
    }
    if (changed) Events.emit('quest:update');
  }
  complete(q, d) {
    const G = this.G, A = G.actions, r = d.reward || {};
    this.Q.active.splice(this.Q.active.indexOf(q), 1);
    this.Q.done.push(q.id);
    if (d.giver && d.giver !== 'rosie' || d.request) { /* reward delivered on completion */ }
    if (r.coins) A.addCoins(r.coins);
    if (r.xp) A.addXp(r.xp);
    if (r.skillPts) A.addSkillPts(r.skillPts);
    if (r.mats) for (const k in r.mats) A.addMaterial(k, r.mats[k]);
    if (r.potions) for (const k in r.potions) A.addPotion(k, r.potions[k]);
    if (r.unique) A.pickup(makeUnique(pick(UNIQUE_IDS), Math.max(5, G.state.player.lvl)));
    if (r.hearts && d.giver) this.addHearts(d.giver, r.hearts);
    G.ui?.banner?.('Quest Complete!', d.title, { style: 'levelup' });
    Events.emit('sfx', 'ui_levelup');
    G.vfx?.levelUp?.(G.player.pos.clone());
    if (d.request) delete this.Q.requests[q.id];
    if (d.next) setTimeout(() => this.start(d.next), 2500);
    Events.emit('quest:update');
  }
  // ------------------------------------------------------------------ friendship
  friend(id) { return (this.G.state.friends[id] ||= { hearts: 0, pts: 0, talkedDay: 0, giftDay: 0, rewards: [] }); }
  addHearts(id, pts) {
    const f = this.friend(id), before = f.hearts;
    f.pts += pts; f.hearts = Math.min(10, Math.floor(f.pts / 10));
    if (f.hearts > before) {
      this.G.ui?.toast?.(`♥ ${this.nameOf(id)} likes you more! (${f.hearts}/10)`, { color: '#ff8fb0' });
      const npc = this.G.npcs?.find(n => n.id === id); if (npc) this.G.vfx?.emote?.(npc, 'heart', 2);
      for (const lvl of Object.keys(HEART_REWARDS)) if (f.hearts >= +lvl && !f.rewards.includes(+lvl)) { f.rewards.push(+lvl); f.pendingReward = +lvl; }
    }
    Events.emit('friend:changed', { id });
  }
  nameOf(id) { return id === 'rosie' ? 'Rosie' : VILLAGERS.find(v => v.id === id)?.spec.name || id; }
  likesOf(id) { return id === 'rosie' ? ['petal', 'mochi', 'crystal'] : VILLAGERS.find(v => v.id === id)?.likes || []; }
  // full conversation flow for a villager
  async talk(npc) {
    const G = this.G, ui = G.ui, id = npc.id, f = this.friend(id), day = G.day?.day || 1;
    const portrait = ui?.portraits?.get?.(id);
    const say = (lines, choices) => ui?.dialogue ? ui.dialogue({ speaker: npc.name, portrait, lines, choices, voice: npc.spec.voice }) : Promise.resolve(null);
    if (f.talkedDay !== day) { f.talkedDay = day; this.addHearts(id, 2); }
    // story talk steps
    for (const q of this.Q.active) { const d = this.def(q.id); const s = d?.steps[q.step]; if (s?.type === 'talk' && s.npc === id) { q.prog = 1; this.progress('talk'); } }
    // pending heart reward
    if (f.pendingReward) {
      const R = HEART_REWARDS[f.pendingReward]; f.pendingReward = null;
      await say([R.text]);
      if (R.coins) G.actions.addCoins(R.coins);
      if (R.item) G.actions.pickup(generateItem({ ilvl: G.state.player.lvl + 2, rarity: R.item }));
      Events.emit('sfx', 'ui_quest');
    }
    const lines = [];
    const quest = this.Q.active.find(q => this.def(q.id)?.giver === id);
    if (id === 'rosie' && quest) lines.push(this.def(quest.id).desc);
    else lines.push(pick(CHAT[id] || ['Hello Chewy!']));
    const req = this.Q.requests[`req_${id}`];
    const choices = [{ text: 'Chat' }, { text: 'Give a gift 🎁' }];
    if (!req && this.canRequest(id)) choices.push({ text: 'Need any help? 📝' });
    if (id === 'rosie') choices.push({ text: "Open Rosie's shop 🍰" });
    choices.push({ text: 'Bye!' });
    const c = await say(lines, choices);
    const pickText = choices[c]?.text || '';
    if (pickText.startsWith('Chat')) await say([pick(CHAT[id] || ['…']), `(Friendship: ${'♥'.repeat(f.hearts)}${'♡'.repeat(10 - f.hearts)})`]);
    else if (pickText.startsWith('Give')) await this.giftFlow(npc, say);
    else if (pickText.startsWith('Need')) await this.requestFlow(npc, say);
    else if (pickText.startsWith('Open')) G.openShop?.();
  }
  async giftFlow(npc, say) {
    const G = this.G, id = npc.id, f = this.friend(id), day = G.day?.day || 1;
    if (f.giftDay === day) return say(['You already gave me something today! Save some for tomorrow~']);
    const have = Object.entries(G.state.materials).filter(([k, n]) => n > 0);
    if (!have.length) return say(['Aww, your pockets are empty! That\'s okay.']);
    const c = await say(['Ooh, a present? What is it?'], [...have.slice(0, 6).map(([k, n]) => ({ text: `${k} (${n})` })), { text: 'Never mind' }]);
    if (c == null || c >= Math.min(6, have.length)) return;
    const [mat] = have[c];
    G.actions.spendMaterials({ [mat]: 1 });
    f.giftDay = day;
    const love = this.likesOf(id).includes(mat);
    this.addHearts(id, love ? 8 : 3);
    G.vfx?.emote?.(npc, love ? 'heart' : 'sparkle', 2);
    npc.anim.play('happy');
    Events.emit('sfx', love ? 'ui_levelup' : 'ui_coin');
    return say([pick(love ? GIFT_LINES.love : GIFT_LINES.like)]);
  }
  canRequest(id) { const f = this.friend(id); return (f.reqDay || 0) !== (this.G.day?.day || 1); }
  async requestFlow(npc, say) {
    const G = this.G, id = npc.id, f = this.friend(id);
    const lvl = G.state.player.lvl;
    const mat = pick(['wood', 'stone', 'petal', 'mochi', 'silk', 'lantern', 'crystal', 'bone']);
    const templates = [
      { steps: [{ type: 'collect', mat, n: randInt(2, 5), text: `Bring ${mat}` }], text: `Could you bring me some ${mat}? I'm making something special!` },
      { steps: [{ type: 'kill', n: randInt(10, 20), text: 'Defeat yokai in the Burrow' }], text: 'The yokai keep knocking over my flower pots… could you shoo some away?' },
      { steps: [{ type: 'buildAny', btypes: ['bench', 'flowerBed', 'sakuraPlanter'], n: 1, text: 'Build a bench, flower bed or planter' }], text: 'The village could use somewhere cute to sit. Would you build something?' },
    ];
    const t = pick(templates);
    const c = await say([t.text], [{ text: 'Leave it to me!' }, { text: 'Maybe later' }]);
    if (c !== 0) return;
    f.reqDay = G.day?.day || 1;
    const qid = `req_${id}`;
    this.Q.requests[qid] = { def: { title: `${npc.name}'s Request`, giver: id, desc: t.text, steps: t.steps, reward: { coins: 40 + lvl * 12, xp: 30 + lvl * 20, hearts: 12 }, request: true, next: null } };
    this.start(qid);
  }
}
