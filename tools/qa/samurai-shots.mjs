// Review sheets for Chewy the samurai (docs/HEROES.md §8): runs tools/qa/pose-lab.mjs for each look and writes the
// contact sheets to $SHOT_DIR (default: the session scratchpad's samurai/ folder).
//   node tools/qa/samurai-shots.mjs [names...]      names: combo combo-far chomp chomp3 zoom zoom3 kiai kiai3 whirl whirl3 dig dig3
//                                                   storm storm3 pack treat treat3 howl howl3 parry moon flourish saya zoom-noto katana
// Each sheet is <name>.png; the frames are frozen at game-time milliseconds after the cast (see pose-lab's --ms).
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.env.SHOT_DIR || 'C:/Users/there/AppData/Local/Temp/claude/D--projects-chewy-life-3d/91c675c9-ac30-57d0-b5d5-725868e188fd/scratchpad/samurai';
fs.mkdirSync(OUT, { recursive: true });
const RUNS = {
  // the basic combo up close: each cut's wind-up, strike and trail
  combo: ['--cast', 'attack', '--repeat', '3', '--ms', '200,330,350,400', '--view', 'right', '--dist', '10', '--crop', '700'],
  // the same from the game's camera distance (~20 m): does it read?
  'combo-far': ['--cast', 'attack', '--repeat', '3', '--ms', '350,390', '--view', 'right', '--dist', '22', '--crop', '700', '--cols', '6'],
  chomp: ['--cast', 'chomp', '--ms', '150,300,340,380,460', '--view', 'right', '--dist', '14', '--crop', '900', '--cols', '5'],
  chomp3: ['--cast', 'chomp', '--charge', '3', '--perks', 'all', '--ms', '60,140,220,320,450', '--view', 'right', '--dist', '16', '--crop', '1000', '--cols', '5'],
  zoom: ['--cast', 'zoom', '--ms', '80,200,500,640,760', '--view', 'right', '--dist', '14', '--crop', '1000', '--cols', '5'],
  zoom3: ['--cast', 'zoom', '--charge', '3', '--perks', 'all', '--ms', '150,400,900,1150,1400', '--view', 'right', '--dist', '18', '--crop', '1100', '--cols', '5'],
  kiai: ['--cast', 'woof', '--ms', '100,150,200,300', '--view', 'right', '--dist', '14', '--crop', '900'],
  kiai3: ['--cast', 'woof', '--charge', '3', '--perks', 'all', '--ms', '40,120,220,340', '--view', 'right', '--dist', '18', '--crop', '1100'],
  // phase 2: Whirlwind Stance, Helmet Splitter, Sakura Storm, Pack Call, Onigiri Toss, War Banner Howl, Moonlit Blades
  whirl: ['--cast', 'whirl', '--hold', '--ms', '100,300,600,900', '--view', 'right', '--dist', '12', '--crop', '900'],
  whirl3: ['--cast', 'whirl', '--charge', '3', '--perks', 'all', '--hold', '--ms', '200,500,900,1300', '--view', 'right', '--dist', '14', '--crop', '1000'],
  dig: ['--cast', 'dig', '--ms', '150,330,500,600,640,800', '--view', 'right', '--dist', '12', '--crop', '900', '--cols', '6'],
  dig3: ['--cast', 'dig', '--charge', '3', '--perks', 'all', '--ms', '300,470,520,800,1300', '--view', 'right', '--dist', '16', '--crop', '1000', '--cols', '5'],
  storm: ['--cast', 'bonestorm', '--ms', '200,400,1000,2000', '--view', 'right', '--dist', '12', '--crop', '900'],
  storm3: ['--cast', 'bonestorm', '--charge', '3', '--perks', 'all', '--ms', '300,1200', '--view', 'right', '--dist', '14', '--crop', '1000', '--cols', '2'],
  pack: ['--cast', 'packcall', '--ms', '150,300,900,1600', '--view', 'right', '--dist', '9', '--crop', '800'],
  treat: ['--cast', 'treat', '--ms', '220,450,640,760', '--view', 'right', '--dist', '12', '--crop', '900'],
  treat3: ['--cast', 'treat', '--charge', '3', '--perks', 'all', '--ms', '300,700,1200,2000', '--view', 'right', '--dist', '14', '--crop', '1000'],
  howl: ['--cast', 'howl', '--ms', '140,300,800,3000', '--view', 'right', '--dist', '9', '--crop', '800'],
  howl3: ['--cast', 'howl', '--charge', '3', '--perks', 'all', '--ms', '300,900,2500', '--view', 'right', '--dist', '12', '--crop', '900', '--cols', '3'],
  // Unbending Stance's parry on a block (the flick of the blade, a glint)
  parry: ['--act', 'parry', '--u', '0.2,0.45,0.8', '--view', '3q', '--dist', '6', '--cols', '3'],
  moon: ['--cast', 'moonhowl', '--ms', '150,260,420,700,1000', '--view', 'right', '--dist', '14', '--crop', '1000', '--cols', '5'],
  // the end of a combo: the noto into the samurai model's saya, and the chiburi flick (a model without one: --qs chewymodel=toy)
  flourish: ['--act', 'chiburi,noto', '--u', '0.3,0.45,0.75', '--view', '3q', '--dist', '7', '--cols', '3'],
  saya: ['--cast', 'attack', '--ms', '1150,1350,1550,1900', '--view', '3q', '--dist', '7', '--crop', '700'],
  // Flash Draw, then the noto that slides the katana home into the saya at his hip as the cut flashes along the path
  'zoom-noto': ['--cast', 'zoom', '--ms', '200,500,650,800,950,1150', '--view', '3q', '--dist', '10', '--crop', '900', '--cols', '6'],
  // the Bone Katana in the paw and its two-handed guard, close
  katana: ['--act', 'cut1,cut3', '--u', '0.32,0.5', '--view', '3q,front', '--dist', '5', '--cols', '4'],
};
const want = process.argv.slice(2).filter(a => !a.startsWith('--'));
for (const [name, args] of Object.entries(RUNS)) {
  if (want.length && !want.includes(name)) continue;
  console.log('==', name);
  try {
    const out = execFileSync(process.execPath, [path.join(dir, 'pose-lab.mjs'), ...args, '--tag', name], { encoding: 'utf8', env: { ...process.env, SHOT_DIR: OUT }, timeout: 10 * 60 * 1000 });
    console.log(out.trim().split('\n').slice(-1)[0]);
  } catch (e) { console.log('failed', name, e.message.split('\n')[0]); }
}
