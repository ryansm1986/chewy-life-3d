// Hand-drawn style SVG glyphs (chunky shapes, soft ink outline). glyph(name) → '<svg…>' string.
// Outlines use the "stroke layer under fill layer" trick so overlapping shapes read as one silhouette.
const INK = '#4a2c2a';

const wrap = (inner, vb = '0 0 32 32') => `<svg class="gl" viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${inner}</svg>`;
// outline union: shapes drawn thick in ink, then filled on top
const ol = (shapes, fill, w = 4.2) => `<g fill="${INK}" stroke="${INK}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round">${shapes}</g><g fill="${fill}">${shapes}</g>`;
const st = (d, fill, w = 2.2) => `<path d="${d}" fill="${fill}" stroke="${INK}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"/>`;
const line = (d, c = INK, w = 2) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const shine = (x, y, rx = 2.6, ry = 1.6, rot = -35) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" transform="rotate(${rot} ${x} ${y})" fill="#fff" opacity=".75"/>`;

function petals(n, cx, cy, d, rot = 0) {
  let s = '';
  for (let i = 0; i < n; i++) s += `<path d="${d}" transform="rotate(${rot + (i * 360) / n} ${cx} ${cy})"/>`;
  return s;
}
const SAKURA_PETAL = 'M16 16 C10.5 12 10.5 6 13.6 4.2 L16 6.4 L18.4 4.2 C21.5 6 21.5 12 16 16Z';

function gearPath(cx, cy, r1, r2, n) {
  let d = '';
  for (let i = 0; i < n * 2; i++) {
    const a0 = (i / (n * 2)) * Math.PI * 2, a1 = ((i + 1) / (n * 2)) * Math.PI * 2;
    const r = i % 2 ? r1 : r2;
    const p = (a, rr) => `${(cx + Math.cos(a) * rr).toFixed(2)} ${(cy + Math.sin(a) * rr).toFixed(2)}`;
    d += (i === 0 ? 'M' : 'L') + p(a0 + 0.08, r) + ' L' + p(a1 - 0.08, r) + ' ';
  }
  return d + 'Z';
}

const bottle = (liquid, deco) => ol('<rect x="12.5" y="4" width="7" height="8" rx="2"/><circle cx="16" cy="19.5" r="9.5"/>', '#fdfaff')
  + `<path d="M7.17 16A9.5 9.5 0 1 0 24.83 16Q16 13.6 7.17 16Z" fill="${liquid}"/>`
  + `<path d="M7.6 16.4Q16 14 24.4 16.4" fill="none" stroke="#fff" stroke-width="1.4" opacity=".7"/>`
  + st('M12 3.2h8v3.6h-8z', '#c98f5e', 1.8) + deco + shine(11.5, 15.5, 2.4, 1.4);

export const GLYPHS = {
  coin: ol('<circle cx="16" cy="16" r="11.5"/>', '#ffcf4a') + '<circle cx="16" cy="16" r="7.6" fill="none" stroke="#e39a1c" stroke-width="2"/>'
    + '<path d="M16 11.3l1.4 3.3 3.3 1.4-3.3 1.4-1.4 3.3-1.4-3.3-3.3-1.4 3.3-1.4z" fill="#fff3b8"/>' + shine(11, 10.5),
  heart: st('M16 27C6.5 20.5 3.5 14.5 6.2 9.4 8.8 4.9 13.8 5.6 16 9.7 18.2 5.6 23.2 4.9 25.8 9.4 28.5 14.5 25.5 20.5 16 27Z', '#ff7fa6') + shine(10.5, 11),
  potionHeart: bottle('#ff6f98', '<path d="M16 25c-3.6-2.4-4.8-4.5-3.8-6.3 0.9-1.5 2.8-1.3 3.8 0.2 1-1.5 2.9-1.7 3.8-0.2 1 1.8-0.2 3.9-3.8 6.3z" fill="#fff" opacity=".9"/>'),
  potionZoom: bottle('#4fa8ff', '<path d="M17.2 17.5l-4 5h3l-1.2 4.2 4.4-5.6h-3l1.4-3.6z" fill="#fff" opacity=".95"/>'),
  potionRejuv: bottle('#b77cff', '<path d="M16 19.4l1 2.2 2.3.3-1.7 1.6.4 2.3-2-1.1-2 1.1.4-2.3-1.7-1.6 2.3-.3z" fill="#fff" opacity=".95"/>'),
  wood: ol('<rect x="3.5" y="11" width="22" height="11" rx="5.5" transform="rotate(-18 16 16)"/>', '#c98f5e')
    + '<ellipse cx="24.6" cy="12.8" rx="4.3" ry="5.4" transform="rotate(-18 24.6 12.8)" fill="#f0c592" stroke="#4a2c2a" stroke-width="2"/>'
    + '<ellipse cx="24.6" cy="12.8" rx="1.6" ry="2.2" transform="rotate(-18 24.6 12.8)" fill="none" stroke="#b4744a" stroke-width="1.3"/>'
    + line('M7 20.5l9-3M9 23l6-2', '#8f5a38', 1.4),
  stone: st('M5.5 22C4 16 8.2 9.4 14.8 8.4 21.6 7.4 27.6 11.8 27 18.8 26.4 24.8 19.6 26.8 13.2 26.3 9 26 6.5 25.2 5.5 22Z', '#c7bfd2') + '<path d="M9 21c1-3 3.5-5 7-5.5" fill="none" stroke="#fff" stroke-width="1.8" opacity=".7" stroke-linecap="round"/><circle cx="21" cy="19" r="1.6" fill="#a89cb8"/>',
  petal: st('M16 28C8 23 6.5 14.5 9.5 8.5 11.5 5 14 4.5 16 7.2 18 4.5 20.5 5 22.5 8.5 25.5 14.5 24 23 16 28Z', '#ffbcd6') + line('M16 25V12', '#f08fb2', 1.6) + shine(11.5, 11),
  crystal: st('M16 3L25.5 12 16 29.5 6.5 12Z', '#a7dcff') + '<path d="M6.5 12h19M11.5 12L16 3l4.5 9L16 29.5z" fill="none" stroke="#4a2c2a" stroke-width="1.4" stroke-linejoin="round" opacity=".55"/><path d="M8.5 12.5L16 28V12.5z" fill="#fff" opacity=".35"/>',
  bone: `<g transform="rotate(-35 16 16)">${ol('<rect x="8" y="13" width="16" height="6" rx="3"/><circle cx="7.6" cy="12.8" r="3.6"/><circle cx="7.6" cy="19.2" r="3.6"/><circle cx="24.4" cy="12.8" r="3.6"/><circle cx="24.4" cy="19.2" r="3.6"/>', '#fff4de')}</g>`,
  mochi: st('M4.5 22.5C4.5 14.5 9.5 9 16 9S27.5 14.5 27.5 22.5C27.5 25.6 23 26.8 16 26.8S4.5 25.6 4.5 22.5Z', '#fffdf7') + '<circle cx="12.5" cy="18.5" r="1.5" fill="#4a2c2a"/><circle cx="19.5" cy="18.5" r="1.5" fill="#4a2c2a"/><ellipse cx="10" cy="21.5" rx="2" ry="1.2" fill="#ffadc6"/><ellipse cx="22" cy="21.5" rx="2" ry="1.2" fill="#ffadc6"/><path d="M15 20.5q1 1 2 0" fill="none" stroke="#4a2c2a" stroke-width="1.3" stroke-linecap="round"/>',
  silk: ol('<rect x="7" y="5" width="18" height="4" rx="2"/><rect x="7" y="23" width="18" height="4" rx="2"/><rect x="9.5" y="8" width="13" height="16" rx="3"/>', '#e9d6ff') + line('M10 12h12M10 15.5h12M10 19h12', '#b38ee8', 1.5) + '<path d="M7 5h18v4H7zM7 23h18v4H7z" fill="#c98f5e" stroke="#4a2c2a" stroke-width="2" stroke-linejoin="round"/>',
  lantern: ol('<ellipse cx="16" cy="17" rx="10" ry="10"/><rect x="11" y="4.5" width="10" height="4" rx="1.5"/><rect x="11" y="25.5" width="10" height="3.5" rx="1.5"/>', '#ff6a4e') + line('M7 13.5h18M6.2 17h19.6M7 20.5h18', '#c93a2a', 1.3) + '<rect x="11" y="4.5" width="10" height="4" rx="1.5" fill="#3a2a2a"/><rect x="11" y="25.5" width="10" height="3.5" rx="1.5" fill="#3a2a2a"/>' + '<ellipse cx="16" cy="17" rx="4.5" ry="7" fill="#ffd27a" opacity=".45"/>',
  bag: ol('<rect x="6" y="9" width="20" height="18.5" rx="6"/><path d="M11 10c0-6 10-6 10 0" fill="none"/>', '#ff9ab8') + line('M11 10c0-5.5 10-5.5 10 0', INK, 2.4) + st('M6.5 14.5c3 2.5 16 2.5 19 0v-1c0-2.5-2-4.3-4.5-4.3h-10C8.5 9.2 6.5 11 6.5 13.5z', '#ffc4d6', 2) + st('M14 16.5h4v4h-4z', '#ffcf4a', 1.8) + shine(10.5, 20),
  paw: '<g fill="currentColor"><ellipse cx="16" cy="21.5" rx="6.8" ry="5.6"/><circle cx="8.4" cy="14" r="3"/><circle cx="12.9" cy="9.3" r="3.2"/><circle cx="19.1" cy="9.3" r="3.2"/><circle cx="23.6" cy="14" r="3"/></g>',
  star: st('M16 3.5l3.7 7.6 8.3 1.2-6 5.9 1.4 8.3L16 22.6l-7.4 3.9 1.4-8.3-6-5.9 8.3-1.2z', '#ffcf4a') + shine(12.5, 11, 2.2, 1.3),
  sparkle: '<path d="M16 2c1.2 7.6 6.4 12.8 14 14-7.6 1.2-12.8 6.4-14 14-1.2-7.6-6.4-12.8-14-14 7.6-1.2 12.8-6.4 14-14z" fill="currentColor"/>',
  scroll: st('M8 7h14a3 3 0 0 1 3 3v15H11a3 3 0 0 1-3-3z', '#fff3d6') + st('M5 7.5a3 3 0 0 1 6 0V22', 'none', 2.2) + st('M22 25a3 3 0 0 0 6 0v-2h-6z', '#e8c89a', 2) + line('M13.5 12h8M13.5 15.5h8M13.5 19h5', '#c9a070', 1.6),
  book: st('M5 7c4-2 8-2 11 1v19c-3-3-7-3-11-1z', '#ffc4d6') + st('M27 7c-4-2-8-2-11 1v19c3-3 7-3 11-1z', '#ffe0ea') + line('M8 11c2-.8 4-.8 5.5.3M8 15c2-.8 4-.8 5.5.3M19 11.3c1.5-1.1 3.5-1.1 5.5-.3', '#e58aa8', 1.4),
  map: st('M4 8l7-3 10 3 7-3v19l-7 3-10-3-7 3z', '#bfe9d2') + line('M11 5v19M21 8v19', INK, 1.8) + '<path d="M6.5 18c3-3 6 1 9-2s5-4 9-1" fill="none" stroke="#ff8fb0" stroke-width="1.8" stroke-dasharray="2 2" stroke-linecap="round"/><path d="M23 10.5l2 2m0-2l-2 2" stroke="#e8503a" stroke-width="2" stroke-linecap="round"/>',
  gear: `<path d="${gearPath(16, 16, 12.5, 9.8, 8)}" fill="#c3b3ff" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/><circle cx="16" cy="16" r="4.2" fill="#fff6e8" stroke="${INK}" stroke-width="2"/>`,
  hammer: `<g transform="rotate(35 16 16)">${ol('<rect x="14" y="11" width="4.6" height="18" rx="2.2"/>', '#c98f5e')}${ol('<rect x="6.5" y="4.5" width="19" height="8" rx="3"/>', '#a8b4d8')}<rect x="8.5" y="6.2" width="6" height="2" rx="1" fill="#fff" opacity=".6"/></g>`,
  sakura: `<g fill="#ffbcd6" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round">${petals(5, 16, 16, SAKURA_PETAL)}</g><circle cx="16" cy="16" r="2.8" fill="#ffcf4a" stroke="${INK}" stroke-width="1.5"/>`,
  sakuraFlat: `<g fill="currentColor">${petals(5, 16, 16, SAKURA_PETAL)}</g><circle cx="16" cy="16" r="2.4" fill="#fff" opacity=".8"/>`,
  sword: `<g transform="rotate(45 16 16)">${ol('<rect x="13.2" y="2" width="5.6" height="18" rx="2.8"/><circle cx="13.6" cy="3.2" r="2.4"/><circle cx="18.4" cy="3.2" r="2.4"/>', '#fff4de')}${ol('<rect x="8" y="19.5" width="16" height="3.6" rx="1.8"/>', '#e8503a')}${ol('<rect x="14.2" y="22.5" width="3.6" height="7.5" rx="1.6"/>', '#6b4a3a')}</g>`,
  ball: ol('<circle cx="16" cy="16" r="11.5"/>', '#f2553f') + '<path d="M6.2 10.5c5.5 2 5.5 9 0 11M25.8 10.5c-5.5 2-5.5 9 0 11" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>' + shine(11, 9.8),
  hat: ol('<ellipse cx="16" cy="23" rx="13" ry="4"/><path d="M8 23c0-9 3.5-14 8-14s8 5 8 14z"/>', '#ffd27a') + '<path d="M8.5 20.2c4 1.4 11 1.4 15 0" fill="none" stroke="#e8503a" stroke-width="3" stroke-linecap="round"/><circle cx="16" cy="8" r="2.5" fill="#ff8fb0" stroke="#4a2c2a" stroke-width="1.8"/>',
  outfit: st('M11 4.5L16 9l5-4.5 7 4-2.8 6.5-2.7-1.2V28H9.5V13.8l-2.7 1.2L4 8.5z', '#4d5f9e') + st('M11 4.5L16 9l5-4.5-5 12z', '#fff6e8', 1.8) + '<rect x="9.5" y="17.5" width="13" height="3.2" fill="#e8503a" stroke="#4a2c2a" stroke-width="1.6"/>',
  collar: `<ellipse cx="16" cy="13" rx="11" ry="6.5" fill="none" stroke="${INK}" stroke-width="7"/><ellipse cx="16" cy="13" rx="11" ry="6.5" fill="none" stroke="#5aa8ff" stroke-width="3.6"/>` + ol('<circle cx="16" cy="22.5" r="5"/>', '#ffcf4a') + '<path d="M13.5 23.5h5" stroke="#4a2c2a" stroke-width="1.5" stroke-linecap="round"/><circle cx="16" cy="25" r="1" fill="#4a2c2a"/>',
  charm: ol('<rect x="8.5" y="8.5" width="15" height="20" rx="4"/>', '#ff8fb0') + '<rect x="11" y="13" width="10" height="11" rx="2" fill="#fff6e8" stroke="#4a2c2a" stroke-width="1.4"/><path d="M13.5 16h5M13.5 18.5h5M13.5 21h3" stroke="#e8503a" stroke-width="1.3" stroke-linecap="round"/>' + st('M16 8.5c-3-3-6-3-5.2-.8.6 1.3 3 1.3 5.2.8 2.2.5 4.6.5 5.2-.8.8-2.2-2.2-2.2-5.2.8z', '#ffcf4a', 1.6),
  boots: ol('<path d="M9 4.5h9v13l7.5 3.5c1.8.9 2.5 2.5 2.5 4.2V27H7.5V20z"/>', '#c98f5e') + '<rect x="8.5" y="4.5" width="10" height="4.5" rx="1.5" fill="#fff6e8" stroke="#4a2c2a" stroke-width="1.8"/>' + line('M7.8 23.8h20', INK, 1.8),
  paws: ol('<path d="M8 28V14c0-5.5 3.6-9 8-9s8 3.5 8 9v14z"/>', '#fff0e0') + '<g fill="#ffadc6"><ellipse cx="16" cy="17" rx="3.6" ry="3"/><circle cx="11.6" cy="12" r="1.6"/><circle cx="14.4" cy="9.8" r="1.6"/><circle cx="17.6" cy="9.8" r="1.6"/><circle cx="20.4" cy="12" r="1.6"/></g>' + line('M8 23.5h16', INK, 1.8),
  x: '<path d="M9 9l14 14M23 9L9 23" stroke="currentColor" stroke-width="4.4" stroke-linecap="round"/>',
  plus: '<path d="M16 7v18M7 16h18" stroke="currentColor" stroke-width="4.6" stroke-linecap="round"/>',
  check: '<path d="M7 16.5l6 6L25.5 9" fill="none" stroke="currentColor" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round"/>',
  lock: st('M10.5 14v-3.5a5.5 5.5 0 0 1 11 0V14', 'none', 3) + st('M7 14h18v13H7z', '#ffcf4a') + '<circle cx="16" cy="19.5" r="1.9" fill="#4a2c2a"/><path d="M16 20v3.5" stroke="#4a2c2a" stroke-width="2" stroke-linecap="round"/>',
  sun: `<g stroke="${INK}" stroke-width="2" fill="#ffcf4a" stroke-linejoin="round">${petals(8, 16, 16, 'M16 1.8l2.4 5h-4.8z')}</g>` + ol('<circle cx="16" cy="16" r="8.2"/>', '#ffdf6a') + '<circle cx="13.4" cy="15.5" r="1.1" fill="#4a2c2a"/><circle cx="18.6" cy="15.5" r="1.1" fill="#4a2c2a"/><path d="M14.3 18.2q1.7 1.5 3.4 0" fill="none" stroke="#4a2c2a" stroke-width="1.3" stroke-linecap="round"/><ellipse cx="11.6" cy="18" rx="1.4" ry=".9" fill="#ff9ab8"/><ellipse cx="20.4" cy="18" rx="1.4" ry=".9" fill="#ff9ab8"/>',
  moon: st('M20.5 4.5A11.8 11.8 0 1 0 27.5 21 9.6 9.6 0 0 1 20.5 4.5Z', '#fff2b0') + '<circle cx="12" cy="18.5" r="1" fill="#4a2c2a"/><path d="M13.8 21q1.3 1 2.6 0" fill="none" stroke="#4a2c2a" stroke-width="1.2" stroke-linecap="round"/><ellipse cx="10.4" cy="21" rx="1.3" ry=".8" fill="#ffadc6"/>',
  home: st('M4.5 15.5L16 5.5l11.5 10', 'none', 3) + st('M7.5 14v13h17V14L16 6.5z', '#fff3e0') + st('M3.8 15.8L16 5 28.2 15.8', 'none', 2.6) + st('M13 27v-7.5h6V27', '#c98f5e', 2) + st('M5 15.5L16 5.8l11 9.7-2.2 1.5L16 9.6 7.2 17z', '#d86a4a', 2),
  shop: st('M6 14v13h20V14', '#fff3e0') + st('M4 8h24l-1.5 6.5H5.5z', '#ff8fb0') + '<path d="M9.5 8l-.8 6.5M16 8v6.5M22.5 8l.8 6.5" stroke="#4a2c2a" stroke-width="1.6"/><path d="M8.5 8l-.8 6.5h3.4L12 8zM19.8 8l.8 6.5H24L23.4 8z" fill="#fff" opacity=".8"/>' + st('M12.5 27v-7h7v7', '#8fd0ff', 2),
  craft: ol('<path d="M5 15h16c0 3-2.5 5-6 5v3h4v4H9v-4h4v-3c-4 0-8-2-8-5z"/><path d="M21 15h6l-2 3.5h-4z"/>', '#a8b4d8') + '<path d="M7.5 16.5h11" stroke="#fff" stroke-width="1.5" opacity=".7" stroke-linecap="round"/>' + `<g transform="rotate(-30 20 8)">${ol('<rect x="18.5" y="3" width="3" height="10" rx="1.2"/><rect x="15" y="2" width="10" height="4.4" rx="1.6"/>', '#c98f5e', 3.6)}</g>`,
  service: ol('<path d="M6 15h20v10a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3z"/><rect x="4" y="11.5" width="24" height="4.5" rx="2"/>', '#bfd8ff') + '<path d="M9 19c2.5 1.4 11.5 1.4 14 0" stroke="#5aa8ff" stroke-width="2.2" fill="none" stroke-linecap="round"/>' + st('M8.5 11.5V6h15v5.5', 'none', 2.4) + st('M6 6.5h20l-2-3H8z', '#d86a4a', 2),
  decor: ol('<path d="M9.5 19h13l-2 9h-9z"/>', '#d86a4a') + `<g transform="translate(0 -3)"><g fill="#ffbcd6" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round" transform="translate(4 1) scale(.75)">${petals(5, 16, 16, SAKURA_PETAL)}</g><circle cx="16" cy="13" r="2" fill="#ffcf4a"/></g>` + line('M16 16v3', '#5ea85a', 2.2),
  special: st('M7 9.5v19M25 9.5v19', 'none', 3.4) + '<path d="M7 9.5v19M25 9.5v19" stroke="#e8503a" stroke-width="2" />' + st('M2.5 6.5c8 2 19 2 27 0l-1 3.5c-8 1.8-17 1.8-25 0z', '#e8503a', 2) + st('M5 13.5h22v2.8H5z', '#e8503a', 2) + st('M14.5 10v3.5h3V10z', '#3a2a2a', 1.4),
  shovel: `<g transform="rotate(40 16 16)">${ol('<rect x="14.4" y="2" width="3.2" height="15" rx="1.4"/><rect x="11.5" y="1.5" width="9" height="3" rx="1.5"/>', '#c98f5e', 3.6)}${ol('<path d="M10 16h12v5c0 5-3 8.5-6 9.5-3-1-6-4.5-6-9.5z"/>', '#a8b4d8')}</g>`,
  mouseL: `<rect x="8" y="3.5" width="16" height="25" rx="8" fill="#fff6e8" stroke="${INK}" stroke-width="2.2"/><path d="M8 13.5V11.5a8 8 0 0 1 8-8v10z" fill="#ff8fb0" stroke="${INK}" stroke-width="2"/><path d="M16 3.5v10H8" fill="none" stroke="${INK}" stroke-width="2"/><path d="M16 13.5h8" stroke="${INK}" stroke-width="2"/>`,
  mouseR: `<rect x="8" y="3.5" width="16" height="25" rx="8" fill="#fff6e8" stroke="${INK}" stroke-width="2.2"/><path d="M24 13.5V11.5a8 8 0 0 0-8-8v10z" fill="#ff8fb0" stroke="${INK}" stroke-width="2"/><path d="M16 3.5v10h8" fill="none" stroke="${INK}" stroke-width="2"/><path d="M8 13.5h8" stroke="${INK}" stroke-width="2"/>`,
  oni: ol('<path d="M9 9L6 2.5l6.5 4zM23 9l3-6.5-6.5 4z"/>', '#fff4de', 3.4) + ol('<path d="M5 17c0-7 5-11 11-11s11 4 11 11c0 6.5-4.5 11-11 11S5 23.5 5 17z"/>', '#ff6a5a') + '<path d="M9 14l5 2M23 14l-5 2" stroke="#4a2c2a" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="17.5" r="1.6" fill="#4a2c2a"/><circle cx="20" cy="17.5" r="1.6" fill="#4a2c2a"/><path d="M11 23.5q5 3 10 0" fill="#fff" stroke="#4a2c2a" stroke-width="1.8" stroke-linejoin="round"/><path d="M12.5 23.8l1 1.6 1-1.2M19.5 23.8l-1 1.6-1-1.2" fill="#fff" stroke="#4a2c2a" stroke-width="1"/>',
  skull: ol('<path d="M6 15c0-6 4.5-10.5 10-10.5S26 9 26 15c0 3.5-1.5 6-4 7.5V27h-12v-4.5C7.5 21 6 18.5 6 15z"/>', '#fff4de') + '<circle cx="12" cy="15.5" r="3" fill="#4a2c2a"/><circle cx="20" cy="15.5" r="3" fill="#4a2c2a"/><path d="M16 19.5l-1.6 2.5h3.2z" fill="#4a2c2a"/><path d="M13.5 24v3M16 24v3M18.5 24v3" stroke="#4a2c2a" stroke-width="1.5"/>',
  chest: ol('<rect x="4" y="13" width="24" height="14" rx="3"/><path d="M4 14c0-5 4-8.5 12-8.5s12 3.5 12 8.5z"/>', '#c98f5e') + line('M4 14.2h24M10 6.8V27M22 6.8V27', INK, 1.8) + st('M13.5 12h5v6h-5z', '#ffcf4a', 1.8),
  gift: ol('<rect x="5" y="13" width="22" height="14" rx="2.5"/><rect x="3.5" y="9" width="25" height="5.5" rx="2"/>', '#ff8fb0') + '<path d="M16 9v18" stroke="#ffcf4a" stroke-width="4"/><path d="M16 9v18" stroke="#4a2c2a" stroke-width="1" opacity=".2"/>' + st('M16 9c-3-5-8-5-7-2 .6 1.6 4 2.2 7 2 3 .2 6.4-.4 7-2 1-3-4-3-7 2z', '#ffcf4a', 1.8),
  key: ol('<circle cx="10" cy="11" r="6.5"/><rect x="13" y="9.4" width="15" height="4" rx="1.6"/><rect x="22" y="12" width="3.4" height="5" rx="1"/><rect x="17" y="12" width="3" height="4" rx="1"/>', '#ffcf4a') + '<circle cx="10" cy="11" r="2.4" fill="#4a2c2a"/>',
  gem: st('M8.5 6h15l5 7L16 28 3.5 13z', '#ff8fd0') + '<path d="M3.5 13h25M8.5 6l3.5 7 4 15M23.5 6l-3.5 7-4 15M12 13l4-7 4 7" fill="none" stroke="#4a2c2a" stroke-width="1.3" opacity=".5"/><path d="M5.5 13l2.8-6 3.5 6z" fill="#fff" opacity=".5"/>',
  bolt: st('M18.5 3L7 18h7.5L12 29l13-16h-8z', '#8fd0ff') + '<path d="M16 7l-5.5 8" stroke="#fff" stroke-width="1.6" opacity=".7" stroke-linecap="round"/>',
  leaf: st('M6 26C5 15 12 6 27 5c0 14-8 22-21 21z', '#8fe0a0') + line('M6 26C11 19 16 14 22 10', '#4f9a5a', 1.6),
  chat: st('M5 7h22a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H14l-6 5v-5H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z', '#fff6e8') + '<circle cx="11" cy="15" r="1.7" fill="#ff8fb0"/><circle cx="16" cy="15" r="1.7" fill="#ff8fb0"/><circle cx="21" cy="15" r="1.7" fill="#ff8fb0"/>',
  pin: st('M16 29s-9-8.5-9-15a9 9 0 0 1 18 0c0 6.5-9 15-9 15z', '#ff8fb0') + '<circle cx="16" cy="14" r="3.5" fill="#fff6e8" stroke="#4a2c2a" stroke-width="1.8"/>',
  sort: '<path d="M10 6v20M10 26l-4-4M10 26l4-4M22 26V6M22 6l-4 4M22 6l4 4" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>',
  door: st('M8 28V9a8 8 0 0 1 16 0v19z', '#c98f5e') + st('M11.5 28V11a4.5 4.5 0 0 1 9 0v17z', '#6b4a3a', 1.8) + '<circle cx="18" cy="19" r="1.2" fill="#ffcf4a"/>',
  swap: '<path d="M7 11h16l-4-4M25 21H9l4 4" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>',
  sound: st('M5 12h5l7-6v20l-7-6H5z', '#fff6e8') + '<path d="M21 11c2 2.5 2 7.5 0 10M24.5 8c3.8 4.5 3.8 11.5 0 16" fill="none" stroke="#4a2c2a" stroke-width="2.2" stroke-linecap="round"/>',
  music: st('M12 23V7l14-3v16', 'none', 2.6) + ol('<ellipse cx="9" cy="23.5" rx="4" ry="3.2"/><ellipse cx="23" cy="20.5" rx="4" ry="3.2"/>', '#ff8fb0') + line('M12 11.5l14-3', INK, 2.6),
  eye: st('M3 16c3.5-6 8-9 13-9s9.5 3 13 9c-3.5 6-8 9-13 9S6.5 22 3 16z', '#fff6e8') + '<circle cx="16" cy="16" r="5" fill="#8fd0ff" stroke="#4a2c2a" stroke-width="2"/><circle cx="16" cy="16" r="2" fill="#4a2c2a"/>',
  save: st('M5 5h17l5 5v17H5z', '#8fd0ff') + st('M9.5 5h11v7h-11z', '#fff6e8', 1.8) + st('M9 17h14v10H9z', '#fff6e8', 1.8),
  exit: st('M13 5H6v22h7', 'none', 2.8) + '<path d="M13 16h14M22 11l5 5-5 5" fill="none" stroke="#4a2c2a" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>',
  play: st('M10 6l16 10-16 10z', '#8fe0c0'),
  question: st('M16 29a13 13 0 1 1 0-26 13 13 0 0 1 0 26z', '#c3b3ff') + '<path d="M12.3 12.5a3.8 3.8 0 1 1 5.5 3.4c-1.2.6-1.8 1.4-1.8 2.6v.7" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/><circle cx="16" cy="23" r="1.6" fill="#fff"/>',
  fire: st('M16 29c-6 0-9-4-9-8.5C7 14 13 12 13 5c4 2 6 6 5.5 9.5 1.5-1 2.3-2.6 2.3-4.2C24 12.8 25 17 25 20.5 25 25 22 29 16 29z', '#ff9a3c') + st('M16 28c-2.8 0-4.3-1.8-4.3-4 0-2.8 2.5-4 3.3-6.5 2.2 1.4 5.3 3.8 5.3 6.5 0 2.2-1.5 4-4.3 4z', '#ffdf6a', 1.4),
  frost: '<g stroke="#4a2c2a" stroke-width="5" stroke-linecap="round"><path d="M16 3v26M4.7 9.5l22.6 13M4.7 22.5l22.6-13"/></g><g stroke="#aee0ff" stroke-width="2.6" stroke-linecap="round"><path d="M16 3v26M4.7 9.5l22.6 13M4.7 22.5l22.6-13"/></g>',
  zap: st('M18.5 3L7 18h7.5L12 29l13-16h-8z', '#ffe44a'),
  stink: ol('<circle cx="11" cy="19" r="6"/><circle cx="20" cy="16" r="7"/><circle cx="16" cy="11" r="5"/>', '#b8e07a') + '<path d="M9 7c1-2 3-2 3-4M22 6c1-1.5 2.5-1.5 2.5-3.5" fill="none" stroke="#7ab040" stroke-width="1.8" stroke-linecap="round"/>',
  shield: st('M16 3.5l11 4v7.5c0 7-4.8 11.8-11 13.5C9.8 26.8 5 22 5 15V7.5z', '#8fd0ff') + st('M16 8l6.5 2.4V15c0 4-2.6 7-6.5 8.4z', '#fff6e8', 1.6),
  swords: `<g transform="rotate(45 16 16)">${ol('<rect x="14.2" y="3" width="3.6" height="18" rx="1.8"/><rect x="10" y="19.5" width="12" height="3" rx="1.5"/><rect x="14.5" y="22" width="3" height="6" rx="1.2"/>', '#e6ecff', 3.8)}</g><g transform="rotate(-45 16 16)">${ol('<rect x="14.2" y="3" width="3.6" height="18" rx="1.8"/><rect x="10" y="19.5" width="12" height="3" rx="1.5"/><rect x="14.5" y="22" width="3" height="6" rx="1.2"/>', '#fff4de', 3.8)}</g>`,
  clover: `<g fill="#8fe0a0" stroke="${INK}" stroke-width="1.8">${petals(4, 16, 14, 'M16 14c-5-1-7-6-4-8.5 2-1.5 4 0 4 2 0-2 2-3.5 4-2 3 2.5 1 7.5-4 8.5z', 45)}</g><path d="M16 15c1 5 3 9 6 12" stroke="${INK}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`,
  shadowDog: ol('<path d="M6 5l6 7M26 5l-6 7"/><ellipse cx="16" cy="18" rx="10" ry="9"/>', '#1e1c24', 3.2) + '<path d="M16 9.5c-1.2 3-1.6 6-1.6 9h3.2c0-3-.4-6-1.6-9z" fill="#fff"/><ellipse cx="16" cy="22.5" rx="5" ry="3.6" fill="#fff"/><ellipse cx="16" cy="20.6" rx="1.8" ry="1.2" fill="#1e1c24"/><circle cx="11.4" cy="16.5" r="2.2" fill="#fff"/><circle cx="20.6" cy="16.5" r="2.2" fill="#fff"/><circle cx="11.6" cy="16.7" r="1.3" fill="#1e1c24"/><circle cx="20.4" cy="16.7" r="1.3" fill="#1e1c24"/>',
};

// Material → glyph, name, and Japanese flavour label
export const MATERIALS = {
  wood: { name: 'Wood', jp: '木', g: 'wood' },
  stone: { name: 'Stone', jp: '石', g: 'stone' },
  petal: { name: 'Sakura Petal', jp: '花びら', g: 'petal' },
  crystal: { name: 'Crystal', jp: '水晶', g: 'crystal' },
  bone: { name: 'Bone', jp: '骨', g: 'bone' },
  mochi: { name: 'Mochi', jp: '餅', g: 'mochi' },
  silk: { name: 'Silk', jp: '絹', g: 'silk' },
  lantern: { name: 'Lantern', jp: '提灯', g: 'lantern' },
  coins: { name: 'Coins', jp: '小判', g: 'coin' },
};

export const SLOT_GLYPH = { weapon: 'sword', weaponAlt: 'ball', hat: 'hat', outfit: 'outfit', collar: 'collar', charm: 'charm', charm1: 'charm', charm2: 'charm', boots: 'boots', paws: 'paws' };

export function glyph(name, cls = '') {
  const g = GLYPHS[name] || GLYPHS.sparkle;
  return cls ? wrap(g).replace('class="gl"', `class="gl ${cls}"`) : wrap(g);
}

// data: URL version (for <img> / CSS backgrounds)
const urlCache = new Map();
export function glyphURL(name) {
  if (urlCache.has(name)) return urlCache.get(name);
  const s = wrap(GLYPHS[name] || GLYPHS.sparkle).replace('<svg ', '<svg width="64" height="64" ');
  const u = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
  urlCache.set(name, u);
  return u;
}
