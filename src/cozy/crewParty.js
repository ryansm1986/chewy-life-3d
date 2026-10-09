// A crew's relief celebrated on your next arrival in the zone (docs/COZY.md §3.2, ROADMAP CZ-9): the crew who drove the
// siege off stand in the village square to greet you, cheer with the villagers while the saved village's lanterns,
// bunting and shop fronts grow in, then wave and head home. regions/village/village.js owns the scene's timeline
// (updateCelebration); this module builds and moves the crew.
//   crewParty(village, keys) → { members: [{ actor, key, name, spot }], update(dt, t), leave(), dispose() } | null
//   keys: zones[z].celebrateCrew (member keys: 'hero:moka', 'hire:h3'); the hero being played and anyone away again on
//   another trip stay out of it. Heroes are their own rigs (Player.buildRig), hires their Toybox villager (hireSpec).
import * as THREE from 'three';
import { Actor } from '../actors/actor.js';
import { Player } from '../actors/player.js';
import { buildHumanoid } from '../actors/charKit.js';
import { CLASSES } from '../rpg/classes.js';
import { hireSpec } from './hires.js';
import { parseMember, memberAway } from './state.js';
import { rand, pick } from '../core/util.js';

const CHEERS = ['wave', 'happy', 'clap', 'laugh'];

export function crewParty(V, keys = []) {
  const G = V.G, st = G.state, W = V.world;
  const wp = V.buildings.find(b => b.kind === 'waypoint'); if (!wp || !W) return null;
  // where you arrive (the shrine's door, village.js arrival): the crew stand either side of you, a step toward the
  // camera (the game's 45° yaw), so the shrine never hides them and the arrival banner never covers them
  const f = V.local(wp, wp.info.door[0], wp.info.door[1] + 0.4);
  const yaw = G.engine?.rig?.yawTarget ?? Math.PI / 4, fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
  const open = (x, z) => W.walkable?.(x, z) !== false && !W.collision?.solidAt?.(x, z, 0.32);
  // seen from the game camera: a ray from the spot (knee and chest high) toward the camera meets no opaque scenery (a
  // bamboo clump, a shrub, a roof); the grass, the ground cover and the effects don't count
  const pitch = G.engine?.rig?.pitch ?? 0.62, toCam = new THREE.Vector3(-fx * Math.cos(pitch), Math.sin(pitch), -fz * Math.cos(pitch)).normalize();
  const LOW = /^(terrain|regionGround|water|sky|horizon|scavenge|horde|fishing|veg:(litter|moss|d:flat|d:grass|flower|plant|d:glow))/;
  let solids = null;
  const seen = (x, z) => {
    solids ||= (() => { const out = []; W.scene.traverse(o => { if (!o.isMesh || o.isSkinnedMesh || !o.visible || LOW.test(o.name || '') || /outline|xray|shadow/i.test(o.name || '')) return; const m = Array.isArray(o.material) ? o.material[0] : o.material; if (m && !m.transparent && m.depthWrite !== false) out.push(o); }); return out; })();
    const rc = new THREE.Raycaster(); rc.far = 24;
    for (const h of [0.55, 1.05]) { rc.set(new THREE.Vector3(x, (W.heightAt?.(x, z) || 0) + h, z), toCam); try { if (rc.intersectObjects(solids, false).length) return false; } catch (e) { return true; } }
    return true;
  };
  const list = [];
  for (const k of keys) {
    const m = parseMember(k); if (!m) continue;
    if (memberAway(st, k)) continue; // (out on another trip already)
    let rig = null, name = '';
    if (m.type === 'hero') {
      if (m.id === st.activeHero || !CLASSES[m.id]) continue; // (you're playing them: you are the crew)
      try { rig = Player.buildRig(undefined, m.id); name = CLASSES[m.id].name; } catch (e) { console.warn('[crewParty] hero rig', m.id, e); }
    } else {
      const h = st.cozy?.guild?.hires?.find?.(x => x.id === m.id); if (!h) continue;
      try { rig = buildHumanoid(hireSpec(h)); name = h.name; } catch (e) { console.warn('[crewParty] hire rig', m.id, e); }
    }
    if (rig) list.push({ rig, key: k, name });
  }
  if (!list.length) return null;
  const n = list.length, look = { x: f.x - fx * 2.6, z: f.z - fz * 2.6 }; // (they look between you and the camera)
  const members = list.map((c, i) => {
    const side = i % 2 ? -1 : 1, rank = Math.floor(i / 2);
    let spot = null;
    const cands = [[1.6 + rank * 1.15, 0.7 + rank * 0.35], [1.25 + rank * 1.1, 1.3 + rank * 0.3], [2.1 + rank, 0.2], [1.6 + rank, -0.4], [1.3 + rank, 2.0], [2.6 + rank, 0.9], [1.0 + rank, -1.2]].map(([s, b]) => ({ x: f.x + rx * s * side - fx * b, z: f.z + rz * s * side - fz * b, side })).filter(c => open(c.x, c.z));
    spot = cands.find(c => seen(c.x, c.z)) || cands[0] || null; // (in plain sight first, else anywhere open)
    spot ||= { x: f.x + rx * 1.6 * side - fx * 0.7, z: f.z + rz * 1.6 * side - fz * 0.7, side };
    const a = new Actor(W, c.rig, { radius: 0.28, speed: 2.2, name: c.name });
    a.setPos(spot.x, spot.z); a.facing = a.faceTarget = Math.atan2(look.x - spot.x, look.z - spot.z); a.height = c.rig.height || 1.1;
    a.rig.root.traverse(o => { if (o.isMesh) o.castShadow = true; });
    a.update(0);
    return { actor: a, key: c.key, name: c.name, spot, cheerT: 1 + rand(0, 1.2), gone: false };
  });
  const out = {
    members, leaving: false,
    /** every frame while the scene plays: face the hero, cheer now and then; when leaving, walk off across the square */
    update(dt, cheering) {
      const P = G.player;
      for (const m of members) {
        if (m.gone) continue;
        const a = m.actor;
        if (out.leaving) {
          if (a.moveTo(m.away.x, m.away.z, dt, 1, 0.3) || (m.leaveT -= dt) <= 0) { m.gone = true; G.vfx?.poof?.(a.pos.clone().setY(a.pos.y + 0.6), { color: '#f2e6cc', n: 10, size: 0.45 }); a.visible = false; }
        } else {
          if (P) a.faceTo((P.pos.x + look.x) / 2, (P.pos.z + look.z) / 2);
          if (cheering && (m.cheerT -= dt) <= 0) { m.cheerT = rand(1.1, 2); a.anim.play(pick(CHEERS)); if (Math.random() < 0.6) G.vfx?.emote?.(a, pick(['heart', 'note', 'sparkle']), 1.4); }
        }
        a.update(dt);
      }
    },
    /** the crew waves and heads home: off to their own side and away (a puff when they get there) */
    leave() {
      if (out.leaving) return;
      out.leaving = true;
      members.forEach((m, i) => {
        const a = m.actor;
        m.away = { x: m.spot.x + rx * m.spot.side * 7 + fx * 1.5, z: m.spot.z + rz * m.spot.side * 7 + fz * 1.5 };
        m.leaveT = 6 + i * 0.3;
        a.anim.play('wave');
      });
    },
    dispose() { for (const m of members) { try { m.actor.dispose(); } catch (e) { /* the scene teardown frees the rest */ } } members.length = 0; },
  };
  return out;
}
