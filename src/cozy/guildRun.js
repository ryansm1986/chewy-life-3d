// The Adventurers' Guild's runtime (docs/COZY.md §5, §8, §10; ROADMAP CZ-7, CZ-8): the building's level (synced from
// the village), Old Hachi and his talk, hiring, the roster, the daily wages on the world clock (time away counts), the
// Guild's upgrades and its two tools, and the Cozy debug section's Guild actions. The rules are cozy/guild.js's; the
// people in town are cozy/hires.js's; the panel is ui/guild.js.
//
//   installGuild(G, village) → G.cozy.guild = {
//     level, built(), rec(), open(view?),
//     candidates(), hire(i), dismiss(id), payBack(id), roster(), hireInfo(id),
//     upgradeInfo(), upgrade(), tools(), buyTool(key),
//     nameOf(key), faceHTML(key | id), bannerLine(), dailyWages(), inTown(), hachi(), newDayIn(),
//     talkHachi(v), talkHire(v, id), settle(), debugBuild({ plot, level }), debugHires(n),
//   }
//   game.js calls installGuild after installPeaceful (G.cozy.tick is wrapped: the wages settle as world days cross).
//   Events: 'guild:built' { level }, 'guild:upgraded' { level }, 'guild:hired' { id, cls, lvl }, 'guild:dismissed' { id },
//   'guild:wages' { paid, short, days }, 'guild:tool' { key }, 'hire:levelup' { id, lvl, from } (cozy/expeditionRun.js).
import { Events } from '../core/events.js';
import { registerDebug } from '../debug/registry.js';
import { BUILDINGS, sizeOf, getTemplate } from '../world/buildings/index.js';
import { PLOTS, PLOT_BY_ID } from '../world/plots.js';
import { worldDay } from './clock.js';
import { cozyOf, memberAway, tiredLeft } from './state.js';
import { hoursLeft } from './expeditions.js';
import {
  guildState, candidatesToday, canHire, signOn, dismiss, settleWages, payBack, dailyWages, upgradeCheck, levelPerks, GUILD_TOOLS, GUILD_MAX,
  HIRE_CLASSES, CLASS_IDS, rosterCap, hireOf, moraleHearts, moraleWord, wageOf, signOnFee, hirePower, hireXpToNext, hireLevelCap, rollCandidates, candidateLevel, MORALE_MAX,
} from './guild.js';
import { scavState } from './scavenge.js';
import { installHires, HACHI_SPEC, hireSpec } from './hires.js';

export function installGuild(G, village) {
  if (!G.cozy) return null;
  return new GuildRun(G, village);
}

const img = url => (url ? `<img class="p3d" src="${url}" alt="" draggable="false" style="width:100%;height:100%;object-fit:cover;display:block">` : '');

class GuildRun {
  constructor(G, village) {
    this.G = G; this.village = village;
    guildState(G.state);
    const self = this;
    G.cozy.guild = {
      get level() { return guildState(G.state).level; },
      built: () => guildState(G.state).level > 0,
      rec: () => self.folk.rec(),
      open: (view, o) => self.open(view, o),
      candidates: () => self.candidates(),
      hire: i => self.hire(i),
      dismiss: id => self.dismiss(id),
      payBack: id => self.payBack(id),
      roster: () => self.roster(),
      hireInfo: id => self.hireInfo(id),
      upgradeInfo: () => self.upgradeInfo(),
      upgrade: () => self.upgrade(),
      tools: () => self.tools(),
      buyTool: k => self.buyTool(k),
      nameOf: key => hireOf(G.state, String(key).replace(/^hire:/, ''))?.name || '',
      faceHTML: key => self.faceHTML(key),
      bannerLine: () => self.bannerLine(),
      dailyWages: () => dailyWages(G.state),
      inTown: () => self.folk.inTown(),
      hachi: () => self.folk.hachi,
      newDayIn: () => 24 - (cozyOf(G.state).clock.h % 24),
      talkHachi: v => self.talkHachi(v),
      talkHire: (v, id) => self.talkHire(v, id),
      settle: () => self.settle(),
      debugBuild: o => self.debugBuild(o),
      debugHires: n => self.debugHires(n),
    };
    this.folk = installHires(G, this);
    G.cozy.guild.folk = this.folk;
    Events.on('village:changed', () => this.syncLevel());
    Events.on('building:levelup', e => { if (e?.b?.type === 'guild') this.syncLevel(); });
    Events.on('hire:levelup', e => { const h = hireOf(G.state, e?.id); if (h) Events.emit('sfx', 'ui_levelup'); });
    this.syncLevel(true);
    this.folk.sync();
    // the wages settle as world days cross (the clock runs in every mode; time away counts: it was added at load)
    const tick = G.cozy.tick;
    G.cozy.tick = dt => { tick(dt); this.tick(dt); };
    this.registerDebug();
  }
  get st() { return this.G.state; }
  get g() { return guildState(this.G.state); }
  changed() { Events.emit('cozy:changed'); }
  // ------------------------------------------------------------------ the building
  /** the Guild's level is its building's (0: none); a change fires guild:built / guild:upgraded */
  syncLevel(quiet = false) {
    const b = this.G.sim?.S.buildings.find(x => x.type === 'guild'), L = b ? Math.max(1, Math.min(GUILD_MAX, b.level || 1)) : 0, g = this.g, was = g.level;
    if (L === was) return;
    g.level = L;
    if (L > was && !quiet) {
      if (was === 0) {
        Events.emit('guild:built', { level: L });
        this.G.ui?.toast?.("The Adventurers' Guild is open! Old Hachi is waiting by the door", { icon: 'star', color: '#ffd84a', duration: 6 });
      } else {
        Events.emit('guild:upgraded', { level: L });
        const P = levelPerks(L);
        this.G.ui?.toast?.(`The Guild is level ${L}! Room for ${P.roster} hires${L >= 3 ? ', crews of 5' : ''}`, { icon: 'star', color: '#ffd84a', duration: 6 });
      }
    }
    this.folk?.sync();
    this.changed();
  }
  open(view = null, o = {}) {
    const G = this.G;
    if (!(this.g.level > 0)) { G.ui?.toast?.("Build the Adventurers' Guild first (Build mode, village rank 2)", { color: '#ffd8a8' }); return false; }
    G.ui?.open?.('guild', { view, ...o });
    Events.emit('sfx', 'ui_open');
    return true;
  }
  // ------------------------------------------------------------------ hiring and the roster
  day() { return worldDay(cozyOf(this.st).clock.h); }
  candidates() {
    const list = candidatesToday(this.st, this.day()), coins = this.st.coins || 0;
    return list.map(c => ({ ...c, key: `cand_${this.g.cand.day}_${c.i}`, fee: signOnFee(c.lvl), wage: wageOf(c.lvl), power: hirePower(c, this.g.level), check: canHire(this.st, c, coins) }));
  }
  hire(i) {
    const G = this.G, c = candidatesToday(this.st, this.day()).find(x => x.i === i), chk = canHire(this.st, c, this.st.coins || 0);
    if (!chk.ok) { Events.emit('sfx', 'ui_error'); return { ok: false, why: chk.why }; }
    if (!G.actions.spendCoins(chk.fee)) return { ok: false, why: 'Not enough coins' };
    const h = signOn(this.st, c, cozyOf(this.st).clock.h);
    this.folk.prewarm(h);
    Events.emit('guild:hired', { id: h.id, cls: h.cls, lvl: h.lvl });
    Events.emit('sfx', 'ui_quest');
    G.ui?.toast?.(`${h.name} the ${HIRE_CLASSES[h.cls].name} signs on!`, { icon: 'heart', color: '#8fe0c0', sub: `Level ${h.lvl} · wages ${wageOf(h.lvl)} coins a day` });
    G.save?.();
    this.changed();
    return { ok: true, h };
  }
  dismiss(id) {
    const G = this.G, h = hireOf(this.st, id); if (!h) return { ok: false, why: 'Not on the roster' };
    if (memberAway(this.st, `hire:${id}`)) return { ok: false, why: `${h.name} is out on an expedition` };
    if (h.owed) { const p = payBack(this.st, id, this.st.coins || 0); if (p.paid) G.actions.spendCoins(p.paid); }
    dismiss(this.st, id);
    delete cozyOf(this.st).exp.tired[`hire:${id}`];
    Events.emit('guild:dismissed', { id });
    G.ui?.toast?.(`${h.name} waves goodbye. "Thanks for everything! Call on me any time."`, { icon: 'heart', color: '#ffd8e8' });
    G.save?.();
    this.changed();
    return { ok: true };
  }
  payBack(id) {
    const G = this.G, h = hireOf(this.st, id); if (!h?.owed) return { ok: false, why: 'Nothing owed' };
    const p = payBack(this.st, id, this.st.coins || 0);
    if (!p.paid) { Events.emit('sfx', 'ui_error'); return { ok: false, why: 'Not enough coins' }; }
    G.actions.spendCoins(p.paid);
    G.ui?.toast?.(p.back ? `${h.name} is paid up and back from the break!` : `Paid ${h.name} ${p.paid} coins of back wages`, { icon: 'coin', color: '#ffe0a8' });
    Events.emit('sfx', 'ui_coin');
    G.save?.();
    this.changed();
    return { ok: true, ...p };
  }
  hireInfo(id) {
    const st = this.st, h = hireOf(st, id); if (!h) return null;
    const key = `hire:${id}`, away = memberAway(st, key), K = HIRE_CLASSES[h.cls];
    return {
      ...h, key, cls: h.cls, K, power: hirePower(h, this.g.level), wage: wageOf(h.lvl), hearts: moraleHearts(h.morale), moraleWord: moraleWord(h.morale),
      xpNext: hireXpToNext(h.lvl), cap: hireLevelCap(this.g.level || 1), tired: tiredLeft(st, key),
      away: away ? { name: away.name, left: hoursLeft(st, away), hold: away.hold } : null, inTown: !!this.folk.villagers[id],
    };
  }
  roster() { return this.g.hires.map(h => this.hireInfo(h.id)); }
  // ------------------------------------------------------------------ the wages (COZY §5.2; time away counts)
  tick() {
    if (this.G.titleActive) return;
    if (this.day() > this.g.wages.day) this.settle(); // (every frame: an integer compare; a crossed day settles at once, so time away's lines reach the away card)
  }
  settle() {
    const G = this.G, st = this.st, n = this.g.hires.length, out = settleWages(st, this.day(), st.coins || 0);
    if (!out.days || !n) { if (out.days) this.changed(); return out; }
    if (out.paid) G.actions.spendCoins(out.paid);
    const lines = [];
    if (out.paid) lines.push(`Guild wages paid: ${out.paid} coins${out.days > 1 ? ` for ${out.days} days` : ''}.`);
    if (out.short) lines.push(`${out.short} coins of wages still owed: the hires are a little glum.`);
    for (const [id, P] of Object.entries(out.perHire)) {
      const h = hireOf(st, id); if (!h) continue;
      if (P.broke) lines.push(`${h.name} has taken a break until their wages are paid.`);
      else if (P.back) lines.push(`${h.name} is back from their break.`);
      else if (moraleHearts(P.morale[0]) !== moraleHearts(P.morale[1])) lines.push(`${h.name} feels ${moraleWord(P.morale[1]).toLowerCase()}.`);
    }
    const A = G.cozy?.awayNow?.();
    if (A && !A.shown) A.guild = [...(A.guild || []), ...lines];
    else if (lines.length) G.ui?.toast?.(lines[0], { icon: 'coin', color: out.short ? '#ffc8b8' : '#ffe0a8', sub: lines.slice(1, 3).join(' '), duration: out.short ? 6 : 4 });
    Events.emit('guild:wages', { paid: out.paid, short: out.short, days: out.days });
    G.save?.();
    this.changed();
    return out;
  }
  /** the morning banner's line (village.js onNewDay): the wages paid since the last banner */
  bannerLine() {
    const W = this.g.wages, n = W.banner;
    W.banner = 0;
    return n > 0 ? `Guild wages −${n}` : '';
  }
  // ------------------------------------------------------------------ upgrades and tools
  rank() { return this.G.housing?.testRank ?? this.G.sim?.stats?.rank ?? 1; }
  upgradeInfo() {
    const G = this.G, L = this.g.level;
    const u = upgradeCheck(L, BUILDINGS.guild.levelCost, this.rank(), cost => G.actions.hasMaterials(cost));
    if (u.ok && G.housing?.ext?.busy) return { ...u, ok: false, why: 'The builders are busy: just a moment!' };
    return { ...u, level: L, now: levelPerks(L || 1), then: u.next <= GUILD_MAX ? levelPerks(u.next) : null };
  }
  upgrade() {
    const G = this.G, u = this.upgradeInfo(), rec = this.folk.rec();
    if (!u.ok || !rec) { G.ui?.toast?.(u.why || "The Guild isn't built", { color: '#ffb0bc' }); Events.emit('sfx', 'ui_error'); return false; }
    if (!G.actions.spendMaterials(u.cost)) return false;
    const b = rec.data, grow = () => { const ok = G.sim.levelUp(b); if (!ok) { for (const [k, n] of Object.entries(u.cost)) if (k === 'coins') G.actions.addCoins(n); else G.actions.addMaterial(k, n); return null; } G.save?.(); return G.sim.list.find(r => r.data === b) || null; };
    const ext = G.housing?.ext;
    if (ext?.construct) { // the builders' scaffold goes up and the Guild grows inside it (home/exteriors.js)
      const size = sizeOf('guild', u.next), [w, d] = b.rot % 2 ? [size[1], size[0]] : size;
      ext.construct(rec, [w, d], getTemplate('guild', u.next, b.seed).height, grow);
    } else grow();
    G.ui?.toast?.(`The builders are on it! The Guild grows to level ${u.next}`, { icon: 'build', color: '#ffd84a' });
    return true;
  }
  tools() {
    const T = scavState(this.st).tools;
    return Object.entries(GUILD_TOOLS).map(([key, t]) => ({ key, ...t, owned: !!T[key], ok: !T[key] && this.g.level > 0 && this.G.actions.hasMaterials(t.cost) }));
  }
  buyTool(key) {
    const G = this.G, t = GUILD_TOOLS[key], T = scavState(this.st).tools;
    if (!t || T[key]) return { ok: false, why: 'Already yours' };
    if (!(this.g.level > 0)) return { ok: false, why: "The Guild isn't built" };
    if (!G.actions.spendMaterials(t.cost)) { Events.emit('sfx', 'ui_error'); return { ok: false, why: 'Not enough materials' }; }
    T[key] = true;
    if (key === 'bandana') G.cozy?.scav?.redraw?.(); // (one more dig spot today, the longer nose at once)
    Events.emit('guild:tool', { key });
    Events.emit('sfx', 'ui_quest');
    G.ui?.toast?.(`${t.name}: ${t.desc}`, { icon: 'star', color: '#8fe0c0', duration: 5 });
    G.save?.();
    this.changed();
    return { ok: true };
  }
  // ------------------------------------------------------------------ faces
  /** a hire's (or a candidate's) 3D bust as an <img> (G.portrait: rendered once, cached) */
  faceHTML(key) {
    const G = this.G; if (!G.portrait) return '';
    key = String(key);
    if (key.startsWith('cand_')) { const c = this.g.cand.list.find(x => `cand_${this.g.cand.day}_${x.i}` === key); if (!c) return ''; G.registerPortrait?.(key, hireSpec({ id: key, seed: c.seed, cls: c.cls, name: c.name })); return img(G.portrait(key)); }
    if (key === 'hachi') { G.registerPortrait?.('hachi', HACHI_SPEC); return img(G.portrait('hachi')); }
    const id = key.replace(/^hire:/, ''), h = hireOf(this.st, id); if (!h) return '';
    G.registerPortrait?.(`hire_${id}`, hireSpec(h));
    return img(G.portrait(`hire_${id}`));
  }
  // ------------------------------------------------------------------ Old Hachi (warm and gruff)
  hachiLine() {
    const st = this.st, g = this.g, E = cozyOf(st).exp, owed = g.hires.filter(h => h.owed > 0), out = E.active.filter(e => e.crew.some(k => k.startsWith('hire:')));
    if (owed.length) return `${owed[0].name} is owed wages. An adventurer on an empty purse walks about as fast as my knees. Settle up, would you?`;
    if (!g.hires.length) return 'Roster\'s empty. Three good paws came by this morning looking for work. Have a look at them.';
    if (out.length) return `${out.length > 1 ? 'Two crews' : 'A crew'} out on the road. Don't fret. I trained most of them to come home.`;
    const low = g.hires.find(h => h.morale < 0.95);
    if (low) return `${low.name} looks a bit down in the tail. A good meal for the road, a win or two, and a paid day fixes most things.`;
    if (g.hires.length >= rosterCap(g.level) && g.level < GUILD_MAX) return 'Full house. If you want more hands, this old lodge needs a bigger roof.';
    return ['Hmph. You again. Good. The kettle\'s on.', 'Fine weather for walking. Not for me, mind. For them.', 'Pin a job on the Board, send a crew, keep the tea warm. That\'s the whole trick.', 'Back in my day we walked uphill both ways. To the Burrow. In the snow.'][Math.floor(Math.random() * 4)];
  }
  async talkHachi(v) {
    const G = this.G, ui = G.ui, P = G.player;
    if (!ui?.dialogue || v.talking) return;
    v.talking = true; if (P) P.controlLocked = true;
    const done = () => { v.talking = false; if (P) P.controlLocked = false; G.interactCooldown = performance.now() + 350; };
    try {
      const portrait = G.portrait?.('hachi'), say = (lines, choices) => ui.dialogue({ speaker: 'Old Hachi', jp: 'ハチ', portrait, color: '#d4834a', lines, choices, voice: HACHI_SPEC.voice });
      const g = this.g;
      if (!g.met) {
        g.met = true;
        await say(["Hmph. So you're the one who built this old dog a lodge.", 'Name\'s Hachi. Walked every trail on this island back when my knees still listened to me.', 'These days I sign on young adventurers and send them where they\'re needed. Pay them fair and feed them well, and they\'ll walk to the end of the map for you.', 'The Expedition Board hangs inside the door. And the Sightings, for the ones who like a scrap. Now. What can I do for you?']);
      }
      const C = ['Show me the adventurers', 'The Expedition Board', "Today's sightings", 'About the Guild', 'Just saying hello'];
      const k = await say([this.hachiLine()], C);
      if (k === 0) this.open('hire');
      else if (k === 1) { ui.open('expeditions', { at: 'guild' }); Events.emit('sfx', 'ui_open'); }
      else if (k === 2) { ui.open('sightings', { at: 'guild' }); Events.emit('sfx', 'ui_open'); }
      else if (k === 3) {
        const L = g.level, P2 = levelPerks(L), u = this.upgradeInfo();
        await say([`Room for ${P2.roster} on the roster, crews of up to ${P2.crew}. Hires go up to level ${P2.levelCap} here, and they walk ${P2.power}% stronger for the Guild's name on their pack.`,
          u.max ? "This is as grand as an old lodge gets. I'm proud of it. Don't tell anyone." : `A bigger lodge means more hands: ${u.then?.roster} on the roster at level ${u.next}${u.next >= 3 ? ', and crews of five' : ''}. ${u.ok ? 'You\'ve got what it takes. See the Guild tab.' : u.why + '.'}`,
          'I sell two odds and ends too: a Forager\'s Basket, and a bandana for that nose of Shadow\'s. Good for the cozy work.']);
        this.open('guild');
      } else {
        v.anim?.play?.('nod');
        await say(['Hmph. Hello yourself.', '…Don\'t tell anyone I smiled.']);
      }
    } catch (e) { console.error('[guild] talk', e); }
    done();
  }
  async talkHire(v, id) {
    const G = this.G, ui = G.ui, P = G.player, h = hireOf(this.st, id);
    if (!ui?.dialogue || v.talking || !h) return;
    v.talking = true; if (P) P.controlLocked = true;
    const done = () => { v.talking = false; if (P) P.controlLocked = false; G.interactCooldown = performance.now() + 350; };
    try {
      const K = HIRE_CLASSES[h.cls];
      const line = h.onBreak ? "I'm on a little break until my wages are sorted. No hard feelings! Old Hachi says pay day fixes everything."
        : h.owed ? `Um… about my wages? ${h.owed} coins. Whenever you can!`
          : h.morale >= 1.08 ? `${K.lines[0]} Ready when you are, boss!` : h.morale < 0.95 ? 'A bit of a rough patch lately. A good lunch on the next trip would cheer me right up.'
            : ['Ready for the road whenever you need me!', `${K.name} reporting! ${K.perkWord || `Best on ${K.suitWord}.`}`, 'Blossom Hollow is the coziest place I\'ve ever been posted.'][Math.floor(Math.random() * 3)];
      await ui.dialogue({ speaker: h.name, portrait: G.portrait?.(`hire_${id}`), color: K.color, lines: [line], voice: v.spec?.voice || 1 });
    } catch (e) { console.error('[guild] talk', e); }
    done();
  }
  // ------------------------------------------------------------------ debug (the Cozy tab, docs/DEBUG.md)
  /** build the Guild on a free civic plot (or the one named), at a level, free → the building record */
  debugBuild({ plot = null, level = 1 } = {}) {
    const G = this.G, sim = G.sim;
    let b = sim.S.buildings.find(x => x.type === 'guild');
    if (!b) {
      const plots = plot ? [PLOT_BY_ID[plot]] : PLOTS.filter(p => p.allows.includes('guild'));
      for (const pl of plots) {
        if (!pl || !sim.plotFree(pl)) continue;
        const sp = sim.spotFor(pl, 'guild', 1); if (!sp) continue;
        b = sim.place('guild', sp.x, sp.z, sp.rot, { free: true, silent: false, plot: pl.id, force: !sim.plotOpen(pl) });
        if (b) break;
      }
      if (!b) return null;
    }
    while ((b.level || 1) < Math.min(GUILD_MAX, level)) if (!sim.levelUp(b)) break;
    this.syncLevel();
    return b;
  }
  /** fill the roster with n new hires (free; one of each class first), up to the cap → the hires */
  debugHires(n = 3) {
    const st = this.st, g = this.g, out = [];
    if (!(g.level > 0)) return out;
    const base = Math.max(1, candidateLevel(st));
    const pool = rollCandidates(this.day() * 7 + g.seq * 13 + 5, base, g.level).concat(rollCandidates(this.day() * 7 + g.seq * 13 + 6, base, g.level), rollCandidates(this.day() * 7 + g.seq * 13 + 7, base, g.level));
    const used = new Set(g.hires.map(h => h.cls));
    pool.sort((a, b) => used.has(a.cls) - used.has(b.cls));
    for (const c of pool) {
      if (out.length >= n || g.hires.length >= rosterCap(g.level)) break;
      const h = signOn(st, c, cozyOf(st).clock.h); used.add(h.cls); out.push(h);
      Events.emit('guild:hired', { id: h.id, cls: h.cls, lvl: h.lvl, debug: true });
    }
    this.changed();
    return out;
  }
  /** a world day's wages settled now (empty: as if the purse were empty) → the settle */
  debugPay(empty = false) {
    const G = this.G, st = this.st, W = this.g.wages, today = this.day();
    W.day = today;
    const out = settleWages(st, today + 1, empty ? 0 : st.coins || 0);
    W.day = today;
    if (out.paid) G.actions.spendCoins(out.paid);
    Events.emit('guild:wages', { paid: out.paid, short: out.short, days: out.days, debug: true });
    this.changed();
    return out;
  }
  registerDebug() {
    const self = this;
    registerDebug('cozy', [
      { group: "The Adventurers' Guild", label: 'Build the Guild now', hint: 'Free, on a free civic plot (any rank)', run: () => { const b = self.debugBuild(); return b ? `The Guild stands (level ${b.level})` : 'No free civic plot'; } },
      { label: '+1 Guild level', hint: 'Free, skips the rank', run: () => { const b = self.debugBuild({ level: (self.g.level || 0) + 1 }); return b ? `The Guild is level ${self.g.level}` : 'No free civic plot'; } },
      { label: 'Give hires', hint: 'Free, up to the roster cap', choices: [{ label: '+1', value: 1 }, { label: '+3', value: 3 }, { label: 'Fill', value: 9 }], run: (G, n) => { const L = self.debugHires(n); return L.length ? `${L.map(h => `${h.name} (${HIRE_CLASSES[h.cls].name} L${h.lvl})`).join(', ')} signed on` : self.g.level ? 'The roster is full' : 'Build the Guild first'; } },
      { label: 'Max morale', hint: 'Every hire in high spirits, back pay forgiven', run: () => { for (const h of self.g.hires) { h.morale = MORALE_MAX; h.owed = 0; h.unpaid = 0; h.floor = 0; h.onBreak = false; } self.changed(); return `${self.g.hires.length} hires in high spirits`; } },
      { label: 'Pay wages', hint: "A world day's wages now (or a day with an empty purse)", choices: [{ label: 'Pay a day', value: 'pay' }, { label: 'Empty purse', value: 'broke' }], run: (G, v) => { const o = self.debugPay(v === 'broke'); return !self.g.hires.length ? 'Nobody to pay' : v === 'broke' ? `An empty purse: ${o.short} coins owed` : `Paid ${o.paid} coins`; } },
    ], { title: 'Cozy', icon: 'leaf', order: 90 });
    void CLASS_IDS;
  }
}
