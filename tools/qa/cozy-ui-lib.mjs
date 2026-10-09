// The cozy path's views for the UI audits (docs/COZY.md §10; ROADMAP CZ-10): a seeded state with something in every
// cozy surface, and the scenes that open them. Used by tools/qa/mobile-ui.mjs (the phone and the iPad), deck-ui.mjs
// (the Steam Deck and the pad) and cozy-ui-shots.mjs (the desktop at 1600×900 and 1280×720).
//   seedCozy(page): Moka and Poe joined and levelled (the Cozy debug's sure-thing crew), Bamboo saved, the Guild at
//     level 2 with four hires, three reports home (a story success with its ribbon, a partial, a setback; two unread),
//     two crews out (Poe on an errand, two hires on another), lunches in the pantry, today's sightings.
//   cozyScenes(ev) → [{ name, open, scopes, close? }] for the audits' scene() helpers (the scope selectors are the
//     panels' and overlays' own).
// Dev server only (the debug registry is imported by its source path).

export async function seedCozy(page) {
  return page.evaluate(async () => {
    const G = window.G, { DEBUG_SECTIONS } = await import('/src/debug/registry.js');
    const run = (label, v) => DEBUG_SECTIONS.get('cozy')?.actions.find(a => a.label === label)?.run(G, v);
    const st = G.state;
    st.coins = Math.max(st.coins || 0, 6000);
    for (const k of ['wood', 'stone', 'petal', 'silk', 'bone', 'lantern', 'crystal']) st.materials[k] = Math.max(st.materials[k] || 0, 30);
    G.actions.addPantry('onigiri', 6, { silent: true }); G.actions.addPantry('misoSoup', 4, { silent: true });
    if (!st.quests.active.some(q => q.id === 'burrow1') && !st.quests.done.includes('burrow1')) { G.story.markTalk('rosie'); G.story.start('burrow1', true); }
    run('Give a sure-thing crew');
    for (const id of ['moka', 'poe']) { const P = st.heroes[id]?.player; if (P) P.lvl = Math.max(P.lvl, id === 'moka' ? 9 : 7); } // (Bamboo opens at level 4: its wild areas carry today's sightings)
    G.zoneDebug?.saveVillage?.('bamboo');
    G.cozy.guild.debugBuild({ level: 2 });
    G.cozy.guild.debugHires(4);
    for (const h of st.cozy.guild.hires) { h.morale = 1.05; h.owed = 0; h.onBreak = false; }
    st.cozy.guild.hires[3] && (st.cozy.guild.hires[3].morale = 0.9);
    G.peaceful?.sightings?.(true);
    const E = G.cozy.exp, hires = st.cozy.guild.hires.map(h => `hire:${h.id}`);
    const errands = () => E.objectives('errands');
    // three trips home: a story job (the ribbon), then two errands shown as a partial and a setback
    const story = E.objectives('story')[0];
    const sent = [];
    if (story) sent.push(E.send(story.id, ['hero:moka'], { meals: E.pickMeals(1) }));
    let er = errands();
    if (er[0]) sent.push(E.send(er[0].id, [hires[0]], {}));
    er = errands();
    if (er[0]) sent.push(E.send(er[0].id, [hires[1]], {}));
    E.finishAll();
    const reps = E.reports();
    const R = [...reps].reverse();
    if (R[0]) { R[0].result = 'setback'; R[0].read = false; }
    if (R[1]) { R[1].result = 'partial'; R[1].note = 'They found the trail: the next try is a sure thing for a crew as strong.'; R[1].read = false; }
    if (R[2]) R[2].read = true;
    // two crews out: Poe on an errand (the away hero in the wheel and the minis), two hires on another
    for (const k of Object.keys(st.cozy.exp.tired || {})) delete st.cozy.exp.tired[k];
    er = errands();
    if (er[0]) E.send(er[0].id, ['hero:poe'], { meals: E.pickMeals(1) });
    er = errands();
    if (er[0]) E.send(er[0].id, [hires[2], hires[3]], {});
    G.events.emit('cozy:changed');
    G.ui.toasts?.retire?.(0);
    return { sent: sent.map(s => !!s?.ok), out: E.list().length, reports: E.reports().length, unread: E.unread(), hires: hires.length, sightings: G.peaceful?.sightings?.().length || 0 };
  });
}

/** banners played out and toasts gone (a clean shot): waits on the banner queue, never on the clock */
export async function quietUi(page, timeout = 15000) {
  await page.waitForFunction(() => { const B = window.G.ui.banners; return !B?.busy && !B?.q?.length; }, null, { timeout }).catch(() => {});
  await page.evaluate(() => { const T = window.G.ui.toasts; T?.retire?.(9); });
}

/** the cozy views: { name, open, scopes, close? } (ev = (fn, arg) => page.evaluate(fn, arg)) */
export function cozyScenes(ev) {
  const exp = (view, extra = {}) => () => ev(([view, extra]) => { const G = window.G; G.ui.closeAll?.(); G.ui.open('expeditions', { at: 'board', view, ...extra }); }, [view, extra]);
  const pickCrew = keys => ev(keys => { const P = window.G.ui.panels.expeditions; P.crew = keys.filter(k => P.member(k) && !P.memberWhy(k)); P.render(); }, keys);
  return [
    { name: 'cozy-board-story', open: async () => { await exp('story')(); await pickCrew(['hero:moka']); }, scopes: ['.p-exp'] },
    { name: 'cozy-board-errands', open: async () => { await exp('errands')(); await pickCrew(['hero:moka']); }, scopes: ['.p-exp'] },
    { name: 'cozy-board-away', open: exp('away'), scopes: ['.p-exp'] },
    { name: 'cozy-board-report', open: async () => { await exp('reports')(); await ev(() => { const P = window.G.ui.panels.expeditions, L = P.list('reports'); const r = L.find(x => x.result === 'success') || L[0]; if (r) P.pick(r.uid); }); }, scopes: ['.p-exp'] },
    { name: 'cozy-board-report-partial', open: async () => { await exp('reports')(); await ev(() => { const P = window.G.ui.panels.expeditions, r = P.list('reports').find(x => x.result === 'partial'); if (r) P.pick(r.uid); }); }, scopes: ['.p-exp'] },
    { name: 'cozy-guild-hire', open: () => ev(() => window.G.cozy.guild.open('hire')), scopes: ['.p-guild'] },
    { name: 'cozy-guild-roster', open: () => ev(() => window.G.cozy.guild.open('roster')), scopes: ['.p-guild'] },
    { name: 'cozy-guild-upgrade', open: () => ev(() => window.G.cozy.guild.open('guild')), scopes: ['.p-guild'] },
    { name: 'cozy-sightings', open: () => ev(() => window.G.ui.open('sightings', { at: 'board' })), scopes: ['.p-sight'] },
    { name: 'cozy-away-card', open: () => ev(() => window.G.cozy.showAway()), scopes: ['.p-away'] },
    { name: 'cozy-journal-crews', open: () => ev(() => window.G.ui.open('quests', { tab: 'crews' })), scopes: ['.p-quests'] },
    { name: 'cozy-menu-crews', open: () => ev(() => { document.body.classList.add('pad-active'); window.G.ui.open('menu'); }), scopes: ['.p-menu'], close: () => ev(() => { window.G.ui.close('menu'); if (window.G.controls?.device !== 'pad') document.body.classList.remove('pad-active'); }) }, // (the quick row shows on a pad or touch)
    { name: 'cozy-hud', open: async () => {}, scopes: ['.l-hud', '.hud', '.tc'], close: async () => {} },
  ];
}
