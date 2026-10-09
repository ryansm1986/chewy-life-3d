// The homestead (docs/HOMESTEAD.md): farming, fishing and cooking on top of the village. installLife(G, village)
// builds G.life = { tools, garden, fishing, kitchen, update(dt), onNewDay(day), onTalk(npc, say), markerFor(id),
// teach(recipe), onRequestDone(giver) } and the Seed Stall. Called once from game.js after the village sim, the story
// and the services exist.
import * as THREE from 'three';
import { Events } from '../core/events.js';
import { instantiate } from '../world/buildings/kit.js';
import { SEED_STALL } from '../world/layout.js';
import { PANTRY, CROPS, CROP_IDS } from './pantry.js';
import { Tools } from './tools.js';
import { Garden } from './garden.js';
import { Fishing } from './fishing.js';
import { installFishingSocial } from './fishSocial.js';
import { Kitchen } from './kitchen.js';
import { installCookSocial } from './cookSocial.js';
import { seedStallTemplate } from './gardenModels.js';
import { pantryIcon } from './pantryIcons.js';

const STARTER = { turnipSeed: 5, carrotSeed: 3 };

export function installLife(G, village) {
  const tools = new Tools(G);
  const garden = new Garden(G, village, tools);
  const fishing = new Fishing(G, tools);
  village.interactables.push(fishing.inter); // (once: the village's interactables stay stable, s1)
  fishing.world = village;
  const social = installFishingSocial(G, fishing);
  const kitchen = new Kitchen(G, tools); // (eating feedback, Well Fed, the campfires, the Cook panel's cooking)
  const cooks = installCookSocial(G, kitchen);
  const life = G.life = {
    tools, garden, fishing, kitchen,
    update(dt) {
      if (G.mode === 'village') garden.update(dt); else if (tools.cur?.anywhere) tools.update(dt); else if (tools.busy) tools.cancel(); // (a gather in a zone: cozy/scavengeWorld.js)
      fishing.update(dt); kitchen.update(dt);
      G.cozy?.scav?.update?.(dt); // scavenging: the day's refill, Shadow's nose, the dig (docs/COZY.md §7)
    },
    onNewDay(day) { social.onNewDay(day); return garden.onNewDay(day); },
    onTalk: async (npc, say) => { await social.onTalk(npc, say); await cooks.onTalk(npc, say); },
    markerFor: id => social.markerFor(id) || cooks.markerFor(id),
    teach: (id, o) => cooks.teach(id, o),
    onRequestDone: giver => cooks.onRequestDone(giver),
  };
  addSeedStall(G, village);
  return life;
}

// ------------------------------------------------------------------ Usagi's Seed Stall (South Meadows)
function addSeedStall(G, village) {
  const S = SEED_STALL, inst = instantiate(seedStallTemplate());
  const y = village.heightAt(S.x, S.z);
  inst.group.position.set(S.x, y, S.z); inst.group.rotation.y = S.rot; inst.group.name = 'seedStall';
  inst.group.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  village.scene.add(inst.group);
  const c = Math.cos(S.rot), s = Math.sin(S.rot); // local +z (the front) → world
  const fx = s, fz = c;
  village.collision?.addCircle(S.x, S.z, 0.72, 'stall'); // (not a sim building: s5's collider audit counts those)
  village.veg?.clearRect?.(S.x - 1.4, S.z - 1.4, S.x + 1.4, S.z + 1.4, 0.2);
  const pos = new THREE.Vector3(S.x + fx * 1.1, y, S.z + fz * 1.1);
  village.interactables.push({ pos, radius: 1.2, label: "Usagi's Seed Stall", onInteract: () => G.openSeedStall() });
  G.seedStall = { pos, group: inst.group };

  G.seedStock = () => {
    const rank = G.sim?.stats?.rank || 1;
    return CROP_IDS.filter(c => CROPS[c].rank <= rank).map(c => ({ id: c + 'Seed', price: PANTRY[c + 'Seed'].price }));
  };
  G.openSeedStall = async () => {
    const flags = G.state.flags || (G.state.flags = {});
    if (!flags.starterSeeds && G.ui?.dialogue) { // Usagi's starter pack, once
      flags.starterSeeds = true;
      G.player.controlLocked = true;
      try {
        await G.ui.dialogue({ speaker: 'Usagi', portrait: G.portrait?.('usagi'), lines: ['Hop hop! Are you starting a garden, Chewy? Oh, how wonderful!', 'Here — a starter pack, on the house! Turnips are quick, carrots are crunchy. Water them every day and they grow overnight~'] });
      } finally { G.player.controlLocked = false; G.interactCooldown = performance.now() + 300; }
      for (const [id, n] of Object.entries(STARTER)) G.actions.addPantry(id, n, { src: 'gift' });
      G.ui?.pantryGain?.('turnipSeed', STARTER.turnipSeed, { first: true });
      setTimeout(() => G.ui?.pantryGain?.('carrotSeed', STARTER.carrotSeed, { first: true }), 350);
      Events.emit('sfx', 'ui_quest');
      setTimeout(() => G.story?.start?.('firstSprouts'), 1600); // (Usagi's "First Sprouts" → Rosie's "Taste Test")
    }
    if (!G.ui?.open) return;
    const rank = G.sim?.stats?.rank || 1, next = CROP_IDS.find(c => CROPS[c].rank > rank);
    G.ui.open('shop', {
      name: "Usagi's Seed Stall", jp: 'たね屋', keeper: 'usagi', portrait: G.portrait?.('usagi'),
      greeting: next ? `Fresh seeds, hop hop! When the village grows I'll get ${PANTRY[next].name.toLowerCase()} seeds too~` : 'Every seed on the island, right here! What shall we grow today?',
      pantry: G.seedStock(), potions: [], stock: [], sellKinds: ['crop'], buyer: 'usagi', noBagSell: true,
      thanks: ['Grow big and strong, little seeds!', 'Water them every day~', 'Happy planting, Chewy!', 'Hop hop, thank you!'],
      onBuyPantry: (id, price, n) => G.actions.buyPantry(id, price, n),
    });
    Events.emit('sfx', 'ui_open');
  };
}
