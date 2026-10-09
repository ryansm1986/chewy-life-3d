// The cozy path's icons (docs/COZY.md §10): hand-drawn SVGs in the glyphs.js style (chunky shapes, a soft ink outline
// drawn under the fill), on a 32×32 box. cozyIcon(key) → '<svg…>'. Used by the Expedition Board (ui/expeditions.js),
// the HUD chip (ui/cozyChip.js), the away card (ui/awayCard.js), and the away badge on the hero wheel and the HUD minis.
const INK = '#4a2c2a';
const wrap = inner => `<svg class="gl" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${inner}</svg>`;
const ol = (shapes, fill, w = 4) => `<g fill="${INK}" stroke="${INK}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round">${shapes}</g><g fill="${fill}">${shapes}</g>`;
const line = (d, c = INK, w = 2) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const dot = (x, y, r = 1.4, c = INK) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/>`;
const shine = (x, y, rx = 2.4, ry = 1.4) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" transform="rotate(-35 ${x} ${y})" fill="#fff" opacity=".7"/>`;
const pawPrint = (x, y, k, c) => `<g fill="${c}"><ellipse cx="${x}" cy="${y + 1.2 * k}" rx="${3.2 * k}" ry="${2.6 * k}"/><circle cx="${x - 3.4 * k}" cy="${y - 2.2 * k}" r="${1.35 * k}"/><circle cx="${x - 1.2 * k}" cy="${y - 3.8 * k}" r="${1.35 * k}"/><circle cx="${x + 1.2 * k}" cy="${y - 3.8 * k}" r="${1.35 * k}"/><circle cx="${x + 3.4 * k}" cy="${y - 2.2 * k}" r="${1.35 * k}"/></g>`;

const ICONS = {
  // a traveller's pack: an indigo bag, its flap and a rolled bedroll
  pack: () => ol('<rect x="6" y="9" width="20" height="19" rx="7"/>', '#5a82cc') + ol('<path d="M7 14 C7 8 25 8 25 14 L25 17 C20 19 12 19 7 17 Z"/>', '#4166ae') + ol('<rect x="5" y="3.5" width="22" height="7" rx="3.5"/>', '#f0d8a8', 3.4) + line('M11 4 V10 M21 4 V10', '#d8503a', 2.2) + ol('<rect x="12.5" y="20" width="7" height="5" rx="2"/>', '#7aa0e0', 2.6) + dot(16, 17.2, 1.3, '#ffd24a') + shine(10, 13),
  // the board: a gabled noticeboard with pinned notes
  board: () => ol('<path d="M3 11 L16 4 L29 11 Z"/>', '#d8503a') + ol('<rect x="6" y="10" width="20" height="15" rx="2"/><rect x="7" y="24" width="3" height="6" rx="1"/><rect x="22" y="24" width="3" height="6" rx="1"/>', '#cf9f6e') + ol('<rect x="8.5" y="12.5" width="6.5" height="7.5" rx="1"/>', '#fffaf0', 2.4) + ol('<rect x="17" y="13.5" width="6.5" height="6" rx="1"/>', '#e2f2ff', 2.4) + dot(11.7, 13.4, 1.2, '#e8503a') + dot(20.2, 14.3, 1.2, '#ffd24a') + line('M10 16.5 H13.5 M10 18.4 H12.6', '#b49a80', 1.2) + line('M18.5 17.8 L20 16.2 L21.6 17.6', '#7a9a5a', 1.3),
  // story: a scroll with a red seal
  story: () => ol('<rect x="7" y="6" width="18" height="21" rx="3"/>', '#fff3d8') + ol('<rect x="5" y="4" width="22" height="5" rx="2.5"/><rect x="5" y="24" width="22" height="5" rx="2.5"/>', '#e8c88a', 3) + line('M11 13 H21 M11 16.5 H21 M11 20 H17', '#b49a80', 1.6) + ol('<circle cx="22" cy="21" r="3.6"/>', '#e8503a', 2.6),
  // the zone villages' quests: a little house with a red roof and a lit window
  village: () => ol('<path d="M4 15 L16 5 L28 15 Z"/>', '#d8503a') + ol('<rect x="7" y="14" width="18" height="14" rx="2"/>', '#f6e2c0') + ol('<rect x="13.5" y="19" width="5" height="9" rx="1.5"/>', '#a8744a', 3) + ol('<rect x="9" y="17" width="3.6" height="3.6" rx="0.8"/><rect x="19.4" y="17" width="3.6" height="3.6" rx="0.8"/>', '#ffd86a', 2.4) + shine(10, 11),
  // errands: a basket with a leaf
  errand: () => line('M9 14 C9 5 23 5 23 14', INK, 5.4) + line('M9 14 C9 5 23 5 23 14', '#c8904a', 2.4) + ol('<path d="M5 14 H27 L24 27 H8 Z"/>', '#e0b070') + line('M9 18 H23 M10 22 H22', '#b07a40', 1.6) + ol('<path d="M18 13 C18 8 23 6 27 7 C26 11 23 14 18 13 Z"/>', '#7ac86a', 2.6),
  // the crews out: a little hourglass
  away: () => ol('<path d="M8 4 H24 V7 C24 12 19 14 18 16 C19 18 24 20 24 25 V28 H8 V25 C8 20 13 18 14 16 C13 14 8 12 8 7 Z"/>', '#fff3d8') + ol('<rect x="6" y="3" width="20" height="3.4" rx="1.6"/><rect x="6" y="26" width="20" height="3.4" rx="1.6"/>', '#a8744a', 2.6) + `<path d="M11 9 H21 C20 12 17 13 16 15 C15 13 12 12 11 9 Z M10.5 25.5 C11 22 14 21 16 19 C18 21 21 22 21.5 25.5 Z" fill="#ffd24a"/>`,
  // reports: a letter with a paw stamp
  report: () => ol('<rect x="4" y="8" width="24" height="17" rx="3"/>', '#fffaf0') + line('M5 10 L16 18 L27 10', INK, 2) + pawPrint(22, 20.5, 0.7, '#e8889a'),
  // the odds dots and the power
  power: () => ol('<path d="M16 3 L19.5 11.5 L28.5 12 L21.5 18 L24 27 L16 22 L8 27 L10.5 18 L3.5 12 L12.5 11.5 Z"/>', '#ffd24a') + shine(13, 10),
  clock: () => ol('<circle cx="16" cy="16" r="12"/>', '#fff8ea') + line('M16 9 V16 L21 19', INK, 2.6) + dot(16, 16, 1.6) + shine(11, 10),
  lunch: () => ol('<path d="M5 15 H27 C27 23 22 27 16 27 C10 27 5 23 5 15 Z"/>', '#e8a070') + ol('<ellipse cx="16" cy="14.5" rx="11" ry="3.5"/>', '#fff3e0', 3) + ol('<path d="M11 13 C11 9.5 14 8 16 8 C18 8 21 9.5 21 13 Z"/>', '#fffaf0', 2.6) + `<rect x="13.5" y="10" width="5" height="3" rx="1" fill="#2a3a2a"/>`,
  heart: () => ol('<path d="M16 27 C6 20 3 14 5.5 9.5 C8 5 13.5 5.5 16 9.5 C18.5 5.5 24 5 26.5 9.5 C29 14 26 20 16 27 Z"/>', '#ff7a8a') + shine(10, 11),
  check: () => ol('<circle cx="16" cy="16" r="12"/>', '#7ad08a') + line('M10 16.5 L14.5 21 L22.5 11.5', '#fff', 3.4),
  cross: () => ol('<circle cx="16" cy="16" r="12"/>', '#f0a090') + line('M11 11 L21 21 M21 11 L11 21', '#fff', 3.4),
  crew: () => pawPrint(11, 17, 1.25, INK) + pawPrint(11, 17, 1.0, '#ffb07a') + pawPrint(22, 13, 1.05, INK) + pawPrint(22, 13, 0.82, '#8fd0ff'),
  seal: () => ol('<circle cx="16" cy="16" r="12"/>', '#e8503a') + `<circle cx="16" cy="16" r="8.5" fill="none" stroke="#fff" stroke-width="1.6" opacity=".8"/>` + pawPrint(16, 17, 0.85, '#fff'),
};
export const cozyIcon = key => wrap((ICONS[key] || ICONS.pack)());
export const COZY_ICON_KEYS = Object.keys(ICONS);
