// Shadow leads the way: the HUD side (ROADMAP R-17, actors/shadowLead.js).
//  - the quest tracker: a click or tap on a quest asks Shadow to lead the way to it (again: he stops for that step);
//    the quest he's leading to wears a little paw badge (the tracker's list keeps `data-lead` = its row);
//  - the debug menu's Cozy › Shadow leads actions (a test walk, the stats).
// The Journal's "Follow Shadow" button lives in ui/map.js; Settings › Shadow leads the way in ui/menu.js.
import { registerDebug } from '../debug/registry.js';
import { glyphURL } from './glyphs.js';
import './leadUI.css';

/** Settings › Shadow leads the way (ui.settings.shadowLead): 0 off (only when asked) · 1 when a quest says so (the
 *  default) · 2 always to the active objective */
export const LEAD_LABELS = ['Off', 'Quests', 'Always'];

export function installLeadUI(G, lead) {
  const hud = G.ui?.hud, list = hud?.$?.qtList;
  if (list && !list.__lead) {
    list.__lead = true;
    list.title = 'Click a quest: Shadow leads the way (L)';
    list.style.setProperty('--lead-paw', `url("${glyphURL('paw')}")`);
    list.addEventListener('click', e => {
      const row = e.target.closest('.qt-q'); if (!row || !list.contains(row)) return;
      const i = [...list.querySelectorAll(':scope > .qt-q')].indexOf(row), q = G.ui.questList?.()[i];
      if (!q || q.done) return;
      e.stopPropagation();
      lead.toggle(q.id);
      G.ui.sfx?.('click');
      mark();
    });
  }
  // the paw on the led quest's row
  let last = '';
  const mark = () => {
    if (!list) return;
    const k = lead.active && lead.intent ? lead.intent.t.quest || '' : '';
    let i = -1;
    if (k) i = (G.ui.questList?.() || []).slice(0, 3).findIndex(q => q.id === k);
    const v = i >= 0 ? String(i) : '';
    if (v !== last) { last = v; if (v) list.dataset.lead = v; else delete list.dataset.lead; }
  };
  lead.onMark = mark;
  setInterval(mark, 300);

  registerDebug('cozy', [
    { group: 'Shadow leads the way (R-17)', label: 'Test walk: a far spot in this world', run: G => testWalk(G) },
    { label: 'Shadow leads', choices: LEAD_LABELS.map((label, value) => ({ label, value })), run: (G, v) => { G.ui.setSetting('shadowLead', v); return `Shadow leads the way: ${LEAD_LABELS[v]}`; } },
    { label: 'Leading stats', run: G => { const s = G.lead.stats; return `${s.plans} plans (${(s.planMs / Math.max(1, s.plans)).toFixed(1)} ms avg, ${s.maxMs.toFixed(1)} max), ${s.leadT.toFixed(0)} s leading, ${s.warns} pack warnings, ${s.arrivals} arrivals, state ${G.lead.state}`; } },
  ]);
}

/** a reach quest ("Follow Shadow to…", lead: true) to a reachable spot 25–45 m off in this world */
function testWalk(G) {
  const P = G.player, W = G.world, nav = P.nav;
  if (!nav || G.mode === 'interior') return 'Not indoors';
  const D = G.mode === 'dungeon' ? G.dungeon : null;
  const at = G.mode === 'village' ? 'home' : D.kind === 'region' ? D.zoneId : D.def?.id;
  for (let k = 0; k < 60; k++) {
    const a = Math.random() * Math.PI * 2, r = 25 + Math.random() * 20, x = P.pos.x + Math.sin(a) * r, z = P.pos.z + Math.cos(a) * r;
    if (!nav.freeAt(x, z) || W.walkable?.(x, z) === false) continue;
    const route = nav.findPath(P.pos.x, P.pos.z, x, z);
    if (!route?.exact) continue;
    const id = 'req_leadTest', Q = G.state.quests;
    Q.active = Q.active.filter(q => q.id !== id);
    Q.requests[id] = { def: { title: 'Follow Shadow', giver: 'rosie', desc: 'A test walk (the debug menu).', steps: [{ type: 'reach', at, floor: D?.floor, x, z, text: 'Follow Shadow to the spot', lead: true }], reward: { coins: 1 }, request: true, next: null } };
    G.story.start(id);
    G.lead.toggle(id);
    return `Shadow leads ${Math.round(r)} m off`;
  }
  return 'No open spot found';
}
