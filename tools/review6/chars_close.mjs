import { open } from './lib.mjs';
// Individual close-ups of the main cast + a few villagers (Pokémon-proportion check), and a walk pose.
for (const [who, act] of [['chewy', ''], ['rosie', ''], ['kuma', ''], ['usagi', ''], ['kero', ''], ['chewy', '&walk=1'], ['chewy', '&act=swing']]) {
  const s = await open(`/?test=chars&only=${who}&dist=5${act}`, { wait: 2500 });
  await s.snap(`08_close_${who}${act.replace(/[&=]/g, '_')}`);
  await s.close();
}
// Shadow lives in the lineup only as a quadruped next to Chewy; lineup at dist 7 centred.
const s = await open('/?test=chars&dist=8', { wait: 2500 });
await s.snap('08_lineup_d8');
await s.close();
