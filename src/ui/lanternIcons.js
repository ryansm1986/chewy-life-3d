// The Spirit Lantern's modifier icons (ui/lantern.js, the run chip): hand-drawn SVGs in the glyphs.js style (chunky
// shapes, a soft ink outline drawn under the fill), one per ZONE_MODS icon key, on a 32×32 box. modIcon(key) → '<svg…>'.
const INK = '#4a2c2a';
const wrap = inner => `<svg class="gl" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${inner}</svg>`;
const ol = (shapes, fill, w = 4) => `<g fill="${INK}" stroke="${INK}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round">${shapes}</g><g fill="${fill}">${shapes}</g>`;
const line = (d, c = INK, w = 2) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const dot = (x, y, r = 1.4, c = INK) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/>`;
const shine = (x, y, rx = 2.4, ry = 1.4) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" transform="rotate(-35 ${x} ${y})" fill="#fff" opacity=".7"/>`;
const blobFace = (cx, cy, r, fill) => ol(`<circle cx="${cx}" cy="${cy}" r="${r}"/>`, fill) + dot(cx - r * 0.35, cy - r * 0.05, r * 0.14) + dot(cx + r * 0.35, cy - r * 0.05, r * 0.14);

const ICONS = {
  // Swarming: a crowd of little round yokai, three rows deep
  swarm: () => blobFace(9, 20, 6, '#ffb48a') + blobFace(23, 20, 6, '#ffb48a') + blobFace(16, 13, 7, '#ff9a5a') + shine(13.5, 9.5),
  // Teeming: a chamber with packs in every corner
  teem: () => ol('<rect x="4" y="5" width="24" height="22" rx="6"/>', '#ffe2a8') + ['9,10', '23,10', '9,22', '23,22', '16,16'].map(p => { const [x, y] = p.split(','); return ol(`<circle cx="${x}" cy="${y}" r="3.2"/>`, '#ffb84a', 3); }).join(''),
  // Rally: a blue war banner on a pole
  rally: () => ol('<rect x="7" y="3" width="3" height="26" rx="1.5"/>', '#a8744a') + ol('<path d="M10 5 H26 L22 11 L26 17 H10 Z"/>', '#6aa8ff') + ol('<circle cx="8.5" cy="4" r="2.4"/>', '#ffd84a', 3) + line('M14 9 H20 M14 13 H19', '#fff', 1.8),
  // Unique Hunt: a golden crown
  crown: () => ol('<path d="M5 24 L4 10 L11 16 L16 7 L21 16 L28 10 L27 24 Z"/><rect x="5" y="23" width="22" height="4" rx="1.6"/>', '#ffc23a') + dot(16, 18, 2.2, '#ff5a7a') + dot(9, 20, 1.5, '#6ac8ff') + dot(23, 20, 1.5, '#6ac8ff') + shine(12, 12),
  // Fierce: a big fang with a red tip
  fang: () => ol('<path d="M8 5 C14 4 22 4 25 6 C23 14 19 22 13 28 C12 20 9 12 8 5 Z"/>', '#fff4ea') + `<path d="M13 28 C14.5 25 16.5 22 18 19 L15 19 C14.2 22 13.6 25 13 28 Z" fill="#ff5a5a"/>` + shine(13, 10),
  // Stout: a round heart with a plus (more life)
  stout: () => ol('<path d="M16 27 C6 20 3 14 5.5 9.5 C8 5 13.5 5.5 16 9.5 C18.5 5.5 24 5 26.5 9.5 C29 14 26 20 16 27 Z"/>', '#e88a6a') + line('M16 12 V20 M12 16 H20', '#fff', 3) + shine(10, 11),
  // Quick: a dashing paw with speed lines
  quick: () => line('M3 11 H11 M2 17 H10 M4 23 H11', '#8fe0c0', 3) + ol('<ellipse cx="20" cy="18" rx="7" ry="6.5"/><circle cx="14.5" cy="9.5" r="2.6"/><circle cx="19.5" cy="7.5" r="2.6"/><circle cx="24.5" cy="9.5" r="2.6"/><circle cx="27.5" cy="14" r="2.4"/>', '#8fe0c0') + shine(18, 15),
  // Elemental: fire, frost, zap
  fire: () => ol('<path d="M16 3 C22 10 26 14 26 20 C26 25.5 21.5 29 16 29 C10.5 29 6 25.5 6 20 C6 15 10 12 11 8 C13 11 13 13 14.5 14 C15.5 10 15 6 16 3 Z"/>', '#ff8a3c') + `<path d="M16 15 C19 18 21 20 21 23 C21 26 18.8 27.5 16 27.5 C13.2 27.5 11 26 11 23 C11 20 13.5 18.5 16 15 Z" fill="#ffd84a"/>`,
  frost: () => ol('<path d="M15 3 h2 v26 h-2 Z"/><path d="M15 3 h2 v26 h-2 Z" transform="rotate(60 16 16)"/><path d="M15 3 h2 v26 h-2 Z" transform="rotate(-60 16 16)"/>', '#8fd0ff', 3.4) + ol('<circle cx="16" cy="16" r="4"/>', '#d8f2ff', 3) + line('M12 6 L16 9 L20 6 M12 26 L16 23 L20 26', '#fff', 1.6),
  zap: () => ol('<path d="M18 3 L7 18 H14 L12 29 L25 12 H17.5 L20 3 Z"/>', '#ffe44a') + shine(15, 10),
  // Warded: a violet shield with a seal circle
  ward: () => ol('<path d="M16 3 L27 7 V15 C27 22 22 26.5 16 29 C10 26.5 5 22 5 15 V7 Z"/>', '#b8a8ff') + `<circle cx="16" cy="15.5" r="5.5" fill="none" stroke="#fff" stroke-width="2"/>` + dot(16, 15.5, 1.8, '#fff'),
  // Haunted: a little sheet ghost
  ghost: () => ol('<path d="M6 27 V14 C6 7.5 10.5 4 16 4 C21.5 4 26 7.5 26 14 V27 L22.5 24.5 L19.5 27.5 L16 24.5 L12.5 27.5 L9.5 24.5 Z"/>', '#eef4ff') + dot(12.5, 14, 2) + dot(19.5, 14, 2) + `<ellipse cx="16" cy="19.5" rx="1.8" ry="2.2" fill="${INK}"/>` + `<path d="M13 6.5 L16 11 L19 6.5 Z" fill="#fff" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>`,
  // Night March: a crescent moon with stars
  night: () => ol('<path d="M20 4 C13 5 8.5 10.5 8.5 17 C8.5 24 14 29 21 29 C24 29 26.5 28 28 26.5 C21.5 26 17 21 17 15 C17 10 18.5 6.5 20 4 Z"/>', '#9a8cf0') + `<path d="M24 8 l1 2.2 l2.3 .3 l-1.7 1.6 l.5 2.3 l-2.1 -1.2 l-2.1 1.2 l.5 -2.3 l-1.7 -1.6 l2.3 -.3 Z" fill="#ffe88a" stroke="${INK}" stroke-width="1"/>` + dot(27, 18, 1.2, '#ffe88a'),
  // Hard Ground: cracked earth with a dimmed heart
  ground: () => ol('<path d="M3 20 C8 18 24 18 29 20 L29 27 H3 Z"/>', '#c89a6a') + line('M9 20 L12 23.5 L10 27 M19 19.5 L17 23 L21 27 M25 20 L24 24', INK, 1.8) + ol('<path d="M16 16 C10 12 9 8.5 10.5 6 C12 3.8 15 4.2 16 6.5 C17 4.2 20 3.8 21.5 6 C23 8.5 22 12 16 16 Z"/>', '#e8b0a0', 3) + line('M14.5 8 L17 10.5', INK, 1.4),
  // Boss's Wrath: an angry red oni mask
  wrath: () => ol('<path d="M7 9 L5 3 L11 7 Z M25 9 L27 3 L21 7 Z"/><circle cx="16" cy="17" r="11"/>', '#ff4a6a') + line('M9.5 13 L14 15.5 M22.5 13 L18 15.5', INK, 2.4) + dot(12.5, 17.5, 1.6) + dot(19.5, 17.5, 1.6) + `<path d="M11 23 Q16 19.5 21 23 Z" fill="${INK}"/>` + `<path d="M12.5 22.6 L13.5 21 L14.5 22.2 Z M19.5 22.6 L18.5 21 L17.5 22.2 Z" fill="#fff"/>`,
  // Treasure Trove: a golden chest
  chest: () => ol('<path d="M4 14 C4 8 8 6 16 6 C24 6 28 8 28 14 Z"/><rect x="4" y="13" width="24" height="14" rx="2.5"/>', '#ffcf4a') + line('M4 14 H28', INK, 2) + ol('<rect x="13.5" y="12" width="5" height="6" rx="1.4"/>', '#fff4c8', 2.6) + line('M10 6.8 V27 M22 6.8 V27', '#c88a2a', 2) + shine(9, 10),
  // Cursed Shrines: a little shrine with a purple curse swirl
  curse: () => ol('<path d="M5 12 L16 5 L27 12 Z"/><rect x="8" y="12" width="16" height="15" rx="1.5"/>', '#c8b8d8') + ol('<rect x="13" y="17" width="6" height="10" rx="1"/>', '#5a4a6a', 2.4) + line('M21 9 C24 9 26 11 25 13.5 C24 15.5 21 15 21 13 C21 11.5 23 11.5 23 12.6', '#9a5aff', 2.2),
};
/** the icon for a modifier's icon key (a plain spirit flame for an unknown one) */
export const modIcon = key => wrap((ICONS[key] || ICONS.fire)());
/** the Spirit Lantern itself, for the panel header and the run chip */
export const lanternIcon = () => wrap(
  ol('<path d="M9 9 L16 4 L23 9 Z"/><rect x="10" y="9" width="12" height="11" rx="1.5"/><rect x="14.5" y="20" width="3" height="5"/><rect x="9" y="25" width="14" height="4" rx="1.5"/>', '#b8b0c8')
  + `<rect x="12.2" y="11.2" width="7.6" height="6.6" rx="1" fill="#c8b8ff"/><ellipse cx="16" cy="14.6" rx="2" ry="2.8" fill="#9fe4ff"/>`);
