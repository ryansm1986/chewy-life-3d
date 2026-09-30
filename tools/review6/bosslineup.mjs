import { open } from './lib.mjs';
for (const id of ['nineTails', 'kasaLord', 'oniChef', 'mochiKing']) {
  const s = await open(`/?test=monsters&only=${id}&dist=9&move=1`, { wait: 2500 });
  await s.snap('32_boss_model_' + id);
  await s.close();
}
