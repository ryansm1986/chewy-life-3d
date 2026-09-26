// Decor models (filled in below)
export const BRIDGE = { half: 4.5, end: 0.9, peak: 1.42 };
// Walkable deck height (top surface) of the arched bridge at local z (bridge spans z ∈ [-4.5, 4.5]).
export function bridgeDeckHeight(z) {
  const u = Math.min(1, Math.abs(z) / BRIDGE.half);
  return BRIDGE.end + (BRIDGE.peak - BRIDGE.end) * (1 - u * u);
}
