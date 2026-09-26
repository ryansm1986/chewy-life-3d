import { open } from './lib.mjs';
for (const hour of [21.5, 11]) {
  const s = await open(`/?fresh&nointro&hour=${hour}`, { wait: 3000 });
  console.log('hour', hour, JSON.stringify(await s.fps(3000)), JSON.stringify(await s.stats()));
  await s.close();
}
