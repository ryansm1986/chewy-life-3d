// Cute SVG bust portraits for the HUD, paper doll and dialogue. portrait('chewy'|'shadow'|'rosie') → '<svg…>'.
const INK = '#4a2c2a';
const S = `stroke="${INK}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"`;
const mirror = d => d.replace(/(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g, (m, x, y) => `${(120 - +x).toFixed(1)} ${y}`);

function eye(cx, cy, iris = '#e8962a', r = 8) {
  return `<ellipse cx="${cx}" cy="${cy}" rx="${r}" ry="${r * 1.08}" fill="#2a1408" ${S}/>`
    + `<circle cx="${cx}" cy="${cy + 1}" r="${r * 0.72}" fill="${iris}"/>`
    + `<circle cx="${cx}" cy="${cy + 1.5}" r="${r * 0.42}" fill="#2a1408"/>`
    + `<circle cx="${cx - r * 0.32}" cy="${cy - r * 0.35}" r="${r * 0.3}" fill="#fff"/>`
    + `<circle cx="${cx + r * 0.35}" cy="${cy + r * 0.4}" r="${r * 0.14}" fill="#fff"/>`;
}

const earL = 'M34 38 C31 22 20 17 13 25 C8.5 31 10 43 17 48 C23 47 28 43 34 38 Z';
const earShadowL = 'M33 46 C26 32 20 18 20 6 C33 9 45 21 49 35 Z';

export const PORTRAITS = {
  chewy: () => `
  <svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" class="portrait">
    <path d="M14 122 C16 102 36 93 60 93 C84 93 104 102 106 122 Z" fill="#2c3a6a" ${S}/>
    <path d="M47 94 L60 116 L73 94 Z" fill="#fff8f0"/>
    <path d="M44 94 L60 118 M76 94 L60 118" stroke="#e9e2f5" stroke-width="5" stroke-linecap="round"/>
    <path d="M44 94 L60 118 M76 94 L60 118" stroke="${INK}" stroke-width="1.6" stroke-linecap="round" opacity=".5"/>
    <path d="M36 88 C48 98 72 98 84 88 L87 96 C72 108 48 108 33 96 Z" fill="#d8403a" ${S}/>
    <path d="M78 99 C84 104 88 110 86 118 L78 115 C79 110 76 105 73 102 Z" fill="#d8403a" ${S}/>
    <path d="${earL}" fill="#6b3620" ${S}/>
    <path d="${mirror(earL)}" fill="#6b3620" ${S}/>
    <path d="M60 22 C83 22 96 38 96 58 C96 80 80 91 60 91 C40 91 24 80 24 58 C24 38 37 22 60 22 Z" fill="#8a4a2c" ${S}/>
    <path d="M30 44 C34 32 44 26 54 25" fill="none" stroke="#a8603a" stroke-width="4" stroke-linecap="round" opacity=".6"/>
    <ellipse cx="60" cy="74" rx="19" ry="13.5" fill="#e3b287"/>
    <ellipse cx="45.5" cy="45" rx="4" ry="2.4" fill="#c98f5e"/>
    <ellipse cx="74.5" cy="45" rx="4" ry="2.4" fill="#c98f5e"/>
    ${eye(44, 57)}${eye(76, 57)}
    <ellipse cx="35" cy="70" rx="6" ry="3.6" fill="#ff8fb0" opacity=".55"/>
    <ellipse cx="85" cy="70" rx="6" ry="3.6" fill="#ff8fb0" opacity=".55"/>
    <path d="M52 65 Q60 60.5 68 65 Q65 71.5 60 71.5 Q55 71.5 52 65 Z" fill="#2a1a14" ${S}/>
    <ellipse cx="57" cy="64.5" rx="2.6" ry="1.4" fill="#fff" opacity=".7"/>
    <path d="M60 72 V75.5 M51.5 75 Q55.5 80 60 75.5 Q64.5 80 68.5 75" fill="none" ${S}/>
    <path d="M56.5 78.5 Q60 85 63.5 78.5 Z" fill="#ff7a96" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>
  </svg>`,

  shadow: () => `
  <svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" class="portrait">
    <path d="M18 122 C20 104 38 95 60 95 C82 95 100 104 102 122 Z" fill="#1e1c24" ${S}/>
    <path d="M44 100 C50 108 70 108 76 100 L72 122 H48 Z" fill="#fff"/>
    <path d="${earShadowL}" fill="#1e1c24" ${S}/>
    <path d="${mirror(earShadowL)}" fill="#1e1c24" ${S}/>
    <path d="M32 40 C27 30 24 20 24 12 C33 15 40 24 43 33 Z" fill="#ff9ab8" opacity=".8"/>
    <path d="${mirror('M32 40 C27 30 24 20 24 12 C33 15 40 24 43 33 Z')}" fill="#ff9ab8" opacity=".8"/>
    <path d="M60 30 C82 30 94 44 94 62 C94 82 80 94 60 94 C40 94 26 82 26 62 C26 44 38 30 60 30 Z" fill="#1e1c24" ${S}/>
    <path d="M56 30 C57 42 54 52 49 64 L71 64 C66 52 63 42 64 30 Z" fill="#fff"/>
    <ellipse cx="60" cy="77" rx="19" ry="13" fill="#fff"/>
    ${eye(43, 60, '#5a4038', 9)}${eye(77, 60, '#5a4038', 9)}
    <path d="M52 69 Q60 64.5 68 69 Q65 75 60 75 Q55 75 52 69 Z" fill="#1e1c24" ${S}/>
    <ellipse cx="57" cy="68.5" rx="2.4" ry="1.3" fill="#fff" opacity=".6"/>
    <path d="M60 75.5 V79 M52 78.5 Q56 83 60 79 Q64 83 68 78.5" fill="none" ${S}/>
    <ellipse cx="37" cy="74" rx="5" ry="3" fill="#ff8fb0" opacity=".45"/>
    <ellipse cx="83" cy="74" rx="5" ry="3" fill="#ff8fb0" opacity=".45"/>
    <path d="M34 92 Q60 104 86 92 L86 100 Q60 112 34 100 Z" fill="#4f95f0" ${S}/>
    <circle cx="60" cy="106" r="5.5" fill="#ffcf4a" ${S}/>
  </svg>`,

  rosie: () => `
  <svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" class="portrait">
    <g fill="#7a4228" ${S}>
      <circle cx="28" cy="52" r="13"/><circle cx="92" cy="52" r="13"/><circle cx="25" cy="72" r="12"/><circle cx="95" cy="72" r="12"/>
      <circle cx="32" cy="88" r="11"/><circle cx="88" cy="88" r="11"/><circle cx="36" cy="34" r="14"/><circle cx="84" cy="34" r="14"/><circle cx="60" cy="26" r="17"/>
    </g>
    <path d="M22 122 C24 104 40 97 60 97 C80 97 96 104 98 122 Z" fill="#ff9ab8" ${S}/>
    <path d="M44 98 Q52 108 60 100 Q68 108 76 98" fill="#fff" ${S}/>
    <circle cx="60" cy="64" r="29" fill="#ffe3d0" ${S}/>
    <g fill="#8a4a2c" stroke="${INK}" stroke-width="2.2">
      <circle cx="44" cy="40" r="9"/><circle cx="56" cy="37" r="9"/><circle cx="68" cy="37" r="9"/><circle cx="78" cy="42" r="8"/><circle cx="36" cy="49" r="7"/><circle cx="85" cy="50" r="6.5"/>
    </g>
    <g fill="#8a4a2c"><circle cx="44" cy="42" r="7.4"/><circle cx="56" cy="39" r="7.4"/><circle cx="68" cy="39" r="7.4"/><circle cx="78" cy="44" r="6.4"/></g>
    ${eye(48, 64, '#7a4a2a', 6.2)}${eye(72, 64, '#7a4a2a', 6.2)}
    <ellipse cx="40" cy="75" rx="6" ry="3.6" fill="#ff7fa0" opacity=".6"/>
    <ellipse cx="80" cy="75" rx="6" ry="3.6" fill="#ff7fa0" opacity=".6"/>
    <path d="M53 77 Q60 84 67 77" fill="#ff8fa0" ${S}/>
    <path d="M60 26 L42 16 Q38 26 44 34 Z" fill="#e8384a" ${S}/>
    <path d="M60 26 L78 16 Q82 26 76 34 Z" fill="#e8384a" ${S}/>
    <circle cx="60" cy="27" r="6" fill="#ff5a6a" ${S}/>
  </svg>`,
};

export const portrait = name => (PORTRAITS[name] ? PORTRAITS[name]() : '');

// Accepts: 'chewy' | image URL | {emoji, bg} | {svg} → inner HTML for a round portrait frame
export function portraitHTML(p) {
  if (!p) return portrait('chewy');
  if (typeof p === 'string') {
    if (PORTRAITS[p]) return portrait(p);
    if (/^(data:|https?:|\/|\.)/.test(p) || /\.(png|jpe?g|webp|svg|gif)$/i.test(p)) return `<img src="${p}" alt="" draggable="false">`;
    return `<span class="emo">${p}</span>`;
  }
  if (p.svg) return p.svg;
  if (p.name && PORTRAITS[p.name]) return portrait(p.name);
  if (p.url || p.src) return `<img src="${p.url || p.src}" alt="" draggable="false">`;
  if (p.emoji) return `<span class="emo">${p.emoji}</span>`;
  return portrait('chewy');
}
export const portraitBg = p => (p && typeof p === 'object' && p.bg) || null;
