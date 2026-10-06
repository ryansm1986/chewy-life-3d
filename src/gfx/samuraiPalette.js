// Chewy's samurai look (docs/HEROES.md "Chewy the samurai"): the colours his effects and props borrow from his outfit,
// in one place so the outfit can be retinted. The outfit is sheet E, "Black and Gold"
// (tools/blender/work/codex/chewy-samurai-concept/concepts/option-E.png): a black haori with gold paw-print mon and a gold
// collar edge, a charcoal kimono, black hakama, a red cord, a black saya with gold fittings. Change these and the war
// banner, the crests and the swing trails' accent edge all follow. The Bone Katana itself (a gold tsuba, a red-wrapped
// grip: actors/charKit.js katanaGeo) and the bone-white body of the trails (gfx/bladeFx.js) are not outfit colours.
export const SAMURAI = {
  // the haori black: the War Banner Howl nobori's cloth
  banner: '#1e1c22',
  // the banner's top band and side trim: the gold of the collar edge
  bannerTrim: '#e8b84a',
  // the paw-print mon: on the banner, and on the spirit pups' tiny kabuto
  crest: '#e8b84a',
  // the warm gold edge of every katana swing trail (the body of the trail stays bone-white)
  trailEdge: '#e8a640',
  // his cord: the only red, where it reads as the cord (the banner's tie and tassels)
  cord: '#d8402e',
  // the kabuto's lacquer and the banner pole
  lacquer: '#1e1c22',
  gold: '#e8b84a',
};
// the bone-white the blade trails are made of (not an outfit colour)
export const BONE_WHITE = '#fff6e6';
