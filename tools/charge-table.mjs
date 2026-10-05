// Prints docs/CHARGE.md §7 (the charge perk table) from src/rpg/charge.js, so the doc's numbers are the game's numbers.
//   node tools/charge-table.mjs [--lvl 10] > table.md
// For every active skill: the charged release, how its numbers grow per stage at the reference skill level (normal →
// Ⅰ / Ⅱ / Ⅲ, no perks, no gear), the stage times, the release cost, and the perks with their ranks, gates and numbers.
import { SKILLS, TREES, skillRuntime } from '../src/rpg/skills.js';
import { CHARGE, STAGE_MULT, NUMERAL, stageTimes, chargeCost, chargeRuntime, GRACE, SLOW, SURCHARGE } from '../src/rpg/charge.js';

const li = process.argv.indexOf('--lvl'), LVL = li >= 0 ? +process.argv[li + 1] : 10;
const D = { dmgMin: 10, dmgMax: 20, lifeMax: 300, synergy: {}, treeDmgPct: {}, ballSpeed: 1 };
const L = {
  dmgPct: ['damage', '%'], arc: ['arc', '°'], radius: ['radius', ' m'], knockback: ['knockback', ''], knock: ['knockback', ''], stun: ['stun', ' s'], wave: ['crescent rolls', ' m'],
  pull: ['pull', ' m/s'], spinOut: ['spin-out', ' s'], leap: ['leap', ' m'], count: ['count', ''], duration: ['lasts', ' s'], speed: ['speed', ' m/s'], range: ['range', ' m'],
  pierce: ['pierce', ''], size: ['size', '×'], bounces: ['bounces', ''], bounceRange: ['bounce range', ' m'], spread: ['fan', '°'], life: ['life', ''], lureRadius: ['lure', ' m'],
  cloudRadius: ['stink cloud', ' m'], burnDuration: ['burning ground', ' s'], burnPct: ['burn', '%/s'], cone: ['cone', '°'], reach: ['reach', ' m'], distance: ['dash', ' m'],
  alpha: ['alpha pup', '×'], pups: ['pups', ''], healPct: ['heal', '% life'], healFlat: ['heal', ' flat'], dmgBuff: ['damage buff', '%'], fear: ['fear', ' s'], strikes: ['moonbeams', ''],
  strikeRadius: ['strike radius', ' m'], splashRadius: ['splash radius', ' m'], splashPct: ['splash', '%'], chill: ['slow', ''], chillDur: ['chill', ' s'], absorb: ['absorb', ''],
  freeze: ['freeze', ' s'], width: ['width', ' m'], length: ['length', ' m'], surf: ['surf', ' s'], homing: ['homing', ''], links: ['links', ''], linkRange: ['link range', ' m'],
  twinklePct: ['twinkle', '%'], popRadius: ['pop radius', ' m'], barkStun: ['bark daze', ' s'], area: ['area', ' m'], linger: ['lingers', ' s'], grabs: ['grabs', ''], trailPct: ['zoom trail', '% / 0.5 s'],
  lure: ['tug', ' m'], arm: ['arms in', ' s'], wavePct: ['crescent', '%'], waveWidth: ['crescent width', ' m'], arcPct: ['spark arc', '%'], burstPct: ['burst', '%'], slamPct: ['slam splash', '%'],
  dizzy: ['dizzy', ' s'], trail: ['trail', ' s'],
};
const SKIP = new Set(['returns', 'golden', 'carry', 'alphaHowl', 'invuln', 'hits']);
const PCT = new Set(['dmgPct', 'burnPct', 'healPct', 'twinklePct', 'dmgBuff']);
const fmt = (k, v) => (k === 'chill' ? `−${Math.round(v * 100)}%` : PCT.has(k) ? `${Math.round(v)}` : typeof v === 'number' ? `${Math.round(v * 100) / 100}` : String(v));
const POSE = { sword: 'sword drawn back', ball: 'ball cocked', staff: 'staff raised', crouch: 'crouch', breath: 'a big breath', sky: 'paws to the sky', spin: 'the spin revs up', beam: 'the beam grows', twirl: 'staff twirl', call: 'call to the lips', shake: 'braced to shake', bubble: 'blowing a bubble' };

const out = [];
out.push(`All numbers at skill level ${LVL} with no gear, read from \`src/rpg/charge.js\` (regenerate with \`node tools/charge-table.mjs\`). Common rules: a press under ${GRACE} s is a tap; charging walks at ${Math.round(SLOW * 100)}% speed; each stage costs +${Math.round(SURCHARGE * 100)}% of the skill's zoom; the main number grows ×${STAGE_MULT.join(' / ×')} unless a skill names its own curve. Stage times are Ⅰ / Ⅱ / Ⅲ (cumulative; Quick Wind-up trims them by 15% per rank).`);
out.push('');
out.push('**Common perk families** (each skill carries its own copies; ranks are bought with skill points, gated by the skill\'s hard level):');
out.push('- **Deeper Charge** (every skill, 2 ranks, Lv 5 / 10): rank 1 adds Stage Ⅱ, rank 2 adds Stage Ⅲ.');
out.push('- **Quick Wind-up** (every skill, 3 ranks, Lv 1 / 3 / 6): −15% charge time per rank.');
out.push('- **Efficient Focus** (the big-cost skills, 2 ranks, Lv 3 / 8): the per-stage surcharge drops from +25% to +15% to +5%.');
out.push('- **Split Shot** / **Wide Arc** / **Echo** (where they fit): +1 / +2 fanned projectiles at 70%; +15–20% charged area per rank; the release repeats once 0.45 s later at 50%.');
out.push('');
for (const T of TREES) {
  const ids = Object.keys(CHARGE).filter(id => SKILLS[id].tree === T.id).sort((a, b) => SKILLS[a].row - SKILLS[b].row || SKILLS[a].col - SKILLS[b].col);
  if (!ids.length) continue;
  out.push(`#### ${T.name} (${T.cls === 'moka' ? 'Moka' : 'Chewy'})`);
  out.push('');
  out.push('| Skill → charged release | Stage payoff (normal → Ⅰ / Ⅱ / Ⅲ) | Charge, cost | Perks (ranks · skill level) |');
  out.push('|---|---|---|---|');
  for (const id of ids) {
    const c = CHARGE[id], def = SKILLS[id];
    const st = { player: { cls: def.cls, lvl: 60, skills: { [id]: LVL }, chargePerks: { [id]: { stages: 2 } } } };
    const R0 = skillRuntime(id, st, D), Rs = [1, 2, 3].map(s => chargeRuntime(id, st, D, s));
    const keys = [...new Set(Rs.flatMap(R => Object.keys(R.params)))].filter(k => !SKIP.has(k));
    const parts = [];
    for (const k of keys) {
      const v0 = R0.params[k], vs = Rs.map(R => R.params[k]);
      if (vs.every(v => v === v0)) continue;
      if (typeof vs[0] !== 'number' && typeof vs[0] !== 'boolean') continue;
      const [name, unit] = L[k] || [k, ''];
      if (typeof vs[0] === 'boolean') { parts.push(`${name}: ${vs.map(v => (v ? 'yes' : 'no')).join(' / ')}`); continue; }
      const same = vs.every(v => v === vs[0]);
      const base = v0 == null ? '' : `${fmt(k, v0)} → `;
      parts.push(`${name} ${base}${same ? fmt(k, vs[0]) : vs.map(v => fmt(k, v)).join(' / ')}${unit}`);
    }
    const t = stageTimes(c).map(v => Math.round(v * 100) / 100).join(' / ');
    const cost = R0.cost ? `${R0.cost} → ${[1, 2, 3].map(s => chargeCost(R0.cost, s)).join(' / ')} zoom${def.kind === 'channel' ? ' per second' : ''}` : '—';
    const perks = Object.values(c.perks).map(p => {
      const gate = p.req.length > 1 ? p.req.join(' / ') : p.req[0];
      const rk = n => Array.from({ length: p.ranks }, (_, i) => n(i + 1));
      const what = p.id === 'stages' ? `Ⅱ at ${Math.round(stageTimes(c)[1] * 100) / 100} s, then Ⅲ at ${Math.round(stageTimes(c)[2] * 100) / 100} s`
        : p.id === 'quick' ? `Stage Ⅰ in ${rk(r => Math.round(stageTimes(c, { quick: r })[0] * 100) / 100).join(' / ')} s`
          : p.id === 'focus' ? `+${rk(r => Math.round((SURCHARGE - 0.1 * r) * 100)).join(' / ')}% zoom per stage`
            : p.id === 'split' ? `+${rk(r => r).join(' / ')} extra ${p.info(1, c).replace(/^\+1 extra (\S+).*$/, '$1')}s (${p.pct}% each), fanned`
              : p.id === 'wide' ? `${rk(r => '+' + p.pct * r + '%').join(' / ')} ${p.info(1, c).replace(/^\+\d+% /, '')}`
                : p.info(1, c);
      return `${p.kind === 'unique' ? '★ ' : ''}**${p.name}** (${p.ranks} · Lv ${gate}${p.needs ? `, needs Stage ${NUMERAL[1 + p.needs.stages]}` : ''}): ${what}`;
    }).join('<br>');
    out.push(`| **${def.name}** → *${c.title}* (${POSE[c.pose] || c.pose})<br>${c.blurb} | ${parts.join('; ')} | ${t} s<br>${cost} | ${perks} |`);
  }
  out.push('');
}
console.log(out.join('\n'));
