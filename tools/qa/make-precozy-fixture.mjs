// Writes tools/qa/fixtures/precozy-0.5.1.json: a save made by Pawhaven 0.5.1 (dc43b27, before the cozy path) through the
// game's own save path (G.save() → localStorage), a few hours into a game: Moka and Poe in the pack, the first quests
// done, Takemori saved and Bamboo's dungeon cleared by hand, coins, materials, levels. The input for the old-save
// migration check (s31 f: docs/COZY.md §9; ROADMAP CZ-12). Run it against a server that serves 0.5.1:
//   git archive dc43b27 | tar -x -C <dir>; (link node_modules); npx vite --port 5188 in <dir>
//   BASE=http://localhost:5188 node tools/qa/make-precozy-fixture.mjs
import fs from 'node:fs';
import { launch, boot, sleep } from './lib.mjs';

const { browser, page, errors } = await launch({ w: 1280, h: 720 });
await boot(page, 'fresh&nointro&noaudio&villagesaved=bamboo');
const res = await page.evaluate(async () => {
  const G = window.G, st = G.state;
  G.story.markTalk('rosie');
  await new Promise(r => setTimeout(r, 3000));
  st.flags.mokaJoined = true; G.actions.prepareJoin?.('moka');
  G.heroes.join?.('poe');
  for (const id of ['moka', 'poe']) if (st.heroes?.[id]?.player) st.heroes[id].player.lvl = id === 'moka' ? 7 : 6;
  st.player.lvl = 9; st.coins = 1840;
  for (const k of Object.keys(st.materials)) st.materials[k] = 25;
  // burrow1 and the King done by hand (the Burrow's own state)
  for (const id of ['burrow1']) { const q = st.quests.active.find(x => x.id === id); if (q) { st.quests.active.splice(st.quests.active.indexOf(q), 1); st.quests.done.push(id); } }
  if (!st.quests.active.some(q => q.id === 'homes') && !st.quests.done.includes('homes')) st.quests.active.push({ id: 'homes', step: 0, prog: 0 });
  st.dungeon.deepest = Math.max(st.dungeon.deepest || 0, 6);
  if (st.zones?.bamboo) { st.zones.bamboo.unlocked = true; st.zones.bamboo.dungeon = { ...(st.zones.bamboo.dungeon || {}), cleared: 1 }; }
  G.save();
  const out = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/^chewy3d|pawhaven/i.test(k)) out[k] = localStorage.getItem(k); }
  return { version: document.title, keys: Object.keys(out), out, hasCozy: !!st.cozy, zones: Object.fromEntries(Object.entries(st.zones || {}).map(([z, v]) => [z, v.village])), heroes: Object.keys(st.heroes || {}), quests: { active: st.quests.active.map(q => q.id), done: st.quests.done } };
});
console.log(JSON.stringify({ ...res, out: undefined }, null, 1));
if (res.hasCozy) { console.log('FAIL: this server already has the cozy path (state.cozy): serve 0.5.1'); process.exit(1); }
fs.writeFileSync(new URL('./fixtures/precozy-0.5.1.json', import.meta.url), JSON.stringify({ made: 'Pawhaven 0.5.1 (dc43b27)', storage: res.out }, null, 1) + '\n');
console.log('wrote tools/qa/fixtures/precozy-0.5.1.json', errors.length ? `(page errors: ${errors.slice(0, 2).join(' | ')})` : '');
await sleep(page, 100);
await browser.close();
