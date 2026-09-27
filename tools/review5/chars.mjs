import { open } from './lib.mjs';
for (const [url, name, wait] of [['/?test=chars', '07_chars', 3500], ['/?test=portraits', '07b_portraits', 3500], ['/?test=monsters', '07c_monsters', 3500], ['/?test=buildings', '07d_buildings', 4000]]) {
  const s = await open(url, { wait });
  await s.snap(name);
  await s.close();
}
