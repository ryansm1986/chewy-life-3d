// UI test page: /?test=ui  — renders every HUD/panel state over a small 3D stage.
// Uses src/rpg/* when present (newGameState / createActions / computeStats), otherwise a local mock.
// window.demo exposes helpers for screenshots, e.g. demo.inventory(), demo.skills(), demo.dialogue() …
import * as THREE from 'three';
import { makeStage } from './_stage.js';
import { makeToon } from '../gfx/materials.js';
import { Events } from '../core/events.js';
import { UI } from '../ui/ui.js';

const rpg = import.meta.glob('../rpg/*.js', { eager: true });
const R = n => rpg[`../rpg/${n}.js`] || {};

export default async function () {
  const P = new URLSearchParams(location.search);
  const S = makeStage({ ground: 70, hour: +(P.get('hour') ?? 10.5), dist: 26, groundColor: '#8fcf6a' });
  S.freeCam = false;
  const { scene, engine } = S;
  // ---- a little diorama: blossom trees, a pond, a few mochi "monsters"
  const deco = new THREE.Group(); scene.add(deco);
  const trunkM = makeToon({ color: '#8a5a3a', brush: .2 });
  const bloomM = makeToon({ color: '#ffb3cf', brush: .3, rim: .4 });
  const leafM = makeToon({ color: '#6cbf5a', brush: .3, rim: .3 });
  const rnd = mul(7);
  for (let i = 0; i < 14; i++) {
    const a = rnd() * Math.PI * 2, r = 7 + rnd() * 16;
    const t = new THREE.Group();
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(.18, .28, 1.6, 7), trunkM); tr.position.y = .8; tr.castShadow = true; t.add(tr);
    const pink = rnd() > .4;
    for (let k = 0; k < 4; k++) { const b = new THREE.Mesh(new THREE.IcosahedronGeometry(.9 + rnd() * .5, 1), pink ? bloomM : leafM); b.position.set((rnd() - .5) * 1.2, 1.9 + rnd() * .8, (rnd() - .5) * 1.2); b.castShadow = true; t.add(b); }
    t.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); deco.add(t);
  }
  const pond = new THREE.Mesh(new THREE.CircleGeometry(4, 32), makeToon({ color: '#7cc8ff', brush: .1, rim: 0 })); pond.rotation.x = -Math.PI / 2; pond.position.set(-6, .02, 5); scene.add(pond);
  const mochiM = makeToon({ color: '#fff4fa', brush: .15, rim: .5 });
  const mobs = [];
  for (let i = 0; i < 4; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(.6, 20, 14), mochiM); m.scale.y = .75; m.position.set(-3 + i * 2.2, .45, -2 - (i % 2) * 1.5); m.castShadow = true; scene.add(m); mobs.push(m); }
  const player = { pos: new THREE.Vector3(0, 0, 0), facing: 0.6 };
  const chewy = new THREE.Mesh(new THREE.CapsuleGeometry(.35, .5, 6, 12), makeToon({ color: '#8a4a2c', rim: .5 })); chewy.position.set(0, .6, 0); chewy.castShadow = true; scene.add(chewy);
  engine.rig.focus.set(0, .5, 0); engine.rig.snap();

  // ---- game context (real rpg modules when available)
  let state, actions, compute;
  const A = R('actions'), ST = R('stats');
  const G = window.G = { engine, input: S.Input, events: Events, THREE, mode: 'village', state: null, derived: {}, actions: null, ui: UI, audio: null, player, companion: { life: 88, lifeMax: 120 }, day: S.day };
  if (A.newGameState && A.createActions) {
    state = A.newGameState(); G.state = state;
    actions = A.createActions(G); G.actions = actions;
    actions.recompute?.();
    compute = () => actions.recompute?.();
    console.log('[ui-test] using real rpg modules');
  } else {
    state = G.state = mockState();
    compute = () => { G.derived = (ST.computeStats || mockStats)(state); Events.emit('stats:changed'); };
    actions = G.actions = mockActions(G, compute);
    compute();
    console.log('[ui-test] using mock rpg layer');
  }
  // generous demo values
  state.coins = 1234; state.player.statPts = 3; state.player.skillPts = 4; state.player.lvl = Math.max(state.player.lvl, 12); state.day = 3;
  state.player.xp = Math.round((ST.xpToNext ? ST.xpToNext(state.player.lvl) : 1000) * 0.62);
  Object.assign(state.materials, { wood: 48, stone: 26, petal: 12, crystal: 3, bone: 7 });
  state.potions.heart = 5; state.potions.zoom = 2;
  state.quests.active = [
    { id: 'q1', name: 'Blossom Delivery', giver: 'Rosie', desc: 'Rosie needs sakura petals to bake her famous blossom mochi. Collect some from the trees around the village!', objectives: [{ text: 'Collect sakura petals', have: 3, need: 5 }, { text: 'Bring them to Rosie', have: 0, need: 1 }], rewards: { coins: 80, xp: 120 }, main: true },
    { id: 'q2', name: 'Mochi Menace', giver: 'Mayor Tanuki', desc: 'Mochi slimes are bouncing around the Burrow entrance. Shoo them away!', objectives: [{ text: 'Defeat mochi slimes', have: 7, need: 10 }], rewards: { coins: 150, xp: 300, text: 'Mochi Hat' } },
    { id: 'q3', name: 'A Home for Pip', giver: 'Pip the Bunny', desc: 'Pip wants to move into the village. Build a cozy cottage near the pond.', objectives: [{ text: 'Build a Cozy Cottage', have: 1, need: 1, done: true }, { text: 'Talk to Pip', have: 0, need: 1 }] },
  ];
  state.quests.done = [{ id: 'q0', name: 'Wake Up, Chewy!', giver: 'Shadow', objectives: [{ text: 'Get out of bed', have: 1, need: 1 }], done: true }];
  // learn a few skills for a nice tree
  const learn = (id, n) => { for (let i = 0; i < n; i++) { state.player.skillPts++; actions.learnSkill?.(id); } };
  learn('chomp', 3);
  const sk = listSkills();
  const second = sk.find(s => s.tree === 'bone' && s.id !== 'chomp' && (s.row ?? s.tier ?? 1) === 1);
  if (second) learn(second.id, 2);
  const fetch0 = sk.find(s => s.tree === 'fetch');
  if (fetch0) { learn(fetch0.id, 1); actions.setHotbar?.(2, fetch0.id); }
  if (second) actions.setHotbar?.(3, second.id);
  state.player.skillPts = 4;
  // equip some starter gear
  const gen = makeGen();
  const eqWant = [['weapon', 'magic'], ['hat', 'rare'], ['outfit', 'normal'], ['collar', 'magic'], ['charm', 'unique'], ['boots', 'normal']];
  for (const [slot, rar] of eqWant) { const it = gen(slot, rar); const i = state.inventory.findIndex(x => !x); state.inventory[i] = it; actions.equip?.(i); }
  const ball = gen('weapon', 'rare', 'ball'); { const i = state.inventory.findIndex(x => !x); state.inventory[i] = ball; actions.moveItem?.({ c: 'inv', i }, { c: 'equip', i: 'weaponAlt' }); }
  compute();
  state.player.life = Math.round((G.derived.lifeMax || 100) * 0.72);
  state.player.zoom = Math.round((G.derived.zoomMax || 50) * 0.55);

  // ---- UI
  UI.init(G);
  UI.setMode(P.get('mode') || 'village');
  UI.setRCI({ R: 0.7, C: 0.35, W: -0.25 });
  UI.minimap.setProvider(villageMinimap(mobs));
  let t0 = performance.now();
  UI.setSkillProvider({
    cooldown(id) { const h = [...id].reduce((a, c) => a + c.charCodeAt(0), 0); if (id === 'attack') return 0; const period = 4 + (h % 4); const tt = ((performance.now() - t0) / 1000 + h) % period; return tt < period * 0.5 ? 1 - tt / (period * 0.5) : 0; },
    remaining(id) { return this.cooldown(id) * 3; },
  });
  UI.onSetting((k, v) => console.log('[ui-test] setting', k, v));
  UI.onTitle({ newGame: () => UI.transition(() => UI.setMode('village')), continue: () => UI.transition(() => UI.setMode('village')), hasSave: true });
  UI.onMenu({ save: () => true, quit: () => UI.transition(() => UI.setMode('title')) });
  UI.lootLabel.onClick(id => { UI.toast(`Picked up ${id}`, { icon: 'gift' }); UI.lootLabel.remove(id); });
  UI.setBuildProvider(() => buildCatalog());

  // ---- loop hook
  const clock = { hour: S.day.hour };
  S.onUpdate((dt, t) => {
    mobs.forEach((m, i) => { m.position.y = .45 + Math.abs(Math.sin(t * 3 + i)) * .35; m.scale.set(1 + Math.sin(t * 6 + i) * .05, .75 - Math.sin(t * 6 + i) * .05, 1); });
    if (demo._stress) for (let k = 0; k < 3; k++) { const m = mobs[(Math.random() * mobs.length) | 0]; UI.float(m.position, String((Math.random() * 60) | 0), { kind: Math.random() < .12 ? 'crit' : 'dmg', yOff: 1 }); }
    if (demo._timeFlow) { S.day.hour = (S.day.hour + dt * 0.5) % 24; state.hour = S.day.hour; }
    UI.update(dt);
  });

  // ---- demo helpers
  window.UI = UI;
  const demo = window.demo = {
    G, UI, gen,
    title: () => UI.setMode('title'),
    village: () => UI.setMode('village'),
    dungeon: () => { UI.setMode('dungeon'); UI.setLocation('Mossy Burrow', 'B3F'); },
    inventory: () => { demo.fill(); UI.open('inventory'); },
    character: () => UI.open('character'),
    charinv: () => { demo.fill(); UI.open('character'); UI.open('inventory'); },
    skills: tree => UI.open('skills', { tree }),
    quests: () => UI.open('quests'),
    map: () => UI.open('map'),
    shop: () => { demo.fill(); UI.open('shop', { name: "Rosie's Treats", keeper: 'rosie', greeting: 'Welcome back, Chewy! The *strawberry daifuku* just came out of the oven~', items: shopStock(gen) }); },
    stash: () => { demo.fill(); for (let i = 0; i < 14; i++) state.stash[i * 3 % 60] = gen(); UI.open('stash'); },
    build: () => UI.open('build', buildCatalog()),
    menu: () => UI.open('menu'),
    settings: () => UI.open('menu', { view: 'settings' }),
    controls: () => UI.open('menu', { view: 'controls' }),
    close: () => UI.closeAll(),
    fill(n = 18) {
      if (demo._filled) return; demo._filled = true;
      const rar = ['normal', 'magic', 'magic', 'rare', 'unique', 'set', 'normal', 'magic', 'rare'];
      for (let i = 0; i < n; i++) { const j = state.inventory.findIndex(x => !x); if (j < 0) break; state.inventory[j] = gen(null, rar[i % rar.length]); }
      for (let i = 0; i < 2; i++) { const j = state.inventory.findIndex(x => !x); const g = gen('gem'); if (g && g.kind === 'gem') state.inventory[j] = g; }
      state.inventory[state.inventory.findIndex(x => !x)] = gen('hat', 'rare', null, 30);
      Events.emit('inv:changed');
    },
    toasts() {
      UI.toast('Quest updated: Blossom Delivery', { icon: 'scroll', color: '#ffcf4a' });
      setTimeout(() => UI.toast('+3 Sakura Petals', { icon: 'petal', color: '#ff8fb0' }), 250);
      setTimeout(() => UI.pickup(gen('charm', 'unique')), 500);
      setTimeout(() => UI.toast('Shadow learned a new trick!', { icon: 'shadowDog', color: '#8fd0ff', sub: 'Pack Bond +1' }), 750);
    },
    floats() {
      const m = mobs;
      UI.float(m[0].position, '42', { kind: 'dmg', yOff: 1.1 });
      setTimeout(() => UI.float(m[0].position, '37', { kind: 'dmg', yOff: 1.1 }), 90);
      setTimeout(() => UI.float(m[1].position, '128!', { kind: 'crit', yOff: 1.1 }), 120);
      UI.float(chewy.position, '+24', { kind: 'heal', yOff: 1 });
      UI.float(m[2].position, '+35 XP', { kind: 'xp', yOff: 1.1 });
      UI.float(m[3].position, '+12', { kind: 'coins', yOff: 1.1 });
      UI.float(m[2].position, 'miss', { kind: 'miss', yOff: 2.2 });
      UI.float(chewy.position, '-18', { kind: 'hurt', yOff: 1.9 });
      UI.float(m[3].position, 'Burning!', { kind: 'status', color: '#ff9a3c', yOff: 2.4 });
    },
    stress: on => { demo._stress = on !== false; },
    levelup: () => { state.player.lvl++; Events.emit('player:levelup', { lvl: state.player.lvl }); UI.banner('Level Up!', `Chewy is now level ${state.player.lvl}`, { style: 'levelup' }); },
    area: () => UI.banner('Mossy Burrow', 'Floor 3 · The mushrooms whisper…', { style: 'area', jp: '苔の巣穴' }),
    bossBanner: () => UI.banner('King Mochimaru', 'The Squishy Tyrant', { style: 'boss' }),
    questBanner: () => UI.banner('Quest Complete!', 'Blossom Delivery · +80 coins', { style: 'quest' }),
    dialogue: () => UI.dialogue({ speaker: 'Rosie', lines: ["Chewy! You're up! Shadow's been chasing *butterflies* all morning.", 'The village needs our help — want to plan some new houses together?'], choices: ["Let's build!", 'Maybe later…', 'Tell me about the Burrow'] }).then(i => UI.toast('You chose #' + i)),
    dialogueShadow: () => UI.dialogue({ speaker: 'Shadow', jp: 'シャドウ', lines: ['Woof! *Woof woof!* (Translation: there are mochi slimes in the Burrow and I want to bounce on them.)'] }),
    dialogueEmoji: () => UI.dialogue({ speaker: 'Mayor Tanuki', portrait: { emoji: '🦝', bg: 'radial-gradient(circle at 50% 30%, #fff, #ffe0a8)' }, lines: ['Ahem! Welcome to *Blossom Hollow*, young pup.'] }),
    target: () => UI.setTarget({ name: 'Grumpy Mochi', rarity: 'rare', hp: 64, hpMax: 150, mods: ['Extra Fast', 'Fire Enchanted'], level: 8 }),
    boss: () => { UI.setBoss({ name: 'King Mochimaru', title: 'The Squishy Tyrant', hp: 7600, hpMax: 10000 }); },
    hitBoss: () => { demo._bh = (demo._bh ?? 7600) - 900; UI.setBoss({ name: 'King Mochimaru', title: 'The Squishy Tyrant', hp: demo._bh, hpMax: 10000 }); },
    interact: (t = 'Talk to Rosie') => UI.setInteract(t),
    loot() {
      const names = [['Bone Sword', 'normal'], ['Sparkly Collar', 'magic'], ["Tanuki's Lucky Charm", 'unique'], ['Rain Boots of Zoom', 'rare'], ['Sakura Petal', 'normal'], ['Crystal Shard', 'magic'], ['Gi of the Pack', 'set'], ['Mittens', 'normal']];
      names.forEach(([n, r], i) => UI.lootLabel.add({ id: 'l' + i, name: n, rarity: r, worldPos: { x: 2 + (i % 3) * .5, y: 0, z: 1 + Math.floor(i / 3) * .3 } }));
    },
    alt: on => UI.lootLabel.setVisible(on !== false),
    transition: () => UI.transition(() => new Promise(r => setTimeout(r, 400))),
    lowLife: () => { state.player.life = Math.round((G.derived.lifeMax || 100) * .18); },
    hurt: () => { state.player.life = Math.max(1, (state.player.life ?? 100) - 25); },
    heal: () => { state.player.life = G.derived.lifeMax; state.player.zoom = G.derived.zoomMax; },
    coins: (n = 250) => actions.addCoins?.(n),
    time: h => { S.day.hour = h; state.hour = h; },
    flow: on => { demo._timeFlow = on !== false; },
    hover(sel, i = 0) {
      const e = document.querySelectorAll(sel)[i]; if (!e) return 'no element ' + sel;
      const r = e.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
      dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y }));
      e.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: x, clientY: y }));
      e.dispatchEvent(new MouseEvent('mouseenter', { clientX: x, clientY: y }));
      return [Math.round(x), Math.round(y)];
    },
    pos(sel, i = 0) { const e = document.querySelectorAll(sel)[i]; if (!e) return null; const r = e.getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; },
    all() { demo.toasts(); demo.floats(); demo.target(); demo.interact(); demo.loot(); },
  };
  S.ready();
}

// ------------------------------------------------------------------ helpers
function mul(seed) { let a = seed; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function listSkills() {
  const S = R('skills'); const src = S.SKILLS || S.skills || S.SKILL_DEFS;
  if (!src) return [{ id: 'chomp', tree: 'bone', row: 0 }, { id: 'boneToss', tree: 'bone', row: 1 }, { id: 'fetch', tree: 'fetch', row: 0 }];
  return Array.isArray(src) ? src : Object.entries(src).map(([id, d]) => ({ id, ...d }));
}

// item generator: real loot module when present, else a mock
function makeGen() {
  const I = R('items');
  let uid = 1000;
  const rnd = mul(42);
  if (I.generateItem) {
    let seed = 11;
    return function gen(slot, rarity, wtype, reqLvl) {
      const ilvl = reqLvl || 4 + ((rnd() * 10) | 0);
      if (slot === 'gem' && I.makeGem) return I.makeGem(I.GEM_TYPES[(rnd() * I.GEM_TYPES.length) | 0], (rnd() * 2) | 0);
      try { const it = I.generateItem({ ilvl, slot: slot || undefined, wtype: wtype || undefined, rarity: rarity || undefined, rng: mul(seed++) }); if (reqLvl) it.req = { ...(it.req || {}), lvl: reqLvl }; return it; }
      catch (e) { console.warn('[ui-test] generateItem', e.message); return I.generateItem({ ilvl, rng: mul(seed++) }); }
    };
  }
  const BASES = {
    weapon: [['boneSword', 'Bone Sword', 'sword'], ['bigBone', 'Big Ol\' Bone', 'sword'], ['tennisBall', 'Red Tennis Ball', 'ball']],
    hat: [['strawHat', 'Straw Hat'], ['beanie', 'Pom Beanie']], outfit: [['dojoGi', 'Dojo Gi'], ['raincoat', 'Raincoat']], collar: [['bellCollar', 'Bell Collar']],
    charm: [['omamori', 'Omamori'], ['acorn', 'Lucky Acorn']], boots: [['rainBoots', 'Rain Boots']], paws: [['mittens', 'Mittens']],
  };
  const AFF = [['str', 'Strength'], ['dex', 'Dexterity'], ['vit', 'Vitality'], ['lifeMax', 'Life'], ['crit', '% Crit Chance'], ['mf', '% Magic Find'], ['resFire', '% Fire Resist'], ['moveSpeed', '% Move Speed'], ['zoomMax', 'Zoom'], ['dmgPct', '% Damage']];
  const UNI = { charm: "Tanuki's Lucky Charm", hat: 'Crown of the Mochi King', weapon: 'Excalibone', collar: 'Collar of Good Boys', boots: 'Puddle Jumpers', outfit: 'Gi of the Pack', paws: 'Beans of Fury' };
  const PRE = ['Sparkly', 'Fluffy', 'Zippy', 'Cozy', 'Brave', 'Sleepy'], SUF = ['of Zoom', 'of Treats', 'of the Pack', 'of Naps', 'of Blossoms'];
  return function gen(slot, rarity, wtype, reqLvl) {
    const slots = Object.keys(BASES);
    slot = slot || slots[(rnd() * slots.length) | 0];
    let bl = BASES[slot]; if (wtype) bl = bl.filter(b => b[2] === wtype);
    const [base, bname, wt] = bl[(rnd() * bl.length) | 0];
    rarity = rarity || 'normal';
    const n = { normal: 0, magic: 2, rare: 4, unique: 5, set: 4 }[rarity];
    const affixes = [];
    for (let i = 0; i < n; i++) { const [stat, name] = AFF[(rnd() * AFF.length) | 0]; const value = 1 + ((rnd() * 15) | 0); affixes.push({ id: stat + i, stat, value, text: `+${value} ${name}` }); }
    const name = rarity === 'unique' ? UNI[slot] : rarity === 'set' ? 'Pack Leader\'s ' + bname : rarity === 'rare' ? `${PRE[(rnd() * 6) | 0]} ${['Whisker', 'Blossom', 'Moon', 'Paw'][(rnd() * 4) | 0]}` : rarity === 'magic' ? `${PRE[(rnd() * 6) | 0]} ${bname}` : bname;
    const it = { uid: 'u' + (uid++), kind: 'gear', base, slot, rarity, name, ilvl: 5 + ((rnd() * 10) | 0), req: { lvl: reqLvl || 1 + ((rnd() * 6) | 0) }, affixes, sockets: rarity === 'normal' && rnd() < .4 ? 2 : 0, gems: [], value: 20 + ((rnd() * 200) | 0), icon: { shape: slot, colors: [] } };
    if (slot === 'weapon') { it.wtype = wt; it.dmg = [3 + ((rnd() * 4) | 0), 9 + ((rnd() * 8) | 0)]; it.aspd = wt === 'ball' ? 1.6 : 1.25; }
    else it.def = 2 + ((rnd() * 12) | 0);
    if (rarity === 'unique') it.flavor = 'Smells faintly of bacon.';
    return it;
  };
}
function shopStock(gen) {
  const I = R('items');
  if (I.shopStock) return [{ potion: 'heart' }, { potion: 'zoom' }, { potion: 'rejuv' }, ...I.shopStock(9, 3)];
  return [{ potion: 'heart', price: 25, name: 'Heart Potion' }, { potion: 'zoom', price: 30, name: 'Zoom Potion' }, { potion: 'rejuv', price: 120, name: 'Rejuv Potion' },
    { item: gen('hat', 'magic'), price: 140 }, { item: gen('collar', 'normal'), price: 60 }, { item: gen('weapon', 'rare'), price: 480 }, { item: gen('boots', 'magic'), price: 210 },
    { item: gen('charm', 'rare'), price: 2600 }, { item: gen('outfit', 'normal'), price: 90 }, { item: gen('paws', 'magic'), price: 175 }];
}
function buildCatalog() {
  const it = (id, name, cost, desc, extra = {}) => ({ id, name, cost, desc, ...extra });
  return {
    categories: [
      { id: 'home', name: 'Homes', items: [it('cottage', 'Cozy Cottage', { coins: 120, wood: 20 }, 'A snug home for one villager.', { size: [2, 2], zone: 'R' }), it('treehouse', 'Treehouse', { coins: 300, wood: 45 }, 'Villagers love the view!', { size: [2, 2], zone: 'R' }), it('machiya', 'Machiya House', { coins: 520, wood: 40, stone: 30 }, 'A tall townhouse for two families.', { size: [2, 3], zone: 'R' }), it('manor', 'Blossom Manor', { coins: 1600, wood: 90, stone: 70, crystal: 5 }, 'The fanciest home in town.', { size: [3, 3], locked: 'Village Lv 4' })] },
      { id: 'shop', name: 'Shops', items: [it('bakery', 'Mochi Bakery', { coins: 240, wood: 25 }, 'Fresh mochi every morning.', { size: [2, 2], zone: 'C' }), it('teahouse', 'Tea House', { coins: 380, wood: 30, stone: 10 }, 'Warm tea, warmer friends.', { size: [2, 2], zone: 'C' }), it('ramen', 'Ramen Stand', { coins: 460, wood: 35, lantern: 2 }, 'Slurp!', { size: [2, 2], zone: 'C' }), it('market', 'Petal Market', { coins: 900, wood: 60, stone: 40 }, 'Sells rare goods.', { size: [3, 2], locked: 'Needs 8 villagers' })] },
      { id: 'craft', name: 'Crafts', items: [it('workshop', 'Workshop', { coins: 200, wood: 30 }, 'Turns wood into planks.', { size: [2, 2], zone: 'W' }), it('forge', 'Tiny Forge', { coins: 450, stone: 40 }, 'Craft gear for the Burrow.', { size: [2, 2], zone: 'W' }), it('loom', 'Silk Loom', { coins: 380, wood: 20, silk: 4 }, 'Weave outfits.', { size: [2, 1], zone: 'W' })] },
      { id: 'service', name: 'Services', items: [it('well', 'Stone Well', { coins: 80, stone: 12 }, 'Water for nearby homes.', { size: [1, 1], effect: 'Water ○ radius 5' }), it('clinic', 'Paw Clinic', { coins: 600, wood: 30, stone: 30 }, 'Keeps villagers healthy.', { size: [2, 2], effect: 'Health ○ radius 8' }), it('school', 'Little School', { coins: 700, wood: 50 }, 'Learning is fun!', { size: [3, 2] })] },
      { id: 'decor', name: 'Decor', items: [it('sakura', 'Sakura Tree', { coins: 40 }, 'Petals drift on the breeze.', { size: [1, 1], effect: 'Joy +2' }), it('lanternPost', 'Stone Lantern', { coins: 60, stone: 6 }, 'Glows at night.', { size: [1, 1], effect: 'Light ○' }), it('bench', 'Garden Bench', { coins: 30, wood: 6 }, 'A nice place to sit.', { size: [1, 1] }), it('koi', 'Koi Pond', { coins: 220, stone: 20 }, 'Graceful koi!', { size: [2, 2], effect: 'Joy +5' }), it('flowers', 'Flower Bed', { coins: 20 }, 'Pretty!', { size: [1, 1] }), it('bridge', 'Red Bridge', { coins: 180, wood: 30 }, 'Crosses water.', { size: [1, 3] })] },
      { id: 'special', name: 'Special', items: [it('torii', 'Torii Gate', { coins: 500, wood: 40 }, 'A gateway of good fortune.', { size: [2, 1], effect: 'Joy +10' }), it('shrine', 'Blossom Shrine', { coins: 1500, stone: 60, crystal: 8 }, 'Blessings for all!', { size: [3, 3], locked: 'Complete "Spirit of Spring"' })] },
    ],
    onSelect: id => UI.toast('Placing ' + id, { icon: 'hammer' }),
    onZone: z => UI.toast('Zone tool ' + z, { icon: 'home' }),
    onBulldoze: () => UI.toast('Bulldoze mode', { icon: 'shovel', color: '#ff8f7a' }),
  };
}
// cute stylised village minimap for the demo
function villageMinimap(mobs) {
  return {
    draw(g, size, pp, opt = {}) {
      const s = (opt.big ? 7 : 5) * (opt.zoom || 1), cx = size / 2 - pp.x * s, cz = size / 2 - pp.z * s;
      g.fillStyle = '#a8dc8c'; g.fillRect(0, 0, size, size);
      g.fillStyle = 'rgba(255,255,255,.18)'; for (let i = 0; i < 40; i++) { g.beginPath(); g.arc((i * 97) % size, (i * 57) % size, 6 + (i % 5), 0, 7); g.fill(); }
      g.fillStyle = '#7cc8ff'; g.strokeStyle = '#4a2c2a'; g.lineWidth = 2; g.beginPath(); g.ellipse(cx - 6 * s, cz + 5 * s, 4 * s, 4 * s, 0, 0, 7); g.fill(); g.stroke();
      g.strokeStyle = '#f3dfb8'; g.lineWidth = 1.6 * s; g.lineCap = 'round'; g.beginPath(); g.moveTo(cx - 30 * s, cz + 2 * s); g.quadraticCurveTo(cx, cz - 3 * s, cx + 30 * s, cz + 6 * s); g.moveTo(cx + 2 * s, cz - 30 * s); g.lineTo(cx + 1 * s, cz + 30 * s); g.stroke();
      const house = (x, z, c) => { g.fillStyle = c; g.strokeStyle = '#4a2c2a'; g.lineWidth = 2; g.beginPath(); g.roundRect(cx + x * s - 1.2 * s, cz + z * s - 1.2 * s, 2.4 * s, 2.4 * s, 3); g.fill(); g.stroke(); };
      house(6, -6, '#d86a4a'); house(-8, -7, '#5d6f9e'); house(9, 7, '#3f8f8a'); house(-12, 8, '#8a5a8a'); house(14, -2, '#8fd0ff');
      g.fillStyle = '#ffcf4a'; g.beginPath(); g.arc(cx + 14 * s, cz - 2 * s - 3 * s, 3, 0, 7); g.fill();
      for (const m of mobs) { g.fillStyle = '#ff6a7a'; g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.beginPath(); g.arc(cx + m.position.x * s, cz + m.position.z * s, 3, 0, 7); g.fill(); g.stroke(); }
    },
  };
}

// ------------------------------------------------------------------ mock rpg layer (only if src/rpg is missing)
function mockState() {
  return {
    version: 1,
    player: { name: 'Chewy', lvl: 7, xp: 420, stats: { str: 14, dex: 12, vit: 15, ene: 10 }, statPts: 3, skillPts: 4, skills: {}, hotbar: ['attack', 'chomp', null, null, null, null], life: null, zoom: null, activeWeapon: 0 },
    coins: 120, materials: { wood: 20, stone: 10, petal: 0, crystal: 0, bone: 0, mochi: 0, silk: 0, lantern: 0 }, potions: { heart: 3, zoom: 2, rejuv: 0 },
    inventory: Array(40).fill(null), equipment: { weapon: null, weaponAlt: null, hat: null, outfit: null, collar: null, charm1: null, charm2: null, boots: null, paws: null },
    stash: Array(60).fill(null), quests: { active: [], done: [] }, friends: {}, village: {}, dungeon: { deepest: 0, waypoints: [1] }, day: 3, hour: 8.5, flags: {},
  };
}
function mockStats(st) {
  const p = st.player, s = { ...p.stats };
  const eq = Object.values(st.equipment).filter(Boolean);
  const add = {}; for (const it of eq) for (const a of it.affixes || []) add[a.stat] = (add[a.stat] || 0) + a.value;
  for (const k of ['str', 'dex', 'vit', 'ene']) s[k] += add[k] || 0;
  const w = st.equipment[p.activeWeapon ? 'weaponAlt' : 'weapon'];
  const def = eq.reduce((a, it) => a + (it.def || 0), 0);
  return { ...s, lifeMax: 60 + s.vit * 4 + (add.lifeMax || 0), zoomMax: 30 + s.ene * 3 + (add.zoomMax || 0), lifeRegen: 1 + s.vit * .05, zoomRegen: 1.5 + s.ene * .08,
    dmgMin: (w?.dmg?.[0] || 1) + Math.floor(s.str / 5), dmgMax: (w?.dmg?.[1] || 3) + Math.floor(s.str / 4), dmgPct: add.dmgPct || 0, aspd: w?.aspd || 1.2, atkSpeed: 0, castSpeed: 0, moveSpeed: add.moveSpeed || 0,
    crit: 5 + (add.crit || 0) + s.dex * .1, critDmg: 50, def: def + Math.floor(s.dex / 4), block: 5 + s.dex * .1, resFire: add.resFire || 12, resFrost: 8, resZap: 0, resStink: -10, lifeSteal: 0, zoomSteal: 0,
    fireDmg: [2, 5], frostDmg: [0, 0], zapDmg: [0, 0], stinkDmg: [0, 0], mf: add.mf || 0, gf: 10, thorns: 0, allSkills: 0, treeSkills: { bone: 0, fetch: 0, spirit: 0 }, xpBonus: 0, pierce: 0, cdr: 0, lifeOnKill: 2, shadowDmg: 10, shadowLife: 15, weaponType: w?.wtype || 'sword' };
}
function mockActions(G, compute) {
  const st = G.state, E = Events;
  const get = a => (a.c === 'inv' ? st.inventory[a.i] : a.c === 'stash' ? st.stash[a.i] : st.equipment[a.i]);
  const set = (a, v) => { if (a.c === 'inv') st.inventory[a.i] = v; else if (a.c === 'stash') st.stash[a.i] = v; else st.equipment[a.i] = v; };
  const slotsFor = it => (it.slot === 'weapon' ? ['weapon', 'weaponAlt'] : it.slot === 'charm' ? ['charm1', 'charm2'] : [it.slot]);
  const A = {
    equip(i) { const it = st.inventory[i]; if (!it || it.kind !== 'gear') return false; const sl = slotsFor(it); const tgt = it.slot === 'weapon' ? (st.player.activeWeapon ? 'weaponAlt' : 'weapon') : sl.find(s => !st.equipment[s]) || sl[0]; st.inventory[i] = st.equipment[tgt]; st.equipment[tgt] = it; compute(); E.emit('inv:changed'); E.emit('equip:changed'); return true; },
    unequip(slot) { const it = st.equipment[slot]; if (!it) return false; const j = st.inventory.findIndex(x => !x); if (j < 0) return false; st.inventory[j] = it; st.equipment[slot] = null; compute(); E.emit('inv:changed'); E.emit('equip:changed'); return true; },
    swapWeapons() { st.player.activeWeapon = st.player.activeWeapon ? 0 : 1; compute(); E.emit('equip:changed'); },
    moveItem(from, to) { const a = get(from), b = get(to); if (to.c === 'equip' && a && !slotsFor(a).includes(to.i)) return false; if (from.c === 'equip' && b && !slotsFor(b).includes(from.i)) return false; set(from, b); set(to, a); compute(); E.emit('inv:changed'); E.emit('equip:changed'); return true; },
    dropItem(from) { const it = get(from); if (!it) return false; set(from, null); E.emit('item:drop', { item: it }); E.emit('inv:changed'); UI.lootLabel.add({ id: it.uid, name: it.name, rarity: it.rarity, worldPos: { x: G.player.pos.x + 1, y: 0, z: G.player.pos.z + .5 } }); return true; },
    pickup(item) { const j = st.inventory.findIndex(x => !x); if (j < 0) return false; st.inventory[j] = item; E.emit('item:pickup', { item }); E.emit('inv:changed'); return true; },
    usePotion(k) { if (!st.potions[k]) return false; st.potions[k]--; if (k === 'heart') st.player.life = G.derived.lifeMax; else st.player.zoom = G.derived.zoomMax; E.emit('potions:changed'); return true; },
    sellItem(from) { const it = get(from); if (!it) return false; set(from, null); st.coins += Math.max(1, Math.floor(it.value * .35)); E.emit('coins:changed'); E.emit('inv:changed'); return true; },
    buyItem(item, price) { if (st.coins < price) return false; const j = st.inventory.findIndex(x => !x); if (j < 0) return false; st.coins -= price; st.inventory[j] = { ...item, uid: item.uid + 'b' + Date.now() }; E.emit('coins:changed'); E.emit('inv:changed'); return true; },
    learnSkill(id) { if (st.player.skillPts <= 0) return false; st.player.skillPts--; st.player.skills[id] = (st.player.skills[id] || 0) + 1; compute(); E.emit('skill:learned', { id, lvl: st.player.skills[id] }); return true; },
    addStat(k) { if (st.player.statPts <= 0) return false; st.player.statPts--; st.player.stats[k]++; compute(); return true; },
    setHotbar(slot, id) { st.player.hotbar[slot] = id; E.emit('stats:changed'); },
    addXp(n) { st.player.xp += n; },
    addCoins(n) { st.coins += n; E.emit('coins:changed'); },
    spendCoins(n) { if (st.coins < n) return false; st.coins -= n; E.emit('coins:changed'); return true; },
    addMaterial(k, n) { st.materials[k] = (st.materials[k] || 0) + n; E.emit('materials:changed'); },
    hasMaterials(c) { return Object.entries(c).every(([k, v]) => (k === 'coins' ? st.coins : st.materials[k] || 0) >= v); },
    spendMaterials(c) { if (!A.hasMaterials(c)) return false; for (const [k, v] of Object.entries(c)) { if (k === 'coins') st.coins -= v; else st.materials[k] -= v; } E.emit('materials:changed'); return true; },
    recompute: compute,
  };
  return A;
}
