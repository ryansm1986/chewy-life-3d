// The cozy path's tutorial hooks (docs/COZY.md §11; ROADMAP CZ-11). The guides themselves are data in world/guides.js
// ("The Expedition Board", "Shadow's Nose", "The Adventurers' Guild"); this wires the moments around them:
//   - Rosie's burrow1 question, once, on the first calm moment after the house tour: "Go yourself, or send Moka?". Both
//     answers keep the same quest (burrow1 is already active): going yourself is as before (Shadow's fight tips in the
//     Burrow, the charge guide after the trip); sending Moka starts the Board guide. flags.burrowChoice = 'self' | 'crew'.
//     Shadow's Nose follows either way (its trigger waits for the answer, and on the crew path for the Board guide);
//   - the other path, later: a fighter who first opens the board gets the Board guide as an offer card (a cozy player
//     who first enters the Burrow already gets the fight tips and the charge guide, as before);
//   - "Peaceful paths": on the first visit to a saved zone, Shadow's tip ("It's quiet now!…") and the minimap spotlit for
//     3 s with a callout on the wild places' violet rings (the spotlight only when guides run: not in the QA's sessions).
// Only while the director is enabled (world/tutorials.js: off for ?notut and the QA's ?nointro), so the QA flows never
// meet the question. installCozyGuide(G) after G.tutorials; it wraps G.cozy.tick.
import { Events } from '../core/events.js';

export function installCozyGuide(G) {
  const T = () => G.tutorials, F = () => (G.state.flags ||= {});
  let calmT = 0, asking = false, spot = null, peacefulDue = 0;
  const houseDone = () => !!F().tutorials?.house?.done;
  const burrow1 = () => G.state.quests?.active?.find(q => q.id === 'burrow1') || null;
  /** Rosie's question is still open: burrow1 untouched (no kills, never in the Burrow), Moka in the pack */
  const choiceOpen = () => { const q = burrow1(); return !F().burrowChoice && !!q && q.step === 0 && !(q.prog > 0) && !F().burrowTut && !!G.heroes?.joined('moka') && !G.introJoinPending; };
  const quiet = () => { const t = T(); return !!t?.enabled && !t.cur && !t.pending.size && !t.offers.length && !t.ui?.offering && t.calm() && G.mode === 'village' && !G.cozy?.scav?.busy; };

  async function ask() {
    asking = true;
    const P = G.player, ui = G.ui, me = G.heroes?.name?.() || 'Chewy';
    const friend = G.heroes?.bench?.()[0] || 'moka', fn = G.heroes?.name?.(friend) || 'Moka';
    const portrait = G.portrait?.('rosie'), say = (lines, choices) => ui.dialogue({ speaker: 'Rosie', portrait, lines, choices });
    P.controlLocked = true;
    try {
      const c = await say([`${me}! About those squeaks in the Burrow…`, `Go yourself, or send ${fn}? I'll pack a lunch either way!`], [{ text: "I'll go myself! ⚔️" }, { text: `Send ${fn} with a lunch 🧺` }]);
      if (c === 1) {
        F().burrowChoice = 'crew';
        await say([`Lovely! ${fn}'s packing a bag right now. The Expedition Board is by the Wayfarer's Post: Shadow knows the way!`]);
      } else {
        F().burrowChoice = 'self';
        await say(['Brave pup! The Burrow\'s gate is up on the shrine hill. Shadow knows the way: follow him!']); // (burrow1's first step leads there: world/story.js, actors/shadowLead.js)
      }
    } finally { P.controlLocked = false; asking = false; G.interactCooldown = performance.now() + 350; }
    Events.emit('cozy:burrowChoice', { choice: F().burrowChoice });
    G.save?.();
    if (F().burrowChoice === 'crew') T()?.start('board');
  }

  function tick(dt) {
    const st = Math.max(dt, 1 / 60), t = T(); if (!t || G.titleActive) return;
    // Rosie's question
    calmT = !asking && houseDone() && choiceOpen() && quiet() ? calmT + st : 0;
    if (calmT > 1.5) { calmT = 0; ask(); }
    // the other path: a fighter's first look at the board offers its guide (the card waits for the board to close)
    if (t.enabled && G.ui?.isOpen?.('expeditions') && G.ui.panels.expeditions?.atBoard && !t.S.board && F().burrowChoice !== 'crew') t.offer('board');
    // Peaceful paths: the tip, then the minimap spotlit while it's up
    if (peacefulDue && performance.now() > peacefulDue) {
      peacefulDue = 0;
      if (G.mode === 'dungeon' && G.dungeon?.isRegion && G.dungeon.peaceful) G.hint?.('peaceful', "It's quiet now! The wild places are still wild, though: look for the red ofuda at their gates, and the violet rings on the map.");
    }
    if (spot == null && F().hints?.peaceful && !F().peacefulSpot) {
      F().peacefulSpot = true;
      const U = G.ui?.tutorial, mm = document.querySelector('.hud .mm-wrap');
      if (t.enabled && U && mm && !t.cur && G.mode === 'dungeon') { spot = 3; U.highlight([mm]); U.setCallouts([{ el: '.hud .mm-wrap', text: 'Wild places: the *violet rings*', side: 'left' }]); }
    }
    if (spot > 0 && (spot -= st) <= 0) { spot = -1; G.ui?.tutorial?.highlight([]); G.ui?.tutorial?.setCallouts([]); }
  }

  Events.on('mode:changed', e => {
    if (e?.mode !== 'dungeon' || F().hints?.peaceful) return;
    setTimeout(() => { if (G.dungeon?.isRegion && G.dungeon.peaceful && !F().hints?.peaceful) peacefulDue = performance.now() + 5200; }, 0); // (after the zone's own "gone quiet" note: regions/regionMode.js)
  });
  const t0 = G.cozy?.tick;
  if (G.cozy && t0) G.cozy.tick = dt => { t0(dt); try { tick(dt); } catch (err) { console.warn('[cozyGuide]', err); } };
  G.cozyGuide = { ask: () => ask(), get choiceOpen() { return choiceOpen(); } };
}
